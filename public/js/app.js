/* ============================================
   BARBERPRO – CLIENT APP
   ============================================ */

const API = '';

const state = {
  services: [],
  barbers: [],
  selectedService: null,
  selectedBarber: null,
  selectedDate: null,
  selectedTime: null,
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth()
};

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  loadServices();
  loadBarbers();
  initCalendar();
  initBookingForm();
  document.getElementById('hamburger').addEventListener('click', toggleMenu);
  document.getElementById('dateDisplay') && (document.getElementById('dateDisplay').textContent = formatDate(new Date()));
});

function toggleMenu() {
  document.getElementById('mobileMenu').classList.toggle('open');
}

// ---- SERVICES ----
async function loadServices() {
  try {
    const res = await fetch(`${API}/api/services`);
    state.services = await res.json();
    renderServicesSection();
    renderServiceOptions();
  } catch (e) { console.error(e); }
}

function renderServicesSection() {
  const grid = document.getElementById('servicesGrid');
  if (!grid) return;
  const icons = ['fas fa-cut', 'fas fa-razor', 'fas fa-star', 'fas fa-child', 'fas fa-spa', 'fas fa-hat-wizard'];
  grid.innerHTML = state.services.map((s, i) => `
    <div class="service-card">
      <div class="service-icon"><i class="${icons[i % icons.length]}"></i></div>
      <div class="service-name">${s.name}</div>
      <div class="service-desc">${s.description || 'Service professionnel de qualité'}</div>
      <div class="service-meta">
        <span class="service-price">${s.price.toFixed(2)} $</span>
        <span class="service-duration"><i class="fas fa-clock"></i> ${s.duration} min</span>
      </div>
    </div>
  `).join('');
}

function renderServiceOptions() {
  const grid = document.getElementById('serviceSelectGrid');
  if (!grid) return;
  grid.innerHTML = state.services.map(s => `
    <div class="service-option" onclick="selectService(${s.id})" id="svc-${s.id}">
      <div class="s-name">${s.name}</div>
      <div class="s-info"><i class="fas fa-clock"></i> ${s.duration} min</div>
      <div class="s-price">${s.price.toFixed(2)} $</div>
    </div>
  `).join('');
}

function selectService(id) {
  document.querySelectorAll('.service-option').forEach(el => el.classList.remove('selected'));
  document.getElementById(`svc-${id}`).classList.add('selected');
  state.selectedService = state.services.find(s => s.id === id);
  document.getElementById('step1Next').disabled = false;
}

// ---- BARBERS ----
async function loadBarbers() {
  try {
    const res = await fetch(`${API}/api/barbers`);
    state.barbers = await res.json();
    renderTeamSection();
    renderBarberOptions();
  } catch (e) { console.error(e); }
}

function renderTeamSection() {
  const grid = document.getElementById('teamGrid');
  if (!grid) return;
  grid.innerHTML = state.barbers.map(b => `
    <div class="barber-card">
      <div class="barber-avatar" style="background:${b.color}">${b.name.charAt(0)}</div>
      <div class="barber-name">${b.name}</div>
      <div class="barber-title">Barbier professionnel</div>
    </div>
  `).join('');
}

function renderBarberOptions() {
  const grid = document.getElementById('barberSelectGrid');
  if (!grid) return;
  const anyOption = `
    <div class="barber-option selected" onclick="selectBarber(null)" id="barber-any">
      <div class="b-avatar" style="background:#64748b">?</div>
      <div class="b-name">N'importe lequel</div>
    </div>
  `;
  grid.innerHTML = anyOption + state.barbers.map(b => `
    <div class="barber-option" onclick="selectBarber(${b.id})" id="barber-${b.id}">
      <div class="b-avatar" style="background:${b.color}">${b.name.charAt(0)}</div>
      <div class="b-name">${b.name}</div>
    </div>
  `).join('');
  state.selectedBarber = null;
  document.getElementById('step2Next').disabled = false;
}

