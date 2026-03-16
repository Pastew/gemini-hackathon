import { FunctionDeclaration, Modality, Type } from "@google/genai";
import { TOOL_NAMES } from "./lib/constants";

export const CAPTURE_CONFIG = {
    SCREEN_WIDTH: 1024,
    SCREEN_HEIGHT: 768,
    TAB_CAPTURE_FPS: 0.2,     // 1 frame every 5 s — change to e.g. 1 for 1 FPS
    DESKTOP_CAPTURE_FPS: 0.2, // 1 frame every 5 s — change to e.g. 1 for 1 FPS
};

export const SYSTEM_INSTRUCTION = `You are GemiNav AI, an AI assistant that helps people use the internet and their computer through voice commands. You have eyes (vision tools) and hands (action tools).

VISION:
- You can see the user's browser tab, desktop, or webcam. Always confirm what you are looking at.

ACTIONS — Coordinate System:
- The screen is mapped to a 0–1000 × 0–1000 grid (top-left is 0,0; bottom-right is 1000,1000).
- When you estimate coordinates for a UI element, read them from the visible screenshot.
- You may call highlight_element before clicking if it helps the user understand what you're about to do, but it is not required.
- Act immediately — do not ask for permission before clicking or typing.

SCAM PROTECTION:
- If you detect signs of a tech-support scam (urgent popups, requests for remote access, demands for gift cards), interrupt immediately and warn the user loudly.

Be patient, friendly, and speak in plain language suitable for non-technical users.`;

