from asgiref.sync import async_to_sync
from celery import shared_task

from .models import EvaluationJob
from .services.pipeline import run_evaluation_pipeline


@shared_task(bind=True, max_retries=3)
def run_evaluation_job(self, job_uuid: str):
    """
    Celery task that runs the Agno RAG pipeline.
    Retries on transient AI error
    """
    job = EvaluationJob.objects.select_related(
        "application",
        "application__cv_document",
        "application__project_document",
    ).get(uuid=job_uuid)
    
    job.mark_processing()
    
    try:
        cv_path = job.application.cv_document.file_path
        project_path = job.application.project_document.file_path
        
        result = async_to_sync(run_evaluation_pipeline)(
            cv_path=cv_path,
            project_path=project_path,
            job_title=job.application.job_title,
            job_id=str(job.application.job_id) if job.application.job_id else None,
        )
        job.mark_completed(result)
        return result 
    
    except Exception as exc:
        job.mark_failed(str(exc))
        if "rate_limit" in str(exc).lower():
            raise self.retry(exc=exc, countdown=60)
        raise 
    
    