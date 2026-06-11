/* ============================================
   BARBERPRO – ADMIN DASHBOARD
   ============================================ */

const API = '';
let revenueChart, servicesChart, accountingChart;
let allClients = [];

// ---- JWT AUTH ----
const TOKEN_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

async function authFetch(url, opts = {}) {
  let token = localStorage.getItem(TOKEN_KEY);
  if (!token) { window.location.href = '/login'; return null; }
  const headers = { ...opts.headers, 'Authorization': `Bearer ${token}` };
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  let res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    const refresh = localStorage.getItem(REFRESH_KEY);
    if (refresh) {
      const r = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: refresh }) });
      if (r.ok) {
        const { accessToken } = await r.json();
        localStorage.setItem(TOKEN_KEY, accessToken);
        headers['Authorization'] = `Bearer ${accessToken}`;
        res = await fetch(url, { ...opts, headers });
      } else { localStorage.clear(); window.location.href = '/login'; return null; }
    } else { localStorage.clear(); window.location.href = '/login'; return null; }
  }
  return res;
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async () => {
  if (!localStorage.getItem(TOKEN_KEY)) { window.location.href = '/login'; return; }

  initSidebar();
  initDateDisplay();
  loadDashboard();
  setupModalForms();

  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); showPage(el.dataset.page); });
  });

  // Charger les infos utilisateur et plan
  try {
    const meRes = await authFetch('/api/admin/me');
    if (meRes?.ok) {
      const me = await meRes.json();
      const planBadge = document.getElementById('planBadge');
      if (planBadge) {
        planBadge.textContent = me.tenant.plan.toUpperCase();
        planBadge.className = `plan-badge ${me.tenant.plan_status === 'past_due' ? 'past_due' : me.tenant.plan_status === 'trialing' ? 'trialing' : ''}`;
      }
      const userNameEl = document.getElementById('userName');
      if (userNameEl) userNameEl.textContent = me.user.name || me.user.email;
      const avatarEl = document.querySelector('.avatar');
      if (avatarEl) avatarEl.textContent = (me.user.name || me.user.email)[0].toUpperCase();

      if (me.tenant.plan_status === 'trialing' && me.tenant.days_left_trial <= 7) showTrialBanner(me.tenant.days_left_trial);
      if (me.tenant.plan_status === 'past_due') showPaymentFailedBanner();

      if (me.user.role !== 'owner') {
        document.querySelectorAll('[data-owner-only]').forEach(el => el.style.display = 'none');
      }
      window._tenantBookingUrl = me.booking_url;
    }
  } catch(e) { console.error('Error loading user info:', e); }
});

// ---- SIDEBAR ----
function initSidebar() {
  const toggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  const close = document.getElementById('sidebarClose');
  const overlay = document.getElementById('modalOverlay');

  toggle?.addEventListener('click', () => { sidebar.classList.toggle('open'); });
  close?.addEventListener('click', () => { sidebar.classList.remove('open'); });
}

function initDateDisplay() {
  const el = document.getElementById('dateDisplay');
  if (el) el.textContent = new Date().toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ---- PAGE NAVIGATION ----
const pageTitles = {
  dashboard: 'Tableau de bord',
  calendar: 'Agenda',
  appointments: 'Rendez-vous',
  clients: 'Clients',
  reminders: 'Relances',
  accounting: 'Comptabilité',
  reports: 'Rapports',
  settings: 'Paramètres',
  customization: 'Personnalisation',
  team: 'Équipe',
  billing: 'Abonnement'
};

function showPage(page) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
  document.getElementById(`page-${page}`)?.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
  document.getElementById('pageTitle').textContent = pageTitles[page] || page;
  document.getElementById('sidebar').classList.remove('open');

  const loaders = { calendar: loadCalendar, appointments: loadAppointments, clients: loadClients, reminders: loadReminders, accounting: loadAccounting, reports: initReports, settings: loadSettings, customization: loadCustomization, team: loadTeam, billing: loadBilling };
  loaders[page]?.();
}

// ---- DASHBOARD ----
async function loadDashboard() {
  try {
    const res = await authFetch(`${API}/api/stats/dashboard`);
    const data = await res.json();

    document.getElementById('kpiToday').textContent = data.today_appointments;
    document.getElementById('kpiRevenue').textContent = `${data.month_revenue.toFixed(2)} $`;
    document.getElementById('kpiClients').textContent = data.total_clients;
    document.getElementById('kpiPending').textContent = data.pending_appointments;

    const badge = document.getElementById('pendingBadge');
    badge.textContent = data.pending_appointments;
    badge.style.display = data.pending_appointments > 0 ? 'inline-flex' : 'none';

    renderRevenueChart(data.monthly_revenue);
    renderServicesChart(data.popular_services);
    renderBarberStats(data.barber_stats);
    renderTodayList(data.upcoming_today);
  } catch (e) { console.error('Dashboard error:', e); }
}

function renderRevenueChart(data) {
  const ctx = document.getElementById('revenueChart')?.getContext('2d');
  if (!ctx) return;
  if (revenueChart) revenueChart.destroy();

  const months = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const labels = data.map(d => months[parseInt(d.month.split('-')[1]) - 1]);
  const values = data.map(d => d.income);

  revenueChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Revenus ($)', data: values, backgroundColor: 'rgba(226,176,74,0.7)', borderColor: '#e2b04a', borderWidth: 2, borderRadius: 6 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } }
  });
}

