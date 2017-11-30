# Read job variables
$collectorName = $env:collectorName
$collectorStartTime = [System.DateTime]::Parse($env:collectorStartTime)

# Stop the performance monitor collector
Write-Host "Stopping collector"
& C:\Windows\System32\logman.exe stop -n $collectorName

# Upload the performance monitor data.
Write-Host "Uploading performance monitor data"
$blgFile = Get-ChildItem -LiteralPath $PSScriptRoot\.. -Filter *.blg | Select-Object -Last 1 -ExpandProperty FullName
Write-Host "##vso[artifact.upload containerfolder=perfmon-data;artifactname=perfmon-data;]$blgFile"

# Upload the event logs
$logNames = @(
    "Application"
    "System"
    "Security"
)
foreach ($logName in $logNames) {
    # Dump the log to file
    Write-Host "Getting $logName event log"
    $filePath = "$PSScriptRoot\..\$logName-event-log.txt"
    Get-WinEvent -LogName $logName |
        Where-Object { ($collectorStartTime.CompareTo(($_.TimeCreated)) -lt 0) } |
        Format-List |
        Out-File -FilePath $filePath -Encoding UTF8

    # Upload the log
    Write-Host "Uploading $logName event log"
    Write-Host "##vso[artifact.upload containerfolder=$logName-event-log;artifactname=$logname-event-log]$filePath"
}
