const http = require('http');
const { URL } = require('url');

function request(method, urlStr, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(urlStr);
        const reqHeaders = { ...headers };
        let payload = null;

        if (body !== null && typeof body === 'object' && !Buffer.isBuffer(body)) {
            payload = JSON.stringify(body);
            reqHeaders['Content-Type'] = reqHeaders['Content-Type'] || 'application/json';
            reqHeaders['Content-Length'] = Buffer.byteLength(payload);
        } else if (typeof body === 'string') {
            payload = body;
            reqHeaders['Content-Type'] = reqHeaders['Content-Type'] || 'application/json';
            reqHeaders['Content-Length'] = Buffer.byteLength(payload);
        } else if (Buffer.isBuffer(body)) {
            payload = body;
            reqHeaders['Content-Length'] = body.length;
        }

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 80,
            path: parsedUrl.pathname + parsedUrl.search,
            method: method.toUpperCase(),
            headers: reqHeaders
        };

        const req = http.request(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const str = buffer.toString('utf-8');
                let parsedJson = null;
                try {
                    parsedJson = JSON.parse(str);
                } catch (e) {
                    // Non-JSON content
                }
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: str,
                    buffer,
                    json: () => parsedJson
                });
            });
        });

        req.on('error', (err) => reject(err));

        if (payload) {
            req.write(payload);
        }
        req.end();
    });
}

module.exports = {
    get: (url, headers) => request('GET', url, null, headers),
    post: (url, body, headers) => request('POST', url, body, headers),
    put: (url, body, headers) => request('PUT', url, body, headers),
    delete: (url, headers) => request('DELETE', url, null, headers)
};
