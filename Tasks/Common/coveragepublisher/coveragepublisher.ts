
import * as toolRunner from 'azure-pipelines-task-lib/toolrunner';
import * as taskLib from 'azure-pipelines-task-lib/task';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as UUID from 'uuid/v4';

export async function PublishCodeCoverage(inputFiles: string[], sourceDirectory?: string) {
    var reportDirectory = path.join(getTempFolder(), UUID());
    fs.mkdirSync(reportDirectory);
    publishCoverage(inputFiles, reportDirectory, sourceDirectory)
}

async function publishCoverage(inputFiles: string[], reportDirectory: string, pathToSources?: string) {

    if(!inputFiles || inputFiles.length == 0) {
        return;
    }

    const osvar = process.platform;
    let dotnet: toolRunner.ToolRunner;

    const dotnetPath = taskLib.which('dotnet', false);
    if (!dotnetPath && osvar !== 'win32') {
        taskLib.warning(taskLib.loc('InstallDotNetCoreForHtmlReport'));
        return false;
    }

    if (!dotnetPath && osvar === 'win32') {
        // use full .NET to execute
        dotnet = taskLib.tool(path.join(__dirname, 'CoveragePublisher', 'CoveragePublisher.Console.exe'));
    } else {
        dotnet = taskLib.tool(dotnetPath);
        dotnet.arg(path.join(__dirname, "CoveragePublisher", 'CoveragePublisher.Console.dll'));
    }

    dotnet.arg(inputFiles.join(" "));
    dotnet.arg('--reportDirectory ' + reportDirectory);

    if(!isNullOrWhitespace(pathToSources)) {
        dotnet.arg('--sourceDirectory ' + pathToSources);
    }

    try {
        await dotnet.exec({
            env: {
                "SYSTEM_ACCESSTOKEN": taskLib.getEndpointAuthorizationParameter('SystemVssConnection', 'AccessToken', false)
            },
            ignoreReturnCode: true,
            failOnStdErr: false,
            windowsVerbatimArguments: true,
            errStream: {
                write: (data) => {
                    taskLib.warning(data);
                }
            },
            outStream: process.stdout
        } as any);

    } catch (err) {
        taskLib.warning(taskLib.loc('ErrorWhilePublishing') + err);
    }
}


function isNullOrWhitespace(input: any) {
    if (typeof input === 'undefined' || input == null) {
        return true;
    }
    return input.replace(/\s/g, '').length < 1;
}

function getTempFolder(): string {
    try {
        taskLib.assertAgent('2.115.0');
        const tmpDir = taskLib.getVariable('Agent.TempDirectory');
        return tmpDir;
    } catch (err) {
        taskLib.warning(taskLib.loc('UpgradeAgentMessage'));
        return os.tmpdir();
    }
}
