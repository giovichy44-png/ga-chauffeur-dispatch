'use strict';

const $ = id => document.getElementById(id);
const form = $('invoice-form');
const state = {invoices: [], invoice_clients: [], invoice_items: []};
const currency = new Intl.NumberFormat('en-GB', {style:'currency', currency:'GBP'});
const money = pence => currency.format(pence / 100);
const code = id => 'GA-INV-' + String(id).padStart(5, '0');
const statuses = {draft:'Draft', review:'Review charges', queued:'Ready to send', sending:'Check delivery', sent:'Sent', failed:'Email failed'};
const statusOf = invoice => invoice.paid ? 'Paid' : statuses[invoice.delivery];

function notice(message) {
  $('message').textContent = message;
}

async function api(operation, data) {
  const response = await fetch('/api/dispatch/invoices' + (operation ? '/' + operation : ''), data && {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
  });
  const responseData = await response.json();
  if (!response.ok) throw Error(responseData.error || 'Invoicing is unavailable.');
  return responseData;
}

function show(view) {
  for (const name of ['invoices','clients','items','editor','settings','invoice-preview']) $(name).hidden = view !== name;
  document.querySelectorAll('nav [data-view]').forEach(button =>
    button.setAttribute('aria-pressed', String(button.dataset.view === view)));
  notice('');
}

function button(text, action) {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'secondary';
  control.textContent = text;
  control.onclick = async () => {
    control.disabled = true;
    try { await action(); } catch (error) { notice(error.message); }
    finally { control.disabled = false; }
  };
  return control;
}

function entry(title, summary, actions) {
  const row = document.createElement('article');
  const details = document.createElement('div');
  const name = document.createElement('strong');
  const description = document.createElement('p');
  const controls = document.createElement('div');
  name.textContent = title;
  description.textContent = summary;
  controls.className = 'actions';
  details.append(name, description);
  controls.append(...actions);
  row.append(details, controls);
  return row;
}

function canSend(invoice) {
  return ['draft','failed','queued'].includes(invoice.delivery) &&
    (!invoice.booking_id || invoice.booking_status === 'COMPLETED');
}

function openPayment(invoice) {
  fill($('payment-form'), {id:invoice.id});
  $('payment-balance').textContent = 'Outstanding balance ' + money(invoice.balance_pence);
  $('payment-form').elements.amount.max = (invoice.balance_pence / 100).toFixed(2);
  $('payment-dialog').showModal();
}

async function sendInvoice(invoice) {
  if (!invoice.client_email) throw Error('Add a billing email before sending.');
  if (!confirm('Send invoice ' + code(invoice.id) + ' to ' + invoice.client_email + '?')) return;
  await api('send', {id:invoice.id});
  await load();
  const updated = state.invoices.find(row => row.id === invoice.id);
  if (!$('invoice-preview').hidden && updated) previewInvoice(updated);
  notice('Invoice emailed with its PDF.');
}

function previewInvoice(invoice) {
  show('invoice-preview');
  $('preview-title').textContent = code(invoice.id) + ' · ' + invoice.client_name;
  const pdf = '/api/dispatch/invoices/' + invoice.id + '/pdf';
  $('preview-pdf').src = pdf + '?v=' + Date.now();
  const download = document.createElement('a');
  download.href = pdf;
  download.target = '_blank';
  download.rel = 'noopener';
  download.textContent = 'Open PDF in new tab';
  const controls = [download, button('Back to invoices', () => show('invoices'))];
  if (canSend(invoice)) controls.push(button('Send invoice', () => sendInvoice(invoice)));
  if (invoice.delivery !== 'sending') controls.push(button(invoice.delivery === 'sent' ? 'Revise invoice' : 'Edit invoice', () => editInvoice(invoice)));
  if (invoice.balance_pence > 0) controls.push(button('Record payment or deduction', () => openPayment(invoice)));
  if (invoice.checkout_session) controls.push(button('Refresh card status', async () => {
    await api('sync-payment', {id:invoice.id});
    await load();
    previewInvoice(state.invoices.find(row => row.id === invoice.id));
  }));
  $('preview-actions').replaceChildren(...controls);
}

