/**
 * GA Chauffeur Services Limited - Multi-Step Instant Booking Engine
 * Elegant Light Luxury Design (Trouv Style) - 4-Step Streamlined Flow
 * Base Office: 1 Glebe Road, Stanmore, Greater London, HA7 4EJ
 * Direct 24/7 Desk: +44 7886 622082 | enquiries@gachauffeurs.co.uk
 */

(() => {
  const form = document.querySelector('#booking-form');
  if (!form) return;

  const status = document.querySelector('#booking-status');
  const submitBtn = document.querySelector('#booking-submit-btn');
  const query = new URLSearchParams(location.search);

  // 4 Streamlined Steps
  let currentStep = 1;
  const totalSteps = 4;
  const stepPanels = document.querySelectorAll('.booking-step-panel');
  const stepIndicators = document.querySelectorAll('.step-indicator');
  const whatsappLinks = document.querySelectorAll('.ga-whatsapp-trigger');

  function setStep(step) {
    if (step < 1 || step > totalSteps) return;
    currentStep = step;

    stepPanels.forEach(panel => {
      const panelStep = parseInt(panel.dataset.step, 10);
      panel.style.display = panelStep === step ? 'block' : 'none';
    });

    stepIndicators.forEach(ind => {
      const indStep = parseInt(ind.dataset.step, 10);
      if (indStep === step) {
        ind.classList.add('active');
        ind.style.borderColor = '#c9b894';
        ind.style.background = '#ffffff';
        ind.style.boxShadow = '0 2px 8px rgba(201,184,148,0.2)';
        const num = ind.querySelector('.step-num');
        if (num) { num.style.background = '#c9b894'; num.style.color = '#171c1c'; }
        const label = ind.querySelector('.step-label');
        if (label) label.style.color = '#171c1c';
      } else if (indStep < step) {
        ind.classList.add('completed');
        ind.classList.remove('active');
        ind.style.borderColor = '#34d399';
        ind.style.background = '#f9fbf9';
        ind.style.boxShadow = 'none';
        const num = ind.querySelector('.step-num');
        if (num) { num.style.background = '#34d399'; num.style.color = '#ffffff'; }
        const label = ind.querySelector('.step-label');
        if (label) label.style.color = '#065f46';
      } else {
        ind.classList.remove('active', 'completed');
        ind.style.borderColor = '#e2e8f0';
        ind.style.background = '#f8fafc';
        ind.style.boxShadow = 'none';
        const num = ind.querySelector('.step-num');
        if (num) { num.style.background = '#e2e8f0'; num.style.color = '#64748b'; }
        const label = ind.querySelector('.step-label');
        if (label) label.style.color = '#64748b';
      }
    });

    // Smooth scroll to top of booking container
    const widgetTop = document.querySelector('#ga-chauffeur-booking-widget');
    if (widgetTop) widgetTop.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (step === 1) {
      setTimeout(() => triggerMapResize(), 150);
    }
    updatePricingAndReview();
    updateWhatsAppLinks();
    updateConditionalFlightDisplay();
  }

  // Allow clicking on completed or visited steps
  stepIndicators.forEach(ind => {
    ind.style.cursor = 'pointer';
    ind.addEventListener('click', () => {
      const targetStep = parseInt(ind.dataset.step, 10);
      if (targetStep < currentStep || validateCurrentStep(currentStep)) {
        setStep(targetStep);
      }
    });
  });

  function getAddressVal(id) {
    const input = document.getElementById(id);
    return (input ? input.value : '').trim();
  }

  // Pre-fill from URL query
  for (const key of ['pickup', 'destination', 'vehicle']) {
    if (query.has(key) && form.elements[key]) form.elements[key].value = query.get(key).slice(0, 300);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.get('date') || '') && /^\d{2}:\d{2}$/.test(query.get('time') || '')) {
    if (form.elements.datetime) form.elements.datetime.value = query.get('date') + 'T' + query.get('time');
  }
  if (query.has('service') && form.elements.serviceType && [...form.elements.serviceType.options].some(o => o.value === query.get('service'))) {
    form.elements.serviceType.value = query.get('service');
  }

  // Date and Time Syncing
  const dateInput = document.querySelector('#booking-date');
  const timeInput = document.querySelector('#booking-time');
  const datetimeHidden = form.elements.datetime;

  const syncDateTime = () => {
    if (dateInput && timeInput && datetimeHidden) {
      if (dateInput.value && timeInput.value) {
        datetimeHidden.value = `${dateInput.value}T${timeInput.value}`;
      }
    }
    updateWhatsAppLinks();
    updatePricingAndReview();
  };

  if (dateInput && timeInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    if (!dateInput.value) dateInput.value = `${yyyy}-${mm}-${dd}`;
    if (!timeInput.value) timeInput.value = '10:00';
    dateInput.addEventListener('change', syncDateTime);
    timeInput.addEventListener('change', syncDateTime);
  }

  // Service Chips & Dynamic Toggling
  const chips = document.querySelectorAll('.ga-service-chip');
  const flightGroup = document.querySelector('#booking-flight-group');

  const onServiceChange = () => {
    const s = form.elements.serviceType.value;
    const isHourly = s === 'Hourly chauffeur service';

    chips.forEach(chip => {
      const match = chip.dataset.service === s || (s.startsWith('Airport') && chip.dataset.service === 'Airport arrival');
      if (match) {
        chip.classList.add('active');
        chip.style.background = '#17201b';
        chip.style.borderColor = '#17201b';
        chip.style.color = '#ffffff';
      } else {
        chip.classList.remove('active');
        chip.style.background = '#ffffff';
        chip.style.borderColor = '#cbd5e1';
        chip.style.color = '#475569';
      }
    });

    if (isHourly) {
      form.elements.destination.required = false;
      form.elements.destination.placeholder = 'As directed (or enter first destination)';
    } else {
      form.elements.destination.required = true;
      form.elements.destination.placeholder = 'Enter drop-off address or postcode';
    }

    updateConditionalFlightDisplay();
    updateRouteAndMetrics();
    updatePricingAndReview();
    updateWhatsAppLinks();
  };

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      form.elements.serviceType.value = chip.dataset.service;
      onServiceChange();
    });
  });

  if (form.elements.serviceType) {
    form.elements.serviceType.addEventListener('change', onServiceChange);
  }

  // Vehicle Selection in Step 2
  const vehicleCards = document.querySelectorAll('.ga-vehicle-card');
  const vehicleInput = form.elements.vehicle;

  const selectVehicle = (name) => {
    if (vehicleInput) vehicleInput.value = name;
    vehicleCards.forEach(card => {
      const isSel = card.dataset.vehicle === name;
      card.classList.toggle('selected', isSel);
      card.style.borderColor = isSel ? '#c9b894' : '#e2e8f0';
      card.style.background = isSel ? '#faf8f3' : '#ffffff';
      card.style.boxShadow = isSel ? '0 8px 24px rgba(201,184,148,0.2)' : 'none';
      const checkBadge = card.querySelector('.vehicle-select-badge');
      if (checkBadge) {
        checkBadge.textContent = isSel ? '✓ Selected' : 'Select Vehicle';
        checkBadge.style.background = isSel ? '#c9b894' : '#f1f5f9';
        checkBadge.style.color = isSel ? '#171c1c' : '#475569';
      }
    });
    checkCapacity();
    updatePricingAndReview();
    updateWhatsAppLinks();
  };

  vehicleCards.forEach(card => {
    card.addEventListener('click', () => {
      selectVehicle(card.dataset.vehicle);
    });
  });

  // Coordinates Database for Key UK Hubs & London Postcodes
  const LOCATION_COORDS = {
    'lhr': { lat: 51.4700, lng: -0.4543 },
    'heathrow': { lat: 51.4700, lng: -0.4543 },
    't5': { lat: 51.4700, lng: -0.4840 },
    'terminal 5': { lat: 51.4700, lng: -0.4840 },
    't2': { lat: 51.4696, lng: -0.4506 },
    't3': { lat: 51.4716, lng: -0.4578 },
    't4': { lat: 51.4585, lng: -0.4452 },
    'lgw': { lat: 51.1537, lng: -0.1821 },
    'gatwick': { lat: 51.1537, lng: -0.1821 },
    'lcy': { lat: 51.5048, lng: 0.0495 },
    'london city': { lat: 51.5048, lng: 0.0495 },
    'fab': { lat: 51.2758, lng: -0.7763 },
    'farnborough': { lat: 51.2758, lng: -0.7763 },
    'bqh': { lat: 51.3308, lng: 0.0325 },
    'biggin hill': { lat: 51.3308, lng: 0.0325 },
    'ltn': { lat: 51.8763, lng: -0.3717 },
    'luton': { lat: 51.8763, lng: -0.3717 },
    'stn': { lat: 51.8860, lng: 0.2389 },
    'stansted': { lat: 51.8860, lng: 0.2389 },
    'northolt': { lat: 51.5531, lng: -0.4181 },
    'battersea': { lat: 51.4700, lng: -0.1786 },
    'mayfair': { lat: 51.5090, lng: -0.1470 },
    'westminster': { lat: 51.4995, lng: -0.1333 },
    'knightsbridge': { lat: 51.5015, lng: -0.1610 },
    'canary wharf': { lat: 51.5054, lng: -0.0235 },
    'city of london': { lat: 51.5123, lng: -0.0918 },
    'stanmore': { lat: 51.6167, lng: -0.3167 },
    'glebe road': { lat: 51.6167, lng: -0.3167 },
    'ha7 4ej': { lat: 51.6167, lng: -0.3167 }
  };

  function guessCoordinates(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    for (const [key, coords] of Object.entries(LOCATION_COORDS)) {
      if (lower.includes(key)) return coords;
    }
    if (/w1|sw1|wc1|ec1|se1|nw1|london/i.test(text)) {
      return { lat: 51.5074, lng: -0.1278 };
    }
    return null;
  }

  function calculateGeoDistance(lat1, lon1, lat2, lon2) {
    const R = 3958.8; // Earth radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round((R * c * 1.35) * 10) / 10;
  }

  let journeyDistanceMiles = 17.0;
  let journeyDurationMinutes = 45;

  const isAirportLocation = text => /\b(airport|lhr|heathrow|t5|t2|t3|t4|terminal|lgw|gatwick|lcy|london city|stn|stansted|ltn|luton|fab|farnborough|bqh|biggin|northolt|aviation|fbo)\b/i.test(text || '');
  const isHeathrowOrAirportDropoff = text => /\b(airport|lhr|heathrow|t5|t2|t3|t4|terminal|lgw|gatwick|lcy|stn|ltn|fab|bqh)\b/i.test(text || '');
  const isCongestionLocation = text => /\b(ec1|ec2|ec3|ec4|wc1|wc2|w1|sw1|se1|nw1|mayfair|soho|westminster|covent garden|fitzrovia|marylebone|city of london|bank|st paul|st james|belgravia|knightsbridge|victoria|waterloo|southwark|london bridge)\b/i.test(text || '');

  // Conditional Flight Number Field (pops out ONLY if airport is detected in pickup or dropoff or service category)
  function updateConditionalFlightDisplay() {
    if (!flightGroup) return;
    const pVal = getAddressVal('booking-pickup');
    const dVal = getAddressVal('booking-destination');
    const sType = form.elements.serviceType?.value || '';
    const needsFlight = isAirportLocation(pVal) || isAirportLocation(dVal) || sType.startsWith('Airport') || sType === 'Private aviation';

    flightGroup.style.display = needsFlight ? 'block' : 'none';
  }

  // Google Maps in Hybrid / Satellite Mode with Live Traffic Layer & Start/End Pins
  let gMap = null;
  let trafficLayer = null;
  let pickupMarker = null;
  let dropoffMarker = null;
  let routeLines = [];
  let routeRequestId = 0;
  let leafletMap = null;

  function initGoogleMap() {
    const mapEl = document.querySelector('#booking-map');
    if (!mapEl || gMap || leafletMap) return;

    window.gm_authFailure = () => {
      console.warn('Google Maps auth failure, switching to satellite fallback');
      gMap = null;
      mapEl.innerHTML = '';
      initLeafletFallback(mapEl);
    };

    if (window.google && window.google.maps) {
      try {
        gMap = new google.maps.Map(mapEl, {
          center: { lat: 51.5074, lng: -0.1278 }, // Central London
          zoom: 11,
          mapTypeId: google.maps.MapTypeId.HYBRID, // Green Satellite Imagery + Street Names + Labels
          mapTypeControl: true,
          mapTypeControlOptions: {
            style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
            mapTypeIds: [google.maps.MapTypeId.HYBRID, google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.SATELLITE]
          },
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true
        });

        // Add real-time live traffic overlay
        trafficLayer = new google.maps.TrafficLayer();
        trafficLayer.setMap(gMap);

        updateRouteAndMetrics();
        return;
      } catch (err) {
        console.warn('Google Maps setup failed, loading Leaflet fallback:', err);
      }
    }

    initLeafletFallback(mapEl);
  }

  function initLeafletFallback(mapEl) {
    if (leafletMap || !mapEl) return;
    mapEl.innerHTML = '';
    const setupL = () => {
      try {
        leafletMap = L.map(mapEl, { attributionControl: false }).setView([51.5074, -0.1278], 11);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(leafletMap);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(leafletMap);
        updateRouteAndMetrics();
      } catch (e) {
        console.warn('Leaflet map error:', e);
      }
    };

    if (!window.L) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = setupL;
      document.head.appendChild(script);
    } else {
      setupL();
    }
  }

  function triggerMapResize() {
    if (gMap && window.google && window.google.maps) {
      google.maps.event.trigger(gMap, 'resize');
    }
    if (leafletMap) {
      leafletMap.invalidateSize();
    }
  }

  window.onGoogleMapsReady = initGoogleMap;

  // Custom Markers for Satellite Hybrid Map
  function getPinIcon(label, color, bg) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
        <path d="M17 0C7.6 0 0 7.6 0 17c0 12.5 17 27 17 27s17-14.5 17-27C34 7.6 26.4 0 17 0z" fill="${bg}" stroke="#ffffff" stroke-width="2"/>
        <circle cx="17" cy="17" r="8" fill="#ffffff"/>
        <text x="17" y="21" font-family="Arial,sans-serif" font-size="11" font-weight="bold" fill="${color}" text-anchor="middle">${label}</text>
      </svg>
    `;
    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: new google.maps.Size(34, 44),
      anchor: new google.maps.Point(17, 44)
    };
  }

  function updatePins(pCoords, dCoords, bounds) {
    if (!gMap || !window.google || !window.google.maps) return;

    if (pCoords) {
      const posA = new google.maps.LatLng(pCoords.lat, pCoords.lng);
      if (!pickupMarker) {
        pickupMarker = new google.maps.Marker({
          position: posA,
          map: gMap,
          title: 'Pickup Location',
          icon: getPinIcon('A', '#059669', '#10b981')
        });
      } else {
        pickupMarker.setPosition(posA);
        pickupMarker.setMap(gMap);
      }
      if (bounds) bounds.extend(posA);
    } else if (pickupMarker) {
      pickupMarker.setMap(null);
    }

    if (dCoords) {
      const posB = new google.maps.LatLng(dCoords.lat, dCoords.lng);
      if (!dropoffMarker) {
        dropoffMarker = new google.maps.Marker({
          position: posB,
          map: gMap,
          title: 'Drop-off Destination',
          icon: getPinIcon('B', '#b45309', '#f59e0b')
        });
      } else {
        dropoffMarker.setPosition(posB);
        dropoffMarker.setMap(gMap);
      }
      if (bounds) bounds.extend(posB);
    } else if (dropoffMarker) {
      dropoffMarker.setMap(null);
    }
  }

  async function updateRouteAndMetrics() {
    const requestId = ++routeRequestId;
    routeLines.forEach(line => line.setMap(null));
    routeLines = [];
    const pVal = getAddressVal('booking-pickup');
    const dVal = getAddressVal('booking-destination');
    const isHourly = form.elements.serviceType?.value === 'Hourly chauffeur service';

    const distEl = document.querySelector('#booking-route-distance');
    const durEl = document.querySelector('#booking-route-duration');
    const locsEl = document.querySelector('#booking-route-locations');

    updateConditionalFlightDisplay();

    if (isHourly) {
      journeyDistanceMiles = 20.0;
      journeyDurationMinutes = 120;
      if (distEl) distEl.textContent = '20 miles (included)';
      if (durEl) durEl.textContent = '2 hours allocated';
      if (locsEl) locsEl.textContent = `${pVal || 'London'} (As directed)`;

      const pCoords = guessCoordinates(pVal) || { lat: 51.5074, lng: -0.1278 };
      if (gMap) {
        updatePins(pCoords, null, null);
        gMap.panTo(pCoords);
        gMap.setZoom(12);
      }
      return;
    }

    if (!pVal || !dVal) {
      if (distEl) distEl.textContent = '—';
      if (durEl) durEl.textContent = '—';
      if (locsEl) locsEl.textContent = 'Enter pickup & drop-off locations to render route';

      const singleCoords = guessCoordinates(pVal) || guessCoordinates(dVal);
      if (singleCoords && gMap) {
        updatePins(guessCoordinates(pVal), guessCoordinates(dVal), null);
        gMap.panTo(singleCoords);
      }
      return;
    }

    // Attempt Google Routes API
    if (gMap && window.google?.maps?.importLibrary) {
      try {
        const { Route } = await google.maps.importLibrary('routes');
        if (requestId !== routeRequestId) return;
        const { routes } = await Route.computeRoutes({
          origin: pVal,
          destination: dVal,
          travelMode: 'DRIVING',
          fields: ['path', 'distanceMeters', 'durationMillis']
        });
        if (requestId !== routeRequestId) return;
        const route = routes?.[0];
        if (!route?.path?.length) throw new Error('No driving route found');

        // Route Polyline with high-contrast glowing emerald & gold styling for Satellite mode
        routeLines = route.createPolylines({ polylineOptions: {
          strokeColor: '#34d399',
          strokeWeight: 6,
          strokeOpacity: 0.95
        }});
        routeLines.forEach(line => line.setMap(gMap));

        const bounds = new google.maps.LatLngBounds();
        route.path.forEach(point => bounds.extend(point));

        const startPt = route.path[0];
        const endPt = route.path[route.path.length - 1];
        updatePins(
          { lat: startPt.lat(), lng: startPt.lng() },
          { lat: endPt.lat(), lng: endPt.lng() },
          bounds
        );

        gMap.fitBounds(bounds, { top: 40, bottom: 40, left: 40, right: 40 });

        journeyDistanceMiles = Math.round(route.distanceMeters / 1609.344 * 10) / 10;
        journeyDurationMinutes = Math.round(route.durationMillis / 60000);
        const hoursPart = Math.floor(journeyDurationMinutes / 60);
        const minsPart = journeyDurationMinutes % 60;
        if (distEl) distEl.textContent = `${journeyDistanceMiles.toFixed(1)} miles`;
        if (durEl) durEl.textContent = `Approx. ${hoursPart ? hoursPart + ' hr ' : ''}${minsPart} mins`;
        if (locsEl) locsEl.textContent = `${pVal} ➔ ${dVal}`;

        updatePricingAndReview();
        updateWhatsAppLinks();
        return;
      } catch (error) {
        if (requestId !== routeRequestId) return;
        console.warn('Google Routes API computeRoutes error, using coordinate routing:', error);
      }
    }

    fallbackGeodesic(pVal, dVal);
  }

  function fallbackGeodesic(pVal, dVal) {
    const distEl = document.querySelector('#booking-route-distance');
    const durEl = document.querySelector('#booking-route-duration');
    const locsEl = document.querySelector('#booking-route-locations');

    const pInput = document.getElementById('booking-pickup');
    const dInput = document.getElementById('booking-destination');

    const pCoords = (pInput?.dataset.lat && pInput?.dataset.lng)
      ? { lat: parseFloat(pInput.dataset.lat), lng: parseFloat(pInput.dataset.lng) }
      : (guessCoordinates(pVal) || { lat: 51.4700, lng: -0.4840 });

    const dCoords = (dInput?.dataset.lat && dInput?.dataset.lng)
      ? { lat: parseFloat(dInput.dataset.lat), lng: parseFloat(dInput.dataset.lng) }
      : (guessCoordinates(dVal) || { lat: 51.5074, lng: -0.1278 });

    const miles = calculateGeoDistance(pCoords.lat, pCoords.lng, dCoords.lat, dCoords.lng);
    journeyDistanceMiles = Math.max(5.0, miles);
    journeyDurationMinutes = Math.round(journeyDistanceMiles * 2.2 + 10);

    const hoursPart = Math.floor(journeyDurationMinutes / 60);
    const minsPart = journeyDurationMinutes % 60;
    const durStr = hoursPart > 0 ? `${hoursPart} hr ${minsPart} mins` : `${minsPart} mins`;

    if (distEl) distEl.textContent = `${journeyDistanceMiles.toFixed(1)} miles`;
    if (durEl) durEl.textContent = `Approx. ${durStr}`;
    if (locsEl) locsEl.textContent = `${pVal.split(',')[0]} ➔ ${dVal.split(',')[0]}`;

    if (gMap && window.google && window.google.maps) {
      const bounds = new google.maps.LatLngBounds();
      updatePins(pCoords, dCoords, bounds);
      const line = new google.maps.Polyline({
        path: [pCoords, dCoords],
        geodesic: true,
        strokeColor: '#34d399',
        strokeOpacity: 0.9,
        strokeWeight: 5
      });
      line.setMap(gMap);
      routeLines.push(line);
      gMap.fitBounds(bounds, { top: 40, bottom: 40, left: 40, right: 40 });
    }

    if (leafletMap && window.L) {
      if (window.leafletRouteLayer) leafletMap.removeLayer(window.leafletRouteLayer);
      const polyline = L.polyline([[pCoords.lat, pCoords.lng], [dCoords.lat, dCoords.lng]], {
        color: '#34d399',
        weight: 5,
        opacity: 0.9
      });
      const mA = L.circleMarker([pCoords.lat, pCoords.lng], { radius: 7, fillColor: '#10b981', color: '#fff', weight: 2, fillOpacity: 1 });
      const mB = L.circleMarker([dCoords.lat, dCoords.lng], { radius: 7, fillColor: '#f59e0b', color: '#fff', weight: 2, fillOpacity: 1 });
      window.leafletRouteLayer = L.layerGroup([polyline, mA, mB]).addTo(leafletMap);
      leafletMap.fitBounds(polyline.getBounds(), { padding: [35, 35] });
    }

    updatePricingAndReview();
    updateWhatsAppLinks();
  }

  // Tariff & Review Calculations (Strict London Rules: Congestion £18, Parking £15, Drop-off £7)
  function updatePricingAndReview() {
    const v = form.elements.vehicle?.value || 'Mercedes-Benz S-Class';
    const s = form.elements.serviceType?.value || 'Point-to-point transfer';
    const isHourly = s === 'Hourly chauffeur service';
    const pVal = getAddressVal('booking-pickup');
    const dVal = getAddressVal('booking-destination');

    let base = 165;
    if (isHourly) {
      const rate = v === 'Mercedes-Benz S-Class' ? 85 : v === 'Mercedes-Benz V-Class' ? 95 : v === 'Range Rover Autobiography Long Wheelbase' ? 115 : 85;
      base = rate * 2; // minimum 2 hours base
    } else {
      const isOuter = /\b(gatwick|lgw|luton|ltn|stansted|stn|farnborough|fab|biggin hill|bqh)\b/i.test(pVal + ' ' + dVal);
      if (v === 'Mercedes-Benz S-Class') base = isOuter ? 305 : 165;
      else if (v === 'Mercedes-Benz V-Class') base = isOuter ? 315 : 175;
      else if (v === 'Range Rover Autobiography Long Wheelbase') base = isOuter ? 405 : 225;
      else base = 165;
    }

    // Airport Parking: £15 (on airport collections / arrivals)
    const hasParking = s === 'Airport arrival' || isAirportLocation(pVal);
    const parkingFee = hasParking ? 15 : 0;

    // Airport Drop-off Charge: £7 (e.g. London to Heathrow or Airport departures)
    const hasDropoffCharge = isHeathrowOrAirportDropoff(dVal) || s === 'Airport departure';
    const dropoffFee = hasDropoffCharge ? 7 : 0;

    // London Congestion Charge: £18 (auto-added if pickup or drop-off in CC zone)
    const hasCongestion = isCongestionLocation(pVal) || isCongestionLocation(dVal);
    const congestionFee = hasCongestion ? 18 : 0;

    const subtotal = base + parkingFee + dropoffFee + congestionFee;
    const tax = Math.round(subtotal * 0.20 * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    // Update vehicle card prices in Step 2
    const sPrice = document.querySelector('#price-sclass');
    const vPrice = document.querySelector('#price-vclass');
    const rPrice = document.querySelector('#price-rr');

    if (isHourly) {
      if (sPrice) sPrice.textContent = `£170.00`;
      if (vPrice) vPrice.textContent = `£190.00`;
      if (rPrice) rPrice.textContent = `£230.00`;
    } else {
      const isOuter = /\b(gatwick|lgw|luton|ltn|stansted|stn|farnborough|fab|biggin hill|bqh)\b/i.test(pVal + ' ' + dVal);
      if (sPrice) sPrice.textContent = isOuter ? '£305.00' : '£165.00';
      if (vPrice) vPrice.textContent = isOuter ? '£315.00' : '£175.00';
      if (rPrice) rPrice.textContent = isOuter ? '£405.00' : '£225.00';
    }

    // Update Step 4 Itemized Receipt
    const revBase = document.querySelector('#review-base-fare');
    const revParkingRow = document.querySelector('#review-row-parking');
    const revParkingVal = document.querySelector('#review-parking-fee');
    const revDropoffRow = document.querySelector('#review-row-dropoff');
    const revDropoffVal = document.querySelector('#review-dropoff-fee');
    const revCongRow = document.querySelector('#review-row-congestion');
    const revCongVal = document.querySelector('#review-congestion-fee');
    const revTax = document.querySelector('#review-tax-fare');
    const revTotal = document.querySelector('#review-total-fare');

    if (revBase) revBase.textContent = `£${base.toFixed(2)}`;
    if (revParkingRow) revParkingRow.style.display = hasParking ? 'flex' : 'none';
    if (revParkingVal) revParkingVal.textContent = '+£15.00';
    if (revDropoffRow) revDropoffRow.style.display = hasDropoffCharge ? 'flex' : 'none';
    if (revDropoffVal) revDropoffVal.textContent = '+£7.00';
    if (revCongRow) revCongRow.style.display = hasCongestion ? 'flex' : 'none';
    if (revCongVal) revCongVal.textContent = '+£18.00';
    if (revTax) revTax.textContent = `£${tax.toFixed(2)}`;
    if (revTotal) revTotal.textContent = `£${total.toFixed(2)}`;

    // Update Step 4 Summary Box
    const sumRoute = document.querySelector('#review-summary-route');
    const sumVehicle = document.querySelector('#review-summary-vehicle');
    const sumDateTime = document.querySelector('#review-summary-datetime');
    const sumMetrics = document.querySelector('#review-summary-metrics');
    const sumParty = document.querySelector('#review-summary-party');

    const passCount = form.elements.passengers?.value || '1';
    const luggageCount = form.elements.largeCases?.value || '1';

    if (sumRoute) sumRoute.textContent = `${pVal || 'Pickup'} ➔ ${dVal || (isHourly ? 'As directed' : 'Destination')}`;
    if (sumVehicle) sumVehicle.textContent = v;
    if (sumDateTime) sumDateTime.textContent = (datetimeHidden?.value || '').replace('T', ' at ');
    if (sumMetrics) sumMetrics.textContent = `${journeyDistanceMiles.toFixed(1)} miles • approx. ${journeyDurationMinutes} mins`;
    if (sumParty) sumParty.textContent = `${passCount} Passenger${passCount > 1 ? 's' : ''} • ${luggageCount} Luggage / Suitcase${luggageCount > 1 ? 's' : ''}`;

    if (submitBtn) {
      submitBtn.textContent = `Pre-Authorise £${total.toFixed(2)} & Confirm Booking ↗`;
    }
  }

  // Dynamic WhatsApp Message Formatter
  function updateWhatsAppLinks() {
    const s = form.elements.serviceType?.value || 'Chauffeur service';
    const v = form.elements.vehicle?.value || 'Mercedes-Benz S-Class';
    const p = getAddressVal('booking-pickup');
    const d = getAddressVal('booking-destination');
    const dt = form.elements.datetime?.value || '';
    const passengers = form.elements.passengers?.value || '1';
    const luggage = form.elements.largeCases?.value || '1';
    const flight = form.querySelector('#booking-flight')?.value || '';

    let text = `Hello GA Chauffeurs, I would like to book an executive chauffeur journey:\n\n`;
    text += `• Service: ${s}\n`;
    if (dt) text += `• Date & Time: ${dt.replace('T', ' at ')}\n`;
    if (p) text += `• Pickup: ${p}\n`;
    if (d) text += `• Destination: ${d}\n`;
    text += `• Route Estimate: ${journeyDistanceMiles.toFixed(1)} miles (~${journeyDurationMinutes} mins)\n`;
    text += `• Vehicle: ${v}\n`;
    text += `• Passengers: ${passengers} | Luggage: ${luggage} Suitcases\n`;
    if (flight) text += `• Flight Number: ${flight}\n`;

    const totalEl = document.querySelector('#review-total-fare');
    if (totalEl) text += `• Total Hold Rate: ${totalEl.textContent} (inc. UK tax)\n`;
    text += `\nPlease confirm executive chauffeur availability.`;

    const encoded = `https://wa.me/447886622082?text=${encodeURIComponent(text)}`;
    whatsappLinks.forEach(link => { link.href = encoded; });
  }

  // Capacity Assessment (Checks luggage and passengers against vehicle limits)
  const capacityStatus = document.querySelector('#booking-capacity');
  function checkCapacity() {
    const rawLuggage = parseInt(form.elements.largeCases?.value || '1', 10);
    const passCount = parseInt(form.elements.passengers?.value || '1', 10);
    const vehicle = form.elements.vehicle?.value || 'Mercedes-Benz S-Class';

    let luggageError = '';
    let passengerError = '';

    if (vehicle === 'Mercedes-Benz S-Class' || vehicle === 'Range Rover Autobiography Long Wheelbase') {
      if (passCount > 3) {
        passengerError = `The ${vehicle.includes('S-Class') ? 'S-Class' : 'Range Rover'} seats up to 3 passengers comfortably with luggage.`;
      }
      if (rawLuggage > 2) {
        luggageError = `The ${vehicle.includes('S-Class') ? 'S-Class' : 'Range Rover'} accommodates up to 2 large suitcases.`;
      }
    } else if (vehicle === 'Mercedes-Benz V-Class') {
      if (passCount > 7) {
        passengerError = 'The Mercedes-Benz V-Class seats up to 7 passengers.';
      }
      if (rawLuggage > 8) {
        luggageError = 'The V-Class accommodates up to 8 large suitcases.';
      }
    }

    const invalid = Boolean(passengerError || luggageError);

    if (capacityStatus) {
      capacityStatus.style.display = invalid ? 'block' : 'none';
      capacityStatus.innerHTML = '';
      if (invalid) {
        const msg = document.createElement('div');
        msg.style.cssText = 'background: #fff5f5; border: 1px solid #feb2b2; color: #9b2c2c; padding: 14px 18px; border-radius: 6px; font-size: 13px; margin: 12px 0; line-height: 1.5;';
        msg.innerHTML = `<strong>Capacity Notice:</strong> ${[passengerError, luggageError].filter(Boolean).join(' ')}<br>`;

        if (vehicle !== 'Mercedes-Benz V-Class') {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = 'Switch to Mercedes-Benz V-Class (Recommended) ↗';
          btn.style.cssText = 'background: #17201b; color: #ffffff; font-weight: bold; border: none; padding: 9px 16px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-top: 10px; display: inline-block;';
          btn.onclick = () => selectVehicle('Mercedes-Benz V-Class');
          msg.appendChild(btn);
        }
        capacityStatus.appendChild(msg);
      }
    }
    return !invalid;
  }

  // Step Validation & Progression
  function validateCurrentStep(step) {
    if (step === 1) {
      const p = getAddressVal('booking-pickup');
      const d = getAddressVal('booking-destination');
      const isHourly = form.elements.serviceType?.value === 'Hourly chauffeur service';

      if (!p) {
        const pInput = form.elements.pickup;
        pInput.focus();
        pInput.style.borderColor = '#e53e3e';
        alert('Please enter your pickup location.');
        return false;
      }

      if (!d && !isHourly) {
        const dInput = form.elements.destination;
        dInput.focus();
        dInput.style.borderColor = '#e53e3e';
        alert('Please enter your drop-off location.');
        return false;
      }

      if (!dateInput.value || !timeInput.value) {
        alert('Please choose your pickup date and time.');
        return false;
      }
      return true;
    }

    if (step === 2) {
      return true;
    }

    if (step === 3) {
      const name = (form.elements.name?.value || '').trim();
      const email = (form.elements.email?.value || '').trim();
      const phone = (form.elements.phone?.value || '').trim();

      if (!name) {
        form.elements.name.focus();
        alert('Please enter lead passenger full name.');
        return false;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        form.elements.email.focus();
        alert('Please enter a valid email address.');
        return false;
      }
      if (!phone) {
        form.elements.phone.focus();
        alert('Please enter your contact phone number.');
        return false;
      }

      if (!checkCapacity()) {
        alert('Selected vehicle capacity exceeded for your passenger/luggage requirements. Please switch to the Mercedes-Benz V-Class or adjust party size.');
        return false;
      }
      return true;
    }

    return true;
  }

  // Next / Previous Step Buttons
  document.querySelectorAll('.btn-next-step').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const nextStep = parseInt(btn.dataset.next, 10);
      if (validateCurrentStep(currentStep)) {
        setStep(nextStep);
      }
    });
  });

  document.querySelectorAll('.btn-prev-step').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const prevStep = parseInt(btn.dataset.prev, 10);
      setStep(prevStep);
    });
  });

  // Credit Card Formatting (Step 4)
  const cardNum = form.querySelector('#booking-cardnumber');
  const cardExp = form.querySelector('#booking-cardexpiry');
  const cardCvc = form.querySelector('#booking-cardcvc');

  if (cardNum) {
    cardNum.addEventListener('input', e => {
      let val = e.target.value.replace(/\D/g, '').slice(0, 16);
      e.target.value = val.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
    });
  }
  if (cardExp) {
    cardExp.addEventListener('input', e => {
      let val = e.target.value.replace(/\D/g, '').slice(0, 4);
      if (val.length >= 2) e.target.value = val.slice(0, 2) + ' / ' + val.slice(2);
      else e.target.value = val;
    });
  }
  if (cardCvc) {
    cardCvc.addEventListener('input', e => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    });
  }

  // Real-time Event Listeners
  ['input', 'change'].forEach(ev => {
    if (form.elements.pickup) form.elements.pickup.addEventListener(ev, () => { updateRouteAndMetrics(); updatePricingAndReview(); updateWhatsAppLinks(); });
    if (form.elements.destination) form.elements.destination.addEventListener(ev, () => { updateRouteAndMetrics(); updatePricingAndReview(); updateWhatsAppLinks(); });
    if (form.elements.passengers) form.elements.passengers.addEventListener(ev, () => { checkCapacity(); updatePricingAndReview(); updateWhatsAppLinks(); });
    if (form.elements.largeCases) form.elements.largeCases.addEventListener(ev, () => { checkCapacity(); updatePricingAndReview(); updateWhatsAppLinks(); });
    const flightEl = form.querySelector('#booking-flight');
    if (flightEl) flightEl.addEventListener(ev, updateWhatsAppLinks);
  });

  // Form Submission (Step 4 Pre-Authorisation)
  let sending = false;
  let requestId = crypto.randomUUID();

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending) return;

    if (!form.reportValidity()) return;
    if (!checkCapacity()) {
      alert('Selected vehicle capacity exceeded. Please switch to the Mercedes-Benz V-Class.');
      setStep(2);
      return;
    }

    const data = Object.fromEntries(new FormData(form));
    const isHourly = data.serviceType === 'Hourly chauffeur service';
    const flightNo = form.querySelector('#booking-flight')?.value || '';

    let fullNotes = (data.notes || '').trim();
    if (isHourly) {
      data.destination = data.destination || 'As directed';
    }
    if (flightNo) fullNotes = `[Flight: ${flightNo}] ` + fullNotes;

    const pVal = getAddressVal('booking-pickup');
    const dVal = getAddressVal('booking-destination');
    const v = data.vehicle;

    let base = 165;
    if (isHourly) {
      const rate = v === 'Mercedes-Benz S-Class' ? 85 : v === 'Mercedes-Benz V-Class' ? 95 : v === 'Range Rover Autobiography Long Wheelbase' ? 115 : 85;
      base = rate * 2;
    } else {
      const isOuter = /\b(gatwick|lgw|luton|ltn|stansted|stn|farnborough|fab|biggin hill|bqh)\b/i.test(pVal + ' ' + dVal);
      if (v === 'Mercedes-Benz S-Class') base = isOuter ? 305 : 165;
      else if (v === 'Mercedes-Benz V-Class') base = isOuter ? 315 : 175;
      else if (v === 'Range Rover Autobiography Long Wheelbase') base = isOuter ? 405 : 225;
      else base = 165;
    }

    const hasParking = data.serviceType === 'Airport arrival' || isAirportLocation(pVal);
    const hasDropoffCharge = isHeathrowOrAirportDropoff(dVal) || data.serviceType === 'Airport departure';
    const hasCongestion = isCongestionLocation(pVal) || isCongestionLocation(dVal);

    const parkingFee = hasParking ? 15 : 0;
    const dropoffFee = hasDropoffCharge ? 7 : 0;
    const congestionFee = hasCongestion ? 18 : 0;

    const subtotal = base + parkingFee + dropoffFee + congestionFee;
    const tax = Math.round(subtotal * 0.20 * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    sending = true;
    submitBtn.disabled = true;
    status.style.display = 'block';
    status.style.background = '#f8fafc';
    status.style.border = '1px solid #cbd5e1';
    status.style.color = '#1e293b';
    status.textContent = 'Securing credit card pre-authorisation hold with Stripe…';

    const rawLuggage = parseInt(data.largeCases || 1, 10);
    const largeCases = rawLuggage > 1 && v === 'Mercedes-Benz S-Class' ? 1 : rawLuggage;
    const mediumCases = rawLuggage > 1 && v === 'Mercedes-Benz S-Class' ? 1 : 0;

    const payload = {
      customer_name: data.name,
      name: data.name,
      customer_email: data.email,
      email: data.email,
      customer_phone: data.phone,
      phone: data.phone,
      service_type: data.serviceType || 'Point-to-point transfer',
      pickup_address: pVal,
      pickup: pVal,
      dropoff_address: dVal || (isHourly ? 'As directed' : pVal),
      dropoff: dVal || (isHourly ? 'As directed' : pVal),
      pickup_datetime: (data.datetime || '').replace('T', ' '),
      datetime: data.datetime,
      vehicle_class: data.vehicle === 'Mercedes-Benz S-Class' ? 'mercedes_s_class' : data.vehicle === 'Mercedes-Benz V-Class' ? 'mercedes_v_class' : data.vehicle === 'Range Rover Autobiography Long Wheelbase' ? 'range_rover_autobiography' : data.vehicle,
      vehicle: data.vehicle,
      passengers: data.passengers,
      passenger_count: parseInt(data.passengers, 10) || 1,
      large_cases: largeCases,
      medium_cases: mediumCases,
      hand_luggage: 0,
      special_requests: data.specialRequests,
      notes: fullNotes,
      flight_number: flightNo,
      card_number: (data.cardNumber || '').replace(/\s+/g, ''),
      cardholder_name: data.cardholderName || data.name,
      card_expiry: data.cardExpiry || '',
      card_cvc: data.cardCvc || '',
      payment_method: 'CREDIT_CARD',
      parking_fee: parkingFee,
      airport_dropoff_fee: dropoffFee,
      congestion_charge: congestionFee,
      total_fare: total,
      fare_amount: base,
      vat_amount: tax,
      estimated_distance_mi: journeyDistanceMiles,
      estimated_duration_min: journeyDurationMinutes,
      client_reference: requestId,
      source: 'WEBSITE_GACHAUFFEURS'
    };

    let dispatchSuccess = false;
    let paymentPreAuthorized = false;
    let dispatchRef = null;
    let dispatchError = null;

    try {
      const res = await fetch('https://dispatch.gachauffeurs.co.uk/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(18000)
      });
      const jsonRes = await res.json().catch(() => ({}));

      if (res.ok && (jsonRes.ok || jsonRes.success)) {
        dispatchSuccess = true;
        dispatchRef = jsonRes.reference || jsonRes.booking?.confirmation_code || jsonRes.booking_id;
        paymentPreAuthorized = (jsonRes.booking?.payment_status === 'PRE_AUTHORIZED') || (jsonRes.payment_status === 'PRE_AUTHORIZED');
      } else {
        dispatchError = jsonRes.error || 'Card pre-authorisation could not be verified.';
      }
    } catch (err) {
      dispatchError = 'Unable to reach payment authorization gateway.';
    }

    const {cardNumber, cardExpiry, cardCvc, cardholderName, ...bookingData} = data;
    const {card_number, card_expiry, card_cvc, cardholder_name, ...bookingPayload} = payload;
    fetch('/api/booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...bookingData, ...bookingPayload, notes: fullNotes, requestId }),
      signal: AbortSignal.timeout(10000)
    }).catch(() => {});

    sending = false;
    submitBtn.disabled = false;

    if (dispatchSuccess && paymentPreAuthorized) {
      const ref = dispatchRef || 'GA-CONFIRMED';
      renderSuccessConfirmation(ref, total, data, payload);
      return;
    }

    // Simplified polite error message as requested by user
    if (dispatchError) {
      status.style.display = 'block';
      status.style.background = '#fff5f5';
      status.style.border = '1px solid #feb2b2';
      status.style.color = '#9b2c2c';
      status.style.lineHeight = '1.6';
      status.innerHTML = `We couldn't authorize your credit card right now. Kindly use a different one or get in touch with GA Chauffeurs: <a href="tel:+447886622082" style="font-weight:700;color:#9b2c2c;text-decoration:underline;">+44 7886 622082</a> | <a href="mailto:enquiries@gachauffeurs.co.uk" style="font-weight:700;color:#9b2c2c;text-decoration:underline;">enquiries@gachauffeurs.co.uk</a>`;
      return;
    }

    const ref = dispatchRef || 'GA-REQUEST';
    renderSuccessConfirmation(ref, total, data, payload, false);
  });

  // Render Luxury Light On-Screen Confirmation Screen
  function renderSuccessConfirmation(ref, total, data, payload, preauthSuccess = true) {
    const root = document.querySelector('#ga-chauffeur-booking-widget');
    if (!root) return;

    const p = getAddressVal('booking-pickup');
    const d = getAddressVal('booking-destination');

    const whatsappSummary = `https://wa.me/447886622082?text=${encodeURIComponent(
      `Hello GA Chauffeurs, I have completed booking ${ref}:\n• Lead Passenger: ${data.name}\n• Service: ${data.serviceType}\n• Date & Time: ${data.datetime?.replace('T', ' ')}\n• Route: ${p} to ${d}\n• Vehicle: ${data.vehicle}\n• Status: ${preauthSuccess ? 'Card Pre-Authorised (£' + total.toFixed(2) + ')' : 'Request Pending'}\n\nPlease confirm chauffeur allocation.`
    )}`;

    root.innerHTML = `
      <div style="background: #ffffff; border: 1px solid #c9b894; border-radius: 8px; padding: 40px 32px; color: #171c1c; text-align: left; max-width: 760px; margin: 0 auto; box-shadow: 0 20px 45px rgba(0,0,0,0.08);">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 24px;">
          <div>
            <span style="font-family: Georgia, serif; font-size: 32px; letter-spacing: -3px; color: #171c1c;">GA</span>
            <span style="font-size: 11px; letter-spacing: .18em; text-transform: uppercase; border-left: 1px solid #cbd5e1; padding-left: 12px; margin-left: 10px; color: #64748b;">Chauffeur Services</span>
          </div>
          <div style="background: #ecfdf5; border: 1px solid #34d399; color: #065f46; font-size: 12px; font-weight: bold; padding: 6px 16px; border-radius: 20px; text-transform: uppercase; letter-spacing: .08em;">
            ${preauthSuccess ? '✓ Card Pre-Authorised' : '✓ Booking Received'}
          </div>
        </div>

        <h2 style="font-family: Georgia, serif; font-size: 28px; font-weight: normal; color: #171c1c; margin: 0 0 10px 0;">
          ${preauthSuccess ? 'Booking Confirmed' : 'Booking Request Received'}: <span style="color: #c9b894; font-weight: 600;">${ref}</span>
        </h2>
        <p style="color: #475569; font-size: 15px; margin: 0 0 24px 0; line-height: 1.6;">
          ${preauthSuccess
            ? `A credit card pre-authorisation hold of <strong>£${total.toFixed(2)}</strong> has been placed on your card. Your card is only charged after journey completion. An executive confirmation has been dispatched to <strong>${data.email}</strong>.`
            : `Your journey request has been received by GA Operations. We will contact <strong>${data.email}</strong> directly to confirm chauffeur allocation.`}
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 22px; margin-bottom: 24px;">
          <h3 style="font-size: 12px; text-transform: uppercase; letter-spacing: .14em; color: #854d0e; margin: 0 0 14px 0; font-weight: 700;">Journey Itinerary</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; font-size: 14px;">
            <div><span style="color: #64748b; display: block; font-size: 11px; text-transform: uppercase;">Lead Passenger</span><strong>${data.name}</strong></div>
            <div><span style="color: #64748b; display: block; font-size: 11px; text-transform: uppercase;">Contact Phone</span><strong>${data.phone}</strong></div>
            <div><span style="color: #64748b; display: block; font-size: 11px; text-transform: uppercase;">Pickup Date &amp; Time</span><strong>${(data.datetime || '').replace('T', ' at ')}</strong></div>
            <div><span style="color: #64748b; display: block; font-size: 11px; text-transform: uppercase;">Allocated Vehicle</span><strong>${data.vehicle}</strong></div>
            <div style="grid-column: span 2;"><span style="color: #64748b; display: block; font-size: 11px; text-transform: uppercase;">Pickup Address</span><strong>${p}</strong></div>
            <div style="grid-column: span 2;"><span style="color: #64748b; display: block; font-size: 11px; text-transform: uppercase;">Drop-off Address</span><strong>${d}</strong></div>
            <div><span style="color: #64748b; display: block; font-size: 11px; text-transform: uppercase;">Distance &amp; Duration</span><strong>${journeyDistanceMiles.toFixed(1)} miles (~${journeyDurationMinutes} mins)</strong></div>
            <div><span style="color: #64748b; display: block; font-size: 11px; text-transform: uppercase;">${preauthSuccess ? 'Total Pre-Authorised Hold' : 'Estimated Journey Total — payment pending'}</span><strong style="color: #854d0e; font-size: 16px;">£${total.toFixed(2)}</strong></div>
          </div>
        </div>

        <div style="display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px;">
          <a href="${whatsappSummary}" target="_blank" rel="noopener" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: #25D366; color: #fff; font-weight: 700; font-size: 14px; padding: 14px 22px; border-radius: 4px; text-decoration: none; box-shadow: 0 4px 15px rgba(37,211,102,0.25);">
            📱 Save to WhatsApp (+44 7886 622082) ↗
          </a>
          <button type="button" onclick="window.print()" style="background: #ffffff; color: #171c1c; border: 1px solid #cbd5e1; font-weight: 600; font-size: 14px; padding: 14px 22px; border-radius: 4px; cursor: pointer;">
            🖨️ Print / Save Receipt
          </button>
        </div>

        <p style="font-size: 12px; color: #64748b; margin: 0; border-top: 1px solid #e2e8f0; padding-top: 14px;">
          GA Chauffeur Services Limited • 1 Glebe Road, Stanmore, Greater London, HA7 4EJ • Direct 24/7 Desk: <a href="tel:+447886622082" style="color: #171c1c; font-weight: 600;">+44 7886 622082</a> • <a href="mailto:enquiries@gachauffeurs.co.uk" style="color: #171c1c; font-weight: 600;">enquiries@gachauffeurs.co.uk</a>
        </p>
      </div>
    `;
  }

  // Load Google Maps API or fallback
  if (window.google && window.google.maps) {
    initGoogleMap();
  } else {
    window.addEventListener('load', () => {
      setTimeout(initGoogleMap, 300);
    });
  }

  // Initialize
  syncDateTime();
  onServiceChange();
  selectVehicle('Mercedes-Benz S-Class');
  setStep(1);
})();
