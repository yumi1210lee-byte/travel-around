// Firebase 專案設定。
// 這些值本來就是設計給網頁公開使用的（不是密碼），資料安全由 Firestore 安全規則控管，
// 規則內容在專案根目錄的 firestore.rules。
// 想停用雲端同步，把這裡改成 export const FIREBASE = null; 即可。
export const FIREBASE = {
  apiKey: 'AIzaSyCGSJR8wdE29FoZn4d4ckQciSZCPMJGsxw',
  projectId: 'travel-around-c483e',
};
