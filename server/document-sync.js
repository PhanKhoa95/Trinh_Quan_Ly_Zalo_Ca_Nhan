const cheerio = require('cheerio');

// 1. Hàm chia nhỏ văn bản thành các phân đoạn (Chunking) có chồng lấp (Overlap)
function chunkText(text, maxChunkSize = 500, overlap = 50) {
    if (!text) return [];
    
    // Chuẩn hóa khoảng trắng
    const cleanText = text.replace(/\s+/g, ' ').trim();
    if (cleanText.length <= maxChunkSize) {
        return [{ text: cleanText, index: 0 }];
    }

    const chunks = [];
    let startIdx = 0;
    let index = 0;

    while (startIdx < cleanText.length) {
        let endIdx = startIdx + maxChunkSize;
        
        if (endIdx < cleanText.length) {
            // Cố gắng cắt tại khoảng trắng để tránh bị nửa chữ
            const lastSpace = cleanText.lastIndexOf(' ', endIdx);
            if (lastSpace > startIdx + (maxChunkSize * 0.8)) {
                endIdx = lastSpace;
            }
        } else {
            endIdx = cleanText.length;
        }

        const chunkTxt = cleanText.substring(startIdx, endIdx).trim();
        if (chunkTxt.length > 10) { // Bỏ qua đoạn quá ngắn rác
            chunks.push({
                text: chunkTxt,
                index: index++
            });
        }

        // Dịch chuyển điểm bắt đầu kèm khoảng chồng lấp
        startIdx = endIdx - overlap;
        if (startIdx >= cleanText.length - overlap) {
            break;
        }
        if (startIdx <= 0) {
            startIdx = endIdx; // Tránh vòng lặp vô hạn nếu overlap lỗi
        }
    }

    return chunks;
}

// 2. Hàm trích xuất văn bản từ URL (Hỗ trợ Website HTML và Google Docs)
async function fetchAndExtractText(url, type) {
    try {
        let targetUrl = url;

        // Xử lý Google Docs
        if (type === 'googledoc') {
            // Trích xuất ID tài liệu từ liên kết chia sẻ
            const docIdMatch = url.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
            if (docIdMatch && docIdMatch[1]) {
                const docId = docIdMatch[1];
                // Xuất trực tiếp dạng file text thô
                targetUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
            }
        }

        console.log(`DocumentSync: Đang tải nội dung từ ${targetUrl} (Loại: ${type})...`);
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status} ${response.statusText}`);
        }

        if (type === 'googledoc') {
            // Google Docs export trả về text thô trực tiếp
            const text = await response.text();
            return text;
        } else {
            // Website HTML
            const html = await response.text();
            const $ = cheerio.load(html);

            // Loại bỏ các thẻ không chứa nội dung thông tin bài viết
            $('script, style, nav, footer, header, noscript, iframe, aside, .sidebar, #sidebar, .footer, #footer, .menu, #menu, .nav, #nav').remove();

            // Cố gắng tìm thẻ bài viết cốt lõi trước để tăng chất lượng thông tin
            let contentArea = $('article, main, .main-content, .post-content, #content, .content');
            let rawText = '';
            
            if (contentArea.length > 0) {
                rawText = contentArea.first().text();
            } else {
                // Fallback lấy toàn bộ text trong body
                rawText = $('body').text();
            }

            // Dọn dẹp khoảng trắng dư thừa
            let cleanedText = rawText
                .replace(/[\t\r]/g, ' ')
                .replace(/\n\s*\n/g, '\n') // Gộp nhiều dòng trống thành 1 dòng
                .replace(/ {2,}/g, ' ')     // Gộp nhiều space thành 1 space
                .trim();

            return cleanedText;
        }
    } catch (err) {
        console.error(`DocumentSync: Lỗi khi tải tài liệu online từ URL (${url}):`, err.message);
        throw err;
    }
}

// 3. Hàm gọi API sinh Vector Embeddings (OpenAI / Gemini)
async function generateEmbedding(text, config) {
    const provider = config.aiProvider || 'openai';
    const apiKey = config.aiApiKey;

    if (!apiKey) {
        console.warn('DocumentSync: Chưa cấu hình API Key. Sẽ sử dụng RAG bằng TF-IDF làm fallback.');
        return null;
    }

    try {
        if (provider === 'openai') {
            const response = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    input: text,
                    model: 'text-embedding-3-small'
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error('OpenAI Embeddings API Error:', errText);
                return null;
            }

            const data = await response.json();
            return data.data && data.data[0] && data.data[0].embedding;
        } else if (provider === 'gemini') {
            let url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${apiKey}`;
            let response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    content: {
                        parts: [{ text: text }]
                    }
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                if (response.status === 404 || (errData.error && errData.error.status === 'NOT_FOUND')) {
                    console.log('DocumentSync: Model gemini-embedding-2 not found, falling back to models/gemini-embedding-001...');
                    url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
                    response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            content: {
                                parts: [{ text: text }]
                            }
                        })
                    });
                }
            }

            if (!response.ok) {
                const errText = await response.text();
                console.error('Gemini Embeddings API Error:', errText);
                return null;
            }

            const data = await response.json();
            return data.embedding && data.embedding.values;
        }
    } catch (err) {
        console.error('DocumentSync: Lỗi gọi API sinh vector embedding:', err.message);
    }
    return null;
}

