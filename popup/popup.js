/**
 * CalSync Popup — Vanilla JS, no framework, < 300ms target
 */

// ── State ─────────────────────────────────────────────────────────────────
const state = {
  phase: "loading", // loading | ready | empty | error | success
  events: [],
  selected: new Set(),
  authConnected: false,
  authError: null,
  importError: null,
  _pendingImport: false,
  source: null,
  importedCount: 0,
};

// ── DOM ───────────────────────────────────────────────────────────────────
const root = document.getElementById("root");

function render() {
  root.innerHTML = "";
  root.appendChild(buildHeader());

  const content = el("div", { class: "content" });

  switch (state.phase) {
    case "loading":
      content.appendChild(buildLoading());
      break;
    case "empty":
      content.appendChild(buildEmpty());
      break;
    case "error":
      content.appendChild(buildError());
      break;
    case "success":
      content.appendChild(buildSuccess());
      break;
    case "ready":
      content.appendChild(buildEventList());
      break;
  }

  root.appendChild(content);

  if (state.phase === "ready") {
    root.appendChild(buildFooter());
  }
}

// ── Header ────────────────────────────────────────────────────────────────
function buildHeader() {
  const header = el("div", { class: "header" });

  const logo = el("div", { class: "logo" });
  logo.innerHTML = `<svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM9 11H7v2h2zm4 0h-2v2h2zm4 0h-2v2h2zm-8 4H7v2h2zm4 0h-2v2h2z"/></svg>`;

  const headerText = el("div", { class: "header-text" });
  headerText.innerHTML = `<h1>CalSync</h1><p>Schedule detector</p>`;

  const authBtn = el("button", {
    class: `auth-btn${state.authConnected ? " connected" : ""}`,
  });
  authBtn.textContent = state.authConnected ? "● Connected" : "Connect";
  authBtn.addEventListener("click", () => {
    state.authError = null; // clear previous error on retry
    handleAuth();
  });

  header.append(logo, headerText, authBtn);

  if (state.authError) {
    const errBar = el("div", { class: "auth-error-bar" });
    errBar.textContent = state.authError;
    // auth-error-bar sits below the header row, inside the header container
    const wrap = el("div", { style: "display:flex;flex-direction:column;width:100%" });
    const row  = el("div", { style: "display:flex;align-items:center;gap:10px" });
    row.append(logo, headerText, authBtn);
    wrap.append(row, errBar);
    // Replace children with wrapped version
    header.innerHTML = "";
    header.appendChild(wrap);
  }

  return header;
}

// ── Loading ───────────────────────────────────────────────────────────────
function buildLoading() {
  const wrap = el("div", { class: "state-loading" });
  wrap.innerHTML = `
    <div class="state-icon"><div class="spinner"></div></div>
    <p class="state-title">Scanning page…</p>
    <p class="state-subtitle">Detecting schedule tables</p>
  `;
  return wrap;
}

// ── Empty ─────────────────────────────────────────────────────────────────
function buildEmpty() {
  const wrap = el("div", { class: "state-empty" });
  wrap.innerHTML = `
    <div class="state-icon">
      <svg width="22" height="22" fill="none" stroke="var(--text-muted)" stroke-width="1.5" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="18" rx="3"/>
        <path d="M16 2v4M8 2v4M3 10h18"/>
      </svg>
    </div>
    <p class="state-title">No schedule found</p>
    <p class="state-subtitle">Navigate to a page with a schedule table, or paste data below</p>
  `;

  const paste = el("div", { class: "paste-zone" });
  paste.innerHTML = `<p><strong>Paste</strong> CSV or table data here</p>`;
  paste.addEventListener("click", () => handlePaste());
  wrap.appendChild(paste);

  return wrap;
}

// ── Error ─────────────────────────────────────────────────────────────────
function buildError() {
  const wrap = el("div", { class: "state-error" });

  const msg = state.importError
    ? state.importError
    : "Import failed. Make sure you are connected and the events have valid dates.";

  wrap.innerHTML = `
    <div class="state-icon">
      <svg width="22" height="22" fill="none" stroke="var(--danger)" stroke-width="1.5" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>
      </svg>
    </div>
    <p class="state-title">Import failed</p>
    <p class="state-subtitle">${msg}</p>
  `;

  const retry = el("button", { class: "source-rescan", style: "margin-top:12px" });
  retry.textContent = "← Try again";
  retry.addEventListener("click", () => {
    state.importError = null;
    state.phase = "ready";
    render();
  });
  wrap.appendChild(retry);

  return wrap;
}

