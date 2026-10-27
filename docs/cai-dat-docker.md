# Cài Docker Desktop và chạy database cho StudyMate (Windows 11)

Dự án chỉ dùng Docker để chạy PostgreSQL 17 + pgvector khi dev. Server, client và service AI chạy trực tiếp trên máy. Docker Desktop miễn phí cho cá nhân và giáo dục.

## Bước 0. Kiểm tra máy đã có Docker chưa

Mở PowerShell:

```powershell
docker --version     # in ra phiên bản → đã cài
docker info          # in ra "Server Version: ..." → Docker đang chạy
```

- Cả hai lệnh đều chạy được: bỏ qua đến **Bước 4**.
- `docker --version` chạy được, nhưng `docker info` báo lỗi `open //./pipe/dockerDesktopLinuxEngine`: Docker đã cài nhưng chưa bật. Mở Docker Desktop từ Start menu rồi đi tiếp **Bước 3**.
- `docker` không được nhận diện: làm từ **Bước 1**.

## Bước 1. Bật ảo hóa và WSL 2

Bản Windows 11 Home chạy Docker thông qua WSL 2 (Windows Subsystem for Linux).

1. Mở Task Manager → tab **Performance** → **CPU**. Dòng **Virtualization** phải là `Enabled`. Nếu là `Disabled`, khởi động lại máy, vào BIOS và bật Intel VT-x hoặc AMD-V (SVM). Trên máy Lenovo LOQ, nhấn F2 khi máy vừa khởi động để vào BIOS.
2. Mở **PowerShell bằng quyền Administrator** và chạy:

   ```powershell
   wsl --install
   ```

   Nếu WSL đã có sẵn, lệnh sẽ báo như vậy; khi đó chạy `wsl --update` để cập nhật.
3. Khởi động lại máy.
4. Kiểm tra bằng lệnh `wsl --status`. Kết quả phải có dòng `Default Version: 2`.

## Bước 2. Cài Docker Desktop

1. Tải bản **Docker Desktop for Windows – AMD64** tại https://www.docker.com/products/docker-desktop/
2. Chạy file cài đặt. Ở màn hình cấu hình, **giữ dấu tích "Use WSL 2 instead of Hyper-V"**.
3. Cài xong thì đăng xuất Windows rồi đăng nhập lại (hoặc khởi động lại máy) theo yêu cầu.

## Bước 3. Mở Docker Desktop lần đầu

1. Mở **Docker Desktop** từ Start menu và chấp nhận điều khoản.
2. Không bắt buộc đăng nhập tài khoản Docker; có thể bấm **Skip**.
3. Chờ góc dưới bên trái hiện **Engine running** (biểu tượng màu xanh).
4. Tùy chọn: vào **Settings → General**, bật **Start Docker Desktop when you sign in** để Docker tự chạy mỗi khi mở máy.
5. Kiểm tra:

   ```powershell
   docker run --rm hello-world
   ```

   Thấy dòng `Hello from Docker!` là đã cài thành công.

## Bước 4. Chạy database của dự án

Mở terminal ở thư mục gốc dự án:

```powershell
docker compose up -d                 # tải image pgvector/pgvector:pg17 (lần đầu ~150 MB) và chạy ngầm
docker compose ps                    # cột STATUS của service db phải là "running" / "Up"
npm run db:migrate -w server         # tạo các bảng và extension vector
```

Nếu `db:migrate` hỏi tên migration thì tức là schema đã thay đổi so với migration có sẵn. Ở lần chạy đầu thì không bị hỏi.

Kiểm tra toàn hệ thống: chạy 3 terminal như hướng dẫn trong [README](../README.md#chạy-local) rồi mở http://localhost:5173. Trang hiện `API OK · database OK · AI OK` là xong.

Xem dữ liệu: `npx -w server prisma studio`.

## Lệnh dùng hằng ngày

| Lệnh | Tác dụng |
| --- | --- |
| `docker compose up -d` | Bật database |
| `docker compose stop` | Tắt database, **giữ nguyên dữ liệu** |
| `docker compose logs -f db` | Xem log của PostgreSQL |
| `docker compose down` | Xóa container, **vẫn giữ dữ liệu** (dữ liệu nằm trong volume `pgdata`) |
| `docker compose down -v` | **Xóa luôn toàn bộ dữ liệu**. Chỉ dùng khi muốn làm lại database từ đầu, sau đó chạy lại `npm run db:migrate -w server` |

## Lỗi thường gặp

| Hiện tượng | Cách xử lý |
| --- | --- |
| `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified` | Docker Desktop chưa chạy. Mở nó lên và chờ đến khi hiện **Engine running** |
| `Bind for 0.0.0.0:5432 failed: port is already allocated` | Máy đã có PostgreSQL khác dùng cổng 5432. Tắt service đó (Services → postgresql → Stop), hoặc đổi `ports` trong `docker-compose.yml` thành `"5433:5432"` và sửa `localhost:5433` trong `server/.env`. Đổi cổng thì báo nhóm, vì file compose dùng chung |
| Docker Desktop báo `WSL update failed` hoặc `WSL 2 is not installed` | Chạy `wsl --update` bằng quyền Administrator rồi mở lại Docker Desktop |
| `Virtualization support not detected` | Chưa bật ảo hóa trong BIOS, xem Bước 1 |
| Máy chậm, `Vmmem` chiếm nhiều RAM | Tạo file `C:\Users\<tên>\.wslconfig` với nội dung `[wsl2]` và `memory=4GB`, rồi chạy `wsl --shutdown` |
| `db:migrate` báo `P1001: Can't reach database server` | Database chưa chạy: kiểm tra `docker compose ps` |
