from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from app.routes import sessions, tasks

load_dotenv()

app = FastAPI(title="Platform API")

# CORS — FRONTEND_URL is comma-separated (prod domain, custom domain, ...);
# the regex additionally admits any Vercel deployment (prod alias + previews),
# so a renamed project or preview URL can't silently break CORS.
allowed_origins = [
    "http://localhost:3000",
    *[o.strip().rstrip("/") for o in os.getenv("FRONTEND_URL", "").split(",")],
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in allowed_origins if o],
    allow_origin_regex=r"https://[a-z0-9-]+\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tasks.router)
app.include_router(sessions.router)


@app.get("/health")
def health():
    return {"status": "ok"}