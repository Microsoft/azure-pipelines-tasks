/// <reference path="../../../definitions/mocha.d.ts"/>
/// <reference path="../../../definitions/node.d.ts"/>

import assert = require('assert');
import trm = require('../../lib/taskRunner');
import path = require('path');

function setResponseFile(name: string) {
	process.env['MOCK_RESPONSES'] = path.join(__dirname, name);
}

describe('gradle Suite', function() {
    this.timeout(20000);
	
	before((done) => {
		// init here
		done();
	});

	after(function() {
		
	});
	
	//TODO: The 'Test Run Title' and 'Code Coverage Tool' fields are 
	//      not used by the NodeJS task currently and so are not tested.
	

	it('run gradle with all default inputs', (done) => {
		setResponseFile('gradleGood.json');
		
		var tr = new trm.TaskRunner('gradle');
		tr.setInput('wrapperScript', 'gradlew'); // Make that checkPath returns true for this filename in the response file
		tr.setInput('options', '');
		tr.setInput('tasks', 'build');
		tr.setInput('javaHomeSelection', 'JDKVersion');
		tr.setInput('jdkVersion', 'default');
		tr.setInput('publishJUnitResults', 'true');
		tr.setInput('testResultsFiles', '**/build/test-results/TEST-*.xml');
		
		tr.run()
		.then(() => {
            assert(tr.ran('gradlew build'), 'it should have run gradlew build');
            assert(tr.invokedToolCount == 1, 'should have only run gradle 1 time');
			assert(tr.resultWasSet, 'task should have set a result');
			assert(tr.stderr.length == 0, 'should not have written to stderr');
            assert(tr.succeeded, 'task should have succeeded');
			done();
		})
		.fail((err) => {
			done(err);
		});
	})	

	it('run gradle with missing wrapperScript', (done) => {
		setResponseFile('gradleGood.json');
		
		var tr = new trm.TaskRunner('gradle');
		tr.setInput('options', '');
		tr.setInput('tasks', 'build');
		tr.setInput('javaHomeSelection', 'JDKVersion');
		tr.setInput('jdkVersion', 'default');
		tr.setInput('publishJUnitResults', 'true');
		tr.setInput('testResultsFiles', '**/build/test-results/TEST-*.xml');
		tr.setInput('cwd', '/home/repo/src2');
		
		tr.run()
		.then(() => {
            assert(tr.invokedToolCount == 0, 'should not have run gradle');
			assert(tr.resultWasSet, 'task should have set a result');
			assert(tr.stderr.length > 0, 'should have written to stderr');
            assert(tr.failed, 'task should have failed');
			assert(tr.stderr.indexOf('Input required: wrapperScript') >= 0, 'wrong error message: "' + tr.stderr + '"');			
			done();
		})
		.fail((err) => {
			done(err);
		});
	})

	it('run gradle with INVALID wrapperScript', (done) => {
		setResponseFile('gradleGood.json');
		
		var tr = new trm.TaskRunner('gradle');
		tr.setInput('wrapperScript', '/home/gradlew');
		tr.setInput('options', '');
		tr.setInput('tasks', 'build');
		tr.setInput('javaHomeSelection', 'JDKVersion');
		tr.setInput('jdkVersion', 'default');
		tr.setInput('publishJUnitResults', 'true');
		tr.setInput('testResultsFiles', '**/build/test-results/TEST-*.xml');
		tr.setInput('cwd', '/home/repo/src2');
		
		tr.run()
		.then(() => {
            assert(tr.invokedToolCount == 0, 'should not have run gradle');
			assert(tr.resultWasSet, 'task should have set a result');
			assert(tr.stderr.length > 0, 'should have written to stderr');
            assert(tr.failed, 'task should have failed');
			assert(tr.stderr.indexOf('not found wrapperScript') >= 0, 'wrong error message: "' + tr.stderr + '"');			
			done();
		})
		.fail((err) => {
			done(err);
		});
	})
		
	it('run gradle with cwd set to valid path', (done) => {
		setResponseFile('gradleGood.json');
		
		var tr = new trm.TaskRunner('gradle');
		tr.setInput('wrapperScript', 'gradlew'); // Make that checkPath returns true for this filename in the response file
		tr.setInput('options', '');
		tr.setInput('tasks', 'build');
		tr.setInput('javaHomeSelection', 'JDKVersion');
		tr.setInput('jdkVersion', 'default');
		tr.setInput('publishJUnitResults', 'true');
		tr.setInput('testResultsFiles', '**/build/test-results/TEST-*.xml');
		tr.setInput('cwd', '/home/repo/src');
		
		tr.run()
		.then(() => {
            assert(tr.ran('gradlew build'), 'it should have run gradlew build');
            assert(tr.invokedToolCount == 1, 'should have only run gradle 1 time');
			assert(tr.resultWasSet, 'task should have set a result');
			assert(tr.stderr.length == 0, 'should not have written to stderr');
            assert(tr.succeeded, 'task should have succeeded');
			done();
		})
		.fail((err) => {
			done(err);
		});
	})
		
	it('run gradle with cwd set to INVALID path', (done) => {
		setResponseFile('gradleGood.json');
		
		var tr = new trm.TaskRunner('gradle');
		tr.setInput('wrapperScript', 'gradlew'); // Make that checkPath returns true for this filename in the response file
		tr.setInput('options', '');
		tr.setInput('tasks', 'build');
		tr.setInput('javaHomeSelection', 'JDKVersion');
		tr.setInput('jdkVersion', 'default');
		tr.setInput('publishJUnitResults', 'true');
		tr.setInput('testResultsFiles', '**/build/test-results/TEST-*.xml');
		tr.setInput('cwd', '/home/repo/src2');
		
		tr.run()
		.then(() => {
            assert(tr.invokedToolCount == 0, 'should not have run gradle');
			assert(tr.resultWasSet, 'task should have set a result');
			assert(tr.stderr.length > 0, 'should have written to stderr');
            assert(tr.failed, 'task should have failed');
			assert(tr.stderr.indexOf('not found cwd') >= 0, 'wrong error message: "' + tr.stderr + '"');			
			done();
		})
		.fail((err) => {
			done(err);
		});
	})
	
	it('run gradle with options set', (done) => {
		setResponseFile('gradleGood.json');
		
		var tr = new trm.TaskRunner('gradle');
		tr.setInput('wrapperScript', 'gradlew'); // Make that checkPath returns true for this filename in the response file
		tr.setInput('options', '/o "/p t i" /o /n /s');
		tr.setInput('tasks', 'build');
		tr.setInput('javaHomeSelection', 'JDKVersion');
		tr.setInput('jdkVersion', 'default');
		tr.setInput('publishJUnitResults', 'true');
		tr.setInput('testResultsFiles', '**/build/test-results/TEST-*.xml');
		
		tr.run()
		.then(() => {
            assert(tr.ran('gradlew /o /p t i /o /n /s build'), 'it should have run gradlew /o /p t i /o /n /s build');
            assert(tr.invokedToolCount == 1, 'should have only run gradle 1 time');
			assert(tr.resultWasSet, 'task should have set a result');
			assert(tr.stderr.length == 0, 'should not have written to stderr');
            assert(tr.succeeded, 'task should have succeeded');
			done();
		})
		.fail((err) => {
			done(err);
		});
	})	
	
	it('run gradle with tasks not set', (done) => {
		setResponseFile('gradleGood.json');
		
		var tr = new trm.TaskRunner('gradle');
		tr.setInput('wrapperScript', 'gradlew'); // Make that checkPath returns true for this filename in the response file
		tr.setInput('options', '/o "/p t i" /o /n /s');
		tr.setInput('javaHomeSelection', 'JDKVersion');
		tr.setInput('jdkVersion', 'default');
		tr.setInput('publishJUnitResults', 'true');
		tr.setInput('testResultsFiles', '**/build/test-results/TEST-*.xml');
		
		tr.run()
		.then(() => {
            assert(tr.invokedToolCount == 0, 'should not have run gradle');
			assert(tr.resultWasSet, 'task should have set a result');
			assert(tr.stderr.length > 0, 'should have written to stderr');
            assert(tr.failed, 'task should have failed');
			assert(tr.stderr.indexOf('Input required: tasks') >= 0, 'wrong error message: "' + tr.stderr + '"');			
			done();
		})
		.fail((err) => {
			done(err);
		});
	})
		
	it('run gradle with tasks set to multiple', (done) => {
		setResponseFile('gradleGood.json');
		
		var tr = new trm.TaskRunner('gradle');
		tr.setInput('wrapperScript', 'gradlew'); // Make that checkPath returns true for this filename in the response file
		tr.setInput('options', '/o "/p t i" /o /n /s');
		tr.setInput('tasks', 'build test deploy');
		tr.setInput('javaHomeSelection', 'JDKVersion');
		tr.setInput('jdkVersion', 'default');
		tr.setInput('publishJUnitResults', 'true');
		tr.setInput('testResultsFiles', '**/build/test-results/TEST-*.xml');
		
		tr.run()
		.then(() => {
            assert(tr.ran('gradlew /o /p t i /o /n /s build test deploy'), 'it should have run gradlew /o /p t i /o /n /s build test deploy');
            assert(tr.invokedToolCount == 1, 'should have only run gradle 1 time');
			assert(tr.resultWasSet, 'task should have set a result');
			assert(tr.stderr.length == 0, 'should not have written to stderr');
            assert(tr.succeeded, 'task should have succeeded');
			done();
		})
		.fail((err) => {
			done(err);
		});
	})	
			
	it('run gradle with missing publishJUnitResults input', (done) => {
		setResponseFile('gradleGood.json');
		
		var tr = new trm.TaskRunner('gradle');
		tr.setInput('wrapperScript', 'gradlew'); // Make that checkPath returns true for this filename in the response file
		tr.setInput('options', '');
		tr.setInput('tasks', 'build');
		tr.setInput('javaHomeSelection', 'JDKVersion');
		tr.setInput('jdkVersion', 'default');
		tr.setInput('testResultsFiles', '**/build/test-results/TEST-*.xml');
		
		tr.run()
		.then(() => {
            assert(tr.ran('gradlew build'), 'it should have run gradlew build');
            assert(tr.invokedToolCount == 1, 'should have only run gradle 1 time');
			assert(tr.resultWasSet, 'task should have set a result');
			assert(tr.stderr.length == 0, 'should not have written to stderr');
            assert(tr.succeeded, 'task should have succeeded');
			done();
		})
		.fail((err) => {
			done(err);
		});
	})	
	
	it('run gradle with publishJUnitResults set to "garbage"', (done) => {
		setResponseFile('gradleGood.json');
		
		var tr = new trm.TaskRunner('gradle');
		tr.setInput('wrapperScript', 'gradlew'); // Make that checkPath returns true for this filename in the response file
		tr.setInput('options', '');
		tr.setInput('tasks', 'build');
		tr.setInput('javaHomeSelection', 'JDKVersion');
		tr.setInput('jdkVersion', 'default');
		tr.setInput('publishJUnitResults', 'garbage');
		tr.setInput('testResultsFiles', '**/build/test-results/TEST-*.xml');
		
		tr.run()
		.then(() => {
            assert(tr.ran('gradlew build'), 'it should have run gradlew build');
            assert(tr.invokedToolCount == 1, 'should have only run gradle 1 time');
			assert(tr.resultWasSet, 'task should have set a result');
			assert(tr.stderr.length == 0, 'should not have written to stderr');
            assert(tr.succeeded, 'task should have succeeded');
			done();
		})
		.fail((err) => {
			done(err);
		});
	})		
			
	it('fails if missing testResultsFiles input', (done) => {
		setResponseFile('gradleGood.json');
		
		var tr = new trm.TaskRunner('gradle');
		tr.setInput('wrapperScript', 'gradlew'); // Make that checkPath returns true for this filename in the response file
		tr.setInput('options', '/o "/p t i" /o /n /s');
		tr.setInput('tasks', 'build test deploy');
		tr.setInput('javaHomeSelection', 'JDKVersion');
		tr.setInput('jdkVersion', 'default');
		tr.setInput('publishJUnitResults', 'true');
		
		tr.run()
		.then(() => {
            assert(tr.invokedToolCount == 0, 'should not have run gradle');
			assert(tr.resultWasSet, 'task should have set a result');
			assert(tr.stderr.length > 0, 'should have written to stderr');
            assert(tr.failed, 'task should have failed');
			assert(tr.stderr.indexOf('Input required: testResultsFiles') >= 0, 'wrong error message: "' + tr.stderr + '"');
			done();
		})
		.fail((err) => {
			done(err);
		});
	})		
	
	it('fails if missing javaHomeSelection input', (done) => {
		setResponseFile('gradleGood.json');
		
		var tr = new trm.TaskRunner('gradle');
		tr.setInput('wrapperScript', 'gradlew'); // Make that checkPath returns true for this filename in the response file
		tr.setInput('options', '/o "/p t i" /o /n /s');
		tr.setInput('tasks', 'build test deploy');
		tr.setInput('jdkVersion', 'default');
		tr.setInput('publishJUnitResults', 'true');
		tr.setInput('testResultsFiles', '**/build/test-results/TEST-*.xml');
		
		tr.run()
		.then(() => {
            assert(tr.invokedToolCount == 0, 'should not have run gradle');
			assert(tr.resultWasSet, 'task should have set a result');
			assert(tr.stderr.length > 0, 'should have written to stderr');
            assert(tr.failed, 'task should have failed');
			assert(tr.stderr.indexOf('Input required: javaHomeSelection') >= 0, 'wrong error message: "' + tr.stderr + '"');
			done();
		})
		.fail((err) => {
			done(err);
		});
	})		

	it('run gradle with jdkVersion set to 1.8', (done) => {
		setResponseFile('gradleGood.json');
		
		var tr = new trm.TaskRunner('gradle');
		tr.setInput('wrapperScript', 'gradlew'); // Make that checkPath returns true for this filename in the response file
		tr.setInput('options', '');
		tr.setInput('tasks', 'build');
		tr.setInput('javaHomeSelection', 'JDKVersion');
		tr.setInput('publishJUnitResults', 'true');
		tr.setInput('testResultsFiles', '**/build/test-results/TEST-*.xml');
		tr.setInput('jdkVersion', '1.8');
		tr.setInput('jdkArchitecture', 'x86');
		
		tr.run()
		.then(() => {
            assert(tr.ran('gradlew build'), 'it should have run gradlew build');
            assert(tr.invokedToolCount == 1, 'should have only run gradle 1 time');
			assert(tr.resultWasSet, 'task should have set a result');
			assert(tr.stderr.length == 0, 'should not have written to stderr');
            assert(tr.succeeded, 'task should have succeeded');
            assert(tr.stdout.indexOf('Set JAVA_HOME to /user/local/bin/Java8') >= 0, 'JAVA_HOME not set correctly');
			done();
		})
		.fail((err) => {
			done(err);
		});
	})	
	
	it('run gradle with jdkVersion set to 1.5', (done) => {
		setResponseFile('gradleGood.json');
		
		var tr = new trm.TaskRunner('gradle');
		tr.setInput('wrapperScript', 'gradlew'); // Make that checkPath returns true for this filename in the response file
		tr.setInput('options', '');
		tr.setInput('tasks', 'build');
		tr.setInput('javaHomeSelection', 'JDKVersion');
		tr.setInput('publishJUnitResults', 'true');
		tr.setInput('testResultsFiles', '**/build/test-results/TEST-*.xml');
		tr.setInput('jdkVersion', '1.5');
		tr.setInput('jdkArchitecture', 'x86');
		
		tr.run()
		.then(() => {
            assert(tr.invokedToolCount == 0, 'should not have run gradle');
			assert(tr.resultWasSet, 'task should have set a result');
			assert(tr.stderr.length > 0, 'should have written to stderr');
            assert(tr.failed, 'task should have failed');
            assert(tr.stdout.indexOf('Failed to find specified JDK version') >= 0, 'JAVA_HOME set?');
			done();
		})
		.fail((err) => {
			done(err);
		});
	})	
		
	it('run gradle with Valid inputs but it fails', (done) => {
		setResponseFile('gradleGood.json');
		
		var tr = new trm.TaskRunner('gradle');
		tr.setInput('wrapperScript', 'gradlew'); // Make that checkPath returns true for this filename in the response file
		tr.setInput('options', '');
		tr.setInput('tasks', 'build FAIL');
		tr.setInput('javaHomeSelection', 'JDKVersion');
		tr.setInput('jdkVersion', 'default');
		tr.setInput('publishJUnitResults', 'true');
		tr.setInput('testResultsFiles', '**/build/test-results/TEST-*.xml');
		
		tr.run()
		.then(() => {
            assert(tr.ran('gradlew build FAIL'), 'it should have run gradlew build FAIL');
            assert(tr.invokedToolCount == 1, 'should have only run gradle 1 time');
			assert(tr.resultWasSet, 'task should have set a result');
			assert(tr.stderr.length > 0, 'should have written to stderr');
            assert(tr.failed, 'task should have failed');
            assert(tr.stdout.indexOf('FAILED') >= 0, 'It should have failed');
			done();
		})
		.fail((err) => {
			done(err);
		});
	})	
	
});