// 4. Hàm đồng bộ toàn diện cho 1 tài liệu tri thức
async function syncDocument(doc, aiConfig, knowledgeDb) {
    console.log(`DocumentSync: Đang bắt đầu đồng bộ tài liệu "${doc.title}"...`);
    try {
        // Cập nhật trạng thái sang "Đang đồng bộ"
        await knowledgeDb.update({ _id: doc._id }, { $set: { syncStatus: 'syncing' } });

        // Tải và parse text
        let text = '';
        if (doc.sourceType === 'manual') {
            text = doc.content ? doc.content.trim() : '';
        } else {
            text = await fetchAndExtractText(doc.sourceUrl, doc.sourceType);
        }
        if (!text || text.length < 20) {
            throw new Error("Không thể trích xuất nội dung văn bản hợp lệ hoặc văn bản quá ngắn.");
        }

        // Phân tách chunks
        const chunks = chunkText(text);
        
        // Sinh Vector Embeddings cho từng chunk
        if (aiConfig && aiConfig.aiApiKey) {
            console.log(`DocumentSync: Bắt đầu sinh Vector Embeddings cho ${chunks.length} chunks...`);
            for (let i = 0; i < chunks.length; i++) {
                const embedding = await generateEmbedding(chunks[i].text, aiConfig);
                if (embedding) {
                    chunks[i].vectors = chunks[i].vectors || {};
                    chunks[i].vectors[aiConfig.aiProvider || 'openai'] = embedding;
                }
                // Dãn cách tránh rate limit API
                await new Promise(r => setTimeout(r, 200));
            }
        }

        // Cập nhật kết quả vào Database
        const updatedFields = {
            content: text.substring(0, 5000), // Chỉ lưu tóm tắt 5000 ký tự đầu trong trường content hiển thị
            chunks: chunks,
            charCount: text.length,
            chunkCount: chunks.length,
            syncStatus: 'synced',
            lastSyncedAt: new Date()
        };

        await knowledgeDb.update({ _id: doc._id }, { $set: updatedFields });
        console.log(`DocumentSync: Đồng bộ thành công tài liệu "${doc.title}" (${chunks.length} chunks, ${text.length} ký tự).`);
        return { success: true, chunkCount: chunks.length };
    } catch (err) {
        console.error(`DocumentSync: Đồng bộ thất bại tài liệu "${doc.title}":`, err.message);
        await knowledgeDb.update({ _id: doc._id }, { $set: { syncStatus: 'failed' } });
        return { success: false, error: err.message };
    }
}

// 5. Khởi chạy tiến trình đồng bộ ngầm định kỳ (Background Sync Job)
function startAutoSyncJob(knowledgeDb, aiSettingsDb) {
    console.log('DocumentSync: Đã khởi chạy tiến trình kiểm tra đồng bộ ngầm định kỳ.');
    
    // Quét mỗi 5 phút một lần
    setInterval(async () => {
        try {
            const aiConfig = await aiSettingsDb.findOne({});
            // Tìm các tài liệu online đang hoạt động
            const activeOnlineDocs = await knowledgeDb.find({
                active: true,
                sourceType: { $in: ['url', 'googledoc'] }
            });

            const now = new Date();
            for (const doc of activeOnlineDocs) {
                const intervalMs = (doc.syncInterval || 1440) * 60 * 1000; // Mặc định 24h = 1440m
                const lastSynced = doc.lastSyncedAt ? new Date(doc.lastSyncedAt) : new Date(0);
                
                // Kiểm tra xem đã đến hạn đồng bộ chưa
                if (now.getTime() - lastSynced.getTime() >= intervalMs && doc.syncStatus !== 'syncing') {
                    console.log(`DocumentSync (Auto): Đến hạn tự động cập nhật tài liệu "${doc.title}"...`);
                    // Gọi đồng bộ ngầm
                    syncDocument(doc, aiConfig, knowledgeDb).catch(e => {
                        console.error('DocumentSync (Auto) Error:', e.message);
                    });
                }
            }
        } catch (err) {
            console.error('DocumentSync Job Error:', err.message);
        }
    }, 5 * 60 * 1000); // 5 phút
}

