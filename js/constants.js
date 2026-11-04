export const APP_NAME = '旅行手帳';
export const APP_VERSION = '1.0.0';

// 旅程圖示（線條風格，畫在 icons.js）；emoji 只用在純文字（例如 LINE 文字版）
export const TRIP_ICONS = [
  { id: 'plane', label: '飛機', emoji: '✈️' },
  { id: 'globe', label: '地球', emoji: '🌏' },
  { id: 'city', label: '城市', emoji: '🏙️' },
  { id: 'torii', label: '鳥居', emoji: '⛩️' },
  { id: 'tower', label: '鐵塔', emoji: '🗼' },
  { id: 'ferris', label: '摩天輪', emoji: '🎡' },
  { id: 'mountain', label: '山', emoji: '🏔️' },
  { id: 'tent', label: '露營', emoji: '⛺' },
  { id: 'beach', label: '海灘', emoji: '🏖️' },
  { id: 'boat', label: '帆船', emoji: '⛵' },
  { id: 'train', label: '火車', emoji: '🚄' },
  { id: 'backpack', label: '背包', emoji: '🎒' },
  { id: 'camera', label: '相機', emoji: '📷' },
  { id: 'flower', label: '櫻花', emoji: '🌸' },
  { id: 'leaf', label: '楓葉', emoji: '🍁' },
  { id: 'snow', label: '雪', emoji: '❄️' },
];
const ICON_BY_ID = Object.fromEntries(TRIP_ICONS.map((i) => [i.id, i]));

// 舊版用 emoji 存的旅程，對應到新的圖示
const LEGACY_EMOJI = {
  '✈️': 'plane', '🗼': 'tower', '🏯': 'torii', '🌸': 'flower', '🍁': 'leaf', '🏝️': 'beach',
  '🏔️': 'mountain', '🎡': 'ferris', '🗽': 'city', '🏖️': 'beach', '🚄': 'train', '🎒': 'backpack',
};

export function tripIconId(trip) {
  if (trip && Object.hasOwn(ICON_BY_ID, trip.icon)) return trip.icon;
  return (trip && LEGACY_EMOJI[trip.emoji]) || 'plane';
}

export const tripEmoji = (trip) => ICON_BY_ID[tripIconId(trip)].emoji;

// 行程類別：icon 用在畫面上，emoji 只用在純文字分享
export const PLAN_CATEGORIES = [
  { value: 'sight', label: '景點', emoji: '📍', icon: 'pin' },
  { value: 'food', label: '美食', emoji: '🍜', icon: 'utensils' },
  { value: 'transport', label: '交通', emoji: '🚆', icon: 'train' },
  { value: 'shopping', label: '購物', emoji: '🛍️', icon: 'bag' },
  { value: 'activity', label: '活動', emoji: '🎟️', icon: 'ticket' },
  { value: 'other', label: '其他', emoji: '📝', icon: 'note' },
];

export const CURRENCY_INFO = {
  TWD: { name: '新台幣', symbol: 'NT$' },
  JPY: { name: '日圓', symbol: '¥' },
  KRW: { name: '韓元', symbol: '₩' },
  USD: { name: '美元', symbol: '$' },
  EUR: { name: '歐元', symbol: '€' },
  HKD: { name: '港幣', symbol: 'HK$' },
  CNY: { name: '人民幣', symbol: '元' },
  THB: { name: '泰銖', symbol: '฿' },
  SGD: { name: '新加坡幣', symbol: 'S$' },
  MYR: { name: '馬來西亞令吉', symbol: 'RM' },
  VND: { name: '越南盾', symbol: '₫' },
  PHP: { name: '菲律賓披索', symbol: '₱' },
  IDR: { name: '印尼盾', symbol: 'Rp' },
  GBP: { name: '英鎊', symbol: '£' },
  AUD: { name: '澳幣', symbol: 'A$' },
  NZD: { name: '紐西蘭幣', symbol: 'NZ$' },
  CAD: { name: '加拿大幣', symbol: 'C$' },
  CHF: { name: '瑞士法郎', symbol: 'Fr' },
  MOP: { name: '澳門幣', symbol: 'P' },
  TRY: { name: '土耳其里拉', symbol: '₺' },
  AED: { name: '阿聯酋迪拉姆', symbol: 'Dh' },
  INR: { name: '印度盧比', symbol: '₹' },
  CZK: { name: '捷克克朗', symbol: 'Kč' },
  SEK: { name: '瑞典克朗', symbol: 'kr' },
};
export const CURRENCIES = Object.keys(CURRENCY_INFO);

/** 這些幣別通常不用小數 */
export const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'IDR', 'TWD']);

export const PACKING_TEMPLATE = [
  '護照（效期 6 個月以上）',
  '電子機票 / 訂位代號',
  '訂房確認信',
  '外幣現金',
  '信用卡',
  '網卡 / eSIM',
  '手機充電器',
  '行動電源',
  '萬用轉接頭',
  '常備藥品',
  '盥洗用品',
  '換洗衣物',
  '雨具',
  '旅遊保險',
];
