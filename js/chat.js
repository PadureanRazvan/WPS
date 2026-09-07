// js/chat.js — Sherpa AI Chat Module
import { getPlannerData, commitAgentChanges } from './planner.js';
import { buildChatActionPlan, findAgentById, getChatCalendarDate } from './chat-actions.js';
import { getAverageProductivity, getProductivityTrendData } from './productivity.js?v=2026.09.07';
import { showSection } from './ui.js?v=2026.09.07';
import { translations, extractHoursFromDay, getMonthKey, getEffectiveAgentDayValue, isNonWorkingCode, normalizeTeamForDisplay, parseShiftEntry } from './config.js';
import { functions } from './firebase-config.js';
import { logActivity } from './logs.js?v=2026.09.07';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js";
import { createSherpaChatService, getChatErrorTranslationKey } from './chat-service.js';

function getLang() { return localStorage.getItem('language') || 'ro'; }
function t(key) { const l = getLang(); return (translations[l] && translations[l][key]) || key; }

// --- State ---
let chatHistory = [];
let isOpen = false;
let isLoading = false;
let lastSendTime = 0;
let pendingActionPlan = null;
let chatSession = 0;
let chatBound = false;
let speechTimer = null;
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

    // Initialize panel dragging.
    if (!chatBound) {
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
        chatBound = true;
    }
    clearChat();
}

