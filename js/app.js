import {APP_VERSION,MAX_CLOCK_JUMP_MS} from "./config.js";
import {StorageManager} from "../storage/storage-manager.js";
import {AudioEngine} from "./audio-engine.js";
import {clone,sequenceForStrength,planForDate,normalizeProgram,validateProgram,programSummary} from "./program-engine.js";
import {cardioPosition,localDateKey,formatDuration} from "./timer-engine.js";
import {createSessionId,migrateState,contextDate} from "./session-controller.js";

const $=id=>document.getElementById(id);
let exerciseCatalog,audioLexicon,DEFAULT_PROGRAM,state;
let names={},instructions={};
let strengthTick=null,cardioTick=null,wakeLock=null;
let audioReadyForSession=false;
const storage=new StorageManager();

async function loadJson(path){
  const response=await fetch(path,{cache:"no-cache"});
  if(!response.ok)throw new Error(`${path} : ${response.status}`);
  return response.json();
}

try{
  const [exerciseData,audioData,programData]=await Promise.all([
    loadJson("data/exercices.json"),loadJson("data/lexique-audio.json"),loadJson("data/programme-defaut.json")
  ]);
  exerciseCatalog=exerciseData.exercises||{};audioLexicon=audioData;DEFAULT_PROGRAM=programData;
  names=Object.fromEntries(Object.entries(exerciseCatalog).map(([id,e])=>[id,e.name]));
  instructions=Object.fromEntries(Object.entries(exerciseCatalog).map(([id,e])=>[id,e.instruction]));
}catch(error){
  document.body.innerHTML=`<main style="max-width:680px;margin:40px auto;padding:20px;font-family:system-ui"><h1>Impossible de charger l’application</h1><p>Vérifie les dossiers <code>data/</code> et <code>js/</code>.</p><pre>${String(error)}</pre></main>`;
  throw error;
}

const audio=new AudioEngine(audioLexicon,status=>{if($("audioStatus"))$("audioStatus").textContent=status});
const blank=()=>({version:Number(APP_VERSION),program:clone(DEFAULT_PROGRAM),previousProgram:null,days:{},activeSession:null});
state=migrateState(await storage.load(blank),DEFAULT_PROGRAM,Number(APP_VERSION));
save();

function save(){state._savedAt=Date.now();storage.save(state);renderStorageStatus()}
function currentContext(){
  const date=contextDate(state,localDateKey());
  return {k:date,plan:planForDate(state.program,date),data:state.days[date]||{},active:state.activeSession};
}
function sessionDateLabel(date){return new Date(`${date}T12:00:00`).toLocaleDateString("fr-CA",{weekday:"long",day:"numeric",month:"long"})}
function sequenceFromActiveOrPlan(plan){return state.activeSession?.type==="strength"?state.activeSession.sequence:sequenceForStrength(plan)}

function populateExerciseUI(){
  const select=$("exerciseChartSelect"),current=select?.value||"p";
  if(select){select.innerHTML=Object.entries(exerciseCatalog).map(([id,e])=>`<option value="${id}">${e.chartName||e.name}</option>`).join("");if(exerciseCatalog[current])select.value=current}
  const list=$("exerciseTechniqueList");
  if(list)list.innerHTML=Object.values(exerciseCatalog).map(e=>`<li><strong>${e.name} :</strong> ${e.technique||e.instruction}${e.equipment&&e.equipment!=="Aucun"?` <span class="muted">Équipement : ${e.equipment}.</span>`:""}</li>`).join("");
  $("catalogStatus").textContent=`Catalogue modulaire : ${Object.keys(exerciseCatalog).length} exercices chargés.`;
}

