const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Access gate ----------
function checkPageAccess() {
  const input = document.getElementById("access-code-input");
  const error = document.getElementById("access-error");
  if (input.value === PAGE_ACCESS_CODE) {
    sessionStorage.setItem("smd_access", "1");
    document.getElementById("access-gate").style.display = "none";
    document.getElementById("app-content").style.display = "block";
    boot();
  } else {
    error.style.display = "block";
    input.value = "";
    input.focus();
  }
}

const PERIODS = [
  { key: "matin", label: "Matin" },
  { key: "apres-midi", label: "Après-midi" }
];

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

let state = {
  isAdmin: false,
  currentView: "grille",
  year: new Date().getFullYear(),
  month: new Date().getMonth(), // 0-11
  doctors: [],
  sites: [],
  vacations: [], // rows for the current month
  activeCell: null // { doctorId, date, period }
};

// ---------- Boot ----------
async function boot() {
  await loadSites();
  await loadDoctors();
  await loadVacationsForMonth();
  renderAll();
}
// boot() est déclenché depuis checkPageAccess(), ou automatiquement plus haut si l'accès est déjà validé pour cette session.
async function loadDoctors() {
  const { data, error } = await supabaseClient
    .from("doctors")
    .select("*")
    .order("name", { ascending: true });
  if (error) { console.error(error); return; }
  state.doctors = data || [];
}

async function loadSites() {
  const { data, error } = await supabaseClient
    .from("sites")
    .select("*")
    .order("position", { ascending: true });
  if (error) { console.error(error); return; }
  state.sites = data || [];
}

async function loadVacationsForMonth() {
  const from = firstDayOfMonth(state.year, state.month);
  const to = lastDayOfMonth(state.year, state.month);
  const { data, error } = await supabaseClient
    .from("vacations")
    .select("*")
    .gte("date", from)
    .lte("date", to);
  if (error) { console.error(error); return; }
  state.vacations = data || [];
}

// ---------- Date helpers ----------
function pad(n) { return n < 10 ? "0" + n : "" + n; }
function isoDate(year, monthIndex, day) { return `${year}-${pad(monthIndex + 1)}-${pad(day)}`; }
function daysInMonth(year, monthIndex) { return new Date(year, monthIndex + 1, 0).getDate(); }
function firstDayOfMonth(year, monthIndex) { return isoDate(year, monthIndex, 1); }
function lastDayOfMonth(year, monthIndex) { return isoDate(year, monthIndex, daysInMonth(year, monthIndex)); }
function isWeekend(year, monthIndex, day) {
  const d = new Date(year, monthIndex, day).getDay();
  return d === 0 || d === 6;
}

// ---------- View switching ----------
function showView(view) {
  state.currentView = view;
  document.querySelectorAll(".view").forEach(el => el.classList.remove("active"));
  document.getElementById("view-" + view).classList.add("active");
  document.querySelectorAll(".tab").forEach(el => el.classList.toggle("active", el.dataset.view === view));
  if (view === "stats") renderStats();
}

function toggleAdmin() {
  if (!state.isAdmin) {
    if (sessionStorage.getItem("smd_admin") !== "1") {
      const code = prompt("Code d'accès admin :");
      if (code === null) return;
      if (code !== ADMIN_ACCESS_CODE) {
        alert("Code incorrect.");
        return;
      }
      sessionStorage.setItem("smd_admin", "1");
    }
  }
  state.isAdmin = !state.isAdmin;
  document.getElementById("admin-switch").classList.toggle("on", state.isAdmin);
  document.querySelectorAll(".admin-only").forEach(el => {
    el.style.display = state.isAdmin ? "inline-flex" : "none";
  });
  if (!state.isAdmin && (state.currentView === "medecins" || state.currentView === "sites")) {
    showView("grille");
    return;
  }
  renderAll();
}

async function changeMonth(delta) {
  let m = state.month + delta;
  let y = state.year;
  if (m < 0) { m = 11; y -= 1; }
  if (m > 11) { m = 0; y += 1; }
  state.month = m;
  state.year = y;
  await loadVacationsForMonth();
  renderAll();
}

