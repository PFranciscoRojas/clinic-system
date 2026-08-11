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

    # Whisper (faster-whisper / CTranslate2)
    whisper_model: str = "base"
    # int8 quantisation is what makes CPU inference viable here; float32 on the
    # same box is roughly the PyTorch runtime this replaced.
    whisper_compute_type: str = "int8"
    # Matches the CX21's 2 vCPU. Settable because the plan explicitly puts a
    # bigger box on the table (CPX31, 4 vCPU), and moving there should be an
    # .env change, not a code change. 0 means "every core CTranslate2 can see".
    whisper_cpu_threads: int = 2
    # Length of the pieces the recording is cut into before transcription.
    # faster-whisper builds the log-Mel spectrogram of whatever it is given in
    # one pass, at ~0.9 MB per second of audio, so this is what bounds peak
    # memory: an hour in one piece needs ~3.4 GB and OOM-killed the service on a
    # 1.9 GB box. 180 s measured at 528 MB peak for the same recording.
    whisper_chunk_seconds: int = 180
    # How far from a nominal boundary a silence may be and still be used as the
    # cut. Wide enough to almost always find one in a conversation; narrow
    # enough that the pieces stay near whisper_chunk_seconds.
    whisper_chunk_search_seconds: int = 25

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
