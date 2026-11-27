"""Application de test : GitLab simulé par respx, client OAuth remplacé par un faux."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import httpx
import pytest
import respx
from fastapi.responses import RedirectResponse

from app.config import Settings
from app.gitlab.client import GitLabClient
from app.gitlab.sync import Synchronizer
from app.web.app import create_app
from tests import factories
from tests.gitlab.conftest import BASE, FALLBACK, PROJECT, Clock, FakeGitLab

APP_URL = "https://carnet.test"
WEBHOOK_SECRET = "secret-de-webhook-pour-les-tests"


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "app_env": "prod",
        "app_base_url": APP_URL,
        "session_secret": "s" * 48,
        "gitlab_url": BASE,
        "gitlab_project": PROJECT,
        "gitlab_token": "jeton-de-test",
        "gitlab_oauth_client_id": "client-id",
        "gitlab_oauth_client_secret": "client-secret",
        "gitlab_webhook_secret": WEBHOOK_SECRET,
        "frontend_dist": "/nonexistent/dist",
        "membership_recheck_seconds": 600,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


class FakeOAuthClient:
    """Remplace le client Authlib : renvoie directement l'identité choisie par le test."""

    def __init__(self) -> None:
        self.profile: dict[str, Any] = {
            "sub": "1",
            "nickname": "arthur.jeaugey",
            "name": "Arthur Jeaugey",
            "picture": "https://gitlab.example/a.png",
        }
        self.signed_subject: str | None = "1"
        self.error: Exception | None = None
        self.redirect_uri: str | None = None

    def login_as(self, user_id: int, username: str, name: str | None = None) -> None:
        self.profile = {"sub": str(user_id), "nickname": username, "name": name or username, "picture": None}
        self.signed_subject = str(user_id)

    async def authorize_redirect(self, request, redirect_uri: str):
        self.redirect_uri = redirect_uri
        return RedirectResponse(f"{BASE}/oauth/authorize?state=abc", status_code=302)

    async def authorize_access_token(self, request) -> dict[str, Any]:
        if self.error is not None:
            raise self.error
        token: dict[str, Any] = {"access_token": "jeton-utilisateur"}
        if self.signed_subject is not None:
            token["userinfo"] = {"sub": self.signed_subject}
        return token

    async def userinfo(self, token: dict[str, Any]) -> dict[str, Any]:
        return self.profile


class Harness:
    def __init__(
        self, app, gitlab: FakeGitLab, sync: Synchronizer, oauth: FakeOAuthClient, http: httpx.AsyncClient
    ):
        self.app, self.gitlab, self.sync, self.oauth, self.http = app, gitlab, sync, oauth, http

    async def login(self, next_path: str | None = None) -> httpx.Response:
        params = {"next": next_path} if next_path else None
        await self.http.get("/auth/login", params=params)
        return await self.http.get("/auth/callback", params={"code": "c", "state": "abc"})


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def gitlab():
    with respx.mock(assert_all_called=False) as router:
        fake = FakeGitLab(router)
        fake.members = [
            {**factories.user("arthur.jeaugey", "Arthur Jeaugey", user_id=1), "access_level": 50},
            {**factories.user("theo.wu", "Théo Wu", user_id=2), "access_level": 50},
            {**factories.user("louis.landanger", "Louis Landanger", user_id=3), "access_level": 50},
        ]
        fake.issues = {
            14: factories.issue(14, labels=["En cours"], assignees=["theo.wu"], updated_days_ago=0.5),
            12: factories.issue(12, labels=["À faire"]),
        }
        yield fake


@pytest.fixture
def settings() -> Settings:
    return make_settings()


@pytest.fixture
async def harness(gitlab, clock, settings):
    client = GitLabClient(BASE, "jeton-de-test", PROJECT)
    sync = Synchronizer(client, factories.config(), project_fallback=FALLBACK, clock=clock)
    await sync.full_refresh()
    app = create_app(settings, config=factories.config(), synchronizer=sync)
    oauth = FakeOAuthClient()
    app.state.oauth = SimpleNamespace(gitlab=oauth)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=APP_URL) as http:
        yield Harness(app, gitlab, sync, oauth, http)
    await sync.stop()
