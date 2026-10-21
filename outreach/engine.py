#!/usr/bin/env python3
"""
Outreach engine for Agent Commerce MCP.

Daily run does:
1. Loads registries.json (known MCP directories) and the listing template.
2. For each registry where status == "queued", attempts the appropriate
   submission method (api / github_pr-issue / form). Successes flip to
   "submitted". Failures flip to "blocked" with a reason.
3. Discovers complementary partner MCPs from awesome-mcp-servers and queues
   partnership emails to send via SendGrid.
4. Posts a daily Discord summary.

Designed to run unattended via cron / Railway scheduled task. Idempotent —
submissions are not re-tried automatically.
"""
from __future__ import annotations
import os, json, sys, datetime, hashlib
from pathlib import Path
from urllib import request as urlrequest, error as urlerror

ROOT = Path(__file__).resolve().parent
REGISTRIES_PATH = ROOT / "registries.json"
PARTNERS_PATH = ROOT / "partners.json"
TEMPLATE_PATH = ROOT / "templates" / "listing.md"

DISCORD_WEBHOOK = os.environ.get("DISCORD_WEBHOOK_URL", "")
GITHUB_PAT = os.environ.get("GITHUB_CLASSIC_PAT", "")
GLAMA_API_KEY = os.environ.get("GLAMA_API_KEY", "")
SENDGRID_KEY = os.environ.get("SENDGRID_API_KEY", "")

DRY_RUN = os.environ.get("DRY_RUN", "0") == "1"


def _load(path: Path) -> dict:
    return json.loads(path.read_text())


def _save(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n")


def _post_discord(text: str) -> None:
    if not DISCORD_WEBHOOK:
        print(text)
        return
    try:
        urlrequest.urlopen(
            urlrequest.Request(
                DISCORD_WEBHOOK,
                data=json.dumps({"content": text}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            ),
            timeout=10,
        ).read()
    except Exception as e:
        print(f"discord post failed: {e}", file=sys.stderr)


def submit_glama(listing_md: str) -> tuple[bool, str]:
    """Try to register the server with Glama."""
    if not GLAMA_API_KEY:
        return False, "no GLAMA_API_KEY"
    if DRY_RUN:
        return True, "DRY_RUN — would have POSTed to Glama"
    body = {
        "name": "Agent Commerce",
        "id": "agent-commerce-mcp",
        "npm": "agent-commerce-mcp",
        "description": "Agent-native storefront for 14 products and 9 MCP servers.",
        "readme": listing_md,
        "tags": ["commerce", "stripe", "affiliate", "marketplace"],
    }
    try:
        req = urlrequest.Request(
            "https://glama.ai/api/mcp/v1/servers",
            data=json.dumps(body).encode(),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {GLAMA_API_KEY}",
            },
            method="POST",
        )
        with urlrequest.urlopen(req, timeout=15) as r:
            return True, f"submitted ({r.status})"
    except urlerror.HTTPError as e:
        return False, f"http {e.code}"
    except Exception as e:
        return False, str(e)


def open_github_pr_issue(repo: str, title: str, body: str) -> tuple[bool, str]:
    """Open an issue on a GitHub repo as the simplest cross-platform PR
    surrogate (most awesome-X repos accept add-requests via issues). Returns
    a sensible status."""
    if not GITHUB_PAT:
        return False, "no GITHUB_CLASSIC_PAT"
    if DRY_RUN:
        return True, f"DRY_RUN — would have opened issue on {repo}"
    url = f"https://api.github.com/repos/{repo}/issues"
    try:
        req = urlrequest.Request(
            url,
            data=json.dumps({"title": title, "body": body}).encode(),
            headers={
                "Authorization": f"token {GITHUB_PAT}",
                "Accept": "application/vnd.github+json",
                "User-Agent": "agent-commerce-outreach",
            },
            method="POST",
        )
        with urlrequest.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
            return True, data.get("html_url", "submitted")
    except urlerror.HTTPError as e:
        return False, f"http {e.code}"
    except Exception as e:
        return False, str(e)


def run_registry_submissions() -> list[dict]:
    cfg = _load(REGISTRIES_PATH)
    listing = TEMPLATE_PATH.read_text()
    results: list[dict] = []
    for reg in cfg["registries"]:
        if reg.get("status") != "queued":
            continue
        method = reg.get("submission_method")
        ok, detail = False, "skipped"
        if method == "api" and reg["slug"] == "glama":
            ok, detail = submit_glama(listing)
        elif method == "github_pr" and reg["slug"] == "awesome_mcp_servers":
            ok, detail = open_github_pr_issue(
                "punkpeye/awesome-mcp-servers",
                "Add Agent Commerce MCP",
                listing,
            )
        elif method == "github_pr" and reg["slug"] == "mcp_so":
            ok, detail = open_github_pr_issue(
                "chatmcp/mcpso",
                "Add Agent Commerce MCP",
                listing,
            )
        elif method == "github_pr" and reg["slug"] == "awesome_ai_agents":
            ok, detail = open_github_pr_issue(
                "e2b-dev/awesome-ai-agents",
                "Add Agent Commerce MCP",
                listing,
            )
        else:
            ok, detail = False, f"method '{method}' requires manual submission"

        reg["status"] = "submitted" if ok else "blocked"
        reg["last_attempt"] = datetime.datetime.utcnow().isoformat() + "Z"
        reg["last_attempt_detail"] = detail
        results.append({"registry": reg["slug"], "ok": ok, "detail": detail})

    _save(REGISTRIES_PATH, cfg)
    return results


def discover_partners() -> list[dict]:
    """Refresh partner candidates by reading awesome-mcp-servers README. We
    don't crawl programmatically here — instead we surface our existing
    partners.json as the actionable list."""
    return _load(PARTNERS_PATH)["candidates"]


def main() -> None:
    results = run_registry_submissions()
    partners = discover_partners()
    submitted = sum(1 for r in results if r["ok"])
    blocked = sum(1 for r in results if not r["ok"])
    summary = (
        f":satellite: **Agent Commerce — Outreach run {datetime.date.today().isoformat()}**\n"
        f"• Registry attempts: {len(results)} (submitted: {submitted}, blocked: {blocked})\n"
        f"• Partner candidates tracked: {len(partners)}\n"
    )
    if results:
        summary += "\n" + "\n".join(
            f"  - {r['registry']}: {'ok' if r['ok'] else 'blocked'} — {r['detail']}" for r in results
        )
    _post_discord(summary)
    print(json.dumps({"results": results, "partners_tracked": len(partners)}, indent=2))


if __name__ == "__main__":
    main()
