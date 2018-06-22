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

    if (tl.osType().match(/^Win/)) {
        it("[windows]should succeed if sdk installed successfully", (done) => {
            process.env["__releases_info__"] = "NewVersion";
            let tp = path.join(__dirname, "InstallWindows.js");
            let tr = new ttm.MockTestRunner(tp);
            tr.run();
            delete process.env["__releases_info__"];

            runValidations(() => {
                assert(tr.succeeded, "Should have succeeded");
                assert(tr.stdout.indexOf("loc_mock_ToolToInstall sdk 1.0.4") > -1, "should print to-be-installed info");
                assert(tr.stdout.indexOf("Checking local tool for dncs and version 1.0.4") > -1, "should check for local cached tool");
                assert(tr.stdout.indexOf("loc_mock_InstallingAfresh") > -1, "should install fresh if cache miss");
                assert(tr.stdout.indexOf("Downloading tool from https://dotnetcli.blob.core.windows.net/dotnet/Sdk/2.1.300/dotnet-sdk-2.1.300-win-x64.zip") > -1, "should download from correct url");
                assert(tr.stdout.indexOf("Extracting zip archieve from C:\\agent\\_temp\\someArchieve") > -1, "Should extract downloaded archieve corectly");
                assert(tr.stdout.indexOf("Caching dir C:\\agent\\_temp\\someDir for tool dncs version 1.0.4") > -1, "should cache correctly");
                assert(tr.stdout.indexOf("loc_mock_SuccessfullyInstalled sdk 1.0.4") > -1, "should print installed tool info");
                assert(tr.stdout.indexOf("prepending path: C:\\agent\\_tools\\cacheDir") > -1, "should pre-prend to PATH");
            }, tr, done);
        });

        it("[windows]should succeed if runtime installed successfully", (done) => {
            process.env["__package_type__"] = "runtime";
            process.env["__releases_info__"] = "NewVersion";

            let tp = path.join(__dirname, "InstallWindows.js");
            let tr = new ttm.MockTestRunner(tp);
            tr.run();
            delete process.env["__package_type__"];
            delete process.env["__releases_info__"];

            runValidations(() => {
                assert(tr.succeeded, "Should have succeeded");
                assert(tr.stdout.indexOf("loc_mock_ToolToInstall runtime 1.0.4") > -1, "should print to-be-installed info");
                assert(tr.stdout.indexOf("Checking local tool for dncr and version 1.0.4") > -1, "should check for local cached tool");
                assert(tr.stdout.indexOf("loc_mock_InstallingAfresh") > -1, "should install fresh if cache miss");
                assert(tr.stdout.indexOf("Downloading tool from https://dotnetcli.blob.core.windows.net/dotnet/Runtime/2.1.0/dotnet-runtime-2.1.0-win-x64.zip") > -1, "should download from correct url");
                assert(tr.stdout.indexOf("Extracting zip archieve from C:\\agent\\_temp\\someArchieve") > -1, "Should extract downloaded archieve corectly");
                assert(tr.stdout.indexOf("Caching dir C:\\agent\\_temp\\someDir for tool dncr version 1.0.4") > -1, "should cache correctly");
                assert(tr.stdout.indexOf("loc_mock_SuccessfullyInstalled runtime 1.0.4") > -1, "should print installed tool info");
                assert(tr.stdout.indexOf("prepending path: C:\\agent\\_tools\\cacheDir") > -1, "should pre-prend to PATH");
            }, tr, done);
        });

        it("[windows]should not install again if cache hit", (done) => {
            process.env["__cache_hit__"] = "true";
            let tp = path.join(__dirname, "InstallWindows.js");
            let tr = new ttm.MockTestRunner(tp);
            tr.run();
            delete process.env["__cache_hit__"];

            runValidations(() => {
                assert(tr.succeeded, "Should have succeeded");
                assert(tr.stdout.indexOf("loc_mock_ToolToInstall sdk 1.0.4") > -1, "should print to-be-installed info");
                assert(tr.stdout.indexOf("Checking local tool for dncs and version 1.0.4") > -1, "should check for local cached tool");
                assert(tr.stdout.indexOf("loc_mock_InstallingAfresh") == -1, "should not install fresh");
                assert(tr.stdout.indexOf("loc_mock_GettingDownloadUrls") == -1, "should not download");
                assert(tr.stdout.indexOf("loc_mock_UsingCachedTool") > -1, "should print that cached dir is being used");
                assert(tr.stdout.indexOf("Caching dir C:\\agent\\_temp\\someDir for tool dncs version 1.0.4") == -1, "should not update cache again");
                assert(tr.stdout.indexOf("prepending path: C:\\agent\\_tools\\oldCacheDir") > -1, "should pre-prend to PATH");
            }, tr, done);
        });

        it("[windows]should fail if explicit version is not used", (done) => {
            process.env["__implicit_version__"] = "true";
            let tp = path.join(__dirname, "InstallWindows.js");
            let tr = new ttm.MockTestRunner(tp);
            tr.run();
            delete process.env["__implicit_version__"];

            runValidations(() => {
                assert(tr.failed, "Should have failed");
                assert(tr.stdout.indexOf("loc_mock_ImplicitVersionNotSupported") > -1, "should print error message");
            }, tr, done);
        });

        it("[windows]should fail if runtime version is invalid", (done) => {
            process.env["__package_type__"] = "runtime";
            process.env["__releases_info__"] = "RuntimeVersionInvalid";
            let tp = path.join(__dirname, "InstallWindows.js");
            let tr = new ttm.MockTestRunner(tp);
            tr.run();
            delete process.env["__releases_info__"];
            delete process.env["__package_type__"];

            runValidations(() => {
                assert(tr.failed, "Should have failed");
                assert(tr.stdout.indexOf("loc_mock_VersionNotFound 1.0.4") > -1, "should print error message");
                assert(tr.stdout.indexOf("loc_mock_DownloadingUrl") == -1, "should not proceed with downloading");
            }, tr, done);
        });

        it("[windows]should fail if sdk version is invalid", (done) => {
            process.env["__releases_info__"] = "SdkVersionInvalid";

            let tp = path.join(__dirname, "InstallWindows.js");
            let tr = new ttm.MockTestRunner(tp);
            tr.run();
            delete process.env["__releases_info__"];

            runValidations(() => {
                assert(tr.failed, "Should have failed");
                assert(tr.stdout.indexOf("loc_mock_VersionNotFound 1.0.4") > -1, "should print error message");
                assert(tr.stdout.indexOf("loc_mock_DownloadingUrl") == -1, "should not proceed with downloading");
            }, tr, done);
        });

        it("[windows]should use dlc url if sdk blob url is not available", (done) => {
            process.env["__releases_info__"] = "SdkBlobUrlNotAvailable";
            let tp = path.join(__dirname, "InstallWindows.js");
            let tr = new ttm.MockTestRunner(tp);
            tr.run();
            delete process.env["__releases_info__"];

            runValidations(() => {
                assert(tr.succeeded, "Should have succeeded");
                assert(tr.stdout.indexOf("loc_mock_DownloadingUrl https://download.microsoft.com/download/C/7/D/C7DCA2DE-7163-45D1-A05A-5112DAF51445/dotnet-sdk-2.1.201-win-x64.zip") > -1, "should use dlc url");
            }, tr, done);
        });

        it("[windows]should use dlc url if runtime blob url is not available", (done) => {
            process.env["__package_type__"] = "runtime";
            process.env["__releases_info__"] = "RuntimeBlobUrlNotAvailable";
            let tp = path.join(__dirname, "InstallWindows.js");
            let tr = new ttm.MockTestRunner(tp);
            tr.run();
            delete process.env["__releases_info__"];
            delete process.env["__package_type__"];

            runValidations(() => {
                assert(tr.succeeded, "Should have succeeded");
                assert(tr.stdout.indexOf("loc_mock_DownloadingUrl https://download.microsoft.com/download/9/1/7/917308D9-6C92-4DA5-B4B1-B4A19451E2D2/dotnet-runtime-2.1.0-win-x64.zip") > -1, "should use dlc url");
            }, tr, done);
        });
    } else {
        it("[nix]should succeed if sdk installed successfully", (done) => {
            process.env["__releases_info__"] = "NewVersion";
            let tp = path.join(__dirname, "InstallNix.js");
            let tr = new ttm.MockTestRunner(tp);
            tr.run();
            delete process.env["__releases_info__"];

            runValidations(() => {
                assert(tr.succeeded, "Should have succeeded");
                assert(tr.stdout.indexOf("loc_mock_ToolToInstall sdk 1.0.4") > -1, "should print to-be-installed info");
                assert(tr.stdout.indexOf("Checking local tool for dncs and version 1.0.4") > -1, "should check for local cached tool");
                assert(tr.stdout.indexOf("loc_mock_InstallingAfresh") > -1, "should install fresh if cache miss");
                assert(tr.stdout.indexOf("Changing attribute for file /somedir/currdir/externals/get-os-distro.sh to 777") > -1, "should set executable attribute for install script");
                assert(tr.stdout.indexOf("loc_mock_DownloadingUrl https://dotnetcli.blob.core.windows.net/dotnet/Sdk/2.1.300/dotnet-sdk-2.1.300-linux-x64.tar.gz") > -1, "should download from correct url");
                assert(tr.stdout.indexOf("Extracting tar archieve from /agent/_temp/someArchieve") > -1, "Should extract downloaded archieve corectly");
                assert(tr.stdout.indexOf("Caching dir /agent/_temp/someDir for tool dncs version 1.0.4") > -1, "should cache correctly");
                assert(tr.stdout.indexOf("loc_mock_SuccessfullyInstalled sdk 1.0.4") > -1, "should print installed tool info");
                assert(tr.stdout.indexOf("prepending path: /agent/_tools/cacheDir") > -1, "should pre-prend to PATH");
            }, tr, done);
        });

        it("[nix]should succeed if runtime installed successfully", (done) => {
            process.env["__package_type__"] = "runtime";
            let tp = path.join(__dirname, "InstallNix.js");
            let tr = new ttm.MockTestRunner(tp);
            tr.run();
            delete process.env["__package_type__"];

            runValidations(() => {
                assert(tr.succeeded, "Should have succeeded");
                assert(tr.stdout.indexOf("loc_mock_ToolToInstall runtime 1.0.4") > -1, "should print to-be-installed info");
                assert(tr.stdout.indexOf("Checking local tool for dncr and version 1.0.4") > -1, "should check for local cached tool");
                assert(tr.stdout.indexOf("loc_mock_InstallingAfresh") > -1, "should install fresh if cache miss");
                assert(tr.stdout.indexOf("loc_mock_DownloadingUrl https://dotnetcli.blob.core.windows.net/dotnet/Runtime/2.1.0/dotnet-runtime-2.1.0-linux-x64.tar.gz") > -1, "should download from correct url");
                assert(tr.stdout.indexOf("Extracting tar archieve from /agent/_temp/someArchieve") > -1, "Should extract downloaded archieve corectly");
                assert(tr.stdout.indexOf("Caching dir /agent/_temp/someDir for tool dncr version 1.0.4") > -1, "should cache correctly");
                assert(tr.stdout.indexOf("loc_mock_SuccessfullyInstalled runtime 1.0.4") > -1, "should print installed tool info");
                assert(tr.stdout.indexOf("prepending path: /agent/_tools/cacheDir") > -1, "should pre-prend to PATH");
            }, tr, done);
        });

        it("[nix]should not install again if cache hit", (done) => {
            process.env["__cache_hit__"] = "true";
            let tp = path.join(__dirname, "InstallNix.js");
            let tr = new ttm.MockTestRunner(tp);
            tr.run();
            delete process.env["__cache_hit__"];

            runValidations(() => {
                assert(tr.succeeded, "Should have succeeded");
                assert(tr.stdout.indexOf("loc_mock_ToolToInstall sdk 1.0.4") > -1, "should print to-be-installed info");
                assert(tr.stdout.indexOf("Checking local tool for dncs and version 1.0.4") > -1, "should check for local cached tool");
                assert(tr.stdout.indexOf("loc_mock_InstallingAfresh") == -1, "should not install fresh");
                assert(tr.stdout.indexOf("loc_mock_GettingDownloadUrls") == -1, "should not download");
                assert(tr.stdout.indexOf("loc_mock_UsingCachedTool") > -1, "should print that cached dir is being used");
                assert(tr.stdout.indexOf("Caching dir /agent/_temp/someDir for tool dncs version 1.0.4") == -1, "should not update cache again");
                assert(tr.stdout.indexOf("prepending path: /agent/_tools/oldCacheDir") > -1, "should pre-prend to PATH");
            }, tr, done);
        });

        it("[nix]should succeed if legacy sdk installed successfully", (done) => {
            process.env["__releases_info__"] = "LegacyVersion";

            let tp = path.join(__dirname, "InstallNix.js");
            let tr = new ttm.MockTestRunner(tp);
            tr.run();
            delete process.env["__releases_info__"];

            runValidations(() => {
                assert(tr.succeeded, "Should have succeeded");
                assert(tr.stdout.indexOf("loc_mock_ToolToInstall sdk 1.0.4") > -1, "should print to-be-installed info");
                assert(tr.stdout.indexOf("Checking local tool for dncs and version 1.0.4") > -1, "should check for local cached tool");
                assert(tr.stdout.indexOf("loc_mock_InstallingAfresh") > -1, "should install fresh if cache miss");
                assert(tr.stdout.indexOf("loc_mock_DownloadingUrl https://dotnetcli.blob.core.windows.net/dotnet/Sdk/1.1.8/dotnet-dev-ubuntu.16.04-x64.1.1.8.tar.gz") > -1, "should download from correct url");
                assert(tr.stdout.indexOf("Extracting tar archieve from /agent/_temp/someArchieve") > -1, "Should extract downloaded archieve corectly");
                assert(tr.stdout.indexOf("Caching dir /agent/_temp/someDir for tool dncs version 1.0.4") > -1, "should cache correctly");
                assert(tr.stdout.indexOf("loc_mock_SuccessfullyInstalled sdk 1.0.4") > -1, "should print installed tool info");
                assert(tr.stdout.indexOf("prepending path: /agent/_tools/cacheDir") > -1, "should pre-prend to PATH");
            }, tr, done);
        });

        it("[nix]should succeed if legacy runtime installed successfully", (done) => {
            process.env["__package_type__"] = "runtime";
            process.env["__releases_info__"] = "LegacyVersion";

            let tp = path.join(__dirname, "InstallNix.js");
            let tr = new ttm.MockTestRunner(tp);
            tr.run();
            delete process.env["__package_type__"];
            delete process.env["__releases_info__"];

            runValidations(() => {
                assert(tr.succeeded, "Should have succeeded");
                assert(tr.stdout.indexOf("loc_mock_ToolToInstall runtime 1.0.4") > -1, "should print to-be-installed info");
                assert(tr.stdout.indexOf("Checking local tool for dncr and version 1.0.4") > -1, "should check for local cached tool");
                assert(tr.stdout.indexOf("loc_mock_InstallingAfresh") > -1, "should install fresh if cache miss");
                assert(tr.stdout.indexOf("loc_mock_DownloadingUrl https://dotnetcli.blob.core.windows.net/dotnet/Runtime/1.1.7/dotnet-ubuntu.16.04-x64.1.1.7.tar.gz") > -1, "should download from correct url");
                assert(tr.stdout.indexOf("Extracting tar archieve from /agent/_temp/someArchieve") > -1, "Should extract downloaded archieve corectly");
                assert(tr.stdout.indexOf("Caching dir /agent/_temp/someDir for tool dncr version 1.0.4") > -1, "should cache correctly");
                assert(tr.stdout.indexOf("loc_mock_SuccessfullyInstalled runtime 1.0.4") > -1, "should print installed tool info");
                assert(tr.stdout.indexOf("prepending path: /agent/_tools/cacheDir") > -1, "should pre-prend to PATH");
            }, tr, done);
        });

        it("[nix]should fail if runtime version is invalid", (done) => {
            process.env["__package_type__"] = "runtime";
            process.env["__releases_info__"] = "RuntimeVersionInvalid";
            let tp = path.join(__dirname, "InstallNix.js");
            let tr = new ttm.MockTestRunner(tp);
            tr.run();
            delete process.env["__releases_info__"];
            delete process.env["__package_type__"];

            runValidations(() => {
                assert(tr.failed, "Should have failed");
                assert(tr.stdout.indexOf("loc_mock_VersionNotFound 1.0.4") > -1, "should print error message");
                assert(tr.stdout.indexOf("loc_mock_DownloadingUrl") == -1, "should not proceed with downloading");
            }, tr, done);
        });

        it("[nix]should fail if sdk version is invalid", (done) => {
            process.env["__releases_info__"] = "SdkVersionInvalid";

            let tp = path.join(__dirname, "InstallNix.js");
            let tr = new ttm.MockTestRunner(tp);
            tr.run();
            delete process.env["__releases_info__"];

            runValidations(() => {
                assert(tr.failed, "Should have failed");
                assert(tr.stdout.indexOf("loc_mock_VersionNotFound 1.0.4") > -1, "should print error message");
                assert(tr.stdout.indexOf("loc_mock_DownloadingUrl") == -1, "should not proceed with downloading");
            }, tr, done);
        });

        it("[nix]should use dlc url if sdk blob url is not available", (done) => {
            process.env["__releases_info__"] = "SdkBlobUrlNotAvailable";
            let tp = path.join(__dirname, "InstallNix.js");
            let tr = new ttm.MockTestRunner(tp);
            tr.run();
            delete process.env["__releases_info__"];

            runValidations(() => {
                assert(tr.succeeded, "Should have succeeded");
                assert(tr.stdout.indexOf("loc_mock_DownloadingUrl https://download.microsoft.com/download/C/7/D/C7DCA2DE-7163-45D1-A05A-5112DAF51445/dotnet-sdk-2.1.201-linux-x64.tar.gz") > -1, "should use dlc url");
            }, tr, done);
        });

        it("[nix]should use dlc url if runtime blob url is not available", (done) => {
            process.env["__package_type__"] = "runtime";
            process.env["__releases_info__"] = "RuntimeBlobUrlNotAvailable";
            let tp = path.join(__dirname, "InstallNix.js");
            let tr = new ttm.MockTestRunner(tp);
            tr.run();
            delete process.env["__releases_info__"];
            delete process.env["__package_type__"];

            runValidations(() => {
                assert(tr.succeeded, "Should have succeeded");
                assert(tr.stdout.indexOf("loc_mock_DownloadingUrl https://download.microsoft.com/download/9/1/7/917308D9-6C92-4DA5-B4B1-B4A19451E2D2/dotnet-runtime-2.1.0-linux-x64.tar.gz") > -1, "should use dlc url");
            }, tr, done);
        });

        it("[nix]should fail if failed to machine platform", (done) => {
            process.env["__get_platform_failed__"] = "true";

            let tp = path.join(__dirname, "InstallNix.js");
            let tr = new ttm.MockTestRunner(tp);
            tr.run();
            delete process.env["__get_platform_failed__"];

            runValidations(() => {
                assert(tr.failed, "Should have failed");
                assert(tr.stdout.indexOf("loc_mock_getMachinePlatformFailed OS name could not be detected") > -1, "should print error message");
                assert(tr.stdout.indexOf("loc_mock_DownloadingUrl") == - 1, "should not proceed with downloading");
            }, tr, done);
        });
    }
});
