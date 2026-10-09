const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const initial={date:'2026-10-05',eau:4,sommeil:7,activite:{minutes:10,terminee:true},nutrition:{repas:[{type:'dejeuner',heure:'2026-10-05T10:30:00Z',aliments:[{nom:'Lasagnes maison',quantite:'1 portion'}]},{type:'diner',heure:'2026-10-05T17:30:00Z',aliments:[{nom:'Poulet crème',quantite:'1 portion'},{nom:'Courgettes',quantite:'200 g'}]}],recettes:[]},historiqueSeances:[{date:'2026-10-05',seanceId:'tapis',realisationId:'x',minutes:15,terminee:true},{date:'2026-10-05',seanceId:'fessiers',realisationId:'y',minutes:10,terminee:true}]};
const initialPlan={version:1,preferencesIngredients:{courgettes:'aime',poivrons:'interdit'},ingredientsPersonnalises:[],planActif:{id:'qa-plan',debut:'2026-10-05',fin:'2026-10-11',repas:[{id:'a',date:'2026-10-05',type:'diner',nom:'Poulet crème',statut:'garder',personnes:2,portionsBase:2,typeAliment:'recette',assiette:{proteine:'Blanc de poulet',legumes:'Courgettes',complement:'Crème'},ingredients:[{nom:'Blanc de poulet',quantite:2,unite:'pièce'},{nom:'Courgettes',quantite:2,unite:'pièce'},{nom:'Crème',quantite:100,unite:'ml'}]},{id:'b',date:'2026-10-06',type:'dejeuner',nom:'Restes de Poulet crème',statut:'restes',personnes:2,resteDeId:'a'}]}};
const docs={'users/test/data/main':{glow:JSON.stringify(initial),backupMarker:'LEGACY_PRESERVED'},'users/test/modules/glow':{data:JSON.stringify(initial),historique:'[]'},'users/test/modules/glow_nutrition':{data:JSON.stringify(initialPlan)}};
if(process.env.QA_AUTO==='1'){
 const date=new Date().toLocaleDateString('fr-CA');
 docs['users/test/modules/glow'].data=JSON.stringify({...initial,date,activite:{niveau:1,materielsChoisis:[]},historiqueSeances:[]});
 const rdv=[{id:'cliente-1',source:'planity',nom:'Cliente 1',heureDebut:'09:00',heureFin:'10:00',duree:60},{id:'cliente-2',source:'planity',nom:'Cliente 2',heureDebut:'11:00',heureFin:'18:00',duree:420}];
 docs['users/test/modules/journal']={data:JSON.stringify({planning:{[date]:rdv},faitAujourdhui:{},zones:[],preparationJour:{[date]:{heureLever:'07:30',heureFin:'22:30',contraintes:[]}}})};
 docs['users/test/modules/formations']={data:JSON.stringify({etudiantes:[{id:'test-eleve',prenom:'Élève',nom:'Élève test',formation:'coaching-prive-3j',formationTypeNormalise:'coaching-prive-3j',financement:{type:'cpf'},dateFormation:date,dateFinFormation:date,suiviFormation:{}}]})};
}
const events=[],writes=[];
function mocks(){
 window.__docs=QA_DOCS;
 window.addEventListener('error',e=>fetch('/qa-event',{method:'POST',body:JSON.stringify({error:e.message})}));
 window.addEventListener('unhandledrejection',e=>fetch('/qa-event',{method:'POST',body:JSON.stringify({error:String(e.reason)})}));
 function ref(key=''){
   const r={collection:n=>ref(key+'/'+n),doc:n=>ref(key+'/'+n),where:()=>r,orderBy:()=>r,limit:()=>r,get:async()=>({exists:!!window.__docs[key],data:()=>window.__docs[key]||{},docs:[],forEach(){}}),set:async(data,options)=>{window.__docs[key]={...(window.__docs[key]||{}),...data};await fetch('/qa-save',{method:'POST',body:JSON.stringify({key,data,options})});},onSnapshot:()=>()=>{},delete:async()=>{throw Error('Unexpected delete');},update:async()=>{throw Error('Unexpected update');}};return r;
 }
 const auth={onAuthStateChanged(){},currentUser:null};const firestore=()=>ref();firestore.FieldValue={serverTimestamp:()=>new Date().toISOString()};const app={auth:()=>auth,firestore,storage:()=>({ref:()=>ref()})};
 window.firebase={initializeApp:()=>app,auth:()=>auth,firestore,storage:app.storage,messaging:Object.assign(()=>({onMessage(){}}),{isSupported:async()=>false})};
 window.__testRef=ref('users/test');localStorage.setItem('anthropic_key','qa-placeholder');
 const fetchOriginal=window.fetch.bind(window);window.fetch=(url,options)=>fetchOriginal(url==='https://api.anthropic.com/v1/messages'?'/qa-ai':url,options);
}
const toolbar=`<div style="padding:8px;position:sticky;top:0;background:white;z-index:9999"><strong>Validation isolée</strong> <button onclick="renderIngredientsGlow()">Bibliothèque</button> <button onclick="renderPlanificationRepasGlow()">Planning</button> <button onclick="renderGlowModule()">Dashboard</button> <button onclick="ouvrirDecisionRepasEmma('diner')">Journal</button> <button onclick="document.getElementById('module-glow').style.display='none';document.getElementById('module-journal').style.display='flex';renderJournalModule()">Planning du jour</button> <button onclick="document.getElementById('module-glow').style.display='none';document.getElementById('module-journal').style.display='none';document.getElementById('module-formations').style.display='flex';goFTab('kits')">Kits</button> <button onclick="location.reload()">Refresh</button></div>`;
const bootstrap=`<script>(async()=>{userRef=window.__testRef;currentUser={uid:'test'};await loadAll();document.getElementById('loginPage').style.display='none';document.getElementById('app').style.display='none';document.getElementById('module-glow').style.display='flex';initialiserNutritionV2Glow();renderPlanificationRepasGlow();document.body.insertAdjacentHTML('afterbegin',${JSON.stringify(toolbar)});fetch('/qa-event',{method:'POST',body:JSON.stringify({loaded:chargementReussi,preferences:DB.glowNutritionPlans.preferencesIngredients,score:calculGlowScore(),sport:bilanSportJourGlow()})});})()</script>`;
const server=http.createServer(async(req,res)=>{
 if(req.url.startsWith('/qa-')){
   let body='';for await(const c of req)body+=c;
   if(req.url==='/qa-ai'){
     const demande=JSON.parse(body),contenu=demande.messages[0].content;
     const texte=typeof contenu==='string'?contenu:contenu.map(x=>x.text||'').join('');
     if(texte.includes('Erreur test')){res.statusCode=500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:{message:'Erreur IA simulée'}}));return;}
     const nom=texte.match(/Analyse cet aliment : "([^"]+)"/)?.[1]||texte.match(/Nom :\n([^\n]+)/)?.[1]||'Lasagnes maison test';
     const resultat=texte.includes('Estime la nutrition de la portion')?{calories:450,proteines:30,conseil:'Complète la journée selon ta faim et tes envies.'}:{nom,type:'recette',typeAliment:'recette',categorie:'proteine',portions:2,portionsBase:2,tempsPreparation:15,tempsCuisson:20,temperature:'180 °C',modeCuisson:'Four',ingredients:[{nom:'Escalope de veau',quantite:2,unite:'pièce'},{nom:'Olives',quantite:50,unite:'g'}],etapes:['Dorer la viande puis ajouter les olives.','Cuire doucement 20 minutes.'],materiel:['Poêle']};
     res.setHeader('Content-Type','application/json');res.end(JSON.stringify({content:[{text:JSON.stringify(resultat)}]}));return;
   }
   if(req.url==='/qa-save'){const value=JSON.parse(body);writes.push(value);docs[value.key]={...(docs[value.key]||{}),...value.data};}
   if(req.url==='/qa-event'&&body)events.push(JSON.parse(body));
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({events,writes,legacy:docs['users/test/data/main'].backupMarker}));return;
 }
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/'){
   let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script[^>]*\bsrc=[^>]*><\/script>/g,'');
   const start=`<script>const QA_DOCS=${JSON.stringify(docs).replace(/</g,'\\u003c')};(${mocks.toString()})();</script>`;
   html=html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="default-src \'self\' data: blob:; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; connect-src \'self\';">'+start);
   const fin=html.lastIndexOf('</body>');html=html.slice(0,fin)+bootstrap+html.slice(fin);
   res.setHeader('Content-Type','text/html');res.end(html);return;
 }
 const file=path.join(root,decodeURIComponent(pathname));if(file.startsWith(root)&&fs.existsSync(file)&&fs.statSync(file).isFile()){res.end(fs.readFileSync(file));return;}
 res.statusCode=404;res.end();
});server.listen(Number(process.env.PORT||8765),'127.0.0.1',()=>console.log(`Preview isolée : http://127.0.0.1:${process.env.PORT||8765}`));
