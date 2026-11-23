/**
 * GA CHAUFFEUR SERVICES LIMITED - SIMPLIFIED DISPATCH CONTROLLER
 * Website: gachauffeurs.co.uk
 * Focused on speed, extreme simplicity, and high-contrast luxury styling
 */

const App = {
  bookings: [],
  chauffeurs: [],
  confirmations: [],
  driverMessages: [],
  activeCommsChauffeurId: '',
  knownDriverMsgIds: new Set(),
  activeFilter: 'ACTIVE',
  jobSort: 'pickup',
  viewMode: 'GRID',
  allocatingJobId: null,
  activeDriverCarId: 'GA-CHF-01',
  expandedBookingIds: new Set(),
  expandedFleetIds: new Set(),
  audioEnabled: true,
  audioCtx: null,
  initialLoadDone: false,
  knownBookingIds: new Set(),
  knownStatusMap: new Map(),
  knownBookingDetails: new Map(),
  pendingAlerts: [],
  urgentBookings: [],
  alertTimer: null
};

// Persist login token across iPhone Home Screen launches so dispatch stays logged in
(function syncPersistentAuthToken() {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('saved_token') || params.get('auth_token');
    if (urlToken) {
      localStorage.setItem('ga_dispatch_saved_token', urlToken);
      document.cookie = `ga_dispatch_auth=${urlToken}; Path=/; Max-Age=31536000; SameSite=Lax`;
      params.delete('saved_token');
      params.delete('auth_token');
      const cleanQuery = params.toString();
      window.history.replaceState({}, document.title, window.location.pathname + (cleanQuery ? `?${cleanQuery}` : ''));
    } else {
      const match = document.cookie.match(/(?:^|;\s*)ga_dispatch_auth=([^;]+)/);
      if (match && match[1]) {
        localStorage.setItem('ga_dispatch_saved_token', match[1]);
      } else {
        const stored = localStorage.getItem('ga_dispatch_saved_token');
        if (stored) {
          document.cookie = `ga_dispatch_auth=${stored}; Path=/; Max-Age=31536000; SameSite=Lax`;
        }
      }
    }
  } catch (_) {}
})();

// ============================================================================
// WEB AUDIO API NOTIFICATION SYNTHESIZER (New Booking + 2h Warning + 1h Alarm)
// ============================================================================
function getAudioCtx() {
  if (!App.audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) App.audioCtx = new Ctx();
  }
  if (App.audioCtx && App.audioCtx.state === 'suspended') {
    App.audioCtx.resume().catch(() => {});
  }
  return App.audioCtx;
}

window.addEventListener('click', () => getAudioCtx(), { once: true });

function playSynthTone(freq, offsetSec, durationSec, type = 'sine', peakGain = 0.22) {
  if (!App.audioEnabled) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  const start = ctx.currentTime + offsetSec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + durationSec + 0.02);
}

function playNewBookingSound() {
  if (!App.audioEnabled) return;
  playSynthTone(523.25, 0.00, 0.28, 'triangle', 0.25); // C5
  playSynthTone(659.25, 0.14, 0.28, 'triangle', 0.25); // E5
  playSynthTone(783.99, 0.28, 0.45, 'triangle', 0.28); // G5
  playSynthTone(1046.50, 0.44, 0.65, 'sine', 0.24);    // C6
}

function playTwoHourWarningSound() {
  if (!App.audioEnabled) return;
  playSynthTone(440.00, 0.00, 0.22, 'sine', 0.24);
  playSynthTone(587.33, 0.20, 0.35, 'triangle', 0.26);
  playSynthTone(440.00, 0.50, 0.22, 'sine', 0.24);
  playSynthTone(587.33, 0.70, 0.40, 'triangle', 0.26);
}

function playOneHourUrgentSound() {
  if (!App.audioEnabled) return;
  playSynthTone(880.00, 0.00, 0.16, 'sawtooth', 0.18);
  playSynthTone(659.25, 0.18, 0.16, 'sawtooth', 0.18);
  playSynthTone(880.00, 0.36, 0.16, 'sawtooth', 0.20);
  playSynthTone(659.25, 0.54, 0.16, 'sawtooth', 0.20);
  playSynthTone(987.77, 0.74, 0.38, 'triangle', 0.28);
}

function playStatusBlipSound() {
  if (!App.audioEnabled) return;
  playSynthTone(587.33, 0.00, 0.14, 'sine', 0.15);
  playSynthTone(880.00, 0.12, 0.24, 'sine', 0.16);
}

function toggleAudioAlerts() {
  App.audioEnabled = !App.audioEnabled;
  const btn = document.getElementById('btn-sound-toggle');
  if (btn) {
    if (App.audioEnabled) {
      btn.textContent = '🔊 Alerts ON';
      btn.style.borderColor = '#10b981';
      btn.style.color = '#34d399';
      playStatusBlipSound();
      showToast('🔊 Audio Alerts Enabled (New Booking + 2h/1h Unallocated Warnings)');
    } else {
      btn.textContent = '🔇 Alerts Muted';
      btn.style.borderColor = '#475569';
      btn.style.color = '#94a3b8';
      showToast('🔇 Audio Alerts Muted');
    }
  }
  updateDispatchAlarm();
}

function filterJobsUrgent() {
  switchTab('jobs');
  App.activeFilter = 'URGENT';
  document.querySelectorAll('.pill-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-filter') === 'URGENT');
  });
  renderJobsList();
}

function parsePickupDate(dtStr) {
  if (!dtStr) return null;
  const clean = String(dtStr).trim().replace(' ', 'T');
  const d = new Date(clean);
  if (!isNaN(d.getTime())) return d;
  const fallback = new Date(dtStr);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function getMinutesUntilPickup(dtStr) {
  const d = parsePickupDate(dtStr);
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / 60000);
}

function isBookingUnallocated(b) {
  if (!b || b.status === 'COMPLETED' || b.status === 'CANCELLED') return false;
  return !b.chauffeur_id;
}

function getBookingUrgency(b) {
  if (!isBookingUnallocated(b)) return null;
  const mins = getMinutesUntilPickup(b.pickup_datetime);
  if (mins === null) return null;
  if (mins <= 60) return 'CRITICAL_1H';
  if (mins > 60 && mins <= 120) return 'WARNING_2H';
  return null;
}

function bookingDetailsSignature(booking) {
  return JSON.stringify([
    booking.pickup_datetime, booking.pickup_address, booking.dropoff_address,
    booking.vehicle_class, booking.customer_name, booking.customer_phone,
    booking.customer_email, booking.flight_number, booking.passenger_count,
    booking.luggage_count, booking.fare_amount, booking.special_requests,
    booking.pending_amendment
  ]);
}

function checkLiveNotificationsAndUrgency(newBookings) {
  if (App.initialLoadDone) {
    for (const b of newBookings) {
      if (!App.knownBookingIds.has(b.id)) {
        playNewBookingSound();
        showToast(`🔔 NEW BOOKING ${b.confirmation_code}: ${b.customer_name} (${b.pickup_datetime})`);
      } else {
        const prevStatus = App.knownStatusMap.get(b.id);
        if (prevStatus && prevStatus !== b.status) {
          playStatusBlipSound();
          showToast(`🚘 Live Status ${b.confirmation_code}: ${b.customer_name} → ${b.status.replace('_', ' ')}`);
        } else if (App.knownBookingDetails.get(b.id) !== bookingDetailsSignature(b)) {
          playStatusBlipSound();
          showToast(`Booking updated ${b.confirmation_code}`);
        }
      }
    }
  }

  App.knownBookingIds = new Set(newBookings.map(b => b.id));
  App.knownStatusMap = new Map(newBookings.map(b => [b.id, b.status]));
  App.knownBookingDetails = new Map(newBookings.map(b => [b.id, bookingDetailsSignature(b)]));
  App.initialLoadDone = true;

  const allUrgent = newBookings.filter(b => getBookingUrgency(b)).map(b => ({
    b, mins: getMinutesUntilPickup(b.pickup_datetime)
  }));
  App.urgentBookings = allUrgent;
  updateDispatchAlarm();

  const banner = document.getElementById('urgent-unallocated-banner');
  const titleEl = document.getElementById('urgent-banner-title');
  const detailsEl = document.getElementById('urgent-banner-details');
  if (banner && titleEl && detailsEl) {
    if (allUrgent.length > 0) {
      banner.style.display = 'flex';
      titleEl.textContent = `Urgent allocation required · ${allUrgent.length} ${allUrgent.length === 1 ? "booking" : "bookings"}`;
      detailsEl.textContent = allUrgent
        .map(x => `${x.b.confirmation_code} (${x.b.customer_name} • ${x.mins >= 0 ? 'in ' + x.mins + 'm' : Math.abs(x.mins) + 'm overdue'})`)
        .join('   •   ');
    } else {
      banner.style.display = 'none';
    }
  }

  const unallocCountEl = document.getElementById('count-unallocated');
  const urgentCountEl = document.getElementById('count-urgent');
  const historyCountEl = document.getElementById('count-history');
  if (unallocCountEl) {
    unallocCountEl.textContent = newBookings.filter(b => isBookingUnallocated(b)).length;
  }
  if (urgentCountEl) {
    urgentCountEl.textContent = allUrgent.length;
  }
  if (historyCountEl) {
    historyCountEl.textContent = newBookings.filter(b => b.status === 'COMPLETED' || b.status === 'CANCELLED').length;
  }
}

function setJobsViewMode(mode) {
  App.viewMode = mode;
  const gridBtn = document.getElementById('btn-view-grid');
  const cardsBtn = document.getElementById('btn-view-cards');
  const gridWrap = document.getElementById('cds-table-container');
  const cardsWrap = document.getElementById('jobs-list-container');
  if (gridBtn) gridBtn.classList.toggle('active', mode === 'GRID');
  if (cardsBtn) cardsBtn.classList.toggle('active', mode === 'CARDS');
  if (gridWrap) gridWrap.style.display = mode === 'GRID' ? 'block' : 'none';
  if (cardsWrap) cardsWrap.style.display = mode === 'CARDS' ? 'flex' : 'none';
}

function hydrateFromLocalCache() {
  try {
    const raw = localStorage.getItem('ga_dispatch_instant_cache_v1');
    if (!raw) return;
    const cached = JSON.parse(raw);
    if (cached && Array.isArray(cached.bookings)) {
      App.bookings = cached.bookings;
      App.chauffeurs = cached.chauffeurs || [];
      App.confirmations = cached.confirmations || [];
      updateTopCarCards();
      populateDriverSelectDropdown();
      renderJobsList();
      renderFleetThinTable();
      renderOutboxTable();
      renderDriverView();
    }
  } catch (_) {}
}

function saveToLocalCache() {
  try {
    localStorage.setItem('ga_dispatch_instant_cache_v1', JSON.stringify({
      bookings: App.bookings,
      chauffeurs: App.chauffeurs,
      confirmations: App.confirmations
    }));
  } catch (_) {}
}

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initForm();
  initSearch();
  setJobsViewMode(App.viewMode);
  // Render cached snapshot in 0ms so the screen is NEVER blank on startup
  hydrateFromLocalCache();
  loadData();

  // Close any open modal on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop').forEach(m => { m.style.display = 'none'; });
    }
  });

  // Auto-refresh every 4 seconds
  setInterval(loadData, 1800);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadData(); });
});

// Tab Switching
function initTabs() {
  document.querySelectorAll('.simple-tab-btn, .m-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  const quickNewBtn = document.getElementById('btn-quick-new-job');
  if (quickNewBtn) {
    quickNewBtn.addEventListener('click', () => switchTab('new-booking'));
  }
}

function switchTab(tabId) {
  document.querySelectorAll('.simple-tab-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.m-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(pane => {
    pane.classList.toggle('active', pane.id === `pane-${tabId}`);
  });

  if (tabId === 'driver-mode') {
    renderDriverView();
  } else if (tabId === 'fleet') {
    renderFleetThinTable();
  }
}

// Fetch all data from backend in a single fast request (/api/bootstrap)
async function loadData() {
  try {
    const res = await fetch('/api/bootstrap');
    if (res.ok) {
      const data = await res.json();
      App.bookings = data.bookings || [];
      App.chauffeurs = data.chauffeurs || [];
      App.confirmations = data.confirmations || [];
      App.driverMessages = data.driver_messages || [];
      App.pendingAlerts = data.pending_alerts || [];
      updateCustomerUnread(data.unread_customer_messages || 0);
    } else {
      const [bRes, cRes, confRes] = await Promise.all([
        fetch('/api/bookings?status=ALL'),
        fetch('/api/chauffeurs'),
        fetch('/api/confirmations')
      ]);
      const bData = await bRes.json();
      const cData = await cRes.json();
      const confData = await confRes.json();
      App.bookings = bData.bookings || [];
      App.chauffeurs = cData.chauffeurs || [];
      App.confirmations = confData.confirmations || [];
    }

    saveToLocalCache();
    checkLiveNotificationsAndUrgency(App.bookings);
    checkIncomingDriverMessages(App.driverMessages);
    updateDispatchAlarm();
    updateTopCarCards();
    populateDriverSelectDropdown();
    renderJobsList();
    renderFleetThinTable();
    renderOutboxTable();
    renderDriverView();
    if (document.getElementById('modal-customer-chat')?.style.display === 'flex') refreshCustomerChat();
    if (document.getElementById('modal-driver-comms')?.style.display === 'flex') {
      renderDriverCommsModal();
    }
  } catch (err) {
    console.warn('Sync note:', err);
  }
}

