## Job Screening Platform

An end-to-end recruiting assistant that combines a Django-Ninja-Extra backend with a React/Vite frontend to automate the initial screening of job applicants. Candidates upload their CV and project report, the backend runs an AI/RAG evaluation pipeline, and hiring teams can review the generated insights from a responsive dashboard.

---

### Key Features

- **RAG-powered screening**: Ingest job descriptions, case-study briefs, and rubrics into ChromaDB. Candidate PDFs are parsed, chunked, and evaluated via OpenAI chat completions with deterministic prompts.
- **Async evaluation pipeline**: Celery workers execute long-running jobs, persist progress, retries, and final outputs in `EvaluationJob` records.
- **JWT-based authentication**: Users register/login via Ninja JWT endpoints; the frontend stores access/refresh tokens to access protected APIs.
- **RESTful API surface**: Upload documents, trigger evaluations, poll results, list jobs with pagination/filtering, administer job postings, and view historical applications.
- **Modern frontend**: React + Vite + Tailwind runtime with toast notifications, stateful job browsing, responsive layout, and modal-based auth flows.

---

### Tech Stack

- **Backend**: Python 3.12, Django 5, Django-Ninja-Extra, Django-Ninja-JWT, Celery, Redis, pdfplumber, sentence-transformers, ChromaDB, OpenAI SDK.
- **Frontend**: React 19, Vite, TypeScript, Tailwind, Axios, React Toastify, Framer Motion.
- **Infrastructure**: Redis (broker/result store), local filesystem media storage, `.env` driven configuration.

---

### Backend Setup

1. **Install dependencies**
   ```bash
   cd backend
   python -m venv venv
   venv\Scripts\activate        # or source venv/bin/activate on Linux/macOS
   pip install -r requirements.txt
   ```

2. **Environment variables**  
   Copy `.env.example` to `.env` and fill in:
   - `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`
   - `API_KEY_LLM`, `LLM_MODEL_ID`
   - `EMBEDDING_MODEL`, `VECTOR_DB_PATH`
   - `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`
   - CORS/CSRF origins matching the frontend URL

3. **Database**
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

4. **Run services**
   ```bash
   redis-server                         # or your Redis host
   celery -A settings worker --pool=solo --loglevel=info
   python manage.py runserver 0.0.0.0:8000
   ```

5. **Optional ingestion workflow**
   - Provide reference PDFs (job descriptions, case study, scoring rubrics).
   - Extend the ingestion service/command to load documents into ChromaDB.

---

### Frontend Setup

1. ```bash
   cd frontend
   npm install
   ```
2. Create `frontend/.env`:
   ```bash
   VITE_API_BASE_URL="http://localhost:8000"
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build
   npm run preview
   ```

---

### Primary API Endpoints

| Method | Endpoint                     | Description                              |
|--------|------------------------------|------------------------------------------|
| POST   | `/api/auth/register`         | Create a user account                     |
| POST   | `/api/token/pair`            | Obtain access/refresh JWTs                |
| POST   | `/api/applications/upload`   | Upload CV & project PDFs                  |
| POST   | `/api/evaluation/evaluate`   | Queue an evaluation job                   |
| GET    | `/api/evaluation/result/{id}`| Poll job status or retrieve results       |
| GET    | `/api/applications/`         | List current user’s applications          |
| GET    | `/api/jobs/`                 | List available jobs (supports pagination) |
| GET    | `/api/jobs/{id}`             | Job detail                                |
| POST   | `/api/jobs/`                 | Create job (staff/admin only)             |

Protected routes require the `Authorization: Bearer <token>` header (access token).

---

### Folder Structure (abridged)

```
backend/
  jobs/
    controllers.py      # APIs, auth, uploads, evaluation, jobs
    models.py           # Document, Job, Application, EvaluationJob
    tasks.py            # Celery worker entrypoint
    services/           # pipeline, retrieval, text, etc.
  settings/             # Django settings, URLs, celery config
  media/                # Uploaded PDFs
frontend/
  src/
    components/AuthModal.tsx
    context/AuthContext.tsx
    pages/JobsPage.tsx  # main dashboard
    lib/api.ts          # Axios client with JWT interceptors
    App.tsx, App.css
```

---

### Development Notes

- Celery on Windows should use `--pool=solo` to avoid semaphore issues.
- The AI pipeline relies on external LLM and embedding services; ensure API keys are valid and rate limits are handled (retries via Tenacity).
- `MEDIA_ROOT` stores candidate uploads; clean up files if you delete documents.

You can get the api key LLM from this website ["https://build.nvidia.com/qwen/qwen3-next-80b-a3b-thinking"](Nvidia Qwen3 Next 80B A3B Thinking)

---

### License

This project is provided as-is for interview/assessment purposes. Adapt, extend, or productionize as needed.
