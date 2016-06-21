/// <reference path="../../../definitions/vsts-task-lib.d.ts" />

import path = require('path');
import fs = require('fs');
import util = require('util');

import tl = require('vsts-task-lib/task');
import {ToolRunner} from 'vsts-task-lib/toolrunner';

import {TaskReport} from  './taskreport';

export const toolName: string = 'SonarQube';

// Simple data class for a SonarQube generic endpoint
export class SonarQubeEndpoint {
    constructor(public Url: string, public Username: string, public Password: string) {
    }
}

// Returns true if SonarQube integration is enabled.
export function isSonarQubeAnalysisEnabled(): boolean {
    var result = tl.getBoolInput('sqAnalysisEnabled', false);
    if (result) {
        tl.debug(tl.loc('codeAnalysis_ToolIsEnabled', toolName));
    }
    return result;
}

// Applies required parameters for connecting a Java-based plugin (Maven, Gradle) to SonarQube.
// sqDbUrl, sqDbUsername and sqDbPassword are required if the SonarQube version is less than 5.2.
export function applySonarQubeConnectionParams(toolRunner: ToolRunner, sqHostUrl, sqHostUsername, sqHostPassword, sqDbUrl?, sqDbUsername?, sqDbPassword?): ToolRunner {
    toolRunner.arg('-Dsonar.host.url=' + sqHostUrl);
    toolRunner.arg('-Dsonar.login=' + sqHostUsername);
    toolRunner.arg('-Dsonar.password=' + sqHostPassword);

    if (sqDbUrl) {
        toolRunner.arg('-Dsonar.jdbc.url=' + sqDbUrl);
    }
    if (sqDbUsername) {
        toolRunner.arg('-Dsonar.jdbc.username=' + sqDbUsername);
    }
    if (sqDbPassword) {
        toolRunner.arg('-Dsonar.jdbc.password=' + sqDbPassword);
    }

    return toolRunner;
}

// Applies parameters for manually specifying the project name, key and version to SonarQube.
// This will override any user settings.
export function applySonarQubeAnalysisParams(toolRunner: ToolRunner, sqProjectName?, sqProjectKey?, sqProjectVersion?): ToolRunner {
    if (sqProjectName) {
        toolRunner.arg('-Dsonar.projectName=' + sqProjectName);
    }
    if (sqProjectKey) {
        toolRunner.arg('-Dsonar.projectKey=' + sqProjectKey);
    }
    if (sqProjectVersion) {
        toolRunner.arg('-Dsonar.projectVersion=' + sqProjectVersion);
    }

    return toolRunner;
}

// Run SQ analysis in issues mode, but only in PR builds
export function applySonarQubeIssuesModeInPrBuild(toolrunner: ToolRunner) {

    if (isPrBuild()) {
        console.log(tl.loc('sqAnalysis_IncrementalMode'));

        toolrunner.arg("-Dsonar.analysis.mode=issues");
        toolrunner.arg("-Dsonar.report.export.path=sonar-report.json");
    }
    else
    {
        tl.debug("Running a full SonarQube analysis");
    }

    return toolrunner;
}

// Gets SonarQube connection endpoint details.
export function getSonarQubeEndpointFromInput(inputFieldName): SonarQubeEndpoint {
    var errorMessage = "Could not decode the generic endpoint. Please ensure you are running the latest agent (min version 0.3.2)";
    if (!tl.getEndpointUrl) {
        throw new Error(errorMessage);
    }

    var genericEndpoint = tl.getInput(inputFieldName);
    if (!genericEndpoint) {
        throw new Error(errorMessage);
    }

    var hostUrl = tl.getEndpointUrl(genericEndpoint, false);
    if (!hostUrl) {
        throw new Error(errorMessage);
    }

    // Currently the username and the password are required, but in the future they will not be mandatory
    // - so not validating the values here
    var hostUsername = getSonarQubeAuthParameter(genericEndpoint, 'username');
    var hostPassword = getSonarQubeAuthParameter(genericEndpoint, 'password');

    return new SonarQubeEndpoint(hostUrl, hostUsername, hostPassword);
}

// Upload a build summary with links to available SonarQube dashboards for further analysis details.
export function uploadSonarQubeBuildSummary(sqBuildFolder: string): void {
    // Save and upload build summary
    // Looks like: "[Detailed SonarQube report >](https://mySQserver:9000/dashboard/index/foo "foo Dashboard")"
    var buildSummaryContents:string = createSonarQubeBuildSummary(sqBuildFolder);

    var buildSummaryFilePath = saveSonarQubeBuildSummary(buildSummaryContents);

    tl.debug('Uploading build summary from ' + buildSummaryFilePath);

    tl.command('task.addattachment', {
        'type': 'Distributedtask.Core.Summary',
        'name': tl.loc('sqAnalysis_BuildSummaryTitle')
    }, buildSummaryFilePath);
}

