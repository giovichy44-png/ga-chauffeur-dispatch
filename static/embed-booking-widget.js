/**
 * GA Chauffeur Services Limited - Official Website Booking Widget
 * Website: gachauffeurs.co.uk
 * Office: 1 Glebe Road, Stanmore, Greater London, HA7 4EJ
 * Direct Phone: +44 7886 622082 | Email: enquiries@gachauffeurs.co.uk
 * 
 * Embed on gachauffeurs.co.uk:
 * <div id="ga-chauffeur-booking-widget"></div>
 * <script src="https://dispatch.gachauffeurs.co.uk/embed-booking-widget.js"></script>
 */

(function() {
  const container = document.getElementById('ga-chauffeur-booking-widget');
  if (!container) return;

  const API_BASE = window.GA_DISPATCH_API_URL || 'https://dispatch.gachauffeurs.co.uk';

  container.innerHTML = `
    <div id="ga-widget-root" style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #171f1b; color: #edf0ea; border: 1px solid #2e3b33; border-radius: 6px; padding: 32px 28px; max-width: 720px; margin: 0 auto; box-shadow: 0 20px 45px rgba(0,0,0,0.45); text-align: left; box-sizing: border-box;">
      
      <!-- GA Brand Header -->
      <div style="text-align: center; margin-bottom: 24px; border-bottom: 1px solid #2e3b33; padding-bottom: 20px;">
        <div style="display: inline-flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 12px;">
          <span style="font-family: Georgia, serif; font-size: 34px; letter-spacing: -4px; color: #c9b894; line-height: 1;">GA</span>
          <span style="font-size: 11px; letter-spacing: .18em; text-transform: uppercase; border-left: 1px solid #3e4e44; padding-left: 12px; color: #d0d8d1; text-align: left; line-height: 1.4;">Chauffeur<br>Services</span>
        </div>
        <span style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .22em; color: #c9b894; font-weight: 600; margin-bottom: 4px;">Direct Chauffeur Booking</span>
        <h2 style="font-family: Georgia, serif; font-size: 26px; font-weight: normal; color: #ffffff; margin: 0 0 6px 0;">Request a Booking</h2>
        <p style="margin: 0; color: #aab5ae; font-size: 14px;">Real-time quote with VAT breakdown &amp; instant booking reference (GA-XXXXX)</p>
      </div>

      <form id="ga-widget-form" style="display: flex; flex-direction: column; gap: 18px;" autocomplete="off">
        
        <!-- Service Type Selector & Auto Badge -->
        <div style="display: grid; grid-template-columns: 1fr; gap: 12px;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="font-size: 11px; text-transform: uppercase; letter-spacing: .14em; color: #c9b894; font-weight: 600;">Service Type *</label>
              <span id="ga-service-badge" style="font-size: 10px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: #38bdf8; background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.3); padding: 2px 8px; border-radius: 3px;">AUTO-DETECTED</span>
            </div>
            <select id="ga-service-type" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 11px 14px; color: #fff; font-size: 14px; font-family: inherit;">
              <option value="Airport arrival">Airport arrival (Heathrow, Gatwick, Luton, City, Stansted, Farnborough)</option>
              <option value="Airport departure">Airport departure</option>
              <option value="Point-to-point transfer">Point-to-point transfer</option>
              <option value="Hourly chauffeur service">Hourly chauffeur service (As Directed)</option>
            </select>
          </div>

          <!-- Hours Selector (for Hourly Service) -->
          <div id="ga-wrap-hours" style="display: none; background: #1c2420; border: 1px solid #2e3b33; border-radius: 4px; padding: 12px 14px;">
            <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">Hours of Service (Minimum 2 Hours) *</label>
            <select id="ga-hours" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #c9b894; border-radius: 4px; padding: 10px 14px; color: #fff; font-size: 13px; font-family: inherit;">
              <option value="2">2 Hours (Minimum: £170 S / £190 V / £230 RR + VAT)</option>
              <option value="3">3 Hours</option>
              <option value="4">4 Hours (Half Day: £340 S / £380 V / £460 RR + VAT)</option>
              <option value="5">5 Hours</option>
              <option value="6">6 Hours</option>
              <option value="8">8 Hours</option>
              <option value="10">10 Hours (Full Day: £850 S / £900 V / £1,150 RR + VAT)</option>
              <option value="12">12 Hours (Extended: £960 S / £1,080 V / £1,380 RR + VAT)</option>
            </select>
          </div>
        </div>

        <!-- Passenger Contact -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
          <div>
            <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">Passenger Full Name *</label>
            <input type="text" id="ga-name" required placeholder="e.g. Lord Henry Cavendish" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 11px 14px; color: #fff; font-size: 14px; font-family: inherit;">
          </div>
          <div>
            <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">Mobile Phone (for driver SMS) *</label>
            <input type="tel" id="ga-phone" required placeholder="+44 7886 622082" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 11px 14px; color: #fff; font-size: 14px; font-family: inherit;">
          </div>
        </div>

        <div>
          <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">Email Address (for instant confirmation voucher) *</label>
          <input type="email" id="ga-email" required placeholder="client@company.co.uk" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 11px 14px; color: #fff; font-size: 14px; font-family: inherit;">
        </div>

        <!-- Route with Autocomplete Dropdown & Unit Details -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
          
          <!-- Pickup -->
          <div style="position: relative;">
            <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">Collection Point (Type LHR, T5 or Postcode) *</label>
            <input type="text" id="ga-pickup" required placeholder="e.g. LHR, T5, or Postcode" autocomplete="off" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 11px 14px; color: #fff; font-size: 14px; font-family: inherit;">
            <div id="ga-dropdown-pickup" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: #171f1b; border: 1px solid #c9b894; border-radius: 4px; z-index: 1000; max-height: 240px; overflow-y: auto; box-shadow: 0 10px 25px rgba(0,0,0,0.6);"></div>

            <input type="text" id="ga-pickup-unit" placeholder="House / Flat / Terminal (e.g. No. 12 or T5 Windsor Suite)" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 8px 12px; color: #cbd5e1; font-size: 12px; font-family: inherit; margin-top: 6px;">

            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px;">
              <span class="ga-chip" onclick="window.gaSetVal('ga-pickup', 'Heathrow Airport (LHR) Terminal 5, TW6 2GA')">Heathrow T5</span>
              <span class="ga-chip" onclick="window.gaSetVal('ga-pickup', 'Heathrow Airport (LHR) Terminal 2, TW6 1EW')">Heathrow T2</span>
              <span class="ga-chip" onclick="window.gaSetVal('ga-pickup', 'Gatwick Airport (LGW) South Terminal, RH6 0NP')">Gatwick</span>
              <span class="ga-chip" onclick="window.gaSetVal('ga-pickup', '1 Glebe Road, Stanmore, Greater London, HA7 4EJ')">Stanmore Base</span>
            </div>
          </div>

          <!-- Dropoff -->
          <div style="position: relative;">
            <label id="ga-lbl-dropoff" style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">Destination / Drop-off Location *</label>
            <input type="text" id="ga-dropoff" required placeholder="e.g. The Connaught, Mayfair" autocomplete="off" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 11px 14px; color: #fff; font-size: 14px; font-family: inherit;">
            <div id="ga-dropdown-dropoff" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: #171f1b; border: 1px solid #c9b894; border-radius: 4px; z-index: 1000; max-height: 240px; overflow-y: auto; box-shadow: 0 10px 25px rgba(0,0,0,0.6);"></div>

            <input type="text" id="ga-dropoff-unit" placeholder="House / Flat / Building Unit (optional)" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 8px 12px; color: #cbd5e1; font-size: 12px; font-family: inherit; margin-top: 6px;">

            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px;">
              <span class="ga-chip" onclick="window.gaSetVal('ga-dropoff', 'The Connaught, Carlos Place, Mayfair, London W1K 2AL')">The Connaught</span>
              <span class="ga-chip" onclick="window.gaSetVal('ga-dropoff', 'The Dorchester, 53 Park Lane, Mayfair, London W1K 1QA')">The Dorchester</span>
              <span class="ga-chip" onclick="window.gaSetVal('ga-dropoff', 'Canary Wharf, One Canada Square, London E14 5AA')">Canary Wharf</span>
              <span class="ga-chip" onclick="window.gaSetVal('ga-dropoff', 'Farnborough Airport (FAB), Signature Aviation, GU14 6XA')">Farnborough FBO</span>
            </div>
          </div>
        </div>

        <!-- Date & Flight -->
        <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 14px;">
          <div>
            <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">Pickup Date &amp; Time *</label>
            <input type="datetime-local" id="ga-datetime" required style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 11px 14px; color: #fff; font-size: 14px; font-family: inherit;">
          </div>
          <div>
            <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">Flight Number (45m free wait)</label>
            <input type="text" id="ga-flight" placeholder="e.g. BA 178" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 11px 14px; color: #fff; font-size: 14px; font-family: inherit;">
          </div>
        </div>

        <!-- 3 REAL GA CHAUFFEUR VEHICLES -->
        <div>
          <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">Preferred Vehicle *</label>
          <select id="ga-vehicle" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #c9b894; border-radius: 4px; padding: 12px 14px; color: #fff; font-size: 14px; font-weight: 600; font-family: inherit;">
            <option value="mercedes_s_class">Mercedes-Benz S-Class (Saloon • 4 Passengers, 2 Large Bags)</option>
            <option value="mercedes_v_class">Mercedes-Benz V-Class (Luxury MPV • 6-Seater, 6 Large Bags)</option>
            <option value="range_rover_autobiography">Range Rover Autobiography LWB (Prestige 4x4 • 4 Passengers, 3 Bags)</option>
          </select>
        </div>

        <!-- Passengers & Luggage Breakdown -->
        <div style="background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 14px 16px; display: grid; grid-template-columns: 1fr 1.6fr; gap: 14px;">
          <div>
            <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">Passengers *</label>
            <select id="ga-passengers" style="width: 100%; box-sizing: border-box; background: #171f1b; border: 1px solid #2e3b33; border-radius: 4px; padding: 9px 12px; color: #fff; font-size: 13px; font-family: inherit;">
              <option value="1">1 Adult</option>
              <option value="2">2 Adults</option>
              <option value="3">3 Adults</option>
              <option value="4">4 Adults</option>
              <option value="5">5 Adults (V-Class)</option>
              <option value="6">6 Adults (V-Class)</option>
            </select>
          </div>

          <div>
            <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">Luggage (Large / Med / Hand)</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
              <div>
                <select id="ga-large-cases" style="width: 100%; box-sizing: border-box; background: #171f1b; border: 1px solid #2e3b33; border-radius: 4px; padding: 8px; color: #fff; font-size: 12px;">
                  <option value="0">0 Large</option>
                  <option value="1">1 Large</option>
                  <option value="2" selected>2 Large</option>
                  <option value="3">3 Large</option>
                  <option value="4">4 Large</option>
                  <option value="5">5 Large</option>
                  <option value="6">6 Large</option>
                </select>
              </div>
              <div>
                <select id="ga-medium-cases" style="width: 100%; box-sizing: border-box; background: #171f1b; border: 1px solid #2e3b33; border-radius: 4px; padding: 8px; color: #fff; font-size: 12px;">
                  <option value="0">0 Med</option>
                  <option value="1" selected>1 Med</option>
                  <option value="2">2 Med</option>
                  <option value="3">3 Med</option>
                </select>
              </div>
              <div>
                <select id="ga-hand-luggage" style="width: 100%; box-sizing: border-box; background: #171f1b; border: 1px solid #2e3b33; border-radius: 4px; padding: 8px; color: #fff; font-size: 12px;">
                  <option value="0">0 Hand</option>
                  <option value="1">1 Hand</option>
                  <option value="2" selected>2 Hand</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">Special Requests / Chauffeur Instructions</label>
          <input type="text" id="ga-notes" placeholder="e.g. Nameboard meet & greet, baby seat, extra luggage assistance" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 11px 14px; color: #fff; font-size: 14px; font-family: inherit;">
        </div>

        <!-- Live Price Box with Exact VAT & Disclaimers -->
        <div id="ga-price-box" style="background: #1c2420; border: 1px solid rgba(201, 184, 148, 0.35); border-radius: 4px; padding: 18px 20px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span id="ga-service-label-display" style="font-size: 11px; color: #c9b894; text-transform: uppercase; letter-spacing: .16em; font-weight: 600;">HEATHROW / LONDON CITY AIRPORT</span>
              <div style="font-size: 12px; color: #aab5ae; margin-top: 2px;">Includes meet &amp; greet, 45m flight wait time &amp; in-vehicle amenities</div>
            </div>
            <div style="text-align: right;">
              <div id="ga-price-total" style="font-family: Georgia, serif; font-size: 26px; font-weight: 600; color: #c9b894;">£198.00</div>
              <div id="ga-price-breakdown" style="font-size: 12px; color: #aab5ae;">£165.00 + £33.00 VAT (20%)</div>
            </div>
          </div>
          <div style="border-top: 1px solid #2e3b33; padding-top: 8px; font-size: 11px; color: #aab5ae; line-height: 1.5;">
            ⚠️ <strong>Additional Charges:</strong> Parking, airport drop-off, and Congestion Charge are extra and will be added where applicable.
          </div>
        </div>

        <button type="submit" id="ga-submit-btn" style="background: #c9b894; color: #171f1b; font-family: 'DM Sans', sans-serif; font-weight: 600; font-size: 14px; padding: 15px 22px; border: 1px solid #c9b894; border-radius: 4px; cursor: pointer; margin-top: 4px; transition: all 0.2s ease;">
          Request Journey Reservation ↗
        </button>
      </form>

      <div id="ga-result-box" style="display: none; margin-top: 20px; padding: 26px; background: #1c2420; border: 1px solid #34d399; border-radius: 4px; text-align: center;">
      </div>
    </div>
    
    <style>
      .ga-chip {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid #2e3b33;
        color: #aab5ae;
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 3px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .ga-chip:hover {
        background: rgba(201, 184, 148, 0.15);
        border-color: #c9b894;
        color: #c9b894;
      }
      .ga-item {
        padding: 10px 14px;
        border-bottom: 1px solid #2e3b33;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: background 0.15s ease;
      }
      .ga-item:hover {
        background: #222c27;
      }
      .ga-item:last-child {
        border-bottom: none;
      }
    </style>
  `;

  const dtInput = document.getElementById('ga-datetime');
  if (dtInput) {
    const d = new Date(Date.now() + 2 * 3600000);
    dtInput.value = d.toISOString().slice(0, 16);
  }

  const pInput = document.getElementById('ga-pickup');
  const dInput = document.getElementById('ga-dropoff');
  const pDropdown = document.getElementById('ga-dropdown-pickup');
  const dDropdown = document.getElementById('ga-dropdown-dropoff');

  const sTypeSelect = document.getElementById('ga-service-type');
  const hoursSelect = document.getElementById('ga-hours');
  const wrapHours = document.getElementById('ga-wrap-hours');
  const sBadge = document.getElementById('ga-service-badge');

  const vSelect = document.getElementById('ga-vehicle');
  const passSelect = document.getElementById('ga-passengers');
  const lgCases = document.getElementById('ga-large-cases');
  const medCases = document.getElementById('ga-medium-cases');
  const handLug = document.getElementById('ga-hand-luggage');

  // Autocomplete functionality
  setupWidgetAutocomplete(pInput, pDropdown, 'ga-pickup');
  setupWidgetAutocomplete(dInput, dDropdown, 'ga-dropoff');

  function setupWidgetAutocomplete(input, dropdown, targetId) {
    if (!input || !dropdown) return;
    let timer;

    input.addEventListener('input', () => {
      clearTimeout(timer);
      const val = input.value.trim();
      autoDetectServiceType();
      updateWidgetQuote();

      if (val.length < 2) {
        dropdown.style.display = 'none';
        return;
      }

      timer = setTimeout(async () => {
        try {
          const res = await fetch(`${API_BASE}/api/suggestions?q=${encodeURIComponent(val)}`);
          const data = await res.json();
          const items = data.suggestions || [];

          if (items.length === 0) {
            dropdown.style.display = 'none';
            return;
          }

          dropdown.innerHTML = items.map(item => `
            <div class="ga-item" onclick="window.gaSetVal('${targetId}', '${escapeQuote(item.title + ', ' + item.subtitle)}')">
              <span>${item.category === 'airport' ? '✈️' : '📍'}</span>
              <div>
                <strong style="display: block; font-size: 13px; color: #fff;">${item.title}</strong>
                <span style="font-size: 11px; color: #aab5ae;">${item.subtitle}</span>
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

  function escapeQuote(str) {
    return str.replace(/'/g, "\\'");
  }

  window.gaSetVal = function(id, val) {
    const el = document.getElementById(id);
    if (el) {
      el.value = val;
      const dd = document.getElementById(id === 'ga-pickup' ? 'ga-dropdown-pickup' : 'ga-dropdown-dropoff');
      if (dd) dd.style.display = 'none';
      autoDetectServiceType();
      updateWidgetQuote();
    }
  };

  // Automatic Service Type Detection
  function autoDetectServiceType() {
    if (!sTypeSelect) return;
    if (sTypeSelect.value === 'Hourly chauffeur service') return;

    const p = (pInput ? pInput.value : '').toLowerCase();
    const d = (dInput ? dInput.value : '').toLowerCase();
    const combined = p + ' ' + d;

    const airportKws = ['lhr', 't5', 't2', 't3', 't4', 'heathrow', 'gatwick', 'lgw', 'city airport', 'lcy', 'luton', 'ltn', 'stansted', 'stn', 'farnborough', 'fab', 'biggin', 'airport', 'terminal'];

    const isAirport = airportKws.some(k => combined.includes(k));
    if (isAirport) {
      if (airportKws.some(k => p.includes(k))) {
        sTypeSelect.value = 'Airport arrival';
      } else {
        sTypeSelect.value = 'Airport departure';
      }
      if (sBadge) {
        sBadge.textContent = 'AIRPORT';
        sBadge.style.color = '#38bdf8';
      }
    } else if (p && d) {
      sTypeSelect.value = 'Point-to-point transfer';
      if (sBadge) {
        sBadge.textContent = 'POINT-TO-POINT';
        sBadge.style.color = '#34d399';
      }
    }
  }

  if (sTypeSelect) {
    sTypeSelect.addEventListener('change', () => {
      const isHourly = sTypeSelect.value === 'Hourly chauffeur service';
      if (wrapHours) wrapHours.style.display = isHourly ? 'block' : 'none';
      const lblDrop = document.getElementById('ga-lbl-dropoff');
      if (lblDrop) {
        lblDrop.textContent = isHourly ? 'Disposal Destination (e.g. As Directed / Central London)' : 'Destination / Drop-off Location *';
      }
      if (isHourly && dInput && !dInput.value) {
        dInput.value = 'As Directed / Central London';
      }
      updateWidgetQuote();
    });
  }

  if (hoursSelect) hoursSelect.addEventListener('change', updateWidgetQuote);

  function checkVehicleCapacity() {
    const pax = parseInt(passSelect ? passSelect.value : 1);
    const large = parseInt(lgCases ? lgCases.value : 0);
    const v = vSelect ? vSelect.value : 'mercedes_s_class';

    if ((pax > 4 || large > 2) && v === 'mercedes_s_class') {
      vSelect.value = 'mercedes_v_class';
    }
  }

  if (vSelect) vSelect.addEventListener('change', () => { checkVehicleCapacity(); updateWidgetQuote(); });
  if (passSelect) passSelect.addEventListener('change', () => { checkVehicleCapacity(); updateWidgetQuote(); });
  if (lgCases) lgCases.addEventListener('change', () => { checkVehicleCapacity(); updateWidgetQuote(); });

  // Update Quote
  async function updateWidgetQuote() {
    const v = vSelect ? vSelect.value : 'mercedes_s_class';
    const sType = sTypeSelect ? sTypeSelect.value : 'Airport arrival';
    const hours = hoursSelect ? hoursSelect.value : 2;
    const p = pInput ? pInput.value : '';
    const d = dInput ? dInput.value : '';

    try {
      const res = await fetch(`${API_BASE}/api/quote?vehicle=${v}&service_type=${encodeURIComponent(sType)}&hours=${hours}&pickup=${encodeURIComponent(p)}&dropoff=${encodeURIComponent(d)}`);
      const q = await res.json();

      const totalEl = document.getElementById('ga-price-total');
      const subEl = document.getElementById('ga-price-breakdown');
      const labelEl = document.getElementById('ga-service-label-display');

      if (totalEl) totalEl.textContent = `£${q.total_fare.toFixed(2)}`;
      if (subEl) subEl.textContent = `£${q.net_fare.toFixed(2)} + £${q.vat_amount.toFixed(2)} VAT (20%)`;
      if (labelEl) labelEl.textContent = q.service_label ? q.service_label.toUpperCase() : 'ESTIMATED JOURNEY FARE';
    } catch (e) {
      // Offline fallback
      let net = 165.0;
      if (v === 'mercedes_v_class') net = 175.0;
      if (v === 'range_rover_autobiography') net = 225.0;
      const vat = net * 0.20;
      const total = net + vat;

      const totalEl = document.getElementById('ga-price-total');
      const subEl = document.getElementById('ga-price-breakdown');
      if (totalEl) totalEl.textContent = `£${total.toFixed(2)}`;
      if (subEl) subEl.textContent = `£${net.toFixed(2)} + £${vat.toFixed(2)} VAT (20%)`;
    }
  }

  updateWidgetQuote();

  // Form submission
  const form = document.getElementById('ga-widget-form');
  const submitBtn = document.getElementById('ga-submit-btn');
  const resultBox = document.getElementById('ga-result-box');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering Journey with GA Dispatch...';

    const payload = {
      customer_name: document.getElementById('ga-name').value,
      customer_phone: document.getElementById('ga-phone').value,
      customer_email: document.getElementById('ga-email').value,
      service_type: sTypeSelect ? sTypeSelect.value : 'Airport arrival',
      hours_booked: wrapHours && wrapHours.style.display !== 'none' ? parseInt(hoursSelect.value) : 0,
      pickup_address: pInput.value,
      pickup_unit: document.getElementById('ga-pickup-unit') ? document.getElementById('ga-pickup-unit').value : '',
      dropoff_address: dInput.value,
      dropoff_unit: document.getElementById('ga-dropoff-unit') ? document.getElementById('ga-dropoff-unit').value : '',
      pickup_datetime: dtInput.value.replace('T', ' '),
      flight_number: document.getElementById('ga-flight').value || null,
      vehicle_class: vSelect.value,
      passenger_count: parseInt(passSelect ? passSelect.value : 1),
      large_cases: parseInt(lgCases ? lgCases.value : 0),
      medium_cases: parseInt(medCases ? medCases.value : 0),
      hand_luggage: parseInt(handLug ? handLug.value : 0),
      special_requests: document.getElementById('ga-notes').value || '',
      source: 'WEBSITE_GACHAUFFEURS'
    };

    try {
      const res = await fetch(`${API_BASE}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        form.style.display = 'none';
        resultBox.style.display = 'block';
        resultBox.innerHTML = `
          <div style="font-size: 36px; color: #34d399; margin-bottom: 10px;">✓</div>
          <h3 style="font-family: Georgia, serif; color: #ffffff; margin: 0 0 6px 0; font-size: 22px; font-weight: normal;">Journey Request Confirmed</h3>
          <p style="color: #aab5ae; font-size: 14px; margin: 0 0 18px 0;">
            Your transfer has been received and logged directly into our dispatch control console.
          </p>
          <div style="background: #131916; border: 1px solid #c9b894; border-radius: 4px; padding: 18px; margin-bottom: 18px;">
            <div style="font-size: 11px; color: #c9b894; text-transform: uppercase; letter-spacing: .16em; font-weight: 600;">Your Booking Reference</div>
            <div style="font-family: 'JetBrains Mono', monospace; font-size: 28px; font-weight: bold; color: #ffffff; margin-top: 4px;">
              ${data.booking.confirmation_code}
            </div>
            <div style="font-size: 12px; color: #34d399; margin-top: 8px;">
              ✓ Automated confirmation email sent to: <strong>${payload.customer_email}</strong>
            </div>
          </div>
          <p style="color: #b9c1ba; font-size: 13px; line-height: 1.6; margin-bottom: 16px;">
            Our operations team at 1 Glebe Road, Stanmore is allocating your chauffeur. For urgent queries, call direct on <strong style="color: #fff;">+44 7886 622082</strong>.
          </p>
          <button onclick="window.location.reload()" style="background: transparent; border: 1px solid #c9b894; color: #c9b894; padding: 9px 20px; border-radius: 4px; font-size: 13px; cursor: pointer;">
            Book Another Journey ↗
          </button>
        `;
      } else {
        alert(data.error || 'Failed to submit booking');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Request Journey Reservation ↗';
      }
    } catch (err) {
      alert('Unable to contact dispatch server at ' + API_BASE + '. Please verify connection.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Request Journey Reservation ↗';
    }
  });
})();
