[CmdletBinding()]
param()

. $PSScriptRoot\..\..\..\Tests\lib\Initialize-Test.ps1
. $PSScriptRoot\MockHelpers.ps1

. $PSScriptRoot\..\Utility.ps1

$actionIISWebsite = "CreateOrUpdateWebsite"
$websiteName = "Sample Web Site"
$startStopWebsiteName = ""
$websitePhysicalPath = "Drive:\Physical Path"
$websitePhysicalPathAuth = "WebsiteUserPassThrough"
$websiteAuthUserName = ""
$websiteAuthUserPassword = ""
$addBinding = "true"
$protocol = "http"
$ipAddress = "All Unassigned"
$port = "8080"
$serverNameIndication = "false"
$hostNameWithOutSNI = ""
$hostNameWithHttp = ""
$hostNameWithSNI = ""
$sslCertThumbPrint = ""
$createOrUpdateAppPoolForWebsite = "false"
$appPoolNameForWebsite = "Sample App Pool"
$dotNetVersionForWebsite = "v4.0"
$pipeLineModeForWebsite = "Integrated"
$appPoolIdentityForWebsite = "ApplicationPoolIdentity"
$appPoolUsernameForWebsite = ""
$appPoolPasswordForWebsite = ""
$configureAuthenticationForWebsite = "true"
$anonymousAuthenticationForWebsite = "false"
$basicAuthenticationForWebsite = "true"
$windowsAuthenticationForWebsite = "true"
$appCmdCommands = ""

# Test 1

Register-Mock Invoke-Main { }

Set-IISWebsite -actionIISWebsite $actionIISWebsite -websiteName $websiteName -startStopWebsiteName $startStopWebsiteName -physicalPath $websitePhysicalPath -physicalPathAuth $websitePhysicalPathAuth -physicalPathAuthUserName $websiteAuthUserName -physicalPathAuthUserPassword $websiteAuthUserPassword `
    -addBinding $addBinding -protocol $protocol -ipAddress $ipAddress -port $port -serverNameIndication $serverNameIndication `
    -hostNameWithOutSNI $hostNameWithOutSNI -hostNameWithHttp $hostNameWithHttp -hostNameWithSNI $hostNameWithSNI -sslCertThumbPrint $sslCertThumbPrint `
    -createOrUpdateAppPool $createOrUpdateAppPoolForWebsite -appPoolName $appPoolNameForWebsite -dotNetVersion $dotNetVersionForWebsite -pipeLineMode $pipeLineModeForWebsite -appPoolIdentity $appPoolIdentityForWebsite -appPoolUsername $appPoolUsernameForWebsite -appPoolPassword $appPoolPasswordForWebsite `
    -configureAuthentication $configureAuthenticationForWebsite -anonymousAuthentication $anonymousAuthenticationForWebsite -basicAuthentication $basicAuthenticationForWebsite -windowsAuthentication $windowsAuthenticationForWebsite -appCmdCommands $appCmdCommands

Assert-WasCalled Invoke-Main -Times 1
Assert-WasCalled Invoke-Main -- -ActionIISWebsite "CreateOrUpdateWebsite" -WebsiteName "Sample Web Site" -PhysicalPath "Drive:\Physical Path" -PhysicalPathAuth "WebsiteUserPassThrough" -PhysicalPathAuthCredentials $null -AddBinding "true" -Protocol "http" -IpAddress "All Unassigned" -Port "8080" -HostNameWithOutSNI "" -HostNameWithHttp "" -HostNameWithSNI "" -ServerNameIndication "false" -SslCertThumbPrint "" -configureAuthentication "true" -anonymousAuthentication "false" -basicAuthentication "true" -windowsAuthentication "true" -AppCmdCommands ""

# Test 2 

$createOrUpdateAppPoolForWebsite = "true"

Unregister-Mock Invoke-Main 
Register-Mock Invoke-Main { }

