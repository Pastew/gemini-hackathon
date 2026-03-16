/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GenAILiveClient } from "../lib/genai-live-client";
import { GenAIProxyClient } from "../lib/genai-proxy-client";
import { LiveClientOptions, isProxyMode, ApiKeyClientOptions } from "../types";
import { AudioStreamer } from "../lib/audio-streamer";
import { audioContext } from "../lib/utils";
import { LiveConnectConfig } from "@google/genai";
import { DEFAULT_CONFIG } from "../config";

/** Resolves a static worklet file URL, works in both extension and dev-server contexts. */
function workletUrl(filename: string): string {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(`worklets/${filename}`);
  }
  return `/worklets/${filename}`;
}

/**
 * Union type for both client types
 */
type LiveClient = GenAILiveClient | GenAIProxyClient;

export type UseLiveAPIResults = {
  client: LiveClient;
  setConfig: (config: LiveConnectConfig) => void;
  config: LiveConnectConfig;
  model: string;
  setModel: (model: string) => void;
  connected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  volume: number;
  error: Error | null;
};

/**
 * Custom hook to manage the Live API client (Direct or Proxy).
 * Acts as a factory returning the appropriate client instance based on options.
 * @param options Configuration options specifying either an apiKey or proxyUrl.
 */
export function useLiveAPI(options: LiveClientOptions): UseLiveAPIResults {
  // Factory: choose client based on options type
  const client = useMemo(() => {
    if (isProxyMode(options)) {
      console.log("Using proxy client:", options.proxyUrl);
      return new GenAIProxyClient(options);
    }
    console.log("Using direct API client");
    return new GenAILiveClient(options as ApiKeyClientOptions);
  }, [options]);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);

  const [model, setModel] = useState<string>(process.env.REACT_APP_GEMINI_MODEL_ID || "");
  const [config, setConfig] = useState<LiveConnectConfig>(DEFAULT_CONFIG);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [volume, setVolume] = useState(0);

  // register audio for streaming server -> speakers
  useEffect(() => {
    if (!audioStreamerRef.current) {
      audioContext({ id: "audio-out" }).then((audioCtx: AudioContext) => {
        audioStreamerRef.current = new AudioStreamer(audioCtx);
        audioStreamerRef.current
          .addWorklet("vumeter-out", workletUrl("vumeter-out.js"), (ev: MessageEvent) => {
            setVolume(ev.data.volume);
          })
          .then(() => {
            // Successfully added worklet
          });
      });
    }
  }, [audioStreamerRef]);

  useEffect(() => {
    setError(null); // Clear any previous errors when starting a new connection attempt
    if (!client) return;

    console.log(`[LiveAPI] Attempting connection via ${'proxyUrl' in options ? "Proxy" : "Direct API Key"}...`);

    const onOpen = () => {
      console.log("[LiveAPI] Connection established successfully. Session active.");
      setConnected(true);
      setError(null);
    };

    const onClose = () => {
      console.log("[LiveAPI] Connection closed.");
      setConnected(false);
      // If we closed without a formal error but we weren't expecting to disconnect,
      // it might be a silent failure (e.g. invalid API key rejected after handshake)
      setError((prev) => prev || new Error("Can't connect to Vertex AI. Please use your own Google Studio API key."));
    };

    const onError = (error: any) => {
      console.error("[LiveAPI] Connection ERROR:", error);
      const err = error instanceof Error ? error : new Error(String(error));
      setError(err);
    };

    const stopAudioStreamer = () => audioStreamerRef.current?.stop();

    const onAudio = (data: ArrayBuffer) =>
      audioStreamerRef.current?.addPCM16(new Uint8Array(data));

    client
      .on("error", onError)
      .on("open", onOpen)
      .on("close", onClose)
      .on("interrupted", stopAudioStreamer)
      .on("audio", onAudio);

    return () => {
      client
        .off("error", onError)
        .off("open", onOpen)
        .off("close", onClose)
        .off("interrupted", stopAudioStreamer)
        .off("audio", onAudio)
        .disconnect();
    };
  }, [client, options]);

  const connect = useCallback(async () => {
    if (!config) {
      throw new Error("config has not been set");
    }
    client.disconnect();
    await client.connect(model, config);
  }, [client, config, model]);

  const disconnect = useCallback(async () => {
    client.disconnect();
    setConnected(false);
  }, [setConnected, client]);

  return {
    client,
    config,
    setConfig,
    model,
    setModel,
    connected,
    connect,
    disconnect,
    volume,
    error,
  };
}
