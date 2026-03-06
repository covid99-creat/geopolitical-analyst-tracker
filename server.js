const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");

const EVENT_MATCHERS = [
  {
    eventKey: "ceasefire_partial",
    keywords: ["ceasefire", "truce", "הפסקת אש"]
  },
  {
    eventKey: "un_new_sanctions",
    keywords: ["un sanctions", "security council", "סנקציות"]
  },
  {
    eventKey: "taiwan_full_invasion",
    keywords: ["taiwan", "invasion", "פלישה"]
  },
  {
    eventKey: "brent_above_110",
    keywords: ["brent", "110", "oil", "נפט"]
  }
];

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function inferProbability(text) {
  const lower = text.toLowerCase();
  if (lower.includes("very likely") || lower.includes("highly likely")) {
    return 0.8;
  }
  if (lower.includes("unlikely") || lower.includes("לא סביר")) {
    return 0.35;
  }
  if (lower.includes("likely") || lower.includes("צפוי")) {
    return 0.65;
  }
  return 0.55;
}

function inferDeadline(text, pubDate) {
  const yearMatch = text.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    return `${yearMatch[1]}-12-31`;
  }

  const base = pubDate ? new Date(pubDate) : new Date();
  const inferred = new Date(base);
  inferred.setMonth(inferred.getMonth() + 6);
  return inferred.toISOString().slice(0, 10);
}

