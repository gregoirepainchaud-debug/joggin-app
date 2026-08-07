import {BackupRepository} from "./backup-repository.js";
import {IndexedDbRepository} from "./indexeddb-repository.js";

export class StorageManager {
  constructor(){
    this.backup=new BackupRepository();
    this.indexed=new IndexedDbRepository();
    this.mode="IndexedDB + copie locale";
    this.lastError=null;
    this.persistence="non demandé";
  }

  async load(fallbackFactory){
    let indexedState=null;

    try{
      indexedState=await this.indexed.load();
    }catch(error){
      this.lastError=error;
      this.mode="Copie locale seulement";
    }

    const backupState=this.backup.load();
    const programBackup=this.backup.loadProgram();

    const candidates=[
      indexedState,
      backupState
    ].filter(Boolean);

    /*
     * Prefer the newest complete state for history, notes, timers, etc.
     * If no complete state exists, create the normal blank state.
     */
    const state=
      candidates
        .sort(
          (a,b)=>
            (b._savedAt||0)-
            (a._savedAt||0)
        )[0]
      ||fallbackFactory();

    /*
     * V.13.2 protection:
     * the separately backed-up active program wins over the default
     * program bundled with a newly deployed version of the app.
     *
     * This makes code/site updates independent from GP1 program data.
     */
    if(programBackup?.program){
      state.program=programBackup.program;
    }

    /*
     * If IndexedDB was unavailable/empty but the local backup survived,
     * repopulate IndexedDB with the recovered state.
     */
    if(!indexedState&&backupState){
      try{
        await this.indexed.save(state);
        this.mode="IndexedDB + copie locale";
      }catch(error){
        this.lastError=error;
      }
    }

    /*
     * If the only thing that survived was the separate program backup,
     * immediately write the recovered state to both storage layers.
     */
    if(
      programBackup?.program&&
      !indexedState&&
      !backupState
    ){
      this.backup.save(state);

      try{
        await this.indexed.save(state);
        this.mode="IndexedDB + copie locale";
      }catch(error){
        this.lastError=error;
        this.mode="Copie locale seulement";
      }
    }

    return state;
  }

  save(state){
    /*
     * BackupRepository.save() writes BOTH:
     *  - the complete state
     *  - the independent active-program backup
     */
    this.backup.save(state);

    this.indexed
      .save(state)
      .catch(error=>{
        this.lastError=error;
        this.mode="Copie locale seulement";
      });
  }

  async clear(){
    /*
     * Explicit "Effacer toutes les données" still erases everything,
     * including the independent program backup.
     */
    this.backup.clear();

    try{
      await this.indexed.clear();
    }catch(error){
      this.lastError=error;
    }
  }

  async requestPersistence(){
    if(!navigator.storage?.persist){
      return {
        supported:false,
        granted:false
      };
    }

    try{
      const already=
        await navigator.storage.persisted?.();

      const granted=
        already||
        await navigator.storage.persist();

      this.persistence=
        granted
          ?"persistant"
          :"standard";

      return {
        supported:true,
        granted
      };
    }catch(error){
      return {
        supported:true,
        granted:false,
        error
      };
    }
  }
}
