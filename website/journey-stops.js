(() => {
  function address(input, {suggestions = true} = {}) {
    const shell = document.createElement('div');
    shell.className = 'ga-address-field';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = '×';
    clear.setAttribute('aria-label', 'Clear address');
    const matches = document.createElement('div');
    matches.className = 'ga-address-results';
    matches.hidden = true;
    input.before(shell);
    shell.append(input, clear, matches);
    let timer;
    let sequence = 0;
    function dismiss() {
      ++sequence;
      clearTimeout(timer);
      matches.hidden = true;
    }
    clear.onclick = () => {
      input.value = '';
      input.dispatchEvent(new Event('input', {bubbles:true}));
      input.focus();
    };
    if (!suggestions) return;
    let selecting = false;
    matches.addEventListener('pointerdown', () => { selecting = true; });
    matches.addEventListener('pointercancel', () => { selecting = false; });
    input.addEventListener('input', () => {
      selecting = false;
      dismiss();
      const query = input.value.trim();
      if (query.length < 2) return;
      const request = sequence;
      timer = setTimeout(async () => {
        try {
          const response = await fetch('/api/suggestions?' + new URLSearchParams({q:query,google:'1'}));
          const {suggestions = []} = await response.json();
          if (request !== sequence || document.activeElement !== input) return;
          matches.replaceChildren(...suggestions.slice(0, 6).map(item => {
            const option = document.createElement('button');
            option.type = 'button';
            const result = item.full_address || [item.title, item.subtitle].filter(Boolean).join(', ');
            option.textContent = result;
            option.onclick = async () => {
              selecting = false;
              dismiss();
              const selection = sequence;
              input.value = result;
              if (item.place_id) {
                try {
                  const response = await fetch('/api/place-details?' + new URLSearchParams({place_id:item.place_id}));
                  const details = await response.json();
                  if (selection !== sequence || !input.isConnected) return;
                  if (details.full_address) input.value = details.full_address;
                } catch (_) {}
              }
              input.dispatchEvent(new Event('change', {bubbles:true}));
            };
            return option;
          }));
          matches.hidden = !matches.childElementCount;
        } catch (_) { if (request === sequence) dismiss(); }
      }, 250);
    });
    shell.addEventListener('focusout', event => {
      if (!selecting && !shell.contains(event.relatedTarget)) dismiss();
    });
    const outsideClick = event => {
      if (!shell.contains(event.target)) {
        selecting = false;
        dismiss();
        document.removeEventListener('click', outsideClick, true);
      }
    };
    input.addEventListener('focus', () => document.addEventListener('click', outsideClick, true));
    input.addEventListener('keydown', event => { if (event.key === 'Escape') dismiss(); });
    return () => {
      dismiss();
      document.removeEventListener('click', outsideClick, true);
    };
  }

  function mount(container, change = () => {}) {
    const rows = document.createElement('div');
    const add = document.createElement('button');
    add.type = 'button';
    add.textContent = '+ Add stop';
    add.className = 'ga-add-stop';
    container.append(rows, add);
    const cleanup = new Map();
    const update = () => {
      add.disabled = rows.childElementCount >= 5;
      change();
    };
    function append(value = '') {
      if (rows.childElementCount >= 5) return;
      const row = document.createElement('div');
      row.className = 'ga-stop-row';
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Stop address';
      input.setAttribute('aria-label', 'Stop address');
      input.autocomplete = 'off';
      input.maxLength = 500;
      input.required = true;
      input.value = value;
      input.addEventListener('input', change);
      input.addEventListener('change', change);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Remove stop');
      remove.onclick = () => {
        cleanup.get(row)();
        cleanup.delete(row);
        row.remove();
        update();
      };
      row.append(input, remove);
      rows.append(row);
      cleanup.set(row, address(input));
      update();
      if (!value) input.focus();
    }
    add.onclick = () => append();
    return {
      values: () => Array.from(rows.querySelectorAll('input'), input => input.value.trim()).filter(Boolean),
      set(values) {
        for (const dispose of cleanup.values()) dispose();
        cleanup.clear();
        rows.replaceChildren();
        for (const value of values || []) append(value);
        update();
      }
    };
  }

  const style = document.createElement('style');
  style.textContent = `
    .ga-address-field{position:relative;min-width:0;width:100%}
    .ga-address-field input{box-sizing:border-box;width:100%;min-width:0;padding-right:48px!important}
    .ga-address-field > button,.ga-stop-row > button,.ga-add-stop{color:inherit;background:none;border:1px solid currentColor;border-radius:6px;cursor:pointer;min-height:40px;padding:5px 10px}
    .ga-address-field > button{position:absolute;right:4px;top:2px;border:0;min-width:40px;font-size:21px}
    .ga-address-results{position:absolute;z-index:30;max-height:180px;overflow:auto;top:100%;left:0;right:0;padding:4px;background:#171f1b;border:1px solid #6e796f;border-radius:6px;color:white;box-shadow:0 6px 15px #0006}
    .ga-address-results button{display:block;background:none;border:0;color:inherit;width:100%;text-align:left;white-space:normal;overflow-wrap:anywhere;padding:11px;cursor:pointer}
    .ga-address-results button:focus,.ga-address-results button:hover{background:#324238}
    .ga-stop-row{display:flex;align-items:center;gap:8px;margin:8px 0}
    .ga-stop-row .ga-address-field > button{display:none}
    .ga-add-stop{margin:6px 0 12px}`;
  document.head.append(style);
  window.GAJourneyStops = {mount, address};
})();
