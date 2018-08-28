[CmdletBinding()]
param()

# Arrange.
. $PSScriptRoot\..\..\..\Tests\lib\Initialize-Test.ps1

Register-Mock Get-VstsInput { "ConnectedServiceNameARM" } -ParametersEvaluator { $Name -eq "ConnectedServiceName" }
Register-Mock Get-VstsInput { "TestResourceGroup" } -ParametersEvaluator { $Name -eq "ResourceGroupName" }
Register-Mock Get-VstsInput { "TestAutomationAccount" } -ParametersEvaluator { $Name -eq "AutomationAccountName" }
Register-Mock Get-VstsInput { "$(System.DefaultWorkingDirectory)/MyFirstProject/drop/testrunbook.ps1" } -ParametersEvaluator { $Name -eq "RunbookFile" }
Register-Mock Initialize-Azure

Register-Mock Get-Endpoint { return "ConnectedServiceNameARM" }
Register-Mock Import-AzureRmAutomationRunbook { }

& "$PSScriptRoot\..\DeployToAzureAutomation.ps1"

Assert-WasCalled Import-AzureRmAutomationRunbook -Times 1
