# Zalo Personal Group Manager - Trình Quản Lý Nhóm Zalo Cá Nhân

Đây là bộ giao diện Web Dashboard quản trị hiện đại, chuyên nghiệp và đầy đủ tính năng mô phỏng chuyên sâu phục vụ cho việc quản lý các nhóm chat Zalo bằng tài khoản cá nhân. 

Giao diện được thiết kế với phong cách **Dark-mode Glassmorphism** sang trọng, chuyển cảnh mượt mà, responsive toàn diện và cung cấp đầy đủ các phân hệ quản lý trực quan để tương tác trước khi bạn quyết định tích hợp mã nguồn backend thực tế.

---

## 🚀 Tính Năng Chính

1. **Tổng quan Hệ Thống (Dashboard Overview):**
   - Biểu đồ thống kê lượng tin nhắn gửi đi và tương tác từ thành viên theo thời gian thực (được dựng trực tiếp bằng SVG responsive).
   - Log console liên tục cập nhật hoạt động mô phỏng của bot (quét từ khóa, xóa link spam, giãn cách ngẫu nhiên).
2. **Quản Lý Đa Tài Khoản Zalo (Multi-Account Manager):**
   - Quản lý danh sách tài khoản Zalo clone hoặc tài khoản chính đang hoạt động.
   - Thêm tài khoản mới thông qua quy trình quét mã QR giả lập tương tác thời gian thực.
3. **Quản Lý Nhóm Chat Tập Trung (Group settings):**
   - Khóa đổi tên & avatar nhóm.
   - Khóa ghim tin nhắn hoặc ghim mô tả nhóm.
   - Bật/tắt chế độ duyệt thành viên mới.
   - Tự động quét và xóa tin nhắn chứa link liên kết (URL).
4. **Quản Trị Thành Viên Chuyên Sâu (Member Moderation):**
   - Thăng/hạ chức Phó nhóm (Admin).
   - Trục xuất thành viên (Kick) hoặc chặn vĩnh viễn (Ban) kèm lý do.
   - Duyệt thành viên đang đợi gia nhập nhóm (Duyệt lẻ hoặc duyệt hàng loạt).
5. **Tự Động Hóa & Chiến Dịch (Automation & Bot):**
   - Lập chiến dịch gửi tin nhắn hàng loạt đến các nhóm được chỉ định theo khoảng cách giây (Delay) hoặc hẹn giờ (Schedule).
   - Bot phản hồi tự động (Auto-reply) theo từ khóa tùy chỉnh (khớp 100%, chứa từ khóa, Regex).
   - Bộ lọc từ khóa cấm (Blacklisted words) để tự động kiểm duyệt nội dung nhóm chat.
6. **Cấu Hình Tích Hợp (API Integrations):**
   - Cung cấp sẵn mã nguồn Node.js kết nối thực tế để tham khảo.
   - Form cấu hình kết nối Endpoint Webhook & Secret Token để đồng bộ dữ liệu.

---

## 🛠️ Hướng Dẫn Sử Dụng & Khởi Chạy

Dự án này được viết bằng HTML, CSS và JavaScript thuần (Vanilla). Bạn không cần cài đặt bất kỳ dependency hay thư viện Node.js nặng nề nào để khởi chạy giao diện.

### Cách 1: Chạy trực tiếp (Đơn giản nhất)
Bạn chỉ cần click đúp vào file `index.html` trong thư mục này để mở trực tiếp trên trình duyệt Chrome, Edge, Safari hoặc Firefox.

### Cách 2: Chạy qua máy chủ Local (Khuyên dùng)
Để tránh các giới hạn bảo mật về chính sách CORS khi tích hợp API thật hoặc chạy mượt mà nhất các module tải dữ liệu, bạn nên chạy ứng dụng qua một HTTP Server cục bộ:

**Nếu máy bạn đã cài Node.js:**
```bash
# Cài đặt công cụ server tĩnh gọn nhẹ
npm install -g serve

# Chạy server tại thư mục dự án
serve
```
Mặc định ứng dụng sẽ chạy tại địa chỉ: `http://localhost:3000` (hoặc port khác tùy máy).

**Nếu máy bạn đã cài Python:**
```bash
# Chạy module http server tích hợp sẵn của Python
python -m http.server 8080
```
Mở trình duyệt truy cập: `http://localhost:8080`

---

## ⚠️ Khuyến Nghị Vận Hành An Toàn (Tránh Bị Khóa Số Zalo)

