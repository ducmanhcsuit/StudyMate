import bcrypt from "bcryptjs";
import type { CookieOptions, RequestHandler, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { AuthUser, UserRole } from "@studymate/shared";
import { prisma } from "../db.js";
import { AppError } from "./errors.js";

// Mật khẩu, JWT, cookie và hai middleware requireAuth, requireRole.
// Luồng: docs/luong-xu-ly/dang-nhap-phan-quyen.md, mục 4, 5.3 và 5.4.

declare global {
  namespace Express {
    interface Request {
      // Do requireAuth gắn vào; route đặt sau requireAuth thì luôn có.
      user?: AuthUser;
    }
  }
}

// Các cột của User được trả cho client. Không bao giờ chọn passwordHash ở đây.
export const authUserSelect = { id: true, email: true, role: true } as const;

// ---------- Mật khẩu (mục 4.2) ----------

// Mức tối thiểu OWASP khuyến nghị. Tăng thêm 1 thì thời gian hash gấp đôi, mà Render free có CPU yếu.
const BCRYPT_COST = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Hash giả, cùng cost, tạo một lần khi khởi động. Đăng nhập bằng email không tồn tại vẫn phải
// chạy một lần so bcrypt, để thời gian phản hồi giống hệt sai mật khẩu và không ai đo được
// email nào đã đăng ký (mục 5.2, bước 3a).
const dummyHash = hashPassword(crypto.randomUUID());

export async function verifyAgainstDummy(password: string): Promise<void> {
  await verifyPassword(password, await dummyHash);
}

// ---------- JWT (mục 4.3) ----------

const jwtSecret = process.env.JWT_SECRET ?? "";
if (jwtSecret.length < 32) {
  // Dừng ngay lúc khởi động, giống cách ai/ xử lý INTERNAL_KEY. RFC 7518 mục 3.2: khóa HS256 ít nhất 256 bit.
  throw new Error(
    "JWT_SECRET phải dài ít nhất 32 ký tự (đặt trong server/.env). Sinh khóa bằng lệnh: " +
      `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
  );
}
const jwtKey = new TextEncoder().encode(jwtSecret);

const SESSION_DAYS = 7;

// Payload chỉ có sub (User.id), iat, exp. Role và email được đọc lại từ DB ở mỗi request.
// ponytail: không gia hạn tự động, người đang dùng vẫn bị đăng xuất đúng 7 ngày sau lần đăng nhập.
// Nâng cấp: cấp token mới khi token còn chưa đến một nửa thời hạn.
function signToken(userId: string): Promise<string> {
  return new SignJWT()
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(jwtKey);
}

// Trả userId nếu token đúng chữ ký và chưa hết hạn, ngược lại trả null.
// Chỉ chấp nhận HS256, để chặn kiểu tấn công sửa trường `alg` của token (ví dụ `alg: none`).
async function readUserId(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, jwtKey, { algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

// ---------- Cookie (mục 4.4) ----------

// Cookie không tách theo cổng: mọi app chạy trên localhost dùng chung cookie, nên cần tên riêng.
export const AUTH_COOKIE = "studymate_token";

// Xóa cookie phải dùng đúng Path, SameSite, Secure như lúc đặt; sai một thuộc tính thì
// trình duyệt coi là cookie khác và không xóa. Vì vậy cả hai hàm dùng chung một chỗ.
const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

// Ký JWT và đặt cookie: từ request sau, người dùng đã đăng nhập.
export async function startSession(res: Response, userId: string): Promise<void> {
  const token = await signToken(userId);
  res.cookie(AUTH_COOKIE, token, { ...cookieOptions, maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 });
}

export function endSession(res: Response): void {
  res.clearCookie(AUTH_COOKIE, cookieOptions);
}

// ---------- Middleware ----------

// Mục 5.3. Mỗi request đọc lại User từ DB, nên Admin khóa tài khoản hay đổi quyền đều có hiệu lực
// ngay ở request kế tiếp; cái giá là thêm một truy vấn theo khóa chính.
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token: unknown = req.cookies?.[AUTH_COOKIE];
  if (typeof token !== "string" || token === "") {
    throw new AppError(401, "UNAUTHENTICATED", "Bạn cần đăng nhập để tiếp tục");
  }

  const userId = await readUserId(token);
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { ...authUserSelect, isLocked: true } })
    : null;
  if (!user) {
    // Token sai, hết hạn, hoặc user đã bị xóa.
    endSession(res);
    throw new AppError(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại");
  }
  if (user.isLocked) {
    endSession(res);
    throw new AppError(403, "ACCOUNT_LOCKED", "Tài khoản của bạn đã bị khóa");
  }

  req.user = { id: user.id, email: user.email, role: user.role };
  next();
};

// Mục 5.4. Đặt sau requireAuth. Chỉ xét vai trò trên toàn hệ thống;
// quyền theo từng khóa học được kiểm tra trong module khóa học.
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    // Lỡ quên requireAuth thì req.user trống: từ chối luôn thay vì cho qua.
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError(403, "FORBIDDEN", "Bạn không có quyền thực hiện thao tác này");
    }
    next();
  };
}
