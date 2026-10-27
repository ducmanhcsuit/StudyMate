import { z } from "zod";

// Hợp đồng Express ↔ Python. Chép tay từ Pydantic trong ai/app/main.py, sửa bên nào thì sửa cả bên kia.

// GET /health
export const aiHealthResponse = z.object({ ok: z.literal(true) });
