/**
 * Smart Plant Monitor v3.0
 * Complete Dashboard: Simulation, Charts, AI Chatbot, Multi-Plant, Notifications
 */

// ==================== CONFIG ====================
const CONFIG = {
    updateInterval: 3000,
    thresholds: { moistureLow: 40, tempHigh: 32, humidityLow: 40 },
    backendUrl: 'http://localhost:3000', // Secure proxy — key lives in backend/.env
    defaultPlants: [
        { id: 'plant-1', name: 'Fern', emoji: '🌿', type: 'fern' },
        { id: 'plant-2', name: 'Cactus', emoji: '🌵', type: 'cactus' },
        { id: 'plant-3', name: 'Orchid', emoji: '🌸', type: 'orchid' }
    ],
    tips: [
        { icon: '💧', title: 'Watering Wisdom', text: 'Most houseplants prefer to dry slightly between waterings. Stick your finger 2 inches into the soil — if dry, time to water.' },
        { icon: '☀️', title: 'Light Matters', text: 'Indirect bright light suits most plants. Direct afternoon sun can scorch leaves, while too little light causes leggy growth.' },
        { icon: '🌡️', title: 'Temperature Check', text: 'Most indoor plants thrive between 18-24°C. Avoid placing them near drafts, heaters, or air conditioners.' },
        { icon: '💨', title: 'Humidity Helper', text: 'Tropical plants love 60%+ humidity. Group plants together or use a pebble tray with water to boost humidity.' },
        { icon: '🪴', title: 'Repotting Signs', text: 'Roots growing through drainage holes? Circling the surface? Time to repot — typically every 1-2 years in spring.' },
        { icon: '🐛', title: 'Pest Patrol', text: 'Check leaf undersides weekly. Wipe leaves with neem oil solution to prevent spider mites and mealybugs.' },
        { icon: '✂️', title: 'Pruning Tips', text: 'Remove yellow or dead leaves promptly. Prune in spring just above a leaf node for bushier growth.' },
        { icon: '🧪', title: 'Fertilizer Basics', text: 'Feed monthly during growing season (spring-summer) with half-strength liquid fertilizer. Reduce in winter.' }
    ]
};

// ==================== STATE ====================
const state = {
    plants: [], activePlantId: null, history: {},
    notifications: [], unreadCount: 0, theme: 'light',
    geminiApiKey: '', currentTipIndex: 0, chart: null, chartRange: '1h',
    simulatorTime: 0
};

// ==================== DOM CACHE ====================
let D = {};
function cacheDom() {
    D = {
        moistureVal: document.getElementById('moisture-val'),
        moistureBar: document.getElementById('moisture-bar'),
        tempVal: document.getElementById('temp-val'),
        humidVal: document.getElementById('humid-val'),
        statusBanner: document.getElementById('status-banner'),
        statusText: document.querySelector('#status-banner .value'),
        statusIcon: document.querySelector('#status-banner .status-icon i'),
        themeToggle: document.getElementById('theme-toggle'),
        notifBell: document.getElementById('notification-bell'),
        notifBadge: document.getElementById('notif-badge'),
        settingsBtn: document.getElementById('settings-btn'),
        plantTabList: document.getElementById('plant-tab-list'),
        addPlantBtn: document.getElementById('add-plant-btn'),
        historyChart: document.getElementById('history-chart'),
        rangeButtons: document.querySelectorAll('.range-btn'),
        tipIcon: document.getElementById('tip-icon'),
        tipTitle: document.getElementById('tip-title'),
        tipText: document.getElementById('tip-text'),
        tipDots: document.getElementById('tip-dots'),
        tipPrev: document.getElementById('tip-prev'),
        tipNext: document.getElementById('tip-next'),
        chatHistory: document.getElementById('chat-history'),
        userInput: document.getElementById('user-input'),
        sendBtn: document.getElementById('send-btn'),
        uploadBtn: document.getElementById('upload-btn'),
        fileInput: document.getElementById('file-input'),
        minimizeBtn: document.querySelector('.minimize-btn'),
        chatbotSection: document.querySelector('.chatbot-section'),
        quickReplies: document.getElementById('quick-replies'),
        notifPanel: document.getElementById('notification-panel'),
        notifList: document.getElementById('notification-list'),
        clearNotifsBtn: document.getElementById('clear-notifs-btn'),
        apiKeyInput: document.getElementById('api-key-input'),
        saveSettingsBtn: document.getElementById('save-settings-btn'),
        savePlantBtn: document.getElementById('save-plant-btn'),
        plantNameInput: document.getElementById('plant-name-input'),
        plantEmojiSelect: document.getElementById('plant-emoji-select'),
        toastContainer: document.getElementById('toast-container')
    };
}

