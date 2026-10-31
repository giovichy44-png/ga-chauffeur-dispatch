(() => {
 const form=document.querySelector('#booking-form')||document.querySelector('#quote-form');if(!form)return;
 const booking=form.id==='booking-form',cache=new Map();
 fetch('/api/forms-config',{cache:'no-store'}).then(r=>r.json()).then(config=>{
  if(!config.postcode)return;
  for(const field of ['pickup','destination']){
   const id=booking?'booking-'+field:field,input=document.getElementById(id);
   const box=document.createElement('div');box.className='property-options';box.hidden=true;
   const status=document.createElement('p');status.setAttribute('role','status');
   const label=document.createElement('label');label.textContent='Choose your house or flat';
   const select=document.createElement('select');select.id=field+'-property';label.htmlFor=select.id;
   const more=document.createElement('button');more.type='button';more.textContent='Show more addresses';more.hidden=true;
   box.append(status,label,select,more);input.after(box);
   let timer,version=0,last='',page=0;
   const value=()=>booking?input.value:(window.GAJourney?.addresses()[field]||input.value);
   async function lookup(postcode,append=false){
    const token=++version;const widget=document.getElementById(id+'-search');if(widget)widget.after(box);box.hidden=false;status.textContent='Looking up addresses…';more.disabled=true;
    if(!append){page=0;select.replaceChildren(new Option('Choose your house or flat',''));select.hidden=label.hidden=true;}
    const key=postcode+'/'+page;
    try{
     if(!cache.has(key))cache.set(key,fetch('/api/postcode?postcode='+encodeURIComponent(postcode)+'&page='+page,{cache:'no-store'}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error);return data;}).catch(e=>{cache.delete(key);throw e;}));
     const data=await cache.get(key);if(token!==version)return;
     data.addresses.forEach(a=>select.add(new Option(a,a)));select.hidden=label.hidden=false;more.hidden=!data.more;status.textContent='';last=postcode;if(!append)select.focus();
    }catch(e){if(token===version){status.textContent=e.message;more.hidden=true;}}
    finally{if(token===version)more.disabled=false;}
   }
   function changed(){clearTimeout(timer);const postcode=value().replace(/\s/g,'').toUpperCase();
    if(!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(postcode)){version++;box.hidden=true;last='';return;}
    if(postcode===last&&!box.hidden)return;
    version++;timer=setTimeout(()=>lookup(postcode),650);
   }
   input.addEventListener('input',changed);document.addEventListener('ga-address-change',changed);
   more.addEventListener('click',()=>{page++;lookup(last,true);});
   select.addEventListener('change',()=>{if(!select.value)return;const address=select.value;clearTimeout(timer);version++;box.hidden=true;last='';
    if(booking&&window.GABookingAddresses)window.GABookingAddresses.setAddress(id,address);
    else if(!booking&&window.GAJourney)window.GAJourney.setAddress(id,address);
    else{input.value=address;input.dispatchEvent(new Event('input',{bubbles:true}));}
   });
   form.addEventListener('reset',()=>{clearTimeout(timer);version++;last='';box.hidden=true;});
  }
 }).catch(()=>{});
})();
