const fs = require("fs");

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/transform.js <redash_result.json> <data/segments.json>");
  process.exit(1);
}

const redashData = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
const rows = redashData?.query_result?.data?.rows;

if (!Array.isArray(rows)) {
  throw new Error("Invalid Redash result: query_result.data.rows is missing");
}

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

function roundPct(count, total) {
  if (!total) return 0;
  return Math.round((count * 10000) / total) / 100;
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function sumCounts(ratios, keys) {
  return keys.reduce((sum, key) => sum + (ratios[key]?.count || 0), 0);
}

function makeRatio(count, total, note) {
  const ratio = { pct: roundPct(count, total), count };
  if (note) ratio.note = note;
  return ratio;
}

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

const p1ToP4Count = sumCounts(ratios, ["P1", "P2", "P3", "P4"]);
const p5ToP6Count = sumCounts(ratios, ["P5", "P6"]);
const p8Count = ratios.P8?.count || 0;
const otherImplicitCount = ratios.other_implicit_le?.count || 0;
const m1Count = ratios.M1?.count || 0;
const m2Count = ratios.M2?.count || 0;
const undeterminedCount = ratios.M_undetermined?.count || 0;

const aCount = p1ToP4Count + otherImplicitCount;
const bCount = p5ToP6Count;
const cCount = p8Count;
const leCount = aCount + bCount + cCount;
const nonleCount = m1Count + m2Count + undeterminedCount;

ratios.entry = makeRatio(totalUsers, totalUsers, "7일 unique");
ratios["le-axis"] = makeRatio(leCount, totalUsers, "LE 유저");
ratios["nonle-axis"] = makeRatio(nonleCount, totalUsers, "non LE 유저");
ratios.le = makeRatio(leCount, totalUsers);
ratios.nonle = makeRatio(nonleCount, totalUsers);
ratios.A = makeRatio(
  aCount,
  totalUsers,
  `Explicit ${roundPct(p1ToP4Count, totalUsers).toFixed(2)}%(${p1ToP4Count.toLocaleString("ko-KR")}) + Implicit ${roundPct(otherImplicitCount, totalUsers).toFixed(2)}%(${otherImplicitCount.toLocaleString("ko-KR")})`
);
ratios.B = makeRatio(bCount, totalUsers);
ratios.C = makeRatio(cCount, totalUsers);
ratios.purpose = makeRatio(m1Count, totalUsers);
ratios.context = makeRatio(m2Count, totalUsers);
ratios.P7 = null;

const orderedRatios = {
  entry: ratios.entry,
  "le-axis": ratios["le-axis"],
  "nonle-axis": ratios["nonle-axis"],
  le: ratios.le,
  nonle: ratios.nonle,
  A: ratios.A,
  B: ratios.B,
  C: ratios.C,
  purpose: ratios.purpose,
  context: ratios.context,
  M_undetermined: ratios.M_undetermined,
  M1: ratios.M1,
  M2: ratios.M2,
  P1: ratios.P1,
  P2: ratios.P2,
  P3: ratios.P3,
  P4: ratios.P4,
  P5: ratios.P5,
  P6: ratios.P6,
  P7: ratios.P7,
  P8: ratios.P8,
  other_implicit_le: ratios.other_implicit_le
};

const now = new Date();
const periodStart = new Date(now);
periodStart.setUTCDate(periodStart.getUTCDate() - 8);
const periodEnd = new Date(now);
periodEnd.setUTCDate(periodEnd.getUTCDate() - 2);

const output = {
  updated_at: now.toISOString(),
  period_start: toDateString(periodStart),
  period_end: toDateString(periodEnd),
  total_users: totalUsers,
  ratios: orderedRatios
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log("Written to", outputPath);
