param(
    [string]$testMachineGroup,
    [string]$dropLocation,
    [string]$sourcefilters,
    [string]$testFilterCriteria,
    [string]$testRunTitle,
    [string]$platform,
    [string]$configuration,
    [string]$runSettingsFile,
    [string]$codeCoverageEnabled,
    [string]$overrideRunParams,
    [string]$testConfigurations,
    [string]$autMachineGroup,
    [string]$testSelection,
    [string]$testPlan,
    [string]$testSuite,
    [string]$testConfiguration,
    [string]$customSlicingEnabled,
    [string]$runOnlyImpactedTests,
    [string]$runAllTestsAfterXBuilds
)

Function CmdletHasMember($memberName) {
    $cmdletParameter = (gcm Invoke-RunDistributedTests).Parameters.Keys.Contains($memberName) 
    return $cmdletParameter
}

Function Get-PersonalAccessToken($vssEndPoint) {
    return $vssEndpoint.Authorization.Parameters.AccessToken
}

import-module "Microsoft.TeamFoundation.DistributedTask.Task.Internal"
import-module "Microsoft.TeamFoundation.DistributedTask.Task.Common"
import-module "Microsoft.TeamFoundation.DistributedTask.Task.DTA"
import-module "Microsoft.TeamFoundation.DistributedTask.Task.DevTestLabs"

Write-Verbose "Entering script RunDistributedTests.ps1"
Write-Verbose "TestMachineGroup = $testMachineGroup"
Write-Verbose "Test Drop Location = $dropLocation"
Write-Verbose "Source Filter = $sourcefilters"
Write-Verbose "Test Filter Criteria = $testFilterCriteria"
Write-Verbose "RunSettings File = $runSettingsFile"
Write-Verbose "Build Platform = $platform"
Write-Verbose "Build Configuration = $configuration"
Write-Verbose "CodeCoverage Enabled = $codeCoverageEnabled"
Write-Verbose "TestRun Parameters to override = $overrideRunParams"
Write-Verbose "TestConfiguration = $testConfigurations"
Write-Verbose "Application Under Test Machine Group = $autTestMachineGroup"
Write-Verbose "Run Only Impacted Tests = $runOnlyImpactedTests"
Write-Verbose "Run All tests After X Builds = $runAllTestsAfterXBuilds"

# Import the Task.Internal dll that has all the cmdlets we need for Build
import-module "Microsoft.TeamFoundation.DistributedTask.Task.Common"
import-module "Microsoft.TeamFoundation.DistributedTask.Task.Internal"
import-module "Microsoft.TeamFoundation.DistributedTask.Task.DTA"

Write-Verbose "Getting the connection object"
$connection = Get-VssConnection -TaskContext $distributedTaskContext

Write-Verbose "Getting Personal Access Token for the Run"
$vssEndPoint = Get-ServiceEndPoint -Context $distributedTaskContext -Name "SystemVssConnection"
$personalAccessToken = Get-PersonalAccessToken $vssEndpoint

# Get current directory.
$currentDirectory = Convert-Path .
$unregisterTestAgentScriptLocation = Join-Path -Path $currentDirectory -ChildPath "TestAgentUnRegistration.ps1"
$checkTaCompatScriptLocation = Join-Path -Path $currentDirectory -ChildPath "CheckTestAgentCompat.ps1"
Write-Verbose "UnregisterTestAgent script Path  = $unRegisterTestAgentLocation"

Write-Verbose "Calling Invoke-RunDistributedTests"

$checkTestAgentCompatScriptLocationMemberExists  = CmdletHasMember "CheckTestAgentCompatScriptLocation"
$checkCustomSlicingEnabledMemberExists  = CmdletHasMember "CustomSlicingEnabled"
$taskContextMemberExists  = CmdletHasMember "TaskContext"
$IsTestImpactOnMemberExists  = CmdletHasMember "TestImpactEnabled"

$suites = $testSuite.Split(",")
$testSuites = @()
foreach ($suite in $suites)
{
    $suiteId = 0
    if([int]::TryParse($suite, [ref]$suiteId))
    {
        $testSuites += $suiteId
    }    
}

