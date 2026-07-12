import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const srcDirs = [
    'packages/core/src',
    'packages/contracts/src',
    'packages/event-bus/src',
    'packages/observability/src',
    'packages/sdk/src',
    'packages/sharding/src'
];

function getFiles(dir: string, fileList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const stat = fs.statSync(path.join(dir, file));
        if (stat.isDirectory()) {
            getFiles(path.join(dir, file), fileList);
        } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
            fileList.push(path.join(dir, file));
        }
    }
    return fileList;
}

const allFiles: string[] = [];
for (const dir of srcDirs) {
    getFiles(path.join(process.cwd(), dir), allFiles);
}

const program = ts.createProgram(allFiles, { target: ts.ScriptTarget.ES2022 });
const typeChecker = program.getTypeChecker();

function isPassThroughCall(node: ts.SignatureDeclaration, body: ts.Node): { isPassThrough: boolean, calleeName?: string, reason?: string } {
    if (!body) return { isPassThrough: false };

    let singleCallExpr: ts.CallExpression | undefined;

    if (ts.isBlock(body)) {
        const statements = body.statements;
        if (statements.length === 1) {
            const stmt = statements[0];
            if (ts.isReturnStatement(stmt) && stmt.expression && ts.isCallExpression(stmt.expression)) {
                singleCallExpr = stmt.expression;
            } else if (ts.isExpressionStatement(stmt) && ts.isCallExpression(stmt.expression)) {
                singleCallExpr = stmt.expression;
            }
        }
    } else if (ts.isCallExpression(body)) {
        singleCallExpr = body;
    }

    if (!singleCallExpr) return { isPassThrough: false };

    const callee = singleCallExpr.expression;
    let calleeName = callee.getText();

    const args = singleCallExpr.arguments;
    const params = node.parameters;

    // Check if arguments match parameters exactly
    let argsMatch = true;
    let index = 0;
    
    // allow differences if there are no arguments and no parameters
    if (args.length !== params.length) {
        // sometimes we pass-through with no arguments, or rest arguments, let's just log it if it's a single call.
        return { isPassThrough: true, calleeName, reason: 'Single call but arg counts differ' };
    }

    for (let i = 0; i < args.length; i++) {
        if (args[i].getText() !== params[i].name.getText()) {
            argsMatch = false;
        }
    }

    if (argsMatch) {
        return { isPassThrough: true, calleeName, reason: 'Exact argument pass-through' };
    }

    return { isPassThrough: true, calleeName, reason: 'Single call with modified arguments' };
}

for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.isDeclarationFile && !sourceFile.fileName.includes('node_modules')) {
        let fileHasOutput = false;
        
        ts.forEachChild(sourceFile, function visit(node) {
            if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
                
                // Get function name
                let name = '';
                if (node.name && ts.isIdentifier(node.name)) {
                    name = node.name.text;
                } else if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
                    name = node.parent.name.text;
                } else if (ts.isPropertyAssignment(node.parent) && ts.isIdentifier(node.parent.name)) {
                    name = node.parent.name.text;
                }

                if (name === '' || name === 'anonymous') return; // Skip anonymous

                if (node.body) {
                    const result = isPassThroughCall(node as ts.SignatureDeclaration, node.body);
                    // we want only strict cases or very similar cases
                    if (result.isPassThrough && result.reason === 'Exact argument pass-through') {
                        if (!fileHasOutput) {
                            fs.appendFileSync('indirections.txt', `\nFile: ${path.relative(process.cwd(), sourceFile.fileName)}\n`);
                            fileHasOutput = true;
                        }
                        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
                        fs.appendFileSync('indirections.txt', `  - Function: ${name} (Line: ${line})\n`);
                        fs.appendFileSync('indirections.txt', `    Calls: ${result.calleeName}\n`);
                        fs.appendFileSync('indirections.txt', `    Reason: ${result.reason}\n`);
                        fs.appendFileSync('indirections.txt', `    Body snippet: ${node.body.getText().replace(/\\n/g, ' ').substring(0, 100)}...\n`);
                    }
                }
            }
            ts.forEachChild(node, visit);
        });
    }
}
