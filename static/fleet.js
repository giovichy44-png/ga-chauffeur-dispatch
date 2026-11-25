'use strict';

const $ = id => document.getElementById(id);
const profileForm = $('profile-form');
const vehicleForm = $('vehicle-form');
const labelVehicle = car => car.vehicle_model + ' · ' + car.license_plate;

async function request(operation, data) {
  const response = await fetch('/api/dispatch/fleet' + (operation ? '/' + operation : ''), data && {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Fleet is unavailable.');
  return result;
}

function tip(message) {
  $('fleet-message').textContent = message;
}

function action(label, callback) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary';
  button.textContent = label;
  button.onclick = () => callback(button);
  return button;
}

function edit(form, data) {
  form.reset();
  for (const [key, value] of Object.entries(data)) {
    const field = form.elements.namedItem(key);
    if (field) field.value = value ?? '';
  }
  if (form === profileForm) {
    form.elements.password.type = "password";
    form.elements.password.required = !data.id;
    form.elements.docs_verified.checked = Boolean(data.docs_verified);
  }
  form.hidden = false;
  form.querySelector('input:not([type=hidden])').focus();
}

function row(title, subtitle, ...buttons) {
  const entry = document.createElement('article');
  const description = document.createElement('div');
  const heading = document.createElement('strong');
  const text = document.createElement('p');
  heading.textContent = title;
  text.textContent = subtitle;
  description.append(heading, text);
  const controls = document.createElement('div');
  controls.className = 'actions';
  controls.append(...buttons);
  entry.append(description, controls);
  return entry;
}

async function load() {
  const {chauffeurs, vehicles} = await request();
  $('item-list').replaceChildren(...vehicles.map(car =>
    row(labelVehicle(car), car.passenger_capacity + ' seats · ' + car.luggage_capacity + ' bags',
      action('Edit vehicle', () => edit(vehicleForm, car)))
  ));
  $('client-list').replaceChildren(...chauffeurs.map(chauffeur => {
    const select = document.createElement('select');
    const label = document.createElement('label');
    label.append('Assigned vehicle', select);
    select.append(new Option('Unassigned', ''), ...vehicles.map(car => new Option(labelVehicle(car), car.id)));
    select.value = chauffeur.fleet_vehicle_id ?? '';
    return row(chauffeur.call_sign + ' · ' + chauffeur.name, chauffeur.phone, label,
      action('Save assignment', async button => {
        button.disabled = true;
        try {
          await request('assignment', {chauffeur_id:chauffeur.id, vehicle_id:select.value});
          tip('Chauffeur vehicle assignment saved.');
        } catch (error) { tip(error.message); }
        finally { button.disabled = false; }
      }), action('Edit profile', () => edit(profileForm, chauffeur)),
      action('Show password', async button => {
        const existing = button.parentElement.querySelector('output');
        if (existing) {
          existing.remove();
          button.textContent = 'Show password';
          return;
        }
        button.disabled = true;
        try {
          const result = await request('password', {id:chauffeur.id});
          if (!result.password) { tip('Set a password in the chauffeur profile.'); return; }
          const output = document.createElement('output');
          output.setAttribute('aria-label', 'Chauffeur password');
          output.textContent = result.password;
          button.after(output);
          button.textContent = 'Hide password';
        } catch (error) { tip(error.message); }
        finally { button.disabled = false; }
      }));
  }));
}

function submit(form, operation) {
  form.onsubmit = async event => {
    event.preventDefault();
    event.submitter.disabled = true;
    const data = Object.fromEntries(new FormData(form));
    if (form === profileForm) data.docs_verified = form.elements.docs_verified.checked;
    try {
      await request(operation, data);
      await load();
      form.hidden = true;
      tip(operation === 'profile' ? 'Chauffeur profile saved.' : 'Vehicle saved.');
    } catch (error) { tip(error.message); }
    finally { event.submitter.disabled = false; }
  };
}

$('show-entry-password').onchange = event => {
  profileForm.elements.password.type = event.target.checked ? 'text' : 'password';
};
$('new-chauffeur').onclick = () => edit(profileForm, {});
$('new-vehicle').onclick = () => edit(vehicleForm, {});
for (const form of [profileForm, vehicleForm]) {
  form.querySelector('[data-cancel]').onclick = () => { form.hidden = true; };
}
for (const button of document.querySelectorAll('[data-view]')) {
  button.onclick = () => {
    for (const name of ['chauffeurs','vehicles']) $(name).hidden = name !== button.dataset.view;
    for (const tab of document.querySelectorAll('[data-view]')) tab.setAttribute('aria-pressed', String(tab === button));
    tip('');
  };
}
submit(profileForm, 'profile');
submit(vehicleForm, 'vehicle');
load().catch(error => tip(error.message));
