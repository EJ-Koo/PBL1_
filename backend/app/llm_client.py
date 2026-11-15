"""[NEW FILE 2026-11-15] 서버 쪽 LLM(OpenAI Chat Completions) 호출 모듈.

- 키는 settings.openai_api_key(backend/.env 의 OPENAI_API_KEY)에서만 읽는다. 코드·로그·응답에 키를 넣지 않는다.
- 프론트엔드는 LLM 을 직접 부르지 않는다. 이 모듈은 백엔드 안에서만 쓴다.
- 응답은 JSON 스키마(Structured Outputs, strict)로 받는다 → 자유 형식 문자열·SVG 문서를 받지 않는다.
- 시간 제한, 재시도(429·5xx·네트워크 오류만, 횟수 제한), 출력 토큰 제한을 둔다.
- 로그에는 목적·모델·토큰 수·걸린 시간·결과만 남긴다(일기 원문, 프롬프트, 응답 본문, 키는 남기지 않는다).

SDK 대신 이미 쓰고 있는 httpx 로 REST 를 직접 부른다(새 의존성 없음, 테스트에서 가짜 응답으로 바꾸기 쉬움).
"""
from __future__ import annotations

import json
import logging
import random
import time
from dataclasses import dataclass

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class LLMError(Exception):
    """code: not_configured | auth | quota | rate_limited | bad_request | server | network | refusal | truncated | bad_response"""

    def __init__(self, code: str, message: str = "", retryable: bool = False):
        super().__init__(f"{code}: {message}" if message else code)
        self.code = code
        self.retryable = retryable


@dataclass
class LLMUsage:
    """한 번의 별자리 생성에 든 호출 수·토큰 수(비용 추적용, DB에 함께 저장)."""

    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0

    def add(self, usage: dict | None) -> None:
        """응답의 usage(토큰 수)를 더한다. 호출 수(calls)는 요청을 보낼 때마다 chat_json 이 센다."""
        if not usage:
            return
        self.input_tokens += int(usage.get("prompt_tokens") or 0)
        self.output_tokens += int(usage.get("completion_tokens") or 0)
        details = usage.get("completion_tokens_details") or {}
        self.reasoning_tokens += int(details.get("reasoning_tokens") or 0)

    def cost_usd(self) -> float:
        return round(
            self.input_tokens / 1e6 * settings.llm_price_input_per_mtok
            + self.output_tokens / 1e6 * settings.llm_price_output_per_mtok,
            6,
        )

    def as_dict(self) -> dict:
        return {
            "calls": self.calls,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "reasoning_tokens": self.reasoning_tokens,
            "estimated_cost_usd": self.cost_usd(),
            "model": settings.llm_model,
        }


def is_configured() -> bool:
    return bool(settings.openai_api_key.strip() and settings.llm_model.strip())


def _error_code(response: httpx.Response) -> str:
    try:
        err = response.json().get("error") or {}
        return str(err.get("code") or err.get("type") or "")
    except Exception:
        return ""


def chat_json(
    *,
    purpose: str,
    system: str,
    user: str,
    schema_name: str,
    schema: dict,
    usage: LLMUsage,
    max_output_tokens: int | None = None,
    log_tag: str = "",
) -> dict:
    """system/user 메시지를 보내고, schema 에 맞는 JSON 객체를 돌려준다. 실패하면 LLMError."""
    if not is_configured():
        raise LLMError("not_configured")
    payload: dict = {
        "model": settings.llm_model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": schema_name, "strict": True, "schema": schema},
        },
        "max_completion_tokens": int(max_output_tokens or settings.llm_max_output_tokens),
        # 일기 내용이 포함되므로 OpenAI 쪽 대화 저장(Stored completions)을 쓰지 않는다.
        "store": False,
    }
    if settings.llm_reasoning_effort.strip():
        payload["reasoning_effort"] = settings.llm_reasoning_effort.strip()
    headers = {"Authorization": f"Bearer {settings.openai_api_key.strip()}", "Content-Type": "application/json"}
    url = f"{settings.llm_base_url.rstrip('/')}/chat/completions"

    attempts = max(1, settings.llm_max_retries + 1)
    last: LLMError | None = None
    for attempt in range(attempts):
        started = time.monotonic()
        status = "ok"
        body: dict | None = None
        usage.calls += 1
        try:
            response = httpx.post(url, json=payload, headers=headers, timeout=settings.llm_timeout)
            if response.status_code in (401, 403):
                raise LLMError("auth", f"HTTP {response.status_code}")
            if response.status_code == 429:
                code = _error_code(response)
                if code == "insufficient_quota":
                    raise LLMError("quota", code)
                raise LLMError("rate_limited", code, retryable=True)
            if response.status_code >= 500:
                raise LLMError("server", f"HTTP {response.status_code}", retryable=True)
            if response.status_code >= 400:
                raise LLMError("bad_request", f"HTTP {response.status_code} {_error_code(response)}")
            body = response.json()
        except httpx.TimeoutException:
            last = LLMError("network", "timeout", retryable=True)
        except httpx.HTTPError as exc:
            last = LLMError("network", type(exc).__name__, retryable=True)
        except LLMError as exc:
            last = exc
        except ValueError:
            last = LLMError("bad_response", "not json")

        if body is not None:
            usage.add(body.get("usage"))
            try:
                result = _parse_choice(body)
            except LLMError as exc:
                last = exc
            else:
                _log(purpose, "ok", body.get("usage"), started, attempt, log_tag)
                return result
        status = last.code if last else "error"
        _log(purpose, status, (body or {}).get("usage"), started, attempt, log_tag)
        if not last or not last.retryable or attempt == attempts - 1:
            break
        time.sleep(min(8.0, (2**attempt) * 1.0 + random.random()))
    raise last or LLMError("bad_response")


def _parse_choice(body: dict) -> dict:
    try:
        choice = body["choices"][0]
        message = choice["message"]
    except (KeyError, IndexError, TypeError):
        raise LLMError("bad_response", "no choices")
    if message.get("refusal"):
        raise LLMError("refusal")
    if choice.get("finish_reason") == "length":
        raise LLMError("truncated")
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise LLMError("bad_response", "empty content")
    try:
        data = json.loads(content)
    except ValueError:
        raise LLMError("bad_response", "invalid json")
    if not isinstance(data, dict):
        raise LLMError("bad_response", "not an object")
    return data


def _log(purpose: str, status: str, usage: dict | None, started: float, attempt: int, tag: str) -> None:
    usage = usage or {}
    logger.info(
        "llm call purpose=%s model=%s status=%s attempt=%d in_tokens=%s out_tokens=%s ms=%d tag=%s",
        purpose,
        settings.llm_model,
        status,
        attempt + 1,
        usage.get("prompt_tokens", "-"),
        usage.get("completion_tokens", "-"),
        int((time.monotonic() - started) * 1000),
        tag,
    )
