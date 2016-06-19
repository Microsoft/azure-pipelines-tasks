$ErrorActionPreference = 'Stop'

function Get-MsDeployExePath
{
    $MSDeployExePath = $null
    try
    {
        $MSDeployExePath , $MSDeployVersion = Get-MSDeployOnTargetMachine
    }
    catch [System.Exception]
    {
         Write-Verbose ("MSDeploy is not installed in system." + $_.Exception.Message)
    }

    if( $MSDeployExePath -ne $null -and $MSDeployVersion -lt 3 ){
        throw  "Unsupported installed version : $MSDeployVersion found for MSDeploy,version should be alteast 3 or above"
    }

    if( [string]::IsNullOrEmpty($MSDeployExePath) )
    {

        Write-Verbose  (Get-VstsLocString -Key "UsinglocalMSDeployexe")  
        $currentDir = (Get-Item -Path ".\").FullName
        $msDeployExeDir = Join-Path $currentDir "MSDeploy3.6"
        $MSDeployExePath = Join-Path $msDeployExeDir "msdeploy.exe"
    
    }
 
    Write-Host (Get-VstsLocString -Key msdeployexeislocatedat0 -ArgumentList $MSDeployExePath)

    return $MSDeployExePath
}

function Get-SingleFile
{
    param([String][Parameter(Mandatory=$true)] $files,
          [String][Parameter(Mandatory=$true)] $pattern)

    if ($files -is [system.array])
    {
        throw (Get-VstsLocString -Key Foundmorethanonefiletodeploywithsearchpattern0Therecanbeonlyone -ArgumentList $pattern)
    }
    else
    {
        if (!$files)
        {
            throw (Get-VstsLocString -Key Nofileswerefoundtodeploywithsearchpattern0 -ArgumentList $pattern)
        }

        return $files
    }
}

function Get-SingleFilePath
{
    param([String][Parameter(Mandatory=$true)] $file)

    Write-Host (Get-VstsLocString -Key filePathFindFilesSearchPattern0 -ArgumentList $file)
    $filePath = Find-VstsFiles -LegacyPattern $file
    Write-Host (Get-VstsLocString -Key filePath0 -ArgumentList $filePath)

    $filePath = Get-SingleFile -files $filePath -pattern $file
    return $filePath
}

function Get-WebAppNameForMSDeployCmd
{
    param([String][Parameter(Mandatory=$true)] $webAppName,
          [String][Parameter(Mandatory=$true)] $deployToSlotFlag,
          [String][Parameter(Mandatory=$false)] $slotName)

    $webAppNameForMSDeployCmd = $webAppName
    if($deployToSlotFlag -eq "true")
    {
        $webAppNameForMSDeployCmd += "(" + $SlotName + ")"
    }

    Write-Verbose "WebApp Name to be used in msdeploy command is: '$webAppNameForMSDeployCmd'"
    return $webAppNameForMSDeployCmd
}


function Get-MsDeployCmdArgs
{
    param([String][Parameter(Mandatory=$true)] $packageFile,
          [String][Parameter(Mandatory=$true)] $webAppNameForMSDeployCmd,
          [Object][Parameter(Mandatory=$true)] $azureRMWebAppConnectionDetails,
          [String][Parameter(Mandatory=$true)] $removeAdditionalFilesFlag,
          [String][Parameter(Mandatory=$true)] $excludeFilesFromAppDataFlag,
          [String][Parameter(Mandatory=$true)] $takeAppOfflineFlag,
          [String][Parameter(Mandatory=$false)] $virtualApplication,
          [String][Parameter(Mandatory=$false)] $setParametersFile,
          [String][Parameter(Mandatory=$false)] $AdditionalArguments)

    $msDeployCmdArgs = [String]::Empty
    Write-Verbose "Constructing msdeploy command arguments to deploy to azureRM WebApp:'$webAppNameForMSDeployCmd' `nfrom source Wep App zip package:'$packageFile'."

    # msdeploy argument containing source and destination details to sync
    $msDeployCmdArgs = [String]::Format('-verb:sync -source:package="{0}" -dest:auto,ComputerName="https://{1}/msdeploy.axd?site={2}",UserName="{3}",Password="{4}",AuthType="Basic"' `
                                        , $packageFile, $azureRMWebAppConnectionDetails.KuduHostName, $webAppNameForMSDeployCmd, $azureRMWebAppConnectionDetails.UserName, $azureRMWebAppConnectionDetails.UserPassword)

    # msdeploy argument to set destination IIS App Name for deploy
    if($virtualApplication)
    {
        $msDeployCmdArgs += [String]::Format(' -setParam:name="IIS Web Application Name",value="{0}/{1}"', $webAppNameForMSDeployCmd, $virtualApplication)
    }
    else
    {
        $msDeployCmdArgs += [String]::Format(' -setParam:name="IIS Web Application Name",value="{0}"', $webAppNameForMSDeployCmd)
    }

    # msdeploy argument to block deletion from happening
    if($removeAdditionalFilesFlag -ne "true")
    {
        $msDeployCmdArgs += " -enableRule:DoNotDeleteRule"
    }

    # msdeploy argument to take app offline
    if($takeAppOfflineFlag -eq "true")
    {
        $msDeployCmdArgs += " -enableRule:AppOffline"
    }

    # msdeploy argument to exclude files in App_Data folder
    if($excludeFilesFromAppDataFlag -eq "true")
    {
        $msDeployCmdArgs += [String]::Format(' -skip:Directory="\\App_Data"')
    }

    if( -not [String]::IsNullOrEmpty($setParametersFile)){
        $msDeployCmdArgs += [String]::Format(' -setParamFile:"{0}"', $setParametersFile)
    }
    
    # msploy additional arguments 
    if( -not [String]::IsNullOrEmpty($AdditionalArguments)){
        $msDeployCmdArgs += ( " " + $AdditionalArguments)
    }

    Write-Verbose "Constructed msdeploy command arguments to deploy to azureRM WebApp:'$webAppNameForMSDeployCmd' `nfrom source Wep App zip package:'$packageFile'."
    return $msDeployCmdArgs
}

function Get-MsDeployAspDotNet5CmdArgs
{

    param([String][Parameter(Mandatory=$true)] $wwwRootDir,
        [String][Parameter(Mandatory=$true)] $webAppNameForMSDeployCmd,
        [Object][Parameter(Mandatory=$true)] $azureRMWebAppConnectionDetails,
        [String][Parameter(Mandatory=$true)] $removeAdditionalFilesFlag,
        [String][Parameter(Mandatory=$true)] $excludeFilesFromAppDataFlag,
        [String][Parameter(Mandatory=$true)] $takeAppOfflineFlag,
        [String][Parameter(Mandatory=$false)] $AdditionalArguments)
    
        
    $msDeployCmdArgs = [String]::Empty
    Write-Verbose "Constructing msdeploy command arguments to deploy to azureRM WebApp:'$webAppNameForMSDeployCmd' `nfrom source Wep App zip package:'$packageFile'."

    # msdeploy argument containing source and destination details to sync
    $msDeployCmdArgs = [String]::Format('-verb:sync -source:IisApp="{0}" -dest:IisApp="{2}",ComputerName="https://{1}/msdeploy.axd",UserName="{3}",Password="{4}",AuthType="Basic"' `
                                        , $wwwRootDir, $azureRMWebAppConnectionDetails.KuduHostName, $webAppNameForMSDeployCmd, $azureRMWebAppConnectionDetails.UserName, $azureRMWebAppConnectionDetails.UserPassword)

    # msdeploy argument to block deletion from happening
    if($removeAdditionalFilesFlag -ne "true")
    {
        $msDeployCmdArgs += " -enableRule:DoNotDeleteRule"
    }

    # msdeploy argument to take app offline
    if($takeAppOfflineFlag -eq "true")
    {
        $msDeployCmdArgs += " -enableRule:AppOffline"
    }

    # msdeploy argument to exclude files in App_Data folder
    if($excludeFilesFromAppDataFlag -eq "true")
    {
        $msDeployCmdArgs += [String]::Format(' -skip:Directory="\\App_Data"')
    }
    
    # msploy additional arguments 
    if( -not [String]::IsNullOrEmpty($AdditionalArguments)){
        $msDeployCmdArgs += ( " " + $AdditionalArguments)
    }

    $msDeployCmdArgs += ( " " + "-enableLink:contentLibExtension"�)
    $msDeployCmdArgs += ( " " + "-retryAttempts:2"�)

    Write-Verbose "Constructed msdeploy command arguments to deploy to azureRM WebApp:'$webAppNameForMSDeployCmd' `nfrom source Wep App zip package:'$packageFile'."
    return $msDeployCmdArgs
}


function Run-Command
{
    param([String][Parameter(Mandatory=$true)] $command)

    try
	{
        if( $psversiontable.PSVersion.Major -le 4)
        {
           cmd.exe /c "`"$command`""
        }
        else
        {
           cmd.exe /c "$command"
        }

    }
	catch [System.Exception]
    {
        throw $_.Exception.Message    
    }

}

function Get-MsDeployCmdForLogs
{
    param([String][Parameter(Mandatory=$true)] $msDeployCmd)

    $msDeployCmdSplitByComma = $msDeployCmd.Split(',')
    $msDeployCmdHiddingSensitiveData = $msDeployCmdSplitByComma | ForEach-Object {if ($_.StartsWith("Password")) {$_.Replace($_, "Password=****")} else {$_}}

    $msDeployCmdForLogs = $msDeployCmdHiddingSensitiveData -join ","
    return $msDeployCmdForLogs
}

function Run-MsDeployCommand
{
    param([String][Parameter(Mandatory=$true)] $msDeployExePath,
          [String][Parameter(Mandatory=$true)] $msDeployCmdArgs)

    $msDeployCmd = "`"$msDeployExePath`" $msDeployCmdArgs"
    $msDeployCmdForLogs = Get-MsDeployCmdForLogs -msDeployCmd $msDeployCmd

    Write-Host (Get-VstsLocString -Key Runningmsdeploycommand0 -ArgumentList $msDeployCmdForLogs)
    Run-Command -command $msDeployCmd
    Write-Host (Get-VstsLocString -Key msdeploycommandransuccessfully )
}