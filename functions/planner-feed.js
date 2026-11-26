const crypto = require('node:crypto');

const BUCHAREST_TIME_ZONE = 'Europe/Bucharest';
const LEAVE_CODES = ['Co', 'CM', 'LB', 'SL', 'MA', 'DO', 'DC', 'DZ'];
const EXPORT_HEADERS = Object.freeze([
  'Month',
  'Date',
  'Day',
  'Name',
  'Username',
  'Contract Type',
  'Contract Hours',
  'Primary Team',
  'Shop',
  'Planned Hours',
  'Schedule',
  'Note'
]);

const DAY_NAMES_BY_LANG = Object.freeze({
  ro: ['DUM', 'LUN', 'MAR', 'MIE', 'JOI', 'VIN', 'SÂM'],
  en: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
  it: ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB']
});

const MIN_TOKEN_LENGTH = 24;
const MAX_RANGE_DAYS = 366;
const MAX_MONTH_COUNT = 12;

const bucharestDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUCHAREST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

class PlannerFeedError extends Error {
  constructor(status, reason, message) {
    super(message);
    this.name = 'PlannerFeedError';
    this.status = status;
    this.reason = reason;
  }
}

function getDaysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getDayOfWeekFromYmd(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function formatYmd(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatMonthKey(year, month) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

function parseStrictYmd(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  const maxDay = getDaysInMonth(year, month);
  if (day < 1 || day > maxDay) return null;
  return { year, month, day, dateKey: text, monthKey: formatMonthKey(year, month) };
}

function parseStrictMonthKey(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return { year, month, monthKey: text };
}

function getBucharestCalendarToday(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const dateKey = bucharestDateFormatter.format(date);
  return parseStrictYmd(dateKey);
}

function shiftMonth(year, month, delta) {
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    monthKey: formatMonthKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1)
  };
}

function normalizeCalendarDateKey(value) {
  if (!value) return '';

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return parseStrictYmd(trimmed) ? trimmed : '';
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? '' : bucharestDateFormatter.format(parsed);
  }

  let date = null;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value.toDate === 'function') {
    date = value.toDate();
  } else if (typeof value.seconds === 'number') {
    date = new Date(value.seconds * 1000);
  } else if (typeof value._seconds === 'number') {
    date = new Date(value._seconds * 1000);
  } else {
    date = new Date(value);
  }

  if (!date || Number.isNaN(date.getTime())) return '';
  return bucharestDateFormatter.format(date);
}

function normalizeTeamForDisplay(code) {
  if (code === 'SK' || code === 'CZ') return 'CS';
  return code;
}

function isNonWorkingCode(value) {
  const trimmed = String(value || '').trim();
  return !trimmed || LEAVE_CODES.includes(trimmed);
}

function formatPlannerHoursValue(value) {
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value || '').trim());
  if (!Number.isFinite(numericValue)) return '';
  const normalizedValue = Math.round(numericValue * 2) / 2;
  return Number.isInteger(normalizedValue) ? String(normalizedValue) : normalizedValue.toFixed(1);
}

function parseShiftEntry(entry) {
  const p = String(entry || '').trim();
  const plannerHoursPattern = '\\d+(?:\\.5)?';
  const match2L = p.match(new RegExp(`^(${plannerHoursPattern})(2L)$`, 'i'));
  if (match2L) {
    return { hours: parseFloat(match2L[1]), team: match2L[2].toUpperCase() };
  }
  const match = p.match(new RegExp(`^(${plannerHoursPattern})\\s*([A-Za-z-]+)?$`));
  if (match) {
    return { hours: parseFloat(match[1]), team: match[2] ? match[2].toUpperCase() : null };
  }
  return null;
}

function extractHoursFromDay(dayValue) {
  if (!dayValue || typeof dayValue !== 'string') return 0;
  const trimmed = dayValue.trim();
  if (isNonWorkingCode(trimmed)) return 0;
  let total = 0;
  for (const part of trimmed.split('+')) {
    const parsed = parseShiftEntry(part);
    if (parsed) total += parsed.hours;
  }
  return total;
}

