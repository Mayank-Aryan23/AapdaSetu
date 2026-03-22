// Database Configuration
const SUPABASE_URL = 'https://cphqdgqtrosaxosdwdrz.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwaHFkZ3F0cm9zYXhvc2R3ZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MjU4NDQsImV4cCI6MjA3OTMwMTg0NH0.CGhmghdxQaPpD6uxDjaoAmnhZZsOKiiwacNw-ZrpDQc';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Application State
let currentRole = null;
let currentCaptchas = { login: '', register: '' };
let userLocation = { lat: null, lng: null };
const DEFAULT_LOCATION = { lat: 20.2961, lng: 85.8245 };

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    checkSessionAndRedirect();
    generateCaptcha('login');
    generateCaptcha('register');
    
    document.getElementById('loginForm').addEventListener('submit', handleCitizenLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
});

// Citizen Registration
async function handleRegister(e) {
    e.preventDefault();
    
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    const captchaInput = document.getElementById('registerCaptchaInput').value;
    const name = document.getElementById('regName').value;
    const age = document.getElementById('regAge').value;
    
    if (password !== confirmPassword) {
        return alert("❌ Passwords do not match.");
    }

    if (!validateCaptcha(captchaInput, 'register')) {
        alert("❌ Invalid CAPTCHA.");
        generateCaptcha('register');
        document.getElementById('registerCaptchaInput').value = '';
        return;
    }

    // Set default location if user bypassed the button
    if (!userLocation.lat) {
        userLocation = { ...DEFAULT_LOCATION };
        localStorage.setItem('user_lat', userLocation.lat);
        localStorage.setItem('user_lng', userLocation.lng);
    }

    const btn = document.getElementById('registerBtn');
    btn.disabled = true; 
    btn.innerText = "Creating Account...";

    const { data, error } = await supabaseClient.auth.signUp({ email, password });

    if (error) {
        alert("❌ Error: " + error.message);
        btn.disabled = false; 
        btn.innerText = "CREATE ACCOUNT";
        return;
    }

    // Insert profile data on successful auth signup
    if (data.user) {
        const { error: profileError } = await supabaseClient.from('profiles').insert({
            id: data.user.id,
            name: name,
            age: age,
            latitude: userLocation.lat,
            longitude: userLocation.lng
        });

        if (profileError) {
            console.error("Profile Error:", profileError);
            if (profileError.code === '42P01') {
                alert("❌ Database Error: 'profiles' table does not exist. Run the SQL I gave you!");
            } else if (profileError.code === '42501') {
                alert("❌ Database Error: RLS is blocking insert. Disable RLS on 'profiles' table.");
            } else {
                alert("❌ Account created but profile save failed: " + profileError.message);
            }
        } else {
            if (!data.session) {
                alert("✅ Account created! Please check your email to confirm.");
                showForm('login');
            } else {
                alert("✅ Registration Successful! Logging in...");
                window.location.href = 'citizen.html';
            }
        }
    }
    
    btn.disabled = false; 
    btn.innerText = "CREATE ACCOUNT";
}

// Citizen Login
async function handleCitizenLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const captchaInput = document.getElementById('loginCaptchaInput').value;

    if (!validateCaptcha(captchaInput, 'login')) {
        alert("❌ Invalid CAPTCHA.");
        generateCaptcha('login');
        return;
    }

    if (!userLocation.lat) {
        userLocation = { ...DEFAULT_LOCATION };
        localStorage.setItem('user_lat', userLocation.lat);
        localStorage.setItem('user_lng', userLocation.lng);
    }

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    
    if (error) {
        alert("❌ Login Failed: " + error.message);
    } else {
        window.location.href = 'citizen.html';
    }
}

