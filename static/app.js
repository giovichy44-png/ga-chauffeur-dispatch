/**
 * GA CHAUFFEUR SERVICES LIMITED - DISPATCH OS & MOBILE APP ENGINE
 * Website: gachauffeurs.co.uk
 * Real-time Dispatch Control, Chauffeur Allocation, Live Telemetry & Mobile Handset Simulation
 */

// Application State
const State = {
  bookings: [],
  chauffeurs: [],
  confirmations: [],
  actions: [],
  stats: {},
  activeTab: 'radar',
  selectedTerminalChauffeurId: null,
  activeBookingFilter: 'ALL',
  allocatingBookingId: null,
  soundEnabled: true,
  map: null,
  markers: {
    chauffeurs: {},
    pickups: {},
    dropoffs: {},
    routes: {}
  }
};

// Web Audio API Synthesizer for Luxury Haptic Chimes
class SoundFX {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }
  playNotification() {
    if (!State.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, this.ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.4);
    } catch (e) {}
  }
  playActionSuccess() {
    if (!State.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(659.25, this.ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.35);
    } catch (e) {}
  }
}
const sfx = new SoundFX();

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initNavigation();
  initMap();
  initFormControls();
  initModals();
  setupSSE();
  fetchAllData();
  registerPWA();

  // Periodic polling safety net (every 4.5s)
  setInterval(() => {
    fetchStats();
    fetchChauffeurs(false);
    fetchBookings(false);
  }, 4500);
});

// PWA Service Worker Registration
function registerPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.log('SW registration note:', err);
    });
  }
}

// Clock Updater
function initClock() {
  const clockEl = document.getElementById('clock-display');
  const phoneClockEl = document.getElementById('phone-clock');
  function update() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-GB', { hour12: false });
    if (clockEl) clockEl.textContent = `${timeStr} GMT`;
    if (phoneClockEl) phoneClockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  update();
  setInterval(update, 1000);
}

// Navigation Tabs (Desktop Tabs & Mobile Bottom Bar)
function initNavigation() {
  const desktopBtns = document.querySelectorAll('.tab-btn');
  desktopBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  const mobileBtns = document.querySelectorAll('.mobile-nav-btn');
  mobileBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  // Sound toggle button
  const soundBtn = document.getElementById('btn-sound-toggle');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      State.soundEnabled = !State.soundEnabled;
      soundBtn.style.opacity = State.soundEnabled ? '1' : '0.4';
      showToast(State.soundEnabled ? 'Audio alerts enabled' : 'Audio alerts muted', 'info');
    });
  }

  // System Reset button
  const resetBtn = document.getElementById('btn-system-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (confirm('Reset GA Chauffeurs database to pristine demo baseline?')) {
        await fetch('/api/reset', { method: 'POST' });
        showToast('System reset to baseline', 'success');
        fetchAllData();
      }
    });
  }

  // Mobile App Instructions button
  const mobileAppBtn = document.getElementById('btn-mobile-app-info');
  if (mobileAppBtn) {
    mobileAppBtn.addEventListener('click', () => {
      document.getElementById('modal-mobile-app').style.display = 'flex';
    });
  }

  // Quick booking button
  const quickBookingBtn = document.getElementById('btn-quick-booking');
  if (quickBookingBtn) {
    quickBookingBtn.addEventListener('click', () => switchTab('new-booking'));
  }
  const createBookingShortcut = document.getElementById('btn-create-booking-shortcut');
  if (createBookingShortcut) {
    createBookingShortcut.addEventListener('click', () => switchTab('new-booking'));
  }
}

function switchTab(tabId) {
  State.activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `pane-${tabId}`);
  });

  if (tabId === 'radar' && State.map) {
    setTimeout(() => State.map.invalidateSize(), 150);
  }
  if (tabId === 'terminal') {
    renderTerminalScreen();
  }
}

