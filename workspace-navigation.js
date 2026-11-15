(function configureWorkspace(){
  'use strict';
  const business=new Set(['formations','facturation','facturation-perso']);
  const isBusiness=document.body.dataset.emmaSpace==='limagecils';
  const originalGoHub=goHub;
  const originalGoModule=goModule;
  const originalOverview=renderHubOverview;
  function configureHome(){
    if(isBusiness) return;
    for(const name of business){
      document.querySelectorAll('[onclick]').forEach(node=>{
        if(new RegExp("goModule\\(['\"]"+name+"['\"]\\)").test(node.getAttribute('onclick')||'')){
          const card=node.closest('.hub-smart-card');
          if(card)card.hidden=true;
        }
      });
    }
    const grid=document.getElementById('hub-modules-grid');
    if(grid&&!document.getElementById('limagecils-portal')){
      const link=document.createElement('a');link.id='limagecils-portal';link.className='hub-smart-card';link.href='limagecils.html';
      link.style.cssText='display:block;padding:24px;color:inherit;text-decoration:none';
      link.innerHTML='<div class="hub-smart-kicker">LIMAGECILS</div><h2>Formations & facturation</h2><p>Les élèves, les documents et les deux facturations dans un espace dédié.</p><strong>Ouvrir LIMAGECILS →</strong>';
      grid.appendChild(link);
    }
  }
  renderHubOverview=function(){const result=originalOverview.apply(this,arguments);configureHome();return result;};
  if(isBusiness){
    document.title='LIMAGECILS — Formations et facturation';
    const home=document.createElement('section');home.id='limagecils-home';home.hidden=true;
    home.style.cssText='max-width:1000px;margin:auto;padding:32px 20px 120px';
    home.innerHTML='<a href="index.html">← EMMA OS</a> <button class="btn bg" onclick="doLogout()">Déconnexion</button><p>LIMAGECILS</p><h1>Mon espace professionnel</h1><p>Formations et facturation, avec les données existantes.</p><div class="emma-hub-grid"><button class="hub-smart-card" onclick="goModule(\'formations\')"><h2>🎓 Formations</h2><p>Étudiantes, sessions, kits et documents</p></button><button class="hub-smart-card" onclick="goModule(\'facturation\')"><h2>🧾 Facturation LIMAGECILS</h2><p>Outil de facturation du réseau</p></button><button class="hub-smart-card" onclick="goModule(\'facturation-perso\')"><h2>🧾 Ma facturation</h2><p>Mes factures et règlements</p></button></div>';
    document.body.appendChild(home);
    goHub=function(){
      originalGoHub();
      document.getElementById('hubPage').style.display='none';
      home.hidden=false;
      document.querySelectorAll('.emma-bottom-nav').forEach(n=>n.hidden=true);
    };
    goModule=function(name){
      if(!business.has(name)){location.href='index.html';return;}
      home.hidden=true;originalGoModule(name);
    };
    // L'authentification est partagée sur la même origine. Le lien profond
    // n'est suivi qu'une fois le chargement des données terminé.
    let opened=false;
    const businessHub=goHub;
    goHub=function(){businessHub();if(!opened){opened=true;const module=new URLSearchParams(location.search).get('module');if(business.has(module))goModule(module);}};
    const logout=doLogout;
    doLogout=function(){home.hidden=true;return logout();};
    auth.onAuthStateChanged(user=>{if(!user){home.hidden=true;opened=false;}});
  }else{
    const navigate=emmaNavigate;
    emmaNavigate=function(destination){
      if(destination==='travail'){
        ouvrirMenuNavigationEmma('Travail','Mes comptes et mon espace LIMAGECILS',[
          {icon:'💰',titre:'MA COMPTA',texte:'Société et préparation micro-entreprise',action:()=>goModule('compta')},
          {icon:'🎓',titre:'LIMAGECILS',texte:'Formations et les deux facturations',action:()=>{location.href='limagecils.html';}}
        ]);
        return;
      }
      return navigate(destination);
    };
    goModule=function(name){
      if(business.has(name)){location.href='limagecils.html?module='+encodeURIComponent(name);return;}
      return originalGoModule(name);
    };
    configureHome();
  }
})();
