// Event-driven progress for operations the chat actually performs. No model
// reasoning, tool arguments, returned workspace data or simulated steps appear here.
const LABELS = Object.freeze({
    en: {
        activity: 'Activity', request: 'Sending your request', working: 'Waiting for Sherpa',
        tool: 'Checking loaded workspace data', review: 'Checking proposed changes',
        apply: 'Saving approved changes', done: 'Response ready', saved: 'Changes saved',
        ready: 'Changes ready to review', error: 'Could not complete this request',
        unavailable: 'Could not read this data', stopped: 'Stopped waiting for the response',
        note: 'Checks use the data currently loaded in this workspace.',
        get_agent_list: 'Checking team members', get_agent_schedule: 'Checking an agent’s schedule',
        get_today_status: 'Checking today’s schedule', get_day_status: 'Checking the selected day',
        get_team_summary: 'Checking team totals', get_productivity: 'Checking productivity',
        get_week_overview: 'Checking the week’s schedule'
    },
    ro: {
        activity: 'Activitate', request: 'Trimit cererea', working: 'Aștept răspunsul Sherpa',
        tool: 'Verific datele încărcate', review: 'Verific modificările propuse',
        apply: 'Salvez modificările aprobate', done: 'Răspuns pregătit', saved: 'Modificări salvate',
        ready: 'Modificări pregătite pentru verificare', error: 'Cererea nu a putut fi finalizată',
        unavailable: 'Datele nu au putut fi citite', stopped: 'Am oprit așteptarea răspunsului',
        note: 'Verificările folosesc datele încărcate în acest spațiu de lucru.',
        get_agent_list: 'Verific membrii echipei', get_agent_schedule: 'Verific programul agentului',
        get_today_status: 'Verific programul de azi', get_day_status: 'Verific ziua selectată',
        get_team_summary: 'Verific totalurile echipei', get_productivity: 'Verific productivitatea',
        get_week_overview: 'Verific programul săptămânii'
    },
    it: {
        activity: 'Attività', request: 'Invio della richiesta', working: 'In attesa di Sherpa',
        tool: 'Verifica dei dati caricati', review: 'Verifica delle modifiche proposte',
        apply: 'Salvataggio delle modifiche approvate', done: 'Risposta pronta', saved: 'Modifiche salvate',
        ready: 'Modifiche pronte per la verifica', error: 'Impossibile completare la richiesta',
        unavailable: 'Impossibile leggere questi dati', stopped: 'Attesa della risposta interrotta',
        note: 'Le verifiche usano i dati attualmente caricati in questo spazio di lavoro.',
        get_agent_list: 'Verifica dei membri del team', get_agent_schedule: 'Verifica dell’orario dell’agente',
        get_today_status: 'Verifica dell’orario di oggi', get_day_status: 'Verifica del giorno selezionato',
        get_team_summary: 'Verifica dei totali del team', get_productivity: 'Verifica della produttività',
        get_week_overview: 'Verifica dell’orario settimanale'
    }
});
const STEP_KINDS = new Set(['request', 'working', 'tool', 'review', 'apply']);
const TOOL_NAMES = new Set(['get_agent_list', 'get_agent_schedule', 'get_today_status',
    'get_day_status', 'get_team_summary', 'get_productivity', 'get_week_overview']);
const MAX_STEPS = 12;

/**
 * A compact, accessible disclosure for the current request. Call begin before
 * actual work, step at observed boundaries, and finish only after its result.
 * clear invalidates updates until the next begin (for Clear/logout).
 */
export function createChatActivity({ element, getLanguage = () => 'en' }) {
    if (!element) return { begin() {}, step() {}, finish() {}, clear() {} };
    const document = element.ownerDocument;
    const make = (tag, className) => {
        const node = document.createElement(tag);
        node.className = className;
        return node;
    };
    const details = make('details', 'chat-activity-details');
    const summary = make('summary', 'chat-activity-summary');
    const indicator = make('span', 'chat-activity-indicator');
    indicator.setAttribute('aria-hidden', 'true');
    const label = make('span', 'chat-activity-label');
    label.setAttribute('aria-live', 'polite');
    label.setAttribute('aria-atomic', 'true');
    const chevron = make('span', 'chat-activity-chevron');
    chevron.textContent = '⌄';
    chevron.setAttribute('aria-hidden', 'true');
    const list = make('ol', 'chat-activity-list');
    const note = make('p', 'chat-activity-note');
    summary.append(indicator, label, chevron);
    details.append(summary, list, note);
    element.replaceChildren(details);
    let entries = [];
    let active = false;
    let operation = 'request';

    function labels() {
        const language = String(getLanguage() || '').toLowerCase().split('-')[0];
        return Object.hasOwn(LABELS, language) ? LABELS[language] : LABELS.en;
    }

    function render() {
        const text = labels();
        label.textContent = text[entries.at(-1)?.key] || '';
        list.setAttribute('aria-label', text.activity);
        note.textContent = text.note;
        const rows = entries.map(entry => {
            const item = make('li', 'chat-activity-step');
            item.dataset.state = entry.state;
            item.textContent = text[entry.key];
            return item;
        });
        list.replaceChildren(...rows);
    }

    function append(key, state = 'current') {
        if (entries.at(-1)?.key === key && entries.at(-1)?.state === state) return;
        if (entries.at(-1)?.state === 'current') entries.at(-1).state = 'complete';
        entries.push({ key, state });
        if (entries.length > MAX_STEPS) entries.shift();
        render();
    }

    function clear() {
        active = false;
        entries = [];
        element.hidden = true;
        element.dataset.state = 'idle';
        label.textContent = '';
        list.replaceChildren();
    }

    function begin(kind = 'request') {
        entries = [];
        operation = kind === 'apply' ? 'apply' : 'request';
        active = true;
        element.hidden = false;
        element.dataset.state = 'working';
        append(operation);
    }

    function step(kind, toolName) {
        if (!active) return;
        if (kind === 'done' || kind === 'error' || kind === 'stopped') { finish(kind); return; }
        if (kind === 'tool-error') {
            if (entries.at(-1)?.state === 'current') entries.at(-1).state = 'warning';
            append('unavailable', 'warning');
            return;
        }
        if (!STEP_KINDS.has(kind)) return;
        const key = kind === 'tool' && TOOL_NAMES.has(toolName) ? toolName : kind;
        append(key);
    }

    function finish(outcome = 'done') {
        if (!active || !['done', 'review', 'error', 'stopped'].includes(outcome)) return;
        active = false;
        element.dataset.state = outcome;
        if (outcome === 'error' && entries.at(-1)?.state === 'current') entries.at(-1).state = 'error';
        if (outcome === 'stopped' && entries.at(-1)?.state === 'current') entries.at(-1).state = 'stopped';
        const key = outcome === 'review' ? 'ready' : ['error', 'stopped'].includes(outcome) ? outcome
            : operation === 'apply' ? 'saved' : 'done';
        append(key, ['error', 'stopped'].includes(outcome) ? outcome : 'complete');
    }

    clear();
    return { begin, step, finish, clear };
}
