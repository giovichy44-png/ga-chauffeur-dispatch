/* Browser key restricted in Google Cloud to the two GA website origins. */
(() => {
  const mapElement = document.querySelector('#journey-map');
  if (!mapElement) return;
  const status = document.querySelector('#route-status');
  const selected = {};
  const widgets = [];
  let active = false, stopped = false, mapAvailable = false, revision = 0, overlays = [];
  const clearRoute = () => {
    revision++;
    overlays.forEach(item => item.setMap(null));
    overlays = [];
  };
  function unavailable() {
    active = false; stopped = true;
    clearRoute();
    widgets.forEach(({input, widget}) => {
      if (widget.value) input.value = widget.value;
      widget.remove(); input.hidden = false; input.required = true;
      document.querySelector(`label[for="${widget.id}"]`)?.setAttribute('for', input.id);
    });
    mapElement.hidden = true;
    status.textContent = '';
  }
  // Map authorisation is independent of Places. Never disable address search
  // merely because the optional map API is not enabled on the Google project.
  window.gm_authFailure = () => {mapAvailable=false;clearRoute();mapElement.hidden=true;status.textContent='';};
  let calculateRoute = async () => {};
  function addresses() {
    const values = {};
    for (const id of ['pickup', 'destination']) {
      const entry = widgets.find(item => item.input.id === id);
      values[id] = (entry && active ? (entry.widget.value || entry.input.value) : document.getElementById(id).value).trim();
    }
    return values;
  }
  window.GAJourney = {addresses, route: () => calculateRoute(), setAddress(id,value) {
    const input=document.getElementById(id), entry=widgets.find(e=>e.input.id===id);
    input.value=value;if(entry)entry.widget.value=value;selected[id]=null;clearRoute();
    document.dispatchEvent(new Event('ga-address-change'));
  }};
  const timeout = setTimeout(() => { if (!active) unavailable(); }, 12000);
  window.initJourneyMaps = async () => {
    try {
      const {PlaceAutocompleteElement} = await google.maps.importLibrary('places');
      if (stopped) return;
      clearTimeout(timeout); active = true;
      let map, Route;
      mapElement.hidden=true; status.textContent='';
      async function route() {
        if (!active || !mapAvailable) return;
        clearRoute();
        const stops = addresses();
        if (!stops.pickup || !stops.destination) return;
        const requestId = revision;
        status.textContent = 'Calculating your route…';
        try {
          const {routes} = await Route.computeRoutes({origin:selected.pickup || stops.pickup+', UK', destination:selected.destination || stops.destination+', UK', travelMode:'DRIVING', routingPreference:'TRAFFIC_UNAWARE', fields:['path','distanceMeters','durationMillis']});
          if (requestId !== revision || !active) return;
          const result = routes?.[0];
          if (!result?.path?.length) throw new Error('No route');
          overlays = result.createPolylines({polylineOptions:{strokeColor:'#344b41',strokeWeight:5}});
          overlays.forEach(line => line.setMap(map));
          const bounds = new google.maps.LatLngBounds();
          result.path.forEach(point => bounds.extend(point));
          map.fitBounds(bounds, 40);
          for (const center of [result.path[0], result.path.at(-1)]) {
            overlays.push(new google.maps.Circle({map,center,radius:90,fillColor:'#b39a66',fillOpacity:1,strokeColor:'#fff',strokeWeight:2}));
          }
          status.textContent = `${(result.distanceMeters / 1609.344).toFixed(1)} miles · approximately ${Math.ceil(result.durationMillis / 60000)} minutes. Traffic and charges may vary.`;
        } catch (error) {
          if (requestId === revision) status.textContent = '';
          console.error('Journey route unavailable', error);
        }
      }
      calculateRoute = route;
      for (const id of ['pickup','destination']) {
        const input = document.getElementById(id);
        const widget = new PlaceAutocompleteElement({includedRegionCodes:['gb'], locationBias:{center:{lat:51.5074,lng:-0.1278},radius:50000}});
        widget.id = `${id}-search`;
        widget.setAttribute('aria-label', id === 'pickup' ? 'Pickup address' : 'Destination');
        widget.placeholder = input.placeholder;
        widget.value = input.value;
        input.hidden = true; input.required = false;
        input.after(widget);
        document.querySelector(`label[for="${id}"]`).setAttribute('for', widget.id);
        const confirmation = document.createElement('p');
        confirmation.className = 'address-confirmation'; confirmation.setAttribute('aria-live','polite');
        widget.after(confirmation);
        widgets.push({input,widget});
        let selectionVersion = 0;
        widget.addEventListener('input', () => {
          selectionVersion++; selected[id] = null; input.value = widget.value || ''; confirmation.textContent = '';
          clearRoute(); status.textContent = '';
          document.dispatchEvent(new Event('ga-address-change'));
        });
        widget.addEventListener('gmp-error', unavailable);
        widget.addEventListener('gmp-select', async ({placePrediction}) => {
          const token = ++selectionVersion;
          try {
            const place = placePrediction.toPlace();
            await place.fetchFields({fields:['displayName','formattedAddress','location']});
            if (token !== selectionVersion || !active) return;
            if (!place.location) throw new Error('Address has no location');
            selected[id] = place;
            const address=place.formattedAddress || widget.value || '';
            const name=place.displayName || placePrediction.mainText?.text || '';
            input.value=name && !address.toLowerCase().includes(name.toLowerCase()) ? name+', '+address : address;
            widget.value = input.value;
            document.dispatchEvent(new Event('ga-address-change'));
            confirmation.textContent = `${id === 'pickup' ? 'Pickup' : 'Destination'} confirmed: ${input.value}`;
            await route();
          } catch (error) {
            if (token === selectionVersion) {selected[id] = null; clearRoute(); confirmation.textContent = 'Please try selecting the address again.';}
          }
        });
      }
      // Places works independently. Do not instantiate the disabled Maps API:
      // its global authorisation error also breaks Google's Places internals.
      mapElement.hidden=true;

    } catch (error) { console.error('Journey address search unavailable', error); unavailable(); }
  };
  // Load only after defining callbacks, avoiding the previous async-script race.
  const script = document.createElement('script');
  script.src = 'https://maps.googleapis.com/maps/api/js?key=AIzaSyDNHZ7EWxRbvZVpuzAMJzfnKL4n4EPr9Xo&loading=async&v=weekly&callback=initJourneyMaps';
  script.async = true; script.onerror = () => {clearTimeout(timeout); unavailable();};
  document.head.append(script);
})();
