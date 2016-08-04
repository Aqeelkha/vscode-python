'use strict';
import * as path from 'path';
import {execPythonFile} from './../../common/utils';
import {TestFile, TestsToRun, TestSuite, TestFunction, FlattenedTestFunction, Tests, TestStatus, FlattenedTestSuite} from '../contracts';
import * as os from 'os';
import {extractBetweenDelimiters, convertFileToPackage, flattenTestFiles} from '../testUtils';

export function discoverTests(rootDirectory: string, args: string[]): Promise<Tests> {
    let logOutputLines: string[] = [''];
    let testFiles: TestFile[] = [];
    let collectionCountReported = false;
    function appendLine(line: string) {
        const lastLineIndex = logOutputLines.length - 1;
        logOutputLines[lastLineIndex] += line;

        // Check whether the previous line is something that we need
        // What we need is a line that ends with ? True
        //  and starts with nose.selector: DEBUG: want
        if (logOutputLines[lastLineIndex].endsWith('? True')) {
            logOutputLines.push('');
        }
        else {
            // We don't need this line
            logOutputLines[lastLineIndex] = '';
        }

    }
    function processOutput(output: string) {
        output.split(/\r?\n/g).forEach((line, index, lines) => {
            if (line.trim().startsWith('nose.selector: DEBUG: wantModule <module \'')) {
                // process the previous lines
                parseNoseTestModuleCollectionResult(rootDirectory, logOutputLines, testFiles);
                logOutputLines = [''];
            }

            if (index === 0) {
                if (output.startsWith(os.EOL) || lines.length > 1) {
                    appendLine(line);
                    return;
                }
                logOutputLines[logOutputLines.length - 1] += line;
                return;
            }
            if (index === lines.length - 1) {
                logOutputLines[logOutputLines.length - 1] += line;
                return;
            }
            appendLine(line);
            return;
        });
    }

    return execPythonFile('nosetests', args.concat(['--collect-only', '-vvv']), rootDirectory, true, processOutput)
        .then(() => {
            // process the last entry
            parseNoseTestModuleCollectionResult(rootDirectory, logOutputLines, testFiles);
            // Exclude tests that don't have any functions or test suites
            let indices = testFiles.filter(testFile => testFile.suites.length === 0 && testFile.functions.length === 0).map((testFile, index) => index);
            indices.sort();

            indices.forEach((indexToRemove, index) => {
                let newIndexToRemove = indexToRemove - index;
                testFiles.splice(newIndexToRemove, 1);
            });
            return flattenTestFiles(testFiles);
        });
}

function parseNoseTestModuleCollectionResult(rootDirectory: string, lines: string[], testFiles: TestFile[]) {
    let currentPackage: string = '';
    let fileName = '';
    let moduleName = '';
    let testFile: TestFile;
    lines.forEach(line => {
        let x = lines;
        let y = x;

        if (line.startsWith('nose.selector: DEBUG: wantModule <module \'')) {
            fileName = line.substring(line.indexOf('\' from \'') + '\' from \''.length);
            fileName = fileName.substring(0, fileName.lastIndexOf('\''));
            moduleName = line.substring(line.indexOf('nose.selector: DEBUG: wantModule <module \'') + 'nose.selector: DEBUG: wantModule <module \''.length);
            moduleName = moduleName.substring(0, moduleName.indexOf('\''));

            // We need to display the path relative to the current directory
            fileName = fileName.substring(rootDirectory.length + 1);
            currentPackage = convertFileToPackage(fileName);
            testFile = { functions: [], suites: [], name: fileName, rawName: fileName, xmlName: currentPackage, time: 0, functionsFailed: 0, functionsPassed: 0 };
            testFiles.push(testFile);
            return;
        }

        if (line.startsWith('nose.selector: DEBUG: wantClass <class \'')) {
            let name = extractBetweenDelimiters(line, 'nose.selector: DEBUG: wantClass <class \'', '\'>? True');
            const rawName = fileName + `:${name}`;
            const testSuite: TestSuite = { name: path.extname(name).substring(1), rawName: rawName, functions: [], suites: [], xmlName: name, time: 0, isUnitTest: false, isInstance: false, functionsFailed: 0, functionsPassed: 0 };
            testFile.suites.push(testSuite);
            return;
        }
        if (line.startsWith('nose.selector: DEBUG: wantClass ')) {
            let name = extractBetweenDelimiters(line, 'nose.selector: DEBUG: wantClass ', '? True');
            const rawName = fileName + `:${name}`;
            const testSuite: TestSuite = { name: path.extname(name).substring(1), rawName: rawName, functions: [], suites: [], xmlName: name, time: 0, isUnitTest: false, isInstance: false, functionsFailed: 0, functionsPassed: 0 };
            testFile.suites.push(testSuite);
            return;
        }
        if (line.startsWith('nose.selector: DEBUG: wantMethod <unbound method ')) {
            const name = extractBetweenDelimiters(line, 'nose.selector: DEBUG: wantMethod <unbound method ', '>? True');
            const fnName = path.extname(name).substring(1);
            const clsName = path.basename(name, path.extname(name));
            const fn: TestFunction = { name: fnName, rawName: fnName, time: 0, functionsFailed: 0, functionsPassed: 0 };

            let cls = testFile.suites.find(suite => suite.name === clsName);
            if (!cls) {
                debugger;
            }
            cls.functions.push(fn);
            return;
        }
        if (line.startsWith('nose.selector: DEBUG: wantFunction <function ')) {
            const name = extractBetweenDelimiters(line, 'nose.selector: DEBUG: wantFunction <function ', ' at ');
            const fn: TestFunction = { name: name, rawName: name, time: 0, functionsFailed: 0, functionsPassed: 0 };
            if (!testFile) {
                debugger;
            }
            testFile.functions.push(fn);
            return;
        }
    });
}
