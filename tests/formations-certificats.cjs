const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),{JSDOM}=require('jsdom'),PDFLib=require('pdf-lib');
process.chdir(path.join(__dirname,'..'));
const html=fs.readFileSync('index.html','utf8');
const dom=new JSDOM('<body></body>');
dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};
dom.window.HTMLDialogElement.prototype.close=function(){this.open=false};
const ctx={document:dom.window.document,PDFLib,Date,console,dateLocaleISO:()=> '2026-10-23',getLabelFormation:t=>t,normaliserTypeFormation:t=>t,nomEtudianteFormation:e=>e.prenom+' '+e.nomFamille,dateSessionFormation:v=>v||'',echapperFormation:v=>String(v??''),toast:()=>{},DB:{formations:{etudiantes:[]}}};
vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf('const DOCUMENTS_FORMATION ='),html.indexOf('// Compatibilité avec le nom de la fonction existante.')),ctx);
vm.runInContext(html.slice(html.indexOf('function formationTermineeCertificatEmma('),html.indexOf('async function genererConvocationFormation(')),ctx);
(async()=>{
 const types={'debutante-express-3j':21,'debutante-4j':28,'debutante-5j':35,'coaching-prive-2j':14,'coaching-prive-1j':7,lashup:6,'lashlift-coreen':7,browlift:7};
 for(const [type,hours] of Object.entries(types))for(const kitOffert of [true,false]){
  const e={id:'fiction',prenom:'Camille',nomFamille:'Exemple',formationTypeNormalise:type,financement:{type:'perso',kitOffert},dateFormation:'2026-10-12',dateFinFormation:'2026-10-16'};
  const data=ctx.donneesCertificatRealisationEmma(e);
  assert.equal(data.heures,hours);assert.equal(data.certification,'');assert(data.competences);
  const pdf=await ctx.remplirCertificatRealisationEmma(fs.readFileSync('documents/certificat-realisation.pdf'),data);
  assert.equal((await PDFLib.PDFDocument.load(pdf)).getPageCount(),1);
 }
 const missing={id:'missing',prenom:'Camille',nomFamille:'Exemple',formationTypeNormalise:'browlift',financement:{type:'perso'}};
 ctx.DB.formations.etudiantes=[missing];ctx.genererCertificatRealisationFormation('missing');
 assert(ctx.document.getElementById('certificatRealisationModal').open,'Personal form opens with incomplete dates');
 assert.throws(()=>ctx.validerDonneesCertificatRealisationEmma({...ctx.donneesCertificatRealisationEmma(missing)}),/Date de début/);
 const future={...missing,dateFormation:'2026-11-02',dateFinFormation:'2026-11-02'};
 assert.throws(()=>ctx.validerDonneesCertificatRealisationEmma(ctx.donneesCertificatRealisationEmma(future)),/daté entre la fin/);
 assert(html.includes("(e.financement?.type==='perso'||formationTermineeCertificatEmma(e))?`<button"));
 console.log('PASS: 16 certificats personnels, 8 formations, kit offert/payant, formulaire avec dates manquantes, refus des dates futures, aucune mention CPF.');
})().catch(e=>{console.error(e);process.exit(1)});
