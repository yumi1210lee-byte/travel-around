// 分享單一旅程：
// 1. 分享連結：把旅程壓縮後放在網址的 # 後面。# 後面的內容不會傳到伺服器，
//    資料只存在連結本身，對方打開就能加入自己的旅行手帳。
// 2. 文字版：整理成好讀的文字，貼到 LINE 等聊天軟體。
import { PLAN_CATEGORIES, tripEmoji, tripIconId } from './constants.js';
import { icon } from './icons.js';
import { FORMS } from './forms.js';
import {
  diffDays,
  escapeHtml as h,
  formatDate,
  formatMoney,
  formatRange,
  isDate,
  nights,
  normalizeFlightNo,
  sortFlights,
  sortPlans,
  sortStays,
  splitDateTime,
} from './utils.js';

export const DEFAULT_SHARE_OPTIONS = { hideSensitive: true, hidePrices: false, includeChecklist: false };

// 可能被拿去改票、取消訂房的資料
const SENSITIVE = { flights: ['bookingRef'], stays: ['confirmation', 'url'], plans: [], members: ['englishName', 'phone'] };
const PRICE_FIELDS = ['price', 'currency'];
const MAX_ITEMS = 500;
const CATEGORY = Object.fromEntries(PLAN_CATEGORIES.map((c) => [c.value, c]));
const MAX_TEXT = 2000;

// 每種項目可以分享的欄位，直接取自表單定義
const fieldsOf = (type) => FORMS[type].fields.flatMap((f) => (f.row ? f.row : [f]));
const SCHEMA = {
  // emoji：舊版分享連結的圖示欄位，收到時還認得
  trip: [...fieldsOf('trip'), { name: 'emoji' }],
  flights: fieldsOf('flight'),
  stays: fieldsOf('stay'),
  plans: fieldsOf('plan'),
  members: fieldsOf('member'),
  checklist: [{ name: 'text' }],
};

/** 只留下已知欄位、轉成正確型別、限制長度（連結來自別人，不能全然信任） */
function pick(obj, fields, skip = []) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const field of fields) {
    if (skip.includes(field.name)) continue;
    const value = obj[field.name];
    if (value === '' || value == null) continue;
    if (field.type === 'number') {
      const n = Number(value);
      if (Number.isFinite(n)) out[field.name] = n;
    } else if (typeof value === 'string' || typeof value === 'number') {
      out[field.name] = String(value).slice(0, MAX_TEXT);
    }
  }
  return out;
}

const list = (value) => (Array.isArray(value) ? value.slice(0, MAX_ITEMS) : []);

/** 依分享選項整理出要分享的旅程（拿掉 id 以外的內部欄位） */
export function buildSharedTrip(trip, opts = DEFAULT_SHARE_OPTIONS) {
  const skipFor = (coll) => [
    ...(opts.hideSensitive ? SENSITIVE[coll] || [] : []),
    ...(opts.hidePrices ? PRICE_FIELDS : []),
  ];
  const out = { id: String(trip.id || ''), ...pick(trip, SCHEMA.trip) };
  for (const coll of ['flights', 'stays', 'plans', 'members']) {
    out[coll] = list(trip[coll]).map((item) => pick(item, SCHEMA[coll], skipFor(coll)));
  }
  out.checklist = opts.includeChecklist ? list(trip.checklist).map((c) => pick(c, SCHEMA.checklist)) : [];
  return out;
}

/** 收到的旅程：同樣只留已知欄位，缺名稱就視為無效 */
export function sanitizeSharedTrip(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('不是有效的旅程');
  const trip = buildSharedTrip(raw, { hideSensitive: false, hidePrices: false, includeChecklist: true });
  if (!trip.name) throw new Error('不是有效的旅程');
  trip.checklist = trip.checklist.filter((c) => c.text).map((c) => ({ ...c, done: false }));
  trip.plans = trip.plans
    .filter((p) => p.title)
    .map((p) => ({ ...p, category: Object.hasOwn(CATEGORY, p.category) ? p.category : 'other' }));
  trip.stays = trip.stays.filter((s) => s.name);
  trip.members = trip.members.filter((m) => m.name);
  if (!/^[\w-]{1,64}$/.test(trip.id)) delete trip.id;
  return trip;
}

