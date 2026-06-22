const fs = require('fs');

// Simple simulation of the optimized quote reply parsing logic from zalo-client.js
function testParseAndFormatOptimized(quotedMsg, bossReplyRaw, botName = "Phan Đăng Khoa", bossName = "Sếp Khoa") {
    const isAiForward = quotedMsg.includes('AI PHÒNG BAN') || quotedMsg.includes('AI TRÍCH XUẤT');
    
    // 1. Tối ưu hóa: Dọn dẹp câu trả lời của sếp (loại bỏ mention bot)
    let bossReply = bossReplyRaw || '';
    if (botName) {
        const mentionRegex = new RegExp(`@${botName}`, 'gi');
        bossReply = bossReply.replace(mentionRegex, '');
    }
    bossReply = bossReply.replace(/@[0-9]+/g, '').trim();

    // Extract original request and sender name
    const senderMatch = quotedMsg.match(/• Thành viên gửi:\s*([^\r\n(]+)/i);
    const originalSenderName = senderMatch ? senderMatch[1].trim() : 'Thành viên';
    
    const rawMsgMatch = quotedMsg.match(/• Nội dung yêu cầu:\s*"(.*)"/is) || quotedMsg.match(/• Nội dung gốc:\s*"(.*)"/is);
    let originalRequest = rawMsgMatch ? rawMsgMatch[1].trim() : '';

    // 2. Tối ưu hóa: Giới hạn độ dài nội dung trích dẫn để tránh tin nhắn quá dài
    if (originalRequest && originalRequest.length > 60) {
        originalRequest = originalRequest.substring(0, 57) + '...';
    }

    // Extracted request type label
    let requestTypeLabel = 'yêu cầu';
    const typeMatch = quotedMsg.match(/• Phân loại:\s*([^\r\n]+)/i) || quotedMsg.match(/• Loại yêu cầu:\s*([^\r\n]+)/i);
    if (typeMatch) {
        let rawType = typeMatch[1]
            .replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '')
            .trim()
            .toLowerCase();
        
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
        const quotedMsgUpper = quotedMsg.toUpperCase();
        if (quotedMsgUpper.includes('ĐƠN HÀNG')) {
            requestTypeLabel = 'đơn hàng';
        } else if (quotedMsgUpper.includes('BÁO CÁO')) {
            requestTypeLabel = 'báo cáo';
        } else if (quotedMsgUpper.includes('LỊCH HẸN')) {
            requestTypeLabel = 'lịch hẹn';
        } else if (quotedMsgUpper.includes('KHẢO SÁT')) {
            requestTypeLabel = 'khảo sát';
        } else if (quotedMsgUpper.includes('PHÊ DUYỆT')) {
            requestTypeLabel = 'đề xuất/yêu cầu';
        }
    }

    // Determine if Approved or Rejected
    const approveKeywords = ['ok', '0k', 'oke', 'duyệt', 'đồng ý', 'approve', 'yes', 'nhất trí', 'chấp thuận'];
    const rejectKeywords = ['không đồng ý', 'không duyệt', 'từ chối', 'hủy', 'cancel', 'deny', 'reject', 'không ok', 'ko ok', 'hủy bỏ'];

    const bossTextLower = bossReply.toLowerCase().trim();
    const words = bossTextLower.split(/[\s.,!?()'"";:\[\]{}-]+/);

    let isApproved = approveKeywords.some(k => {
        if (k.includes(' ')) return bossTextLower.includes(k);
        return words.includes(k);
    });

    const isRejected = rejectKeywords.some(k => {
        if (k.includes(' ')) return bossTextLower.includes(k);
        return words.includes(k);
    });

    if (isRejected) {
        isApproved = false;
    }

    // Natural verbs & icons
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

    const simpleApproveWords = ['ok', '0k', 'oke', 'duyệt', 'đồng ý', 'approve', 'yes', 'nhất trí', 'chấp thuận', 'ok duyệt', 'ok nhé', 'ok nhe', 'ok nha'];
    const simpleRejectWords = ['không đồng ý', 'không duyệt', 'từ chối', 'hủy', 'cancel', 'deny', 'reject', 'không ok', 'ko ok', 'hủy bỏ', 'ko', 'k', 'không'];
    
    const bossReplyClean = bossReply.trim();
    const bossReplyLower = bossReplyClean.toLowerCase().replace(/[.,!?]/g, '').trim();
    
    const isSimpleReply = simpleApproveWords.includes(bossReplyLower) || 
                          simpleRejectWords.includes(bossReplyLower) || 
                          bossReplyClean.length <= 4;

    let feedbackText = '';
    const requestSnippet = originalRequest ? ` "${originalRequest}"` : '';

    if (isRejected) {
        feedbackText = `Dạ, sếp ${bossName} đã ${verbRejected} ${requestTypeLabel}${requestSnippet} của ${originalSenderName} rồi ạ.`;
        if (!isSimpleReply) {
            feedbackText += `\n👉 Chi tiết lý do: "${bossReplyClean}"`;
        }
    } else if (isApproved) {
        feedbackText = `Dạ, ${requestTypeLabel}${requestSnippet} của ${originalSenderName} đã được sếp ${bossName} ${verbApproved} rồi ạ! ${icon}`;
        if (!isSimpleReply) {
            feedbackText += `\n👉 Ý kiến sếp: "${bossReplyClean}"`;
        }
    } else {
        feedbackText = `Dạ, sếp ${bossName} có ý kiến chỉ đạo về ${requestTypeLabel}${requestSnippet} của ${originalSenderName} như sau ạ:\n👉 "${bossReplyClean}"`;
    }

    console.log(`--- TEST CASE ---`);
    console.log(`Loại trích xuất: ${requestTypeLabel}`);
    console.log(`Original Sender: ${originalSenderName}`);
    console.log(`Boss Raw Reply: "${bossReplyRaw}" -> cleaned: "${bossReplyClean}"`);
    console.log(`Simple: ${isSimpleReply}, Approved: ${isApproved}, Rejected: ${isRejected}`);
    console.log(`Feedback Text:\n${feedbackText}\n`);
}

// Case 1: Order with mention cleanup
const quoteOrder = `🔔 [AI TRÍCH XUẤT DỮ LIỆU NHÓM]
• Phân loại: 🛒 ĐƠN HÀNG
• Nhóm nguồn: Test Bot
• ID nhóm nguồn: [id:1613676181297225050]
• Thành viên gửi: Thái Mỹ (ID: 652983815620831537)
• Thông tin chính: Đặt 1 ly sinh tố bơ
• Nội dung gốc: "Thái Mỹ: cho tôi order 1 ly sinh tố bơ nữa"`;

testParseAndFormatOptimized(quoteOrder, "@Phan Đăng Khoa ok", "Phan Đăng Khoa", "Khoa Đặng");
testParseAndFormatOptimized(quoteOrder, "@Phan Đăng Khoa Ok duyệt chuyển gấp", "Phan Đăng Khoa", "Khoa Đặng");

// Case 2: Very long request snippet
const quoteLong = `🔔 [AI TRÍCH XUẤT DỮ LIỆU NHÓM]
• Phân loại: 📋 BÁO CÁO CÔNG VIỆC
• Nhóm nguồn: Test Bot
• ID nhóm nguồn: [id:1613676181297225050]
• Thành viên gửi: Nguyễn Văn A (ID: 652983815620831537)
• Thông tin chính: Hoàn thành thiết kế logo thương hiệu cho chiến dịch hè 2026
• Nội dung gốc: "Tôi đã hoàn thành bản thiết kế logo thương hiệu cho chiến dịch hè 2026 với đầy đủ 3 phiên bản màu sắc và định dạng vector để gửi cho phòng truyền thông quảng cáo duyệt chi tiết trước khi in ấn thử nghiệm"`;

testParseAndFormatOptimized(quoteLong, "ok", "Phan Đăng Khoa", "Khoa Đặng");
