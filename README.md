# AnanMoney

AnanMoney 是一個以單頁 HTML 為主的個人記帳工具，資料預設儲存在瀏覽器 `localStorage`，並可透過 Google Apps Script Web App 同步到 Google 試算表。

## 主要功能

- 每日收支日曆首頁，可依日期查看、編輯、刪除記帳紀錄。
- 收入、支出、轉帳與分帳紀錄。
- 帳戶、信用卡、股票、專案與資產總覽。
- 信用卡可綁定繳款帳戶，估算本期繳款前需要補進銀行的金額。
- 資料可匯出 JSON 備份或指定區間 CSV。
- Google 試算表同步：GET 使用 JSONP，POST 使用隱藏 iframe，避開 GitHub Pages/手機瀏覽器 CORS 限制。

## 使用方式

1. 開啟 `index.html` 或部署到 GitHub Pages。
2. 預設 PIN 為 `0000`。
3. 若要同步 Google 試算表，請將 `google-apps-script/Code.gs` 部署為 Web App：
   - Execute as：Me
   - Who has access：Anyone
   - 站台管理者可在 `SHEET_SYNC_DEFAULTS.url` 設定一組共用 `/exec` Web App；一般使用者不需要自己部署 GAS。
   - GAS 會用 `使用者ID` 欄位分流資料；使用者同步前需註冊 profile 或填 Google Email。
4. 手機端若無法同步，請在設定中心使用「手機連線診斷」並確認：
   - 網址是 `/exec`，不是 `/dev`。
   - 安全碼與 `Code.gs` 的 `SYNC_TOKEN` 完全相同。
   - 手機使用 HTTPS 的 GitHub Pages 網址。

## 程式架構速讀

- `index.html`：主要 UI、資料狀態、渲染與互動邏輯。
- `google-apps-script/Code.gs`：Google 試算表同步端點。
- `stock-proxy.php`：本機 PHP 股票行情代理，主要給 XAMPP 本機測試用。

## 版本修改歷程

### 2026-09-22
- 新增多使用者 profile 資料分離，每位使用者會使用獨立的瀏覽器資料庫 key。
- 共用 GAS 同步支援 `userKey` 分流，單一試算表可保存多位使用者資料且互不覆蓋。
- Google Email 可綁定到使用者 profile，每位使用者可保存自己的 GAS/試算表同步設定。
- Google Apps Script 同步分頁與欄位改為繁體中文，並新增「資料表結構」分頁說明欄位型態。

- 補上中文模組註解與 README。
- 修正記帳紀錄的編輯/刪除按鈕在手機上的尺寸與換行。
- 記帳分類與子分類改為可自由輸入，並保留建議選項。
- 行事曆提供更多標籤顏色。
- 日曆週末改紅字，並內建 2026 台灣國定假日/補假底色標記。
- 信用卡可綁定繳款帳戶，顯示應補入銀行帳戶的金額。
- 帳戶與信用卡新增上移/下移排序控制。
- 收據掃描改為電子發票 QR Code/文字解析雛形，結果帶入記帳備註。
- 新增指定區間或全部資料 CSV 匯出。
- 新增本機帳號註冊/切換雛形，為未來多人使用預留資料欄位。
- 強化手機 Google Sheets/GAS 同步診斷，分享連結可選擇帶入同步安全碼。

### 2026-09-21

- 每日收支改為首頁，返回鍵與頭像回到首頁。
- 資產金額隱藏改為帳戶個別控制。
- 支出可選信用卡，並累加信用卡未繳總額。
- 新增記帳紀錄編輯與刪除。
- 修正 Google 試算表回載日期偏移問題。
- 設定 Google Apps Script 預設 Web App URL。

## 注意事項

- 目前「本機帳號」與 Google Email 綁定是 profile 分流，不是正式 Google OAuth 登入；若把同步安全碼放在公開前端，任何訪客都可能取得。正式多人登入建議改接 Firebase/Auth、Supabase 或自建後端。
- 電子發票掃描依賴瀏覽器 `BarcodeDetector`；不支援時可貼上 QR Code 文字或明細文字解析。
- 2026 假日資料參考行政院人事行政總處公告，跨年度需更新 `TW_HOLIDAYS`。