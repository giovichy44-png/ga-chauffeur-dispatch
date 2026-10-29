/**
 * GA Chauffeur Services Limited - Official Embeddable Booking Widget
 * Website: gachauffeurs.co.uk
 * Office: 1 Glebe Road, Stanmore, Greater London, HA7 4EJ
 * Direct Phone: +44 7886 622082 | Email: enquiries@gachauffeurs.co.uk
 * 
 * Embed snippet for gachauffeurs.co.uk:
 * <div id="ga-chauffeur-booking-widget"></div>
 * <script src="https://dispatch.gachauffeurs.co.uk/embed-booking-widget.js"></script>
 */

(function() {
  const container = document.getElementById('ga-chauffeur-booking-widget');
  if (!container) return;

  const API_BASE = window.GA_DISPATCH_API_URL || 'https://dispatch.gachauffeurs.co.uk';

  container.innerHTML = `
    <div style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; background: #171f1b; color: #edf0ea; border: 1px solid #2e3b33; border-radius: 6px; padding: 32px 28px; max-width: 680px; margin: 0 auto; box-shadow: 0 20px 40px rgba(0,0,0,0.4); text-align: left;">
      
      <!-- GA Brand Header -->
      <div style="text-align: center; margin-bottom: 24px; border-bottom: 1px solid #2e3b33; padding-bottom: 20px;">
        <div style="display: inline-flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 12px;">
          <span style="font-family: Georgia, serif; font-size: 34px; letter-spacing: -4px; color: #c9b894; line-height: 1;">GA</span>
          <span style="font-size: 11px; letter-spacing: .18em; text-transform: uppercase; border-left: 1px solid #3e4e44; padding-left: 12px; color: #d0d8d1; text-align: left; line-height: 1.4;">Chauffeur<br>Services</span>
        </div>
        <span style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .22em; color: #c9b894; font-weight: 600; margin-bottom: 4px;">Direct Chauffeur Booking</span>
        <h2 style="font-family: Georgia, serif; font-size: 26px; font-weight: normal; color: #ffffff; margin: 0 0 6px 0;">Plan Your Journey</h2>
        <p style="margin: 0; color: #aab5ae; font-size: 14px;">Instant confirmation with automated flight tracking &amp; luxury vehicle allocation</p>
      </div>

      <form id="ga-widget-form" style="display: flex; flex-direction: column; gap: 16px;">
        
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

        <!-- Route -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
          <div>
            <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">Collection Point / Airport *</label>
            <input type="text" id="ga-pickup" required placeholder="e.g. Heathrow Airport (LHR) Terminal 5" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 11px 14px; color: #fff; font-size: 14px; font-family: inherit;">
          </div>
          <div>
            <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">Destination / Address *</label>
            <input type="text" id="ga-dropoff" required placeholder="e.g. The Connaught, Mayfair, London" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 11px 14px; color: #fff; font-size: 14px; font-family: inherit;">
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

        <!-- 3 REAL GA CHAUFFEUR VEHICLES (6-SEATER V-CLASS) -->
        <div>
          <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">Select Vehicle *</label>
          <select id="ga-vehicle" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #c9b894; border-radius: 4px; padding: 12px 14px; color: #fff; font-size: 14px; font-weight: 600; font-family: inherit;">
            <option value="mercedes_s_class">Mercedes-Benz S-Class (Executive Saloon • 4 Passengers, 2 Luggage)</option>
            <option value="mercedes_v_class">Mercedes-Benz V-Class (Luxury MPV • 6 Passengers, 6 Luggage)</option>
            <option value="range_rover_autobiography">Range Rover Autobiography LWB (Prestige 4x4 • 4 Passengers, 3 Luggage)</option>
          </select>
        </div>

        <div id="ga-vehicle-specs-box" style="background: rgba(201, 184, 148, 0.06); border: 1px solid #2e3b33; border-radius: 4px; padding: 10px 14px; font-size: 12px; color: #b9c1ba; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <span id="ga-spec-pax">Capacity: Up to 4 Adults</span>
          <span id="ga-spec-luggage">Luggage: 2 Large Bags</span>
          <span>Wi-Fi, Water &amp; USB Charging Included</span>
        </div>

        <div>
          <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">Special Requests / Amenities</label>
          <input type="text" id="ga-notes" placeholder="e.g. Nameboard meet & greet, baby seat, extra luggage assistance" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 11px 14px; color: #fff; font-size: 14px; font-family: inherit;">
        </div>

        <!-- Estimated Fare Preview in GBP -->
        <div id="ga-price-box" style="background: #1c2420; border: 1px solid rgba(201, 184, 148, 0.35); border-radius: 4px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
          <div>
            <span style="font-size: 11px; color: #c9b894; text-transform: uppercase; letter-spacing: .16em; font-weight: 600;">All-Inclusive London Fare</span>
            <div style="font-size: 12px; color: #aab5ae; margin-top: 2px;">Includes driver meet &amp; greet, 45m airport wait &amp; VAT</div>
          </div>
          <div id="ga-price-val" style="font-family: Georgia, serif; font-size: 24px; font-weight: 600; color: #c9b894;">£135.00 GBP</div>
        </div>

        <button type="submit" id="ga-submit-btn" style="background: #c9b894; color: #171f1b; font-family: 'DM Sans', sans-serif; font-weight: 600; font-size: 14px; padding: 14px 20px; border: 1px solid #c9b894; border-radius: 4px; cursor: pointer; margin-top: 6px; transition: all 0.2s ease;">
          Request Journey Reservation ↗
        </button>
      </form>

      <div id="ga-result-box" style="display: none; margin-top: 20px; padding: 24px; background: #1c2420; border: 1px solid #34d399; border-radius: 4px; text-align: center;">
      </div>
    </div>
  `;

  const dtInput = document.getElementById('ga-datetime');
  if (dtInput) {
    const d = new Date(Date.now() + 2 * 3600000);
    dtInput.value = d.toISOString().slice(0, 16);
  }

  const vehicleSelect = document.getElementById('ga-vehicle');
  const priceVal = document.getElementById('ga-price-val');
  const specPax = document.getElementById('ga-spec-pax');
  const specLuggage = document.getElementById('ga-spec-luggage');

  function updateSpecsAndPrice() {
    const val = vehicleSelect.value;
    if (val === 'mercedes_s_class') {
      priceVal.textContent = '£135.00 GBP';
      specPax.textContent = 'Capacity: Up to 4 Adults';
      specLuggage.textContent = 'Luggage: 2 Large Suitcases';
    } else if (val === 'mercedes_v_class') {
      priceVal.textContent = '£150.00 GBP';
      specPax.textContent = 'Capacity: Up to 6 Adults';
      specLuggage.textContent = 'Luggage: 6 Large Suitcases';
    } else if (val === 'range_rover_autobiography') {
      priceVal.textContent = '£175.00 GBP';
      specPax.textContent = 'Capacity: Up to 4 Adults';
      specLuggage.textContent = 'Luggage: 3 Suitcases';
    }
  }

  if (vehicleSelect) vehicleSelect.addEventListener('change', updateSpecsAndPrice);
  updateSpecsAndPrice();

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
      pickup_address: document.getElementById('ga-pickup').value,
      dropoff_address: document.getElementById('ga-dropoff').value,
      pickup_datetime: dtInput.value.replace('T', ' '),
      flight_number: document.getElementById('ga-flight').value || null,
      vehicle_class: vehicleSelect.value,
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
