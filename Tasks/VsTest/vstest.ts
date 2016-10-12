import tl = require('vsts-task-lib/task');
import path = require('path');
import Q = require('q');
import ffl = require('find-files-legacy/findfiles.legacy');

var os = require('os');
var regedit = require('regedit');
var uuid = require('node-uuid');
var fs = require('fs');
var xml2js = require('xml2js');
var perf = require("performance-now")

const runSettingsExt = ".runsettings";
const testSettingsExt = ".testsettings";
const TIFriendlyName = "Test Impact";
const TICollectorURI = "datacollector://microsoft/TestImpact/1.0";
const TITestSettingsAgentNameTag = "testImpact-5d76a195-1e43-4b90-a6ce-4ec3de87ed25";
const TITestSettingsNameTag = "testSettings-5d76a195-1e43-4b90-a6ce-4ec3de87ed25";
const TITestSettingsIDTag = "5d76a195-1e43-4b90-a6ce-4ec3de87ed25";
const TITestSettingsXmlnsTag = "http://microsoft.com/schemas/VisualStudio/TeamTest/2010"

try {
    tl.setResourcePath(path.join(__dirname, 'task.json'));
    var vsTestVersion: string = tl.getInput('vsTestVersion');
    var vstestLocationMethod: string = tl.getInput('vstestLocationMethod');
    var vstestLocation: string = tl.getPathInput('vsTestLocation');
    var testAssembly: string = tl.getInput('testAssembly', true);
    var testFiltercriteria: string = tl.getInput('testFiltercriteria');
    var runSettingsFile: string = tl.getPathInput('runSettingsFile');
    var codeCoverageEnabled: boolean = tl.getBoolInput('codeCoverageEnabled');
    var pathtoCustomTestAdapters: string = tl.getInput('pathtoCustomTestAdapters');
    var overrideTestrunParameters: string = tl.getInput('overrideTestrunParameters');
    var otherConsoleOptions: string = tl.getInput('otherConsoleOptions');
    var testRunTitle: string = tl.getInput('testRunTitle');
    var platform: string = tl.getInput('platform');
    var configuration: string = tl.getInput('configuration');
    var publishRunAttachments: string = tl.getInput('publishRunAttachments');
    var runInParallel: boolean = tl.getBoolInput('runInParallel');
    var tiaEnabled: boolean = tl.getBoolInput('runOnlyImpactedTests');
    var fileLevel = tl.getVariable('tia.filelevel');
    var tiaRebaseLimit: string = tl.getInput('runAllTestsAfterXBuilds');
    var sourcesDir = tl.getVariable('build.sourcesdirectory');
    var runIdFile = path.join(os.tmpdir(), uuid.v1() + ".txt");
    var baseLineBuildIdFile = path.join(os.tmpdir(), uuid.v1() + ".txt");
    var vstestDiagFile = path.join(os.tmpdir(), uuid.v1() + ".txt");
    var useNewCollectorFlag = tl.getVariable('tia.useNewCollector');
    var isPrFlow = tl.getVariable('tia.isPrFlow');

    var useNewCollector = false;
    if (useNewCollectorFlag && useNewCollectorFlag.toUpperCase() == "TRUE") {
        useNewCollector = true;
    }
    
    var releaseuri = tl.getVariable("release.releaseUri")
	var context = "CI";
	if(releaseuri)
	{
		context = "CD";
	}

    var systemDefaultWorkingDirectory = tl.getVariable('System.DefaultWorkingDirectory');
    var artifactsDirectory = tl.getVariable('System.ArtifactsDirectory');
    var testAssemblyFiles = getTestAssemblies();

    if (testAssemblyFiles && testAssemblyFiles.size != 0) {
        var workingDirectory = sourcesDir && sourcesDir != '' ? systemDefaultWorkingDirectory : artifactsDirectory;
        getTestResultsDirectory(runSettingsFile, path.join(workingDirectory, 'TestResults')).then(function (resultsDirectory) {
            invokeVSTest(resultsDirectory)
                .then(function (code) {
                    try {
                        if (!isTiaAllowed()) {
                            publishTestResults(resultsDirectory);
                        }
                        tl.setResult(code, tl.loc('VstestReturnCode', code));
                        deleteVstestDiagFile();
                    }
                    catch (error) {
                        deleteVstestDiagFile();
                        tl._writeLine("##vso[task.logissue type=error;code=" + error + ";TaskName=VSTest]");
                        throw error;
                    }
                })
                .fail(function (err) {
                    deleteVstestDiagFile();
                    tl._writeLine("##vso[task.logissue type=error;code=" + err + ";TaskName=VSTest]");
                    throw err;
                });
        });
    }
    else {
        deleteVstestDiagFile();
        tl._writeLine("##vso[task.logissue type=warning;code=002004;]");
        tl.warning(tl.loc('NoMatchingTestAssemblies', testAssembly));
    }
}
catch (error) {
    deleteVstestDiagFile();
    tl._writeLine("##vso[task.logissue type=error;code=" + error + ";TaskName=VSTest]");
    throw error;
}

function getResolvedPattern(pattern: string): string {
    if (path.isAbsolute(pattern)) {
        return pattern;
    }
    else {
        return path.join(systemDefaultWorkingDirectory, pattern);
    }
}

function getPatternWithoutIncludeExclude(pattern: string): string {
    return pattern.startsWith('-:') || pattern.startsWith('+:') ? pattern.substr(2) : pattern;
}

function getFilteredFilesFromPattern(pattern: string, hasQuantifier: boolean, allFiles: string[]): string[] {
    return hasQuantifier ? getFilteredFiles(pattern, allFiles) : [pattern];
}

function getTestAssemblies(): Set<string> {
    return new Set(ffl.findFiles(testAssembly, false, systemDefaultWorkingDirectory));
}

function addVstestDiagOption(argsArray: string[]) {
    let sysDebug = tl.getVariable("System.Debug");
    if (sysDebug === undefined || sysDebug.toLowerCase() === "false") {
        return;
    }

    let vstestLocationEscaped = vstestLocation.replace(/\\/g, "\\\\");
    let wmicTool = tl.createToolRunner("wmic");
    let wmicArgs = ["datafile", "where", "name='".concat(vstestLocationEscaped, "'"), "get", "Version", "/Value"];
    wmicTool.arg(wmicArgs);
    let output = wmicTool.execSync();

    let verSplitArray = output.stdout.split("=");
    if (verSplitArray.length != 2) {
        tl.warning(tl.loc("ErrorReadingVstestVersion"));
        return;
    }

    let versionArray = verSplitArray[1].split(".");
    if (versionArray.length != 4) {
        tl.warning(tl.loc("UnexpectedVersionString", output.stdout));
        return;
    }

    let productMajorPart = parseInt(versionArray[0]);
    let productMinorPart = parseInt(versionArray[1]);
    let productBuildPart = parseInt(versionArray[2]);

    if (isNaN(productMajorPart) || isNaN(productMinorPart) || isNaN(productBuildPart)) {
        tl.warning(tl.loc("UnexpectedVersionNumber", verSplitArray[1]));
        return;
    }

    if (productMajorPart > 15 || (productMajorPart == 15 && (productMinorPart > 0 || productBuildPart > 25428))) {
        argsArray.push("/diag:" + vstestDiagFile);
    } else {
        tl.warning(tl.loc("VstestDiagNotSupported"));
    }
}

