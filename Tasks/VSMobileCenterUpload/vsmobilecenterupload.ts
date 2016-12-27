import path = require('path');
import tl = require('vsts-task-lib/task');
import request = require('request');
import Q = require('q');
import fs = require('fs');

import {ToolRunner} from 'vsts-task-lib/toolrunner';

var utils = require('./utils.js');

class UploadInfo {
    upload_id: string;
    upload_url: string;
}

class SymbolsUploadInfo {
    symbol_upload_id: string;
    upload_url: string;
    expiration_date: string;
}

function getEndpointDetails(endpointInputFieldName) {
    var errorMessage = tl.loc("CannotDecodeEndpoint");
    var endpoint = tl.getInput(endpointInputFieldName, true);

    if (!endpoint) {
        throw new Error(errorMessage);
    }

    let url = tl.getEndpointUrl(endpoint, false);
    let apiServer = url.substr(0, url.lastIndexOf('/'));
    let apiVersion = url.substr(url.lastIndexOf('/') + 1);
    let authToken = tl.getEndpointAuthorizationParameter(endpoint,'apitoken', false);
    
    return { 
        apiServer: apiServer, 
        apiVersion: apiVersion,
        authToken: authToken 
    }; 
}

function responseHandler(defer, err, res, body, handler: () => void) {
    if (body) {
        tl.debug(`---- ${JSON.stringify(body)}`);
    }

    if (err) {
        tl.debug(`---- Failed with error: ${err}`);
        defer.reject(err);
        return;
    } 

    if (!res) {
        defer.reject(tl.loc("NoResponseFromServer"));
        return;
    }

    tl.debug(`---- http call status code: ${res.statusCode}`);
    if (res.statusCode < 200 || res.statusCode >= 300) {
        let message = JSON.stringify(body) || `http response code: ${res.statusCode}`;
        defer.reject(message);
        return;
    }
    
    handler();
}

function beginPackageUpload(apiServer: string, apiVersion: string, appSlug: string, token: string): Q.Promise<UploadInfo> {
    tl.debug("-- Prepare for uploading package.");
    let defer = Q.defer<UploadInfo>();
    let beginUploadUrl: string = `${apiServer}/${apiVersion}/apps/${appSlug}/package_uploads`;
    tl.debug(`---- url: ${beginUploadUrl}`);

    let headers = {
        "Content-Type": "application/json",
        "X-API-Token": token
    };
    request.post({ url: beginUploadUrl, headers: headers }, (err, res, body) => {
        responseHandler(defer, err, res, body, () => {
            let response = JSON.parse(body);
            let uploadInfo: UploadInfo = {
                upload_id: response['upload_id'],
                upload_url: response['upload_url']
            }

            defer.resolve(uploadInfo);
        });
    });

    return defer.promise;
}

function uploadPackage(uploadUrl: string, file: string): Q.Promise<void> {
    tl.debug("-- Uploading package...");
    let defer = Q.defer<void>();
    tl.debug(`---- url: ${uploadUrl}`);
    let req = request.post(uploadUrl, (err, res, body) => {
        responseHandler(defer, err, res, body, () => {
            tl.debug('-- File uploaded.');
            defer.resolve();
        });
    });

    let form = req.form();
    form.append('ipa', fs.createReadStream(file));

    return defer.promise;
}

function commitPackage(apiServer: string, apiVersion: string, appSlug: string, upload_id: string, token: string): Q.Promise<string> {
    tl.debug("-- Finishing uploading package...");
    let defer = Q.defer<string>();
    let commitPackageUrl: string = `${apiServer}/${apiVersion}/apps/${appSlug}/package_uploads/${upload_id}`;
    tl.debug(`---- url: ${commitPackageUrl}`);
    let headers = {
        "X-API-Token": token
    };

    let commitBody = { "status": "committed" };

    request.patch({ url: commitPackageUrl, headers: headers, json: commitBody }, (err, res, body) => {
        responseHandler(defer, err, res, body, () => {
            if (body && body['package_url']) {
                defer.resolve(body['package_url']);
            } else {
                defer.reject(tl.loc("FailedToUploadFile"));
            }
        });
    })

    return defer.promise;
}

