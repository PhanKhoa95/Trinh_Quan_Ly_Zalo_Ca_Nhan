const http = require('./helpers/http-client');
const { TestSuite, assert } = require('./helpers/test-runner');

async function runTier2Tests(baseUrl) {
    const suite = new TestSuite('Tier 2: Boundary & Corner Cases');

    // 1. Invalid status transitions
    suite.test('Invalid status transition handling (PUT /api/group-data/:id/status)', async () => {
        // Create valid item first
        const createRes = await http.post(`${baseUrl}/api/group-data`, {
            groupId: 'group-t2-invalid',
            keyInfo: 'Boundary test order',
            dataType: 'order',
            status: 'pending'
        });
        const item = createRes.json().data;

        // Test with unknown status string
        const res1 = await http.put(`${baseUrl}/api/group-data/${item.id}/status`, { status: 'UNKNOWN_STATUS_TYPE' });
        assert.equal(res1.status, 400, `Expected 400 for unknown status string, got ${res1.status}`);
        assert(res1.json() && res1.json().success === false, 'Response success should be false');

        // Test with missing status field
        const res2 = await http.put(`${baseUrl}/api/group-data/${item.id}/status`, {});
        assert.equal(res2.status, 400, `Expected 400 for missing status body, got ${res2.status}`);

        // Test with empty string status
        const res3 = await http.put(`${baseUrl}/api/group-data/${item.id}/status`, { status: '' });
        assert.equal(res3.status, 400, `Expected 400 for empty status string, got ${res3.status}`);
    });

    // 2. Missing IDs
    suite.test('Non-existent ID handling (PUT /api/group-data/:id/status)', async () => {
        const nonExistentId = 'non-existent-uuid-99999999-ffff';
        const res = await http.put(`${baseUrl}/api/group-data/${nonExistentId}/status`, { status: 'completed' });
        assert.equal(res.status, 404, `Expected 404 for non-existent ID update, got ${res.status}`);
        assert(res.json() && res.json().success === false, 'Response success should be false');
        assert.includes(res.json().error, 'not found', 'Error message should indicate record not found');
    });

    // 3. Missing or malformed JSON credentials
    suite.test('Missing or malformed JSON credentials (POST /api/config/google-sheets)', async () => {
        // Case A: Missing credentials object
        const resA = await http.post(`${baseUrl}/api/config/google-sheets`, {
            spreadsheetId: 'sheet_valid_id'
        });
        assert.equal(resA.status, 400, `Expected 400 when credentials object is missing, got ${resA.status}`);
        assert.includes(resA.json().error, 'credentials', 'Error message should reference credentials');

        // Case B: Missing client_email in credentials
        const resB = await http.post(`${baseUrl}/api/config/google-sheets`, {
            spreadsheetId: 'sheet_valid_id',
            credentials: {
                private_key: 'some_key_here'
            }
        });
        assert.equal(resB.status, 400, `Expected 400 when client_email is missing, got ${resB.status}`);

        // Case C: Missing spreadsheetId
        const resC = await http.post(`${baseUrl}/api/config/google-sheets`, {
            spreadsheetId: '',
            credentials: {
                client_email: 'test@example.com',
                private_key: 'some_key'
            }
        });
        assert.equal(resC.status, 400, `Expected 400 when spreadsheetId is empty, got ${resC.status}`);
    });

    // 4. PDF request for non-completed order
    suite.test('PDF invoice request rejection for non-completed order (GET /api/group-data/:id/invoice)', async () => {
        // Create an order with status 'pending'
        const createRes = await http.post(`${baseUrl}/api/group-data`, {
            groupId: 'group-t2-pdf-pending',
            senderName: 'Pending Order Customer',
            keyInfo: 'Unfinished Order Details',
            dataType: 'order',
            status: 'pending'
        });
        const pendingItem = createRes.json().data;

        // Try to request PDF invoice for pending order
        const pdfRes = await http.get(`${baseUrl}/api/group-data/${pendingItem.id}/invoice`);
        assert.equal(pdfRes.status, 400, `Expected 400 when requesting invoice for pending order, got ${pdfRes.status}`);
        assert(pdfRes.json() && pdfRes.json().success === false, 'Response success should be false');
        assert.includes(pdfRes.json().error, 'completed orders', 'Error message should mention invoice is for completed orders');

        // Try to request PDF invoice for in_progress order
        await http.put(`${baseUrl}/api/group-data/${pendingItem.id}/status`, { status: 'in_progress' });
        const pdfRes2 = await http.get(`${baseUrl}/api/group-data/${pendingItem.id}/invoice`);
        assert.equal(pdfRes2.status, 400, `Expected 400 when requesting invoice for in_progress order, got ${pdfRes2.status}`);
    });

    return await suite.run();
}

module.exports = { runTier2Tests };
