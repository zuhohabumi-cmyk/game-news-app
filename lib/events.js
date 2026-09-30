const { request } = require('./core/http');
const { cleanText, normalizeUrl, idFor } = require('./core/news');
const CALENDAR_URL = 'https://partner.steamgames.com/doc/marketing/upcoming_events';
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function dateFrom(text, year, month) {
  const s = cleanText(text).replace(/,/g, '');
  const tokens = s.split(/\s+/);
  const named = tokens.find(t => MONTHS[t.toLowerCase().slice(0, 3)]);
  const numbers = tokens.filter(t => /^\d+$/.test(t)).map(Number);
  const y = numbers.find(n => n > 2000) || year;
  const m = named ? MONTHS[named.toLowerCase().slice(0, 3)] : month;
  const day = numbers.find(n => n <= 31);
  if (!y || !m || !day) return null;
  const date = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date ? date : null;
}
function parseCalendar(html, now = new Date()) {
  const events = [];
  function add(title, start, end, link = CALENDAR_URL) {
    if (!start || !end || start > end) return;
    const today = now.toISOString().slice(0, 10);
    const horizon = new Date(now.getTime() + 180 * 86400000).toISOString().slice(0, 10);
    if (end < today || start > horizon) return;
    events.push({ id: `event-${idFor(title + start)}`, kind: 'event', title, startDate: start, endDate: end,
      dateBasis: 'Steam公式の掲載日付（現地日付）', link: normalizeUrl(link), sourceName: 'Steamworks公式', categories: ['イベント'], fetchedAt: now.toISOString() });
  }
  for (const match of html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)) {
    const heading = cleanText(match[1]);
    const [title, range] = heading.split('|').map(s => s.trim());
    if (!range || !/Sale|Next Fest/.test(title)) continue;
    const parts = range.split(/\s+[-–]\s+/);
    if (parts.length !== 2) continue;
    const year = Number((range.match(/20\d{2}/g) || []).at(-1));
    const start = dateFrom(parts[0], year), month = start ? Number(start.slice(5, 7)) : null;
    const end = dateFrom(parts[1], year, month);
    add(`Steam ${title}`, start, end);
  }
  for (const section of html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>\s*<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const year = Number(cleanText(section[1]).match(/(20\d{2}) Fests/)?.[1]);
    if (!year) continue;
    for (const row of section[2].matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<td>([\s\S]*?)<\/td>/gi)].map(x => x[1]);
      if (cells.length < 2) continue;
      const dates = cells[0].split(/<br\s*\/?\s*>/i);
      if (dates.length !== 2) continue;
      const link = row[1].match(/href="(https:\/\/partner\.steamgames\.com\/doc\/[^\"]+)"/)?.[1];
      add(`Steam ${cleanText(cells[1])}`, dateFrom(dates[0], year), dateFrom(dates[1], year), link);
    }
  }
  return [...new Map(events.map(e => [e.id, e])).values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}
async function fetchEvents({ get = request, now = new Date() } = {}) {
  try {
    const events = parseCalendar(await get(CALENDAR_URL + '?l=english', { json: false }), now);
    if (!events.length) throw new Error('日程なし・形式変更');
    return { events, statuses: [{ id: 'steam-calendar', name: 'Steam公式日程', status: 'ok', count: events.length, fetchedAt: now.toISOString() }] };
  } catch { return { events: [], statuses: [{ id: 'steam-calendar', name: 'Steam公式日程', status: 'error', count: 0, error: '日程取得・解析失敗' }] }; }
}
module.exports = { CALENDAR_URL, dateFrom, parseCalendar, fetchEvents };
