from typing import List 
import pdfplumber


def extract_pdf_text(file_path: str) -> str:
    """Extract plain text from a PDF file."""
    with pdfplumber.open(file_path) as pdf:
        pages = [page.extract_text() or "" for page in pdf.pages]
    return "\n".join(pages).strip()


def chunk_text(text: str, chunk_size: int = 1000) -> List[str]:
    """Naive character-based chunking"""
    if not text:
        return []
    return [text[i : i + chunk_size] for i in range(0, len(text), chunk_size)]
