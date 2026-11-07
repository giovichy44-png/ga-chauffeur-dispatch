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
    { keys: ['t5', 'terminal 5', 'heathrow t5', 'lhr t5', 'lhr'], name: 'Heathrow Terminal 5, Wallis Rd, Longford, Hounslow TW6 2GA, UK', lat: 51.4700, lng: -0.4840, category: 'airport' },
    { keys: ['t2', 'terminal 2', 'heathrow t2', 'lhr t2', 'lhr'], name: 'Heathrow Terminal 2, Inner Ring E, Longford, Hounslow TW6 1EW, UK', lat: 51.4696, lng: -0.4506, category: 'airport' },
    { keys: ['t3', 'terminal 3', 'heathrow t3', 'lhr t3', 'lhr'], name: 'Heathrow Terminal 3, Nelson Rd, Longford, Hounslow TW6 1QG, UK', lat: 51.4716, lng: -0.4578, category: 'airport' },
    { keys: ['t4', 'terminal 4', 'heathrow t4', 'lhr t4', 'lhr'], name: 'Heathrow Terminal 4, Hounslow TW6 3XA, UK', lat: 51.4585, lng: -0.4452, category: 'airport' },
    { keys: ['lhr', 'heathrow', 'heathrow airport'], name: 'Heathrow Airport, Longford, Hounslow, UK', lat: 51.4700, lng: -0.4543, category: 'airport' },
    { keys: ['lgw', 'gatwick', 'gatwick airport'], name: 'London Gatwick Airport South Terminal, Horley, Gatwick RH6 0NP, UK', lat: 51.1537, lng: -0.1821, category: 'airport' },
    { keys: ['gatwick north', 'lgw north'], name: 'London Gatwick Airport North Terminal, Horley, Gatwick RH6 0PJ, UK', lat: 51.1598, lng: -0.1769, category: 'airport' },
    { keys: ['gatwick south', 'lgw south'], name: 'London Gatwick Airport South Terminal, Horley, Gatwick RH6 0NP, UK', lat: 51.1565, lng: -0.1611, category: 'airport' },
    { keys: ['lcy', 'london city', 'london city airport'], name: 'London City Airport (LCY), Hartmann Rd, London E16 2PX', lat: 51.5048, lng: 0.0495, category: 'airport' },
    { keys: ['ltn', 'luton', 'luton airport'], name: 'London Luton Airport (LTN), Airport Way, Luton LU2 9LY', lat: 51.8763, lng: -0.3717, category: 'airport' },
    { keys: ['stn', 'stansted', 'stansted airport'], name: 'London Stansted Airport (STN), Bassingbourn Rd, Stansted CM24 1QW', lat: 51.8860, lng: 0.2389, category: 'airport' },
    { keys: ['fab', 'farnborough', 'farnborough airport'], name: 'Farnborough Airport, Farnborough GU14 6XA, UK', lat: 51.2758, lng: -0.7763, category: 'private_jet' },
    { keys: ['bqh', 'biggin', 'biggin hill'], name: 'London Biggin Hill Airport (BQH), Main Rd, Biggin Hill TN16 3BN', lat: 51.3308, lng: 0.0325, category: 'private_jet' },
    { keys: ['northolt', 'raf northolt'], name: 'Northolt Airport, Ruislip, UK', lat: 51.5531, lng: -0.4181, category: 'private_jet' },
    { keys: ['battersea', 'heliport'], name: 'London Heliport, Bridges Ct, London SW11 3BE, UK', lat: 51.4700, lng: -0.1786, category: 'private_jet' },
    { keys: ['harrods', 'harrods aviation'], name: 'Harrods Aviation, London Luton Airport, Luton LU2 9NW, UK', lat: 51.8790, lng: -0.3660, category: 'private_jet' },
    { keys: ['signature', 'signature flight support'], name: 'Signature Flight Support, Luton Airport, Luton LU2 9NW, UK', lat: 51.4640, lng: -0.4480, category: 'private_jet' },
    { keys: ['stanmore', 'glebe road', 'ha7 4ej', 'ha74ej'], name: '1 Glebe Road, Stanmore, Greater London, HA7 4EJ', lat: 51.6167, lng: -0.3167, category: 'hub' },
    { keys: ['savoy', 'the savoy'], name: 'The Savoy, Strand, London WC2R 0EZ', lat: 51.5103, lng: -0.1206, category: 'hotel' },
    { keys: ['ritz', 'the ritz'], name: 'The Ritz London, 150 Piccadilly, St. James\'s, London W1J 9BR', lat: 51.5071, lng: -0.1416, category: 'hotel' },
    { keys: ['dorchester', 'the dorchester'], name: 'The Dorchester, 53 Park Ln, London W1K 1QA', lat: 51.5073, lng: -0.1524, category: 'hotel' },
    { keys: ['clar', 'claridges', 'claridge\'s'], name: 'Claridge\'s, Brook St, Mayfair, London W1K 4HR', lat: 51.5126, lng: -0.1484, category: 'hotel' },
    { keys: ['coworth', 'coworth park', 'ascot'], name: 'Coworth Park Hotel, Blacknest Rd, Ascot SL5 7SE, UK', lat: 51.4086, lng: -0.6305, category: 'hotel' },
    { keys: ['connaught', 'the connaught'], name: 'The Connaught, Carlos Pl, London W1K 2AL', lat: 51.5100, lng: -0.1504, category: 'hotel' },
    { keys: ['maybourne', 'the berkeley', 'berkeley'], name: 'The Berkeley, Wilton Pl, London SW1X 7RL', lat: 51.5019, lng: -0.1566, category: 'hotel' },
    { keys: ['mandarin', 'mandarin oriental'], name: 'Mandarin Oriental Hyde Park, 66 Knightsbridge, London SW1X 7LA', lat: 51.5022, lng: -0.1599, category: 'hotel' },
    { keys: ['four seasons', 'park lane'], name: 'Four Seasons Hotel London at Park Lane, Hamilton Pl, London W1J 7DR', lat: 51.5038, lng: -0.1507, category: 'hotel' },
    { keys: ['peninsula', 'the peninsula'], name: 'The Peninsula London, 1 Grosvenor Pl, London SW1X 7HJ', lat: 51.5019, lng: -0.1516, category: 'hotel' },
    { keys: ['harrods store', 'knightsbridge'], name: 'Harrods, 87-135 Brompton Rd, Knightsbridge, London SW1X 7XL', lat: 51.4994, lng: -0.1635, category: 'hub' },
    { keys: ['mayfair', 'w1k'], name: '100 Piccadilly, Mayfair, London W1J 7NH', lat: 51.5110, lng: -0.1490, category: 'hub' }
  ];

  const instances = new Map();
  let placesLibrary;
  const norm = s => (s || '').toLowerCase().replace(/['’`]/g, '').trim();
  function setup(input) {
    if (!input || instances.has(input.id)) return;
    let timer, revision = 0;
    const list = document.createElement('div');
    list.className = 'ga-autocomplete-dropdown';
    list.style.cssText = 'background:white;color:#17201b;border:1px solid #c9b894;border-radius:6px;max-height:280px;overflow:auto;position:absolute;top:100%;left:0;right:0;margin-top:4px;box-shadow:0 12px 28px rgba(0,0,0,0.16);z-index:1000';
    list.hidden = true; list.setAttribute('role','listbox');
    input.after(list); input.hidden=false; input.autocomplete='off';
    instances.set(input.id, {input,list});
    function choose(name, coords) {
      ++revision; clearTimeout(timer); list.hidden=true;
      input.value=name;
      delete input.dataset.lat; delete input.dataset.lng;
      if(coords){input.dataset.lat=coords.lat;input.dataset.lng=coords.lng;}
      input.dispatchEvent(new Event('change',{bubbles:true}));
    }
    function render(items) {
      list.replaceChildren();list.hidden=!items.length;
      for(const item of items){
        const button=document.createElement('button');button.type='button';button.setAttribute('role','option');button.textContent=item.name;
        button.style.cssText='display:block;width:100%;text-align:left;background:white;color:#17201b;border:0;border-bottom:1px solid #eee;padding:12px;cursor:pointer';
        const selectItem = async(e)=>{
          if(e && e.type === 'mousedown') e.preventDefault();
          const token=++revision;
          try {
            if(item.prediction){
              const place=item.prediction.toPlace();
              await place.fetchFields({fields:['displayName','formattedAddress','location']});
              if(token!==revision)return;
              const address=place.formattedAddress||item.name,name=place.displayName||'';
              choose(name&&!address.toLowerCase().includes(name.toLowerCase())?name+', '+address:address,
                place.location?{lat:place.location.lat(),lng:place.location.lng()}:null);
            }else choose(item.name,item.lat!=null?{lat:item.lat,lng:item.lng}:null);
          } catch {choose(item.name,item.lat!=null?{lat:item.lat,lng:item.lng}:null);}
        };
        button.addEventListener('mousedown',selectItem);
        button.addEventListener('click',selectItem);
        list.append(button);
      }
    }
    async function search(){
      const token=++revision,q=input.value.trim(),qNorm=norm(q);
      if(q.length<2){list.hidden=true;return;}
      const local=AIRPORT_SUGGESTIONS.filter(i=>i.keys.some(k=>norm(k).includes(qNorm)||qNorm.includes(norm(k)))||norm(i.name).includes(qNorm)).slice(0,6);
      render(local);
      try{
        const lib=placesLibrary||await window.google?.maps?.importLibrary('places');
        if(!lib)throw Error('Places unavailable');
        placesLibrary=lib;
        const {suggestions}=await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({input:q,includedRegionCodes:['gb']});
        if(token!==revision)return;
        const items=suggestions.filter(s=>s.placePrediction).map(s=>({name:s.placePrediction.text.toString(),prediction:s.placePrediction}));
        render([...local,...items.filter(i=>!local.some(l=>norm(l.name)===norm(i.name)))].slice(0,8));
      }catch{
        if(token!==revision)return;
        if(!local.length){list.hidden=false;list.textContent='Address suggestions are unavailable. Enter the full address including house number and postcode.';}
      }
    }
    input.addEventListener('input',()=>{
      ++revision;delete input.dataset.lat;delete input.dataset.lng;clearTimeout(timer);list.hidden=true;timer=setTimeout(search,250);
    });
    input.addEventListener('focus',()=>{if(input.value.length>=2)search();});
    input.addEventListener('keydown',e=>{if(e.key==='Escape')list.hidden=true;if(e.key==='ArrowDown'){e.preventDefault();list.querySelector('button')?.focus();}});
    input.addEventListener('blur',()=>setTimeout(()=>{if(!list.contains(document.activeElement))list.hidden=true;},200));
  }
  window.GABookingAddresses={
    setAddress(id,value){const input=document.getElementById(id);if(!input)return;input.value=value;delete input.dataset.lat;delete input.dataset.lng;input.dispatchEvent(new Event('change',{bubbles:true}));},
    validate(){return ['booking-pickup','booking-destination'].every((id,i)=>i&&form.elements.serviceType?.value==='Hourly chauffeur service'||Boolean(document.getElementById(id)?.value.trim()));}
  };
  window.initBookingAddresses=()=>{
    ['booking-pickup','booking-destination'].forEach(id=>setup(document.getElementById(id)));
    window.onGoogleMapsReady?.();
  };
  ['booking-pickup','booking-destination'].forEach(id=>setup(document.getElementById(id)));
  const script=document.createElement('script');
  script.src='https://maps.googleapis.com/maps/api/js?key=AIzaSyDNHZ7EWxRbvZVpuzAMJzfnKL4n4EPr9Xo&libraries=places,routes,geometry&loading=async&v=weekly&callback=initBookingAddresses';
  script.async=true;script.onerror=()=>window.onGoogleMapsReady?.();document.head.append(script);
})();