$testPlanId = 0
if([int]::TryParse($testPlan, [ref]$testPlanId)){}

$testConfigurationId = 0
if([int]::TryParse($testConfiguration, [ref]$testConfigurationId)){}

$customSlicingEnabledFlag = $false
if([bool]::TryParse($customSlicingEnabled, [ref]$customSlicingEnabledFlag)){}

$isTestImpactOnFlag = $false
if([bool]::TryParse($runOnlyImpactedTests, [ref]$isTestImpactOnFlag)){}

$reBaseValue = 0
if([int]::TryParse($runAllTestsAfterXBuilds, [ref]$reBaseValue)){}

Write-Verbose "IsTestImpactOnMemberExists = $IsTestImpactOnMemberExists"
Write-Verbose "isTestImpactOnFlag = $isTestImpactOnFlag"

# If the agent is new and test impact is on publish code changes
if($IsTestImpactOnMemberExists -and $isTestImpactOnFlag)
{
    $releaseUri = Get-TaskVariable -Context $distributedTaskContext -Name 'release.releaseUri' # used to check if this is CD

    # Get current directory.
    $currentDirectory = Convert-Path .
    $testSelectorToolPath = Join-Path -Path $currentDirectory -ChildPath "TestSelector\TestSelector.exe"
    $projectCollectionUrl = Get-TaskVariable -Context $distributedTaskContext -Name 'System.TeamFoundationCollectionUri' 
    $projectId = Get-TaskVariable -Context $distributedTaskContext -Name 'System.TeamProject'
    $tiaRebaseLimit = $reBaseValue
    $isPrFlow = Get-TaskVariable -Context $distributedTaskContext -Name 'tia.isPrFlow'
    $isPrFlowBool = $false
    $tiaBaseLineDefinitionRunIdFile = [System.IO.Path]::GetTempFileName()

    if([string]::IsNullOrEmpty($releaseUri))
    {
        $context = "CI"
        $definitionRunId = Get-TaskVariable -Context $distributedTaskContext -Name 'Build.BuildId'
        $definitionId = Get-TaskVariable -Context $distributedTaskContext -Name 'System.DefinitionId'
        $sourcesDir = Get-TaskVariable -Context $distributedTaskContext -Name 'build.sourcesdirectory'
    }
    else 
    {
        $context = "CD"
        $definitionRunId = Get-TaskVariable -Context $distributedTaskContext -Name 'Release.ReleaseId'
        $definitionId = Get-TaskVariable -Context $distributedTaskContext -Name 'release.DefinitionId' 
        $sourcesDir = ''
    }
    
    $testSelectorSuceeded = $true

    $argsPack = "PublishCodeChanges"
    $argsPack = $argsPack + " /TfsTeamProjectCollection:" + $projectCollectionUrl
    $argsPack = $argsPack + " /ProjectId:" + $projectId
    $argsPack = $argsPack + " /buildid:" + $definitionRunId
    $argsPack = $argsPack + " /Definitionid:" + $definitionId
    $argsPack = $argsPack + " /token:" + $personalAccessToken
    $argsPack = $argsPack + " /SourcesDir:" + $sourcesDir
    $argsPack = $argsPack + " /RebaseLimit:" + $reBaseValue
    $argsPack = $argsPack + " /Context:" + $context
    $argsPack = $argsPack + " /BaseLineFile:" + $tiaBaseLineDefinitionRunIdFile

    if([bool]::TryParse($isPrFlow, [ref]$isPrFlowBool))
    {
        $argsPack = $argsPack + " /IsPrFlow:" + $isPrFlowBool
    }

    # invoke TestSelector.exe
    try 
    {
        Write-Verbose "Invoking TestSelector with $argsPack"
        Invoke-Tool -Path $testSelectorToolPath -Arguments "$argsPack"
    }
    catch
    {
        $testSelectorSuceeded = $false
        Write-Warning -Verbose "TestSelector failed."
    }

    # Reading the base line run id from the file
    $baseLineDefinitionRunId = Get-Content $tiaBaseLineDefinitionRunIdFile

    if ([String]::IsNullOrWhiteSpace($BaseLineDefinitionRunId))
    {
        Write-Warning "BaseLine Definition Run ID cannot be null"
        throw
    }
    else
    {
        Write-Verbose "Base Line Definition Run id: $BaseLineDefinitionRunId"
    }
}

