(function(root){
 const vehicles={
  'Mercedes-Benz S-Class':{passengers:4,large:1,medium:1,checked:2,hand:1,label:'S-Class',description:'4 passengers, 1 large suitcase, 1 medium suitcase and 1 hand bag'},
  'Mercedes-Benz V-Class':{passengers:7,large:6,medium:6,checked:6,hand:6,label:'V-Class',description:'7 passengers, 6 large or medium suitcases in total and 6 carry-ons'},
  'Range Rover Autobiography Long Wheelbase':{passengers:4,large:2,medium:2,checked:2,hand:2,label:'Range Rover',description:'4 passengers, 2 large or medium suitcases in total and 2 carry-ons'}
 };
 function fits(c,d){return Number(d.passengers||0)<=c.passengers&&Number(d.largeCases||0)<=c.large&&Number(d.mediumCases||0)<=c.medium&&Number(d.largeCases||0)+Number(d.mediumCases||0)<=c.checked&&Number(d.handLuggage||0)<=c.hand;}
 function assess(d){
  const c=vehicles[d.vehicle];if(!c)return {message:'Choose your vehicle to see its passenger and luggage capacity.'};
  const passengerError=Number(d.passengers||0)>c.passengers?`This vehicle can accommodate a maximum of ${c.passengers} passengers.`:'';
  const luggageFits=Number(d.largeCases||0)<=c.large&&Number(d.mediumCases||0)<=c.medium&&Number(d.largeCases||0)+Number(d.mediumCases||0)<=c.checked&&Number(d.handLuggage||0)<=c.hand;
  const luggageError=luggageFits?'':`This luggage exceeds the ${c.label} capacity: ${c.description}.`;
  const suggestions=Object.entries(vehicles).filter(([name,cap])=>name!==d.vehicle&&fits(cap,d)).map(([name])=>name);
  const message=passengerError||luggageError ? [passengerError,luggageError,suggestions.length?'Please choose '+suggestions.join(' or ')+'.':'Please reduce the passenger or luggage count, or contact us to arrange additional transport.'].filter(Boolean).join(' ') : 'Vehicle capacity: '+c.description+'.';
  return {passengerError,luggageError,message,suggestions};
 }
 root.GACapacity={vehicles,assess};
})(globalThis);