Set-IISWebsite -actionIISWebsite $actionIISWebsite -websiteName $websiteName -startStopWebsiteName $startStopWebsiteName -physicalPath $websitePhysicalPath -physicalPathAuth $websitePhysicalPathAuth -physicalPathAuthUserName $websiteAuthUserName -physicalPathAuthUserPassword $websiteAuthUserPassword `
    -addBinding $addBinding -protocol $protocol -ipAddress $ipAddress -port $port -serverNameIndication $serverNameIndication `
    -hostNameWithOutSNI $hostNameWithOutSNI -hostNameWithHttp $hostNameWithHttp -hostNameWithSNI $hostNameWithSNI -sslCertThumbPrint $sslCertThumbPrint `
    -createOrUpdateAppPool $createOrUpdateAppPoolForWebsite -appPoolName $appPoolNameForWebsite -dotNetVersion $dotNetVersionForWebsite -pipeLineMode $pipeLineModeForWebsite -appPoolIdentity $appPoolIdentityForWebsite -appPoolUsername $appPoolUsernameForWebsite -appPoolPassword $appPoolPasswordForWebsite `
    -configureAuthentication $configureAuthenticationForWebsite -anonymousAuthentication $anonymousAuthenticationForWebsite -basicAuthentication $basicAuthenticationForWebsite -windowsAuthentication $windowsAuthenticationForWebsite -appCmdCommands $appCmdCommands

Assert-WasCalled Invoke-Main -Times 1
Assert-WasCalled Invoke-Main -- -ActionIISWebsite "CreateOrUpdateWebsite" -WebsiteName "Sample Web Site" -PhysicalPath "Drive:\Physical Path" -PhysicalPathAuth "WebsiteUserPassThrough" -PhysicalPathAuthCredentials $null -AddBinding "true" -Protocol "http" -IpAddress "All Unassigned" -Port "8080" -HostNameWithOutSNI "" -HostNameWithHttp "" -HostNameWithSNI "" -ServerNameIndication "false" -SslCertThumbPrint "" -ActionIISApplicationPool "CreateOrUpdateAppPool" -AppPoolName "Sample App Pool" -DotNetVersion "v4.0" -PipeLineMode "Integrated" -AppPoolIdentity "ApplicationPoolIdentity" -AppPoolCredentials $null -configureAuthentication "true" -anonymousAuthentication "false" -basicAuthentication "true" -windowsAuthentication "true" -AppCmdCommands "" 

# Test 3 

$websitePhysicalPathAuth = "WebsiteWindowsAuth"
$websiteAuthUserName = "name"
$websiteAuthUserPassword = "pass"

$appPoolIdentityForWebsite = "SpecificUser"
$appPoolUsernameForWebsite = "name"
$appPoolPasswordForWebsite = "pass"

Unregister-Mock Invoke-Main 
Register-Mock Invoke-Main { }

Register-Mock Get-CustomCredentials { return "CustomCredentialsObject" }

Set-IISWebsite -actionIISWebsite $actionIISWebsite -websiteName $websiteName -startStopWebsiteName $startStopWebsiteName -physicalPath $websitePhysicalPath -physicalPathAuth $websitePhysicalPathAuth -physicalPathAuthUserName $websiteAuthUserName -physicalPathAuthUserPassword $websiteAuthUserPassword `
    -addBinding $addBinding -protocol $protocol -ipAddress $ipAddress -port $port -serverNameIndication $serverNameIndication `
    -hostNameWithOutSNI $hostNameWithOutSNI -hostNameWithHttp $hostNameWithHttp -hostNameWithSNI $hostNameWithSNI -sslCertThumbPrint $sslCertThumbPrint `
    -createOrUpdateAppPool $createOrUpdateAppPoolForWebsite -appPoolName $appPoolNameForWebsite -dotNetVersion $dotNetVersionForWebsite -pipeLineMode $pipeLineModeForWebsite -appPoolIdentity $appPoolIdentityForWebsite -appPoolUsername $appPoolUsernameForWebsite -appPoolPassword $appPoolPasswordForWebsite `
    -configureAuthentication $configureAuthenticationForWebsite -anonymousAuthentication $anonymousAuthenticationForWebsite -basicAuthentication $basicAuthenticationForWebsite -windowsAuthentication $windowsAuthenticationForWebsite -appCmdCommands $appCmdCommands

