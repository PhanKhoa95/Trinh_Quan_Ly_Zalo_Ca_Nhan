const fs = require('fs');
const path = require('path');

const apisDir = path.join(__dirname, '..', 'server', 'node_modules', 'zca-js', 'dist', 'apis');
const files = fs.readdirSync(apisDir);

const results = [];

files.forEach(file => {
    if (file.endsWith('.d.ts') && file !== 'listen.d.ts') {
        const filePath = path.join(apisDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        // Find the line containing export declare const
        const lines = content.split('\n');
        const exportLine = lines.find(line => line.includes('export declare const'));
        if (exportLine) {
            results.push({
                file: file,
                signature: exportLine.trim()
            });
        }
    }
});

const outputFilePath = path.join(__dirname, 'apis_signatures.json');
fs.writeFileSync(outputFilePath, JSON.stringify(results, null, 2), 'utf8');
console.log('Saved api signatures to ' + outputFilePath);
