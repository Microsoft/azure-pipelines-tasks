function InitializeRestHeaders($connectedServiceName)
{
    $restHeaders = New-Object -TypeName "System.Collections.Generic.Dictionary[[String], [String]]"

	if($connectedServiceName)
	{
       $alternateCreds = [String]::Concat($Username, ":", $Password)
       $basicAuth = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($alternateCreds))
       $restHeaders.Add("Authorization", [String]::Concat("Basic ", $basicAuth))
    }
	else
	{
	   $restHeaders.Add("Authorization", [String]::Concat("Bearer ", $env:SYSTEM_ACCESSTOKEN))
	}
    return $restHeaders
}

function InvokeRestMethod($headers, $contentType, $uri , $method= "Get", $body)
{
  $ServicePoint = [System.Net.ServicePointManager]::FindServicePoint($uri)
  $result = Invoke-RestMethod -ContentType "application/json" -UserAgent $global:userAgent -TimeoutSec $global:RestTimeout -Uri $uri -Method $method -Headers $headers -Body $body
  $ServicePoint.CloseConnectionGroup("")
  return $result
}

function ComposeTestDropJson($name, $duration, $homepage, $vu, $geoLocation)
{
$tdjson = @"
{
    "dropType": "InplaceDrop",
    "loadTestDefinition":{
        "loadTestName":"$name",
        "runDuration":$duration,
        "urls":["$homepage"],
        "browserMixs":[
            {"browserName":"Internet Explorer 11.0","browserPercentage":60.0},
            {"browserName":"Chrome 2","browserPercentage":40.0}
        ],
        "loadPatternName":"Constant",
        "maxVusers":$vu,
        "loadGenerationGeoLocations":[
            {"Location":"$geoLocation","Percentage":100}
        ]
    }
}
"@

    return $tdjson
}

function CreateTestDrop($headers, $dropJson, $CltAccountUrl)
{
    $uri = [String]::Format("{0}/_apis/clt/testdrops?api-version=1.0", $CltAccountUrl)
    $drop = InvokeRestMethod -contentType "application/json" -uri $uri -method Post -headers $headers -body $dropJson

    return $drop
}

function GetTestDrop($headers, $drop, $CltAccountUrl)
{
    $uri = [String]::Format("{0}/_apis/clt/testdrops/{1}?api-version=1.0", $CltAccountUrl, $drop.id)
    $testdrop = InvokeRestMethod -contentType "application/json" -uri $uri -headers $headers

    return $testdrop
}

function UploadTestDrop($testdrop)
{
    $uri = New-Object System.Uri($testdrop.accessData.dropContainerUrl)
    $sas = New-Object Microsoft.WindowsAzure.Storage.Auth.StorageCredentials($testdrop.accessData.sasKey)
    $container = New-Object Microsoft.WindowsAzure.Storage.Blob.CloudBlobContainer($uri, $sas)

    return $container
}

function GetTestRuns($headers, $CltAccountUrl)
{
    $uri = [String]::Format("{0}/_apis/clt/testruns?api-version=1.0", $CltAccountUrl)
    $runs = InvokeRestMethod -contentType "application/json" -uri $uri -headers $headers

    return $runs
}

function GetTestRunUri($testRunId, $headers, $CltAccountUrl)
{
 $uri = [String]::Format("{0}/_apis/clt/testruns/{1}?api-version=1.0", $CltAccountUrl,$testRunId)
 $run = InvokeRestMethod -contentType "application/json" -uri $uri -headers $headers
 
 return $run.WebResultUrl
}

function RunInProgress($run)
{
    return $run.state -eq "queued" -or $run.state -eq "inProgress"
}

