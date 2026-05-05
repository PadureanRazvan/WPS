// js/users.js
import { db } from './firebase-config.js';
import { collection, onSnapshot, Timestamp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore.js";
import { addAgent, updateAgent, deleteAgent } from './planner.js';
import { showTemporaryMessage, t } from './ui.js';
import { logActivity } from './logs.js';
import {
    buildContractChangeCommand,
    buildCreateAgentCommand,
    buildDeactivateAgentCommand,
    buildInlineUserEditCommand,
    buildPrimaryTeamChangeCommand,
    buildReactivateAgentCommand,
    getComparableUserInlineFieldState,
    getUserCommandDateKey
} from './users-command.js';

let usersData = [];

const PRIMARY_TEAM_OPTIONS = [
    'RO zooplus',
    'HU zooplus',
    'IT zooplus',
    'NL zooplus',
    'CS zooplus',
    'SK zooplus',
    'SV-SE zooplus',
    '2L 2nd Level',
    'QA Quality Assurance',
    'TL Team Lead'
];

function getPrimaryTeamOptions(selectedValue = '') {
    const normalizedSelectedValue = String(selectedValue || '').trim();
    const options = [...PRIMARY_TEAM_OPTIONS];

    if (normalizedSelectedValue && !options.includes(normalizedSelectedValue)) {
        options.push(normalizedSelectedValue);
    }

    return options;
}

function buildPrimaryTeamOptionsMarkup(selectedValue = '') {
    return getPrimaryTeamOptions(selectedValue)
        .map(team => `<option value="${team}" ${team === selectedValue ? 'selected' : ''}>${team}</option>`)
        .join('');
}

function syncPrimaryTeamSelectOptions(selectElement, selectedValue = '') {
    if (!selectElement) return;

    const nextValue = String(selectedValue || selectElement.value || '').trim();
    selectElement.innerHTML = buildPrimaryTeamOptionsMarkup(nextValue);

    if (nextValue) {
        selectElement.value = nextValue;
    }
}

export function getUsersData() { return usersData; }
let unsubscribeFromUsers;

export function initializeUsers() {
    console.log("Setting up real-time listener for users...");
    const usersCollection = collection(db, 'agents');

    // Set up event delegation ONCE on tbody
    setupTableEventDelegation();

    unsubscribeFromUsers = onSnapshot(usersCollection, (querySnapshot) => {
        console.log(`%c[Firestore] Received users update. Found ${querySnapshot.size} users.`, 'color: #4caf50; font-weight: bold;');
        usersData = [];
        querySnapshot.forEach((doc) => {
            const userData = doc.data();
            // Convert Timestamp to Date
            if (userData.hireDate && userData.hireDate.toDate) {
                userData.hireDate = userData.hireDate.toDate();
            }
            usersData.push({ id: doc.id, ...userData });
        });
        // Sort by fullName
        usersData.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
        renderUsersTable();
    }, (error) => {
        console.error("❌ Firebase onSnapshot Error (Users): ", error);
        showTemporaryMessage(t('error-loading-users'), "error");
    });

    setupNewUserForm();
}

function setupTableEventDelegation() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    tbody.addEventListener('blur', handleInlineEdit, true);
    tbody.addEventListener('change', handleInlineEdit, true);
    tbody.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const id = e.target.dataset.id;
            const userName = usersData.find(u => u.id === id)?.fullName || t('unknown-agent');
            const confirmMessage = `${t('confirm-delete-user').replace('{name}', userName)}\n\n${t('confirm-delete-user-impact')}`;
            if (confirm(confirmMessage)) {
                deleteAgent(id);
            }
        }
        if (e.target.classList.contains('btn-status')) {
            const id = e.target.dataset.id;
            openDeactivateModal(id);
        }
    });
}

export function cleanupUsers() {
    if (unsubscribeFromUsers) {
        console.log("Detaching Firestore users listener.");
        unsubscribeFromUsers();
    }
}

