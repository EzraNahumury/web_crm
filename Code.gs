// ========================================
// PRODUKSI MANAGER - Google Apps Script v3
// ========================================
// UPDATE:
// - Tambah field nomor WhatsApp customer
// - Siapkan link tracking order
// - Link tracking dikirim manual oleh admin, belum auto-send WhatsApp
// Paste ulang kode ini di Apps Script lalu Deploy ulang (New Deployment)
// ========================================

var SPREADSHEET_ID = '1E3oCRt8DevHg4JWTbZo9wxch2rKA2srR17bNKj-HdAE';
var SHEET_NAME = 'Sheet1'; // Ganti jika nama tab sheet berbeda
var DATA_START_ROW = 5;
var DAILY_CAPACITY = 200;
var CACHE_TTL = 25; // seconds for CacheService

var USERS = {
  'admin':              { password: 'admin',    role: 'admin' },
  'admin@gmail.com':    { password: 'admin123', role: 'admin' },
  'cs':                 { password: 'cs',       role: 'cs' },
  'produksi':           { password: 'produksi', role: 'produksi' }
};

var COL = {
  NO: 1, CUSTOMER: 2, QTY: 3, PAKET1: 4, PAKET2: 5,
  KETERANGAN: 6, BAHAN: 7, DP_PRODUKSI: 8, DL_CUST: 9,
  TGL_SELESAI: 10, NO_WO: 11,
  PROOFING: 12, WAITINGLIST: 13, PRINT: 14, PRES: 15, CUT_FABRIC: 16,
  JAHIT: 17, QC: 18, FINISHING: 19, PENGIRIMAN: 20,
  STATUS: 21, TGL_KIRIM: 22, NO_WHATSAPP: 23, SALLARY_PRODUCT: 24, SALLARY_PENGIRIMAN: 25
};

var STAGE_COLS = {
  PROOFING: 12, WAITINGLIST: 13, PRINT: 14, PRES: 15,
  CUT_FABRIC: 16, JAHIT: 17, QC_JAHIT_STEAM: 18,
  FINISHING: 19, PENGIRIMAN: 20
};

// ====== ENTRY POINTS ======

function doGet(e) {
  var params = e.parameter || {};
  var body = {};

  // Body sent as JSON string in URL param (POST-via-GET pattern)
  if (params.body) {
    try { body = JSON.parse(decodeURIComponent(params.body)); } catch(err) {
      try { body = JSON.parse(params.body); } catch(err2) {}
    }
  }

  var action = body.action || params.action || '';
  return dispatch(action, body, params);
}

function doPost(e) {
  var params = e.parameter || {};
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch(err) {}
  var action = body.action || params.action || '';
  return dispatch(action, body, params);
}

function dispatch(action, body, params) {
  var output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  try {
    var result;
    if (action === 'login')          result = doLogin(body);
    else if (action === 'getOrders') result = getOrders();
    else if (action === 'addOrder')  result = addOrder(body);
    else if (action === 'updateOrder')    result = updateOrder(body);
    else if (action === 'updateProgress') result = updateProgress(body);
    else if (action === 'getDashboard')   result = getDashboard();
    else if (action === 'getCapacity')    result = getCapacity();
    else if (action === 'getTracking')    result = getTracking(body, params);
    else result = { success: false, error: 'Action tidak dikenal: ' + action };
    output.setContent(JSON.stringify(result));
  } catch(err) {
    output.setContent(JSON.stringify({ success: false, error: err.toString() }));
  }
  return output;
}

// ====== AUTH ======

function doLogin(data) {
  var u = USERS[data.username || ''];
  if (!u || u.password !== (data.password || ''))
    return { success: false, error: 'Username atau password salah' };
  return { success: true, data: { username: data.username, role: u.role } };
}

// ====== SHEET ======

function getSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
}

function fmtDate(val) {
  if (!val && val !== 0) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }
  var s = val.toString();
  // Already DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;
  var d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy');
}

