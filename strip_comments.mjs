import fs from 'node:fs';
import path from 'node:path';

function processFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const newLines = [];
    let changed = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Match lines that only contain a comment (ignoring leading whitespace)
        // EXCLUDE lines containing eslint, @ts-, prettier, or just plain @ signs (like @ts-expect-error)
        const isCommentOnly = /^\s*\/\//.test(line);
        const isDirective = /^\s*\/\/\s*(eslint|@ts-|prettier|@)/i.test(line);
        
        if (isCommentOnly && !isDirective) {
            changed = true;
            // Skip adding this line to newLines
        } else {
            // Also need to check if there are inline comments at the end of the line
            // However, stripping inline comments safely with regex is very difficult because of URLs inside strings.
            // Since the user specifically mentioned excessive AI comments, those are typically block comments or full-line comments.
            // We'll just stick to full-line comments to avoid breaking code like `const url = "https://...";`
            newLines.push(line);
        }
    }

    if (changed) {
        fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8');
        console.log(`Stripped comments from: ${filePath}`);
    }
}

function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (['node_modules', '.git', 'dist'].includes(entry.name)) {
            continue;
        }
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(fullPath);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
            processFile(fullPath);
        }
    }
}

walk('/home/rebiz/opt/lumi/packages/core/src');
walk('/home/rebiz/opt/lumi/apps');
