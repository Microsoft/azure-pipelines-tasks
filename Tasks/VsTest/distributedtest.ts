import * as fs from 'fs';
import * as path from 'path';
import * as ps from 'child_process';
import * as tl from 'vsts-task-lib/task';
import * as tr from 'vsts-task-lib/toolrunner';
import * as models from './models';
import * as settingsHelper from './settingshelper';
import * as utils from './helpers';
import * as ta from './testagent';
import * as versionFinder from './versionfinder';
import * as os from 'os';
import * as ci from './cieventlogger';
import {TestSelectorInvoker} from './testselectorinvoker';

const uuid = require('uuid');

const testSelector = new TestSelectorInvoker();

export class DistributedTest {
    constructor(dtaTestConfig: models.DtaTestConfigurations) {
        this.dtaPid = -1;
        this.dtaTestConfig = dtaTestConfig;
        this.testSourcesFile = null;
    }

    public runDistributedTest() {
        this.publishCodeChangesIfRequired();
        this.registerAndConfigureAgent();
    }

    private publishCodeChangesIfRequired(): void {
        if (this.dtaTestConfig.tiaConfig.tiaEnabled) {
            const code = testSelector.publishCodeChanges(this.dtaTestConfig.tiaConfig, null, this.dtaTestConfig.taskInstanceIdentifier); //todo: enable custom engine

            if (code !== 0) {
                tl.warning(tl.loc('ErrorWhilePublishingCodeChanges'));
            }
        }
    }

    private async registerAndConfigureAgent() {
        tl.debug('Configure the Agent with DTA... Invoking the createAgent REST API');

        try {
            const agentId = await ta.TestAgent.createAgent(this.dtaTestConfig.dtaEnvironment, 3);
            ci.publishEvent({ environmenturi: this.dtaTestConfig.dtaEnvironment.environmentUri, agentid: agentId,
                agentsize: this.dtaTestConfig.numberOfAgentsInPhase, vsTestConsole: this.dtaTestConfig.useVsTestConsole,
                batchsize: this.dtaTestConfig.numberOfTestCasesPerSlice});

            await this.startDtaExecutionHost(agentId);
            await this.startDtaTestRun();
            try {
                if (this.dtaPid !== -1) {
                    tl.debug('Trying to kill the Modules/DTAExecutionHost.exe process with pid :' + this.dtaPid);
                    process.kill(this.dtaPid);
                }
            } catch (error) {
                tl.warning('Modules/DTAExecutionHost.exe process kill failed, pid: ' + this.dtaPid + ' , error :' + error);
            }
            tl.setResult(tl.TaskResult.Succeeded, 'Task succeeded');
        } catch (error) {
            ci.publishEvent({ environmenturi: this.dtaTestConfig.dtaEnvironment.environmentUri, error: error});
            tl.error(error);
            tl.setResult(tl.TaskResult.Failed, error);
        }
    }