Assert-WasCalled Invoke-Main -Times 1
Assert-WasCalled Get-CustomCredentials -Times 2
Assert-WasCalled Invoke-Main -- -ActionIISWebsite "CreateOrUpdateWebsite" -WebsiteName "Sample Web Site" -PhysicalPath "Drive:\Physical Path" -PhysicalPathAuth "WebsiteWindowsAuth" -PhysicalPathAuthCredentials "CustomCredentialsObject" -AddBinding "true" -Protocol "http" -IpAddress "All Unassigned" -Port "8080" -HostNameWithOutSNI "" -HostNameWithHttp "" -HostNameWithSNI "" -ServerNameIndication "false" -SslCertThumbPrint "" -ActionIISApplicationPool "CreateOrUpdateAppPool" -AppPoolName "Sample App Pool" -DotNetVersion "v4.0" -PipeLineMode "Integrated" -AppPoolIdentity "SpecificUser" -AppPoolCredentials "CustomCredentialsObject" -configureAuthentication "true" -anonymousAuthentication "false" -basicAuthentication "true" -windowsAuthentication "true" -AppCmdCommands "" 

# Test 4 

$actionIISWebsite = "StartWebsite"
$startStopWebsiteName = "Sample Web Site"

Unregister-Mock Invoke-Main 
Register-Mock Invoke-Main { }

Set-IISWebsite -actionIISWebsite $actionIISWebsite -websiteName $websiteName -startStopWebsiteName $startStopWebsiteName -physicalPath $websitePhysicalPath -physicalPathAuth $websitePhysicalPathAuth -physicalPathAuthUserName $websiteAuthUserName -physicalPathAuthUserPassword $websiteAuthUserPassword `
    -addBinding $addBinding -protocol $protocol -ipAddress $ipAddress -port $port -serverNameIndication $serverNameIndication `
    -hostNameWithOutSNI $hostNameWithOutSNI -hostNameWithHttp $hostNameWithHttp -hostNameWithSNI $hostNameWithSNI -sslCertThumbPrint $sslCertThumbPrint `
    -createOrUpdateAppPool $createOrUpdateAppPoolForWebsite -appPoolName $appPoolNameForWebsite -dotNetVersion $dotNetVersionForWebsite -pipeLineMode $pipeLineModeForWebsite -appPoolIdentity $appPoolIdentityForWebsite -appPoolUsername $appPoolUsernameForWebsite -appPoolPassword $appPoolPasswordForWebsite `
    -appCmdCommands $appCmdCommands

Assert-WasCalled Invoke-Main -Times 1
Assert-WasCalled Invoke-Main -- -ActionIISWebsite "StartWebsite" -WebsiteName "Sample Web Site" -AppCmdCommands ""

# Test 5

$actionIISWebsite = "StopWebsite"
$startStopWebsiteName = "Sample Web Site"

Unregister-Mock Invoke-Main 
Register-Mock Invoke-Main { }

Set-IISWebsite -actionIISWebsite $actionIISWebsite -websiteName $websiteName -startStopWebsiteName $startStopWebsiteName -physicalPath $websitePhysicalPath -physicalPathAuth $websitePhysicalPathAuth -physicalPathAuthUserName $websiteAuthUserName -physicalPathAuthUserPassword $websiteAuthUserPassword `
    -addBinding $addBinding -protocol $protocol -ipAddress $ipAddress -port $port -serverNameIndication $serverNameIndication `
    -hostNameWithOutSNI $hostNameWithOutSNI -hostNameWithHttp $hostNameWithHttp -hostNameWithSNI $hostNameWithSNI -sslCertThumbPrint $sslCertThumbPrint `
    -createOrUpdateAppPool $createOrUpdateAppPoolForWebsite -appPoolName $appPoolNameForWebsite -dotNetVersion $dotNetVersionForWebsite -pipeLineMode $pipeLineModeForWebsite -appPoolIdentity $appPoolIdentityForWebsite -appPoolUsername $appPoolUsernameForWebsite -appPoolPassword $appPoolPasswordForWebsite `
    -appCmdCommands $appCmdCommands

