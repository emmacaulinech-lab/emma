process.chdir(require('path').join(__dirname,'..'));
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),PDFLib=require('pdf-lib'),{webcrypto}=require('crypto'),acorn=require('acorn');
const html=fs.readFileSync('index.html','utf8');
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc=|application\/ld\+json/.test(m[1]))acorn.parse(m[2],{ecmaVersion:'latest',sourceType:'script',allowReturnOutsideFunction:true});
const ctx={PDFLib,crypto:webcrypto,Date,getLabelFormation:x=>x,console};vm.createContext(ctx);
vm.runInContext(html.slice(html.indexOf('const DOCUMENTS_FORMATION ='),html.indexOf('// Compatibilité avec le nom de la fonction existante.'))+'\nthis.api={getDonneesDocumentsFormation,remplirConvocationEmma};',ctx);
(async()=>{
 fs.mkdirSync('../qa',{recursive:true});
 for(const type of ['debutante-express-3j','debutante-4j','debutante-5j','coaching-prive-2j']){
  for(const offert of [true,false]){
   const e={prenom:'Camille',nomFamille:'Exemple',formationTypeNormalise:type,financement:{type:'perso',kitOffert:offert},dateFormation:type==='debutante-5j'?'2026-11-02':'2026-11-03'};
   const data=ctx.api.getDonneesDocumentsFormation(e);
   assert.equal(data.modeleConvocation,'convocation-'+type+'-perso'+(offert?'':'-kit-payant'));
   const input=fs.readFileSync('documents/'+data.modeleConvocation+'.pdf');
   const out=await ctx.api.remplirConvocationEmma(input,data);
   assert.equal((await PDFLib.PDFDocument.load(out)).getPageCount(),2);
   fs.writeFileSync('../qa/'+type+(offert?'-offert':'-payant')+'.pdf',out);
  }
 }
 for(const type of ['debutante-express-3j','debutante-4j','debutante-5j','coaching-prive-3j']){
  assert.equal(ctx.api.getDonneesDocumentsFormation({formationTypeNormalise:type,financement:{type:'cpf',kitOffert:false}}).modeleConvocation,'convocation-'+type+'-cpf');
 }
 assert(!html.includes('pdf.removePage(0)'));
 console.log('PASS: syntaxe, 8 PDF générés, mapping personnel/CPF, intégrité SHA-256, deux pages conservées.');
})().catch(e=>{console.error(e);process.exit(1)});
