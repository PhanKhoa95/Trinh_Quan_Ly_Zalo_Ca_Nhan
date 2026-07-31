const http = require('./helpers/http-client');
const { TestSuite, assert } = require('./helpers/test-runner');
const io = require('../server/node_modules/socket.io-client');

async function runTier3Tests(baseUrl) {
    const suite = new TestSuite('Tier 3: Cross-Feature & Concurrent');

    // 1. Rapid status changes
    suite.test('Rapid status changes handling without race conditions', async () => {
        // Create an item
        const createRes = await http.post(`${baseUrl}/api/group-data`, {
            groupId: 'group-t3-rapid',
            keyInfo: 'Rapid status change order',
            dataType: 'order',
            status: 'pending'
        });
        const item = createRes.json().data;

        // Perform sequence of rapid status updates
        const sequence = ['in_progress', 'pending', 'in_progress', 'completed'];
        
        for (let idx = 0; idx < sequence.length; idx++) {
            const st = sequence[idx];
            const res = await http.put(`${baseUrl}/api/group-data/${item.id}/status`, { status: st });
            assert.equal(res.status, 200, `Rapid request #${idx + 1} (${st}) returned status ${res.status}`);
        }

        // Verify final state in database
        const finalGet = await http.get(`${baseUrl}/api/group-data/${item.id}`);
        assert.equal(finalGet.status, 200, 'GET final item state returned 200');
        assert.equal(finalGet.json().data.status, 'completed', 'Final database state should be "completed"');
    });

    // 2. Concurrent WebSocket client connections
    suite.test('Concurrent WebSocket client connections broadcast (5 clients)', async () => {
        const createRes = await http.post(`${baseUrl}/api/group-data`, {
            groupId: 'group-t3-concurrent-ws',
            keyInfo: 'Concurrent WS broadcast test item',
            dataType: 'order',
            status: 'pending'
        });
        const targetItem = createRes.json().data;

        const CLIENT_COUNT = 5;
        const clients = [];
        const receivedPromises = [];

        for (let i = 0; i < CLIENT_COUNT; i++) {
            const client = io(baseUrl, { transports: ['websocket', 'polling'], reconnection: false });
            clients.push(client);

            const p = new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    reject(new Error(`Client #${i + 1} timed out waiting for WS broadcast`));
                }, 5000);

                client.on('group-data-update', (payload) => {
                    if (payload && payload.id === targetItem.id) {
                        clearTimeout(timer);
                        resolve({ clientId: i + 1, payload });
                    }
                });
            });
            receivedPromises.push(p);
        }

        // Wait a small tick for sockets to establish connection
        await new Promise(r => setTimeout(r, 300));

        // Trigger update
        await http.put(`${baseUrl}/api/group-data/${targetItem.id}/status`, { status: 'in_progress' });

        const results = await Promise.all(receivedPromises);
        assert.equal(results.length, CLIENT_COUNT, `All ${CLIENT_COUNT} clients must receive the event`);
        
        results.forEach(r => {
            assert.equal(r.payload.id, targetItem.id, 'Payload ID should match');
            assert.equal(r.payload.status, 'in_progress', 'Payload status should be in_progress');
        });

        // Clean up connections
        clients.forEach(c => c.disconnect());
    });

    return await suite.run();
}

module.exports = { runTier3Tests };
