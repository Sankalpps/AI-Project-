/* ════════════════════════════════════════════════════════════
   student.js – Live map for students
════════════════════════════════════════════════════════════ */

// ── Map init ───────────────────────────────────────────────
const map = L.map('map', {
  center: [12.372115, 76.584975],   // Default: Bengaluru – change to your campus centre
  zoom: 16,
  zoomControl: true
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  maxZoom: 19
}).addTo(map);

// ── State ──────────────────────────────────────────────────
let buses       = [];       // [{id, name, number_plate, status, route_id, …}]
let busMarkers  = {};       // {bus_id: L.Marker}
let stopMarkers = [];       // L.Marker[]
let selectedBus = null;
const feedLimit = 8;

// ── Socket ─────────────────────────────────────────────────
const socket = io();

socket.on('connect', () => {
  setConnStatus(true);
});
socket.on('disconnect', () => {
  setConnStatus(false);
});

socket.on('location_update', (data) => {
  updateBusMarker(data);
  if (selectedBus && data.bus_id === selectedBus.id) {
    updateSidebarETA(data.stops);
    updateStopETAs(data.stops);
  }
  addFeedItem(`🚌 Bus ${getBusName(data.bus_id)} updated position`);
});

socket.on('trip_started', (data) => {
  addFeedItem(`▶ Bus ${getBusName(data.bus_id)} started a trip`, 'success');
  fetchBuses(); // refresh status
});

socket.on('trip_stopped', (data) => {
  addFeedItem(`■ Bus ${getBusName(data.bus_id)} ended trip`, 'warn');
  removeMarker(data.bus_id);
  fetchBuses();
});

// ── Fetch initial data ─────────────────────────────────────
async function fetchBuses() {
  const res = await fetch('/api/buses');
  buses = await res.json();
  renderBusList();
}

async function fetchStops(routeId) {
  if (!routeId) return [];
  const res = await fetch(`/api/stops?route_id=${routeId}`);
  return res.json();
}

// ── Render bus list in sidebar ─────────────────────────────
function renderBusList() {
  const el = document.getElementById('bus-list');
  el.innerHTML = '';
  if (buses.length === 0) {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px">No buses available</div>';
    return;
  }
  buses.forEach(bus => {
    const card = document.createElement('div');
    card.className = 'bus-card' + (selectedBus?.id === bus.id ? ' selected' : '');
    card.dataset.id = bus.id;
    const isActive = bus.status === 'active';
    card.innerHTML = `
      <div>
        <div class="bus-card-name">${bus.name}</div>
        <div class="bus-card-plate">${bus.number_plate}</div>
      </div>
      <span class="dot bus-card-dot ${isActive ? 'green' : 'red'}" title="${isActive ? 'Active' : 'Offline'}"></span>
    `;
    card.addEventListener('click', () => selectBus(bus));
    el.appendChild(card);
  });
}

// ── Select a bus ───────────────────────────────────────────
async function selectBus(bus) {
  selectedBus = bus;

  // Update UI selection
  document.querySelectorAll('.bus-card').forEach(c => {
    c.classList.toggle('selected', parseInt(c.dataset.id) === bus.id);
  });

  // Clear old stop markers
  stopMarkers.forEach(m => m.remove());
  stopMarkers = [];

  if (!bus.route_id) {
    document.getElementById('route-section').style.display = 'none';
    document.getElementById('eta-section').style.display   = 'none';
    return;
  }

  // Load stops
  const stops = await fetchStops(bus.route_id);
  renderStopList(stops);
  renderStopMarkers(stops);

  // Pan to bus if active
  if (busMarkers[bus.id]) {
    map.panTo(busMarkers[bus.id].getLatLng());
  } else if (stops.length) {
    map.panTo([stops[0].latitude, stops[0].longitude]);
  }
}

// ── Render stops in sidebar ────────────────────────────────
function renderStopList(stops) {
  const section = document.getElementById('route-section');
  const ol      = document.getElementById('stop-list');
  section.style.display = 'block';
  ol.innerHTML = '';
  stops.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = 'stop-item' + (i === 0 ? ' next' : '');
    li.dataset.stopId = s.id;
    li.innerHTML = `
      <span>${s.name}</span>
      <span class="stop-eta" id="eta-stop-${s.id}">–</span>
    `;
    ol.appendChild(li);
  });
}

