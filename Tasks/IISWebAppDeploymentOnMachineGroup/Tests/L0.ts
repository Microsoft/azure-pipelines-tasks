import * as path from 'path';
import * as assert from 'assert';
import * as ttm from 'vsts-task-lib/mock-test';
import tl = require('vsts-task-lib');
var ltx = require('ltx');
import fs = require('fs');

describe('IISWebsiteDeploymentOnMachineGroup test suite', function() {
     var taskSrcPath = path.join(__dirname, '..','deployiiswebapp.js');

     before((done) => {
        tl.cp(path.join(__dirname, 'L1XmlVarSub/Web.config'), path.join(__dirname, 'L1XmlVarSub/Web_test.config'), null, true);
        tl.cp(path.join(__dirname, 'L1XmlVarSub/Web.Debug.config'), path.join(__dirname, 'L1XmlVarSub/Web_test.Debug.config'), null, true);
        tl.cp(path.join(__dirname, 'L0XdtTransform/Web.config'), path.join(__dirname, 'L0XdtTransform/Web_test.config'), null, true);
        done();
    });
    after(function() {
        tl.rmRF(path.join(__dirname, 'L1XmlVarSub/Web_test.config'));
        tl.rmRF(path.join(__dirname, 'L1XmlVarSub/Web_test.Debug.config'));
        tl.rmRF(path.join(__dirname, 'L0XdtTransform/Web_test.config'), true);
    });

    it('Runs successfully with default inputs', (done:MochaDone) => {
        let tp = path.join(__dirname, 'L0WindowsDefault.js');
        let tr : ttm.MockTestRunner = new ttm.MockTestRunner(tp);

        tr.run();

		assert(tr.invokedToolCount == 2, 'should have invoked tool once');
        assert(tr.stderr.length == 0 || tr.errorIssues.length, 'should not have written to stderr');
        assert(tr.succeeded, 'task should have succeeded');
        done();
    });

	it('Runs successfully with all other inputs', (done) => {
        let tp = path.join(__dirname, 'L0WindowsAllInput.js');
        let tr : ttm.MockTestRunner = new ttm.MockTestRunner(tp);

        tr.run();

		assert(tr.invokedToolCount == 2, 'should have invoked tool twice');
        assert(tr.stderr.length == 0 && tr.errorIssues.length == 0, 'should not have written to stderr');
        assert(tr.succeeded, 'task should have succeeded');
        done();
    });
    
	it('Fails if msdeploy cmd fails to execute', (done) => {
        let tp = path.join(__dirname, 'L0WindowsFailDefault.js');
        let tr : ttm.MockTestRunner = new ttm.MockTestRunner(tp);
        
		tr.run();

		var expectedErr = 'Error: Error: cmd failed with return code: 1';
		assert(tr.invokedToolCount == 2, 'should have invoked tool twice');
        assert(tr.errorIssues.length > 0 || tr.stderr.length > 0, 'should have written to stderr');
        assert(tr.stdErrContained(expectedErr) || tr.createdErrorIssue(expectedErr), 'E should have said: ' + expectedErr); 
        assert(tr.failed, 'task should have failed');
        done();
    });

    it('Runs successfully with parameter file present in package', (done) => {
        let tp = path.join(__dirname, 'L0WindowsParamFileinPkg.js');
        let tr : ttm.MockTestRunner = new ttm.MockTestRunner(tp);
        
		tr.run();

		assert(tr.invokedToolCount == 2, 'should have invoked tool twice');
        assert(tr.stderr.length == 0 && tr.errorIssues.length == 0, 'should not have written to stderr'); 
        assert(tr.succeeded, 'task should have succeeded');
        done();
    });

    it('Fails if parameters file provided by user is not present', (done) => {
        let tp = path.join(__dirname, 'L0WindowsFailSetParamFile.js');
        let tr : ttm.MockTestRunner = new ttm.MockTestRunner(tp);
        
		tr.run();

		assert(tr.invokedToolCount == 0, 'should not have invoked any tool');
        assert(tr.stderr.length > 0 || tr.errorIssues.length > 0, 'should have written to stderr');
        var expectedErr = 'Error: loc_mock_SetParamFilenotfound0'; 
        assert(tr.stdErrContained(expectedErr) || tr.createdErrorIssue(expectedErr), 'should have said: ' + expectedErr);
        assert(tr.failed, 'task should have succeeded');
        done();
    });

    it('Fails if more than one package matched with specified pattern', (done) => {
        let tp = path.join(__dirname, 'L0WindowsManyPackage.js');
        let tr : ttm.MockTestRunner = new ttm.MockTestRunner(tp);
        
		tr.run();

		assert(tr.invokedToolCount == 0, 'should not have invoked any tool');
        assert(tr.stderr.length > 0 || tr.errorIssues.length > 0, 'should have written to stderr');
        var expectedErr = 'Error: loc_mock_MorethanonepackagematchedwithspecifiedpatternPleaserestrainthesearchpatern'; 
        assert(tr.stdErrContained(expectedErr) || tr.createdErrorIssue(expectedErr), 'should have said: ' + expectedErr); 
        assert(tr.failed, 'task should have failed');
        done();
    });

    it('Fails if package or folder name is invalid', (done) => {
        let tp = path.join(__dirname, 'L0WindowsNoPackage.js');
        let tr : ttm.MockTestRunner = new ttm.MockTestRunner(tp);
        
		tr.run();

		assert(tr.invokedToolCount == 0, 'should not have invoked any tool');
        assert(tr.stderr.length > 0 || tr.errorIssues.length > 0, 'should have written to stderr');
        var expectedErr = 'Error: loc_mock_Nopackagefoundwithspecifiedpattern'; 
        assert(tr.stdErrContained(expectedErr) || tr.createdErrorIssue(expectedErr), 'should have said: ' + expectedErr); 
        assert(tr.failed, 'task should have failed');
        done();
    });

    it('Runs successfully with XDT Transformation (L1)', (done:MochaDone) => {
        let tp = path.join(__dirname, 'L0XdtTransform.js');
        let tr : ttm.MockTestRunner = new ttm.MockTestRunner(tp);

        tr.run();

        if(tl.osType().match(/^Win/)) {
            var resultFile = ltx.parse(fs.readFileSync(path.join(__dirname, 'L0XdtTransform', 'Web_test.config')));
            var expectFile = ltx.parse(fs.readFileSync(path.join(__dirname, 'L0XdtTransform','Web_Expected.config')));
            assert(ltx.equal(resultFile, expectFile) , 'Should Transform attributes on Web.config');
        }
        else {
            tl.warning('Cannot test XDT Transformation in Non Windows Agent');
        }
        done();
    });
	
    it('Runs successfully with JSON variable substitution', (done:MochaDone) => {
        let tp = path.join(__dirname, 'L0JsonVarSub.js');
        let tr : ttm.MockTestRunner = new ttm.MockTestRunner(tp);

        tr.run();

        assert(tr.invokedToolCount == 2, 'should have invoked tool twice');
        assert(tr.stderr.length == 0 || tr.errorIssues.length, 'should not have written to stderr');
        assert(tr.stdout.search('JSON - eliminating object variables validated') > 0, 'JSON - eliminating object variables validation error');
        assert(tr.stdout.search('JSON - simple string change validated') > 0,'JSON -simple string change validation error' );
        assert(tr.stdout.search('JSON - system variable elimination validated') > 0, 'JSON -system variable elimination validation error');
        assert(tr.stdout.search('JSON - special variables validated') > 0, 'JSON - special variables validation error');
        assert(tr.stdout.search('JSON - variables with dot character validated') > 0, 'JSON varaibles with dot character validated');
        assert(tr.succeeded, 'task should have succeeded');
        done();
    });
	
    it('Validate File Encoding', (done:MochaDone) => {
        let tp = path.join(__dirname, 'L0ValidateFileEncoding.js');
        let tr : ttm.MockTestRunner = new ttm.MockTestRunner(tp);

        tr.run();

        assert(tr.stdout.search('UTF-8 with BOM validated') >= 0, 'Should have validated UTF-8 with BOM');
        assert(tr.stdout.search('UTF-16LE with BOM validated') >= 0, 'Should have validated UTF-16LE with BOM');
        assert(tr.stdout.search('UTF-16BE with BOM validated') >= 0, 'Should have validated UTF-16BE with BOM');
        assert(tr.stdout.search('UTF-32LE with BOM validated') >= 0, 'Should have validated UTF-32LE with BOM');
        assert(tr.stdout.search('UTF-32BE with BOM validated') >= 0, 'Should have validated UTF-32BE with BOM');

        assert(tr.stdout.search('UTF-8 without BOM validated') >= 0, 'Should have validated UTF-8 without BOM');
        assert(tr.stdout.search('UTF-16LE without BOM validated') >= 0, 'Should have validated UTF-16LE without BOM');
        assert(tr.stdout.search('UTF-16BE without BOM validated') >= 0, 'Should have validated UTF-16BE without BOM');
        assert(tr.stdout.search('UTF-32LE without BOM validated') >= 0, 'Should have validated UTF-32LE without BOM');
        assert(tr.stdout.search('UTF-32BE without BOM validated') >= 0, 'Should have validated UTF-32BE without BOM');

        assert(tr.stdout.search('Short File Buffer Error') >= 0, 'Should have validated short Buffer');
        assert(tr.stdout.search('Unknown encoding type') >= 0, 'Should throw for Unknown File Buffer');
        done();
    });
	
    it('Runs successfully with XML variable substitution', (done:MochaDone) => {
        let tp = path.join(__dirname, 'L0XmlVarSub.js');
        let tr : ttm.MockTestRunner = new ttm.MockTestRunner(tp);

        tr.run();

        var resultFile = ltx.parse(fs.readFileSync(path.join(__dirname, 'L1XmlVarSub/Web_test.config')));
        var expectFile = ltx.parse(fs.readFileSync(path.join(__dirname, 'L1XmlVarSub/Web_Expected.config')));
        assert(ltx.equal(resultFile, expectFile) , 'Should have substituted variables in Web.config file');

        var resultFile = ltx.parse(fs.readFileSync(path.join(__dirname, 'L1XmlVarSub/Web_test.Debug.config')));
        var expectFile = ltx.parse(fs.readFileSync(path.join(__dirname, 'L1XmlVarSub/Web_Expected.Debug.config')));
        assert(ltx.equal(resultFile, expectFile) , 'Should have substituted variables in Web.Debug.config file');

        done();
    });
	
    it('Runs Successfully with XDT Transformation (Mock)', (done) => {
        this.timeout(1000);
        let tp = path.join(__dirname, 'L0WindowsXdtTransformation.js');
        let tr : ttm.MockTestRunner = new ttm.MockTestRunner(tp);

        tr.run();
		
        assert(tr.invokedToolCount == 3, 'should have invoked tool thrice');
        assert(tr.stderr.length == 0  && tr.errorIssues.length == 0, 'should not have written to stderr');
        assert(tr.succeeded, 'task should have succeeded');
        done();
    });
	
    it('Fails if XDT Transformation throws error (Mock)', (done) => {
        let tp = path.join(__dirname, 'L0WindowsXdtTransformationFail.js');
        let tr : ttm.MockTestRunner = new ttm.MockTestRunner(tp);

        tr.run();
        
        var expectedErr = "Error: loc_mock_XdtTransformationErrorWhileTransforming";
        assert(tr.invokedToolCount == 1, 'should have invoked tool only once');
        assert(tr.stderr.length > 0 || tr.errorIssues.length > 0, 'should have written to stderr');
        assert(tr.stdErrContained(expectedErr) || tr.createdErrorIssue(expectedErr), 'E should have said: ' + expectedErr);
        assert(tr.failed, 'task should have failed');
        done();
    });
});