    private async startDtaExecutionHost(agentId: any) {
        const envVars: { [key: string]: string; } = process.env;
        utils.Helper.addToProcessEnvVars(envVars, 'DTA.AccessToken', this.dtaTestConfig.dtaEnvironment.patToken);
        utils.Helper.addToProcessEnvVars(envVars, 'DTA.AgentId', agentId);
        utils.Helper.addToProcessEnvVars(envVars, 'DTA.AgentName', this.dtaTestConfig.dtaEnvironment.agentName);
        utils.Helper.addToProcessEnvVars(envVars, 'DTA.EnvironmentUri', this.dtaTestConfig.dtaEnvironment.environmentUri);
        utils.Helper.addToProcessEnvVars(envVars, 'DTA.TeamFoundationCollectionUri', this.dtaTestConfig.dtaEnvironment.tfsCollectionUrl);
        this.testSourcesFile = this.createTestSourcesFile();
        utils.Helper.addToProcessEnvVars(envVars, 'DTA.MiniMatchTestSourcesFile', this.testSourcesFile);
        utils.Helper.addToProcessEnvVars(envVars, 'DTA.LocalTestDropPath', this.dtaTestConfig.testDropLocation);
        utils.Helper.addToProcessEnvVars(envVars, 'DTA.EnableConsoleLogs', 'true');
        utils.Helper.addToProcessEnvVars(envVars, 'DTA.UseVsTestConsole', this.dtaTestConfig.useVsTestConsole);
        utils.Helper.addToProcessEnvVars(envVars, 'DTA.TestPlatformVersion', this.dtaTestConfig.vsTestVersion);
        if (this.dtaTestConfig.pathtoCustomTestAdapters) {
            const testAdapters = tl.findMatch(this.dtaTestConfig.pathtoCustomTestAdapters, '**\\*TestAdapter.dll');
            if (!testAdapters || (testAdapters && testAdapters.length === 0)) {
                tl.warning(tl.loc('pathToCustomAdaptersContainsNoAdapters', this.dtaTestConfig.pathtoCustomTestAdapters));
            }
            utils.Helper.addToProcessEnvVars(envVars, 'DTA.CustomTestAdapters', this.dtaTestConfig.pathtoCustomTestAdapters);
        }

        // If we are setting the path version is not needed
        const exelocation = path.dirname(this.dtaTestConfig.vsTestVersionDetais.vstestExeLocation);
        tl.debug('Adding env var DTA.TestWindow.Path = ' + exelocation);

        // Split the TestWindow path out of full path - if we can't find it, will assume
        // that this is nuget/xcopyable package where the dlls are present in test window folder
        const testWindowRelativeDir = 'CommonExtensions\\Microsoft\\TestWindow';
        if (exelocation && exelocation.indexOf(testWindowRelativeDir) !== -1) {
            const ideLocation = exelocation.split(testWindowRelativeDir)[0];
            tl.debug('Adding env var DTA.VisualStudio.Path = ' + ideLocation);
            utils.Helper.addToProcessEnvVars(envVars, 'DTA.VisualStudio.Path', ideLocation);
        } else {
            utils.Helper.addToProcessEnvVars(envVars, 'DTA.VisualStudio.Path', exelocation);
        }
        utils.Helper.addToProcessEnvVars(envVars, 'DTA.TestWindow.Path', exelocation);

        // We are logging everything to a DTAExecutionHost.exe.log file and reading it at the end and adding to the build task debug logs
        // So we are not redirecting the IO streams from the DTAExecutionHost.exe process
        // We are not using toolrunner here because it doesn't have option to ignore the IO stream, so directly using spawn

        const proc = ps.spawn(path.join(__dirname, 'Modules/DTAExecutionHost.exe'), [], { env: envVars });
        this.dtaPid = proc.pid;
        tl.debug('Modules/DTAExecutionHost.exe is executing with the process id : ' + this.dtaPid);

        proc.stdout.setEncoding('utf8');
        proc.stderr.setEncoding('utf8');
        proc.stdout.on('data', (c) => {
            // this is bit hacky way to fix the web method logging as it's not configurable currently
            // and writes info to stdout directly
            const lines = c.toString().split('\n');
            lines.forEach(function (line: string) {
                if (line.trim().length === 0) {
                    return;
                }
                if (line.startsWith('Web method')) {
                    console.log('##vso[task.debug]' + line);
                } else {
                    console.log(line);
                }
            });
        });

        proc.stderr.on('data', (c) => {
            const lines = c.toString().split('\n');
            lines.forEach(function (line: string) {
                console.error(line);
            });
        });

        proc.on('error', (err) => {
            this.cleanUpDtaExeHost();
            throw new Error('Failed to start Modules/DTAExecutionHost.exe.');
        });

        proc.on('close', (code) => {
            if (code !== 0) {
                tl.debug('Modules/DTAExecutionHost.exe process exited with code ' + code);
            } else {
                tl.debug('Modules/DTAExecutionHost.exe exited');
            }
            this.cleanUpDtaExeHost();
        });
    }

    private cleanUpDtaExeHost() {
        try {
            if (this.testSourcesFile) {
                tl.rmRF(this.testSourcesFile);
            }
        } catch (error) {
            //Ignore.
        }
        this.dtaPid = -1;
    }

    private createTestSourcesFile() : string {
        try {
            const sources = tl.findMatch(this.dtaTestConfig.testDropLocation, this.dtaTestConfig.sourceFilter);
            tl.debug('tl match count :' + sources.length);
            const filesMatching = [];
            sources.forEach(function(match: string) {
                if (!fs.lstatSync(match).isDirectory()) {
                    filesMatching.push(match);
                }
            });

            tl.debug('Files matching count :' + filesMatching.length);
            if (filesMatching.length === 0) {
                throw new Error(tl.loc('noTestSourcesFound', this.dtaTestConfig.sourceFilter.toString()));
            }

            const tempFile = path.join(os.tmpdir(), 'testSources_' + uuid.v1() + '.src');
            fs.writeFileSync(tempFile, filesMatching.join(os.EOL));
            tl.debug('Test Sources file :' + tempFile);
            return tempFile;
        } catch (error) {
            throw new Error(tl.loc('testSourcesFilteringFailed', error));
        }
    }

