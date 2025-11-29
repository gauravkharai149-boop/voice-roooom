// Circuit Breaker
function checkRedirectLoop() {
    const MAX_REDIRECTS = 3;
    const TIME_WINDOW = 5000;
    const now = Date.now();
    let loopData = JSON.parse(sessionStorage.getItem('redirectLoopData') || '{"count":0,"last":0}');

    if (now - loopData.last < TIME_WINDOW) {
        loopData.count++;
    } else {
        loopData.count = 1;
    }
    loopData.last = now;
    sessionStorage.setItem('redirectLoopData', JSON.stringify(loopData));

    if (loopData.count > MAX_REDIRECTS) {
        alert("Redirect loop detected! Stopping.");
        return true;
    }
    return false;
}

// Check if authenticated
const token = localStorage.getItem('authToken');

if (!token) {
    if (!checkRedirectLoop()) window.location.href = '/';
}

// If already has userName, go straight to index
const existingName = localStorage.getItem('userName');
if (existingName) {
    if (!checkRedirectLoop()) window.location.href = 'app.html';
}

const usernameInput = document.getElementById('usernameInput');
const loginBtn = document.getElementById('loginBtn');
const avatarInput = document.getElementById('avatarInput');
const avatarPreview = document.getElementById('avatarPreview');
const avatarPlaceholder = document.getElementById('avatarPlaceholder');

// Load saved name/avatar if any
const savedName = localStorage.getItem('userName');
if (savedName) usernameInput.value = savedName;

const savedAvatar = localStorage.getItem('userAvatar');
if (savedAvatar) {
    avatarPreview.src = savedAvatar;
    avatarPreview.style.display = 'block';
    avatarPlaceholder.style.display = 'none';
}

// Handle Avatar Upload
avatarInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 500000) { // 500KB limit
            alert('Image is too large. Please choose an image under 500KB.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target.result;
            localStorage.setItem('userAvatar', base64);
            avatarPreview.src = base64;
            avatarPreview.style.display = 'block';
            avatarPlaceholder.style.display = 'none';
        };
        reader.readAsDataURL(file);
    }
});

// Handle Login
loginBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (username) {
        localStorage.setItem('userName', username);
        window.location.href = 'app.html';
    } else {
        alert('Please enter your name');
    }
});

usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loginBtn.click();
    }
});
