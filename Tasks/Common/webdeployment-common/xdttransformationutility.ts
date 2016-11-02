import tl = require('vsts-task-lib/task');
import trm = require('vsts-task-lib/toolrunner');
import path = require('path');

export function expandWildcardPattern(wildcardPattern : string) {
	var matchingFiles = tl.glob(wildcardPattern);
	var filesList = {};
	for (let i = 0; i < matchingFiles.length; i++) {
		matchingFiles[i] = matchingFiles[i].replace(/\//g, '\\');
		filesList[matchingFiles[i]] = true;
	}

	return filesList;
}

/**
* Applys XDT transform on Source file using the Transform file
*
* @param	sourceFile	 Source Xml File
* @param	tansformFile Transform Xml File
*
*/
export function applyXdtTransformation(sourceFile, transformFile) {
	var cttBatchFile = tl.getVariable('System.DefaultWorkingDirectory') + '\\' + 'cttCommand.bat';
	var cttPath = path.join(__dirname, "..", "..", "ctt", "ctt.exe"); 
	var cttArgs = ' s:"' + sourceFile + '" t:"' + transformFile + '" d:"' + sourceFile + '" pw';
	var cttCommand = '"' + cttPath + '" ' + cttArgs + '\n';
	tl.writeFile(cttBatchFile, cttCommand);
	tl.debug(tl.loc("Runningcommand", cttCommand));
	var cttExecutionResult = tl.execSync("cmd", ['/C', cttBatchFile]);
	if(cttExecutionResult.stderr) {
		throw new Error(tl.loc("XdtTransformationErrorWhileTransforming", sourceFile, transformFile));
	}
}

/**
* Performs XDT transformations on *.config using ctt.exe
*
* @param	sourcePattern	The source wildcard pattern on which the transforms need to be applied
* @param    transformConfigs  The array of transform config names, ex : ["Release.config", "EnvName.config"]
* 
*/
export function basicXdtTransformation(sourcePattern, transformConfigs) {
	var sourceXmlFiles = expandWildcardPattern(sourcePattern);
	Object.keys(sourceXmlFiles).forEach( function(sourceXmlFile) {
		var sourceBasename = path.win32.basename(sourceXmlFile, ".config");	
		transformConfigs.forEach( function(transformConfig) {
			var transformXmlFile = path.join(path.dirname(sourceXmlFile), sourceBasename + "." + transformConfig);
			if(sourceXmlFiles[transformXmlFile]) {
				tl.debug('Applying XDT Transformation : ' + transformXmlFile + '->' + sourceXmlFile);
				applyXdtTransformation(sourceXmlFile, transformXmlFile);
			}
		});
	});	
}