function getVstestArguments(settingsFile: string, tiaEnabled: boolean): string[] {
    var argsArray: string[] = [];
    testAssemblyFiles.forEach(function (testAssembly) {
        var testAssemblyPath = testAssembly;
        //To maintain parity with the behaviour when test assembly was filepath, try to expand it relative to build sources directory.
        if (systemDefaultWorkingDirectory && !pathExistsAsFile(testAssembly)) {
            var expandedPath = path.join(systemDefaultWorkingDirectory, testAssembly);
            if (pathExistsAsFile(expandedPath)) {
                testAssemblyPath = expandedPath;
            }
        }
        argsArray.push(testAssemblyPath);
    });
    if (testFiltercriteria) {
        if (!tiaEnabled) {
            argsArray.push("/TestCaseFilter:" + testFiltercriteria);
        }
        else {
            tl.debug("Ignoring TestCaseFilter because Test Impact is enabled");

        }
    }
    if (settingsFile && pathExistsAsFile(settingsFile)) {
        argsArray.push("/Settings:" + settingsFile);
    }
    if (codeCoverageEnabled) {
        argsArray.push("/EnableCodeCoverage");
    }
    if (otherConsoleOptions) {
        argsArray.push(otherConsoleOptions);
    }
    argsArray.push("/logger:trx");
    if (pathtoCustomTestAdapters) {
        if (pathExistsAsDirectory(pathtoCustomTestAdapters)) {
            argsArray.push("/TestAdapterPath:\"" + pathtoCustomTestAdapters + "\"");
        }
        else {
            argsArray.push("/TestAdapterPath:\"" + path.dirname(pathtoCustomTestAdapters) + "\"");
        }
    }
    else if (systemDefaultWorkingDirectory && isNugetRestoredAdapterPresent(systemDefaultWorkingDirectory)) {
        argsArray.push("/TestAdapterPath:\"" + systemDefaultWorkingDirectory + "\"");
    }
    addVstestDiagOption(argsArray);
    return argsArray;
}

function addVstestArgs(argsArray: string[], vstest: any) {
    argsArray.forEach(function (arr) {
        vstest.arg(arr);
    });
}

function updateResponseFile(argsArray: string[], responseFile: string): Q.Promise<string> {
    var defer = Q.defer<string>();
    fs.appendFile(responseFile, os.EOL + argsArray.join(os.EOL), function (err) {
        if (err) {
            defer.reject(err);
        }
        defer.resolve(responseFile);
    });
    return defer.promise;
}

function getTestSelectorLocation(): string {
    return path.join(__dirname, "TestSelector/TestSelector.exe");
}

function getTraceCollectorUri(): string {
    return "file://" + path.join(__dirname, "TestSelector/Microsoft.VisualStudio.TraceCollector.dll");
}

function uploadTestResults(testResultsDirectory: string): Q.Promise<string> {
    var startTime = perf();
    var endTime;
    var elapsedTime;
    var defer = Q.defer<string>();
    var allFilesInResultsDirectory;
    var resultFiles;
    if (testResultsDirectory && testResultsDirectory !== "")
    {
        allFilesInResultsDirectory = tl.find(testResultsDirectory);
        resultFiles = tl.match(allFilesInResultsDirectory, path.join(testResultsDirectory, "*.trx"), { matchBase: true });
    }

    var selectortool = tl.createToolRunner(getTestSelectorLocation());
    selectortool.arg("UpdateTestResults");
    selectortool.arg("/TfsTeamProjectCollection:" + tl.getVariable("System.TeamFoundationCollectionUri"));
    selectortool.arg("/ProjectId:" + tl.getVariable("System.TeamProject"));
    selectortool.arg("/buildid:" + tl.getVariable("Build.BuildId"));
    selectortool.arg("/token:" + tl.getEndpointAuthorizationParameter("SystemVssConnection", "AccessToken", false));

    if (resultFiles && resultFiles[0])
    {
        selectortool.arg("/ResultFile:" + resultFiles[0]);
    }
    selectortool.arg("/runidfile:" + runIdFile);
    selectortool.exec()
        .then(function (code) {
            endTime = perf();
            elapsedTime = endTime - startTime;
            tl._writeLine("##vso[task.logissue type=warning;SubTaskName=UploadTestResults;SubTaskDuration=" + elapsedTime + "]");
            tl.debug(tl.loc("UploadTestResultsPerfTime", elapsedTime));
            defer.resolve(String(code));
        })
        .fail(function (err) {
            defer.reject(err);
        });
    return defer.promise;
}

function generateResponseFile(discoveredTests: string): Q.Promise<string> {
    var startTime = perf();
    var endTime: number;
    var elapsedTime: number;
    var defer = Q.defer<string>();
    var respFile = path.join(os.tmpdir(), uuid.v1() + ".txt");
    tl.debug("Response file will be generated at " + respFile);
    tl.debug("RunId file will be generated at " + runIdFile);
    var selectortool = tl.createToolRunner(getTestSelectorLocation());
    selectortool.arg("GetImpactedtests");
    selectortool.arg("/TfsTeamProjectCollection:" + tl.getVariable("System.TeamFoundationCollectionUri"));
    selectortool.arg("/ProjectId:" + tl.getVariable("System.TeamProject"));

    if(context == "CD")
	{	
        // Release context. Passing Release Id.
        selectortool.arg("/buildid:" + tl.getVariable("Release.ReleaseId"));
        selectortool.arg("/releaseuri:" + tl.getVariable("release.releaseUri"));
        selectortool.arg("/releaseenvuri:" + tl.getVariable("release.environmentUri"));	
	}
	else
	{
        // Build context. Passing build id.
        selectortool.arg("/buildid:" + tl.getVariable("Build.BuildId"));
	}
    
    selectortool.arg("/token:" + tl.getEndpointAuthorizationParameter("SystemVssConnection", "AccessToken", false));
    selectortool.arg("/responsefile:" + respFile);
    selectortool.arg("/DiscoveredTests:" + discoveredTests);
    selectortool.arg("/runidfile:" + runIdFile);
    selectortool.arg("/testruntitle:" + testRunTitle);
    selectortool.arg("/BaseLineFile:" + baseLineBuildIdFile);
    selectortool.arg("/platform:" + platform);
    selectortool.arg("/configuration:" + configuration);    
	selectortool.arg("/Context:" + context);

    selectortool.exec()
        .then(function (code) {
            endTime = perf();
            elapsedTime = endTime - startTime;
            tl.debug(tl.loc("GenerateResponseFilePerfTime", elapsedTime));
            defer.resolve(respFile);
        })
        .fail(function (err) {
            defer.reject(err);
        });

    return defer.promise;
}

