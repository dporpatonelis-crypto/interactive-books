'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const printMode = new URLSearchParams(location.search).get('view') === 'print';
  const leaves = [], chapterStarts = [], paragraphHotspots = new WeakMap();
  let data, current = 0, turning = false, swipeStart = null, resizeTimer;
  const mediaDialog = $('media-dialog');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function safeUrl(raw) {
    if(typeof raw!=='string'||!raw.trim())return '';
    try { const u = new URL(raw, location.href); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; }
    catch { return ''; }
  }
  function youtube(raw) {
    if (!raw) return null;
    let id = String(raw).trim();
    if (!/^[\w-]{11}$/.test(id)) {
      try {
        const u = new URL(id);
        if (u.hostname === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
        else if (['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(u.hostname)) {
          id = u.searchParams.get('v') || u.pathname.match(/\/(?:embed|shorts|live)\/([\w-]+)/)?.[1];
        } else return null;
      } catch { return null; }
    }
    return /^[\w-]{11}$/.test(id || '') ? {embed:'https://www.youtube-nocookie.com/embed/'+id, url:'https://www.youtube.com/watch?v='+id} : null;
  }
  function imageUrl(raw) {
    const url = safeUrl(raw);
    if (!url) return '';
    const u = new URL(url);
    if (u.hostname === 'drive.google.com') {
      const id = u.searchParams.get('id') || u.pathname.match(/\/d\/([\w-]+)/)?.[1];
      if (id) return 'https://drive.google.com/thumbnail?id='+encodeURIComponent(id)+'&sz=w1600';
    }
    return url;
  }
  function isNotebook(url) { try{return ['notebook.google.com','notebooklm.google.com'].includes(new URL(url).hostname);}catch{return false;} }
  function mediaList(page) {
    const links = [], video = youtube(page.videoId);
    if (video) links.push({kind:'video', label:'Δες το βίντεο', icon:'▷', ...video});
    const slides = safeUrl(page.slidesUrl);
    if (slides) {
      const u = new URL(slides);
      const supported = u.hostname === 'docs.google.com' && /^\/presentation\//.test(u.pathname);
      links.push({kind:supported?'slides':'link',label:'Άνοιξε την παρουσίαση',icon:'▤',url:slides,embed:supported?slides:undefined});
    }
    const audio = safeUrl(page.audioUrl);
    if (audio) links.push({kind:isNotebook(audio)?'link':'audio',label:isNotebook(audio)?'Άκουσε στο NotebookLM':'Άκουσε την ηχογράφηση',icon:'♫',url:audio});
    for (const [field,label,icon] of [['webUrl','Επισκέψου τον ιστότοπο','↗'],['driveUrl','Άνοιξε το αρχείο Drive','↗'],['linkUrl',page.linkName||'Εξερεύνησε τον σύνδεσμο','↗']]) {
      const url = safeUrl(page[field]); if (url) links.push({kind:'link',label,icon,url});
    }
    return links;
  }
  function mediaActions(page, forPrint = false) {
    const actions = node('div','media-actions');
    for (const media of mediaList(page)) {
      const el = node(forPrint || media.kind === 'link' ? 'a' : 'button','media-action');
      el.append(node('span','media-icon',media.icon),node('span','',media.label));
      if (el.tagName === 'A') { el.href = media.url; el.target='_blank'; el.rel='noopener noreferrer'; }
      else { el.type='button'; el.addEventListener('click',() => openMedia(media)); }
      actions.append(el);
    }
    return actions;
  }
  function openMedia(media) {
    $('media-title').textContent = media.label;
    $('media-body').replaceChildren();
    $('media-external').href = media.url;
    $('media-external').hidden = !media.url;
    let el;
    if (media.kind === 'video' || media.kind === 'slides') {
      el = node('iframe'); el.src=media.embed; el.title=media.label;
      el.allow='fullscreen; encrypted-media; picture-in-picture'; el.allowFullscreen=true;
      el.referrerPolicy='strict-origin-when-cross-origin';
    } else if (media.kind === 'audio') { el=node('audio'); el.src=media.url; el.controls=true; }
    else if (media.kind === 'image') { el=node('img'); el.src=media.src; el.alt=media.label; }
    else { el=node('p','',media.text); }
    $('media-body').append(el); mediaDialog.showModal();
  }
  mediaDialog.addEventListener('close',() => {
    $('media-body').querySelectorAll('audio,video').forEach(el=>el.pause());
    // Removing the iframe ends playback, including when the dialog closes with Escape.
    $('media-body').replaceChildren();
  });
  $('close-media').addEventListener('click',()=>mediaDialog.close());
  $('close-toc').addEventListener('click',()=>$('toc-dialog').close());
  for (const dialog of [mediaDialog,$('toc-dialog')]) dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  function cleanText(text) { return String(text||'').replace(/\u00ad/g,'').trim(); }
  function textBlocks(page) {
    const blocks = []; let text='', hotspots=[];
    const flush = () => { if(text)blocks.push({kind:'p',text,hotspots}); text='';hotspots=[]; };
    for (const item of page.content || []) {
      if (typeof item==='string' || item.text) {
        const raw = typeof item==='string'?item:item.text;
        const previousHasHyphen = /\u00ad$/.test(text);
        // PDF-extracted line endings with a soft hyphen are joined without a space.
        const line=String(raw).trim();
        text += (text && !previousHasHyphen?' ':'') + line;
        if (typeof item==='object')hotspots.push(...(item.hotspots||[]));
        if (text.length>450 && /[.!?;»]$/.test(line))flush();
      } else if (item.quote || item.source) {
        flush(); blocks.push({kind:item.quote?'blockquote':'source',text:item.quote||item.source,hotspots:[]});
      }
    }
    flush(); return blocks.map(b=>({...b,text:cleanText(b.text)}));
  }
  function richParagraph(block, forPrint=false) {
    const el=node(block.kind==='blockquote'?'blockquote':'p',block.kind==='source'?'source-note':'body-text');
    const terms=[...new Map((block.hotspots||[]).filter(h=>h.term).map(h=>[h.term,h])).values()];
    if (!terms.length || forPrint)el.textContent=block.text;
    else {
      const escaped=terms.map(h=>h.term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
      const regex=new RegExp(escaped.join('|'),'gi');let last=0;
      for(const match of block.text.matchAll(regex)){
        el.append(document.createTextNode(block.text.slice(last,match.index)));
        const info=terms.find(h=>h.term.toLocaleLowerCase('el')===match[0].toLocaleLowerCase('el'));
        const term=node('button','term',match[0]);term.type='button';term.title=info.tooltip;term.dataset.tooltip=info.tooltip||'';
        term.addEventListener('click',()=>openMedia({kind:'definition',label:info.term,text:info.tooltip}));
        el.append(term);last=match.index+match[0].length;
      }
      el.append(document.createTextNode(block.text.slice(last)));
    }
    paragraphHotspots.set(el,block.hotspots||[]);return el;
  }
  function notes(page) {
    const items=new Map();for(const item of page.content||[])for(const h of item.hotspots||[])if(h.term&&h.tooltip)items.set(h.term,h.tooltip);
    if(!items.size)return null;const box=node('aside','footnotes');box.append(node('p','source-note','Μικρό γλωσσάρι'));
    for(const [term,meaning] of items)box.append(node('p','',term+' — '+meaning));return box;
  }
  function images(page) {
    if(page.localImages?.length)return page.localImages;
    return (page.images?.length?page.images:(page.image?[page.image]:[])).filter(Boolean).map(url=>({src:imageUrl(url),original:url}));
  }
  function figure(page,index,forPrint=false) {
    const asset=images(page)[index],fig=node('figure',index?'hero-image gallery-image':'hero-image');
    const img=node('img');img.src=asset.src;img.alt=page.imageCaption||`${page.displayTitle||page.title} · εικόνα ${index+1}`;
    const cap=node('figcaption','',page.imageCaption || `${page.sourceTitle||''} · σ. ${page.sourcePage??page.number}${images(page).length>1?' · εικόνα '+(index+1):''}`);
    img.addEventListener('error',()=>{
      const fallback=node('div','image-unavailable','Η εικόνα δεν είναι διαθέσιμη εδώ. ');
      const link=node('a','','Άνοιγμα αρχικού αρχείου ↗');link.href=safeUrl(asset.original);link.target='_blank';link.rel='noopener noreferrer';fallback.append(link);img.replaceWith(fallback);
    },{once:true});
    if(!forPrint){img.style.cursor='zoom-in';img.tabIndex=0;const show=()=>openMedia({kind:'image',label:img.alt,src:asset.src,url:safeUrl(asset.original)});img.addEventListener('click',show);img.addEventListener('keydown',e=>{if(e.key==='Enter')show();});}
    fig.append(img,cap);return fig;
  }
  function sourceLabel(page) {return `${page.sourceTitle||data.title} · αρχική σελίδα ${page.sourcePage??page.number}`;}
  function createLeaf(page=null) {
    const leaf=node('article','leaf');leaf.style.display='block';leaf.style.visibility='hidden';
    if(page)leaf.dataset.sourceKey=(page.sourceBook||'')+'-'+(page.sourcePage??page.number);
    const body=node('div','leaf-body');leaf.append(body);
    const footer=node('div','folio');footer.append(node('span','',page?`${page.sourceTitle||data.title} · σ. ${page.sourcePage??page.number}`:'ΔΙΑΔΡΑΣΤΙΚΟ ΛΕΥΚΩΜΑ'),node('span','',String(leaves.length+1)));
    leaf.append(footer);$('book').append(leaf);leaves.push(leaf);return body;
  }
  function addUnit(unit,state,page) {
    state.body.append(unit);
    if(state.body.scrollHeight<=state.body.clientHeight+1)return;
    unit.remove();state.body=createLeaf(page);
    state.body.append(node('p','eyebrow',sourceLabel(page)+' · συνέχεια'));
    state.body.append(unit);
    if(state.body.scrollHeight<=state.body.clientHeight+1)return;
    if(unit.matches('p,blockquote')){
      unit.remove();const words=unit.textContent.split(/\s+/);let cursor=0;
      while(cursor<words.length){
        let lo=1,hi=words.length-cursor,best=0;
        while(lo<=hi){const count=Math.floor((lo+hi)/2);const trial=richParagraph({kind:unit.tagName==='BLOCKQUOTE'?'blockquote':'p',text:words.slice(cursor,cursor+count).join(' '),hotspots:paragraphHotspots.get(unit)||[]});state.body.append(trial);const fits=state.body.scrollHeight<=state.body.clientHeight+1;trial.remove();if(fits){best=count;lo=count+1;}else hi=count-1;}
        if(!best)throw new Error('Το κείμενο δεν χωράει στη σελίδα.');
        state.body.append(richParagraph({kind:unit.tagName==='BLOCKQUOTE'?'blockquote':'p',text:words.slice(cursor,cursor+best).join(' '),hotspots:paragraphHotspots.get(unit)||[]}));cursor+=best;
        if(cursor<words.length){state.body=createLeaf(page);state.body.append(node('p','eyebrow',sourceLabel(page)+' · συνέχεια'));}
      }
    } else throw new Error('Η σελίδα χρειάζεται περισσότερο χώρο: '+page.number);
  }
  function cover(forPrint=false) {
    const box=node('div',forPrint?'print-cover':'');
    box.append(node('p','eyebrow','ΕΝΑ ΜΙΚΡΟ ΔΕΙΓΜΑ · ΠΟΛΛΕΣ ΔΥΝΑΤΟΤΗΤΕΣ'));
    const h=node('h1','','Δείγμα διαδραστικού λευκώματος');box.append(h);
    const img=node('img',forPrint?'':'cover-image');img.src=images(data.pages[0])[0]?.src||'';img.alt='Εικονογράφηση από την Α΄ Λυκείου, σελίδα 11';box.append(img);
    box.append(node('p','cover-subtitle',data.description||'Εικόνες, κείμενα και συνδέσεις σε ένα ανοιχτό βιβλίο.'));
    if(!forPrint){const end=node('div','cover-bottom');end.append(node('span','','ΛΥΚΕΙΟ'),node('span','','ΕΚΔΟΣΗ ΠΡΟΕΠΙΣΚΟΠΗΣΗΣ'));box.append(end);}return box;
  }
  function tocEntry(page,index,forPrint=false) {
    const el=node(forPrint?'a':'button','toc-entry');
    el.append(node('strong','',String(index+1).padStart(2,'0')));
    const label=node('span');label.append(node('b','',page.displayTitle||page.title),node('small','',sourceLabel(page)));el.append(label);
    if(forPrint){el.href='#chapter-'+index;const n=node('em');n.dataset.target='#chapter-'+index;el.append(n);}
    else {el.type='button';el.append(node('em','',String(chapterStarts[index]+1)));el.addEventListener('click',()=>{show(chapterStarts[index]);$('toc-dialog').close();});}
    return el;
  }
  async function waitImages(container) {
    await Promise.all([...container.querySelectorAll('img')].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});setTimeout(resolve,12000);}))); 
  }
  async function buildReader() {
    leaves.length=0;chapterStarts.length=0;$('toc-list').replaceChildren();
    $('book').replaceChildren();
    const coverBody=createLeaf();coverBody.parentElement.classList.add('cover');coverBody.parentElement.querySelector('.folio').remove();coverBody.replaceWith(cover());
    const tocBody=createLeaf();tocBody.append(node('p','eyebrow','ΠΕΝΤΕ ΑΦΕΤΗΡΙΕΣ'),node('h2','','Περιεχόμενα'),node('p','toc-intro','Ένα μικρό ταξίδι από την εικόνα στο κείμενο και από τη σελίδα στο πρόσθετο υλικό.'));
    for (let index=0;index<data.pages.length;index++) {
      const page=data.pages[index];chapterStarts.push(leaves.length);
      const state={body:createLeaf(page)};
      for(const unit of [node('p','eyebrow',sourceLabel(page)),node('div','chapter-number',String(index+1).padStart(2,'0')),node('h2','',page.displayTitle||page.title)])addUnit(unit,state,page);
      if(images(page).length)addUnit(figure(page,0),state,page);
      const actions=mediaActions(page);if(actions.children.length)addUnit(actions,state,page);
      if(page.audioUrl && isNotebook(safeUrl(page.audioUrl)))addUnit(node('p','media-note','Η ηχογράφηση ανοίγει στο NotebookLM. Ενδέχεται να ζητηθεί σύνδεση στον λογαριασμό σου.'),state,page);
      const blocks=textBlocks(page);
      if(blocks.length){addUnit(node('p','source-title',cleanText(page.title)),state,page);for(const b of blocks)addUnit(richParagraph(b),state,page);}
      const glossary=notes(page);if(glossary)addUnit(glossary,state,page);
      for(let i=1;i<images(page).length;i++){
        state.body=createLeaf(page);state.body.append(node('p','eyebrow',sourceLabel(page)+' · εικόνες'),node('h3','',page.displayTitle||page.title));addUnit(figure(page,i),state,page);
      }
    }
    data.pages.forEach((p,i)=>{tocBody.append(tocEntry(p,i));$('toc-list').append(tocEntry(p,i));});
    tocBody.append(node('p','toc-footer','Το βιβλίο και η αρχική σελίδα αναγράφονται σε κάθε ενότητα. Το PDF περιλαμβάνει το ίδιο υλικό και ενεργές παραπομπές.'));
    await waitImages($('book'));
    leaves.forEach(el=>{el.style.display='';el.style.visibility='';});
    resize();show(0);document.body.dataset.ready='true';
  }
  function isSingle(){return innerWidth<1100;}
  function spreadStart(index){return isSingle()||index===0?index:Math.floor((index-1)/2)*2+1;}
  function show(index) {
    current=Math.max(0,Math.min(index,leaves.length-1));current=spreadStart(current);
    leaves.forEach(el=>el.classList.remove('shown','left','right'));
    const solo=isSingle()||current===0;
    $('book').classList.toggle('cover-only',solo);
    leaves[current].classList.add('shown','left');
    if(!solo && leaves[current+1])leaves[current+1].classList.add('shown','right');
    const end=!solo&&leaves[current+1]?current+2:current+1;
    $('progress').textContent=`${current+1}${end>current+1?'–'+end:''} / ${leaves.length}`;
    $('progress-bar').style.width=(end/leaves.length*100)+'%';
    $('previous').disabled=current===0;$('next').disabled=end>=leaves.length;
    $('book').querySelectorAll('.leaf').forEach(el=>{el.inert=!el.classList.contains('shown');el.setAttribute('aria-hidden',String(!el.classList.contains('shown')));});
  }
  function resize() {
    const single=isSingle();
    const pageWidth=single?Math.min(520,innerWidth-26):520;
    const scale=single?1:Math.min(1,(innerWidth-100)/1040);
    document.documentElement.style.setProperty('--page-width',pageWidth+'px');
    document.documentElement.style.setProperty('--scale',String(scale));
    $('book').classList.toggle('cover-only',single||current===0);
    if(leaves.length)show(current);
  }
  function turn(direction) {
    if(turning||mediaDialog.open||$('toc-dialog').open)return;
    const step=isSingle()?1:2;
    const target=direction>0?(current===0?1:current+step):(current<=1?0:current-step);
    if(target<0||target>=leaves.length||target===current)return;
    if(reducedMotion.matches){show(target);return;}
    turning=true;
    const active=leaves[direction>0&&!isSingle()&&current!==0?Math.min(current+1,leaves.length-1):current];
    const clone=active.cloneNode(true);clone.classList.add('turn-sheet');clone.classList.remove('right','left');clone.inert=true;clone.setAttribute('aria-hidden','true');
    if(direction<0)clone.classList.add('backward');
    show(target);$('book').append(clone);setTimeout(()=>{clone.remove();turning=false;},680);
  }
  $('previous').addEventListener('click',()=>turn(-1));$('next').addEventListener('click',()=>turn(1));
  $('contents').addEventListener('click',()=>$('toc-dialog').showModal());
  document.addEventListener('keydown',e=>{if(printMode||e.target.closest('input,textarea,select')||mediaDialog.open||$('toc-dialog').open)return;if(e.key==='ArrowRight'){e.preventDefault();turn(1);}if(e.key==='ArrowLeft'){e.preventDefault();turn(-1);}});
  $('reader').addEventListener('pointerdown',e=>{if(e.target.closest('a,button,img')||e.pointerType==='mouse')return;swipeStart={x:e.clientX,y:e.clientY};});
  $('reader').addEventListener('pointerup',e=>{if(!swipeStart)return;const dx=e.clientX-swipeStart.x,dy=e.clientY-swipeStart.y;swipeStart=null;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)turn(dx<0?1:-1);});
  $('reader').addEventListener('pointercancel',()=>swipeStart=null);
  window.addEventListener('resize',()=>{
    if(printMode||!data)return;
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(async()=>{
      const key=leaves[current]?.dataset.sourceKey, oldIndex=current;
      resize();await buildReader();
      show(key?Math.max(0,leaves.findIndex(el=>el.dataset.sourceKey===key)):Math.min(oldIndex,1));
    },180);
  });
  async function buildPrint() {
    document.body.classList.add('print-mode');$('book').remove();$('contents').hidden=true;
    $('pdf-link').replaceWith(Object.assign(node('button','','Αποθήκευση ως PDF'),{id:'save-pdf',type:'button',disabled:true}));
    const help=node('p','reading-hint','Επίλεξε «Αποθήκευση ως PDF», A4 οριζόντιο, χωρίς κεφαλίδες/υποσέλιδα του browser και με γραφικά φόντου.');help.style.display='block';document.querySelector('main').prepend(help);
    const source=node('div');source.append(cover(true));
    const toc=node('section','print-toc');toc.append(node('p','eyebrow','ΠΕΝΤΕ ΑΦΕΤΗΡΙΕΣ'),node('h2','','Περιεχόμενα'));data.pages.forEach((p,i)=>toc.append(tocEntry(p,i,true)));source.append(toc);
    data.pages.forEach((page,index)=>{
      const section=node('section','print-section');section.id='chapter-'+index;
      section.append(node('p','eyebrow',sourceLabel(page)),node('h2','',page.displayTitle||page.title));
      if(images(page).length)section.append(figure(page,0,true));
      const actions=mediaActions(page,true);
      if(!images(page).length&&actions.children.length)section.append(actions);
      if((page.content||[]).length)section.append(node('p','source-title',cleanText(page.title)));
      for(const b of textBlocks(page))section.append(richParagraph(b,true));
      if(images(page).length&&actions.children.length)section.append(actions);
      if(page.audioUrl && isNotebook(safeUrl(page.audioUrl)))section.append(node('p','source-note','Η ηχογράφηση ανοίγει στο NotebookLM. Ενδέχεται να απαιτείται σύνδεση.'));
      if(images(page).length>1){const gallery=node('div','print-gallery');for(let i=1;i<images(page).length;i++)gallery.append(figure(page,i,true));section.append(gallery);}
      const glossary=notes(page);if(glossary)section.append(glossary);source.append(section);
    });
    const stage=node('div');stage.style.position='absolute';stage.style.left='-10000px';stage.style.width='261mm';stage.append(source);document.body.append(stage);
    await waitImages(source);await document.fonts.ready;
    await new Promise((resolve,reject)=>{const script=node('script');script.src='assets/paged.polyfill.js';script.onload=resolve;script.onerror=()=>reject(new Error('Δεν φορτώθηκε η σελιδοποίηση PDF.'));document.head.append(script);});
    const target=node('div','print-container');document.querySelector('main').append(target);
    // A detached fragment avoids copying live document ancestors into split pages.
    // Only pagination rules go through Paged.js; screen controls stay outside its styles.
    await new Paged.Previewer().preview(source.innerHTML,['print.css'],target);stage.remove();
    $('save-pdf').disabled=false;$('save-pdf').addEventListener('click',()=>window.print());document.body.dataset.ready='true';
  }
  async function load() {
    const bookId=new URLSearchParams(location.search).get('book');
    if(bookId){
      $('download-demo').hidden=true;
      const config=await fetch('../books.json').then(r=>{if(!r.ok)throw new Error('Δεν φορτώθηκε η βιβλιοθήκη.');return r.json();});
      const book=config.books.find(b=>b.id===bookId);if(!book)throw new Error('Το βιβλίο δεν βρέθηκε.');
      const raw=await fetch('../'+encodeURIComponent(bookId)+'/data.json').then(r=>{if(!r.ok)throw new Error('Δεν φορτώθηκε το βιβλίο.');return r.json();});
      data={title:book.title,pages:(raw.pages||[]).filter(p=>p.number!==undefined).map(p=>({...p,sourceBook:bookId,sourceTitle:book.title,sourcePage:p.number}))};
      $('pdf-link').href='?book='+encodeURIComponent(bookId)+'&view=print';
    }else{const response=await fetch('data.json');if(!response.ok)throw new Error('Δεν φορτώθηκε το δείγμα.');data=await response.json();}
    if(!data.pages?.length)throw new Error('Δεν υπάρχουν σελίδες.');
    await Promise.all([document.fonts.load('32px Didot'),document.fonts.load('14px Serif')]);
    await document.fonts.ready;
    // Load local images before measuring the reader, so image heights cannot change pagination.
    await Promise.all(data.pages.flatMap(p=>images(p)).map(asset=>new Promise(resolve=>{const img=new Image();img.onload=img.onerror=resolve;img.src=asset.src;setTimeout(resolve,12000);}))); 
    if(printMode)await buildPrint();else {resize();await buildReader();}
  }
  // Kept public for a reusable viewer and normalization regression checks.
  window.Album={youtube,imageUrl,safeUrl,textBlocks,mediaList,get data(){return data;},get leaves(){return leaves;},show};
  load().catch(error=>{document.querySelector('main').replaceChildren(node('p','error-message',error.message));console.error(error);document.body.dataset.error=error.message;});
})();
