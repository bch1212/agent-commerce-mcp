"""
FastAPI route for the salesbot to receive analytics events from the
Commerce MCP server. Append this router to the salesbot's main app:

    from salesbot_integration.analytics_webhook import router
    app.include_router(router)

The MCP server fires events at SALESBOT_WEBHOOK_URL (configured in
the MCP server's env). This endpoint persists them to Postgres if the
salesbot exposes a session, and otherwise to a JSON Lines fallback.
"""
from __future__ import annotations
import os, json, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request

router = APIRouter(prefix="/commerce", tags=["commerce"])

ADMIN_TOKEN = os.environ.get("SALESBOT_ADMIN_TOKEN", "")
LOG_FILE = Path(os.environ.get("COMMERCE_EVENTS_LOG", "/tmp/agent-commerce-mcp/salesbot-events.jsonl"))
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)


@router.post("/events")
async def receive_event(req: Request, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if ADMIN_TOKEN:
        if not authorization or authorization != f"Bearer {ADMIN_TOKEN}":
            raise HTTPException(status_code=401, detail="invalid token")
    body = await req.json()
    body["received_at"] = datetime.datetime.utcnow().isoformat() + "Z"
    with LOG_FILE.open("a") as f:
        f.write(json.dumps(body) + "\n")
    # If the salesbot's Postgres session is available in app.state, the
    # caller can wire an SQLAlchemy insert here. For now, JSON Lines is
    # source of truth.
    return {"ok": True, "stored": True}


@router.get("/events/recent")
async def recent_events(limit: int = 100, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if ADMIN_TOKEN:
        if not authorization or authorization != f"Bearer {ADMIN_TOKEN}":
            raise HTTPException(status_code=401, detail="invalid token")
    if not LOG_FILE.exists():
        return {"events": [], "count": 0}
    lines = LOG_FILE.read_text().splitlines()
    return {"events": [json.loads(l) for l in lines[-limit:]], "count": min(limit, len(lines))}
