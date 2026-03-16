import React, { useState } from "react";
import "./connection-error.scss";

interface ConnectionErrorProps {
  errorMessage: string;
}

export const ConnectionError: React.FC<ConnectionErrorProps> = ({ errorMessage }) => {
  const [apiKey, setApiKey] = useState(localStorage.getItem("gemini_api_key") || "");

  const handleUpdateKey = () => {
    localStorage.setItem("gemini_api_key", apiKey);
    // Dispatch storage event manually 
    window.dispatchEvent(new StorageEvent("storage", {
      key: "gemini_api_key",
      newValue: apiKey
    }));
  };

  return (
    <div className="connection-error">
      <div className="error-card">
        <div className="error-header">
          <span className="material-symbols-outlined icon">hub</span>
          <h2>Connection Failed</h2>
        </div>

        <div className="error-body">
          <p className="error-message">
            {errorMessage || "Unable to reach the Vertex AI gateway."}
          </p>

          <div className="input-group">
            <label htmlFor="error-api-key">API Key Fallback</label>
            <input
              id="error-api-key"
              type="password"
              placeholder="Enter Google AI Studio key..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <button className="retry-button" onClick={handleUpdateKey}>
            Reconnect
          </button>
        </div>

        <div className="error-footer">
          <p className="helper-text">
            Generate a free Google AI Studio key {" "}
            <a
              href="https://aistudio.google.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="neon-link"
            >
              here↗
            </a>.
          </p>
        </div>
      </div>
      <div className="noise-overlay"></div>
    </div>
  );
};
