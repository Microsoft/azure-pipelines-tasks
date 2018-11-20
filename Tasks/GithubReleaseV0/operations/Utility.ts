import tl = require("vsts-task-lib/task");
import path = require("path");
import glob = require('glob');
import fs = require('fs');

export class Utility {

    public static getGithubEndPointToken(githubEndpoint: string): string {
        const githubEndpointObject = tl.getEndpointAuthorization(githubEndpoint, false);
        let githubEndpointToken: string = null;

        if (githubEndpointObject.scheme === 'PersonalAccessToken') {
            githubEndpointToken = githubEndpointObject.parameters.accessToken
        } else {
            // scheme: 'OAuth'
            githubEndpointToken = githubEndpointObject.parameters.AccessToken
        }

        return githubEndpointToken;
    }

    public static getUploadAssets(githubReleaseAssetInputPatterns: string[]): string[] {
        let githubReleaseAssets: Set<string> = new Set();

        (githubReleaseAssetInputPatterns || []).forEach(pattern => {
            /** Check for one or multiples files into array
             *  Accept wildcards to look for files
             */
            let filePaths: string[] = glob.sync(pattern);

            filePaths.forEach((filePath) => {
                if (!githubReleaseAssets.has(filePath)) {
                    tl.debug("Adding filePath: " + filePath);
                    githubReleaseAssets.add(filePath)
                }
                else {
                    // File already added by previous pattern
                    tl.debug("FilePath already added: " + filePath);
                }
            })
        });

        return Array.from(githubReleaseAssets);
    }

    public static validateUploadAssets(assets: string[]): void {
        if (assets && assets.length > 0) {
            try {
                assets.forEach(function (asset) {
                    fs.accessSync(path.resolve(asset));
                })
            } catch (err) {
                throw new Error(tl.loc("MissingAssetError", err.path));
            }
        }
    }

    public static getReleaseNote(releaseNotesSelection: string, releaseNotesFile: any, releaseNoteInput: string, changeLog: string): string {
        let releaseNote: string = undefined;

        if (releaseNotesSelection === ReleaseNotesSelectionMode.file) {

            if (fs.lstatSync(path.resolve(releaseNotesFile)).isDirectory()) {
                console.log(tl.loc("ReleaseNotesFileIsDirectoryError", releaseNotesFile));
            }
            else {
                releaseNote = fs.readFileSync(releaseNotesFile).toString();
            }
        }
        else {
            releaseNote = releaseNoteInput;
        }
        tl.debug("ReleaseNote:\n" + releaseNote);

        // Append commits and issues to release note.
        releaseNote = releaseNote + "\n\nChange log:\n\n" + changeLog;

        return releaseNote;
    }

    public static getGitHubApiUrl(): string {
        let githubApiUrlInput: string = undefined; // Todo: mdakbar: get GHE url
        return githubApiUrlInput ? githubApiUrlInput : "https://api.github.com"; // url without slash at end
    }

    public static normalizeBranchName(branchName: string): string {
        if (!!branchName && branchName.startsWith(this._tagRef)) {
            return branchName.substring(this._tagRef.length);
        }
        return undefined;
    }

    public static parseHTTPHeaderLink(headerLink: string) {
        if (!!headerLink && headerLink.length == 0) {
            // No paginated results found
            return null; 
        }
        
        // Split pages by comma
        let pages = headerLink.split(Delimiters.comma);
        let links: { [key: string]: string } = {};

        // Parse each page into link and rel
        (pages || []).forEach((page) => {
            let section: string[] = page.split(Delimiters.semiColon);

            if (section.length < 2) {
                throw new Error("section could not be split on ';'");
            }

            // Reference - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/n
            let urlMatch = section[0].trim().match(this._githubPaginatedLinkRegex); // If it didn't match, it will return null, else it will return match at first position
            let relMatch = null;

            // Handling rel
            for (let i = 1; i < section.length; i++) {
                relMatch = section[i].trim().match(this._githubPaginatedRelRegex); // If it didn't match, it will return null, else it will return match at first position

                if (!!relMatch) {
                    break;
                }
            }

            if (urlMatch && relMatch) {
                links[relMatch[1]] = urlMatch[1];
            }

        })
    
        return links;
    }

