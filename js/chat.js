// js/chat.js — Sherpa AI Chat Module
import { getPlannerData, commitAgentChanges } from './planner.js';
import { buildChatActionPlan, findAgentById, getChatCalendarDate } from './chat-actions.js';
import { getAverageProductivity, getProductivityTrendData } from './productivity.js?v=2026.10.23';
import { showSection } from './ui.js?v=2026.10.23';
import { translations, extractHoursFromDay, getMonthKey, getEffectiveAgentDayValue, isNonWorkingCode, normalizeTeamForDisplay, parseShiftEntry } from './config.js';
import { auth, db, functions } from './firebase-config.js';
import { doc, onSnapshot, setDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { logActivity } from './logs.js?v=2026.10.23';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js";
import { createSherpaChatService, getChatErrorTranslationKey } from './chat-service.js';
import { createSherpaBoss } from './sherpa-boss.js';
import { createBossStudio } from './sherpa-boss-studio.js';
import { createBossPreferences } from './sherpa-boss-preferences.js';
import { createChatWindow } from './chat-window.js';
import { createChatActivity } from './chat-activity.js';

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
let bossController = null;
let bossStudio = null;
let bossPreferences = null;
let avatarSpeaking = false;
let avatarThinking = false;
let chatWindow = null;
let chatActivity = null;
let isCommitting = false;
let followLatest = true;
let renderedMessages = 0;
const chatService = createSherpaChatService(httpsCallable(functions, 'generateSherpaChat', { timeout: 330_000 }));

// --- Initialization ---
export async function initializeChat() {
    const bubble = document.getElementById('chatBubble');
    const panel = document.getElementById('chatPanel');
    const closeBtn = document.getElementById('chatCloseBtn');
    const sendBtn = document.getElementById('chatSendBtn');
    const input = document.getElementById('chatInput');
    const clearBtn = document.getElementById('chatClearBtn');

    if (!bubble || !panel) return;

    chatWindow ??= createChatWindow({ panel, handle: document.getElementById('chatDragHandle') });
    chatActivity ??= createChatActivity({ element: document.getElementById('chatActivity'), getLanguage: getLang });
    if (!chatBound) {
        bubble.addEventListener('contextmenu', event => {
            event.preventDefault();
            bossStudio?.open();
        });
        document.getElementById('bossStudioBtn')?.addEventListener('click', () => bossStudio?.open());
        bubble.addEventListener('keydown', event => {
            if (event.key.toLowerCase() === 'm' && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault();
                bossStudio?.open();
            }
        });
        closeBtn?.addEventListener('click', toggleChat);
        sendBtn?.addEventListener('click', () => sendMessage());
        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                sendMessage();
            }
        });
        input?.addEventListener('input', updateComposer);
        document.getElementById('chatResetBtn')?.addEventListener('click', () => chatWindow?.reset());
        document.getElementById('chatStopBtn')?.addEventListener('click', stopChatRequest);
        document.getElementById('chatJumpBtn')?.addEventListener('click', scrollToLatest);
        document.getElementById('chatMessages')?.addEventListener('scroll', () => {
            const messages = document.getElementById('chatMessages');
            followLatest = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 40;
            if (followLatest) document.getElementById('chatJumpBtn').hidden = true;
        }, { passive: true });
        document.getElementById('chatSuggestions')?.addEventListener('click', event => {
            const suggestion = event.target.closest('button[data-chat-prompt]');
            if (!suggestion || isLoading || !input) return;
            input.value = t(suggestion.dataset.chatPrompt);
            updateComposer();
            input.focus();
        });
        panel.addEventListener('keydown', event => {
            if (event.key === 'Escape' && isOpen && !event.isComposing) {
                event.preventDefault();
                toggleChat();
            }
        });
        clearBtn?.addEventListener('click', clearChat);
        chatBound = true;
    }
    clearChat();
    bossController ??= createSherpaBoss({ element: bubble, onActivate: toggleChat, ragdollEnabled: false,
        minimizeButton: document.getElementById('bossMinimize'), dockButton: document.getElementById('bossDock') });
    bossStudio ??= createBossStudio({ companion: bossController, canShowCompanion: () => !isOpen,
        onRagdollChange: enabled => bossPreferences?.setEnabled(enabled),
        onPreferenceRetry: () => bossPreferences?.retry() });
    const uid = auth.currentUser?.uid;
    if (bossPreferences?.uid !== uid) { bossPreferences?.dispose(); bossPreferences = null; }
    if (uid && !bossPreferences) bossPreferences = createBossPreferences({
        uid, db, firestore: { doc, onSnapshot, setDoc }, isCurrent: () => auth.currentUser?.uid === uid,
        onChange(preference) {
            bossController?.setRagdollEnabled(preference.enabled);
            bossStudio?.setRagdollPreference(preference);
        }
    });
    bossController.setVisible(!isOpen);
    bubble.classList.remove('hidden');
    bubble.setAttribute('aria-expanded', String(isOpen));
}

