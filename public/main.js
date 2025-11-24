// Check if user is logged in
const userName = localStorage.getItem("userName");
if (!userName) {
    window.location.href = "login.html";
}

const socket = io();

let isConnected = false;

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
    // alert("Failed to connect to server. Please make sure the server is running on http://localhost:8080 (or check the console for the actual port).");
});

// Create room
document.getElementById("createRoomBtn").addEventListener("click", async () => {
    const roomName = document.getElementById("roomName").value.trim();
    const userName = document.getElementById("userNameCreate").value.trim();

    if (!roomName) return alert("Enter a room name");
    if (!userName) return alert("Enter your name");

    // Wait for connection if not connected
    if (!isConnected) {
        const waitForConnection = () => {
            return new Promise((resolve) => {
                if (isConnected) {
                    resolve();
                } else {
                    const checkConnection = setInterval(() => {
                        if (isConnected) {
                            clearInterval(checkConnection);
                            resolve();
                        }
                    }, 100);

                    // Timeout after 5 seconds
                    setTimeout(() => {
                        clearInterval(checkConnection);
                        if (!isConnected) {
                            alert("Cannot connect to server. Please check if the server is running.");
                        }
                    }, 5000);
                }
            });
        };

        await waitForConnection();
        if (!isConnected) return;
    }

    // Store user name for room page
    localStorage.setItem("userName", userName);

    // Add timeout for create-room
    const timeout = setTimeout(() => {
        alert("Server did not respond. Please check if the server is running.");
    }, 5000);

    socket.emit("create-room", { topic: roomName, name: userName }, (response) => {
        clearTimeout(timeout);

        if (!response) {
            alert("No response from server. Please try again.");
            return;
        }

        if (response.ok) {
            // Small delay to ensure room is fully set up before redirect
            console.log(`Room created: ${response.roomId}, redirecting...`);
            setTimeout(() => {
                window.location.href = `room.html?room=${response.roomId}`;
            }, 100); // 100ms delay
        } else {
            alert(response.error || "Failed to create room");
        }
    });
});

// Join room
document.getElementById("joinRoomBtn").addEventListener("click", () => {
    const roomId = document.getElementById("roomIdInput").value.trim();
    const userName = document.getElementById("userNameJoin").value.trim();

    if (!roomId) return alert("Enter Room ID");
    if (!userName) return alert("Enter your name");

    // Store user name for room page
    localStorage.setItem("userName", userName);

    window.location.href = `room.html?room=${roomId}`;
});

// Helper function to join room
function joinRoomFromList(roomId) {
    // Check if we have a stored user name
    let userName = localStorage.getItem("userName");

    // If no stored name, try to get from join form
    if (!userName) {
        const userNameInput = document.getElementById("userNameJoin");
        userName = userNameInput ? userNameInput.value.trim() : null;
    }

    // If still no name, prompt
    if (!userName) {
        userName = prompt("Enter your name to join:") || "Anonymous";
    }

    // Store for room page
    localStorage.setItem("userName", userName);

    window.location.href = `room.html?room=${roomId}`;
}

// List active rooms
socket.on("rooms-update", (rooms) => {
    const list = document.getElementById("activeRoomsList");
    list.innerHTML = "";

    if (rooms.length === 0) {
        list.innerHTML = "<li style='padding: 1rem; color: #666;'>No active rooms</li>";
        return;
    }

    for (const r of rooms) {
        const li = document.createElement("li");
        li.innerHTML = `
            <div class="left">
                <span>🎧</span>
                <div>
                    <b>${r.topic}</b>
                    <p>${r.id} • ${r.participantCount} participant${r.participantCount !== 1 ? 's' : ''}</p>
                </div>
            </div>
            <button class="join" onclick="joinRoomFromList('${r.id}')">JOIN</button>
        `;
        list.appendChild(li);
    }
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

// Add Enter key listeners
handleEnterKey("userNameCreate", "createRoomBtn");
handleEnterKey("roomName", "createRoomBtn");
handleEnterKey("userNameJoin", "joinRoomBtn");
handleEnterKey("roomIdInput", "joinRoomBtn");
