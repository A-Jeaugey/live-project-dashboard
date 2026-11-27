"""Faux GitLab pour le développement : la partie de l'API utilisée par le tableau de bord, et OAuth.

Lancement : `make dev-gitlab` (http://127.0.0.1:8001). Rien ici ne touche au vrai GitLab.
Routes de démonstration : voir `GET /_dev`.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import time
import uuid
from datetime import UTC, datetime
from html import escape
from typing import Any
from urllib.parse import parse_qs, unquote, urlencode

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from joserfc import jwt
from joserfc.jwk import RSAKey
from pydantic import BaseModel

from dev.fake_gitlab.data import MEMBERS, PROJECT_ID, PROJECT_PATH, USERS, State, build_state

BASE_URL = os.environ.get("FAKE_GITLAB_URL", "http://127.0.0.1:8001").rstrip("/")
API_TOKEN = os.environ.get("FAKE_GITLAB_TOKEN", "jeton-de-dev")
OAUTH_CLIENT_ID = os.environ.get("FAKE_OAUTH_CLIENT_ID", "carnet-dev")
OAUTH_CLIENT_SECRET = os.environ.get("FAKE_OAUTH_CLIENT_SECRET", "secret-oauth-de-dev")
WEBHOOK_TARGET = os.environ.get("FAKE_WEBHOOK_TARGET", "http://127.0.0.1:8000/hooks/gitlab")
WEBHOOK_SECRET = os.environ.get("FAKE_WEBHOOK_SECRET", "secret-webhook-de-dev")

app = FastAPI(title="Faux GitLab de développement", docs_url=None, redoc_url=None)
state: State = build_state(BASE_URL)
signing_key = RSAKey.generate_key(2048, parameters={"use": "sig", "alg": "RS256"}, auto_kid=True)
auth_codes: dict[str, dict[str, Any]] = {}
access_tokens: dict[str, str] = {}

P = "/api/v4/projects/{project:path}"


# --- outils ---------------------------------------------------------------------------------------


def require_token(request: Request) -> None:
    bearer = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if API_TOKEN not in (bearer, request.headers.get("private-token", "")):
        raise HTTPException(status_code=401, detail="401 Unauthorized")


def require_project(project: str) -> None:
    if project not in (str(PROJECT_ID), PROJECT_PATH):
        raise HTTPException(status_code=404, detail="404 Project Not Found")


def guard(request: Request, project: str) -> None:
    require_token(request)
    require_project(project)


Guard = Depends(guard)


def paginated(items: list[Any], request: Request) -> JSONResponse:
    per_page = max(1, min(100, int(request.query_params.get("per_page", 20))))
    page = max(1, int(request.query_params.get("page", 1)))
    start = (page - 1) * per_page
    chunk = items[start : start + per_page]
    has_next = start + per_page < len(items)
    return JSONResponse(
        chunk,
        headers={
            "X-Total": str(len(items)),
            "X-Page": str(page),
            "X-Per-Page": str(per_page),
            "X-Next-Page": str(page + 1) if has_next else "",
        },
    )


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


# --- API du projet --------------------------------------------------------------------------------


@app.get(P + "/labels", dependencies=[Guard])
def labels(request: Request) -> JSONResponse:
    return paginated(state.labels, request)


@app.get(P + "/milestones", dependencies=[Guard])
def milestones(request: Request) -> JSONResponse:
    return paginated(state.milestones, request)


@app.get(P + "/members/all/{user_id}", dependencies=[Guard])
def member(user_id: int) -> dict[str, Any]:
    found = next((m for m in state.members if m["id"] == user_id), None)
    if found is None:
        raise HTTPException(status_code=404, detail="404 Not found")
    return found


@app.get(P + "/members/all", dependencies=[Guard])
def members(request: Request) -> JSONResponse:
    return paginated(state.members, request)


@app.get(P + "/events", dependencies=[Guard])
def events(request: Request) -> JSONResponse:
    return paginated(state.events, request)


@app.get(P + "/issues/{iid}/notes", dependencies=[Guard])
def issue_notes(iid: int, request: Request) -> JSONResponse:
    if iid not in state.issues:
        raise HTTPException(status_code=404, detail="404 Not found")
    return paginated(state.notes.get(iid, []), request)


@app.get(P + "/issues/{iid}", dependencies=[Guard])
def issue(iid: int) -> dict[str, Any]:
    if iid not in state.issues:
        raise HTTPException(status_code=404, detail="404 Not found")
    return state.issues[iid]


@app.get(P + "/issues", dependencies=[Guard])
def issues(
    request: Request,
    issue_state: str = Query("all", alias="state"),
    updated_after: str | None = None,
) -> JSONResponse:
    found = list(state.issues.values())
    if issue_state in ("opened", "closed"):
        found = [i for i in found if i["state"] == issue_state]
    if updated_after:
        limit = datetime.fromisoformat(updated_after)
        found = [i for i in found if datetime.fromisoformat(i["updated_at"]) > limit]
    found.sort(key=lambda i: i["updated_at"], reverse=True)
    return paginated(found, request)


@app.get(P + "/merge_requests/{iid}/approvals", dependencies=[Guard])
def approvals(iid: int) -> dict[str, Any]:
    if iid not in state.merge_requests:
        raise HTTPException(status_code=404, detail="404 Not found")
    approvers = state.approvals.get(iid, [])
    return {
        "iid": iid,
        "approved": bool(approvers),
        "approved_by": [{"user": state.user(u)} for u in approvers],
    }


@app.get(P + "/merge_requests/{iid}/closes_issues", dependencies=[Guard])
def closes_issues(iid: int, request: Request) -> JSONResponse:
    if iid not in state.merge_requests:
        raise HTTPException(status_code=404, detail="404 Not found")
    return paginated([state.issues[i] for i in state.closes.get(iid, []) if i in state.issues], request)


@app.get(P + "/merge_requests/{iid}", dependencies=[Guard])
def merge_request(iid: int) -> dict[str, Any]:
    if iid not in state.merge_requests:
        raise HTTPException(status_code=404, detail="404 Not found")
    return state.merge_requests[iid]


@app.get(P + "/merge_requests", dependencies=[Guard])
def merge_requests(request: Request, mr_state: str = Query("all", alias="state")) -> JSONResponse:
    found = [mr for mr in state.merge_requests.values() if mr_state in ("all", mr["state"])]
    # Comme le vrai GitLab, la liste ne donne pas le pipeline de tête : il faut lire le détail.
    return paginated([{k: v for k, v in mr.items() if k != "head_pipeline"} for mr in found], request)


@app.get(P + "/pipelines", dependencies=[Guard])
def pipelines(request: Request) -> JSONResponse:
    return paginated(state.pipelines, request)


@app.get(P + "/repository/commits/{sha}", dependencies=[Guard])
def commit(sha: str) -> dict[str, Any]:
    found = next((c for c in state.commits if c["id"] == sha), None)
    if found is None:
        raise HTTPException(status_code=404, detail="404 Commit Not Found")
    return found


@app.get(P + "/repository/commits", dependencies=[Guard])
def commits(request: Request) -> JSONResponse:
    return paginated(state.commits, request)


@app.get(P + "/repository/tags", dependencies=[Guard])
def tags(request: Request) -> JSONResponse:
    return paginated(state.tags, request)


@app.get(P, dependencies=[Guard])
def project() -> dict[str, Any]:
    return state.project


@app.get("/avatars/{username}.svg")
def avatar(username: str) -> Response:
    info = USERS.get(username)
    if info is None:
        raise HTTPException(status_code=404)
    initial = escape(info["name"][0])
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">'
        f'<rect width="96" height="96" fill="{info["color"]}"/>'
        '<text x="48" y="64" font-family="Georgia, serif" font-size="52" fill="#fff" '
        f'text-anchor="middle">{initial}</text></svg>'
    )
    return Response(svg, media_type="image/svg+xml", headers={"Cache-Control": "max-age=3600"})


# --- OAuth / OpenID Connect -----------------------------------------------------------------------


@app.get("/.well-known/openid-configuration")
def openid_configuration() -> dict[str, Any]:
    return {
        "issuer": BASE_URL,
        "authorization_endpoint": f"{BASE_URL}/oauth/authorize",
        "token_endpoint": f"{BASE_URL}/oauth/token",
        "userinfo_endpoint": f"{BASE_URL}/oauth/userinfo",
        "jwks_uri": f"{BASE_URL}/oauth/discovery/keys",
        "scopes_supported": ["openid", "profile", "email", "read_user", "api"],
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code"],
        "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post"],
        "subject_types_supported": ["public"],
        "id_token_signing_alg_values_supported": ["RS256"],
        "code_challenge_methods_supported": ["plain", "S256"],
    }


@app.get("/oauth/discovery/keys")
def jwks() -> dict[str, Any]:
    return {"keys": [signing_key.as_dict(private=False)]}


@app.get("/oauth/authorize", response_class=HTMLResponse)
def authorize(request: Request, client_id: str, redirect_uri: str, response_type: str = "code") -> str:
    if client_id != OAUTH_CLIENT_ID or response_type != "code":
        raise HTTPException(status_code=400, detail="Client OAuth inconnu")
    query = dict(request.query_params)
    rows = []
    for username, info in USERS.items():
        link = f"/oauth/authorize/approve?{urlencode({**query, 'user': username})}"
        role = "membre du projet" if username in MEMBERS else "n'est PAS membre du projet"
        rows.append(
            f'<li><a href="{escape(link)}"><img src="/avatars/{escape(username)}.svg" alt="" width="40" height="40">'
            f"<span><strong>{escape(info['name'])}</strong><br><small>{escape(username)} · {role}</small></span></a></li>"
        )
    return f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Faux GitLab — connexion</title>
<style>
body{{font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;color:#1b1b1a;background:#f6f2e9}}
ul{{list-style:none;padding:0;display:grid;gap:.5rem}}
a{{display:flex;gap:.75rem;align-items:center;padding:.6rem .8rem;border:1px solid #c8c2b3;border-radius:.4rem;
color:inherit;text-decoration:none;background:#fcfaf4}}
a:hover,a:focus-visible{{border-color:#1c3fb7}} img{{border-radius:.2rem}} small{{color:#55524a}}
</style></head><body>
<h1>Faux GitLab</h1>
<p>Serveur de développement. Choisis la personne qui se connecte :</p>
<ul>{"".join(rows)}</ul>
</body></html>"""


