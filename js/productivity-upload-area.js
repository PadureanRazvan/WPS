export function bindProductivityUploadArea({
    area,
    fileInput,
    fileNameEl = null,
    fileType,
    onFile = () => {}
} = {}) {
    if (!area || !fileInput) return false;

    area.addEventListener('click', event => {
        if (event.target !== fileInput) fileInput.click();
    });

    area.addEventListener('dragover', event => {
        event.preventDefault();
        area.style.borderColor = 'var(--accent)';
        area.style.background = 'var(--hover)';
    });

    area.addEventListener('dragleave', () => {
        area.style.borderColor = '';
        area.style.background = '';
    });

    area.addEventListener('drop', event => {
        event.preventDefault();
        area.style.borderColor = '';
        area.style.background = '';
        const file = event.dataTransfer?.files?.[0];
        if (file) onFile(file, fileNameEl, fileType);
    });

    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (file) onFile(file, fileNameEl, fileType);
    });

    return true;
}
