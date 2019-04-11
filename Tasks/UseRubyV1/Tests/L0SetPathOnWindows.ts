import * as os from 'os';
import * as path from 'path';
import * as tmrm from 'azure-pipelines-task-lib/mock-run';
import * as ma from 'azure-pipelines-task-lib/mock-answer';
import { Platform } from 'azure-pipelines-task-lib';

let taskPath = path.join(__dirname, '..', 'useruby.js');
let tr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

// Fill in missing mock-task.getPlatform
// Should be able to remove when https://github.com/Microsoft/azure-pipelines-task-lib/pull/514
// is in an azure-pipelines-task-lib release (not in 3.0.0-preview)
const tl = require('azure-pipelines-task-lib/mock-task');
const tlClone = Object.assign({}, tl);
tlClone.getPlatform = () => Platform.Windows;
const inputs = {
    version: '2.4'
};
tlClone.getInput = (n, r?) => inputs[n];
tr.registerMock('azure-pipelines-task-lib/mock-task', tlClone);

tr.registerMock('azure-pipelines-tool-lib/tool', {
    findLocalTool: () => '\\Ruby\\2.4.4',
    prependPath: (s: string) => {
        console.log('##vso[task.prependpath]' + s);
    }
});

tr.registerMock('os', {
    type: () => { return 'win32'; },
    EOL: os.EOL,
    arch: os.arch
});

tr.registerMock('path', {
    join: path.win32.join
});

tr.setAnswers(<ma.TaskLibAnswers> {
    "which": {
        "sudo": "sudo"
    },
    "checkPath": {
        "sudo": true,
    },
    "exec": {
       "sudo ln -sf /Ruby/2.4.4/bin/ruby /usr/bin/ruby": {
            "code": 0,
            "stdout": "Executed Successfully"
        },
    },
});

tr.run();

