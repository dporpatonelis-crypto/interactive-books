from pathlib import Path
import json,re,hashlib,sys
import pymupdf
from pypdf import PdfReader
root=Path("Digital_Lessons")
read=lambda file:json.loads((root/file).read_text())
book=read("book.json")
old=read("history/revision-0024.json")
source=read("sources/creation-world-source.json")
lesson=next(l for l in book["lessons"] if l["id"]=="lesson-creation-world")
assert book["revision"]==25 and old["revision"]==24
ids=[l["id"] for l in book["lessons"]]
assert ids.index(lesson["id"])+1==ids.index("lesson-fall-restoration")
assert [l for l in book["lessons"] if l["id"]!=lesson["id"]]==old["lessons"]
assert [s["id"] for s in lesson["sections"]]==["creation-world","creation-image-likeness","creation-restoration-christ"]
tables=[b for s in lesson["sections"] for b in s["blocks"] if b["kind"]=="table"]
assert [(len(t["rows"]),len(t["columns"])) for t in tables]==[(6,3),(7,3)]
for actual,expected in zip(tables,source["tables"]):
    assert actual["columns"]==expected["columns"] and actual["rows"]==expected["rows"]
cells=[c for t in tables for row in t["rows"] for c in row]
assert len(cells)==39
narrative=" ".join(b["text"] for s in lesson["sections"] for b in s["blocks"] if b["kind"]=="text")
word_count=len(narrative.split())
assert 350<=word_count<=450
assert not re.search(r"ανδριάντ|\bVR\b|\bXR\b|Interaction|3D",json.dumps(lesson,ensure_ascii=False),re.I)
assert source["source_sha256"]=="9b0505ac967dbf2df420c76ff0bc15da0f6edf9553957cb04cf2faa4bac46a26"
print(json.dumps({"source_cells":39,"narrative_words":word_count,"old_lessons_unchanged":True}))
if "--source-only" in sys.argv:sys.exit(0)
data=read("data.json");meta=read("pdf-meta.json")
digest=hashlib.sha256((root/"book.json").read_bytes()).hexdigest()
assert data["revision"]==meta["revision"]==25
assert data["sourceDigest"]==meta["sourceDigest"]==digest
assert hashlib.sha256((root/"book.pdf").read_bytes()).hexdigest()==meta["pdfSha256"]
assert len(data["pages"])==45
qa=root/"qa";qa.mkdir(exist_ok=True)
dom=read("qa/revision-0025-dom.json")
assert dom["expected_cells"]==dom["rendered_cells_verified"]==39
doc=pymupdf.open(root/"book.pdf")
norm=lambda s:re.sub(r"\s+"," ",s.replace("\u00ad","")).strip()
page_text=[norm(p.get_text()) for p in doc]
first=next(i for i,t in enumerate(page_text) if "Η πατερική παράδοση βλέπει τη δημιουργία" in t)
last=next(i for i,t in enumerate(page_text) if i>first and "Η Γένεση παρουσιάζει τον άνθρωπο πλασμένο" in t)-1
assert first<=last
previews=[]
for index in range(first,last+1):
    page=doc[index]
    assert page.rect.width>page.rect.height
    for block in page.get_text("blocks"):
        if block[6]==0:
            assert block[0]>=-1 and block[1]>=-1 and block[2]<=page.rect.width+1 and block[3]<=page.rect.height+1,("Text outside PDF page",index+1,block[:4])
    name=f"revision-0025-page-{index+1:03d}.png"
    page.get_pixmap(matrix=pymupdf.Matrix(1.25,1.25)).save(qa/name)
    previews.append({"page":index+1,"image":"qa/"+name})
reader=PdfReader(root/"book.pdf")
pdf_text=norm(" ".join(page.extract_text() or "" for page in reader.pages))
missing=[cell for cell in cells if norm(cell) not in pdf_text]
assert not missing,("PDF extraction missing cells",missing)
destinations=sum(1 for p in doc for link in p.get_links() if link.get("page",-1)>=0)
assert destinations>=45
report={"revision":25,"sourceDigest":digest,"pdfSha256":meta["pdfSha256"],"source_cells":39,"rendered_cells_verified":39,"pdf_cells_verified":39,"narrative_words":word_count,"source_pdf_sha256":source["source_sha256"],"page_count":len(doc),"new_lesson_pages":[first+1,last+1],"internal_pdf_links":destinations,"old_lessons_unchanged":True,"previews":previews}
(qa/"revision-0025.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
print(json.dumps(report,ensure_ascii=False))