// Initialize Leaflet Map (Centered on London Metropolitan Area)
function initMap() {
  const mapEl = document.getElementById('dispatch-map');
  if (!mapEl) return;

  try {
    // Default centered on London / Heathrow Corridor
    State.map = L.map('dispatch-map', {
      zoomControl: false,
      attributionControl: false
    }).setView([51.5074, -0.1278], 11);

    L.control.zoom({ position: 'bottomright' }).addTo(State.map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(State.map);
  } catch (err) {
    console.warn('Map initialization note:', err);
  }
}

// Server-Sent Events (SSE) for Real-Time Live Sync
function setupSSE() {
  if (!window.EventSource) return;

  const evtSource = new EventSource('/api/events');

  evtSource.addEventListener('booking_created', (e) => {
    const data = JSON.parse(e.data);
    sfx.playNotification();
    showToast(`New Job Received: ${data.confirmation_code} (Email sent)`, 'info');
    fetchAllData();
  });

  evtSource.addEventListener('chauffeur_allocated', (e) => {
    const data = JSON.parse(e.data);
    sfx.playActionSuccess();
    showToast(`Chauffeur ${data.chauffeur_name} Allocated!`, 'success');
    fetchAllData();
  });

  evtSource.addEventListener('live_action_executed', (e) => {
    const data = JSON.parse(e.data);
    sfx.playActionSuccess();
    showToast(`Live Action: ${data.action} - ${data.details}`, 'info');
    fetchAllData();
  });

  evtSource.addEventListener('telemetry_update', (e) => {
    const data = JSON.parse(e.data);
    updateVehiclePositions(data.moved);
  });

  evtSource.addEventListener('system_reset', () => {
    fetchAllData();
  });

  evtSource.onerror = () => {
    // Reconnects automatically
  };
}

// Fetch Core Data
async function fetchAllData() {
  await Promise.all([
    fetchStats(),
    fetchBookings(),
    fetchChauffeurs(),
    fetchConfirmations(),
    fetchActions()
  ]);
  updateMapMarkers();
  renderTerminalScreen();
}

async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    State.stats = data;

    const activeEl = document.getElementById('kpi-active-trips');
    const availEl = document.getElementById('kpi-available-fleet');
    const confEl = document.getElementById('kpi-confirmations');

    if (activeEl) activeEl.textContent = data.bookings.active || 0;
    if (availEl) availEl.textContent = data.chauffeurs.available || 0;
    if (confEl) confEl.textContent = data.confirmations_dispatched || 0;

    const bCountBadge = document.getElementById('badge-bookings-count');
    if (bCountBadge) bCountBadge.textContent = data.bookings.total || 0;

    const mobileJobsBadge = document.getElementById('mobile-badge-jobs');
    if (mobileJobsBadge) mobileJobsBadge.textContent = data.bookings.active || 0;

    const cCountBadge = document.getElementById('badge-confirmations-count');
    if (cCountBadge) cCountBadge.textContent = data.confirmations_dispatched || 0;

    const fStatTotal = document.getElementById('fleet-stat-total');
    const fStatAvail = document.getElementById('fleet-stat-avail');
    const fStatTrip = document.getElementById('fleet-stat-trip');
    if (fStatTotal) fStatTotal.textContent = data.chauffeurs.total || 0;
    if (fStatAvail) fStatAvail.textContent = data.chauffeurs.available || 0;
    if (fStatTrip) fStatTrip.textContent = data.chauffeurs.on_trip || 0;
  } catch (err) {}
}

async function fetchBookings(render = true) {
  try {
    const res = await fetch(`/api/bookings?status=${State.activeBookingFilter}`);
    const data = await res.json();
    State.bookings = data.bookings || [];
    if (render) {
      renderBookingsGrid();
      renderUnallocatedSidebar();
    }
  } catch (err) {}
}

