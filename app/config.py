"""Configuration : secrets et adresses dans l'environnement (`.env`), réglages du projet en TOML."""

from __future__ import annotations

import tomllib
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Variables d'environnement. Chaque variable est décrite dans `.env.example`."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["prod", "dev"] = "prod"
    app_base_url: str
    session_secret: SecretStr

    gitlab_url: str
    gitlab_project: str
    gitlab_token: SecretStr
    gitlab_oauth_client_id: str = ""
    gitlab_oauth_client_secret: SecretStr = SecretStr("")
    gitlab_webhook_secret: SecretStr = SecretStr("")
    gitlab_webhook_signing_token: SecretStr = SecretStr("")
    gitlab_min_access_level: int = 10

    project_config: Path = Path("config/projet.toml")
    frontend_dist: Path = Path("frontend/dist")
    data_dir: Path = Path("data")

    cookie_secure: bool = True
    allowed_origins: str = ""

    poll_interval_seconds: int = 30
    full_refresh_seconds: int = 600
    webhook_fresh_seconds: int = 3600
    membership_recheck_seconds: int = 600
    log_level: str = "INFO"

    @field_validator("app_base_url", "gitlab_url")
    @classmethod
    def _strip_trailing_slash(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        parts = urlsplit(value)
        if parts.scheme not in {"http", "https"} or not parts.netloc:
            raise ValueError("doit être une URL complète, par exemple https://exemple.fr")
        return value

    @model_validator(mode="after")
    def _check_secrets(self) -> Settings:
        if self.app_env == "prod" and len(self.session_secret.get_secret_value()) < 32:
            raise ValueError("SESSION_SECRET doit faire au moins 32 caractères")
        return self

    @property
    def origins(self) -> set[str]:
        """Origines autorisées pour les requêtes qui modifient quelque chose."""
        extra = {o.strip().rstrip("/") for o in self.allowed_origins.split(",") if o.strip()}
        return {self.app_base_url, *extra}


class ColumnLabelsConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    idea: str = Field(default="Idée", alias="idee")
    todo: str = Field(default="À faire", alias="a_faire")
    doing: str = Field(default="En cours", alias="en_cours")


class ThresholdsConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    stale_days: int = Field(default=14, alias="jours_sans_activite", ge=1)
    review_hours: int = Field(default=48, alias="heures_relecture", ge=1)
    done_window_days: int = Field(default=14, alias="fenetre_fait_jours", ge=1)


class PlayableConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    rule: Literal["pipeline", "tag", "commit"] = Field(default="pipeline", alias="regle")
    tag_pattern: str = Field(default="jouable-*", alias="motif_tag")


class DomainConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(alias="nom")
    color: str = Field(default="#6F7B8C", alias="couleur")


class MemberConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    first_name: str = Field(alias="prenom")
    gitlab: str
    discord: str | None = None


class DeadlineConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    key: str = Field(alias="cle")
    title: str = Field(alias="titre")
    short_title: str = Field(default="", alias="titre_court")
    week_of: date = Field(alias="semaine_du")
    exact_date: date | None = Field(default=None, alias="date_exacte")
    night: int | None = Field(default=None, alias="nuit", ge=1)
    milestone_title: str | None = Field(default=None, alias="jalon")

    @model_validator(mode="after")
    def _normalize(self) -> DeadlineConfig:
        # « Semaine du » désigne toujours un lundi : une autre date est ramenée au lundi précédent.
        self.week_of = self.week_of - timedelta(days=self.week_of.weekday())
        if not self.short_title:
            self.short_title = self.title
        return self


class ProjectMeta(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(default="Projet", alias="nom")
    timezone: str = Field(default="Europe/Paris", alias="fuseau")


class ProjectConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project: ProjectMeta = Field(default_factory=ProjectMeta, alias="projet")
    columns: ColumnLabelsConfig = Field(default_factory=ColumnLabelsConfig, alias="colonnes")
    thresholds: ThresholdsConfig = Field(default_factory=ThresholdsConfig, alias="seuils")
    playable: PlayableConfig = Field(default_factory=PlayableConfig, alias="version_jouable")
    domains: list[DomainConfig] = Field(default_factory=list, alias="domaines")
    members: list[MemberConfig] = Field(default_factory=list, alias="membres")
    deadlines: list[DeadlineConfig] = Field(default_factory=list, alias="echeances")

    @model_validator(mode="after")
    def _check_unique(self) -> ProjectConfig:
        keys = [d.key for d in self.deadlines]
        if len(keys) != len(set(keys)):
            raise ValueError("deux échéances ont la même clé")
        nights = [d.night for d in self.deadlines if d.night is not None]
        if len(nights) != len(set(nights)):
            raise ValueError("deux échéances ont le même numéro de nuit")
        return self


def load_project_config(path: Path) -> ProjectConfig:
    with path.open("rb") as handle:
        return ProjectConfig.model_validate(tomllib.load(handle))


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