// ── Event List ────────────────────────────────────────────────────────────
function buildEventList() {
  const wrap = el("div", { class: "events-list" });

  if (state.source) {
    const bar = el("div", { class: "source-bar" });
    bar.innerHTML = `
      <div class="source-icon" style="background:${state.source.color}"></div>
      <span class="source-name">${state.source.name}</span>
      <span class="source-count">${state.events.length} event${state.events.length !== 1 ? "s" : ""} detected</span>
    `;
    const rescan = el("button", { class: "source-rescan" });
    rescan.textContent = "Rescan";
    rescan.addEventListener("click", scanPage);
    bar.appendChild(rescan);
    wrap.appendChild(bar);
  }

  state.events.forEach((ev, i) => {
    wrap.appendChild(buildEventCard(ev, i));
  });

  return wrap;
}

function buildEventCard(ev, index) {
  const card = el("div", {
    class: `event-card${state.selected.has(index) ? " selected" : ""}${ev.warning ? " has-warning" : ""}${ev.error ? " has-error" : ""}`,
  });

  const header = el("div", { class: "event-card-header" });

  // Checkbox
  const check = el("div", {
    class: `event-check${state.selected.has(index) ? " checked" : ""}`,
  });
  check.addEventListener("click", () => toggleSelect(index));

  // Info
  const info = el("div", { class: "event-info" });

  const title = el("div", { class: "event-title", contenteditable: "false" });
  title.textContent = ev.title;
  title.addEventListener("dblclick", () => {
    title.contentEditable = "true";
    title.focus();
  });
  title.addEventListener("blur", () => {
    title.contentEditable = "false";
    state.events[index].title = title.textContent.trim();
  });
  title.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      title.blur();
    }
  });

  const meta = el("div", { class: "event-meta" });

  if (ev.date) {
    const datePill = el("span", { class: "meta-pill date" });
    datePill.textContent = formatDate(ev.date);
    meta.appendChild(datePill);
  }

  if (ev.time) {
    const timePill = el("span", { class: "meta-pill time" });
    timePill.textContent = ev.time;
    meta.appendChild(timePill);
  }

  if (ev.location) {
    const locPill = el("span", { class: "meta-pill location" });
    locPill.textContent = "📍 " + ev.location;
    meta.appendChild(locPill);
  }

  info.append(title, meta);

  if (ev.warning) {
    const badge = el("div", { class: "badge-warning" });
    badge.textContent = "⚠ " + ev.warning;
    info.appendChild(badge);
  }

  if (ev.error) {
    const badge = el("div", { class: "badge-error" });
    badge.textContent = "✕ " + ev.error;
    info.appendChild(badge);
  }

  // Actions
  const actions = el("div", { class: "event-actions" });

  const editBtn = el("button", { class: "icon-btn", title: "Edit" });
  editBtn.innerHTML = `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  editBtn.addEventListener("click", () => {
    const t = card.querySelector(".event-title");
    t.contentEditable = "true";
    t.focus();
    const range = document.createRange();
    range.selectNodeContents(t);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });

  const delBtn = el("button", { class: "icon-btn danger", title: "Remove" });
  delBtn.innerHTML = `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>`;
  delBtn.addEventListener("click", () => removeEvent(index));

  actions.append(editBtn, delBtn);
  header.append(check, info, actions);
  card.appendChild(header);
  return card;
}

// ── Success ───────────────────────────────────────────────────────────────
function buildSuccess() {
  const wrap = el("div", { class: "state-empty" });

  const banner = el("div", { class: "success-banner" });
  banner.innerHTML = `
    <div class="success-check">
      <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <div class="success-text">
      <p>${state.importedCount} event${state.importedCount !== 1 ? "s" : ""} added</p>
      <p>Check your Google Calendar</p>
    </div>
  `;
  wrap.appendChild(banner);

  const back = el("button", {
    class: "source-rescan",
    style: "margin-top:12px",
  });
  back.textContent = "← Import more";
  back.addEventListener("click", () => {
    state.phase = "ready";
    render();
  });
  wrap.appendChild(back);

  return wrap;
}

// ── Footer ────────────────────────────────────────────────────────────────
function buildFooter() {
  const footer = el("div", { class: "footer" });

  const meta = el("div", { class: "footer-meta" });

  const countText = el("span", { class: "selected-count" });
  countText.innerHTML = `<strong>${state.selected.size}</strong> of ${state.events.length} selected`;

  const selectAll = el("button", { class: "select-all-btn" });
  selectAll.textContent =
    state.selected.size === state.events.length ? "Deselect all" : "Select all";
  selectAll.addEventListener("click", toggleSelectAll);

  meta.append(countText, selectAll);

  const btn = el("button", {
    class: "btn-primary",
    disabled: state.selected.size === 0,
  });
  btn.innerHTML = `<span class="btn-text">Add to Calendar${state.selected.size > 0 ? ` (${state.selected.size})` : ""}</span>`;
  btn.addEventListener("click", handleImport);

  footer.append(meta, btn);
  return footer;
}

// ── Interactions ──────────────────────────────────────────────────────────
function toggleSelect(index) {
  if (state.selected.has(index)) state.selected.delete(index);
  else state.selected.add(index);
  render();
}

function toggleSelectAll() {
  if (state.selected.size === state.events.length) {
    state.selected.clear();
  } else {
    state.events.forEach((_, i) => state.selected.add(i));
  }
  render();
}

function removeEvent(index) {
  state.events.splice(index, 1);
  state.selected.delete(index);
  const newSelected = new Set();
  state.selected.forEach((i) => {
    if (i < index) newSelected.add(i);
    else if (i > index) newSelected.add(i - 1);
  });
  state.selected.clear();
  newSelected.forEach((i) => state.selected.add(i));
  if (state.events.length === 0) state.phase = "empty";
  render();
}

const AUTH_ERROR_LABELS = {
  NOT_SIGNED_IN:    "Sign in to Chrome with a Google account first.",
  INVALID_CLIENT_ID:"Extension OAuth client ID not configured. See README setup step 1.",
  USER_CANCELLED:   "Authentication cancelled.",
};

async function handleAuth() {
  if (state.authConnected) return;

  const authBtn = root.querySelector(".auth-btn");
  if (authBtn) { authBtn.textContent = "Connecting…"; authBtn.disabled = true; }

  chrome.runtime.sendMessage({ type: "AUTH_START" }, (res) => {
    if (res?.success) {
      state.authConnected = true;
      if (state._pendingImport) {
        // User clicked "Add to Calendar" before connecting — resume it now
        handleImport();
      } else if (state.phase === "empty" || state.phase === "loading") {
        scanPage();
      } else {
        render();
      }
    } else {
      const label = AUTH_ERROR_LABELS[res?.error] || `Auth failed: ${res?.error || "unknown error"}`;
      state.authError = label;
      render();
    }
  });
}

async function handleImport() {
  if (!state.authConnected) {
    // Flag so handleAuth knows to resume import after connecting
    state._pendingImport = true;
    handleAuth();
    return;
  }
  state._pendingImport = false;

  const btn = root.querySelector(".btn-primary");
  if (btn) btn.classList.add("loading");

  const toImport = [...state.selected].map((i) => state.events[i]);

  chrome.runtime.sendMessage({ type: "IMPORT_EVENTS", events: toImport }, (res) => {
    if (res?.success) {
      state.importedCount = res.count;
      state.importError   = null;
      state.phase = "success";
    } else {
      state.importError = res?.error || "Unknown error — check the console.";
      state.phase = "error";
    }
    render();
  });
}

async function handlePaste() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      chrome.runtime.sendMessage({ type: "PARSE_TEXT", text }, (res) => {
        if (res?.events?.length) {
          state.events = res.events;
          state.selected = new Set(res.events.map((_, i) => i));
          state.phase = "ready";
          state.source = { name: "Pasted data", color: "#8b5cf6" };
          render();
        }
      });
    }
  } catch (_) {}
}

async function scanPage(retryOnEmpty = true) {
  state.phase = "loading";
  render();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(tab.id, { type: "SCAN" }, async (res) => {
    if (chrome.runtime.lastError || !res) {
      // Content script not reachable (e.g. chrome:// page or script not yet injected)
      state.phase = "empty";
      render();
      return;
    }

    if (res.events?.length) {
      state.events = res.events;
      state.selected = new Set(res.events.map((_, i) => i));
      state.phase = "ready";
      state.source = res.source;
      render();
    } else if (retryOnEmpty) {
      // SPAs like Notion render lazily — wait 1.5 s and try once more
      await new Promise(r => setTimeout(r, 1500));
      scanPage(false);
    } else {
      state.phase = "empty";
      render();
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────
function el(tag, attrs = {}) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") e.className = v;
    else if (k === "disabled") {
      if (v) e.setAttribute("disabled", "");
    } else e.setAttribute(k, v);
  });
  return e;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    // Parse as local date to avoid UTC-offset shifting the day (e.g. "2026-06-06" → Jun 5)
    const [y, mo, d] = dateStr.split("-").map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch (_) {
    return dateStr;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  render(); // Show loading immediately

  // Check auth state
  chrome.runtime.sendMessage({ type: "GET_AUTH_STATE" }, (res) => {
    state.authConnected = res?.connected ?? false;
  });

  // Scan active tab
  await scanPage();
}

init();