async function fetchChauffeurs(render = true) {
  try {
    const res = await fetch('/api/chauffeurs');
    const data = await res.json();
    State.chauffeurs = data.chauffeurs || [];

    const select = document.getElementById('terminal-chauffeur-select');
    if (select && select.children.length === 0 && State.chauffeurs.length > 0) {
      State.chauffeurs.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name} — ${c.vehicle_model} (${c.license_plate}) [${c.status}]`;
        select.appendChild(opt);
      });
      State.selectedTerminalChauffeurId = State.chauffeurs[0].id;
      select.addEventListener('change', (e) => {
        State.selectedTerminalChauffeurId = e.target.value;
        renderTerminalScreen();
      });
    }

    if (render) renderFleetGrid();
  } catch (err) {}
}

async function fetchConfirmations() {
  try {
    const res = await fetch('/api/confirmations');
    const data = await res.json();
    State.confirmations = data.confirmations || [];
    renderConfirmationsTable();
  } catch (err) {}
}

async function fetchActions() {
  try {
    const res = await fetch('/api/actions');
    const data = await res.json();
    State.actions = data.actions || [];
    renderLiveActionFeed();
  } catch (err) {}
}

// Map Markers & Geometry Management
function updateMapMarkers() {
  if (!State.map) return;

  Object.values(State.markers.chauffeurs).forEach(m => State.map.removeLayer(m));
  Object.values(State.markers.pickups).forEach(m => State.map.removeLayer(m));
  Object.values(State.markers.dropoffs).forEach(m => State.map.removeLayer(m));
  Object.values(State.markers.routes).forEach(m => State.map.removeLayer(m));

  State.markers.chauffeurs = {};
  State.markers.pickups = {};
  State.markers.dropoffs = {};
  State.markers.routes = {};

  State.chauffeurs.forEach(ch => {
    const isBusy = ch.status === 'ON_TRIP';
    const iconColor = isBusy ? '#00d2ff' : '#d4af37';

    const customIcon = L.divIcon({
      className: 'chauffeur-map-marker',
      html: `
        <div style="background: #0f141d; border: 2px solid ${iconColor}; color: ${iconColor}; border-radius: 8px; padding: 3px 7px; font-size: 11px; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.6); display: flex; align-items: center; gap: 4px; white-space: nowrap;">
          <span style="width: 7px; height: 7px; border-radius: 50%; background: ${iconColor};"></span>
          ${ch.name.split(' ')[0]} [${ch.license_plate}]
        </div>
      `,
      iconSize: [120, 24],
      iconAnchor: [60, 12]
    });

    const marker = L.marker([ch.lat, ch.lng], { icon: customIcon }).addTo(State.map);
    marker.bindPopup(`
      <div style="color: #000; font-family: sans-serif; font-size: 12px; padding: 4px;">
        <strong style="font-size: 13px;">${ch.name}</strong> (${ch.rating}★)<br>
        <span>Vehicle: ${ch.vehicle_model}</span><br>
        <span>Registration: ${ch.license_plate}</span><br>
        <span>Status: <strong>${ch.status}</strong></span>
      </div>
    `);
    State.markers.chauffeurs[ch.id] = marker;
  });

  State.bookings.forEach(b => {
    if (b.status !== 'COMPLETED' && b.status !== 'CANCELLED') {
      const pickupIcon = L.divIcon({
        className: 'pickup-map-marker',
        html: `
          <div style="background: #d4af37; color: #000; font-size: 10px; font-weight: 800; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px #d4af37; border: 2px solid #fff;">
            P
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });

      const pMarker = L.marker([b.pickup_lat, b.pickup_lng], { icon: pickupIcon }).addTo(State.map);
      pMarker.bindPopup(`
        <div style="color: #000; font-family: sans-serif; font-size: 12px;">
          <strong>Job: ${b.confirmation_code}</strong><br>
          ${b.customer_name}<br>
          ${b.pickup_address}
        </div>
      `);
      pMarker.on('click', () => selectTripOnMap(b));
      State.markers.pickups[b.id] = pMarker;

      const dropoffIcon = L.divIcon({
        className: 'dropoff-map-marker',
        html: `
          <div style="background: #00d2ff; color: #000; font-size: 10px; font-weight: 800; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px #00d2ff; border: 2px solid #fff;">
            D
          </div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });

      const dMarker = L.marker([b.dropoff_lat, b.dropoff_lng], { icon: dropoffIcon }).addTo(State.map);
      State.markers.dropoffs[b.id] = dMarker;

      const routeLine = L.polyline([
        [b.pickup_lat, b.pickup_lng],
        [b.dropoff_lat, b.dropoff_lng]
      ], {
        color: '#d4af37',
        weight: 2.5,
        opacity: 0.6,
        dashArray: '5, 8'
      }).addTo(State.map);

      State.markers.routes[b.id] = routeLine;
    }
  });
}

function updateVehiclePositions(movedList) {
  if (!movedList || !State.map) return;
  movedList.forEach(item => {
    const marker = State.markers.chauffeurs[item.chauffeur_id];
    if (marker) {
      marker.setLatLng([item.lat, item.lng]);
    }
  });
}

function selectTripOnMap(booking) {
  const bar = document.getElementById('map-trip-bar');
  if (!bar) return;

  bar.style.display = 'flex';
  document.getElementById('map-bar-status').textContent = booking.status;
  document.getElementById('map-bar-status').className = `badge badge-${booking.status.toLowerCase()}`;
  document.getElementById('map-bar-code').textContent = booking.confirmation_code;
  document.getElementById('map-bar-route').textContent = `${booking.customer_name} • ${booking.pickup_address} → ${booking.dropoff_address}`;
  document.getElementById('map-bar-driver').textContent = booking.chauffeur_name ? `Chauffeur: ${booking.chauffeur_name}` : 'Unallocated';

  const actionsEl = document.getElementById('map-bar-actions');
  actionsEl.innerHTML = '';

  if (!booking.chauffeur_id) {
    const allocBtn = document.createElement('button');
    allocBtn.className = 'btn btn-gold';
    allocBtn.textContent = 'Allocate Chauffeur';
    allocBtn.onclick = () => openAllocateModal(booking.id);
    actionsEl.appendChild(allocBtn);
  } else {
    const voucherBtn = document.createElement('button');
    voucherBtn.className = 'btn btn-secondary';
    voucherBtn.textContent = 'View Voucher';
    voucherBtn.onclick = () => showVoucherModal(booking.id);
    actionsEl.appendChild(voucherBtn);
  }
}

// Render Unallocated Bookings in Sidebar
function renderUnallocatedSidebar() {
  const container = document.getElementById('unallocated-list');
  const countBadge = document.getElementById('count-unallocated');
  if (!container) return;

  const unallocated = State.bookings.filter(b => !b.chauffeur_id && b.status !== 'CANCELLED');
  if (countBadge) countBadge.textContent = unallocated.length;

  if (unallocated.length === 0) {
    container.innerHTML = '<div class="empty-state" style="color: #64748b; font-size: 12px; text-align: center; padding: 20px;">All active bookings have been allocated to chauffeurs.</div>';
    return;
  }

  container.innerHTML = unallocated.map(b => `
    <div class="unallocated-card">
      <div class="card-top">
        <span class="unalloc-name">${escapeHtml(b.customer_name)}</span>
        <span class="badge badge-pending">${escapeHtml(b.confirmation_code)}</span>
      </div>
      <div class="unalloc-route">
        <strong>From:</strong> ${escapeHtml(b.pickup_address)}<br>
        <strong>To:</strong> ${escapeHtml(b.dropoff_address)}
      </div>
      <div class="unalloc-btn-row">
        <button class="btn btn-action" onclick="openAllocateModal('${b.id}')">
          Allocate Chauffeur &rarr;
        </button>
      </div>
    </div>
  `).join('');
}

// Render Bookings Board Grid
function renderBookingsGrid() {
  const grid = document.getElementById('bookings-grid');
  if (!grid) return;

  const query = (document.getElementById('booking-search-input')?.value || '').toLowerCase();
  const filtered = State.bookings.filter(b => {
    if (!query) return true;
    return b.customer_name.toLowerCase().includes(query) ||
           b.confirmation_code.toLowerCase().includes(query) ||
           b.pickup_address.toLowerCase().includes(query) ||
           b.dropoff_address.toLowerCase().includes(query) ||
           (b.flight_number && b.flight_number.toLowerCase().includes(query));
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 50px; color: #8892b0;">No bookings matching this criteria.</div>';
    return;
  }

  grid.innerHTML = filtered.map(b => {
    const statusClass = b.status.toLowerCase();
    const isWebsite = b.source === 'WEBSITE_GACHAUFFEURS';

    return `
      <div class="booking-card status-${statusClass}">
        <div class="card-header-row">
          <div>
            <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 2px;">
              <span class="gold-badge">${escapeHtml(b.vip_level || 'Executive')}</span>
              ${isWebsite ? '<span class="badge badge-confirmed" style="font-size: 9px;">WEBSITE BOOKING</span>' : ''}
            </div>
            <div class="passenger-name">${escapeHtml(b.customer_name)}</div>
            <div class="passenger-meta">
              <span>${escapeHtml(b.customer_phone)}</span>
              <span>•</span>
              <span>${b.passenger_count} Pax, ${b.luggage_count} Bags</span>
            </div>
          </div>
          <div style="text-align: right;">
            <div class="booking-ref-title">${b.confirmation_code}</div>
            <span class="badge badge-${statusClass}">${b.status.replace('_', ' ')}</span>
          </div>
        </div>

        <div class="card-route">
          <div class="route-step">
            <span class="route-dot pickup"></span>
            <div class="route-text">
              <strong>PICKUP — ${escapeHtml(b.pickup_datetime)}</strong>
              <span>${escapeHtml(b.pickup_address)}</span>
            </div>
          </div>
          <div class="route-step">
            <span class="route-dot dropoff"></span>
            <div class="route-text">
              <strong>DESTINATION (~${b.estimated_distance_mi} mi / ${b.estimated_duration_min} min)</strong>
              <span>${escapeHtml(b.dropoff_address)}</span>
            </div>
          </div>
        </div>

        ${b.flight_number ? `
          <div class="card-flight-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z"/></svg>
            Flight: <strong>${escapeHtml(b.flight_number)}</strong> — ${escapeHtml(b.flight_status || 'Flight Tracking Active')}
          </div>
        ` : ''}

        ${b.chauffeur_id ? `
          <div class="card-chauffeur-block">
            <div class="chauffeur-info">
              <div class="ch-avatar">${escapeHtml(b.chauffeur_name.slice(0, 2).toUpperCase())}</div>
              <div class="ch-details">
                <strong>${escapeHtml(b.chauffeur_name)}</strong>
                <span>${escapeHtml(b.vehicle_model)} [${escapeHtml(b.license_plate)}]</span>
              </div>
            </div>
            <button class="btn btn-action" onclick="switchChauffeurSimulator('${b.chauffeur_id}')" title="Test Live Actions in Mobile Simulator">
              Driver App
            </button>
          </div>
        ` : `
          <div class="card-chauffeur-block" style="border: 1px dashed rgba(212,175,55,0.4); background: rgba(212,175,55,0.03);">
            <div class="chauffeur-info">
              <span style="font-size: 12px; color: #d4af37;">No chauffeur allocated yet</span>
            </div>
            <button class="btn btn-gold" onclick="openAllocateModal('${b.id}')">
              Allocate Chauffeur
            </button>
          </div>
        `}

        <div class="card-footer">
          <div>
            <span style="font-size: 10px; color: var(--gold-primary); display: block; letter-spacing: 1px;">ALL-INCLUSIVE FARE</span>
            <div class="fare-amount">£${parseFloat(b.fare_amount).toFixed(2)} GBP</div>
          </div>
          <div class="card-actions">
            <button class="btn btn-secondary" onclick="showVoucherModal('${b.id}')">Voucher</button>
            ${b.chauffeur_id ? `
              <button class="btn btn-action" onclick="openAllocateModal('${b.id}')">Reallocate</button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Render Live Action Feed
function renderLiveActionFeed() {
  const container = document.getElementById('live-action-feed');
  if (!container) return;

  if (State.actions.length === 0) {
    container.innerHTML = '<div style="color: #64748b; font-size: 12px; padding: 10px;">Waiting for live activity...</div>';
    return;
  }

  container.innerHTML = State.actions.map(act => {
    let typeClass = '';
    if (act.action.includes('EN_ROUTE') || act.action.includes('ARRIVED') || act.action.includes('ON_BOARD')) {
      typeClass = 'feed-driver';
    } else if (act.action.includes('COMPLETED')) {
      typeClass = 'feed-completed';
    }

    return `
      <div class="feed-item ${typeClass}">
        <div class="feed-meta">
          <span class="feed-actor">${escapeHtml(act.actor)}</span>
          <span>${escapeHtml(act.timestamp.split(' ')[1] || act.timestamp)}</span>
        </div>
        <div class="feed-text">${escapeHtml(act.details)}</div>
      </div>
    `;
  }).join('');
}

// Render Fleet Grid
function renderFleetGrid() {
  const grid = document.getElementById('fleet-grid');
  if (!grid) return;

  grid.innerHTML = State.chauffeurs.map(ch => {
    const isAvail = ch.status === 'AVAILABLE';
    return `
      <div class="chauffeur-fleet-card">
        <div class="fleet-card-top">
          <div class="fleet-driver-info">
            <div class="fleet-avatar">${escapeHtml(ch.avatar || ch.name.slice(0, 2).toUpperCase())}</div>
            <div>
              <div class="fleet-driver-name">${escapeHtml(ch.name)}</div>
              <div class="fleet-rating">${ch.rating} ★ (${ch.trips_count} trips completed)</div>
            </div>
          </div>
          <span class="badge ${isAvail ? 'badge-completed' : 'badge-en_route'}">${ch.status}</span>
        </div>

        <div class="fleet-vehicle-box">
          <div class="fleet-vehicle-model">${escapeHtml(ch.vehicle_model)}</div>
          <div class="fleet-vehicle-plate">Reg: ${escapeHtml(ch.license_plate)} • Zone: ${escapeHtml(ch.current_zone)}</div>
        </div>

        <div class="fleet-card-status-row">
          <span style="color: var(--text-muted);">${escapeHtml(ch.phone)}</span>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-secondary btn-action" onclick="toggleChauffeurAvailability('${ch.id}', '${isAvail ? 'ON_BREAK' : 'AVAILABLE'}')">
              ${isAvail ? 'Set Break' : 'Set Available'}
            </button>
            <button class="btn btn-action" onclick="switchChauffeurSimulator('${ch.id}')">
              Open Handset
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Render Confirmations Outbox
function renderConfirmationsTable() {
  const tbody = document.getElementById('confirmations-table-body');
  if (!tbody) return;

  if (State.confirmations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 30px; color: #64748b;">No confirmations dispatched yet.</td></tr>';
    return;
  }

  tbody.innerHTML = State.confirmations.map(cnf => `
    <tr>
      <td><span class="badge badge-completed">${cnf.status}</span></td>
      <td><span class="channel-tag ${cnf.channel.toLowerCase()}">${cnf.channel}</span></td>
      <td><strong>${escapeHtml(cnf.recipient)}</strong></td>
      <td><span style="font-family: var(--font-mono); color: var(--gold-light);">${escapeHtml(cnf.confirmation_code || '-')}</span></td>
      <td style="max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(cnf.content)}">
        <strong>${escapeHtml(cnf.subject)}</strong> — ${escapeHtml(cnf.content.slice(0, 75))}...
      </td>
      <td style="font-size: 11px; color: var(--text-dim);">${escapeHtml(cnf.sent_at)}</td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px;" onclick="resendConfirmation('${cnf.id}')">
            Resend
          </button>
          <button class="btn btn-action" style="font-size: 11px; padding: 4px 8px;" onclick="showVoucherModal('${cnf.booking_id}')">
            Voucher
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

// CHAUFFEUR MOBILE HANDSET SIMULATOR
function switchChauffeurSimulator(chauffeurId) {
  State.selectedTerminalChauffeurId = chauffeurId;
  const select = document.getElementById('terminal-chauffeur-select');
  if (select) select.value = chauffeurId;
  switchTab('terminal');
  renderTerminalScreen();
}

function renderTerminalScreen() {
  const container = document.getElementById('phone-app-body');
  if (!container) return;

  const chauffeur = State.chauffeurs.find(c => c.id === State.selectedTerminalChauffeurId) || State.chauffeurs[0];
  if (!chauffeur) return;

  const nameEl = document.getElementById('phone-driver-name');
  const vehicleEl = document.getElementById('phone-driver-vehicle');
  const avatarEl = document.getElementById('phone-driver-avatar');
  const ratingEl = document.getElementById('phone-driver-rating');

  if (nameEl) nameEl.textContent = chauffeur.name;
  if (vehicleEl) vehicleEl.textContent = `${chauffeur.vehicle_model} [${chauffeur.license_plate}]`;
  if (avatarEl) avatarEl.textContent = chauffeur.avatar || chauffeur.name.slice(0, 2).toUpperCase();
  if (ratingEl) ratingEl.textContent = `${chauffeur.rating} ★`;

  const activeBooking = State.bookings.find(b => b.chauffeur_id === chauffeur.id && b.status !== 'COMPLETED' && b.status !== 'CANCELLED');

  if (!activeBooking) {
    container.innerHTML = `
      <div class="phone-idle-state">
        <div class="phone-radar-circle">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="2" x2="12" y2="12"/><line x1="12" y1="12" x2="19" y2="19"/></svg>
        </div>
        <strong style="color: #fff; font-size: 15px;">Standby for Dispatch</strong>
        <p style="font-size: 12px; line-height: 1.4;">GPS telemetry connected to GA London Dispatch Control. Ready for VIP passenger allocation.</p>
        <span class="badge badge-completed">AVAILABLE IN ${escapeHtml(chauffeur.current_zone)}</span>
      </div>
    `;
    return;
  }

  const b = activeBooking;
  let actionButtonsHtml = '';

  if (b.status === 'ASSIGNED') {
    actionButtonsHtml = `
      <button class="btn-phone-action btn-phone-accept" onclick="executeDriverAction('${b.id}', 'ACCEPT')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Accept Job Assignment
      </button>
    `;
  } else if (b.status === 'ACCEPTED') {
    actionButtonsHtml = `
      <button class="btn-phone-action btn-phone-en-route" onclick="executeDriverAction('${b.id}', 'EN_ROUTE_PICKUP')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
        Start GPS Navigation &rarr; En Route to Pickup
      </button>
    `;
  } else if (b.status === 'EN_ROUTE') {
    actionButtonsHtml = `
      <button class="btn-phone-action btn-phone-arrived" onclick="executeDriverAction('${b.id}', 'ARRIVED')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
        Arrived at Pickup (Display Nameboard)
      </button>
    `;
  } else if (b.status === 'ARRIVED') {
    actionButtonsHtml = `
      <button class="btn-phone-action btn-phone-on-board" onclick="executeDriverAction('${b.id}', 'ON_BOARD')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
        Passenger Boarded &rarr; Start Journey
      </button>
    `;
  } else if (b.status === 'ON_BOARD') {
    actionButtonsHtml = `
      <button class="btn-phone-action btn-phone-complete" onclick="executeDriverAction('${b.id}', 'COMPLETED')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Complete Journey &amp; Issue Receipt
      </button>
    `;
  }

  container.innerHTML = `
    <div class="phone-trip-card">
      <div class="phone-badge-row">
        <span class="gold-badge">${escapeHtml(b.vip_level || 'VIP')} GUEST</span>
        <span class="badge badge-${b.status.toLowerCase()}">${b.status.replace('_', ' ')}</span>
      </div>

      <div class="phone-passenger-name">${escapeHtml(b.customer_name)}</div>
      <div style="font-size: 12px; color: var(--gold-light);">Ref: ${escapeHtml(b.confirmation_code)} • £${parseFloat(b.fare_amount).toFixed(2)} GBP</div>

      <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 10px; font-size: 11px; line-height: 1.4;">
        <div style="color: var(--gold-primary); font-weight: 700;">PICKUP:</div>
        <div style="color: #fff; margin-bottom: 6px;">${escapeHtml(b.pickup_address)}</div>
        <div style="color: var(--status-en-route); font-weight: 700;">DESTINATION:</div>
        <div style="color: #fff;">${escapeHtml(b.dropoff_address)}</div>
      </div>

      ${b.special_requests ? `
        <div style="background: rgba(212,175,55,0.08); border-left: 2px solid var(--gold-primary); padding: 8px 10px; font-size: 11px; color: var(--gold-light);">
          <strong>VIP Notes:</strong> ${escapeHtml(b.special_requests)}
        </div>
      ` : ''}

      <div class="phone-action-btn-group">
        ${actionButtonsHtml}
      </div>
    </div>
  `;
}

// Execute Live Driver Actions
async function executeDriverAction(bookingId, action) {
  try {
    const res = await fetch(`/api/bookings/${bookingId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, actor: 'Chauffeur Handset' })
    });
    const data = await res.json();
    if (data.success) {
      sfx.playActionSuccess();
      showToast(`Action "${action}" Executed Successfully!`, 'success');
      await fetchAllData();
      renderTerminalScreen();
    } else {
      showToast(data.error || 'Failed to execute action', 'error');
    }
  } catch (err) {
    showToast('Network error executing live action', 'error');
  }
}

