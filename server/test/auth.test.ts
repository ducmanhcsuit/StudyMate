import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { AUTH_COOKIE } from "../src/lib/auth.js";
import { PASSWORD, authCookie, createUser, expectCookieCleared, loginAs, tokenFrom } from "./helpers.js";

// Kiểm thử mục 10 (nhóm 1, 2, 3, 5) của docs/luong-xu-ly/dang-nhap-phan-quyen.md.

function register(body: Record<string, unknown>) {
  return request(app).post("/api/auth/register").send(body);
}

function login(email: string, password: string) {
  return request(app).post("/api/auth/login").send({ email, password });
}

function meWithToken(token: string) {
  return request(app).get("/api/auth/me").set("Cookie", `${AUTH_COOKIE}=${token}`);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/auth/register", () => {
  it("trả 201, user dạng { id, email, role } và cookie HttpOnly, SameSite=Lax, hạn 7 ngày", async () => {
    const res = await register({ email: "sv@example.com", password: PASSWORD }).expect(201);

    expect(res.body).toEqual({ user: { id: expect.any(String), email: "sv@example.com", role: "STUDENT" } });
    const cookie = authCookie(res);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=604800");
    expect(cookie).not.toContain("Secure"); // chỉ có khi NODE_ENV=production
  });

  it("đăng ký xong là đã đăng nhập", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "sv@example.com", password: PASSWORD }).expect(201);
    const res = await agent.get("/api/auth/me").expect(200);
    expect(res.body.user.email).toBe("sv@example.com");
  });

  it("gửi kèm role ADMIN vẫn tạo STUDENT", async () => {
    const res = await register({ email: "sv@example.com", password: PASSWORD, role: "ADMIN" }).expect(201);
    expect(res.body.user.role).toBe("STUDENT");
    const saved = await prisma.user.findUniqueOrThrow({ where: { email: "sv@example.com" } });
    expect(saved.role).toBe("STUDENT");
  });

  it("chuẩn hóa email: cắt khoảng trắng, chuyển chữ thường", async () => {
    const res = await register({ email: "  SV@Example.COM ", password: PASSWORD }).expect(201);
    expect(res.body.user.email).toBe("sv@example.com");
  });

  it("trùng email, kể cả khác hoa thường, trả 409 EMAIL_TAKEN", async () => {
    await register({ email: "sv@example.com", password: PASSWORD }).expect(201);
    const res = await register({ email: "SV@example.com", password: PASSWORD }).expect(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("hai request cùng email, cùng lúc: một 201, một 409", async () => {
    const results = await Promise.all([
      register({ email: "sv@example.com", password: PASSWORD }),
      register({ email: "sv@example.com", password: PASSWORD }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.user.count()).toBe(1);
  });

  it("mật khẩu 24 chữ 'ệ' (72 byte) được chấp nhận, 25 chữ (75 byte) bị 400", async () => {
    await register({ email: "a@example.com", password: "ệ".repeat(24) }).expect(201);

    const res = await register({ email: "b@example.com", password: "ệ".repeat(25) }).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields.password).toContain("72 byte");
  });

  it("email sai định dạng và mật khẩu dưới 8 ký tự: 400, lỗi gắn vào từng ô", async () => {
    const res = await register({ email: "khong-phai-email", password: "ngan" }).expect(400);
    expect(res.body.error).toEqual({
      code: "VALIDATION_ERROR",
      message: "Dữ liệu không hợp lệ",
      fields: { email: "Email không hợp lệ", password: "Mật khẩu cần ít nhất 8 ký tự" },
    });
  });

  it("body không phải JSON hợp lệ: 400 VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .set("Content-Type", "application/json")
      .send('{"email": ')
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("body lớn hơn 100 KB: 400 VALIDATION_ERROR", async () => {
    const res = await register({ email: "sv@example.com", password: "x".repeat(101 * 1024) }).expect(400);
    expect(res.body.error).toEqual({ code: "VALIDATION_ERROR", message: "Dữ liệu gửi lên quá lớn" });
  });
});

describe("POST /api/auth/login", () => {
  it("đúng email và mật khẩu: 200 kèm cookie; email không phân biệt hoa thường", async () => {
    const user = await createUser("sv@example.com");
    const res = await login("SV@Example.com", PASSWORD).expect(200);
    expect(res.body).toEqual({ user: { id: user.id, email: "sv@example.com", role: "STUDENT" } });
    expect(authCookie(res)).toContain("HttpOnly");
  });

  it("sai mật khẩu và email không tồn tại trả cùng một lỗi 401 INVALID_CREDENTIALS", async () => {
    await createUser("sv@example.com");
    const wrongPassword = await login("sv@example.com", "sai-mat-khau").expect(401);
    const unknownEmail = await login("khong-co@example.com", PASSWORD).expect(401);

    expect(wrongPassword.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(authCookie(wrongPassword)).toBeUndefined();
  });

  it("email không tồn tại vẫn chạy một lần so bcrypt (với hash giả)", async () => {
    const compare = vi.spyOn(bcrypt, "compare");
    await login("khong-co@example.com", PASSWORD).expect(401);
    expect(compare).toHaveBeenCalledTimes(1);
  });

  it("tài khoản bị khóa: đúng mật khẩu thì 403 ACCOUNT_LOCKED, sai mật khẩu thì 401", async () => {
    await createUser("sv@example.com", { isLocked: true });

    const right = await login("sv@example.com", PASSWORD).expect(403);
    expect(right.body.error.code).toBe("ACCOUNT_LOCKED");
    expect(authCookie(right)).toBeUndefined();

    const wrong = await login("sv@example.com", "sai-mat-khau").expect(401);
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("đăng ký bằng dạng dựng sẵn (NFC), đăng nhập bằng dạng tổ hợp (NFD) vẫn được", async () => {
    const nfc = "Mật-khẩu-đúng-1".normalize("NFC");
    const nfd = nfc.normalize("NFD");
    expect(nfd).not.toBe(nfc);

    await register({ email: "sv@example.com", password: nfc }).expect(201);
    await login("sv@example.com", nfd).expect(200);
  });

  it("thiếu mật khẩu: 400 kèm fields.password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "sv@example.com" }).expect(400);
    expect(res.body.error.fields).toEqual({ password: "Vui lòng nhập mật khẩu" });
  });
});

describe("requireAuth (qua GET /api/auth/me)", () => {
  const key = new TextEncoder().encode(process.env.JWT_SECRET);
  const now = () => Math.floor(Date.now() / 1000);

  it("không có cookie: 401 UNAUTHENTICATED", async () => {
    const res = await request(app).get("/api/auth/me").expect(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("token hợp lệ: 200 kèm user", async () => {
    const res = await register({ email: "sv@example.com", password: PASSWORD }).expect(201);
    const me = await meWithToken(tokenFrom(res)).expect(200);
    expect(me.body.user).toEqual(res.body.user);
  });

  it("sửa một ký tự của token: 401 và cookie bị xóa", async () => {
    const res = await register({ email: "sv@example.com", password: PASSWORD }).expect(201);
    const [header, payload, signature] = tokenFrom(res).split(".");
    const flipped = signature![5] === "A" ? "B" : "A";
    const tampered = `${header}.${payload}.${signature!.slice(0, 5)}${flipped}${signature!.slice(6)}`;

    const me = await meWithToken(tampered).expect(401);
    expect(me.body.error.code).toBe("UNAUTHENTICATED");
    expectCookieCleared(me);
  });

  it("token hết hạn: 401", async () => {
    const user = await createUser("sv@example.com");
    const expired = await new SignJWT()
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuedAt(now() - 8 * 24 * 3600)
      .setExpirationTime(now() - 24 * 3600)
      .sign(key);

    const me = await meWithToken(expired).expect(401);
    expectCookieCleared(me);
  });

  it("token dùng alg: none (không có chữ ký): 401", async () => {
    const user = await createUser("sv@example.com");
    const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
    const unsigned = `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub: user.id, iat: now(), exp: now() + 3600 })}.`;

    await meWithToken(unsigned).expect(401);
  });

  it("token ký bằng khóa khác, như sau khi đổi JWT_SECRET: 401", async () => {
    const user = await createUser("sv@example.com");
    const otherKey = new TextEncoder().encode("mot-khoa-khac-hoan-toan-0123456789abcdef");
    const token = await new SignJWT()
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(otherKey);

    await meWithToken(token).expect(401);
  });

  it("bị khóa sau khi đăng nhập: request kế tiếp nhận 403 ACCOUNT_LOCKED và cookie bị xóa", async () => {
    const user = await createUser("sv@example.com");
    const agent = await loginAs("sv@example.com");
    await prisma.user.update({ where: { id: user.id }, data: { isLocked: true } });

    const me = await agent.get("/api/auth/me").expect(403);
    expect(me.body.error.code).toBe("ACCOUNT_LOCKED");
    expectCookieCleared(me);
  });

  it("đổi role trong DB: /me trả role mới ngay, không cần đăng nhập lại", async () => {
    const user = await createUser("sv@example.com");
    const agent = await loginAs("sv@example.com");
    await prisma.user.update({ where: { id: user.id }, data: { role: "TEACHER" } });

    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.user.role).toBe("TEACHER");
  });

  it("user đã bị xóa nhưng còn token: 401 và cookie bị xóa", async () => {
    const user = await createUser("sv@example.com");
    const agent = await loginAs("sv@example.com");
    await prisma.user.delete({ where: { id: user.id } });

    const me = await agent.get("/api/auth/me").expect(401);
    expectCookieCleared(me);
  });
});

describe("POST /api/auth/logout", () => {
  it("chưa đăng nhập vẫn trả 204", async () => {
    const res = await request(app).post("/api/auth/logout").expect(204);
    expectCookieCleared(res);
  });

  it("đăng xuất xong thì /me trả 401", async () => {
    await createUser("sv@example.com");
    const agent = await loginAs("sv@example.com");
    const res = await agent.post("/api/auth/logout").expect(204);
    expectCookieCleared(res);
    await agent.get("/api/auth/me").expect(401);
  });
});

describe("POST /api/auth/change-password", () => {
  const NEW_PASSWORD = "mat-khau-moi-456";

  it("chưa đăng nhập: 401", async () => {
    await request(app)
      .post("/api/auth/change-password")
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(401);
  });

  it("sai mật khẩu hiện tại: 400 WRONG_CURRENT_PASSWORD (không phải 401), lỗi ở ô currentPassword", async () => {
    await createUser("sv@example.com");
    const agent = await loginAs("sv@example.com");

    const res = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: "sai-mat-khau", newPassword: NEW_PASSWORD })
      .expect(400);
    expect(res.body.error.code).toBe("WRONG_CURRENT_PASSWORD");
    expect(res.body.error.fields).toEqual({ currentPassword: "Mật khẩu hiện tại không đúng" });
  });

  it("mật khẩu mới dưới 8 ký tự: 400 kèm fields.newPassword", async () => {
    await createUser("sv@example.com");
    const agent = await loginAs("sv@example.com");

    const res = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: PASSWORD, newPassword: "ngan" })
      .expect(400);
    expect(res.body.error.fields).toEqual({ newPassword: "Mật khẩu cần ít nhất 8 ký tự" });
  });

  it("đúng: 204, phiên hiện tại vẫn dùng được, mật khẩu mới đăng nhập được, mật khẩu cũ bị 401", async () => {
    await createUser("sv@example.com");
    const agent = await loginAs("sv@example.com");

    await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(204);

    await agent.get("/api/auth/me").expect(200);
    await login("sv@example.com", NEW_PASSWORD).expect(200);
    await login("sv@example.com", PASSWORD).expect(401);
  });
});
