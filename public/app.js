/* --- Constants --- */

const STOP_ID = '001293';
const PLANB_STOPS = ['001304', '001367'];
const WALK_MINS = 4;
const RUN_MINS = 2;
const STALE_MS = 60000;
const MAX_MINUTES = 20;
const POLL_MS = 15000;
const CACHE_KEY = 'bus_eta_cache';
const GHOST_MINS = 3; // show departed bus for up to 3 min after leaving

/* --- State --- */

let refreshTimer = null;
let displayTimer = null;
let currentETAs = [];
let lastFetchTime = 0;
let fetchController = null;
let planBETAs = [];
let planBFetched = false;
let planBFetching = false;
let forcePlanB = false;

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

  // Split into departed (ghost) and upcoming
  const active = currentETAs.filter(e => minutesUntil(e.eta) > 0);
  const departed = currentETAs.filter(e => {
    const m = minutesUntil(e.eta);
    return m <= 0 && m > -GHOST_MINS;
  });

  if (active.length === 0) {
    // Ghost state: show most recently departed bus in blue
    if (departed.length > 0 && lastFetchTime) {
      const ghost = departed[departed.length - 1]; // most recent departure
      const agoMins = -minutesUntil(ghost.eta);
      document.documentElement.dataset.urgency = 'ghost';
      route.textContent = ghost.route;
      hero.textContent = agoMins < 1 ? 'Just left' : `${Math.ceil(agoMins)}m ago`;
      status.textContent = 'Next cycle';
      thenList.textContent = '';
    } else {
      document.documentElement.dataset.urgency = 'none';
      hero.textContent = lastFetchTime ? '—' : '--';
      route.textContent = '--';
      status.textContent = lastFetchTime ? 'No bus soon' : '';
      thenList.textContent = '';
    }
    updatePlanB(lastFetchTime && !document.body.classList.contains('stale-data'));
    return;
  }

  // Show Plan B if forced OR in red zone (auto-peek)
  const nextMins = minutesUntil(active[0].eta);
  if (forcePlanB || urgency(nextMins) === 'red') {
    updatePlanB(true);
  } else {
    document.getElementById('plan-b').hidden = true;
  }

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
  thenList.textContent = '';
  if (active.length > 1) {
    const after = active[1];
    const afterMins = minutesUntil(after.eta);
    const afterText = afterMins < 1 ? '<1m' : `${Math.floor(afterMins)}m`;
    const div = document.createElement('div');
    div.className = 'then-item';
    div.style.color = `var(--r${after.route})`;
    div.textContent = `then ${after.route} · ${afterText}`;
    thenList.appendChild(div);
  }
}

/* --- Plan B --- */

function updatePlanB(show) {
  const el = document.getElementById('plan-b');
  if (!show) { el.hidden = true; return; }

  if (!planBFetched && !planBFetching) { fetchPlanB(); return; }
  if (planBFetching) return;

  const active = planBETAs.filter(e => minutesUntil(e.eta) > 0);
  if (active.length === 0) { el.hidden = true; return; }

  el.hidden = false;
  const list = document.getElementById('plan-b-list');
  list.textContent = '';

  const first = active[0];
  const firstMins = minutesUntil(first.eta);
  const firstText = firstMins < 1 ? '<1m' : `${Math.floor(firstMins)}m`;
  const heroDiv = document.createElement('div');
  heroDiv.className = 'plan-b-hero';
  heroDiv.textContent = `${first.route} · ${firstText}`;
  list.appendChild(heroDiv);

  if (active.length > 1) {
    const restDiv = document.createElement('div');
    restDiv.className = 'plan-b-rest';
    active.slice(1, 4).forEach(e => {
      const mins = minutesUntil(e.eta);
      const text = mins < 1 ? '<1m' : `${Math.floor(mins)}m`;
      const span = document.createElement('span');
      span.className = 'plan-b-item';
      span.textContent = `${e.route} · ${text}`;
      restDiv.appendChild(span);
    });
    list.appendChild(restDiv);
  }
}

async function fetchPlanB() {
  if (planBFetching) return;
  planBFetching = true;
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
  } finally {
    planBFetching = false;
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
        // Keep recently departed (ghost) and upcoming buses
        if (mins > -GHOST_MINS && mins <= MAX_MINUTES) {
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
  if (fetchController) fetchController.abort();
  fetchController = new AbortController();
  try {
    const res = await fetch(`/api/eta?stop=${STOP_ID}`, { signal: fetchController.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    lastFetchTime = Date.now();
    planBFetched = false;
    document.body.classList.remove('stale-data');
    renderUI(data, false);
  } catch (err) {
    if (err.name === 'AbortError') return;
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

function startPolling() { stopPolling(); fetchETAs(); refreshTimer = setInterval(fetchETAs, POLL_MS); }
function stopPolling() { clearInterval(refreshTimer); refreshTimer = null; }

function startDisplay() {
  stopDisplay();
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

  document.getElementById('plan-b-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    forcePlanB = !forcePlanB;
    e.currentTarget.textContent = forcePlanB ? 'Hide Plan B' : 'Plan B';
    updateDisplay();
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

  /* Sync theme-color with color scheme */
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => { meta.content = mq.matches ? '#0C0C0C' : '#F3F3EE'; };
    sync();
    mq.addEventListener('change', sync);
  }

  loadCached();
  startPolling();
  startDisplay();
});
