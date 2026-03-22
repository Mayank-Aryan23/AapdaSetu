// Database Configuration
const SUPABASE_URL = 'https://cphqdgqtrosaxosdwdrz.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwaHFkZ3F0cm9zYXhvc2R3ZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MjU4NDQsImV4cCI6MjA3OTMwMTg0NH0.CGhmghdxQaPpD6uxDjaoAmnhZZsOKiiwacNw-ZrpDQc';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State Variables
let meshMap;
let liveNodeMemory = {}; 
let mapCircles = {}; 
let mapMarkers = {}; 

// Google Maps Initialization
window.initMeshMap = function() {
    const center = { lat: 22.0, lng: 82.0 }; 
    
    meshMap = new google.maps.Map(document.getElementById("meshMap"), {
        zoom: 5, 
        center: center,
        disableDefaultUI: true,
        mapId: "DEMO_MAP_ID_MESH",
        styles: [
            { elementType: 'geometry', stylers: [{ color: '#1a252f' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#1a252f' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
            { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c3e50' }] }
        ]
    });
    
    fetchMeshNodes();
    setupRealtime();
}

// Data Fetching & Realtime Sync
async function fetchMeshNodes() {
    const { data: nodes, error } = await supabaseClient.from('ai_mesh_nodes').select('*');
    if (error || !nodes) return console.error("DB Error:", error);

    nodes.forEach(node => {
        liveNodeMemory[node.id] = node;
        const pos = { lat: node.latitude, lng: node.longitude };

        // Advanced Marker Central Dot
        const centerDot = document.createElement("div");
        centerDot.className = "mesh-center-dot";
        centerDot.title = node.region_name;

        mapMarkers[node.id] = new google.maps.marker.AdvancedMarkerElement({
            position: pos,
            map: meshMap,
            title: node.region_name,
            content: centerDot 
        });

        // 10km Threat Radius Circle
        const maxProb = Math.max(node.heatwave_prob, node.landslide_prob, node.flood_prob);
        const isWarning = maxProb > 50;
        const statusColor = isWarning ? "#ffc107" : "#198754"; 

        mapCircles[node.id] = new google.maps.Circle({
            strokeColor: statusColor,
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: statusColor,
            fillOpacity: 0.25,
            map: meshMap,
            center: pos,
            radius: 10000 // 10 KM
        });
    });

    renderAllNodesList();
    evaluateGlobalWarning();
}

function setupRealtime() {
    supabaseClient.channel('mesh-updates')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ai_mesh_nodes' }, payload => {
            
            // 1. Update memory state
            liveNodeMemory[payload.new.id] = payload.new;

            // 2. Flash UI badge indicating sync
            const statusBadge = document.getElementById('sync-status');
            statusBadge.innerHTML = `<i class="bi bi-check-circle-fill"></i> Data Synced!`;
            statusBadge.parentElement.classList.replace('border-info', 'border-success');
            statusBadge.parentElement.classList.replace('text-info', 'text-success');
            
            setTimeout(() => {
                statusBadge.innerText = "Mesh Active";
                statusBadge.parentElement.classList.replace('border-success', 'border-info');
                statusBadge.parentElement.classList.replace('text-success', 'text-info');
            }, 3000);
            
            // 3. Update the map overlay and UI panels
            updateMapCircle(payload.new);
            renderAllNodesList();
            evaluateGlobalWarning();

        }).subscribe();
}

// Map Update Helpers
function updateMapCircle(node) {
    if(mapCircles[node.id]) {
        const maxProb = Math.max(node.heatwave_prob, node.landslide_prob, node.flood_prob);
        const isWarning = maxProb > 50;
        const statusColor = isWarning ? "#ffc107" : "#198754";
        
        mapCircles[node.id].setOptions({
            strokeColor: statusColor,
            fillColor: statusColor
        });
    }
}

function focusNode(lat, lng) {
    meshMap.panTo({lat, lng});
    meshMap.setZoom(9);
}

// UI Rendering
function renderAllNodesList() {
    const container = document.getElementById('mesh-cards-container');
    container.innerHTML = ''; 
    
    let latestTime = null;

    Object.values(liveNodeMemory).forEach(node => {
        const maxProb = Math.max(node.heatwave_prob, node.landslide_prob, node.flood_prob);
        const isWarning = maxProb > 50;
        const warningClass = isWarning ? 'warning-state' : '';
        
        const nodeTime = new Date(node.last_updated);
        if(!latestTime || nodeTime > latestTime) latestTime = nodeTime;

        const html = `
            <div class="compact-node-card shadow-sm ${warningClass}" onclick="focusNode(${node.latitude}, ${node.longitude})">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="fw-bold ${isWarning ? 'text-warning' : 'text-success'}">
                        <i class="bi bi-geo-alt-fill"></i> ${node.region_name}
                    </span>
                </div>
                
                <div class="d-flex justify-content-between mt-2">
                    <div class="stat-pill text-light">🌊 Flood: <span class="${getColor(node.flood_prob)}">${node.flood_prob}%</span></div>
                    <div class="stat-pill text-light">🌡️ Heat: <span class="${getColor(node.heatwave_prob)}">${node.heatwave_prob}%</span></div>
                    <div class="stat-pill text-light">⛰️ Land: <span class="${getColor(node.landslide_prob)}">${node.landslide_prob}%</span></div>
                </div>
            </div>
        `;
        container.innerHTML += html;
    });

    if(latestTime) {
        document.getElementById('last-update-time').innerText = `Updated: ${latestTime.toLocaleTimeString()}`;
    }
}

function evaluateGlobalWarning() {
    const banner = document.getElementById('global-warning-banner');
    
    let warningNodes = [];
    
    Object.values(liveNodeMemory).forEach(node => {
        if (Math.max(node.heatwave_prob, node.landslide_prob, node.flood_prob) > 50) {
            warningNodes.push(node.region_name);
        }
    });

    if (warningNodes.length > 0) {
        banner.className = "alert alert-warning d-flex align-items-center fw-bold shadow-sm mb-4 border-warning";
        banner.innerHTML = `
            <i class="bi bi-exclamation-triangle-fill fs-3 me-3 text-danger pulse"></i> 
            <div>
                <span class="text-danger">⚠️ ELEVATED THREAT DETECTED</span><br>
                <small class="fw-normal text-dark">AI prediction > 50% in: <strong>${warningNodes.join(', ')}</strong>. Consider resource reallocation.</small>
            </div>
        `;
    } else {
        banner.className = "alert alert-success d-flex align-items-center fw-bold shadow-sm mb-4 border-success";
        banner.innerHTML = `
            <i class="bi bi-shield-check fs-3 me-3 text-success"></i> 
            <div>
                <span class="text-success">ALL SYSTEMS NOMINAL</span><br>
                <small class="fw-normal text-dark">No elevated risks detected across the AI Mesh Network.</small>
            </div>
        `;
    }
}

// Styling Utility
function getColor(prob) {
    if (prob > 50) return "text-danger-custom";
    if (prob > 30) return "text-warning-custom";
    return "text-success-custom";
}
