const socket = io();

// Get room ID from URL
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("room");
const userName = localStorage.getItem("userName");
const userAvatar = localStorage.getItem("userAvatar");

if (!roomId || !userName) {
    window.location.href = "app.html";
}

// Update UI
document.getElementById("roomIdDisplay").innerText = roomId;
document.getElementById("roomTitle").innerText = `Room: ${roomId}`;

// WebRTC Configuration
const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

let localStream;
let screenStream;
let peers = {}; // socketId -> RTCPeerConnection
let participantsList = []; // Array of { socketId, name, avatar }

// DOM Elements
const micBtn = document.getElementById("micBtn");
const muteBtn = document.getElementById("muteBtn");
const shareScreenBtn = document.getElementById("shareScreenBtn");
const statusText = document.getElementById("statusText");
const participantCount = document.getElementById("participantCount");
const logBox = document.getElementById("logBox");
const videoGrid = document.getElementById("videoGrid");
const videoContainer = document.getElementById("videoContainer");
const participantGrid = document.getElementById("participantGrid");

// Join Room
socket.emit("join-room", { roomId, name: userName, avatar: userAvatar }, (response) => {
    if (response.ok) {
        log("System", `Joined room: ${response.topic}`);

        // Initialize participants list with existing users + self
        participantsList = response.participants || [];
        participantsList.push({ socketId: socket.id, name: userName, avatar: userAvatar, isSelf: true });

        updateParticipantGrid();
        initializeAudio();
    } else {
        alert(response.error || "Failed to join room");
        window.location.href = "app.html";
    }
});

// Initialize Audio
async function initializeAudio() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        statusText.innerText = "Connected (Audio Active)";
        statusText.style.color = "#48bb78";
    } catch (err) {
        console.error("Error accessing microphone:", err);
        statusText.innerText = "Mic Access Denied";
        statusText.style.color = "#e53e3e";
        log("System", "Could not access microphone. You can still listen.");
    }
}

// Socket Events
socket.on("user-joined", async ({ socketId, name, avatar }) => {
    log("System", `${name} joined the room`);
    participantsList.push({ socketId, name, avatar });
    updateParticipantGrid();
    createPeerConnection(socketId, name, true);
});

socket.on("user-left", ({ socketId, name }) => {
    log("System", `${name} left the room`);
    participantsList = participantsList.filter(p => p.socketId !== socketId);
    updateParticipantGrid();

    if (peers[socketId]) {
        peers[socketId].close();
        delete peers[socketId];
    }
    // Remove video if exists
    const videoEl = document.getElementById(`video-${socketId}`);
    if (videoEl) videoEl.remove();
    updateVideoContainer();
});

socket.on("webrtc-offer", async ({ fromId, offer }) => {
    const peer = createPeerConnection(fromId, "User", false);
    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit("webrtc-answer", { roomId, targetId: fromId, answer });
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

socket.on("chat-message", ({ name, message }) => {
    log(name, message);
});

// WebRTC Functions
function createPeerConnection(targetId, name, isInitiator) {
    const peer = new RTCPeerConnection(rtcConfig);
    peers[targetId] = peer;

    // Add local tracks
    if (localStream) {
        localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
    }

    // If screen sharing, add those tracks too
    if (screenStream) {
        screenStream.getTracks().forEach(track => peer.addTrack(track, screenStream));
    }

    // Handle ICE candidates
    peer.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("webrtc-ice-candidate", { roomId, targetId, candidate: event.candidate });
        }
    };

    // Handle incoming tracks
    peer.ontrack = (event) => {
        const stream = event.streams[0];
        if (event.track.kind === 'video') {
            addVideo(targetId, stream, name);
        } else {
            const audio = new Audio();
            audio.srcObject = stream;
            audio.play();
        }
    };

    // Create Offer if initiator
    if (isInitiator) {
        peer.createOffer().then(offer => {
            peer.setLocalDescription(offer);
            socket.emit("webrtc-offer", { roomId, targetId, offer });
        });
    }

    return peer;
}

// Screen Sharing Logic
shareScreenBtn.addEventListener("click", async () => {
    if (screenStream) {
        stopScreenShare();
        return;
    }

    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });

        // Add local video preview
        addVideo("local", screenStream, "You");

        // Add tracks to all peers
        const videoTrack = screenStream.getVideoTracks()[0];
        for (const peerId in peers) {
            const sender = peers[peerId].getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(videoTrack);
            } else {
                peers[peerId].addTrack(videoTrack, screenStream);
                // Renegotiate
                peers[peerId].createOffer().then(offer => {
                    peers[peerId].setLocalDescription(offer);
                    socket.emit("webrtc-offer", { roomId, targetId: peerId, offer });
                });
            }
        }

        // Handle stop sharing via browser UI
        videoTrack.onended = () => stopScreenShare();

        shareScreenBtn.innerHTML = "<span>🛑</span> Stop Sharing";
        shareScreenBtn.classList.remove("blue");
        shareScreenBtn.classList.add("pink");
    } catch (err) {
        console.error("Error sharing screen:", err);
    }
});

