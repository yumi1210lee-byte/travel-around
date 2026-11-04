// 畫面：每個函式回傳 HTML 字串。所有使用者輸入都必須經過 h() 跳脫。
import { APP_NAME, APP_VERSION, CURRENCIES, CURRENCY_INFO, PLAN_CATEGORIES, tripIconId } from './constants.js';
import { convert } from './fx.js';
import { formatAmount, renderConverter } from './fxview.js';
import { renderSharePreview } from './share.js';
import { icon } from './icons.js';
import {
  buildTimeline,
  diffDays,
  escapeHtml as h,
  flightradarUrl,
  flightStatusUrl,
  formatDate,
  formatMoney,
  formatRange,
  isDate,
  mapsUrl,
  nights,
  normalizeFlightNo,
  nowLocal,
  safeUrl,
  sortFlights,
  sortStays,
  splitDateTime,
  statusLabel,
  stayOnNight,
  toDateStr,
  totalsByCurrency,
  tripStatus,
} from './utils.js';

const CATEGORY = Object.fromEntries(PLAN_CATEGORIES.map((c) => [c.value, c]));
const tripHref = (trip, tab = '') => `#/trip/${encodeURIComponent(trip.id)}${tab ? `/${tab}` : ''}`;
const ext = 'target="_blank" rel="noopener noreferrer"';

const routeText = (f) => `${f.from || f.fromCity || '?'} → ${f.to || f.toCity || '?'}`;

function emptyState(emoji, title, text, action = '') {
  return `<div class="empty">
    <div class="empty-emoji" aria-hidden="true">${emoji}</div>
    <h3>${title}</h3>
    <p>${text}</p>
    ${action}
  </div>`;
}

function copyRow(label, value) {
  return `<div class="copy-row">
    <span class="copy-label">${h(label)}</span>
    <span class="mono">${h(value)}</span>
    <button class="icon-btn sm" data-action="copy" data-text="${h(value)}" aria-label="複製${h(label)}">${icon('copy')}</button>
  </div>`;
}

const notesBlock = (text) => (text ? `<p class="notes">${h(text)}</p>` : '');

/* ───────────── 首頁 ───────────── */

function tripCard(trip, today) {
  const status = tripStatus(trip, today);
  const meta = [
    trip.flights.length && `${trip.flights.length} 航班`,
    trip.stays.length && `${trip.stays.length} 住宿`,
    trip.plans.length && `${trip.plans.length} 行程`,
    trip.members?.length && `${trip.members.length} 人`,
  ]
    .filter(Boolean)
    .map((item) => `<span class="nowrap">${item}</span>`)
    .join('・');
  return `<a class="card trip-card state-${status.state}" href="${tripHref(trip)}">
    <div class="trip-icon" aria-hidden="true">${icon(tripIconId(trip))}</div>
    <div class="trip-info">
      <h3>${h(trip.name)}</h3>
      ${trip.destination ? `<p>${h(trip.destination)}</p>` : ''}
      <p class="muted small">${h(formatRange(trip.startDate, trip.endDate))}</p>
      ${meta ? `<p class="muted small">${meta}</p>` : ''}
    </div>
    <span class="trip-badges">
      <span class="badge badge-${status.state}">${h(statusLabel(status))}</span>
      ${trip.follow ? '<span class="badge">🔄 同步中</span>' : trip.share ? '<span class="badge">🔗 已分享</span>' : ''}
    </span>
  </a>`;
}

export function renderHome(data) {
  const today = toDateStr();
  const groups = { ongoing: [], upcoming: [], undated: [], past: [] };
  for (const trip of data.trips) groups[tripStatus(trip, today).state].push(trip);
  const byStart = (a, b) => a.startDate.localeCompare(b.startDate);
  groups.ongoing.sort(byStart);
  groups.upcoming.sort(byStart);
  groups.past.sort((a, b) => byStart(b, a));

  const section = (title, list) =>
    list.length
      ? `<section class="section"><h2 class="section-title">${title}</h2><div class="stack">${list
          .map((t) => tripCard(t, today))
          .join('')}</div></section>`
      : '';

  const body = data.trips.length
    ? section('旅行中', groups.ongoing) +
      section('即將出發', groups.upcoming) +
      section('未定日期', groups.undated) +
      section('旅行回憶', groups.past)
    : emptyState(
        '🧳',
        '還沒有旅程',
        '建立第一趟旅程，把航班、住宿和行程都收在一起。',
        `<div class="row-btns center">
          <button class="btn primary" data-action="new-trip">${icon('plus')}新增旅程</button>
          <button class="btn" data-action="load-sample">看看範例</button>
        </div>`,
      );

  return `
    <header class="topbar">
      <div class="topbar-title"><h1>${APP_NAME}</h1></div>
      <a class="icon-btn" href="#/fx" aria-label="換匯">${icon('exchange')}</a>
      <a class="icon-btn" href="#/settings" aria-label="設定與備份">${icon('settings')}</a>
    </header>
    <main class="page">${body}</main>
    ${data.trips.length ? `<button class="fab" data-action="new-trip">${icon('plus')}<span>新增旅程</span></button>` : ''}`;
}

