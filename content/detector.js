/**
 * CalSync Content Script — Table Detection + Floating Button
 * Runs at document_idle, lightweight, no framework
 */

(() => {
  "use strict";

  // ── Constants ──────────────────────────────────────────────────────────
  const MONTH_NAMES = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
  const DATE_PATTERNS = [
    /\b\d{4}[\/\-]\d{2}[\/\-]\d{2}\b/,
    /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/,
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}\b/i,
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/i,
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i,
    /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i,
    /\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /\b(?:today|tomorrow|next\s+\w+)\b/i,
  ];

  const TIME_PATTERNS = [
    /\b\d{1,2}:\d{2}\s*(?:am|pm)?\b/i,
    /\b\d{1,2}(?:am|pm)\b/i,
    /\b(?:\d{1,2}:\d{2})\s*[-–]\s*(?:\d{1,2}:\d{2})\b/,
  ];

  const MONTHS = {
    jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
  };

  // ── Page-level state ───────────────────────────────────────────────────
  let _pageBtn  = null;   // single button for the whole page
  let _scanning = false;  // re-entry lock so MutationObserver can't overlap
  const _eventMap = new Map(); // title|date → event object

  function accumulateEvents(events) {
    let changed = false;
    for (const ev of events) {
      const k = eventKey(ev);
      if (!_eventMap.has(k)) { _eventMap.set(k, ev); changed = true; }
    }
    return changed;
  }

  function getAllEvents() { return [..._eventMap.values()]; }

  // ── Helpers ────────────────────────────────────────────────────────────
  function eventKey(ev) {
    return `${(ev.title || "").toLowerCase().trim()}|${ev.date || ""}`;
  }

  function hasDatePattern(text) {
    return DATE_PATTERNS.some(p => p.test(text));
  }

  // ── Source Detection ───────────────────────────────────────────────────
  function detectSource() {
    const host = location.hostname;
    if (host.includes("notion"))        return { name: "Notion",       color: "#000000", type: "notion"  };
    if (host.includes("docs.google"))   return { name: "Google Docs",  color: "#4285f4", type: "gdocs"   };
    if (host.includes("sheets.google")) return { name: "Google Sheets",color: "#0f9d58", type: "gsheets" };
    return { name: location.hostname, color: "#6366f1", type: "generic" };
  }

  // ── Table Finders ──────────────────────────────────────────────────────
  function findTables() {
    const { type } = detectSource();
    if (type === "notion")  return findNotionTables();
    if (type === "gdocs")   return findGDocsTables();
    if (type === "gsheets") return findSheetsTables();
    return findGenericTables();
  }

  function findNotionTables() {
    const candidates = [
      ...document.querySelectorAll('[class*="notion-table"]'),
      ...document.querySelectorAll('[class*="collection-view"]'),
      ...document.querySelectorAll('[class*="collection_view"]'),
      ...document.querySelectorAll("table"),
    ];
    const uniq = [...new Set(candidates)].filter(isScheduleTable);

    if (uniq.length === 0) {
      const content =
        document.querySelector('[class*="notion-page-content"]') ||
        document.querySelector('[class*="page-body"]') ||
        document.querySelector("main");
      if (content && isScheduleTable(content)) return [content];
    }

    console.log(`[CalSync] Notion tables visible: ${uniq.length}`);
    return uniq;
  }

  function findGDocsTables() {
    return [...document.querySelectorAll("table")].filter(isScheduleTable);
  }

  function findSheetsTables() {
    const grid = document.querySelector("#waffle-grid-container, .grid-container");
    return grid ? [grid] : [];
  }

  function findGenericTables() {
    const htmlTables = [...document.querySelectorAll("table")].filter(isScheduleTable);
    if (htmlTables.length) return htmlTables;
    return findDivGrids();
  }

  function findDivGrids() {
    const found = [];
    for (const el of document.querySelectorAll("div, section, article, ul, ol")) {
      const children = [...el.children];
      if (children.length < 3 || children.length > 500) continue;
      const tag = children[0]?.tagName;
      if (!tag || !children.every(c => c.tagName === tag)) continue;
      if (children.filter(c => hasDatePattern(c.textContent)).length >= 2) found.push(el);
    }
    console.log(`[CalSync] Div grids: ${found.length}`);
    return found;
  }

  // ── Schedule Heuristics ───────────────────────────────────────────────
  function isScheduleTable(el) {
    const text = el.innerText || el.textContent || "";
    return DATE_PATTERNS.some(p => p.test(text)) && text.length > 20;
  }

  // ── Table Parsing ─────────────────────────────────────────────────────
  function parseTable(tableEl) {
    const rows = extractRows(tableEl);
    if (!rows.length) return [];

    const isHeader = rows[0].some(c =>
      /^(date|day|event|title|name|time|venue|location|description|when|schedule|activity|programme|program|subject|topic)$/i.test(c.trim())
    );
    const headers  = isHeader ? rows[0].map(h => h.toLowerCase().trim()) : [];
    const dataRows = isHeader ? rows.slice(1) : rows;
    const colMap   = detectColumns(headers);

    const events = [];
    for (const row of dataRows) {
      if (row.every(c => !c.trim())) continue;
      const ev = extractEvent(row, colMap);
      if (ev) events.push(ev);
    }

    console.log(`[CalSync] parseTable: ${rows.length} rows → ${events.length} events`);
    return events;
  }

  function extractRows(tableEl) {
    if (tableEl.tagName === "TABLE") {
      return [...tableEl.querySelectorAll("tr")].map(tr =>
        [...tr.querySelectorAll("td, th")].map(td => td.innerText?.trim() || "")
      );
    }

    const rowSels = [
      '[class*="row"]:not([class*="row-"]):not([class*="-row"])',
      '[class*="tr"]', "tr", "li",
    ];
    for (const sel of rowSels) {
      const rows = [...tableEl.querySelectorAll(sel)];
      if (rows.length < 2) continue;
      const parsed = rows.map(row => {
        const cells = row.querySelectorAll('[class*="cell"], [class*="td"], td, th');
        return cells.length
          ? [...cells].map(c => c.innerText?.trim() || "")
          : [row.innerText?.trim() || ""];
      }).filter(r => r.some(c => c.trim()));
      if (parsed.length) return parsed;
    }

    return [...tableEl.children]
      .filter(c => c.innerText?.trim())
      .map(c => [c.innerText.trim()]);
  }

  function detectColumns(headers) {
    const map = { title:-1, date:-1, time:-1, location:-1, description:-1 };
    headers.forEach((h, i) => {
      if      (/title|event|name|task|meeting|session|activity|programme|subject|topic/i.test(h)) map.title    = i;
      else if (/date|day|when|schedule|start|from|dated/i.test(h))                               map.date      = i;
      else if (/time|hour|duration|slot/i.test(h))                                               map.time      = i;
      else if (/location|place|venue|room|where|city|address/i.test(h))                          map.location  = i;
      else if (/desc|detail|note|agenda|remark/i.test(h))                                        map.description = i;
    });
    return map;
  }

  function extractEvent(row, colMap) {
    const get = idx => (idx >= 0 && idx < row.length ? row[idx] : "");

    let title    = colMap.title    >= 0 ? get(colMap.title)    : "";
    let dateStr  = colMap.date     >= 0 ? get(colMap.date)     : "";
    let timeStr  = colMap.time     >= 0 ? get(colMap.time)     : "";
    let location = colMap.location >= 0 ? get(colMap.location) : "";

    if (!title) {
      title = row.find(c =>
        c && c.length >= 2 &&
        !DATE_PATTERNS.some(p => p.test(c)) &&
        !TIME_PATTERNS.some(p => p.test(c))
      ) || row[0] || "";
    }
    if (!title.trim()) return null;

    if (!dateStr) {
      outer: for (const c of row)
        for (const p of DATE_PATTERNS) { const m = c.match(p); if (m) { dateStr = m[0]; break outer; } }
    }
    if (!timeStr) {
      outer: for (const c of row)
        for (const p of TIME_PATTERNS) { const m = c.match(p); if (m) { timeStr = m[0]; break outer; } }
    }

    const parsedDate = parseDate(dateStr);
    const ev = {
      title:    title.trim().slice(0, 200),
      date:     parsedDate,
      rawDate:  dateStr.trim() || null,
      time:     timeStr.trim() || null,
      location: location.trim() || null,
      raw:      row.join(" | "),
    };

    if (!parsedDate && dateStr)  ev.warning = "Date format unrecognized";
    if (!parsedDate && !dateStr) ev.warning = "No date found";
    if (!ev.title || ev.title.length < 2) ev.error = "Title too short";

    return ev;
  }

  // ── Date Parser ────────────────────────────────────────────────────────
  function guessYear(month, day) {
    const now  = new Date();
    const cand = new Date(now.getFullYear(), month - 1, day);
    return cand < now ? now.getFullYear() + 1 : now.getFullYear();
  }

  function parseDate(str) {
    if (!str) return null;
    const c = str.trim().replace(/(\d+)(?:st|nd|rd|th)/gi, "$1").trim();
    let m;

    m = c.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;

    m = c.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (m) {
      let y = parseInt(m[3], 10);
      if (y < 100) y += y >= 50 ? 1900 : 2000;
      return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
    }

    m = c.match(new RegExp(`^(\\d{1,2})\\s+(${MONTH_NAMES})[a-z]*\\.?\\s+(\\d{4})$`, "i"));
    if (m) { const mo = MONTHS[m[2].toLowerCase().slice(0,3)]; if (mo) return `${m[3]}-${String(mo).padStart(2,"0")}-${m[1].padStart(2,"0")}`; }

    m = c.match(new RegExp(`^(${MONTH_NAMES})[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})$`, "i"));
    if (m) { const mo = MONTHS[m[1].toLowerCase().slice(0,3)]; if (mo) return `${m[3]}-${String(mo).padStart(2,"0")}-${m[2].padStart(2,"0")}`; }

    m = c.match(new RegExp(`^[a-z]+,?\\s+(\\d{1,2})\\s+(${MONTH_NAMES})[a-z]*\\.?\\s+(\\d{4})$`, "i"));
    if (m) { const mo = MONTHS[m[2].toLowerCase().slice(0,3)]; if (mo) return `${m[3]}-${String(mo).padStart(2,"0")}-${m[1].padStart(2,"0")}`; }

    m = c.match(new RegExp(`^[a-z]+,?\\s+(\\d{1,2})\\s+(${MONTH_NAMES})[a-z]*$`, "i"));
    if (m) { const mo = MONTHS[m[2].toLowerCase().slice(0,3)]; if (mo) { const y = guessYear(mo, parseInt(m[1],10)); return `${y}-${String(mo).padStart(2,"0")}-${m[1].padStart(2,"0")}`; } }

    m = c.match(new RegExp(`^(${MONTH_NAMES})[a-z]*\\.?\\s+(\\d{1,2})$`, "i"));
    if (m) { const mo = MONTHS[m[1].toLowerCase().slice(0,3)]; if (mo) { const y = guessYear(mo, parseInt(m[2],10)); return `${y}-${String(mo).padStart(2,"0")}-${m[2].padStart(2,"0")}`; } }

    m = c.match(new RegExp(`^(\\d{1,2})\\s+(${MONTH_NAMES})[a-z]*$`, "i"));
    if (m) { const mo = MONTHS[m[2].toLowerCase().slice(0,3)]; if (mo) { const y = guessYear(mo, parseInt(m[1],10)); return `${y}-${String(mo).padStart(2,"0")}-${m[1].padStart(2,"0")}`; } }

    try { const d = new Date(c); if (!isNaN(d.getTime()) && d.getFullYear() > 1970) return d.toISOString().split("T")[0]; } catch (_) {}
    return null;
  }

  // ── Full-page Text Fallback ────────────────────────────────────────────
  function scanPageText() {
    const FULL_DATE_RE = new RegExp(
      `(?:\\d{1,2}(?:st|nd|rd|th)?\\s+)?(?:${MONTH_NAMES})[a-z]*\\.?\\s+(?:\\d{1,2}(?:,\\s*)?)?\\d{4}` +
      `|\\d{1,2}[\\/\\-\\.]\\d{1,2}[\\/\\-\\.]\\d{2,4}` +
      `|\\d{4}[\\/\\-]\\d{2}[\\/\\-]\\d{2}`,
      "gi"
    );
    const lines = (document.body.innerText || "")
      .split(/\n+/).map(l => l.trim()).filter(l => l.length > 5);
    const events = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const dates = [...line.matchAll(FULL_DATE_RE)].map(m => m[0]);
      if (!dates.length) continue;

      let title = line.replace(FULL_DATE_RE, "").replace(/[|\t,;:]+/g, " ").replace(/\s+/g, " ").trim();
      if (!title || title.length < 3) {
        const prev = i > 0               ? lines[i-1].replace(FULL_DATE_RE,"").trim() : "";
        const next = i < lines.length-1  ? lines[i+1].replace(FULL_DATE_RE,"").trim() : "";
        title = prev || next || line;
      }
      if (!title || title.length < 2) continue;

      for (const ds of dates) {
        const d = parseDate(ds);
        if (d) events.push({ title: title.slice(0,200), date: d, rawDate: ds, time: null, location: null, raw: line });
      }
    }

    // Deduplicate within text-scan results before returning
    const seen = new Map();
    for (const ev of events) {
      const k = eventKey(ev);
      if (!seen.has(k)) seen.set(k, ev);
    }
    return [...seen.values()];
  }

  // ── Single page-level floating button ─────────────────────────────────
  // Only ONE button lives on the page — fixed bottom-right corner.
  // Count badge updates live as Notion scrolls and reveals more rows.
  function ensurePageButton() {
    const events = getAllEvents();
    if (!events.length) return;

    // Guard: Notion may have removed our button during a full re-render
    if (_pageBtn && !_pageBtn.isConnected) _pageBtn = null;

    if (_pageBtn) {
      const badge = _pageBtn.querySelector(".calsync-count");
      if (badge) badge.textContent = events.length;
      return;
    }

    const btn = document.createElement("div");
    btn.className = "calsync-float-btn";
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <path d="M16 2v4M8 2v4M3 10h18"/>
      </svg>
      <span>Import to Calendar</span>
      <span class="calsync-count">${events.length}</span>
    `;

    // Fixed bottom-right — no per-element positioning, no overflow
    Object.assign(btn.style, {
      position: "fixed",
      bottom:   "24px",
      right:    "24px",
      zIndex:   "2147483647",
    });

    btn.addEventListener("click", e => {
      e.stopPropagation();
      chrome.storage.session.set({ pendingEvents: getAllEvents(), pendingSource: detectSource() });
      chrome.runtime.sendMessage({ type: "OPEN_POPUP" });
    });

    document.body.appendChild(btn);
    _pageBtn = btn;
  }

  // ── Main Scan ──────────────────────────────────────────────────────────
  function scan() {
    // Re-entry guard: MutationObserver fires when we append the button,
    // which would recursively trigger another scan before this one ends.
    if (_scanning) return { events: getAllEvents(), source: detectSource() };
    _scanning = true;

    try {
      const tables = findTables();
      let fresh = [];
      tables.forEach(t => fresh.push(...parseTable(t)));

      // Pass 3: full-page text fallback when structured parsing yields nothing
      if (!fresh.length && !tables.length) {
        console.log("[CalSync] No tables — trying text scan");
        fresh = scanPageText();
      }

      const changed = accumulateEvents(fresh);
      if (changed) ensurePageButton();

      const all = getAllEvents();
      console.log(`[CalSync] Scan: ${tables.length} tables, ${fresh.length} new, ${all.length} total`);
      return { events: all, source: detectSource() };
    } finally {
      _scanning = false;
    }
  }

  // ── Message Listener ───────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "SCAN") {
      sendResponse(scan());
      return true;
    }
  });

  // ── Bootstrap ─────────────────────────────────────────────────────────
  if (document.readyState === "complete") scan();
  else window.addEventListener("load", scan);

  // Re-scan as user scrolls and SPA frameworks load new content.
  // For Notion this catches each newly rendered table row.
  const observer = new MutationObserver(() => {
    clearTimeout(observer._t);
    observer._t = setTimeout(scan, 700);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
