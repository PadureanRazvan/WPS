// js/chat.js — Sherpa AI Chat Module
import { getPlannerData, updateAgent, addAgent, deleteAgent } from './planner.js';
import { getUsersData } from './users.js';
import { getAverageProductivity } from './productivity.js';
import { showSection } from './ui.js';
import { showTemporaryMessage } from './ui.js';
import { translations } from './config.js';
import { db } from './firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore.js";

function getLang() { return localStorage.getItem('language') || 'ro'; }
function t(key) { const l = getLang(); return (translations[l] && translations[l][key]) || key; }

// --- State ---
let chatHistory = [];
let apiKey = '';
let isOpen = false;
let isLoading = false;
let lastSendTime = 0;

// --- Load API key from Firestore ---
async function loadApiKey() {
    try {
        const snap = await getDoc(doc(db, 'config', 'gemini'));
        if (snap.exists() && snap.data().apiKey) {
            apiKey = snap.data().apiKey;
            return true;
        }
    } catch (err) {
        console.warn('[Chat] Could not load API key from Firestore:', err);
    }
    return false;
}

async function saveApiKeyToFirestore(key) {
    try {
        await setDoc(doc(db, 'config', 'gemini'), { apiKey: key });
    } catch (err) {
        console.warn('[Chat] Could not save API key to Firestore:', err);
    }
}

// --- Initialization ---
export async function initializeChat() {
    const bubble = document.getElementById('chatBubble');
    const panel = document.getElementById('chatPanel');
    const closeBtn = document.getElementById('chatCloseBtn');
    const sendBtn = document.getElementById('chatSendBtn');
    const input = document.getElementById('chatInput');
    const clearBtn = document.getElementById('chatClearBtn');
    const settingsBtn = document.getElementById('chatSettingsBtn');
    const apiKeySaveBtn = document.getElementById('chatApiKeySaveBtn');

    if (!bubble || !panel) return;

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
    settingsBtn?.addEventListener('click', showApiKeyPrompt);
    apiKeySaveBtn?.addEventListener('click', saveApiKey);

    // Load API key from Firestore
    const loaded = await loadApiKey();
    if (loaded) {
        chatHistory = [];
        addSystemMessage(t('chat-welcome'));
        // Hide the settings button since key is managed centrally
        if (settingsBtn) settingsBtn.style.display = 'none';
    } else {
        showApiKeyPrompt();
    }
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
    if (panel) panel.classList.toggle('open', isOpen);
    if (bubble) bubble.classList.toggle('hidden', isOpen);
    if (isOpen) {
        setTimeout(() => document.getElementById('chatInput')?.focus(), 300);
    }
}

// --- API Key Management ---
function showApiKeyPrompt() {
    const prompt = document.getElementById('chatApiKeyPrompt');
    if (prompt) prompt.style.display = 'flex';
}

async function saveApiKey() {
    const input = document.getElementById('chatApiKeyInput');
    if (!input || !input.value.trim()) return;
    apiKey = input.value.trim();
    await saveApiKeyToFirestore(apiKey);
    const prompt = document.getElementById('chatApiKeyPrompt');
    if (prompt) prompt.style.display = 'none';
    input.value = '';
    clearChat();
    addSystemMessage(t('chat-welcome'));
}

// --- Build System Prompt ---
function buildSystemPrompt() {
    const lang = getLang();
    const langNames = { ro: 'Romanian', en: 'English', it: 'Italian' };
    const now = new Date();
    const dayNum = now.getDate();

    // Gather agent data
    const agents = getPlannerData() || [];
    const activeAgents = agents.filter(a => a.isActive !== false);
    let agentSummary = '';
    activeAgents.forEach(a => {
        const todayVal = a.days?.[dayNum - 1] || 'empty';
        agentSummary += `- ${a.fullName} | team: ${a.primaryTeam || '?'} | ${a.contractType || 'Full-time'} ${a.contractHours || 8}h | today(day ${dayNum}): ${todayVal}\n`;
    });

    // Productivity
    const { average, days } = getAverageProductivity();
    const prodSummary = average !== null
        ? `Average productivity: ${average.toFixed(2)} items/hour over last ${days} days.`
        : 'No productivity data loaded.';

    return `You are Sherpa AI, an intelligent assistant for a workforce planning application called "Sherpa".
Current date: ${now.toISOString().split('T')[0]} (day ${dayNum} of the month).
Respond in: ${langNames[lang] || 'Romanian'}.

== AGENTS (${activeAgents.length} active out of ${agents.length} total) ==
${agentSummary || 'No agents loaded.'}

== PRODUCTIVITY ==
${prodSummary}

== AVAILABLE ACTIONS ==
When the user asks you to perform an action, include hidden command tags in your response.
These will be automatically parsed and executed. The user will NOT see them.

Commands (each on its own line):

[[ACTION:SET_CELL|agentFullName|dayNumber|value]]
Sets a planner cell for the given agent and day (1-31).
Values: "8RO" (8h Romania), "4IT+4HU" (split), "Co" (holiday), "CM" (sick), "LB" (day off), "" (clear)

[[ACTION:ADD_AGENT|fullName|username|primaryTeam|contractType|contractHours]]
Creates a new agent. contractType: "Full-time" or "Part-time". primaryTeam example: "RO zooplus"

[[ACTION:DELETE_AGENT|agentFullName]]
Deletes an agent. ALWAYS ask for confirmation before using this.

[[ACTION:NAVIGATE|sectionId]]
Navigate to a page. sectionId: dashboard, users, planner, productivity, upload, reports, info

== RULES ==
1. For multiple days, emit one SET_CELL per day.
2. ALWAYS ask for confirmation before DELETE_AGENT.
3. Keep responses concise and helpful.
4. If the user asks a data question, compute the answer from the agent list above.
5. Place all [[ACTION:...]] tags at the END of your response, each on its own line.
6. Day numbers are 1-31 for the CURRENT month.`;
}