/* ───────────── 旅程頁 ───────────── */

const TABS = [
  { id: 'overview', label: '總覽', icon: 'compass' },
  { id: 'flights', label: '航班', icon: 'plane' },
  { id: 'stays', label: '住宿', icon: 'bed' },
  { id: 'plans', label: '行程', icon: 'calendar' },
  { id: 'checklist', label: '清單', icon: 'checks' },
  { id: 'fx', label: '換匯', icon: 'exchange' },
];

// 別人用同步連結分享給你的旅程是唯讀的：渲染時不放編輯、新增按鈕
let READ_ONLY = false;
const editable = (html) => (READ_ONLY ? '' : html);
const editAttrs = (coll, id) => (READ_ONLY ? '' : `data-action="edit" data-coll="${coll}" data-id="${h(id)}"`);

const syncTime = (iso) =>
  iso ? new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '';

function followBanner(trip, full) {
  const f = trip.follow;
  const status =
    {
      gone: '分享的人已經停止分享，這是最後一次同步的版本',
      offline: `目前沒有網路，顯示的是 ${syncTime(f.remoteUpdatedAt)} 的版本`,
      error: `暫時無法檢查更新，顯示的是 ${syncTime(f.remoteUpdatedAt)} 的版本`,
    }[f.status] || `對方修改後會自動更新・最後更新 ${syncTime(f.remoteUpdatedAt)}`;
  if (!full) return `<p class="follow-slim">🔄 同步中的旅程（唯讀）・${h(status)}</p>`;
  return `<section class="card follow-banner ${f.status === 'gone' ? 'is-gone' : ''}">
    <p><b>🔄 別人分享給你的旅程</b></p>
    <p class="muted small">${h(status)}。這趟旅程是唯讀的，行李清單可以自己勾選。</p>
    <div class="row-btns">
      ${f.status === 'gone' ? '' : '<button class="btn" data-action="follow-refresh">檢查更新</button>'}
      <button class="btn" data-action="follow-detach">改成我可以編輯</button>
      <button class="btn danger" data-action="delete-followed">刪除</button>
    </div>
  </section>`;
}

const FAB = {
  flights: ['flights', '新增航班'],
  stays: ['stays', '新增住宿'],
  plans: ['plans', '新增行程'],
};

export function renderTrip(trip, tab, ctx) {
  if (!TABS.some((t) => t.id === tab)) tab = 'overview';
  READ_ONLY = Boolean(trip.follow);
  const fx = () => renderConverter(ctx.fx, ctx.fxInput);
  const content = { overview, flights, stays, plans, checklist, fx }[tab](trip, ctx);
  const fab = READ_ONLY ? null : FAB[tab];
  const banner = READ_ONLY && tab !== 'fx' ? followBanner(trip, tab === 'overview') : '';
  READ_ONLY = false;
  const subtitle = [trip.destination, formatRange(trip.startDate, trip.endDate)].filter(Boolean).join('・');

  return `
    <header class="topbar">
      <a class="icon-btn" href="#/" aria-label="回到旅程列表">${icon('back')}</a>
      <div class="topbar-title">
        <h1>${icon(tripIconId(trip), 'title-icon')}${h(trip.name)}</h1>
        <p>${h(subtitle)}</p>
      </div>
      <button class="icon-btn" data-action="share-trip" aria-label="分享旅程">${icon('share')}</button>
      ${trip.follow ? '' : `<button class="icon-btn" data-action="edit-trip" aria-label="編輯旅程">${icon('edit')}</button>`}
    </header>
    <main class="page has-tabbar">${banner}${content}</main>
    ${fab ? `<button class="fab" data-action="add" data-coll="${fab[0]}">${icon('plus')}<span>${fab[1]}</span></button>` : ''}
    <nav class="tabbar" aria-label="旅程分頁">
      ${TABS.map(
        (t) =>
          `<a href="${tripHref(trip, t.id)}" data-replace class="${t.id === tab ? 'active' : ''}" ${
            t.id === tab ? 'aria-current="page"' : ''
          }>${icon(t.icon)}<span>${t.label}</span></a>`,
      ).join('')}
    </nav>`;
}

/* ── 總覽 ── */

