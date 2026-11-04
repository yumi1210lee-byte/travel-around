// 表單定義與底部彈出視窗（bottom sheet）
import { CURRENCIES, PLAN_CATEGORIES, TRIP_ICONS } from './constants.js';
import { icon } from './icons.js';
import { escapeHtml as h, normalizeFlightNo } from './utils.js';

const upper = (v) => v.toUpperCase();
const withScheme = (v) => (v && !/^[a-z][a-z0-9+.-]*:/i.test(v) ? `https://${v}` : v);

const price = { name: 'price', label: '金額', type: 'number', placeholder: '0' };
const currency = { name: 'currency', label: '幣別', type: 'currency', transform: upper };
const notes = (placeholder) => ({ name: 'notes', label: '備註', type: 'textarea', placeholder });

export const FORMS = {
  trip: {
    title: '旅程',
    fields: [
      { name: 'name', label: '旅程名稱', required: true, placeholder: '例：東京賞楓 5 日' },
      { name: 'destination', label: '目的地', placeholder: '例：日本・東京' },
      { name: 'icon', label: '圖示', type: 'icon' },
      {
        row: [
          { name: 'startDate', label: '出發日', type: 'date' },
          { name: 'endDate', label: '回程日', type: 'date' },
        ],
      },
      notes('簽證、保險、緊急聯絡人…'),
    ],
    validate: (v) => (v.startDate && v.endDate && v.endDate < v.startDate ? '回程日不能早於出發日' : ''),
  },

  flight: {
    title: '航班',
    fields: [
      {
        row: [
          { name: 'flightNo', label: '航班編號', placeholder: 'BR198', transform: normalizeFlightNo, attrs: 'autocapitalize="characters" autocomplete="off"' },
          { name: 'airline', label: '航空公司', placeholder: '長榮航空' },
        ],
      },
      {
        row: [
          { name: 'from', label: '出發機場代碼', placeholder: 'TPE', transform: upper, attrs: 'maxlength="4" autocapitalize="characters" autocomplete="off"' },
          { name: 'fromCity', label: '出發城市／機場', placeholder: '台北桃園' },
        ],
      },
      {
        row: [
          { name: 'to', label: '抵達機場代碼', placeholder: 'NRT', transform: upper, attrs: 'maxlength="4" autocapitalize="characters" autocomplete="off"' },
          { name: 'toCity', label: '抵達城市／機場', placeholder: '東京成田' },
        ],
      },
      { name: 'departAt', label: '起飛時間（當地）', type: 'datetime-local' },
      { name: 'arriveAt', label: '抵達時間（當地）', type: 'datetime-local' },
      {
        row: [
          { name: 'terminal', label: '出發航廈', placeholder: 'T2', transform: upper },
          { name: 'arrivalTerminal', label: '抵達航廈', placeholder: 'T1', transform: upper },
        ],
      },
      {
        row: [
          { name: 'gate', label: '登機門', placeholder: 'C5', transform: upper },
          { name: 'seat', label: '座位', placeholder: '32A', transform: upper },
        ],
      },
      {
        row: [
          { name: 'bookingRef', label: '訂位代號', placeholder: 'ABC123', transform: upper, attrs: 'autocapitalize="characters" autocomplete="off"' },
          { name: 'baggage', label: '行李額度', placeholder: '23kg × 2' },
        ],
      },
      { row: [price, currency] },
      notes('會員編號、機上餐點、轉機資訊…'),
    ],
    validate: (v) =>
      !v.flightNo && !(v.from && v.to) ? '請至少填寫航班編號，或出發與抵達機場' : '',
  },

  stay: {
    title: '住宿',
    fields: [
      { name: 'name', label: '住宿名稱', required: true, placeholder: '飯店／民宿名稱' },
      { name: 'address', label: '地址', placeholder: '貼上地址，可直接開地圖導航' },
      {
        row: [
          { name: 'checkIn', label: '入住日', type: 'date', required: true },
          { name: 'checkInTime', label: '入住時間', type: 'time' },
        ],
      },
      {
        row: [
          { name: 'checkOut', label: '退房日', type: 'date' },
          { name: 'checkOutTime', label: '退房時間', type: 'time' },
        ],
      },
      {
        row: [
          { name: 'confirmation', label: '訂房編號', placeholder: '確認號碼', attrs: 'autocomplete="off"' },
          { name: 'phone', label: '電話', type: 'tel', placeholder: '+81-3-…' },
        ],
      },
      { name: 'url', label: '訂房連結', type: 'url', placeholder: 'https://…', transform: withScheme, attrs: 'inputmode="url" autocomplete="off"' },
      { row: [{ ...price, label: '總房價' }, currency] },
      notes('早餐時間、Wi-Fi 密碼、門鎖密碼…'),
    ],
    validate: (v) => (v.checkOut && v.checkIn && v.checkOut < v.checkIn ? '退房日不能早於入住日' : ''),
  },

  member: {
    title: '成員',
    fields: [
      { name: 'name', label: '名字／暱稱', required: true, placeholder: '例：小美' },
      {
        name: 'englishName',
        label: '護照英文姓名',
        placeholder: 'WANG XIAO-MEI',
        transform: upper,
        attrs: 'autocapitalize="characters" autocomplete="off" spellcheck="false"',
      },
      { name: 'phone', label: '電話', type: 'tel', placeholder: '+886 912 345 678' },
      notes('過敏、飲食禁忌、緊急聯絡人…'),
    ],
  },

  plan: {
    title: '行程',
    fields: [
      { name: 'title', label: '名稱', required: true, placeholder: '例：明治神宮、拉麵、搭新幹線' },
      {
        name: 'category',
        label: '類別',
        type: 'select',
        options: PLAN_CATEGORIES.map((c) => ({ value: c.value, label: `${c.emoji} ${c.label}` })),
      },
      {
        row: [
          { name: 'date', label: '日期', type: 'date' },
          { name: 'time', label: '時間', type: 'time' },
        ],
      },
      { name: 'location', label: '地點', placeholder: '地點名稱或地址' },
      { row: [price, currency] },
      notes('預約編號、營業時間、交通方式…'),
    ],
  },
};

