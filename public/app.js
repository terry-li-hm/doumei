/* --- Constants --- */

const STOP_ID = '001293';
const PLANB_STOPS = ['001304', '001367'];
const WALK_MINS = 4;
const RUN_MINS = 2;
const STALE_MS = 60000;
const MAX_MINUTES = 20;
const POLL_MS = 15000;
const CACHE_KEY = 'bus_eta_cache';

/* --- State --- */

let refreshTimer = null;
let displayTimer = null;
let currentETAs = [];
let lastFetchTime = 0;
let planBETAs = [];
let planBFetched = false;

/* --- Helpers --- */

function minutesUntil(iso) { return (new Date(iso) - Date.now()) / 60000; }

function urgency(mins) {
  if (mins >= WALK_MINS) return 'green';
  if (mins >= RUN_MINS) return 'amber';
  return 'red';
}

/* --- Display --- */

function updateDisplay() {
  const hero = document.getElementById('hero');
  const route = document.getElementById('route-label');
  const status = document.getElementById('status');
  const thenList = document.getElementById('then-list');

  // Stale check
  if (lastFetchTime && Date.now() - lastFetchTime > STALE_MS) {
    document.body.classList.add('stale-data');
    document.documentElement.dataset.urgency = 'none';
    hero.textContent = '?';
    route.textContent = '--';
    status.textContent = 'Stale · tap to refresh';
    thenList.innerHTML = '';
    return;
  }

  // Filter active ETAs
  const active = currentETAs.filter(e => minutesUntil(e.eta) > 0);

  if (active.length === 0) {
    document.documentElement.dataset.urgency = 'none';
    hero.textContent = lastFetchTime ? '—' : '--';
    route.textContent = '--';
    status.textContent = lastFetchTime ? 'No bus soon' : '';
    thenList.innerHTML = '';
    updatePlanB(lastFetchTime && !document.body.classList.contains('stale-data'));
    return;
  }

  // Hide Plan B when primary bus is available
  document.getElementById('plan-b').hidden = true;

  // Primary bus
  const next = active[0];
  const mins = minutesUntil(next.eta);
  const level = urgency(mins);

  document.documentElement.dataset.urgency = level;
  route.textContent = next.route;

  const newText = mins < 1 ? '<1m' : `${Math.floor(mins)}m`;
  if (hero.textContent !== newText) {
    hero.textContent = newText;
  }

  status.textContent = level === 'green' ? 'Walk' : level === 'amber' ? 'Hurry' : 'RUN!';

  // Then list (max 1 fallback)
  if (active.length > 1) {
    const after = active[1];
    const afterMins = minutesUntil(after.eta);
    const afterText = afterMins < 1 ? '<1m' : `${Math.floor(afterMins)}m`;
    thenList.innerHTML = `<div class="then-item" style="color:var(--r${after.route})">`
      + `then ${after.route} · ${afterText}</div>`;
  } else {
    thenList.innerHTML = '';
  }
}

/* --- Plan B --- */

function updatePlanB(show) {
  const el = document.getElementById('plan-b');
  if (!show) { el.hidden = true; return; }

  if (!planBFetched) { fetchPlanB(); return; }

  const active = planBETAs.filter(e => minutesUntil(e.eta) > 0);
  if (active.length === 0) { el.hidden = true; return; }

  el.hidden = false;
  const list = document.getElementById('plan-b-list');
  list.innerHTML = active.slice(0, 4).map(e => {
    const mins = minutesUntil(e.eta);
    const text = mins < 1 ? '<1m' : `${Math.floor(mins)}m`;
    return `<div class="plan-b-item">${e.route} · ${text}</div>`;
  }).join('');
}

async function fetchPlanB() {
  try {
    const responses = await Promise.all(
      PLANB_STOPS.map(s => fetch(`/api/eta?stop=${s}`))
    );
    planBETAs = [];

    for (const res of responses) {
      if (!res.ok) continue;
      const data = await res.json();
      for (const rd of data.data || []) {
        for (const e of rd.data || []) {
          if (!e.eta) continue;
          const mins = minutesUntil(e.eta);
          if (mins > 0 && mins <= MAX_MINUTES) {
            planBETAs.push({ route: rd.route, eta: e.eta });
          }
        }
      }
    }

    planBETAs.sort((a, b) => new Date(a.eta) - new Date(b.eta));
    planBFetched = true;
    updatePlanB(true);
  } catch (err) {
    console.error('Plan B fetch error:', err);
  }
}

/* --- Data --- */

function renderUI(data, stale) {
  currentETAs = [];
  if (data?.data) {
    for (const rd of data.data) {
      for (const e of rd.data || []) {
        if (!e.eta) continue;
        const mins = minutesUntil(e.eta);
        if (mins > 0 && mins <= MAX_MINUTES) {
          currentETAs.push({ route: rd.route, eta: e.eta });
        }
      }
    }
  }
  currentETAs.sort((a, b) => new Date(a.eta) - new Date(b.eta));
  updateDisplay();

  const el = document.getElementById('updated');
  if (stale) {
    el.textContent = 'Cached · updating…';
  } else {
    const t = new Date().toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit', hour12: false });
    el.textContent = `Updated ${t}`;
  }
}

async function fetchETAs() {
  try {
    const res = await fetch(`/api/eta?stop=${STOP_ID}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    lastFetchTime = Date.now();
    planBFetched = false;
    document.body.classList.remove('stale-data');
    renderUI(data, false);
  } catch (err) {
    console.error('Fetch error:', err);
    document.getElementById('updated').textContent = 'Error · tap to retry';
  }
}

function loadCached() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) renderUI(JSON.parse(raw), true);
  } catch { /* ignore corrupt cache */ }
}

/* --- Lifecycle --- */

function startPolling() { fetchETAs(); refreshTimer = setInterval(fetchETAs, POLL_MS); }
function stopPolling() { clearInterval(refreshTimer); refreshTimer = null; }

function startDisplay() {
  function tick() {
    updateDisplay();
    displayTimer = setTimeout(tick, 1000 - (Date.now() % 1000));
  }
  tick();
}
function stopDisplay() { clearTimeout(displayTimer); displayTimer = null; }

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopPolling();
    stopDisplay();
  } else {
    if (lastFetchTime && Date.now() - lastFetchTime > STALE_MS) {
      document.body.classList.add('stale-data');
    }
    startPolling();
    startDisplay();
  }
});

window.addEventListener('pageshow', (e) => {
  if (e.persisted) { startPolling(); startDisplay(); }
});

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('main-tap').addEventListener('click', fetchETAs);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

  loadCached();
  startPolling();
  startDisplay();
});
