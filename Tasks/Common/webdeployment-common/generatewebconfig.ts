import tl = require('vsts-task-lib/task');
import fs = require('fs');
import path = require('path');

export function generateWebConfigFile(webConfigTargetPath: string, appType: string, substitutionParameters: any) {
    // Get the template path for the given appType
    var webConfigTemplatePath = path.join(__dirname, 'WebConfigTemplates', appType.toLowerCase());
    var webConfigContent: string = fs.readFileSync(webConfigTemplatePath, 'utf8');
    webConfigContent = replaceMultiple(webConfigContent, substitutionParameters);
    tl.writeFile(webConfigTargetPath, webConfigContent, { encoding: "utf8" });
}

function replaceMultiple(text: string, substitutions: any): string {
    for(var key in substitutions) {
        tl.debug('Replacing: ' + '{' + key + '} with: ' + substitutions[key].value);
        text = text.replace(new RegExp('{' + key + '}', 'g'), substitutions[key].value);
    }
    return text;
}