function MonitorTestRun($headers, $run, $CltAccountUrl)
{
    $uri = [String]::Format("{0}/_apis/clt/testruns/{1}?api-version=1.0", $CltAccountUrl, $run.id)
    $prevState = $run.state
    $prevSubState = $run.subState
    Write-Output ("Load test '{0}' is in state '{1}|{2}'." -f  $run.name, $run.state, $run.subState)

    do
    {
        Start-Sleep -s 5
        $run = InvokeRestMethod -contentType "application/json" -uri $uri -headers $headers
        if ($prevState -ne $run.state -or $prevSubState -ne $run.subState)
        {
            $prevState = $run.state
            $prevSubState = $run.subState
            Write-Output ("Load test '{0}' is in state '{1}|{2}'." -f  $run.name, $run.state, $run.subState)
        }
    }
    while (RunInProgress $run)

    $run = InvokeRestMethod -contentType "application/json" -uri $uri -headers $headers
    Write-Output "------------------------------------"
    $uri = [String]::Format("{0}/_apis/clt/testruns/{1}/messages?api-version=1.0", $CltAccountUrl, $run.id)
    $messages = InvokeRestMethod -contentType "application/json" -uri $uri -headers $headers

    if ($messages)
    {
        $timeSorted = $messages.value | Sort-Object loggedDate
        foreach ($message in $timeSorted)
        {
            switch ($message.messageType)
            {
                "info"      { Write-Host -NoNewline ("[Message]{0}" -f $message.message) }
                "output"    { Write-Host -NoNewline ("[Output]{0}" -f $message.message) }
                "warning"   { Write-Warning $message.message }
                "error"     { Write-Error $message.message }
                "critical"  { Write-Error $message.message }
            }
        }
    }

    Write-Output "------------------------------------"
}

function ComposeTestRunJson($name, $tdid, $MachineType)
{
$trjson = @"
{
    "name":"$name",
    "description":"Quick perf test from automation task",
    "testSettings":{"cleanupCommand":"", "hostProcessPlatform":"x86", "setupCommand":""},
    "superSedeRunSettings":{"loadGeneratorMachinesType":"$MachineType"},
    "testDrop":{"id":"$tdid"},
    "runSourceIdentifier":"build/$env:SYSTEM_DEFINITIONID/$env:BUILD_BUILDID"
}
"@

    return $trjson
}

function QueueTestRun($headers, $runJson, $CltAccountUrl)
{
    $uri = [String]::Format("{0}/_apis/clt/testruns?api-version=1.0", $CltAccountUrl)
    $run = InvokeRestMethod -contentType "application/json" -uri $uri -method Post -headers $headers -body $runJson

$start = @"
{
  "state": "queued"
}
"@

    $uri = [String]::Format("{0}/_apis/clt/testruns/{1}?api-version=1.0", $CltAccountUrl, $run.id)
    InvokeRestMethod -contentType "application/json" -uri $uri -method Patch -headers $headers -body $start
    $run = InvokeRestMethod -contentType "application/json" -uri $uri -headers $headers

    return $run
}

#function ComposeAccountUrl($connectedServiceDetails, $headers)
#{
#	  # Load all dependent files for execution
#  . $PSScriptRoot/VssConnectionHelper.ps1

#	Write-Output "Getting Clt Endpoint"
#	$elsUrl = Get-CltEndpoint($connectedServiceDetails, $headers)
#  #  if ($vsoUrl -notlike "*VSCLT.VISUALSTUDIO.COM*")
#  #  {
#  #      if ($vsoUrl -like "*VISUALSTUDIO.COM*")
#  #      {
#  #          $accountName = $vsoUrl.Split('//')[2].Split('.')[0]
#  #          $elsUrl = ("https://{0}.vsclt.visualstudio.com" -f $accountName)
#  #      }
		
#		#if($vsoUrl -like "*TFSALLIN.NET*")
#		#{
#		# $accountName = $vsoUrl.Split('//')[2].Split('.')[0]
#		# $elsUrl = ("http://{0}.me.tfsallin.net:9980" -f $accountName)
#		#}
#  #  }

#    return $elsUrl
#}

function ValidateInputs($websiteUrl)
{
    if (![System.Uri]::IsWellFormedUriString($websiteUrl, [System.UriKind]::Absolute))
    {
        throw "Website Url is not well formed."
    }
}

function UploadSummaryMdReport($summaryMdPath)
{
	Write-Verbose "Summary Markdown Path = $summaryMdPath"

	if (($env:SYSTEM_HOSTTYPE -eq "build") -and (Test-Path($summaryMdPath)))
	{	
		Write-Host "##vso[task.addattachment type=Distributedtask.Core.Summary;name=Load test results;]$summaryMdPath"
	}
}

