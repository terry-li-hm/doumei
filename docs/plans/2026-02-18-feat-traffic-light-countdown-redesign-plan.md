---
title: "feat: Replace analog clock with traffic light countdown"
type: feat
status: active
date: 2026-02-18
deepened: 2026-02-18
brainstorm: docs/brainstorms/2026-02-18-traffic-light-redesign-brainstorm.md
---

# Replace Analog Clock with Traffic Light Countdown

## Enhancement Summary

**Deepened on:** 2026-02-18
**Agents used:** frontend-design, architecture-strategist, code-simplicity-reviewer, best-practices-researcher

### Key Improvements from Deepening

1. **Typography**: JetBrains Mono for hero (prevents layout shift, adds character) + Barlow Condensed for status word. Self-host subsets (~15KB, cached in SW).
2. **Urgency as mode change**: Each state shifts size, weight, tracking, and glow — not just color. Uses `data-urgency` attribute on `<html>` for clean CSS cascading.
3. **Timer drift fix**: Anchor to `Date.now()` not tick counting. Self-correcting setTimeout instead of setInterval.
4. **Simplification**: Cut footer entirely, cut `scheduled` distinction, cap "then" list at 2, remove `dataLoaded` flag. Target: **~90-100 lines** (down from ~260).
5. **Accessibility**: `aria-live="polite"` on status, `forced-colors` media query, shape redundancy via text.

---

## Overview

Gut the analog clock UI and replace it with a giant color-coded countdown that directly answers: "Can I catch the bus — should I run?" The hero element is a massive minute number whose color communicates urgency (green/amber/red). Morning route only — remove trip toggle entirely.

## Problem Statement

The council concluded the text countdown is the real interface; the clock is decorative. The actual use case is a 2-3 second glance while leaving home with family. A traffic light maps 1:1 to the decision tree: walk / hurry / run / Plan B.

## Proposed Solution

Single-screen app with:
1. **Hero countdown** — giant "4m" in green/amber/red (JetBrains Mono, ~140px)
2. **Route label** — which bus is next (77 or 99), muted above hero
3. **Status word** — "Walk" / "Hurry" / "RUN!" (Barlow Condensed, uppercase)
4. **Then list** — next bus after primary, route-colored (capped at 2 items)
5. **No bus state** — muted "—" with "No bus soon"
6. **Stale state** — muted "?" with "Stale · tap to refresh"

No footer. No refresh button. No trip toggle. Tap anywhere to refresh.

## Technical Approach

### Files Modified

| File | Change |
|---|---|
| `public/index.html` | Remove SVG clock, rewrite CSS + markup for hero countdown, add font preload |
| `public/app.js` | Remove clock rendering, simplify to ~90-100 lines |
| `public/sw.js` | Bump cache `bus-eta-v3` → `bus-eta-v4`, add font files to cache |

**Unchanged**: `api/eta.js`, `manifest.json`, `vercel.json`, `package.json`

### What Gets Removed from `app.js`

| What | Why |
|---|---|
| `TRIPS` object, `currentTrip` state | Hardcode single stop |
| Clock constants (`CX`, `CY`, `R_FACE`, `R_DOT`, `DOT_R`, `NS`) | No clock geometry |
| `WALK_MIN` | Replaced by `WALK_MINS` / `RUN_MINS` named thresholds |
| `animFrame`, `lastCountdownSec` | No animation loop |
| `polar()`, `minToAngle()` | Clock geometry |
| `initClock()`, `tickClock()` | SVG clock |
| `drawArcs()` | SVG bus dots |
| `routeColor()`, `fmtMins()` | Replaced by urgency logic |
| `switchTrip()`, `doRefresh()` | Inlined / removed |
| `startAnim()`, `stopAnim()` | No animation |
| `dataLoaded` flag | Unnecessary with stale-while-revalidate |
| `scheduled` parsing from `rmk_en` | Motivation gone with clock dots |

### What Gets Kept

