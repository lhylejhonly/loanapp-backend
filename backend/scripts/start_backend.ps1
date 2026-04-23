$ErrorActionPreference = "Stop"

$baseDir = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $baseDir ".env"
$dbName = "loan_app"
$dbUser = "postgres"
$dbPassword = "postgres"
$dbHost = "127.0.0.1"
$dbPort = "5433"

if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*DJANGO_DB_NAME=(.+)$') {
            $dbName = $Matches[1].Trim()
        }
        elseif ($line -match '^\s*DJANGO_DB_USER=(.+)$') {
            $dbUser = $Matches[1].Trim()
        }
        elseif ($line -match '^\s*DJANGO_DB_PASSWORD=(.*)$') {
            $dbPassword = $Matches[1].Trim()
        }
        elseif ($line -match '^\s*DJANGO_DB_HOST=(.+)$') {
            $dbHost = $Matches[1].Trim()
        }
        elseif ($line -match '^\s*DJANGO_DB_PORT=(.+)$') {
            $dbPort = $Matches[1].Trim()
        }
    }
}

Push-Location $baseDir

try {
    & (Join-Path $PSScriptRoot "start_local_postgres.ps1")

    if ($dbHost -eq "127.0.0.1" -or $dbHost -eq "localhost") {
        $pgsqlDir = Join-Path $baseDir "vendor\postgresql16_full\pgsql"
        $psql = Join-Path $pgsqlDir "bin\psql.exe"
        $createdb = Join-Path $pgsqlDir "bin\createdb.exe"

        if ((Test-Path $psql) -and (Test-Path $createdb)) {
            $env:PGPASSWORD = $dbPassword
            $escapedDbName = $dbName.Replace("'", "''")
            $exists = & $psql -h $dbHost -p $dbPort -U $dbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$escapedDbName';" 2>$null

            if ($LASTEXITCODE -ne 0) {
                throw "Unable to query PostgreSQL for database '$dbName'."
            }

            if (($exists | Out-String).Trim() -ne "1") {
                & $createdb -h $dbHost -p $dbPort -U $dbUser $dbName
                if ($LASTEXITCODE -ne 0) {
                    throw "Unable to create PostgreSQL database '$dbName'."
                }
            }
        }
    }
    python manage.py migrate
    python manage.py runserver 0.0.0.0:8000 --noreload
}
finally {
    Pop-Location
}
