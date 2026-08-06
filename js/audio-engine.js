export class AudioEngine {
  constructor(lexicon,onStatus=()=>{}){
    this.lexicon=lexicon;
    this.onStatus=onStatus;
    this.ctx=null;
    this.bellBuffer=undefined;
    this.pathCache=new Map();
    this.tokenCache=new Map();
    this.missing=new Set();
    this.wordGap=Number(lexicon.settings?.wordGap??0.015);
    this.bellGap=Number(lexicon.settings?.bellToVoiceGap??1);
    this.unlocked=false;
  }
  status(){
    if(!this.ctx)return "Audio local : sera vérifié au premier démarrage.";
    if(this.bellBuffer===null)return "Audio incomplet : cloche.wav est introuvable.";
    if(this.missing.size)return `Audio chargé, mais fichiers manquants : ${[...this.missing].slice(0,8).join(", ")}${this.missing.size>8?"…":""}`;
    return `Audio local prêt · espacement : ${this.wordGap.toFixed(3)} s.`;
  }
  emitStatus(){this.onStatus(this.status())}
  createContextFromGesture(){
    if(!this.ctx)this.ctx=new (window.AudioContext||window.webkitAudioContext)();
    try{
      const silent=this.ctx.createBuffer(1,1,22050);
      const source=this.ctx.createBufferSource();
      source.buffer=silent;source.connect(this.ctx.destination);source.start(0);
    }catch(error){console.warn("Déverrouillage audio silencieux impossible",error)}
    this.unlocked=true;
    const resume=this.ctx.state==="suspended"?this.ctx.resume():Promise.resolve();
    this.emitStatus();
    return resume;
  }
  async resume(){
    if(!this.ctx)return false;
    try{await this.ctx.resume();this.unlocked=this.ctx.state==="running";this.emitStatus();return this.unlocked}catch{return false}
  }
  filenameVariants(name){
    const raw=String(name),nfc=raw.normalize("NFC"),nfd=raw.normalize("NFD"),plain=nfd.replace(/[\u0300-\u036f]/g,"");
    return [...new Set([raw,nfc,nfd,plain,raw.replaceAll("-","_"),plain.replaceAll("-","_"),raw.replaceAll("-",""),plain.replaceAll("-","")])];
  }
  pathsForEntry(entry){
    const scopes=entry.scopes||[entry.scope||"common"];
    const dirs=scopes.flatMap(scope=>this.lexicon.directories?.[scope]||[]);
    return [...(entry.paths||[]),...dirs.flatMap(dir=>(entry.files||[]).flatMap(file=>this.filenameVariants(file).map(name=>`${dir}/${name}.mp3`)))];
  }
  tokenCandidates(token){
    let feminine=false;
    if(typeof token==="string"&&token.startsWith("numf:")){feminine=true;token=Number(token.slice(5))}
    else if(typeof token==="string"&&token.startsWith("num:"))token=Number(token.slice(4));
    if(typeof token==="number"||Number.isInteger(token)){
      const n=Number(token),word=this.lexicon.numberWords?.[String(n)],names=[String(n)];
      if(n===1)names.push(...(feminine?["une","un"]:["un","une"]));else if(word)names.push(word);
      const dirs=this.lexicon.directories?.common||["speech/commun","speech"];
      return [...new Set(dirs.flatMap(dir=>names.flatMap(name=>this.filenameVariants(name).map(file=>`${dir}/${file}.mp3`))))];
    }
    return [...new Set(this.pathsForEntry(this.lexicon.words?.[token]||{scope:"common",files:[String(token)]}))];
  }
  numericDetails(token){
    let prefix="",value=token;
    if(typeof token==="string"&&token.startsWith("numf:")){prefix="numf:";value=Number(token.slice(5))}
    else if(typeof token==="string"&&token.startsWith("num:")){prefix="num:";value=Number(token.slice(4))}
    return typeof value==="number"&&Number.isInteger(value)?{prefix,value}:null;
  }
  expandNumber(n){
    const direct=new Set(this.lexicon.directNumberFiles||[]);
    if(direct.has(n)||n<=30)return [n];
    if(n===60)return ["soixante"];
    if(n>30&&n<40)return [30,n-30];if(n>40&&n<50)return [40,n-40];if(n>50&&n<60)return [50,n-50];
    if(n>60&&n<70)return [60,n-60];if(n>70&&n<80)return [60,n-60];if(n>80&&n<90)return [80,n-80];if(n>90&&n<100)return [80,n-80];
    return [n];
  }
  expandTokens(tokens){
    return tokens.flatMap(token=>{const d=this.numericDetails(token);if(!d)return [token];if(d.value===1&&d.prefix)return [token];return this.expandNumber(d.value)});
  }
  async loadPath(path){
    if(this.pathCache.has(path))return this.pathCache.get(path);
    const promise=(async()=>{
      try{
        const response=await fetch(encodeURI(path),{cache:"force-cache"});
        if(!response.ok)return null;
        return await this.ctx.decodeAudioData(await response.arrayBuffer());
      }catch(error){console.warn("Audio non chargé",path,error);return null}
    })();
    this.pathCache.set(path,promise);return promise;
  }
  async loadFirst(paths){for(const path of paths){const buffer=await this.loadPath(path);if(buffer)return buffer}return null}
  async tokenBuffer(token){
    const key=typeof token==="string"?token:String(token);
    if(this.tokenCache.has(key))return this.tokenCache.get(key);
    const promise=this.loadFirst(this.tokenCandidates(token));this.tokenCache.set(key,promise);
    const buffer=await promise;if(!buffer)this.missing.add(key);this.emitStatus();return buffer;
  }
  async preload(tokens=[]){
    if(!this.ctx)throw new Error("L’audio doit être déverrouillé par le bouton Débuter");
    if(this.bellBuffer===undefined)this.bellBuffer=await this.loadFirst(this.lexicon.bellCandidates||["cloche.wav"]);
    const spoken=this.expandTokens(tokens);
    await Promise.all([...new Set(spoken.map(token=>typeof token==="string"?token:String(token)))].map(key=>this.tokenBuffer(spoken.find(t=>(typeof t==="string"?t:String(t))===key))));
    this.emitStatus();
  }
  schedule(buffer,at){
    if(!buffer)return at;
    const source=this.ctx.createBufferSource();source.buffer=buffer;source.connect(this.ctx.destination);source.start(at);return at+buffer.duration;
  }
  async play(tokens,{bell=true}={}){
    if(!this.ctx||this.ctx.state!=="running")return false;
    const spoken=this.expandTokens(tokens);await this.preload(spoken);
    let at=this.ctx.currentTime+.025;
    if(bell&&this.bellBuffer)at=this.schedule(this.bellBuffer,at)+this.bellGap;
    for(const token of spoken){const buffer=await this.tokenBuffer(token);if(buffer)at=this.schedule(buffer,at)+this.wordGap}
    return true;
  }
}
