function InstallTestAgent2017
{
    param
    (
        [String] $SetupPath,
        [String] $InstallPath
    )

    if(-not (Test-Path -Path $SetupPath)) {
        throw "Test agent source path '{0}' is not accessible to the test machine. Please check if the file exists and that test machine has access to that machine" -f $SetupPath
    }

    $p = New-Object System.Diagnostics.Process
    $Processinfo = New-Object System.Diagnostics.ProcessStartInfo
    $Processinfo.CreateNoWindow = $true
    $Processinfo.UseShellExecute = $false
    $Processinfo.LoadUserProfile = $false
    $Processinfo.FileName = "$SetupPath"
    $Processinfo.Arguments = "--wait --quiet --norestart --installPath $InstallPath"

    $p.StartInfo = $Processinfo
    $p.Start()
    
    # Fish $p.WaitForExit can't be run on remote machines. Wasted time 4hrs. Should have read MSDN
    do {
        $waitProcess = Get-Process -Id $($p.Id) -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 30
        Write-Verbose -Verbose "Waiting for installtion to finish"
    } while($waitProcess -and $waitProcess.Name -ilike "*testagent*")
    
    return 0
}

function Install-Product($SetupPath, $ProductVersion, $Update)
{
    $exitCode = 0
    
    if(-not (Test-Path $SetupPath)){
        Write-Verbose "Test Agent path is invalid. Skipping the installation"
        return 1801
    }

    $versionToInstall = ((Get-Item $SetupPath).VersionInfo.ProductVersion) 
    $versionInstalled = Get-TestAgentInstalledVersion -ProductVersion $ProductVersion # Get installed test agent version as per user requested version

    if($versionToInstall -ne $null) {
        $versionToInstall = $versionToInstall.SubString(0, $versionToInstall.LastIndexOf('.'))
    }

    Write-Verbose "Installed Test Agent version: $versionInstalled"
    Write-Verbose "Requested Test Agent version: $versionToInstall"

    if([version]$versionInstalled -gt ([version]"0.0") -and $Update -ieq "false") {
        # Test Agent installed with major version matching. No update requested
        Write-Verbose -Message ("Test Agent already exists") -verbose
        return $exitCode
    }
    if([version]$versionInstalled -gt ([version]"0.0") -and [version]$versionInstalled -le [version]$versionToInstall)  {
        # Already upto date. Ignore Update flag
        Write-Verbose -Message ("Test Agent is already upto date") -verbose 
        return $exitCode
    } 
    
    if([version]$versionInstalled -eq ([version]"0.0")) {
        # Test Agent is not installed with major version matching. Any other installations are ignored
        Write-Verbose -Message ("Test Agent will be installed") -verbose
    }
    if([version]$versionInstalled -gt ([version]"0.0") -and [version]$versionInstalled -lt [version]$versionToInstall -and $Update -ieq "true") {
        Write-Verbose -Message ("Test Agent will be updated from: {0} to: {1}" -f $versionInstalled, $versionToInstall) -verbose 
    } 

    try
    {
        # Invoke the TA installation
        if($ProductVersion -eq "15.0") {
            $tpPath = Join-Path $env:SystemDrive TestAgent2017
            $exitCode = InstallTestAgent2017 -SetupPath $SetupPath -InstallPath $tpPath

            $configExe = [io.path]::combine($tpPath, 'Common7','IDE','TestAgentConfig.exe')
            Write-Verbose -Verbose "Configuration Test Agent path: $configExe"
            if(Test-Path -Path $configExe){
                try {
                    Invoke-Command -ScriptBlock { cmd.exe /c $args[0] $args[1]; $LASTEXITCODE } -ArgumentList $configExe, "ConfigureAsService" -ErrorAction SilentlyContinue
                } catch {
                    Write-Verbose -Verbose "Starting test agent service $_.Exception.Message"
                }
            } else {
                Write-Verbose -Verbose "Unable to find Test Agent configuration"
                $exitCode = -1
            }
        } else {
            $argumentsarr = @("/Quiet","/NoRestart")
            Write-Verbose -Message ("Invoking the command {0} with arguments {1}" -f $SetupPath, $Arguments) -verbose
            $retCode = Invoke-Command -ScriptBlock { cmd.exe /c $args[0] $args[1]; $LASTEXITCODE } -ArgumentList $SetupPath,$argumentsarr -ErrorAction Stop
            if($retCode -is [System.Array]) {
                $exitCode = $retCode[$retCode.Length-1]
            } else {
                $exitCode = $retCode
            }
        }
    }
    catch
    {
        Write-Verbose -Verbose "Caught exception while installing Test Agent"
        throw $_.Exception
    }
                
    if($exitCode -eq -2147185721)
    {
        # pending restart .
        try
        {
            $testAgentFile = "$env:SystemDrive\TestAgent\testagent.txt"
            $testAgentFileExists = Test-Path $testAgentFile
            if($testAgentFileExists)
            {
                # delete the file which indicated that test agent installation failed.
                Remove-Item $testAgentFile -force | Out-Null
                # we have retried once .Now fail with appropriate message
                Write-Verbose -Verbose "Retried to install Test Agent"
                throw ("The return code {0} was not expected during installation of Test Agent. Check the installation logs for more details." -f $exitCode.ToString())
            }
            else
            {
                #creating testagent file to indicate testagent installation failed.
                New-Item -Path $testAgentFile -type File | Out-Null
                Write-Verbose -Message ("Installation of Test Agent failed with Error code {0}. Retrying once by rebooting machine" -f $exitCode.ToString()) -Verbose
                return 3010;
            }
        }
        catch
        {
            Write-Verbose -Verbose "Error occurred while retrying the Test Agent installation"
            throw ("The return code {0} was not expected during installation of Test Agent. Check the installation logs for more details." -f $exitCode.ToString())
        }
    }

    if($exitCode -eq -2147205120)
    {
        # pending windows update.
        throw ("Pending windows update. The return code {0} was not expected during installation of Test Agent. Install windows update and try again." -f $exitCode.ToString())
    }

    if(-not ($exitCode -eq 0 -or $exitCode -eq 3010 -or $exitCode -eq 3015 -or $exitCode -eq 1641))
    {
        throw ("The return code {0} was not expected during installation of Test Agent. Check the installation logs for more details." -f $exitCode.ToString())
    }

    if($exitCode -eq 3010 -or $exitCode -eq 3015 -or $exitCode -eq 1641)
    {
        # Return the required reboot code 3010
        Write-Verbose "Reboot required post test agent installation , return 3010" -Verbose
        return 3010;
    }
    
    return $exitCode
}

return Install-Product -SetupPath $setupPath -ProductVersion $productVersion -Update $update