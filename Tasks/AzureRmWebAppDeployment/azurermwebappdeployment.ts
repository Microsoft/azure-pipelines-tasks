import tl = require('vsts-task-lib/task');
import path = require('path');
import fs = require('fs');

var azureRESTUtility = require ('webdeployment-common/azurerestutility.js');
var msDeployUtility = require('webdeployment-common/msdeployutility.js');
var zipUtility = require('webdeployment-common/ziputility.js');
var utility = require('webdeployment-common/utility.js');
var msDeploy = require('webdeployment-common/deployusingmsdeploy.js');
var jsonSubstitutionUtility = require('webdeployment-common/jsonvariablesubstitutionutility.js');
var xmlSubstitutionUtility = require('webdeployment-common/xmlvariablesubstitutionutility.js');
var xdtTransformationUtility = require('webdeployment-common/xdttransformationutility.js');

var kuduUtility = require('./kuduutility.js');
var armUrl = 'https://management.azure.com/';

async function run() {
    try {

        tl.setResourcePath(path.join( __dirname, 'task.json'));
        var connectedServiceName = tl.getInput('ConnectedServiceName', true);
        var webAppName: string = tl.getInput('WebAppName', true);
        var deployToSlotFlag: boolean = tl.getBoolInput('DeployToSlotFlag', false);
        var resourceGroupName: string = tl.getInput('ResourceGroupName', false);
        var slotName: string = tl.getInput('SlotName', false);
        var webDeployPkg: string = tl.getPathInput('Package', true);
        var virtualApplication: string = tl.getInput('VirtualApplication', false);
        var useWebDeploy: boolean = tl.getBoolInput('UseWebDeploy', false);
        var setParametersFile: string = tl.getPathInput('SetParametersFile', false);
        var removeAdditionalFilesFlag: boolean = tl.getBoolInput('RemoveAdditionalFilesFlag', false);
        var excludeFilesFromAppDataFlag: boolean = tl.getBoolInput('ExcludeFilesFromAppDataFlag', false);
        var takeAppOfflineFlag: boolean = tl.getBoolInput('TakeAppOfflineFlag', false);
        var additionalArguments: string = tl.getInput('AdditionalArguments', false);
        var webAppUri:string = tl.getInput('WebAppUri', false);
        var xmlTransformsAndVariableSubstitutions = tl.getBoolInput('XmlTransformsAndVariableSubstitutions', false);
        var xmlTransformation: boolean = tl.getBoolInput('XdtTransformation', false);
        var jsonVariableSubsFlag: boolean = tl.getBoolInput('JSONVariableSubstitutionsFlag', false);
        var jsonVariableSubsFiles = tl.getDelimitedInput('JSONVariableSubstitutions', '\n', false);
        var variableSubstitution: boolean = tl.getBoolInput('VariableSubstitution', false);
        var endPointAuthCreds = tl.getEndpointAuthorization(connectedServiceName, true);

        var isDeploymentSuccess: boolean = true;
        var deploymentErrorMessage: string;

        var SPN = new Array();
        SPN["servicePrincipalClientID"] = endPointAuthCreds.parameters["serviceprincipalid"];
        SPN["servicePrincipalKey"] = endPointAuthCreds.parameters["serviceprincipalkey"];
        SPN["tenantID"] = endPointAuthCreds.parameters["tenantid"];
        SPN["subscriptionId"] = tl.getEndpointDataParameter(connectedServiceName, 'subscriptionid', true);

        var publishingProfile = await azureRESTUtility.getAzureRMWebAppPublishProfile(SPN, webAppName, resourceGroupName, deployToSlotFlag, slotName);
        tl._writeLine(tl.loc('GotconnectiondetailsforazureRMWebApp0', webAppName));

        var availableWebPackages = utility.findfiles(webDeployPkg);
        if(availableWebPackages.length == 0) {
            throw new Error(tl.loc('Nopackagefoundwithspecifiedpattern'));
        }

        if(availableWebPackages.length > 1) {
            throw new Error(tl.loc('MorethanonepackagematchedwithspecifiedpatternPleaserestrainthesearchpatern'));
        }
        webDeployPkg = availableWebPackages[0];

        var isFolderBasedDeployment = utility.isInputPkgIsFolder(webDeployPkg);

        if(jsonVariableSubsFlag || (xmlTransformsAndVariableSubstitutions && (xmlTransformation || variableSubstitution))) { 
            var folderPath = path.join(tl.getVariable('System.DefaultWorkingDirectory'), 'temp_web_package_folder');
            if(isFolderBasedDeployment) {
                tl.cp(path.join(webDeployPkg, '/*'), folderPath, '-rf', false);
            }
            else {
                await zipUtility.unzip(webDeployPkg, folderPath);
            }
            if(xmlTransformation) {
                var environmentName = tl.getVariable('Release.EnvironmentName');
                if(tl.osType().match(/^Win/)) {
                    var transformConfigs = ["Release.config"];
                    if(environmentName) {
                        transformConfigs.push(environmentName + ".config");
                    }
                    xdtTransformationUtility.basicXdtTransformation(path.join(folderPath,'**', '*.config'), transformConfigs);  
                    tl._writeLine("XDT Transformations applied successfully");
                } else {
                    throw new Error(tl.loc("CannotPerformXdtTransformationOnNonWindowsPlatform"));
                }
            }
            if(variableSubstitution) {
                await xmlSubstitutionUtility.substituteAppSettingsVariables(folderPath);
            }
            if(jsonVariableSubsFlag) {
                jsonSubstitutionUtility.jsonVariableSubstitution(folderPath, jsonVariableSubsFiles);
            }
            webDeployPkg = (isFolderBasedDeployment) ? folderPath : await zipUtility.archiveFolder(folderPath, tl.getVariable('System.DefaultWorkingDirectory'), 'temp_web_package.zip')
        }

        if(virtualApplication) {
            publishingProfile.destinationAppUrl += "/" + virtualApplication;
        }

        if(webAppUri) {
            tl.setVariable(webAppUri, publishingProfile.destinationAppUrl);
        }
        if(utility.canUseWebDeploy(useWebDeploy)) {
            if(!tl.osType().match(/^Win/)){
                throw Error(tl.loc("PublishusingwebdeployoptionsaresupportedonlywhenusingWindowsagent"));
            }
            tl._writeLine("##vso[task.setvariable variable=websiteUserName;issecret=true;]" + publishingProfile.userName);         
            tl._writeLine("##vso[task.setvariable variable=websitePassword;issecret=true;]" + publishingProfile.userPWD);
            await msDeploy.DeployUsingMSDeploy(webDeployPkg, webAppName, publishingProfile, removeAdditionalFilesFlag,
                            excludeFilesFromAppDataFlag, takeAppOfflineFlag, virtualApplication, setParametersFile,
                            additionalArguments, isFolderBasedDeployment, useWebDeploy);
        } else {
            tl.debug(tl.loc("Initiateddeploymentviakuduserviceforwebapppackage", webDeployPkg));
            var azureWebAppDetails = await azureRESTUtility.getAzureRMWebAppConfigDetails(SPN, webAppName, resourceGroupName, deployToSlotFlag, slotName);
            await DeployUsingKuduDeploy(webDeployPkg, azureWebAppDetails, publishingProfile, virtualApplication, isFolderBasedDeployment, takeAppOfflineFlag);

        }
        
    } catch (error) {
        isDeploymentSuccess = false;
        deploymentErrorMessage = error;
    }
    if(publishingProfile != null) {
        try {
            tl._writeLine(await azureRESTUtility.updateDeploymentStatus(publishingProfile, isDeploymentSuccess));
        }
        catch(error) {
            tl.warning(error);
        }
    }
    if(!isDeploymentSuccess) {
        tl.setResult(tl.TaskResult.Failed, deploymentErrorMessage);
    }
    tl.debug("Updating config details for Web App");
    await updateConfigDetailsForWebApp(SPN, resourceGroupName, webAppName, deployToSlotFlag, slotName);
}


