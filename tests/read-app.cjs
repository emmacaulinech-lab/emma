const fs=require('node:fs'),path=require('node:path');
module.exports=function readApp(entry=path.join(__dirname,'../index.html')){
  const html=fs.readFileSync(entry,'utf8');
  if(!html.includes('app-loader.js'))return html;
  const root=path.dirname(entry);
  const core=fs.readFileSync(path.join(root,'app-core.js'),'utf8').replace('/*__LIMAGECILS_FORMATIONS__*/\n',()=>fs.readFileSync(path.join(root,'modules/limagecils-formations.js'),'utf8'));
  const shell=fs.readFileSync(path.join(root,'app-shell.html'),'utf8').replace('<div id="limagecils-module-slot"></div>',()=>fs.readFileSync(path.join(root,'modules/limagecils.html'),'utf8'));
  return html.replace(/<body[\s\S]*<\/body>/,()=>'<body>'+shell+'<script>'+core+'</script></body>');
};
