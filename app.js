async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

function renderScores(scores) {
  const tableBody = document.querySelector("#analystsTable tbody");
  tableBody.innerHTML = "";

  for (const row of scores) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.analyst}</td>
      <td>${row.totalPredictions}</td>
      <td>${row.scoredPredictions} (לא מדורגות: ${row.unresolvedPredictions})</td>
      <td>${(row.accuracy * 100).toFixed(1)}%</td>
      <td>${row.avgBrier.toFixed(3)}</td>
      <td class="score">${row.finalScore.toFixed(1)}</td>
    `;
    tableBody.appendChild(tr);
  }
}

function renderPredictions(predictions) {
  const list = document.getElementById("predictionsList");
  list.innerHTML = "";

  for (const p of predictions.slice(0, 80)) {
    const li = document.createElement("li");
    const eventPart = p.eventKey ? `eventKey: ${p.eventKey}` : "ללא התאמה לאירוע";
    const publishedPart = p.publishedAt ? `, פורסם: ${p.publishedAt}` : "";
    li.innerHTML = `<strong>${p.analyst}</strong>: ${p.claim} (p=${p.probability}, דדליין: ${p.deadline}${publishedPart}, ${eventPart})`;
    list.appendChild(li);
  }
}

function renderEvents(events) {
  const list = document.getElementById("eventsList");
  list.innerHTML = "";

  for (const [key, e] of Object.entries(events)) {
    const li = document.createElement("li");
    const status = e.occurred ? "התממש" : "לא התממש";
    const datePart = e.date ? ` בתאריך ${e.date}` : "";
    li.textContent = `${key}: ${status}${datePart} (${e.source})`;
    list.appendChild(li);
  }
}

function setStatus(text) {
  const status = document.getElementById("statusText");
  status.textContent = text;
}

async function loadData() {
  setStatus("טוען נתונים...");
  const payload = await requestJson("/api/data");
  renderScores(payload.scores);
  renderPredictions(payload.predictions);
  renderEvents(payload.events);
  setStatus(`עודכן: ${new Date(payload.meta.updatedAt).toLocaleString()}. חלון סריקה: ${payload.meta.lookbackDays} ימים. סה"כ תחזיות: ${payload.meta.totalPredictions}`);
}

async function refreshFromWeb() {
  setStatus("מבצע סריקה מהרשת...");
  await requestJson("/api/refresh", { method: "POST" });
  await loadData();
}

document.getElementById("refreshBtn").addEventListener("click", async () => {
  try {
    await refreshFromWeb();
  } catch (error) {
    setStatus(`שגיאה ברענון: ${error.message}`);
  }
});

loadData().catch((error) => {
  setStatus(`שגיאה בטעינה: ${error.message}`);
});