function render(){
  const {k,plan,data,active}=currentContext();
  const date=new Date(`${k}T12:00:00`);
  $("dateTitle").textContent=active?`Séance en cours · ${date.toLocaleDateString("fr-CA",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}`:date.toLocaleDateString("fr-CA",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  $("dayLabel").textContent=plan?.label||"Aucun programme chargé pour cette date";
  $("programBadge").textContent=state.program.start?`Bloc du ${state.program.start}`:"Programme";
  renderResumeBanner();renderStrength(plan,data);renderCardio(plan,data);renderNotes(data);renderHistory();renderCharts();renderStorageStatus();
}

function renderResumeBanner(){
  const banner=$("resumeSessionBanner"),session=state.activeSession;
  if(!session||audioReadyForSession){banner.classList.add("hidden");return}
  $("resumeSessionTitle").textContent=session.type==="cardio"?"Marche/course restaurée":"Musculation restaurée";
  $("resumeSessionText").textContent=`Séance du ${sessionDateLabel(session.programDate)}. Les chronos continuent à partir des heures enregistrées.`;
  banner.classList.remove("hidden");
}

function renderStrength(plan,data){
  ["strengthNone","strengthReady","strengthActive","strengthDone"].forEach(id=>$(id).classList.add("hidden"));
  $("nextExercisePreview")?.classList.add("hidden");
  const active=state.activeSession;
  if(active&&active.type!=="strength"){$("strengthNone").textContent="Termine d’abord la séance de cardio en cours.";$("strengthNone").classList.remove("hidden");return}
  if(active?.type==="strength"){
    $("strengthActive").classList.remove("hidden");renderStrengthActive(active.sequence,active);startStrengthTick();return;
  }
  if(!plan?.strength){$("strengthNone").textContent="Aucun renforcement prévu aujourd’hui.";$("strengthNone").classList.remove("hidden");return}
  if(data.strengthDone){
    $("strengthDone").classList.remove("hidden");const result=data.strengthResult||{};
    $("strengthStats").innerHTML=`<div class=summary><span>Total</span><strong>${formatDuration(result.total||0)}</strong></div><div class=summary><span>Exercices</span><strong>${formatDuration((result.ex||[]).reduce((a,b)=>a+b,0))}</strong></div><div class=summary><span>Repos</span><strong>${formatDuration((result.rest||[]).reduce((a,b)=>a+b,0))}</strong></div>`;return;
  }
  $("strengthReady").classList.remove("hidden");$("strengthSummary").textContent=`${plan.strength.circuits} circuits · ${plan.strength.ex.length} exercices par circuit.`;
}

function exerciseDefinition(id){return exerciseCatalog[id]||null}
function exerciseTargetText(exercise){
  const definition=exerciseDefinition(exercise.id);if(!definition)return `${exercise.n} ${exercise.id}`;
  return definition.measure==="seconds"?`${definition.name} · ${exercise.n} secondes`:`${exercise.n} ${definition.name}`;
}
function renderNextExercisePreview(sequence,session){
  const preview=$("nextExercisePreview");
  if(session.phase!=="rest"||session.index+1>=sequence.length){preview.classList.add("hidden");return}
  const next=sequence[session.index+1],definition=exerciseDefinition(next.id);if(!definition){preview.classList.add("hidden");return}
  const image=$("nextExerciseImage");image.src=definition.previewImage||"logobicep.png";image.alt=`Aperçu : ${definition.name}`;image.onerror=()=>{image.onerror=null;image.src="logobicep.png"};
  $("nextExerciseName").textContent=definition.name;$("nextExerciseTarget").textContent=exerciseTargetText(next);$("nextExerciseInstruction").textContent=definition.instruction||"";preview.classList.remove("hidden");
}
function renderStrengthActive(sequence,session){
  const exercise=sequence[Math.min(session.index,sequence.length-1)],rest=session.phase==="rest";
  $("strengthPhaseLabel").textContent=rest?"Repos":"Exercice";$("strengthExercise").textContent=rest?"Repos":exerciseTargetText(exercise);
  $("strengthInstruction").textContent=rest?"Prends le temps qu’il te faut. Le chrono total continue.":instructions[exercise.id]||"";
  $("strengthCounter").textContent=rest?`Après l’exercice ${session.index+1} sur ${sequence.length}`:`Circuit ${exercise.c} sur ${session.circuits} · exercice ${session.index+1} sur ${sequence.length}`;
  $("strengthAction").textContent=rest?"Prochain exercice":(session.index===sequence.length-1?"Terminer la séance":"Repos");
  $("strengthProgress").style.width=`${session.index/sequence.length*100}%`;renderNextExercisePreview(sequence,session);updateStrengthTimers();
}
function startStrengthTick(){clearInterval(strengthTick);strengthTick=setInterval(updateStrengthTimers,250)}
function updateStrengthTimers(){
  const session=state.activeSession;if(!session||session.type!=="strength")return;
  $("strengthTotal").textContent=formatDuration((Date.now()-session.startedAt)/1000);$("strengthPhase").textContent=formatDuration((Date.now()-session.phaseStartedAt)/1000);
}

function durationTokens(seconds){
  const tokens=[],minutes=Math.floor(seconds/60),remaining=seconds%60;
  if(minutes>0)tokens.push(minutes===1?"numf:1":minutes,minutes===1?"minute":"minutes");
  if(minutes>0&&remaining>0)tokens.push("et");
  if(remaining>0)tokens.push(remaining,remaining===1?"seconde":"secondes");
  return tokens;
}
function finishTokens(){return ["bravo","entrainement","termine"]}
function strengthExerciseTokens(exercise,totalCircuits){
  const definition=exerciseDefinition(exercise.id);if(!definition)return [];
  const audioDef=definition.audio||{},phrase=exercise.n===1&&audioDef.singular?audioDef.singular:(audioDef.plural||audioDef.tokens||[]),circuit=["circuit",`num:${exercise.c}`,"de",`num:${totalCircuits}`];
  if(definition.measure==="seconds")return audioDef.countPosition==="before"?[...durationTokens(exercise.n),...phrase,...circuit]:[...phrase,...durationTokens(exercise.n),...circuit];
  const numberToken=exercise.n===1&&audioDef.gender==="feminine"?"numf:1":`num:${exercise.n}`;
  return audioDef.countPosition==="after"?[...phrase,numberToken,...circuit]:[numberToken,...phrase,...circuit];
}
async function preloadStrengthSession(session){
  const tokens=["repos",...finishTokens()];for(const ex of session.sequence)tokens.push(...strengthExerciseTokens(ex,session.circuits));await audio.preload(tokens);
}
async function startStrength(){
  if(state.activeSession)return;
  const unlock=audio.createContextFromGesture();
  const {k,plan}=currentContext();const sequence=sequenceForStrength(plan);if(!sequence.length)return;
  $("startStrength").disabled=true;$("startStrength").querySelector("strong").textContent="Préparation de l’audio…";
  await unlock;await storage.requestPersistence();
  const now=Date.now();const session={id:createSessionId(),type:"strength",programDate:k,startedAt:now,phase:"exercise",phaseStartedAt:now,index:0,exerciseDurations:[],restDurations:[],sequence,circuits:plan.strength.circuits,restored:false};
  await preloadStrengthSession(session);state.activeSession=session;audioReadyForSession=true;save();requestWake();render();void audio.play(strengthExerciseTokens(sequence[0],session.circuits),{bell:true});
}
function strengthAction(){
  const session=state.activeSession;if(!session||session.type!=="strength")return;
  const now=Date.now(),sequence=session.sequence,elapsed=Math.floor((now-session.phaseStartedAt)/1000);
  if(session.phase==="exercise"){
    session.exerciseDurations[session.index]=elapsed;
    if(session.index===sequence.length-1){finishStrength();return}
    session.phase="rest";session.phaseStartedAt=now;void audio.play(["repos"],{bell:true});
  }else{
    session.restDurations[session.index]=elapsed;session.index++;session.phase="exercise";session.phaseStartedAt=now;void audio.play(strengthExerciseTokens(sequence[session.index],session.circuits),{bell:true});
  }
  save();renderStrengthActive(sequence,session);
}
function finishStrength(){
  const session=state.activeSession;if(!session||session.type!=="strength")return;
  const now=Date.now(),date=session.programDate,data=state.days[date]||{};
  session.exerciseDurations[session.index]=Math.floor((now-session.phaseStartedAt)/1000);
  state.days[date]={...data,strengthDone:true,strengthResult:{total:Math.floor((now-session.startedAt)/1000),ex:session.exerciseDurations,rest:session.restDurations,exercises:session.sequence.map(x=>({id:x.id,n:x.n,c:x.c}))}};
  state.activeSession=null;audioReadyForSession=false;clearInterval(strengthTick);releaseWake();save();void audio.play(finishTokens(),{bell:true});render();
}
function cancelStrength(){
  const session=state.activeSession;if(!session||session.type!=="strength"||!confirm("Annuler cette séance?"))return;
  state.activeSession=null;audioReadyForSession=false;clearInterval(strengthTick);releaseWake();save();render();
}
function redoStrength(){const {k,data}=currentContext();state.days[k]={...data,strengthDone:false,strengthResult:null};save();render()}

function cardioText(c){
  if(!c)return "";
  if(c.r>0){const n=c.n||Math.max(1,Math.floor((c.total||0)/(c.r+c.m))),alt=n*(c.r+c.m);return `<p><strong>Échauffement :</strong> ${c.w/60} min de marche.</p><p><strong>Intervalles :</strong> ${n} cycles de ${c.r} s de course + ${c.m} s de marche (${Math.round(alt/60)} min d’alternance).</p><p><strong>Retour au calme :</strong> ${c.c/60} min de marche.</p>`}
  return `<p><strong>Marche rapide ou jogging facile :</strong> ${Math.round((c.w+c.total+c.c)/60)} minutes au total.</p>`;
}
function renderCardio(plan,data){
  ["cardioNone","cardioReady","cardioActive","cardioDone"].forEach(id=>$(id).classList.add("hidden"));
  const active=state.activeSession;
  if(active&&active.type!=="cardio"){$("cardioNone").textContent="Termine d’abord la séance de musculation en cours.";$("cardioNone").classList.remove("hidden");return}
  if(active?.type==="cardio"){$("cardioActive").classList.remove("hidden");renderCardioActive(cardioPosition(active.config,active.startedAt));startCardioTick();return}
  if(!plan?.cardio){$("cardioNone").textContent="Aucun cardio prévu aujourd’hui.";$("cardioNone").classList.remove("hidden");return}
  if(data.cardioDone){
    $("cardioDone").classList.remove("hidden");const r=data.cardioResult||{},status=r.early?"Terminée plus tôt":"Complétée";
    $("cardioStats").innerHTML=`<div class=summary><span>Statut</span><strong>${status}</strong></div><div class=summary><span>Temps total</span><strong>${formatDuration(r.total||0)}</strong></div><div class=summary><span>Course</span><strong>${formatDuration(r.run||0)}</strong></div><div class=summary><span>Marche</span><strong>${formatDuration(r.walk||0)}</strong></div>${r.cyclesPlanned?`<div class=summary><span>Cycles</span><strong>${r.cyclesCompleted||0} sur ${r.cyclesPlanned}</strong></div>`:""}`;return;
  }
  $("cardioReady").classList.remove("hidden");$("cardioPrescription").innerHTML=cardioText(plan.cardio);
}
function phaseThresholds(kind,duration){
  const values=[];
  if(kind==="run"){for(let t=15;t<duration;t+=15)if(t>5)values.push(t)}
  else{for(let t=60;t<duration;t+=60)if(t>5)values.push(t);if(duration>15)values.push(15)}
  return [...new Set(values)].sort((a,b)=>a-b);
}
function remainingTokens(seconds){return [...durationTokens(seconds),seconds===1?"restante":"restantes"]}
function runTokens(c,cycle){return ["course",c.r,c.r===1?"seconde":"secondes","cycle",`num:${cycle}`,"de",`num:${c.n}`]}
function walkTokens(seconds){return ["marche",...durationTokens(seconds)]}
function warmTokens(seconds){return ["echauffement",...durationTokens(seconds)]}
function coolTokens(seconds){return ["retour","au","calme",...durationTokens(seconds)]}
function phaseTokens(position){
  const phase=position.phase,c=position.timeline.config;if(!phase)return [];
  if(phase.kind==="warm")return warmTokens(phase.duration);if(phase.kind==="run")return runTokens(c,phase.cycle);if(phase.kind==="cool")return coolTokens(phase.duration);return walkTokens(phase.duration);
}
async function preloadCardio(config){
  const initial=cardioPosition(config,Date.now()),tokens=[1,2,3,4,5,"restante","restantes",...finishTokens()];
  for(const phase of initial.timeline.phases){tokens.push(...phaseTokens({phase,timeline:initial.timeline}));for(const t of phaseThresholds(phase.kind,phase.duration))tokens.push(...remainingTokens(t))}
  await audio.preload(tokens);
}
async function startCardio(){
  if(state.activeSession)return;
  const unlock=audio.createContextFromGesture();const {k,plan}=currentContext();if(!plan?.cardio)return;
  $("startCardio").disabled=true;$("startCardio").querySelector("strong").textContent="Préparation de l’audio…";
  await unlock;await storage.requestPersistence();const config={...plan.cardio};if(config.r>0&&!config.n)config.n=Math.max(1,Math.floor((config.total||0)/(config.r+config.m)));
  await preloadCardio(config);const now=Date.now(),position=cardioPosition(config,now,now);
  state.activeSession={id:createSessionId(),type:"cardio",programDate:k,startedAt:now,config,lastPhaseKey:position.phase?.key||null,announcedRemaining:[],lastCountdown:0,previousRemaining:position.phase?.remaining??null,lastTickAt:now,restored:false};
  audioReadyForSession=true;save();requestWake();render();void audio.play(phaseTokens(position),{bell:true});
}
function startCardioTick(){clearInterval(cardioTick);cardioTick=setInterval(cardioStep,200)}
function cardioStep(){
  const session=state.activeSession;if(!session||session.type!=="cardio")return;
  const now=Date.now(),position=cardioPosition(session.config,session.startedAt,now);
  if(position.complete){finishCardio(false,true);return}
  const phase=position.phase,phaseChanged=session.lastPhaseKey!==phase.key;
  if(phaseChanged){
    session.lastPhaseKey=phase.key;session.announcedRemaining=[];session.lastCountdown=0;session.previousRemaining=phase.remaining;
    if(audioReadyForSession)void audio.play(phaseTokens(position),{bell:true});
    save();
  }else{
    const delta=now-(session.lastTickAt||now),previous=Number.isFinite(session.previousRemaining)?session.previousRemaining:phase.remaining;
    if(delta<=MAX_CLOCK_JUMP_MS&&audioReadyForSession){
      if(phase.remaining>5){
        const threshold=phaseThresholds(phase.kind,phase.duration).filter(t=>!session.announcedRemaining.includes(t)).find(t=>previous>t&&phase.remaining<=t);
        if(threshold!==undefined){session.announcedRemaining.push(threshold);void audio.play(remainingTokens(threshold),{bell:false});save()}
      }
      if(phase.remaining>=1&&phase.remaining<=5&&session.lastCountdown!==phase.remaining){session.lastCountdown=phase.remaining;void audio.play([phase.remaining],{bell:false});save()}
    }
    session.previousRemaining=phase.remaining;
  }
  session.lastTickAt=now;renderCardioActive(position);
}
function renderCardioActive(position){
  if(!position.phase)return;
  $("cardioTotal").textContent=formatDuration(position.totalElapsed);$("cardioRemaining").textContent=formatDuration(position.phase.remaining);
  const p=position.phase,c=position.timeline.config;
  $("cardioPhase").textContent=p.kind==="warm"?"Échauffement":p.kind==="run"?`Course · cycle ${p.cycle} de ${c.n}`:p.kind==="walk"&&c.r>0?`Marche · après cycle ${p.cycle} de ${c.n}`:p.kind==="walk"?"Marche":"Retour au calme";
  $("cardioPhase").className=`phase ${p.kind==="run"?"run":p.kind==="walk"||p.kind==="cool"?"walk":"warm"}`;
}
function finishCardio(early=false,automatic=false){
  const session=state.activeSession;if(!session||session.type!=="cardio")return;
  const now=automatic?session.startedAt+cardioPosition(session.config,session.startedAt).timeline.totalDuration*1000:Date.now();
  const position=cardioPosition(session.config,session.startedAt,now),date=session.programDate,data=state.days[date]||{},planned=position.timeline.config.r>0?position.timeline.config.n:0;
  state.days[date]={...data,cardioDone:true,cardioResult:{total:Math.round(position.totalElapsed),run:Math.round(position.runElapsed),walk:Math.round(position.walkElapsed),early,cyclesCompleted:position.completedCycles,cyclesPlanned:planned,endedPhase:position.phase?.kind||"complete"}};
  state.activeSession=null;audioReadyForSession=false;clearInterval(cardioTick);releaseWake();save();if(!automatic)void audio.play(finishTokens(),{bell:true});render();
}
function redoCardio(){const {k,data}=currentContext();state.days[k]={...data,cardioDone:false,cardioResult:null};save();render()}

async function resumeActiveAudio(){
  const session=state.activeSession;if(!session)return;
  const unlock=audio.createContextFromGesture();$("resumeAudioBtn").disabled=true;$("resumeAudioBtn").textContent="Préparation…";await unlock;
  if(session.type==="cardio"){
    const position=cardioPosition(session.config,session.startedAt);if(position.complete){finishCardio(false,true);return}
    await preloadCardio(session.config);session.lastPhaseKey=position.phase.key;session.previousRemaining=position.phase.remaining;session.announcedRemaining=[];session.lastCountdown=0;void audio.play(phaseTokens(position),{bell:true});
  }else{
    await preloadStrengthSession(session);const exercise=session.sequence[session.index];void audio.play(session.phase==="rest"?["repos"]:strengthExerciseTokens(exercise,session.circuits),{bell:true});
  }
  audioReadyForSession=true;session.restored=false;session.lastTickAt=Date.now();save();requestWake();render();
}

async function requestWake(){try{if("wakeLock" in navigator)wakeLock=await navigator.wakeLock.request("screen")}catch(error){console.warn("Wake Lock indisponible",error)}}
function releaseWake(){try{wakeLock?.release()}catch{}wakeLock=null}

function renderNotes(data){$("note").value=data.note||"";$("weight").value=data.weight||"";document.querySelectorAll("#difficulty button").forEach(button=>button.classList.toggle("selected",Number(button.dataset.v)===data.difficulty))}
function saveNote(){const {k,data}=currentContext(),weight=parseFloat($("weight").value);state.days[k]={...data,note:$("note").value.trim(),difficulty:Number(document.querySelector("#difficulty .selected")?.dataset.v||0),weight:Number.isFinite(weight)?weight:null};save();renderHistory();renderCharts();alert("Note sauvegardée.")}
function renderHistory(){
  const entries=Object.entries(state.days).filter(([,v])=>v.strengthDone||v.cardioDone||v.note||v.weight).sort((a,b)=>b[0].localeCompare(a[0]));
  $("historyList").innerHTML=entries.length?entries.map(([date,value])=>{const parts=[];if(value.strengthDone)parts.push("Musculation");if(value.cardioDone)parts.push(value.cardioResult?.early?"Cardio écourté":"Cardio");if(value.difficulty)parts.push(["","Facile","Correct","Difficile"][value.difficulty]);if(value.weight)parts.push(`${value.weight} lb`);return `<div class=history><strong>${new Date(`${date}T12:00:00`).toLocaleDateString("fr-CA",{day:"numeric",month:"short"})}</strong><span class=muted>${parts.join(" · ")}</span></div>${value.note?`<div class="small muted" style="padding:0 0 9px">${value.note}</div>`:""}`}).join(""):"<div class=muted>Aucune donnée pour le moment.</div>";
}
function lineChart(points,unit){
  if(points.length<2)return `<div class=chartEmpty>${points.length?"Une deuxième donnée fera apparaître le graphique.":"Aucune donnée enregistrée."}</div>`;
  const W=640,H=260,pad={l:48,r:18,t:22,b:42},values=points.map(p=>p.v),min=Math.min(...values),max=Math.max(...values),span=Math.max(1,max-min),x=i=>pad.l+i*(W-pad.l-pad.r)/(points.length-1),y=v=>pad.t+(max-v)*(H-pad.t-pad.b)/span;
  const path=points.map((p,i)=>`${i?"L":"M"} ${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const grid=[0,.25,.5,.75,1].map(f=>{const yy=pad.t+f*(H-pad.t-pad.b),value=max-f*span;return `<line class=chartGrid x1="${pad.l}" y1="${yy}" x2="${W-pad.r}" y2="${yy}"/><text class=chartLabel x="4" y="${yy+4}">${value.toFixed(unit==="lb"?1:0)}</text>`}).join("");
  const dots=points.map((p,i)=>`<circle class=chartDot cx="${x(i)}" cy="${y(p.v)}" r="5"/><text class=chartValue x="${x(i)}" y="${y(p.v)-10}" text-anchor="middle">${p.v}${unit==="s"?" s":""}</text><text class=chartLabel x="${x(i)}" y="${H-14}" text-anchor="middle">${p.label}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Graphique de progression">${grid}<path class=chartLine d="${path}"/>${dots}</svg>`;
}
function exercisePoints(id){const points=[];for(const [date,value] of Object.entries(state.days).sort((a,b)=>a[0].localeCompare(b[0]))){const matches=(value.strengthResult?.exercises||[]).filter(x=>x.id===id);if(matches.length)points.push({label:new Date(`${date}T12:00:00`).toLocaleDateString("fr-CA",{day:"numeric",month:"short"}),v:matches.reduce((sum,x)=>sum+x.n,0)})}return points.slice(-12)}
function weightPoints(){return Object.entries(state.days).filter(([,v])=>Number.isFinite(v.weight)&&v.weight>0).sort((a,b)=>a[0].localeCompare(b[0])).slice(-12).map(([date,value])=>({label:new Date(`${date}T12:00:00`).toLocaleDateString("fr-CA",{day:"numeric",month:"short"}),v:value.weight}))}
function renderCharts(){const id=$("exerciseChartSelect")?.value||"p";if($("exerciseChart")){const unit=exerciseCatalog[id]?.measure==="seconds"?"s":"rép.";$("exerciseChart").innerHTML=lineChart(exercisePoints(id),unit)}if($("weightChart"))$("weightChart").innerHTML=lineChart(weightPoints(),"lb")}

function canonical(obj){if(Array.isArray(obj))return obj.map(canonical);if(obj&&typeof obj==="object"){const out={};Object.keys(obj).sort().forEach(key=>{if(obj[key]!==undefined)out[key]=canonical(obj[key])});return out}return obj}
function checksum(obj){const text=JSON.stringify(canonical(obj));let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)}return (hash>>>0).toString(36)}
function b64e(obj){const bytes=new TextEncoder().encode(JSON.stringify(obj));let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replaceAll("+","-").replaceAll("/","_").replaceAll("=","")}
function b64d(value){let text=value.replaceAll("-","+").replaceAll("_","/");while(text.length%4)text+="=";const binary=atob(text),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return JSON.parse(new TextDecoder().decode(bytes))}
function makeEnvelope(kind,payload){const body={format:kind,version:1,created:new Date().toISOString(),payload};return {...body,check:checksum(body)}}
function openEnvelope(raw,kind){const prefix=`${kind}.`;if(!raw.startsWith(prefix))throw new Error(`La chaîne doit commencer par ${prefix}`);const envelope=b64d(raw.slice(prefix.length));if(!envelope||envelope.format!==kind||envelope.version!==1)throw new Error("Version ou format non reconnu");const given=envelope.check,copy={...envelope};delete copy.check;if(given!==checksum(copy))throw new Error("La chaîne est corrompue ou incomplète");return envelope.payload}
function importPreview(){
  try{
    const program=validateProgram(normalizeProgram(openEnvelope($("importText").value.trim(),"GP1")),exerciseCatalog),summary=programSummary(program);
    $("importPreview").innerHTML=`<p><strong>${program.days.length} jours</strong>, du ${summary.first} au ${summary.last}.</p><div class=summary><span>Musculation</span><strong>${summary.strengthDays} jours</strong></div><div class=summary><span>Cardio</span><strong>${summary.cardioDays} jours</strong></div><div class=summary><span>Cycles programmés</span><strong>${summary.totalCycles}</strong></div><button id=confirmImport class=primary>Installer ce programme</button>`;
    $("confirmImport").onclick=()=>{state.previousProgram=state.program;state.program=program;save();alert("Programme installé.");render()};
  }catch(error){$("importPreview").innerHTML=`<p style="color:#fca5a5">Chaîne invalide : ${error.message}</p>`}
}
function exportPayload(){
  const ordered={};Object.keys(state.days).sort().forEach(key=>ordered[key]=state.days[key]);const weights=Object.entries(state.days).filter(([,v])=>Number.isFinite(v.weight)).sort((a,b)=>b[0].localeCompare(a[0]));
  return {appVersion:Number(APP_VERSION),storageMode:storage.mode,exerciseCatalogVersion:2,availableExercises:Object.keys(exerciseCatalog),exportedAt:new Date().toISOString(),currentDate:localDateKey(),activeSession:state.activeSession,activeProgram:state.program,previousProgram:state.previousProgram,tracking:ordered,summary:{completedStrength:Object.values(state.days).filter(v=>v.strengthDone).length,completedCardio:Object.values(state.days).filter(v=>v.cardioDone).length,earlyCardio:Object.values(state.days).filter(v=>v.cardioResult?.early).length,latestWeight:weights.length?weights[0][1].weight:null}};
}
function exportData(){$("exportText").value="GX1."+b64e(makeEnvelope("GX1",exportPayload()))}
function runFormatSelfTest(){
  try{const sample=validateProgram(normalizeProgram(state.program),exerciseCatalog),encoded="GP1."+b64e(makeEnvelope("GP1",sample)),decoded=validateProgram(normalizeProgram(openEnvelope(encoded,"GP1")),exerciseCatalog),ok=JSON.stringify(canonical(sample))===JSON.stringify(canonical(decoded));$("formatStatus").textContent=ok?"Formats GP1 et GX1 vérifiés : prêts.":"Le test interne du format a échoué.";return ok}catch(error){$("formatStatus").textContent="Erreur du test interne : "+error.message;return false}
}
function restoreProgram(){if(!state.previousProgram)return alert("Aucun programme précédent.");[state.program,state.previousProgram]=[state.previousProgram,state.program];save();render();alert("Programme précédent restauré.")}

