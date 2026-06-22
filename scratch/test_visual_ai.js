const path = require('path');

// 1. Load askAI từ wrapper
const zaloClientPath = path.resolve(__dirname, '../server/zalo-client.js');
const zaloClient = require(zaloClientPath);
const askAI = zaloClient.askAI || ZaloClientWrapper.askAI;

async function runTest() {
    console.log('--- BẮT ĐẦU KIỂM THỬ TRÍ TUỆ THỊ GIÁC (VISUAL AI) ---');
    console.log('Đang đọc cấu hình API Key từ database SQLite...');
    
    const { prisma } = require('../server/database');
    const aiConfig = await prisma.aiSetting.findFirst({ where: { id: 'default' } });
    
    if (!aiConfig || !aiConfig.aiApiKey) {
        console.error('Lỗi: Chưa cấu hình Gemini/OpenAI API Key trong database. Không thể chạy test.');
        await prisma.$disconnect();
        return;
    }

    console.log(`Đang sử dụng nhà cung cấp: ${aiConfig.aiProvider.toUpperCase()} (${aiConfig.aiModel})`);
    
    // Hình ảnh logo Google chứa chữ "Google"
    const imageUrl = 'https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png';
    const mockHistory = [
        {
            role: 'user',
            content: `Hãy đọc chữ xuất hiện trên hình ảnh này và trả ra duy nhất từ khóa đó: [Hình ảnh: ${imageUrl}]`
        }
    ];

    console.log('\n[Đang gửi yêu cầu kèm ảnh sang AI...]');
    const startTime = Date.now();
    const result = await askAI(mockHistory, aiConfig);
    const duration = Date.now() - startTime;
    
    console.log('\n--- KẾT QUẢ ---');
    console.log(`Thời gian phản hồi: ${duration}ms`);
    console.log('Phản hồi từ AI:', result);

    if (result && result.toLowerCase().includes('google')) {
        console.log('\n✅ KẾT QUẢ TEST: PASS! AI đã nhìn thấy hình ảnh và đọc đúng chữ "Google"!');
    } else {
        console.log('\n❌ KẾT QUẢ TEST: FAILED! AI không đọc đúng chữ "Google" hoặc cuộc gọi lỗi.');
    }

    await prisma.$disconnect();
}

runTest().catch(console.error);
