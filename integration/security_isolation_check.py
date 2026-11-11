"""Optional read-only isolation check. Set tokens of TWO DIFFERENT test accounts.

$env:BIRDLAB_USER1_TOKEN = '...'
$env:BIRDLAB_USER2_TOKEN = '...'
python integration/security_isolation_check.py

Requires at least one account to have real history records. No new analyses are made.
"""
import json
import os
import sys
from urllib.request import Request, urlopen

URL = os.getenv("BIRDLAB_CENTRAL_URL", "http://localhost:5000").rstrip("/")


def history(token):
    req = Request(URL + "/api/ai/history?search=", headers={
        "Authorization": "Bearer " + token,
        "Accept": "application/json",
    })
    with urlopen(req, timeout=10) as response:
        data = json.load(response)
    if not isinstance(data, list):
        raise ValueError("History response was not a list")
    return {int(item["id"]) for item in data if isinstance(item, dict) and "id" in item}


def main():
    first = os.getenv("BIRDLAB_USER1_TOKEN")
    second = os.getenv("BIRDLAB_USER2_TOKEN")
    if not first or not second:
        print("SKIP: set BIRDLAB_USER1_TOKEN and BIRDLAB_USER2_TOKEN for distinct users")
        return 2
    if first == second:
        print("FAIL: both tokens are identical; use separate accounts")
        return 2
    try:
        ids1 = history(first)
        ids2 = history(second)
    except Exception as error:
        print(f"FAIL: unable to compare histories: {error}")
        return 1
    overlap = ids1 & ids2
    if overlap:
        print(f"FAIL: histories share {len(overlap)} record IDs across accounts. Investigate authorization/ownership.")
        return 1
    if not ids1 and not ids2:
        print("INCONCLUSIVE: both accounts have empty histories; run after an analysis by test user 1")
        return 2
    print("PASS: no overlapping history record IDs; this is only a basic isolation check")
    return 0


if __name__ == "__main__":
    sys.exit(main())
