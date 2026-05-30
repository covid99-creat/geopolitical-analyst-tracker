const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const VOTES_FILE = path.join(DATA_DIR, "votes.json");
const ACTUAL_RESULT_FILE = path.join(DATA_DIR, "actual_result.json");

const PARTIES = [
  {
    id: "likud",
    shortName: "הליכוד",
    fullName: "הליכוד בראשות בנימין נתניהו",
    initials: "בנ",
    lastElection: 32,
    latestPoll: 23,
    group: "bibi"
  },
  {
    id: "bennet_yesh_atid",
    shortName: "ביחד / יש עתיד",
    fullName: "ביחד בראשות נפתלי בנט - יש עתיד",
    initials: "נב",
    lastElection: 24,
    latestPoll: 22,
    group: "opposition"
  },
  {
    id: "eisenkot",
    shortName: "ישר! גדי איזנקוט",
    fullName: "ישר! בראשות גדי איזנקוט",
    initials: "גא",
    lastElection: null,
    latestPoll: 17,
    group: "opposition"
  },
  {
    id: "democrats",
    shortName: "הדמוקרטים",
    fullName: "הדמוקרטים בראשות יאיר גולן",
    initials: "יג",
    lastElection: 4,
    latestPoll: 11,
    group: "opposition"
  },
  {
    id: "yisrael_beitenu",
    shortName: "ישראל ביתנו",
    fullName: "ישראל ביתנו בראשות אביגדור ליברמן",
    initials: "אל",
    lastElection: 6,
    latestPoll: 9,
    group: "opposition"
  },
  {
    id: "shas",
    shortName: "שס",
    fullName: "שס בראשות אריה דרעי",
    initials: "אד",
    lastElection: 11,
    latestPoll: 8,
    group: "bibi"
  },
  {
    id: "utj",
    shortName: "יהדות התורה",
    fullName: "יהדות התורה והשבת",
    initials: "גת",
    lastElection: 7,
    latestPoll: 8,
    group: "bibi"
  },
  {
    id: "otzma",
    shortName: "עוצמה יהודית",
    fullName: "עוצמה יהודית בראשות איתמר בן גביר",
    initials: "אב",
    lastElection: null,
    latestPoll: 8,
    group: "bibi"
  },
  {
    id: "raam",
    shortName: "רע״מ",
    fullName: "הרשימה הערבית המאוחדת",
    initials: "רע",
    lastElection: 5,
    latestPoll: 5,
    group: "arabs"
  },
  {
    id: "arab_list",
    shortName: "חד״ש תע״ל",
    fullName: "חד״ש תע״ל",
    initials: "חת",
    lastElection: 5,
    latestPoll: 5,
    group: "arabs"
  },
  {
    id: "religious_zionism",
    shortName: "הציונות הדתית",
    fullName: "הציונות הדתית בראשות בצלאל סמוטריץ׳",
    initials: "בס",
    lastElection: 14,
    latestPoll: 4,
    group: "bibi"
  },
  {
    id: "national_unity",
    shortName: "המחנה הממלכתי",
    fullName: "המחנה הממלכתי בראשות בני גנץ",
    initials: "בג",
    lastElection: 12,
    latestPoll: 0,
    group: "opposition"
  }
];

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function readVotes() {
  const votes = await readJson(VOTES_FILE, []);
  return Array.isArray(votes) ? votes : [];
}

async function readActualResult() {
  const result = await readJson(ACTUAL_RESULT_FILE, null);
  return result && typeof result.seats === "object" ? result : null;
}

function getAverages(votes) {
  if (votes.length === 0) {
    return Object.fromEntries(PARTIES.map((party) => [party.id, party.latestPoll]));
  }

  const totals = Object.fromEntries(PARTIES.map((party) => [party.id, 0]));
  for (const vote of votes) {
    for (const party of PARTIES) {
      totals[party.id] += Number(vote.seats[party.id]) || 0;
    }
  }

  return Object.fromEntries(
    PARTIES.map((party) => [party.id, Math.round((totals[party.id] / votes.length) * 10) / 10])
  );
}

