import request, { type Response } from "supertest";
import { expect } from "vitest";
import type { UserRole } from "@studymate/shared";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { AUTH_COOKIE, hashPassword } from "../src/lib/auth.js";

export const PASSWORD = "mat-khau-dung-123";

// Tạo user thẳng trong DB, không qua API, để có được TEACHER, ADMIN hay tài khoản bị khóa.
export async function createUser(
  email: string,
  opts: { role?: UserRole; isLocked?: boolean; password?: string } = {},
) {
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(opts.password ?? PASSWORD),
      role: opts.role ?? "STUDENT",
      isLocked: opts.isLocked ?? false,
    },
  });
}

// Agent giữ cookie giữa các request, giống trình duyệt.
export async function loginAs(email: string, password = PASSWORD) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password }).expect(200);
  return agent;
}

// Dòng Set-Cookie của cookie đăng nhập, ví dụ "studymate_token=eyJ...; Max-Age=604800; Path=/; HttpOnly".
export function authCookie(res: Response): string | undefined {
  return res.get("Set-Cookie")?.find((c) => c.startsWith(`${AUTH_COOKIE}=`));
}

// Riêng giá trị token trong cookie đăng nhập.
export function tokenFrom(res: Response): string {
  const value = authCookie(res)?.split(";")[0]?.slice(AUTH_COOKIE.length + 1);
  if (!value) throw new Error("Phản hồi không đặt cookie đăng nhập");
  return value;
}

// Cookie bị xóa: giá trị rỗng, hết hạn từ năm 1970, cùng Path và SameSite như lúc đặt.
export function expectCookieCleared(res: Response) {
  const cookie = authCookie(res);
  expect(cookie).toMatch(new RegExp(`^${AUTH_COOKIE}=;`));
  expect(cookie).toContain("Expires=Thu, 01 Jan 1970");
  expect(cookie).toContain("Path=/");
  expect(cookie).toContain("SameSite=Lax");
}
