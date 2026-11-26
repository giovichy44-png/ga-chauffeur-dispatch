'use strict';

const $ = id => document.getElementById(id);
const profileForm = $('profile-form');
const vehicleForm = $('vehicle-form');
const labelVehicle = car => car.vehicle_model + ' · ' + car.license_plate;

const vehicleGallery = {
  mercedes_s_class:'sclass-front.png',
  mercedes_v_class:'v-black-white-0.png',
  range_rover_autobiography:'range-rover-front.png'
};
const vehiclePhoto = tier => vehicleGallery[tier] ? 'https://gachauffeurs.co.uk/assets/fleet/' + vehicleGallery[tier] : '';

function setPhoto(image, source) {
  image.hidden = !source;
  if (source) image.src = source;
  else image.removeAttribute('src');
}

function jpegPhoto(base64) {
  return base64 ? 'data:image/jpeg;base64,' + base64 : '';
}

async function convertPhoto(file) {
  if (file.size > 25_000_000) throw Error('Choose a photo under 25 MB.');
  const uri = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = uri;
    await image.decode();
    const scale = Math.min(1, 360 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d', {alpha:false});
    context.fillStyle = '#ffffff';
    context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .8).split(',')[1];
  } catch {
    throw Error('Choose a JPEG, PNG or other photo your browser can open.');
  } finally {
    URL.revokeObjectURL(uri);
  }
}

function inviteLink(chauffeur) {
  const link = document.createElement('a');
  const phone = (chauffeur.phone || '').replace(/[^0-9]/g, '').replace(/^00/, '');
  const text = [
    'Hello ' + chauffeur.name + ', here is the GA Chauffeur app.',
    new URL('/driver/', location.origin).href,
    'Call sign: ' + chauffeur.call_sign,
    'Use the password provided by Dispatch.'
  ].join('\n');
  link.href = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text);
  link.target = '_blank';
  link.rel = 'noopener';
  link.className = 'secondary';
  link.textContent = 'Send app via WhatsApp';
  return link;
}

function copyAppLink() {
  return navigator.clipboard.writeText(new URL('/driver/', location.origin).href)
    .then(() => tip('Chauffeur app link copied.'), () => tip('Could not copy the link.'));
}

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
    $('remove-profile-photo-label').hidden = !data.photo_jpeg;
    setPhoto($('profile-photo-preview'), jpegPhoto(data.photo_jpeg));
  } else {
    setPhoto($('vehicle-photo-preview'),vehiclePhoto(data.vehicle_class));
  }
  form.hidden = false;
  form.querySelector('input:not([type=hidden])').focus();
}

function row(title, subtitle, photo, ...buttons) {
  const entry = document.createElement('article');
  const description = document.createElement('div');
  const heading = document.createElement('strong');
  const text = document.createElement('p');
  heading.textContent = title;
  text.textContent = subtitle;
  if (photo) {
    const image = document.createElement('img');
    image.className = 'fleet-photo' + (photo.startsWith('data:') ? ' portrait' : '');
    image.alt = '';
    image.loading = 'lazy';
    image.src = photo;
    description.append(image);
  }
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
    row(labelVehicle(car), car.passenger_capacity + ' seats · ' + car.luggage_capacity + ' bags', vehiclePhoto(car.vehicle_class),
      action('Edit vehicle', () => edit(vehicleForm, car)))
  ));
  $('client-list').replaceChildren(...chauffeurs.map(chauffeur => {
    const select = document.createElement('select');
    const label = document.createElement('label');
    label.append('Assigned vehicle', select);
    select.append(new Option('Unassigned', ''), ...vehicles.map(car => new Option(labelVehicle(car), car.id)));
    select.value = chauffeur.fleet_vehicle_id ?? '';
    const preview = document.createElement('img');
    preview.className = 'fleet-photo assignment-preview';
    preview.alt = 'Selected vehicle class';
    const updatePreview = () => setPhoto(preview, vehiclePhoto(vehicles.find(car => String(car.id) === select.value)?.vehicle_class));
    select.addEventListener('change', updatePreview);
    updatePreview();
    return row(chauffeur.call_sign + ' · ' + chauffeur.name, chauffeur.phone, jpegPhoto(chauffeur.photo_jpeg), label, preview,
      inviteLink(chauffeur), action('Copy app link', copyAppLink),
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
      if (form === profileForm) {
        const image = $('profile-photo').files[0];
        if (image) data.photo_jpeg = await convertPhoto(image);
        else if ($('remove-profile-photo').checked) data.photo_jpeg = null;
      }
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
vehicleForm.elements.vehicle_class.onchange = event => setPhoto($('vehicle-photo-preview'),vehiclePhoto(event.target.value));
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
