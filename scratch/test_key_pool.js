const fs = require('fs');
const path = require('path');

// 1. Mock global fetch
const originalFetch = global.fetch;

const calledKeys = [];
let fetchCount = 0;

global.fetch = async (url, options) => {
    fetchCount++;
    
    // Trích xuất API Key từ url (Gemini) hoặc headers (OpenAI)
    let keyUsed = '';
    if (url.includes('generativelanguage.googleapis.com')) {
        const urlObj = new URL(url);
        keyUsed = urlObj.searchParams.get('key');
    } else if (url.includes('api.openai.com')) {
        const auth = options.headers['Authorization'] || '';
        keyUsed = auth.replace('Bearer ', '');
    }
    
    calledKeys.push(keyUsed);
    console.log(`[Mock Fetch] Gọi lần ${fetchCount} sử dụng Key: "${keyUsed}"`);

    // Giả lập:
    // Key 1 (key-pool-1) và Key 2 (key-pool-2) trả về lỗi 429 Rate Limit
    // Key 3 (key-pool-3) trả về 200 OK
    if (keyUsed === 'key-pool-1' || keyUsed === 'key-pool-2') {
        console.log(`[Mock Fetch] Giả lập trả về 429 Rate Limit cho "${keyUsed}"`);
        return {
            status: 429,
            ok: false,
            text: async () => 'Rate limit exceeded',
            clone: function() {
                return {
                    json: async () => ({
                        error: {
                            code: 429,
                            message: 'Resource exhausted',
                            status: 'RESOURCE_EXHAUSTED',
                            details: [
                                {
                                    '@type': 'type.googleapis.com/google.rpc.RetryInfo',
                                    'retryDelay': '1s' // Nhỏ để test nhanh nếu phải chờ
                                }
                            ]
                        }
                    })
                };
            }
        };
    } else if (keyUsed === 'key-pool-3') {
        console.log(`[Mock Fetch] Giả lập trả về 200 OK cho "${keyUsed}"`);
        return {
            status: 200,
            ok: true,
            json: async () => ({
                candidates: [
                    {
                        content: {
                            parts: [{ text: 'Đây là phản hồi thành công từ Key 3!' }]
                        }
                    }
                ]
            })
        };
    }

    return {
        status: 401,
        ok: false,
        text: async () => 'Unauthorized'
    };
};

// 2. Load askAI từ wrapper
const zaloClientPath = path.resolve(__dirname, '../server/zalo-client.js');

// Để load file zalo-client mà không chạy toàn bộ zca-js (hoặc mock nó),
// chúng ta chỉ cần chạy require của nó. ZaloClientWrapper.askAI sẽ được xuất ra.
const zaloClient = require(zaloClientPath);
const askAI = zaloClient.askAI || ZaloClientWrapper.askAI;

async function runTest() {
    console.log('--- BẮT ĐẦU KIỂM THỬ XOAY VÒNG KEY POOL ---');
    
    const mockHistory = [{ role: 'user', content: 'Xin chào AI' }];
    const mockConfig = {
        aiProvider: 'gemini',
        aiModel: 'gemini-1.5-flash',
        aiApiKeyPool: ['key-pool-1', 'key-pool-2', 'key-pool-3'],
        aiSystemPrompt: 'Bạn là trợ lý.'
    };

    console.log('\n[Khởi chạy cuộc gọi AI...]');
    const result = await askAI(mockHistory, mockConfig);
    
    console.log('\n--- KẾT QUẢ ---');
    console.log('Phản hồi nhận được:', result);
    console.log('Tổng số cuộc gọi fetch:', fetchCount);
    console.log('Thứ tự các keys đã gọi:', calledKeys);

    // Kiểm tra kết quả mong đợi:
    // Fetch phải gọi 3 lần, các keys lần lượt là key-pool-1 -> key-pool-2 -> key-pool-3
    const isSuccess = fetchCount === 3 && 
                      calledKeys[0] === 'key-pool-1' && 
                      calledKeys[1] === 'key-pool-2' && 
                      calledKeys[2] === 'key-pool-3';

    if (isSuccess) {
        console.log('\n✅ KẾT QUẢ TEST: PASS! Cơ chế xoay vòng key pool hoạt động hoàn hảo.');
    } else {
        console.log('\n❌ KẾT QUẢ TEST: FAILED! Không đúng quy trình xoay vòng.');
    }

    // Restore fetch
    global.fetch = originalFetch;
}

runTest().catch(err => {
    console.error('Lỗi khi chạy test:', err);
    global.fetch = originalFetch;
});