function hero(trip, status) {
  const start = formatDate(trip.startDate);
  switch (status.state) {
    case 'upcoming':
      return `<section class="hero">
        <div><p class="hero-label">${status.days === 1 ? '明天就出發！' : '距離出發還有'}</p>
        <p class="hero-sub">${start} 出發・共 ${status.total} 天</p></div>
        ${status.days === 1 ? '<div class="hero-big">🎉</div>' : `<div class="hero-big">${status.days}<small>天</small></div>`}
      </section>`;
    case 'ongoing':
      return `<section class="hero">
        <div><p class="hero-label">旅行中，今天是</p><p class="hero-sub">共 ${status.total} 天，玩得開心！</p></div>
        <div class="hero-big"><small>第</small>${status.day}<small>天</small></div>
      </section>`;
    case 'past':
      return `<section class="hero is-past">
        <div><p class="hero-label">旅程已結束</p><p class="hero-sub">${start} 出發・共 ${status.total} 天</p></div>
        <div class="hero-big">📷</div>
      </section>`;
    default:
      return `<section class="hero is-past">
        <div><p class="hero-label">還沒設定日期</p><p class="hero-sub">設定出發日就能開始倒數</p></div>
        ${editable('<button class="btn on-hero" data-action="edit-trip">設定日期</button>')}
      </section>`;
  }
}

/** 時間軸上每一項的圖示、標題與副標（總覽和行程分頁共用） */
function entryInfo(entry) {
  const r = entry.ref;
  let emoji;
  let title;
  let sub;
  let endTime = '';
  let endShift = 0;
  switch (entry.kind) {
    case 'flight': {
      // 落地時間顯示在時間欄（起飛下面），跨日會標 +1
      const [depDate] = splitDateTime(r.departAt);
      const [arrDate, arrTime] = splitDateTime(r.arriveAt);
      endTime = arrTime;
      endShift = depDate && arrDate ? diffDays(depDate, arrDate) : 0;
      emoji = '🛫';
      title = routeText(r);
      sub = [[normalizeFlightNo(r.flightNo), r.airline].filter(Boolean).join(' '), r.terminal ? `航廈 ${r.terminal}` : '']
        .filter(Boolean)
        .join('・');
      break;
    }
    case 'arrival':
      emoji = '🛬';
      title = `抵達 ${r.toCity || r.to || ''}`;
      sub = [normalizeFlightNo(r.flightNo), routeText(r)].filter(Boolean).join('・');
      break;
    case 'checkin':
      emoji = '🏨';
      title = `入住 ${r.name}`;
      sub = r.address;
      break;
    case 'checkout':
      emoji = '🧳';
      title = `退房 ${r.name}`;
      break;
    default:
      emoji = (Object.hasOwn(CATEGORY, r.category) && CATEGORY[r.category].emoji) || '📍';
      title = r.title;
      sub = r.location;
  }
  return { emoji, title, sub, endTime, endShift };
}

/** 時間欄：一般只有一個時間；航班是「起飛／落地」上下兩行 */
function timeCell(cls, start, end, shift) {
  if (!end) return `<span class="${cls}">${h(start || '')}</span>`;
  const label = `起飛 ${start || '未定'}，落地 ${end}${shift ? `（${shift > 0 ? '+' : ''}${shift} 天）` : ''}`;
  return `<span class="${cls} has-end" aria-label="${h(label)}">
    <span class="time-start">${h(start || '--:--')}</span>
    <span class="time-end">${h(end)}${shift ? `<sup>${shift > 0 ? '+' : ''}${shift}</sup>` : ''}</span>
  </span>`;
}

function timelineEntry(entry) {
  const r = entry.ref;
  const { emoji, title, sub, endTime, endShift } = entryInfo(entry);
  return `<li><button class="tl-item kind-${entry.kind}" ${editAttrs(entry.coll, r.id)}>
    ${timeCell('tl-time', entry.time, endTime, endShift)}
    <span class="tl-icon" aria-hidden="true">${emoji}</span>
    <span class="tl-body"><b>${h(title)}</b>${sub ? `<small>${h(sub)}</small>` : ''}</span>
  </button></li>`;
}

function dayLabel(trip, date) {
  if (!isDate(trip.startDate)) return '';
  const end = isDate(trip.endDate) && trip.endDate >= trip.startDate ? trip.endDate : trip.startDate;
  if (date < trip.startDate) return '出發前';
  if (date > end) return '回程後';
  return `Day ${diffDays(trip.startDate, date) + 1}`;
}

function daySection(trip, day, today) {
  const isToday = day.date === today;
  const stays = day.stays.length
    ? `<p class="day-stay">${icon('bed')}<span>今晚住：${day.stays.map((s) => h(s.name)).join('、')}</span></p>`
    : '';
  return `<section class="day card ${isToday ? 'is-today' : ''}">
    <header class="day-head">
      <span class="day-num">${dayLabel(trip, day.date)}</span>
      <span class="day-date">${formatDate(day.date)}</span>
      ${isToday ? '<span class="badge badge-ongoing">今天</span>' : ''}
    </header>
    ${day.items.length ? `<ul class="tl">${day.items.map(timelineEntry).join('')}</ul>` : '<p class="muted small day-empty">尚無安排</p>'}
    ${stays}
  </section>`;
}

