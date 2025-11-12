from typing import Dict, Optional
from pydantic import BaseModel, Field
from agno.agent import Agent
from agno.models.nvidia import Nvidia
from agno.knowledge.knowledge import Knowledge

from .retrieval import get_vector_db
from .text import extract_pdf_text
from django.conf import settings

MODEL_ID = settings.LLM_MODEL_ID
MODEL_API_KEY = settings.API_KEY_LLM

class CVScore(BaseModel):
    match_rate: float = Field(description="CV match 0-100")
    feedback: str


class ProjectScore(BaseModel):
    score: float
    feedback: str


class FinalEvaluation(BaseModel):
    cv_score: CVScore
    project_score: ProjectScore
    overall_summary: str
    parameter_scores: Dict[str, float]


async def run_evaluation_pipeline(
    cv_path: str,
    project_path: str,
    job_title: str,
    job_id: Optional[str] = None,
) -> Dict:
    """Main RAG pipeline orchestrator."""
    cv_text = extract_pdf_text(cv_path)
    project_text = extract_pdf_text(project_path)

    vector_db = get_vector_db()
    knowledge = Knowledge(vector_db=vector_db, max_results=5)

    cv_agent = Agent(
        model=Nvidia(id=MODEL_ID, api_key=MODEL_API_KEY),
        knowledge=knowledge,
        output_schema=CVScore,
        instructions=[
            f"Score applicant CV for the {job_title} position.",
            "Use retrieved job description and rubrics.",
            "Return match_rate (0-100) and detailed feedback.",
        ],
    )

    project_agent = Agent(
        model=Nvidia(id=MODEL_ID, api_key=MODEL_API_KEY),
        knowledge=knowledge,
        output_schema=ProjectScore,
        instructions=[
            "Score the candidate project report against the case study brief.",
            "Use retrieved rubrics and evaluation criteria.",
        ],
    )

    summary_agent = Agent(
        model=Nvidia(id=MODEL_ID, api_key=MODEL_API_KEY),
        output_schema=FinalEvaluation,
    )

    cv_result = await cv_agent.arun(
        f"Evaluate this CV for {job_title}:\n{cv_text}\n\nJob ID: {job_id or 'N/A'}"
    )
    project_result = await project_agent.arun(
        f"Evaluate this project report:\n{project_text}\n\nJob: {job_title}"
    )
    final_result = await summary_agent.arun(
        f"Synthesize evaluation:\nCV: {cv_result.content}\nProject: {project_result.content}"
    )

    evaluation = final_result.content
    return {
        "cv_match_rate": evaluation.cv_score.match_rate,
        "cv_feedback": evaluation.cv_score.feedback,
        "project_score": evaluation.project_score.score,
        "project_feedback": evaluation.project_score.feedback,
        "overall_summary": evaluation.overall_summary,
        "parameter_scores": evaluation.parameter_scores,
    }
