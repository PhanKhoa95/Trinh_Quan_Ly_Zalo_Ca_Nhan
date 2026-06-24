const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'data', 'zalo_manager.db');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `file:${dbPath}`
    }
  }
});

class PrismaNedbWrapper {
  constructor(modelName, arrayFields = []) {
    this.modelName = modelName;
    this.arrayFields = arrayFields;
  }

  _deserialize(doc) {
    if (!doc) return doc;
    const cleanDoc = { ...doc };
    if (cleanDoc.id) {
      cleanDoc._id = cleanDoc.id;
    }
    this.arrayFields.forEach(field => {
      if (cleanDoc[field] && typeof cleanDoc[field] === 'string') {
        try {
          cleanDoc[field] = JSON.parse(cleanDoc[field]);
        } catch (e) {
          // ignore
        }
      }
    });
    return cleanDoc;
  }

  _serialize(doc) {
    if (!doc) return doc;
    const cleanDoc = { ...doc };
    if (cleanDoc._id && !cleanDoc.id) {
      cleanDoc.id = cleanDoc._id;
    }
    delete cleanDoc._id;
    this.arrayFields.forEach(field => {
      if (cleanDoc[field] !== undefined && typeof cleanDoc[field] !== 'string') {
        cleanDoc[field] = JSON.stringify(cleanDoc[field]);
      }
    });
    return cleanDoc;
  }

  _mapQuery(query) {
    const where = {};
    Object.keys(query).forEach(key => {
      const val = query[key];
      const prismaKey = (key === '_id' || key === 'id') ? 'id' : key;
      
      if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
        const prismaOperators = {};
        Object.keys(val).forEach(op => {
          if (op.startsWith('$')) {
            const cleanOp = op.substring(1);
            prismaOperators[cleanOp] = val[op];
          } else {
            prismaOperators[op] = val[op];
          }
        });
        where[prismaKey] = prismaOperators;
      } else {
        where[prismaKey] = val;
      }
    });
    return where;
  }

  async find(query = {}) {
    const where = this._mapQuery(query);
    const docs = await prisma[this.modelName].findMany({ where });
    return docs.map(d => this._deserialize(d));
  }

  async findOne(query = {}) {
    const where = this._mapQuery(query);
    const doc = await prisma[this.modelName].findFirst({ where });
    return this._deserialize(doc);
  }

  async count(query = {}) {
    const where = this._mapQuery(query);
    return await prisma[this.modelName].count({ where });
  }

  async insert(docOrDocs) {
    if (Array.isArray(docOrDocs)) {
      const results = [];
      for (const doc of docOrDocs) {
        const serialized = this._serialize(doc);
        const created = await prisma[this.modelName].create({ data: serialized });
        results.push(this._deserialize(created));
      }
      return results;
    } else {
      const serialized = this._serialize(docOrDocs);
      const created = await prisma[this.modelName].create({ data: serialized });
      return this._deserialize(created);
    }
  }

  async update(query, updateQuery, options = {}) {
    const where = this._mapQuery(query);
    const data = updateQuery.$set ? this._serialize(updateQuery.$set) : this._serialize(updateQuery);

    if (options.multi) {
      const result = await prisma[this.modelName].updateMany({ where, data });
      return { numAffected: result.count };
    } else {
      const record = await prisma[this.modelName].findFirst({ where });
      if (!record) {
        if (options.upsert) {
          const created = await prisma[this.modelName].create({ data });
          return this._deserialize(created);
        }
        return 0;
      }
      
      const primaryKey = this.modelName === 'groupSetting' ? 'groupId' : 'id';
      const updateWhere = {};
      updateWhere[primaryKey] = record[primaryKey];

      const updated = await prisma[this.modelName].update({
        where: updateWhere,
        data
      });
      return this._deserialize(updated);
    }
  }

  async remove(query, options = {}) {
    const where = this._mapQuery(query);

    if (options.multi) {
      const result = await prisma[this.modelName].deleteMany({ where });
      return result.count;
    } else {
      const record = await prisma[this.modelName].findFirst({ where });
      if (!record) return 0;

      const primaryKey = this.modelName === 'groupSetting' ? 'groupId' : 'id';
      const deleteWhere = {};
      deleteWhere[primaryKey] = record[primaryKey];

      await prisma[this.modelName].delete({ where: deleteWhere });
      return 1;
    }
  }
}

