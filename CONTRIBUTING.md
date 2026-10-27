# Quy tắc làm việc với Git

Áp dụng cho cả 3 thành viên. Mục tiêu: `main` luôn chạy được, và lịch sử commit cho thấy rõ ai làm gì (giảng viên dùng lịch sử này để đánh giá đóng góp).

## 1. Nguyên tắc cốt lõi

1. **Không commit hay push thẳng lên `main`.** Mọi thay đổi đều đi qua Pull Request (PR).
2. **Mỗi việc một nhánh**, tách từ `main` mới nhất.
3. **PR chỉ được merge khi CI xanh và có ít nhất 1 thành viên khác approve.**
4. **Không bao giờ commit `.env`**, API key hay mật khẩu. File mẫu là `server/.env.example`.
5. **Không `push --force` lên `main`.** Trên nhánh của chính mình thì được, nhưng chỉ dùng `--force-with-lease`.

## 2. Đặt tên nhánh

Cú pháp: `<loại>/<mô-tả-ngắn>`, viết thường, không dấu, các từ nối bằng `-`.

| Loại | Dùng khi | Ví dụ |
| --- | --- | --- |
| `feat` | Thêm tính năng | `feat/auth-jwt`, `feat/upload-pdf` |
| `fix` | Sửa lỗi | `fix/chat-stream-timeout` |
| `docs` | Chỉ sửa tài liệu | `docs/bao-cao-tuan-3` |
| `refactor` | Sửa cấu trúc code, không đổi hành vi | `refactor/tach-module-rag` |
| `chore` | Cấu hình, dependency, CI | `chore/ci-cache` |

Một nhánh nên xong trong **1–3 ngày**. Việc lớn hơn thì chia nhỏ, mỗi phần một PR.

## 3. Commit message

Theo chuẩn [Conventional Commits](https://www.conventionalcommits.org/): `<loại>(<phạm vi>): <mô tả>`.

```
feat(auth): thêm API đăng nhập bằng JWT
fix(chat): đóng stream khi client ngắt kết nối
docs: cập nhật báo cáo tuần 3
chore(server): ghim prisma 7.10.1
```

- **Loại** giống bảng ở mục 2. **Phạm vi** (tùy chọn): `client`, `server`, `ai`, `shared`, `auth`, `course`, `document`, `chat`, `quiz`, `admin`, `db`, `ci`.
- Mô tả viết tiếng Việt hoặc tiếng Anh đều được, nhưng cả nhóm dùng **một** ngôn ngữ. Bắt đầu bằng động từ, không chấm cuối câu, tối đa khoảng 72 ký tự.
- Mỗi commit là một thay đổi có nghĩa. Không gom nhiều việc không liên quan vào một commit.
- Sửa `schema.prisma` thì commit **cùng với** file migration sinh ra trong `server/prisma/migrations/`.

## 4. Quy trình một việc, từ đầu đến khi merge

```bash
# 1. Lấy main mới nhất và tạo nhánh
git switch main
git pull
git switch -c feat/upload-pdf

# 2. Code, rồi commit thường xuyên
git add <file>
git commit -m "feat(document): thêm API upload PDF"

# 3. Kiểm tra trước khi push (giống hệt CI)
npm run lint
npm run build
cd ai && uv run ruff check && uv run pytest   # nếu có sửa ai/

# 4. Push và mở PR
git push -u origin feat/upload-pdf
```

Sau đó lên GitHub mở PR vào `main`, điền đủ mẫu PR, gán 1 người review.

### Cập nhật nhánh khi `main` đã thay đổi

```bash
git fetch origin
git rebase origin/main
# sửa xung đột nếu có → git add <file> → git rebase --continue
git push --force-with-lease
```

Chưa quen rebase thì dùng `git merge origin/main` cũng được; khi merge PR, các commit sẽ được gộp lại (squash) nên lịch sử của `main` vẫn gọn.

## 5. Pull Request

**Người mở PR:**
- PR nhỏ: dưới khoảng **400 dòng thay đổi**, trừ file sinh tự động như `package-lock.json` hay migration.
- Tiêu đề PR theo đúng format commit, vì nó sẽ thành commit message trên `main` sau khi squash.
- Điền mẫu PR: làm gì, vì sao, test thế nào, ảnh chụp nếu có thay đổi giao diện.
- Liên kết issue nếu có (`Closes #12`).
- Tự review diff của mình một lượt trước khi gán người review.

**Người review:**
- Review trong vòng **24 giờ**.
- Chạy thử ở máy mình nếu PR đụng đến luồng chính (đăng nhập, upload, chat, quiz).
- Comment cụ thể, chỉ rõ dòng nào và vì sao. Lỗi bắt buộc phải sửa thì chọn "Request changes"; góp ý không bắt buộc thì ghi tiền tố `nit:`.

**Merge:**
- Dùng **Squash and merge**.
- Ai mở PR thì người đó merge, sau khi được approve và CI xanh.
- Xóa nhánh sau khi merge (bật tùy chọn tự xóa trên GitHub).

## 6. Những việc cần cẩn thận

| Tình huống | Cách làm |
| --- | --- |
| Lỡ commit `.env` hoặc API key | Báo nhóm ngay, **thu hồi key cũ và tạo key mới**. Xóa file khỏi commit là chưa đủ, vì key vẫn nằm trong lịch sử git |
| Xung đột ở `package-lock.json` | Lấy bản của `main`, rồi chạy lại `npm install` để sinh lại file |
| Xung đột ở `ai/uv.lock` | Lấy bản của `main`, rồi chạy lại `uv lock` trong `ai/` |
| Sửa API nội bộ Express ↔ Python | Sửa cả Pydantic trong `ai/` lẫn `shared/src/internal.ts` trong cùng một PR |
| Hai người cùng sửa `schema.prisma` | Báo nhau trước khi sửa. Người merge sau rebase lên `main`, xóa migration của mình, rồi chạy lại `npm run db:migrate -w server` để tạo migration mới |
| Cần thêm dependency mới | Ghi rõ trong mô tả PR là thêm package gì và vì sao |
| Muốn hoàn tác một thay đổi đã merge | Dùng `git revert <commit>` rồi mở PR. Không sửa lịch sử của `main` |

## 7. Gắn với báo cáo tuần

- Báo cáo tuần ghi **link các PR đã merge** trong tuần của từng thành viên (mẫu ở `docs/bao-cao-tuan/`).
- Mỗi thành viên commit bằng email đã đăng ký GitHub, để thống kê đóng góp được tính đúng:

```bash
git config user.name "Họ Tên"
git config user.email "email-github@example.com"
```

