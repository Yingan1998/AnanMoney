/**
 * Anan Money Google Sheets 同步端點。
 * 部署方式：Google Apps Script Web App，Execute as Me，Who has access: Anyone。
 * GET 使用 JSONP，POST 使用隱藏 iframe + postMessage，避免 GitHub Pages/手機瀏覽器 CORS 限制。
 */
const SYNC_TOKEN = "AnanMoney1998";
const USER_KEY_COLUMN = "使用者ID";

const TABLES = [
  {stateKey: "transactions", sheet: "記帳紀錄", legacy: "Transactions", description: "收入、支出、轉帳與信用卡刷卡紀錄", columns: {
    id: ["ID", "文字"], type: ["類型", "文字：expense/income/transfer"], amount: ["金額", "數字"], date: ["日期", "日期 yyyy-MM-dd"],
    category: ["分類", "文字"], subcategory: ["子分類", "文字"], account: ["帳戶或信用卡ID", "文字"], projectId: ["專案ID", "文字"],
    note: ["備註", "文字"], party: ["付款者", "文字：self/other"], splitId: ["分帳ID", "文字"], from: ["轉出帳戶ID", "文字"], to: ["轉入帳戶ID", "文字"]
  }},
  {stateKey: "accounts", sheet: "帳戶", legacy: "Accounts", description: "銀行、現金、電子支付與其他資產帳戶", columns: {
    id: ["ID", "文字"], name: ["名稱", "文字"], type: ["資產分類", "文字"], currency: ["幣別", "文字"], balance: ["餘額", "數字"], memo: ["備註", "文字"], sortOrder: ["排序", "數字"]
  }},
  {stateKey: "projects", sheet: "專案", legacy: "Projects", description: "旅行、活動等專案預算", columns: {
    id: ["ID", "文字"], name: ["名稱", "文字"], type: ["類型", "文字"], budget: ["預算", "數字"], start: ["開始日期", "日期 yyyy-MM-dd"], end: ["結束日期", "日期 yyyy-MM-dd"]
  }},
  {stateKey: "cards", sheet: "信用卡", legacy: "Cards", description: "信用卡額度、未繳與繳款資訊", columns: {
    id: ["ID", "文字"], name: ["名稱", "文字"], memo: ["備註", "文字"], limit: ["信用額度", "數字"], balance: ["刷卡未繳總額", "數字"], currentDue: ["本期應繳", "數字"],
    statementDay: ["結帳日", "數字"], dueDay: ["繳款日", "數字"], statementDate: ["下一次結帳日", "日期 yyyy-MM-dd"], dueDate: ["本期繳款截止日", "日期 yyyy-MM-dd"],
    paymentAccountId: ["繳款帳戶ID", "文字"], sortOrder: ["排序", "數字"]
  }},
  {stateKey: "splits", sheet: "分帳", legacy: "Splits", description: "未結清分帳資料", columns: {
    id: ["ID", "文字"], person: ["對象", "文字"], amount: ["金額", "數字"], direction: ["方向", "文字：owed_to_me/i_owe"], settled: ["是否結清", "布林"], date: ["日期", "日期 yyyy-MM-dd"], note: ["備註", "文字"]
  }},
  {stateKey: "stocks", sheet: "股票", legacy: "Stocks", description: "持股、成本與報價", columns: {
    code: ["代號", "文字"], name: ["名稱", "文字"], shares: ["股數", "數字"], cost: ["平均成本", "數字"], lastPrice: ["最後價格", "數字"], lastUpdated: ["最後更新", "文字/日期"], manualPrice: ["手動價格", "數字"]
  }},
  {stateKey: "funds", sheet: "基金", legacy: "Funds", description: "基金單位與淨值", columns: {
    id: ["ID", "文字"], name: ["名稱", "文字"], nickname: ["暱稱", "文字"], units: ["單位數", "數字"], cost: ["成本", "數字"], nav: ["淨值", "數字"]
  }},
  {stateKey: "goals", sheet: "目標", legacy: "Goals", description: "儲蓄目標", columns: {
    id: ["ID", "文字"], name: ["名稱", "文字"], target: ["目標金額", "數字"], saved: ["已存金額", "數字"]
  }},
  {stateKey: "events", sheet: "行事曆", legacy: "Events", description: "行事曆事件", columns: {
    id: ["ID", "文字"], date: ["日期", "日期 yyyy-MM-dd"], title: ["標題", "文字"], color: ["顏色", "文字 HEX"]
  }},
  {stateKey: "recurring", sheet: "定期收支", legacy: "Recurring", description: "預留定期收支", columns: {
    id: ["ID", "文字"], type: ["類型", "文字"], amount: ["金額", "數字"], category: ["分類", "文字"], account: ["帳戶ID", "文字"], note: ["備註", "文字"]
  }},
  {stateKey: "balanceHistory", sheet: "餘額歷程", legacy: "BalanceHistory", description: "帳戶餘額手動修改紀錄", columns: {
    id: ["ID", "文字"], accountId: ["帳戶ID", "文字"], oldBalance: ["修改前餘額", "數字"], newBalance: ["修改後餘額", "數字"], changedAt: ["修改時間", "日期時間"], note: ["備註", "文字"]
  }}
];

