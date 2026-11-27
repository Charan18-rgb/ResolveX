# ResolveX — Backend Setup Guide

1. **Navigate to backend & activate venv:**
   ```powershell
   cd backend
   .\.venv\Scripts\Activate.ps1
   ```
2. **Install dependencies (already installed in `.venv`):**
   ```powershell
   pip install -r requirements.txt
   ```
3. **Configure `.env`:**
   ```powershell
   Copy-Item .env.example .env
   # Set GEMINI_API_KEY=<your_key> in .env (never commit .env)
   ```
4. **Run server:**
   ```powershell
   uvicorn app.main:app --reload --port 8000
   ```
5. **Run all tests:**
   ```powershell
   pytest -v
   ```