| What | Why |
|---|---|
| `CACHE_KEY`, `MAX_MINUTES` | Cache + filter logic |
| `currentETAs[]`, `lastFetchTime` | State for rendering |
| `minutesUntil()` | Core ETA calculation |
| `fetchETAs()` | Data fetching (hardcode stop `001313`) |
| `loadCached()` | Stale-while-revalidate (remove trip-key check) |
| `startPolling()`, `stopPolling()` | 15s refresh cycle |
| Visibility + pageshow listeners | iOS PWA lifecycle |

### What Gets Rewritten

**`renderBusArcs()` → `renderUI(data, stale)`**
- Keep `currentETAs` population loop (filter 0-20 min, sort by ETA)
- Drop `scheduled` parsing — just store `{ route, eta }`
- Call `updateDisplay()`
- Set stale/updated text (inline, no separate footer element)

**`updateCountdown()` → `updateDisplay()`**

```
1. Check stale (>60s) → show "?" + "Stale · tap to refresh", set data-urgency="none"
2. Filter active ETAs (mins > 0)
3. If none → show "—" + "No bus soon", set data-urgency="none"
4. Get next = active[0], compute mins
5. Determine urgency:
   - mins >= WALK_MINS (4) → GREEN, "Walk"
   - mins >= RUN_MINS (2)  → AMBER, "Hurry"
   - mins < RUN_MINS       → RED, "RUN!"
6. Set document.documentElement.dataset.urgency = level
7. Set hero text (use micro-fade if text changed)
8. Set route label + status word
9. Build "then" from active[1] (max 1 fallback item)
```

**Timer: self-correcting setTimeout (not setInterval)**

```js
// Anchor to Date.now() — prevents iOS Safari drift (~1s/min)
let displayTimer;
function startDisplay() {
  function tick() {
    updateDisplay();
    displayTimer = setTimeout(tick, 1000 - (Date.now() % 1000));
  }
  tick();
}
function stopDisplay() { clearTimeout(displayTimer); }
```

Wire `startDisplay()`/`stopDisplay()` into `visibilitychange` and `pageshow` handlers (replacing `startAnim()`/`stopAnim()`).

### New HTML Structure

```html
<header>
  <div id="trip-label">To Kornhill</div>
  <div id="trip-sublabel">from Tai Hong House</div>
</header>

<main id="main-tap">
  <div id="route-label">77</div>
  <div id="hero">--</div>
  <div id="status" role="status" aria-live="polite">--</div>
  <div id="then-list"></div>
  <div id="updated"></div>
</main>
```

No `<footer>`. No `<svg>`. No toggle button. No refresh button.
`#updated` is a small muted timestamp inside main (not a separate footer).

### Typography

**Fonts**: JetBrains Mono (hero, route, then-list) + Barlow Condensed (status word). Self-hosted woff2 subsets cached in SW.

```css
@font-face {
  font-family: 'JetBrains Mono';
  src: url('/fonts/jetbrains-mono-800.woff2') format('woff2');
  font-weight: 700 800;
  font-display: swap;
}
@font-face {
  font-family: 'Barlow Condensed';
  src: url('/fonts/barlow-condensed-700.woff2') format('woff2');
  font-weight: 700;
  font-display: swap;
}
```

| Element | Font | Size | Weight |
|---|---|---|---|
| `#hero` | JetBrains Mono | `clamp(80px, 25vw, 140px)` | 700 (green) → 800 (amber/red) |
| `#route-label` | JetBrains Mono | `clamp(20px, 5vw, 28px)` | 700, opacity 0.6 |
| `#status` | Barlow Condensed | `clamp(20px, 6vw, 32px)` | 700, uppercase |
| `.then-item` | JetBrains Mono | `clamp(14px, 3.5vw, 17px)` | 400, opacity 0.5–0.7 |
| `#updated` | System font | 12px | 400, muted |

### Urgency States via `data-urgency` Attribute

Set `document.documentElement.dataset.urgency` in JS. CSS cascades from `[data-urgency="green"]` etc.

| State | `data-urgency` | Hero color | Hero size | Status tracking | Animation |
|---|---|---|---|---|---|
| Walk (≥4m) | `green` | `--urgency-green` | 25vw | 0.2em (wide, relaxed) | Subtle breathing pulse |
| Hurry (2-3m) | `amber` | `--urgency-amber` | 28vw (larger) | 0.1em (tighter) | None |
| RUN! (<2m) | `red` | `--urgency-red` | 32vw (largest) | 0.05em (tightest) | Alarm glow pulse |
| No bus / Stale | `none` | `--muted` | 25vw | normal | None |

