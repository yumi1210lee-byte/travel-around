// 純函式工具：日期、格式化、時間軸整理。不碰 DOM，方便用 Node 測試。

const pad = (n) => String(n).padStart(2, '0');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;
const MAX_RANGE_DAYS = 366;

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

export function isDate(str) {
  return typeof str === 'string' && DATE_RE.test(str);
}

function toUTC(str) {
  const [y, m, d] = str.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 裝置當地的日期字串 YYYY-MM-DD */
export function toDateStr(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 裝置當地的日期時間字串 YYYY-MM-DDTHH:mm（與 datetime-local 欄位同格式） */
export function nowLocal(date = new Date()) {
  return `${toDateStr(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function diffDays(from, to) {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}

export function addDays(str, n) {
  return fromUTC(toUTC(str) + n * DAY_MS);
}

export function dateRange(start, end) {
  if (!isDate(start) || !isDate(end) || end < start) return [];
  const count = Math.min(diffDays(start, end), MAX_RANGE_DAYS);
  return Array.from({ length: count + 1 }, (_, i) => addDays(start, i));
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
export function weekday(str) {
  return WEEKDAYS[new Date(toUTC(str)).getUTCDay()];
}

export function formatDate(str, { year = false, week = true } = {}) {
  if (!isDate(str)) return '';
  const [y, m, d] = str.split('-').map(Number);
  const base = year ? `${y}/${m}/${d}` : `${m}/${d}`;
  return week ? `${base}（${weekday(str)}）` : base;
}

export function formatRange(start, end) {
  if (!isDate(start)) return '尚未設定日期';
  if (!isDate(end) || end <= start) return formatDate(start, { year: true });
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatDate(start, { year: true })} – ${formatDate(end, { year: !sameYear })}`;
}

/** 'YYYY-MM-DDTHH:mm' → ['YYYY-MM-DD', 'HH:mm'] */
export function splitDateTime(dt) {
  if (typeof dt !== 'string') return ['', ''];
  const [date = '', time = ''] = dt.split('T');
  return [isDate(date) ? date : '', time.slice(0, 5)];
}

export function tripStatus(trip, today = toDateStr()) {
  const start = trip.startDate;
  if (!isDate(start)) return { state: 'undated' };
  const end = isDate(trip.endDate) && trip.endDate >= start ? trip.endDate : start;
  const total = diffDays(start, end) + 1;
  if (today < start) return { state: 'upcoming', days: diffDays(today, start), total };
  if (today > end) return { state: 'past', total };
  return { state: 'ongoing', day: diffDays(start, today) + 1, total };
}

export function statusLabel(status) {
  switch (status.state) {
    case 'upcoming':
      return status.days === 1 ? '明天出發' : `還有 ${status.days} 天`;
    case 'ongoing':
      return `旅行中・第 ${status.day} 天`;
    case 'past':
      return '已結束';
    default:
      return '未定日期';
  }
}

export function nights(checkIn, checkOut) {
  if (!isDate(checkIn) || !isDate(checkOut)) return 0;
  return Math.max(0, diffDays(checkIn, checkOut));
}

/** 把有填價格的項目依幣別加總：{ JPY: 120000, TWD: 15800 } */
export function totalsByCurrency(items) {
  const totals = {};
  for (const item of items) {
    if (item.price === '' || item.price == null) continue;
    const amount = Number(item.price);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const currency = String(item.currency || '').trim().toUpperCase() || '—';
    totals[currency] = (totals[currency] || 0) + amount;
  }
  return totals;
}

const numberFmt = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 });
export function formatMoney(amount, currency) {
  const cur = String(currency || '').trim().toUpperCase();
  const num = numberFmt.format(Number(amount) || 0);
  return cur ? `${cur} ${num}` : num;
}

export function normalizeFlightNo(no) {
  return String(no || '').replace(/\s+/g, '').toUpperCase();
}

/** 只允許 http(s) 連結，避免 javascript: 之類的網址 */
export function safeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

export function mapsUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function flightStatusUrl(flightNo) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${flightNo} flight status`)}`;
}

export function flightradarUrl(flightNo) {
  return `https://www.flightradar24.com/data/flights/${encodeURIComponent(flightNo.toLowerCase())}`;
}

const byKey = (key) => (a, b) => (key(a) || '￿').localeCompare(key(b) || '￿');
export const sortFlights = (list) => [...list].sort(byKey((f) => f.departAt));
export const sortStays = (list) => [...list].sort(byKey((s) => s.checkIn));
export const sortPlans = (list) =>
  [...list].sort(byKey((p) => (p.date ? `${p.date}T${p.time || '99:99'}` : '')));

/** 今晚住的地方（checkIn <= 今天 < checkOut） */
export function stayOnNight(stays, date) {
  return stays.filter(
    (s) => isDate(s.checkIn) && isDate(s.checkOut) && s.checkIn <= date && date < s.checkOut,
  );
}

const KIND_ORDER = { checkout: 0, flight: 1, arrival: 1, plan: 2, checkin: 3 };

/**
 * 把航班、住宿、行程依日期整理成時間軸。
 * 回傳 { days: [{ date, items, stays }], undated: [...] }
 */
export function buildTimeline(trip) {
  const days = new Map();
  const undated = [];
  const ensure = (date) => {
    if (!days.has(date)) days.set(date, { date, items: [], stays: [] });
    return days.get(date);
  };
  const push = (date, entry) => (isDate(date) ? ensure(date).items.push(entry) : undated.push(entry));

  for (const date of dateRange(trip.startDate, trip.endDate)) ensure(date);

  for (const f of trip.flights || []) {
    const [depDate, depTime] = splitDateTime(f.departAt);
    const [arrDate, arrTime] = splitDateTime(f.arriveAt);
    push(depDate, { kind: 'flight', coll: 'flights', time: depTime, ref: f });
    if (arrDate && depDate && arrDate !== depDate) {
      push(arrDate, { kind: 'arrival', coll: 'flights', time: arrTime, ref: f });
    }
  }
  for (const s of trip.stays || []) {
    push(s.checkIn, { kind: 'checkin', coll: 'stays', time: s.checkInTime || '', ref: s });
    if (isDate(s.checkOut) && isDate(s.checkIn)) {
      push(s.checkOut, { kind: 'checkout', coll: 'stays', time: s.checkOutTime || '', ref: s });
    }
  }
  for (const p of trip.plans || []) {
    push(p.date, { kind: 'plan', coll: 'plans', time: p.time || '', ref: p });
  }

  const sorted = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const day of sorted) {
    day.stays = stayOnNight(trip.stays || [], day.date);
    day.items.sort(
      (a, b) =>
        (a.time || '99:99').localeCompare(b.time || '99:99') || KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
    );
  }
  return { days: sorted, undated };
}
