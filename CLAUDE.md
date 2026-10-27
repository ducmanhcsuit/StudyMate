# StudyMate – hướng dẫn cho AI

StudyMate là nền tảng học tập có chatbot RAG trích dẫn trang và sinh quiz từ tài liệu khóa học. Đây là đồ án môn SE347 của nhóm 3 người. Kiến trúc và 27 quyết định đã chốt nằm ở `docs/01-kien-truc-du-an.md`: đọc file này trước khi thêm file, thư mục hoặc thư viện. Quy tắc Git ở `CONTRIBUTING.md`, các lệnh chạy ở `README.md`. Luôn trả lời bằng tiếng Việt.

## Phân công

| Phần | Thư mục | Người phụ trách |
| --- | --- | --- |
| RAG / AI | `ai/` | Mạnh |
| Frontend | `client/` | Nhật |
| Backend | `server/` | Dũng |
| Dùng chung | `shared/`, `server/prisma/schema.prisma`, API nội bộ Express ↔ Python | Mọi người có phần bị ảnh hưởng cùng đồng ý |

Chỉ sửa trong thư mục của người đang làm việc với bạn. Nếu cần sửa phần của người khác, mô tả thay đổi đó để người dùng trao đổi với chủ phần.

## Nguyên tắc: con người quyết định, AI đề xuất và viết code

### 1. Mọi lựa chọn đều trình bày để con người chọn

Khi có hơn một cách làm hợp lý (kiến trúc, thư viện, schema, hợp đồng API, thuật toán, tham số như top-k hay ngưỡng), trình bày 2–3 phương án. Với mỗi phương án nêu được gì và mất gì, kèm một đề xuất, rồi **dừng lại chờ người dùng chọn**.

Những quyết định đã ghi trong `docs/01-kien-truc-du-an.md` coi như đã chốt. Muốn đổi thì đề xuất trước; người dùng đồng ý thì cập nhật file đó trước khi sửa code.

### 2. Logic khó phải có mô tả luồng được duyệt trước khi viết code

Logic khó gồm:

- Pipeline ingest: đọc PDF, chia đoạn, embedding, hàng đợi `SKIP LOCKED`, chạy lại không sinh chunk trùng.
- Viết lại câu hỏi nối tiếp, hybrid search + RRF, ngưỡng từ chối câu hỏi ngoài phạm vi.
- Dựng prompt, trích dẫn chunk → trang, chống prompt injection.
- Stream SSE từ Python qua Express về client.
- Sinh quiz bằng structured output và kiểm tra kết quả.
- Đăng nhập, JWT, phân quyền, hạn mức AI.

Trước khi viết code cho các phần trên, soạn mô tả luồng tại `docs/luong-xu-ly/<ten>.md`, gồm:

- Các bước theo thứ tự, kèm input và output của từng bước.
- Dữ liệu đọc và ghi.
- Các trường hợp biên.
- Cách xử lý lỗi và chạy lại.
- Sơ đồ Mermaid nếu luồng có nhánh.

Người phụ trách duyệt xong mới viết code, và code phải bám đúng luồng đã duyệt. Nếu khi viết code phát hiện luồng cần đổi, dừng lại, cập nhật mô tả và xin duyệt lại.

### 3. Mọi việc đều được giám sát

- Làm từng bước nhỏ. Sau mỗi bước, báo đã sửa file nào, vì sao, và đã kiểm tra bằng cách nào (lệnh và kết quả).
- **Hỏi trước khi:**
  - thêm hoặc nâng cấp dependency;
  - sửa `schema.prisma` hoặc migration;
  - sửa `shared/` hoặc API nội bộ;
  - xóa file;
  - chạy `git commit`, `push` hoặc `merge`;
  - gọi dịch vụ tốn phí hoặc tốn quota (Gemini).
- Với đoạn code không hiển nhiên, giải thích ngắn gọn để người phụ trách hiểu và tự trình bày được khi báo cáo đồ án.
- Khi một bước thất bại hoặc bị bỏ qua, báo đúng như vậy, kèm output lỗi.

## Những điều không tự thấy được khi đọc code

- Prisma là nơi duy nhất tạo migration. Python chỉ đọc/ghi bảng `Chunk` và cập nhật `Document.status` bằng SQL thuần (psycopg). Các cột `tsv` và `embedding vector(768)` chỉ Python ghi.
- Prisma 7: `migrate dev` không còn tự chạy `generate`. Deploy dùng `migrate deploy`.
- Hợp đồng Express ↔ Python được chép tay ở hai nơi: Pydantic trong `ai/` và `shared/src/internal.ts`. Sửa một bên thì sửa cả bên kia trong cùng một PR.
- `INTERNAL_KEY` trong `server/.env` và `ai/.env` phải giống nhau. Trình duyệt không bao giờ gọi thẳng vào `ai/`.
- `shared/` phải được build thì server và client mới thấy thay đổi. Sau khi sửa, chạy `npm run build -w shared`.
- Trên máy Windows của nhóm, chạy `npm` qua PowerShell (qua Git Bash, lệnh có thể thoát mà không in ra gì).
- Code có chủ ý viết đơn giản sẽ có comment `ponytail:` ghi rõ giới hạn và cách nâng cấp. Giữ các comment này cho đến khi nâng cấp thật.
