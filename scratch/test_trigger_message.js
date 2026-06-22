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
        console.log(`Tài khoản hoạt động: ${account.name} (ID: ${account.id})`);

        console.log('2. Lấy danh sách nhóm chat...');
        const groupsJson = await makeRequest(`http://localhost:3000/api/groups?accountId=${account.id}`, 'GET');
        if (!groupsJson.success || groupsJson.data.length === 0) {
            console.log('Không có nhóm chat nào hoạt động.', groupsJson);
            return;
        }
        const group = groupsJson.data[0];
        console.log(`Nhóm chat hoạt động: ${group.name} (ID: ${group.id})`);

        console.log('3. Giả lập một tin nhắn Báo cáo công việc...');
        const reportResult = await makeRequest('http://localhost:3000/api/groups/message/simulate', 'POST', {
            accountId: account.id,
            groupId: group.id,
            senderName: 'Lê Văn Báo Cáo',
            senderId: 'zalo-u-report-test',
            content: 'Báo cáo ngày: Đã hoàn thành lập trình giao diện dữ liệu nhóm Zalo.'
        });
        console.log('Kết quả giả lập báo cáo:', reportResult);

        console.log('Đợi 8 giây để AI xử lý...');
        await new Promise(r => setTimeout(r, 8000));

        console.log('4. Giả lập một tin nhắn Đặt hàng...');
        const orderResult = await makeRequest('http://localhost:3000/api/groups/message/simulate', 'POST', {
            accountId: account.id,
            groupId: group.id,
            senderName: 'Nguyễn Đặt Hàng',
            senderId: 'zalo-u-order-test',
            content: 'Shop ơi cho mình đặt 3 ly sinh tố bơ ít đường giao đến phòng 302 nhé.'
        });
        console.log('Kết quả giả lập đặt hàng:', orderResult);

        console.log('Đợi 8 giây để AI xử lý...');
        await new Promise(r => setTimeout(r, 8000));

        console.log('5. Lấy danh sách dữ liệu trích xuất từ database...');
        const dataJson = await makeRequest(`http://localhost:3000/api/groups/${group.id}/data`, 'GET');
        console.log('Danh sách dữ liệu nhóm trích xuất được từ database:');
        console.log(JSON.stringify(dataJson, null, 2));

    } catch (e) {
        console.error('Lỗi khi chạy script test:', e);
    }
}

run();
