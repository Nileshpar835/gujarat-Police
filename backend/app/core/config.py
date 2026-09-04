from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://cctv_user:cctv_pass@localhost:5432/cctv_platform"

    # App
    app_name: str = "Gujarat CCTV Registry & Federation Service"
    environment: str = "development"
    api_prefix: str = "/api/v1"

    # Adapter behaviour
    camera_health_check_timeout_seconds: int = 5
    camera_health_check_retries: int = 2

    # Auth
    jwt_secret_key: str = "CHANGE_ME_IN_PRODUCTION_this_is_a_hackathon_default"
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = 480  # 8-hour shift-length token, per typical control-room usage

    # Service-to-service auth for the AI worker (not a human user, so it
    # authenticates via a shared secret rather than logging in) — see
    # HLD Section 13, "service-to-service authentication".
    ai_worker_api_key: str = "CHANGE_ME_dev_only_ai_worker_key"

    class Config:
        env_file = ".env"


settings = Settings()