function selectBarber(id) {
  document.querySelectorAll('.barber-option').forEach(el => el.classList.remove('selected'));
  document.getElementById(id ? `barber-${id}` : 'barber-any').classList.add('selected');
  state.selectedBarber = id ? state.barbers.find(b => b.id === id) : null;
  document.getElementById('step2Next').disabled = false;
}

// ---- STEPS ----
function goToStep(n) {
  document.querySelectorAll('.wizard-step').forEach(s => s.classList.add('hidden'));
  document.getElementById(`step${n === 'success' ? 'Success' : n}`).classList.remove('hidden');
  document.querySelectorAll('.step[data-step]').forEach(s => {
    const sn = parseInt(s.dataset.step);
    s.classList.remove('active', 'done');
    if (sn === n) s.classList.add('active');
    else if (sn < n) s.classList.add('done');
  });
  if (n === 3) renderCalendar();
  if (n === 4) renderBookingSummary();
}

// ---- CALENDAR ----
function initCalendar() {
  document.getElementById('prevMonth').addEventListener('click', () => { state.currentMonth--; if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; } renderCalendar(); });
  document.getElementById('nextMonth').addEventListener('click', () => { state.currentMonth++; if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; } renderCalendar(); });
}

function renderCalendar() {
  const months = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  document.getElementById('calendarTitle').textContent = `${months[state.currentMonth]} ${state.currentYear}`;

  const today = new Date(); today.setHours(0,0,0,0);
  const firstDay = new Date(state.currentYear, state.currentMonth, 1).getDay();
  const daysInMonth = new Date(state.currentYear, state.currentMonth + 1, 0).getDate();

  const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  let html = days.map(d => `<div class="day-name">${d}</div>`).join('');

  for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(state.currentYear, state.currentMonth, d);
    const dateStr = `${state.currentYear}-${String(state.currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isPast = date < today;
    const isToday = date.getTime() === today.getTime();
    const isSelected = dateStr === state.selectedDate;
    let cls = 'cal-day';
    if (isPast) cls += ' past';
    if (isToday) cls += ' today';
    if (isSelected) cls += ' selected';
    html += `<div class="${cls}" data-date="${dateStr}" onclick="selectDate('${dateStr}')">${d}</div>`;
  }
  document.getElementById('calendarGrid').innerHTML = html;
}

async function selectDate(dateStr) {
  state.selectedDate = dateStr;
  state.selectedTime = null;
  document.getElementById('step3Next').disabled = true;
  renderCalendar();

  const barberId = state.selectedBarber ? state.selectedBarber.id : state.barbers[0]?.id;
  const serviceId = state.selectedService?.id;
  if (!barberId || !serviceId) return;

  const section = document.getElementById('timeSlotsSection');
  section.style.display = 'block';
  document.getElementById('selectedDateLabel').textContent = formatDateFr(dateStr);
  document.getElementById('timeSlots').innerHTML = '<div class="spinner-container"><div class="spinner"></div></div>';

  try {
    const res = await fetch(`${API}/api/appointments/available-slots?date=${dateStr}&barber_id=${barberId}&service_id=${serviceId}`);
    const data = await res.json();
    if (data.closed) {
      document.getElementById('timeSlots').innerHTML = '<p style="color:var(--text-light); font-size:0.875rem;">Le salon est fermé ce jour-là.</p>';
    } else if (data.slots.length === 0) {
      document.getElementById('timeSlots').innerHTML = '<p style="color:var(--text-light); font-size:0.875rem;">Aucun créneau disponible pour cette date.</p>';
    } else {
      document.getElementById('timeSlots').innerHTML = data.slots.map(s => `
        <button class="slot-btn" onclick="selectSlot('${s}')" id="slot-${s.replace(':','-')}">${s}</button>
      `).join('');
    }
  } catch (e) {
    document.getElementById('timeSlots').innerHTML = '<p style="color:var(--red)">Erreur de chargement.</p>';
  }
}

function selectSlot(time) {
  document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById(`slot-${time.replace(':','-')}`).classList.add('selected');
  state.selectedTime = time;
  document.getElementById('step3Next').disabled = false;
}

// ---- BOOKING SUMMARY ----
function renderBookingSummary() {
  const barberName = state.selectedBarber ? state.selectedBarber.name : 'Premier disponible';
  document.getElementById('bookingSummary').innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; font-size:0.875rem;">
      <span style="color:var(--text-light)">Service</span><strong>${state.selectedService?.name}</strong>
      <span style="color:var(--text-light)">Barbier</span><strong>${barberName}</strong>
      <span style="color:var(--text-light)">Date</span><strong>${formatDateFr(state.selectedDate)}</strong>
      <span style="color:var(--text-light)">Heure</span><strong>${state.selectedTime}</strong>
      <span style="color:var(--text-light)">Prix</span><strong style="color:var(--accent)">${state.selectedService?.price.toFixed(2)} $</strong>
    </div>
  `;
}

