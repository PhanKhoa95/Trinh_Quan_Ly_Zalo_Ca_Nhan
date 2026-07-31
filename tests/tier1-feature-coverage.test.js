const http = require('./helpers/http-client');
const { TestSuite, assert } = require('./helpers/test-runner');
const io = require('../server/node_modules/socket.io-client');

async function runTier1Tests(baseUrl) {
    const suite = new TestSuite('Tier 1: Feature Coverage');

    // 1. Health Endpoint Check
    suite.test('Server health endpoint check (GET /api/health)', async () => {
        const res = await http.get(`${baseUrl}/api/health`);
        assert.equal(res.status, 200, `Health check returned status ${res.status}`);
        const data = res.json();
        assert(data && data.status === 'ok', 'Health status should be "ok"');
    });

    // 2. Google Sheets Config Endpoint (GET/POST)
    suite.test('Google Sheets config endpoint (POST & GET /api/config/google-sheets)', async () => {
        const testPayload = {
            spreadsheetId: 'sheet_tier1_test_123',
            credentials: {
                client_email: 'service-account-t1@zalo-manager.iam.gserviceaccount.com',
                private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----'
            }
        };

        const postRes = await http.post(`${baseUrl}/api/config/google-sheets`, testPayload);
        assert.equal(postRes.status, 200, `POST config returned ${postRes.status}`);
        const postData = postRes.json();
        assert(postData && postData.success === true, 'POST config should return success: true');

        const getRes = await http.get(`${baseUrl}/api/config/google-sheets`);
        assert.equal(getRes.status, 200, `GET config returned ${getRes.status}`);
        const getData = getRes.json();
        assert.equal(getData.spreadsheetId, 'sheet_tier1_test_123', 'Spreadsheet ID should match');
        assert.equal(getData.clientEmail, 'service-account-t1@zalo-manager.iam.gserviceaccount.com', 'Client email should match');
        assert.equal(getData.hasKey, true, 'hasKey should be true');
    });

    // 3. Kanban status update API (PUT /api/group-data/:id/status)
    suite.test('Kanban status update API (PUT /api/group-data/:id/status)', async () => {
        // Create an item first to test with
        const createRes = await http.post(`${baseUrl}/api/group-data`, {
            groupId: 'group-t1',
            keyInfo: 'Kanban status update test order',
            dataType: 'order',
            status: 'pending'
        });
        assert.equal(createRes.status, 201, 'Group data creation should return 201');
        const createdItem = createRes.json().data;
        const itemId = createdItem.id;

        // Update status to in_progress
        const updateRes = await http.put(`${baseUrl}/api/group-data/${itemId}/status`, { status: 'in_progress' });
        assert.equal(updateRes.status, 200, `PUT status returned status ${updateRes.status}`);
        const updateData = updateRes.json();
        assert(updateData && updateData.success === true, 'PUT status response should have success: true');
        assert.equal(updateData.data.status, 'in_progress', 'Returned status should be "in_progress"');

        // Verify state via GET
        const getRes = await http.get(`${baseUrl}/api/group-data/${itemId}`);
        assert.equal(getRes.status, 200, `GET item returned ${getRes.status}`);
        assert.equal(getRes.json().data.status, 'in_progress', 'Database item status should be "in_progress"');
    });

    // 4. Socket.io group-data-update broadcast event verification
    suite.test('Socket.io group-data-update broadcast event verification', async () => {
        const createRes = await http.post(`${baseUrl}/api/group-data`, {
            groupId: 'group-t1-ws',
            keyInfo: 'Socket.io broadcast test item',
            dataType: 'order',
            status: 'pending'
        });
        const targetItem = createRes.json().data;

        // Connect client
        const clientSocket = io(baseUrl, { transports: ['websocket', 'polling'], reconnection: false });

        await new Promise((resolve) => {
            if (clientSocket.connected) return resolve();
            clientSocket.once('connect', resolve);
        });

        const eventReceivedPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                clientSocket.disconnect();
                reject(new Error('Timed out waiting for group-data-update WS broadcast event'));
            }, 4000);

            clientSocket.on('group-data-update', (data) => {
                if (data && data.id === targetItem.id) {
                    clearTimeout(timeout);
                    clientSocket.disconnect();
                    resolve(data);
                }
            });
        });

        // Trigger status update via HTTP API
        await http.put(`${baseUrl}/api/group-data/${targetItem.id}/status`, { status: 'completed' });

        const wsPayload = await eventReceivedPromise;
        assert.equal(wsPayload.id, targetItem.id, 'WS payload item ID should match target');
        assert.equal(wsPayload.status, 'completed', 'WS payload status should be "completed"');
    });

    // 5. PDF invoice download endpoint (GET /api/group-data/:id/invoice)
    suite.test('PDF invoice download endpoint for completed order (GET /api/group-data/:id/invoice)', async () => {
        // Create order and update to completed
        const createRes = await http.post(`${baseUrl}/api/group-data`, {
            groupId: 'group-t1-pdf',
            senderName: 'Test Customer PDF',
            keyInfo: '20 Ly Tra Sua Tran Chau',
            dataType: 'order',
            status: 'completed'
        });
        const completedItem = createRes.json().data;

        const invoiceRes = await http.get(`${baseUrl}/api/group-data/${completedItem.id}/invoice`);
        assert.equal(invoiceRes.status, 200, `Invoice request returned status ${invoiceRes.status}`);
        
        const contentType = invoiceRes.headers['content-type'] || '';
        assert.includes(contentType, 'application/pdf', `Content-Type should be application/pdf, got ${contentType}`);

        const magicBytes = invoiceRes.buffer.toString('utf-8', 0, 5);
        assert.equal(magicBytes, '%PDF-', 'Downloaded content should begin with %PDF- header magic bytes');
    });

    return await suite.run();
}

module.exports = { runTier1Tests };
