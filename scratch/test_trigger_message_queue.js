const http = require('http');

function makeRequest(url, method, body = null) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname + urlObj.search,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });

        req.on('error', (err) => reject(err));

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function run() {
    try {
        console.log('1. Lấy danh sách tài khoản Zalo...');
        const accountsJson = await makeRequest('http://localhost:3000/api/accounts', 'GET');
        if (!accountsJson.success || accountsJson.data.length === 0) {
            console.log('Không có tài khoản nào hoạt động.', accountsJson);
            return;
        }
        const account = accountsJson.data[0];
        console.log(`Tài khoản: ${account.name} (ID: ${account.id})`);

        console.log('2. Lấy danh sách nhóm chat...');
        const groupsJson = await makeRequest(`http://localhost:3000/api/groups?accountId=${account.id}`, 'GET');
        if (!groupsJson.success || groupsJson.data.length === 0) {
            console.log('Không có nhóm chat nào hoạt động.', groupsJson);
            return;
        }
        const group = groupsJson.data[0];
        console.log(`Nhóm chat: ${group.name} (ID: ${group.id})`);

        console.log('3. Gửi liên tiếp 4 tin nhắn cách nhau 200ms để kiểm tra debouncer...');
        const senderName = 'Trần Văn Debouncer';
        const senderId = 'zalo-u-debouncer-test';

        const sendMessage = (text) => {
            return makeRequest('http://localhost:3000/api/groups/message/simulate', 'POST', {
                accountId: account.id,
                groupId: group.id,
                senderName: senderName,
                senderId: senderId,
                content: text
            });
        };

        await sendMessage('Order hộ mình 1 ly trà đào cam sả');
        await new Promise(r => setTimeout(r, 200));
        await sendMessage('ít đá ít ngọt');
        await new Promise(r => setTimeout(r, 200));
        await sendMessage('giao qua phòng lab trường UEH nhé');
        await new Promise(r => setTimeout(r, 200));
        await sendMessage('cảm ơn nhiều');

        console.log('Đã gửi xong 4 tin nhắn. Hãy kiểm tra console của server để xem log debouncer gộp tin nhắn.');
        console.log('Chờ 12 giây để hoàn tất debounce (5s) + chạy queue xử lý AI (3s spacing)...');
        await new Promise(r => setTimeout(r, 12000));

        console.log('4. Lấy danh sách dữ liệu nhóm trích xuất được từ database...');
        const dataJson = await makeRequest(`http://localhost:3000/api/groups/${group.id}/data`, 'GET');
        console.log('Dữ liệu nhóm hiện tại:');
        console.log(JSON.stringify(dataJson.data.filter(d => d.rawMessage.includes('Debouncer')), null, 2));

    } catch (e) {
        console.error('Lỗi khi chạy script test:', e);
    }
}

run();
