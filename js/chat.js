// js/chat.js — Sherpa AI Chat Module
import { getPlannerData, updateAgent, addAgent, deleteAgent } from './planner.js';
import { getUsersData } from './users.js?v=2026.07.15.15';
import { getAverageProductivity, getProductivityTrendData } from './productivity.js?v=2026.07.15.15';
import { showSection } from './ui.js?v=2026.07.15.15';
import { showTemporaryMessage } from './ui.js?v=2026.07.15.15';
import { translations, extractHoursFromDay, getMonthKey, getAgentDaysForMonth, getEffectiveAgentDayValue, isNonWorkingCode, normalizeTeamForDisplay, parseShiftEntry } from './config.js';
import { functions } from './firebase-config.js';
import { logActivity } from './logs.js?v=2026.07.15.15';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js";
import { createSherpaChatService, getChatErrorTranslationKey } from './chat-service.js';

function getLang() { return localStorage.getItem('language') || 'ro'; }
function t(key) { const l = getLang(); return (translations[l] && translations[l][key]) || key; }

// --- State ---
let chatHistory = [];
let isOpen = false;
let isLoading = false;
let lastSendTime = 0;
let pendingDeleteAgent = null; // Holds agent awaiting delete confirmation
const chatService = createSherpaChatService(httpsCallable(functions, 'generateSherpaChat'));

// --- Initialization ---
export async function initializeChat() {
    const bubble = document.getElementById('chatBubble');
    const panel = document.getElementById('chatPanel');
    const closeBtn = document.getElementById('chatCloseBtn');
    const sendBtn = document.getElementById('chatSendBtn');
    const input = document.getElementById('chatInput');
    const clearBtn = document.getElementById('chatClearBtn');

    if (!bubble || !panel) return;

    // Initialize particle animations and drag
    initChatParticles();
    initDraggable();

    bubble.addEventListener('click', toggleChat);
    closeBtn?.addEventListener('click', toggleChat);
    sendBtn?.addEventListener('click', () => sendMessage());
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    clearBtn?.addEventListener('click', clearChat);
    chatHistory = [];
    addSystemMessage(t('chat-welcome'));
}

export function cleanupChat() {
    chatHistory = [];
    isOpen = false;
    const panel = document.getElementById('chatPanel');
    if (panel) panel.classList.remove('open');
}

// --- Toggle Chat ---
function toggleChat() {
    isOpen = !isOpen;
    const panel = document.getElementById('chatPanel');
    const bubble = document.getElementById('chatBubble');
    if (panel) {
        panel.classList.toggle('open', isOpen);
        // Reset position when opening
        if (isOpen) {
            panel.style.left = '';
            panel.style.top = '';
            panel.style.right = '24px';
            panel.style.bottom = '90px';
        }
    }
    if (bubble) bubble.classList.toggle('hidden', isOpen);
    if (isOpen) {
        setTimeout(() => document.getElementById('chatInput')?.focus(), 300);
    }
}

