const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

const { sessionsDb, rulesDb, campaignsDb, knowledgeDb, aiSettingsDb, callsDb } = require('./database');
const ZaloClientWrapper = require('./zalo-client');
const messageQueue = require('./queue');
const { syncDocument, startAutoSyncJob } = require('./document-sync');
const { handleVirtualCallSockets } = require('./call-controller');
const logger = require('./logger');


dotenv.config();

const app = express();
const server = http.createServer(app);

// Cấu hình CORS để cho phép Frontend gọi chéo cổng
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
global.io = io;

app.use(cors());
app.use(express.json());
app.use(express.static(require('path').join(__dirname, '../')));

const PORT = process.env.PORT || 3000;
const activeClients = {}; // Lưu trữ danh sách client đang hoạt động

// In-memory message store: thu thập tin nhắn realtime từ listener
// Cấu trúc: { [groupId]: [ { id, senderId, content, timestamp, isSelf, msgType } ] }
// Dùng làm fallback khi API getGroupChatHistory của zca-js trả về rỗng (known limitation)
const realtimeMessageStore = {};
const MESSAGES_FILE = path.join(__dirname, 'data', 'messages.json');

// Nạp lịch sử chat đã lưu trữ từ file (nếu có)
try {
    if (fs.existsSync(MESSAGES_FILE)) {
        const storedData = fs.readFileSync(MESSAGES_FILE, 'utf8');
        Object.assign(realtimeMessageStore, JSON.parse(storedData));
        console.log(`Server: Đã phục hồi ${Object.keys(realtimeMessageStore).length} nhóm chat từ tệp messages.json.`);
    }
} catch (err) {
    console.error('Lỗi khi khôi phục lịch sử chat từ file:', err.message);
}

// Lưu lịch sử chat ra file (debounce 3 giây để tránh ghi I/O liên tục mỗi tin nhắn)
let _saveMessageStoreTimer = null;
function saveRealtimeMessageStore() {
    if (_saveMessageStoreTimer) clearTimeout(_saveMessageStoreTimer);
    _saveMessageStoreTimer = setTimeout(() => {
        try {
            fs.writeFileSync(MESSAGES_FILE, JSON.stringify(realtimeMessageStore, null, 2), 'utf8');
        } catch (err) {
            console.error('Lỗi khi lưu lịch sử chat vào file:', err.message);
        }
    }, 3000);
}

// Lưu tin nhắn và tự động phân loại/map thành viên vào SQLite
async function saveMessageToDb(groupId, msgObj) {
    try {
        const { prisma } = require('./database');
        // Xác định isSelf dựa trên thuộc tính message thay vì hardcode ID cố định
        const isSelf = msgObj.isSelf === true;
        
        let sName = msgObj.senderName || 'Thành viên';
        if (!isSelf && msgObj.senderId) {
            const rawContent = typeof msgObj.content === 'string' ? msgObj.content : '';
            
            // Trích xuất tên nếu chứa tiền tố "Tên: "
            const match = rawContent.match(/^([^:]+):\s*(.*)$/);
            if (match && match[1] && match[1].length < 30) {
                sName = match[1].trim();
            } else {
                sName = `Thành viên ${String(msgObj.senderId).substring(0, 6)}`;
            }

            // Upsert thành viên
            const memberId = `${groupId}-${msgObj.senderId}`;
            await prisma.member.upsert({
                where: { id: memberId },
                update: {}, // Không thay đổi nếu đã tồn tại để tránh đè ghi chú/sđt
                create: {
                    id: memberId,
                    groupId: groupId,
                    zaloId: msgObj.senderId,
                    name: sName,
                    vipStatus: 'normal'
                }
            });
        } else if (isSelf) {
            sName = 'Trợ lý AI';
        }

        // Định dạng nội dung tin nhắn
        let txtContent = '';
        if (typeof msgObj.content === 'object' && msgObj.content !== null) {
            txtContent = JSON.stringify(msgObj.content);
        } else {
            txtContent = String(msgObj.content || '');
        }

        // Lưu tin nhắn
        await prisma.message.upsert({
            where: { id: msgObj.id },
            update: {},
            create: {
                id: msgObj.id,
                groupId: groupId,
                senderId: String(msgObj.senderId || 'unknown'),
                senderName: sName,
                content: txtContent,
                msgType: msgObj.msgType || 'chat.text',
                isSelf: isSelf,
                timestamp: BigInt(msgObj.timestamp || Date.now())
            }
        });
    } catch (dbErr) {
        console.error('Lỗi khi lưu tin nhắn và thành viên vào SQLite:', dbErr.message);
    }
}

// Liên kết IO và Active Clients sang Message Queue
messageQueue.setIo(io);
messageQueue.setActiveClients(activeClients);

// Helper xử lý khi tài khoản đăng nhập/kết nối thành công
async function handleLoginSuccess(userData, sessionName, client) {
    let groupsCount = 0;
    try {
        const groups = await client.getGroups();
        if (groups) groupsCount = groups.length;
    } catch (err) {
        console.error("Lỗi khi lấy số lượng nhóm:", err.message);
    }

    const accountRecord = {
        id: userData.id,
        name: userData.name,
        phone: userData.phone,
        avatar: userData.avatar,
        sessionFile: sessionName,
        groupsCount: groupsCount,
        msgsSent: userData.msgsSent || 0,
        createdAt: new Date()
    };
    await sessionsDb.update({ phone: userData.phone }, accountRecord, { upsert: true });
    
    // Thông báo đăng nhập thành công qua Socket.io
    io.emit('login.success', userData);
    messageQueue.notify(`Tài khoản Zalo ${userData.name} (${userData.phone}) đã kết nối và đồng bộ thành công!`, 'success');
}

// -------------------------------------------------------------
// 1. REST API ENDPOINTS
// -------------------------------------------------------------

// Kiểm tra ping kết nối
app.get('/api/ping', (req, res) => {
    res.json({ status: 'ok', time: new Date() });
});

// Lấy danh sách tài khoản Zalo đã lưu session
app.get('/api/accounts', async (req, res) => {
    try {
        const storedSessions = await sessionsDb.find({});
        // Map với trạng thái hoạt động thực tế
        const accountsList = storedSessions.map(session => {
            const client = activeClients[session.id];
            return {
                id: session.id,
                name: session.name,
                phone: session.phone,
                status: (client && client.isLoggedIn) ? 'online' : 'offline',
                avatar: session.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80',
                groupsCount: session.groupsCount || 0,
                msgsSent: session.msgsSent || 0
            };
        });
        res.json({ success: true, data: accountsList });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Thêm tài khoản mới (Khởi chạy tiến trình sinh QR code)
app.post('/api/accounts/add', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ success: false, error: 'Thiếu số điện thoại' });
    }

    const accountId = 'acc-' + Date.now();
    const sessionName = `session_${phone.replace(/\s+/g, '')}.json`;

    console.log(`Server: Khởi tạo tiến trình đăng nhập cho SĐT ${phone}...`);
    
    const client = new ZaloClientWrapper(accountId, phone, sessionName);
    activeClients[accountId] = client;

    // Chạy login bất đồng bộ và trả về kết quả ngay cho frontend, 
    // QR code và kết quả login sẽ được đẩy qua Socket.io
    client.initialize(
        // QR Code callback
        (qrBase64) => {
            io.emit('qr.code', { accountId, phone, qrBase64 });
        },
        // Login thành công callback
        async (userData) => {
            await handleLoginSuccess(userData, sessionName, client);
        },
        (message) => {
            if (!message || !message.data) return;
            const msgObj = {
                id: message.data.msgId || ('msg-' + Date.now()),
                senderId: message.data.uidFrom || '',
                content: message.data.content || '',
                timestamp: message.data.ts ? parseInt(message.data.ts) : Date.now(),
                isSelf: !!message.isSelf,
                msgType: message.data.msgType || 'chat.text'
            };
            io.emit('zalo.message', {
                accountId: client.accountId,
                groupId: message.threadId,
                message: msgObj
            });
            // Lưu vào realtimeMessageStore để phục vụ lịch sử chat (fallback)
            const gid = message.threadId;
            if (gid) {
                if (!realtimeMessageStore[gid]) realtimeMessageStore[gid] = [];
                realtimeMessageStore[gid].push(msgObj);
                // Giới hạn tối đa 200 tin nhắn mỗi nhóm
                if (realtimeMessageStore[gid].length > 200) {
                    realtimeMessageStore[gid] = realtimeMessageStore[gid].slice(-200);
                }
                saveRealtimeMessageStore();
                saveMessageToDb(gid, msgObj);
            }
        }
    ).catch(err => {
        console.error('Lỗi khởi tạo tài khoản Zalo:', err.message);
        io.emit('login.error', { accountId, error: err.message });
    });

    res.json({ success: true, message: 'Đang tạo phiên kết nối QR code...', accountId });
});

