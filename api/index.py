"""Python API (FastAPI) for features that need Python.

Every route lives under /api/py so it never collides with the Next.js routes in
src/app/api. The browser calls /api/py/*:

- Locally, next.config.ts proxies it to this app (npm run dev:py, port 8000).
- On Vercel, next.config.ts rewrites it to this function.

Auth is enforced by the Clerk proxy (src/proxy.ts), not here.
"""

import platform
import sys

from fastapi import FastAPI, Request

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/api/py/health")
def health(request: Request):
    return {
        "ok": True,
        "runtime": "python",
        "framework": "fastapi",
        "python_version": sys.version.split()[0],
        "platform": platform.platform(),
        # The path this function actually received, to confirm routing in each environment.
        "path_seen": request.url.path,
    }
