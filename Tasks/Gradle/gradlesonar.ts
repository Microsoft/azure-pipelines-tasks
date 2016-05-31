/// <reference path="../../definitions/vsts-task-lib.d.ts" />
/// <reference path="../../definitions/sonarqube-common.d.ts" />

import path = require('path');
import fs = require('fs');

import tl = require('vsts-task-lib/task');
import trm = require('vsts-task-lib/toolrunner');

// Lowercased file names are to lessen the likelihood of xplat issues
import sqCommon = require('sonarqube-common/sonarqube-common');
import {SonarQubeEndpoint} from 'sonarqube-common/sonarqube-common';

// Apply arguments to enable SonarQube analysis
export function applyEnabledSonarQubeArguments(gradleRun: trm.ToolRunner):trm.ToolRunner {
    if (!tl.getBoolInput('sqAnalysisEnabled')) {
        console.log("SonarQube analysis is not enabled");
        return gradleRun;
    }

    console.log("SonarQube analysis is enabled");

    // #1: Inject custom script to the Gradle build, triggering a SonarQube run
    // Add a custom initialisation script to the Gradle run that will apply the SonarQube plugin and task
    var initScriptPath:string = path.join(__dirname, 'sonar.gradle');

    // Specify that the build should run the init script
    gradleRun.arg(['-I', initScriptPath]);
    gradleRun.arg(['sonarqube']);

    // #2: Configure parameters to connect to the SonarQube server for reporting
    var sqEndpoint:SonarQubeEndpoint = sqCommon.getSonarQubeEndpointFromInput("sqConnectedServiceName");

    // SQ servers lower than 5.2 require additional parameters (null if not set / not required)
    if (tl.getBoolInput('sqDbDetailsRequired')) {
        var sqDbUrl = tl.getInput('sqDbUrl', false);
        var sqDbUsername = tl.getInput('sqDbUsername', false);
        var sqDbPassword = tl.getInput('sqDbPassword', false);
        gradleRun = sqCommon.applySonarQubeParams(gradleRun, sqEndpoint.Url, sqEndpoint.Username, sqEndpoint.Password, sqDbUrl, sqDbUsername, sqDbPassword);
    }
    else {
        gradleRun = sqCommon.applySonarQubeParams(gradleRun, sqEndpoint.Url, sqEndpoint.Username, sqEndpoint.Password);
    }

    return gradleRun;
}