// Run against a local HTTP server. Requires playwright or playwright-core.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.ALBUM_URL||'http://127.0.0.1:8765/demo/';
(async()=>{
 const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{ });
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>document.body.dataset.ready||document.body.dataset.error);
  assert.equal(await page.evaluate(()=>document.body.dataset.error),undefined);
  const normalization=await page.evaluate(()=>({
   video:[Album.youtube('6-KU_N_Vzvw'),Album.youtube('https://www.youtube.com/embed/6-KU_N_Vzvw'),Album.youtube('https://youtu.be/6-KU_N_Vzvw')].map(x=>x.embed),
   invalid:Album.youtube('https://example.org/embed/6-KU_N_Vzvw'),
   urls:[Album.safeUrl(''),Album.safeUrl(null),Album.safeUrl('javascript:alert(1)'),Album.safeUrl('data:text/html,unsafe')],
   image:Album.imageUrl('https://drive.google.com/file/d/example_id/view'),
   media:Album.data.pages.map(p=>Album.mediaList(p).map(m=>m.kind)),
   emptyMedia:Album.mediaList({}),
  }));
  assert.equal(new Set(normalization.video).size,1);assert.equal(normalization.invalid,null);
  assert.deepEqual(normalization.urls,['','','','']);assert.deepEqual(normalization.emptyMedia,[]);
  assert(normalization.image.includes('thumbnail?id=example_id'));
  assert.deepEqual(normalization.media,[['link'],[],['video'],['slides'],['link','link']]);
  const textCheck=await page.evaluate(()=>{
   const normalize=t=>t.replace(/[\s\u00ad]/g,'');
   return Album.data.pages.map(p=>{
    const source=(p.content||[]).map(i=>typeof i==='string'?i:i.text||i.quote||i.source||'').join('');
    return normalize(source)===normalize(Album.textBlocks(p).map(b=>b.text).join(''));
   });
  });assert(textCheck.every(Boolean),'Every original text block must be retained');
  assert(await page.locator('#previous').isDisabled());
  await page.locator('#next').click();await page.waitForTimeout(720);
  assert.equal(await page.locator('.turn-sheet').count(),0);
  assert.equal(await page.locator('.leaf.shown').count(),2);
  await page.keyboard.press('ArrowRight');await page.waitForTimeout(720);
  assert((await page.locator('#progress').textContent()).startsWith('4'));
  await page.locator('#contents').click();assert(await page.locator('#toc-dialog').isVisible());
  await page.locator('#toc-list .toc-entry').nth(2).click();assert(!(await page.locator('#toc-dialog').isVisible()));
  await page.locator('.leaf.shown button.media-action').filter({hasText:'βίντεο'}).click();
  assert((await page.locator('#media-body iframe').getAttribute('src')).includes('youtube-nocookie.com/embed/6-KU_N_Vzvw'));
  await page.keyboard.press('Escape');await page.locator('#media-body iframe').waitFor({state:'detached'});assert.equal(await page.locator('#media-body iframe').count(),0);
  await page.locator('#contents').click();await page.locator('#toc-list .toc-entry').nth(3).click();
  await page.locator('.leaf.shown button.media-action').filter({hasText:'παρουσίαση'}).click();
  assert((await page.locator('#media-body iframe').getAttribute('src')).includes('docs.google.com/presentation/'));
  await page.locator('#close-media').click();await page.locator('#media-body iframe').waitFor({state:'detached'});assert.equal(await page.locator('#media-body iframe').count(),0);
  await page.locator('#contents').click();await page.locator('#toc-list .toc-entry').nth(4).click();
  const audioLink=page.locator('.leaf.shown a.media-action').filter({hasText:'NotebookLM'});
  assert((await audioLink.getAttribute('href')).includes('artifact/d8d9fdb0-271c-4827-b910-1e5935149712'));
  assert.equal(await audioLink.getAttribute('target'),'_blank');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(650);
  assert.equal(await page.locator('.leaf.shown').count(),1);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow on mobile');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.leaf.shown .leaf-body')).transform),'none');
  // Every generated leaf is measured, including hidden continuations.
  const overflow=await page.evaluate(()=>Album.leaves.flatMap((leaf,i)=>{const prev=leaf.style.display;leaf.style.display='block';const body=leaf.querySelector('.leaf-body');const bad=body&&body.scrollHeight>body.clientHeight+1;leaf.style.display=prev;return bad?[i]:[];}));
  assert.deepEqual(overflow,[],'No text may be clipped');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>Album.show(0));await page.locator('#next').click();
  assert.equal(await page.locator('.turn-sheet').count(),0);
  await page.evaluate(()=>Album.show(0));
  await page.locator('#reader').dispatchEvent('pointerdown',{pointerType:'touch',clientX:320,clientY:350});
  await page.locator('#reader').dispatchEvent('pointerup',{pointerType:'touch',clientX:100,clientY:350});
  assert(!(await page.locator('#previous').isDisabled()));
  await page.goto(url+'?view=print');await page.waitForFunction(()=>document.body.dataset.ready||document.body.dataset.error,{timeout:60000});
  assert.equal(await page.evaluate(()=>document.body.dataset.error),undefined);
  assert(await page.locator('#save-pdf').isVisible());assert(!(await page.locator('#save-pdf').isDisabled()));
  assert.equal(await page.locator('.print-container .print-toc a').count(),5);
  assert.equal(await page.locator('.print-container a.media-action').count(),5);
  assert.equal(await page.locator('.print-container .term').count(),0);
  assert((await page.locator('.print-container').textContent()).includes('Αλλαγή νοοτροπίας'));
  assert.deepEqual(errors,[]);
  console.log('PASS: URL normalization, complete text, all media actions, dialogs, keyboard, swipe, responsive pagination, reduced motion, print controls, glossary and links.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
