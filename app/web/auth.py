"""Connexion par OpenID Connect sur GitLab, puis contrôle d'appartenance au projet.

GitLab ne sert qu'à établir l'identité (portée `openid`) : le tableau de bord n'obtient aucun droit
sur les dépôts de la personne. L'appartenance au projet est vérifiée avec le token du serveur.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx
from authlib.integrations.base_client import OAuthError
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from app.config import ProjectConfig, Settings
from app.core.activity import is_bot
from app.core.models import Me
from app.gitlab.client import GitLabClient, GitLabError

log = logging.getLogger(__name__)

router = APIRouter()

SESSION_COOKIE = "carnet_session"
SESSION_MAX_AGE = 30 * 24 * 3600
SESSION_USER = "user"
SESSION_CHECKED_AT = "checked_at"
SESSION_NEXT = "next"


def build_oauth(settings: Settings) -> OAuth:
    oauth = OAuth()
    oauth.register(
        name="gitlab",
        client_id=settings.gitlab_oauth_client_id,
        client_secret=settings.gitlab_oauth_client_secret.get_secret_value(),
        server_metadata_url=f"{settings.gitlab_url}/.well-known/openid-configuration",
        client_kwargs={"scope": "openid", "code_challenge_method": "S256"},
    )
    return oauth


def safe_next(value: str | None) -> str:
    """Chemin de retour après connexion : uniquement un chemin interne, jamais une autre adresse.

    Les espaces et caractères de contrôle sont refusés : un navigateur les supprime, ce qui
    transformerait « /<tabulation>/ailleurs » en « //ailleurs », donc en une adresse externe.
    """
    if (
        value
        and value.startswith("/")
        and not value.startswith("//")
        and "\\" not in value
        and not any(char.isspace() or not char.isprintable() for char in value)
    ):
        return value
    return "/"


def callback_url(request: Request, settings: Settings) -> str:
    """Adresse de retour déclarée à GitLab.

    En production elle vient de `APP_BASE_URL`, pour ne dépendre d'aucun en-tête transmis par le
    reverse proxy. En développement elle suit l'adresse appelée, ce qui permet de passer par le
    serveur de développement du frontend.
    """
    if settings.app_env == "dev":
        return str(request.url_for("auth_callback"))
    return f"{settings.app_base_url}/auth/callback"


async def is_project_member(client: GitLabClient, user_id: int, min_access_level: int) -> bool:
    member = await client.member(user_id)
    return bool(
        member
        and member.get("state", "active") == "active"
        and int(member.get("access_level") or 0) >= min_access_level
        and not is_bot(member.get("username"))
    )


def first_name_of(username: str, name: str, config: ProjectConfig) -> str:
    for member in config.members:
        if member.gitlab == username:
            return member.first_name
    parts = name.split()
    return parts[0] if parts else username


def _error_redirect(code: str) -> RedirectResponse:
    return RedirectResponse(f"/?erreur={code}", status_code=303)


@router.get("/auth/login", name="auth_login")
async def login(request: Request) -> Response:
    settings: Settings = request.app.state.settings
    if not settings.gitlab_oauth_client_id:
        log.error("Connexion impossible : GITLAB_OAUTH_CLIENT_ID n'est pas configuré")
        return _error_redirect("configuration")
    request.session[SESSION_NEXT] = safe_next(request.query_params.get("next"))
    try:
        return await request.app.state.oauth.gitlab.authorize_redirect(
            request, callback_url(request, settings)
        )
    except (httpx.HTTPError, OAuthError, RuntimeError) as exc:
        log.warning("Impossible de démarrer la connexion GitLab : %s", type(exc).__name__)
        return _error_redirect("gitlab")


@router.get("/auth/callback", name="auth_callback")
async def callback(request: Request) -> Response:
    settings: Settings = request.app.state.settings
    client: GitLabClient = request.app.state.sync.client
    gitlab = request.app.state.oauth.gitlab

    try:
        token: dict[str, Any] = await gitlab.authorize_access_token(request)
        profile: dict[str, Any] = dict(await gitlab.userinfo(token=token))
    except OAuthError as exc:
        log.info("Connexion GitLab refusée ou invalide : %s", exc.error)
        return _error_redirect("connexion")
    except httpx.HTTPError as exc:
        log.warning("GitLab injoignable pendant la connexion : %s", type(exc).__name__)
        return _error_redirect("gitlab")

    # L'identité du jeton signé (id_token) et celle du profil doivent désigner la même personne.
    signed_subject = (token.get("userinfo") or {}).get("sub")
    subject = str(profile.get("sub") or "")
    if not subject.isdigit() or (signed_subject is not None and str(signed_subject) != subject):
        log.warning("Connexion refusée : identité incohérente")
        return _error_redirect("connexion")

    username = str(profile.get("nickname") or profile.get("preferred_username") or "")
    try:
        allowed = bool(username) and await is_project_member(
            client, int(subject), settings.gitlab_min_access_level
        )
    except GitLabError as exc:
        log.warning("Appartenance au projet invérifiable : %s", exc)
        return _error_redirect("gitlab")

    next_path = safe_next(request.session.get(SESSION_NEXT))
    request.session.clear()
    if not allowed:
        log.info("Connexion refusée : %s n'est pas membre du projet", username or subject)
        return _error_redirect("non_membre")

    request.session[SESSION_USER] = {
        "id": int(subject),
        "username": username,
        "name": str(profile.get("name") or username),
        "avatar_url": profile.get("picture"),
    }
    request.session[SESSION_CHECKED_AT] = time.time()
    return RedirectResponse(next_path, status_code=303)


@router.post("/auth/logout", status_code=204, name="auth_logout")
async def logout(request: Request) -> Response:
    request.session.clear()
    return Response(status_code=204)


async def current_user(request: Request) -> dict[str, Any]:
    """Dépendance des routes protégées : exige une session, et revérifie l'appartenance de temps en temps."""
    user = request.session.get(SESSION_USER)
    if not user:
        raise HTTPException(status_code=401, detail="Connexion requise")

    settings: Settings = request.app.state.settings
    checked_at = float(request.session.get(SESSION_CHECKED_AT) or 0)
    if time.time() - checked_at > settings.membership_recheck_seconds:
        client: GitLabClient = request.app.state.sync.client
        try:
            still_member = await is_project_member(client, int(user["id"]), settings.gitlab_min_access_level)
        except GitLabError:
            # GitLab ne répond pas : on ne déconnecte personne pour autant, on revérifiera plus tard.
            return user
        if not still_member:
            request.session.clear()
            raise HTTPException(status_code=401, detail="Tu n'es plus membre du projet")
        request.session[SESSION_CHECKED_AT] = time.time()
    return user


def me_from_session(user: dict[str, Any], config: ProjectConfig) -> Me:
    username, name = str(user["username"]), str(user.get("name") or user["username"])
    return Me(
        username=username,
        name=name,
        first_name=first_name_of(username, name, config),
        avatar_url=user.get("avatar_url"),
    )
