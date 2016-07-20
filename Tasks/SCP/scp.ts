/// <reference path="../../definitions/vsts-task-lib.d.ts" />

import path = require('path');
import tl = require('vsts-task-lib/task');
import os = require('os');
import fs = require('fs');
import Q = require('q');
import sshCommon = require('ssh-common/ssh-common');
import {SshHelper} from 'ssh-common/ssh-common';

function getFilesToCopy(sourceFolder, contents: string []) : string [] {
    // include filter
    var includeContents: string[] = [];
    // exclude filter
    var excludeContents: string[] = [];

    for (var i: number = 0; i < contents.length; i++){
        var pattern = contents[i].trim();
        var negate: Boolean = false;
        var negateOffset: number = 0;
        for (var j = 0; j < pattern.length && pattern[j] === '!'; j++){
            negate = !negate;
            negateOffset++;
        }

        if(negate){
            tl.debug('exclude content pattern: ' + pattern);
            var realPattern = pattern.substring(0, negateOffset) + path.join(sourceFolder, pattern.substring(negateOffset));
            excludeContents.push(realPattern);
        }
        else{
            tl.debug('include content pattern: ' + pattern);
            var realPattern = path.join(sourceFolder, pattern);
            includeContents.push(realPattern);
        }
    }

    // enumerate all files
    var files: string[] = [];
    var allPaths: string[] = tl.find(sourceFolder);
    var allFiles: string[] = [];

    // remove folder path
    for (var i: number = 0; i < allPaths.length; i++) {
        if (!tl.stats(allPaths[i]).isDirectory()) {
            allFiles.push(allPaths[i]);
        }
    }

    // if we only have exclude filters, we need add a include all filter, so we can have something to exclude.
    if(includeContents.length == 0 && excludeContents.length > 0) {
        includeContents.push('**');
    }

    if (includeContents.length > 0 && allFiles.length > 0) {
        tl.debug("allFiles contains " + allFiles.length + " files");

        // a map to eliminate duplicates
        var map = {};

        // minimatch options
        var matchOptions = { matchBase: true };
        if(os.type().match(/^Win/))
        {
            matchOptions["nocase"] = true;
        }

        // apply include filter
        for (var i: number = 0; i < includeContents.length; i++) {
            var pattern = includeContents[i];
            tl.debug('Include matching ' + pattern);

            // let minimatch do the actual filtering
            var matches: string[] = tl.match(allFiles, pattern, matchOptions);

            tl.debug('Include matched ' + matches.length + ' files');
            for (var j: number = 0; j < matches.length; j++) {
                var matchPath = matches[j];
                if (!map.hasOwnProperty(matchPath)) {
                    map[matchPath] = true;
                    files.push(matchPath);
                }
            }
        }

        // apply exclude filter
        for (var i: number = 0; i < excludeContents.length; i++) {
            var pattern = excludeContents[i];
            tl.debug('Exclude matching ' + pattern);

            // let minimatch do the actual filtering
            var matches: string[] = tl.match(files, pattern, matchOptions);

            tl.debug('Exclude matched ' + matches.length + ' files');
            files = [];
            for (var j: number = 0; j < matches.length; j++) {
                var matchPath = matches[j];
                files.push(matchPath);
            }
        }
    }
    else {
        tl.debug("Either includeContents or allFiles is empty");
    }

    return files;
}