@app.get("/oauth/authorize/approve")
def approve(
    user: str,
    redirect_uri: str,
    client_id: str,
    oauth_state: str = Query("", alias="state"),
    nonce: str | None = None,
    code_challenge: str | None = None,
    code_challenge_method: str | None = None,
) -> RedirectResponse:
    if user not in USERS or client_id != OAUTH_CLIENT_ID:
        raise HTTPException(status_code=400, detail="Utilisateur ou client inconnu")
    code = secrets.token_urlsafe(24)
    auth_codes[code] = {
        "user": user,
        "redirect_uri": redirect_uri,
        "nonce": nonce,
        "code_challenge": code_challenge,
        "code_challenge_method": code_challenge_method,
    }
    separator = "&" if "?" in redirect_uri else "?"
    return RedirectResponse(
        f"{redirect_uri}{separator}{urlencode({'code': code, 'state': oauth_state})}", 302
    )


def _client_credentials(
    request: Request, client_id: str | None, client_secret: str | None
) -> tuple[str, str]:
    header = request.headers.get("authorization", "")
    if header.startswith("Basic "):
        decoded = base64.b64decode(header.removeprefix("Basic ")).decode()
        basic_id, _, basic_secret = decoded.partition(":")
        return unquote(basic_id), unquote(basic_secret)
    return client_id or "", client_secret or ""