    public static extractRepositoryOwnerAndName(repositoryName: string): IGitHubRepositoryInfo {
        let repositoryInfo = repositoryName.split(Delimiters.slash);
        
        return {
            owner: repositoryInfo[0],
            name: repositoryInfo[1]
        }
    }

    public static extractRepoAndIssueId(repoIssueId: string): IRepositoryIssueId {
        let repoIssueIdInfo: string[] = repoIssueId.split(Delimiters.hash);
        let repo: string = repoIssueIdInfo[0];
        let issueId: string = repoIssueIdInfo[1];

        return {
            repository: repo,
            issueId: issueId
        }
    }

    public static getFirstLine(comment: string): string {
        comment = (comment || "").trim();
        const match = comment.match(this._onlyFirstLine);
        return match[0];
    }
    
    private static readonly _onlyFirstLine = new RegExp("^.*$", "m");
    private static readonly _githubPaginatedLinkRegex = new RegExp("^<(.*)>$");
    private static readonly _githubPaginatedRelRegex = new RegExp('^rel="(.*)"$');
    private static _tagRef: string = "refs/tags/";
}

export class Inputs {
    public static readonly action = "action";
    public static readonly repositoryName = "repositoryName";
    public static readonly tag = "tag";
    public static readonly tagSelection = "tagSelection";
    public static readonly target = "target";
    public static readonly releaseTitle = "releaseTitle";
    public static readonly isDraft = "isDraft";
    public static readonly isPrerelease = "isPrerelease";
    public static readonly githubEndpoint = "githubEndpoint";
    public static readonly githubReleaseAsset = "githubReleaseAsset";
    public static readonly assetUploadMode = "assetUploadMode";
    public static readonly releaseNotesSelection = "releaseNotesSelection";
    public static readonly releaseNotesFile = "releaseNotesFile";
    public static readonly releaseNotesInput = "releaseNotesInput";
    public static readonly deleteExistingAssets = "deleteExistingAssets";
}

export class TagSelectionMode {
    public static readonly auto: string = "auto";
    public static readonly manual: string = "manual";
}

export class AssetUploadMode {
    public static readonly delete = "delete";
    public static readonly replace = "replace";
}

class ReleaseNotesSelectionMode {
    public static readonly input = "input";
    public static readonly file = "file";
}

export class GitHubAttributes {
    public static readonly id: string = "id";
    public static readonly nameAttribute: string = "name";
    public static readonly tagName: string = "tag_name";
    public static readonly uploadUrl: string = "upload_url";
    public static readonly htmlUrl: string = "html_url";
    public static readonly assets: string = "assets";
    public static readonly commit: string = "commit";
    public static readonly message: string = "message";
    public static readonly state: string = "state";
    public static readonly title: string = "title";
    public static readonly commits: string = "commits";
    public static readonly sha: string = "sha";
    public static readonly behind: string = "behind";
    public static readonly status: string = "status";
}

export class ActionType {
    public static readonly create = "Create";
    public static readonly edit = "Edit";
    public static readonly discard = "Discard";
}

export class AzureDevOpsVariables {
    public static readonly buildSourceVersion: string = "Build.SourceVersion";
    public static readonly buildSourceBranch: string = "Build.SourceBranch"; 
}

export interface IGitHubRepositoryInfo {
    owner: string;
    name: string;
}

export interface IRepositoryIssueId {
    repository: string;
    issueId: string;
}

export class Delimiters {
    public static readonly newLine: string = "\n";
    public static readonly hash: string = "#";
    public static readonly slash: string = "/";
    public static readonly semiColon: string = ";";
    public static readonly comma: string = ",";
    public static readonly space: string = " ";
}