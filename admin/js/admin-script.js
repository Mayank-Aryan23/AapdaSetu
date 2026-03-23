// Database Configuration
const SUPABASE_URL = 'https://cphqdgqtrosaxosdwdrz.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwaHFkZ3F0cm9zYXhvc2R3ZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MjU4NDQsImV4cCI6MjA3OTMwMTg0NH0.CGhmghdxQaPpD6uxDjaoAmnhZZsOKiiwacNw-ZrpDQc';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State Variables
let map;
let activeAlertsCache = []; 

// Google Maps Initialization
window.initMap = function() {
    console.log("Map Initializing...");
    const center = { lat: 20.2961, lng: 85.8245 };
    
    map = new google.maps.Map(document.getElementById("googleMap"), {
        zoom: 7, 
        center: center, 
        mapTypeId: 'terrain',
        mapId: "DEMO_MAP_ID", 
        styles: [{ elementType: "geometry", stylers: [{ color: "#242f3e" }] }]
    });
    
    setupRealtimeListeners();
    fetchActiveBroadcasts();
    fetchPendingAlerts();
    fetchCitizenReports(); 
}

// Realtime Subscriptions
function setupRealtimeListeners() {
    supabaseClient.channel('admin-global').on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, payload => {
        if (payload.new.status === 'Pending') {
            createPendingCard(payload.new);
        }
        if (payload.new.status === 'Active' || payload.new.status === 'Resolved') {
            fetchActiveBroadcasts();
            setTimeout(fetchCitizenReports, 1000); 
        }
    }).subscribe();

    supabaseClient.channel('admin-reports-live').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'citizen_reports' }, payload => {
        addReportMarker(payload.new);
        fetchCitizenReports(); 
    }).subscribe();
}