// Khởi tạo các bảng dữ liệu dưới dạng Prisma wrapper
const sessionsDb = new PrismaNedbWrapper('session');
const rulesDb = new PrismaNedbWrapper('rule', ['keywords']);
const campaignsDb = new PrismaNedbWrapper('campaign', ['targets']);
const groupSettingsDb = new PrismaNedbWrapper('groupSetting');
const aiSettingsDb = new PrismaNedbWrapper('aiSetting', ['aiGroups', 'aiApiKeyPool', 'aiSafetySettings']);
const knowledgeDb = new PrismaNedbWrapper('knowledge', ['chunks']);
const callsDb = new PrismaNedbWrapper('call', ['transcript']);

// Thêm các quy tắc mặc định nếu database trống
async function initializeDefaultData() {
    try {
        const rulesCount = await rulesDb.count({});
        if (rulesCount === 0) {
            const defaultRules = [
                {
                    keywords: ['báo giá', 'gia ca', 'chi phi'],
                    matchType: 'contains',
                    reply: 'Dạ chào bạn, bảng giá chi tiết các gói dịch vụ Zalo CRM đã được gửi qua tin nhắn cá nhân của bạn rồi ạ. Vui lòng check hộp thư chờ nhé!',
                    active: true,
                    createdAt: new Date()
                },
                {
                    keywords: ['admin', 'tro ly', 'ho tro'],
                    matchType: 'contains',
                    reply: 'Hệ thống đã ghi nhận yêu cầu trợ giúp. Trợ lý kỹ thuật của ZaloGroup sẽ liên hệ hỗ trợ bạn trong vòng 5 phút nữa.',
                    active: true,
                    createdAt: new Date()
                }
            ];
            await rulesDb.insert(defaultRules);
            console.log('Database: Đã nạp dữ liệu từ khóa mặc định.');
        }

        const aiConfigCount = await aiSettingsDb.count({});
        const newSystemPrompt = 'Bạn là một trợ lý AI thân thiện, chuyên nghiệp trong nhóm chat Zalo. Khi trả lời, hãy dùng ngôn từ tự nhiên, gần gũi (xưng em/mình, gọi anh/chị/bạn), trả lời ngắn gọn, đi vào trọng tâm chat và luôn giữ thái độ nhiệt tình hỗ trợ.';
        if (aiConfigCount === 0) {
            const defaultAiSettings = {
                aiEnabled: false,
                aiProvider: 'openai',
                aiModel: 'gpt-4o-mini',
                aiApiKey: '',
                aiSystemPrompt: newSystemPrompt,
                aiTriggerPrefix: '@bot',
                aiMode: 'prefix',
                aiGroups: [],
                ragTopK: 3,
                ragScoreThreshold: 0.60,
                ragSearchMode: 'hybrid',
                stringeeSid: '',
                stringeeSecret: '',
                stringeeHotline: ''
            };
            await aiSettingsDb.insert(defaultAiSettings);
            console.log('Database: Đã nạp cấu hình AI & RAG mặc định.');
        } else {
            // Cập nhật cấu hình cũ nếu đang sử dụng prompt cũ mặc định hoặc bị lỗi font chữ
            const currentConfig = await aiSettingsDb.findOne({});
            if (currentConfig && (
                !currentConfig.aiSystemPrompt ||
                !currentConfig.aiSystemPrompt.includes('thân thiện')
            )) {
                await aiSettingsDb.update({}, {
                    $set: {
                        aiSystemPrompt: newSystemPrompt
                    }
                });
                console.log('Database: Đã cập nhật System Prompt mới tự nhiên và sửa lỗi font vào CSDL SQLite.');
            }
        }
    } catch (dbErr) {
        console.error('Lỗi khi kiểm tra nạp mặc định SQLite:', dbErr.message);
    }
}

initializeDefaultData().catch(err => console.error('Lỗi khởi tạo database:', err));

module.exports = {
    prisma,
    sessionsDb,
    rulesDb,
    campaignsDb,
    groupSettingsDb,
    aiSettingsDb,
    knowledgeDb,
    callsDb
};
