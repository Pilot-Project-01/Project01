from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from app.routes import sessions, tasks

load_dotenv()

app = FastAPI(title="Platform API")

# CORS — allow local frontend + future Vercel URL
allowed_origins = [
    "http://localhost:3000",
    os.getenv("FRONTEND_URL", ""),
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in allowed_origins if o],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tasks.router)
app.include_router(sessions.router)


@app.get("/health")
def health():
    return {"status": "ok"}