import * as tl from "vsts-task-lib/task";
import { Package } from "./package";
import { SingleFilePackage } from "./singlefilepackage";
import { MultiFilePackage } from "./multifilepackage";

export class PackageUrlsBuilder {
    private type: string;
    private pattern: string;
    private accessToken: string;
    private maxRetries: number;
    private packageProtocolAreaName: string;
    private packageProtocolAreadId: string;
    private packagingMetadataAreaId: string;
    private packageProtocolDownloadAreadId: string;

    get Type() {
        return this.type;
    }

    ofType(type: string): PackageUrlsBuilder {
        this.type = type;
        switch(this.type) {
            case "NuGet":
                this.packageProtocolAreaName = "NuGet";
                this.packageProtocolAreadId = "B3BE7473-68EA-4A81-BFC7-9530BAAA19AD";
                this.packagingMetadataAreaId = "7A20D846-C929-4ACC-9EA2-0D5A7DF1B197"; // Package details area id
                this.packageProtocolDownloadAreadId = "6EA81B8C-7386-490B-A71F-6CF23C80B388";
                break;
            case "Npm":
                this.packageProtocolAreaName = "npm";
                this.packageProtocolAreadId = "4C83CFC1-F33A-477E-A789-29D38FFCA52E";
                this.packagingMetadataAreaId = "7A20D846-C929-4ACC-9EA2-0D5A7DF1B197"; // Package details area id
                this.packageProtocolDownloadAreadId = "09A4EAFD-123A-495C-979C-0EDA7BDB9A14";
                break;
            case "Python":
                this.packageProtocolAreaName = "pypi";
                this.packageProtocolAreadId = "92F0314B-06C5-46E0-ABE7-15FD9D13276A";
                this.packagingMetadataAreaId = "3B331909-6A86-44CC-B9EC-C1834C35498F"; // Package version details area id
                this.packageProtocolDownloadAreadId = "97218BAE-A64D-4381-9257-B5B7951F0B98";
                break;
            case "Maven":
                this.packageProtocolAreaName = "maven";
                this.packageProtocolAreadId = "6F7F8C07-FF36-473C-BCF3-BD6CC9B6C066";
                this.packagingMetadataAreaId = "3B331909-6A86-44CC-B9EC-C1834C35498F"; // Package version details area id
                // TODO whats maven's download id?
                this.packageProtocolDownloadAreadId = "09A4EAFD-123A-495C-979C-0EDA7BDB9A14";
                break;
            default:
                throw new Error(tl.loc("PackageTypeNotSupported"));
        }
        return this;
    }

    get PackageProtocolAreaName() {
        return this.packageProtocolAreaName;
    }

    get PackageProtocolAreaId() {
        return this.packageProtocolAreadId;
    }

    get PackagingMetadataAreaId() {
        return this.packagingMetadataAreaId;
    }

    get PackageProtocolDownloadAreadId() {
        return this.packageProtocolDownloadAreadId;
    }

    get Pattern() {
        return this.pattern;
    }

    matchingPattern(pattern: string): PackageUrlsBuilder {
        this.pattern = pattern;
        return this;
    }

    get AccessToken() {
        return this.accessToken;
    }

    usingAccessToken(accessToken: string): PackageUrlsBuilder {
        this.accessToken = accessToken;
        return this;
    }

    get MaxRetries() {
        return this.maxRetries;
    }

    withMaxRetries(maxRetries: number): PackageUrlsBuilder {
        this.maxRetries = maxRetries;
        return this;
    }

    build(): Package {
        switch (this.type) {
            case "NuGet":
            case "Npm":
                return new SingleFilePackage(this);
            case "Python":
            case "Maven":
                return new MultiFilePackage(this);
            default:
                throw new Error(tl.loc("PackageTypeNotSupported"));
        }
    }
}