function costsCard(trip, { fx, homeCurrency }) {
  const totals = Object.entries(totalsByCurrency([...trip.flights, ...trip.stays, ...trip.plans]));
  if (!totals.length) return '';
  const rates = fx.rates;
  const converted = totals.map(([cur, amt]) => (cur === homeCurrency ? amt : convert(amt, cur, homeCurrency, rates)));
  const canSum = converted.every(Number.isFinite);
  const needsFx = totals.some(([cur]) => cur !== homeCurrency);
  const rows = totals
    .map(([cur, amt], i) => {
      const approx = cur !== homeCurrency && Number.isFinite(converted[i])
        ? `<small>≈ ${h(homeCurrency)} ${formatAmount(converted[i], homeCurrency)}</small>`
        : '';
      return `<li><span>${h(cur)}</span><span class="cost-amt"><b>${h(formatMoney(amt, ''))}</b>${approx}</span></li>`;
    })
    .join('');
  const total = needsFx && canSum
    ? `<li class="cost-total"><span>合計約</span><b>${h(homeCurrency)} ${formatAmount(converted.reduce((a, b) => a + b, 0), homeCurrency)}</b></li>`
    : '';
  const hint = needsFx && !canSum
    ? `<p class="muted small">連上網路取得匯率後，會自動換算成 ${h(homeCurrency)}。</p>`
    : needsFx
      ? '<p class="muted small">依目前匯率換算，僅供參考。</p>'
      : '';
  return `<section class="card costs"><h2 class="card-title">已記錄花費</h2><ul>${rows}${total}</ul>${hint}</section>`;
}

