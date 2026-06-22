const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../server/zalo-client.js');
let code = fs.readFileSync(filePath, 'utf8');

// We find the duplicate section and replace it
const targetString = `                        const tempConfig = {
                            ...aiConfig,
                            aiSystemPrompt: dynamicContext + (aiConfig.aiSystemPrompt || 'Bạn là một trợ lý AI hữu ích trong nhóm chat Zalo.')
                        };          if (dbMember.memories && dbMember.memories.length > 0) {
                                    memberProfileContext += \`  + Thông tin bạn (AI) đã ghi nhớ về thành viên này (Bộ nhớ dài hạn):\\n\`;
                                    dbMember.memories.forEach((m, idx) => {
                                        memberProfileContext += \`    * \${m.fact} (Độ quan trọng: \${m.importance}/5)\\n\`;
                                    });
                                }
                            }
                        } catch (profileErr) {
                            console.error('Lỗi truy xuất hồ sơ và bộ nhớ thành viên:', profileErr.message);
                        }

                        const now = new Date();
                        const currentLocalTime = now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                        const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
                        const dayOfWeek = days[now.getDay()];
                        const timeContext = \`\\n- Thời gian hiện tại: \${currentLocalTime} (\${dayOfWeek}). Hãy dựa vào mốc thời gian này để tính toán chính xác giá trị Unix timestamp dạng mili giây cho startTime khi tạo lịch nhắc hẹn (createReminder).\\n\`;

                        const dynamicContext = \`Bối cảnh hội thoại:\\n- Bạn đang hoạt động trong nhóm chat Zalo có tên là "\${groupName}" (ID của nhóm này là "\${groupId}").\\n- Bạn tên là "\${botName}" (đây là tài khoản Zalo của bạn).\\n- Thành viên kích hoạt bạn hiện tại là "\${senderName}".\\n- Khi trả lời, hãy xưng hô tự nhiên và phản hồi ngắn gọn, phù hợp với ngữ cảnh Zalo chat nhóm.\${timeContext}\${interruptionContext}\${groupPurposeContext}\${memberProfileContext}\\n\\n\${knowledgeContext}\`;
                        
                        // Tạo cấu hình AI tạm thời tích hợp dynamic context vào prompt hệ thống
                        const tempConfig = {
                            ...aiConfig,
                            aiSystemPrompt: dynamicContext + (aiConfig.aiSystemPrompt || 'Bạn là một trợ lý AI hữu ích trong nhóm chat Zalo.')
                        };`;

const replacementString = `                        const tempConfig = {
                            ...aiConfig,
                            aiSystemPrompt: dynamicContext + (aiConfig.aiSystemPrompt || 'Bạn là một trợ lý AI hữu ích trong nhóm chat Zalo.')
                        };`;

// Normalise line endings to avoid matching issues
const codeNorm = code.replace(/\r\n/g, '\n');
const targetNorm = targetString.replace(/\r\n/g, '\n');
const replacementNorm = replacementString.replace(/\r\n/g, '\n');

if (codeNorm.includes(targetNorm)) {
    const fixedCode = codeNorm.replace(targetNorm, replacementNorm);
    // Write back with original or standard CRLF line endings on Windows
    fs.writeFileSync(filePath, fixedCode.replace(/\n/g, '\r\n'), 'utf8');
    console.log('Successfully removed the duplicate block from zalo-client.js!');
} else {
    console.error('Could not find the target duplicate block. Trying regex...');
    // Let's do regex search
    const regex = /const tempConfig = \{\s*\.\.\.aiConfig,\s*aiSystemPrompt: dynamicContext \+ \(aiConfig\.aiSystemPrompt \|\| 'Bạn là một trợ lý AI hữu ích trong nhóm chat Zalo\.'\)\s*\};          if \(dbMember\.memories && dbMember\.memories\.length > 0\) \{.*?const tempConfig = \{\s*\.\.\.aiConfig,\s*aiSystemPrompt: dynamicContext \+ \(aiConfig\.aiSystemPrompt \|\| 'Bạn là một trợ lý AI hữu ích trong nhóm chat Zalo\.'\)\s*\};/s;
    if (regex.test(codeNorm)) {
        const fixedCode = codeNorm.replace(regex, replacementNorm);
        fs.writeFileSync(filePath, fixedCode.replace(/\n/g, '\r\n'), 'utf8');
        console.log('Successfully removed duplicate block using regex!');
    } else {
        console.error('Regex match also failed.');
    }
}
