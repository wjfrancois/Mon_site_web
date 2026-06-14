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

      const salonNameEl = document.getElementById('sidebarSalonName');
      if (salonNameEl && me.tenant?.name) salonNameEl.textContent = me.tenant.name;

      // Branding : couleur accent + titre + logo
      if (me.tenant?.primary_color) {
        document.documentElement.style.setProperty('--accent', me.tenant.primary_color);
        document.documentElement.style.setProperty('--accent-dark', me.tenant.primary_color);
      }
      document.title = `${me.tenant?.name || 'Mon Salon'} – Admin`;
      const sidebarLogoImg = document.getElementById('sidebarLogoImg');
      const sidebarIconEl  = document.getElementById('sidebarIconEl');
      if (sidebarLogoImg && me.tenant?.logo_url) {
        sidebarLogoImg.src = me.tenant.logo_url;
        sidebarLogoImg.style.display = 'block';
        if (sidebarIconEl) sidebarIconEl.style.display = 'none';
      }

      if (me.booking_url) {
        const card = document.getElementById('dashboardBookingUrl');
        const link = document.getElementById('dashboardBookingLink');
        const openBtn = document.getElementById('dashboardBookingOpen');
        if (card) card.style.display = 'flex';
        if (link) { link.href = me.booking_url; link.textContent = me.booking_url; }
        if (openBtn) openBtn.href = me.booking_url;
      }
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

  const loaders = { calendar: loadCalendar, appointments: loadAppointments, clients: loadClients, reminders: loadReminders, accounting: loadAccounting, reports: initReports, products: loadProductsPage, services: loadServicesPage, settings: loadSettings, gallery: loadGallery, customization: loadCustomization, team: loadTeam, billing: loadBilling };
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
let _calendarInitialized = false;
async function loadCalendar() {
  const dateEl = document.getElementById('calendarDate');
  if (!dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);

  // Attacher les listeners une seule fois
  if (!_calendarInitialized) {
    _calendarInitialized = true;
    dateEl.addEventListener('change', loadCalendar);
    document.getElementById('calendarBarber').addEventListener('change', loadCalendar);
  }

  await loadBarberSelectOptions('calendarBarber');
  await refreshCalendar();
}

