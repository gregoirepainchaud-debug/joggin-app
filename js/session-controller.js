import {sequenceForStrength,planForDate} from "./program-engine.js";

export function createSessionId(){
  if(crypto.randomUUID)return crypto.randomUUID();
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function migrateState(input,defaultProgram,appVersion){
  const state=input&&typeof input==="object"?input:{};
  state.version=appVersion;
  state.program=state.program||JSON.parse(JSON.stringify(defaultProgram));
  state.previousProgram=state.previousProgram||null;
  state.days=state.days&&typeof state.days==="object"?state.days:{};
  state.activeSession=state.activeSession||null;
  if(!state.activeSession){
    for(const [date,data] of Object.entries(state.days)){
      if(data?.strengthSession){
        const legacy=data.strengthSession;
        const plan=planForDate(state.program,date);
        const sequence=sequenceForStrength(plan);
        state.activeSession={
          id:createSessionId(),type:"strength",programDate:date,startedAt:legacy.start||Date.now(),
          phase:legacy.phase||"exercise",phaseStartedAt:legacy.phaseStart||legacy.start||Date.now(),
          index:legacy.i||0,exerciseDurations:legacy.ex||[],restDurations:legacy.rest||[],
          sequence,circuits:plan?.strength?.circuits||1,restored:true
        };
        delete data.strengthSession;
        break;
      }
      if(data?.cardioSession){
        const legacy=data.cardioSession;
        const plan=planForDate(state.program,date);
        state.activeSession={
          id:createSessionId(),type:"cardio",programDate:date,startedAt:legacy.start||Date.now(),
          config:{...(legacy.config||plan?.cardio||{})},lastPhaseKey:null,announcedRemaining:[],lastCountdown:0,
          previousRemaining:null,lastTickAt:Date.now(),restored:true
        };
        delete data.cardioSession;
        break;
      }
    }
  }
  return state;
}

export function contextDate(state,today){return state.activeSession?.programDate||today}
