const fs = require('fs');
const path = require('path');

/**
 * Định nghĩa các API từ thư viện zca-js để AI có thể tự động gọi hàm (Function Calling).
 */
const ZCA_TOOLS_RAW = [
    {
        name: 'saveMemberMemory',
        desc: 'Ghi nhớ một thông tin hoặc sự kiện quan trọng về khách hàng hoặc thành viên nhóm để sử dụng cho các cuộc trò chuyện sau này (ví dụ: sở thích, nhu cầu mua hàng, phản hồi, lưu ý cá nhân)',
        params: {
            groupId: { type: 'string', desc: 'ID nhóm chat hiện tại', req: true },
            zaloId: { type: 'string', desc: 'ID người dùng cần ghi nhớ thông tin (uidFrom)', req: true },
            fact: { type: 'string', desc: 'Thông tin hoặc sự kiện cần ghi nhớ (ví dụ: "Thích mua hàng màu đỏ", "Hỏi giá sản phẩm CRM")', req: true },
            importance: { type: 'number', desc: 'Độ quan trọng từ 1 đến 5 (1 = thông tin thường, 5 = thông tin đặc biệt quan trọng)', req: false }
        }
    },
    {
        name: 'acceptFriendRequest',
        desc: 'Chấp nhận lời mời kết bạn từ người khác',
        params: {
            friendId: { type: 'string', desc: 'ID người gửi lời mời kết bạn', req: true }
        }
    },
    {
        name: 'addGroupBlockedMember',
        desc: 'Thêm người dùng vào danh sách chặn của nhóm chat',
        params: {
            memberId: { type: 'string', desc: 'ID người dùng cần chặn', req: true },
            groupId: { type: 'string', desc: 'ID nhóm chat', req: true }
        }
    },
    {
        name: 'addGroupDeputy',
        desc: 'Thêm phó nhóm chat',
        params: {
            memberId: { type: 'string', desc: 'ID người dùng được thăng làm phó nhóm', req: true },
            groupId: { type: 'string', desc: 'ID nhóm chat', req: true }
        }
    },
    {
        name: 'addQuickMessage',
        desc: 'Thêm tin nhắn nhanh',
        params: {
            addPayload: { type: 'object', desc: 'Thông tin tin nhắn nhanh cần thêm', req: true }
        }
    },
    {
        name: 'addReaction',
        desc: 'Thả cảm xúc vào tin nhắn',
        params: {
            icon: { type: 'string', desc: 'Icon cảm xúc (ví dụ: heart, like, hahah, wow, sad, angry)', req: true },
            msgId: { type: 'string', desc: 'ID tin nhắn để thả cảm xúc', req: true },
            cliMsgId: { type: 'string', desc: 'Client ID tin nhắn để thả cảm xúc', req: true },
            threadId: { type: 'string', desc: 'ID cuộc trò chuyện', req: true }
        }
    },
    {
        name: 'addUnreadMark',
        desc: 'Đánh dấu đoạn chat là chưa đọc',
        params: {
            threadId: { type: 'string', desc: 'ID đoạn chat', req: true },
            type: { type: 'number', desc: 'Kiểu đoạn chat (0 = Cá nhân, 1 = Nhóm)', req: false }
        }
    },
    {
        name: 'addUserToGroup',
        desc: 'Thêm trực tiếp người dùng vào nhóm chat',
        params: {
            memberId: { type: 'string', desc: 'ID người dùng cần thêm', req: true },
            groupId: { type: 'string', desc: 'ID nhóm chat', req: true }
        }
    },
    {
        name: 'blockUser',
        desc: 'Chặn người dùng',
        params: {
            userId: { type: 'string', desc: 'ID người dùng cần chặn', req: true }
        }
    },
    {
        name: 'blockViewFeed',
        desc: 'Chặn người dùng xem bài đăng nhật ký của mình',
        params: {
            isBlockFeed: { type: 'boolean', desc: 'true để chặn, false để bỏ chặn', req: true },
            userId: { type: 'string', desc: 'ID người dùng', req: true }
        }
    },
    {
        name: 'changeAccountAvatar',
        desc: 'Thay đổi ảnh đại diện tài khoản hiện tại',
        params: {
            avatarSource: { type: 'object', desc: 'Nguồn ảnh đại diện mới', req: true }
        }
    },
    {
        name: 'changeFriendAlias',
        desc: 'Cập nhật tên gợi nhớ cho bạn bè',
        params: {
            alias: { type: 'string', desc: 'Tên gợi nhớ mới', req: true },
            friendId: { type: 'string', desc: 'ID bạn bè', req: true }
        }
    },
    {
        name: 'changeGroupAvatar',
        desc: 'Cập nhật ảnh đại diện nhóm',
        params: {
            avatarSource: { type: 'object', desc: 'Nguồn ảnh nhóm mới', req: true },
            groupId: { type: 'string', desc: 'ID nhóm chat', req: true }
        }
    },
    {
        name: 'changeGroupName',
        desc: 'Cập nhật tên nhóm chat',
        params: {
            name: { type: 'string', desc: 'Tên nhóm mới', req: true },
            groupId: { type: 'string', desc: 'ID nhóm chat', req: true }
        }
    },
    {
        name: 'changeGroupOwner',
        desc: 'Chuyển nhượng quyền trưởng nhóm cho thành viên khác',
        params: {
            memberId: { type: 'string', desc: 'ID trưởng nhóm mới', req: true },
            groupId: { type: 'string', desc: 'ID nhóm chat', req: true }
        }
    },
    {
        name: 'createAutoReply',
        desc: 'Thêm cấu hình tự động trả lời (dành cho zBusiness)',
        params: {
            payload: { type: 'object', desc: 'Nội dung cấu hình trả lời tự động', req: true }
        }
    },
    {
        name: 'createCatalog',
        desc: 'Thêm danh mục sản phẩm (dành cho zBusiness)',
        params: {
            catalogName: { type: 'string', desc: 'Tên danh mục mới', req: true }
        }
    },
    {
        name: 'createGroup',
        desc: 'Tạo nhóm chat mới',
        params: {
            options: { type: 'object', desc: 'Thông số tạo nhóm (ví dụ: { name: string, members: string[] })', req: true }
        }
    },
    {
        name: 'createNote',
        desc: 'Tạo bảng tin hoặc ghim ghi chú trong nhóm chat',
        params: {
            title: { type: 'string', desc: 'Nội dung tiêu đề bảng tin/ghi chú', req: true },
            pinAct: { type: 'boolean', desc: 'true để ghim lên đầu nhóm chat, false để không ghim', req: false },
            groupId: { type: 'string', desc: 'ID nhóm chat', req: true }
        }
    },
    {
        name: 'createPoll',
        desc: 'Tạo cuộc bầu chọn/khảo sát ý kiến trong nhóm chat',
        params: {
            question: { type: 'string', desc: 'Câu hỏi khảo sát/bình chọn', req: true },
            options: { type: 'array', items: { type: 'string' }, desc: 'Danh sách các phương án lựa chọn', req: true },
            groupId: { type: 'string', desc: 'ID nhóm chat', req: true }
        }
    },
    {
        name: 'createProductCatalog',
        desc: 'Tạo liên kết sản phẩm trong danh mục',
        params: {
            payload: { type: 'object', desc: 'Thông số sản phẩm', req: true }
        }
    },
    {
        name: 'createReminder',
        desc: 'Tạo lịch nhắc hẹn trong nhóm hoặc cá nhân',
        params: {
            title: { type: 'string', desc: 'Nội dung tiêu đề nhắc hẹn', req: true },
            startTime: { type: 'number', desc: 'Thời gian bắt đầu (Unix timestamp dạng mili giây, ví dụ: Date.now() + 3600000)', req: false },
            threadId: { type: 'string', desc: 'ID cuộc trò chuyện (groupId hoặc userId)', req: true },
            type: { type: 'number', desc: 'Kiểu cuộc trò chuyện (0 = Cá nhân, 1 = Nhóm)', req: false }
        }
    },
    {
        name: 'deleteAutoReply',
        desc: 'Xóa cấu hình tự động trả lời',
        params: {
            id: { type: 'string', desc: 'ID cấu hình tự động trả lời cần xóa', req: true }
        }
    },
    {
        name: 'deleteAvatar',
        desc: 'Xóa ảnh đại diện nhóm hoặc tài khoản',
        params: {
            photoId: { type: 'string', desc: 'ID ảnh đại diện cần xóa', req: true }
        }
    },
    {
        name: 'deleteCatalog',
        desc: 'Xóa danh mục sản phẩm',
        params: {
            catalogId: { type: 'string', desc: 'ID danh mục cần xóa', req: true }
        }
    },
    {
        name: 'deleteChat',
        desc: 'Xóa tin nhắn cuối cùng hoặc toàn bộ cuộc trò chuyện',
        params: {
            lastMessage: { type: 'object', desc: 'Thông tin tin nhắn cuối cùng', req: true },
            threadId: { type: 'string', desc: 'ID đoạn chat', req: true },
            type: { type: 'number', desc: 'Kiểu cuộc trò chuyện', req: false }
        }
    },
    {
        name: 'deleteMessage',
        desc: 'Thu hồi tin nhắn đã gửi (Recall message)',
        params: {
            cliMsgId: { type: 'string', desc: 'Client ID tin nhắn cần thu hồi', req: true },
            msgId: { type: 'string', desc: 'ID tin nhắn của hệ thống cần thu hồi', req: true },
            uidFrom: { type: 'string', desc: 'ID người gửi tin nhắn cần thu hồi', req: true },
            threadId: { type: 'string', desc: 'ID cuộc trò chuyện chứa tin nhắn', req: true },
            type: { type: 'number', desc: 'Kiểu cuộc trò chuyện', req: false },
            onlyMe: { type: 'boolean', desc: 'Chỉ xóa phía tôi (true/false)', req: false }
        }
    }
];