function publishCodeChanges(): Q.Promise<string> {
    var startTime = perf();
    var endTime: number;
    var elapsedTime: number;
    var defer = Q.defer<string>();

    var newprovider = "true";
    if (getTIALevel() == 'method') {
        newprovider = "false";
    }

    var selectortool = tl.createToolRunner(getTestSelectorLocation());
    selectortool.arg("PublishCodeChanges");
    selectortool.arg("/TfsTeamProjectCollection:" + tl.getVariable("System.TeamFoundationCollectionUri"));
    selectortool.arg("/ProjectId:" + tl.getVariable("System.TeamProject"));

    if(context == "CD")
	{	
        // Release context. Passing Release Id.
        selectortool.arg("/buildid:" + tl.getVariable("Release.ReleaseId"));	
        selectortool.arg("/Definitionid:" + tl.getVariable("release.DefinitionId"));
	}
	else
	{
        // Build context. Passing build id.
        selectortool.arg("/buildid:" + tl.getVariable("Build.BuildId"));
        selectortool.arg("/Definitionid:" + tl.getVariable("System.DefinitionId"));
	}

    
    selectortool.arg("/token:" + tl.getEndpointAuthorizationParameter("SystemVssConnection", "AccessToken", false));
    selectortool.arg("/SourcesDir:" + sourcesDir);
    selectortool.arg("/newprovider:" + newprovider);
    selectortool.arg("/BaseLineFile:" + baseLineBuildIdFile);

    if (isPrFlow && isPrFlow.toUpperCase() == "TRUE") {
        selectortool.arg("/IsPrFlow:" + "true");
    }

    if (tiaRebaseLimit) {
        selectortool.arg("/RebaseLimit:" + tiaRebaseLimit);
    }
    selectortool.arg("/Context:" + context);
    
    selectortool.exec()
        .then(function (code) {
            endTime = perf();
            elapsedTime = endTime - startTime;
            tl.debug(tl.loc("PublishCodeChangesPerfTime", elapsedTime));
            defer.resolve(String(code));
        })
        .fail(function (err) {
            defer.reject(err);
        });

    return defer.promise;
}

function getVSTestLocation(vsVersion: number): string {
    if (vstestLocationMethod.toLowerCase() === 'version') {
        let vsCommon: string = tl.getVariable('VS' + vsVersion + '0COMNTools');
        if (!vsCommon) {
            throw (new Error(tl.loc('VstestNotFound', vsVersion)));
        } else {
            return path.join(vsCommon, '..\\IDE\\CommonExtensions\\Microsoft\\TestWindow\\vstest.console.exe');
        }
    } else if (vstestLocationMethod.toLowerCase() === 'location') {
        if (!pathExistsAsFile(vstestLocation)) {
            if (pathExistsAsDirectory(vstestLocation)) {
                return path.join(vstestLocation, 'vstest.console.exe');
            } else {
                throw (new Error(tl.loc('PathDoesNotExist', vstestLocation)));
            }
        } else {
            return vstestLocation;
        }
    }
}

function executeVstest(testResultsDirectory: string, parallelRunSettingsFile: string, vsVersion: number, argsArray: string[]): Q.Promise<number> {
    var defer = Q.defer<number>();
    var vstest = tl.createToolRunner(vstestLocation);
    addVstestArgs(argsArray, vstest);

    tl.rmRF(testResultsDirectory, true);
    tl.mkdirP(testResultsDirectory);
    tl.cd(workingDirectory);
    vstest.exec({ failOnStdErr: true })
        .then(function (code) {
            cleanUp(parallelRunSettingsFile);
            defer.resolve(code);
        })
        .fail(function (err) {
            cleanUp(parallelRunSettingsFile);
            tl.warning(tl.loc('VstestFailed'));
            tl.error(err);
            defer.resolve(1);
        });
    return defer.promise;
}

function getVstestTestsList(vsVersion: number): Q.Promise<string> {
    var defer = Q.defer<string>();
    var tempFile = path.join(os.tmpdir(), uuid.v1() + ".txt");
    tl.debug("Discovered tests listed at: " + tempFile);
    var argsArray: string[] = [];

    testAssemblyFiles.forEach(function (testAssembly) {
        var testAssemblyPath = testAssembly;
        if (systemDefaultWorkingDirectory && !pathExistsAsFile(testAssembly)) {
            var expandedPath = path.join(systemDefaultWorkingDirectory, testAssembly);
            if (pathExistsAsFile(expandedPath)) {
                testAssemblyPath = expandedPath;
            }
        }
        argsArray.push(testAssemblyPath);
    });

    tl.debug("The list of discovered tests is generated at " + tempFile);

    argsArray.push("/ListFullyQualifiedTests");
    argsArray.push("/ListTestsTargetPath:" + tempFile);
    if (testFiltercriteria) {
        argsArray.push("/TestCaseFilter:" + testFiltercriteria);
    }
    if (pathtoCustomTestAdapters) {
        if (pathExistsAsDirectory(pathtoCustomTestAdapters)) {
            argsArray.push("/TestAdapterPath:\"" + pathtoCustomTestAdapters + "\"");
        }
        else {
            argsArray.push("/TestAdapterPath:\"" + path.dirname(pathtoCustomTestAdapters) + "\"");
        }
    }
    else if (systemDefaultWorkingDirectory && isNugetRestoredAdapterPresent(systemDefaultWorkingDirectory)) {
        argsArray.push("/TestAdapterPath:\"" + systemDefaultWorkingDirectory + "\"");
    }

    if ((otherConsoleOptions && otherConsoleOptions.toLowerCase().indexOf("usevsixextensions:true") != -1) || (pathtoCustomTestAdapters && pathtoCustomTestAdapters.toLowerCase().indexOf("usevsixextensions:true") != -1)) {
        argsArray.push("/UseVsixExtensions:true");
    }

    var vstest = tl.createToolRunner(vstestLocation);
    addVstestArgs(argsArray, vstest);

    tl.cd(workingDirectory);
    vstest.exec({ failOnStdErr: true })
        .then(function (code) {
            defer.resolve(tempFile);
        })
        .fail(function (err) {
            tl.debug("Listing tests from VsTest failed.");
            tl.error(err);
            defer.resolve(err);
        });
    return defer.promise;
}

function cleanFiles(responseFile: string, listFile: string): void {
    tl.debug("Deleting the response file " + responseFile);
    tl.rmRF(responseFile, true);
    tl.debug("Deleting the discovered tests file " + listFile);
    tl.rmRF(listFile, true);
    tl.debug("Deleting the baseline build id file " + baseLineBuildIdFile);
    tl.rmRF(baseLineBuildIdFile, true);
}

function deleteVstestDiagFile(): void {
    if (pathExistsAsFile(vstestDiagFile)) {
        tl.debug("Deleting vstest diag file " + vstestDiagFile);
        tl.rmRF(vstestDiagFile, true);
    }
}

