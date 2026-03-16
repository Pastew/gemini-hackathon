/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useState, useEffect, useRef } from "react";
import { UseMediaStreamResult } from "./use-media-stream-mux";
import { CAPTURE_CONFIG } from "../config";
import { CHROME_MESSAGES, CHROME_ERRORS, UI_EVENTS } from "../lib/constants";

const LOG_TRAFFIC = true;

/**
 * STRATEGY: SCREENSHOT STREAMING
 * Instead of fighting the blocked `tabCapture` API, we build a video stream
 * from periodic screenshots taken via `captureVisibleTab`.
 *
 * Provides a React hook for managing screen capture streams, primarily employing
 * a silent screenshot-based stream for browser tab inspection, with a fallback
 * to native desktop `getDisplayMedia` picker.
 */
async function createSilentScreenshotStream(): Promise<MediaStream> {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Failed to create canvas context");
  }

  // Create a MediaStream from the canvas at configured FPS
  const stream = canvas.captureStream(CAPTURE_CONFIG.TAB_CAPTURE_FPS);
  const track = stream.getVideoTracks()[0];

  let isActive = true;
  let lastDataUrl: string | null = null;

  const drawBlindFrame = () => {
    ctx.fillStyle = "#0a0a0b"; // Dark theme background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle gradient for tech look
    const grad = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 0,
      canvas.width / 2, canvas.height / 2, canvas.width / 2
    );
    grad.addColorStop(0, "rgba(0, 240, 255, 0.05)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Text & Icon
    ctx.fillStyle = "#FF003C"; // Neon Red
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    // Draw Icon (Emoji) - 2x bigger
    ctx.font = "160px sans-serif";
    ctx.fillText("🙈", canvas.width / 2, canvas.height / 2 - 80);

    // Draw Label - 2x bigger
    ctx.font = "bold 84px 'Courier New', monospace";
    ctx.fillText("PRIVACY PROTECTED", canvas.width / 2, canvas.height / 2 + 120);
  };

  const loop = async () => {
    if (!isActive) return;

    try {
      const response = await chrome.runtime.sendMessage({ type: CHROME_MESSAGES.GET_TAB_SCREENSHOT });

      if (response && response.error === CHROME_ERRORS.RESTRICTED_PAGE) {
        drawBlindFrame();
        lastDataUrl = null; // Reset to force redraw when we're back
        window.dispatchEvent(new CustomEvent(UI_EVENTS.NAV_TOAST, { detail: "Whoops! Google blocked my view (Restricted Page). I'm blind here! 🙈" }));
      } else if (response && typeof response === 'string') {
        const dataUrl = response;
        const sizeKB = (dataUrl.length * 0.75) / 1024;

        if (dataUrl === lastDataUrl) {
          if (LOG_TRAFFIC) {
            console.log(`[Skipped] Frame identical. (Saved ~${sizeKB.toFixed(2)} KB)`);
          }
        } else {
          lastDataUrl = dataUrl;

          const img = new Image();
          img.onload = () => {
            if (!isActive) return;
            // Use the screenshot's native dimensions so no aspect ratio
            // distortion is introduced (fixes widescreen X-axis offset).
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          };
          img.src = dataUrl;

          if (LOG_TRAFFIC) {
            console.log(`[SENT] New frame drawn. Payload: ~${sizeKB.toFixed(2)} KB`);
          }
        }
      } else {
        console.warn("Screenshot capture skipped:");
      }
    } catch (err) {
      console.warn("Screenshot capture skipped:", err);
    }

    if (isActive) {
      setTimeout(loop, 1000 / CAPTURE_CONFIG.TAB_CAPTURE_FPS);
    }
  };

  loop();

  // Cleanup
  track.onended = () => {
    isActive = false;
  };

  const originalStop = track.stop.bind(track);
  track.stop = () => {
    isActive = false;
    originalStop();
  };

  return stream;
}

async function captureDisplayMedia(): Promise<MediaStream> {
  const mediaDevices = navigator.mediaDevices as MediaDevices & {
    getDisplayMedia(options?: DisplayMediaStreamOptions): Promise<MediaStream>;
  };
  return await mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: CAPTURE_CONFIG.SCREEN_WIDTH },
      frameRate: {
        ideal: CAPTURE_CONFIG.DESKTOP_CAPTURE_FPS,
        max: CAPTURE_CONFIG.DESKTOP_CAPTURE_FPS
      },
    },
    audio: false,
  });
}

export function useScreenCapture(): UseMediaStreamResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  // Use ref to keep track of stream and its mode synchronously
  const streamRef = useRef<MediaStream | null>(null);
  const currentModeRef = useRef<"screenshots" | "desktop" | null>(null);

  useEffect(() => {
    const handleStreamEnded = () => {
      setIsStreaming(false);
      setStream(null);
      streamRef.current = null;
      currentModeRef.current = null;
    };
    if (stream) {
      stream.getTracks().forEach((track) => track.addEventListener("ended", handleStreamEnded));
      return () => {
        stream.getTracks().forEach((track) => track.removeEventListener("ended", handleStreamEnded));
      };
    }
  }, [stream]);

  const stop = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      setStream(null);
      streamRef.current = null;
      currentModeRef.current = null;
      setIsStreaming(false);
    }
  };

  const startScreenshots = async (): Promise<MediaStream> => {
    // If already streaming in screenshot mode, return the existing stream
    if (isStreaming && streamRef.current && currentModeRef.current === "screenshots") {
      return streamRef.current;
    }

    // Stop existing desktop stream if necessary
    if (streamRef.current) {
      stop();
    }

    try {
      console.log("[Navigator] Starting Silent Screenshot Stream...");
      const silentStream = await createSilentScreenshotStream();

      setStream(silentStream);
      streamRef.current = silentStream;
      currentModeRef.current = "screenshots";
      setIsStreaming(true);

      return silentStream;

    } catch (err) {
      console.warn("[Navigator] Silent stream failed, falling back to picker:", err);

      try {
        const displayStream = await captureDisplayMedia();

        setStream(displayStream);
        streamRef.current = displayStream;
        currentModeRef.current = "screenshots"; // Treated as screenshots fallback
        setIsStreaming(true);

        return displayStream;
      } catch (pickerErr) {
        console.error("Screen capture failed completely:", pickerErr);
        throw pickerErr;
      }
    }
  };

  const startDesktop = async (): Promise<MediaStream> => {
    // Stop any existing stream before opening the picker
    stop();
    const desktopStream = await captureDisplayMedia();
    setStream(desktopStream);
    streamRef.current = desktopStream;
    currentModeRef.current = "desktop";
    setIsStreaming(true);
    return desktopStream;
  };

  return { type: "screen", startScreenshots, startDesktop, stop, isStreaming, stream };
}