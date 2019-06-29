"use strict";
import * as path from 'path';

import * as tl from 'azure-pipelines-task-lib/task';
import { DotNetCoreVersionFetcher } from "./versionfetcher";
import { globalJsonFetcher } from "./globaljsonfetcher";
import { VersionInstaller } from "./versioninstaller";
import { Constants } from "./versionutilities";
import { VersionInfo, VersionParts } from "./models"
import { NuGetInstaller } from "./nugetinstaller";

async function run() {
    let useGlobalJson: boolean = tl.getBoolInput('useGlobalJson');
    let versionSpec = tl.getInput('version');
    const nugetVersion = tl.getInput('nugetVersion') || '4.4.1';

    // Check if we want install dotnet
    if (versionSpec || useGlobalJson) {
        let packageType = tl.getInput('packageType') || "sdk";
        let installationPath = tl.getInput('installationPath');
        let includePreviewVersions: boolean = tl.getBoolInput('includePreviewVersions');
        let workingDirectory: string | null = tl.getPathInput("workingDirectory", false) || null;
        let performMultiLevelLookup = tl.getBoolInput("performMultiLevelLookup", false);
        await installDotNet(installationPath, packageType, versionSpec, useGlobalJson, workingDirectory, includePreviewVersions, performMultiLevelLookup);
    }
    // Install NuGet version specified by user or 4.4.1 in case none is specified
    // Also sets up the proxy configuration settings.    
    await NuGetInstaller.installNuGet(nugetVersion);
}

/**
 * install dotnet to the installation path.
 * @param installationPath The installation path. If this is empty it would use {Agent.ToolsDirectory}/dotnet/
 * @param packageType The installation type for the installation. Only `sdk` and `runtime` are valid options
 * @param versionSpec The version the user want to install.
 * @param useGlobalJson A switch so we know if the user have `global.json` files and want use that.
 * @param workingDirectory This is only relevant if the `useGlobalJson` switch is `true`. It will set the root directory for the search of `global.json`
 * @param includePreviewVersions Define if the installer also search for preview version
 * @param performMultiLevelLookup Set the `DOTNET_MULTILEVEL_LOOKUP`environment variable
 */
async function installDotNet(
    installationPath: string,
    packageType: string,
    versionSpec: string | null,
    useGlobalJson: boolean,
    workingDirectory: string | null,
    includePreviewVersions: boolean,
    performMultiLevelLookup: boolean) {

    if (!installationPath && installationPath.length == 0) {
        installationPath = path.join(tl.getVariable('Agent.ToolsDirectory'), "dotnet");
    }
    let versionFetcher = new DotNetCoreVersionFetcher();
    let dotNetCoreInstaller = new VersionInstaller(packageType, installationPath);
    if (useGlobalJson) {
        let globalJsonFetcherInstance = new globalJsonFetcher(workingDirectory);
        let versionsToInstall: VersionInfo[] = await globalJsonFetcherInstance.Get(packageType);        
        versionsToInstall = versionsToInstall.filter(d => !dotNetCoreInstaller.isVersionInstalled(d.getVersion()));
        for (let index = 0; index < versionsToInstall.length; index++) {
            const version = versionsToInstall[index];
            let url = versionFetcher.getDownloadUrl(version);
            await dotNetCoreInstaller.downloadAndInstall(version, url);            
        }
    } else if (versionSpec) {
        console.log(tl.loc("ToolToInstall", packageType, versionSpec));
        let versionSpecParts = new VersionParts(versionSpec);        
        let versionInfo: VersionInfo = await versionFetcher.getVersionInfo(versionSpecParts.versionSpec, packageType, includePreviewVersions);
        if (!versionInfo) {
            throw tl.loc("MatchingVersionNotFound", versionSpecParts.versionSpec);
        }
        if (!dotNetCoreInstaller.isVersionInstalled(versionInfo.getVersion())) {
            await dotNetCoreInstaller.downloadAndInstall(versionInfo, versionFetcher.getDownloadUrl(versionInfo));
        }
    }else{
        throw tl.loc("installDotNetCalledWithWrongParameters")
    }

    tl.prependPath(installationPath);
    // Set DOTNET_ROOT for dotnet core Apphost to find runtime since it is installed to a non well-known location.
    tl.setVariable('DOTNET_ROOT', installationPath);
    // By default disable Multi Level Lookup unless user wants it enabled.
    tl.setVariable("DOTNET_MULTILEVEL_LOOKUP", !performMultiLevelLookup ? "0" : "1");
    // Add dot net tools path to "PATH" environment variables, so that tools can be used directly.
    addDotNetCoreToolPath();
}

function addDotNetCoreToolPath() {
    try {
        let globalToolPath: string = "";
        if (tl.osType().match(/^Win/)) {
            globalToolPath = path.join(process.env.USERPROFILE, Constants.relativeGlobalToolPath);
        } else {
            globalToolPath = path.join(process.env.HOME, Constants.relativeGlobalToolPath);
        }

        console.log(tl.loc("PrependGlobalToolPath"));
        tl.mkdirP(globalToolPath);
        tl.prependPath(globalToolPath);
    } catch (error) {
        //nop
        console.log(tl.loc("ErrorWhileSettingDotNetToolPath", JSON.stringify(error)));
    }
}

var taskManifestPath = path.join(__dirname, "task.json");
tl.debug("Setting resource path to " + taskManifestPath);
tl.setResourcePath(taskManifestPath);

run()
    .then(() => tl.setResult(tl.TaskResult.Succeeded, ""))
    .catch((error) => tl.setResult(tl.TaskResult.Failed, !!error.message ? error.message : error));