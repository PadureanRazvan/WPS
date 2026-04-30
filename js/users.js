// js/users.js
import { db } from './firebase-config.js';
import { collection, onSnapshot, Timestamp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore.js";
import { addAgent, updateAgent, deleteAgent } from './planner.js';
import { showTemporaryMessage, t } from './ui.js';
import { logActivity } from './logs.js';
import { getMonthKey, getAgentDaysForMonth, generateDefaultSchedule } from './config.js';

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

function normalizePlannerDate(value) {
    const date = value instanceof Date
        ? new Date(value)
        : value?.toDate
            ? value.toDate()
            : new Date(value);

    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

function getMonthStartFromKey(monthKey) {
    const [yearStr, monthStr] = String(monthKey || '').split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    if (!year || !month) return null;
    return new Date(year, month - 1, 1);
}

function isDateWithinInclusiveRange(date, startDate, endDate) {
    const normalizedDate = normalizePlannerDate(date);
    const normalizedStart = normalizePlannerDate(startDate);
    const normalizedEnd = endDate ? normalizePlannerDate(endDate) : null;

    if (!normalizedDate || !normalizedStart) return false;
    return normalizedDate >= normalizedStart && (!normalizedEnd || normalizedDate <= normalizedEnd);
}

function applyInactiveCodeToMonth(existingDays, monthDate, startDate, endDate) {
    const monthStart = normalizePlannerDate(monthDate);
    if (!monthStart) return [...existingDays];

    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const nextDays = [...existingDays];

    while (nextDays.length < 31) nextDays.push('');

    for (let i = 0; i < nextDays.length; i++) {
        const dayNumber = i + 1;
        if (dayNumber > daysInMonth) {
            nextDays[i] = nextDays[i] || '';
            continue;
        }

        const cellDate = new Date(year, month, dayNumber);
        if (isDateWithinInclusiveRange(cellDate, startDate, endDate)) {
            nextDays[i] = 'DZ';
        } else {
            nextDays[i] = nextDays[i] || '';
        }
    }

    return nextDays;
}

function clearInactiveCodeFromMonth(existingDays, monthDate, clearFromDate) {
    const monthStart = normalizePlannerDate(monthDate);
    const normalizedClearFrom = normalizePlannerDate(clearFromDate);
    if (!monthStart || !normalizedClearFrom) return [...existingDays];

    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const nextDays = [...existingDays];

    while (nextDays.length < 31) nextDays.push('');

    for (let i = 0; i < nextDays.length; i++) {
        const dayNumber = i + 1;
        if (dayNumber > daysInMonth) {
            nextDays[i] = nextDays[i] || '';
            continue;
        }

        const cellDate = new Date(year, month, dayNumber);
        if (cellDate >= normalizedClearFrom && nextDays[i] === 'DZ') {
            nextDays[i] = '';
        } else {
            nextDays[i] = nextDays[i] || '';
        }
    }

    return nextDays;
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
        const fullName = document.getElementById('newAgentFullName').value.trim();
        const username = document.getElementById('newAgentUsername').value.trim();
        const contractType = document.getElementById('newAgentContractType').value;
        const primaryTeam = document.getElementById('newAgentPrimaryTeam').value;
        const hireDateStr = document.getElementById('newAgentHireDate').value;

        // Validation
        if (!fullName || !username || !hireDateStr) {
            showTemporaryMessage(t('fill-required-fields'), "error");
            return;
        }

        let contractHours;
        if (contractType === 'Part-time') {
            contractHours = parseInt(document.getElementById('newAgentContractHours').value, 10);
            if (!contractHours || contractHours < 4 || contractHours > 7) {
                showTemporaryMessage(t('pt-hours-range'), "error");
                return;
            }
        } else {
            contractHours = 8;
        }

        const teamCode = primaryTeam.split(' ')[0]; // "RO zooplus" -> "RO"
        const now = new Date();
        const monthKey = getMonthKey(now);
        const hireDate = new Date(hireDateStr);
        const days = generateDefaultSchedule({
            contractHours,
            primaryTeam,
            hireDate
        }, monthKey);
        const newUser = {
            fullName,
            username,
            contractHours,
            contractType,
            primaryTeam,
            teams: [teamCode],
            hireDate,
            isActive: true,
            monthlyDays: { [monthKey]: days },
            monthlyNotes: {}
        };

        await addAgent(newUser);
        form.reset();
        updateContractHoursVisibility();
        formContainer.style.display = 'none';
        addBtn.style.display = 'inline-flex';
        showTemporaryMessage(t('user-created').replace('{name}', fullName).replace('{hours}', contractHours).replace('{team}', teamCode), "success");
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
            fieldElement.dataset.initialValue = getComparableInlineFieldState(user, fieldElement.dataset.field);
        });

        tbody.appendChild(tr);
    });

}

