# 오늘의별일 AI 서비스(127.0.0.1:8100) 실행 스크립트 — Windows 작업 스케줄러에서 로그인 시 자동 실행용.
#
#  - 토큰은 실행할 때마다 backend/.env 의 AI_SERVICE_TOKEN 에서 읽는다(이 파일·로그에 적지 않음).
#    토큰이 없으면 보호 없이 공개되지 않도록 실행하지 않는다.
#  - 서버가 종료되면 10초 뒤 다시 실행한다. 8100 포트가 이미 사용 중이면 새로 띄우지 않고 기다린다.
#  - 로그: ai/data/service/logs/ai_service.out.log, ai_service.err.log (재시작 때 직전 로그는 *.prev.log)
#
# 등록/해제(일반 PowerShell, 관리자 불필요):
#   등록·확인·끄기: ai/README.md "AI 서비스 자동 실행" 참고
#   해제:  Unregister-ScheduledTask -TaskName 'star2day-ai-service' -Confirm:$false
$ErrorActionPreference = 'Stop'

$Root   = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$Python = Join-Path $Root '.venv\Scripts\python.exe'
$EnvFile = Join-Path $Root 'backend\.env'
$LogDir = Join-Path $Root 'ai\data\service\logs'
$Port   = 8100
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Out  = Join-Path $LogDir 'ai_service.out.log'
$Err  = Join-Path $LogDir 'ai_service.err.log'
$Note = Join-Path $LogDir 'ai_service.runner.log'

function Write-Note([string]$msg) {
    Add-Content -Path $Note -Encoding utf8 -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg)
}

function Read-Token {
    if (-not (Test-Path $EnvFile)) { return '' }
    $line = Get-Content $EnvFile -Encoding utf8 | Where-Object { $_ -match '^\s*AI_SERVICE_TOKEN\s*=' } | Select-Object -First 1
    if (-not $line) { return '' }
    return (($line -replace '^\s*AI_SERVICE_TOKEN\s*=\s*', '').Trim().Trim('"').Trim("'"))
}

function Test-PortInUse {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

Write-Note "runner start (root=$Root)"
while ($true) {
    if (Test-PortInUse) {
        # 이미 다른 AI 서비스가 떠 있음(수동 실행 등) → 중복 실행하지 않고 1분마다 다시 확인
        Start-Sleep -Seconds 60
        continue
    }
    $token = Read-Token
    if (-not $token) {
        Write-Note "AI_SERVICE_TOKEN 이 backend/.env 에 없어 실행하지 않음 (5분 뒤 다시 확인)"
        Start-Sleep -Seconds 300
        continue
    }
    $env:AI_SERVICE_TOKEN = $token
    $env:PYTHONIOENCODING = 'utf-8'
    foreach ($f in @($Out, $Err)) {
        if (Test-Path $f) { Move-Item -Force $f ($f -replace '\.log$', '.prev.log') }
    }
    Write-Note "AI service starting on 127.0.0.1:$Port"
    $p = Start-Process -FilePath $Python -WorkingDirectory $Root -WindowStyle Hidden -PassThru -Wait `
        -ArgumentList @('-m', 'uvicorn', '--app-dir', 'ai', 'service.app:app', '--host', '127.0.0.1', '--port', "$Port") `
        -RedirectStandardOutput $Out -RedirectStandardError $Err
    Remove-Item Env:\AI_SERVICE_TOKEN -ErrorAction SilentlyContinue
    Write-Note "AI service exited (code=$($p.ExitCode)); restart in 10s"
    Start-Sleep -Seconds 10
}
