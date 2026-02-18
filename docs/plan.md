---
title: "feat: HK Bus ETA PWA"
type: feat
status: active
date: 2026-02-18
deepened: 2026-02-18
brainstorm: docs/brainstorms/2026-02-18-hk-bus-eta-pwa-brainstorm.md
---

# feat: HK Bus ETA PWA

## Enhancement Summary

**Deepened on:** 2026-02-18
**Sections enhanced:** 6
**Research agents used:** iOS Safari PWA researcher, Vercel serverless researcher, architecture strategist, security sentinel, performance oracle

### Key Improvements
1. **Batch proxy** — single API call from client fetches both routes server-side, saving a full mobile round trip (~50-150ms)
2. **Visibility-driven refresh** — `visibilitychange` + `pageshow` replaces naive `setInterval` as primary refresh trigger (iOS suspends JS immediately on background)
3. **Stale-while-revalidate** — localStorage cache shows last ETAs instantly on app open, live fetch updates in background
4. **HK region deployment** — Vercel `hkg1` region co-locates proxy with upstream API
5. **Security hardening** — CORS restriction to own origin, Content-Type validation, parse-and-reserialize JSON
6. **Fixed Vercel routing** — removed incorrect `/(.*) → /public/$1` rewrite; Vercel handles static routing automatically

### Architecture Fixes (from review)
- Removed incorrect Vercel fallback rewrite (would have caused 404s)
- Added null guard on `eta` field before sorting
- Reduced fetch timeout from 10s to 8s (headroom for function overhead)
- Added `scope` to manifest (omission causes iOS to open Safari instead of staying in PWA)

---

## Overview

Minimal PWA showing real-time Citybus ETAs for two commute trips. One tap from iPhone home screen, instant results. Vanilla HTML/JS frontend, Vercel serverless proxy for the Citybus API, deployed on Vercel free tier in Hong Kong region.

## Proposed Solution

Static single-page app with a thin Vercel serverless function proxying `rt.data.gov.hk`. No framework, no build step. Modelled on the Bank FAQ Chatbot's static PWA pattern (`~/bank-faq-chatbot/public/`).

### Two trips, one batched API call per view

| Trip | When | Board at | Stop ID | Routes |
|---|---|---|---|---|
| Grand Promenade → Kornhill | Morning (default before 14:00) | Tai Hong House (太康樓) | `001313` | 77, 99 |
| Yiu Wah House → Grand Promenade | Evening (default after 14:00) | Yiu Wah House (耀東邨耀華樓) | `001359` | 77, 99 |

Each view makes **one** call to the proxy, which fetches both routes in parallel server-side and returns a combined response.

## Technical Approach

### Project structure

```
hk-bus-eta/
├── public/
│   ├── index.html        # SPA — all UI (CSS inlined)
│   ├── app.js            # Fetch, render, auto-refresh logic
│   ├── manifest.json     # PWA manifest
│   ├── sw.js             # Service worker (app shell cache only)
│   ├── icon-192.png      # PWA icon
│   └── icon-512.png      # PWA icon
├── api/
│   └── eta.js            # Vercel serverless function (batched proxy)
├── vercel.json           # Region, headers, function config
├── package.json          # Minimal (name, version only)
└── CLAUDE.md             # Project-specific instructions
```

> **Change from original:** CSS inlined in `index.html` (eliminates a render-blocking request for a ~30 line stylesheet). Separate `style.css` file removed.

### `api/eta.js` — Batched serverless proxy

**Endpoint:**
```
GET /api/eta?stop=001313
  → fetches both routes (77, 99) for that stop in parallel server-side
  → returns combined JSON response
```

**Implementation pattern (Web API signature — current Vercel standard):**

