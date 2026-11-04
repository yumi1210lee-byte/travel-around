import { APP_NAME, PACKING_TEMPLATE } from './constants.js';
import { closeSheet, openForm } from './forms.js';
import { createSampleTrip } from './sample.js';
import * as store from './store.js';
import { isDate, toDateStr } from './utils.js';
import { renderHome, renderSettings, renderTrip } from './views.js';

const app = document.getElementById('app');
const FORM_OF = { flights: 'flight', stays: 'stay', plans: 'plan' };

/* ───────────── 路由 ───────────── */

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'trip' && parts[1]) return { name: 'trip', id: parts[1], tab: parts[2] || 'overview' };
  if (parts[0] === 'settings') return { name: 'settings' };
  return { name: 'home' };
}

const currentTrip = () => {
  const route = parseRoute();
  return route.name === 'trip' ? store.getTrip(route.id) : null;
};

let lastRouteKey = '';

function render() {
  const route = parseRoute();
  const data = store.getData();
  if (route.name === 'trip') {
    const trip = store.getTrip(route.id);
    if (!trip) {
      location.replace('#/');
      return;
    }
    app.innerHTML = renderTrip(trip, route.tab);
    document.title = `${trip.name}・${APP_NAME}`;
  } else if (route.name === 'settings') {
    app.innerHTML = renderSettings(data);
    document.title = `設定・${APP_NAME}`;
  } else {
    app.innerHTML = renderHome(data);
    document.title = APP_NAME;
  }
  const key = `${route.name}/${route.id || ''}/${route.tab || ''}`;
  if (key !== lastRouteKey) {
    window.scrollTo(0, 0);
    lastRouteKey = key;
  }
}

/* ───────────── 小工具 ───────────── */

let toastTimer;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`已複製 ${text}`);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand?.('copy');
    ta.remove();
    toast(ok ? `已複製 ${text}` : '無法複製，請長按文字手動複製');
  }
}

function downloadFile(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function defaultsFor(coll, trip, extra = {}) {
  const currency = trip.lastCurrency || store.getData().settings.currency || 'TWD';
  const today = toDateStr();
  switch (coll) {
    case 'stays':
      return {
        checkIn: trip.startDate || '',
        checkInTime: '15:00',
        checkOut: trip.endDate || '',
        checkOutTime: '11:00',
        currency,
      };
    case 'plans': {
      const inTrip = isDate(trip.startDate) && today >= trip.startDate && today <= (trip.endDate || trip.startDate);
      return { date: extra.date || (inTrip ? today : trip.startDate || ''), category: 'sight', currency };
    }
    default:
      return { currency };
  }
}

function openTripForm(trip) {
  openForm('trip', trip || { emoji: '✈️' }, {
    onSave: (values) => {
      const saved = store.saveTrip(values);
      if (!trip) location.hash = `#/trip/${encodeURIComponent(saved.id)}`;
    },
    onDelete: trip
      ? () => {
          if (!confirm(`確定要刪除「${trip.name}」？\n航班、住宿、行程都會一起刪除，無法復原。`)) return false;
          store.deleteTrip(trip.id);
          location.hash = '#/';
          toast('已刪除旅程');
          return true;
        }
      : undefined,
  });
}

/* ───────────── 動作 ───────────── */

const actions = {
  'new-trip': () => openTripForm(null),
  'edit-trip': () => openTripForm(currentTrip()),

  add: (el) => {
    const trip = currentTrip();
    const { coll } = el.dataset;
    if (!trip || !FORM_OF[coll]) return;
    openForm(FORM_OF[coll], defaultsFor(coll, trip, el.dataset), {
      onSave: (values) => store.saveItem(trip.id, coll, values),
    });
  },

  edit: (el) => {
    const trip = currentTrip();
    const { coll, id } = el.dataset;
    const item = trip?.[coll]?.find((x) => x.id === id);
    if (!item) return;
    openForm(FORM_OF[coll], item, {
      onSave: (values) => store.saveItem(trip.id, coll, values),
      onDelete: () => {
        if (!confirm('確定要刪除嗎？')) return false;
        store.deleteItem(trip.id, coll, id);
        toast('已刪除');
        return true;
      },
    });
  },

  copy: (el) => copyText(el.dataset.text),

  'delete-check': (el) => {
    const trip = currentTrip();
    if (trip) store.deleteItem(trip.id, 'checklist', el.dataset.id);
  },

  'add-template': () => {
    const trip = currentTrip();
    if (!trip) return;
    const existing = new Set(trip.checklist.map((c) => c.text));
    const items = PACKING_TEMPLATE.filter((t) => !existing.has(t)).map((text) => ({ text, done: false }));
    if (!items.length) return toast('常用項目都已經在清單裡了');
    store.saveItems(trip.id, 'checklist', items);
    toast(`已加入 ${items.length} 個項目`);
  },

  'clear-done': () => {
    const trip = currentTrip();
    if (!trip) return;
    store.setChecklist(trip.id, trip.checklist.filter((c) => !c.done));
  },

  export: () => {
    downloadFile(`travel-around-${toDateStr()}.json`, store.exportData());
    store.updateSettings({ lastBackup: new Date().toISOString() });
    toast('已匯出備份檔');
  },

  'load-sample': () => {
    const trip = store.saveTrip(createSampleTrip(toDateStr()));
    location.hash = `#/trip/${encodeURIComponent(trip.id)}`;
    toast('已載入範例旅程');
  },

  'clear-all': () => {
    if (!confirm('確定要清除所有旅程資料？此動作無法復原。\n建議先匯出備份。')) return;
    store.clearAll();
    location.hash = '#/';
    toast('已清除所有資料');
  },
};

const changeActions = {
  'toggle-check': (el) => {
    const trip = currentTrip();
    if (trip) store.toggleCheck(trip.id, el.dataset.id, el.checked);
  },
  currency: (el) => {
    store.updateSettings({ currency: el.value });
    toast(`預設幣別：${el.value}`);
  },
  import: async (el) => {
    const file = el.files?.[0];
    if (!file) return;
    try {
      const { added, updated } = store.importData(await file.text());
      toast(`匯入完成：新增 ${added} 趟、更新 ${updated} 趟`);
    } catch (err) {
      console.error(err);
      alert('匯入失敗：請確認選擇的是本 App 匯出的 .json 備份檔。');
    }
    el.value = '';
  },
};

/* ───────────── 事件 ───────────── */

app.addEventListener('click', (e) => {
  const replaceLink = e.target.closest('a[data-replace]');
  if (replaceLink) {
    // 分頁切換不要堆疊歷史紀錄，按返回直接回列表
    e.preventDefault();
    location.replace(replaceLink.getAttribute('href'));
    return;
  }
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) {
    e.preventDefault();
    actions[el.dataset.action](el, e);
  }
});

app.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el) changeActions[el.dataset.change]?.(el);
});

app.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form="checklist"]');
  if (!form) return;
  e.preventDefault();
  const trip = currentTrip();
  const text = form.elements.text.value.trim();
  if (!trip || !text) return;
  store.saveItem(trip.id, 'checklist', { text, done: false });
  app.querySelector('[data-form="checklist"] input')?.focus();
});

window.addEventListener('hashchange', () => {
  closeSheet();
  render();
});

store.subscribe(render);
store.onSaveError(() => toast('⚠️ 儲存失敗：瀏覽器儲存空間無法使用'));

render();

/* ───────────── 離線與儲存 ───────────── */

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker 註冊失敗', err));
}

// 請瀏覽器盡量不要自動清掉資料（主要針對 Safari）
navigator.storage?.persist?.().catch(() => {});
