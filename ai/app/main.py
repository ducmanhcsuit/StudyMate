import os
import secrets

from fastapi import Depends, FastAPI, Header, HTTPException

# Thiếu INTERNAL_KEY thì dừng ngay lúc khởi động, không chạy ở chế độ mở.
INTERNAL_KEY = os.environ["INTERNAL_KEY"]


def check_internal_key(x_internal_key: str = Header(default="")) -> None:
    if not secrets.compare_digest(x_internal_key, INTERNAL_KEY):
        raise HTTPException(status_code=401)


# Chỉ Express gọi service này; mọi route đều phải có X-Internal-Key.
app = FastAPI(title="StudyMate AI", dependencies=[Depends(check_internal_key)])


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}
