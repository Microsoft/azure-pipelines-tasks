import { IExecSyncResult } from 'vsts-task-lib/toolrunner';
import path = require("path");
import tl = require("vsts-task-lib/task");
import fs = require("fs");
import util = require("util");
import os = require("os");

export class azureclitask {
    public static checkIfAzurePythonSdkIsInstalled() {
        return !!tl.which("az", false);
    }

    public static async runMain() {
        var toolExecutionError = null;
        try {
            var tool;
            if (os.type() != "Windows_NT") {
                tool = tl.tool(tl.which("bash", true));
            }

            var scriptLocation: string = tl.getInput("scriptLocation");
            var scriptPath: string = null;
            var cwd: string = tl.getPathInput("cwd", true, false);

            if (scriptLocation === "scriptPath") {
                scriptPath = tl.getPathInput("scriptPath", true, true);
                // if user didn"t supply a cwd (advanced), then set cwd to folder script is in.
                // All "script" tasks should do this
                if (!tl.filePathSupplied("cwd")) {
                    cwd = path.dirname(scriptPath);
                }
            }
            else {
                var script: string = tl.getInput("inlineScript", true);
                scriptPath = path.join(tl.getVariable('Agent.TempDirectory'), "azureclitaskscript" + new Date().getTime());
                if (os.type() != "Windows_NT") {
                    scriptPath = scriptPath + ".sh";
                }
                else {
                    scriptPath = scriptPath + ".bat";
                }
                this.createFile(scriptPath, script);
            }

            var args = tl.getInput("args", false);

            // determines whether output to stderr will fail a task.
            // some tools write progress and other warnings to stderr.  scripts can also redirect.
            var failOnStdErr = tl.getBoolInput("failOnStandardError", false);

            tl.mkdirP(cwd);
            tl.cd(cwd);

            if (os.type() != "Windows_NT") {
                tool.arg(scriptPath);
            }
            else {
                tool = tl.tool(tl.which(scriptPath, true));
            }
            this.throwIfError(tl.execSync("az", "--version"));
            this.loginAzure();

            tool.line(args); // additional args should always call line. line() parses quoted arg strings
            await tool.exec({ failOnStdErr: failOnStdErr });
        }
        catch (err) {
            if (err.stderr) {
                toolExecutionError = err.stderr;
            }
            else {
                toolExecutionError = err;
            }
            //go to finally and logout of azure and set task result
        }
        finally {
            if (scriptLocation === "inlineScript") {
                this.deleteFile(scriptPath);
            }

            if (this.cliPasswordPath) {
                tl.debug('Removing spn certificate file');
                tl.rmRF(this.cliPasswordPath);
            }

            //Logout of Azure if logged in
            if (this.isLoggedIn) {
                this.logoutAzure();
            }

            if (this.azCliConfigPath) {
                tl.rmRF(this.azCliConfigPath);
            }

            //set the task result to either succeeded or failed based on error was thrown or not
            if (toolExecutionError) {
                tl.setResult(tl.TaskResult.Failed, tl.loc("ScriptFailed", toolExecutionError));
            }
            else {
                tl.setResult(tl.TaskResult.Succeeded, tl.loc("ScriptReturnCode", 0));
            }
        }
    }

    private static isLoggedIn: boolean = false;
    private static cliPasswordPath: string = null;
    private static azCliConfigPath: string;

    private static loginAzure() {
        var connectedService: string = tl.getInput("connectedServiceNameARM", true);
        this.loginAzureRM(connectedService);
    }

    private static loginAzureRM(connectedService: string): void {
        var servicePrincipalId: string = tl.getEndpointAuthorizationParameter(connectedService, "serviceprincipalid", false);
        let authType: string = tl.getEndpointAuthorizationParameter(connectedService, 'authenticationType', true);
        let cliPassword: string = null;
        if (authType == "spnCertificate") {
            tl.debug('certificate based endpoint');
            let certificateContent: string = tl.getEndpointAuthorizationParameter(connectedService, "servicePrincipalCertificate", false);
            cliPassword = path.join(tl.getVariable('Agent.TempDirectory') || tl.getVariable('system.DefaultWorkingDirectory'), 'spnCert.pem');
            fs.writeFileSync(cliPassword, certificateContent);
            this.cliPasswordPath = cliPassword;

        }
        else {
            tl.debug('key based endpoint');
            cliPassword = tl.getEndpointAuthorizationParameter(connectedService, "serviceprincipalkey", false);
        }

        var tenantId: string = tl.getEndpointAuthorizationParameter(connectedService, "tenantid", false);
        var subscriptionID: string = tl.getEndpointDataParameter(connectedService, "SubscriptionID", true);

        // set az cli config dir
        this.setConfigDirectory();

        //login using svn
        this.throwIfError(tl.execSync("az", "login --service-principal -u \"" + servicePrincipalId + "\" -p \"" + cliPassword + "\" --tenant \"" + tenantId + "\""), tl.loc("LoginFailed"));
        this.isLoggedIn = true;
        //set the subscription imported to the current subscription
        this.throwIfError(tl.execSync("az", "account set --subscription \"" + subscriptionID + "\""), tl.loc("ErrorInSettingUpSubscription"));
    }

    private static setConfigDirectory(): void {
        var configDirName: string = "config" + new Date().getTime();
        this.azCliConfigPath = path.join(tl.getVariable('Agent.TempDirectory'), ".azclitask", configDirName);
        process.env['AZURE_CONFIG_DIR'] = this.azCliConfigPath;
    }

    private static logoutAzure() {
        try {
            tl.execSync("az", " account clear");
        }
        catch (err) {
            // task should not fail if logout doesn`t occur
            tl.warning(tl.loc("FailedToLogout"));
        }
    }

    private static throwIfError(resultOfToolExecution: IExecSyncResult, errormsg?: string): void {
        if (resultOfToolExecution.code != 0) {
            tl.error("Error Code: [" + resultOfToolExecution.code + "]");
            if (errormsg) {
                tl.error("Error: " + errormsg);
            }
            throw resultOfToolExecution;
        }
    }

    private static createFile(filePath: string, data: string) {
        try {
            fs.writeFileSync(filePath, data);
        }
        catch (err) {
            this.deleteFile(filePath);
            throw err;
        }
    }

    private static deleteFile(filePath: string): void {
        if (fs.existsSync(filePath)) {
            try {
                //delete the publishsetting file created earlier
                fs.unlinkSync(filePath);
            }
            catch (err) {
                //error while deleting should not result in task failure
                console.error(err.toString());
            }
        }
    }
}

tl.setResourcePath(path.join(__dirname, "task.json"));

if (!azureclitask.checkIfAzurePythonSdkIsInstalled()) {
    tl.setResult(tl.TaskResult.Failed, tl.loc("AzureSDKNotFound"));
}

azureclitask.runMain();
