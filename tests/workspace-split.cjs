const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const core=read('app-core.js').replace('/*__LIMAGECILS_FORMATIONS__*/\n',()=>read('modules/limagecils-formations.js'));
assert.equal(createHash('sha256').update(core).digest('hex'),'9795a7d78c1c49a132153041f40ee1af7101794cd5b33486abee0f47e32956c1','Le script historique est conservé octet pour octet');
new vm.Script(core);
for(const p of ['app-loader.js','workspace-navigation.js','micro-preparation.js'])new vm.Script(read(p));
for(const entry of ['index.html','limagecils.html']){
  const html=require('./read-app.cjs')(path.join(root,entry));
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  for(const id of ['module-formations','module-facturation','module-facturation-perso','app','hubPage','loginPage'])assert.equal(ids.filter(x=>x===id).length,1,id+' présent une seule fois');
  assert(read(entry).length<2000);
}
async function loaderTest(fail){
  const scripts=[],nodes=new Map();let removed=false,ready=false;
  const status={textContent:'',appendChild(){},remove(){removed=true;}};
  const document={getElementById:()=>status,dispatchEvent(){ready=true;},body:{appendChild(node){if(node.textContent)scripts.push(node.textContent);return node;}},createElement(type){if(type==='template')return {set innerHTML(v){this.content={querySelector:()=>({set innerHTML(v){}})};}};return {textContent:''};}};
  const context={document,Event:class{},location:{reload(){}},console:{error(){}},fetch:async url=>({ok:!fail||!url.startsWith('app-core'),text:async()=>read(url.split('?')[0])})};
  await vm.runInNewContext(read('app-loader.js'),context);
  if(fail){assert(!removed);assert(!ready);assert.equal(scripts.length,0);assert.match(status.textContent,/échoué/);}
  else{assert(removed&&ready);assert.equal(scripts[0],core);assert.equal(scripts[1],read('workspace-navigation.js'));assert.equal(scripts[2],read('micro-preparation.js'));assert.equal(scripts.length,9);}
}
function microFixture(){
  const nodes=new Map(),writes=[],listeners=[];
  const status={textContent:''},submit={disabled:false};
  const form={querySelector:()=>submit};
  const body={hidden:true,innerHTML:'',querySelector:sel=>sel==='form'?form:{value:''}};
  nodes.set('micro-draft',body);nodes.set('micro-save-status',status);
  const doc={exists:false};
  const userRef={collection(name){assert.equal(name,'modules');return {doc(id){assert.equal(id,'microPreparation');return {get:async()=>doc,set:async(data,options)=>writes.push({id,data,options})};}};}};
  const ctx={console,Date,Object,String,FormData:class{get(key){return {dateDebut:'2027-01-01',periodicite:'mensuelle',notes:'Projet'}[key]}has(key){return key==='prestations';}},goModule:()=>{},currentUser:{uid:'test'},chargementReussi:true,userRef,auth:{onAuthStateChanged(fn){listeners.push(fn);}},document:{body:{dataset:{emmaSpace:'emma'}},getElementById:id=>nodes.get(id),createElement:()=>({style:{},remove(){nodes.delete('micro-preparation')}})}};
  nodes.set('app',{prepend(panel){nodes.set('micro-preparation',panel);nodes.set('micro-open',{});}});
  vm.createContext(ctx);vm.runInContext(read('micro-preparation.js'),ctx);
  return {ctx,nodes,writes,body,form,status,listeners};
}
(async()=>{
  await loaderTest(false);await loaderTest(true);
  const f=microFixture();f.ctx.goModule('compta');await f.nodes.get('micro-open').onclick();
  assert.match(f.body.innerHTML,/en préparation/);assert.equal(f.writes.length,0,'Ouvrir le brouillon ne sauvegarde rien');
  await f.form.onsubmit({preventDefault(){},currentTarget:f.form});
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].data.preparation.statut,'preparation');assert.equal(f.writes[0].data.preparation.dateDebut,'2027-01-01');assert.equal(f.writes[0].options.merge,true);assert.match(f.status.textContent,/enregistrée/);
  f.ctx.currentUser={uid:'other'};await f.form.onsubmit({preventDefault(){},currentTarget:f.form});assert.equal(f.writes.length,1,'Le brouillon ne passe pas vers un autre compte');
  f.listeners[0]();assert(!f.nodes.has('micro-preparation'));
  console.log('PASS : extraction identique, syntaxe, deux entrées, DOM unique, ordre de chargement, échec réseau sans exécution, brouillon isolé et protection du compte.');
})().catch(e=>{console.error(e);process.exit(1)});