// --- Send Message ---
async function sendMessage() {
    const input = document.getElementById('chatInput');
    if (!input || !input.value.trim() || isLoading) return;

    // Rate limit (2s cooldown)
    if (Date.now() - lastSendTime < 2000) return;
    lastSendTime = Date.now();

    const userText = input.value.trim();
    input.value = '';

    // Check for pending delete confirmation
    if (pendingDeleteAgent) {
        const confirm = userText.toLowerCase();
        const yesWords = ['yes', 'da', 'sì', 'si', 'ok', 'confirm', 'sure', 'do it', 'delete', 'sterge', 'șterge'];
        const noWords = ['no', 'nu', 'cancel', 'anulează', 'annulla', 'stop', 'nope'];
        if (yesWords.some(w => confirm.includes(w))) {
            chatHistory.push({ role: 'user', text: userText });
            try {
                await deleteAgent(pendingDeleteAgent.id);
                logActivity('ai', 'delete_agent', { name: pendingDeleteAgent.fullName });
                chatHistory.push({ role: 'model', text: `✓ ${pendingDeleteAgent.fullName} deleted` });
            } catch (err) {
                chatHistory.push({ role: 'error', text: `Error: ${err.message}` });
            }
            pendingDeleteAgent = null;
            renderMessages();
            return;
        } else if (noWords.some(w => confirm.includes(w))) {
            chatHistory.push({ role: 'user', text: userText });
            chatHistory.push({ role: 'model', text: t('chat-delete-cancelled') || 'Delete cancelled.' });
            pendingDeleteAgent = null;
            renderMessages();
            return;
        }
        // If neither yes nor no, clear pending and process as normal message
        pendingDeleteAgent = null;
    }

    // Add user message
    chatHistory.push({ role: 'user', text: userText });
    renderMessages();

    // Show typing
    isLoading = true;
    showTyping(true);

    try {
        const responseText = await callGeminiAPI(chatHistory);

        // Parse actions
        const { cleanText, actions } = parseActions(responseText);

        // Execute actions (with rate limit)
        const actionResults = [];
        const limitedActions = actions.slice(0, MAX_ACTIONS_PER_MESSAGE);
        if (actions.length > MAX_ACTIONS_PER_MESSAGE) {
            actionResults.push(`⚠ Limited to ${MAX_ACTIONS_PER_MESSAGE} actions (${actions.length} requested)`);
        }
        for (const action of limitedActions) {
            const result = await executeAction(action.command, action.params);
            if (result) actionResults.push(result);
        }

        // Build display text
        let displayText = cleanText.trim();
        if (actionResults.length > 0) {
            displayText += '\n' + actionResults.map(r => `✓ ${r}`).join('\n');
        }

        chatHistory.push({ role: 'model', text: displayText });
    } catch (err) {
        console.error('[Chat] Error:', err);
        chatHistory.push({ role: 'error', text: t(getChatErrorTranslationKey(err)) });
    } finally {
        isLoading = false;
        showTyping(false);
        renderMessages();
    }
}

// --- Tool Call Execution (reads from in-memory data) ---
function parseScheduleEntries(dayValue) {
    if (!dayValue || typeof dayValue !== 'string') return [];

    const trimmed = dayValue.trim();
    if (isNonWorkingCode(trimmed)) return [];

    return trimmed
        .split('+')
        .map(part => parseShiftEntry(part))
        .filter(Boolean)
        .map(parsed => ({
            hours: parsed.hours,
            team: parsed.team ? normalizeTeamForDisplay(parsed.team) : null
        }));
}

function isValidScheduleValue(value) {
    const trimmed = (value || '').trim();
    if (!trimmed) return true;
    if (isNonWorkingCode(trimmed)) return true;
    return trimmed.split('+').every(part => parseShiftEntry(part));
}

function buildDayStatus(agents, dayNum) {
    const schedule = { working: [], holiday: [], sick: [], dayOff: [], unplanned: [] };
    let totalHours = 0;
    const teamHours = {};
    const now = new Date();
    const targetYear = now.getFullYear();
    const targetMonth = now.getMonth();
    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

    agents.forEach(a => {
        const targetDate = new Date(targetYear, targetMonth, dayNum);
        const val = dayNum > daysInMonth ? '' : (getEffectiveAgentDayValue(a, targetDate) || '');
        const trimmed = val.trim();
        if (!trimmed) { schedule.unplanned.push(a.fullName); return; }
        if (trimmed === 'Co') { schedule.holiday.push(a.fullName); return; }
        if (trimmed === 'CM') { schedule.sick.push(a.fullName); return; }
        if (isNonWorkingCode(trimmed)) { schedule.dayOff.push(a.fullName); return; }
        schedule.working.push(a.fullName);
        totalHours += extractHoursFromDay(trimmed);
        parseScheduleEntries(trimmed).forEach(entry => {
            if (entry.team) {
                teamHours[entry.team] = (teamHours[entry.team] || 0) + entry.hours;
            }
        });
    });

    return {
        day: dayNum,
        working: schedule.working.length,
        holiday: schedule.holiday.length,
        sick: schedule.sick.length,
        dayOff: schedule.dayOff.length,
        unplanned: schedule.unplanned.length,
        totalHours,
        teamHours,
        workingAgents: schedule.working,
        holidayAgents: schedule.holiday,
        sickAgents: schedule.sick,
        dayOffAgents: schedule.dayOff
    };
}

