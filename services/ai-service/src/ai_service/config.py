from urllib.parse import quote

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    db_host: str = "postgres"
    db_port: int = 5432
    db_name: str = "sghcp"
    db_user: str = "sghcp_app"
    db_password: str

    # Redis
    redis_host: str = "redis"
    redis_port: int = 6379
    redis_password: str

    # Envelope encryption — same MASTER_KEY used by core-api to decrypt DEKs
    master_key: str

    # Anthropic
    anthropic_api_key: str
    anthropic_model: str = "claude-sonnet-4-6"
    # Low temperature: clinical drafting must be deterministic and faithful to
    # the source text, not creative.
    anthropic_temperature: float = 0.2

    # Whisper
    whisper_model: str = "base"

    # Audio
    audio_base_path: str = "/data/audio"

    # Observability
    log_level: str = "info"
    environment: str = "development"

    # Passwords go through quote(): characters like '#' or '@' in a raw
    # password truncate the URL (host parses as empty → localhost fallback)
    @property
    def redis_url(self) -> str:
        return f"redis://:{quote(self.redis_password, safe='')}@{self.redis_host}:{self.redis_port}/0"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql://{quote(self.db_user, safe='')}:{quote(self.db_password, safe='')}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )


settings = Settings()  # type: ignore[call-arg]