function renderInvoices() {
  const search = $('search').value.toLowerCase().trim();
  const invoices = state.invoices.filter(invoice =>
    [code(invoice.id), invoice.client_name, invoice.booking_reference, statusOf(invoice)].join(' ').toLowerCase().includes(search));
  $('invoice-list').replaceChildren(...invoices.map(invoice => {
    const controls = [button('View PDF', () => previewInvoice(invoice))];
    if (invoice.delivery !== 'sending') controls.push(button(invoice.delivery === 'sent' ? 'Revise' : 'Edit', () => editInvoice(invoice)));
    if (canSend(invoice)) controls.push(button('Send invoice', () => sendInvoice(invoice)));
    if (invoice.balance_pence > 0) controls.push(button('Record payment', () => openPayment(invoice)));
    const journeyStatus = invoice.booking_id && invoice.booking_status !== 'COMPLETED' ? 'Awaiting journey completion' : '';
    return entry(code(invoice.id) + ' · ' + invoice.client_name,
      [statusOf(invoice), journeyStatus, invoice.booking_reference, 'Balance ' + money(invoice.balance_pence),
        'Due ' + invoice.due].filter(Boolean).join(' · '), controls);
  }));
  if (!invoices.length) $('invoice-list').textContent = search ? 'No invoices match.' : 'No invoices yet.';
}

function option(value, title) {
  return new Option(title, value);
}

function renderClients() {
  const search = $('client-search').value.trim().toLowerCase();
  const reverse = $('client-sort').value === 'desc' ? -1 : 1;
  const showDeleted = $('show-deleted-clients').checked;
  const clients = state.invoice_clients.filter(client => Boolean(client.archived_at) === showDeleted &&
    [client.name, client.email].join(' ').toLowerCase().includes(search))
    .sort((a, b) => reverse * a.name.localeCompare(b.name, 'en-GB', {sensitivity:'base', numeric:true}));
  $('client-list').replaceChildren(...clients.map(client => {
    const details = [client.email, client.address, ...Object.entries(JSON.parse(client.source_details || '{}'))
      .filter(([key]) => !['Email','Billing address'].includes(key)).map(([key, value]) => key + ' · ' + value)]
      .filter(Boolean).join(' · ');
    const controls = [];
    if (!client.archived_at) controls.push(button('Edit client', () => fill($('client-form'), client)));
    controls.push(button(client.archived_at ? 'Restore client' : 'Delete client', async () => {
      if (!client.archived_at && !confirm('Delete ' + client.name + ' from the active client list? Existing invoices will stay in your records.')) return;
      await api(client.archived_at ? 'client-restore' : 'client-delete', {id:client.id});
      if ($('client-form').elements.id.value === String(client.id)) $('client-form').reset();
      await load();
      notice(client.archived_at ? 'Client restored.' : 'Client deleted. You can restore it under Show deleted clients.');
    }));
    return entry(client.name, details, controls);
  }));
  if (!clients.length) $('client-list').textContent = search ? 'No clients match.' : showDeleted ? 'No deleted clients.' : 'No clients yet.';
}

function updateClientOptions(selected) {
  const clients = state.invoice_clients.filter(client => !client.archived_at || String(client.id) === String(selected))
    .sort((a, b) => a.name.localeCompare(b.name, 'en-GB', {sensitivity:'base', numeric:true}));
  form.elements.client_id.replaceChildren(option('', 'Select a client'),
    ...clients.map(client => option(client.id, client.name + (client.archived_at ? ' (deleted)' : ''))));
  form.elements.client_id.value = selected ?? '';
}

async function load() {
  Object.assign(state, await api());
  updateClientOptions(form.elements.client_id.value);
  $('catalog').replaceChildren(option('', 'Select an item'),
    ...state.invoice_items.map(item => option(item.id, item.description)));
  renderClients();
  $('item-list').replaceChildren(...state.invoice_items.map(item =>
    entry(item.description, money(item.unit_pence), [button('Edit item', () =>
      fill($('item-form'), {...item, unit_price:(item.unit_pence / 100).toFixed(2)}))])));
  renderInvoices();
}