function setupNewUserForm() {
    const addBtn = document.getElementById('addNewUserBtn');
    const formContainer = document.getElementById('newUserFormContainer');
    const form = document.getElementById('newUserForm');
    const cancelBtn = document.getElementById('cancelNewUserBtn');


    if (!addBtn || !formContainer || !form) {
        console.warn("New user form elements not found.");
        return;
    }

    const contractTypeSelect = document.getElementById('newAgentContractType');
    const contractHoursGroup = document.getElementById('newAgentContractHours').closest('.form-group');
    const primaryTeamSelect = document.getElementById('newAgentPrimaryTeam');

    syncPrimaryTeamSelectOptions(primaryTeamSelect);

    // Show/hide contract hours based on contract type
    function updateContractHoursVisibility() {
        if (contractTypeSelect.value === 'Full-time') {
            contractHoursGroup.style.display = 'none';
            document.getElementById('newAgentContractHours').value = '8';
        } else {
            contractHoursGroup.style.display = '';
        }
    }
    contractTypeSelect.addEventListener('change', updateContractHoursVisibility);
    updateContractHoursVisibility(); // Set initial state

    // Toggle form visibility
    addBtn.addEventListener('click', () => {
        formContainer.style.display = formContainer.style.display === 'none' ? 'block' : 'none';
        if (formContainer.style.display === 'block') {
            addBtn.style.display = 'none';
        }
    });

    cancelBtn.addEventListener('click', () => {
        formContainer.style.display = 'none';
        addBtn.style.display = 'inline-flex';
        form.reset();
        updateContractHoursVisibility();
    });

    // Handle form submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const createCommand = buildCreateAgentCommand({
            fullName: document.getElementById('newAgentFullName').value,
            username: document.getElementById('newAgentUsername').value,
            contractType: document.getElementById('newAgentContractType').value,
            contractHours: document.getElementById('newAgentContractHours').value,
            primaryTeam: document.getElementById('newAgentPrimaryTeam').value,
            hireDateStr: document.getElementById('newAgentHireDate').value
        }, { now: new Date() });

        if (!createCommand.ok) {
            showTemporaryMessage(t(createCommand.error), "error");
            return;
        }

        await addAgent(createCommand.payload);
        form.reset();
        updateContractHoursVisibility();
        formContainer.style.display = 'none';
        addBtn.style.display = 'inline-flex';
        showTemporaryMessage(t('user-created')
            .replace('{name}', createCommand.payload.fullName)
            .replace('{hours}', createCommand.contractHours)
            .replace('{team}', createCommand.teamCode), "success");
    });
}

export function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    usersData.forEach((user) => {
        const tr = document.createElement('tr');
        tr.dataset.id = user.id;
        const hireDateStr = user.hireDate ? user.hireDate.toISOString().split('T')[0] : '';
        const contractLabel = user.contractType || 'Full-time';
        const hoursLabel = user.contractHours || 8;
        tr.innerHTML = `
            <td contenteditable="true" data-field="fullName">${user.fullName || ''}</td>
            <td class="hide-mobile" contenteditable="true" data-field="username">${user.username || ''}</td>
            <td class="hide-mobile-sm"><input type="number" class="inline-input" min="4" max="8" value="${hoursLabel}" data-field="contractHours"></td>
            <td>
                <select class="inline-select" data-field="contractType">
                    <option value="Full-time" ${contractLabel === 'Full-time' ? 'selected' : ''}>${t('form-full-time')}</option>
                    <option value="Part-time" ${contractLabel === 'Part-time' ? 'selected' : ''}>${t('form-part-time')}</option>
                </select>
            </td>
            <td>
                <select class="inline-select" data-field="primaryTeam">
                    ${buildPrimaryTeamOptionsMarkup(user.primaryTeam || '')}
                </select>
            </td>
            <td class="hide-mobile"><input type="date" class="inline-input" value="${hireDateStr}" data-field="hireDate"></td>
            <td style="text-align: center;">
                <button class="btn-status ${user.isActive ? 'active' : 'inactive'}" data-field="isActive" data-id="${user.id}">
                    ${user.isActive ? t('active') : t('inactive')}
                </button>
            </td>
            <td><button class="btn-ghost delete-btn" data-id="${user.id}">${t('delete')}</button></td>
        `;

        tr.querySelectorAll('[data-field]').forEach((fieldElement) => {
            fieldElement.dataset.initialValue = getComparableUserInlineFieldState(user, fieldElement.dataset.field);
        });

        tbody.appendChild(tr);
    });

}

