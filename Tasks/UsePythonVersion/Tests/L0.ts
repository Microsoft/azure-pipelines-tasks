import * as assert from 'assert';
import { EOL } from 'os';
import * as path from 'path';

import * as mockery from 'mockery';
import * as mockTask from 'vsts-task-lib/mock-task';
import * as usePythonVersion from '../usepythonversion';

/** Reload the unit under test to use mocks that have been registered. */
function reload(): typeof usePythonVersion {
    return require('../usepythonversion');
}

describe('UsePythonVersion L0 Suite', function () {
    before(function () {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    after(function () {
        mockery.disable();
    });

    afterEach(function () {
        mockery.deregisterAll();
        mockery.resetCache();
    })

    it('finds version in cache', async function () {
        let buildVariables: any = {};
        const mockBuildVariables = {
            setVariable: (variable: string, value: string) => {
                buildVariables[variable] = value;
            },
            getVariable: (variable: string) => buildVariables[variable]
        };
        mockery.registerMock('vsts-task-lib/task', Object.assign({}, mockTask, mockBuildVariables));

        const toolPath = path.join('/', 'Python', '3.6.4');
        mockery.registerMock('vsts-task-tool-lib/tool', {
            findLocalTool: () => toolPath
        });

        const uut = reload();
        const parameters = {
            versionSpec: '3.6',
            outputVariable: 'Python',
            addToPath: false
        };

        assert.strictEqual(buildVariables['Python'], undefined);

        await uut.usePythonVersion(parameters, uut.Platform.Linux);
        assert.strictEqual(buildVariables['Python'], toolPath);
    });

    it('rejects version not in cache', async function (done: MochaDone) {
        mockery.registerMock('vsts-task-lib/task', mockTask);
        mockery.registerMock('vsts-task-tool-lib/tool', {
            findLocalTool: () => null,
            findLocalToolVersions: () => ['2.7.13']
        });

        const uut = reload();
        const parameters = {
            versionSpec: '3.x',
            outputVariable: 'Python',
            addToPath: false
        };

        try {
            await uut.usePythonVersion(parameters, uut.Platform.Linux);
            done(new Error('should not have succeeded'));
        } catch (e) {
            const expectedMessage = [
                'loc_mock_VersionNotFound 3.x',
                'loc_mock_ListAvailableVersions',
                '2.7.13'
            ].join(EOL);

            assert.strictEqual(e.message, expectedMessage);
            done();
        }
    });

    it('sets PATH correctly on Linux', async function () {
        mockery.registerMock('vsts-task-lib/task', mockTask);

        const toolPath = path.join('/', 'Python', '3.6.4');
        let mockPath = '';
        mockery.registerMock('vsts-task-tool-lib/tool', {
            findLocalTool: () => toolPath,
            prependPath: (s: string) => {
                mockPath = s + ':' + mockPath;
            }
        });

        const uut = reload();
        const parameters = {
            versionSpec: '3.6',
            outputVariable: 'Python',
            addToPath: true
        };

        await uut.usePythonVersion(parameters, uut.Platform.Linux);
        assert.strictEqual(`${toolPath}:`, mockPath);
    });

    it('sets PATH correctly on Windows', async function () {
        mockery.registerMock('vsts-task-lib/task', mockTask);

        const toolPath = path.join('/', 'Python', '3.6.4');
        let mockPath = '';
        mockery.registerMock('vsts-task-tool-lib/tool', {
            findLocalTool: () => toolPath,
            prependPath: (s: string) => {
                mockPath = s + ';' + mockPath;
            }
        });

        const uut = reload();
        const parameters = {
            versionSpec: '3.6',
            outputVariable: 'Python',
            addToPath: true
        };

        await uut.usePythonVersion(parameters, uut.Platform.Windows);
        // On Windows, must add the "Scripts" directory to PATH as well
        assert.strictEqual(`${path.join(toolPath, 'Scripts')};${toolPath};`, mockPath);
    });
});
