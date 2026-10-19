#!/usr/bin/env python3
"""Build the public reader manifest from an editable book.json; never rewrite the master."""
import argparse, json, hashlib, re
from pathlib import Path

def validate(book, root):
    assert book.get('schema_version') == 1, 'Unsupported book schema'
    assert re.fullmatch(r'[A-Za-z0-9_-]+', book['book_id']), 'Invalid book id'
    assert isinstance(book.get('title'), str) and book['title'].strip(), 'Missing title'
    assert isinstance(book.get('revision'), int) and book['revision'] >= 1, 'Invalid revision'
    cover_asset=book.get('cover',{}).get('asset')
    if cover_asset:
        asset=(root/cover_asset).resolve()
        assert asset.is_relative_to(root.resolve()) and asset.is_file(), 'Missing or unsafe cover asset'
    ids=set();lesson_ids=set()
    for lesson in book['lessons']:
        assert re.fullmatch(r'[A-Za-z0-9_-]+',lesson['id']) and lesson['id'] not in lesson_ids, 'Lesson ids must be unique and stable'
        lesson_ids.add(lesson['id'])
        for section in lesson['sections']:
            sid=section['id'];assert re.fullmatch(r'[A-Za-z0-9_-]+',sid) and sid not in ids, 'Section ids must be unique and stable';ids.add(sid)
            assert section['title'].strip(), 'Missing section title'
            for b in section['blocks']:
                assert b['kind'] in ['text','list_item','heading','quote','source','table'], 'Unknown block kind'
                if b['kind']=='table':
                    assert isinstance(b.get('columns'),list) and b['columns'] and all(isinstance(c,str) for c in b['columns']), 'Table needs text columns'
                    assert isinstance(b.get('rows'),list) and b['rows'] and all(isinstance(row,list) and len(row)==len(b['columns']) and all(isinstance(cell,str) for cell in row) for row in b['rows']), 'Table rows must match columns'
                    if b.get('source_file'):
                        asset=(root/b['source_file']).resolve()
                        assert asset.is_relative_to(root.resolve()) and asset.is_file(), 'Missing or unsafe table source'
                else:assert isinstance(b['text'],str), 'Block text must be a string'
            for m in section.get('media',[]):
                assert isinstance(m.get('media_id'),str) and m['media_id'].strip(), 'Media needs a library id'
                assert m['type'] in ['image','youtube','video','audio','slides','website','drive','document'], 'Unknown media type'
                assert m.get('url','').startswith(('https://','http://')), 'Media needs a source URL'
                if m.get('asset'):
                    asset=(root/m['asset']).resolve()
                    assert asset.is_relative_to(root.resolve()) and asset.is_file(), 'Missing or unsafe local asset'
    assert ids, 'No sections'

def build(path):
    path=Path(path);root=path.parent;book=json.loads(path.read_text());validate(book,root)
    pages=[]
    for li,lesson in enumerate(book['lessons'],1):
        for si,section in enumerate(lesson['sections'],1):
            page={'id':section['id'],'number':len(pages)+1,'type':'content','title':section['title'],'displayTitle':section['title'],'sourceBook':book['book_id'],'sourceTitle':f'Μάθημα {li}','sourcePage':si,'lessonId':lesson['id'],'lessonTitle':lesson['title'],'sourceUrl':lesson.get('source_url',''),'content':[],'mediaRefs':[]}
            for block in section['blocks']:
                if block['kind']=='table':page['content'].append({'kind':'table','table':{k:v for k,v in block.items() if k!='kind'}})
                elif block['kind'] in ['quote','source']:page['content'].append({block['kind']:block['text']})
                else:page['content'].append({'text':('• ' if block['kind']=='list_item' else '')+block['text'],'kind':block['kind'],'paragraphBoundary':True,'hotspots':block.get('hotspots',[])})
            local=[]
            for m in section.get('media',[]):
                page['mediaRefs'].append(m['media_id'])
                field={'youtube':'videoId','video':'videoUrl','audio':'audioUrl','slides':'slidesUrl','website':'webUrl','drive':'driveUrl','document':'driveUrl'}.get(m['type'])
                if m['type']=='image':
                    page.setdefault('images',[]).append(m['url'])
                    local.append({'src':m.get('asset',m['url']),'original':m['url'],'mediaId':m['media_id'],'caption':m.get('caption',m.get('title','')),'retained':bool(m.get('asset'))})
                    page['imageCaption']=m.get('caption',m.get('title',''))
                elif field:
                    if field not in page:page[field]=m['url']
                    else:page.setdefault('extraMedia',[]).append(m)
            if local:page['localImages']=local
            pages.append(page)
    digest=hashlib.sha256(path.read_bytes()).hexdigest()
    result={'title':book['title'],'description':book.get('description',''),'bookId':book['book_id'],'revision':book['revision'],'sourceDigest':digest,'coverImage':book.get('cover',{}).get('asset',''),'coverCaption':book.get('cover',{}).get('caption',''),'edition':'ΠΡΟΣΩΠΙΚΟ ΨΗΦΙΑΚΟ ΒΙΒΛΙΟ','pdfUrl':'book.pdf','publicUrl':book.get('publishing',{}).get('public_url',''),'pages':pages}
    output=root/'data.json';content=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if not output.exists() or output.read_text()!=content:output.write_text(content)
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('book');args=p.parse_args();d=build(args.book)
    print(json.dumps({'book':d['bookId'],'revision':d['revision'],'sections':len(d['pages']),'sourceDigest':d['sourceDigest']},ensure_ascii=False))