// ==================== SIMULATION ====================
const plantProfiles = {
    fern:    { mBase: 65, tBase: 22, hBase: 70 },
    cactus:  { mBase: 35, tBase: 26, hBase: 40 },
    orchid:  { mBase: 55, tBase: 24, hBase: 65 },
    default: { mBase: 55, tBase: 23, hBase: 60 }
};

function generateReading(plantType) {
    const p = plantProfiles[plantType] || plantProfiles.default;
    state.simulatorTime++;
    const t = state.simulatorTime;
    const noise = () => (Math.random() - 0.5) * 4;
    const dayFactor = Math.sin((Date.now() / 3600000 - 6) * Math.PI / 12);

    return {
        moisture: clamp(Math.round(p.mBase + Math.sin(t * 0.1) * 10 + noise()), 15, 95),
        temp: clamp(Math.round((p.tBase + dayFactor * 5 + Math.sin(t * 0.15) * 2 + noise() * 0.5) * 10) / 10, 12, 38),
        humidity: clamp(Math.round(p.hBase + Math.sin(t * 0.08) * 12 + noise()), 25, 98),
        timestamp: Date.now()
    };
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ==================== THEME ====================
function initTheme() {
    state.theme = localStorage.getItem('spm-theme') || 'light';
    applyTheme();
    D.themeToggle.addEventListener('click', () => {
        state.theme = state.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('spm-theme', state.theme);
        applyTheme();
    });
}

function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    D.themeToggle.querySelector('i').className = state.theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    if (state.chart) updateChartTheme();
}

// ==================== PLANTS ====================
function initPlants() {
    const saved = localStorage.getItem('spm-plants');
    state.plants = saved ? JSON.parse(saved) : [...CONFIG.defaultPlants];
    if (!saved) savePlants();
    state.activePlantId = localStorage.getItem('spm-active-plant') || state.plants[0]?.id;
    renderPlantTabs();
    D.addPlantBtn.addEventListener('click', () => showModal('add-plant-modal'));
    D.savePlantBtn.addEventListener('click', addNewPlant);
}

function renderPlantTabs() {
    D.plantTabList.innerHTML = '';
    state.plants.forEach(p => {
        const btn = document.createElement('button');
        btn.className = `plant-tab${p.id === state.activePlantId ? ' active' : ''}`;
        btn.innerHTML = `<span class="tab-emoji">${p.emoji}</span><span class="tab-name">${p.name}</span>`;
        btn.addEventListener('click', () => switchPlant(p.id));
        D.plantTabList.appendChild(btn);
    });
}

function switchPlant(id) {
    state.activePlantId = id;
    localStorage.setItem('spm-active-plant', id);
    renderPlantTabs();
    const h = getHistory(id);
    if (h.timestamps.length) {
        const i = h.timestamps.length - 1;
        updateDashboard({ moisture: h.moisture[i], temp: h.temp[i], humidity: h.humidity[i] });
    }
    updateChartData();
}

function addNewPlant() {
    const name = D.plantNameInput.value.trim();
    if (!name) return;
    const emoji = D.plantEmojiSelect.value;
    const plant = { id: 'plant-' + Date.now(), name, emoji, type: 'default' };
    state.plants.push(plant);
    savePlants();
    renderPlantTabs();
    switchPlant(plant.id);
    hideModal('add-plant-modal');
    D.plantNameInput.value = '';
    showToast(`${emoji} ${name} added!`, 'success');
}

function savePlants() { localStorage.setItem('spm-plants', JSON.stringify(state.plants)); }
function getActivePlant() { return state.plants.find(p => p.id === state.activePlantId) || state.plants[0]; }

// ==================== HISTORY ====================
function getHistory(plantId) {
    if (!state.history[plantId]) {
        const saved = localStorage.getItem(`spm-hist-${plantId}`);
        state.history[plantId] = saved ? JSON.parse(saved) : { moisture: [], temp: [], humidity: [], timestamps: [] };
    }
    return state.history[plantId];
}

