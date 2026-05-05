export const DAILY_GREETINGS = [
    [
        'Sunday: soft reset, clear head, easy pace.',
        'Sunday energy: tidy thoughts and gentle wins.',
        'Sunday says: rest is also good planning.',
        'Quiet Sunday, clean slate, steady heart.',
        'Sunday mode: recharge first, conquer later.',
        'Let Sunday be light and the week be kind.',
        'Sunday checkpoint: breathe, reset, begin again.',
        'A calm Sunday makes room for a sharper week.',
        'Sunday is for patience, tea, and tiny plans.',
        'Keep Sunday simple; tomorrow can wait.'
    ],
    [
        'Monday: start small, then let momentum brag.',
        'Monday is loud; your focus can be louder.',
        'New week, same magic, better coffee.',
        'Monday plan: one clear win at a time.',
        'Fresh week, steady hands, brave little steps.',
        'Monday courage counts double before noon.',
        'Start where you are; Monday will catch up.',
        'Monday: sharpen the list, soften the pressure.',
        'Today only needs your next good move.',
        'Monday sparkle is mostly discipline in disguise.'
    ],
    [
        'Tuesday: steady pace, sharp mind, no drama.',
        'Tuesday is for quiet wins that add up.',
        'Keep Tuesday light; let the numbers behave.',
        'Tuesday focus: less noise, more tiny victories.',
        'You are already doing Tuesday better than Tuesday.',
        'Tuesday says: progress can be beautifully boring.',
        'Small Tuesday wins still count as wins.',
        'Tuesday rhythm: sip, solve, repeat.',
        'Let Tuesday be calm and oddly productive.',
        'Tuesday has range, and so do you.'
    ],
    [
        'Wednesday: half the hill, twice the confidence.',
        'Midweek magic: tidy queue, clear mind.',
        'Wednesday is proof the week can be handled.',
        'Keep Wednesday crisp and your tabs under control.',
        'Wednesday wisdom: fewer fires, better filters.',
        'The week bends nicely when Wednesday behaves.',
        'Wednesday: keep the pace, lose the pressure.',
        'Midweek note: your effort is not invisible.',
        'Wednesday wins are best served calmly.',
        'You made it to the middle with style.'
    ],
    [
        'Thursday: almost there, still classy.',
        'Thursday has Friday in the distance; keep cruising.',
        'Thursday strategy: finish clean, panic never.',
        'Strong Thursday, soft shoulders, sharp choices.',
        'Thursday is for closing loops like a pro.',
        'Almost Friday, but today still gets respect.',
        'Thursday focus: polish the important bits.',
        'Let Thursday be productive without being dramatic.',
        'Thursday knows you are closer than you think.',
        'One tidy Thursday win changes the whole week.'
    ],
    [
        'Friday: finish bright, leave lighter.',
        'Friday energy: quick wins and clean handoffs.',
        'Friday says: wrap it well, then exhale.',
        'The week survived you beautifully.',
        'Friday focus: clear the deck, keep the smile.',
        'Make Friday neat enough for Monday to thank you.',
        'Friday is a mood, but so is competence.',
        'End the week with grace and fewer tabs.',
        'Friday sparkle: solved tickets and lighter shoulders.',
        'Today deserves a clean finish and a good playlist.'
    ],
    [
        'Saturday crew: calm hands, strong coffee.',
        'Saturday shift, but make it smooth.',
        'Weekend focus: fewer worries, cleaner wins.',
        'Saturday says: steady work still shines.',
        'Keep Saturday kind, quick, and quietly brilliant.',
        'Saturday mode: simple tasks, solid rhythm.',
        'Weekend work counts, and so does your calm.',
        'Let Saturday be productive without stealing your joy.',
        'Saturday wins hit different when they are tidy.',
        'Quiet Saturday, capable you, clean finish.'
    ]
];

function normalizeDate(date) {
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
}

function getWeekRotation(date, count) {
    const safeDate = normalizeDate(date);
    const utcDay = Date.UTC(safeDate.getFullYear(), safeDate.getMonth(), safeDate.getDate());
    const daysSinceEpoch = Math.floor(utcDay / 86400000);
    return Math.abs(Math.floor(daysSinceEpoch / 7)) % count;
}

export function getDailyGreetingForDate(date = new Date()) {
    const safeDate = normalizeDate(date);
    const messages = DAILY_GREETINGS[safeDate.getDay()];
    return messages[getWeekRotation(safeDate, messages.length)];
}

export function applyDailyGreeting(root = globalThis.document, date = new Date()) {
    const message = getDailyGreetingForDate(date);
    ['loginGreeting', 'sidebarGreeting'].forEach(id => {
        const element = root?.getElementById?.(id);
        if (!element) return;
        element.textContent = message;
        element.title = message;
    });
    return message;
}
