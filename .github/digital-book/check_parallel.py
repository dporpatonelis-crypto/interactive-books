from pathlib import Path
import csv,copy,hashlib,json,re,sys,unicodedata
import pymupdf
from pypdf import PdfReader

root=Path("Digital_Lessons")
read=lambda path:json.loads((root/path).read_text())
book=read("book.json")
old=read("history/revision-0026.json")
source=read("sources/fall-genesis-epiphanius-reference.json")
sid="fall-restoration-parallel-texts"
lesson=next(l for l in book["lessons"] if l["id"]=="lesson-fall-restoration")
section=next(s for s in lesson["sections"] if s["id"]==sid)
assert book["revision"]==27 and old["revision"]==26
ids=[s["id"] for s in lesson["sections"]]
assert ids.index("fall-restoration-thorns")+1==ids.index(sid)
assert ids.index(sid)+1==ids.index("fall-restoration-anastasis")
unchanged=copy.deepcopy(book)
unchanged["revision"]=old["revision"];unchanged["updated_at"]=old["updated_at"]
next(l for l in unchanged["lessons"] if l["id"]==lesson["id"])["sections"]=[s for s in lesson["sections"] if s["id"]!=sid]
assert unchanged==old,"Existing content or media changed"
table=next(b for b in section["blocks"] if b["kind"]=="table")
expected=[["«"+r["epiphanius"]+"»","Γεν. "+r["verse"]+" · "+r["topic"]+"\n«"+r["genesis"]+"»"] for r in source["rows"]]
assert len(expected)==10 and table["columns"]==source["columns"] and table["rows"]==expected
with (root/table["source_file"]).open(newline="") as handle:
    csv_rows=list(csv.reader(handle))
assert csv_rows==[table["columns"],*expected]
assert section["references"]==source["sources"]
print(json.dumps({"source_pairs":10,"source_cells":20,"all_previous_content_unchanged":True}))
if "--source-only" in sys.argv:sys.exit(0)

data=read("data.json");meta=read("pdf-meta.json")
digest=hashlib.sha256((root/"book.json").read_bytes()).hexdigest()
assert data["revision"]==meta["revision"]==27
assert data["sourceDigest"]==meta["sourceDigest"]==digest
assert hashlib.sha256((root/"book.pdf").read_bytes()).hexdigest()==meta["pdfSha256"]
old_data=json.loads(Path(".github/digital-book/base-data.json").read_text())
old_pages={p["id"]:p for p in old_data["pages"]}
assert len(data["pages"])==len(old_pages)+1==46
for page in data["pages"]:
    if page["id"]==sid:continue
    previous=old_pages[page["id"]]
    keep=lambda p:{k:v for k,v in p.items() if k not in ["number","sourcePage"]}
    assert keep(page)==keep(previous),("Existing generated content changed",page["id"])
dom=read("qa/revision-0027-dom.json")
assert dom["expected_cells"]==dom["rendered_cells_verified"]==20
assert all(c["source_cells_verified"]==20 and not c["leaf_overflow"] and not c["page_overflow"] for c in dom["reader_checks"])

fold=lambda s:re.sub(r"\s+","",unicodedata.normalize("NFC",s).replace("\u00ad",""))
doc=pymupdf.open(root/"book.pdf")
text=[p.get_text() for p in doc]
folded=[fold(t) for t in text]
first=next(i for i,t in enumerate(folded) if fold("Στον Λόγο του Μεγάλου Σαββάτου, που παραδίδεται") in t)
last=next(i for i,t in enumerate(folded) if i>first and fold("Οι κήποι της Εδέμ, της Γεθσημανή") in t)-1
assert first<=last
pdf_reader=PdfReader(root/"book.pdf")
pdf_text=fold(" ".join(p.extract_text() or "" for p in pdf_reader.pages))
cells=[c for row in expected for c in row]
missing=[c for c in cells if fold(c) not in pdf_text]
assert not missing,("PDF missing cells",missing)
pair_pages=[]
for row in expected:
    indexes=[i for i in range(first,last+1) if all(fold(cell) in folded[i] for cell in row)]
    assert indexes,("Pair split or absent",row)
    pair_pages.append(indexes[0]+1)
qa=root/"qa";qa.mkdir(exist_ok=True)
previews=[]
for index in range(first,last+1):
    page=doc[index]
    assert page.rect.width>page.rect.height
    for block in page.get_text("blocks"):
        if block[6]==0:
            assert block[0]>=-1 and block[1]>=-1 and block[2]<=page.rect.width+1 and block[3]<=page.rect.height+1,("Text outside page",index+1,block[:4])
    name=f"revision-0027-page-{index+1:03d}.png"
    page.get_pixmap(matrix=pymupdf.Matrix(1.25,1.25)).save(qa/name)
    previews.append({"page":index+1,"image":"qa/"+name})
links=[link for page in doc for link in page.get_links()]
internal=[link for link in links if link.get("page",-1)>=0]
assert len(internal)>=len(data["pages"])
heading_pages=[i for i in range(max(0,first-1),first+1) if fold(section["title"]) in folded[i]]
new_contents_links=[{"from_page":i+1,"target_page":link.get("page",-1)+1,"text":doc[i].get_textbox(link["from"])} for i,page in enumerate(doc) for link in page.get_links() if fold(section["title"]) in fold(doc[i].get_textbox(link["from"]))]
debug={"intro_page":first+1,"heading_pages":[i+1 for i in heading_pages],"new_contents_links":new_contents_links,"nearby_pages":[{"page":i+1,"text":text[i][:1200]} for i in range(max(0,first-2),min(len(doc),first+2))]}
(qa/"revision-0027-destinations.json").write_text(json.dumps(debug,ensure_ascii=False,indent=2)+"\n")
print(json.dumps(debug,ensure_ascii=False))
assert new_contents_links and any(link["target_page"]-1 in heading_pages for link in new_contents_links),"New contents link does not reach its section heading"
external={link.get("uri") for link in links}
assert all(source["url"] in external for source in section["references"]),"Source PDF links missing"
report={"revision":27,"sourceDigest":digest,"pdfSha256":meta["pdfSha256"],"source_cells":20,"rendered_cells_verified":20,"pdf_cells_verified":20,"pairs":10,"pair_pdf_pages":pair_pages,"page_count":len(doc),"new_section_pages":[first+1,last+1],"internal_pdf_links":len(internal),"all_previous_content_and_media_unchanged":True,"reader_checks":dom["reader_checks"],"previews":previews}
(qa/"revision-0027.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
print(json.dumps(report,ensure_ascii=False))