async function run() {
    var sshHelper : SshHelper;
    try {
        tl.setResourcePath(path.join(__dirname, 'task.json'));

        //read SSH endpoint input
        var sshEndpoint = tl.getInput('sshEndpoint', true);
        var username:string = tl.getEndpointAuthorizationParameter(sshEndpoint, 'username', false);
        var password:string = tl.getEndpointAuthorizationParameter(sshEndpoint, 'password', true); //passphrase is optional
        var privateKey:string = tl.getEndpointDataParameter(sshEndpoint, 'privateKey', true); //private key is optional, password can be used for connecting
        var hostname:string = tl.getEndpointDataParameter(sshEndpoint, 'host', false);
        var port:string = tl.getEndpointDataParameter(sshEndpoint, 'port', true); //port is optional, will use 22 as default port if not specified
        if (!port || port === '') {
            tl._writeLine(tl.loc('UseDefaultPort'));
            port = '22';
        }

        //setup the SSH connection configuration based on endpoint details
        var sshConfig;
        if (privateKey && privateKey !== '') {
            tl.debug('Using private key for ssh connection.');
            sshConfig = {
                host: hostname,
                port: port,
                username: username,
                privateKey: privateKey,
                passphrase: password
            }
        } else {
            //use password
            tl.debug('Using username and password for ssh connection.');
            sshConfig = {
                host: hostname,
                port: port,
                username: username,
                password: password
            }
        }

        // contents is a multiline input containing glob patterns
        var contents:string[] = tl.getDelimitedInput('contents', '\n', true);
        var sourceFolder:string = tl.getPathInput('sourceFolder', true, true);
        var targetFolder:string = tl.getInput('targetFolder', true);

        // read the copy options
        var cleanTargetFolder:boolean = tl.getBoolInput('cleanTargetFolder', false);
        var overwrite:boolean = tl.getBoolInput('overwrite', false);
        var flattenFolders:boolean = tl.getBoolInput('flattenFolders', false);

        if(!tl.stats(sourceFolder).isDirectory()) {
            tl.setResult(tl.TaskResult.Failed, 'Source folder has to be a directory.');
            throw 'Source folder has to be a directory.';
        }

        //initialize the SSH helpers
        sshHelper = new sshCommon.SshHelper(sshConfig);

        if(cleanTargetFolder) {
            tl._writeLine(tl.loc('CleanTargetFolder', targetFolder));
            var cleanTargetFolderCmd = 'rm -rf "' + targetFolder + path.posix.sep + '*"';
            try {
                await sshHelper.runCommandOnRemoteMachine(cleanTargetFolderCmd, null);
            } catch (err) {
                tl.setResult(tl.TaskResult.Failed, tl.loc('CleanTargetFolderFailed', err));
                throw tl.loc('CleanTargetFolderFailed', err);
            }
        }

        //copy Files
        var filesToCopy: string [] = [];
        filesToCopy = getFilesToCopy(sourceFolder, contents);
        tl.debug('Number of files to copy = ' + filesToCopy.length);
        tl.debug('filesToCopy = ' + filesToCopy);

        tl._writeLine(tl.loc('CopyingFiles', filesToCopy.length));
        var fileCopyProgress : Q.Promise<string> [] = [];
        for(var i : number = 0; i < filesToCopy.length; i ++) {
            var fileToCopy = filesToCopy[i];
            tl.debug('fileToCopy = ' + fileToCopy);

            var relativePath;
            if(flattenFolders) {
                relativePath = path.basename(fileToCopy);
            } else {
                relativePath = fileToCopy.substring(sourceFolder.length)
                    .replace(/^\\/g, "")
                    .replace(/^\//g, "");
            }
            tl.debug('relativePath = ' + relativePath);
            var targetPath = path.posix.join(targetFolder, relativePath);

            tl._writeLine(tl.loc('StartedFileCopy', fileToCopy, targetPath));
            if(!overwrite) {
                var fileExists : boolean = await sshHelper.checkRemotePathExists(targetPath);
                if(fileExists) {
                    throw tl.loc('FileExists', targetPath);
                }
            }
            fileCopyProgress.push(sshHelper.uploadFile(fileToCopy, targetPath));
        }

        //wait for all files to be copied
        await Q.all(fileCopyProgress);
    } catch(err) {
        tl.setResult(tl.TaskResult.Failed, err);
    } finally {
        //close the client connection to halt build execution
        if(sshHelper) {
            tl.debug('Closing the client connection');
            sshHelper.closeConnection();
            sshHelper = null;
        }
    }
}
run();