// js/users.js
import { db } from './firebase-config.js';
import { collection, onSnapshot, Timestamp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore.js";
import { addAgent, updateAgent, deleteAgent } from './planner.js';
import { showTemporaryMessage } from './ui.js';

let usersData = [];
let unsubscribeFromUsers;

export function initializeUsers() {
    console.log("Setting up real-time listener for users...");
    const usersCollection = collection(db, 'agents');

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
    });

    // Handle form submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = document.getElementById('newAgentFullName').value.trim();
        const username = document.getElementById('newAgentUsername').value.trim();
        const contractHours = parseInt(document.getElementById('newAgentContractHours').value, 10);
        const contractType = document.getElementById('newAgentContractType').value;
        const primaryTeam = document.getElementById('newAgentPrimaryTeam').value;
        const hireDateStr = document.getElementById('newAgentHireDate').value;

        // Validation
        if (!fullName || !username || !hireDateStr) {
            showTemporaryMessage("Please fill all required fields.", "error");
            return;
        }
        if (!username.endsWith('.fsp')) {
            showTemporaryMessage("Username must end with .fsp", "error");
            return;
        }

        const newUser = {
            fullName,
            username,
            contractHours: contractHours || 8,
            contractType,
            primaryTeam,
            teams: [primaryTeam.split(' ')[0]], // e.g., "RO zooplus" -> ["RO"]
            hireDate: new Date(hireDateStr),
            isActive: true,
            days: Array(31).fill('') // Default empty schedule
        };

        await addAgent(newUser);
        form.reset();
        formContainer.style.display = 'none'; // Hide form after success
        addBtn.style.display = 'inline-flex';
    });
}

function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    usersData.forEach((user) => {
        const tr = document.createElement('tr');
        tr.dataset.id = user.id; // For easy reference in edits
        const hireDateStr = user.hireDate ? user.hireDate.toISOString().split('T')[0] : '';
        tr.innerHTML = `
            <td contenteditable="true" data-field="fullName">${user.fullName || ''}</td>
            <td contenteditable="true" data-field="username">${user.username || ''}</td>
            <td><input type="number" class="inline-input" min="4" max="8" value="${user.contractHours || 8}" data-field="contractHours"></td>
            <td>
                <select class="inline-select" data-field="contractType">
                    <option value="Full-time" ${user.contractType === 'Full-time' ? 'selected' : ''}>Full-time</option>
                    <option value="Part-time" ${user.contractType === 'Part-time' ? 'selected' : ''}>Part-time</option>
                </select>
            </td>
            <td>
                <select class="inline-select" data-field="primaryTeam">
                    <option value="RO zooplus" ${user.primaryTeam === 'RO zooplus' ? 'selected' : ''}>RO zooplus</option>
                    <option value="HU zooplus" ${user.primaryTeam === 'HU zooplus' ? 'selected' : ''}>HU zooplus</option>
                    <option value="IT zooplus" ${user.primaryTeam === 'IT zooplus' ? 'selected' : ''}>IT zooplus</option>
                    <option value="NL zooplus" ${user.primaryTeam === 'NL zooplus' ? 'selected' : ''}>NL zooplus</option>
                    <option value="DE zooplus" ${user.primaryTeam === 'DE zooplus' ? 'selected' : ''}>DE zooplus</option>
                </select>
            </td>
            <td><input type="date" class="inline-input" value="${hireDateStr}" data-field="hireDate"></td>
            <td>
                <label class="inline-checkbox">
                    <input type="checkbox" ${user.isActive ? 'checked' : ''} data-field="isActive">
                    <span class="checkmark"></span>
                </label>
            </td>
            <td><button class="btn-ghost delete-btn" data-id="${user.id}" data-translate="delete">Delete</button></td>
        `;
        tbody.appendChild(tr);
    });

    // Event delegation for edits (on blur/change)
    tbody.addEventListener('blur', handleInlineEdit, true); // Capture on blur for contenteditable/input
    tbody.addEventListener('change', handleInlineEdit, true); // For select/checkbox
    // Delete buttons
    tbody.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const id = e.target.dataset.id;
            const userName = usersData.find(u => u.id === id)?.fullName || 'this user';
            if (confirm(`Are you sure you want to delete ${userName}?`)) {
                deleteAgent(id);
            }
        }
    });
}

async function handleInlineEdit(e) {
    const target = e.target;
    if (!target.dataset.field) return; // Not an editable field

    const tr = target.closest('tr');
    const id = tr.dataset.id;
    const field = target.dataset.field;
    let value;

    // Determine value based on input type
    if (target.type === 'checkbox') {
        value = target.checked;
    } else if (target.isContentEditable) {
        value = target.textContent.trim();
    } else {
        value = target.value;
    }


    // Field-specific validation and transformation
    if (field === 'contractHours') {
        value = parseInt(value, 10);
        if (isNaN(value) || value < 4 || value > 8) {
            showTemporaryMessage("Contract hours must be between 4 and 8.", "error");
            renderUsersTable(); // Re-render to discard invalid change
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
        const teamCode = value.split(' ')[0]; // e.g., "RO zooplus" -> "RO"
        await updateAgent(id, { primaryTeam: value, teams: [teamCode] });
        showTemporaryMessage("User updated.", "success", 1000);
        return; // Early return as we updated two fields
    } else if (field === 'username') {
        if (!value.endsWith('.fsp')) {
            showTemporaryMessage("Username must end with .fsp", "error");
            renderUsersTable();
            return;
        }
    } else if (field === 'fullName' && !value) {
        showTemporaryMessage("Full name cannot be empty.", "error");
        renderUsersTable();
        return;
    }

    await updateAgent(id, { [field]: value });
    showTemporaryMessage("User updated.", "success", 1000);
} 