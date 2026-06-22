const aiAnalysisQueue = require('../server/ai-queue');

console.log('--- BẮT ĐẦU KIỂM THỬ HÀNG ĐỢI VÀ DEBOUNCER AI ---');

// 1. Kiểm thử hàng đợi tuần tự (minSpacingMs = 3000)
async function testQueueSpacing() {
    console.log('\n[TEST 1] Kiểm tra khoảng giãn cách hàng đợi tuần tự...');
    const startTime = Date.now();

    const makeTask = (id) => {
        return async () => {
            const now = Date.now() - startTime;
            console.log(`[Task ${id}] Bắt đầu chạy tại t = ${now}ms`);
            // Giả lập cuộc gọi AI tốn 500ms
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log(`[Task ${id}] Hoàn thành tại t = ${Date.now() - startTime}ms`);
        };
    };

    aiAnalysisQueue.enqueue(makeTask(1));
    aiAnalysisQueue.enqueue(makeTask(2));
    aiAnalysisQueue.enqueue(makeTask(3));
}

// 2. Kiểm thử Debouncer gộp tin nhắn (5s silent window)
function testDebouncer() {
    console.log('\n[TEST 2] Kiểm tra cơ chế Debounce gộp tin nhắn...');
    const groupId = 'test-group-123';
    const zaloId = 'user-456';
    const type = 'extract';
    const senderName = 'Nguyễn Văn A';

    const sendSimulatedMessage = (text, delayMs) => {
        setTimeout(() => {
            console.log(`[Simulate] Gửi tin nhắn: "${text}" tại t = ${delayMs}ms`);
            aiAnalysisQueue.debounce(groupId, zaloId, type, senderName, { content: text }, async (messagesSegment) => {
                console.log(`[Callback] Kích hoạt phân tích gộp tin nhắn!`);
                console.log(`[Callback] Các tin nhắn đã gộp:`, messagesSegment.map(m => m.content));
            });
        }, delayMs);
    };

    // Gửi 4 tin nhắn nhanh liên tục (cách nhau 1 giây)
    sendSimulatedMessage('Tin nhắn 1: Đặt 1 cafe', 0);
    sendSimulatedMessage('Tin nhắn 2: và 1 bánh mì', 1000);
    sendSimulatedMessage('Tin nhắn 3: ship nhanh nhé', 2000);
    sendSimulatedMessage('Tin nhắn 4: thêm ít đá', 3000);

    // Kì vọng: Sau tin nhắn 4 (t = 3000ms), người dùng dừng nhắn. 
    // Hẹn giờ debounce 5 giây sẽ hết hạn tại t = 3000 + 5000 = 8000ms.
    // Tại t = 8000ms, callback sẽ được gọi với mảng 4 tin nhắn trên.
}

// Chạy các bài test
(async () => {
    // Để tránh lẫn lộn log, chúng ta chạy test 1 trước, sau đó chờ và chạy test 2.
    await testQueueSpacing();

    // Chờ 10 giây (đủ để 3 tasks chạy xong với khoảng cách 3s) rồi chạy test 2
    setTimeout(() => {
        testDebouncer();
    }, 10000);
})();
