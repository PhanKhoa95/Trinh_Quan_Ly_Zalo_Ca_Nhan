const { getGroupName } = require('./helpers');
const { askAI } = require('./ai-service');

/**
 * Phân tích hội thoại ngầm để trích xuất & cập nhật bộ nhớ dài hạn AI
 */
async function analyzeAndSaveMemory(groupId, zaloId, senderName, recentHistory, aiConfig, avatarUrl = null) {
    try {
        const { prisma } = require('./database');
        
        // Chỉ phân tích nếu AI hoạt động và có API key
        if (!aiConfig || !aiConfig.aiApiKey || !aiConfig.aiEnabled) return;

        // Trích xuất tối đa 4 lượt thoại gần nhất để làm bối cảnh phân tích
        const recentTurns = recentHistory.slice(-4);
        if (recentTurns.length === 0) return;

        const conversationSlice = recentTurns.map(m => {
            const speaker = m.role === 'assistant' ? 'Trợ lý AI' : senderName;
            return `${speaker}: ${m.content}`;
        }).join('\n');

        const prompt = `Dưới đây là hội thoại gần nhất:\n${conversationSlice}\n\nNhiệm vụ: Hãy xem khách hàng/thành viên "${senderName}" (Zalo ID: ${zaloId}) có cung cấp thông tin cá nhân mới nào cần ghi nhớ (như sở thích, SĐT, email, nhu cầu mua hàng, phản hồi, ghi chú đặc biệt,...) hay không.\nBẮT BUỘC chỉ trả về định dạng mảng JSON chứa các câu tóm tắt sự thật ngắn gọn (ví dụ: ["Muốn mua gói VIP", "Làm việc tại UEH"]).\nNếu không phát hiện thông tin nào mới hoặc quan trọng, hãy trả về mảng rỗng: [].\nTuyệt đối không giải thích, không viết thêm text gì ngoài JSON.`;

        const analyzerConfig = {
            ...aiConfig,
            isBackground: true,
            aiSystemPrompt: "Bạn là một máy trích xuất thực thể và thông tin khách hàng chính xác dưới dạng JSON array.",
            aiModel: aiConfig.aiModel || (aiConfig.aiProvider === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini')
        };

        const mockHistory = [
            { role: 'user', content: prompt }
        ];

        console.log(`[AI Long-Term Memory] Đang chạy phân tích cuộc hội thoại ngầm cho ${senderName}...`);
        const responseText = await askAI(mockHistory, analyzerConfig);
        if (responseText) {
            let jsonText = responseText.trim();
            if (jsonText.startsWith('```json')) {
                jsonText = jsonText.substring(7, jsonText.length - 3).trim();
            } else if (jsonText.startsWith('```')) {
                jsonText = jsonText.substring(3, jsonText.length - 3).trim();
            }

            const facts = JSON.parse(jsonText);
            if (Array.isArray(facts) && facts.length > 0) {
                console.log(`[AI Long-Term Memory] Phát hiện ${facts.length} sự kiện mới cần ghi nhớ về ${senderName}:`, facts);
                
                // Đảm bảo hồ sơ thành viên tồn tại trước
                const memberId = `${groupId}-${zaloId}`;
                await prisma.member.upsert({
                    where: { id: memberId },
                    update: { avatar: avatarUrl || undefined },
                    create: {
                        id: memberId,
                        groupId,
                        zaloId,
                        name: senderName,
                        avatar: avatarUrl || null,
                        vipStatus: 'normal'
                    }
                });

                for (let fact of facts) {
                    let factString = "";
                    if (typeof fact === 'string') {
                        factString = fact;
                    } else if (fact && typeof fact === 'object') {
                        factString = fact.fact || fact.content || JSON.stringify(fact);
                    } else {
                        factString = String(fact);
                    }
                    factString = factString.trim();
                    if (!factString) continue;

                    // Kiểm tra trùng lặp trước khi lưu
                    const existing = await prisma.memberMemory.findFirst({
                        where: { groupId, zaloId, fact: factString }
                    });
                    if (!existing) {
                        await prisma.memberMemory.create({
                            data: {
                                groupId,
                                zaloId,
                                fact: factString,
                                importance: 3
                            }
                        });
                    }
                }
            }
        }
    } catch (err) {
        console.error('Lỗi khi phân tích ngầm cuộc hội thoại để lưu bộ nhớ AI:', err.message);
    }
}

/**
 * Phân tích hội thoại ngầm để tự động trích xuất dữ liệu nhóm (đơn hàng, báo cáo công việc, lịch hẹn, khảo sát)
 */
async function analyzeAndExtractGroupData(groupId, zaloId, senderName, recentHistory, aiConfig, client = null) {
    try {
        const { prisma } = require('./database');
        
        // Chỉ phân tích nếu AI hoạt động và có API key
        if (!aiConfig || !aiConfig.aiApiKey || !aiConfig.aiEnabled) return;

        // Trích xuất tối đa 4 lượt thoại gần nhất để làm bối cảnh phân tích
        const recentTurns = recentHistory.slice(-4);
        if (recentTurns.length === 0) return;

        const conversationSlice = recentTurns.map(m => {
            const speaker = m.role === 'assistant' ? 'Trợ lý AI' : senderName;
            return `${speaker}: ${m.content}`;
        }).join('\n');

        const prompt = `Dưới đây là đoạn hội thoại gần nhất của nhóm Zalo:
${conversationSlice}

Nhiệm vụ: Hãy phân tích xem trong các tin nhắn gần nhất của người dùng "${senderName}" (Zalo ID: ${zaloId}) có tin nhắn nào thuộc các loại sau đây hay không:
1. Yêu cầu đặt hàng (mua sắm, đặt món, gọi dịch vụ, mua đồ,...) -> dataType: "order"
2. Báo cáo công việc (báo cáo doanh thu, tiến độ dự án, hoàn thành task, check-in/out,...) -> dataType: "report"
3. Tạo lịch hẹn/Sự kiện/Lịch họp (lập lịch biểu, hẹn giờ họp, hẹn lịch gặp mặt, sự kiện nhóm,...) -> dataType: "event"
4. Khảo sát ý kiến/Bình chọn/Thăm dò (yêu cầu mọi người bình chọn, làm khảo sát, biểu quyết,...) -> dataType: "survey"

BẮT BUỘC trả về kết quả ở định dạng JSON duy nhất như sau:
{
  "hasData": true hoặc false,
  "dataType": "order" hoặc "report" hoặc "event" hoặc "survey" hoặc "other",
  "keyInfo": "Mô tả cực kỳ ngắn gọn và rõ ràng thông tin trích xuất được (ví dụ: 'Đặt 2 cà phê sữa', 'Báo cáo: Hoàn thành thiết kế logo', 'Lịch họp: Họp dự án lúc 14h', 'Khảo sát: Biểu quyết địa điểm du lịch')",
  "rawMessage": "Nội dung tin nhắn gốc của người dùng chứa thông tin này"
}
If không có thông tin nào thuộc các loại trên trong hội thoại gần nhất của người dùng, hãy trả về:
{
  "hasData": false
}
Tuyệt đối không giải thích, không viết thêm text gì ngoài JSON.`;

        const analyzerConfig = {
            ...aiConfig,
            isBackground: true,
            aiSystemPrompt: "Bạn là một robot phân tích hội thoại nhóm chat, trích xuất thông tin đơn hàng và báo cáo công việc chính xác dưới dạng JSON.",
            aiModel: aiConfig.aiModel || (aiConfig.aiProvider === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini')
        };

        const mockHistory = [
            { role: 'user', content: prompt }
        ];

        console.log(`[AI Group Data Extraction] Đang phân tích cuộc hội thoại trích xuất dữ liệu nhóm cho ${senderName}...`);
        const responseText = await askAI(mockHistory, analyzerConfig);
        if (responseText) {
            let jsonText = responseText.trim();
            
            // Tìm dấu ngoặc nhọn đầu tiên và cuối cùng để trích xuất JSON sạch
            const firstBrace = jsonText.indexOf('{');
            const lastBrace = jsonText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                jsonText = jsonText.substring(firstBrace, lastBrace + 1);
            }

            let result;
            try {
                result = JSON.parse(jsonText);
            } catch (jsonErr) {
                try {
                    const cleaned = jsonText.replace(/(:\s*"(?:[^"\\]|\\.)*")|(\n)/g, (match, p1, p2) => {
                        if (p1) return p1;
                        if (p2) return ' ';
                    });
                    result = JSON.parse(cleaned);
                } catch (e2) {
                    console.error('Không thể dọn dẹp để parse JSON. Raw AI response:', responseText);
                    throw jsonErr;
                }
            }
            if (result && result.hasData && result.keyInfo) {
                console.log(`[AI Group Data Extraction] Phát hiện dữ liệu nhóm trích xuất được từ ${senderName}:`, result);
                
                const rawMsg = result.rawMessage || recentTurns[recentTurns.length - 1]?.content || "";
                
                // Kiểm tra trùng lặp dựa trên groupId, zaloId và rawMessage
                const existing = await prisma.groupData.findFirst({
                    where: {
                        groupId,
                        zaloId,
                        rawMessage: rawMsg
                    }
                });

                if (!existing) {
                    const saved = await prisma.groupData.create({
                        data: {
                            groupId,
                            zaloId,
                            senderName,
                            dataType: result.dataType || 'other',
                            keyInfo: result.keyInfo,
                            rawMessage: rawMsg,
                            status: 'pending'
                        }
                    });
                    
                    // Phát sự kiện socket qua server
                    if (global.io) {
                        global.io.emit('group.data.new', {
                            groupId,
                            data: saved
                        });
                    }

                    // --- CHUYỂN TIẾP ĐẾN GROUP HOST KEY ---
                    try {
                        const groupSetting = await prisma.groupSetting.findUnique({
                            where: { groupId }
                        });
                        
                        let targetHostGroupId = groupSetting ? groupSetting.hostGroupId : null;
                        
                        if (!targetHostGroupId && aiConfig.globalHostGroupId) {
                            targetHostGroupId = aiConfig.globalHostGroupId;
                        }
                        
                        if (targetHostGroupId && String(targetHostGroupId) !== String(groupId) && client) {
                            const originGroupName = client.api ? await getGroupName(client.api, groupId) : 'Nhóm Zalo';
                            const typeLabel = saved.dataType === 'order' ? '🛒 ĐƠN HÀNG' : 
                                              (saved.dataType === 'report' ? '📋 BÁO CÁO CÔNG VIỆC' : 
                                              (saved.dataType === 'event' ? '📅 LỊCH HẸN/SỰ KIỆN' : 
                                              (saved.dataType === 'survey' ? '📊 KHẢO SÁT/BÌNH CHỌN' : '⚙️ DỮ LIỆU KHÁC')));
                            
                            const forwardText = `🔔 [AI TRÍCH XUẤT DỮ LIỆU NHÓM]
• Phân loại: ${typeLabel}
• Nhóm nguồn: ${originGroupName}
• ID nhóm nguồn: [id:${groupId}]
• Thành viên gửi: ${saved.senderName} (ID: ${saved.zaloId || 'Không rõ'})
• Thông tin chính: ${saved.keyInfo}
• Nội dung gốc: "${saved.rawMessage || ''}"`;

                            console.log(`[AI Group Host Key] Đang chuyển tiếp dữ liệu trích xuất sang nhóm host ${targetHostGroupId}...`);
                            await client.sendMessage(targetHostGroupId, forwardText, 1);
                        }
                    } catch (forwardErr) {
                        console.error('Lỗi khi chuyển tiếp dữ liệu trích xuất sang Group Host:', forwardErr.message);
                    }
                } else {
                    console.log(`[AI Group Data Extraction] Bỏ qua dữ liệu trùng lặp.`);
                }
            }
        }
    } catch (err) {
        console.error('Lỗi khi phân tích ngầm cuộc hội thoại để trích xuất dữ liệu nhóm:', err.message);
    }
}

