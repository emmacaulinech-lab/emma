/* Snapshots immuables du journal : aucune suppression de l'historique. */
(function(scope){
'use strict';
const states=new Map(), encoder=new TextEncoder();
const manifestId='journal_v2', chunkChars=120000;
function state(ref){let s=states.get(ref.path);if(!s){s={loaded:false,version:null,queue:Promise.resolve()};states.set(ref.path,s);}return s;}
function failure(message){return new Error('Journal : '+message);}
async function checksum(text){const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(text));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
function parse(text){const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw failure('format de sauvegarde invalide');return value;}
async function read(ref,options){
  const modules=ref.collection('modules'), snap=await modules.doc(manifestId).get(options);
  if(!snap.exists){const legacy=await modules.doc('journal').get(options);return {journal:legacy.exists&&legacy.data().data?parse(legacy.data().data):null,version:null};}
  const m=snap.data();
  if(m.format!==2||typeof m.version!=='string'||!Array.isArray(m.chunks)||!m.chunks.length||m.chunks.length>10000||m.chunks.some((id,i)=>id!==`journal_v2_${m.version}_${i}`))throw failure('index incomplet ; sauvegarde bloquée pour protéger les données');
  const parts=[];
  for(const id of m.chunks){const part=await modules.doc(id).get(options);if(!part.exists||typeof part.data().data!=='string')throw failure('copie incomplète ; sauvegarde bloquée');parts.push(part.data().data);}
  const text=parts.join('');
  if(encoder.encode(text).length!==m.bytes||await checksum(text)!==m.sha256)throw failure('vérification de la copie échouée ; sauvegarde bloquée');
  return {journal:parse(text),version:m.version};
}
async function load(ref){const result=await read(ref,{source:'server'}),s=state(ref);s.version=result.version;s.loaded=true;return result.journal;}
async function write(ref,text){
  const s=state(ref);if(!s.loaded)throw failure('chargement complet requis avant toute sauvegarde');
  const version=crypto.randomUUID(),modules=ref.collection('modules'),chunks=[];
  // Chaque fragment reste très en dessous de la limite Firestore, même en UTF-8.
  for(let start=0;start<text.length;){let end=Math.min(text.length,start+chunkChars);if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;chunks.push(text.slice(start,end));start=end;}
  const ids=chunks.map((_,i)=>`journal_v2_${version}_${i}`);
  for(let i=0;i<chunks.length;i++)await modules.doc(ids[i]).set({data:chunks[i],version,index:i});
  const manifest={format:2,version,chunks:ids,bytes:encoder.encode(text).length,sha256:await checksum(text),updatedAt:new Date().toISOString()};
  const db=ref.firestore, expected=s.version;
  await db.runTransaction(async tr=>{
    const target=modules.doc(manifestId),current=await tr.get(target);
    if((current.exists?current.data().version:null)!==expected)throw failure('une autre fenêtre a enregistré des changements ; recharge avant de réessayer');
    // L'index ne bascule qu'après confirmation de tous les fragments.
    tr.set(target,manifest);
  });
  s.version=version;
  return true;
}
function save(ref,value){let text;try{text=typeof value==='string'?value:JSON.stringify(value);parse(text);}catch(e){return Promise.reject(e);}const s=state(ref),job=s.queue.catch(()=>{}).then(()=>write(ref,text));s.queue=job;return job;}
function update(ref,mutate){const s=state(ref),job=s.queue.catch(()=>{}).then(async()=>{if(!s.loaded)throw failure('chargement complet requis');const result=await read(ref,{source:'server'});if(result.version!==s.version)throw failure('une autre fenêtre a enregistré des changements ; recharge avant de réessayer');if(!result.journal)throw failure('journal enregistré introuvable');const output=mutate(result.journal);await write(ref,JSON.stringify(result.journal));return {journal:result.journal,result:output};});s.queue=job;return job;}
scope.EmmaJournalStorage={load,save,update,read:async(ref)=> (await read(ref,{source:'server'})).journal};
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{
  const tab=document.getElementById('jtab2');
  if(!tab||document.getElementById('emma-journal-export'))return;
  const button=document.createElement('button');button.id='emma-journal-export';button.type='button';button.className='btn bg bsm';button.textContent='Exporter une sauvegarde';
  button.onclick=()=>scope.exporterSauvegardeEmma();tab.parentElement.append(button);
});
})(typeof window!=='undefined'?window:globalThis);
