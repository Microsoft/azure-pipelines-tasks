const fs = require('fs');
const Octokit = require('@octokit/rest');
const path = require('path');
const jsyaml = require('js-yaml');
const azdev = require('azure-devops-node-api');

const githubPAT = process.env['GITHUB_PAT'];
const azpPAT = process.env['AZP_PAT'];

// Number of bugs an area is allowed to have before a P0 AzDevOps bug is filed.
const bugTolerance = 50;
// Number of stale bugs an area is allowed to have before a P0 AzDevOps bug is filed.
const staleBugTolerance = 10;
// Number of untouched bugs an area is allowed to have before a P0 AzDevOps bug is filed. An untouched bug is one that is both stale and has never been responded to.
const untouchedBugTolerance = 0;
// Number of days a bug can avoid having activity before being marked stale.
const staleTimeout = 30;

// Reads in a mapping of paths to labels owned by that path from issue-rules.yml
function getPathMappings() {
    let mappingDict = {};
    var yaml = jsyaml.safeLoad(fs.readFileSync(path.join(__dirname, '..', 'issue-rules.yml'), 'utf8'));
    var pathMappings = yaml['pathMappings'];
    pathMappings.forEach(mapping => {
        mappingDict[mapping['path']] = mapping['labels']
    })
    return mappingDict;
}

function banner(text) {
    console.log();
    console.log('----------------------------------------------------------');
    console.log(text);
    console.log('----------------------------------------------------------');
    console.log();
}

function header(text) {
    console.log('--------' + text + '--------');
}

// Given a list of GitHub issues, filters out Pull Requests (the GitHub API doesn't differentiate between issues and PRs)
function filterOutPullRequests(issues) {
    return issues.filter((value) => {
        return !value.pull_request;
    })
}

// Prints a map sorted on the second function. Takes an optional printFunction parameter to dictate how we print the output
function printSortedMap(dict, printFunction){
    // Create items array
    var items = Object.keys(dict).map(function(key) {
        return [key, dict[key]];
    });

    // Sort the array based on the second element
    items.sort(function(first, second) {
        return second[1] - first[1];
    });

    // Create a new array with only the first 5 items
    items.forEach(item => {
        if (!printFunction) {
            console.log(item[0] + ': ' + item[1]);
        } else {
            printFunction(item);
        }
    })
}

// Takes a list of github issues and returns an object mapping issue labels to the number of issues with that label
function getIssuesByLabel(issues, issueType) {
    issueType = issueType.toLowerCase();
    let labelMap = {};
    issues.forEach(issue => {
        if (issue.labels) {
            let containsIssueType = false;
            
            issue.labels.forEach(label => {
                const labelName = label.name;
                if (labelName.toLowerCase(labelName) == issueType) {
                    containsIssueType = true;
                }
            });
            
            if (containsIssueType) {
                issue.labels.forEach(label => {
                    const labelName = label.name;
                    if (labelName.toLowerCase(labelName) != issueType) {
                        if (labelName in labelMap) {
                            labelMap[labelName]++;
                        } else {
                            labelMap[labelName] = 1;
                        }
                    }
                });
            }
        }
    });

    return labelMap;
}

function getProblem(bugs, staleBugs, untouchedBugs) {
    let problem = '';

    // Special case because we need commas
    if (bugs > bugTolerance && staleBugs > staleBugTolerance && untouchedBugs > untouchedBugTolerance) {
        return 'bugs, stale bugs, and untouched stale bugs';
    }

    if (bugs > bugTolerance) {
        problem = 'bugs';
    }
    if (staleBugs > staleBugTolerance) {
        if (problem) {
            problem += ' and ';
        }
        problem += 'stale bugs';
    }
    if (untouchedBugs > untouchedBugTolerance) {
        if (problem) {
            problem += ' and ';
        }
        problem += 'untouched stale bugs';
    }

    return problem;
}

// Generates urls to view bugs by label for the bodies of the bugs
function getIssueUrls(labels) {
    var urls = '';
    labels.forEach(label => {
        urls += `<div>https://github.com/microsoft/azure-pipelines-tasks/issues?q=is%3Aissue+is%3Aopen+label%3Abug+label%3A%22${label.replace(': ', '%3A+')}%22</div>`
    });

    return urls;
}

// Gets the node api for getting workitems
async function getNodeApi() {
    let authHandler = azdev.getPersonalAccessTokenHandler(azpPAT); 
    let connection = new azdev.WebApi('https://dev.azure.com/mseng', authHandler);  
    return await connection.getWorkItemTrackingApi();
}

// Creates a bug. If one already exists with the same path/title, does nothing
async function createBug(nodeApi, path, title, message) {
    // First try to find an already created bug. If that doesn't exist, create a new one.
    const wiql = `SELECT System.ID from workitems where [Title] = '${title}' and [System.AreaPath] = '${path}' AND [System.State] = 'Active'`;
    const items = await nodeApi.queryByWiql({query: wiql});

    if (!items['workItems'] || items['workItems'].length == 0) {
        const workItem = await nodeApi.createWorkItem(null, [
            {
                "op": "add",
                "path": "/fields/System.Title",
                "value": title
            },
            {
              "op": "add",
              "path": "/fields/System.AreaPath",
              "value": path
            },
            {
                "op": "add",
                "path": "/fields/Microsoft.VSTS.Common.Priority",
                "value": "1"
            },
            {
                "op": "add",
                "path": "/fields/System.Tags",
                "value": "azure-pipelines-tasks"
            }
        ], 'AzureDevOps', 'Bug');

        await nodeApi.addComment({text: message}, 'AzureDevOps', workItem.id);
        console.log(workItem.id);
    } else {
        console.log(`Work item already exists:\n${items['workItems']}`)
    }

    console.log(await nodeApi.getComments('AzureDevOps', 1644436));
}

