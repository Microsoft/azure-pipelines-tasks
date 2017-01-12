/// <reference path="../../definitions/node.d.ts" /> 
/// <reference path="../../definitions/vsts-task-lib.d.ts" /> 

import path = require("path");
import tl = require("vsts-task-lib/task");
import mgExtManager = require("./MachineGroupAgentExtensionManager");

var computeManagementClient = require('./azure-arm-compute');

import deployAzureRG = require("./DeployAzureRG");

export class VirtualMachine {
    private taskParameters: deployAzureRG.AzureRGTaskParameters;
    private client;
    private failureCount: number;
    private successCount: number;
    private vmCount: number;
    private errors: string;
    private machineGroupAgentExtensionManager: mgExtManager.MachineGroupAgentExtensionManager;

    constructor(taskParameters: deployAzureRG.AzureRGTaskParameters) {
        this.taskParameters = taskParameters;
        this.successCount = 0;
        this.failureCount = 0;
        this.machineGroupAgentExtensionManager = new mgExtManager.MachineGroupAgentExtensionManager(this.taskParameters);
    }

    private postOperationCallBack = (error, result, request, response) => {
        if (error) {
            this.failureCount++;
            this.errors += error.message;
            this.errors += "\n";
        } else {
            this.successCount++;
        }
        this.setTaskResult();
    }

    private setTaskResult() {
        if (this.failureCount + this.successCount == this.vmCount) {
            if (this.failureCount > 0) {
                tl.setResult(tl.TaskResult.Failed, tl.loc("FailureOnVMOperation", this.taskParameters.action, this.errors));
                process.exit();
            }
            tl.setResult(tl.TaskResult.Succeeded, tl.loc("SucceededOnVMOperation", this.taskParameters.action));
        }
    }

    public execute() {
        var client = new computeManagementClient.ComputeManagementClient(this.taskParameters.credentials, this.taskParameters.subscriptionId);
        client.virtualMachines.list(this.taskParameters.resourceGroupName, (error, listOfVms, request, response) => {
            if (error != undefined) {
                tl.setResult(tl.TaskResult.Failed, tl.loc("VM_ListFetchFailed", this.taskParameters.resourceGroupName, error.message));
                process.exit();
            }
            if (listOfVms.length == 0) {
                console.log("No VMs found");
                tl.setResult(tl.TaskResult.Succeeded, tl.loc("SucceededOnVMOperation", this.taskParameters.action));
                process.exit();
            }
            this.vmCount = listOfVms.length;
            switch (this.taskParameters.action) {
                case "Start":
                    for (var i = 0; i < listOfVms.length; i++) {
                        var vmName = listOfVms[i]["name"];
                        console.log(tl.loc("VM_Start", vmName));
                        client.virtualMachines.start(this.taskParameters.resourceGroupName, vmName, this.postOperationCallBack);
                    }
                    break;
                case "Stop":
                    for (var i = 0; i < listOfVms.length; i++) {
                        var vmName = listOfVms[i]["name"];
                        console.log(tl.loc("VM_Stop", vmName));
                        client.virtualMachines.powerOff(this.taskParameters.resourceGroupName, vmName, this.postOperationCallBack);
                    }
                    break;
                case "Restart":
                    for (var i = 0; i < listOfVms.length; i++) {
                        var vmName = listOfVms[i]["name"];
                        console.log(tl.loc("VM_Restart", vmName));
                        client.virtualMachines.restart(this.taskParameters.resourceGroupName, vmName, this.postOperationCallBack);
                    }
                    break;
                case "Delete":
                    for (var i = 0; i < listOfVms.length; i++) {
                        var vmName = listOfVms[i]["name"];
                        var extDelPromise = this.machineGroupAgentExtensionManager.deleteMGExtension(listOfVms[i]);
                        var deleteExtensionFromVM = this.createDeleteVMExtensionCallback(client, vmName);
                        extDelPromise.then(deleteExtensionFromVM, deleteExtensionFromVM);
                    }
            }
        });
    }

    private createDeleteVMExtensionCallback(client, vmName) {
        var deleteExtensionFromVM = () => {
            client.virtualMachines.deleteMethod(this.taskParameters.resourceGroupName, vmName, this.postOperationCallBack)
        }
        return deleteExtensionFromVM;
    }
}

