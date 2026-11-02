"""PoC bước 1: kiểm tra PyMuPDF đọc slide thật.

Chạy: uv run python poc/pdf_check.py <file1.pdf> [file2.pdf ...]
Không gọi API nào. In ra cho từng file: số trang, trang trống, trang có ký tự lỗi,
và tiêu đề + đoạn đầu của vài trang để soát bằng mắt dấu tiếng Việt.
"""

import sys
import unicodedata

import pymupdf

EMPTY_CHARS = 20  # ít hơn chừng này ký tự thì coi là trang trống (slide ảnh, PDF scan)
SAMPLE_PAGES = 5
SPACE_GAP = 0.15  # khoảng trống giữa 2 ký tự > 0,15 × cỡ chữ thì coi là thiếu dấu cách


def page_text(page: pymupdf.Page) -> str:
    # Slide xuất từ PowerPoint bỏ mất ký tự dấu cách sau chữ có dấu thanh ("ngữdùng"),
    # nhưng vị trí chữ vẫn đúng. Ghép lại từng dòng theo tọa độ và tự chèn dấu cách.
    lines = []
    for block in page.get_text("rawdict")["blocks"]:
        for line in block.get("lines", []):  # block ảnh không có "lines"
            out, prev = [], None
            for span in line["spans"]:
                for c in span["chars"]:
                    gap = c["bbox"][0] - prev["bbox"][2] if prev else 0.0
                    if prev and " " not in (prev["c"], c["c"]) and gap > SPACE_GAP * span["size"]:
                        out.append(" ")
                    out.append(c["c"])
                    prev = c
            lines.append("".join(out))
    return unicodedata.normalize("NFC", "\n".join(lines))


def page_title(page: pymupdf.Page) -> str:
    # ponytail: lấy dòng có cỡ chữ lớn nhất làm tiêu đề; slide không theo khuôn sẽ đoán sai,
    # khi đó thử dòng đầu tiên của trang.
    best_size, best_text = 0.0, ""
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(s["text"] for s in line["spans"]).strip()
            size = max((s["size"] for s in line["spans"]), default=0)
            if text and size > best_size:
                best_size, best_text = size, text
    return best_text


def is_broken(text: str) -> bool:
    # Font nhúng thiếu bảng mã sẽ ra ký tự thay thế hoặc ký tự vùng riêng (Private Use).
    return any(c == "�" or unicodedata.category(c) == "Co" for c in text)


def check(path: str) -> None:
    doc = pymupdf.open(path)
    empty, broken, total_chars = [], [], 0
    for page in doc:
        # NFC: gộp chữ + dấu tách rời thành một ký tự, để full-text search và embedding khớp nhau.
        text = page_text(page)
        total_chars += len(text)
        if len(text.strip()) < EMPTY_CHARS:
            empty.append(page.number + 1)
        if is_broken(text):
            broken.append(page.number + 1)

    print(f"\n=== {path}")
    print(f"Số trang: {doc.page_count} · trung bình {total_chars // max(doc.page_count, 1)} ký tự/trang")
    print(f"Trang trống ({len(empty)}): {empty}")
    print(f"Trang có ký tự lỗi ({len(broken)}): {broken}")

    step = max(doc.page_count // SAMPLE_PAGES, 1)
    for i in range(0, doc.page_count, step)[:SAMPLE_PAGES]:
        page = doc[i]
        body = " ".join(page_text(page).split())
        print(f"\n--- Trang {i + 1} · tiêu đề: {page_title(page)!r}")
        print(body[:300])


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # console Windows mặc định cp1252, không in được tiếng Việt
    if len(sys.argv) < 2:
        sys.exit("Cách dùng: uv run python poc/pdf_check.py <file.pdf> ...")
    for p in sys.argv[1:]:
        check(p)
