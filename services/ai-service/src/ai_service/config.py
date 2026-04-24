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

    # Anthropic
    anthropic_api_key: str

    # Whisper
    whisper_model: str = "base"

    # Audio
    audio_base_path: str = "/data/audio"

    # Observability
    log_level: str = "info"
    environment: str = "development"

    @property
    def redis_url(self) -> str:
        return f"redis://:{self.redis_password}@{self.redis_host}:{self.redis_port}/0"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )


settings = Settings()  # type: ignore[call-arg]
