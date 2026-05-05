import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DAILY_GREETINGS,
  applyDailyGreeting,
  getDailyGreetingForDate
} from '../js/daily-greeting.js';

test('daily greetings include a healthy local rotation for each weekday', () => {
  assert.equal(DAILY_GREETINGS.length, 7);

  DAILY_GREETINGS.forEach((messages, weekday) => {
    assert.ok(messages.length >= 8, `weekday ${weekday} needs at least 8 messages`);
    messages.forEach(message => {
      assert.ok(message.length > 12, `message is too short: ${message}`);
      assert.ok(message.length <= 80, `message is too long for the sidebar: ${message}`);
    });
  });
});

test('same weekday does not repeat the same greeting every week', () => {
  const firstTuesday = getDailyGreetingForDate(new Date(2026, 4, 5, 12));
  const nextTuesday = getDailyGreetingForDate(new Date(2026, 4, 12, 12));

  assert.notEqual(firstTuesday, nextTuesday);
  assert.notEqual(firstTuesday, "Tuesday's");
  assert.notEqual(nextTuesday, "Tuesday's");
});

test('applyDailyGreeting updates both login and sidebar text immediately', () => {
  const elements = {
    loginGreeting: { textContent: '', title: '' },
    sidebarGreeting: { textContent: '', title: '' }
  };
  const root = {
    getElementById(id) {
      return elements[id] || null;
    }
  };

  const message = applyDailyGreeting(root, new Date(2026, 4, 5, 12));

  assert.equal(elements.loginGreeting.textContent, message);
  assert.equal(elements.sidebarGreeting.textContent, message);
  assert.equal(elements.loginGreeting.title, message);
  assert.equal(elements.sidebarGreeting.title, message);
});
