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
    try{indexedState=await this.indexed.load()}catch(error){this.lastError=error;this.mode="Copie locale seulement"}
    const backupState=this.backup.load();
    const candidates=[indexedState,backupState].filter(Boolean);
    const state=candidates.sort((a,b)=>(b._savedAt||0)-(a._savedAt||0))[0]||fallbackFactory();
    if(!indexedState&&backupState){
      try{await this.indexed.save(backupState);this.mode="IndexedDB + copie locale"}catch(error){this.lastError=error}
    }
    return state;
  }
  save(state){
    this.backup.save(state);
    this.indexed.save(state).catch(error=>{this.lastError=error;this.mode="Copie locale seulement"});
  }
  async clear(){
    this.backup.clear();
    try{await this.indexed.clear()}catch(error){this.lastError=error}
  }
  async requestPersistence(){
    if(!navigator.storage?.persist)return {supported:false,granted:false};
    try{
      const already=await navigator.storage.persisted?.();
      const granted=already||await navigator.storage.persist();
      this.persistence=granted?"persistant":"standard";
      return {supported:true,granted};
    }catch(error){return {supported:true,granted:false,error}}
  }
}