// 頭像底色：用名字算出固定的顏色（取自天空漸層）
const AVATAR_COLORS = ['#93b4e9', '#fcae6a', '#d8c6bb', '#fc8852', '#a7bbdf', '#ecc39e', '#bec1d1'];
function avatarColor(name) {
  let hash = 0;
  for (const ch of String(name)) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function memberRow(m) {
  const initial = Array.from(String(m.name || '?').trim())[0] || '?';
  const tel = String(m.phone || '').replace(/[^\d+]/g, '');
  return `<li class="member">
    <button class="member-main" ${editAttrs('members', m.id)}>
      <span class="avatar" style="--av:${avatarColor(m.name)}" aria-hidden="true">${h(initial.toUpperCase())}</span>
      <span class="member-body">
        <b>${h(m.name)}</b>
        ${m.englishName ? `<small class="mono">${h(m.englishName)}</small>` : ''}
        ${m.notes ? `<small class="clamp">${h(m.notes)}</small>` : ''}
      </span>
    </button>
    ${m.englishName ? `<button class="icon-btn sm" data-action="copy" data-text="${h(m.englishName)}" aria-label="複製 ${h(m.name)} 的護照英文姓名">${icon('copy')}</button>` : ''}
    ${tel ? `<a class="icon-btn sm" href="tel:${h(tel)}" aria-label="打電話給 ${h(m.name)}">${icon('phone')}</a>` : ''}
  </li>`;
}

function membersCard(trip) {
  const list = trip.members || [];
  if (!list.length && READ_ONLY) return '';
  return `<section class="card members">
    <header class="card-title-row">
      <h2 class="card-title">👥 同行成員</h2>
      ${list.length ? `<span class="muted small">${list.length} 人</span>` : ''}
    </header>
    ${list.length
      ? `<ul class="member-list">${list.map(memberRow).join('')}</ul>`
      : '<p class="muted small">把一起出發的人加進來，記下護照英文姓名和聯絡電話，訂票或緊急時都找得到。</p>'}
    ${editable(`<button class="btn block member-add" data-action="add" data-coll="members">${icon('plus')}新增成員</button>`)}
  </section>`;
}

function overview(trip, ctx) {
  const today = toDateStr();
  const now = nowLocal();
  const status = tripStatus(trip, today);
  const timeline = buildTimeline(trip);

  const nextFlight = sortFlights(trip.flights).find((f) => f.departAt && f.departAt >= now);
  const tonight = stayOnNight(trip.stays, today)[0];
  const stay = tonight || sortStays(trip.stays).find((s) => s.checkIn > today);

  const cards = [];
  if (nextFlight) {
    const [date, time] = splitDateTime(nextFlight.departAt);
    cards.push(`<a class="card mini" href="${tripHref(trip, 'flights')}" data-replace>
      <span class="mini-icon">${icon('plane')}</span>
      <span class="mini-body"><small>下一班航班</small><b>${h(routeText(nextFlight))}</b>
      <span>${h([normalizeFlightNo(nextFlight.flightNo), formatDate(date), time].filter(Boolean).join('・'))}</span></span>
    </a>`);
  }
  if (stay) {
    const n = nights(stay.checkIn, stay.checkOut);
    cards.push(`<a class="card mini" href="${tripHref(trip, 'stays')}" data-replace>
      <span class="mini-icon">${icon('bed')}</span>
      <span class="mini-body"><small>${tonight ? '今晚住宿' : '下一個住宿'}</small><b>${h(stay.name)}</b>
      <span>${tonight ? `退房 ${formatDate(stay.checkOut)} ${h(stay.checkOutTime || '')}` : `入住 ${formatDate(stay.checkIn)}${n ? `・${n} 晚` : ''}`}</span></span>
    </a>`);
  }

  const done = trip.checklist.filter((c) => c.done).length;
  const totalNights = trip.stays.reduce((sum, s) => sum + nights(s.checkIn, s.checkOut), 0);
  const stats = `<div class="stats">
    <a class="stat" href="${tripHref(trip, 'flights')}" data-replace><b>${trip.flights.length}</b><span>航班</span></a>
    <a class="stat" href="${tripHref(trip, 'stays')}" data-replace><b>${totalNights}</b><span>晚住宿</span></a>
    <a class="stat" href="${tripHref(trip, 'plans')}" data-replace><b>${trip.plans.length}</b><span>行程</span></a>
    <a class="stat" href="${tripHref(trip, 'checklist')}" data-replace><b>${done}/${trip.checklist.length}</b><span>清單</span></a>
  </div>`;

  const costs = costsCard(trip, ctx);
  const members = membersCard(trip);

  const todayDay = status.state === 'ongoing' ? timeline.days.find((d) => d.date === today) : null;
  const days = timeline.days.length
    ? timeline.days.map((d) => daySection(trip, d, today)).join('')
    : `<p class="muted small">設定旅程日期，或新增航班、住宿、行程後，這裡會依日期排好。</p>`;
  const undated = timeline.undated.length
    ? `<section class="day card"><header class="day-head"><span class="day-num">未定日期</span></header>
        <ul class="tl">${timeline.undated.map(timelineEntry).join('')}</ul></section>`
    : '';

  return `
    ${hero(trip, status)}
    ${todayDay ? `<h2 class="section-title spaced">今天的安排</h2>${daySection(trip, todayDay, '')}` : ''}
    ${cards.length ? `<div class="stack spaced">${cards.join('')}</div>` : ''}
    ${stats}
    ${members}
    ${costs}
    ${trip.notes ? `<section class="card"><h2 class="card-title">備註</h2>${notesBlock(trip.notes)}</section>` : ''}
    <h2 class="section-title spaced">每日行程</h2>
    <div class="stack">${days}${undated}</div>`;
}

/* ── 航班 ── */

function flightCard(f) {
  const [depDate, depTime] = splitDateTime(f.departAt);
  const [arrDate, arrTime] = splitDateTime(f.arriveAt);
  const dayShift = depDate && arrDate ? diffDays(depDate, arrDate) : 0;
  const no = normalizeFlightNo(f.flightNo);
  const details = [
    ['航廈', f.terminal],
    ['登機門', f.gate],
    ['座位', f.seat],
    ['行李', f.baggage],
  ].filter(([, v]) => v);

  return `<article class="card pass">
    <header class="pass-top">
      <span><b>${h(f.airline || '航班')}</b>${no ? ` <span class="mono">${h(no)}</span>` : ''}</span>
      <span>${depDate ? h(formatDate(depDate, { year: true })) : '未設定日期'}</span>
    </header>
    <div class="pass-route">
      <div class="pass-end">
        <div class="code">${h(f.from || '—')}</div>
        <div class="city">${h(f.fromCity || '')}</div>
        <div class="time">${h(depTime || '--:--')}</div>
      </div>
      <div class="pass-mid" aria-hidden="true">${icon('plane', 'plane')}</div>
      <div class="pass-end right">
        <div class="code">${h(f.to || '—')}</div>
        <div class="city">${h(f.toCity || '')}</div>
        <div class="time">${h(arrTime || '--:--')}${dayShift ? `<sup>${dayShift > 0 ? '+' : ''}${dayShift}</sup>` : ''}</div>
      </div>
    </div>
    ${details.length ? `<dl class="pass-details">${details.map(([k, v]) => `<div><dt>${k}</dt><dd>${h(v)}</dd></div>`).join('')}</dl>` : ''}
    ${f.bookingRef || f.price || f.notes ? `<div class="pass-extra">
      ${f.bookingRef ? copyRow('訂位代號', f.bookingRef) : ''}
      ${f.price ? `<p class="small muted price">票價 ${h(formatMoney(f.price, f.currency))}</p>` : ''}
      ${notesBlock(f.notes)}
    </div>` : ''}
    <footer class="card-actions">
      ${no ? `<a class="chip" href="${flightStatusUrl(no)}" ${ext}>${icon('external')}航班動態</a>
      <a class="chip" href="${flightradarUrl(no)}" ${ext}>Flightradar24</a>` : ''}
      ${editable(`<button class="chip" data-action="edit" data-coll="flights" data-id="${h(f.id)}">${icon('edit')}編輯</button>`)}
    </footer>
  </article>`;
}

function flights(trip) {
  if (!trip.flights.length) {
    return emptyState(
      '✈️',
      '還沒有航班',
      '記下航班編號、起降時間、航廈、座位和訂位代號，出發當天一目了然。',
      editable(`<button class="btn primary" data-action="add" data-coll="flights">${icon('plus')}新增航班</button>`),
    );
  }
  return `<div class="stack">${sortFlights(trip.flights).map(flightCard).join('')}</div>`;
}

/* ── 住宿 ── */

function stayCard(s, today) {
  const n = nights(s.checkIn, s.checkOut);
  const current = isDate(s.checkIn) && isDate(s.checkOut) && s.checkIn <= today && today < s.checkOut;
  const url = safeUrl(s.url);
  const mapQuery = s.address || s.name;
  const tel = String(s.phone || '').replace(/[^\d+]/g, '');

  return `<article class="card stay ${current ? 'is-current' : ''}">
    <header class="card-head">
      <h3>${h(s.name)}</h3>
      ${current ? '<span class="badge badge-ongoing">入住中</span>' : ''}
    </header>
    <div class="stay-dates">
      <div><small>入住</small><b>${formatDate(s.checkIn) || '—'}</b><span>${h(s.checkInTime || '')}</span></div>
      <div class="nights">${n ? `${n} 晚` : '—'}</div>
      <div class="right"><small>退房</small><b>${formatDate(s.checkOut) || '—'}</b><span>${h(s.checkOutTime || '')}</span></div>
    </div>
    ${s.address ? `<a class="addr" href="${mapsUrl(mapQuery)}" ${ext}>${icon('pin')}<span>${h(s.address)}</span></a>` : ''}
    ${s.confirmation ? copyRow('訂房編號', s.confirmation) : ''}
    ${s.price ? `<p class="small muted price">房價 ${h(formatMoney(s.price, s.currency))}${n > 1 ? `・每晚約 ${h(formatMoney(Math.round((s.price / n) * 100) / 100, s.currency))}` : ''}</p>` : ''}
    ${notesBlock(s.notes)}
    <footer class="card-actions">
      ${mapQuery ? `<a class="chip" href="${mapsUrl(mapQuery)}" ${ext}>${icon('pin')}地圖</a>` : ''}
      ${tel ? `<a class="chip" href="tel:${h(tel)}">${icon('phone')}撥打</a>` : ''}
      ${url ? `<a class="chip" href="${h(url)}" ${ext}>${icon('external')}訂房頁面</a>` : ''}
      ${editable(`<button class="chip" data-action="edit" data-coll="stays" data-id="${h(s.id)}">${icon('edit')}編輯</button>`)}
    </footer>
  </article>`;
}

function stays(trip) {
  if (!trip.stays.length) {
    return emptyState(
      '🏨',
      '還沒有住宿',
      '存下地址、入住退房時間和訂房編號，一鍵開地圖導航。',
      editable(`<button class="btn primary" data-action="add" data-coll="stays">${icon('plus')}新增住宿</button>`),
    );
  }
  const today = toDateStr();
  return `<div class="stack">${sortStays(trip.stays).map((s) => stayCard(s, today)).join('')}</div>`;
}

/* ── 行程 ── */

function planItem(p) {
  const cat = Object.hasOwn(CATEGORY, p.category) ? CATEGORY[p.category] : CATEGORY.other;
  return `<li class="plan">
    <button class="plan-main" ${editAttrs('plans', p.id)}>
      <span class="plan-time">${h(p.time || '')}</span>
      <span class="plan-cat" aria-hidden="true">${cat.emoji}</span>
      <span class="plan-body">
        <b>${h(p.title)}</b>
        ${p.location ? `<small>${h(p.location)}</small>` : ''}
        ${p.price ? `<small>${h(formatMoney(p.price, p.currency))}</small>` : ''}
        ${p.notes ? `<small class="clamp">${h(p.notes)}</small>` : ''}
      </span>
    </button>
    ${p.location ? `<a class="icon-btn sm" href="${mapsUrl(p.location)}" ${ext} aria-label="在地圖上查看 ${h(p.location)}">${icon('pin')}</a>` : ''}
  </li>`;
}

/** 行程分頁裡自動帶入的航班、住宿（點了一樣可以編輯） */
function linkedItem(entry) {
  const r = entry.ref;
  const { emoji, title, sub, endTime, endShift } = entryInfo(entry);
  const tag = entry.coll === 'flights' ? '航班' : '住宿';
  const map =
    entry.kind === 'checkin' && r.address
      ? `<a class="icon-btn sm" href="${mapsUrl(r.address)}" ${ext} aria-label="在地圖上查看 ${h(r.name)}">${icon('pin')}</a>`
      : '';
  return `<li class="plan is-linked kind-${entry.kind}">
    <button class="plan-main" ${editAttrs(entry.coll, r.id)}>
      ${timeCell('plan-time', entry.time, endTime, endShift)}
      <span class="plan-cat" aria-hidden="true">${emoji}</span>
      <span class="plan-body"><b>${h(title)}</b>${sub ? `<small>${h(sub)}</small>` : ''}</span>
      <span class="plan-tag">${tag}</span>
    </button>
    ${map}
  </li>`;
}

const dayItem = (entry) => (entry.kind === 'plan' ? planItem(entry.ref) : linkedItem(entry));

function plans(trip) {
  // 跟總覽一樣用時間軸：自己的行程之外，也自動排入航班與入住／退房
  const timeline = buildTimeline(trip);
  if (!timeline.days.length && !timeline.undated.length) {
    return emptyState(
      '🗺️',
      '還沒有行程',
      '新增想去的景點、餐廳和交通安排，會自動依日期與時間排序。',
      editable(`<button class="btn primary" data-action="add" data-coll="plans">${icon('plus')}新增行程</button>`),
    );
  }
  const today = toDateStr();
  const groups = timeline.days.map(({ date, items, stays }) => {
    const tonight = stays.length
      ? `<p class="plan-stay">${icon('bed')}<span>今晚住：${stays.map((s) => h(s.name)).join('、')}</span></p>`
      : '';
    return `<section class="plan-group ${date === today ? 'is-today' : ''}">
      <header class="group-head">
        <h2><span class="day-num">${dayLabel(trip, date)}</span> ${formatDate(date)}${date === today ? ' <span class="badge badge-ongoing">今天</span>' : ''}</h2>
        ${editable(`<button class="icon-btn sm" data-action="add" data-coll="plans" data-date="${date}" aria-label="在 ${formatDate(date)} 新增行程">${icon('plus')}</button>`)}
      </header>
      ${items.length ? `<ul class="plan-list">${items.map(dayItem).join('')}</ul>` : '<p class="muted small day-empty">尚無安排</p>'}
      ${tonight}
    </section>`;
  });
  if (timeline.undated.length) {
    groups.push(`<section class="plan-group">
      <header class="group-head"><h2><span class="day-num">未定日期</span></h2></header>
      <ul class="plan-list">${timeline.undated.map(dayItem).join('')}</ul>
    </section>`);
  }
  return groups.join('');
}

/* ── 清單 ── */

function checklist(trip) {
  const list = trip.checklist;
  const done = list.filter((c) => c.done).length;
  const pct = list.length ? Math.round((done / list.length) * 100) : 0;
  return `
    <section class="card">
      <div class="progress-head"><b>行前準備</b><span class="muted small">${done} / ${list.length} 完成</span></div>
      <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>
    </section>
    <form class="add-row" data-form="checklist">
      <input name="text" placeholder="新增項目，例如：護照" autocomplete="off" aria-label="新增清單項目" required>
      <button class="btn primary" type="submit">加入</button>
    </form>
    ${list.length ? `<ul class="checklist">${list
      .map(
        (c) => `<li class="${c.done ? 'done' : ''}">
          <label><input type="checkbox" data-change="toggle-check" data-id="${h(c.id)}" ${c.done ? 'checked' : ''}><span>${h(c.text)}</span></label>
          <button class="icon-btn sm" data-action="delete-check" data-id="${h(c.id)}" aria-label="刪除 ${h(c.text)}">${icon('x')}</button>
        </li>`,
      )
      .join('')}</ul>` : '<p class="muted small center">清單是空的，可以自己新增，或加入常用行李清單。</p>'}
    <div class="row-btns">
      <button class="btn" data-action="add-template">${icon('plus')}加入常用行李清單</button>
      ${done ? '<button class="btn" data-action="clear-done">清除已完成</button>' : ''}
    </div>`;
}

/* ───────────── 設定 ───────────── */

export function renderSettings(data) {
  const lastBackup = data.settings.lastBackup
    ? new Date(data.settings.lastBackup).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' })
    : '尚未備份';
  return `
    <header class="topbar">
      <a class="icon-btn" href="#/" aria-label="回到旅程列表">${icon('back')}</a>
      <div class="topbar-title"><h1>設定與備份</h1></div>
    </header>
    <main class="page">
      <section class="card">
        <h2 class="card-title">資料備份</h2>
        <p class="muted small">所有資料只存在<b>這台裝置的瀏覽器</b>裡，不會上傳。換手機、清除瀏覽器資料之前，記得先匯出備份檔；在新裝置上匯入即可還原。</p>
        <p class="small">上次匯出：${h(lastBackup)}</p>
        <div class="row-btns">
          <button class="btn primary" data-action="export">${icon('download')}匯出備份</button>
          <label class="btn">${icon('upload')}匯入備份<input class="visually-hidden" type="file" accept=".json,application/json" data-change="import"></label>
        </div>
        <p class="muted small">匯入時，相同的旅程會被備份檔內容取代，其他旅程會保留。</p>
      </section>

      <section class="card">
        <h2 class="card-title">匯入分享的旅程</h2>
        <p class="muted small">收到別人的分享連結，但點開後沒有進到這個 App？把整段連結貼在這裡。</p>
        <form class="add-row" data-form="share-paste">
          <input name="link" placeholder="貼上分享連結" autocomplete="off" aria-label="分享連結" required>
          <button class="btn primary" type="submit">開啟</button>
        </form>
      </section>

      <section class="card">
        <h2 class="card-title">漸層配色</h2>
        <p class="muted small">自動：依手機時間，早上 5–15 點用晨光、15–19 點用黃昏、19 點後用夜晚。淺色、深色模式都適用。</p>
        <div class="sky-options">
          ${[
            ['auto', '自動', ''],
            ['morning', '晨光', 'morning'],
            ['dusk', '黃昏', 'dusk'],
            ['night', '夜晚', 'night'],
          ]
            .map(
              ([value, label, phase]) => `<label class="sky-option">
                <input type="radio" name="sky" value="${value}" data-change="sky-mode" ${(data.settings.sky || 'auto') === value ? 'checked' : ''}>
                <span class="sky-swatch ${phase ? `sky-${phase}` : 'sky-auto'}"></span>
                <span>${label}</span>
              </label>`,
            )
            .join('')}
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">主要幣別</h2>
        <p class="muted small">新增航班、住宿、行程時預先帶入，也是花費換算的目標幣別。</p>
        <select data-change="currency" aria-label="預設幣別">
          ${CURRENCIES.map((c) => `<option value="${c}" ${c === data.settings.currency ? 'selected' : ''}>${CURRENCY_INFO[c].flag} ${c} ${CURRENCY_INFO[c].name}</option>`).join('')}
        </select>
      </section>

      <section class="card">
        <h2 class="card-title">範例旅程</h2>
        <p class="muted small">載入一趟東京範例旅程，看看完整功能長什麼樣子。</p>
        <div class="row-btns"><button class="btn" data-action="load-sample">載入範例旅程</button></div>
      </section>

      <section class="card">
        <h2 class="card-title">清除資料</h2>
        <p class="muted small">刪除這台裝置上的所有旅程，無法復原。</p>
        <div class="row-btns"><button class="btn danger" data-action="clear-all">清除所有資料</button></div>
      </section>

      <p class="muted small center">${APP_NAME} v${APP_VERSION}・共 ${data.trips.length} 趟旅程</p>
    </main>`;
}

/* ───────────── 換匯（獨立頁面） ───────────── */

export function renderFxPage(ctx) {
  return `
    <header class="topbar">
      <a class="icon-btn" href="#/" aria-label="回到旅程列表">${icon('back')}</a>
      <div class="topbar-title"><h1>換匯</h1></div>
    </header>
    <main class="page">${renderConverter(ctx.fx, ctx.fxInput)}</main>`;
}

/* ───────────── 收到分享 ───────────── */

export function renderShareImport(state, existing, env) {
  let body;
  if (state.status === 'ready') body = renderSharePreview(state.trip, existing, env);
  else if (state.status === 'error') {
    const text = {
      offline: '目前無法連線。請確認網路後，重新打開這個連結。',
      'not-found': '這份分享已經停止，或連結不完整。可以請對方重新分享一次。',
    }[state.error] || '連結可能不完整。請確認整段連結都有複製到，或請對方重新分享一次。';
    body = emptyState(
      '🔗',
      '無法讀取這個分享連結',
      text,
      `<div class="row-btns center">
        ${state.error === 'offline' ? '<button class="btn primary" data-action="retry-incoming">重試</button>' : ''}
        <a class="btn ${state.error === 'offline' ? '' : 'primary'}" href="#/">回到旅程列表</a>
      </div>`,
    );
  } else body = '<p class="muted center" style="padding:48px 0">讀取中…</p>';
  return `
    <header class="topbar">
      <a class="icon-btn" href="#/" aria-label="回到旅程列表">${icon('back')}</a>
      <div class="topbar-title"><h1>收到分享的旅程</h1></div>
    </header>
    <main class="page">${body}</main>`;
}
