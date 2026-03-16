/**
 * dom-effects.js
 *
 * GemiNav AI - DOM Action & Visual Effects
 *
 * This module exports `executeAction`, a self-contained function that is
 * serialized by Chrome and injected into the active tab via
 * chrome.scripting.executeScript({ func: executeAction, args: [scriptArgs] }).
 *
 * IMPORTANT: executeAction MUST remain self-contained — no closures over
 * module-level variables, no imports inside it. Everything it needs must live
 * inside the function body, because Chrome serializes it as plain text.
 *
 * Actions (passed as the `args` object):
 *   { action: "highlight", x, y }   — HUD corner-bracket overlay with scan line
 *   { action: "click",     x, y }   — ripple + particle burst, then DOM click
 *   { action: "type",      x, y, text } — click field, insert text natively
 *
 * Coordinate system: x and y are on a 0–1000 normalised scale.
 */

export function executeAction(args) {

    // ─────────────────────────────────────────────────────────────────────────
    // Shared utilities
    // ─────────────────────────────────────────────────────────────────────────

    function normToPixel(normX, normY) {
        var result = {
            px: Math.round((normX / 1000) * window.innerWidth),
            py: Math.round((normY / 1000) * window.innerHeight),
        };
        console.log(
            "[normToPixel] INPUT norm(" + normX + ", " + normY + ")" +
            " | window(" + window.innerWidth + "×" + window.innerHeight + ")" +
            " | OUTPUT px(" + result.px + ", " + result.py + ")"
        );
        return result;
    }

    function elementAt(px, py) {
        return document.elementFromPoint(px, py);
    }

    /** Injects the shared CSS animations once per page load. */
    function ensureStyles() {
        if (document.getElementById("__wn_styles_v2__")) return;
        var old = document.getElementById("__wn_styles__");
        if (old) old.remove();
        var style = document.createElement("style");
        style.id = "__wn_styles_v2__";
        style.textContent = [
            // Highlight: reversed ripple rings converge inward
            "@keyframes __wn_implode__ {",
            "  0%   { transform:translate(-50%,-50%) scale(3.5); opacity:0; }",
            "  20%  { opacity:0.45; }",
            "  80%  { opacity:0.2; }",
            "  100% { transform:translate(-50%,-50%) scale(0.1); opacity:0; }",
            "}",
            // Highlight: center glow pulses through Gemini palette
            "@keyframes __wn_gem_pulse__ {",
            "  0%   { box-shadow:0 0 0 0 rgba(66,133,244,0.9),  0 0 20px 6px rgba(66,133,244,0.5); }",
            "  33%  { box-shadow:0 0 0 6px rgba(170,70,187,0),  0 0 28px 10px rgba(170,70,187,0.6); }",
            "  66%  { box-shadow:0 0 0 6px rgba(52,168,83,0),   0 0 28px 10px rgba(52,168,83,0.6); }",
            "  100% { box-shadow:0 0 0 0 rgba(66,133,244,0.9),  0 0 20px 6px rgba(66,133,244,0.5); }",
            "}",
            // Click ripple — Gemini blue
            "@keyframes __wn_ring__ {",
            "  0%   { transform:translate(-50%,-50%) scale(0); opacity:0.95; }",
            "  100% { transform:translate(-50%,-50%) scale(1); opacity:0; }",
            "}",
            // Cursor tap: quick press
            "@keyframes __wn_tap__ {",
            "  0%   { transform: scale(1); }",
            "  30%  { transform: scale(0.82); }",
            "  60%  { transform: scale(1.08); }",
            "  100% { transform: scale(1); }",
            "}",
            // Smart Links tags
            ".wn-smart-link-tag {",
            "  position: absolute;",
            "  background-color: #FFEB3B;",
            "  color: black;",
            "  border: 1px solid black;",
            "  border-radius: 3px;",
            "  padding: 1px 4px;",
            "  font-size: 10px;",
            "  font-family: sans-serif;",
            "  font-weight: bold;",
            "  z-index: 2147483647;",
            "  pointer-events: none;",
            "  box-shadow: 0 2px 4px rgba(0,0,0,0.3);",
            "}",
        ].join("");
        document.head.appendChild(style);
    }

    // ── Ghost cursor SVG ─────────────────────────────────────────────────────
    // Returns or creates the persistent ghost cursor element.
    function getGhostCursor() {
        var existing = document.getElementById("__wn_cursor__");
        if (existing) return existing;

        var el = document.createElement("div");
        el.id = "__wn_cursor__";
        el.innerHTML = [
            '<svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">',
            '  <defs>',
            '    <linearGradient id="cgrad" x1="0" y1="0" x2="1" y2="1">',
            '      <stop offset="0%" stop-color="#4285F4"/>',
            '      <stop offset="50%" stop-color="#AA46BB"/>',
            '      <stop offset="100%" stop-color="#34A853"/>',
            '    </linearGradient>',
            '    <filter id="cshadow" x="-30%" y="-30%" width="160%" height="160%">',
            '      <feDropShadow dx="1" dy="2" stdDeviation="2.5" flood-color="rgba(66,133,244,0.5)"/>',
            '    </filter>',
            '  </defs>',
            '  <g filter="url(#cshadow)">',
            '    <path d="M6 4L22 16L14 17L18 24L15 25.5L11 18.5L6 23V4Z" fill="url(#cgrad)" stroke="rgba(255,255,255,0.6)" stroke-width="0.8" stroke-linejoin="round"/>',
            '  </g>',
            '</svg>',
        ].join("");
        Object.assign(el.style, {
            position: "fixed",
            pointerEvents: "none",
            zIndex: "2147483647",
            transform: "translate(0, 0)",
            transition: "none",
            opacity: "0",
        });
        document.body.appendChild(el);
        return el;
    }

    // Smoothly move the ghost cursor from (fromX, fromY) to (toX, toY)
    // over `durationMs`, then call onDone.
    function animateCursor(cursor, fromX, fromY, toX, toY, durationMs, onDone) {
        cursor.style.transition = "none";
        cursor.style.opacity = "1";
        cursor.style.left = fromX + "px";
        cursor.style.top = fromY + "px";

        // Force paint before starting animation
        cursor.getBoundingClientRect();

        cursor.style.transition = "left " + durationMs + "ms cubic-bezier(0.25,0.1,0.25,1), " +
            "top " + durationMs + "ms cubic-bezier(0.25,0.1,0.25,1)";
        cursor.style.left = toX + "px";
        cursor.style.top = toY + "px";

        setTimeout(function () {
            cursor.style.transition = "none";
            if (onDone) onDone();
        }, durationMs);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Action: highlight — Gemini-style reversed ripple
    // Three rings implode inward, center pulses through Gemini colors
    // ─────────────────────────────────────────────────────────────────────────

    function highlight(x, y) {
        ensureStyles();
        var old = document.getElementById("__wn_highlight__");
        if (old) old.remove();

        var coords = normToPixel(x, y);
        var px = coords.px;
        var py = coords.py;

        var wrap = document.createElement("div");
        wrap.id = "__wn_highlight__";
        Object.assign(wrap.style, {
            position: "fixed",
            left: px + "px",
            top: py + "px",
            width: "0",
            height: "0",
            zIndex: "2147483647",
            pointerEvents: "none",
        });

        // Three imploding rings with staggered delays and Gemini colors
        var rings = [
            { size: "80px", color: "#4285F4", delay: "0s" },
            { size: "52px", color: "#AA46BB", delay: "0.22s" },
            { size: "30px", color: "#34A853", delay: "0.44s" },
        ];
        rings.forEach(function (r) {
            var ring = document.createElement("div");
            Object.assign(ring.style, {
                position: "absolute",
                width: r.size, height: r.size,
                borderRadius: "50%",
                border: "1.5px solid " + r.color,
                boxShadow: "0 0 6px 1px " + r.color,
                // 'both' applies first keyframe during delay so rings are
                // invisible before their individual animation starts
                animation: "__wn_implode__ 1.5s " + r.delay + " cubic-bezier(0.3,0,0.7,1) both",
            });
            wrap.appendChild(ring);
        });

        // Central glow dot that pulses through Gemini palette
        var center = document.createElement("div");
        Object.assign(center.style, {
            position: "absolute",
            width: "10px", height: "10px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #4285F4, #AA46BB, #34A853)",
            transform: "translate(-50%, -50%)",
            animation: "__wn_gem_pulse__ 1.2s 0.3s ease-in-out forwards",
        });
        wrap.appendChild(center);

        document.body.appendChild(wrap);
        setTimeout(function () {
            wrap.style.transition = "opacity 0.4s ease";
            wrap.style.opacity = "0";
        }, 2400);
        setTimeout(function () { if (wrap.parentNode) wrap.remove(); }, 2900);
        return { success: true };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Action: click — cursor slides to target, taps, then DOM click fires
    // ─────────────────────────────────────────────────────────────────────────

    function showClickEffect(px, py) {
        ensureStyles();
        var absX = window.scrollX + px;
        var absY = window.scrollY + py;

        function mk(styles) {
            var d = document.createElement("div");
            Object.assign(d.style, {
                position: "absolute",
                left: absX + "px",
                top: absY + "px",
                pointerEvents: "none",
                zIndex: "2147483646",
            }, styles);
            document.body.appendChild(d);
            return d;
        }

        // Gemini-colored click rings: blue outer, purple inner
        // Pre-apply translate(-50%,-50%) so rings are centered before the first keyframe paints
        var ring1 = mk({ width: "64px", height: "64px", borderRadius: "50%", border: "2px solid #4285F4", boxShadow: "0 0 12px 3px #4285F4", transform: "translate(-50%,-50%)", opacity: "0.9", animation: "__wn_ring__ 0.55s cubic-bezier(0.2,0.8,0.4,1) both" });
        var ring2 = mk({ width: "32px", height: "32px", borderRadius: "50%", border: "1.5px solid #AA46BB", boxShadow: "0 0 8px 2px #AA46BB", transform: "translate(-50%,-50%)", opacity: "0.85", animation: "__wn_ring__ 0.42s 0.07s cubic-bezier(0.2,0.8,0.4,1) both" });

        setTimeout(function () {
            [ring1, ring2].forEach(function (e) { if (e.parentNode) e.remove(); });
        }, 700);
    }

    function click(x, y) {
        ensureStyles();
        var coords = normToPixel(x, y);
        var px = coords.px;
        var py = coords.py;

        var cursor = getGhostCursor();
        var startX = window.innerWidth + 30;
        var startY = py;
        var TRAVEL_MS = 500;

        animateCursor(cursor, startX, startY, px, py, TRAVEL_MS, function () {
            // Tap animation on the cursor itself
            cursor.style.animation = "__wn_tap__ 0.25s ease forwards";

            // Wait for tap animation to fully complete (250ms) before clearing
            setTimeout(function () {
                cursor.style.animation = "";

                // Show ripple at the click point
                showClickEffect(px, py);

                // Fire the actual DOM click
                var el = elementAt(px, py);
                if (el) {
                    try {
                        el.focus();
                        ["mousedown", "mouseup", "click"].forEach(function (type) {
                            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: px, clientY: py }));
                        });
                    } catch (e) { /* ignore */ }
                }

                // Fade out cursor
                setTimeout(function () {
                    cursor.style.transition = "opacity 0.3s ease";
                    cursor.style.opacity = "0";
                }, 300);

            }, 300);
        });

        var el = elementAt(px, py);
        if (!el) return { success: false, error: "No element at coordinates" };
        return { success: true, element: el.tagName };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Action: type
    // ─────────────────────────────────────────────────────────────────────────

    function typeText(x, y, text) {
        var clickResult = click(x, y);
        if (!clickResult.success) return clickResult;
        var coords = normToPixel(x, y);
        var el = elementAt(coords.px, coords.py);
        if (!el) return { success: false, error: "No element found" };
        try {
            if (typeof el.value !== "undefined") {
                var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")
                    || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
                if (desc && desc.set) {
                    desc.set.call(el, (el.value || "") + text);
                } else {
                    el.value = (el.value || "") + text;
                }
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
            } else {
                document.execCommand("insertText", false, text);
            }
        } catch (e) { return { success: false, error: String(e) }; }
        return { success: true, typed: text };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Action: Smart Links (Precision Mode)
    // ─────────────────────────────────────────────────────────────────────────

    function showSmartLinks() {
        hideSmartLinks(); // clear any existing
        ensureStyles();

        // Find all clickable elements
        var selectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';
        var els = Array.from(document.querySelectorAll(selectors));

        window.__wn_smart_links = {};

        var wrap = document.createElement("div");
        wrap.id = "__wn_smart_links_wrap__";
        // To not interfere with page layout, make absolute wrap
        Object.assign(wrap.style, {
            position: "absolute",
            top: "0", left: "0", width: "100%", height: "100%",
            pointerEvents: "none", zIndex: "2147483647"
        });

        // Filter out invisible elements
        var visibleCount = 0;
        els.forEach(function (el) {
            var rect = el.getBoundingClientRect();
            if (rect.width > 2 && rect.height > 2) {
                var style = window.getComputedStyle(el);
                if (style.visibility !== 'hidden' && style.opacity !== '0') {
                    visibleCount++;
                    var labelId = visibleCount;
                    window.__wn_smart_links[labelId] = el;

                    var absX = window.scrollX + rect.left;
                    var absY = window.scrollY + rect.top;

                    var tag = document.createElement("div");
                    tag.className = "wn-smart-link-tag";
                    // position tag at top-left of the element
                    tag.style.left = absX + "px";
                    tag.style.top = absY + "px";
                    tag.textContent = labelId;

                    wrap.appendChild(tag);
                }
            }
        });

        document.body.appendChild(wrap);
        return { success: true };
    }

    function hideSmartLinks() {
        var wrap = document.getElementById("__wn_smart_links_wrap__");
        if (wrap) wrap.remove();
        window.__wn_smart_links = {};
        return { success: true };
    }

    function clickSmartLink(labelId) {
        if (!window.__wn_smart_links || !window.__wn_smart_links[labelId]) {
            return { success: false, error: "No Smart Link found for ID: " + labelId };
        }
        var el = window.__wn_smart_links[labelId];

        var rect = el.getBoundingClientRect();
        var centerPx = Math.round(rect.left + rect.width / 2);
        var centerPy = Math.round(rect.top + rect.height / 2);

        // Convert to normalized 0-1000 for the gaze animation
        var x = Math.round((centerPx / window.innerWidth) * 1000);
        var y = Math.round((centerPy / window.innerHeight) * 1000);

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // wait an instant for scroll to possibly finish/start, then click
        setTimeout(function () {
            // Re-calculate in case scroll moved it (for the visual effect only)
            var r2 = el.getBoundingClientRect();
            var cp2x = Math.round(r2.left + r2.width / 2);
            var cp2y = Math.round(r2.top + r2.height / 2);

            var cursor = getGhostCursor();
            var startX = window.innerWidth + 30;
            var startY = cp2y;
            var TRAVEL_MS = 500;

            animateCursor(cursor, startX, startY, cp2x, cp2y, TRAVEL_MS, function () {
                cursor.style.animation = "__wn_tap__ 0.25s ease forwards";

                setTimeout(function () {
                    cursor.style.animation = "";
                    showClickEffect(cp2x, cp2y);

                    try {
                        el.focus();
                        ["mousedown", "mouseup", "click"].forEach(function (type) {
                            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: cp2x, clientY: cp2y }));
                        });
                    } catch (e) { /* ignore */ }

                    setTimeout(function () {
                        cursor.style.transition = "opacity 0.3s ease";
                        cursor.style.opacity = "0";
                    }, 300);
                }, 300);
            });
        }, 100);

        return { success: true, element: el.tagName, x: x, y: y };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Dispatch
    // ─────────────────────────────────────────────────────────────────────────

    if (args.action === "highlight") return highlight(args.x, args.y);
    if (args.action === "click") return click(args.x, args.y);
    if (args.action === "type") return typeText(args.x, args.y, args.text);
    if (args.action === "go_back") { window.history.back(); return { success: true }; }
    if (args.action === "scroll_down") { window.scrollBy({ top: window.innerHeight * 0.8, behavior: "smooth" }); return { success: true }; }
    if (args.action === "scroll_up") { window.scrollBy({ top: -window.innerHeight * 0.8, behavior: "smooth" }); return { success: true }; }
    if (args.action === "show_smart_links") return showSmartLinks();
    if (args.action === "hide_smart_links") return hideSmartLinks();
    if (args.action === "click_smart_link") return clickSmartLink(args.labelId);
    return { success: false, error: "Unknown action: " + args.action };
}