function convertToOpenAITools(rawTools) {
    return rawTools.map(t => ({
        type: 'function',
        function: {
            name: t.name,
            description: t.desc,
            parameters: {
                type: 'object',
                properties: Object.keys(t.params || {}).reduce((acc, k) => {
                    acc[k] = {
                        type: t.params[k].type,
                        description: t.params[k].desc
                    };
                    if (t.params[k].type === 'array') {
                        acc[k].items = t.params[k].items || { type: 'string' };
                    }
                    return acc;
                }, {}),
                required: Object.keys(t.params || {}).filter(k => t.params[k].req)
            }
        }
    }));
}

function convertToGeminiTools(rawTools) {
    const declarations = rawTools.map(t => ({
        name: t.name,
        description: t.desc,
        parameters: {
            type: 'OBJECT',
            properties: Object.keys(t.params || {}).reduce((acc, k) => {
                acc[k] = {
                    type: t.params[k].type.toUpperCase(),
                    description: t.params[k].desc
                };
                if (t.params[k].type === 'array') {
                    const subType = t.params[k].items && t.params[k].items.type || 'string';
                    acc[k].items = {
                        type: subType.toUpperCase()
                    };
                }
                return acc;
            }, {}),
            required: Object.keys(t.params || {}).filter(k => t.params[k].req)
        }
    }));
    return [{ functionDeclarations: declarations }];
}

