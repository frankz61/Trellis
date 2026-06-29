# Allocate two free high (ephemeral) ports for a dev/debug session and write them
# to the repo-root .env.local as BACKEND_PORT / FRONTEND_PORT.
#
# Single source of truth: dev.ps1, vite.config.ts, the backend dev server, and the
# VS Code launch configs all read these two values, so the Vite proxy and the
# Chrome debug URL always line up with whatever ports we picked.
#
# Returns a PSCustomObject @{ Backend = <int>; Frontend = <int> } for callers that
# want the values directly (dev.ps1); the .env.local write is the side effect the
# VS Code preLaunchTask relies on.
$ErrorActionPreference = "Stop"

function Test-PortFree([int]$port) {
    # True if we can bind 127.0.0.1:$port right now (i.e. it is free).
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
    try { $listener.Start(); return $true }
    catch { return $false }
    finally { $listener.Stop() }
}

function Get-FreePort([int[]]$exclude = @()) {
    # Random high port from the IANA dynamic range (49152-65535), verified free.
    for ($i = 0; $i -lt 200; $i++) {
        $port = Get-Random -Minimum 49152 -Maximum 65536
        if ($exclude -notcontains $port -and (Test-PortFree $port)) { return $port }
    }
    throw "Could not find a free high port in 49152-65535 after 200 tries."
}

$backend = Get-FreePort
$frontend = Get-FreePort -exclude @($backend)

# Repo root = parent of this scripts/ folder.
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env.local"

$managed = @{ "BACKEND_PORT" = $backend; "FRONTEND_PORT" = $frontend }

# Preserve any other lines already in .env.local; replace the two we manage.
$lines = if (Test-Path $envFile) { Get-Content -LiteralPath $envFile } else { @() }
$kept = $lines | Where-Object {
    $key = ($_ -split "=", 2)[0].Trim()
    -not $managed.ContainsKey($key)
}
$out = @($kept) + @("BACKEND_PORT=$backend", "FRONTEND_PORT=$frontend")
# UTF-8 WITHOUT BOM: Windows PowerShell 5.1's `Set-Content -Encoding UTF8` adds a BOM,
# which would corrupt the first key when .env.local is parsed. Write bytes directly.
[System.IO.File]::WriteAllLines($envFile, [string[]]$out, [System.Text.UTF8Encoding]::new($false))

Write-Host "[alloc-ports] backend=$backend  frontend=$frontend  -> $envFile"
[PSCustomObject]@{ Backend = $backend; Frontend = $frontend }
