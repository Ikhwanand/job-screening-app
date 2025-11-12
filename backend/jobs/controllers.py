import asyncio
import hashlib
from pathlib import Path
from uuid import uuid4

from asgiref.sync import sync_to_async
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from ninja import File
from ninja.errors import HttpError
from ninja.files import UploadedFile
from ninja_extra import api_controller, route
from ninja_extra.controllers import ControllerBase
from ninja_extra.permissions import IsAuthenticated
from ninja_jwt.authentication import AsyncJWTAuth

from .models import Application, Document, EvaluationJob, Job
from .schemas import (
    ApplicationSchema,
    DocumentUploadResponse,
    EvaluateRequest,
    EvaluationStatusResponse,
    JobCreateRequest,
    JobDetailSchema,
    JobSchema,
    RegisterRequest,
    RegisterResponse,
)
from .tasks import run_evaluation_job

CANDIDATE_CV = "candidate_cv"
CANDIDATE_PROJECT = "candidate_project"
UserModel = get_user_model()


def _save_uploaded_file(uploaded: UploadedFile) -> tuple[str, str]:
    """Persist file under MEDIA_ROOT/documents/ and return (path, checksum)."""
    if uploaded.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HttpError(400, "Only PDF files are supported.")

    ext = Path(uploaded.name).suffix or ".pdf"
    target_dir = Path(settings.MEDIA_ROOT) / "documents"
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{uuid4()}{ext}"

    sha = hashlib.sha256()
    with target_path.open("wb") as dest:
        for chunk in uploaded.chunks():
            sha.update(chunk)
            dest.write(chunk)

    return str(target_path), sha.hexdigest()


def _validate_document_type(document: Document, expected_type: str) -> None:
    if document.doc_type != expected_type:
        raise HttpError(400, f"Document type mismatch. Expected '{expected_type}'.")


@api_controller(
    "/auth",
    tags=["Auth"],
    auth=None,
    permissions=[],
)
class AuthController(ControllerBase):
    @route.post(
        "/register",
        response=RegisterResponse,
        auth=None,
        permissions=[],
    )
    async def register(self, request, payload: RegisterRequest):
        try:
            user = await sync_to_async(self._create_user)(payload)
        except IntegrityError:
            raise HttpError(409, "User with this email already exists.")

        return RegisterResponse(
            id=str(user.pk),
            email=user.email or payload.email,
            first_name=user.first_name or None,
            last_name=user.last_name or None,
        )

    @staticmethod
    def _create_user(payload: RegisterRequest):
        return UserModel.objects.create_user(
            username=getattr(payload, "email", ""),
            email=payload.email,
            password=payload.password,
            first_name=payload.first_name or "",
            last_name=payload.last_name or "",
        )


@api_controller(
    "/applications",
    tags=["Applications"],
    permissions=[IsAuthenticated],
    auth=AsyncJWTAuth(),
)
class ApplicationController(ControllerBase):
    @route.get("/", response=list[ApplicationSchema])
    async def list_applications(self, request):
        applications = []
        qs = Application.objects.filter(user=request.user).select_related("job").order_by("-created_at")
        async for application in qs:
            job_title = application.job.title if application.job else application.job_title
            applications.append(
                ApplicationSchema(
                    id=application.pk,
                    job_id=application.job_id,
                    job_title=job_title,
                    status=application.status,
                    created_at=application.created_at,
                    evaluation_result=application.evaluation_result,
                )
            )
        return applications

    @route.post("/upload", response=DocumentUploadResponse)
    async def upload(
        self,
        request,
        cv: UploadedFile = File(...),
        project_report: UploadedFile = File(...),
    ):
        cv_path, cv_checksum = await asyncio.to_thread(_save_uploaded_file, cv)
        project_path, project_checksum = await asyncio.to_thread(
            _save_uploaded_file,
            project_report,
        )

        cv_doc = await Document.objects.acreate(
            owner=request.user,
            doc_type=CANDIDATE_CV,
            checksum=cv_checksum,
            file_path=cv_path,
            metadata={"original_name": cv.name},
        )
        project_doc = await Document.objects.acreate(
            owner=request.user,
            doc_type=CANDIDATE_PROJECT,
            checksum=project_checksum,
            file_path=project_path,
            metadata={"original_name": project_report.name},
        )

        return DocumentUploadResponse(
            cv_document_id=str(cv_doc.pk),
            project_document_id=str(project_doc.pk),
        )