function renderAll() {
  renderMonthLabel();
  renderGrid();
  renderDoctorsAdmin();
  renderSitesAdmin();
  if (state.currentView === "stats") renderStats();
}

function renderMonthLabel() {
  const label = `${MONTH_NAMES[state.month]} ${state.year}`;
  document.getElementById("month-label").textContent = label;
  document.getElementById("month-label-stats").textContent = label;
}

// ---------- Grid rendering ----------
function findVacation(doctorId, date, period) {
  return state.vacations.find(v => v.doctor_id === doctorId && v.date === date && v.period === period);
}

function siteById(id) {
  return state.sites.find(s => s.id === id);
}

function cellColor(vac) {
  if (!vac) return null;
  if (vac.is_absence) return "#14181c";
  const site = siteById(vac.site_id);
  return site ? site.color : null;
}

function renderGrid() {
  const query = (document.getElementById("search-input").value || "").toLowerCase().trim();
  const doctors = state.doctors.filter(d => d.name.toLowerCase().includes(query));
  const nDays = daysInMonth(state.year, state.month);

  // header
  let theadHtml = "<tr><th class='doctor-cell'>Médecin</th>";
  for (let day = 1; day <= nDays; day++) {
    const weekend = isWeekend(state.year, state.month, day);
    theadHtml += `<th class="day-col-head${weekend ? ' weekend-col' : ''}">${day}</th>`;
  }
  theadHtml += "</tr>";
  document.getElementById("grid-thead").innerHTML = theadHtml;

  // body
  let tbodyHtml = "";
  if (doctors.length === 0) {
    tbodyHtml = `<tr><td colspan="${nDays + 1}"><p class="empty-note">Aucun médecin ${state.isAdmin ? "— ajoutez-en un dans l'onglet Médecins" : "trouvé"}.</p></td></tr>`;
  }
  for (const doctor of doctors) {
    tbodyHtml += `<tr><td class="doctor-cell"><p class="doctor-name">${escapeHtml(doctor.name)}</p><p class="doctor-meta">${escapeHtml(doctor.status || "")}</p></td>`;
    for (let day = 1; day <= nDays; day++) {
      const date = isoDate(state.year, state.month, day);
      const weekend = isWeekend(state.year, state.month, day);
      tbodyHtml += `<td class="vac-cell${weekend ? ' weekend-col' : ''}">`;
      for (const period of PERIODS) {
        const vac = findVacation(doctor.id, date, period.key);
        const color = cellColor(vac);
        const style = color ? `background:${color};border-color:${color};` : "";
        tbodyHtml += `<div class="vac-half" style="${style}" onclick="openPicker('${doctor.id}','${date}','${period.key}')"></div>`;
      }
      tbodyHtml += `</td>`;
    }
    tbodyHtml += "</tr>";
  }
  document.getElementById("grid-tbody").innerHTML = tbodyHtml;

  // legend
  let legendHtml = "";
  for (const site of state.sites) {
    legendHtml += `<div class="legend-item"><span class="legend-swatch" style="background:${site.color}"></span>${escapeHtml(site.name)}</div>`;
  }
  legendHtml += `<div class="legend-item"><span class="legend-swatch" style="background:#14181c"></span>Absence</div>`;
  document.getElementById("legend").innerHTML = legendHtml;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s]));
}

