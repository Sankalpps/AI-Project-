from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
import sqlite3
import math
import os
from datetime import datetime

app = Flask(__name__)
app.config['SECRET_KEY'] = 'campus-bus-tracker-secret'
socketio = SocketIO(app, cors_allowed_origins="*")

DB_PATH = 'bus_tracker.db'

# ─────────────────────────────────────────────
# Database helpers
# ─────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        with open('schema.sql', 'r') as f:
            conn.executescript(f.read())
    print("✅ Database initialised.")

# ─────────────────────────────────────────────
# Haversine distance (km)
# ─────────────────────────────────────────────

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return 2 * R * math.asin(math.sqrt(a))

def eta_minutes(distance_km, avg_speed_kmh=20):
    if avg_speed_kmh == 0:
        return None
    return round((distance_km / avg_speed_kmh) * 60, 1)

# ─────────────────────────────────────────────
# Page routes
# ─────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('student.html')

@app.route('/student')
def student():
    return render_template('student.html')

@app.route('/driver')
def driver():
    return render_template('driver.html')

@app.route('/admin')
def admin():
    return render_template('admin.html')

# ─────────────────────────────────────────────
# REST API – Buses
# ─────────────────────────────────────────────

@app.route('/api/buses', methods=['GET'])
def get_buses():
    with get_db() as conn:
        buses = conn.execute('SELECT * FROM buses').fetchall()
    return jsonify([dict(b) for b in buses])

@app.route('/api/buses', methods=['POST'])
def add_bus():
    data = request.get_json()
    with get_db() as conn:
        conn.execute(
            'INSERT INTO buses (name, number_plate, capacity, status) VALUES (?,?,?,?)',
            (data['name'], data['number_plate'], data.get('capacity', 40), 'offline')
        )
    return jsonify({'message': 'Bus added'}), 201

@app.route('/api/buses/<int:bus_id>', methods=['PUT'])
def update_bus(bus_id):
    data = request.get_json()
    with get_db() as conn:
        conn.execute(
            'UPDATE buses SET name=?, number_plate=?, capacity=? WHERE id=?',
            (data['name'], data['number_plate'], data.get('capacity', 40), bus_id)
        )
    return jsonify({'message': 'Bus updated'})

@app.route('/api/buses/<int:bus_id>', methods=['DELETE'])
def delete_bus(bus_id):
    with get_db() as conn:
        conn.execute('DELETE FROM buses WHERE id=?', (bus_id,))
    return jsonify({'message': 'Bus deleted'})

# ─────────────────────────────────────────────
# REST API – Routes
# ─────────────────────────────────────────────

@app.route('/api/routes', methods=['GET'])
def get_routes():
    with get_db() as conn:
        routes = conn.execute('SELECT * FROM routes').fetchall()
    return jsonify([dict(r) for r in routes])

@app.route('/api/routes', methods=['POST'])
def add_route():
    data = request.get_json()
    with get_db() as conn:
        conn.execute(
            'INSERT INTO routes (name, description) VALUES (?,?)',
            (data['name'], data.get('description', ''))
        )
    return jsonify({'message': 'Route added'}), 201

@app.route('/api/routes/<int:route_id>', methods=['PUT'])
def update_route(route_id):
    data = request.get_json()
    with get_db() as conn:
        conn.execute(
            'UPDATE routes SET name=?, description=? WHERE id=?',
            (data['name'], data.get('description', ''), route_id)
        )
    return jsonify({'message': 'Route updated'})

@app.route('/api/routes/<int:route_id>', methods=['DELETE'])
def delete_route(route_id):
    with get_db() as conn:
        conn.execute('DELETE FROM routes WHERE id=?', (route_id,))
        conn.execute('DELETE FROM stops WHERE route_id=?', (route_id,))
    return jsonify({'message': 'Route deleted'})

# ─────────────────────────────────────────────
# REST API – Stops
# ─────────────────────────────────────────────

@app.route('/api/stops', methods=['GET'])
def get_stops():
    route_id = request.args.get('route_id')
    with get_db() as conn:
        if route_id:
            stops = conn.execute(
                'SELECT * FROM stops WHERE route_id=? ORDER BY stop_order',
                (route_id,)
            ).fetchall()
        else:
            stops = conn.execute('SELECT * FROM stops ORDER BY route_id, stop_order').fetchall()
    return jsonify([dict(s) for s in stops])

@app.route('/api/stops', methods=['POST'])
def add_stop():
    data = request.get_json()
    with get_db() as conn:
        conn.execute(
            'INSERT INTO stops (route_id, name, latitude, longitude, stop_order) VALUES (?,?,?,?,?)',
            (data['route_id'], data['name'], data['latitude'], data['longitude'], data.get('stop_order', 0))
        )
    return jsonify({'message': 'Stop added'}), 201

@app.route('/api/stops/<int:stop_id>', methods=['DELETE'])
def delete_stop(stop_id):
    with get_db() as conn:
        conn.execute('DELETE FROM stops WHERE id=?', (stop_id,))
    return jsonify({'message': 'Stop deleted'})

