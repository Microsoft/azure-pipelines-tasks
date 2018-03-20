import  * as ma from 'vsts-task-lib/mock-answer';
import * as tmrm from 'vsts-task-lib/mock-run';
import * as tmt from 'vsts-task-lib/mock-task';
import * as constants from './Constants';
import * as path from 'path';

// Get the task path
const taskPath = path.join(__dirname, '..', 'seleniumwebdriverinstaller.js');
const tr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

// Set inputs

tr.setInput('chromeDriver', process.env[constants.chromeDriver]);
tr.setInput('chromeDriverVersion', process.env[constants.chromeDriverVersion]);
tr.setInput('firefoxDriver', process.env[constants.firefoxDriver]);
tr.setInput('firefoxDriverVersion', process.env[constants.firefoxDriverVersion]);
tr.setInput('ieDriver', process.env[constants.ieDriver]);
tr.setInput('ieDriverVersion', process.env[constants.ieDriverVersion]);
tr.setInput('edgeDriver', process.env[constants.edgeDriver]);
tr.setInput('edgeDriverVersion', process.env[constants.edgeDriverVersion]);

const downloadPath = process.env[constants.downloadPath];

// Mock task-tool-lib
const taskToolLibMock: any = {};
taskToolLibMock.findLocalTool = function(tool: string, version: string): string {

    if (process.env[constants.cacheHitReturnValue]) {
        tl.debug(`Cache hit for ${version}`);
        const retValue = process.env[constants.cacheHitReturnValue];
        return retValue;
    }

    tl.debug(`Cache miss for ${version}`);

    return null;
};
taskToolLibMock.cleanVersion = function(version: string): string {
    return version;
};
taskToolLibMock.cacheDir = function(toolRoot: string, packageName: string, version: string): string {
    return path.join(packageName, version);
};
tr.registerMock('vsts-task-tool-lib/tool', taskToolLibMock);


const downloadUtilityMock: any = {};
downloadUtilityMock.download = function(source: string, target: string): boolean {
    return true;
}
tr.registerMock('utility-common/downloadutility', downloadUtilityMock);

// Create mock for getVariable
const tl = require('vsts-task-lib/mock-task');
const tlClone = Object.assign({}, tl);
tlClone.getVariable = function(variable: string) {
    return process.env[variable];
};
tr.registerMock('vsts-task-lib/mock-task', tlClone);

// Start the run
tr.run();
