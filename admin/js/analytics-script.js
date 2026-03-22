// Database Configuration
const SUPABASE_URL = 'https://cphqdgqtrosaxosdwdrz.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwaHFkZ3F0cm9zYXhvc2R3ZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MjU4NDQsImV4cCI6MjA3OTMwMTg0NH0.CGhmghdxQaPpD6uxDjaoAmnhZZsOKiiwacNw-ZrpDQc';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Chart Instances
let timeChartInstance = null;
let catChartInstance = null;

// Initialization
window.onload = function() {
    loadAnalytics(); 
    setupLiveAnalytics(); 
};

// Realtime Analytics Listener
function setupLiveAnalytics() {
    supabaseClient.channel('analytics-live')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'citizen_reports' }, payload => {
            console.log("New Analytics Data!", payload);
            loadAnalytics(); 
        })
        .subscribe();
}

// Data Fetching and Processing
async function loadAnalytics() {
    // 1. Fetch Real Data
    const { data: reports, error } = await supabaseClient
        .from('citizen_reports')
        .select('*')
        .order('created_at', { ascending: true });

    if (error || !reports) return console.error(error);

    // 2. Process Data for Category Chart
    const categories = {};
    
    reports.forEach(r => {
        // Count Categories
        categories[r.category] = (categories[r.category] || 0) + 1;
    });

    document.getElementById('total-resolved').innerText = reports.length;

    // 3. Process Data for Response Time Chart
    const responseLabels = [];
    const responseData = [];

    reports.forEach(r => {
        if (r.deployment_time && r.created_at) {
            const created = new Date(r.created_at);
            const deployed = new Date(r.deployment_time);
            
            // Calculate difference in Minutes
            const diffMinutes = Math.round((deployed - created) / 1000 / 60);
            
            responseLabels.push(`Incident #${r.id}`);
            responseData.push(diffMinutes);
        }
    });

    // 4. Render Charts
    renderCategoryChart(categories);
    renderTimeChart(responseLabels, responseData);
}

// Render Doughnut Chart (Categories)
function renderCategoryChart(dataObj) {
    const ctx = document.getElementById('catChart');
    const labels = Object.keys(dataObj);
    const values = Object.values(dataObj);
    
    // Define colors dynamically
    const colors = labels.map(l => {
        if(l === 'Medical') return '#dc3545'; // Red
        if(l === 'Flood') return '#0d6efd';   // Blue
        if(l === 'Food') return '#ffc107';    // Yellow
        return '#6c757d';                     // Grey default
    });

    if (catChartInstance) catChartInstance.destroy();

    catChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { 
            labels: labels, 
            datasets: [{ 
                data: values, 
                backgroundColor: colors,
                borderWidth: 0
            }] 
        },
        options: { 
            cutout: '70%', 
            plugins: { 
                legend: { position: 'bottom' } 
            } 
        }
    });
}

// Render Line Chart (Response Time)
function renderTimeChart(labels, data) {
    const ctx = document.getElementById('timeChart');

    if (timeChartInstance) timeChartInstance.destroy();

    timeChartInstance = new Chart(ctx, {
        type: 'line',
        data: { 
            labels: labels, 
            datasets: [{ 
                label: 'Response Time (Minutes)', 
                data: data, 
                borderColor: '#0d6efd', 
                backgroundColor: 'rgba(13, 110, 253, 0.1)',
                tension: 0.4,
                fill: true
            }] 
        },
        options: { 
            responsive: true,
            scales: {
                y: { 
                    beginAtZero: true, 
                    title: { display: true, text: 'Minutes' } 
                }
            }
        }
    });
}
