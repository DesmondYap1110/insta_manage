from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "instagram_media_manager",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.download_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    broker_connection_retry_on_startup=True,
)
