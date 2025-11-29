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

// Check if already logged in AND has completed profile setup
const hasAuth = localStorage.getItem('authToken');
const hasName = localStorage.getItem('userName');

if (hasAuth && hasName) {
    // Fully set up, go to main app
    if (!checkRedirectLoop()) window.location.href = 'app.html';
} else if (hasAuth && !hasName) {
    // Logged in but needs to set name
    if (!checkRedirectLoop()) window.location.href = 'login.html';
}
// Otherwise stay on auth page

function switchTab(tab) {
    // Hide all forms
    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    // Deactivate all tabs
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));

    // Show selected form and activate tab
    document.getElementById(`${tab}Form`).classList.add('active');

    // For verify tab, we might not have a button initially visible, but if we do:
    const tabBtn = document.getElementById(`tab-${tab}`);
    if (tabBtn) tabBtn.classList.add('active');
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('userEmail', data.email);
            window.location.href = 'login.html'; // Redirect to profile setup
        } else {
            errorEl.textContent = data.error || 'Login failed';
            errorEl.style.display = 'block';
        }
    } catch (err) {
        errorEl.textContent = 'Network error. Please try again.';
        errorEl.style.display = 'block';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    const errorEl = document.getElementById('registerError');
    const successEl = document.getElementById('registerSuccess');

    if (password !== confirmPassword) {
        errorEl.textContent = 'Passwords do not match';
        errorEl.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            successEl.textContent = 'Registration successful! Redirecting to login...';
            successEl.style.display = 'block';
            errorEl.style.display = 'none';

            // Auto-switch to login tab and pre-fill email
            setTimeout(() => {
                switchTab('login');
                document.getElementById('loginEmail').value = email;
            }, 1500);
        } else {
            errorEl.textContent = data.error || 'Registration failed';
            errorEl.style.display = 'block';
            successEl.style.display = 'none';
        }
    } catch (err) {
        errorEl.textContent = 'Network error. Please try again.';
        errorEl.style.display = 'block';
    }
}