function addToHistory(plantId, r) {
    const h = getHistory(plantId);
    h.moisture.push(r.moisture); h.temp.push(r.temp);
    h.humidity.push(r.humidity); h.timestamps.push(r.timestamp);
    if (h.timestamps.length > 2880) {
        h.moisture.shift(); h.temp.shift(); h.humidity.shift(); h.timestamps.shift();
    }
    if (h.timestamps.length % 10 === 0)
        localStorage.setItem(`spm-hist-${plantId}`, JSON.stringify(h));
}

// ==================== DASHBOARD UI ====================
function updateDashboard(data) {
    animateValue(D.moistureVal, data.moisture, true);
    animateValue(D.tempVal, data.temp, false);
    animateValue(D.humidVal, data.humidity, true);
    D.moistureBar.style.width = `${data.moisture}%`;
    D.moistureBar.style.background = data.moisture < CONFIG.thresholds.moistureLow
        ? 'linear-gradient(90deg, #ff7675, #d63031)'
        : 'linear-gradient(90deg, #55efc4, #00b894)';
    updateStatus(data);
    updateSparklines();
}

function animateValue(el, newVal, isInt) {
    const cur = parseFloat(el.innerText) || 0;
    const diff = newVal - cur;
    let step = 0;
    const steps = 15;
    const iv = setInterval(() => {
        step++;
        const v = cur + diff * (step / steps);
        el.innerText = isInt ? Math.round(v) : v.toFixed(1);
        if (step >= steps) clearInterval(iv);
    }, 25);
}

function updateStatus(data) {
    const issues = [];
    if (data.moisture < CONFIG.thresholds.moistureLow) issues.push('Low Moisture');
    if (data.temp > CONFIG.thresholds.tempHigh) issues.push('High Temp');
    if (data.humidity < CONFIG.thresholds.humidityLow) issues.push('Low Humidity');
    const bad = issues.length > 0;
    D.statusBanner.className = `status-banner glass-panel ${bad ? 'status-bad' : 'status-good'} scroll-animate visible`;
    D.statusText.innerText = bad ? `⚠️ ${issues.join(' · ')}` : 'All Systems Healthy ✓';
    D.statusIcon.className = bad ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-check-circle';
}

function updateSparklines() {
    const h = getHistory(state.activePlantId);
    drawSparkline('temp-sparkline', h.temp.slice(-20));
    drawSparkline('humid-sparkline', h.humidity.slice(-20));
}

