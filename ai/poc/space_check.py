"""In từng ký tự và khoảng cách tới ký tự trước, trong dòng chứa một từ bị dính.

Chạy: uv run python poc/space_check.py <file.pdf> <số trang> <từ bị dính>
"""

import sys
import unicodedata

import pymupdf

sys.stdout.reconfigure(encoding="utf-8")
path, page_no, word = sys.argv[1], int(sys.argv[2]), sys.argv[3]
page = pymupdf.open(path)[page_no - 1]

raw = page.get_text()
print("Có dấu tách rời (khác NFC):", raw != unicodedata.normalize("NFC", raw))

for block in page.get_text("rawdict")["blocks"]:
    for line in block.get("lines", []):
        for span in line["spans"]:
            chars = span["chars"]
            if word not in unicodedata.normalize("NFC", "".join(c["c"] for c in chars)):
                continue
            print(f"\nfont={span['font']} size={span['size']:.1f}")
            prev = None
            for c in chars:
                gap = c["bbox"][0] - prev["bbox"][2] if prev else 0.0
                print(f"{c['c']!r:6} U+{ord(c['c']):04X}  gap={gap:6.2f}")
                prev = c
