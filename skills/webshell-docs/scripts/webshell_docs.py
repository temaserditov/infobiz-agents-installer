#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request


def api_base() -> str:
    return os.environ.get("WEB_SHELL_API_URL", "http://127.0.0.1:8787").rstrip("/")


def request(method: str, path: str, payload: dict | None = None) -> dict:
    url = f"{api_base()}{path}"
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            raw = res.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"WebShell Docs API error {exc.code}: {raw}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Cannot reach WebShell Docs API at {url}: {exc}") from exc


def print_json(data: dict) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


def read_content(args: argparse.Namespace) -> str | None:
    if getattr(args, "content_file", None):
        with open(args.content_file, "r", encoding="utf-8") as f:
            return f.read()
    if getattr(args, "stdin", False):
        return sys.stdin.read()
    return getattr(args, "content", None)


def main() -> int:
    parser = argparse.ArgumentParser(description="Work with WebShell local docs.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list", help="List pages")

    search = sub.add_parser("search", help="Search pages")
    search.add_argument("query")
    search.add_argument("--limit", type=int, default=20)

    get = sub.add_parser("get", help="Get one page")
    get.add_argument("id")

    create = sub.add_parser("create", help="Create a page")
    create.add_argument("--title", required=True)
    create.add_argument("--content", default="")
    create.add_argument("--content-file", default="")
    create.add_argument("--stdin", action="store_true")
    create.add_argument("--parent-id", default="")
    create.add_argument("--icon", default="")

    update = sub.add_parser("update", help="Update a page")
    update.add_argument("id")
    update.add_argument("--title", default=None)
    update.add_argument("--content", default=None)
    update.add_argument("--content-file", default="")
    update.add_argument("--stdin", action="store_true")
    update.add_argument("--parent-id", default=None)
    update.add_argument("--order", type=float, default=None)
    update.add_argument("--icon", default=None)

    delete = sub.add_parser("delete", help="Delete a page and its children")
    delete.add_argument("id")

    args = parser.parse_args()

    if args.cmd == "list":
        print_json(request("GET", "/api/docs"))
    elif args.cmd == "search":
        query = urllib.parse.urlencode({"q": args.query, "limit": args.limit})
        print_json(request("GET", f"/api/docs/search?{query}"))
    elif args.cmd == "get":
        print_json(request("GET", f"/api/docs/{urllib.parse.quote(args.id)}"))
    elif args.cmd == "create":
        print_json(request("POST", "/api/docs", {
            "title": args.title,
            "content": read_content(args) or "",
            "parentId": args.parent_id or None,
            "icon": args.icon or "",
        }))
    elif args.cmd == "update":
        payload: dict = {}
        if args.title is not None:
            payload["title"] = args.title
        content = read_content(args)
        if content is not None:
            payload["content"] = content
        if args.parent_id is not None:
            payload["parentId"] = args.parent_id or None
        if args.order is not None:
            payload["order"] = args.order
        if args.icon is not None:
            payload["icon"] = args.icon
        print_json(request("PATCH", f"/api/docs/{urllib.parse.quote(args.id)}", payload))
    elif args.cmd == "delete":
        print_json(request("DELETE", f"/api/docs/{urllib.parse.quote(args.id)}"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
