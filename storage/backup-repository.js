import {LEGACY_STATE_KEY} from "../js/config.js";

/*
 * This key is deliberately independent from the application version.
 * Updating index.html / JavaScript / CSS must never erase the last
 * program that was active on the device.
 */
const PROGRAM_BACKUP_KEY = `${LEGACY_STATE_KEY}:active-program`;

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
    localStorage.setItem(
      LEGACY_STATE_KEY,
      JSON.stringify(state)
    );

    /*
     * Keep a second, independent copy of the active program.
     * It is intentionally updated on every normal save so it always
     * follows GP1 imports, program restoration and future edits.
     */
    if(state?.program){
      this.saveProgram(state.program);
    }
  }

  loadProgram(){
    try{
      const raw=localStorage.getItem(PROGRAM_BACKUP_KEY);

      if(!raw)return null;

      const record=JSON.parse(raw);

      if(!record?.program)return null;

      return record;
    }catch(error){
      console.warn(
        "Sauvegarde du programme illisible",
        error
      );
      return null;
    }
  }

  saveProgram(program){
    try{
      localStorage.setItem(
        PROGRAM_BACKUP_KEY,
        JSON.stringify({
          program,
          savedAt:Date.now()
        })
      );
    }catch(error){
      console.warn(
        "Impossible de sauvegarder le programme séparément",
        error
      );
    }
  }

  clear(){
    localStorage.removeItem(LEGACY_STATE_KEY);
    localStorage.removeItem(PROGRAM_BACKUP_KEY);
  }
}