// Gỡ tài khoản và xóa session
app.post('/api/accounts/remove', async (req, res) => {
    const { accountId } = req.body;
    try {
        const session = await sessionsDb.findOne({ id: accountId });
        if (session) {
            await sessionsDb.remove({ id: accountId });
            // Nếu client đang online, đóng kết nối
            if (activeClients[accountId]) {
                if (activeClients[accountId].client) {
                    await activeClients[accountId].client.destroy();
                }
                delete activeClients[accountId];
            }
            messageQueue.notify(`Đã xóa và gỡ bỏ tài khoản Zalo: ${session.name}`, 'warn');
            res.json({ success: true, message: 'Đã gỡ tài khoản thành công.' });
        } else {
            res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lấy danh sách nhóm chat (Real-time từ API nếu online, hoặc mock nếu offline)
app.get('/api/groups', async (req, res) => {
    const { accountId } = req.query;
    try {
        let client = activeClients[accountId];
        if (!client) {
            const fallbackId = Object.keys(activeClients).find(id => activeClients[id] && activeClients[id].isLoggedIn);
            if (fallbackId) {
                client = activeClients[fallbackId];
                console.log(`[Groups API Fallback] Không tìm thấy accountId=${accountId}. Fallback sang tài khoản hoạt động: ${fallbackId}`);
            }
        }
        if (client && client.isLoggedIn && !client.isSimulation) {
            // Lấy danh sách nhóm thực tế qua Zalo SDK
            const realGroups = await client.getGroups();
            if (realGroups) {
                // Đọc cài đặt nhóm nâng cao từ database cục bộ
                const { groupSettingsDb } = require('./database');
                const savedSettings = await groupSettingsDb.find({ groupId: { $in: realGroups.map(g => g.id) } });
                const settingsMap = {};
                savedSettings.forEach(s => {
                    settingsMap[s.groupId] = s;
                });

                const mergedGroups = realGroups.map(g => {
                    const setting = settingsMap[g.id] || {
                        lockName: false,
                        lockDesc: false,
                        approveMembers: false,
                        allowLink: true,
                        groupPurpose: '',
                        hostGroupId: ''
                    };
                    return {
                        ...g,
                        lockName: setting.lockName,
                        lockDesc: setting.lockDesc,
                        approveMembers: setting.approveMembers,
                        allowLink: setting.allowLink,
                        groupPurpose: setting.groupPurpose || '',
                        hostGroupId: setting.hostGroupId || ''
                    };
                });

                // Cập nhật số lượng nhóm trong database
                await sessionsDb.update({ id: accountId }, { $set: { groupsCount: mergedGroups.length } });
                return res.json({ success: true, source: 'live', data: mergedGroups });
            }
        }
        res.json({ success: true, source: 'simulation', data: [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lấy danh sách thành viên chờ duyệt của nhóm
app.get('/api/groups/pending', async (req, res) => {
    const { accountId, groupId } = req.query;
    try {
        const client = activeClients[accountId];
        if (client && client.isLoggedIn && !client.isSimulation) {
            // Gọi API lấy thành viên chờ duyệt
            const response = await client.api.getPendingGroupMembers(groupId);
            if (response && response.users) {
                const normalizedUsers = response.users.map(u => ({
                    id: u.uid || u.userId || u.id,
                    name: u.displayName || u.name || u.zaloName || 'Người dùng Zalo',
                    avatar: u.avatar || u.avt || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&q=80',
                    phone: u.phoneNumber || u.phone || '',
                    reason: u.reason || 'Yêu cầu tham gia nhóm',
                    time: u.time ? new Date(u.time).toLocaleString('vi-VN') : 'Vừa xong'
                }));
                return res.json({ success: true, data: normalizedUsers });
            }
            return res.json({ success: true, data: [] });
        }
        res.json({ success: true, data: [] });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách thành viên chờ duyệt:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Duyệt hoặc từ chối thành viên chờ duyệt
app.post('/api/groups/pending/review', async (req, res) => {
    const { accountId, groupId, userIds, isApprove } = req.body;
    try {
        const client = activeClients[accountId];
        if (!client || !client.isLoggedIn || client.isSimulation) {
            return res.status(400).json({ success: false, error: 'Tài khoản Zalo không online hoặc chưa kết nối.' });
        }
        
        // Gọi API xử lý duyệt/từ chối
        const payload = {
            members: userIds,
            isApprove: !!isApprove
        };
        await client.api.reviewPendingMemberRequest(payload, groupId);
        res.json({ success: true, message: isApprove ? 'Đã duyệt thành viên thành công' : 'Đã từ chối thành viên thành công' });
    } catch (error) {
        console.error('Lỗi khi xử lý phê duyệt thành viên:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lấy danh sách thành viên thực tế của nhóm (Real-time qua Zalo API, đồng bộ SQLite)
app.get('/api/groups/members', async (req, res) => {
    const { accountId, groupId } = req.query;
    try {
        const { prisma } = require('./database');
        const client = activeClients[accountId];
        
        if (client && client.isLoggedIn && !client.isSimulation) {
            // Lấy groupInfo để biết creatorId, adminIds và danh sách thành viên (memVerList)
            const groupInfoRes = await client.api.getGroupInfo([groupId]);
            if (groupInfoRes && groupInfoRes.gridInfoMap && groupInfoRes.gridInfoMap[groupId]) {
                const group = groupInfoRes.gridInfoMap[groupId];
                const memVerList = group.memVerList || [];
                
                if (memVerList.length > 0) {
                    const membersInfoRes = await client.api.getGroupMembersInfo(memVerList);
                    if (membersInfoRes && membersInfoRes.profiles) {
                        const creatorId = group.creatorId;
                        const adminIds = group.adminIds || [];
                        
                        const members = await Promise.all(Object.values(membersInfoRes.profiles).map(async p => {
                            let role = 'member';
                            if (p.id === creatorId) {
                                role = 'creator';
                            } else if (adminIds.includes(p.id)) {
                                role = 'admin';
                            }
                            
                            const memberId = `${groupId}-${p.id}`;
                            const name = p.displayName || p.zaloName || 'Người dùng Zalo';
                            
                            // Lấy hoặc khởi tạo thành viên trong SQLite
                            let dbMember = await prisma.member.findUnique({
                                where: { id: memberId },
                                include: { _count: { select: { memories: true } } }
                            });
                            
                            if (!dbMember) {
                                dbMember = await prisma.member.create({
                                    data: {
                                        id: memberId,
                                        groupId: groupId,
                                        zaloId: p.id,
                                        name: name,
                                        avatar: p.avatar || null,
                                        vipStatus: 'normal'
                                    }
                                });
                                // Tạo mốc lịch sử cảm xúc đầu tiên
                                await prisma.memberSentiment.create({
                                    data: {
                                        groupId: groupId,
                                        zaloId: p.id,
                                        sentiment: 'Bình thường'
                                    }
                                });
                                dbMember.memoriesCount = 0;
                            } else {
                                // Cập nhật tên hoặc avatar nếu có sự thay đổi
                                if (dbMember.name !== name || dbMember.avatar !== p.avatar) {
                                    dbMember = await prisma.member.update({
                                        where: { id: memberId },
                                        data: {
                                            name: name,
                                            avatar: p.avatar || null
                                        },
                                        include: { _count: { select: { memories: true } } }
                                    });
                                }
                                dbMember.memoriesCount = dbMember._count ? dbMember._count.memories : 0;
                            }
                            
                            return {
                                id: p.id,
                                name: name,
                                avatar: p.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80',
                                role: role,
                                phone: dbMember.phone || '',
                                vipStatus: dbMember.vipStatus || 'normal',
                                notes: dbMember.notes || '',
                                xungHo: dbMember.xungHo || '',
                                lastSentiment: dbMember.lastSentiment || 'Bình thường',
                                memoriesCount: dbMember.memoriesCount
                            };
                        }));
                        return res.json({ success: true, data: members });
                    }
                }
            }
            return res.json({ success: true, data: [] });
        } else {
            // Chế độ giả lập (Simulation mode) - lấy thành viên được map trong SQLite
            const dbMembers = await prisma.member.findMany({
                where: { groupId },
                include: { _count: { select: { memories: true } } }
            });
            
            const clientMembers = dbMembers.map(m => ({
                id: m.zaloId,
                name: m.name,
                avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80',
                role: 'member',
                phone: m.phone || '',
                vipStatus: m.vipStatus || 'normal',
                notes: m.notes || '',
                xungHo: m.xungHo || '',
                lastSentiment: m.lastSentiment || 'Bình thường',
                memoriesCount: m._count ? m._count.memories : 0
            }));
            
            return res.json({ success: true, data: clientMembers });
        }
    } catch (error) {
        console.error('Lỗi khi lấy danh sách thành viên nhóm:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lấy lịch sử 50 tin nhắn chat gần đây nhất của nhóm (có hỗ trợ SQLite fallback)
app.get('/api/groups/history', async (req, res) => {
    const { accountId, groupId } = req.query;
    if (!accountId || !groupId || groupId === 'undefined') {
        return res.json({ success: true, data: [] });
    }
    try {
        const { prisma } = require('./database');
        const client = activeClients[accountId];
        let msgs = [];
        
        if (client && client.isLoggedIn && !client.isSimulation) {
            // Thử lấy lịch sử từ Zalo API trước
            try {
                const history = await client.api.getGroupChatHistory(groupId, 50);
                if (history && history.groupMsgs && history.groupMsgs.length > 0) {
                    msgs = history.groupMsgs.map(m => {
                        const data = m.data || {};
                        return {
                            id: data.msgId || ('msg-' + Date.now()),
                            senderId: data.uidFrom || '',
                            content: data.content || '',
                            timestamp: data.ts ? parseInt(data.ts) : Date.now(),
                            isSelf: !!m.isSelf,
                            msgType: data.msgType || 'chat.text'
                        };
                    });
                }
            } catch (apiErr) {
                console.warn('Lỗi khi gọi getGroupChatHistory API:', apiErr.message);
            }
        }

        // Fallback hoặc Chế độ giả lập: Sử dụng SQLite
        if (msgs.length === 0) {
            const dbMsgs = await prisma.message.findMany({
                where: { groupId },
                orderBy: { timestamp: 'desc' },
                take: 50
            });
            
            msgs = dbMsgs.map(m => {
                let contentParsed;
                try {
                    contentParsed = JSON.parse(m.content);
                } catch (e) {
                    contentParsed = m.content;
                }
                return {
                    id: m.id,
                    senderId: m.senderId,
                    senderName: m.senderName,
                    content: contentParsed,
                    timestamp: Number(m.timestamp),
                    isSelf: m.isSelf,
                    msgType: m.msgType
                };
            });
        } else {
            // Đồng bộ ngược các tin nhắn mới từ API vào SQLite
            for (const m of msgs) {
                await saveMessageToDb(groupId, m);
            }
        }

        return res.json({ success: true, data: msgs });
    } catch (error) {
        console.error('Lỗi khi lấy lịch sử chat nhóm:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Gửi tin nhắn thực tế của bot vào nhóm chat (Live Mode)
app.post('/api/groups/message/send', async (req, res) => {
    const { accountId, groupId, content } = req.body;
    try {
        const client = activeClients[accountId];
        if (!client) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản.' });
        }

        if (!client.isSimulation && (!client.isLoggedIn || !client.api)) {
            return res.status(400).json({ success: false, error: 'Tài khoản chưa được kết nối.' });
        }

        await client.sendMessage(groupId, content, 1);

        res.json({ success: true, message: client.isSimulation ? 'Đã gửi tin nhắn giả lập thành công.' : 'Đã gửi tin nhắn Zalo thành công.' });
    } catch (error) {
        console.error('Lỗi khi gửi tin nhắn Zalo:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Giả lập tin nhắn của một thành viên nhóm chat để kiểm thử Bot
app.post('/api/groups/message/simulate', async (req, res) => {
    const { accountId, groupId, senderName, senderId, content } = req.body;
    try {
        let client = activeClients[accountId];
        if (!client) {
            const fallbackId = Object.keys(activeClients).find(id => activeClients[id] && activeClients[id].isLoggedIn);
            if (fallbackId) {
                client = activeClients[fallbackId];
                console.log(`[Simulate API Fallback] Không tìm thấy accountId=${accountId}. Fallback sang tài khoản hoạt động: ${fallbackId}`);
            }
        }
        if (!client) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản.' });
        }

        const actualSenderId = senderId || 'user-sim-' + Math.floor(Math.random() * 100000);
        const actualSenderName = senderName || 'Thành viên Test';

        const ownId = client.api ? client.api.getOwnId() : 'bot-sim-own-id';
        const isMentioned = content.toLowerCase().includes('@bot') || content.toLowerCase().includes(String(client.name || 'trợ lý').toLowerCase());
        
        const mockMessage = {
            type: 1, // ThreadType.Group
            threadId: groupId,
            isSelf: false,
            data: {
                uidFrom: actualSenderId,
                msgId: 'msg-sim-' + Date.now(),
                cliMsgId: 'cli-sim-' + Date.now(),
                msgType: 'chat.text',
                content: content,
                ts: String(Date.now()),
                mentions: isMentioned ? [{ uid: ownId }] : [],
                quote: req.body.quote || undefined
            }
        };

        // Cache tên người gửi để zalo-client hiển thị đúng tên người gửi
        ZaloClientWrapper.memberNameCache[actualSenderId] = actualSenderName;

        // Phát sự kiện để UI cập nhật tin nhắn giả lập từ thành viên
        const msgObj = {
            id: mockMessage.data.msgId,
            senderId: mockMessage.data.uidFrom,
            content: mockMessage.data.content,
            timestamp: Date.now(),
            isSelf: false,
            msgType: 'chat.text'
        };
        io.emit('zalo.message', {
            accountId: client.accountId,
            groupId: groupId,
            message: msgObj
        });

        // Lưu vào realtimeMessageStore để phục vụ lịch sử chat (fallback)
        if (!realtimeMessageStore[groupId]) realtimeMessageStore[groupId] = [];
        realtimeMessageStore[groupId].push(msgObj);
        if (realtimeMessageStore[groupId].length > 200) {
            realtimeMessageStore[groupId] = realtimeMessageStore[groupId].slice(-200);
        }
        saveRealtimeMessageStore();
        saveMessageToDb(groupId, msgObj);

        // Kích hoạt xử lý tin nhắn bot
        client.handleIncomingMessage(mockMessage).catch(err => {
            console.error('Lỗi xử lý tin nhắn giả lập:', err.message);
        });

        res.json({ success: true, message: 'Đã giả lập tin nhắn đến thành công.' });
    } catch (error) {
        console.error('Lỗi khi giả lập tin nhắn Zalo:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cập nhật cấu hình bảo mật nhóm (Đồng bộ Zalo API & Database cục bộ)
app.post('/api/groups/settings', async (req, res) => {
    const { accountId, groupId, settings } = req.body;
    try {
        const client = activeClients[accountId];
        if (!client || !client.isLoggedIn || client.isSimulation) {
            return res.status(400).json({ success: false, error: 'Tài khoản Zalo không online hoặc chưa kết nối.' });
        }

        // 1. Cập nhật trên Zalo thật thông qua Zalo API
        try {
            await client.api.updateGroupSettings({
                blockName: settings.lockName ? 1 : 0,
                setTopicOnly: settings.lockDesc ? 1 : 0,
                joinAppr: settings.approveMembers ? 1 : 0
            }, groupId);
        } catch (zaloErr) {
            console.warn('Cảnh báo: Không thể cập nhật cài đặt trên máy chủ Zalo (do không phải Admin/Owner):', zaloErr.message);
        }

        // 2. Lưu cấu hình nâng cao vào database cục bộ
        const { groupSettingsDb } = require('./database');
        await groupSettingsDb.update(
            { groupId },
            {
                groupId,
                lockName: !!settings.lockName,
                lockDesc: !!settings.lockDesc,
                approveMembers: !!settings.approveMembers,
                allowLink: !!settings.allowLink,
                groupPurpose: settings.groupPurpose || '',
                hostGroupId: settings.hostGroupId || '',
                updatedAt: new Date()
            },
            { upsert: true }
        );

        res.json({ success: true, message: 'Đã cập nhật cấu hình nhóm thành công.' });
    } catch (error) {
        console.error('Lỗi khi cập nhật cấu hình nhóm:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Thao tác với thành viên nhóm (Thăng chức, Hạ chức, Trục xuất, Chặn, Bỏ chặn)
app.post('/api/groups/members/action', async (req, res) => {
    const { accountId, groupId, memberId, action } = req.body;
    try {
        const client = activeClients[accountId];
        if (!client || !client.isLoggedIn || client.isSimulation) {
            return res.status(400).json({ success: false, error: 'Tài khoản Zalo không online hoặc chưa kết nối.' });
        }

        let message = '';
        if (action === 'promote') {
            await client.api.addGroupDeputy(memberId, groupId);
            message = 'Đã thăng chức phó nhóm thành công.';
        } else if (action === 'demote') {
            await client.api.removeGroupDeputy(memberId, groupId);
            message = 'Đã hạ chức thành viên thành công.';
        } else if (action === 'kick') {
            await client.api.removeUserFromGroup(memberId, groupId);
            message = 'Đã trục xuất thành viên thành công.';
        } else if (action === 'ban') {
            await client.api.addGroupBlockedMember(memberId, groupId);
            message = 'Đã chặn thành viên thành công.';
        } else if (action === 'unban') {
            await client.api.removeGroupBlockedMember(memberId, groupId);
            message = 'Đã bỏ chặn thành viên thành công.';
        } else {
            return res.status(400).json({ success: false, error: 'Hành động không hợp lệ.' });
        }

        res.json({ success: true, message });
    } catch (error) {
        console.error(`Lỗi khi thực hiện hành động ${action} trên thành viên:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rời khỏi nhóm chat Zalo
app.post('/api/groups/leave', async (req, res) => {
    const { accountId, groupId } = req.body;
    try {
        const client = activeClients[accountId];
        if (!client || !client.isLoggedIn || client.isSimulation) {
            return res.status(400).json({ success: false, error: 'Tài khoản Zalo không online hoặc chưa kết nối.' });
        }

        await client.api.leaveGroup(groupId);
        res.json({ success: true, message: 'Đã rời nhóm thành công.' });
    } catch (error) {
        console.error('Lỗi khi rời nhóm:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lấy link tham gia nhóm chi tiết (trạng thái và url link)
app.get('/api/groups/link', async (req, res) => {
    const { accountId, groupId } = req.query;
    try {
        const client = activeClients[accountId];
        if (client && client.isLoggedIn && !client.isSimulation) {
            const linkDetail = await client.api.getGroupLinkDetail(groupId);
            return res.json({ success: true, data: linkDetail });
        }
        res.json({ success: true, data: { enabled: 0 } });
    } catch (error) {
        console.error('Lỗi lấy link nhóm:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Bật hoặc tắt link tham gia nhóm
app.post('/api/groups/link/toggle', async (req, res) => {
    const { accountId, groupId, enable } = req.body;
    try {
        const client = activeClients[accountId];
        if (!client || !client.isLoggedIn || client.isSimulation) {
            return res.status(400).json({ success: false, error: 'Tài khoản không online hoặc chưa kết nối.' });
        }
        if (enable) {
            const result = await client.api.enableGroupLink(groupId);
            res.json({ success: true, data: result });
        } else {
            const result = await client.api.disableGroupLink(groupId);
            res.json({ success: true, data: result });
        }
    } catch (error) {
        console.error('Lỗi bật/tắt link nhóm:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Đổi tên nhóm chat
app.post('/api/groups/update-name', async (req, res) => {
    const { accountId, groupId, name } = req.body;
    try {
        const client = activeClients[accountId];
        if (!client || !client.isLoggedIn || client.isSimulation) {
            return res.status(400).json({ success: false, error: 'Tài khoản không online hoặc chưa kết nối.' });
        }
        await client.api.changeGroupName(name, groupId);
        res.json({ success: true, message: 'Đổi tên nhóm thành công.' });
    } catch (error) {
        console.error('Lỗi đổi tên nhóm:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Chuyển nhượng quyền Trưởng nhóm
app.post('/api/groups/change-owner', async (req, res) => {
    const { accountId, groupId, newOwnerId } = req.body;
    try {
        const client = activeClients[accountId];
        if (!client || !client.isLoggedIn || client.isSimulation) {
            return res.status(400).json({ success: false, error: 'Tài khoản không online hoặc chưa kết nối.' });
        }
        await client.api.changeGroupOwner(newOwnerId, groupId);
        res.json({ success: true, message: 'Chuyển quyền Trưởng nhóm thành công.' });
    } catch (error) {
        console.error('Lỗi chuyển quyền Trưởng nhóm:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Giải tán nhóm chat vĩnh viễn
app.post('/api/groups/disperse', async (req, res) => {
    const { accountId, groupId } = req.body;
    try {
        const client = activeClients[accountId];
        if (!client || !client.isLoggedIn || client.isSimulation) {
            return res.status(400).json({ success: false, error: 'Tài khoản không online hoặc chưa kết nối.' });
        }
        await client.api.disperseGroup(groupId);
        res.json({ success: true, message: 'Giải tán nhóm thành công.' });
    } catch (error) {
        console.error('Lỗi giải tán nhóm:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Tìm kiếm tài khoản Zalo theo số điện thoại
app.get('/api/users/find', async (req, res) => {
    const { accountId, phone } = req.query;
    try {
        const client = activeClients[accountId];
        if (client && client.isLoggedIn && !client.isSimulation) {
            const user = await client.api.findUser(phone);
            if (user && user.uid) {
                return res.json({
                    success: true,
                    data: {
                        id: user.uid,
                        name: user.display_name || user.zalo_name || 'Người dùng Zalo',
                        avatar: user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80'
                    }
                });
            }
        }
        res.json({ success: false, error: 'Không tìm thấy người dùng Zalo với số điện thoại này hoặc tài khoản chặn tìm kiếm.' });
    } catch (error) {
        console.error('Lỗi tìm kiếm người dùng:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Thêm trực tiếp người dùng vào nhóm
app.post('/api/groups/members/add', async (req, res) => {
    const { accountId, groupId, userId } = req.body;
    try {
        const client = activeClients[accountId];
        if (!client || !client.isLoggedIn || client.isSimulation) {
            return res.status(400).json({ success: false, error: 'Tài khoản không online hoặc chưa kết nối.' });
        }
        await client.api.addUserToGroup(userId, groupId);
        res.json({ success: true, message: 'Thêm thành viên vào nhóm thành công.' });
    } catch (error) {
        console.error('Lỗi thêm thành viên vào nhóm:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lấy danh sách ghi chú ghim (Note) và bình chọn (Poll) của nhóm
app.get('/api/groups/board', async (req, res) => {
    const { accountId, groupId } = req.query;
    try {
        const client = activeClients[accountId];
        if (client && client.isLoggedIn && !client.isSimulation) {
            const board = await client.api.getListBoard({ page: 1, count: 20 }, groupId);
            if (board && board.items) {
                const items = board.items.map(item => ({
                    id: item.id || item.topicId,
                    type: item.boardType, // 0 = Note, 1 = Poll, v.v.
                    title: item.data?.params?.title || item.data?.title || 'Không có tiêu đề',
                    creatorName: item.data?.creatorName || 'Admin',
                    createTime: item.data?.createTime ? new Date(parseInt(item.data.createTime)).toLocaleString('vi-VN') : 'Đã đăng',
                    isPinned: !!item.pinAct
                }));
                return res.json({ success: true, data: items });
            }
            return res.json({ success: true, data: [] });
        }
        res.json({ success: true, data: [] });
    } catch (error) {
        console.error('Lỗi lấy bảng tin nhóm:', error.message);
        res.status(500).json({ success: false, data: [], error: error.message });
    }
});

// Lấy danh sách nhắc hẹn (Reminder) của nhóm
app.get('/api/groups/reminders', async (req, res) => {
    const { accountId, groupId } = req.query;
    try {
        const client = activeClients[accountId];
        if (client && client.isLoggedIn && !client.isSimulation) {
            try {
                const reminders = await client.api.getListReminder({ page: 1, count: 20 }, groupId, 1);
                if (reminders && reminders.reminders) {
                    const items = reminders.reminders.map(rem => ({
                        id: rem.reminderId,
                        title: rem.title || 'Không có tiêu đề',
                        startTime: rem.startTime, // timestamp
                        creatorId: rem.creatorId,
                        repeat: rem.repeat
                    }));
                    return res.json({ success: true, data: items });
                }
            } catch (err) {
                // Trả về mảng rỗng nếu không có nhắc hẹn nào
                return res.json({ success: true, data: [] });
            }
        }
        res.json({ success: true, data: [] });
    } catch (error) {
        console.error('Lỗi lấy nhắc hẹn nhóm:', error.message);
        res.status(500).json({ success: false, data: [], error: error.message });
    }
});

// Đăng ghi chú ghim (Note) mới trong nhóm
app.post('/api/groups/board/note', async (req, res) => {
    const { accountId, groupId, title } = req.body;
    try {
        const client = activeClients[accountId];
        if (!client || !client.isLoggedIn || client.isSimulation) {
            return res.status(400).json({ success: false, error: 'Tài khoản không online hoặc chưa kết nối.' });
        }
        await client.api.createNote({ title, pinAct: true }, groupId);
        res.json({ success: true, message: 'Đăng ghi chú ghim thành công.' });
    } catch (error) {
        console.error('Lỗi tạo ghi chú nhóm:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Tạo nhắc hẹn (Reminder) lịch họp/sự kiện trong nhóm
app.post('/api/groups/board/reminder', async (req, res) => {
    const { accountId, groupId, title, startTime } = req.body;
    try {
        const client = activeClients[accountId];
        if (!client || !client.isLoggedIn || client.isSimulation) {
            return res.status(400).json({ success: false, error: 'Tài khoản không online hoặc chưa kết nối.' });
        }
        // Gọi API tạo nhắc hẹn, type = 1 là ThreadType.Group
        await client.api.createReminder({ title, startTime: parseInt(startTime), repeat: 0 }, groupId, 1);
        res.json({ success: true, message: 'Tạo nhắc hẹn thành công.' });
    } catch (error) {
        console.error('Lỗi tạo nhắc hẹn nhóm:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lấy danh sách từ khóa Auto-reply rules
app.get('/api/rules', async (req, res) => {
    try {
        const data = await rulesDb.find({});
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Thêm quy tắc từ khóa
app.post('/api/rules', async (req, res) => {
    const { keywords, matchType, reply, active } = req.body;
    try {
        const newRule = {
            id: 'rule-' + Date.now(),
            keywords: keywords.map(k => k.trim().toLowerCase()),
            matchType,
            reply,
            active: active !== undefined ? active : true,
            createdAt: new Date()
        };
        await rulesDb.insert(newRule);
        res.json({ success: true, data: newRule });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Xóa quy tắc từ khóa
app.delete('/api/rules/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await rulesDb.remove({ id });
        res.json({ success: true, message: 'Đã xóa quy tắc.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Bật/tắt trạng thái hoạt động của quy tắc từ khóa
app.post('/api/rules/toggle', async (req, res) => {
    const { id, active } = req.body;
    try {
        await rulesDb.update({ id }, { $set: { active } });
        res.json({ success: true, message: 'Đã cập nhật trạng thái quy tắc.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lấy danh sách các chiến dịch gửi tin
app.get('/api/campaigns', async (req, res) => {
    try {
        const list = await campaignsDb.find({});
        list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json({ success: true, data: list });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Tạo chiến dịch gửi tin hàng loạt (được xếp hàng vào hàng đợi)
app.post('/api/broadcast', async (req, res) => {
    const { accountId, targets, message, delay, scheduledTime } = req.body;
    try {
        const campaign = {
            id: 'camp-' + Date.now(),
            accountId,
            targets,
            message,
            delay: parseInt(delay) || 10,
            scheduledTime: scheduledTime || null,
            progress: 0,
            status: scheduledTime ? 'scheduled' : 'running',
            createdAt: new Date()
        };

        if (campaign.status === 'scheduled') {
            await campaignsDb.insert(campaign);
            messageQueue.notify(`Đã lên lịch chiến dịch gửi hàng loạt thành công lúc: ${new Date(scheduledTime).toLocaleString('vi-VN')}`, 'success');
        } else {
            // Đẩy trực tiếp vào queue để chạy ngay
            await messageQueue.addCampaign(campaign);
        }

        res.json({ success: true, data: campaign });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lấy danh sách Model thực tế từ API nhà cung cấp (Tự động cập nhật)
app.get('/api/ai/models', async (req, res) => {
    let { provider, apiKey, ollamaUrl, ollamaOnlineUrl } = req.query;
    try {
        let models = [];
        
        // Trợ giúp lấy key thực từ DB nếu key từ client bị mask hoặc rỗng
        const isMaskedOrEmpty = (key) => !key || key.includes('...') || key === '********';
        if (isMaskedOrEmpty(apiKey)) {
            const config = await aiSettingsDb.findOne({});
            if (config && config.aiProvider === provider) {
                apiKey = config.aiApiKey;
            }
        }

        if (provider === 'openai') {
            if (isMaskedOrEmpty(apiKey)) return res.json({ success: true, data: [] });
            const response = await fetch('https://api.openai.com/v1/models', {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            if (response.ok) {
                const json = await response.json();
                models = json.data
                    .map(m => m.id)
                    .filter(id => id.startsWith('gpt-') || id.startsWith('o1-') || id.startsWith('o3-'))
                    .sort();
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } else if (provider === 'gemini') {
            if (isMaskedOrEmpty(apiKey)) return res.json({ success: true, data: [] });
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if (response.ok) {
                const json = await response.json();
                models = json.models
                    .map(m => m.name.replace('models/', ''))
                    .filter(name => name.includes('gemini'))
                    .sort();
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } else if (provider === 'deepseek') {
            if (isMaskedOrEmpty(apiKey)) return res.json({ success: true, data: [] });
            const response = await fetch('https://api.deepseek.com/v1/models', {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            if (response.ok) {
                const json = await response.json();
                models = json.data.map(m => m.id).sort();
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } else if (provider === 'ollama') {
            const url = ollamaUrl || 'http://localhost:11434';
            const response = await fetch(`${url}/api/tags`);
            if (response.ok) {
                const json = await response.json();
                models = json.models.map(m => m.name).sort();
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } else if (provider === 'ollama-online') {
            const url = ollamaOnlineUrl || '';
            if (!url) return res.json({ success: true, data: [] });
            const headers = {};
            if (!isMaskedOrEmpty(apiKey)) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            } else {
                // Lấy key từ DB
                const config = await aiSettingsDb.findOne({});
                if (config && config.aiApiKeyPool && config.aiApiKeyPool['ollama-online']) {
                    const poolKey = config.aiApiKeyPool['ollama-online'][0];
                    if (poolKey) headers['Authorization'] = `Bearer ${poolKey}`;
                }
            }
            // Thử OpenAI-compatible endpoint trước
            try {
                const response = await fetch(`${url.replace(/\/+$/, '')}/v1/models`, { headers });
                if (response.ok) {
                    const json = await response.json();
                    models = json.data ? json.data.map(m => m.id).sort() : [];
                } else {
                    throw new Error('openai-compat failed');
                }
            } catch {
                // Fallback: Ollama native endpoint
                try {
                    const response2 = await fetch(`${url.replace(/\/+$/, '')}/api/tags`, { headers });
                    if (response2.ok) {
                        const json2 = await response2.json();
                        models = json2.models ? json2.models.map(m => m.name).sort() : [];
                    }
                } catch (e2) {
                    throw new Error(`Không thể kết nối Ollama Online: ${e2.message}`);
                }
            }
        } else if (provider === 'anthropic') {
            if (isMaskedOrEmpty(apiKey)) return res.json({ success: true, data: [] });
            const response = await fetch('https://api.anthropic.com/v1/models', {
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                }
            });
            if (response.ok) {
                const json = await response.json();
                models = json.data.map(m => m.id).sort();
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        }

        res.json({ success: true, data: models });
    } catch (err) {
        res.json({ success: false, error: err.message, data: [] });
    }
});

// Lấy cấu hình Trợ lý AI (OpenAI & Gemini) và RAG
app.get('/api/ai/config', async (req, res) => {
    try {
        let config = await aiSettingsDb.findOne({});
        if (!config) {
            config = {
                aiEnabled: false,
                aiProvider: 'openai',
                aiApiKey: '',
                aiApiKeyPool: [],
                aiModel: 'gpt-4o-mini',
                aiSystemPrompt: 'Bạn là một trợ lý AI hữu ích trong nhóm chat Zalo.',
                aiMode: 'mention_only',
                aiTriggerPrefix: '@bot',
                aiGroups: [],
                ragTopK: 3,
                ragScoreThreshold: 0.60,
                ragSearchMode: 'hybrid',
                stringeeSid: '',
                stringeeSecret: '',
                stringeeHotline: '',
                globalHostGroupId: '',
                aiTemperature: 0.7,
                aiTopP: 1.0,
                aiMaxTokens: 1000,
                aiFrequencyPenalty: 0.0,
                aiPresencePenalty: 0.0,
                aiEnableImageGen: false,
                aiEnableWebSearch: false,
                aiEnableVideoAnalysis: false,
                aiReactionProbability: 60,
                aiSafetySettings: {
                    harassment: 'BLOCK_MEDIUM_AND_ABOVE',
                    hateSpeech: 'BLOCK_MEDIUM_AND_ABOVE',
                    sexuallyExplicit: 'BLOCK_MEDIUM_AND_ABOVE',
                    dangerousContent: 'BLOCK_MEDIUM_AND_ABOVE'
                }
            };
        }

        // Tạo masked key helper
        const mask = (key) => {
            if (!key) return '';
            const len = key.length;
            if (len > 8) {
                return key.substring(0, 4) + '...' + key.substring(len - 4);
            }
            return '********';
        };

        const activeProvider = config.aiProvider || 'openai';
        const poolObj = config.aiApiKeyPool && typeof config.aiApiKeyPool === 'object' && !Array.isArray(config.aiApiKeyPool)
            ? config.aiApiKeyPool
            : {
                openai: config.aiProvider === 'openai' && Array.isArray(config.aiApiKeyPool) ? config.aiApiKeyPool : (config.aiApiKey ? [config.aiApiKey] : []),
                gemini: config.aiProvider === 'gemini' && Array.isArray(config.aiApiKeyPool) ? config.aiApiKeyPool : [],
                anthropic: config.aiProvider === 'anthropic' && Array.isArray(config.aiApiKeyPool) ? config.aiApiKeyPool : [],
                deepseek: config.aiProvider === 'deepseek' && Array.isArray(config.aiApiKeyPool) ? config.aiApiKeyPool : [],
                ollama: [],
                'ollama-online': []
            };

        // Mask all keys in the pool object
        const maskedPoolObj = {};
        for (const [p, keys] of Object.entries(poolObj)) {
            maskedPoolObj[p] = Array.isArray(keys) ? keys.map(k => mask(k)) : [];
        }

        const activePool = poolObj[activeProvider] || [];
        const maskedActivePool = maskedPoolObj[activeProvider] || [];
        const activeKey = activePool[0] || '';
        const maskedActiveKey = mask(activeKey);

        res.json({ 
            success: true, 
            data: {
                aiTemperature: 0.7,
                aiTopP: 1.0,
                aiMaxTokens: 1000,
                aiFrequencyPenalty: 0.0,
                aiPresencePenalty: 0.0,
                aiSafetySettings: {
                    harassment: 'BLOCK_MEDIUM_AND_ABOVE',
                    hateSpeech: 'BLOCK_MEDIUM_AND_ABOVE',
                    sexuallyExplicit: 'BLOCK_MEDIUM_AND_ABOVE',
                    dangerousContent: 'BLOCK_MEDIUM_AND_ABOVE'
                },
                ...config,
                aiApiKey: maskedActiveKey,
                aiApiKeyPool: maskedActivePool,
                aiAllProviderKeys: maskedPoolObj,
                hasApiKey: !!activeKey
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lưu cấu hình Trợ lý AI (OpenAI & Gemini) và RAG
app.post('/api/ai/config', async (req, res) => {
    const { 
        aiEnabled, aiProvider, aiApiKey, aiApiKeyPool, aiModel, aiSystemPrompt, aiMode, aiTriggerPrefix, aiGroups,
        ragTopK, ragScoreThreshold, ragSearchMode,
        stringeeSid, stringeeSecret, stringeeHotline, stringeeServerUrl,
        globalHostGroupId,
        aiTemperature, aiTopP, aiMaxTokens, aiFrequencyPenalty, aiPresencePenalty, aiSafetySettings,
        aiTopK, aiReasoningEffort, aiOllamaUrl,
        aiOllamaOnlineUrl, aiOllamaOnlineApiMode,
        aiAllProviderKeys,
        aiEnableImageGen, aiEnableWebSearch, aiEnableVideoAnalysis,
        aiReactionProbability
    } = req.body;
    try {
        let currentConfig = await aiSettingsDb.findOne({}) || {};
        const currentPoolObj = currentConfig.aiApiKeyPool && typeof currentConfig.aiApiKeyPool === 'object' && !Array.isArray(currentConfig.aiApiKeyPool)
            ? currentConfig.aiApiKeyPool
            : {
                openai: currentConfig.aiProvider === 'openai' && Array.isArray(currentConfig.aiApiKeyPool) ? currentConfig.aiApiKeyPool : (currentConfig.aiApiKey ? [currentConfig.aiApiKey] : []),
                gemini: currentConfig.aiProvider === 'gemini' && Array.isArray(currentConfig.aiApiKeyPool) ? currentConfig.aiApiKeyPool : [],
                anthropic: currentConfig.aiProvider === 'anthropic' && Array.isArray(currentConfig.aiApiKeyPool) ? currentConfig.aiApiKeyPool : [],
                deepseek: currentConfig.aiProvider === 'deepseek' && Array.isArray(currentConfig.aiApiKeyPool) ? currentConfig.aiApiKeyPool : [],
                ollama: [],
                'ollama-online': []
            };

        // Parse and unmask keys for each provider
        const savedPoolObj = {};
        const incomingAllKeys = aiAllProviderKeys || {};

        const providersList = ['openai', 'gemini', 'anthropic', 'deepseek', 'ollama', 'ollama-online'];
        providersList.forEach(p => {
            let incomingKeys = incomingAllKeys[p];
            if (incomingKeys === undefined) {
                if (p === aiProvider && aiApiKeyPool !== undefined && Array.isArray(aiApiKeyPool)) {
                    incomingKeys = aiApiKeyPool;
                } else {
                    incomingKeys = currentPoolObj[p] || [];
                }
            }

            const currentProviderPool = currentPoolObj[p] || [];
            savedPoolObj[p] = Array.isArray(incomingKeys) ? incomingKeys.map((key, index) => {
                if (key && (key.includes('...') || key === '********')) {
                    return currentProviderPool[index] || '';
                }
                return key || '';
            }).filter(k => k) : [];
        });

        // The overall active key
        const activeProvider = aiProvider || 'openai';
        const activeKeys = savedPoolObj[activeProvider] || [];
        const keyToSave = activeKeys[0] || '';

        const record = {
            aiEnabled: !!aiEnabled,
            aiProvider: aiProvider || 'openai',
            aiApiKey: keyToSave || '',
            aiApiKeyPool: savedPoolObj, // Save as object
            aiModel: aiModel || (aiProvider === 'openai' ? 'gpt-4o-mini' : 
                                 aiProvider === 'gemini' ? 'gemini-1.5-flash' :
                                 aiProvider === 'anthropic' ? 'claude-3-5-sonnet-latest' :
                                 aiProvider === 'deepseek' ? 'deepseek-chat' : 'llama3'),
            aiSystemPrompt: aiSystemPrompt || 'Bạn là một trợ lý AI hữu ích trong nhóm chat Zalo.',
            aiMode: aiMode || 'mention_only',
            aiTriggerPrefix: aiTriggerPrefix || '@bot',
            aiGroups: Array.isArray(aiGroups) ? aiGroups : [],
            ragTopK: parseInt(ragTopK) || 3,
            ragScoreThreshold: parseFloat(ragScoreThreshold) || 0.60,
            ragSearchMode: ragSearchMode || 'hybrid',
            stringeeSid: stringeeSid || '',
            stringeeSecret: stringeeSecret || '',
            stringeeHotline: stringeeHotline || '',
            stringeeServerUrl: stringeeServerUrl || '',
            globalHostGroupId: globalHostGroupId || '',
            aiTemperature: isNaN(parseFloat(aiTemperature)) ? 0.7 : parseFloat(aiTemperature),
            aiTopP: isNaN(parseFloat(aiTopP)) ? 1.0 : parseFloat(aiTopP),
            aiMaxTokens: parseInt(aiMaxTokens) || 1000,
            aiFrequencyPenalty: isNaN(parseFloat(aiFrequencyPenalty)) ? 0.0 : parseFloat(aiFrequencyPenalty),
            aiPresencePenalty: isNaN(parseFloat(aiPresencePenalty)) ? 0.0 : parseFloat(aiPresencePenalty),
            aiEnableImageGen: !!aiEnableImageGen,
            aiEnableWebSearch: !!aiEnableWebSearch,
            aiEnableVideoAnalysis: !!aiEnableVideoAnalysis,
            aiReactionProbability: isNaN(parseInt(aiReactionProbability)) ? 60 : parseInt(aiReactionProbability),
            aiSafetySettings: aiSafetySettings || {
                harassment: 'BLOCK_MEDIUM_AND_ABOVE',
                hateSpeech: 'BLOCK_MEDIUM_AND_ABOVE',
                sexuallyExplicit: 'BLOCK_MEDIUM_AND_ABOVE',
                dangerousContent: 'BLOCK_MEDIUM_AND_ABOVE'
            },
            aiTopK: isNaN(parseInt(aiTopK)) ? 40 : parseInt(aiTopK),
            aiReasoningEffort: aiReasoningEffort || 'medium',
            aiOllamaUrl: aiOllamaUrl || 'http://localhost:11434',
            aiOllamaOnlineUrl: aiOllamaOnlineUrl || '',
            aiOllamaOnlineApiMode: aiOllamaOnlineApiMode || 'openai-compat',
            updatedAt: new Date()
        };
        await aiSettingsDb.update({}, record, { upsert: true });

        // Generate response with masked values
        const maskedSavedPoolObj = {};
        for (const [p, keys] of Object.entries(savedPoolObj)) {
            maskedSavedPoolObj[p] = Array.isArray(keys) ? keys.map(() => '********') : [];
        }

        res.json({ 
            success: true, 
            message: 'Đã lưu cấu hình Trợ lý AI và RAG thành công.', 
            data: { 
                ...record, 
                aiApiKey: '********', 
                aiApiKeyPool: maskedSavedPoolObj[activeProvider] || [],
                aiAllProviderKeys: maskedSavedPoolObj
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Kiểm tra kết nối trực tiếp đến OpenAI / Gemini API
app.post('/api/ai/config/test', async (req, res) => {
    const { aiProvider, aiApiKey, aiModel, aiSystemPrompt } = req.body;
    try {
        const { aiSettingsDb } = require('./database');
        let currentConfig = await aiSettingsDb.findOne({}) || {};
        
        let keyToUse = aiApiKey;
        if (aiApiKey && (aiApiKey.includes('...') || aiApiKey === '********')) {
            const targetProvider = aiProvider || 'openai';
            const pool = currentConfig.aiApiKeyPool;
            if (pool && typeof pool === 'object' && !Array.isArray(pool)) {
                const providerPool = pool[targetProvider];
                if (Array.isArray(providerPool) && providerPool[0]) {
                    keyToUse = providerPool[0];
                }
            }
            if (!keyToUse || keyToUse.includes('...') || keyToUse === '********') {
                keyToUse = currentConfig.aiApiKey || '';
            }
        }

        if (!keyToUse) {
            return res.status(400).json({ success: false, error: 'Thiếu API Key' });
        }

        const provider = aiProvider || 'openai';
        const model = aiModel || (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash');
        const systemPrompt = aiSystemPrompt || 'Bạn là trợ lý AI.';

        console.log(`Server AI Test: Gửi câu hỏi test đến ${provider} (${model})...`);

        if (provider === 'openai') {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${keyToUse}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: 'Xin chào! Hãy phản hồi cực kỳ ngắn gọn (dưới 10 từ) để xác nhận kết nối thành công.' }
                    ],
                    max_tokens: 50
                })
            });

            if (response.ok) {
                const data = await response.json();
                const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
                res.json({ success: true, message: 'Kết nối đến OpenAI API thành công!', reply: reply || 'Không có phản hồi' });
            } else {
                const errData = await response.json().catch(() => ({}));
                const errMsg = errData.error?.message || `Mã lỗi HTTP ${response.status}`;
                res.status(response.status).json({ success: false, error: `OpenAI trả về lỗi: ${errMsg}` });
            }
        } else if (provider === 'gemini') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keyToUse}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                { text: `System Instruction: ${systemPrompt}\n\nUser: Xin chào! Hãy phản hồi cực kỳ ngắn gọn (dưới 10 từ) để xác nhận kết nối thành công.` }
                            ]
                        }
                    ],
                    generationConfig: {
                        maxOutputTokens: 50
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                const reply = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
                res.json({ success: true, message: 'Kết nối đến Gemini API thành công!', reply: reply || 'Không có phản hồi' });
            } else {
                const errData = await response.json().catch(() => ({}));
                const errMsg = errData.error?.message || `Mã lỗi HTTP ${response.status}`;
                res.status(response.status).json({ success: false, error: `Gemini trả về lỗi: ${errMsg}` });
            }
        } else if (provider === 'ollama-online') {
            // Ollama Online (Cloud) test
            const ollamaOnlineUrl = currentConfig.aiOllamaOnlineUrl || '';
            if (!ollamaOnlineUrl) {
                return res.status(400).json({ success: false, error: 'Chưa cấu hình Ollama Online Server URL.' });
            }
            const apiMode = currentConfig.aiOllamaOnlineApiMode || 'openai-compat';
            const headers = { 'Content-Type': 'application/json' };
            if (keyToUse && !keyToUse.includes('...') && keyToUse !== '********') {
                headers['Authorization'] = `Bearer ${keyToUse}`;
            }

            if (apiMode === 'openai-compat') {
                const endpoint = ollamaOnlineUrl.replace(/\/+$/, '') + '/v1/chat/completions';
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: 'Xin chào! Hãy phản hồi cực kỳ ngắn gọn (dưới 10 từ) để xác nhận kết nối thành công.' }
                        ],
                        max_tokens: 50
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
                    res.json({ success: true, message: `Kết nối đến Ollama Online (OpenAI-compat) thành công!`, reply: reply || 'Không có phản hồi' });
                } else {
                    const errText = await response.text();
                    res.status(response.status).json({ success: false, error: `Ollama Online trả về lỗi: HTTP ${response.status} - ${errText.substring(0, 200)}` });
                }
            } else {
                // Ollama Native mode
                const endpoint = ollamaOnlineUrl.replace(/\/+$/, '') + '/api/chat';
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: 'Xin chào! Hãy phản hồi cực kỳ ngắn gọn (dưới 10 từ) để xác nhận kết nối thành công.' }
                        ],
                        stream: false,
                        options: { num_predict: 50 }
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    const reply = data.message ? data.message.content : 'Không có phản hồi';
                    res.json({ success: true, message: `Kết nối đến Ollama Online (Native) thành công!`, reply });
                } else {
                    const errText = await response.text();
                    res.status(response.status).json({ success: false, error: `Ollama Online trả về lỗi: HTTP ${response.status} - ${errText.substring(0, 200)}` });
                }
            }
        } else {
            res.status(400).json({ success: false, error: 'Nhà cung cấp không hỗ trợ.' });
        }
    } catch (error) {
        console.error('Lỗi khi kiểm tra kết nối AI:', error.message);
        res.status(500).json({ success: false, error: `Không thể kết nối: ${error.message}` });
    }
});

// Lấy danh sách tài liệu tri thức
app.get('/api/knowledge', async (req, res) => {
    try {
        const list = await knowledgeDb.find({});
        list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json({ success: true, data: list });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Thêm hoặc cập nhật tài liệu tri thức (hỗ trợ tài liệu online)
app.post('/api/knowledge', async (req, res) => {
    const { id, title, content, active, sourceType, sourceUrl, syncInterval } = req.body;
    try {
        if (!title) {
            return res.status(400).json({ success: false, error: 'Tiêu đề không được để trống.' });
        }

        const type = sourceType || 'manual';
        const url = sourceUrl || '';
        const interval = parseInt(syncInterval) || 1440; // Mặc định 24h = 1440m

        let doc;
        if (id) {
            // Cập nhật tài liệu cũ
            const query = id.startsWith('know-') ? { id } : { _id: id };
            const currentDoc = await knowledgeDb.findOne(query);
            if (!currentDoc) {
                return res.status(404).json({ success: false, error: 'Không tìm thấy tài liệu.' });
            }

            const updatedDoc = {
                $set: {
                    title: title.trim(),
                    content: type === 'manual' ? (content ? content.trim() : '') : currentDoc.content,
                    active: active !== undefined ? !!active : currentDoc.active,
                    sourceType: type,
                    sourceUrl: url.trim(),
                    syncInterval: interval,
                    updatedAt: new Date()
                }
            };
            await knowledgeDb.update(query, updatedDoc);
            doc = await knowledgeDb.findOne(query);
        } else {
            // Thêm tài liệu mới
            const newDoc = {
                id: 'know-' + Date.now(),
                title: title.trim(),
                content: type === 'manual' ? (content ? content.trim() : '') : '',
                active: active !== undefined ? !!active : true,
                sourceType: type,
                sourceUrl: url.trim(),
                syncInterval: interval,
                syncStatus: type === 'manual' ? 'synced' : 'syncing',
                chunks: [],
                charCount: type === 'manual' ? (content ? content.length : 0) : 0,
                chunkCount: 0,
                createdAt: new Date()
            };
            doc = await knowledgeDb.insert(newDoc);
        }

        // Nếu là tài liệu online, kích hoạt cào ngầm
        if (type !== 'manual') {
            const aiConfig = await aiSettingsDb.findOne({}) || {};
            syncDocument(doc, aiConfig, knowledgeDb).catch(err => {
                console.error(`Lỗi đồng bộ ngầm khi tạo/sửa tài liệu:`, err.message);
            });
            res.json({ success: true, message: 'Đang bắt đầu đồng bộ tài liệu online...', data: doc });
        } else {
            // Nếu là nhập tay, tự động phân chunks luôn
            const { chunkText } = require('./document-sync');
            const chunks = chunkText(doc.content);
            await knowledgeDb.update({ _id: doc._id }, { $set: { chunks, chunkCount: chunks.length, charCount: doc.content.length } });
            doc.chunks = chunks;
            doc.chunkCount = chunks.length;
            doc.charCount = doc.content.length;
            res.json({ success: true, message: 'Đã lưu tài liệu tri thức thành công.', data: doc });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Xóa tài liệu tri thức
app.delete('/api/knowledge/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const query = id.startsWith('know-') ? { id } : { _id: id };
        await knowledgeDb.remove(query);
        res.json({ success: true, message: 'Đã xóa tài liệu tri thức.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Bật/tắt trạng thái hoạt động của tài liệu tri thức
app.post('/api/knowledge/toggle', async (req, res) => {
    const { id, active } = req.body;
    try {
        const query = id.startsWith('know-') ? { id } : { _id: id };
        await knowledgeDb.update(query, { $set: { active: !!active } });
        res.json({ success: true, message: 'Đã cập nhật trạng thái tài liệu.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Đồng bộ thủ công tài liệu online
app.post('/api/knowledge/sync/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const query = id.startsWith('know-') ? { id } : { _id: id };
        const doc = await knowledgeDb.findOne(query);
        if (!doc) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy tài liệu.' });
        }
        if (doc.sourceType === 'manual') {
            return res.status(400).json({ success: false, error: 'Không thể đồng bộ tài liệu nhập tay.' });
        }

        const aiConfig = await aiSettingsDb.findOne({}) || {};
        
        syncDocument(doc, aiConfig, knowledgeDb)
            .then(result => {
                io.emit('knowledge.synced', { id: doc.id, success: result.success });
            })
            .catch(err => {
                console.error(`Lỗi đồng bộ thủ công tài liệu ${doc.title}:`, err.message);
                io.emit('knowledge.synced', { id: doc.id, success: false, error: err.message });
            });

        res.json({ success: true, message: 'Đang tiến hành đồng bộ tài liệu...' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Thử nghiệm truy vấn RAG (Query Testing)
app.post('/api/knowledge/query-test', async (req, res) => {
    const { question } = req.body;
    try {
        const { queryVoiceRag } = require('./call-controller');
        const { queryHybridRag } = require('./document-sync');
        
        if (!question) {
            return res.status(400).json({ success: false, error: 'Thiếu câu hỏi kiểm thử.' });
        }

        const aiConfig = await aiSettingsDb.findOne({}) || {};
        const matchedContext = await queryVoiceRag(question, aiConfig);
        const matchedChunks = await queryHybridRag(question, aiConfig, knowledgeDb);

        res.json({
            success: true,
            rawContext: matchedContext,
            chunks: matchedChunks.map(c => ({
                text: c.text,
                docTitle: c.docTitle,
                score: c.similarityScore || c.hybridScore || 0
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Kích hoạt cuộc gọi thoại AI thử nghiệm tới SĐT di động thật
app.post('/api/calls/trigger', async (req, res) => {
    const { phoneNumber } = req.body;
    try {
        const { makeOutboundCall } = require('./call-controller');
        
        if (!phoneNumber) {
            return res.status(400).json({ success: false, error: 'Thiếu số điện thoại.' });
        }

        const aiConfig = await aiSettingsDb.findOne({}) || {};
        if (!aiConfig.stringeeSid || !aiConfig.stringeeSecret) {
            return res.status(400).json({ 
                success: false, 
                isSimulation: true,
                error: 'Chưa cấu hình API Key Stringee.' 
            });
        }

        const result = await makeOutboundCall(phoneNumber, aiConfig);
        res.json({ success: true, message: 'Đã kích hoạt cuộc gọi điện thoại thật.', data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lấy lịch sử cuộc gọi
app.get('/api/calls/history', async (req, res) => {
    try {
        const list = await callsDb.find({});
        list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json({ success: true, data: list });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Webhook Answer URL cho Stringee
app.post('/api/calls/webhook/answer', async (req, res) => {
    const aiConfig = await aiSettingsDb.findOne({}) || {};
    const serverUrl = aiConfig.stringeeServerUrl || `${req.protocol}://${req.get('host')}`;
    const recordUrl = `${serverUrl}/api/calls/webhook/record`;
    const scco = [
        {
            action: "talk",
            text: "Xin chào, tôi là trợ lý đàm thoại tự động của Zalo CRM. Tôi có thể hỗ trợ gì cho bạn hôm nay ạ?",
            voice: "southern",
            speed: 0,
            bargeIn: true
        },
        {
            action: "record",
            eventUrl: recordUrl,
            format: "mp3",
            silenceTime: 3,
            maxDuration: 20
        }
    ];
    res.json(scco);
});

// Webhook Record Callback cho Stringee
app.post('/api/calls/webhook/record', async (req, res) => {
    const { recording_url, call_id, from } = req.body;
    if (!recording_url) {
        return res.json([{ action: "hangup" }]);
    }

    try {
        const { speechToTextWhisper, generateVoiceAiReply } = require('./call-controller');
        const aiConfig = await aiSettingsDb.findOne({}) || {};
        
        // Tải file ghi âm từ Stringee
        const audioRes = await fetch(recording_url);
        const arrayBuf = await audioRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);

        // Chuyển âm thanh -> văn bản (STT)
        const question = await speechToTextWhisper(buffer, aiConfig.aiApiKey);
        
        if (!question || question.trim().length === 0) {
            return res.json([
                {
                    action: "talk",
                    text: "Dạ, em nghe chưa rõ. Anh chị có thể nói lại được không ạ?",
                    voice: "southern",
                    speed: 0,
                    bargeIn: true
                },
                {
                    action: "record",
                    eventUrl: `${req.protocol}://${req.get('host')}/api/calls/webhook/record`,
                    format: "mp3",
                    silenceTime: 3,
                    maxDuration: 20
                }
            ]);
        }

        // Truy vấn CSDL cuộc gọi
        let call = await callsDb.findOne({ stringeeCallId: call_id });
        if (!call) {
            call = await callsDb.insert({
                stringeeCallId: call_id,
                phoneNumber: from,
                clientName: 'Khách hàng',
                direction: 'outbound',
                status: 'completed',
                duration: 0,
                transcript: [],
                createdAt: new Date()
            });
        }

        call.transcript.push({ role: 'user', text: question, time: new Date() });

        // Sinh phản hồi từ AI + RAG
        const reply = await generateVoiceAiReply(question, call.transcript, aiConfig);
        call.transcript.push({ role: 'ai', text: reply, time: new Date() });

        // Lưu lại cuộc gọi
        await callsDb.update({ _id: call._id }, { $set: { transcript: call.transcript } });

        // Phản hồi Stringee phát âm thanh
        res.json([
            {
                action: "talk",
                text: reply,
                voice: "southern",
                speed: 0,
                bargeIn: true
            },
            {
                action: "record",
                eventUrl: `${req.protocol}://${req.get('host')}/api/calls/webhook/record`,
                format: "mp3",
                silenceTime: 3,
                maxDuration: 20
            }
        ]);
    } catch (err) {
        console.error("Webhook Record Error:", err.message);
        res.json([
            { action: "talk", text: "Dạ, hệ thống đang gặp lỗi gián đoạn. Em xin lỗi ạ.", voice: "southern" },
            { action: "hangup" }
        ]);
    }
});


// Tự động khôi phục kết nối các tài khoản Zalo đã lưu session khi server khởi động
async function autoconnectAccounts() {
    try {
        const storedSessions = await sessionsDb.find({});
        console.log(`Server: Phát hiện ${storedSessions.length} tài khoản có sẵn session. Đang tự động kết nối...`);
        
        storedSessions.forEach(session => {
            const client = new ZaloClientWrapper(session.id, session.phone, session.sessionFile);
            activeClients[session.id] = client;
            
            client.initialize(
                () => {}, // Không emit QR khi autoconnect
                async (userData) => {
                    console.log(`Server: Tự động khôi phục session Zalo thành công cho ${userData.name}`);
                    await handleLoginSuccess(userData, session.sessionFile, client);
                },
                // Tin nhắn mới callback (real-time emit)
                (message) => {
                    if (!message || !message.data) return;
                    const msgObj = {
                        id: message.data.msgId || ('msg-' + Date.now()),
                        senderId: message.data.uidFrom || '',
                        content: message.data.content || '',
                        timestamp: message.data.ts ? parseInt(message.data.ts) : Date.now(),
                        isSelf: !!message.isSelf,
                        msgType: message.data.msgType || 'chat.text'
                    };
                    io.emit('zalo.message', {
                        accountId: client.accountId,
                        groupId: message.threadId,
                        message: msgObj
                    });
                    // Lưu vào realtimeMessageStore để phục vụ lịch sử chat (fallback)
                    const gid = message.threadId;
                    if (gid) {
                        if (!realtimeMessageStore[gid]) realtimeMessageStore[gid] = [];
                        realtimeMessageStore[gid].push(msgObj);
                        if (realtimeMessageStore[gid].length > 200) {
                            realtimeMessageStore[gid] = realtimeMessageStore[gid].slice(-200);
                        }
                        saveRealtimeMessageStore();
                        saveMessageToDb(gid, msgObj);
                    }
                }
            ).catch(err => {
                console.error(`Lỗi khi tự động kết nối tài khoản ${session.phone}:`, err.message);
            });
        });
    } catch (e) {
        console.error('Lỗi khi tự động kết nối lại:', e.message);
    }
}

// -------------------------------------------------------------
// REST API CHO QUẢN LÝ HỒ SƠ THÀNH VIÊN VÀ TRÍ NHỚ AI
// -------------------------------------------------------------

// Lấy danh sách thành viên toàn cục (có tìm kiếm, lọc VIP, phân trang)
app.get('/api/members', async (req, res) => {
    const { search, vipStatus, page = 1, limit = 20 } = req.query;
    try {
        const { prisma } = require('./database');
        const where = {};
        if (vipStatus) {
            where.vipStatus = vipStatus;
        }
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { phone: { contains: search } },
                { notes: { contains: search } }
            ];
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);
        
        const total = await prisma.member.count({ where });
        const members = await prisma.member.findMany({
            where,
            skip,
            take,
            include: { _count: { select: { memories: true } } },
            orderBy: { updatedAt: 'desc' }
        });
        
        const data = members.map(m => ({
            id: m.id,
            groupId: m.groupId,
            zaloId: m.zaloId,
            name: m.name,
            phone: m.phone || '',
            vipStatus: m.vipStatus,
            notes: m.notes || '',
            xungHo: m.xungHo || '',
            avatar: m.avatar || '',
            lastSentiment: m.lastSentiment || 'Bình thường',
            memoriesCount: m._count ? m._count.memories : 0
        }));
        
        res.json({ success: true, total, page: parseInt(page), limit: parseInt(limit), data });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách thành viên:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lấy thông tin chi tiết của một thành viên cụ thể
app.get('/api/members/:groupId/:zaloId', async (req, res) => {
    const { groupId, zaloId } = req.params;
    try {
        const { prisma } = require('./database');
        const memberId = `${groupId}-${zaloId}`;
        const member = await prisma.member.findUnique({
            where: { id: memberId },
            include: { _count: { select: { memories: true } } }
        });
        if (!member) {
            return res.status(404).json({ success: false, error: 'Thành viên không tồn tại' });
        }
        res.json({
            success: true,
            data: {
                id: member.id,
                groupId: member.groupId,
                zaloId: member.zaloId,
                name: member.name,
                phone: member.phone || '',
                vipStatus: member.vipStatus,
                notes: member.notes || '',
                xungHo: member.xungHo || '',
                avatar: member.avatar || '',
                lastSentiment: member.lastSentiment || 'Bình thường',
                memoriesCount: member._count ? member._count.memories : 0
            }
        });
    } catch (error) {
        console.error('Lỗi khi lấy thông tin chi tiết thành viên:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cập nhật hồ sơ thành viên (SĐT, trạng thái VIP, ghi chú, xưng hô, cảm xúc)
app.post('/api/members/update', async (req, res) => {
    const { id, groupId, zaloId, name, phone, vipStatus, notes, xungHo, lastSentiment } = req.body;
    try {
        const { prisma } = require('./database');
        const memberId = id || `${groupId}-${zaloId}`;
        
        // Lấy thông tin cũ để kiểm tra thay đổi cảm xúc
        const oldMember = await prisma.member.findUnique({
            where: { id: memberId }
        });
        
        const updated = await prisma.member.update({
            where: { id: memberId },
            data: {
                name,
                phone: phone || null,
                vipStatus: vipStatus || 'normal',
                notes: notes || null,
                xungHo: xungHo || null,
                lastSentiment: lastSentiment || 'Bình thường'
            }
        });
        
        // Lấy số lượng lịch sử hiện tại
        const historyCount = await prisma.memberSentiment.count({
            where: {
                groupId: groupId || (oldMember ? oldMember.groupId : ''),
                zaloId: zaloId || (oldMember ? oldMember.zaloId : '')
            }
        });
        
        // Nếu cảm xúc thay đổi hoặc chưa từng có lịch sử cảm xúc, ghi nhận vào lịch sử
        if (lastSentiment && (!oldMember || oldMember.lastSentiment !== lastSentiment || historyCount === 0)) {
            await prisma.memberSentiment.create({
                data: {
                    groupId: groupId || (oldMember ? oldMember.groupId : ''),
                    zaloId: zaloId || (oldMember ? oldMember.zaloId : ''),
                    sentiment: lastSentiment
                }
            });

            // Đồng bộ sự kiện cảm xúc thay đổi bằng Socket.io phát cho tất cả UI client
            if (global.io) {
                global.io.emit('member.sentiment.updated', {
                    groupId: groupId || (oldMember ? oldMember.groupId : ''),
                    zaloId: zaloId || (oldMember ? oldMember.zaloId : ''),
                    lastSentiment
                });
            }
        }
        
        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('Lỗi khi cập nhật thành viên:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lấy lịch sử biến động cảm xúc / tâm lý của thành viên (dữ liệu vẽ biểu đồ)
app.get('/api/members/:groupId/:zaloId/sentiment-history', async (req, res) => {
    const { groupId, zaloId } = req.params;
    try {
        const { prisma } = require('./database');
        const history = await prisma.memberSentiment.findMany({
            where: { groupId, zaloId },
            orderBy: { createdAt: 'asc' }, // Sắp xếp cũ -> mới để vẽ biểu đồ line chart
            take: 30 // Lấy tối đa 30 mốc biến động gần nhất
        });
        res.json({ success: true, data: history });
    } catch (error) {
        console.error('Lỗi khi lấy lịch sử cảm xúc:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lấy danh sách bộ nhớ AI về thành viên
app.get('/api/members/:groupId/:zaloId/memories', async (req, res) => {
    const { groupId, zaloId } = req.params;
    try {
        const { prisma } = require('./database');
        const memories = await prisma.memberMemory.findMany({
            where: { groupId, zaloId },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ success: true, data: memories });
    } catch (error) {
        console.error('Lỗi khi lấy bộ nhớ thành viên:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Thêm một sự kiện ghi nhớ thủ công
app.post('/api/members/:groupId/:zaloId/memories', async (req, res) => {
    const { groupId, zaloId } = req.params;
    const { fact, importance = 3 } = req.body;
    try {
        const { prisma } = require('./database');
        const newMemory = await prisma.memberMemory.create({
            data: {
                groupId,
                zaloId,
                fact,
                importance: parseInt(importance)
            }
        });
        res.json({ success: true, data: newMemory });
    } catch (error) {
        console.error('Lỗi khi thêm bộ nhớ thành viên:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Xóa một sự kiện ghi nhớ AI
app.delete('/api/members/:groupId/:zaloId/memories/:memoryId', async (req, res) => {
    const { memoryId } = req.params;
    try {
        const { prisma } = require('./database');
        await prisma.memberMemory.delete({
            where: { id: memoryId }
        });
        res.json({ success: true, message: 'Đã xóa bộ nhớ AI.' });
    } catch (error) {
        console.error('Lỗi khi xóa bộ nhớ thành viên:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// -------------------------------------------------------------
// REST API CHO TRÍCH XUẤT DỮ LIỆU NHÓM (ĐƠN HÀNG, BÁO CÁO)
// -------------------------------------------------------------

// Lấy danh sách dữ liệu trích xuất của nhóm
app.get('/api/groups/:groupId/data', async (req, res) => {
    const { groupId } = req.params;
    const { dataType } = req.query;
    try {
        const { prisma } = require('./database');
        const where = { groupId };
        if (dataType) {
            where.dataType = dataType;
        }
        const items = await prisma.groupData.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });
        res.json({ success: true, data: items });
    } catch (error) {
        console.error('Lỗi khi lấy dữ liệu nhóm:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cập nhật trạng thái một dòng dữ liệu trích xuất
app.post('/api/groups/:groupId/data/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        const { prisma } = require('./database');
        const updated = await prisma.groupData.update({
            where: { id },
            data: { status }
        });
        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('Lỗi khi cập nhật trạng thái dữ liệu nhóm:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Xóa một dòng dữ liệu trích xuất
app.delete('/api/groups/:groupId/data/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { prisma } = require('./database');
        await prisma.groupData.delete({
            where: { id }
        });
        res.json({ success: true, message: 'Đã xóa dữ liệu.' });
    } catch (error) {
        console.error('Lỗi khi xóa dữ liệu nhóm:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// -------------------------------------------------------------
// REST API CHO THEO DÕI SỨC KHỎE API & LOGS
// -------------------------------------------------------------

// Lấy lịch sử log từ SQLite DB
app.get('/api/logs', async (req, res) => {
    const { level, category, limit = 50, offset = 0 } = req.query;
    try {
        const { prisma } = require('./database');
        const where = {};
        if (level) where.level = level;
        if (category) where.category = category;

        const logs = await prisma.log.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: Math.min(parseInt(limit), 200),
            skip: parseInt(offset)
        });
        res.json({ success: true, data: logs });
    } catch (error) {
        logger.error('system', `Lỗi khi lấy lịch sử log: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lấy trạng thái lưu log vào SQLite DB
app.get('/api/logs/toggle', (req, res) => {
    res.json({ success: true, enabled: global.saveLogsToDb !== false });
});

// Cập nhật trạng thái lưu log vào SQLite DB
app.post('/api/logs/toggle', (req, res) => {
    try {
        const { enabled } = req.body;
        global.saveLogsToDb = enabled !== false;
        logger.info('system', `Trạng thái ghi log vào cơ sở dữ liệu đã được cập nhật thành: ${global.saveLogsToDb}`);
        res.json({ success: true, enabled: global.saveLogsToDb });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lấy danh sách trạng thái bật/tắt các công cụ tương tác AI
app.get('/api/ai/tools', (req, res) => {
    const { getEnabledTools, getToolStats } = require('./ai-tools');
    res.json({ success: true, tools: getEnabledTools(), stats: getToolStats() });
});

// Cập nhật trạng thái bật/tắt các công cụ tương tác AI
app.post('/api/ai/tools', (req, res) => {
    try {
        const { saveEnabledTools } = require('./ai-tools');
        const config = req.body;
        const saved = saveEnabledTools(config);
        if (saved) {
            logger.info('system', 'Đã cập nhật cấu hình bật/tắt các tính năng tương tác của bot.');
            res.json({ success: true, message: 'Đã cập nhật cấu hình công cụ thành công.' });
        } else {
            res.status(500).json({ success: false, error: 'Lưu tệp cấu hình thất bại.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Lấy trạng thái sức khỏe nhanh (cached / fast check)
app.get('/api/health', async (req, res) => {
    try {
        const { prisma } = require('./database');
        
        // 1. Zalo connection status
        const zaloStatus = Object.keys(activeClients).map(id => {
            const client = activeClients[id];
            return {
                id,
                phone: client.phone,
                name: client.name || `Tài khoản ${client.phone}`,
                status: client.isLoggedIn ? 'online' : 'offline',
                isSimulation: client.isSimulation
            };
        });

        // 2. DB connection check
        let dbLatency = -1;
        let dbStatus = 'offline';
        try {
            const dbStart = Date.now();
            await prisma.session.count();
            dbLatency = Date.now() - dbStart;
            dbStatus = 'online';
        } catch (dbErr) {
            logger.error('db', `Lỗi kết nối DB trong health check: ${dbErr.message}`);
        }

        // 3. AI configuration
        const aiConfig = await aiSettingsDb.findOne({});
        const aiStatus = {
            provider: aiConfig?.aiProvider || 'openai',
            model: aiConfig?.aiModel || 'n/a',
            enabled: !!aiConfig?.aiEnabled,
            poolSize: Array.isArray(aiConfig?.aiApiKeyPool) ? aiConfig.aiApiKeyPool.filter(k => k).length : (aiConfig?.aiApiKey ? 1 : 0)
        };

        // 4. VoIP config
        const voipStatus = {
            configured: !!(aiConfig?.stringeeSid && aiConfig?.stringeeSecret),
            serverUrlConfigured: !!aiConfig?.stringeeServerUrl
        };

        res.json({
            success: true,
            status: {
                zalo: zaloStatus,
                db: { status: dbStatus, latency: dbLatency },
                ai: aiStatus,
                voip: voipStatus
            }
        });
    } catch (error) {
        logger.error('system', `Lỗi health check: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Chạy chẩn đoán chủ động (Active Diagnostic Pings)
app.post('/api/health/diagnose', async (req, res) => {
    logger.info('system', 'Bắt đầu chạy chẩn đoán sức khỏe hệ thống...');
    const diagnostics = {
        db: { status: 'unknown', latency: -1, error: null },
        gemini: { status: 'disabled', latency: -1, error: null },
        openai: { status: 'disabled', latency: -1, error: null },
        stringee: { status: 'disabled', latency: -1, error: null }
    };

    try {
        const { prisma } = require('./database');
        const aiConfig = await aiSettingsDb.findOne({});

        // 1. Diagnose SQLite Database
        const dbStart = Date.now();
        try {
            await prisma.session.count();
            diagnostics.db.latency = Date.now() - dbStart;
            diagnostics.db.status = 'online';
        } catch (dbErr) {
            diagnostics.db.status = 'offline';
            diagnostics.db.error = dbErr.message;
            logger.error('db', `Chẩn đoán DB thất bại: ${dbErr.message}`);
        }

        // 2. Diagnose AI APIs
        const keysPool = Array.isArray(aiConfig?.aiApiKeyPool) && aiConfig.aiApiKeyPool.length > 0
            ? aiConfig.aiApiKeyPool.filter(k => k)
            : [aiConfig?.aiApiKey].filter(k => k);

        if (aiConfig?.aiEnabled && keysPool.length > 0) {
            const keyToTest = keysPool[0];
            
            if (aiConfig.aiProvider === 'gemini') {
                diagnostics.gemini.status = 'pending';
                const model = aiConfig.aiModel || 'gemini-2.5-flash';
                const geminiStart = Date.now();
                try {
                    // Send a lightweight verifyContent request
                    const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keyToTest}`;
                    const geminiRes = await fetch(testUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
                            generationConfig: { maxOutputTokens: 1 }
                        }),
                        signal: AbortSignal.timeout(4000) // 4s timeout
                    });

                    diagnostics.gemini.latency = Date.now() - geminiStart;
                    if (geminiRes.ok) {
                        diagnostics.gemini.status = 'online';
                    } else {
                        const errTxt = await geminiRes.text();
                        diagnostics.gemini.status = 'offline';
                        diagnostics.gemini.error = `HTTP ${geminiRes.status}: ${errTxt}`;
                        logger.warn('api', `Chẩn đoán Gemini trả về lỗi HTTP: ${geminiRes.status}`);
                    }
                } catch (geminiErr) {
                    diagnostics.gemini.status = 'offline';
                    diagnostics.gemini.error = geminiErr.message;
                    logger.error('api', `Chẩn đoán Gemini thất bại: ${geminiErr.message}`);
                }
            } else if (aiConfig.aiProvider === 'openai') {
                diagnostics.openai.status = 'pending';
                const model = aiConfig.aiModel || 'gpt-4o-mini';
                const openaiStart = Date.now();
                try {
                    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${keyToTest}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: model,
                            messages: [{ role: 'user', content: 'ping' }],
                            max_tokens: 1
                        }),
                        signal: AbortSignal.timeout(4000) // 4s timeout
                    });

                    diagnostics.openai.latency = Date.now() - openaiStart;
                    if (openaiRes.ok) {
                        diagnostics.openai.status = 'online';
                    } else {
                        const errTxt = await openaiRes.text();
                        diagnostics.openai.status = 'offline';
                        diagnostics.openai.error = `HTTP ${openaiRes.status}: ${errTxt}`;
                        logger.warn('api', `Chẩn đoán OpenAI trả về lỗi HTTP: ${openaiRes.status}`);
                    }
                } catch (openaiErr) {
                    diagnostics.openai.status = 'offline';
                    diagnostics.openai.error = openaiErr.message;
                    logger.error('api', `Chẩn đoán OpenAI thất bại: ${openaiErr.message}`);
                }
            }
        }

        // 3. Diagnose Stringee Webhook URL
        if (aiConfig?.stringeeSid && aiConfig?.stringeeSecret) {
            diagnostics.stringee.status = 'online';
            if (aiConfig.stringeeServerUrl) {
                const stringeeStart = Date.now();
                try {
                    const stringeeRes = await fetch(aiConfig.stringeeServerUrl, {
                        method: 'GET',
                        signal: AbortSignal.timeout(3000)
                    });
                    diagnostics.stringee.latency = Date.now() - stringeeStart;
                    if (stringeeRes.ok || stringeeRes.status === 404 || stringeeRes.status === 405) {
                        diagnostics.stringee.status = 'online';
                    } else {
                        diagnostics.stringee.status = 'offline';
                        diagnostics.stringee.error = `Server URL returned HTTP ${stringeeRes.status}`;
                    }
                } catch (strErr) {
                    diagnostics.stringee.status = 'offline';
                    diagnostics.stringee.error = strErr.message;
                }
            }
        }

        logger.info('system', 'Chẩn đoán sức khỏe hoàn tất.');
        res.json({ success: true, diagnostics });
    } catch (error) {
        logger.error('system', `Lỗi chạy chẩn đoán: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});


// -------------------------------------------------------------
// 2. SOCKET.IO EVENTS CONNECTION
// -------------------------------------------------------------
io.on('connection', (socket) => {
    console.log('Socket.io: Client mới đã kết nối. Socket ID:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('Socket.io: Client đã ngắt kết nối.');
    });
});

// Khởi động server
server.listen(PORT, () => {
    logger.info('system', '===================================================');
    logger.info('system', `Zalo Manager API Gateway chạy tại cổng ${PORT}`);
    logger.info('system', `Địa chỉ local: http://localhost:${PORT}`);
    logger.info('system', 'Lắng nghe sự kiện Real-time thông qua Web Socket.');
    logger.info('system', '===================================================');
    
    // Tự động khôi phục kết nối
    autoconnectAccounts();

    // Tự động lập lịch đồng bộ tài liệu online RAG
    startAutoSyncJob(knowledgeDb, aiSettingsDb);

    // Khởi tạo virtual call socket events đàm thoại thoại ảo
    handleVirtualCallSockets(io);
});
