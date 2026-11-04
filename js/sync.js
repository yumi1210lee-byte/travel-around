// 雲端同步流程：
// - 分享者：旅程有修改，就把最新版本（依分享選項隱藏資料）上傳到雲端
// - 收到的人：打開 App 時檢查雲端有沒有新版本，有就更新（唯讀）
import * as cloud from './cloud.js';
import { buildSharedTrip, DEFAULT_SHARE_OPTIONS, sanitizeSharedTrip } from './share.js';
import * as store from './store.js';

const PUSH_DELAY = 1500;
const CHECK_INTERVAL = 30_000;

export const enabled = cloud.cloudEnabled;
export const cloudLink = (shareId, base) => `${base}#/s/${shareId}`;

const listeners = new Set();
export const onUpdate = (fn) => listeners.add(fn);
const emit = (event) => listeners.forEach((fn) => fn(event));

const payloadFor = (trip, opts) =>
  JSON.stringify({ v: 1, trip: buildSharedTrip(trip, opts || trip.share?.opts || DEFAULT_SHARE_OPTIONS) });

const nowIso = () => new Date().toISOString();

const statusOf = (err) =>
  ({ offline: 'offline', forbidden: 'forbidden', 'not-found': 'gone', 'auth-disabled': 'error' })[err?.code] || 'error';

/* ───────────── 分享者 ───────────── */

/** 建立同步分享，回傳分享代碼 */
export async function startSharing(tripId, opts) {
  const trip = store.getTrip(tripId);
  if (!trip) throw new Error('找不到旅程');
  const id = cloud.newShareId();
  await cloud.createShare(id, payloadFor(trip, opts));
  store.setShareMeta(tripId, { id, opts, syncedAt: trip.updatedAt, pushedAt: nowIso(), status: 'ok' });
  return id;
}

/** 停止分享：刪除雲端資料。對方會保留最後一次同步的版本 */
export async function stopSharing(tripId) {
  const trip = store.getTrip(tripId);
  if (!trip?.share) return;
  await cloud.deleteShare(trip.share.id);
  store.setShareMeta(tripId, null);
}

/** 改分享選項（隱藏金額等）後重新上傳 */
export function updateOptions(tripId, opts) {
  const trip = store.getTrip(tripId);
  if (!trip?.share) return;
  store.setShareMeta(tripId, { ...trip.share, opts, syncedAt: null, failedAt: null });
}

const timers = new Map();
const pushing = new Set();

function schedulePush(tripId, delay = PUSH_DELAY) {
  clearTimeout(timers.get(tripId));
  timers.set(
    tripId,
    setTimeout(() => {
      timers.delete(tripId);
      push(tripId);
    }, delay),
  );
}

async function push(tripId) {
  const trip = store.getTrip(tripId);
  if (!trip?.share) return;
  if (pushing.has(tripId)) return schedulePush(tripId);
  pushing.add(tripId);
  const version = trip.updatedAt;
  const optsKey = JSON.stringify(trip.share.opts);
  try {
    await cloud.updateShare(trip.share.id, payloadFor(trip));
    const fresh = store.getTrip(tripId);
    if (fresh?.share && JSON.stringify(fresh.share.opts) === optsKey) {
      store.setShareMeta(tripId, { ...fresh.share, syncedAt: version, pushedAt: nowIso(), status: 'ok', failedAt: null, error: '' });
    }
  } catch (err) {
    const fresh = store.getTrip(tripId);
    if (fresh?.share) {
      // 記下失敗的版本，避免沒網路時一直重試；有新修改或恢復連線時才再試
      store.setShareMeta(tripId, { ...fresh.share, status: statusOf(err), error: err.message, failedAt: version || 'unknown' });
    }
  } finally {
    pushing.delete(tripId);
  }
}

/** 找出有修改還沒上傳的旅程並排程上傳（每次資料變動時呼叫） */
export function checkPending({ retryFailed = false } = {}) {
  if (!enabled) return;
  for (const trip of store.getData().trips) {
    const share = trip.share;
    if (!share || share.syncedAt === trip.updatedAt) continue;
    if (['forbidden', 'gone'].includes(share.status)) continue;
    if (!retryFailed && share.failedAt && share.failedAt === (trip.updatedAt || 'unknown')) continue;
    if (timers.has(trip.id) || pushing.has(trip.id)) continue;
    schedulePush(trip.id);
  }
}

/* ───────────── 收到分享的人 ───────────── */

let checking = null;

/** 檢查追蹤中的旅程有沒有新版本；回傳更新了幾趟 */
export function refreshFollowed({ tripId = null, force = false } = {}) {
  if (!enabled) return Promise.resolve(0);
  if (checking) return checking;
  checking = (async () => {
    let updated = 0;
    const trips = store.getData().trips.filter((t) => t.follow && (!tripId || t.id === tripId));
    for (const trip of trips) {
      const follow = trip.follow;
      if (!force && follow.checkedAt && Date.now() - Date.parse(follow.checkedAt) < CHECK_INTERVAL) continue;
      const checkedAt = nowIso();
      try {
        const doc = await cloud.fetchShare(follow.id);
        if (!doc) {
          store.setFollowMeta(trip.id, { ...follow, status: 'gone', checkedAt });
        } else if (doc.updatedAt !== follow.remoteUpdatedAt) {
          const remote = sanitizeSharedTrip(JSON.parse(doc.data)?.trip);
          const next = store.applyRemoteTrip(trip.id, remote, { ...follow, remoteUpdatedAt: doc.updatedAt, status: 'ok', checkedAt });
          updated += 1;
          emit({ type: 'follow-updated', trip: next });
        } else {
          store.setFollowMeta(trip.id, { ...follow, status: 'ok', checkedAt });
        }
      } catch (err) {
        store.setFollowMeta(trip.id, { ...follow, status: err.code === 'offline' ? 'offline' : 'error', checkedAt });
      }
    }
    return updated;
  })().finally(() => {
    checking = null;
  });
  return checking;
}

/** 讀取一份雲端分享，給「收到分享」的預覽頁使用 */
export async function loadShared(shareId) {
  if (!cloud.isShareId(shareId)) throw new cloud.CloudError('not-found', '連結格式不正確');
  const doc = await cloud.fetchShare(shareId);
  if (!doc) throw new cloud.CloudError('not-found', '這份分享已經停止或不存在');
  return { trip: sanitizeSharedTrip(JSON.parse(doc.data)?.trip), updatedAt: doc.updatedAt };
}
