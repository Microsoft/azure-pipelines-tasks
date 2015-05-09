param(
    [string]$environment, 
    [string]$testMachines,
    [string]$runAsProcess,
    [string]$machineUserName,
    [string]$machinePassword,    
    [string]$agentLocation,
    [string]$updateTestAgent
)

# If Run as process (Run UI Tests) is true both autologon and disable screen saver needs to be true.
$logonAutomatically = $runAsProcess
$disableScreenSaver = $runAsProcess

Write-Verbose "Entering script DeployTestAgent.ps1"
Write-Verbose "environment = $environment"
Write-Verbose "testMachines = $testMachines"
Write-Verbose "runAsProcess = $runAsProcess"
Write-Verbose "logonAutomatically = $logonAutomatically"
Write-Verbose "disableScreenSaver = $disableScreenSaver"
Write-Verbose "updateTestAgent = $updateTestAgent"


if ([string]::IsNullOrWhiteSpace($agentLocation))
{
   Write-Verbose "Download of testagent would begin from internet"
}
else
{
   Write-Verbose "agentLocation = $agentLocation"
}

# Get current directory.
$currentDirectory = Convert-Path .
$installAgentScriptLocation = Join-Path -Path $currentDirectory -ChildPath "TestAgentInstall.ps1"
Write-Verbose "installAgentScriptLocation = $installAgentScriptLocation"

$configureTestAgentScriptLocation = Join-Path -Path $currentDirectory -ChildPath "TestAgentConfiguration.ps1"
Write-Verbose "configureTestAgentScriptLocation = $configureTestAgentScriptLocation"

$checkAgentInstallationScriptLocation = Join-Path -Path $currentDirectory -ChildPath "CheckTestAgentInstallation.ps1"
Write-Verbose "checkAgentInstallationScriptLocation = $checkAgentInstallationScriptLocation"

# Import the Task.Internal dll that has all the cmdlets we need for Build
import-module "Microsoft.TeamFoundation.DistributedTask.Task.Internal"
import-module "Microsoft.TeamFoundation.DistributedTask.Task.DistributedTestAutomation"

Write-Verbose "Getting the connection object"
$connection = Get-VssConnection -TaskContext $distributedTaskContext

Write-Verbose "Getting Personal Access Token for the Run"
$vssEndPoint = Get-ServiceEndPoint -Context $distributedTaskContext -Name "SystemVssConnection"
$personalAccessToken = $vssEndpoint.Authorization.Parameters.AccessToken

if ( [string]::IsNullOrEmpty($personalAccessToken))
{
  throw "Unable to generate Personal Access Token for the user. Contact Project Collection Administrator"
}

Write-Verbose "Calling Invoke-DeployTestAgent"
Invoke-DeployTestAgent -MachineNames $testMachines -UserName $machineUserName -Password $machinePassword -PowerShellPort 5985 -EnvironmentName $environment -RunAsProcess $runAsProcess -LogonAutomatically $logonAutomatically -DisableScreenSaver $disableScreenSaver -AgentLocation $agentLocation -UpdateTestAgent $updateTestAgent -InstallAgentScriptLocation $installAgentScriptLocation -ConfigureTestAgentScriptLocation $configureTestAgentScriptLocation -CheckAgentInstallationScriptLocation $checkAgentInstallationScriptLocation -Connection $connection -PersonalAccessToken $personalAccessToken

Write-Verbose "Leaving script DeployTestAgent.ps1"
