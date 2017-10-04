import path = require('path');
import tl = require('vsts-task-lib/task');
import sign = require('ios-signing-common/ios-signing-common');
import utils = require('./xcodeutils');

import { ToolRunner } from 'vsts-task-lib/toolrunner';

async function run() {
    try {
        tl.setResourcePath(path.join(__dirname, 'task.json'));

        //--------------------------------------------------------
        // Tooling
        //--------------------------------------------------------

        var xcodeVersionSelection: string = tl.getInput('xcodeVersion', true);

        if (xcodeVersionSelection === 'specifyPath') {
            var devDir = tl.getInput('xcodeDeveloperDir', true);
            tl.setVariable('DEVELOPER_DIR', devDir);
        }
        else if (xcodeVersionSelection !== 'default') {
            // resolve the developer dir for a version like "8" or "9".
            var devDir = utils.findDeveloperDir(xcodeVersionSelection);
            tl.setVariable('DEVELOPER_DIR', devDir);
        }

        var tool: string = tl.which('xcodebuild', true);
        tl.debug('Tool selected: ' + tool);

        //--------------------------------------------------------
        // Paths
        //--------------------------------------------------------
        var workingDir: string = tl.getPathInput('cwd');
        tl.cd(workingDir);

        var outPath: string = tl.resolve(workingDir, tl.getInput('outputPattern', true)); //use posix implementation to resolve paths to prevent unit test failures on Windows
        tl.mkdirP(outPath);

        //--------------------------------------------------------
        // Xcode args
        //--------------------------------------------------------
        var ws: string = tl.getPathInput('xcWorkspacePath', false, false);
        if (tl.filePathSupplied('xcWorkspacePath')) {
            var workspaceMatches = tl.findMatch(workingDir, ws, { followSymbolicLinks: false, followSpecifiedSymbolicLink: false });
            tl.debug("Found " + workspaceMatches.length + ' workspaces matching.');

            if (workspaceMatches.length > 0) {
                ws = workspaceMatches[0];
                if (workspaceMatches.length > 1) {
                    tl.warning(tl.loc('MultipleWorkspacesFound', ws));
                }
            }
            else {
                throw tl.loc('WorkspaceDoesNotExist', ws);
            }
        }

        var isProject = false;
        if (ws && ws.trim().toLowerCase().endsWith('.xcodeproj')) {
            isProject = true;
        }

        var sdk: string = tl.getInput('sdk', false);
        var configuration: string = tl.getInput('configuration', false);
        var scheme: string = tl.getInput('scheme', false);
        var useXcpretty: boolean = tl.getBoolInput('useXcpretty', false);
        var actions: string[] = tl.getDelimitedInput('actions', ' ', true);
        var packageApp: boolean = tl.getBoolInput('packageApp', true);
        var args: string = tl.getInput('args', false);

        //--------------------------------------------------------
        // Exec Tools
        //--------------------------------------------------------

        // --- Xcode Version ---
        var xcv: ToolRunner = tl.tool(tool);
        xcv.arg('-version');
        var xcodeVersion: number = 0;
        xcv.on('stdout', (data) => {
            var match = data.toString().trim().match(/Xcode (.+)/g);
            tl.debug('match = ' + match);
            if (match) {
                var version: number = parseInt(match.toString().replace('Xcode', '').trim());
                tl.debug('version = ' + version);
                if (!isNaN(version)) {
                    xcodeVersion = version;
                }
            }
        });

        await xcv.exec();
        tl.debug('xcodeVersion = ' + xcodeVersion);

        // --- Xcode build arguments ---
        var xcb: ToolRunner = tl.tool(tool);
        xcb.argIf(sdk, ['-sdk', sdk]);
        xcb.argIf(configuration, ['-configuration', configuration]);
        if (ws && tl.filePathSupplied('xcWorkspacePath')) {
            xcb.argIf(isProject, '-project');
            xcb.argIf(!isProject, '-workspace');
            xcb.arg(ws);
        }
        xcb.argIf(scheme, ['-scheme', scheme]);
        xcb.arg(actions);
        if (actions.toString().indexOf('archive') < 0) {
            // redirect build output if archive action is not passed
            // xcodebuild archive produces an invalid archive if output is redirected
            xcb.arg('DSTROOT=' + tl.resolve(outPath, 'build.dst'));
            xcb.arg('OBJROOT=' + tl.resolve(outPath, 'build.obj'));
            xcb.arg('SYMROOT=' + tl.resolve(outPath, 'build.sym'));
            xcb.arg('SHARED_PRECOMPS_DIR=' + tl.resolve(outPath, 'build.pch'));
        }
        if (args) {
            xcb.line(args);
        }

        //--------------------------------------------------------
        // iOS signing and provisioning
        //--------------------------------------------------------
        var signStyle: string = tl.getInput('signStyle', true);
        var keychainToDelete: string;
        var profileToDelete: string;
        var xcode_codeSigningAllowed: string;
        var xcode_codeSignStyle: string;
        var xcode_otherCodeSignFlags: string;
        var xcode_codeSignIdentity: string;
        var xcode_provProfile: string;
        var xcode_devTeam: string;

        if (signStyle === 'nosign') {
            xcode_codeSigningAllowed = 'CODE_SIGNING_ALLOWED=NO';
        }
        else if (signStyle === 'manual') {
            xcode_codeSignStyle = 'CODE_SIGN_STYLE=Manual';

            var signIdentity: string = tl.getInput('iosSigningIdentity');
            if (signIdentity) {
                xcode_codeSignIdentity = 'CODE_SIGN_IDENTITY=' + signIdentity;
            }

            var provProfileUUID: string = tl.getInput('provProfileUuid');
            if (provProfileUUID) {
                xcode_provProfile = 'PROVISIONING_PROFILE=' + provProfileUUID;
            }
        }
        else if (signStyle === 'auto') {
            xcode_codeSignStyle = 'CODE_SIGN_STYLE=Automatic';

            var teamId: string = tl.getInput('teamId');
            if (teamId) {
                xcode_devTeam = 'DEVELOPMENT_TEAM=' + teamId;
            }
        }
        
        xcb.argIf(xcode_codeSigningAllowed, xcode_codeSigningAllowed);
        xcb.argIf(xcode_codeSignStyle, xcode_codeSignStyle);
        xcb.argIf(xcode_codeSignIdentity, xcode_codeSignIdentity);
        xcb.argIf(xcode_provProfile, xcode_provProfile);
        xcb.argIf(xcode_devTeam, xcode_devTeam);

        //--- Enable Xcpretty formatting if using xcodebuild ---
        if (useXcpretty) {
            var xcPrettyPath: string = tl.which('xcpretty', true);
            var xcPrettyTool: ToolRunner = tl.tool(xcPrettyPath);
            xcPrettyTool.arg(['-r', 'junit', '--no-color']);

            xcb.pipeExecOutputToTool(xcPrettyTool);
        }

        //--- Xcode Build ---
        await xcb.exec();

        //--------------------------------------------------------
        // Test publishing
        //--------------------------------------------------------
        var testResultsFiles: string;
        var publishResults: boolean = tl.getBoolInput('publishJUnitResults', false);

        if (publishResults) {
            if (!useXcpretty) {
                tl.warning(tl.loc('UseXcprettyForTestPublishing'));
            } else {
                testResultsFiles = tl.resolve(workingDir, '**/build/reports/junit.xml');
            }

            if (testResultsFiles && 0 !== testResultsFiles.length) {
                //check for pattern in testResultsFiles
                if (testResultsFiles.indexOf('*') >= 0 || testResultsFiles.indexOf('?') >= 0) {
                    tl.debug('Pattern found in testResultsFiles parameter');
                    var matchingTestResultsFiles: string[] = tl.findMatch(workingDir, testResultsFiles, { followSymbolicLinks: false, followSpecifiedSymbolicLink: false }, { matchBase: true });
                }
                else {
                    tl.debug('No pattern found in testResultsFiles parameter');
                    var matchingTestResultsFiles: string[] = [testResultsFiles];
                }

                if (!matchingTestResultsFiles) {
                    tl.warning(tl.loc('NoTestResultsFound', testResultsFiles));
                }

                var tp = new tl.TestPublisher("JUnit");
                tp.publish(matchingTestResultsFiles, false, "", "", "", true);
            }
        }

        //--------------------------------------------------------
        // Package app to generate .ipa
        //--------------------------------------------------------
        if (tl.getBoolInput('packageApp', true) && sdk !== 'iphonesimulator') {
            // use xcodebuild to create the app package
            if (!scheme) {
                throw tl.loc("SchemeRequiredForArchive");
            }
            if (!ws || !tl.filePathSupplied('xcWorkspacePath')) {
                throw tl.loc("WorkspaceOrProjectRequiredForArchive");
            }

            // create archive
            var xcodeArchive: ToolRunner = tl.tool(tl.which('xcodebuild', true));
            if (ws && tl.filePathSupplied('xcWorkspacePath')) {
                xcodeArchive.argIf(isProject, '-project');
                xcodeArchive.argIf(!isProject, '-workspace');
                xcodeArchive.arg(ws);
            }
            xcodeArchive.argIf(scheme, ['-scheme', scheme]);
            xcodeArchive.arg('archive'); //archive action
            xcodeArchive.argIf(sdk, ['-sdk', sdk]);
            xcodeArchive.argIf(configuration, ['-configuration', configuration]);
            var archivePath: string = tl.getInput('archivePath');
            var archiveFolderRoot: string;
            if (!archivePath.endsWith('.xcarchive')) {
                archiveFolderRoot = archivePath;
                archivePath = tl.resolve(archivePath, scheme);
            } else {
                //user specified a file path for archivePath
                archiveFolderRoot = path.dirname(archivePath);
            }
            xcodeArchive.arg(['-archivePath', archivePath]);
            xcodeArchive.argIf(xcode_otherCodeSignFlags, xcode_otherCodeSignFlags);
            xcodeArchive.argIf(xcode_codeSigningAllowed, xcode_codeSigningAllowed);            
            xcodeArchive.argIf(xcode_codeSignStyle, xcode_codeSignStyle);            
            xcodeArchive.argIf(xcode_codeSignIdentity, xcode_codeSignIdentity);
            xcodeArchive.argIf(xcode_provProfile, xcode_provProfile);
            xcodeArchive.argIf(xcode_devTeam, xcode_devTeam);
            if (args) {
                xcodeArchive.line(args);
            }

            if (useXcpretty) {
                var xcPrettyTool: ToolRunner = tl.tool(tl.which('xcpretty', true));
                xcPrettyTool.arg('--no-color');
                xcodeArchive.pipeExecOutputToTool(xcPrettyTool);
            }
            await xcodeArchive.exec();

            var archiveFolders: string[] = tl.findMatch(archiveFolderRoot, '**/*.xcarchive', { followSymbolicLinks: false, followSpecifiedSymbolicLink: false });
            if (archiveFolders && archiveFolders.length > 0) {
                tl.debug(archiveFolders.length + ' archives found for exporting.');

                //export options plist
                var exportOptions: string = tl.getInput('exportOptions');
                var exportMethod: string;
                var exportTeamId: string;
                var exportOptionsPlist: string;
                var archiveToCheck: string = archiveFolders[0];
                var embeddedProvProfiles: string[] = tl.findMatch(archiveToCheck, '**/embedded.mobileprovision', { followSymbolicLinks: false, followSpecifiedSymbolicLink: false });

                if (exportOptions === 'auto') {
                    // Automatically try to detect the export-method to use from the provisioning profile
                    // embedded in the .xcarchive file
                    if (embeddedProvProfiles && embeddedProvProfiles.length > 0) {
                        tl.debug('embedded prov profile = ' + embeddedProvProfiles[0]);
                        exportMethod = await sign.getProvisioningProfileType(embeddedProvProfiles[0]);
                        tl.debug('Using export method = ' + exportMethod);
                    }
                    if (!exportMethod) {
                        tl.warning(tl.loc('ExportMethodNotIdentified'));
                    }
                } else if (exportOptions === 'specify') {
                    exportMethod = tl.getInput('exportMethod', true);
                    exportTeamId = tl.getInput('exportTeamId');
                } else if (exportOptions === 'plist') {
                    exportOptionsPlist = tl.getInput('exportOptionsPlist');
                    if (!tl.filePathSupplied('exportOptionsPlist') || !utils.pathExistsAsFile(exportOptionsPlist)) {
                        throw tl.loc('ExportOptionsPlistInvalidFilePath', exportOptionsPlist);
                    }
                }

                if (exportMethod) {
                    // generate the plist file if we have an exportMethod set from exportOptions = auto or specify
                    var plist: string = tl.which('/usr/libexec/PlistBuddy', true);
                    exportOptionsPlist = '_XcodeTaskExportOptions.plist';
                    tl.tool(plist).arg(['-c', 'Clear', exportOptionsPlist]).execSync();
                    tl.tool(plist).arg(['-c', 'Add method string ' + exportMethod, exportOptionsPlist]).execSync();
                    if (exportTeamId) {
                        tl.tool(plist).arg(['-c', 'Add teamID string ' + exportTeamId, exportOptionsPlist]).execSync();
                    }

                    if (xcodeVersion >= 9 && exportOptions === 'auto') {
                        var signStyleForExport = signStyle;

                        // If we're using the project defaults, scan the pbxProject file for the type of signing being used.
                        if (signStyleForExport === 'default') {
                            signStyleForExport = await utils.getProvisioningStyle(ws);

                            if (!signStyleForExport) {
                                tl.warning(tl.loc('CantDetermineProvisioningStyle'));
                            }
                        }

                        if (signStyleForExport === 'manual') {
                            // Xcode 9 manual signing, set code sign style = manual
                            tl.tool(plist).arg(['-c', 'Add signingStyle string ' + 'manual', exportOptionsPlist]).execSync();

                            // add provisioning profiles to the exportOptions plist
                            // find bundle Id from Info.plist and prov profile name from the embedded profile in each .app package
                            tl.tool(plist).arg(['-c', 'Add provisioningProfiles dict', exportOptionsPlist]).execSync();

                            for (let i = 0; i < embeddedProvProfiles.length; i++) {
                                let embeddedProvProfile: string = embeddedProvProfiles[i];
                                let profileName: string = await sign.getProvisioningProfileName(embeddedProvProfile);
                                tl.debug('embedded provisioning profile = ' + embeddedProvProfile + ', profile name = ' + profileName);

                                let embeddedInfoPlist: string = tl.resolve(path.dirname(embeddedProvProfile), 'Info.plist');
                                let bundleId: string = await sign.getBundleIdFromPlist(embeddedInfoPlist);
                                tl.debug('embeddedInfoPlist path = ' + embeddedInfoPlist + ', bundle identifier = ' + bundleId);

                                if (!profileName || !bundleId) {
                                    throw tl.loc('FailedToGenerateExportOptionsPlist');
                                }

                                tl.tool(plist).arg(['-c', 'Add provisioningProfiles:' + bundleId + ' string ' + profileName, exportOptionsPlist]).execSync();
                            }
                        }
                    }
                }

                //export path
                var exportPath: string = tl.getInput('exportPath');
                if (!exportPath.endsWith('.ipa')) {
                    exportPath = tl.resolve(exportPath, '_XcodeTaskExport_' + scheme);
                }
                // delete if it already exists, otherwise export will fail
                if (tl.exist(exportPath)) {
                    tl.rmRF(exportPath);
                }

                for (var i = 0; i < archiveFolders.length; i++) {
                    var archive: string = archiveFolders.pop();

                    //export the archive
                    var xcodeExport: ToolRunner = tl.tool(tl.which('xcodebuild', true));
                    xcodeExport.arg(['-exportArchive', '-archivePath', archive]);
                    xcodeExport.arg(['-exportPath', exportPath]);
                    xcodeExport.argIf(exportOptionsPlist, ['-exportOptionsPlist', exportOptionsPlist]);
                    var exportArgs: string = tl.getInput('exportArgs');
                    xcodeExport.argIf(exportArgs, exportArgs);

                    if (useXcpretty) {
                        var xcPrettyTool: ToolRunner = tl.tool(tl.which('xcpretty', true));
                        xcPrettyTool.arg('--no-color');
                        xcodeExport.pipeExecOutputToTool(xcPrettyTool);
                    }
                    await xcodeExport.exec();
                }
            }
        }
        tl.setResult(tl.TaskResult.Succeeded, tl.loc('XcodeSuccess'));
    }
    catch (err) {
        tl.setResult(tl.TaskResult.Failed, err);
    }
}

run();
