"""PoC bước 1: kiểm tra PyMuPDF đọc slide thật.

Chạy: uv run python poc/pdf_check.py <file1.pdf> [file2.pdf ...]
Không gọi API nào. In ra cho từng file: số trang, trang trống, trang có ký tự lỗi,
và tiêu đề + đoạn đầu của vài trang để soát bằng mắt dấu tiếng Việt.
"""

import sys
import unicodedata
import re
import pymupdf
from pathlib import Path

EMPTY_CHARS = 20  # ít hơn chừng này ký tự thì coi là trang trống (slide ảnh, PDF scan)
SAMPLE_PAGES = 5
SPACE_GAP = 0.15  # khoảng trống giữa 2 ký tự > 0,15 × cỡ chữ thì coi là thiếu dấu cách

# ponytail: Chuong2 nhúng font Palatino Linotype sai bảng mã (à→|, â→}, á→{); chỉ sửa đúng font này,
# gặp font lỗi khác thì thêm bảng riêng, hoặc chuyển sang OCR trang đó.
_PALATINO_FIX = str.maketrans({"|": "à", "}": "â", "{": "á"})

_TONES = "\u0300\u0301\u0303\u0309\u0323"  # dấu huyền, sắc, ngã, hỏi, nặng (dạng tách rời)
# Vần oa/oe/uy ở cuối từ, dấu thanh đặt trên chữ thứ hai (kiểu mới): "hoá", "khoẻ", "thuỷ".
# Không bắt khi đứng sau q ("quý" đúng sẵn), cũng không bắt khi còn chữ hay dấu phụ phía sau ("hoàn", "hoặc").
_NEW_STYLE = re.compile(rf"(?<!q)(o[ae]|uy)([{_TONES}])(?![\w\u0300-\u036f])", re.IGNORECASE)


def normalize_text(text: str) -> str:
    # ponytail: chỉ xử lý vị trí dấu của oa/oe/uy; chưa gộp i/y ("kĩ"/"kỹ", "quí"/"quý"),
    # thêm khi golden set cho thấy câu hỏi trượt vì lỗi đó.
    text = unicodedata.normalize("NFD", text)  # tách "á" thành "a" + dấu sắc để dời dấu được
    text = _NEW_STYLE.sub(lambda m: m[1][0] + m[2] + m[1][1], text)  # "o a ́" → "o ́ a"
    return unicodedata.normalize("NFC", text)


def page_text(page: pymupdf.Page) -> str:
    # Slide xuất từ PowerPoint bỏ mất ký tự dấu cách sau chữ có dấu thanh ("ngữdùng"),
    # nhưng vị trí chữ vẫn đúng. Ghép lại từng dòng theo tọa độ và tự chèn dấu cách.
    lines = []
    for block in page.get_text("rawdict")["blocks"]:
        for line in block.get("lines", []):  # block ảnh không có "lines"
            out, prev = [], None
            for span in line["spans"]:
                fix = "Palatino" in span["font"]
                for c in span["chars"]:
                    gap = c["bbox"][0] - prev["bbox"][2] if prev else 0.0
                    if prev and " " not in (prev["c"], c["c"]) and gap > SPACE_GAP * span["size"]:
                        out.append(" ")
                    out.append(c["c"].translate(_PALATINO_FIX) if fix else c["c"])
                    prev = c
            lines.append("".join(out))
    return normalize_text("\n".join(lines))


def page_title(page: pymupdf.Page) -> str:
    # ponytail: lấy dòng có cỡ chữ lớn nhất làm tiêu đề; slide không theo khuôn sẽ đoán sai,
    # khi đó thử dòng đầu tiên của trang.
    best_size, best_text = 0.0, ""
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(s["text"].translate(_PALATINO_FIX) if "Palatino" in s["font"] else s["text"]
                for s in line["spans"]).strip()
            size = max((s["size"] for s in line["spans"]), default=0)
            if text and not text.isdigit() and size > best_size:  # bỏ qua số trang
                best_size, best_text = size, text
    return best_text


def is_broken(text: str) -> bool:
    # Font nhúng thiếu bảng mã sẽ ra ký tự thay thế hoặc ký tự vùng riêng (Private Use).
    return any(c == "�" or unicodedata.category(c) == "Co" for c in text)

def pdf_paths(args: list[str]) -> list[str]:
    # Tham số có thể là file hoặc thư mục; thư mục thì lấy mọi file .pdf bên trong, sắp theo tên.
    paths = []
    for arg in args:
        p = Path(arg)
        paths += sorted(str(f) for f in p.glob("*.pdf")) if p.is_dir() else [arg]
    if not paths:
        sys.exit(f"Không tìm thấy file PDF nào trong: {args}")
    return paths


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
    for raw, want in [("mã hoá", "mã hóa"), ("HOÁ", "HÓA"), ("khoẻ", "khỏe"), ("thuỷ", "thủy"), ("hoàn", "hoàn"), ("hoặc", "hoặc"), ("quý", "quý"), ("huỳnh", "huỳnh"), ("hóa", "hóa")]:
        assert normalize_text(raw) == want, (raw, normalize_text(raw))
    if len(sys.argv) < 2:
        sys.exit("Cách dùng: uv run python poc/pdf_check.py <file.pdf> ...")
    for p in pdf_paths(sys.argv[1:]):
        check(p)
