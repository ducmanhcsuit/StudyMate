import { afterAll, beforeEach } from "vitest";
import { prisma } from "../src/db.js";

// Chạy trong mỗi file test. Mỗi test bắt đầu với database trống:
// TRUNCATE ... CASCADE xóa luôn mọi bảng tham chiếu tới User (khóa học, tài liệu, chat...).
beforeEach(async () => {
  await prisma.$executeRaw`TRUNCATE "User" CASCADE`;
});

afterAll(async () => {
  await prisma.$disconnect();
});
