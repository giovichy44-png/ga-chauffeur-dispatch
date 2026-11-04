/* Server-verified quote client; configuration contains no credentials. */
(() => {
 const config=fetch('/api/forms-config',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Quote configuration unavailable');return r.json();});
 const cache=new Map(),pending=new Map();
 const key=s=>JSON.stringify(s);
 window.GAServerQuote={config,key,homeSpec(){
  const a=window.GAJourney?.addresses()||{};
  const v=document.querySelector('#quote-form [name=vehicle]:checked')?.value||'s';
  return {pickup:a.pickup||'',dropoff:a.destination||'',vehicle:({s:'mercedes_s_class',v:'mercedes_v_class',r:'range_rover_autobiography'})[v],service:'Point-to-point transfer',hours:'0'};
 },async get(spec){
  const k=key(spec),old=cache.get(k);
  if(old&&old.expires>Date.now()/1000+30)return old;
  if(pending.has(k))return pending.get(k);
  const task=(async()=>{
  const response=await fetch('/api/route-quote?'+new URLSearchParams(spec),{cache:'no-store',signal:AbortSignal.timeout(40000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Journey quote unavailable');
  if(cache.size>30)cache.clear();cache.set(k,data);return data;})();
  pending.set(k,task);try{return await task;}finally{pending.delete(k);}
 }};
})();