// Parse DD/MM/YYYY string → Date object (unambiguous storage)
function parseDDMMYYYY(s) {
  if (!s) return '';
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  return s;
}

function boolVal(v) {
  return v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1';
}

function normalizeWhatsAppNumber(v) {
  var raw = (v || '').toString().replace(/[^\d+]/g, '');
  if (!raw) return '';
  if (raw.indexOf('+') === 0) raw = raw.slice(1);
  raw = raw.replace(/\D/g, '');
  if (raw.indexOf('0') === 0) return '62' + raw.slice(1);
  if (raw.indexOf('62') === 0) return raw;
  return raw;
}

function buildTrackingPath(noWO) {
  if (!noWO) return '';
  return '/tracking/' + encodeURIComponent(noWO.toString());
}

// ====== GET ORDERS (with CacheService) ======

function getOrders() {
  // Try cache first
  var cache = CacheService.getScriptCache();
  var cached = cache.get('orders_v2');
  if (cached) {
    try { return JSON.parse(cached); } catch(e) {}
  }

  var result = fetchOrdersFromSheet();

  // Store in cache
  try {
    var str = JSON.stringify(result);
    if (str.length < 100000) { // CacheService limit 100KB per item
      cache.put('orders_v2', str, CACHE_TTL);
    }
  } catch(e) {}

  return result;
}

function fetchOrdersFromSheet() {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return { success: true, data: [] };

  var numRows = lastRow - DATA_START_ROW + 1;
  var data = sheet.getRange(DATA_START_ROW, 1, numRows, COL.SALLARY_PENGIRIMAN).getValues();

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var orders = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (!row[COL.CUSTOMER - 1]) continue;

    var prog = {
      PROOFING:       boolVal(row[COL.PROOFING - 1]),
      WAITINGLIST:    boolVal(row[COL.WAITINGLIST - 1]),
      PRINT:          boolVal(row[COL.PRINT - 1]),
      PRES:           boolVal(row[COL.PRES - 1]),
      CUT_FABRIC:     boolVal(row[COL.CUT_FABRIC - 1]),
      JAHIT:          boolVal(row[COL.JAHIT - 1]),
      QC_JAHIT_STEAM: boolVal(row[COL.QC - 1]),
      FINISHING:      boolVal(row[COL.FINISHING - 1]),
      PENGIRIMAN:     boolVal(row[COL.PENGIRIMAN - 1])
    };

    var status = (row[COL.STATUS - 1] || '').toString();
    if (!status) {
      if (prog.PENGIRIMAN) status = 'DONE';
      else if (prog.PROOFING || prog.WAITINGLIST || prog.PRINT || prog.PRES ||
               prog.CUT_FABRIC || prog.JAHIT || prog.QC_JAHIT_STEAM || prog.FINISHING) {
        status = 'IN_PROGRESS';
      } else { status = 'OPEN'; }
    }

    var tglSelesai = fmtDate(row[COL.TGL_SELESAI - 1]);
    var dlCust     = fmtDate(row[COL.DL_CUST - 1]);
    var daysLeft = null;
    var riskLevel = 'NORMAL';
    var dlStr = tglSelesai || dlCust;

    if (dlStr) {
      var parts = dlStr.split('/');
      if (parts.length === 3) {
        var dl = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        daysLeft = Math.floor((dl.getTime() - today.getTime()) / 86400000);
        if (status === 'DONE') riskLevel = 'SAFE';
        else if (daysLeft < 0) riskLevel = 'OVERDUE';
        else if (daysLeft <= 3) {
          riskLevel = (lastStageIdx(prog) <= 5) ? 'HIGH' : 'NEAR';
        }
      }
    }

    var noWorkOrder = (function() {
      var v = (row[COL.NO_WO - 1] || '').toString();
      if (v === '' || v === 'true' || v === 'false' || v === 'TRUE' || v === 'FALSE') {
        var n = parseInt(row[COL.NO - 1]) || (i + 1);
        return n < 10 ? '000' + n : n < 100 ? '00' + n : n < 1000 ? '0' + n : '' + n;
      }
      return v;
    })();

    orders.push({
      rowIndex: DATA_START_ROW + i,
      no: row[COL.NO - 1] || (i + 1),
      customer: (row[COL.CUSTOMER - 1] || '').toString(),
      customerPhone: normalizeWhatsAppNumber(row[COL.NO_WHATSAPP - 1]),
      sallaryProduct: parseInt(row[COL.SALLARY_PRODUCT - 1]) || 0,
      sallaryShipping: parseInt(row[COL.SALLARY_PENGIRIMAN - 1]) || 0,
      qty: parseInt(row[COL.QTY - 1]) || 0,
      paket1: (row[COL.PAKET1 - 1] || '').toString(),
      paket2: (row[COL.PAKET2 - 1] || '').toString(),
      keterangan: (row[COL.KETERANGAN - 1] || '').toString(),
      bahan: (row[COL.BAHAN - 1] || '').toString(),
      dpProduksi: fmtDate(row[COL.DP_PRODUKSI - 1]),
      dlCust: dlCust,
      noWorkOrder: noWorkOrder,
      trackingLink: buildTrackingPath(noWorkOrder),
      tglSelesai: tglSelesai,
      status: status,
      progress: prog,
      tglKirim: fmtDate(row[COL.TGL_KIRIM - 1]),
      daysLeft: daysLeft,
      riskLevel: riskLevel
    });
  }

  return { success: true, data: orders };
}

