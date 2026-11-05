import { defineConfig } from "vitest/config";

// Test chạy trên PostgreSQL thật (Q6): database riêng studymate_test, cùng container Docker với database dev.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: "./test/global-setup.ts",
    setupFiles: "./test/setup.ts",
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgresql://studymate:studymate@localhost:5432/studymate_test",
      JWT_SECRET: "khoa-chi-dung-cho-test-0123456789abcdef0123456789",
      NODE_ENV: "test",
    },
    // Các file test dùng chung một database và xóa sạch dữ liệu trước mỗi test, nên phải chạy lần lượt.
    fileParallelism: false,
  },
});