// Citizen Reports Management
async function fetchCitizenReports() {
    const { data: reports, error } = await supabaseClient
        .from('citizen_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
        
    if (error) console.error("Error fetching reports:", error);

    const { data: activeAlerts } = await supabaseClient.from('alerts').select('*').eq('status', 'Active');
    const currentAlerts = activeAlerts || [];
    const container = document.getElementById('citizen-reports-feed');
    
    container.innerHTML = '';

    if (!reports || reports.length === 0) {
        container.innerHTML = '<div class="text-center mt-5 text-muted">No reports yet.</div>';
        return;
    }

    const processedReports = reports.map(report => {
        let isCritical = false;
        let matchedAlert = null;

        currentAlerts.forEach(alert => {
            // Ensure both alert AND report have valid coordinates before calculating
            if (alert.latitude && alert.longitude && report.latitude && report.longitude) {
                const d = getDistanceKm(report.latitude, report.longitude, alert.latitude, alert.longitude);
                if (d <= (alert.radius_km || 50)) {
                    isCritical = true;
                    matchedAlert = alert.title;
                }
            }
        });
        return { ...report, isCritical, matchedAlert };
    });

    processedReports.sort((a, b) => {
        const isAssignedA = a.status === 'Assigned' ? 1 : 0;
        const isAssignedB = b.status === 'Assigned' ? 1 : 0;
        
        if (isAssignedA !== isAssignedB) return isAssignedA - isAssignedB;
        if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1;
        return new Date(b.created_at) - new Date(a.created_at);
    });

    processedReports.forEach(r => {
        let badgeHtml = '';
        let borderClass = '';
        let cardStyle = '';

        if (r.status === 'Assigned') {
            badgeHtml = `<span class="badge bg-success float-end"><i class="bi bi-check-circle-fill"></i> Assigned: ${r.assigned_to || 'Rescue Team'}</span>`;
            borderClass = 'border-start border-5 border-success';
            cardStyle = 'opacity: 0.7; background-color: #f8f9fa;'; 
        } else {
            badgeHtml = r.isCritical 
                ? `<span class="badge bg-danger blinking float-end"><i class="bi bi-exclamation-triangle-fill"></i> CRITICAL: ${r.matchedAlert}</span>` 
                : `<span class="badge bg-secondary float-end">General Report</span>`;
            borderClass = r.isCritical ? 'report-card-critical' : 'report-card-normal';
        }

        let audioHtml = '';
        if (r.audio_url) {
            audioHtml = `
                <div class="mt-2 p-2 bg-white rounded border">
                    <small class="text-danger fw-bold"><i class="bi bi-mic-fill"></i> ORIGINAL VOICE DISTRESS CALL:</small>
                    <audio controls class="w-100 mt-1" style="height: 30px;">
                        <source src="${r.audio_url}" type="audio/webm">
                        Your browser does not support the audio element.
                    </audio>
                </div>`;
        }

        const html = `
            <div class="card mb-3 shadow-sm ${borderClass}" style="${cardStyle}">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between mb-2 align-items-center">
                        <strong class="text-dark fs-5">${r.category || 'Unknown'}</strong>
                        ${badgeHtml}
                    </div>
                    <small class="text-muted mb-2 d-block"><i class="bi bi-clock"></i> ${new Date(r.created_at).toLocaleTimeString()}</small>
                    
                    <div class="p-2 bg-white border rounded mb-2 shadow-sm">
                        <p class="small mb-0 text-dark" style="white-space: pre-wrap;">${r.details || 'No textual description provided.'}</p>
                    </div>
                    
                    ${audioHtml} 
                    
                    <div class="d-flex gap-2 mt-3">
                        <button class="btn btn-sm btn-outline-primary flex-fill fw-bold" onclick="focusMap(${r.latitude}, ${r.longitude})"><i class="bi bi-crosshair"></i> Locate</button>
                        ${r.image_url ? `<a href="${r.image_url}" target="_blank" class="btn btn-sm btn-outline-secondary flex-fill fw-bold"><i class="bi bi-camera"></i> View Evidence</a>` : ''}
                    </div>
                </div>
            </div>`;
        
        container.innerHTML += html;
        
        if (r.status !== 'Assigned') {
            addReportMarker(r); 
        }
    });
}

// Distance Calculation Utility
function getDistanceKm(lat1, lon1, lat2, lon2) {
    var R = 6371; 
    var dLat = (lat2-lat1) * (Math.PI/180);
    var dLon = (lon2-lon1) * (Math.PI/180);
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1*(Math.PI/180)) * Math.cos(lat2*(Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c;
}

// Map Utilities & Animations
function focusMap(lat, lng) {
    if (!map) return;
    
    const targetPos = { lat: parseFloat(lat), lng: parseFloat(lng) };
    const targetZoom = 13; 
    
    map.setZoom(7); 
    setTimeout(() => {
        map.panTo(targetPos);
        setTimeout(() => {
            smoothZoomIn(map, targetZoom, map.getZoom());
        }, 800);
    }, 300);
}

function smoothZoomIn(map, targetZoom, currentZoom) {
    if (currentZoom >= targetZoom) return;
    setTimeout(() => {
        map.setZoom(currentZoom + 1);
        smoothZoomIn(map, targetZoom, currentZoom + 1);
    }, 150);
}

function addReportMarker(data) {
    if(!map) return;
    
    let iconUrl = "http://maps.google.com/mapfiles/ms/icons/red-dot.png"; 
    if(data.category === 'Flood') iconUrl = "http://maps.google.com/mapfiles/ms/icons/blue-dot.png";
    if(data.category === 'Medical') iconUrl = "http://maps.google.com/mapfiles/ms/icons/purple-dot.png";
    if(data.category === 'Food') iconUrl = "http://maps.google.com/mapfiles/ms/icons/yellow-dot.png";
    
    const imgIcon = document.createElement("img");
    imgIcon.src = iconUrl;
    
    const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: data.latitude, lng: data.longitude },
        map: map,
        title: data.category,
        content: imgIcon 
    });
    
    const info = new google.maps.InfoWindow({ 
        content: `<div style="padding: 5px;"><strong>${data.category}</strong><br><small>${data.details ? data.details.substring(0, 50) + "..." : "No details"}</small></div>` 
    });
    
    marker.addListener("click", () => info.open(map, marker));
}

