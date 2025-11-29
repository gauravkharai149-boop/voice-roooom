import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
fs.writeFileSync('debug_start.txt', 'Server initializing...\n');
console.log("Initializing server...");
let server = http.createServer(app);
let io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Serve static files from "public" folder
app.use(express.static(join(__dirname, 'public')));
app.use(express.json());

// Default route - serve auth page
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'auth.html'));
});

// Fallback for any other routes - serve index.html or login
app.get('*', (req, res) => {
    // If requesting a file that doesn't exist, send 404
    if (req.path.includes('.')) {
        res.status(404).send('File not found');
    } else {
        // Otherwise redirect to auth
        res.sendFile(join(__dirname, 'public', 'auth.html'));
    }
});

// User storage: email -> { passwordHash, email, verificationCode, isVerified }
const users = new Map();

// Auth Endpoints
app.post('/api/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        if (users.has(email)) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        users.set(email, {
            email,
            passwordHash,
            isVerified: true // Auto-verify users (no email verification required)
        });

        console.log(`User registered: ${email}`);

        res.json({ ok: true, message: 'Registration successful! You can now login.' });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = users.get(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate a simple token (in production use JWT)
        const token = Buffer.from(email).toString('base64');

        res.json({ ok: true, token, email });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Room storage: roomId -> { topic, participants: Map<socketId, { name, socketId }> }
const rooms = new Map();

// Generate unique room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 9).toUpperCase();
}

// Get all active rooms
function getAllRooms() {
    return Array.from(rooms.entries())
        .map(([id, room]) => ({
            id,
            topic: room.topic,
            language: room.language || 'Other',
            level: room.level || 'Any',
            limit: room.limit || 4,
            creatorAvatar: room.creatorAvatar,
            participantCount: room.participants.size,
            avatars: Array.from(room.participants.values()).map(p => p.avatar).slice(0, 3) // Preview 3 avatars
        }))
        .filter(room => room.participantCount > 0);
}

// PORT setup - automatically find available port
const findAvailablePort = (startPort, maxAttempts = 10) => {
    return new Promise((resolve, reject) => {
        let currentPort = startPort;
        let attempts = 0;

        const tryPort = () => {
            if (attempts >= maxAttempts) {
                reject(new Error(`Could not find available port after ${maxAttempts} attempts`));
                return;
            }

            const testServer = http.createServer();
            testServer.listen(currentPort, () => {
                testServer.close(() => {
                    resolve(currentPort);
                });
            });

            testServer.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    attempts++;
                    console.log(`Port ${currentPort} is in use, trying ${currentPort + 1}...`);
                    currentPort++;
                    tryPort();
                } else {
                    reject(err);
                }
            });
        };

        tryPort();
    });
};

