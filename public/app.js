const TRIPS = {
  kornhill: {
    stop: '001313',
    label: 'To Kornhill',
    sublabel: 'from Tai Hong House \u592A\u5EB7\u6A13',
  },
  grandprom: {
    stop: '001359',
    label: 'To Grand Promenade',
    sublabel: 'from Yiu Wah House \u8000\u83EF\u6A13',
  },
};

const CACHE_KEY = 'bus_eta_cache';
const MAX_MINUTES = 20;
let currentTrip = new Date().getHours() < 14 ? 'kornhill' : 'grandprom';
let refreshTimer = null;

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function minutesUntil(isoString) {
  return (new Date(isoString) - new Date()) / 60000;
}

function renderETAs(data, stale) {
  const container = document.getElementById('eta-list');
  const trip = TRIPS[currentTrip];

  document.getElementById('trip-label').textContent = trip.label;
  document.getElementById('trip-sublabel').textContent = trip.sublabel;

  if (!data || !data.data) {
    container.innerHTML = '<div class="empty">No data available</div>';
    return;
  }

  let html = '';
  for (const routeData of data.data) {
    const route = routeData.route;
    const etas = (routeData.data || [])
      .filter((e) => e.eta && minutesUntil(e.eta) > 0 && minutesUntil(e.eta) <= MAX_MINUTES)
      .sort((a, b) => new Date(a.eta) - new Date(b.eta));

    html += `<div class="route-row">`;
    html += `<span class="route-num">${route}</span>`;

    if (etas.length === 0) {
      html += `<span class="no-bus">No bus within ${MAX_MINUTES} min</span>`;
    } else {
      html += `<span class="times">`;
      html += etas
        .map((e) => {
          const mins = Math.round(minutesUntil(e.eta));
          const isScheduled = (e.rmk_en || '').toLowerCase().includes('scheduled');
          const cls = isScheduled ? 'time scheduled' : 'time live';
          return `<span class="${cls}">${formatTime(e.eta)}<small>${mins}m</small></span>`;
        })
        .join('');
      html += `</span>`;
    }
    html += `</div>`;
  }

  container.innerHTML = html || '<div class="empty">No upcoming buses</div>';

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit', hour12: false });
  document.getElementById('updated').textContent = stale
    ? `Cached \u00B7 updating\u2026`
    : `Updated ${timeStr}`;

  document.getElementById('stale-badge').style.display = stale ? 'inline' : 'none';
}

async function fetchETAs() {
  const trip = TRIPS[currentTrip];

  try {
    const res = await fetch(`/api/eta?stop=${trip.stop}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    localStorage.setItem(CACHE_KEY, JSON.stringify({ trip: currentTrip, data }));
    renderETAs(data, false);
  } catch (err) {
    console.error('Fetch error:', err);
    document.getElementById('updated').textContent = 'Error \u00B7 tap to retry';
  }
}

function loadCached() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const cached = JSON.parse(raw);
    if (cached.trip === currentTrip) {
      renderETAs(cached.data, true);
    }
  } catch {
    // ignore corrupt cache
  }
}

function switchTrip() {
  currentTrip = currentTrip === 'kornhill' ? 'grandprom' : 'kornhill';
  loadCached();
  fetchETAs();
}

function startPolling() {
  fetchETAs();
  refreshTimer = setInterval(fetchETAs, 30000);
}

function stopPolling() {
  clearInterval(refreshTimer);
  refreshTimer = null;
}

// Visibility-driven refresh (primary on iOS)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopPolling();
  } else {
    startPolling();
  }
});

// iOS page cache restoration fallback
window.addEventListener('pageshow', (e) => {
  if (e.persisted) startPolling();
});

// Init
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('toggle-btn').addEventListener('click', switchTrip);
  document.getElementById('eta-list').addEventListener('click', fetchETAs);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }

  loadCached();
  startPolling();
});
