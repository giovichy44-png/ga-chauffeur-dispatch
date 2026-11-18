/**
 * GA CHAUFFEUR SERVICES LIMITED - SIMPLIFIED DISPATCH CONTROLLER
 * Website: gachauffeurs.co.uk
 * Focused on speed, extreme simplicity, and high-contrast luxury styling
 */

const App = {
  bookings: [],
  chauffeurs: [],
  confirmations: [],
  activeFilter: 'ACTIVE',
  viewMode: window.innerWidth <= 820 ? 'CARDS' : 'GRID',
  allocatingJobId: null,
  activeDriverCarId: 'GA-CHF-01',
  audioEnabled: true,
  audioCtx: null,
  initialLoadDone: false,
  knownBookingIds: new Set(),
  knownStatusMap: new Map(),
  alerted2hIds: new Set(),
  alerted1hIds: new Set(),
  lastUrgentRepeatMs: 0,
  snoozeUrgentUntilMs: 0
};

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
}

function snoozeUrgentAudio() {
  App.snoozeUrgentUntilMs = Date.now() + 5 * 60 * 1000;
  showToast('🔕 Urgent unallocated alarm snoozed for 5 minutes.');
}

function filterJobsUrgent() {
  switchTab('jobs');
  App.activeFilter = 'PENDING';
  document.querySelectorAll('.pill-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-filter') === 'PENDING');
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
  return Math.round((d.getTime() - Date.now()) / 60000);
}

function isBookingUnallocated(b) {
  if (!b || b.status === 'COMPLETED' || b.status === 'CANCELLED') return false;
  return !b.chauffeur_id || b.status === 'PENDING';
}

function getBookingUrgency(b) {
  if (!isBookingUnallocated(b)) return null;
  const mins = getMinutesUntilPickup(b.pickup_datetime);
  if (mins === null) return null;
  if (mins <= 60 && mins >= -180) return 'CRITICAL_1H';
  if (mins > 60 && mins <= 120) return 'WARNING_2H';
  return null;
}

