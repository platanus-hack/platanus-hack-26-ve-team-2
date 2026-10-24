from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Platanus AR API"
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/platanus_ar"
    cors_origins: list[str] = ["*"]
    sql_echo: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
