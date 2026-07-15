import test from 'node:test';
import assert from 'node:assert/strict';

import { filterUsersDirectory, getUsersDirectoryTeams } from '../js/users-directory.js';

const users = [
  { id: '1', fullName: 'Tímea Ștefan', username: 'timea.stefan', primaryTeam: 'HU zooplus', contractType: 'Full-time', isActive: true },
  { id: '2', fullName: 'Nicola Rusu', username: 'nicola.rusu', primaryTeam: 'RO zooplus', contractType: 'Part-time', isActive: false },
  { id: '3', fullName: 'Alessia Nemet', username: 'alessia.nemet', primaryTeam: 'IT zooplus', contractType: 'Full-time', isActive: true }
];

test('directory search is case and accent insensitive across identity and team fields', () => {
  assert.deepEqual(
    filterUsersDirectory(users, { query: 'timea stefan' }).map(user => user.id),
    ['1']
  );
  assert.deepEqual(
    filterUsersDirectory(users, { query: 'ro zooplus' }).map(user => user.id),
    ['2']
  );
});

test('directory combines team and status filters without mutating source rows', () => {
  const snapshot = structuredClone(users);
  assert.deepEqual(
    filterUsersDirectory(users, { team: 'IT zooplus', status: 'active' }).map(user => user.id),
    ['3']
  );
  assert.deepEqual(
    filterUsersDirectory(users, { status: 'inactive' }).map(user => user.id),
    ['2']
  );
  assert.deepEqual(users, snapshot);
});

test('directory team filtering tolerates spacing and case drift in stored values', () => {
  const inconsistentUsers = [
    { id: '4', primaryTeam: '  IT zooplus ', isActive: true },
    { id: '5', primaryTeam: 'it ZOOPLUS', isActive: true }
  ];

  assert.deepEqual(
    filterUsersDirectory(inconsistentUsers, { team: 'IT zooplus' }).map(user => user.id),
    ['4', '5']
  );
});

test('directory teams are unique, non-empty and sorted for the native filter', () => {
  assert.deepEqual(
    getUsersDirectoryTeams([...users, { primaryTeam: 'HU zooplus' }, { primaryTeam: ' ' }]),
    ['HU zooplus', 'IT zooplus', 'RO zooplus']
  );
});
