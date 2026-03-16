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

import cn from "classnames";
import { CAPTURE_CONFIG } from "../../config";

import { memo, ReactNode, RefObject, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { LiveServerToolCall } from "@google/genai";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { UseMediaStreamResult } from "../../hooks/use-media-stream-mux";
import { useScreenCapture } from "../../hooks/use-screen-capture";
import { useWebcam } from "../../hooks/use-webcam";
import { AudioRecorder } from "../../lib/audio-recorder";
import AudioPulse from "../audio-pulse/AudioPulse";
import { CHROME_MESSAGES, TOOL_NAMES, UI_EVENTS } from "../../lib/constants";
import { TRANSLATOR_LANG_KEY } from "../settings-dialog/LanguageSelector";
import "./control-tray.scss";
import SettingsDialog from "../settings-dialog/SettingsDialog";

export type ControlTrayProps = {
  videoRef: RefObject<HTMLVideoElement>;
  children?: ReactNode;
  supportsVideo: boolean;
  onVideoStreamChange?: (stream: MediaStream | null) => void;
  enableEditingSettings?: boolean;
};

type MediaStreamButtonProps = {
  isStreaming: boolean;
  icon: string;
  start: () => Promise<any>;
  stop: () => any;
  label?: string;
};

/**
 * button used for triggering webcam or screen-capture
 */
const MediaStreamButton = memo(
  ({ isStreaming, icon, start, stop, label }: MediaStreamButtonProps) =>
    isStreaming ? (
      <button className="grid-button active-stream" onClick={stop}>
        <span className="material-symbols-outlined">{icon}</span>
        {label && <span className="label">{label}</span>}
      </button>
    ) : (
      <button className="grid-button" onClick={start}>
        <span className="material-symbols-outlined">{icon}</span>
        {label && <span className="label">{label}</span>}
      </button>
    )
);

function ControlTray({
  videoRef,
  children,
  onVideoStreamChange = () => { },
  supportsVideo,
  enableEditingSettings,
}: ControlTrayProps) {
  const webcamStream = useWebcam();
  const screenCaptureStream = useScreenCapture();
  const videoStreams: UseMediaStreamResult[] = useMemo(
    () => [webcamStream, screenCaptureStream],
    [webcamStream, screenCaptureStream]
  );
  const [activeVideoStream, setActiveVideoStream] =
    useState<MediaStream | null>(null);
  const [webcam, screenCapture] = videoStreams;
  const [inVolume, setInVolume] = useState(0);
  const [audioRecorder] = useState(() => new AudioRecorder());

  // Persistence Keys
  const STORAGE_KEYS = {
    MIC_MUTED: "mir_mic_muted",
    TRANSLATOR_ACTIVE: "mir_translator_active",
    SMARTLINKS_ACTIVE: "mir_smartlinks_active"
  };

  const [muted, setMuted] = useState(() => localStorage.getItem(STORAGE_KEYS.MIC_MUTED) === "true");
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isTranslatorActive, setIsTranslatorActive] = useState(() => localStorage.getItem(STORAGE_KEYS.TRANSLATOR_ACTIVE) === "true");
  const [isSmartLinksActive, setIsSmartLinksActive] = useState(() => localStorage.getItem(STORAGE_KEYS.SMARTLINKS_ACTIVE) === "true");
  const [gazeTarget, setGazeTarget] = useState<{ x: number, y: number } | null>(null);
  const gazeTimeoutRef = useRef<number | null>(null);

  const { client, connected, connect, disconnect, volume } =
    useLiveAPIContext();

  useEffect(() => {
    if (!connected && connectButtonRef.current) {
      connectButtonRef.current.focus();
    }
  }, [connected]);
  useEffect(() => {
    // Keep the original --volume (px based) for backward compatibility
    document.documentElement.style.setProperty(
      "--volume",
      `${Math.max(5, Math.min(inVolume * 200, 8))}px`
    );
    // Add a normalized, unitless volume from 0 to 1 for our new CSS animations
    const normalizedMicVolume = Math.min(1, (inVolume * 200) / 8);
    document.documentElement.style.setProperty(
      "--mic-volume",
      normalizedMicVolume.toString()
    );
  }, [inVolume]);

  useEffect(() => {
    const onData = (base64: string) => {
      client.sendRealtimeInput([
        {
          mimeType: "audio/pcm;rate=16000",
          data: base64,
        },
      ]);
    };
    if (connected && !muted && audioRecorder) {
      audioRecorder.on("data", onData).on("volume", setInVolume).start();
    } else {
      audioRecorder.stop();
    }
    return () => {
      audioRecorder.off("data", onData).off("volume", setInVolume);
    };
  }, [connected, client, muted, audioRecorder]);

  // Handle global toast events
  useEffect(() => {
    const handleNavToast = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setToastMessage(customEvent.detail);
        setTimeout(() => setToastMessage(null), 5000);
      }
    };

    window.addEventListener(UI_EVENTS.NAV_TOAST, handleNavToast);
    return () => {
      window.removeEventListener(UI_EVENTS.NAV_TOAST, handleNavToast);
    };
  }, []);

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.MIC_MUTED, muted.toString());
  }, [muted, STORAGE_KEYS.MIC_MUTED]);

  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  const checkInactivity = useCallback(() => {
    if (muted || !connected) {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }

    const SILENCE_THRESHOLD = 0.05;
    const INACTIVITY_MS = 3 * 60 * 1000; // 3 minutes

    const isSilent = inVolume < SILENCE_THRESHOLD && volume < SILENCE_THRESHOLD;

    if (isSilent) {
      if (!inactivityTimerRef.current) {
        inactivityTimerRef.current = setTimeout(() => {
          setMuted(true);
          setToastMessage("🔇 Auto-muted (3m inactivity)");

          client.send([{
            text: "[SYSTEM NOTICE]: User microphone automatically MUTED due to 3 minutes of inactivity. " +
              "You must explicitly inform the user: 'Microphone auto-muted due to inactivity.'"
          }]);

          setTimeout(() => setToastMessage(null), 5000);
          inactivityTimerRef.current = null;
        }, INACTIVITY_MS);
      }
    } else {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    }
  }, [connected, muted, inVolume, volume, client]);

  // Auto-mute on inactivity
  useEffect(() => {
    checkInactivity();
  }, [checkInactivity]);

  // Final cleanup on unmount
  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TRANSLATOR_ACTIVE, isTranslatorActive.toString());
  }, [isTranslatorActive, STORAGE_KEYS.TRANSLATOR_ACTIVE]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SMARTLINKS_ACTIVE, isSmartLinksActive.toString());
  }, [isSmartLinksActive, STORAGE_KEYS.SMARTLINKS_ACTIVE]);

  // ── Port Management: Maintain sidepanel alive status ───────────────────────
  useEffect(() => {
    // Establishing a port once allows the background script to detect when the panel is closed.
    const port = chrome.runtime.connect({ name: "sidepanel" });
    return () => port.disconnect();
  }, []);

  // ── State Sync: Notify background when modes change ─────────────────────────
  useEffect(() => {
    chrome.runtime.sendMessage({ type: CHROME_MESSAGES.TRANSLATOR_TOGGLE, enable: isTranslatorActive });
  }, [isTranslatorActive]);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: CHROME_MESSAGES.TOGGLE_SMART_LINKS, enable: isSmartLinksActive });
  }, [isSmartLinksActive]);

  // Always auto-reconnect whenever disconnected
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!connected) {
        connect();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [connected, connect]); // Restored [connected] to ensure persistent connection

  // ── Translator Mode: toggle handler ──────────────────────────────────────────
  const toggleTranslator = useCallback(() => {
    const next = !isTranslatorActive;
    setIsTranslatorActive(next);
    chrome.runtime.sendMessage(
      { type: CHROME_MESSAGES.TRANSLATOR_TOGGLE, enable: next },
      () => {
        setToastMessage(next ? "🌐 Translator Mode ON" : "Translator Mode OFF");
        setTimeout(() => setToastMessage(null), 3000);
      }
    );
  }, [isTranslatorActive]);



  // ── Smart Links Mode: toggle handler ───────────────────────────────────────
  const toggleSmartLinks = useCallback(() => {
    const next = !isSmartLinksActive;
    setIsSmartLinksActive(next);
    chrome.runtime.sendMessage(
      { type: CHROME_MESSAGES.TOGGLE_SMART_LINKS, enable: next },
      () => {
        setToastMessage(next ? "🔗 Smart Links ON" : "Smart Links OFF");
        setTimeout(() => setToastMessage(null), 3000);
      }
    );
  }, [isSmartLinksActive]);



  // ── Translator Mode: listen for selected text from background ────────────────
  useEffect(() => {
    if (!isTranslatorActive || !connected) return;

    const listener = (message: any) => {
      if (message.type === CHROME_MESSAGES.TEXT_SELECTED && message.text) {
        const targetLang = localStorage.getItem(TRANSLATOR_LANG_KEY) || "English";
        client.send([
          {
            text: `[SYSTEM NOTICE]: User highlighted text: '${message.text}'. ` +
              `The user's language is ${targetLang}. ` +
              `If the highlighted text is in a different language, translate it to ${targetLang} and briefly explain context. ` +
              `If the highlighted text is already in ${targetLang}, explain what it means in simple terms. ` +
              `Be concise.`,
          },
        ]);
        setToastMessage(`🌐 Translating: "${message.text.slice(0, 40)}…"`);
        setTimeout(() => setToastMessage(null), 4000);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [isTranslatorActive, connected, client]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = activeVideoStream;
    }

    let timeoutId = -1;

    function sendVideoFrame() {
      const video = videoRef.current;
      const canvas = renderCanvasRef.current;

      if (!video || !canvas) {
        return;
      }

      const ctx = canvas.getContext("2d")!;
      canvas.width = video.videoWidth * 0.25;
      canvas.height = video.videoHeight * 0.25;

      if (canvas.width + canvas.height > 0) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL("image/jpeg", 1.0);
        const data = base64.slice(base64.indexOf(",") + 1, Infinity);
        client.sendRealtimeInput([{ mimeType: "image/jpeg", data }]);
      }
      if (connected) {
        timeoutId = window.setTimeout(sendVideoFrame, 1000 / CAPTURE_CONFIG.DESKTOP_CAPTURE_FPS);
      }
    }
    if (connected && activeVideoStream !== null) {
      requestAnimationFrame(sendVideoFrame);
    }
    return () => {
      clearTimeout(timeoutId);
    };
  }, [connected, activeVideoStream, client, videoRef]);

  //handler for swapping from one video-stream to the next
  const changeStreams = useCallback(
    (next?: UseMediaStreamResult, forceDesktop: boolean = false) => async () => {
      if (next) {
        const mediaStream = forceDesktop && next.startDesktop ? await next.startDesktop() : await next.startScreenshots();
        setActiveVideoStream(mediaStream);
        onVideoStreamChange(mediaStream);
      } else {
        setActiveVideoStream(null);
        onVideoStreamChange(null);
      }

      videoStreams.filter((msr) => msr !== next).forEach((msr) => msr.stop());
    },
    [onVideoStreamChange, videoStreams]
  );

  useEffect(() => {
    const onToolCall = (toolCall: LiveServerToolCall) => {
      if (!toolCall.functionCalls) {
        return;
      }

      // --- switch_vision_source ---
      const switchFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.SWITCH_VISION
      );
      if (switchFc) {
        const target = (switchFc.args as any).target;
        if (target === "webcam") {
          changeStreams(webcam)();
          setToastMessage("Navigator is now looking at: Webcam");
        } else if (target === "screen") {
          changeStreams(screenCapture)();
          setToastMessage("Navigator is now looking at: Screen");
        }
        setTimeout(() => setToastMessage(null), 5000);
        setTimeout(
          () =>
            client.sendToolResponse({
              functionResponses: [
                {
                  id: switchFc.id,
                  name: switchFc.name,
                  response: { output: { success: true, target } },
                },
              ],
            }),
          200
        );
      }

      // --- request_desktop_access ---
      const desktopFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.REQUEST_DESKTOP
      );
      if (desktopFc) {
        setToastMessage("Opening desktop sharing picker...");
        screenCapture.startDesktop()
          .then((desktopStream) => {
            setActiveVideoStream(desktopStream);
            onVideoStreamChange(desktopStream);
            // Stop other streams
            videoStreams.filter((msr) => msr !== screenCapture).forEach((msr) => msr.stop());
            setToastMessage("Navigator is now looking at: Desktop");
            setTimeout(() => setToastMessage(null), 5000);
            client.sendToolResponse({
              functionResponses: [
                {
                  id: desktopFc.id,
                  name: desktopFc.name,
                  response: { output: { success: true, message: "Desktop sharing started." } },
                },
              ],
            });
          })
          .catch((err) => {
            console.warn("Desktop picker cancelled or failed:", err);
            setToastMessage(null);
            client.sendToolResponse({
              functionResponses: [
                {
                  id: desktopFc.id,
                  name: desktopFc.name,
                  response: { output: { success: false, message: "User cancelled desktop sharing." } },
                },
              ],
            });
          });
      }

      // --- stop_vision ---
      const stopFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.STOP_VISION
      );
      if (stopFc) {
        videoStreams.forEach((msr) => msr.stop());
        setActiveVideoStream(null);
        onVideoStreamChange(null);
        setToastMessage("Navigator stopped looking.");
        setTimeout(() => setToastMessage(null), 5000);
        client.sendToolResponse({
          functionResponses: [
            {
              id: stopFc.id,
              name: stopFc.name,
              response: { output: { success: true } },
            },
          ],
        });
      }

      // --- highlight_element ---
      const highlightFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.HIGHLIGHT_ELEMENT
      );
      if (highlightFc) {
        const { x, y, label } = highlightFc.args as any;
        setGazeTarget({ x, y });
        if (gazeTimeoutRef.current) clearTimeout(gazeTimeoutRef.current);
        gazeTimeoutRef.current = window.setTimeout(() => setGazeTarget(null), 2000);

        setToastMessage(`Highlighting element at (${Math.round(x)}, ${Math.round(y)})...`);
        chrome.runtime.sendMessage(
          { type: CHROME_MESSAGES.HIGHLIGHT_ELEMENT, x, y, label },
          (result) => {
            const ok = result?.success ?? false;
            setToastMessage(ok ? "✓ Element highlighted" : "⚠ Highlight failed");
            setTimeout(() => setToastMessage(null), 3000);
            client.sendToolResponse({
              functionResponses: [{
                id: highlightFc.id,
                name: highlightFc.name,
                response: { output: result ?? { success: false } },
              }],
            });
          }
        );
      }

      // --- click_element ---
      const clickFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.CLICK_ELEMENT
      );
      if (clickFc) {
        const { x, y } = clickFc.args as any;
        setGazeTarget({ x, y });
        if (gazeTimeoutRef.current) clearTimeout(gazeTimeoutRef.current);
        gazeTimeoutRef.current = window.setTimeout(() => setGazeTarget(null), 2000);

        setToastMessage(`Clicking at (${Math.round(x)}, ${Math.round(y)})...`);
        chrome.runtime.sendMessage(
          { type: CHROME_MESSAGES.CLICK_ELEMENT, x, y },
          (result) => {
            const ok = result?.success ?? false;
            setToastMessage(ok ? "✓ Clicked!" : "⚠ Click failed");
            setTimeout(() => setToastMessage(null), 3000);
            client.sendToolResponse({
              functionResponses: [{
                id: clickFc.id,
                name: clickFc.name,
                response: { output: result ?? { success: false } },
              }],
            });
          }
        );
      }

      // --- click_smart_link ---
      const clickSmartLinkFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.CLICK_SMART_LINK
      );
      if (clickSmartLinkFc) {
        const { label_id } = clickSmartLinkFc.args as any;
        setToastMessage(`Clicking Smart Link [${label_id}]...`);
        chrome.runtime.sendMessage(
          { type: CHROME_MESSAGES.CLICK_SMART_LINK, labelId: label_id },
          (result) => {
            const ok = result?.success ?? false;
            if (ok && typeof result.x === "number" && typeof result.y === "number") {
              setGazeTarget({ x: result.x, y: result.y });
              if (gazeTimeoutRef.current) clearTimeout(gazeTimeoutRef.current);
              gazeTimeoutRef.current = window.setTimeout(() => setGazeTarget(null), 2000);
            }

            setToastMessage(ok ? `✓ Clicked [${label_id}]!` : `⚠ Failed to click [${label_id}]`);
            setTimeout(() => setToastMessage(null), 3000);
            client.sendToolResponse({
              functionResponses: [{
                id: clickSmartLinkFc.id,
                name: clickSmartLinkFc.name,
                response: { output: result ?? { success: false } },
              }],
            });
          }
        );
      }

      // --- show_smart_links ---
      const showSmartLinksFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.SHOW_SMART_LINKS
      );
      if (showSmartLinksFc) {
        setIsSmartLinksActive(true);
        chrome.runtime.sendMessage(
          { type: CHROME_MESSAGES.TOGGLE_SMART_LINKS, enable: true },
          (result) => {
            setToastMessage("🏷️ Smart Links ON (Voice)");
            setTimeout(() => setToastMessage(null), 3000);
            client.sendToolResponse({
              functionResponses: [{
                id: showSmartLinksFc.id,
                name: showSmartLinksFc.name,
                response: { output: result ?? { success: false } },
              }],
            });
          }
        );
      }

      // --- hide_smart_links ---
      const hideSmartLinksFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.HIDE_SMART_LINKS
      );
      if (hideSmartLinksFc) {
        setIsSmartLinksActive(false);
        chrome.runtime.sendMessage(
          { type: CHROME_MESSAGES.TOGGLE_SMART_LINKS, enable: false },
          (result) => {
            setToastMessage("Smart Links OFF (Voice)");
            setTimeout(() => setToastMessage(null), 3000);
            client.sendToolResponse({
              functionResponses: [{
                id: hideSmartLinksFc.id,
                name: hideSmartLinksFc.name,
                response: { output: result ?? { success: false } },
              }],
            });
          }
        );
      }

      // --- toggle_explain ---
      // --- show_explain_mode ---
      const showExplainFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.SHOW_EXPLAIN_MODE
      );
      if (showExplainFc) {
        setIsTranslatorActive(true);
        chrome.runtime.sendMessage(
          { type: CHROME_MESSAGES.TRANSLATOR_TOGGLE, enable: true },
          (result) => {
            setToastMessage("🌐 Explain Mode ON (Voice)");
            setTimeout(() => setToastMessage(null), 3000);
            client.sendToolResponse({
              functionResponses: [{
                id: showExplainFc.id,
                name: showExplainFc.name,
                response: { output: result ?? { success: false } },
              }],
            });
          }
        );
      }

      // --- hide_explain_mode ---
      const hideExplainFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.HIDE_EXPLAIN_MODE
      );
      if (hideExplainFc) {
        setIsTranslatorActive(false);
        chrome.runtime.sendMessage(
          { type: CHROME_MESSAGES.TRANSLATOR_TOGGLE, enable: false },
          (result) => {
            setToastMessage("Explain Mode OFF (Voice)");
            setTimeout(() => setToastMessage(null), 3000);
            client.sendToolResponse({
              functionResponses: [{
                id: hideExplainFc.id,
                name: hideExplainFc.name,
                response: { output: result ?? { success: false } },
              }],
            });
          }
        );
      }

      // --- type_text ---
      const typeFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.TYPE_TEXT
      );
      if (typeFc) {
        const { x, y, text } = typeFc.args as any;
        setToastMessage(`Typing: "${text}"...`);
        chrome.runtime.sendMessage(
          { type: CHROME_MESSAGES.TYPE_TEXT, x, y, text },
          (result) => {
            const ok = result?.success ?? false;
            setToastMessage(ok ? `✓ Typed: "${text}"` : "⚠ Type failed");
            setTimeout(() => setToastMessage(null), 3000);
            client.sendToolResponse({
              functionResponses: [{
                id: typeFc.id,
                name: typeFc.name,
                response: { output: result ?? { success: false } },
              }],
            });
          }
        );
      }

      // --- google_search ---
      const searchFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.GOOGLE_SEARCH
      );
      if (searchFc) {
        const { query } = searchFc.args as any;
        
        if (query === "undefined" || !query) {
          client.sendToolResponse({
            functionResponses: [{
              id: searchFc.id,
              name: searchFc.name,
              response: { output: { success: false, error: "Invalid search query" } },
            }],
          });
        } else {
          const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
          setToastMessage(`Searching Google for: "${query}"`);
          chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (tab?.id) chrome.tabs.update(tab.id, { url: searchUrl });
          });
          setTimeout(() => setToastMessage(null), 4000);
          client.sendToolResponse({
            functionResponses: [{
              id: searchFc.id,
              name: searchFc.name,
              response: { output: { success: true, query, url: searchUrl } },
            }],
          });
        }
      }

      // --- youtube_search ---
      const youtubeSearchFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.YOUTUBE_SEARCH
      );
      if (youtubeSearchFc) {
        const { query } = youtubeSearchFc.args as any;
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        setToastMessage(`🎬 Searching YouTube for: "${query}"`);
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (tab?.id) chrome.tabs.update(tab.id, { url: searchUrl });
        });
        setTimeout(() => setToastMessage(null), 4000);
        client.sendToolResponse({
          functionResponses: [{
            id: youtubeSearchFc.id,
            name: youtubeSearchFc.name,
            response: { output: { success: true, query, url: searchUrl } },
          }],
        });
      }

      // --- netflix_search ---
      const netflixSearchFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.NETFLIX_SEARCH
      );
      if (netflixSearchFc) {
        const { query } = netflixSearchFc.args as any;
        const searchUrl = `https://www.netflix.com/search?q=${encodeURIComponent(query)}`;
        setToastMessage(`🎥 Searching Netflix for: "${query}"`);
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (tab?.id) chrome.tabs.update(tab.id, { url: searchUrl });
        });
        setTimeout(() => setToastMessage(null), 4000);
        client.sendToolResponse({
          functionResponses: [{
            id: netflixSearchFc.id,
            name: netflixSearchFc.name,
            response: { output: { success: true, query, url: searchUrl } },
          }],
        });
      }

      // --- spotify_search ---
      const spotifySearchFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.SPOTIFY_SEARCH
      );
      if (spotifySearchFc) {
        const { query } = spotifySearchFc.args as any;
        const searchUrl = `https://open.spotify.com/search/${encodeURIComponent(query)}`;
        setToastMessage(`🎵 Searching Spotify for: "${query}"`);
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (tab?.id) chrome.tabs.update(tab.id, { url: searchUrl });
        });
        setTimeout(() => setToastMessage(null), 4000);
        client.sendToolResponse({
          functionResponses: [{
            id: spotifySearchFc.id,
            name: spotifySearchFc.name,
            response: { output: { success: true, query, url: searchUrl } },
          }],
        });
      }

      // --- amazon_search ---
      const amazonSearchFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.AMAZON_SEARCH
      );
      if (amazonSearchFc) {
        const { query } = amazonSearchFc.args as any;
        const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;
        setToastMessage(`🛒 Searching Amazon for: "${query}"`);
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (tab?.id) chrome.tabs.update(tab.id, { url: searchUrl });
        });
        setTimeout(() => setToastMessage(null), 4000);
        client.sendToolResponse({
          functionResponses: [{
            id: amazonSearchFc.id,
            name: amazonSearchFc.name,
            response: { output: { success: true, query, url: searchUrl } },
          }],
        });
      }

      // --- ebay_search ---
      const ebaySearchFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.EBAY_SEARCH
      );
      if (ebaySearchFc) {
        const { query } = ebaySearchFc.args as any;
        const searchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`;
        setToastMessage(`🏷️ Searching eBay for: "${query}"`);
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (tab?.id) chrome.tabs.update(tab.id, { url: searchUrl });
        });
        setTimeout(() => setToastMessage(null), 4000);
        client.sendToolResponse({
          functionResponses: [{
            id: ebaySearchFc.id,
            name: ebaySearchFc.name,
            response: { output: { success: true, query, url: searchUrl } },
          }],
        });
      }

      // --- wikipedia_search ---
      const wikipediaSearchFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.WIKIPEDIA_SEARCH
      );
      if (wikipediaSearchFc) {
        const { query } = wikipediaSearchFc.args as any;
        const searchUrl = `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`;
        setToastMessage(`📖 Looking up on Wikipedia: "${query}"`);
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (tab?.id) chrome.tabs.update(tab.id, { url: searchUrl });
        });
        setTimeout(() => setToastMessage(null), 4000);
        client.sendToolResponse({
          functionResponses: [{
            id: wikipediaSearchFc.id,
            name: wikipediaSearchFc.name,
            response: { output: { success: true, query, url: searchUrl } },
          }],
        });
      }

      // --- reddit_search ---
      const redditSearchFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.REDDIT_SEARCH
      );
      if (redditSearchFc) {
        const { query } = redditSearchFc.args as any;
        const searchUrl = `https://www.reddit.com/search/?q=${encodeURIComponent(query)}`;
        setToastMessage(`👾 Searching Reddit for: "${query}"`);
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (tab?.id) chrome.tabs.update(tab.id, { url: searchUrl });
        });
        setTimeout(() => setToastMessage(null), 4000);
        client.sendToolResponse({
          functionResponses: [{
            id: redditSearchFc.id,
            name: redditSearchFc.name,
            response: { output: { success: true, query, url: searchUrl } },
          }],
        });
      }

      // --- google_maps_search ---
      const mapsSearchFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.GOOGLE_MAPS_SEARCH
      );
      if (mapsSearchFc) {
        const { query } = mapsSearchFc.args as any;
        const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
        setToastMessage(`🗺️ Opening Google Maps for: "${query}"`);
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (tab?.id) chrome.tabs.update(tab.id, { url: searchUrl });
        });
        setTimeout(() => setToastMessage(null), 4000);
        client.sendToolResponse({
          functionResponses: [{
            id: mapsSearchFc.id,
            name: mapsSearchFc.name,
            response: { output: { success: true, query, url: searchUrl } },
          }],
        });
      }

      // --- go_back ---
      const goBackFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.GO_BACK
      );
      if (goBackFc) {
        chrome.runtime.sendMessage(
          { type: CHROME_MESSAGES.GO_BACK },
          (result) => {
            setToastMessage(result?.success ? "✓ Navigated back" : "⚠ Go back failed");
            setTimeout(() => setToastMessage(null), 3000);
            client.sendToolResponse({
              functionResponses: [{
                id: goBackFc.id,
                name: goBackFc.name,
                response: { output: result ?? { success: false } },
              }],
            });
          }
        );
      }

      // --- scroll_down ---
      const scrollDownFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.SCROLL_DOWN
      );
      if (scrollDownFc) {
        chrome.runtime.sendMessage(
          { type: CHROME_MESSAGES.SCROLL_DOWN },
          (result) => {
            setToastMessage("Scrolling down...");
            setTimeout(() => setToastMessage(null), 3000);
            client.sendToolResponse({
              functionResponses: [{
                id: scrollDownFc.id,
                name: scrollDownFc.name,
                response: { output: result ?? { success: false } },
              }],
            });
          }
        );
      }

      // --- scroll_up ---
      const scrollUpFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.SCROLL_UP
      );
      if (scrollUpFc) {
        chrome.runtime.sendMessage(
          { type: CHROME_MESSAGES.SCROLL_UP },
          (result) => {
            setToastMessage("Scrolling up...");
            setTimeout(() => setToastMessage(null), 3000);
            client.sendToolResponse({
              functionResponses: [{
                id: scrollUpFc.id,
                name: scrollUpFc.name,
                response: { output: result ?? { success: false } },
              }],
            });
          }
        );
      }

      // --- open_new_tab ---
      const openTabFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.OPEN_NEW_TAB
      );
      if (openTabFc) {
        const { url } = openTabFc.args as any;
        setToastMessage(`Opening ${url}...`);
        chrome.runtime.sendMessage(
          { type: CHROME_MESSAGES.OPEN_TAB, url },
          (result) => {
            setToastMessage(result?.success ? `✓ Opened ${url}` : "⚠ Failed to open tab");
            setTimeout(() => setToastMessage(null), 3000);
            client.sendToolResponse({
              functionResponses: [{
                id: openTabFc.id,
                name: openTabFc.name,
                response: { output: result ?? { success: false } },
              }],
            });
          }
        );
      }

      // --- switch_tab ---
      const switchTabFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.SWITCH_TAB
      );
      if (switchTabFc) {
        const { keyword } = switchTabFc.args as any;
        setToastMessage(`Switching to tab: "${keyword}"...`);
        chrome.runtime.sendMessage(
          { type: CHROME_MESSAGES.SWITCH_TAB, keyword },
          (result) => {
            setToastMessage(result?.success ? `✓ Switched to: ${result.title}` : `⚠ No tab matching "${keyword}"`);
            setTimeout(() => setToastMessage(null), 3000);
            client.sendToolResponse({
              functionResponses: [{
                id: switchTabFc.id,
                name: switchTabFc.name,
                response: { output: result ?? { success: false } },
              }],
            });
          }
        );
      }

      // --- close_current_tab ---
      const closeTabFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.CLOSE_CURRENT_TAB
      );
      if (closeTabFc) {
        setToastMessage("Closing tab...");
        chrome.runtime.sendMessage(
          { type: CHROME_MESSAGES.CLOSE_TAB },
          (result) => {
            client.sendToolResponse({
              functionResponses: [{
                id: closeTabFc.id,
                name: closeTabFc.name,
                response: { output: result ?? { success: false } },
              }],
            });
          }
        );
      }

      // --- get_clipboard_content ---
      const clipboardFc = toolCall.functionCalls.find(
        (fc) => fc.name === TOOL_NAMES.GET_CLIPBOARD_CONTENT
      );
      if (clipboardFc) {
        setToastMessage("Reading clipboard...");
        chrome.runtime.sendMessage(
          { type: CHROME_MESSAGES.GET_CLIPBOARD },
          (result) => {
            setToastMessage(result?.success ? "✓ Clipboard read" : "⚠ Clipboard read failed");
            setTimeout(() => setToastMessage(null), 2000);
            client.sendToolResponse({
              functionResponses: [{
                id: clipboardFc.id,
                name: clipboardFc.name,
                response: {
                  output: {
                    success: result?.success ?? false,
                    content: result?.clipboardText ?? "",
                  },
                },
              }],
            });
          }
        );
      }

      // --- Universal fallback: respond to any unrecognised tool call ---
      // Without this, unknown tools leave an open tool call, the server
      // gets no response, and the session disconnects.
      const knownTools = new Set(Object.values(TOOL_NAMES));
      const unknownCalls = toolCall.functionCalls.filter(
        (fc) => !knownTools.has(fc.name as any)
      );
      unknownCalls.forEach((fc) => {
        console.warn(`[GemiNav AI] Unknown tool called: "${fc.name}". Sending error response.`);
        client.sendToolResponse({
          functionResponses: [{
            id: fc.id,
            name: fc.name,
            response: { output: { success: false, error: `Tool "${fc.name}" is not available.` } },
          }],
        });
      });
    };

    client.on("toolcall", onToolCall);
    return () => {
      client.off("toolcall", onToolCall);
    };
  }, [client, webcam, screenCapture, changeStreams, onVideoStreamChange, videoStreams]);

  return (
    <section className="control-tray vertical-ui">
      <canvas style={{ display: "none" }} ref={renderCanvasRef} />

      {/* ZONE 1: The Iris Visualizer */}
      <div className="zone-iris">
        <AudioPulse volume={volume} active={connected} hover={false} gazeTarget={gazeTarget} />
      </div>

      {/* ZONE 2: Primary Action (Connect) - Hidden per user request for full automation */}
      <div className="zone-primary-action" style={{ display: "none" }}>
        <button
          ref={connectButtonRef}
          className={cn("connect-btn", { connected })}
          onClick={connected ? disconnect : connect}
        >
          <span className="material-symbols-outlined filled">
            {connected ? "stop" : "bolt"}
          </span>
          <span className="connect-text">
            {connected ? "Disconnect" : "Connect Agent"}
          </span>
        </button>
      </div>

      {/* ZONE 3: Utility Grid */}
      <nav className={cn("actions-grid", { disabled: !connected })}>

        {/* Row 1: Active Tools (Mic, Translate, Tags) */}
        <div className="action-row">
          {/* Mic Toggle */}
          <button
            className={cn("grid-button mic-button", { muted })}
            onClick={() => setMuted(!muted)}
            title={muted ? "Unmute Mic" : "Mute Mic"}
          >
            <span className="material-symbols-outlined filled">
              mic
            </span>
            <span className="label">Mic</span>
          </button>

          {/* Translator Mode toggle */}
          <button
            className={cn("grid-button", isTranslatorActive ? "active" : "off")}
            onClick={toggleTranslator}
            title={isTranslatorActive ? "Disable Explain Mode" : "Enable Explain Mode"}
          >
            <span className="material-symbols-outlined">translate</span>
            <span className="label">EXPLAIN</span>
          </button>

          {/* Smart Links toggle */}
          <button
            className={cn("grid-button", isSmartLinksActive ? "active" : "off")}
            onClick={toggleSmartLinks}
            title={isSmartLinksActive ? "Disable Smart Links" : "Enable Smart Links"}
          >
            <span className="material-symbols-outlined">link</span>
            <span className="label">Smart Links</span>
          </button>
        </div>

        {/* Row 3: Video Streams (Desktop, Browser, Camera) */}
        {supportsVideo && (
          <div className="action-row">
            <MediaStreamButton
              isStreaming={webcam.isStreaming}
              start={changeStreams(webcam)}
              stop={changeStreams()}
              icon="videocam"
              label="Camera"
            />
            <MediaStreamButton
              isStreaming={!!(screenCapture.isStreaming && !activeVideoStream?.getVideoTracks()[0]?.label.includes("screen"))}
              start={changeStreams(screenCapture)}
              stop={changeStreams()}
              icon="present_to_all"
              label="Browser"
            />
            <MediaStreamButton
              isStreaming={!!(screenCapture.isStreaming && activeVideoStream?.getVideoTracks()[0]?.label.includes("screen"))}
              start={changeStreams(screenCapture, true)}
              stop={changeStreams()}
              icon="desktop_windows"
              label="Desktop"
            />
          </div>
        )}
      </nav>

      {/* ZONE 4: Video Preview */}
      <div className="zone-preview">
        <video
          className={cn("stream", {
            hidden: !videoRef.current || !activeVideoStream,
          })}
          ref={videoRef}
          autoPlay
          playsInline
        />
      </div>

      {toastMessage && (
        <div className="vision-toast">
          {toastMessage}
        </div>
      )}

      {enableEditingSettings ? <div className="zone-footer"><SettingsDialog /></div> : ""}
    </section>
  );
}

export default memo(ControlTray);
