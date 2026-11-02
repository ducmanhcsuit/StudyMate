# Kết quả PoC tuần 1

## 1. PyMuPDF trên slide thật

- Dữ liệu: chuong1.pdf, chuong3.pdf (mỗi file 19 trang, ~270 ký tự/trang). Bản PyMuPDF 1.27.2.3.
- Có lớp chữ đầy đủ: 0 trang trống, 0 ký tự lỗi, dấu tiếng Việt đúng.
- Chia mỗi trang một chunk là hợp lý; không cần cắt nhỏ hơn với slide.
- 0 trang trống, 0 ký tự lỗi.
- Đã sửa lỗi mất dấu cách (ngưỡng 0,15 × cỡ chữ).
- Đã chuẩn hóa NFC và vị trí dấu (Q28).
- Còn tồn: chân trang "Chương X … Trang N", trang bìa có thông tin cá nhân, chữ nằm trong ảnh (ch1 trang 4, ch3 trang 10).

### Lỗi mất dấu cách sau chữ có dấu thanh
- Hiện tượng: "ngữdùng", "xửlý", "Thếmạnh"…
- Nguyên nhân: PDF không có ký tự dấu cách, nhưng giữa hai chữ có khoảng trống ~0,3 × cỡ chữ
  (đo bằng poc/space_check.py: ữ→d = 6,96pt ở cỡ 24; chữ liền nhau chỉ ~0,05pt).
- Cách sửa: ghép lại chữ từ rawdict, chèn dấu cách khi khoảng trống > 0,15 × cỡ chữ.
- Kết quả: [trước N → sau M chỗ dính]; không tách nhầm mã HTML, email.

### Việc cần đưa vào luồng ingest
- Bỏ chân trang lặp lại ("Chương X: … Trang N") khỏi thân chunk, gắn tên chương một lần ở đầu.
- Bỏ trang bìa (có thông tin cá nhân giảng viên).
- Nội dung trong ảnh/sơ đồ bị mất (giới hạn đã biết, 06 §6.2.1).
- Chunk chứa thẻ HTML → phải escape khi bọc trong <document> (Q23).
- Sửa font nhúng sai bảng mã theo tên font (Chuong2 Palatino: |→à, }→â, {→á) trong page_text; dấu | thật ở font khác giữ nguyên.

## 2. Embedding Gemini với câu hỏi tiếng Việt
- Model: gemini-embedding-2, 768 chiều; tài liệu gửi dạng "title: … | text: …", câu hỏi dạng "task: search result | query: …".
- Lần chạy 1 (5 câu): Hit@1 = 2/3, Hit@3 = 3/3.
- Cosine top1: trong phạm vi 0,777–0,794; ngoài phạm vi 0,553–0,580 → tách được, ngưỡng tạm 0,68.
- Cosine nền ~0,55 với câu không liên quan → không đọc cosine như phần trăm.
- Bẫy SDK: … (như đã ghi)
- Cần làm: thêm câu hỏi lên 12–15; kiểm tra lại expected_pages của q03; xem ch1 trang 2 có phải mục lục không.


### Hạn mức free tier gemini-embedding-2 (xem trên AI Studio, 02/11/2026)
- RPM 100 · TPM 30.000 · RPD 1.000. Mỗi đoạn trong một lô tính là 1 lượt.
- 1.000 lượt/ngày dùng chung cho ingest (1 lượt/trang) và chat (≥ 1 lượt/câu hỏi).
  Ví dụ: 4 file slide hiện có = 194 trang ≈ 20% hạn mức ngày.
- Hệ quả cho ingest: gửi theo nhịp ≤ 80 đoạn/phút và ≤ ~25.000 token/phút; dùng lại embedding theo hash;
  gặp 429 thì chờ đúng retryDelay.
- Hệ quả cho Q24: hạn mức 50 câu/người/ngày chưa tính trần chung 1.000 lượt/ngày → báo Dũng.
- Hạn mức model chat: (chưa xem, làm ở bước 3).

### Lần chạy 2 (02/11/2026): 4 file, 193 trang (bỏ 1 trang trống), 22 câu (16 trong phạm vi, 6 ngoài)
- Hit@1 = 16/16, Hit@3 = 16/16.
- top1 trong phạm vi: factual 0,705–0,818; keyword 0,670–0,702. Ngoài phạm vi: 0,558–0,662.
- Ranh giới hẹp: keyword thấp nhất (0,670) chỉ hơn câu ngoài phạm vi khó nhất (o03 Closure, 0,662) 0,008.
- Trang trống (bìa ảnh JS Handbook) chen top-3 của 7/22 câu, đẩy q15 khỏi hạng 1 → ingest phải bỏ trang trống.
  Bỏ xong: Hit@1 15/16 → 16/16, top1 câu ngoài phạm vi giảm (phở 0,632 → 0,558).
- Trang bìa, mục lục, "Thảo luận" vẫn chen top-3 vài câu → bỏ khi ingest.

### Chốt
- Ngưỡng 0,65 (Q29), top-k = 5 (Q30). gemini-embedding-2 giữ nguyên (Q17).
- Rủi ro đã biết: câu từ khóa trần có cosine thấp (0,670–0,702), sát ngưỡng. Nếu golden set cho thấy
  câu từ khóa bị từ chối nhầm thì xét quy tắc "chỉ từ chối khi full-text cũng không có kết quả".


