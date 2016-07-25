[CmdletBinding()]
param()

Write-Verbose "Starting Azure File Copy Task"
Trace-VstsEnteringInvocation $MyInvocation

# Get inputs for the task
$ConnectedServiceNameSelector = Get-VstsInput -Name ConnectedServiceNameSelector -Require
$SourcePath = Get-VstsInput -Name SourcePath -Require
$Destination = Get-VstsInput -Name Destination -Require
$ConnectedServiceName = Get-VstsInput -Name ConnectedServiceName
$ConnectedServiceNameARM = Get-VstsInput -Name ConnectedServiceNameARM
$StorageAccount = Get-VstsInput -Name StorageAccount
$StorageAccountRM = Get-VstsInput -Name StorageAccountRM
$ContainerName = Get-VstsInput -Name ContainerName
$BlobPrefix = Get-VstsInput -Name BlobPrefix
$EnvironmentName = Get-VstsInput -Name EnvironmentName
$EnvironmentNameRM = Get-VstsInput -Name EnvironmentNameRM
$ResourceFilteringMethod = Get-VstsInput -Name ResourceFilteringMethod
$MachineNames = Get-VstsInput -Name MachineNames
$VmsAdminUserName = Get-VstsInput -Name VmsAdminUsername
$VmsAdminPassword = Get-VstsInput -Name VmsAdminPassword
$TargetPath = Get-VstsInput -Name TargetPath
$AdditionalArguments = Get-VstsInput -Name AdditionalArguments
$CleanTargetBeforeCopy = Get-VstsInput -Name CleanTargetBeforeCopy
$CopyFilesInParallel = Get-VstsInput -Name CopyFilesInParallel
$SkipCACheck = Get-VstsInput -Name SkipCACheck
$EnableCopyPrerequisites = Get-VstsInput -Name EnableCopyPrerequisites
$OutputStorageContainerSasToken = Get-VstsInput -Name OutputStorageContainerSasToken
$OutputStorageURI = Get-VstsInput -Name OutputStorageUri

if ($ConnectedServiceNameSelector -eq "ConnectedServiceNameARM")
{
    $ConnectedServiceName = $ConnectedServiceNameARM
    $StorageAccount = $StorageAccountRM
    $EnvironmentName = $EnvironmentNameRM
}

# Constants
$defaultSasTokenTimeOutInHours = 4
$useHttpsProtocolOption = ''
$ErrorActionPreference = 'Stop'
$telemetrySet = $false

$sourcePath = $sourcePath.Trim('"')
$storageAccount = $storageAccount.Trim()

# azcopy location on automation agent
$azCopyExeLocation = 'AzCopy\AzCopy.exe'
$azCopyLocation = [System.IO.Path]::GetDirectoryName($azCopyExeLocation)

# Initialize Azure.
Import-Module $PSScriptRoot\ps_modules\VstsAzureHelpers_
Initialize-Azure

# Import the loc strings.
Import-VstsLocStrings -LiteralPath $PSScriptRoot/Task.json

# Import all the dlls and modules which have cmdlets we need
# Import-Module "Microsoft.TeamFoundation.DistributedTask.Task.Internal"
# Import-Module "Microsoft.TeamFoundation.DistributedTask.Task.Common"
Import-Module "$PSScriptRoot\DeploymentUtilities\Microsoft.TeamFoundation.DistributedTask.Task.Deployment.Internal"
Import-Module "$PSScriptRoot\DeploymentUtilities\Microsoft.TeamFoundation.DistributedTask.Task.DevTestLabs.dll"

# Load all dependent files for execution
Import-Module ./AzureFileCopyJob.ps1 -Force
Import-Module ./Utility.ps1 -Force

# Enabling detailed logging only when system.debug is true
$enableDetailedLoggingString = $env:system_debug
if ($enableDetailedLoggingString -ne "true")
{
    $enableDetailedLoggingString = "false"
}

