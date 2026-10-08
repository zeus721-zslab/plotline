from fastapi import FastAPI

from app.config import get_settings

settings = get_settings()

app = FastAPI(title="Plotline API")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