function drawSparkline(id, data) {
    const svg = document.getElementById(id);
    if (!svg || data.length < 2) return;
    const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
    const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${20 - ((v - mn) / rng) * 18}`);
    svg.querySelector('path').setAttribute('d', `M${pts.join(' L')}`);
}

// ==================== CHART.JS ====================
function initChart() {
    const ctx = D.historyChart.getContext('2d');
    const mkDataset = (label, color) => ({
        label, data: [], borderColor: color,
        backgroundColor: color.replace(')', ', 0.08)').replace('rgb', 'rgba'),
        fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2
    });
    state.chart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [
            mkDataset('Moisture (%)', 'rgb(9, 132, 227)'),
            mkDataset('Temperature (°C)', 'rgb(214, 48, 49)'),
            mkDataset('Humidity (%)', 'rgb(0, 206, 201)')
        ]},
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true, padding: 16, font: { family: 'Inter', size: 11 } } },
                tooltip: { backgroundColor: 'rgba(0,0,0,0.8)', padding: 10, cornerRadius: 8, titleFont: { family: 'Inter' }, bodyFont: { family: 'Inter' } }
            },
            scales: {
                x: { display: true, grid: { display: false }, ticks: { maxTicksLimit: 8, font: { family: 'Inter', size: 10 }, color: '#636e72' } },
                y: { display: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { family: 'Inter', size: 10 }, color: '#636e72' } }
            }
        }
    });
    D.rangeButtons.forEach(btn => btn.addEventListener('click', () => {
        D.rangeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.chartRange = btn.dataset.range;
        updateChartData();
    }));
    updateChartData();
}

function updateChartData() {
    if (!state.chart) return;
    const h = getHistory(state.activePlantId);
    const rangeMs = { '1h': 3600000, '6h': 21600000, '24h': 86400000 }[state.chartRange] || 3600000;
    const cutoff = Date.now() - rangeMs;
    const idx = [];
    for (let i = 0; i < h.timestamps.length; i++) if (h.timestamps[i] >= cutoff) idx.push(i);
    state.chart.data.labels = idx.map(i => new Date(h.timestamps[i]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    state.chart.data.datasets[0].data = idx.map(i => h.moisture[i]);
    state.chart.data.datasets[1].data = idx.map(i => h.temp[i]);
    state.chart.data.datasets[2].data = idx.map(i => h.humidity[i]);
    state.chart.update('none');
}

function updateChartTheme() {
    if (!state.chart) return;
    const dark = state.theme === 'dark';
    const tc = dark ? '#b2bec3' : '#636e72';
    const gc = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
    state.chart.options.scales.x.ticks.color = tc;
    state.chart.options.scales.y.ticks.color = tc;
    state.chart.options.scales.y.grid.color = gc;
    state.chart.options.plugins.legend.labels.color = tc;
    state.chart.update('none');
}

// ==================== NOTIFICATIONS ====================
function initNotifications() {
    const saved = localStorage.getItem('spm-notifs');
    if (saved) state.notifications = JSON.parse(saved);
    state.unreadCount = state.notifications.filter(n => !n.read).length;
    updateBadge();
    D.notifBell.addEventListener('click', toggleNotifPanel);
    D.clearNotifsBtn.addEventListener('click', () => {
        state.notifications = []; state.unreadCount = 0;
        updateBadge(); saveNotifs(); renderNotifs();
    });
    document.addEventListener('click', e => {
        if (!D.notifPanel.contains(e.target) && !D.notifBell.contains(e.target))
            D.notifPanel.classList.add('hidden');
    });
}

function checkThresholds(data) {
    const p = getActivePlant();
    if (data.moisture < CONFIG.thresholds.moistureLow)
        addNotification(`${p.emoji} ${p.name} needs water! Moisture at ${data.moisture}%`, 'warning');
    if (data.temp > CONFIG.thresholds.tempHigh)
        addNotification(`${p.emoji} ${p.name} too hot! Temp at ${data.temp}°C`, 'danger');
    if (data.humidity < CONFIG.thresholds.humidityLow)
        addNotification(`${p.emoji} ${p.name} needs humidity! At ${data.humidity}%`, 'warning');
}

function addNotification(msg, type) {
    if (state.notifications.find(n => n.message === msg && Date.now() - n.timestamp < 30000)) return;
    state.notifications.unshift({ id: Date.now(), message: msg, type, timestamp: Date.now(), read: false });
    if (state.notifications.length > 50) state.notifications.pop();
    state.unreadCount++;
    updateBadge(); saveNotifs(); showToast(msg, type);
}

function toggleNotifPanel() {
    D.notifPanel.classList.toggle('hidden');
    if (!D.notifPanel.classList.contains('hidden')) {
        renderNotifs();
        state.notifications.forEach(n => n.read = true);
        state.unreadCount = 0; updateBadge(); saveNotifs();
    }
}

function renderNotifs() {
    D.notifList.innerHTML = state.notifications.length === 0
        ? '<div class="notif-empty">No notifications yet 🌱</div>'
        : state.notifications.slice(0, 20).map(n => `
            <div class="notif-item notif-${n.type}">
                <div class="notif-message">${n.message}</div>
                <div class="notif-time">${timeAgo(n.timestamp)}</div>
            </div>`).join('');
}

function updateBadge() {
    D.notifBadge.textContent = state.unreadCount;
    D.notifBadge.classList.toggle('hidden', state.unreadCount === 0);
}
function saveNotifs() { localStorage.setItem('spm-notifs', JSON.stringify(state.notifications)); }

function showToast(msg, type = 'info') {
    const icons = { warning: 'fa-triangle-exclamation', danger: 'fa-fire', success: 'fa-check-circle', info: 'fa-info-circle' };
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${msg}</span>`;
    D.toastContainer.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 4000);
}