// 6. Thuật toán tìm kiếm TF-IDF cục bộ gọn nhẹ làm fallback RAG
function searchTfidf(query, chunks, topK = 3) {
    if (!query || !chunks || chunks.length === 0) return [];
    
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length === 0) return chunks.slice(0, topK);

    // Tính điểm của mỗi chunk
    const scoredChunks = chunks.map(chunk => {
        const textLower = chunk.text.toLowerCase();
        let score = 0;

        queryWords.forEach(word => {
            // Tần suất xuất hiện của từ trong đoạn (TF)
            const count = (textLower.match(new RegExp(escapeRegExp(word), 'g')) || []).length;
            if (count > 0) {
                // IDF đơn giản: Ưu tiên từ xuất hiện nhưng không quá phổ biến
                const docFreq = chunks.filter(c => c.text.toLowerCase().includes(word)).length;
                const idf = Math.log(1 + chunks.length / (1 + docFreq));
                score += count * idf;
            }
        });

        return { chunk, score };
    });

    // Lọc các đoạn có điểm > 0, sắp xếp giảm dần và lấy Top-K
    return scoredChunks
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(item => ({
            ...item.chunk,
            similarityScore: Math.min(1.0, item.score / (queryWords.length * 1.5)) // Normalize score thô về khoảng 0 -> 1.0
        }))
        .slice(0, topK);
}

// Hàm bổ trợ escape ký tự đặc biệt cho Regex
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 7. Hàm tính toán Cosine Similarity
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 8. Hàm truy vấn RAG Lai (Hybrid RAG Search Engine) tích hợp đầy đủ
async function queryHybridRag(query, aiConfig, knowledgeDb) {
    try {
        const activeDocs = await knowledgeDb.find({ active: true });
        if (!activeDocs || activeDocs.length === 0) return [];

        let allChunks = [];
        activeDocs.forEach(doc => {
            if (doc.chunks && Array.isArray(doc.chunks)) {
                doc.chunks.forEach(c => {
                    allChunks.push({
                        ...c,
                        docTitle: doc.title
                    });
                });
            }
        });

        if (allChunks.length === 0) return [];

        const topK = aiConfig.ragTopK || 3;
        const threshold = aiConfig.ragScoreThreshold || 0.60;
        const mode = aiConfig.ragSearchMode || 'hybrid';

        let matchedChunks = [];

        // 1. Chạy Semantic Vector Search
        let vectorChunks = [];
        if ((mode === 'vector' || mode === 'hybrid') && aiConfig.aiApiKey) {
            const queryVector = await generateEmbedding(query, aiConfig);
            if (queryVector) {
                const provider = aiConfig.aiProvider || 'openai';
                vectorChunks = allChunks
                    .map(c => {
                        const docVector = c.vectors && c.vectors[provider];
                        const score = docVector ? cosineSimilarity(queryVector, docVector) : 0;
                        return { ...c, similarityScore: score };
                    })
                    .filter(c => c.similarityScore >= threshold);
            }
        }

        // 2. Chạy Keyword TF-IDF Search
        let tfidfChunks = [];
        if (mode === 'tfidf' || mode === 'hybrid') {
            tfidfChunks = searchTfidf(query, allChunks, topK * 2);
        }

        // 3. Kết hợp và khử trùng lặp (Hybrid)
        if (mode === 'hybrid') {
            const chunkMap = new Map();
            
            vectorChunks.forEach(c => {
                chunkMap.set(c.docTitle + '_' + c.index, {
                    ...c,
                    hybridScore: c.similarityScore * 0.7
                });
            });

            tfidfChunks.forEach(c => {
                const key = c.docTitle + '_' + c.index;
                const existing = chunkMap.get(key);
                const tfidfWeightScore = (c.similarityScore || 0) * 0.3;
                if (existing) {
                    existing.hybridScore += tfidfWeightScore;
                } else {
                    chunkMap.set(key, {
                        ...c,
                        hybridScore: tfidfWeightScore,
                        similarityScore: c.similarityScore
                    });
                }
            });

            matchedChunks = Array.from(chunkMap.values())
                .sort((a, b) => b.hybridScore - a.hybridScore)
                .slice(0, topK);
        } else if (mode === 'vector') {
            matchedChunks = vectorChunks
                .sort((a, b) => b.similarityScore - a.similarityScore)
                .slice(0, topK);
        } else {
            matchedChunks = tfidfChunks
                .sort((a, b) => b.similarityScore - a.similarityScore)
                .slice(0, topK);
        }

        return matchedChunks;
    } catch (err) {
        console.error("HybridRAG: Lỗi khi thực hiện truy vấn:", err.message);
        return [];
    }
}

module.exports = {
    chunkText,
    fetchAndExtractText,
    generateEmbedding,
    syncDocument,
    startAutoSyncJob,
    searchTfidf,
    cosineSimilarity,
    queryHybridRag
};