const META_TABLE = {sheet: "中繼資料", legacy: "Metadata", description: "每位使用者的全域彙總資料", columns: {key: ["鍵", "文字"], value: ["值", "文字/數字"]}};
const SETTINGS_TABLE = {sheet: "設定", legacy: "Settings", description: "每位使用者的前端設定 JSON", columns: {json: ["設定JSON", "JSON 文字"]}};
const SCHEMA_SHEET = "資料表結構";

// doGet：提供 ping/load，支援 JSONP，讓 GitHub Pages 與手機瀏覽器可以避開 CORS 下載資料。
function doGet(e) {
  const callback = e.parameter.callback || "";
  try {
    authorize_(e.parameter.token || "");
    const userKey = normalizeUserKey_(e.parameter.userKey || e.parameter.profile || "default");
    const action = e.parameter.action || "ping";
    if (action === "ping") return output_({ok: true, message: "connected", userKey: userKey}, callback);
    if (action === "load") return output_({ok: true, data: readState_(userKey), userKey: userKey}, callback);
    return output_({ok: false, error: "Unsupported action"}, callback);
  } catch (error) {
    return output_({ok: false, error: error.message}, callback);
  }
}

// doPost：接收前端整包 state，只更新目前 userKey 的資料列，不覆蓋其他使用者。
function doPost(e) {
  const requestId = e.parameter.requestId || "";
  try {
    const rawPayload = e.parameter.payload || (e.postData && e.postData.contents) || "{}";
    const payload = JSON.parse(rawPayload);
    authorize_(payload.token || "");
    if (payload.action !== "save" || !payload.data) throw new Error("Invalid save request");
    const userKey = normalizeUserKey_(payload.userKey || e.parameter.userKey || payload.data.settings && payload.data.settings.googleEmail || "default");
    writeState_(payload.data, userKey);
    return postOutput_({ok: true, message: "saved", userKey: userKey}, requestId);
  } catch (error) {
    return postOutput_({ok: false, error: error.message}, requestId);
  }
}

function authorize_(token) {
  if (SYNC_TOKEN && SYNC_TOKEN !== "CHANGE_ME" && token !== SYNC_TOKEN) throw new Error("Invalid sync token");
}

function normalizeUserKey_(value) {
  const key = String(value || "").trim().toLowerCase().replace(/[^a-z0-9@._-]+/g, "-").replace(/^-|-$/g, "");
  return key || "default";
}

// writeState_：把前端 state 拆成多個繁中工作表，並同步輸出資料表結構說明。
function writeState_(state, userKey) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  TABLES.forEach(function (table) {
    writeRows_(spreadsheet, table, state[table.stateKey] || [], userKey);
  });
  writeRows_(spreadsheet, META_TABLE, [{key: "budget", value: state.budget || 0}], userKey);
  writeRows_(spreadsheet, SETTINGS_TABLE, [{json: JSON.stringify(state.settings || {})}], userKey);
  writeSchema_(spreadsheet);
}

// readState_：只讀取目前 userKey 的資料；舊版沒有使用者ID的資料歸到 default。
function readState_(userKey) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const state = {budget: 0, settings: {}};
  TABLES.forEach(function (table) {
    state[table.stateKey] = readRows_(spreadsheet, table, userKey);
  });
  readRows_(spreadsheet, META_TABLE, userKey).forEach(function (row) {
    if (row.key === "budget") state.budget = Number(row.value) || 0;
  });
  const settings = readRows_(spreadsheet, SETTINGS_TABLE, userKey);
  if (settings[0] && settings[0].json) {
    state.settings = typeof settings[0].json === "string" ? JSON.parse(settings[0].json) : settings[0].json;
  }
  return state;
}

