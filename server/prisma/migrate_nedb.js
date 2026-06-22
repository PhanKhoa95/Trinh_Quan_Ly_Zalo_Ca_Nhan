const { PrismaClient } = require('@prisma/client');
const Datastore = require('nedb-promises');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();
const dataDir = path.join(__dirname, '../data');

async function migrate() {
    console.log('--- BẮT ĐẦU MIGRATION DỮ LIỆU TỪ NEDB SANG SQLITE ---');

    // 1. Di chuyển Sessions
    try {
        const sessionsDbFile = path.join(dataDir, 'sessions.db');
        if (fs.existsSync(sessionsDbFile)) {
            const db = Datastore.create({ filename: sessionsDbFile, autoload: true });
            const docs = await db.find({});
            console.log(`Đang migrate ${docs.length} sessions...`);
            for (const doc of docs) {
                // Tránh lỗi trùng lặp số điện thoại
                await prisma.session.upsert({
                    where: { phone: doc.phone },
                    update: {
                        name: doc.name,
                        avatar: doc.avatar,
                        sessionFile: doc.sessionFile,
                        groupsCount: doc.groupsCount || 0,
                        msgsSent: doc.msgsSent || 0,
                    },
                    create: {
                        id: doc.id || `acc-${Date.now()}`,
                        name: doc.name,
                        phone: doc.phone,
                        avatar: doc.avatar,
                        sessionFile: doc.sessionFile,
                        groupsCount: doc.groupsCount || 0,
                        msgsSent: doc.msgsSent || 0,
                        createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date()
                    }
                });
            }
            console.log('Migrate sessions thành công.');
        }
    } catch (err) {
        console.error('Lỗi khi migrate sessions:', err.message);
    }

    // 2. Di chuyển Rules
    try {
        const rulesDbFile = path.join(dataDir, 'rules.db');
        if (fs.existsSync(rulesDbFile)) {
            const db = Datastore.create({ filename: rulesDbFile, autoload: true });
            const docs = await db.find({});
            console.log(`Đang migrate ${docs.length} rules...`);
            for (const doc of docs) {
                await prisma.rule.create({
                    data: {
                        id: doc.id || doc._id,
                        keywords: JSON.stringify(doc.keywords || []),
                        matchType: doc.matchType || 'contains',
                        reply: doc.reply,
                        active: doc.active !== false,
                        createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date()
                    }
                });
            }
            console.log('Migrate rules thành công.');
        }
    } catch (err) {
        console.error('Lỗi khi migrate rules:', err.message);
    }

    // 3. Di chuyển Campaigns
    try {
        const campaignsDbFile = path.join(dataDir, 'campaigns.db');
        if (fs.existsSync(campaignsDbFile)) {
            const db = Datastore.create({ filename: campaignsDbFile, autoload: true });
            const docs = await db.find({});
            console.log(`Đang migrate ${docs.length} campaigns...`);
            for (const doc of docs) {
                await prisma.campaign.create({
                    data: {
                        id: doc.id || doc._id,
                        accountId: doc.accountId,
                        targets: JSON.stringify(doc.targets || []),
                        message: doc.message,
                        delay: doc.delay || 5,
                        scheduledTime: doc.scheduledTime ? String(doc.scheduledTime) : null,
                        progress: doc.progress || 0,
                        status: doc.status || 'pending',
                        createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date()
                    }
                });
            }
            console.log('Migrate campaigns thành công.');
        }
    } catch (err) {
        console.error('Lỗi khi migrate campaigns:', err.message);
    }

    // 4. Di chuyển Group Settings
    try {
        const settingsDbFile = path.join(dataDir, 'group_settings.db');
        if (fs.existsSync(settingsDbFile)) {
            const db = Datastore.create({ filename: settingsDbFile, autoload: true });
            const docs = await db.find({});
            console.log(`Đang migrate ${docs.length} group settings...`);
            for (const doc of docs) {
                await prisma.groupSetting.upsert({
                    where: { groupId: doc.groupId },
                    update: {
                        lockName: doc.lockName || false,
                        lockDesc: doc.lockDesc || false,
                        approveMembers: doc.approveMembers || false,
                        allowLink: doc.allowLink !== false,
                        groupPurpose: doc.groupPurpose || null
                    },
                    create: {
                        groupId: doc.groupId,
                        lockName: doc.lockName || false,
                        lockDesc: doc.lockDesc || false,
                        approveMembers: doc.approveMembers || false,
                        allowLink: doc.allowLink !== false,
                        groupPurpose: doc.groupPurpose || null,
                        updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : new Date()
                    }
                });
            }
            console.log('Migrate group settings thành công.');
        }
    } catch (err) {
        console.error('Lỗi khi migrate group settings:', err.message);
    }

    // 5. Di chuyển AI Settings
    try {
        const aiSettingsDbFile = path.join(dataDir, 'ai_settings.db');
        if (fs.existsSync(aiSettingsDbFile)) {
            const db = Datastore.create({ filename: aiSettingsDbFile, autoload: true });
            const docs = await db.find({});
            console.log(`Đang migrate ${docs.length} AI configurations...`);
            for (const doc of docs) {
                await prisma.aiSetting.upsert({
                    where: { id: 'default' },
                    update: {
                        aiEnabled: doc.aiEnabled || false,
                        aiProvider: doc.aiProvider || 'openai',
                        aiModel: doc.aiModel || 'gpt-4o-mini',
                        aiApiKey: doc.aiApiKey || '',
                        aiSystemPrompt: doc.aiSystemPrompt || 'Bạn là một trợ lý AI hữu ích trong nhóm chat Zalo.',
                        aiTriggerPrefix: doc.aiTriggerPrefix || '@bot',
                        aiMode: doc.aiMode || 'prefix',
                        aiGroups: JSON.stringify(doc.aiGroups || []),
                        ragTopK: doc.ragTopK || 3,
                        ragScoreThreshold: doc.ragScoreThreshold || 0.6,
                        ragSearchMode: doc.ragSearchMode || 'hybrid',
                        stringeeSid: doc.stringeeSid || '',
                        stringeeSecret: doc.stringeeSecret || '',
                        stringeeHotline: doc.stringeeHotline || '',
                        stringeeServerUrl: doc.stringeeServerUrl || ''
                    },
                    create: {
                        id: 'default',
                        aiEnabled: doc.aiEnabled || false,
                        aiProvider: doc.aiProvider || 'openai',
                        aiModel: doc.aiModel || 'gpt-4o-mini',
                        aiApiKey: doc.aiApiKey || '',
                        aiSystemPrompt: doc.aiSystemPrompt || 'Bạn là một trợ lý AI hữu ích trong nhóm chat Zalo.',
                        aiTriggerPrefix: doc.aiTriggerPrefix || '@bot',
                        aiMode: doc.aiMode || 'prefix',
                        aiGroups: JSON.stringify(doc.aiGroups || []),
                        ragTopK: doc.ragTopK || 3,
                        ragScoreThreshold: doc.ragScoreThreshold || 0.6,
                        ragSearchMode: doc.ragSearchMode || 'hybrid',
                        stringeeSid: doc.stringeeSid || '',
                        stringeeSecret: doc.stringeeSecret || '',
                        stringeeHotline: doc.stringeeHotline || '',
                        stringeeServerUrl: doc.stringeeServerUrl || '',
                        updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : new Date()
                    }
                });
            }
            console.log('Migrate AI settings thành công.');
        }
    } catch (err) {
        console.error('Lỗi khi migrate AI settings:', err.message);
    }

    // 6. Di chuyển Calls
    try {
        const callsDbFile = path.join(dataDir, 'calls.db');
        if (fs.existsSync(callsDbFile)) {
            const db = Datastore.create({ filename: callsDbFile, autoload: true });
            const docs = await db.find({});
            console.log(`Đang migrate ${docs.length} calls...`);
            for (const doc of docs) {
                // Tránh lỗi trùng stringeeCallId
                const callId = doc.stringeeCallId || `call-${Date.now()}-${Math.random()}`;
                const existing = await prisma.call.findUnique({ where: { stringeeCallId: callId } });
                if (!existing) {
                    await prisma.call.create({
                        data: {
                            id: doc.id || doc._id,
                            stringeeCallId: callId,
                            phoneNumber: doc.phoneNumber,
                            clientName: doc.clientName || 'Khách hàng',
                            direction: doc.direction || 'outbound',
                            status: doc.status || 'completed',
                            duration: doc.duration || 0,
                            transcript: JSON.stringify(doc.transcript || []),
                            recordingUrl: doc.recordingUrl || null,
                            createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date()
                        }
                    });
                }
            }
            console.log('Migrate calls thành công.');
        }
    } catch (err) {
        console.error('Lỗi khi migrate calls:', err.message);
    }

    // 7. Di chuyển Knowledge
    try {
        const knowledgeDbFile = path.join(dataDir, 'knowledge.db');
        if (fs.existsSync(knowledgeDbFile)) {
            const db = Datastore.create({ filename: knowledgeDbFile, autoload: true });
            const docs = await db.find({});
            console.log(`Đang migrate ${docs.length} knowledge entries...`);
            for (const doc of docs) {
                await prisma.knowledge.create({
                    data: {
                        id: doc.id || doc._id || `know-${Date.now()}-${Math.random()}`,
                        title: doc.title || 'Không tiêu đề',
                        content: doc.content || '',
                        sourceType: doc.sourceType || 'manual',
                        sourceUrl: doc.sourceUrl || null,
                        syncInterval: doc.syncInterval || 1440,
                        lastSyncedAt: doc.lastSyncedAt ? new Date(doc.lastSyncedAt) : null,
                        syncStatus: doc.syncStatus || 'synced',
                        active: doc.active !== false,
                        chunks: JSON.stringify(doc.chunks || []),
                        charCount: doc.charCount || 0,
                        chunkCount: doc.chunkCount || 0,
                        createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date()
                    }
                });
            }
            console.log('Migrate knowledge thành công.');
        }
    } catch (err) {
        console.error('Lỗi khi migrate knowledge:', err.message);
    }

    // 8. Di chuyển messages.json & trích xuất Members
    try {
        const messagesJsonFile = path.join(dataDir, 'messages.json');
        if (fs.existsSync(messagesJsonFile)) {
            const rawData = fs.readFileSync(messagesJsonFile, 'utf8');
            const messagesMap = JSON.parse(rawData);
            
            let messageCount = 0;
            let memberCount = 0;

            console.log('Đang migrate tin nhắn từ messages.json và trích xuất thành viên...');
            for (const groupId of Object.keys(messagesMap)) {
                const msgs = messagesMap[groupId];
                if (Array.isArray(msgs)) {
                    for (const msg of msgs) {
                        // Trích xuất hoặc lưu Member nếu không phải chính bot gửi
                        let sName = 'Thành viên';
                        const isSelf = msg.isSelf === true || String(msg.senderId) === '43153540738954919';
                        
                        if (!isSelf && msg.senderId) {
                            const rawContent = typeof msg.content === 'string' ? msg.content : '';
                            
                            // Trích xuất tên trước dấu hai chấm nếu có (ví dụ "Thái Mỹ: alo bot")
                            const match = rawContent.match(/^([^:]+):\s*(.*)$/);
                            if (match && match[1] && match[1].length < 30) {
                                sName = match[1].trim();
                            } else {
                                sName = `Thành viên ${msg.senderId.substring(0, 6)}`;
                            }

                            // Tạo hoặc cập nhật Member
                            const memberId = `${groupId}-${msg.senderId}`;
                            await prisma.member.upsert({
                                where: { id: memberId },
                                update: { name: sName },
                                create: {
                                    id: memberId,
                                    groupId: groupId,
                                    zaloId: msg.senderId,
                                    name: sName,
                                    vipStatus: 'normal'
                                }
                            });
                            memberCount++;
                        } else if (isSelf) {
                            sName = 'Trợ lý AI';
                        }

                        // Định dạng content văn bản
                        let txtContent = '';
                        if (typeof msg.content === 'object' && msg.content !== null) {
                            txtContent = JSON.stringify(msg.content);
                        } else {
                            txtContent = String(msg.content || '');
                        }

                        // Lưu Message
                        const msgId = msg.id || `msg-${Date.now()}-${Math.random()}`;
                        const existingMsg = await prisma.message.findUnique({ where: { id: msgId } });
                        if (!existingMsg) {
                            await prisma.message.create({
                                data: {
                                    id: msgId,
                                    groupId: groupId,
                                    senderId: String(msg.senderId || 'unknown'),
                                    senderName: sName,
                                    content: txtContent,
                                    msgType: msg.msgType || 'chat.text',
                                    isSelf: isSelf,
                                    timestamp: BigInt(msg.timestamp || Date.now()),
                                    createdAt: msg.timestamp ? new Date(msg.timestamp) : new Date()
                                }
                            });
                            messageCount++;
                        }
                    }
                }
            }
            console.log(`Migrate messages.json thành công. Đã nhập ${messageCount} tin nhắn và khởi tạo ${memberCount} hồ sơ thành viên.`);
        }
    } catch (err) {
        console.error('Lỗi khi migrate messages.json:', err.message);
    }

    console.log('--- DI CHUYỂN DỮ LIỆU HOÀN THÀNH ---');
    await prisma.$disconnect();
}

migrate().catch(async (e) => {
    console.error('Lỗi trong tiến trình migration:', e);
    await prisma.$disconnect();
    process.exit(1);
});
