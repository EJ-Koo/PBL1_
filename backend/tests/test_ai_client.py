import httpx

from app import ai_client


class _FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=None)

    def json(self):
        return self._payload


def _use_ai_service(monkeypatch, token=""):
    monkeypatch.setattr(ai_client.settings, "ai_service_url", "http://ai.local")
    monkeypatch.setattr(ai_client.settings, "ai_service_token", token)


def test_returns_none_when_ai_service_not_configured(monkeypatch):
    monkeypatch.setattr(ai_client.settings, "ai_service_url", "")
    assert ai_client.analyze_diary("hello") is None


def test_returns_star_attributes_and_sends_token(monkeypatch):
    _use_ai_service(monkeypatch, token="secret")
    calls = {}

    def fake_post(url, json, headers, timeout):
        calls.update(url=url, json=json, headers=headers)
        return _FakeResponse({"star": {"color": "#fed240", "brightness": 1.2}})

    monkeypatch.setattr(ai_client.httpx, "post", fake_post)

    assert ai_client.analyze_diary("오늘 기뻤다") == {"color": "#FED240", "brightness": 1.2}
    assert calls["url"] == "http://ai.local/analyze"
    assert calls["json"] == {"text": "오늘 기뻤다"}
    assert calls["headers"] == {"X-AI-Token": "secret"}


def test_returns_none_on_network_error(monkeypatch):
    _use_ai_service(monkeypatch)

    def fake_post(*_a, **_k):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(ai_client.httpx, "post", fake_post)
    assert ai_client.analyze_diary("hello") is None


def test_returns_none_on_http_error_or_bad_color(monkeypatch):
    _use_ai_service(monkeypatch)
    monkeypatch.setattr(ai_client.httpx, "post", lambda *a, **k: _FakeResponse({}, status_code=500))
    assert ai_client.analyze_diary("hello") is None

    monkeypatch.setattr(
        ai_client.httpx, "post", lambda *a, **k: _FakeResponse({"star": {"color": "red", "brightness": 1}})
    )
    assert ai_client.analyze_diary("hello") is None


def test_clamps_brightness(monkeypatch):
    _use_ai_service(monkeypatch)
    monkeypatch.setattr(
        ai_client.httpx, "post", lambda *a, **k: _FakeResponse({"star": {"color": "#112233", "brightness": 99}})
    )
    assert ai_client.analyze_diary("hello")["brightness"] == ai_client.BRIGHTNESS_RANGE[1]


def test_place_diary_returns_coordinates_and_sends_ids(monkeypatch):
    _use_ai_service(monkeypatch)
    calls = {}

    def fake_post(url, json, headers, timeout):
        calls.update(url=url, json=json)
        return _FakeResponse({"created": True, "star": {"x": 1.5, "y": -2, "z": 3}, "related": []})

    monkeypatch.setattr(ai_client.httpx, "post", fake_post)

    assert ai_client.place_diary("user-1", "diary-1", "오늘") == {"x": 1.5, "y": -2.0, "z": 3.0}
    assert calls["url"] == "http://ai.local/layout/add"
    assert calls["json"] == {"user_id": "user-1", "diary_id": "diary-1", "text": "오늘"}


def test_place_diary_returns_none_when_unavailable_or_invalid(monkeypatch):
    monkeypatch.setattr(ai_client.settings, "ai_service_url", "")
    assert ai_client.place_diary("u", "d", "x") is None

    _use_ai_service(monkeypatch)
    monkeypatch.setattr(ai_client.httpx, "post", lambda *a, **k: _FakeResponse({}, status_code=503))
    assert ai_client.place_diary("u", "d", "x") is None

    monkeypatch.setattr(
        ai_client.httpx, "post", lambda *a, **k: _FakeResponse({"star": {"x": float("nan"), "y": 0, "z": 0}})
    )
    assert ai_client.place_diary("u", "d", "x") is None


def test_related_diaries(monkeypatch):
    _use_ai_service(monkeypatch)
    monkeypatch.setattr(
        ai_client.httpx,
        "post",
        lambda *a, **k: _FakeResponse({"related": [{"diary_id": "d2", "similarity": 0.61}]}),
    )
    assert ai_client.related_diaries("u", "d1") == [{"diary_id": "d2", "similarity": 0.61}]

    monkeypatch.setattr(ai_client.httpx, "post", lambda *a, **k: _FakeResponse({}, status_code=404))
    assert ai_client.related_diaries("u", "d1") is None


def test_update_and_forget_ignore_errors(monkeypatch):
    _use_ai_service(monkeypatch)

    def boom(*_a, **_k):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(ai_client.httpx, "post", boom)
    ai_client.update_diary_layout("u", "d", "x")
    ai_client.forget_diary("u", "d")
