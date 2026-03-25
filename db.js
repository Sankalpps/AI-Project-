const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Create users table
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        bus_id TEXT NOT NULL
    )
`);

const SALT_ROUNDS = 10;

// Seed default users if the table is empty
const count = db.prepare('SELECT COUNT(*) AS cnt FROM users').get();
if (count.cnt === 0) {
    const insert = db.prepare('INSERT INTO users (username, password, bus_id) VALUES (?, ?, ?)');
    const seedUsers = [
        { username: 'user1',  password: 'pass123', busId: 'BUS-101' },
        { username: 'user2',  password: 'pass123', busId: 'BUS-102' },
        { username: 'user3',  password: 'pass123', busId: 'BUS-103' },
        { username: 'user4',  password: 'pass123', busId: 'BUS-104' },
        { username: 'user5',  password: 'pass123', busId: 'BUS-105' },
        { username: 'user6',  password: 'pass123', busId: 'BUS-106' },
        { username: 'user7',  password: 'pass123', busId: 'BUS-107' },
        { username: 'user8',  password: 'pass123', busId: 'BUS-108' },
        { username: 'user9',  password: 'pass123', busId: 'BUS-109' },
        { username: 'user10', password: 'pass123', busId: 'BUS-110' }
    ];

    const seedAll = db.transaction((users) => {
        for (const u of users) {
            const hash = bcrypt.hashSync(u.password, SALT_ROUNDS);
            insert.run(u.username, hash, u.busId);
        }
    });
    seedAll(seedUsers);
    console.log('Database seeded with 10 default users.');
}

// Query helpers used by server.js
function findUserByCredentials(username, password) {
    const user = db.prepare(
        'SELECT username, password, bus_id AS busId FROM users WHERE username = ?'
    ).get(username);

    if (!user) return null;
    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) return null;

    return { username: user.username, busId: user.busId };
}

// Graceful shutdown
function closeDb() {
    db.close();
}
process.on('exit', closeDb);
process.on('SIGINT', () => { closeDb(); process.exit(0); });
process.on('SIGTERM', () => { closeDb(); process.exit(0); });

module.exports = { db, findUserByCredentials };
