/**
 * Anan Money Google Sheets 同步端點。
 * 部署方式：Google Apps Script Web App，Execute as Me，Who has access: Anyone。
 * 手機/GitHub Pages 不走一般 fetch CORS：GET 用 JSONP，POST 用隱藏 iframe + postMessage。
 */
const SYNC_TOKEN = "AnanMoney1998";
const SHEETS = ["Transactions", "Accounts", "Projects", "Cards", "Splits", "Stocks", "Funds", "Goals", "Events", "Recurring", "BalanceHistory", "Metadata", "Settings"];

// doGet：提供 ping/load，支援 callback 參數輸出 JSONP，避免瀏覽器 CORS 擋住下載。
function doGet(e) {
  const callback = e.parameter.callback || "";
  try {
    authorize_(e.parameter.token || "");
    const action = e.parameter.action || "ping";
    if (action === "ping") return output_({ok: true, message: "connected"}, callback);
    if (action === "load") return output_({ok: true, data: readState_()}, callback);
    return output_({ok: false, error: "Unsupported action"}, callback);
  } catch (error) {
    return output_({ok: false, error: error.message}, callback);
  }
}
// doPost：接收整包 state 存入試算表，並用 parent.postMessage 回覆前端 iframe。
function doPost(e) {
  const requestId = e.parameter.requestId || "";
  try {
    const rawPayload = e.parameter.payload || (e.postData && e.postData.contents) || "{}";
    const payload = JSON.parse(rawPayload);
    authorize_(payload.token || "");
    if (payload.action !== "save" || !payload.data) throw new Error("Invalid save request");
    writeState_(payload.data);
    return postOutput_({ok: true, message: "saved"}, requestId);
  } catch (error) {
    return postOutput_({ok: false, error: error.message}, requestId);
  }
}
function authorize_(token) {
  if (SYNC_TOKEN && SYNC_TOKEN !== "CHANGE_ME" && token !== SYNC_TOKEN) {
    throw new Error("Invalid sync token");
  }
}

// writeState_：把前端 state 拆成多個工作表，便於人眼檢查與後續擴充。
function writeState_(state) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const collections = {
    Transactions: state.transactions || [],
    Accounts: state.accounts || [],
    Projects: state.projects || [],
    Cards: state.cards || [],
    Splits: state.splits || [],
    Stocks: state.stocks || [],
    Funds: state.funds || [],
    Goals: state.goals || [],
    Events: state.events || [],
    Recurring: state.recurring || [],
    BalanceHistory: state.balanceHistory || [],
  };
  Object.keys(collections).forEach(function (name) {
    writeRows_(spreadsheet, name, collections[name]);
  });
  writeRows_(spreadsheet, "Metadata", [{key: "budget", value: state.budget || 0}]);
  writeRows_(spreadsheet, "Settings", [{json: JSON.stringify(state.settings || {})}]);
}

// readState_：從所有工作表回組前端 state，日期欄位會在 readRows_ 轉成 yyyy-MM-dd。
function readState_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const state = {
    transactions: readRows_(spreadsheet, "Transactions"),
    accounts: readRows_(spreadsheet, "Accounts"),
    projects: readRows_(spreadsheet, "Projects"),
    cards: readRows_(spreadsheet, "Cards"),
    splits: readRows_(spreadsheet, "Splits"),
    stocks: readRows_(spreadsheet, "Stocks"),
    funds: readRows_(spreadsheet, "Funds"),
    goals: readRows_(spreadsheet, "Goals"),
    events: readRows_(spreadsheet, "Events"),
    recurring: readRows_(spreadsheet, "Recurring"),
    balanceHistory: readRows_(spreadsheet, "BalanceHistory"),
    budget: 0,
    settings: {},
  };
  readRows_(spreadsheet, "Metadata").forEach(function (row) {
    if (row.key === "budget") state.budget = Number(row.value) || 0;
  });
  const settings = readRows_(spreadsheet, "Settings");
  if (settings[0] && settings[0].json) {
    state.settings = typeof settings[0].json === "string" ? JSON.parse(settings[0].json) : settings[0].json;
  }
  return state;
}

function writeRows_(spreadsheet, name, rows) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  sheet.clearContents();
  if (!rows.length) return;
  const columns = Array.from(new Set(rows.reduce(function (all, row) {
    return all.concat(Object.keys(row));
  }, [])));
  const values = [columns].concat(rows.map(function (row) {
    return columns.map(function (column) {
      const value = row[column];
      return value === undefined || value === null ? "" : typeof value === "object" ? JSON.stringify(value) : value;
    });
  }));
  sheet.getRange(1, 1, values.length, columns.length).setValues(values);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, columns.length);
}

function readRows_(spreadsheet, name) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values.filter(function (row) {
    return row.some(function (value) { return value !== ""; });
  }).map(function (row) {
    const result = {};
    headers.forEach(function (header, index) {
      let value = row[index];
      if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
        value = Utilities.formatDate(value, spreadsheet.getSpreadsheetTimeZone(), "yyyy-MM-dd");
      } else if (typeof value === "string" && /^[\[{]/.test(value)) {
        try { value = JSON.parse(value); } catch (error) {}
      }
      result[header] = value;
    });
    return result;
  });
}

function output_(value, callback) {
  if (callback) return jsonp_(callback, value);
  return json_(value);
}

function postOutput_(value, requestId) {
  if (!requestId) return json_(value);
  const message = {
    ananSheetSync: true,
    requestId: String(requestId),
    result: value,
  };
  return HtmlService.createHtmlOutput(
    '<!doctype html><meta charset="utf-8"><script>parent.postMessage(' +
      JSON.stringify(message) +
      ', "*");</script>'
  );
}
function jsonp_(callback, value) {
  if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(callback)) {
    return json_({ok: false, error: "Invalid callback"});
  }
  return ContentService
    .createTextOutput(callback + "(" + JSON.stringify(value) + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}