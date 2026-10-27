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
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
