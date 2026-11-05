import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createUser } from "./helpers.js";

// Kiểm thử mục 10 (nhóm 6) và dòng "thiếu JWT_SECRET" ở mục 7 của docs/luong-xu-ly/dang-nhap-phan-quyen.md.
// Chạy script thật trong tiến trình con, để kiểm tra cả mã thoát và nội dung in ra.

const serverDir = fileURLToPath(new URL("..", import.meta.url));

function run(script: string, env: Record<string, string>) {
  return spawnSync(process.execPath, ["--import", "tsx", script], {
    cwd: serverDir,
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 20_000,
  });
}

function login(email: string, password: string) {
  return request(app).post("/api/auth/login").send({ email, password });
}

describe("seed Admin: prisma/seed.ts", { timeout: 60_000 }, () => {
  it("chạy hai lần vẫn chỉ có một Admin", async () => {
    const env = { ADMIN_EMAIL: "Admin@Example.com", ADMIN_PASSWORD: "mat-khau-admin-1" };

    const first = run("prisma/seed.ts", env);
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toContain("Đã tạo tài khoản Admin admin@example.com");

    const second = run("prisma/seed.ts", env);
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toContain("Đã cấp quyền Admin");

    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: "admin@example.com", role: "ADMIN", isLocked: false });
    await login("admin@example.com", "mat-khau-admin-1").expect(200);
  });

  it("email đã là sinh viên (kể cả bị khóa): thành Admin, mở khóa, giữ mật khẩu cũ", async () => {
    await createUser("sv@example.com", { password: "mat-khau-cu-123", isLocked: true });

    const result = run("prisma/seed.ts", { ADMIN_EMAIL: "sv@example.com", ADMIN_PASSWORD: "mat-khau-moi-456" });
    expect(result.status, result.stderr).toBe(0);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "sv@example.com" } });
    expect(user).toMatchObject({ role: "ADMIN", isLocked: false });
    await login("sv@example.com", "mat-khau-cu-123").expect(200);
    await login("sv@example.com", "mat-khau-moi-456").expect(401);
  });

  it("mật khẩu không hợp lệ: thoát với mã khác 0, in tên biến, không ghi gì", async () => {
    const result = run("prisma/seed.ts", { ADMIN_EMAIL: "admin@example.com", ADMIN_PASSWORD: "ngan" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ADMIN_PASSWORD: Mật khẩu cần ít nhất 8 ký tự");
    expect(await prisma.user.count()).toBe(0);
  });
});

describe("khởi động server", { timeout: 60_000 }, () => {
  it.each(["", "ngan-hon-32-ky-tu"])("JWT_SECRET = %j: không khởi động, in lỗi rõ ràng", (secret) => {
    // PORT=0: lỡ server vẫn chạy thì lấy cổng ngẫu nhiên, không đụng cổng 3000.
    const result = run("src/index.ts", { JWT_SECRET: secret, PORT: "0" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("JWT_SECRET phải dài ít nhất 32 ký tự");
  });
});