// ==================== TIPS ====================
function initTips() {
    renderTip(); renderTipDots();
    D.tipPrev.addEventListener('click', () => { state.currentTipIndex = (state.currentTipIndex - 1 + CONFIG.tips.length) % CONFIG.tips.length; renderTip(); renderTipDots(); });
    D.tipNext.addEventListener('click', () => { state.currentTipIndex = (state.currentTipIndex + 1) % CONFIG.tips.length; renderTip(); renderTipDots(); });
    setInterval(() => { state.currentTipIndex = (state.currentTipIndex + 1) % CONFIG.tips.length; renderTip(); renderTipDots(); }, 10000);
}

function renderTip() {
    const tip = CONFIG.tips[state.currentTipIndex];
    D.tipIcon.textContent = tip.icon;
    D.tipTitle.textContent = tip.title;
    D.tipText.textContent = tip.text;
}

function renderTipDots() {
    D.tipDots.innerHTML = CONFIG.tips.map((_, i) => `<span class="dot${i === state.currentTipIndex ? ' active' : ''}" data-i="${i}"></span>`).join('');
    D.tipDots.querySelectorAll('.dot').forEach(d => d.addEventListener('click', () => {
        state.currentTipIndex = parseInt(d.dataset.i); renderTip(); renderTipDots();
    }));
}

// ==================== CHATBOT ====================
async function checkBackendStatus() {
    try {
        const res = await fetch(`${CONFIG.backendUrl}/health`, { signal: AbortSignal.timeout(2000) });
        const data = await res.json();
        state.backendOnline = data.status === 'ok';
        state.backendKeyConfigured = data.keyConfigured;
    } catch {
        state.backendOnline = false;
        state.backendKeyConfigured = false;
    }
    // Update bot status text
    const statusEl = document.getElementById('bot-status-text');
    if (statusEl) {
        if (state.backendOnline && state.backendKeyConfigured) {
            statusEl.textContent = 'AI Online';
        } else if (state.backendOnline && !state.backendKeyConfigured) {
            statusEl.textContent = 'Backend up — add key';
        } else {
            statusEl.textContent = 'Local mode';
        }
    }
}

function initChatbot() {
    state.backendOnline = false;
    state.backendKeyConfigured = false;
    checkBackendStatus();

    D.sendBtn.addEventListener('click', handleSend);
    D.userInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleSend(); });
    D.uploadBtn.addEventListener('click', () => D.fileInput.click());
    D.fileInput.addEventListener('change', handleUpload);

    let minimized = false;
    D.minimizeBtn.addEventListener('click', () => {
        minimized = !minimized;
        D.chatbotSection.classList.toggle('minimized', minimized);
        D.minimizeBtn.innerHTML = minimized ? '<i class="fa-solid fa-plus"></i>' : '<i class="fa-solid fa-minus"></i>';
    });

    D.quickReplies.addEventListener('click', e => {
        const btn = e.target.closest('.quick-reply-btn');
        if (btn) { D.userInput.value = btn.textContent; handleSend(); }
    });

    // Settings modal — now shows backend status, not raw key input
    D.settingsBtn.addEventListener('click', () => {
        checkBackendStatus().then(() => {
            if (D.apiKeyInput) {
                D.apiKeyInput.placeholder = state.backendOnline
                    ? (state.backendKeyConfigured ? 'Key is configured in backend/.env ✅' : 'Add key to backend/.env')
                    : 'Start backend server first (npm run dev)';
                D.apiKeyInput.disabled = true;
                D.apiKeyInput.value = '';
            }
        });
        showModal('settings-modal');
    });
    D.saveSettingsBtn.addEventListener('click', () => {
        hideModal('settings-modal');
        showToast('🔑 Edit GEMINI_API_KEY in backend/.env — key stays server-side!', 'info');
    });

    showQuickReplies(['How to water my plant?', 'Check my sensor status', 'Common plant diseases']);
}

let _sendCooldown = false;
const SEND_COOLDOWN_MS = 3000;  // 3 seconds between messages

