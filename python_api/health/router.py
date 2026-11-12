import platform
import sys

from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/py")


@router.get("/health")
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
