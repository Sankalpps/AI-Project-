const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.use((req, res, next) => {
    const decodedPath = decodeURIComponent(req.path || '');
    if (/^\/[a-zA-Z]:\//.test(decodedPath)) {
        return res.redirect('/');
    }
    next();
});

// Serve index.html and static files from the same folder
app.use(express.static(__dirname));

// Enable CORS so your browser can talk to this server
const io = new Server(server, { 
    cors: { origin: "*" } 
});

// Initial Fleet Data - Set in Mysore, Karnataka
let buses = [
    { id: 'BUS-101', route: 'KRS Dam', lat: 12.3051, lng: 76.6550, speed: 40, color: '#ff0000' },
    { id: 'BUS-202', route: 'NIE NORTH', lat: 12.371214742514967, lng: 76.58488491499308, speed: 35, color: '#28a745' },
    { id: 'BUS-303', route: 'Infosys Campus', lat: 12.3550, lng: 76.6000, speed: 45, color: '#00d5ff' },
    { id: 'BUS-304', route: 'NIE SOUTH', lat: 12.28393,  lng: 76.64143, speed: 45, color: '#007bff' },
];

io.on('connection', (socket) => {
    console.log(`Connection established: ${socket.id}`);
    
    // 1. Send initial data to the newly connected user
    socket.emit('init-fleet', buses);

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