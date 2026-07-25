const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const ignoredDirectories = new Set(['node_modules', '.git', 'uploads']);
const ignoredFiles = new Set();

function collectJavaScriptFiles(directory) {
    const files = [];

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
            continue;
        }

        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectJavaScriptFiles(entryPath));
        } else if (entry.name.endsWith('.js') && !ignoredFiles.has(entry.name)) {
            files.push(entryPath);
        }
    }

    return files;
}

const files = collectJavaScriptFiles(projectRoot);
for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], {
        encoding: 'utf8'
    });

    if (result.status !== 0) {
        process.stderr.write(result.stderr || result.stdout);
        process.exit(result.status || 1);
    }
}

console.log(`JavaScript syntax check passed (${files.length} files).`);