```css
/* Green: calm, breathing */
[data-urgency="green"] #hero {
  color: var(--urgency-green);
  font-size: clamp(80px, 25vw, 140px);
  font-weight: 700;
  animation: breathe 4s ease-in-out infinite;
}
[data-urgency="green"] #status {
  color: var(--urgency-green);
  letter-spacing: 0.2em;
}

/* Amber: tighter, bolder */
[data-urgency="amber"] #hero {
  color: var(--urgency-amber);
  font-size: clamp(88px, 28vw, 152px);
  font-weight: 800;
}
[data-urgency="amber"] #status {
  color: var(--urgency-amber);
  letter-spacing: 0.1em;
}

/* Red: maximum intensity */
[data-urgency="red"] #hero {
  color: var(--urgency-red);
  font-size: clamp(96px, 32vw, 168px);
  font-weight: 800;
  animation: alarm-glow 1.2s ease-in-out infinite;
}
[data-urgency="red"] #status {
  color: var(--urgency-red);
  letter-spacing: 0.05em;
}

/* None: muted */
[data-urgency="none"] #hero { color: var(--muted); }
[data-urgency="none"] #status { color: var(--muted); }

@keyframes breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}

@keyframes alarm-glow {
  0%, 100% { text-shadow: 0 0 20px color-mix(in srgb, var(--urgency-red) 30%, transparent); }
  50% { text-shadow: 0 0 60px color-mix(in srgb, var(--urgency-red) 60%, transparent); }
}

@media (prefers-reduced-motion: reduce) {
  [data-urgency="green"] #hero,
  [data-urgency="red"] #hero { animation: none; }
}
```

### Transitions (gear-shift feel)

```css
#hero {
  transition: color 0.3s ease, font-size 0.5s cubic-bezier(0.22, 1, 0.36, 1),
              text-shadow 0.5s ease;
}
#status {
  transition: color 0.3s ease 0.1s, letter-spacing 0.5s ease 0.1s;
}

/* Tap feedback */
#main-tap:active { transform: scale(0.98); }
#main-tap { transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1); }
```

### Thresholds (named constants)

```js
const STOP_ID = '001313';      // Kornhill
const WALK_MINS = 4;           // ≥4 = green (walk)
const RUN_MINS = 2;            // ≥2 = amber (hurry), <2 = red (RUN!)
const STALE_MS = 60000;        // data older than 60s = stale
const MAX_MINUTES = 20;        // ignore buses >20 min away
const POLL_MS = 15000;         // fetch every 15s
```

### CSS Variables

```css
:root {
  --bg: #0f172a;
  --text: #f1f5f9;
  --muted: #64748b;
  --r77: #7dd3fc;
  --r99: #fbbf24;
  --urgency-green: #4ade80;
  --urgency-amber: #fbbf24;
  --urgency-red: #f87171;
}

@media (prefers-color-scheme: light) {
  :root {
    --bg: #f8fafc;
    --text: #0f172a;
    --muted: #94a3b8;
    --r77: #1e40af;
    --r99: #c2410c;
    --urgency-green: #16a34a;
    --urgency-amber: #d97706;
    --urgency-red: #dc2626;
  }
}
```

### Colorblind Safety

1. **Status word redundancy**: "Walk" / "Hurry" / "RUN!" — text carries the signal independent of color
2. **Size escalation**: Green (140px) → Amber (152px) → Red (168px) — urgency is visible without color
3. **Animation differentiation**: Green breathes, Red glows — motion cue independent of color
4. **`forced-colors` support**: Add `@media (forced-colors: active)` rules so Windows High Contrast mode works

### Accessibility

- `aria-live="polite"` on `#status` — announces "Walk" / "Hurry" / "No bus soon" to screen readers
- NOT on `#hero` (updates every second — would spam VoiceOver)
- `@media (forced-colors: active)` block for high contrast mode
- `tabular-nums` on all monospace elements (prevents layout jitter)