// Alert & Broadcast Management
async function fetchActiveBroadcasts() {
    const { data } = await supabaseClient.from('alerts').select('*').eq('status', 'Active');
    
    activeAlertsCache = data || [];
    const count = data ? data.length : 0;
    document.getElementById('active-alerts-count-badge').innerText = `${count} Active Alerts`;

    const container = document.getElementById('active-broadcasts-container');
    container.innerHTML = '';
    
    if (count === 0) {
        container.innerHTML = '<p class="text-muted small">No active disasters.</p>';
        return;
    }

    data.forEach(alert => {
        // Parse the exact coordinates from the DB
        const lat = parseFloat(alert.latitude);
        const lng = parseFloat(alert.longitude);
        const radius = parseFloat(alert.radius_km) || 50;

        // Only draw if valid coordinates exist
        if (map && !isNaN(lat) && !isNaN(lng)) {
            new google.maps.Circle({
                strokeColor: "#FF0000", strokeOpacity: 0.8, strokeWeight: 2,
                fillColor: "#FF0000", fillOpacity: 0.35, map,
                center: { lat: lat, lng: lng },
                radius: radius * 1000, 
            });
        }

        container.innerHTML += `
            <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-2">
                <div>
                    <strong class="text-danger">● LIVE:</strong> ${alert.title}
                    <div class="small text-muted">Radius: ${radius}km</div>
                </div>
                <button class="btn btn-outline-success btn-sm" onclick="resolveAlert(${alert.id})">✅ Resolve</button>
            </div>`;
    });
}

async function fetchPendingAlerts() {
    const { data } = await supabaseClient.from('alerts').select('*').eq('status', 'Pending');
    if (data) {
        data.forEach(createPendingCard);
    }
}

function createPendingCard(data) {
    if (document.getElementById(`alert-${data.id}`)) return;
    document.getElementById('ai-empty-state').style.display = 'none';
    
    // Pull exactly what the DB has
    const lat = data.latitude ? data.latitude.toFixed(4) : 'Unknown';
    const lng = data.longitude ? data.longitude.toFixed(4) : 'Unknown';
    const radius = data.radius_km || 50;
    const severity = data.severity || 'Unspecified';

    const html = `
        <div class="card mb-3 border-warning shadow-sm" id="alert-${data.id}">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-center">
                    <h6 class="fw-bold text-danger mb-0">⚠️ ${data.title}</h6>
                    <span class="badge bg-danger">${severity}</span>
                </div>
                
                <div class="bg-light p-2 rounded mt-2 mb-2 border-start border-3 border-warning">
                    <small class="text-secondary fw-bold"><i class="bi bi-robot"></i> AI ANALYSIS:</small><br>
                    <span class="small">${data.summary}</span>
                </div>
                
                <div class="small text-muted mb-3 bg-white p-2 border rounded">
                    <strong><i class="bi bi-geo-alt"></i> GPS:</strong> ${lat}, ${lng} <br>
                    <strong><i class="bi bi-bullseye"></i> Impact Radius:</strong> ${radius} km
                </div>

                <button class="btn btn-danger btn-sm fw-bold w-100" onclick="broadcast(${data.id})">
                    VERIFY & BROADCAST 📡
                </button>
            </div>
        </div>`;
    
    document.getElementById('incoming-alerts').insertAdjacentHTML('afterbegin', html);
}

// Action Handlers
async function broadcast(id) {
    const triggerEl = document.querySelector('#reports-tab');
    if (triggerEl) bootstrap.Tab.getInstance(triggerEl)?.show();

    // ONLY update the status. The DB already has the correct location.
    await supabaseClient.from('alerts').update({ status: 'Active' }).eq('id', id);
    document.getElementById(`alert-${id}`).remove();
}

async function resolveAlert(id) {
    if (confirm("End alert?")) {
        await supabaseClient.from('alerts').update({ status: 'Resolved' }).eq('id', id);
        location.reload(); 
    }
}

async function simulateScraperInput() {
    await supabaseClient.from('alerts').insert({
        title: "Cyclone Dana (AI Detected)", severity: "Critical",
        summary: "Satellite imagery confirms deep depression. Expected landfall within 24 hours.", status: "Pending"
    });
    
    const triggerEl = document.querySelector('#ai-tab');
    bootstrap.Tab.getInstance(triggerEl).show();
}
