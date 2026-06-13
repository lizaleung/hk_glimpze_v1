"""Vercel Python serverless function: GET /api/hsi_valuation

Returns raw HSI constituent valuation metrics as JSON. Picked up natively by
Vercel's Python runtime (see vercel.json). Locally, the same fetch logic is
served by scripts/dev_api.py so `npm run dev` works without `vercel dev`.
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(__file__))
from _lib.yf_source import fetch_hsi_payload  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 — Vercel/BaseHTTPRequestHandler contract
        try:
            payload = fetch_hsi_payload()
            self._send(200, payload)
        except Exception as exc:  # noqa: BLE001
            self._send(500, {"error": str(exc)})

    def _send(self, status: int, obj: dict) -> None:
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
