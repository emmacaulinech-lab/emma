(async function loadEmmaApplication(){
  'use strict';
  const version='20261123-planning-5';
  const extras=['workspace-navigation.js','micro-preparation.js','formation-sync.js','task-guidance.js','planning-order.js','daily-improvements.js','comfort-fixes.js','completion-safety.js','dated-recovery.js','planning-workspace.js','login-loading.js'];
  const paths=['app-shell.html','modules/limagecils.html','app-core.js','modules/limagecils-formations.js',...extras];
  try{
    const sources=await Promise.all(paths.map(async path=>{
      const response=await fetch(path+'?v='+version);
      if(!response.ok) throw new Error('Chargement impossible : '+path);
      return response.text();
    }));
    const template=document.createElement('template');
    template.innerHTML=sources[0];
    template.content.querySelector('#limagecils-module-slot').innerHTML=sources[1];
    document.getElementById('app-loading').remove();
    document.body.appendChild(template.content);
    // Reconstituer le script avant exécution conserve la portée, les const et
    // le hoisting du fichier historique. Aucun changement du schéma Firebase.
    const main=sources[2].replace('/*__LIMAGECILS_FORMATIONS__*/\n',()=>sources[3]);
    const execute=source=>{
      const script=document.createElement('script');
      script.textContent=source;
      document.body.appendChild(script);
    };
    execute(main);
    sources.slice(4).forEach(execute);
    document.dispatchEvent(new Event('emma:ready'));
  }catch(error){
    console.error(error);
    const status=document.getElementById('app-loading')||document.body.appendChild(document.createElement('main'));
    status.textContent='Le chargement a échoué. Vérifie ta connexion puis recharge la page. Aucune donnée n’a été modifiée.';
    const retry=document.createElement('button');
    retry.textContent='Réessayer';retry.onclick=()=>location.reload();status.appendChild(retry);
  }
})();
