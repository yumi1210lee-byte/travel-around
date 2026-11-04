import { APP_NAME, PACKING_TEMPLATE } from './constants.js';
import { closeSheet, openForm } from './forms.js';
import * as fx from './fx.js';
import { computeFx } from './fxview.js';
import { createSampleTrip } from './sample.js';
import { decodeTrip, extractShareRoute, openShareSheet } from './share.js';
import * as store from './store.js';
import * as sync from './sync.js';
import { copyText, toast } from './ui.js';
import { isDate, toDateStr } from './utils.js';
import { renderFxPage, renderHome, renderSettings, renderShareImport, renderTrip } from './views.js';

const app = document.getElementById('app');
const FORM_OF = { flights: 'flight', stays: 'stay', plans: 'plan' };

/* ───────────── 路由 ───────────── */

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'trip' && parts[1]) return { name: 'trip', id: parts[1], tab: parts[2] || 'overview' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'fx') return { name: 'fx' };
  if (parts[0] === 'share' && parts[1]) return { name: 'share', payload: parts[1] };
  if (parts[0] === 's' && parts[1]) return { name: 'follow-share', shareId: parts[1] };
  return { name: 'home' };
}

const currentTrip = () => {
  const route = parseRoute();
  return route.name === 'trip' ? store.getTrip(route.id) : null;
};

/* ───────────── 換匯狀態 ───────────── */

// 最後輸入的是哪一邊（a = 上方原幣別、b = 下方換算幣別）與輸入內容
let fxDraft = { side: 'a', value: '1,000' };

function fxPair(trip) {
  const s = store.getData().settings;
  const to = s.fxTo || s.currency || 'TWD';
  let from = s.fxFrom || (trip?.lastCurrency && trip.lastCurrency !== to ? trip.lastCurrency : 'JPY');
  if (from === to) from = to === 'USD' ? 'JPY' : 'USD';
  return { from, to };
}

const isFxRoute = (route = parseRoute()) => route.name === 'fx' || (route.name === 'trip' && route.tab === 'fx');

function renderContext(trip) {
  return {
    fx: fx.getFx(),
    fxInput: { ...fxPair(trip), ...fxDraft },
    homeCurrency: store.getData().settings.currency || 'TWD',
  };
}

/** 打字時只更新另一個欄位，不重畫整頁（保持游標位置） */
function updateFxFields({ both = false } = {}) {
  const a = app.querySelector('[data-fx-input="a"]');
  const b = app.querySelector('[data-fx-input="b"]');
  if (!a || !b) return;
  const out = computeFx({ ...fxPair(currentTrip()), ...fxDraft }, fx.getFx().rates);
  if (both || fxDraft.side === 'b') a.value = out.a;
  if (both || fxDraft.side === 'a') b.value = out.b;
}

/* ───────────── 收到的分享 ───────────── */

// key：'snap:<代碼>'（一次性連結）或 'cloud:<分享代碼>'（同步連結）
let incoming = { key: '', status: 'idle', trip: null };

function loadIncoming(key, loader) {
  if (incoming.key === key) return;
  incoming = { key, status: 'loading', trip: null };
  loader()
    .then((result) => {
      if (incoming.key !== key) return;
      incoming = { key, status: 'ready', ...result };
      render();
    })
    .catch((err) => {
      console.warn('分享連結無法讀取', err);
      if (incoming.key !== key) return;
      incoming = { key, status: 'error', trip: null, error: err?.code || 'invalid' };
      render();
    });
}

