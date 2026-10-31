/**
 * GA Chauffeur Services Limited - Address Autocomplete & Airport Shorthand Resolver
 * High-speed resilient address & postcode engine for UK addresses, house numbers, postcodes,
 * airports, and private aviation FBOs. Combines local instant matching, dispatch suggestions,
 * UK postcode resolution, and Google Places Autocomplete when activated.
 */
(() => {
  const form = document.querySelector('#booking-form');
  if (!form) return;

  const AIRPORT_SUGGESTIONS = [
    { keys: ['t5', 'terminal 5', 'heathrow t5', 'lhr t5'], name: 'London Heathrow Airport Terminal 5, London TW6 2GA', lat: 51.4700, lng: -0.4840, category: 'airport' },
    { keys: ['t2', 'terminal 2', 'heathrow t2', 'lhr t2'], name: 'London Heathrow Airport Terminal 2, Inner Ring E, Hounslow TW6 1EW', lat: 51.4696, lng: -0.4506, category: 'airport' },
    { keys: ['t3', 'terminal 3', 'heathrow t3', 'lhr t3'], name: 'London Heathrow Airport Terminal 3, Inner Ring W, Hounslow TW6 1QG', lat: 51.4716, lng: -0.4578, category: 'airport' },
    { keys: ['t4', 'terminal 4', 'heathrow t4', 'lhr t4'], name: 'London Heathrow Airport Terminal 4, Stratford Rd, Hounslow TW6 3XA', lat: 51.4585, lng: -0.4452, category: 'airport' },
    { keys: ['lhr', 'heathrow', 'heathrow airport'], name: 'London Heathrow Airport (LHR), Longford, Hounslow TW6', lat: 51.4700, lng: -0.4543, category: 'airport' },
    { keys: ['lgw', 'gatwick', 'gatwick airport'], name: 'London Gatwick Airport (LGW), Horley, Gatwick RH6 0NP', lat: 51.1537, lng: -0.1821, category: 'airport' },
    { keys: ['gatwick north'], name: 'London Gatwick Airport North Terminal, Horley RH6 0PJ', lat: 51.1598, lng: -0.1769, category: 'airport' },
    { keys: ['gatwick south'], name: 'London Gatwick Airport South Terminal, Horley RH6 0NP', lat: 51.1565, lng: -0.1611, category: 'airport' },
    { keys: ['lcy', 'london city', 'london city airport'], name: 'London City Airport (LCY), Hartmann Rd, London E16 2PX', lat: 51.5048, lng: 0.0495, category: 'airport' },
    { keys: ['ltn', 'luton', 'luton airport'], name: 'London Luton Airport (LTN), Airport Way, Luton LU2 9LY', lat: 51.8763, lng: -0.3717, category: 'airport' },
    { keys: ['stn', 'stansted', 'stansted airport'], name: 'London Stansted Airport (STN), Bassingbourn Rd, Stansted CM24 1QW', lat: 51.8860, lng: 0.2389, category: 'airport' },
    { keys: ['fab', 'farnborough', 'farnborough airport'], name: 'Farnborough Airport (FAB), Farnborough GU14 6XA', lat: 51.2758, lng: -0.7763, category: 'private_jet' },
    { keys: ['bqh', 'biggin', 'biggin hill'], name: 'London Biggin Hill Airport (BQH), Main Rd, Biggin Hill TN16 3BN', lat: 51.3308, lng: 0.0325, category: 'private_jet' },
    { keys: ['northolt', 'raf northolt'], name: 'RAF Northolt Private Aviation FBO, West End Rd, Ruislip HA4 6NG', lat: 51.5531, lng: -0.4181, category: 'private_jet' },
    { keys: ['battersea', 'heliport'], name: 'London Heliport Battersea, Bridges Ct, London SW11 3BE', lat: 51.4700, lng: -0.1786, category: 'private_jet' },
    { keys: ['harrods', 'harrods aviation'], name: 'Harrods Aviation Luton / Stanmore FBO, London LU2 9LU', lat: 51.8790, lng: -0.3660, category: 'private_jet' },
    { keys: ['signature', 'signature flight support'], name: 'Signature Flight Support LHR Terminal, London TW6 3JH', lat: 51.4640, lng: -0.4480, category: 'private_jet' },
    { keys: ['stanmore', 'glebe road', 'ha7 4ej', 'ha74ej'], name: '1 Glebe Road, Stanmore, Greater London, HA7 4EJ', lat: 51.6167, lng: -0.3167, category: 'hub' },
    { keys: ['savoy', 'the savoy'], name: 'The Savoy, Strand, London WC2R 0EZ', lat: 51.5103, lng: -0.1206, category: 'hotel' },
    { keys: ['ritz', 'the ritz'], name: 'The Ritz London, 150 Piccadilly, St. James\'s, London W1J 9BR', lat: 51.5071, lng: -0.1416, category: 'hotel' },
    { keys: ['dorchester', 'the dorchester'], name: 'The Dorchester, 53 Park Ln, London W1K 1QA', lat: 51.5073, lng: -0.1524, category: 'hotel' },
    { keys: ['claridges', 'claridge\'s'], name: 'Claridge\'s, Brook St, London W1K 4HR', lat: 51.5126, lng: -0.1484, category: 'hotel' },
    { keys: ['connaught', 'the connaught'], name: 'The Connaught, Carlos Pl, London W1K 2AL', lat: 51.5100, lng: -0.1504, category: 'hotel' },
    { keys: ['maybourne', 'the berkeley'], name: 'The Berkeley, Wilton Pl, London SW1X 7RL', lat: 51.5019, lng: -0.1566, category: 'hotel' },
    { keys: ['harrods store', 'knightsbridge'], name: 'Harrods, 87-135 Brompton Rd, Knightsbridge, London SW1X 7XL', lat: 51.4994, lng: -0.1635, category: 'hub' },
    { keys: ['mayfair', 'w1k'], name: 'Mayfair, Central London, W1K 7TN', lat: 51.5110, lng: -0.1490, category: 'hub' }
  ];

  let debounceTimer = null;

  function setupResilientAutocomplete(input) {
    const parent = input.parentElement;
    if (!parent) return;

    if (window.getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }

    // Dropdown container
    let dropdown = parent.querySelector('.ga-autocomplete-dropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'ga-autocomplete-dropdown';
      dropdown.style.cssText = 'display:none;position:absolute;left:0;right:0;top:100%;z-index:99999;background:#ffffff;border:1px solid #c9b894;border-radius:8px;box-shadow:0 12px 30px rgba(0,0,0,0.15);margin-top:6px;max-height:300px;overflow-y:auto;';
      parent.appendChild(dropdown);
    }

    const renderItems = (items) => {
      if (!items || items.length === 0) {
        dropdown.style.display = 'none';
        return;
      }

      dropdown.innerHTML = items.map(item => {
        const icon = item.category === 'airport' ? '✈️' :
                     item.category === 'private_jet' ? '🛩️' :
                     item.category === 'hotel' ? '🏨' :
                     item.category === 'postcode' ? '📮' : '📍';
        const subtitle = item.subtitle ? `<span style="font-size:11px;color:#64748b;display:block;">${item.subtitle}</span>` : '';
        return `
          <div class="ga-item" data-name="${item.name.replace(/"/g, '&quot;')}" data-lat="${item.lat || ''}" data-lng="${item.lng || ''}" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #f1f5f9;font-size:13px;line-height:1.35;color:#171c1c;transition:background .15s ease;">
            <div style="display:flex;align-items:flex-start;gap:8px;">
              <span style="font-size:15px;line-height:1;">${icon}</span>
              <div style="flex:1;">
                <div style="font-weight:600;color:#171c1c;">${item.name}</div>
                ${subtitle}
              </div>
            </div>
          </div>
        `;
      }).join('');

      dropdown.querySelectorAll('.ga-item').forEach(el => {
        el.addEventListener('mouseenter', () => { el.style.background = '#faf8f3'; });
        el.addEventListener('mouseleave', () => { el.style.background = '#ffffff'; });
        el.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const name = el.dataset.name;
          input.value = name;
          if (el.dataset.lat) input.dataset.lat = el.dataset.lat;
          if (el.dataset.lng) input.dataset.lng = el.dataset.lng;
          dropdown.style.display = 'none';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });

      dropdown.style.display = 'block';
    };

    const handleSearch = async () => {
      const q = (input.value || '').trim();
      const lower = q.toLowerCase();
      if (!q || q.length < 2) {
        dropdown.style.display = 'none';
        return;
      }

      const results = [];

      // 1. Check instant local dictionary (airports, terminals, shorthand like T5, Stanmore)
      AIRPORT_SUGGESTIONS.forEach(item => {
        if (item.keys.some(k => k === lower || lower.startsWith(k) || item.name.toLowerCase().includes(lower))) {
          results.push({
            name: item.name,
            subtitle: item.category === 'airport' ? 'London Airport Terminal' : item.category === 'private_jet' ? 'Private Jet FBO' : 'Stanmore Headquarters',
            lat: item.lat,
            lng: item.lng,
            category: item.category
          });
        }
      });

      // 2. If postcode format (UK: e.g. HA7, HA7 4EJ, SW1A 1AA, W1K)
      const cleanPostcode = q.replace(/\s+/g, '').toUpperCase();
      const isPostcodeQuery = /^[A-Z]{1,2}[0-9][0-9A-Z]?[0-9]?[A-Z]{0,2}$/i.test(cleanPostcode);

      if (isPostcodeQuery && cleanPostcode.length >= 2) {
        try {
          // Query postcodes.io autocomplete (fast, reliable, free)
          const pResp = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleanPostcode)}/autocomplete`, { signal: AbortSignal.timeout(2000) });
          if (pResp.ok) {
            const pData = await pResp.json();
            if (pData.result && Array.isArray(pData.result)) {
              pData.result.slice(0, 4).forEach(pc => {
                results.push({
                  name: `${pc}, Greater London / UK`,
                  subtitle: `Full Postcode: ${pc}`,
                  category: 'postcode'
                });
              });
            }
          }
        } catch (e) {}
      }

      // 3. Query Photon / Nominatim for street & house number matching in UK
      if (results.length < 4 && q.length >= 3) {
        try {
          const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q + ', UK')}&limit=4`;
          const phResp = await fetch(photonUrl, { signal: AbortSignal.timeout(2000) });
          if (phResp.ok) {
            const phData = await phResp.json();
            if (phData.features && phData.features.length) {
              phData.features.forEach(f => {
                const props = f.properties || {};
                const nameParts = [props.housenumber, props.street || props.name, props.city || props.district, props.postcode].filter(Boolean);
                if (nameParts.length >= 2) {
                  const fullAddress = nameParts.join(', ');
                  if (!results.some(r => r.name.toLowerCase() === fullAddress.toLowerCase())) {
                    results.push({
                      name: fullAddress,
                      subtitle: props.state || 'United Kingdom',
                      lat: f.geometry?.coordinates ? f.geometry.coordinates[1] : null,
                      lng: f.geometry?.coordinates ? f.geometry.coordinates[0] : null,
                      category: 'address'
                    });
                  }
                }
              });
            }
          }
        } catch (e) {}
      }

      renderItems(results.slice(0, 6));
    };

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(handleSearch, 150);
    });

    input.addEventListener('focus', () => {
      if ((input.value || '').trim().length >= 2) {
        handleSearch();
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => { dropdown.style.display = 'none'; }, 250);
    });
  }

  window.initBookingAddresses = () => {
    try {
      if (window.onGoogleMapsReady) window.onGoogleMapsReady();

      const pickupInput = document.getElementById('booking-pickup');
      const destInput = document.getElementById('booking-destination');

      [pickupInput, destInput].forEach(input => {
        if (!input) return;

        input.hidden = false;
        input.style.display = 'block';
        input.setAttribute('autocomplete', 'off');

        // Setup resilient fast autocomplete
        setupResilientAutocomplete(input);

        // Safe Google Places Autocomplete if enabled without breaking UI
        if (window.google && window.google.maps && window.google.maps.places) {
          try {
            // const ac = new google.maps.places.Autocomplete(input, {
              componentRestrictions: { country: 'gb' },
              fields: ['formatted_address', 'geometry', 'name', 'address_components']
            });

            ac.addListener('place_changed', () => {
              const place = ac.getPlace();
              if (!place) return;

              let fullAddress = place.formatted_address || place.name || '';
              if (place.name && !fullAddress.toLowerCase().includes(place.name.toLowerCase())) {
                fullAddress = `${place.name}, ${fullAddress}`;
              }

              input.value = fullAddress;

              if (place.geometry && place.geometry.location) {
                input.dataset.lat = place.geometry.location.lat();
                input.dataset.lng = place.geometry.location.lng();
              }

              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            });
          } catch (acErr) {
            console.warn('Google Places Autocomplete graceful fallback:', acErr);
          }
        }
      });
    } catch (e) {
      console.warn('Booking address init warning:', e);
    }
  };

  // Expose global interface
  window.GABookingAddresses = {
    setAddress(id, value) {
      const input = document.getElementById(id);
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    },
    validate() {
      const p = document.getElementById('booking-pickup');
      const d = document.getElementById('booking-destination');
      const isHourly = form.elements.serviceType?.value === 'Hourly chauffeur service';
      if (!p || !p.value.trim()) {
        if (p) p.focus();
        return false;
      }
      if (!isHourly && (!d || !d.value.trim())) {
        if (d) d.focus();
        return false;
      }
      return true;
    }
  };

  // Initialize immediately for instant response
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initBookingAddresses);
  } else {
    window.initBookingAddresses();
  }

  // Load Google Maps API safely in background without blocking
  try {
    const script = document.createElement('script');
    script.src = 'https://maps.googleapis.com/maps/api/js?key=AIzaSyDNHZ7EWxRbvZVpuzAMJzfnKL4n4EPr9Xo&libraries=places,routes,geometry&loading=async&v=weekly&callback=initBookingAddresses';
    script.async = true;
    script.onerror = () => {
      if (window.onGoogleMapsReady) window.onGoogleMapsReady();
    };
    document.head.append(script);
  } catch (err) {}
})();
