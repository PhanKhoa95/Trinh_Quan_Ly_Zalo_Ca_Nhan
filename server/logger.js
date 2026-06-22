const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'app.log');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_BACKUP_FILES = 5;

// Khởi tạo thư mục logs nếu chưa tồn tại
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Hàm xoay vòng file log (Log Rotation)
function rotateLogFile() {
    try {
        if (!fs.existsSync(LOG_FILE)) return;
        const stats = fs.statSync(LOG_FILE);
        if (stats.size < MAX_FILE_SIZE) return;

        // Xóa backup cũ nhất
        const oldestBackup = path.join(LOGS_DIR, `app.log.${MAX_BACKUP_FILES}`);
        if (fs.existsSync(oldestBackup)) {
            fs.unlinkSync(oldestBackup);
        }

        // Đổi tên các file backup trung gian
        for (let i = MAX_BACKUP_FILES - 1; i >= 1; i--) {
            const currentBackup = path.join(LOGS_DIR, `app.log.${i}`);
            const targetBackup = path.join(LOGS_DIR, `app.log.${i + 1}`);
            if (fs.existsSync(currentBackup)) {
                fs.renameSync(currentBackup, targetBackup);
            }
        }

        // Đổi tên file log hiện tại thành backup .1
        fs.renameSync(LOG_FILE, path.join(LOGS_DIR, 'app.log.1'));
        console.log('[Logger] Đã xoay vòng file log thành công.');
    } catch (err) {
        console.error('[Logger Error] Lỗi khi xoay vòng file log:', err.message);
    }
}

// Hàm ghi log chính
async function writeLog(level, category, message, metadata = null) {
    const timestamp = new Date().toISOString();
    const metaString = metadata ? ` ${JSON.stringify(metadata)}` : '';
    const logLine = `[${timestamp}] [${level.toUpperCase()}] [${category.toUpperCase()}] ${message}${metaString}\n`;

    // 1. Ghi log ra Console với định dạng màu sắc cơ bản
    let color = '\x1b[0m'; // Reset
    if (level === 'error') color = '\x1b[31m'; // Red
    else if (level === 'warn') color = '\x1b[33m'; // Yellow
    else if (level === 'debug') color = '\x1b[36m'; // Cyan
    
    console.log(`${color}[${category.toUpperCase()}] ${message}\x1b[0m${metaString}`);

    // 2. Ghi log ra file có xoay vòng
    rotateLogFile();
    try {
        fs.appendFileSync(log_file_resolved(), logLine, 'utf8');
    } catch (err) {
        console.error('[Logger Error] Ghi log ra file thất bại:', err.message);
    }

    // 3. Gửi sự kiện log thời gian thực qua Socket.io
    if (global.io) {
        global.io.emit('log.stream', {
            timestamp,
            level,
            category,
            message,
            metadata
        });
    }

    // 4. Lưu log cấp Warn/Error hoặc các sự kiện Zalo/Listener vào SQLite để xem lịch sử
    if ((level === 'warn' || level === 'error' || ['message', 'reaction', 'undo', 'group_event', 'zalo'].includes(category.toLowerCase())) && global.saveLogsToDb !== false) {
        try {
            // Import động để tránh dependency cycle khi database.js/server.js load logger
            const { prisma } = require('./database');
            if (prisma && prisma.log) {
                await prisma.log.create({
                    data: {
                        level,
                        category,
                        message,
                        metadata: metadata ? JSON.stringify(metadata) : null
                    }
                });
            }
        } catch (dbErr) {
            // Không log lại lỗi DB bằng logger để tránh lặp vô tận, chỉ in console
            console.error('[Logger Error] Lưu log lỗi vào SQLite thất bại:', dbErr.message);
        }
    }
}

function log_file_resolved() {
    return LOG_FILE;
}

const logger = {
    info: (category, message, metadata) => writeLog('info', category, message, metadata),
    warn: (category, message, metadata) => writeLog('warn', category, message, metadata),
    error: (category, message, metadata) => writeLog('error', category, message, metadata),
    debug: (category, message, metadata) => writeLog('debug', category, message, metadata)
};

module.exports = logger;
