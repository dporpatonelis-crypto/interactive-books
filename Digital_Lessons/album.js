'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const sectionAnchor=(page,index)=>'section-'+(page.id||index);
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
  function isNotebook(url) { try{return ['notebook.google.com','notebooklm.google.com','notebooklm.link.google'].includes(new URL(url).hostname);}catch{return false;} }
  function mediaList(page) {
    const links = [], video = youtube(page.videoId);
    if (video) links.push({kind:'video', label:'Δες το βίντεο', icon:'▷', ...video});
    const directVideo = safeUrl(page.videoUrl);
    if (directVideo) links.push({kind:/\.(mp4|webm|ogg)(?:[?#]|$)/i.test(directVideo)?'video_file':'link',label:'Δες το βίντεο',icon:'▷',url:directVideo});
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
    for (const media of page.extraMedia || []) {
      const field={youtube:'videoId',video:'videoUrl',audio:'audioUrl',slides:'slidesUrl',website:'webUrl',drive:'driveUrl',document:'driveUrl'}[media.type];
      if (field) for (const item of mediaList({[field]:media.url})) links.push({...item,label:media.title||item.label});
    }
    return links;
  }
  function mediaActions(page, forPrint = false, placement = 'body') {
    const actions = node('div','media-actions');
    for (const media of mediaList(page)) {
      const position=page.mediaPlacement?.[media.url];
      if((position?.placement||'body')!==placement)continue;
      if(position?.title)media.label=position.title;
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
    } else if (media.kind === 'video_file') { el=node('video'); el.src=media.url; el.controls=true; }
    else if (media.kind === 'audio') { el=node('audio'); el.src=media.url; el.controls=true; }
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
  function textBlocks(page, placement = 'body') {
    const blocks = []; let text='', hotspots=[];
    const flush = () => { if(text)blocks.push({kind:'p',text,hotspots}); text='';hotspots=[]; };
    for (const item of page.content || []) {
      if((item.placement||'body')!==placement)continue;
      if(item.kind==='table'){flush();blocks.push({kind:'table',table:item.table});continue;}
      if(item.paragraphBoundary){flush();blocks.push({kind:item.kind==='heading'?'h3':'p',text:item.text,hotspots:item.hotspots||[]});continue;}
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
    if(block.kind==='table')return printTable(block.table);
    const el=node(block.kind==='h3'?'h3':block.kind==='blockquote'?'blockquote':'p',block.kind==='source'?'source-note':'body-text');
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
    if(page.localImages?.length)return page.localImages.map(a=>({...a,src:a.retained===false?imageUrl(a.src):a.src}));
    return (page.images?.length?page.images:(page.image?[page.image]:[])).filter(Boolean).map(url=>({src:imageUrl(url),original:url}));
  }
  function figure(page,index,forPrint=false) {
    const asset=images(page)[index],fig=node('figure',index?'hero-image gallery-image':'hero-image');
    const img=node('img');img.src=asset.src;img.alt=asset.caption||page.imageCaption||`${page.displayTitle||page.title} · εικόνα ${index+1}`;
    const cap=node('figcaption','',asset.caption || page.imageCaption || `${page.sourceTitle||''} · σ. ${page.sourcePage??page.number}${images(page).length>1?' · εικόνα '+(index+1):''}`);
    img.addEventListener('error',()=>{
      const fallback=node('div','image-unavailable','Η εικόνα δεν είναι διαθέσιμη εδώ. ');
      const link=node('a','','Άνοιγμα αρχικού αρχείου ↗');link.href=safeUrl(asset.original);link.target='_blank';link.rel='noopener noreferrer';fallback.append(link);img.replaceWith(fallback);
    },{once:true});
    if(!forPrint){img.style.cursor='zoom-in';img.tabIndex=0;const show=()=>openMedia({kind:'image',label:img.alt,src:asset.src,url:safeUrl(asset.original)});img.addEventListener('click',show);img.addEventListener('keydown',e=>{if(e.key==='Enter')show();});}
    const retained=asset.retained?sourceFileUrl(asset.src,forPrint):'';
    if(!forPrint&&retained){cap.append(' · ');const full=node('a','','Πλήρης εικόνα ↗');full.href=retained;full.target='_blank';full.rel='noopener noreferrer';cap.append(full);}
    if(forPrint&&(retained||safeUrl(asset.original))){const link=node('a');link.href=retained||safeUrl(asset.original);link.append(img);fig.append(link,cap);}else fig.append(img,cap);return fig;
  }
  function sourceFileUrl(raw,forPrint=false) {
    if(!raw)return '';
    if(!forPrint||/^https?:/.test(raw))return safeUrl(raw);
    try{return data.publicUrl?safeUrl(new URL(raw,data.publicUrl).href):'';}catch{return '';}
  }
  function tableSource(table,forPrint=false) {
    const box=node('p','source-note',table.source_note||'');
    const url=sourceFileUrl(table.source_file,forPrint);
    if(url){if(box.textContent)box.append(' ');const link=node('a','','Αρχείο πίνακα (CSV) ↗');link.href=url;link.target='_blank';link.rel='noopener noreferrer';box.append(link);}
    return box;
  }
  function printTable(table) {
    const box=node('div','print-table');
    const el=node('table','lesson-table');el.append(node('caption','',table.title||'Συγκριτικός πίνακας'));
    const head=node('thead'),headers=node('tr');table.columns.forEach(label=>{const th=node('th','',label);th.scope='col';headers.append(th);});head.append(headers);el.append(head);
    const body=node('tbody');table.rows.forEach(row=>{const tr=node('tr');row.forEach((text,i)=>{const cell=node(i===0?'th':'td','',text);if(i===0)cell.scope='row';tr.append(cell);});body.append(tr);});el.append(body);box.append(el,tableSource(table,true));return box;
  }
  function addReaderTable(table,state,page) {
    for(let i=0;i<table.rows.length;i++){
      const row=table.rows[i];state.body=createLeaf(page);state.contextHeading=row[0];
      state.body.append(node('p','eyebrow',sourceLabel(page)+' · πίνακας '+(i+1)+'/'+table.rows.length));
      if(i===0)state.body.append(node('p','table-caption',table.title||'Συγκριτικός πίνακας'));
      state.body.append(node('h3','table-object',row[0]));
      for(let j=1;j<row.length;j++){
        const field=node('dl','table-field');field.append(node('dt','',table.columns[j]),node('dd','',row[j]));addUnit(field,state,page);
      }
      if(i===table.rows.length-1)addUnit(tableSource(table),state,page);
    }
    delete state.contextHeading;
  }
  function sourceLabel(page) {return `${page.sourceTitle||data.title} · ενότητα ${page.sourcePage??page.number}`;}
  function createLeaf(page=null) {
    const leaf=node('article','leaf');leaf.style.display='block';leaf.style.visibility='hidden';
    if(page){leaf.dataset.sourceKey=(page.sourceBook||'')+'-'+(page.id||page.sourcePage||page.number);leaf.dataset.sectionId=page.id||'';}
    const body=node('div','leaf-body');leaf.append(body);
    const footer=node('div','folio');footer.append(node('span','',page?`${page.sourceTitle||data.title} · σ. ${page.sourcePage??page.number}`:'ΨΗΦΙΑΚΟ ΒΙΒΛΙΟ'),node('span','',String(leaves.length+1)));
    leaf.append(footer);$('book').append(leaf);leaves.push(leaf);return body;
  }
  function addUnit(unit,state,page) {
    state.body.append(unit);
    if(state.body.scrollHeight<=state.body.clientHeight+1)return;
    unit.remove();const heading=unit.matches('p,blockquote')&&state.body.lastElementChild?.matches('h3')?state.body.lastElementChild:null;
    if(heading)heading.remove();
    state.body=createLeaf(page);
    state.body.append(node('p','eyebrow',(page?sourceLabel(page):'Περιεχόμενα')+' · συνέχεια'));
    if(state.contextHeading)state.body.append(node('h3','table-object',state.contextHeading+' · συνέχεια'));
    if(heading)state.body.append(heading);
    state.body.append(unit);
    if(state.body.scrollHeight<=state.body.clientHeight+1)return;
    if(unit.matches('p,blockquote')){
      unit.remove();const words=unit.textContent.split(/\s+/);let cursor=0;
      while(cursor<words.length){
        let lo=1,hi=words.length-cursor,best=0;
        while(lo<=hi){const count=Math.floor((lo+hi)/2);const trial=richParagraph({kind:unit.tagName==='BLOCKQUOTE'?'blockquote':'p',text:words.slice(cursor,cursor+count).join(' '),hotspots:paragraphHotspots.get(unit)||[]});state.body.append(trial);const fits=state.body.scrollHeight<=state.body.clientHeight+1;trial.remove();if(fits){best=count;lo=count+1;}else hi=count-1;}
        if(!best)throw new Error('Το κείμενο δεν χωράει στη σελίδα.');
        state.body.append(richParagraph({kind:unit.tagName==='BLOCKQUOTE'?'blockquote':'p',text:words.slice(cursor,cursor+best).join(' '),hotspots:paragraphHotspots.get(unit)||[]}));cursor+=best;
        if(cursor<words.length){state.body=createLeaf(page);state.body.append(node('p','eyebrow',(page?sourceLabel(page):'Περιεχόμενα')+' · συνέχεια'));}
      }
    } else throw new Error('Η σελίδα χρειάζεται περισσότερο χώρο: '+page.number);
  }
  function cover(forPrint=false) {
    const box=node('div',forPrint?'print-cover':'');
    box.append(node('p','eyebrow','ΚΕΙΜΕΝΑ · ΕΙΚΟΝΕΣ · ΣΥΝΔΕΣΕΙΣ'));
    const h=node('h1','',data.title);box.append(h);
    const coverImage=data.coverImage||images(data.pages.find(p=>images(p).length)||{})[0]?.src;
    if(coverImage){const img=node('img',forPrint?'':'cover-image');img.src=coverImage;img.alt=data.coverCaption||data.title;box.append(img);}
    box.append(node('p','cover-subtitle',data.description||'Εικόνες, κείμενα και συνδέσεις σε ένα ανοιχτό βιβλίο.'));
    if(!forPrint){const end=node('div','cover-bottom');end.append(node('span','','ΜΑΘΗΜΑΤΑ'),node('span','',data.edition||'ΨΗΦΙΑΚΟ ΒΙΒΛΙΟ'));box.append(end);}return box;
  }
  function tocEntry(page,index,forPrint=false) {
    const el=node(forPrint?'a':'button','toc-entry');
    el.append(node('strong','',String(index+1).padStart(2,'0')));
    const label=node('span');label.append(node('b','',page.displayTitle||page.title),node('small','',sourceLabel(page)));el.append(label);
    if(forPrint){el.href='#'+sectionAnchor(page,index);const n=node('em');n.dataset.target='#'+sectionAnchor(page,index);el.append(n);}
    else {el.type='button';el.append(node('em','',String(chapterStarts[index]+1)));el.addEventListener('click',()=>{show(chapterStarts[index]);history.replaceState(null,'','#'+sectionAnchor(page,index));$('toc-dialog').close();});}
    return el;
  }
  async function waitImages(container) {
    await Promise.all([...container.querySelectorAll('img')].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});setTimeout(resolve,12000);}))); 
  }
  async function buildReader() {
    leaves.length=0;chapterStarts.length=0;$('toc-list').replaceChildren();
    $('book').replaceChildren();
    const coverBody=createLeaf();coverBody.parentElement.classList.add('cover');coverBody.parentElement.querySelector('.folio').remove();coverBody.replaceWith(cover());
    const tocState={body:createLeaf()};const tocBody=tocState.body;tocBody.append(node('p','eyebrow','ΜΑΘΗΜΑΤΑ & ΕΝΟΤΗΤΕΣ'),node('h2','','Περιεχόμενα'),node('p','toc-intro','Ένα μικρό ταξίδι από την εικόνα στο κείμενο και από τη σελίδα στο πρόσθετο υλικό.'));
    const tocEntries=data.pages.map((p,i)=>tocEntry(p,i));
    tocEntries.forEach((el,i)=>{const p=data.pages[i];if(p.lessonTitle&&(!i||p.lessonId!==data.pages[i-1].lessonId))addUnit(node('p','toc-intro',p.lessonTitle),tocState,null);addUnit(el,tocState,null);});
    for (let index=0;index<data.pages.length;index++) {
      const page=data.pages[index];chapterStarts.push(leaves.length);
      const state={body:createLeaf(page)};
      for(const unit of [node('p','eyebrow',sourceLabel(page)),node('div','chapter-number',String(index+1).padStart(2,'0')),node('h2','',page.displayTitle||page.title)])addUnit(unit,state,page);
      if(images(page).length)addUnit(figure(page,0),state,page);
      const actions=mediaActions(page);if(actions.children.length)addUnit(actions,state,page);
      if(page.audioUrl && isNotebook(safeUrl(page.audioUrl)))addUnit(node('p','media-note','Η ηχογράφηση ανοίγει στο NotebookLM. Ενδέχεται να ζητηθεί σύνδεση στον λογαριασμό σου.'),state,page);
      const blocks=textBlocks(page);
      if(blocks.length){if(page.title!==page.displayTitle)addUnit(node('p','source-title',cleanText(page.title)),state,page);for(const b of blocks){if(b.kind==='table')addReaderTable(b.table,state,page);else addUnit(richParagraph(b),state,page);}}
      const glossary=notes(page);if(glossary)addUnit(glossary,state,page);
      for(let i=1;i<images(page).length;i++){
        state.body=createLeaf(page);state.body.append(node('p','eyebrow',sourceLabel(page)+' · εικόνες'),node('h3','',page.displayTitle||page.title));addUnit(figure(page,i),state,page);
      }
      const endBlocks=textBlocks(page,'section_end'),endActions=mediaActions(page,false,'section_end');
      if(endBlocks.length||endActions.children.length){
        state.body=createLeaf(page);state.body.append(node('p','eyebrow',sourceLabel(page)+' · επίλογος'));
        for(const b of endBlocks)addUnit(richParagraph(b),state,page);
        if(endActions.children.length)addUnit(endActions,state,page);
      }
    }
    data.pages.forEach((p,i)=>{tocEntries[i].querySelector('em').textContent=chapterStarts[i]+1;$('toc-list').append(tocEntry(p,i));});
    await waitImages($('book'));
    leaves.forEach(el=>{el.style.display='';el.style.visibility='';});
    resize();const initial=data.pages.findIndex((p,i)=>'#'+sectionAnchor(p,i)===location.hash);show(initial>=0?chapterStarts[initial]:0);document.body.dataset.ready='true';
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
    const toc=node('section','print-toc');toc.append(node('p','eyebrow','ΜΑΘΗΜΑΤΑ & ΕΝΟΤΗΤΕΣ'),node('h2','','Περιεχόμενα'));data.pages.forEach((p,i)=>{if(p.lessonTitle&&(!i||p.lessonId!==data.pages[i-1].lessonId))toc.append(node('p','toc-intro',p.lessonTitle));toc.append(tocEntry(p,i,true));});source.append(toc);
    data.pages.forEach((page,index)=>{
      const section=node('section','print-section');section.id=sectionAnchor(page,index);
      section.append(node('p','eyebrow',sourceLabel(page)),node('h2','',page.displayTitle||page.title));
      if(images(page).length)section.append(figure(page,0,true));
      const actions=mediaActions(page,true);
      if(!images(page).length&&actions.children.length)section.append(actions);
      if((page.content||[]).length&&page.title!==page.displayTitle)section.append(node('p','source-title',cleanText(page.title)));
      for(const b of textBlocks(page))section.append(richParagraph(b,true));
      if(images(page).length&&actions.children.length)section.append(actions);
      if(page.audioUrl && isNotebook(safeUrl(page.audioUrl)))section.append(node('p','source-note','Η ηχογράφηση ανοίγει στο NotebookLM. Ενδέχεται να απαιτείται σύνδεση.'));
      if(images(page).length>1){const gallery=node('div','print-gallery');for(let i=1;i<images(page).length;i++)gallery.append(figure(page,i,true));section.append(gallery);}
      const glossary=notes(page);if(glossary)section.append(glossary);
      const endBlocks=textBlocks(page,'section_end'),endActions=mediaActions(page,true,'section_end');
      if(endBlocks.length||endActions.children.length){
        const epilogue=node('div','section-epilogue');
        for(const b of endBlocks)epilogue.append(richParagraph(b,true));
        if(endActions.children.length)epilogue.append(endActions);section.append(epilogue);
      }
      source.append(section);
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
    }else{
      const response=await fetch('data.json',{cache:'no-cache'});if(!response.ok)throw new Error('Δεν φορτώθηκε το δείγμα.');data=await response.json();
      if(data.bookId){
        const masterResponse=await fetch('book.json',{cache:'no-cache'});
        if(!masterResponse.ok)throw new Error('Δεν φορτώθηκε το πρωτότυπο του βιβλίου.');
        const master=await masterResponse.json();
        if(master.revision!==data.revision)throw new Error('Το βιβλίο ενημερώνεται. Δοκίμασε ξανά σε λίγο.');
        const sections=new Map(master.lessons.flatMap(l=>l.sections).map(s=>[s.id,s]));
        for(const page of data.pages){
          const section=sections.get(page.id);if(!section)continue;
          section.blocks.forEach((block,i)=>{if(block.placement&&page.content[i])page.content[i].placement=block.placement;});
          page.mediaPlacement=Object.fromEntries((section.media||[]).filter(m=>m.placement).map(m=>[m.url,{placement:m.placement,title:m.title}]));
        }
      }
    }
    if(!data.pages?.length)throw new Error('Δεν υπάρχουν σελίδες.');
    await Promise.all([document.fonts.load('32px Didot'),document.fonts.load('14px Serif')]);
    document.title=data.title;$('pdf-link').href='?view=print';$('download-demo').querySelector('a').href=data.pdfUrl||'book.pdf';
    await document.fonts.ready;
    // Load local images before measuring the reader, so image heights cannot change pagination.
    await Promise.all(data.pages.flatMap(p=>images(p)).map(asset=>new Promise(resolve=>{const img=new Image();img.onload=img.onerror=resolve;img.src=asset.src;setTimeout(resolve,12000);}))); 
    if(printMode)await buildPrint();else {resize();await buildReader();}
  }
  // Kept public for a reusable viewer and normalization regression checks.
  window.Album={youtube,imageUrl,safeUrl,textBlocks,mediaList,get data(){return data;},get leaves(){return leaves;},show};
  load().catch(error=>{document.querySelector('main').replaceChildren(node('p','error-message',error.message));console.error(error);document.body.dataset.error=error.message;});
})();
