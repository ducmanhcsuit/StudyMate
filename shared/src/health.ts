import { z } from "zod";

// GET /api/health
export const healthResponse = z.object({
  ok: z.boolean(),
  db: z.boolean(),
  ai: z.boolean(),
});
export type HealthResponse = z.infer<typeof healthResponse>;
