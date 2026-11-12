"""Entry point of the Python API (FastAPI). It only creates the app and mounts routers.

Every endpoint lives in a router.py under python_api/<feature>/, and every route is under /api/py
so it never collides with the Next.js routes in src/app/api. The browser calls /api/py/*:

- Locally, next.config.ts proxies it to this app (npm run dev:py, port 8000).
- On Vercel, next.config.ts rewrites it to this function.

Auth is enforced by the Clerk proxy (src/proxy.ts), not here.
"""

from fastapi import FastAPI

from python_api.auto_work_trackers.router import router as auto_work_trackers_router
from python_api.health.router import router as health_router

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

app.include_router(health_router)
app.include_router(auto_work_trackers_router)