function runVStest(testResultsDirectory: string, settingsFile: string, vsVersion: number): Q.Promise<number> {
    var defer = Q.defer<number>();
    if (isTiaAllowed()) {
        publishCodeChanges()
            .then(function (status) {
                getVstestTestsList(vsVersion)
                    .then(function (listFile) {
                        generateResponseFile(listFile)
                            .then(function (responseFile) {
                                if (isEmptyResponseFile(responseFile)) {
                                    tl.debug("Empty response file detected. All tests will be executed.");
                                    executeVstest(testResultsDirectory, settingsFile, vsVersion, getVstestArguments(settingsFile, false))
                                        .then(function (vscode) {
                                            uploadTestResults(testResultsDirectory)
                                                .then(function (code) {
                                                    if (!isNaN(+code) && +code != 0) {
                                                        defer.resolve(+code);
                                                    }
                                                    else if (vscode != 0) {
                                                        defer.resolve(vscode);
                                                    }

                                                    defer.resolve(0);
                                                })
                                                .fail(function (code) {
                                                    tl.debug("Test Run Updation failed!");
                                                    defer.resolve(1);
                                                })
                                                .finally(function () {
                                                    cleanFiles(responseFile, listFile);
                                                    tl.debug("Deleting the run id file" + runIdFile);
                                                    tl.rmRF(runIdFile, true);
                                                });
                                        })
                                        .fail(function (code) {
                                            defer.resolve(code);
                                        })
                                        .finally(function () {
                                            cleanFiles(responseFile, listFile);
                                        });
                                }
                                else {
                                    responseContainsNoTests(responseFile)
                                        .then(function (noTestsAvailable) {
                                            if (noTestsAvailable) {                                                
                                                tl.debug("No tests impacted. Not running any tests.");
                                                uploadTestResults("")
                                                    .then(function (code) {
                                                        if (!isNaN(+code) && +code != 0) {
                                                            defer.resolve(+code);
                                                        }   
                                                        defer.resolve(0);
                                                    })
                                                    .fail(function (code) {
                                                        tl.debug("Test Run Updation failed!");
                                                        defer.resolve(1);
                                                    })
                                                    .finally(function () {
                                                        cleanFiles(responseFile, listFile);
                                                        tl.debug("Deleting the run id file" + runIdFile);
                                                        tl.rmRF(runIdFile, true);
                                                    });
                                            }                                                
                                            else {
                                                updateResponseFile(getVstestArguments(settingsFile, true), responseFile)
                                                    .then(function (updatedFile) {
                                                        executeVstest(testResultsDirectory, settingsFile, vsVersion, ["@" + updatedFile])
                                                            .then(function (vscode) {
                                                                uploadTestResults(testResultsDirectory)
                                                                    .then(function (code) {
                                                                        if (!isNaN(+code) && +code != 0) {
                                                                            defer.resolve(+code);
                                                                        }
                                                                        else if (vscode != 0) {
                                                                            defer.resolve(vscode);
                                                                        }

                                                                        defer.resolve(0);
                                                                    })
                                                                    .fail(function (code) {
                                                                        tl.debug("Test Run Updation failed!");
                                                                        defer.resolve(1);
                                                                    })
                                                                    .finally(function () {
                                                                        cleanFiles(responseFile, listFile);
                                                                        tl.debug("Deleting the run id file" + runIdFile);
                                                                        tl.rmRF(runIdFile, true);
                                                                    });
                                                            })
                                                            .fail(function (code) {
                                                                defer.resolve(code);
                                                            })
                                                            .finally(function () {
                                                                cleanFiles(responseFile, listFile);
                                                            });
                                                    })
                                                    .fail(function (err) {
                                                        tl.error(err);
                                                        tl.warning(tl.loc('ErrorWhileUpdatingResponseFile', responseFile));
                                                        executeVstest(testResultsDirectory, settingsFile, vsVersion, getVstestArguments(settingsFile, false))
                                                            .then(function (vscode) {
                                                                uploadTestResults(testResultsDirectory)
                                                                    .then(function (code) {
                                                                        if (!isNaN(+code) && +code != 0) {
                                                                            defer.resolve(+code);
                                                                        }
                                                                        else if (vscode != 0) {
                                                                            defer.resolve(vscode);
                                                                        }

                                                                        defer.resolve(0);
                                                                    })
                                                                    .fail(function (code) {
                                                                        tl.debug("Test Run Updation failed!");
                                                                        defer.resolve(1);
                                                                    })
                                                                    .finally(function () {
                                                                        cleanFiles(responseFile, listFile);
                                                                        tl.debug("Deleting the run id file" + runIdFile);
                                                                        tl.rmRF(runIdFile, true);
                                                                    });
                                                            })
                                                            .fail(function (code) {
                                                                defer.resolve(code);
                                                            }).finally(function () {
                                                                cleanFiles(responseFile, listFile);
                                                            });
                                                    });
                                            }
                                        });
                                }
                            })
                            .fail(function (err) {
                                tl.error(err);
                                tl.warning(tl.loc('ErrorWhileCreatingResponseFile'));
                                executeVstest(testResultsDirectory, settingsFile, vsVersion, getVstestArguments(settingsFile, false))
                                    .then(function (vscode) {
                                        uploadTestResults(testResultsDirectory)
                                            .then(function (code) {
                                                if (!isNaN(+code) && +code != 0) {
                                                    defer.resolve(+code);
                                                }
                                                else if (vscode != 0) {
                                                    defer.resolve(vscode);
                                                }

                                                defer.resolve(0);
                                            })
                                            .fail(function (code) {
                                                tl.debug("Test Run Updation failed!");
                                                defer.resolve(1);
                                            })
                                            .finally(function () {
                                                tl.debug("Deleting the discovered tests file" + listFile);
                                                tl.rmRF(listFile, true);
                                            });
                                    })
                                    .fail(function (code) {
                                        defer.resolve(code);
                                    });
                            });
                    })
                    .fail(function (err) {
                        tl.error(err);
                        tl.warning(tl.loc('ErrorWhileListingDiscoveredTests'));
                        defer.resolve(1);
                    });
            })
            .fail(function (err) {
                tl.error(err);
                tl.warning(tl.loc('ErrorWhilePublishingCodeChanges'));
                executeVstest(testResultsDirectory, settingsFile, vsVersion, getVstestArguments(settingsFile, false))
                    .then(function (code) {
                        publishTestResults(testResultsDirectory);
                        defer.resolve(code);
                    })
                    .fail(function (code) {
                        defer.resolve(code);
                    });
            });
    }
    else {
        tl.debug("Non TIA mode of test execution");
        executeVstest(testResultsDirectory, settingsFile, vsVersion, getVstestArguments(settingsFile, false))
            .then(function (code) {
                defer.resolve(code);
            })
            .fail(function (code) {
                defer.resolve(code);
            });
    }
    return defer.promise;
}

function invokeVSTest(testResultsDirectory: string): Q.Promise<number> {
    var defer = Q.defer<number>();
    if (vsTestVersion.toLowerCase() == "latest") {
        vsTestVersion = null;
    }
    overrideTestRunParametersIfRequired(runSettingsFile)
        .then(function (overriddenSettingsFile) {
            locateVSVersion()
                .then(function (vsVersion) {
                    try {
                        vstestLocation = getVSTestLocation(vsVersion);
                    } catch (e) {
                        tl.error(e.message);
                        defer.resolve(1);
                        return defer.promise;
                    }
                    setupSettingsFileForTestImpact(vsVersion, overriddenSettingsFile)
                        .then(function (runSettingswithTestImpact) {
                            setRunInParallellIfApplicable(vsVersion);
                            setupRunSettingsFileForParallel(runInParallel, runSettingswithTestImpact)
                                .then(function (parallelRunSettingsFile) {
                                    runVStest(testResultsDirectory, parallelRunSettingsFile, vsVersion)
                                        .then(function (code) {
                                            defer.resolve(code);
                                        })
                                        .fail(function (code) {
                                            defer.resolve(code);
                                        });
                                })
                                .fail(function (err) {
                                    tl.error(err);
                                    defer.resolve(1);
                                });
                        })
                        .fail(function (err) {
                            tl.error(err);
                            defer.resolve(1);
                        });
                })
                .fail(function (err) {
                    tl.error(err);
                    defer.resolve(1);
                });
        })
        .fail(function (err) {
            tl.error(err);
            defer.resolve(1);
        });

    return defer.promise;
}

