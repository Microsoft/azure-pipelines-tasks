import assert = require('assert');
import path = require('path');
import fs = require('fs');
import * as ttm from 'azure-pipelines-task-lib/mock-test';

const testRoot = path.join(__dirname, 'test_structure');

const removeFolder = function(curPath) {
    if (fs.existsSync(curPath)) {
        fs.readdirSync(curPath).forEach((file, index) => {
        const newPath = path.join(path, file);
        if (fs.lstatSync(newPath).isDirectory()) {
            removeFolder(newPath);
        } else {
            fs.unlinkSync(newPath);
        }
        });
        fs.rmdirSync(curPath);
    }
}

describe('DeleteFiles Suite', function () {
    this.timeout(60000);

    before(() => {
        removeFolder(testRoot);
        fs.mkdirSync(testRoot);
        console.log('AAAAAAAAAAAAAA');
        console.log(fs.readdirSync(path.join(__dirname, '..')));
    })

    function runValidations(validator: () => void, tr, done) {
        try {
            validator();
            done();
        }
        catch (error) {
            console.log("STDERR", tr.stderr);
            console.log("STDOUT", tr.stdout);
            done(error);
        }
    }

    it('Deletes multiple nested folders', (done: MochaDone) => {
        this.timeout(5000);

        const root = path.join(testRoot, 'nested');
        fs.mkdirSync(root);

        fs.mkdirSync(path.join(root, 'A'));
        fs.writeFileSync(path.join(root, 'A', 'test.txt'), 'test');
        fs.mkdirSync(path.join(root, 'A', 'A'));
        fs.writeFileSync(path.join(root, 'A', 'A', 'test2.txt'), 'test2');
        fs.writeFileSync(path.join(root, 'A', 'A', 'test3.txt'), 'test3');
        fs.mkdirSync(path.join(root, 'B'));
        fs.writeFileSync(path.join(root, 'B', 'test4.txt'), 'test4');
        fs.mkdirSync(path.join(root, 'C'));
        fs.writeFileSync(path.join(root, 'C', 'dontDelete.txt'), 'dont delete');

        let tp: string = path.join(__dirname, 'L0Nested.js');
        let tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp);

        tr.run();

        runValidations(() => {
            assert(!fs.existsSync(path.join(root, 'A')));
            assert(!fs.existsSync(path.join(root, 'B')));
            assert(fs.existsSync(path.join(root, 'C')));
            assert(fs.existsSync(path.join(root, 'C', 'dontDelete.txt')));
        }, tr, done);
    });

    it('Deletes a single file', (done: MochaDone) => {
        this.timeout(5000);

        const root = path.join(testRoot, 'singleFile');
        fs.mkdirSync(root);

        fs.mkdirSync(path.join(root, 'A'));
        fs.writeFileSync(path.join(root, 'A', 'test.txt'), 'test');
        fs.mkdirSync(path.join(root, 'A', 'A'));
        fs.writeFileSync(path.join(root, 'A', 'A', 'test.txt'), 'test2');
        fs.writeFileSync(path.join(root, 'A', 'A', 'test2.txt'), 'test3');

        let tp: string = path.join(__dirname, 'L0SingleFile.js');
        let tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp);

        tr.run();

        runValidations(() => {
            assert(fs.existsSync(path.join(root, 'A')));
            assert(!fs.existsSync(path.join(root, 'A', 'test.txt')));
            assert(fs.existsSync(path.join(root, 'A', 'A')));
            assert(fs.existsSync(path.join(root, 'A', 'A', 'test.txt')));
            assert(fs.existsSync(path.join(root, 'A', 'A', 'test2.txt')));
        }, tr, done);
    });

    it('Removes the source folder if its empty', (done: MochaDone) => {
        this.timeout(5000);

        const root = path.join(testRoot, 'rmSource');
        fs.mkdirSync(root);

        fs.mkdirSync(path.join(root, 'A'));
        fs.writeFileSync(path.join(root, 'A', 'test.txt'), 'test');
        fs.mkdirSync(path.join(root, 'A', 'A'));
        fs.writeFileSync(path.join(root, 'A', 'A', 'test2.txt'), 'test2');
        fs.writeFileSync(path.join(root, 'A', 'A', 'test3.txt'), 'test3');

        let tp: string = path.join(__dirname, 'L0RmSource.js');
        let tr: ttm.MockTestRunner = new ttm.MockTestRunner(tp);

        tr.run();

        runValidations(() => {
            assert(!fs.existsSync(root));
        }, tr, done);
    });
});
