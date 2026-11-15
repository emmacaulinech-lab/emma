const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../formation-sync.js'),'utf8');
const latest={etudiantes:[{id:'one',prenom:'Nom modifié dans LIMAGECILS',suiviFormation:{other:true}},{id:'new',prenom:'Élève ajoutée dans LIMAGECILS'}]};
let record=JSON.stringify(latest),writes=0;
const reference={id:'formations'};
const ctx={console,Promise,Date,JSON,structuredClone,currentUser:{uid:'test'},chargementReussi:true,DB:{formations:{etudiantes:[{id:'one',prenom:'Ancien nom'}]}},enregistrerSuiviFormation(){},getEtapesDossierFormation:()=>[{items:[{id:'step'}]}],renderHubOverview(){},userRef:{collection(name){assert.equal(name,'modules');return {doc(id){assert.equal(id,'formations');return reference;}};}},db:{async runTransaction(callback){await callback({get:async ref=>({exists:true,data:()=>({data:record})}),set(ref,value,options){assert.equal(ref,reference);assert.equal(options.merge,true);record=value.data;writes++;}});}}};
vm.createContext(ctx);vm.runInContext(code,ctx);
(async()=>{
 assert(await ctx.enregistrerSuiviFormation('one','step',true));
 const saved=JSON.parse(record);assert.equal(saved.etudiantes.length,2);assert.equal(saved.etudiantes[0].prenom,latest.etudiantes[0].prenom);assert(saved.etudiantes[0].suiviFormation.other);assert(saved.etudiantes[0].suiviFormation.step);
 assert.equal(await ctx.enregistrerSuiviFormation('missing','step',true),false);assert.equal(writes,1);
 ctx.currentUser=null;assert.equal(await ctx.enregistrerSuiviFormation('one','step',false),false);assert.equal(writes,1);
 console.log('PASS : le Journal modifie uniquement la case demandée et conserve les changements récents de LIMAGECILS.');
})().catch(error=>{console.error(error);process.exit(1)});
