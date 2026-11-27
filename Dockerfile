# syntax=docker/dockerfile:1

# --- Étape 1 : compilation de l'interface -------------------------------------------------------
FROM node:22-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Étape 2 : dépendances Python ---------------------------------------------------------------
FROM python:3.13-slim AS python-deps
RUN pip install --no-cache-dir uv
WORKDIR /srv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# --- Étape 3 : image finale ---------------------------------------------------------------------
FROM python:3.13-slim
RUN useradd --system --uid 10001 --home-dir /srv --shell /usr/sbin/nologin carnet \
    && mkdir /data && chown carnet /data
WORKDIR /srv
COPY --from=python-deps /srv/.venv /srv/.venv
COPY app/ app/
COPY config/ config/
COPY --from=frontend /src/frontend/dist frontend/dist

ENV PATH="/srv/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DATA_DIR=/data \
    FRONTEND_DIST=/srv/frontend/dist \
    PROJECT_CONFIG=/srv/config/projet.toml

USER carnet
EXPOSE 8000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3)"]

# L'application n'est joignable que par le reverse proxy ou le tunnel du même réseau Docker :
# on peut donc se fier à leurs en-têtes X-Forwarded-*.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips", "*", "--timeout-graceful-shutdown", "5"]
