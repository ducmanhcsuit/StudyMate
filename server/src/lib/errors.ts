import type { ErrorRequestHandler, Response } from "express";
import { ZodError } from "zod";
import type { ApiError, ErrorCode } from "@studymate/shared";
import { Prisma } from "../generated/prisma/client.js";

// Đưa mọi lỗi về định dạng { error: { code, message, fields } } ở shared/src/errors.ts.
// Luồng: docs/luong-xu-ly/dang-nhap-phan-quyen.md, mục 3 và 8.

// Lỗi nghiệp vụ: route ném ra kèm HTTP status và `code`, middleware lỗi bên dưới trả về cho client.
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

// P2002: vi phạm ràng buộc UNIQUE. P2025: không tìm thấy bản ghi cần update.
export function isPrismaError(err: unknown, code: "P2002" | "P2025"): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;
}

// express.json() ném lỗi có `type`, ví dụ entity.parse.failed (không phải JSON) hay entity.too.large (quá 100 KB).
function isBodyParserError(err: unknown): err is { type: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    typeof err.type === "string" &&
    "status" in err &&
    typeof err.status === "number" &&
    err.status < 500
  );
}

function send(res: Response, status: number, error: ApiError["error"]) {
  res.status(status).json({ error } satisfies ApiError);
}

// Gắn sau mọi router. Express 5 tự chuyển lỗi của handler async tới đây, nên route không cần try/catch.
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  // Đã gửi một phần phản hồi (ví dụ đang stream) thì để Express tự đóng kết nối.
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    return send(res, err.status, { code: err.code, message: err.message, fields: err.fields });
  }

  if (err instanceof ZodError) {
    // Lỗi gắn với một trường thì vào `fields` (mỗi trường giữ lỗi đầu tiên) để form hiện đúng ô.
    // Lỗi của cả body (path rỗng, ví dụ body không phải object) thì thành `message`.
    const fields: Record<string, string> = {};
    let message = "Dữ liệu không hợp lệ";
    for (const issue of err.issues) {
      if (issue.path.length === 0) message = issue.message;
      else fields[issue.path.join(".")] ??= issue.message;
    }
    const hasFields = Object.keys(fields).length > 0;
    return send(res, 400, { code: "VALIDATION_ERROR", message, fields: hasFields ? fields : undefined });
  }

  if (isBodyParserError(err)) {
    const message =
      err.type === "entity.too.large"
        ? "Dữ liệu gửi lên quá lớn"
        : "Dữ liệu gửi lên không phải JSON hợp lệ";
    return send(res, 400, { code: "VALIDATION_ERROR", message });
  }

  // Lỗi không lường trước, kể cả mất kết nối DB: ghi log đầy đủ, không trả stack trace cho client.
  console.error(err);
  send(res, 500, { code: "INTERNAL", message: "Máy chủ gặp lỗi, vui lòng thử lại sau" });
};
