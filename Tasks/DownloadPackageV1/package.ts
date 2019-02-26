var fs = require("fs");
var path = require("path");

import * as tl from "vsts-task-lib/task";

import { Extractor } from "./extractor";
import { PackageUrlsBuilder } from "./packagebuilder";
import { WebApi } from "azure-devops-node-api";
import { VsoClient } from "azure-devops-node-api/VsoClient";
import { ICoreApi } from "azure-devops-node-api/CoreApi";
import stream = require("stream");

export class PackageFileResult {
    private value: string;
    private isUrl: boolean;

    get Value() {
        return this.value;
    }
    get IsUrl() {
        return this.isUrl;
    }

    constructor(value: string, isUrl: boolean) {
        this.value = value;
        this.isUrl = isUrl;
    }
}

export abstract class Package {
    protected packageProtocolAreaName: string;
    protected packageProtocolDownloadAreadId: string;
    protected extension: string;
    protected feedConnection: WebApi;
    protected pkgsConnection: WebApi;

    private executeWithRetries: <T>(operation: () => Promise<T>) => Promise<T>;
    private packagingAreaName: string = "Packaging";
    private packagingMetadataAreaId: string;

    constructor(builder: PackageUrlsBuilder) {
        this.packageProtocolAreaName = builder.PackageProtocolAreaName;
        this.packageProtocolDownloadAreadId = builder.PackageProtocolDownloadAreadId;
        this.packagingMetadataAreaId = builder.PackagingMetadataAreaId;
        this.extension = builder.Extension;
        this.feedConnection = builder.FeedsConnection;
        this.pkgsConnection = builder.PkgsConnection;
        this.executeWithRetries = builder.ExecuteWithRetries;
    }

    protected abstract async getDownloadUrls(
        feedId: string,
        packageId: string,
        packageVersion: string
    ): Promise<Map<string, PackageFileResult>>;

    protected async getUrl(
        vsoClient: VsoClient,
        areaName: string,
        areaId: string,
        routeValues: any,
        queryParams?: any
    ): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            var getVersioningDataPromise = this.executeWithRetries(() =>
                vsoClient.getVersioningData(null, areaName, areaId, routeValues, queryParams)
            );

            getVersioningDataPromise.then(result => {
                tl.debug("Got URL " + result.requestUrl + " from versioning data.");
                return resolve(result.requestUrl);
            });
            getVersioningDataPromise.catch(error => {
                tl.debug("Getting URL from versioning data failed with error: " + error);
                return reject(error);
            });
        });
    }

    protected async getPackageMetadata(connection: WebApi, routeValues: any, queryParams?: any): Promise<any> {
        var metadataUrl = await this.getUrl(
            connection.vsoClient,
            this.packagingAreaName,
            this.packagingMetadataAreaId,
            routeValues,
            queryParams
        );

        var client = connection.rest;

        return new Promise((resolve, reject) => {
            this.executeWithRetries(() =>
                client.get(metadataUrl).then(response => {
                    if (response.statusCode >= 200 && response.statusCode < 300) {
                        return resolve(response.result);
                    } else {
                        throw new Error(response.statusCode + ": " + response.result);
                    }
                })
            ).catch(error => {
                tl.debug("Getting package metadata failed with error: " + error);
                return reject(tl.loc("FailedToGetPackageMetadata", metadataUrl, error));
            });
        });
    }

    public async download(
        feedId: string,
        packageId: string,
        packageVersion: string,
        downloadPath: string,
        extract: boolean
    ): Promise<Extractor[]> {
        return new Promise<Extractor[]>(async (resolve, reject) => {
            return this.getDownloadUrls(feedId, packageId, packageVersion)
                .then(async downloadUrls => {
                    if (!tl.exist(downloadPath)) {
                        tl.mkdirP(downloadPath);
                    }
                    var promises: Promise<Extractor>[] = [];
                    var coreApi = await this.pkgsConnection.getCoreApi();
                    Object.keys(downloadUrls).map(fileName => {
                        const extractor = new Extractor(extract, downloadPath, fileName);
                        tl.rmRF(extractor.downloadPath);
                        promises.push(
                            downloadUrls[fileName].IsUrl
                                ? this.downloadFile(coreApi, downloadUrls[fileName].Value, extractor)
                                : this.writeFile(downloadUrls[fileName].Value, extractor)
                        );
                    });

                    return resolve(Promise.all(promises));
                })
                .catch(error => {
                    tl.debug("Getting download url for this package failed with error: " + error);
                    return reject(error);
                });
        });
    }

    private async writeFile(content: string, extractor: Extractor): Promise<Extractor> {
        return new Promise<Extractor>((resolve, reject) => {
            fs.writeFile(extractor.downloadPath, content, err => {
                if (err) {
                    tl.debug("Writing file content failed with error: " + err);
                    return reject(err);
                } else {
                    return resolve(extractor);
                }
            });
        });
    }

    private async downloadFile(
        coreApi: ICoreApi,
        downloadUrl: string,
        extractor: Extractor
    ): Promise<Extractor> {
        return new Promise<Extractor>((resolve, reject) => {
            return this.executeWithRetries(() =>
                coreApi.http.get(downloadUrl).then(response => {
                    if (response.message.statusCode >= 200 && response.message.statusCode < 300) {
                        var responseStream = response.message as stream.Readable;
                        var file = fs.createWriteStream(extractor.downloadPath);

                        responseStream.pipe(file);

                        responseStream.on("end", () => {
                            tl.debug(tl.loc("PackageDownloadSuccessful"));
                            file.on("close", () => {
                                return resolve(extractor);
                            });
                        });
                        responseStream.on("error", err => {
                            tl.debug("Download stream failed with error: " + err);
                            file.close();
                            return reject(tl.loc("FailedToDownloadPackage", downloadUrl, err));
                        });
                    } else {
                        throw new Error(response.message.statusCode + ": " + response.message.statusMessage);
                    }
                })
            ).catch(error => {
                tl.debug("Downloading file failed with error: " + error);
                return reject(tl.loc("FailedToDownloadPackage", downloadUrl, error));
            });
        });
    }
}
