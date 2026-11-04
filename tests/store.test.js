import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

// 用記憶體模擬 localStorage
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const store = await import('../js/store.js');

beforeEach(() => store.clearAll());

test('新增旅程與項目會寫入 localStorage', () => {
  const trip = store.saveTrip({ name: '首爾', startDate: '2026-12-01' });
  store.saveItem(trip.id, 'flights', { flightNo: 'KE692', currency: 'KRW' });
  const saved = JSON.parse(mem.get('travel-around/v1'));
  assert.equal(saved.trips[0].name, '首爾');
  assert.equal(saved.trips[0].flights[0].flightNo, 'KE692');
  assert.ok(saved.trips[0].flights[0].id);
  assert.equal(store.getTrip(trip.id).lastCurrency, 'KRW');
});

test('編輯項目會取代同 id 的資料', () => {
  const trip = store.saveTrip({ name: 'A' });
  const item = store.saveItem(trip.id, 'stays', { name: '舊飯店' });
  store.saveItem(trip.id, 'stays', { ...item, name: '新飯店' });
  assert.deepEqual(store.getTrip(trip.id).stays.map((s) => s.name), ['新飯店']);
});

test('匯出再匯入：同 id 取代、新的新增', () => {
  const a = store.saveTrip({ name: 'A' });
  const backup = store.exportData();
  store.saveTrip({ ...a, name: 'A 改過' });
  store.saveTrip({ name: 'B' });
  const result = store.importData(backup);
  assert.deepEqual(result, { added: 0, updated: 1 });
  assert.deepEqual(store.getData().trips.map((t) => t.name).sort(), ['A', 'B']);
});

test('匯入無效檔案會丟出錯誤且不改資料', () => {
  store.saveTrip({ name: 'A' });
  assert.throws(() => store.importData('{"hello":1}'));
  assert.throws(() => store.importData('not json'));
  assert.equal(store.getData().trips.length, 1);
});

test('normalize 會補齊缺少的欄位', () => {
  const data = store.normalize({ trips: [{ name: '', flights: [null, { flightNo: 'X1' }] }] });
  const [trip] = data.trips;
  assert.equal(trip.name, '未命名旅程');
  assert.equal(trip.flights.length, 1);
  assert.deepEqual(trip.stays, []);
  assert.ok(trip.id && trip.flights[0].id);
});
