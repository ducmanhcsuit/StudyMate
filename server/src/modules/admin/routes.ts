import { Router } from "express";
import { updateUserRequest } from "@studymate/shared";
import { prisma } from "../../db.js";
import { authUserSelect, requireAuth, requireRole } from "../../lib/auth.js";
import { AppError, isPrismaError } from "../../lib/errors.js";

// API Admin. Hiện chỉ có đổi quyền và khóa tài khoản (làm sớm), phần còn lại làm ở tuần 7.
export const adminRouter = Router();

// Mọi route của Admin đều cần đăng nhập và role ADMIN.
adminRouter.use(requireAuth, requireRole("ADMIN"));

// Mục 5.9. Thay đổi có hiệu lực ngay từ request kế tiếp của người bị sửa,
// vì requireAuth đọc lại DB ở mỗi request; không cần thu hồi token.
adminRouter.patch("/users/:id", async (req, res) => {
  const data = updateUserRequest.parse(req.body);

  // Admin duy nhất lỡ tự hạ quyền hoặc tự khóa mình thì không còn ai quản trị.
  // Muốn sửa một Admin thì dùng tài khoản Admin khác.
  if (req.params.id === req.user!.id) {
    throw new AppError(403, "FORBIDDEN", "Không thể tự đổi quyền hoặc tự khóa tài khoản của chính mình");
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { ...authUserSelect, isLocked: true },
    });
    res.json({ user });
  } catch (err) {
    if (isPrismaError(err, "P2025")) throw new AppError(404, "NOT_FOUND", "Không tìm thấy tài khoản");
    throw err;
  }
});
