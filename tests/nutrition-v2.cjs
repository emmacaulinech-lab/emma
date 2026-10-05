const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const acorn = require(process.env.ACORN_PATH || 'acorn');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m => m[1].trim())[1];
const ast = acorn.parse(script, {ecmaVersion: 'latest'});
new vm.Script(script);
const constants = new Set(['SOINS_GLOW_DEFAUT', 'etatsChargementExtensionsGlow', 'filesSauvegardeExtensionsGlow', 'ALIMENTS_SUPPLEMENTAIRES_GLOW', 'TYPES_ALIMENTS_GLOW', 'POIDS_PIECES_GLOW', 'OPTIONS_ASSIETTE_GLOW', 'LABELS_CATEGORIES_INGREDIENTS_GLOW', 'operationsEmmaEnCours', 'filtreBibliothequeGlow', 'alimentAnalyseGlow']);
const declarations = ast.body.filter(n => n.type === 'FunctionDeclaration' || n.type === 'VariableDeclaration' && n.declarations.every(d => constants.has(d.id.name))).map(n => script.slice(n.start, n.end)).join('\n');
const storage = new Map(), writes = [], messages = [], nodes = new Map();
function node() {return {value:'', innerHTML:'', textContent:'', disabled:false, style:{}, classList:{add(){},remove(){},contains(){return false}}, remove(){}, insertAdjacentHTML(){}, focus(){}};}
const document = {activeElement:null, getElementById(id){return nodes.get(id)||null;}, querySelectorAll(){return [];}, querySelector(){return node();}, body:{insertAdjacentHTML(_, html){for(const m of html.matchAll(/id="([^"]+)"/g))nodes.set(m[1],node());}}};
const userRef = {collection(collection){return {doc(id){return {
  async get(){const value=storage.get(`${collection}/${id}`);return {exists:!!value,data:()=>value};},
  async set(data, options){assert.equal(collection,'modules');assert.ok(['glow_nutrition','glow_soins','glow_dressing','glow','journal'].includes(id));assert.equal(options.merge,true);writes.push({collection,id,data});storage.set(`${collection}/${id}`,data);}
};}};}};
class FixedDate extends Date {constructor(...args){super(...(args.length?args:['2026-10-05T12:00:00Z']));}}
const local=new Map([['anthropic_key','test-key']]);
const appConsole={...console,error(){},warn(){}};
const context = vm.createContext({console:appConsole, Blob, AbortController, Date:FixedDate, setTimeout,clearTimeout,DB:{glow:{date:'2026-10-05',nutrition:{repas:[],recettes:[]}},historiqueGlow:[]}, currentUser:{uid:'test'},userRef, chargementReussi:true, window:{},document,localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)},fetch:async()=>{throw Error('unexpected network');}});
vm.runInContext(declarations,context);
context.toast = message => messages.push(message);
for(const f of ['renderPlanificationRepasGlow','renderGlowAccueil','renderGlowSport','renderIngredientsGlow','programmerSynchronisationNotificationsEmma'])context[f]=()=>{};
context.genId=(()=>{let n=0;return ()=>String(++n);})();
context.initialiserNutritionV2Glow();
vm.runInContext("etatsChargementExtensionsGlow.glowNutritionPlans=true",context);
const d = ()=>context.DB.glowNutritionPlans;
function plan(){d().planActif={id:'p',debut:'2026-10-05',fin:'2026-10-07',repas:[{id:'a',date:'2026-10-05',type:'diner',nom:'Poulet et courgettes',statut:'garder',personnes:2,portionsBase:2,ingredients:[{nom:'Blanc de poulet',quantite:2,unite:'pièce'},{nom:'Courgettes',quantite:2,unite:'pièce'}]},{id:'b',date:'2026-10-06',type:'dejeuner',nom:'Restes du poulet',statut:'restes',personnes:2,resteDeId:'a'}]};return d().planActif;}
function response(json){return {ok:true,json:async()=>({content:[{text:JSON.stringify(json)}]})};}
let passed=0,failed=0;
async function test(name, fn){try{await fn();passed++;console.log('PASS',name);}catch(error){failed++;console.error('FAIL',name,error.stack);}}
(async()=>{
await test('Full monolith parses; no data/main mutation call',()=>{
  let forbidden=[];
  function walk(n){if(!n||typeof n!=='object')return;if(n.type==='CallExpression'&&n.callee?.type==='MemberExpression'&&['set','update','delete','add'].includes(n.callee.property.name)&&/collection\(['"]data['"]\)\s*\.doc\(['"]main['"]\)/.test(script.slice(n.callee.start,n.callee.end)))forbidden.push(n.start);for(const v of Object.values(n)){if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}}
  walk(ast);assert.deepEqual(forbidden,[]);
});
await test('Legacy preferences and custom fields survive initialization',()=>{
  d().preferencesIngredients={'courgettes':'interdit','veau':'aime'};d().ingredientsPersonnalises=[{id:'old',nom:'Échalote',categorie:'legumes',unknown:42}];d().unknown={keep:true};
  context.initialiserNutritionV2Glow();assert.equal(context.statutIngredientGlow('Courgette'),'interdit');assert.equal(d().unknown.keep,true);assert.equal(d().ingredientsPersonnalises[0].unknown,42);
  assert.ok(!context.optionsAssietteDisponiblesGlow('legumes').includes('Courgettes'));
  const names=context.catalogueAlimentaireGlow().map(x=>context.cleAlimentGlow(x.nom));assert.equal(new Set(names).size,names.length);assert.ok(names.length>90);
  d().preferencesIngredients={};
});
await test('Poêlée is a composition, excluded from ingredient chips',()=>{
  assert.equal(context.catalogueAlimentaireGlow().find(x=>x.nom==='Poêlée de légumes').type,'composition');assert.ok(!context.optionsAssietteDisponiblesGlow('legumes').includes('Poêlée de légumes'));
});
await test('Pieces and weights scale together',()=>{
  const q=context.quantiteIngredientV2Glow({nom:'Blanc de poulet',quantite:2,unite:'pièce'},2);assert.equal(q.quantite,4);assert.equal(q.poidsTotal,600);
  assert.equal(context.quantiteIngredientV2Glow({nom:'Riz',quantite:0.2,unite:'kg'},2).quantite,400);
});
await test('Sport: 1 session, 2 distinct sessions and duplicated histories',()=>{
  const a={date:'2026-10-05',seanceId:'tapis',realisationId:'x',minutes:15,terminee:true};
  context.DB.glow.historiqueSeances=[a];context.DB.historiqueGlow=[{...a,duree:15}];context.DB.glow.activite={terminee:true,minutes:15};assert.equal(context.bilanSportJourGlow().minutes,15);
  const b={date:'2026-10-05',seanceId:'fessiers',realisationId:'y',duree:10,terminee:true};context.DB.glow.historiqueSeances.push(b);context.DB.historiqueGlow.push({...b,minutes:10});assert.equal(context.bilanSportJourGlow().minutes,25);assert.equal(context.bilanSportJourGlow().seances,2);assert.equal(context.calculGlowScore().detail.activite,15);
  context.DB.glow.historiqueSeances.push({...a,realisationId:'z'});assert.equal(context.bilanSportJourGlow().minutes,40);
});
await test('Legacy sport mirrors deduplicate; repeated local instances remain counted',()=>{
  const a={date:'2026-10-05',seanceId:'old',minutes:15,terminee:true};context.DB.glow.historiqueSeances=[a,a];context.DB.historiqueGlow=[a];assert.equal(context.bilanSportJourGlow().minutes,30);
});
await test('Score counts meals once and excludes mood/photo',()=>{
  context.DB.glow.nutrition.repas=[{type:'dejeuner'},{type:'dejeuner'},{type:'diner'}];context.DB.glow.eau=8;context.DB.glow.sommeil=8;context.DB.glow.lecture={minutes:10};assert.equal(context.calculGlowScore().detail.nutrition,20);assert.equal(Object.keys(context.calculGlowScore().detail).length,5);
});
await test('Courses include source + leftovers exactly once, with provenance',()=>{
  const p=plan();d().stockV2=[];d().stockTexte='';d().courses=null;const a=context.calculerArticlesCoursesV2Glow(p).find(x=>x.nom==='Blanc de poulet');assert.equal(a.quantite,4);assert.equal(a.poidsTotal,600);assert.equal(a.provenance.length,2);assert.equal(a.provenance[0].quantite,2);assert.equal(a.provenance[1].quantite,2);
});
await test('Stock is subtracted by quantity; vague text never removes needs',()=>{
  const p=plan();d().stockTexte='Blanc de poulet';d().stockV2=[{nom:'Blanc de poulet',quantite:1,unite:'pièce'}];const a=context.calculerArticlesCoursesV2Glow(p).find(x=>x.nom==='Blanc de poulet');assert.equal(a.besoin,4);assert.equal(a.quantite,3);assert.equal(a.stockAVerifier,true);
});
await test('Cached recipe ingredients become the shopping source',()=>{
  const p=plan(),r=p.repas[0];r.recetteGeneree={portions:4,signatureRepas:context.signatureRepasGlow(r),ingredients:[{nom:'Poulet',quantite:600,unite:'g'},{nom:'Crème',quantite:200,unite:'ml'}]};assert.equal(context.calculerArticlesCoursesV2Glow(p).find(x=>x.nom==='Crème').quantite,200);
});
await test('Saved lasagnes: 9 sheets for 4 portions override a stale 18-sheet cache',()=>{
  const p=plan(),r=p.repas[0];d().stockV2=[];d().courses=null;
  r.nom='Lasagnes bolognaise maison';r.recetteId='lasagnes-reference';
  r.recetteGeneree={portions:4,signatureRepas:context.signatureRepasGlow(r),ingredients:[{nom:'Feuilles de lasagne',quantite:18,unite:'pièces'}]};
  d().recettesV2.push({id:r.recetteId,nom:r.nom,portions:4,ingredients:[{nom:'Feuilles de lasagne',quantite:9,unite:'pièces'}],etapes:['Assembler et cuire']});
  const a=context.calculerArticlesCoursesV2Glow(p).find(x=>x.nom==='Feuilles de lasagne');
  assert.equal(a.besoin,9);assert.equal(a.provenance.length,2);assert.equal(a.provenance.reduce((s,x)=>s+x.quantite,0),9);
  assert.equal(r.recetteGeneree.ingredients[0].quantite,18);
  d().recettesV2=d().recettesV2.filter(x=>x.id!=='lasagnes-reference');
});
await test('Prepared dishes stay purchased products; saved recipes are reused',()=>{
  const p=plan();p.repas=p.repas.slice(0,1);const r=p.repas[0];r.nom='Lasagnes surgelées';r.typeAliment='prepare';context.normaliserRepasV2Glow(r);let a=context.calculerArticlesCoursesV2Glow(p);assert.equal(a.length,1);assert.equal(a[0].nom,r.nom);assert.equal(a[0].quantite,2);
  d().recettesV2=[{id:'lasagne',nom:'Mes lasagnes',portions:2,ingredients:[{nom:'Feuilles de lasagnes',quantite:150,unite:'g'}],etapes:['Cuire']}];r.typeAliment='recette';r.nom='Mes lasagnes';context.normaliserRepasV2Glow(r);assert.equal(r.recetteId,'lasagne');assert.equal(r.ingredients[0].quantite,150);
});
await test('Meal changes invalidate cache and flag shopping and dependent leftovers',()=>{
  const p=plan(),r=p.repas[0];d().courses={articles:[]};r.recetteGeneree={portions:4};r.nom='Nouveau repas';context.actualiserDependancesRepasGlow(r);assert.equal(r.recetteGeneree,undefined);assert.equal(d().courses.aActualiser,true);assert.ok(p.repas[1].nom.includes('Nouveau repas'));
});
await test('Portion changes invalidate source recipe for leftovers',async()=>{
  const p=plan(),r=p.repas[0];r.recetteGeneree={portions:4};await context.modifierPersonnesRepasGlow('b',3);assert.equal(context.portionsNecessairesRecetteGlow(r),5);assert.equal(r.recetteGeneree,undefined);
});
await test('Excluded ingredients rejected locally including in sauces',()=>{
  d().preferencesIngredients={'crème':'interdit'};assert.throws(()=>context.validerAlimentsAutorisesGlow({nom:'Poulet crème',ingredients:[{nom:'Crème'}]}));d().preferencesIngredients={};
});
await test('Journal proposes only active planning; source date correct for leftovers',()=>{
  plan();const choices=context.choixSemaineNutritionGlow('2026-10-06','dejeuner');assert.ok(choices.every(x=>d().planActif.repas.some(r=>r.id===x.id)));const r=context.getRepasPlanifieGlow('2026-10-06','dejeuner');assert.equal(r.date,'2026-10-06');assert.equal(r.sourcePlanId,'a');assert.equal(context.choixSemaineNutritionGlow('2026-11-01').length,0);
});
await test('Failed extension load blocks all writes instead of overwriting defaults',async()=>{
  storage.set('modules/glow_nutrition',{data:'invalid-json'});await context.chargerExtensionsGlowSecurisees();const n=writes.length;await assert.rejects(context.sauvegarderExtensionGlow('glowNutritionPlans'));assert.equal(writes.length,n);storage.delete('modules/glow_nutrition');await context.chargerExtensionsGlowSecurisees();
});
await test('Save/reload roundtrip preserves unknown fields, preferences, recipes, plans',async()=>{
  plan();d().preferencesIngredients={'veau':'aime'};d().unknown={real:'preserved'};await context.sauvegarderExtensionGlow('glowNutritionPlans');const saved=JSON.parse(JSON.stringify(d()));context.DB.glowNutritionPlans={};await context.chargerExtensionsGlowSecurisees();assert.equal(JSON.stringify(d()),JSON.stringify(saved));assert.ok(writes.every(w=>w.collection==='modules'&&w.id!=='main'));
});
await test('Large document is refused before Firestore limit',async()=>{
  d().oversized='x'.repeat(960000);const n=writes.length;await assert.rejects(context.sauvegarderExtensionGlow('glowNutritionPlans'));assert.equal(writes.length,n);delete d().oversized;
});
await test('AI recipe failure always closes loader',async()=>{
  plan();await context.ouvrirRecetteRepasGlow('a');assert.equal(vm.runInContext('operationsEmmaEnCours',context),0);assert.ok(messages.at(-1).includes('unexpected network'));
});
await test('3/5/7 day generation, lunch/dinner, archive previous plans',async()=>{
  for(const days of [3,5,7]){
    context.fetch=async(_,o)=>{const prompt=JSON.parse(o.body).messages[0].content[0].text;const dates=prompt.match(/Dates exactes :\n([^.]*)\./)[1].split(', ').map(x=>x.trim());return response({repas:dates.flatMap(date=>['dejeuner','diner'].map(type=>({date,type,nom:'Pâtes bolognaises',typeAliment:'recette',statut:'garder',portionsBase:2,ingredients:[{nom:'Pâtes',quantite:200,unite:'g'},{nom:'Steak haché',quantite:2,unite:'pièce'}]})))});};
    await context.creerPlanRepasGlow(days);assert.equal(d().planActif.repas.length,days*2);assert.equal(vm.runInContext('operationsEmmaEnCours',context),0);
  }
  assert.ok(d().historiquePlans.length>=3);
});
await test('Invalid AI plan preserves the previous plan and closes loader',async()=>{
  const before=JSON.stringify(d().planActif);context.fetch=async()=>response({repas:[]});await context.creerPlanRepasGlow(3);assert.equal(JSON.stringify(d().planActif),before);assert.equal(vm.runInContext('operationsEmmaEnCours',context),0);
});
await test('Recipe generation includes leftovers, is saved, then reused without another AI call',async()=>{
  const p=plan();d().recettesV2=[];context.fetch=async()=>response({nom:'Poulet et courgettes',ingredients:[{nom:'Blanc de poulet',quantite:4,unite:'pièce'},{nom:'Courgettes',quantite:4,unite:'pièce'}],etapes:['Cuire'],tempsPreparation:'15',tempsCuisson:'20'});
  await context.ouvrirRecetteRepasGlow('a');assert.equal(p.repas[0].recetteGeneree.portions,4);assert.equal(vm.runInContext('operationsEmmaEnCours',context),0);
  await context.enregistrerRecettePlanV2Glow('a',node());assert.equal(d().recettesV2.length,1);
  context.fetch=async()=>{throw Error('cache should avoid network');};await context.ouvrirRecetteRepasGlow('a');assert.equal(context.recetteEnregistreeRepasGlow(p.repas[0]).portions,4);
});
await test('A recipe response arriving after a meal change is discarded',async()=>{
  const p=plan();d().recettesV2=[];let resolve;context.fetch=()=>new Promise(r=>resolve=r);
  const pending=context.ouvrirRecetteRepasGlow('a');p.repas[0].nom='Repas modifié';context.actualiserDependancesRepasGlow(p.repas[0]);resolve(response({nom:'Ancien plat',ingredients:[{nom:'Poulet',quantite:1,unite:'g'}],etapes:['Cuire']}));await pending;assert.equal(p.repas[0].recetteGeneree,undefined);assert.equal(vm.runInContext('operationsEmmaEnCours',context),0);
});
await test('Forbidden AI replacement leaves meal intact, closes loader, restores button',async()=>{
  plan();d().preferencesIngredients={'crème':'interdit'};const before=JSON.stringify(d().planActif.repas[0]);context.fetch=async()=>response({nom:'Poulet crème',ingredients:[{nom:'Crème',quantite:100,unite:'ml'}]});const b=node();b.textContent='Remplacer';await context.proposerNouvelleAssietteGlow('a',b);assert.equal(JSON.stringify(d().planActif.repas[0]),before);assert.equal(b.disabled,false);assert.equal(vm.runInContext('operationsEmmaEnCours',context),0);d().preferencesIngredients={};
});
await test('Mixed gram/piece needs merge; gram stock is converted consistently',()=>{
  const p=plan();p.repas.push({id:'c',date:'2026-10-07',type:'diner',nom:'Poulet',statut:'garder',personnes:2,portionsBase:2,ingredients:[{nom:'Blancs de poulet',quantite:300,unite:'g'}]});d().stockV2=[{nom:'Blanc de poulet',quantite:150,unite:'g'}];const a=context.calculerArticlesCoursesV2Glow(p).filter(x=>context.cleAlimentGlow(x.nom)==='blanc de poulet');assert.equal(a.length,1);assert.equal(a[0].besoin,6);assert.equal(a[0].quantite,5);
});
await test('Daily rollover preserves saved legacy recipes and archives all previous data',()=>{
  context.DB.glow={date:'2026-10-04',nutrition:{recettes:[{id:'keep',nom:'Ancienne recette',unknown:true}]},activite:{},custom:'kept'};context.DB.historiqueGlow=[];context.initialiserGlowDuJour();assert.equal(context.DB.glow.nutrition.recettes[0].unknown,true);assert.equal(context.DB.historiqueGlow[0].custom,'kept');
});
await test('Non-object extension documents never become writable',async()=>{
  for(const data of ['null','[]']){storage.set('modules/glow_nutrition',{data});await context.chargerExtensionsGlowSecurisees();await assert.rejects(context.sauvegarderExtensionGlow('glowNutritionPlans'));}storage.delete('modules/glow_nutrition');await context.chargerExtensionsGlowSecurisees();
});
await test('Network failure leaves a recoverable local snapshot',async()=>{
  context.userRef={collection:()=>({doc:()=>({set:async()=>{throw Error('offline');}})})};await assert.rejects(context.sauvegarderExtensionGlow('glowNutritionPlans'));const copie=JSON.parse(local.get('emma_extension_test_glowNutritionPlans'));assert.equal(copie.confirmee,false);assert.equal(copie.data,JSON.stringify(d()));context.userRef=userRef;
});
await test('Linked Journal choice follows meal changes and preserves consumed entries',async()=>{
  const p=plan();context.DB.glow.nutrition={repas:[],dinerPrevu:{nom:'Ancien choix',choixPlanId:'a',sourcePlanId:'a',date:'2026-10-05T12:00:00Z',heureRepas:'20:30'}};
  context.DB.journal={planning:{'2026-10-05':[{id:'glow_diner_2026-10-05',source:'glow',customNom:'Ancien choix'}]},faitAujourdhui:{}};
  await context.synchroniserChoixNutritionV2Glow();assert.equal(context.DB.glow.nutrition.dinerPrevu.nom,p.repas[0].nom);assert.equal(context.DB.journal.planning['2026-10-05'][0].customNom,p.repas[0].nom);
  context.DB.journal.faitAujourdhui={'2026-10-05':{'glow_diner_2026-10-05':true}};p.repas[0].nom='Repas modifié';await context.synchroniserChoixNutritionV2Glow();assert.equal(context.DB.journal.planning['2026-10-05'][0].customNom,'Poulet et courgettes');
});
await test('Journal ignores a previous day choice and marks removed plan choices for review',async()=>{
  plan();context.DB.glow.nutrition={repas:[],dinerPrevu:{nom:'Hier',horsPlanning:true,date:'2026-10-04T12:00:00Z'}};assert.equal(context.repasChoisiPourJournalGlow('diner','2026-10-05').nom,'Poulet et courgettes');
  context.DB.glow.nutrition.dinerPrevu={nom:'Ancien',choixPlanId:'missing',date:'2026-10-05T12:00:00Z'};await context.synchroniserChoixNutritionV2Glow();assert.equal(context.DB.glow.nutrition.dinerPrevu.aRevoir,true);assert.equal(context.repasChoisiPourJournalGlow('diner','2026-10-05').nom,'Poulet et courgettes');
});
await test('Exclusions match accents and singular/plural variants inside dish names',()=>{
  d().preferencesIngredients={'pâtes':'interdit','courgettes':'interdit','bœuf':'interdit'};
  for(const nom of ['Pâtes bolognaises','Courgette jaune','Bœuf à mijoter'])assert.throws(()=>context.validerAlimentsAutorisesGlow({nom}));d().preferencesIngredients={};
});
await test('All direct Anthropic calls use the loader adapter',()=>{
  let direct=0;function walk(n){if(!n||typeof n!=='object')return;if(n.type==='CallExpression'&&n.callee?.name==='fetch'&&n.arguments[0]?.value==='https://api.anthropic.com/v1/messages')direct++;for(const v of Object.values(n)){if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}}walk(ast);assert.equal(direct,0);
});
await test('Actual session completion writes shared occurrence IDs and prevents double clicks',async()=>{
  context.DB.glow={date:'2026-10-05',activite:{},nutrition:{repas:[]},historiqueSeances:[],entrainement:{actif:true}};context.DB.historiqueGlow=[];
  context.getSeanceEnCoursGlow=()=>({id:'same-program',objectif:'fessiers',duree:15,exercices:[]});context.stopChronoGlow=()=>{};context.glowSeanceEnCours={};
  await context.validerFinSeanceGlow();await context.validerFinSeanceGlow();assert.equal(context.DB.glow.historiqueSeances.length,1);
  context.DB.glow.entrainement={actif:true};await context.validerFinSeanceGlow();assert.equal(context.DB.glow.historiqueSeances.length,2);assert.equal(context.DB.historiqueGlow.length,2);assert.equal(context.bilanSportJourGlow().minutes,30);
  assert.equal(context.DB.glow.historiqueSeances[0].realisationId,context.DB.historiqueGlow[0].realisationId);assert.notEqual(context.DB.glow.historiqueSeances[0].realisationId,context.DB.glow.historiqueSeances[1].realisationId);
});
await test('15-minute option rejects a slower recipe without changing the meal',async()=>{
  plan();const avant=JSON.stringify(d().planActif.repas[0]);context.fetch=async()=>response({nom:'Poulet',typeAliment:'recette',tempsPreparation:10,tempsCuisson:20,ingredients:[{nom:'Poulet',quantite:300,unite:'g'}]});await context.proposerNouvelleAssietteGlow('a',node(),'15min');assert.equal(JSON.stringify(d().planActif.repas[0]),avant);assert.equal(vm.runInContext('operationsEmmaEnCours',context),0);
});
await test('Alternative accompaniment keeps the existing main protein',async()=>{
  plan();d().planActif.repas[0].assiette={proteine:'Blanc de poulet'};const avant=JSON.stringify(d().planActif.repas[0]);context.fetch=async()=>response({nom:'Saumon',assiette:{proteine:'Saumon'},ingredients:[{nom:'Saumon',quantite:2,unite:'pièce'}]});await context.proposerNouvelleAssietteGlow('a',node(),'accompagnement');assert.equal(JSON.stringify(d().planActif.repas[0]),avant);
});
console.log(`${passed} passed, ${failed} failed. Firebase is mocked; no production writes.`);
if(process.env.BUNDLE_OUTPUT)fs.writeFileSync(process.env.BUNDLE_OUTPUT,declarations);
process.exitCode=failed?1:0;
})();
