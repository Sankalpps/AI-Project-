/* ════════════════════════════════════════════════════════════
   admin.js – Admin management panel
════════════════════════════════════════════════════════════ */

// ── Tab switching ──────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    if (tab.dataset.tab === 'assign') loadAssignTab();
    if (tab.dataset.tab === 'stops')  loadStopFilters();
  });
});

// ── Toast ──────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ═══════════════════════════════════════════════════════════
// BUSES
// ═══════════════════════════════════════════════════════════

let buses  = [];
let routes = [];
let editingBusId = null;

async function loadBuses() {
  const [busRes, routeRes] = await Promise.all([fetch('/api/buses'), fetch('/api/routes')]);
  buses  = await busRes.json();
  routes = await routeRes.json();
  renderBusTable();
}

function renderBusTable() {
  const tb = document.getElementById('bus-tbody');
  tb.innerHTML = '';
  if (buses.length === 0) {
    tb.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px">No buses yet. Add one above.</td></tr>`;
    return;
  }
  buses.forEach(b => {
    const routeName = routes.find(r => r.id === b.route_id)?.name ?? '–';
    const badge = `<span class="badge badge-${b.status}">${b.status}</span>`;
    tr(tb, `
      <td>${b.id}</td>
      <td>${b.name}</td>
      <td style="font-family:var(--mono);font-size:11px">${b.number_plate}</td>
      <td>${b.capacity}</td>
      <td>${badge}</td>
      <td>${routeName}</td>
      <td>
        <button class="btn btn-edit"   onclick="editBus(${b.id})">Edit</button>
        <button class="btn btn-danger" onclick="deleteBus(${b.id})">Delete</button>
      </td>
    `);
  });
}

function tr(tbody, html) {
  const row = document.createElement('tr');
  row.innerHTML = html;
  tbody.appendChild(row);
}

// Add button
document.getElementById('btn-add-bus').addEventListener('click', () => {
  editingBusId = null;
  document.getElementById('bus-form-title').textContent = 'New Bus';
  document.getElementById('bus-name').value  = '';
  document.getElementById('bus-plate').value = '';
  document.getElementById('bus-cap').value   = '40';
  document.getElementById('bus-form').style.display = 'block';
});
document.getElementById('bus-cancel-btn').addEventListener('click', () => {
  document.getElementById('bus-form').style.display = 'none';
});

document.getElementById('bus-save-btn').addEventListener('click', async () => {
  const body = {
    name:         document.getElementById('bus-name').value.trim(),
    number_plate: document.getElementById('bus-plate').value.trim(),
    capacity:     parseInt(document.getElementById('bus-cap').value) || 40
  };
  if (!body.name || !body.number_plate) return alert('Fill in all required fields.');

  const url    = editingBusId ? `/api/buses/${editingBusId}` : '/api/buses';
  const method = editingBusId ? 'PUT' : 'POST';
  await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  document.getElementById('bus-form').style.display = 'none';
  showToast(editingBusId ? '✅ Bus updated' : '✅ Bus added');
  loadBuses();
});

function editBus(id) {
  const bus = buses.find(b => b.id === id);
  if (!bus) return;
  editingBusId = id;
  document.getElementById('bus-form-title').textContent = `Editing: ${bus.name}`;
  document.getElementById('bus-name').value  = bus.name;
  document.getElementById('bus-plate').value = bus.number_plate;
  document.getElementById('bus-cap').value   = bus.capacity;
  document.getElementById('bus-form').style.display = 'block';
  document.getElementById('bus-form').scrollIntoView({ behavior: 'smooth' });
}

async function deleteBus(id) {
  if (!confirm('Delete this bus? This cannot be undone.')) return;
  await fetch(`/api/buses/${id}`, { method: 'DELETE' });
  showToast('🗑️ Bus deleted');
  loadBuses();
}

// ═══════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════

let editingRouteId = null;

async function loadRoutes() {
  const res = await fetch('/api/routes');
  routes = await res.json();
  renderRouteTable();
}

function renderRouteTable() {
  const tb = document.getElementById('route-tbody');
  tb.innerHTML = '';
  if (routes.length === 0) {
    tb.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px">No routes yet.</td></tr>`;
    return;
  }
  routes.forEach(r => {
    tr(tb, `
      <td>${r.id}</td>
      <td>${r.name}</td>
      <td style="color:var(--text-muted)">${r.description || '–'}</td>
      <td>
        <button class="btn btn-edit"   onclick="editRoute(${r.id})">Edit</button>
        <button class="btn btn-danger" onclick="deleteRoute(${r.id})">Delete</button>
      </td>
    `);
  });
}

document.getElementById('btn-add-route').addEventListener('click', () => {
  editingRouteId = null;
  document.getElementById('route-name').value = '';
  document.getElementById('route-desc').value = '';
  document.getElementById('route-form').style.display = 'block';
});
document.getElementById('route-cancel-btn').addEventListener('click', () => {
  document.getElementById('route-form').style.display = 'none';
});

document.getElementById('route-save-btn').addEventListener('click', async () => {
  const body = {
    name:        document.getElementById('route-name').value.trim(),
    description: document.getElementById('route-desc').value.trim()
  };
  if (!body.name) return alert('Route name is required.');
  const url    = editingRouteId ? `/api/routes/${editingRouteId}` : '/api/routes';
  const method = editingRouteId ? 'PUT' : 'POST';
  await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  document.getElementById('route-form').style.display = 'none';
  showToast(editingRouteId ? '✅ Route updated' : '✅ Route added');
  loadRoutes();
});