// ── Render stop markers on map ─────────────────────────────
function renderStopMarkers(stops) {
  stops.forEach((s, i) => {
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        background:${i===0?'var(--amber)':'var(--surface2)'};
        border:2px solid ${i===0?'#fff':'var(--border)'};
        width:12px;height:12px;border-radius:50%;
        box-shadow:0 2px 6px rgba(0,0,0,.4)
      "></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });
    const marker = L.marker([s.latitude, s.longitude], { icon })
      .addTo(map)
      .bindPopup(`<b>${s.name}</b><br>Stop #${s.stop_order}`);
    stopMarkers.push(marker);
  });
}

// ── Update/create bus marker on map ───────────────────────
function updateBusMarker(data) {
  const bus = buses.find(b => b.id === data.bus_id);
  const label = bus ? bus.name : `Bus ${data.bus_id}`;

  const icon = L.divIcon({
    className: '',
    html: `<div style="
      background:var(--amber);
      border:3px solid #fff;
      border-radius:50% 50% 50% 0;
      width:32px;height:32px;
      transform:rotate(-45deg);
      box-shadow:0 3px 12px rgba(0,0,0,.5);
      display:flex;align-items:center;justify-content:center;
    "><span style="transform:rotate(45deg);font-size:14px">🚌</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });

  if (busMarkers[data.bus_id]) {
    busMarkers[data.bus_id].setLatLng([data.latitude, data.longitude]);
  } else {
    busMarkers[data.bus_id] = L.marker([data.latitude, data.longitude], { icon })
      .addTo(map)
      .bindPopup(`<b>${label}</b><br>Last seen: ${new Date(data.timestamp).toLocaleTimeString()}`);
  }

  // Update popup content
  busMarkers[data.bus_id]
    .getPopup()
    ?.setContent(`<b>${label}</b><br>Last seen: ${new Date(data.timestamp).toLocaleTimeString()}`);
}

function removeMarker(busId) {
  if (busMarkers[busId]) {
    busMarkers[busId].remove();
    delete busMarkers[busId];
  }
}

// ── Update ETA in sidebar and stop list ──────────────────
function updateSidebarETA(stops) {
  const etaSection = document.getElementById('eta-section');
  if (!stops || stops.length === 0) { etaSection.style.display = 'none'; return; }

  etaSection.style.display = 'block';
  const next = stops[0];
  document.getElementById('eta-value').textContent    = next.eta_minutes ?? '–';
  document.getElementById('eta-stop-name').textContent = next.name;
}

function updateStopETAs(stops) {
  if (!stops) return;
  stops.forEach(s => {
    const el = document.getElementById(`eta-stop-${s.id}`);
    if (el) el.textContent = s.eta_minutes != null ? `${s.eta_minutes} min` : '–';
  });
}

// ── Feed ───────────────────────────────────────────────────
function addFeedItem(text, type = '') {
  const ul = document.getElementById('feed-list');
  // Remove placeholder
  ul.querySelectorAll('.muted').forEach(e => e.remove());

  const li = document.createElement('li');
  li.className = `feed-item ${type}`;
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  li.textContent = `[${now}] ${text}`;
  ul.insertBefore(li, ul.firstChild);

  // Trim
  while (ul.children.length > feedLimit) ul.lastChild.remove();
}

// ── Connection status ──────────────────────────────────────
function setConnStatus(connected) {
  const dot   = document.getElementById('conn-dot');
  const label = document.getElementById('conn-label');
  dot.className   = `dot ${connected ? 'connected' : 'disconnected'}`;
  label.textContent = connected ? 'Live' : 'Disconnected';
}

// ── Helpers ────────────────────────────────────────────────
function getBusName(busId) {
  return buses.find(b => b.id === busId)?.name ?? `#${busId}`;
}

// ── Boot ───────────────────────────────────────────────────
fetchBuses();

// Auto-refresh bus list every 30s (catches status changes)
setInterval(fetchBuses, 30_000);
