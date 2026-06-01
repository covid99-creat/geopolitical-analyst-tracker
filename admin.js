const votesState = {
  payload: null
};

function setVotesMeta(text) {
  document.getElementById("votesMeta").textContent = text;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("he-IL");
}

async function publicFetch(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }

  return response;
}

function renderVotes(payload) {
  const head = document.getElementById("adminTableHead");
  const body = document.getElementById("adminTableBody");
  const empty = document.getElementById("emptyVotes");
  const parties = payload.parties;

  document.getElementById("votesTitle").textContent = `כל ההצבעות (${payload.meta.votesCount})`;
  setVotesMeta(`עודכן: ${formatDate(payload.meta.exportedAt)}`);
  empty.hidden = payload.votes.length > 0;

  head.innerHTML = `
    <tr>
      <th>זמן</th>
      <th>שם</th>
      <th>סה"כ</th>
      <th>גוש ביבי</th>
      <th>ערבים</th>
      <th>גוש אופוזיציה</th>
      ${parties.map((party) => `<th>${party.shortName}</th>`).join("")}
    </tr>
  `;

  body.innerHTML = payload.votes.map((vote) => `
    <tr>
      <td>${formatDate(vote.createdAt)}</td>
      <td>${vote.voterName || "אנונימי"}</td>
      <td>${vote.total}</td>
      <td>${vote.groupTotals.bibi}</td>
      <td>${vote.groupTotals.arabs}</td>
      <td>${vote.groupTotals.opposition}</td>
      ${parties.map((party) => `<td>${vote.seats[party.id] ?? 0}</td>`).join("")}
    </tr>
  `).join("");
}

async function loadVotes() {
  setVotesMeta("טוען הצבעות...");
  const response = await publicFetch("/api/votes-detail");
  votesState.payload = await response.json();
  renderVotes(votesState.payload);
}

async function downloadCsv() {
  setVotesMeta("מכין CSV...");
  const response = await publicFetch("/api/votes.csv");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `election-votes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setVotesMeta("CSV הורד.");
}

function bindVotesEvents() {
  document.getElementById("downloadCsvBtn").addEventListener("click", async () => {
    try {
      await downloadCsv();
    } catch (error) {
      setVotesMeta(error.message);
    }
  });
}

bindVotesEvents();
loadVotes().catch((error) => setVotesMeta(error.message));
