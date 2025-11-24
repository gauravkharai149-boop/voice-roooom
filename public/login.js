// Check if user is already logged in
const storedUsername = localStorage.getItem("userName");
if (storedUsername) {
    window.location.href = "index.html";
}

const usernameInput = document.getElementById("usernameInput");
const loginBtn = document.getElementById("loginBtn");

function login() {
    const username = usernameInput.value.trim();

    if (!username) {
        alert("Please enter your name");
        return;
    }

    if (username.length < 2) {
        alert("Name must be at least 2 characters");
        return;
    }

    // Store username in localStorage
    localStorage.setItem("userName", username);

    // Redirect to main page
    window.location.href = "index.html";
}

loginBtn.addEventListener("click", login);

usernameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        login();
    }
});