function publishTestResults(testResultsDirectory: string) {
    if (testResultsDirectory) {
        var allFilesInResultsDirectory = tl.find(testResultsDirectory);
        var resultFiles = tl.match(allFilesInResultsDirectory, path.join(testResultsDirectory, "*.trx"), { matchBase: true });
        if (resultFiles && resultFiles.length != 0) {
            var tp = new tl.TestPublisher("VSTest");
            tp.publish(resultFiles, "false", platform, configuration, testRunTitle, publishRunAttachments);
        }
        else {
            tl._writeLine("##vso[task.logissue type=warning;code=002003;]");
            tl.warning(tl.loc('NoResultsToPublish'));
        }
    }
}

function getFilteredFiles(filesFilter: string, allFiles: string[]): string[] {
    if (os.type().match(/^Win/)) {
        return tl.match(allFiles, filesFilter, { matchBase: true, nocase: true });
    }
    else {
        return tl.match(allFiles, filesFilter, { matchBase: true });
    }
}

function cleanUp(temporarySettingsFile: string) {
    //cleanup the runsettings file
    if (temporarySettingsFile && runSettingsFile != temporarySettingsFile) {
        try {
            tl.rmRF(temporarySettingsFile, true);
        }
        catch (error) {
            //ignore. just cleanup.
        }
    }
}

function overrideTestRunParametersIfRequired(settingsFile: string): Q.Promise<string> {
    var defer = Q.defer<string>();
    if (!settingsFile || !pathExistsAsFile(settingsFile) || !overrideTestrunParameters || overrideTestrunParameters.trim().length == 0) {
        defer.resolve(settingsFile);
        return defer.promise;
    }

    overrideTestrunParameters = overrideTestrunParameters.trim();
    var overrideParameters = {};

    var parameterStrings = overrideTestrunParameters.split(";");
    parameterStrings.forEach(function (parameterString) {
        var pair = parameterString.split("=", 2);
        if (pair.length == 2) {
            var key = pair[0];
            var value = pair[1];
            if (!overrideParameters[key]) {
                overrideParameters[key] = value;
            }
        }
    });

    readFileContents(runSettingsFile, "utf-8")
        .then(function (xmlContents) {
            var parser = new xml2js.Parser();
            parser.parseString(xmlContents, function (err, result) {
                if (err) {
                    tl.warning(tl.loc('ErrorWhileReadingRunSettings', err));
                    tl.debug("Error occured while overriding test run parameters. Continuing...");
                    defer.resolve(settingsFile);
                    return defer.promise;
                }

                if (result.RunSettings && result.RunSettings.TestRunParameters && result.RunSettings.TestRunParameters[0] &&
                    result.RunSettings.TestRunParameters[0].Parameter) {
                    var parametersArray = result.RunSettings.TestRunParameters[0].Parameter;
                    parametersArray.forEach(function (parameter) {
                        var key = parameter.$.name;
                        if (overrideParameters[key]) {
                            parameter.$.value = overrideParameters[key];
                        }
                    });
                    tl.debug("Overriding test run parameters.");
                    var builder = new xml2js.Builder();
                    var overridedRunSettings = builder.buildObject(result);
                    saveToFile(overridedRunSettings, runSettingsExt)
                        .then(function (fileName) {
                            defer.resolve(fileName);
                        })
                        .fail(function (err) {
                            tl.debug("Error occured while overriding test run parameters. Continuing...");
                            tl.warning(err);
                            defer.resolve(settingsFile);
                        });
                }
                else {
                    tl.debug("No test run parameters found to override.");
                    defer.resolve(settingsFile);
                }
            });
        })
        .fail(function (err) {
            tl.debug("Error occured while overriding test run parameters. Continuing...");
            tl.warning(err);
            defer.resolve(settingsFile);
        });
    return defer.promise;
}

function isNugetRestoredAdapterPresent(rootDirectory: string): boolean {
    var allFiles = tl.find(rootDirectory);
    var adapterFiles = tl.match(allFiles, "**\\packages\\**\\*TestAdapter.dll", { matchBase: true });
    if (adapterFiles && adapterFiles.length != 0) {
        for (var i = 0; i < adapterFiles.length; i++) {
            var adapterFile = adapterFiles[i];
            var packageIndex = adapterFile.indexOf('packages') + 7;
            var packageFolder = adapterFile.substr(0, packageIndex);
            var parentFolder = path.dirname(packageFolder);
            var solutionFiles = tl.match(allFiles, path.join(parentFolder, "*.sln"), { matchBase: true });
            if (solutionFiles && solutionFiles.length != 0) {
                return true;
            }
        }
    }
    return false;
}

function getTestResultsDirectory(settingsFile: string, defaultResultsDirectory: string): Q.Promise<string> {
    var defer = Q.defer<string>();
    if (!settingsFile || !pathExistsAsFile(settingsFile)) {
        defer.resolve(defaultResultsDirectory);
        return defer.promise;
    }

    readFileContents(runSettingsFile, "utf-8")
        .then(function (xmlContents) {
            var parser = new xml2js.Parser();
            parser.parseString(xmlContents, function (err, result) {
                if (!err && result.RunSettings && result.RunSettings.RunConfiguration && result.RunSettings.RunConfiguration[0] &&
                    result.RunSettings.RunConfiguration[0].ResultsDirectory && result.RunSettings.RunConfiguration[0].ResultsDirectory[0].length > 0) {
                    var resultDirectory = result.RunSettings.RunConfiguration[0].ResultsDirectory[0];
                    resultDirectory = resultDirectory.trim();

                    if (resultDirectory) {
                        // path.resolve will take care if the result directory given in settings files is not absolute.
                        defer.resolve(path.resolve(path.dirname(runSettingsFile), resultDirectory));
                    }
                    else {
                        defer.resolve(defaultResultsDirectory);
                    }
                }
                else {
                    defer.resolve(defaultResultsDirectory);
                }
            });
        })
        .fail(function (err) {
            tl.debug("Error occured while reading test result directory from run settings. Continuing...")
            tl.warning(err);
            defer.resolve(defaultResultsDirectory);
        });
    return defer.promise;
}


function getTIAssemblyQualifiedName(vsVersion: number): String {
    return "Microsoft.VisualStudio.TraceCollector.TestImpactDataCollector, Microsoft.VisualStudio.TraceCollector, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a";
}

function getTestImpactAttributes(vsVersion: number) {
    return {
        uri: TICollectorURI,
        assemblyQualifiedName: getTIAssemblyQualifiedName(vsVersion),
        friendlyName: TIFriendlyName,
        codebase: getTraceCollectorUri()
    };
}

function getTestImpactAttributesWithoutNewCollector(vsVersion: number) {
    return {
        uri: TICollectorURI,
        assemblyQualifiedName: getTIAssemblyQualifiedName(vsVersion),
        friendlyName: TIFriendlyName
    };
}

function isTestImapctCollectorPresent(dataCollectorArray): Boolean {
    var found = false;
    var tiaFriendlyName = TIFriendlyName.toUpperCase();
    for (var node of dataCollectorArray) {
        if (node.$.friendlyName && node.$.friendlyName.toUpperCase() === tiaFriendlyName) {
            tl.debug("Test impact data collector already present, will not add the node.");
            found = true;
            break;
        }
    }
    return found;
}

