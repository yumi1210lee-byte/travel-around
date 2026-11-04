// 資料層：全部存在瀏覽器 localStorage，不會上傳到任何伺服器。
import { uid } from './utils.js';

const STORAGE_KEY = 'travel-around/v1';
const COLLECTIONS = ['flights', 'stays', 'plans', 'checklist'];

const emptyData = () => ({ version: 1, trips: [], settings: { currency: 'TWD', lastBackup: '' } });

const listeners = new Set();
const errorListeners = new Set();

function getStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readRaw() {
  try {
    return getStorage()?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeRaw(text) {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, text);
    return true;
  } catch (err) {
    console.error('儲存失敗', err);
    return false;
  }
}

const cleanList = (value) =>
  Array.isArray(value)
    ? value
        .filter((x) => x && typeof x === 'object')
        .map((x) => ({ ...x, id: x.id ? String(x.id) : uid() }))
    : [];

export function normalizeTrip(trip) {
  const out = {
    ...trip,
    id: trip.id ? String(trip.id) : uid(),
    name: String(trip.name || '').trim() || '未命名旅程',
  };
  for (const key of COLLECTIONS) out[key] = cleanList(trip[key]);
  return out;
}

export function normalize(raw) {
  const data = emptyData();
  if (!raw || typeof raw !== 'object') return data;
  if (raw.settings && typeof raw.settings === 'object') Object.assign(data.settings, raw.settings);
  if (Array.isArray(raw.trips)) {
    data.trips = raw.trips.filter((t) => t && typeof t === 'object').map(normalizeTrip);
  }
  return data;
}

function load() {
  const text = readRaw();
  if (!text) return emptyData();
  try {
    return normalize(JSON.parse(text));
  } catch {
    // 資料壞掉時先備份原文，避免直接覆蓋
    try {
      getStorage()?.setItem(`${STORAGE_KEY}/corrupt-${Date.now()}`, text);
    } catch {
      /* ignore */
    }
    return emptyData();
  }
}

let data = load();

function commit() {
  const ok = writeRaw(JSON.stringify(data));
  if (!ok) errorListeners.forEach((fn) => fn());
  listeners.forEach((fn) => fn());
  return ok;
}

export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const onSaveError = (fn) => errorListeners.add(fn);

/** 新的修改時間：一定比上一次晚（同步用它判斷有沒有新修改） */
function nextStamp(prev) {
  const now = Date.now();
  const last = Date.parse(prev || '') || 0;
  return new Date(Math.max(now, last + 1)).toISOString();
}

export const getData = () => data;
export const getTrip = (id) => data.trips.find((t) => t.id === id) || null;

export function saveTrip(fields) {
  const now = new Date().toISOString();
  const index = data.trips.findIndex((t) => t.id === fields.id);
  let trip;
  if (index >= 0) {
    trip = normalizeTrip({ ...data.trips[index], ...fields, updatedAt: nextStamp(data.trips[index].updatedAt) });
    data.trips[index] = trip;
  } else {
    trip = normalizeTrip({ ...fields, id: uid(), createdAt: now, updatedAt: now });
    data.trips.push(trip);
  }
  commit();
  return trip;
}

export function deleteTrip(id) {
  data.trips = data.trips.filter((t) => t.id !== id);
  commit();
}

export function saveItem(tripId, coll, item) {
  const trip = getTrip(tripId);
  if (!trip || !COLLECTIONS.includes(coll)) return null;
  const list = trip[coll];
  const saved = { ...item, id: item.id || uid() };
  const index = list.findIndex((x) => x.id === saved.id);
  if (index >= 0) list[index] = saved;
  else list.push(saved);
  if (saved.currency) trip.lastCurrency = saved.currency;
  trip.updatedAt = nextStamp(trip.updatedAt);
  commit();
  return saved;
}

export function saveItems(tripId, coll, items) {
  const trip = getTrip(tripId);
  if (!trip || !COLLECTIONS.includes(coll)) return;
  trip[coll].push(...items.map((x) => ({ ...x, id: x.id || uid() })));
  trip.updatedAt = nextStamp(trip.updatedAt);
  commit();
}

export function deleteItem(tripId, coll, itemId) {
  const trip = getTrip(tripId);
  if (!trip || !COLLECTIONS.includes(coll)) return;
  trip[coll] = trip[coll].filter((x) => x.id !== itemId);
  trip.updatedAt = nextStamp(trip.updatedAt);
  commit();
}

export function setChecklist(tripId, list) {
  const trip = getTrip(tripId);
  if (!trip) return;
  trip.checklist = list;
  trip.updatedAt = nextStamp(trip.updatedAt);
  commit();
}

export function toggleCheck(tripId, itemId, done) {
  const trip = getTrip(tripId);
  const item = trip?.checklist.find((x) => x.id === itemId);
  if (!item) return;
  item.done = done;
  commit();
}

export function updateSettings(patch) {
  Object.assign(data.settings, patch);
  commit();
}

export function exportData() {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
}

/** 匯入備份：同 id 的旅程會被檔案內容取代，其他旅程保留 */
export function importData(text) {
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.trips)) throw new Error('不是有效的備份檔');
  const incoming = normalize(parsed).trips;
  let added = 0;
  let updated = 0;
  for (const trip of incoming) {
    const index = data.trips.findIndex((t) => t.id === trip.id);
    if (index >= 0) {
      data.trips[index] = trip;
      updated += 1;
    } else {
      data.trips.push(trip);
      added += 1;
    }
  }
  commit();
  return { added, updated };
}

/**
 * 加入別人分享的旅程。asCopy 時用新的 id（另存一份），
 * 否則沿用分享者的 id，之後收到更新的連結可以直接取代。
 */
export function importTrip(trip, { asCopy = false, follow = null } = {}) {
  const now = new Date().toISOString();
  const incoming = normalizeTrip({
    ...trip,
    id: asCopy || !trip.id ? uid() : trip.id,
    importedAt: now,
    createdAt: now,
    updatedAt: now,
    ...(follow ? { follow } : {}),
  });
  const index = data.trips.findIndex((t) => t.id === incoming.id);
  if (index >= 0) data.trips[index] = incoming;
  else data.trips.push(incoming);
  commit();
  return incoming;
}

/* ── 雲端同步用的中繼資料（不算「修改旅程」，不會更新 updatedAt） ── */

/** 分享者：記錄雲端分享的代碼、選項與同步狀態；傳 null 代表停止分享 */
export function setShareMeta(tripId, share) {
  const trip = getTrip(tripId);
  if (!trip) return;
  if (share) trip.share = share;
  else delete trip.share;
  commit();
}

/** 收到分享的人：記錄追蹤的分享代碼與最後同步狀態；傳 null 代表停止同步 */
export function setFollowMeta(tripId, follow) {
  const trip = getTrip(tripId);
  if (!trip) return;
  if (follow) trip.follow = follow;
  else delete trip.follow;
  commit();
}

/** 用雲端的新版本取代旅程內容；行李清單是自己的，保留本機版本 */
export function applyRemoteTrip(tripId, remote, follow) {
  const index = data.trips.findIndex((t) => t.id === tripId);
  if (index < 0) return null;
  const local = data.trips[index];
  const trip = normalizeTrip({
    ...remote,
    id: local.id,
    checklist: local.checklist.length ? local.checklist : remote.checklist || [],
    importedAt: local.importedAt,
    createdAt: local.createdAt,
    updatedAt: new Date().toISOString(),
    follow,
  });
  data.trips[index] = trip;
  commit();
  return trip;
}

export function clearAll() {
  data = emptyData();
  commit();
}