// Geolocation Handling
function getLocation(target) {
    const prefix = target === 'register' ? 'reg' : 'login'; 
    const btn = document.getElementById(`${prefix}LocationBtn`);
    const status = document.getElementById(`${prefix}LocationStatus`);
    
    if (!btn) return console.error("Button not found for", prefix);

    btn.disabled = true; 
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Locating...';
    status.innerText = "Requesting GPS access...";

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            localStorage.setItem('user_lat', userLocation.lat);
            localStorage.setItem('user_lng', userLocation.lng);
            
            status.innerText = "✅ Location Verified";
            status.className = "text-center small text-success mb-0";
            btn.className = "btn location-btn-base location-btn-success fw-bold";
            btn.innerText = "✅ Location Enabled";
            btn.disabled = false;
        }, err => {
            console.warn(err);
            status.innerText = "❌ GPS Denied. Using Manual Mode.";
            status.className = "text-center small text-danger mb-0";
            btn.className = "btn location-btn-base btn-danger fw-bold";
            btn.innerText = "GPS Failed";
            btn.disabled = false;
        });
    }
}

// UI Helpers
function selectRole(role) {
    currentRole = role;
    new bootstrap.Modal(document.getElementById('authModal')).show();
    
    document.getElementById('admin-inputs').classList.add('d-none');
    document.getElementById('citizen-inputs').classList.add('d-none');
    document.getElementById('adminAccessBtn').style.display = 'none';

    if (role === 'admin') {
        document.getElementById('modalTitle').innerText = "Admin Authorization";
        document.getElementById('admin-inputs').classList.remove('d-none');
        document.getElementById('adminAccessBtn').style.display = 'block';
    } else {
        document.getElementById('modalTitle').innerText = "Citizen Verification";
        document.getElementById('citizen-inputs').classList.remove('d-none');
        showForm('login');
    }
}

function showForm(target) {
    document.querySelectorAll('.auth-form').forEach(f => f.classList.add('d-none'));
    document.getElementById(`${target}Form`).classList.remove('d-none');
    
    document.querySelectorAll('.nav-link').forEach(t => t.classList.remove('active'));
    document.getElementById(`${target}-tab`).classList.add('active');
    
    generateCaptcha(target);
}

// Captcha Operations
function generateCaptcha(target) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let c = ''; 
    for (let i = 0; i < 5; i++) {
        c += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    currentCaptchas[target] = c;
    
    const prefix = target === 'register' ? 'register' : 'login';
    const el = document.getElementById(`${prefix}CaptchaDisplay`);
    if (el) el.innerText = c;
}

function validateCaptcha(input, target) { 
    return input.toUpperCase() === currentCaptchas[target].toUpperCase(); 
}

// Admin Authentication
async function handleAdminLogin() {
    const emailInput = document.getElementById('adminEmail');
    const passInput = document.getElementById('adminPass');
    const loginBtn = document.getElementById('adminAccessBtn'); 

    const email = emailInput.value.trim();
    const password = passInput.value.trim();

    if (!email || !password) {
        alert("Please enter Government ID and Password.");
        return;
    }

    const originalText = loginBtn.innerText;
    loginBtn.innerText = "Verifying Credentials...";
    loginBtn.disabled = true;

    try {
        const { data, error } = await supabaseClient
            .from('admin_directory')
            .select('*')
            .eq('email', email)
            .eq('password', password)
            .single(); 

        if (error || !data) {
            console.warn("Login Failed:", error);
            alert("❌ Access Denied: Invalid Government Credentials.");
            
            loginBtn.innerText = originalText;
            loginBtn.disabled = false;
        } else {
            console.log("Admin Verified:", data.name);
            alert(`✅ Welcome, ${data.name}.\nAccessing Secure Command Center...`);
            
            sessionStorage.setItem('admin_logged_in', 'true');
            sessionStorage.setItem('admin_name', data.name);
            window.location.href = 'admin/index.html';
        }
    } catch (err) {
        console.error("Unexpected Error:", err);
        alert("System Error. Check console.");
        loginBtn.innerText = originalText;
        loginBtn.disabled = false;
    }
}

// Session Management
async function checkSessionAndRedirect() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        console.log("Session active");
    }
}