# ─────────────────────────────────────────────
# REST API – Assignments & Live data
# ─────────────────────────────────────────────

@app.route('/api/assign', methods=['POST'])
def assign_bus_route():
    data = request.get_json()
    with get_db() as conn:
        conn.execute(
            'UPDATE buses SET route_id=? WHERE id=?',
            (data['route_id'], data['bus_id'])
        )
    return jsonify({'message': 'Assigned'})

@app.route('/api/live', methods=['GET'])
def get_live_buses():
    """Return all active buses with their last known positions."""
    with get_db() as conn:
        buses = conn.execute(
            '''SELECT b.id, b.name, b.number_plate, b.status, b.route_id,
                      r.name as route_name,
                      t.latitude, t.longitude, t.timestamp
               FROM buses b
               LEFT JOIN routes r ON b.route_id = r.id
               LEFT JOIN trips t ON t.bus_id = b.id AND t.end_time IS NULL
               WHERE b.status = "active"'''
        ).fetchall()
    return jsonify([dict(b) for b in buses])

@app.route('/api/eta', methods=['GET'])
def get_eta():
    """Calculate ETA from bus current position to a stop."""
    bus_id   = request.args.get('bus_id', type=int)
    stop_id  = request.args.get('stop_id', type=int)
    with get_db() as conn:
        trip = conn.execute(
            'SELECT latitude, longitude FROM trips WHERE bus_id=? AND end_time IS NULL',
            (bus_id,)
        ).fetchone()
        stop = conn.execute('SELECT latitude, longitude FROM stops WHERE id=?', (stop_id,)).fetchone()

    if not trip or not stop or trip['latitude'] is None:
        return jsonify({'eta': None, 'message': 'Bus not active or no position data'})

    dist = haversine(trip['latitude'], trip['longitude'], stop['latitude'], stop['longitude'])
    eta  = eta_minutes(dist)
    return jsonify({'eta': eta, 'distance_km': round(dist, 2)})

# ─────────────────────────────────────────────
# WebSocket events
# ─────────────────────────────────────────────

@socketio.on('connect')
def on_connect():
    print(f"Client connected: {request.sid}")

@socketio.on('disconnect')
def on_disconnect():
    print(f"Client disconnected: {request.sid}")

@socketio.on('start_trip')
def handle_start_trip(data):
    """Driver starts a trip. Creates a trip record."""
    bus_id = data['bus_id']
    with get_db() as conn:
        # Close any existing open trip for this bus
        conn.execute('UPDATE trips SET end_time=? WHERE bus_id=? AND end_time IS NULL',
                     (datetime.utcnow().isoformat(), bus_id))
        conn.execute('INSERT INTO trips (bus_id, start_time) VALUES (?,?)',
                     (bus_id, datetime.utcnow().isoformat()))
        conn.execute('UPDATE buses SET status="active" WHERE id=?', (bus_id,))
    emit('trip_started', {'bus_id': bus_id}, broadcast=True)
    print(f"🚌 Trip started for bus {bus_id}")

@socketio.on('stop_trip')
def handle_stop_trip(data):
    """Driver ends a trip."""
    bus_id = data['bus_id']
    with get_db() as conn:
        conn.execute('UPDATE trips SET end_time=? WHERE bus_id=? AND end_time IS NULL',
                     (datetime.utcnow().isoformat(), bus_id))
        conn.execute('UPDATE buses SET status="offline" WHERE id=?', (bus_id,))
    emit('trip_stopped', {'bus_id': bus_id}, broadcast=True)
    print(f"🛑 Trip stopped for bus {bus_id}")

@socketio.on('location_update')
def handle_location_update(data):
    """Driver sends GPS coords. We persist and broadcast to all students."""
    bus_id = data['bus_id']
    lat    = data['latitude']
    lon    = data['longitude']
    ts     = datetime.utcnow().isoformat()

    with get_db() as conn:
        conn.execute(
            'UPDATE trips SET latitude=?, longitude=?, timestamp=? WHERE bus_id=? AND end_time IS NULL',
            (lat, lon, ts, bus_id)
        )
        # Fetch route stops so we can compute ETAs
        bus = conn.execute('SELECT route_id FROM buses WHERE id=?', (bus_id,)).fetchone()
        stops = []
        if bus and bus['route_id']:
            raw_stops = conn.execute(
                'SELECT id, name, latitude, longitude, stop_order FROM stops WHERE route_id=? ORDER BY stop_order',
                (bus['route_id'],)
            ).fetchall()
            for s in raw_stops:
                dist = haversine(lat, lon, s['latitude'], s['longitude'])
                stops.append({
                    'id': s['id'],
                    'name': s['name'],
                    'latitude': s['latitude'],
                    'longitude': s['longitude'],
                    'stop_order': s['stop_order'],
                    'eta_minutes': eta_minutes(dist)
                })

    payload = {
        'bus_id': bus_id,
        'latitude': lat,
        'longitude': lon,
        'timestamp': ts,
        'stops': stops
    }
    emit('location_update', payload, broadcast=True)

# ─────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────

if __name__ == '__main__':
    if not os.path.exists(DB_PATH):
        init_db()
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
