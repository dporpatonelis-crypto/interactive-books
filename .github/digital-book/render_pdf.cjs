// Usage: NODE_PATH=<bundled packages> CHROME_PATH=<browser> node render_pdf.cjs <book-folder>
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
let chromium;try{({chromium}=require('playwright-core'));}catch{({chromium}=require('playwright'));}
(async()=>{
 const root=path.resolve(process.argv[2]);if(!fs.existsSync(path.join(root,'data.json')))throw new Error('Build data.json first');
 const types={'.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.ttf':'font/ttf'};
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return;}if(url.pathname==='/')file=path.join(root,'index.html');if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
  const page=await browser.newPage({viewport:{width:1400,height:950}});
  await page.goto(`http://127.0.0.1:${server.address().port}/?view=print`);
  await page.waitForFunction(()=>document.body.dataset.ready||document.body.dataset.error,null,{timeout:180000});
  const error=await page.evaluate(()=>document.body.dataset.error);if(error)throw new Error(error);
  const master=JSON.parse(fs.readFileSync(path.join(root,'book.json'),'utf8'));
  const lesson=master.lessons.find(l=>l.id==='lesson-creation-world');
  const expected=lesson.sections.flatMap(s=>s.blocks.filter(b=>b.kind==='table').flatMap(t=>t.rows.flat()));
  const actual=await page.evaluate(()=>[...document.querySelectorAll('.pagedjs_page table td,.pagedjs_page table th')].map(n=>n.textContent.replace(/\s+/g,' ').trim()));
  const missing=expected.filter(text=>!actual.includes(text));
  if(missing.length)throw new Error('Missing table cells in print DOM: '+JSON.stringify(missing));
  fs.mkdirSync(path.join(root,'qa'),{recursive:true});
  fs.writeFileSync(path.join(root,'qa/revision-0025-dom.json'),JSON.stringify({expected_cells:expected.length,rendered_cells_verified:expected.length,missing},null,2)+'\n');
 const output=path.join(root,'book.pdf');await page.pdf({path:output,preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false,tagged:true});
  const data=JSON.parse(fs.readFileSync(path.join(root,'data.json'),'utf8'));
  const meta={revision:data.revision,sourceDigest:data.sourceDigest,pdfSha256:crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex')};
  fs.writeFileSync(path.join(root,'pdf-meta.json'),JSON.stringify(meta,null,2)+'\n');
  console.log(JSON.stringify({output,...meta}));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
