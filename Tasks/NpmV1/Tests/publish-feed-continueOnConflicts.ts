import * as path from 'path';

import { TaskLibAnswerExecResult } from 'azure-pipelines-task-lib/mock-answer';

import { NpmCommand, NpmTaskInput, RegistryLocation } from '../constants';
import { NpmMockHelper } from './NpmMockHelper';

let taskPath = path.join(__dirname, '..', 'npm.js');
let tmr = new NpmMockHelper(taskPath);

tmr.setInput(NpmTaskInput.Command, NpmCommand.Publish);
tmr.setInput(NpmTaskInput.WorkingDir, 'workingDir');
tmr.setInput(NpmTaskInput.PublishRegistry, RegistryLocation.Feed);
tmr.setInput(NpmTaskInput.PublishFeed, 'SomeFeedId');
tmr.setInput(NpmTaskInput.AllowPackageConflicts, 'true');
tmr.mockNpmCommand('publish', {
    code: 403,
    stdout: 'The feed already contains the package \'packageName\' at version \'1.0.0\''
} as TaskLibAnswerExecResult);
tmr.answers.rmRF[path.join('workingDir', '.npmrc')] = { success: true };
tmr.answers["stats"] = {"workingDir": {"isDirectory":true}};

tmr.run();