// ALLOCATION MODAL LOGIC
function openAllocateModal(bookingId) {
  State.allocatingBookingId = bookingId;
  const booking = State.bookings.find(b => b.id === bookingId);
  if (!booking) return;

  const modal = document.getElementById('modal-allocate');
  const summaryEl = document.getElementById('modal-booking-summary');
  const listEl = document.getElementById('modal-chauffeur-list');

  summaryEl.innerHTML = `
    <div><strong>Booking:</strong> ${booking.confirmation_code} (${booking.customer_name})</div>
    <div><strong>Required Tier:</strong> ${booking.vehicle_class.replace('_', ' ').toUpperCase()} (${booking.passenger_count} Pax)</div>
    <div><strong>Pickup:</strong> ${booking.pickup_address}</div>
  `;

  listEl.innerHTML = State.chauffeurs.map(ch => {
    const isAvail = ch.status === 'AVAILABLE';
    return `
      <div class="chauffeur-pick-item" onclick="allocateChauffeur('${booking.id}', '${ch.id}')" style="${!isAvail ? 'opacity: 0.5;' : ''}">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="ch-avatar">${escapeHtml(ch.avatar || ch.name.slice(0, 2).toUpperCase())}</div>
          <div>
            <strong style="color: #fff; font-size: 13px;">${escapeHtml(ch.name)}</strong>
            <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(ch.vehicle_model)} [${escapeHtml(ch.license_plate)}]</div>
          </div>
        </div>
        <div style="text-align: right;">
          <span class="badge ${isAvail ? 'badge-completed' : 'badge-warning'}">${ch.status}</span>
          <div style="font-size: 11px; color: var(--gold-light); margin-top: 2px;">${ch.rating} ★</div>
        </div>
      </div>
    `;
  }).join('');

  modal.style.display = 'flex';
}

