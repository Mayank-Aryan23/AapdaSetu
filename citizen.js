// Database Configuration
const SUPABASE_URL = 'https://cphqdgqtrosaxosdwdrz.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwaHFkZ3F0cm9zYXhvc2R3ZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MjU4NDQsImV4cCI6MjA3OTMwMTg0NH0.CGhmghdxQaPpD6uxDjaoAmnhZZsOKiiwacNw-ZrpDQc';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Application State
let myLocation = { lat: 20.2961, lng: 85.8245 }; // Default
const GEOFENCE_RADIUS_KM = 50;
let currentAlertData = null; 
let conversationHistory = [];

// Initialization
window.onload = function() {
    initLocation();
    initSafetyNetwork();
    listenForAlerts();
};

// Location Services
function initLocation() {
    const geoText = document.getElementById('geo-text');
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
            myLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            geoText.innerHTML = `<i class="bi bi-geo-alt-fill"></i> Lat: ${myLocation.lat.toFixed(2)}, Lng: ${myLocation.lng.toFixed(2)}`;
            geoText.classList.remove('text-warning');
            
            checkActiveAlerts(); 
            fetchLocalWeather(myLocation.lat, myLocation.lng); 
        }, (err) => {
            console.warn("GPS Error:", err);
            useSimulationMode();
        }, { timeout: 5000, enableHighAccuracy: true });
    } else {
        useSimulationMode();
    }
}

function useSimulationMode() {
    const geoText = document.getElementById('geo-text');
    myLocation = { lat: 20.94, lng: 86.45 }; 
    geoText.innerHTML = `<i class="bi bi-pin-map-fill"></i> Odisha (Simulated)`;
    geoText.classList.add('text-warning');
    checkActiveAlerts();
    fetchLocalWeather(myLocation.lat, myLocation.lng); 
}