function populateDriverSelectDropdown() {
  const sel = document.getElementById('driver-car-select');
  if (!sel || App.chauffeurs.length === 0) return;
  const cur = sel.value || App.activeDriverCarId;
  sel.innerHTML = App.chauffeurs.map(ch =>
    `<option value="${escapeHtml(ch.id)}" ${ch.id === cur ? 'selected' : ''}>${escapeHtml(ch.name)} • ${escapeHtml(ch.vehicle_model)} [${escapeHtml(ch.license_plate)}]</option>`
  ).join('');
  if (!App.chauffeurs.some(c => c.id === App.activeDriverCarId)) {
    App.activeDriverCarId = App.chauffeurs[0].id;
  }
}

// Update the 3 Top Car Status Cards
function updateTopCarCards() {
  const cars = {
    'GA-CHF-01': document.getElementById('toggle-ch-1'),
    'GA-CHF-02': document.getElementById('toggle-ch-2'),
    'GA-CHF-03': document.getElementById('toggle-ch-3')
  };

  App.chauffeurs.forEach(ch => {
    const btn = cars[ch.id];
    if (btn) {
      const isAvail = ch.status === 'AVAILABLE';
      btn.textContent = isAvail ? 'Available' : 'On Trip';
      btn.className = `status-toggle-btn ${isAvail ? 'available' : 'busy'}`;
    }
  });
}

// Toggle Car Availability
async function toggleCarStatus(carId) {
  const ch = App.chauffeurs.find(c => c.id === carId);
  if (!ch) return;

  const newStatus = ch.status === 'AVAILABLE' ? 'ON_TRIP' : 'AVAILABLE';
  try {
    await fetch('/api/chauffeurs/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chauffeur_id: carId, status: newStatus })
    });
    showToast(`${ch.vehicle_model} marked as ${newStatus === 'AVAILABLE' ? 'Available' : 'On Trip'}`);
    loadData();
  } catch (err) {}
}

// Search and Filter Handling
function initSearch() {
  document.getElementById('jobs-sort').addEventListener('change', event => {
    App.jobSort = event.target.value;
    renderJobsList();
  });
  document.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      App.activeFilter = btn.getAttribute('data-filter');
      renderJobsList();
    });
  });

  const searchInput = document.getElementById('jobs-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', renderJobsList);
  }
}

const pickupMonthFormat = new Intl.DateTimeFormat('en-GB', { month: 'long' });
const pickupShortMonthFormat = new Intl.DateTimeFormat('en-GB', { month: 'short' });

function matchesPickupDate(pickup, query) {
  const date = parsePickupDate(pickup);
  if (!date || !/\d/.test(query)) return false;

  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const twoDigits = number => String(number).padStart(2, '0');
  const numeric = query.match(/^(\d{1,4})[/.-](\d{1,2})(?:[/.-](\d{1,4}))?$/);
  if (numeric) {
    const [, first, second, third] = numeric;
    if (first.length === 4) {
      return year === Number(first) && month === Number(second) &&
        (!third || day === Number(third));
    }
    const queryYear = third?.length === 2 ? year % 100 : year;
    return day === Number(first) && month === Number(second) &&
      (!third || queryYear === Number(third));
  }
  if (/^\d{4}$/.test(query)) return year === Number(query);

  const normalized = query.replace(/\s+/g, ' ');
  return [pickupMonthFormat, pickupShortMonthFormat].some(formatter => {
    const monthName = formatter.format(date).toLowerCase().replace(/\.$/, '');
    return [day, twoDigits(day)].some(value =>
      [`${value} ${monthName}`, `${value} ${monthName} ${year}`].includes(normalized)
    );
  });
}

