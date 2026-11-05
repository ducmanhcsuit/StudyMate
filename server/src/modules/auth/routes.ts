import { Router } from "express";
import { changePasswordRequest, loginRequest, registerRequest } from "@studymate/shared";
import { prisma } from "../../db.js";
import {
  authUserSelect,
  endSession,
  hashPassword,
  requireAuth,
  startSession,
  verifyAgainstDummy,
  verifyPassword,
} from "../../lib/auth.js";
import { AppError, isPrismaError } from "../../lib/errors.js";

// 5 endpoint /api/auth/*. Luồng: docs/luong-xu-ly/dang-nhap-phan-quyen.md, mục 5.1–5.7.
// Body sai schema: .parse() ném ZodError, middleware lỗi đổi thành 400 VALIDATION_ERROR.
export const authRouter = Router();

// Mục 5.1. Đăng ký xong là đăng nhập luôn.
// ponytail: không xác minh email, chưa có quên mật khẩu. Nâng cấp: gửi email xác minh
// và email đặt lại mật khẩu (cần dịch vụ gửi mail).
authRouter.post("/register", async (req, res) => {
  const { email, password } = registerRequest.parse(req.body);
  const passwordHash = await hashPassword(password);

  // Không SELECT trước để xem email đã có chưa: hai request cùng lúc có thể cùng thấy "chưa có".
  // Để ràng buộc UNIQUE của DB quyết định thì chỉ một request thành công.
  let user;
  try {
    user = await prisma.user.create({
      data: { email, passwordHash, role: "STUDENT" },
      select: authUserSelect,
    });
  } catch (err) {
    if (isPrismaError(err, "P2002")) {
      throw new AppError(409, "EMAIL_TAKEN", "Email này đã được đăng ký");
    }
    throw err;
  }

  await startSession(res, user.id);
  res.status(201).json({ user });
});

// Mục 5.2. Sai email hay sai mật khẩu đều nhận cùng một lỗi, sau cùng một khoảng thời gian.
// ponytail: chưa giới hạn số lần đăng nhập sai, bcrypt chỉ làm chậm chứ không chặn việc dò mật khẩu.
// Nâng cấp: giới hạn theo IP ở route này (cần thêm dependency và cấu hình `trust proxy`).
authRouter.post("/login", async (req, res) => {
  const { email, password } = loginRequest.parse(req.body);
  const invalid = new AppError(401, "INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { ...authUserSelect, passwordHash: true, isLocked: true },
  });
  if (!user) {
    await verifyAgainstDummy(password);
    throw invalid;
  }
  if (!(await verifyPassword(password, user.passwordHash))) throw invalid;

  // Chỉ báo bị khóa khi mật khẩu đã đúng, để người ngoài không biết tài khoản nào đang bị khóa.
  if (user.isLocked) throw new AppError(403, "ACCOUNT_LOCKED", "Tài khoản của bạn đã bị khóa");

  await startSession(res, user.id);
  res.json({ user: { id: user.id, email: user.email, role: user.role } });
});

// Mục 5.5. Không cần đăng nhập, gọi nhiều lần vẫn 204, để client luôn đăng xuất được.
// ponytail: server không thu hồi token; ai đã sao chép được token vẫn dùng được đến khi hết hạn.
// Nâng cấp: cột User.passwordChangedAt như ở change-password, hoặc lưu danh sách phiên trong DB.
authRouter.post("/logout", (_req, res) => {
  endSession(res);
  res.status(204).end();
});

// Mục 5.6. Client gọi khi mở app để biết đã đăng nhập chưa và hiện menu theo role.
authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Mục 5.7.
authRouter.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = changePasswordRequest.parse(req.body);
  const userId = req.user!.id;

  const { passwordHash } = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!(await verifyPassword(currentPassword, passwordHash))) {
    // 400 chứ không phải 401: client hiểu 401 là hết phiên và sẽ đẩy người dùng về trang đăng nhập.
    const message = "Mật khẩu hiện tại không đúng";
    throw new AppError(400, "WRONG_CURRENT_PASSWORD", message, { currentPassword: message });
  }

  // Cookie hiện tại giữ nguyên.
  // ponytail: phiên ở máy khác vẫn dùng được đến khi token hết hạn (tối đa 7 ngày).
  // Nâng cấp: thêm cột User.passwordChangedAt; requireAuth từ chối token có iat sớm hơn cột này (cần sửa schema).
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  res.status(204).end();
});
