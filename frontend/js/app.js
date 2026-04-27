const API = '/api';

// Theme Management
function getPreferredTheme() {
    const stored = localStorage.getItem('skillpulse-theme');
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('skillpulse-theme', theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
    
    // Update Chart theme if exists
    if (window.categoryChartInstance) {
        updateChartTheme();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    applyTheme(getPreferredTheme());

    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            applyTheme(current === 'dark' ? 'light' : 'dark');
        });
    }
});

// State
let skills = [];
let dashboard = {};
let recentLogs = [];

// DOM Elements
const statsContainer = document.getElementById('stats');
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
});

// API Calls
async function loadDashboard() {
    try {
        const res = await fetch(`${API}/dashboard`);
        dashboard = await res.json();
        renderStats();
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
    statsContainer.innerHTML = `
        <div class="stat-card">
            <div class="label">Total Skills</div>
            <div class="value">${dashboard.total_skills || 0}</div>
        </div>
        <div class="stat-card">
            <div class="label">Hours Logged</div>
            <div class="value">${(dashboard.total_hours || 0).toFixed(1)}</div>
        </div>
        <div class="stat-card">
            <div class="label">Sessions</div>
            <div class="value">${dashboard.total_logs || 0}</div>
        </div>
        <div class="stat-card">
            <div class="label">Top Skill</div>
            <div class="value" style="font-size:1.8rem">${dashboard.top_skill || 'N/A'}</div>
        </div>
    `;
}

function getLevelInfo(hours) {
    if (hours >= 50) return { label: 'Expert', class: 'level-expert' };
    if (hours >= 10) return { label: 'Intermediate', class: 'level-intermediate' };
    return { label: 'Novice', class: 'level-novice' };
}

function renderSkills() {
    if (!skills || skills.length === 0) {
        skillsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1">
                <h3>No skills yet</h3>
                <p>Click "Add Skill" to start tracking your learning journey.</p>
            </div>
        `;
        return;
    }

    skillsGrid.innerHTML = skills.map(skill => {
        const progress = skill.target_hours > 0
            ? Math.min((skill.total_hours / skill.target_hours) * 100, 100)
            : 0;
            
        const level = getLevelInfo(skill.total_hours);

        return `
            <div class="skill-card">
                <div class="skill-header">
                    <span class="skill-name">${escapeHtml(skill.name)}</span>
                    <div class="skill-badges">
                        ${skill.category ? `<span class="skill-category">${escapeHtml(skill.category)}</span>` : ''}
                        <span class="skill-level ${level.class}">${level.label}</span>
                    </div>
                </div>
                
                <div class="progress-container">
                    <div class="progress-bar">
                        <div class="fill" style="width: ${progress}%"></div>
                    </div>
                    <div class="progress-text">
                        <span><strong>${skill.total_hours.toFixed(1)}</strong> hrs logged</span>
                        <span>${skill.target_hours > 0 ? skill.target_hours + ' hrs goal' : 'No goal'}</span>
                    </div>
                </div>
                
                <div class="skill-actions">
                    <button class="btn btn-primary btn-sm" style="flex: 1;" onclick="openLogModal(${skill.id}, '${escapeHtml(skill.name)}')">
                        + Log Time
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="handleDelete(${skill.id})">
                        Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderActivityFeed() {
    if (!recentLogs || recentLogs.length === 0) {
        activityFeed.innerHTML = '<div class="empty-state">No activity yet. Go log some hours!</div>';
        return;
    }

    activityFeed.innerHTML = recentLogs.map(log => {
        const dateStr = new Date(log.log_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return `
            <div class="activity-item">
                <div class="activity-icon">⚡</div>
                <div class="activity-details">
                    <p>Logged <strong>${log.hours}h</strong> in <strong>${escapeHtml(log.skill_name)}</strong></p>
                    ${log.notes ? `<p style="font-size: 0.85rem; color: var(--text-muted); font-style: italic;">"${escapeHtml(log.notes)}"</p>` : ''}
                    <span class="activity-meta">${dateStr}</span>
                </div>
            </div>
        `;
    }).join('');
}

// Chart.js Setup
window.categoryChartInstance = null;

function updateChartTheme() {
    if (!window.categoryChartInstance) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#f8fafc' : '#0f172a';
    window.categoryChartInstance.options.plugins.legend.labels.color = textColor;
    window.categoryChartInstance.update();
}

function renderChart() {
    if (!skills || skills.length === 0) return;

    // Group hours by category
    const categoryData = {};
    skills.forEach(s => {
        const cat = s.category || 'Other';
        categoryData[cat] = (categoryData[cat] || 0) + s.total_hours;
    });

    const labels = Object.keys(categoryData);
    const data = Object.values(categoryData);
    
    // Check if total is 0 to show empty chart
    const total = data.reduce((a,b) => a+b, 0);
    if(total === 0) {
        const ctx = document.getElementById('categoryChart').getContext('2d');
        ctx.clearRect(0,0, 400, 250);
        return;
    }

    const ctx = document.getElementById('categoryChart').getContext('2d');
    
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#f8fafc' : '#0f172a';

    if (window.categoryChartInstance) {
        window.categoryChartInstance.destroy();
    }

    window.categoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#6366f1', // Indigo
                    '#10b981', // Emerald
                    '#f59e0b', // Amber
                    '#f43f5e', // Rose
                    '#8b5cf6', // Violet
                    '#0ea5e9'  // Sky
                ],
                borderWidth: 0,
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
                        color: textColor,
                        font: {
                            family: "'Outfit', sans-serif",
                            size: 13
                        },
                        padding: 20
                    }
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
        showToast('Skill added successfully!', 'success');
        loadDashboard();
        loadSkills();
    } catch (err) {
        showToast('Failed to add skill', 'error');
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
        showToast('Session logged successfully!', 'success');
        loadDashboard();
        loadSkills();
        loadRecentLogs(); // refresh feed
    } catch (err) {
        showToast('Failed to log session', 'error');
    }
});

async function handleDelete(id) {
    if (!confirm('Are you sure? This will delete the skill and all associated logs.')) return;
    try {
        await deleteSkill(id);
        showToast('Skill deleted', 'success');
        loadDashboard();
        loadSkills();
        loadRecentLogs();
    } catch (err) {
        showToast('Failed to delete skill', 'error');
    }
}

// Utilities
function escapeHtml(str) {
    if(!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
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