if([string]::Equals($testSelection, "testPlan")) 
{
    if($checkCustomSlicingEnabledMemberExists)
    {
        try
        {	
            Write-Verbose "Invoking Run Distributed Tests with Register Environment support"
    
            Invoke-RunDistributedTests -TestMachineGroup $testMachineGroup -SourceFilter $sourcefilters -TestCaseFilter $testFilterCriteria -RunSettingsPath $runSettingsFile -Platform $platform -Configuration $configuration -CodeCoverageEnabled $codeCoverageEnabled -TestRunParams $overrideRunParams -TestDropLocation $dropLocation -Connection $connection -TestConfiguration $testConfigurations -AutMachineGroup $autMachineGroup -UnregisterTestAgentScriptLocation $unregisterTestAgentScriptLocation -TestRunTitle $testRunTitle -TestSelection $testSelection -TestPlan $testPlanId -TestSuites $testSuites -TestConfig $testConfigurationId -TaskContext $distributedTaskContext -CheckTestAgentCompatScriptLocation $checkTaCompatScriptLocation -CustomSlicingEnabled $customSlicingEnabledFlag -TestImpactEnabled $isTestImpactOnFlag -BaseLineDefinitionRunId $baseLineDefinitionRunId
	    }
        catch
        {
            Write-Host "##vso[task.logissue type=error;code=" $_.Exception.Message ";TaskName=DTA]"
            throw
        }
    }
    elseif($checkTestAgentCompatScriptLocationMemberExists)
    {
        if($customSlicingEnabledFlag)
        {
            Write-Warning "Update the build agent to run tests with uniform distribution. If you are using hosted agent there are chances that it is still not updated, so retry using your own agent."
        }
        try
        {	
            if($taskContextMemberExists)
            {
                Write-Verbose "Invoking Run Distributed Tests with Register Environment support"
    
                Invoke-RunDistributedTests -TestMachineGroup $testMachineGroup -SourceFilter $sourcefilters -TestCaseFilter $testFilterCriteria -RunSettingsPath $runSettingsFile -Platform $platform -Configuration $configuration -CodeCoverageEnabled $codeCoverageEnabled -TestRunParams $overrideRunParams -TestDropLocation $dropLocation -Connection $connection -TestConfiguration $testConfigurations -AutMachineGroup $autMachineGroup -UnregisterTestAgentScriptLocation $unregisterTestAgentScriptLocation -TestRunTitle $testRunTitle -TestSelection $testSelection -TestPlan $testPlanId -TestSuites $testSuites -TestConfig $testConfigurationId -TaskContext $distributedTaskContext -CheckTestAgentCompatScriptLocation $checkTaCompatScriptLocation -TestImpactEnabled $isTestImpactOnFlag -BaseLineDefinitionRunId $baseLineDefinitionRunId
            }
            else
            {
                Write-Verbose "Invoking Run Distributed Tests with Machine Group Confg"
            
                Invoke-RunDistributedTests -TestMachineGroup $testMachineGroup -SourceFilter $sourcefilters -TestCaseFilter $testFilterCriteria -RunSettingsPath $runSettingsFilePreview -Platform $platform -Configuration $configuration -CodeCoverageEnabled $codeCoverageEnabledPreview -TestRunParams $overrideRunParamsPreview -TestDropLocation $dropLocation -Connection $connection -TestConfiguration $testConfigurations -AutMachineGroup $autMachineGroup -UnregisterTestAgentScriptLocation $unregisterTestAgentScriptLocation -TestRunTitle $testRunTitle -TestSelection $testSelection -TestPlan $testPlanId -TestSuites $testSuites -TestConfig $testConfigurationId -CheckTestAgentCompatScriptLocation $checkTaCompatScriptLocation -TestImpactEnabled $isTestImpactOnFlag -BaseLineDefinitionRunId $baseLineDefinitionRunId
            }  
	    }
        catch
        {
            Write-Host "##vso[task.logissue type=error;code=" $_.Exception.Message ";TaskName=DTA]"
            throw
        }
    }
    else
    {
        throw (Get-LocalizedString -Key "Update the build agent to run tests from test plan. If you are using hosted agent there are chances that it is still not updated, so retry using your own agent.")
    }
}
else
{
    if($checkCustomSlicingEnabledMemberExists)
    {
        try
        {	
            Write-Verbose "Invoking Run Distributed Tests with Register Environment support"
        
            Invoke-RunDistributedTests -TestMachineGroup $testMachineGroup -SourceFilter $sourcefilters -TestCaseFilter $testFilterCriteria -RunSettingsPath $runSettingsFile -Platform $platform -Configuration $configuration -CodeCoverageEnabled $codeCoverageEnabled -TestRunParams $overrideRunParams -TestDropLocation $dropLocation -Connection $connection -TestConfiguration $testConfigurations -AutMachineGroup $autMachineGroup -UnregisterTestAgentScriptLocation $unregisterTestAgentScriptLocation -TestRunTitle $testRunTitle -TaskContext $distributedTaskContext -CustomSlicingEnabled $customSlicingEnabledFlag -TestImpactEnabled $isTestImpactOnFlag -BaseLineDefinitionRunId $baseLineDefinitionRunId
	    }
        catch
        {
            Write-Host "##vso[task.logissue type=error;code=" $_.Exception.Message ";TaskName=DTA]"
            throw
        }
    }
	else 
	{
        if($customSlicingEnabledFlag)
        {
            Write-Warning "Update the build agent to run tests with uniform distribution. If you are using hosted agent there are chances that it is still not updated, so retry using your own agent."
        }
        try
        {
            if($taskContextMemberExists)
            {
                Write-Verbose "Invoking Run Distributed Tests with Register Environment support"
        
                Invoke-RunDistributedTests -TestMachineGroup $testMachineGroup -SourceFilter $sourcefilters -TestCaseFilter $testFilterCriteria -RunSettingsPath $runSettingsFile -Platform $platform -Configuration $configuration -CodeCoverageEnabled $codeCoverageEnabled -TestRunParams $overrideRunParams -TestDropLocation $dropLocation -Connection $connection -TestConfiguration $testConfigurations -AutMachineGroup $autMachineGroup -UnregisterTestAgentScriptLocation $unregisterTestAgentScriptLocation -TestRunTitle $testRunTitle -TaskContext $distributedTaskContext -TestImpactEnabled $isTestImpactOnFlag -BaseLineDefinitionRunId $baseLineDefinitionRunId
            }
            else
            {
                Write-Verbose "Invoking Run Distributed Tests with Machng Group Confg"
        
                Invoke-RunDistributedTests -TestMachineGroup $testMachineGroup -SourceFilter $sourcefilters -TestCaseFilter $testFilterCriteria -RunSettingsPath $runSettingsFile -Platform $platform -Configuration $configuration -CodeCoverageEnabled $codeCoverageEnabled -TestRunParams $overrideRunParams -TestDropLocation $dropLocation -Connection $connection -TestConfiguration $testConfigurations -AutMachineGroup $autMachineGroup -UnregisterTestAgentScriptLocation $unregisterTestAgentScriptLocation -TestRunTitle $testRunTitle -TestImpactEnabled $isTestImpactOnFlag -BaseLineDefinitionRunId $baseLineDefinitionRunId
            }
        }
        catch
        {
            Write-Host "##vso[task.logissue type=error;code=" $_.Exception.Message ";TaskName=DTA]"
            throw
        }
    }
}

if (([string]::Compare([io.path]::GetExtension($runSettingsFile), ".tmp", $True) -eq 0))
{
    Write-Host "Removing temp settings file"
    Remove-Item $runSettingsFile
}