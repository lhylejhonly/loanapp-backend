# schedule_due_notifications.ps1
# Run this ONCE as Administrator to register the daily task.
# After running, the due date notifications will fire every day at 8:00 AM automatically.

$taskName = "ElevateFunds Due Date Notifications"
$scriptPath = "C:\Users\lylep\Desktop\LOAN APP\backend\scripts\send_due_date_notifications.ps1"
$triggerTime = "08:00"

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""

$trigger = New-ScheduledTaskTrigger -Daily -At $triggerTime

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -RunLevel Highest `
    -Force

Write-Host "Task '$taskName' registered. It will run daily at $triggerTime." -ForegroundColor Green
Write-Host "To run it now manually: Start-ScheduledTask -TaskName '$taskName'" -ForegroundColor Cyan