    private async startDtaTestRun() {
        const runDistributesTestTool = tl.tool(path.join(__dirname, 'modules/TestExecutionHost.exe'));
        const envVars: { [key: string]: string; } = process.env;
        utils.Helper.addToProcessEnvVars(envVars, 'accesstoken', this.dtaTestConfig.dtaEnvironment.patToken);
        utils.Helper.addToProcessEnvVars(envVars, 'environmenturi', this.dtaTestConfig.dtaEnvironment.environmentUri);
        utils.Helper.addToProcessEnvVars(envVars, 'sourcefilter', this.dtaTestConfig.sourceFilter.join('|'));
        //Modify settings file to enable configurations and data collectors.
        let settingsFile = this.dtaTestConfig.settingsFile;
        try {
            settingsFile = await settingsHelper.updateSettingsFileAsRequired
                (this.dtaTestConfig.settingsFile, this.dtaTestConfig.runInParallel, this.dtaTestConfig.tiaConfig,
                null, false, this.dtaTestConfig.overrideTestrunParameters, true);
            //Reset override option so that it becomes a no-op in TaskExecutionHost
            this.dtaTestConfig.overrideTestrunParameters = null;
        } catch (error) {
            tl.warning(tl.loc('ErrorWhileUpdatingSettings'));
            tl.debug(error);
        }

        utils.Helper.addToProcessEnvVars(envVars, 'testcasefilter', this.dtaTestConfig.testcaseFilter);
        utils.Helper.addToProcessEnvVars(envVars, 'runsettings', settingsFile);
        utils.Helper.addToProcessEnvVars(envVars, 'testdroplocation', this.dtaTestConfig.testDropLocation);
        utils.Helper.addToProcessEnvVars(envVars, 'testrunparams', this.dtaTestConfig.overrideTestrunParameters);
        utils.Helper.addToProcessEnvVars(envVars, 'buildconfig', this.dtaTestConfig.buildConfig);
        utils.Helper.addToProcessEnvVars(envVars, 'buildplatform', this.dtaTestConfig.buildPlatform);
        utils.Helper.addToProcessEnvVars(envVars, 'testconfigurationmapping', this.dtaTestConfig.testConfigurationMapping);
        utils.Helper.addToProcessEnvVars(envVars, 'testruntitle', this.dtaTestConfig.testRunTitle);
        utils.Helper.addToProcessEnvVars(envVars, 'testselection', this.dtaTestConfig.testSelection);
        utils.Helper.addToProcessEnvVars(envVars, 'tcmtestrun', this.dtaTestConfig.onDemandTestRunId);
        if (!utils.Helper.isNullOrUndefined(this.dtaTestConfig.testSuites)) {
            utils.Helper.addToProcessEnvVars(envVars, 'testsuites', this.dtaTestConfig.testSuites.join(','));
        }
        utils.Helper.setEnvironmentVariableToString(envVars, 'codecoverageenabled', this.dtaTestConfig.codeCoverageEnabled);
        utils.Helper.setEnvironmentVariableToString(envVars, 'testplan', this.dtaTestConfig.testplan);
        utils.Helper.setEnvironmentVariableToString(envVars, 'testplanconfigid', this.dtaTestConfig.testPlanConfigId);
        // In the phases world we will distribute based on number of agents
        utils.Helper.setEnvironmentVariableToString(envVars, 'customslicingenabled', 'true');
        utils.Helper.setEnvironmentVariableToString(envVars, 'maxagentphaseslicing', this.dtaTestConfig.numberOfAgentsInPhase.toString());
        tl.debug("Type of batching" + this.dtaTestConfig.batchingType);
        const isTimeBasedBatching = (this.dtaTestConfig.batchingType === models.BatchingType.TestExecutionTimeBased);
        tl.debug("isTimeBasedBatching : "+ isTimeBasedBatching);
        utils.Helper.setEnvironmentVariableToString(envVars, 'istimebasedslicing',  isTimeBasedBatching.toString());
        if (isTimeBasedBatching && this.dtaTestConfig.runningTimePerBatchInMs) {
            tl.debug("[RunStatistics] Run Time per batch" + this.dtaTestConfig.runningTimePerBatchInMs);
            utils.Helper.setEnvironmentVariableToString(envVars, 'slicetime',  this.dtaTestConfig.runningTimePerBatchInMs.toString());
        }
        if (this.dtaTestConfig.numberOfTestCasesPerSlice) {
            utils.Helper.setEnvironmentVariableToString(envVars, 'numberoftestcasesperslice',
                        this.dtaTestConfig.numberOfTestCasesPerSlice.toString());
        }

        await runDistributesTestTool.exec(<tr.IExecOptions>{ cwd: path.join(__dirname, 'modules'), env: envVars });
        await this.cleanUp(settingsFile);
        tl.debug('Run Distributed Test finished');
    }

    private async cleanUp(temporarySettingsFile: string) {
        //cleanup the runsettings file
        if (temporarySettingsFile && this.dtaTestConfig.settingsFile !== temporarySettingsFile) {
            try {
                tl.rmRF(temporarySettingsFile);
            } catch (error) {
                //Ignore.
            }
        }
    }
    private dtaTestConfig: models.DtaTestConfigurations;
    private dtaPid: number;
    private testSourcesFile: string;
}