// js/users.js
import { db } from './firebase-config.js';
import { collection, onSnapshot, Timestamp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore.js";
import { addAgent, updateAgent, deleteAgent } from './planner.js';
import { showTemporaryMessage } from './ui.js';
import { logActivity } from './logs.js';

let usersData = [];

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
        showTemporaryMessage("Error loading users. Data may be stale.", "error");
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
            const userName = usersData.find(u => u.id === id)?.fullName || 'this user';
            if (confirm(`Are you sure you want to delete ${userName}?`)) {
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
            showTemporaryMessage("Please fill all required fields.", "error");
            return;
        }

        let contractHours;
        if (contractType === 'Part-time') {
            contractHours = parseInt(document.getElementById('newAgentContractHours').value, 10);
            if (!contractHours || contractHours < 4 || contractHours > 7) {
                showTemporaryMessage("Part-time hours must be between 4 and 7.", "error");
                return;
            }
        } else {
            contractHours = 8;
        }

        // Generate smart planner days for the current month
        const teamCode = primaryTeam.split(' ')[0]; // "RO zooplus" -> "RO"
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth(); // 0-indexed
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days = [];

        for (let d = 1; d <= 31; d++) {
            if (d <= daysInMonth) {
                const date = new Date(year, month, d);
                const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat
                if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                    days.push(`${contractHours}${teamCode}`);
                } else {
                    days.push(''); // Weekend — leave empty
                }
            } else {
                days.push(''); // Days beyond month length
            }
        }

        const newUser = {
            fullName,
            username,
            contractHours,
            contractType,
            primaryTeam,
            teams: [teamCode],
            hireDate: new Date(hireDateStr),
            isActive: true,
            days
        };

        await addAgent(newUser);
        form.reset();
        updateContractHoursVisibility();
        formContainer.style.display = 'none';
        addBtn.style.display = 'inline-flex';
        showTemporaryMessage(`${fullName} created with ${contractHours}h/${teamCode} schedule.`, "success");
    });
}

