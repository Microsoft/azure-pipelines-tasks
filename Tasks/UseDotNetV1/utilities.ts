import { chmodSync } from 'fs';
import { IExecOptions } from 'azure-pipelines-task-lib/toolrunner';

import * as auth from 'packaging-common/nuget/Authentication';
import * as commandHelper from 'packaging-common/nuget/CommandHelper';
import * as nutil from 'packaging-common/nuget/Utility';
import * as pkgLocationUtils from 'packaging-common/locationUtilities';
import * as tl from 'azure-pipelines-task-lib/task';

export function getCurrentDir(): string {
    return __dirname;
}

export function setFileAttribute(file: string, mode: string): void {
    chmodSync(file, mode);
}

export function setProxy() {
    const proxyUrl = tl.getVariable("agent.proxyurl");
    const proxyUsername = tl.getVariable("agent.proxyusername");
    const proxyPassword = tl.getVariable("agent.proxypassword");

    if (!proxyUrl) {
        throw new Error('Agent proxy is not set.');
    }

    const nugetPath = tl.which('nuget');

    // Set proxy url
    let nuget = tl.tool(nugetPath);
    nuget.arg('config');
    nuget.arg('--set');
    nuget.arg('http_proxy=' + proxyUrl);
    nuget.exec({} as IExecOptions);

    // Set proxy username
    nuget = tl.tool(nugetPath);
    nuget.arg('config');
    nuget.arg('--set');
    nuget.arg('http_proxy.user=' + proxyUsername);
    nuget.exec({} as IExecOptions);

    // Set proxy password
    nuget = tl.tool(nugetPath);
    nuget.arg('config');
    nuget.arg('--set');
    nuget.arg('http_proxy.password=' + proxyPassword);
    nuget.exec({} as IExecOptions);
}

export async function addInternalFeed(feedName: string) {
    // Get feed info
    let packagingLocation: pkgLocationUtils.PackagingLocation;
    try {
        packagingLocation = await pkgLocationUtils.getPackagingUris(pkgLocationUtils.ProtocolType.NuGet);
    } catch (error) {
        tl.debug('Unable to get packaging URIs, using default collection URI');
        tl.debug(JSON.stringify(error));
        const collectionUrl: string = tl.getVariable('System.TeamFoundationCollectionUri');
        packagingLocation = {
            PackagingUris: [collectionUrl],
            DefaultPackagingUri: collectionUrl
        };
    }
    const accessToken: string = pkgLocationUtils.getSystemAccessToken();
    const feedUri = await nutil.getNuGetFeedRegistryUrl(packagingLocation.DefaultPackagingUri, feedName, null, accessToken, true);

    addNugetFeed(feedName, feedUri, 'VSTS');
}

export async function addExternalFeed(feedName: string) {
    const externalAuthArr = commandHelper.GetExternalAuthInfoArray('externalEndpoint');
    const externalAuth = externalAuthArr[0];

    if (!externalAuth) {
        tl.setResult(tl.TaskResult.Failed, tl.loc('Error_NoSourceSpecifiedForPush'));
        return;
    }

    const feedUri = externalAuth.packageSource.feedUri;

    const authType: auth.ExternalAuthType = externalAuth.authType;
    let apiKey = '';
    let additionalArgs: Array<string> = [];
    switch (authType) {
        case (auth.ExternalAuthType.UsernamePassword):
            const usernameInfo = externalAuth as auth.UsernamePasswordExternalAuthInfo;
            additionalArgs = ['-UserName', usernameInfo.username, '-Password', usernameInfo.password];
            break;
        case (auth.ExternalAuthType.Token):
            apiKey = 'RequiredApiKey';
            break;
        case (auth.ExternalAuthType.ApiKey):
            const apiKeyAuthInfo = externalAuth as auth.ApiKeyExternalAuthInfo;
            apiKey = apiKeyAuthInfo.apiKey;
            break;
        default:
            break;
    }

    addNugetFeed(feedName, feedUri, apiKey, additionalArgs);
}

function addNugetFeed(feedName: string, feedUri: string, apiKey: string = '', additionalArgs: Array<string> = []) {
    const nugetPath = tl.which('nuget');

    // Add feed
    let nuget = tl.tool(nugetPath);
    nuget.arg('sources');
    nuget.arg('Add');
    
    nuget.arg('-Name');
    nuget.arg(feedName);
    
    nuget.arg('-Source');
    nuget.arg(feedUri);

    additionalArgs.forEach(arg => {
        nuget.arg(arg);
    });

    nuget.arg('-NonInteractive');

    nuget.exec({} as IExecOptions);

    if (apiKey) {
        nuget = tl.tool(nugetPath);
        nuget.arg('setapikey');
        nuget.arg(apiKey);

        nuget.arg('-Source');
        nuget.arg(feedUri);

        nuget.arg('-NonInteractive');

        nuget.exec({} as IExecOptions);
    }
}