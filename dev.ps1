# Local dev: start backend (uvicorn hot reload) and frontend (vite) in parallel
# on the project's fixed debug ports.
# Uses the conda env "trellis" python directly (no activation needed).
# Prereq: pip install -r backend/requirements.txt into env trellis; frontend npm install; .env filled.
$ErrorActionPreference = "Stop"
$py = "C:\ProgramData\anaconda3\envs\trellis\python.exe"
$back = 57702
$front = 57701

function Assert-PortFree([int]$port, [string]$service) {
    $listener = [System.Net.Sockets.TcpListener]::new(
        [System.Net.IPAddress]::Loopback,
        $port
    )
    try {
        $listener.Start()
    }
    catch {
        throw "$service debug port $port is already in use. Stop the existing process and retry."
    }
    finally {
        $listener.Stop()
    }
}

Assert-PortFree $back "Backend"
Assert-PortFree $front "Frontend"

$env:BACKEND_PORT = "$back"
$env:FRONTEND_PORT = "$front"

Start-Process powershell `
    -WorkingDirectory (Join-Path $PSScriptRoot "backend") `
    -ArgumentList "-NoExit", "-Command", "& '$py' -m scripts.dev_server --reload"
Start-Process powershell `
    -WorkingDirectory (Join-Path $PSScriptRoot "frontend") `
    -ArgumentList "-NoExit", "-Command", "npm run dev"
Write-Host "backend: http://localhost:$back   frontend: http://localhost:$front"
