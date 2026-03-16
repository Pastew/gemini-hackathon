/**
 * background.js - GemiNav AI Service Worker
 *
 * Handles Chrome extension messaging and routes DOM actions to the active tab
 * by injecting the executeAction function from dom-effects.js.
 *
 * Runs as an ES-module service worker (see manifest.json "type": "module").
 */

import { executeAction } from "./dom-effects.js";

// ── Constants (mirrored from src/lib/constants.ts — cannot import across boundary) ──
const EXT_MSG_GET_TAB_SCREENSHOT = "GET_TAB_SCREENSHOT";
const EXT_MSG_HIGHLIGHT_ELEMENT = "HIGHLIGHT_ELEMENT";
const EXT_MSG_CLICK_ELEMENT = "CLICK_ELEMENT";
const EXT_MSG_TYPE_TEXT = "TYPE_TEXT";
const EXT_MSG_GO_BACK = "GO_BACK";
const EXT_MSG_SCROLL_DOWN = "SCROLL_DOWN";
const EXT_MSG_SCROLL_UP = "SCROLL_UP";
const EXT_MSG_OPEN_TAB = "OPEN_TAB";
const EXT_MSG_SWITCH_TAB = "SWITCH_TAB";
const EXT_MSG_CLOSE_TAB = "CLOSE_TAB";
const EXT_MSG_GET_CLIPBOARD = "GET_CLIPBOARD";
const EXT_MSG_TRANSLATOR_TOGGLE = "TRANSLATOR_TOGGLE";
const EXT_MSG_TEXT_SELECTED = "TEXT_SELECTED";
const EXT_MSG_TOGGLE_SMART_LINKS = "TOGGLE_SMART_LINKS";
const EXT_MSG_CLICK_SMART_LINK = "CLICK_SMART_LINK";
const EXT_ERR_RESTRICTED_PAGE = "RESTRICTED_PAGE";

// ── Setup ────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// ── Persistent Side Panel Connection ──────────────────────────────────────────
// Detect when the side panel is closed by listening for port disconnects.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "sidepanel") {
    console.log("[WebNavigator] Side panel connected.");

    port.onDisconnect.addListener(() => {
      // ONLY disarm if the port name matches. We check this to be safe.
      if (port.name === "sidepanel") {
        console.log("[WebNavigator] Side panel closed — disarming features.");
        smartLinksActive = false;
        translatorActive = false;

        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (tab?.id) {
            updateSmartLinksOnTab(tab.id);
            removeTranslatorListener(tab.id);
          }
        });
      }
    });
  }
});


// ── Content script injection ─────────────────────────────────────────────────

/**
 * Injects executeAction into the active tab and passes scriptArgs via args.
 * Uses the `func` approach so Chrome correctly forwards the args array.
 */
async function runContentScript(scriptArgs) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return { success: false, error: "No active tab" };

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: executeAction,  // serialized & injected into page context
      args: [scriptArgs],   // passed as first argument to executeAction
    });
    return results?.[0]?.result ?? { success: false, error: "No result" };
  } catch (err) {
    console.warn("[WebNavigator] executeScript failed:", err.message);
    return { success: false, error: err.message };
  }
}

