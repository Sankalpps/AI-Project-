/* ════════════════════════════════════════════════════════════
   driver.js – Driver control panel
════════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────
let tripActive     = false;
let selectedBusId  = null;
let geoWatchId     = null;
let pingInterval   = null;
let lastPosition   = null;
const PING_MS      = 7000;   // send GPS every 7 seconds

// ── DOM ────────────────────────────────────────────────────
const busSelect    = document.getElementById('bus-select');
const busInfo      = document.getElementById('bus-info');
const infoRoute    = document.getElementById('info-route');
const infoPlate    = document.getElementById('info-plate');
const infoCap      = document.getElementById('info-cap');
const btnStart     = document.getElementById('btn-start');
const btnStop      = document.getElementById('btn-stop');
const tripBadge    = document.getElementById('trip-badge');
const gpsLat       = document.getElementById('gps-lat');
const gpsLon       = document.getElementById('gps-lon');
const gpsAcc       = document.getElementById('gps-acc');
const gpsTs        = document.getElementById('gps-ts');
const gpsMsg       = document.getElementById('gps-msg');
const gpsBarFill   = document.getElementById('gps-bar-fill');
const logList      = document.getElementById('log-list');

// ── Socket ─────────────────────────────────────────────────
const socket = io();

socket.on('connect', ()    => setConnStatus(true));
socket.on('disconnect', () => setConnStatus(false));

socket.on('trip_started', (data) => {
  if (data.bus_id === selectedBusId) log('Trip confirmed started', 'success');
});
socket.on('trip_stopped', (data) => {
  if (data.bus_id === selectedBusId) log('Trip confirmed stopped', 'success');
});

// ── Load buses ─────────────────────────────────────────────
async function fetchBuses() {
  const res   = await fetch('/api/buses');
  const buses = await res.json();
  busSelect.innerHTML = '<option value="">-- Choose a bus --</option>';
  buses.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = `${b.name} (${b.number_plate})`;
    busSelect.appendChild(opt);
  });

  // Restore from localStorage
  const savedId = localStorage.getItem('selectedBusId');
  if (savedId) {
    busSelect.value = savedId;
    selectedBusId = parseInt(savedId);
    await loadBusDetails(selectedBusId);
  }

  return buses;
}

// ── Bus selection ──────────────────────────────────────────
busSelect.addEventListener('change', async () => {
  const id = parseInt(busSelect.value);
  if (!id) {
    busInfo.style.display = 'none';
    btnStart.disabled = true;
    selectedBusId = null;
    localStorage.removeItem('selectedBusId');
    return;
  }
  selectedBusId = id;
  localStorage.setItem('selectedBusId', id);

  await loadBusDetails(id);
});

async function loadBusDetails(id) {
  // Load bus details
  const res   = await fetch('/api/buses');
  const buses = await res.json();
  const bus   = buses.find(b => b.id === id);

  if (bus) {
    busInfo.style.display = 'flex';
    infoPlate.textContent = bus.number_plate;
    infoCap.textContent   = `${bus.capacity} seats`;

    // Load route name
    if (bus.route_id) {
      const rRes    = await fetch('/api/routes');
      const routes  = await rRes.json();
      const route   = routes.find(r => r.id === bus.route_id);
      infoRoute.textContent = route ? route.name : '–';
    } else {
      infoRoute.textContent = 'No route assigned';
    }

    if (bus.status === 'active' && !tripActive) {
      log(`Bus ${bus.name} is already active. Resuming...`, 'info');
      startTripUI();
    }
  }

  btnStart.disabled = tripActive;
  log(`Bus ${bus?.name} selected`);
}

function startTripUI() {
  tripActive = true;

  tripBadge.textContent = 'ACTIVE';
  tripBadge.classList.add('active');
  btnStart.disabled = true;
  btnStop.disabled  = false;
  busSelect.disabled = true;

  gpsMsg.textContent = 'Acquiring GPS…';

  // Start watching position
  geoWatchId = navigator.geolocation.watchPosition(
    onPosition,
    onGeoError,
    { enableHighAccuracy: true, maximumAge: 5000 }
  );

  // Periodically send last known position even if no movement
  pingInterval = setInterval(() => {
    if (lastPosition && tripActive) sendLocation(lastPosition);
  }, PING_MS);
}

// ── Start trip ─────────────────────────────────────────────
btnStart.addEventListener('click', () => {
  if (!selectedBusId) return alert('Please select a bus first.');

  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    return;
  }

  socket.emit('start_trip', { bus_id: selectedBusId });
  startTripUI();

  log('Trip started – GPS tracking active', 'success');
});

// ── Stop trip ──────────────────────────────────────────────
btnStop.addEventListener('click', () => {
  if (!selectedBusId) return;

  socket.emit('stop_trip', { bus_id: selectedBusId });
  tripActive = false;

  if (geoWatchId !== null) { navigator.geolocation.clearWatch(geoWatchId); geoWatchId = null; }
  clearInterval(pingInterval);

  tripBadge.textContent = 'STOPPED';
  tripBadge.classList.remove('active');
  btnStart.disabled  = false;
  btnStop.disabled   = true;
  busSelect.disabled = false;

  gpsMsg.textContent = 'GPS inactive';
  gpsBarFill.style.width = '0%';

  log('Trip stopped', 'warn');
});

// ── GPS callbacks ──────────────────────────────────────────
function onPosition(pos) {
  lastPosition = pos;
  const { latitude, longitude, accuracy } = pos.coords;

  gpsLat.textContent = latitude.toFixed(6);
  gpsLon.textContent = longitude.toFixed(6);
  gpsAcc.textContent = `±${Math.round(accuracy)} m`;
  gpsTs.textContent  = new Date().toLocaleTimeString();

  // Accuracy bar: 100% at <10m, 0% at >200m
  const pct = Math.max(0, Math.min(100, 100 - ((accuracy - 10) / 190 * 100)));
  gpsBarFill.style.width = `${pct}%`;
  gpsMsg.textContent = accuracy < 30 ? '✅ Good GPS accuracy' : '⚠️ Low accuracy – keep moving';

  sendLocation(pos);
}

function onGeoError(err) {
  gpsMsg.textContent = `⚠️ GPS error: ${err.message}`;
  log(`GPS error: ${err.message}`, 'error');
}

function sendLocation(pos) {
  if (!tripActive || !selectedBusId) return;
  socket.emit('location_update', {
    bus_id:    selectedBusId,
    latitude:  pos.coords.latitude,
    longitude: pos.coords.longitude
  });
}

// ── Activity log ───────────────────────────────────────────
function log(msg, type = '') {
  const ul = logList;
  ul.querySelectorAll('.muted').forEach(e => e.remove());

  const li = document.createElement('li');
  li.className = `log-item ${type}`;
  const ts = new Date().toLocaleTimeString();
  li.textContent = `[${ts}] ${msg}`;
  ul.insertBefore(li, ul.firstChild);

  while (ul.children.length > 12) ul.lastChild.remove();
}

// ── Connection indicator ───────────────────────────────────
function setConnStatus(connected) {
  document.getElementById('conn-dot').className  = `dot ${connected ? 'connected' : 'disconnected'}`;
  document.getElementById('conn-label').textContent = connected ? 'Connected' : 'Disconnected';
}

// ── Boot ───────────────────────────────────────────────────
fetchBuses();
