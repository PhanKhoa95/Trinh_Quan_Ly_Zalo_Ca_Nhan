const { prisma } = require('../server/database');
const { analyzeSentiment } = require('../server/ai-service');
const { analyzeAndSetPronounFromAvatar } = require('../server/ai-analyzers');

async function test() {
    console.log('--- BẮT ĐẦU KIỂM THỬ SENTIMENT & AVATAR AI ---');
    
    // 1. Kiểm thử Cấu hình AI
    const { aiSettingsDb } = require('../server/database');
    const aiConfig = await aiSettingsDb.findOne({});
    if (!aiConfig || !aiConfig.aiApiKey || !aiConfig.aiEnabled) {
        console.error('Lỗi: Chưa cấu hình AI hoặc chưa bật AI trong hệ thống.');
        return;
    }
    
    console.log(`AI Provider: ${aiConfig.aiProvider}`);
    console.log(`AI Model: ${aiConfig.aiModel}`);

    // 2. Giả lập lịch sử tin nhắn để test Phân tích Cảm xúc
    const mockHistoryAnger = [
        { role: 'user', content: 'Khách hàng: Tôi đã gửi tin nhắn từ sáng nhưng không ai trả lời!' },
        { role: 'assistant', content: 'Trợ lý AI: Dạ em xin lỗi anh, hệ thống đang bị quá tải.' },
        { role: 'user', content: 'Khách hàng: Làm ăn kiểu này mất hết khách của tôi, quá tệ hại, tôi rất tức giận!' }
    ];

    const mockHistoryHappy = [
        { role: 'user', content: 'Khách hàng: Ồ hay quá, cảm ơn trợ lý nhiều nha, câu trả lời rất hay.' },
        { role: 'assistant', content: 'Trợ lý AI: Dạ không có gì ạ, rất vui được hỗ trợ!' },
        { role: 'user', content: 'Khách hàng: Tuyệt vời quá shop ơi, yêu shop ghê á!' }
    ];

    console.log('\n--- 1. Kiểm thử Sentiment Analysis (Phân tích Cảm xúc) ---');
    const sentimentAnger = await analyzeSentiment(mockHistoryAnger, aiConfig);
    console.log(`Kết quả cảm xúc giận dữ: ${sentimentAnger} (Mong muốn: Tức giận)`);

    const sentimentHappy = await analyzeSentiment(mockHistoryHappy, aiConfig);
    console.log(`Kết quả cảm xúc vui vẻ: ${sentimentHappy} (Mong muốn: Vui vẻ)`);

    // 3. Giả lập Nhận diện Xưng hô qua Ảnh đại diện (Multimodal AI)
    console.log('\n--- 2. Kiểm thử Avatar Pronoun Detection (AI Thị giác) ---');
    // Tạo hoặc tìm thành viên demo
    const memberId = 'group-test-123-zalo-test-456';
    const dbMember = await prisma.member.upsert({
        where: { id: memberId },
        update: { xungHo: null }, // Reset xưng hô để test
        create: {
            id: memberId,
            groupId: 'group-test-123',
            zaloId: 'zalo-test-456',
            name: 'Chị Mai Linh',
            vipStatus: 'normal'
        }
    });

    // Sử dụng URL ảnh đại diện mẫu có ảnh khuôn mặt nữ rõ ràng để test
    const testAvatarUrl = 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80';
    console.log(`Avatar URL mẫu: ${testAvatarUrl}`);
    
    await analyzeAndSetPronounFromAvatar(memberId, 'Chị Mai Linh', testAvatarUrl, aiConfig);
    
    // Đọc lại từ CSDL
    const updatedMember = await prisma.member.findUnique({
        where: { id: memberId }
    });
    console.log(`Danh xưng nhận diện được lưu trong DB: ${updatedMember.xungHo} (Mong muốn: Chị)`);

    // Dọn dẹp
    await prisma.member.delete({
        where: { id: memberId }
    });

    console.log('\n--- KẾT THÚC KIỂM THỬ ---');
    process.exit(0);
}

test().catch(err => {
    console.error('Lỗi kiểm thử:', err);
    process.exit(1);
});