const openAITools = convertToOpenAITools(ZCA_TOOLS_RAW);
const geminiTools = convertToGeminiTools(ZCA_TOOLS_RAW);

/**
 * Thực thi các lệnh API Zalo thực tế dựa trên yêu cầu gọi hàm của AI
 */
async function executeZaloApi(apiInstance, functionName, args) {
    try {
        const result = await _executeZaloApiInternal(apiInstance, functionName, args);
        if (result && result.success === false) {
            incrementToolStat(functionName, false);
        } else {
            incrementToolStat(functionName, true);
        }
        return result;
    } catch (err) {
        incrementToolStat(functionName, false);
        throw err;
    }
}

async function _executeZaloApiInternal(apiInstance, functionName, args) {
    if (functionName === 'saveMemberMemory') {
        console.log(`[AI Long-Term Memory] AI tool called 'saveMemberMemory' with args:`, JSON.stringify(args));
        try {
            const { prisma } = require('./database');
            const groupId = args.groupId;
            const zaloId = args.zaloId;
            const fact = args.fact;
            const importance = args.importance ? parseInt(args.importance) : 3;

            // Đảm bảo hồ sơ thành viên tồn tại trước
            const memberId = `${groupId}-${zaloId}`;
            await prisma.member.upsert({
                where: { id: memberId },
                update: {},
                create: {
                    id: memberId,
                    groupId,
                    zaloId,
                    name: `Thành viên ${zaloId.substring(0, 6)}`,
                    vipStatus: 'normal'
                }
            });

            const newMemory = await prisma.memberMemory.create({
                data: {
                    groupId,
                    zaloId,
                    fact,
                    importance
                }
            });
            return { success: true, message: `Đã ghi nhớ thông tin thành công: "${fact}"`, data: newMemory };
        } catch (dbErr) {
            console.error('Lỗi lưu bộ nhớ thành viên từ AI tool:', dbErr.message);
            return { success: false, error: dbErr.message };
        }
    }

    if (!apiInstance) {
        throw new Error("API instance is not available (offline/simulation).");
    }

    let actualName = functionName;
    if (functionName === 'getFriendRequest') actualName = 'getSentFriendRequest';
    else if (functionName === 'getHiddenConversPin') actualName = 'getHiddenConversations';
    else if (functionName === 'getQuickMessage') actualName = 'getQuickMessageList';
    else if (functionName === 'hideConversation') actualName = 'setHiddenConversations';
    else if (functionName === 'pinConversations') actualName = 'setPinnedConversations';

    const method = apiInstance[actualName];
    if (typeof method !== 'function') {
        throw new Error(`API method '${functionName}' is not supported or not implemented in this version of zca-js.`);
    }

    console.log(`[Zalo Client Wrapper] Calling api method '${actualName}' with args:`, JSON.stringify(args));

    switch (actualName) {
        case 'acceptFriendRequest':
            return await method(args.friendId || args.userId);
        case 'addGroupBlockedMember':
        case 'addGroupDeputy':
        case 'addUserToGroup':
        case 'removeGroupBlockedMember':
        case 'removeGroupDeputy':
        case 'removeUserFromGroup':
            return await method(args.memberId || args.userId, args.groupId);
        case 'addPollOptions':
            return await method(args.payload || args);
        case 'addQuickMessage':
            return await method(args.addPayload || args);
        case 'addReaction':
            return await method(args.icon, args.dest || { data: { msgId: args.msgId, cliMsgId: args.cliMsgId }, threadId: args.threadId, type: args.type || 1 });
        case 'addUnreadMark':
        case 'removeUnreadMark':
            return await method(args.threadId, args.type);
        case 'blockUser':
        case 'unblockUser':
        case 'undoFriendRequest':
        case 'removeFriend':
        case 'removeFriendAlias':
            return await method(args.userId || args.friendId);
        case 'blockViewFeed':
            return await method(args.isBlockFeed, args.userId);
        case 'changeAccountAvatar':
            return await method(args.avatarSource);
        case 'changeFriendAlias':
            return await method(args.alias, args.friendId || args.userId);
        case 'changeGroupAvatar':
            return await method(args.avatarSource, args.groupId);
        case 'changeGroupName':
            return await method(args.name, args.groupId);
        case 'changeGroupOwner':
            return await method(args.memberId || args.newOwnerId, args.groupId);
        case 'createAutoReply':
            return await method(args.payload || args);
        case 'createCatalog':
            return await method(args.catalogName);
        case 'createGroup':
            return await method(args.options || args);
        case 'createNote':
        case 'editNote': {
            const title = args.title || (args.options && args.options.title) || '';
            const pinAct = args.pinAct !== undefined ? args.pinAct : (args.options && args.options.pinAct) !== undefined ? args.options.pinAct : true;
            const groupId = args.groupId || args.threadId;
            return await method({ title, pinAct }, groupId);
        }
        case 'createPoll': {
            const question = args.question || (args.options && args.options.question) || '';
            let pollOptions = args.options || (args.options && args.options.options) || (args.options && args.options.optionsArray) || args.optionsArray || [];
            if (typeof pollOptions === 'string') {
                try {
                    pollOptions = JSON.parse(pollOptions);
                } catch (e) {
                    pollOptions = pollOptions.split(',').map(o => o.trim());
                }
            }
            const groupId = args.groupId || args.threadId;
            return await method({ question, options: pollOptions }, groupId);
        }
        case 'createProductCatalog':
            return await method(args.payload || args);
        case 'createReminder':
        case 'editReminder': {
            const title = args.title || (args.options && args.options.title) || '';
            const startTime = args.startTime || (args.options && args.options.startTime) || (Date.now() + 60 * 60 * 1000);
            const emoji = args.emoji || (args.options && args.options.emoji) || '⏰';
            const repeat = args.repeat || (args.options && args.options.repeat) || 0;
            const type = args.type !== undefined ? args.type : 1;
            const threadId = args.threadId || args.groupId;
            return await method({ title, startTime, emoji, repeat }, threadId, type);
        }
        case 'deleteAutoReply':
            return await method(args.id);
        case 'deleteAvatar':
            return await method(args.photoId);
        case 'deleteCatalog':
            return await method(args.catalogId);
        case 'deleteChat':
            return await method(args.lastMessage || { msgId: args.msgId, cliMsgId: args.cliMsgId, uidFrom: args.uidFrom, ts: args.ts }, args.threadId, args.type);
        case 'deleteMessage':
            return await method(args.dest || { data: { cliMsgId: args.cliMsgId, msgId: args.msgId, uidFrom: args.uidFrom }, threadId: args.threadId, type: args.type || 1 }, args.onlyMe);
        case 'deleteProductCatalog':
            return await method(args.payload || args);
        case 'disableGroupLink':
        case 'disperseGroup':
        case 'enableGroupLink':
        case 'getGroupLinkDetail':
        case 'getPendingGroupMembers':
        case 'leaveGroup':
        case 'upgradeGroupToCommunity':
            return await method(args.groupId, args.silent);
        case 'fetchAccountInfo':
        case 'getAllFriends':
        case 'getAllGroups':
        case 'getArchivedChatList':
        case 'getAutoDeleteChat':
        case 'getAutoReplyList':
        case 'getAvatarList':
        case 'getCloseFriends':
        case 'getContext':
        case 'getCookie':
        case 'getFriendOnlines':
        case 'getFriendRecommendations':
        case 'getHiddenConversations':
        case 'getLabels':
        case 'getAliasList':
        case 'getMute':
        case 'getOwnId':
        case 'getPinConversations':
        case 'getQuickMessageList':
        case 'getUnreadMark':
        case 'resetHiddenConversPin':
            return await method(args.count, args.page, args.avatarSize);
        case 'findUser':
        case 'findUserByUsername':
            return await method(args.phoneNumber || args.phone || args.username, args.avatarSize);
        case 'forwardMessage':
            return await method(args.payload || args, args.threadIds, args.type);
        case 'getAvatarUrlProfile':
        case 'getGroupMembersInfo':
        case 'getQR':
        case 'getRelatedFriendGroup':
        case 'getUserInfo':
            return await method(args.friendIds || args.memberIds || args.userIds || args.userId || args.memberId, args.avatarSize);
        case 'getBizAccount':
        case 'getFriendRequestStatus':
        case 'getFullAvatar':
        case 'lastOnline':
            return await method(args.friendId || args.userId || args.uid);
        case 'getGroupBlockedMember':
            return await method(args.payload || args, args.groupId);
        case 'getGroupChatHistory':
            return await method(args.groupId, args.count);
        case 'getGroupInfo':
            return await method(args.groupId || args.groupIds);
        case 'getGroupInviteBoxInfo':
            return await method(args.payload || args);
        case 'getGroupInviteBoxList':
            return await method(args.payload || args);
        case 'getGroupLinkInfo':
            return await method(args.payload || args);
        case 'getListBoard':
            return await method(args.options || { page: args.page, count: args.count }, args.groupId);
        case 'getListReminder':
            return await method(args.options || { page: args.page, count: args.count }, args.threadId, args.type);
        case 'getMultiUsersByPhones':
            return await method(args.phoneNumbers, args.avatarSize);
        case 'getPollDetail':
        case 'lockPoll':
        case 'sharePoll':
            return await method(args.pollId);
        case 'getProductCatalogList':
            return await method(args.payload || args);
        case 'getReminder':
        case 'getReminderResponses':
            return await method(args.reminderId);
        case 'getSentFriendRequest':
        case 'keepAlive':
            return await method();
        case 'getStickerCategoryDetail':
            return await method(args.cateId);
        case 'getStickers':
            return await method(args.keyword);
        case 'getStickersDetail':
            return await method(args.stickerIds);
        case 'inviteUserToGroups':
            return await method(args.userId, args.groupId || args.groupIds);
        case 'joinGroupInviteBox':
            return await method(args.groupId);
        case 'joinGroupLink':
        case 'parseLink':
            return await method(args.link);
        case 'rejectFriendRequest':
            return await method(args.friendId);
        case 'removeReminder':
            return await method(args.reminderId, args.threadId, args.type);
        case 'removeQuickMessage':
            return await method(args.itemIds || args.itemId);
        case 'reviewPendingMemberRequest':
            return await method(args.payload || { members: args.members, isApprove: args.isApprove }, args.groupId);
        case 'searchSticker':
            return await method(args.keyword, args.limit);
        case 'sendBankCard':
            return await method(args.payload || args, args.threadId, args.type);
        case 'sendCard':
            return await method(args.options || args, args.threadId, args.type);
        case 'sendDeliveredEvent':
            return await method(args.isSeen, args.messages, args.type);
        case 'sendFriendRequest':
            return await method(args.msg, args.userId);
        case 'sendLink':
            return await method(args.options || args, args.threadId, args.type);
        case 'sendMessage':
            return await method(args.message || args.text, args.threadId, args.type);
        case 'sendReport':
            return await method(args.options || args, args.threadId, args.type);
        case 'sendSeenEvent':
            return await method(args.messages, args.type);
        case 'sendSticker':
            return await method(args.sticker, args.threadId, args.type);
        case 'sendTypingEvent':
            return await method(args.threadId, args.type, args.destType);
        case 'sendVideo':
            return await method(args.options || args, args.threadId, args.type);
        case 'sendVoice':
            return await method(args.options || args, args.threadId, args.type);
        case 'setHiddenConversations':
        case 'setPinnedConversations':
            return await method(args.hidden !== undefined ? args.hidden : args.pinned, args.threadId, args.type);
        case 'setMute':
            return await method(args.params, args.threadId || args.threadID, args.type);
        case 'updateActiveStatus':
            return await method(args.active);
        case 'updateArchivedChatList':
            return await method(args.isArchived, args.conversations);
        case 'updateAutoDeleteChat':
            return await method(args.ttl, args.threadId, args.type);
        case 'updateAutoReply':
        case 'updateCatalog':
        case 'updateProductCatalog':
        case 'updateProfile':
            return await method(args.payload || args);
        case 'updateGroupSettings':
            return await method(args.options || args, args.groupId);
        case 'updateHiddenConversPin':
            return await method(args.pin);
        case 'updateLabels':
            return await method(args.payload || args);
        case 'updateLang':
            return await method(args.language);
        case 'updateProfileBio':
            return await method(args.status);
        case 'updateQuickMessage':
            return await method(args.updatePayload || args, args.itemId);
        case 'updateSettings':
            return await method(args.type, args.value);
        case 'uploadAttachment':
            return await method(args.sources, args.threadId, args.type);
        case 'uploadProductPhoto':
            return await method(args.payload || args);
        case 'votePoll':
            return await method(args.pollId, args.optionId);
        case 'undo':
            return await method(args.payload || { msgId: args.msgId, cliMsgId: args.cliMsgId }, args.threadId, args.type);
        case 'custom':
            return await method(args.name, args.callback);
        default:
            throw new Error(`Unhandled API method mapping for '${actualName}'`);
    }
}