// ---------- Color picker ----------
function openPicker(doctorId, date, period) {
  state.activeCell = { doctorId, date, period };
  const doctor = state.doctors.find(d => d.id === doctorId);
  const periodLabel = PERIODS.find(p => p.key === period).label;

  let optionsHtml = "";
  for (const site of state.sites) {
    optionsHtml += `<button class="color-option" onclick="setVacation('${site.id}', false)"><span class="color-dot" style="background:${site.color}"></span>${escapeHtml(site.name)}</button>`;
  }
  optionsHtml += `<button class="color-option" onclick="setVacation(null, true)"><span class="color-dot" style="background:#14181c"></span>Absence</button>`;

  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.id = "picker-overlay";
  overlay.onclick = (e) => { if (e.target === overlay) closePicker(); };
  overlay.innerHTML = `
    <div class="picker">
      <p class="picker-title">${escapeHtml(doctor.name)}</p>
      <p class="picker-sub">${formatDateFr(date)} — ${periodLabel}</p>
      <div class="color-grid">${optionsHtml}</div>
      <div class="picker-actions">
        <button class="btn btn-danger" style="flex:1" onclick="setVacation(null, false)">Effacer</button>
        <button class="btn" style="flex:1" onclick="closePicker()">Annuler</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function closePicker() {
  const overlay = document.getElementById("picker-overlay");
  if (overlay) overlay.remove();
  state.activeCell = null;
}

function formatDateFr(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

async function setVacation(siteId, isAbsence) {
  const { doctorId, date, period } = state.activeCell;
  const existing = findVacation(doctorId, date, period);

  if (siteId === null && !isAbsence) {
    // clear
    if (existing) {
      await supabaseClient.from("vacations").delete().eq("id", existing.id);
    }
  } else if (existing) {
    await supabaseClient.from("vacations")
      .update({ site_id: siteId, is_absence: isAbsence, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabaseClient.from("vacations")
      .insert({ doctor_id: doctorId, date, period, site_id: siteId, is_absence: isAbsence });
  }

  closePicker();
  await loadVacationsForMonth();
  renderGrid();
}

// ---------- Doctors admin ----------
function renderDoctorsAdmin() {
  const container = document.getElementById("doctors-list");
  if (state.doctors.length === 0) {
    container.innerHTML = `<p class="empty-note">Aucun médecin pour le moment.</p>`;
    return;
  }
  let html = "";
  for (const d of state.doctors) {
    html += `
      <div class="record-row">
        <div class="record-main">
          <p class="record-title">${escapeHtml(d.name)}</p>
          <p class="record-sub">${escapeHtml(d.status || "—")} · ${escapeHtml(d.presence_time || "—")}</p>
        </div>
        <button class="btn" onclick="editDoctor('${d.id}')">Modifier</button>
        <button class="btn btn-danger" onclick="deleteDoctor('${d.id}')">Supprimer</button>
      </div>`;
  }
  container.innerHTML = html;
}

async function addDoctor() {
  const name = document.getElementById("new-doctor-name").value.trim();
  const status = document.getElementById("new-doctor-status").value.trim();
  const presence = document.getElementById("new-doctor-presence").value.trim();
  if (!name) { alert("Le nom du médecin est obligatoire."); return; }

  await supabaseClient.from("doctors").insert({ name, status, presence_time: presence });

  document.getElementById("new-doctor-name").value = "";
  document.getElementById("new-doctor-status").value = "";
  document.getElementById("new-doctor-presence").value = "";

  await loadDoctors();
  renderDoctorsAdmin();
  renderGrid();
}

async function editDoctor(id) {
  const doctor = state.doctors.find(d => d.id === id);
  const name = prompt("Nom :", doctor.name);
  if (name === null) return;
  const status = prompt("Statut :", doctor.status || "");
  if (status === null) return;
  const presence = prompt("Temps de présence :", doctor.presence_time || "");
  if (presence === null) return;

  await supabaseClient.from("doctors").update({ name, status, presence_time: presence }).eq("id", id);
  await loadDoctors();
  renderDoctorsAdmin();
  renderGrid();
}

async function deleteDoctor(id) {
  if (!confirm("Supprimer ce médecin et toutes ses vacations enregistrées ?")) return;
  await supabaseClient.from("doctors").delete().eq("id", id);
  await loadDoctors();
  await loadVacationsForMonth();
  renderDoctorsAdmin();
  renderGrid();
}

// ---------- Sites admin ----------
function renderSitesAdmin() {
  const container = document.getElementById("sites-list");
  if (state.sites.length === 0) {
    container.innerHTML = `<p class="empty-note">Aucun site pour le moment.</p>`;
    return;
  }
  let html = "";
  for (const s of state.sites) {
    html += `
      <div class="record-row">
        <span class="legend-swatch" style="background:${s.color}"></span>
        <div class="record-main">
          <p class="record-title">${escapeHtml(s.name)}</p>
        </div>
        <button class="btn" onclick="editSite('${s.id}')">Modifier</button>
        <button class="btn btn-danger" onclick="deleteSite('${s.id}')">Supprimer</button>
      </div>`;
  }
  container.innerHTML = html;
}

async function addSite() {
  const name = document.getElementById("new-site-name").value.trim();
  const color = document.getElementById("new-site-color").value;
  if (!name) { alert("Le nom du site est obligatoire."); return; }

  const position = state.sites.length + 1;
  await supabaseClient.from("sites").insert({ name, color, position });

  document.getElementById("new-site-name").value = "";

  await loadSites();
  renderSitesAdmin();
  renderGrid();
}

async function editSite(id) {
  const site = state.sites.find(s => s.id === id);
  const name = prompt("Nom du site :", site.name);
  if (name === null) return;
  await supabaseClient.from("sites").update({ name }).eq("id", id);
  await loadSites();
  renderSitesAdmin();
  renderGrid();
}

async function deleteSite(id) {
  if (!confirm("Supprimer ce site ? Les vacations qui l'utilisent seront vidées.")) return;
  await supabaseClient.from("sites").delete().eq("id", id);
  await loadSites();
  await loadVacationsForMonth();
  renderSitesAdmin();
  renderGrid();
}

// ---------- Stats ----------
function renderStats() {
  const container = document.getElementById("stats-grid");
  const counts = {};
  for (const site of state.sites) counts[site.id] = 0;
  let absenceCount = 0;

  for (const vac of state.vacations) {
    if (vac.is_absence) absenceCount++;
    else if (vac.site_id && counts.hasOwnProperty(vac.site_id)) counts[vac.site_id]++;
  }

  let html = "";
  for (const site of state.sites) {
    html += `
      <div class="stat-card">
        <p class="stat-label"><span class="legend-swatch" style="background:${site.color}"></span>${escapeHtml(site.name)}</p>
        <p class="stat-value">${counts[site.id]}</p>
      </div>`;
  }
  html += `
    <div class="stat-card">
      <p class="stat-label"><span class="legend-swatch" style="background:#14181c"></span>Absences</p>
      <p class="stat-value">${absenceCount}</p>
    </div>`;

  container.innerHTML = html;
}

// ---------- PDF export ----------
function exportGridPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape" });
  const nDays = daysInMonth(state.year, state.month);
  const query = (document.getElementById("search-input").value || "").toLowerCase().trim();
  const doctors = state.doctors.filter(d => d.name.toLowerCase().includes(query));

  doc.setFontSize(14);
  doc.text(`Planning médecin SOMNUM — ${MONTH_NAMES[state.month]} ${state.year}`, 14, 14);

  const head = [["Médecin", ...Array.from({ length: nDays }, (_, i) => String(i + 1))]];
  const body = doctors.map(doctor => {
    const row = [doctor.name];
    for (let day = 1; day <= nDays; day++) {
      const date = isoDate(state.year, state.month, day);
      const matin = findVacation(doctor.id, date, "matin");
      const aprem = findVacation(doctor.id, date, "apres-midi");
      const label = (v) => {
        if (!v) return "";
        if (v.is_absence) return "ABS";
        const site = siteById(v.site_id);
        return site ? site.name.slice(0, 3).toUpperCase() : "";
      };
      row.push(`${label(matin)}\n${label(aprem)}`);
    }
    return row;
  });

  doc.autoTable({
    head, body,
    startY: 20,
    styles: { fontSize: 6, cellPadding: 1, halign: "center" },
    columnStyles: { 0: { halign: "left", cellWidth: 30 } }
  });

  doc.save(`planning-medecin-somnum-${state.year}-${pad(state.month + 1)}.pdf`);
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("access-code-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") checkPageAccess();
  });
  if (sessionStorage.getItem("smd_access") === "1") {
    document.getElementById("access-gate").style.display = "none";
    document.getElementById("app-content").style.display = "block";
    boot();
  } else {
    document.getElementById("access-code-input").focus();
  }
});
