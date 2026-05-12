const SPREADSHEET_ID_PROPERTY = "SEGMENTS_SPREADSHEET_ID";
const REDASH_URL_PROPERTY = "REDASH_URL";
const REDASH_QUERY_ID_PROPERTY = "REDASH_QUERY_ID";
const REDASH_API_KEY_PROPERTY = "REDASH_API_KEY";

const SEGMENTS_SHEET_NAME = "segments";
const META_SHEET_NAME = "meta";

const SEGMENT_MAP = {
  P1_construction_full: "P1",
  P2_construction_partial: "P2",
  P3_moving_only: "P3",
  P4_newlywed: "P4",
  P5_construction_contract: "P5",
  P6_moving_contract: "P6",
  P8_childbirth: "P8",
  Other_Implicit_LE: "other_implicit_le",
  M1_Purpose_Buy: "M1",
  M2_Context_Explore: "M2",
  M_Undetermined: "M_undetermined"
};

const RATIO_ORDER = [
  "entry",
  "le-axis",
  "nonle-axis",
  "le",
  "nonle",
  "A",
  "B",
  "C",
  "purpose",
  "context",
  "M_undetermined",
  "M1",
  "M2",
  "P1",
  "P2",
  "P3",
  "P4",
  "P5",
  "P6",
  "P7",
  "P8",
  "other_implicit_le"
];

function doGet() {
  const output = readSegmentsFromSheet_();
  return ContentService
    .createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

function updateSegmentsFromRedash() {
  const props = PropertiesService.getScriptProperties();
  const redashUrl = getRequiredProperty_(props, REDASH_URL_PROPERTY).replace(/\/$/, "");
  const queryId = getRequiredProperty_(props, REDASH_QUERY_ID_PROPERTY);
  const apiKey = getRequiredProperty_(props, REDASH_API_KEY_PROPERTY);

  const redashData = fetchRedashQueryResult_(redashUrl, queryId, apiKey);
  const rows = redashData && redashData.query_result && redashData.query_result.data && redashData.query_result.data.rows;
  if (!Array.isArray(rows)) {
    throw new Error("Invalid Redash result: query_result.data.rows is missing");
  }

  const output = buildSegmentsOutput_(rows);
  writeSegmentsToSheet_(output);
  return output;
}

function fetchRedashQueryResult_(redashUrl, queryId, apiKey) {
  const endpoints = [
    {
      label: "Authorization header",
      url: `${redashUrl}/api/queries/${queryId}/results.json`,
      options: {
        method: "get",
        headers: {
          Authorization: `Key ${apiKey}`
        },
        muteHttpExceptions: true
      }
    },
    {
      label: "api_key query parameter",
      url: `${redashUrl}/api/queries/${queryId}/results.json?api_key=${encodeURIComponent(apiKey)}`,
      options: {
        method: "get",
        muteHttpExceptions: true
      }
    }
  ];

  const errors = [];
  for (const endpoint of endpoints) {
    try {
      const response = UrlFetchApp.fetch(endpoint.url, endpoint.options);
      const status = response.getResponseCode();
      const body = response.getContentText();
      if (status >= 200 && status < 300) return JSON.parse(body);
      errors.push(`${endpoint.label}: HTTP ${status} ${body.slice(0, 300)}`);
    } catch (err) {
      errors.push(`${endpoint.label}: ${err.message}`);
    }
  }

  throw new Error(`Redash request failed. ${errors.join(" / ")}`);
}

function installMondayThursdayTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === "updateSegmentsFromRedash")
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger("updateSegmentsFromRedash")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(6)
    .create();

  ScriptApp.newTrigger("updateSegmentsFromRedash")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.THURSDAY)
    .atHour(6)
    .create();
}