// Render Jobs List (Both CDS Simple Columns Table & Mobile Cards)
function renderJobsList() {
  const container = document.getElementById('jobs-list-container');
  if (!container) return;

  const query = (document.getElementById('jobs-search-input')?.value || '').trim().toLowerCase();
  const queryClean = query.replace(/[\s\-]/g, '');

  const filtered = App.bookings.filter(b => {
    // When typing in the search bar, search across ALL bookings including History automatically!
    if (query) {
      const refClean = (b.confirmation_code || '').toLowerCase().replace(/[\s\-]/g, '');
      const idClean = (b.id || '').toLowerCase().replace(/[\s\-]/g, '');
      return refClean.includes(queryClean) ||
             idClean.includes(queryClean) ||
             matchesPickupDate(b.pickup_datetime, query) ||
             (b.customer_name || '').toLowerCase().includes(query) ||
             (b.customer_phone || '').toLowerCase().includes(query) ||
             (b.customer_email || '').toLowerCase().includes(query) ||
             (b.pickup_address || '').toLowerCase().includes(query) ||
             (b.dropoff_address || '').toLowerCase().includes(query) ||
             (b.flight_number || '').toLowerCase().includes(query) ||
             (b.chauffeur_name || '').toLowerCase().includes(query);
    }

    // Status Filter (when search bar is empty)
    if (App.activeFilter === 'ACTIVE') {
      if (b.status === 'COMPLETED' || b.status === 'CANCELLED') return false;
    } else if (App.activeFilter === 'PENDING') {
      if (!isBookingUnallocated(b)) return false;
    } else if (App.activeFilter === 'ALLOCATED') {
      if (!b.chauffeur_id || ['COMPLETED', 'CANCELLED'].includes(b.status)) return false;
    } else if (App.activeFilter === 'URGENT') {
      if (!getBookingUrgency(b)) return false;
    } else if (App.activeFilter === 'COMPLETED') {
      if (b.status !== 'COMPLETED' && b.status !== 'CANCELLED') return false;
    }

    return true;
  });

  filtered.sort((a, b) => {
    const reference = String(a.confirmation_code || '').localeCompare(String(b.confirmation_code || ''));
    const first = parsePickupDate(a.pickup_datetime)?.getTime() ?? Infinity;
    const second = parsePickupDate(b.pickup_datetime)?.getTime() ?? Infinity;
    const date = (first - second) || reference;
    if (App.jobSort === 'reference') return reference || date;
    if (App.jobSort === 'name') return String(a.customer_name || '').localeCompare(String(b.customer_name || ''), 'en-GB', { sensitivity: 'base' }) || date;
    if (App.jobSort === 'allocation') return Number(Boolean(b.chauffeur_id)) - Number(Boolean(a.chauffeur_id)) || date;
    return date;
  });

  // Update badge count
  const activeCount = App.bookings.filter(b => b.status !== 'COMPLETED' && b.status !== 'CANCELLED').length;
  const badgeEl = document.getElementById('badge-active-count');
  const mBadgeEl = document.getElementById('m-jobs-count');
  if (badgeEl) badgeEl.textContent = activeCount;
  if (mBadgeEl) mBadgeEl.textContent = activeCount;

  // Always update the CDS Simple Columns Table
  renderCdsDispatchTable(filtered);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="background: var(--bg-card); border-radius: 12px; padding: 40px; text-align: center; color: var(--text-muted); border: 1px dashed var(--border-light);">
        <p style="font-size: 15px; margin-bottom: 12px;">No bookings found under this filter.</p>
        <button class="btn btn-gold" onclick="switchTab('new-booking')">+ Create New Booking</button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(b => {
    const isCompleted = b.status === 'COMPLETED';
    const isAllocated = !!b.chauffeur_id;
    
    // Live Status Pipeline Stages
    const stages = [
      { key: 'CONFIRMED', action: 'CONFIRMED', label: '✓ Confirmed', match: ['PENDING', 'CONFIRMED', 'ASSIGNED', 'ACCEPTED'] },
      { key: 'EN_ROUTE', action: 'EN_ROUTE_PICKUP', label: '🚗 En Route', match: ['EN_ROUTE'] },
      { key: 'ARRIVED', action: 'ARRIVED', label: '📍 At Pickup', match: ['ARRIVED'] },
      { key: 'ON_BOARD', action: 'ON_BOARD', label: '👥 On Board', match: ['ON_BOARD'] },
      { key: 'NEXT_STOP', action: 'NEXT_STOP', label: '➡️ Next Stop', match: ['NEXT_STOP'] },
      { key: 'COMPLETED', action: 'COMPLETED', label: '🏁 Complete', match: ['COMPLETED'] }
    ];

    const stageButtonsHtml = stages.map(st => {
      const isCurrent = st.match.includes(b.status);
      return `<button type="button" onclick="triggerAction('${b.id}', '${st.action}')" style="padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; border: 1px solid ${isCurrent ? '#c9b894' : 'rgba(255,255,255,0.14)'}; background: ${isCurrent ? 'rgba(201,184,148,0.22)' : 'rgba(255,255,255,0.04)'}; color: ${isCurrent ? '#c9b894' : '#cbd5e1'};">${st.label}</button>`;
    }).join('');

    let actionBtnHtml = `
      <button class="btn-live-action allocate" onclick="openAllocateModal('${b.id}')" style="padding: 6px 12px; font-size: 12px;">
        ${isAllocated ? 'Change Car' : 'Allocate Car →'}
      </button>
    `;

    const cleanPhone = b.customer_phone.replace(/[^0-9+]/g, '');

    return `
      <div class="job-card">
        <div class="job-card-header">
          <div>
            <div class="job-ref-code">${b.confirmation_code}</div>
            <div class="customer-name">${escapeHtml(b.customer_name)}</div>
            <div class="customer-contact">
              <a href="tel:${cleanPhone}">📞 ${escapeHtml(b.customer_phone)}</a>
              <span>•</span>
              <a href="https://wa.me/${cleanPhone.replace('+', '')}" target="_blank">WhatsApp</a>
              <span>•</span>
              <span>${b.passenger_count} Pax, ${b.luggage_count} Bags</span>
            </div>
          </div>

          <div style="text-align: right;">
            <span class="status-badge ${b.status.toLowerCase()}">${b.status.replace('_', ' ')}</span>
            <div style="font-size: 11px; color: var(--gold-accent); margin-top: 4px;">
              ${escapeHtml(b.pickup_datetime)}
            </div>
          </div>
        </div>

        <div class="job-route-box">
          <div class="route-point">
            <span class="route-icon-dot p"></span>
            <div class="route-text">
              <strong>PICKUP</strong>
              <span>${escapeHtml(b.pickup_address)}</span>
            </div>
          </div>
          <div class="route-point">
            <span class="route-icon-dot d"></span>
            <div class="route-text">
              <strong>DESTINATION</strong>
              <span>${escapeHtml(b.dropoff_address)}</span>
            </div>
          </div>
        </div>

        ${b.flight_number ? `
          <div style="background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.25); color: #38bdf8; padding: 6px 12px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 8px;">
            ✈️ Flight <strong>${escapeHtml(b.flight_number)}</strong> • Live monitoring active (45m free wait)
          </div>
        ` : ''}

        <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 10px 12px; margin-top: 8px;">
          <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .12em; margin-bottom: 6px; font-weight: 700;">Live Job Status Actions (Tap Stage to Update):</div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${stageButtonsHtml}
          </div>
        </div>

        <div class="job-card-footer">
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <span class="job-car-tag">
              ${b.chauffeur_name ? `🚗 ${escapeHtml(b.vehicle_model)} [${escapeHtml(b.license_plate)}]` : '⚠️ No car assigned yet'}
            </span>
            <div class="job-fare">£${parseFloat(b.total_fare || b.fare_amount).toFixed(2)}</div>
            ${b.payment_status === 'PRE_AUTHORIZED' ? `
              <span style="background: rgba(74, 222, 128, 0.15); border: 1px solid rgba(74, 222, 128, 0.4); color: #4ade80; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">
                💳 PRE-AUTH (${escapeHtml(b.card_brand || 'Card')} •••• ${escapeHtml(b.card_last4 || '')})
              </span>
            ` : b.payment_status === 'CORPORATE_INVOICE' ? `
              <span style="background: rgba(201, 184, 148, 0.18); border: 1px solid var(--gold-accent); color: var(--gold-accent); font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 4px;">
                🏢 CORPORATE INVOICE
              </span>
            ` : b.payment_status === 'PAID' ? `
              <span style="background: rgba(52, 211, 153, 0.15); border: 1px solid rgba(52, 211, 153, 0.4); color: #34d399; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 4px;">
                ✓ PAID
              </span>
            ` : ''}
          </div>

          <div class="action-btn-group">
            <button class="btn btn-secondary" onclick="viewVoucher('${b.id}')">Voucher</button>
            <button class="btn btn-secondary" onclick="requestTaxInvoice('${b.id}')" style="border-color: var(--gold-accent); color: var(--gold-accent); font-weight: 600;" >Request tax invoice</button>
            ${b.payment_status === 'PRE_AUTHORIZED' ? `<button class="btn btn-secondary" onclick="captureBookingPayment('${b.id}', ${b.total_fare})" style="border-color: #4ade80; color: #4ade80; font-weight: 600;" title="Capture pre-authorised hold">💳 Capture £${parseFloat(b.total_fare).toFixed(2)}</button>` : ''}
            ${actionBtnHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function formatVehTierLabel(tier) {
  const t = String(tier || '').toLowerCase();
  if (t.includes('v_class') || t.includes('v-class')) return 'Mercedes V-Class';
  if (t.includes('range') || t.includes('rover')) return 'Range Rover LWB';
  return 'Mercedes S-Class';
}

function formatCdsPickupTime(dtStr) {
  const d = parsePickupDate(dtStr);
  if (!d) return { time: dtStr || '--:--', date: '' };
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return { time, date };
}

function toggleExpandBookingRow(bookingId, evt) {
  if (evt) {
    const tag = (evt.target && evt.target.tagName || '').toUpperCase();
    if (['SELECT', 'OPTION', 'BUTTON', 'A', 'INPUT'].includes(tag) || evt.target.closest('button, select, a')) {
      return;
    }
  }
  if (App.expandedBookingIds.has(bookingId)) {
    App.expandedBookingIds.delete(bookingId);
  } else {
    App.expandedBookingIds.add(bookingId);
  }
  renderJobsList();
}

function runDispatchJobAction(bookingId, select) {
  const action = select.value;
  select.value = '';
  const actions = {
    allocate: openAllocateModal,
    unallocate: id => inlineAllocateVehicle(id, 'UNALLOCATE'),
    edit: openEditBookingModal,
    email: sendBookingConfirmationEmail,
    invoice: requestTaxInvoice,
    voucher: viewVoucher,
    customerChat: id => openCustomerChat(App.bookings.find(b => b.id === id)?.confirmation_code),
    audit: openBookingLog,
    amend: id => resolveCustomerAmendment(id, 'APPROVE')
  };
  if (action.startsWith('status:')) {
    inlineChangeStatus(bookingId, action.slice(7));
  } else if (Object.hasOwn(actions, action)) {
    actions[action](bookingId);
  }
}

function renderCdsDispatchTable(filtered) {
  const tbody = document.getElementById('cds-table-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    App.renderedJobRows = '';
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 28px; color: var(--text-muted);">
          No bookings found under this filter. Click <strong>"+ New Booking ↗"</strong> to add a job.
        </td>
      </tr>
    `;
    return;
  }

  const rows = filtered.map(b => {
    const { time, date } = formatCdsPickupTime(b.pickup_datetime);
    const urg = getBookingUrgency(b);
    const mins = getMinutesUntilPickup(b.pickup_datetime);
    const isExpanded = App.expandedBookingIds.has(b.id);

    let rowClass = 'excel-thin-row';
    if (isExpanded) rowClass += ' expanded';
    if (urg === 'CRITICAL_1H') rowClass += ' cds-row-urgent-1h';
    else if (urg === 'WARNING_2H') rowClass += ' cds-row-urgent-2h';
    else if (b.status === 'COMPLETED' || b.status === 'CANCELLED') rowClass += ' cds-row-completed';
    else if (b.chauffeur_id) rowClass += ' dispatch-row-allocated';

    let urgencyDot = '';
    if (urg === 'CRITICAL_1H') {
      const lbl = mins >= 0 ? `🚨${mins}m` : `🚨-${Math.abs(mins)}m`;
      urgencyDot = `<span class="cds-countdown-badge cds-countdown-1h" style="margin-top:0;margin-left:4px;padding:1px 5px;font-size:10px;">${lbl}</span>`;
    } else if (urg === 'WARNING_2H') {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      urgencyDot = `<span class="cds-countdown-badge cds-countdown-2h" style="margin-top:0;margin-left:4px;padding:1px 5px;font-size:10px;">⚠️${h}h${m}m</span>`;
    }

    const cleanPhone = (b.customer_phone || '').replace(/[^0-9+]/g, '');

    const statusChoices = [
      { status: 'ASSIGNED', action: 'CONFIRMED', label: '🔵 Allocated' },
      { status: 'EN_ROUTE', action: 'EN_ROUTE_PICKUP', label: '🚗 En Route' },
      { status: 'ARRIVED', action: 'ARRIVED', label: '📍 At Pickup' },
      { status: 'ON_BOARD', action: 'ON_BOARD', label: '🟢 On Board (POB)' },
      { status: 'NEXT_STOP', action: 'NEXT_STOP', label: '➡️ Next Stop' },
      { status: 'DROPPED_OFF', action: 'DROPPED_OFF', label: '🛬 Dropped Off' },
      { status: 'COMPLETED', action: 'COMPLETED', label: '🏁 Completed' },
      { status: 'CANCELLED', action: 'CANCEL', label: '✖️ Cancelled' }
    ];

    const normalizedStatus = b.status === 'ACCEPTED' || (b.status === 'CONFIRMED' && b.chauffeur_id) ? 'ASSIGNED' : b.status;
    const statusLabel = statusChoices.find(choice => choice.status === normalizedStatus)?.label.split(' ').slice(1).join(' ') || (b.chauffeur_id ? 'Confirmed' : 'Unallocated');
    const statusColour = ['COMPLETED', 'CANCELLED'].includes(b.status) ? b.status
      : b.chauffeur_id ? normalizedStatus : 'UNALLOCATED';
    const hours = Number(b.hours_booked) || 0;
    const serviceLabel = hours > 0 ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : b.service_type || 'Transfer';
    const fareVal = parseFloat(b.total_fare ?? b.fare_amount ?? 0).toFixed(2);

    const shortPu = (b.pickup_address || '').split(',')[0];
    const shortDo = (b.dropoff_address || '').split(',')[0];
    const flightTag = b.flight_number ? ` <span class="dispatch-flight">${escapeHtml(b.flight_number)}</span>` : '';

    let pendingAmendObj = null;
    if (b.pending_amendment) {
      try {
        pendingAmendObj = typeof b.pending_amendment === 'string' ? JSON.parse(b.pending_amendment) : b.pending_amendment;
      } catch (_) {}
    }
    const amendBadge = pendingAmendObj
      ? ` <span style="background:#f59e0b;color:#121715;padding:1px 5px;border-radius:3px;font-size:9.5px;font-weight:800;">⚠️ AMEND REQ</span>`
      : '';

    const mainRowHtml = `
      <tr class="${rowClass}" onclick="toggleExpandBookingRow('${b.id}', event)" title="Click row to expand full booking details">
        <!-- 1. Expand & Ref (+ Mobile Inline Summary: Date/Time, Customer, Vehicle) -->
        <td>
          <button type="button" class="excel-first-col-inner dispatch-expand-button" aria-expanded="${isExpanded}" onclick="toggleExpandBookingRow('${b.id}')">
            <span class="excel-expand-icon">${isExpanded ? '▾' : '▸'}</span>
            <span style="font-family:monospace;color:var(--gold);font-weight:700;font-size:11.5px;">${escapeHtml(b.confirmation_code)}</span>${amendBadge}
            <span class="mobile-thin-summary">
              <strong>${escapeHtml(date)} ${escapeHtml(time)}</strong>
              <span style="color:var(--text-muted);">•</span>
              <strong>${escapeHtml(b.customer_name)}</strong>
              <span style="color:var(--text-muted);">•</span>
              <span>${escapeHtml(formatVehTierLabel(b.vehicle_class))}</span>
              <span>${escapeHtml(serviceLabel)}</span>
            </span>
          </button>
        </td>

        <td><strong>${escapeHtml(date)} ${escapeHtml(time)}</strong>${urgencyDot}</td>
        <td><span class="excel-cell-truncate">${escapeHtml(b.customer_name)}</span></td>
        <td><span class="excel-cell-truncate">${escapeHtml(shortPu)} &rarr; ${escapeHtml(shortDo)}</span>${flightTag}</td>
        <td>${escapeHtml(formatVehTierLabel(b.vehicle_class))}</td>
        <td>${escapeHtml(serviceLabel)}</td>
        <td>${escapeHtml(b.chauffeur_id ? (b.chauffeur_name || 'Allocated') : 'Unallocated')}</td>
        <td class="dispatch-status-cell"><span class="dispatch-status-dot" data-status="${escapeHtml(statusColour)}" role="img" aria-label="${escapeHtml(statusLabel)}" title="${escapeHtml(statusLabel)}"></span></td>
        <td class="dispatch-action-cell">
          <select class="dispatch-job-action" aria-label="Actions for ${escapeHtml(b.confirmation_code)}" onchange="runDispatchJobAction('${b.id}', this)">
            <option value="">Actions</option>
            <option value="allocate">Allocate driver and vehicle</option>
            ${b.chauffeur_id ? '<option value="unallocate">Remove driver from booking</option>' : ''}
            <option value="edit">Edit booking</option>
            <option value="email">Send confirmation email</option>
            <option value="invoice">Request tax invoice</option>
            <option value="voucher">View voucher</option>
            <option value="customerChat">Customer messages</option>
            <option value="audit">Booking log</option>
            ${pendingAmendObj ? '<option value="amend">Approve customer amendment</option>' : ''}
            <optgroup label="Update status">
              ${statusChoices.map(choice => `<option value="status:${choice.action}">${escapeHtml(choice.label.split(' ').slice(1).join(' '))}</option>`).join('')}
            </optgroup>
          </select>
        </td>
      </tr>
    `;

    if (!isExpanded) return mainRowHtml;

    const netFare = parseFloat(b.fare_amount || 0).toFixed(2);
    const parkFee = parseFloat(b.parking_fee || 0).toFixed(2);
    const dropFee = parseFloat(b.dropoff_fee || 0).toFixed(2);
    const congFee = parseFloat(b.congestion_charge || 0).toFixed(2);
    const vatFee = parseFloat(b.vat_amount || 0).toFixed(2);

    const amendBannerHtml = pendingAmendObj ? `
      <div style="grid-column: 1 / -1; background: rgba(245, 158, 11, 0.14); border: 1px solid #f59e0b; border-radius: 6px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
        <div>
          <strong style="color: #fbbf24;">🚨 Customer Requested Amendment (&lt;2 Hours Before Pickup):</strong>
          <div style="font-size: 12px; color: #fff; margin-top: 4px;">
            <strong>New Pickup Time:</strong> ${escapeHtml(pendingAmendObj.pickup_datetime)} &nbsp;|&nbsp;
            <strong>New Pickup:</strong> ${escapeHtml(pendingAmendObj.pickup_address)} &nbsp;&rarr;&nbsp;
            <strong>New Destination:</strong> ${escapeHtml(pendingAmendObj.dropoff_address)}
            ${pendingAmendObj.flight_number ? ` &nbsp;|&nbsp; <strong>Flight:</strong> ${escapeHtml(pendingAmendObj.flight_number)}` : ''}
            ${pendingAmendObj.special_requests ? ` &nbsp;|&nbsp; <strong>Notes:</strong> ${escapeHtml(pendingAmendObj.special_requests)}` : ''}
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn btn-gold" style="padding: 6px 12px; font-size: 12px;" onclick="resolveCustomerAmendment('${b.id}', 'APPROVE')">✓ Approve &amp; Email Confirmation</button>
          <button type="button" class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px; border-color: #ef4444; color: #f87171;" onclick="resolveCustomerAmendment('${b.id}', 'REJECT')">✕ Decline</button>
        </div>
      </div>
    ` : '';

    const expandRowHtml = `
      <tr class="excel-expand-row">
        <td colspan="9">
          <div class="excel-expand-drawer">
            ${amendBannerHtml}
            <!-- Box 1: Full Route, Flight & Notes -->
            <div class="excel-drawer-box">
              <div class="excel-drawer-title">📍 Full Itinerary &amp; Special Instructions</div>
              <div style="margin-bottom:6px;"><strong style="color:#4ade80;">Pickup (${escapeHtml(b.pickup_datetime)}):</strong><br><span style="color:#fff;">${escapeHtml(b.pickup_address)}</span> <a href="${googleDirections(b.pickup_address)}" target="_blank" rel="noopener noreferrer">Google Maps ↗</a></div>
              <div style="margin-bottom:6px;"><strong style="color:#38bdf8;">Destination:</strong><br><span style="color:#fff;">${escapeHtml(b.dropoff_address)}</span> <a href="${googleDirections(b.dropoff_address)}" target="_blank" rel="noopener noreferrer">Google Maps ↗</a></div>
              ${b.flight_number ? `<div style="margin-top:6px;color:#38bdf8;">✈️ <strong>Flight Number:</strong> ${escapeHtml(b.flight_number)} (45m free wait)</div>` : ''}
              ${b.service_type ? `<div style="margin-top:6px;"><strong>Service:</strong> ${escapeHtml(b.service_type)}${hours > 0 ? ` · ${hours} hours booked` : ''}</div>` : ''}
              ${b.special_requests ? `<div style="margin-top:6px;color:#fde68a;">📝 <strong>Special Requests:</strong> ${escapeHtml(b.special_requests)}</div>` : '<div style="margin-top:4px;color:var(--text-muted);font-size:11.5px;">No special requests noted.</div>'}
            </div>

            <!-- Box 2: Passenger & Allocated Chauffeur -->
            <div class="excel-drawer-box">
              <div class="excel-drawer-title">👤 Passenger &amp; Chauffeur Details</div>
              <div style="color:#fff;font-weight:700;font-size:14px;">${escapeHtml(b.customer_name)}</div>
              <div style="margin-top:4px;">📞 <a href="tel:${cleanPhone}" style="color:var(--gold);">${escapeHtml(b.customer_phone)}</a> &nbsp;•&nbsp; <a href="https://wa.me/${cleanPhone.replace('+', '')}" target="_blank" style="color:#4ade80;">WhatsApp ↗</a></div>
              <div style="margin-top:3px;color:var(--text-muted);">✉️ ${escapeHtml(b.customer_email || 'No email')}</div>
              <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border);">
                <span style="color:var(--text-muted);font-size:11.5px;">Vehicle Requested:</span> <strong style="color:var(--gold);">${escapeHtml(formatVehTierLabel(b.vehicle_class))}</strong> (${b.passenger_count || 1} Pax, ${b.luggage_count || 0} Bags)
              </div>
              <div style="margin-top:4px;">
                <span style="color:var(--text-muted);font-size:11.5px;">Assigned Chauffeur:</span>
                ${b.chauffeur_name ? `<strong style="color:#4ade80;">${escapeHtml(b.chauffeur_name)} [${escapeHtml(b.license_plate || '')}]</strong>` : `<strong style="color:#f87171;">⚠️ Unallocated</strong>`}
              </div>
            </div>

            <!-- Box 3: Fare Breakdown & Actions -->
            <div class="excel-drawer-box">
              <div class="excel-drawer-title">💷 Itemized Fare &amp; Actions</div>
              <div style="display:flex;justify-content:space-between;color:var(--text-muted);"><span>Base Fare:</span><span style="color:#fff;">£${netFare}</span></div>
              ${parseFloat(parkFee) > 0 ? `<div style="display:flex;justify-content:space-between;color:#38bdf8;"><span>Airport Parking (Pickup):</span><span>+£${parkFee}</span></div>` : ''}
              ${parseFloat(dropFee) > 0 ? `<div style="display:flex;justify-content:space-between;color:#38bdf8;"><span>Airport Parking (Drop-off):</span><span>+£${dropFee}</span></div>` : ''}
              ${parseFloat(congFee) > 0 ? `<div style="display:flex;justify-content:space-between;color:#facc15;"><span>Congestion Charge:</span><span>+£${congFee}</span></div>` : ''}
              <div style="display:flex;justify-content:space-between;color:var(--text-muted);"><span>VAT (20%):</span><span style="color:#fff;">£${vatFee}</span></div>
              <div style="display:flex;justify-content:space-between;color:var(--gold);font-weight:700;font-size:14px;border-top:1px solid var(--border);margin-top:4px;padding-top:4px;">
                <span>Total (${escapeHtml((b.payment_status || 'PENDING').replace('_', ' '))}):</span>
                <span>£${fareVal} GBP</span>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
                <button type="button" class="excel-act-btn gold" onclick="openEditBookingModal('${b.id}')">✏️ Edit Booking</button>
                <button type="button" class="excel-act-btn" onclick="sendBookingConfirmationEmail('${b.id}')">✉️ Send Confirmation</button>
                <button type="button" class="excel-act-btn" onclick="viewVoucher('${b.id}')">Voucher</button>
                <button type="button" class="excel-act-btn" onclick="openBookingLog('${b.id}')">Booking log</button>
                <button type="button" class="excel-act-btn" onclick="requestTaxInvoice('${b.id}')">Request tax invoice</button>
                ${b.payment_status === 'PRE_AUTHORIZED' ? `<button type="button" class="excel-act-btn" style="border-color:#4ade80;color:#4ade80;" onclick="captureBookingPayment('${b.id}', ${b.total_fare || b.fare_amount})">💳 Capture £${fareVal}</button>` : ''}
              </div>
            </div>
          </div>
        </td>
      </tr>
    `;

    return mainRowHtml + expandRowHtml;
  }).join('');
  if (rows !== App.renderedJobRows) {
    tbody.innerHTML = rows;
    App.renderedJobRows = rows;
  }
}

async function sendBookingConfirmationEmail(bookingId) {
  const b = App.bookings.find(x => x.id === bookingId);
  if (!b) return;
  showToast(`✉️ Sending confirmation email for ${b.confirmation_code}...`);
  try {
    const res = await fetch(`/api/bookings/${bookingId}/send-confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_email: b.customer_email })
    });
    const data = await res.json();
    if (data.success) {
      playStatusBlipSound();
      showToast(`✅ Booking Confirmation sent to ${data.recipient}!`);
      loadData();
    } else {
      alert(data.error || 'Could not send confirmation email');
    }
  } catch (err) {
    alert('Failed to send confirmation email');
  }
}

async function resolveCustomerAmendment(bookingId, decision) {
  const b = App.bookings.find(x => x.id === bookingId);
  if (!b) return;
  if (decision === 'REJECT' && !confirm(`Decline the amendment request for ${b.confirmation_code}?`)) return;
  try {
    const res = await fetch(`/api/bookings/${bookingId}/resolve-amendment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision })
    });
    const data = await res.json();
    if (data.success) {
      playStatusBlipSound();
      if (decision === 'APPROVE') {
        showToast(`✅ Amendment approved & updated confirmation emailed to ${data.recipient || b.customer_email}!`);
      } else {
        showToast(`✕ Amendment declined for ${b.confirmation_code}.`);
      }
      loadData();
    } else {
      alert(data.error || 'Could not resolve amendment');
    }
  } catch (err) {
    alert('Failed to resolve amendment');
  }
}

