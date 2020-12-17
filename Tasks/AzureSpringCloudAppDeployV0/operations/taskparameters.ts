import tl = require('azure-pipelines-task-lib/task');
import { Package, PackageType } from 'webdeployment-common-v2/packageUtility';

export class TaskParametersUtility {
    public static getParameters(): TaskParameters {
        var taskParameters: TaskParameters = {
            ResourceGroupName: tl.getInput('ResourceGroupName', true),
            ConnectedServiceName: tl.getInput('ConnectedServiceName', true),
            SpringCloudServiceName: tl.getInput('SpringCloudServiceName', true),
            AppName: tl.getInput('AppName', true),
            DeploymentName: tl.getInput('DocumentName', true),
            SourceDirectory: tl.getPathInput('SourceDirectory', false),
            EnvironmentVariables: tl.getInput('EnvironmentVariables', false),
            JvmOptions: tl.getInput('JvmOptions', false),
            RuntimeVersion: RuntimeVersion[tl.getInput('RuntimeVersion', true)],
            Version: tl.getInput('Version', false),
            Verbose: tl.getBoolInput('Verbose',false)
        }
        taskParameters.Package = new Package(tl.getPathInput('Package', true));
        return taskParameters;
    }

}

export enum RuntimeVersion {
    java8, 
    java11
}

export interface TaskParameters {
    ConnectedServiceName?: string;
    ResourceGroupName?: string;
    SpringCloudServiceName?: string;
    AppName?: string;
    DeploymentName?: string;
    Package?: Package;
    SourceDirectory?: string;
    EnvironmentVariables?: string;
    JvmOptions?: string;
    RuntimeVersion?: RuntimeVersion;
    Version?: string;
    Verbose?: boolean;
}