// --- Send Message ---
async function sendMessage() {
    const input = document.getElementById('chatInput');
    if (!input || !input.value.trim() || isLoading) return;

    // Rate limit (2s cooldown)
    if (Date.now() - lastSendTime < 2000) return;
    lastSendTime = Date.now();

    if (!apiKey) {
        showApiKeyPrompt();
        return;
    }

    const userText = input.value.trim();
    input.value = '';

    // Add user message
    chatHistory.push({ role: 'user', text: userText });
    renderMessages();

    // Show typing
    isLoading = true;
    showTyping(true);

    try {
        const systemPrompt = buildSystemPrompt();
        const responseText = await callGeminiAPI(systemPrompt, chatHistory);

        // Parse actions
        const { cleanText, actions } = parseActions(responseText);

        // Execute actions
        const actionResults = [];
        for (const action of actions) {
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
        let errMsg = t('chat-error');
        if (err.message?.includes('401') || err.message?.includes('403')) {
            errMsg = t('chat-invalid-key');
        } else if (err.message?.includes('429')) {
            errMsg = t('chat-rate-limit');
        }
        chatHistory.push({ role: 'error', text: errMsg });
    } finally {
        isLoading = false;
        showTyping(false);
        renderMessages();
    }
}

// --- Gemini API Call (with retry on 429) ---
const GEMINI_MODELS = ['gemini-3.1-flash-lite-preview', 'gemini-3-flash-preview'];

async function callGeminiAPI(systemPrompt, messages, retryCount = 0) {
    const contents = messages
        .filter(m => m.role === 'user' || m.role === 'model')
        .map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }]
        }));

    const model = GEMINI_MODELS[Math.min(retryCount, GEMINI_MODELS.length - 1)];

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 2048
                }
            })
        }
    );

    if (response.status === 429 && retryCount < 3) {
        // Exponential backoff: 3s, 6s, 12s — then try fallback model
        const delay = 3000 * Math.pow(2, retryCount);
        await new Promise(r => setTimeout(r, delay));
        return callGeminiAPI(systemPrompt, messages, retryCount + 1);
    }

    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini');
    return text;
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

async function executeAction(command, params) {
    try {
        switch (command) {
            case 'SET_CELL': {
                const [agentName, dayStr, value] = params;
                const agent = findAgent(agentName);
                if (!agent) return `Agent "${agentName}" not found`;
                const dayIndex = parseInt(dayStr, 10) - 1;
                if (dayIndex < 0 || dayIndex > 30) return `Invalid day: ${dayStr}`;
                const newDays = [...(agent.days || Array(31).fill(''))];
                newDays[dayIndex] = value || '';
                await updateAgent(agent.id, { days: newDays });
                return `${agent.fullName}: day ${dayStr} → ${value || 'cleared'}`;
            }

            case 'ADD_AGENT': {
                const [fullName, username, primaryTeam, contractType, contractHours] = params;
                await addAgent({
                    fullName,
                    username: username || fullName.toLowerCase().replace(/\s+/g, '.'),
                    primaryTeam: primaryTeam || 'RO zooplus',
                    contractType: contractType || 'Full-time',
                    contractHours: parseInt(contractHours, 10) || 8,
                    teams: [(primaryTeam || 'RO zooplus').split(' ')[0]],
                    hireDate: new Date(),
                    isActive: true,
                    days: Array(31).fill('')
                });
                return `Agent "${fullName}" created`;
            }

            case 'DELETE_AGENT': {
                const [agentName] = params;
                const agent = findAgent(agentName);
                if (!agent) return `Agent "${agentName}" not found`;
                await deleteAgent(agent.id);
                return `Agent "${agent.fullName}" deleted`;
            }

            case 'NAVIGATE': {
                const [sectionId] = params;
                showSection(sectionId);
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
        // Simple markdown: **bold**
        let html = escapeHtml(msg.text)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/✓ (.+)/g, '<span class="chat-action-badge">✓ $1</span>');
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
