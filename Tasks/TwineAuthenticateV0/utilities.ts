import * as fs from "fs";
import * as path from "path";
import * as tl from "vsts-task-lib/task";

export function getPypircPath(): string {
    let pypircPath: string;
    if (tl.getVariable("PYPIRC_PATH")) {
        pypircPath = tl.getVariable("PYPIRC_PATH");
    }
    else {
       // tslint:disable-next-line:max-line-length
       let tempPath = tl.getVariable("Agent.BuildDirectory") || tl.getVariable("Agent.ReleaseDirectory") || process.cwd();
       tempPath = path.join(tempPath, "twineAuthenticate");
       tl.mkdirP(tempPath);
       let savePypircPath = fs.mkdtempSync(tempPath + path.sep);
       pypircPath = savePypircPath + path.sep + ".pypirc";
    }
    return pypircPath;
}