function fill(target, values) {
  target.reset();
  for (const [key, value] of Object.entries(values)) {
    const field = target.elements.namedItem(key);
    if (field) field.value = value ?? '';
  }
  target.querySelector('input:not([type=hidden])')?.focus();
}

function addLine(values = {}) {
  if ($('lines').children.length >= 50) throw Error('This invoice already has 50 line items.');
  const row = $('line-template').content.firstElementChild.cloneNode(true);
  row.querySelector('[name=description]').value = values.description ?? '';
  row.querySelector('[name=quantity]').value = values.quantity ?? '1';
  row.querySelector('[name=unit_price]').value = values.unit_pence == null ? '' : (values.unit_pence / 100).toFixed(2);
  row.querySelector('button').onclick = () => {
    row.remove();
    if (!$('lines').children.length) addLine();
    updateTotal();
  };
  $('lines').append(row);
  return row;
}

function lines() {
  return Array.from($('lines').children, row => Object.fromEntries(
    Array.from(row.querySelectorAll('input'), input => [input.name, input.value])
  ));
}

function updateTotal() {
  const vat = $('include-vat').checked;
  $('vat-field').hidden = !vat;
  form.elements.vat_percent.disabled = !vat;
  const subtotal = lines().reduce((sum, row) => sum + Math.round(Number(row.quantity) * Math.round(Number(row.unit_price) * 100)), 0);
  const net = Math.max(0, subtotal - Math.round(Number(form.elements.discount.value) * 100));
  const tax = vat ? Math.round(net * Number(form.elements.vat_percent.value) / 100) : 0;
  $('total').textContent = 'Subtotal ' + money(subtotal) + (vat ? ' · VAT ' + money(tax) : '') + ' · Total ' + money(net + tax);
}

function updateDueDate() {
  const issued = form.elements.issued.value;
  const terms = form.elements.terms_days.value;
  if (issued && terms !== 'custom') {
    const due = new Date(issued + 'T00:00:00Z');
    due.setUTCDate(due.getUTCDate() + Number(terms));
    form.elements.due.value = due.toISOString().slice(0, 10);
  }
  $('invoice-due-label').textContent = form.elements.due.value ? 'Due ' + form.elements.due.value : '';
}

function editInvoice(invoice = {}) {
  if (!state.today) return;
  show('editor');
  updateClientOptions(invoice.client_id);
  fill(form, {
    id:invoice.id, client_id:invoice.client_id, issued:invoice.issued || state.today,
    due:invoice.due || state.today, comments:invoice.comments, discount:(invoice.discount_pence || 0) / 100,
    vat_percent:invoice.vat_percent || 20
  });
  const days = invoice.issued ? (Date.parse(invoice.due) - Date.parse(invoice.issued)) / 86400000 : 0;
  form.elements.terms_days.value = [0,1,7,30].includes(days) ? String(days) : 'custom';
  updateDueDate();
  $('editor-feedback').textContent = '';
  $('create-invoice').textContent = invoice.id ? 'Save and view PDF' : 'Create invoice and view PDF';
  $('editor-title').textContent = invoice.id ? 'Edit ' + code(invoice.id) : 'New invoice';
  $('include-vat').checked = Number(invoice.vat_percent) > 0 || Boolean(invoice.vat_pence);
  $('lines').replaceChildren();
  for (const line of invoice.items ? JSON.parse(invoice.items) : [{}]) addLine(line);
  updateTotal();
}

function submit(target, operation, values, after) {
  target.addEventListener('submit', async event => {
    event.preventDefault();
    event.submitter.disabled = true;
    try {
      const result = await api(operation, values(new FormData(target)));
      await load();
      after(result);
    } catch (error) {
      notice(error.message);
    } finally {
      event.submitter.disabled = false;
    }
  });
}

