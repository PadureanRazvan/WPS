import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildActivityLogHtml,
    buildActivityLogStatusHtml
} from '../js/logs-view.js';

const labels = {
    list: 'Recent activity',
    time: 'Time',
    user: 'User',
    type: 'Type',
    action: 'Action',
    details: 'Details'
};

test('activity log groups entries by day and preserves chronological markup', () => {
    const html = buildActivityLogHtml([
        {
            dayKey: '2026-07-15',
            dayLabel: 'Wednesday, 15 July 2026',
            dateTime: '2026-07-15T09:30:00.000Z',
            timeLabel: '12:30',
            user: 'Ana',
            type: 'auth',
            typeLabel: 'Auth',
            action: 'login',
            details: 'source: google'
        },
        {
            dayKey: '2026-07-15',
            dayLabel: 'Wednesday, 15 July 2026',
            timeLabel: '12:20',
            user: 'Maria',
            type: 'portal',
            typeLabel: 'Portal',
            action: 'navigate',
            details: 'section: users'
        }
    ], labels);

    assert.equal((html.match(/activity-day-group/g) || []).length, 1);
    assert.equal((html.match(/<article class="activity-entry-card"/g) || []).length, 2);
    assert.match(html, /<time class="activity-entry-time" datetime="2026-07-15T09:30:00\.000Z">/);
    assert.match(html, /activity-type-badge--auth/);
    assert.match(html, /aria-labelledby="activity-entry-title-0"/);
});

test('activity log escapes untrusted values and constrains unknown type classes', () => {
    const html = buildActivityLogHtml([{
        dayKey: 'unknown',
        dayLabel: '<script>day</script>',
        user: '<img src=x onerror=alert(1)>',
        type: 'bad-type" onclick="alert(1)',
        typeLabel: '<b>Bad</b>',
        action: '<script>action</script>',
        details: 'key: <value>'
    }], labels);

    assert.doesNotMatch(html, /<script>|<img|onclick=/);
    assert.match(html, /activity-type-badge--other/);
    assert.match(html, /&lt;script&gt;action&lt;\/script&gt;/);
    assert.match(html, /key: &lt;value&gt;/);
});

test('activity log status uses a polite status surface and escapes its message', () => {
    const html = buildActivityLogStatusHtml('<strong>Loading</strong>', 'empty');

    assert.match(html, /activity-status--empty/);
    assert.match(html, /role="status"/);
    assert.match(html, /&lt;strong&gt;Loading&lt;\/strong&gt;/);
});
