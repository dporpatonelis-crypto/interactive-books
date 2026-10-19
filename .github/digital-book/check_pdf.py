from pathlib import Path
import json, hashlib
import fitz
from pypdf import PdfReader
root=Path("Digital_Lessons")
book=json.loads((root/"book.json").read_text())
data=json.loads((root/"data.json").read_text())
meta=json.loads((root/"pdf-meta.json").read_text())
assert book["revision"]==data["revision"]==meta["revision"]==24
digest=hashlib.sha256((root/"book.json").read_bytes()).hexdigest()
assert digest==data["sourceDigest"]==meta["sourceDigest"]
assert hashlib.sha256((root/"book.pdf").read_bytes()).hexdigest()==meta["pdfSha256"]
url="https://drive.google.com/file/d/11wnDMCi8mRrV3XhX5CI74E_0Xcujxm3E/view?usp=sharing"
reader=PdfReader(root/"book.pdf")
external=[(i+1,str(a.get_object().get("/A",{}).get("/URI",""))) for i,p in enumerate(reader.pages) for a in p.get("/Annots",[])]
links=[p for p,u in external if u==url]
assert len(links)==2,("Expected one exact selected link in each section",links)
doc=fitz.open(root/"book.pdf")
qa=root/"qa";qa.mkdir(exist_ok=True)
captured={}
for label,needle in [("jerusalem","Το αυτόνομο quiz"),("pentecost","Στο ίδιο αυτόνομο HTML")]:
    found=[i for i,p in enumerate(doc) if needle in p.get_text()]
    assert found,(label,"Missing description in PDF")
    index=found[-1]
    doc[index].get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save(qa/("revision-0024-"+label+".png"))
    captured[label]={"page":index+1,"image":"qa/revision-0024-"+label+".png"}
report={"revision":24,"sourceDigest":digest,"pdfSha256":meta["pdfSha256"],"page_count":len(doc),"exact_quiz_link_count":len(links),"exact_quiz_link_pages":links,"previews":captured,"internal_pdf_links":sum(1 for p in doc for l in p.get_links() if l.get("page",-1)>=0)}
assert report["internal_pdf_links"]>0,"Missing contents destinations"
(qa/"revision-0024.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
print(json.dumps(report,ensure_ascii=False))
