import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const usersSource = await readFile(new URL('../js/users.js', import.meta.url), 'utf8');
const configSource = await readFile(new URL('../js/config.js', import.meta.url), 'utf8');
const componentsSource = await readFile(new URL('../css/components.css', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');
const uiSource = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');

test('users directory exposes searchable and filterable controls with a live result count', () => {
  assert.match(indexSource, /type="search"[^>]*id="usersSearchInput"/);
  assert.match(indexSource, /id="usersTeamFilter"/);
  assert.match(indexSource, /id="usersStatusFilter"[^>]*role="group"/);
  assert.match(indexSource, /id="usersResultCount"[^>]*aria-live="polite"/);
  assert.match(usersSource, /filterUsersDirectory\(usersData, usersDirectoryState\)/);
  assert.match(usersSource, /usersDirectoryState\.query\s*=\s*searchInput\.value/);
  assert.match(usersSource, /usersDirectoryState\.team\s*=\s*teamFilter\.value/);
  assert.match(usersSource, /usersDirectoryState\.status\s*=\s*button\.dataset\.usersStatus/);
  assert.match(mainSource, /from '\.\/users\.js\?v=2026\.07\.15\.15'/);
  assert.match(uiSource, /from '\.\/users\.js\?v=2026\.07\.15\.15'/);
  assert.match(usersSource, /from '\.\/ui\.js\?v=2026\.07\.15\.15'/);
  assert.match(usersSource, /from '\.\/users-directory\.js\?v=2026\.07\.15\.15'/);
});

test('users directory translations cover controls, counts and empty states in every language', () => {
  for (const key of [
    'users-search-placeholder',
    'users-team-all',
    'users-status-all',
    'users-results',
    'users-empty'
  ]) {
    assert.equal(configSource.split(`'${key}'`).length - 1, 3);
  }
});

test('narrow users work areas become readable roster rows through a named container query', () => {
  assert.match(componentsSource, /\.users-content\s*\{[^}]*container:\s*users-directory\s*\/\s*inline-size/s);
  assert.match(componentsSource, /@container users-directory \(max-width:\s*980px\)[\s\S]*?\.users-directory-tools\s*\{[^}]*grid-row:\s*2/s);
  assert.match(componentsSource, /@container users-directory \(max-width:\s*860px\)/);
  assert.match(componentsSource, /grid-template-areas:[^;]*"name status"[^;]*"team team"[^;]*"contract hours"[^;]*"actions actions"/s);
  assert.match(usersSource, /data-mobile-label="\$\{t\('primary-team'\)\}"/);
});

test('desktop users table gives identity and team fields deliberate widths with wrapping headers', () => {
  assert.match(componentsSource, /#usersTable th\s*\{[^}]*white-space:\s*normal[^}]*text-wrap:\s*balance/s);
  assert.match(componentsSource, /#usersTable th:nth-child\(1\)\s*\{\s*width:\s*15%/);
  assert.match(componentsSource, /#usersTable th:nth-child\(5\)\s*\{\s*width:\s*15%/);
});

test('roster controls keep minimum touch dimensions and honor reduced-motion globally', () => {
  assert.match(componentsSource, /\.users-controls > \.btn\s*\{[^}]*min-height:\s*42px/s);
  assert.match(componentsSource, /#usersTable \.btn-status,[\s\S]*?#usersTable \.delete-btn\s*\{[^}]*min-height:\s*36px/s);
  assert.match(componentsSource, /tr:not\(\.users-empty-row\):nth-child\(-n\+12\)\s*\{[^}]*animation:\s*users-roster-enter/s);
});