function openEditBookingModal(bookingId) {
  const b = App.bookings.find(x => x.id === bookingId);
  if (!b) return;
  document.getElementById('eb-id').value = b.id;
  document.getElementById('edit-booking-modal-title').textContent = `✏️ Edit Booking ${b.confirmation_code}`;
  const rawDt = String(b.pickup_datetime || '').trim().replace(' ', 'T').slice(0, 16);
  document.getElementById('eb-datetime').value = rawDt;
  document.getElementById('eb-vehicle').value = b.vehicle_class || 'mercedes_s_class';
  document.getElementById('eb-name').value = b.customer_name || '';
  document.getElementById('eb-phone').value = b.customer_phone || '';
  document.getElementById('eb-email').value = b.customer_email || '';
  document.getElementById('eb-flight').value = b.flight_number || '';
  document.getElementById('eb-pickup').value = b.pickup_address || '';
  document.getElementById('eb-dropoff').value = b.dropoff_address || '';
  document.getElementById('eb-pax').value = b.passenger_count || 1;
  document.getElementById('eb-bags').value = b.luggage_count || 0;
  document.getElementById('eb-fare').value = parseFloat(b.fare_amount || 165.0).toFixed(2);
  document.getElementById('eb-notes').value = b.special_requests || '';
  openModal('modal-edit-booking');
}

