const path = require('path');
const fs = require('fs');

const {
    getSenderName,
    getSenderAvatar,
    getGroupName,
    extractPhoneNumber,
    memberNameCache,
    groupNameCache
} = require('./helpers');

const { askAI, analyzeSentiment } = require('./ai-service');
const logger = require('./logger');

function detectPronoun(name) {
    if (!name || typeof name !== 'string') return 'bạn';
    const nameLower = name.toLowerCase().trim();
    if (nameLower.startsWith('anh ') || nameLower.startsWith('mr.') || nameLower.startsWith('mr ')) return 'anh';
    if (nameLower.startsWith('chị ') || nameLower.startsWith('chị_') || nameLower.startsWith('ms.') || nameLower.startsWith('ms ') || nameLower.startsWith('mrs.') || nameLower.startsWith('mrs ')) return 'chị';
    if (nameLower.startsWith('cô ')) return 'cô';
    if (nameLower.startsWith('chú ')) return 'chú';
    if (nameLower.startsWith('bác ')) return 'bác';
    if (nameLower.startsWith('sếp ')) return 'sếp';
    return 'bạn';
}

const {
    analyzeAndSaveMemory,
    analyzeAndExtractGroupData
} = require('./ai-analyzers');

const activeConversations = {};
const conversationHistory = {};

let Zalo = null;
let ThreadType = { User: 0, Group: 1 };
try {
    const zca = require('zca-js');
    Zalo = zca.Zalo;
    if (zca.ThreadType) {
        ThreadType = zca.ThreadType;
    }
    console.log('ZaloClient: Đã tải thư viện zca-js thực tế.');
} catch (e) {
    console.warn('ZaloClient Warning: Không thể load zca-js. Hệ thống tự động chuyển sang chế độ mô phỏng backend.');
}

class ZaloClientWrapper {
    constructor(accountId, phone, sessionName) {
        this.accountId = accountId;
        this.phone = phone;
        this.sessionName = sessionName;
        this.isLoggedIn = false;
        this.zalo = Zalo ? new Zalo({
            logging: true,
            apiType: 30
        }) : null;
        this.api = null;
        this.isSimulation = !Zalo;
        this.name = '';
    }

    // Khởi chạy tiến trình kết nối và sinh mã QR
    async initialize(onQrCode, onLoginSuccess, onMessage) {
        this.onMessageCallback = onMessage;
        if (this.isSimulation) {
            console.log(`[Simulated Client ${this.accountId}] Bắt đầu quy trình quét QR mô phỏng...`);
            
            // Giả lập gửi QR code dạng mock sau 1s
            setTimeout(() => {
                const mockQrBase64 = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=ZaloMockSession_" + this.accountId;
                onQrCode(mockQrBase64);
            }, 1000);

            // Giả lập quét thành công sau 6s
            setTimeout(() => {
                this.isLoggedIn = true;
                console.log(`[Simulated Client ${this.accountId}] Đăng nhập thành công!`);
                onLoginSuccess({
                    id: this.accountId,
                    name: `Tài khoản Zalo ${this.phone.substring(this.phone.length - 4)}`,
                    phone: this.phone,
                    status: 'online'
                });
            }, 6000);
            return;
        }

        // --- TRƯỜNG HỢP CÓ THƯ VIỆN THỰC TẾ ---
        try {
            const sessionPath = path.join(__dirname, 'sessions', this.sessionName);
            if (!fs.existsSync(path.dirname(sessionPath))) {
                fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
            }
            // Nếu đã có sẵn session lưu ở tệp
            if (fs.existsSync(sessionPath)) {
                try {
                    const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
                    logger.info('zalo', `Khôi phục session Zalo cũ cho SĐT ${this.phone}...`);
                    
                    this.api = await this.zalo.login(sessionData);
                    this.isLoggedIn = true;

                    // Đăng ký các bộ lắng nghe sự kiện Zalo (message, reaction, undo, group_event)
                    this._setupListeners(onMessage);

                    const me = await this.api.fetchAccountInfo();
                    const profile = me.profile || me || {};
                    const name = profile.displayName || profile.name || profile.zaloName || profile.username || `Zalo Acc ${this.phone}`;
                    const avatar = profile.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80';
                    logger.info('zalo', `Tự động khôi phục đăng nhập thành công cho: ${name}`);
                    
                    this.name = name;
                    onLoginSuccess({
                        id: this.accountId,
                        name: name,
                        phone: this.phone,
                        avatar: avatar,
                        status: 'online'
                    });
                    return;
                } catch (err) {
                    logger.warn('zalo', `Không thể khôi phục session cũ: ${err.message}. Tiến hành đăng nhập mới...`);
                    try { fs.unlinkSync(sessionPath); } catch (_) {}
                }
            }

            // Tiến hành đăng nhập bằng QR Code mới
            logger.info('zalo', `Khởi chạy đăng nhập QR cho SĐT ${this.phone}...`);
            
            const callback = async (event) => {
                if (event.type === 0) { // QRCodeGenerated
                    logger.info('zalo', `Đã tạo mã QR cho ${this.phone}`);
                    onQrCode(`data:image/png;base64,${event.data.image}`);
                } else if (event.type === 2) { // QRCodeScanned
                    logger.info('zalo', `Điện thoại đã quét mã QR của ${this.phone}. Đang chờ xác nhận...`);
                } else if (event.type === 4) { // GotLoginInfo
                    logger.info('zalo', `Đã lấy được thông tin đăng nhập mới cho ${this.phone}. Lưu session...`);
                    fs.writeFileSync(sessionPath, JSON.stringify(event.data, null, 2), 'utf8');
                }
            };

            this.api = await this.zalo.loginQR({
                language: 'vi'
            }, callback);

            if (this.api) {
                this.isLoggedIn = true;

                // Đăng ký các bộ lắng nghe sự kiện Zalo (message, reaction, undo, group_event)
                this._setupListeners(onMessage);

                const me = await this.api.fetchAccountInfo();
                const profile = me.profile || me || {};
                const name = profile.displayName || profile.name || profile.zaloName || profile.username || `Zalo Acc ${this.phone}`;
                const avatar = profile.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80';
                logger.info('zalo', `Đăng nhập thành công: ${name}`);
                
                this.name = name;
                onLoginSuccess({
                    id: this.accountId,
                    name: name,
                    phone: this.phone,
                    avatar: avatar,
                    status: 'online'
                });
            }

        } catch (error) {
            logger.error('zalo', `Lỗi khởi chạy tài khoản ${this.phone}: ${error.message}`);
            throw error;
        }
    }