function executeToolCall(name, args) {
    const agents = getPlannerData() || [];

    switch (name) {
        case 'get_agent_list': {
            let filtered = agents;
            if (args.active_only !== false) filtered = filtered.filter(a => a.isActive !== false);
            if (args.team_filter) filtered = filtered.filter(a => (a.primaryTeam || '').startsWith(args.team_filter));
            return filtered.map(a => ({
                name: a.fullName,
                team: a.primaryTeam || '?',
                contract: `${a.contractType || 'Full-time'} ${a.contractHours || 8}h`,
                active: a.isActive !== false
            }));
        }
        case 'get_agent_schedule': {
            const agent = findAgent(args.agent_name);
            if (!agent) return { error: `Agent "${args.agent_name}" not found` };
            const schedMonthKey = getMonthKey(new Date());
            const [year, month] = schedMonthKey.split('-').map(Number);
            const daysInMonth = new Date(year, month, 0).getDate();
            const schedDaysArray = Array.from({ length: 31 }, (_, index) => {
                if (index + 1 > daysInMonth) return '';
                return getEffectiveAgentDayValue(agent, new Date(year, month - 1, index + 1));
            });
            const scheduledDays = schedDaysArray
                .map((v, i) => ({ day: i + 1, value: v || '' }))
                .filter(d => d.value);
            return {
                name: agent.fullName,
                team: agent.primaryTeam,
                contract: `${agent.contractType} ${agent.contractHours}h`,
                totalScheduledDays: scheduledDays.length,
                days: scheduledDays
            };
        }
        case 'get_today_status':
            return buildDayStatus(agents, new Date().getDate());
        case 'get_day_status':
            return buildDayStatus(agents, args.day_number);
        case 'get_team_summary': {
            const teamCounts = {};
            agents.filter(a => a.isActive !== false).forEach(a => {
                const team = a.primaryTeam || 'Unknown';
                teamCounts[team] = (teamCounts[team] || 0) + 1;
            });
            return {
                total: agents.length,
                active: agents.filter(a => a.isActive !== false).length,
                inactive: agents.filter(a => a.isActive === false).length,
                teams: teamCounts
            };
        }
        case 'get_productivity': {
            const { average, days } = getAverageProductivity();
            const trend = getProductivityTrendData();
            return {
                average: average !== null ? parseFloat(average.toFixed(2)) : null,
                daysWithData: days,
                rating: average >= 5 ? 'good' : average >= 3 ? 'average' : average !== null ? 'below_target' : 'no_data',
                formula: '(tickets + calls) / hours_worked',
                trendTeams: trend ? Object.keys(trend.teams) : []
            };
        }
        case 'get_week_overview': {
            const result = [];
            for (let d = args.start_day; d <= Math.min(args.end_day, 31); d++) {
                const s = buildDayStatus(agents, d);
                result.push({ day: d, working: s.working, absent: s.holiday + s.sick + s.dayOff, unplanned: s.unplanned, totalHours: s.totalHours });
            }
            return result;
        }
        default:
            return { error: `Unknown function: ${name}` };
    }
}

// --- Secure callable AI transport with client-side function execution ---
async function callGeminiAPI(messages) {
    // Keep only last 20 messages to avoid exceeding token limits
    const recentMessages = messages
        .filter(m => m.role === 'user' || m.role === 'model')
        .slice(-20);

    const contents = recentMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
    }));

    // Function calling loop (max 5 rounds to allow multiple queries)
    for (let round = 0; round < 5; round++) {
        const data = await chatService.generate({ language: getLang(), contents });
        const candidate = data?.candidates?.[0]?.content;
        if (!candidate || !candidate.parts) throw new Error('Empty response from Gemini');

        // Check for function calls
        const functionCalls = candidate.parts.filter(p => p.functionCall);
        if (functionCalls.length > 0) {
            // Add model's function call response to conversation
            contents.push({ role: 'model', parts: candidate.parts });

            // Execute each function call and build responses
            const responseParts = functionCalls.map(fc => {
                const result = executeToolCall(fc.functionCall.name, fc.functionCall.args || {});
                return {
                    functionResponse: {
                        name: fc.functionCall.name,
                        response: { result: JSON.stringify(result) }
                    }
                };
            });
            contents.push({ role: 'user', parts: responseParts });
            continue; // Next round — AI will now process the data
        }

        // No function calls — extract final text response
        const text = candidate.parts.find(p => p.text)?.text;
        if (!text) throw new Error('Empty text in response');
        return text;
    }

    throw new Error('Too many function call rounds');
}

