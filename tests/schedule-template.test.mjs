import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCHEDULE_TEMPLATE_HEADERS,
  buildScheduleTemplateRows,
  buildScheduleTemplateCsv,
  buildScheduleTemplateFilename,
  downloadScheduleCsv
} from '../js/schedule-template.js';

test('SCHEDULE_TEMPLATE_HEADERS keeps the confirmed column order', () => {
  assert.deepEqual(SCHEDULE_TEMPLATE_HEADERS, [
    'month',
    'agent_username',
    'agent_name',
    'date',
    'start_time',
    'end_time',
    'break_minutes',
    'notes'
  ]);
});

test('buildScheduleTemplateRows includes the client examples plus a day-off row', () => {
  const rows = buildScheduleTemplateRows();

  // Client example rows.
  assert.deepEqual(rows[0], {
    month: '2026-06',
    agent_username: 'mpopescu',
    agent_name: 'Maria Popescu',
    date: '2026-06-01',
    start_time: '09:00',
    end_time: '17:00',
    break_minutes: '30',
    notes: ''
  });
  assert.equal(rows[1].agent_username, 'mpopescu');
  assert.equal(rows[1].date, '2026-06-02');
  assert.equal(rows[2].agent_username, 'ionescu');

  // Exactly one day-off row: empty start_time AND end_time.
  const dayOffRows = rows.filter(row => row.start_time === '' && row.end_time === '');
  assert.equal(dayOffRows.length, 1);
  assert.equal(dayOffRows[0].agent_username, 'ionescu');

  // Every row carries the full set of template keys.
  rows.forEach(row => {
    assert.deepEqual(Object.keys(row).sort(), [...SCHEDULE_TEMPLATE_HEADERS].sort());
  });
});

test('buildScheduleTemplateCsv emits the header line then the row fields', () => {
  const csv = buildScheduleTemplateCsv([
    {
      month: '2026-06',
      agent_username: 'mpopescu',
      agent_name: 'Maria Popescu',
      date: '2026-06-01',
      start_time: '09:00',
      end_time: '17:00',
      break_minutes: '30',
      notes: ''
    }
  ]);

  assert.equal(csv, [
    'month,agent_username,agent_name,date,start_time,end_time,break_minutes,notes',
    '2026-06,mpopescu,Maria Popescu,="2026-06-01",09:00,17:00,30,'
  ].join('\n'));
});

test('buildScheduleTemplateCsv text-guards the date column so Excel keeps YYYY-MM-DD', () => {
  const csv = buildScheduleTemplateCsv([
    {
      month: '2026-06',
      agent_username: 'mpopescu',
      agent_name: 'Maria Popescu',
      date: '2026-06-01',
      start_time: '09:00',
      end_time: '17:00',
      break_minutes: '30',
      notes: ''
    }
  ]);
  // The date cell is emitted as an unquoted Excel text formula ="YYYY-MM-DD".
  assert.match(csv.split('\n')[1], /,="2026-06-01",/);
});

test('buildScheduleTemplateCsv escapes commas, quotes, and newlines', () => {
  const csv = buildScheduleTemplateCsv([
    {
      month: '2026-06',
      agent_username: 'ionescu',
      agent_name: 'Ionescu, Andrei',
      date: '2026-06-01',
      start_time: '08:00',
      end_time: '16:00',
      break_minutes: '30',
      notes: 'Needs "cover"\nsecond line'
    }
  ]);

  const lines = csv.split('\n');
  // The header is intact on its own line.
  assert.equal(lines[0], 'month,agent_username,agent_name,date,start_time,end_time,break_minutes,notes');
  // Comma field is quoted; embedded quotes are doubled; the LF stays inside the quoted notes field.
  assert.equal(
    csv,
    [
      'month,agent_username,agent_name,date,start_time,end_time,break_minutes,notes',
      '2026-06,ionescu,"Ionescu, Andrei",="2026-06-01",08:00,16:00,30,"Needs ""cover""\nsecond line"'
    ].join('\n')
  );
});

test('buildScheduleTemplateCsv defaults to the example rows when rows are omitted', () => {
  const csv = buildScheduleTemplateCsv();
  const lines = csv.split('\n');

  assert.equal(lines[0], 'month,agent_username,agent_name,date,start_time,end_time,break_minutes,notes');
  // header + 4 example rows (3 client rows + 1 day-off row).
  assert.equal(lines.length, buildScheduleTemplateRows().length + 1);
  assert.equal(lines[1], '2026-06,mpopescu,Maria Popescu,="2026-06-01",09:00,17:00,30,');
});

test('buildScheduleTemplateFilename uses the month when a YYYY-MM value is given', () => {
  assert.equal(buildScheduleTemplateFilename('2026-06'), 'orar-template-2026-06.csv');
});

test('buildScheduleTemplateFilename falls back to the default name otherwise', () => {
  assert.equal(buildScheduleTemplateFilename(''), 'orar-template.csv');
  assert.equal(buildScheduleTemplateFilename(), 'orar-template.csv');
  assert.equal(buildScheduleTemplateFilename('2026'), 'orar-template.csv');
  assert.equal(buildScheduleTemplateFilename('not-a-month'), 'orar-template.csv');
});

test('downloadScheduleCsv writes a BOM-prefixed blob and clicks a temporary link', () => {
  const calls = [];
  const link = {
    href: '',
    download: '',
    click: () => calls.push(['click']),
    remove: () => calls.push(['remove'])
  };
  const BlobAdapter = function(parts, options) {
    this.parts = parts;
    this.options = options;
  };
  const url = {
    createObjectURL(blob) {
      calls.push(['createObjectURL', blob.parts, blob.options.type]);
      return 'blob:schedule';
    },
    revokeObjectURL(objectUrl) {
      calls.push(['revokeObjectURL', objectUrl]);
    }
  };
  const doc = {
    createElement(tagName) {
      calls.push(['createElement', tagName]);
      return link;
    },
    body: {
      appendChild(value) {
        calls.push(['appendChild', value === link]);
      }
    }
  };

  const csv = buildScheduleTemplateCsv();
  downloadScheduleCsv({
    filename: 'orar-template-2026-06.csv',
    csv,
    doc,
    url,
    BlobAdapter
  });

  // The blob content starts with the UTF-8 BOM and contains the header line.
  const createCall = calls.find(call => call[0] === 'createObjectURL');
  const blobParts = createCall[1];
  assert.equal(blobParts.length, 1);
  assert.equal(blobParts[0].charCodeAt(0), 0xFEFF);
  assert.ok(blobParts[0].startsWith('\uFEFF'));
  assert.ok(
    blobParts[0].includes('month,agent_username,agent_name,date,start_time,end_time,break_minutes,notes')
  );
  assert.equal(createCall[2], 'text/csv;charset=utf-8');

  // The link is configured and clicked.
  assert.equal(link.href, 'blob:schedule');
  assert.equal(link.download, 'orar-template-2026-06.csv');

  assert.deepEqual(calls, [
    ['createObjectURL', [`\uFEFF${csv}`], 'text/csv;charset=utf-8'],
    ['createElement', 'a'],
    ['appendChild', true],
    ['click'],
    ['remove'],
    ['revokeObjectURL', 'blob:schedule']
  ]);
});
