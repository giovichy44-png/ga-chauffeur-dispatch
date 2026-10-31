/* Approved 2026 passenger tariffs,; additional charges may apply. */
const GA_RATES = {
  s: {oneway:170, hourly:85, day10:850, day12:960, airport165:165, airport305:305},
  v: {oneway:190, hourly:95, day10:900, day12:1080, airport165:175, airport305:315},
  r: {oneway:230, hourly:115, day10:1150, day12:1380, airport165:225, airport305:405}
};
function calculateTariff(vehicle, service, hours) {
  const rates = GA_RATES[vehicle];
  if (!rates || !Object.hasOwn(rates, service)) return null;
  if (service === 'hourly' && (!Number.isInteger(hours) || hours < 2 || hours > 72)) {
    throw new Error('Please choose 2 to 72 whole hours.');
  }
  const base = service === 'hourly' ? rates.hourly * hours : rates[service];
  return {base, vat:Math.round(base * 100 / 6)/100, total:base,
    included:service === 'day10' ? 80 : service === 'day12' ? 100 : service === 'hourly' && hours >= 4 ? 40 : null};
}
function detectAirportService(pickup,destination){
 const find=value=>{
  const text=String(value||'');
  if(/\b(heathrow|london city)\b.*\b(airport|terminal)\b|\b(LHR|LCY)\b/i.test(text))return 'airport165';
  if(/\b(gatwick|luton|farnborough|biggin hill|stansted)\b.*\b(airport|terminal)\b|\b(LGW|LTN|STN|FAB|BQH)\b/i.test(text))return 'airport305';
  if(/\bairport\b/i.test(text))return 'unlisted';
  return null;
 };
 const from=find(pickup),to=find(destination);
 if(from&&to)return {service:null,label:'Airport-to-airport transfer',bookingService:'Airport arrival'};
 const airport=from||to;
 return {service:airport==='unlisted'?null:airport||'oneway',label:airport?'Airport transfer':'Journey estimate',bookingService:from?'Airport arrival':to?'Airport departure':'Point-to-point transfer'};
}
function departureWaiting(vehicle, minutes) {
  if (!GA_RATES[vehicle] || !Number.isFinite(minutes) || minutes < 0) throw new Error('Invalid waiting time');
  return (minutes <= 15 ? 0 : Math.max(30, minutes - 15)) * GA_RATES[vehicle].hourly / 60;
}
if (typeof module !== 'undefined') module.exports = {calculateTariff, departureWaiting, detectAirportService};
if (typeof document !== 'undefined') (() => {
  const form = document.querySelector('#quote-form');
  if (!form) return;
  const service = document.querySelector('#quote-service');
  const hours = document.querySelector('#quote-hours');
  const result = document.querySelector('#quote-result');
  const money = n => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(n);
  result.tabIndex = -1;
  function addresses() {
    return window.GAJourney?.addresses() || {
      pickup:document.querySelector('#pickup').value.trim(),
      destination:document.querySelector('#destination').value.trim()
    };
  }
  function render(focus=false) {
    const stops = addresses();
    const vehicle = form.querySelector('[name=vehicle]:checked').value;
    result.replaceChildren();
    const line = (text, tag='p') => { const el=document.createElement(tag); el.textContent=text; result.append(el); };
    if(!stops.pickup || !stops.destination){line('Enter your pickup and destination to see your estimate.');return;}
    const detected=detectAirportService(stops.pickup,stops.destination);service.value=detected.service||'';
    let tariff;
    try { tariff=calculateTariff(vehicle,service.value,Number(hours.value)); }
    catch(error) { line(error.message); return; }
    if (stops.pickup && stops.destination) line(`${stops.pickup} → ${stops.destination}`);
    if (!tariff) {
      line('Personal quote required', 'h3');
      line('Please contact us for a price for this one-way journey. Our published tariffs cover hourly and daily services, and listed airports to or from Central London.');
      line('Contact us to confirm the price for this route.');
    } else {
      if(service.value !== 'oneway') line(service.value.startsWith('airport') ? 'Airport tariff' : 'Base estimate', 'h3');
      line(money(tariff.total)+(service.value==='oneway'?' plus VAT':''),'h2');
      if (service.value === 'airport165') line('Applies only between Central London and Heathrow or London City Airport. Other pickup or destination points require a personal quote.');
      if (service.value === 'airport305') line('Applies only between Central London and Gatwick, Luton, Farnborough, Biggin Hill or Stansted. Other pickup or destination points require a personal quote.');
      if (service.value === 'oneway') line('Two-hour minimum estimated charge: '+money(tariff.base)+' plus VAT. The final price depends on your journey and will be confirmed before booking.');
      if (tariff.included !== null) line(`${tariff.included} miles included.`);
      line('Excludes excess mileage, parking, drop-off, congestion and waiting charges. This is not the final payable total.');
    }
    const link=document.createElement('a');
    const params=new URLSearchParams();
    if(stops.pickup) params.set('pickup',stops.pickup);
    if(stops.destination) params.set('destination',stops.destination);
    params.set('vehicle',vehicle==='s'?'Mercedes-Benz S-Class':vehicle==='v'?'Mercedes-Benz V-Class':'Range Rover Autobiography Long Wheelbase');
    if(document.querySelector('#quote-date').value) params.set('date',document.querySelector('#quote-date').value);
    if(document.querySelector('#quote-time').value) params.set('time',document.querySelector('#quote-time').value);
    params.set('service',detected.bookingService);
    link.href='/book/?'+params.toString();link.className='text-link';
    link.textContent='Request a booking for this journey';result.append(link);
    if(focus) { result.focus({preventScroll:true}); result.scrollIntoView({behavior:'smooth',block:'nearest'}); }
  }
  function update() {
    document.querySelector('#hours-field').hidden = service.value !== 'hourly';
    hours.required = service.value === 'hourly';
    render();
  }
  form.addEventListener('input',update);
  form.addEventListener('change',update);
  form.addEventListener('invalid',()=>{result.textContent='Please enter both stops and check the highlighted field to continue.';},true);
  document.addEventListener('ga-address-change',update);
  form.addEventListener('submit',event=>{
    event.preventDefault();
    render(true);
    void window.GAJourney?.route();
  });
})();
