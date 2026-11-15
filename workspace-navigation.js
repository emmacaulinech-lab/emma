(function configureWorkspace(){
'use strict';
const base='https://emmacaulinech-lab.github.io/limagecils-facturation/';
const destinations={formations:'formations.html',facturation:'facturation-reseau.html','facturation-perso':'ma-facturation.html'};
const openModule=goModule,navigate=emmaNavigate,overview=renderHubOverview;
function configureHome(){
document.querySelectorAll('[onclick]').forEach(node=>{
if(/goModule\(['"](?:formations|facturation|facturation-perso)['"]\)/.test(node.getAttribute('onclick')||'')){
const card=node.closest('.hub-smart-card');if(card)card.hidden=true;
}});
const grid=document.getElementById('hub-modules-grid');
if(grid&&!document.getElementById('limagecils-portal')){
const link=document.createElement('a');link.id='limagecils-portal';link.className='hub-smart-card';link.href=base;
link.style.cssText='display:block;padding:24px;color:inherit;text-decoration:none';
link.innerHTML='<div class="hub-smart-kicker">LIMAGECILS</div><h2>Mon espace LIMAGECILS</h2><p>Facturation Franchise · Facturation clientes · Formations</p><strong>Ouvrir le site LIMAGECILS ↗</strong>';
grid.appendChild(link);}}
renderHubOverview=function(){const result=overview.apply(this,arguments);configureHome();return result;};
goModule=function(name){if(destinations[name]){location.href=base+destinations[name];return;}return openModule(name);};
emmaNavigate=function(destination){
if(destination==='travail'){
ouvrirMenuNavigationEmma('Travail','Mes comptes et mon espace LIMAGECILS',[
{icon:'💰',titre:'MA COMPTA',texte:'Société et préparation micro-entreprise',action:()=>goModule('compta')},
{icon:'🎓',titre:'LIMAGECILS',texte:'Facturation Franchise, clientes et formations',action:()=>{location.href=base;}}
]);return;}return navigate(destination);};
configureHome();
})();
