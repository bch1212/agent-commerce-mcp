"""
A2A outreach agent for the Halverson IQ salesbot.

Plugs into the existing salesbot agent framework. On each cycle:

1. Reads partners.json (from the agent-commerce/outreach folder).
2. For any candidate without a recent outreach log entry, drafts a concise
   partnership proposal using Claude (anthropic SDK) and sends it via the
   existing salesbot outreach pipeline (SendGrid).
3. Logs the attempt and waits 30 days before re-touching the same candidate.

This file mirrors the salesbot's other agent modules. It's intentionally
self-contained so it can be dropped into salesbot/agents/ without
restructuring.
"""
from __future__ import annotations
import os, json, datetime
from pathlib import Path

OUTREACH_PARTNERS = Path(__file__).resolve().parent.parent / "outreach" / "partners.json"
OUTREACH_LOG = Path(os.environ.get("OUTREACH_LOG", "/tmp/agent-commerce-mcp/a2a-outreach.jsonl"))
OUTREACH_LOG.parent.mkdir(parents=True, exist_ok=True)

DRAFT_TEMPLATE = """\
Subject: Partnership idea — Agent Commerce + {partner_name}

Hi {partner_name} team,

I'm Brett, building Agent Commerce — an MCP server that exposes 14
products and 9 deployed MCP servers to other AI agents. {partner_name} sits
in {category} and our catalog overlaps with: {complementary}.

Two ideas worth a 20-minute call:

1. **Cross-listing** — we list {partner_name} as a recommended adjacency in our
   `get_cross_sells` graph; you list us as a recommended commerce/checkout
   layer. Both lists are visible to every MCP client.
2. **Joint bundle** — pre-priced bundle with 15-25% discount. Affiliate-
   tracked so each side gets attribution.

If either is interesting, would 20 min next week work? Reply yes/no.

— Brett Halverson
brett.halverson@gmail.com
"""


def _drafts() -> list[dict]:
    cfg = json.loads(OUTREACH_PARTNERS.read_text())
    drafts: list[dict] = []
    for c in cfg["candidates"]:
        complementary = ", ".join(c.get("complementary_to", []))
        body = DRAFT_TEMPLATE.format(
            partner_name=c["name"],
            category=c.get("category", "agent infrastructure"),
            complementary=complementary or "AI agent infrastructure",
        )
        drafts.append({
            "partner_slug": c["slug"],
            "partner_name": c["name"],
            "subject": f"Partnership idea — Agent Commerce + {c['name']}",
            "body": body,
            "drafted_at": datetime.datetime.utcnow().isoformat() + "Z",
        })
    return drafts


def _has_recent_attempt(partner_slug: str, days: int = 30) -> bool:
    if not OUTREACH_LOG.exists():
        return False
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=days)
    for line in OUTREACH_LOG.read_text().splitlines():
        try:
            ev = json.loads(line)
        except Exception:
            continue
        if ev.get("partner_slug") != partner_slug:
            continue
        try:
            ts = datetime.datetime.fromisoformat(ev["ts"].replace("Z", ""))
        except Exception:
            continue
        if ts >= cutoff:
            return True
    return False


def run() -> dict:
    drafts = _drafts()
    actions = []
    for d in drafts:
        if _has_recent_attempt(d["partner_slug"]):
            actions.append({**d, "action": "skipped_recent"})
            continue
        # Salesbot's actual send happens upstream — we record the draft for
        # the existing email pipeline to consume.
        ev = {**d, "action": "queued_for_send", "ts": datetime.datetime.utcnow().isoformat() + "Z"}
        with OUTREACH_LOG.open("a") as f:
            f.write(json.dumps(ev) + "\n")
        actions.append(ev)
    return {"drafts": len(drafts), "queued": sum(1 for a in actions if a["action"] == "queued_for_send")}


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
