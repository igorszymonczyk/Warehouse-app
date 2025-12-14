# backend/config.py
from pydantic_settings import BaseSettings
from typing import ClassVar
from pathlib import Path

# Resolve absolute path to the .env file for reliable loading
env_path = Path(__file__).parent.parent / ".env"

class Settings(BaseSettings):
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    DATABASE_URL: str

    PAYU_API_URL: str
    PAYU_POS_ID: str
    PAYU_CLIENT_ID: str
    PAYU_CLIENT_SECRET: str
    PAYU_SECOND_KEY_MD5: str
    FRONTEND_URL: str
    
    # Public backend URL used for PayU notifications (webhook)
    BACKEND_URL: str = "http://127.0.0.1:8000"

    class Config:
        env_file: ClassVar[str] = str(env_path)

settings = Settings()