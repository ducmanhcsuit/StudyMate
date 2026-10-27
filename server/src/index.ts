import express from "express";
import type { HealthResponse } from "@studymate/shared";
import { prisma } from "./db.js";
import { aiHealthy } from "./lib/ai-client.js";

const app = express();
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  const [db, ai] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true, () => false),
    aiHealthy(),
  ]);
  const body: HealthResponse = { ok: true, db, ai };
  res.status(db && ai ? 200 : 503).json(body);
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`API chạy tại http://localhost:${port}`));
