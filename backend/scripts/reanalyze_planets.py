"""Audit existing planets against the current AI; writes require --apply.

Run inside backend with its existing server environment:
  python scripts/reanalyze_planets.py
  python scripts/reanalyze_planets.py --apply
  python scripts/reanalyze_planets.py --sample-text "테스트"

No diary text, account identifiers or secrets are printed. Only saved color and
brightness are updated; positions, topics, content and equipped items stay intact.
Restart the backend after applying to clear its old process-local visual cache.
"""
from __future__ import annotations

import argparse
from collections import Counter
import math
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def analyze_result(result: dict) -> tuple[dict, str]:
    star, visual = result["star"], result["visual"]
    color, brightness = star["color"], float(star["brightness"])
    state = visual["state"]
    if not isinstance(color, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
        raise ValueError("Invalid color")
    if not math.isfinite(brightness) or state not in {"clear", "soft", "muted", "none"}:
        raise ValueError("Invalid analysis")
    return {"color": color.upper(), "brightness": max(0.0, min(3.0, brightness))}, state


def run_audit(db, analyze, *, apply=False, batch_size=8, user_id=None):
    counts = Counter()
    offset = 0
    while True:
        query = db.table("stars").select("id,diary_id,color,brightness,diaries!inner(content,user_id)").order("id")
        if user_id:
            query = query.eq("diaries.user_id", user_id)
        rows = query.range(offset, offset + 199).execute().data
        if not rows:
            break
        offset += len(rows)
        counts["total"] += len(rows)
        valid = [row for row in rows if (row.get("diaries") or {}).get("content", "").strip()]
        counts["empty"] += len(rows) - len(valid)
        for start in range(0, len(valid), batch_size):
            chunk = valid[start:start + batch_size]
            try:
                results = analyze([row["diaries"]["content"] for row in chunk])
                if len(results) != len(chunk):
                    raise ValueError("Result count mismatch")
            except Exception:
                counts["failed"] += len(chunk)
                continue
            for row, result in zip(chunk, results):
                try:
                    patch, state = analyze_result(result)
                except (ValueError, KeyError, TypeError, OverflowError):
                    counts["failed"] += 1
                    continue
                counts[state] += 1
                changed = row.get("color", "").upper() != patch["color"] or row.get("brightness") != patch["brightness"]
                if changed:
                    counts["changed"] += 1
                    if apply:
                        try:
                            db.table("stars").update(patch).eq("id", row["id"]).execute()
                            counts["updated"] += 1
                        except Exception:
                            counts["write_failed"] += 1
        print(f"Checked {counts['total']} planets", flush=True)
    return counts


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--user-id", help="Optional account scope; omitted means all existing planets")
    parser.add_argument("--batch-size", type=int, default=8, choices=range(1, 65))
    parser.add_argument("--sample-text", help="Analyze a sample only; never reads or writes the DB")
    parser.add_argument("--timeout", type=float, default=60, help="AI timeout in seconds for this audit only (default: 60)")
    args = parser.parse_args(argv)
    if not math.isfinite(args.timeout) or not 0 < args.timeout <= 600:
        parser.error("--timeout must be between 0 and 600 seconds")
    from app import ai_client
    if not ai_client.settings.ai_service_url:
        print("AI_SERVICE_URL is not configured. No changes made.")
        return 2
    ai_client.settings.ai_service_timeout = args.timeout

    def analyze(texts):
        return ai_client._post("/analyze/batch", {"texts": texts}).json()["results"]

    if args.sample_text is not None:
        try:
            result = analyze([args.sample_text])[0]
            patch, state = analyze_result(result)
            print({"state": state, "primary": result["visual"]["primary"], **patch})
            return 0
        except Exception:
            print("Sample analysis failed. Check the AI service logs. No changes made.")
            return 1
    from app.db import supabase
    try:
        counts = run_audit(supabase, analyze, apply=args.apply, batch_size=args.batch_size, user_id=args.user_id)
    except Exception:
        print("Database scan failed. Check server configuration; completed batches may already be applied if --apply was used.")
        return 1
    print("APPLY" if args.apply else "AUDIT ONLY — database unchanged")
    print(dict(counts))
    print("none / muted can legitimately remain gray; no emotion is forced.")
    return 1 if counts["failed"] or counts["write_failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
