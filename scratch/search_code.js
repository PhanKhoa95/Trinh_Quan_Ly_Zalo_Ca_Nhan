const fs = require('fs');
const path = require('path');

const filesToSearch = [
    path.join(__dirname, '..', 'index.html')
];

filesToSearch.forEach(filePath => {
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, index) => {
            if (line.includes('log-filter-category')) {
                console.log(`${path.basename(filePath)}:${index + 1}: ${line.trim()}`);
            }
        });
    }
});
