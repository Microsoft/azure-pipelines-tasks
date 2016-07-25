$AzureFileCopyJob = {
param (
    [string]$fqdn,
    [string]$storageAccount,
    [string]$containerName,
    [string]$sasToken,
	[string]$blobStorageEndpoint,
    [string]$azCopyLocation,
    [string]$targetPath,
    [object]$credential,
    [string]$cleanTargetBeforeCopy,
    [string]$winRMPort,
    [string]$httpProtocolOption,
    [string]$skipCACheckOption,
    [string]$enableDetailedLogging,
    [string]$additionalArguments
    )

    Write-Verbose "fqdn = $fqdn"
    Write-Verbose "storageAccount = $storageAccount"
    Write-Verbose "containerName = $containerName"
    Write-Verbose "sasToken = $sasToken"
    Write-Verbose "azCopyLocation = $azCopyLocation"
    Write-Verbose "targetPath = $targetPath"
    Write-Verbose "cleanTargetBeforeCopy = $cleanTargetBeforeCopy"
    Write-Verbose "winRMPort = $winRMPort"
    Write-Verbose "httpProtocolOption = $httpProtocolOption"
    Write-Verbose "skipCACheckOption = $skipCACheckOption"
    Write-Verbose "enableDetailedLogging = $enableDetailedLogging"
    Write-Verbose "additionalArguments = $additionalArguments"

    if(Test-Path -Path "$env:AGENT_HOMEDIRECTORY\Agent\Worker")
    {
        Get-ChildItem $env:AGENT_HOMEDIRECTORY\Agent\Worker\*.dll | % {
            [void][reflection.assembly]::LoadFrom( $_.FullName )
            Write-Verbose "Loading .NET assembly:`t$($_.name)"
        }

        Get-ChildItem $env:AGENT_HOMEDIRECTORY\Agent\Worker\Modules\Microsoft.TeamFoundation.DistributedTask.Task.DevTestLabs\*.dll | % {
            [void][reflection.assembly]::LoadFrom( $_.FullName )
            Write-Verbose "Loading .NET assembly:`t$($_.name)"
        }
    }
    else
    {
        if(Test-Path "$env:AGENT_HOMEDIRECTORY\externals\vstshost")
        {
            [void][reflection.assembly]::LoadFrom("$env:AGENT_HOMEDIRECTORY\externals\vstshost\Microsoft.TeamFoundation.DistributedTask.Task.LegacySDK.dll")
        }
    }

    $cleanTargetPathOption = ''
    if ($cleanTargetBeforeCopy -eq "true")
    {
        $cleanTargetPathOption = '-CleanTargetPath'
    }

    $enableDetailedLoggingOption = ''
    if ($enableDetailedLogging -eq "true")
    {
        $enableDetailedLoggingOption = '-EnableDetailedLogging'
    }

    Write-Verbose "Initiating copy on $fqdn "

	if(-not [string]::IsNullOrWhiteSpace($blobStorageEndpoint))
    {
        $blobStorageURI = $blobStorageEndpoint+$containerName+"/"+$blobPrefix
    }
	
    [String]$copyToAzureMachinesBlockString = [string]::Empty
    if([string]::IsNullOrWhiteSpace($additionalArguments))
    {
        $copyToAzureMachinesBlockString = "Copy-ToAzureMachines -MachineDnsName `$fqdn -StorageAccountName `$storageAccount -ContainerName `$containerName -SasToken `$sasToken -DestinationPath `$targetPath -Credential `$credential -AzCopyLocation `$azCopyLocation -BlobStorageURI `$blobStorageURI -WinRMPort $winRMPort $cleanTargetPathOption $skipCACheckOption $httpProtocolOption $enableDetailedLoggingOption"
    }
    else
    {
        $copyToAzureMachinesBlockString = "Copy-ToAzureMachines -MachineDnsName `$fqdn -StorageAccountName `$storageAccount -ContainerName `$containerName -SasToken `$sasToken -DestinationPath `$targetPath -Credential `$credential -AzCopyLocation `$azCopyLocation -AdditionalArguments `$additionalArguments -BlobStorageURI `$blobStorageURI -WinRMPort $winRMPort $cleanTargetPathOption $skipCACheckOption $httpProtocolOption $enableDetailedLoggingOption"
    }
    [scriptblock]$copyToAzureMachinesBlock = [scriptblock]::Create($copyToAzureMachinesBlockString)

    $copyResponse = Invoke-Command -ScriptBlock $copyToAzureMachinesBlock
    Write-Output $copyResponse
}