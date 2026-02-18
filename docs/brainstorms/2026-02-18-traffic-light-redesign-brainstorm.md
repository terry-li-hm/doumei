# Doumei UX Redesign: Traffic Light Countdown

**Date:** 2026-02-18
**Status:** Brainstorm complete

## What We're Building

Replace the analog clock with a **giant color-coded countdown** that directly answers the commute question: "Can I catch the bus, and should I run?"

The hero element is a massive minute countdown (e.g., "4m") whose color communicates urgency:
- **Green (≥4 min):** Walk comfortably to the stop
- **Amber (2–3 min):** Hurry / pick up the pace
- **Red (<2 min):** RUN — last chance to catch it
- **No bus state:** No catchable bus within 20 min

Below the countdown: route number, status word ("Walk" / "Hurry" / "RUN!"), and the next bus after that.

## Why This Approach

### The Problem with the Clock

A council of 5 frontier models independently concluded: the text countdown ("77 · 3m") is the real interface; the analog clock is ambient decoration. The clock adds visual identity but doesn't speed up the core decision.

### The Actual Use Case

Terry and family check Doumei while leaving home in the morning. The stop (Tai Hong House → Kornhill) is ~2-3 minutes walk. The decision tree:

1. **Bus in ≥4 min** → Walk normally to stop
2. **Bus in 2-3 min** → Walk fast / hurry
3. **Bus in <2 min** → Sprint — might still catch it
4. **No bus soon** → Walk to Tai Fu St / SKW Rd for Plan B (different bus or tram)

A traffic light maps 1:1 to this decision tree. The clock doesn't.

### Why Giant Text Over Literal Traffic Light

The countdown number and the urgency signal are the same element. "4m" in green = two pieces of info in one glance (time remaining + urgency). No separate visual needed for "the traffic light."

## Key Decisions

1. **Replace analog clock entirely** — clock was decorative, text is functional
2. **Color-coded giant countdown** as hero element, not a literal traffic light shape
3. **Thresholds:** Green ≥4m / Amber 2-3m / Red <2m or no bus
4. **Morning route only** — remove trip toggle. Default to Kornhill (stop 001313)
5. **Plan B deferred** — future version could show tram/bus at Tai Fu St when no bus catchable
6. **Keep existing infrastructure** — fetch/cache/refresh/SW logic stays, only rendering changes

## UI Layout

```
┌─────────────────────┐
│                      │
│    To Kornhill       │  ← header (static, no toggle)
│    from Tai Hong St  │
│                      │
│                      │
│        77            │  ← route number (colored)
│                      │
│       4m             │  ← HERO: giant countdown (green/amber/red)
│                      │
│      Walk            │  ← status word
│                      │
│   then 99 · 7m      │  ← next bus after primary
│                      │
│                      │
│  Updated 08:14   ↻   │  ← footer (refresh only, no toggle)
└─────────────────────┘
```

### States

| State | Color | Hero | Status | Detail |
|-------|-------|------|--------|--------|
| Comfortable | Green | `4m` | Walk | then 99 · 7m |
| Hurry | Amber | `3m` | Hurry | then 77 · 8m |
| Sprint | Red | `<2m` | RUN! | — |
| No bus | Grey/muted | `—` | No bus soon | Walk to Tai Fu St |
| Loading | Muted | `...` | — | — |
| Stale (>60s) | Muted | `?` | Stale · tap to refresh | — |

### Color Palette (urgency)

Must work on both dark (#0f172a) and light (#f8fafc) backgrounds with WCAG AA+ contrast.

| Level | Dark mode | Light mode |
|-------|-----------|------------|
| Green | `#4ade80` (green-400) | `#16a34a` (green-600) |
| Amber | `#fbbf24` (amber-400) | `#d97706` (amber-600) |
| Red | `#f87171` (red-400) | `#dc2626` (red-600) |
| Muted | `#64748b` (slate-500) | `#94a3b8` (slate-400) |

### Typography

- Hero countdown: `clamp(72px, 20vw, 120px)`, font-weight 800
- Route number: 24px, font-weight 600
- Status word: 20px, font-weight 600, uppercase
- "then" line: 16px, font-weight 400

## What Gets Removed

- SVG clock face (ticks, hands, bezel, numerals)
- Bus dot rendering (drawArcs, collision avoidance)
- Trip toggle button and `switchTrip()` logic
- `TRIPS.grandprom` config
- Clock animation loop (`tickClock`, `requestAnimationFrame`)
- Walking threshold dim (replaced by traffic light thresholds)

## What Gets Kept

- Fetch + cache logic (`fetchETAs`, `loadCached`, localStorage)
- Service worker and manifest
- Visibility/pageshow lifecycle management
- Stale data detection
- API proxy (`api/eta.js`)
- Dark/light mode (via `prefers-color-scheme`)
- Tap-to-refresh on main area

## Resolved Questions

- **Clock vs no clock?** → Replace entirely. Clock was decorative.
- **Traffic light shape vs color-coded text?** → Text. Number + color = two signals in one element.
- **Trip toggle?** → Remove. Morning route only.
- **Thresholds?** → Green ≥4m / Amber 2-3m / Red <2m
- **Plan B?** → Deferred. Show "No bus soon" for now.

## Resolved (continued)

- **"then" list depth?** → Show all upcoming buses (up to 3-4), stacked
- **Background tint?** → Neutral. Let text color do the work.
- **Scheduled buses?** → Prefix with "~" (e.g., "~4m") to indicate estimate vs GPS-live
- **Tap to refresh?** → Keep both: tap main area + dedicated refresh button