// --- Parse Actions ---
function parseActions(responseText) {
    const actionRegex = /\[\[ACTION:(\w+)\|([^\]]*)\]\]/g;
    const actions = [];
    let match;

    while ((match = actionRegex.exec(responseText)) !== null) {
        const command = match[1];
        const params = match[2].split('|').map(p => p.trim());
        actions.push({ command, params });
    }

    const cleanText = responseText.replace(/\[\[ACTION:[^\]]*\]\]\n?/g, '').trim();
    return { cleanText, actions };
}

// --- Execute Actions ---
function normalizeName(name) {
    if (!name) return '';
    return name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function findAgent(nameQuery) {
    const agents = getPlannerData() || [];
    const query = normalizeName(nameQuery);
    // Exact match first
    let found = agents.find(a => normalizeName(a.fullName) === query);
    if (found) return found;
    // Partial match
    found = agents.find(a => normalizeName(a.fullName).includes(query) || query.includes(normalizeName(a.fullName)));
    return found || null;
}

// Action rate limiting: max actions per message
const MAX_ACTIONS_PER_MESSAGE = 15;

async function executeAction(command, params) {
    try {
        switch (command) {
            case 'SET_CELL': {
                const [agentName, dayStr, value] = params;
                const agent = findAgent(agentName);
                if (!agent) return `Agent "${agentName}" not found`;
                const dayIndex = parseInt(dayStr, 10) - 1;
                const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
                if (dayIndex < 0 || dayIndex >= daysInMonth) return `Invalid day: ${dayStr} (month has ${daysInMonth} days)`;

                // Safety: validate value format
                if (!isValidScheduleValue(value)) return `Invalid schedule value: "${value}"`;

                // Safety: warn if hours exceed contract
                if (value && agent.contractHours) {
                    const totalHours = extractHoursFromDay(value);
                    if (totalHours > agent.contractHours) {
                        console.warn(`[Chat] Schedule ${value} (${totalHours}h) exceeds contract (${agent.contractHours}h) for ${agent.fullName}`);
                    }
                }

                const setCellMonthKey = getMonthKey(new Date());
                const setCellDays = getAgentDaysForMonth(agent, setCellMonthKey);
                const newDays = [...setCellDays];
                while (newDays.length < 31) newDays.push('');
                newDays[dayIndex] = value || '';
                await updateAgent(agent.id, { [`monthlyDays.${setCellMonthKey}`]: newDays });
                logActivity('ai', 'set_cell', { agent: agent.fullName, day: dayStr, value: value || 'cleared' });
                return `${agent.fullName}: day ${dayStr} → ${value || 'cleared'}`;
            }

            case 'ADD_AGENT': {
                const [fullName, username, primaryTeam, contractType, contractHours] = params;
                if (!fullName || fullName.trim().length < 3) return 'Agent name too short';

                // Safety: check for duplicates
                const existing = findAgent(fullName);
                if (existing) return `Agent "${fullName}" already exists`;

                const hours = parseInt(contractHours, 10) || 8;
                if (hours < 1 || hours > 12) return `Invalid contract hours: ${contractHours}`;

                const validTeams = ['RO zooplus', 'HU zooplus', 'IT zooplus', 'NL zooplus', 'CS zooplus', 'SK zooplus', 'SV-SE zooplus', '2L 2nd Level', 'QA Quality Assurance', 'TL Team Lead'];
                const team = primaryTeam || 'RO zooplus';
                if (!validTeams.includes(team)) return `Unknown team: "${team}". Valid: ${validTeams.join(', ')}`;

                const addAgentMonthKey = getMonthKey(new Date());
                await addAgent({
                    fullName: fullName.trim(),
                    username: (username || fullName.toLowerCase().replace(/\s+/g, '.')).trim(),
                    primaryTeam: team,
                    contractType: contractType === 'Part-time' ? 'Part-time' : 'Full-time',
                    contractHours: hours,
                    teams: [team.split(' ')[0]],
                    hireDate: new Date(),
                    isActive: true,
                    monthlyDays: { [addAgentMonthKey]: Array(31).fill('') },
                    monthlyNotes: {}
                });
                logActivity('ai', 'add_agent', { name: fullName.trim(), team, contract: `${contractType || 'Full-time'} ${hours}h` });
                return `Agent "${fullName}" created (${team}, ${contractType || 'Full-time'}, ${hours}h)`;
            }

            case 'DELETE_AGENT': {
                const [agentName] = params;
                const agent = findAgent(agentName);
                if (!agent) return `Agent "${agentName}" not found`;
                // Safety: require explicit user confirmation — do NOT delete immediately
                pendingDeleteAgent = agent;
                return null; // The AI's response already asks for confirmation
            }

            case 'NAVIGATE': {
                const [sectionId] = params;
                const validSections = ['dashboard', 'users', 'planner', 'productivity', 'upload', 'reports', 'logs', 'info'];
                if (!validSections.includes(sectionId)) return `Invalid section: ${sectionId}`;
                showSection(sectionId);
                logActivity('ai', 'navigate', { section: sectionId });
                return `Navigated to ${sectionId}`;
            }

            default:
                return null;
        }
    } catch (err) {
        console.error(`[Chat] Action error (${command}):`, err);
        return `Error: ${err.message}`;
    }
}

// --- Rendering ---
function renderMessages() {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    container.innerHTML = '';
    chatHistory.forEach(msg => {
        const div = document.createElement('div');
        if (msg.role === 'error') {
            div.className = 'chat-msg error';
        } else if (msg.role === 'system') {
            div.className = 'chat-msg system';
        } else {
            div.className = `chat-msg ${msg.role === 'user' ? 'user' : 'ai'}`;
        }
        // Safe markdown rendering: escape first, then apply formatting
        // Since escapeHtml already ran, all user content is safe — regex matches only escaped text
        const escaped = escapeHtml(msg.text);
        // Bold: **text** → <strong>text</strong> (captured text is already escaped)
        let html = escaped
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/^• (.+)$/gm, '<span class="chat-bullet">• $1</span>')
            .replace(/^- (.+)$/gm, '<span class="chat-bullet">• $1</span>')
            .replace(/^(\d+)\. (.+)$/gm, '<span class="chat-bullet"><strong>$1.</strong> $2</span>')
            .replace(/✓ (.+)/g, '<span class="chat-action-badge">✓ $1</span>')
            .replace(/⚠ (.+)/g, '<span class="chat-action-badge chat-action-warn">⚠ $1</span>')
            .replace(/\n/g, '<br>');
        div.innerHTML = html;
        container.appendChild(div);
    });

    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showTyping(show) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    const existing = container.querySelector('.chat-typing');
    if (existing) existing.remove();
    if (show) {
        const typing = document.createElement('div');
        typing.className = 'chat-typing';
        typing.innerHTML = '<span></span><span></span><span></span>';
        container.appendChild(typing);
        container.scrollTop = container.scrollHeight;
    }
}