// Show contract change modal
function openContractChangeModal(userId, newContractType) {
    const modal = document.getElementById('contractChangeModal');
    const hoursGroup = document.getElementById('contractChangeHoursGroup');
    const dateInput = document.getElementById('contractChangeDate');
    const title = document.getElementById('contractChangeTitle');
    const saveBtn = document.getElementById('contractChangeSaveBtn');
    const cancelBtn = document.getElementById('contractChangeCancelBtn');
    const closeBtn = document.getElementById('contractChangeClose');

    const user = usersData.find(u => u.id === userId);
    if (!user) return;

    // Set title based on change type
    if (newContractType === 'Part-time') {
        title.textContent = `${user.fullName} — ${t('contract-change-to-pt')}`;
        hoursGroup.style.display = '';
    } else {
        title.textContent = `${user.fullName} — ${t('contract-change-to-ft')}`;
        hoursGroup.style.display = 'none';
    }

    // Default date to today
    const today = new Date();
    dateInput.value = today.toISOString().split('T')[0];

    modal.classList.add('active');

    // Cleanup previous listeners
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

    const closeModal = () => {
        modal.classList.remove('active');
        renderUsersTable(); // Re-render to reset the select if cancelled
    };

    newCancelBtn.addEventListener('click', closeModal);
    newCloseBtn.addEventListener('click', closeModal);

    newSaveBtn.addEventListener('click', async () => {
        const changeCommand = buildContractChangeCommand(user, {
            newContractType,
            contractHours: document.getElementById('contractChangeHours').value,
            fromDateStr: document.getElementById('contractChangeDate').value,
            now: new Date()
        });

        if (!changeCommand.ok) {
            showTemporaryMessage(t(changeCommand.error), "error");
            return;
        }

        await updateAgent(userId, changeCommand.updateData);
        logActivity('portal', 'change_contract', changeCommand.activity);

        modal.classList.remove('active');
        showTemporaryMessage(t('contract-updated')
            .replace('{name}', user.fullName)
            .replace('{type}', newContractType)
            .replace('{hours}', changeCommand.contractHours)
            .replace('{date}', `${changeCommand.fromDate.getDate()}.${changeCommand.fromDate.getMonth() + 1}.${changeCommand.fromDate.getFullYear()}`), "success");
    });
}

