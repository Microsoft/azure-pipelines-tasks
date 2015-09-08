[CmdletBinding(DefaultParameterSetName = 'None')]
param(
	[string][Parameter(Mandatory=$true)][ValidateNotNullOrEmpty()] $connectedServiceName,
    [string][Parameter(Mandatory=$true)][ValidateNotNullOrEmpty()] $projectKey,
    [string][Parameter(Mandatory=$true)][ValidateNotNullOrEmpty()] $projectName,
    [string][Parameter(Mandatory=$true)][ValidateNotNullOrEmpty()] $projectVersion,	
	[string]$dbUrl,
	[string]$dbUsername,
	[string]$dbPassword,
    [string]$cmdLineArgs,
    [string]$configFile
)

Write-Verbose "Starting SonarQube Pre-Build Setup Step"

Write-Verbose "connectedServiceName = $connectedServiceName"
Write-Verbose "projectKey = $projectKey"
Write-Verbose "projectName = $projectName"
Write-Verbose "cmdLineArgs = $cmdLineArgs"
Write-Verbose "configFile = $configFile"
Write-Verbose "dbConnectionString = $dbUrl"

import-module "Microsoft.TeamFoundation.DistributedTask.Task.Common"
. ./SonarQubePreBuildImpl.ps1


$cmdLineArgs = UpdateArgsForPullRequestAnalysis $cmdLineArgs
Write-Verbose -Verbose $cmdLineArgs

$serviceEndpoint = GetEndpointData $connectedServiceName
Write-Verbose "serverUrl = $($serviceEndpoint.Url)"

$currentDir = (Get-Item -Path ".\" -Verbose).FullName
$bootstrapperDir = [System.IO.Path]::Combine($currentDir, "MSBuild.SonarQube.Runner-1.0.1") # the MSBuild.SonarQube.Runner is version specific
$bootstrapperPath = [System.IO.Path]::Combine($bootstrapperDir, "MSBuild.SonarQube.Runner.exe")

# Set the path as context variable so that the post-test task will be able to read it and not compute it again;
# Also, if the variable is not set, the post-test task will know that the pre-build task did not execute
SetTaskContextVariable "MsBuild.SonarQube.BootstrapperPath" $bootstrapperPath

StoreSensitiveParametersInTaskContext $serviceEndpoint.Authorization.Parameters.UserName $serviceEndpoint.Authorization.Parameters.Password $dbUsername $dbPassword
$arguments = CreateCommandLineArgs $projectKey $projectName $projectVersion $serviceEndpoint.Url $serviceEndpoint.Authorization.Parameters.UserName $serviceEndpoint.Authorization.Parameters.Password $dbUrl $dbUsername $dbPassword $cmdLineArgs $configFile

Invoke-BatchScript $bootstrapperPath �Arguments $arguments







