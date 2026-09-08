import { writeFile } from 'node:fs/promises';

/** Record the local renderer at a real-time cadence, without an encoder binary. */
export async function recordLogoVideo(page, path, { selector, seconds, transitionAt = null }) {
    const result = await page.evaluate(async ({ selector, seconds, transitionAt }) => {
        const source = document.querySelector(selector);
        if (!source) throw new Error('No sculpture canvas to record');
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(720, source.width);
        canvas.height = Math.round(canvas.width * source.height / source.width);
        const context = canvas.getContext('2d');
        const background = getComputedStyle(source.closest('.study') || document.body).backgroundColor;
        const mimeType = 'video/webm;codecs=vp9';
        if (!MediaRecorder.isTypeSupported(mimeType)) throw new Error('This browser cannot record VP9 previews');
        const stream = canvas.captureStream(0), track = stream.getVideoTracks()[0];
        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4000000 });
        const chunks = [], costs = [];
        const recorded = new Promise((resolve, reject) => {
            recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
            recorder.onerror = reject;
            recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
        });
        const controllers = window.logoStudio.controllers;
        controllers.forEach(controller => { controller.setAutoCycle(false); controller.resume(); });
        const started = Date.now(), frames = Math.round(seconds * 30);
        let transitioned = false;
        recorder.start();
        try {
            for (let frame = 0; frame < frames; frame++) {
                const began = Date.now();
                if (!transitioned && transitionAt !== null && frame / 30 >= transitionAt) {
                    controllers.forEach(controller => controller.next());
                    transitioned = true;
                }
                window.stepLogo(1000 / 30);
                context.fillStyle = background;
                context.fillRect(0, 0, canvas.width, canvas.height);
                context.drawImage(source, 0, 0, canvas.width, canvas.height);
                track.requestFrame();
                costs.push({ frame, atSeconds: frame / 30, milliseconds: Date.now() - began, shape: source.parentElement.dataset.logoShape });
                await new Promise(resolve => setTimeout(resolve, Math.max(0, started + (frame + 1) * 1000 / 30 - Date.now())));
            }
        } finally {
            controllers.forEach(controller => controller.pause());
            recorder.stop();
        }
        const blob = await recorded;
        stream.getTracks().forEach(track => track.stop());
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
        });
        costs.sort((a, b) => a.milliseconds - b.milliseconds);
        return { dataUrl, frames, simulatedSeconds: seconds, wallSeconds: (Date.now() - started) / 1000,
            width: canvas.width, height: canvas.height,
            frameCostMs: { median: costs[Math.floor(costs.length / 2)].milliseconds, p95: costs[Math.floor(costs.length * 0.95)].milliseconds, max: costs.at(-1).milliseconds },
            slowestFrames: costs.slice(-5).reverse() };
    }, { selector, seconds, transitionAt });
    const { dataUrl, ...metadata } = result;
    await writeFile(path, Buffer.from(dataUrl.split(',')[1], 'base64'));
    await writeFile(path.replace(/\.webm$/, '-video.json'), JSON.stringify(metadata, null, 2));
    return metadata;
}