```js
const ALLOWED_STOPS = ['001313', '001359'];
const ROUTES = ['77', '99'];
const BASE = 'https://rt.data.gov.hk/v2/transport/citybus/eta/CTB';

export async function GET(request) {
  const url = new URL(request.url);
  const stop = (url.searchParams.get('stop') || '').trim();

  // Strict allowlist check
  if (!ALLOWED_STOPS.includes(stop)) {
    return new Response(JSON.stringify({ error: 'Invalid stop' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  // Batch fetch both routes in parallel
  const results = await Promise.all(
    ROUTES.map(route =>
      fetch(`${BASE}/${stop}/${route}`, {
        signal: AbortSignal.timeout(8_000),
        headers: { 'Accept': 'application/json' }
      })
      .then(async res => {
        if (!res.ok) return { route, data: [], error: res.status };
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) return { route, data: [], error: 'bad content-type' };
        const json = await res.json();
        return { route, data: json.data || [] };
      })
      .catch(err => ({ route, data: [], error: err.name }))
    )
  );

  return new Response(JSON.stringify({ data: results }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET',
    }
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  }});
}
```

**Key design decisions:**
- **Batch both routes into one call** — saves one full mobile round trip (~50-150ms) on every refresh
- **Web API `Request`/`Response` signature** — current Vercel standard (not the old `req/res` handler)
- **8s timeout** (not 10s) — leaves headroom for function overhead within Vercel's execution limit
- **Strict equality allowlist with `.trim()`** — prevents bypass via trailing spaces or URL encoding
- **URL constructed AFTER allowlist check** — defense-in-depth against SSRF
- **Content-Type validation** on upstream — rejects unexpected responses
- **Parse and re-serialize JSON** (via `.json()` then `JSON.stringify`) — never forwards raw upstream text
- **CORS restricted to own origin** via `ALLOWED_ORIGIN` env var — prevents quota abuse from other sites

### `public/app.js` — Frontend logic

1. **Time-based default trip:** `new Date().getHours() < 14` → show Kornhill trip, else Yiu Wah House trip
2. **Stale-while-revalidate on open:** Read last ETAs from `localStorage`, render immediately with "stale" indicator, then fetch live data
3. **Fetch ETAs:** Single `fetch('/api/eta?stop=X')` call — proxy returns both routes combined
4. **Filter:** Remove entries with null `eta` or arrival time >20 minutes away
5. **Render per route:** Separate row for each route showing actual arrival times (e.g., "14:32, 14:45"), not countdown minutes. Live vs scheduled visually distinct.
6. **Refresh strategy (critical for iOS):**
   ```js
   // Primary: refresh on return to foreground
   document.addEventListener('visibilitychange', () => {
     if (document.visibilityState === 'visible') fetchETAs();
   });
   // Fallback: iOS page cache restoration
   window.addEventListener('pageshow', (e) => {
     if (e.persisted) fetchETAs();
   });
   // Secondary: best-effort polling while app stays in foreground
   let timer;
   function startPolling() { fetchETAs(); timer = setInterval(fetchETAs, 30_000); }
   function stopPolling() { clearInterval(timer); }
   document.addEventListener('visibilitychange', () => {
     document.hidden ? stopPolling() : startPolling();
   });
   ```
7. **Manual toggle:** Button to switch between trips
8. **Error state:** "No buses" or "API error — tap to retry"
9. **Cache to localStorage:** After each successful fetch, save results for stale-while-revalidate on next open

> **Why `visibilitychange` is primary:** iOS suspends PWA JavaScript immediately when backgrounded. `setInterval` stops firing. When the user returns, timers resume but may have missed many ticks. `visibilitychange` fires reliably on foreground and gives an immediate refresh.

