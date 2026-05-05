// js/planner-edit-command.js

import { getAgentDaysForMonth, getAgentNotesForMonth } from './config.js';

function parseCellKey(key) {
    const [agentId, monthKey, dayIndexStr] = String(key).split('|');
    return {
        agentId,
        monthKey,
        dayIndex: parseInt(dayIndexStr, 10)
    };
}

function groupChangesByAgentAndMonth(selectedCellKeys, newValue) {
    const updates = new Map();

    selectedCellKeys.forEach(key => {
        const { agentId, monthKey, dayIndex } = parseCellKey(key);
        if (!agentId || !monthKey || Number.isNaN(dayIndex)) return;

        if (!updates.has(agentId)) {
            updates.set(agentId, new Map());
        }

        const agentMonths = updates.get(agentId);
        if (!agentMonths.has(monthKey)) {
            agentMonths.set(monthKey, []);
        }
        agentMonths.get(monthKey).push({ dayIndex, newValue });
    });

    return updates;
}

function buildAgentMonthUpdate(agent, agentId, monthKey, changes, noteText) {
    const daysArray = getAgentDaysForMonth(agent, monthKey);
    const notesObj = getAgentNotesForMonth(agent, monthKey);
    const newDays = [...daysArray];
    while (newDays.length < 31) newDays.push('');

    const newDayNotes = { ...notesObj };
    changes.forEach(({ dayIndex, newValue }) => {
        if (dayIndex >= 0 && dayIndex < newDays.length) {
            newDays[dayIndex] = newValue;
            if (noteText) {
                newDayNotes[dayIndex.toString()] = noteText;
            } else {
                delete newDayNotes[dayIndex.toString()];
            }
        }
    });

    return {
        snapshot: {
            agentId,
            monthKey,
            previousDays: [...daysArray],
            previousDayNotes: { ...notesObj }
        },
        updateData: {
            [`monthlyDays.${monthKey}`]: newDays,
            [`monthlyNotes.${monthKey}`]: newDayNotes
        }
    };
}

export function buildPlannerEditCommand(agents, selectedCellKeys, newValue, noteText = '') {
    const selectedKeys = selectedCellKeys || new Set();
    const updatesByAgent = groupChangesByAgentAndMonth(selectedKeys, newValue);
    const agentById = new Map((agents || []).map(agent => [agent.id, agent]));
    const updates = [];
    const snapshots = [];
    const changedAgentIds = [];
    const missingAgentIds = [];
    const activityAgentNames = [];

    for (const [agentId, monthsMap] of updatesByAgent.entries()) {
        const agent = agentById.get(agentId);
        if (!agent) {
            missingAgentIds.push(agentId);
            activityAgentNames.push(agentId);
            continue;
        }

        const updateData = {};
        for (const [monthKey, changes] of monthsMap.entries()) {
            const monthUpdate = buildAgentMonthUpdate(agent, agentId, monthKey, changes, noteText);
            snapshots.push(monthUpdate.snapshot);
            Object.assign(updateData, monthUpdate.updateData);
        }

        changedAgentIds.push(agentId);
        activityAgentNames.push(agent.fullName || agent.name || agentId);
        updates.push({
            agentId,
            agentName: agent.fullName || agent.name || agentId,
            updateData
        });
    }

    return {
        updates,
        snapshots,
        changedAgentIds,
        cellCount: selectedKeys.size,
        missingAgentIds,
        activity: {
            agentNames: activityAgentNames,
            cells: selectedKeys.size,
            value: newValue
        }
    };
}
