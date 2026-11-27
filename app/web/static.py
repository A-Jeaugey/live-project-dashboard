"""Service de l'interface compilée (dossier `frontend/dist`), avec repli sur `index.html`."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

router = APIRouter()

RESERVED_PREFIXES = ("api/", "auth/", "hooks/")
RESERVED_PATHS = {"api", "auth", "hooks", "healthz"}
IMMUTABLE = "public, max-age=31536000, immutable"
NOT_BUILT = (
    "Interface non compilée : lancer `npm run build` dans frontend/, ou utiliser son serveur de développement"
)


@router.get("/{full_path:path}", include_in_schema=False)
async def frontend(full_path: str, request: Request) -> FileResponse:
    if full_path in RESERVED_PATHS or full_path.startswith(RESERVED_PREFIXES):
        raise HTTPException(status_code=404, detail="Route inconnue")

    dist: Path = Path(request.app.state.settings.frontend_dist).resolve()
    index = dist / "index.html"
    if not index.is_file():
        raise HTTPException(
            status_code=404,
            detail=NOT_BUILT,
        )

    if full_path:
        candidate = (dist / full_path).resolve()
        # `resolve()` neutralise les « .. » : on ne sert que ce qui reste dans le dossier compilé.
        if candidate.is_file() and candidate.is_relative_to(dist):
            cache = IMMUTABLE if candidate.is_relative_to(dist / "assets") else "no-cache"
            return FileResponse(candidate, headers={"Cache-Control": cache})
        if Path(full_path).suffix:
            raise HTTPException(status_code=404, detail="Fichier introuvable")

    # Toute autre adresse est une page de l'application : le routage se fait dans le navigateur.
    return FileResponse(index, headers={"Cache-Control": "no-cache"})