const flatten = (fields) => fields.flatMap((f) => (f.row ? f.row : [f]));

function renderField(field, values) {
  if (field.row) {
    return `<div class="field-row">${field.row.map((f) => renderField(f, values)).join('')}</div>`;
  }
  const value = values[field.name] ?? '';
  const id = `f-${field.name}`;
  const label = `${h(field.label)}${field.required ? ' <i aria-hidden="true">*</i>' : ''}`;

  if (field.type === 'icon') {
    const options = TRIP_ICONS.map(
      (t) =>
        `<label title="${h(t.label)}"><input type="radio" name="${field.name}" value="${t.id}" aria-label="${h(t.label)}" ${t.id === value ? 'checked' : ''}><span>${icon(t.id)}</span></label>`,
    ).join('');
    return `<fieldset class="field"><legend class="field-label">${label}</legend><div class="icon-picker">${options}</div></fieldset>`;
  }

  const attrs = [
    `id="${id}"`,
    `name="${field.name}"`,
    field.required ? 'required' : '',
    field.placeholder ? `placeholder="${h(field.placeholder)}"` : '',
    field.attrs || '',
  ].join(' ');

  let control;
  switch (field.type) {
    case 'textarea':
      control = `<textarea ${attrs} rows="3">${h(value)}</textarea>`;
      break;
    case 'select':
      control = `<select ${attrs}>${field.options
        .map((o) => `<option value="${h(o.value)}" ${o.value === value ? 'selected' : ''}>${h(o.label)}</option>`)
        .join('')}</select>`;
      break;
    case 'currency':
      control = `<input ${attrs} type="text" list="currency-list" maxlength="3" autocapitalize="characters" autocomplete="off" value="${h(value)}">`;
      break;
    case 'number':
      control = `<input ${attrs} type="number" inputmode="decimal" step="any" min="0" value="${h(value)}">`;
      break;
    case 'url':
      // 用 text 型別，讓使用者可以貼上沒有 https:// 的網址
      control = `<input ${attrs} type="text" value="${h(value)}">`;
      break;
    default:
      control = `<input ${attrs} type="${field.type || 'text'}" value="${h(value)}">`;
  }
  return `<div class="field"><label class="field-label" for="${id}">${label}</label>${control}</div>`;
}

function readForm(form, def) {
  const out = {};
  for (const field of flatten(def.fields)) {
    const el = form.elements[field.name];
    if (!el) continue;
    let value = String(el.value ?? '').trim();
    if (field.type === 'number') value = value === '' ? '' : Number(value);
    else if (field.transform) value = field.transform(value);
    out[field.name] = value;
  }
  return out;
}

const dialog = () => document.getElementById('sheet');

export function closeSheet() {
  const d = dialog();
  if (d.open) d.close();
}

/**
 * 開啟表單。
 * onSave(values) 會收到原本資料與表單欄位合併後的物件。
 * onDelete() 回傳 true 代表已刪除，視窗會關閉。
 */
export function openForm(type, values, { onSave, onDelete } = {}) {
  const def = FORMS[type];
  const d = dialog();
  const isEdit = Boolean(values.id);
  d.innerHTML = `
    <form class="sheet-form" autocomplete="on">
      <header class="sheet-head">
        <button type="button" class="btn-text" data-sheet="cancel">取消</button>
        <h2 id="sheet-title">${isEdit ? '編輯' : '新增'}${def.title}</h2>
        <button type="submit" class="btn-text strong">儲存</button>
      </header>
      <div class="sheet-body">
        <p class="form-error" role="alert" hidden></p>
        ${def.fields.map((f) => renderField(f, values)).join('')}
        <datalist id="currency-list">${CURRENCIES.map((c) => `<option value="${c}">`).join('')}</datalist>
        ${isEdit && onDelete ? `<button type="button" class="btn danger block" data-sheet="delete">刪除這個${def.title}</button>` : ''}
      </div>
    </form>`;

  const form = d.querySelector('form');
  const errorEl = form.querySelector('.form-error');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const result = readForm(form, def);
    const error = def.validate?.(result);
    if (error) {
      errorEl.textContent = error;
      errorEl.hidden = false;
      form.querySelector('.sheet-body').scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    d.close();
    onSave?.({ ...values, ...result });
  });

  form.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sheet]');
    if (!btn) return;
    if (btn.dataset.sheet === 'cancel') d.close();
    if (btn.dataset.sheet === 'delete' && onDelete?.()) d.close();
  });

  d.showModal();
  form.querySelector('.sheet-body').scrollTop = 0;
}
