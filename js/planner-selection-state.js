// js/planner-selection-state.js

function cloneSelectedCells(selectedCells) {
    return new Set(selectedCells || []);
}

function clonePlannerSelectionState(state = {}, overrides = {}) {
    return {
        selectedCells: cloneSelectedCells(state.selectedCells),
        selectionStarted: Boolean(state.selectionStarted),
        currentEditType: state.currentEditType ?? null,
        bulkEditMode: Boolean(state.bulkEditMode),
        ...overrides
    };
}

export function createPlannerSelectionState(initialState = {}) {
    return clonePlannerSelectionState(initialState);
}

export function getPlannerCellSelectionKey(cellDataset = {}) {
    const agentId = cellDataset.agentId;
    const monthKey = cellDataset.monthKey ?? cellDataset.month;
    const dayIndex = cellDataset.dayIndex ?? cellDataset.day;

    return `${agentId}|${monthKey}|${dayIndex}`;
}

export function togglePlannerCellSelection(state, cellKey) {
    if (!cellKey) {
        return { state, cellKey, changed: false, isSelected: false };
    }

    const selectedCells = cloneSelectedCells(state.selectedCells);
    const wasSelected = selectedCells.has(cellKey);

    if (wasSelected) {
        selectedCells.delete(cellKey);
    } else {
        selectedCells.add(cellKey);
    }

    return {
        state: clonePlannerSelectionState(state, {
            selectedCells,
            selectionStarted: true
        }),
        cellKey,
        changed: true,
        isSelected: !wasSelected
    };
}

export function addPlannerDragSelectionCell(state, cellKey) {
    if (!state?.selectionStarted || !cellKey) {
        return { state, cellKey, changed: false, isSelected: false };
    }

    const selectedCells = cloneSelectedCells(state.selectedCells);
    if (selectedCells.has(cellKey)) {
        return { state, cellKey, changed: false, isSelected: true };
    }

    selectedCells.add(cellKey);

    return {
        state: clonePlannerSelectionState(state, { selectedCells }),
        cellKey,
        changed: true,
        isSelected: true
    };
}

export function stopPlannerCellSelection(state) {
    return clonePlannerSelectionState(state, { selectionStarted: false });
}

export function clearPlannerCellSelection(state) {
    return clonePlannerSelectionState(state, {
        selectedCells: new Set(),
        selectionStarted: false
    });
}

export function getPlannerSelectionCount(state) {
    return state?.selectedCells?.size || 0;
}

export function isPlannerSelectionDragActive(state) {
    return Boolean(state?.selectionStarted);
}
