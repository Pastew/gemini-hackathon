import React from "react";
import "./MicrophonePermission.scss";

type Props = {
    onEnableMicrophone: () => void;
};

/**
 * Shown in the Side Panel when Chrome suppresses the microphone/camera
 * permission prompt (NotAllowedError / PermissionDismissed).
 *
 * Clicking "Enable Access" opens the extension in a full tab where
 * Chrome allows the permission dialogs.
 */
export function MicrophonePermission({ onEnableMicrophone }: Props) {
    return (
        <div className="mic-permission-overlay">
            <div className="mic-permission-card">
                <div className="mic-permission-icon" aria-hidden="true">
                    🎙️📷
                </div>
                <h1 className="mic-permission-title">Permissions Required</h1>
                <p className="mic-permission-body">
                    The assistant needs access to your <strong>microphone</strong> and{" "}
                    <strong>camera</strong> to protect you.
                    <br />
                    <br />
                    Your browser does not allow these permission prompts inside the Side
                    Panel. Tap the button below to open a setup page where you can grant
                    access — it only takes a few seconds.
                </p>
                <button
                    className="mic-permission-button"
                    onClick={onEnableMicrophone}
                    aria-label="Enable microphone and camera access"
                >
                    Enable Microphone &amp; Camera
                </button>
            </div>
        </div>
    );
}

export default MicrophonePermission;
