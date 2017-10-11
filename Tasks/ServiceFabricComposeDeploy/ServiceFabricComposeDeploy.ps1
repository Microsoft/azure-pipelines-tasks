# For more information on the VSTS Task SDK:
# https://github.com/Microsoft/vsts-task-lib

[CmdletBinding()]
param()

Trace-VstsEnteringInvocation $MyInvocation
try {
    # Import the localized strings.
    Import-VstsLocStrings "$PSScriptRoot\task.json"

    # Load utility functions
    . "$PSScriptRoot\utilities.ps1"
    Import-Module $PSScriptRoot\ps_modules\ServiceFabricHelpers

    # Get inputs.
    $serviceConnectionName = Get-VstsInput -Name serviceConnectionName -Require
    $connectedServiceEndpoint = Get-VstsEndpoint -Name $serviceConnectionName -Require
    $composeFilePath = Get-SinglePathOfType (Get-VstsInput -Name composeFilePath -Require) Leaf -Require
    $applicationName = Get-VstsInput -Name applicationName -Require
    $deployTimeoutSec = Get-VstsInput -Name deployTimeoutSec
    $removeTimeoutSec = Get-VstsInput -Name removeTimeoutSec
    $getStatusTimeoutSec = Get-VstsInput -Name getStatusTimeoutSec

    $apiVersion = '2.8'
    $regKey = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Service Fabric SDK\' -ErrorAction SilentlyContinue
    if ($regKey)
    {
        if ($regKey.FabricSDKVersion -match "^\d+\.\d+")
        {
            $regExVersion = $matches[0]

            switch ($regExVersion) {
                '2.7' { $apiVersion = '2.7' }
                '2.8' { $apiVersion = '2.8' }
                '255.255' { $apiVersion = '255.255' }
                Default {
                    $sdkVersion = New-Object Version
                    if ([Version]::TryParse($matches[0], [ref]$sdkVersion)) {
                        $minVersion = New-Object -TypeName Version -ArgumentList '2.7'
                        if ($sdkVersion -lt $minVersion) {
                            Write-Error (Get-VstsLocString -Key UnsupportedAPIVersion -ArgumentList $regKey.FabricSDKVersion)
                            return;
                        }
                    }
                    else {
                        Write-Error (Get-VstsLocString -Key UnsupportedAPIVersion -ArgumentList $regKey.FabricSDKVersion)
                        return;
                    }
                }
            }
        }
        else
        {
            Write-Error (Get-VstsLocString -Key UnsupportedAPIVersion -ArgumentList $regKey.FabricSDKVersion)
            return;
        }
    }
    Write-Verbose (Get-VstsLocString -Key UsingAPIVersion -ArgumentList $apiVersion)

    if ($apiVersion -eq '2.8')
    {
        $deployParameters = @{
            'DeploymentName' = $applicationName
            'Compose' = $composeFilePath
        }
        $removeParameters = @{
            'DeploymentName' = $applicationName
            'Force' = $true
        }
        $getStatusParameters = @{
            'DeploymentName' = $applicationName
        }
    }
    else
    {
        $deployParameters = @{
            'ApplicationName' = $applicationName
            'Compose' = $composeFilePath
        }
        $removeParameters = @{
            'ApplicationName' = $applicationName
            'Force' = $true
        }
        $getStatusParameters = @{
            'ApplicationName' = $applicationName
        }
    }

    # Test the compose file
    Write-Host (Get-VstsLocString -Key CheckingComposeFile)
    $valid = Test-ServiceFabricApplicationPackage -ComposeFilePath $composeFilePath -ErrorAction Stop

    # Connect to the cluster
    $clusterConnectionParameters = @{}
    Connect-ServiceFabricClusterFromServiceEndpoint -ClusterConnectionParameters $clusterConnectionParameters -ConnectedServiceEndpoint $connectedServiceEndpoint

    $registryCredentials = Get-VstsInput -Name registryCredentials -Require
    switch ($registryCredentials) {
        "ContainerRegistryEndpoint"
        {
            $dockerRegistryEndpointName = Get-VstsInput -Name dockerRegistryEndpointName -Require
            $dockerRegistryEndpoint = Get-VstsEndpoint -Name $dockerRegistryEndpointName -Require
            $authParams = $dockerRegistryEndpoint.Auth.Parameters
            $username = $authParams.username
            $password = $authParams.password
            $isEncrypted = $false
        }
        "AzureResourceManagerEndpoint"
        {
            $azureSubscriptionEndpointName = Get-VstsInput -Name azureSubscriptionEndpoint -Require
            $azureSubscriptionEndpoint = Get-VstsEndpoint -Name $azureSubscriptionEndpointName -Require
            $authParams = $azureSubscriptionEndpoint.Auth.Parameters
            $username = $authParams.serviceprincipalid
            $password = $authParams.serviceprincipalkey
            $isEncrypted = $false
        }
        "UsernamePassword"
        {
            $username = Get-VstsInput -Name registryUserName -Require
            $password = Get-VstsInput -Name registryPassword -Require
            $isEncrypted = (Get-VstsInput -Name passwordEncrypted -Require) -eq "true"
        }
    }

    if ($registryCredentials -ne "None")
    {
        if (-not $isEncrypted)
        {
            Write-Host (Get-VstsLocString -Key EncryptingPassword)
            $password = Get-ServiceFabricEncryptedText -Text $password -ClusterConnectionParameters $clusterConnectionParameters
            $isEncrypted = $true
        }

        if ($apiVersion -eq '255.255')
        {
            $deployParameters['RepositoryUserName'] = $username
            $deployParameters['RepositoryPassword'] = $password
        }
        else
        {
            $deployParameters['RegistryUserName'] = $username
            $deployParameters['RegistryPassword'] = $password
        }

        $deployParameters['PasswordEncrypted'] = $isEncrypted
    }

    if ($deployTimeoutSec)
    {
        $deployParameters['TimeoutSec'] = $deployTimeoutSec
    }
    if ($removeTimeoutSec)
    {
        $removeParameters['TimeoutSec'] = $removeTimeoutSec
    }
    if ($getStatusTimeoutSec)
    {
        $getStatusParameters['TimeoutSec'] = $getStatusTimeoutSec
    }

    $existingApplication = Get-ServiceFabricComposeApplicationStatusHelper -ApiVersion $apiVersion -GetStatusParameters $getStatusParameters
    if ($existingApplication -ne $null)
    {
        Write-Host (Get-VstsLocString -Key RemovingApplication -ArgumentList $applicationName)

        Remove-ServiceFabricComposeApplicationHelper -ApiVersion $apiVersion -RemoveParameters $removeParameters
        do
        {
            Write-Host (Get-VstsLocString -Key CurrentStatus -ArgumentList $existingApplication.Status)
            Start-Sleep -Seconds 3
            $existingApplication = Get-ServiceFabricComposeApplicationStatusHelper -ApiVersion $apiVersion -GetStatusParameters $getStatusParameters
        }
        while ($existingApplication -ne $null)
        Write-Host (Get-VstsLocString -Key ApplicationRemoved)
    }

    Write-Host (Get-VstsLocString -Key CreatingApplication)
    New-ServiceFabricComposeApplicationHelper -ApiVersion $apiVersion -DeployParameters $deployParameters

    Write-Host (Get-VstsLocString -Key WaitingForDeploy)
    $newApplication = Get-ServiceFabricComposeApplicationStatusHelper -ApiVersion $apiVersion -GetStatusParameters $getStatusParameters
    while (($newApplication -eq $null) -or `
           ($newApplication.Status -eq 'Provisioning') -or `
           ($newApplication.Status -eq 'Creating'))
    {
        if ($newApplication -eq $null)
        {
            Write-Host (Get-VstsLocString -Key WaitingForDeploy)
        }
        else
        {
            Write-Host (Get-VstsLocString -Key CurrentStatus -ArgumentList $newApplication.Status)
        }
        Start-Sleep -Seconds 3
        $newApplication = Get-ServiceFabricComposeApplicationStatusHelper -ApiVersion $apiVersion -GetStatusParameters $getStatusParameters
    }
    Write-Host (Get-VstsLocString -Key CurrentStatus -ArgumentList $newApplication.Status)

    if ($newApplication.Status -ne 'Created' -and $newApplication.Status -ne 'Ready')
    {
        Write-Error (Get-VstsLocString -Key DeployFailed -ArgumentList @($newApplication.Status.ToString(), $newApplication.StatusDetails))
    }
} finally {
    Trace-VstsLeavingInvocation $MyInvocation
}