/* ───────────── 連結編碼 ───────────── */

const COMPRESSED = 'v1.';
const PLAIN = 'v0.';

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  if (!/^[\w-]*$/.test(str)) throw new Error('連結格式不正確');
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function transform(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

export async function encodeTrip(trip) {
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, trip }));
  if (typeof CompressionStream === 'function') {
    try {
      return COMPRESSED + toBase64Url(await transform(bytes, new CompressionStream('deflate-raw')));
    } catch {
      /* 不支援 deflate-raw 就用未壓縮格式 */
    }
  }
  return PLAIN + toBase64Url(bytes);
}

export async function decodeTrip(payload) {
  let bytes;
  if (payload.startsWith(COMPRESSED)) {
    bytes = await transform(fromBase64Url(payload.slice(COMPRESSED.length)), new DecompressionStream('deflate-raw'));
  } else if (payload.startsWith(PLAIN)) {
    bytes = fromBase64Url(payload.slice(PLAIN.length));
  } else {
    throw new Error('不認得的連結格式');
  }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  return sanitizeSharedTrip(data?.trip);
}

export const shareUrl = (payload, base) => `${base}#/share/${payload}`;

/** 從貼上的文字裡找出分享代碼（整段訊息、完整網址或只有代碼都可以） */
export function extractPayload(text) {
  const match = String(text || '').match(/#\/share\/(v\d\.[\w-]+)/) || String(text || '').trim().match(/^(v\d\.[\w-]+)$/);
  return match ? match[1] : '';
}

/** 從貼上的文字找出要前往的分享頁（一次性連結 #/share/… 或同步連結 #/s/…） */
export function extractShareRoute(text) {
  const payload = extractPayload(text);
  if (payload) return `#/share/${payload}`;
  const match = String(text || '').match(/#\/s\/([\w-]{16,64})/);
  return match ? `#/s/${match[1]}` : '';
}

/* ───────────── 文字版 ───────────── */

const oneLine = (text) => String(text).replace(/\s*\n\s*/g, ' / ');
const money = (item) => (item.price ? formatMoney(item.price, item.currency) : '');

export function shareText(trip, opts = DEFAULT_SHARE_OPTIONS) {
  const t = buildSharedTrip(trip, opts);
  const blocks = [];
  blocks.push(
    [
      `${tripEmoji(t)} ${t.name}`,
      [t.destination, formatRange(t.startDate, t.endDate)].filter(Boolean).join('｜'),
      t.members.length ? `👥 ${t.members.map((m) => m.name).join('、')}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  if (t.flights.length) {
    const lines = ['✈️ 航班'];
    for (const f of sortFlights(t.flights)) {
      const [depDate, depTime] = splitDateTime(f.departAt);
      const [arrDate, arrTime] = splitDateTime(f.arriveAt);
      const shift = depDate && arrDate ? diffDays(depDate, arrDate) : 0;
      lines.push(
        '',
        [depDate && formatDate(depDate), normalizeFlightNo(f.flightNo), f.airline].filter(Boolean).join(' '),
        `${f.from || f.fromCity || '?'} ${depTime} → ${f.to || f.toCity || '?'} ${arrTime}${shift ? `（${shift > 0 ? '+' : ''}${shift} 天）` : ''}`.replace(/ +/g, ' ').trim(),
      );
      const extra = [
        f.terminal && `航廈 ${f.terminal}`,
        f.gate && `登機門 ${f.gate}`,
        f.seat && `座位 ${f.seat}`,
        f.baggage && `行李 ${f.baggage}`,
        f.bookingRef && `訂位代號 ${f.bookingRef}`,
        money(f) && `票價 ${money(f)}`,
      ].filter(Boolean);
      if (extra.length) lines.push(extra.join('・'));
      if (f.notes) lines.push(`備註：${oneLine(f.notes)}`);
    }
    blocks.push(lines.join('\n'));
  }

  if (t.stays.length) {
    const lines = ['🏨 住宿'];
    for (const s of sortStays(t.stays)) {
      const n = nights(s.checkIn, s.checkOut);
      const checkIn = [formatDate(s.checkIn), s.checkInTime].filter(Boolean).join(' ');
      const checkOut = [formatDate(s.checkOut), s.checkOutTime].filter(Boolean).join(' ');
      lines.push('', s.name);
      if (checkIn || checkOut) {
        lines.push(`${checkIn || '?'} 入住 → ${checkOut || '?'} 退房${n ? `・${n} 晚` : ''}`);
      }
      if (s.address) lines.push(`📍 ${s.address}`);
      if (s.phone) lines.push(`☎️ ${s.phone}`);
      const extra = [s.confirmation && `訂房編號 ${s.confirmation}`, money(s) && `房價 ${money(s)}`].filter(Boolean);
      if (extra.length) lines.push(extra.join('・'));
      if (s.url) lines.push(s.url);
      if (s.notes) lines.push(`備註：${oneLine(s.notes)}`);
    }
    blocks.push(lines.join('\n'));
  }

  if (t.plans.length) {
    const lines = ['🗓 每日行程'];
    const byDate = new Map();
    for (const p of sortPlans(t.plans)) {
      const key = isDate(p.date) ? p.date : '';
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(p);
    }
    for (const [date, plans] of byDate) {
      const dayNo = date && isDate(t.startDate) && date >= t.startDate ? `Day ${diffDays(t.startDate, date) + 1}・` : '';
      lines.push('', date ? `${dayNo}${formatDate(date)}` : '未定日期');
      for (const p of plans) {
        const cat = Object.hasOwn(CATEGORY, p.category) ? CATEGORY[p.category] : CATEGORY.other;
        const place = p.location && !p.title.includes(p.location) ? p.location : '';
        const detail = [place, money(p)].filter(Boolean).join('・');
        lines.push(`${p.time ? `${p.time} ` : ''}${cat.emoji} ${p.title}${detail ? `（${detail}）` : ''}`);
        if (p.notes) lines.push(`　${oneLine(p.notes)}`);
      }
    }
    blocks.push(lines.join('\n'));
  }

  if (t.checklist.length) {
    blocks.push(['🧳 行李清單', ...t.checklist.map((c) => `☐ ${c.text}`)].join('\n'));
  }
  if (t.notes) blocks.push(`📝 備註\n${t.notes}`);
  return blocks.join('\n\n');
}

/* ───────────── 分享視窗 ───────────── */

const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

async function systemShare(data, fallback) {
  if (!canShare()) return fallback();
  try {
    await navigator.share(data);
  } catch (err) {
    if (err?.name !== 'AbortError') fallback();
  }
}

const timeLabel = (iso) =>
  iso ? new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '';

/**
 * 開啟分享視窗。
 * deps = { toast, copyText, sync, getTrip, subscribe }
 *   sync：雲端同步功能（enabled、start、stop、updateOptions、cloudLink）
 */
export function openShareSheet(initialTrip, { toast, copyText, sync, getTrip, subscribe }) {
  const dialog = document.getElementById('sheet');
  const base = `${location.origin}${location.pathname}`;
  let trip = initialTrip;
  const opts = { ...DEFAULT_SHARE_OPTIONS, ...(trip.share?.opts || {}) };
  // 別人分享給你的旅程不能再建立同步連結（你不是擁有者）
  const cloudAllowed = Boolean(sync?.enabled) && !trip.follow;
  let link = '';
  let text = '';
  let version = 0;
  let busy = false;
  let cloudError = '';

  const shareBtn = (kind, label) =>
    canShare() ? `<button type="button" class="btn primary" data-share="${kind}">${label}</button>` : '';
  const copyBtn = (kind, label) =>
    `<button type="button" class="btn ${canShare() ? '' : 'primary'}" data-share="${kind}">${label}</button>`;

  function cloudBlock() {
    const share = trip.share;
    if (!share) {
      return `<h3>🔄 同步連結 <span class="badge badge-upcoming">推薦</span></h3>
        <p class="muted small">對方加入後，你之後改的內容都會自動同步給他。對方只能看、不能改。</p>
        ${cloudError ? `<p class="small share-error">⚠️ ${h(cloudError)}</p>` : ''}
        <div class="row-btns"><button type="button" class="btn primary" data-share="cloud-start" ${busy ? 'disabled' : ''}>${busy ? '建立中…' : '建立同步連結'}</button></div>`;
    }
    const pending = share.syncedAt !== trip.updatedAt;
    const status =
      {
        offline: '⏳ 目前沒有網路，連上後會自動同步',
        forbidden: '⚠️ 這個同步連結是在別的裝置上建立的，這台裝置不能更新它。可以停止分享後重新建立。',
        gone: '⚠️ 雲端上的分享不見了，請停止分享後重新建立。',
        error: `⚠️ 同步失敗：${share.error || ''}`,
      }[share.status] || (pending ? '🔄 同步中…' : `✅ 已同步・${timeLabel(share.pushedAt)}`);
    return `<h3>🔄 同步連結</h3>
      <p class="small share-status">${h(status)}</p>
      <p class="muted small">你修改旅程後，對方打開 App 就會看到最新版本。</p>
      <div class="row-btns">${shareBtn('cloud-link', '傳送連結')}${copyBtn('cloud-copy', '複製連結')}</div>
      <button type="button" class="btn-text danger-text" data-share="cloud-stop" ${busy ? 'disabled' : ''}>${busy ? '處理中…' : '停止分享'}</button>`;
  }

  dialog.innerHTML = `
    <form class="sheet-form" method="dialog">
      <header class="sheet-head">
        <span class="sheet-spacer"></span>
        <h2 id="sheet-title">分享旅程</h2>
        <button type="button" class="btn-text strong" data-share="close">完成</button>
      </header>
      <div class="sheet-body">
        <p class="field-label">分享的內容</p>
        <div class="share-options">
          <label class="check-row"><input type="checkbox" name="hideSensitive" ${opts.hideSensitive ? 'checked' : ''}>
            <span><b>隱藏訂位代號、訂房編號、訂房連結與成員個資</b><small>有訂位代號和姓氏就可能被改票或取消；成員只顯示名字</small></span></label>
          <label class="check-row"><input type="checkbox" name="hidePrices" ${opts.hidePrices ? 'checked' : ''}>
            <span><b>隱藏金額</b><small>票價、房價與行程花費</small></span></label>
          <label class="check-row"><input type="checkbox" name="includeChecklist" ${opts.includeChecklist ? 'checked' : ''}>
            <span><b>包含行李清單</b><small>對方會拿到未勾選的清單</small></span></label>
        </div>

        ${cloudAllowed ? '<section class="share-block" data-cloud-block></section>' : ''}

        <section class="share-block">
          <h3>📸 一次性連結</h3>
          <p class="muted small">傳一份現在這個版本的副本給對方，之後的修改不會同步。</p>
          <div class="row-btns">${shareBtn('link', '傳送連結')}${copyBtn('copy-link', '複製連結')}</div>
        </section>

        <section class="share-block">
          <h3>📝 文字版行程</h3>
          <p class="muted small">貼到 LINE 群組，不用裝 App 也看得懂。</p>
          <pre class="share-preview" data-share-preview></pre>
          <div class="row-btns">${shareBtn('text', '傳送文字')}${copyBtn('copy-text', '複製文字')}</div>
        </section>

        <p class="muted small">⚠️ 備註會一起分享，如果寫了門鎖密碼、Wi-Fi 密碼，請先確認。</p>
      </div>
    </form>`;

  const form = dialog.querySelector('form');
  const preview = dialog.querySelector('[data-share-preview]');
  const cloudEl = dialog.querySelector('[data-cloud-block]');
  const linkButtons = dialog.querySelectorAll('[data-share="link"], [data-share="copy-link"]');
  const renderCloud = () => {
    if (cloudEl) cloudEl.innerHTML = cloudBlock();
  };

  // 選項一改就重新產生；一次性連結要壓縮（非同步），先準備好，按鈕按下時才能立刻分享
  async function update() {
    const current = ++version;
    text = shareText(trip, opts);
    preview.textContent = text;
    linkButtons.forEach((b) => (b.disabled = true));
    const payload = await encodeTrip(buildSharedTrip(trip, opts));
    if (current !== version) return;
    link = shareUrl(payload, base);
    linkButtons.forEach((b) => (b.disabled = false));
  }

  // 視窗開著時，同步狀態有變化就更新畫面
  const unsubscribe = subscribe?.(() => {
    trip = getTrip(trip.id) || trip;
    renderCloud();
  });
  dialog.addEventListener('close', () => unsubscribe?.(), { once: true });

  form.addEventListener('change', (e) => {
    if (!(e.target.name in opts)) return;
    opts[e.target.name] = e.target.checked;
    update();
    if (trip.share) sync.updateOptions(trip.id, { ...opts });
  });

  form.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-share]');
    if (!btn) return;
    const title = `${tripEmoji(trip)} ${trip.name}`;
    const cloudUrl = trip.share ? sync.cloudLink(trip.share.id, base) : '';
    switch (btn.dataset.share) {
      case 'close':
        dialog.close();
        break;
      case 'cloud-start':
        busy = true;
        cloudError = '';
        renderCloud();
        try {
          await sync.start(trip.id, { ...opts });
          trip = getTrip(trip.id) || trip;
          toast('同步連結已建立，可以傳給對方了');
        } catch (err) {
          cloudError = err?.message || '建立失敗，請稍後再試';
        }
        busy = false;
        renderCloud();
        break;
      case 'cloud-link':
        systemShare({ title, text: `${title}｜點連結加入旅行手帳，之後會自動同步`, url: cloudUrl }, () => copyText(cloudUrl, '連結'));
        break;
      case 'cloud-copy':
        copyText(cloudUrl, '連結');
        break;
      case 'cloud-stop':
        if (!confirm('停止分享後，對方會保留最後一次同步的版本，但不會再收到更新。確定要停止嗎？')) break;
        busy = true;
        renderCloud();
        try {
          await sync.stop(trip.id);
          trip = getTrip(trip.id) || trip;
          toast('已停止分享');
        } catch (err) {
          toast(`無法停止分享：${err?.message || '請稍後再試'}`);
        }
        busy = false;
        renderCloud();
        break;
      case 'link':
        systemShare({ title, text: `${title}｜點連結加入旅行手帳`, url: link }, () => copyText(link, '連結'));
        break;
      case 'copy-link':
        copyText(link, '連結');
        break;
      case 'text':
        systemShare({ title, text }, () => copyText(text, '文字版行程'));
        break;
      case 'copy-text':
        copyText(text, '文字版行程');
        break;
    }
  });

  renderCloud();
  update();
  dialog.showModal();
  dialog.querySelector('.sheet-body').scrollTop = 0;
}

/* ───────────── 收到分享 ───────────── */

function previewActions(existing, mode, shareId) {
  const open = (id) => `<a class="btn primary" href="#/trip/${encodeURIComponent(id)}">打開旅程</a>`;
  const copyBtn = '<button class="btn" data-action="import-shared" data-mode="copy">另存一份</button>';
  const own = existing && (!existing.importedAt || existing.share?.id === shareId);

  if (mode === 'follow') {
    if (own) {
      return `<div class="notice">這是你自己分享出去的旅程。</div><div class="row-btns">${open(existing.id)}</div>`;
    }
    if (existing?.follow?.id === shareId) {
      return `<div class="notice">你已經加入這趟旅程了，對方修改後會自動同步。</div><div class="row-btns">${open(existing.id)}</div>`;
    }
    if (existing) {
      return `<div class="notice">你手機上已經有這趟旅程。改成自動同步後，會用對方的最新版本取代它，之後跟著對方更新（唯讀）。</div>
        <div class="row-btns">
          <button class="btn primary" data-action="import-shared" data-mode="follow-replace">改成自動同步</button>${copyBtn}
        </div>`;
    }
    return `<p class="muted small">加入後，對方修改的內容會自動同步到你這裡。這趟旅程在你手機上是唯讀的，行李清單則可以自己勾選。</p>
      <div class="row-btns"><button class="btn primary block" data-action="import-shared" data-mode="follow">加入並自動同步</button></div>`;
  }

  if (own) {
    return `<div class="notice">這是你自己建立的旅程，不需要再加入一次。</div>
      <div class="row-btns">${open(existing.id)}${copyBtn}</div>`;
  }
  if (existing) {
    return `<div class="notice">你之前已經加入過這趟旅程。更新後，會用這次分享的內容取代你手機上的版本（包含你自己改過的地方）。</div>
      <div class="row-btns">
        <button class="btn primary" data-action="import-shared" data-mode="replace">更新旅程</button>${copyBtn}
      </div>`;
  }
  return `<div class="row-btns"><button class="btn primary block" data-action="import-shared" data-mode="new">加入我的旅程</button></div>`;
}

/** 收到分享連結時的預覽頁；mode：'snapshot'（一次性連結）或 'follow'（同步連結） */
export function renderSharePreview(trip, existing, { standalone, href, mode = 'snapshot', shareId = '' }) {
  const n = trip.stays.reduce((sum, s) => sum + nights(s.checkIn, s.checkOut), 0);
  const flights = sortFlights(trip.flights)
    .map((f) => {
      const [date, time] = splitDateTime(f.departAt);
      return `<li>✈️ <b>${h(`${f.from || f.fromCity || '?'} → ${f.to || f.toCity || '?'}`)}</b> <span class="muted">${h([normalizeFlightNo(f.flightNo), formatDate(date), time].filter(Boolean).join('・'))}</span></li>`;
    })
    .join('');
  const stays = sortStays(trip.stays)
    .map((s) => `<li>🏨 <b>${h(s.name)}</b> <span class="muted">${h([formatDate(s.checkIn), nights(s.checkIn, s.checkOut) ? `${nights(s.checkIn, s.checkOut)} 晚` : ''].filter(Boolean).join('・'))}</span></li>`)
    .join('');

  return `
    <section class="hero share-hero">
      <div>
        <p class="hero-label">${mode === 'follow' ? '🔄 有人和你同步分享了一趟旅程' : '有人分享了一趟旅程給你'}</p>
        <p class="share-title">${icon(tripIconId(trip), 'title-icon')}${h(trip.name)}</p>
        <p class="hero-sub">${h([trip.destination, formatRange(trip.startDate, trip.endDate)].filter(Boolean).join('・'))}</p>
      </div>
    </section>
    <div class="stats">
      <div class="stat"><b>${trip.flights.length}</b><span>航班</span></div>
      <div class="stat"><b>${n}</b><span>晚住宿</span></div>
      <div class="stat"><b>${trip.plans.length}</b><span>行程</span></div>
      <div class="stat"><b>${trip.checklist.length}</b><span>清單</span></div>
    </div>
    ${flights || stays ? `<section class="card"><ul class="share-list">${flights}${stays}</ul></section>` : ''}
    <div class="share-actions">${previewActions(existing, mode, shareId)}</div>
    ${standalone ? '' : `<section class="card share-tip">
      <p class="small"><b>📱 iPhone 已經把旅行手帳加到主畫面了嗎？</b></p>
      <p class="muted small">主畫面的 App 和 Safari／LINE 裡開的網頁，資料是分開存的。想加到主畫面的 App：複製這個連結，打開 App →「設定與備份」→「匯入分享的旅程」貼上。</p>
      <div class="row-btns"><button class="btn" data-action="copy" data-text="${h(href)}" data-label="連結">複製連結</button></div>
    </section>`}`;
}
