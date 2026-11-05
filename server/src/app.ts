import cookieParser from "cookie-parser";
import express from "express";
import type { HealthResponse } from "@studymate/shared";
import { prisma } from "./db.js";
import { aiHealthy } from "./lib/ai-client.js";
import { errorHandler } from "./lib/errors.js";
import { adminRouter } from "./modules/admin/routes.js";
import { authRouter } from "./modules/auth/routes.js";

// Tạo app và gắn middleware, router. Không mở cổng ở đây để test gọi thẳng app qua Supertest.
export const app = express();
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", async (_req, res) => {
  const [db, ai] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true, () => false),
    aiHealthy(),
  ]);
  const body: HealthResponse = { ok: true, db, ai };
  res.status(db && ai ? 200 : 503).json(body);
});

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);

// Phải đứng sau mọi router.
app.use(errorHandler);