function normalizeInlineDateValue(value) {
    if (!value) return '';

    const date = value instanceof Date
        ? value
        : value?.toDate
            ? value.toDate()
            : new Date(value);

    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
}

function normalizeInlineFieldValue(field, value) {
    if (field === 'contractHours') {
        const numericValue = typeof value === 'number' ? value : parseInt(value, 10);
        return Number.isNaN(numericValue) ? '' : String(numericValue);
    }

    if (field === 'hireDate') {
        return normalizeInlineDateValue(value);
    }

    if (value == null) return '';
    return String(value).trim();
}

function getComparableInlineFieldState(user, field) {
    if (field === 'contractHours') {
        const currentHours = user?.contractHours ?? ((user?.contractType || 'Full-time') === 'Full-time' ? 8 : '');
        return normalizeInlineFieldValue(field, currentHours);
    }

    if (field === 'contractType') {
        return normalizeInlineFieldValue(field, user?.contractType || 'Full-time');
    }

    const normalizedValue = normalizeInlineFieldValue(field, user?.[field]);

    if (field === 'primaryTeam') {
        const storedTeams = Array.isArray(user?.teams)
            ? user.teams.map(team => String(team || '').trim()).filter(Boolean)
            : [];

        return JSON.stringify({
            primaryTeam: normalizedValue,
            teams: storedTeams
        });
    }

    return normalizedValue;
}

function getComparableInlineDraftState(field, rawValue) {
    const normalizedValue = normalizeInlineFieldValue(field, rawValue);

    if (field === 'primaryTeam') {
        const teamCode = normalizedValue ? normalizedValue.split(' ')[0] : '';
        return JSON.stringify({
            primaryTeam: normalizedValue,
            teams: teamCode ? [teamCode] : []
        });
    }

    return normalizedValue;
}

// Generate planner days from a start date to end of month
function generateDaysFromDate(startDay, daysInMonth, year, month, hours, teamCode) {
    const days = [];
    for (let d = 1; d <= 31; d++) {
        if (d < startDay) {
            days.push(null); // Keep existing value — marker for "don't change"
        } else if (d <= daysInMonth) {
            const date = new Date(year, month, d);
            const dayOfWeek = date.getDay();
            if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                days.push(`${hours}${teamCode}`);
            } else {
                days.push(''); // Weekend — leave empty
            }
        } else {
            days.push('');
        }
    }
    return days;
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
        const fromDateStr = document.getElementById('contractChangeDate').value;
        if (!fromDateStr) {
            showTemporaryMessage(t('select-start-date'), "error");
            return;
        }

        const fromDate = new Date(fromDateStr);
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        // Validate date is in current month
        if (fromDate.getFullYear() !== year || fromDate.getMonth() !== month) {
            showTemporaryMessage(t('date-must-be-current-month'), "error");
            return;
        }

        const startDay = fromDate.getDate();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const teamCode = (user.primaryTeam || 'RO zooplus').split(' ')[0];

        let contractHours;
        if (newContractType === 'Part-time') {
            contractHours = parseInt(document.getElementById('contractChangeHours').value, 10);
        } else {
            contractHours = 8;
        }

        // Generate new days, merging with existing
        const contractMonthKey = getMonthKey(now);
        const newDays = generateDaysFromDate(startDay, daysInMonth, year, month, contractHours, teamCode);
        const existingDays = getAgentDaysForMonth(user, contractMonthKey);
        const mergedDays = [...existingDays];
        while (mergedDays.length < 31) mergedDays.push('');
        for (let i = 0; i < mergedDays.length; i++) {
            if (i < newDays.length && newDays[i] !== null) {
                mergedDays[i] = newDays[i];
            }
            mergedDays[i] = mergedDays[i] || '';
        }

        await updateAgent(userId, {
            contractType: newContractType,
            contractHours,
            [`monthlyDays.${contractMonthKey}`]: mergedDays
        });
        logActivity('portal', 'change_contract', { name: user.fullName, type: newContractType, hours: contractHours });

        modal.classList.remove('active');
        showTemporaryMessage(t('contract-updated').replace('{name}', user.fullName).replace('{type}', newContractType).replace('{hours}', contractHours).replace('{date}', `${startDay}.${month + 1}.${year}`), "success");
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
            const now = new Date();
            const reactivateMonthKey = getMonthKey(now);
            const futureMonthKeys = Object.keys(user.monthlyDays || {})
                .filter(monthKey => monthKey >= reactivateMonthKey)
                .sort();
            const updateData = {
                isActive: true,
                inactiveFrom: null,
                inactiveTo: null,
                deactivationNote: null
            };

            futureMonthKeys.forEach(monthKey => {
                const monthStart = getMonthStartFromKey(monthKey);
                if (!monthStart) return;

                const existingDays = getAgentDaysForMonth(user, monthKey);
                const clearedDays = clearInactiveCodeFromMonth(existingDays, monthStart, now);
                updateData[`monthlyDays.${monthKey}`] = clearedDays;
            });

            await updateAgent(userId, updateData);
            logActivity('portal', 'reactivate_agent', { name: user.fullName });
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
        const startDate = dateFromInput._selectedDate;
        if (!startDate) {
            showTemporaryMessage(t('select-start-date-deact'), "error");
            return;
        }

        const endDate = dateToInput._selectedDate || null;

        if (endDate && endDate < startDate) {
            showTemporaryMessage(t('end-date-after-start'), "error");
            return;
        }

        const noteText = noteInput ? noteInput.value.trim() : '';

        const now = new Date();
        const deactMonthKey = getMonthKey(now);
        const existingDays = getAgentDaysForMonth(user, deactMonthKey);
        const newDays = applyInactiveCodeToMonth(existingDays, now, startDate, endDate);

        // Build update object
        const updateData = {
            isActive: false,
            [`monthlyDays.${deactMonthKey}`]: newDays,
            inactiveFrom: Timestamp.fromDate(startDate),
            inactiveTo: endDate ? Timestamp.fromDate(endDate) : null,
            deactivationNote: noteText || null
        };

        await updateAgent(userId, updateData);

        const modeLabel = endDate ? 'period' : 'indefinite';
        const fromStr = startDate.toLocaleDateString('ro-RO');
        const toStr = endDate ? endDate.toLocaleDateString('ro-RO') : 'indefinit';
        logActivity('portal', 'deactivate_agent', { name: user.fullName, mode: modeLabel, from: fromStr, to: toStr, note: noteText });
        closeModal();
        showTemporaryMessage(t('agent-deactivated').replace('{name}', user.fullName).replace('{from}', fromStr).replace('{to}', toStr), "success");
    });
}

