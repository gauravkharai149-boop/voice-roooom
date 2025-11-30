// Initialize socket connection
const socket = io();
let isConnected = false;

// Check if user is logged in
const userName = localStorage.getItem("userName");

let activeRooms = []; // Store rooms locally for filtering

// Update connection status UI
function updateConnectionStatus(connected, message) {
    const statusEl = document.getElementById("connectionStatus");
    const dotEl = document.getElementById("statusDot");

    if (statusEl && dotEl) {
        if (connected) {
            statusEl.innerHTML = `<span id="statusDot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #51cf66; margin-right: 5px;"></span>Connected`;
            statusEl.style.color = "#51cf66";
        } else {
            statusEl.innerHTML = `<span id="statusDot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #ff6b6b; margin-right: 5px;"></span>${message || "Disconnected"}`;
            statusEl.style.color = "#ff6b6b";
        }
    }
}

// Check connection status
socket.on("connect", () => {
    isConnected = true;
    console.log("Connected to server");
    updateConnectionStatus(true, "Connected");
    socket.emit("get-rooms");
});

socket.on("disconnect", () => {
    isConnected = false;
    console.log("Disconnected from server");
    updateConnectionStatus(false, "Disconnected");
});

socket.on("connect_error", (error) => {
    isConnected = false;
    console.error("Connection error:", error);
    updateConnectionStatus(false, "Connection failed");
});

// Create room
document.getElementById("createRoomBtn").addEventListener("click", async () => {
    const roomName = document.getElementById("roomName").value.trim();
    const userName = document.getElementById("userNameCreate").value.trim();
    const language = document.getElementById("roomLanguage").value;
    const level = document.getElementById("roomLevel").value;
    const limit = parseInt(document.getElementById("roomLimit").value) || 4;
    const avatar = localStorage.getItem("userAvatar");

    if (!roomName) return alert("Enter a room name");
    if (!userName) return alert("Enter your name");

    // Wait for connection if not connected
    if (!isConnected) {
        alert("Not connected to server. Please wait...");
        return;
    }

    // Store user name for room page
    localStorage.setItem("userName", userName);

    socket.emit("create-room", {
        topic: roomName,
        name: userName,
        language,
        level,
        limit,
        avatar
    }, (response) => {
        if (response && response.ok) {
            console.log(`Room created: ${response.roomId}, redirecting...`);
            window.location.href = `room.html?room=${response.roomId}`;
        } else {
            alert(response?.error || "Failed to create room");
        }
    });
});

// Join room
document.getElementById("joinRoomBtn").addEventListener("click", () => {
    const roomId = document.getElementById("roomIdInput").value.trim();
    const userName = document.getElementById("userNameJoin").value.trim();

    if (!roomId) return alert("Enter Room ID");
    if (!userName) return alert("Enter your name");

    localStorage.setItem("userName", userName);
    window.location.href = `room.html?room=${roomId}`;
});

// Helper function to join room
function joinRoomFromList(roomId) {
    let userName = localStorage.getItem("userName");

    if (!userName) {
        const userNameInput = document.getElementById("userNameJoin");
        userName = userNameInput ? userNameInput.value.trim() : null;
    }

    if (!userName) {
        userName = prompt("Enter your name to join:") || "Anonymous";
    }

    localStorage.setItem("userName", userName);
    window.location.href = `room.html?room=${roomId}`;
}

// Filter logic
const languageFilter = document.getElementById("languageFilter");
if (languageFilter) {
    languageFilter.addEventListener("change", renderRooms);
}

function renderRooms() {
    const list = document.getElementById("activeRoomsList");
    if (!list) return;

    list.innerHTML = "";

    const filter = languageFilter ? languageFilter.value : "All";
    const filteredRooms = filter === "All"
        ? activeRooms
        : activeRooms.filter(r => r.language === filter);

    if (filteredRooms.length === 0) {
        list.innerHTML = "<li style='padding: 1rem; color: #666; text-align: center;'>No active rooms found</li>";
        return;
    }

    for (const r of filteredRooms) {
        const isFull = r.participantCount >= r.limit;
        const li = document.createElement("li");

        // Flag mapping
        const flags = {
            "English": "🇺🇸", "Spanish": "🇪🇸", "French": "🇫🇷", "German": "🇩🇪",
            "Japanese": "🇯🇵", "Korean": "🇰🇷", "Chinese": "🇨🇳", "Russian": "🇷🇺",
            "Portuguese": "🇧🇷", "Hindi": "🇮🇳", "Arabic": "🇸🇦", "Other": "🌍"
        };
        const flag = flags[r.language] || "💬";

        // Avatar HTML
        let avatarHtml = '';
        if (r.creatorAvatar) {
            avatarHtml = `<img src="${r.creatorAvatar}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; margin-right: 10px; border: 2px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">`;
        } else {
            avatarHtml = `<div style="width: 40px; height: 40px; border-radius: 50%; background: #e2e8f0; margin-right: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">👤</div>`;
        }

        li.innerHTML = `
            <div class="left">
                ${avatarHtml}
                <div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        <b>${r.topic}</b>
                        <span class="badge ${r.level.toLowerCase()}">${r.level}</span>
                        <span style="font-size: 1.2rem; margin-left: 5px;">${flag}</span>
                    </div>
                    <p>
                        <span style="color: ${isFull ? '#e53e3e' : '#48bb78'}; font-weight: 600;">
                            ${r.participantCount}/${r.limit}
                        </span> 
                        participants • ${r.language}
                    </p>
                </div>
            </div>
            <button class="join" onclick="joinRoomFromList('${r.id}')" ${isFull ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                ${isFull ? 'FULL' : 'JOIN'}
            </button>
        `;
        list.appendChild(li);
    }
}

// List active rooms
socket.on("rooms-update", (rooms) => {
    activeRooms = rooms;
    renderRooms();
});

// Handle Enter key for inputs
function handleEnterKey(inputId, buttonId) {
    const input = document.getElementById(inputId);
    if (input) {
        input.addEventListener("keypress", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                document.getElementById(buttonId).click();
            }
        });
    }
}

handleEnterKey("userNameCreate", "createRoomBtn");
handleEnterKey("roomName", "createRoomBtn");
handleEnterKey("userNameJoin", "joinRoomBtn");
handleEnterKey("roomIdInput", "joinRoomBtn");