async function refreshCalendar() {
  const dateEl = document.getElementById('calendarDate');
  const date = dateEl.value;
  const barberId = document.getElementById('calendarBarber').value;

  // Afficher le jour formaté en haut
  const label = document.getElementById('calendarDayLabel');
  if (label) {
    const d = new Date(date + 'T12:00:00');
    label.textContent = d.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  const params = new URLSearchParams({ date });
  if (barberId) params.set('barber_id', barberId);

  const [appointments, blockedSlots] = await Promise.all([
    authFetch(`${API}/api/appointments?${params}`).then(r => r.json()),
    authFetch(`${API}/api/admin/blocked-slots?${params}`).then(r => r.json()).catch(() => []),
  ]);
  renderCalendarView(appointments, date, barberId, blockedSlots);
}

function calendarPrevDay() {
  const dateEl = document.getElementById('calendarDate');
  const d = new Date(dateEl.value + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  dateEl.value = d.toISOString().slice(0, 10);
  refreshCalendar();
}

function calendarNextDay() {
  const dateEl = document.getElementById('calendarDate');
  const d = new Date(dateEl.value + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  dateEl.value = d.toISOString().slice(0, 10);
  refreshCalendar();
}

function calendarToday() {
  const dateEl = document.getElementById('calendarDate');
  dateEl.value = new Date().toISOString().slice(0, 10);
  refreshCalendar();
}

function renderCalendarView(appointments, date, barberId, blockedSlots = []) {
  const container = document.getElementById('calendarView');
  const barbers = [...new Set(appointments.map(a => ({ id: a.barber_id, name: a.barber_name, color: a.barber_color }))
    .map(JSON.stringify))].map(JSON.parse);

  if (barbers.length === 0 && blockedSlots.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:3rem"><i class="fas fa-calendar-day"></i><p>Aucun rendez-vous ce jour-là</p></div>';
    return;
  }

  const hours = Array.from({ length: 24 }, (_, i) => {
    const h = 7 + Math.floor(i / 2);
    const m = i % 2 === 0 ? '00' : '30';
    return `${String(h).padStart(2,'0')}:${m}`;
  });

  const cols = barbers.length || 1;
  let html = `<div class="cal-time-grid" style="--barber-cols:${cols}">`;
  html += '<div class="cal-col-header"></div>';
  if (barbers.length === 0) {
    html += '<div class="cal-col-header">Barbiers</div>';
  } else {
    barbers.forEach(b => html += `<div class="cal-col-header" style="border-left:3px solid ${b.color}">${b.name}</div>`);
  }

  hours.forEach(h => {
    html += `<div class="cal-time-label">${h}</div>`;
    const [hh, hm] = h.split(':').map(Number);
    const slotMin = hh * 60 + hm;

    const renderCol = (b) => {
      const appts = appointments.filter(a => {
        if (b && a.barber_id !== b.id) return false;
        const [ah, am] = a.time.split(':').map(Number);
        const apptMin = ah * 60 + am;
        return apptMin >= slotMin && apptMin < slotMin + 30;
      });
      const blocks = blockedSlots.filter(bs => {
        if (b && bs.barber_id !== null && bs.barber_id !== b.id) return false;
        const [bsh, bsm] = bs.start_time.split(':').map(Number);
        const bStartMin = bsh * 60 + bsm;
        return bStartMin >= slotMin && bStartMin < slotMin + 30;
      });
      let cellHtml = '';
      blocks.forEach(bs => {
        const [bsh, bsm] = bs.start_time.split(':').map(Number);
        const [beh, bem] = bs.end_time.split(':').map(Number);
        const durationMin = (beh * 60 + bem) - (bsh * 60 + bsm);
        const heightPercent = Math.max(durationMin / 30 * 100 - 4, 22);
        cellHtml += `<div class="cal-event cal-blocked" style="height:${heightPercent}px;top:2px" title="${bs.reason || 'Bloqué'} (${bs.start_time}–${bs.end_time})" onclick="deleteBlockedSlot(${bs.id})">
          <i class="fas fa-ban" style="font-size:10px"></i> ${bs.reason || 'Bloqué'} <span style="font-size:9px;opacity:0.7">${bs.start_time}–${bs.end_time}</span>
        </div>`;
      });
      appts.forEach(a => {
        const heightPercent = Math.min(a.duration / 30 * 100, 200);
        const bgColor = a.status === 'confirmed' ? '#10b981'
                      : a.status === 'cancelled'  ? '#ef4444'
                      : a.status === 'completed'  ? '#6366f1'
                      : (b ? b.color : '#64748b');
        const statusLabel = { confirmed: '✓ ', cancelled: '✗ ', completed: '★ ' }[a.status] || '';
        cellHtml += `<div class="cal-event" style="background:${bgColor};top:2px;height:${Math.max(heightPercent - 4, 22)}px" title="${a.client_name} – ${a.service_name} (${a.status})" onclick="changeApptStatus(${a.id})">
          ${statusLabel}${a.time} ${a.client_name}
        </div>`;
      });
      html += `<div class="cal-cell">${cellHtml}</div>`;
    };

    if (barbers.length === 0) {
      renderCol(null);
    } else {
      barbers.forEach(b => renderCol(b));
    }
  });
  html += '</div>';
  container.innerHTML = html;
}

// ---- BLOCKED SLOTS ----
function _buildTimeOptions(selectId, defaultVal) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '';
  for (let h = 7; h <= 21; h++) {
    for (const m of [0, 15, 30, 45]) {
      const val = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      sel.innerHTML += `<option value="${val}" ${val === defaultVal ? 'selected' : ''}>${val}</option>`;
    }
  }
}

async function openBlockedSlotModal() {
  const date = document.getElementById('calendarDate').value || new Date().toISOString().slice(0,10);
  document.getElementById('blockDate').value = date;
  document.getElementById('blockReason').value = '';
  _buildTimeOptions('blockStart', '12:00');
  _buildTimeOptions('blockEnd', '13:00');
  await loadBarberSelectOptions('blockBarber');
  document.getElementById('blockedSlotModal').classList.add('open');
  document.getElementById('modalOverlay').classList.add('open');
}

function closeBlockedSlotModal() {
  document.getElementById('blockedSlotModal').classList.remove('open');
  document.getElementById('modalOverlay').classList.remove('open');
}

async function saveBlockedSlot() {
  const date = document.getElementById('blockDate').value;
  const barber_id = document.getElementById('blockBarber').value || null;
  const start_time = document.getElementById('blockStart').value;
  const end_time = document.getElementById('blockEnd').value;
  const reason = document.getElementById('blockReason').value.trim();

  if (!date || !start_time || !end_time) return showToast('Remplissez tous les champs obligatoires', 'error');
  if (start_time >= end_time) return showToast('L\'heure de fin doit être après le début', 'error');

  const r = await authFetch(`${API}/api/admin/blocked-slots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ barber_id, date, start_time, end_time, reason }),
  });
  const d = await r.json();
  if (!r.ok) return showToast(d.error || 'Erreur', 'error');

  closeBlockedSlotModal();
  showToast('Plage bloquée avec succès');
  refreshCalendar();
}

async function deleteBlockedSlot(id) {
  if (!confirm('Supprimer ce blocage ?')) return;
  await authFetch(`${API}/api/admin/blocked-slots/${id}`, { method: 'DELETE' });
  showToast('Blocage supprimé');
  refreshCalendar();
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
  const [summaryRes, transactionsRes] = await Promise.all([
    authFetch(`/api/accounting/summary?period=${period}`),
    authFetch(`/api/accounting/transactions?${periodToMonthParam(period)}`)
  ]);
  if (!summaryRes?.ok || !transactionsRes?.ok) return;
  const [summary, transactions] = await Promise.all([summaryRes.json(), transactionsRes.json()]);

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
  const [barbersRes, servicesRes, siteSettingsRes, meRes] = await Promise.all([
    authFetch('/api/barbers'),
    authFetch('/api/services'),
    authFetch('/api/settings'),
    authFetch('/api/admin/me')
  ]);
  if (!barbersRes?.ok || !servicesRes?.ok || !siteSettingsRes?.ok) return;
  const [barbers, services, siteSettings] = await Promise.all([
    barbersRes.json(), servicesRes.json(), siteSettingsRes.json()
  ]);

  // Hero overlay settings + booking settings
  if (meRes?.ok) {
    const me = await meRes.json();

    // Apparence bannière
    const opacity = me.tenant?.hero_overlay_opacity ?? 70;
    const bgColor = me.tenant?.hero_bg_color || '#1a1a2e';
    const heroMode = me.tenant?.hero_mode || 'manual';
    const slider = document.getElementById('overlayOpacitySlider');
    const label  = document.getElementById('overlayOpacityLabel');
    const picker = document.getElementById('heroBgColorPicker');
    const colorLabel = document.getElementById('heroBgColorLabel');
    if (slider) { slider.value = opacity; }
    if (label)  { label.textContent = opacity + '%'; }
    if (picker) { picker.value = bgColor; }
    if (colorLabel) { colorLabel.textContent = bgColor; }
    const heroModeRadio = document.querySelector(`input[name="heroMode"][value="${heroMode}"]`);
    if (heroModeRadio) heroModeRadio.checked = true;
    toggleHeroMode(heroMode);


    const mode = me.tenant?.booking_confirmation || 'automatic';
    const delaysStr = me.tenant?.reminder_delays || String(me.tenant?.reminder_delay_hours || '24');
    const activeDelays = delaysStr.split(',').map(Number);
    const radio = document.querySelector(`input[name="confirmationMode"][value="${mode}"]`);
    if (radio) radio.checked = true;
    document.querySelectorAll('input[name="reminderDelay"]').forEach(cb => {
      cb.checked = activeDelays.includes(parseInt(cb.value));
    });
  }

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
        <div class="name"><i class="${s.icon || 'fas fa-cut'}" style="margin-right:0.4rem;opacity:0.6"></i>${s.name}</div>
        <div class="meta">${s.duration} min — ${parseFloat(s.price).toFixed(2)} $</div>
      </div>
      <div class="action-btns">
        <button class="btn-table btn-edit" onclick="openServiceModal(${s.id})">Modifier</button>
        <button class="btn-table btn-delete" onclick="deleteService(${s.id})">✗</button>
      </div>
    </div>
  `).join('');
}

function toggleHeroMode(mode) {
  const section = document.getElementById('heroSlideshowSection');
  if (section) section.style.display = mode === 'slideshow' ? 'block' : 'none';
  if (mode === 'slideshow') loadHeroSlides();
}

async function loadHeroSlides() {
  const res = await authFetch('/api/admin/hero-slides');
  if (!res?.ok) return;
  const slides = await res.json();
  const grid = document.getElementById('heroSlidesGrid');
  const countEl = document.getElementById('heroSlideCount');
  if (!grid) return;
  if (countEl) countEl.textContent = slides.length ? `(${slides.length} image${slides.length > 1 ? 's' : ''})` : '';
  if (!slides.length) {
    grid.innerHTML = '<p style="color:var(--text-light);font-size:0.85rem;grid-column:1/-1">Aucune image — ajoutez au moins 2 photos pour activer le diaporama.</p>';
    return;
  }
  grid.innerHTML = slides.map(s => `
    <div style="position:relative;border-radius:8px;overflow:hidden;aspect-ratio:16/9;background:var(--border)">
      <img src="${s.url}" alt="Slide" style="width:100%;height:100%;object-fit:cover;display:block">
      <button onclick="deleteHeroSlide(${s.id})"
        style="position:absolute;top:5px;right:5px;background:rgba(0,0,0,0.65);color:#fff;border:none;border-radius:50%;width:26px;height:26px;cursor:pointer;font-size:0.8rem;display:flex;align-items:center;justify-content:center"
        title="Supprimer cette image">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join('');
}

async function uploadHeroSlides(input) {
  if (!input.files.length) return;
  const files = [...input.files];
  input.value = '';
  let ok = 0, err = 0;
  for (const file of files) {
    const fd = new FormData();
    fd.append('image', file);
    const res = await authFetch('/api/admin/hero-slides', { method: 'POST', body: fd });
    if (res?.ok) ok++; else err++;
  }
  if (ok) showToast(`${ok} image${ok > 1 ? 's' : ''} ajoutée${ok > 1 ? 's' : ''} au diaporama`, 'success');
  if (err) showToast(`${err} fichier(s) refusé(s)`, 'error');
  loadHeroSlides();
}

async function deleteHeroSlide(id) {
  if (!confirm('Supprimer cette image du diaporama ?')) return;
  const res = await authFetch(`/api/admin/hero-slides/${id}`, { method: 'DELETE' });
  if (res?.ok) { showToast('Image supprimée', 'success'); loadHeroSlides(); }
  else showToast('Erreur lors de la suppression', 'error');
}

async function saveHeroOverlay() {
  const opacity  = document.getElementById('overlayOpacitySlider')?.value;
  const color    = document.getElementById('heroBgColorPicker')?.value;
  const heroMode = document.querySelector('input[name="heroMode"]:checked')?.value || 'manual';
  const res = await authFetch('/api/admin/hero-overlay', {
    method: 'PUT',
    body: JSON.stringify({ hero_overlay_opacity: parseInt(opacity), hero_bg_color: color, hero_mode: heroMode })
  });
  const data = await res?.json();
  if (res?.ok) showToast('Apparence mise à jour', 'success');
  else showToast(data?.error || 'Erreur', 'error');
}

async function saveBookingSettings() {
  const mode = document.querySelector('input[name="confirmationMode"]:checked')?.value;
  const delays = [...document.querySelectorAll('input[name="reminderDelay"]:checked')].map(cb => parseInt(cb.value));
  if (!mode) return showToast('Sélectionnez un mode de confirmation', 'error');
  if (!delays.length) return showToast('Sélectionnez au moins un délai de rappel', 'error');
  const res = await authFetch('/api/admin/booking-settings', {
    method: 'PUT',
    body: JSON.stringify({ booking_confirmation: mode, reminder_delays: delays })
  });
  const data = await res?.json();
  if (res?.ok) showToast('Paramètres sauvegardés', 'success');
  else showToast(data?.error || 'Erreur', 'error');
}

async function deleteService(id) {
  if (!confirm('Supprimer ce service ?\nIl ne sera plus disponible à la réservation.')) return;
  await authFetch(`${API}/api/services/${id}`, { method: 'DELETE' });
  showToast('Service supprimé', 'success');
  loadServicesPage();
}

// ---- PRODUITS ----
async function loadProductsPage() {
  const res = await authFetch(`${API}/api/admin/products`);
  if (!res?.ok) return;
  const products = await res.json();
  const grid = document.getElementById('productsAdminGrid');
  if (!grid) return;

  // Build datalist options for type autocomplete
  const types = [...new Set(products.map(p => p.type).filter(Boolean))];
  document.getElementById('productTypeList').innerHTML = types.map(t => `<option value="${t}">`).join('');

  if (!products.length) {
    grid.innerHTML = '<p style="color:var(--text-light);text-align:center;padding:3rem">Aucun produit. Cliquez sur « Nouveau produit » pour commencer.</p>';
    return;
  }
  grid.innerHTML = products.map(p => `
    <div class="product-admin-card">
      <div class="pac-photo">
        ${p.photo_url
          ? `<img src="${p.photo_url}" alt="${p.name}" onclick="openProductModal(${p.id})">`
          : `<div class="pac-no-photo" onclick="openProductModal(${p.id})"><i class="fas fa-box-open"></i></div>`}
      </div>
      <div class="pac-info">
        <div class="pac-name">${p.name}</div>
        <div class="pac-meta">${[p.brand, p.type].filter(Boolean).join(' · ')}</div>
        <div class="pac-price">${parseFloat(p.price).toFixed(2)} $</div>
      </div>
      <div class="pac-actions">
        <button class="btn btn-sm btn-outline" onclick="openProductModal(${p.id})"><i class="fas fa-pen"></i></button>
        <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:none" onclick="deleteProduct(${p.id})"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  `).join('');
}

async function openProductModal(id) {
  document.getElementById('editProductId').value = id || '';
  document.getElementById('productModalTitle').textContent = id ? 'Modifier le produit' : 'Nouveau produit';
  document.getElementById('productForm').reset();
  document.getElementById('productPhotoPreview').style.display = 'none';
  document.getElementById('productPhotoPlaceholder').style.display = 'flex';
  document.getElementById('productPhotoInput').value = '';

  if (id) {
    const products = await authFetch(`${API}/api/admin/products`).then(r => r.json());
    const p = products.find(x => x.id === id);
    if (p) {
      document.getElementById('editProductName').value = p.name || '';
      document.getElementById('editProductBrand').value = p.brand || '';
      document.getElementById('editProductType').value = p.type || '';
      document.getElementById('editProductPrice').value = p.price || 0;
      document.getElementById('editProductDescription').value = p.description || '';
      if (p.photo_url) {
        document.getElementById('productPhotoPreview').src = p.photo_url;
        document.getElementById('productPhotoPreview').style.display = 'block';
        document.getElementById('productPhotoPlaceholder').style.display = 'none';
      }
    }
  }
  openModal('productModal');
}

function previewProductPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('productPhotoPreview').src = e.target.result;
    document.getElementById('productPhotoPreview').style.display = 'block';
    document.getElementById('productPhotoPlaceholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

async function deleteProduct(id) {
  if (!confirm('Supprimer ce produit définitivement ?')) return;
  await authFetch(`${API}/api/admin/products/${id}`, { method: 'DELETE' });
  showToast('Produit supprimé', 'success');
  loadProductsPage();
}

async function loadServicesPage() {
  const res = await authFetch(`${API}/api/services`);
  if (!res?.ok) return;
  const services = await res.json();
  const container = document.getElementById('servicesPageList');
  if (!container) return;
  if (!services.length) {
    container.innerHTML = '<p style="color:var(--text-light);text-align:center;padding:2rem">Aucun service. Cliquez sur « Nouveau service » pour commencer.</p>';
    return;
  }
  container.innerHTML = services.map(s => `
    <div class="service-page-item">
      <div class="spi-icon"><i class="${s.icon || 'fas fa-cut'}"></i></div>
      <div class="spi-info">
        <div class="spi-name">${s.name}</div>
        <div class="spi-meta">${s.duration} min${s.description ? ' · ' + s.description : ''}</div>
      </div>
      <div class="spi-price">${parseFloat(s.price).toFixed(2)} $</div>
      <div class="spi-actions">
        <button class="btn btn-sm btn-outline" onclick="openServiceModal(${s.id})"><i class="fas fa-pen"></i> Modifier</button>
        <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:none" onclick="deleteService(${s.id})"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  `).join('');
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
  const icon = id
    ? (await authFetch(`${API}/api/services`).then(r => r.json()).then(list => {
        const s = list.find(x => x.id === id);
        if (s) {
          document.getElementById('editServiceName').value = s.name;
          document.getElementById('editServiceDuration').value = s.duration;
          document.getElementById('editServicePrice').value = s.price;
          document.getElementById('editServiceDescription').value = s.description || '';
          return s.icon || 'fas fa-cut';
        }
        return 'fas fa-cut';
      }))
    : (() => { document.getElementById('serviceForm').reset(); return 'fas fa-cut'; })();
  document.getElementById('editServiceIcon').value = icon;
  document.querySelectorAll('#iconPicker .icon-opt').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.icon === icon);
  });
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

  document.getElementById('productForm').addEventListener('submit', async e => {
    e.preventDefault();
    const id = document.getElementById('editProductId').value;
    const photoInput = document.getElementById('productPhotoInput');

    if (id) {
      // Update text fields
      await authFetch(`${API}/api/admin/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: document.getElementById('editProductName').value,
          brand: document.getElementById('editProductBrand').value,
          type: document.getElementById('editProductType').value,
          price: parseFloat(document.getElementById('editProductPrice').value),
          description: document.getElementById('editProductDescription').value
        })
      });
      // Replace photo if a new file was chosen
      if (photoInput.files[0]) {
        const pf = new FormData();
        pf.append('photo', photoInput.files[0]);
        await authFetch(`${API}/api/admin/products/${id}/photo`, { method: 'PATCH', body: pf });
      }
    } else {
      const formData = new FormData();
      if (photoInput.files[0]) formData.append('photo', photoInput.files[0]);
      formData.append('name', document.getElementById('editProductName').value);
      formData.append('brand', document.getElementById('editProductBrand').value);
      formData.append('type', document.getElementById('editProductType').value);
      formData.append('price', document.getElementById('editProductPrice').value);
      formData.append('description', document.getElementById('editProductDescription').value);
      const res = await authFetch(`${API}/api/admin/products`, { method: 'POST', body: formData });
      if (!res?.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Erreur lors de l\'ajout', 'error');
        return;
      }
    }
    showToast(id ? 'Produit mis à jour' : 'Produit ajouté', 'success');
    closeAllModals();
    loadProductsPage();
  });

  document.getElementById('serviceForm').addEventListener('submit', async e => {
    e.preventDefault();
    const id = document.getElementById('editServiceId').value;
    const body = {
      name: document.getElementById('editServiceName').value,
      duration: parseInt(document.getElementById('editServiceDuration').value),
      price: parseFloat(document.getElementById('editServicePrice').value),
      description: document.getElementById('editServiceDescription').value,
      icon: document.getElementById('editServiceIcon').value || 'fas fa-cut'
    };
    const url = id ? `/api/services/${id}` : '/api/services';
    const method = id ? 'PUT' : 'POST';
    await authFetch(url, { method, body: JSON.stringify(body) });
    showToast(id ? 'Service mis à jour' : 'Service ajouté', 'success');
    closeAllModals();
    loadServicesPage();
    if (document.getElementById('page-settings')?.classList.contains('active') ||
        !document.getElementById('page-settings')?.classList.contains('hidden')) loadSettings();
  });

  document.getElementById('iconPicker')?.addEventListener('click', e => {
    const btn = e.target.closest('.icon-opt');
    if (!btn) return;
    document.querySelectorAll('#iconPicker .icon-opt').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('editServiceIcon').value = btn.dataset.icon;
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

  const colorInput = document.getElementById('customColor');
  const colorPreview = document.getElementById('colorPreview');
  if (colorInput) { colorInput.value = c.primary_color || '#e2b04a'; }
  if (colorPreview) colorPreview.style.background = c.primary_color || '#e2b04a';

  const fields = {
    customHeroTag: c.hero_tag, customHeroTitle: c.hero_title, customHeroSubtitle: c.hero_subtitle,
    customSalonName: c.name, customSalonPhone: c.phone, customSalonAddress: c.address, customSalonEmail: c.email,
    customInstagram: c.instagram_url, customFacebook: c.facebook_url, customTiktok: c.tiktok_url,
    customAboutText: c.about_text, customProductsText: c.products_text
  };
  Object.entries(fields).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.value = val || ''; });

  renderImageZone('logoPreviewWrap', c.logo_url, 'logo');
  renderImageZone('bannerPreviewWrap', c.banner_url, 'banner');
  renderImageZone('heroPhotoPreviewWrap', c.hero_photo_url, 'hero-photo');
}

function renderImageZone(wrapperId, url, type) {
  const wrap = document.getElementById(wrapperId);
  if (!wrap) return;
  const inputIdMap = { logo: 'logoInput', banner: 'bannerInput', 'hero-photo': 'heroPhotoInput' };
  const inputId = inputIdMap[type] || `${type}Input`;
  if (url) {
    wrap.innerHTML = `<img src="${url}" class="custom-image-preview" alt=""><button class="btn btn-sm btn-danger" style="margin:0.5rem" onclick="deleteCustomImage('${type}')"><i class="fas fa-trash"></i> Supprimer</button>`;
  } else {
    wrap.innerHTML = `<div class="custom-image-placeholder" onclick="document.getElementById('${inputId}').click()"><i class="fas fa-image"></i><span>Cliquer pour uploader</span></div>`;
  }
}

async function uploadCustomImage(type, input) {
  if (!input?.files[0]) return;
  const formData = new FormData();
  formData.append('image', input.files[0]);
  const res = await authFetch(`/api/admin/customization/${type}`, { method: 'POST', body: formData });
  if (res?.ok) { showToast('Image mise à jour', 'success'); loadCustomization(); }
  else {
    const d = await res?.json().catch(() => ({}));
    showToast(d?.error || 'Erreur upload', 'error');
  }
  input.value = '';
}

async function deleteCustomImage(type) {
  if (!confirm('Supprimer cette image ?')) return;
  const res = await authFetch(`/api/admin/customization/${type}`, { method: 'DELETE' });
  if (res?.ok) { showToast('Image supprimée', 'success'); loadCustomization(); }
}

async function saveCustomizationTexts() {
  const body = {
    hero_tag: document.getElementById('customHeroTag')?.value,
    hero_title: document.getElementById('customHeroTitle')?.value,
    hero_subtitle: document.getElementById('customHeroSubtitle')?.value
  };
  const res = await authFetch('/api/admin/customization', { method: 'PUT', body: JSON.stringify(body) });
  if (res?.ok) showToast('Textes sauvegardés', 'success');
}

async function saveCustomizationInfo() {
  const body = {
    name: document.getElementById('customSalonName')?.value,
    phone: document.getElementById('customSalonPhone')?.value,
    address: document.getElementById('customSalonAddress')?.value,
    email: document.getElementById('customSalonEmail')?.value
  };
  const res = await authFetch('/api/admin/customization', { method: 'PUT', body: JSON.stringify(body) });
  if (res?.ok) showToast('Informations sauvegardées', 'success');
}

async function saveCustomizationSocials() {
  const body = {
    instagram_url: document.getElementById('customInstagram')?.value || '',
    facebook_url: document.getElementById('customFacebook')?.value || '',
    tiktok_url: document.getElementById('customTiktok')?.value || ''
  };
  const res = await authFetch('/api/admin/customization', { method: 'PUT', body: JSON.stringify(body) });
  if (res?.ok) showToast('Réseaux sociaux sauvegardés', 'success');
}

async function saveCustomizationContent() {
  const body = {
    about_text: document.getElementById('customAboutText')?.value || '',
    products_text: document.getElementById('customProductsText')?.value || ''
  };
  const res = await authFetch('/api/admin/customization', { method: 'PUT', body: JSON.stringify(body) });
  if (res?.ok) showToast('Contenu sauvegardé', 'success');
}

async function saveCustomizationColor() {
  const color = document.getElementById('customColor')?.value;
  const res = await authFetch('/api/admin/customization', { method: 'PUT', body: JSON.stringify({ primary_color: color }) });
  if (res?.ok) showToast('Couleur appliquée', 'success');
}

// ---- GALLERY ----
async function loadGallery() {
  const res = await authFetch('/api/admin/gallery');
  if (!res?.ok) return;
  const photos = await res.json();
  const grid = document.getElementById('galleryGrid');
  if (!grid) return;
  if (!photos.length) {
    grid.innerHTML = '<div class="empty-state"><i class="fas fa-images"></i><p>Aucune photo pour l\'instant</p></div>';
    return;
  }
  grid.innerHTML = photos.map(p => `
    <div class="gallery-admin-item" id="gallery-item-${p.id}">
      <div class="gallery-admin-img-wrap">
        <img src="${p.url}" alt="${p.caption || ''}">
        <button class="gallery-admin-delete" onclick="deleteGalleryPhoto(${p.id})" title="Supprimer"><i class="fas fa-trash"></i></button>
      </div>
      <input type="text" class="form-input gallery-caption-input" value="${p.caption || ''}" placeholder="Légende (optionnel)"
        onblur="saveGalleryCaption(${p.id}, this.value)" style="margin-top:0.5rem;font-size:0.8rem;padding:6px 8px">
    </div>
  `).join('');
}

async function uploadGalleryPhotos(input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  let uploaded = 0;
  for (const file of files) {
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await authFetch('/api/admin/gallery', { method: 'POST', body: formData });
      if (res?.ok) {
        uploaded++;
      } else {
        let errMsg = file.name;
        try { const d = await res.json(); errMsg = d.error || errMsg; } catch(_) {}
        showToast('Erreur: ' + errMsg, 'error');
      }
    } catch(e) {
      showToast('Erreur réseau: ' + file.name, 'error');
    }
  }
  if (uploaded) showToast(`${uploaded} photo(s) ajoutée(s)`, 'success');
  input.value = '';
  loadGallery();
}

async function deleteGalleryPhoto(id) {
  if (!confirm('Supprimer cette photo ?')) return;
  const res = await authFetch(`/api/admin/gallery/${id}`, { method: 'DELETE' });
  if (res?.ok) { showToast('Photo supprimée', 'success'); loadGallery(); }
}

async function saveGalleryCaption(id, caption) {
  await authFetch(`/api/admin/gallery/${id}`, { method: 'PATCH', body: JSON.stringify({ caption }) });
}

function copyBookingUrl() {
  const url = window._tenantBookingUrl || document.getElementById('bookingUrlText')?.textContent;
  if (url) navigator.clipboard.writeText(url).then(() => showToast('URL copiée !', 'success'));
}

function openSupportModal() {
  document.getElementById('supportModal').classList.add('open');
  document.getElementById('modalOverlay').classList.add('open');
}

function closeSupportModal() {
  document.getElementById('supportModal').classList.remove('open');
  document.getElementById('modalOverlay').classList.remove('open');
}

async function sendSupportEmail() {
  const subject = document.getElementById('supportSubject')?.value?.trim();
  const message = document.getElementById('supportMessage')?.value?.trim();
  if (!subject || !message) { showToast('Veuillez remplir tous les champs', 'error'); return; }
  const btn = document.querySelector('#supportModal .btn-primary');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...'; }
  try {
    const res = await authFetch('/api/admin/support', {
      method: 'POST',
      body: JSON.stringify({ subject, message })
    });
    const d = await res?.json().catch(() => ({}));
    if (res?.ok) {
      showToast('Message envoyé au support !', 'success');
    } else {
      showToast(d?.error || 'Erreur envoi', 'error');
    }
  } catch(e) {
    showToast('Erreur de connexion', 'error');
  } finally {
    document.getElementById('supportSubject').value = '';
    document.getElementById('supportMessage').value = '';
    closeSupportModal();
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Envoyer'; }
  }
}

async function sendBookingLinkSms() {
  const input = document.getElementById('quickSmsPhone');
  const phone = input?.value?.trim();
  if (!phone) { showToast('Entrez un numéro de téléphone', 'error'); return; }
  const btn = document.querySelector('[onclick="sendBookingLinkSms()"]');
  if (btn) btn.disabled = true;
  const res = await authFetch('/api/admin/send-booking-link', {
    method: 'POST',
    body: JSON.stringify({ phone })
  });
  const d = await res?.json().catch(() => ({}));
  if (res?.ok) { showToast('Lien envoyé par SMS !', 'success'); input.value = ''; }
  else showToast(d?.error || 'Erreur envoi SMS', 'error');
  if (btn) btn.disabled = false;
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

  const plans = [
    { key: 'starter',  label: 'Starter',  price: 29,  desc: '1 barbier, 100 RDV/mois, 50 SMS' },
    { key: 'pro',      label: 'Pro',       price: 59,  desc: '3 barbiers, illimité, 200 SMS' },
    { key: 'business', label: 'Business',  price: 99,  desc: 'Barbiers illimités, 500 SMS' },
  ];
  const planCards = plans.map(p => {
    const isCurrent = b.plan === p.key;
    return `<div style="border:2px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'};border-radius:10px;padding:1.25rem;flex:1;min-width:160px;background:${isCurrent ? 'rgba(226,176,74,0.06)' : 'var(--surface)'}">
      <div style="font-weight:700;font-size:1rem;color:${isCurrent ? 'var(--accent)' : 'var(--text)'}">${p.label}</div>
      <div style="font-size:1.5rem;font-weight:800;margin:6px 0">${p.price}<span style="font-size:0.8rem;font-weight:400;color:var(--text-light)"> $/mois</span></div>
      <div style="font-size:0.75rem;color:var(--text-light);margin-bottom:12px">${p.desc}</div>
      ${isCurrent
        ? `<span style="font-size:0.75rem;color:var(--accent);font-weight:600"><i class="fas fa-check"></i> Plan actuel</span>`
        : `<button class="btn btn-primary" style="width:100%;font-size:0.8rem;padding:6px" onclick="subscribeToPlan('${p.key}')">Choisir</button>`}
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="margin-bottom:1.5rem">
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
        <span class="billing-plan-name">${(b.plan||'').toUpperCase()}</span>
        <span class="plan-badge ${b.plan_status}">${b.plan_status}</span>
        ${daysInfo}
      </div>
    </div>
    <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1.5rem">${planCards}</div>
    ${b.stripe_customer_id ? `<button class="btn btn-secondary" onclick="openStripePortal()"><i class="fas fa-external-link-alt"></i> Gérer la facturation (Stripe)</button>` : ''}`;
}

async function openStripePortal() {
  const res = await authFetch('/api/admin/billing/portal', { method: 'POST', body: JSON.stringify({}) });
  if (res?.ok) { const { url } = await res.json(); if (url) window.location.href = url; }
  else showToast('Portail Stripe non configuré', 'warning');
}

async function subscribeToPlan(plan) {
  if (!confirm(`Passer au plan ${plan} ?`)) return;
  const res = await authFetch('/api/admin/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) });
  if (res?.ok) { const { url } = await res.json(); if (url) window.location.href = url; }
  else showToast('Erreur lors du checkout', 'error');
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
