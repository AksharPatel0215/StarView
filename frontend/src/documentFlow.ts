// Serialize saves per document so a delayed autosave cannot overwrite newer edits.
export class DocumentSaveQueue {
 private pending=new Map<string,Promise<void>>();
 save(key:string,write:()=>Promise<void>){
  const previous=this.pending.get(key)||Promise.resolve();
  const next=previous.catch(()=>{}).then(write);
  this.pending.set(key,next);
  const clear=()=>{if(this.pending.get(key)===next)this.pending.delete(key);};
  void next.then(clear,clear);
  return next;
 }
}
export function moveDestination(source:string,folder:string){
 const name=source.split('/').pop()||'';
 return folder?`${folder}/${name}`:name;
}
