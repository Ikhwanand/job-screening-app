import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FiAlertTriangle, FiRefreshCw, FiUpload, FiUser } from "react-icons/fi";
import { toast } from "react-toastify";

import apiClient from "../lib/api";
import { useAuth } from "../context/AuthContext";
import AuthModal, { type AuthMode } from "../components/AuthModal";
import type {
  ApplicationItem,
  DocumentUploadResponse,
  EvaluationStatus,
  JobDetail,
  JobSummary,
} from "../types";

const PAGE_SIZE = 5;

const statusBadge: Record<string, string> = {
  queued: "badge badge--neutral",
  processing: "badge badge--warning",
  completed: "badge badge--success",
  failed: "badge badge--danger",
};

const formatMatchRate = (value?: number | null) => {
  if (value === undefined || value === null) return "N/A";
  return value <= 1 ? `${Math.round(value * 100)}%` : `${value}%`;
};

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "--";

const JobsPage = () => {
  const { isAuthenticated, userEmail, logout } = useAuth();

  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
  const [applications, setApplications] = useState<ApplicationItem[]>([]);

  const [searchTitle, setSearchTitle] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [cvFile, setCvFile] = useState<File | null>(null);
  const [projectFile, setProjectFile] = useState<File | null>(null);
  const [customJobTitle, setCustomJobTitle] = useState("");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationStatus, setEvaluationStatus] = useState<EvaluationStatus | null>(null);
  const pollRef = useRef<number | null>(null);

  const [jobForm, setJobForm] = useState({
    job_code: "",
    title: "",
    description: "",
    requirements: "",
    salary_range: "",
    location: "",
  });
  const [jobSubmitting, setJobSubmitting] = useState(false);
  const resetJobForm = () =>
    setJobForm({
      job_code: "",
      title: "",
      description: "",
      requirements: "",
      salary_range: "",
      location: "",
    });

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");

  const resetPolling = () => {
    if (pollRef.current) {
      window.clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  };

  const fetchJobs = useCallback(async () => {
    try {
      const { data } = await apiClient.get<JobSummary[]>("/jobs/");
      setJobs(data);
    } catch (error) {
      console.error(error);
      toast.error("Unable to load job data.");
    }
  }, []);

  const fetchJobDetail = useCallback(async (jobId: number) => {
    try {
      const { data } = await apiClient.get<JobDetail>(`/jobs/${jobId}`);
      setJobDetail(data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load job detail.");
    }
  }, []);

  const fetchApplications = useCallback(async () => {
    if (!isAuthenticated) {
      setApplications([]);
      return;
    }
    try {
      const { data } = await apiClient.get<ApplicationItem[]>("/applications/");
      setApplications(data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load applications.");
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchJobs();
    return () => resetPolling();
  }, [fetchJobs]);

  useEffect(() => {
    if (selectedJobId) {
      fetchJobDetail(selectedJobId);
    } else {
      setJobDetail(null);
    }
  }, [selectedJobId, fetchJobDetail]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTitle, searchLocation]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const titleMatch = job.title.toLowerCase().includes(searchTitle.toLowerCase());
      const locationMatch = (job.location || "")
        .toLowerCase()
        .includes(searchLocation.toLowerCase());
      return titleMatch && locationMatch;
    });
  }, [jobs, searchTitle, searchLocation]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredJobs.slice(start, start + PAGE_SIZE);
  }, [filteredJobs, currentPage]);

  useEffect(() => {
    if (filteredJobs.length === 0) {
      setSelectedJobId(null);
      return;
    }
    if (!selectedJobId || !filteredJobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(filteredJobs[0].id);
    }
  }, [filteredJobs, selectedJobId]);

  const handleEvaluate = async () => {
    if (!isAuthenticated) {
      toast.error("Please login to run evaluations.");
      return;
    }
    if (!cvFile || !projectFile) {
      toast.error("Attach both CV and project report PDFs.");
      return;
    }
    const jobTitle = (selectedJobId && jobDetail?.title) || customJobTitle.trim();
    if (!jobTitle) {
      toast.error("Provide a job title or pick a job first.");
      return;
    }

    setIsEvaluating(true);
    resetPolling();
    try {
      const formData = new FormData();
      formData.append("cv", cvFile);
      formData.append("project_report", projectFile);
      const uploadRes = await apiClient.post<DocumentUploadResponse>(
        "/applications/upload",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );

      const { data } = await apiClient.post<EvaluationStatus>("/evaluation/evaluate", {
        job_title: jobTitle,
        job_id: selectedJobId,
        cv_document_id: uploadRes.data.cv_document_id,
        project_document_id: uploadRes.data.project_document_id,
      });
      setEvaluationStatus(data);
      toast.info("Evaluation queued.");
      pollResult(data.id);
    } catch (error) {
      console.error(error);
      toast.error("Failed to start evaluation.");
      setIsEvaluating(false);
    }
  };

  const pollResult = (jobId: string) => {
    const poll = async () => {
      try {
        const { data } = await apiClient.get<EvaluationStatus>(`/evaluation/result/${jobId}`);
        setEvaluationStatus(data);
        if (data.status === "completed" || data.status === "failed") {
          setIsEvaluating(false);
          await fetchApplications();
          pollRef.current = null;
          if (data.status === "completed") {
            toast.success("Evaluation completed.");
          } else if (data.error) {
            toast.error(data.error);
          }
          return;
        }
        pollRef.current = window.setTimeout(poll, 4000);
      } catch (error) {
        console.error(error);
        toast.error("Failed to poll evaluation result.");
        setIsEvaluating(false);
      }
    };
    poll();
  };

  const handleCreateJob = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAuthenticated) {
      toast.error("You must login as an admin to create jobs.");
      return;
    }
    setJobSubmitting(true);
    try {
      await apiClient.post("/jobs/", jobForm);
      toast.success("Job created.");
      resetJobForm();
      fetchJobs();
    } catch (error: any) {
      const message = error?.response?.data?.detail || "Failed to create job.";
      toast.error(message);
    } finally {
      setJobSubmitting(false);
    }
  };

  const clearFilters = () => {
    setSearchTitle("");
    setSearchLocation("");
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="hero-copy">
          <p className="eyebrow">Job Screening Platform</p>
          <h1>Job Intelligence Overview</h1>
          <p className="subtitle">
            Search job descriptions, upload candidate artifacts, and let the RAG-powered backend score each
            submission.
          </p>
        </div>
        <div className="topbar">
          {isAuthenticated ? (
            <>
              <div className="topbar__user">
                <FiUser />
                <span>{userEmail}</span>
              </div>
              <button className="btn btn-ghost" type="button" onClick={logout}>
                Logout
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                setAuthMode("login");
                setAuthModalOpen(true);
              }}
            >
              Login / Register
            </button>
          )}
        </div>
      </header>

      <main className="layout-grid">
        <motion.section
          className="panel panel--wide"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="panel__header panel__header--stacked">
            <div>
              <h2>Open Roles</h2>
              <p className="subtitle">Filter by title or location, then select to inspect details.</p>
            </div>
            <div className="filters">
              <div className="form-field">
                <label htmlFor="searchTitle">Job title</label>
                <input
                  id="searchTitle"
                  value={searchTitle}
                  placeholder="e.g. Backend Engineer"
                  onChange={(e) => setSearchTitle(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label htmlFor="searchLocation">Location</label>
                <input
                  id="searchLocation"
                  value={searchLocation}
                  placeholder="Remote"
                  onChange={(e) => setSearchLocation(e.target.value)}
                />
              </div>
              <button className="btn btn-ghost" type="button" onClick={clearFilters}>
                Reset
              </button>
              <button className="btn btn-icon" type="button" onClick={fetchJobs}>
                <FiRefreshCw />
              </button>
            </div>
          </div>

          {paginatedJobs.length === 0 ? (
            <p className="empty-state">No jobs match the current filters.</p>
          ) : (
            <ul className="jobs-list jobs-list--table">
              {paginatedJobs.map((job) => (
                <li
                  key={job.id}
                  className={`jobs-item ${job.id === selectedJobId ? "jobs-item--active" : ""}`}
                  onClick={() => setSelectedJobId(job.id)}
                >
                  <p className="jobs-item__title">{job.title}</p>
                  <p className="jobs-item__meta">
                    {(job.location && job.location.trim()) || "Remote"} · {job.salary_range || "Salary TBD"}
                  </p>
                  <p className="jobs-item__code">Code: {job.job_code}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="pagination">
            <button
              className="btn btn-ghost"
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </button>
            <span className="pagination__info">
              Page {Math.min(currentPage, totalPages)} of {totalPages}
            </span>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next
            </button>
          </div>
        </motion.section>

        <motion.section className="panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="panel__header">
            <h2>Job Detail</h2>
            {jobDetail && <span className="badge badge--neutral">{jobDetail.job_code}</span>}
          </div>
          {jobDetail ? (
            <div className="job-detail">
              <h3>{jobDetail.title}</h3>
              <p className="job-detail__meta">
                {(jobDetail.location && jobDetail.location.trim()) || "Remote"} ·{" "}
                {jobDetail.salary_range || "Salary confidential"}
              </p>
              <div>
                <h4>Description</h4>
                <p>{jobDetail.description}</p>
              </div>
              <div>
                <h4>Requirements</h4>
                <p>{jobDetail.requirements}</p>
              </div>
            </div>
          ) : (
            <p className="empty-state">Choose a job from the list to view its content.</p>
          )}
        </motion.section>

        <motion.section className="panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="panel__header">
            <h2>AI Evaluation</h2>
            <span className={`badge ${isEvaluating ? "badge--warning" : "badge--neutral"}`}>
              {isEvaluating ? "Processing" : "Idle"}
            </span>
          </div>
          {!isAuthenticated && (
            <div className="panel__banner">
              Please{" "}
              <button
                className="inline-link inline-link--button"
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setAuthModalOpen(true);
                }}
              >
                login
              </button>{" "}
              to run evaluations.
            </div>
          )}
          <div className="form-field">
            <label>Override job title</label>
            <input
              value={customJobTitle}
              placeholder="Optional custom title"
              onChange={(e) => setCustomJobTitle(e.target.value)}
              disabled={isEvaluating}
            />
            <small>Leave empty to use the selected job title.</small>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Candidate CV (PDF)</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setCvFile(e.target.files?.[0] || null)}
                disabled={!isAuthenticated}
              />
            </div>
            <div className="form-field">
              <label>Project report (PDF)</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setProjectFile(e.target.files?.[0] || null)}
                disabled={!isAuthenticated}
              />
            </div>
          </div>
          <button className="btn btn-primary" type="button" onClick={handleEvaluate} disabled={isEvaluating}>
            <FiUpload />
            Run evaluation
          </button>

          {evaluationStatus && (
            <div className="evaluation-card">
              <div className="evaluation-card__header">
                <h3>Job #{evaluationStatus.id}</h3>
                <span className={statusBadge[evaluationStatus.status] || "badge"}>
                  {evaluationStatus.status.toUpperCase()}
                </span>
              </div>
              {evaluationStatus.error && (
                <p className="evaluation-card__error">
                  <FiAlertTriangle /> {evaluationStatus.error}
                </p>
              )}
              {evaluationStatus.result && (
                <div className="evaluation-card__body">
                  <p>
                    <strong>CV match:</strong> {formatMatchRate(evaluationStatus.result.cv_match_rate)}
                  </p>
                  <p>{evaluationStatus.result.cv_feedback}</p>
                  <p>
                    <strong>Project score:</strong> {evaluationStatus.result.project_score}
                  </p>
                  <p>{evaluationStatus.result.project_feedback}</p>
                  <p className="overall">{evaluationStatus.result.overall_summary}</p>
                </div>
              )}
            </div>
          )}
        </motion.section>

        <motion.section className="panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="panel__header panel__header--stacked">
            <div>
              <h2>Create Job (Admin)</h2>
              <p className="panel-subtitle">
                Draft a new opening, including compensation band and requirements. Requires admin privileges.
              </p>
            </div>
            <span className="badge badge--neutral">POST /jobs</span>
          </div>
          {!isAuthenticated && (
            <div className="panel__banner">
              Login with an admin account to add new roles.&nbsp;
              <button
                className="inline-link inline-link--button"
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setAuthModalOpen(true);
                }}
              >
                Open login modal
              </button>
            </div>
          )}
          <form className={`job-form ${!isAuthenticated ? "job-form--disabled" : ""}`} onSubmit={handleCreateJob}>
            <fieldset disabled={!isAuthenticated}>
              <div className="job-form__grid">
                <div className="form-field">
                  <label htmlFor="job-code">Job code</label>
                  <input
                    id="job-code"
                    value={jobForm.job_code}
                    onChange={(e) => setJobForm((prev) => ({ ...prev, job_code: e.target.value }))}
                    placeholder="ai-lead-001"
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="job-title">Title</label>
                  <input
                    id="job-title"
                    value={jobForm.title}
                    onChange={(e) => setJobForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Lead AI Engineer"
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="job-location">Location</label>
                  <input
                    id="job-location"
                    value={jobForm.location}
                    onChange={(e) => setJobForm((prev) => ({ ...prev, location: e.target.value }))}
                    placeholder="Remote"
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="job-salary">Salary range</label>
                  <input
                    id="job-salary"
                    value={jobForm.salary_range}
                    onChange={(e) =>
                      setJobForm((prev) => ({ ...prev, salary_range: e.target.value }))
                    }
                    placeholder="$80k - $120k"
                  />
                </div>
              </div>
              <div className="form-field">
                <label htmlFor="job-description">Description</label>
                <textarea
                  id="job-description"
                  value={jobForm.description}
                  onChange={(e) => setJobForm((prev) => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  placeholder="High-level mission, team structure, impact..."
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="job-reqs">Requirements</label>
                <textarea
                  id="job-reqs"
                  value={jobForm.requirements}
                  onChange={(e) =>
                    setJobForm((prev) => ({ ...prev, requirements: e.target.value }))
                  }
                  rows={3}
                  placeholder="Technical stack, experience, soft skills..."
                  required
                />
              </div>
              <div className="job-form__actions">
                <button className="btn btn-ghost" type="button" onClick={resetJobForm}>
                  Reset
                </button>
                <button className="btn btn-primary" type="submit" disabled={jobSubmitting}>
                  {jobSubmitting ? "Saving..." : "Publish job"}
                </button>
              </div>
            </fieldset>
          </form>
        </motion.section>

        <motion.section
          className="panel panel--wide"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="panel__header">
            <h2>Application Timeline</h2>
            <span className="badge badge--neutral">{applications.length} items</span>
          </div>
          {!isAuthenticated ? (
            <p className="empty-state">Login to see evaluation history.</p>
          ) : applications.length === 0 ? (
            <p className="empty-state">You have not submitted any evaluations yet.</p>
          ) : (
            <ul className="applications">
              {applications.map((application) => (
                <li key={application.id} className="applications__item">
                  <div>
                    <p className="applications__title">{application.job_title}</p>
                    <p className="applications__date">{formatDateTime(application.created_at)}</p>
                  </div>
                  <div className="applications__status">
                    <span className={statusBadge[application.status] || "badge"}>
                      {application.status}
                    </span>
                    {application.evaluation_result?.overall_summary && (
                      <p>{application.evaluation_result.overall_summary}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      </main>
      <AuthModal
        open={authModalOpen}
        mode={authMode}
        onModeChange={setAuthMode}
        onClose={() => setAuthModalOpen(false)}
      />
    </div>
  );
};

export default JobsPage;
