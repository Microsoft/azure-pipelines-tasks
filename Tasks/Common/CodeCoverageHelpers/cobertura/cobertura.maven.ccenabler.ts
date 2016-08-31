/// <reference path="../../../../definitions/Q.d.ts" />
/// <reference path="../../../../definitions/string.d.ts" />
/// <reference path="../../../../definitions/vsts-task-lib.d.ts" />
/// <reference path="../../../../definitions/node.d.ts" />

import * as util from "../utilities";
import * as tl from "vsts-task-lib/task";
import * as ccc from "../codecoverageconstants";
import * as cc from "../codecoverageenabler";
import * as str from "string";
import * as os from "os";
import * as Q from "q";

export class CoberturaMavenCodeCoverageEnabler extends cc.CoberturaCodeCoverageEnabler {

    protected includeFilter: string;
    protected excludeFilter: string;
    // -----------------------------------------------------
    // Enable code coverage for Cobertura Maven Builds
    // - enableCodeCoverage: CodeCoverageProperties  - ccProps
    // -----------------------------------------------------    
    public enableCodeCoverage(ccProps: { [name: string]: string }): Q.Promise<boolean> {
        let _this = this;

        _this.buildFile = ccProps["buildFile"];
        let classFilter = ccProps["classFilter"];
        let reportDir = ccProps["reportDir"];

        let filter = _this.extractFilters(classFilter);
        _this.excludeFilter = _this.applyCoberturaFilterPattern(filter.excludeFilter).join(",");
        _this.includeFilter = _this.applyCoberturaFilterPattern(filter.includeFilter).join(",");

        return util.readXmlFileAsJson(_this.buildFile)
            .then(function (resp) {
                return _this.addCodeCoveragePluginData(resp);
            })
            .thenResolve(true);
    }

    protected addCodeCoverageNodes(buildJsonContent: any): Q.Promise<any> {
        let _this = this;
        let pluginsNode = null;
        let isMultiModule = false;

        if (!buildJsonContent.project) {
            return Q.reject("Invalid build file");
        }

        if (buildJsonContent.project.modules) {
            console.log("Multimodule project detected");
            isMultiModule = true;
        }

        if (!buildJsonContent.project.build) {
            console.log("Build tag is not present");
            buildJsonContent.project.build = {};
        }

        if (!buildJsonContent.project.build || typeof buildJsonContent.project.build === "string") {
            buildJsonContent.project.build = {};
        }

        if (buildJsonContent.project.build.pluginManagement) {
            if (typeof buildJsonContent.project.build.pluginManagement === "string") {
                buildJsonContent.project.build.pluginManagement = {};
            }
            pluginsNode = buildJsonContent.project.build.pluginManagement.plugins;
        }
        else {
            if (!buildJsonContent.project.build.plugins || typeof buildJsonContent.project.build.plugins === "string") {
                buildJsonContent.project.build.plugins = {};
            }
            pluginsNode = buildJsonContent.project.build.plugins;
        }

        if (!buildJsonContent.project.reporting || typeof buildJsonContent.project.reporting === "string") {
            buildJsonContent.project.reporting = {};
        }

        let ccPluginData = ccc.coberturaMavenEnable(_this.includeFilter, _this.excludeFilter, String(isMultiModule));
        let reportContent = ccc.coberturaMavenReport();

        return Q.allSettled([ccPluginData, reportContent])
            .then(function (resp) {
                util.addPropToJson(pluginsNode, "plugin", resp[1]);
                util.addPropToJson(buildJsonContent.project, "reporting", resp[0]);
            });
    }

    protected addCodeCoveragePluginData(pomJson: any): Q.Promise<void> {
        let _this = this;
        return _this.addCodeCoverageNodes(pomJson)
            .then(function (buildContent) {
                return util.writeJsonAsXmlFile(_this.buildFile, buildContent);
            });
    }
}