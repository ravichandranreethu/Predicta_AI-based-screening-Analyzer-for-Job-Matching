import tempfile
from pdfminer.high_level import extract_text as pdf_text
from docx import Document

def read_text_from_upload(uploaded_file, filename):
    ext = (filename.rsplit(".",1)[-1] or "").lower()
    data = uploaded_file.read()
    if ext == "txt":
        try:
            return data.decode("utf-8")
        except:
            return data.decode("latin-1", errors="ignore")
    if ext in ("docx", "doc"):
        # python-docx only reads .docx reliably
        try:
            import io
            buf = io.BytesIO(data)
            doc = Document(buf)
            return "\n".join(p.text for p in doc.paragraphs)
        except Exception as e:
            raise ValueError("Failed to read DOCX: %s" % e)
    if ext == "pdf":
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(data); tmp.flush()
            return pdf_text(tmp.name)
    raise ValueError(f"Unsupported file type: .{ext}")