function getGroupTotals(seats) {
  const totals = { bibi: 0, arabs: 0, opposition: 0 };
  for (const party of PARTIES) {
    totals[party.group] += Number(seats[party.id]) || 0;
  }

  return Object.fromEntries(
    Object.entries(totals).map(([group, value]) => [group, Math.round(value * 10) / 10])
  );
}

function distanceBetween(a, b) {
  return PARTIES.reduce((sum, party) => {
    return sum + Math.abs((Number(a[party.id]) || 0) - (Number(b[party.id]) || 0));
  }, 0);
}

function distanceBetweenGroups(a, b) {
  return ["bibi", "arabs", "opposition"].reduce((sum, group) => {
    return sum + Math.abs((Number(a[group]) || 0) - (Number(b[group]) || 0));
  }, 0);
}

function getAnalysis(votes, actualResult) {
  if (!actualResult) {
    return { ranking: [] };
  }

  const actualGroups = getGroupTotals(actualResult.seats);
  const ranking = votes
    .map((vote) => ({
      id: vote.id,
      voterName: vote.voterName,
      totalDistance: distanceBetween(vote.seats, actualResult.seats),
      groupDistance: distanceBetweenGroups(getGroupTotals(vote.seats), actualGroups),
      createdAt: vote.createdAt
    }))
    .sort((a, b) => a.totalDistance - b.totalDistance || a.groupDistance - b.groupDistance);

  return { ranking };
}

async function getDataPayload() {
  const [votes, actualResult] = await Promise.all([readVotes(), readActualResult()]);
  const averages = getAverages(votes);
  return {
    parties: PARTIES,
    averages,
    groupTotals: getGroupTotals(averages),
    actualResult: actualResult ? actualResult.seats : null,
    analysis: getAnalysis(votes, actualResult),
    meta: {
      votesCount: votes.length,
      updatedAt: new Date().toISOString()
    }
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function validateSeats(body, label) {
  const seats = body && typeof body.seats === "object" ? body.seats : null;
  if (!seats) {
    return { error: `לא התקבלו נתוני ${label}` };
  }

  const cleanSeats = {};
  let total = 0;

  for (const party of PARTIES) {
    const value = Number(seats[party.id]);
    if (!Number.isInteger(value) || value < 0 || value > 120) {
      return { error: `ערך לא תקין עבור ${party.shortName}` };
    }
    cleanSeats[party.id] = value;
    total += value;
  }

  if (total !== 120) {
    return { error: `${label} חייבים להסתכם ל-120. כרגע הסכום הוא ${total}` };
  }

  return { seats: cleanSeats };
}

function validateVote(body) {
  const validation = validateSeats(body, "המנדטים");
  if (validation.error) {
    return validation;
  }

  return {
    vote: {
      id: `vote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      voterName: String(body.voterName || "אנונימי").trim().slice(0, 40) || "אנונימי",
      seats: validation.seats,
      createdAt: new Date().toISOString()
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
  const pathname = parsed.pathname === "/" ? "/index.html" : parsed.pathname;
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

  try {
    if (req.method === "GET" && parsed.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, now: new Date().toISOString() });
      return;
    }

    if (req.method === "GET" && parsed.pathname === "/api/data") {
      sendJson(res, 200, await getDataPayload());
      return;
    }

    if (req.method === "POST" && parsed.pathname === "/api/votes") {
      const rawBody = await readBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const validation = validateVote(body);

      if (validation.error) {
        sendJson(res, 400, { error: validation.error });
        return;
      }

      const votes = await readVotes();
      votes.push(validation.vote);
      await writeJson(VOTES_FILE, votes);
      sendJson(res, 200, await getDataPayload());
      return;
    }

    if (req.method === "POST" && parsed.pathname === "/api/actual-result") {
      const rawBody = await readBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const validation = validateSeats(body, "התוצאה בפועל");

      if (validation.error) {
        sendJson(res, 400, { error: validation.error });
        return;
      }

      await writeJson(ACTUAL_RESULT_FILE, {
        seats: validation.seats,
        updatedAt: new Date().toISOString()
      });
      sendJson(res, 200, await getDataPayload());
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "שגיאת שרת" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Election forecast site running on http://localhost:${PORT}`);
});
