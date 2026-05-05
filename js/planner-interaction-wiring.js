// js/planner-interaction-wiring.js

const SELECTABLE_CELL_SELECTOR = '.planner-cell.selectable';
const SELECTED_CELL_SELECTOR = '.planner-cell.selected';
const PLANNER_BODY_ID = 'plannerTableBody';
const PLANNER_SECTION_ID = 'planner';
const ACTIVE_MODAL_SELECTOR = '.edit-modal.active';
const INPUT_SELECTOR = 'input, textarea, [contenteditable]';

function currentDocument() {
    return globalThis.document || null;
}

function bindEvent(target, eventName, handler, { dedupe = false, bindings } = {}) {
    if (!target || typeof handler !== 'function') return;

    if (dedupe && typeof target.removeEventListener === 'function') {
        target.removeEventListener(eventName, handler);
    }

    if (typeof target.addEventListener === 'function') {
        target.addEventListener(eventName, handler);
        bindings?.push({ target, eventName, handler });
    }
}

function queryAll(root, selector) {
    return Array.from(root?.querySelectorAll?.(selector) || []);
}

function byId(root, id) {
    return root?.getElementById?.(id) || null;
}

function hasSelectedPlannerCells(root) {
    return queryAll(root, SELECTED_CELL_SELECTOR).length > 0;
}

function isPlannerShortcutEligible(event, root) {
    if (event?.target?.matches?.(INPUT_SELECTOR)) return false;

    const plannerSection = byId(root, PLANNER_SECTION_ID);
    return Boolean(plannerSection?.classList?.contains?.('active'));
}

function handlePlannerShortcut(event, root, actions) {
    if (!isPlannerShortcutEligible(event, root)) return;

    const modalOpen = root?.querySelector?.(ACTIVE_MODAL_SELECTOR);

    if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        event.preventDefault();
        actions.undoLastChange?.();
        return;
    }

    if (event.key === 'Enter' && !modalOpen) {
        if (hasSelectedPlannerCells(root)) {
            event.preventDefault();
            actions.openEditModal?.();
        }
        return;
    }

    if (event.key === 'Escape') {
        if (modalOpen) {
            event.preventDefault();
            actions.closeEditModal?.();
            return;
        }

        if (hasSelectedPlannerCells(root)) {
            event.preventDefault();
            actions.clearSelection?.();
        }
    }
}

function teardownBindings(bindings) {
    bindings.forEach(({ target, eventName, handler }) => {
        target?.removeEventListener?.(eventName, handler);
    });
}

export function bindPlannerTableInteractions({ root = currentDocument(), documentTarget = currentDocument(), handlers = {} } = {}) {
    const bindings = [];
    const cells = queryAll(root, SELECTABLE_CELL_SELECTOR);

    cells.forEach(cell => {
        bindEvent(cell, 'mousedown', handlers.onCellMouseDown, { dedupe: true, bindings });
        bindEvent(cell, 'mouseover', handlers.onCellMouseOver, { dedupe: true, bindings });
        bindEvent(cell, 'mouseup', handlers.onCellMouseUp, { dedupe: true, bindings });
        bindEvent(cell, 'contextmenu', handlers.onCellRightClick, { dedupe: true, bindings });
    });

    bindEvent(documentTarget, 'mouseup', handlers.onDocumentMouseUp, { dedupe: true, bindings });

    const plannerBody = byId(root, PLANNER_BODY_ID);
    bindEvent(plannerBody, 'contextmenu', handlers.onScopedRightClick, { dedupe: true, bindings });
    bindEvent(plannerBody, 'click', handlers.onDeleteButtonClick, { dedupe: true, bindings });

    return () => teardownBindings(bindings);
}

export function bindPlannerControlInteractions({ root = currentDocument(), documentTarget = currentDocument(), actions = {} } = {}) {
    const bindings = [];

    bindEvent(byId(root, 'editSelectionBtn'), 'click', actions.openEditModal, { bindings });
    bindEvent(byId(root, 'cancelSelectionBtn'), 'click', actions.clearSelection, { bindings });
    bindEvent(byId(root, 'saveButton'), 'click', actions.saveModalChanges, { bindings });
    bindEvent(byId(root, 'undoBtn'), 'click', actions.undoLastChange, { bindings });

    queryAll(root, '.edit-option').forEach(option => {
        const handler = () => actions.selectEditType?.(option.dataset.type);
        bindEvent(option, 'click', handler, { bindings });
    });

    bindEvent(root?.querySelector?.('.edit-modal-close'), 'click', actions.closeEditModal, { bindings });
    bindEvent(root?.querySelector?.('.edit-actions .btn-secondary'), 'click', actions.closeEditModal, { bindings });

    const keydownHandler = event => handlePlannerShortcut(event, root, actions);
    bindEvent(documentTarget, 'keydown', keydownHandler, { bindings });

    return () => teardownBindings(bindings);
}