function lastStageIdx(prog) {
  var keys = ['PROOFING','WAITINGLIST','PRINT','PRES','CUT_FABRIC','JAHIT','QC_JAHIT_STEAM','FINISHING','PENGIRIMAN'];
  var last = -1;
  for (var i = 0; i < keys.length; i++) { if (prog[keys[i]]) last = i; }
  return last;
}

// ====== ADD ORDER ======

function addOrder(data) {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  var newRow = Math.max(lastRow + 1, DATA_START_ROW);
  var no = newRow - DATA_START_ROW + 1;
  var qty = parseInt(data.qty) || 0;
  var tglSelesai = calcTglSelesai(qty, sheet);
  var noWO = makeWO(no);

  var rowData = [
    no,
    data.customer || '',
    qty,
    data.paket1 || '',
    data.paket2 || '',
    data.keterangan || '',
    data.bahan || '',
    parseDDMMYYYY(data.dpProduksi || ''),
    parseDDMMYYYY(data.dlCust || ''),
    tglSelesai,  // J (10) - TGL_SELESAI
    noWO,        // K (11) - NO_WO
    false, false, false, false, false, false, false, false, false, // L–T (12-20) stages
    'OPEN', '',
    normalizeWhatsAppNumber(data.customerPhone || ''),
    parseInt(data.sallaryProduct) || 0,
    parseInt(data.sallaryShipping) || 0
  ];

  sheet.getRange(newRow, 1, 1, rowData.length).setValues([rowData]);

  // Set checkbox validation on stage columns
  try {
    var rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    sheet.getRange(newRow, COL.PROOFING, 1, 9).setDataValidation(rule);
  } catch(e) {}

  SpreadsheetApp.flush();

  // Invalidate cache
  try { CacheService.getScriptCache().remove('orders_v2'); } catch(e) {}

  return {
    success: true,
    data: {
      rowIndex: newRow,
      no: no,
      noWorkOrder: noWO,
      tglSelesai: tglSelesai,
      customerPhone: normalizeWhatsAppNumber(data.customerPhone || ''),
      sallaryProduct: parseInt(data.sallaryProduct) || 0,
      sallaryShipping: parseInt(data.sallaryShipping) || 0,
      trackingLink: buildTrackingPath(noWO)
    }
  };
}