@api_controller(
    "/evaluation",
    tags=["Evaluation"],
    permissions=[IsAuthenticated],
    auth=AsyncJWTAuth(),
)
class EvaluationController(ControllerBase):
    @route.post("/evaluate", response=EvaluationStatusResponse)
    async def evaluate(self, request, payload: EvaluateRequest):
        cv_document = await Document.objects.aget(
            pk=payload.cv_document_id,
            owner=request.user,
        )
        project_document = await Document.objects.aget(
            pk=payload.project_document_id,
            owner=request.user,
        )
        _validate_document_type(cv_document, CANDIDATE_CV)
        _validate_document_type(project_document, CANDIDATE_PROJECT)

        job = None
        if payload.job_id is not None:
            job = await Job.objects.aget(id=payload.job_id)

        application = await Application.objects.acreate(
            user=request.user,
            job=job,
            job_title=payload.job_title,
            cv_document=cv_document,
            project_document=project_document,
            status=Application.Status.QUEUED if hasattr(Application, "Status") else "queued",
        )
        evaluation_job = await EvaluationJob.objects.acreate(application=application)

        run_evaluation_job.delay(str(evaluation_job.pk))

        return EvaluationStatusResponse(
            id=str(evaluation_job.pk),
            status=evaluation_job.status,
            queued_at=evaluation_job.created_at.isoformat() if evaluation_job.created_at else None,
        )

    @route.get("/result/{job_id}", response=EvaluationStatusResponse)
    async def result(self, request, job_id: str):
        evaluation_job = await EvaluationJob.objects.select_related(
            "application__user",
        ).aget(
            pk=job_id,
            application__user=request.user,
        )
        started_at = None
        if evaluation_job.progress_log:
            first_entry = evaluation_job.progress_log[0]
            started_at = first_entry.get("timestamp")
        if not started_at and evaluation_job.created_at:
            started_at = evaluation_job.created_at.isoformat()

        finished_at = None
        if evaluation_job.status in {"completed", "failed"} and evaluation_job.updated_at:
            finished_at = evaluation_job.updated_at.isoformat()

        return EvaluationStatusResponse(
            id=str(evaluation_job.pk),
            status=evaluation_job.status,
            result=evaluation_job.result,
            error=evaluation_job.error or None,
            queued_at=evaluation_job.created_at.isoformat() if evaluation_job.created_at else None,
            started_at=started_at,
            finished_at=finished_at,
        )


@api_controller(
    "/jobs",
    tags=["Jobs"],
    auth=None,
    permissions=[],
)
class JobsController(ControllerBase):
    @route.get("/", response=list[JobSchema], auth=None, permissions=[])
    async def list_jobs(self, request):
        jobs = []
        qs = Job.objects.all().order_by("title")
        async for job in qs:
            jobs.append(
                JobSchema(
                    id=job.pk,
                    job_code=job.job_code,
                    title=job.title,
                    location=job.location,
                    salary_range=job.salary_range,
                    created_at=job.created_at,
                )
            )
        return jobs

    @route.get("/{job_id}", response=JobDetailSchema, auth=None, permissions=[])
    async def retrieve_job(self, request, job_id: int):
        try:
            job = await Job.objects.aget(pk=job_id)
        except Job.DoesNotExist:
            raise HttpError(404, "Job not found.")
        return JobDetailSchema(
            id=job.pk,
            job_code=job.job_code,
            title=job.title,
            description=job.description,
            requirements=job.requirements,
            location=job.location,
            salary_range=job.salary_range,
            created_at=job.created_at,
        )

    @route.post("/", response=JobDetailSchema, permissions=[IsAuthenticated], auth=AsyncJWTAuth())
    async def create_job(self, request, payload: JobCreateRequest):
        if not request.user.is_staff:
            raise HttpError(403, "Only admin users can create jobs.")

        try:
            job = await Job.objects.acreate(
                job_code=payload.job_code,
                title=payload.title,
                description=payload.description,
                requirements=payload.requirements,
                salary_range=payload.salary_range or "",
                location=payload.location or "",
            )
        except IntegrityError:
            raise HttpError(400, "Job code already exists.")
        return JobDetailSchema(
            id=job.pk,
            job_code=job.job_code,
            title=job.title,
            description=job.description,
            requirements=job.requirements,
            location=job.location,
            salary_range=job.salary_range,
            created_at=job.created_at,
        )
