"""Settings for the CourseMind ingestion service.

Loaded exclusively from environment variables — never hardcoded (SR-4).
Fails fast at startup if a required variable is missing.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed, validated configuration.

    Required env vars (no defaults):
      DATABASE_URL   — psycopg3 connection string, e.g.
                       postgresql://user:pass@host:5432/db
      GOOGLE_API_KEY — AI Studio API key for text-embedding-004 (ADR-0002 §2)

    Optional env vars (have defaults):
      EMBEDDING_MODEL — embedding model name passed to the Generative AI API.
                        Default: text-embedding-004
      EMBEDDING_DIM   — expected vector dimension; must match vector(N) column.
                        Default: 768  (ADR-0002 §2)
      CHUNK_SIZE      — max characters per chunk window. Default: 800
      CHUNK_OVERLAP   — overlap between adjacent windows. Default: 160
    """

    model_config = SettingsConfigDict(
        env_file=".env",          # load .env if present; env vars take precedence
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    # --- required ---
    DATABASE_URL: str
    GOOGLE_API_KEY: str

    # --- optional with defaults ---
    EMBEDDING_MODEL: str = "text-embedding-004"
    EMBEDDING_DIM: int = 768
    CHUNK_SIZE: int = 800
    CHUNK_OVERLAP: int = 160