function buildSegmentsOutput_(rows) {
  const ratios = {};
  let totalUsers = 0;

  rows.forEach(row => {
    const count = Number(row.user_cnt || 0);
    totalUsers += count;

    const key = SEGMENT_MAP[row.final_category];
    if (key) {
      ratios[key] = {
        pct: Number(row.pct),
        count
      };
    }
  });

  const p1ToP4Count = sumCounts_(ratios, ["P1", "P2", "P3", "P4"]);
  const p5ToP6Count = sumCounts_(ratios, ["P5", "P6"]);
  const p8Count = ratios.P8 ? ratios.P8.count : 0;
  const otherImplicitCount = ratios.other_implicit_le ? ratios.other_implicit_le.count : 0;
  const m1Count = ratios.M1 ? ratios.M1.count : 0;
  const m2Count = ratios.M2 ? ratios.M2.count : 0;
  const undeterminedCount = ratios.M_undetermined ? ratios.M_undetermined.count : 0;

  const aCount = p1ToP4Count + otherImplicitCount;
  const bCount = p5ToP6Count;
  const cCount = p8Count;
  const leCount = aCount + bCount + cCount;
  const nonleCount = m1Count + m2Count + undeterminedCount;

  ratios.entry = makeRatio_(totalUsers, totalUsers, "7일 unique");
  ratios["le-axis"] = makeRatio_(leCount, totalUsers, "LE 유저");
  ratios["nonle-axis"] = makeRatio_(nonleCount, totalUsers, "non LE 유저");
  ratios.le = makeRatio_(leCount, totalUsers);
  ratios.nonle = makeRatio_(nonleCount, totalUsers);
  ratios.A = makeRatio_(
    aCount,
    totalUsers,
    `Explicit ${roundPct_(p1ToP4Count, totalUsers).toFixed(2)}%(${p1ToP4Count.toLocaleString("ko-KR")}) + Implicit ${roundPct_(otherImplicitCount, totalUsers).toFixed(2)}%(${otherImplicitCount.toLocaleString("ko-KR")})`
  );
  ratios.B = makeRatio_(bCount, totalUsers);
  ratios.C = makeRatio_(cCount, totalUsers);
  ratios.purpose = makeRatio_(m1Count, totalUsers);
  ratios.context = makeRatio_(m2Count, totalUsers);
  ratios.P7 = null;

  const orderedRatios = {};
  RATIO_ORDER.forEach(key => {
    orderedRatios[key] = ratios[key] === undefined ? null : ratios[key];
  });

  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - 8);
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() - 2);

  return {
    updated_at: now.toISOString(),
    period_start: formatDate_(periodStart),
    period_end: formatDate_(periodEnd),
    total_users: totalUsers,
    ratios: orderedRatios
  };
}

function readSegmentsFromSheet_() {
  const spreadsheet = getSpreadsheet_();
  const segmentsSheet = getSheet_(spreadsheet, SEGMENTS_SHEET_NAME);
  const metaSheet = getSheet_(spreadsheet, META_SHEET_NAME);

  const meta = {};
  const metaValues = metaSheet.getDataRange().getValues();
  metaValues.slice(1).forEach(row => {
    if (row[0]) meta[row[0]] = row[1];
  });

  const ratios = {};
  const segmentValues = segmentsSheet.getDataRange().getValues();
  segmentValues.slice(1).forEach(row => {
    const key = row[0];
    if (!key) return;
    if (row[1] === "null") {
      ratios[key] = null;
      return;
    }

    const ratio = {
      pct: Number(row[1]),
      count: Number(row[2])
    };
    if (row[3]) ratio.note = String(row[3]);
    ratios[key] = ratio;
  });

  return {
    updated_at: meta.updated_at || new Date().toISOString(),
    period_start: meta.period_start || "",
    period_end: meta.period_end || "",
    total_users: Number(meta.total_users || 0),
    ratios
  };
}

function writeSegmentsToSheet_(output) {
  const spreadsheet = getSpreadsheet_();
  const segmentsSheet = getOrCreateSheet_(spreadsheet, SEGMENTS_SHEET_NAME);
  const metaSheet = getOrCreateSheet_(spreadsheet, META_SHEET_NAME);

  const segmentRows = [["key", "pct", "count", "note"]];
  RATIO_ORDER.forEach(key => {
    const ratio = output.ratios[key];
    if (!ratio) {
      segmentRows.push([key, "null", "", ""]);
      return;
    }
    segmentRows.push([key, ratio.pct, ratio.count, ratio.note || ""]);
  });

  segmentsSheet.clearContents();
  segmentsSheet.getRange(1, 1, segmentRows.length, segmentRows[0].length).setValues(segmentRows);

  const metaRows = [
    ["key", "value"],
    ["updated_at", output.updated_at],
    ["period_start", output.period_start],
    ["period_end", output.period_end],
    ["total_users", output.total_users]
  ];

  metaSheet.clearContents();
  metaSheet.getRange(1, 1, metaRows.length, metaRows[0].length).setValues(metaRows);
}

function getSpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_ID_PROPERTY);
  if (spreadsheetId) return SpreadsheetApp.openById(spreadsheetId);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(spreadsheet, name) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error(`Missing sheet: ${name}`);
  return sheet;
}

function getOrCreateSheet_(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function getRequiredProperty_(props, key) {
  const value = props.getProperty(key);
  if (!value) throw new Error(`Missing script property: ${key}`);
  return value;
}

function makeRatio_(count, total, note) {
  const ratio = {
    pct: roundPct_(count, total),
    count
  };
  if (note) ratio.note = note;
  return ratio;
}

function roundPct_(count, total) {
  if (!total) return 0;
  return Math.round((count * 10000) / total) / 100;
}

function sumCounts_(ratios, keys) {
  return keys.reduce((sum, key) => sum + (ratios[key] ? ratios[key].count : 0), 0);
}

function formatDate_(date) {
  return Utilities.formatDate(date, "Asia/Seoul", "yyyy-MM-dd");
}