function calcTglSelesai(qty, sheet) {
  var lastRow = sheet.getLastRow();
  var dailyUsage = {};

  if (lastRow >= DATA_START_ROW) {
    var n = lastRow - DATA_START_ROW + 1;
    var qtyVals = sheet.getRange(DATA_START_ROW, COL.QTY, n, 1).getValues();
    var dpVals  = sheet.getRange(DATA_START_ROW, COL.DP_PRODUKSI, n, 1).getValues();
    var stVals  = sheet.getRange(DATA_START_ROW, COL.STATUS, n, 1).getValues();
    for (var i = 0; i < n; i++) {
      if (dpVals[i][0] && stVals[i][0] !== 'DONE') {
        var k = fmtDate(dpVals[i][0]);
        if (k) dailyUsage[k] = (dailyUsage[k] || 0) + (parseInt(qtyVals[i][0]) || 0);
      }
    }
  }

  var rem = qty;
  var cur = new Date();
  cur.setHours(0, 0, 0, 0);
  var lastAlloc = null;

  for (var day = 0; day < 365 && rem > 0; day++) {
    var key = fmtDate(cur);
    var used = dailyUsage[key] || 0;
    var avail = DAILY_CAPACITY - used;
    if (avail > 0) {
      rem -= Math.min(rem, avail);
      lastAlloc = new Date(cur.getTime());
    }
    cur.setDate(cur.getDate() + 1);
  }

  if (!lastAlloc) return '';
  lastAlloc.setDate(lastAlloc.getDate() + 14);
  return fmtDate(lastAlloc);
}

function makeWO(no) {
  var d = new Date();
  var y = d.getFullYear().toString().slice(-2);
  var m = d.getMonth() + 1;
  var mStr = m < 10 ? '0' + m : '' + m;
  var nStr = no < 10 ? '00' + no : no < 100 ? '0' + no : '' + no;
  return 'WO' + y + mStr + '-' + nStr;
}

// ====== UPDATE ORDER ======

function updateOrder(data) {
  if (!data.rowIndex) return { success: false, error: 'rowIndex diperlukan' };
  var sheet = getSheet();
  var ri = parseInt(data.rowIndex);
  var map = {
    customer: COL.CUSTOMER, qty: COL.QTY, paket1: COL.PAKET1, paket2: COL.PAKET2,
    keterangan: COL.KETERANGAN, bahan: COL.BAHAN, dpProduksi: COL.DP_PRODUKSI, dlCust: COL.DL_CUST,
    customerPhone: COL.NO_WHATSAPP,
    sallaryProduct: COL.SALLARY_PRODUCT,
    sallaryShipping: COL.SALLARY_PENGIRIMAN
  };
  for (var key in map) {
    if (data[key] !== undefined && data[key] !== null) {
      var value = data[key];
      if (key === 'dpProduksi' || key === 'dlCust') value = parseDDMMYYYY(value);
      if (key === 'customerPhone') value = normalizeWhatsAppNumber(value);
      if (key === 'sallaryProduct' || key === 'sallaryShipping') value = parseInt(value) || 0;
      sheet.getRange(ri, map[key]).setValue(value);
    }
  }
  SpreadsheetApp.flush();
  try { CacheService.getScriptCache().remove('orders_v2'); } catch(e) {}
  return { success: true };
}

// ====== TRACKING ======

function getTracking(body, params) {
  var noWO = (
    body.noWorkOrder ||
    body.trackingCode ||
    params.noWorkOrder ||
    params.trackingCode ||
    ''
  ).toString().trim().toUpperCase();

  if (!noWO) return { success: false, error: 'noWorkOrder diperlukan' };

  var res = getOrders();
  if (!res.success) return res;

  for (var i = 0; i < res.data.length; i++) {
    var order = res.data[i];
    if ((order.noWorkOrder || '').toString().toUpperCase() === noWO) {
      return { success: true, data: order };
    }
  }

  return { success: false, error: 'Tracking order tidak ditemukan' };
}

