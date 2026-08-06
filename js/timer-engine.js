export function buildCardioTimeline(config){
  const c={...config};
  if(c.r>0&&!c.n)c.n=Math.max(1,Math.floor((c.total||0)/(c.r+c.m)));
  const phases=[];
  let offset=0,index=0;
  const add=(kind,duration,cycle=0)=>{
    if(!duration||duration<=0)return;
    phases.push({kind,duration,cycle,index:index++,startOffset:offset,endOffset:offset+duration});
    offset+=duration;
  };
  add("warm",c.w||0);
  if(c.r>0){
    for(let cycle=1;cycle<=c.n;cycle++){
      add("run",c.r,cycle);
      add("walk",c.m,cycle);
    }
  }else add("walk",c.total||0);
  add("cool",c.c||0);
  return {config:c,phases,totalDuration:offset};
}

export function cardioPosition(config,startedAt,now=Date.now()){
  const timeline=buildCardioTimeline(config);
  const elapsed=Math.max(0,(now-startedAt)/1000);
  const capped=Math.min(elapsed,timeline.totalDuration);
  let runElapsed=0,walkElapsed=0,completedCycles=0;
  for(const phase of timeline.phases){
    const overlap=Math.max(0,Math.min(capped,phase.endOffset)-phase.startOffset);
    if(phase.kind==="run")runElapsed+=overlap;
    else walkElapsed+=overlap;
    if(phase.kind==="walk"&&phase.cycle&&capped>=phase.endOffset)completedCycles=phase.cycle;
  }
  if(elapsed>=timeline.totalDuration){
    return {complete:true,totalElapsed:timeline.totalDuration,totalPlanned:timeline.totalDuration,runElapsed,walkElapsed,completedCycles,phase:null,timeline};
  }
  const phase=timeline.phases.find(item=>elapsed<item.endOffset)||timeline.phases.at(-1);
  const phaseElapsed=Math.max(0,elapsed-phase.startOffset);
  return {
    complete:false,totalElapsed:elapsed,totalPlanned:timeline.totalDuration,runElapsed,walkElapsed,completedCycles,
    phase:{...phase,key:`${phase.kind}:${phase.cycle}:${phase.index}`,startedAt:startedAt+phase.startOffset*1000,endsAt:startedAt+phase.endOffset*1000,elapsed:phaseElapsed,remaining:Math.max(0,Math.ceil(phase.duration-phaseElapsed))},
    timeline
  };
}

export function localDateKey(date=new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

export function formatDuration(seconds){
  const s=Math.max(0,Math.floor(seconds));
  const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;
  return h?`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(x).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(x).padStart(2,"0")}`;
}