/** 收到同步連結時，找出手機上相關的旅程（自己分享的、已經在追蹤的、或同一趟旅程） */
function findRelated(shareId, trip) {
  return (
    store.getData().trips.find((t) => t.share?.id === shareId || t.follow?.id === shareId) ||
    (trip?.id ? store.getTrip(trip.id) : null)
  );
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

let lastRouteKey = '';
let restoringFocus = false;

function render() {
  const route = parseRoute();
  const data = store.getData();
  // 重畫前記下正在輸入的換匯欄位，重畫後還原焦點與游標
  const active = document.activeElement;
  const focusedFx = app.contains(active) ? active.dataset?.fxInput : null;
  const selection = focusedFx ? [active.selectionStart, active.selectionEnd, active.selectionDirection] : null;

  if (route.name === 'trip') {
    const trip = store.getTrip(route.id);
    if (!trip) {
      location.replace('#/');
      return;
    }
    app.innerHTML = renderTrip(trip, route.tab, renderContext(trip));
    document.title = `${trip.name}・${APP_NAME}`;
  } else if (route.name === 'fx') {
    app.innerHTML = renderFxPage(renderContext(null));
    document.title = `換匯・${APP_NAME}`;
  } else if (route.name === 'share') {
    loadIncoming(`snap:${route.payload}`, async () => ({ trip: await decodeTrip(route.payload) }));
    const existing = incoming.trip?.id ? store.getTrip(incoming.trip.id) : null;
    app.innerHTML = renderShareImport(incoming, existing, { standalone: isStandalone(), href: location.href });
    document.title = `收到分享的旅程・${APP_NAME}`;
  } else if (route.name === 'follow-share') {
    loadIncoming(`cloud:${route.shareId}`, () => sync.loadShared(route.shareId));
    const existing = incoming.trip ? findRelated(route.shareId, incoming.trip) : null;
    app.innerHTML = renderShareImport(incoming, existing, {
      standalone: isStandalone(),
      href: location.href,
      mode: 'follow',
      shareId: route.shareId,
    });
    document.title = `收到分享的旅程・${APP_NAME}`;
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
  } else if (focusedFx) {
    const el = app.querySelector(`[data-fx-input="${focusedFx}"]`);
    if (el) {
      restoringFocus = true;
      el.focus({ preventScroll: true });
      restoringFocus = false;
      try {
        el.setSelectionRange(...selection);
      } catch {
        /* 某些輸入框不支援 */
      }
    }
  }

  // 換匯頁、或總覽有外幣花費時，背景更新匯率（5 分鐘內不重抓）
  if (isFxRoute(route) || (route.name === 'trip' && route.tab === 'overview')) setTimeout(() => fx.refresh(), 0);
  // 打開同步中的旅程時檢查有沒有新版本（30 秒內不重複檢查）
  if (route.name === 'trip' && store.getTrip(route.id)?.follow) {
    setTimeout(() => sync.refreshFollowed({ tripId: route.id }), 0);
  }
}

/* ───────────── 小工具 ───────────── */

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
  'edit-trip': () => {
    const trip = currentTrip();
    if (trip && !trip.follow) openTripForm(trip);
  },

  add: (el) => {
    const trip = currentTrip();
    const { coll } = el.dataset;
    if (!trip || trip.follow || !FORM_OF[coll]) return;
    openForm(FORM_OF[coll], defaultsFor(coll, trip, el.dataset), {
      onSave: (values) => store.saveItem(trip.id, coll, values),
    });
  },

  edit: (el) => {
    const trip = currentTrip();
    const { coll, id } = el.dataset;
    const item = trip?.[coll]?.find((x) => x.id === id);
    if (!item || trip.follow) return;
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

  copy: (el) => copyText(el.dataset.text, el.dataset.label),

  'share-trip': () => {
    const trip = currentTrip();
    if (!trip) return;
    openShareSheet(trip, {
      toast,
      copyText,
      getTrip: store.getTrip,
      subscribe: store.subscribe,
      sync: {
        enabled: sync.enabled,
        start: sync.startSharing,
        stop: sync.stopSharing,
        updateOptions: sync.updateOptions,
        cloudLink: sync.cloudLink,
      },
    });
  },

  'follow-refresh': async () => {
    const trip = currentTrip();
    if (!trip?.follow) return;
    const updated = await sync.refreshFollowed({ tripId: trip.id, force: true });
    const status = store.getTrip(trip.id)?.follow?.status;
    if (!updated) toast(status === 'offline' ? '目前沒有網路' : status === 'gone' ? '對方已停止分享' : '已經是最新版本');
  },

  'follow-detach': () => {
    const trip = currentTrip();
    if (!trip?.follow) return;
    if (!confirm('改成可以編輯後，就不會再收到對方的更新了。確定嗎？')) return;
    store.setFollowMeta(trip.id, null);
    toast('已改成你自己的旅程，可以編輯了');
  },

  'delete-followed': () => {
    const trip = currentTrip();
    if (!trip?.follow) return;
    if (!confirm(`確定要從你的手機刪除「${trip.name}」？\n（不會影響分享給你的人）`)) return;
    store.deleteTrip(trip.id);
    location.hash = '#/';
    toast('已刪除旅程');
  },

  'retry-incoming': () => {
    incoming = { key: '', status: 'idle', trip: null };
    render();
  },

  'import-shared': (el) => {
    if (incoming.status !== 'ready') return;
    const { mode } = el.dataset;
    const shared = incoming.trip;
    const route = parseRoute();
    const shareId = route.name === 'follow-share' ? route.shareId : '';
    const existing = shareId ? findRelated(shareId, shared) : shared.id ? store.getTrip(shared.id) : null;
    const own = existing && (!existing.importedAt || (shareId && existing.share?.id === shareId));
    let trip;
    if (mode === 'copy') {
      trip = store.importTrip({ ...shared, name: `${shared.name}（副本）` }, { asCopy: true });
    } else if (mode === 'follow' || mode === 'follow-replace') {
      // 自己的旅程不能被分享的版本蓋掉
      if (!shareId || own || (mode === 'follow' && existing)) return;
      if (existing && existing.id !== shared.id) store.deleteTrip(existing.id);
      trip = store.importTrip(shared, {
        follow: { id: shareId, remoteUpdatedAt: incoming.updatedAt, status: 'ok', checkedAt: new Date().toISOString() },
      });
    } else {
      if (mode === 'replace' && (!existing || own)) return;
      if (mode === 'new' && existing) return;
      trip = store.importTrip(shared);
    }
    incoming = { key: '', status: 'idle', trip: null };
    location.replace(`#/trip/${encodeURIComponent(trip.id)}`);
    toast(
      { replace: '已更新旅程', follow: '已加入，之後會自動同步', 'follow-replace': '已改成自動同步' }[mode] ||
        '已加入你的旅程',
    );
  },

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

  'fx-swap': () => {
    const { from, to } = fxPair(currentTrip());
    store.updateSettings({ fxFrom: to, fxTo: from });
  },

  'fx-refresh': () => {
    fx.refresh({ force: true }).then((s) => {
      if (s.status === 'error') toast('無法更新匯率，請檢查網路');
      else if (s.status === 'ok') toast('匯率已更新');
    });
  },

  'fx-pick': (el) => {
    fxDraft = { side: 'a', value: Number(el.dataset.amount).toLocaleString('en-US') };
    updateFxFields({ both: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    toast(`主要幣別：${el.value}`);
  },
  'fx-from': (el) => {
    const { from, to } = fxPair(currentTrip());
    // 選到跟另一邊一樣的幣別時，直接對調
    store.updateSettings(el.value === to ? { fxFrom: to, fxTo: from } : { fxFrom: el.value, fxTo: to });
  },
  'fx-to': (el) => {
    const { from, to } = fxPair(currentTrip());
    store.updateSettings(el.value === from ? { fxFrom: to, fxTo: from } : { fxFrom: from, fxTo: el.value });
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
  const sharePaste = e.target.closest('[data-form="share-paste"]');
  if (sharePaste) {
    e.preventDefault();
    const target = extractShareRoute(sharePaste.elements.link.value);
    if (!target) return toast('找不到分享連結，請貼上完整的連結');
    location.hash = target;
    return;
  }
  const form = e.target.closest('[data-form="checklist"]');
  if (!form) return;
  e.preventDefault();
  const trip = currentTrip();
  const text = form.elements.text.value.trim();
  if (!trip || !text) return;
  store.saveItem(trip.id, 'checklist', { text, done: false });
  app.querySelector('[data-form="checklist"] input')?.focus();
});

app.addEventListener('input', (e) => {
  const el = e.target.closest('[data-fx-input]');
  if (!el) return;
  fxDraft = { side: el.dataset.fxInput, value: el.value };
  updateFxFields();
});

// 點金額欄位時全選，方便直接輸入新數字
app.addEventListener('focusin', (e) => {
  const el = e.target.closest('[data-fx-input]');
  if (!el || restoringFocus) return;
  const before = el.value;
  // 延後一點才全選（iOS 點擊後會重設游標）；若已經開始輸入就不要動
  setTimeout(() => {
    if (document.activeElement === el && el.value === before) el.setSelectionRange(0, el.value.length);
  }, 0);
});

app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-fx-input]')) e.target.blur();
});