export function cleanupChat() {
    chatSession++;
    pendingActionPlan = null;
    isLoading = false;
    lastSendTime = 0;
    chatHistory = [];
    isOpen = false;
    const panel = document.getElementById('chatPanel');
    if (panel) panel.classList.remove('open');
    stopAvatarSpeech();
    setAvatarThinking(false);
    renderMessages();
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

function getAvatarBaseSrc(image) {
    const currentSrc = image.getAttribute('src') || '';
    const baseSrc = image.dataset.restSrc || currentSrc.split('#')[0];
    image.dataset.restSrc = baseSrc;
    return baseSrc;
}

function setAvatarThinking(isThinking) {
    document.querySelectorAll('.chat-avatar-frame').forEach(frame => {
        frame.classList.toggle('is-thinking', isThinking);
    });
}

function setAvatarSpeaking(isSpeaking) {
    document.querySelectorAll('.chat-avatar-frame').forEach(frame => {
        frame.classList.toggle('is-speaking', isSpeaking);
    });

    document.querySelectorAll('.chat-avatar').forEach(image => {
        const baseSrc = getAvatarBaseSrc(image);
        const nextSrc = isSpeaking ? baseSrc + '#talking' : baseSrc;
        if (image.getAttribute('src') !== nextSrc) image.setAttribute('src', nextSrc);
    });
}

function stopAvatarSpeech() {
    if (speechTimer) {
        window.clearTimeout(speechTimer);
        speechTimer = null;
    }
    setAvatarSpeaking(false);
}

function playAvatarSpeech(text) {
    stopAvatarSpeech();
    if (!text) return;

    setAvatarSpeaking(true);
    const duration = Math.min(5600, Math.max(1400, text.length * 24));
    speechTimer = window.setTimeout(() => {
        setAvatarSpeaking(false);
        speechTimer = null;
    }, duration);
}

// --- Send Message ---
async function sendMessage() {
    const input = document.getElementById('chatInput');
    if (!input || !input.value.trim() || isLoading) return;
    if (Date.now() - lastSendTime < 2000) return;
    lastSendTime = Date.now();
    const userText = input.value.trim();
    input.value = '';
    // Text never confirms a write. A new request cancels the previous proposal.
    if (pendingActionPlan) cancelChatActions(pendingActionPlan);
    const session = chatSession;
    chatHistory.push({ role: 'user', text: userText });
    renderMessages();
    isLoading = true;
    showTyping(true);
    try {
        const responseText = await callGeminiAPI(chatHistory);
        if (session !== chatSession) return;
        const { cleanText, actions } = parseActions(responseText);
        const plan = buildChatActionPlan(actions, getPlannerData() || []);
        if (plan.requiresConfirmation) pendingActionPlan = plan;
        else plan.navigations.forEach(section => showSection(section));
        chatHistory.push({ role: 'model', text: cleanText || t(plan.requiresConfirmation ? 'chat-review-changes' : 'chat-done') });
        playAvatarSpeech(cleanText);
    } catch (error) {
        if (session !== chatSession) return;
        console.error('[Chat]', error);
        chatHistory.push({ role: 'error', text: t(error.code === 'invalid-action' ? 'chat-invalid-actions' : getChatErrorTranslationKey(error)) });
    } finally {
        if (session === chatSession) {
            isLoading = false;
            showTyping(false);
            renderMessages();
        }
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

function buildDayStatus(agents, dayNum) {
    const schedule = { working: [], holiday: [], sick: [], dayOff: [], unplanned: [] };
    let totalHours = 0;
    const teamHours = {};
    const now = getChatCalendarDate();
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
    const now = getChatCalendarDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const validDay = day => Number.isInteger(day) && day >= 1 && day <= daysInMonth;
    if (name === 'get_day_status' && !validDay(args.day_number)) return { error: 'Invalid day.' };
    if (name === 'get_week_overview' && (!validDay(args.start_day) || !validDay(args.end_day) || args.start_day > args.end_day)) return { error: 'Invalid day range.' };

    switch (name) {
        case 'get_agent_list': {
            let filtered = agents;
            if (args.active_only !== false) filtered = filtered.filter(a => a.isActive !== false);
            if (args.team_filter) filtered = filtered.filter(a => (a.primaryTeam || '').startsWith(args.team_filter));
            return filtered.map(a => ({
                id: a.id,
                name: a.fullName,
                team: a.primaryTeam || '?',
                contract: `${a.contractType || 'Full-time'} ${a.contractHours || 8}h`,
                active: a.isActive !== false
            }));
        }
        case 'get_agent_schedule': {
            const agent = findAgentById(agents, args.agent_id);
            if (!agent) return { error: `Agent "${args.agent_id}" not found` };
            const schedMonthKey = getMonthKey(getChatCalendarDate());
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
            return buildDayStatus(agents, getChatCalendarDate().getDate());
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
    const session = chatSession;
    // Reserve room for all five tool rounds within the server's 25-message limit.
    const recentMessages = messages
        .filter(m => m.role === 'user' || m.role === 'model')
        .slice(-16);
    if (recentMessages[0]?.role === 'model') recentMessages.shift();

    const contents = recentMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
    }));

    // Function calling loop (max 5 rounds to allow multiple queries)
    for (let round = 0; round < 5; round++) {
        if (session !== chatSession) throw new Error('Chat cancelled.');
        const data = await chatService.generate({ language: getLang(), contents });
        if (session !== chatSession) throw new Error('Chat cancelled.');
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
        const text = candidate.parts.filter(part => typeof part.text === 'string').map(part => part.text).join('\n');
        if (!text) throw new Error('Empty text in response');
        return text;
    }

    throw new Error('Too many function call rounds');
}

// --- Parse Actions ---
function parseActions(responseText) {
    const actionRegex = /\[\[ACTION:(\w+)\|([^\]]*)\]\]/g;
    const actions = [];
    const cleanText = responseText.replace(actionRegex, (_tag, command, fields) => {
        actions.push({ command, params: fields.split('|').map(value => value.trim()) });
        return '';
    }).trim();
    // Never silently discard a malformed tag and offer only the other changes.
    if (/\[\[ACTION\b/i.test(cleanText)) {
        const error = new Error('Malformed proposed action.');
        error.code = 'invalid-action';
        throw error;
    }
    return { cleanText, actions };
}

// --- Confirmed Actions ---
async function approveChatActions(expectedPlan = pendingActionPlan) {
    if (!expectedPlan || pendingActionPlan !== expectedPlan || isLoading) return;
    const session = chatSession;
    const plan = pendingActionPlan;
    pendingActionPlan = null; // Consume before awaiting, so double clicks cannot repeat writes.
    isLoading = true;
    renderMessages();
    showTyping(true);
    try {
        if (plan.monthKey !== getMonthKey(getChatCalendarDate())) throw new Error('Proposal expired.');
        await commitAgentChanges(plan);
        if (session !== chatSession) return;
        plan.navigations.forEach(section => showSection(section));
        logActivity('ai', 'apply_changes', { cells: plan.actions.filter(action => action.command === 'SET_CELL').length, created: plan.creates.length, deleted: plan.deletes.length });
        chatHistory.push({ role: 'model', text: t('chat-changes-applied') });
    } catch (error) {
        if (session !== chatSession) return;
        console.error('[Chat] Write failed:', error);
        chatHistory.push({ role: 'error', text: t(error.code === 'data-conflict' ? 'write-conflict' : 'write-failed') });
    } finally {
        if (session === chatSession) {
            isLoading = false;
            showTyping(false);
            renderMessages();
        }
    }
}

function cancelChatActions(expectedPlan = pendingActionPlan) {
    if (!expectedPlan || expectedPlan !== pendingActionPlan) return;
    pendingActionPlan = null;
    chatHistory.push({ role: 'model', text: t('chat-changes-cancelled') });
    renderMessages();
}

function renderActionConfirmation(container) {
    const plan = pendingActionPlan;
    if (!plan) return;
    const card = document.createElement('div');
    card.className = 'chat-action-confirmation';
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', t('chat-review-changes'));
    const title = document.createElement('p');
    title.textContent = t('chat-review-changes');
    card.appendChild(title);
    const list = document.createElement('ul');
    plan.actions.forEach(action => {
        const item = document.createElement('li');
        const identity = action.agentName + (action.username ? ' (' + action.username + ')' : '');
        if (action.command === 'SET_CELL') {
            item.textContent = action.dateKey + ' — ' + identity + ' → ' + (action.value || t('chat-cleared'))
                + (action.exceedsContract ? ' — ' + t('chat-over-contract') : '');
        } else if (action.command === 'DELETE_AGENT') {
            item.textContent = t('chat-propose-delete') + ': ' + identity + ' — ' + action.primaryTeam;
        } else {
            item.textContent = t('chat-propose-add') + ': ' + identity + ' — ' + action.primaryTeam + ', ' + action.contractType + ', ' + action.hours + 'h, ' + action.dateKey;
        }
        list.appendChild(item);
    });
    card.appendChild(list);
    if (plan.deletes.length) {
        const warning = document.createElement('p');
        warning.textContent = t('chat-delete-warning');
        card.appendChild(warning);
    }
    const controls = document.createElement('div');
    controls.className = 'chat-confirmation-controls';
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'btn btn-primary';
    apply.textContent = t('chat-apply-changes');
    apply.addEventListener('click', () => approveChatActions(plan));
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary';
    cancel.textContent = t('chat-cancel-changes');
    cancel.addEventListener('click', () => cancelChatActions(plan));
    controls.appendChild(apply);
    controls.appendChild(cancel);
    card.appendChild(controls);
    container.appendChild(card);
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

    renderActionConfirmation(container);
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showTyping(show) {
    if (show) stopAvatarSpeech();
    setAvatarThinking(show);
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
    chatSession++;
    pendingActionPlan = null;
    isLoading = false;
    lastSendTime = 0;
    stopAvatarSpeech();
    setAvatarThinking(false);
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
