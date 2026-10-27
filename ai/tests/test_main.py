import os

os.environ["INTERNAL_KEY"] = "test-key"

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_with_key():
    res = client.get("/health", headers={"X-Internal-Key": "test-key"})
    assert res.status_code == 200
    assert res.json() == {"ok": True}


def test_rejects_missing_or_wrong_key():
    assert client.get("/health").status_code == 401
    assert client.get("/health", headers={"X-Internal-Key": "sai"}).status_code == 401