function checkLiveNotificationsAndUrgency(newBookings) {
  const nowMs = Date.now();

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
        }
      }
    }
  }

  App.knownBookingIds = new Set(newBookings.map(b => b.id));
  App.knownStatusMap = new Map(newBookings.map(b => [b.id, b.status]));
  App.initialLoadDone = true;

  const urgent1h = [];
  const warning2h = [];

  for (const b of newBookings) {
    const urg = getBookingUrgency(b);
    const mins = getMinutesUntilPickup(b.pickup_datetime);
    if (urg === 'CRITICAL_1H') {
      urgent1h.push({ b, mins });
      if (!App.alerted1hIds.has(b.id)) {
        App.alerted1hIds.add(b.id);
        if (nowMs > App.snoozeUrgentUntilMs) {
          playOneHourUrgentSound();
          showToast(`🚨 CRITICAL (<1h): ${b.confirmation_code} (${b.customer_name}) is UNALLOCATED!`);
        }
      }
    } else if (urg === 'WARNING_2H') {
      warning2h.push({ b, mins });
      if (!App.alerted2hIds.has(b.id)) {
        App.alerted2hIds.add(b.id);
        if (nowMs > App.snoozeUrgentUntilMs) {
          playTwoHourWarningSound();
          showToast(`⚠️ 2-Hour Warning: ${b.confirmation_code} (${b.customer_name}) needs vehicle & driver.`);
        }
      }
    } else {
      App.alerted1hIds.delete(b.id);
      App.alerted2hIds.delete(b.id);
    }
  }

  if (urgent1h.length > 0 && nowMs > App.snoozeUrgentUntilMs && nowMs - App.lastUrgentRepeatMs > 60000) {
    App.lastUrgentRepeatMs = nowMs;
    playOneHourUrgentSound();
  }

  const banner = document.getElementById('urgent-unallocated-banner');
  const titleEl = document.getElementById('urgent-banner-title');
  const detailsEl = document.getElementById('urgent-banner-details');
  if (banner && titleEl && detailsEl) {
    const allUrgent = [...urgent1h, ...warning2h];
    if (allUrgent.length > 0) {
      banner.style.display = 'flex';
      titleEl.textContent = `${allUrgent.length} UNALLOCATED BOOKING${allUrgent.length > 1 ? 'S' : ''} DUE WITHIN 2 HOURS`;
      detailsEl.textContent = allUrgent
        .map(x => `${x.b.confirmation_code} (${x.b.customer_name} • ${x.mins >= 0 ? 'in ' + x.mins + 'm' : Math.abs(x.mins) + 'm overdue'})`)
        .join('   •   ');
    } else {
      banner.style.display = 'none';
    }
  }

  const unallocCountEl = document.getElementById('count-unallocated');
  const urgentCountEl = document.getElementById('count-urgent');
  if (unallocCountEl) {
    unallocCountEl.textContent = newBookings.filter(b => isBookingUnallocated(b)).length;
  }
  if (urgentCountEl) {
    urgentCountEl.textContent = urgent1h.length + warning2h.length;
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
  setInterval(loadData, 4000);
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
    updateTopCarCards();
    populateDriverSelectDropdown();
    renderJobsList();
    renderOutboxTable();
    renderDriverView();
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

// Render Jobs List (Both CDS Simple Columns Table & Mobile Cards)
function renderJobsList() {
  const container = document.getElementById('jobs-list-container');
  if (!container) return;

  const query = (document.getElementById('jobs-search-input')?.value || '').toLowerCase();

  const filtered = App.bookings.filter(b => {
    // Status Filter
    if (App.activeFilter === 'ACTIVE') {
      if (b.status === 'COMPLETED' || b.status === 'CANCELLED') return false;
    } else if (App.activeFilter === 'PENDING') {
      if (!isBookingUnallocated(b)) return false;
    } else if (App.activeFilter === 'URGENT') {
      if (!getBookingUrgency(b)) return false;
    } else if (App.activeFilter === 'COMPLETED') {
      if (b.status !== 'COMPLETED') return false;
    }

    // Text Search
    if (!query) return true;
    return (b.customer_name || '').toLowerCase().includes(query) ||
           (b.confirmation_code || '').toLowerCase().includes(query) ||
           (b.pickup_address || '').toLowerCase().includes(query) ||
           (b.dropoff_address || '').toLowerCase().includes(query) ||
           (b.flight_number || '').toLowerCase().includes(query) ||
           (b.chauffeur_name || '').toLowerCase().includes(query);
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
            <button class="btn btn-secondary" onclick="openInvoiceModal('${b.id}')" style="border-color: var(--gold-accent); color: var(--gold-accent); font-weight: 600;" title="Create &amp; Email Tax Invoice">📄 Invoice</button>
            ${b.payment_status === 'PRE_AUTHORIZED' ? `<button class="btn btn-secondary" onclick="captureBookingPayment('${b.id}', ${b.total_fare})" style="border-color: #4ade80; color: #4ade80; font-weight: 600;" title="Capture pre-authorised hold">💳 Capture £${parseFloat(b.total_fare).toFixed(2)}</button>` : ''}
            ${actionBtnHtml}
            <button class="btn btn-secondary" onclick="deleteBooking('${b.id}', '${b.confirmation_code}')" style="border-color: rgba(239,68,68,0.4); color: #f87171;" title="Delete booking">🗑️ Delete</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function formatVehTierLabel(tier) {
  const t = String(tier || '').toLowerCase();
  if (t.includes('v_class') || t.includes('v-class')) return 'Mercedes V-Class (MPV)';
  if (t.includes('range') || t.includes('rover')) return 'Range Rover Autobiography';
  return 'Mercedes S-Class (Saloon)';
}

function formatCdsPickupTime(dtStr) {
  const d = parsePickupDate(dtStr);
  if (!d) return { time: dtStr || '--:--', date: '' };
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return { time, date };
}

function renderCdsDispatchTable(filtered) {
  const tbody = document.getElementById('cds-table-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 36px; color: var(--text-muted);">
          No bookings found under this filter. Click <strong>"+ New Booking ↗"</strong> to add a job.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(b => {
    const { time, date } = formatCdsPickupTime(b.pickup_datetime);
    const urg = getBookingUrgency(b);
    const mins = getMinutesUntilPickup(b.pickup_datetime);

    let rowClass = '';
    if (b.status === 'ON_BOARD') rowClass = 'cds-row-pob';
    else if (b.status === 'EN_ROUTE' || b.status === 'NEXT_STOP') rowClass = 'cds-row-enroute';
    else if (b.status === 'ARRIVED') rowClass = 'cds-row-arrived';
    else if (urg === 'CRITICAL_1H') rowClass = 'cds-row-urgent-1h';
    else if (urg === 'WARNING_2H') rowClass = 'cds-row-urgent-2h';
    else if (b.status === 'COMPLETED') rowClass = 'cds-row-completed';

    let countdownHtml = '';
    if (urg === 'CRITICAL_1H') {
      const lbl = mins >= 0 ? `🚨 In ${mins}m (Unallocated!)` : `🚨 ${Math.abs(mins)}m overdue!`;
      countdownHtml = `<div><span class="cds-countdown-badge cds-countdown-1h">${lbl}</span></div>`;
    } else if (urg === 'WARNING_2H') {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      countdownHtml = `<div><span class="cds-countdown-badge cds-countdown-2h">⚠️ In ${h}h ${m}m (Unallocated)</span></div>`;
    }

    const cleanPhone = (b.customer_phone || '').replace(/[^0-9+]/g, '');

    const allocOptions = [
      `<option value="UNALLOCATE" ${!b.chauffeur_id ? 'selected' : ''}>⚠️ -- Unallocated (Assign Vehicle & Driver) --</option>`,
      ...App.chauffeurs.map(ch =>
        `<option value="${escapeHtml(ch.id)}" ${b.chauffeur_id === ch.id ? 'selected' : ''}>🚘 ${escapeHtml(ch.license_plate)} • ${escapeHtml(ch.name)} (${escapeHtml(ch.vehicle_model)})</option>`
      )
    ].join('');

    const statusChoices = [
      { status: 'PENDING', action: 'UNALLOCATE', label: '🔴 Unallocated / Pending' },
      { status: 'ASSIGNED', action: 'CONFIRMED', label: '🔵 Allocated / Confirmed' },
      { status: 'EN_ROUTE', action: 'EN_ROUTE_PICKUP', label: '🚗 En Route to Pickup' },
      { status: 'ARRIVED', action: 'ARRIVED', label: '📍 Arrived at Pickup' },
      { status: 'ON_BOARD', action: 'ON_BOARD', label: '🟢 Passenger On Board' },
      { status: 'NEXT_STOP', action: 'NEXT_STOP', label: '➡️ Proceeding to Next Stop' },
      { status: 'COMPLETED', action: 'COMPLETED', label: '🏁 Completed' },
      { status: 'CANCELLED', action: 'CANCEL', label: '✖️ Cancelled' }
    ];

    const normalizedStatus = (b.status === 'CONFIRMED' || b.status === 'ACCEPTED') ? 'ASSIGNED' : b.status;
    const statusOptionsHtml = statusChoices.map(sc =>
      `<option value="${sc.action}" ${normalizedStatus === sc.status ? 'selected' : ''}>${sc.label}</option>`
    ).join('');

    let liveSubLabel = '';
    if (b.status === 'ON_BOARD') {
      liveSubLabel = `<div style="font-size:11px;color:#34d399;font-weight:700;margin-top:4px;">● LIVE: Passenger On Board</div>`;
    } else if (b.status === 'ARRIVED') {
      liveSubLabel = `<div style="font-size:11px;color:#d8b4fe;font-weight:700;margin-top:4px;">● LIVE: Waiting at Pickup</div>`;
    } else if (b.status === 'EN_ROUTE' || b.status === 'NEXT_STOP') {
      liveSubLabel = `<div style="font-size:11px;color:#67e8f9;font-weight:700;margin-top:4px;">● LIVE: Chauffeur En Route</div>`;
    } else if (isBookingUnallocated(b)) {
      liveSubLabel = `<div style="font-size:11px;color:#fca5a5;margin-top:4px;">Needs vehicle &amp; driver</div>`;
    }

    const fareVal = parseFloat(b.total_fare || b.fare_amount || 0).toFixed(2);
    let payBadgeHtml = '';
    if (b.payment_status === 'PRE_AUTHORIZED') {
      payBadgeHtml = `<div style="margin-top:4px;"><span style="background:rgba(74,222,128,0.15);border:1px solid rgba(74,222,128,0.4);color:#4ade80;font-size:10.5px;font-weight:700;padding:2px 6px;border-radius:4px;">💳 PRE-AUTH ••${escapeHtml(b.card_last4 || '')}</span></div>`;
    } else if (b.payment_status === 'CORPORATE_INVOICE') {
      payBadgeHtml = `<div style="margin-top:4px;"><span style="background:rgba(201,184,148,0.18);border:1px solid var(--gold-accent);color:var(--gold-accent);font-size:10.5px;font-weight:700;padding:2px 6px;border-radius:4px;">🏢 ACCOUNT</span></div>`;
    } else if (b.payment_status === 'PAID') {
      payBadgeHtml = `<div style="margin-top:4px;"><span style="background:rgba(52,211,153,0.15);border:1px solid rgba(52,211,153,0.4);color:#34d399;font-size:10.5px;font-weight:700;padding:2px 6px;border-radius:4px;">✓ PAID</span></div>`;
    }

    return `
      <tr class="${rowClass}">
        <!-- 1. Date & Time -->
        <td>
          <div class="cds-dt-time">${escapeHtml(time)}</div>
          <div class="cds-dt-date">${escapeHtml(date)}</div>
          <span class="cds-ref-pill">${escapeHtml(b.confirmation_code)}</span>
          ${countdownHtml}
        </td>

        <!-- 2. Customer & Contact -->
        <td>
          <div style="font-weight:700;color:#fff;font-size:13.5px;">${escapeHtml(b.customer_name)}</div>
          <div style="margin-top:3px;font-size:12px;">
            <a href="tel:${cleanPhone}" style="color:var(--gold);text-decoration:none;">📞 ${escapeHtml(b.customer_phone)}</a>
          </div>
          <div style="margin-top:3px;font-size:11px;display:flex;gap:8px;">
            <a href="https://wa.me/${cleanPhone.replace('+', '')}" target="_blank" style="color:#4ade80;text-decoration:none;">WhatsApp ↗</a>
          </div>
        </td>

        <!-- 3. Route, Flight & Notes -->
        <td>
          <div style="margin-bottom:4px;line-height:1.35;">
            <span style="color:#4ade80;font-weight:700;font-size:11px;">PU:</span>
            <span style="color:#fff;">${escapeHtml(b.pickup_address)}</span>
          </div>
          <div style="line-height:1.35;">
            <span style="color:#38bdf8;font-weight:700;font-size:11px;">DO:</span>
            <span style="color:#cbd5e1;">${escapeHtml(b.dropoff_address)}</span>
          </div>
          ${b.flight_number ? `<div style="margin-top:5px;"><span style="background:rgba(56,189,248,0.14);border:1px solid rgba(56,189,248,0.35);color:#38bdf8;font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;">✈️ ${escapeHtml(b.flight_number)}</span></div>` : ''}
          ${b.special_requests ? `<div style="margin-top:5px;font-size:11.5px;color:#fde68a;background:rgba(255,255,255,0.04);border-left:2px solid var(--gold);padding:3px 7px;">📝 ${escapeHtml(b.special_requests)}</div>` : ''}
        </td>

        <!-- 4. Vehicle Req & Pax -->
        <td>
          <div style="font-weight:700;color:var(--gold);font-size:12px;margin-bottom:4px;">${escapeHtml(formatVehTierLabel(b.vehicle_class))}</div>
          <div style="font-size:12px;color:var(--text-muted);">👥 <strong>${b.passenger_count || 1}</strong> Pax · 🧳 <strong>${b.luggage_count || 0}</strong> Bags</div>
        </td>

        <!-- 5. Allocate Vehicle & Driver -->
        <td>
          <select class="cds-inline-select ${b.chauffeur_id ? 'allocated' : 'unallocated'}" onchange="inlineAllocateVehicle('${b.id}', this.value)">
            ${allocOptions}
          </select>
          ${b.chauffeur_name ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Driver: <strong style="color:#fff;">${escapeHtml(b.chauffeur_name)}</strong> [${escapeHtml(b.license_plate || '')}]</div>` : ''}
        </td>

        <!-- 6. Live Status -->
        <td>
          <select class="cds-status-select st-${b.status}" onchange="inlineChangeStatus('${b.id}', this.value)">
            ${statusOptionsHtml}
          </select>
          ${liveSubLabel}
        </td>

        <!-- 7. Fare & Payment -->
        <td>
          <div style="font-weight:700;font-size:14px;color:#fff;">£${fareVal}</div>
          ${payBadgeHtml}
          ${b.payment_status === 'PRE_AUTHORIZED' ? `<button type="button" class="btn btn-secondary" onclick="captureBookingPayment('${b.id}', ${b.total_fare || b.fare_amount})" style="margin-top:5px;padding:3px 7px;font-size:10.5px;border-color:#4ade80;color:#4ade80;">Capture £${fareVal}</button>` : ''}
        </td>

        <!-- 8. Actions -->
        <td style="text-align:right;">
          <div style="display:flex;gap:5px;justify-content:flex-end;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary" style="padding:5px 8px;font-size:11px;" onclick="copyDriverJobSheet('${b.id}')" title="Copy Driver Run Sheet for WhatsApp/SMS">📋</button>
            <button type="button" class="btn btn-secondary" style="padding:5px 8px;font-size:11px;" onclick="viewVoucher('${b.id}')" title="View Voucher">Voucher</button>
            <button type="button" class="btn btn-secondary" style="padding:5px 8px;font-size:11px;border-color:var(--gold);color:var(--gold);" onclick="openInvoiceModal('${b.id}')" title="Email Tax Invoice">📄 Inv</button>
            <button type="button" class="btn btn-secondary" style="padding:5px 8px;font-size:11px;border-color:rgba(239,68,68,0.4);color:#f87171;" onclick="deleteBooking('${b.id}', '${b.confirmation_code}')" title="Delete Booking">🗑️</button>
          </div>
        </td>
      </tr>
    `;
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

function copyDriverJobSheet(bookingId) {
  const b = App.bookings.find(x => x.id === bookingId);
  if (!b) return;
  const lines = [
    `🚘 *GA CHAUFFEUR SERVICES — JOB SHEET (${b.confirmation_code})*`,
    `📅 *Pickup Time:* ${b.pickup_datetime}`,
    `👤 *Passenger:* ${b.customer_name} (${b.customer_phone})`,
    `👥 *Pax / Bags:* ${b.passenger_count || 1} Pax, ${b.luggage_count || 0} Bags`,
    `🟢 *Pickup:* ${b.pickup_address}`,
    `🏁 *Destination:* ${b.dropoff_address}`,
    b.flight_number ? `✈️ *Flight:* ${b.flight_number}` : null,
    b.special_requests ? `📝 *Notes:* ${b.special_requests}` : null,
    b.chauffeur_name ? `🚗 *Assigned:* ${b.chauffeur_name} — ${b.vehicle_model} [${b.license_plate}]` : null
  ].filter(Boolean).join('\n');
  navigator.clipboard?.writeText(lines);
  showToast('📋 Driver Run Sheet copied for WhatsApp / SMS!');
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
  document.getElementById('fm-class').value = ch.vehicle_class || 'mercedes_s_class';
  const titleEl = document.getElementById('fleet-form-title');
  if (titleEl) titleEl.textContent = `✏️ Editing ${ch.name} [${ch.license_plate}]`;
}

function renderFleetManageList() {
  const container = document.getElementById('fleet-manage-list');
  if (!container) return;
  container.innerHTML = App.chauffeurs.map(ch => `
    <div style="background:#141b18;border:1px solid var(--border);border-radius:6px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;">
      <div>
        <div style="font-weight:700;color:#fff;font-size:13.5px;">👤 ${escapeHtml(ch.name)} <span style="color:var(--gold);font-family:monospace;">[${escapeHtml(ch.license_plate)}]</span></div>
        <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(ch.vehicle_model)} • 📞 ${escapeHtml(ch.phone)}</div>
      </div>
      <div style="display:flex;gap:6px;">
        <button type="button" class="btn btn-secondary" style="padding:5px 10px;font-size:11.5px;" onclick="editFleetChauffeur('${escapeHtml(ch.id)}')">✏️ Edit</button>
        <button type="button" class="btn btn-secondary" style="padding:5px 10px;font-size:11.5px;border-color:rgba(239,68,68,0.4);color:#f87171;" onclick="deleteFleetChauffeur('${escapeHtml(ch.id)}')">🗑️</button>
      </div>
    </div>
  `).join('');
}

async function saveFleetChauffeur(e) {
  e.preventDefault();
  const payload = {
    id: document.getElementById('fm-id').value,
    name: document.getElementById('fm-name').value,
    phone: document.getElementById('fm-phone').value,
    vehicle_model: document.getElementById('fm-model').value,
    license_plate: document.getElementById('fm-plate').value,
    vehicle_class: document.getElementById('fm-class').value
  };
  try {
    const res = await fetch('/api/chauffeurs/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('🚘 Fleet vehicle & chauffeur saved!');
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

async function deleteBooking(bookingId, code) {
  if (!confirm(`Delete booking ${code || bookingId}?`)) return;
  try {
    const res = await fetch(`/api/bookings/${bookingId}/delete`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`Booking ${code || bookingId} deleted.`);
      loadData();
    } else {
      alert(data.error || 'Could not delete booking');
    }
  } catch (err) {
    alert('Failed to delete booking');
  }
}

async function clearAllBookings() {
  if (!confirm('Delete all bookings from the Dispatch Console so your job board is completely clean?')) return;
  try {
    const res = await fetch('/api/bookings/clear-all', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('All bookings cleared from Dispatch Console.');
      loadData();
    } else {
      alert(data.error || 'Could not clear bookings');
    }
  } catch (err) {
    alert('Failed to clear bookings');
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
      <strong>${booking.confirmation_code}</strong>: ${booking.customer_name}<br>
      ${booking.pickup_address} &rarr; ${booking.dropoff_address}
    `;
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

  if (assignedJobs.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
        <div style="font-size: 36px; margin-bottom: 10px;">🟢</div>
        <h3 style="color: #fff; margin-bottom: 6px;">${escapeHtml(ch.name)} • ${escapeHtml(ch.vehicle_model)} [${escapeHtml(ch.license_plate)}]</h3>
        <p style="font-size: 13px;">Currently Available &amp; Ready for Assigned Runs</p>
      </div>
    `;
    return;
  }

  const driverStages = [
    { action: 'CONFIRMED', match: ['PENDING', 'ASSIGNED', 'CONFIRMED', 'ACCEPTED'], label: '1. ✓ Confirmed' },
    { action: 'EN_ROUTE_PICKUP', match: ['EN_ROUTE'], label: '2. 🚗 En Route to Pickup' },
    { action: 'ARRIVED', match: ['ARRIVED'], label: '3. 📍 At Pickup (Nameboard Active)' },
    { action: 'ON_BOARD', match: ['ON_BOARD'], label: '4. 🟢 Passenger On Board' },
    { action: 'NEXT_STOP', match: ['NEXT_STOP'], label: '5. ➡️ Proceeding to Next Stop' },
    { action: 'COMPLETED', match: ['COMPLETED'], label: '6. 🏁 Job Finished & Complete' }
  ];

  container.innerHTML = assignedJobs.map(b => {
    const cleanPhone = (b.customer_phone || '').replace(/[^0-9+]/g, '');
    const mapsPu = `https://maps.apple.com/?q=${encodeURIComponent(b.pickup_address || '')}`;
    const mapsDo = `https://maps.apple.com/?q=${encodeURIComponent(b.dropoff_address || '')}`;

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
            <a href="${mapsPu}" target="_blank" style="color: #38bdf8; font-size: 11.5px; text-decoration: none; font-weight: 700;">Navigate in Maps ↗</a>
          </div>
          <div style="color: #fff; margin: 3px 0 10px;">${escapeHtml(b.pickup_address)}</div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #38bdf8; font-weight: 700; font-size: 11px;">DESTINATION:</span>
            <a href="${mapsDo}" target="_blank" style="color: #38bdf8; font-size: 11.5px; text-decoration: none; font-weight: 700;">Navigate in Maps ↗</a>
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
  if (vSelect) vSelect.addEventListener('change', () => { checkCapacity(); updatePricePreview(); });
  if (passSelect) passSelect.addEventListener('change', checkCapacity);
  if (lgCases) lgCases.addEventListener('change', checkCapacity);

  // Check vehicle passenger & luggage capacity
  function checkCapacity() {
    const pax = parseInt(passSelect ? passSelect.value : 1);
    const large = parseInt(lgCases ? lgCases.value : 0);
    const v = vSelect ? vSelect.value : 'mercedes_s_class';

    if (pax > 4 || large > 2) {
      if (v === 'mercedes_s_class') {
        vSelect.value = 'mercedes_v_class';
        showToast('Switched to Mercedes-Benz V-Class for 5+ passengers / extra luggage');
      }
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

// Tax Invoice & Invoice2go Sync Modal
let activeInvoiceBookingId = null;

async function openInvoiceModal(bookingId) {
  try {
    const res = await fetch(`/api/bookings/${bookingId}`);
    const data = await res.json();
    if (!data.booking) return;

    const b = data.booking;
    activeInvoiceBookingId = b.id;
    const body = document.getElementById('invoice-modal-body');
    if (!body) return;

    const net = parseFloat(b.fare_amount || 165.0).toFixed(2);
    const park = parseFloat(b.parking_fee || 0.0).toFixed(2);
    const drop = parseFloat(b.dropoff_fee || 0.0).toFixed(2);
    const cong = parseFloat(b.congestion_charge || 0.0).toFixed(2);
    const vat = ((parseFloat(net) + parseFloat(park) + parseFloat(drop)) * 0.20).toFixed(2);
    const tot = (parseFloat(net) + parseFloat(park) + parseFloat(drop) + parseFloat(vat) + parseFloat(cong)).toFixed(2);

    body.innerHTML = `
      <div style="background: #09090c; border: 1px solid var(--gold-border); border-radius: 10px; padding: 18px; display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--gold-border); padding-bottom: 10px;">
          <div>
            <div style="font-family: var(--font-serif); font-size: 16px; color: #fff; font-weight: 700;">TAX INVOICE: INV-${escapeHtml(b.confirmation_code)}</div>
            <div style="font-size: 12px; color: var(--gold-accent);">GA Chauffeur Services Limited (Company No. 11136878)</div>
          </div>
          <div id="inv-modal-total-top" style="text-align: right; font-size: 20px; font-weight: 700; color: var(--gold-accent); font-family: var(--font-mono);">
            £${tot} GBP
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <label style="font-size: 10px; color: var(--text-dim); text-transform: uppercase;">Billed To</label>
            <div style="font-size: 14px; font-weight: 700; color: #fff;">${escapeHtml(b.customer_name)}</div>
          </div>
          <div>
            <label style="font-size: 10px; color: var(--text-dim); text-transform: uppercase;">Recipient Email</label>
            <input type="email" id="inv-email" value="${escapeHtml(b.customer_email)}" style="width: 100%; background: #141418; border: 1px solid var(--border); color: #fff; padding: 6px 10px; border-radius: 4px; font-size: 12px; margin-top: 2px;">
          </div>
        </div>

        <div style="background: #141418; padding: 10px 12px; border-radius: 6px; font-size: 12px;">
          <div style="color: var(--gold-accent); font-weight: 700;">JOURNEY (${escapeHtml(b.pickup_datetime)}):</div>
          <div style="color: #fff; margin-top: 2px;">${escapeHtml(b.pickup_address)} &rarr; ${escapeHtml(b.dropoff_address)}</div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <label style="font-size: 11px; color: var(--text-muted);">Base Journey Fare (£)</label>
            <input type="number" step="0.01" id="inv-net" value="${net}" oninput="recalcInvoiceModal()" style="width: 100%; background: #141418; border: 1px solid var(--border); color: #fff; padding: 8px 10px; border-radius: 4px; font-size: 13px; margin-top: 4px;">
          </div>
          <div>
            <label style="font-size: 11px; color: var(--text-muted);">Airport Parking / Meet (£)</label>
            <input type="number" step="0.01" id="inv-park" value="${park}" oninput="recalcInvoiceModal()" style="width: 100%; background: #141418; border: 1px solid var(--border); color: #fff; padding: 8px 10px; border-radius: 4px; font-size: 13px; margin-top: 4px;">
          </div>
          <div>
            <label style="font-size: 11px; color: var(--text-muted);">Airport Drop-off Fee (£)</label>
            <input type="number" step="0.01" id="inv-drop" value="${drop}" oninput="recalcInvoiceModal()" style="width: 100%; background: #141418; border: 1px solid var(--border); color: #fff; padding: 8px 10px; border-radius: 4px; font-size: 13px; margin-top: 4px;">
          </div>
          <div>
            <label style="font-size: 11px; color: var(--text-muted);">Congestion Charge (£, No VAT)</label>
            <input type="number" step="0.01" id="inv-cong" value="${cong}" oninput="recalcInvoiceModal()" style="width: 100%; background: #141418; border: 1px solid var(--border); color: #fff; padding: 8px 10px; border-radius: 4px; font-size: 13px; margin-top: 4px;">
          </div>
        </div>

        <div>
          <label style="font-size: 11px; color: var(--text-muted);">Invoice Notes / Extra Mileage or Waiting Time</label>
          <input type="text" id="inv-notes" value="${escapeHtml(b.special_requests || '')}" placeholder="e.g. Corporate Account Invoice — Due on Receipt" style="width: 100%; background: #141418; border: 1px solid var(--border); color: #fff; padding: 8px 10px; border-radius: 4px; font-size: 12px; margin-top: 4px;">
        </div>

        <div style="background: #141418; padding: 10px 12px; border-radius: 6px; font-size: 13px; display: flex; justify-content: space-between; align-items: center;">
          <span style="color: var(--text-muted);">UK VAT (20%): <strong id="inv-vat-disp" style="color: #fff;">£${vat}</strong></span>
          <span style="color: var(--gold-accent); font-weight: 700; font-size: 15px;">Total Invoice: <span id="inv-total-disp">£${tot} GBP</span></span>
        </div>
      </div>
    `;

    document.getElementById('modal-invoice').style.display = 'flex';
  } catch (err) {}
}

function recalcInvoiceModal() {
  const net = parseFloat(document.getElementById('inv-net')?.value || 0);
  const park = parseFloat(document.getElementById('inv-park')?.value || 0);
  const drop = parseFloat(document.getElementById('inv-drop')?.value || 0);
  const cong = parseFloat(document.getElementById('inv-cong')?.value || 0);
  const vat = (net + park + drop) * 0.20;
  const tot = net + park + drop + vat + cong;
  const vEl = document.getElementById('inv-vat-disp');
  const tEl = document.getElementById('inv-total-disp');
  const topEl = document.getElementById('inv-modal-total-top');
  if (vEl) vEl.textContent = `£${vat.toFixed(2)}`;
  if (tEl) tEl.textContent = `£${tot.toFixed(2)} GBP`;
  if (topEl) topEl.textContent = `£${tot.toFixed(2)} GBP`;
}

async function submitSendInvoice() {
  if (!activeInvoiceBookingId) return;
  const btn = document.getElementById('btn-send-invoice-confirm');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sending Invoice...';
  }
  try {
    const payload = {
      recipient_email: document.getElementById('inv-email')?.value || '',
      net_fare: parseFloat(document.getElementById('inv-net')?.value || 0),
      parking_fee: parseFloat(document.getElementById('inv-park')?.value || 0),
      dropoff_fee: parseFloat(document.getElementById('inv-drop')?.value || 0),
      congestion_charge: parseFloat(document.getElementById('inv-cong')?.value || 0),
      notes: document.getElementById('inv-notes')?.value || ''
    };
    const res = await fetch(`/api/bookings/${activeInvoiceBookingId}/send-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      closeModal('modal-invoice');
      showToast(`Invoice ${data.invoice_number} emailed to ${data.recipient}!`);
      loadData();
    } else {
      alert(data.error || 'Could not send invoice.');
    }
  } catch (err) {
    alert('Failed to send invoice.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '📧 Email Tax Invoice & Sync Invoice2go ↗';
    }
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
