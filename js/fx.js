// 匯率：向公開 API 取得最新匯率（以 USD 為基準），並快取在 localStorage 供離線使用。
// 依序嘗試多個來源，第一個失敗就換下一個。

const STORAGE_KEY = 'travel-around/fx';
const STALE_MS = 5 * 60 * 1000; // 超過 5 分鐘就重新抓
const RETRY_MS = 60 * 1000; // 失敗後至少隔 1 分鐘才自動重試
const TIMEOUT_MS = 8000;

export const SOURCES = [
  {
    id: 'coinbase',
    name: 'Coinbase',
    live: true,
    link: 'https://www.coinbase.com/',
    url: 'https://api.coinbase.com/v2/exchange-rates?currency=USD',
    parse: (json, now) => ({ rates: cleanRates(json?.data?.rates), updatedAt: now }),
  },
  {
    id: 'erapi',
    name: 'ExchangeRate-API',
    live: false,
    link: 'https://www.exchangerate-api.com',
    url: 'https://open.er-api.com/v6/latest/USD',
    parse: (json) => {
      if (json?.result !== 'success') throw new Error('ExchangeRate-API 回應失敗');
      return { rates: cleanRates(json.rates), updatedAt: Number(json.time_last_update_unix) * 1000 };
    },
  },
  {
    id: 'currency-api',
    name: 'Currency API',
    live: false,
    link: 'https://github.com/fawazahmed0/exchange-api',
    url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    parse: (json) => ({ rates: cleanRates(json?.usd), updatedAt: Date.parse(`${json?.date}T00:00:00Z`) }),
  },
];

/** 把 API 回傳的匯率整理成 { 'JPY': 150.2, ... }（大寫代碼、正數） */
export function cleanRates(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw)) {
    const code = key.toUpperCase();
    const n = Number(value);
    if (/^[A-Z]{3}$/.test(code) && Number.isFinite(n) && n > 0) out[code] = n;
  }
  if (Object.keys(out).length) out.USD = 1;
  return out;
}

/** 用 USD 基準的匯率表換算：amount 個 from → 多少 to */
export function convert(amount, from, to, rates) {
  if (!rates || !rates[from] || !rates[to] || !Number.isFinite(amount)) return NaN;
  return (amount / rates[from]) * rates[to];
}

/* ───────────── 狀態 ───────────── */

const listeners = new Set();
let state = { rates: null, updatedAt: 0, fetchedAt: 0, source: '', status: 'idle' };
let inflight = null;
let lastAttempt = 0;

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

try {
  const cached = JSON.parse(storage()?.getItem(STORAGE_KEY) || 'null');
  if (cached?.rates && Object.keys(cached.rates).length) state = { ...state, ...cached, status: 'cached' };
} catch {
  /* 快取壞掉就忽略 */
}

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

export const subscribe = (fn) => listeners.add(fn);
export const getFx = () => state;
export const sourceInfo = (id) => SOURCES.find((s) => s.id === id) || null;

async function fetchJson(url, fetchImpl) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { cache: 'no-store', signal: controller?.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 取得最新匯率。資料還新鮮（5 分鐘內）就不重抓，除非 force。
 * 全部來源都失敗時保留舊的快取，status 設為 'error'。
 */
export function refresh({ force = false, fetchImpl = globalThis.fetch?.bind(globalThis), now = Date.now } = {}) {
  if (inflight) return inflight;
  if (!fetchImpl) return Promise.resolve(state);
  if (!force) {
    if (state.fetchedAt && now() - state.fetchedAt < STALE_MS) return Promise.resolve(state);
    if (lastAttempt && now() - lastAttempt < RETRY_MS) return Promise.resolve(state);
  }
  lastAttempt = now();

  setState({ status: 'loading' });
  inflight = (async () => {
    for (const source of SOURCES) {
      try {
        const json = await fetchJson(source.url, fetchImpl);
        const { rates, updatedAt } = source.parse(json, now());
        // 至少要有常用幣別才算有效
        if (Object.keys(rates).length < 20 || !rates.TWD || !rates.JPY) throw new Error('匯率資料不完整');
        const next = {
          rates,
          updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : now(),
          fetchedAt: now(),
          source: source.id,
        };
        try {
          storage()?.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* 存不了也沒關係，這次還是能用 */
        }
        setState({ ...next, status: 'ok' });
        return state;
      } catch (err) {
        console.warn(`匯率來源 ${source.name} 失敗：`, err?.message || err);
      }
    }
    setState({ status: 'error' });
    return state;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
