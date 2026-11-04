// 雲端（Firebase）存取：匿名登入，以及讀寫 Firestore 的 shares 集合。
// 直接呼叫 Firebase 的 REST API，不需要額外載入 SDK。
//
// 每一份分享是一個文件 shares/{分享代碼}：
//   owner     建立者的匿名帳號 uid（只有他能更新、刪除）
//   data      旅程內容（JSON 字串，已依分享選項隱藏敏感資料）
//   updatedAt 更新時間
//   v         資料格式版本
import { FIREBASE } from './firebase-config.js';

const AUTH_KEY = 'travel-around/auth';
const FIELDS = ['owner', 'data', 'updatedAt', 'v'];

export const cloudEnabled = Boolean(FIREBASE?.apiKey && FIREBASE?.projectId);

const docsUrl = () =>
  `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE.projectId)}/databases/(default)/documents`;

export class CloudError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const MESSAGES = {
  offline: '無法連線，請確認網路',
  'auth-disabled': 'Firebase 還沒啟用「匿名」登入方式',
  forbidden: '沒有權限（請確認 Firestore 安全規則已發布）',
  'not-found': '雲端上找不到這份分享',
  error: '雲端發生錯誤，請稍後再試',
};

function errorCode(status, message) {
  if (/ADMIN_ONLY_OPERATION|OPERATION_NOT_ALLOWED/.test(message)) return 'auth-disabled';
  if (status === 404) return 'not-found';
  if (status === 403 || /PERMISSION_DENIED/.test(message)) return 'forbidden';
  return 'error';
}

async function request(url, { method = 'GET', headers = {}, body } = {}) {
  let res;
  try {
    res = await fetch(url, { method, headers, body, cache: 'no-store' });
  } catch {
    throw new CloudError('offline', MESSAGES.offline);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const raw = json?.error?.message || `HTTP ${res.status}`;
    const code = errorCode(res.status, raw);
    throw new CloudError(code, MESSAGES[code] || raw);
  }
  return json;
}

/* ───────────── 匿名登入 ───────────── */

function loadAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveAuth(auth) {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  } catch {
    /* 存不了就下次重新登入 */
  }
  return auth;
}

let authPromise = null;

/** 取得可用的登入憑證；第一次使用會自動建立匿名帳號，之後沿用同一個 uid */
export function getAuth() {
  const current = loadAuth();
  if (current?.idToken && current.expiresAt - 60_000 > Date.now()) return Promise.resolve(current);
  if (authPromise) return authPromise;
  authPromise = (async () => {
    if (current?.refreshToken) {
      try {
        const r = await request(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE.apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: current.refreshToken }).toString(),
        });
        return saveAuth({
          uid: r.user_id,
          idToken: r.id_token,
          refreshToken: r.refresh_token,
          expiresAt: Date.now() + Number(r.expires_in) * 1000,
        });
      } catch (err) {
        // 沒網路就直接失敗；憑證失效才重新建立帳號
        if (err.code === 'offline') throw err;
      }
    }
    const r = await request(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }),
    });
    return saveAuth({
      uid: r.localId,
      idToken: r.idToken,
      refreshToken: r.refreshToken,
      expiresAt: Date.now() + Number(r.expiresIn) * 1000,
    });
  })().finally(() => {
    authPromise = null;
  });
  return authPromise;
}

/* ───────────── 分享文件 ───────────── */

/** 隨機分享代碼（128 bits），無法被猜到 */
export function newShareId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const isShareId = (id) => /^[\w-]{16,64}$/.test(String(id || ''));

export function parseDoc(doc) {
  const f = doc?.fields || {};
  return {
    data: f.data?.stringValue ?? '',
    owner: f.owner?.stringValue ?? '',
    // 以伺服器記錄的更新時間為準
    updatedAt: doc?.updateTime || f.updatedAt?.timestampValue || '',
  };
}

const docFields = (uid, json) => ({
  owner: { stringValue: uid },
  data: { stringValue: json },
  updatedAt: { timestampValue: new Date().toISOString() },
  v: { integerValue: '1' },
});

const authHeaders = (auth) => ({ Authorization: `Bearer ${auth.idToken}`, 'Content-Type': 'application/json' });

export async function createShare(id, json) {
  const auth = await getAuth();
  const doc = await request(`${docsUrl()}/shares?documentId=${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({ fields: docFields(auth.uid, json) }),
  });
  return parseDoc(doc);
}

export async function updateShare(id, json) {
  const auth = await getAuth();
  const mask = FIELDS.map((f) => `updateMask.fieldPaths=${f}`).join('&');
  const doc = await request(`${docsUrl()}/shares/${encodeURIComponent(id)}?${mask}&currentDocument.exists=true`, {
    method: 'PATCH',
    headers: authHeaders(auth),
    body: JSON.stringify({ fields: docFields(auth.uid, json) }),
  });
  return parseDoc(doc);
}

export async function deleteShare(id) {
  const auth = await getAuth();
  try {
    await request(`${docsUrl()}/shares/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders(auth) });
  } catch (err) {
    if (err.code !== 'not-found') throw err;
  }
}

/** 讀取分享（不需要登入）；不存在時回傳 null */
export async function fetchShare(id) {
  try {
    return parseDoc(await request(`${docsUrl()}/shares/${encodeURIComponent(id)}`));
  } catch (err) {
    if (err.code === 'not-found') return null;
    throw err;
  }
}
