import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile();
} catch {
  // không có .env (ví dụ trên CI) thì dùng biến môi trường sẵn có
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Prisma 7 không tự chạy seed sau migrate; chạy tay: npx prisma db seed
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
