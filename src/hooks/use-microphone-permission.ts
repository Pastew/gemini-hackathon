import { useState, useCallback } from "react";

export type MicPermissionStatus = "unknown" | "granted" | "denied";

export type UseMicrophonePermissionResult = {
    permissionStatus: MicPermissionStatus;
    /** Attempt to get microphone access. Resolves with the stream on success. */
    requestMicrophoneAccess: () => Promise<MediaStream | null>;
};

/**
 * Hook that wraps navigator.mediaDevices.getUserMedia({ audio: true })
 * and tracks whether the user has granted or denied microphone access.
 *
 * In Chrome's Side Panel, the permission prompt is suppressed and the call
 * throws a `NotAllowedError`. This hook surfaces that as `permissionStatus === 'denied'`
 * so the UI can show a recovery flow.
 */
export function useMicrophonePermission(): UseMicrophonePermissionResult {
    const [permissionStatus, setPermissionStatus] =
        useState<MicPermissionStatus>("unknown");

    const requestMicrophoneAccess = useCallback(async (): Promise<MediaStream | null> => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setPermissionStatus("granted");
            return stream;
        } catch (err: any) {
            const isPermissionError =
                err?.name === "NotAllowedError" ||
                err?.name === "PermissionDeniedError" ||
                // Some browsers surface this as a message rather than a name
                String(err?.message).toLowerCase().includes("permission");

            if (isPermissionError) {
                console.warn("[useMicrophonePermission] Microphone access denied:", err);
                setPermissionStatus("denied");
            } else {
                // Re-throw unexpected errors (e.g. device not found)
                console.error("[useMicrophonePermission] Unexpected error:", err);
                throw err;
            }
            return null;
        }
    }, []);

    return { permissionStatus, requestMicrophoneAccess };
}
