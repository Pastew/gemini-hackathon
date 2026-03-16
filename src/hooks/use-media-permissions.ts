import { useState, useCallback } from "react";

export type MediaPermissionStatus = "unknown" | "granted" | "denied";

export type UseMediaPermissionsResult = {
    permissionStatus: MediaPermissionStatus;
    /** Probe both microphone and camera. Stops the stream immediately if granted. */
    requestMediaAccess: () => Promise<MediaStream | null>;
};

/**
 * Probes navigator.mediaDevices.getUserMedia for BOTH audio and video and
 * tracks whether access was granted or denied.
 *
 * In Chrome's Side Panel the permission prompt is suppressed and the call
 * throws a `NotAllowedError`. This hook surfaces that as `permissionStatus === 'denied'`
 * so the UI can show a recovery flow.
 */
export function useMediaPermissions(): UseMediaPermissionsResult {
    const [permissionStatus, setPermissionStatus] =
        useState<MediaPermissionStatus>("unknown");

    const requestMediaAccess = useCallback(async (): Promise<MediaStream | null> => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true,
            });
            setPermissionStatus("granted");
            return stream;
        } catch (err: any) {
            const isPermissionError =
                err?.name === "NotAllowedError" ||
                err?.name === "PermissionDeniedError" ||
                String(err?.message).toLowerCase().includes("permission");

            if (isPermissionError) {
                console.warn("[useMediaPermissions] Media access denied:", err);
                setPermissionStatus("denied");
            } else {
                console.error("[useMediaPermissions] Unexpected error:", err);
                throw err;
            }
            return null;
        }
    }, []);

    return { permissionStatus, requestMediaAccess };
}