function pushImpactLevelAndRootPathIfNotFound(dataCollectorArray): void {
    tl.debug("Checking for ImpactLevel and RootPath nodes in TestImpact collector");
    var tiaFriendlyName = TIFriendlyName.toUpperCase();
    var arrayLength = dataCollectorArray.length;
    for (var i = 0; i < arrayLength; i++) {
        if (dataCollectorArray[i].$.friendlyName && dataCollectorArray[i].$.friendlyName.toUpperCase() === tiaFriendlyName) {
            if (!dataCollectorArray[i].Configuration) {
                dataCollectorArray[i] = { Configuration: {} };
            }
            if (dataCollectorArray[i].Configuration.TestImpact && !dataCollectorArray[i].Configuration.RootPath) {
                if (context && context == "CD")
                {
                    dataCollectorArray[i].Configuration = { RootPath: "" };
                }
                else{
                    dataCollectorArray[i].Configuration = { RootPath: sourcesDir };
                }
            }
            else if (!dataCollectorArray[i].Configuration.TestImpact && dataCollectorArray[i].Configuration.RootPath) {
                dataCollectorArray[i].Configuration = { ImpactLevel: getTIALevel() };
            }
            else if (dataCollectorArray[i].Configuration && !dataCollectorArray[i].Configuration.TestImpact && !dataCollectorArray[i].Configuration.RootPath) {
                if (context && context == "CD")
                {
                    dataCollectorArray[i].Configuration = { ImpactLevel: getTIALevel(), RootPath: "" };
                }
                else{
                    dataCollectorArray[i].Configuration = { ImpactLevel: getTIALevel(), RootPath: sourcesDir };
                }
            }

            //Adding the codebase attribute to TestImpact collector 
            tl.debug("Adding codebase attribute to the existing test impact collector");
            if (useNewCollector) {
                if (!dataCollectorArray[i].$.codebase) {
                    dataCollectorArray[i].$.codebase = getTraceCollectorUri();
                }
            }
        }
    }
}

function roothPathGenerator() : any
{
    if (context)
    {
        if (context == "CD")
        {
            return { ImpactLevel: getTIALevel(), RootPath: "" };
        }
        else{
            return { ImpactLevel: getTIALevel(), RootPath: sourcesDir };
        }
    }
}

function updateRunSettings(result: any, vsVersion: number) {
    var dataCollectorNode = null;
    if (!result.RunSettings) {
        tl.debug("Updating runsettings file from RunSettings node");
        result.RunSettings = { DataCollectionRunSettings: { DataCollectors: { DataCollector: { Configuration: roothPathGenerator()} } } };
        dataCollectorNode = result.RunSettings.DataCollectionRunSettings.DataCollectors.DataCollector;
    }
    else if (!result.RunSettings.DataCollectionRunSettings) {
        tl.debug("Updating runsettings file from DataCollectionSettings node");
        result.RunSettings.DataCollectionRunSettings = { DataCollectors: { DataCollector: { Configuration: roothPathGenerator() } } };
        dataCollectorNode = result.RunSettings.DataCollectionRunSettings.DataCollectors.DataCollector;
    }
    else if (!result.RunSettings.DataCollectionRunSettings[0].DataCollectors) {
        tl.debug("Updating runsettings file from DataCollectors node");
        result.RunSettings.DataCollectionRunSettings[0] = { DataCollectors: { DataCollector: { Configuration: roothPathGenerator() } } };
        dataCollectorNode = result.RunSettings.DataCollectionRunSettings[0].DataCollectors.DataCollector;
    }
    else {
        var dataCollectorArray = result.RunSettings.DataCollectionRunSettings[0].DataCollectors[0].DataCollector;
        if (!dataCollectorArray) {
            tl.debug("Updating runsettings file from DataCollector node");
            result.RunSettings.DataCollectionRunSettings[0] = { DataCollectors: { DataCollector: { Configuration: roothPathGenerator() } } };
            dataCollectorNode = result.RunSettings.DataCollectionRunSettings[0].DataCollectors.DataCollector;
        }
        else {
            if (!isTestImapctCollectorPresent(dataCollectorArray)) {
                tl.debug("Updating runsettings file, adding a DataCollector node");
                dataCollectorArray.push({ Configuration: roothPathGenerator() });
                dataCollectorNode = dataCollectorArray[dataCollectorArray.length - 1];
            }
            else {
                pushImpactLevelAndRootPathIfNotFound(dataCollectorArray);
            }
        }
    }
    if (dataCollectorNode) {
        tl.debug("Setting attributes for test impact data collector");
        if (useNewCollector) {
            dataCollectorNode.$ = getTestImpactAttributes(vsVersion);
        }
        else {
            dataCollectorNode.$ = getTestImpactAttributesWithoutNewCollector(vsVersion);
        }
    }
}

function updateRunSettingsFileForTestImpact(vsVersion: number, settingsFile: string, exitErrorMessage: string): Q.Promise<string> {
    var defer = Q.defer<string>();
    tl.debug("Adding test impact data collector element to runsettings file provided.");
    readFileContents(settingsFile, "utf-8")
        .then(function (xmlContents) {
            var parser = new xml2js.Parser();
            parser.parseString(xmlContents, function (err, result) {
                if (err) {
                    tl.warning(tl.loc('ErrorWhileReadingRunSettings', err));
                    tl.debug(exitErrorMessage);
                    defer.resolve(settingsFile);
                    return defer.promise;
                }
                if (result.RunSettings === undefined) {
                    tl.warning(tl.loc('ErrorWhileSettingTestImpactCollectorRunSettings'));
                    defer.resolve(settingsFile);
                    return defer.promise;
                }
                updateRunSettings(result, vsVersion);
                writeXmlFile(result, settingsFile, runSettingsExt, exitErrorMessage)
                    .then(function (filename) {
                        defer.resolve(filename);
                        return defer.promise;
                    });
            });
        })
        .fail(function (err) {
            tl.warning(err);
            tl.debug(exitErrorMessage);
            defer.resolve(settingsFile);
        });
    return defer.promise;
}