function publishPackage(apiServer: string, packageUrl: string, releaseNotes: string, distributionGroupId: string, token: string) {
    tl.debug("-- Mark package available.");
    let defer = Q.defer<void>();
    let publishPackageUrl: string = `${apiServer}/${packageUrl}`;
    tl.debug(`---- url: ${publishPackageUrl}`);

    let headers = {
        "X-API-Token": token
    };

    let publishBody = { 
        "status": "available", 
        "distribution_group_id": distributionGroupId,
        "release_notes": releaseNotes
    };

    request.patch({ url: publishPackageUrl, headers: headers, json: publishBody }, (err, res, body) => {
        responseHandler(defer, err, res, body, () => {
            defer.resolve();
        });
    })

    return defer.promise;
}

/**
 * If the input is a single file, upload this file without any processing.
 * If the input is a dSYM folder, zip the parent and upload the zip so dSYM folder appears on the root of the archive
 * If the input is a folder, zip the input folder so all files under this folder appears on the root of the archive 
 */
function prepareSymbols(symbolsPath: string, packParentFolder: boolean): Q.Promise<string> {
    tl.debug("-- Prepare symbols")
    let defer = Q.defer<string>();
  
    let stat = fs.statSync(symbolsPath);
    if (stat.isFile() && !packParentFolder) {
        // single file - Android source mapping txt file
        tl.debug(`---- symbol file: ${symbolsPath}`)
        defer.resolve(symbolsPath);
    } else { 
        if (packParentFolder) {
            tl.debug(`---- Take the parent folder of ${symbolsPath}`);
            symbolsPath = path.dirname(symbolsPath); 
        }

        tl.debug(`---- Creating symbols from ${symbolsPath}`);
        let zipStream = utils.createZipStream(symbolsPath, utils.isDsym(symbolsPath));
        let workDir = tl.getVariable("System.DefaultWorkingDirectory");
        let zipName = path.join(workDir, `${path.basename(symbolsPath)}.zip`); 
        utils.createZipFile(zipStream, zipName).
            then(() => {
                tl.debug(`---- symbol file: ${zipName}`)
                defer.resolve(zipName);
            });
    }

    return defer.promise;
}

function beginSymbolUpload(apiServer: string, apiVersion: string, appSlug: string, symbol_type: string, token: string): Q.Promise<SymbolsUploadInfo> {
    tl.debug("-- Begin symbols upload")
    let defer = Q.defer<SymbolsUploadInfo>();

    let beginSymbolUploadUrl: string = `${apiServer}/${apiVersion}/apps/${appSlug}/symbol_uploads`;
    tl.debug(`---- url: ${beginSymbolUploadUrl}`);

    let headers = {
        "X-API-Token": token
    };

    let symbolsUploadBody = { "symbol_type": symbol_type };
    
    request.post({ url: beginSymbolUploadUrl, headers: headers, json: symbolsUploadBody}, (err, res, body) => {
        responseHandler(defer, err, res, body, () => {
            let symbolsUploadInfo: SymbolsUploadInfo = {
                symbol_upload_id: body['symbol_upload_id'],
                upload_url: body['upload_url'],
                expiration_date: body['expiration_date']
            }

            defer.resolve(symbolsUploadInfo);
        });
    })

    return defer.promise;
}

function uploadSymbols(uploadUrl: string, file: string): Q.Promise<void> {
    tl.debug("-- Uploading symbols...");
    let defer = Q.defer<void>();
    tl.debug(`---- url: ${uploadUrl}`);

    let stat = fs.statSync(file);
    let headers = {
         "x-ms-blob-type": "BlockBlob",
         "Content-Length": stat.size
    };

    fs.createReadStream(file).pipe(request.put({url: uploadUrl, headers: headers}, (err, res, body) => {
        responseHandler(defer, err, res, body, () => {
            tl.debug('-- Symbol uploaded.');
            defer.resolve();
        });
    }));

    return defer.promise;
}

