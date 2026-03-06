const STORAGE_KEYS = {
  watchlist: "geo_watchlist_v1",
  manualPredictions: "geo_manual_predictions_v1"
};

const state = {
  serverPayload: null,
  selectedAnalyst: "",
  selectedTopic: ""
};

function getLocalWatchlist() {
  const raw = localStorage.getItem(STORAGE_KEYS.watchlist);
  if (!raw) {
    return { analysts: [], topics: ["סוף המלחמה באיראן"] };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      analysts: Array.isArray(parsed.analysts) ? parsed.analysts : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics : []
    };
  } catch {
    return { analysts: [], topics: [] };
  }
}

function saveLocalWatchlist(watchlist) {
  localStorage.setItem(STORAGE_KEYS.watchlist, JSON.stringify(watchlist));
}

function getLocalManualPredictions() {
  const raw = localStorage.getItem(STORAGE_KEYS.manualPredictions);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalManualPredictions(rows) {
  localStorage.setItem(STORAGE_KEYS.manualPredictions, JSON.stringify(rows));
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

function setStatus(text) {
  document.getElementById("statusText").textContent = text;
}

function scoreAnalysts(predictions) {
  const buckets = new Map();

  for (const p of predictions) {
    const analyst = p.analyst || "Unknown";
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

    if (typeof p.actualOccurred !== "boolean") {
      row.unresolvedPredictions += 1;
      continue;
    }

    row.scoredPredictions += 1;
    const y = p.actualOccurred ? 1 : 0;
    const pred = Number(p.probability ?? 0.55);
    const binaryCorrect = (pred >= 0.5 && y === 1) || (pred < 0.5 && y === 0) ? 1 : 0;
    row.binaryHits += binaryCorrect;
    row.brierTotal += Math.pow(pred - y, 2);
  }

  return Array.from(buckets.values())
    .map((row) => {
      const denom = Math.max(1, row.scoredPredictions);
      const accuracy = row.binaryHits / denom;
      const avgBrier = row.scoredPredictions > 0 ? row.brierTotal / row.scoredPredictions : 1;
      const finalScore = row.scoredPredictions > 0 ? (accuracy * 60) + ((1 - avgBrier) * 40) : 0;
      return { ...row, accuracy, avgBrier, finalScore };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}

function normalizeServerPrediction(p, events) {
  let actualOutcome = "אין מידע מאומת עדיין";
  let actualOutcomeLink = null;
  let actualOccurred = null;

  if (p.eventKey && events[p.eventKey]) {
    const ev = events[p.eventKey];
    actualOccurred = ev.occurred;
    const status = ev.occurred ? "התממש" : "לא התממש";
    const datePart = ev.date ? ` (${ev.date})` : "";
    actualOutcome = `${status}${datePart} - ${ev.source || ""}`.trim();
    actualOutcomeLink = ev.sourceLink || null;
  }

  return {
    ...p,
    predictionLink: p.predictionLink || p.source || null,
    actualOutcome,
    actualOutcomeLink,
    actualOccurred
  };
}

function buildCombinedPredictions() {
  const payload = state.serverPayload;
  const events = payload.events || {};
  const serverRows = (payload.predictions || []).map((p) => normalizeServerPrediction(p, events));
  const manualRows = getLocalManualPredictions();
  return [...manualRows, ...serverRows];
}

function renderWatchlist() {
  const view = document.getElementById("watchlistView");
  const watchlist = getLocalWatchlist();
  const tags = [];

  for (const analyst of watchlist.analysts) {
    tags.push(`<span class="tag">פרשן: ${analyst}</span>`);
  }
  for (const topic of watchlist.topics) {
    tags.push(`<span class="tag">נושא: ${topic}</span>`);
  }

  view.innerHTML = tags.length > 0 ? tags.join("") : "<small>עדיין לא הוגדר מעקב.</small>";
}

function uniqueValues(rows, key) {
  return Array.from(new Set(rows.map((r) => r[key]).filter(Boolean))).sort((a, b) => a.localeCompare(b, "he"));
}

function updateFilterSelects(rows) {
  const analystFilter = document.getElementById("analystFilter");
  const topicFilter = document.getElementById("topicFilter");

  const analysts = uniqueValues(rows, "analyst");
  const topics = uniqueValues(rows, "topic");

  analystFilter.innerHTML = `<option value="">הכול</option>${analysts.map((v) => `<option value="${v}">${v}</option>`).join("")}`;
  topicFilter.innerHTML = `<option value="">הכול</option>${topics.map((v) => `<option value="${v}">${v}</option>`).join("")}`;

  analystFilter.value = state.selectedAnalyst;
  topicFilter.value = state.selectedTopic;
}

function applyFilters(rows) {
  return rows.filter((r) => {
    if (state.selectedAnalyst && r.analyst !== state.selectedAnalyst) return false;
    if (state.selectedTopic && r.topic !== state.selectedTopic) return false;
    return true;
  });
}

function renderAnalystDashboard(rows) {
  const tableBody = document.querySelector("#analystsTable tbody");
  tableBody.innerHTML = "";

  const scores = scoreAnalysts(rows);

  for (const row of scores) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><button class="linkish analyst-btn" data-analyst="${row.analyst}">${row.analyst}</button></td>
      <td>${row.totalPredictions}</td>
      <td>${row.scoredPredictions} (לא מדורגות: ${row.unresolvedPredictions})</td>
      <td>${(row.accuracy * 100).toFixed(1)}%</td>
      <td>${row.avgBrier.toFixed(3)}</td>
      <td class="score">${row.finalScore.toFixed(1)}</td>
    `;
    tableBody.appendChild(tr);
  }

  document.querySelectorAll(".analyst-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedAnalyst = btn.dataset.analyst;
      document.getElementById("analystFilter").value = state.selectedAnalyst;
      renderAll();
    });
  });
}

function renderPredictionsTable(rows) {
  const tableBody = document.querySelector("#predictionsTable tbody");
  tableBody.innerHTML = "";

  for (const p of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.analyst || "-"}</td>
      <td>${p.topic || "-"}</td>
      <td>${p.claim || "-"}</td>
      <td>${p.predictionLink ? `<a href="${p.predictionLink}" target="_blank" rel="noopener">קישור</a>` : "-"}</td>
      <td>${p.actualOutcome || "-"}</td>
      <td>${p.actualOutcomeLink ? `<a href="${p.actualOutcomeLink}" target="_blank" rel="noopener">קישור</a>` : "-"}</td>
      <td>${p.deadline || "-"}</td>
      <td>${typeof p.probability === "number" ? p.probability.toFixed(2) : "-"}</td>
    `;
    tableBody.appendChild(tr);
  }

  document.getElementById("predictionsCount").textContent = `מוצגות ${rows.length} תחזיות`;
}

function renderAll() {
  const allRows = buildCombinedPredictions();
  updateFilterSelects(allRows);

  const filtered = applyFilters(allRows);
  renderAnalystDashboard(filtered);
  renderPredictionsTable(filtered);
  renderWatchlist();
}

async function loadData() {
  setStatus("טוען נתונים...");
  state.serverPayload = await requestJson("/api/data");
  renderAll();
  const m = state.serverPayload.meta;
  setStatus(`עודכן: ${new Date(m.updatedAt).toLocaleString()}. חלון סריקה: ${m.lookbackDays} ימים. סה"כ תחזיות שרת: ${m.totalPredictions}`);
}

async function refreshFromWeb() {
  setStatus("מבצע סריקה מהרשת...");
  await requestJson("/api/refresh", { method: "POST" });
  await loadData();
}

function addWatch(kind, value) {
  const watchlist = getLocalWatchlist();
  const arr = kind === "analyst" ? watchlist.analysts : watchlist.topics;
  if (!arr.includes(value)) arr.push(value);
  saveLocalWatchlist(watchlist);
}

function bindEvents() {
  document.getElementById("refreshBtn").addEventListener("click", async () => {
    try {
      await refreshFromWeb();
    } catch (error) {
      setStatus(`שגיאה ברענון: ${error.message}`);
    }
  });

  document.getElementById("analystFilter").addEventListener("change", (e) => {
    state.selectedAnalyst = e.target.value;
    renderAll();
  });

  document.getElementById("topicFilter").addEventListener("change", (e) => {
    state.selectedTopic = e.target.value;
    renderAll();
  });

  document.getElementById("clearFiltersBtn").addEventListener("click", () => {
    state.selectedAnalyst = "";
    state.selectedTopic = "";
    renderAll();
  });

  document.getElementById("watchAnalystForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("watchAnalystInput");
    const value = input.value.trim();
    if (!value) return;
    addWatch("analyst", value);
    input.value = "";
    renderWatchlist();
    setStatus(`נוסף מעקב פרשן: ${value}`);
  });

  document.getElementById("watchTopicForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("watchTopicInput");
    const value = input.value.trim();
    if (!value) return;
    addWatch("topic", value);
    input.value = "";
    renderWatchlist();
    setStatus(`נוסף מעקב נושא: ${value}`);
  });

  document.getElementById("manualPredictionForm").addEventListener("submit", (e) => {
    e.preventDefault();

    const analyst = document.getElementById("manualAnalyst").value.trim();
    const topic = document.getElementById("manualTopic").value.trim();
    const claim = document.getElementById("manualClaim").value.trim();
    const predictionLink = document.getElementById("manualPredictionLink").value.trim();

    if (!analyst || !topic || !claim || !predictionLink.startsWith("http")) {
      setStatus("יש למלא פרשן/נושא/תחזית וקישור תקין (http/https)");
      return;
    }

    const deadline = document.getElementById("manualDeadline").value || null;
    const probabilityRaw = document.getElementById("manualProbability").value;
    const probability = probabilityRaw ? Math.min(1, Math.max(0, Number(probabilityRaw))) : 0.55;
    const actualOutcome = document.getElementById("manualOutcome").value.trim() || "אין מידע מאומת עדיין";
    const actualOutcomeLink = document.getElementById("manualOutcomeLink").value.trim() || null;
    const actualOccurredRaw = document.getElementById("manualActualOccurred").value;

    let actualOccurred = null;
    if (actualOccurredRaw === "true") actualOccurred = true;
    if (actualOccurredRaw === "false") actualOccurred = false;

    const rows = getLocalManualPredictions();
    rows.unshift({
      id: `manual-${Date.now()}`,
      analyst,
      topic,
      claim,
      predictionLink,
      source: predictionLink,
      actualOutcome,
      actualOutcomeLink,
      actualOccurred,
      probability,
      deadline,
      createdAt: new Date().toISOString(),
      origin: "manual"
    });

    saveLocalManualPredictions(rows);
    e.target.reset();
    renderAll();
    setStatus("תחזית ידנית נוספה בהצלחה");
  });
}

bindEvents();
loadData().catch((error) => {
  setStatus(`שגיאה בטעינה: ${error.message}`);
});
