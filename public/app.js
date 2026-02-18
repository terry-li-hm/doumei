/* --- Constants --- */

const TRIPS = {
  kornhill: { stop: '001313', label: 'To Kornhill', sublabel: 'from Tai Hong House', toggle: '→ Grand Prom' },
  grandprom: { stop: '001359', label: 'To Grand Promenade', sublabel: 'from Yiu Wah House', toggle: '→ Kornhill' },
};

const CACHE_KEY = 'bus_eta_cache';
const MAX_MINUTES = 20;
const CX = 150, CY = 150;
const R_FACE = 143;
const R_DOT = 130;
const DOT_R = 5;
const NS = 'http://www.w3.org/2000/svg';

/* --- State --- */

let currentTrip = new Date().getHours() < 14 ? 'kornhill' : 'grandprom';
let refreshTimer = null;
let animFrame = null;
let currentETAs = [];
let lastCountdownSec = -1;
let lastFetchTime = 0;
let dataLoaded = false;

/* --- Geometry --- */

function polar(r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function minToAngle(m) { return (m / 60) * 360; }

function minutesUntil(iso) { return (new Date(iso) - Date.now()) / 60000; }

/* --- Clock init --- */

function initClock() {
  const g = document.getElementById('ticks');
  for (let i = 0; i < 60; i++) {
    const deg = (i / 60) * 360;
    const major = i % 5 === 0;
    const p1 = polar(major ? R_FACE - 12 : R_FACE - 6, deg);
    const p2 = polar(R_FACE, deg);
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('x1', p1.x); ln.setAttribute('y1', p1.y);
    ln.setAttribute('x2', p2.x); ln.setAttribute('y2', p2.y);
    ln.setAttribute('class', major ? 'tick-major' : 'tick');
    ln.setAttribute('stroke-width', major ? 2 : 1);
    ln.setAttribute('opacity', major ? 0.5 : 0.2);
    g.appendChild(ln);
  }
}

/* --- Animation loop --- */

function tickClock() {
  const now = new Date();
  const h = now.getHours() % 12, m = now.getMinutes();
  const s = now.getSeconds(), ms = now.getMilliseconds();
  const sf = s + ms / 1000;

  const minDeg  = ((m + sf / 60) / 60) * 360;
  const hourDeg = ((h + (m + sf / 60) / 60) / 12) * 360;

  document.getElementById('hand-hour').setAttribute('transform', `rotate(${hourDeg} ${CX} ${CY})`);
  document.getElementById('hand-min').setAttribute('transform',  `rotate(${minDeg} ${CX} ${CY})`);

  // Update dots + countdown once per second
  const sec = Math.floor(now.getTime() / 1000);
  if (sec !== lastCountdownSec) {
    lastCountdownSec = sec;
    currentETAs = currentETAs.filter(e => minutesUntil(e.eta) > 0);
    drawArcs();
    updateCountdown();
  }

  animFrame = requestAnimationFrame(tickClock);
}

/* --- Bus arcs --- */

function renderBusArcs(data, stale) {
  const trip = TRIPS[currentTrip];
  document.getElementById('trip-label').innerHTML =
    `${trip.label} <span id="stale-badge">cached</span>`;
  document.getElementById('trip-sublabel').textContent = trip.sublabel;
  document.getElementById('toggle-btn').textContent = trip.toggle;

  currentETAs = [];
  if (data?.data) {
    for (const rd of data.data) {
      for (const e of rd.data || []) {
        if (!e.eta) continue;
        const mins = minutesUntil(e.eta);
        if (mins > 0 && mins <= MAX_MINUTES) {
          currentETAs.push({
            route: rd.route,
            eta: e.eta,
            scheduled: (e.rmk_en || '').toLowerCase().includes('scheduled'),
          });
        }
      }
    }
  }
  currentETAs.sort((a, b) => new Date(a.eta) - new Date(b.eta));

  dataLoaded = true;
  drawArcs();
  updateCountdown();

  const timeStr = new Date().toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit', hour12: false });
  document.getElementById('updated').textContent = stale ? 'Cached \u00B7 updating\u2026' : `Updated ${timeStr}`;
  document.getElementById('stale-badge').style.display = stale ? 'inline' : 'none';
}

function drawArcs() {
  const g = document.getElementById('bus-markers');
  g.replaceChildren();

  for (let i = 0; i < currentETAs.length; i++) {
    const e = currentETAs[i];
    const t = new Date(e.eta);
    const mins = minutesUntil(e.eta);
    const deg = minToAngle(t.getMinutes() + t.getSeconds() / 60);
    // Offset inward if within 90s of previous ETA (collision avoidance)
    let r = R_DOT;
    if (i > 0 && Math.abs(new Date(e.eta) - new Date(currentETAs[i - 1].eta)) < 90000) {
      r = R_DOT - 12;
    }
    const pos = polar(r, deg);
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', pos.x);
    dot.setAttribute('cy', pos.y);
    dot.setAttribute('r', DOT_R);
    let cls = e.route === '99' ? 'bus-dot bus-dot-99' : 'bus-dot bus-dot-77';
    if (e.scheduled) cls += ' scheduled';
    if (i === 0 && mins < 2) cls += ' imminent';
    dot.setAttribute('class', cls);
    g.appendChild(dot);
  }
}

/* --- Countdown below clock --- */

function fmtMins(eta) {
  const m = minutesUntil(eta);
  return m < 1 ? '<1m' : `${Math.floor(m)}m`;
}

function routeColor(route) {
  return route === '99' ? 'var(--r99)' : 'var(--r77)';
}

function updateCountdown() {
  const el = document.getElementById('countdown');
  const active = currentETAs.filter(e => minutesUntil(e.eta) > 0);

  if (active.length === 0) {
    el.innerHTML = dataLoaded ? 'No buses within 20 min' : '--';
    el.classList.toggle('empty', dataLoaded);
    return;
  }
  el.classList.remove('empty');

  const next = active[0];
  let html = `<div class="countdown-next" style="color:${routeColor(next.route)}">${next.route} · ${fmtMins(next.eta)}</div>`;

  if (active.length > 1) {
    const after = active[1];
    html += `<div class="countdown-after" style="color:${routeColor(after.route)}">${after.route} · ${fmtMins(after.eta)}</div>`;
  }
  el.innerHTML = html;
}

/* --- Data fetching --- */

async function fetchETAs() {
  const trip = TRIPS[currentTrip];
  try {
    const res = await fetch(`/api/eta?stop=${trip.stop}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    localStorage.setItem(CACHE_KEY, JSON.stringify({ trip: currentTrip, data }));
    lastFetchTime = Date.now();
    document.body.classList.remove('stale-data');
    renderBusArcs(data, false);
  } catch (err) {
    console.error('Fetch error:', err);
    document.getElementById('updated').textContent = 'Error \u00B7 tap to retry';
  }
}

function loadCached() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const { trip, data } = JSON.parse(raw);
    if (trip === currentTrip) renderBusArcs(data, true);
  } catch { /* ignore corrupt cache */ }
}

function switchTrip() {
  currentTrip = currentTrip === 'kornhill' ? 'grandprom' : 'kornhill';
  loadCached();
  fetchETAs();
}

function doRefresh() {
  document.getElementById('updated').textContent = 'Refreshing\u2026';
  fetchETAs();
}

/* --- Lifecycle --- */

function startPolling() { fetchETAs(); refreshTimer = setInterval(fetchETAs, 15000); }
function stopPolling()  { clearInterval(refreshTimer); refreshTimer = null; }
function startAnim()    { if (!animFrame) tickClock(); }
function stopAnim()     { if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; } }

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopPolling(); stopAnim(); }
  else {
    if (lastFetchTime && Date.now() - lastFetchTime > 45000) {
      document.body.classList.add('stale-data');
    }
    startPolling(); startAnim();
  }
});

window.addEventListener('pageshow', (e) => {
  if (e.persisted) { startPolling(); startAnim(); }
});

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('toggle-btn').addEventListener('click', switchTrip);
  document.getElementById('refresh-btn').addEventListener('click', doRefresh);
  document.getElementById('clock').addEventListener('click', doRefresh);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

  initClock();
  loadCached();
  startPolling();
  startAnim();
});
