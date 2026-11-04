import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanRates, convert, getFx, refresh } from '../js/fx.js';
import { formatAmount, parseAmount, quickAmounts } from '../js/fxview.js';

const RATES = {
  USD: 1, TWD: 32.4, JPY: 151.8, KRW: 1385, EUR: 0.92, HKD: 7.78, CNY: 7.12, THB: 34.6, SGD: 1.33, MYR: 4.45,
  VND: 25300, PHP: 57.9, IDR: 15800, GBP: 0.78, AUD: 1.52, NZD: 1.66, CAD: 1.38, CHF: 0.87, MOP: 8.02, INR: 84.1,
};
const asStrings = Object.fromEntries(Object.entries(RATES).map(([k, v]) => [k, String(v)]));

/** 假的 fetch：依網址回傳設定好的結果 */
function fakeFetch(routes, calls) {
  return async (url) => {
    const host = new URL(url).hostname;
    calls.push(host);
    const body = routes[host];
    if (!body) throw new Error('network down');
    return { ok: true, status: 200, json: async () => body };
  };
}

test('cleanRates：字串轉數字、代碼轉大寫、丟掉無效值', () => {
  assert.deepEqual(cleanRates({ twd: '32.4', JPY: 151.8, BAD: 'x', ZERO: 0, ab: 1 }), { TWD: 32.4, JPY: 151.8, USD: 1 });
  assert.deepEqual(cleanRates(null), {});
});

test('convert：透過 USD 交叉換算', () => {
  assert.equal(Math.round(convert(1000, 'JPY', 'TWD', RATES) * 100) / 100, 213.44);
  assert.equal(convert(1, 'TWD', 'TWD', RATES), 1);
  assert.ok(Number.isNaN(convert(1, 'XXX', 'TWD', RATES)));
  assert.ok(Number.isNaN(convert(1, 'JPY', 'TWD', null)));
});

test('金額格式與解析', () => {
  assert.equal(formatAmount(213.44, 'TWD'), '213');
  assert.equal(formatAmount(21.344, 'TWD'), '21.34');
  assert.equal(formatAmount(1234.567, 'USD'), '1,234.57');
  assert.equal(formatAmount(NaN, 'USD'), '');
  assert.equal(parseAmount('1,000'), 1000);
  assert.equal(parseAmount(' 12.5 '), 12.5);
  assert.ok(Number.isNaN(parseAmount('abc')));
  assert.ok(Number.isNaN(parseAmount('')));
});

test('快速對照金額會依幣值大小調整', () => {
  assert.deepEqual(quickAmounts('JPY', RATES).slice(0, 3), [100, 500, 1000]);
  assert.deepEqual(quickAmounts('USD', RATES).slice(0, 3), [1, 5, 10]);
  assert.deepEqual(quickAmounts('KRW', RATES).slice(0, 2), [1000, 5000]);
  assert.deepEqual(quickAmounts('EUR', RATES).slice(0, 2), [1, 5]);
});

test('refresh：第一個來源成功就用它', async () => {
  const calls = [];
  const fetchImpl = fakeFetch({ 'api.coinbase.com': { data: { currency: 'USD', rates: asStrings } } }, calls);
  const state = await refresh({ force: true, fetchImpl, now: () => 1_000_000 });
  assert.deepEqual(calls, ['api.coinbase.com']);
  assert.equal(state.status, 'ok');
  assert.equal(state.source, 'coinbase');
  assert.equal(state.rates.JPY, 151.8);
});

test('refresh：5 分鐘內不重抓', async () => {
  const calls = [];
  await refresh({ fetchImpl: fakeFetch({}, calls), now: () => 1_000_000 + 60_000 });
  assert.deepEqual(calls, []);
});

test('refresh：失敗或資料不完整就換下一個來源', async () => {
  const calls = [];
  const fetchImpl = fakeFetch(
    {
      'api.coinbase.com': { data: { rates: { TWD: '32' } } }, // 資料太少，視為無效
      'open.er-api.com': { result: 'success', time_last_update_unix: 1793750401, rates: RATES },
    },
    calls,
  );
  const state = await refresh({ force: true, fetchImpl, now: () => 2_000_000 });
  assert.deepEqual(calls, ['api.coinbase.com', 'open.er-api.com']);
  assert.equal(state.source, 'erapi');
  assert.equal(state.updatedAt, 1793750401000);
});

test('refresh：全部失敗時保留舊匯率，且不會馬上重試', async () => {
  const calls = [];
  const fetchImpl = fakeFetch({}, calls);
  const state = await refresh({ force: true, fetchImpl, now: () => 3_000_000 });
  assert.equal(calls.length, 3);
  assert.equal(state.status, 'error');
  assert.equal(state.rates.JPY, 151.8);
  await refresh({ fetchImpl, now: () => 3_000_000 + 30_000 });
  assert.equal(calls.length, 3);
  assert.equal(getFx().source, 'erapi');
});