async function submitEditBooking(e) {
  e.preventDefault();
  const bookingId = document.getElementById('eb-id').value;
  if (!bookingId) return;
  const payload = {
    pickup_datetime: document.getElementById('eb-datetime').value.replace('T', ' '),
    vehicle_class: document.getElementById('eb-vehicle').value,
    customer_name: document.getElementById('eb-name').value,
    customer_phone: document.getElementById('eb-phone').value,
    customer_email: document.getElementById('eb-email').value,
    flight_number: document.getElementById('eb-flight').value,
    pickup_address: document.getElementById('eb-pickup').value,
    dropoff_address: document.getElementById('eb-dropoff').value,
    passenger_count: parseInt(document.getElementById('eb-pax').value || 1),
    luggage_count: parseInt(document.getElementById('eb-bags').value || 0),
    fare_amount: parseFloat(document.getElementById('eb-fare').value || 165.0),
    special_requests: document.getElementById('eb-notes').value
  };
  try {
    const res = await fetch(`/api/bookings/${bookingId}/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      closeModal('modal-edit-booking');
      showToast('💾 Booking updated successfully!');
      loadData();
    } else {
      alert(data.error || 'Could not update booking');
    }
  } catch (err) {
    alert('Failed to update booking');
  }
}

function toggleExpandFleetRow(chId, evt) {
  if (evt) {
    const tag = (evt.target && evt.target.tagName || '').toUpperCase();
    if (['SELECT', 'OPTION', 'BUTTON', 'A', 'INPUT'].includes(tag) || evt.target.closest('button, select, a')) {
      return;
    }
  }
  if (App.expandedFleetIds.has(chId)) {
    App.expandedFleetIds.delete(chId);
  } else {
    App.expandedFleetIds.add(chId);
  }
  renderFleetThinTable();
}

function renderFleetThinTable() {
  const tbody = document.getElementById('fleet-thin-table-body');
  if (!tbody) return;

  if (!App.chauffeurs || App.chauffeurs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted);">No vehicles in fleet. Click "+ Add / Edit Vehicle & Driver".</td></tr>`;
    return;
  }

  tbody.innerHTML = App.chauffeurs.map(ch => {
    const isExpanded = App.expandedFleetIds.has(ch.id);
    const isAvail = ch.status === 'AVAILABLE';
    const assignedJobs = App.bookings.filter(b => b.chauffeur_id === ch.id && b.status !== 'COMPLETED' && b.status !== 'CANCELLED');

    const mainRow = `
      <tr class="excel-thin-row ${isExpanded ? 'expanded' : ''}" onclick="toggleExpandFleetRow('${escapeHtml(ch.id)}', event)" title="Click row to expand vehicle &amp; driver details">
        <td>
          <div class="excel-first-col-inner">
            <span class="excel-expand-icon">${isExpanded ? '▾' : '▸'}</span>
            <strong style="font-family:monospace;color:var(--gold);background:rgba(201,184,148,0.14);padding:2px 6px;border-radius:4px;">${escapeHtml(ch.license_plate)}</strong>
            <span class="mobile-thin-summary">
              <strong style="color:#fff;">${escapeHtml(ch.vehicle_model)}</strong>
              <span style="color:var(--text-muted);">•</span>
              <strong style="color:#fff;">👤 ${escapeHtml(ch.name)}</strong>
            </span>
          </div>
        </td>
        <td><strong style="color:#fff;">${escapeHtml(ch.vehicle_model)}</strong></td>
        <td><span style="color:var(--gold);">${escapeHtml(formatVehTierLabel(ch.vehicle_class))}</span></td>
        <td><strong style="color:#fff;">👤 ${escapeHtml(ch.name)}</strong></td>
        <td><a href="tel:${escapeHtml(ch.phone)}" style="color:var(--gold);text-decoration:none;" onclick="event.stopPropagation()">📞 ${escapeHtml(ch.phone)}</a></td>
        <td><span style="color:var(--text-muted);">👥 ${ch.passenger_capacity || 4} Pax · 🧳 ${ch.luggage_capacity || 2} Bags</span></td>
        <td>
          <span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:${isAvail ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)'};color:${isAvail ? '#34d399' : '#fbbf24'};">
            ${isAvail ? '🟢 Available' : '🚗 On Trip'}
          </span>
        </td>
        <td style="text-align:right;" onclick="event.stopPropagation()">
          <div style="display:inline-flex;gap:4px;justify-content:flex-end;flex-wrap:wrap;">
            <button type="button" class="excel-act-btn gold" onclick="sendDriverAppInvite('${escapeHtml(ch.id)}')" title="Send Chauffeur App to Driver's Phone via WhatsApp / Copy Link">📲 Send App</button>
            <button type="button" class="excel-act-btn" onclick="openDriverCommsModal('${escapeHtml(ch.id)}')" title="Direct Live Chat with Chauffeur">💬 Chat</button>
            <button type="button" class="excel-act-btn" onclick="toggleCarStatus('${escapeHtml(ch.id)}')">${isAvail ? 'Mark On Trip' : 'Mark Available'}</button>
            <button type="button" class="excel-act-btn gold" onclick="openFleetManageModal(); editFleetChauffeur('${escapeHtml(ch.id)}')">✏️ Edit</button>
            <button type="button" class="excel-act-btn danger" onclick="deleteFleetChauffeur('${escapeHtml(ch.id)}')">🗑️</button>
          </div>
        </td>
      </tr>
    `;

    if (!isExpanded) return mainRow;

    const driverAppUrl = `${window.location.origin}/driver?token=${encodeURIComponent(ch.driver_token || ch.id)}`;
    const expandRow = `
      <tr class="excel-expand-row">
        <td colspan="8">
          <div class="excel-expand-drawer">
            <div class="excel-drawer-box">
              <div class="excel-drawer-title">🚘 Vehicle &amp; Verification</div>
              <div><strong>Model:</strong> <span style="color:#fff;">${escapeHtml(ch.vehicle_model)}</span></div>
              <div style="margin-top:4px;"><strong>Registration Plate:</strong> <span style="color:var(--gold);font-family:monospace;">${escapeHtml(ch.license_plate)}</span></div>
              <div style="margin-top:4px;"><strong>PCO / Licence Ref:</strong> <span style="color:#34d399;">${escapeHtml(ch.pco_license || 'Verified On File')}</span></div>
              <div style="margin-top:4px;"><strong>Driver App PIN:</strong> <span style="color:var(--gold);font-family:monospace;">${escapeHtml(ch.driver_pin || '1234')}</span></div>
            </div>
            <div class="excel-drawer-box">
              <div class="excel-drawer-title">👤 Chauffeur Profile &amp; App Link</div>
              <div><strong>Chauffeur:</strong> <span style="color:#fff;">${escapeHtml(ch.name)}</span> (${ch.rating || '5.0'}★ • ${ch.trips_count || 0} Trips)</div>
              <div style="margin-top:4px;"><strong>Direct Mobile:</strong> <a href="tel:${escapeHtml(ch.phone)}" style="color:var(--gold);">${escapeHtml(ch.phone)}</a></div>
              <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
                <button type="button" class="excel-act-btn gold" onclick="sendDriverAppInvite('${escapeHtml(ch.id)}')">📲 Send App via WhatsApp</button>
                <button type="button" class="excel-act-btn" onclick="copyDriverAppLink('${escapeHtml(ch.id)}')">🔗 Copy App Link</button>
                <a href="${driverAppUrl}" target="_blank" class="excel-act-btn" style="text-decoration:none;">↗ Open Driver App</a>
              </div>
            </div>
            <div class="excel-drawer-box">
              <div class="excel-drawer-title">📋 Active Assigned Runs (${assignedJobs.length})</div>
              ${assignedJobs.length === 0
                ? `<div style="color:var(--text-muted);">No active runs assigned right now.</div>`
                : assignedJobs.map(j => `<div style="margin-bottom:4px;"><strong style="color:var(--gold);">${escapeHtml(j.confirmation_code)}</strong> (${escapeHtml(j.pickup_datetime)}): ${escapeHtml(j.customer_name)}</div>`).join('')
              }
              <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
                <button type="button" class="excel-act-btn gold" onclick="openDriverCommsModal('${escapeHtml(ch.id)}')">💬 Message Driver</button>
                <button type="button" class="excel-act-btn" onclick="openFleetManageModal(); editFleetChauffeur('${escapeHtml(ch.id)}')">✏️ Edit Vehicle / Chauffeur</button>
              </div>
            </div>
          </div>
        </td>
      </tr>
    `;

    return mainRow + expandRow;
  }).join('');
}

async function inlineAllocateVehicle(bookingId, chauffeurId) {
  try {
    const res = await fetch(`/api/bookings/${bookingId}/allocate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chauffeur_id: chauffeurId })
    });
    const data = await res.json();
    if (data.success) {
      playStatusBlipSound();
      if (chauffeurId === 'UNALLOCATE') {
        showToast('Job marked as Unallocated.');
      } else {
        showToast(`🚘 Allocated ${data.chauffeur ? data.chauffeur.name + ' [' + data.chauffeur.license_plate + ']' : ''} & notified customer!`);
      }
      loadData();
    } else {
      alert(data.error || 'Could not allocate vehicle');
      loadData();
    }
  } catch (err) {
    showToast('Failed to update allocation');
  }
}

async function inlineChangeStatus(bookingId, action) {
  if (action === 'UNALLOCATE') {
    await inlineAllocateVehicle(bookingId, 'UNALLOCATE');
    return;
  }
  await triggerAction(bookingId, action);
}

function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.style.display = 'flex';
}

function openFleetManageModal() {
  resetFleetForm();
  renderFleetManageList();
  openModal('modal-fleet-manage');
}

function resetFleetForm() {
  const f = document.getElementById('fleet-manage-form');
  if (f) f.reset();
  const idEl = document.getElementById('fm-id');
  if (idEl) idEl.value = '';
  const titleEl = document.getElementById('fleet-form-title');
  if (titleEl) titleEl.textContent = '+ Add New Chauffeur & Vehicle';
}

function editFleetChauffeur(chId) {
  const ch = App.chauffeurs.find(c => c.id === chId);
  if (!ch) return;
  document.getElementById('fm-id').value = ch.id;
  document.getElementById('fm-name').value = ch.name || '';
  document.getElementById('fm-phone').value = ch.phone || '';
  document.getElementById('fm-model').value = ch.vehicle_model || '';
  document.getElementById('fm-plate').value = ch.license_plate || '';
  document.getElementById('fm-bag-capacity').value = ch.luggage_capacity ?? '';
  document.getElementById('fm-class').value = ch.vehicle_class || 'mercedes_s_class';
  const pcoEl = document.getElementById('fm-pco');
  if (pcoEl) pcoEl.value = ch.pco_license || '';
  const pinEl = document.getElementById('fm-pin');
  if (pinEl) pinEl.value = ch.driver_pin || '1234';
  const verEl = document.getElementById('fm-verified');
  if (verEl) verEl.checked = Number(ch.docs_verified) !== 0;
  const titleEl = document.getElementById('fleet-form-title');
  if (titleEl) titleEl.textContent = `✏️ Editing ${ch.name} [${ch.license_plate}]`;
}

function renderFleetManageList() {
  const container = document.getElementById('fleet-manage-list');
  if (!container) return;
  container.innerHTML = App.chauffeurs.map(ch => `
    <div style="background:#141b18;border:1px solid var(--border);border-radius:6px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
      <div>
        <div style="font-weight:700;color:#fff;font-size:13.5px;">
          👤 ${escapeHtml(ch.name)}
          <span style="color:var(--gold);font-family:monospace;">[${escapeHtml(ch.license_plate)}]</span>
          <span style="color:#34d399;font-size:11px;margin-left:6px;">✓ Verified (PIN: ${escapeHtml(ch.driver_pin || '1234')})</span>
        </div>
        <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(ch.vehicle_model)} • 📞 ${escapeHtml(ch.phone)} ${ch.pco_license ? '• PCO: ' + escapeHtml(ch.pco_license) : ''}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" class="btn btn-gold" style="padding:5px 10px;font-size:11.5px;" onclick="sendDriverAppInvite('${escapeHtml(ch.id)}')">📲 Send App to Phone</button>
        <button type="button" class="btn btn-secondary" style="padding:5px 10px;font-size:11.5px;" onclick="copyDriverAppLink('${escapeHtml(ch.id)}')">🔗 Copy Link</button>
        <button type="button" class="btn btn-secondary" style="padding:5px 10px;font-size:11.5px;" onclick="editFleetChauffeur('${escapeHtml(ch.id)}')">✏️ Edit</button>
        <button type="button" class="btn btn-secondary" style="padding:5px 10px;font-size:11.5px;border-color:rgba(239,68,68,0.4);color:#f87171;" onclick="deleteFleetChauffeur('${escapeHtml(ch.id)}')">🗑️</button>
      </div>
    </div>
  `).join('');
}

async function saveFleetChauffeur(e) {
  e.preventDefault();
  const id = document.getElementById('fm-id').value;
  const existing = App.chauffeurs.find(ch => ch.id === id);
  const luggageCapacity = document.getElementById('fm-bag-capacity').valueAsNumber;
  const payload = {
    id,
    email: existing?.email,
    passenger_capacity: existing?.passenger_capacity,
    luggage_capacity: Number.isNaN(luggageCapacity) ? existing?.luggage_capacity : luggageCapacity,
    name: document.getElementById('fm-name').value,
    phone: document.getElementById('fm-phone').value,
    vehicle_model: document.getElementById('fm-model').value,
    license_plate: document.getElementById('fm-plate').value,
    vehicle_class: document.getElementById('fm-class').value,
    pco_license: document.getElementById('fm-pco')?.value || '',
    driver_pin: document.getElementById('fm-pin')?.value || '1234',
    docs_verified: document.getElementById('fm-verified')?.checked ?? true
  };
  try {
    const res = await fetch('/api/chauffeurs/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('🚘 Verified chauffeur & vehicle saved! Tap "📲 Send App to Phone" to share their app.');
      resetFleetForm();
      await loadData();
      renderFleetManageList();
    } else {
      alert(data.error || 'Could not save vehicle & driver');
    }
  } catch (err) {
    alert('Failed to save vehicle & driver');
  }
}

function getDriverAppInstallUrl(ch) {
  const token = ch.driver_token || ch.id;
  return `${window.location.origin}/driver?token=${encodeURIComponent(token)}`;
}

function copyDriverAppLink(chId) {
  const ch = App.chauffeurs.find(c => c.id === chId);
  if (!ch) return;
  const url = getDriverAppInstallUrl(ch);
  navigator.clipboard?.writeText(url);
  showToast(`🔗 Driver App link copied for ${ch.name}!`);
}

function sendDriverAppInvite(chId) {
  const ch = App.chauffeurs.find(c => c.id === chId);
  if (!ch) return;
  const url = getDriverAppInstallUrl(ch);
  const cleanPhone = (ch.phone || '').replace(/[^0-9]/g, '');
  const msg = [
    `🚘 *GA Chauffeur Services — Verified Driver App*`,
    `Hello ${ch.name}, your chauffeur profile & vehicle (${ch.vehicle_model} — *${ch.license_plate}*) have been verified on GA Dispatch.`,
    ``,
    `📲 *Install Your Personal Chauffeur App:*`,
    url,
    ``,
    `🔑 *Your 4-Digit Driver PIN:* ${ch.driver_pin || '1234'}`,
    `(Open the link in Safari on your iPhone -> tap Share -> "Add to Home Screen". Allocated jobs & live Dispatch chat will appear there automatically.)`
  ].join('\n');
  navigator.clipboard?.writeText(url);
  const waUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');
  showToast(`📲 Opening WhatsApp to send ${ch.name}'s Driver App link!`);
}

function checkIncomingDriverMessages(messages) {
  if (!Array.isArray(messages)) return;
  const unreadDriverMsgs = messages.filter(m => m.sender_role === 'DRIVER' && Number(m.is_read) === 0);

  ['badge-driver-msgs', 'tab-badge-driver-msgs', 'm-driver-msg-badge'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (unreadDriverMsgs.length > 0) {
      el.style.display = 'inline-block';
      el.textContent = unreadDriverMsgs.length;
    } else {
      el.style.display = 'none';
    }
  });

  if (App.initialLoadDone) {
    messages.forEach(m => {
      if (!App.knownDriverMsgIds.has(m.id) && m.sender_role === 'DRIVER') {
        playNewBookingSound();
        showToast(`💬 ${m.chauffeur_name || m.sender_name} [${m.license_plate || ''}]: "${m.message}"`);
      }
    });
  }
  App.knownDriverMsgIds = new Set(messages.map(m => m.id));
}

function openDriverCommsModal(chauffeurId) {
  if (chauffeurId) {
    App.activeCommsChauffeurId = chauffeurId;
  } else if (!App.activeCommsChauffeurId && App.chauffeurs.length > 0) {
    const unread = (App.driverMessages || []).find(m => m.sender_role === 'DRIVER' && Number(m.is_read) === 0);
    App.activeCommsChauffeurId = unread ? unread.chauffeur_id : App.chauffeurs[0].id;
  }
  renderDriverCommsModal();
  openModal('modal-driver-comms');
  markDriverMessagesRead(App.activeCommsChauffeurId);
}

function selectCommsChauffeur(chId) {
  App.activeCommsChauffeurId = chId;
  renderDriverCommsModal();
  markDriverMessagesRead(chId);
}

async function markDriverMessagesRead(chId) {
  if (!chId) return;
  try {
    await fetch('/api/driver-messages/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chauffeur_id: chId })
    });
    (App.driverMessages || []).forEach(m => {
      if (m.chauffeur_id === chId && m.sender_role === 'DRIVER') m.is_read = 1;
    });
    checkIncomingDriverMessages(App.driverMessages);
  } catch (_) {}
}

