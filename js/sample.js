import { addDays } from './utils.js';

/** 範例旅程：以今天為基準，兩週後出發的東京 5 日遊 */
export function createSampleTrip(today) {
  const d = (n) => addDays(today, 14 + n);
  return {
    name: '東京賞楓 5 日（範例）',
    destination: '日本・東京',
    icon: 'leaf',
    startDate: d(0),
    endDate: d(4),
    notes: '這是範例旅程，可以隨意修改或刪除。\n入境前記得填 Visit Japan Web。',
    lastCurrency: 'JPY',
    flights: [
      {
        airline: '長榮航空', flightNo: 'BR198',
        from: 'TPE', fromCity: '台北桃園', to: 'NRT', toCity: '東京成田',
        departAt: `${d(0)}T08:50`, arriveAt: `${d(0)}T13:15`,
        terminal: 'T2', gate: '', seat: '32A', bookingRef: 'ABC123', baggage: '23kg × 2',
        price: 15800, currency: 'TWD', notes: '來回票價',
      },
      {
        airline: '長榮航空', flightNo: 'BR197',
        from: 'NRT', fromCity: '東京成田', to: 'TPE', toCity: '台北桃園',
        departAt: `${d(4)}T14:30`, arriveAt: `${d(4)}T17:20`,
        terminal: 'T1', seat: '30K', bookingRef: 'ABC123', baggage: '23kg × 2',
      },
    ],
    stays: [
      {
        name: '新宿範例飯店', address: '東京都新宿區西新宿 2-8-1',
        checkIn: d(0), checkInTime: '15:00', checkOut: d(4), checkOutTime: '11:00',
        confirmation: 'HTL-889900', phone: '+81-3-1234-5678',
        url: 'https://www.booking.com/', price: 96000, currency: 'JPY',
        notes: '早餐 7:00–10:00，2F 餐廳',
      },
    ],
    plans: [
      { date: d(0), time: '14:00', title: '成田特快 N’EX 往新宿', category: 'transport', location: '成田機場第二航廈站', price: 3250, currency: 'JPY' },
      { date: d(0), time: '18:30', title: '思い出橫丁吃晚餐', category: 'food', location: '新宿 思い出横丁' },
      { date: d(1), time: '09:30', title: '明治神宮', category: 'sight', location: '明治神宮' },
      { date: d(1), time: '13:00', title: '表參道・原宿散步', category: 'shopping', location: '表參道' },
      { date: d(1), time: '17:30', title: 'SHIBUYA SKY 看夕陽', category: 'activity', location: 'SHIBUYA SKY', price: 2500, currency: 'JPY', notes: '需事先上網預約時段' },
      { date: d(2), time: '08:00', title: '小田急浪漫特快往箱根', category: 'transport', location: '新宿站' },
      { date: d(2), time: '11:00', title: '箱根空中纜車・大涌谷', category: 'sight', location: '大涌谷' },
      { date: d(3), time: '08:30', title: '築地場外市場吃早餐', category: 'food', location: '築地場外市場' },
      { date: d(3), time: '13:00', title: '六義園賞楓', category: 'sight', location: '六義園', price: 300, currency: 'JPY' },
      { date: d(4), time: '09:00', title: '新宿最後採買', category: 'shopping', location: '新宿' },
    ],
    members: [
      { name: '小美', englishName: 'WANG XIAO-MEI', phone: '+886 912 345 678', notes: '不吃牛肉' },
      { name: '阿哲', englishName: 'CHEN A-ZHE', phone: '+886 987 654 321' },
    ],
    checklist: [
      { text: '護照（效期 6 個月以上）', done: true },
      { text: '電子機票 / 訂位代號', done: true },
      { text: '日幣現金', done: false },
      { text: '網卡 / eSIM', done: false },
      { text: '行動電源', done: false },
      { text: '填寫 Visit Japan Web', done: false },
    ],
  };
}