function renderStorageStatus(){
  const storageEl=$("storageStatus");if(storageEl)storageEl.textContent=`Stockage : ${storage.mode}${storage.lastError?" (secours local actif)":""} · ${storage.persistence}.`;
  const offline=$("offlineStatus");if(offline){offline.textContent=navigator.onLine?"Connexion disponible · fonctionnement hors ligne préparé.":"Mode hors ligne actif.";offline.className=`muted small ${navigator.onLine?"statusOk":"statusWarn"}`}
}
async function registerServiceWorker(){
  if(!("serviceWorker" in navigator)){$("offlineStatus").textContent="Service worker non pris en charge.";return}
  try{const registration=await navigator.serviceWorker.register("service-worker.js",{scope:"./"});registration.update().catch(()=>{});renderStorageStatus()}catch(error){console.warn("Service worker",error);$("offlineStatus").textContent="Cache hors ligne non activé : "+error.message}
}
async function reconcileActiveSession(){
  const session=state.activeSession;if(!session)return;
  session.restored=true;audioReadyForSession=false;
  if(session.type==="cardio"){
    const position=cardioPosition(session.config,session.startedAt);
    if(position.complete){finishCardio(false,true);return}
  }
  save();
}

// Événements.
document.querySelectorAll(".tab").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===button));["today","history","transfer"].forEach(view=>$(view+"View").classList.toggle("hidden",view!==button.dataset.view));render()}));
$("startStrength").addEventListener("click",startStrength);$("strengthAction").addEventListener("click",strengthAction);$("cancelStrength").addEventListener("click",cancelStrength);$("redoStrength").addEventListener("click",redoStrength);
$("startCardio").addEventListener("click",startCardio);$("stopCardio").addEventListener("click",()=>{if(confirm("Terminer la séance maintenant?"))finishCardio(true,false)});$("earlyCardio").addEventListener("click",()=>{if(confirm("Enregistrer le cardio comme terminé plus tôt?"))finishCardio(true,false)});$("redoCardio").addEventListener("click",redoCardio);
$("resumeAudioBtn").addEventListener("click",resumeActiveAudio);
document.querySelectorAll("#difficulty button").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll("#difficulty button").forEach(x=>x.classList.remove("selected"));button.classList.add("selected")}));
$("testAudio").addEventListener("click",async()=>{const unlock=audio.createContextFromGesture();await unlock;await audio.preload(finishTokens());await audio.play(finishTokens(),{bell:true})});
$("saveNote").addEventListener("click",saveNote);$("exerciseChartSelect").addEventListener("change",renderCharts);$("previewImport").addEventListener("click",importPreview);$("exportBtn").addEventListener("click",exportData);
$("copyExport").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("exportText").value);alert("Chaîne copiée.")}catch{$("exportText").select();document.execCommand("copy");alert("Chaîne copiée.")}});
$("restoreProgram").addEventListener("click",restoreProgram);
$("resetAll").addEventListener("click",async()=>{if(confirm("Effacer programme, historique et notes?")){clearInterval(cardioTick);clearInterval(strengthTick);releaseWake();await storage.clear();state=blank();audioReadyForSession=false;save();render()}});
$("runnerLauncherIcon").addEventListener("error",event=>{event.currentTarget.src="IconeCoureur.svg"},{once:true});
window.addEventListener("online",renderStorageStatus);window.addEventListener("offline",renderStorageStatus);
document.addEventListener("visibilitychange",async()=>{
  if(document.visibilityState==="visible"&&state.activeSession){const resumed=await audio.resume();if(!resumed){audioReadyForSession=false;renderResumeBanner()}else requestWake()}
});

populateExerciseUI();await reconcileActiveSession();render();runFormatSelfTest();registerServiceWorker();
