# Run the Flax MCP Server
# Make sure Flax Editor is running with the FlaxMcp plugin enabled first

$env:FLAX_WS_HOST = "localhost"
$env:FLAX_WS_PORT = "7777"
$env:FLAX_WS_RECONNECT_MS = "3000"
$env:FLAX_WS_MAX_RETRIES = "10"
$env:FLAX_WS_TIMEOUT_MS = "30000"

$serverDir = Join-Path $PSScriptRoot "server"

Write-Host "Starting Flax MCP Server..." -ForegroundColor Green
Write-Host "Expects Flax Editor at localhost:7777" -ForegroundColor Yellow

Set-Location $serverDir
npx tsx src/index.ts
