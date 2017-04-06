import * as ngToolRunner from "nuget-task-common/NuGetToolRunner";
import * as nutil from "nuget-task-common/Utility";
import * as tl from "vsts-task-lib/task";
// Remove once task lib 2.0.4 releases
global['_vsts_task_lib_loaded'] = true;
import * as path from "path";
import * as auth from "nuget-task-common/Authentication";

import locationHelpers = require("nuget-task-common/LocationHelpers");
import nuGetGetter = require("nuget-task-common/NuGetToolGetter");
import peParser = require('nuget-task-common/pe-parser/index');

class NuGetExecutionOptions {
    constructor(
        public nuGetPath: string,
        public environment: ngToolRunner.NuGetEnvironmentSettings,
        public command: string,
        public args: string
    ) { }
}

async function main(): Promise<void> {
    let buildIdentityDisplayName: string = null;
    let buildIdentityAccount: string = null;
    
    let versionSpec: string = tl.getInput("versionSpec", true);
    let command: string = tl.getInput("command", true);
    let args: string = tl.getInput("arguments", false);
    let nuGetPath: string = await nuGetGetter.getNuGet(versionSpec);
    const version = await peParser.getFileVersionInfoAsync(nuGetPath);
    if(version.productVersion.a < 3 || (version.productVersion.a <= 3 && version.productVersion.b < 5))
    {
        throw new Error(tl.loc("Info_NuGetSupportedAfter3_5", version.strings.ProductVersion));
    }

    try {
        tl.setResourcePath(path.join(__dirname, "task.json"));
        
        nutil.setConsoleCodePage();

        let credProviderPath = nutil.locateCredentialProvider();

        // Clauses ordered in this way to avoid short-circuit evaluation, so the debug info printed by the functions
        // is unconditionally displayed
        const quirks = await ngToolRunner.getNuGetQuirksAsync(nuGetPath);
        const useCredProvider = ngToolRunner.isCredentialProviderEnabled(quirks) && credProviderPath;
        // useCredConfig not placed here: This task will only support NuGet versions >= 3.5.0 which support credProvider both hosted and OnPrem

        let accessToken = auth.getSystemAccessToken();
        let serviceUri = tl.getEndpointUrl("SYSTEMVSSCONNECTION", false);
        let urlPrefixes = await locationHelpers.assumeNuGetUriPrefixes(serviceUri);
        tl.debug(`Discovered URL prefixes: ${urlPrefixes}`);

        // Note to readers: This variable will be going away once we have a fix for the location service for
        // customers behind proxies
        let testPrefixes = tl.getVariable("NuGetTasks.ExtraUrlPrefixesForTesting");
        if (testPrefixes) {
            urlPrefixes = urlPrefixes.concat(testPrefixes.split(";"));
            tl.debug(`All URL prefixes: ${urlPrefixes}`);
        }

        const authInfo = new auth.NuGetAuthInfo(urlPrefixes, accessToken);
        let environmentSettings: ngToolRunner.NuGetEnvironmentSettings = {
            authInfo: authInfo,
            credProviderFolder: useCredProvider ? path.dirname(credProviderPath) : null,
            extensionsDisabled: true
        };

        let executionOptions = new NuGetExecutionOptions(
            nuGetPath,
            environmentSettings,
            command,
            args);
            
        await runNuGetAsync(executionOptions);
    } catch (err) {
        tl.error(err);

        if (buildIdentityDisplayName || buildIdentityAccount) {
            tl.warning(tl.loc("BuildIdentityPermissionsHint", buildIdentityDisplayName, buildIdentityAccount));
        }
    }
}

main();

function runNuGetAsync(executionOptions: NuGetExecutionOptions): Q.Promise<number> {
    let nugetTool = ngToolRunner.createNuGetToolRunner(executionOptions.nuGetPath, executionOptions.environment);
    nugetTool.arg(executionOptions.command);
    nugetTool.arg("-NonInteractive");

    if (executionOptions.args) {
        nugetTool.line(executionOptions.args);
    }

    return nugetTool.exec();
}
