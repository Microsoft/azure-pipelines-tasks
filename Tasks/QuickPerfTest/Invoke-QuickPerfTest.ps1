[CmdletBinding(DefaultParameterSetName = 'None')]
param
(
    [String]
    $env:SYSTEM_DEFINITIONID,
    [String]
    $env:BUILD_BUILDID,

    [String] [Parameter(Mandatory = $false)]
    $connectedServiceName,

    [String] [Parameter(Mandatory = $true)]
    $websiteUrl,
    [String] [Parameter(Mandatory = $true)]
    $testName,
    [String] [Parameter(Mandatory = $true)]
    $vuLoad,
    [String] [Parameter(Mandatory = $true)]
    $runDuration,
    [String] [Parameter(Mandatory = $true)]
    $geoLocation,
    [String] [Parameter(Mandatory = $true)]
    $machineType
)

function InitializeRestHeaders()
{
    $restHeaders = New-Object -TypeName "System.Collections.Generic.Dictionary[[String], [String]]"
	if([string]::IsNullOrWhiteSpace($connectedServiceName))
	{
		$restHeaders.Add("Authorization", [String]::Concat("Bearer ", $env:SYSTEM_ACCESSTOKEN))
       
    }
	else
	{
	   $alternateCreds = [String]::Concat($Username, ":", $Password)
       $basicAuth = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($alternateCreds))
       $restHeaders.Add("Authorization", [String]::Concat("Basic ", $basicAuth))
	}
    return $restHeaders
}

  # Load all dependent files for execution
  . $PSScriptRoot/CltTasksUtility.ps1
  . $PSScriptRoot/VssConnectionHelper.ps1
  
$userAgent = "QuickPerfTestBuildTask"
$global:RestTimeout = 60

############################################## PS Script execution starts here ##########################################
Write-Output "Starting Quick Perf Test Script"

import-module "Microsoft.TeamFoundation.DistributedTask.Task.Internal"
import-module "Microsoft.TeamFoundation.DistributedTask.Task.Common"

$testName = $testName + ".loadtest"
Write-Output "Test name = $testName"
Write-Output "Run duration = $runDuration"
Write-Output "Website Url = $websiteUrl"
Write-Output "Virtual user load = $vuLoad"
Write-Output "Load location = $geoLocation"
Write-Output "Load generator machine type = $machineType"
Write-Output "Run source identifier = build/$env:SYSTEM_DEFINITIONID/$env:BUILD_BUILDID"

#Validate Input
ValidateInputs $websiteUrl $env:SYSTEM_TEAMFOUNDATIONCOLLECTIONURI $connectedServiceName

if([string]::IsNullOrWhiteSpace($connectedServiceName))
{
	$connectedServiceDetails = Get-ServiceEndpoint -Context $distributedTaskContext -Name SystemVssConnection
}
else
{
    $connectedServiceDetails = Get-ServiceEndpoint -Context $distributedTaskContext -Name $connectedServiceName
}
$Username = $connectedServiceDetails.Authorization.Parameters.Username
Write-Verbose "Username = $Username" -Verbose
$Password = $connectedServiceDetails.Authorization.Parameters.Password
$VSOAccountUrl = $connectedServiceDetails.Url.AbsoluteUri
Write-Output "VSO Account URL is : $VSOAccountUrl"
$headers = InitializeRestHeaders
$CltAccountUrl = ComposeAccountUrl $VSOAccountUrl $headers
$TFSAccountUrl = $env:System_TeamFoundationCollectionUri.TrimEnd('/')

Write-Output "VSO account Url = $TFSAccountUrl" -Verbose
Write-Output "CLT account Url = $CltAccountUrl" -Verbose



$dropjson = ComposeTestDropJson $testName $runDuration $websiteUrl $vuLoad $geoLocation

$drop = CreateTestDrop $headers $dropjson $CltAccountUrl

if ($drop.dropType -eq "InPlaceDrop")
{
    $runJson = ComposeTestRunJson $testName $drop.id $MachineType
    $run = QueueTestRun $headers $runJson $CltAccountUrl
    MonitorTestRun $headers $run $CltAccountUrl
    $webResultsUrl = GetTestRunUri $run.id $headers $CltAccountUrl
	
    Write-Output ("Run-id for this load test is {0} and its name is '{1}'." -f  $run.runNumber, $run.name)
    Write-Output ("To view run details navigate to {0}" -f $webResultsUrl)
    Write-Output "To view detailed results navigate to Load Test | Load Test Manager in Visual Studio IDE, and open this run."

    $resultsMDFolder = New-Item -ItemType Directory -Force -Path "$env:Temp\LoadTestResultSummary"	
    $resultFilePattern = ("QuickPerfTestResults_{0}_{1}_*.md" -f $env:AGENT_ID, $env:SYSTEM_DEFINITIONID)
    $excludeFilePattern = ("QuickPerfTestResults_{0}_{1}_{2}_*.md" -f $env:AGENT_ID, $env:SYSTEM_DEFINITIONID, $env:BUILD_BUILDID)   
    Remove-Item $resultsMDFolder\$resultFilePattern -Exclude $excludeFilePattern -Force	
    $summaryFile =  ("{0}\QuickPerfTestResults_{1}_{2}_{3}_{4}.md" -f $resultsMDFolder, $env:AGENT_ID, $env:SYSTEM_DEFINITIONID, $env:BUILD_BUILDID, $run.id)	
    $summary = ('[Test Run: {0}]({1}) using {2}.<br/>' -f  $run.runNumber, $webResultsUrl ,$run.name)

	('<p>{0}</p>' -f $summary) >>  $summaryFile
    UploadSummaryMdReport $summaryFile
}
else
{
    Write-Error ("Failed to connect to the endpoint '{0}' for VSO account '{1}'" -f $EndpointName, $VSOAccountUrl)
}

	
Write-Output "Quick Perf Test Script execution completed"

