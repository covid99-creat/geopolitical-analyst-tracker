const ADMIN_TOKEN_KEY = "election_admin_token";

const adminState = {
  token: localStorage.getItem(ADMIN_TOKEN_KEY) || "",
  payload: null
};

function setAdminStatus(text) {
  document.getElementById("adminStatus").textContent = text;
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
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${adminState.token}`
    }
  });

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
  if (!adminState.token) {
    setAdminStatus("יש להזין טוקן מנהל.");
    return;
  }

  setAdminStatus("טוען הצבעות...");
  const response = await adminFetch("/api/admin/votes");
  adminState.payload = await response.json();
  renderVotes(adminState.payload);
  localStorage.setItem(ADMIN_TOKEN_KEY, adminState.token);
  renderStorageStatus(adminState.payload.meta.storage);
  setAdminStatus("ההצבעות נטענו.");
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
  const input = document.getElementById("adminTokenInput");
  input.value = adminState.token;

  document.getElementById("adminLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    adminState.token = input.value.trim();
    try {
      await loadVotes();
    } catch (error) {
      setAdminStatus(error.message);
    }
  });

  document.getElementById("clearTokenBtn").addEventListener("click", () => {
    adminState.token = "";
    input.value = "";
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    document.getElementById("votesPanel").hidden = true;
    setAdminStatus("הטוקן נמחק מהמכשיר הזה.");
  });

  document.getElementById("downloadCsvBtn").addEventListener("click", async () => {
    try {
      await downloadCsv();
    } catch (error) {
      setAdminStatus(error.message);
    }
  });
}

bindAdminEvents();
if (adminState.token) {
  loadVotes().catch((error) => setAdminStatus(error.message));
}
