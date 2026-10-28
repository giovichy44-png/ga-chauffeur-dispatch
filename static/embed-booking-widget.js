/**
 * GA Chauffeur Services Limited - Embeddable Booking Widget
 * Website: gachauffeurs.co.uk
 * Office: 1 Glebe Road, Stanmore, Greater London, HA7 4EJ
 * Phone: +44 7886 622082 | Email: enquiries@gachauffeurs.co.uk
 * 
 * Usage on gachauffeurs.co.uk:
 * <div id="ga-chauffeur-booking-widget"></div>
 * <script src="https://dispatch.gachauffeurs.co.uk/embed-booking-widget.js"></script>
 */

(function() {
  const container = document.getElementById('ga-chauffeur-booking-widget');
  if (!container) return;

  const API_BASE = window.GA_DISPATCH_API_URL || window.location.origin;

  container.innerHTML = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0e131d; color: #f0f4f8; border: 1px solid #d4af37; border-radius: 12px; padding: 28px; max-width: 650px; margin: 0 auto; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
      <div style="text-align: center; margin-bottom: 24px; border-bottom: 1px solid rgba(212,175,55,0.2); padding-bottom: 16px;">
        <span style="color: #d4af37; font-size: 11px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase;">GA CHAUFFEUR SERVICES LIMITED</span>
        <h2 style="margin: 6px 0 2px 0; color: #ffffff; font-size: 22px;">Executive Journey Reservation</h2>
        <p style="margin: 0; color: #94a3b8; font-size: 13px;">1 Glebe Road, Stanmore • Direct: +44 7886 622082</p>
      </div>

      <form id="ga-widget-form" style="display: flex; flex-direction: column; gap: 14px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <label style="display: block; font-size: 12px; color: #cbd5e1; margin-bottom: 4px;">Full Name *</label>
            <input type="text" id="ga-name" required placeholder="e.g. Lord Henry Cavendish" style="width: 100%; box-sizing: border-box; background: #161e2b; border: 1px solid #2a374d; border-radius: 6px; padding: 10px 12px; color: #fff; font-size: 13px;">
          </div>
          <div>
            <label style="display: block; font-size: 12px; color: #cbd5e1; margin-bottom: 4px;">Mobile Phone (for live driver SMS) *</label>
            <input type="tel" id="ga-phone" required placeholder="+44 7886 622082" style="width: 100%; box-sizing: border-box; background: #161e2b; border: 1px solid #2a374d; border-radius: 6px; padding: 10px 12px; color: #fff; font-size: 13px;">
          </div>
        </div>

        <div>
          <label style="display: block; font-size: 12px; color: #cbd5e1; margin-bottom: 4px;">Email Address (for instant confirmation) *</label>
          <input type="email" id="ga-email" required placeholder="client@company.co.uk" style="width: 100%; box-sizing: border-box; background: #161e2b; border: 1px solid #2a374d; border-radius: 6px; padding: 10px 12px; color: #fff; font-size: 13px;">
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <label style="display: block; font-size: 12px; color: #cbd5e1; margin-bottom: 4px;">Pickup Location / Airport *</label>
            <input type="text" id="ga-pickup" required placeholder="e.g. Heathrow Terminal 5" style="width: 100%; box-sizing: border-box; background: #161e2b; border: 1px solid #2a374d; border-radius: 6px; padding: 10px 12px; color: #fff; font-size: 13px;">
          </div>
          <div>
            <label style="display: block; font-size: 12px; color: #cbd5e1; margin-bottom: 4px;">Destination / Hotel *</label>
            <input type="text" id="ga-dropoff" required placeholder="e.g. The Connaught, Mayfair" style="width: 100%; box-sizing: border-box; background: #161e2b; border: 1px solid #2a374d; border-radius: 6px; padding: 10px 12px; color: #fff; font-size: 13px;">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <label style="display: block; font-size: 12px; color: #cbd5e1; margin-bottom: 4px;">Pickup Date & Time *</label>
            <input type="datetime-local" id="ga-datetime" required style="width: 100%; box-sizing: border-box; background: #161e2b; border: 1px solid #2a374d; border-radius: 6px; padding: 10px 12px; color: #fff; font-size: 13px;">
          </div>
          <div>
            <label style="display: block; font-size: 12px; color: #cbd5e1; margin-bottom: 4px;">Flight Number (45m free airport wait)</label>
            <input type="text" id="ga-flight" placeholder="e.g. BA 178" style="width: 100%; box-sizing: border-box; background: #161e2b; border: 1px solid #2a374d; border-radius: 6px; padding: 10px 12px; color: #fff; font-size: 13px;">
          </div>
        </div>

        <!-- THE 3 EXCLUSIVE GA CHAUFFEUR VEHICLES -->
        <div>
          <label style="display: block; font-size: 12px; color: #d4af37; font-weight: bold; margin-bottom: 6px;">Select Vehicle Tier *</label>
          <select id="ga-vehicle" style="width: 100%; box-sizing: border-box; background: #161e2b; border: 1px solid #d4af37; border-radius: 6px; padding: 12px; color: #fff; font-size: 13px; font-weight: 600;">
            <option value="mercedes_s_class">Mercedes-Benz S-Class (Saloon • 4 Passengers, 2 Luggage)</option>
            <option value="mercedes_v_class">Mercedes-Benz V-Class (MPV • 7 Passengers, 6 Luggage)</option>
            <option value="range_rover_autobiography">Range Rover Autobiography LWB (Prestige SUV • 4 Passengers, 3 Luggage)</option>
          </select>
        </div>

        <div id="ga-vehicle-specs-box" style="background: rgba(255,255,255,0.03); border-radius: 6px; padding: 10px 14px; font-size: 12px; color: #94a3b8; display: flex; justify-content: space-between;">
          <span id="ga-spec-pax">Capacity: Up to 4 Adults</span>
          <span id="ga-spec-luggage">Luggage: 2 Large Bags</span>
          <span>Wi-Fi &amp; Water Included</span>
        </div>

        <div>
          <label style="display: block; font-size: 12px; color: #cbd5e1; margin-bottom: 4px;">Special Requests / Amenities</label>
          <input type="text" id="ga-notes" placeholder="e.g. Nameboard meet & greet, child seat, extra luggage assist" style="width: 100%; box-sizing: border-box; background: #161e2b; border: 1px solid #2a374d; border-radius: 6px; padding: 10px 12px; color: #fff; font-size: 13px;">
        </div>

        <div id="ga-price-box" style="background: rgba(212,175,55,0.08); border: 1px solid rgba(212,175,55,0.3); border-radius: 8px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
          <div>
            <span style="font-size: 11px; color: #d4af37; text-transform: uppercase; font-weight: bold;">Estimated All-Inclusive Fare</span>
            <div style="font-size: 12px; color: #94a3b8;">Includes meet &amp; greet, 45m flight wait, Wi-Fi &amp; bottled water</div>
          </div>
          <div id="ga-price-val" style="font-size: 22px; font-weight: bold; color: #d4af37; font-family: monospace;">£135.00 GBP</div>
        </div>

        <button type="submit" id="ga-submit-btn" style="background: linear-gradient(135deg, #f5e8c7 0%, #d4af37 60%, #9e8020 100%); color: #0b0e14; font-weight: bold; font-size: 15px; padding: 14px; border: none; border-radius: 6px; cursor: pointer; margin-top: 8px; transition: all 0.2s ease;">
          Request Executive Booking
        </button>
      </form>

      <div id="ga-result-box" style="display: none; margin-top: 20px; padding: 20px; background: #141c2b; border: 1px solid #10b981; border-radius: 8px; text-align: center;">
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
      specLuggage.textContent = 'Luggage: 2 Suitcases';
    } else if (val === 'mercedes_v_class') {
      priceVal.textContent = '£150.00 GBP';
      specPax.textContent = 'Capacity: Up to 7 Adults';
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
    submitBtn.textContent = 'Creating Job & Dispatching Confirmation...';

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
          <div style="font-size: 32px; color: #10b981; margin-bottom: 8px;">✓</div>
          <h3 style="color: #ffffff; margin: 0 0 6px 0; font-size: 18px;">Booking Request Confirmed</h3>
          <p style="color: #94a3b8; font-size: 13px; margin: 0 0 16px 0;">
            Your executive transfer has been registered in the GA Chauffeur Services dispatch system.
          </p>
          <div style="background: #0b0e14; border: 1px solid #d4af37; border-radius: 6px; padding: 14px; margin-bottom: 16px;">
            <div style="font-size: 11px; color: #d4af37; text-transform: uppercase; font-weight: bold;">Your Job Reference Number</div>
            <div style="font-family: monospace; font-size: 26px; font-weight: bold; color: #fff; margin-top: 4px;">
              ${data.booking.confirmation_code}
            </div>
            <div style="font-size: 12px; color: #10b981; margin-top: 6px;">
              ✓ Automated confirmation email dispatched to: <strong>${payload.customer_email}</strong>
            </div>
          </div>
          <p style="color: #cbd5e1; font-size: 12px; line-height: 1.5;">
            Our dispatch office at 1 Glebe Road, Stanmore is allocating your chauffeur. Questions? Call direct: <strong>+44 7886 622082</strong>.
          </p>
          <button onclick="window.location.reload()" style="background: transparent; border: 1px solid #d4af37; color: #d4af37; padding: 8px 18px; border-radius: 4px; font-size: 12px; cursor: pointer; margin-top: 10px;">
            Book Another Transfer
          </button>
        `;
      } else {
        alert(data.error || 'Failed to submit booking');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Request Executive Booking';
      }
    } catch (err) {
      alert('Unable to contact dispatch server. Please check connection.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Request Executive Booking';
    }
  });
})();
