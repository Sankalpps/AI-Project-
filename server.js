const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { findUserByCredentials } = require('./db');

const app = express();
const isVercel = process.env.VERCEL === '1';
const server = isVercel ? null : http.createServer(app);

// Middleware
app.use(express.json());

// Store active sessions
const activeSessions = {};

// ========== AUTHENTICATION MIDDLEWARE ==========
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    if (!activeSessions[token]) {
        return res.status(403).json({ message: 'Invalid or expired token' });
    }

    req.user = activeSessions[token];
    next();
};

// ========== HEALTH CHECK ==========
app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// ========== AUTHENTICATION ROUTES ==========
app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;

    // Find user in the SQLite database
    const foundUser = findUserByCredentials(username, password);

    if (!foundUser) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Create token (simple implementation - can use JWT in production)
    const token = 'token_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    activeSessions[token] = {
        username: foundUser.username,
        busId: foundUser.busId
    };

    res.json({
        token,
        username: foundUser.username,
        busId: foundUser.busId,
        message: 'Login successful'
    });
});

app.post('/auth/logout', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token && activeSessions[token]) {
        delete activeSessions[token];
    }

    res.json({ message: 'Logged out successfully' });
});

// ========== PATH VALIDATION ==========
app.use((req, res, next) => {
    const decodedPath = decodeURIComponent(req.path || '');
    if (/^\/[a-zA-Z]:\//.test(decodedPath)) {
        return res.redirect('/');
    }
    next();
});

// ========== PROTECTED ROUTE - Main tracker page ==========
app.get('/', (req, res) => {
    const token = req.query.token || req.headers['x-token'];
    
    if (!token || !activeSessions[token]) {
        // Redirect to login if not authenticated
        return res.redirect('/login.html');
    }

    res.sendFile(__dirname + '/index.html');
});

app.get('/login.html', (req, res) => {
    res.sendFile(__dirname + '/login.html');
});

// Serve static files from the same folder (excluding index.html)
app.use(express.static(__dirname, { 
    index: false
}));

if (!isVercel) {
    // Enable CORS so your browser can talk to this server
    const io = new Server(server, {
        cors: { origin: "*" }
    });

    // ========== INITIAL FLEET DATA - Set in Mysore, Karnataka ==========
    let buses = [
        { id: 'BUS-101', route: 'KRS Dam', lat: 12.3051, lng: 76.6550, speed: 40, color: '#ff0000' },
        { id: 'BUS-102', route: 'NIE NORTH', lat: 12.371214742514967, lng: 76.58488491499308, speed: 35, color: '#28a745' },
        { id: 'BUS-103', route: 'Infosys Campus', lat: 12.3550, lng: 76.6000, speed: 45, color: '#00d5ff' },
        { id: 'BUS-104', route: 'NIE SOUTH', lat: 12.28393, lng: 76.64143, speed: 45, color: '#007bff' },
        { id: 'BUS-105', route: 'Aravind Hospital', lat: 12.3045, lng: 76.6547, speed: 38, color: '#ffc107' },
        { id: 'BUS-106', route: 'Palace Road', lat: 12.2847, lng: 76.6446, speed: 42, color: '#e91e63' },
        { id: 'BUS-107', route: 'Gokulam', lat: 12.3388, lng: 76.6944, speed: 40, color: '#009688' },
        { id: 'BUS-108', route: 'Railway Station', lat: 12.2942, lng: 76.5990, speed: 35, color: '#673ab7' },
        { id: 'BUS-109', route: 'Bus Stand', lat: 12.3070, lng: 76.6468, speed: 43, color: '#ff9800' },
        { id: 'BUS-110', route: 'Jayadeva Hospital', lat: 12.3222, lng: 76.6356, speed: 39, color: '#4caf50' }
    ];

    io.on('connection', (socket) => {
        console.log(`Connection established: ${socket.id}`);

        // Filter buses based on user's assigned bus
        const userBusId = socket.handshake.query.busId;
        const filteredBuses = userBusId ? buses.filter(bus => bus.id === userBusId) : buses;

        // 1. Send initial data to the newly connected user
        socket.emit('init-fleet', filteredBuses);

        socket.on('disconnect', () => {
            console.log("A user disconnected");
        });
    });

    // 2. Simulate movement for all buses every 2 seconds
    setInterval(() => {
        buses.forEach(bus => {
            // Move slightly (Approx 100-200 meters)
            bus.lat += (Math.random() - 0.5) * 0.0015;
            bus.lng += (Math.random() - 0.5) * 0.0015;
            // Randomize speed
            bus.speed = Math.floor(Math.random() * 25) + 20;
        });

        // 3. Broadcast the updated positions to EVERYONE connected
        io.emit('fleet-update', buses);
    }, 2000);

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`>>> Bus Tracker Backend Running!`);
        console.log(`>>> Listening on http://localhost:${PORT}`);
    });
}

module.exports = app;