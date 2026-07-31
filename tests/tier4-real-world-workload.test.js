const http = require('./helpers/http-client');
const { TestSuite, assert } = require('./helpers/test-runner');

async function runTier4Tests(baseUrl) {
    const suite = new TestSuite('Tier 4: Real-World Workload Simulation');

    suite.test('Complete End-to-End Workflow (Create -> Move Kanban -> Download Invoice PDF -> Check Sheets Sync Log)', async () => {
        // Step 1: Simulated group data creation
        const createRes = await http.post(`${baseUrl}/api/group-data`, {
            groupId: 'e2e-workload-group-999',
            zaloId: 'zalo-user-12345',
            senderName: 'Trần Thị B',
            dataType: 'order',
            keyInfo: 'Bún riêu cua đặc biệt x3 suất',
            rawMessage: 'Cho mình 3 suất bún riêu cua đặc biệt ship về 123 Nguyễn Trãi',
            status: 'pending'
        });
        assert.equal(createRes.status, 201, `Group data creation should return 201, got ${createRes.status}`);
        const order = createRes.json().data;
        assert(order && order.id, 'Created order should have a valid ID');
        assert.equal(order.status, 'pending', 'Initial status should be "pending"');

        // Step 2: Move Kanban from pending -> in_progress
        const step2Res = await http.put(`${baseUrl}/api/group-data/${order.id}/status`, { status: 'in_progress' });
        assert.equal(step2Res.status, 200, `Move to in_progress should return 200`);
        assert.equal(step2Res.json().data.status, 'in_progress', 'Status should now be "in_progress"');

        // Step 3: Move Kanban from in_progress -> completed
        const step3Res = await http.put(`${baseUrl}/api/group-data/${order.id}/status`, { status: 'completed' });
        assert.equal(step3Res.status, 200, `Move to completed should return 200`);
        assert.equal(step3Res.json().data.status, 'completed', 'Status should now be "completed"');

        // Step 4: PDF Trigger for completed order
        const pdfRes = await http.get(`${baseUrl}/api/group-data/${order.id}/invoice`);
        assert.equal(pdfRes.status, 200, `Invoice download should return 200`);
        const contentType = pdfRes.headers['content-type'] || '';
        assert.includes(contentType, 'application/pdf', 'Content-Type should be application/pdf');
        assert.equal(pdfRes.buffer.toString('utf-8', 0, 5), '%PDF-', 'Invoice file buffer should start with %PDF-');

        // Step 5: Check Google Sheets Sync Log
        const logsRes = await http.get(`${baseUrl}/api/config/google-sheets/logs`);
        assert.equal(logsRes.status, 200, 'Sheets logs endpoint should return 200');
        const logsData = logsRes.json();
        assert(logsData && Array.isArray(logsData.logs), 'Logs data should contain array of logs');

        const matchingLog = logsData.logs.find(l => l.message && l.message.includes(order.id));
        assert(matchingLog, `Expected to find a sync log entry referencing order ID ${order.id}`);
        assert.includes(matchingLog.message, 'Google Sheets sync logged', 'Log message should confirm Google Sheets sync trigger');
    });

    return await suite.run();
}

module.exports = { runTier4Tests };
