import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";

// Chạy một lần trước mọi file test: áp migration lên database test.
// `migrate deploy` tự tạo database nếu chưa có và không xóa dữ liệu, chạy lại bao nhiêu lần cũng được.
export function setup(project: TestProject) {
  const databaseUrl = project.config.env.DATABASE_URL ?? "";

  // Test xóa sạch bảng User trước mỗi test, nên chặn trường hợp lỡ trỏ vào database thật.
  const dbName = new URL(databaseUrl).pathname.slice(1);
  if (!dbName.endsWith("_test")) {
    throw new Error(`Database cho test phải có tên kết thúc bằng _test, đang là "${dbName}"`);
  }

  execSync("npx prisma migrate deploy", {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}
