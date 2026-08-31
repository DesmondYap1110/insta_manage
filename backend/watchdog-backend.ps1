# Runs every couple of minutes via the "InstaManageBackendWatchdog" scheduled
# task. The backend itself must run as a Scheduled Task (not a Windows
# Service) in the interactive desktop session, because "Connect Instagram
# Account" opens a real, visible Chromium window for the user to log into --
# a plain Windows service has no desktop to show that window on. The
# tradeoff is that closing that console window kills the backend outright,
# so this watchdog relaunches it if it's ever found down.
$listening = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
    Start-ScheduledTask -TaskName "InstaManageBackend"
}
