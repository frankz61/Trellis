# Local dev: start backend (uvicorn hot reload) and frontend (vite) in parallel,
# each on a freshly-allocated random high port (no fixed 8000/5173).
# Uses the conda env "trellis" python directly (no activation needed).
# Prereq: pip install -r backend/requirements.txt into env trellis; frontend npm install; .env filled.
$ErrorActionPreference = "Stop"
$py = "C:\ProgramData\anaconda3\envs\trellis\python.exe"

# Pick two free high ports and write them to .env.local (backend + vite both read it).
$ports = & (Join-Path $PSScriptRoot "scripts\alloc-ports.ps1")
$back = $ports.Backend
$front = $ports.Frontend

# Backend reads BACKEND_PORT from .env.local via app.config; vite reads .env.local too.
Start-Process powershell -ArgumentList "-NoExit","-Command","cd backend; & '$py' -m scripts.dev_server --reload"
Start-Process powershell -ArgumentList "-NoExit","-Command","cd frontend; npm run dev"
Write-Host "backend: http://localhost:$back   frontend: http://localhost:$front"
