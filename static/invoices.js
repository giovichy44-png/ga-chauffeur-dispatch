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
  for (const name of ['invoices','clients','items','editor']) $(name).hidden = view !== name;
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

function renderInvoices() {
  const search = $('search').value.toLowerCase().trim();
  const invoices = state.invoices.filter(invoice =>
    [code(invoice.id), invoice.client_name, statusOf(invoice)].join(' ').toLowerCase().includes(search));
  $('invoice-list').replaceChildren(...invoices.map(invoice => {
    const preview = document.createElement('a');
    preview.href = '/api/dispatch/invoices/' + invoice.id + '/print';
    preview.target = '_blank';
    preview.rel = 'noopener';
    preview.textContent = 'Preview / PDF';
    const controls = [preview];
    if (['draft','failed','review'].includes(invoice.delivery) && !invoice.paid) {
      controls.push(button('Edit', () => editInvoice(invoice)));
    }
    if (['draft','failed','queued'].includes(invoice.delivery)) {
      controls.push(button(invoice.delivery === 'failed' ? 'Retry email' : 'Send email', async () => {
        if (!invoice.client_email) throw Error('Add a billing email before sending.');
        if (!confirm('Send invoice ' + code(invoice.id) + ' to ' + invoice.client_email + '?')) return;
        try {
          await api('send', {id:invoice.id});
          notice('Invoice emailed.');
        } finally { await load(); }
      }));
    }
    if (invoice.delivery === 'sent' && !invoice.paid) {
      controls.push(button('Mark paid', async () => {
        await api('paid', {id:invoice.id});
        await load();
        notice('Invoice marked paid.');
      }));
    }
    return entry(code(invoice.id) + ' · ' + invoice.client_name,
      [statusOf(invoice), money(invoice.total_pence), 'Due ' + invoice.due].join(' · '), controls);
  }));
  if (!invoices.length) $('invoice-list').textContent = search ? 'No invoices match.' : 'No invoices yet.';
}

function option(value, title) {
  return new Option(title, value);
}

async function load() {
  Object.assign(state, await api());
  const selectedClient = form.elements.client_id.value;
  form.elements.client_id.replaceChildren(option('', 'Select a client'),
    ...state.invoice_clients.map(client => option(client.id, client.name)));
  form.elements.client_id.value = selectedClient;
  $('catalog').replaceChildren(option('', 'Select an item'),
    ...state.invoice_items.map(item => option(item.id, item.description)));
  $('client-list').replaceChildren(...state.invoice_clients.map(client =>
    entry(client.name, client.email, [button('Edit client', () => fill($('client-form'), client))])));
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

function editInvoice(invoice = {}) {
  if (!state.today) return;
  show('editor');
  fill(form, {
    id:invoice.id, client_id:invoice.client_id, issued:invoice.issued || state.today,
    due:invoice.due || state.today, comments:invoice.comments, discount:(invoice.discount_pence || 0) / 100,
    vat_percent:invoice.vat_percent || 20
  });
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
      await api(operation, values(new FormData(target)));
      await load();
      after();
    } catch (error) {
      notice(error.message);
    } finally {
      event.submitter.disabled = false;
    }
  });
}

$('new').onclick = () => editInvoice();
$('search').oninput = renderInvoices;
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
  control.onclick = () => show(control.dataset.view);
});
for (const type of ['client','item']) {
  const target = $(type + '-form');
  submit(target, type, data => Object.fromEntries(data), () => {
    target.reset();
    notice(type === 'client' ? 'Client saved.' : 'Item saved.');
  });
}
submit(form, 'save', data => ({...Object.fromEntries(data), items:lines()}), () => {
  show('invoices');
  notice('Draft saved. Open the preview or send the invoice from the list.');
});
load().catch(error => notice(error.message));
