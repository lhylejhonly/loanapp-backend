$ErrorActionPreference = "Stop"

$baseDir = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $baseDir ".env"
$pgsqlDir = Join-Path $baseDir "vendor\postgresql16_full\pgsql"
$dataDir = Join-Path $baseDir "vendor\postgres_data"
$pwFile = Join-Path $baseDir "vendor\postgres.pw"
$stderrLogFile = Join-Path $baseDir "vendor\postgres.stderr.log"
$pidFile = Join-Path $dataDir "postmaster.pid"
$dbPort = "5433"

$fso = New-Object -ComObject Scripting.FileSystemObject
$baseDirShort = $fso.GetFolder($baseDir).ShortPath

$pgIsReady = Join-Path $pgsqlDir "bin\pg_isready.exe"
$initDb = Join-Path $pgsqlDir "bin\initdb.exe"
$postgresExe = Join-Path $pgsqlDir "bin\postgres.exe"
$shareDir = Join-Path $pgsqlDir "share"

if (!(Test-Path $postgresExe)) {
    throw "PostgreSQL binaries not found at $pgsqlDir"
}

if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*DJANGO_DB_PORT=(.+)$') {
            $dbPort = $Matches[1].Trim()
        }
    }
}

$env:PGPASSWORD = "postgres"

$readyResult = & $pgIsReady -h 127.0.0.1 -p $dbPort -U postgres 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Output "PostgreSQL is already running on 127.0.0.1:$dbPort."
    exit 0
}

if (!(Test-Path $dataDir)) {
    "postgres" | Out-File -FilePath $pwFile -Encoding ascii -NoNewline
    $dataDirInit = Join-Path $baseDirShort "vendor\postgres_data"
    $pwFileShort = $fso.GetFile($pwFile).ShortPath
    $shareDirShort = $fso.GetFolder($shareDir).ShortPath
    & $initDb -D $dataDirInit -U postgres -A scram-sha-256 --pwfile=$pwFileShort -E UTF8 -L $shareDirShort
    if ($LASTEXITCODE -ne 0) {
        throw "initdb failed."
    }
}

if (Test-Path $pidFile) {
    $existingPid = (Get-Content $pidFile | Select-Object -First 1).Trim()
    if ($existingPid -and !(Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
        Remove-Item $pidFile -Force
    }
}

$dataDirStart = $fso.GetFolder($dataDir).ShortPath
$postgresArgs = "-D `"$dataDirStart`" -p $dbPort"
$process = Start-Process -FilePath $postgresExe -ArgumentList $postgresArgs -RedirectStandardError $stderrLogFile -PassThru -WindowStyle Hidden

$startupDeadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $startupDeadline) {
    Start-Sleep -Milliseconds 500
    & $pgIsReady -h 127.0.0.1 -p $dbPort -U postgres 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Output "PostgreSQL started on 127.0.0.1:$dbPort."
        exit 0
    }

    if (!(Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) {
        throw "PostgreSQL exited during startup. See $stderrLogFile."
    }
}

throw "Timed out waiting for PostgreSQL to start on 127.0.0.1:$dbPort. See $stderrLogFile."