async function handleSend() {
    const text = D.userInput.value.trim();
    if (!text || _sendCooldown) return;

    // Activate cooldown — disables button briefly
    _sendCooldown = true;
    D.sendBtn.disabled = true;
    D.sendBtn.style.opacity = '0.5';
    setTimeout(() => { _sendCooldown = false; D.sendBtn.disabled = false; D.sendBtn.style.opacity = '1'; }, SEND_COOLDOWN_MS);

    addChat(text, 'user');
    D.userInput.value = '';
    D.quickReplies.classList.add('hidden');
    showTyping();
    try {
        // Try backend proxy first; fall back to local rule-based responses
        const resp = state.backendOnline && state.backendKeyConfigured
            ? await proxyResponse(text)
            : await localResponse(text);
        removeTyping();
        addChat(resp, 'bot');
        showQuickReplies(getQuickReplies(text));
    } catch (e) {
        removeTyping();
        const fallback = await localResponse(text);
        const em = (e && e.message) ? e.message.toString() : '';
        if (em.includes('429') || /rate|quota/i.test(em)) {
            showToast('⏳ AI rate-limited — please wait a moment. Using local fallback.', 'warning');
        } else {
            showToast('AI proxy error — using local fallback.', 'warning');
        }
        console.warn('Chat proxy error:', em || e);
        addChat('🌱 Local mode: ' + fallback, 'bot');
    }
}

async function proxyResponse(userMsg) {
    const plant = getActivePlant();
    const h = getHistory(state.activePlantId);
    const last = h.timestamps.length - 1;
    const sensorContext = last >= 0
        ? `Plant: "${plant.name}" (${plant.emoji}) | Moisture: ${h.moisture[last]}% | Temp: ${h.temp[last]}°C | Humidity: ${h.humidity[last]}%`
        : '';

    // POST to our secure backend — API key never leaves the server
    const res = await fetch(`${CONFIG.backendUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, sensorContext }),
        signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Backend error ${res.status}`);
    }

    const data = await res.json();
    return data.reply || "Hmm, I couldn't process that. Try again! 🌱";
}

async function localResponse(text) {
    await new Promise(r => setTimeout(r, 700));
    const l = text.toLowerCase();
    const p = getActivePlant();
    const h = getHistory(state.activePlantId);
    const last = h.timestamps.length - 1;

    if (l.includes('status') || l.includes('sensor') || l.includes('check') || l.includes('reading')) {
        if (last >= 0) {
            const m = h.moisture[last], t = h.temp[last], hu = h.humidity[last];
            let a = `📊 ${p.emoji} ${p.name}: 💧 ${m}% | 🌡️ ${t}°C | 💨 ${hu}%\n`;
            a += m < 40 ? '⚠️ Moisture low — water now!' : t > 32 ? '⚠️ Too hot — move to shade!' : '✅ Looking great!';
            return a;
        }
        return "No data yet — give it a moment to start collecting! 📡";
    }
    if (l.includes('water') || l.includes('thirsty')) return "💧 Use the 'soak and dry' method — water deeply until it drains, then wait until the top 2\" of soil is dry. Your moisture sensor shows you exactly when!";
    if (l.includes('sun') || l.includes('light')) return "☀️ Bright indirect light works for most houseplants. East windows are ideal! Afternoon direct sun can burn leaves.";
    if (l.includes('yellow')) return "🍂 Yellow leaves often mean overwatering (most common!), underwatering, nutrient deficiency, or too much sun. Check soil moisture first.";
    if (l.includes('pest') || l.includes('bug')) return "🐛 Common pests: spider mites (tiny webs), mealybugs (white cottony), fungus gnats (tiny flies). Neem oil spray works for most!";
    if (l.includes('fertil') || l.includes('feed')) return "🧪 Feed monthly in spring/summer with half-strength 10-10-10 fertilizer. Skip in winter.";
    if (l.includes('repot') || l.includes('soil') || l.includes('pot')) return "🪴 Repot when roots outgrow the pot — pick one 1-2\" larger with fresh well-draining mix!";
    if (l.includes('humid') || l.includes('mist')) return "💨 Boost humidity by misting daily, using a pebble tray, or grouping plants. Tropicals love 50-70%!";
    if (l.includes('prune') || l.includes('trim')) return "✂️ Prune in spring above a leaf node at 45°. Remove dead leaves anytime for bushier growth.";
    if (l.includes('hello') || l.includes('hi') || l.includes('hey')) return `Hello! 👋 I'm monitoring ${p.emoji} ${p.name}. Ask me anything about plant care! 🌱`;
    if (l.includes('thank')) return "You're welcome! Happy growing! 🌱✨";
    if (l.includes('help')) return "I can help with: 💧 Water, ☀️ Light, 🐛 Pests, 🧪 Fertilizer, 🪴 Repotting, 📊 Sensors & more!";
    return `🌱 Try asking about watering, light, pests, or say "check my sensors" for ${p.emoji} ${p.name}'s live data! For AI-powered answers, add your free Gemini key in ⚙️ Settings.`;
}

