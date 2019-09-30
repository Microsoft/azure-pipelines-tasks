import tl = require('azure-pipelines-task-lib/task');
import fs = require('fs');
import path = require('path');

var varUtility = require ('./variableutility.js');
var ltxdomutility = require("./ltxdomutility.js");
var npmdomutility = require("./npmdomutility.js");
var fileEncoding = require('./fileencoding.js');

function getReplacableTokenFromTags(xmlNode, variableMap) {
    var parameterSubValue = {};
    if(xmlNode.hasChildNodes()) {
        var children = xmlNode.childNodes;
        for (var childs = 0; childs < children.length; childs ++) {
            var childNode = children[childs];
            if ((varUtility.isObject(childNode)) && (!varUtility.isEmpty(childNode))) {
                if(childNode.attributes) {
                    var childNodeAttributes = childNode.attributes;
                    var childNodeAttributeName;
                    for (var nodeAttribute=0 ; nodeAttribute<childNodeAttributes.length; nodeAttribute++) {
                        if(childNodeAttributes[nodeAttribute].nodeName == 'name') {
                            childNodeAttributeName = childNodeAttributes[nodeAttribute].nodeValue;
                        }
                        if (((childNodeAttributes[nodeAttribute]).nodeValue).startsWith('$(ReplacableToken_') && variableMap[childNodeAttributeName]) {
                            var indexOfReplaceToken = '$(ReplacableToken_'.length;
                            var lastIndexOf_ = ((childNode.attributes[nodeAttribute]).nodeValue).lastIndexOf('_');
                            if(lastIndexOf_ <= indexOfReplaceToken) {
                                tl.debug('Attribute value is in incorrect format ! ' + childNode.attributes[nodeAttribute]);
                                continue;
                            }
                            parameterSubValue[((childNode.attributes[nodeAttribute]).nodeValue).substring(indexOfReplaceToken, lastIndexOf_)] = variableMap[childNodeAttributeName].replace(/"/g, "'");
                        }
                    }
                }
            }
        }
    }
    return parameterSubValue;
}

function substituteValueinParameterFile(parameterFilePath, parameterSubValue) {

    if(Object.keys(parameterSubValue).length === 0) {
        tl.debug('No substitution variables found for parameters.xml');
        return;  
    }
    var fileBuffer: Buffer = fs.readFileSync(parameterFilePath);
    var fileEncodeType = fileEncoding.detectFileEncoding(parameterFilePath, fileBuffer);
    var webConfigContent: string = fileBuffer.toString(fileEncodeType[0]);
    if(fileEncodeType[1]) {
        webConfigContent = webConfigContent.slice(1);
    }
    var xmlDocument;
    const paramFileReplacableToken = 'PARAM_FILE_REPLACE_TOKEN';
    var paramFileReplacableValues = {};
    try {
        var ltxDomUtiltiyInstance = new ltxdomutility.LtxDomUtility(webConfigContent);
        xmlDocument = ltxDomUtiltiyInstance.getXmlDom();
        for(var xmlChildNode of xmlDocument.children) {
            if(!varUtility.isObject(xmlChildNode)) {
                continue;
            }
            if(parameterSubValue[ xmlChildNode.attrs.name ]) {
                var paramFileReplacableTokenName = paramFileReplacableToken + '(' + xmlChildNode.attrs.name + ')';
                xmlChildNode.attrs.defaultValue = paramFileReplacableTokenName;
                tl.debug('Parameters file - Replacing value for name: ' + xmlChildNode.attrs.name + ' with : ' + paramFileReplacableTokenName);
                paramFileReplacableValues[paramFileReplacableTokenName] = parameterSubValue[ xmlChildNode.attrs.name ];
            }
        }
    }
    catch(error) {
        tl.debug("Unable to parse parameter file : " + parameterFilePath + ' Error: ' + error);
        return;
    }
    var domContent = (fileEncodeType[1] ? '\uFEFF' : '') + ltxDomUtiltiyInstance.getContentWithHeader(xmlDocument);
    for(var paramFileReplacableValue in paramFileReplacableValues) {
        tl.debug('Parameters file - Replacing value for temp_name: ' + paramFileReplacableValue);
        domContent = domContent.replace(paramFileReplacableValue, paramFileReplacableValues[paramFileReplacableValue]);
    }
    tl.writeFile(parameterFilePath, domContent, fileEncodeType[0]);
    tl.debug("Parameter file " + parameterFilePath + " updated.");
}

export function substituteAppSettingsVariables(folderPath, isFolderBasedDeployment, fileName?: string) {
    var configFiles = tl.findMatch(folderPath, fileName ? fileName : "**/*.config");
    // parameters.xml is considered when fileName is not provided or filename explicitly mentions parameters.xml
    var parameterFilePath = !fileName || fileName.toLocaleLowerCase().indexOf("parameters.xml") != -1 ? path.join(folderPath, 'parameters.xml') : null;
    if(!isFolderBasedDeployment && tl.exist(parameterFilePath)) {
        tl.debug('Detected parameters.xml file - XML variable substitution');
    }
    else {
        parameterFilePath = null;
    }
    var variableMap = varUtility.getVariableMap();
    var tags = ["applicationSettings", "appSettings", "connectionStrings", "configSections"];
    for(var configFile of configFiles) {
        substituteXmlVariables(configFile, tags, variableMap, parameterFilePath);
    }
}

export function substituteXmlVariables(configFile, tags, variableMap, parameterFilePath) {
    if(!tl.exist(configFile)) {
        throw new Error(tl.loc("Configfiledoesntexists", configFile));
    }
    if( !tl.stats(configFile).isFile()) {
        return;
    }
    console.log(tl.loc('VariableSubstitutionInitiated' , configFile));
    var fileBuffer: Buffer = fs.readFileSync(configFile);
    var fileEncodeType = fileEncoding.detectFileEncoding(configFile, fileBuffer);
    var webConfigContent: string = fileBuffer.toString(fileEncodeType[0]);
    if(fileEncodeType[1]) {
        webConfigContent = webConfigContent.slice(1);
    }
    var xmlDocument;
    try{
        var npmDomUtiltiyInstance = new npmdomutility.NpmDomUtility(webConfigContent);
        xmlDocument = npmDomUtiltiyInstance.getXmlDom();
    } 
    catch(error) {
        tl.debug("Unable to parse file : " + configFile);
        tl.debug(error);
        return;
    }
    var replacableTokenValues = {
        "APOS_CHARACTER_TOKEN": "'"
    };
    var isSubstitutionApplied: boolean = false;
    for(var tag of tags) {
        var nodes = npmDomUtiltiyInstance.getElementsByTagName(tag); 
        if(nodes.length == 0) {
            tl.debug("Unable to find node with tag '" + tag + "' in provided xml file.");
            continue;
        }
        for(var xmlNode of nodes) {
            if(varUtility.isObject(xmlNode)){
                console.log(tl.loc('SubstitutionForXmlNode' , xmlNode.nodeName));
                try {
                    if(xmlNode.nodeName == "configSections") {
                        isSubstitutionApplied = updateXmlConfigNodeAttribute(xmlNode, variableMap, replacableTokenValues, npmDomUtiltiyInstance) || isSubstitutionApplied;
                    }
                    else if(xmlNode.nodeName == "connectionStrings") {
                        if(parameterFilePath) {
                            var parameterSubValue = getReplacableTokenFromTags(xmlNode, variableMap);
                            substituteValueinParameterFile(parameterFilePath, parameterSubValue);
                        }
                        isSubstitutionApplied = updateXmlConnectionStringsNodeAttribute(xmlNode, variableMap, replacableTokenValues) || isSubstitutionApplied;
                    }
                    else {
                        isSubstitutionApplied = updateXmlNodeAttribute(xmlNode, variableMap, replacableTokenValues) || isSubstitutionApplied;
                    }
                } catch (error){
                    tl.debug("Error occurred while processing xml node : " + xmlNode.nodeName);
                    tl.debug(error);
                }
            }  
        }
    }

    if(isSubstitutionApplied) {
        replaceEscapeXMLCharacters(xmlDocument);
        var domContent = ( fileEncodeType[1]? '\uFEFF' : '' ) + npmDomUtiltiyInstance.getContentWithHeader(xmlDocument);
        for(var replacableTokenValue in replacableTokenValues) {
            tl.debug('Substituting original value in place of temp_name: ' + replacableTokenValue);
            domContent = domContent.split(replacableTokenValue).join(replacableTokenValues[replacableTokenValue]);
        }
        tl.writeFile(configFile, domContent, fileEncodeType[0]);
        console.log(tl.loc('ConfigFileUpdated' , configFile ));
    }
    else {
        console.log(tl.loc('SkippedUpdatingFile' , configFile));
    }
    
    return isSubstitutionApplied;
}

function updateXmlConfigNodeAttribute(xmlNode, variableMap, replacableTokenValues, npmDomUtiltiyInstance): boolean {
    var isSubstitutionApplied: boolean = false;
    var sections = npmDomUtiltiyInstance.getChildElementsByTagName(xmlNode, "section");
    for(var section of sections) {
        if(varUtility.isObject(section)) {
            var sectionName = section.getAttribute('name');
            if(!varUtility.isEmpty(sectionName)) {
                var customSectionNodes = npmDomUtiltiyInstance.getElementsByTagName(sectionName);
                if( customSectionNodes.length != 0) {
                    var customNode = customSectionNodes[0];
                    isSubstitutionApplied = updateXmlNodeAttribute(customNode, variableMap, replacableTokenValues) || isSubstitutionApplied;
                }
            }
        }
    }
    return isSubstitutionApplied;
}

function updateXmlNodeAttribute(xmlDomNode, variableMap, replacableTokenValues): boolean {

    var isSubstitutionApplied: boolean = false;
    if (varUtility.isEmpty(xmlDomNode) || !varUtility.isObject(xmlDomNode) || xmlDomNode.nodeName == "#comment") {
        tl.debug("Provided node is empty or a comment.");
        return isSubstitutionApplied;
    }

    var xmlDomNodeAttributes = xmlDomNode.attributes;
    const ConfigFileAppSettingsToken = 'CONFIG_FILE_SETTINGS_TOKEN';

    if(xmlDomNodeAttributes) {
        var attributeNameValue = "key";
        for ( var i = 0; i < xmlDomNodeAttributes.length; i ++) {
            var attribute = xmlDomNodeAttributes[i];
            attributeNameValue = (attribute.nodeName === "key" || attribute.nodeName == "name") ? attribute.nodeValue : attribute.nodeName;
            var attributeName = (attribute.nodeName === "key" || attribute.nodeName == "name") ? "value" : attribute.nodeName;

            if(variableMap[attributeNameValue] != undefined) {
                var ConfigFileAppSettingsTokenName = ConfigFileAppSettingsToken + '(' + attributeNameValue + ')';
                let isValueReplaced: boolean = false;
                if (xmlDomNode.hasAttribute(attributeName)) {
                    console.log(tl.loc('UpdatingKeyWithTokenValue' , attributeNameValue , ConfigFileAppSettingsTokenName));
                    xmlDomNode.setAttribute(attributeName, ConfigFileAppSettingsTokenName);
                    isValueReplaced = true;
                } else {
                    if(xmlDomNode.hasChildNodes()) {
                        var children = xmlDomNode.childNodes;
                        for (var childs = 0; childs < children.length; childs ++) {
                            var childNode = children[childs];
                            if(varUtility.isObject(childNode) && childNode.nodeName == attributeName) {
                                if (childNode.childNodes.length === 1) {
                                    console.log(tl.loc('UpdatingKeyWithTokenValue' , attributeNameValue , ConfigFileAppSettingsTokenName));
                                    childNode.childNodes[0].nodeValue = ConfigFileAppSettingsTokenName;
                                    childNode.childNodes[0].data = ConfigFileAppSettingsTokenName;
                                    isValueReplaced = true;
                                }
                            }
                        }
                    }
                }

                if(isValueReplaced) {
                    replacableTokenValues[ConfigFileAppSettingsTokenName] =  variableMap[attributeNameValue].replace(/"/g, "'");
                    isSubstitutionApplied = true;
                }
            }
        }
    }
    if(xmlDomNode.hasChildNodes()) {
        var children = xmlDomNode.childNodes;
        for (var childs = 0; childs < children.length; childs ++) {
            var childNode = children[childs];
            if(varUtility.isObject(childNode)) {
                isSubstitutionApplied = updateXmlNodeAttribute(childNode, variableMap, replacableTokenValues) || isSubstitutionApplied;
            }
        }
    }
    return isSubstitutionApplied;
}

function updateXmlConnectionStringsNodeAttribute(xmlDomNode, variableMap, replacableTokenValues): boolean {

    var isSubstitutionApplied: boolean = false;
    const ConfigFileConnStringToken = 'CONFIG_FILE_CONN_STRING_TOKEN';
    if (varUtility.isEmpty(xmlDomNode) || !varUtility.isObject(xmlDomNode) || xmlDomNode.nodeName == "#comment") {
        tl.debug("Provided node is empty or a comment.");
        return isSubstitutionApplied;
    }

    if(xmlDomNode.hasAttributes()) {
        if(xmlDomNode.hasAttribute("connectionString")) {
            var connectionStringName = xmlDomNode.getAttribute("name");
            if (connectionStringName && variableMap[xmlDomNode.getAttribute("name")]) {
                var ConfigFileConnStringTokenName = ConfigFileConnStringToken + '(' + connectionStringName + ')';
                tl.debug(tl.loc('SubstitutingConnectionStringValue' , connectionStringName , ConfigFileConnStringTokenName));
                xmlDomNode.setAttribute("connectionString", ConfigFileConnStringTokenName);
                replacableTokenValues[ConfigFileConnStringTokenName] = variableMap[connectionStringName].replace(/"/g, "'");
                isSubstitutionApplied = true;
            }
            else if(variableMap["connectionString"] != undefined) {
                var ConfigFileConnStringTokenName = ConfigFileConnStringToken + '(connectionString)';
                tl.debug(tl.loc('SubstitutingConnectionStringValue' , connectionStringName , ConfigFileConnStringTokenName));
                xmlDomNode.setAttribute("connectionString", ConfigFileConnStringTokenName);
                replacableTokenValues[ConfigFileConnStringTokenName] = variableMap["connectionString"].replace(/"/g, "'");
                isSubstitutionApplied = true
            }
        }
    }

    if(xmlDomNode.hasChildNodes()) {
        var children = xmlDomNode.childNodes;
        for (var childs = 0; childs < children.length; childs ++) {
            var childNode = children[childs];
            if(varUtility.isObject(childNode)) {
                isSubstitutionApplied =  updateXmlConnectionStringsNodeAttribute(childNode, variableMap, replacableTokenValues) || isSubstitutionApplied;
            }
        }
    }
    return isSubstitutionApplied;
}

function replaceEscapeXMLCharacters(xmlDOMNode) {
    if(!xmlDOMNode || typeof xmlDOMNode == 'string') {
        return;
    }

    var xmlDomNodeAttributes = xmlDOMNode.attributes;
    if(xmlDomNodeAttributes) {
        for(var xmlAttribute = 0 ; xmlAttribute < xmlDomNodeAttributes.length; xmlAttribute ++) {
            if(xmlDomNodeAttributes[xmlAttribute]) {
                (xmlDomNodeAttributes[xmlAttribute]).nodeValue = ((xmlDomNodeAttributes[xmlAttribute]).nodeValue).replace(/'/g, "APOS_CHARACTER_TOKEN");
            }
        }
    }

    if(xmlDOMNode.hasChildNodes())
    {
        var xmlDOMchildNodes = xmlDOMNode.childNodes;
        for (var i = 0; i <xmlDOMchildNodes.length; i++) {
            var xmlChild = xmlDOMchildNodes[i];
            replaceEscapeXMLCharacters(xmlChild);
        }
    }
}