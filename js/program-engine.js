export const clone=value=>JSON.parse(JSON.stringify(value));

export function sequenceForStrength(plan){
  if(!plan?.strength)return [];
  const sequence=[];
  for(let circuit=1;circuit<=plan.strength.circuits;circuit++){
    for(const [id,n] of plan.strength.ex)sequence.push({id,n,c:circuit});
  }
  return sequence;
}

export function planForDate(program,date){
  return program?.days?.find(day=>day.date===date)||null;
}

export function normalizeProgram(program){
  if(!program||typeof program!=="object")throw new Error("Programme absent");
  return {
    version:1,
    start:program.start||"",
    days:Array.isArray(program.days)?program.days.map(day=>({
      date:day.date,
      label:day.label||"",
      strength:day.strength?{
        circuits:Number(day.strength.circuits),
        ex:Array.isArray(day.strength.ex)?day.strength.ex.map(item=>[item[0],Number(item[1])]):[]
      }:null,
      cardio:day.cardio?{
        w:Number(day.cardio.w||0),r:Number(day.cardio.r||0),m:Number(day.cardio.m||0),
        n:Number(day.cardio.n||0),total:Number(day.cardio.total||0),c:Number(day.cardio.c||0)
      }:null
    })):[]
  };
}

export function validateProgram(program,exerciseCatalog){
  if(!program||program.version!==1||!Array.isArray(program.days)||program.days.length<1||program.days.length>7){
    throw new Error("Le programme doit contenir de 1 à 7 jours");
  }
  const seen=new Set();
  for(const day of program.days){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day.date))throw new Error("Date invalide");
    if(seen.has(day.date))throw new Error("Deux journées ont la même date");
    seen.add(day.date);
    if(day.strength){
      if(!Number.isInteger(day.strength.circuits)||day.strength.circuits<1||day.strength.circuits>4)throw new Error("Nombre de circuits invalide");
      if(!Array.isArray(day.strength.ex)||!day.strength.ex.length)throw new Error("Liste d’exercices vide");
      for(const [id,n] of day.strength.ex){
        if(!exerciseCatalog[id]||!Number.isFinite(n)||n<=0||n>300)throw new Error(`Exercice invalide : ${id}`);
      }
    }
    if(day.cardio){
      const c=day.cardio;
      for(const key of ["w","r","m","n","total","c"]){
        if(!Number.isFinite(c[key])||c[key]<0)throw new Error(`Valeur cardio invalide : ${key}`);
      }
      if(c.r>0){
        if(c.m<=0||!Number.isInteger(c.n)||c.n<1||c.n>100)throw new Error("Cycles cardio invalides");
      }else if(c.total<=0)throw new Error("Durée du cardio facile invalide");
    }
  }
  program.days.sort((a,b)=>a.date.localeCompare(b.date));
  program.start=program.days[0].date;
  return program;
}

export function programSummary(program){
  let strengthDays=0,cardioDays=0,totalCycles=0;
  for(const day of program.days){
    if(day.strength)strengthDays++;
    if(day.cardio){cardioDays++;if(day.cardio.r>0)totalCycles+=day.cardio.n}
  }
  return {strengthDays,cardioDays,totalCycles,first:program.days[0].date,last:program.days.at(-1).date};
}
