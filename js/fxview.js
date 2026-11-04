// 換匯畫面：渲染與輸入時的即時更新
import { CURRENCIES, CURRENCY_INFO, ZERO_DECIMAL } from './constants.js';
import { convert, sourceInfo } from './fx.js';
import { icon } from './icons.js';
import { escapeHtml as h } from './utils.js';

/** 換算結果的顯示格式：日圓、韓元、台幣等大金額不顯示小數 */
export function formatAmount(n, currency) {
  if (!Number.isFinite(n)) return '';
  const digits = ZERO_DECIMAL.has(currency) && Math.abs(n) >= 100 ? 0 : 2;
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

function formatRate(n) {
  if (!Number.isFinite(n)) return '—';
  return n >= 1
    ? n.toLocaleString('en-US', { maximumFractionDigits: 4 })
    : n.toLocaleString('en-US', { maximumSignificantDigits: 4 });
}

/** 使用者輸入的金額：允許逗號與空白 */
export function parseAmount(text) {
  const cleaned = String(text ?? '').replace(/[,\s]/g, '');
  if (cleaned === '') return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/** 依幣值大小挑出常用的對照金額（日圓 100、500、1,000…；美元 1、5、10…） */
export function quickAmounts(currency, rates) {
  const perUsd = rates?.[currency] || 1;
  const scale = 10 ** Math.max(0, Math.round(Math.log10(perUsd)));
  return [1, 5, 10, 30, 50, 100, 300, 500].map((n) => n * scale);
}

const label = (code) => {
  const info = CURRENCY_INFO[code];
  return info ? `${info.flag} ${code} ${info.name}` : code;
};

function currencySelect(name, value) {
  const list = CURRENCIES.includes(value) ? CURRENCIES : [value, ...CURRENCIES];
  const info = CURRENCY_INFO[value] || { flag: '💱', name: '' };
  return `<label class="fx-cur">
    <span class="fx-flag" aria-hidden="true">${info.flag}</span>
    <span><span class="fx-code">${h(value)}</span><span class="fx-name">${h(info.name)}</span></span>
    ${icon('chevron')}
    <select data-change="${name}" aria-label="${name === 'fx-from' ? '原幣別' : '換算幣別'}">
      ${list.map((c) => `<option value="${c}" ${c === value ? 'selected' : ''}>${h(label(c))}</option>`).join('')}
    </select>
  </label>`;
}

function statusLine(fx) {
  const src = sourceInfo(fx.source);
  const time = fx.updatedAt
    ? new Date(fx.updatedAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    : '';
  let text;
  if (fx.status === 'loading') text = fx.rates ? '更新匯率中…' : '取得匯率中…';
  else if (!fx.rates) text = fx.status === 'error' ? '無法取得匯率，請確認網路連線後再試一次' : '尚未取得匯率';
  else if (fx.status === 'error') text = `無法更新，使用 ${time} 的匯率`;
  else text = `${src?.live ? '即時匯率' : '每日匯率'}・更新於 ${time}`;

  const credit = src
    ? src.id === 'erapi'
      ? `<a href="${src.link}" target="_blank" rel="noopener noreferrer">Rates By Exchange Rate API</a>`
      : `來源：<a href="${src.link}" target="_blank" rel="noopener noreferrer">${h(src.name)}</a>`
    : '';
  return `<div class="fx-status ${fx.status === 'error' ? 'is-error' : ''}">
    <div><p>${h(text)}</p>${credit ? `<p class="muted">${credit}</p>` : ''}</div>
    <button class="icon-btn sm ${fx.status === 'loading' ? 'spin' : ''}" data-action="fx-refresh" aria-label="重新整理匯率">${icon('refresh')}</button>
  </div>`;
}

/** 依目前輸入計算兩邊數值與對照表（輸入時也用來局部更新畫面） */
export function computeFx({ from, to, side, value }, rates) {
  const amount = parseAmount(value);
  const other = side === 'a' ? convert(amount, from, to, rates) : convert(amount, to, from, rates);
  return {
    a: side === 'a' ? value : formatAmount(other, from),
    b: side === 'b' ? value : formatAmount(other, to),
    table: quickTable(from, to, rates),
  };
}

function quickTable(from, to, rates) {
  if (!rates?.[from] || !rates?.[to]) return '';
  return quickAmounts(from, rates)
    .map(
      (n) => `<li><button data-action="fx-pick" data-amount="${n}">
        <span>${h(from)} ${n.toLocaleString('en-US')}</span><b>${h(to)} ${formatAmount(convert(n, from, to, rates), to)}</b>
      </button></li>`,
    )
    .join('');
}

export function renderConverter(fx, input) {
  const { from, to } = input;
  const values = computeFx(input, fx.rates);
  const rate = convert(1, from, to, fx.rates);
  const inverse = convert(1, to, from, fx.rates);
  return `
    <section class="fx-card">
      <div class="fx-row">
        ${currencySelect('fx-from', from)}
        <input class="fx-input" data-fx-input="a" inputmode="decimal" autocomplete="off" enterkeyhint="done" placeholder="0" value="${h(values.a)}" aria-label="${h(from)} 金額">
      </div>
      <div class="fx-swap-row">
        <button class="fx-swap" data-action="fx-swap" aria-label="交換幣別">${icon('swap')}</button>
        <p class="fx-rate">${fx.rates ? `1 ${h(from)} = ${formatRate(rate)} ${h(to)}<br>1 ${h(to)} = ${formatRate(inverse)} ${h(from)}` : ''}</p>
      </div>
      <div class="fx-row">
        ${currencySelect('fx-to', to)}
        <input class="fx-input" data-fx-input="b" inputmode="decimal" autocomplete="off" enterkeyhint="done" placeholder="0" value="${h(values.b)}" aria-label="${h(to)} 金額">
      </div>
    </section>
    ${statusLine(fx)}
    ${fx.rates ? `<section class="card fx-quick">
      <h2 class="card-title">快速對照</h2>
      <ul class="fx-table" data-fx-table>${values.table}</ul>
    </section>` : ''}
    <p class="muted small fx-note">顯示的是市場中間價，實際在銀行、換匯所或刷卡時會有匯差與手續費，僅供參考。</p>`;
}
