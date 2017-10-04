import tl = require('vsts-task-lib/task');
const readline = require('readline');
const fs = require('fs');

// These fallback paths are checked if a XCODE_N_DEVELOPER_DIR environment variable is not found.
// Using the environment variable for resolution is preferable to these hardcoded paths.
const fallbackDeveloperDirs = {
    "8": "/Applications/Xcode_8.3.3.app/Contents/Developer",
    "9": "/Applications/Xcode_9.app/Contents/Developer"
};

export function setTaskState(variableName: string, variableValue: string) {
    if (agentSupportsTaskState()) {
        tl.setTaskVariable(variableName, variableValue);
    }
}

export function getTaskState(variableName: string) {
    if (agentSupportsTaskState()) {
        return tl.getTaskVariable(variableName);
    }
}

export function findDeveloperDir(xcodeVersion: string): string {
    tl.debug(tl.loc('LocateXcodeBasedOnVersion', xcodeVersion));

    // xcodeVersion should be in the form of "8" or "9".
    // envName for version 9.*.* would be "XCODE_9_DEVELOPER_DIR"
    var envName = `XCODE_${xcodeVersion}_DEVELOPER_DIR`;
    let discoveredDeveloperDir = tl.getVariable(envName);
    if (!discoveredDeveloperDir) {
        discoveredDeveloperDir = fallbackDeveloperDirs[xcodeVersion];

        if (discoveredDeveloperDir && !tl.exist(discoveredDeveloperDir)) {
            tl.debug(`Ignoring fallback developer path. ${discoveredDeveloperDir} doesn't exist.`);
            discoveredDeveloperDir = undefined;
        }

        if (!discoveredDeveloperDir) {
            throw new Error(tl.loc('FailedToLocateSpecifiedXcode', xcodeVersion, envName));
        }
    }

    return discoveredDeveloperDir;
}

export async function getProvisioningStyle(workspace: string) : Promise<string> {
    var provisioningStyle: string;

    if (workspace) {
        var pbxProjectPath = getPbxProjectPath(workspace);
        tl.debug(`pbxProjectPath is ${pbxProjectPath}`);

        if (pbxProjectPath) {
            provisioningStyle = await getProvisioningStyleFromPbxProject(pbxProjectPath);
            tl.debug(`pbxProjectPath provisioning style: ${provisioningStyle}`);
        }
    }

    return provisioningStyle;
}

function getPbxProjectPath(workspace: string) {
    if (workspace && workspace.trim().toLowerCase().endsWith('.xcworkspace')) {
        var pbxProjectPath: string = workspace.trim().toLowerCase().replace('.xcworkspace', '.pbxproj');

        if (pathExistsAsFile(pbxProjectPath)) {
            return pbxProjectPath;
        }
        else {
            tl.debug("Corresponding pbxProject file doesn't exist: " + pbxProjectPath);
        }
    }
}

function getProvisioningStyleFromPbxProject(pbxProjectPath) : Promise<string> {
    return new Promise((resolve, reject) => {
        const rl = readline.createInterface({
            input: fs.createReadStream(pbxProjectPath)
        });
        var firstProvisioningStyleFound = false;
        var linesExamined = 0;
        rl.on('line', (line) => {
            if (!firstProvisioningStyleFound) {
                linesExamined++;
                var trimmedLine = line.trim();
                if (trimmedLine === 'ProvisioningStyle = Automatic;') {
                    tl.debug(`first provisioning style line: ${line}`);
                    firstProvisioningStyleFound = true;
                    resolve("auto");
                }
                else if (trimmedLine === 'ProvisioningStyle = Manual;') {
                    tl.debug(`first provisioning style line: ${line}`);
                    firstProvisioningStyleFound = true;
                    resolve("manual");
                }
            }
        }).on('close', () => {
            if (!firstProvisioningStyleFound) {
                tl.debug(`close event occurred before a provisioning style was found in the pbxProject file. Lines examined: ${linesExamined}`);
                resolve(undefined);
            }
        });
    });
}

export function pathExistsAsFile(path: string) {
    try {
        return tl.stats(path).isFile();
    }
    catch (error) {
        return false;
    }
}

function agentSupportsTaskState() {
    var agentSupportsTaskState = true;
    try {
        tl.assertAgent('2.115.0');
    } catch (e) {
        agentSupportsTaskState = false;
    }
    return agentSupportsTaskState;
}
