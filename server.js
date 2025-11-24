import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
let server = http.createServer(app);
let io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Serve static files from "public" folder
app.use(express.static(join(__dirname, 'public')));

// Default route - serve login page
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'login.html'));
});

// Fallback for any other routes - serve index.html or login
app.get('*', (req, res) => {
    // If requesting a file that doesn't exist, send 404
    if (req.path.includes('.')) {
        res.status(404).send('File not found');
    } else {
        // Otherwise redirect to login
        res.sendFile(join(__dirname, 'public', 'login.html'));
    }
});

// Room storage: roomId -> { topic, participants: Map<socketId, { name, socketId }> }
const rooms = new Map();

// Generate unique room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 9).toUpperCase();
}

// Get room info
function getRoomInfo(roomId) {
    const room = rooms.get(roomId);
    if (!room) return null;
    return {
        id: roomId,
        topic: room.topic,
        participantCount: room.participants.size
    };
}

// Get all active rooms
function getAllRooms() {
    return Array.from(rooms.entries())
        .map(([id, room]) => ({
            id,
            topic: room.topic,
            participantCount: room.participants.size
        }))
        .filter(room => room.participantCount > 0);
}

// Cleanup empty rooms (with delay to allow navigation)
function cleanupRoom(roomId) {
    const room = rooms.get(roomId);
    if (room && room.participants.size === 0) {
        const roomAge = Date.now() - (room.createdAt || 0);
        const delay = roomAge < 5000 ? 5000 : 3000;

        setTimeout(() => {
            const checkRoom = rooms.get(roomId);
            if (checkRoom && checkRoom.participants.size === 0) {
                rooms.delete(roomId);
                io.emit('rooms-update', getAllRooms());
                console.log(`Room ${roomId} cleaned up (empty after ${delay}ms delay)`);
            }
        }, delay);
    }
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

    try {
        const availablePort = await findAvailablePort(startPort);
        server.listen(availablePort, () => {
            console.log(`Server running on http://localhost:${availablePort}`);
            fs.writeFileSync('port.txt', availablePort.toString());
        });

        server.on('error', (err) => {
            console.error('Server error:', err);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
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
function attachSocketHandlers() {
    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);

        socket.emit('rooms-update', getAllRooms());

        socket.on('get-rooms', () => {
            socket.emit('rooms-update', getAllRooms());
        });

        socket.on('create-room', ({ topic, name }, callback) => {
            try {
                if (!topic || !name) {
                    return callback?.({ ok: false, error: 'Topic and name are required' });
                }

                const roomId = generateRoomId();
                const room = {
                    topic: topic.trim(),
                    participants: new Map(),
                    createdAt: Date.now()
                };
                rooms.set(roomId, room);

                socket.join(roomId);
                room.participants.set(socket.id, { name: name.trim(), socketId: socket.id });
                socket.data.roomId = roomId;
                socket.data.name = name.trim();

                console.log(`Room created: ${roomId} by ${name.trim()}`);
                io.emit('rooms-update', getAllRooms());
                callback?.({ ok: true, roomId, topic: room.topic });
            } catch (err) {
                console.error('Error creating room:', err);
                callback?.({ ok: false, error: 'Failed to create room' });
            }
        });

        socket.on('join-room', ({ roomId, name }, callback) => {
            try {
                if (!roomId || !name) {
                    return callback?.({ ok: false, error: 'Room ID and name are required' });
                }

                const room = rooms.get(roomId);
                if (!room) {
                    console.log(`Join attempt failed: Room ${roomId} not found`);
                    return callback?.({ ok: false, error: 'Room not found' });
                }

                socket.join(roomId);
                room.participants.set(socket.id, { name: name.trim(), socketId: socket.id });
                socket.data.roomId = roomId;
                socket.data.name = name.trim();

                socket.to(roomId).emit('user-joined', { socketId: socket.id, name: name.trim() });

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
            if (!socket.data.roomId || socket.data.roomId !== roomId) return;
            const name = socket.data.name || 'Anonymous';
            io.to(roomId).emit('chat-message', { socketId: socket.id, name, message });
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
            const roomId = socket.data.roomId;
            if (roomId) {
                const room = rooms.get(roomId);
                if (room) {
                    room.participants.delete(socket.id);
                    socket.to(roomId).emit('user-left', {
                        socketId: socket.id,
                        name: socket.data.name || 'Anonymous'
                    });
                    io.emit('rooms-update', getAllRooms());
                    cleanupRoom(roomId);
                }
            }
        });
    });
}

attachSocketHandlers();
startServer();
