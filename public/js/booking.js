/* ============================================
   BOOKING PAGE – public/js/booking.js
   ============================================ */

const slug = window.location.pathname.split('/')[2] || '';
const API_BASE = `/api/book/${slug}`;

// ---- STATE ----
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
  loadTenantInfo();
  loadGallery();
  // Bouton retour en haut
  const btn = document.getElementById('backToTopBtn');
  if (btn) {
    window.addEventListener('scroll', () => {
      const show = window.scrollY > 300;
      btn.style.display = show ? 'flex' : 'none';
    }, { passive: true });
  }
  loadProducts();
  loadServices();
  loadBarbers();
  initCalendar();
  initNavHighlight();
  document.getElementById('bookingForm').addEventListener('submit', submitBooking);
});

function initNavHighlight() {
  const links = document.querySelectorAll('.bnav-link[data-section]');
  const sections = ['accueil', 'boutique', 'services', 'gallery-section', 'reservation'];
  // gallery-section mappe sur data-section="gallery-section"
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const id = e.target.id;
        links.forEach(l => {
          l.classList.toggle('active', l.dataset.section === id);
        });
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  sections.forEach(id => { const el = document.getElementById(id); if (el) observer.observe(el); });
}

async function loadGallery() {
  try {
    const res = await fetch(`${API_BASE}/gallery`);
    if (!res.ok) return;
    const photos = await res.json();
    if (!photos.length) return;
    const section = document.getElementById('gallery-section');
    const grid = document.getElementById('galleryGrid');
    if (!section || !grid) return;
    grid.innerHTML = photos.map(p => `
      <div class="gallery-public-item">
        <img src="${p.url}" alt="${p.caption || ''}" loading="lazy" onclick="openLightbox('${p.url}', '${(p.caption||'').replace(/'/g,"\\'")}')">
        ${p.caption ? `<div class="gallery-public-caption">${p.caption}</div>` : ''}
      </div>
    `).join('');
    section.style.display = 'block';
    const navLink = document.getElementById('navGalleryLink');
    if (navLink) navLink.style.display = '';
  } catch (e) {}
}

function openLightbox(url, caption) {
  const lb = document.createElement('div');
  lb.className = 'gallery-lightbox';
  lb.innerHTML = `
    <div class="gallery-lightbox-backdrop" onclick="this.parentElement.remove()"></div>
    <div class="gallery-lightbox-content">
      <img src="${url}" alt="${caption}">
      ${caption ? `<p>${caption}</p>` : ''}
      <button onclick="this.closest('.gallery-lightbox').remove()"><i class="fas fa-times"></i></button>
    </div>
  `;
  document.body.appendChild(lb);
}

// ---- BOUTIQUE ----
let allProducts = [];
let activeTypeFilter = 'Tous';

