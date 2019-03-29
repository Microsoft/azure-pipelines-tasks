'use strict';

const assert = require('assert');
const tl = require('vsts-task-lib');
const ttm = require('vsts-task-lib/mock-test');
const path = require('path');

function setResponseFile(name) {
    process.env['MOCK_RESPONSES'] = path.join(__dirname, name);
}

function runValidations(validator: () => void, tr, done) {
    try {
        validator();
        done();
    }
    catch (error) {
        console.log("STDERR", tr.stderr);
        console.log("STDOUT", tr.stdout);
        done(error);
    }
}

describe('DotNetCoreInstaller', function () {
    this.timeout(30000);
    before((done) => {
        done();
    });
    after(function () {
    });

    it("[VersionUtilities] versionCompareFunction should throw for non explicit versions or empty version strings", (done) => {
        process.env["__non_explicit__"] = "true"
        let tr = new ttm.MockTestRunner(path.join(__dirname, "versionUtilityVersionCompareTests.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == false, ("should have thrown and failed"));
            assert(tr.stdout.indexOf("FunctionThrewAsExpected") > -1, "Should have thrown as versions are not explicit and are empty strings.");
        }, tr, done);
    });

    it("[VersionUtilities] versionCompareFunction should return 1, 0 or -1 when versionA is gt, eq or lt versionB", (done) => {
        process.env["__non_explicit__"] = "false";
        let tr = new ttm.MockTestRunner(path.join(__dirname, "versionUtilityVersionCompareTests.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == true, ("Should have succeeded"));
            assert(tr.stdout.indexOf("FunctionGaveRightResult") > -1, "Should have given right results for all cases.");
        }, tr, done);
    });

    it("[VersionUtilities] compareChannelVersion function should throw when either or both channel versions are empty or are non numeric", (done) => {
        process.env["__non_explicit__"] = "true"
        let tr = new ttm.MockTestRunner(path.join(__dirname, "versionUtilityVersionCompareTests.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == false, ("should have thrown and failed"));
            assert(tr.stdout.indexOf("FunctionThrewAsExpected") > -1, "Should have thrown as versions are not explicit and are empty strings.");
        }, tr, done);
    });

    it("[VersionUtilities] compareChannelVersion function should return 1, 0 or -1 when channelVersionA is gt, eq or lt channelVersionB", (done) => {
        process.env["__non_explicit__"] = "false";
        let tr = new ttm.MockTestRunner(path.join(__dirname, "versionUtilityChannelVersionCompareTests.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == true, ("Should have succeeded"));
            assert(tr.stdout.indexOf("FunctionGaveRightResult") > -1, "Should have given right results for all cases.");
        }, tr, done);
    });

    it("[VersionUtilities] getMatchingVersionFromList should return null for empty versionInfoList, versionInfoList elements having empty version or no matching version found in list while toggling includePreviewVersionsValue", (done) => {
        process.env["__empty__"] = "true"
        let tr = new ttm.MockTestRunner(path.join(__dirname, "versionUtilityGetMatchingVersionFromListTests.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == true, ("Should have succeeded"));
            assert(tr.stdout.indexOf("FunctionReturnedNull") > -1, "Should have returned null for all cases and print the message.");
        }, tr, done);
    });

    it("[VersionUtilities] getMatchingVersionFromList should return heighest version for the spec when versionSpec is not exact version", (done) => {
        process.env["__empty__"] = "false"
        let tr = new ttm.MockTestRunner(path.join(__dirname, "versionUtilityGetMatchingVersionFromListTests.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == true, ("Should have succeeded"));
            assert(tr.stdout.indexOf("FuctionReturnedCorrectVersion") > -1, "Should have returned null for all cases and print the message.");
        }, tr, done);
    });

    it("[Models.VersionParts] constructor should throw when version fails validation", (done) => {
        process.env["__invalid_versionparts__"] = "true";
        let tr = new ttm.MockTestRunner(path.join(__dirname, "modelsVersionPartsTests.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == false, ("Should have failed"));
            assert(tr.stdout.indexOf("FunctionThrewAsExpected") > -1, "Should have thrown for all invalid version specs.");
        }, tr, done);
    });

    it("[Models.VersionParts] constructor return object instance with correct major, minor and patch version", (done) => {
        process.env["__invalid_versionparts__"] = "false";
        let tr = new ttm.MockTestRunner(path.join(__dirname, "modelsVersionPartsTests.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == true, ("Should have returned right objects"));
            assert(tr.stdout.indexOf("VersionPartsCreatedSuccessfully") > -1, "Should have returned the correct objects and print the statement.");
        }, tr, done);
    });

    it("[Models.Channel] constructor should throw if object passed doesn't contain channel-version or releasesJsonUrl, or contains invalid releasesJsonUrl", (done) => {
        process.env["__invalid_channelobject__"] = "true";
        let tr = new ttm.MockTestRunner(path.join(__dirname, "modelsChannelTests.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == false, ("Should have failed for incorrect objects."));
            assert(tr.stdout.indexOf("FunctionThrewAsExpected") > -1, "Should have thrown error in all cases.");
        }, tr, done);
    });

    it("[Models.Channel] constructor should pass if object contains channel-version and valid releasesJsonUrl", (done) => {
        process.env["__invalid_channelobject__"] = "false";
        let tr = new ttm.MockTestRunner(path.join(__dirname, "modelsChannelTests.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == true, ("Should have successfully created channel objects."));
            assert(tr.stdout.indexOf("ChannelCreatedSuccessfully") > -1, "Should have returned the correct objects and print the statement.");
        }, tr, done);
    });

    it("[Models.VersionInfo] getRuntimeVersion should return correct runtime-version from sdk versionInfo object", (done) => {
        process.env["__sdk_runtime__"] = "true";
        let tr = new ttm.MockTestRunner(path.join(__dirname, "modelsGetRuntimeVersionTests.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == true, ("Should have successfully returned runtime versions for sdk package type."));
            assert(tr.stdout.indexOf("RuntimeVersionsReturnedForSdkAreCorrect") > -1, "Should have returned correct runtime versions for all cases of packageType sdk.");
        }, tr, done);
    });

    it("[Models.VersionInfo] getRuntimeVersion should return version for runtime versionInfo object", (done) => {
        process.env["__sdk_runtime__"] = "false";
        let tr = new ttm.MockTestRunner(path.join(__dirname, "modelsGetRuntimeVersionTests.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == true, ("Should have successfully returned runtime versions for runtime package type."));
            assert(tr.stdout.indexOf("RuntimeVersionsReturnedAreCorrect") > -1, "Should have returned correct runtime versions for all cases of packageType runtime.");
        }, tr, done);
    });

    it("[VersionFetcher.DotNetCoreVersionFetcher] getVersionInfo should throw if version for pacakge type can not be found, and error message should contain the package type", (done) => {
        process.env["__failat__"] = "versionnotfound";
        let tr = new ttm.MockTestRunner(path.join(__dirname, "versionFetcherGetVersionInfoFailTests.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == false, ("Should have failed as the wanted version of package type can not be found."));
            assert(tr.stdout.indexOf("VersionNotFound") > -1, "Should have thrown version not found exception.");
        }, tr, done);
    });

    it("[VersionFetcher.DotNetCoreVersionFetcher] getVersionInfo should throw if getting channel fails", (done) => {
        process.env["__failat__"] = "channelfetch";
        let tr = new ttm.MockTestRunner(path.join(__dirname, "versionFetcherGetVersionInfoFailTests.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == false, ("Should have failed as channels could not be fetched."));
            assert(tr.stdout.indexOf("ExceptionWhileDownloadOrReadReleasesIndex") > -1, "Should have thrown exception and returned.");
        }, tr, done);
    });

    it("[VersionFetcher.DotNetCoreVersionFetcher] getVersionInfo should return correct version info for a correct version spec", (done) => {
        process.env["__versionspec__"] = "2.2.103";
        let tr = new ttm.MockTestRunner(path.join(__dirname, "versionFetcherGetVersionInfoTestsCorrect.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == true, ("Should have returned the correct version info."));
        }, tr, done);
    });

    it("[VersionFetcher.DotNetCoreVersionFetcher] getVersionInfo should return correct version info for a version which exists in a different channel of the same major version", (done) => {
        process.env["__versionspec__"] = "2.1.104";
        let tr = new ttm.MockTestRunner(path.join(__dirname, "versionFetcherGetVersionInfoTestsCorrect.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == true, ("Should have returned the correct version info."));
        }, tr, done);
    });

    it("[VersionFetcher.DotNetCoreVersionFetcher] getVersionInfo should return latest version info in a major version for a versionSpec of type majorVersion.x", (done) => {
        process.env["__versionspec__"] = "2.x";
        let tr = new ttm.MockTestRunner(path.join(__dirname, "versionFetcherGetVersionInfoTestsCorrect.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == true, ("Should have returned the correct version info."));
        }, tr, done);
    });

    it("[VersionFetcher.DotNetCoreVersionFetcher] getVersionInfo should return latest version info in a major.minor version for a versionSpec of type majorVersion.minorVersion.x", (done) => {
        process.env["__versionspec__"] = "2.2.x";
        let tr = new ttm.MockTestRunner(path.join(__dirname, "versionFetcherGetVersionInfoTestsCorrect.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == true, ("Should have returned the correct version info."));
        }, tr, done);
    });

    it("[VersionFetcher.DotNetCoreVersionFetcher] getVersionInfo should return latest preview version info if includePreviewVersion is true and latest version is a preview version", (done) => {
        process.env["__versionspec__"] = "2.2.x";
        process.env["__inlcudepreviewversion__"] = "true";
        let tr = new ttm.MockTestRunner(path.join(__dirname, "versionFetcherGetVersionInfoTestsCorrect.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == true, ("Should have returned the correct version info."));
        }, tr, done);
    });

    it("[VersionFetcher.DotNetCoreVersionFetcher] getVersionInfo should return latest version info even if includePreviewVersion is true but latest version is non preview", (done) => {
        process.env["__versionSpec__"] = "2.3.x";
        process.env["__inlcudepreviewversion__"] = "true";
        let tr = new ttm.MockTestRunner(path.join(__dirname, "versionFetcherGetVersionInfoTestsCorrect.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == true, ("Should have returned the correct version info."));
        }, tr, done);
    });

    it("[VersionFetcher.DotNetCoreVersionFetcher] getDownloadUrl should throw if VersionFilesData doesn't contain download URL", (done) => {
        process.env["__ostype__"] = "win";
        process.env["__getmachineosfail__"] = "false";
        process.env["__versioninfo__"] = `{"version":"2.2.104", "files": [{"name":"winpackage.zip", "rid":"win-x64", "url": ""}]}`;
        let tr = new ttm.MockTestRunner(path.join(__dirname, "versionFetcherGetDownloadUrlFailTests.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == false, ("Should have failed as download URL is missing."));
            assert(tr.stdout.indexOf("DownloadUrlForMatchingOsNotFound") > 0, ("Should have thrown the error message as download URL is not present."))
        }, tr, done);
    });

    it("[VersionFetcher.DotNetCoreVersionFetcher] getDownloadUrl should throw if download information object with RID matching OS, could not be found", (done) => {
        process.env["__ostype__"] = "win";
        process.env["__getmachineosfail__"] = "false";
        process.env["__versioninfo__"] = `{"version":"2.2.104", "files": [{"name": "linux.tar.gz", "rid":"linux-x64", "url": ""}, {"name": "win.zip", "rid":"win-x86", "url": ""}]}`;
        let tr = new ttm.MockTestRunner(path.join(__dirname, "versionFetcherGetDownloadUrlFailTests.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == false, ("Should have failed as download URL is missing."));
            assert(tr.stdout.indexOf("DownloadUrlForMatchingOsNotFound") > 0, ("Should have thrown the error message as download URL is not present."))
        }, tr, done);
    });

    it("[VersionFetcher.DotNetCoreVersionFetcher] getDownloadUrl should throw if error encountered while detecting machine os", (done) => {
        process.env["__ostype__"] = "win";
        process.env["__getmachineosfail__"] = "true";
        process.env["__versioninfo__"] = `{"version":"2.2.104", "files": [{"name": "linux.tar.gz", "rid":"linux-x64", "url": ""}, {"name":"winpackage.zip", "rid":"win-x86", "url": ""}]}`;
        let tr = new ttm.MockTestRunner(path.join(__dirname, "versionFetcherGetDownloadUrlFailTests.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == false, ("Should have failed as machine os could not be detected."));
            assert(tr.stdout.indexOf("getMachinePlatformFailed") > 0, ("Should have thrown the error message as getMachineOs script execution was not successful."))
        }, tr, done);
    });

    it("[VersionFetcher.DotNetCoreVersionFetcher] getDownloadUrl should throw if zip package is not found for windows os", (done) => {
        process.env["__ostype__"] = "win";
        process.env["__getmachineosfail__"] = "false";
        process.env["__versioninfo__"] = `{"version":"2.2.104", "files": [{"name": "winpacakage.exe", "rid":"win-x64", "url": "https://path.to/file.exe"}, {"name": "winpacakage2.exe", "rid":"win-x86", "url": "https://path.to/file.exe"}]}`;
        let tr = new ttm.MockTestRunner(path.join(__dirname, "versionFetcherGetDownloadUrlFailTests.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == false, ("Should have failed as download URL is missing."));
            assert(tr.stdout.indexOf("DownloadUrlForMatchingOsNotFound") > 0, ("Should have thrown the error message as download url of zip could not be found for windows."))
        }, tr, done);
    });

    it("[VersionFetcher.DotNetCoreVersionFetcher] getDownloadUrl should throw if tar.gz package is not found for non windows os", (done) => {
        process.env["__ostype__"] = "osx";
        process.env["__getmachineosfail__"] = "false";
        process.env["__versioninfo__"] = `{"version":"2.2.104", "files": [{"name": "linux.tar", "rid":"linux-x64", "url": "https://path.to/file.pkg"}, {"name": "osx.pkg", "rid":"osx-x64", "url": "https://path.to/file.pkg"}]}`;
        let tr = new ttm.MockTestRunner(path.join(__dirname, "versionFetcherGetDownloadUrlFailTests.js"));
        tr.run();
        runValidations(() => {
            assert(tr.succeeded == false, ("Should have failed as download URL is missing."));
            assert(tr.stdout.indexOf("DownloadUrlForMatchingOsNotFound") > 0, ("Should have thrown the error message as download url of tar file could not be found for mac os."))
        }, tr, done);
    });

    // it("[VersionFetcher.DotNetCoreVersionFetcher] getDownloadUrl should return correct download URL for matching OS", (done) => {
    // });

    // it("[VersionInstaller] constructor should throw if installationPath doesn't exist and cannot be created", (done) => {
    // });

    // it("[VersionInstaller] downloadAndInstall should throw if passed arguments are empty or doesn't contain version or downloadUrl is malformed", (done) => {
    // });

    // it("[VersionInstaller] downloadAndInstall should throw if downloading version from URL fails", (done) => {
    // });

    // it("[VersionInstaller] downloadAndInstall should throw if extracting downloaded package or copying folders into installation path fails.", (done) => {
    // });

    // it("[VersionInstaller] downloadAndInstall should not throw if copying root files from package into installationPath fails", (done) => {
    // });

    // it("[VersionInstaller] downloadAndInstall should only copy files from root folder if version being installed in the path is greater than all other already present", (done) => {
    // });

    // it("[VersionInstaller] downloadAndInstall should throw if creating version.complete file fails.", (done) => {
    // });

    // it("[VersionInstaller] downloadAndInstall should complete successfully on complete installation and create complete file in both sdk and runtime when sdk is installed and in runtime when only runtime is installed.", (done) => {
    // });

    // it("[VersionInstaller] isVersionInstalled should throw if version being checked is not explicit.", (done) => {
    // });

    // it("[VersionInstaller] isVersionInstalled should return false if either folder or file with name as version is not present inside sdk folder.", (done) => {
    // });

    // it("[VersionInstaller] isVersionInstalled should return false if either folder or file with name as version is not present inside runtime path.", (done) => {
    // });

    // it("[VersionInstaller] isVersionInstalled should return true if both folder or file with name as version is present inside sdk/runtime path.", (done) => {
    // });

    // it("[dotnetcoreinstaller] run should default to use $(Agent.ToolsDirectory)/dotnet as installation path if installationPath input is empty.", (done) => {
    // });

    // it("[dotnetcoreinstaller] run should throw if versionSpec is invalid.", (done) => {
    // });

    // it("[dotnetcoreinstaller] run should throw if versionInfo for the version spec could not be found.", (done) => {
    // });

    // it("[dotnetcoreinstaller] run should skip installation if version found in cache.", (done) => {
    // });

    // it("[dotnetcoreinstaller] run should always prepend installationPath & dotnet_root to PATH environment variable.", (done) => {
    // });

    // it("[dotnetcoreinstaller] run should not fail if globalToolPath could not be created or set.", (done) => {
    // });

    // it("[dotnetcoreinstaller] run should always set multilevel lookup environment variable and by default restrict if input is not present.", (done) => {
    // });
});
