# ResolveX Backend

AI-powered Natural Language Ambiguity Identification and Resolution System (FastAPI + SQLite + Google Gemini).

## Setup (Local Development)

1. Activate the virtual environment:
   ```powershell
   cd backend
   .\.venv\Scripts\Activate.ps1
   ```
2. Install dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
3. Configure environment variables:
   ```powershell
   Copy-Item .env.example .env
   # Edit .env and set GEMINI_API_KEY
   ```
4. Run the FastAPI server:
   ```powershell
   uvicorn app.main:app --reload --port 8000
   ```
5. Open Swagger/OpenAPI docs:
   - `http://localhost:8000/docs`
   - Health check: `GET http://localhost:8000/health`

## Running Tests

```powershell
pytest -v
```