function getNormalizedPrimaryTeamHistory(agent) {
  if (!Array.isArray(agent?.primaryTeamHistory)) return [];
  return agent.primaryTeamHistory
    .map(entry => {
      const from = normalizeCalendarDateKey(entry?.from);
      const primaryTeam = String(entry?.primaryTeam || '').trim();
      return from && primaryTeam ? { from, primaryTeam } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.from.localeCompare(b.from));
}

function getEffectivePrimaryTeam(agent, dateKey) {
  const history = getNormalizedPrimaryTeamHistory(agent);
  let effectiveTeam = '';
  for (const entry of history) {
    if (entry.from <= dateKey) {
      effectiveTeam = entry.primaryTeam;
    } else {
      break;
    }
  }
  return effectiveTeam || String(agent?.primaryTeam || '').trim();
}

function getEffectivePrimaryTeamCode(agent, dateKey) {
  return getEffectivePrimaryTeam(agent, dateKey).split(' ')[0]?.toUpperCase() || '';
}

function getPrimaryTeamCode(agent) {
  const primaryTeam = String(agent?.primaryTeam || '').trim();
  if (!primaryTeam) return '';
  return normalizeTeamForDisplay(primaryTeam.split(/\s+/)[0].toUpperCase());
}

function getAgentContractHours(agent) {
  const hours = agent?.contractHours ?? ((agent?.contractType || 'Full-time') === 'Full-time' ? 8 : '');
  return formatPlannerHoursValue(hours);
}

function applyHireDateBoundaryToDays(agent, monthKey, sourceDays = []) {
  const hireDateKey = normalizeCalendarDateKey(agent?.hireDate);
  if (!hireDateKey) return [...sourceDays];

  const parsedMonth = parseStrictMonthKey(monthKey);
  if (!parsedMonth) return [...sourceDays];

  const daysInMonth = getDaysInMonth(parsedMonth.year, parsedMonth.month);
  const monthEndKey = formatYmd(parsedMonth.year, parsedMonth.month, daysInMonth);
  if (monthEndKey < hireDateKey) return [];

  const normalizedDays = [...sourceDays];
  while (normalizedDays.length < 31) normalizedDays.push('');

  if (monthKey === hireDateKey.slice(0, 7)) {
    const hireDay = Number(hireDateKey.slice(8, 10));
    for (let day = 1; day < hireDay; day++) {
      normalizedDays[day - 1] = '';
    }
  }

  for (let day = daysInMonth + 1; day <= 31; day++) {
    normalizedDays[day - 1] = '';
  }

  return normalizedDays;
}

function generateDefaultSchedule(agent, monthKey) {
  const hours = agent.contractHours || 8;
  const parsedMonth = parseStrictMonthKey(monthKey);
  if (!parsedMonth) return [];

  const daysInMonth = getDaysInMonth(parsedMonth.year, parsedMonth.month);
  const hireDateKey = normalizeCalendarDateKey(agent?.hireDate);
  const days = [];

  for (let d = 1; d <= 31; d++) {
    if (d <= daysInMonth) {
      const dateKey = formatYmd(parsedMonth.year, parsedMonth.month, d);
      if (hireDateKey && dateKey < hireDateKey) {
        days.push('');
        continue;
      }
      const dayOfWeek = getDayOfWeekFromYmd(parsedMonth.year, parsedMonth.month, d);
      const teamCode = getEffectivePrimaryTeamCode(agent, dateKey);
      const entry = teamCode ? `${hours}${teamCode}` : `${hours}`;
      days.push(dayOfWeek >= 1 && dayOfWeek <= 5 ? entry : '');
    } else {
      days.push('');
    }
  }
  return days;
}

function getAgentDaysForMonth(agent, monthKey) {
  const hireDateKey = normalizeCalendarDateKey(agent?.hireDate);
  if (hireDateKey && monthKey < hireDateKey.slice(0, 7)) {
    return [];
  }

  if (agent.monthlyDays) {
    if (agent.monthlyDays[monthKey]) {
      return applyHireDateBoundaryToDays(agent, monthKey, agent.monthlyDays[monthKey]);
    }
    if (agent.contractHours && agent.primaryTeam) {
      return applyHireDateBoundaryToDays(agent, monthKey, generateDefaultSchedule(agent, monthKey));
    }
    return [];
  }

  return applyHireDateBoundaryToDays(agent, monthKey, agent.days || []);
}

function isAgentInactiveOnDate(agent, dateKey) {
  if (!agent?.inactiveFrom || agent?.isActive !== false) return false;
  const inactiveFromKey = normalizeCalendarDateKey(agent.inactiveFrom);
  if (!inactiveFromKey) return false;
  const inactiveToKey = agent.inactiveTo ? normalizeCalendarDateKey(agent.inactiveTo) : '';
  return dateKey >= inactiveFromKey && (!inactiveToKey || dateKey <= inactiveToKey);
}

function getEffectiveAgentDayValue(agent, dateEntry) {
  const hireDateKey = normalizeCalendarDateKey(agent?.hireDate);
  if (hireDateKey && dateEntry.dateKey < hireDateKey) {
    return '';
  }
  if (isAgentInactiveOnDate(agent, dateEntry.dateKey)) {
    return 'DZ';
  }
  const daysArray = getAgentDaysForMonth(agent, dateEntry.monthKey);
  return daysArray[dateEntry.day - 1] || '';
}

function getAgentNotesForMonth(agent, monthKey) {
  if (agent.monthlyNotes) {
    return agent.monthlyNotes[monthKey] || {};
  }
  return agent.dayNotes || {};
}

function getCellNote(agent, monthKey, dayIndex, rawValue) {
  const notesForMonth = getAgentNotesForMonth(agent, monthKey);
  const note = notesForMonth[String(dayIndex)];
  if (rawValue === 'DZ' && agent.deactivationNote) {
    return agent.deactivationNote;
  }
  return note || '';
}

function buildScheduleAllocations(schedule, agent) {
  const value = String(schedule || '').trim();
  if (!value) return [];

  if (LEAVE_CODES.includes(value)) {
    return [{ shop: value, plannedHours: '0' }];
  }

  const parts = value.split('+').map(part => part.trim()).filter(Boolean);
  const allocations = parts
    .map(part => parseShiftEntry(part))
    .filter(Boolean)
    .map(parsed => ({
      shop: parsed.team ? normalizeTeamForDisplay(parsed.team) : getPrimaryTeamCode(agent),
      plannedHours: formatPlannerHoursValue(parsed.hours)
    }));

  if (allocations.length > 0) {
    return allocations;
  }

  return [{
    shop: getPrimaryTeamCode(agent),
    plannedHours: formatPlannerHoursValue(extractHoursFromDay(value))
  }];
}

function sortAgentsForExport(agents = []) {
  return [...agents].sort((a, b) =>
    String(a?.fullName || '').localeCompare(String(b?.fullName || ''))
  );
}

function filterAgentsByTeams(agents = [], selectedTeams = []) {
  if (!selectedTeams || selectedTeams.length === 0) return agents;
  const teamSet = new Set(selectedTeams.map(t => String(t).trim().toUpperCase()).filter(Boolean));
  if (teamSet.size === 0 || teamSet.has('ALL')) return agents;
  return agents.filter(agent =>
    Array.isArray(agent?.teams) &&
    agent.teams.some(team => teamSet.has(String(team || '').trim().toUpperCase()))
  );
}

function buildDatesForMonths(monthKeys) {
  const dates = [];
  for (const monthKey of monthKeys) {
    const parsed = parseStrictMonthKey(monthKey);
    if (!parsed) continue;
    const daysInMonth = getDaysInMonth(parsed.year, parsed.month);
    for (let day = 1; day <= daysInMonth; day++) {
      dates.push({
        year: parsed.year,
        month: parsed.month,
        day,
        monthKey,
        dateKey: formatYmd(parsed.year, parsed.month, day),
        dayOfWeek: getDayOfWeekFromYmd(parsed.year, parsed.month, day)
      });
    }
  }
  return dates;
}

function buildDatesForRange(fromParsed, toParsed) {
  const dates = [];
  const startUtc = Date.UTC(fromParsed.year, fromParsed.month - 1, fromParsed.day);
  const endUtc = Date.UTC(toParsed.year, toParsed.month - 1, toParsed.day);
  const totalDays = Math.floor((endUtc - startUtc) / 86_400_000) + 1;
  if (totalDays < 1 || totalDays > MAX_RANGE_DAYS) {
    throw new PlannerFeedError(400, 'INVALID_RANGE', `Date range must be between 1 and ${MAX_RANGE_DAYS} days.`);
  }

  for (let offset = 0; offset < totalDays; offset++) {
    const cursor = new Date(startUtc + offset * 86_400_000);
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const day = cursor.getUTCDate();
    dates.push({
      year,
      month,
      day,
      monthKey: formatMonthKey(year, month),
      dateKey: formatYmd(year, month, day),
      dayOfWeek: cursor.getUTCDay()
    });
  }
  return dates;
}

function firstQueryValue(value) {
  if (Array.isArray(value)) return String(value[0] ?? '').trim();
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function resolveFeedRequest(query = {}, now = new Date()) {
  const monthRaw = firstQueryValue(query.month);
  const fromRaw = firstQueryValue(query.from);
  const toRaw = firstQueryValue(query.to);
  const langRaw = (firstQueryValue(query.lang) || 'ro').toLowerCase();
  const formatRaw = (firstQueryValue(query.format) || 'csv').toLowerCase();
  const teamRaw = firstQueryValue(query.team);
  const freshRaw = firstQueryValue(query.fresh).toLowerCase();

  if (!Object.hasOwn(DAY_NAMES_BY_LANG, langRaw)) {
    throw new PlannerFeedError(400, 'INVALID_LANG', 'Supported languages are ro, en, and it.');
  }
  if (formatRaw !== 'csv' && formatRaw !== 'json') {
    throw new PlannerFeedError(400, 'INVALID_FORMAT', 'Supported formats are csv and json.');
  }
  if (monthRaw && (fromRaw || toRaw)) {
    throw new PlannerFeedError(400, 'AMBIGUOUS_RANGE', 'Use either month or from/to, not both.');
  }

  let dates;
  let label;
  let monthKeys = [];

  if (fromRaw || toRaw) {
    if (!fromRaw || !toRaw) {
      throw new PlannerFeedError(400, 'INVALID_RANGE', 'Both from and to must be provided as YYYY-MM-DD.');
    }
    const fromParsed = parseStrictYmd(fromRaw);
    const toParsed = parseStrictYmd(toRaw);
    if (!fromParsed || !toParsed || fromParsed.dateKey > toParsed.dateKey) {
      throw new PlannerFeedError(400, 'INVALID_RANGE', 'Invalid from/to date range. Expected YYYY-MM-DD with from <= to.');
    }
    dates = buildDatesForRange(fromParsed, toParsed);
    const isSingleFullMonth = fromParsed.monthKey === toParsed.monthKey &&
      fromParsed.day === 1 &&
      toParsed.day === getDaysInMonth(toParsed.year, toParsed.month);
    label = isSingleFullMonth ? fromParsed.monthKey : `${fromParsed.dateKey}-to-${toParsed.dateKey}`;
    monthKeys = [...new Set(dates.map(d => d.monthKey))];
  } else {
    const today = getBucharestCalendarToday(now);
    const tokens = (monthRaw || 'current')
      .split(',')
      .map(part => part.trim().toLowerCase())
      .filter(Boolean);

    if (tokens.length === 0 || tokens.length > MAX_MONTH_COUNT) {
      throw new PlannerFeedError(400, 'INVALID_MONTH', `Provide between 1 and ${MAX_MONTH_COUNT} months.`);
    }

    const resolvedMonths = new Set();
    for (const token of tokens) {
      if (token === 'current') {
        resolvedMonths.add(today.monthKey);
      } else if (token === 'next') {
        resolvedMonths.add(shiftMonth(today.year, today.month, 1).monthKey);
      } else if (token === 'prev' || token === 'previous') {
        resolvedMonths.add(shiftMonth(today.year, today.month, -1).monthKey);
      } else {
        const parsed = parseStrictMonthKey(token);
        if (!parsed) {
          throw new PlannerFeedError(400, 'INVALID_MONTH', 'Month must be YYYY-MM, current, prev, or next.');
        }
        resolvedMonths.add(parsed.monthKey);
      }
    }

    monthKeys = [...resolvedMonths].sort();
    dates = buildDatesForMonths(monthKeys);
    label = monthKeys.length === 1
      ? monthKeys[0]
      : `${dates[0].dateKey}-to-${dates[dates.length - 1].dateKey}`;
  }

  const selectedTeams = teamRaw
    ? teamRaw.split(',').map(part => part.trim().toUpperCase()).filter(Boolean)
    : [];

  return {
    dates,
    monthKeys,
    from: dates[0]?.dateKey || '',
    to: dates[dates.length - 1]?.dateKey || '',
    filename: `planner-${label}.${formatRaw}`,
    lang: langRaw,
    dayNames: DAY_NAMES_BY_LANG[langRaw],
    format: formatRaw,
    selectedTeams,
    bypassCache: freshRaw === '1' || freshRaw === 'true'
  };
}

function buildPlannerExportRows(agents = [], dates = [], options = {}) {
  const dayNames = options.dayNames || DAY_NAMES_BY_LANG.ro;
  const sorted = options.preserveOrder ? [...agents] : sortAgentsForExport(agents);
  const filtered = filterAgentsByTeams(sorted, options.selectedTeams);
  const rows = [];

  for (const agent of filtered) {
    for (const dateEntry of dates) {
      const rawValue = getEffectiveAgentDayValue(agent, dateEntry) || '';
      const note = getCellNote(agent, dateEntry.monthKey, dateEntry.day - 1, rawValue);
      if (!String(rawValue).trim() && !note) continue;

      const allocations = buildScheduleAllocations(rawValue, agent);
      const normalizedAllocations = allocations.length > 0
        ? allocations
        : [{ shop: '', plannedHours: '' }];
      const dayName = dayNames[dateEntry.dayOfWeek] || '';

      for (const allocation of normalizedAllocations) {
        rows.push({
          month: dateEntry.monthKey,
          date: dateEntry.dateKey,
          day: dayName,
          name: agent?.fullName || agent?.name || '',
          username: agent?.username || '',
          contractType: agent?.contractType || '',
          contractHours: getAgentContractHours(agent),
          primaryTeam: agent?.primaryTeam || '',
          shop: allocation.shop || '',
          plannedHours: allocation.plannedHours || '',
          schedule: rawValue,
          note
        });
      }
    }
  }

  return rows;
}

function escapeCsvValue(value) {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildPlannerExportCsv(rows = []) {
  return [
    EXPORT_HEADERS,
    ...rows.map(row => [
      row.month,
      row.date,
      row.day,
      row.name,
      row.username,
      row.contractType,
      row.contractHours,
      row.primaryTeam,
      row.shop,
      row.plannedHours,
      row.schedule,
      row.note
    ])
  ]
    .map(line => line.map(escapeCsvValue).join(','))
    .join('\n');
}

function parseConfiguredTokens(rawSecret) {
  return String(rawSecret || '')
    .split(/[\r\n,]+/)
    .map(token => token.trim())
    .filter(token => token.length >= MIN_TOKEN_LENGTH);
}

function extractPresentedToken(headers = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers || {})) {
    normalized[String(key).toLowerCase()] = Array.isArray(value) ? value[0] : value;
  }

  const direct = String(normalized['x-sherpa-feed-key'] || '').trim();
  if (direct) return direct;

  const authHeader = String(normalized.authorization || '').trim();
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) return bearerMatch[1].trim();

  return '';
}

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest();
}

function verifyFeedToken(presentedToken, validTokens = []) {
  if (!presentedToken || !Array.isArray(validTokens) || validTokens.length === 0) {
    return false;
  }
  const presentedDigest = hashToken(presentedToken);
  let matched = false;
  for (const validToken of validTokens) {
    const candidateDigest = hashToken(validToken);
    if (crypto.timingSafeEqual(presentedDigest, candidateDigest)) {
      matched = true;
    }
  }
  return matched;
}

module.exports = {
  BUCHAREST_TIME_ZONE,
  DAY_NAMES_BY_LANG,
  EXPORT_HEADERS,
  LEAVE_CODES,
  MIN_TOKEN_LENGTH,
  PlannerFeedError,
  buildDatesForMonths,
  buildDatesForRange,
  buildPlannerExportCsv,
  buildPlannerExportRows,
  extractPresentedToken,
  getBucharestCalendarToday,
  normalizeCalendarDateKey,
  parseConfiguredTokens,
  resolveFeedRequest,
  sortAgentsForExport,
  verifyFeedToken
};
