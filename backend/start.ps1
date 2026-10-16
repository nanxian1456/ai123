param(
    [ValidateSet('dev', 'prod')]
    [string]$Profile = 'dev',
    [switch]$Background
)

$backendDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$wrapper = Join-Path $backendDirectory 'mvnw.cmd'

if ($Profile -eq 'prod') {
    $required = @('AUTH_TOKEN_SECRET', 'WECHAT_APP_ID', 'WECHAT_APP_SECRET', 'SPRING_DATASOURCE_URL', 'SPRING_DATASOURCE_USERNAME', 'SPRING_DATASOURCE_PASSWORD', 'APP_PUBLIC_BASE_URL')
    $missing = @($required | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) })
    if ($missing.Count -gt 0) {
        throw "Production configuration is missing: $($missing -join ', ')"
    }
    if (-not $env:SPRING_DATASOURCE_URL.StartsWith('jdbc:postgresql://')) {
        throw 'SPRING_DATASOURCE_URL must be a PostgreSQL JDBC URL in prod.'
    }
}

$arguments = @('spring-boot:run', "-Dspring-boot.run.profiles=$Profile")
if ($Background) {
    $logDirectory = Join-Path $backendDirectory 'logs'
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $process = Start-Process -FilePath $wrapper -ArgumentList $arguments -WorkingDirectory $backendDirectory -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDirectory "$Profile-$stamp.stdout.log") `
        -RedirectStandardError (Join-Path $logDirectory "$Profile-$stamp.stderr.log") -PassThru
    Write-Host "Started $Profile backend launcher (PID $($process.Id)); check logs for readiness."
    return
}

Push-Location $backendDirectory
try {
    & $wrapper @arguments
    if ($LASTEXITCODE -ne 0) { throw "Backend exited with code $LASTEXITCODE" }
} finally {
    Pop-Location
}
