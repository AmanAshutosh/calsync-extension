/**
 * CalSync Background Service Worker (MV3)
 * Handles: OAuth, Google Calendar API, message routing, caching
 */

"use strict";

const GCAL_API = "https://www.googleapis.com/calendar/v3";
const SCOPES = "https://www.googleapis.com/auth/calendar.events";

// ── Token Cache ────────────────────────────────────────────────────────────
let _cachedToken = null;
let _tokenExpiry = 0;

async function getAuthToken(interactive = false) {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiry) return _cachedToken;

  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive, scopes: [SCOPES] }, (token) => {
      const err = chrome.runtime.lastError;
      if (err || !token) {
        const msg = err?.message || "Auth failed";
        // Classify common failure modes for clearer popup feedback
        if (
          msg.includes("OAuth2 not granted") ||
          msg.includes("not signed in")
        ) {
          reject("NOT_SIGNED_IN");
        } else if (
          msg.includes("client_id") ||
          msg.includes("invalid_client")
        ) {
          reject("INVALID_CLIENT_ID");
        } else if (msg.includes("canceled") || msg.includes("cancelled")) {
          reject("USER_CANCELLED");
        } else {
          reject(msg);
        }
        return;
      }
      _cachedToken = token;
      _tokenExpiry = now + 55 * 60 * 1000;
      resolve(token);
    });
  });
}

function clearTokenCache() {
  _cachedToken = null;
  _tokenExpiry = 0;
}

// ── Google Calendar API ────────────────────────────────────────────────────
async function createCalendarEvent(token, event) {
  const body = buildEventBody(event);

  const res = await fetch(`${GCAL_API}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    // Token expired, clear cache and retry once
    clearTokenCache();
    chrome.identity.removeCachedAuthToken({ token }, () => {});
    throw new Error("TOKEN_EXPIRED");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }

  return res.json();
}

function buildEventBody(ev) {
  const dateStr = ev.date || new Date().toISOString().split("T")[0];

  // Parse time
  let start, end;
  if (ev.time) {
    const times = ev.time.match(
      /(\d{1,2}:\d{2}\s*(?:am|pm)?)\s*[-–]\s*(\d{1,2}:\d{2}\s*(?:am|pm)?)/i,
    );
    if (times) {
      start = {
        dateTime: buildDateTime(dateStr, times[1]),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      end = {
        dateTime: buildDateTime(dateStr, times[2]),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    } else {
      const t = parseTime(ev.time);
      start = {
        dateTime: `${dateStr}T${t}:00`,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      end = {
        dateTime: `${dateStr}T${addHour(t)}:00`,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    }
  } else {
    // All-day event
    start = { date: dateStr };
    end = { date: dateStr };
  }

  const body = {
    summary: ev.title,
    start,
    end,
    source: { title: "CalSync Extension", url: "https://github.com/calsync" },
  };

  if (ev.location) body.location = ev.location;
  if (ev.description) body.description = ev.description;

  return body;
}

function buildDateTime(dateStr, timeStr) {
  const t = parseTime(timeStr);
  return `${dateStr}T${t}:00`;
}

function parseTime(str) {
  str = str.trim().toLowerCase();
  const match = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return "09:00";

  let h = parseInt(match[1], 10);
  const m = match[2] ? match[2] : "00";
  const period = match[3];

  if (period === "pm" && h < 12) h += 12;
  if (period === "am" && h === 12) h = 0;

  return `${String(h).padStart(2, "0")}:${m}`;
}

function addHour(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ── Text Parsing ──────────────────────────────────────────────────────────
function parseTextToEvents(text) {
  const lines = text.split("\n").filter((l) => l.trim());
  const events = [];

  const DATE_RE =
    /\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i;
  const TIME_RE = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i;

  lines.forEach((line) => {
    const dateM = line.match(DATE_RE);
    const timeM = line.match(TIME_RE);

    let title = line
      .replace(DATE_RE, "")
      .replace(TIME_RE, "")
      .replace(/[|\t,;]+/g, " ")
      .trim();

    if (!title || title.length < 2) title = line.trim();

    if (title) {
      events.push({
        title,
        date: dateM ? dateM[0] : null,
        time: timeM ? timeM[0] : null,
        location: null,
      });
    }
  });

  return events;
}

// ── Duplicate Detection ───────────────────────────────────────────────────
async function checkDuplicates(token, events) {
  // Check calendar for events in same date range
  const dates = events
    .map((e) => e.date)
    .filter(Boolean)
    .sort();
  if (!dates.length) return events;

  const timeMin = dates[0] + "T00:00:00Z";
  const timeMax = dates[dates.length - 1] + "T23:59:59Z";

  try {
    const res = await fetch(
      `${GCAL_API}/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&maxResults=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) return events;
    const data = await res.json();
    const existingTitles = (data.items || []).map((e) =>
      e.summary?.toLowerCase().trim(),
    );

    return events.map((ev) => ({
      ...ev,
      warning: existingTitles.includes(ev.title?.toLowerCase().trim())
        ? "Possible duplicate in calendar"
        : ev.warning,
    }));
  } catch (_) {
    return events;
  }
}

// ── Message Router ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "GET_AUTH_STATE": {
        try {
          await getAuthToken(false);
          sendResponse({ connected: true });
        } catch (_) {
          sendResponse({ connected: false });
        }
        break;
      }

      case "AUTH_START": {
        try {
          await getAuthToken(true);
          sendResponse({ success: true });
        } catch (e) {
          console.error("[CalSync] AUTH_START failed:", e);
          sendResponse({ success: false, error: e });
        }
        break;
      }

      case "AUTH_DISCONNECT": {
        if (_cachedToken) {
          chrome.identity.removeCachedAuthToken(
            { token: _cachedToken },
            () => {},
          );
        }
        clearTokenCache();
        sendResponse({ success: true });
        break;
      }

      case "IMPORT_EVENTS": {
        try {
          let token = await getAuthToken(false);
          const results = [];

          for (const event of msg.events) {
            try {
              await createCalendarEvent(token, event);
              results.push({ success: true, title: event.title });
            } catch (e) {
              if (e.message === "TOKEN_EXPIRED") {
                // Retry with fresh token
                token = await getAuthToken(true);
                try {
                  await createCalendarEvent(token, event);
                  results.push({ success: true, title: event.title });
                } catch (e2) {
                  results.push({
                    success: false,
                    title: event.title,
                    error: e2.message,
                  });
                }
              } else {
                results.push({
                  success: false,
                  title: event.title,
                  error: e.message,
                });
              }
            }
          }

          const successCount = results.filter((r) => r.success).length;
          sendResponse({
            success: successCount > 0,
            count: successCount,
            results,
          });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
        break;
      }

      case "PARSE_TEXT": {
        const events = parseTextToEvents(msg.text);
        sendResponse({ events });
        break;
      }

      case "CHECK_DUPLICATES": {
        try {
          const token = await getAuthToken(false);
          const events = await checkDuplicates(token, msg.events);
          sendResponse({ events });
        } catch (_) {
          sendResponse({ events: msg.events });
        }
        break;
      }

      case "OPEN_POPUP": {
        chrome.action.openPopup?.().catch(() => {});
        sendResponse({ ok: true });
        break;
      }

      default:
        sendResponse({ error: "Unknown message type" });
    }
  })();

  return true; // Keep async channel open
});

// ── Install Handler ────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    chrome.storage.local.set({ installed: Date.now(), version: "1.0.0" });
  }
});