function renderDriverCommsModal() {
  const sel = document.getElementById('comms-driver-select');
  const banner = document.getElementById('comms-install-banner');
  const chatBox = document.getElementById('comms-chat-history');
  if (!sel || !chatBox) return;

  if (!App.activeCommsChauffeurId && App.chauffeurs.length > 0) {
    App.activeCommsChauffeurId = App.chauffeurs[0].id;
  }

  sel.innerHTML = App.chauffeurs.map(ch => {
    const unreadCnt = (App.driverMessages || []).filter(m => m.chauffeur_id === ch.id && m.sender_role === 'DRIVER' && Number(m.is_read) === 0).length;
    return `<option value="${escapeHtml(ch.id)}" ${ch.id === App.activeCommsChauffeurId ? 'selected' : ''}>${escapeHtml(ch.name)} • ${escapeHtml(ch.vehicle_model)} [${escapeHtml(ch.license_plate)}]${unreadCnt > 0 ? ` (${unreadCnt} new)` : ''}</option>`;
  }).join('');

  const ch = App.chauffeurs.find(c => c.id === App.activeCommsChauffeurId);
  if (ch && banner) {
    const appUrl = getDriverAppInstallUrl(ch);
    banner.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <div style="font-size:12px;">
          <strong style="color:var(--gold);">📲 ${escapeHtml(ch.name)}'s Personal Chauffeur App:</strong>
          <div style="color:var(--text-muted);margin-top:2px;">Reg: <strong style="color:#fff;">${escapeHtml(ch.license_plate)}</strong> • PIN: <strong style="color:var(--gold);">${escapeHtml(ch.driver_pin || '1234')}</strong></div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="excel-act-btn gold" onclick="sendDriverAppInvite('${escapeHtml(ch.id)}')">📲 Send via WhatsApp</button>
          <button type="button" class="excel-act-btn" onclick="copyDriverAppLink('${escapeHtml(ch.id)}')">🔗 Copy Link</button>
          <a href="${appUrl}" target="_blank" class="excel-act-btn" style="text-decoration:none;">↗ Open Driver App</a>
        </div>
      </div>
    `;
  }

  const msgs = (App.driverMessages || []).filter(m => m.chauffeur_id === App.activeCommsChauffeurId);
  if (msgs.length === 0) {
    chatBox.innerHTML = `<div style="margin:auto;text-align:center;color:var(--text-muted);font-size:12.5px;">No messages with ${ch ? escapeHtml(ch.name) : 'this chauffeur'} yet. Messages sent from the Driver App appear here and play an alert chime immediately.</div>`;
  } else {
    chatBox.innerHTML = msgs.map(m => {
      const isDriver = m.sender_role === 'DRIVER';
      return `
        <div style="align-self:${isDriver ? 'flex-start' : 'flex-end'};max-width:82%;background:${isDriver ? '#1f2b25' : 'var(--gold)'};color:${isDriver ? '#fff' : '#121715'};border:1px solid ${isDriver ? 'var(--gold)' : 'var(--gold)'};padding:8px 12px;border-radius:10px;font-size:13px;">
          <div style="font-weight:${isDriver ? '500' : '700'};">${escapeHtml(m.message)}</div>
          <div style="font-size:10px;opacity:0.75;margin-top:3px;">${isDriver ? '🚘 ' + escapeHtml(m.sender_name) : '🛡️ Dispatch Control'} • ${escapeHtml((m.created_at || '').slice(11, 16))}</div>
        </div>
      `;
    }).join('');
    chatBox.scrollTop = chatBox.scrollHeight;
  }
}

async function submitDispatchReplyToDriver(e) {
  e.preventDefault();
  const inp = document.getElementById('comms-reply-input');
  const text = inp ? inp.value.trim() : '';
  if (!text || !App.activeCommsChauffeurId) return;
  inp.value = '';
  try {
    const res = await fetch('/api/driver-messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chauffeur_id: App.activeCommsChauffeurId,
        message: text
      })
    });
    const data = await res.json();
    if (data.success) {
      playStatusBlipSound();
      await loadData();
      renderDriverCommsModal();
    }
  } catch (err) {
    showToast('Could not send message');
  }
}

async function deleteFleetChauffeur(chId) {
  if (!confirm('Remove this vehicle & chauffeur from your fleet roster?')) return;
  try {
    const res = await fetch('/api/chauffeurs/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: chId })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Vehicle & chauffeur removed.');
      await loadData();
      renderFleetManageList();
    }
  } catch (err) {}
}

// Live Action execution
async function triggerAction(bookingId, action) {
  try {
    const res = await fetch(`/api/bookings/${bookingId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, actor: 'Dispatch Console' })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Status updated: ${action}`);
      loadData();
    }
  } catch (err) {
    showToast('Action failed');
  }
}

async function captureBookingPayment(bookingId, amount) {
  if (!confirm(`Capture pre-authorised hold of £${parseFloat(amount).toFixed(2)} now?`)) return;
  try {
    const res = await fetch(`/api/bookings/${bookingId}/capture-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Payment of £${parseFloat(amount).toFixed(2)} captured successfully!`);
      loadData();
    } else {
      showToast(data.error || 'Capture failed');
    }
  } catch (e) {
    showToast('Failed to connect to dispatch');
  }
}

// Allocate Modal
function openAllocateModal(bookingId) {
  App.allocatingJobId = bookingId;
  const booking = App.bookings.find(b => b.id === bookingId);
  if (!booking) return;

  const summary = document.getElementById('modal-job-summary');
  if (summary) {
    summary.innerHTML = `
      <strong>${escapeHtml(booking.confirmation_code)}</strong>: ${escapeHtml(booking.customer_name)}<br>
      ${escapeHtml(booking.pickup_address)} &rarr; ${escapeHtml(booking.dropoff_address)}
    `;
  }

  const choiceList = document.querySelector('#modal-allocate .car-choice-list');
  if (choiceList && App.chauffeurs.length > 0) {
    choiceList.innerHTML = App.chauffeurs.map(ch => {
      const iconLbl = ch.vehicle_class === 'mercedes_v_class' ? 'V' : (ch.vehicle_class === 'range_rover_autobiography' ? 'RR' : 'S');
      return `
        <div class="car-choice-btn" onclick="assignVehicle('${escapeHtml(ch.id)}')">
          <div class="choice-icon">${iconLbl}</div>
          <div class="choice-info">
            <strong>${escapeHtml(ch.name)} • ${escapeHtml(ch.vehicle_model)}</strong>
            <span>Reg: ${escapeHtml(ch.license_plate)} • Up to ${ch.passenger_capacity || 4} Passengers</span>
          </div>
          <span class="choice-badge">Select ↗</span>
        </div>
      `;
    }).join('');
  }

  document.getElementById('modal-allocate').style.display = 'flex';
}

async function assignVehicle(chauffeurId) {
  if (!App.allocatingJobId) return;

  try {
    const res = await fetch(`/api/bookings/${App.allocatingJobId}/allocate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chauffeur_id: chauffeurId })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('modal-allocate');
      showToast(`Car allocated & customer confirmation sent!`);
      loadData();
    }
  } catch (err) {}
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.style.display = 'none';
}

// Driver Handset View
function changeDriverCar(carId) {
  App.activeDriverCarId = carId;
  renderDriverView();
}

function renderDriverView() {
  const container = document.getElementById('driver-trip-view');
  if (!container) return;

  const ch = App.chauffeurs.find(c => c.id === App.activeDriverCarId) || App.chauffeurs[0];
  if (!ch) return;

  const assignedJobs = App.bookings.filter(b => b.chauffeur_id === ch.id && b.status !== 'COMPLETED' && b.status !== 'CANCELLED');
  const appUrl = getDriverAppInstallUrl(ch);

  const installCardHtml = `
    <div style="background:#141b18;border:1px solid var(--gold-border);border-radius:10px;padding:14px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:0.08em;">📲 Standalone Chauffeur Phone App</div>
        <div style="font-size:13px;color:#fff;margin-top:3px;"><strong>${escapeHtml(ch.name)}</strong> • ${escapeHtml(ch.vehicle_model)} [${escapeHtml(ch.license_plate)}] • PIN: <strong style="color:var(--gold);">${escapeHtml(ch.driver_pin || '1234')}</strong></div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" class="btn btn-gold" style="padding:7px 12px;font-size:12px;" onclick="sendDriverAppInvite('${escapeHtml(ch.id)}')">📲 Send App to Driver's Phone</button>
        <button type="button" class="btn btn-secondary" style="padding:7px 12px;font-size:12px;" onclick="openDriverCommsModal('${escapeHtml(ch.id)}')">💬 Live Driver Chat</button>
        <a href="${appUrl}" target="_blank" class="btn btn-secondary" style="padding:7px 12px;font-size:12px;text-decoration:none;">↗ Open Driver App</a>
      </div>
    </div>
  `;

  if (assignedJobs.length === 0) {
    container.innerHTML = installCardHtml + `
      <div style="text-align: center; padding: 36px 20px; color: var(--text-muted);">
        <div style="font-size: 36px; margin-bottom: 10px;">🟢</div>
        <h3 style="color: #fff; margin-bottom: 6px;">${escapeHtml(ch.name)} • ${escapeHtml(ch.vehicle_model)} [${escapeHtml(ch.license_plate)}]</h3>
        <p style="font-size: 13px;">Currently Available &amp; Ready for Assigned Runs</p>
      </div>
    `;
    return;
  }

  const driverStages = [
    { action: 'CONFIRMED', match: ['PENDING', 'ASSIGNED', 'CONFIRMED', 'ACCEPTED'], label: '1. ✓ Confirmed' },
    { action: 'EN_ROUTE_PICKUP', match: ['EN_ROUTE'], label: '2. 🚗 En Route' },
    { action: 'ARRIVED', match: ['ARRIVED'], label: '3. 📍 Arrived' },
    { action: 'ON_BOARD', match: ['ON_BOARD'], label: '4. 🟢 POB (Passenger On Board)' },
    { action: 'NEXT_STOP', match: ['NEXT_STOP'], label: '5. ➡️ Next Stop' },
    { action: 'DROPPED_OFF', match: ['DROPPED_OFF'], label: '6. 🛬 Dropped Off' },
    { action: 'COMPLETED', match: ['COMPLETED'], label: '7. 🏁 Job is Complete' }
  ];

  container.innerHTML = installCardHtml + assignedJobs.map(b => {
    const cleanPhone = (b.customer_phone || '').replace(/[^0-9+]/g, '');
    const mapsPu = googleDirections(b.pickup_address);
    const mapsDo = googleDirections(b.dropoff_address);

    const stageBtns = driverStages.map(st => {
      const isCurrent = st.match.includes(b.status);
      const bgStyle = isCurrent
        ? 'background: #10b981; color: #052e16; border-color: #10b981; font-weight: 800;'
        : '';
      return `<button class="btn btn-gold btn-block" style="margin-bottom: 8px; ${bgStyle}" onclick="triggerAction('${b.id}', '${st.action}')">${st.label}${isCurrent ? ' (CURRENT)' : ''}</button>`;
    }).join('');

    return `
      <div style="background: #111116; border: 1px solid ${b.status === 'ON_BOARD' ? '#10b981' : 'var(--gold-border)'}; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 14px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span class="job-ref-code">${escapeHtml(b.confirmation_code)}</span>
            <div style="font-size: 13px; color: var(--gold); font-weight: 700; margin-top: 2px;">📅 ${escapeHtml(b.pickup_datetime)}</div>
          </div>
          <span class="status-badge ${b.status.toLowerCase()}">${escapeHtml(b.status.replace('_', ' '))}</span>
        </div>

        <div>
          <div style="font-size: 20px; font-weight: 700; color: #fff;">${escapeHtml(b.customer_name)}</div>
          <div style="font-size: 13px; color: var(--gold-accent); margin-top: 4px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            <a href="tel:${cleanPhone}" style="color: var(--gold); text-decoration: none; font-weight: 700;">📞 Call ${escapeHtml(b.customer_phone)}</a>
            <a href="https://wa.me/${cleanPhone.replace('+', '')}" target="_blank" style="color: #4ade80; text-decoration: none; font-weight: 700;">💬 WhatsApp</a>
            <span style="color: var(--text-muted);">👥 ${b.passenger_count || 1} Pax · 🧳 ${b.luggage_count || 0} Bags</span>
          </div>
        </div>

        <div style="background: #09090c; border-radius: 8px; padding: 12px; font-size: 13px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: var(--gold-accent); font-weight: 700; font-size: 11px;">PICKUP:</span>
            <a href="${mapsPu}" target="_blank" style="color: #38bdf8; font-size: 11.5px; text-decoration: none; font-weight: 700;">Google Maps ↗</a>
          </div>
          <div style="color: #fff; margin: 3px 0 10px;">${escapeHtml(b.pickup_address)}</div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #38bdf8; font-weight: 700; font-size: 11px;">DESTINATION:</span>
            <a href="${mapsDo}" target="_blank" style="color: #38bdf8; font-size: 11.5px; text-decoration: none; font-weight: 700;">Google Maps ↗</a>
          </div>
          <div style="color: #fff; margin-top: 3px;">${escapeHtml(b.dropoff_address)}</div>
          ${b.flight_number ? `<div style="margin-top: 8px; color: #38bdf8; font-weight: 700;">✈️ Flight: ${escapeHtml(b.flight_number)}</div>` : ''}
          ${b.special_requests ? `<div style="margin-top: 8px; color: #fde68a;">📝 Notes: ${escapeHtml(b.special_requests)}</div>` : ''}
        </div>

        <div style="margin-top: 6px;">
          ${stageBtns}
        </div>
      </div>
    `;
  }).join('');
}

