/**
 * GA Chauffeur Services Limited - Official Website Booking Widget (CDS Alternative)
 * Website: gachauffeurs.co.uk
 * Office: 1 Glebe Road, Stanmore, Greater London, HA7 4EJ
 * Direct Phone: +44 7886 622082 | Email: enquiries@gachauffeurs.co.uk
 * 
 * Embed on gachauffeurs.co.uk or any partner site:
 * <div id="ga-chauffeur-booking-widget"></div>
 * <script src="https://dispatch.gachauffeurs.co.uk/embed-booking-widget.js"></script>
 */

(function() {
  const container = document.getElementById('ga-chauffeur-booking-widget');
  if (!container) return;

  const API_BASE = window.GA_DISPATCH_API_URL || 'https://dispatch.gachauffeurs.co.uk';

  container.innerHTML = `
    <div id="ga-widget-root" style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #171f1b; color: #edf0ea; border: 1px solid #2e3b33; border-radius: 6px; padding: 32px 28px; max-width: 740px; margin: 0 auto; box-shadow: 0 20px 45px rgba(0,0,0,0.45); text-align: left; box-sizing: border-box;">
      
      <!-- GA Brand Header -->
      <div style="text-align: center; margin-bottom: 24px; border-bottom: 1px solid #2e3b33; padding-bottom: 20px;">
        <div style="display: inline-flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 10px;">
          <span style="font-family: Georgia, serif; font-size: 34px; letter-spacing: -4px; color: #c9b894; line-height: 1;">GA</span>
          <span style="font-size: 11px; letter-spacing: .18em; text-transform: uppercase; border-left: 1px solid #3e4e44; padding-left: 12px; color: #d0d8d1; text-align: left; line-height: 1.4;">Chauffeur<br>Services</span>
        </div>
        <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(52,211,153,0.12); border: 1px solid rgba(52,211,153,0.3); color: #34d399; font-size: 11px; font-weight: 600; padding: 4px 12px; border-radius: 20px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: .08em;">
          <span style="width: 7px; height: 7px; border-radius: 50%; background: #34d399; box-shadow: 0 0 8px #34d399; display: inline-block;"></span>
          Live Operations Active 24/7 • Stanmore Base HA7 4EJ
        </div>
        <h2 style="font-family: Georgia, serif; font-size: 26px; font-weight: normal; color: #ffffff; margin: 0 0 6px 0;">Request a Booking</h2>
        <p style="margin: 0 0 14px 0; color: #aab5ae; font-size: 14px;">Instant quote with itemized VAT breakdown &amp; confirmed booking reference (GA-XXXXX)</p>
        
        <!-- WhatsApp Quick Link -->
        <a id="ga-whatsapp-btn" href="https://wa.me/447886622082?text=Hello%20GA%20Chauffeurs%2C%20I%20would%20like%20to%20request%20a%20chauffeur%20quote" target="_blank" rel="noopener" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: #25D366; color: #fff; font-weight: 700; font-size: 13px; padding: 10px 18px; border-radius: 4px; text-decoration: none; box-shadow: 0 4px 12px rgba(37,211,102,0.25);">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm.01 17.58c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.16 8.16 0 0 1-1.25-4.32c0-4.52 3.68-8.2 8.2-8.2 2.19 0 4.25.85 5.8 2.4 1.55 1.55 2.4 3.61 2.4 5.8 0 4.52-3.68 8.2-8.2 8.2zm4.49-6.14c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43s-.56-1.34-.76-1.84c-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.57.12.17 1.75 2.67 4.24 3.75.59.26 1.05.41 1.41.53.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.16-.48-.28z"/></svg>
          Chat with Operations on WhatsApp (+44 7886 622082) ↗
        </a>
      </div>

      <form id="ga-widget-form" style="display: flex; flex-direction: column; gap: 18px;" autocomplete="off">
        
        <!-- Interactive Service Chips -->
        <div>
          <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; color: #c9b894; font-weight: 600; margin-bottom: 8px;">Journey Category *</label>
          <div id="ga-service-chips-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px;">
            <button type="button" class="ga-btn-chip active" data-service="Airport arrival" style="background: #2e3b33; color: #c9b894; border: 1px solid #c9b894; padding: 9px 12px; border-radius: 4px; font-size: 13px; font-weight: 600; cursor: pointer;">✈️ Airport</button>
            <button type="button" class="ga-btn-chip" data-service="Hourly chauffeur service" style="background: #17201b; color: #aab5ae; border: 1px solid #3e4e44; padding: 9px 12px; border-radius: 4px; font-size: 13px; font-weight: 600; cursor: pointer;">⏱️ Hourly</button>
            <button type="button" class="ga-btn-chip" data-service="Private aviation" style="background: #17201b; color: #aab5ae; border: 1px solid #3e4e44; padding: 9px 12px; border-radius: 4px; font-size: 13px; font-weight: 600; cursor: pointer;">🛩️ Private Jet</button>
            <button type="button" class="ga-btn-chip" data-service="Point-to-point transfer" style="background: #17201b; color: #aab5ae; border: 1px solid #3e4e44; padding: 9px 12px; border-radius: 4px; font-size: 13px; font-weight: 600; cursor: pointer;">📍 Point-to-Point</button>
          </div>
          <select id="ga-service-type" style="display: none;">
            <option value="Airport arrival" selected>Airport arrival</option>
            <option value="Airport departure">Airport departure</option>
            <option value="Point-to-point transfer">Point-to-point transfer</option>
            <option value="Hourly chauffeur service">Hourly chauffeur service</option>
            <option value="Private aviation">Private aviation</option>
          </select>
        </div>

        <!-- Private Jet / FBO Group -->
        <div id="ga-wrap-fbo" style="display: none; background: #1c2420; border: 1px solid #c9b894; border-radius: 4px; padding: 14px 16px;">
          <div style="font-size: 11px; font-weight: 700; color: #c9b894; text-transform: uppercase; letter-spacing: .14em; margin-bottom: 8px;">🛩️ Private Aviation / FBO Handler</div>
          <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #d0d8d1; margin-bottom: 4px;">Select Private Airfield</label>
          <select id="ga-fbo-airport" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #3e4e44; border-radius: 4px; padding: 10px; color: #fff; font-size: 13px; margin-bottom: 10px;">
            <option value="Farnborough Airport (FAB), Signature Aviation, GU14 6XA">Farnborough Airport (FAB) - Signature Aviation</option>
            <option value="London Biggin Hill Airport (BQH), Jetex, TN16 3BN">London Biggin Hill Airport (BQH) - Jetex</option>
            <option value="RAF Northolt (NHT) Private Aviation FBO, HA4 6NG">RAF Northolt (NHT) - Private Aviation FBO</option>
            <option value="London Luton Airport (LTN), Signature / Harrods Aviation, LU2 9LY">London Luton Airport (LTN) - Signature / Harrods</option>
            <option value="London Stansted Airport (STN), Inflite The Jet Centre, CM24 1QW">London Stansted Airport (STN) - Inflite The Jet Centre</option>
            <option value="London Heliport Battersea (EGLW), SW11 3BE">London Heliport Battersea (EGLW)</option>
          </select>
          <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #d0d8d1; margin-bottom: 4px;">Aircraft Tail Number / Callsign</label>
          <input type="text" id="ga-tail-number" placeholder="e.g. G-OADY, N700GX, or M-HOTL" maxlength="25" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #3e4e44; border-radius: 4px; padding: 10px; color: #fff; font-size: 13px;">
          <p style="margin: 6px 0 0; font-size: 12px; color: #aab5ae;">Our operations team arranges apron tarmac clearance or VIP lounge meet &amp; greet directly with the FBO handling agents.</p>
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
          <p style="margin: 6px 0 0; font-size: 12px; color: #aab5ae;">Destination is as directed by passenger throughout the booking duration.</p>
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
            <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">Collection Point *</label>
            <input type="text" id="ga-pickup" required placeholder="e.g. LHR T5 or Postcode" autocomplete="off" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 11px 14px; color: #fff; font-size: 14px; font-family: inherit;">
            <div id="ga-dropdown-pickup" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: #171f1b; border: 1px solid #c9b894; border-radius: 4px; z-index: 1000; max-height: 240px; overflow-y: auto; box-shadow: 0 10px 25px rgba(0,0,0,0.6);"></div>

            <input type="text" id="ga-pickup-unit" placeholder="House / Flat / Terminal Detail (optional)" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 8px 12px; color: #cbd5e1; font-size: 12px; font-family: inherit; margin-top: 6px;">

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

            <input type="text" id="ga-dropoff-unit" placeholder="Building Unit / Suite (optional)" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 8px 12px; color: #cbd5e1; font-size: 12px; font-family: inherit; margin-top: 6px;">

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
            <option value="mercedes_s_class">Mercedes-Benz S-Class (Saloon • Reg: HN76GYG • 4 Passengers, 2 Large Bags)</option>
            <option value="mercedes_v_class">Mercedes-Benz V-Class (Luxury MPV • Reg: LR74EOG • 6-Seater, 6 Large Bags)</option>
            <option value="range_rover_autobiography">Range Rover Autobiography LWB (Prestige 4x4 • Reg: UKZ 545 • 4 Passengers, 3 Bags)</option>
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

        <!-- Credit Card Pre-Authorisation Card -->
        <div style="background: #1c2420; border: 1px solid #c9b894; border-radius: 6px; padding: 20px; display: flex; flex-direction: column; gap: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #2e3b33; padding-bottom: 10px;">
            <div>
              <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .16em; color: #c9b894;">Credit Card Pre-Authorisation</span>
              <div style="font-size: 12px; color: #aab5ae; margin-top: 2px;">🔒 Funds are verified and held to confirm booking. Only captured after journey completion.</div>
            </div>
            <div style="display: flex; gap: 6px;">
              <span style="background: rgba(255,255,255,0.08); padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; color: #fff;">VISA</span>
              <span style="background: rgba(255,255,255,0.08); padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; color: #fff;">MC</span>
              <span style="background: rgba(255,255,255,0.08); padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; color: #fff;">AMEX</span>
            </div>
          </div>

          <div>
            <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">Cardholder Name *</label>
            <input type="text" id="ga-cardholder" required placeholder="Name as printed on card" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 11px 14px; color: #fff; font-size: 14px; font-family: inherit;">
          </div>

          <div>
            <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">Card Number *</label>
            <input type="text" id="ga-cardnumber" required placeholder="4532 •••• •••• ••••" maxlength="23" autocomplete="cc-number" inputmode="numeric" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 11px 14px; color: #fff; font-size: 14px; font-family: monospace; letter-spacing: .1em;">
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
            <div>
              <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">Expiry Date (MM/YY) *</label>
              <input type="text" id="ga-cardexpiry" required placeholder="MM / YY" maxlength="7" autocomplete="cc-exp" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 11px 14px; color: #fff; font-size: 14px; font-family: monospace;">
            </div>
            <div>
              <label style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #c9b894; font-weight: 600; margin-bottom: 6px;">CVC / Security Code *</label>
              <input type="text" id="ga-cardcvc" required placeholder="•••" maxlength="4" autocomplete="cc-csc" inputmode="numeric" style="width: 100%; box-sizing: border-box; background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 11px 14px; color: #fff; font-size: 14px; font-family: monospace;">
            </div>
          </div>
        </div>

        <!-- Live Price Box with Transparent Itemized Breakdown -->
        <div id="ga-price-box" style="background: #1c2420; border: 1px solid rgba(201, 184, 148, 0.35); border-radius: 6px; padding: 18px 20px; display: flex; flex-direction: column; gap: 10px;">
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

          <!-- Itemized Breakdown Lines -->
          <div style="background: #131916; border: 1px solid #2e3b33; border-radius: 4px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
            <div style="display: flex; justify-content: space-between; color: #cbd5e1;">
              <span>Base Journey Fare:</span>
              <span id="ga-row-base" style="font-weight: 600; color: #fff;">£165.00</span>
            </div>
            <div id="ga-row-parking" style="display: none; justify-content: space-between; color: #38bdf8;">
              <span>Airport Parking &amp; Meet/Greet:</span>
              <span id="ga-val-parking" style="font-weight: 600;">+£15.00</span>
            </div>
            <div id="ga-row-congestion" style="display: none; justify-content: space-between; color: #facc15;">
              <span>London Congestion Charge Zone:</span>
              <span id="ga-val-congestion" style="font-weight: 600;">+£15.00</span>
            </div>
            <div style="display: flex; justify-content: space-between; color: #cbd5e1; border-top: 1px solid #2e3b33; padding-top: 4px;">
              <span>UK VAT (20%):</span>
              <span id="ga-row-vat" style="font-weight: 600; color: #fff;">£33.00</span>
            </div>
            <div style="display: flex; justify-content: space-between; color: #c9b894; font-weight: 700; border-top: 1px solid #3e4e44; padding-top: 6px; font-size: 13px;">
              <span>Total Pre-Authorised Hold:</span>
              <span id="ga-row-grand">£198.00</span>
            </div>
          </div>
        </div>

        <button type="submit" id="ga-submit-btn" style="background: #c9b894; color: #171f1b; font-family: 'DM Sans', sans-serif; font-weight: 700; font-size: 15px; padding: 16px 24px; border: 1px solid #c9b894; border-radius: 4px; cursor: pointer; margin-top: 4px; transition: all 0.2s ease; width: 100%;">
          Pre-Authorise &amp; Confirm Booking ↗
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
  const wrapFbo = document.getElementById('ga-wrap-fbo');
  const fboSelect = document.getElementById('ga-fbo-airport');
  const tailInput = document.getElementById('ga-tail-number');

  const vSelect = document.getElementById('ga-vehicle');
  const passSelect = document.getElementById('ga-passengers');
  const lgCases = document.getElementById('ga-large-cases');
  const medCases = document.getElementById('ga-medium-cases');
  const handLug = document.getElementById('ga-hand-luggage');
  const chips = document.querySelectorAll('.ga-btn-chip');
  const whatsappBtn = document.getElementById('ga-whatsapp-btn');

  // Chip Switching
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => {
        c.classList.remove('active');
        c.style.background = '#17201b';
        c.style.borderColor = '#3e4e44';
        c.style.color = '#aab5ae';
      });
      chip.classList.add('active');
      chip.style.background = '#2e3b33';
      chip.style.borderColor = '#c9b894';
      chip.style.color = '#c9b894';

      if (sTypeSelect) {
        sTypeSelect.value = chip.dataset.service;
        triggerServiceChange();
      }
    });
  });

  function triggerServiceChange() {
    const val = sTypeSelect ? sTypeSelect.value : 'Airport arrival';
    const isHourly = val === 'Hourly chauffeur service';
    const isFBO = val === 'Private aviation';

    if (wrapHours) wrapHours.style.display = isHourly ? 'block' : 'none';
    if (wrapFbo) wrapFbo.style.display = isFBO ? 'block' : 'none';

    const lblDrop = document.getElementById('ga-lbl-dropoff');
    if (lblDrop) {
      lblDrop.textContent = isHourly ? 'Disposal Destination (e.g. As Directed / Central London)' : 'Destination / Drop-off Location *';
    }
    if (isHourly && dInput && !dInput.value) {
      dInput.value = 'As Directed / Central London';
    }
    if (isFBO && fboSelect && !pInput.value) {
      pInput.value = fboSelect.value;
    }
    updateWidgetQuote();
    updateWhatsAppLink();
  }

  if (fboSelect) {
    fboSelect.addEventListener('change', () => {
      if (sTypeSelect && sTypeSelect.value === 'Private aviation') {
        pInput.value = fboSelect.value;
        updateWidgetQuote();
        updateWhatsAppLink();
      }
    });
  }

  function updateWhatsAppLink() {
    if (!whatsappBtn) return;
    const v = vSelect ? vSelect.options[vSelect.selectedIndex].text.split('(')[0].trim() : 'Executive Chauffeur';
    const s = sTypeSelect ? sTypeSelect.value : 'chauffeur service';
    const p = pInput ? pInput.value : '';
    const d = dInput ? dInput.value : '';
    const dt = dtInput ? dtInput.value : '';

    let text = `Hello GA Chauffeurs, I would like to request a quote for a ${v} for ${s}`;
    if (p) text += ` from ${p}`;
    if (d) text += ` to ${d}`;
    if (dt) text += ` on ${dt.replace('T', ' at ')}`;
    whatsappBtn.href = `https://wa.me/447886622082?text=${encodeURIComponent(text)}`;
  }

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
      updateWhatsAppLink();

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
      updateWhatsAppLink();
    }
  };

  // Automatic Service Type Detection
  function autoDetectServiceType() {
    if (!sTypeSelect) return;
    if (sTypeSelect.value === 'Hourly chauffeur service' || sTypeSelect.value === 'Private aviation') return;

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
    } else if (p && d) {
      sTypeSelect.value = 'Point-to-point transfer';
    }
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

  if (vSelect) vSelect.addEventListener('change', () => { checkVehicleCapacity(); updateWidgetQuote(); updateWhatsAppLink(); });
  if (passSelect) passSelect.addEventListener('change', () => { checkVehicleCapacity(); updateWidgetQuote(); });
  if (lgCases) lgCases.addEventListener('change', () => { checkVehicleCapacity(); updateWidgetQuote(); });
  if (dtInput) dtInput.addEventListener('change', updateWhatsAppLink);

  // Card formatting listeners
  const wCardNum = document.getElementById('ga-cardnumber');
  const wCardExp = document.getElementById('ga-cardexpiry');
  const wCardCvc = document.getElementById('ga-cardcvc');

  if (wCardNum) {
    wCardNum.addEventListener('input', e => {
      let val = e.target.value.replace(/\D/g, '').slice(0, 16);
      e.target.value = val.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
    });
  }
  if (wCardExp) {
    wCardExp.addEventListener('input', e => {
      let val = e.target.value.replace(/\D/g, '').slice(0, 4);
      if (val.length >= 2) {
        e.target.value = val.slice(0, 2) + ' / ' + val.slice(2);
      } else {
        e.target.value = val;
      }
    });
  }
  if (wCardCvc) {
    wCardCvc.addEventListener('input', e => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    });
  }

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
      const rowBase = document.getElementById('ga-row-base');
      const rowPark = document.getElementById('ga-row-parking');
      const rowCong = document.getElementById('ga-row-congestion');
      const rowVat = document.getElementById('ga-row-vat');
      const rowGrand = document.getElementById('ga-row-grand');
      const btnSubmit = document.getElementById('ga-submit-btn');

      if (totalEl) totalEl.textContent = `£${q.total_fare.toFixed(2)}`;
      if (subEl) subEl.textContent = `£${q.subtotal.toFixed(2)} + £${q.vat_amount.toFixed(2)} VAT (20%)`;
      if (labelEl) labelEl.textContent = q.service_label ? q.service_label.toUpperCase() : 'ESTIMATED JOURNEY FARE';

      if (rowBase) rowBase.textContent = `£${q.base_fare.toFixed(2)}`;
      if (rowPark) rowPark.style.display = q.has_parking ? 'flex' : 'none';
      if (rowCong) rowCong.style.display = q.has_congestion ? 'flex' : 'none';
      if (rowVat) rowVat.textContent = `£${q.vat_amount.toFixed(2)}`;
      if (rowGrand) rowGrand.textContent = `£${q.total_fare.toFixed(2)}`;
      if (btnSubmit) btnSubmit.textContent = `Pre-Authorise £${q.total_fare.toFixed(2)} & Confirm Booking ↗`;
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
    submitBtn.textContent = 'Pre-Authorising Card & Registering Journey...';

    const tailNo = tailInput ? tailInput.value.trim() : '';
    let notes = (document.getElementById('ga-notes').value || '').trim();
    if (tailNo) {
      notes = `[Private Jet Tail: ${tailNo}] ` + notes;
    }

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
      special_requests: notes,
      cardholder_name: document.getElementById('ga-cardholder') ? document.getElementById('ga-cardholder').value : '',
      card_number: document.getElementById('ga-cardnumber') ? document.getElementById('ga-cardnumber').value.replace(/\s+/g, '') : '',
      card_expiry: document.getElementById('ga-cardexpiry') ? document.getElementById('ga-cardexpiry').value : '',
      card_cvc: document.getElementById('ga-cardcvc') ? document.getElementById('ga-cardcvc').value : '',
      payment_method: 'CREDIT_CARD',
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
        const cardDisplay = data.booking.card_last4 ? `${data.booking.card_brand || 'Card'} ending in •••• ${data.booking.card_last4}` : 'Credit Card';
        resultBox.innerHTML = `
          <div style="font-size: 36px; color: #34d399; margin-bottom: 10px;">✓</div>
          <h3 style="font-family: Georgia, serif; color: #ffffff; margin: 0 0 6px 0; font-size: 22px; font-weight: normal;">Booking &amp; Pre-Authorisation Confirmed</h3>
          <p style="color: #aab5ae; font-size: 14px; margin: 0 0 18px 0;">
            Your transfer has been secured and logged directly into our dispatch control console.
          </p>
          <div style="background: #131916; border: 1px solid #c9b894; border-radius: 4px; padding: 18px; margin-bottom: 18px;">
            <div style="font-size: 11px; color: #c9b894; text-transform: uppercase; letter-spacing: .16em; font-weight: 600;">Your Booking Reference</div>
            <div style="font-family: 'JetBrains Mono', monospace; font-size: 28px; font-weight: bold; color: #ffffff; margin-top: 4px;">
              ${data.booking.confirmation_code}
            </div>
            <div style="font-size: 13px; color: #4ade80; margin-top: 8px; font-weight: 600;">
              🔒 Pre-Authorised Hold: £${data.booking.total_fare.toFixed(2)} (${cardDisplay})
            </div>
            <div style="font-size: 12px; color: #aab5ae; margin-top: 4px;">
              Hold Reference: ${data.booking.card_auth_code || 'VERIFIED'}
            </div>
            <div style="font-size: 12px; color: #94a3b8; margin-top: 6px;">
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