function updatTestSettings(result: any, vsVersion: number) {
    var dataCollectorNode = null;
    if (!result.TestSettings) {
        tl.debug("Updating testsettings file from TestSettings node");
        result.TestSettings = { Execution: { AgentRule: { DataCollectors: { DataCollector: { Configuration: roothPathGenerator() } } } } };
        result.TestSettings.Execution.AgentRule.$ = { name: TITestSettingsAgentNameTag };
        result.TestSettings.$ = { name: TITestSettingsNameTag, id: TITestSettingsIDTag, xmlns: TITestSettingsXmlnsTag };
        dataCollectorNode = result.TestSettings.Execution.AgentRule.DataCollectors.DataCollector;
    }
    else if (!result.TestSettings.Execution) {
        tl.debug("Updating testsettings file from Execution node");
        result.TestSettings.Execution = { AgentRule: { DataCollectors: { DataCollector: { Configuration: roothPathGenerator() } } } };
        result.TestSettings.Execution.AgentRule.$ = { name: TITestSettingsAgentNameTag };
        dataCollectorNode = result.TestSettings.Execution.AgentRule.DataCollectors.DataCollector;
    }
    else if (!result.TestSettings.Execution[0].AgentRule) {
        tl.debug("Updating testsettings file from AgentRule node");
        result.TestSettings.Execution[0] = { AgentRule: { DataCollectors: { DataCollector: { Configuration: roothPathGenerator() } } } };
        result.TestSettings.Execution[0].AgentRule.$ = { name: TITestSettingsAgentNameTag };
        dataCollectorNode = result.TestSettings.Execution[0].AgentRule.DataCollectors.DataCollector;
    }
    else if (!result.TestSettings.Execution[0].AgentRule[0].DataCollectors) {
        tl.debug("Updating testsettings file from DataCollectors node");
        result.TestSettings.Execution[0].AgentRule[0] = { DataCollectors: { DataCollector: { Configuration: roothPathGenerator() } } };
        dataCollectorNode = result.TestSettings.Execution[0].AgentRule[0].DataCollectors.DataCollector;
    }
    else {
        var dataCollectorArray = result.TestSettings.Execution[0].AgentRule[0].DataCollectors[0].DataCollector;
        if (!dataCollectorArray) {
            tl.debug("Updating testsettings file from DataCollector node");
            result.TestSettings.Execution[0].AgentRule[0].DataCollectors[0] = { DataCollector: { Configuration: roothPathGenerator() } };
            dataCollectorNode = result.TestSettings.Execution[0].AgentRule[0].DataCollectors[0].DataCollector;
        }
        else {
            if (!isTestImapctCollectorPresent(dataCollectorArray)) {
                tl.debug("Updating testsettings file, adding a DataCollector node");
                dataCollectorArray.push({ Configuration: roothPathGenerator() });
                dataCollectorNode = dataCollectorArray[dataCollectorArray.length - 1];
            }
            else {
                pushImpactLevelAndRootPathIfNotFound(dataCollectorArray);
            }
        }
    }
    if (dataCollectorNode) {
        tl.debug("Setting attributes for test impact data collector");
        if (useNewCollector) {
            dataCollectorNode.$ = getTestImpactAttributes(vsVersion);
        }
        else {
            dataCollectorNode.$ = getTestImpactAttributesWithoutNewCollector(vsVersion);
        }
    }
}

function writeXmlFile(result: any, settingsFile: string, fileExt: string, exitErrorMessage: string): Q.Promise<string> {
    var defer = Q.defer<string>();
    var builder = new xml2js.Builder();
    var runSettingsForTestImpact = builder.buildObject(result);
    saveToFile(runSettingsForTestImpact, fileExt)
        .then(function (fileName) {
            cleanUp(settingsFile);
            defer.resolve(fileName);
            return defer.promise;
        })
        .fail(function (err) {
            tl.debug(exitErrorMessage);
            tl.warning(err);
            defer.resolve(settingsFile);
        });
    return defer.promise;
}

function updateTestSettingsFileForTestImpact(vsVersion: number, settingsFile: string, exitErrorMessage: string): Q.Promise<string> {
    var defer = Q.defer<string>();
    tl.debug("Adding test impact data collector element to testsettings file provided.");
    readFileContents(settingsFile, "utf-8")
        .then(function (xmlContents) {
            var parser = new xml2js.Parser();
            parser.parseString(xmlContents, function (err, result) {
                if (err) {
                    tl.warning(tl.loc('ErrorWhileReadingTestSettings', err));
                    tl.debug(exitErrorMessage);
                    defer.resolve(settingsFile);
                    return defer.promise;
                }
                if (result.TestSettings === undefined) {
                    tl.warning(tl.loc('ErrorWhileSettingTestImpactCollectorTestSettings'));
                    defer.resolve(settingsFile);
                    return defer.promise;
                }
                updatTestSettings(result, vsVersion);
                writeXmlFile(result, settingsFile, testSettingsExt, exitErrorMessage)
                    .then(function (filename) {
                        defer.resolve(filename);
                        return defer.promise;
                    });
            });
        })
        .fail(function (err) {
            tl.warning(err);
            tl.debug(exitErrorMessage);
            defer.resolve(settingsFile);
        });
    return defer.promise;
}


function createRunSettingsForTestImpact(vsVersion: number, settingsFile: string, exitErrorMessage: string): Q.Promise<string> {
    var defer = Q.defer<string>();
    tl.debug("No settings file provided or the provided settings file does not exist. Creating run settings file for enabling test impact data collector.");
    var runSettingsForTIA = '<?xml version="1.0" encoding="utf-8"?><RunSettings><DataCollectionRunSettings><DataCollectors>' +
        '<DataCollector uri="' + TICollectorURI + '" ' +
        'assemblyQualifiedName="' + getTIAssemblyQualifiedName(vsVersion) + '" ' +
        'friendlyName="' + TIFriendlyName + '" ';

    if (useNewCollector) {
        runSettingsForTIA = runSettingsForTIA +
            'codebase="' + getTraceCollectorUri() + '"';
    }

    runSettingsForTIA = runSettingsForTIA +
        ' >' +
        '<Configuration>' +
        '<ImpactLevel>' + getTIALevel() + '</ImpactLevel>' +
        '<RootPath>' + (context == "CD" ? "" : sourcesDir) + '</RootPath>' +
        '</Configuration>' +
        '</DataCollector>' +
        '</DataCollectors></DataCollectionRunSettings></RunSettings>';
    saveToFile(runSettingsForTIA, runSettingsExt)
        .then(function (fileName) {
            defer.resolve(fileName);
            return defer.promise;
        })
        .fail(function (err) {
            tl.debug(exitErrorMessage);
            tl.warning(err);
            defer.resolve(settingsFile);
        });
    return defer.promise;
}

function setupSettingsFileForTestImpact(vsVersion: number, settingsFile: string): Q.Promise<string> {
    var defer = Q.defer<string>();
    var exitErrorMessage = "Error occured while setting in test impact data collector. Continuing...";
    if (isTiaAllowed()) {
        if (settingsFile && settingsFile.split('.').pop().toLowerCase() == "testsettings") {
            updateTestSettingsFileForTestImpact(vsVersion, settingsFile, exitErrorMessage)
                .then(function (updatedFile) {
                    defer.resolve(updatedFile);
                    return defer.promise;
                });
        }
        else if (!settingsFile || settingsFile.split('.').pop().toLowerCase() != "runsettings" || !pathExistsAsFile(settingsFile)) {
            createRunSettingsForTestImpact(vsVersion, settingsFile, exitErrorMessage)
                .then(function (updatedFile) {
                    defer.resolve(updatedFile);
                    return defer.promise;
                });
        }
        else {
            updateRunSettingsFileForTestImpact(vsVersion, settingsFile, exitErrorMessage)
                .then(function (updatedFile) {
                    defer.resolve(updatedFile);
                    return defer.promise;
                });
        }
    }
    else {
        tl.debug("Settings are not sufficient for setting test impact. Not updating the settings file");
        defer.resolve(settingsFile);
    }
    return defer.promise;
}

