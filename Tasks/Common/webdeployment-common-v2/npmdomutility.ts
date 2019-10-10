var varUtility = require("./variableutility.js");
var DOMParser = require('xmldom').DOMParser;

export class NpmDomUtility  {

    private xmlDomLookUpTable = {};
    private xmlDom;

    public constructor(xmlContent) {
        this.xmlDomLookUpTable = {};
        this.xmlDom = new DOMParser().parseFromString(xmlContent,"text/xml");
        this.buildLookUpTable(this.xmlDom);
    }

    public getXmlDom() {
        return this.xmlDom;
    }

    public getContentWithHeader(xmlDom) {
        return xmlDom ? xmlDom.toString() : "";
    }

    /**
     * Define method to create a lookup for DOM 
     */
    private buildLookUpTable(node) {
        if(node){
            let nodeName = node.nodeName;
            if(nodeName){
                nodeName = nodeName.toLowerCase();
                var listOfNodes = this.xmlDomLookUpTable[nodeName];
                if(listOfNodes == null || !(Array.isArray(listOfNodes))) {
                    listOfNodes = [];
                    this.xmlDomLookUpTable[nodeName] = listOfNodes;
                }
                listOfNodes.push(node);
                if(node.hasChildNodes()) {
                    let children = node.childNodes;
                    for(let i=0 ; i < children.length; i++){
                        let childNodeName = children[i].nodeName;
                        if(childNodeName) {
                            this.buildLookUpTable(children[i]);
                        }
                    }
                }
            }
        }
    }

    /**
     *  Returns array of nodes which match with the tag name.
     */
    public getElementsByTagName(nodeName) {
        if(varUtility.isEmpty(nodeName))
            return [];
        let selectedElements = this.xmlDomLookUpTable[nodeName.toLowerCase()];
        if(!selectedElements){
            selectedElements = [];
        }
        return selectedElements;
    }

    /**
     *  Search in subtree with provided node name
     */
    public getChildElementsByTagName(node, tagName) {
        if(!varUtility.isObject(node) )
            return [];
        var liveNodes = [];
        if(node.hasChildNodes()){
            var children = node.childNodes;
            for(let i=0; i < children.length; i++ ){
                let childName = children[i].nodeName;
                if( !varUtility.isEmpty(childName) && tagName == childName){
                    liveNodes.push(children[i]);
                }
                let liveChildNodes = this.getChildElementsByTagName(children[i], tagName);
                if(liveChildNodes && liveChildNodes.length > 0){
                    liveNodes = liveNodes.concat(liveChildNodes);
                }
            }
        }
        return liveNodes;
    }
}
