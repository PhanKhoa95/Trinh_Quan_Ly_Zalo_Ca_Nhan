const now = new Date();
const formatter = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
});
const parts = formatter.formatToParts(now);
const dayPart = parts.find(p => p.type === 'day');
const monthPart = parts.find(p => p.type === 'month');
const yearPart = parts.find(p => p.type === 'year');
const day = dayPart ? parseInt(dayPart.value) : now.getDate();
const month = monthPart ? parseInt(monthPart.value) : (now.getMonth() + 1);
const year = yearPart ? parseInt(yearPart.value) : now.getFullYear();

console.log('Solar Date extracted:', { year, month, day });

const path = require('path');
const solarLunar = require(path.join(__dirname, '../server/node_modules/solarlunar')).default;
const lunar = solarLunar.solar2lunar(year, month, day);

console.log('Lunar Date returned:', lunar);
const lunarTimeContext = ` (tương đương Ngày ${lunar.lDay} tháng ${lunar.lMonth} năm ${lunar.lYear} Âm lịch)`;
console.log('Lunar Context string:', lunarTimeContext);