function setupRunSettingsFileForParallel(runInParallel: boolean, settingsFile: string): Q.Promise<string> {
    var defer = Q.defer<string>();
    var exitErrorMessage = "Error occured while setting run in parallel. Continuing...";
    if (runInParallel) {
        if (settingsFile && settingsFile.split('.').pop().toLowerCase() == "testsettings") {
            tl.warning(tl.loc('RunInParallelNotSupported'));
            defer.resolve(settingsFile);
            return defer.promise;
        }

        if (!settingsFile || settingsFile.split('.').pop().toLowerCase() != "runsettings" || !pathExistsAsFile(settingsFile)) {
            tl.debug("No settings file provided or the provided settings file does not exist.");
            var runSettingsForParallel = '<?xml version="1.0" encoding="utf-8"?><RunSettings><RunConfiguration><MaxCpuCount>0</MaxCpuCount></RunConfiguration></RunSettings>';
            saveToFile(runSettingsForParallel, runSettingsExt)
                .then(function (fileName) {
                    defer.resolve(fileName);
                    return defer.promise;
                })
                .fail(function (err) {
                    tl.debug(exitErrorMessage);
                    tl.warning(err);
                    defer.resolve(settingsFile);
                });
        }
        else {
            tl.debug("Adding maxcpucount element to runsettings file provided.");
            readFileContents(settingsFile, "utf-8")
                .then(function (xmlContents) {
                    var parser = new xml2js.Parser();
                    parser.parseString(xmlContents, function (err, result) {
                        if (err) {
                            tl.warning(tl.loc('ErrorWhileReadingRunSettings', err));
                            tl.debug(exitErrorMessage);
                            defer.resolve(settingsFile);
                            return defer.promise;
                        }

                        if (result.RunSettings === undefined) {
                            tl.warning(tl.loc('FailedToSetRunInParallel'));
                            defer.resolve(settingsFile);
                            return defer.promise;
                        }

                        if (!result.RunSettings) {
                            result.RunSettings = { RunConfiguration: { MaxCpuCount: 0 } };
                        }
                        else if (!result.RunSettings.RunConfiguration || !result.RunSettings.RunConfiguration[0]) {
                            result.RunSettings.RunConfiguration = { MaxCpuCount: 0 };
                        }
                        else {
                            var runConfigArray = result.RunSettings.RunConfiguration[0];
                            runConfigArray.MaxCpuCount = 0;
                        }

                        var builder = new xml2js.Builder();
                        var runSettingsForParallel = builder.buildObject(result);
                        saveToFile(runSettingsForParallel, runSettingsExt)
                            .then(function (fileName) {
                                cleanUp(settingsFile);
                                defer.resolve(fileName);
                                return defer.promise;
                            })
                            .fail(function (err) {
                                tl.debug(exitErrorMessage);
                                tl.warning(err);
                                defer.resolve(settingsFile);
                            });
                    });
                })
                .fail(function (err) {
                    tl.warning(err);
                    tl.debug(exitErrorMessage);
                    defer.resolve(settingsFile);
                });
        }
    }
    else {
        defer.resolve(settingsFile);
    }

    return defer.promise;
}

function saveToFile(fileContents: string, extension: string): Q.Promise<string> {
    var defer = Q.defer<string>();
    var tempFile = path.join(os.tmpdir(), uuid.v1() + extension);
    fs.writeFile(tempFile, fileContents, function (err) {
        if (err) {
            defer.reject(err);
        }
        tl.debug("Temporary runsettings file created at " + tempFile);
        defer.resolve(tempFile);
    });
    return defer.promise;
}

function setRunInParallellIfApplicable(vsVersion: number) {
    if (runInParallel) {
        if (vstestLocationMethod.toLowerCase() === 'version') {
            if (!isNaN(vsVersion) && vsVersion >= 14) {
                if (vsVersion >= 15) { // moved away from taef
                    return;
                }

                // in 14.0 taef parellization needed taef enabled
                let vs14Common: string = tl.getVariable("VS140COMNTools");
                if (vs14Common && pathExistsAsFile(path.join(vs14Common, "..\\IDE\\CommonExtensions\\Microsoft\\TestWindow\\TE.TestModes.dll"))) {
                    setRegistryKeyForParallelExecution(vsVersion);
                    return;
                }
            }
            resetRunInParallel();
        }
        else if (vstestLocationMethod.toLowerCase() === 'location') {
            let vs14Common: string = tl.getVariable("VS140COMNTools");
            if (vs14Common && pathExistsAsFile(path.join(vs14Common, "..\\IDE\\CommonExtensions\\Microsoft\\TestWindow\\TE.TestModes.dll"))) {
                setRegistryKeyForParallelExecution(vsVersion);
                return;
            }
        }
    }
}

function resetRunInParallel() {
    tl.warning(tl.loc('UpdateOneOrHigherRequired'));
    runInParallel = false;
}

function locateVSVersion(): Q.Promise<number> {
    var defer = Q.defer<number>();
    var vsVersion = parseFloat(vsTestVersion);
    if (!isNaN(vsVersion)) {
        defer.resolve(vsVersion);
        return defer.promise;
    }
    var regPath = "HKLM\\SOFTWARE\\Microsoft\\VisualStudio";
    regedit.list(regPath).on('data', function (entry) {
        if (entry && entry.data && entry.data.keys) {
            var subkeys = entry.data.keys;
            var versions = getFloatsFromStringArray(subkeys);
            if (versions && versions.length > 0) {
                versions.sort((a, b) => a - b);
                defer.resolve(versions[versions.length - 1]);
                return defer.promise;
            }
        }
        defer.resolve(null);
    });
    return defer.promise;
}

function getFloatsFromStringArray(inputArray: string[]): number[] {
    var outputArray: number[] = [];
    var count;
    if (inputArray) {
        for (count = 0; count < inputArray.length; count++) {
            var floatValue = parseFloat(inputArray[count]);
            if (!isNaN(floatValue)) {
                outputArray.push(floatValue);
            }
        }
    }
    return outputArray;
}

function setRegistryKeyForParallelExecution(vsVersion: number) {
    var regKey = "HKCU\\SOFTWARE\\Microsoft\\VisualStudio\\" + vsVersion.toFixed(1) + "_Config\\FeatureFlags\\TestingTools\\UnitTesting\\Taef";
    regedit.createKey(regKey, function (err) {
        if (!err) {
            var values = {
                [regKey]: {
                    'Value': {
                        value: '1',
                        type: 'REG_DWORD'
                    }
                }
            };
            regedit.putValue(values, function (err) {
                if (err) {
                    tl.warning(tl.loc('ErrorOccuredWhileSettingRegistry', err));
                }
            });
        } else {
            tl.warning(tl.loc('ErrorOccuredWhileSettingRegistry', err));
        }
    });
}

function readFileContents(filePath: string, encoding: string): Q.Promise<string> {
    var defer = Q.defer<string>();

    fs.readFile(filePath, encoding, (err, data) => {
        if (err) {
            defer.reject(new Error('Could not read file (' + filePath + '): ' + err.message));
        }
        else {
            defer.resolve(data);
        }
    });

    return defer.promise;
}

function pathExistsAsFile(path: string) {
    return tl.exist(path) && tl.stats(path).isFile();
}

function pathExistsAsDirectory(path: string) {
    return tl.exist(path) && tl.stats(path).isDirectory();
}

function isEmptyResponseFile(responseFile: string): boolean {
    if (pathExistsAsFile(responseFile) && tl.stats(responseFile).size) {
        return false;
    }
    return true;
}

function isTiaAllowed(): boolean {
    if (tiaEnabled && getTestSelectorLocation()) {
        return true;
    }
    return false;
}

function getTIALevel() {
    if (fileLevel && fileLevel.toUpperCase() == "FALSE") {
        return "method";
    }
    return "file";
}

function responseContainsNoTests(filePath: string): Q.Promise<boolean> {
    return readFileContents(filePath, "utf-8").then(function (resp) {
        if (resp == "/Tests:") {
            return true;
        }
        else {
            return false;
        }
    });
}
