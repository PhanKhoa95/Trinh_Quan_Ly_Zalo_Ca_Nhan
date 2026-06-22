// Module hàng đợi và gộp tin nhắn phân tích AI (Debouncer & Sequential Queue)
class AiAnalysisQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.minSpacingMs = 3000; // Khoảng giãn cách an toàn tối thiểu 3 giây giữa các cuộc gọi AI trong hàng đợi

        // Bộ đệm lưu trữ cho cơ chế Debouncer gộp tin nhắn
        this.debounceTimers = {};
        this.pendingMessages = {};
    }

    /**
     * Đưa một tác vụ phân tích AI vào hàng đợi tuần tự.
     * @param {Function} taskFn - Hàm trả về một Promise thực thi cuộc gọi AI.
     */
    enqueue(taskFn) {
        this.queue.push(taskFn);
        console.log(`[AI Queue] Đã thêm tác vụ mới vào hàng đợi. Độ dài hàng đợi hiện tại: ${this.queue.length}`);
        if (!this.isProcessing) {
            this.process();
        }
    }

    /**
     * Vòng lặp xử lý hàng đợi tuần tự
     */
    async process() {
        if (this.queue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        const currentTask = this.queue.shift();

        const startTime = Date.now();
        try {
            console.log(`[AI Queue] Bắt đầu xử lý tác vụ... (Còn lại: ${this.queue.length})`);
            await currentTask();
            console.log(`[AI Queue] Xử lý tác vụ thành công sau ${Date.now() - startTime}ms.`);
        } catch (err) {
            console.error(`[AI Queue] Lỗi khi xử lý tác vụ trong hàng đợi:`, err.message);
        }

        // Chờ khoảng thời gian giãn cách an toàn tối thiểu trước khi chạy tác vụ tiếp theo
        const elapsed = Date.now() - startTime;
        const delay = Math.max(0, this.minSpacingMs - elapsed);

        if (delay > 0) {
            console.log(`[AI Queue] Chờ ${delay}ms để đảm bảo khoảng cách an toàn tránh 429...`);
        }

        setTimeout(() => {
            this.process();
        }, delay);
    }

    /**
     * Cơ chế Debounce gộp tin nhắn của cùng một người gửi trong nhóm chat.
     * @param {string} groupId - ID nhóm chat
     * @param {string} zaloId - ID thành viên
     * @param {string} type - Loại tác vụ ('memory' hoặc 'extract')
     * @param {string} senderName - Tên thành viên
     * @param {Object} message - Tin nhắn mới nhận
     * @param {Function} analysisCallback - Hàm callback chứa logic chạy phân tích sau khi gộp xong
     */
    debounce(groupId, zaloId, type, senderName, message, analysisCallback) {
        const key = `${groupId}-${zaloId}-${type}`;

        if (!this.pendingMessages[key]) {
            this.pendingMessages[key] = [];
        }

        // Đưa tin nhắn mới vào hàng chờ gộp
        this.pendingMessages[key].push(message);

        // Reset timer nếu người dùng tiếp tục nhắn tin
        if (this.debounceTimers[key]) {
            clearTimeout(this.debounceTimers[key]);
        }

        console.log(`[AI Debouncer] Nhận tin nhắn mới từ ${senderName} trong nhóm ${groupId} [Loại: ${type}]. Đang đệm tin nhắn... (Độ dài đệm: ${this.pendingMessages[key].length})`);

        this.debounceTimers[key] = setTimeout(() => {
            const messages = this.pendingMessages[key] || [];
            delete this.pendingMessages[key];
            delete this.debounceTimers[key];

            if (messages.length === 0) return;

            // Chỉ giữ lại tối đa 5 tin nhắn gần nhất của người dùng đó
            const segment = messages.slice(-5);
            console.log(`[AI Debouncer] Kích hoạt phân tích [Loại: ${type}] cho ${senderName} (nhóm: ${groupId}) sau 5 giây dừng gõ. Gộp ${segment.length} tin nhắn.`);

            // Đưa tác vụ phân tích đoạn tin nhắn gộp này vào hàng đợi tuần tự
            this.enqueue(async () => {
                try {
                    await analysisCallback(segment);
                } catch (err) {
                    console.error(`[AI Queue Callback Error]`, err.message);
                }
            });

        }, 5000); // Đợi 5 giây yên lặng kể từ tin nhắn cuối cùng
    }
}

const aiAnalysisQueue = new AiAnalysisQueue();
module.exports = aiAnalysisQueue;
