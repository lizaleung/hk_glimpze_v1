"""Local dev server for the Python data function.

Serves the same fetch logic as the Vercel function (api/hsi_valuation.py) on
localhost:8000 so `npm run dev` gives full end-to-end data without needing
`vercel dev`. Routes:

    GET /api/hsi_valuation  ->  raw HSI valuation payload

In production this file is NOT used — Vercel serves api/*.py natively.
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
from _lib.yf_source import fetch_hsi_payload  # noqa: E402

PORT = int(os.environ.get("DEV_API_PORT", "8000"))


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path.rstrip("/") != "/api/hsi_valuation":
            self._send(404, {"error": f"no route for {self.path}"})
            return
        try:
            self._send(200, fetch_hsi_payload())
        except Exception as exc:  # noqa: BLE001
            self._send(500, {"error": str(exc)})

    def _send(self, status: int, obj: dict) -> None:
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):  # quieter dev logs
        sys.stderr.write("[dev-api] " + (fmt % args) + "\n")


if __name__ == "__main__":
    print(f"[dev-api] serving on http://localhost:{PORT}/api/hsi_valuation")
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