/**
 * Deploys website using Kudu REST API
 * 
 * @param   webDeployPkg                   Web deploy package
 * @param   webAppName                     Web App Name
 * @param   publishingProfile              Azure RM Connection Details
 * @param   virtualApplication             Virtual Application Name
 * @param   isFolderBasedDeployment        Input is folder or not
 *
 */
async function DeployUsingKuduDeploy(webDeployPkg, azureWebAppDetails, publishingProfile, virtualApplication, isFolderBasedDeployment, takeAppOfflineFlag) {

    try {
        var virtualApplicationMappings = azureWebAppDetails.properties.virtualApplications;
        var webAppZipFile = webDeployPkg;
        if(isFolderBasedDeployment) {
            webAppZipFile = await zipUtility.archiveFolder(webDeployPkg, tl.getVariable('System.DefaultWorkingDirectory'), 'temp_web_app_package.zip');
            tl.debug(tl.loc("Compressedfolderintozip", webDeployPkg, webAppZipFile));
        } else {
            if (await kuduUtility.containsParamFile(webAppZipFile)) {
                throw new Error(tl.loc("MSDeploygeneratedpackageareonlysupportedforWindowsplatform")); 
            }
        }
        var pathMappings = kuduUtility.getVirtualAndPhysicalPaths(virtualApplication, virtualApplicationMappings);
        await kuduUtility.deployWebAppPackage(webAppZipFile, publishingProfile, pathMappings[0], pathMappings[1], takeAppOfflineFlag);
        tl._writeLine(tl.loc('WebappsuccessfullypublishedatUrl0', publishingProfile.destinationAppUrl));
    }
    catch(error) {
        tl.error(tl.loc('Failedtodeploywebsite'));
        throw Error(error);
    }
}

