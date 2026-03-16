import { useState, useEffect, useCallback } from "react"; 
import { LiveClientOptions } from "../types";
const PROXY_URL = process.env.REACT_APP_PROXY_URL;
const DEFAULT_API_KEY = process.env.REACT_APP_GEMINI_API_KEY || "AIzaSyCu2ktRvo2ZovaOHM2BaDNU0S2AtwHpb8U";

export function useAppConnection(permissionStatus: string) {
  const [apiOptions, setApiOptions] = useState<LiveClientOptions>(() => {
    const userKey = localStorage.getItem("gemini_api_key") || DEFAULT_API_KEY;
    return { apiKey: userKey };
  });
  const [connectionMode, setConnectionMode] = useState<"Checking..." | "Proxy" | "API Key">("Checking...");
  const checkProxyAndSetOptions = useCallback(async () => {
    const userApiKey = localStorage.getItem("gemini_api_key") || DEFAULT_API_KEY;
    console.log("[Connection] Initiating health check...");

    if (!PROXY_URL) {
      // Note: The original instruction's console.log message included 'options' which is not defined in this scope.
      // Assuming the intent was to log the fallback to API Key mode when no proxy is available.
      console.log(`[LiveAPI] Attempting connection via Direct API Key (no PROXY_URL defined)...`);
      setApiOptions({ apiKey: userApiKey });
      setConnectionMode("API Key");
      return;
    }

    try {
      console.log(`[Connection] Probing proxy at: ${PROXY_URL}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      // Use the dedicated health check endpoint which doesn't have origin checks
      const healthUrl = PROXY_URL.replace("/api/ws", "/api/health").replace("wss://", "https://").replace("ws://", "http://");
      
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal
      }).catch(() => (null));

      clearTimeout(timeoutId);

      if (response && response.ok) {
        console.log("[Connection] Proxy health check SUCCESS. Using Vertex/Proxy mode.");
        setApiOptions({ proxyUrl: PROXY_URL });
        setConnectionMode("Proxy");
      } else {
        throw new Error(`Proxy unreachable (Status: ${response?.status})`);
      }
    } catch (err) {
      console.warn(`[Connection] Proxy health check FAILED: ${err instanceof Error ? err.message : String(err)}`);
      console.log("[Connection] Falling back to direct Gemini API key mode.");
      setApiOptions({ apiKey: userApiKey });
      setConnectionMode("API Key");
    }
  }, []);

  useEffect(() => {
    // Initial check
    checkProxyAndSetOptions();

    // Listen for manual key updates from the settings or error UI
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "gemini_api_key") {
        checkProxyAndSetOptions();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [checkProxyAndSetOptions]);

  // Ensure default key is set if missing
  useEffect(() => {
    if (!localStorage.getItem("gemini_api_key")) {
      localStorage.setItem("gemini_api_key", DEFAULT_API_KEY);
    }
  }, []);

  return {
    connectionMode,
    apiOptions,
    retryConnection: checkProxyAndSetOptions,
  };
}
