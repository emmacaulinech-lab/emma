const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const code=fs.readFileSync(require('node:path').join(__dirname,'../journal-storage.js'),'utf8');
function setup(){
 const records=new Map(),writes=[];let fail=null;
 const snapshot=id=>({exists:records.has(id),data:()=>structuredClone(records.get(id))});
 const doc=id=>({id,get:async()=>snapshot(id),set:async data=>{if(fail&&fail(id))throw Error('interrupted');assert.ok(Buffer.byteLength(JSON.stringify(data))<1048576);records.set(id,structuredClone(data));writes.push(id);}});
 const ref={path:'users/test',collection:()=>({doc}),firestore:{runTransaction:async fn=>{const pending=[];await fn({get:async r=>snapshot(r.id),set:(r,v)=>pending.push([r.id,v])});if(fail&&fail('commit'))throw Error('interrupted');for(const [id,v] of pending){records.set(id,structuredClone(v));writes.push(id);}}}};
 function client(){const context=vm.createContext({TextEncoder,crypto:webcrypto});vm.runInContext(code,context);return context.EmmaJournalStorage;}
 return {records,writes,ref,client,setFail:fn=>{fail=fn;}};
}
const history={historique:{'2026-10-01':[{id:'done1',nom:'Tâche faite',realiseA:'10:00'}]},faitAujourdhui:{'2026-10-01':{done1:true}},planning:{},zones:[]};
test('migration >1 Mo : toutes les réalisations et la copie ancienne restent identiques',async()=>{
 const e=setup(),legacy=JSON.stringify(history);e.records.set('journal',{data:legacy});const s=e.client();assert.equal(JSON.stringify(await s.load(e.ref)),legacy);
 const large={...history,notes:'🌸é'.repeat(250000)};await s.save(e.ref,JSON.stringify(large));assert.equal(JSON.stringify(await s.read(e.ref)),JSON.stringify(large));assert.equal(e.records.get('journal').data,legacy);
 const m=e.records.get('journal_v2');assert.ok(m.chunks.length>1);assert.equal(m.bytes,Buffer.byteLength(JSON.stringify(large)));
});
test('échec avant publication : ancienne copie lisible ; nouvel essai possible',async()=>{
 const e=setup();e.records.set('journal',{data:JSON.stringify(history)});const s=e.client();await s.load(e.ref);e.setFail(id=>id==='commit');await assert.rejects(s.save(e.ref,{...history,notes:'new'}));assert.equal(e.records.has('journal_v2'),false);assert.equal(JSON.stringify(await s.read(e.ref)),JSON.stringify(history));e.setFail(null);await s.save(e.ref,history);
});
test('fragment interrompu : le dernier instantané reste actif',async()=>{
 const e=setup();e.records.set('journal',{data:JSON.stringify(history)});const s=e.client();await s.load(e.ref);await s.save(e.ref,history);const version=e.records.get('journal_v2').version;e.setFail(id=>id.endsWith('_1'));await assert.rejects(s.save(e.ref,{...history,notes:'x'.repeat(300000)}));assert.equal(e.records.get('journal_v2').version,version);assert.equal(JSON.stringify(await s.read(e.ref)),JSON.stringify(history));
});
test('fragment absent : chargement et sauvegarde bloqués, pas de repli silencieux',async()=>{
 const e=setup();e.records.set('journal',{data:JSON.stringify(history)});const s=e.client();await s.load(e.ref);await s.save(e.ref,history);e.records.delete(e.records.get('journal_v2').chunks[0]);const other=e.client();await assert.rejects(other.load(e.ref));await assert.rejects(other.save(e.ref,{}));
});
test('corruption détectée avant chargement',async()=>{
 const e=setup();const s=e.client();await s.load(e.ref);await s.save(e.ref,history);const id=e.records.get('journal_v2').chunks[0];e.records.get(id).data=e.records.get(id).data.replace('done1','done2');await assert.rejects(e.client().load(e.ref));
});
test('autre fenêtre : empêcher l’écrasement d’un historique plus récent',async()=>{
 const e=setup();const a=e.client(),b=e.client();await a.load(e.ref);await b.load(e.ref);await a.save(e.ref,history);await assert.rejects(b.save(e.ref,{}));assert.equal(JSON.stringify(await a.read(e.ref)),JSON.stringify(history));
});
test('sauvegardes en file et rattrapage conservent les coches',async()=>{
 const e=setup(),s=e.client();await s.load(e.ref);await Promise.all([s.save(e.ref,history),s.save(e.ref,{...history,notes:'last'})]);const r=await s.update(e.ref,j=>{j.faitAujourdhui['2026-10-02']={done2:true};return 1;});assert.equal(r.result,1);assert.equal(r.journal.faitAujourdhui['2026-10-01'].done1,true);assert.equal((await s.read(e.ref)).notes,'last');
});