async function handleInlineEdit(e) {
    const target = e.target;
    if (!target.dataset.field) return;

    const tr = target.closest('tr');
    const id = tr.dataset.id;
    const field = target.dataset.field;
    const user = usersData.find(u => u.id === id);
    let value;

    if (!user) return;

    // isActive is handled by the deactivate modal, not inline edit
    if (field === 'isActive') return;

    // Contract type change — open modal instead of direct update
    if (field === 'contractType') {
        if (e.type !== 'change') return;
        const newType = target.value;
        if (normalizeInlineFieldValue('contractType', newType) === getComparableInlineFieldState(user, 'contractType')) return;
        openContractChangeModal(id, newType);
        return;
    }

    // Determine value based on input type
    if (target.isContentEditable) {
        value = target.textContent.trim();
    } else {
        value = target.value;
    }

    const currentState = getComparableInlineFieldState(user, field);
    const lastSavedState = target.dataset.initialValue || currentState;

    // Field-specific validation and transformation
    if (field === 'contractHours') {
        value = parseInt(value, 10);
        if (isNaN(value) || value < 4 || value > 8) {
            showTemporaryMessage(t('hours-range-error'), "error");
            renderUsersTable();
            return;
        }
    } else if (field === 'hireDate') {
        if (!value) {
            showTemporaryMessage(t('hire-date-empty'), "error");
            renderUsersTable();
            return;
        }
        value = Timestamp.fromDate(new Date(value));
    } else if (field === 'username') {
        // No .fsp validation needed
    } else if (field === 'fullName' && !value) {
        showTemporaryMessage(t('name-empty'), "error");
        renderUsersTable();
            return;
    }

    const nextState = getComparableInlineDraftState(field, value);
    if (nextState === currentState || nextState === lastSavedState) {
        target.dataset.initialValue = currentState;
        return;
    }

    let updatePayload = { [field]: value };
    const logDetails = { field, agentId: id };

    if (field === 'primaryTeam') {
        const teamCode = String(value).trim().split(' ')[0];
        updatePayload = { primaryTeam: value, teams: teamCode ? [teamCode] : [] };
        logDetails.value = value;
    }

    await updateAgent(id, updatePayload);
    target.dataset.initialValue = nextState;
    logActivity('portal', 'edit_user', logDetails);
    showTemporaryMessage(t('user-updated'), "success", 1000);
} 
