const { campaignsDb } = require('./database');

class MessageQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.io = null;
        this.activeClients = {}; // Tham chiếu tới các zaloClient đang hoạt động
    }

    setIo(io) {
        this.io = io;
    }

    setActiveClients(clients) {
        this.activeClients = clients;
    }

    // Thêm chiến dịch mới vào hàng đợi xử lý
    async addCampaign(campaign) {
        // Lưu vào Database trước
        campaign.progress = 0;
        campaign.status = 'running';
        await campaignsDb.insert(campaign);

        // Tạo danh sách các công việc con (từng tin nhắn đến từng nhóm)
        campaign.targets.forEach(groupId => {
            this.queue.push({
                campaignId: campaign.id,
                accountId: campaign.accountId,
                groupId,
                message: campaign.message,
                delay: campaign.delay || 10
            });
        });

        this.notify(`Bắt đầu chiến dịch gửi tin hàng loạt từ tài khoản [${campaign.accountId}] đến ${campaign.targets.length} nhóm.`, 'success');
        
        // Khởi động vòng lặp xử lý nếu chưa chạy
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    // Vòng lặp xử lý hàng đợi
    async processQueue() {
        if (this.queue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        const job = this.queue.shift();
        
        try {
            const client = this.activeClients[job.accountId];
            if (!client || !client.isLoggedIn) {
                throw new Error(`Tài khoản Zalo ${job.accountId} không online hoặc chưa kết nối.`);
            }

            // Gửi tin nhắn thực tế qua Zalo Client
            console.log(`Queue: Đang gửi tin đến nhóm ${job.groupId} qua Zalo API...`);
            await client.sendMessage(job.groupId, job.message);
            
            // Log thành công lên giao diện
            this.notify(`[Chiến dịch] Đã gửi tin nhắn đến nhóm ID ${job.groupId} thành công.`, 'info');

            // Cập nhật tiến độ chiến dịch trong DB và giao diện
            await this.updateCampaignProgress(job.campaignId);

        } catch (error) {
            console.error('Lỗi khi gửi tin nhắn trong hàng đợi:', error.message);
            this.notify(`[Lỗi gửi tin] ${error.message}`, 'error');
        }

        // Tính toán khoảng trễ ngẫu nhiên (Safe Mode)
        // Thêm từ 1 đến 5 giây ngẫu nhiên vào thời gian giãn cách chỉ định
        const randomSeconds = Math.floor(Math.random() * 5) + 1;
        const totalDelayMs = (job.delay + randomSeconds) * 1000;

        console.log(`Queue: Chờ ngẫu nhiên ${job.delay}s + ${randomSeconds}s trước khi gửi tin tiếp theo...`);
        
        setTimeout(() => {
            this.processQueue();
        }, totalDelayMs);
    }

    // Cập nhật tiến độ chiến dịch
    async updateCampaignProgress(campaignId) {
        const campaign = await campaignsDb.findOne({ id: campaignId });
        if (!campaign) return;

        // Số tin nhắn của chiến dịch này còn lại trong hàng đợi
        const remainingCount = this.queue.filter(job => job.campaignId === campaignId).length;
        const totalTargets = campaign.targets.length;
        const sentCount = totalTargets - remainingCount;

        const progress = Math.round((sentCount / totalTargets) * 1000) / 10; // làm tròn 1 chữ số thập phân, max 100
        const status = remainingCount === 0 ? 'completed' : 'running';

        await campaignsDb.update({ id: campaignId }, { $set: { progress, status } });

        // Gửi sự kiện đẩy tiến độ lên Frontend thông qua Socket.io
        if (this.io) {
            this.io.emit('campaign.progress', {
                campaignId,
                progress,
                status,
                sentCount,
                totalTargets
            });
        }
    }

    // Gửi thông báo sự kiện thời gian thực sang terminal log của Dashboard
    notify(message, type = 'info') {
        console.log(`[Event] [${type}] ${message}`);
        if (this.io) {
            this.io.emit('terminal.log', {
                text: message,
                type
            });
        }
    }
}

const messageQueue = new MessageQueue();
module.exports = messageQueue;
