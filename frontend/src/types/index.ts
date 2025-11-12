export type JobSummary = {
  id: number;
  job_code: string;
  title: string;
  location?: string | null;
  salary_range?: string | null;
  created_at: string;
};

export type JobDetail = JobSummary & {
  description: string;
  requirements: string;
};

export type DocumentUploadResponse = {
  cv_document_id: string;
  project_document_id: string;
};

export type EvaluationResult = {
  cv_match_rate: number;
  cv_feedback: string;
  project_score: number;
  project_feedback: string;
  overall_summary: string;
  cv_parameter_scores?: Record<string, number> | null;
  project_parameter_scores?: Record<string, number> | null;
  raw_context?: Record<string, unknown> | null;
};

export type EvaluationStatus = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  result?: EvaluationResult | null;
  error?: string | null;
  queued_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
};

export type ApplicationItem = {
  id: number;
  job_id?: number | null;
  job_title: string;
  status: string;
  created_at: string;
  evaluation_result?: EvaluationResult | null;
};

export type AuthTokens = {
  access: string;
  refresh: string;
};
