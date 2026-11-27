"""En-têtes de sécurité et contrôle de l'origine des requêtes qui modifient quelque chose."""

from __future__ import annotations

import json
from urllib.parse import urlsplit

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
# Les webhooks viennent de GitLab, pas d'un navigateur : ils sont protégés par leur secret.
ORIGIN_EXEMPT_PREFIXES = ("/hooks/",)


def content_security_policy(gitlab_url: str) -> str:
    parts = urlsplit(gitlab_url)
    gitlab_origin = f"{parts.scheme}://{parts.netloc}"
    return "; ".join(
        [
            "default-src 'self'",
            f"img-src 'self' data: https: {gitlab_origin}",
            "style-src 'self' 'unsafe-inline'",
            "font-src 'self' data:",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ]
    )


class SecurityMiddleware:
    """Middleware ASGI pur : il ne met pas les réponses en tampon, donc le flux SSE passe tel quel."""

    def __init__(self, app: ASGIApp, *, allowed_origins: set[str], csp: str, hsts: bool) -> None:
        self.app = app
        self.allowed_origins = {origin.rstrip("/") for origin in allowed_origins}
        self.headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Content-Security-Policy": csp,
        }
        if hsts:
            self.headers["Strict-Transport-Security"] = "max-age=31536000"

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        if scope["method"] not in SAFE_METHODS and not scope["path"].startswith(ORIGIN_EXEMPT_PREFIXES):
            origin = Headers(scope=scope).get("origin", "").rstrip("/")
            if origin not in self.allowed_origins:
                await self._refuse(send)
                return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in self.headers.items():
                    headers.setdefault(name, value)
            await send(message)

        await self.app(scope, receive, send_with_headers)

    async def _refuse(self, send: Send) -> None:
        body = json.dumps({"detail": "Origine de la requête refusée"}).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 403,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
