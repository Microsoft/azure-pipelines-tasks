import ma = require('vsts-task-lib/mock-answer');
import tmrm = require('vsts-task-lib/mock-run');
import path = require('path');
import fs = require('fs');

let taskPath = path.join(__dirname, '..', 'predownloadsecurefile.js');
let tr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

tr.setInput('secureFile', 'mySecureFileId');
tr.setInput('targetFolder', 'C:/temp');

process.env['AGENT_VERSION'] = '2.116.0';
process.env['HOME'] = '/users/test';

let secureFileHelperMock = require('securefiles-common/securefiles-common-mock');
tr.registerMock('securefiles-common/securefiles-common', secureFileHelperMock);

tr.registerMock('fs', {
    writeFileSync: function (filePath, contents) {
    }
});

// provide answers for task mock
let a: ma.TaskLibAnswers = <ma.TaskLibAnswers>{
    "which": {
        "cp": "/bin/cp"
    },
    "checkPath": {
        "/bin/cp": true
    },
    "exist": {
        "/build/temp/mySecureFileId.filename": true
    }
};
tr.setAnswers(a);

tr.run();

