-- Campus Bus Tracker – SQLite Schema
-- Run once on first launch (handled automatically by app.py)

PRAGMA foreign_keys = ON;

-- ─── Buses ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS buses (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    number_plate  TEXT    NOT NULL UNIQUE,
    capacity      INTEGER DEFAULT 40,
    status        TEXT    DEFAULT 'offline',   -- 'active' | 'offline'
    route_id      INTEGER REFERENCES routes(id) ON DELETE SET NULL,
    created_at    TEXT    DEFAULT (datetime('now'))
);

-- ─── Routes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS routes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    description TEXT    DEFAULT '',
    created_at  TEXT    DEFAULT (datetime('now'))
);

-- ─── Stops ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stops (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id    INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    latitude    REAL    NOT NULL,
    longitude   REAL    NOT NULL,
    stop_order  INTEGER DEFAULT 0
);

-- ─── Trips (live session per bus) ────────────────────────────
CREATE TABLE IF NOT EXISTS trips (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_id     INTEGER NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
    start_time TEXT    NOT NULL,
    end_time   TEXT,                  -- NULL while trip is active
    latitude   REAL,                  -- last known position
    longitude  REAL,
    timestamp  TEXT                   -- time of last GPS ping
);

-- ─── Sample data ─────────────────────────────────────────────

-- Routes
INSERT OR IGNORE INTO routes (id, name, description) VALUES
(1, 'Route A – Main Gate Loop',   'Main gate → Library → Hostel → Canteen → Main gate'),
(2, 'Route B – Sports Complex',   'Admin block → Labs → Sports complex → Back gate'),
(3, 'Route C – City Express',     'Campus → Railway station (morning & evening)');

-- Stops for Route A  (approximate coords – update for your campus)
INSERT OR IGNORE INTO stops (route_id, name, latitude, longitude, stop_order) VALUES
(1, 'Main Gate',       12.9716, 77.5946, 1),
(1, 'Library',         12.9725, 77.5955, 2),
(1, 'Boys Hostel',     12.9730, 77.5965, 3),
(1, 'Canteen',         12.9720, 77.5970, 4),
(1, 'Admin Block',     12.9710, 77.5960, 5);

-- Stops for Route B
INSERT OR IGNORE INTO stops (route_id, name, latitude, longitude, stop_order) VALUES
(2, 'Admin Block',     12.9710, 77.5960, 1),
(2, 'CS Labs',         12.9718, 77.5975, 2),
(2, 'Sports Complex',  12.9705, 77.5980, 3),
(2, 'Back Gate',       12.9700, 77.5990, 4);

-- Stops for Route C
INSERT OR IGNORE INTO stops (route_id, name, latitude, longitude, stop_order) VALUES
(3, 'Campus Gate',     12.9716, 77.5946, 1),
(3, 'City Bus Stand',  12.9800, 77.6050, 2),
(3, 'Railway Station', 12.9850, 77.6100, 3);

-- Buses
INSERT OR IGNORE INTO buses (id, name, number_plate, capacity, status, route_id) VALUES
(1, 'Bus Alpha',   'KA-01-AB-1234', 52, 'offline', 1),
(2, 'Bus Beta',    'KA-01-CD-5678', 40, 'offline', 2),
(3, 'Bus Gamma',   'KA-01-EF-9012', 40, 'offline', 3);
