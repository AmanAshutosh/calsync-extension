# CalSync — Schedule to Calendar Extension

A fast, minimal browser extension to detect schedule tables in Notion, Google Docs, Sheets, and any web page, then export them to Google Calendar in one click.

## Folder Structure

```
cal-import-ext/
├── manifest.json               # MV3 manifest
├── background/
│   └── service-worker.js       # OAuth + Google Calendar API + message router
├── content/
│   └── detector.js             # Table detection + floating button injection
├── popup/
│   ├── popup.html
│   ├── popup.css               # Claymorphism design system
│   └── popup.js                # Full UI logic (vanilla JS, no framework)
├── styles/
│   ├── injected.css            # Floating button styles
│   └── DESIGN_TOKENS.md        # Design system reference
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## Setup

### 1. Google OAuth Client

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable **Google Calendar API**
4. Go to **Credentials → Create OAuth 2.0 Client ID**
5. Application type: **Chrome Extension**
6. Copy the **Client ID**
7. Replace `YOUR_CLIENT_ID` in `manifest.json`

### 2. Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `cal-import-ext` folder

### 3. Icons

Add icon PNGs to `/icons/` at sizes 16, 32, 48, 128. Can use any calendar emoji export or create custom icons.

---

## Architecture

### Performance

- **Popup loads in < 300ms** — Vanilla JS, no React, no bundler needed
- **Content script** uses `MutationObserver` with 800ms debounce (not on every mutation)
- **Auth tokens** cached in memory for 55 minutes
- **Lazy scanning** — only scans when popup opens or tables appear

### Smart Detection

Heuristics to detect schedule tables:
1. Counts date-pattern matches in table text (>= 1 required)
2. Checks minimum text length (> 30 chars)
3. Parses column headers with fuzzy matching
4. Falls back to inline date/time extraction per cell

Supported sources:
- **Notion** — `.notion-table-block`, collection views
- **Google Docs** — standard HTML tables
- **Google Sheets** — grid container
- **Generic** — any `<table>` with date patterns

### Edge Cases

| Case | Behavior |
|------|----------|
| No table detected | "No schedule found" + paste option |
| Parse error on row | Row shown with red badge |
| Duplicate event | Warning badge (yellow) |
| Token expired | Auto-refresh + retry |
| Offline | Error state with message |

---

## User Flows

### Flow A — From Page
1. Open Notion / Docs / Sheets
2. Floating pill button appears near table: **"Import to Calendar"**
3. Click → popup opens with pre-parsed events
4. Select events → **"Add to Calendar (N)"**
5. Done ✓

### Flow B — From Popup
1. Click extension icon on any page
2. Popup shows detected events (or paste zone if none)
3. Edit titles inline (double-click)
4. Remove unwanted events (trash icon)
5. Click primary button → success

---

## Design System

See `styles/DESIGN_TOKENS.md` for the full Claymorphism token reference.

**Dark mode** is default. Auto-switches via `@media (prefers-color-scheme: light)`.
