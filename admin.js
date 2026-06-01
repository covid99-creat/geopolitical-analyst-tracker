const adminState = {
  payload: null
};

function setAdminStatus(text) {
  document.getElementById("votesMeta").textContent = text;
}

function renderStorageStatus(storage) {
  const status = document.getElementById("storageStatus");
  if (!storage) {
    status.textContent = "";
    status.classList.remove("danger");
    return;
  }

  status.textContent = storage.persistent
    ? `האחסון מוגדר כקבוע. נתיב: ${storage.dataDir}`
    : storage.warning;
  status.classList.toggle("danger", !storage.persistent);
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("he-IL");
}

async function adminFetch(url, options = {}) {
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
  const panel = document.getElementById("votesPanel");
  const parties = payload.parties;

  document.getElementById("votesTitle").textContent = `כל ההצבעות (${payload.meta.votesCount})`;
  document.getElementById("votesMeta").textContent = `עודכן: ${formatDate(payload.meta.exportedAt)}`;
  renderStorageStatus(payload.meta.storage);

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

  panel.hidden = false;
}

async function loadVotes() {
  setAdminStatus("טוען הצבעות...");
  const response = await adminFetch("/api/admin/votes");
  adminState.payload = await response.json();
  renderVotes(adminState.payload);
  renderStorageStatus(adminState.payload.meta.storage);
}

async function downloadCsv() {
  setAdminStatus("מכין CSV...");
  const response = await adminFetch("/api/admin/votes.csv");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `election-votes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setAdminStatus("CSV הורד.");
}

function bindAdminEvents() {
  document.getElementById("downloadCsvBtn").addEventListener("click", async () => {
    try {
      await downloadCsv();
    } catch (error) {
      setAdminStatus(error.message);
    }
  });
}

bindAdminEvents();
loadVotes().catch((error) => setAdminStatus(error.message));
