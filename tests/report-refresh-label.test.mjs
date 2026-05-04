import assert from 'node:assert/strict';
import { test } from 'node:test';

import { translations } from '../js/config.js';

test('reports refresh label is translated for every supported language', () => {
  assert.equal(translations.ro['reports-refresh'], 'Reîmprospătează');
  assert.equal(translations.en['reports-refresh'], 'Refresh');
  assert.equal(translations.it['reports-refresh'], 'Aggiorna');
});
