Trace-VstsEnteringInvocation $MyInvocation
Import-VstsLocStrings "$PSScriptRoot\Task.json"

# Get inputs.
$scriptType = Get-VstsInput -Name ScriptType -Require
$scriptPath = Get-VstsInput -Name ScriptPath
$scriptInline = Get-VstsInput -Name Inline
$scriptArguments = Get-VstsInput -Name ScriptArguments
$__vsts_input_errorActionPreference = Get-VstsInput -Name errorActionPreference
$__vsts_input_failOnStandardError = Get-VstsInput -Name FailOnStandardError
$targetAzurePs = Get-VstsInput -Name TargetAzurePs
$customTargetAzurePs = Get-VstsInput -Name CustomTargetAzurePs

# Validate the script path and args do not contains new-lines. Otherwise, it will
# break invoking the script via Invoke-Expression.
if ($scriptType -eq "FilePath") {
    if ($scriptPath -match '[\r\n]' -or [string]::IsNullOrWhitespace($scriptPath)) {
        throw (Get-VstsLocString -Key InvalidScriptPath0 -ArgumentList $scriptPath)
    }
}

if ($scriptArguments -match '[\r\n]') {
    throw (Get-VstsLocString -Key InvalidScriptArguments0 -ArgumentList $scriptArguments)
}

# string constants
$otherVersion = "OtherVersion"
$latestVersion = "LatestVersion"

if ($targetAzurePs -eq $otherVersion) {
    if ($customTargetAzurePs -eq $null) {
        throw (Get-VstsLocString -Key InvalidAzurePsVersion $customTargetAzurePs)
    } else {
        $targetAzurePs = $customTargetAzurePs.Trim()        
    }
}

$pattern = "^[0-9]+\.[0-9]+\.[0-9]+$"
$regex = New-Object -TypeName System.Text.RegularExpressions.Regex -ArgumentList $pattern

if ($targetAzurePs -eq $latestVersion) {
    $targetAzurePs = ""
} elseif (-not($regex.IsMatch($targetAzurePs))) {
    throw (Get-VstsLocString -Key InvalidAzurePsVersion -ArgumentList $targetAzurePs)
}

. "$PSScriptRoot\Utility.ps1"

$serviceName = Get-VstsInput -Name ConnectedServiceNameARM -Require
$endpoint = Get-VstsEndpoint -Name $serviceName -Require

Update-PSModulePathForHostedAgent -targetAzurePs $targetAzurePs

try 
{
    # Initialize Azure.
    Import-Module $PSScriptRoot\ps_modules\VstsAzureHelpers_
    Initialize-AzModule -Endpoint $endpoint -azVersion $targetAzurePs
    
    # Trace the expression as it will be invoked.
    $__vstsAzPSInlineScriptPath = $null
    If ($scriptType -eq "InlineScript") {
        $scriptArguments = $null
        $__vstsAzPSInlineScriptPath = [System.IO.Path]::Combine($env:Agent_TempDirectory, ([guid]::NewGuid().ToString() + ".ps1"));
        ($scriptInline | Out-File $__vstsAzPSInlineScriptPath)
        $scriptPath = $__vstsAzPSInlineScriptPath
    }

    # Prepare the external command values.
    #
    # Note, use "-Command" instead of "-File". On PowerShell v4 and V3 when using "-File", terminating
    # errors do not cause a non-zero exit code.
    $input_pwsh = $true;
    # First check if PowerShell Core is available
    $powershellPath = Get-Command -Name pwsh.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Path
    # If PowerShell Core is not available, fall back to other versions of PowerShell
    if($null -eq $powershellPath) {
        $powershellPath = Get-Command -Name powershell.exe -CommandType Application | Select-Object -First 1 -ExpandProperty Path
    }
    Assert-VstsPath -LiteralPath $powershellPath -PathType 'Leaf'
    $arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Unrestricted -Command `". '$($scriptPath.Replace("'", "''"))'`""
    $splat = @{
        'FileName' = $powershellPath
        'Arguments' = $arguments
        'WorkingDirectory' = $input_workingDirectory
    }

    $scriptCommand = "& '$($scriptPath.Replace("'", "''"))' $scriptArguments"
    Remove-Variable -Name scriptType
    Remove-Variable -Name scriptPath
    Remove-Variable -Name scriptInline
    Remove-Variable -Name scriptArguments

    # For compatibility with the legacy handler implementation, set the error action
    # preference to continue. An implication of changing the preference to Continue,
    # is that Invoke-VstsTaskScript will no longer handle setting the result to failed.
    $global:ErrorActionPreference = 'Continue'

    # Undocumented VstsTaskSdk variable so Verbose/Debug isn't converted to ##vso[task.debug].
    # Otherwise any content the ad-hoc script writes to the verbose pipeline gets dropped by
    # the agent when System.Debug is not set.
    $global:__vstsNoOverrideVerbose = $true

    # Run the user's script. Redirect the error pipeline to the output pipeline to enable
    # a couple goals due to compatibility with the legacy handler implementation:
    # 1) STDERR from external commands needs to be converted into error records. Piping
    #    the redirected error output to an intermediate command before it is piped to
    #    Out-Default will implicitly perform the conversion.
    # 2) The task result needs to be set to failed if an error record is encountered.
    #    As mentioned above, the requirement to handle this is an implication of changing
    #    the error action preference.
    Invoke-VstsTool @splat 2>&1 | 
        ForEach-Object {
            if($_ -is [System.Management.Automation.ErrorRecord]) {
                if($_.FullyQualifiedErrorId -eq "NativeCommandError" -or $_.FullyQualifiedErrorId -eq "NativeCommandErrorMessage") {
                    ,$_
                    if($__vsts_input_failOnStandardError -eq $true) {
                        "##vso[task.complete result=Failed]"
                    }
                }
                else {
                    if($__vsts_input_errorActionPreference -eq "continue") {
                        ,$_
                        if($__vsts_input_failOnStandardError -eq $true) {
                            "##vso[task.complete result=Failed]"
                        }
                    }
                    elseif($__vsts_input_errorActionPreference -eq "stop") {
                        throw $_
                    }
                }
            } else {
                ,$_
            }
        }
}
finally {
    if ($__vstsAzPSInlineScriptPath -and (Test-Path -LiteralPath $__vstsAzPSInlineScriptPath) ) {
        Remove-Item -LiteralPath $__vstsAzPSInlineScriptPath -ErrorAction 'SilentlyContinue'
    }

    Import-Module $PSScriptRoot\ps_modules\VstsAzureHelpers_
    Remove-EndpointSecrets
    Disconnect-AzureAndClearContext -ErrorAction SilentlyContinue
}