function commitSymbols(apiServer: string, apiVersion: string, appSlug: string, symbol_upload_id: string, token: string): Q.Promise<void> {
    tl.debug("-- Finishing uploading symbols...");
    let defer = Q.defer<void>();
    let commitSymbolsUrl: string = `${apiServer}/${apiVersion}/apps/${appSlug}/symbol_uploads/${symbol_upload_id}`;
    tl.debug(`---- url: ${commitSymbolsUrl}`);
    let headers = {
        "X-API-Token": token
    };

    let commitBody = { "status": "committed" };

    request.patch({ url: commitSymbolsUrl, headers: headers, json: commitBody }, (err, res, body) => {
        responseHandler(defer, err, res, body, () => {
            defer.resolve();
        });
    })

    return defer.promise;
}

async function run() {
    try {
        tl.setResourcePath(path.join( __dirname, 'task.json'));

        // Get build inputs
        let apiEndpointData = getEndpointDetails('serverEndpoint');
        let apiToken: string = apiEndpointData.authToken;
        let apiServer: string = apiEndpointData.apiServer;
        let apiVersion: string = apiEndpointData.apiVersion;
    
        var effectiveApiServer = process.env['SONOMA_API_SERVER'] || apiServer;
        var effectiveApiVersion = process.env['SONOMA_API_VERSION'] || apiVersion;
        
        tl.debug(`Effective API Url: ${effectiveApiServer}/${effectiveApiVersion}`);
        
        let appSlug: string = tl.getInput('appSlug', true);
        let appFilePattern: string = tl.getInput('app', true);
        let symbolsType: string = tl.getInput('symbolsType', false);
        let symbolVariableName = null;
        switch (symbolsType) {
            case "Apple": 
                symbolVariableName = "dsymPath";
                break;
            case "AndroidJava":
                symbolVariableName = "mappingTxtPath";
                break;
            default: 
                symbolVariableName = "symbolsPath";
        }
        let symbolsPathPattern: string = tl.getInput(symbolVariableName, false);
        let packParentFolder: boolean = tl.getBoolInput('packParentFolder', false);

        let releaseNotesSelection = tl.getInput('releaseNotesSelection', true);
        let releaseNotes: string = null;
        if (releaseNotesSelection === 'file') {
            let releaseNotesFile = tl.getPathInput('releaseNotesFile', true, true);
            releaseNotes = fs.readFileSync(releaseNotesFile).toString('utf8');
        } else {
            releaseNotes = tl.getInput('releaseNotesInput', true);
        }

        let distributionGroupId = tl.getInput('distributionGroupId', false) || '00000000-0000-0000-0000-000000000000';
        tl.debug(`Effective distribution_group_id: ${distributionGroupId}`);

        // Validate inputs
        if (!apiToken) {
            throw new Error(tl.loc("NoApiTokenFound"));
        }
        
        let app = utils.resolveSinglePath(appFilePattern);
        tl.checkPath(app, "Binary file");

        let symbolsPath = utils.checkAndFixFilePath(utils.resolveSinglePath(symbolsPathPattern), "symbolsPath");

        // Begin package upload
        let uploadInfo: UploadInfo = await beginPackageUpload(effectiveApiServer, effectiveApiVersion, appSlug, apiToken);

        // Perform the upload
        await uploadPackage(uploadInfo.upload_url, app);

        // Commit the upload
        let packageUrl = await commitPackage(effectiveApiServer, effectiveApiVersion, appSlug, uploadInfo.upload_id, apiToken);

        // Publish
        await publishPackage(effectiveApiServer, packageUrl, releaseNotes, distributionGroupId, apiToken);

        // Uploading symbols
        if (symbolsPath) {
            // Prepare symbols 
            let symbolsFile = await prepareSymbols(symbolsPath, packParentFolder);                
            
            // Begin preparing upload symbols
            let symbolsUploadInfo = await beginSymbolUpload(effectiveApiServer, effectiveApiVersion, appSlug, symbolsType, apiToken);
            
            // upload symbols 
            await uploadSymbols(symbolsUploadInfo.upload_url, symbolsFile);

            await commitSymbols(effectiveApiServer, effectiveApiVersion, appSlug, symbolsUploadInfo.symbol_upload_id, apiToken);
        } 

        tl.setResult(tl.TaskResult.Succeeded, tl.loc("Succeeded"));
    } catch (err) {
        tl.setResult(tl.TaskResult.Failed, `${err}`);
    }
}

run();
