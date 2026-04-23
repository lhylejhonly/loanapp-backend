$ErrorActionPreference = "Stop"

$baseDir = Split-Path -Parent $PSScriptRoot
$pgsqlDir = Join-Path $baseDir "vendor\postgresql16_full\pgsql"
$dataDir = Join-Path $baseDir "vendor\postgres_data"
$pgCtl = Join-Path $pgsqlDir "bin\pg_ctl.exe"

if (!(Test-Path $pgCtl) -or !(Test-Path $dataDir)) {
    Write-Output "Local PostgreSQL is not installed or initialized."
    exit 0
}

& $pgCtl -D $dataDir -m fast stop
if ($LASTEXITCODE -ne 0) {
    throw "pg_ctl stop failed."
}

Write-Output "PostgreSQL stopped."
