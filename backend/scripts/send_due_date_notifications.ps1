# send_due_date_notifications.ps1
#
# HOW TO SCHEDULE (run once to set it up):
#   Open PowerShell as Administrator and run:
#   powershell -ExecutionPolicy Bypass -File "C:\Users\lylep\Desktop\LOAN APP\backend\scripts\schedule_due_notifications.ps1"
#
# Or manually via Task Scheduler:
#   1. Open Task Scheduler → Create Basic Task
#   2. Name: ElevateFunds Due Date Notifications
#   3. Trigger: Daily at 8:00 AM
#   4. Action: Start a program
#      Program:   powershell.exe
#      Arguments: -ExecutionPolicy Bypass -File "C:\Users\lylep\Desktop\LOAN APP\backend\scripts\send_due_date_notifications.ps1"

$ErrorActionPreference = "Stop"
$baseDir = Split-Path -Parent $PSScriptRoot
$logFile = Join-Path $baseDir "due_notifications.log"

Push-Location $baseDir
try {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $msg = "[$timestamp] Running send_due_date_notifications..."
    Write-Output $msg
    Add-Content -Path $logFile -Value $msg

    python manage.py send_due_date_notifications 2>&1 | ForEach-Object {
        Write-Output $_
        Add-Content -Path $logFile -Value $_
    }

    $done = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Completed."
    Write-Output $done
    Add-Content -Path $logFile -Value $done
} catch {
    $err = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] ERROR: $_"
    Write-Error $err
    Add-Content -Path $logFile -Value $err
} finally {
    Pop-Location
}
