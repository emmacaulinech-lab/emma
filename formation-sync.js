(function isolateFormationUpdates(){
  'use strict';
  let queue=Promise.resolve();
  // Depuis le Journal, ne modifier que la case demandée sur la toute dernière
  // version du dossier ; ne jamais republier la copie complète chargée par EMMA.
  enregistrerSuiviFormation=function(studentId,stepId,checked){
    const owner=currentUser?.uid;
    const operation=queue.then(async()=>{
      if(!owner||currentUser?.uid!==owner||!userRef||!chargementReussi)return false;
      const reference=userRef.collection('modules').doc('formations');let latest;
      try{
        await db.runTransaction(async transaction=>{
          const snapshot=await transaction.get(reference);
          if(!snapshot.exists)throw new Error('Ouvre les formations dans LIMAGECILS avant de modifier leur suivi.');
          const raw=snapshot.data().data;
          const data=typeof raw==='string'?JSON.parse(raw):structuredClone(raw);
          if(!Array.isArray(data?.etudiantes))throw new Error('Données formations invalides.');
          const student=data.etudiantes.find(item=>item.id===studentId);
          if(!student||!getEtapesDossierFormation(student).some(section=>section.items.some(item=>item.id===stepId)))throw new Error('Étape formation introuvable.');
          if(currentUser?.uid!==owner)throw new Error('Compte modifié.');
          student.suiviFormation={...(student.suiviFormation||{}),[stepId]:checked===true};
          transaction.set(reference,{data:JSON.stringify(data),updatedAt:new Date().toISOString()},{merge:true});latest=data;
        });
        if(currentUser?.uid===owner){DB.formations=latest;renderHubOverview();}
        return true;
      }catch(error){console.error('Suivi LIMAGECILS',error);return false;}
    });
    queue=operation.catch(()=>{});return operation;
  };
})();
