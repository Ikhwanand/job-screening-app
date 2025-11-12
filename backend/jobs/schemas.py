from datetime import datetime
from typing import Any, Dict, Optional

from ninja import Schema
from pydantic import EmailStr


class DocumentUploadResponse(Schema):
    cv_document_id: str 
    project_document_id: str 
    

class EvaluateRequest(Schema):
    job_title: str 
    job_id: Optional[int] = None 
    cv_document_id: str 
    project_document_id: str 
    

class EvaluationResult(Schema):
    cv_match_rate: float
    cv_feedback: str 
    project_score: float 
    project_feedback: str 
    overall_summary: str 
    cv_parameter_scores: Optional[Dict[str, float]] = None 
    project_parameter_scores: Optional[Dict[str, float]] = None 
    raw_context: Optional[Dict[str, Any]] = None 
    

class EvaluationStatusResponse(Schema):
    id: str
    status: str
    result: Optional[EvaluationResult] = None
    error: Optional[str] = None
    queued_at: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None


class RegisterRequest(Schema):
    email: EmailStr
    password: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class RegisterResponse(Schema):
    id: str
    email: EmailStr
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class JobSchema(Schema):
    id: int
    job_code: str
    title: str
    location: Optional[str] = None
    salary_range: Optional[str] = None
    created_at: datetime


class JobDetailSchema(JobSchema):
    description: str
    requirements: str


class JobCreateRequest(Schema):
    job_code: str
    title: str
    description: str
    requirements: str
    salary_range: Optional[str] = None
    location: Optional[str] = None


class ApplicationSchema(Schema):
    id: int
    job_id: Optional[int] = None
    job_title: str
    status: str
    created_at: datetime
    evaluation_result: Optional[Dict[str, Any]] = None
    