// Gets a SonarQube authentication parameter from the specified connection endpoint.
// The endpoint stores the auth details as JSON. Unfortunately the structure of the JSON has changed through time, namely the keys were sometimes upper-case.
// To work around this, we can perform case insensitive checks in the property dictionary of the object. Note that the PowerShell implementation does not suffer from this problem.
// See https://github.com/Microsoft/vso-agent/blob/bbabbcab3f96ef0cfdbae5ef8237f9832bef5e9a/src/agent/plugins/release/artifact/jenkinsArtifact.ts for a similar implementation
function getSonarQubeAuthParameter(endpoint, paramName) {

    var paramValue = null;
    var auth = tl.getEndpointAuthorization(endpoint, false);

    if (auth.scheme != "UsernamePassword") {
        throw new Error("The authorization scheme " + auth.scheme + " is not supported for a SonarQube endpoint. Please use a username and a password.");
    }

    var parameters = Object.getOwnPropertyNames(auth['parameters']);

    var keyName;
    parameters.some(function (key) {

        if (key.toLowerCase() === paramName.toLowerCase()) {
            keyName = key;

            return true;
        }
    });

    if (keyName) {
        paramValue = auth['parameters'][keyName];
    }

    return paramValue;
}

// Returns true if this build was triggered in response to a PR
//
// Remark: this logic is temporary until the platform provides a more robust way of determining PR builds; 
// Note that PR builds are only supported on TfsGit
function isPrBuild(): boolean {
    let sourceBranch: string = tl.getVariable('build.sourceBranch');
    let sccProvider: string = tl.getVariable('build.repository.provider');

    tl.debug("Source Branch: " + sourceBranch);
    tl.debug("Scc Provider: " + sccProvider);

    return !isNullOrEmpty(sccProvider) &&
        sccProvider.toLowerCase() === "tfsgit" &&
        !isNullOrEmpty(sourceBranch) &&
        sourceBranch.toLowerCase().startsWith("refs/pull/");
}

function isNullOrEmpty(str) {
    return str === undefined || str === null || str.length === 0;
}

// Creates the string that comprises the build summary text, given the location of the /sonar build folder.
function createSonarQubeBuildSummary(sqBuildFolder: string): string {
    var taskReport: TaskReport = getSonarQubeTaskReport(sqBuildFolder);
    if (!taskReport) {
        throw new Error(tl.loc('sqAnalysis_TaskReportInvalid'));
    }

    return util.format('[%s >](%s "%s Dashboard")',
        tl.loc('sqAnalysisBuildSummaryLine_OneProject'), taskReport.dashboardUrl, taskReport.projectKey);
}

// Returns the location of the SonarQube integration staging directory.
export /* public for test purposes */ function getSonarQubeStagingDirectory(): string {
    var sqStagingDir = path.join(tl.getVariable('build.artifactStagingDirectory'), ".sqAnalysis");
    tl.mkdirP(sqStagingDir);
    return sqStagingDir;
}

// Returns, as an object, the contents of the 'report-task.txt' file created by SonarQube plugins
// The returned object contains the following properties:
//   projectKey, serverUrl, dashboardUrl, ceTaskId, ceTaskUrl
function getSonarQubeTaskReport(sonarPluginFolder: string): TaskReport {
    var reportFilePath:string = path.join(sonarPluginFolder, 'report-task.txt');
    if (!tl.exist(reportFilePath)) {
        tl.debug('Task report not found at: ' + reportFilePath);
        return null;
    }

    return createTaskReportFromFile(reportFilePath);
}

// Constructs a map out of an existing report-task.txt file. File must exist on disk.
function createTaskReportFromFile(taskReportFile: string): TaskReport {
    var reportFileString: string = fs.readFileSync(taskReportFile, 'utf-8');
    if (!reportFileString) {
        return null;
    }

    var reportLines: string[] = reportFileString.replace(/\r\n/g, '\n').split('\n'); // proofs against xplat line-ending issues

    var reportMap = new Map<string, string>();
    reportLines.forEach((reportLine:string) => {
        var splitLine: string[] = reportLine.split('=');
        if (splitLine.length > 1) {
            reportMap.set(splitLine[0], splitLine.slice(1, splitLine.length).join());
        }
    });

    var result:TaskReport;
    try {
        return result = TaskReport.createTaskReportFromMap(reportMap);
    } catch (err) {
        tl.debug(err.message);
        throw new Error(tl.loc('sqAnalysis_TaskReportInvalid'));
    }
}

// Saves the build summary string and returns the file path it was saved to.
function saveSonarQubeBuildSummary(contents: string): string {
    var filePath:string = path.join(getSonarQubeStagingDirectory(), 'SonarQubeBuildSummary.md');
    fs.writeFileSync(filePath, contents);
    return filePath;
}