// ---- BOOKING FORM ----
function initBookingForm() {
  document.getElementById('clientForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px"></div> Confirmation...';

    const barberId = state.selectedBarber ? state.selectedBarber.id : state.barbers[0]?.id;

    try {
      const res = await fetch(`${API}/api/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: document.getElementById('clientName').value,
          client_phone: document.getElementById('clientPhone').value,
          client_email: document.getElementById('clientEmail').value,
          barber_id: barberId,
          service_id: state.selectedService?.id,
          date: state.selectedDate,
          time: state.selectedTime,
          notes: document.getElementById('apptNotes').value
        })
      });
      const data = await res.json();
      if (res.ok) {
        showConfirmation();
      } else {
        alert(data.error || 'Erreur lors de la réservation.');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check-circle"></i> Confirmer le rendez-vous';
      }
    } catch (e) {
      alert('Erreur de connexion.');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check-circle"></i> Confirmer le rendez-vous';
    }
  });
}

function showConfirmation() {
  const barberName = state.selectedBarber ? state.selectedBarber.name : 'Premier disponible';
  document.getElementById('confirmationDetails').innerHTML = `
    <div class="confirmation-row"><span class="label">Service</span><span class="value">${state.selectedService?.name}</span></div>
    <div class="confirmation-row"><span class="label">Barbier</span><span class="value">${barberName}</span></div>
    <div class="confirmation-row"><span class="label">Date</span><span class="value">${formatDateFr(state.selectedDate)}</span></div>
    <div class="confirmation-row"><span class="label">Heure</span><span class="value">${state.selectedTime}</span></div>
    <div class="confirmation-row"><span class="label">Prix</span><span class="value">${state.selectedService?.price.toFixed(2)} $</span></div>
    <div class="confirmation-row"><span class="label">Rappel SMS</span><span class="value" style="color:var(--green)">✓ 24h avant</span></div>
  `;
  goToStep('success');
}

function resetBooking() {
  state.selectedService = null;
  state.selectedBarber = null;
  state.selectedDate = null;
  state.selectedTime = null;
  document.getElementById('clientForm').reset();
  document.getElementById('step1Next').disabled = true;
  document.getElementById('step2Next').disabled = false;
  document.getElementById('step3Next').disabled = true;
  renderServiceOptions();
  renderBarberOptions();
  document.getElementById('timeSlotsSection').style.display = 'none';
  goToStep(1);
  window.scrollTo({ top: document.getElementById('booking').offsetTop - 80, behavior: 'smooth' });
}

// ---- UTILS ----
function formatDate(d) {
  return d.toLocaleDateString('fr-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
function formatDateFr(str) {
  if (!str) return '';
  const d = new Date(str + 'T12:00:00');
  return d.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