// ── Message router ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // Screenshot
  if (request.type === EXT_MSG_GET_TAB_SCREENSHOT) {
    chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 40 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.warn("Capture failed:", chrome.runtime.lastError.message);
        sendResponse({ error: EXT_ERR_RESTRICTED_PAGE });
      } else {
        sendResponse(dataUrl);
      }
    });
    return true;
  }

  // Highlight element
  if (request.type === EXT_MSG_HIGHLIGHT_ELEMENT) {
    runContentScript({ action: "highlight", x: request.x, y: request.y }).then(sendResponse);
    return true;
  }

  // Click element
  if (request.type === EXT_MSG_CLICK_ELEMENT) {
    runContentScript({ action: "click", x: request.x, y: request.y }).then(sendResponse);
    return true;
  }

  // Type text
  if (request.type === EXT_MSG_TYPE_TEXT) {
    runContentScript({ action: "type", x: request.x, y: request.y, text: request.text }).then(sendResponse);
    return true;
  }

  // Go back
  if (request.type === EXT_MSG_GO_BACK) {
    runContentScript({ action: "go_back" }).then(sendResponse);
    return true;
  }

  // Scroll down
  if (request.type === EXT_MSG_SCROLL_DOWN) {
    runContentScript({ action: "scroll_down" }).then(sendResponse);
    return true;
  }

  // Scroll up
  if (request.type === EXT_MSG_SCROLL_UP) {
    runContentScript({ action: "scroll_up" }).then(sendResponse);
    return true;
  }

  // Open new tab
  if (request.type === EXT_MSG_OPEN_TAB) {
    chrome.tabs.create({ url: request.url }, (tab) => {
      sendResponse({ success: true, tabId: tab.id, url: request.url });
    });
    return true;
  }

  // Close current tab
  if (request.type === EXT_MSG_CLOSE_TAB) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab && tab.id) {
        chrome.tabs.remove(tab.id, () => sendResponse({ success: true }));
      } else {
        sendResponse({ success: false, error: "No active tab" });
      }
    });
    return true;
  }

  // Switch to tab by keyword
  if (request.type === EXT_MSG_SWITCH_TAB) {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const kw = (request.keyword || "").toLowerCase();
      const found = tabs.find(
        (t) => (t.title || "").toLowerCase().includes(kw) || (t.url || "").toLowerCase().includes(kw)
      );
      if (found && found.id) {
        chrome.tabs.update(found.id, { active: true }, () => {
          sendResponse({ success: true, title: found.title, url: found.url });
        });
      } else {
        sendResponse({ success: false, error: `No tab matching "${request.keyword}"` });
      }
    });
    return true;
  }

  // Get clipboard content (must run in page context — SW can't access Clipboard API)
  if (request.type === EXT_MSG_GET_CLIPBOARD) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab || !tab.id) {
        sendResponse({ success: false, error: "No active tab" });
        return;
      }
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          func: () => navigator.clipboard.readText(),
        },
        (results) => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ success: true, clipboardText: results?.[0]?.result ?? "" });
          }
        }
      );
    });
    return true;
  }

  // ── Translator Mode: Toggle selection listener on/off ───────────────────────
  if (request.type === EXT_MSG_TRANSLATOR_TOGGLE) {
    translatorActive = !!request.enable;

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) {
        if (translatorActive) {
          injectTranslatorListener(tab.id);
        } else {
          removeTranslatorListener(tab.id);
        }
      }
    });
    sendResponse({ success: true, enabled: translatorActive });
    return true;
  }

  // ── Smart Links Mode: Toggle ────────────────────────────────────────────────
  if (request.type === EXT_MSG_TOGGLE_SMART_LINKS) {
    smartLinksActive = !!request.enable;

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) updateSmartLinksOnTab(tab.id);
    });
    sendResponse({ success: true, enabled: smartLinksActive });
    return true;
  }

  // Click Smart Link
  if (request.type === EXT_MSG_CLICK_SMART_LINK) {
    runContentScript({ action: "click_smart_link", labelId: request.labelId }).then(sendResponse);
    return true;
  }
});

// ── Translator Mode: state & injection ──────────────────────────────────────────

let translatorActive = false;

/** Inject the debounced selection listener into a given tab. */
function injectTranslatorListener(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Clean up any previous listener first
      if (typeof window.__translatorCleanup === "function") {
        window.__translatorCleanup();
      }

      let debounceTimer = null;
      const handler = () => {
        clearTimeout(debounceTimer);
        // Small debounce to ensure the selection is fully registered by the browser after mouseup
        debounceTimer = setTimeout(() => {
          const text = window.getSelection()?.toString().trim();
          if (text && text.length > 5) {
            chrome.runtime.sendMessage({ type: "TEXT_SELECTED", text });
          }
        }, 100);
      };

      document.addEventListener("mouseup", handler);
      window.__translatorCleanup = () => {
        document.removeEventListener("mouseup", handler);
        clearTimeout(debounceTimer);
        window.__translatorCleanup = null;
      };
    },
  }).catch(() => { /* restricted page — ignore */ });
}

/** Explicitly remove the selection listener from a tab. */
function removeTranslatorListener(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      if (typeof window.__translatorCleanup === "function") {
        window.__translatorCleanup();
      }
    },
  }).catch(() => { /* restricted page — ignore */ });
}

// ── Global Tab Listeners ─────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (translatorActive) injectTranslatorListener(tabId);
  if (smartLinksActive) updateSmartLinksOnTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") {
    if (translatorActive) injectTranslatorListener(tabId);
    if (smartLinksActive) updateSmartLinksOnTab(tabId);
  }
});

// ── Smart Links Mode: state & injection ──────────────────────────────────────────

let smartLinksActive = false;

function updateSmartLinksOnTab(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: executeAction,
    args: [{ action: smartLinksActive ? "show_smart_links" : "hide_smart_links" }],
  }).catch(() => { /* restricted page — ignore */ });
}

