const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("room");

if (!roomId) {
    alert("No room ID provided");
    window.location.href = "index.html";
}

const logBox = document.getElementById("logBox");
const chatInput = document.getElementById("chatMessage");
const sendBtn = document.getElementById("sendBtn");
let participantCount = 1;

function addLog(msg) {
    logBox.innerHTML += `<div>${msg}</div>`;
    logBox.scrollTop = logBox.scrollHeight;
}

function updateStatus(status) {
    document.getElementById("statusText").innerText = status;
    document.getElementById("connectionStatus").innerText = status;
}

function updateParticipantCount(count) {
    participantCount = count;
    document.getElementById("participantCount").innerText = count;
}

addLog("📡 Connecting to server...");
updateStatus("Connecting...");

// Display room ID
document.getElementById("roomIdDisplay").innerText = roomId;

// Socket connection
const socket = io();

// WebRTC Variables
let localStream;
const peers = {}; // socketId -> RTCPeerConnection

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// --- Socket Events ---

socket.on("connect", async () => {
    addLog("✅ Connected to server");

    // Get user name
    let userName = localStorage.getItem("userName");
    if (!userName) {
        userName = prompt("Enter your name:") || "Anonymous";
        localStorage.setItem("userName", userName);
    }

    // Initialize Audio
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        addLog("🎤 Microphone access granted");
    } catch (err) {
        addLog("❌ Microphone access denied: " + err.message);
        console.error("Mic error:", err);
    }

    // Join room with retry logic
    let retryCount = 0;
    const maxRetries = 3;

    const attemptJoin = () => {
        socket.emit("join-room", { roomId, name: userName }, (response) => {
            if (response && response.ok) {
                addLog(`✅ Joined room: ${response.topic}`);
                updateStatus(`Connected • ${response.topic}`);
                document.getElementById("roomTitle").innerText = `Room: ${response.topic}`;

                const totalParticipants = (response.participants?.length || 0) + 1;
                updateParticipantCount(totalParticipants);

                if (response.participants && response.participants.length > 0) {
                    addLog(`👥 ${response.participants.length} other participant(s)`);

                    // Initiate WebRTC with existing participants
                    response.participants.forEach(p => {
                        createPeer(p.socketId, p.name, true); // true = initiator
                    });
                } else {
                    addLog("👥 You're the first participant");
                }
            } else {
                const error = response?.error || "Unknown error";
                addLog(`❌ Failed to join room: ${error}`);

                // Retry if room not found and we haven't exceeded max retries
                if (error === "Room not found" && retryCount < maxRetries) {
                    retryCount++;
                    addLog(`🔄 Retrying... (${retryCount}/${maxRetries})`);
                    setTimeout(attemptJoin, 1000 * retryCount); // Exponential backoff
                } else {
                    updateStatus("Failed to connect");
                    alert(error || "Failed to join room");
                    setTimeout(() => {
                        window.location.href = "index.html";
                    }, 2000);
                }
            }
        });
    };

    // Start join attempt
    attemptJoin();
});

socket.on("user-joined", ({ socketId, name }) => {
    addLog(`👋 ${name} joined`);
    updateParticipantCount(participantCount + 1);
    createPeer(socketId, name, false); // false = not initiator (wait for offer)
});

socket.on("user-left", ({ socketId, name }) => {
    addLog(`👋 ${name} left`);
    updateParticipantCount(Math.max(1, participantCount - 1));

    // Cleanup peer
    if (peers[socketId]) {
        peers[socketId].close();
        delete peers[socketId];
    }

    // Remove audio element
    const audioEl = document.getElementById(`audio-${socketId}`);
    if (audioEl) audioEl.remove();
});

socket.on("chat-message", ({ name, message }) => {
    const isMe = name === localStorage.getItem("userName");
    const style = isMe ? "color: #00BFFF; font-weight: bold;" : "color: #ff2fa3; font-weight: bold;";
    const senderDisplay = isMe ? "You" : name;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    logBox.innerHTML += `
        <div style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
            <span style="${style}">${senderDisplay}</span> <span style="font-size: 0.8em; opacity: 0.7;">${time}</span><br>
            <span style="color: #004080;">${message}</span>
        </div>
    `;
    logBox.scrollTop = logBox.scrollHeight;
});

// --- WebRTC Signaling ---

socket.on("webrtc-offer", async ({ fromId, offer }) => {
    const peer = peers[fromId];
    if (peer) {
        await peer.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit("webrtc-answer", { roomId, targetId: fromId, answer });
    }
});

socket.on("webrtc-answer", async ({ fromId, answer }) => {
    const peer = peers[fromId];
    if (peer) {
        await peer.setRemoteDescription(new RTCSessionDescription(answer));
    }
});

socket.on("webrtc-ice-candidate", async ({ fromId, candidate }) => {
    const peer = peers[fromId];
    if (peer) {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
    }
});


// --- WebRTC Functions ---

function createPeer(targetId, name, initiator) {
    const peer = new RTCPeerConnection(rtcConfig);
    peers[targetId] = peer;

    // Add local stream
    if (localStream) {
        localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
    }

    // Handle ICE candidates
    peer.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("webrtc-ice-candidate", { roomId, targetId, candidate: event.candidate });
        }
    };

    // Handle incoming stream
    peer.ontrack = (event) => {
        addLog(`🔊 Receiving audio from ${name}`);
        let audio = document.getElementById(`audio-${targetId}`);
        if (!audio) {
            audio = document.createElement('audio');
            audio.id = `audio-${targetId}`;
            audio.autoplay = true;
            document.body.appendChild(audio);
        }
        audio.srcObject = event.streams[0];
    };

    // Create Offer if initiator
    if (initiator) {
        peer.createOffer().then(offer => {
            peer.setLocalDescription(offer);
            socket.emit("webrtc-offer", { roomId, targetId, offer });
        });
    }
}


// --- UI Controls ---

// Chat
function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    socket.emit("chat-message", { roomId, message: text });
    chatInput.value = "";
}

sendBtn.addEventListener("click", sendMessage);
chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
});


// Audio Controls
let micEnabled = true;
let aiMuted = false; // "Mute AI" button acts as "Mute All Incoming" for now? Or just ignored since no AI.

document.getElementById("micBtn").onclick = () => {
    micEnabled = !micEnabled;
    if (localStream) {
        localStream.getAudioTracks()[0].enabled = micEnabled;
    }
    const icon = document.getElementById("micIcon");
    icon.textContent = micEnabled ? "🎤" : "🔇";
    // addLog(micEnabled ? "🎤 Mic Unmuted" : "🔇 Mic Muted");
};

document.getElementById("muteBtn").onclick = () => {
    // Mute all incoming audio
    aiMuted = !aiMuted;
    document.querySelectorAll('audio').forEach(a => a.muted = aiMuted);

    const icon = document.getElementById("muteIcon");
    icon.textContent = aiMuted ? "🔈" : "🔊";
    // addLog(aiMuted ? "🔈 Audio Muted" : "🔊 Audio Unmuted");
};

document.getElementById("speakBtn").onclick = () => {
    addLog("🗣️ Talk button (Push-to-talk logic not implemented, use Mic toggle)");
};

// Leave room
window.leaveRoom = function () {
    socket.disconnect();
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    window.location.href = "index.html";
};
