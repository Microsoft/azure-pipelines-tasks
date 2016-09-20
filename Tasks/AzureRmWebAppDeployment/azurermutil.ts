/// <reference path="../../definitions/node.d.ts" />
/// <reference path="../../definitions/q.d.ts" />
/// <reference path="../../definitions/vsts-task-lib.d.ts" />
/// <reference path="../../definitions/vso-node-api.d.ts" />

var adal = require ('adal-node');
var parseString = require('xml2js').parseString;

import tl = require('vsts-task-lib/task');
import Q = require('q');
import httpClient = require('vso-node-api/HttpClient');
import restClient = require('vso-node-api/RestClient');

var httpObj = new httpClient.HttpClient(tl.getVariable("AZURE_HTTP_USER_AGENT"));
var restObj = new restClient.RestClient(httpObj);

var AuthenticationContext = adal.AuthenticationContext;
var authUrl = 'https://login.windows.net/';
var armUrl = 'https://management.azure.com/';
var azureApiVersion = 'api-version=2015-08-01';

/**
 * updates the deployment status in kudu service
 * 
 * @param   publishingProfile     Publish Profile details
 * @param   isDeploymentSuccess   Status of Deployment
 * 
 * @returns promise with string
 */
export function updateDeploymentStatus(publishingProfile, isDeploymentSuccess: boolean): Q.Promise<string>  {
    var deferred = Q.defer<string>();

    var webAppPublishKuduUrl = publishingProfile.publishUrl;
    if(webAppPublishKuduUrl) {
        var requestDetails = getUpdateHistoryRequest(webAppPublishKuduUrl, isDeploymentSuccess);
        var accessToken = 'Basic ' + (new Buffer(publishingProfile.userName + ':' + publishingProfile.userPWD).toString('base64'));
        var headers = {
            authorization: accessToken
        };

        restObj.replace(requestDetails['requestUrl'], null, requestDetails['requestBody'], headers, null,
            (error, response, body) => {
                if(error) {
                    deferred.reject(error);
                }
                else if(response === 200) {
                    deferred.resolve(tl.loc("Successfullyupdateddeploymenthistory", body.url));
                }
                else {
                    tl.warning(body);
                    deferred.reject(tl.loc("Failedtoupdatedeploymenthistory"));
                }
        });
    }
    else {
        deferred.reject(tl.loc('WARNINGCannotupdatedeploymentstatusSCMendpointisnotenabledforthiswebsite'));
    }

    return deferred.promise;
}

/**
 * Gets the Azure RM Web App Connections details from SPN
 * 
 * @param   SPN                 Service Principal Name
 * @param   webAppName          Name of the web App
 * @param   resourceGroupName   Resource Group Name
 * @param   deployToSlotFlag    Flag to check slot deployment
 * @param   slotName            Name of the slot
 * 
 * @returns (JSON)            
 */
export async function getAzureRMWebAppPublishProfile(SPN, webAppName: string, resourceGroupName: string, deployToSlotFlag: boolean, slotName: string) {
    if(!deployToSlotFlag) {
        var webAppID = await getAzureRMWebAppID(SPN, webAppName, 'Microsoft.Web/Sites');
        resourceGroupName = webAppID.id.split ('/')[4];
    }
    var deferred = Q.defer();
    var slotUrl = deployToSlotFlag ? "/slots/" + slotName : "";
    var accessToken = await getAuthorizationToken(SPN);
    
    var url = armUrl + 'subscriptions/' + SPN.subscriptionId + '/resourceGroups/' + resourceGroupName +
                 '/providers/Microsoft.Web/sites/' + webAppName + slotUrl + '/publishxml?' + azureApiVersion;
    var headers = {
        authorization: 'Bearer '+ accessToken

    };

    httpObj.get('POST', url, headers, (error, response, body) => {
        if(error) {
            deferred.reject(error);
        }
        else if(response.statusCode === 200) {
            parseString(body, (error, result) => {
                for (var index in result.publishData.publishProfile) {
                    if (result.publishData.publishProfile[index].$.publishMethod === "MSDeploy")
                        deferred.resolve(result.publishData.publishProfile[index].$);
                }
                deferred.reject(tl.loc('ErrorNoSuchDeployingMethodExists'));
            });
        }
        else {
            tl.error(response.statusMessage);
            deferred.reject(tl.loc('UnabletoretrieveconnectiondetailsforazureRMWebApp0StatusCode1', webAppName, response.statusCode));
        }
    });

    return deferred.promise;
}

function getAuthorizationToken(SPN): Q.Promise<string> {

    var deferred = Q.defer<string>();
    var authorityUrl = authUrl + SPN.tenantID;

    var context = new AuthenticationContext(authorityUrl);
    context.acquireTokenWithClientCredentials(armUrl, SPN.servicePrincipalClientID, SPN.servicePrincipalKey, (error, tokenResponse) => {
        if(error) {
            deferred.reject(error);
        }
        else {
            deferred.resolve(tokenResponse.accessToken);
        }
    });

    return deferred.promise;
}