@app.post("/oauth/token")
async def token(request: Request) -> dict[str, Any]:
    # Formulaire lu à la main pour ne pas ajouter de dépendance à un outil de développement.
    form = {key: values[0] for key, values in parse_qs((await request.body()).decode()).items()}
    grant_type, code = form.get("grant_type", ""), form.get("code", "")
    redirect_uri, code_verifier = form.get("redirect_uri", ""), form.get("code_verifier")
    credentials = _client_credentials(request, form.get("client_id"), form.get("client_secret"))
    if credentials != (OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET):
        raise HTTPException(status_code=401, detail={"error": "invalid_client"})
    grant = auth_codes.pop(code, None)
    if grant_type != "authorization_code" or grant is None or grant["redirect_uri"] != redirect_uri:
        raise HTTPException(status_code=400, detail={"error": "invalid_grant"})
    if grant["code_challenge"]:
        digest = hashlib.sha256((code_verifier or "").encode()).digest()
        challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
        expected = challenge if grant["code_challenge_method"] == "S256" else (code_verifier or "")
        if expected != grant["code_challenge"]:
            raise HTTPException(
                status_code=400, detail={"error": "invalid_grant", "error_description": "PKCE"}
            )

    username = grant["user"]
    issued = int(time.time())
    claims = {
        "iss": BASE_URL,
        "sub": str(USERS[username]["id"]),
        "aud": OAUTH_CLIENT_ID,
        "exp": issued + 120,
        "iat": issued,
        "auth_time": issued,
    }
    if grant["nonce"]:
        claims["nonce"] = grant["nonce"]
    access_token = secrets.token_urlsafe(32)
    access_tokens[access_token] = username
    return {
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": 7200,
        "refresh_token": secrets.token_urlsafe(32),
        "scope": "openid",
        "created_at": issued,
        "id_token": jwt.encode({"alg": "RS256", "kid": signing_key.kid}, claims, signing_key),
    }


