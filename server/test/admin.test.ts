import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createUser, loginAs } from "./helpers.js";

// Kiểm thử mục 10 (nhóm 4 và 7) của docs/luong-xu-ly/dang-nhap-phan-quyen.md.

async function setup() {
  const admin = await createUser("admin@example.com", { role: "ADMIN" });
  const student = await createUser("sv@example.com");
  return { admin, student, adminAgent: await loginAs("admin@example.com") };
}

describe("PATCH /api/admin/users/:id", () => {
  it("chưa đăng nhập: 401", async () => {
    const student = await createUser("sv@example.com");
    await request(app).patch(`/api/admin/users/${student.id}`).send({ isLocked: true }).expect(401);
  });

  it.each(["STUDENT", "TEACHER"] as const)("%s gọi: 403 FORBIDDEN", async (role) => {
    const target = await createUser("target@example.com");
    await createUser("caller@example.com", { role });
    const agent = await loginAs("caller@example.com");

    const res = await agent.patch(`/api/admin/users/${target.id}`).send({ role: "ADMIN" }).expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(unchanged.role).toBe("STUDENT");
  });

  it("khóa một user: trả user có isLocked, request kế tiếp của người đó nhận 403 ACCOUNT_LOCKED", async () => {
    const { student, adminAgent } = await setup();
    const studentAgent = await loginAs("sv@example.com");

    const res = await adminAgent.patch(`/api/admin/users/${student.id}`).send({ isLocked: true }).expect(200);
    expect(res.body).toEqual({
      user: { id: student.id, email: "sv@example.com", role: "STUDENT", isLocked: true },
    });

    const me = await studentAgent.get("/api/auth/me").expect(403);
    expect(me.body.error.code).toBe("ACCOUNT_LOCKED");
  });

  it("cấp TEACHER: /me của người đó trả role mới ngay", async () => {
    const { student, adminAgent } = await setup();
    const studentAgent = await loginAs("sv@example.com");

    await adminAgent.patch(`/api/admin/users/${student.id}`).send({ role: "TEACHER" }).expect(200);

    const me = await studentAgent.get("/api/auth/me").expect(200);
    expect(me.body.user.role).toBe("TEACHER");
  });

  it("Admin tự sửa chính mình: 403 FORBIDDEN, không đổi gì", async () => {
    const { admin, adminAgent } = await setup();

    const res = await adminAgent
      .patch(`/api/admin/users/${admin.id}`)
      .send({ role: "STUDENT", isLocked: true })
      .expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(unchanged).toMatchObject({ role: "ADMIN", isLocked: false });
  });

  it("id không tồn tại: 404 NOT_FOUND", async () => {
    const { adminAgent } = await setup();
    const res = await adminAgent.patch(`/api/admin/users/${randomUUID()}`).send({ isLocked: true }).expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("body rỗng: 400 VALIDATION_ERROR", async () => {
    const { student, adminAgent } = await setup();
    const res = await adminAgent.patch(`/api/admin/users/${student.id}`).send({}).expect(400);
    expect(res.body.error).toEqual({
      code: "VALIDATION_ERROR",
      message: "Cần gửi ít nhất một trong hai trường: role, isLocked",
    });
  });

  it("role lạ: 400 kèm fields.role", async () => {
    const { student, adminAgent } = await setup();
    const res = await adminAgent.patch(`/api/admin/users/${student.id}`).send({ role: "SUPERADMIN" }).expect(400);
    expect(res.body.error.fields).toEqual({ role: "Vai trò phải là STUDENT, TEACHER hoặc ADMIN" });
  });
});