function stopScreenShare() {
    if (!screenStream) return;

    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;

    // Remove local video
    const videoEl = document.getElementById("video-local");
    if (videoEl) videoEl.remove();
    updateVideoContainer();

    // Remove tracks from peers
    for (const peerId in peers) {
        const sender = peers[peerId].getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
            peers[peerId].removeTrack(sender);
            // Renegotiate
            peers[peerId].createOffer().then(offer => {
                peers[peerId].setLocalDescription(offer);
                socket.emit("webrtc-offer", { roomId, targetId: peerId, offer });
            });
        }
    }

    shareScreenBtn.innerHTML = "<span>🖥️</span> Share Screen";
    shareScreenBtn.classList.remove("pink");
    shareScreenBtn.classList.add("blue");
}

function addVideo(id, stream, name) {
    const existing = document.getElementById(`video-${id}`);
    if (existing) existing.remove();

    const wrapper = document.createElement("div");
    wrapper.id = `video-${id}`;
    wrapper.style.position = "relative";

    const video = document.createElement("video");
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.style.width = "100%";
    video.style.borderRadius = "8px";
    video.style.border = "2px solid #e2e8f0";

    const label = document.createElement("div");
    label.innerText = name;
    label.style.position = "absolute";
    label.style.bottom = "8px";
    label.style.left = "8px";
    label.style.background = "rgba(0,0,0,0.6)";
    label.style.color = "white";
    label.style.padding = "2px 8px";
    label.style.borderRadius = "4px";
    label.style.fontSize = "0.8rem";

    wrapper.appendChild(video);
    wrapper.appendChild(label);
    videoGrid.appendChild(wrapper);
    updateVideoContainer();
}

function updateVideoContainer() {
    if (videoGrid.children.length > 0) {
        videoContainer.style.display = "block";
    } else {
        videoContainer.style.display = "none";
    }
}

function updateParticipantGrid() {
    participantGrid.innerHTML = "";
    participantCount.innerText = participantsList.length;

    participantsList.forEach(p => {
        const card = document.createElement("div");
        card.style.background = "white";
        card.style.borderRadius = "8px";
        card.style.padding = "10px";
        card.style.textAlign = "center";
        card.style.boxShadow = "0 2px 4px rgba(0,0,0,0.05)";
        card.style.border = "1px solid #e2e8f0";

        let avatarHtml = '';
        if (p.avatar) {
            avatarHtml = `<img src="${p.avatar}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; margin-bottom: 5px; border: 2px solid #667eea;">`;
        } else {
            avatarHtml = `<div style="width: 50px; height: 50px; border-radius: 50%; background: #e2e8f0; margin: 0 auto 5px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">👤</div>`;
        }

        card.innerHTML = `
            ${avatarHtml}
            <div style="font-weight: 600; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name}</div>
            ${p.isSelf ? '<span style="font-size: 0.7rem; color: #718096;">(You)</span>' : ''}
        `;
        participantGrid.appendChild(card);
    });
}

// Chat Logic
document.getElementById("sendBtn").addEventListener("click", sendMessage);
document.getElementById("chatMessage").addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
});

function sendMessage() {
    const input = document.getElementById("chatMessage");
    const message = input.value.trim();
    if (message) {
        socket.emit("chat-message", { roomId, message });
        log("You", message);
        input.value = "";
    }
}

function log(sender, message) {
    const div = document.createElement("div");
    div.innerHTML = `<strong>${sender}:</strong> ${message}`;
    logBox.appendChild(div);
    logBox.scrollTop = logBox.scrollHeight;
}

// Controls
micBtn.addEventListener("click", () => {
    if (localStream) {
        const track = localStream.getAudioTracks()[0];
        track.enabled = !track.enabled;
        micBtn.innerHTML = track.enabled ? `<span id="micIcon">🎤</span> Mic` : `<span id="micIcon">🚫</span> Muted`;
        micBtn.classList.toggle("pink");
        micBtn.classList.toggle("blue");
    }
});

muteBtn.addEventListener("click", () => {
    const isMuted = muteBtn.classList.contains("blue");
    document.querySelectorAll("audio").forEach(a => a.muted = !isMuted);

    if (isMuted) {
        muteBtn.innerHTML = `<span id="muteIcon">🔊</span> Mute AI`;
        muteBtn.classList.remove("blue");
        muteBtn.classList.add("pink");
    } else {
        muteBtn.innerHTML = `<span id="muteIcon">🔇</span> Unmute`;
        muteBtn.classList.remove("pink");
        muteBtn.classList.add("blue");
    }
});

function leaveRoom() {
    window.location.href = "app.html";
}
