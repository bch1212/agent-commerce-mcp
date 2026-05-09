#!/usr/bin/env python3
"""
Analytics dashboard + daily report for the Halverson IQ Commerce MCP.
- Reads JSON Lines event log from the MCP server.
- Computes funnel: browse → pricing → checkout → install/affiliate.
- Posts a daily summary to Discord.
- Optionally serves an HTTP /dashboard view.
"""
from __future__ import annotations
import os, json, sys, datetime
from collections import Counter, defaultdict
from pathlib import Path
from urllib import request as urlrequest

LOG_PATH = Path(os.environ.get("ANALYTICS_LOG_PATH", "/tmp/halversoniq-commerce/events.jsonl"))
DISCORD_WEBHOOK = os.environ.get("DISCORD_WEBHOOK_URL", "")


def load_events(since_hours: int = 24) -> list[dict]:
    if not LOG_PATH.exists():
        return []
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(hours=since_hours)
    out: list[dict] = []
    for line in LOG_PATH.read_text().splitlines():
        if not line.strip():
            continue
        try:
            ev = json.loads(line)
            ts = datetime.datetime.fromisoformat(ev["ts"].replace("Z", ""))
            if ts >= cutoff:
                out.append(ev)
        except Exception:
            continue
    return out


def summarize(events: list[dict]) -> dict:
    by_action = Counter(ev.get("action", "?") for ev in events)
    by_tool = Counter(ev.get("tool", "?") for ev in events)
    top_products = Counter(ev["product_slug"] for ev in events if ev.get("product_slug")).most_common(5)
    affiliates = sum(1 for ev in events if ev.get("tool") == "register_affiliate")
    checkouts = sum(1 for ev in events if ev.get("action") == "checkout")
    installs = sum(1 for ev in events if ev.get("action") == "install")
    browses = sum(1 for ev in events if ev.get("action") == "browse")
    funnel_pct = round(checkouts / browses * 100, 1) if browses else 0.0

    return {
        "total_events": len(events),
        "by_action": dict(by_action),
        "by_tool": dict(by_tool),
        "top_products": top_products,
        "affiliates_registered": affiliates,
        "checkouts_created": checkouts,
        "installs": installs,
        "browses": browses,
        "browse_to_checkout_pct": funnel_pct,
    }


def render_discord(summary: dict, hours: int) -> str:
    if not summary["total_events"]:
        return f":bar_chart: **Halverson IQ Commerce — last {hours}h**\nNo agent activity yet. Outreach engine will keep posting to MCP registries."
    lines = [
        f":bar_chart: **Halverson IQ Commerce — last {hours}h**",
        f"• Total tool calls: **{summary['total_events']}**",
        f"• Browses: {summary['browses']} • Checkouts: {summary['checkouts_created']} ({summary['browse_to_checkout_pct']}%)",
        f"• Installs: {summary['installs']} • Affiliates registered: {summary['affiliates_registered']}",
    ]
    if summary["top_products"]:
        tp = ", ".join(f"{slug} ({n})" for slug, n in summary["top_products"])
        lines.append(f"• Top products: {tp}")
    if summary["by_tool"]:
        tt = ", ".join(f"{tool}({n})" for tool, n in sorted(summary["by_tool"].items(), key=lambda x: -x[1])[:5])
        lines.append(f"• Top tools: {tt}")
    return "\n".join(lines)


def post_discord(text: str) -> None:
    if not DISCORD_WEBHOOK:
        print(text)
        return
    body = json.dumps({"content": text}).encode()
    req = urlrequest.Request(
        DISCORD_WEBHOOK,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=10) as r:
            r.read()
    except Exception as e:
        print(f"Discord post failed: {e}", file=sys.stderr)


def main(hours: int = 24) -> None:
    events = load_events(hours)
    summary = summarize(events)
    text = render_discord(summary, hours)
    post_discord(text)
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    h = int(sys.argv[1]) if len(sys.argv) > 1 else 24
    main(h)
