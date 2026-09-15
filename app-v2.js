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

const SPECIAL_TYPES = [
  { key: "congres",   label: "Congrès",   color: "#9e9e9e" },
  { key: "formateur", label: "Formateur", color: "#616161" }
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
  activeCell: null, // { doctorId, date, period }
  selectedDoctors: new Set() // ids cochés pour l'export
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
  if (vac.is_absence) {
    if (vac.special_type === "congres")   return "#9e9e9e";
    if (vac.special_type === "formateur") return "#616161";
    return "#14181c";
  }
  const site = siteById(vac.site_id);
  return site ? site.color : null;
}

function renderGrid() {
  const query = (document.getElementById("search-input").value || "").toLowerCase().trim();
  const doctors = state.doctors.filter(d => d.name.toLowerCase().includes(query));
  const nDays = daysInMonth(state.year, state.month);

  // header
  let theadHtml = `<tr>
    <th class="check-col"><input type="checkbox" id="check-all" title="Tout sélectionner" onchange="toggleAllDoctors(this.checked)" /></th>
    <th class='doctor-cell'>Médecin</th>`;
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
    const isChecked = state.selectedDoctors.has(doctor.id);
    tbodyHtml += `<tr class="${isChecked ? 'row-selected' : ''}">
      <td class="check-col"><input type="checkbox" class="doc-check" data-id="${doctor.id}" ${isChecked ? 'checked' : ''} onchange="toggleDoctor('${doctor.id}', this.checked)" /></td>
      <td class="doctor-cell"><p class="doctor-name">${escapeHtml(doctor.name)}</p><p class="doctor-meta">${escapeHtml(doctor.status || "")}</p></td>`;
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
  for (const sp of SPECIAL_TYPES) {
    legendHtml += `<div class="legend-item"><span class="legend-swatch" style="background:${sp.color}"></span>${escapeHtml(sp.label)}</div>`;
  }
  document.getElementById("legend").innerHTML = legendHtml;

  // Met à jour l'état de la checkbox "tout sélectionner"
  const checkAll = document.getElementById("check-all");
  if (checkAll) {
    const allIds = doctors.map(d => d.id);
    checkAll.checked = allIds.length > 0 && allIds.every(id => state.selectedDoctors.has(id));
    checkAll.indeterminate = !checkAll.checked && allIds.some(id => state.selectedDoctors.has(id));
  }
  // Met à jour le libellé du bouton export
  const exportBtn = document.getElementById("export-btn");
  if (exportBtn) {
    const n = state.selectedDoctors.size;
    exportBtn.textContent = n > 0 ? `Exporter en PDF (${n} sélectionné${n > 1 ? "s" : ""})` : "Exporter en PDF";
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s]));
}

function toggleDoctor(id, checked) {
  if (checked) state.selectedDoctors.add(id);
  else state.selectedDoctors.delete(id);
  // Met à jour l'état visuel de la ligne
  const row = document.querySelector(`input.doc-check[data-id="${id}"]`);
  if (row) row.closest("tr").classList.toggle("row-selected", checked);
  // Met à jour check-all
  const query = (document.getElementById("search-input").value || "").toLowerCase().trim();
  const doctors = state.doctors.filter(d => d.name.toLowerCase().includes(query));
  const checkAll = document.getElementById("check-all");
  if (checkAll) {
    checkAll.checked = doctors.length > 0 && doctors.every(d => state.selectedDoctors.has(d.id));
    checkAll.indeterminate = !checkAll.checked && doctors.some(d => state.selectedDoctors.has(d.id));
  }
}

