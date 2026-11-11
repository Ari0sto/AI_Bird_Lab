"""Read-only live smoke checks. Start docker compose + web/API before running.

Environment variables:
  BIRDLAB_CENTRAL_URL=http://localhost:5000
  BIRDLAB_AI_URL=http://localhost:8000  (optional)
  BIRDLAB_TEST_TOKEN=... (optional, actual user bearer token)

Does not create accounts, spend quota or publish RabbitMQ messages.
"""
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

CENTRAL = os.getenv("BIRDLAB_CENTRAL_URL", "http://localhost:5000").rstrip("/")
AI = os.getenv("BIRDLAB_AI_URL", "").rstrip("/")
TOKEN = os.getenv("BIRDLAB_TEST_TOKEN", "")


def get(url, token=""):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    try:
        with urlopen(Request(url, headers=headers), timeout=8) as response:
            return response.status, response.read().decode("utf-8", errors="replace")
    except HTTPError as error:
        return error.code, error.read().decode("utf-8", errors="replace")


def check(label, url, expected, token=""):
    status, body = get(url, token)
    ok = status in expected
    print(("PASS" if ok else "FAIL") + f" {label}: HTTP {status} (expected {expected})")
    return ok, body


def main():
    passed = []
    try:
        ok, body = check("Central health", CENTRAL + "/health", {200})
        passed.append(ok)
        if ok:
            obj = json.loads(body)
            passed.append(obj.get("status") == "Central Server is running")
            print(("PASS" if passed[-1] else "FAIL") + " Central health JSON")
        for path in ("/api/ai/quota", "/api/ai/history", "/api/user/me"):
            ok, _ = check(f"Anonymous {path}", CENTRAL + path, {401})
            passed.append(ok)
        if AI:
            ok, _ = check("Python health", AI + "/api/health", {200})
            passed.append(ok)
            ok, _ = check("Central -> AI proxy", CENTRAL + "/api/ai/health", {200})
            passed.append(ok)
        if TOKEN:
            for path in ("/api/user/me", "/api/ai/quota", "/api/ai/history", "/api/ai/stats"):
                ok, _ = check(f"Authorized {path}", CENTRAL + path, {200}, TOKEN)
                passed.append(ok)
    except (URLError, TimeoutError, ValueError, OSError) as error:
        print(f"FAIL connection / response: {error}")
        return 1
    print(f"Result: {sum(passed)} / {len(passed)} checks passed")
    return 0 if all(passed) else 1


if __name__ == "__main__":
    sys.exit(main())
