import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSampleTrip } from '../js/sample.js';
import {
  buildSharedTrip, decodeTrip, encodeTrip, extractPayload, extractShareRoute, sanitizeSharedTrip, shareText, shareUrl,
} from '../js/share.js';
import { normalizeTrip } from '../js/store.js';

const trip = normalizeTrip({ ...createSampleTrip('2026-11-04'), id: 'abc123' });

test('預設會隱藏訂位代號、訂房編號與訂房連結，但保留其他資訊', () => {
  const shared = buildSharedTrip(trip);
  assert.equal(shared.id, 'abc123');
  assert.equal(shared.flights[0].bookingRef, undefined);
  assert.equal(shared.stays[0].confirmation, undefined);
  assert.equal(shared.stays[0].url, undefined);
  assert.equal(shared.flights[0].seat, '32A');
  assert.equal(shared.stays[0].address, '東京都新宿區西新宿 2-8-1');
  assert.equal(shared.flights[0].price, 15800);
  assert.deepEqual(shared.checklist, []);
  assert.equal(shared.flights[0].id, undefined, '項目 id 不需要放進連結');
});

test('選項：隱藏金額、包含清單、顯示敏感資料', () => {
  const shared = buildSharedTrip(trip, { hideSensitive: false, hidePrices: true, includeChecklist: true });
  assert.equal(shared.flights[0].bookingRef, 'ABC123');
  assert.equal(shared.flights[0].price, undefined);
  assert.equal(shared.stays[0].currency, undefined);
  assert.equal(shared.checklist.length, 6);
  assert.deepEqual(Object.keys(shared.checklist[0]), ['text']);
});

test('連結編碼後可以完整還原，且長度合理', async () => {
  const shared = buildSharedTrip(trip);
  const payload = await encodeTrip(shared);
  assert.match(payload, /^v1\.[\w-]+$/);
  const url = shareUrl(payload, 'https://example.github.io/travel-around/');
  assert.ok(url.length < 3000, `連結太長：${url.length}`);
  const back = await decodeTrip(extractPayload(url));
  assert.equal(back.name, trip.name);
  assert.equal(back.flights.length, 2);
  assert.equal(back.plans.length, 10);
  assert.equal(back.stays[0].checkIn, trip.stays[0].checkIn);
});

test('從整段訊息中找出分享代碼', () => {
  assert.equal(extractPayload('看這個！https://x.io/a/#/share/v1.AbC-_9 好玩'), 'v1.AbC-_9');
  assert.equal(extractPayload(' v1.AbC '), 'v1.AbC');
  assert.equal(extractPayload('https://x.io/#/trip/123'), '');
});

test('收到的資料會被清理：未知欄位與奇怪的值都丟掉', () => {
  const clean = sanitizeSharedTrip({
    id: '../../evil',
    name: '測試',
    evil: '<script>',
    flights: [{ flightNo: 'BR1', price: 'abc', onclick: 'x' }],
    plans: [{ title: 'A', category: '__proto__' }, { notitle: true }],
    stays: [{ name: { nested: 1 } }],
    checklist: [{ text: '護照', done: true }],
  });
  assert.equal(clean.id, undefined);
  assert.equal(clean.evil, undefined);
  assert.deepEqual(clean.flights, [{ flightNo: 'BR1' }]);
  assert.deepEqual(clean.plans, [{ title: 'A', category: 'other' }]);
  assert.deepEqual(clean.stays, []);
  assert.deepEqual(clean.checklist, [{ text: '護照', done: false }]);
  assert.throws(() => sanitizeSharedTrip({ flights: [] }));
});

test('壞掉的連結會丟出錯誤', async () => {
  await assert.rejects(decodeTrip('v1.!!!'));
  await assert.rejects(decodeTrip('v1.AAAA'));
  await assert.rejects(decodeTrip('hello'));
});

test('文字版行程：包含重點、依選項隱藏敏感資料', () => {
  const text = shareText(trip);
  assert.match(text, /🍁 東京賞楓 5 日（範例）/);
  assert.match(text, /BR198 長榮航空/);
  assert.match(text, /TPE 08:50 → NRT 13:15/);
  assert.match(text, /4 晚/);
  assert.match(text, /Day 2・11\/19（四）/);
  assert.doesNotMatch(text, /ABC123|HTL-889900/);
  const full = shareText(trip, { hideSensitive: false, hidePrices: false, includeChecklist: true });
  assert.match(full, /訂位代號 ABC123/);
  assert.match(full, /☐ 日幣現金/);
  const noPrice = shareText(trip, { hideSensitive: true, hidePrices: true, includeChecklist: false });
  assert.doesNotMatch(noPrice, /TWD|JPY/);
});

test('貼上的文字可以辨識一次性連結與同步連結', () => {
  assert.equal(extractShareRoute('https://x.io/#/share/v1.AbC'), '#/share/v1.AbC');
  assert.equal(extractShareRoute('來加入！https://x.io/travel-around/#/s/Qx8_a-Zt3kLmNoPq12Rs3w 謝謝'), '#/s/Qx8_a-Zt3kLmNoPq12Rs3w');
  assert.equal(extractShareRoute('https://x.io/#/s/short'), '');
  assert.equal(extractShareRoute('hello'), '');
});

test('成員：預設只分享名字與備註，電話與護照英文姓名會隱藏', () => {
  const shared = buildSharedTrip(trip);
  assert.deepEqual(shared.members.map((m) => m.name), ['小美', '阿哲']);
  assert.equal(shared.members[0].phone, undefined);
  assert.equal(shared.members[0].englishName, undefined);
  assert.equal(shared.members[0].notes, '不吃牛肉');
  const full = buildSharedTrip(trip, { hideSensitive: false, hidePrices: false, includeChecklist: false });
  assert.equal(full.members[0].englishName, 'WANG XIAO-MEI');
  assert.match(shareText(trip), /👥 小美、阿哲/);
  assert.deepEqual(sanitizeSharedTrip({ name: 'x', members: [{ name: '' }, { name: 'A', evil: 1 }] }).members, [{ name: 'A' }]);
});