### Implementation Steps

**Step 1: Add fonts**
- Download JetBrains Mono 700/800 woff2 (digits + "m" + "<" subset, ~5KB)
- Download Barlow Condensed 700 woff2 (letters subset, ~8KB)
- Place in `public/fonts/`
- Add `@font-face` declarations and `<link rel="preload">` in HTML

**Step 2: Rewrite `index.html`**
- Remove SVG clock block
- Remove ALL clock CSS (ticks, hands, bezel, dots, pulse, numerals)
- Remove `#toggle-btn`, `#refresh-btn`, `<footer>` entirely
- Remove `#stale-badge` CSS
- Add urgency color variables + `data-urgency` state CSS
- Add hero layout CSS with transitions and animations
- Replace `<main>` content with new markup
- Make header static: "To Kornhill" / "from Tai Hong House"
- Add `aria-live="polite"` on `#status`
- Add `@media (forced-colors: active)` and `@media (prefers-reduced-motion: reduce)`

**Step 3: Rewrite `app.js`**
- Define named constants at top (`STOP_ID`, `WALK_MINS`, `RUN_MINS`, etc.)
- Remove ALL clock functions and state (see removal table)
- Remove `scheduled` parsing from ETA loop
- Hardcode stop to `STOP_ID` in `fetchETAs()`
- Remove `loadCached()` trip-key check
- Rename `renderBusArcs()` → `renderUI()`, strip trip-toggle DOM writes
- Write `updateDisplay()` with urgency logic and `data-urgency` attribute
- Use self-correcting setTimeout instead of setInterval (prevents iOS drift)
- Wire `startDisplay()`/`stopDisplay()` into `visibilitychange` and `pageshow`
- Wire tap-to-refresh on `#main-tap`
- Remove `doRefresh()` (inline `fetchETAs()` into tap listener)
- Cap "then" list to 1 fallback entry (active[1] only)

**Step 4: Bump SW cache**
- `bus-eta-v3` → `bus-eta-v4` in `sw.js`
- Add font files to SW precache list

**Step 5: Verify**
- `vercel dev` — hero renders with correct urgency color and font
- Countdown decrements every second without drift
- Urgency transitions smoothly (green → amber → red)
- "then" shows next bus with route color
- Tap main area refreshes data
- Light mode works (check contrast)
- Stale state (>60s) shows "?" + "Stale · tap to refresh"
- No bus state shows "—" + "No bus soon"
- iPhone SE (375px) — hero text fits, no overflow
- `prefers-reduced-motion` — no animations
- `forced-colors` — urgency still distinguishable

## Acceptance Criteria

- [ ] Giant countdown dominates screen (JetBrains Mono, urgency-colored)
- [ ] Status word ("Walk" / "Hurry" / "RUN!") in Barlow Condensed below hero
- [ ] Urgency is multi-signal: color + size + tracking + animation
- [ ] "then" line shows next bus after primary (max 1 fallback)
- [ ] No trip toggle, no footer, no refresh button — tap anywhere to refresh
- [ ] Stale state (>60s) shows "?" with "Stale · tap to refresh"
- [ ] No bus state shows "—" with "No bus soon"
- [ ] Dark and light mode both work with WCAG AA contrast
- [ ] `prefers-reduced-motion` respected
- [ ] `forced-colors` media query present
- [ ] `aria-live="polite"` on status element
- [ ] Timer anchored to Date.now() (no drift)
- [ ] SW cache bumped to v4 with fonts cached
- [ ] iPhone SE (375px) — hero fits
- [ ] Total JS: ~90-100 lines (down from ~260)

## References

- Brainstorm: `docs/brainstorms/2026-02-18-traffic-light-redesign-brainstorm.md`
- Colorblind palettes: `~/docs/solutions/colorblind-safe-palettes.md`
- Astro UX Status System: https://www.astrouxds.com/patterns/status-system/
- Safari fluid typography: https://www.sarasoueidan.com/blog/safari-fluid-typography-bug-fix/
- iOS timer drift: https://hackwild.com/article/web-worker-timers/
- WCAG 1.4.1 Use of Color: https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html
