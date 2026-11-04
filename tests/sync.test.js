import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createFakeFirebase } from './helpers/fake-firebase.js';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const firebase = createFakeFirebase();
globalThis.fetch = firebase.fetch;

const store = await import('../js/store.js');
const sync = await import('../js/sync.js');
const cloud = await import('../js/cloud.js');
const { createSampleTrip } = await import('../js/sample.js');

const AUTH = 'travel-around/auth';
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const remoteTrip = (id) => JSON.parse(firebase.docs.get(id).fields.data.stringValue).trip;

beforeEach(() => {
  store.clearAll();
  firebase.docs.clear();
  mem.delete(AUTH);
});

test('建立同步分享：雲端文件屬於自己的匿名帳號，且依選項隱藏訂位代號', async () => {
  const trip = store.saveTrip(createSampleTrip('2026-11-04'));
  const id = await sync.startSharing(trip.id, { hideSensitive: true, hidePrices: false, includeChecklist: false });
  assert.ok(cloud.isShareId(id));
  const doc = firebase.docs.get(id);
  assert.equal(doc.fields.owner.stringValue, JSON.parse(mem.get(AUTH)).uid);
  const shared = remoteTrip(id);
  assert.equal(shared.name, trip.name);
  assert.equal(shared.flights[0].bookingRef, undefined);
  assert.equal(store.getTrip(trip.id).share.status, 'ok');
});

test('修改旅程後自動上傳最新版本', async () => {
  const trip = store.saveTrip(createSampleTrip('2026-11-04'));
  const id = await sync.startSharing(trip.id, {});
  store.saveItem(trip.id, 'plans', { title: '新加的行程', date: trip.startDate, time: '20:00' });
  sync.checkPending();
  await sleep(1800);
  assert.ok(remoteTrip(id).plans.some((p) => p.title === '新加的行程'));
  const share = store.getTrip(trip.id).share;
  assert.equal(share.syncedAt, store.getTrip(trip.id).updatedAt);
});

test('收到的人：檢查更新會套用新版本，並保留自己的行李清單', async () => {
  const owner = store.saveTrip(createSampleTrip('2026-11-04'));
  const id = await sync.startSharing(owner.id, {});
  const { trip: shared, updatedAt } = await sync.loadShared(id);

  // 模擬另一台手機：把分享的人的旅程刪掉，加入成追蹤中的旅程
  store.deleteTrip(owner.id);
  const mine = store.importTrip(shared, { follow: { id, remoteUpdatedAt: updatedAt, status: 'ok' } });
  store.saveItem(mine.id, 'checklist', { text: '我自己的耳塞', done: true });

  // 分享的人在雲端更新內容
  await cloud.updateShare(id, JSON.stringify({ v: 1, trip: { ...shared, name: '改過的名字', plans: [] } }));
  const updated = await sync.refreshFollowed({ force: true });
  assert.equal(updated, 1);
  const after = store.getTrip(mine.id);
  assert.equal(after.name, '改過的名字');
  assert.equal(after.plans.length, 0);
  assert.deepEqual(after.checklist.map((c) => c.text), ['我自己的耳塞']);
  assert.equal(after.follow.status, 'ok');

  // 沒有變動時不會重複套用
  assert.equal(await sync.refreshFollowed({ force: true }), 0);
});

test('停止分享：雲端資料刪除，收到的人保留最後的版本', async () => {
  const owner = store.saveTrip(createSampleTrip('2026-11-04'));
  const id = await sync.startSharing(owner.id, {});
  const { trip: shared, updatedAt } = await sync.loadShared(id);
  await sync.stopSharing(owner.id);
  assert.equal(firebase.docs.has(id), false);
  assert.equal(store.getTrip(owner.id).share, undefined);

  const mine = store.importTrip({ ...shared, id: 'other' }, { follow: { id, remoteUpdatedAt: updatedAt } });
  await sync.refreshFollowed({ force: true });
  assert.equal(store.getTrip(mine.id).follow.status, 'gone');
  assert.equal(store.getTrip(mine.id).name, shared.name);
  await assert.rejects(sync.loadShared(id), (err) => err.code === 'not-found');
});

test('別台裝置（不同的匿名帳號）不能更新或刪除別人的分享', async () => {
  const trip = store.saveTrip(createSampleTrip('2026-11-04'));
  const id = await sync.startSharing(trip.id, {});
  mem.delete(AUTH); // 換成新的匿名帳號
  await assert.rejects(cloud.updateShare(id, '{}'), (err) => err.code === 'forbidden');
  await assert.rejects(cloud.deleteShare(id), (err) => err.code === 'forbidden');
  assert.ok(firebase.docs.has(id));
});

test('沒有網路時不會一直重試，恢復後才再上傳', async () => {
  const trip = store.saveTrip(createSampleTrip('2026-11-04'));
  const id = await sync.startSharing(trip.id, {});
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new TypeError('Failed to fetch');
  };
  store.saveTrip({ ...store.getTrip(trip.id), name: '離線時改的' });
  sync.checkPending();
  await sleep(1800);
  assert.equal(store.getTrip(trip.id).share.status, 'offline');
  const before = calls;
  sync.checkPending();
  await sleep(1800);
  assert.equal(calls, before, '同一個版本失敗後不應自動重試');

  globalThis.fetch = firebase.fetch;
  sync.checkPending({ retryFailed: true });
  await sleep(1800);
  assert.equal(remoteTrip(id).name, '離線時改的');
  assert.equal(store.getTrip(trip.id).share.status, 'ok');
});
