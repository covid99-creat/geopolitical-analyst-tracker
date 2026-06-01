const state = {
  payload: null,
  voteDetails: null
};

const GROUP_LABELS = {
  bibi: "גוש ביבי",
  arabs: "ערבים",
  opposition: "גוש אופוזיציה"
};

const GROUP_ORDER = ["bibi", "arabs", "opposition"];

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function setStatus(text) {
  const status = document.getElementById("statusText");
  if (status) status.textContent = text;
}

function formatSeat(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return String(Math.round(Number(value)));
}

function formatPercentFromSeats(value) {
  return `${Math.round((Number(value) || 0) / 120 * 100)}%`;
}

function pluralForecast(count) {
  return count === 1 ? "תחזית אחת הוגשה" : `${count} תחזיות הוגשו`;
}

function minutesAgo(value) {
  if (!value) return "עודכן כעת";
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 2) return "עודכן לפני דקה";
  if (minutes < 60) return `עודכן לפני ${minutes} דקות`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `עודכן לפני ${hours} שעות`;
  return `עודכן ב-${new Date(value).toLocaleDateString("he-IL")}`;
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

function getDisplayAverages() {
  const rounded = roundSeatsToTotal(state.payload.parties.map(getAverageForParty));
  return Object.fromEntries(state.payload.parties.map((party, index) => [party.id, rounded[index]]));
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

function getLeader(totals) {
  return GROUP_ORDER
    .map((group) => ({ group, value: totals[group] || 0 }))
    .sort((a, b) => b.value - a.value)[0];
}

function renderForecastCard() {
  const rows = document.getElementById("primaryForecastRows");
  const seats = getDisplayAverages();
  const totals = getGroupTotalsFromSeats(seats);
  const max = Math.max(...Object.values(totals), 1);

  rows.innerHTML = GROUP_ORDER.map((group) => `
    <article class="forecast-row ${group}">
      <div>
        <span>${GROUP_LABELS[group]}</span>
        <strong>${formatSeat(totals[group])} מנדטים</strong>
      </div>
      <div class="forecast-bar" aria-hidden="true">
        <span style="width: ${(totals[group] / max) * 100}%"></span>
      </div>
      <b>${formatPercentFromSeats(totals[group])}</b>
    </article>
  `).join("");

  const leader = getLeader(totals);
  document.getElementById("visualLeader").textContent = `${GROUP_LABELS[leader.group]} ${formatSeat(leader.value)}`;
}

function renderAverageChart() {
  const chart = document.getElementById("averageChart");
  const seats = getDisplayAverages();
  const rows = [...state.payload.parties].sort((a, b) => (seats[b.id] || 0) - (seats[a.id] || 0));
  const maxSeats = Math.max(...rows.map((party) => seats[party.id] || 0), 1);

  chart.innerHTML = "";

  for (const party of rows) {
    const value = seats[party.id] || 0;
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
  const seats = getDisplayAverages();
  const defaults = state.payload.parties.map((party) => seats[party.id]);
  tbody.innerHTML = "";

  state.payload.parties.forEach((party, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <strong>${party.shortName}</strong>
        <span>${party.fullName}</span>
      </td>
      <td>${formatSeat(party.lastElection)}</td>
      <td>${formatSeat(seats[party.id])}</td>
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
  const hasVotes = votesCount > 0;
  const updatedText = hasVotes ? minutesAgo(updatedAt) : "מוצגת תחזית פתיחה";
  const countText = pluralForecast(votesCount);

  document.getElementById("averageTitle").textContent = hasVotes
    ? "תחזית הציבור כרגע"
    : "תחזית פתיחה";
  document.getElementById("averageMeta").textContent = hasVotes
    ? "ממוצע חי של תחזיות המשתמשים"
    : "מבוסס כרגע על נתוני הפתיחה עד שתוגש תחזית ראשונה.";
  document.getElementById("updatedIndicator").textContent = `⏱ ${updatedText}`;
  document.getElementById("countIndicator").textContent = `👥 ${countText}`;
  document.getElementById("forecastVoteCount").textContent = countText;
  document.getElementById("forecastUpdatedAt").textContent = updatedText;
  document.getElementById("visualVotesCount").textContent = votesCount;
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
    anonymous: document.getElementById("anonymousVote").checked,
    seats: getSeatsFromInputs(".seat-input")
  };
}

function updateAnonymousState() {
  const anonymous = document.getElementById("anonymousVote").checked;
  const nameInput = document.getElementById("voterName");
  nameInput.disabled = anonymous;
  if (anonymous) nameInput.value = "";
}

function getBibiShare(vote) {
  return Math.round(((vote.groupTotals?.bibi || 0) / 120) * 100);
}

function renderDistribution() {
  const chart = document.getElementById("distributionChart");
  const empty = document.getElementById("distributionEmpty");
  const votes = state.voteDetails?.votes || [];
  const buckets = [
    { label: "20%-30%", min: 20, max: 30, count: 0 },
    { label: "30%-40%", min: 30, max: 40, count: 0 },
    { label: "40%-50%", min: 40, max: 50, count: 0 },
    { label: "50%-60%", min: 50, max: 60, count: 0 },
    { label: "60%-70%", min: 60, max: 70, count: 0 }
  ];

  for (const vote of votes) {
    const share = getBibiShare(vote);
    const bucket = buckets.find((item, index) => (
      share >= item.min && (share < item.max || index === buckets.length - 1 && share <= item.max)
    ));
    if (bucket) bucket.count += 1;
  }

  const max = Math.max(...buckets.map((bucket) => bucket.count), 1);
  chart.innerHTML = buckets.map((bucket) => `
    <article class="histogram-row">
      <span>${bucket.label}</span>
      <div><b style="width: ${(bucket.count / max) * 100}%"></b></div>
      <strong>${bucket.count}</strong>
    </article>
  `).join("");
  empty.hidden = votes.length > 0;
}

function renderTrend() {
  const container = document.getElementById("trendChart");
  const empty = document.getElementById("trendEmpty");
  const votes = [...(state.voteDetails?.votes || [])].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (votes.length < 2) {
    container.innerHTML = `
      <div class="trend-placeholder">
        <span></span><span></span><span></span><span></span><span></span>
      </div>
    `;
    empty.hidden = false;
    return;
  }

  let running = 0;
  const points = votes.map((vote, index) => {
    running += getBibiShare(vote);
    return Math.round(running / (index + 1));
  }).slice(-30);

  const min = Math.min(...points);
  const max = Math.max(...points);
  const spread = Math.max(1, max - min);
  const coords = points.map((value, index) => {
    const x = points.length === 1 ? 0 : (index / (points.length - 1)) * 100;
    const y = 88 - ((value - min) / spread) * 68;
    return `${x},${y}`;
  }).join(" ");

  container.innerHTML = `
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="מגמת תחזית גוש ביבי">
      <polyline points="${coords}" fill="none" stroke="#2563EB" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
    </svg>
    <div class="trend-labels">
      <span>${points[0]}%</span>
      <strong>${points[points.length - 1]}%</strong>
    </div>
  `;
  empty.hidden = true;
}

function showVotePanel() {
  document.getElementById("votePanel").hidden = false;
  document.getElementById("votePanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadVoteDetails() {
  try {
    state.voteDetails = await requestJson("/api/votes-detail");
  } catch {
    state.voteDetails = await requestJson("/api/admin/votes");
  }
}

function renderAll() {
  renderForecastCard();
  renderAverageChart();
  renderVoteRows();
  renderDistribution();
  renderTrend();
  updateMeta();
}

async function loadData() {
  setStatus("טוען נתונים...");
  const [payload] = await Promise.all([
    requestJson("/api/data"),
    loadVoteDetails()
  ]);
  state.payload = payload;
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
    await loadVoteDetails();
    renderAll();
    document.getElementById("forecastSection").scrollIntoView({ behavior: "smooth", block: "start" });
    const nextVotesCount = state.payload.meta.votesCount;
    const changedText = nextVotesCount > previousVotesCount ? "התחזית נשמרה" : "הממוצע נטען מחדש";
    setStatus(`${changedText}. ${pluralForecast(nextVotesCount)}.`);
  } catch (error) {
    setStatus(error.message);
  }
}

function bindEvents() {
  document.getElementById("voteModeBtn").addEventListener("click", showVotePanel);
  document.getElementById("headerVoteBtn").addEventListener("click", showVotePanel);
  document.querySelectorAll("[data-open-vote]").forEach((button) => {
    button.addEventListener("click", showVotePanel);
  });
  document.getElementById("viewForecastBtn").addEventListener("click", () => {
    document.getElementById("forecastSection").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.getElementById("voteForm").addEventListener("submit", submitVote);
  document.getElementById("resetVoteBtn").addEventListener("click", renderVoteRows);
  document.getElementById("anonymousVote").addEventListener("change", updateAnonymousState);
}

bindEvents();
loadData().catch((error) => {
  setStatus(`שגיאה בטעינה: ${error.message}`);
});
