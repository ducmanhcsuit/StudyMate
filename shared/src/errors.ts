import { z } from "zod";

// Định dạng lỗi chung của mọi API: { error: { code, message, fields } }.
// Client rẽ nhánh theo `code` (không so `message`), hiện `message` cho người dùng,
// và gắn `fields` vào đúng ô của form. Bảng mã lỗi: docs/luong-xu-ly/dang-nhap-phan-quyen.md, mục 3.
export const errorCode = z.enum([
  "VALIDATION_ERROR", // 400: body sai schema hoặc không phải JSON hợp lệ
  "WRONG_CURRENT_PASSWORD", // 400: đổi mật khẩu mà mật khẩu hiện tại sai
  "UNAUTHENTICATED", // 401: chưa đăng nhập, token sai hoặc hết hạn, user không còn
  "INVALID_CREDENTIALS", // 401: đăng nhập sai email hoặc mật khẩu
  "ACCOUNT_LOCKED", // 403: tài khoản bị khóa
  "FORBIDDEN", // 403: đã đăng nhập nhưng không đủ quyền
  "NOT_FOUND", // 404: không tìm thấy thứ cần sửa
  "EMAIL_TAKEN", // 409: email đã được đăng ký
  "INTERNAL", // 500: lỗi không lường trước
]);
export type ErrorCode = z.infer<typeof errorCode>;

export const apiError = z.object({
  error: z.object({
    code: errorCode,
    message: z.string(),
    // Chỉ có ở lỗi 400; khóa là tên trường của body, ví dụ "password".
    fields: z.record(z.string(), z.string()).optional(),
  }),
});
export type ApiError = z.infer<typeof apiError>;
