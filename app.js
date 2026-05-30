const state = {
  payload: null
};

const GROUP_LABELS = {
  bibi: "גוש ביבי",
  arabs: "ערבים",
  opposition: "גוש אופוזיציה"
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function setStatus(text) {
  document.getElementById("statusText").textContent = text;
}

function formatSeat(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return String(Math.round(Number(value)));
}

function roundSeatsToTotal(values, total = 120) {
  const entries = values.map((value, index) => {
    const safe = Math.max(0, Number(value) || 0);
    const floor = Math.floor(safe);
    return { index, floor, remainder: safe - floor };
  });

  let remaining = total - entries.reduce((sum, entry) => sum + entry.floor, 0);
  const result = entries.map((entry) => entry.floor);
  entries.sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < entries.length && remaining > 0; i += 1) {
    result[entries[i].index] += 1;
    remaining -= 1;
  }

  return result;
}

function getAverageForParty(party) {
  return state.payload.averages[party.id] ?? party.latestPoll ?? 0;
}

function getSeatsFromInputs(selector) {
  const seats = {};
  for (const input of document.querySelectorAll(selector)) {
    seats[input.dataset.partyId] = Number(input.value) || 0;
  }
  return seats;
}

function getGroupTotalsFromSeats(seats) {
  const totals = { bibi: 0, arabs: 0, opposition: 0 };
  for (const party of state.payload.parties) {
    totals[party.group] += Number(seats[party.id]) || 0;
  }
  return totals;
}

function renderGroupTotals() {
  const totals = state.payload.groupTotals;
  document.getElementById("bibiTotal").textContent = formatSeat(totals.bibi);
  document.getElementById("arabTotal").textContent = formatSeat(totals.arabs);
  document.getElementById("oppositionTotal").textContent = formatSeat(totals.opposition);
}

function renderAverageChart() {
  const chart = document.getElementById("averageChart");
  const rows = [...state.payload.parties]
    .sort((a, b) => getAverageForParty(b) - getAverageForParty(a));
  const maxSeats = Math.max(...rows.map(getAverageForParty), 1);

  chart.innerHTML = "";

  for (const party of rows) {
    const value = getAverageForParty(party);
    const row = document.createElement("article");
    row.className = "chart-row";
    row.innerHTML = `
      <div class="chart-label">${party.fullName}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width: ${(value / maxSeats) * 100}%"></div>
      </div>
      <strong class="bar-value">${formatSeat(value)}</strong>
    `;
    chart.appendChild(row);
  }
}

function renderVoteRows() {
  const tbody = document.getElementById("voteRows");
  const defaults = roundSeatsToTotal(state.payload.parties.map(getAverageForParty));
  tbody.innerHTML = "";

  state.payload.parties.forEach((party, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <strong>${party.shortName}</strong>
        <span>${party.fullName}</span>
      </td>
      <td>${formatSeat(party.lastElection)}</td>
      <td>${formatSeat(getAverageForParty(party))}</td>
      <td>
        <input class="seat-input" data-party-id="${party.id}" type="number" inputmode="numeric" min="0" max="120" step="1" value="${defaults[index]}" aria-label="תחזית עבור ${party.shortName}">
      </td>
    `;
    tbody.appendChild(row);
  });

  document.querySelectorAll(".seat-input").forEach((input) => {
    input.addEventListener("input", updateVoteTotals);
  });
  updateVoteTotals();
}

function updateMeta() {
  const { votesCount, updatedAt } = state.payload.meta;
  const title = document.getElementById("averageTitle");
  const meta = document.getElementById("averageMeta");
  if (votesCount === 0) {
    title.textContent = "סקר פתיחה";
    meta.textContent = "מבוסס כרגע על סקר 12 אחרון מהקובץ. אחרי הצבעות משתמשים יוצג ממוצע התחזיות.";
    return;
  }
  title.textContent = "ממוצע תחזיות משתמשים";
  meta.textContent = `מבוסס על ${votesCount} תחזיות משתמשים. עודכן: ${new Date(updatedAt).toLocaleString("he-IL")}`;
}

function updateVoteTotals() {
  const seats = getSeatsFromInputs(".seat-input");
  const total = Object.values(seats).reduce((sum, value) => sum + value, 0);
  const blocs = getGroupTotalsFromSeats(seats);
  const totalEl = document.getElementById("voteTotal");
  const box = document.getElementById("voteTotalBox");
  const submit = document.getElementById("submitVoteBtn");

  totalEl.textContent = total;
  box.classList.toggle("invalid", total !== 120);
  submit.disabled = total !== 120;

  document.getElementById("voteBibiTotal").textContent = blocs.bibi;
  document.getElementById("voteArabTotal").textContent = blocs.arabs;
  document.getElementById("voteOppositionTotal").textContent = blocs.opposition;
}

function collectVote() {
  return {
    voterName: document.getElementById("voterName").value.trim(),
    seats: getSeatsFromInputs(".seat-input")
  };
}

function showVotePanel() {
  document.getElementById("votePanel").hidden = false;
  document.getElementById("votePanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderAll() {
  renderGroupTotals();
  renderAverageChart();
  renderVoteRows();
  updateMeta();
}

async function loadData() {
  setStatus("טוען נתונים...");
  state.payload = await requestJson("/api/data");
  renderAll();
  setStatus("מוכן להצבעה");
}

async function submitVote(event) {
  event.preventDefault();
  const previousVotesCount = state.payload?.meta?.votesCount ?? 0;
  setStatus("שומר תחזית...");

  try {
    state.payload = await requestJson("/api/votes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectVote())
    });
    renderAll();
    document.getElementById("averagePanel").scrollIntoView({ behavior: "smooth", block: "start" });
    const nextVotesCount = state.payload.meta.votesCount;
    const voteWord = nextVotesCount === 1 ? "תחזית" : "תחזיות";
    const changedText = nextVotesCount > previousVotesCount ? "התחזית נשמרה" : "הממוצע נטען מחדש";
    setStatus(`${changedText}. כעת הממוצע מבוסס על ${nextVotesCount} ${voteWord}.`);
  } catch (error) {
    setStatus(error.message);
  }
}

function bindEvents() {
  document.getElementById("voteModeBtn").addEventListener("click", showVotePanel);
  document.getElementById("voteForm").addEventListener("submit", submitVote);
  document.getElementById("resetVoteBtn").addEventListener("click", renderVoteRows);
}

bindEvents();
loadData().catch((error) => {
  setStatus(`שגיאה בטעינה: ${error.message}`);
});
