const { openAITools, geminiTools, executeZaloApi } = require('./ai-tools');
const logger = require('./logger');

let globalOpenAIIndex = 0;
let globalGeminiIndex = 0;

/**
 * Tải hình ảnh từ Zalo CDN/URL và mã hóa sang dạng Base64
 */
async function downloadImageAsBase64(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mimeType = response.headers.get('content-type') || 'image/jpeg';
        return { base64, mimeType };
    } catch (err) {
        logger.error('zalo', 'Lỗi khi tải và encode hình ảnh từ URL:', { error: err.message, url });
        return null;
    }
}


/**
 * Gửi yêu cầu AI và điều phối việc sinh nội dung hoặc gọi hàm
 */
async function askAI(history, config, apiInstance = null, threadId = null, depth = 0) {
    // Clone history to protect from concurrent modifications during async tool execution
    history = [...history];

    // Mock logic for offline testing/scenario verification when using dummy API key
    if (config.aiApiKey && config.aiApiKey.includes('dummy')) {
        const lastMsg = history[history.length - 1] ? history[history.length - 1].content : '';
        if (lastMsg.includes('Nhiệm vụ: Hãy phân tích xem trong các tin nhắn gần nhất')) {
            let dataType = 'other';
            let keyInfo = '';
            let rawMessage = '';
            let hasData = false;

            const simMatch = lastMsg.match(/Zalo ID: user-sim-(\d+)/i);
            if (simMatch) {
                const testId = parseInt(simMatch[1]);
                hasData = true;
                if (testId === 6) {
                    dataType = 'report';
                    keyInfo = 'Báo cáo: Hoàn thành 100% tài liệu kỹ thuật';
                    rawMessage = 'Báo cáo tiến độ: Đã hoàn thành 100% tài liệu kỹ thuật.';
                } else if (testId === 7) {
                    dataType = 'report';
                    keyInfo = 'Báo cáo: Doanh thu đạt 120% KPI';
                    rawMessage = 'Done kế hoạch tuần: Doanh thu đạt 120% KPI.';
                } else if (testId === 8) {
                    dataType = 'report';
                    keyInfo = 'Báo cáo: Đã bàn giao sản phẩm';
                    rawMessage = 'Báo cáo ngày: Đã bàn giao sản phẩm cho khách hàng.';
                } else if (testId === 9) {
                    dataType = 'report';
                    keyInfo = 'Checkin: 8h00 có mặt tại văn phòng';
                    rawMessage = 'Checkin ca sáng: 8h00 có mặt tại văn phòng.';
                } else if (testId === 10) {
                    dataType = 'report';
                    keyInfo = 'Checkout: Đã bàn giao công việc';
                    rawMessage = 'Checkout ca chiều: Đã bàn giao công việc đầy đủ.';
                } else if (testId === 11) {
                    dataType = 'order';
                    keyInfo = 'Đặt 5 pizza hải sản, 3 coca cola';
                    rawMessage = 'Cho mình đặt 5 pizza hải sản và 3 coca cola nhé.';
                } else if (testId === 12) {
                    dataType = 'order';
                    keyInfo = 'Đặt 2 ly trà sữa truyền thống ít đường';
                    rawMessage = 'Order giúp em 2 ly trà sữa truyền thống ít đường.';
                } else if (testId === 13) {
                    dataType = 'order';
                    keyInfo = 'Đặt mua 1 máy pha cà phê tự động';
                    rawMessage = 'Tôi muốn mua 1 máy pha cà phê tự động loại tốt.';
                } else if (testId === 14) {
                    dataType = 'order';
                    keyInfo = 'Đặt 1 ổ bánh mì thịt nguội';
                    rawMessage = 'Ship cho mình 1 ổ bánh mì thịt nguội qua quận 1.';
                } else if (testId === 15) {
                    dataType = 'order';
                    keyInfo = 'Đặt 2 hộp cơm gà xối mỡ';
                    rawMessage = 'Lấy cho anh 2 hộp cơm gà xối mỡ giao lúc 12h.';
                } else {
                    hasData = false;
                }
            }

            if (hasData) {
                return JSON.stringify({
                    hasData: true,
                    dataType,
                    keyInfo,
                    rawMessage
                });
            } else {
                return JSON.stringify({
                    hasData: false
                });
            }
        }
    }

    if (depth > 5) {
        console.warn('[AI Function Call] Max function calling recursion depth reached.');
        return 'Xin lỗi, tôi đã thực hiện quá nhiều thao tác gọi hàm liên tiếp.';
    }

    // Tải cấu hình bật/tắt các công cụ tương tác
    const { getEnabledTools } = require('./ai-tools');
    const enabledToolsMap = getEnabledTools();

    // Lọc bỏ các công cụ bị tắt bởi người dùng
    let activeOpenAITools = config.disableTools ? [] : openAITools.filter(t => enabledToolsMap[t.function.name] !== false);
    let activeGeminiTools = config.disableTools ? [] : [{
        functionDeclarations: geminiTools[0].functionDeclarations.filter(fd => enabledToolsMap[fd.name] !== false)
    }];

    if (threadId) {
        if (activeOpenAITools && activeOpenAITools.length > 0) {
            activeOpenAITools = activeOpenAITools.filter(t => t.function.name !== 'sendMessage');
        }
        if (activeGeminiTools && activeGeminiTools[0] && activeGeminiTools[0].functionDeclarations) {
            activeGeminiTools = [{
                functionDeclarations: activeGeminiTools[0].functionDeclarations.filter(fd => fd.name !== 'sendMessage')
            }];
        }
    }

    try {
        const provider = config.aiProvider || 'openai';
        const keys = Array.isArray(config.aiApiKeyPool) && config.aiApiKeyPool.length > 0
            ? config.aiApiKeyPool.filter(k => k)
            : [config.aiApiKey].filter(k => k);
        const model = config.aiModel || (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash');
        let systemPrompt = config.aiSystemPrompt || 'Bạn là một trợ lý AI thân thiện, chuyên nghiệp trong nhóm chat Zalo. Khi trả lời, hãy dùng ngôn từ tự nhiên, gần gũi (xưng em/mình, gọi anh/chị/bạn), trả lời ngắn gọn, đi vào trọng tâm chat và luôn giữ thái độ nhiệt tình hỗ trợ.';
        systemPrompt += "\nTuyệt đối KHÔNG sử dụng các ký tự định dạng Markdown như **, *, _, `, ~~ trong câu trả lời. Hãy viết câu bằng văn bản thường hoàn chỉnh, mạch lạc, không bao giờ ngắt quãng lửng lơ giữa chừng.";

        if (keys.length === 0) {
            console.error('ZaloClient AI: Chưa cấu hình API Key.');
            return null;
        }

        if (provider === 'openai') {
            const messages = [
                { role: 'system', content: systemPrompt }
            ];

            for (const msg of history) {
                if (msg.role === 'user' && typeof msg.content === 'string') {
                    const imgMatch = msg.content.match(/\[Hình ảnh: (https?:\/\/[^\]]+)\]/);
                    if (imgMatch && imgMatch[1]) {
                        try {
                            const base64Info = await downloadImageAsBase64(imgMatch[1]);
                            if (base64Info) {
                                messages.push({
                                    role: msg.role,
                                    content: [
                                        { type: 'text', text: msg.content },
                                        {
                                            type: 'image_url',
                                            image_url: {
                                                url: `data:${base64Info.mimeType};base64,${base64Info.base64}`
                                            }
                                        }
                                    ]
                                });
                                continue;
                            }
                        } catch (err) {
                            console.error('Lỗi định dạng ảnh cho OpenAI:', err.message);
                        }
                    }
                }
                messages.push({
                    role: msg.role,
                    content: msg.content
                });
            }

            const body = {
                model: model,
                messages: messages,
                max_tokens: 1000
            };

            if (activeOpenAITools && activeOpenAITools.length > 0) {
                body.tools = activeOpenAITools;
            }

            let response;
            let attempt = 0;
            const openaiFallbackModels = ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'];
            if (!openaiFallbackModels.includes(model)) {
                openaiFallbackModels.unshift(model);
            }
            const maxAttempts = config.isBackground ? Math.max(keys.length, openaiFallbackModels.length) : Math.max(4, keys.length + 1);
            const backoffDelays = [2000, 5000, 10000];
            let currentKeyIndex = (globalOpenAIIndex++) % keys.length;
            let modelIndex = 0;
            let currentModel = model;

            while (attempt < maxAttempts) {
                const currentApiKey = keys[currentKeyIndex];
                currentModel = openaiFallbackModels[modelIndex % openaiFallbackModels.length];
                body.model = currentModel;

                const apiStart = Date.now();
                try {
                    response = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${currentApiKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(body)
                    });

                    const latency = Date.now() - apiStart;

                    if ((response.status === 429 || response.status === 503 || response.status === 404) && attempt < maxAttempts - 1) {
                        attempt++;
                        modelIndex++;
                        const nextModel = openaiFallbackModels[modelIndex % openaiFallbackModels.length];
                        logger.warn('api', `[AI Model Fallback] OpenAI model ${currentModel} returned ${response.status}. Rotating to fallback model ${nextModel}...`);

                        const keysTried = attempt;
                        if (keys.length > 1 && keysTried < keys.length) {
                            const prevIndex = currentKeyIndex;
                            currentKeyIndex = (currentKeyIndex + 1) % keys.length;
                            logger.warn('api', `[AI Key Pool] Rotating OpenAI key to index ${currentKeyIndex} immediately (Attempt ${attempt})...`);
                            continue;
                        }
                        const delay = backoffDelays[attempt - keys.length] || 10000;
                        logger.warn('api', `[AI Retry] OpenAI Rate/Model Limit. Đang thử lại lần ${attempt} sau ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    if (response.ok) {
                        logger.info('api', `Gọi OpenAI API thành công. Model: ${currentModel}. Latency: ${latency}ms`);
                    }
                    break;
                } catch (fetchErr) {
                    if (attempt < maxAttempts - 1) {
                        attempt++;
                        modelIndex++;
                        if (config.isBackground) {
                            const prevIndex = currentKeyIndex;
                            currentKeyIndex = (currentKeyIndex + 1) % keys.length;
                            logger.warn('api', `[AI Key Pool] OpenAI Network error in background. Rotating to key index ${currentKeyIndex} and model ${openaiFallbackModels[modelIndex % openaiFallbackModels.length]} immediately (Attempt ${attempt})...`);
                            continue;
                        }
                        const delay = backoffDelays[attempt - 1] || 10000;
                        logger.warn('api', `[AI Retry] Lỗi mạng khi gọi OpenAI API: ${fetchErr.message}. Đang thử lại lần ${attempt} sau ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                    if (config.isBackground) {
                        logger.error('api', `[AI Background Error] OpenAI Network error: ${fetchErr.message}. Failing fast.`);
                        return null;
                    }
                    throw fetchErr;
                }
            }

            if (!response.ok) {
                const errText = await response.text();
                logger.error('api', `OpenAI API Error: HTTP ${response.status}`, { error: errText });
                return null;
            }

            const data = await response.json();
            const aiMessage = data.choices && data.choices[0] && data.choices[0].message;
            if (!aiMessage) return null;

            if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
                logger.info('api', `[AI Function Call] OpenAI requested tools: ${aiMessage.tool_calls.map(tc => tc.function.name).join(', ')}`);

                history.push(aiMessage);

                for (const toolCall of aiMessage.tool_calls) {
                    const funcName = toolCall.function.name;
                    let args = {};
                    try {
                        args = JSON.parse(toolCall.function.arguments);
                    } catch (e) {
                        console.error('Lỗi parse arguments cho tool:', e.message);
                    }

                    if (threadId) {
                        if (args.groupId === undefined) args.groupId = threadId;
                        if (args.threadId === undefined) args.threadId = threadId;
                    }

                    let executionResult;
                    try {
                        executionResult = await executeZaloApi(apiInstance, funcName, args);
                        console.log(`[AI Function Call] Executed '${funcName}' successfully. Result:`, executionResult);
                    } catch (err) {
                        console.error(`[AI Function Call] Error executing '${funcName}':`, err.message);
                        executionResult = { error: err.message };
                    }

                    history.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: funcName,
                        content: JSON.stringify(executionResult || { success: true })
                    });
                }

                return await askAI(history, config, apiInstance, threadId, depth + 1);
            }

            return aiMessage.content;

        } else if (provider === 'gemini') {
            const formattedContents = [];
            
            for (const msg of history) {
                if (msg.role === 'tool') {
                    const lastContent = formattedContents[formattedContents.length - 1];
                    const responsePart = {
                        functionResponse: {
                            name: msg.name,
                            response: {
                                output: JSON.parse(msg.content)
                            }
                        }
                    };
                    if (lastContent && lastContent.role === 'function') {
                        lastContent.parts.push(responsePart);
                    } else {
                        formattedContents.push({
                            role: 'function',
                            parts: [responsePart]
                        });
                    }
                } else if (msg.role === 'assistant') {
                    let parts = [];
                    if (msg.geminiParts) {
                        parts = msg.geminiParts;
                    } else {
                        if (msg.content) {
                            parts.push({ text: msg.content });
                        }
                        if (msg.tool_calls && msg.tool_calls.length > 0) {
                            for (const tc of msg.tool_calls) {
                                parts.push({
                                    functionCall: {
                                        name: tc.function.name,
                                        args: JSON.parse(tc.function.arguments)
                                    }
                                });
                            }
                        }
                    }
                    formattedContents.push({
                        role: 'model',
                        parts: parts
                    });
                } else {
                    const parts = [{ text: msg.content }];
                    if (typeof msg.content === 'string') {
                        const imgMatch = msg.content.match(/\[Hình ảnh: (https?:\/\/[^\]]+)\]/);
                        if (imgMatch && imgMatch[1]) {
                            try {
                                const base64Info = await downloadImageAsBase64(imgMatch[1]);
                                if (base64Info) {
                                    parts.push({
                                        inlineData: {
                                            mimeType: base64Info.mimeType,
                                            data: base64Info.base64
                                        }
                                    });
                                }
                            } catch (err) {
                                console.error('Lỗi định dạng ảnh cho Gemini:', err.message);
                            }
                        }
                    }
                    formattedContents.push({
                        role: 'user',
                        parts: parts
                    });
                }
            }

            // Fallback to basic structure if history is empty
            if (formattedContents.length === 0) {
                formattedContents.push({
                    role: 'user',
                    parts: [{ text: 'Hello' }]
                });
            }

            const body = {
                contents: formattedContents,
                systemInstruction: {
                    parts: [{ text: systemPrompt }]
                },
                generationConfig: {
                    maxOutputTokens: 1000
                }
            };

            if (activeGeminiTools && activeGeminiTools.length > 0) {
                body.tools = activeGeminiTools;
            }

            let response;
            let attempt = 0;
            const geminiFallbackModels = [
                'gemini-2.5-flash',
                'gemini-2.5-flash-lite',
                'gemini-1.5-flash',
                'gemini-3-flash-preview',
                'gemini-3.1-flash-lite-preview',
                'gemini-2.5-pro',
                'gemini-1.5-pro'
            ];
            if (!geminiFallbackModels.includes(model)) {
                geminiFallbackModels.unshift(model);
            }
            const maxAttempts = config.isBackground ? Math.max(keys.length, geminiFallbackModels.length) : Math.max(7, keys.length + 1);
            const backoffDelays = [2000, 5000, 10000];
            let currentKeyIndex = (globalGeminiIndex++) % keys.length;
            let modelIndex = 0;
            let currentModel = model;

            while (attempt < maxAttempts) {
                const currentApiKey = keys[currentKeyIndex];
                currentModel = geminiFallbackModels[modelIndex % geminiFallbackModels.length];
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${currentApiKey}`;
                const apiStart = Date.now();
                try {
                    response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(body)
                    });

                    const latency = Date.now() - apiStart;

                    if ((response.status === 429 || response.status === 503 || response.status === 404) && attempt < maxAttempts - 1) {
                        attempt++;
                        modelIndex++;
                        const nextModel = geminiFallbackModels[modelIndex % geminiFallbackModels.length];
                        logger.warn('api', `[AI Model Fallback] Gemini model ${currentModel} returned ${response.status}. Rotating to fallback model ${nextModel}...`);

                        const keysTried = attempt;
                        if (keys.length > 1 && keysTried < keys.length) {
                            const prevIndex = currentKeyIndex;
                            currentKeyIndex = (currentKeyIndex + 1) % keys.length;
                            logger.warn('api', `[AI Key Pool] Rotating Gemini key to index ${currentKeyIndex} immediately (Attempt ${attempt})...`);
                            continue;
                        }

                        let delay = backoffDelays[attempt - keys.length] || 10000;
                        try {
                            const errJson = await response.clone().json();
                            if (errJson && errJson.error && errJson.error.details) {
                                const retryInfo = errJson.error.details.find(d => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
                                if (retryInfo && retryInfo.retryDelay) {
                                    const seconds = parseFloat(retryInfo.retryDelay);
                                    if (!isNaN(seconds)) {
                                        delay = (seconds * 1000) + 1000;
                                    }
                                }
                            }
                        } catch (parseErr) {
                            logger.warn('api', `Lỗi đọc thời gian chờ từ Gemini error details: ${parseErr.message}`);
                        }

                        logger.warn('api', `[AI Retry] Gemini API Rate/Model Limit. Đang thử lại lần ${attempt} sau ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    if (response.ok) {
                        logger.info('api', `Gọi Gemini API thành công. Model: ${currentModel}. Latency: ${latency}ms`);
                    }
                    break;
                } catch (fetchErr) {
                    if (attempt < maxAttempts - 1) {
                        attempt++;
                        modelIndex++;
                        if (config.isBackground) {
                            const prevIndex = currentKeyIndex;
                            currentKeyIndex = (currentKeyIndex + 1) % keys.length;
                            logger.warn('api', `[AI Key Pool] Gemini Network error in background. Rotating to key index ${currentKeyIndex} and model ${geminiFallbackModels[modelIndex % geminiFallbackModels.length]} immediately (Attempt ${attempt})...`);
                            continue;
                        }
                        const delay = backoffDelays[attempt - 1] || 10000;
                        logger.warn('api', `[AI Retry] Lỗi mạng khi gọi Gemini API: ${fetchErr.message}. Đang thử lại lần ${attempt} sau ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                    if (config.isBackground) {
                        logger.error('api', `[AI Background Error] Gemini Network error: ${fetchErr.message}. Failing fast.`);
                        return null;
                    }
                    throw fetchErr;
                }
            }

            if (!response.ok) {
                const errText = await response.text();
                logger.error('api', `Gemini API Error: HTTP ${response.status}`, { error: errText });
                return null;
            }

            const data = await response.json();
            const candidate = data.candidates && data.candidates[0];
            const contentObj = candidate && candidate.content;
            if (!contentObj) return null;

            const parts = contentObj.parts || [];
            let textAnswer = '';
            const functionCalls = [];

            for (const part of parts) {
                if (part.text) {
                    textAnswer += part.text;
                }
                if (part.functionCall) {
                    functionCalls.push(part.functionCall);
                }
            }

            if (functionCalls.length > 0) {
                console.log(`[AI Function Call] Gemini requested functions:`, functionCalls.map(fc => fc.name));
                
                history.push({
                    role: 'assistant',
                    content: textAnswer || '',
                    geminiParts: parts
                });

                for (const call of functionCalls) {
                    const funcName = call.name;
                    const args = call.args || {};

                    if (threadId) {
                        if (args.groupId === undefined) args.groupId = threadId;
                        if (args.threadId === undefined) args.threadId = threadId;
                    }

                    let executionResult;
                    try {
                        executionResult = await executeZaloApi(apiInstance, funcName, args);
                        console.log(`[AI Function Call] Executed '${funcName}' successfully. Result:`, executionResult);
                    } catch (err) {
                        console.error(`[AI Function Call] Error executing '${funcName}':`, err.message);
                        executionResult = { error: err.message };
                    }

                    history.push({
                        role: 'tool',
                        name: funcName,
                        content: JSON.stringify(executionResult || { success: true })
                    });
                }

                return await askAI(history, config, apiInstance, threadId, depth + 1);
            }

            return textAnswer || null;
        }

        return null;
    } catch (error) {
        console.error('Lỗi thực thi askAI:', error.message);
        if (config.isBackground) {
            return null;
        }
        throw error;
    }
}

/**
 * Phân tích cảm xúc hiện tại của khách hàng qua lịch sử hội thoại gần nhất
 * @param {Array} history Lịch sử tin nhắn gần đây
 * @param {Object} config Cấu hình AI
 * @returns {Promise<string>} Nhãn cảm xúc (Vui vẻ, Tức giận, Lo lắng, Bình thường)
 */
async function analyzeSentiment(history, config) {
    if (!history || history.length === 0) return 'Bình thường';
    
    // Chỉ lấy tối đa 8 tin nhắn gần nhất để phân tích cảm xúc nhanh chóng
    const sentimentHistory = history.slice(-8);
    
    const sentimentConfig = {
        ...config,
        aiSystemPrompt: "Bạn là một chuyên gia tâm lý học hành vi chuyên phân tích cảm xúc qua hội thoại chat. Hãy đọc đoạn lịch sử chat dưới đây và xác định cảm xúc hiện tại của người dùng gửi tin nhắn cuối cùng. Chỉ được phản hồi đúng 1 trong các từ sau: 'Tức giận', 'Vui vẻ', 'Lo lắng', 'Bình thường'. Tuyệt đối không viết thêm bất kỳ từ nào khác, không dùng dấu chấm câu.",
        disableTools: true,
        isBackground: true // Đánh dấu là task ngầm để không bị nghẽn rate limit
    };
    
    try {
        console.log('[Sentiment Analysis] Đang phân tích cảm xúc người dùng...');
        const response = await askAI(sentimentHistory, sentimentConfig);
        if (response) {
            const sentiment = response.trim().replace(/[^\p{L}\s]/gu, ''); // Dọn dẹp ký tự lạ
            console.log(`[Sentiment Analysis] Cảm xúc nhận diện được: ${sentiment}`);
            if (['Tức giận', 'Vui vẻ', 'Lo lắng', 'Bình thường'].includes(sentiment)) {
                return sentiment;
            }
        }
    } catch (e) {
        console.error('[Sentiment Analysis] Lỗi phân tích cảm xúc:', e.message);
    }
    return 'Bình thường'; // Fallback
}

module.exports = {
    downloadImageAsBase64,
    askAI,
    analyzeSentiment
};