$('new').onclick = () => editInvoice();
$('search').oninput = renderInvoices;
$('client-search').oninput = renderClients;
$('client-sort').onchange = renderClients;
$('show-deleted-clients').onchange = renderClients;
form.oninput = updateTotal;
$('add-line').onclick = () => {
  try { addLine().querySelector('input').focus(); updateTotal(); }
  catch (error) { notice(error.message); }
};
$('catalog').onchange = event => {
  const item = state.invoice_items.find(row => String(row.id) === event.target.value);
  try {
    if (item) {
      const only = $('lines').children.length === 1 ? $('lines').firstElementChild : null;
      if (only && !only.querySelector('[name=description]').value && !only.querySelector('[name=unit_price]').value) only.remove();
      addLine(item);
      updateTotal();
    }
  } catch (error) { notice(error.message); }
  event.target.value = '';
};
document.querySelectorAll('[data-view]').forEach(control => {
  control.onclick = () => {
    show(control.dataset.view);
    if (control.dataset.view === 'settings') fill($('payment-settings'), state.payment_details || {});
  };
});
for (const type of ['client','item']) {
  const target = $(type + '-form');
  submit(target, type, data => Object.fromEntries(data), () => {
    target.reset();
    notice(type === 'client' ? 'Client saved.' : 'Item saved.');
  });
}
form.elements.terms_days.onchange = updateDueDate;
form.elements.issued.onchange = updateDueDate;
form.oninvalid = () => { $('editor-feedback').textContent = 'Complete the highlighted fields to create your invoice.'; };
form.addEventListener('invalid', form.oninvalid, true);
form.onsubmit = async event => {
  event.preventDefault();
  const submitter = $('create-invoice');
  submitter.disabled = true;
  $('editor-feedback').textContent = '';
  try {
    const data = Object.fromEntries(new FormData(form));
    if (data.terms_days === 'custom') delete data.terms_days;
    const saved = await api('save', {...data, items:lines()});
    form.elements.id.value = saved.id;
    await load();
    previewInvoice(state.invoices.find(row => row.id === saved.id));
  } catch (error) {
    $('editor-feedback').textContent = error.message;
  } finally { submitter.disabled = false; }
};
$('payment-cancel').onclick = () => $('payment-dialog').close();
submit($('payment-form'), 'payment', data => Object.fromEntries(data), () => {
  const id = $('payment-form').elements.id.value;
  $('payment-dialog').close();
  const invoice = state.invoices.find(row => String(row.id) === id);
  if (invoice && !$('invoice-preview').hidden) previewInvoice(invoice);
  notice('Amount recorded.');
});
$('payment-details-file').addEventListener('change', async event => {
  const input = event.currentTarget;
  try {
    const data = JSON.parse(await input.files[0].text());
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error();
    const form = $('payment-settings');
    for (const field of ['account_name','sort_code','account_number','bic','iban','vat_number','card_link']) {
      if (typeof data[field] === 'string') form.elements[field].value = data[field];
    }
    notice('Payment details loaded. Save to apply them to invoices.');
  } catch (_) {
    notice('Choose a valid payment details JSON file.');
  } finally {
    input.value = '';
  }
});
submit($('payment-settings'), 'preferences', data => Object.fromEntries(data), () => notice('Payment details saved.'));
$('client-import').onsubmit = async event => {
  event.preventDefault();
  event.submitter.disabled = true;
  try {
    const clients = JSON.parse(event.currentTarget.elements.client_export.value);
    const result = await api('import', {clients});
    $('client-import').reset();
    await load();
    notice('Imported ' + result.created + ' clients. ' + result.already_imported + ' already imported.');
  } catch (error) { notice(error.message); }
  finally { event.submitter.disabled = false; }
};
load().catch(error => notice(error.message));

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/invoices-app-sw.js', {scope:'/invoices.html'}).catch(() => {});
}
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  const install = $('install-invoicing');
  install.hidden = false;
  install.onclick = async () => {
    await event.prompt();
    install.hidden = true;
  };
});
