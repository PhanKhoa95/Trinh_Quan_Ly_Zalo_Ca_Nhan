const crypto = require('crypto');
const WebSocket = require('ws');
const { callsDb, knowledgeDb, aiSettingsDb, rulesDb } = require('./database');
const { queryHybridRag } = require('./document-sync');

// 1. Hàm sinh JWT Token để xác thực với Stringee API
function generateStringeeToken(apiKeySid, apiKeySecret, expireInSeconds = 3600) {
    const header = {
        cty: "stringee-api;v=1",
        typ: "JWT",
        alg: "HS256"
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
        jti: apiKeySid + "-" + now,
        iss: apiKeySid,
        exp: now + expireInSeconds,
        rest_api: true // Cho phép gọi REST API
    };

    const base64UrlEncode = (str) => {
        return Buffer.from(JSON.stringify(str))
            .toString('base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
    };

    const encodedHeader = base64UrlEncode(header);
    const encodedPayload = base64UrlEncode(payload);

    const signature = crypto
        .createHmac('sha256', apiKeySecret)
        .update(encodedHeader + '.' + encodedPayload)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    return encodedHeader + '.' + encodedPayload + '.' + signature;
}

// 2. Hàm thực hiện cuộc gọi Outbound Call qua Stringee (hỗ trợ giả lập nếu thiếu API Key)
async function makeOutboundCall(phoneNumber, aiConfig) {
    const { stringeeSid, stringeeSecret, stringeeHotline, stringeeServerUrl } = aiConfig;
    
    // Nếu thiếu thông tin cấu hình Stringee, tự động chuyển sang chế độ gọi điện giả lập (Mock Call Fallback)
    if (!stringeeSid || !stringeeSecret || !stringeeHotline) {
        console.log(`StringeeCall (Simulation Fallback): Thiếu cấu hình API Key. Thực hiện cuộc gọi giả lập tới số: ${phoneNumber}...`);
        
        const mockCallId = 'sim_' + Math.random().toString(36).substring(2, 9);
        const callRecord = {
            stringeeCallId: mockCallId,
            phoneNumber: phoneNumber,
            clientName: 'Khách hàng (Giả lập)',
            direction: 'outbound',
            status: 'completed',
            duration: 12,
            transcript: [
                { role: 'ai', text: "Dạ em chào anh chị, em là trợ lý đàm thoại thông minh Zalo CRM. Vì cấu hình API tổng đài Stringee của bạn chưa đầy đủ, hệ thống tự động kết nối cuộc gọi giả lập này để kiểm thử tính năng.", time: new Date() },
                { role: 'user', text: "À hay quá, vậy luồng hoạt động tự động thế nào?", time: new Date() },
                { role: 'ai', text: "Dạ, khi khách hàng nhắn tin yêu cầu gọi điện trên Zalo, trợ lý AI sẽ tự động đọc cơ sở dữ liệu tri thức của bạn (gồm cả website đã đồng bộ) rồi kích hoạt cuộc gọi thoại VoIP trực tiếp và đàm thoại bằng giọng nói tự nhiên như con người ạ!", time: new Date() }
            ],
            recordingUrl: 'virtual_call_simulation.mp3',
            createdAt: new Date()
        };
        
        await callsDb.insert(callRecord);
        
        // Thông báo cho giao diện cập nhật lịch sử cuộc gọi
        if (global.io) {
            global.io.emit('call.history.updated');
            global.io.emit('terminal.log', {
                text: `[Giả lập cuộc gọi] Đã thực hiện cuộc gọi giả lập tới số ${phoneNumber} thành công.`,
                type: 'success'
            });
        }
        
        return {
            r: 0,
            message: "Mock outbound call simulated successfully (Simulation Fallback)",
            call_id: mockCallId
        };
    }

    // Định dạng lại số điện thoại Việt Nam (+84 hoặc 0) thành định dạng chuẩn quốc tế cho Stringee
    let formattedPhone = phoneNumber.trim().replace(/\s+/g, '');
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '84' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('+')) {
        formattedPhone = formattedPhone.substring(1);
    }

    const token = generateStringeeToken(stringeeSid, stringeeSecret);
    const url = 'https://api.stringee.com/v1/call/call';
    
    const serverUrl = stringeeServerUrl || process.env.SERVER_URL || 'http://localhost:3000';
    
    // SCCO ban đầu: AI tự động phát lời chào và lắng nghe phản hồi
    const scco = [
        {
            action: "talk",
            text: "Xin chào, tôi là trợ lý cuộc gọi trí tuệ nhân tạo của hệ thống ZaloGroup. Tôi đang gọi điện để hỗ trợ bạn. Bạn cần tôi giúp gì ạ?",
            voice: "southern", // Giọng miền Nam
            speed: 0,
            bargeIn: true // Cho phép ngắt lời khi AI đang nói
        },
        {
            action: "record",
            eventUrl: `${serverUrl}/api/calls/webhook/record`,
            format: "mp3",
            silenceTime: 3, // Tự động ngắt ghi âm sau 3s im lặng
            maxDuration: 20 // Tối đa ghi âm 20s mỗi lượt trả lời
        }
    ];

    const body = {
        from: {
            type: "external",
            number: stringeeHotline,
            alias: "ZaloGroup Hotline"
        },
        to: [{
            type: "external",
            number: formattedPhone
        }],
        answer_url: `${serverUrl}/api/calls/webhook/answer`,
        actions: scco
    };

    console.log(`StringeeCall: Thực hiện cuộc gọi tới ${formattedPhone}...`);
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'X-STRINGEE-AUTH': token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Stringee API Error: ${errText}`);
    }

    const result = await response.json();
    if (result.r !== 0) {
        throw new Error(`Stringee API Failed: ${result.message || 'Unknown error'}`);
    }

    return result;
}

// 3. Hàm chuyển giọng nói thành văn bản bằng OpenAI Whisper API
async function speechToTextWhisper(audioBuffer, apiKey) {
    try {
        const formData = new FormData();
        const file = new Blob([audioBuffer], { type: 'audio/mp3' });
        formData.append('file', file, 'speech.mp3');
        formData.append('model', 'whisper-1');
        formData.append('language', 'vi');

        console.log("WhisperSTT: Đang gửi file âm thanh lên OpenAI Whisper...");
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: formData
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('Whisper API Error:', errText);
            return null;
        }

        const data = await response.json();
        return data.text;
    } catch (err) {
        console.error('Whisper STT Error:', err.message);
    }
    return null;
}

// 4. Giải thuật RAG cho hội thoại thoại (Voice RAG Engine)
async function queryVoiceRag(question, aiConfig) {
    try {
        const matchedChunks = await queryHybridRag(question, aiConfig, knowledgeDb);

        if (matchedChunks && matchedChunks.length > 0) {
            let context = `[THÔNG TIN TRÍ XUẤT TỪ CƠ SỞ TRI THỨC ĐỂ TRẢ LỜI CÂU HỎI HỘI THOẠI]:\n`;
            matchedChunks.forEach((item, idx) => {
                context += `Đoạn ${idx + 1} (Nguồn: ${item.docTitle}): ${item.text}\n`;
            });
            context += `\nLưu ý quan trọng: Khách hàng đang gọi điện nói chuyện trực tiếp với bạn. Hãy đọc thông tin tri thức trên, tóm tắt ý chính và trả lời cực kỳ ngắn gọn, cô đọng (tối đa 1-2 câu ngắn), xưng hô thân thiện như một tổng đài viên thực tế. Tránh đọc cả đoạn văn dài lê thê.\n`;
            return context;
        }
    } catch (err) {
        console.error("Voice RAG Error:", err.message);
    }
    return '';
}

// 5. Hàm gọi AI sinh phản hồi văn bản cho cuộc gọi thoại
async function generateVoiceAiReply(question, callHistory, aiConfig) {
    const provider = aiConfig.aiProvider || 'openai';
    const apiKey = aiConfig.aiApiKey;
    const model = aiConfig.aiModel || (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash');

    if (!apiKey) return "Dạ, hệ thống chưa được thiết lập khóa kết nối AI. Rất xin lỗi bạn.";

    try {
        // Truy vấn RAG lấy bối cảnh tri thức online
        const ragContext = await queryVoiceRag(question, aiConfig);

        const systemPrompt = `${ragContext}\nBạn là một tổng đài viên AI đàm thoại bằng giọng nói của hệ thống ZaloGroup.
Nhiệm vụ của bạn là lắng nghe và nói chuyện trực tiếp với khách hàng qua điện thoại.
Quy tắc trả lời:
- Xưng hô "Dạ, em chào anh/chị" và xưng "em".
- Trả lời thật ngắn gọn, tự nhiên như giao tiếp nói thông thường (tối đa 15-20 từ một câu). Không dùng gạch đầu dòng, dấu sao Markdown hay các ký tự đặc biệt.
- Trả lời trực tiếp vào câu hỏi, phản hồi nhanh gọn, ấm áp.`;

        // Chuẩn bị lịch sử hội thoại dạng text
        const messages = [
            { role: 'system', content: systemPrompt }
        ];

        // Thêm 5 câu hội thoại gần nhất trong cuộc gọi
        const recentHistory = callHistory.slice(-5).map(h => ({
            role: h.role === 'ai' ? 'assistant' : 'user',
            content: h.text
        }));
        messages.push(...recentHistory);
        messages.push({ role: 'user', content: question });

        if (provider === 'openai') {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    max_tokens: 250
                })
            });

            if (response.ok) {
                const data = await response.json();
                return data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
            }
        } else if (provider === 'gemini') {
            // Chuyển đổi format cho Gemini
            const formattedContents = recentHistory.map(h => ({
                role: h.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: h.content }]
            }));
            formattedContents.push({
                role: 'user',
                parts: [{ text: question }]
            });

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: formattedContents,
                    systemInstruction: {
                        parts: [{ text: systemPrompt }]
                    },
                    generationConfig: {
                        maxOutputTokens: 250
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                return data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
            }
        }
    } catch (err) {
        console.error("Call AI Reply Error:", err.message);
    }
    return "Dạ, em chưa nghe rõ ý của anh chị, anh chị có thể nói lại được không ạ?";
}

// Helper: Tạo systemInstruction động từ cài đặt AI, Quy tắc từ khóa và Cơ sở tri thức
async function getSystemInstructionWithKnowledge(aiConfig) {
    let context = "";
    
    try {
        const rules = await rulesDb.find({ active: true });
        if (rules && rules.length > 0) {
            context += "[QUY TẮC PHẢN HỒI TỪ KHÓA ĐANG KÍCH HOẠT]:\n";
            rules.forEach(r => {
                context += `- Khi người dùng nói về từ khóa (${r.keywords.join(', ')}): Trả lời là "${r.reply}"\n`;
            });
            context += "\n";
        }
    } catch (err) {
        console.error("Lỗi đọc rulesDb cho Live API:", err.message);
    }

    try {
        const docs = await knowledgeDb.find({});
        if (docs && docs.length > 0) {
            context += "[THÔNG TIN TRI THỨC HỖ TRỢ]:\n";
            docs.forEach((d, idx) => {
                context += `Tài liệu ${idx + 1} (Tiêu đề: ${d.title || d.docTitle}): ${d.content || d.text}\n`;
            });
            context += "\n";
        }
    } catch (err) {
        console.error("Lỗi đọc knowledgeDb cho Live API:", err.message);
    }

    const systemPrompt = `Bạn là một trợ lý ảo đàm thoại thông minh bằng giọng nói (Voice Bot) của ZaloGroup.
Nhiệm vụ của bạn là đàm thoại hai chiều thời gian thực với người dùng.
Hãy sử dụng thông tin quy tắc từ khóa và tri thức dưới đây để hỗ trợ trả lời người dùng nếu có liên quan:

${context}

Quy tắc đàm thoại bắt buộc:
1. Phát ngôn hoàn toàn bằng tiếng Việt chuẩn.
2. Xưng "em" và gọi người dùng là "anh" hoặc "chị" tùy ngữ cảnh, luôn giữ thái độ cực kỳ lễ phép, ấm áp, thân thiện và chuyên nghiệp.
3. Câu trả lời của bạn phải CỰC KỲ ngắn gọn, súc tích (chỉ khoảng 1 đến 2 câu ngắn, tối đa 15-20 từ) vì đây là cuộc gọi thoại trực tiếp. Tránh liệt kê dài dòng hay đọc văn bản dài lê thê khiến người nghe mệt mỏi.
4. Tuyệt đối KHÔNG sử dụng các ký tự đặc biệt, dấu sao markdown (*), dấu thăng (#), dấu gạch đầu dòng (-) hay bất kỳ định dạng văn bản nào trong câu nói. Chỉ sử dụng chữ cái, chữ số và dấu câu thông thường (. , ? !) để bộ đọc giọng nói phát âm trôi chảy.
5. Cấu hình AI hệ thống bổ sung: ${aiConfig.aiSystemPrompt || "Bạn là một trợ lý AI hữu ích."}`;

    return systemPrompt;
}

// 6. WebSocket Socket.io Handler cho Cuộc gọi mô phỏng trực tiếp trên Trình duyệt (Virtual Call WebRTC Simulator)
function handleVirtualCallSockets(io) {
    // Lưu trữ tạm trạng thái các cuộc gọi ảo đang diễn ra
    const activeVirtualCalls = {};

    io.on('connection', (socket) => {
        // Sự kiện Admin bắt đầu cuộc gọi ảo đàm thoại
        socket.on('virtual-call.start', async (data) => {
            const { phoneNumber, name } = data;
            const callId = 'vcall_' + Math.random().toString(36).substring(2, 9);
            
            console.log(`VirtualCall: Khởi động cuộc gọi ảo ${callId} với ${name || phoneNumber}...`);
            
            // Lấy cài đặt AI hiện tại
            const aiConfig = await aiSettingsDb.findOne({}) || {};
            
            const isGeminiLive = aiConfig.aiProvider === 'gemini' && aiConfig.aiApiKey;
            
            activeVirtualCalls[callId] = {
                id: callId,
                phoneNumber: phoneNumber,
                name: name || 'Khách hàng',
                startTime: new Date(),
                history: [],
                mode: isGeminiLive ? 'live' : 'fallback',
                geminiWs: null
            };

            const call = activeVirtualCalls[callId];

            if (isGeminiLive) {
                console.log(`VirtualCall: Khởi tạo kết nối Gemini Live API cho cuộc gọi ${callId}...`);
                const apiKey = aiConfig.aiApiKey;
                
                // Xác định model name
                let modelName = aiConfig.aiModel || 'models/gemini-2.0-flash-exp';
                if (!modelName.startsWith('models/')) {
                    modelName = 'models/' + modelName;
                }
                
                // Fallback về gemini-2.5-flash-live nếu model không tương thích live
                if (!modelName.includes('live') && !modelName.includes('exp')) {
                    modelName = 'models/gemini-2.5-flash-live';
                }

                console.log(`VirtualCall: Sử dụng model Live API: ${modelName}`);

                const systemPrompt = await getSystemInstructionWithKnowledge(aiConfig);
                const wssUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

                try {
                    const geminiWs = new WebSocket(wssUrl);
                    call.geminiWs = geminiWs;

                    geminiWs.on('open', () => {
                        console.log(`Gemini WSS connected for call ${callId}`);
                        
                        // Gửi setup message
                        const setupMsg = {
                            setup: {
                                model: modelName,
                                generationConfig: {
                                    responseModalities: ["AUDIO"],
                                    speechConfig: {
                                        voiceConfig: {
                                            prebuiltVoiceConfig: {
                                                voiceName: "Aoede" // Warm voice
                                            }
                                        }
                                    },
                                    inputAudioTranscription: {},
                                    outputAudioTranscription: {}
                                },
                                systemInstruction: {
                                    parts: [{ text: systemPrompt }]
                                }
                            }
                        };
                        geminiWs.send(JSON.stringify(setupMsg));
                    });

                    geminiWs.on('message', (messageData) => {
                        try {
                            const response = JSON.parse(messageData.toString());
                            
                            // 1. Xử lý audio output (model audio data)
                            if (response.serverContent && response.serverContent.modelTurn && response.serverContent.modelTurn.parts) {
                                for (const part of response.serverContent.modelTurn.parts) {
                                    if (part.inlineData && part.inlineData.data) {
                                        socket.emit('virtual-call.audio-output', {
                                            callId: callId,
                                            audio: part.inlineData.data
                                        });
                                    }
                                }
                            }

                            // 2. Xử lý text transcripts
                            // User transcript
                            if (response.inputTranscription && response.inputTranscription.text) {
                                const userText = response.inputTranscription.text;
                                console.log(`[Gemini Live User Transcript]: ${userText}`);
                                call.history.push({ role: 'user', text: userText, time: new Date() });
                                socket.emit('virtual-call.text-output', {
                                    callId: callId,
                                    sender: 'Bạn',
                                    text: userText
                                });
                            }

                            // AI transcript (output transcription)
                            if (response.outputTranscription && response.outputTranscription.text) {
                                const aiText = response.outputTranscription.text;
                                const lastItem = call.history[call.history.length - 1];
                                
                                if (lastItem && lastItem.role === 'ai') {
                                    lastItem.text += aiText;
                                } else {
                                    call.history.push({ role: 'ai', text: aiText, time: new Date() });
                                }
                                
                                socket.emit('virtual-call.text-output', {
                                    callId: callId,
                                    sender: 'AI',
                                    text: call.history[call.history.length - 1].text,
                                    isIncremental: true,
                                    chunk: aiText
                                });
                            } else if (response.serverContent && response.serverContent.modelTurn && response.serverContent.modelTurn.parts) {
                                let textChunk = "";
                                for (const part of response.serverContent.modelTurn.parts) {
                                    if (part.text) {
                                        textChunk += part.text;
                                    }
                                }
                                if (textChunk) {
                                    const lastItem = call.history[call.history.length - 1];
                                    if (lastItem && lastItem.role === 'ai') {
                                        lastItem.text += textChunk;
                                    } else {
                                        call.history.push({ role: 'ai', text: textChunk, time: new Date() });
                                    }
                                    socket.emit('virtual-call.text-output', {
                                        callId: callId,
                                        sender: 'AI',
                                        text: call.history[call.history.length - 1].text,
                                        isIncremental: true,
                                        chunk: textChunk
                                    });
                                }
                            }

                            // 3. Xử lý ngắt lời (interrupted)
                            if (response.serverContent && response.serverContent.interrupted) {
                                console.log(`[Gemini Live] AI was interrupted by user speech!`);
                                const lastItem = call.history[call.history.length - 1];
                                if (lastItem && lastItem.role === 'ai' && !lastItem.text.endsWith(" (bị ngắt lời)")) {
                                    lastItem.text += " (bị ngắt lời)";
                                }
                                socket.emit('virtual-call.interrupted', { callId: callId });
                            }

                        } catch (err) {
                            console.error(`Lỗi xử lý message từ Gemini Live:`, err);
                        }
                    });

                    geminiWs.on('error', (err) => {
                        console.error(`Gemini WebSocket Error cho cuộc gọi ${callId}:`, err.message);
                        socket.emit('terminal.log', {
                            text: `Lỗi kết nối Gemini Live API: ${err.message}. Tự động chuyển sang chế độ giả lập.`,
                            type: 'error'
                        });
                        call.mode = 'fallback';
                        if (call.geminiWs) {
                            try { call.geminiWs.close(); } catch(e) {}
                            call.geminiWs = null;
                        }
                        call.history = [{ role: 'ai', text: "Dạ em chào anh chị, em là trợ lý đàm thoại thông minh ZaloGroup. Hệ thống vừa chuyển sang chế độ giả lập do kết nối Live API gián đoạn. Em có thể hỗ trợ gì ạ?", time: new Date() }];
                        socket.emit('virtual-call.connected', {
                            callId: callId,
                            mode: 'fallback',
                            welcomeText: call.history[0].text
                        });
                    });

                    geminiWs.on('close', (code, reason) => {
                        console.log(`Gemini WSS closed for call ${callId}. Code: ${code}, Reason: ${reason}`);
                    });

                    socket.emit('virtual-call.connected', {
                        callId: callId,
                        mode: 'live',
                        welcomeText: "Dạ em chào anh chị, em là trợ lý đàm thoại Live API của ZaloGroup. Em đã sẵn sàng lắng nghe và nói chuyện trực tiếp với anh chị rồi ạ!"
                    });
                    
                    call.history.push({
                        role: 'ai',
                        text: "Dạ em chào anh chị, em là trợ lý đàm thoại Live API của ZaloGroup. Em đã sẵn sàng lắng nghe và nói chuyện trực tiếp với anh chị rồi ạ!",
                        time: new Date()
                    });

                } catch (err) {
                    console.error("Lỗi kết nối Gemini Live WSS:", err.message);
                    call.mode = 'fallback';
                }
            }

            if (call.mode === 'fallback') {
                call.history = [
                    { role: 'ai', text: "Dạ em chào anh chị, em là trợ lý đàm thoại thông minh ZaloGroup. Em có thể hỗ trợ gì cho anh chị hôm nay ạ?", time: new Date() }
                ];
                socket.emit('virtual-call.connected', {
                    callId: callId,
                    mode: 'fallback',
                    welcomeText: call.history[0].text
                });
            }
        });

        // Nhận dữ liệu âm thanh PCM từ client
        socket.on('virtual-call.audio-input', (data) => {
            const { callId, audio } = data;
            const call = activeVirtualCalls[callId];
            if (!call || call.mode !== 'live' || !call.geminiWs) return;

            if (call.geminiWs.readyState === WebSocket.OPEN) {
                const chunk = {
                    realtimeInput: {
                        mediaChunks: [{
                            mimeType: "audio/pcm;rate=16000",
                            data: audio
                        }]
                    }
                };
                call.geminiWs.send(JSON.stringify(chunk));
            }
        });

        // Nhận tin nhắn câu hỏi của khách hàng (chế độ fallback)
        socket.on('virtual-call.message', async (data) => {
            const { callId, text } = data;
            const call = activeVirtualCalls[callId];
            if (!call) return;

            console.log(`VirtualCall (Fallback): Nhận tin từ client [${callId}]: ${text}`);
            call.history.push({ role: 'user', text: text, time: new Date() });

            const aiConfig = await aiSettingsDb.findOne({});
            const reply = await generateVoiceAiReply(text, call.history, aiConfig || {});
            
            call.history.push({ role: 'ai', text: reply, time: new Date() });
            
            socket.emit('virtual-call.reply', {
                callId: callId,
                text: reply
            });
        });

        // Kết thúc cuộc gọi
        socket.on('virtual-call.end', async (data) => {
            const { callId } = data;
            const call = activeVirtualCalls[callId];
            if (!call) return;

            if (call.geminiWs) {
                try {
                    call.geminiWs.close();
                } catch (e) {
                    console.error("Lỗi đóng Gemini WebSocket:", e.message);
                }
                call.geminiWs = null;
            }

            const duration = Math.floor((new Date() - call.startTime) / 1000);
            
            const callRecord = {
                stringeeCallId: callId,
                phoneNumber: call.phoneNumber,
                clientName: call.name,
                direction: 'outbound',
                status: 'completed',
                duration: duration,
                transcript: call.history,
                recordingUrl: call.mode === 'live' ? 'gemini_live_call.mp3' : 'virtual_call_simulation.mp3',
                createdAt: call.startTime
            };

            await callsDb.insert(callRecord);
            delete activeVirtualCalls[callId];

            console.log(`VirtualCall: Đã đóng cuộc gọi ảo ${callId} và lưu lịch sử. Thời lượng: ${duration}s.`);
            
            socket.emit('virtual-call.saved');
            io.emit('call.history.updated');
        });
    });
}

module.exports = {
    makeOutboundCall,
    generateStringeeToken,
    speechToTextWhisper,
    queryVoiceRag,
    generateVoiceAiReply,
    handleVirtualCallSockets
};