function brandSlug(brand) {
  return (brand || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

async function loadProducts() {
  try {
    const res = await fetch(`${API_BASE}/products`);
    if (!res.ok) return;
    const products = await res.json();
    allProducts = products;
    if (!products.length) return;

    const section = document.getElementById('boutique');
    if (!section) return;

    const brands = [...new Set(products.map(p => p.brand).filter(Boolean))].sort();
    const types  = [...new Set(products.map(p => p.type).filter(Boolean))].sort();

    // Filtres par type
    const typeFiltersEl = document.getElementById('boutiqueTypeFilters');
    if (typeFiltersEl && types.length) {
      typeFiltersEl.innerHTML = ['Tous', ...types].map(t =>
        `<button class="product-type-btn${t === activeTypeFilter ? ' active' : ''}" onclick="filterByType('${t.replace(/'/g, "\\'")}')"><i class="fas fa-tag" style="font-size:0.7rem;opacity:0.6;margin-right:0.3rem"></i>${t}</button>`
      ).join('');
    }

    // Filtres par marque (ancres de défilement, visibles uniquement en vue "Tous")
    renderBrandFilters(brands);

    // Afficher les produits
    renderBoutiqueProducts(products, activeTypeFilter);
    section.style.display = 'block';
  } catch (e) {}
}

function renderBrandFilters(brands) {
  const el = document.getElementById('boutiqueBrandFilters');
  if (!el) return;
  if (activeTypeFilter !== 'Tous' || brands.length <= 1) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = brands.map(b =>
    `<button class="product-type-btn" style="background:var(--surface);border:1px solid var(--border)" onclick="scrollToBrand('${brandSlug(b)}')"><i class="fas fa-store" style="font-size:0.7rem;opacity:0.6;margin-right:0.3rem"></i>${b}</button>`
  ).join('');
}

function renderBoutiqueProducts(products, typeFilter) {
  const container = document.getElementById('boutiqueProducts');
  if (!container) return;
  if (typeFilter === 'Tous') {
    renderProductsByBrand(products, container);
  } else {
    const filtered = products.filter(p => p.type === typeFilter);
    if (!filtered.length) {
      container.innerHTML = '<p style="color:var(--text-light);text-align:center;padding:2rem">Aucun produit dans cette catégorie.</p>';
    } else {
      container.innerHTML = `<div class="products-pub-grid">${filtered.map(p => productCardHtml(p)).join('')}</div>`;
    }
  }
}

function renderProductsByBrand(products, container) {
  const groups = {};
  products.forEach(p => {
    const brand = p.brand || 'Autre';
    if (!groups[brand]) groups[brand] = [];
    groups[brand].push(p);
  });
  container.innerHTML = Object.keys(groups).sort().map(brand => `
    <div class="products-brand-group" id="brand-${brandSlug(brand)}">
      <h3 class="products-brand-title">${brand}</h3>
      <div class="products-pub-grid">
        ${groups[brand].map(p => productCardHtml(p)).join('')}
      </div>
    </div>
  `).join('');
}

function filterByType(type) {
  activeTypeFilter = type;
  document.querySelectorAll('#boutiqueTypeFilters .product-type-btn').forEach(b =>
    b.classList.toggle('active', b.textContent.trim() === type)
  );
  const brands = [...new Set(allProducts.map(p => p.brand).filter(Boolean))].sort();
  renderBrandFilters(brands);
  renderBoutiqueProducts(allProducts, type);
}

function scrollToBrand(slug) {
  filterByType('Tous');
  setTimeout(() => {
    const el = document.getElementById('brand-' + slug);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

function productCardHtml(p) {
  return `
    <div class="product-pub-card">
      <div class="ppc-photo">
        ${p.photo_url
          ? `<img src="${p.photo_url}" alt="${p.name}" loading="lazy">`
          : `<div class="ppc-no-photo"><i class="fas fa-box-open"></i></div>`}
      </div>
      <div class="ppc-info">
        ${p.brand ? `<div class="ppc-brand">${p.brand}</div>` : ''}
        <div class="ppc-name">${p.name}</div>
        ${p.type ? `<span class="ppc-type">${p.type}</span>` : ''}
        ${p.description ? `<div class="ppc-desc">${p.description}</div>` : ''}
        <div class="ppc-price">${parseFloat(p.price || 0).toFixed(2)} $</div>
      </div>
    </div>
  `;
}

// ---- TENANT INFO ----
async function loadTenantInfo() {
  try {
    const res = await fetch(`${API_BASE}/info`);
    if (!res.ok) return;
    const info = await res.json();

    // Apply tenant accent color
    document.documentElement.style.setProperty('--tenant-accent', info.primary_color || '#e2b04a');

    // Page title
    document.title = `${info.name} – Réservation en ligne`;

    // Header
    const salonNameEl = document.getElementById('salonName');
    if (salonNameEl) salonNameEl.textContent = info.name || 'Salon';

    if (info.logo_url) {
      const logoEl = document.getElementById('salonLogo');
      if (logoEl) {
        logoEl.src = info.logo_url;
        logoEl.style.display = 'block';
      }
    }

    // Hero background
    const bgUrl = info.banner_url || info.hero_photo_url;
    const heroBg = document.getElementById('heroBg');
    if (info.hero_mode === 'slideshow' && info.hero_slides?.length) {
      initSlideshow(info.hero_slides);
    } else if (bgUrl && heroBg) {
      heroBg.style.backgroundImage = `url('${bgUrl}')`;
      heroBg.style.opacity = '1';
    }

    // Overlay couleur + opacité
    const color = info.hero_bg_color || '#1a1a2e';
    const opacity = (info.hero_overlay_opacity ?? 70) / 100;
    const r = parseInt(color.slice(1,3),16)||26;
    const g = parseInt(color.slice(3,5),16)||26;
    const b = parseInt(color.slice(5,7),16)||46;
    const overlay = document.querySelector('.booking-hero-overlay');
    if (overlay) overlay.style.background = `rgba(${r},${g},${b},${opacity})`;
    if (!bgUrl) {
      const heroEl = document.querySelector('.booking-hero');
      if (heroEl) heroEl.style.background = `linear-gradient(135deg, ${color}, ${color}dd)`;
    }

    // Hero texts
    if (info.hero_tag) {
      const tagEl = document.getElementById('heroTag');
      if (tagEl) { tagEl.textContent = info.hero_tag; tagEl.style.display = 'inline-block'; }
    }
    if (info.hero_title) {
      const titleEl = document.getElementById('heroTitle');
      if (titleEl) titleEl.textContent = info.hero_title;
    }
    if (info.hero_subtitle) {
      const subtitleEl = document.getElementById('heroSubtitle');
      if (subtitleEl) subtitleEl.textContent = info.hero_subtitle;
    }

    // Footer contact info
    const contactEl = document.getElementById('salonContactInfo');
    if (contactEl) {
      let parts = [];
      if (info.phone) parts.push(`<span><i class="fas fa-phone" style="margin-right:4px"></i>${info.phone}</span>`);
      if (info.address) parts.push(`<span><i class="fas fa-map-marker-alt" style="margin-right:4px"></i>${info.address}</span>`);
      contactEl.innerHTML = parts.join('');
    }

    // Réseaux sociaux (header + footer)
    const socialLinks = [
      info.instagram_url && { url: info.instagram_url, icon: 'fab fa-instagram', label: 'Instagram' },
      info.facebook_url  && { url: info.facebook_url,  icon: 'fab fa-facebook-f', label: 'Facebook' },
      info.tiktok_url    && { url: info.tiktok_url,    icon: 'fab fa-tiktok',     label: 'TikTok' }
    ].filter(Boolean);
    const socialHtml = socialLinks.map(s =>
      `<a href="${s.url}" target="_blank" rel="noopener" class="social-icon-link" title="${s.label}"><i class="${s.icon}"></i></a>`
    ).join('');
    const headerSocials = document.getElementById('headerSocials');
    const footerSocials = document.getElementById('footerSocials');
    if (headerSocials) headerSocials.innerHTML = socialHtml;
    if (footerSocials) footerSocials.innerHTML = socialHtml;

    // Sections marque/produits sont remplies par loadProducts()
  } catch (e) {
    console.error('loadTenantInfo error:', e);
  }
}

// ---- HERO SLIDESHOW ----
function initSlideshow(slides) {
  if (!slides?.length) return;
  const bg1 = document.getElementById('heroBg');
  const bg2 = document.getElementById('heroBg2');
  if (!bg1) return;

  // Précharger toutes les images
  slides.forEach(s => { const img = new Image(); img.src = s.url; });

  let current = 0;
  let usingBg1 = true;

  bg1.style.backgroundImage = `url('${slides[0].url}')`;
  bg1.style.opacity = '1';
  if (bg2) bg2.style.opacity = '0';

  if (slides.length < 2 || !bg2) return;

  setInterval(() => {
    current = (current + 1) % slides.length;
    const nextUrl = `url('${slides[current].url}')`;
    if (usingBg1) {
      bg2.style.backgroundImage = nextUrl;
      bg2.style.opacity = '1';
      bg1.style.opacity = '0';
    } else {
      bg1.style.backgroundImage = nextUrl;
      bg1.style.opacity = '1';
      bg2.style.opacity = '0';
    }
    usingBg1 = !usingBg1;
  }, 5000);
}

// ---- SERVICES ----
async function loadServices() {
  try {
    const res = await fetch(`${API_BASE}/services`);
    if (!res.ok) return;
    state.services = await res.json();
    renderServiceOptions();
    renderServicesShowcase();
  } catch (e) {
    console.error('loadServices error:', e);
    document.getElementById('serviceGrid').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Impossible de charger les services.</p></div>';
  }
}

function renderServicesShowcase() {
  const showcase = document.getElementById('servicesShowcase');
  if (!showcase || !state.services.length) return;
  showcase.innerHTML = state.services.map(s => `
    <div class="service-showcase-card">
      <div class="ssc-icon"><i class="${s.icon || 'fas fa-cut'}"></i></div>
      <div class="ssc-info">
        <h3>${s.name}</h3>
        ${s.description ? `<p>${s.description}</p>` : ''}
      </div>
      <div class="ssc-meta">
        <span class="ssc-duration"><i class="fas fa-clock"></i> ${s.duration} min</span>
        <span class="ssc-price">${parseFloat(s.price).toFixed(2)} $</span>
      </div>
      <a href="#reservation" class="btn btn-primary" style="text-decoration:none;font-size:0.8rem;padding:8px 14px;margin-top:0.25rem;text-align:center" onclick="preselectService(${s.id})">
        <i class="fas fa-calendar-plus"></i> Réserver
      </a>
    </div>
  `).join('');
}

function preselectService(serviceId) {
  const service = state.services.find(s => s.id === serviceId);
  if (!service) return;
  state.selectedService = serviceId;
  document.getElementById('btn-step1-next').disabled = false;
  renderServiceOptions();
}

function renderServiceOptions() {
  const grid = document.getElementById('serviceGrid');
  if (!grid) return;
  if (!state.services.length) {
    grid.innerHTML = '<div class="empty-state"><i class="fas fa-scissors"></i><p>Aucun service disponible.</p></div>';
    return;
  }
  grid.innerHTML = state.services.map(s => `
    <div class="service-card ${state.selectedService === s.id ? 'selected' : ''}" onclick="selectService(${s.id})">
      <div class="service-name">${s.name}</div>
      <div class="service-meta">
        <span><i class="fas fa-clock"></i> ${s.duration} min</span>
        <span class="service-price">${parseFloat(s.price).toFixed(2)} $</span>
      </div>
      ${s.description ? `<div class="service-desc" style="font-size:0.8rem;color:var(--text-light);margin-top:0.4rem">${s.description}</div>` : ''}
    </div>
  `).join('');
}

function selectService(id) {
  state.selectedService = id;
  renderServiceOptions();
  const btn = document.getElementById('btn-step1-next');
  if (btn) btn.disabled = false;
}

// ---- BARBERS ----
async function loadBarbers() {
  try {
    const res = await fetch(`${API_BASE}/barbers`);
    if (!res.ok) return;
    state.barbers = await res.json();
    renderBarberOptions();
  } catch (e) {
    console.error('loadBarbers error:', e);
  }
}

function renderBarberOptions() {
  const grid = document.getElementById('barberGrid');
  if (!grid) return;
  if (!state.barbers.length) {
    grid.innerHTML = '<div class="empty-state"><i class="fas fa-user-slash"></i><p>Aucun barbier disponible.</p></div>';
    return;
  }

  // Prepend "Any barber" option
  const anySelected = state.selectedBarber === 'any';
  let html = `
    <div class="barber-card ${anySelected ? 'selected' : ''}" onclick="selectBarber('any')">
      <div class="barber-avatar" style="background:#64748b"><i class="fas fa-random"></i></div>
      <div class="barber-name">Peu importe</div>
    </div>
  `;
  html += state.barbers.map(b => `
    <div class="barber-card ${state.selectedBarber === b.id ? 'selected' : ''}" onclick="selectBarber(${b.id})">
      <div class="barber-avatar" style="background:${b.color || '#1a1a2e'}">${b.name.charAt(0).toUpperCase()}</div>
      <div class="barber-name">${b.name}</div>
    </div>
  `).join('');
  grid.innerHTML = html;
}

function selectBarber(id) {
  state.selectedBarber = id;
  renderBarberOptions();
  const btn = document.getElementById('btn-step2-next');
  if (btn) btn.disabled = false;
}

// ---- CALENDAR ----
function initCalendar() {
  renderCalendar();
}

function renderCalendar() {
  const label = document.getElementById('calMonthLabel');
  const grid = document.getElementById('calendarGrid');
  if (!label || !grid) return;

  const months = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  label.textContent = `${months[state.currentMonth]} ${state.currentYear}`;

  const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  let html = days.map(d => `<div class="cal-day-header">${d}</div>`).join('');

  const firstDay = new Date(state.currentYear, state.currentMonth, 1).getDay();
  const daysInMonth = new Date(state.currentYear, state.currentMonth + 1, 0).getDate();
  const today = new Date();
  today.setHours(0,0,0,0);

  for (let i = 0; i < firstDay; i++) {
    html += '<div class="calendar-day empty"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(state.currentYear, state.currentMonth, d);
    const dateStr = `${state.currentYear}-${String(state.currentMonth + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isPast = dateObj < today;
    const isSelected = state.selectedDate === dateStr;
    html += `<div class="calendar-day${isPast ? ' past disabled' : ''}${isSelected ? ' selected' : ''}"
      ${!isPast ? `onclick="selectDate('${dateStr}')"` : ''}>
      ${d}
    </div>`;
  }

  grid.innerHTML = html;
}

function prevMonth() {
  if (state.currentMonth === 0) { state.currentMonth = 11; state.currentYear--; }
  else state.currentMonth--;
  renderCalendar();
}

function nextMonth() {
  if (state.currentMonth === 11) { state.currentMonth = 0; state.currentYear++; }
  else state.currentMonth++;
  renderCalendar();
}

async function selectDate(dateStr) {
  state.selectedDate = dateStr;
  state.selectedTime = null;
  renderCalendar();

  const label = document.getElementById('selectedDateLabel');
  if (label) label.textContent = `Créneaux disponibles — ${formatDateFr(dateStr)}`;

  const slotsEl = document.getElementById('timeSlots');
  if (slotsEl) slotsEl.innerHTML = '<div class="empty-state"><div class="spinner" style="width:24px;height:24px;border-width:2px;margin:0 auto"></div><p>Chargement...</p></div>';

  const btn = document.getElementById('btn-step3-next');
  if (btn) btn.disabled = true;

  try {
    const params = new URLSearchParams({ date: dateStr });
    params.set('barber_id', state.selectedBarber === 'any' ? 0 : state.selectedBarber);
    if (state.selectedService) params.set('service_id', state.selectedService);

    const res = await fetch(`${API_BASE}/slots?${params}`);
    const data = await res.json();
    renderTimeSlots(data);
  } catch (e) {
    if (slotsEl) slotsEl.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Erreur de chargement.</p></div>';
  }
}

function renderTimeSlots(data) {
  const el = document.getElementById('timeSlots');
  if (!el) return;

  if (data.closed) {
    el.innerHTML = '<div class="empty-state"><i class="fas fa-door-closed"></i><p>Salon fermé ce jour.</p></div>';
    return;
  }
  if (!data.slots || !data.slots.length) {
    el.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-times"></i><p>Aucun créneau disponible.</p></div>';
    return;
  }

  el.innerHTML = data.slots.map(slot => `
    <button class="time-slot${state.selectedTime === slot ? ' selected' : ''}" onclick="selectSlot('${slot}')">
      ${slot}
    </button>
  `).join('');
}

function selectSlot(time) {
  state.selectedTime = time;
  // Re-render slots to update selection
  const slots = document.querySelectorAll('.time-slot');
  slots.forEach(s => {
    s.classList.toggle('selected', s.textContent.trim() === time);
  });
  const btn = document.getElementById('btn-step3-next');
  if (btn) btn.disabled = false;
}

// ---- STEP NAVIGATION ----
function goToStep(n) {
  for (let i = 1; i <= 4; i++) {
    const stepEl = document.getElementById(`wizard-step-${i}`);
    if (stepEl) stepEl.classList.toggle('hidden', i !== n);
    const indEl = document.getElementById(`step-ind-${i}`);
    if (indEl) {
      indEl.classList.remove('active', 'done');
      if (i === n) indEl.classList.add('active');
      else if (i < n) indEl.classList.add('done');
    }
    if (i < 4) {
      const conn = document.getElementById(`conn-${i}`);
      if (conn) conn.classList.toggle('done', i < n);
    }
  }
  if (n === 4) renderBookingSummary();
  // Scroll to booking section
  document.getElementById('reservation')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- BOOKING SUMMARY ----
function renderBookingSummary() {
  const service = state.services.find(s => s.id === state.selectedService);
  const barber = state.selectedBarber === 'any' ? { name: 'Peu importe' } : state.barbers.find(b => b.id === state.selectedBarber);
  const el = document.getElementById('bookingSummary');
  if (!el) return;

  el.innerHTML = `
    <div class="summary-row"><span class="summary-label"><i class="fas fa-scissors"></i> Service</span><span class="summary-value">${service?.name || '—'} — ${service ? parseFloat(service.price).toFixed(2) + ' $' : ''}</span></div>
    <div class="summary-row"><span class="summary-label"><i class="fas fa-user"></i> Barbier</span><span class="summary-value">${barber?.name || '—'}</span></div>
    <div class="summary-row"><span class="summary-label"><i class="fas fa-calendar"></i> Date</span><span class="summary-value">${state.selectedDate ? formatDateFr(state.selectedDate) : '—'}</span></div>
    <div class="summary-row"><span class="summary-label"><i class="fas fa-clock"></i> Heure</span><span class="summary-value">${state.selectedTime || '—'}</span></div>
  `;
}

// ---- SUBMIT ----
async function submitBooking(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const service = state.services.find(s => s.id === state.selectedService);
  const barber = state.selectedBarber !== 'any' ? state.barbers.find(b => b.id === state.selectedBarber) : null;

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;display:inline-block"></div> Confirmation...';

  const body = {
    service_id: state.selectedService,
    barber_id: state.selectedBarber !== 'any' ? state.selectedBarber : null,
    date: state.selectedDate,
    time: state.selectedTime,
    client_name: document.getElementById('clientName').value,
    client_phone: document.getElementById('clientPhone').value,
    client_email: document.getElementById('clientEmail').value,
    notes: document.getElementById('clientNotes').value
  };

  try {
    const res = await fetch(`${API_BASE}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) {
      showConfirmation(data);
    } else {
      alert(data.error || 'Une erreur est survenue. Veuillez réessayer.');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check"></i> Confirmer le rendez-vous';
    }
  } catch (err) {
    alert('Erreur de connexion. Veuillez réessayer.');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> Confirmer le rendez-vous';
  }
}

function showConfirmation(data) {
  const wizard = document.getElementById('bookingWizard');
  const success = document.getElementById('successScreen');
  const section = document.getElementById('reservation');

  if (wizard) wizard.style.display = 'none';
  if (success) success.classList.remove('hidden');

  const service = state.services.find(s => s.id === state.selectedService);
  const barber = state.selectedBarber !== 'any' ? state.barbers.find(b => b.id === state.selectedBarber) : { name: 'Premier disponible' };

  const confirmSummary = document.getElementById('confirmSummary');
  if (confirmSummary) {
    confirmSummary.innerHTML = `
      <div class="summary-row"><span class="summary-label"><i class="fas fa-scissors"></i> Service</span><span class="summary-value">${service?.name || '—'}</span></div>
      <div class="summary-row"><span class="summary-label"><i class="fas fa-user"></i> Barbier</span><span class="summary-value">${barber?.name || '—'}</span></div>
      <div class="summary-row"><span class="summary-label"><i class="fas fa-calendar"></i> Date</span><span class="summary-value">${formatDateFr(state.selectedDate)}</span></div>
      <div class="summary-row"><span class="summary-label"><i class="fas fa-clock"></i> Heure</span><span class="summary-value">${state.selectedTime}</span></div>
    `;
  }

  const titleEl = document.getElementById('successTitle');
  const iconEl  = document.getElementById('successIcon');
  const msgEl   = document.getElementById('confirmationMsg');

  if (data.status === 'pending') {
    if (titleEl) titleEl.textContent = 'Demande envoyée !';
    if (iconEl)  iconEl.innerHTML = '<i class="fas fa-hourglass-half"></i>';
    if (msgEl)   msgEl.textContent = 'Votre demande a bien été reçue. Vous serez contacté pour confirmation.';
  } else {
    if (titleEl) titleEl.textContent = 'Rendez-vous confirmé !';
    if (iconEl)  iconEl.innerHTML = '<i class="fas fa-check"></i>';
    if (msgEl && data.message) msgEl.textContent = data.message;
  }

  section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetBooking() {
  state.selectedService = null;
  state.selectedBarber = null;
  state.selectedDate = null;
  state.selectedTime = null;
  state.currentYear = new Date().getFullYear();
  state.currentMonth = new Date().getMonth();

  const wizard = document.getElementById('bookingWizard');
  const success = document.getElementById('successScreen');
  if (wizard) wizard.style.display = '';
  if (success) success.classList.add('hidden');

  document.getElementById('bookingForm')?.reset();
  renderServiceOptions();
  renderBarberOptions();
  renderCalendar();
  const timeSlots = document.getElementById('timeSlots');
  if (timeSlots) timeSlots.innerHTML = '';
  const label = document.getElementById('selectedDateLabel');
  if (label) label.textContent = 'Sélectionnez une date';

  goToStep(1);

  const btn1 = document.getElementById('btn-step1-next');
  if (btn1) btn1.disabled = true;
  const btn2 = document.getElementById('btn-step2-next');
  if (btn2) btn2.disabled = true;
  const btn3 = document.getElementById('btn-step3-next');
  if (btn3) btn3.disabled = true;
}

// ---- UTILS ----
function formatDateFr(str) {
  if (!str) return '';
  const [year, month, day] = str.split('-');
  const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const days = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return `${days[d.getDay()]} ${parseInt(day)} ${months[parseInt(month) - 1]} ${year}`;
}
