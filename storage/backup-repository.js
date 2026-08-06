import {LEGACY_STATE_KEY} from "../js/config.js";

export class BackupRepository {
  load(){
    try{
      const raw=localStorage.getItem(LEGACY_STATE_KEY);
      return raw?JSON.parse(raw):null;
    }catch(error){
      console.warn("Sauvegarde locale illisible",error);
      return null;
    }
  }
  save(state){
    localStorage.setItem(LEGACY_STATE_KEY,JSON.stringify(state));
  }
  clear(){
    localStorage.removeItem(LEGACY_STATE_KEY);
  }
}
