"""PoC bước 2: embedding Gemini với câu hỏi tiếng Việt, đo Hit@k và tìm ngưỡng cosine.

Chạy: uv run --env-file .env python poc/embed_check.py poc/questions.jsonl <file1.pdf> [file2.pdf ...]
Gọi Gemini 2 request: một lô cho các trang, một lô cho các câu hỏi.
"""

import json
import math
import sys
import hashlib
from pathlib import Path
import time
from pdf_check import EMPTY_CHARS

import pymupdf
from google import genai
from google.genai import types

from pdf_check import normalize_text, page_text, page_title, pdf_paths

MODEL = "gemini-embedding-2"
DIM = 768
TOP_K = 5
BATCH = 20       # đoạn mỗi request: lô 80–100 bị 503 / ngắt kết nối, lô 38 chạy được
PER_MINUTE = 80  # free tier: 100 đoạn/phút (đếm theo đoạn), chừa dư 20
CACHE = Path(__file__).with_name("page_vecs.json")


def embed(client: genai.Client, texts: list[str]) -> list[list[float]]:
    vecs = []
    for i in range(0, len(texts), BATCH):
        lot = texts[i:i + BATCH]
        # Mỗi đoạn một Content riêng: truyền list[str] thì SDK gộp tất cả thành 1 vector.
        contents = [types.Content(parts=[types.Part(text=t)]) for t in lot]
        res = client.models.embed_content(
            model=MODEL, contents=contents, config=types.EmbedContentConfig(output_dimensionality=DIM)
        )
        assert len(res.embeddings) == len(lot), "số vector trả về khác số đoạn gửi đi"
        vecs += [e.values for e in res.embeddings]
    return vecs


def embed_cached(client: genai.Client, texts: list[str]) -> list[list[float]]:
    # Đoạn nào đã có vector (cùng hash nội dung) thì dùng lại; chỉ gửi Gemini đoạn mới hoặc đã đổi.
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    keys = [hashlib.sha256(t.encode()).hexdigest() for t in texts]
    missing = list({k: t for k, t in zip(keys, texts) if k not in cache}.items())  # bỏ trùng
    for i in range(0, len(missing), PER_MINUTE):
        if i:
            time.sleep(61)  # ponytail: chờ cứng qua cửa sổ 1 phút; ingest thật đọc retryDelay khi gặp 429
        group = missing[i:i + PER_MINUTE]
        for (k, _), vec in zip(group, embed(client, [t for _, t in group])):
            cache[k] = vec
        # Lưu sau mỗi nhóm: lỗi giữa chừng thì lần chạy sau tiếp tục, không tốn lại lượt đã dùng.
        CACHE.write_text(json.dumps(cache), encoding="utf-8")
        print(f"  đã embed {i + len(group)}/{len(missing)} đoạn", file=sys.stderr)
    return [cache[k] for k in keys]


def cosine(a: list[float], b: list[float]) -> float:
    # Tự chia cho độ dài: vector bị cắt còn 768 chiều có thể chưa được chuẩn hóa về độ dài 1.
    dot = sum(x * y for x, y in zip(a, b))
    return dot / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))


def main(questions_path: str, pdfs: list[str]) -> None:
    pages = []  # (nhãn "chuong1.pdf:7", chuỗi gửi đi embedding); mỗi trang một chunk
    for path in pdfs:
        for page in pymupdf.open(path):
            text = page_text(page)
            if len(text.strip()) < EMPTY_CHARS:
                continue  # trang trống (bìa ảnh): vector "rỗng" gần với mọi câu hỏi, chen vào top-k
            title = normalize_text(page_title(page))
            pages.append((f"{Path(path).name.lower()}:{page.number + 1}", f"title: {title} | text: {text}"))

    lines = Path(questions_path).read_text(encoding="utf-8").splitlines()
    questions = [json.loads(line) for line in lines if line.strip()]

    client = genai.Client()  # tự đọc GEMINI_API_KEY từ biến môi trường
    q_texts = [f"task: search result | query: {normalize_text(q['question'])}" for q in questions]
    # Gộp trang và câu hỏi vào một lần gọi để nhịp 80 đoạn/phút tính chung cho cả hai.
    vecs = embed_cached(client, [text for _, text in pages] + q_texts)
    page_vecs, q_vecs = vecs[:len(pages)], vecs[len(pages):]


    hit1 = hitk = 0
    in_tops, out_tops = [], []
    for q, qv in zip(questions, q_vecs):
        ranked = sorted(((cosine(qv, pv), label) for (label, _), pv in zip(pages, page_vecs)), reverse=True)[:TOP_K]
        expected = set(q["expected_pages"])
        top1 = ranked[0][0]
        if expected:
            in_tops.append(top1)
            hit1 += ranked[0][1] in expected
            found = any(label in expected for _, label in ranked)
            hitk += found
            mark = "OK  " if found else "MISS"
        else:
            out_tops.append(top1)
            mark = "OUT "
        tops = "  ".join(f"{label}({score:.3f})" for score, label in ranked)
        print(f"{mark} {q['id']} top1={top1:.3f}  {tops}  | {q['question']}")

    print(f"\nHit@1 = {hit1}/{len(in_tops)} · Hit@{TOP_K} = {hitk}/{len(in_tops)}")
    if in_tops and out_tops:
        print(f"top1 thấp nhất (trong phạm vi) = {min(in_tops):.3f} · top1 cao nhất (ngoài phạm vi) = {max(out_tops):.3f}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) < 3:
        sys.exit("Cách dùng: uv run --env-file .env python poc/embed_check.py poc/questions.jsonl <file.pdf> ...")
    main(sys.argv[1], pdf_paths(sys.argv[2:]))


