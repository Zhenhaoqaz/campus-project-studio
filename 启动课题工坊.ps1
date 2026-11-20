param([int]$Port = 18030, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$campusRoot = $PSScriptRoot
$campusPython = Join-Path $campusRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $campusPython)) { throw '请先按照 README 创建独立 .venv 并安装后端依赖。' }
$campusListener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($campusListener) {
    try {
        $campusExisting = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/openapi.json" -TimeoutSec 3
        if ($campusExisting.info.title -ne '课题工坊 API') { throw '该端口被其他服务占用。' }
    } catch { throw "端口 $Port 已被占用且不是可确认的课题工坊服务，请改用其他端口。" }
    Write-Host "课题工坊已在运行：http://127.0.0.1:$Port"
    if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$Port" }
    exit 0
}
if (-not (Test-Path -LiteralPath (Join-Path $campusRoot 'frontend\dist\index.html'))) { throw '请先在 frontend 目录运行 npm.cmd ci 和 npm.cmd run build。' }
Write-Host "课题工坊：http://127.0.0.1:$Port"
Write-Host '保持此终端运行，按 Ctrl+C 停止。AI 功能需要可用的 Ollama 服务。'
if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$Port" }
Push-Location -LiteralPath $campusRoot
try { & $campusPython -m uvicorn backend.app:app --host 127.0.0.1 --port $Port }
finally { Pop-Location }