async function allocateChauffeur(bookingId, chauffeurId) {
  try {
    const res = await fetch(`/api/bookings/${bookingId}/allocate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chauffeur_id: chauffeurId })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('modal-allocate').style.display = 'none';
      sfx.playActionSuccess();
      showToast(`Chauffeur ${data.chauffeur.name} Allocated & Confirmed!`, 'success');
      await fetchAllData();
      switchChauffeurSimulator(data.chauffeur.id);
    } else {
      showToast(data.error || 'Failed to allocate', 'error');
    }
  } catch (err) {
    showToast('Allocation network error', 'error');
  }
}

// INTAKE FORM & INSTANT FARE PREVIEW
function initFormControls() {
  const form = document.getElementById('booking-intake-form');
  const classSelect = document.getElementById('intake-vehicle-class');
  const pickupInput = document.getElementById('intake-pickup');
  const dropoffInput = document.getElementById('intake-dropoff');
  const dtInput = document.getElementById('intake-datetime');

  if (dtInput) {
    const d = new Date(Date.now() + 45 * 60000);
    dtInput.value = d.toISOString().slice(0, 16);
  }

  document.querySelectorAll('.chip[data-pickup]').forEach(chip => {
    chip.addEventListener('click', () => {
      if (pickupInput) {
        pickupInput.value = chip.getAttribute('data-pickup');
        updateFareEstimate();
      }
    });
  });

  document.querySelectorAll('.chip[data-dropoff]').forEach(chip => {
    chip.addEventListener('click', () => {
      if (dropoffInput) {
        dropoffInput.value = chip.getAttribute('data-dropoff');
        updateFareEstimate();
      }
    });
  });

  if (classSelect) classSelect.addEventListener('change', updateFareEstimate);
  if (pickupInput) pickupInput.addEventListener('input', updateFareEstimate);
  if (dropoffInput) dropoffInput.addEventListener('input', updateFareEstimate);

  function updateFareEstimate() {
    const vClass = classSelect ? classSelect.value : 'mercedes_s_class';
    const rates = {
      mercedes_s_class: { base: 75, per_mile: 3.4, min: 135, name: 'Mercedes-Benz S-Class Saloon' },
      mercedes_v_class: { base: 85, per_mile: 3.8, min: 150, name: 'Mercedes-Benz V-Class MPV (7-Seater)' },
      range_rover_autobiography: { base: 95, per_mile: 4.2, min: 175, name: 'Range Rover Autobiography LWB' },
      // Compatibility aliases
      first_class: { base: 75, per_mile: 3.4, min: 135, name: 'Mercedes-Benz S-Class Saloon' },
      executive_suv: { base: 95, per_mile: 4.2, min: 175, name: 'Range Rover Autobiography LWB' },
      luxury_van: { base: 85, per_mile: 3.8, min: 150, name: 'Mercedes-Benz V-Class MPV (7-Seater)' }
    };
    const cfg = rates[vClass] || rates.mercedes_s_class;
    const estDist = 18.5;
    const fare = Math.max(cfg.base + (estDist * cfg.per_mile), cfg.min);

    const fareEl = document.getElementById('preview-fare');
    const tierEl = document.getElementById('preview-tier');
    if (fareEl) fareEl.textContent = `£${fare.toFixed(2)} GBP`;
    if (tierEl) tierEl.textContent = cfg.name;
  }
  updateFareEstimate();

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        customer_name: document.getElementById('intake-name').value,
        customer_phone: document.getElementById('intake-phone').value,
        customer_email: document.getElementById('intake-email').value,
        vip_level: document.getElementById('intake-vip').value,
        passenger_count: parseInt(document.getElementById('intake-passengers').value || 1),
        luggage_count: parseInt(document.getElementById('intake-luggage').value || 2),
        pickup_address: pickupInput.value,
        dropoff_address: dropoffInput.value,
        pickup_datetime: dtInput.value.replace('T', ' '),
        flight_number: document.getElementById('intake-flight').value || null,
        vehicle_class: classSelect.value,
        special_requests: document.getElementById('intake-requests').value || '',
        source: 'DISPATCH_PORTAL'
      };

      try {
        const res = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          sfx.playNotification();
          showToast(`Job ${data.booking.confirmation_code} created! Confirmation email dispatched.`, 'success');
          form.reset();
          await fetchAllData();
          showVoucherModal(data.booking.id);
        } else {
          showToast(data.error || 'Failed to submit booking', 'error');
        }
      } catch (err) {
        showToast('Error sending booking intake request', 'error');
      }
    });
  }

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.activeBookingFilter = btn.getAttribute('data-filter');
      fetchBookings();
    });
  });

  const searchInput = document.getElementById('booking-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderBookingsGrid());
  }

  const autoAllocBtn = document.getElementById('btn-run-auto-allocate');
  if (autoAllocBtn) {
    autoAllocBtn.addEventListener('click', () => {
      if (State.allocatingBookingId) {
        allocateChauffeur(State.allocatingBookingId, 'auto');
      }
    });
  }
}

// Modal Handlers
function initModals() {
  const allocClose = document.getElementById('modal-allocate-close');
  if (allocClose) allocClose.onclick = () => document.getElementById('modal-allocate').style.display = 'none';

  const voucherClose = document.getElementById('modal-voucher-close');
  if (voucherClose) voucherClose.onclick = () => document.getElementById('modal-voucher').style.display = 'none';

  const voucherCloseBtn = document.getElementById('modal-voucher-close-btn');
  if (voucherCloseBtn) voucherCloseBtn.onclick = () => document.getElementById('modal-voucher').style.display = 'none';

  const mobileAppClose = document.getElementById('modal-mobile-app-close');
  if (mobileAppClose) mobileAppClose.onclick = () => document.getElementById('modal-mobile-app').style.display = 'none';

  const mobileAppGotIt = document.getElementById('btn-mobile-app-gotit');
  if (mobileAppGotIt) mobileAppGotIt.onclick = () => document.getElementById('modal-mobile-app').style.display = 'none';
}

// DIGITAL VOUCHER MODAL
async function showVoucherModal(bookingId) {
  try {
    const res = await fetch(`/api/bookings/${bookingId}`);
    const data = await res.json();
    if (!data.booking) return;

    const b = data.booking;
    const contentEl = document.getElementById('voucher-content');
    if (!contentEl) return;

    contentEl.innerHTML = `
      <div class="voucher-sheet">
        <div class="voucher-header">
          <div>
            <div class="gold-badge">GA CHAUFFEUR SERVICES LIMITED</div>
            <div class="voucher-ref">${escapeHtml(b.confirmation_code)}</div>
            <span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(b.vip_level || 'VIP')} Service Tier • gachauffeurs.co.uk</span>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 12px; color: var(--gold-light);">FARE PAID</div>
            <div style="font-family: var(--font-mono); font-size: 22px; font-weight: 700; color: #fff;">£${parseFloat(b.fare_amount).toFixed(2)} GBP</div>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); padding: 10px 14px; border-radius: 6px; flex-wrap: wrap; gap: 10px;">
          <div>
            <span style="font-size: 10px; color: var(--text-dim); display: block;">PASSENGER</span>
            <strong style="color: #fff; font-size: 15px;">${escapeHtml(b.customer_name)}</strong>
          </div>
          <div>
            <span style="font-size: 10px; color: var(--text-dim); display: block;">CONTACT</span>
            <span style="color: var(--text-main); font-size: 12px;">${escapeHtml(b.customer_phone)}</span>
          </div>
          <div>
            <span style="font-size: 10px; color: var(--text-dim); display: block;">PARTY</span>
            <span style="color: var(--text-main); font-size: 12px;">${b.passenger_count} Pax / ${b.luggage_count} Luggage</span>
          </div>
        </div>

        <div class="voucher-route-grid">
          <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px;">
            <div style="color: var(--gold-primary); font-size: 10px; font-weight: 700;">PICKUP LOCATION &amp; TIME</div>
            <div style="color: #fff; font-weight: 600; margin: 4px 0;">${escapeHtml(b.pickup_address)}</div>
            <div style="font-size: 12px; color: var(--gold-light);">${escapeHtml(b.pickup_datetime)}</div>
          </div>
          <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px;">
            <div style="color: var(--status-en-route); font-size: 10px; font-weight: 700;">DESTINATION</div>
            <div style="color: #fff; font-weight: 600; margin: 4px 0;">${escapeHtml(b.dropoff_address)}</div>
            <div style="font-size: 12px; color: var(--text-muted);">Est. ${b.estimated_distance_mi} mi (~${b.estimated_duration_min} mins)</div>
          </div>
        </div>

        ${b.chauffeur_name ? `
          <div style="background: rgba(212,175,55,0.06); border: 1px solid var(--gold-border); border-radius: 8px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
              <span style="font-size: 10px; color: var(--gold-primary); letter-spacing: 1px;">DEDICATED CHAUFFEUR</span>
              <div style="font-size: 14px; font-weight: 700; color: #fff;">${escapeHtml(b.chauffeur_name)} (${b.chauffeur_rating}★)</div>
              <div style="font-size: 12px; color: var(--text-muted);">${escapeHtml(b.vehicle_model)} [${escapeHtml(b.license_plate)}]</div>
            </div>
            <div style="text-align: right;">
              <span class="badge badge-completed">ALLOCATED</span>
              <div style="font-size: 11px; color: var(--gold-light); margin-top: 4px;">Direct: ${escapeHtml(b.chauffeur_phone)}</div>
            </div>
          </div>
        ` : `
          <div style="background: rgba(230,162,60,0.08); border: 1px dashed rgba(230,162,60,0.4); border-radius: 8px; padding: 10px 14px; text-align: center; color: #f5b041; font-size: 12px;">
            Chauffeur allocation in progress. Details will be delivered via SMS &amp; Email.
          </div>
        `}

        <div class="voucher-footer">
          <div class="voucher-barcode">||| | ||||| || |||| ||| |||||</div>
          <div style="font-size: 11px; color: var(--text-dim); text-align: right;">
            GA Chauffeur 24/7 Dispatch: +44 (0) 20 7946 0888 • gachauffeurs.co.uk
          </div>
        </div>
      </div>
    `;

    document.getElementById('modal-voucher').style.display = 'flex';
  } catch (err) {}
}

async function resendConfirmation(confId) {
  try {
    const res = await fetch('/api/confirmations/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation_id: confId })
    });
    const data = await res.json();
    if (data.success) {
      sfx.playNotification();
      showToast(data.message, 'success');
      fetchConfirmations();
    }
  } catch (err) {
    showToast('Failed to resend confirmation', 'error');
  }
}

async function toggleChauffeurAvailability(chauffeurId, newStatus) {
  try {
    const res = await fetch('/api/chauffeurs/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chauffeur_id: chauffeurId, status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Chauffeur status updated to ${newStatus}`, 'info');
      fetchChauffeurs();
    }
  } catch (err) {}
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
