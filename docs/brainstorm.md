# HK Bus ETA PWA

**Date:** 2026-02-18
**Status:** Brainstorm complete
**Next:** `/workflows:plan`

## What We're Building

A minimal PWA web app that shows real-time bus ETAs for Terry's two regular trips:

1. **Grand Promenade → Kornhill** (morning): Routes 77 and 99 inbound, board at Tai Hong House (001313)
2. **Yiu Wah House → Grand Promenade** (evening): Routes 77 and 99 inbound, board at Yiu Wah House (001359)

One-tap from iPhone home screen → instant ETAs. No login, no config, no fluff.

## Why This Approach

- **PWA over CLI**: Primary use is checking while walking to the bus stop on iPhone. Blink SSH adds unnecessary friction.
- **PWA over native iOS**: No Apple Developer account needed, no review process, deploy in hours not days.
- **Static HTML + Vercel proxy over Next.js**: One screen, two API calls. React/Next.js is massive overkill.
- **Vercel serverless proxy**: Citybus API at `rt.data.gov.hk` likely blocks browser CORS. A thin proxy function guarantees it works.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Form factor | PWA web app | Mobile-first, one-tap access from home screen |
| Frontend | Vanilla HTML/CSS/JS | One screen, no framework needed |
| Backend | Vercel serverless function (API proxy) | Avoids CORS issues, free tier |
| Default view | Auto-detect by time of day | Morning → show trip to Kornhill; evening → show trip from Yiu Wah House |
| Features | ETAs only, minimal | Route number, minutes until arrival, scheduled vs live indicator |
| Hosting | Vercel (free) | Already used for other projects |

## API Details

**Citybus ETA endpoint:**
```
GET https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/{stop_id}/{route}
```

**Stops and routes:**

| Trip | Stop name | Stop ID | Routes |
|---|---|---|---|
| To Kornhill | Tai Hong House, Tai Hong Street (太康樓) | 001313 | 77, 99 |
| To Grand Promenade | Yiu Wah House Yiu Tung Estate (耀東邨耀華樓) | 001359 | 77, 99 |

**ETA response shape:**
```json
{
  "data": [
    {
      "co": "CTB",
      "route": "77",
      "eta_seq": 1,
      "eta": "2026-02-18T15:14:00+08:00",
      "rmk_en": "Scheduled Bus",
      "dest_en": "Tin Wan"
    }
  ]
}
```

- `eta_seq`: 1 = next bus, 2 = second, 3 = third
- `eta`: ISO 8601 with +08:00 offset
- `rmk_en`: "Scheduled Bus" (timetable) or empty (live GPS)
- No auth required, no rate limit documented

**API calls needed per view:** 4 (2 routes x 1 stop, but need both 77 and 99 at the stop — so 2 calls: one per route at the boarding stop)

## UX Sketch

```
┌─────────────────────────────┐
│  🚌 Bus ETA                │
│  ─────────────────────────  │
│  To Kornhill    [morning]   │
│  from Tai Hong House        │
│                             │
│  77  3 min  ●               │
│  99  7 min  ○ scheduled     │
│  77  15 min ●               │
│                             │
│  Updated 14:32              │
│  [↻ Refresh]  [Switch trip] │
└─────────────────────────────┘
```

- ● = live GPS    ○ = scheduled
- Auto-refreshes every 30-60 seconds
- Manual toggle to switch between trips
- Pull-to-refresh on mobile

## File Structure

```
hk-bus-eta/
├── index.html          # Single page app
├── manifest.json       # PWA manifest
├── sw.js               # Service worker (app shell caching only)
├── api/
│   └── eta.js          # Vercel serverless function (proxy)
├── vercel.json         # Routing config
└── package.json        # Minimal, for Vercel deploy
```

## Open Questions

_None — all key decisions resolved during brainstorm._
