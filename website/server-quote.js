/* Server-verified quote client; configuration contains no credentials. */
(() => {
 let config;
 function getConfig() {
   return config ||= fetch('/api/forms-config',{cache:'no-store'}).then(r=>{
     if(!r.ok)throw Error();
     return r.json();
   }).catch(()=>{
     config=null;
     throw Error('The quote service is temporarily unavailable. Try again in a moment.');
   });
 }
 const cache=new Map(),pending=new Map();
 const key=s=>JSON.stringify(s);
 window.GAServerQuote={get config(){return getConfig();},key,homeSpec(){
  const a=window.GAJourney?.addresses()||{};
  const v=document.querySelector('#quote-form [name=vehicle]:checked')?.value||'s';
  return {pickup:a.pickup||'',dropoff:a.destination||'',vehicle:({s:'mercedes_s_class',v:'mercedes_v_class',r:'range_rover_autobiography'})[v],service:'Point-to-point transfer',hours:'0'};
 },async get(spec){
  const k=key(spec),old=cache.get(k);
  if(old&&old.expires>Date.now()/1000+30)return old;
  if(pending.has(k))return pending.get(k);
  const task=(async()=>{
  let response, data;
  try {
    response=await fetch('/api/route-quote?'+new URLSearchParams(spec),{cache:'no-store',signal:AbortSignal.timeout(40000)});
    data=await response.json();
  } catch (error) {
    throw Error(error.name==='TimeoutError'
      ? 'The route check took too long. Try again.'
      : 'The quote service could not be reached. Check your connection and try again.');
  }
  if(!response.ok)throw Error(data.error||'The quote service is temporarily unavailable. Try again in a moment.');
  if(cache.size>30)cache.clear();cache.set(k,data);return data;})();
  pending.set(k,task);try{return await task;}finally{pending.delete(k);}
 }};
})();