@app.get("/oauth/userinfo")
def userinfo(request: Request) -> dict[str, Any]:
    username = access_tokens.get(request.headers.get("authorization", "").removeprefix("Bearer ").strip())
    if username is None:
        raise HTTPException(status_code=401, detail="invalid_token")
    info = USERS[username]
    return {
        "sub": str(info["id"]),
        "sub_legacy": hashlib.sha256(username.encode()).hexdigest(),
        "name": info["name"],
        "nickname": username,
        "preferred_username": username,
        "profile": f"{BASE_URL}/{username}",
        "picture": f"{BASE_URL}/avatars/{username}.svg",
        "groups": [],
    }


# --- routes de démonstration ----------------------------------------------------------------------


class IssuePatch(BaseModel):
    """Modification d'une issue. `par` est la personne à qui attribuer l'événement."""

    title: str | None = None
    labels: list[str] | None = None
    assignees: list[str] | None = None
    state: str | None = None
    par: str = "arthur.jeaugey"


class IssueCreate(BaseModel):
    title: str
    labels: list[str] = []
    par: str = "arthur.jeaugey"


def _send_webhook(kind: str, payload: dict[str, Any]) -> str:
    headers = {
        "Content-Type": "application/json",
        "X-Gitlab-Event": kind,
        "X-Gitlab-Token": WEBHOOK_SECRET,
        "X-Gitlab-Event-UUID": str(uuid.uuid4()),
        "Idempotency-Key": str(uuid.uuid4()),
        "User-Agent": "GitLab/faux",
    }
    try:
        response = httpx.post(WEBHOOK_TARGET, content=json.dumps(payload), headers=headers, timeout=5)
    except httpx.HTTPError as exc:
        return f"échec ({type(exc).__name__})"
    return f"HTTP {response.status_code}"


def _issue_webhook(iid: int, action: str) -> str:
    payload = {
        "object_kind": "issue",
        "event_type": "issue",
        "project": {"id": PROJECT_ID, "path_with_namespace": PROJECT_PATH},
        "object_attributes": {"iid": iid, "action": action},
    }
    return _send_webhook("Issue Hook", payload)


