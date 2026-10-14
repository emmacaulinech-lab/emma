/* Dated sessions are immutable evidence; daily summaries and meal dates remain intact. */
(function(){
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x));
 const esc=x=>echapperTexteRepasGlow(String(x??''));
 function sessions(data){
   const result=new Map(),sources=[...(data.historiqueSportPersistant||[]),...(data.glow?.historiqueSeances||[]),...(data.historiqueSeances||[])];
   const archives=data.historiqueGlow||[];
   for(const day of archives){
     if(day?.seanceId||day?.realisationId)sources.push(day);
     for(const e of day?.historiqueSeances||[])sources.push({...e,date:e.date||day.date});
     if(day?.activite?.terminee&&Number(day.activite.minutes)>0)sources.push({...day.activite,date:day.date});
   }
   if(data.glow?.activite?.terminee&&Number(data.glow.activite.minutes)>0)sources.push({...data.glow.activite,date:data.glow.date});
   for(const e of sources){
     if(!e||e.terminee===false||!/^\d{4}-\d{2}-\d{2}$/.test(e.date||'')||!e.objectif||!(Number(e.minutes??e.duree)>0))continue;
     const key=e.realisationId||`${e.date}|${e.seanceId||e.objectif}|${e.minutes??e.duree}`;
     const previous=result.get(key)||{};
     const merged={...previous,...e,minutes:Number(e.minutes??e.duree),terminee:true};
     for(const k of ['objectifs','minutesParZone','muscles','exercices'])if(!e[k]&&previous[k])merged[k]=previous[k];
     result.set(key,merged);
   }
   return [...result.values()];
 }
 window.collecterSeancesEnregistreesEmma=function(data){
   if(data!==DB)return sessions(data);
   let backup=null;
   try{backup=JSON.parse(localStorage.getItem(`emma_sport_${typeof currentUser!=='undefined'?currentUser?.uid||'local':'local'}`)||'null');}catch{}
   return sessions({historiqueSportPersistant:[...sessions(backup||{}),...sessions(data)]});
 };
 window.sauvegarderGlowAvecSeancesEmma=async function(data,historique){
   if(!userRef||!chargementReussi)throw Error('Recharge EMMA avant d’enregistrer.');
   const reference=userRef.collection('modules').doc('glow');
   const current=collecterSeancesEnregistreesEmma(DB);
   const saved=await db.runTransaction(async tx=>{
     const snapshot=await tx.get(reference),old=snapshot.exists?snapshot.data():{};
     const parse=(value,fallback)=>value?JSON.parse(value):fallback;
     const server={glow:parse(old.data,{}),historiqueGlow:parse(old.historique,[]),historiqueSportPersistant:parse(old.historiqueSport,[])};
     const merged=sessions({historiqueSportPersistant:[...sessions(server),...current]});
     tx.set(reference,{...(data!==null?{data}:{}),...(historique!==null?{historique}:{}),historiqueSport:JSON.stringify(merged),updatedAt:new Date().toISOString()},{merge:true});
     return merged;
   });
   DB.historiqueSportPersistant=saved;
   return true;
 };

 // Flexible meals: original dates, ingredients, shopping list and recipes are untouched.
 const free=()=>!!DB.glowNutritionPlans?.planActif && DB.glowNutritionPlans.planActif.libre!==false;
 function consumedIds(){
   const ids=new Set();
   for(const day of [DB.glow,...(DB.historiqueGlow||[])])for(const r of day?.nutrition?.repas||[]){
     if(r.sauvegardeNonConfirmee)continue;
     if(r.choixPlanId)ids.add(r.choixPlanId);
     else if(r.sourcePlanId)ids.add(r.sourcePlanId);
   }
   return ids;
 }
 function cooked(id){
   return [DB.glow,...(DB.historiqueGlow||[])].some(day=>(day?.nutrition?.repas||[]).some(r=>!r.sauvegardeNonConfirmee&&(r.choixPlanId===id||r.sourcePlanId===id)));
 }
 function available(date,type){
   const ids=consumedIds();
   return (DB.glowNutritionPlans?.planActif?.repas||[]).filter(r=>{
     if(r.statut==='absent'||r.sourceIndisponible||ids.has(r.id))return false;
     const source=r.statut==='restes'?trouverRepasPlanGlow(r.resteDeId):r;
     if(!source||source.statut==='absent'||(r.statut==='restes'&&!cooked(source.id)))return false;
     try{validerAlimentsAutorisesGlow(source);return true;}catch{return false;}
   });
 }
 const originalAvailable=planningNutritionDisponibleGlow;
 window.planningNutritionDisponibleGlow=function(date){return free()?available(date).length>0:originalAvailable(date);};
 const originalChoices=choixSemaineNutritionGlow;
 window.choixSemaineNutritionGlow=function(date,type){return free()?available(date,type):originalChoices(date,type);};
 const originalPlanned=getRepasPlanifieGlow;
 window.getRepasPlanifieGlow=function(date,type){
   if(!free())return originalPlanned(date,type);
   const n=DB.glow?.nutrition,chosen=type==='diner'?n?.dinerPrevu:n?.repasPrevus?.dejeuner;
   if(!chosen?.choixPlanId||!chosen.date||dateLocaleISO(new Date(chosen.date))!==date)return null;
   const r=trouverRepasPlanGlow(chosen.choixPlanId);if(!r||r.statut==='absent')return null;
   const source=r.statut==='restes'?trouverRepasPlanGlow(r.resteDeId):r;
   return source?{...source,date,type,id:r.id,sourcePlanId:source.id,choixPlanId:r.id}:null;
 };
 const originalDecision=ouvrirDecisionRepasEmma;
 window.ouvrirDecisionRepasEmma=function(type){
   originalDecision(type);
   if(!free())return;
   const select=document.getElementById('emma-repas-planning');
   if(select){select.options[0].textContent='Choisir parmi mes repas disponibles';select.value='';selectionDecisionPlanningGlow('');const input=document.getElementById('emma-repas-nom');if(input)input.value='';}
 };
 window.choisirRepasReserveEmma=function(id,type){
   if(!available(dateLocaleISO(),type).some(r=>r.id===id))return toast('Ce repas n’est plus disponible.');
   ouvrirDecisionRepasEmma(type);
   const select=document.getElementById('emma-repas-planning');
   if(select){select.value=id;selectionDecisionPlanningGlow(id);}
 };
 window.ouvrirJoursRepasLibresEmma=function(nombreJours){
   initialiserExtensionsGlowLocales();initialiserNutritionV2Glow();
   document.getElementById('emma-meal-days')?.remove();
   const dates=Array.from({length:nombreJours},(_,i)=>{const d=new Date(dateLocaleISO()+'T12:00:00');d.setDate(d.getDate()+i);return dateLocaleISO(d);});
   document.body.insertAdjacentHTML('beforeend',`<dialog id="emma-meal-days" style="width:min(620px,92vw);max-height:85vh;overflow:auto;border:1px solid var(--brd);border-radius:24px;padding:24px;background:var(--bg2);color:var(--txt)"><h2>Pour quels jours prévoir des repas ?</h2><p>Choisis les jours où tu mangeras à la maison. Les repas seront ajoutés à ta réserve : tu choisiras quoi manger le jour même.</p><p><strong>Tous tes repas déjà prévus et tes courses sont conservés.</strong></p><div style="display:grid;gap:10px">${dates.map(date=>`<label style="padding:10px;border:1px solid var(--brd);border-radius:12px"><input type="checkbox" name="meal-day" value="${date}" ${DB.glowNutritionPlans.habitudes.joursMaison.includes(new Date(date+'T12:00:00').getDay())?'checked':''}> ${new Date(date+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}</label>`).join('')}</div><p id="meal-days-error" role="alert"></p><div class="ma"><button class="btn bg" onclick="document.getElementById('emma-meal-days').close()">Annuler</button><button class="btn bd" onclick="genererReserveRepasEmma(this)">Ajouter les repas pour ces jours</button></div></dialog>`);
   document.getElementById('emma-meal-days').showModal();
 };
 window.genererReserveRepasEmma=async function(button){
   const dates=[...document.querySelectorAll('#emma-meal-days [name="meal-day"]:checked')].map(x=>x.value).sort();
   if(!dates.length){document.getElementById('meal-days-error').textContent='Sélectionne au moins un jour.';return;}
   button.disabled=true;document.getElementById('emma-meal-days').close();
   try{await creerPlanRepasGlow(dates.length,{dates,ajouter:true});}finally{button.disabled=false;}
 };
 function reserveHTML(){
   const plan=DB.glowNutritionPlans.planActif,ids=consumedIds(),choices=available(dateLocaleISO());
   return `<section id="emma-meal-reserve" class="glow-extension-card" style="margin:16px 0"><h2>Mes repas disponibles ♡</h2><p>Je choisis le jour même · ${choices.length} repas disponibles. Tes anciennes dates restent conservées.</p>${(plan.repas||[]).filter(r=>r.statut!=='absent').map(r=>{
     const used=ids.has(r.id),ready=choices.some(x=>x.id===r.id);
     return `<article style="padding:16px 0;border-top:1px solid var(--brd);${used?'opacity:.65':''}"><strong>${esc(r.nom)}</strong><p style="font-size:12px;color:var(--mut);margin:6px 0">${used?'✓ Déjà mangé':r.statut==='restes'&&!ready?'À cuisiner d’abord : le repas source':`${Number(r.personnes)||2} personnes · ${r.statut==='restes'?'Restes disponibles':'À choisir'}`}</p><div style="display:flex;flex-wrap:wrap;gap:8px">${ready?`<button class="btn bd bsm" data-meal-id="${esc(r.id)}" data-meal-type="dejeuner">Pour mon déjeuner</button><button class="btn bd bsm" data-meal-id="${esc(r.id)}" data-meal-type="diner">Pour mon dîner</button>`:''}<button class="btn bg bsm" data-meal-recipe="${esc(r.id)}">Recette</button><button class="btn bg bsm" data-meal-edit="${esc(r.id)}">Modifier</button></div></article>`;
   }).join('')}</section>`;
 }
 const originalRender=renderPlanificationRepasGlow;
 window.renderPlanificationRepasGlow=function(){
   originalRender();if(!free())return;
   const root=document.getElementById('glow-content');
   root.querySelectorAll('.glow-plan-day').forEach(x=>x.remove());
   const heading=root.querySelector('.glow-plan-heading');
   if(heading)heading.insertAdjacentHTML('afterend',reserveHTML());
   root.querySelectorAll('[data-meal-id]').forEach(b=>b.addEventListener('click',()=>choisirRepasReserveEmma(b.dataset.mealId,b.dataset.mealType)));
   root.querySelectorAll('[data-meal-recipe]').forEach(b=>b.addEventListener('click',()=>ouvrirRecetteRepasGlow(b.dataset.mealRecipe)));
   root.querySelectorAll('[data-meal-edit]').forEach(b=>b.addEventListener('click',()=>ouvrirCompositionRepasGlow(b.dataset.mealEdit)));
 };
 const originalSport=renderGlowSport;
 window.conserverHistoriqueSportEmma=async function(button){
   button.disabled=true;
   try{await sauvegarderGlowAvecSeancesEmma(null,null);renderGlowSport();toast('Séances retrouvées conservées et sauvegarde confirmée ✓');}
   catch(error){toast('Sauvegarde non confirmée : '+error.message);button.disabled=false;}
 };
 window.renderGlowSport=function(){
   originalSport();
   const root=document.getElementById('glow-content'),history=collecterSeancesEnregistreesEmma(DB).sort((a,b)=>b.date.localeCompare(a.date));
   if(!root)return;
   root.insertAdjacentHTML('beforeend',`<details id="emma-all-sport" class="glow-extension-card" style="margin-top:18px"><summary>Mon historique sport · ${history.length} séance(s)</summary>${history.map(e=>`<p>${esc(e.date.split('-').reverse().join('/'))} · ${esc(libelleZonesSportGlow(e.objectifs||[e.objectif]))} · ${Math.round(e.minutes*10)/10} min</p>`).join('')||'<p>Aucune séance enregistrée retrouvée.</p>'}${history.length?'<button class="btn bg" onclick="conserverHistoriqueSportEmma(this)">Conserver les séances retrouvées</button>':''}</details>`);
 };
 window.EmmaDailyImprovements={sessions,available,consumedIds};
})();