// writeRows_：保留其他 userKey 的既有資料，只替換目前使用者的資料列。
function writeRows_(spreadsheet, table, rows, userKey) {
  const sheet = spreadsheet.getSheetByName(table.sheet) || spreadsheet.insertSheet(table.sheet);
  const keys = Object.keys(table.columns);
  const headers = [USER_KEY_COLUMN].concat(keys.map(function (key) { return table.columns[key][0]; }));
  const existingRows = readStoredRows_(spreadsheet, table);
  const preservedRows = existingRows.filter(function (row) { return row.__userKey !== userKey; });
  const nextRows = preservedRows.concat((rows || []).map(function (row) {
    const copy = Object.assign({}, row);
    copy.__userKey = userKey;
    return copy;
  }));
  const values = [headers];
  nextRows.forEach(function (row) {
    values.push([row.__userKey || "default"].concat(keys.map(function (key) {
      const value = row[key];
      return value === undefined || value === null ? "" : typeof value === "object" ? JSON.stringify(value) : value;
    })));
  });
  sheet.clearContents();
  sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

// readRows_：將試算表的繁中欄位名稱轉回程式 key，並依 userKey 過濾。
function readRows_(spreadsheet, table, userKey) {
  return readStoredRows_(spreadsheet, table).filter(function (row) {
    return row.__userKey === userKey;
  }).map(function (row) {
    const clean = Object.assign({}, row);
    delete clean.__userKey;
    return clean;
  });
}

function readStoredRows_(spreadsheet, table) {
  const sheet = spreadsheet.getSheetByName(table.sheet) || spreadsheet.getSheetByName(table.legacy);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map(function (header) { return String(header); });
  const headerToKey = headerMap_(table);
  const userIndex = headers.indexOf(USER_KEY_COLUMN) >= 0 ? headers.indexOf(USER_KEY_COLUMN) : headers.indexOf("userKey");
  return values.filter(function (row) {
    return row.some(function (value) { return value !== ""; });
  }).map(function (row) {
    const result = {__userKey: normalizeUserKey_(userIndex >= 0 ? row[userIndex] : "default")};
    headers.forEach(function (header, index) {
      if (index === userIndex) return;
      const key = headerToKey[header] || header;
      let value = row[index];
      if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
        value = Utilities.formatDate(value, spreadsheet.getSpreadsheetTimeZone(), "yyyy-MM-dd");
      } else if (typeof value === "string" && /^[\[{]/.test(value)) {
        try { value = JSON.parse(value); } catch (error) {}
      }
      result[key] = value;
    });
    return result;
  });
}

// headerMap_：同時支援繁中欄名與舊版英文欄名，讓舊資料能無痛回載。
function headerMap_(table) {
  const map = {};
  Object.keys(table.columns).forEach(function (key) {
    map[key] = key;
    map[table.columns[key][0]] = key;
  });
  return map;
}

// writeSchema_：產生「資料表結構」分頁，供使用者與維護者查欄位用途與型態。
function writeSchema_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(SCHEMA_SHEET) || spreadsheet.insertSheet(SCHEMA_SHEET);
  const rows = [["分頁", "英文舊分頁", "資料用途", "欄位", "程式欄位", "欄位型態"]];
  TABLES.concat([META_TABLE, SETTINGS_TABLE]).forEach(function (table) {
    rows.push([table.sheet, table.legacy || "", table.description || "系統資料", USER_KEY_COLUMN, "userKey", "文字：同步使用者識別"]);
    Object.keys(table.columns).forEach(function (key) {
      rows.push([table.sheet, table.legacy || "", table.description || "系統資料", table.columns[key][0], key, table.columns[key][1]]);
    });
  });
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, rows[0].length);
}

function output_(value, callback) {
  if (callback) return jsonp_(callback, value);
  return json_(value);
}

function postOutput_(value, requestId) {
  if (!requestId) return json_(value);
  const message = {ananSheetSync: true, requestId: String(requestId), result: value};
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><script>parent.postMessage(' + JSON.stringify(message) + ', "*");</script>');
}

function jsonp_(callback, value) {
  if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(callback)) return json_({ok: false, error: "Invalid callback"});
  return ContentService.createTextOutput(callback + "(" + JSON.stringify(value) + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}