function editRoute(id) {
  const r = routes.find(x => x.id === id);
  if (!r) return;
  editingRouteId = id;
  document.getElementById('route-name').value = r.name;
  document.getElementById('route-desc').value = r.description;
  document.getElementById('route-form').style.display = 'block';
}

async function deleteRoute(id) {
  if (!confirm('Delete this route AND all its stops?')) return;
  await fetch(`/api/routes/${id}`, { method: 'DELETE' });
  showToast('🗑️ Route deleted');
  loadRoutes();
}

// ═══════════════════════════════════════════════════════════
// STOPS
// ═══════════════════════════════════════════════════════════

let stops = [];

async function loadStops(filterRouteId = '') {
  const url = filterRouteId ? `/api/stops?route_id=${filterRouteId}` : '/api/stops';
  const res = await fetch(url);
  stops = await res.json();
  renderStopTable();
}

function renderStopTable() {
  const tb = document.getElementById('stop-tbody');
  tb.innerHTML = '';
  if (stops.length === 0) {
    tb.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px">No stops found.</td></tr>`;
    return;
  }
  stops.forEach(s => {
    const routeName = routes.find(r => r.id === s.route_id)?.name ?? '–';
    tr(tb, `
      <td>${s.id}</td>
      <td style="font-size:12px;color:var(--text-muted)">${routeName}</td>
      <td>${s.name}</td>
      <td style="font-family:var(--mono);font-size:11px">${s.latitude}</td>
      <td style="font-family:var(--mono);font-size:11px">${s.longitude}</td>
      <td>${s.stop_order}</td>
      <td>
        <button class="btn btn-danger" onclick="deleteStop(${s.id})">Delete</button>
      </td>
    `);
  });
}

function loadStopFilters() {
  // Populate route dropdowns inside stops tab
  const sel  = document.getElementById('stop-route-id');
  const filt = document.getElementById('stop-filter-route');
  sel.innerHTML  = routes.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  filt.innerHTML = '<option value="">All Routes</option>' +
                   routes.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  loadStops();
}

document.getElementById('stop-filter-route').addEventListener('change', (e) => {
  loadStops(e.target.value);
});

document.getElementById('btn-add-stop').addEventListener('click', () => {
  document.getElementById('stop-form').style.display = 'block';
});
document.getElementById('stop-cancel-btn').addEventListener('click', () => {
  document.getElementById('stop-form').style.display = 'none';
});

document.getElementById('stop-save-btn').addEventListener('click', async () => {
  const body = {
    route_id:   parseInt(document.getElementById('stop-route-id').value),
    name:       document.getElementById('stop-name').value.trim(),
    latitude:   parseFloat(document.getElementById('stop-lat').value),
    longitude:  parseFloat(document.getElementById('stop-lon').value),
    stop_order: parseInt(document.getElementById('stop-order').value) || 0
  };
  if (!body.name || isNaN(body.latitude) || isNaN(body.longitude)) {
    return alert('Please fill all stop fields including coordinates.');
  }
  await fetch('/api/stops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  document.getElementById('stop-form').style.display = 'none';
  showToast('✅ Stop added');
  loadStops(document.getElementById('stop-filter-route').value);
});

async function deleteStop(id) {
  if (!confirm('Delete this stop?')) return;
  await fetch(`/api/stops/${id}`, { method: 'DELETE' });
  showToast('🗑️ Stop deleted');
  loadStops(document.getElementById('stop-filter-route').value);
}

// ═══════════════════════════════════════════════════════════
// ASSIGN
// ═══════════════════════════════════════════════════════════

async function loadAssignTab() {
  const [busRes, routeRes] = await Promise.all([fetch('/api/buses'), fetch('/api/routes')]);
  buses  = await busRes.json();
  routes = await routeRes.json();

  const busSelect   = document.getElementById('assign-bus');
  const routeSelect = document.getElementById('assign-route');
  busSelect.innerHTML   = buses.map(b  => `<option value="${b.id}">${b.name}</option>`).join('');
  routeSelect.innerHTML = routes.map(r => `<option value="${r.id}">${r.name}</option>`).join('');

  renderAssignTable();
}

function renderAssignTable() {
  const tb = document.getElementById('assign-tbody');
  tb.innerHTML = '';
  buses.forEach(b => {
    const routeName = routes.find(r => r.id === b.route_id)?.name ?? '–';
    const badge = `<span class="badge badge-${b.status}">${b.status}</span>`;
    tr(tb, `<td>${b.name}</td><td style="font-family:var(--mono);font-size:11px">${b.number_plate}</td><td>${badge}</td><td>${routeName}</td>`);
  });
}

document.getElementById('assign-btn').addEventListener('click', async () => {
  const busId   = parseInt(document.getElementById('assign-bus').value);
  const routeId = parseInt(document.getElementById('assign-route').value);
  if (!busId || !routeId) return;
  await fetch('/api/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bus_id: busId, route_id: routeId })
  });
  document.getElementById('assign-msg').textContent = '✅ Assignment saved!';
  setTimeout(() => document.getElementById('assign-msg').textContent = '', 3000);
  showToast('✅ Bus assigned to route');
  loadAssignTab();
});

// ── Boot ───────────────────────────────────────────────────
loadBuses();
loadRoutes();
