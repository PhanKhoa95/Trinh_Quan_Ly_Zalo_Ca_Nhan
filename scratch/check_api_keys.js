const path = require('path');
const zca = require(path.join(__dirname, '..', 'server', 'node_modules', 'zca-js'));
const apiKeys = Object.getOwnPropertyNames(zca.API.prototype);
console.log('Available API methods at runtime:', apiKeys.filter(k => typeof zca.API.prototype[k] === 'function' || k !== 'constructor'));