function getDeploymentAuthor(): string {
    var author = tl.getVariable('build.sourceVersionAuthor');

    if(author === undefined) {
        author = tl.getVariable('build.requestedfor');
    }

    if(author === undefined) {
        author = tl.getVariable('release.requestedfor');
    }

    if(author === undefined) {
        author = tl.getVariable('agent.name');
    }

    return author;
}

function getUpdateHistoryRequest(webAppPublishKuduUrl: string, isDeploymentSuccess: boolean): any {
    
    var status = isDeploymentSuccess ? 4 : 3;
    var status_text = (status == 4) ? "success" : "failed";
    var author = getDeploymentAuthor();

    var buildUrl = tl.getVariable('build.buildUri');
    var releaseUrl = tl.getVariable('release.releaseUri');

    var buildId = tl.getVariable('build.buildId');
    var releaseId = tl.getVariable('release.releaseId');

    var collectionUrl = tl.getVariable('system.TeamFoundationCollectionUri'); 
    var teamProject = tl.getVariable('system.teamProject');

    var buildOrReleaseUrl = "" ;
    var deploymentId = "";

    if(releaseUrl !== undefined) {
        deploymentId = releaseId + Date.now();
        buildOrReleaseUrl = collectionUrl + teamProject + "/_apps/hub/ms.vss-releaseManagement-web.hub-explorer?releaseId=" + releaseId + "&_a=release-summary";
    }
    else if(buildUrl !== undefined) {
        deploymentId = buildId + Date.now();
        buildOrReleaseUrl = collectionUrl + teamProject + "/_build?buildId=" + buildId + "&_a=summary";
    }
    else {
        throw new Error(tl.loc('CannotupdatedeploymentstatusuniquedeploymentIdCannotBeRetrieved'));
    }

    var message = "Updating Deployment History For Deployment " + buildOrReleaseUrl;
    var requestBody = {
        status : status,
        status_text : status_text, 
        message : message,
        author : author,
        deployer : 'VSTS',
        details : buildOrReleaseUrl
    };

    var webAppHostUrl = webAppPublishKuduUrl.split(':')[0];
    var requestUrl = "https://" + encodeURIComponent(webAppHostUrl) + "/deployments/" + encodeURIComponent(deploymentId);

    var requestDetails = new Array<string>();
    requestDetails["requestBody"] = requestBody;
    requestDetails["requestUrl"] = requestUrl;
    return requestDetails;
}

async function getAzureRMWebAppID(SPN, webAppName: string, resourceType: string) {

    var deferred = Q.defer<any>();
    var accessToken = await getAuthorizationToken(SPN);

    var url = armUrl + 'subscriptions/' + SPN.subscriptionId + '/resources?$filter=resourceType EQ \'' + resourceType +
                        '\' AND name EQ \'' + webAppName + '\'&api-version=2016-07-01';
    var headers = {
        authorization: 'Bearer '+ accessToken
    };

    httpObj.get('GET', url, headers, (error, response, body) => {
        if(error) {
            deferred.reject(error);
        }
        else if(response.statusCode === 200) {
            var webAppIDDetails = JSON.parse(body);
            deferred.resolve(webAppIDDetails.value[0]);
        }
        else {
            tl.error(response.statusMessage);
            deferred.reject(tl.loc('UnabletoretrieveWebAppIDforazureRMWebApp0StatusCode1', webAppName, response.statusCode));
        }
    });

    return deferred.promise;
}

/**
 *  REST request for azure webapp config details. Config details contains virtual application mappings.
 *  
 *  @param SPN                 Subscription details
 *  @param webAppName          Web application name
 *  @param deployToSlotFlag    Should deploy to slot
 *  @param slotName            Slot for deployment
 */
export async function getAzureRMWebAppConfigDetails(SPN, webAppName: string, resourceGroupName: string, deployToSlotFlag: boolean, slotName: string) {

    if(!deployToSlotFlag) {
        var webAppID = await getAzureRMWebAppID(SPN, webAppName, 'Microsoft.Web/Sites');
        resourceGroupName = webAppID.id.split ('/')[4];
    }

    var deferred = Q.defer<any>();
    var accessToken = await getAuthorizationToken(SPN);
    var headers = {
        authorization: 'Bearer '+ accessToken
    };

    var slotUrl = deployToSlotFlag ? "/slots/" + slotName : "";
    var configUrl = armUrl + 'subscriptions/' + SPN.subscriptionId + '/resourceGroups/' + resourceGroupName +
             '/providers/Microsoft.Web/sites/' + webAppName + slotUrl +  '/config/web?' + azureApiVersion;
    tl.debug(tl.loc("Requestingconfigdetails", configUrl));

    httpObj.get('GET', configUrl, headers, (error, response, body) => {
        if( error ) {
            deferred.reject(error);
        }
        else if(response.statusCode === 200) {
            var obj = JSON.parse(body);
            deferred.resolve(obj);
        }
        else {
            tl.error(response.statusMessage);
            deferred.reject(tl.loc('ErrorOccurredStausCode0',response.statusCode));
        }
    });

    return deferred.promise;
}