function renderServicesChart(data) {
  const ctx = document.getElementById('servicesChart')?.getContext('2d');
  if (!ctx || !data.length) return;
  if (servicesChart) servicesChart.destroy();

  const colors = ['#e2b04a','#3b82f6','#10b981','#f59e0b','#8b5cf6'];
  servicesChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.name),
      datasets: [{ data: data.map(d => d.count), backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } }
  });
}

function renderBarberStats(data) {
  const el = document.getElementById('barberStatsTable');
  if (!el) return;
  el.innerHTML = data.map(b => `
    <div class="barber-stat-row">
      <div class="barber-dot" style="background:${b.color}"></div>
      <div class="barber-stat-info">
        <div class="name">${b.name}</div>
        <div class="appts">${b.appointments} rendez-vous</div>
      </div>
      <div class="barber-stat-rev">${(b.revenue || 0).toFixed(2)} $</div>
    </div>
  `).join('') || '<div class="empty-state"><i class="fas fa-chart-bar"></i><p>Aucune donnée</p></div>';
}

function renderTodayList(data) {
  const el = document.getElementById('todayList');
  if (!el) return;
  if (!data.length) { el.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-check"></i><p>Aucun RDV aujourd\'hui</p></div>'; return; }
  el.innerHTML = data.map(a => `
    <div class="appt-mini-item">
      <div class="appt-mini-dot" style="background:${a.barber_color}"></div>
      <div class="appt-mini-info">
        <div class="name">${a.client_name}</div>
        <div class="service">${a.service_name} — ${a.barber_name}</div>
      </div>
      <div class="appt-mini-time">${a.time}</div>
    </div>
  `).join('');
}

// ---- CALENDAR ----
async function loadCalendar() {
  const dateEl = document.getElementById('calendarDate');
  if (!dateEl.value) dateEl.value = new Date().toISOString().slice(0,10);
  dateEl.addEventListener('change', loadCalendar);
  document.getElementById('calendarBarber').addEventListener('change', loadCalendar);

  await loadBarberSelectOptions('calendarBarber');
  const date = dateEl.value;
  const barberId = document.getElementById('calendarBarber').value;

  const params = new URLSearchParams({ date });
  if (barberId) params.set('barber_id', barberId);

  const appointments = await authFetch(`${API}/api/appointments?${params}`).then(r => r.json());
  renderCalendarView(appointments, date, barberId);
}

function renderCalendarView(appointments, date, barberId) {
  const container = document.getElementById('calendarView');
  const barbers = [...new Set(appointments.map(a => ({ id: a.barber_id, name: a.barber_name, color: a.barber_color }))
    .map(JSON.stringify))].map(JSON.parse);

  if (barbers.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:3rem"><i class="fas fa-calendar-day"></i><p>Aucun rendez-vous ce jour-là</p></div>';
    return;
  }

  const hours = Array.from({ length: 20 }, (_, i) => {
    const h = 8 + Math.floor(i / 2);
    const m = i % 2 === 0 ? '00' : '30';
    return `${String(h).padStart(2,'0')}:${m}`;
  });

  const cols = barbers.length;
  let html = `<div class="cal-time-grid" style="--barber-cols:${cols}">`;
  html += '<div class="cal-col-header"></div>';
  barbers.forEach(b => html += `<div class="cal-col-header" style="border-left:3px solid ${b.color}">${b.name}</div>`);

  hours.forEach(h => {
    html += `<div class="cal-time-label">${h}</div>`;
    barbers.forEach(b => {
      const appts = appointments.filter(a => a.barber_id === b.id && a.time.slice(0,5) === h);
      let cellHtml = '';
      appts.forEach(a => {
        const topPercent = 0;
        const heightPercent = Math.min(a.duration / 30 * 100, 200);
        cellHtml += `<div class="cal-event" style="background:${b.color};top:2px;height:${Math.max(heightPercent - 4, 22)}px" title="${a.client_name} – ${a.service_name}" onclick="changeApptStatus(${a.id})">
          ${a.time} ${a.client_name}
        </div>`;
      });
      html += `<div class="cal-cell">${cellHtml}</div>`;
    });
  });
  html += '</div>';
  container.innerHTML = html;
}

// ---- APPOINTMENTS ----
async function loadAppointments() {
  const search = document.getElementById('apptSearch').value;
  const status = document.getElementById('apptStatusFilter').value;
  const date = document.getElementById('apptDateFilter').value;

  ['apptSearch','apptStatusFilter','apptDateFilter'].forEach(id => {
    document.getElementById(id).addEventListener('change', loadAppointments);
    document.getElementById(id).addEventListener('input', loadAppointments);
  });

  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (date) params.set('date', date);

  let appointments = await authFetch(`${API}/api/appointments?${params}`).then(r => r.json());
  if (search) {
    const s = search.toLowerCase();
    appointments = appointments.filter(a => a.client_name?.toLowerCase().includes(s) || a.service_name?.toLowerCase().includes(s) || a.barber_name?.toLowerCase().includes(s));
  }

  const tbody = document.getElementById('appointmentsBody');
  if (!appointments.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fas fa-calendar"></i><p>Aucun rendez-vous trouvé</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = appointments.map(a => `
    <tr>
      <td><strong>${a.date}</strong><br><span style="color:var(--text-light);font-size:0.8rem">${a.time}</span></td>
      <td>
        <strong>${a.client_name}</strong><br>
        <span style="color:var(--text-light);font-size:0.75rem">${a.client_phone}</span>
        ${a.reminder_sent ? '<span style="color:var(--green);font-size:0.7rem;margin-left:4px">● rappel envoyé</span>' : ''}
      </td>
      <td><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${a.barber_color};display:inline-block"></span>${a.barber_name}</span></td>
      <td>${a.service_name}<br><span style="color:var(--text-light);font-size:0.75rem">${a.duration} min</span></td>
      <td><strong>${(a.price || 0).toFixed(2)} $</strong></td>
      <td>${statusBadge(a.status)}</td>
      <td>
        <div class="action-btns">
          ${a.status === 'pending' ? `<button class="btn-table btn-confirm" onclick="updateApptStatus(${a.id},'confirmed')">✓ Confirmer</button>` : ''}
          ${a.status === 'confirmed' ? `<button class="btn-table btn-complete" onclick="updateApptStatus(${a.id},'completed')">✓ Terminé</button>` : ''}
          ${['pending','confirmed'].includes(a.status) ? `<button class="btn-table btn-cancel" onclick="updateApptStatus(${a.id},'cancelled')">✗ Annuler</button>` : ''}
          ${a.status === 'confirmed' ? `<button class="btn-table btn-cancel" onclick="updateApptStatus(${a.id},'no-show')">No-show</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

async function updateApptStatus(id, status) {
  if (!confirm(`Confirmer le changement de statut: "${status}" ?`)) return;
  await authFetch(`${API}/api/appointments/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  showToast(`Statut mis à jour: ${status}`, 'success');
  loadAppointments();
  loadDashboard();
}

async function changeApptStatus(id) {
  const newStatus = prompt('Nouveau statut (pending/confirmed/completed/cancelled/no-show):');
  if (newStatus) await updateApptStatus(id, newStatus);
}

// ---- CLIENTS ----
async function loadClients() {
  const search = document.getElementById('clientSearch').value;
  document.getElementById('clientSearch').addEventListener('input', loadClients);

  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  allClients = await authFetch(`${API}/api/clients${params}`).then(r => r.json());

  const tbody = document.getElementById('clientsBody');
  if (!allClients.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fas fa-users"></i><p>Aucun client trouvé</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = allClients.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.phone}</td>
      <td>${c.email || '<span style="color:var(--text-light)">—</span>'}</td>
      <td><span style="color:var(--accent);font-weight:600">★ ${c.loyalty_points}</span></td>
      <td style="font-size:0.8rem;color:var(--text-light)">${c.created_at?.slice(0,10) || '—'}</td>
      <td>
        <div class="action-btns">
          <button class="btn-table btn-edit" onclick="openClientModal(${c.id})">Modifier</button>
          <button class="btn-table btn-delete" onclick="deleteClient(${c.id})">Supprimer</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function deleteClient(id) {
  if (!confirm('Supprimer ce client ?')) return;
  await authFetch(`${API}/api/clients/${id}`, { method: 'DELETE' });
  showToast('Client supprimé', 'success');
  loadClients();
}

// ---- REMINDERS ----
async function loadReminders() {
  const status = document.getElementById('reminderFilter').value;
  document.getElementById('reminderFilter').addEventListener('change', loadReminders);

  const params = status ? `?status=${status}` : '';
  const reminders = await authFetch(`${API}/api/reminders${params}`).then(r => r.json());

  const tbody = document.getElementById('remindersBody');
  if (!reminders.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fas fa-bell"></i><p>Aucune relance</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = reminders.map(r => `
    <tr>
      <td><strong>${r.client_name}</strong></td>
      <td>${r.client_phone}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.message}">${r.message}</td>
      <td><span style="text-transform:uppercase;font-size:0.75rem;font-weight:600;color:var(--blue)">${r.channel}</span></td>
      <td style="font-size:0.8rem">${r.scheduled_at}</td>
      <td>${r.status === 'sent' ? '<span class="status-badge status-completed">✓ Envoyé</span>' : '<span class="status-badge status-pending">En attente</span>'}</td>
      <td>
        <div class="action-btns">
          ${r.status === 'pending' ? `<button class="btn-table btn-send" onclick="sendReminder(${r.id})">▶ Envoyer</button>` : ''}
          <button class="btn-table btn-delete" onclick="deleteReminder(${r.id})">✗</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function sendReminder(id) {
  const res = await authFetch(`${API}/api/reminders/${id}/send`, { method: 'POST' });
  const data = await res.json();
  showToast(data.message || 'Rappel envoyé', 'success');
  loadReminders();
}

async function deleteReminder(id) {
  if (!confirm('Supprimer ce rappel ?')) return;
  await authFetch(`${API}/api/reminders/${id}`, { method: 'DELETE' });
  showToast('Rappel supprimé', 'success');
  loadReminders();
}

// ---- ACCOUNTING ----
async function loadAccounting() {
  const period = document.getElementById('accountingPeriod').value;
  const [summary, transactions] = await Promise.all([
    fetch(`${API}/api/accounting/summary?period=${period}`).then(r => r.json()),
    fetch(`${API}/api/accounting/transactions?${periodToMonthParam(period)}`).then(r => r.json())
  ]);

  document.getElementById('accountingSummary').innerHTML = `
    <div class="acc-card acc-income"><span class="label">Revenus</span><span class="value">${summary.total_income.toFixed(2)} $</span></div>
    <div class="acc-card acc-expense"><span class="label">Dépenses</span><span class="value">${summary.total_expense.toFixed(2)} $</span></div>
    <div class="acc-card acc-net"><span class="label">Bénéfice net</span><span class="value">${summary.net.toFixed(2)} $</span></div>
  `;

  renderAccountingChart(summary.daily_revenue);

  const tbody = document.getElementById('transactionsBody');
  if (!transactions.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fas fa-dollar-sign"></i><p>Aucune transaction</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = transactions.map(t => `
    <tr>
      <td>${t.date}</td>
      <td>${t.type === 'income' ? '<span style="color:var(--green);font-weight:600">+ Revenu</span>' : '<span style="color:var(--red);font-weight:600">− Dépense</span>'}</td>
      <td style="text-transform:capitalize">${t.category}</td>
      <td>${t.description}</td>
      <td><strong style="color:${t.type==='income'?'var(--green)':'var(--red)'}">${t.type==='income'?'+':'-'}${t.amount.toFixed(2)} $</strong></td>
      <td><button class="btn-table btn-delete" onclick="deleteTransaction(${t.id})">✗</button></td>
    </tr>
  `).join('');
}

function renderAccountingChart(data) {
  const ctx = document.getElementById('accountingChart')?.getContext('2d');
  if (!ctx) return;
  if (accountingChart) accountingChart.destroy();

  accountingChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.date),
      datasets: [
        { label: 'Revenus ($)', data: data.map(d => d.income), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.4, pointRadius: 4 },
        { label: 'Dépenses ($)', data: data.map(d => d.expense), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.4, pointRadius: 4 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } }
  });
}

async function deleteTransaction(id) {
  if (!confirm('Supprimer cette transaction ?')) return;
  await authFetch(`${API}/api/accounting/transactions/${id}`, { method: 'DELETE' });
  showToast('Transaction supprimée', 'success');
  loadAccounting();
}

function periodToMonthParam(period) {
  const now = new Date();
  if (period === 'month') return `month=${now.toISOString().slice(0,7)}`;
  if (period === 'year') return `month=`;
  return '';
}

// ---- REPORTS ----
function initReports() {
  const today = new Date().toISOString().slice(0,10);
  const firstOfMonth = today.slice(0,8) + '01';
  document.getElementById('reportStart').value = firstOfMonth;
  document.getElementById('reportEnd').value = today;
}

async function generateReport() {
  const start = document.getElementById('reportStart').value;
  const end = document.getElementById('reportEnd').value;
  if (!start || !end) { showToast('Veuillez sélectionner les dates', 'error'); return; }

  const data = await authFetch(`${API}/api/stats/reports?start_date=${start}&end_date=${end}`).then(r => r.json());

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const primaryColor = [26, 26, 46];
  const accentColor = [226, 176, 74];

  // Header
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 210, 40, 'F');
  doc.setTextColor(226, 176, 74);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('BARBERPRO', 20, 18);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Rapport de gestion', 20, 27);
  doc.text(`Période: ${start} au ${end}`, 20, 35);
  doc.setTextColor(...primaryColor);
  doc.setFontSize(9);
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-CA')}`, 150, 35);

  let y = 55;

  // Summary KPIs
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(15, y, 55, 28, 3, 3, 'F');
  doc.roundedRect(77, y, 55, 28, 3, 3, 'F');
  doc.roundedRect(139, y, 55, 28, 3, 3, 'F');

  doc.setFontSize(8); doc.setTextColor(100, 116, 139);
  doc.text('REVENUS TOTAL', 20, y + 8);
  doc.text('DÉPENSES TOTAL', 82, y + 8);
  doc.text('BÉNÉFICE NET', 144, y + 8);

  doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.setTextColor(16, 185, 129); doc.text(`${data.summary.total_income.toFixed(2)} $`, 20, y + 20);
  doc.setTextColor(239, 68, 68); doc.text(`${data.summary.total_expense.toFixed(2)} $`, 82, y + 20);
  doc.setTextColor(59, 130, 246); doc.text(`${data.summary.net.toFixed(2)} $`, 144, y + 20);

  y += 40;
  doc.setFontSize(9); doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'normal');
  const stats = [
    `RDV complétés: ${data.summary.completed}`,
    `No-shows: ${data.summary.no_shows}`,
    `Clients uniques: ${data.summary.unique_clients}`
  ];
  stats.forEach((s, i) => doc.text(s, 20 + i * 65, y));
  y += 15;

  // Appointments table
  if (data.appointments.length > 0) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...primaryColor);
    doc.text('Rendez-vous', 15, y); y += 5;

    doc.autoTable({
      startY: y,
      head: [['Date', 'Heure', 'Client', 'Service', 'Barbier', 'Prix', 'Statut']],
      body: data.appointments.map(a => [a.date, a.time, a.client, a.service, a.barber, `${a.price?.toFixed(2)} $`, a.status]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: primaryColor, textColor: accentColor, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 5: { halign: 'right' } },
      margin: { left: 15, right: 15 },
    });
    y = doc.lastAutoTable.finalY + 15;
  }

  // Transactions table
  if (data.transactions.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...primaryColor);
    doc.text('Transactions', 15, y); y += 5;

    doc.autoTable({
      startY: y,
      head: [['Date', 'Type', 'Catégorie', 'Description', 'Montant']],
      body: data.transactions.map(t => [t.date, t.type === 'income' ? 'Revenu' : 'Dépense', t.category, t.description, `${t.type === 'income' ? '+' : '-'}${t.amount.toFixed(2)} $`]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: primaryColor, textColor: accentColor, fontStyle: 'bold' },
      columnStyles: { 4: { halign: 'right' } },
      margin: { left: 15, right: 15 },
    });
  }

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(...primaryColor);
    doc.rect(0, 285, 210, 12, 'F');
    doc.setTextColor(226, 176, 74); doc.setFontSize(7);
    doc.text('Fenix Barbier – Rapport confidentiel', 15, 292);
    doc.text(`Page ${i}/${pageCount}`, 185, 292, { align: 'right' });
  }

  const filename = `fenix-barbier-rapport-${start}-${end}.pdf`;
  doc.save(filename);
  showToast(`Rapport PDF téléchargé: ${filename}`, 'success');
}

// ---- SETTINGS ----
async function loadSettings() {
  const [barbersRes, servicesRes, siteSettingsRes] = await Promise.all([
    authFetch('/api/barbers'),
    authFetch('/api/services'),
    authFetch('/api/settings')
  ]);
  if (!barbersRes?.ok || !servicesRes?.ok || !siteSettingsRes?.ok) return;
  const [barbers, services, siteSettings] = await Promise.all([
    barbersRes.json(), servicesRes.json(), siteSettingsRes.json()
  ]);

  // Hero image preview
  const img = document.getElementById('heroPreviewImg');
  const placeholder = document.getElementById('heroPlaceholder');
  const overlay = document.getElementById('heroPreviewOverlay');
  if (siteSettings.hero_image) {
    img.src = siteSettings.hero_image;
    img.style.display = 'block';
    placeholder.style.display = 'none';
    overlay.style.display = 'flex';
  } else {
    img.style.display = 'none';
    placeholder.style.display = 'block';
    overlay.style.display = 'none';
  }

  // Hero texts
  document.getElementById('settingHeroTag').value = siteSettings.hero_tag || '';
  document.getElementById('settingHeroTitle').value = siteSettings.hero_title || '';
  document.getElementById('settingHeroSubtitle').value = siteSettings.hero_subtitle || '';

  document.getElementById('barbersList').innerHTML = barbers.map(b => `
    <div class="settings-item">
      <div class="info">
        <div class="name"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${b.color};margin-right:6px"></span>${b.name}</div>
        <div class="meta">${b.email || ''} ${b.phone || ''}</div>
      </div>
      <div class="action-btns">
        <button class="btn-table btn-edit" onclick="openBarberModal(${b.id})">Modifier</button>
        <button class="btn-table btn-delete" onclick="deleteBarber(${b.id}, '${b.name.replace(/'/g, "\\'")}')">✗</button>
      </div>
    </div>
  `).join('');

  document.getElementById('servicesList').innerHTML = services.map(s => `
    <div class="settings-item">
      <div class="info">
        <div class="name">${s.name}</div>
        <div class="meta">${s.duration} min — ${s.price.toFixed(2)} $</div>
      </div>
      <div class="action-btns">
        <button class="btn-table btn-edit" onclick="openServiceModal(${s.id})">Modifier</button>
        <button class="btn-table btn-delete" onclick="deleteService(${s.id})">✗</button>
      </div>
    </div>
  `).join('');
}

async function deleteService(id) {
  if (!confirm('Désactiver ce service ?')) return;
  await authFetch(`${API}/api/services/${id}`, { method: 'DELETE' });
  showToast('Service désactivé', 'success');
  loadSettings();
}

async function deleteBarber(id, name) {
  if (!confirm(`Supprimer le barbier "${name}" ?\n\nNote: impossible s'il a des rendez-vous à venir non annulés.`)) return;
  const res = await authFetch(`${API}/api/barbers/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (res.ok) {
    showToast(`Barbier "${name}" désactivé`, 'success');
    loadSettings();
  } else {
    showToast(data.error, 'error');
  }
}

// ---- MODALS ----
function openApptModal(id) {
  loadBarberSelectOptions('apptBarber');
  loadServiceSelectOptions('apptService');
  document.getElementById('apptDate').value = new Date().toISOString().slice(0,10);
  document.getElementById('apptModalTitle').textContent = 'Nouveau rendez-vous';
  openModal('apptModal');
}

async function loadBarberSelectOptions(selectId) {
  const barbers = await authFetch(`${API}/api/barbers`).then(r => r.json());
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const first = sel.options[0];
  sel.innerHTML = '';
  if (first) sel.appendChild(first);
  barbers.forEach(b => {
    const opt = new Option(b.name, b.id);
    sel.appendChild(opt);
  });
  return barbers;
}

async function loadServiceSelectOptions(selectId) {
  const services = await authFetch(`${API}/api/services`).then(r => r.json());
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const first = sel.options[0];
  sel.innerHTML = '';
  if (first) sel.appendChild(first);
  services.forEach(s => {
    const opt = new Option(`${s.name} (${s.duration}min – ${s.price}$)`, s.id);
    sel.appendChild(opt);
  });
}

async function updateApptSlots() {
  const date = document.getElementById('apptDate').value;
  const barberId = document.getElementById('apptBarber').value;
  const serviceId = document.getElementById('apptService').value;
  if (!date || !barberId || !serviceId) return;

  const sel = document.getElementById('apptTime');
  sel.innerHTML = '<option>Chargement...</option>';
  const data = await authFetch(`${API}/api/appointments/available-slots?date=${date}&barber_id=${barberId}&service_id=${serviceId}`).then(r => r.json());
  sel.innerHTML = data.closed ? '<option>Fermé ce jour</option>' : data.slots.map(s => `<option value="${s}">${s}</option>`).join('') || '<option>Aucun créneau</option>';
}

async function openClientModal(id) {
  document.getElementById('editClientId').value = id || '';
  document.getElementById('clientModalTitle').textContent = id ? 'Modifier client' : 'Nouveau client';
  if (id) {
    const c = allClients.find(x => x.id === id) || await authFetch(`${API}/api/clients/${id}`).then(r => r.json());
    document.getElementById('editClientName').value = c.name;
    document.getElementById('editClientPhone').value = c.phone;
    document.getElementById('editClientEmail').value = c.email || '';
    document.getElementById('editClientNotes').value = c.notes || '';
  } else {
    document.getElementById('clientForm2').reset();
  }
  openModal('clientModal');
}

async function openReminderModal() {
  const clients = allClients.length ? allClients : await authFetch(`${API}/api/clients`).then(r => r.json());
  const sel = document.getElementById('reminderClientId');
  sel.innerHTML = clients.map(c => `<option value="${c.id}">${c.name} (${c.phone})</option>`).join('');
  const now = new Date(); now.setMinutes(Math.ceil(now.getMinutes()/15)*15);
  document.getElementById('reminderScheduled').value = now.toISOString().slice(0,16);
  openModal('reminderModal');
}

async function openBarberModal(id) {
  document.getElementById('editBarberId').value = id || '';
  document.getElementById('barberModalTitle').textContent = id ? 'Modifier barbier' : 'Nouveau barbier';
  if (id) {
    const barbers = await authFetch(`${API}/api/barbers`).then(r => r.json());
    const b = barbers.find(x => x.id === id);
    if (b) {
      document.getElementById('editBarberName').value = b.name;
      document.getElementById('editBarberEmail').value = b.email || '';
      document.getElementById('editBarberPhone').value = b.phone || '';
      document.getElementById('editBarberColor').value = b.color || '#3B82F6';
    }
  } else { document.getElementById('barberForm').reset(); }
  openModal('barberModal');
}

async function openServiceModal(id) {
  document.getElementById('editServiceId').value = id || '';
  document.getElementById('serviceModalTitle').textContent = id ? 'Modifier service' : 'Nouveau service';
  if (id) {
    const services = await authFetch(`${API}/api/services`).then(r => r.json());
    const s = services.find(x => x.id === id);
    if (s) {
      document.getElementById('editServiceName').value = s.name;
      document.getElementById('editServiceDuration').value = s.duration;
      document.getElementById('editServicePrice').value = s.price;
      document.getElementById('editServiceDescription').value = s.description || '';
    }
  } else { document.getElementById('serviceForm').reset(); }
  openModal('serviceModal');
}

function openTransactionModal() {
  document.getElementById('txDate').value = new Date().toISOString().slice(0,10);
  openModal('transactionModal');
}

function openModal(id) {
  closeAllModals();
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById(id).classList.add('open');
}

function closeAllModals() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
}

// ---- FORM HANDLERS ----
function setupModalForms() {
  document.getElementById('apptForm').addEventListener('submit', async e => {
    e.preventDefault();
    const body = {
      client_name: document.getElementById('apptClientName').value,
      client_phone: document.getElementById('apptClientPhone').value,
      barber_id: document.getElementById('apptBarber').value,
      service_id: document.getElementById('apptService').value,
      date: document.getElementById('apptDate').value,
      time: document.getElementById('apptTime').value,
      notes: document.getElementById('apptNoteModal').value
    };
    const res = await authFetch(`${API}/api/appointments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) { showToast('Rendez-vous créé', 'success'); closeAllModals(); loadAppointments(); loadDashboard(); }
    else showToast(data.error || 'Erreur', 'error');
  });

  document.getElementById('clientForm2').addEventListener('submit', async e => {
    e.preventDefault();
    const id = document.getElementById('editClientId').value;
    const body = { name: document.getElementById('editClientName').value, phone: document.getElementById('editClientPhone').value, email: document.getElementById('editClientEmail').value, notes: document.getElementById('editClientNotes').value };
    const url = id ? `/api/clients/${id}` : '/api/clients';
    const method = id ? 'PUT' : 'POST';
    const res = await authFetch(url, { method, body: JSON.stringify(body) });
    const data = await res?.json();
    if (res?.ok || res?.status === 409) { showToast(id ? 'Client mis à jour' : 'Client ajouté', 'success'); closeAllModals(); loadClients(); }
    else showToast(data?.error || 'Erreur', 'error');
  });

  document.getElementById('transactionForm').addEventListener('submit', async e => {
    e.preventDefault();
    const body = { type: document.getElementById('txType').value, category: document.getElementById('txCategory').value, description: document.getElementById('txDescription').value, amount: parseFloat(document.getElementById('txAmount').value), date: document.getElementById('txDate').value };
    await authFetch(`${API}/api/accounting/transactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    showToast('Transaction ajoutée', 'success'); closeAllModals(); loadAccounting();
  });

  document.getElementById('reminderForm').addEventListener('submit', async e => {
    e.preventDefault();
    const body = { client_id: document.getElementById('reminderClientId').value, message: document.getElementById('reminderMessage').value, channel: document.getElementById('reminderChannel').value, scheduled_at: document.getElementById('reminderScheduled').value.replace('T', ' ') };
    await authFetch(`${API}/api/reminders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    showToast('Relance planifiée', 'success'); closeAllModals(); loadReminders();
  });

  document.getElementById('barberForm').addEventListener('submit', async e => {
    e.preventDefault();
    const id = document.getElementById('editBarberId').value;
    const body = { name: document.getElementById('editBarberName').value, email: document.getElementById('editBarberEmail').value, phone: document.getElementById('editBarberPhone').value, color: document.getElementById('editBarberColor').value };
    const url = id ? `/api/barbers/${id}` : '/api/barbers';
    const method = id ? 'PUT' : 'POST';
    await authFetch(url, { method, body: JSON.stringify(body) });
    showToast(id ? 'Barbier mis à jour' : 'Barbier ajouté', 'success'); closeAllModals(); loadSettings();
  });

  document.getElementById('serviceForm').addEventListener('submit', async e => {
    e.preventDefault();
    const id = document.getElementById('editServiceId').value;
    const body = { name: document.getElementById('editServiceName').value, duration: parseInt(document.getElementById('editServiceDuration').value), price: parseFloat(document.getElementById('editServicePrice').value), description: document.getElementById('editServiceDescription').value };
    const url = id ? `/api/services/${id}` : '/api/services';
    const method = id ? 'PUT' : 'POST';
    await authFetch(url, { method, body: JSON.stringify(body) });
    showToast(id ? 'Service mis à jour' : 'Service ajouté', 'success'); closeAllModals(); loadSettings();
  });

  const teamFormEl = document.getElementById('teamForm');
  if (teamFormEl) {
    teamFormEl.addEventListener('submit', async e => {
      e.preventDefault();
      await saveTeamMember();
    });
  }
}