Zalo kiểm soát các tài khoản cá nhân rất nghiêm ngặt bằng AI. Việc sử dụng các thư viện giả lập hoặc API không chính thức tự động gửi tin nhắn hàng loạt với tần suất cao rất dễ dẫn đến việc **khóa số điện thoại vĩnh viễn**. Vui lòng tuân thủ các quy tắc sau:

1. **Bật Safe Mode:** Luôn thiết lập khoảng cách trễ gửi tin tối thiểu từ **5 giây đến 15 giây** giữa mỗi nhóm.
2. **Sử dụng SpinTax:** Không gửi một nội dung tin nhắn giống hệt nhau liên tục đến hàng chục nhóm. Hãy thay đổi cấu trúc câu bằng các từ đồng nghĩa để Zalo không đánh dấu là spam.
3. **Phân chia công việc:** Sử dụng các tài khoản Zalo phụ (Acc clone) đã xác thực để làm bot tương tác hoặc gửi tin. **Tuyệt đối không dùng số điện thoại Zalo chính** chứa danh bạ khách hàng quan trọng của bạn.
4. **Giới hạn số lượng:** Mỗi tài khoản phụ chỉ nên gửi tin tối đa **40-50 nhóm/ngày** và giãn cách thời gian nghỉ hợp lý.

---

## 💻 Hướng Dẫn Tích Hợp Thư Viện GitHub (Dành Cho Lập Trình Viên)

Bạn có thể kết nối giao diện Dashboard này với các thư viện quản lý API Zalo cá nhân phổ biến trên GitHub:

### 1. zca-js (Giả lập trình duyệt)
[caochitam/zca-js](https://github.com/RFS-ADRENO/zca-js) là thư viện chạy ngầm trình duyệt Chromium để tương tác với Zalo Web. Dưới đây là code backend Node.js mẫu để đón sự kiện tin nhắn từ Zalo và đẩy lên Dashboard:

```javascript
// Cài đặt: npm install express axios zca-js
const { ZcaClient } = require('zca-js');
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const client = new ZcaClient({
    sessionPath: './zalo_session',
    headless: true // chạy ẩn danh
});

// Lắng nghe sự kiện tin nhắn mới đến từ Zalo
client.on('message', async (message) => {
    console.log(`Nhận tin từ ${message.senderId}: ${message.body}`);
    
    // Gửi tin sang Dashboard thông qua Webhook
    await axios.post('http://localhost:8080/api/webhook', {
        event: 'message.received',
        data: {
            groupId: message.threadId,
            senderName: message.senderName,
            text: message.body,
            senderPhone: message.senderPhone
        }
    }).catch(err => console.log('Lỗi gửi Webhook:', err.message));
});

// Endpoint Dashboard gọi xuống để điều khiển Bot gửi tin nhắn vào nhóm
app.post('/api/send-message', async (req, res) => {
    const { groupId, text } = req.body;
    try {
        await client.sendMessage(groupId, text);
        res.json({ success: true, message: 'Đã gửi tin thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

client.login().then(() => {
    app.listen(3000, () => console.log('Zalo API Gateway đang chạy ở port 3000'));
});
```

### 2. zalo-api-final (TypeScript SDK)
[hiennguyen270995/zalo-api-final](https://github.com/hiennguyen270995/zalo-api-final) hỗ trợ tới hơn 25 tác vụ quản lý nhóm (Tạo nhóm, duyệt thành viên, thăng chức admin).

Mã nguồn mẫu kết nối để duyệt thành viên:
```javascript
const ZaloAPI = require('zalo-api-final');

// Đăng nhập bằng Cookie hoặc thông tin tài khoản
const api = new ZaloAPI({
    cookie: 'YOUR_ZALO_WEB_COOKIE_HERE'
});

api.login().then(async () => {
    console.log('Đăng nhập Zalo API thành công!');
    
    // API duyệt thành viên chờ dựa trên id yêu cầu
    app.post('/api/approve-member', async (req, res) => {
        const { groupId, userIds } = req.body; // userIds dạng mảng
        try {
            // Thực thi lệnh duyệt thành viên của zalo-api-final
            await api.acceptPendingMembers(groupId, userIds);
            res.json({ success: true, message: 'Đã phê duyệt thành viên!' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
});
```

### 3. Tích hợp n8n (Không cần code)
Bạn cũng có thể cài đặt node tùy chỉnh [n8n-nodes-zalo-ca-nhan](https://github.com/hiennguyen270995/n8n-nodes-zalo-ca-nhan) trong quy trình n8n của mình. 
- Chỉ cần cấu hình HTTP Request Node trong n8n trỏ về Webhook URL của Dashboard để gửi dữ liệu nhóm chat hoặc biểu đồ báo cáo hiệu suất mỗi ngày.
