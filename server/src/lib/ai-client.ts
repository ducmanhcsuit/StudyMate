import { aiHealthResponse } from "@studymate/shared";

// Gọi service Python. Chỉ Express biết INTERNAL_KEY; trình duyệt không bao giờ gọi thẳng sang ai/.
const baseUrl = process.env.AI_SERVICE_URL ?? "http://localhost:8000";
const internalKey = process.env.INTERNAL_KEY ?? "";

function aiFetch(path: string, init?: RequestInit) {
  return fetch(baseUrl + path, {
    ...init,
    headers: { ...init?.headers, "X-Internal-Key": internalKey },
  });
}

export async function aiHealthy(): Promise<boolean> {
  try {
    const res = await aiFetch("/health", { signal: AbortSignal.timeout(3000) });
    return res.ok && aiHealthResponse.safeParse(await res.json()).success;
  } catch {
    return false;
  }
}
