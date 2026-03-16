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

import "./audio-pulse.scss";
import React from "react";
import { useEffect, useRef } from "react";
import c from "classnames";

export type AudioPulseProps = {
  active: boolean;
  volume: number;
  hover?: boolean;
  gazeTarget?: { x: number; y: number } | null;
};

export default function AudioPulse({ active, volume, hover, gazeTarget }: AudioPulseProps) {
  const orbRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (coreRef.current) {
      if (gazeTarget) {
        // The Side Panel is on the right, and the eye is near the top.
        // We adjust the baseline so "straight ahead" isn't the screen center.
        // Horizontal: Map 0-1000 to mostly negative (left) values.
        // Using 1100 as the "eye x" baseline.
        const rX = Math.max(-1, Math.min(1, (gazeTarget.x - 1200) / 800));
        
        // Vertical: Map 0-1000 such that 150 (eye height) is neutral.
        const rY = Math.max(-1, Math.min(1, (gazeTarget.y - 150) / 600));
        
        // Translate the pupil by up to 13px in any direction
        const tx = rX * 13;
        const ty = rY * 13;
        
        coreRef.current.style.transform = `translate(${tx}px, ${ty}px)`;
        coreRef.current.style.transition = 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      } else {
        coreRef.current.style.transform = `translate(0px, 0px)`;
        coreRef.current.style.transition = 'transform 0.6s ease-out';
      }
    }
  }, [gazeTarget]);

  useEffect(() => {
    let timeout: number | null = null;
    const update = () => {
      if (orbRef.current) {
        // Reduced base scale by 30% per user request (0.5 => 0.35, 3 => 2.1)
        const scale = 1 + Math.min(0.35, volume * 2.1);
        // Reduce glow brightness/opacity
        const glowOpacity = Math.min(0.8, 0.4 + volume * 1.4);
        
        orbRef.current.style.transform = `scale(${scale})`;
        orbRef.current.style.setProperty('--glow-opacity', glowOpacity.toString());
      }
      timeout = window.setTimeout(update, 50); // Faster update for smoother eye reaction
    };

    update();

    return () => clearTimeout((timeout as number)!);
  }, [volume]);

  return (
    <div className={c("audioPulse-container", { active, hover })}>
      <div className="iris" ref={orbRef}>
        <div className="iris-core" ref={coreRef}></div>
      </div>
    </div>
  );
}