export function cleanupChat() {
    chatSession++;
    chatWindow?.dispose(); chatWindow = null;
    chatActivity?.clear(); chatActivity = null;
    isCommitting = false;
    bossPreferences?.dispose(); bossPreferences = null;
    pendingActionPlan = null;
    isLoading = false;
    lastSendTime = 0;
    chatHistory = [];
    renderedMessages = 0;
    followLatest = true;
    isOpen = false;
    const panel = document.getElementById('chatPanel');
    if (panel) { panel.classList.remove('open'); panel.setAttribute('inert', ''); }
    document.getElementById('chatBubble')?.setAttribute('aria-expanded', 'false');
    bossStudio?.dispose();
    bossStudio = null;
    bossController?.dispose();
    bossController = null;
    stopAvatarSpeech();
    setAvatarThinking(false);
    renderMessages();
}

// --- Toggle Chat ---
function toggleChat() {
    updateComposer();
    isOpen = !isOpen;
    const panel = document.getElementById('chatPanel');
    const bubble = document.getElementById('chatBubble');
    if (panel) {
        panel.classList.toggle('open', isOpen);
        if (isOpen) { panel.removeAttribute('inert'); chatWindow?.open(); }
        else { panel.setAttribute('inert', ''); chatWindow?.close(); }
    }
    if (bubble) bubble.setAttribute('aria-expanded', String(isOpen));
    bossController?.setVisible(!isOpen);
    if (!isOpen) bubble?.focus();
    if (isOpen) {
        document.getElementById('chatInput')?.focus({ preventScroll: true });
    }
}

function getAvatarBaseSrc(image) {
    const currentSrc = image.getAttribute('src') || '';
    const baseSrc = image.dataset.restSrc || currentSrc.split('#')[0];
    image.dataset.restSrc = baseSrc;
    return baseSrc;
}

function setAvatarThinking(isThinking) {
    avatarThinking = isThinking;
    bossController?.setState(avatarSpeaking ? 'speaking' : avatarThinking ? 'thinking' : 'idle');
    document.querySelectorAll('.chat-avatar-frame').forEach(frame => {
        frame.classList.toggle('is-thinking', isThinking);
    });
}

function setAvatarSpeaking(isSpeaking) {
    avatarSpeaking = isSpeaking;
    bossController?.setState(avatarSpeaking ? 'speaking' : avatarThinking ? 'thinking' : 'idle');
    document.querySelectorAll('.chat-avatar-frame').forEach(frame => {
        frame.classList.toggle('is-speaking', isSpeaking);
    });

    document.querySelectorAll('.chat-avatar').forEach(image => {
        const baseSrc = getAvatarBaseSrc(image);
        const nextSrc = /\.svg(?:\?|$)/.test(baseSrc) && isSpeaking ? baseSrc + '#talking' : baseSrc;
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
    followLatest = true;
    chatHistory.push({ role: 'user', text: userText });
    renderMessages();
    isLoading = true;
    chatActivity?.begin('request');
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
        chatActivity?.finish(plan.requiresConfirmation ? 'review' : 'done');
    } catch (error) {
        if (session !== chatSession) return;
        console.error('[Chat]', error);
        chatActivity?.finish('error');
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
        const response = chatService.generate({ language: getLang(), contents });
        chatActivity?.step('working');
        const data = await response;
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
                chatActivity?.step('tool', fc.functionCall.name);
                const result = executeToolCall(fc.functionCall.name, fc.functionCall.args || {});
                if (result?.error) chatActivity?.step('tool-error', fc.functionCall.name);
                return {
                    functionResponse: {
                        name: fc.functionCall.name,
                        response: { result: JSON.stringify(result) }
                    }
                };
            });
            contents.push({ role: 'user', parts: responseParts });
            chatActivity?.step('working');
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
    isCommitting = true;
    chatActivity?.begin('apply');
    renderMessages();
    showTyping(true);
    try {
        if (plan.monthKey !== getMonthKey(getChatCalendarDate())) throw new Error('Proposal expired.');
        await commitAgentChanges(plan);
        if (session !== chatSession) return;
        plan.navigations.forEach(section => showSection(section));
        logActivity('ai', 'apply_changes', { cells: plan.actions.filter(action => action.command === 'SET_CELL').length, created: plan.creates.length, deleted: plan.deletes.length });
        chatHistory.push({ role: 'model', text: t('chat-changes-applied') });
        chatActivity?.finish('done');
    } catch (error) {
        if (session !== chatSession) return;
        console.error('[Chat] Write failed:', error);
        chatActivity?.finish('error');
        chatHistory.push({ role: 'error', text: t(error.code === 'data-conflict' ? 'write-conflict' : 'write-failed') });
    } finally {
        if (session === chatSession) {
            isLoading = false;
            isCommitting = false;
            showTyping(false);
            renderMessages();
        }
    }
}

