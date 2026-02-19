# Doumei (到未) — Bus ETA PWA

Personal bus countdown app for Terry's commute from Grand Promenade to Kornhill, Sai Wan Ho, Hong Kong. "到未" = "arrived yet?" in Cantonese.

## Architecture

Vanilla HTML/CSS/JS PWA on Vercel. No framework, no build step.

```
public/
  index.html    — Single page, inlined CSS, SVG grain filter
  app.js        — Fetch, state, display loop (rAF-free, setTimeout-based)
  sw.js         — Network-first service worker, bump CACHE_NAME on every deploy
  fonts/        — JetBrains Mono + Barlow Condensed (woff2 subsets, ~14KB)
  manifest.json — PWA manifest
api/
  eta.js        — Vercel serverless proxy → data.gov.hk CTB API
  tram.js       — Placeholder (HK Tramways API is dead since ~2025)
vercel.json     — HKG1 region, no-cache headers for HTML/JS/SW
```

## Key Design Decisions

- **Traffic light countdown**: Giant number with urgency colors (green >=4m Walk, amber 2-3m Hurry, red <2m RUN!). Urgency set via `data-urgency` attribute on `<html>`, CSS cascades from there.
- **Plan B**: When no primary bus, fetches alternatives from two nearby SKW Rd stops (001304 + 001367). Toggle button in header for testing.
- **Self-correcting timer**: `setTimeout(tick, 1000 - (Date.now() % 1000))` prevents iOS Safari drift.
- **Design**: Perplexity-inspired palette (Paper White #F3F3EE, Offblack #13343B) with Ciguleva-inspired stipple grain overlay (SVG feTurbulence filter).

## Bus Stops

| Stop ID | Name | Routes | Role |
|---------|------|--------|------|
| 001293 | Lei King Wan (Grand Promenade) | 77, 99 | Primary |
| 001304 | Tai Cheong St, SKW Rd | 2, 77, 82, 85, 99, 720 | Plan B |
| 001367 | Tai Fu St, SKW Rd | 102, 106, 682 | Plan B |

## Data Source

CTB real-time ETA: `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/{stop}/{route}`

Returns JSON with `data[].eta` (ISO timestamp). Proxied through `api/eta.js` to avoid CORS. Polled every 15s. Stale after 60s.

## Deployment

```bash
pnpm vercel --prod    # Deploy from local (git push may not auto-deploy)
```

**After every deploy**: bump `CACHE_NAME` in `sw.js` (e.g. `bus-eta-v11` → `bus-eta-v12`). Without this, iOS PWA serves stale content.

**iOS PWA cache gotcha**: Even with `skipWaiting()`, user must fully close and reopen the PWA from the app switcher to get new version.

## Development

```bash
pnpm vercel dev                    # Local dev server on :3456
# LAN testing (vercel dev only binds localhost):
socat TCP-LISTEN:3457,fork,bind=0.0.0.0 TCP:localhost:3456
# Then access http://<local-ip>:3457 from phone
```

## Conventions

- No build step, no bundler, no framework. Keep it vanilla.
- All CSS inlined in `index.html <style>`. No external stylesheets.
- CSS custom properties for theming (`--bg`, `--text`, `--muted`, `--urgency-*`, `--r77`, `--r99`).
- Dark/light mode via `prefers-color-scheme` media query.
- `api/eta.js` whitelist: only stops in `STOP_ROUTES` are allowed. Add new stops there.
- Fonts are self-hosted subsets, not CDN. Keep total font payload under 20KB.
