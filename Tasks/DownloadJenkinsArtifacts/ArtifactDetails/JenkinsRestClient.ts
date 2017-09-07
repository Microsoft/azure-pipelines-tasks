import * as Q from 'q';
import * as tl from 'vsts-task-lib/task';

var handlebars = require('handlebars');
var request = require('request');

export class JenkinsRestClient {
    constructor() {
        this.RegisterCustomerHandleBars();
    }

    public RegisterCustomerHandleBars(): void {
        handlebars.registerHelper('CaseIgnoreEqual', function(lhs, rhs, options) {
            if (!lhs && !rhs) {
                return options.fn(this);
            }

            if ((lhs && !rhs) || (!lhs && rhs)) {
                return options.inverse(this);
            }
            
            if (lhs.toUpperCase() != rhs.toUpperCase()) {
                return options.inverse(this);                    
            }
            else {
                return options.fn(this);
            }
        });

        handlebars.registerHelper('lookupAction', function(list, key, options) {
            if (!!list) {
                for (let i = 0, len = list.length; i < len; i++) {
                    if (list[i][key]) {
                        return list[i];
                    }
                }
            }

            return null;
        });

        handlebars.registerHelper('containsInArray', function(array, value, options) {
            if (!!array) {
                for(let i = 0, len = array.length; i < len; i++) {
                    tl.debug(`checking ${array[i]} ${value}`);
                    if (!!array[i] && array[i].indexOf(value) > -1) {
                        return options.fn(this);
                    }
                }
            }

            return options.inverse(this);
        });

        handlebars.registerHelper('chopTrailingSlash', function(value, options) {
            var result: any = value;
            if (!!value && value.substr(-1) === '/') {
                result = value.substr(0, value.length - 1)
            }

            return result;
        });
    }

    public DownloadJsonContent(urlPath: string, handlebarSource: string, additionalHandlebarContext: { [key: string]: any } = null): Q.Promise<any> {
        let defer = Q.defer<any>();

        const connection = tl.getInput("connection", true);
        const endpointUrl = tl.getEndpointUrl(connection, false);
        const jobName = tl.getInput("definition", true);
        const username = tl.getEndpointAuthorizationParameter(connection, 'username', false);
        const password = tl.getEndpointAuthorizationParameter(connection, 'password', false);
        const strictSSL: boolean = ('true' !== tl.getEndpointDataParameter(connection, 'acceptUntrustedCerts', true));

        let requestUrl: string = `${endpointUrl}/job/${jobName}/${urlPath}`;
        console.log('Downloading content form Jenkins server:' + requestUrl + ' with strict SSL:' + strictSSL);

        request.get({url: requestUrl, strictSSL: strictSSL}, (err, res, body) => {
            if (res && body && res.statusCode === 200)  {
                tl.debug(`Content received from server ${body}`);
                let jsonResult = JSON.parse(body);

                if (!handlebarSource) {
                    defer.resolve(jsonResult);
                }
                else {
                    try {
                        tl.debug(`Applying the handlbar source ${handlebarSource} on the result`);
                        let template = handlebars.compile(handlebarSource);
                        if (additionalHandlebarContext) {
                            for(let key in additionalHandlebarContext) {
                            tl.debug(`Adding additional context {${key} --> ${additionalHandlebarContext[key]}} to the original context`)
                                jsonResult[key] = additionalHandlebarContext[key];
                            };
                        }

                        var result = template(jsonResult);
                        defer.resolve(result);
                    }
                    catch(err) {
                        tl.debug(`handlebar failed with an error ${err}`);
                        defer.reject(err)
                    }
                }
            }
            else {
                if (res && res.statusCode) {
                    tl.debug(tl.loc('ServerCallErrorCode', res.statusCode));
                }

                if (body) {
                    tl.debug(body);
                }

                defer.reject(new Error(tl.loc('ServerCallFailed')));
            }
        }).auth(username, password, true);

        return defer.promise;
    }
}