// Intake Form Logic, Smart Autocomplete, & Live VAT Pricing Engine
function initForm() {
  const form = document.getElementById('simple-intake-form');
  const dtInput = document.getElementById('f-datetime');
  const vSelect = document.getElementById('f-vehicle');
  const serviceSelect = document.getElementById('f-service-type');
  const hoursSelect = document.getElementById('f-hours');
  const wrapHours = document.getElementById('wrap-hours');
  const serviceBadge = document.getElementById('f-service-badge');

  const pInput = document.getElementById('f-pickup');
  const dInput = document.getElementById('f-dropoff');
  const pDropdown = document.getElementById('dropdown-pickup');
  const dDropdown = document.getElementById('dropdown-dropoff');

  const passSelect = document.getElementById('f-passengers');
  const lgCases = document.getElementById('f-large-cases');
  const medCases = document.getElementById('f-medium-cases');
  const handLug = document.getElementById('f-hand-luggage');

  if (dtInput) {
    const d = new Date(Date.now() + 60 * 60000);
    dtInput.value = d.toISOString().slice(0, 16);
  }

  // Autocomplete setup
  let googlePlacesLib = null;
  setupAutocomplete(pInput, pDropdown, 'pickup');
  setupAutocomplete(dInput, dDropdown, 'dropoff');

  function renderSuggestionItems(dropdown, field, items) {
    dropdown.replaceChildren();
    if (!items || items.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'autocomplete-item';

      const icon = document.createElement('span');
      icon.className = 'auto-icon';
      icon.textContent = item.category === 'airport' ? '✈️' : item.category === 'hotel' ? '🏨' : item.category === 'fbo' ? '🛩️' : '📍';

      const textWrap = document.createElement('div');
      textWrap.className = 'auto-text';
      const strong = document.createElement('strong');
      strong.textContent = item.title || '';
      const span = document.createElement('span');
      span.textContent = item.subtitle || '';
      textWrap.appendChild(strong);
      textWrap.appendChild(span);

      row.appendChild(icon);
      row.appendChild(textWrap);

      const handleSelect = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        let fullText = item.full_address || (
          item.subtitle
            ? (item.subtitle.toLowerCase().includes((item.title || '').toLowerCase()) ? item.subtitle : `${item.title}, ${item.subtitle}`)
            : (item.title || '')
        );

        // Apply immediately so the dropdown closes and field populates right away
        window.applySuggestion(field, fullText);

        // If this came from Google Places v1 (has place_id), resolve full postcode address in background
        if (item.place_id) {
          try {
            const pRes = await fetch(`/api/place-details?place_id=${encodeURIComponent(item.place_id)}`);
            const pData = await pRes.json();
            if (pData && pData.ok && pData.full_address) {
              window.applySuggestion(field, pData.full_address);
            }
          } catch (_) {}
        }
      };

      row.addEventListener('mousedown', handleSelect);
      row.addEventListener('click', handleSelect);
      dropdown.appendChild(row);
    });

    dropdown.style.display = 'block';
  }

  function setupAutocomplete(input, dropdown, field) {
    if (!input || !dropdown) return;
    let timer;
    let reqSeq = 0;

    async function fetchAndShowSuggestions(rawVal) {
      const mySeq = ++reqSeq;
      const val = (rawVal || '').trim();

      try {
        const res = await fetch(`/api/suggestions?q=${encodeURIComponent(val)}`);
        const data = await res.json();
        if (mySeq !== reqSeq) return;
        const serverItems = data.suggestions || [];

        // Show server suggestions immediately
        if (serverItems.length > 0) {
          renderSuggestionItems(dropdown, field, serverItems);
        }

        // Also enrich with client-side Google Places Autocomplete for any UK address/airport/hotel
        if (val.length >= 2 && window.google && window.google.maps && window.google.maps.importLibrary) {
          try {
            if (!googlePlacesLib) {
              googlePlacesLib = await window.google.maps.importLibrary('places');
            }
            const { suggestions } = await googlePlacesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
              input: val,
              includedRegionCodes: ['gb']
            });
            if (mySeq !== reqSeq) return;
            const googleItems = (suggestions || [])
              .filter(s => s.placePrediction)
              .map(s => {
                const full = s.placePrediction.text ? s.placePrediction.text.toString() : '';
                const parts = full.split(',');
                const title = (parts[0] || full).trim();
                const subtitle = parts.slice(1).join(',').trim() || full;
                const low = full.toLowerCase();
                const category = (low.includes('airport') || low.includes('terminal') || low.includes('heathrow') || low.includes('gatwick'))
                  ? 'airport'
                  : (low.includes('hotel') || low.includes('claridge') || low.includes('connaught') || low.includes('dorchester') || low.includes('ritz') || low.includes('savoy') || low.includes('coworth'))
                    ? 'hotel'
                    : 'address';
                return {
                  title,
                  subtitle,
                  category,
                  placePrediction: s.placePrediction
                };
              });

            if (googleItems.length > 0) {
              const seen = new Set(serverItems.map(i => (i.title + ' ' + i.subtitle).toLowerCase()));
              const merged = [...serverItems];
              for (const g of googleItems) {
                const key = (g.title + ' ' + g.subtitle).toLowerCase();
                if (!seen.has(key)) {
                  seen.add(key);
                  merged.push(g);
                }
              }
              renderSuggestionItems(dropdown, field, merged.slice(0, 10));
            } else if (serverItems.length === 0) {
              dropdown.style.display = 'none';
            }
          } catch (_) {
            if (serverItems.length === 0) dropdown.style.display = 'none';
          }
        } else if (serverItems.length === 0) {
          dropdown.style.display = 'none';
        }
      } catch (e) {
        if (mySeq === reqSeq) dropdown.style.display = 'none';
      }
    }

    input.addEventListener('input', () => {
      if (input.dataset.suppressAutocomplete === '1') {
        delete input.dataset.suppressAutocomplete;
        return;
      }
      clearTimeout(timer);
      const val = input.value.trim();
      autoDetectServiceType();
      updatePricePreview();

      if (val.length === 0) {
        timer = setTimeout(() => fetchAndShowSuggestions(''), 100);
        return;
      }

      timer = setTimeout(() => fetchAndShowSuggestions(val), 120);
    });

    input.addEventListener('focus', () => {
      clearTimeout(timer);
      fetchAndShowSuggestions(input.value.trim());
    });

    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  }

  // Automatic Service Type Detector
  function autoDetectServiceType() {
    if (!serviceSelect) return;
    if (serviceSelect.value === 'Hourly chauffeur service') return; // User manually selected hourly

    const p = (pInput ? pInput.value : '').toLowerCase();
    const d = (dInput ? dInput.value : '').toLowerCase();
    const combined = p + ' ' + d;

    const airportKws = ['lhr', 't5', 't2', 't3', 't4', 'heathrow', 'gatwick', 'lgw', 'city airport', 'lcy', 'luton', 'ltn', 'stansted', 'stn', 'farnborough', 'fab', 'biggin', 'airport', 'terminal'];

    const hasAirport = airportKws.some(k => combined.includes(k));
    if (hasAirport) {
      if (airportKws.some(k => p.includes(k))) {
        serviceSelect.value = 'Airport arrival';
      } else {
        serviceSelect.value = 'Airport departure';
      }
      if (serviceBadge) {
        serviceBadge.textContent = 'AIRPORT';
        serviceBadge.style.color = 'var(--status-blue)';
      }
    } else if (p && d) {
      serviceSelect.value = 'Point-to-point transfer';
      if (serviceBadge) {
        serviceBadge.textContent = 'POINT-TO-POINT';
        serviceBadge.style.color = 'var(--status-green)';
      }
    }
  }

  if (serviceSelect) {
    serviceSelect.addEventListener('change', () => {
      const isHourly = serviceSelect.value === 'Hourly chauffeur service';
      if (wrapHours) wrapHours.style.display = isHourly ? 'block' : 'none';
      const lblDrop = document.getElementById('lbl-dropoff');
      if (lblDrop) {
        lblDrop.textContent = isHourly ? 'Disposal Destination (e.g. As Directed / Central London)' : 'Destination / Drop-off Location *';
      }
      if (isHourly && dInput && !dInput.value) {
        dInput.value = 'As Directed / Central London';
      } else if (!isHourly && dInput && dInput.value === 'As Directed / Central London') {
        dInput.value = '';
      }
      updatePricePreview();
    });
  }

  if (hoursSelect) hoursSelect.addEventListener('change', updatePricePreview);
  if (vSelect) vSelect.addEventListener('change', () => {
    if (vSelect.value === 'mercedes_s_class') {
      if (lgCases && parseInt(lgCases.value) > 1) lgCases.value = '1';
      if (medCases && parseInt(medCases.value) > 0) medCases.value = '0';
      if (handLug && parseInt(handLug.value) > 1) handLug.value = '1';
      if (passSelect && parseInt(passSelect.value) > 3) passSelect.value = '3';
    }
    checkCapacity();
    updatePricePreview();
  });
  if (passSelect) passSelect.addEventListener('change', checkCapacity);
  if (lgCases) lgCases.addEventListener('change', checkCapacity);
  if (medCases) medCases.addEventListener('change', checkCapacity);
  if (handLug) handLug.addEventListener('change', checkCapacity);

  // Check vehicle passenger & luggage capacity (S-Class: max 3 pax, 1 large case, 0 medium, 1 hand luggage)
  function checkCapacity() {
    const pax = parseInt(passSelect ? passSelect.value : 1);
    const large = parseInt(lgCases ? lgCases.value : 0);
    const med = parseInt(medCases ? medCases.value : 0);
    const hand = parseInt(handLug ? handLug.value : 0);
    const v = vSelect ? vSelect.value : 'mercedes_s_class';

    if (v === 'mercedes_s_class' && (pax > 3 || large > 1 || med > 0 || hand > 1)) {
      vSelect.value = 'mercedes_v_class';
      updatePricePreview();
      showToast('S-Class takes max 1 large case & 1 hand luggage — switched to Mercedes V-Class');
    }
  }

  // Update Live Fare with 20% VAT
  async function updatePricePreview() {
    const v = vSelect ? vSelect.value : 'mercedes_s_class';
    const sType = serviceSelect ? serviceSelect.value : 'Airport arrival';
    const hours = hoursSelect ? hoursSelect.value : 4;
    const p = pInput ? pInput.value : '';
    const d = dInput ? dInput.value : '';

    try {
      const res = await fetch(`/api/quote?vehicle=${v}&service_type=${encodeURIComponent(sType)}&hours=${hours}&pickup=${encodeURIComponent(p)}&dropoff=${encodeURIComponent(d)}`);
      const q = await res.json();

      const totalEl = document.getElementById('calc-fare-total');
      const subEl = document.getElementById('calc-fare-sub');
      const titleEl = document.getElementById('fare-service-title');

      if (totalEl) totalEl.textContent = `£${q.total_fare.toFixed(2)}`;
      if (subEl) subEl.textContent = `£${q.net_fare.toFixed(2)} + £${q.vat_amount.toFixed(2)} VAT (20%)`;
      if (titleEl) titleEl.textContent = q.service_label ? q.service_label.toUpperCase() : 'ESTIMATED JOURNEY FARE';
    } catch (e) {
      // Fallback local calc
      let net = 165.0;
      if (v === 'mercedes_v_class') net = 175.0;
      if (v === 'range_rover_autobiography') net = 225.0;
      const vat = net * 0.20;
      const total = net + vat;

      const totalEl = document.getElementById('calc-fare-total');
      const subEl = document.getElementById('calc-fare-sub');
      if (totalEl) totalEl.textContent = `£${total.toFixed(2)}`;
      if (subEl) subEl.textContent = `£${net.toFixed(2)} + £${vat.toFixed(2)} VAT (20%)`;
    }
  }

  updatePricePreview();

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btn-submit-booking');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating Job & Sending Email...';

      const payload = {
        customer_name: document.getElementById('f-name').value,
        customer_phone: document.getElementById('f-phone').value,
        customer_email: document.getElementById('f-email').value,
        service_type: serviceSelect ? serviceSelect.value : 'Airport arrival',
        hours_booked: wrapHours && wrapHours.style.display !== 'none' ? parseInt(hoursSelect.value) : 0,
        pickup_address: pInput.value,
        pickup_unit: document.getElementById('f-pickup-unit') ? document.getElementById('f-pickup-unit').value : '',
        dropoff_address: dInput.value,
        dropoff_unit: document.getElementById('f-dropoff-unit') ? document.getElementById('f-dropoff-unit').value : '',
        pickup_datetime: dtInput.value.replace('T', ' '),
        flight_number: document.getElementById('f-flight').value || null,
        vehicle_class: vSelect.value,
        passenger_count: parseInt(passSelect ? passSelect.value : 1),
        large_cases: parseInt(lgCases ? lgCases.value : 0),
        medium_cases: parseInt(medCases ? medCases.value : 0),
        hand_luggage: parseInt(handLug ? handLug.value : 0),
        special_requests: document.getElementById('f-notes').value || '',
        test_no_charge: document.getElementById('f-test-no-charge') ? document.getElementById('f-test-no-charge').checked : false,
        source: 'DISPATCH_PORTAL'
      };

      try {
        const config=await fetch('/api/forms-config').then(r=>r.json());
        if(config.server_quotes){
          const spec={pickup:payload.pickup_address,dropoff:payload.dropoff_address,vehicle:payload.vehicle_class,service:payload.service_type,hours:payload.hours_booked};
          const qr=await fetch('/api/route-quote?'+new URLSearchParams(spec));const q=await qr.json();
          if(!qr.ok)throw Error(q.error||'Unable to verify route.');
          if(!confirm('Verified journey total: £'+q.total_fare.toFixed(2)+'. Create this booking?')){submitBtn.disabled=false;submitBtn.textContent='Confirm Booking & Send Email ↗';return;}
          payload.quote_token=q.quote_token;
        }
        const res = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Job ${data.booking.confirmation_code} created! Email sent.`);
          form.reset();
          submitBtn.disabled = false;
          submitBtn.textContent = 'Confirm Booking & Send Email ↗';
          switchTab('jobs');
          loadData();
        } else {
          alert(data.error || 'Failed to create job');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Confirm Booking & Send Email ↗';
        }
      } catch (err) {
        alert((err && err.message) || 'Network error submitting job');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm Booking & Send Email ↗';
      }
    });
  }
}

// Global Suggestion Applier
window.applySuggestion = function(field, text) {
  const input = document.getElementById(field === 'pickup' ? 'f-pickup' : 'f-dropoff');
  const dropdown = document.getElementById(field === 'pickup' ? 'dropdown-pickup' : 'dropdown-dropoff');
  if (input) {
    input.dataset.suppressAutocomplete = '1';
    input.value = text;
    if (dropdown) dropdown.style.display = 'none';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
};

// Render Outbox
function renderOutboxTable() {
  const tbody = document.getElementById('outbox-table-body');
  if (!tbody) return;

  if (App.confirmations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">No sent emails logged yet.</td></tr>';
    return;
  }

  tbody.innerHTML = App.confirmations.map(c => {
    const isFailed = String(c.status || '').toUpperCase().includes('FAIL');
    const statusLabel = isFailed ? 'Failed' : 'Delivered';
    const statusColor = isFailed ? 'var(--status-red, #ef4444)' : 'var(--status-green)';
    return `
    <tr>
      <td><span style="color: ${statusColor}; font-weight: 700;">${statusLabel}</span></td>
      <td><strong>${escapeHtml(c.recipient)}</strong></td>
      <td><span style="font-family: var(--font-mono); color: var(--gold-accent);">${escapeHtml(c.confirmation_code || '-')}</span></td>
      <td style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(c.subject)}</td>
      <td style="font-size: 11px; color: var(--text-dim);">${escapeHtml(c.sent_at)}</td>
      <td>
        <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px;" onclick="resendConf('${c.id}')">Resend</button>
      </td>
    </tr>
  `}).join('');
}

async function resendConf(confId) {
  try {
    const res = await fetch('/api/confirmations/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation_id: confId })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Confirmation email resent!');
      loadData();
    } else {
      alert(data.error || 'Could not resend confirmation email.');
      loadData();
    }
  } catch (err) {}
}

// View Voucher Modal
async function viewVoucher(bookingId) {
  try {
    const res = await fetch(`/api/bookings/${bookingId}`);
    const data = await res.json();
    if (!data.booking) return;

    const b = data.booking;
    const body = document.getElementById('voucher-details-body');
    if (!body) return;

    body.innerHTML = `
      <div style="background: #09090c; border: 1px solid var(--gold-border); border-radius: 10px; padding: 20px; display: flex; flex-direction: column; gap: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--gold-border); padding-bottom: 10px;">
          <div>
            <div style="font-family: var(--font-serif); font-size: 16px; color: #fff; font-weight: 700;">GA CHAUFFEUR SERVICES</div>
            <div style="font-size: 12px; color: var(--gold-accent);">Ref: ${b.confirmation_code}</div>
          </div>
          <div style="text-align: right; font-size: 20px; font-weight: 700; color: var(--gold-accent); font-family: var(--font-mono);">
            £${parseFloat(b.fare_amount).toFixed(2)} GBP
          </div>
        </div>

        <div>
          <span style="font-size: 10px; color: var(--text-dim); text-transform: uppercase;">PASSENGER</span>
          <div style="font-size: 16px; font-weight: 700; color: #fff;">${escapeHtml(b.customer_name)}</div>
          <div style="font-size: 12px; color: var(--text-muted);">${escapeHtml(b.customer_phone)} • ${escapeHtml(b.customer_email)}</div>
        </div>

        <div style="background: #141418; padding: 12px; border-radius: 6px; font-size: 13px;">
          <div style="color: var(--gold-accent); font-size: 11px; font-weight: 700;">PICKUP:</div>
          <div style="color: #fff; margin-bottom: 6px;">${escapeHtml(b.pickup_address)} (${escapeHtml(b.pickup_datetime)})</div>
          <div style="color: #38bdf8; font-size: 11px; font-weight: 700;">DESTINATION:</div>
          <div style="color: #fff;">${escapeHtml(b.dropoff_address)}</div>
        </div>

        <!-- Pricing Breakdown -->
        <div style="background: #141418; padding: 12px; border-radius: 6px; font-size: 12px; display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; justify-content: space-between; color: var(--text-muted);">
            <span>Base Journey Fare:</span>
            <span style="color: #fff;">£${parseFloat(b.fare_amount || 0).toFixed(2)}</span>
          </div>
          ${parseFloat(b.parking_fee || 0) > 0 ? `
            <div style="display: flex; justify-content: space-between; color: #38bdf8;">
              <span>Airport Parking &amp; Meet/Greet:</span>
              <span>+£${parseFloat(b.parking_fee).toFixed(2)}</span>
            </div>
          ` : ''}
          ${parseFloat(b.congestion_charge || 0) > 0 ? `
            <div style="display: flex; justify-content: space-between; color: #facc15;">
              <span>London Congestion Charge:</span>
              <span>+£${parseFloat(b.congestion_charge).toFixed(2)}</span>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; color: var(--text-muted); border-top: 1px solid var(--border); padding-top: 4px;">
            <span>VAT (20%):</span>
            <span style="color: #fff;">£${parseFloat(b.vat_amount || 0).toFixed(2)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; color: var(--gold-accent); font-weight: bold; font-size: 14px; border-top: 1px solid var(--border-light); padding-top: 6px;">
            <span>Total Pre-Authorised:</span>
            <span>£${parseFloat(b.total_fare || b.fare_amount || 0).toFixed(2)} GBP</span>
          </div>
          ${b.payment_status === 'PRE_AUTHORIZED' ? `
            <div style="background: rgba(74, 222, 128, 0.1); border: 1px solid rgba(74, 222, 128, 0.3); border-radius: 4px; padding: 6px 10px; margin-top: 6px; font-size: 11px; color: #4ade80;">
              💳 <strong>Pre-Authorised Hold:</strong> ${escapeHtml(b.card_brand || 'Card')} ending in •••• ${escapeHtml(b.card_last4 || '')} (Ref: ${escapeHtml(b.card_auth_code || 'VERIFIED')})
            </div>
          ` : ''}
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted);">
          <span>Vehicle: <strong style="color: #fff;">${b.vehicle_model || 'To be allocated'}</strong></span>
          <span>Reg: <strong style="color: var(--gold-accent);">${b.license_plate || '-'}</strong></span>
        </div>
      </div>
    `;

    document.getElementById('modal-voucher').style.display = 'flex';
  } catch (err) {}
}

