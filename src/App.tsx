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

import { useRef, useState, useEffect, useCallback } from "react";
import "./App.scss";
import { LiveAPIProvider } from "./contexts/LiveAPIContext";
import SidePanel from "./components/side-panel/SidePanel";
import ControlTray from "./components/control-tray/ControlTray";
import { MicrophonePermission } from "./components/microphone-permission/MicrophonePermission";
import { OnboardingPage } from "./components/microphone-permission/OnboardingPage";
import { ExtensionMessages, ExtensionMessage } from "./components/microphone-permission/messages";
import { useMediaPermissions } from "./hooks/use-media-permissions";
import { ConnectionCalibration } from "./components/connection-calibration/ConnectionCalibration";
import { ConnectionError } from "./components/connection-error/ConnectionError";
import { useAppConnection } from "./hooks/use-app-connection";
import { useLiveAPIContext } from "./contexts/LiveAPIContext";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Returns true when the page was opened with ?onboarding=true */
function isOnboardingPage(): boolean {
  return (
    new URLSearchParams(window.location.search).get("onboarding") === "true"
  );
}

// ---------------------------------------------------------------------------
// MainApp — the normal Side Panel UI
// ---------------------------------------------------------------------------

function MainApp() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { permissionStatus, requestMediaAccess } = useMediaPermissions();
  const [showConsole, setShowConsole] = useState(false);

  const { connectionMode, apiOptions, retryConnection } = useAppConnection(permissionStatus);

  /**
   * Probes for existing microphone permissions without showing a visible UI
   * element if permission is already granted. This is necessary because Chrome
   * Extensions (Side Panels) cannot prompt for permissions directly and must
   * coordinate with a standard browser tab.
   */
  const probe = useCallback(() => {
    requestMediaAccess().then((stream) => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    });
  }, [requestMediaAccess]);

  // Probe on mount to detect if the side panel already has mic access.
  useEffect(() => { probe(); }, [probe]);

  // Listen for a success message from the onboarding tab and re-probe.
  useEffect(() => {
    const listener = (message: ExtensionMessage) => {
      if (message.type === ExtensionMessages.MIC_PERMISSION_GRANTED) {
        probe();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [probe]);

  // Developer shortcut to toggle the side console (Ctrl+Shift+L)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setShowConsole(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleEnableMicrophone = () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL("index.html?onboarding=true"),
    });
  };

  if (connectionMode === "Checking...") {
    return <ConnectionCalibration mode={connectionMode} />;
  }

  if (permissionStatus === "denied") {
    return <MicrophonePermission onEnableMicrophone={handleEnableMicrophone} />;
  }

  return (
    <div className="App">
      <LiveAPIProvider options={apiOptions}>
        <ConnectionManager retryConnection={retryConnection} showConsole={showConsole} videoRef={videoRef} />
      </LiveAPIProvider>
    </div>
  );
}

/**
 * Sub-component to safely use LiveAPIContext inside the Provider
 */
function ConnectionManager({
  retryConnection,
  showConsole,
  videoRef
}: {
  retryConnection: () => void,
  showConsole: boolean,
  videoRef: React.RefObject<HTMLVideoElement>
}) {
  const { error } = useLiveAPIContext();

  if (error) {
    return <ConnectionError errorMessage={error.message} />;
  }

  return (
    <div className="streaming-console">
      {showConsole && <SidePanel />}
      <main>
        <div className="main-app-area">
          {/* App UI background space (video stream moved to ControlTray) */}
        </div>
        <ControlTray
          videoRef={videoRef}
          supportsVideo={true}
          onVideoStreamChange={() => { }} // No longer using videoStream in App
          enableEditingSettings={true}
        />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root — routes between the onboarding tab and the normal Side Panel app
// ---------------------------------------------------------------------------

function App() {
  if (isOnboardingPage()) {
    return <OnboardingPage />;
  }
  return <MainApp />;
}

export default App;