function toggleAllDoctors(checked) {
  const query = (document.getElementById("search-input").value || "").toLowerCase().trim();
  const doctors = state.doctors.filter(d => d.name.toLowerCase().includes(query));
  for (const d of doctors) {
    if (checked) state.selectedDoctors.add(d.id);
    else state.selectedDoctors.delete(d.id);
  }
  renderGrid();
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
  optionsHtml += `<button class="color-option" onclick="setVacation(null, true, null)"><span class="color-dot" style="background:#14181c"></span>Absence</button>`;
  optionsHtml += `<button class="color-option" onclick="setVacation(null,true,'congres')"><span class="color-dot" style="background:#9e9e9e"></span>Cong\u00e8s</button>`;
  optionsHtml += `<button class="color-option" onclick="setVacation(null,true,'formateur')"><span class="color-dot" style="background:#616161"></span>Formateur</button>`;

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

async function setVacation(siteId, isAbsence, specialType = null) {
  const { doctorId, date, period } = state.activeCell;
  const existing = findVacation(doctorId, date, period);

  if (siteId === null && !isAbsence) {
    // clear
    if (existing) {
      await supabaseClient.from("vacations").delete().eq("id", existing.id);
    }
  } else if (existing) {
    await supabaseClient.from("vacations")
      .update({ site_id: siteId, is_absence: isAbsence, special_type: specialType, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabaseClient.from("vacations")
      .insert({ doctor_id: doctorId, date, period, site_id: siteId, is_absence: isAbsence, special_type: specialType });
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

// ---------- Helpers globaux ----------
function fmtJ(n) {
  const j = n / 2;
  return Number.isInteger(j) ? j + "J" : j.toFixed(1).replace(".", ",") + "J";
}

// ---------- Stats ----------
function renderStats() {
  const container = document.getElementById("stats-grid");
  // Comptages par site
  const bySite = {};
  for (const site of state.sites) bySite[site.id] = 0;
  let absenceCount = 0;
  let congresCount = 0;
  let formateurCount = 0;
  for (const vac of state.vacations) {
    if (vac.is_absence) {
      if (vac.special_type === "congres") congresCount++;
      else if (vac.special_type === "formateur") formateurCount++;
      else absenceCount++;
    } else if (vac.site_id && bySite.hasOwnProperty(vac.site_id)) bySite[vac.site_id]++;
  }

  // Comptages par médecin : { doctorId: { siteId: count, absence: count } }
  const byDoctor = {};
  for (const d of state.doctors) byDoctor[d.id] = { _absence: 0, _total: 0 };
  for (const vac of state.vacations) {
    if (!byDoctor[vac.doctor_id]) continue;
    if (vac.is_absence) {
      byDoctor[vac.doctor_id]._absence++;
      // Ne pas compter dans _total les absences spéciales
    } else if (vac.site_id) {
      byDoctor[vac.doctor_id][vac.site_id] = (byDoctor[vac.doctor_id][vac.site_id] || 0) + 1;
    }
    byDoctor[vac.doctor_id]._total++;
  }

  let html = `<div class="stat-section-title">Vacations par site <span class="stat-note">(1 vacation = 0,5J)</span></div>`;
  html += `<div class="stat-table-wrap"><table class="stat-table">
    <thead><tr>
      <th></th>
      ${state.sites.map(s => `<th><span class="legend-swatch" style="background:${s.color};vertical-align:middle;"></span>${escapeHtml(s.name)}</th>`).join("")}
      <th><span class="legend-swatch" style="background:#14181c;vertical-align:middle;"></span>Absences</th>
    </tr></thead>
    <tbody>
    <tr>
      <td class="stat-doctor-name">Vacations</td>
      ${state.sites.map(s => `<td>${bySite[s.id]}</td>`).join("")}
      <td>${absenceCount}</td>
    </tr>
    <tr class="stat-presence-row">
      <td class="stat-doctor-name">Présence médecin</td>
      ${state.sites.map(s => `<td class="stat-presence">${fmtJ(bySite[s.id])}</td>`).join("")}
      <td class="stat-presence">—</td>
    </tr>
    </tbody>
  </table></div>`;

  html += `<div class="stat-section-title" style="margin-top:24px;">Vacations par médecin <span class="stat-note">(1 vacation = 0,5J)</span></div>`;
  html += `<div class="stat-table-wrap"><table class="stat-table">
    <thead><tr>
      <th>Médecin</th>
      ${state.sites.map(s => `<th><span class="legend-swatch" style="background:${s.color};vertical-align:middle;"></span>${escapeHtml(s.name)}</th>`).join("")}
      <th>Absences</th>
      <th>Total vacations</th>
      <th>Présence (J)</th>
    </tr></thead>
    <tbody>`;
  for (const d of state.doctors) {
    const row = byDoctor[d.id] || {};
    const vacationsHorsAbsence = state.sites.reduce((sum, s) => sum + (row[s.id] || 0), 0);
    const presenceDisplay = fmtJ(vacationsHorsAbsence);
    html += `<tr>
      <td class="stat-doctor-name">${escapeHtml(d.name)}</td>
      ${state.sites.map(s => `<td>${row[s.id] || 0}</td>`).join("")}
      <td>${row._absence || 0}</td>
      <td><strong>${row._total || 0}</strong></td>
      <td class="stat-presence"><strong>${presenceDisplay}</strong></td>
    </tr>`;
  }
  html += `</tbody></table></div>`;

  container.innerHTML = html;
}

// ---------- PDF export ----------
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function exportGridPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape" });
  const nDays = daysInMonth(state.year, state.month);
  const query = (document.getElementById("search-input").value || "").toLowerCase().trim();
  const filtered = state.doctors.filter(d => d.name.toLowerCase().includes(query));
  // Si des cases sont cochées, n'exporter que ceux-là ; sinon tous
  const doctors = state.selectedDoctors.size > 0
    ? filtered.filter(d => state.selectedDoctors.has(d.id))
    : filtered;

  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text(`Planning médecin SOMNUM — ${MONTH_NAMES[state.month]} ${state.year}`, 14, 14);
  doc.setFont(undefined, "normal");

  const head = [["Médecin", ...Array.from({ length: nDays }, (_, i) => String(i + 1))]];
  const body = doctors.map(doctor => {
    const row = [doctor.name];
    for (let day = 1; day <= nDays; day++) {
      const date = isoDate(state.year, state.month, day);
      const matin = findVacation(doctor.id, date, "matin");
      const aprem = findVacation(doctor.id, date, "apres-midi");
      const label = (v) => {
        if (!v) return "";
        if (v.is_absence) {
          if (v.special_type === "congres") return "CGR";
          if (v.special_type === "formateur") return "FOR";
          return "ABS";
        }
        const site = siteById(v.site_id);
        return site ? site.name.slice(0, 3).toUpperCase() : "";
      };
      row.push(`${label(matin)}\n${label(aprem)}`);
    }
    return row;
  });

  // Hauteur de cellule fixe pour avoir de la place pour 2 demi-cases
  const CELL_H = 10;

  doc.autoTable({
    head, body,
    startY: 20,
    styles: { fontSize: 5, cellPadding: 0, halign: "center", valign: "middle", minCellHeight: CELL_H },
    columnStyles: { 0: { halign: "left", cellWidth: 30, fontSize: 6 } },
    headStyles: { fillColor: [40, 40, 40], textColor: [255,255,255], fontStyle: "bold" },
    didParseCell: function(data) {
      // Weekend vide : fond gris clair
      if (data.section !== "body" || data.column.index === 0) return;
      const day = data.column.index;
      if (isWeekend(state.year, state.month, day)) {
        data.cell.styles.fillColor = [235, 235, 235];
      }
      // On efface le texte : on dessinera les couleurs dans didDrawCell
      data.cell.text = [];
    },
    didDrawCell: function(data) {
      if (data.section !== "body" || data.column.index === 0) return;
      const day = data.column.index;
      const doctor = doctors[data.row.index];
      if (!doctor) return;
      const date = isoDate(state.year, state.month, day);
      const matin   = findVacation(doctor.id, date, "matin");
      const aprem   = findVacation(doctor.id, date, "apres-midi");
      const x = data.cell.x;
      const y = data.cell.y;
      const w = data.cell.width;
      const h = data.cell.height;
      const halfH = h / 2;

      function drawHalf(vac, yOffset) {
        if (!vac) return;
        let rgb;
        if (vac.is_absence) {
          rgb = [20, 24, 28];
        } else {
          const site = siteById(vac.site_id);
          if (!site) return;
          rgb = hexToRgb(site.color);
        }
        doc.setFillColor(rgb[0], rgb[1], rgb[2]);
        doc.rect(x, y + yOffset, w, halfH, "F");
        // Abréviation en blanc
        const abbr = vac.is_absence ? "ABS" : (siteById(vac.site_id) ? siteById(vac.site_id).name.slice(0,3).toUpperCase() : "");
        if (abbr) {
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(4.5);
          doc.text(abbr, x + w / 2, y + yOffset + halfH / 2 + 1.5, { align: "center" });
        }
      }

      drawHalf(matin, 0);
      drawHalf(aprem, halfH);

      // Rebord de la cellule
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.1);
      doc.rect(x, y, w, h, "S");
    }
  });

  // --- Légende ---
  let legendY = doc.lastAutoTable.finalY + 10;
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFontSize(8);
  doc.setFont(undefined, "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Légende :", 14, legendY);
  doc.setFont(undefined, "normal");
  let lx = 38;
  const items = [
    ...state.sites.map(s => ({ name: s.name, color: s.color })),
    { name: "Absence", color: "#14181c" },
    { name: "Congrès", color: "#9e9e9e" },
    { name: "Formateur", color: "#616161" }
  ];
  for (const item of items) {
    const rgb = hexToRgb(item.color);
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.rect(lx, legendY - 4.5, 6, 5, "F");
    doc.setTextColor(0, 0, 0);
    doc.text(item.name, lx + 8, legendY);
    lx += doc.getTextWidth(item.name) + 18;
    if (lx > pageWidth - 40) { lx = 38; legendY += 9; }
  }

  doc.save(`planning-medecin-somnum-${state.year}-${pad(state.month + 1)}.pdf`);
}

// ---------- Export PDF par site ----------
// ---------- Export PDF par site ----------
function exportSitesPDF() {
  if (!state.sites.length) { alert("Aucun site."); return; }

  var { jsPDF } = window.jspdf;
  var doc = new jsPDF({ orientation: "landscape" });
  var nDays = daysInMonth(state.year, state.month);
  var monthLabel = MONTH_NAMES[state.month] + " " + state.year;
  var pageAdded = false;

  for (var si = 0; si < state.sites.length; si++) {
    var site = state.sites[si];

    // Médecins ayant au moins une vacation (non-absence) sur ce site ce mois
    var docsSite = [];
    for (var di = 0; di < state.doctors.length; di++) {
      var doc2 = state.doctors[di];
      var found = false;
      for (var vi = 0; vi < state.vacations.length; vi++) {
        var v = state.vacations[vi];
        if (v.doctor_id === doc2.id && v.site_id === site.id && !v.is_absence) {
          found = true;
          break;
        }
      }
      if (found) docsSite.push(doc2);
    }

    if (!docsSite.length) continue;

    if (pageAdded) doc.addPage();
    pageAdded = true;

    var rgb = hexToRgb(site.color);

    // En-tête coloré
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 18, "F");
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(site.name + " — Planning SOMNUM — " + monthLabel, 14, 12);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, "normal");

    // Tableau
    var head = [["Médecin"].concat(Array.from({length: nDays}, function(_, i){ return String(i+1); }))];
    var body = [];
    for (var di2 = 0; di2 < docsSite.length; di2++) {
      var dr = docsSite[di2];
      var row = [dr.name];
      for (var day = 1; day <= nDays; day++) {
        var dt = isoDate(state.year, state.month, day);
        var mat = findVacation(dr.id, dt, "matin");
        var apr = findVacation(dr.id, dt, "apres-midi");
        var hM = mat && !mat.is_absence && mat.site_id === site.id;
        var hA = apr && !apr.is_absence && apr.site_id === site.id;
        row.push(hM && hA ? "M+AM" : hM ? "M" : hA ? "AM" : "");
      }
      body.push(row);
    }

    // Capture docsSite dans closure
    (function(docsSiteCopy, siteCopy, rgbCopy) {
      doc.autoTable({
        head: head, body: body, startY: 22,
        styles: { fontSize: 6, cellPadding: 1, halign: "center", valign: "middle", minCellHeight: 8 },
        columnStyles: { 0: { halign: "left", cellWidth: 32 } },
        headStyles: { fillColor: rgbCopy, textColor: [255,255,255], fontStyle: "bold" },
        didParseCell: function(data) {
          if (data.section !== "body" || data.column.index === 0) return;
          var day = data.column.index;
          var dr2 = docsSiteCopy[data.row.index];
          if (!dr2) return;
          var dt2 = isoDate(state.year, state.month, day);
          var mat2 = findVacation(dr2.id, dt2, "matin");
          var apr2 = findVacation(dr2.id, dt2, "apres-midi");
          var hM2 = mat2 && !mat2.is_absence && mat2.site_id === siteCopy.id;
          var hA2 = apr2 && !apr2.is_absence && apr2.site_id === siteCopy.id;
          if (hM2 || hA2) {
            data.cell.styles.fillColor = rgbCopy;
            data.cell.styles.textColor = [255,255,255];
          } else if (isWeekend(state.year, state.month, day)) {
            data.cell.styles.fillColor = [230,230,230];
          }
        }
      });
    })(docsSite, site, rgb);

    var cnt = 0;
    for (var vi2 = 0; vi2 < state.vacations.length; vi2++) {
      if (state.vacations[vi2].site_id === site.id && !state.vacations[vi2].is_absence) cnt++;
    }
    var sy = doc.lastAutoTable.finalY + 9;
    doc.setFontSize(8);
    doc.setFont(undefined, "bold");
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    doc.text("Total vacations : " + cnt + "  |  Présence : " + fmtJ(cnt), 14, sy);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, "normal");
  }

  if (!pageAdded) { alert("Aucune vacation trouvée ce mois-ci."); return; }
  doc.save("planning-par-site-" + state.year + "-" + pad(state.month+1) + ".pdf");
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
