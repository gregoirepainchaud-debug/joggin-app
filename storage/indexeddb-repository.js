import {DB_NAME,DB_VERSION,DB_STORE,DB_RECORD_ID} from "../js/config.js";

export class IndexedDbRepository {
  constructor(){this.dbPromise=null}
  open(){
    if(this.dbPromise)return this.dbPromise;
    this.dbPromise=new Promise((resolve,reject)=>{
      if(!("indexedDB" in window)){reject(new Error("IndexedDB indisponible"));return}
      const request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE,{keyPath:"id"});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error("Ouverture IndexedDB impossible"));
      request.onblocked=()=>reject(new Error("IndexedDB bloqué par une autre fenêtre"));
    });
    return this.dbPromise;
  }
  async load(){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(DB_STORE,"readonly");
      const req=tx.objectStore(DB_STORE).get(DB_RECORD_ID);
      req.onsuccess=()=>resolve(req.result?.value||null);
      req.onerror=()=>reject(req.error);
    });
  }
  async save(state){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(DB_STORE,"readwrite");
      tx.objectStore(DB_STORE).put({id:DB_RECORD_ID,value:state,updatedAt:Date.now()});
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error||new Error("Écriture IndexedDB annulée"));
    });
  }
  async clear(){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(DB_STORE,"readwrite");
      tx.objectStore(DB_STORE).delete(DB_RECORD_ID);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
    });
  }
}
