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
  allocatingJobId: null,
  activeDriverCarId: 'GA-CHF-01'
};

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initForm();
  initSearch();
  loadData();

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

// Fetch all data from backend
async function loadData() {
  try {
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

    updateTopCarCards();
    renderJobsList();
    renderOutboxTable();
    renderDriverView();
  } catch (err) {
    console.warn('Sync note:', err);
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

// Render Jobs List
function renderJobsList() {
  const container = document.getElementById('jobs-list-container');
  if (!container) return;

  const query = (document.getElementById('jobs-search-input')?.value || '').toLowerCase();

  const filtered = App.bookings.filter(b => {
    // Status Filter
    if (App.activeFilter === 'ACTIVE') {
      if (b.status === 'COMPLETED' || b.status === 'CANCELLED') return false;
    } else if (App.activeFilter === 'PENDING') {
      if (b.chauffeur_id) return false;
    } else if (App.activeFilter === 'COMPLETED') {
      if (b.status !== 'COMPLETED') return false;
    }

    // Text Search
    if (!query) return true;
    return b.customer_name.toLowerCase().includes(query) ||
           b.confirmation_code.toLowerCase().includes(query) ||
           b.pickup_address.toLowerCase().includes(query) ||
           b.dropoff_address.toLowerCase().includes(query);
  });

  // Update badge count
  const activeCount = App.bookings.filter(b => b.status !== 'COMPLETED' && b.status !== 'CANCELLED').length;
  const badgeEl = document.getElementById('badge-active-count');
  const mBadgeEl = document.getElementById('m-jobs-count');
  if (badgeEl) badgeEl.textContent = activeCount;
  if (mBadgeEl) mBadgeEl.textContent = activeCount;

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
    
    // Determine the next live action button
    let actionBtnHtml = '';
    if (!isAllocated) {
      actionBtnHtml = `
        <button class="btn-live-action allocate" onclick="openAllocateModal('${b.id}')">
          Allocate Car &rarr;
        </button>
      `;
    } else if (b.status === 'CONFIRMED' || b.status === 'ASSIGNED' || b.status === 'ACCEPTED') {
      actionBtnHtml = `
        <button class="btn-live-action en_route" onclick="triggerAction('${b.id}', 'EN_ROUTE_PICKUP')">
          Driver En Route &rarr;
        </button>
      `;
    } else if (b.status === 'EN_ROUTE') {
      actionBtnHtml = `
        <button class="btn-live-action arrived" onclick="triggerAction('${b.id}', 'ARRIVED')">
          Arrived at Pickup &rarr;
        </button>
      `;
    } else if (b.status === 'ARRIVED') {
      actionBtnHtml = `
        <button class="btn-live-action on_board" onclick="triggerAction('${b.id}', 'ON_BOARD')">
          Passenger On Board &rarr;
        </button>
      `;
    } else if (b.status === 'ON_BOARD') {
      actionBtnHtml = `
        <button class="btn-live-action completed" onclick="triggerAction('${b.id}', 'COMPLETED')">
          Complete Journey ✓
        </button>
      `;
    }

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
            ` : b.payment_status === 'PAID' ? `
              <span style="background: rgba(52, 211, 153, 0.15); border: 1px solid rgba(52, 211, 153, 0.4); color: #34d399; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 4px;">
                ✓ PAID
              </span>
            ` : ''}
          </div>

          <div class="action-btn-group">
            <button class="btn btn-secondary" onclick="viewVoucher('${b.id}')">Voucher</button>
            ${b.payment_status === 'PRE_AUTHORIZED' ? `<button class="btn btn-secondary" onclick="captureBookingPayment('${b.id}', ${b.total_fare})" style="border-color: #4ade80; color: #4ade80; font-weight: 600;" title="Capture pre-authorised hold">💳 Capture £${parseFloat(b.total_fare).toFixed(2)}</button>` : ''}
            ${!isCompleted ? actionBtnHtml : '<span style="color: var(--status-green); font-weight: 700;">Completed ✓</span>'}
          </div>
        </div>
      </div>
    `;
  }).join('');
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

  const activeBooking = App.bookings.find(b => b.chauffeur_id === ch.id && b.status !== 'COMPLETED' && b.status !== 'CANCELLED');

  if (!activeBooking) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
        <div style="font-size: 36px; margin-bottom: 10px;">🟢</div>
        <h3 style="color: #fff; margin-bottom: 6px;">${escapeHtml(ch.vehicle_model)}</h3>
        <p style="font-size: 13px;">Currently Available &amp; Ready for VIP Jobs</p>
      </div>
    `;
    return;
  }

  const b = activeBooking;
  let nextBtn = '';

  if (b.status === 'ASSIGNED' || b.status === 'CONFIRMED') {
    nextBtn = `<button class="btn btn-gold btn-block" onclick="triggerAction('${b.id}', 'EN_ROUTE_PICKUP')">🚗 Start En Route to Pickup</button>`;
  } else if (b.status === 'EN_ROUTE') {
    nextBtn = `<button class="btn btn-gold btn-block" onclick="triggerAction('${b.id}', 'ARRIVED')">📍 Arrived at Pickup (Display Nameboard)</button>`;
  } else if (b.status === 'ARRIVED') {
    nextBtn = `<button class="btn btn-gold btn-block" onclick="triggerAction('${b.id}', 'ON_BOARD')">👥 Passenger Boarded (Start Trip)</button>`;
  } else if (b.status === 'ON_BOARD') {
    nextBtn = `<button class="btn btn-gold btn-block" onclick="triggerAction('${b.id}', 'COMPLETED')">✓ Complete Journey</button>`;
  }

  container.innerHTML = `
    <div style="background: #111116; border: 1px solid var(--gold-border); border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 14px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span class="job-ref-code">${b.confirmation_code}</span>
        <span class="status-badge ${b.status.toLowerCase()}">${b.status.replace('_', ' ')}</span>
      </div>

      <div>
        <div style="font-size: 20px; font-weight: 700; color: #fff;">${escapeHtml(b.customer_name)}</div>
        <div style="font-size: 13px; color: var(--gold-accent); margin-top: 2px;">📞 ${escapeHtml(b.customer_phone)}</div>
      </div>

      <div style="background: #09090c; border-radius: 8px; padding: 12px; font-size: 13px;">
        <div style="color: var(--gold-accent); font-weight: 700; font-size: 11px;">PICKUP:</div>
        <div style="color: #fff; margin-bottom: 8px;">${escapeHtml(b.pickup_address)}</div>
        <div style="color: #38bdf8; font-weight: 700; font-size: 11px;">DESTINATION:</div>
        <div style="color: #fff;">${escapeHtml(b.dropoff_address)}</div>
      </div>

      <div style="margin-top: 10px;">
        ${nextBtn}
      </div>
    </div>
  `;
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
  setupAutocomplete(pInput, pDropdown, 'pickup');
  setupAutocomplete(dInput, dDropdown, 'dropoff');

  function setupAutocomplete(input, dropdown, field) {
    if (!input || !dropdown) return;
    let timer;

    input.addEventListener('input', () => {
      clearTimeout(timer);
      const val = input.value.trim();
      autoDetectServiceType();
      updatePricePreview();

      if (val.length < 2) {
        dropdown.style.display = 'none';
        return;
      }

      timer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/suggestions?q=${encodeURIComponent(val)}`);
          const data = await res.json();
          const items = data.suggestions || [];

          if (items.length === 0) {
            dropdown.style.display = 'none';
            return;
          }

          dropdown.innerHTML = items.map(item => `
            <div class="autocomplete-item" onclick="applySuggestion('${field}', '${escapeHtml(item.title + ', ' + item.subtitle)}')">
              <span class="auto-icon">${item.category === 'airport' ? '✈️' : item.category === 'hotel' ? '🏨' : '📍'}</span>
              <div class="auto-text">
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.subtitle)}</span>
              </div>
            </div>
          `).join('');
          dropdown.style.display = 'block';
        } catch (e) {
          dropdown.style.display = 'none';
        }
      }, 150);
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
    const hours = hoursSelect ? hoursSelect.value : 2;
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
        alert('Network error submitting job');
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
    input.value = text;
    if (dropdown) dropdown.style.display = 'none';
    input.dispatchEvent(new Event('input', { bubbles: true }));
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

  tbody.innerHTML = App.confirmations.map(c => `
    <tr>
      <td><span style="color: var(--status-green); font-weight: 700;">Delivered</span></td>
      <td><strong>${escapeHtml(c.recipient)}</strong></td>
      <td><span style="font-family: var(--font-mono); color: var(--gold-accent);">${escapeHtml(c.confirmation_code || '-')}</span></td>
      <td style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(c.subject)}</td>
      <td style="font-size: 11px; color: var(--text-dim);">${escapeHtml(c.sent_at)}</td>
      <td>
        <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px;" onclick="resendConf('${c.id}')">Resend</button>
      </td>
    </tr>
  `).join('');
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
    .replace(/"/g, '&quot;');
}
