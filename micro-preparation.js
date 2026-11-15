(function prepareMicroAccounting(){
  'use strict';
  if(document.body.dataset.emmaSpace==='limagecils')return;
  let draft=null,loading=false,loadedUid=null;
  const defaults=()=>({version:1,statut:'preparation',dateDebut:'',periodicite:'a-confirmer',activites:{prestations:true,formations:false,ventes:false},notes:''});
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const openCompta=goModule;
  function mount(){
    const app=document.getElementById('app');
    if(!app||document.getElementById('micro-preparation'))return;
    const panel=document.createElement('section');panel.id='micro-preparation';
    panel.style.cssText='margin:16px;padding:18px;border:1px solid var(--brd);border-radius:18px;background:var(--bg2)';
    panel.innerHTML='<strong>Société · fonctionnement actuel</strong><p>La comptabilité société reste active. Le futur espace micro est indépendant.</p><button class="btn bg" id="micro-open">Préparer ma micro-entreprise</button><div id="micro-draft" hidden></div>';
    app.prepend(panel);
    document.getElementById('micro-open').onclick=async()=>{
      const body=document.getElementById('micro-draft');body.hidden=!body.hidden;
      if(body.hidden)return;
      if(!currentUser||!chargementReussi||!userRef){body.textContent='Attends la fin du chargement de ton compte.';return;}
      if(loadedUid!==currentUser.uid){
        if(loading)return;loading=true;body.textContent='Chargement du brouillon…';
        const uid=currentUser.uid;
        try{
          const doc=await userRef.collection('modules').doc('microPreparation').get();
          if(currentUser?.uid!==uid)return;
          draft={...defaults(),...(doc.exists?doc.data().preparation:{})};loadedUid=uid;render();
        }catch(e){body.textContent='Impossible de charger le brouillon. Ferme puis réessaie : aucune donnée remplacée.';console.error(e);}
        finally{loading=false;}
      }else render();
    };
  }
  function render(){
    const body=document.getElementById('micro-draft');
    body.innerHTML=`<h2>Micro-entreprise · en préparation</h2><p>Ce brouillon ne déclenche aucune bascule et ne reprend aucun encaissement société.</p>
      <form id="micro-form"><p><label>Date de début envisagée <input type="date" name="dateDebut" value="${escape(draft.dateDebut)}"></label></p>
      <p><label>Déclaration envisagée <select name="periodicite"><option value="a-confirmer">À confirmer</option><option value="mensuelle">Mensuelle</option><option value="trimestrielle">Trimestrielle</option></select></label></p>
      <fieldset><legend>Activités à prévoir</legend>${[['prestations','Prestations cils et beauté'],['formations','Formations'],['ventes','Produits et kits']].map(([key,label])=>`<label style="display:block;margin:8px 0"><input type="checkbox" name="${key}" ${draft.activites?.[key]?'checked':''}> ${label}</label>`).join('')}</fieldset>
      <p><label>Notes et questions <textarea name="notes" rows="3" style="width:100%">${escape(draft.notes)}</textarea></label></p>
      <button class="btn bd" type="submit">Enregistrer la préparation</button> <span id="micro-save-status" role="status"></span></form>
      <h3>Fonctionnement à construire</h3><ul><li>Encaissements séparés par activité et date de paiement.</li><li>Provision pour cotisations et impôts, avec paramètres à confirmer.</li><li>Dépenses réelles et argent disponible pour toi.</li><li>Suivi des déclarations et de la TVA selon ta situation.</li><li>Historique société conservé séparément lors de la bascule.</li></ul><p>Aucun taux ni régime de TVA n’est présélectionné. L’activation sera une étape distincte.</p>`;
    body.querySelector('[name="periodicite"]').value=draft.periodicite;
    body.querySelector('form').onsubmit=async event=>{
      event.preventDefault();
      if(!currentUser||currentUser.uid!==loadedUid||!chargementReussi||!userRef)return;
      const form=event.currentTarget,button=form.querySelector('button'),status=document.getElementById('micro-save-status');
      const data=new FormData(form);
      const next={...defaults(),dateDebut:String(data.get('dateDebut')||''),periodicite:String(data.get('periodicite')||'a-confirmer'),activites:Object.fromEntries(['prestations','formations','ventes'].map(k=>[k,data.has(k)])),notes:String(data.get('notes')||'')};
      button.disabled=true;status.textContent='Enregistrement…';
      try{
        await userRef.collection('modules').doc('microPreparation').set({preparation:next,updatedAt:new Date().toISOString()},{merge:true});
        draft=next;status.textContent='Préparation enregistrée ✓';
      }catch(e){status.textContent='Échec de l’enregistrement. Tu peux réessayer.';console.error(e);}
      finally{button.disabled=false;}
    };
  }
  goModule=function(name){const result=openCompta(name);if(name==='compta')mount();return result;};
  auth.onAuthStateChanged(()=>{
    draft=null;loadedUid=null;
    document.getElementById('micro-preparation')?.remove();
  });
})();