/**
 * Nhận diện cách xưng hô (Anh/Chị/Bạn) từ ảnh đại diện của khách hàng sử dụng AI Thị giác
 * @param {string} memberId ID thành viên dạng "groupId-zaloId"
 * @param {string} name Tên hiển thị
 * @param {string} avatarUrl URL ảnh đại diện
 * @param {Object} config Cấu hình AI
 */
async function analyzeAndSetPronounFromAvatar(memberId, name, avatarUrl, config) {
    if (!avatarUrl || avatarUrl.includes('photo-1535713875002-d1d0cf377fde')) return; // bỏ qua nếu là ảnh placeholder mặc định
    try {
        const { prisma } = require('./database');
        const { askAI } = require('./ai-service');
        
        console.log(`[Avatar Pronoun Detection] Đang nhận diện giới tính/danh xưng từ ảnh đại diện cho thành viên: ${name}...`);
        
        const systemPrompt = "Bạn là một trợ lý AI chuyên nghiệp phân tích ảnh đại diện và tên người dùng để đoán cách xưng hô phù hợp bằng tiếng Việt. Hãy trả về đúng 1 trong các từ sau: 'Anh', 'Chị', 'Bạn'. Không giải thích gì thêm.";
        const mockHistory = [
            {
                role: 'user',
                content: `Hãy phân tích ảnh đại diện của tôi dưới đây và tên hiển thị của tôi là "${name}". Hãy đoán cách xưng hô ('Anh', 'Chị' hoặc 'Bạn') phù hợp với tôi. [Hình ảnh: ${avatarUrl}]`
            }
        ];
        
        const response = await askAI(mockHistory, {
            ...config,
            aiSystemPrompt: systemPrompt,
            disableTools: true,
            isBackground: true // chạy ngầm để không bị chặn/trễ
        });
        
        if (response) {
            const detected = response.trim().replace(/[^\p{L}]/gu, ''); // Lọc bỏ ký tự đặc biệt
            console.log(`[Avatar Pronoun Detection] Kết quả nhận diện cho ${name}: ${detected}`);
            if (['Anh', 'Chị', 'Bạn'].includes(detected)) {
                await prisma.member.update({
                    where: { id: memberId },
                    data: { xungHo: detected }
                });
                console.log(`[Avatar Pronoun Detection] Đã tự động cập nhật danh xưng '${detected}' vào CSDL cho thành viên ${name}.`);
            }
        }
    } catch (e) {
        console.error('[Avatar Pronoun Detection] Lỗi phân tích ảnh đại diện:', e.message);
    }
}

module.exports = {
    analyzeAndSaveMemory,
    analyzeAndExtractGroupData,
    analyzeAndSetPronounFromAvatar
};
