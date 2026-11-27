.PHONY: help install dev-gitlab dev-app dev-front test lint format

help:
	@echo "make install      installe les dépendances Python (et celles du frontend s'il existe)"
	@echo "make dev-gitlab   lance le faux GitLab de développement sur http://127.0.0.1:8001"
	@echo "make dev-app      lance l'application sur http://127.0.0.1:8000, branchée sur le faux GitLab"
	@echo "make dev-front    lance le serveur de développement du frontend"
	@echo "make test         lance les tests"
	@echo "make lint         vérifie le style et le formatage"
	@echo "make format       reformate le code"

install:
	uv sync
	@if [ -f frontend/package.json ]; then cd frontend && npm install; fi

dev-gitlab:
	NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost \
		uv run uvicorn dev.fake_gitlab.server:app --host 127.0.0.1 --port 8001

dev-app:
	uv run --env-file dev/dev.env uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir app

dev-front:
	cd frontend && npm run dev

test:
	uv run pytest

lint:
	uv run ruff check .
	uv run ruff format --check .

format:
	uv run ruff check --fix .
	uv run ruff format .
