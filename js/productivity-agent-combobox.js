function isPopoverOpen(popover) {
    try {
        return popover.matches(':popover-open');
    } catch {
        return popover.dataset.fallbackOpen === 'true';
    }
}

function setPopoverOpen(popover, shouldOpen) {
    if (shouldOpen) {
        if (typeof popover.showPopover === 'function') {
            if (!isPopoverOpen(popover)) popover.showPopover();
        } else {
            popover.dataset.fallbackOpen = 'true';
        }
        return;
    }

    if (typeof popover.hidePopover === 'function') {
        if (isPopoverOpen(popover)) popover.hidePopover();
    } else {
        delete popover.dataset.fallbackOpen;
    }
}

export function bindProductivityAgentCombobox({
    input,
    submitButton,
    popover,
    listbox,
    anchorElement = input,
    windowRef = globalThis.window,
    getVisibleAgents = () => [],
    renderSearchResults = () => {},
    chooseAgentSuggestion = () => false,
    submitAgentSearch = () => false,
    markAgentSearchPending = () => {}
} = {}) {
    if (!input || !popover || !listbox || !anchorElement) return null;

    let activeIndex = -1;
    const listeners = [];

    const listen = (target, type, handler, options) => {
        target?.addEventListener?.(type, handler, options);
        listeners.push([target, type, handler, options]);
    };

    const getOptions = () => [...listbox.querySelectorAll('[role="option"]')];

    const clearActiveOption = () => {
        getOptions().forEach(option => option.classList.remove('is-active'));
        input.removeAttribute('aria-activedescendant');
        activeIndex = -1;
    };

    const syncExpandedState = () => {
        input.setAttribute('aria-expanded', String(isPopoverOpen(popover)));
    };

    const positionPopover = () => {
        if (!windowRef || !anchorElement.getBoundingClientRect) return;

        const rect = anchorElement.getBoundingClientRect();
        const gutter = 12;
        const viewportWidth = windowRef.innerWidth || rect.width;
        const viewportHeight = windowRef.innerHeight || 800;
        const width = Math.max(240, Math.min(rect.width, viewportWidth - (gutter * 2)));
        const measuredHeight = popover.getBoundingClientRect?.().height || popover.scrollHeight || 320;
        const height = Math.min(measuredHeight, viewportHeight - (gutter * 2));
        const left = Math.min(Math.max(gutter, rect.left), Math.max(gutter, viewportWidth - width - gutter));
        const below = rect.bottom + 6;
        const above = rect.top - height - 6;
        const top = below + height <= viewportHeight - gutter || above < gutter ? below : above;

        popover.style.setProperty('--agent-popover-left', `${Math.round(left)}px`);
        popover.style.setProperty('--agent-popover-top', `${Math.round(Math.max(gutter, top))}px`);
        popover.style.setProperty('--agent-popover-width', `${Math.round(width)}px`);
    };

    const close = () => {
        setPopoverOpen(popover, false);
        clearActiveOption();
        syncExpandedState();
    };

    const open = () => {
        if (getVisibleAgents().length === 0) {
            close();
            return false;
        }

        positionPopover();
        setPopoverOpen(popover, true);
        positionPopover();
        syncExpandedState();
        return true;
    };

    const syncResults = ({ shouldOpen = false } = {}) => {
        clearActiveOption();
        if (shouldOpen) open();
        else close();
    };

    const moveActive = direction => {
        const options = getOptions();
        if (options.length === 0) return false;
        if (!isPopoverOpen(popover)) open();

        activeIndex = activeIndex < 0
            ? (direction > 0 ? 0 : options.length - 1)
            : (activeIndex + direction + options.length) % options.length;

        options.forEach((option, index) => option.classList.toggle('is-active', index === activeIndex));
        const activeOption = options[activeIndex];
        input.setAttribute('aria-activedescendant', activeOption.id);
        activeOption.scrollIntoView?.({ block: 'nearest' });
        return true;
    };

    const commitActive = () => {
        const visibleAgents = getVisibleAgents();
        const activeAgent = activeIndex >= 0 ? visibleAgents[activeIndex] : null;
        if (!activeAgent) return false;
        return chooseAgentSuggestion(activeAgent[0]);
    };

    const handleInput = () => {
        markAgentSearchPending();
        renderSearchResults(input.value);
    };

    const handleKeydown = event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            moveActive(event.key === 'ArrowDown' ? 1 : -1);
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            if (!commitActive()) submitAgentSearch(input.value);
            return;
        }

        if (event.key === 'Escape' && isPopoverOpen(popover)) {
            event.preventDefault();
            close();
        }
    };

    const handleFocus = () => renderSearchResults(input.value);
    const handleSubmit = () => submitAgentSearch(input.value);
    const handleToggle = () => {
        if (!isPopoverOpen(popover)) clearActiveOption();
        syncExpandedState();
    };
    const handleViewportChange = () => {
        if (isPopoverOpen(popover)) positionPopover();
    };

    listen(input, 'input', handleInput);
    listen(input, 'keydown', handleKeydown);
    listen(input, 'focus', handleFocus);
    listen(submitButton, 'click', handleSubmit);
    listen(popover, 'toggle', handleToggle);
    listen(windowRef, 'resize', handleViewportChange);
    listen(windowRef, 'scroll', handleViewportChange, true);
    syncExpandedState();

    return Object.freeze({
        close,
        open,
        syncResults,
        moveActive,
        commitActive,
        getActiveIndex: () => activeIndex,
        cleanup() {
            listeners.forEach(([target, type, handler, options]) => {
                target?.removeEventListener?.(type, handler, options);
            });
            close();
        }
    });
}