// ---- TOAST ----
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const icons = { success: 'fas fa-check-circle', error: 'fas fa-times-circle', warning: 'fas fa-exclamation-triangle' };
  const colors = { success: 'var(--green)', error: 'var(--red)', warning: 'var(--orange)' };
  const toast = document.createElement('div');
  toast.className = `toast ${type !== 'success' ? type : ''}`;
  toast.style.borderColor = colors[type];
  toast.innerHTML = `<i class="${icons[type]}" style="color:${colors[type]}"></i><p>${message}</p>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; setTimeout(() => toast.remove(), 300); }, 3500);
}

// ---- UTILS ----
function statusBadge(status) {
  const map = { pending: ['status-pending', 'En attente'], confirmed: ['status-confirmed', 'Confirmé'], completed: ['status-completed', 'Terminé'], cancelled: ['status-cancelled', 'Annulé'], 'no-show': ['status-no-show', 'No-show'] };
  const [cls, label] = map[status] || ['', status];
  return `<span class="status-badge ${cls}">${label}</span>`;
}

async function logout() {
  const refresh = localStorage.getItem('refreshToken');
  await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: refresh }) });
  localStorage.clear();
  window.location.href = '/login';
}

// ---- HERO IMAGE (legacy settings page) ----
async function uploadHeroImage(input) {
  if (!input.files[0]) return;
  const progress = document.getElementById('uploadProgress');
  if (progress) progress.style.display = 'flex';
  const formData = new FormData();
  formData.append('image', input.files[0]);
  try {
    const res = await authFetch(`/api/admin/customization/hero-photo`, { method: 'POST', body: formData });
    const data = await res.json();
    if (res.ok) { showToast('Image mise à jour avec succès', 'success'); loadSettings(); }
    else showToast(data.error || 'Erreur téléversement', 'error');
  } catch (e) { showToast('Erreur de connexion', 'error'); }
  finally { if (progress) progress.style.display = 'none'; input.value = ''; }
}

async function removeHeroImage() {
  if (!confirm('Supprimer l\'image et revenir au fond par défaut ?')) return;
  const res = await authFetch(`/api/admin/customization/hero-photo`, { method: 'DELETE' });
  if (res?.ok) { showToast('Image supprimée — fond par défaut restauré', 'success'); loadSettings(); }
}

async function saveHeroTexts() {
  const body = {
    hero_tag: document.getElementById('settingHeroTag')?.value || '',
    hero_title: document.getElementById('settingHeroTitle')?.value || '',
    hero_subtitle: document.getElementById('settingHeroSubtitle')?.value || ''
  };
  const res = await authFetch(`/api/admin/customization`, { method: 'PUT', body: JSON.stringify(body) });
  if (res?.ok) showToast('Textes mis à jour', 'success');
}

// ---- CUSTOMIZATION ----
async function loadCustomization() {
  const res = await authFetch('/api/admin/customization');
  if (!res?.ok) return;
  const c = await res.json();

  const urlEl = document.getElementById('bookingUrlText');
  if (urlEl) { urlEl.textContent = c.public_url; urlEl.href = c.public_url; }
  window._tenantBookingUrl = c.public_url;

  const colorInput = document.getElementById('primaryColorInput');
  const colorPreview = document.getElementById('colorPreview');
  if (colorInput) { colorInput.value = c.primary_color || '#e2b04a'; }
  if (colorPreview) colorPreview.style.background = c.primary_color || '#e2b04a';

  const fields = { custHeroTag: c.hero_tag, custHeroTitle: c.hero_title, custHeroSubtitle: c.hero_subtitle, custSalonName: c.name, custSalonPhone: c.phone, custSalonAddress: c.address };
  Object.entries(fields).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.value = val || ''; });

  renderImageZone('logoPreviewWrap', c.logo_url, 'logo');
  renderImageZone('bannerPreviewWrap', c.banner_url, 'banner');
  renderImageZone('heroPhotoPreviewWrap', c.hero_photo_url, 'hero-photo');
}

function renderImageZone(wrapperId, url, type) {
  const wrap = document.getElementById(wrapperId);
  if (!wrap) return;
  if (url) {
    wrap.innerHTML = `<img src="${url}" class="custom-image-preview" alt=""><button class="btn btn-sm btn-danger" style="margin:0.5rem" onclick="deleteCustomImage('${type}')"><i class="fas fa-trash"></i> Supprimer</button>`;
  } else {
    wrap.innerHTML = `<div class="custom-image-placeholder" onclick="document.getElementById('${type}Input').click()"><i class="fas fa-image"></i><span>Cliquer pour uploader</span></div>`;
  }
}

async function uploadCustomImage(type, input) {
  if (!input?.files[0]) return;
  const formData = new FormData();
  formData.append('image', input.files[0]);
  const res = await authFetch(`/api/admin/customization/${type}`, { method: 'POST', body: formData });
  if (res?.ok) { showToast('Image mise à jour', 'success'); loadCustomization(); }
  else showToast('Erreur upload', 'error');
  input.value = '';
}

async function deleteCustomImage(type) {
  if (!confirm('Supprimer cette image ?')) return;
  const res = await authFetch(`/api/admin/customization/${type}`, { method: 'DELETE' });
  if (res?.ok) { showToast('Image supprimée', 'success'); loadCustomization(); }
}

async function saveCustomizationTexts() {
  const body = {
    primary_color: document.getElementById('primaryColorInput')?.value,
    hero_tag: document.getElementById('custHeroTag')?.value,
    hero_title: document.getElementById('custHeroTitle')?.value,
    hero_subtitle: document.getElementById('custHeroSubtitle')?.value,
    name: document.getElementById('custSalonName')?.value,
    phone: document.getElementById('custSalonPhone')?.value,
    address: document.getElementById('custSalonAddress')?.value
  };
  const res = await authFetch('/api/admin/customization', { method: 'PUT', body: JSON.stringify(body) });
  if (res?.ok) showToast('Personnalisation sauvegardée', 'success');
}

function copyBookingUrl() {
  const url = window._tenantBookingUrl || document.getElementById('bookingUrlText')?.textContent;
  if (url) navigator.clipboard.writeText(url).then(() => showToast('URL copiée !', 'success'));
}

function openTeamModal() {
  document.getElementById('teamForm')?.reset();
  openModal('teamModal');
}

// ---- TEAM ----
async function loadTeam() {
  const res = await authFetch('/api/admin/team');
  if (!res?.ok) return;
  const members = await res.json();
  const tbody = document.getElementById('teamBody');
  if (!tbody) return;
  tbody.innerHTML = members.map(m => `
    <tr>
      <td>${m.name}</td>
      <td>${m.email}</td>
      <td><span class="role-badge role-${m.role}">${m.role}</span></td>
      <td>${m.active ? '<span class="status-badge status-confirmed">Actif</span>' : '<span class="status-badge status-cancelled">Inactif</span>'}</td>
      <td class="actions-cell">
        ${m.role !== 'owner' ? `<button class="btn btn-sm btn-danger" onclick="removeTeamMember(${m.id})"><i class="fas fa-user-times"></i></button>` : ''}
      </td>
    </tr>`).join('');
}

async function saveTeamMember() {
  const body = {
    name: document.getElementById('teamMemberName')?.value,
    email: document.getElementById('teamMemberEmail')?.value,
    password: document.getElementById('teamMemberPassword')?.value,
    role: document.getElementById('teamMemberRole')?.value || 'admin'
  };
  const res = await authFetch('/api/admin/team', { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json();
  if (res.ok) { showToast('Membre ajouté', 'success'); closeAllModals(); loadTeam(); }
  else showToast(data.error || 'Erreur', 'error');
}

async function removeTeamMember(id) {
  if (!confirm('Désactiver ce membre ?')) return;
  const res = await authFetch(`/api/admin/team/${id}`, { method: 'DELETE' });
  if (res?.ok) { showToast('Membre désactivé', 'success'); loadTeam(); }
}

// ---- BILLING ----
async function loadBilling() {
  const res = await authFetch('/api/admin/billing');
  if (!res?.ok) return;
  const b = await res.json();
  const el = document.getElementById('billingContent');
  if (!el) return;
  const daysInfo = b.plan_status === 'trialing'
    ? `<span style="color:var(--blue)"><i class="fas fa-clock"></i> ${b.days_left_trial} jours d'essai restants</span>`
    : b.current_period_end ? `<span>Renouvellement le ${b.current_period_end}</span>` : '';
  el.innerHTML = `
    <div class="billing-plan-card">
      <div class="billing-current">
        <span class="billing-plan-name">${(b.plan||'').toUpperCase()}</span>
        <span class="plan-badge ${b.plan_status}">${b.plan_status}</span>
        ${daysInfo}
      </div>
      <div style="margin-top:1rem;display:flex;gap:0.75rem;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="openStripePortal()"><i class="fas fa-external-link-alt"></i> Gérer l'abonnement</button>
        <a href="/pricing" target="_blank" class="btn btn-outline"><i class="fas fa-arrow-up"></i> Changer de plan</a>
      </div>
    </div>`;
}

async function openStripePortal() {
  const res = await authFetch('/api/admin/billing/portal', { method: 'POST', body: JSON.stringify({}) });
  if (res?.ok) { const { url } = await res.json(); if (url) window.location.href = url; }
  else showToast('Portail Stripe non configuré', 'warning');
}

function showTrialBanner(daysLeft) {
  if (document.getElementById('trialBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'trialBanner';
  banner.className = 'banner-trial';
  banner.innerHTML = `<i class="fas fa-clock"></i> Votre essai gratuit se termine dans <strong>${daysLeft} jour${daysLeft > 1 ? 's' : ''}</strong>. <a href="/pricing" style="color:inherit;font-weight:600;text-decoration:underline">Choisir un plan</a>`;
  document.getElementById('adminMain')?.prepend(banner);
}

function showPaymentFailedBanner() {
  if (document.getElementById('paymentBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'paymentBanner';
  banner.className = 'banner-warning';
  banner.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Paiement échoué — veuillez mettre à jour votre moyen de paiement. <button class="btn btn-sm btn-danger" onclick="openStripePortal()" style="margin-left:0.5rem">Mettre à jour</button>`;
  document.getElementById('adminMain')?.prepend(banner);
}
