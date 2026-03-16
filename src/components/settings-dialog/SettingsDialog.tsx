import { useState } from "react";
import "./settings-dialog.scss";
import VoiceSelector from "./VoiceSelector";
import LanguageSelector from "./LanguageSelector";

export default function SettingsDialog() {
  const [open, setOpen] = useState(false);

  return (
    <div className="settings-dialog">
      <button
        className="action-button material-symbols-outlined"
        onClick={() => setOpen(!open)}
      >
        settings
      </button>
      <dialog className="dialog" style={{ display: open ? "flex" : "none" }}>
        <button className="close-button material-symbols-outlined" onClick={() => setOpen(false)}>
          close
        </button>

        <div className="dialog-container">
          <h3>SETTINGS</h3>
          <div className="mode-selectors">
            <VoiceSelector />
            <LanguageSelector />
          </div>

          <div className="api-config section">
            <h3>API CONNECTION</h3>
            <div className="input-group">
              <label htmlFor="api-key">Gemini API Key</label>
              <div className="input-with-button">
                <input
                  id="api-key"
                  type="password"
                  placeholder="Paste your key here..."
                  defaultValue={localStorage.getItem("gemini_api_key") || ""}
                  onChange={(e) => {
                    localStorage.setItem("gemini_api_key", e.target.value);
                    // Dispatch storage event manually because localStorage.setItem doesn't 
                    // trigger it on the same window
                    window.dispatchEvent(new StorageEvent("storage", {
                      key: "gemini_api_key",
                      newValue: e.target.value
                    }));
                  }}
                />
              </div>
              <p className="helper-text">
                By default, this extension connects to our secure Vertex AI backend. You may optionally provide your own Google AI Studio API key above as a fallback if the default backend is unavailable.
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
          <div className="user-manual">
            <h3>USER MANUAL</h3>
            <p className="manual-intro">Master the agent with these voice commands:</p>

            <div className="manual-section">
              <h4>1. VISION &amp; PRESENCE</h4>
              <ul className="command-list">
                <li>
                  <span className="cmd-name">Look at me</span>
                  <span className="cmd-desc">Switches to webcam - the agent sees you and your surroundings.</span>
                </li>
                <li>
                  <span className="cmd-name">Look at my browser</span>
                  <span className="cmd-desc">Shares your active tab so the agent can read the page.</span>
                </li>
                <li>
                  <span className="cmd-name">Look at my desktop</span>
                  <span className="cmd-desc">Shares your entire screen for cross-app assistance.</span>
                </li>
                <li>
                  <span className="cmd-name">Stop looking</span>
                  <span className="cmd-desc">Stops all active video streams.</span>
                </li>
              </ul>
            </div>

            <div className="manual-section">
              <h4>2. EXPLAIN MODE</h4>
              <ul className="command-list">
                <li>
                  <span className="cmd-name">Turn on Explain Mode</span>
                  <span className="cmd-desc">Highlight any word or phrase - the agent instantly translates or explains it in your language.</span>
                </li>
                <li>
                  <span className="cmd-name">Turn off Explain Mode</span>
                  <span className="cmd-desc">Disables automatic text explanation.</span>
                </li>
                <li>
                  <span className="cmd-name">Change your language</span>
                  <span className="cmd-desc">Set your preferred language under <span className="highlight">EXPLAIN Target Language</span> in Settings.</span>
                </li>
              </ul>
            </div>

            <div className="manual-section">
              <h4>3. SMART LINKS</h4>
              <ul className="command-list">
                <li>
                  <span className="cmd-name">Turn on Smart Links</span>
                  <span className="cmd-desc">Overlays numbered tags on every clickable element for precise control.</span>
                </li>
                <li>
                  <span className="cmd-name">Click [number]</span>
                  <span className="cmd-desc">Clicks the tagged element with that number.</span>
                </li>
                <li>
                  <span className="cmd-name">Type "[text]" into [number]</span>
                  <span className="cmd-desc">Clicks the tagged input field and types the specified text.</span>
                </li>
              </ul>
            </div>

            <div className="manual-section">
              <h4>4. SMART SEARCH</h4>
              <ul className="command-list">
                <li><span className="cmd-name">Search for [query]</span><span className="cmd-desc">General web search on <span className="highlight">Google</span>.</span></li>
                <li><span className="cmd-name">Search YouTube for [query]</span><span className="cmd-desc">Finds videos on <span className="highlight">YouTube</span>.</span></li>
                <li><span className="cmd-name">Find [title] on Netflix</span><span className="cmd-desc">Searches <span className="highlight">Netflix</span> for a movie or show.</span></li>
                <li><span className="cmd-name">Play [song] on Spotify</span><span className="cmd-desc">Searches <span className="highlight">Spotify</span> for music.</span></li>
                <li><span className="cmd-name">Search Amazon for [product]</span><span className="cmd-desc">Finds products on <span className="highlight">Amazon</span>.</span></li>
                <li><span className="cmd-name">Search eBay for [item]</span><span className="cmd-desc">Finds listings on <span className="highlight">eBay</span>.</span></li>
                <li><span className="cmd-name">What is [topic]</span><span className="cmd-desc">Opens the <span className="highlight">Wikipedia</span> article for that topic.</span></li>
                <li><span className="cmd-name">Search Reddit for [topic]</span><span className="cmd-desc">Finds discussions on <span className="highlight">Reddit</span>.</span></li>
                <li><span className="cmd-name">Show me [place] on Maps</span><span className="cmd-desc">Opens <span className="highlight">Google Maps</span> for a location.</span></li>
              </ul>
            </div>

            <div className="manual-section">
              <h4>5. BROWSER CONTROL</h4>
              <ul className="command-list">
                <li><span className="cmd-name">Open [URL]</span><span className="cmd-desc">Navigate the current tab to any website.</span></li>
                <li><span className="cmd-name">Open a new tab</span><span className="cmd-desc">Opens a fresh browser tab.</span></li>
                <li><span className="cmd-name">Switch to [keyword] tab</span><span className="cmd-desc">Jumps to an open tab matching the keyword.</span></li>
                <li><span className="cmd-name">Close this tab</span><span className="cmd-desc">Closes the currently active tab.</span></li>
                <li><span className="cmd-name">Go back</span><span className="cmd-desc">Navigates to the previous page.</span></li>
                <li><span className="cmd-name">Scroll down / Scroll up</span><span className="cmd-desc">Scrolls the page by one viewport height.</span></li>
                <li><span className="cmd-name">Read my clipboard</span><span className="cmd-desc">Reads the text currently copied to your clipboard.</span></li>
              </ul>
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}