### `public/index.html` — Single page

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Bus ETA">
<meta name="theme-color" content="#1a1a2e">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="manifest" href="/manifest.json">
```

- **Inline `<style>` block** — no separate CSS file, eliminates render-blocking request
- **Safe area insets** for notch/Dynamic Island: `padding: env(safe-area-inset-top) ...`
- Dark/light mode via `prefers-color-scheme`
- Minimal markup: header, ETA list container, footer with refresh time + toggle button
- Service worker registration on load

### `vercel.json` — Deployment config

```json
{
  "regions": ["hkg1"],
  "functions": {
    "api/eta.js": {
      "maxDuration": 15
    }
  },
  "headers": [
    {
      "source": "/index.html",
      "headers": [{ "key": "Cache-Control", "value": "no-store, max-age=0" }]
    },
    {
      "source": "/app.js",
      "headers": [{ "key": "Cache-Control", "value": "no-cache, max-age=0, must-revalidate" }]
    },
    {
      "source": "/sw.js",
      "headers": [{ "key": "Cache-Control", "value": "no-cache, max-age=0, must-revalidate" }]
    }
  ]
}
```

**Key decisions:**
- **`hkg1` region** — co-locates serverless function with upstream API in Hong Kong, saves ~50-80ms vs default `iad1` (Washington DC)
- **No explicit `builds` or `rewrites` needed** — Vercel automatically serves static files from project root and routes `/api/*` to serverless functions
- **No-cache headers** on HTML/JS/SW — forces fresh assets on every load (same pattern as Bank FAQ)
- ~~`/(.*) → /public/$1` fallback~~ **removed** — Vercel's filesystem precedence handles this automatically; the rewrite would have caused 404s

### `manifest.json` — PWA install

```json
{
  "name": "Bus ETA",
  "short_name": "Bus ETA",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "theme_color": "#1a1a2e",
  "background_color": "#1a1a2e",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- **`scope: "/"`** is mandatory — without it, iOS opens Safari instead of staying in the PWA on navigation
- `display: "standalone"` is the only mode iOS supports; `minimal-ui` and `fullscreen` are silently ignored

### `sw.js` — Service worker

```js
const CACHE_NAME = 'bus-eta-v1'; // Increment on deploy

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(['/', '/index.html', '/app.js']))
  );
  self.skipWaiting(); // Activate immediately (critical on iOS — users rarely close apps)
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Never intercept API calls — ETAs must always be live
  if (e.request.url.includes('/api/')) return;

  // Cache-first for app shell
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
```

- **Cache-first for app shell, network-only for API** — cached shell loads in ~5ms on repeat visits; ETAs are always fresh
- **`skipWaiting()` + `clients.claim()`** — without these, SW updates never activate on iOS (users don't close apps)
- **Version constant `CACHE_NAME`** — increment manually on each deploy to bust stale cache
- No-cache HTTP headers on `sw.js` ensure Safari re-checks the SW script on each load

## Acceptance Criteria

- [ ] Opening the URL shows ETAs for the time-appropriate trip within 2 seconds
- [ ] Both routes (77, 99) display with correct "X min" countdown
- [ ] Null/missing ETAs are filtered out (not shown as NaN or sorted incorrectly)
- [ ] Live vs scheduled buses are visually distinct (based on `rmk_en` field)
- [ ] Toggle button switches between the two trips
- [ ] App refreshes ETAs on return to foreground (`visibilitychange`)
- [ ] Auto-refreshes every 30 seconds while app is in foreground
- [ ] Polling stops when app is backgrounded (no wasted invocations)
- [ ] Installable as PWA on iPhone (Add to Home Screen works)
- [ ] Works on iPhone Safari in standalone mode with correct safe area insets
- [ ] Serverless proxy rejects requests for non-allowlisted stops
- [ ] CORS header restricts proxy to own origin (via `ALLOWED_ORIGIN` env var)
- [ ] Deployed to Vercel `hkg1` region and accessible via a URL
- [ ] Repeat opens show cached ETAs instantly, then update with live data

## Implementation Steps

### Step 1: Project scaffolding
- Create `~/hk-bus-eta/` with the file structure above
- `git init` + initial commit
- Minimal `package.json` (name, version only)
- `vercel.json` with `hkg1` region, no-cache headers, function config
- `CLAUDE.md` with project context + API details

### Step 2: Serverless proxy (`api/eta.js`)
- Implement batched proxy with `GET(request)` Web API signature
- Allowlist as named constant arrays at top of file
- Batch both routes via `Promise.all` with 8s timeout
- Content-Type validation + parse-and-reserialize
- CORS headers with `ALLOWED_ORIGIN` env var
- Test with `curl` against live Citybus API to verify response shape

### Step 3: Frontend core (`public/app.js`, `index.html`)
- Trip config object: `{ stop, label, sublabel }` for each trip
- Time-based default trip selection
- `fetchETAs()`: single fetch → merge → null filter → sort → render
- localStorage stale-while-revalidate: cache on success, render stale on open
- Visibility-driven refresh: `visibilitychange` primary, `pageshow` fallback, `setInterval` secondary
- Stop polling on background, restart on foreground
- Trip toggle button
- Error handling (no data, API timeout, offline)
- Inline CSS in `index.html`: mobile-first, dark mode via `prefers-color-scheme`, safe area insets

### Step 4: PWA setup (`manifest.json`, `sw.js`, icons)
- Generate simple bus icon (emoji-based SVG → PNG export)
- Manifest with `scope: "/"`, standalone display
- Service worker: cache-first for shell, skip API, `skipWaiting` + `clients.claim`
- iOS Apple meta tags: `apple-mobile-web-app-capable`, `status-bar-style`, `apple-touch-icon`

### Step 5: Deploy + verify
- `vercel` deploy (preview)
- Set `ALLOWED_ORIGIN` env var to the Vercel domain
- Test on iPhone Safari: load, verify ETAs, check safe areas
- Add to Home Screen → verify standalone mode, correct icon/name
- Background → foreground → verify refresh fires
- `vercel --prod` for production URL

## Dependencies & Risks

- **Citybus API availability:** No SLA from data.gov.hk. If API is down, app shows cached stale data (if available) or "no data". No mitigation needed for a personal tool.
- **CORS assumption:** We assume the API blocks browser CORS (hence the proxy). If it doesn't, the proxy still works — just unnecessary. Can simplify later.
- **Rate limits:** Undocumented. 30s polling (only while in foreground) is conservative. Hobby tier has 1M invocations/month — personal usage will be ~3K/month.
- **iOS PWA storage isolation:** Data in Safari browser is separate from home screen PWA. Test in the installed PWA, not Safari.
- **Cold starts:** Vercel Fluid Compute (default since April 2025) reuses warm instances, so cold starts are rare. The function bundle is tiny (~1KB), further reducing init time.

## Vercel Free Tier Headroom

| Resource | Hobby limit | Estimated usage |
|---|---|---|
| Invocations | 1,000,000/month | ~3,000/month |
| Active CPU | 4 CPU-hours/month | ~0.01 CPU-hours/month |
| Bandwidth | 100 GB/month | ~1 MB/month |

No risk of hitting any limit.

## References

- **Brainstorm:** `docs/brainstorms/2026-02-18-hk-bus-eta-pwa-brainstorm.md`
- **PWA template:** `~/bank-faq-chatbot/public/` (manifest, sw.js, index.html)
- **Vercel config template:** `~/bank-faq-chatbot/vercel.json`
- **iOS Safari cache fix:** `~/bank-faq-chatbot/public/app.js:49-67`
- **Bank FAQ SW pattern:** `~/bank-faq-chatbot/public/sw.js`
- **Citybus API:** `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/{stop_id}/{route}`
- **API docs:** `https://data.gov.hk/en-data/dataset/ctb-eta-transport-realtime-eta`
- **Vercel Functions API:** `https://vercel.com/docs/functions/functions-api-reference`
- **Vercel Regions:** `https://vercel.com/docs/regions` (hkg1 = Hong Kong)
- **iOS PWA Compatibility:** `https://firt.dev/notes/pwa-ios/`
- **WebKit Storage Policy:** `https://webkit.org/blog/14403/updates-to-storage-policy/`
