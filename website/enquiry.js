(() => {
  const form = document.querySelector('.contact-form');
  if (!form) return;
  const query = new URLSearchParams(location.search);
  const fields = [['pickup','Pickup'],['destination','Destination'],['vehicle','Vehicle'],['date','Date'],['time','Time'],['service','Service']];
  const journey = fields.filter(([key])=>query.has(key)).map(([key,label])=>`${label}: ${query.get(key).slice(0,300)}`).join('\n');
  if(journey) form.elements.message.value=journey;
  const status = document.querySelector('#form-status');
  const button = form.querySelector('button[type=submit]');
  let online=false, requestId=crypto.randomUUID();
  form.addEventListener('input',()=>{requestId=crypto.randomUUID();});
  fetch('/api/forms-config',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(config=>{
    online=config?.enquiry===true;
    if(online){button.textContent='Send enquiry';status.textContent='Your enquiry will be sent to GA Chauffeur Services.';}
  }).catch(()=>{});
  form.addEventListener('submit', async event=> {
    event.preventDefault();
    if(!form.reportValidity()) return;
    const values = new FormData(form);
    if(online){
      button.disabled=true;status.textContent='Sending your enquiry…';
      try{
        const response=await fetch('/api/enquiry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...Object.fromEntries(values),requestId}),signal:AbortSignal.timeout(20000)});
        const result=await response.json();
        if(!response.ok || !result.ok) throw Error('Delivery failed');
        status.textContent='Your enquiry has been sent. GA Chauffeur Services will contact you shortly.';
        form.reset();requestId=crypto.randomUUID();
      }catch{status.textContent='We could not confirm delivery. Please retry, email enquiries@gachauffeurs.co.uk or call +44 7886 622082.';}
      finally{button.disabled=false;}
      return;
    }
    const body = `Name: ${values.get('name')}\nPhone: ${values.get('phone')}\nEmail: ${values.get('email')}\n\n${values.get('message')}`;
    location.href = 'mailto:enquiries@gachauffeurs.co.uk?subject='+encodeURIComponent('Chauffeur journey enquiry')+'&body='+encodeURIComponent(body);
    document.querySelector('#form-status').textContent='Please review and send the enquiry in your email app. If it did not open, email enquiries@gachauffeurs.co.uk or call +44 7886 622082. Nothing has been submitted by this website.';
  });
})();