window.addEventListener('hashchange', () => {
  closeSheet();
  render();
});

store.subscribe(render);
fx.subscribe(render);

// 雲端同步：資料一有變動就檢查要不要上傳；收到對方更新時提示
store.subscribe(() => sync.checkPending());
sync.onUpdate((e) => {
  if (e.type === 'follow-updated' && e.trip) toast(`「${e.trip.name}」有新的更新`);
});
window.addEventListener('online', () => {
  sync.checkPending({ retryFailed: true });
  sync.refreshFollowed({ force: true });
});

// 換匯頁開著時，每分鐘檢查一次（實際 5 分鐘才會重抓）；App 回到前景時也更新
setInterval(() => {
  if (document.visibilityState === 'visible' && isFxRoute()) fx.refresh();
}, 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (isFxRoute()) fx.refresh();
  sync.refreshFollowed();
});
store.onSaveError(() => toast('⚠️ 儲存失敗：瀏覽器儲存空間無法使用'));

render();
sync.checkPending({ retryFailed: true });
sync.refreshFollowed();

/* ───────────── 離線與儲存 ───────────── */

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker 註冊失敗', err));
}

// 請瀏覽器盡量不要自動清掉資料（主要針對 Safari）
navigator.storage?.persist?.().catch(() => {});
