from io import BytesIO
from pathlib import Path

import fitz
from docx import Document

from .utils import normalize_text


def extract_text_from_upload(filename: str, file_bytes: bytes):
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        return extract_text_from_pdf(file_bytes)

    if ext == ".docx":
        return extract_text_from_docx(file_bytes)

    raise ValueError("Unsupported file type")


def extract_text_from_pdf(file_bytes: bytes):
    doc = fitz.open(stream=file_bytes, filetype="pdf")

    pages = []

    for page in doc:
        pages.append(page.get_text("text"))

    return normalize_text("\n".join(pages))



def extract_text_from_docx(file_bytes: bytes):
    doc = Document(BytesIO(file_bytes))

    paragraphs = [
        p.text for p in doc.paragraphs if p.text.strip()
    ]

    return normalize_text("\n".join(paragraphs))