Assert-WasCalled Invoke-Main -Times 1
Assert-WasCalled Invoke-Main -- -ActionIISWebsite "StopWebsite" -WebsiteName "Sample Web Site" -AppCmdCommands ""

# Test 6 

$actionIISWebsite = "CreateOrUpdateWebsite"
$addBinding = "true"
$protocol = "https"
$sslCertThumbPrint = "lessthan40charsstring"

Assert-Throws {
    Set-IISWebsite -actionIISWebsite $actionIISWebsite -websiteName $websiteName -startStopWebsiteName $startStopWebsiteName -physicalPath $websitePhysicalPath -physicalPathAuth $websitePhysicalPathAuth -physicalPathAuthUserName $websiteAuthUserName -physicalPathAuthUserPassword $websiteAuthUserPassword `
        -addBinding $addBinding -protocol $protocol -ipAddress $ipAddress -port $port -serverNameIndication $serverNameIndication `
        -hostNameWithOutSNI $hostNameWithOutSNI -hostNameWithHttp $hostNameWithHttp -hostNameWithSNI $hostNameWithSNI -sslCertThumbPrint $sslCertThumbPrint `
        -createOrUpdateAppPool $createOrUpdateAppPoolForWebsite -appPoolName $appPoolNameForWebsite -dotNetVersion $dotNetVersionForWebsite -pipeLineMode $pipeLineModeForWebsite -appPoolIdentity $appPoolIdentityForWebsite -appPoolUsername $appPoolUsernameForWebsite -appPoolPassword $appPoolPasswordForWebsite `
        -configureAuthentication $configureAuthenticationForWebsite -anonymousAuthentication $anonymousAuthenticationForWebsite -basicAuthentication $basicAuthenticationForWebsite -windowsAuthentication $windowsAuthenticationForWebsite -appCmdCommands $appCmdCommands
} -MessagePattern "InvalidSslThumbprint"

# Test 7

$actionIISWebsite = "InvalidOption"

Assert-Throws {
    Set-IISWebsite -actionIISWebsite $actionIISWebsite -websiteName $websiteName -startStopWebsiteName $startStopWebsiteName -physicalPath $websitePhysicalPath -physicalPathAuth $websitePhysicalPathAuth -physicalPathAuthUserName $websiteAuthUserName -physicalPathAuthUserPassword $websiteAuthUserPassword `
        -addBinding $addBinding -protocol $protocol -ipAddress $ipAddress -port $port -serverNameIndication $serverNameIndication `
        -hostNameWithOutSNI $hostNameWithOutSNI -hostNameWithHttp $hostNameWithHttp -hostNameWithSNI $hostNameWithSNI -sslCertThumbPrint $sslCertThumbPrint `
        -createOrUpdateAppPool $createOrUpdateAppPoolForWebsite -appPoolName $appPoolNameForWebsite -dotNetVersion $dotNetVersionForWebsite -pipeLineMode $pipeLineModeForWebsite -appPoolIdentity $appPoolIdentityForWebsite -appPoolUsername $appPoolUsernameForWebsite -appPoolPassword $appPoolPasswordForWebsite `
        -configureAuthentication $configureAuthenticationForWebsite -anonymousAuthentication $anonymousAuthenticationForWebsite -basicAuthentication $basicAuthenticationForWebsite -windowsAuthentication $windowsAuthenticationForWebsite -appCmdCommands $appCmdCommands
} -MessagePattern "InvalidActionIISWebsite InvalidOption"