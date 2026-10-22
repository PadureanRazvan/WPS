import { createSherpaBoss } from './sherpa-boss.js';

// The large character is created only while its native modal is open.
export function createBossStudio({ companion, root = document, canShowCompanion = () => true, onRagdollChange = () => {}, onPreferenceRetry = () => {} }) {
    const dialog = root.getElementById('bossStudio');
    if (!dialog) return { open() {}, dispose() {} };
    const stage = dialog.querySelector('[data-boss-preview]');
    const pauseButton = dialog.querySelector('[data-boss-pause]');
    const turn = dialog.querySelector('#bossTurn');
    const announcement = dialog.querySelector('[data-boss-announcement]');
    const ragdollToggle = dialog.querySelector('[data-boss-ragdoll]');
    const preferenceStatus = dialog.querySelector('[data-boss-preference-status]');
    const preferenceRetry = dialog.querySelector('[data-boss-preference-retry]');
    let preview = null;
    let paused = false;
    let returnFocus = null;
    const bindings = [];
    const listen = (target, type, action) => {
        target?.addEventListener(type, action);
        bindings.push(() => target?.removeEventListener(type, action));
    };
    const announce = text => { if (announcement) announcement.textContent = text; };
    const setPaused = value => {
        paused = value;
        companion.setPaused(paused);
        preview?.setPaused(paused);
        pauseButton.setAttribute('aria-pressed', String(paused));
        pauseButton.textContent = paused ? 'Resume motion' : 'Pause motion';
    };
    const play = name => {
        if (paused) setPaused(false);
        preview?.play(name);
        companion.play(name);
        announce(({ wave: 'Sherpa says hello.', dance: 'Happy dance!', spin: 'Taking a spin.', celebrate: 'A little celebration.' })[name]);
    };
    const releasePreview = () => {
        preview?.dispose();
        preview = null;
        companion.setVisible(canShowCompanion());
        returnFocus?.focus?.();
        returnFocus = null;
    };
    const close = () => { if (dialog.open) dialog.close(); releasePreview(); };
    listen(dialog.querySelector('[data-boss-close]'), 'click', close);
    listen(dialog, 'close', releasePreview);
    listen(dialog, 'click', event => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    });
    dialog.querySelectorAll('[data-boss-action]').forEach(button => {
        listen(button, 'click', () => play(button.dataset.bossAction));
    });
    listen(pauseButton, 'click', () => setPaused(!paused));
    listen(ragdollToggle, 'change', () => onRagdollChange(ragdollToggle.checked));
    listen(preferenceRetry, 'click', onPreferenceRetry);
    listen(turn, 'input', () => preview?.setYaw(Number(turn.value) * Math.PI / 180));
    listen(dialog.querySelector('[data-boss-home]'), 'click', () => {
        companion.resetPosition();
        announce('Sherpa is back in her corner.');
    });
    return {
        setRagdollPreference({ enabled, ready, saving, status }) {
            if (ragdollToggle) { ragdollToggle.checked = enabled; ragdollToggle.disabled = !ready || saving; }
            if (preferenceStatus) preferenceStatus.textContent = ({
                loading: 'Loading your account setting…',
                waiting: 'Waiting for a connection to load your account setting.',
                saving: 'Saving to your account… A connection is needed.',
                saved: 'Saved to your account.',
                'load-error': 'Could not load your account setting. Try again.',
                'save-error': 'Could not save. Your previous setting was restored.'
            })[status] || 'Saved for your account, across devices.';
            if (preferenceRetry) preferenceRetry.hidden = !['load-error', 'waiting'].includes(status);
        },
        open() {
            if (dialog.open) return;
            returnFocus = root.activeElement;
            dialog.showModal();
            companion.setVisible(false);
            turn.value = '0';
            preview = createSherpaBoss({ element: stage, draggable: false, onActivate: () => play('wave') });
            preview.setPaused(paused);
            preview.ready.then(() => { if (preview && !paused) preview.play('wave'); }).catch(() => {});
        },
        dispose() {
            close();
            bindings.forEach(unbind => unbind());
        }
    };
}
