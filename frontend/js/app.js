const API = '/api';

// State
let skills = [];
let dashboard = {};
let recentLogs = [];

// DOM Elements
const skillsGrid = document.getElementById('skills-grid');
const activityFeed = document.getElementById('activity-feed');
const addSkillModal = document.getElementById('add-skill-modal');
const logSessionModal = document.getElementById('log-session-modal');
const addSkillForm = document.getElementById('add-skill-form');
const logSessionForm = document.getElementById('log-session-form');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    loadSkills();
    loadRecentLogs();
    
    // Live Clock
    setInterval(() => {
        const timeEl = document.getElementById('live-timestamp');
        if (timeEl) {
            const now = new Date();
            timeEl.textContent = `> LOCAL_TIME: ${now.toLocaleTimeString()}`;
        }
    }, 1000);
});

// API Calls
async function loadDashboard() {
    try {
        const res = await fetch(`${API}/dashboard`);
        dashboard = await res.json();
        renderStats();
        renderWeeklyChart();
    } catch (err) {
        console.error('Failed to load dashboard:', err);
    }
}

async function loadSkills() {
    try {
        const res = await fetch(`${API}/skills`);
        skills = await res.json();
        renderSkills();
        renderChart();
    } catch (err) {
        console.error('Failed to load skills:', err);
    }
}

async function loadRecentLogs() {
    try {
        const res = await fetch(`${API}/logs`);
        if(res.ok) {
            recentLogs = await res.json();
            renderActivityFeed();
        }
    } catch (err) {
        console.error('Failed to load logs:', err);
    }
}