/*
* This is the important function for 90+% of users. Takes in some issue maps and assigns bugs based off of the results.
* 
* @param bugsByLabel              The number of bugs assigned to each area
* @param staleBugsByLabel         The number of stale bugs assigned to each area
* @param untouchedBugsByLabel     The number of untouched bugs assigned to each area
* 
* @returns void
*/
async function fileBugs(bugsByLabel, staleBugsByLabel, untouchedBugsByLabel) {
    banner('Filing bugs for the following areas');

    const nodeApi = await getNodeApi();
    const labelToPathMapping = getPathMappings();

    const paths = Object.keys(labelToPathMapping);
    for(i = 0; i < paths.length; i++) {
        const path = paths[i];
        let bugs = 0;
        let staleBugs = 0;
        let untouchedBugs = 0;
        const labels = labelToPathMapping[path];
        for (var j = 0; j < labels.length; j++) {
            const label = labels[j];
            if (label in bugsByLabel) {
                bugs += bugsByLabel[label];
            }
            if (label in staleBugsByLabel) {
                staleBugs += staleBugsByLabel[label];
            }
            if (label in untouchedBugsByLabel) {
                untouchedBugs += untouchedBugsByLabel[label];
            }
        }

        const problem = getProblem(bugs, staleBugs, untouchedBugs);

        if (problem) {
            header(path);
            console.log('Bugs:', bugs);
            console.log('Stale bugs:', staleBugs);
            console.log('Untouched bugs:', untouchedBugs);
            console.log();

            let bugTitle = `Too many bugs in https://github.com/microsoft/azure-pipelines-tasks`;
            // Format message as html so it renders correctly.
            let bugMessage = 
`<div>The number of ${problem} assigned to the labels owned by this area path in https://github.com/microsoft/azure-pipelines-tasks has exceeded the number of allowable bugs.</div>
<div><br></div>
<div>Labels owned by this area: ${JSON.stringify(labels)}</div>
<div><br></div>
<div>Current bug counts:</div>
<div>Bugs: ${bugs}</div>
<div>Stale bugs (>30 days without action): ${staleBugs}</div>
<div>Untouched bugs (stale, never responded to): ${untouchedBugs}</div>
<div><br></div>
<div>The number of allowable bugs for a given area is:</div>
<div>Bugs: ${bugTolerance}</div>
<div>Stale bugs (>30 days without action): ${staleBugTolerance}</div>
<div>Untouched bugs (stale, never responded to): ${untouchedBugTolerance}</div>
<div><br></div>
<div>To view this area's bugs, visit the following urls:</div>
<div>${getIssueUrls(labels)}</div>
<div><br></div>
<div>If you believe this issue was filed in error, please follow the following steps:</div>
<div>1) Check the path mappings at the bottom of https://github.com/microsoft/azure-pipelines-tasks/blob/master/issue-rules.yml. If your path is incorrectly mapped, add a PR and tag @damccorm for review</div>
<div>2) If the path mappings look correct, file a bug in AzureDevOps\\VSTS\\Pipelines\\Platform and assign Danny McCormick (alias damccorm)</div>`;

            await createBug(nodeApi, path, bugTitle, bugMessage);
        }
    }
}

// Main - gets issues from GitHub and performs computation on them, culminating in us filing bugs.
async function run() {
    const octokit = new Octokit({
        auth: githubPAT
    });

    banner('Getting issues...');
    const options = octokit.issues.listForRepo.endpoint.merge({
        owner: 'microsoft',
        repo: 'azure-pipelines-tasks',
        state: 'open'
    });
    const issuesAndPulls = await octokit.paginate(options);

    const issues = filterOutPullRequests(issuesAndPulls);
    console.log('Found ' + issues.length + ' issues of any type.');

    banner('Analyzing issues...');
    const labelMap = getIssuesByLabel(issues, 'bug');

    header('Open bugs by area');
    printSortedMap(labelMap, (item) => {
        if (item[0].startsWith('Area: ')) {
            console.log(item[0].slice('Area: '.length) + ': ' + item[1]);
        }
    });

    banner(`Getting stale issues (open with no activity in the last ${staleTimeout} days)`);
    const today = new Date();
    const staleDate = new Date().setDate(today.getDate()-staleTimeout);
    const staleIssues = issues.filter(value => {
        const updated = new Date(value.updated_at);
        return updated < staleDate;
    });
    console.log('Found ' + staleIssues.length + ' stale issues of any type.');

    banner('Analyzing stale issues');
    const staleLabelMap = getIssuesByLabel(staleIssues, 'bug');

    header('Stale bugs by area');
    printSortedMap(staleLabelMap, (item) => {
        if (item[0].startsWith('Area: ')) {
            console.log(item[0].slice('Area: '.length) + ': ' + item[1]);
        }
    });

    banner('Getting stale issues that have never been responded to');
    const untouchedIssues = staleIssues.filter(value => {
        return (!value.comments || value.comments < 1);
    });
    console.log('Found ' + untouchedIssues.length + ' untouched  issues of any type.');

    banner('Analyzing stale issues that have never been responded to');
    const untouchedLabelMap = getIssuesByLabel(untouchedIssues, 'bug');

    header('Stale bugs by area');
    printSortedMap(untouchedLabelMap, (item) => {
        if (item[0].startsWith('Area: ')) {
            console.log(item[0].slice('Area: '.length) + ': ' + item[1]);
        }
    });

    try {
        await fileBugs(labelMap, staleLabelMap, untouchedLabelMap);
    }
    catch (err) {
        // Log error before throwing or it will get swallowed since its inside an async function
        console.log(err);
        throw err;
    }
}

run();
