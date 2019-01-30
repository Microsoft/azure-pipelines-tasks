var path = require("path");

import * as locationUtility from "packaging-common/locationUtilities";
import * as tl from "vsts-task-lib/task";
import * as nutil from "packaging-common/nuget/Utility";

import { PackageUrlsBuilder } from "./packagebuilder";
import { Extractor } from "./extractor";
import { WebApi } from "azure-devops-node-api";
import { BearerHandlerForPresignedUrls } from "./credentialprovider";

tl.setResourcePath(path.join(__dirname, "task.json"));

async function main(): Promise<void> {
    // TODO Get that logic to check for GUID from v0 after verifying why its needed.

    // Getting inputs.
    // let packageType = tl.getInput("packageType");
    // let feedId = tl.getInput("feed");
    // let viewId = tl.getInput("view");
    // let packageId = tl.getInput("definition");
    // let version = tl.getInput("version");
    // let downloadPath = tl.getInput("downloadPath");
    // let filesPattern = tl.getInput("files");
    // let extractPackage = tl.getInput("extract") === "true";

    let packageType = tl.getVariable("packageType");
    let feedId = tl.getInput("feed");
    let viewId = tl.getVariable("view");
    let packageId = tl.getVariable("definition");
    let version = tl.getVariable("version");
    let downloadPath = tl.getInput("downloadPath");
    let filesPattern = tl.getVariable("files");
    let extractPackage = tl.getVariable("extract") === "true";

    // Getting variables.
    const collectionUrl = tl.getVariable("System.TeamFoundationCollectionUri");
    const retryLimitValue: string = tl.getVariable("VSTS_HTTP_RETRY");
    const retryLimit: number = !!retryLimitValue && !isNaN(parseInt(retryLimitValue)) ? parseInt(retryLimitValue) : 4;
    const deleteArchive = tl.getVariable("deleteArchive") === "true";
    const skipDownload = tl.getVariable("skipDownload") === "true";

    if (viewId) {
        feedId = feedId + "@" + viewId;
    }

    let files: string[] = [];
    if (filesPattern) {
        files = nutil.getPatternsArrayFromInput(filesPattern);
    }

    var feedConnection = await getConnection("7AB4E64E-C4D8-4F50-AE73-5EF2E21642A5", collectionUrl);
    var pkgsConnection = await getConnection("B3BE7473-68EA-4A81-BFC7-9530BAAA19AD", collectionUrl);

    var p = await new PackageUrlsBuilder()
        .ofType(packageType)
        .withPkgsConnection(pkgsConnection)
        .withFeedsConnection(feedConnection)
        .matchingPattern(files)
        .withMaxRetries(retryLimit)
        .build();
    tl.debug("hello ");
    var extractors: Extractor[] = await p.download(feedId, packageId, version, downloadPath);

    if (extractPackage) {
        extractors.forEach(extractor => {
            extractor.extractFile();
        });
    }
}


function getConnection(areaId: string, collectionUrl: string): Promise<WebApi> {
    var accessToken = locationUtility.getSystemAccessToken();
    return locationUtility
        .getServiceUriFromAreaId(collectionUrl, accessToken, areaId)
        .then(url => {
            return new WebApi(url, new BearerHandlerForPresignedUrls(accessToken));
        })
        .catch(error => {
            throw error;
        });
}

function executeWithRetries(operationName: string, operation: () => Promise<any>, retryCount): Promise<any> {
    var executePromise = new Promise((resolve, reject) => {
        executeWithRetriesImplementation(operationName, operation, retryCount, resolve, reject);
    });

    return executePromise;
}

function executeWithRetriesImplementation(
    operationName: string,
    operation: () => Promise<any>,
    currentRetryCount,
    resolve,
    reject
) {
    operation()
        .then(result => {
            resolve(result);
        })
        .catch(error => {
            if (currentRetryCount <= 0) {
                tl.error(tl.loc("OperationFailed", operationName, error));
                reject(error);
            } else {
                console.log(tl.loc("RetryingOperation", operationName, currentRetryCount));
                currentRetryCount = currentRetryCount - 1;
                setTimeout(
                    () =>
                        executeWithRetriesImplementation(operationName, operation, currentRetryCount, resolve, reject),
                    4 * 1000
                );
            }
        });
}

main()
    .then(result => tl.setResult(tl.TaskResult.Succeeded, ""))
    .catch(error => tl.setResult(tl.TaskResult.Failed, error));