// ====== UPDATE PROGRESS (checkbox) ======

function updateProgress(data) {
  var ri = parseInt(data.rowIndex);
  var stage = data.stage;

  if (!ri || !stage) return { success: false, error: 'rowIndex dan stage diperlukan' };

  var col = STAGE_COLS[stage];
  if (!col) return { success: false, error: 'Stage tidak valid: ' + stage };

  var checked = boolVal(data.checked);
  var sheet = getSheet();

  // Write checkbox value
  sheet.getRange(ri, col).setValue(checked);

  if (stage === 'PENGIRIMAN' && checked) {
    sheet.getRange(ri, COL.STATUS).setValue('DONE');
    if (data.tglKirim) sheet.getRange(ri, COL.TGL_KIRIM).setValue(data.tglKirim);
  } else if (checked) {
    var curStatus = sheet.getRange(ri, COL.STATUS).getValue().toString();
    if (curStatus === 'OPEN' || curStatus === '') {
      sheet.getRange(ri, COL.STATUS).setValue('IN_PROGRESS');
    }
  }

  // Force commit
  SpreadsheetApp.flush();

  // Invalidate cache
  try { CacheService.getScriptCache().remove('orders_v2'); } catch(e) {}

  return { success: true };
}

// ====== DASHBOARD ======

function getDashboard() {
  var res = getOrders();
  if (!res.success) return res;
  var orders = res.data;

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var todayKey = fmtDate(today);

  var stats = {
    totalOrders: orders.length,
    openOrders: 0, inProgressOrders: 0, doneOrders: 0,
    nearDeadlineCount: 0, overdueCount: 0, highRiskCount: 0,
    todayCapacity: DAILY_CAPACITY, dailyCapacityUsed: 0,
    stageCounts: {}
  };

  var stageKeys = ['PROOFING','WAITINGLIST','PRINT','PRES','CUT_FABRIC','JAHIT','QC_JAHIT_STEAM','FINISHING','PENGIRIMAN'];

  for (var i = 0; i < orders.length; i++) {
    var o = orders[i];
    if (o.status === 'OPEN') stats.openOrders++;
    else if (o.status === 'IN_PROGRESS') stats.inProgressOrders++;
    else if (o.status === 'DONE') stats.doneOrders++;

    if (o.riskLevel === 'NEAR' || o.riskLevel === 'HIGH') stats.nearDeadlineCount++;
    if (o.riskLevel === 'OVERDUE') stats.overdueCount++;
    if (o.riskLevel === 'HIGH') stats.highRiskCount++;

    if (o.dpProduksi === todayKey && o.status !== 'DONE') {
      stats.dailyCapacityUsed += parseInt(o.qty) || 0;
    }

    if (o.status !== 'DONE') {
      var idx = lastStageIdx(o.progress);
      var sk = idx >= 0 ? stageKeys[idx] : 'OPEN';
      stats.stageCounts[sk] = (stats.stageCounts[sk] || 0) + 1;
    }
  }

  return { success: true, data: stats };
}

// ====== CAPACITY ======

function getCapacity() {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return { success: true, data: {} };

  var n = lastRow - DATA_START_ROW + 1;
  var qtyVals = sheet.getRange(DATA_START_ROW, COL.QTY, n, 1).getValues();
  var dpVals  = sheet.getRange(DATA_START_ROW, COL.DP_PRODUKSI, n, 1).getValues();
  var stVals  = sheet.getRange(DATA_START_ROW, COL.STATUS, n, 1).getValues();

  var daily = {};
  for (var i = 0; i < n; i++) {
    if (dpVals[i][0] && stVals[i][0] !== 'DONE') {
      var k = fmtDate(dpVals[i][0]);
      if (k) daily[k] = (daily[k] || 0) + (parseInt(qtyVals[i][0]) || 0);
    }
  }
  return { success: true, data: daily };
}
