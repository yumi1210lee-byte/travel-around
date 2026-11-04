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

export const PLAN_CATEGORIES = [
  { value: 'sight', label: '景點', emoji: '📍' },
  { value: 'food', label: '美食', emoji: '🍜' },
  { value: 'transport', label: '交通', emoji: '🚆' },
  { value: 'shopping', label: '購物', emoji: '🛍️' },
  { value: 'activity', label: '活動', emoji: '🎟️' },
  { value: 'other', label: '其他', emoji: '📝' },
];

export const CURRENCY_INFO = {
  TWD: { name: '新台幣', flag: '🇹🇼' },
  JPY: { name: '日圓', flag: '🇯🇵' },
  KRW: { name: '韓元', flag: '🇰🇷' },
  USD: { name: '美元', flag: '🇺🇸' },
  EUR: { name: '歐元', flag: '🇪🇺' },
  HKD: { name: '港幣', flag: '🇭🇰' },
  CNY: { name: '人民幣', flag: '🇨🇳' },
  THB: { name: '泰銖', flag: '🇹🇭' },
  SGD: { name: '新加坡幣', flag: '🇸🇬' },
  MYR: { name: '馬來西亞令吉', flag: '🇲🇾' },
  VND: { name: '越南盾', flag: '🇻🇳' },
  PHP: { name: '菲律賓披索', flag: '🇵🇭' },
  IDR: { name: '印尼盾', flag: '🇮🇩' },
  GBP: { name: '英鎊', flag: '🇬🇧' },
  AUD: { name: '澳幣', flag: '🇦🇺' },
  NZD: { name: '紐西蘭幣', flag: '🇳🇿' },
  CAD: { name: '加拿大幣', flag: '🇨🇦' },
  CHF: { name: '瑞士法郎', flag: '🇨🇭' },
  MOP: { name: '澳門幣', flag: '🇲🇴' },
  TRY: { name: '土耳其里拉', flag: '🇹🇷' },
  AED: { name: '阿聯酋迪拉姆', flag: '🇦🇪' },
  INR: { name: '印度盧比', flag: '🇮🇳' },
  CZK: { name: '捷克克朗', flag: '🇨🇿' },
  SEK: { name: '瑞典克朗', flag: '🇸🇪' },
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