function eventKeyFromText(text) {
  const normalized = text.toLowerCase();
  for (const matcher of EVENT_MATCHERS) {
    const hit = matcher.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
    if (hit) {
      return matcher.eventKey;
    }
  }
  return null;
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(input) {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function extractTag(xml, tag) {
  const rx = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(rx);
  return m ? decodeEntities(stripTags(m[1])) : "";
}

function splitItems(xml) {
  return xml.split(/<item[\\s>]/i).slice(1).map((chunk) => `<item ${chunk}`);
}

function isPredictionText(text) {
  const predictionHints = [
    /\bwill\b/i,
    /\bforecast\b/i,
    /\bpredict/i,
    /\blikely\b/i,
    /\bexpected\b/i,
    /צפוי/,
    /הערכה/,
    /תחזית/
  ];

  return predictionHints.some((rx) => rx.test(text));
}

function topicFromText(text) {
  const pairs = [
    ["taiwan", "סין-טאיוואן"],
    ["ukraine", "רוסיה-אוקראינה"],
    ["iran", "איראן"],
    ["oil", "נפט"],
    ["brent", "נפט"]
  ];

  const lower = text.toLowerCase();
  for (const [needle, topic] of pairs) {
    if (lower.includes(needle)) {
      return topic;
    }
  }

  return "גיאו-פוליטיקה";
}

async function readJson(fileName, fallback) {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, fileName), "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(fileName, data) {
  const target = path.join(DATA_DIR, fileName);
  await fs.writeFile(target, JSON.stringify(data, null, 2), "utf8");
}

function clampProbability(p) {
  return Math.min(1, Math.max(0, p));
}

function evaluatePrediction(prediction, event) {
  if (!event) {
    return {
      known: false,
      binaryCorrect: null,
      brier: null
    };
  }

  const p = clampProbability(prediction.probability);
  const y = event.occurred ? 1 : 0;

  return {
    known: true,
    binaryCorrect: (p >= 0.5 && y === 1) || (p < 0.5 && y === 0) ? 1 : 0,
    brier: Math.pow(p - y, 2)
  };
}

function scoreAnalysts(predictions, events) {
  const buckets = new Map();

  for (const prediction of predictions) {
    const analyst = prediction.analyst || "Unknown";
    const event = prediction.eventKey ? events[prediction.eventKey] : null;
    const result = evaluatePrediction(prediction, event);

    if (!buckets.has(analyst)) {
      buckets.set(analyst, {
        analyst,
        totalPredictions: 0,
        scoredPredictions: 0,
        unresolvedPredictions: 0,
        binaryHits: 0,
        brierTotal: 0
      });
    }

    const row = buckets.get(analyst);
    row.totalPredictions += 1;

    if (!result.known) {
      row.unresolvedPredictions += 1;
      continue;
    }

    row.scoredPredictions += 1;
    row.binaryHits += result.binaryCorrect;
    row.brierTotal += result.brier;
  }

  return Array.from(buckets.values())
    .map((row) => {
      const denominator = Math.max(1, row.scoredPredictions);
      const accuracy = row.binaryHits / denominator;
      const avgBrier = row.scoredPredictions > 0 ? row.brierTotal / row.scoredPredictions : 1;
      const finalScore = row.scoredPredictions > 0
        ? (accuracy * 60) + ((1 - avgBrier) * 40)
        : 0;

      return {
        analyst: row.analyst,
        totalPredictions: row.totalPredictions,
        scoredPredictions: row.scoredPredictions,
        unresolvedPredictions: row.unresolvedPredictions,
        accuracy,
        avgBrier,
        finalScore
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}

async function fetchRss(source) {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "Geopolitical-Tracker/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`RSS fetch failed (${source.name}): ${response.status}`);
  }

  const xml = await response.text();
  const items = splitItems(xml);
  const parsed = [];

  for (const item of items.slice(0, 30)) {
    const title = extractTag(item, "title");
    const description = extractTag(item, "description");
    const creator = extractTag(item, "dc:creator") || extractTag(item, "author");
    const link = extractTag(item, "link");
    const pubDate = extractTag(item, "pubDate");

    const text = `${title}. ${description}`.trim();
    if (!text || !isPredictionText(text)) {
      continue;
    }

    const prediction = {
      id: `live-${Buffer.from(`${source.name}-${link}`).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 22)}`,
      analyst: creator || source.defaultAnalyst,
      topic: topicFromText(text),
      claim: title || description.slice(0, 220),
      deadline: inferDeadline(text, pubDate),
      probability: inferProbability(text),
      eventKey: eventKeyFromText(text),
      source: link || source.url,
      scrapedAt: new Date().toISOString()
    };

    parsed.push(prediction);
  }

  return parsed;
}

async function refreshLivePredictions() {
  const sources = await readJson("sources.json", []);
  const all = [];

  for (const source of sources) {
    try {
      const predictions = await fetchRss(source);
      all.push(...predictions);
    } catch {
      // Keep refresh resilient: one failed source should not break all sources.
    }
  }

  const unique = new Map();
  for (const item of all) {
    if (!unique.has(item.id)) {
      unique.set(item.id, item);
    }
  }

  const finalRows = Array.from(unique.values());
  await writeJson("live_predictions.json", finalRows);
  return finalRows;
}

async function getDataPayload() {
  const [seedPredictions, livePredictions, events] = await Promise.all([
    readJson("predictions.seed.json", []),
    readJson("live_predictions.json", []),
    readJson("events.json", {})
  ]);

  const predictions = [...seedPredictions, ...livePredictions]
    .sort((a, b) => (b.scrapedAt || b.deadline || "").localeCompare(a.scrapedAt || a.deadline || ""));

  return {
    predictions,
    events,
    scores: scoreAnalysts(predictions, events),
    meta: {
      updatedAt: new Date().toISOString(),
      livePredictions: livePredictions.length,
      totalPredictions: predictions.length
    }
  };
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
}

async function serveStatic(req, res) {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  let pathname = parsed.pathname;
  if (pathname === "/") {
    pathname = "/index.html";
  }

  const safePath = path.normalize(path.join(ROOT, pathname));
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(safePath);
    res.writeHead(200, { "Content-Type": contentTypeFor(safePath) });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && parsed.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, now: new Date().toISOString() });
    return;
  }

  if (req.method === "GET" && parsed.pathname === "/api/data") {
    const payload = await getDataPayload();
    sendJson(res, 200, payload);
    return;
  }

  if (req.method === "POST" && parsed.pathname === "/api/refresh") {
    const livePredictions = await refreshLivePredictions();
    const payload = await getDataPayload();
    sendJson(res, 200, {
      ok: true,
      fetched: livePredictions.length,
      ...payload
    });
    return;
  }

  await serveStatic(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

