[cmdletbinding()]
param()

. $PSScriptRoot\..\..\lib\Initialize-Test.ps1

$distributedTaskContext = 'Some distributed task context'
Register-Mock Get-VssConnection { $connection } -TaskContext $distributedTaskContext
Register-Mock Get-ServiceEndPoint { $vssEndPoint } -Context $distributedTaskContext -Name "SystemVssConnection"
Register-Mock Get-PersonalAccessToken { 'Some token' }
Register-Mock CmdletHasMember { $true }
Register-Mock RegisterEnvCmdletHasMember { $true }
Register-Mock Invoke-DeployTestAgent
Register-Mock Register-Environment { $true } -EnvironmentName 'testMachineGroup' -EnvironmentSpecification 'testMachineGroup' -UserName 'adminUserName' -Password 'adminPassword' -TestCertificate 'testCertificate' -Connection $connection -TaskContext $distributedTaskContext -WinRmProtocol 'winRmProtocol' -ResourceFilter 'resourceFileteringMethod' -Persist

$input = @{
    'testMachineGroup' = 'testMachineGroup'
    'adminUserName' = 'adminUserName' 
    'adminPassword' = 'adminPassword' 
    'winRmProtocol' = 'winRmProtocol' 
    'testCertificate' = 'testCertificate'
    'resourceFilteringMethod' = 'resourceFilteringMethod'
    'testMachines' = 'testMachines'
    'runAsProcess' = 'runAsProcess'
    'machineUserName' = 'machineUserName'
    'machinePassword' = 'machinePassword'
    'agentLocation' = 'agentLocation'
    'updateTestAgent' = 'updateTestAgent'
    'isDataCollectionOnly' = 'isDataCollectionOnly'
}
& $PSScriptRoot\..\..\..\Tasks\DeployVisualStudioTestAgent\DeployTestAgent.ps1 @input


Assert-WasCalled Get-VssConnection -Times 1
Assert-WasCalled Get-ServiceEndPoint -Times 1
Assert-WasCalled Get-PersonalAccessToken -Times 1
Assert-WasCalled CmdletHasMember -Times 1
Assert-WasCalled Register-Environment -Times 1
Assert-WasCalled Invoke-DeployTestAgent -Times 1