    // Gửi tin nhắn thực tế vào nhóm chat hoặc cá nhân
    async sendMessage(targetId, text, type = ThreadType.Group) {
        // Loại bỏ các ký tự định dạng Markdown để hiển thị text sạch trên Zalo
        if (text && typeof text === 'string') {
            text = text
                .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
                .replace(/\*\*(.*?)\*\*/g, '$1')
                .replace(/\*(.*?)\*/g, '$1')
                .replace(/__(.*?)__/g, '$1')
                .replace(/_(.*?)_/g, '$1')
                .replace(/`(.*?)`/g, '$1')
                .replace(/~~(.*?)~~/g, '$1')
                .replace(/\*/g, '')
                .replace(/_/g, '')
                .replace(/`/g, '')
                .replace(/~/g, '');
        }
        const ownId = this.api ? this.api.getOwnId() : (this.accountId || 'self');
        
        // Cập nhật conversationHistory để AI luôn có bối cảnh mới nhất của chính bot gửi đi
        if (type === ThreadType.Group || type === 1 || type === 2) {
            if (!conversationHistory[targetId]) {
                conversationHistory[targetId] = [];
            }
            const isDuplicate = conversationHistory[targetId].length > 0 &&
                conversationHistory[targetId][conversationHistory[targetId].length - 1].content === text &&
                conversationHistory[targetId][conversationHistory[targetId].length - 1].role === 'assistant';
            
            if (!isDuplicate) {
                conversationHistory[targetId].push({
                    role: 'assistant',
                    content: text,
                    timestamp: Date.now()
                });
                if (conversationHistory[targetId].length > 15) {
                    conversationHistory[targetId] = conversationHistory[targetId].slice(-15);
                }
            }
        }

        if (this.isSimulation) {
            console.log(`[Mock Send] Gửi tin đến ${targetId}: ${text}`);
            if (this.onMessageCallback) {
                this.onMessageCallback({
                    threadId: targetId,
                    type: type,
                    isSelf: true,
                    data: {
                        msgId: 'msg-sent-' + Date.now(),
                        uidFrom: ownId,
                        content: text,
                        ts: Date.now(),
                        msgType: 'chat.text'
                    }
                });
            }
            return true;
        }

        if (!this.isLoggedIn || !this.api) {
            throw new Error(`Tài khoản Zalo ${this.phone} chưa được kết nối.`);
        }

        try {
            await this.api.sendMessage(text, targetId, type);
            
            if (this.onMessageCallback) {
                this.onMessageCallback({
                    threadId: targetId,
                    type: type,
                    isSelf: true,
                    data: {
                        msgId: 'msg-sent-' + Date.now(),
                        uidFrom: ownId,
                        content: text,
                        ts: Date.now(),
                        msgType: 'chat.text'
                    }
                });
            }
            return true;
        } catch (error) {
            console.error(`[Zalo Send Error] Gửi tin đến ${targetId} thất bại:`, error.message);
            throw error;
        }
    }

    // Dọn dẹp kết nối và giải phóng tài nguyên
    async destroy() {
        if (this.isSimulation) {
            console.log(`[Simulated Client ${this.accountId}] Đóng kết nối giả lập...`);
            this.isLoggedIn = false;
            return;
        }

        logger.info('zalo', `Đang đóng kết nối Zalo cho SĐT ${this.phone}...`);
        if (this.api && this.api.listener) {
            try {
                this.api.listener.stop();
                logger.info('zalo', `Đã dừng listener cho SĐT ${this.phone}`);
            } catch (err) {
                logger.error('zalo', `Lỗi khi dừng listener cho SĐT ${this.phone}: ${err.message}`);
            }
        }
        this.isLoggedIn = false;
        this.api = null;
        this.zalo = null;
    }

    // Đăng ký tất cả các bộ lắng nghe sự kiện từ Zalo SDK
    _setupListeners(onMessage) {
        if (!this.api || !this.api.listener) return;

        const { getEnabledTools, incrementToolStat } = require('./ai-tools');

        // 1. Lắng nghe tin nhắn mới
        this.api.listener.on('message', async (message) => {
            const enabledTools = getEnabledTools();
            if (enabledTools.message === false) return; // Bị tắt

            try {
                const contentText = typeof message.data?.content === 'string' 
                    ? message.data.content 
                    : JSON.stringify(message.data?.content || '');
                logger.info('message', `Nhận tin nhắn từ ${message.data?.uidFrom || 'hệ thống'} trong nhóm ${message.threadId}: ${contentText.substring(0, 150)}`, message.data);
            } catch (logErr) {
                console.error('Lỗi khi ghi log tin nhắn:', logErr.message);
            }

            try {
                await this.handleIncomingMessage(message);
                if (onMessage) onMessage(message);
                incrementToolStat('message', true);
            } catch (err) {
                console.error('Lỗi khi xử lý tin nhắn message:', err.message);
                incrementToolStat('message', false);
            }
        });

        // 2. Lắng nghe sự kiện thả cảm xúc tin nhắn
        this.api.listener.on('reaction', async (reaction) => {
            const enabledTools = getEnabledTools();
            if (enabledTools.reaction === false) return; // Bị tắt

            try {
                const icon = reaction.data?.content?.rIcon || reaction.reactIcon || '';
                logger.info('reaction', `Nhận sự kiện thả cảm xúc từ ${reaction.data?.uidFrom || 'hệ thống'} trong nhóm ${reaction.threadId}: Icon "${icon}" trên tin nhắn ${reaction.data?.msgId || ''}`, reaction.data);
            } catch (logErr) {
                console.error('Lỗi khi ghi log reaction:', logErr.message);
            }

            try {
                await this.handleIncomingReaction(reaction);
                incrementToolStat('reaction', true);
            } catch (err) {
                console.error('Lỗi khi xử lý reaction:', err.message);
                incrementToolStat('reaction', false);
            }
        });

        // 3. Lắng nghe sự kiện thu hồi tin nhắn
        this.api.listener.on('undo', async (undoData) => {
            const enabledTools = getEnabledTools();
            if (enabledTools.undo === false) return; // Bị tắt

            try {
                logger.info('undo', `Nhận sự kiện thu hồi tin nhắn từ ${undoData.data?.uidFrom || 'hệ thống'} trong nhóm ${undoData.threadId}: msgId=${undoData.data?.msgId || ''}`, undoData.data);
            } catch (logErr) {
                console.error('Lỗi khi ghi log undo:', logErr.message);
            }

            try {
                await this.handleIncomingUndo(undoData);
                incrementToolStat('undo', true);
            } catch (err) {
                console.error('Lỗi khi xử lý undo:', err.message);
                incrementToolStat('undo', false);
            }
        });

        // 4. Lắng nghe các sự kiện của nhóm
        this.api.listener.on('group_event', async (groupEvent) => {
            const enabledTools = getEnabledTools();
            if (enabledTools.group_event === false) return; // Bị tắt

            try {
                logger.info('group_event', `Nhận sự kiện nhóm trong nhóm ${groupEvent.threadId}: Loại "${groupEvent.type || 'unknown'}" do ${groupEvent.data?.creatorId || 'hệ thống'} kích hoạt`, groupEvent.data);
            } catch (logErr) {
                console.error('Lỗi khi ghi log group_event:', logErr.message);
            }

            try {
                await this.handleIncomingGroupEvent(groupEvent);
                incrementToolStat('group_event', true);
            } catch (err) {
                console.error('Lỗi khi xử lý group_event:', err.message);
                incrementToolStat('group_event', false);
            }
        });

        // Khởi động lắng nghe
        this.api.listener.start({ retryOnClose: true });
    }

    // Xử lý khi nhận sự kiện thả cảm xúc tin nhắn
    async handleIncomingReaction(reaction) {
        const { getEnabledTools } = require('./ai-tools');
        if (getEnabledTools().reaction === false) return;

        console.log(`[Zalo Client] Đã nhận cảm xúc từ ${reaction.data?.uidFrom || 'hệ thống'} trong ${reaction.threadId}`);
    }

    // Xử lý khi nhận sự kiện thu hồi tin nhắn
    async handleIncomingUndo(undoData) {
        const { getEnabledTools } = require('./ai-tools');
        if (getEnabledTools().undo === false) return;

        console.log(`[Zalo Client] Đã nhận yêu cầu thu hồi tin nhắn từ ${undoData.data?.uidFrom || 'hệ thống'} trong ${undoData.threadId}`);
    }

    // Xử lý khi nhận sự kiện nhóm
    async handleIncomingGroupEvent(groupEvent) {
        const { getEnabledTools } = require('./ai-tools');
        if (getEnabledTools().group_event === false) return;

        console.log(`[Zalo Client] Đã nhận sự kiện nhóm ${groupEvent.type} trong nhóm ${groupEvent.threadId}`);
    }

    // Xử lý kiểm duyệt từ khóa khi có tin nhắn mới đến (Ngữ cảnh nâng cao)
    async handleIncomingMessage(message) {
        if (!message || !message.data) return;

        // Kiểm tra xem tính năng lắng nghe tin nhắn có được bật không
        const { getEnabledTools } = require('./ai-tools');
        if (getEnabledTools().message === false) return;

        // Chỉ xử lý tin nhắn trong nhóm chat (ThreadType.Group = 1 trong zca-js thực tế, hoặc 2 trong giả lập)
        if (message.type !== ThreadType.Group && message.type !== 2) return;

        const ownId = this.api ? this.api.getOwnId() : null;
        const isSelf = String(ownId) === String(message.data.uidFrom);
        const groupId = message.threadId;

        // 1. Lấy nội dung tin nhắn dạng văn bản (hỗ trợ ảnh và sticker làm bối cảnh chi tiết)
        let textContent = '';
        if (message.data.msgType === 'chat.photo') {
            const imgUrl = message.data.content && (message.data.content.hdUrl || message.data.content.href || message.data.content.thumb);
            const caption = message.data.content && (message.data.content.title || message.data.content.description || '');
            const imgText = imgUrl ? `[Hình ảnh: ${imgUrl}]` : '[Hình ảnh]';
            textContent = caption ? `${caption.trim()} ${imgText}` : imgText;
        } else if (message.data.msgType === 'chat.sticker') {
            const stickerId = message.data.content && message.data.content.id;
            const catId = message.data.content && message.data.content.catId;
            const stickerUrl = (stickerId && catId) ? `https://zalo-api.cdn.zalo.me/clipart/${catId}/${stickerId}/240/1.png` : '';
            textContent = stickerUrl ? `[Nhãn dán: ${stickerUrl}]` : '[Nhãn dán]';
        } else {
            textContent = typeof message.data.content === 'string' ? message.data.content.trim() : '';
        }

        // 2. Tự động tải lịch sử chat thật từ Zalo API nếu cache đang trống hoặc quá ngắn (giúp hiểu bối cảnh tốt hơn)
        if (this.api && !this.isSimulation && (!conversationHistory[groupId] || conversationHistory[groupId].length < 3)) {
            try {
                console.log(`Bot Zalo: Đang tự động nạp lịch sử chat thật từ Zalo API cho nhóm ${groupId}...`);
                const historyRes = await this.api.getGroupChatHistory(groupId, 15);
                if (historyRes && historyRes.groupMsgs) {
                    const rawMsgs = historyRes.groupMsgs;
                    // Đảo ngược để có trình tự thời gian cũ -> mới
                    const sortedMsgs = [...rawMsgs].reverse();
                    
                    const tempHistory = [];
                    for (const m of sortedMsgs) {
                        const isMsgSelf = String(ownId) === String(m.data.uidFrom);
                        let mText = '';
                        if (m.data.msgType === 'chat.photo') {
                            const imgUrl = m.data.content && (m.data.content.hdUrl || m.data.content.href || m.data.content.thumb);
                            const caption = m.data.content && (m.data.content.title || m.data.content.description || '');
                            const imgText = imgUrl ? `[Hình ảnh: ${imgUrl}]` : '[Hình ảnh]';
                            mText = caption ? `${caption.trim()} ${imgText}` : imgText;
                        } else if (m.data.msgType === 'chat.sticker') {
                            const stickerId = m.data.content && m.data.content.id;
                            const catId = m.data.content && m.data.content.catId;
                            const stickerUrl = (stickerId && catId) ? `https://zalo-api.cdn.zalo.me/clipart/${catId}/${stickerId}/240/1.png` : '';
                            mText = stickerUrl ? `[Nhãn dán: ${stickerUrl}]` : '[Nhãn dán]';
                        } else {
                            mText = typeof m.data.content === 'string' ? m.data.content.trim() : '';
                        }

                        if (mText) {
                            const ts = m.data.ts ? parseInt(m.data.ts) : Date.now();
                            if (isMsgSelf) {
                                tempHistory.push({
                                    role: 'assistant',
                                    content: mText,
                                    timestamp: ts
                                });
                            } else {
                                const senderName = await getSenderName(this.api, m.data.uidFrom);
                                tempHistory.push({
                                    role: 'user',
                                    content: `${senderName}: ${mText}`,
                                    timestamp: ts,
                                    senderId: String(m.data.uidFrom),
                                    senderName: senderName
                                });
                            }
                        }
                    }
                    if (tempHistory.length > 0) {
                        conversationHistory[groupId] = tempHistory;
                    }
                }
            } catch (histErr) {
                console.error(`Bot Zalo: Không thể đồng bộ lịch sử chat từ Zalo: ${histErr.message}`);
            }
        }

        // Đảm bảo conversationHistory[groupId] được khởi tạo
        if (!conversationHistory[groupId]) {
            conversationHistory[groupId] = [];
        }

        // 3. Cập nhật lịch sử hội thoại của nhóm (bất kể tin nhắn gì) để làm bối cảnh
        // Kiểm tra xem tin nhắn hiện tại có bị trùng với tin nhắn cuối cùng trong lịch sử (tránh lặp do nạp Zalo API ở trên)
        let isDuplicate = false;
        if (conversationHistory[groupId].length > 0) {
            const lastMsg = conversationHistory[groupId][conversationHistory[groupId].length - 1];
            const senderName = isSelf ? 'assistant' : await getSenderName(this.api, message.data.uidFrom);
            const currentContentToCheck = isSelf ? textContent : `${senderName}: ${textContent}`;
            if (lastMsg.content === currentContentToCheck) {
                isDuplicate = true;
            }
        }

        if (textContent && !isDuplicate) {
            const ts = message.data.ts ? parseInt(message.data.ts) : Date.now();
            const msgId = message.data.msgId ? String(message.data.msgId) : undefined;
            const cliMsgId = message.data.cliMsgId ? String(message.data.cliMsgId) : undefined;
            if (isSelf) {
                // Tin nhắn của chính bot
                conversationHistory[groupId].push({
                    role: 'assistant',
                    content: textContent,
                    timestamp: ts,
                    msgId,
                    cliMsgId
                });
            } else {
                // Tin nhắn của thành viên khác, lấy tên người gửi
                const senderName = await getSenderName(this.api, message.data.uidFrom);
                conversationHistory[groupId].push({
                    role: 'user',
                    content: `${senderName}: ${textContent}`,
                    timestamp: ts,
                    senderId: String(message.data.uidFrom),
                    senderName: senderName,
                    msgId,
                    cliMsgId
                });
            }

            // Giới hạn tối đa 15 tin nhắn bối cảnh gần nhất
            if (conversationHistory[groupId].length > 15) {
                conversationHistory[groupId] = conversationHistory[groupId].slice(-15);
            }
        }

        // Tránh bot tự kích hoạt phản hồi AI của chính mình
        if (isSelf) return;

        // --- 3.5. XỬ LÝ PHẢN HỒI/PHÊ DUYỆT TỪ TIN NHẮN TRÍCH DẪN (QUOTE APPROVAL ROUTING) ---
        if (message.data.quote && message.data.quote.msg) {
            const quotedMsg = message.data.quote.msg;
            const isAiForward = quotedMsg.includes('AI PHÒNG BAN') || quotedMsg.includes('AI TRÍCH XUẤT');
            const idMatch = quotedMsg.match(/\[id:([^\]]+)\]/);
            
            if (isAiForward && idMatch) {
                const originGroupId = idMatch[1];
                
                // Tối ưu hóa: Dọn dẹp câu trả lời của sếp (loại bỏ mention bot và các tag thô)
                let bossReply = textContent || '';
                if (this.name) {
                    const mentionRegex = new RegExp(`@${this.name}`, 'gi');
                    bossReply = bossReply.replace(mentionRegex, '');
                }
                bossReply = bossReply.replace(/@[0-9]+/g, '').trim();
                
                // Trích xuất tên người gửi gốc và nội dung yêu cầu gốc từ tin nhắn trích dẫn (nếu có)
                const senderMatch = quotedMsg.match(/• Thành viên gửi:\s*([^\r\n(]+)/i);
                const originalSenderName = senderMatch ? senderMatch[1].trim() : 'Thành viên';
                
                const rawMsgMatch = quotedMsg.match(/• Nội dung yêu cầu:\s*"(.*)"/is) || quotedMsg.match(/• Nội dung gốc:\s*"(.*)"/is);
                let originalRequest = rawMsgMatch ? rawMsgMatch[1].trim() : '';
                
                // Tối ưu hóa: Cắt ngắn phần hiển thị nếu yêu cầu quá dài
                if (originalRequest && originalRequest.length > 60) {
                    originalRequest = originalRequest.substring(0, 57) + '...';
                }

                // Phân tích loại yêu cầu từ tin nhắn trích dẫn để dùng từ phù hợp ngữ cảnh
                let requestTypeLabel = 'yêu cầu';
                const typeMatch = quotedMsg.match(/• Phân loại:\s*([^\r\n]+)/i) || quotedMsg.match(/• Loại yêu cầu:\s*([^\r\n]+)/i);
                if (typeMatch) {
                    // Loại bỏ emoji và khoảng trắng thừa
                    let rawType = typeMatch[1]
                        .replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '')
                        .trim()
                        .toLowerCase();
                    
                    // Chuẩn hóa một số từ khóa để nghe tự nhiên hơn
                    if (rawType.includes('đơn hàng')) {
                        requestTypeLabel = 'đơn hàng';
                    } else if (rawType.includes('báo cáo')) {
                        requestTypeLabel = 'báo cáo';
                    } else if (rawType.includes('lịch hẹn') || rawType.includes('sự kiện')) {
                        requestTypeLabel = 'lịch hẹn';
                    } else if (rawType.includes('khảo sát') || rawType.includes('bình chọn')) {
                        requestTypeLabel = 'khảo sát';
                    } else if (rawType.includes('chỉ đạo')) {
                        requestTypeLabel = 'yêu cầu xin chỉ đạo';
                    } else if (rawType.includes('phê duyệt')) {
                        requestTypeLabel = 'đề xuất/yêu cầu phê duyệt';
                    } else {
                        requestTypeLabel = rawType;
                    }
                } else {
                    // Fallback theo cách kiểm tra từ khóa cũ
                    if (quotedMsg.includes('ĐƠN HÀNG') || quotedMsg.includes('đơn hàng')) {
                        requestTypeLabel = 'đơn hàng';
                    } else if (quotedMsg.includes('BÁO CÁO') || quotedMsg.includes('báo cáo')) {
                        requestTypeLabel = 'báo cáo';
                    } else if (quotedMsg.includes('LỊCH HẸN') || quotedMsg.includes('lịch hẹn')) {
                        requestTypeLabel = 'lịch hẹn';
                    } else if (quotedMsg.includes('KHẢO SÁT') || quotedMsg.includes('khảo sát')) {
                        requestTypeLabel = 'khảo sát';
                    } else if (quotedMsg.includes('phê duyệt') || quotedMsg.includes('Phê duyệt')) {
                        requestTypeLabel = 'đề xuất/yêu cầu';
                    }
                }
                
                // Tối ưu hóa: Lấy tên thật của sếp để làm phản hồi thân mật và rõ ràng
                const bossName = this.api ? await getSenderName(this.api, message.data.uidFrom) : 'Sếp';
                
                console.log(`[Quote Reply Approval] Sếp ${bossName} phản hồi tin nhắn trích dẫn. Nhóm nguồn: ${originGroupId}, Phân loại: ${requestTypeLabel}, Phản hồi: "${bossReply}"`);
                
                // Phân tích nội dung phản hồi của sếp để phân loại (Duyệt / Từ chối / Chỉ đạo khác)
                const approveKeywords = ['ok', '0k', 'oke', 'duyệt', 'đồng ý', 'approve', 'yes', 'nhất trí', 'chấp thuận'];
                const rejectKeywords = ['không đồng ý', 'không duyệt', 'từ chối', 'hủy', 'cancel', 'deny', 'reject', 'không ok', 'ko ok', 'hủy bỏ'];

                const bossTextLower = bossReply.toLowerCase().trim();
                const words = bossTextLower.split(/[\s.,!?()'"";:\[\]{}-]+/);

                let isApproved = approveKeywords.some(k => {
                    if (k.includes(' ')) return bossTextLower.includes(k);
                    return words.includes(k);
                });

                let isRejected = rejectKeywords.some(k => {
                    if (k.includes(' ')) return bossTextLower.includes(k);
                    return words.includes(k);
                });

                if (isRejected) {
                    // Tránh nhận diện nhầm duyệt khi sếp nói "không duyệt", "không đồng ý"
                    isApproved = false;
                }

                // Xác định động từ phản hồi tự nhiên & icon phù hợp ngữ cảnh
                let verbApproved = 'phê duyệt';
                let verbRejected = 'từ chối';
                let icon = '🎉';
                
                if (requestTypeLabel === 'đơn hàng') {
                    verbApproved = 'duyệt và đồng ý triển khai';
                    verbRejected = 'từ chối';
                    icon = '🛒';
                } else if (requestTypeLabel === 'báo cáo') {
                    verbApproved = 'thông qua và ghi nhận';
                    verbRejected = 'yêu cầu điều chỉnh/chưa thông qua';
                    icon = '📊';
                } else if (requestTypeLabel === 'lịch hẹn') {
                    verbApproved = 'xác nhận và đồng ý';
                    verbRejected = 'từ chối/hủy';
                    icon = '📅';
                } else if (requestTypeLabel === 'khảo sát') {
                    verbApproved = 'thông qua';
                    verbRejected = 'từ chối';
                    icon = '📝';
                } else if (requestTypeLabel.includes('chỉ đạo')) {
                    verbApproved = 'đồng ý chỉ đạo';
                    verbRejected = 'chưa đồng ý/bác bỏ';
                    icon = '💡';
                } else {
                    verbApproved = 'phê duyệt';
                    verbRejected = 'từ chối';
                    icon = '🎉';
                }

                // Kiểm tra xem phản hồi của sếp có phải chỉ là từ khóa ngắn/đơn giản hay không
                const simpleApproveWords = ['ok', '0k', 'oke', 'duyệt', 'đồng ý', 'approve', 'yes', 'nhất trí', 'chấp thuận', 'ok duyệt', 'ok nhé', 'ok nhe', 'ok nha'];
                const simpleRejectWords = ['không đồng ý', 'không duyệt', 'từ chối', 'hủy', 'cancel', 'deny', 'reject', 'không ok', 'ko ok', 'hủy bỏ', 'ko', 'k', 'không'];
                
                const bossReplyClean = bossReply.trim();
                const bossReplyLower = bossReplyClean.toLowerCase().replace(/[.,!?]/g, '').trim();
                
                const isSimpleReply = simpleApproveWords.includes(bossReplyLower) || 
                                      simpleRejectWords.includes(bossReplyLower) || 
                                      bossReplyClean.length <= 4;

                let feedbackText = '';
                let newStatus = 'completed';
                const requestSnippet = originalRequest ? ` "${originalRequest}"` : '';

                if (isRejected) {
                    newStatus = 'cancelled';
                    feedbackText = `Dạ, sếp ${bossName} đã ${verbRejected} ${requestTypeLabel}${requestSnippet} của ${originalSenderName} rồi ạ.`;
                    if (!isSimpleReply) {
                        feedbackText += `\n👉 Chi tiết lý do: "${bossReplyClean}"`;
                    }
                } else if (isApproved) {
                    newStatus = 'completed';
                    feedbackText = `Dạ, ${requestTypeLabel}${requestSnippet} của ${originalSenderName} đã được sếp ${bossName} ${verbApproved} rồi ạ! ${icon}`;
                    if (!isSimpleReply) {
                        feedbackText += `\n👉 Ý kiến sếp: "${bossReplyClean}"`;
                    }
                } else {
                    newStatus = 'completed';
                    feedbackText = `Dạ, sếp ${bossName} có ý kiến chỉ đạo về ${requestTypeLabel}${requestSnippet} của ${originalSenderName} như sau ạ:\n👉 "${bossReplyClean}"`;
                }
                
                try {
                    // 1. Gửi phản hồi về nhóm nguồn
                    await this.sendMessage(originGroupId, feedbackText, 1);
                    console.log(`[Quote Reply Approval] Đã gửi phản hồi của sếp về nhóm nguồn: ${originGroupId}`);
                    
                    // 2. Xác nhận lại với sếp tại Host Group với thông tin cụ thể tên nhóm nguồn
                    const originGroupName = this.api ? await getGroupName(this.api, originGroupId) : 'nhóm nguồn';
                    await this.sendMessage(groupId, `✅ Đã chuyển tiếp ý kiến của Sếp về nhóm "${originGroupName}" thành công!`, 1);
                    
                    // 3. Cập nhật trạng thái của bản ghi dữ liệu trích xuất tương ứng trong CSDL SQLite
                    // Thử trích xuất nội dung yêu cầu hoặc nội dung gốc từ tin nhắn trích dẫn
                    const dbRawMsgMatch = quotedMsg.match(/• Nội dung yêu cầu:\s*"(.*)"/is) || quotedMsg.match(/• Nội dung gốc:\s*"(.*)"/is);
                    if (dbRawMsgMatch) {
                        const rawMsgContent = dbRawMsgMatch[1].trim();
                        const { prisma } = require('./database');
                        const dbUpdate = await prisma.groupData.updateMany({
                            where: {
                                groupId: originGroupId,
                                rawMessage: rawMsgContent,
                                status: 'pending'
                            },
                            data: {
                                status: newStatus
                            }
                        });
                        console.log(`[Quote Reply Approval] Cập nhật trạng thái '${newStatus}' cho ${dbUpdate.count} bản ghi dữ liệu nhóm thành công.`);
                    }
                } catch (err) {
                    console.error('Lỗi khi xử lý chuyển tiếp phản hồi của sếp từ tin nhắn trích dẫn:', err.message);
                }
                return; // Dừng xử lý tiếp (không chạy Auto-reply hay phân tích AI tiếp cho tin nhắn này)
            }
        }

        const text = textContent.toLowerCase();

        // 4. Kiểm tra cấu hình kiểm duyệt Link của nhóm
        try {
            const { groupSettingsDb } = require('./database');
            const settings = await groupSettingsDb.findOne({ groupId: message.threadId });
            
            if (settings && settings.allowLink === false) {
                const urlRegex = /(https?:\/\/[^\s]+)/gi;
                if (urlRegex.test(text)) {
                    if (this.api && String(this.api.getOwnId()) !== String(message.data.uidFrom)) {
                        console.log(`Bot: Phát hiện tin nhắn chứa link vi phạm từ ${message.data.uidFrom} trong nhóm ${message.threadId}. Tiến hành xóa...`);
                        try {
                            await this.api.deleteMessage({
                                threadId: message.threadId,
                                type: 1, // ThreadType.Group = 1 trong zca-js deleteMessage api
                                data: {
                                    cliMsgId: message.data.cliMsgId,
                                    msgId: message.data.msgId,
                                    uidFrom: message.data.uidFrom
                                }
                            }, false);
                            console.log('Bot: Đã xóa tin nhắn chứa link vi phạm thành công.');
                            
                            // Gửi cảnh báo vào nhóm
                            await this.sendMessage(message.threadId, `⚠️ Cảnh báo: Nhóm này không cho phép gửi liên kết. Tin nhắn của bạn đã bị gỡ bỏ tự động.`, 1);
                            return; // Dừng xử lý tiếp (không chạy Auto-reply nữa)
                        } catch (err) {
                            console.error('Lỗi khi bot xóa tin nhắn chứa link:', err.message);
                        }
                    }
                }
            }
        } catch (dbErr) {
            console.error('Lỗi kiểm tra cấu hình kiểm duyệt link:', dbErr.message);
        }

        // --- 4.5. KIỂM TRA TỰ ĐỘNG GỌI ĐIỆN THEO YÊU CẦU ---
        const callKeywords = ['gọi', 'call', 'gọi điện', 'gọi cho', 'gọi đt', 'gọi số', 'call me', 'alo cho', 'gọi hỗ trợ', 'gọi tư vấn'];
        const hasCallRequest = callKeywords.some(k => text.includes(k));
        const extractedPhone = extractPhoneNumber(textContent);

        if (hasCallRequest && extractedPhone) {
            console.log(`Bot: Phát hiện yêu cầu gọi điện tới số: ${extractedPhone}`);
            try {
                const { aiSettingsDb } = require('./database');
                const aiConfig = await aiSettingsDb.findOne({});
                if (aiConfig && aiConfig.aiEnabled) {
                    const { makeOutboundCall } = require('./call-controller');
                    await this.sendMessage(message.threadId, `Dạ, em đã nhận được yêu cầu. Trợ lý AI đang thực hiện cuộc gọi hỗ trợ tới số điện thoại ${extractedPhone} ngay bây giờ ạ!`, 1);
                    
                    makeOutboundCall(extractedPhone, aiConfig).then((callResult) => {
                        console.log('Outbound call triggered successfully from Zalo request:', callResult);
                    }).catch(err => {
                        console.error('Lỗi khi thực hiện cuộc gọi tự động từ Zalo request:', err.message);
                    });
                    return; // Dừng xử lý tiếp
                }
            } catch (callErr) {
                console.error('Lỗi tích hợp gọi điện tự động:', callErr.message);
            }
        }

        // 5. Kiểm tra cấu hình Trợ lý AI (OpenAI & Gemini)
        try {
            const { aiSettingsDb } = require('./database');
            const aiConfig = await aiSettingsDb.findOne({});
            if (aiConfig && aiConfig.aiEnabled && aiConfig.aiApiKey) {
                const isGroupAllowed = aiConfig.aiGroups.length === 0 || aiConfig.aiGroups.includes(message.threadId);
                if (isGroupAllowed) {
                    // Tự động phân tích và trích xuất dữ liệu nhóm (đơn hàng, báo cáo) từ tin nhắn của thành viên
                    if (!isSelf) {
                        const textLower = textContent.toLowerCase();
                        
                        // 1. Kiểm tra trích xuất dữ liệu tự động
                        const extractKeywords = [
                            'đặt', 'mua', 'order', 'lấy', 'bán', 'gửi', 'ship', 'cà phê', 'nước', 'pizza', 'bánh', 'suất', 'phần', 'món', 'cơm',
                            'báo cáo', 'kết quả', 'tiến độ', 'kpi', 'doanh thu', 'kế hoạch', 'hoàn thành', 'done', 'checkin', 'checkout', 'báo cáo ngày', 'tuần',
                            'họp', 'lịch họp', 'lịch hẹn', 'hẹn', 'sự kiện', 'nhắc hẹn', 'nhắc lịch',
                            'khảo sát', 'bình chọn', 'biểu quyết', 'thăm dò', 'ý kiến', 'vote'
                        ];
                        const shouldExtract = extractKeywords.some(k => textLower.includes(k));
                        if (shouldExtract) {
                            const currentSenderId = String(message.data.uidFrom);
                            const senderName = await getSenderName(this.api, message.data.uidFrom);
                            const aiAnalysisQueue = require('./ai-queue');
                            aiAnalysisQueue.debounce(groupId, currentSenderId, 'extract', senderName, message, async (messagesSegment) => {
                                await analyzeAndExtractGroupData(groupId, currentSenderId, senderName, conversationHistory[groupId], aiConfig, this);
                            });
                        }

                        // 2. Kiểm tra yêu cầu xin ý kiến, chỉ đạo, phê duyệt để chuyển tiếp Host Group
                        const requestKeywords = ['xin ý kiến', 'xin chỉ đạo', 'chỉ đạo', 'phê duyệt', 'xin phê duyệt', 'duyệt'];
                        const hasRequest = requestKeywords.some(k => textLower.includes(k));
                        if (hasRequest) {
                            (async () => {
                                try {
                                    const { prisma } = require('./database');
                                    const groupSetting = await prisma.groupSetting.findUnique({
                                        where: { groupId }
                                    });
                                    let targetHostGroupId = groupSetting ? groupSetting.hostGroupId : null;
                                    if (!targetHostGroupId && aiConfig.globalHostGroupId) {
                                        targetHostGroupId = aiConfig.globalHostGroupId;
                                    }
                                    
                                    if (targetHostGroupId && String(targetHostGroupId) !== String(groupId)) {
                                        const senderName = await getSenderName(this.api, message.data.uidFrom);
                                        const originGroupName = this.api ? await getGroupName(this.api, groupId) : 'Nhóm Zalo';
                                        
                                        let reqType = 'Yêu cầu ý kiến / Chỉ đạo';
                                        if (textLower.includes('phê duyệt') || textLower.includes('duyệt')) {
                                            reqType = 'Yêu cầu phê duyệt';
                                        } else if (textLower.includes('chỉ đạo')) {
                                            reqType = 'Xin ý kiến chỉ đạo';
                                        }
                                        
                                        const forwardText = `📌 [AI PHÒNG BAN - YÊU CẦU CHỈ ĐẠO & PHÊ DUYỆT]
• Loại yêu cầu: ${reqType}
• Nhóm nguồn: ${originGroupName}
• ID nhóm nguồn: [id:${groupId}]
• Thành viên gửi: ${senderName} (ID: ${message.data.uidFrom})
• Nội dung yêu cầu: "${textContent}"`;

                                        console.log(`[AI Group Host Key] Đang chuyển tiếp yêu cầu chỉ đạo/phê duyệt sang nhóm host ${targetHostGroupId}...`);
                                        await this.sendMessage(targetHostGroupId, forwardText, 1);
                                    }
                                } catch (err) {
                                    console.error('Lỗi khi chuyển tiếp yêu cầu phê duyệt sang Group Host:', err.message);
                                }
                            })();
                        }
                    }

                    let isTriggered = false;
                    let isMentioned = false;

                    if (aiConfig.aiMode === 'all_messages') {
                        isTriggered = true;
                    } else {
                        const prefix = aiConfig.aiTriggerPrefix.toLowerCase();
                        if (text.startsWith(prefix) || text.includes(prefix)) {
                            isTriggered = true;
                        }

                        // Kiểm tra tag bot qua mentions (String-safe)
                        if (!isTriggered && message.data.mentions && Array.isArray(message.data.mentions)) {
                            isMentioned = message.data.mentions.some(m => String(m.uid || m.userId) === String(ownId));
                            if (isMentioned) {
                                isTriggered = true;
                            }
                        }

                        // Tự động nhận dạng liên quan bằng từ khóa/tên bot
                        if (!isTriggered) {
                            const nameToMatch = (this.name || '').toLowerCase();
                            const triggerWords = ['trợ lý', 'bot', 'admin', 'ad'];
                            const textLower = text.toLowerCase();
                            
                            const hasTriggerWord = triggerWords.some(word => {
                                const idx = textLower.indexOf(word);
                                if (idx === -1) return false;
                                
                                const charBefore = idx > 0 ? textLower[idx - 1] : ' ';
                                const charAfter = idx + word.length < textLower.length ? textLower[idx + word.length] : ' ';
                                
                                const isBoundBefore = idx === 0 || /[\s.,!?()'"";:\[\]{}]/.test(charBefore);
                                const isBoundAfter = idx + word.length === textLower.length || /[\s.,!?()'"";:\[\]{}]/.test(charAfter);
                                
                                return isBoundBefore && isBoundAfter;
                            });
                            
                            const hasBotName = nameToMatch && textLower.includes(nameToMatch);
                            
                            if (hasTriggerWord || hasBotName) {
                                isTriggered = true;
                                console.log(`[Bot Trigger] Nhận diện tin nhắn gọi bot bằng tên hiển thị hoặc từ khóa.`);
                            }
                        }

                        // Tự động nhận dạng liên quan bằng đàm thoại nối tiếp (trong vòng 15 phút và cùng một người gửi)
                        if (!isTriggered && conversationHistory[groupId] && conversationHistory[groupId].length > 1) {
                            const lastMsg = conversationHistory[groupId][conversationHistory[groupId].length - 2];
                            if (lastMsg && lastMsg.role === 'assistant') {
                                const elapsedMs = Date.now() - (lastMsg.timestamp || 0);
                                if (elapsedMs > 0 && elapsedMs < 15 * 60 * 1000) {
                                    // Tìm tin nhắn user gần nhất trước tin nhắn của assistant này
                                    let lastUserMsg = null;
                                    for (let i = conversationHistory[groupId].length - 3; i >= 0; i--) {
                                        if (conversationHistory[groupId][i].role === 'user') {
                                            lastUserMsg = conversationHistory[groupId][i];
                                            break;
                                        }
                                    }
                                    
                                    const currentSenderId = String(message.data.uidFrom);
                                    if (lastUserMsg && lastUserMsg.senderId && String(lastUserMsg.senderId) === currentSenderId) {
                                        isTriggered = true;
                                        console.log(`[Bot Trigger] Tự động đàm thoại nối tiếp với cùng người gửi ${currentSenderId} (Trễ: ${(elapsedMs / 1000).toFixed(1)}s).`);
                                    } else {
                                        console.log(`[Bot Trigger] Bỏ qua đàm thoại nối tiếp vì người gửi hiện tại (${currentSenderId}) khác người gửi trước (${lastUserMsg ? lastUserMsg.senderId : 'N/A'}).`);
                                    }
                                }
                            }
                        }
                    }

                    if (isTriggered) {
                        // Kiểm tra xem có người khác cắt ngang hội thoại hay không
                        let isInterrupted = false;
                        let prevSenderName = '';
                        let prevSenderId = '';
                        if (conversationHistory[groupId] && conversationHistory[groupId].length > 1) {
                            const historyLength = conversationHistory[groupId].length;
                            let lastAssistantMsg = null;
                            let lastAssistantIdx = -1;
                            
                            // Duyệt ngược tìm tin nhắn của bot (role: assistant)
                            for (let i = historyLength - 2; i >= 0; i--) {
                                if (conversationHistory[groupId][i].role === 'assistant') {
                                    lastAssistantMsg = conversationHistory[groupId][i];
                                    lastAssistantIdx = i;
                                    break;
                                }
                            }
                            
                            if (lastAssistantMsg && lastAssistantIdx > 0) {
                                const elapsedMs = Date.now() - (lastAssistantMsg.timestamp || 0);
                                if (elapsedMs > 0 && elapsedMs < 15 * 60 * 1000) {
                                    // Tìm tin nhắn user ngay trước tin nhắn assistant này để biết ai là người chat cũ
                                    let lastUserMsg = null;
                                    for (let i = lastAssistantIdx - 1; i >= 0; i--) {
                                        if (conversationHistory[groupId][i].role === 'user') {
                                            lastUserMsg = conversationHistory[groupId][i];
                                            break;
                                        }
                                    }
                                    const currentSenderId = String(message.data.uidFrom);
                                    if (lastUserMsg && lastUserMsg.senderId && String(lastUserMsg.senderId) !== currentSenderId) {
                                        isInterrupted = true;
                                        prevSenderId = String(lastUserMsg.senderId);
                                        prevSenderName = lastUserMsg.senderName || (lastUserMsg.content.includes(':') ? lastUserMsg.content.split(':')[0].trim() : 'thành viên khác');
                                    }
                                }
                            }
                        }

                        // Lọc bỏ tag bot hoặc prefix khỏi tin nhắn bối cảnh cuối cùng để AI đọc sạch hơn
                        let cleanText = textContent;
                        if (isMentioned && this.name) {
                            const mentionRegex = new RegExp(`@${this.name}`, 'i');
                            cleanText = cleanText.replace(mentionRegex, '').trim();
                        }
                        const prefix = aiConfig.aiTriggerPrefix.toLowerCase();
                        if (cleanText.toLowerCase().startsWith(prefix)) {
                            cleanText = cleanText.substring(prefix.length).trim();
                        } else if (cleanText.toLowerCase().includes(prefix)) {
                            const regex = new RegExp(prefix, 'i');
                            cleanText = cleanText.replace(regex, '').trim();
                        }

                        // Nếu tin nhắn trống sau khi lọc tag, không gửi AI
                        if (!cleanText) {
                            console.log(`Bot: Tin nhắn trống sau khi lọc tag tên, không gửi AI.`);
                            return;
                        }

                        // Cập nhật lại tin nhắn cuối cùng trong lịch sử bằng cleanText (không có tag) để gửi AI
                        if (conversationHistory[groupId] && conversationHistory[groupId].length > 0) {
                            const lastMsg = conversationHistory[groupId][conversationHistory[groupId].length - 1];
                            const senderName = await getSenderName(this.api, message.data.uidFrom);
                            lastMsg.content = `${senderName}: ${cleanText}`;
                        }

                        // --- KHỞI ĐỘNG HIỆU ỨNG GÕ CHỮ (TYPING INDICATOR) ---
                        let typingInterval = null;
                        if (this.api && !this.isSimulation) {
                            try {
                                console.log(`[Typing Event] Kích hoạt trạng thái đang gõ chữ cho nhóm ${groupId}...`);
                                await this.api.sendTypingEvent(groupId, ThreadType.Group);
                                
                                // Gửi lại định kỳ mỗi 4 giây phòng trường hợp AI phản hồi lâu
                                typingInterval = setInterval(async () => {
                                    try {
                                        if (this.api && !this.isSimulation) {
                                            await this.api.sendTypingEvent(groupId, ThreadType.Group);
                                        }
                                    } catch (err) {
                                        console.warn('[Typing Event Error] Lỗi gửi sự kiện gõ chữ định kỳ:', err.message);
                                    }
                                }, 4000);
                            } catch (err) {
                                console.warn('[Typing Event Error] Lỗi khởi động hiệu ứng gõ chữ:', err.message);
                            }
                        }

                        try {
                            console.log(`Bot: Gửi bối cảnh hội thoại AI cho nhóm ${message.threadId} (Tổng: ${conversationHistory[groupId].length} tin nhắn)`);
                            
                            // Mô phỏng trễ 1-2 giây để giống người thật
                            await new Promise(r => setTimeout(r, Math.floor(Math.random() * 1000) + 1000));
                            
                            // Lấy tên nhóm chat và tên người gửi để tạo Dynamic Context
                            const groupName = this.api ? await getGroupName(this.api, groupId) : 'Nhóm Zalo';
                            const senderName = this.api ? await getSenderName(this.api, message.data.uidFrom) : 'Thành viên';
                            const botName = this.name || 'Trợ lý AI';
                            
                            // --- TRÍCH XUẤT TRI THỨC (RAG) ---
                            let knowledgeContext = '';
                            try {
                                const { knowledgeDb } = require('./database');
                                const { queryHybridRag } = require('./document-sync');
                                
                                const matchedChunks = await queryHybridRag(cleanText, aiConfig, knowledgeDb);
                                
                                if (matchedChunks && matchedChunks.length > 0) {
                                    knowledgeContext = `[HỆ THỐNG TRI THỨC ĐƯỢC CẤP - HÃY DÙNG THÔNG TIN NÀY ĐỂ TRẢ LỜI]\n`;
                                    matchedChunks.forEach((item, idx) => {
                                        knowledgeContext += `Tài liệu ${idx + 1} (Chủ đề: ${item.docTitle}): ${item.text}\n\n`;
                                    });
                                    knowledgeContext += `[HẾT HỆ THỐNG TRI THỨC]\n\nLưu ý: Bạn phải ưu tiên sử dụng thông tin tri thức được cấp để trả lời.`;
                                }
                            } catch (e) {
                                console.error('Lỗi khi truy vấn RAG:', e);
                            }
                            
                            // --- TRÍCH XUẤT HỒ SƠ THÀNH VIÊN VÀ BỘ NHỚ AI ---
                            let memberProfileContext = '';
                            let pronoun = 'bạn';
                            let avatarUrl = null;
                            try {
                                const currentSenderId = String(message.data.uidFrom);
                                const { prisma } = require('./database');
                                const memberId = `${groupId}-${message.data.uidFrom}`;
                                const dbMember = await prisma.member.findUnique({
                                    where: { id: memberId },
                                    include: { memories: true }
                                });
                                
                                // Lấy URL ảnh đại diện Zalo thực tế
                                avatarUrl = this.api ? await getSenderAvatar(this.api, message.data.uidFrom) : null;
                                
                                // Xác định danh xưng xưng hô
                                if (dbMember && dbMember.xungHo) {
                                    pronoun = dbMember.xungHo.toLowerCase();
                                } else {
                                    pronoun = detectPronoun(senderName);
                                    // Chạy phân tích ảnh đại diện ngầm bằng AI Thị giác nếu chưa có danh xưng
                                    if (avatarUrl && dbMember) {
                                        const { analyzeAndSetPronounFromAvatar } = require('./ai-analyzers');
                                        analyzeAndSetPronounFromAvatar(dbMember.id, senderName, avatarUrl, aiConfig).catch(err => {
                                            console.error('Lỗi chạy ngầm nhận diện xưng hô từ avatar:', err.message);
                                        });
                                    }
                                }
                                
                                if (dbMember) {
                                    memberProfileContext = `\n- Thông tin hồ sơ khách hàng / thành viên nhóm:\n`;
                                    if (dbMember.phone) memberProfileContext += `  + SĐT: ${dbMember.phone}\n`;
                                    if (dbMember.notes) memberProfileContext += `  + Ghi chú của quản trị viên: ${dbMember.notes}\n`;
                                    if (dbMember.xungHo) memberProfileContext += `  + Danh xưng cài đặt: ${dbMember.xungHo}\n`;
                                    if (dbMember.vipStatus !== 'normal') memberProfileContext += `  + Trạng thái VIP: ${dbMember.vipStatus.toUpperCase()}\n`;
                                    
                                    if (dbMember.memories && dbMember.memories.length > 0) {
                                        memberProfileContext += `  + Thông tin bạn (AI) đã ghi nhớ về thành viên này (Bộ nhớ dài hạn):\n`;
                                        dbMember.memories.forEach((m, idx) => {
                                            memberProfileContext += `    * ${m.fact} (Độ quan trọng: ${m.importance}/5)\n`;
                                        });
                                    }
                                }
                            } catch (profileErr) {
                                console.error('Lỗi truy xuất hồ sơ và bộ nhớ thành viên:', profileErr.message);
                            }

                            // --- PHÂN TÍCH CẢM XÚC HỘI THOẠI (SENTIMENT ANALYSIS) ---
                            let sentiment = 'Bình thường';
                            try {
                                sentiment = await analyzeSentiment(conversationHistory[groupId], aiConfig);
                                
                                // Lưu cảm xúc vào CSDL
                                const memberId = `${groupId}-${message.data.uidFrom}`;
                                const { prisma } = require('./database');
                                
                                // Lấy cảm xúc cũ để so sánh và kiểm tra xem có lịch sử chưa
                                const oldMember = await prisma.member.findUnique({
                                    where: { id: memberId }
                                });
                                const historyCount = await prisma.memberSentiment.count({
                                    where: {
                                        groupId,
                                        zaloId: String(message.data.uidFrom)
                                    }
                                });
                                
                                await prisma.member.upsert({
                                    where: { id: memberId },
                                    update: { lastSentiment: sentiment, avatar: avatarUrl || undefined },
                                    create: {
                                        id: memberId,
                                        groupId,
                                        zaloId: String(message.data.uidFrom),
                                        name: senderName,
                                        avatar: avatarUrl || null,
                                        vipStatus: 'normal',
                                        lastSentiment: sentiment
                                    }
                                });

                                // Chỉ lưu lịch sử biến động tâm lý nếu có thay đổi hoặc chưa có lịch sử cảm xúc nào
                                if (!oldMember || oldMember.lastSentiment !== sentiment || historyCount === 0) {
                                    await prisma.memberSentiment.create({
                                        data: {
                                            groupId,
                                            zaloId: String(message.data.uidFrom),
                                            sentiment: sentiment
                                        }
                                    });

                                    // Phát sự kiện qua Socket.io để đồng bộ real-time tức thời cho các admin đang xem dashboard
                                    if (global.io) {
                                        global.io.emit('member.sentiment.updated', {
                                            groupId,
                                            zaloId: String(message.data.uidFrom),
                                            lastSentiment: sentiment
                                        });
                                    }
                                }
                            } catch (sentErr) {
                                console.error('Lỗi phân tích hoặc lưu cảm xúc hội thoại:', sentErr.message);
                            }
                            const sentimentContext = `\n- Tâm trạng/Cảm xúc hiện tại của khách hàng: ${sentiment}. Hãy tự điều chỉnh tông giọng phản hồi của bạn cho phù hợp (Ví dụ: Nếu khách 'Tức giận', hãy trả lời thật mềm mỏng, xin lỗi và xoa dịu; nếu khách 'Lo lắng', hãy trấn an; nếu khách 'Vui vẻ', hãy tương tác thân thiện, hóm hỉnh; nếu khách 'Bình thường', hãy lịch sự và chuyên nghiệp).\n`;

                            const now = new Date();
                            const currentLocalTime = now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                            const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
                            const dayOfWeek = days[now.getDay()];
                            
                            // Tự động tính toán ngày âm lịch chính xác theo múi giờ Hồ Chí Minh
                            let lunarTimeContext = '';
                            try {
                                const formatter = new Intl.DateTimeFormat('vi-VN', {
                                    timeZone: 'Asia/Ho_Chi_Minh',
                                    year: 'numeric',
                                    month: 'numeric',
                                    day: 'numeric'
                                });
                                const parts = formatter.formatToParts(now);
                                const dayPart = parts.find(p => p.type === 'day');
                                const monthPart = parts.find(p => p.type === 'month');
                                const yearPart = parts.find(p => p.type === 'year');
                                const day = dayPart ? parseInt(dayPart.value) : now.getDate();
                                const month = monthPart ? parseInt(monthPart.value) : (now.getMonth() + 1);
                                const year = yearPart ? parseInt(yearPart.value) : now.getFullYear();
                                
                                const solarLunar = require('solarlunar').default;
                                const lunar = solarLunar.solar2lunar(year, month, day);
                                lunarTimeContext = ` (tương đương Ngày ${lunar.lDay} tháng ${lunar.lMonth} năm ${lunar.lYear} Âm lịch)`;
                            } catch (lunarErr) {
                                console.warn('Lỗi tính lịch âm:', lunarErr.message);
                            }

                            const timeContext = `\n- Thời gian hiện tại: ${currentLocalTime} (${dayOfWeek})${lunarTimeContext}. Hãy dựa vào mốc thời gian này để tính toán chính xác giá trị Unix timestamp dạng mili giây cho startTime khi tạo lịch nhắc hẹn (createReminder), hoặc trả lời chính xác ngày âm lịch khi người dùng hỏi.\n`;

                            // --- PHÂN TÍCH BỐI CẢNH GIÁN ĐOẠN ---
                            let interruptionContext = '';
                            if (isInterrupted) {
                                interruptionContext = `\n- Cảnh báo gián đoạn: Thành viên "${senderName}" vừa mới nhắn xen vào cuộc đối thoại đang diễn ra giữa bạn và "${prevSenderName}". Hãy điều chỉnh câu trả lời cho phù hợp với sự thay đổi đối tượng này.\n`;
                            }

                            // --- PHÂN TÍCH MỤC TIÊU NHÓM (GROUP PURPOSE) ---
                            let groupPurposeContext = '';
                            try {
                                const { prisma } = require('./database');
                                const groupSetting = await prisma.groupSetting.findUnique({
                                    where: { groupId }
                                });
                                if (groupSetting && groupSetting.groupPurpose) {
                                    groupPurposeContext = `\n- Mục tiêu/Nhiệm vụ của nhóm chat này: ${groupSetting.groupPurpose}\n`;
                                }
                            } catch (err) {
                                console.error('Lỗi lấy mục tiêu nhóm:', err.message);
                            }

                            let reactionInstructions = '';
                            const aiReactionProbability = aiConfig.aiReactionProbability !== undefined ? parseInt(aiConfig.aiReactionProbability) : 60;
                            if (aiReactionProbability > 0) {
                                reactionInstructions = `\n- HƯỚNG DẪN TƯƠNG TÁC THẢ CẢM XÚC (ADD REACTION) TỰ NHIÊN & KHÔNG MÁY MÓC:
  1. Nếu tin nhắn hiện tại có tính tích cực, vui vẻ (dùng icon cười, đùa giỡn), hữu ích, hoặc bạn đồng ý/hài lòng với quan điểm của "${senderName}" theo tiêu chí/mục tiêu của nhóm chat, hãy sử dụng công cụ \`addReaction\` để tương tác.
  2. Chọn icon cảm xúc phù hợp nhất: 'heart' (yêu thích/đồng tình cao), 'like' (tán thành/OK), 'hahah' (hài hước/vui nhộn), hoặc 'wow' (ngạc nhiên/thú vị).
  3. Để tránh hành xử máy móc rập khuôn như robot, hãy chỉ thả cảm xúc khoảng ${aiReactionProbability}% số lần (không thả liên tục dồn dập). Hãy hành động ngẫu nhiên và tự nhiên như người thật.
  4. Tham số gọi hàm: icon, msgId: "${message.data.msgId || ''}", cliMsgId: "${message.data.cliMsgId || ''}", threadId: "${message.threadId || ''}".
  5. Hãy luôn kết hợp trả lời bằng văn bản trò chuyện thân thiện, tự nhiên, lồng ghép kết quả hành động một cách tinh tế.`;
                            }

                            const dynamicContext = `Bối cảnh hội thoại:\n- Bạn đang hoạt động trong nhóm chat Zalo có tên là "${groupName}" (ID của nhóm này là "${groupId}").\n- Bạn tên là "${botName}" (đây là tài khoản Zalo của bạn).\n- Thành viên kích hoạt bạn hiện tại là "${senderName}".\n- Khi trả lời, hãy BẮT BUỘC xưng hô và gọi đối phương là "${pronoun}" (ví dụ: "Chào ${pronoun}", "${pronoun} cần em giúp gì ạ?"). Nếu đối phương là "anh", "chị", "cô", "chú", "bác", "sếp", bạn hãy tự xưng là "em" để thể hiện sự lễ phép, kính trọng. Ngược lại, nếu đối phương là "bạn", bạn hãy tự xưng là "mình". Phản hồi ngắn gọn, phù hợp với ngữ cảnh Zalo chat nhóm.${timeContext}${interruptionContext}${groupPurposeContext}${memberProfileContext}${sentimentContext}${reactionInstructions}\n\n${knowledgeContext}`;
                            
                            // Tạo cấu hình AI tạm thời tích hợp dynamic context vào prompt hệ thống
                            const tempConfig = {
                                ...aiConfig,
                                aiSystemPrompt: dynamicContext + (aiConfig.aiSystemPrompt || 'Bạn là một trợ lý AI hữu ích trong nhóm chat Zalo.')
                            };

                            let answer = await askAI(conversationHistory[groupId], tempConfig, this.api, message.threadId);
                            
                            if (answer) {
                                console.log(`Bot: Đã nhận phản hồi từ AI. Gửi vào nhóm ${message.threadId}`);
                                
                                // Chia nhỏ tin nhắn gửi đi theo đoạn (\n\n) để mô phỏng cách người thật nhắn tin liên tiếp
                                const paragraphs = answer.split('\n\n').map(p => p.trim()).filter(p => p);
                                for (let i = 0; i < paragraphs.length; i++) {
                                    if (i > 0) {
                                        // Bật lại sự kiện đang gõ chữ trước tin nhắn kế tiếp
                                        if (this.api && !this.isSimulation) {
                                            try {
                                                await this.api.sendTypingEvent(message.threadId, 1);
                                            } catch (_) {}
                                        }
                                        // Trễ gõ chữ mô phỏng tốc độ gõ của con người (20ms/ký tự, tối thiểu 1.5s, tối đa 4s)
                                        const delay = Math.min(4000, Math.max(1500, paragraphs[i].length * 20));
                                        await new Promise(resolve => setTimeout(resolve, delay));
                                    }
                                    await this.sendMessage(message.threadId, paragraphs[i], 1);
                                }

                                // Phân tích cuộc hội thoại ngầm để cập nhật bộ nhớ AI (truyền thêm avatarUrl để lưu trữ)
                                const currentSenderId = String(message.data.uidFrom);
                                const aiAnalysisQueue = require('./ai-queue');
                                aiAnalysisQueue.debounce(groupId, currentSenderId, 'memory', senderName, message, async (messagesSegment) => {
                                    await analyzeAndSaveMemory(groupId, currentSenderId, senderName, conversationHistory[groupId], aiConfig, avatarUrl);
                                });

                                return; // Dừng xử lý tiếp (không chạy Auto-reply bằng quy tắc từ khóa)
                            }
                        } finally {
                            if (typingInterval) {
                                clearInterval(typingInterval);
                                console.log(`[Typing Event] Đã tắt trạng thái đang gõ chữ cho nhóm ${groupId}`);
                            }

                    }
                }
            }
        }
        } catch (aiErr) {
            console.error('Lỗi kiểm tra hoặc chạy Trợ lý AI:', aiErr.message);
        }

        const { rulesDb } = require('./database');
        const activeRules = await rulesDb.find({ active: true });

        for (const rule of activeRules) {
            let isMatched = false;
            
            if (rule.matchType === 'contains') {
                isMatched = rule.keywords.some(kw => text.includes(kw));
            } else if (rule.matchType === 'exact') {
                isMatched = rule.keywords.some(kw => text === kw);
            } else if (rule.matchType === 'regex') {
                isMatched = rule.keywords.some(kw => new RegExp(kw).test(text));
            }

            if (isMatched) {
                console.log(`Bot: Từ khóa trùng khớp. Tự động trả lời nhóm ${message.threadId}`);
                
                if (this.api && !this.isSimulation) {
                    try {
                        await this.api.sendTypingEvent(message.threadId, ThreadType.Group);
                    } catch (err) {
                        console.warn('[Typing Event Error] Lỗi gửi sự kiện gõ chữ cho rules:', err.message);
                    }
                }
                
                // Trễ ngẫu nhiên 1-3 giây để giống người thật
                setTimeout(async () => {
                    try {
                        await this.sendMessage(message.threadId, rule.reply, ThreadType.Group);
                        console.log('Bot: Đã gửi câu trả lời tự động.');
                    } catch (err) {
                        console.error('Lỗi khi bot tự động trả lời:', err.message);
                    }
                }, Math.floor(Math.random() * 2000) + 1000);
                
                break; // Dừng lại ở quy tắc khớp đầu tiên
            }
        }
    }

    // Đồng bộ danh sách nhóm chat thực tế
    async getGroups() {
        if (this.isSimulation) {
            return null; // Frontend sẽ tự động sinh dữ liệu mock
        }
        
        if (!this.isLoggedIn || !this.api) {
            return null;
        }

        try {
            const allGroupsRes = await this.api.getAllGroups();
            if (!allGroupsRes || !allGroupsRes.gridVerMap) {
                return [];
            }
            const groupIds = Object.keys(allGroupsRes.gridVerMap);
            if (groupIds.length === 0) {
                return [];
            }
            
            // Gọi getGroupInfo theo từng cụm (tối đa 50 nhóm mỗi lần gọi để tránh lỗi "Tham số không hợp lệ")
            const gridInfoMap = {};
            const chunkSize = 50;
            for (let i = 0; i < groupIds.length; i += chunkSize) {
                const chunk = groupIds.slice(i, i + chunkSize);
                const groupInfoRes = await this.api.getGroupInfo(chunk);
                if (groupInfoRes && groupInfoRes.gridInfoMap) {
                    Object.assign(gridInfoMap, groupInfoRes.gridInfoMap);
                }
            }
            
            const ownId = this.api.getOwnId();
            const groupsList = Object.values(gridInfoMap).map(g => ({
                id: g.groupId,
                name: g.name,
                members: g.totalMember || g.memberIds?.length || 0,
                avatar: g.avt || 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=100&q=80',
                role: g.creatorId === ownId ? 'owner' : (g.adminIds?.includes(ownId) ? 'admin' : 'member')
            }));
            
            return groupsList;
        } catch (error) {
            console.error('Lỗi đồng bộ danh sách nhóm:', error.message);
            return null;
        }
    }
}

ZaloClientWrapper.memberNameCache = memberNameCache;
ZaloClientWrapper.askAI = askAI;
module.exports = ZaloClientWrapper;