#### MAIN EXECUTION OF AZURE FILE COPY TASK BEGINS HERE ####
try
{
    # Importing required version of azure cmdlets according to azureps installed on machine
    $azureUtility = Get-AzureUtility

    Write-Verbose -Verbose "Loading $azureUtility"
    Import-Module ./$azureUtility -Force

    # Getting connection type (Certificate/UserNamePassword/SPN) used for the task
    $connectionType = Get-ConnectionType -connectedServiceName $connectedServiceName

    # Getting storage key for the storage account based on the connection type
    $storageKey = Get-StorageKey -storageAccountName $storageAccount -connectionType $connectionType

    # creating storage context to be used while creating container, sas token, deleting container
    $storageContext = Create-AzureStorageContext -StorageAccountName $storageAccount -StorageAccountKey $storageKey

    # creating temporary container for uploading files if no input is provided for container name
    if([string]::IsNullOrEmpty($containerName))
    {
        $containerName = [guid]::NewGuid().ToString()
        Create-AzureContainer -containerName $containerName -storageContext $storageContext
    }
	
	# Geting Azure Blob Storage Endpoint
	$blobStorageEndpoint = Get-blobStorageEndpoint -storageAccountName $storageAccount -connectionType $connectionType
}
catch
{
    if(-not $telemetrySet)
    {
        Write-TaskSpecificTelemetry "UNKNOWNPREDEP_Error"
    }

    throw
}

# Uploading files to container
Upload-FilesToAzureContainer -sourcePath $sourcePath -storageAccountName $storageAccount -containerName $containerName -blobPrefix $blobPrefix -blobStorageEndpoint $blobStorageEndpoint -storageKey $storageKey `
                             -azCopyLocation $azCopyLocation -additionalArguments $additionalArguments -destinationType $destination

# Complete the task if destination is azure blob
if ($destination -eq "AzureBlob")
{
    # Get URI and SaSToken for output if needed
    if(-not [string]::IsNullOrEmpty($outputStorageURI))
    {
        $storageAccountContainerURI = $storageContext.BlobEndPoint + $containerName
        Write-Host "##vso[task.setvariable variable=$outputStorageURI;]$storageAccountContainerURI"
    }
    if(-not [string]::IsNullOrEmpty($outputStorageContainerSASToken))
    {
        $storageContainerSaSToken = New-AzureStorageContainerSASToken -Container $containerName -Context $storageContext -Permission r -ExpiryTime (Get-Date).AddHours($defaultSasTokenTimeOutInHours)
        Write-Host "##vso[task.setvariable variable=$outputStorageContainerSASToken;]$storageContainerSasToken"
    }
    Write-Verbose "Completed Azure File Copy Task for Azure Blob Destination"
    return
}

# Copying files to Azure VMs
try
{
    # getting azure vms properties(name, fqdn, winrmhttps port)
    $azureVMResourcesProperties = Get-AzureVMResourcesProperties -resourceGroupName $environmentName -connectionType $connectionType `
    -resourceFilteringMethod $resourceFilteringMethod -machineNames $machineNames -enableCopyPrerequisites $enableCopyPrerequisites

    $skipCACheckOption = Get-SkipCACheckOption -skipCACheck $skipCACheck
    $azureVMsCredentials = Get-AzureVMsCredentials -vmsAdminUserName $vmsAdminUserName -vmsAdminPassword $vmsAdminPassword

    # generate container sas token with full permissions
    $containerSasToken = Generate-AzureStorageContainerSASToken -containerName $containerName -storageContext $storageContext -tokenTimeOutInHours $defaultSasTokenTimeOutInHours

    #copies files on azureVMs 
    Copy-FilesToAzureVMsFromStorageContainer `
        -storageAccountName $storageAccount -containerName $containerName -containerSasToken $containerSasToken -blobStorageEndpoint $blobStorageEndpoint -targetPath $targetPath -azCopyLocation $azCopyLocation `
        -resourceGroupName $environmentName -azureVMResourcesProperties $azureVMResourcesProperties -azureVMsCredentials $azureVMsCredentials `
        -cleanTargetBeforeCopy $cleanTargetBeforeCopy -communicationProtocol $useHttpsProtocolOption -skipCACheckOption $skipCACheckOption `
        -enableDetailedLoggingString $enableDetailedLoggingString -additionalArguments $additionalArguments -copyFilesInParallel $copyFilesInParallel -connectionType $connectionType
}
catch
{
    Write-Verbose $_.Exception.ToString() -Verbose

    Write-TaskSpecificTelemetry "UNKNOWNDEP_Error"
    throw
}
finally
{
    Remove-AzureContainer -containerName $containerName -storageContext $storageContext
    Write-Verbose "Completed Azure File Copy Task for Azure VMs Destination" -Verbose
    Trace-VstsLeavingInvocation $MyInvocation
}
