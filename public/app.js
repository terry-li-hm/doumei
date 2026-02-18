/* --- Constants --- */

const TRIPS = {
  kornhill: { stop: '001313', label: 'To Kornhill', sublabel: 'from Tai Hong House \u592A\u5EB7\u6A13' },
  grandprom: { stop: '001359', label: 'To Grand Promenade', sublabel: 'from Yiu Wah House \u8000\u83EF\u6A13' },
};

const CACHE_KEY = 'bus_eta_cache';
const MAX_MINUTES = 20;
const CX = 150, CY = 150;
const R_FACE = 143;
const R_OUTER = 135;  // Route 77 arcs
const R_INNER = 122;  // Route 99 arcs
const ARC_SPAN = 6;   // degrees per bus marker
const R_LBL_OUT = 147; // label radius outside outer arcs
const R_LBL_IN = 108;  // label radius inside inner arcs
const NS = 'http://www.w3.org/2000/svg';

/* --- State --- */

let currentTrip = new Date().getHours() < 14 ? 'kornhill' : 'grandprom';
let refreshTimer = null;
let animFrame = null;
let currentETAs = [];
let lastCountdownSec = -1;
let dataLoaded = false;

/* --- Geometry --- */

function polar(r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function arcPath(r, start, end) {
  const p1 = polar(r, start), p2 = polar(r, end);
  const large = (end - start) > 180 ? 1 : 0;
  return `M${p1.x},${p1.y} A${r},${r} 0 ${large} 1 ${p2.x},${p2.y}`;
}

function wedgePath(r, start, end) {
  const p1 = polar(r, start), p2 = polar(r, end);
  const large = (end - start) > 180 ? 1 : 0;
  return `M${CX},${CY} L${p1.x},${p1.y} A${r},${r} 0 ${large} 1 ${p2.x},${p2.y} Z`;
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

  // Sweep wedge: 20-min (120 deg) window from minute hand
  document.getElementById('sweep-wedge').setAttribute('d', wedgePath(R_FACE, minDeg, minDeg + 120));

  // Update arcs + text once per second
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
  const outer = document.getElementById('arcs-outer');
  const inner = document.getElementById('arcs-inner');
  outer.replaceChildren();
  inner.replaceChildren();

  for (const e of currentETAs) {
    const t = new Date(e.eta);
    const deg = minToAngle(t.getMinutes() + t.getSeconds() / 60);
    const half = ARC_SPAN / 2;
    const r = e.route === '77' ? R_OUTER : R_INNER;
    const grp = e.route === '77' ? outer : inner;

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', arcPath(r, deg - half, deg + half));
    path.setAttribute('class', 'bus-arc' + (e.scheduled ? ' bus-arc-scheduled' : ''));
    grp.appendChild(path);

    // Minute label next to arc
    const mins = minutesUntil(e.eta);
    const labelR = e.route === '77' ? R_LBL_OUT : R_LBL_IN;
    const pos = polar(labelR, deg);
    const txt = document.createElementNS(NS, 'text');
    txt.setAttribute('x', pos.x);
    txt.setAttribute('y', pos.y);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('dominant-baseline', 'central');
    txt.setAttribute('class', 'arc-label' + (e.scheduled ? ' bus-arc-scheduled' : ''));
    txt.textContent = mins < 1 ? '<1' : `${Math.floor(mins)}m`;
    grp.appendChild(txt);
  }
}

/* --- Countdown below clock --- */

function updateCountdown() {
  const el = document.getElementById('countdown');

  const next = currentETAs.find(e => minutesUntil(e.eta) > 0);
  if (!next) {
    el.textContent = dataLoaded ? 'No bus within 20 min' : '--';
    el.classList.toggle('empty', dataLoaded);
    return;
  }
  el.classList.remove('empty');
  const mins = minutesUntil(next.eta);
  el.textContent = mins < 1 ? '<1m' : `${Math.floor(mins)}m`;
}

/* --- Data fetching --- */

async function fetchETAs() {
  const trip = TRIPS[currentTrip];
  try {
    const res = await fetch(`/api/eta?stop=${trip.stop}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    localStorage.setItem(CACHE_KEY, JSON.stringify({ trip: currentTrip, data }));
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
  else { startPolling(); startAnim(); }
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