const CONFIG_FILE = path.join(__dirname, 'data/ai-tools-config.json');
const STATS_FILE = path.join(__dirname, 'data/ai-tools-stats.json');

function getEnabledTools() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Lỗi khi đọc cấu hình tools:', e.message);
    }
    // Cấu hình mặc định: trống (bật tất cả)
    return {};
}

function saveEnabledTools(config) {
    try {
        const dir = path.dirname(CONFIG_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('Lỗi khi lưu cấu hình tools:', e.message);
        return false;
    }
}

function getToolStats() {
    try {
        if (fs.existsSync(STATS_FILE)) {
            return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Lỗi khi đọc thống kê tools:', e.message);
    }
    return {};
}

function saveToolStats(stats) {
    try {
        const dir = path.dirname(STATS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('Lỗi khi lưu thống kê tools:', e.message);
        return false;
    }
}

function incrementToolStat(toolId, isSuccess) {
    try {
        const stats = getToolStats();
        if (!stats[toolId]) {
            stats[toolId] = { successes: 0, errors: 0 };
        }
        if (isSuccess) {
            stats[toolId].successes++;
        } else {
            stats[toolId].errors++;
        }
        saveToolStats(stats);
        
        // Phát sự kiện cập nhật thống kê thời gian thực qua socket
        if (global.io) {
            global.io.emit('ai.tools.stats.updated', { toolId, stats: stats[toolId] });
        }
    } catch (e) {
        console.error('Lỗi khi cập nhật thống kê tool:', e.message);
    }
}

module.exports = {
    ZCA_TOOLS_RAW,
    convertToOpenAITools,
    convertToGeminiTools,
    openAITools,
    geminiTools,
    executeZaloApi,
    getEnabledTools,
    saveEnabledTools,
    getToolStats,
    incrementToolStat
};