function cancelChatActions(expectedPlan = pendingActionPlan) {
    if (!expectedPlan || expectedPlan !== pendingActionPlan) return;
    pendingActionPlan = null;
    chatActivity?.clear();
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

    const scrollTop = container.scrollTop;
    const hasNewMessages = chatHistory.length > renderedMessages;
    if (renderedMessages === 0) container.innerHTML = '';
    container.querySelector('.chat-action-confirmation')?.remove();
    chatHistory.slice(renderedMessages).forEach(msg => {
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
    renderedMessages = chatHistory.length;
    renderActionConfirmation(container);
    if (followLatest) scrollToLatest();
    else {
        container.scrollTop = scrollTop;
        const jump = document.getElementById('chatJumpBtn');
        if (jump && hasNewMessages) jump.hidden = false;
    }
    const suggestions = document.getElementById('chatSuggestions');
    if (suggestions) suggestions.hidden = chatHistory.some(msg => msg.role === 'user');
    updateComposer();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showTyping(show) {
    if (show) stopAvatarSpeech();
    setAvatarThinking(show);
    updateComposer();
}

function addSystemMessage(text) {
    chatHistory.push({ role: 'system', text });
    renderMessages();
}

function clearChat() {
    if (isCommitting) return;
    chatSession++;
    pendingActionPlan = null;
    isLoading = false;
    lastSendTime = 0;
    stopAvatarSpeech();
    setAvatarThinking(false);
    chatActivity?.clear();
    chatHistory = [];
    renderedMessages = 0;
    followLatest = true;
    addSystemMessage(t('chat-welcome'));
}

function scrollToLatest() {
    followLatest = true;
    const messages = document.getElementById('chatMessages');
    if (messages) messages.scrollTop = messages.scrollHeight;
    const jump = document.getElementById('chatJumpBtn');
    if (jump) jump.hidden = true;
}

function stopChatRequest() {
    if (!isLoading || isCommitting) return;
    // Firebase callable requests cannot be aborted. Ignore the pending response
    // and prevent any subsequent tool round or proposed action from this turn.
    chatSession++;
    isLoading = false;
    lastSendTime = 0;
    chatActivity?.finish('stopped');
    chatHistory.push({ role: 'system', text: t('chat-stopped') });
    showTyping(false);
    renderMessages();
}

function updateComposer() {
    const input = document.getElementById('chatInput');
    if (input) {
        input.style.height = 'auto';
        if (input.scrollHeight) input.style.height = Math.min(input.scrollHeight, 100) + 'px';
        input.placeholder = t('chat-placeholder');
        input.setAttribute('aria-label', t('chat-placeholder'));
    }
    const send = document.getElementById('chatSendBtn');
    if (send) { send.disabled = isLoading || !input?.value.trim(); send.hidden = isLoading && !isCommitting; }
    const stop = document.getElementById('chatStopBtn');
    if (stop) stop.hidden = !isLoading || isCommitting;
    const clear = document.getElementById('chatClearBtn');
    if (clear) clear.disabled = isCommitting;
    for (const [id, key] of Object.entries({ chatDragHandle: 'chat-move', chatResetBtn: 'chat-reset', chatClearBtn: 'chat-clear', chatCloseBtn: 'chat-close', chatSendBtn: 'chat-send', chatStopBtn: 'chat-stop' })) {
        const element = document.getElementById(id);
        if (element) { element.title = t(key); element.setAttribute('aria-label', t(key)); }
    }
}
