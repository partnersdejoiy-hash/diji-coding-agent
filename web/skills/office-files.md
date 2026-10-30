---
name: office-files
description: Generate and read PDF, DOCX, XLSX and PPTX files.
---
# PDF, Word, Excel, PowerPoint

Pick the library for the runtime:
- **Browser / Node**: `pdf-lib` (create/edit PDF), `pdfjs-dist` (read PDF text), `docx` (Word), `exceljs` or `SheetJS (xlsx)` (Excel), `pptxgenjs` (PowerPoint).
- **Python**: `reportlab` or `weasyprint` (PDF), `pypdf` (read/merge/split), `python-docx`, `openpyxl`, `python-pptx`, `pandas` for CSV/Excel analysis.

Rules:
- Excel: real formulas instead of hard-coded results, typed cells (numbers as numbers, dates as dates), frozen header row, column widths set.
- Word/PDF: proper heading styles so a table of contents works, page numbers, consistent fonts.
- PowerPoint: one idea per slide, large type, speaker notes for detail.
- In the browser, trigger downloads with a Blob and an object URL; in Node, write to disk and print the path.