@app.get("/_dev")
def dev_help() -> dict[str, Any]:
    return {
        "routes": {
            "POST /_dev/issues/{iid}": "modifie une issue : title, labels, assignees, state (opened|closed), par",
            "POST /_dev/issues": "crée une issue : title, labels, par",
            "POST /_dev/merge_requests/{iid}/approve?par=…": "approuve une merge request",
            "POST /_dev/reset": "remet les données d'exemple à neuf",
        },
        "option": "ajouter ?webhook=1 pour envoyer aussi le webhook à l'application",
        "exemple": "curl -X POST 'http://127.0.0.1:8001/_dev/issues/12' -H 'Content-Type: application/json' "
        '-d \'{"labels": ["En cours", "gameplay"], "assignees": ["louis.landanger"], "par": "louis.landanger"}\'',
    }


@app.post("/_dev/issues/{iid}")
def dev_update_issue(iid: int, patch: IssuePatch, webhook: bool = False) -> dict[str, Any]:
    current = state.issues.get(iid)
    if current is None:
        raise HTTPException(status_code=404, detail=f"L'issue #{iid} n'existe pas")
    unknown = [u for u in [patch.par, *(patch.assignees or [])] if u not in USERS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Utilisateur inconnu : {', '.join(unknown)}")

    action = "update"
    if patch.title is not None:
        current["title"] = patch.title
    if patch.labels is not None:
        current["labels"] = patch.labels
    if patch.assignees is not None:
        people = [state.user(u) for u in patch.assignees]
        current["assignees"], current["assignee"] = people, (people[0] if people else None)
    if patch.state in ("opened", "closed") and patch.state != current["state"]:
        closing = patch.state == "closed"
        action = "close" if closing else "reopen"
        current["state"] = patch.state
        current["closed_at"] = now_iso() if closing else None
        state.add_event(
            "closed" if closing else "reopened",
            "Issue",
            patch.par,
            target_iid=iid,
            target_title=current["title"],
        )
    current["updated_at"] = now_iso()
    return {"issue": current, "webhook": _issue_webhook(iid, action) if webhook else "non envoyé"}


@app.post("/_dev/issues")
def dev_create_issue(body: IssueCreate, webhook: bool = False) -> dict[str, Any]:
    if body.par not in USERS:
        raise HTTPException(status_code=400, detail=f"Utilisateur inconnu : {body.par}")
    iid = max(state.issues) + 1
    created = now_iso()
    state.issues[iid] = {
        "id": 40000 + iid,
        "iid": iid,
        "project_id": PROJECT_ID,
        "title": body.title,
        "description": "",
        "state": "opened",
        "created_at": created,
        "updated_at": created,
        "closed_at": None,
        "labels": body.labels,
        "milestone": None,
        "assignees": [],
        "assignee": None,
        "author": state.user(body.par),
        "type": "ISSUE",
        "user_notes_count": 0,
        "task_completion_status": {"count": 0, "completed_count": 0},
        "web_url": f"{state.project_url}/-/issues/{iid}",
    }
    state.add_event("opened", "Issue", body.par, target_iid=iid, target_title=body.title)
    return {"issue": state.issues[iid], "webhook": _issue_webhook(iid, "open") if webhook else "non envoyé"}


@app.post("/_dev/merge_requests/{iid}/approve")
def dev_approve(iid: int, par: str = "louis.landanger", webhook: bool = False) -> dict[str, Any]:
    current = state.merge_requests.get(iid)
    if current is None or par not in USERS:
        raise HTTPException(status_code=404, detail="Merge request ou utilisateur inconnu")
    if par not in state.approvals.setdefault(iid, []):
        state.approvals[iid].append(par)
    current["updated_at"] = now_iso()
    state.add_event("approved", "MergeRequest", par, target_iid=iid, target_title=current["title"])
    sent = "non envoyé"
    if webhook:
        payload = {
            "object_kind": "merge_request",
            "project": {"id": PROJECT_ID, "path_with_namespace": PROJECT_PATH},
            "object_attributes": {"iid": iid, "action": "approved"},
        }
        sent = _send_webhook("Merge Request Hook", payload)
    return {"approved_by": state.approvals[iid], "webhook": sent}


@app.post("/_dev/reset")
def dev_reset() -> dict[str, str]:
    global state
    state = build_state(BASE_URL)
    return {"status": "données d'exemple remises à neuf"}
