"""Smoke test for Vercel's Python runtime.

GET /api/python-health returns JSON proving Python ran. Auth is enforced by the
Clerk proxy (src/proxy.ts), not here.
"""

import json
import platform
import sys
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps(
            {
                "ok": True,
                "runtime": "python",
                "python_version": sys.version.split()[0],
                "platform": platform.platform(),
            }
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
