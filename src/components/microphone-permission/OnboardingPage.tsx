import React, { useEffect, useState } from "react";
import { ExtensionMessages } from "./messages";

type Status = "pending" | "granted" | "error";

const styles: Record<string, React.CSSProperties> = {
    container: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        textAlign: "center",
        padding: "2rem",
        background: "#0f0f1a",
        color: "#ffffff",
        fontFamily: "sans-serif",
    },
    icon: { fontSize: "4rem", marginBottom: "1.5rem" },
    heading: { fontSize: "2rem", fontWeight: 700, marginBottom: "1rem" },
    body: { fontSize: "1.15rem", color: "#c8ccd4", maxWidth: 480, lineHeight: 1.6 },
};

const CONTENT: Record<Status, { icon: string; heading: string; body: string }> = {
    pending: {
        icon: "🎙️📷",
        heading: "Setting Up Microphone & Camera…",
        body: "Please allow microphone and camera access in the prompts that just appeared.",
    },
    granted: {
        icon: "✅",
        heading: "Access Granted!",
        body: "Success! You can close this tab and open the Side Panel now. The assistant is ready to help you.",
    },
    error: {
        icon: "⚠️",
        heading: "Permission Not Granted",
        body: "Microphone or camera access was blocked. Please check your browser settings and try again.",
    },
};

/**
 * Rendered in a full Chrome tab (index.html?onboarding=true) where the
 * browser allows the permission prompts that are suppressed inside the Side Panel.
 *
 * Requests both audio AND video. On success broadcasts a chrome.runtime
 * message so any open Side Panel can refresh its permission state automatically.
 */
export function OnboardingPage() {
    const [status, setStatus] = useState<Status>("pending");

    useEffect(() => {
        navigator.mediaDevices
            .getUserMedia({ audio: true, video: true })
            .then((stream) => {
                stream.getTracks().forEach((t) => t.stop());
                chrome.runtime.sendMessage({ type: ExtensionMessages.MIC_PERMISSION_GRANTED });
                setStatus("granted");
            })
            .catch((err) => {
                console.error("[Onboarding] Media access denied:", err);
                setStatus("error");
            });
    }, []);

    const { icon, heading, body } = CONTENT[status];

    return (
        <div style={styles.container}>
            <div style={styles.icon}>{icon}</div>
            <h1 style={styles.heading}>{heading}</h1>
            <p style={styles.body}>{body}</p>
        </div>
    );
}
