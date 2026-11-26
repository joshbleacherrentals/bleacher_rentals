from types import SimpleNamespace

from python_api.health.router import health, router


def test_health_is_mounted_at_api_py_health_and_reports_the_path_it_saw():
    assert "/api/py/health" in {route.path for route in router.routes}
    request = SimpleNamespace(url=SimpleNamespace(path="/api/py/health"))
    assert health(request)["ok"] is True
    assert health(request)["path_seen"] == "/api/py/health"
