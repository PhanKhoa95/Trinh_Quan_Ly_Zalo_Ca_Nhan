const memberNameCache = {};
const memberAvatarCache = {};
const groupNameCache = {};

/**
 * Lấy tên người gửi tin nhắn dựa trên UID từ Zalo API
 * @param {object} api Instance của Zalo API (zca-js)
 * @param {string} uid User ID của thành viên
 * @returns {Promise<string>} Tên hiển thị của thành viên hoặc mặc định
 */
async function getSenderName(api, uid) {
    if (!api) return 'Thành viên Zalo';
    if (memberNameCache[uid]) return memberNameCache[uid];
    try {
        const info = await api.getGroupMembersInfo([uid]);
        if (info && info.profiles && info.profiles[uid]) {
            const name = info.profiles[uid].displayName || info.profiles[uid].zaloName || 'Thành viên Zalo';
            memberNameCache[uid] = name;
            return name;
        }
    } catch (err) {
        console.warn('Không thể lấy tên thành viên:', err.message);
    }
    return 'Thành viên Zalo';
}

/**
 * Trích xuất số điện thoại Việt Nam từ văn bản thô
 * @param {string} text Văn bản chứa số điện thoại
 * @returns {string|null} Số điện thoại chuẩn hóa hoặc null
 */
function extractPhoneNumber(text) {
    if (typeof text !== 'string') return null;
    const phoneRegex = /(?:\+?84|0)(?:\s*[\.\-\(\)]?\s*\d){9,10}/g;
    const matches = text.match(phoneRegex);
    if (matches && matches.length > 0) {
        let raw = matches[0].replace(/[^\d+]/g, '');
        if (raw.startsWith('+84')) {
            return '0' + raw.substring(3);
        } else if (raw.startsWith('84')) {
            return '0' + raw.substring(2);
        }
        return raw;
    }
    return null;
}

/**
 * Lấy tên của nhóm chat dựa trên Group ID từ Zalo API
 * @param {object} api Instance của Zalo API (zca-js)
 * @param {string} groupId ID của nhóm chat
 * @returns {Promise<string>} Tên nhóm hoặc mặc định
 */
async function getGroupName(api, groupId) {
    if (!api) return 'Nhóm Zalo';
    if (groupNameCache[groupId]) return groupNameCache[groupId];
    try {
        const info = await api.getGroupInfo([groupId]);
        if (info && info.gridInfoMap && info.gridInfoMap[groupId]) {
            const name = info.gridInfoMap[groupId].name;
            groupNameCache[groupId] = name;
            return name;
        }
    } catch (err) {
        console.warn('Không thể lấy tên nhóm:', err.message);
    }
    return 'Nhóm Zalo';
}

/**
 * Lấy avatar của thành viên dựa trên UID từ Zalo API
 * @param {object} api Instance của Zalo API (zca-js)
 * @param {string} uid User ID của thành viên
 * @returns {Promise<string>} URL ảnh đại diện hoặc mặc định rỗng
 */
async function getSenderAvatar(api, uid) {
    if (!api) return '';
    if (memberAvatarCache[uid]) return memberAvatarCache[uid];
    try {
        const info = await api.getGroupMembersInfo([uid]);
        if (info && info.profiles && info.profiles[uid]) {
            const avatar = info.profiles[uid].avatar || info.profiles[uid].avatarUrl || '';
            memberAvatarCache[uid] = avatar;
            return avatar;
        }
    } catch (err) {
        console.warn('Không thể lấy avatar thành viên:', err.message);
    }
    return '';
}

module.exports = {
    getSenderName,
    getSenderAvatar,
    getGroupName,
    extractPhoneNumber,
    memberNameCache,
    memberAvatarCache,
    groupNameCache
};
