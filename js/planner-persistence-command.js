// js/planner-persistence-command.js

function getAgentName(agent, fallbackId = '') {
    return agent?.fullName || agent?.name || fallbackId;
}

export function buildLegacyPlannerMigrationCommand(agent, currentMonthKey) {
    if (!agent || !agent.id || !currentMonthKey) return null;
    if (agent.monthlyDays || !Array.isArray(agent.days)) return null;

    const updateData = {
        [`monthlyDays.${currentMonthKey}`]: [...agent.days]
    };

    if (agent.dayNotes && Object.keys(agent.dayNotes).length > 0) {
        updateData[`monthlyNotes.${currentMonthKey}`] = { ...agent.dayNotes };
    }

    return {
        agentId: agent.id,
        agentName: getAgentName(agent, agent.id),
        monthKey: currentMonthKey,
        updateData
    };
}

export function buildPlannerMigrationCommands(agents, currentMonthKey, migratedAgentIds = new Set()) {
    return (agents || [])
        .filter(agent => !migratedAgentIds.has(agent.id))
        .map(agent => buildLegacyPlannerMigrationCommand(agent, currentMonthKey))
        .filter(Boolean);
}

export function buildPlannerUndoCommand(snapshot = []) {
    const updates = (snapshot || [])
        .filter(entry => entry?.agentId && entry?.monthKey)
        .map(entry => ({
            agentId: entry.agentId,
            updateData: {
                [`monthlyDays.${entry.monthKey}`]: entry.previousDays,
                [`monthlyNotes.${entry.monthKey}`]: entry.previousDayNotes
            }
        }));

    return {
        updates,
        activity: {
            agents: updates.length
        }
    };
}

export function buildPlannerClearMonthCommand(agentId, monthKey, agents = []) {
    if (!agentId || !monthKey) return null;

    const agent = (agents || []).find(entry => entry.id === agentId);

    return {
        update: {
            agentId,
            updateData: {
                [`monthlyDays.${monthKey}`]: Array(31).fill(''),
                [`monthlyNotes.${monthKey}`]: {}
            }
        },
        activity: {
            name: getAgentName(agent, agentId),
            month: monthKey
        }
    };
}
