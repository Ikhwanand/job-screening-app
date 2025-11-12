import uuid
from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()


class Document(models.Model):
    DOCUMENT_TYPES = [
        ('candidate_cv', 'Candidate CV'),
        ('candidate_project', 'Candidate Project'),
        ('system_job_desc', 'System Job Description'),
        ('system_rubric', 'System Rubric'),
    ]

    uuid = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='documents',
    )
    doc_type = models.CharField(max_length=32, choices=DOCUMENT_TYPES)
    checksum = models.CharField(max_length=64)
    file_path = models.CharField(max_length=500)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.get_doc_type_display()} - {self.file_path}'


class Job(models.Model):
    job_code = models.SlugField(unique=True)
    title = models.CharField(max_length=250)
    description = models.TextField()
    requirements = models.TextField()
    salary_range = models.CharField(max_length=100, blank=True)
    location = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title


class Application(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    job = models.ForeignKey(Job, null=True, blank=True, on_delete=models.SET_NULL)
    job_title = models.CharField(max_length=200)
    cv_document = models.ForeignKey(
        Document,
        related_name='cv_applications',
        on_delete=models.CASCADE,
    )
    project_document = models.ForeignKey(
        Document,
        related_name='project_applications',
        on_delete=models.CASCADE,
    )
    status = models.CharField(max_length=20, default='pending')
    evaluation_result = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.user} - {self.job_title}'


class EvaluationJob(models.Model):
    uuid = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(Application, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, default='queued')
    progress_log = models.JSONField(default=list, blank=True)
    result = models.JSONField(null=True, blank=True)
    error = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def _append_log(self, stage: str, message: str):
        log = list(self.progress_log or [])
        log.append(
            {
                "stage": stage,
                "message": message,
                "timestamp": timezone.now().isoformat(),
            }
        )
        self.progress_log = log

    def mark_processing(self):
        if self.status == 'processing':
            return
        self.status = 'processing'
        self._append_log('processing', 'Job started')
        self.save(update_fields=['status', 'progress_log', 'updated_at'])

    def mark_completed(self, result: dict):
        self.status = 'completed'
        self.result = result
        self._append_log('completed', 'Job finished')
        self.save(update_fields=['status', 'result', 'progress_log', 'updated_at'])

        self.application.status = 'evaluated'
        self.application.evaluation_result = result
        self.application.save(update_fields=['status', 'evaluation_result', 'updated_at'])

    def mark_failed(self, error: str):
        self.status = 'failed'
        self.error = error
        self._append_log('failed', error)
        self.save(update_fields=['status', 'error', 'progress_log', 'updated_at'])
