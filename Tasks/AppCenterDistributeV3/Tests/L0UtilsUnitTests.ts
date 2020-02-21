import * as path from 'path';
import * as assert from 'assert';
import {spawnSync} from 'child_process';

export function utilsUnitTests() {
    describe('Utils unit tests', function () {
        describe('findCommonParent', function() {
            it('returns containing directory for single file', function() {
                const tp = path.join(__dirname, 'UnitTests', 'Utils', 'FindCommonParentForSingleFileReturnsContainingDirectory.js');
                const spawn = spawnSync('node', [tp]);
                assert.equal(spawn.status, 0);
            });

            it('returns directory itself for single directory', function() {
                const tp = path.join(__dirname, 'UnitTests', 'Utils', 'FindCommonParentForSingleDirectoryReturnsDirectoryItself.js');
                const spawn = spawnSync('node', [tp]);
                assert.equal(spawn.status, 0);
            });

            it('returns common parent for multiple values', function() {
                const tp = path.join(__dirname, 'UnitTests', 'Utils', 'FindCommonParentForMultipleFilesReturnsCorrectResult.js');
                const spawn = spawnSync('node', [tp]);
                assert.equal(spawn.status, 0);
            });
        });
    });
}