function openPrimaryTeamChangeModal(userId, newPrimaryTeam) {
    const modal = document.getElementById('teamChangeModal');
    const title = document.getElementById('teamChangeTitle');
    const summary = document.getElementById('teamChangeSummary');
    const dateInput = document.getElementById('teamChangeDate');
    const saveBtn = document.getElementById('teamChangeSaveBtn');
    const cancelBtn = document.getElementById('teamChangeCancelBtn');
    const closeBtn = document.getElementById('teamChangeClose');
    const user = usersData.find(u => u.id === userId);

    if (!modal || !title || !summary || !dateInput || !saveBtn || !cancelBtn || !closeBtn || !user) return;

    const oldTeam = user.primaryTeam || '';
    title.textContent = `${user.fullName} — ${t('team-change-title')}`;
    summary.textContent = `${oldTeam || '-'} → ${newPrimaryTeam}`;
    dateInput.value = getUserCommandDateKey(new Date());

    modal.classList.add('active');

    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

    const closeModal = () => {
        modal.classList.remove('active');
        renderUsersTable();
    };

    newCancelBtn.addEventListener('click', closeModal);
    newCloseBtn.addEventListener('click', closeModal);

    newSaveBtn.addEventListener('click', async () => {
        const teamCommand = buildPrimaryTeamChangeCommand(user, {
            newPrimaryTeam,
            fromDateStr: dateInput.value
        });

        if (!teamCommand.ok) {
            showTemporaryMessage(t(teamCommand.error), "error");
            return;
        }

        await updateAgent(userId, teamCommand.updateData);
        logActivity('portal', 'change_primary_team', teamCommand.activity);
        modal.classList.remove('active');
        showTemporaryMessage(t('team-updated')
            .replace('{name}', user.fullName)
            .replace('{team}', teamCommand.teamCode)
            .replace('{date}', dateInput.value), "success");
    });
}

// Litepicker instances for deactivation modal (cleaned up on each open)
let deactivatePickerFrom = null;
let deactivatePickerTo = null;

// Show deactivate/reactivate modal
function openDeactivateModal(userId) {
    const modal = document.getElementById('deactivateModal');
    const user = usersData.find(u => u.id === userId);
    if (!user || !modal) return;

    const title = document.getElementById('deactivateTitle');
    const dateFromInput = document.getElementById('deactivateDateFrom');
    const dateToInput = document.getElementById('deactivateDateTo');
    const noteInput = document.getElementById('deactivateNote');
    const saveBtn = document.getElementById('deactivateSaveBtn');
    const cancelBtn = document.getElementById('deactivateCancelBtn');
    const closeBtn = document.getElementById('deactivateClose');
    const datesDiv = modal.querySelector('.deactivate-dates');
    const hintDiv = modal.querySelector('.deactivate-hint');
    const noteGroup = noteInput?.closest('.form-group');

    // Destroy previous Litepicker instances
    if (deactivatePickerFrom) { deactivatePickerFrom.destroy(); deactivatePickerFrom = null; }
    if (deactivatePickerTo) { deactivatePickerTo.destroy(); deactivatePickerTo = null; }

    // Reset inputs
    dateFromInput.value = '';
    dateToInput.value = '';
    if (noteInput) noteInput.value = '';

    // Clone buttons to remove old listeners
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

    const closeModal = () => {
        modal.classList.remove('active');
        if (deactivatePickerFrom) { deactivatePickerFrom.destroy(); deactivatePickerFrom = null; }
        if (deactivatePickerTo) { deactivatePickerTo.destroy(); deactivatePickerTo = null; }
    };
    newCancelBtn.addEventListener('click', closeModal);
    newCloseBtn.addEventListener('click', closeModal);

    // --- REACTIVATION PATH ---
    if (!user.isActive) {
        title.textContent = `${user.fullName} — ${t('reactivation-title')}`;
        // Hide date fields, hint, and notes for reactivation
        if (datesDiv) datesDiv.style.display = 'none';
        if (hintDiv) hintDiv.style.display = 'none';
        if (noteGroup) noteGroup.style.display = 'none';
        newSaveBtn.textContent = t('reactivate-btn');

        modal.classList.add('active');

        newSaveBtn.addEventListener('click', async () => {
            const reactivateCommand = buildReactivateAgentCommand(user, { now: new Date() });
            await updateAgent(userId, reactivateCommand.updateData);
            logActivity('portal', 'reactivate_agent', reactivateCommand.activity);
            closeModal();
            showTemporaryMessage(t('agent-reactivated').replace('{name}', user.fullName), "success");
        });
        return;
    }

    // --- DEACTIVATION PATH ---
    title.textContent = `${user.fullName} — ${t('deactivation-title')}`;
    if (datesDiv) datesDiv.style.display = '';
    if (hintDiv) hintDiv.style.display = '';
    if (noteGroup) noteGroup.style.display = '';
    newSaveBtn.textContent = t('deactivate-apply');

    modal.classList.add('active');

    // Initialize Litepicker for start date
    const today = new Date();
    deactivatePickerFrom = new Litepicker({
        element: dateFromInput,
        singleMode: true,
        lang: 'ro-RO',
        startDate: today,
        format: 'DD MMM YYYY',
        dropdowns: { minYear: 2024, maxYear: 2030, months: true, years: true },
        setup: (picker) => {
            picker.on('selected', (date) => {
                // Store the actual date on the input for retrieval
                dateFromInput._selectedDate = date.dateInstance;
            });
        }
    });
    dateFromInput._selectedDate = today;

    // Initialize Litepicker for end date (optional)
    deactivatePickerTo = new Litepicker({
        element: dateToInput,
        singleMode: true,
        lang: 'ro-RO',
        format: 'DD MMM YYYY',
        dropdowns: { minYear: 2024, maxYear: 2030, months: true, years: true },
        resetButton: true,
        setup: (picker) => {
            picker.on('selected', (date) => {
                dateToInput._selectedDate = date.dateInstance;
            });
            picker.on('clear:selection', () => {
                dateToInput._selectedDate = null;
                dateToInput.value = '';
            });
        }
    });
    dateToInput._selectedDate = null;

    // Save handler
    newSaveBtn.addEventListener('click', async () => {
        const deactivateCommand = buildDeactivateAgentCommand(user, {
            startDate: dateFromInput._selectedDate,
            endDate: dateToInput._selectedDate || null,
            noteText: noteInput ? noteInput.value : '',
            now: new Date(),
            timestampFromDate: Timestamp.fromDate
        });

        if (!deactivateCommand.ok) {
            showTemporaryMessage(t(deactivateCommand.error), "error");
            return;
        }

        await updateAgent(userId, deactivateCommand.updateData);

        logActivity('portal', 'deactivate_agent', deactivateCommand.activity);
        closeModal();
        showTemporaryMessage(t('agent-deactivated')
            .replace('{name}', user.fullName)
            .replace('{from}', deactivateCommand.labels.from)
            .replace('{to}', deactivateCommand.labels.to), "success");
    });
}