function getQuickReplies(input) {
    const l = input.toLowerCase();
    if (l.includes('water')) return ['How often?', 'Overwatering signs', '📊 Sensor status'];
    if (l.includes('pest')) return ['Neem oil usage', 'Prevent pests', 'Identify bugs'];
    if (l.includes('light')) return ['Low light plants', 'Grow lights', '📊 Sensor status'];
    return ['💧 Watering tips', '☀️ Light guide', '🐛 Pest help', '📊 Sensor status'];
}

function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        addChat(`<img src="${ev.target.result}" class="preview-img" alt="Plant photo"><br>📸 ${file.name}`, 'user');
        showTyping();
        setTimeout(() => {
            removeTyping();
            addChat("🔍 Photo received! I can see your plant. Check for yellow leaves (overwatering), brown tips (low humidity), or spots (fungal). For AI image analysis, add your Gemini API key in ⚙️ Settings! ✅", 'bot');
            showQuickReplies(['Yellow leaves help', 'Brown tips fix', '📊 Sensor status']);
        }, 2000);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

function addChat(html, sender) {
    const div = document.createElement('div');
    div.className = `message ${sender}-message`;
    div.innerHTML = html;
    D.chatHistory.appendChild(div);
    D.chatHistory.scrollTop = D.chatHistory.scrollHeight;
}

function showTyping() {
    const div = document.createElement('div');
    div.className = 'message bot-message typing-indicator';
    div.id = 'typing-ind';
    div.innerHTML = '<span class="dot-1">.</span><span class="dot-2">.</span><span class="dot-3">.</span>';
    D.chatHistory.appendChild(div);
    D.chatHistory.scrollTop = D.chatHistory.scrollHeight;
}

function removeTyping() { document.getElementById('typing-ind')?.remove(); }

function showQuickReplies(replies) {
    D.quickReplies.innerHTML = replies.map(r => `<button class="quick-reply-btn">${r}</button>`).join('');
    D.quickReplies.classList.remove('hidden');
}

// ==================== MODALS ====================
function showModal(id) { document.getElementById(id).classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
function hideModal(id) { document.getElementById(id).classList.add('hidden'); document.body.style.overflow = ''; }
document.addEventListener('click', e => { if (e.target.classList.contains('modal')) { e.target.classList.add('hidden'); document.body.style.overflow = ''; } });

// ==================== EFFECTS ====================
function initTilt() {
    document.querySelectorAll('[data-tilt]').forEach(card => {
        card.addEventListener('mousemove', e => {
            const r = card.getBoundingClientRect();
            const rx = ((e.clientY - r.top - r.height / 2) / (r.height / 2)) * -8;
            const ry = ((e.clientX - r.left - r.width / 2) / (r.width / 2)) * 8;
            card.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.02,1.02,1.02)`;
        });
        card.addEventListener('mouseleave', () => { card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1,1,1)'; });
    });
}

function initScrollObserver() {
    const obs = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }), { threshold: 0.1 });
    document.querySelectorAll('.scroll-animate').forEach(el => obs.observe(el));
}

// ==================== UTILITIES ====================
function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

// ==================== MAIN LOOP ====================
function tick() {
    state.plants.forEach(plant => {
        const reading = generateReading(plant.type);
        addToHistory(plant.id, reading);
        if (plant.id === state.activePlantId) {
            updateDashboard(reading);
            checkThresholds(reading);
        }
    });
    updateChartData();
}

// ==================== INIT ====================
function init() {
    console.log('🌱 Smart Plant Monitor v3.0 Started');
    cacheDom();
    initTheme();
    initPlants();
    initNotifications();
    initChart();
    initTips();
    initChatbot();
    initTilt();
    initScrollObserver();
    tick();
    setInterval(tick, CONFIG.updateInterval);
}

document.addEventListener('DOMContentLoaded', init);