import ma = require('vsts-task-lib/mock-answer');
import tmrm = require('vsts-task-lib/mock-run');

export class NpmMockHelper {
    static NpmCmdPath = "C:\\Program Files (x86)\\nodejs\\npm";
    static NpmAuthPath = "C:\\tool\\vsts-npm-auth\\vsts-npm-auth.exe";
    static FakeWorkingDirectory = "fake\\wd";

    public answers: ma.TaskLibAnswers = {};
    
    constructor(
        private tmr: tmrm.TaskMockRunner,
        public command: string,
        public args: string) { 
        NpmMockHelper.setVariable('Agent.HomeDirectory', 'c:\\agent\\home\\directory');
        NpmMockHelper.setVariable('Build.SourcesDirectory', 'c:\\agent\\home\\directory\\sources');
        process.env['ENDPOINT_AUTH_SYSTEMVSSCONNECTION'] = "{\"parameters\":{\"AccessToken\":\"token\"},\"scheme\":\"OAuth\"}";
        process.env['ENDPOINT_URL_SYSTEMVSSCONNECTION'] = "https://example.visualstudio.com/defaultcollection";
        NpmMockHelper.setVariable('System.DefaultWorkingDirectory', 'c:\\agent\\home\\directory');
        NpmMockHelper.setVariable('System.TeamFoundationCollectionUri', 'https://example.visualstudio.com/defaultcollection');
        NpmMockHelper.setVariable('Agent.BuildDirectory', 'c:\\agent\\work\\build');
        NpmMockHelper.setVariable('Build.BuildId', '12345');

        tmr.setInput('cwd', NpmMockHelper.FakeWorkingDirectory);
        tmr.setInput('command', command);
        tmr.setInput('arguments', args);

        this.setDefaultAnswers();
    }

    public run(result: ma.TaskLibAnswerExecResult = null) {
        if (result) {
            let command = `${NpmMockHelper.NpmCmdPath} ${this.command}`;
            if (this.args) {
                command += " " + this.args;
            }
            this.setExecResponse(command, result);
        }
        this.tmr.setAnswers(this.answers);
        this.tmr.run();
    }

    public useDeprecatedTask() {
        process.env['USE_DEPRECATED_TASK_VERSION'] = 'true';
    }

    public mockAuthHelper() {
        this.setToolPath(this.answers, "vsts-npm-auth", NpmMockHelper.NpmAuthPath);

        let command = `${NpmMockHelper.NpmAuthPath} -NonInteractive -Verbosity Detailed -Config ${NpmMockHelper.FakeWorkingDirectory}\\.npmrc -TargetConfig ${process.env['AGENT_BUILDDIRECTORY']}\\npm\\auth.${process.env['BUILD_BUILDID']}.npmrc`;
        this.setExecResponse(command, { code: 0, stdout: "", stderr: "" });
    }

    public mockNpmConfigList() {
        let command = `${NpmMockHelper.NpmCmdPath} config list`;
        if (this.isDebugging()) {
            // add option to dump all default values
            command += " -l";
        }
        this.setExecResponse(command, { code: 0, stdout: "; cli configs", stderr: "" });
    }

    public setDebugState(isDebugging: boolean) {
        NpmMockHelper.setVariable('system.debug', isDebugging ? 'true' : 'false');
    }

    private static setVariable(name: string, value: string) {
        let key = NpmMockHelper.getVariableKey(name);
        process.env[key] = value;
    }

    private static getVariableKey(name: string) {
        let key = name.replace(/\./g, '_').toUpperCase();
        return key;
    }

    private setExecResponse(command: string, result:ma.TaskLibAnswerExecResult) {
        // let mtm = require('vsts-task-lib/mock-task');
        // mtm.debug(`mocking 'exec' call: ${command}`);
        if (!this.answers.exec) {
            this.answers.exec = {};
        }

        this.answers.exec[command] = result;
    }

    private isDebugging() {
        let value = process.env[NpmMockHelper.getVariableKey('system.debug')];
        return value === 'true';
    }

    private setDefaultAnswers() {
        this.setToolPath(this.answers, "npm", NpmMockHelper.NpmCmdPath);
    }

    private setToolPath(answers: ma.TaskLibAnswers, tool: string, path: string) {
        if (!answers.which) {
            answers.which = {};
        }
        answers.which[tool] = path;
        if (!answers.checkPath) {
            answers.checkPath = {};
        }
        answers.checkPath[path] = true;
    }
}