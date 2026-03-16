import React, { useEffect, useState } from "react";
import "./connection-calibration.scss";

interface ConnectionCalibrationProps {
  mode: "Checking..." | "Proxy" | "API Key";
}

export const ConnectionCalibration: React.FC<ConnectionCalibrationProps> = ({ mode }) => {
  const [status, setStatus] = useState("Initializing...");

  useEffect(() => {
    const statuses = [
      "Connecting...",
    ];
    let i = 0;
    const interval = setInterval(() => {
      setStatus(statuses[i % statuses.length]);
      i++;
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="connection-calibration">
      <div className="glitch-container">
        <h1 className="glitch-text" data-text="CONNECTING">CONNECTING</h1>
      </div>

      <div className="data-grid">
        <div className="grid-cell pulse-1"></div>
        <div className="grid-cell pulse-2"></div>
        <div className="grid-cell pulse-3"></div>
        <div className="grid-cell pulse-2"></div>
      </div>

      <div className="status-container">
        <div className="status-message">
          {status}
          <span className="cursor">_</span>
        </div>
      </div>

      <div className="loading-bar">
        <div className="loading-fill"></div>
      </div>

      <div className="background-noise"></div>
    </div>
  );
};
