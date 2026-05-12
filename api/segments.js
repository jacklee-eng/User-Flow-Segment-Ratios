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

function roundPct(count, total) {
  if (!total) return 0;
  return Math.round((count * 10000) / total) / 100;
}

function sumCounts(ratios, keys) {
  return keys.reduce((sum, key) => sum + (ratios[key]?.count || 0), 0);
}

function makeRatio(count, total, note) {
  const ratio = { pct: roundPct(count, total), count };
  if (note) ratio.note = note;
  return ratio;
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function buildSegmentsOutput(rows) {
  const ratios = {};
  let totalUsers = 0;
  let totalRowFound = false;

  rows.forEach(row => {
    const count = Number(row.user_cnt || 0);
    if (row.final_category === "Z_TOTAL_HOME_USERS") {
      totalUsers = count;
      totalRowFound = true;
      return;
    }

    const key = SEGMENT_MAP[row.final_category];
    if (key) {
      ratios[key] = {
        pct: Number(row.pct),
        count
      };
    }
  });

  if (!totalRowFound) {
    totalUsers = Object.values(ratios).reduce((sum, ratio) => sum + (ratio?.count || 0), 0);
  }

  if (!totalUsers) throw new Error("Total users is 0");

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

  const orderedRatios = {};
  RATIO_ORDER.forEach(key => {
    orderedRatios[key] = ratios[key] === undefined ? null : ratios[key];
  });

  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setUTCDate(periodStart.getUTCDate() - 8);
  const periodEnd = new Date(now);
  periodEnd.setUTCDate(periodEnd.getUTCDate() - 2);

  return {
    updated_at: now.toISOString(),
    period_start: toDateString(periodStart),
    period_end: toDateString(periodEnd),
    total_users: totalUsers,
    source: {
      type: "redash",
      query_id: Number(process.env.REDASH_QUERY_ID || 15388),
      query_name: "UserFlow Segment Ratios Weekly",
      url: "https://redash-contents.datahou.se/queries/15388/source"
    },
    ratios: orderedRatios
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const redashUrl = (process.env.REDASH_URL || "https://redash-contents.datahou.se").replace(/\/$/, "");
  const queryId = process.env.REDASH_QUERY_ID || "15388";
  const apiKey = process.env.REDASH_API_KEY;

  if (!apiKey) {
    res.status(500).json({ error: "Missing REDASH_API_KEY environment variable" });
    return;
  }

  const baseUrls = [
    redashUrl,
    redashUrl.replace(/^https:\/\//, "http://")
  ].filter((url, index, urls) => urls.indexOf(url) === index);

  try {
    const redashData = await fetchRedashResult(baseUrls, queryId, apiKey);
    const rows = redashData?.query_result?.data?.rows;
    if (!Array.isArray(rows)) {
      res.status(502).json({ error: "Invalid Redash result: query_result.data.rows is missing" });
      return;
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
    res.status(200).json(buildSegmentsOutput(rows));
  } catch (err) {
    res.status(500).json({
      error: err.message,
      cause: err.cause?.message,
      name: err.name
    });
  }
};

async function fetchRedashResult(baseUrls, queryId, apiKey) {
  const errors = [];

  for (const baseUrl of baseUrls) {
    const url = `${baseUrl}/api/queries/${queryId}/results.json?api_key=${encodeURIComponent(apiKey)}`;
    try {
      const redashResponse = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "UserFlowSegmentRatios/1.0"
        },
        signal: AbortSignal.timeout(15000)
      });
      const body = await redashResponse.text();

      if (redashResponse.ok) return JSON.parse(body);

      errors.push(`${baseUrl}: HTTP ${redashResponse.status} ${body.slice(0, 300)}`);
    } catch (err) {
      errors.push(`${baseUrl}: ${err.name} ${err.message}${err.cause?.message ? ` (${err.cause.message})` : ""}`);
    }
  }

  throw new Error(`Redash request failed: ${errors.join(" / ")}`);
}
