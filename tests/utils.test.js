import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addDays, buildTimeline, dateRange, escapeHtml, formatDate, formatRange, nights,
  normalizeFlightNo, safeUrl, splitDateTime, statusLabel, totalsByCurrency, tripStatus,
} from '../js/utils.js';

test('日期加減與區間（跨月、跨年、閏年）', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.deepEqual(dateRange('2026-11-29', '2026-12-02'), ['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
  assert.deepEqual(dateRange('2026-12-02', '2026-11-29'), []);
  assert.deepEqual(dateRange('', '2026-11-29'), []);
});

test('日期格式化', () => {
  assert.equal(formatDate('2026-11-20'), '11/20（五）');
  assert.equal(formatDate('2026-11-20', { year: true, week: false }), '2026/11/20');
  assert.equal(formatRange('2026-12-30', '2027-01-02'), '2026/12/30（三） – 2027/1/2（六）');
  assert.equal(formatRange('2026-11-20', '2026-11-24'), '2026/11/20（五） – 11/24（二）');
  assert.equal(formatRange('', ''), '尚未設定日期');
});

test('旅程狀態：倒數、進行中、已結束', () => {
  const trip = { startDate: '2026-11-20', endDate: '2026-11-24' };
  assert.deepEqual(tripStatus(trip, '2026-11-04'), { state: 'upcoming', days: 16, total: 5 });
  assert.equal(statusLabel(tripStatus(trip, '2026-11-19')), '明天出發');
  assert.deepEqual(tripStatus(trip, '2026-11-22'), { state: 'ongoing', day: 3, total: 5 });
  assert.equal(tripStatus(trip, '2026-11-24').state, 'ongoing');
  assert.equal(tripStatus(trip, '2026-11-25').state, 'past');
  assert.equal(tripStatus({}, '2026-11-25').state, 'undated');
});

test('住宿晚數', () => {
  assert.equal(nights('2026-11-20', '2026-11-24'), 4);
  assert.equal(nights('2026-11-20', ''), 0);
  assert.equal(nights('2026-11-24', '2026-11-20'), 0);
});

test('花費依幣別加總', () => {
  const totals = totalsByCurrency([
    { price: 15800, currency: 'TWD' },
    { price: 96000, currency: 'jpy' },
    { price: 3250, currency: 'JPY' },
    { price: '', currency: 'JPY' },
    { currency: 'USD' },
  ]);
  assert.deepEqual(totals, { TWD: 15800, JPY: 99250 });
});

test('航班編號與日期時間拆解', () => {
  assert.equal(normalizeFlightNo(' br 198 '), 'BR198');
  assert.deepEqual(splitDateTime('2026-11-20T08:50'), ['2026-11-20', '08:50']);
  assert.deepEqual(splitDateTime(''), ['', '']);
});

test('安全處理：HTML 跳脫與網址白名單', () => {
  assert.equal(escapeHtml('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeUrl('not a url'), '');
});

test('時間軸：依日期排序、跨日抵達、每晚住宿', () => {
  const trip = {
    startDate: '2026-11-20',
    endDate: '2026-11-22',
    flights: [
      { id: 'f1', from: 'TPE', to: 'LAX', departAt: '2026-11-20T23:40', arriveAt: '2026-11-21T19:30' },
    ],
    stays: [
      { id: 's1', name: 'Hotel A', checkIn: '2026-11-21', checkInTime: '21:00', checkOut: '2026-11-22', checkOutTime: '11:00' },
    ],
    plans: [
      { id: 'p1', title: '早餐', date: '2026-11-22', time: '08:00' },
      { id: 'p2', title: '想去的店' },
    ],
  };
  const { days, undated } = buildTimeline(trip);
  assert.deepEqual(days.map((d) => d.date), ['2026-11-20', '2026-11-21', '2026-11-22']);
  assert.deepEqual(days[0].items.map((i) => i.kind), ['flight']);
  assert.deepEqual(days[1].items.map((i) => i.kind), ['arrival', 'checkin']);
  assert.deepEqual(days[2].items.map((i) => i.kind), ['plan', 'checkout']);
  assert.deepEqual(days[1].stays.map((s) => s.id), ['s1']);
  assert.equal(days[2].stays.length, 0);
  assert.deepEqual(undated.map((i) => i.ref.id), ['p2']);
});

test('旅程圖示：新圖示、舊版 emoji 對應、預設飛機', async () => {
  const { tripIconId, tripEmoji } = await import('../js/constants.js');
  assert.equal(tripIconId({ icon: 'torii' }), 'torii');
  assert.equal(tripIconId({ emoji: '🍁' }), 'leaf');
  assert.equal(tripIconId({ emoji: '🗽' }), 'city');
  assert.equal(tripIconId({ icon: '__proto__' }), 'plane');
  assert.equal(tripIconId({}), 'plane');
  assert.equal(tripEmoji({ icon: 'snow' }), '❄️');
});