const startServer = async () => {
    const startPort = parseInt(process.env.PORT) || 3000;
    fs.appendFileSync('debug_start.txt', `Starting server on port ${startPort}...\n`);

    try {
        const availablePort = await findAvailablePort(startPort);
        fs.appendFileSync('debug_start.txt', `Found available port: ${availablePort}\n`);

        server.listen(availablePort, () => {
            console.log(`Server running on http://localhost:${availablePort}`);
            fs.appendFileSync('debug_start.txt', `Server listening on ${availablePort}\n`);
            fs.writeFileSync('port.txt', availablePort.toString());
        });

        server.on('error', (err) => {
            console.error('Server error:', err);
            fs.appendFileSync('debug_start.txt', `Server error: ${err.message}\n`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        fs.appendFileSync('debug_start.txt', `Failed to start: ${err.message}\n`);
        process.exit(1);
    }
};

// REST API endpoint for fetching rooms
app.get('/rooms', (req, res) => {
    try {
        res.json(getAllRooms());
    } catch (err) {
        console.error('Error fetching rooms:', err);
        res.status(500).json({ error: 'Failed to fetch rooms' });
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.emit('rooms-update', getAllRooms());

    socket.on('get-rooms', () => {
        socket.emit('rooms-update', getAllRooms());
    });

    socket.on('create-room', ({ topic, name, language, level, limit, avatar }, callback) => {
        try {
            if (!topic || !name) {
                return callback?.({ ok: false, error: 'Topic and name are required' });
            }

            const roomId = generateRoomId();
            const room = {
                topic: topic.trim(),
                language: language || 'Other',
                level: level || 'Any',
                limit: limit || 4,
                creatorAvatar: avatar,
                participants: new Map(),
                createdAt: Date.now()
            };
            rooms.set(roomId, room);

            socket.join(roomId);
            room.participants.set(socket.id, { name: name.trim(), socketId: socket.id, avatar });
            socket.data.roomId = roomId;
            socket.data.name = name.trim();
            socket.data.avatar = avatar;

            console.log(`Room created: ${roomId} by ${name.trim()}`);
            io.emit('rooms-update', getAllRooms());
            callback?.({ ok: true, roomId, topic: room.topic });
        } catch (err) {
            console.error('Error creating room:', err);
            callback?.({ ok: false, error: 'Failed to create room' });
        }
    });

    socket.on('join-room', ({ roomId, name, avatar }, callback) => {
        try {
            if (!roomId || !name) {
                return callback?.({ ok: false, error: 'Room ID and name are required' });
            }

            const room = rooms.get(roomId);
            if (!room) {
                console.log(`Join attempt failed: Room ${roomId} not found`);
                return callback?.({ ok: false, error: 'Room not found' });
            }

            if (room.participants.size >= (room.limit || 4)) {
                return callback?.({ ok: false, error: 'Room is full' });
            }

            socket.join(roomId);
            room.participants.set(socket.id, { name: name.trim(), socketId: socket.id, avatar });
            socket.data.roomId = roomId;
            socket.data.name = name.trim();
            socket.data.avatar = avatar;

            socket.to(roomId).emit('user-joined', { socketId: socket.id, name: name.trim(), avatar });

            // Send existing participants list
            const participants = Array.from(room.participants.values())
                .filter(p => p.socketId !== socket.id);

            io.emit('rooms-update', getAllRooms());
            callback?.({
                ok: true,
                topic: room.topic,
                participants
            });
        } catch (err) {
            console.error('Error joining room:', err);
            callback?.({ ok: false, error: 'Failed to join room' });
        }
    });

    // WebRTC Signaling
    socket.on('webrtc-offer', ({ roomId, targetId, offer }) => {
        socket.to(targetId).emit('webrtc-offer', { fromId: socket.id, offer });
    });

    socket.on('webrtc-answer', ({ roomId, targetId, answer }) => {
        socket.to(targetId).emit('webrtc-answer', { fromId: socket.id, answer });
    });

    socket.on('webrtc-ice-candidate', ({ roomId, targetId, candidate }) => {
        socket.to(targetId).emit('webrtc-ice-candidate', { fromId: socket.id, candidate });
    });

    socket.on('chat-message', ({ roomId, message }) => {
        const name = socket.data.name || 'Anonymous';
        io.to(roomId).emit('chat-message', { name, message });
    });

    socket.on('disconnect', () => {
        const roomId = socket.data.roomId;
        if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
                room.participants.delete(socket.id);
                socket.to(roomId).emit('user-left', { socketId: socket.id, name: socket.data.name });
                io.emit('rooms-update', getAllRooms());

                // Cleanup empty rooms
                if (room.participants.size === 0) {
                    setTimeout(() => {
                        const checkRoom = rooms.get(roomId);
                        if (checkRoom && checkRoom.participants.size === 0) {
                            rooms.delete(roomId);
                            io.emit('rooms-update', getAllRooms());
                        }
                    }, 5000);
                }
            }
        }
        console.log('Client disconnected:', socket.id);
    });
});

startServer();
