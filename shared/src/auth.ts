import { z } from "zod";

// Đăng ký, đăng nhập, đổi mật khẩu và API Admin sửa tài khoản.
// Quy tắc: docs/luong-xu-ly/dang-nhap-phan-quyen.md, mục 3 và 4.

const NOT_AN_OBJECT = "Dữ liệu gửi lên phải là một đối tượng JSON";

// Mục 4.1. Cột User.email phân biệt hoa thường, nên phải chuẩn hóa trước cả khi lưu lẫn khi tìm.
// Chuẩn hóa xong mới kiểm tra định dạng (pipe), để " A@B.CO " vẫn hợp lệ.
const email = z
  .string({ error: "Vui lòng nhập email" })
  .trim()
  .toLowerCase()
  .max(254, "Email dài quá 254 ký tự")
  .pipe(z.email("Email không hợp lệ"));

// Mục 4.2. bcrypt chỉ dùng 72 byte đầu và bỏ phần còn lại mà không báo lỗi.
// Chữ tiếng Việt có dấu chiếm 2–3 byte, nên giới hạn tính theo byte UTF-8 chứ không theo số ký tự.
// TextEncoder có cả ở trình duyệt lẫn Node, nên schema này dùng được ở cả client và server.
const MAX_PASSWORD_BYTES = 72;
const fitsBcrypt = (s: string) => new TextEncoder().encode(s).length <= MAX_PASSWORD_BYTES;
const TOO_LONG = "Mật khẩu dài quá 72 byte (mỗi chữ có dấu chiếm 2–3 byte)";

// NFKC: cùng một chữ có dấu, bộ gõ ở máy khác nhau có thể sinh ra dạng dựng sẵn hoặc dạng tổ hợp.
// Không chuẩn hóa thì gõ đúng mật khẩu ở máy khác vẫn bị báo sai.
const password = z.string({ error: "Vui lòng nhập mật khẩu" }).normalize("NFKC");

// Mật khẩu mới (đăng ký, đổi mật khẩu): ít nhất 8 ký tự, tối đa 72 byte.
const newPassword = password.min(8, "Mật khẩu cần ít nhất 8 ký tự").refine(fitsBcrypt, TOO_LONG);

// Mật khẩu đã có (đăng nhập, mật khẩu hiện tại): không áp độ dài tối thiểu,
// để sau này đổi quy tắc thì tài khoản cũ vẫn đăng nhập được.
const existingPassword = password.min(1, "Vui lòng nhập mật khẩu").refine(fitsBcrypt, TOO_LONG);

export const userRole = z.enum(["STUDENT", "TEACHER", "ADMIN"], {
  error: "Vai trò phải là STUDENT, TEACHER hoặc ADMIN",
});
export type UserRole = z.infer<typeof userRole>;

// z.object bỏ các trường lạ, nên body đăng ký có `role: "ADMIN"` cũng không có tác dụng.
export const registerRequest = z.object({ email, password: newPassword }, { error: NOT_AN_OBJECT });
export type RegisterRequest = z.infer<typeof registerRequest>;

export const loginRequest = z.object({ email, password: existingPassword }, { error: NOT_AN_OBJECT });
export type LoginRequest = z.infer<typeof loginRequest>;

export const changePasswordRequest = z.object(
  { currentPassword: existingPassword, newPassword },
  { error: NOT_AN_OBJECT },
);
export type ChangePasswordRequest = z.infer<typeof changePasswordRequest>;

// Dạng `user` mà /api/auth/* trả về. Không bao giờ có passwordHash.
export const authUser = z.object({ id: z.string(), email: z.string(), role: userRole });
export type AuthUser = z.infer<typeof authUser>;

// PATCH /api/admin/users/:id. Cả hai trường đều không bắt buộc nhưng phải có ít nhất một.
export const updateUserRequest = z
  .object(
    {
      role: userRole.optional(),
      isLocked: z.boolean({ error: "isLocked phải là true hoặc false" }).optional(),
    },
    { error: NOT_AN_OBJECT },
  )
  .refine((body) => body.role !== undefined || body.isLocked !== undefined, {
    error: "Cần gửi ít nhất một trong hai trường: role, isLocked",
  });
export type UpdateUserRequest = z.infer<typeof updateUserRequest>;

// Dạng `user` mà API Admin trả về: có thêm isLocked.
export const adminUser = authUser.extend({ isLocked: z.boolean() });
export type AdminUser = z.infer<typeof adminUser>;
