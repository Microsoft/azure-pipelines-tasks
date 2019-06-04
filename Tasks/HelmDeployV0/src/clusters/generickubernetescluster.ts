"use strict";

import tl = require('vsts-task-lib/task');
import kubectlutility = require("kubernetes-common/kubectlutility");

export async function getKubeConfig(): Promise<string> {
    var kubernetesServiceEndpoint = tl.getInput("kubernetesServiceEndpoint", true);
    var authorizationType = tl.getEndpointDataParameter(kubernetesServiceEndpoint, 'authorizationType', true);
    if (!authorizationType || authorizationType === "Kubeconfig")
    {
        return kubectlutility.getKubeconfigForCluster(kubernetesServiceEndpoint);
    }
    else if (authorizationType === "ServiceAccount" || authorizationType === "AzureSubscription")
    {
        return kubectlutility.createKubeconfig(kubernetesServiceEndpoint);
    } 
}