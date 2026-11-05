import { registerRequest } from "@studymate/shared";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/lib/auth.js";

// Tạo tài khoản Admin đầu tiên. Chạy trong server/: npx prisma db seed
// Luồng: docs/luong-xu-ly/dang-nhap-phan-quyen.md, mục 5.8.

// Bước 1: cùng quy tắc email và mật khẩu mới như khi đăng ký. Sai thì dừng, không ghi gì.
const parsed = registerRequest.safeParse({
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
});
if (!parsed.success) {
  const envName: Record<string, string> = { email: "ADMIN_EMAIL", password: "ADMIN_PASSWORD" };
  for (const issue of parsed.error.issues) {
    console.error(`${envName[String(issue.path[0])] ?? "server/.env"}: ${issue.message}`);
  }
  process.exit(1);
}
const { email, password } = parsed.data;

// Bước 2: upsert theo email nên chạy lại bao nhiêu lần cũng không sinh bản ghi trùng.
// Đọc trước chỉ để in ra đã tạo mới hay đã cấp quyền.
const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
await prisma.user.upsert({
  where: { email },
  create: { email, passwordHash: await hashPassword(password), role: "ADMIN" },
  // Không đổi mật khẩu, để lỡ chạy lại seed cũng không mất mật khẩu mà Admin đã đổi.
  update: { role: "ADMIN", isLocked: false },
});
await prisma.$disconnect();

console.log(
  existing
    ? `Đã cấp quyền Admin cho ${email} (giữ nguyên mật khẩu cũ)`
    : `Đã tạo tài khoản Admin ${email}`,
);
