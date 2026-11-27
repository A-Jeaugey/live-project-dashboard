"""Client de l'API REST de GitLab. Lecture seule : il n'émet que des requêtes GET."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from urllib.parse import quote

import httpx

log = logging.getLogger(__name__)

PER_PAGE = 100


class GitLabError(Exception):
    """Échec d'un appel à GitLab. Le message est affichable tel quel et ne contient aucun secret."""

    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class GitLabClient:
    def __init__(
        self,
        base_url: str,
        token: str,
        project: str,
        *,
        timeout: float = 15.0,
        max_pages: int = 50,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._project = f"/projects/{quote(project, safe='')}"
        self._max_pages = max_pages
        self._http = httpx.AsyncClient(
            base_url=f"{base_url.rstrip('/')}/api/v4",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
                "User-Agent": "carnet-5nights",
            },
            timeout=timeout,
            transport=transport,
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    # --- transport ------------------------------------------------------------------------------

    async def _request(self, path: str, params: dict[str, Any] | None = None) -> httpx.Response:
        try:
            response = await self._http.get(path, params=params)
        except httpx.TimeoutException as exc:
            raise GitLabError("GitLab ne répond pas (délai dépassé)") from exc
        except httpx.HTTPError as exc:
            raise GitLabError(f"GitLab est injoignable ({type(exc).__name__})") from exc
        if response.status_code >= 400:
            raise GitLabError(_describe_status(response.status_code), status=response.status_code)
        return response

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        response = await self._request(path, params)
        try:
            return response.json()
        except ValueError as exc:
            raise GitLabError("GitLab a renvoyé une réponse illisible") from exc

    async def _get_or_none(self, path: str, params: dict[str, Any] | None = None) -> Any | None:
        try:
            return await self._get(path, params)
        except GitLabError as exc:
            if exc.status == 404:
                return None
            raise

    async def _paginate(self, path: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        """Parcourt toutes les pages d'une liste (pagination par numéro de page ou par lien)."""
        items: list[dict[str, Any]] = []
        query: dict[str, Any] | None = {**(params or {}), "per_page": PER_PAGE}
        url = path
        for _ in range(self._max_pages):
            response = await self._request(url, query)
            try:
                page = response.json()
            except ValueError as exc:
                raise GitLabError("GitLab a renvoyé une réponse illisible") from exc
            if not isinstance(page, list):
                raise GitLabError("GitLab a renvoyé une réponse inattendue")
            items.extend(page)

            next_page = response.headers.get("x-next-page", "").strip()
            next_link = response.links.get("next", {}).get("url")
            if next_page:
                query = {**(params or {}), "per_page": PER_PAGE, "page": next_page}
                url = path
            elif next_link:
                query, url = None, next_link
            else:
                return items
        log.warning("Pagination interrompue après %s pages pour %s", self._max_pages, path)
        return items

    # --- projet ---------------------------------------------------------------------------------

    async def project(self) -> dict[str, Any]:
        return await self._get(self._project)

    async def labels(self) -> list[dict[str, Any]]:
        return await self._paginate(f"{self._project}/labels")

    async def milestones(self) -> list[dict[str, Any]]:
        return await self._paginate(f"{self._project}/milestones")

    async def members(self) -> list[dict[str, Any]]:
        return await self._paginate(f"{self._project}/members/all")

    async def member(self, user_id: int) -> dict[str, Any] | None:
        """Appartenance d'un utilisateur au projet, ou None s'il n'en est pas membre."""
        return await self._get_or_none(f"{self._project}/members/all/{int(user_id)}")

    async def events(self, limit: int = 50) -> list[dict[str, Any]]:
        return await self._get(f"{self._project}/events", {"per_page": limit})

    # --- issues ---------------------------------------------------------------------------------

    async def issues(self, updated_after: datetime | None = None) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"state": "all", "scope": "all", "order_by": "updated_at", "sort": "desc"}
        if updated_after is not None:
            params["updated_after"] = updated_after.isoformat()
        return await self._paginate(f"{self._project}/issues", params)

    async def issue(self, iid: int) -> dict[str, Any] | None:
        return await self._get_or_none(f"{self._project}/issues/{int(iid)}")

    async def issue_notes(self, iid: int) -> list[dict[str, Any]]:
        return await self._paginate(
            f"{self._project}/issues/{int(iid)}/notes", {"sort": "asc", "order_by": "created_at"}
        )

    # --- merge requests -------------------------------------------------------------------------

    async def merge_requests(self) -> list[dict[str, Any]]:
        return await self._paginate(f"{self._project}/merge_requests", {"state": "opened", "scope": "all"})

    async def merge_request(self, iid: int) -> dict[str, Any] | None:
        return await self._get_or_none(f"{self._project}/merge_requests/{int(iid)}")

    async def mr_approvals(self, iid: int) -> list[str]:
        """Noms d'utilisateur des personnes qui ont approuvé la merge request."""
        try:
            data = await self._get(f"{self._project}/merge_requests/{int(iid)}/approvals")
        except GitLabError as exc:
            if exc.status in (403, 404):  # approbations indisponibles : on fait comme s'il n'y en avait pas
                return []
            raise
        return [
            str(entry["user"]["username"])
            for entry in data.get("approved_by") or []
            if entry.get("user", {}).get("username")
        ]

    async def mr_closes_issues(self, iid: int) -> list[int]:
        """iid des issues du projet que la merge request fermera."""
        try:
            issues = await self._paginate(f"{self._project}/merge_requests/{int(iid)}/closes_issues")
        except GitLabError as exc:
            if exc.status == 404:
                return []
            raise
        return [int(issue["iid"]) for issue in issues if issue.get("iid") is not None]

    # --- dépôt et CI ----------------------------------------------------------------------------

    async def pipelines(self, ref: str, limit: int = 20) -> list[dict[str, Any]]:
        return await self._get(f"{self._project}/pipelines", {"ref": ref, "per_page": limit})

    async def last_commit(self, ref: str) -> dict[str, Any] | None:
        """Dernier commit d'une branche, ou None si le dépôt est vide."""
        commits = await self._get_or_none(
            f"{self._project}/repository/commits", {"ref_name": ref, "per_page": 1}
        )
        return commits[0] if commits else None

    async def commit(self, sha: str) -> dict[str, Any] | None:
        return await self._get_or_none(f"{self._project}/repository/commits/{quote(sha, safe='')}")

    async def tags(self, limit: int = 50) -> list[dict[str, Any]]:
        return await self._get_or_none(f"{self._project}/repository/tags", {"per_page": limit}) or []


def _describe_status(status: int) -> str:
    if status == 401:
        return "GitLab refuse le token du serveur (401) : il est peut-être expiré ou révoqué"
    if status == 403:
        return "GitLab refuse l'accès (403) : le token du serveur n'a pas les droits nécessaires"
    if status == 404:
        return "GitLab ne trouve pas la ressource demandée (404)"
    if status == 429:
        return "GitLab limite le débit des requêtes (429)"
    if status >= 500:
        return f"GitLab est en erreur ({status})"
    return f"GitLab a répondu {status}"