function renderUsersTable() {
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
                    <option value="Full-time" ${contractLabel === 'Full-time' ? 'selected' : ''}>Full-time</option>
                    <option value="Part-time" ${contractLabel === 'Part-time' ? 'selected' : ''}>Part-time</option>
                </select>
            </td>
            <td>
                <select class="inline-select" data-field="primaryTeam">
                    <option value="RO zooplus" ${user.primaryTeam === 'RO zooplus' ? 'selected' : ''}>RO zooplus</option>
                    <option value="HU zooplus" ${user.primaryTeam === 'HU zooplus' ? 'selected' : ''}>HU zooplus</option>
                    <option value="IT zooplus" ${user.primaryTeam === 'IT zooplus' ? 'selected' : ''}>IT zooplus</option>
                    <option value="NL zooplus" ${user.primaryTeam === 'NL zooplus' ? 'selected' : ''}>NL zooplus</option>
                    <option value="CS zooplus" ${user.primaryTeam === 'CS zooplus' ? 'selected' : ''}>CS zooplus</option>
                    <option value="SK zooplus" ${user.primaryTeam === 'SK zooplus' ? 'selected' : ''}>SK zooplus</option>
                    <option value="SV-SE zooplus" ${user.primaryTeam === 'SV-SE zooplus' ? 'selected' : ''}>SV-SE zooplus</option>
                </select>
            </td>
            <td class="hide-mobile"><input type="date" class="inline-input" value="${hireDateStr}" data-field="hireDate"></td>
            <td style="text-align: center;">
                <button class="btn-status ${user.isActive ? 'active' : 'inactive'}" data-field="isActive" data-id="${user.id}">
                    ${user.isActive ? 'Activ' : 'Inactiv'}
                </button>
            </td>
            <td><button class="btn-ghost delete-btn" data-id="${user.id}" data-translate="delete">Delete</button></td>
        `;
        tbody.appendChild(tr);
    });

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
        title.textContent = `${user.fullName} — Schimbare la Part-time`;
        hoursGroup.style.display = '';
    } else {
        title.textContent = `${user.fullName} — Schimbare la Full-time`;
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
            showTemporaryMessage("Selectează data de începere.", "error");
            return;
        }

        const fromDate = new Date(fromDateStr);
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        // Validate date is in current month
        if (fromDate.getFullYear() !== year || fromDate.getMonth() !== month) {
            showTemporaryMessage("Data trebuie să fie în luna curentă.", "error");
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
        const newDays = generateDaysFromDate(startDay, daysInMonth, year, month, contractHours, teamCode);
        const existingDays = user.days || Array(31).fill('');
        const mergedDays = existingDays.map((existing, i) => {
            if (i < newDays.length && newDays[i] !== null) {
                return newDays[i];
            }
            return existing || '';
        });
        // Pad to 31 if shorter
        while (mergedDays.length < 31) mergedDays.push('');

        await updateAgent(userId, {
            contractType: newContractType,
            contractHours,
            days: mergedDays
        });
        logActivity('portal', 'change_contract', { name: user.fullName, type: newContractType, hours: contractHours });

        modal.classList.remove('active');
        showTemporaryMessage(`Contract ${user.fullName} actualizat: ${newContractType} (${contractHours}h) din ${startDay}.${month + 1}.${year}`, "success");
    });
}

// Show deactivate/reactivate modal
function openDeactivateModal(userId) {
    const modal = document.getElementById('deactivateModal');
    const user = usersData.find(u => u.id === userId);
    if (!user || !modal) return;

    const title = document.getElementById('deactivateTitle');
    const optionsDiv = document.getElementById('deactivateOptions');
    const dateGroup = document.getElementById('deactivateDateGroup');
    const dateFromInput = document.getElementById('deactivateDateFrom');
    const dateToInput = document.getElementById('deactivateDateTo');
    const saveBtn = document.getElementById('deactivateSaveBtn');
    const cancelBtn = document.getElementById('deactivateCancelBtn');
    const closeBtn = document.getElementById('deactivateClose');

    // If user is currently inactive, offer to reactivate
    if (!user.isActive) {
        title.textContent = `${user.fullName} — Reactivare`;
        optionsDiv.style.display = 'none';
        dateGroup.style.display = 'none';

        modal.classList.add('active');

        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

        newSaveBtn.textContent = 'Reactivează';

        const closeModal = () => { modal.classList.remove('active'); };
        newCancelBtn.addEventListener('click', closeModal);
        newCloseBtn.addEventListener('click', closeModal);

        newSaveBtn.addEventListener('click', async () => {
            await updateAgent(userId, { isActive: true });
            logActivity('portal', 'reactivate_agent', { name: user.fullName });
            modal.classList.remove('active');
            showTemporaryMessage(`${user.fullName} a fost reactivat.`, "success");
        });
        return;
    }

    // User is active — offer deactivation options
    title.textContent = `${user.fullName} — Dezactivare`;
    optionsDiv.style.display = '';
    dateGroup.style.display = 'none';

    // Reset selection
    document.querySelectorAll('.deactivate-option').forEach(o => o.classList.remove('selected'));

    let selectedMode = null;

    const today = new Date();
    dateFromInput.value = today.toISOString().split('T')[0];
    dateToInput.value = '';

    modal.classList.add('active');

    // Cleanup previous listeners
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

    newSaveBtn.textContent = 'Aplică';

    const closeModal = () => { modal.classList.remove('active'); };
    newCancelBtn.addEventListener('click', closeModal);
    newCloseBtn.addEventListener('click', closeModal);

    // Option selection
    const options = modal.querySelectorAll('.deactivate-option');
    options.forEach(opt => {
        const newOpt = opt.cloneNode(true);
        opt.parentNode.replaceChild(newOpt, opt);
        newOpt.addEventListener('click', () => {
            modal.querySelectorAll('.deactivate-option').forEach(o => o.classList.remove('selected'));
            newOpt.classList.add('selected');
            selectedMode = newOpt.dataset.mode;
            if (selectedMode === 'period') {
                dateGroup.style.display = '';
            } else {
                dateGroup.style.display = 'none';
            }
        });
    });

    newSaveBtn.addEventListener('click', async () => {
        if (!selectedMode) {
            showTemporaryMessage("Selectează tipul de dezactivare.", "error");
            return;
        }

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const existingDays = user.days || Array(31).fill('');

        if (selectedMode === 'indefinite') {
            // Clear all days from today onwards
            const startDay = now.getDate();
            const clearedDays = existingDays.map((existing, i) => {
                const dayNum = i + 1;
                if (dayNum >= startDay && dayNum <= daysInMonth) {
                    return '';
                }
                return existing || '';
            });
            while (clearedDays.length < 31) clearedDays.push('');

            await updateAgent(userId, { isActive: false, days: clearedDays });
            logActivity('portal', 'deactivate_agent', { name: user.fullName, mode: 'indefinite' });
            modal.classList.remove('active');
            showTemporaryMessage(`${user.fullName} dezactivat indefinit. Orele au fost șterse din ${startDay}.${month + 1}.`, "success");

        } else if (selectedMode === 'period') {
            const fromStr = document.getElementById('deactivateDateFrom').value;
            const toStr = document.getElementById('deactivateDateTo').value;
            if (!fromStr || !toStr) {
                showTemporaryMessage("Selectează ambele date.", "error");
                return;
            }

            const fromDate = new Date(fromStr);
            const toDate = new Date(toStr);

            if (fromDate > toDate) {
                showTemporaryMessage("Data de început trebuie să fie înainte de data de sfârșit.", "error");
                return;
            }

            // Only clear days within the current month
            if (fromDate.getFullYear() !== year || fromDate.getMonth() !== month ||
                toDate.getFullYear() !== year || toDate.getMonth() !== month) {
                showTemporaryMessage("Ambele date trebuie să fie în luna curentă.", "error");
                return;
            }

            const startDay = fromDate.getDate();
            const endDay = toDate.getDate();

            const clearedDays = existingDays.map((existing, i) => {
                const dayNum = i + 1;
                if (dayNum >= startDay && dayNum <= endDay) {
                    return '';
                }
                return existing || '';
            });
            while (clearedDays.length < 31) clearedDays.push('');

            await updateAgent(userId, { isActive: false, days: clearedDays });
            logActivity('portal', 'deactivate_agent', { name: user.fullName, mode: 'period' });
            modal.classList.remove('active');
            showTemporaryMessage(`${user.fullName} dezactivat ${startDay}.${month + 1} — ${endDay}.${month + 1}. Orele au fost șterse.`, "success");
        }
    });
}

async function handleInlineEdit(e) {
    const target = e.target;
    if (!target.dataset.field) return;

    const tr = target.closest('tr');
    const id = tr.dataset.id;
    const field = target.dataset.field;
    let value;

    // Contract type change — open modal instead of direct update
    if (field === 'contractType') {
        const newType = target.value;
        const user = usersData.find(u => u.id === id);
        if (user) {
            openContractChangeModal(id, newType);
        }
        return;
    }

    // Determine value based on input type
    if (target.isContentEditable) {
        value = target.textContent.trim();
    } else {
        value = target.value;
    }

    // Field-specific validation and transformation
    if (field === 'contractHours') {
        value = parseInt(value, 10);
        if (isNaN(value) || value < 4 || value > 8) {
            showTemporaryMessage("Contract hours must be between 4 and 8.", "error");
            renderUsersTable();
            return;
        }
    } else if (field === 'hireDate') {
        if (!value) {
            showTemporaryMessage("Hire date cannot be empty.", "error");
            renderUsersTable();
            return;
        }
        value = Timestamp.fromDate(new Date(value));
    } else if (field === 'primaryTeam') {
        const teamCode = value.split(' ')[0];
        await updateAgent(id, { primaryTeam: value, teams: [teamCode] });
        logActivity('portal', 'edit_user', { field: 'primaryTeam', value, agentId: id });
        showTemporaryMessage("User updated.", "success", 1000);
        return;
    } else if (field === 'username') {
        // No .fsp validation needed
    } else if (field === 'fullName' && !value) {
        showTemporaryMessage("Full name cannot be empty.", "error");
        renderUsersTable();
        return;
    }

    await updateAgent(id, { [field]: value });
    logActivity('portal', 'edit_user', { field, agentId: id });
    showTemporaryMessage("User updated.", "success", 1000);
} 