async function requestTaxInvoice(bookingId) {
  if (!confirm('Email Dispatch a request to prepare this tax invoice?')) return;
  try {
    const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/request-invoice`, {method: 'POST'});
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Could not request the tax invoice.');
    showToast('Tax invoice request emailed to Dispatch.');
  } catch (error) {
    alert(error.message);
  }
}

async function loadInvoice2goSettings() {
  try {
    const res = await fetch('/api/settings/invoice2go');
    const data = await res.json();
    const inp = document.getElementById('invoice2go-webhook-input');
    if (inp && data && data.webhook_url) {
      inp.value = data.webhook_url;
    }
  } catch (_) {}
}

async function saveInvoice2goWebhook() {
  const inp = document.getElementById('invoice2go-webhook-input');
  const url = inp ? inp.value.trim() : '';
  try {
    const res = await fetch('/api/settings/invoice2go', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhook_url: url })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Invoice2go / Zapier Webhook URL saved!');
    }
  } catch (_) {
    showToast('Could not save webhook URL');
  }
}

document.addEventListener('DOMContentLoaded', loadInvoice2goSettings);

function showToast(msg) {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;

  const item = document.createElement('div');
  item.className = 'toast-item';
  item.textContent = msg;
  stack.appendChild(item);

  setTimeout(() => {
    item.remove();
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function updateCustomerUnread(count) {
  const badge = document.getElementById('customer-chat-unread');
  if (App.customerUnread !== undefined && count > App.customerUnread) {
    playStatusBlipSound();
    showToast('New customer message');
  }
  App.customerUnread = count;
  badge.textContent = count;
  badge.hidden = count === 0;
}

async function customerChatRequest(action, code, message) {
  const response = await fetch('/api/customer-chat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action, code, message})
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Unable to load the conversation.');
  return result;
}

function openCustomerChat(reference) {
  const select = document.getElementById('customer-chat-select');
  if (reference && ![...select.options].some(option => option.value === reference)) {
    select.add(new Option(reference, reference));
  }
  if (reference) select.value = reference;
  openModal('modal-customer-chat');
  refreshCustomerChat();
}

async function refreshCustomerChat() {
  const select = document.getElementById('customer-chat-select');
  const status = document.getElementById('customer-chat-status');
  const history = document.getElementById('customer-chat-history');
  const form = document.getElementById('customer-chat-form');
  const download = document.getElementById('customer-chat-export');
  const reference = select.value;

  try {
    const inbox = await customerChatRequest('inbox');
    if (select.value !== reference) return;
    const active = document.createElement('optgroup');
    active.label = 'Active';
    const archive = document.createElement('optgroup');
    archive.label = 'Archived';
    const threads = new Map(inbox.threads.map(thread => [thread.confirmation_code, thread]));
    if (reference && !threads.has(reference)) {
      const booking = App.bookings.find(b => b.confirmation_code === reference);
      threads.set(reference, booking || {customer_name: '', status: ''});
    }
    for (const [code, thread] of threads) {
      const label = [code, thread.customer_name, thread.unread ? `${thread.unread} new` : ''].filter(Boolean).join(' · ');
      const group = ['COMPLETED', 'CANCELLED'].includes(thread.status) ? archive : active;
      group.append(new Option(label, code, false, code === reference));
    }
    const optionsSignature = JSON.stringify([...threads].map(([code, thread]) =>
      [code, thread.customer_name, thread.status, thread.unread]));
    if (select.dataset.options !== optionsSignature) {
      select.replaceChildren(new Option('Select a conversation', ''), active, archive);
      select.value = reference;
      select.dataset.options = optionsSignature;
    }
    if (!reference) {
      history.replaceChildren();
      status.textContent = inbox.threads.length ? 'Select a booking to open its messages.' : 'No customer messages yet.';
      form.hidden = true;
      download.hidden = true;
      return;
    }
    const conversation = await customerChatRequest('read', reference);
    if (select.value !== reference) return;
    const transcript = JSON.stringify(conversation.messages);
    if (history.dataset.transcript !== transcript) {
      history.replaceChildren(...conversation.messages.map(row => {
        const item = document.createElement('li');
        item.textContent = `${row.sender === 'customer' ? 'Customer' : 'Dispatch'}: ${row.message}`;
        return item;
      }));
      history.scrollTop = history.scrollHeight;
      history.dataset.transcript = transcript;
    }
    status.textContent = conversation.closed ? 'Booking closed. Download the transcript to keep a copy.'
      : 'Live chat is open.';
    form.hidden = conversation.closed;
    download.hidden = !conversation.closed || !conversation.messages.length;
  } catch (error) {
    if (select.value === reference) status.textContent = error.message;
  }
}

async function sendCustomerChatReply(event) {
  event.preventDefault();
  const entry = document.getElementById('customer-chat-reply');
  const reference = document.getElementById('customer-chat-select').value;
  if (!entry.value.trim()) return;
  const button = event.submitter;
  if (button) button.disabled = true;
  try {
    await customerChatRequest('send', reference, entry.value);
    entry.value = '';
    await refreshCustomerChat();
  } catch (error) {
    document.getElementById('customer-chat-status').textContent = error.message;
  } finally {
    if (button) button.disabled = false;
  }
}

async function downloadCustomerChat() {
  const reference = document.getElementById('customer-chat-select').value;
  try {
    const transcript = await customerChatRequest('download', reference);
    const body = [`GA Chauffeurs · ${reference}`, ...transcript.messages.map(row =>
      `${row.sent_at} · ${row.sender === 'customer' ? 'Customer' : 'Dispatch'}\n${row.message}`
    )].join('\n\n');
    const url = URL.createObjectURL(new Blob([body], {type: 'text/plain'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${reference}-customer-chat.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    document.getElementById('customer-chat-status').textContent = error.message;
  }
}

function updateDispatchAlarm() {
  const banner = document.getElementById('dispatch-persistent-alerts');
  const updates = App.pendingAlerts;
  const driverMessages = (App.driverMessages || []).filter(message => message.sender_role === 'DRIVER' && !Number(message.is_read)).length;
  const customers = App.customerUnread || 0;
  banner.hidden = !(updates.length || driverMessages || customers);
  document.getElementById('dispatch-alert-text').textContent = [
    updates.length ? `Booking updates: ${updates.map(alert => [alert.confirmation_code, alert.details].filter(Boolean).join(' · ')).join(' • ')}` : '',
    driverMessages ? `${driverMessages} driver message(s)` : '',
    customers ? `${customers} customer message(s)` : ''
  ].filter(Boolean).join(' · ');
  document.getElementById('dispatch-alert-ack').hidden = updates.length === 0;
  document.getElementById('dispatch-alert-drivers').hidden = driverMessages === 0;
  document.getElementById('dispatch-alert-customers').hidden = customers === 0;
  const shouldRing = App.audioEnabled && (!banner.hidden || App.urgentBookings.length > 0);
  if (shouldRing && App.alertTimer === null) {
    const ring = () => App.urgentBookings.length ? playOneHourUrgentSound() : playNewBookingSound();
    ring();
    App.alertTimer = setInterval(ring, 2500);
  } else if (!shouldRing && App.alertTimer !== null) {
    clearInterval(App.alertTimer);
    App.alertTimer = null;
  }
}

async function acknowledgeDispatchAlerts() {
  const keys = App.pendingAlerts.map(alert => alert.key);
  try {
    const response = await fetch('/api/dispatch/ack-alerts', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({keys})
    });
    if (!response.ok) throw Error('Could not acknowledge the updates.');
    await loadData();
  } catch (error) {
    showToast(error.message);
  }
}


async function downloadDispatchBackup() {
  const status = document.getElementById('dispatch-backup-result');
  try {
    const response = await fetch('/api/dispatch/backup');
    if (!response.ok) throw Error('Could not download the Dispatch backup.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dispatch-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    status.textContent = error.message;
  }
}

async function restoreDispatchBackup(event) {
  event.preventDefault();
  const status = document.getElementById('dispatch-backup-result');
  const file = document.getElementById('dispatch-backup-file').files[0];
  const pasted = document.getElementById('dispatch-backup-content');
  if (!file && !pasted.value.trim()) { status.textContent = 'Select a file or paste backup JSON.'; return; }
  event.submitter.disabled = true;
  try {
    const response = await fetch('/api/dispatch/restore', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: file ? await file.text() : pasted.value
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Could not restore the Dispatch backup.');
    pasted.value = '';
    status.textContent = `Restored ${result.restored.bookings} bookings.`;
    await loadData();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    event.submitter.disabled = false;
  }
}

function googleDirections(address) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address || '')}&travelmode=driving&dir_action=navigate`;
}

async function openBookingLog(id) {
  const title = document.getElementById('booking-log-title');
  const history = document.getElementById('booking-log-history');
  history.textContent = 'Loading booking history…';
  openModal('modal-booking-log');
  try {
    const response = await fetch(`/api/bookings/${encodeURIComponent(id)}`);
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Could not load booking history.');
    title.textContent = `Booking log · ${result.booking.confirmation_code}`;
    if (!result.actions?.length) {
      history.textContent = 'No actions are recorded for this booking.';
      return;
    }
    history.replaceChildren(...result.actions.map(action => {
      const row = document.createElement('section');
      const heading = document.createElement('strong');
      const details = document.createElement('p');
      const meta = document.createElement('small');
      heading.textContent = action.action.replaceAll('_', ' ');
      details.textContent = action.details || '';
      meta.textContent = [action.timestamp, action.actor, action.request_ip && `IP ${action.request_ip}`,
        action.network_trace && `Trace ${action.network_trace}`].filter(Boolean).join(' · ');
      row.append(heading, details, meta);
      return row;
    }));
  } catch (error) {
    history.textContent = error.message;
  }
}
