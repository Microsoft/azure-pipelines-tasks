import * as util from 'npm-common/util';
import * as constants from './constants';
import * as tl from 'vsts-task-lib/task';
import * as fs from 'fs';
import * as path from 'path';

async function run() {
    tl.setResourcePath(path.join(__dirname, 'task.json'));
    let indexFile = path.join(tl.getVariable("SAVE_NPMRC_PATH"), 'index.json');
    if (tl.exist(indexFile)) {
        let indexFileText = fs.readFileSync(indexFile, 'utf8');
        let jsonObject = JSON.parse(indexFileText);
        let npmrcIndex = JSON.stringify(jsonObject[tl.getInput(constants.NpmAuthenticateTaskInput.WorkingFile)]);
        util.restoreFileWithName(tl.getInput(constants.NpmAuthenticateTaskInput.WorkingFile), npmrcIndex, tl.getVariable("SAVE_NPMRC_PATH"));
        console.log(tl.loc("UndidChangesToNpmrc", tl.getInput(constants.NpmAuthenticateTaskInput.WorkingFile)));
        if (fs.readdirSync(tl.getVariable("SAVE_NPMRC_PATH")).length == 1) {
            tl.rmRF(tl.getVariable("NPM_AUTHENTICATE_TEMP_DIRECTORY"));
        }
    }
    else {
        console.log(tl.loc("NoIndex.jsonFile"));
    }
}
run();
