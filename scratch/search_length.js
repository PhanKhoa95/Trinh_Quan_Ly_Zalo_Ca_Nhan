const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'server', 'server.js');
if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
        if (line.includes('.length')) {
            console.log(`server.js:${index + 1}: ${line.trim()}`);
        }
    });
}
