"""FastAPI application entry point for the MITCF Research Web Platform."""
from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path
from typing import Any, Dict

import psutil
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Add project root AND backend dir to sys.path
PROJECT_ROOT = Path(__file__).parent.parent.parent
BACKEND_DIR = Path(__file__).parent
for p in (str(PROJECT_ROOT), str(BACKEND_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from api.dashboard import router as dashboard_router
from api.deep_learning import router as deep_learning_router
from api.fuzzy import router as fuzzy_router
from api.experiments import router as experiments_router
from api.system import router as system_router
from api.visual_perception import router as visual_perception_router

app = FastAPI(
    title="MITCF Research Platform API",
    description="Web API for the Modular Inference-Time Control Framework research pipeline",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(dashboard_router)
app.include_router(deep_learning_router)
app.include_router(fuzzy_router)
app.include_router(experiments_router)
app.include_router(system_router)
app.include_router(visual_perception_router)

# Serve graph images as static files
GRAPH_DIR = PROJECT_ROOT / "graph"
if GRAPH_DIR.exists():
    app.mount("/graph", StaticFiles(directory=str(GRAPH_DIR)), name="graph")


@app.get("/api/health")
def health() -> Dict[str, Any]:
    return {"status": "ok", "project_root": str(PROJECT_ROOT)}


# ─── WebSocket endpoint for real-time system stats ───────────────────────────

connected_clients: list[WebSocket] = []


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    connected_clients.append(ws)
    try:
        while True:
            mem = psutil.virtual_memory()
            payload: Dict[str, Any] = {
                "type": "system_stats",
                "timestamp": time.time(),
                "cpu_percent": psutil.cpu_percent(interval=None),
                "memory_percent": mem.percent,
                "memory_used_gb": round(mem.used / 1e9, 2),
            }
            await ws.send_text(json.dumps(payload))
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        connected_clients.remove(ws)
    except Exception:
        if ws in connected_clients:
            connected_clients.remove(ws)


@app.on_event("startup")
async def startup_event() -> None:
    print(f"MITCF Research Platform API started")
    print(f"Project root: {PROJECT_ROOT}")
    print(f"Docs: http://localhost:8000/docs")
