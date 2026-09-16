"""Small, optional LLM client used for grounded open-ended answers.

The client is deliberately lazy: the API can run without the OpenAI package or
an API key, in which case callers receive a deterministic insufficient-data
response instead of an invented answer.
"""

from __future__ import annotations

import os
from typing import Any

class OpenAIClient:
    """Lazy wrapper around the OpenAI chat completions API."""

    provider = "openai"

    def __init__(self, *, api_key: str | None = None, model: str | None = None, timeout: float | None = None):
        self.model = model or os.getenv("FLOATCHAT_LLM_MODEL", "gpt-4o-mini")
        try:
            self.timeout = timeout or float(os.getenv("FLOATCHAT_LLM_TIMEOUT_SECONDS", "20"))
        except ValueError:
            self.timeout = 20.0
        self.api_key = api_key if api_key is not None else os.getenv("OPENAI_API_KEY", "").strip()
        self._client: Any = None
        self.reason: str | None = None
        if not self.api_key:
            self.reason = "missing-api-key"
            return
        try:
            from openai import OpenAI  # type: ignore

            self._client = OpenAI(api_key=self.api_key, timeout=self.timeout)
        except Exception:
            # Do not log the exception: SDK errors can contain request details.
            self.reason = "dependency-unavailable"

    @property
    def available(self) -> bool:
        return self._client is not None

    def complete(self, prompt: str) -> str:
        if not self.available:
            raise RuntimeError(self.reason or "client-unavailable")
        response = self._client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You answer FloatChat questions using only the supplied evidence. "
                        "Never infer or invent observations, dates, locations, or values. "
                        "If the evidence does not support an answer, say exactly that there "
                        "is insufficient data and briefly explain what is missing."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0,
        )
        content = response.choices[0].message.content
        if not content or not content.strip():
            raise RuntimeError("empty-response")
        return content.strip()


def create_llm_client() -> OpenAIClient:
    """Create the configured provider client without making a network call."""
    provider = os.getenv("FLOATCHAT_LLM_PROVIDER", "openai").strip().lower()
    if provider != "openai":
        client = OpenAIClient(api_key="")
        client.reason = "unsupported-provider"
        return client
    return OpenAIClient()
