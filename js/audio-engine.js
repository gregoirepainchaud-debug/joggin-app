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
    if(!this.ctx){
      return "Audio local : sera vérifié au premier démarrage.";
    }

    if(this.bellBuffer===null){
      return "Audio incomplet : cloche.wav est introuvable.";
    }

    if(this.ctx.state!=="running"){
      return `Audio en attente · état : ${this.ctx.state}.`;
    }

    if(this.missing.size){
      return `Audio chargé, mais fichiers manquants : ${[...this.missing].slice(0,8).join(", ")}${this.missing.size>8?"…":""}`;
    }

    return `Audio local prêt · espacement : ${this.wordGap.toFixed(3)} s.`;
  }

  emitStatus(){
    this.onStatus(this.status());
  }

  /*
   * L'ancienne app de jogging utilisait "transient" et se comportait
   * mieux lorsqu'une autre app (ex. Spotify) jouait déjà de l'audio.
   * Sur les navigateurs qui n'exposent pas navigator.audioSession,
   * cette fonction ne fait simplement rien.
   */
  configureAudioSession(){
    if("audioSession" in navigator){
      try{
        navigator.audioSession.type="transient";
      }catch(error){
        console.warn(
          "AudioSession transient non disponible",
          error
        );
      }
    }
  }

  createContext(){
    if(this.ctx)return this.ctx;

    const AudioContextClass=
      window.AudioContext||
      window.webkitAudioContext;

    if(!AudioContextClass){
      throw new Error(
        "Web Audio API non disponible sur ce navigateur."
      );
    }

    this.ctx=new AudioContextClass();

    this.ctx.onstatechange=()=>{
      this.unlocked=
        this.ctx?.state==="running";

      this.emitStatus();
    };

    return this.ctx;
  }

  async ensureRunning(timeoutMs=1800){
    if(!this.ctx)return false;

    if(this.ctx.state==="running"){
      this.unlocked=true;
      return true;
    }

    if(this.ctx.state==="closed"){
      this.unlocked=false;
      return false;
    }

    this.configureAudioSession();

    let timeoutId=null;

    try{
      const resumePromise=
        this.ctx.resume();

      const timeoutPromise=
        new Promise((_,reject)=>{
          timeoutId=setTimeout(
            ()=>reject(
              new Error(
                "Délai dépassé pendant l’activation audio."
              )
            ),
            timeoutMs
          );
        });

      await Promise.race([
        resumePromise,
        timeoutPromise
      ]);
    }catch(error){
      console.warn(
        "Impossible de démarrer/reprendre AudioContext",
        error
      );
    }finally{
      if(timeoutId!==null){
        clearTimeout(timeoutId);
      }
    }

    this.unlocked=
      this.ctx.state==="running";

    this.emitStatus();

    return this.unlocked;
  }

  async createContextFromGesture(){
    this.configureAudioSession();

    const ctx=this.createContext();

    /*
     * On déclenche immédiatement une source silencieuse pendant le geste
     * de l'utilisateur. C'est important sur iOS/Safari pour déverrouiller
     * Web Audio.
     */
    try{
      const sampleRate=
        ctx.sampleRate||22050;

      const silent=
        ctx.createBuffer(
          1,
          1,
          sampleRate
        );

      const source=
        ctx.createBufferSource();

      source.buffer=silent;
      source.connect(ctx.destination);
      source.start(0);
    }catch(error){
      console.warn(
        "Déverrouillage audio silencieux impossible",
        error
      );
    }

    const running=
      await this.ensureRunning(1800);

    if(!running){
      throw new Error(
        `AudioContext non disponible (${ctx.state}).`
      );
    }

    return true;
  }

  async resume(){
    if(!this.ctx)return false;

    this.configureAudioSession();

    return this.ensureRunning(1800);
  }

  filenameVariants(name){
    const raw=String(name);
    const nfc=raw.normalize("NFC");
    const nfd=raw.normalize("NFD");
    const plain=nfd.replace(
      /[\u0300-\u036f]/g,
      ""
    );

    return [
      ...new Set([
        raw,
        nfc,
        nfd,
        plain,
        raw.replaceAll("-","_"),
        plain.replaceAll("-","_"),
        raw.replaceAll("-",""),
        plain.replaceAll("-","")
      ])
    ];
  }

  pathsForEntry(entry){
    const scopes=
      entry.scopes||
      [entry.scope||"common"];

    const dirs=
      scopes.flatMap(
        scope=>
          this.lexicon.directories?.[scope]||
          []
      );

    return [
      ...(entry.paths||[]),
      ...dirs.flatMap(
        dir=>
          (entry.files||[])
            .flatMap(
              file=>
                this.filenameVariants(file)
                  .map(
                    name=>
                      `${dir}/${name}.mp3`
                  )
            )
      )
    ];
  }

  tokenCandidates(token){
    let feminine=false;

    if(
      typeof token==="string"&&
      token.startsWith("numf:")
    ){
      feminine=true;
      token=Number(
        token.slice(5)
      );
    }else if(
      typeof token==="string"&&
      token.startsWith("num:")
    ){
      token=Number(
        token.slice(4)
      );
    }

    if(
      typeof token==="number"||
      Number.isInteger(token)
    ){
      const n=Number(token);

      const word=
        this.lexicon
          .numberWords
          ?.[String(n)];

      const names=[
        String(n)
      ];

      if(n===1){
        names.push(
          ...(
            feminine
              ?["une","un"]
              :["un","une"]
          )
        );
      }else if(word){
        names.push(word);
      }

      const dirs=
        this.lexicon
          .directories
          ?.common||
        [
          "speech/commun",
          "speech"
        ];

      return [
        ...new Set(
          dirs.flatMap(
            dir=>
              names.flatMap(
                name=>
                  this.filenameVariants(name)
                    .map(
                      file=>
                        `${dir}/${file}.mp3`
                    )
              )
          )
        )
      ];
    }

    return [
      ...new Set(
        this.pathsForEntry(
          this.lexicon
            .words
            ?.[token]||
          {
            scope:"common",
            files:[String(token)]
          }
        )
      )
    ];
  }

  numericDetails(token){
    let prefix="";
    let value=token;

    if(
      typeof token==="string"&&
      token.startsWith("numf:")
    ){
      prefix="numf:";
      value=Number(
        token.slice(5)
      );
    }else if(
      typeof token==="string"&&
      token.startsWith("num:")
    ){
      prefix="num:";
      value=Number(
        token.slice(4)
      );
    }

    return (
      typeof value==="number"&&
      Number.isInteger(value)
    )
      ?{prefix,value}
      :null;
  }

  expandNumber(n){
    const direct=
      new Set(
        this.lexicon
          .directNumberFiles||
        []
      );

    if(
      direct.has(n)||
      n<=30
    ){
      return [n];
    }

    if(n===60){
      return ["soixante"];
    }

    if(n>30&&n<40){
      return [30,n-30];
    }

    if(n>40&&n<50){
      return [40,n-40];
    }

    if(n>50&&n<60){
      return [50,n-50];
    }

    if(n>60&&n<70){
      return [60,n-60];
    }

    if(n>70&&n<80){
      return [60,n-60];
    }

    if(n>80&&n<90){
      return [80,n-80];
    }

    if(n>90&&n<100){
      return [80,n-80];
    }

    return [n];
  }

  expandTokens(tokens){
    return tokens.flatMap(
      token=>{
        const d=
          this.numericDetails(token);

        if(!d)return [token];

        if(
          d.value===1&&
          d.prefix
        ){
          return [token];
        }

        return this.expandNumber(
          d.value
        );
      }
    );
  }

  async loadPath(path){
    if(
      this.pathCache.has(path)
    ){
      return this.pathCache.get(path);
    }

    const promise=
      (async()=>{
        try{
          const response=
            await fetch(
              encodeURI(path),
              {cache:"force-cache"}
            );

          if(!response.ok){
            return null;
          }

          return await this.ctx
            .decodeAudioData(
              await response.arrayBuffer()
            );
        }catch(error){
          console.warn(
            "Audio non chargé",
            path,
            error
          );

          return null;
        }
      })();

    this.pathCache.set(
      path,
      promise
    );

    return promise;
  }

  async loadFirst(paths){
    for(const path of paths){
      const buffer=
        await this.loadPath(path);

      if(buffer)return buffer;
    }

    return null;
  }

  async tokenBuffer(token){
    const key=
      typeof token==="string"
        ?token
        :String(token);

    if(
      this.tokenCache.has(key)
    ){
      return this.tokenCache.get(key);
    }

    const promise=
      this.loadFirst(
        this.tokenCandidates(token)
      );

    this.tokenCache.set(
      key,
      promise
    );

    const buffer=
      await promise;

    if(!buffer){
      this.missing.add(key);
    }

    this.emitStatus();

    return buffer;
  }

  async preload(tokens=[]){
    if(!this.ctx){
      throw new Error(
        "L’audio doit être déverrouillé par le bouton Débuter"
      );
    }

    if(
      this.bellBuffer===
      undefined
    ){
      this.bellBuffer=
        await this.loadFirst(
          this.lexicon
            .bellCandidates||
          ["cloche.wav"]
        );
    }

    const spoken=
      this.expandTokens(tokens);

    const unique=[
      ...new Set(
        spoken.map(
          token=>
            typeof token==="string"
              ?token
              :String(token)
        )
      )
    ];

    await Promise.all(
      unique.map(
        key=>
          this.tokenBuffer(
            spoken.find(
              token=>
                (
                  typeof token==="string"
                    ?token
                    :String(token)
                )===key
            )
          )
      )
    );

    this.emitStatus();
  }

  schedule(buffer,at){
    if(!buffer)return at;

    const source=
      this.ctx
        .createBufferSource();

    source.buffer=buffer;
    source.connect(
      this.ctx.destination
    );
    source.start(at);

    return at+
      buffer.duration;
  }

  async play(
    tokens,
    {bell=true}={}
  ){
    if(!this.ctx){
      return false;
    }

    this.configureAudioSession();

    /*
     * Si iOS a momentanément interrompu Web Audio pendant que Spotify
     * continue de jouer, on tente une reprise courte plutôt que d'abandonner
     * immédiatement l'annonce.
     */
    if(
      this.ctx.state!=="running"
    ){
      const running=
        await this.ensureRunning(900);

      if(!running){
        return false;
      }
    }

    const spoken=
      this.expandTokens(tokens);

    await this.preload(spoken);

    let at=
      this.ctx.currentTime+
      .025;

    if(
      bell&&
      this.bellBuffer
    ){
      at=
        this.schedule(
          this.bellBuffer,
          at
        )+
        this.bellGap;
    }

    for(
      const token of spoken
    ){
      const buffer=
        await this.tokenBuffer(token);

      if(buffer){
        at=
          this.schedule(
            buffer,
            at
          )+
          this.wordGap;
      }
    }

    return true;
  }
}