async function handleInlineEdit(e) {
    const target = e.target;
    if (!target.dataset.field) return;

    const tr = target.closest('tr');
    const id = tr.dataset.id;
    const field = target.dataset.field;
    const user = usersData.find(u => u.id === id);

    if (!user) return;

    // Determine value based on input type
    let value;
    if (target.isContentEditable) {
        value = target.textContent.trim();
    } else {
        value = target.value;
    }

    const inlineCommand = buildInlineUserEditCommand(user, {
        field,
        rawValue: value,
        eventType: e.type,
        initialValue: target.dataset.initialValue,
        timestampFromDate: Timestamp.fromDate
    });

    if (!inlineCommand.ok) {
        showTemporaryMessage(t(inlineCommand.error), "error");
        if (inlineCommand.rerender) renderUsersTable();
        return;
    }

    if (inlineCommand.action === 'open-contract-modal') {
        openContractChangeModal(id, inlineCommand.value);
        return;
    }

    if (inlineCommand.action === 'open-primary-team-modal') {
        openPrimaryTeamChangeModal(id, inlineCommand.value);
        return;
    }

    if (inlineCommand.action === 'noop') {
        if (inlineCommand.initialValue) target.dataset.initialValue = inlineCommand.initialValue;
        return;
    }

    await updateAgent(id, inlineCommand.updatePayload);
    target.dataset.initialValue = inlineCommand.nextState;
    logActivity('portal', 'edit_user', inlineCommand.logDetails);
    showTemporaryMessage(t('user-updated'), "success", 1000);
} 
