"""Assemblage de l'application : configuration, synchro GitLab, routes."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

from app.config import ProjectConfig, Settings, get_settings, load_project_config
from app.core.models import ProjectInfo
from app.gitlab.client import GitLabClient
from app.gitlab.sync import Synchronizer
from app.store.db import Store
from app.web import api, auth, hooks, static
from app.web.security import SecurityMiddleware, content_security_policy

log = logging.getLogger(__name__)


def project_fallback(settings: Settings, config: ProjectConfig) -> ProjectInfo:
    """Ce qu'on sait du projet sans GitLab, pour afficher quelque chose même s'il est injoignable."""
    path = settings.gitlab_project
    web_url = settings.gitlab_url if path.isdigit() else f"{settings.gitlab_url}/{path}"
    return ProjectInfo(name=config.project.name, path=path, web_url=web_url, default_branch="main")


def build_synchronizer(settings: Settings, config: ProjectConfig, store: Store | None) -> Synchronizer:
    client = GitLabClient(
        settings.gitlab_url, settings.gitlab_token.get_secret_value(), settings.gitlab_project
    )
    return Synchronizer(
        client,
        config,
        project_fallback=project_fallback(settings, config),
        store=store,
        poll_interval=settings.poll_interval_seconds,
        full_refresh_interval=settings.full_refresh_seconds,
        webhook_fresh_seconds=settings.webhook_fresh_seconds,
    )


def create_app(
    settings: Settings | None = None,
    *,
    config: ProjectConfig | None = None,
    synchronizer: Synchronizer | None = None,
) -> FastAPI:
    """Construit l'application. Passer `synchronizer` (tests) évite tout accès réseau au démarrage."""
    settings = settings or get_settings()
    config = config or load_project_config(settings.project_config)
    logging.basicConfig(
        level=settings.log_level.upper(), format="%(asctime)s %(levelname)s %(name)s : %(message)s"
    )
    # httpx journalise chaque requête : avec l'interrogation périodique, cela noierait le reste.
    logging.getLogger("httpx").setLevel(logging.WARNING)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if synchronizer is not None:
            app.state.sync = synchronizer
            yield
            return
        store = Store(Path(settings.data_dir) / "carnet.sqlite3")
        sync = build_synchronizer(settings, config, store)
        app.state.sync = sync
        if not settings.gitlab_webhook_secret.get_secret_value() and not (
            settings.gitlab_webhook_signing_token.get_secret_value()
        ):
            log.warning(
                "Aucun secret de webhook configuré : les webhooks seront refusés, interrogation seule"
            )
        await sync.start()
        try:
            yield
        finally:
            await sync.stop()
            store.close()

    dev = settings.app_env == "dev"
    app = FastAPI(
        title="Carnet de bord — 5 Nights at EPITA",
        lifespan=lifespan,
        docs_url="/api/docs" if dev else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if dev else None,
    )
    app.state.settings = settings
    app.state.config = config
    app.state.oauth = auth.build_oauth(settings)
    app.state.deliveries = hooks.DeliveryMemory()
    if synchronizer is not None:
        app.state.sync = synchronizer

    # Ordre : le dernier ajouté est le plus externe. La sécurité enveloppe donc la session.
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret.get_secret_value(),
        session_cookie=auth.SESSION_COOKIE,
        max_age=auth.SESSION_MAX_AGE,
        same_site="lax",
        https_only=settings.cookie_secure,
    )
    app.add_middleware(
        SecurityMiddleware,
        allowed_origins=settings.origins,
        csp=content_security_policy(settings.gitlab_url),
        hsts=settings.cookie_secure,
    )

    app.include_router(api.router)
    app.include_router(auth.router)
    app.include_router(hooks.router)
    app.include_router(static.router)  # en dernier : il attrape toutes les autres adresses
    return app
