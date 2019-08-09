import * as path from 'path';
import * as taskLib from 'azure-pipelines-task-lib/task';
import * as os from 'os';
import * as coveragePublisher from 'coveragepublisher/coveragepublisher';

// Main entry point of this task.
async function run() {
    try {
        // Initialize localization
        taskLib.setResourcePath(path.join(__dirname, 'task.json'));

        // Get input values
        const summaryFileLocations = taskLib.getInput('summaryFileLocations', true);
        const failIfCoverageIsEmpty: boolean = taskLib.getBoolInput('failIfCoverageEmpty');
        const workingDirectory: string = taskLib.getVariable('System.DefaultWorkingDirectory');
        const pathToSources: string = taskLib.getInput('pathToSources');

        var resolvedSummaryFiles = resolveSummaryFiles(workingDirectory, summaryFileLocations)

        await coveragePublisher.PublishCodeCoverage(resolvedSummaryFiles, pathToSources);

    } catch (err) {
        taskLib.setResult(taskLib.TaskResult.Failed, err);
    }
}

function resolveSummaryFiles(workingDirectory: string, summaryFiles: string): string[] {
    if(summaryFiles) {
        const summaryFilesArray = summaryFiles.trim().split('\n').filter((pattern) => pattern.trim() != "");
        const resolvedSummaryFiles: string[] = [];

        if(summaryFilesArray.length > 0) {
            summaryFilesArray.forEach(filePattern => {
                const findOptions: taskLib.FindOptions = { allowBrokenSymbolicLinks: false, followSymbolicLinks: false, followSpecifiedSymbolicLink: false };
                const pathMatches: string[] = taskLib.findMatch(
                    workingDirectory,
                    filePattern,
                    findOptions);
                
                taskLib.debug(taskLib.loc('FoundNMatchesForPattern', pathMatches.length, filePattern));

                pathMatches.forEach(path => {
                    if(pathExistsAsFile(path)) {
                        resolvedSummaryFiles.push(path);
                    }
                });
            });

            resolvedSummaryFiles.forEach(path => {
                console.log(path);
            })
        }
        else {
            return []
        }
    } else {
        return [];
    }
}

// Gets whether the specified path exists as file.
function pathExistsAsFile(path: string) {
    try {
        return taskLib.stats(path).isFile();
    } catch (error) {
        taskLib.debug(error);
        return false;
    }
}

run();