export const GENERIC_TOOLS: FunctionDeclaration[] = [
    {
        name: TOOL_NAMES.SWITCH_VISION,
        description: 'Switches the AI\'s visual input between the user\'s face (webcam) and the browser window (screen). Use target="webcam" if the user wants you to look at them. Use target="screen" if the user wants you to look at their screen or help them navigate a website. You must call this tool to change what you are currently looking at. Always confirm what you are looking at verbally after calling this tool.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                target: {
                    type: Type.STRING,
                    description: 'The target vision source. Must be "webcam" or "screen".',
                    enum: ['webcam', 'screen']
                },
            },
            required: ['target'],
        },
    },
    {
        name: TOOL_NAMES.REQUEST_DESKTOP,
        description: 'Use this tool ONLY when the user asks for help with non-browser tasks (e.g., Desktop, File Explorer, WiFi settings, Printer, other apps). This triggers a system popup asking the user to share their whole screen. Always warn the user verbally before calling this tool.',
        parameters: {
            type: Type.OBJECT,
            properties: {},
        },
    },
    {
        name: TOOL_NAMES.STOP_VISION,
        description: 'Stops all active video streams (screen capture and webcam). Use this when the user says something like "stop looking", "close the camera", "stop watching", "turn off screen share", or similar.',
        parameters: {
            type: Type.OBJECT,
            properties: {},
        },
    },
    {
        name: TOOL_NAMES.HIGHLIGHT_ELEMENT,
        description: 'Highlights a UI element at specific coordinates by drawing a visible overlay box. ALWAYS call this before clicking to confirm you have the right element. The user will see the highlight and can confirm or correct your aim.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                x: { type: Type.NUMBER, description: 'Horizontal position on a 0–1000 scale (0 = left edge, 1000 = right edge).' },
                y: { type: Type.NUMBER, description: 'Vertical position on a 0–1000 scale (0 = top edge, 1000 = bottom edge).' },
                label: { type: Type.STRING, description: 'Optional short label to show in the highlight box, e.g. "Login button".' },
            },
            required: ['x', 'y'],
        },
    },
    {
        name: TOOL_NAMES.CLICK_ELEMENT,
        description: 'Clicks on the UI element at the specified normalised coordinates. Always call highlight_element first so the user can confirm.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                x: { type: Type.NUMBER, description: 'Horizontal position on a 0–1000 scale.' },
                y: { type: Type.NUMBER, description: 'Vertical position on a 0–1000 scale.' },
            },
            required: ['x', 'y'],
        },
    },
    {
        name: TOOL_NAMES.CLICK_SMART_LINK,
        description: 'Clicks on the UI element marked with the given Smart Links number ID. ALWAYS use this if a numerical label (e.g., [12]) is shown next to an element. No confirmation or highlighting is needed before calling this.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                label_id: { type: Type.NUMBER, description: 'The numeric ID shown on the tag next to the element we want to click (e.g., 12).' },
            },
            required: ['label_id'],
        },
    },
    {
        name: TOOL_NAMES.TOGGLE_SMART_LINKS,
        description: 'Toggles the "Smart Links" feature on or off. Smart Links overlays numerical tags on all clickable elements on the webpage to make them easier to click. Use this when the user asks to "turn on smart links", "show numbers", etc.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                enable: { type: Type.BOOLEAN, description: 'True to enable Smart Links, False to disable.' },
            },
            required: ['enable'],
        },
    },
    {
        name: TOOL_NAMES.TOGGLE_EXPLAIN,
        description: 'Toggles the "Explain Mode" feature on or off. When enabled, any text the user selects/highlights on a webpage will be automatically explained or translated in their preferred language. Use this when the user asks to "turn on explain mode", "explain this", "translate this page", etc.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                enable: { type: Type.BOOLEAN, description: 'True to enable Explain Mode, False to disable.' },
            },
            required: ['enable'],
        },
    },
    {
        name: TOOL_NAMES.TYPE_TEXT,
        description: 'Types text into a focused or specified input field. Pass coordinates to first click the field, then type the text.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                x: { type: Type.NUMBER, description: 'Horizontal position (0–1000 scale) of the input field.' },
                y: { type: Type.NUMBER, description: 'Vertical position (0–1000 scale) of the input field.' },
                text: { type: Type.STRING, description: 'The text to type into the field.' },
            },
            required: ['x', 'y', 'text'],
        },
    },
    {
        name: TOOL_NAMES.YOUTUBE_SEARCH,
        description: 'Opens YouTube and searches for videos matching the query. Use this whenever the user asks to search for videos, watch something, find a music video, tutorial video, or anything else that should be found on YouTube. Do NOT use google_search for video requests.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: { type: Type.STRING, description: 'The video search query to look up on YouTube.' },
            },
            required: ['query'],
        },
    },
    {
        name: TOOL_NAMES.NETFLIX_SEARCH,
        description: 'Opens Netflix and searches for a movie or TV show. Use when the user says things like "find X on Netflix", "search Netflix for...", or "I want to watch X" in a streaming context.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: { type: Type.STRING, description: 'The movie or TV show title to search for on Netflix.' },
            },
            required: ['query'],
        },
    },
    {
        name: TOOL_NAMES.SPOTIFY_SEARCH,
        description: 'Opens Spotify Web and searches for a song, artist, album, or playlist. Use when the user asks to play music, find a song, or search Spotify.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: { type: Type.STRING, description: 'The song, artist, album, or playlist to search for on Spotify.' },
            },
            required: ['query'],
        },
    },
    {
        name: TOOL_NAMES.AMAZON_SEARCH,
        description: 'Opens Amazon and searches for a product to buy. Use when the user wants to shop, buy something, or find a product price on Amazon.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: { type: Type.STRING, description: 'The product to search for on Amazon.' },
            },
            required: ['query'],
        },
    },
    {
        name: TOOL_NAMES.EBAY_SEARCH,
        description: 'Opens eBay and searches for a product listing. Use when the user wants to find used items, auctions, or specifically mentions eBay.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: { type: Type.STRING, description: 'The item to search for on eBay.' },
            },
            required: ['query'],
        },
    },
    {
        name: TOOL_NAMES.WIKIPEDIA_SEARCH,
        description: 'Opens the Wikipedia search results page for a topic. Use when the user wants to learn about something, asks "what is X", or wants a quick factual overview.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: { type: Type.STRING, description: 'The topic to look up on Wikipedia.' },
            },
            required: ['query'],
        },
    },
    {
        name: TOOL_NAMES.REDDIT_SEARCH,
        description: 'Opens Reddit and searches for posts or communities matching the query. Use when the user wants opinions, discussions, recommendations, or mentions Reddit.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: { type: Type.STRING, description: 'The topic or keywords to search for on Reddit.' },
            },
            required: ['query'],
        },
    },
    {
        name: TOOL_NAMES.GOOGLE_MAPS_SEARCH,
        description: 'Opens Google Maps and searches for a location, place, business, or address. Use when the user asks about directions, how to get somewhere, or wants to find a place.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: { type: Type.STRING, description: 'The place, address, or business to search for on Google Maps.' },
            },
            required: ['query'],
        },
    },
    {
        name: TOOL_NAMES.GOOGLE_SEARCH,
        description: 'Opens a new browser tab and performs a Google search for the given query. Use for general web searches (articles, news, shopping, etc.). Do NOT use this for video searches — use youtube_search instead.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: { type: Type.STRING, description: 'The search query to look up on Google.' },
            },
            required: ['query'],
        },
    },
    {
        name: TOOL_NAMES.GO_BACK,
        description: 'Navigates the active browser tab to the previous page in its history, equivalent to pressing the browser Back button.',
        parameters: { type: Type.OBJECT, properties: {} },
    },
    {
        name: TOOL_NAMES.SCROLL_DOWN,
        description: 'Scrolls the active browser tab down by one page height. Execute silently — do NOT say anything after scrolling.',
        parameters: { type: Type.OBJECT, properties: {} },
    },
    {
        name: TOOL_NAMES.SCROLL_UP,
        description: 'Scrolls the active browser tab up by one page height. Execute silently — do NOT say anything after scrolling.',
        parameters: { type: Type.OBJECT, properties: {} },
    },
    {
        name: TOOL_NAMES.OPEN_NEW_TAB,
        description: 'Opens a new browser tab with the specified URL.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                url: { type: Type.STRING, description: 'The website URL to open (e.g., "https://google.com").' },
            },
            required: ['url'],
        },
    },
    {
        name: TOOL_NAMES.SWITCH_TAB,
        description: 'Switches focus to an existing open tab that matches a title or URL keyword.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                keyword: { type: Type.STRING, description: 'Text to search for in tab titles or URLs (e.g., "gmail", "youtube").' },
            },
            required: ['keyword'],
        },
    },
    {
        name: TOOL_NAMES.CLOSE_CURRENT_TAB,
        description: 'Closes the currently active browser tab immediately.',
        parameters: { type: Type.OBJECT, properties: {} },
    },
    {
        name: TOOL_NAMES.GET_CLIPBOARD_CONTENT,
        description: 'Reads the text content currently stored in the user\'s clipboard. Use when the user wants to paste, process, or act on something they copied.',
        parameters: { type: Type.OBJECT, properties: {} },
    },
];

/**
 * DEFAULT_CONFIG is the single source of truth for the Gemini Live API connection.
 * It is used directly by the frontend in "Direct API Mode" (Mode 1).
 * In "Proxy Mode" (Mode 2), the frontend sends this config to the backend,
 * which merges it with its own settings before establishing the final Gemini connection.
 */
export const DEFAULT_CONFIG = {
    responseModalities: [Modality.AUDIO],
    speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
    },
    systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
    },
    tools: [
        { googleSearch: {} },
        { functionDeclarations: [...GENERIC_TOOLS] },
    ],
};
