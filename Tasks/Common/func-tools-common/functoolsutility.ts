"use strict";

import * as fs from 'fs';
import * as os from 'os';
import * as util from 'util';
import * as tl from "azure-pipelines-task-lib/task";
import * as toolLib from 'azure-pipelines-tool-lib/tool';
import * as path from "path";

const funcToolName = 'func';
const stableFuncToolsVersion = '2.7.1585';

function getExecutableExtension(): string {
    if (os.type().match(/^Win/)) {
        return '.exe';
    }

    return '';
}

function getDownloadUrl(version: string) {
    let downloadUrlFormat = 'https://github.com/Azure/azure-functions-core-tools/releases/download/%s/Azure.Functions.Cli.%s.%s.zip';
    switch (os.type()) {
        case 'Linux':
            return util.format(downloadUrlFormat, version, 'linux-x64', version);

        case 'Darwin':
            return util.format(downloadUrlFormat, version, 'osx-x64', version);

        case 'Windows_NT':
        default:
            return util.format(downloadUrlFormat, version, 'win-x86', version);

    }
}

export async function getLatestFuncToolsVersion(): Promise<string> {
    const funcToolsLatestReleaseUrl = 'https://api.github.com/repos/Azure/azure-functions-core-tools/releases/latest';
    let latestVersion = stableFuncToolsVersion;

    try {
        const downloadPath = await toolLib.downloadTool(funcToolsLatestReleaseUrl);
        const response = JSON.parse(fs.readFileSync(downloadPath, 'utf8').toString().trim());
        if (response.tag_name) {
            latestVersion = response.tag_name;
        }
    } catch (error) {
        tl.warning(tl.loc('ErrorFetchingLatestVersion', funcToolsLatestReleaseUrl, error, stableFuncToolsVersion));
    }

    return latestVersion;
}

export async function downloadFuncTools(version: string): Promise<string> {
        let cachedToolpath = toolLib.findLocalTool(funcToolName, version);
        
        if (!cachedToolpath) {
            const downloadUrl = getDownloadUrl(version);
            let downloadPath;
            try {
                downloadPath = await toolLib.downloadTool(downloadUrl);
            }
            catch (ex) {
                throw new Error(tl.loc('FuncDownloadFailed', downloadUrl, ex));
            }
            
            tl.debug('Extracting the downloaded func tool zip..');
            const unzippedFuncPath = await toolLib.extractZip(downloadPath);
            cachedToolpath = await toolLib.cacheDir(unzippedFuncPath, funcToolName, version);
            console.log(tl.loc("SuccessfullyDownloaded", version, cachedToolpath));
        } else {
            console.log(tl.loc("VersionAlreadyInstalled", version, cachedToolpath));
        }

        const funcPath = path.join(cachedToolpath, funcToolName + getExecutableExtension());
        fs.chmodSync(funcPath, '777');
        return funcPath;
}