function addSystemMessage(text) {
    chatHistory.push({ role: 'system', text });
    renderMessages();
}

function clearChat() {
    chatHistory = [];
    addSystemMessage(t('chat-welcome'));
}

// --- Draggable Chat Panel ---
function initDraggable() {
    const panel = document.getElementById('chatPanel');
    const handle = document.getElementById('chatDragHandle');
    if (!panel || !handle) return;

    let isDragging = false;
    let startX, startY, startLeft, startTop;

    handle.addEventListener('mousedown', (e) => {
        // Don't drag if clicking buttons
        if (e.target.closest('.chat-header-actions') || e.target.closest('button')) return;
        // Disable on mobile
        if (window.innerWidth <= 768) return;

        isDragging = true;
        panel.classList.add('dragging');

        const rect = panel.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;

        // Switch from right/bottom positioning to left/top
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';

        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newLeft = Math.max(0, Math.min(window.innerWidth - 200, startLeft + dx));
        const newTop = Math.max(0, Math.min(window.innerHeight - 100, startTop + dy));
        panel.style.left = newLeft + 'px';
        panel.style.top = newTop + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            panel.classList.remove('dragging');
        }
    });
}

// --- Mini Particle Sphere Animation ---
function initChatParticles() {
    const bubbleCanvas = document.getElementById('chatBubbleCanvas');
    const headerCanvas = document.getElementById('chatHeaderCanvas');
    if (!bubbleCanvas && !headerCanvas) return;

    function createMiniSphere(canvas, size) {
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';
        ctx.scale(dpr, dpr);

        const cx = size / 2;
        const cy = size / 2;
        const numParticles = 40;
        const particles = [];
        const radius = size * 0.32;

        // Detect theme
        function getAccentColor() {
            const theme = document.documentElement.getAttribute('data-theme');
            return theme === 'light'
                ? { r: 59, g: 93, b: 171 }   // Blue for light
                : { r: 232, g: 168, b: 73 };  // Amber for dark
        }

        for (let i = 0; i < numParticles; i++) {
            const phi = Math.acos(1 - 2 * (i + 0.5) / numParticles);
            const theta = Math.PI * (1 + Math.sqrt(5)) * i;
            particles.push({
                phi, theta, r: radius,
                size: 0.6 + Math.random() * 0.8,
                alpha: 0.4 + Math.random() * 0.6,
                pulse: Math.random() * Math.PI * 2
            });
        }

        let rotY = 0;
        function animate(now) {
            rotY += 0.008;
            ctx.clearRect(0, 0, size, size);

            const accent = getAccentColor();
            const cosRY = Math.cos(rotY);
            const sinRY = Math.sin(rotY);
            const cosRX = Math.cos(0.4);
            const sinRX = Math.sin(0.4);
            const projected = [];

            for (const p of particles) {
                let x = p.r * Math.sin(p.phi) * Math.cos(p.theta);
                let y = p.r * Math.cos(p.phi);
                let z = p.r * Math.sin(p.phi) * Math.sin(p.theta);
                const x2 = x * cosRY - z * sinRY;
                const z2 = x * sinRY + z * cosRY;
                const y2 = y * cosRX - z2 * sinRX;
                const z3 = y * sinRX + z2 * cosRX;
                const scale = 60 / (60 + z3);
                const pulse = Math.sin(now * 0.003 + p.pulse) * 0.3 + 0.7;
                projected.push({
                    x: cx + x2 * scale, y: cy + y2 * scale, z: z3,
                    size: p.size * scale * (0.7 + pulse * 0.3),
                    alpha: p.alpha * scale * pulse
                });
            }

            projected.sort((a, b) => a.z - b.z);

            // Connections
            ctx.lineWidth = 0.3;
            for (let i = 0; i < projected.length; i++) {
                for (let j = i + 1; j < projected.length; j++) {
                    const a = projected[i], b = projected[j];
                    const dx = a.x - b.x, dy = a.y - b.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < size * 0.25) {
                        const la = (1 - dist / (size * 0.25)) * 0.12;
                        ctx.strokeStyle = `rgba(${accent.r}, ${accent.g}, ${accent.b}, ${la})`;
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.stroke();
                    }
                }
            }

            // Particles
            for (const p of projected) {
                const depth = (p.z + radius) / (radius * 2);
                const r = Math.round(accent.r - depth * 20);
                const g = Math.round(accent.g - depth * 30);
                const b = Math.round(accent.b + depth * 20);

                // Glow
                const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
                grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${p.alpha * 0.5})`);
                grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
                ctx.fill();

                // Core
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.alpha})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }

            requestAnimationFrame(animate);
        }
        requestAnimationFrame(animate);
    }

    if (bubbleCanvas) createMiniSphere(bubbleCanvas, 60);
    if (headerCanvas) createMiniSphere(headerCanvas, 28);
}
