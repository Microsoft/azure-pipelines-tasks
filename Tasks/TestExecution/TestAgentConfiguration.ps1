﻿function ConfigureTestAgent
{
    param
    (
        [String] $TfsCollection,
        [String] $TestAgentVersion = "14.0",
        [String] $EnvironmentUrl,
        [String] $PersonalAccessToken,
        [ValidateSet("Service", "Process")]
        [String] $AsServiceOrProcess
    )

    # Properties for running UI Tests
    # TODO add registry stuff for them - ignore failures / access priviliges
    $DisableScreenSaver = $AsServiceOrProcess -ieq "Process"

    # Capabilties to set if it's running as AUT - DataCollectionOnly
    $Capabilities = @("")
    $MachineName = $Env:COMPUTERNAME

    Write-Host "****************************************************************"
    Write-Host "                    Configure Test Agent                      "
    Write-Host "----------------------------------------------------------------"
    Write-Host "AdminUserName                   : ($AdminUserName)"
    Write-Host "TestUserName                    : ($TestUserName)"
    Write-Host "AsServiceOrProcess              : ($AsServiceOrProcess)"
    Write-Host "EnvironmentUrl                  : ($EnvironmentUrl)"
    Write-Host "MachineName                     : ($MachineName)"
    Write-Host "Capabilities                    : ($Capabilities)"
    Write-Host "DisableScreenSaver              : ($DisableScreenSaver)"
    Write-Host "****************************************************************"
    
    $DtaAgentClient = New-Object MS.VS.TestService.Client.Utility.TestExecutionServiceRestApiHelper -ArgumentList $TfsCollection, $PersonalAccessToken
    $DtaAgent = $DtaAgentClient.Register($MachineName, $EnvironmentUrl, $MachineName, $Capabilities)
    Write-Host "Register the Agent with Id: $($DtaAgent.Id)"

    $DtaProcess = New-Object System.Diagnostics.Process
    $Processinfo = New-Object System.Diagnostics.ProcessStartInfo
    $Processinfo.EnvironmentVariables.Add("DTA.AccessToken", $PersonalAccessToken);
    $Processinfo.EnvironmentVariables.Add("DTA.AgentId", $DtaAgent.Id);
    $Processinfo.EnvironmentVariables.Add("DTA.EnvironmentUri", $EnvironmentUrl);
    $Processinfo.EnvironmentVariables.Add("DTA.TeamFoundationCollectionUri", $TfsCollection);

    if ($AsServiceOrProcess -eq "Service")
    {
        $Processinfo.UseShellExecute = $false
        $Processinfo.LoadUserProfile = $false
        $Processinfo.CreateNoWindow = $true
        $Processinfo.RedirectStandardError = $true
        $Processinfo.RedirectStandardOutput = $true
        $Processinfo.WindowStyle = "Hidden"
        $Processinfo.FileName = "$PSScriptRoot\modules\DTAExecutionHost.exe"
        $Processinfo.WorkingDirectory = "$PSScriptRoot\modules"
    }
    else
    {
        $Processinfo.UseShellExecute = $false
        $Processinfo.LoadUserProfile = $false
        $Processinfo.RedirectStandardError = $true
        $Processinfo.RedirectStandardOutput = $true
        $Processinfo.WindowStyle = "Normal"
        $Processinfo.FileName = "$PSScriptRoot\modules\DTAExecutionHost.exe"
        $Processinfo.WorkingDirectory = "$PSScriptRoot\modules"
    }

    $DtaProcess.StartInfo = $Processinfo
    
    Try {
        if($DtaProcess.Start()){
            Write-Verbose "DTAExecutionHost Process Id: $($DtaProcess.Id)"
            return $($DtaProcess.Id)
        }
        
        throw "Unable to start DTAExecutionHost process"
    }
    Catch {
        Write-Error $_
        throw
    }
}

function Set-DisableScreenSaverReg {
    # HKCU\Control Panel\Desktop\ScreenSaveActive - 0
    # HKCU\Software\Policies\Microsoft\Windows\Control Panel\Desktop - 1 warn user about Group policy
}