async function createSkill(data) {
    const res = await fetch(`${API}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create skill');
    return res.json();
}

async function deleteSkill(id) {
    const res = await fetch(`${API}/skills/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete skill');
    return res.json();
}

async function logSession(skillId, data) {
    const res = await fetch(`${API}/skills/${skillId}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to log session');
    return res.json();
}

// Render Functions
function renderStats() {
    document.getElementById('stat-total-skills').textContent = String(dashboard.total_skills || 0).padStart(2, '0');
    document.getElementById('stat-total-hours').textContent = (dashboard.total_hours || 0).toFixed(1);
    document.getElementById('stat-total-sessions').textContent = String(dashboard.total_logs || 0).padStart(3, '0');
    document.getElementById('stat-current-streak').textContent = String(dashboard.current_streak || 0).padStart(2, '0') + 'D';
    document.getElementById('stat-top-skill').textContent = dashboard.top_skill || 'N/A';
}

function renderSkills() {
    if (!skills || skills.length === 0) {
        skillsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1">
                NO DATA COMPONENTS FOUND.
            </div>
        `;
        return;
    }

    skillsGrid.innerHTML = skills.map(skill => {
        const progress = skill.target_hours > 0
            ? Math.min((skill.total_hours / skill.target_hours) * 100, 100)
            : 0;
            
        const level = Math.floor(skill.total_hours / 10) + 1;
        const xpToNext = 10 - (skill.total_hours % 10);

        return `
            <div class="skill-card">
                <div class="skill-top">
                    <div>
                        <span class="skill-name">${escapeHtml(skill.name)}</span>
                        <div style="font-size: 0.7rem; color: var(--accent-2); margin-top: 2px;">LVL.${level} UNIT</div>
                    </div>
                    <span class="skill-tag">${escapeHtml(skill.category || 'UNK')}</span>
                </div>
                
                <div class="skill-stats">
                    <span>CAPACITY: <strong>${skill.total_hours.toFixed(1)}H</strong></span>
                    <span>NEXT_RANK: ${xpToNext.toFixed(1)}H</span>
                </div>
                
                <div class="bar-bg">
                    <div class="bar-fill" style="width: ${progress}%"></div>
                </div>
                
                <div class="skill-actions">
                    <button class="btn-hud" onclick="openLogModal(${skill.id}, '${escapeHtml(skill.name)}')">
                        <i class="ph-bold ph-terminal-window"></i> LOG_DATA
                    </button>
                    <button class="btn-hud" onclick="handleDelete(${skill.id})" style="flex: 0;">
                        <i class="ph-bold ph-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderActivityFeed() {
    if (!recentLogs || recentLogs.length === 0) {
        activityFeed.innerHTML = '<div class="empty-state">NO TELEMETRY DATA</div>';
        return;
    }

    activityFeed.innerHTML = recentLogs.map(log => {
        const dateStr = new Date(log.log_date).toISOString().split('T')[0];
        return `
            <div class="activity-item">
                <div class="act-time">[${dateStr}]</div>
                <div class="act-content">
                    ALLOCATED <strong>${log.hours}H</strong> TO <strong>${escapeHtml(log.skill_name)}</strong>
                    ${log.notes ? `<br><span style="opacity: 0.7; font-size: 0.8rem; margin-top: 4px; display: inline-block;">> ${escapeHtml(log.notes)}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Chart.js Setup
window.categoryChartInstance = null;

function getChartColors() {
    const rootStyles = getComputedStyle(document.documentElement);
    const colorsStr = rootStyles.getPropertyValue('--chart-colors').trim();
    return colorsStr.split(',').map(c => c.trim());
}

function renderChart() {
    if (!skills || skills.length === 0) {
        const ctx = document.getElementById('categoryChart').getContext('2d');
        ctx.clearRect(0,0, 400, 250);
        return;
    }

    const categoryData = {};
    skills.forEach(s => {
        const cat = s.category || 'UNK';
        categoryData[cat] = (categoryData[cat] || 0) + s.total_hours;
    });

    const labels = Object.keys(categoryData);
    const data = Object.values(categoryData);
    
    const total = data.reduce((a,b) => a+b, 0);
    if(total === 0) return;

    const ctx = document.getElementById('categoryChart').getContext('2d');
    
    if (window.categoryChartInstance) {
        window.categoryChartInstance.destroy();
    }

    const rootStyles = getComputedStyle(document.documentElement);
    const textMain = rootStyles.getPropertyValue('--text-main').trim();

    window.categoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: getChartColors(),
                borderWidth: 1,
                borderColor: rootStyles.getPropertyValue('--accent-1').trim(),
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: textMain,
                        usePointStyle: true,
                        padding: 20,
                        font: {
                            family: "'Share Tech Mono', monospace",
                            size: 12
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 20, 30, 0.9)',
                    titleColor: textMain,
                    bodyColor: textMain,
                    borderColor: rootStyles.getPropertyValue('--accent-1').trim(),
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 0,
                    titleFont: { family: "'Share Tech Mono', monospace" },
                    bodyFont: { family: "'Share Tech Mono', monospace" }
                }
            }
        }
    });
}

window.weeklyChartInstance = null;

function renderWeeklyChart() {
    if (!dashboard.weekly_activity) return;

    const ctx = document.getElementById('weeklyChart').getContext('2d');
    
    const sortedDates = Object.keys(dashboard.weekly_activity).sort();
    const labels = sortedDates.map(d => {
        const date = new Date(d);
        return date.toLocaleDateString(undefined, { weekday: 'short' });
    });
    const data = sortedDates.map(d => dashboard.weekly_activity[d]);

    if (window.weeklyChartInstance) {
        window.weeklyChartInstance.destroy();
    }

    const rootStyles = getComputedStyle(document.documentElement);
    const accent1 = rootStyles.getPropertyValue('--accent-1').trim();
    const textMain = rootStyles.getPropertyValue('--text-main').trim();

    window.weeklyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'HOURS',
                data: data,
                backgroundColor: accent1,
                borderColor: accent1,
                borderWidth: 1,
                barThickness: 20
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0, 243, 255, 0.1)' },
                    ticks: { 
                        color: textMain,
                        font: { family: "'Share Tech Mono', monospace" }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { 
                        color: textMain,
                        font: { family: "'Share Tech Mono', monospace" }
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0, 20, 30, 0.9)',
                    titleColor: accent1,
                    bodyColor: textMain,
                    borderColor: accent1,
                    borderWidth: 1,
                    cornerRadius: 0,
                    titleFont: { family: "'Share Tech Mono', monospace" },
                    bodyFont: { family: "'Share Tech Mono', monospace" }
                }
            }
        }
    });
}

// Modal Handlers
function openAddModal() {
    addSkillForm.reset();
    addSkillModal.classList.add('active');
}

function closeAddModal() {
    addSkillModal.classList.remove('active');
}

let currentLogSkillId = null;

function openLogModal(skillId, skillName) {
    currentLogSkillId = skillId;
    document.getElementById('log-skill-name').textContent = skillName;
    document.getElementById('log-date').value = new Date().toISOString().split('T')[0];
    logSessionForm.reset();
    document.getElementById('log-date').value = new Date().toISOString().split('T')[0];
    logSessionModal.classList.add('active');
}

function closeLogModal() {
    logSessionModal.classList.remove('active');
    currentLogSkillId = null;
}

// Form Handlers
addSkillForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await createSkill({
            name: document.getElementById('skill-name').value,
            category: document.getElementById('skill-category').value,
            target_hours: parseInt(document.getElementById('skill-target').value) || 0,
        });
        closeAddModal();
        showToast('COMPONENT INITIATED', 'success');
        loadDashboard();
        loadSkills();
    } catch (err) {
        showToast('ERROR INITIATING', 'error');
    }
});

logSessionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await logSession(currentLogSkillId, {
            hours: parseFloat(document.getElementById('log-hours').value),
            notes: document.getElementById('log-notes').value,
            log_date: document.getElementById('log-date').value,
        });
        closeLogModal();
        showToast('DATA COMMITTED', 'success');
        loadDashboard();
        loadSkills();
        loadRecentLogs();
    } catch (err) {
        showToast('COMMIT FAILED', 'error');
    }
});

async function handleDelete(id) {
    if (!confirm('WARN: ERASE COMPONENT FROM DATABASE?')) return;
    try {
        await deleteSkill(id);
        showToast('COMPONENT ERASED', 'success');
        loadDashboard();
        loadSkills();
        loadRecentLogs();
    } catch (err) {
        showToast('ERASE FAILED', 'error');
    }
}

// Export Function
function exportData() {
    if (!skills || skills.length === 0) {
        showToast('NO DATA TO EXPORT', 'error');
        return;
    }
    const csvContent = "data:text/csv;charset=utf-8," 
        + "ID,Name,Category,TargetHours,TotalHours\n"
        + skills.map(e => `${e.id},${e.name},${e.category},${e.target_hours},${e.total_hours}`).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "skillpulse_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('DATA EXPORT INITIATED', 'success');
}

// Utilities
function escapeHtml(str) {
    if(!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(message, type = 'default') {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toast-msg');
    const icon = document.getElementById('toast-icon');
    
    toast.className = 'toast show';
    if(type === 'success') {
        toast.classList.add('success');
        icon.className = 'ph-bold ph-check-circle';
    } else if(type === 'error') {
        toast.classList.add('error');
        icon.className = 'ph-bold ph-warning-circle';
    } else {
        icon.className = 'ph-bold ph-info';
    }
    
    msg.textContent = message;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Close modals on backdrop click
document.querySelectorAll('.modal-backdrop').forEach(el => {
    el.addEventListener('click', (e) => {
        if (e.target === el) {
            el.classList.remove('active');
        }
    });
});