// Weather Integration (Open-Meteo)
async function fetchLocalWeather(lat, lng) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,cloud_cover&hourly=temperature_2m,weather_code&timezone=auto`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (!data.current) throw new Error("No weather data found");

        const current = data.current;
        const weatherInfo = getWeatherDesc(current.weather_code);

        document.getElementById('w-temp').innerText = `${Math.round(current.temperature_2m)}°C`;
        document.getElementById('w-desc').innerText = weatherInfo.desc;
        document.getElementById('w-humid').innerText = `${current.relative_humidity_2m}%`;
        document.getElementById('w-wind').innerText = `${current.wind_speed_10m} km/h`;
        document.getElementById('w-cloud').innerText = `${current.cloud_cover}%`;

        const iconImg = document.getElementById('w-icon');
        iconImg.src = weatherInfo.icon;
        iconImg.style.display = 'block';

        const forecastContainer = document.getElementById('forecast-container');
        forecastContainer.innerHTML = ''; 

        const currentHourIndex = new Date().getHours();
        for(let i = 0; i < 6; i++) {
            const targetIndex = (currentHourIndex + i) % 24;
            const temp = data.hourly.temperature_2m[targetIndex];
            const code = data.hourly.weather_code[targetIndex];
            const fInfo = getWeatherDesc(code);
            const timeStr = `${targetIndex.toString().padStart(2, '0')}:00`;

            const div = document.createElement('div');
            div.className = 'forecast-item';
            div.innerHTML = `
                <div class="fw-bold mb-1">${timeStr}</div>
                <img src="${fInfo.icon}" width="25" class="mb-1">
                <div class="fw-bold text-dark">${Math.round(temp)}°</div>
            `;
            forecastContainer.appendChild(div);
        }
    } catch (error) {
        console.error("Weather API Error:", error);
        document.getElementById('w-desc').innerText = "Weather Unavailable";
        document.getElementById('forecast-container').innerHTML = `<small class="text-danger">Service Offline</small>`;
    }
}

function getWeatherDesc(code) {
    const map = {
        0: { desc: "Clear Sky", icon: "https://openweathermap.org/img/wn/01d@2x.png" },
        1: { desc: "Mainly Clear", icon: "https://openweathermap.org/img/wn/02d@2x.png" },
        2: { desc: "Partly Cloudy", icon: "https://openweathermap.org/img/wn/03d@2x.png" },
        3: { desc: "Overcast", icon: "https://openweathermap.org/img/wn/04d@2x.png" },
        45: { desc: "Fog", icon: "https://openweathermap.org/img/wn/50d@2x.png" },
        51: { desc: "Light Drizzle", icon: "https://openweathermap.org/img/wn/09d@2x.png" },
        61: { desc: "Rain", icon: "https://openweathermap.org/img/wn/10d@2x.png" },
        65: { desc: "Heavy Rain", icon: "https://openweathermap.org/img/wn/10d@2x.png" },
        71: { desc: "Snow", icon: "https://openweathermap.org/img/wn/13d@2x.png" },
        95: { desc: "Thunderstorm", icon: "https://openweathermap.org/img/wn/11d@2x.png" }
    };
    return map[code] || { desc: "Unknown", icon: "https://openweathermap.org/img/wn/03d@2x.png" };
}

// Realtime Alert Subscriptions
function listenForAlerts() {
    supabaseClient.channel('citizen-alerts').on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, payload => {
        checkActiveAlerts();
    }).subscribe();
}

async function checkActiveAlerts() {
    const { data } = await supabaseClient.from('alerts').select('*').eq('status', 'Active');
    
    if (!data || data.length === 0) {
        if (currentAlertData) showGreenScreen(); 
        currentAlertData = null;
        return;
    }

    let foundDanger = false;
    for (let alert of data) {
        const alertLat = alert.latitude || 20.94; 
        const alertLng = alert.longitude || 86.45;
        const radius = alert.radius_km || 50;
        const distance = getDistanceFromLatLonInKm(myLocation.lat, myLocation.lng, alertLat, alertLng);

        if (distance <= radius) {
            currentAlertData = alert;
            showRedScreen(alert, distance);
            foundDanger = true;
            break; 
        }
    }

    if (!foundDanger && document.getElementById('status-header').classList.contains('status-danger')) {
        showGreenScreen();
    }
}

// AI Agent Chat Integration
async function sendMessage() {
    const inputField = document.getElementById('user-input');
    const userText = inputField.value.trim();
    if (!userText) return;

    addMessage(userText, 'user-msg');
    inputField.value = '';
    document.getElementById('typing-indicator').style.display = 'block';

    let systemContext = `
        You are 'AapdaSetu', an Emergency Response AI.
        USER LOCATION: Lat ${myLocation.lat}, Lng ${myLocation.lng}.
        CURRENT WEATHER: ${document.getElementById('w-temp').innerText}, ${document.getElementById('w-desc').innerText}.
        CURRENT ALERT: ${currentAlertData ? currentAlertData.title : "None"}.
        INSTRUCTIONS: Keep answers under 40 words. If the user is in danger, tell them to click "Report Incident".
    `;

    if (conversationHistory.length === 0) {
        conversationHistory.push({ role: "system", content: systemContext });
    } else {
        conversationHistory[0].content = systemContext;
    }

    conversationHistory.push({ role: "user", content: userText });

    try {
        const response = await fetch('/api/ai-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: conversationHistory,
                max_tokens: 150
            })
        });

        const data = await response.json();
        if(data.error) throw new Error(data.error.message);

        const aiText = data.choices[0].message.content;
        conversationHistory.push({ role: "assistant", content: aiText });

        document.getElementById('typing-indicator').style.display = 'none';
        addMessage(aiText, 'bot-msg'); 

    } catch (error) {
        console.error("AI Error:", error);
        document.getElementById('typing-indicator').style.display = 'none';
        addMessage(`⚠️ <strong>Connection Error:</strong> Could not reach AI server.`, 'bot-msg');
        conversationHistory.pop();
    }
}

function addMessage(text, className) {
    const history = document.getElementById('chat-history');
    const formattedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); 
    history.innerHTML += `<div class="d-block"><div class="${className}">${formattedText}</div></div>`;
    history.scrollTop = history.scrollHeight;
}

function handleEnter(e) { 
    if(e.key === 'Enter') {
        sendMessage(); 
    }
}

function addBotMessage(text) { 
    addMessage(text, 'bot-msg'); 
}

// Helper Utilities
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371; 
    var dLat = deg2rad(lat2-lat1); 
    var dLon = deg2rad(lon2-lon1); 
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function deg2rad(deg) { 
    return deg * (Math.PI/180);
}

function showRedScreen(data, distance) {
    const header = document.getElementById('status-header');
    header.className = 'status-danger';
    
    document.getElementById('status-content').innerHTML = `
        <i class="bi bi-exclamation-triangle-fill display-1 mb-2"></i>
        <h2 class="fw-bold">${data.title}</h2>
        <p>${data.summary}</p>
        <div class="bg-white text-danger rounded p-2 fw-bold shadow-sm">STAY INDOORS</div>
    `;
    
    document.getElementById('distance-badge').innerText = `Impact Zone (${distance.toFixed(1)}km)`;
    document.getElementById('distance-badge').style.display = 'inline-block';
    
    if (document.querySelector('.bot-msg').innerText.includes('Hello')) {
         addBotMessage(`⚠️ <strong>ALERT UPDATE:</strong> ${data.title} is active near you. I have updated my safety protocols.`);
    }
}

function showGreenScreen() {
    const header = document.getElementById('status-header');
    header.className = 'status-safe';
    
    document.getElementById('status-content').innerHTML = `
        <i class="bi bi-shield-check display-1 mb-2"></i>
        <h2 class="fw-bold">You are Safe</h2>
        <p>Threat Resolved.</p>
    `;
    document.getElementById('distance-badge').style.display = 'none';
}

// Voice Reporting & Audio Processing
let mediaRecorder;
let audioChunks = [];
let audioBlob = null;
let isRecording = false;

async function toggleRecording() {
    const btn = document.getElementById('recordBtn');
    const status = document.getElementById('transcriptionStatus');

    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                document.getElementById('audioPlayback').src = URL.createObjectURL(audioBlob);
                document.getElementById('audioPlayback').style.display = 'block';
                document.getElementById('retryRecordBtn').style.display = 'block'; 
                btn.style.display = 'none'; 
                
                status.style.display = 'block';
                status.innerHTML = '<span class="spinner-border spinner-border-sm text-primary"></span> Transcribing...';
                await transcribeAudio(audioBlob);
            };

            mediaRecorder.start();
            isRecording = true;
            btn.classList.replace('btn-danger', 'btn-outline-danger');
            btn.innerHTML = '<i class="bi bi-stop-circle-fill text-danger pulse"></i> Stop Recording';
        } catch (err) {
            alert("Microphone access denied. Please allow mic permissions.");
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
    }
}

function resetRecording() {
    audioBlob = null;
    audioChunks = [];
    document.getElementById('audioPlayback').style.display = 'none';
    document.getElementById('audioPlayback').src = "";
    document.getElementById('retryRecordBtn').style.display = 'none';
    document.getElementById('transcriptionStatus').style.display = 'none';
    
    const btn = document.getElementById('recordBtn');
    btn.style.display = 'block';
    btn.classList.replace('btn-outline-danger', 'btn-danger');
    btn.innerHTML = '<i class="bi bi-mic"></i> Tap to Speak';
}

async function transcribeAudio(blob) {
    const formData = new FormData();
    formData.append('file', blob, 'audio.webm');

    try {
        const response = await fetch('/api/ai-transcribe', {
            method: 'POST',
            body: formData 
        });
        
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const textArea = document.getElementById('reportDetails');
        const prefix = textArea.value ? textArea.value + "\n" : "";
        textArea.value = prefix + "[Translated Voice]: " + data.text;
        
        document.getElementById('transcriptionStatus').innerHTML = '<i class="bi bi-check-circle-fill text-success"></i> Translated to English successfully!';
    } catch (err) {
        console.error("Translation Error:", err);
        document.getElementById('transcriptionStatus').innerHTML = `<span class="text-danger"><i class="bi bi-exclamation-triangle"></i> Failed: ${err.message}</span>`;
    }
}

// Incident Report Submission
async function submitDetailedReport() {
    if(!supabaseClient) return;
    
    const category = document.querySelector('input[name="category"]:checked').value;
    let details = document.getElementById('reportDetails').value;
    const imageFile = document.getElementById('reportImage').files[0];
    
    const submitBtn = document.getElementById('submitReportBtn');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Locating Target...'; 
    submitBtn.disabled = true;
    
    try {
        let reportLat = myLocation.lat;
        let reportLng = myLocation.lng;
        const targetElement = document.getElementById('reportTarget');

        if (targetElement && targetElement.value !== "ME") {
            const targetCitizenId = targetElement.value;
            details = `[🚨 PROXY REPORT ON BEHALF OF CITIZEN-${targetCitizenId}] \n\n` + details;
            
            const { data: targetProfile, error: profileErr } = await supabaseClient
                .from('profiles')
                .select('latitude, longitude')
                .eq('citizen_id', targetCitizenId)
                .single();

            if (!profileErr && targetProfile && targetProfile.latitude) {
                reportLat = targetProfile.latitude;
                reportLng = targetProfile.longitude;
            } else {
                details += "\n\n⚠️ SYSTEM NOTE: Target citizen's GPS location unavailable. Placed marker at Middleman's location.";
            }
        }

        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Uploading Evidence...';

        let finalImageURL = null;
        let finalAudioURL = null;

        if (imageFile) {
            const imgName = `img_${Date.now()}_${imageFile.name.replace(/\s/g, '_')}`;
            const { error: imgErr } = await supabaseClient.storage.from('reports').upload(imgName, imageFile);
            if (!imgErr) {
                const { data: urlData } = supabaseClient.storage.from('reports').getPublicUrl(imgName);
                finalImageURL = urlData.publicUrl;
            }
        }

        if (audioBlob) {
            const audioName = `audio_${Date.now()}.webm`;
            const { error: audioErr } = await supabaseClient.storage.from('reports').upload(audioName, audioBlob);
            if (!audioErr) {
                const { data: urlData } = supabaseClient.storage.from('reports').getPublicUrl(audioName);
                finalAudioURL = urlData.publicUrl;
            }
        }

        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Dispatching...';

        const { error: dbError } = await supabaseClient.from('citizen_reports').insert({
            category: category, 
            details: details, 
            latitude: reportLat, 
            longitude: reportLng, 
            image_url: finalImageURL,
            audio_url: finalAudioURL 
        });

        if (dbError) throw dbError;

        alert("✅ Report Submitted! Rescue teams are heading to the target location.");
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('reportModal'));
        modal.hide();
        document.getElementById('incidentForm').reset();
        resetRecording();
        
    } catch (error) {
        console.error("Submission failed:", error);
        alert("Error: " + error.message);
    } finally {
        submitBtn.innerHTML = originalBtnText; 
        submitBtn.disabled = false;
    }
}

// Safety Network (Middleman) Logic
let myCitizenId = null;

async function initSafetyNetwork() {
    document.getElementById('my-id-badge').innerText = `ID: Loading...`;

    try {
        const { data: authData } = await supabaseClient.auth.getUser();
        
        if (authData && authData.user) {
            const { data: profileData } = await supabaseClient
                .from('profiles')
                .select('citizen_id')
                .eq('id', authData.user.id)
                .single();

            if (profileData && profileData.citizen_id) {
                myCitizenId = profileData.citizen_id.toString();
            }
        }

        if (!myCitizenId) {
            myCitizenId = localStorage.getItem('aapda_fallback_id');
            if (!myCitizenId) {
                myCitizenId = Math.floor(1000 + Math.random() * 9000).toString();
                localStorage.setItem('aapda_fallback_id', myCitizenId);
            }
        }

        document.getElementById('my-id-badge').innerText = `My ID: ${myCitizenId}`;
        loadNetworkData();

        supabaseClient.channel('network-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'middleman_links' }, () => {
                loadNetworkData();
            }).subscribe();

    } catch (err) {
        console.error("Network init error:", err);
        document.getElementById('my-id-badge').innerText = `ID: Error`;
    }
}

async function loadNetworkData() {
    if(!supabaseClient || !myCitizenId) return;
    try {
        const { data: myLink } = await supabaseClient.from('middleman_links').select('*').eq('citizen_id', myCitizenId).maybeSingle(); 
        const inputBox = document.getElementById('add-middleman-box');
        const statusDisplay = document.getElementById('middleman-status-display');
        
        if (myLink) {
            inputBox.style.display = 'none';
            if (myLink.status === 'Pending') {
                statusDisplay.innerHTML = `<span class="text-warning"><i class="bi bi-hourglass-split"></i> Request sent to ID: ${myLink.middleman_id}</span><button class="btn btn-sm btn-link text-danger p-0 ms-2" onclick="cancelRequest()">Cancel</button>`;
            } else {
                statusDisplay.innerHTML = `<span class="text-success"><i class="bi bi-shield-check"></i> Protected by ID: ${myLink.middleman_id}</span><button class="btn btn-sm btn-link text-danger p-0 ms-2" onclick="cancelRequest()">Remove</button>`;
            }
        } else {
            inputBox.style.display = 'flex';
            statusDisplay.innerHTML = '';
        }

        const { data: myWards } = await supabaseClient.from('middleman_links').select('*').eq('middleman_id', myCitizenId);
        const list = document.getElementById('protected-citizens-list');
        const reportTargetDropdown = document.getElementById('reportTarget');
        
        list.innerHTML = '';
        reportTargetDropdown.innerHTML = '<option value="ME">Myself (Current Location)</option>';

        if (!myWards || myWards.length === 0) {
            list.innerHTML = '<li class="list-group-item small text-muted">No one linked yet.</li>';
        } else {
            myWards.forEach(ward => {
                if (ward.status === 'Pending') {
                    list.innerHTML += `<li class="list-group-item d-flex justify-content-between align-items-center small bg-warning bg-opacity-10"><span><strong>ID: ${ward.citizen_id}</strong> requests proxy.</span><div><button class="btn btn-sm btn-success py-0 fw-bold me-1" onclick="acceptMiddleman(${ward.id})"><i class="bi bi-check"></i></button><button class="btn btn-sm btn-danger py-0 fw-bold" onclick="rejectMiddleman(${ward.id})"><i class="bi bi-x"></i></button></div></li>`;
                } else {
                    list.innerHTML += `<li class="list-group-item small text-success fw-bold"><i class="bi bi-person-check-fill"></i> Protecting ID: ${ward.citizen_id}</li>`;
                    reportTargetDropdown.innerHTML += `<option value="${ward.citizen_id}">Citizen-${ward.citizen_id} (Proxy Report)</option>`;
                }
            });
        }
    } catch (err) { 
        console.error(err); 
    }
}

async function requestMiddleman() {
    const targetId = document.getElementById('middleman-input').value.trim();
    if(!targetId || targetId === myCitizenId) {
        return alert("Please enter a valid Middleman ID.");
    }
    await supabaseClient.from('middleman_links').delete().eq('citizen_id', myCitizenId);
    const { error } = await supabaseClient.from('middleman_links').insert({ citizen_id: myCitizenId, middleman_id: targetId, status: 'Pending' });
    
    if (!error) {
        loadNetworkData(); 
    } else {
        alert("Failed to send request.");
    }
}

async function acceptMiddleman(linkId) {
    await supabaseClient.from('middleman_links').update({ status: 'Accepted' }).eq('id', linkId);
    loadNetworkData();
}

async function rejectMiddleman(linkId) {
    await supabaseClient.from('middleman_links').delete().eq('id', linkId);
    loadNetworkData();
}

async function cancelRequest() {
    await supabaseClient.from('middleman_links').delete().eq('citizen_id', myCitizenId);
    loadNetworkData();
}