async function updateConfigDetailsForWebApp(SPN, resourceGroupName: string, webAppName: string, deployToSlotFlag: boolean, slotName: string) {
    try {

        if(!deployToSlotFlag) {
            var requestURL = armUrl + 'subscriptions/' + SPN["subscriptionId"] + '/resources?$filter=resourceType EQ \'Microsoft.Web/Sites\' AND name EQ \'' + 
                            webAppName + '\'&api-version=2016-07-01';
            var accessToken = await azureRESTUtility.getAuthorizationToken(SPN);
            var headers = {
                authorization: 'Bearer '+ accessToken
            };
            var webAppID = await azureRESTUtility.getAzureRMWebAppID(SPN, webAppName, requestURL, headers);
            tl.debug('Web App details : ' + webAppID.id);
            resourceGroupName = webAppID.id.split ('/')[4];
            tl.debug('AzureRM Resource Group Name : ' + resourceGroupName);
        }
        
        var webAppConfigDetails = await azureRESTUtility.getAzureRMWebAppConfigDetails(SPN, webAppName, resourceGroupName, deployToSlotFlag, slotName);
        if(webAppConfigDetails.properties.scmType == "None") {
        var webConfigBody = {
            "properties": {
                "scmType": "VSTSRM"
            }
        };
        var metadata = await azureRESTUtility.getAzureRMWebAppMetadata(SPN, webAppName, resourceGroupName, deployToSlotFlag, slotName);
        if(deployToSlotFlag)
            metadata.properties["VSTSRM_SlotName"] = webAppName + "-" + slotName;
        else
            metadata.properties["VSTSRM_ProdAppName"] = webAppName;
        tl.debug("new metadata: "+JSON.stringify(metadata));
        tl._writeLine(await azureRESTUtility.updateAzureRMWebAppConfigDetails(SPN, webAppName, resourceGroupName, deployToSlotFlag, slotName, webConfigBody));
        tl._writeLine(await azureRESTUtility.updateAzureRMWebAppMetadata(SPN, webAppName, resourceGroupName, deployToSlotFlag, slotName, metadata));
        }
    }
    catch(error) {
        tl.warning(tl.loc("FailedToUpdateConfigDetails", webAppName));
    }
}

run();
