/* ==========================================================================
   APP LOGIC - ZALO PERSONAL GROUP MANAGER (SIMULATION & LIVE API CONNECT)
   ========================================================================== */

// Global error handlers for images
window.handleAvatarError = function(img) {
    img.onerror = null;
    img.src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80';
};
window.handleChatImageError = function(img) {
    img.onerror = null;
    img.src = 'https://images.unsplash.com/photo-1560169897-fc0cdbdfa4d5?auto=format&fit=crop&w=400&q=80';
};

document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------
    // 1. STATE & DATA INITIALIZATION
    // -------------------------------------------------------------
    const BACKEND_URL = 'http://localhost:3000';
    let currentAppMode = 'live'; // 'simulation' hoặc 'live'
    let socket = null;
    let aiAllProviderKeys = {};
    
    // Initial Mock Accounts
    const defaultAccounts = [];

    // Initial Mock Groups
    const defaultGroups = [];

    // Initial Mock Members
    const defaultMembers = {};

    function getGroupMembers(groupId) {
        return defaultMembers[groupId] || [];
    }

    const defaultPending = {};

    function getPendingMembers(groupId) {
        return defaultPending[groupId] || [];
    }

    const defaultBanned = {};

    function getBannedMembers(groupId) {
        return defaultBanned[groupId] || [];
    }

    // Default Keyword Rules
    const defaultRules = [];

    // LocalStorage loading (lọc sạch dữ liệu demo trước đó nếu có)
    let accounts = (JSON.parse(localStorage.getItem('zalo_accounts')) || defaultAccounts).filter(a => a.name && !a.name.includes('(Demo)'));
    let groups = (JSON.parse(localStorage.getItem('zalo_groups')) || defaultGroups).filter(g => g.name && !g.name.includes('Marketing UEH') && !g.name.includes('AI & Automation') && !g.name.includes('CRM Demo') && !g.name.includes('Matrix') && !g.name.includes('VIP Business') && !g.name.includes('Cựu Sinh Viên') && !g.name.includes('Bản tin') && !g.name.includes('Học Tập Cục Bộ'));
    let rules = (JSON.parse(localStorage.getItem('zalo_rules')) || defaultRules).filter(r => r.reply && !r.reply.includes('Zalo CRM') && !r.reply.includes('ZaloGroup'));
    let campaigns = JSON.parse(localStorage.getItem('zalo_campaigns')) || [];
    let knowledge = [];
    let integrationSettings = JSON.parse(localStorage.getItem('zalo_integration')) || {
        url: 'http://localhost:3000',
        secret: 'zalo_secret_token_123456',
        library: 'zca-js'
    };

    let activeTab = 'overview';
    let selectedGroupForManage = null;
    let selectedGroupForMembers = null;
    let qrTimer = null;

    let currentGroupDataList = [];
    let currentGroupDataFilter = 'all';
    let currentGroupDataStatusFilter = 'all';
    let currentGroupDataSearch = '';

    // Save helpers
    function saveState() {
        localStorage.setItem('zalo_accounts', JSON.stringify(accounts));
        localStorage.setItem('zalo_groups', JSON.stringify(groups));
        localStorage.setItem('zalo_rules', JSON.stringify(rules));
        localStorage.setItem('zalo_campaigns', JSON.stringify(campaigns));
        localStorage.setItem('zalo_integration', JSON.stringify(integrationSettings));
    }

    // -------------------------------------------------------------
    // 2. DOM ELEMENTS SELECTORS
    // -------------------------------------------------------------
    const navItems = document.querySelectorAll('.nav-item');
    const tabPanels = document.querySelectorAll('.tab-panel');
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');
    const themeToggle = document.getElementById('theme-toggle');
    const logsTerminal = document.getElementById('terminal-logs');
    const clearLogsBtn = document.getElementById('clear-logs-btn');
    const modeSelect = document.getElementById('app-mode-select');

    // Modals
    const addAccountModal = document.getElementById('add-account-modal');
    const safetyModal = document.getElementById('safety-modal');
    const addRuleModal = document.getElementById('add-rule-modal');
    const addKnowledgeModal = document.getElementById('add-knowledge-modal');
    
    // Trigger buttons
    const addAccountHeaderBtn = document.getElementById('add-account-header-btn');
    const addAccountBtn = document.getElementById('add-account-btn');
    const openSafetyBtn = document.getElementById('open-safety-btn');
    const confirmSafetyBtn = document.getElementById('confirm-safety-btn');
    const addRuleBtn = document.getElementById('add-rule-btn');
    const cancelRuleBtn = document.getElementById('cancel-rule-btn');
    const addKnowledgeBtn = document.getElementById('add-knowledge-btn');
    const cancelKnowledgeBtn = document.getElementById('cancel-knowledge-btn');
    
    // Close modal buttons
    const closeModalBtn = document.getElementById('close-modal-btn');
    const closeSafetyModalBtn = document.getElementById('close-safety-modal-btn');
    const closeRuleModalBtn = document.getElementById('close-rule-modal-btn');
    const closeKnowledgeModalBtn = document.getElementById('close-knowledge-modal-btn');

    // Forms
    const newRuleForm = document.getElementById('new-rule-form');
    const newKnowledgeForm = document.getElementById('new-knowledge-form');
    const broadcastForm = document.getElementById('broadcast-form');
    const integrationForm = document.getElementById('integration-form');

    // Inputs
    const accountSearchInput = document.getElementById('account-search-input');
    const groupSearchInput = document.getElementById('group-search-input');
    const groupAccountFilter = document.getElementById('group-account-filter');
    const memberGroupSearch = document.getElementById('member-group-search');
    const knowledgeSearchInput = document.getElementById('knowledge-search-input');

    // Containers
    const accountsListContainer = document.getElementById('accounts-list-container');
    const groupsList = document.getElementById('groups-list');
    const groupDetailsPanel = document.getElementById('group-details-panel');
    const memberGroupList = document.getElementById('member-group-list');
    const memberMgrContent = document.getElementById('member-mgr-content');
    const memberNoSelection = document.getElementById('member-no-selection');
    const activeMembersTableBody = document.getElementById('active-members-table-body');
    const pendingMembersListContainer = document.getElementById('pending-members-list-container');
    const bannedMembersTableBody = document.getElementById('banned-members-table-body');
    const rulesContainer = document.getElementById('rules-container');
    const knowledgeListContainer = document.getElementById('knowledge-list-container');
    const broadcastSender = document.getElementById('broadcast-sender');
    const broadcastGroupsCheckboxes = document.getElementById('broadcast-groups-checkboxes');
    const campaignsContainer = document.getElementById('campaigns-container');

    // -------------------------------------------------------------
    // 3. WS SOCKET CONNECTION (LIVE MODE ONLY)
    // -------------------------------------------------------------
    function initWebSocket() {
        if (socket) return;
        
        console.log('WS: Đang thiết lập kết nối đến backend Node.js...');
        try {
            // Khởi tạo socket.io client
            socket = io(BACKEND_URL);
            
            socket.on('connect', () => {
                addTerminalLog('Đã thiết lập kết nối WebSocket với backend Zalo API.', 'success');
                // Tải dữ liệu thực tế ngay lập tức
                if (currentAppMode === 'live') {
                    refreshAllData();
                }
            });

            socket.on('disconnect', () => {
                addTerminalLog('Mất kết nối WebSocket đến backend.', 'error');
            });

            // Lắng nghe QR code từ backend
            socket.on('qr.code', (data) => {
                const qrImg = document.getElementById('qr-code-img');
                const progress = document.getElementById('qr-loading-progress');
                
                // Nạp mã QR thật nhận từ backend
                qrImg.innerHTML = `<img src="${data.qrBase64}" alt="Real QR Code" style="width:100%; height:100%; object-fit:contain;">`;
                progress.style.width = '100%';
                
                // Dừng bộ đếm thời gian QR mô phỏng nếu có
                if (qrTimer) clearInterval(qrTimer);
                
                addTerminalLog(`[Cổng Zalo] Đã tạo mã QR đăng nhập thành công cho ${data.phone}. Vui lòng quét mã trên điện thoại.`, 'info');
            });

            // Lắng nghe đăng nhập thành công
            socket.on('login.success', (userData) => {
                addTerminalLog(`[Cổng Zalo] Tài khoản ${userData.name} đăng nhập thành công.`, 'success');
                addAccountModal.classList.remove('active');
                
                if (currentAppMode === 'live') {
                    refreshAllData();
                }
            });

            // Lắng nghe sự kiện log từ server gửi lên
            socket.on('terminal.log', (log) => {
                addTerminalLog(log.text, log.type);
            });

            // Lắng nghe luồng log hệ thống chi tiết qua websocket
            socket.on('log.stream', (log) => {
                if (typeof appendSystemTerminalLog === 'function') {
                    appendSystemTerminalLog(log);
                }
            });

            // Lắng nghe sự kiện tin nhắn mới (real-time chat history update)
            socket.on('zalo.message', (data) => {
                if (selectedGroupForManage && selectedGroupForManage.id === data.groupId && selectedGroupForManage.accountId === data.accountId) {
                    const container = document.getElementById('group-chat-history-container');
                    if (container) {
                        const m = data.message;
                        const isSelf = m.isSelf;
                        
                        // Lấy bản đồ profile người gửi từ danh sách thành viên nhóm đã đồng bộ
                        const members = defaultMembers[selectedGroupForManage.id] || [];
                        const membersMap = {};
                        members.forEach(member => {
                            membersMap[member.id] = member;
                        });

                        const bubble = document.createElement('div');
                        bubble.className = `chat-bubble-item ${isSelf ? 'self' : ''}`;
                        
                        const timeStr = new Date(m.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                        
                        let chatContentHtml = '';
                        if (m.msgType === 'chat.photo') {
                            const imgUrl = m.content && (m.content.href || m.content.thumb || m.content.hdUrl);
                            if (imgUrl) {
                                chatContentHtml = `
                                    <div class="chat-image-preview-container">
                                        <img src="${imgUrl}" class="chat-image-preview" onclick="window.open('${imgUrl}')" onerror="handleChatImageError(this)">
                                    </div>
                                `;
                            } else {
                                chatContentHtml = `<div class="chat-bubble-text text-muted"><i>[Hình ảnh không khả dụng]</i></div>`;
                            }
                        } else if (m.msgType === 'chat.sticker') {
                            if (m.content && m.content.id && m.content.catId) {
                                const stickerUrl = `https://zalo-api.cdn.zalo.me/clipart/${m.content.catId}/${m.content.id}/240/1.png`;
                                chatContentHtml = `
                                    <div class="chat-sticker-container">
                                        <img src="${stickerUrl}" class="chat-sticker-preview" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                                        <span class="text-muted" style="display:none; font-size:0.8rem;">[Nhãn dán]</span>
                                    </div>
                                `;
                            } else {
                                chatContentHtml = `<div class="chat-bubble-text text-muted"><i>[Nhãn dán]</i></div>`;
                            }
                        } else {
                            const textContent = typeof m.content === 'string' ? m.content : (m.content ? JSON.stringify(m.content) : '');
                            chatContentHtml = `<div class="chat-bubble-text">${escapeHtml(textContent)}</div>`;
                        }

                        if (isSelf) {
                            bubble.innerHTML = `
                                <div class="chat-bubble-content-wrapper">
                                    ${chatContentHtml}
                                    <span class="chat-bubble-time">${timeStr}</span>
                                </div>
                            `;
                        } else {
                            const sender = membersMap[m.senderId] || {
                                name: 'Thành viên Zalo',
                                avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80'
                            };
                            bubble.innerHTML = `
                                <img src="${sender.avatar}" alt="${sender.name}" class="chat-bubble-avatar" onerror="handleAvatarError(this)">
                                <div class="chat-bubble-content-wrapper">
                                    <span class="chat-bubble-sender-name">${sender.name}</span>
                                    ${chatContentHtml}
                                    <span class="chat-bubble-time">${timeStr}</span>
                                </div>
                            `;
                        }
                        
                        const existingMsg = document.getElementById(`msg-${m.id}`);
                        if (!existingMsg) {
                            bubble.id = `msg-${m.id}`;
                            container.appendChild(bubble);
                            container.scrollTop = container.scrollHeight;
                        }
                    }
                }
            });

            // Lắng nghe tiến độ chiến dịch
            socket.on('campaign.progress', (data) => {
                // Tìm chiến dịch cập nhật tiến độ
                const camp = campaigns.find(c => c.id === data.campaignId);
                if (camp) {
                    camp.progress = data.progress;
                    camp.status = data.status;
                    saveState();
                    if (activeTab === 'automation') renderCampaigns();
                }
                
                // Đồng bộ từ Database backend nếu ở chế độ Live
                if (currentAppMode === 'live') {
                    fetchCampaignsFromBackend();
                }
            });

            // Lắng nghe sự kiện đồng bộ tài liệu thành công từ backend
            socket.on('knowledge.synced', (data) => {
                const btn = document.querySelector(`.sync-now-btn[data-id="${data.id}"]`);
                if (btn) {
                    const icon = btn.querySelector('i');
                    if (icon) icon.classList.remove('spin-anim');
                }
                
                if (data.success) {
                    addTerminalLog('Đồng bộ tài liệu tri thức thành công!', 'success');
                } else {
                    addTerminalLog(`Đồng bộ tài liệu tri thức thất bại: ${data.error || 'Lỗi không rõ'}`, 'error');
                }
                
                if (activeTab === 'knowledge' && currentKbSubTab === 'kb-documents') {
                    renderKnowledge();
                }
            });

            // Lắng nghe sự kiện lịch sử cuộc gọi cập nhật
            socket.on('call.history.updated', () => {
                if (activeTab === 'knowledge' && currentKbSubTab === 'kb-calls') {
                    renderCallLogs();
                }
            });

            // Lắng nghe sự kiện trích xuất dữ liệu nhóm mới từ AI
            socket.on('group.data.new', (payload) => {
                addTerminalLog(`[AI Trích xuất] Dữ liệu nhóm mới từ "${payload.data.senderName}": ${payload.data.keyInfo}`, 'success');
                if (selectedGroupForMembers && selectedGroupForMembers.id === payload.groupId) {
                    if (currentMemberSubTab === 'group-data') {
                        renderGroupData(selectedGroupForMembers);
                    }
                }
            });

            // Lắng nghe sự kiện cập nhật thống kê hiệu năng API/Event từ AI
            socket.on('ai.tools.stats.updated', (data) => {
                if (typeof window.updateAiToolStats === 'function') {
                    window.updateAiToolStats(data);
                }
            });

            // Lắng nghe sự kiện cập nhật cảm xúc/tâm lý thành viên real-time
            socket.on('member.sentiment.updated', (data) => {
                const openGroupId = document.getElementById('md-group-id').value;
                const openZaloId = document.getElementById('md-zalo-id').value;
                
                // Nếu admin đang mở đúng modal của thành viên đó
                if (memberDetailModal && memberDetailModal.classList.contains('active') && openGroupId === data.groupId && openZaloId === data.zaloId) {
                    addTerminalLog(`Tâm trạng của khách hàng cập nhật real-time: ${data.lastSentiment}`, 'info');
                    
                    // Cập nhật Badge cảm xúc trên modal
                    const sBadge = document.getElementById('md-sentiment-badge');
                    if (sBadge) {
                        sBadge.textContent = data.lastSentiment.toUpperCase();
                        if (data.lastSentiment === 'Vui vẻ') {
                            sBadge.style.background = 'rgba(46, 204, 113, 0.2)';
                            sBadge.style.color = '#2ecc71';
                            sBadge.style.border = '1px solid rgba(46, 204, 113, 0.3)';
                        } else if (data.lastSentiment === 'Tức giận') {
                            sBadge.style.background = 'rgba(231, 76, 60, 0.2)';
                            sBadge.style.color = '#e74c3c';
                            sBadge.style.border = '1px solid rgba(231, 76, 60, 0.3)';
                        } else if (data.lastSentiment === 'Lo lắng') {
                            sBadge.style.background = 'rgba(230, 126, 34, 0.2)';
                            sBadge.style.color = '#e67e22';
                            sBadge.style.border = '1px solid rgba(230, 126, 34, 0.3)';
                        } else {
                            sBadge.style.background = 'rgba(142, 68, 173, 0.2)';
                            sBadge.style.color = '#8e44ad';
                            sBadge.style.border = '1px solid rgba(142, 68, 173, 0.3)';
                        }
                    }
                    
                    // Đồng bộ giá trị dropdown chọn cảm xúc
                    const selectEl = document.getElementById('md-edit-sentiment');
                    if (selectEl) {
                        selectEl.value = data.lastSentiment;
                    }
                    
                    // Nạp lại biểu đồ và timeline lịch sử
                    loadSentimentHistory(data.groupId, data.zaloId);
                }
                
                // Đồng bộ cache địa phương defaultMembers
                const grpMembers = defaultMembers[data.groupId] || [];
                const localMember = grpMembers.find(m => m.id === data.zaloId);
                if (localMember) {
                    localMember.lastSentiment = data.lastSentiment;
                }
                
                // Làm mới danh sách thành viên nếu đang hiển thị tab đó
                if (activeTab === 'members' && selectedGroupForMembers && selectedGroupForMembers.id === data.groupId) {
                    renderActiveMembers(selectedGroupForMembers);
                }
            });

        } catch (e) {
            console.error('Không thể kết nối Socket.io:', e.message);
        }
    }

    // -------------------------------------------------------------
    // 4. LIVE API HTTP REQUESTS
    // -------------------------------------------------------------
    async function fetchAccountsFromBackend() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/accounts`);
            const json = await res.json();
            if (json.success) {
                accounts = json.data;
                saveState();
                if (activeTab === 'accounts') renderAccounts();
                updateGlobalBadges();
            }
        } catch (e) {
            addTerminalLog('Không thể tải danh sách tài khoản từ Backend. Kiểm tra kết nối server Node.js.', 'error');
        }
    }

    async function fetchRulesFromBackend() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/rules`);
            const json = await res.json();
            if (json.success) {
                rules = json.data;
                saveState();
                if (activeTab === 'automation') renderAutomation();
            }
        } catch (e) {
            console.error('Không thể lấy rules:', e.message);
        }
    }

    async function fetchCampaignsFromBackend() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/campaigns`);
            const json = await res.json();
            if (json.success) {
                campaigns = json.data;
                saveState();
                if (activeTab === 'automation') renderCampaigns();
            }
        } catch (e) {
            console.error('Không thể lấy danh sách chiến dịch:', e.message);
        }
    }

    async function refreshAllData() {
        if (currentAppMode === 'live') {
            // Tải song song tất cả dữ liệu để tăng hiệu năng (thay vì tuần tự chờ từng API)
            await Promise.all([
                fetchAccountsFromBackend(),
                fetchRulesFromBackend(),
                fetchCampaignsFromBackend(),
                fetchKnowledgeFromBackend()
            ]);
        }
    }

    // -------------------------------------------------------------
    // 5. MODE SELECTOR CHANGE
    // -------------------------------------------------------------
    if (modeSelect) {
        modeSelect.addEventListener('change', function() {
            currentAppMode = this.value;
            addTerminalLog(`Đã chuyển đổi hệ thống sang: ${currentAppMode === 'live' ? 'KẾT NỐI API THỰC TẾ (LIVE)' : 'MÔ PHỎNG (DEMO)'}`, 'success');
            
            const chartModeBadge = document.getElementById('chart-mode-badge');
            if (chartModeBadge) {
                chartModeBadge.textContent = currentAppMode === 'live' ? 'Dữ liệu thật (Live API)' : 'Chế độ mô phỏng';
            }

            if (currentAppMode === 'live') {
                // Khởi tạo WebSocket và nạp dữ liệu thật
                initWebSocket();
                refreshAllData();
            } else {
                // Reset về dữ liệu local mô phỏng mặc định
                accounts = JSON.parse(localStorage.getItem('zalo_accounts')) || defaultAccounts;
                groups = JSON.parse(localStorage.getItem('zalo_groups')) || defaultGroups;
                rules = JSON.parse(localStorage.getItem('zalo_rules')) || defaultRules;
                campaigns = JSON.parse(localStorage.getItem('zalo_campaigns')) || [];
                
                // Re-render tab hiện tại
                switchTab(activeTab);
                updateGlobalBadges();
            }
        });
    }

    // -------------------------------------------------------------
    // 6. TAB NAVIGATION CONTROL
    // -------------------------------------------------------------
    const tabMetaData = {
        overview: { title: 'Tổng quan hệ thống', subtitle: 'Giám sát trạng thái hoạt động và hiệu suất tự động hóa.' },
        accounts: { title: 'Tài khoản Zalo cá nhân', subtitle: 'Quản lý trạng thái và đăng nhập các tài khoản Zalo.' },
        groups: { title: 'Quản lý nhóm Zalo', subtitle: 'Xem thông tin, cấu hình thiết lập bảo mật và quyền hạn nhóm.' },
        members: { title: 'Thành viên & Duyệt nhóm', subtitle: 'Bổ nhiệm phó nhóm, kick thành viên spam, và duyệt yêu cầu tham gia.' },
        customers: { title: 'Hồ sơ Khách hàng & Bộ nhớ AI', subtitle: 'Quản lý thông tin chi tiết, phân loại VIP và bộ nhớ dài hạn của Zalo Bot.' },
        automation: { title: 'Tự động hóa & Chiến dịch', subtitle: 'Cài đặt bot từ khóa phản hồi nhanh và lên lịch phát tin hàng loạt.' },
        knowledge: { title: 'Cơ sở tri thức AI (RAG)', subtitle: 'Huấn luyện và quản lý tài liệu, chính sách để dạy Zalo Bot thông minh.' },
        integrations: { title: 'Tích hợp API & An toàn', subtitle: 'Kết nối cổng Webhook Node.js và n8n để đồng bộ dữ liệu.' },
        logs: { title: 'Nhật ký Log Hệ thống', subtitle: 'Theo dõi luồng hoạt động thời gian thực của máy chủ.' }
    };

    function switchTab(tabId) {
        activeTab = tabId;
        
        navItems.forEach(item => {
            if (item.getAttribute('data-tab') === tabId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        tabPanels.forEach(panel => {
            if (panel.id === `tab-${tabId}`) {
                panel.classList.add('active');
            } else {
                panel.classList.remove('active');
            }
        });

        if (tabMetaData[tabId]) {
            pageTitle.textContent = tabMetaData[tabId].title;
            pageSubtitle.textContent = tabMetaData[tabId].subtitle;
        }

        // Trigger tab-specific renders
        if (tabId === 'accounts') renderAccounts();
        if (tabId === 'groups') renderGroups();
        if (tabId === 'members') renderMembersTab();
        if (tabId === 'customers') renderCustomersTab();
        if (tabId === 'automation') renderAutomation();
        if (tabId === 'knowledge') renderKnowledge();
        if (tabId === 'integrations') {
            renderIntegrations();
            fetchAndRenderHealthStatus();
        }
        if (tabId === 'logs') renderSystemLogs();
        
        addTerminalLog(`Đã chuyển sang phân hệ: ${tabMetaData[tabId].title}`, 'info');
    }

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = item.getAttribute('data-tab');
            window.switchTab(tabId);
        });
    });

    // -------------------------------------------------------------
    // 7. TERMINAL LOGGER SIMULATION
    // -------------------------------------------------------------
    function addTerminalLog(text, type = 'info') {
        const time = new Date().toLocaleTimeString();
        const line = document.createElement('div');
        line.className = 'log-line';
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        timeSpan.textContent = `[${time}]`;
        
        const typeSpan = document.createElement('span');
        typeSpan.className = `log-${type}`;
        typeSpan.textContent = type.toUpperCase() + ': ';
        
        const textSpan = document.createElement('span');
        textSpan.textContent = text;
        
        line.appendChild(timeSpan);
        line.appendChild(typeSpan);
        line.appendChild(textSpan);
        
        logsTerminal.appendChild(line);
        logsTerminal.scrollTop = logsTerminal.scrollHeight;
        
        while (logsTerminal.childNodes.length > 100) {
            logsTerminal.removeChild(logsTerminal.firstChild);
        }
    }

    clearLogsBtn.addEventListener('click', () => {
        logsTerminal.innerHTML = '';
        addTerminalLog('Đã xóa lịch sử log của phiên làm việc.', 'info');
    });



    // Initial logs
    addTerminalLog('Khởi tạo giao diện Quản Lý Nhóm Zalo Cá Nhân...', 'info');
    addTerminalLog('Cổng giao diện Dashboard sẵn sàng.', 'success');

    // -------------------------------------------------------------
    // 8. ACCOUNTS MANAGEMENT PAGE
    // -------------------------------------------------------------
    function renderAccounts() {
        accountsListContainer.innerHTML = '';
        const searchQuery = accountSearchInput.value.toLowerCase();
        
        const filtered = accounts.filter(acc => 
            acc.name.toLowerCase().includes(searchQuery) || 
            acc.phone.includes(searchQuery)
        );

        filtered.forEach(acc => {
            const card = document.createElement('div');
            card.className = 'account-card';
            card.innerHTML = `
                <div class="account-card-header">
                    <img src="${acc.avatar}" alt="${acc.name}" class="acc-avatar ${acc.status}" onerror="handleAvatarError(this)">
                    <div class="acc-details">
                        <span class="acc-name">${acc.name}</span>
                        <span class="acc-phone">${acc.phone}</span>
                    </div>
                </div>
                <span class="acc-status-tag ${acc.status}">${acc.status === 'online' ? 'Online' : 'Offline'}</span>
                
                <div class="account-card-stats">
                    <div class="acc-stat-item">
                        <span class="acc-stat-value">${acc.groupsCount}</span>
                        <span class="acc-stat-label">Nhóm quản lý</span>
                    </div>
                    <div class="acc-stat-item">
                        <span class="acc-stat-value">${acc.msgsSent}</span>
                        <span class="acc-stat-label font-bold">Đã gửi hôm nay</span>
                    </div>
                </div>
                
                <div class="account-card-actions">
                    <button class="btn btn-secondary btn-sm flex-grow toggle-status-btn" data-id="${acc.id}">
                        <i data-lucide="power"></i>
                        <span>${acc.status === 'online' ? 'Ngắt kết nối' : 'Kết nối lại'}</span>
                    </button>
                    <button class="btn btn-outline-danger btn-sm delete-acc-btn" data-id="${acc.id}">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            `;
            accountsListContainer.appendChild(card);
        });

        lucide.createIcons();

        // Bind events
        document.querySelectorAll('.toggle-status-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const acc = accounts.find(a => a.id === id);
                if (acc) {
                    if (currentAppMode === 'simulation') {
                        acc.status = acc.status === 'online' ? 'offline' : 'online';
                        addTerminalLog(`Tài khoản ${acc.name} đã được thay đổi trạng thái sang ${acc.status.toUpperCase()}`, acc.status === 'online' ? 'success' : 'warn');
                        saveState();
                        renderAccounts();
                        updateGlobalBadges();
                    } else {
                        // Gọi API kết nối lại / ngắt kết nối thực tế
                        alert('Đối với tài khoản thật, vui lòng chọn xóa và kết nối lại qua quét mã QR.');
                    }
                }
            });
        });

        document.querySelectorAll('.delete-acc-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const acc = accounts.find(a => a.id === id);
                if (confirm(`Bạn có chắc chắn muốn gỡ tài khoản Zalo: ${acc.name}?`)) {
                    if (currentAppMode === 'simulation') {
                        accounts = accounts.filter(a => a.id !== id);
                        addTerminalLog(`Đã xóa tài khoản Zalo: ${acc.name} khỏi hệ thống.`, 'warn');
                        saveState();
                        renderAccounts();
                        updateGlobalBadges();
                    } else {
                        try {
                            const res = await fetch(`${BACKEND_URL}/api/accounts/remove`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ accountId: id })
                            });
                            const json = await res.json();
                            if (json.success) {
                                await fetchAccountsFromBackend();
                            } else {
                                alert('Không thể gỡ tài khoản: ' + json.error);
                            }
                        } catch (e) {
                            alert('Lỗi kết nối backend.');
                        }
                    }
                }
            });
        });
    }

    accountSearchInput.addEventListener('input', renderAccounts);

    // -------------------------------------------------------------
    // 9. ADD ACCOUNT MODAL & QR CODE PROCESS
    // -------------------------------------------------------------
    function openAddAccountModal() {
        const phone = prompt("Vui lòng nhập số điện thoại đăng nhập Zalo:", "0908 123 456");
        if (!phone) return;

        addAccountModal.classList.add('active');
        const qrImg = document.getElementById('qr-code-img');
        const progress = document.getElementById('qr-loading-progress');
        
        qrImg.innerHTML = '<i data-lucide="qr-code" class="qr-icon-placeholder"></i><span class="qr-status-overlay" id="qr-status-text">Đang tạo mã QR...</span>';
        progress.style.width = '0%';
        lucide.createIcons();

        if (currentAppMode === 'simulation') {
            // Luồng chạy mô phỏng
            let percent = 0;
            qrTimer = setInterval(() => {
                percent += 2;
                progress.style.width = `${percent}%`;
                
                if (percent === 10) {
                    qrImg.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=ZaloPersonalGroupManager_${Date.now()}" alt="Simulated QR Code" style="width:100%; height:100%; object-fit:contain;">`;
                }

                if (percent === 60) {
                    addTerminalLog('Thiết bị điện thoại đã nhận diện mã QR. Đang chờ phê duyệt...', 'info');
                    const overlay = document.createElement('div');
                    overlay.id = 'scan-overlay';
                    overlay.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); color:#22c55e; display:flex; align-items:center; justify-content:center; flex-direction:column; font-size:0.9rem; font-weight:700;';
                    overlay.innerHTML = '<i data-lucide="check-circle" style="width:40px; height:40px; margin-bottom:10px;"></i>Đang phê duyệt đăng nhập...';
                    qrImg.appendChild(overlay);
                    lucide.createIcons();
                }

                if (percent >= 100) {
                    clearInterval(qrTimer);
                    const randId = `acc-${Date.now()}`;
                    const newAcc = {
                        id: randId,
                        name: `Zalo Clone Demo ${Math.floor(10 + Math.random()*89)}`,
                        phone: phone,
                        status: 'online',
                        avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=100&q=80',
                        groupsCount: 3,
                        msgsSent: 0
                    };
                    accounts.push(newAcc);
                    addTerminalLog(`Kết nối tài khoản mới thành công: ${newAcc.name} (${newAcc.phone})`, 'success');
                    saveState();
                    addAccountModal.classList.remove('active');
                    
                    if (activeTab === 'accounts') renderAccounts();
                    updateGlobalBadges();
                }
            }, 100);
        } else {
            // Luồng gọi API thật
            initWebSocket(); // Đảm bảo websocket online
            fetch(`${BACKEND_URL}/api/accounts/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            }).then(res => res.json())
              .then(json => {
                  if (!json.success) {
                      alert('Lỗi khởi tạo QR: ' + json.error);
                      addAccountModal.classList.remove('active');
                  } else {
                      addTerminalLog(`[Cổng Zalo] Đang yêu cầu máy chủ Node.js sinh mã QR cho số ${phone}...`, 'info');
                  }
              }).catch(e => {
                  alert('Lỗi kết nối máy chủ API.');
                  addAccountModal.classList.remove('active');
              });
        }
    }

    addAccountHeaderBtn.addEventListener('click', openAddAccountModal);
    addAccountBtn.addEventListener('click', openAddAccountModal);

    closeModalBtn.addEventListener('click', () => {
        if (qrTimer) clearInterval(qrTimer);
        addAccountModal.classList.remove('active');
        addTerminalLog('Đã hủy tiến trình thêm tài khoản mới.', 'warn');
    });

    // -------------------------------------------------------------
    // 10. GROUPS MANAGEMENT PAGE
    // -------------------------------------------------------------
    async function renderGroups() {
        groupsList.innerHTML = '';
        const searchQuery = groupSearchInput.value.toLowerCase();
        const accountFilter = groupAccountFilter.value;
        
        // Tải danh sách bộ lọc tài khoản
        groupAccountFilter.innerHTML = '<option value="all">Tất cả tài khoản</option>';
        accounts.forEach(acc => {
            const opt = document.createElement('option');
            opt.value = acc.id;
            opt.textContent = acc.name;
            if (acc.id === accountFilter) opt.selected = true;
            groupAccountFilter.appendChild(opt);
        });

        // Nếu ở chế độ Live, đồng bộ nhóm thật
        if (currentAppMode === 'live') {
            const accountsToSync = accountFilter === 'all' 
                ? accounts.filter(a => a.status === 'online') 
                : accounts.filter(a => a.id === accountFilter && a.status === 'online');
                
            for (const acc of accountsToSync) {
                try {
                    const res = await fetch(`${BACKEND_URL}/api/groups?accountId=${acc.id}`);
                    const json = await res.json();
                    if (json.success && json.source === 'live') {
                        const newGroups = json.data.map(g => ({
                            ...g,
                            accountId: acc.id,
                            pendingCount: g.pendingCount || 0,
                            lockName: g.lockName !== undefined ? g.lockName : false,
                            lockDesc: g.lockDesc !== undefined ? g.lockDesc : false,
                            approveMembers: g.approveMembers !== undefined ? g.approveMembers : false,
                            allowLink: g.allowLink !== undefined ? g.allowLink : true,
                            groupPurpose: g.groupPurpose || '',
                            hostGroupId: g.hostGroupId || ''
                        }));
                        
                        // Loại bỏ nhóm cũ thuộc acc này và thêm nhóm mới
                        groups = groups.filter(g => g.accountId !== acc.id).concat(newGroups);
                    }
                } catch (e) {
                    console.error(`Lỗi lấy nhóm chat thực tế cho tài khoản ${acc.name}:`, e.message);
                }
            }
        }

        const filtered = groups.filter(grp => {
            const matchesSearch = grp.name.toLowerCase().includes(searchQuery);
            const matchesAccount = accountFilter === 'all' || grp.accountId === accountFilter;
            return matchesSearch && matchesAccount;
        });

        filtered.forEach(grp => {
            const senderAcc = accounts.find(a => a.id === grp.accountId) || { name: 'Không rõ' };
            const card = document.createElement('div');
            card.className = `group-item-card ${selectedGroupForManage && selectedGroupForManage.id === grp.id ? 'active' : ''}`;
            card.innerHTML = `
                <img src="${grp.avatar}" alt="${grp.name}" class="group-avatar" onerror="handleAvatarError(this)">
                <div class="group-item-info">
                    <span class="group-name" title="${grp.name}">${grp.name}</span>
                    <div class="group-meta">
                        <span class="group-badge-role role-${grp.role}">${grp.role === 'owner' ? 'Trưởng nhóm' : grp.role === 'admin' ? 'Phó nhóm' : 'Thành viên'}</span>
                        <span>&bull;</span>
                        <span>${grp.members} TV</span>
                        <span>&bull;</span>
                        <span class="text-muted" style="font-size:0.7rem">${senderAcc.name}</span>
                    </div>
                </div>
                ${grp.pendingCount > 0 ? `<span class="group-pending-dot" title="${grp.pendingCount} thành viên đang chờ duyệt"></span>` : ''}
            `;
            
            card.addEventListener('click', () => {
                selectedGroupForManage = grp;
                renderGroups();
                renderGroupDetails();
            });

            groupsList.appendChild(card);
        });

        if (!selectedGroupForManage && filtered.length > 0) {
            selectedGroupForManage = filtered[0];
            renderGroupDetails();
        } else if (filtered.length === 0) {
            groupDetailsPanel.innerHTML = `
                <div class="no-selection-placeholder">
                    <i data-lucide="search" class="placeholder-icon"></i>
                    <p>Không tìm thấy nhóm Zalo nào phù hợp với bộ lọc.</p>
                </div>
            `;
            lucide.createIcons();
        }
    }

    async function fetchGroupLinkDetails(grp) {
        if (currentAppMode === 'simulation') {
            grp.linkEnabled = grp.linkEnabled !== undefined ? grp.linkEnabled : true;
            grp.joinLink = grp.joinLink || `https://zalo.me/g/sim-${grp.id}`;
            updateGroupLinkUI(grp.linkEnabled, grp.joinLink);
            return;
        }
        
        try {
            const res = await fetch(`${BACKEND_URL}/api/groups/link?accountId=${grp.accountId}&groupId=${grp.id}`);
            const json = await res.json();
            if (json.success && json.data) {
                const enabled = json.data.enabled === 1 || json.data.enabled === true;
                grp.linkEnabled = enabled;
                grp.joinLink = json.data.link || '';
                updateGroupLinkUI(enabled, grp.joinLink);
            }
        } catch (err) {
            console.error('Lỗi khi fetch group link:', err);
        }
    }

    function updateGroupLinkUI(enabled, link) {
        const toggle = document.getElementById('group-link-toggle');
        const container = document.getElementById('group-link-info-container');
        const input = document.getElementById('group-link-input');
        const qrContainer = document.getElementById('group-link-qr-container');
        
        if (toggle) toggle.checked = enabled;
        if (container) {
            if (enabled) {
                container.classList.remove('hidden');
            } else {
                container.classList.add('hidden');
            }
        }
        if (input) input.value = link || '';
        if (qrContainer) {
            if (link) {
                qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(link)}" alt="Group QR Code" style="width:100%; height:100%; object-fit:contain;">`;
            } else {
                qrContainer.innerHTML = `<div class="text-muted text-center" style="font-size:0.75rem; color:#475569;">Không có link</div>`;
            }
        }
    }

    function renderGroupDetails() {
        if (!selectedGroupForManage) return;
        const grp = selectedGroupForManage;
        const senderAcc = accounts.find(a => a.id === grp.accountId) || { name: 'Không rõ' };
        
        groupDetailsPanel.innerHTML = `
            <div class="group-details-header">
                <img src="${grp.avatar}" alt="${grp.name}" class="group-details-avatar" onerror="handleAvatarError(this)">
                <div class="group-details-text">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <h2 id="group-detail-name">${grp.name}</h2>
                        <button class="btn btn-secondary btn-icon-only btn-sm" id="edit-group-name-btn" title="Đổi tên nhóm" style="padding: 2px; width: 24px; height: 24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center;">
                            <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i>
                        </button>
                    </div>
                    <p>Thuộc tài khoản: <strong>${senderAcc.name}</strong> &bull; Tổng: <strong>${grp.members} thành viên</strong></p>
                </div>
            </div>
            
            <div class="divider"></div>
            
            <h3 class="section-title">Cấu hình bảo mật & Quản lý</h3>
            <div class="group-settings-section">
                <div class="toggle-control-item">
                    <div class="toggle-info">
                        <span class="toggle-title">Khóa đổi tên & Avatar nhóm</span>
                        <span class="toggle-desc">Chỉ Trưởng nhóm và Phó nhóm mới có quyền thay đổi thông tin nhóm.</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" class="grp-toggle-setting" data-field="lockName" ${grp.lockName ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                </div>

                <div class="toggle-control-item">
                    <div class="toggle-info">
                        <span class="toggle-title">Khóa chỉnh sửa ghim mô tả</span>
                        <span class="toggle-desc">Chặn thành viên tự ý ghim tin nhắn hoặc sửa thông tin mô tả nhóm.</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" class="grp-toggle-setting" data-field="lockDesc" ${grp.lockDesc ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                </div>

                <div class="toggle-control-item">
                    <div class="toggle-info">
                        <span class="toggle-title">Duyệt thành viên mới</span>
                        <span class="toggle-desc">Khi thành viên quét link hoặc được mời vào nhóm phải có phê duyệt của Admin mới được tham gia.</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" class="grp-toggle-setting" data-field="approveMembers" ${grp.approveMembers ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                </div>

                <div class="toggle-control-item">
                    <div class="toggle-info">
                        <span class="toggle-title">Cho phép gửi Link liên kết</span>
                        <span class="toggle-desc">Cho phép thành viên gửi liên kết (URL) vào nhóm chat. Tắt sẽ tự động xóa tin chứa link.</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" class="grp-toggle-setting" data-field="allowLink" ${grp.allowLink ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                </div>
            </div>

            <div class="divider"></div>

            <h3 class="section-title">Mục đích nhóm & Vai trò AI</h3>
            <div class="group-settings-section" style="display:flex; flex-direction:column; gap:10px;">
                <p class="text-muted" style="font-size:0.72rem; line-height:1.4; margin:0;">Cấu hình mục tiêu hoạt động và cách hành xử của AI cho riêng nhóm chat này.</p>
                <div class="form-group" style="margin: 0;">
                    <textarea class="input-control" id="group-purpose-textarea" rows="3" placeholder="Ví dụ: Nhóm hỗ trợ bán hàng. AI cần xưng hô 'Dạ em chào anh/chị', trả lời thật lễ phép ngắn gọn..." style="width:100%; font-size:0.8rem; background:rgba(0,0,0,0.2); color:var(--text-color); border:1px solid var(--border-color); border-radius:var(--border-radius-sm); padding:8px; resize:vertical; min-height:60px;">${grp.groupPurpose || ''}</textarea>
                </div>
                
                <div class="form-group" style="margin: 0;">
                    <label for="group-host-key-select" style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px;">Nhóm nhận chỉ đạo riêng (Group Host Key)</label>
                    <select class="select-control" id="group-host-key-select" style="width:100%; font-size:0.8rem; background:rgba(0,0,0,0.2); color:var(--text-color); border:1px solid var(--border-color); border-radius:var(--border-radius-sm); padding:6px; height: auto;">
                        <option value="" style="background: var(--bg-card); color: var(--text-color);">-- Dùng cấu hình Global Host --</option>
                        ${groups.filter(g => g.id !== grp.id).map(g => `<option value="${g.id}" ${grp.hostGroupId === g.id ? 'selected' : ''} style="background: var(--bg-card); color: var(--text-color);">${g.name}</option>`).join('')}
                    </select>
                </div>

                <button class="btn btn-primary btn-sm btn-block" id="save-group-purpose-btn">
                    <i data-lucide="save" style="width:14px; height:14px; display:inline-block; vertical-align:middle; margin-right:4px;"></i> Lưu mục đích nhóm
                </button>
            </div>

            <div class="divider"></div>

            <h3 class="section-title">Link tham gia nhóm</h3>
            <div class="group-settings-section">
                <div class="toggle-control-item">
                    <div class="toggle-info">
                        <span class="toggle-title">Cho phép tham gia qua Link</span>
                        <span class="toggle-desc">Cho phép quét mã QR hoặc nhấp link để tự động tham gia nhóm chat.</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="group-link-toggle" ${grp.linkEnabled ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                </div>

                <div id="group-link-info-container" class="${grp.linkEnabled ? '' : 'hidden'}" style="margin-top: 10px;">
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label style="font-size:0.8rem; color:var(--text-muted);">Đường dẫn tham gia (Link)</label>
                        <div class="search-box" style="margin-top: 5px; position:relative;">
                            <input type="text" class="input-control" id="group-link-input" readonly value="${grp.joinLink || ''}" style="width:100%; padding-right:80px; font-size:0.85rem; background:rgba(0,0,0,0.2);">
                            <button class="btn btn-sm btn-primary" id="copy-group-link-btn" style="position:absolute; right:4px; top:4px; padding:4px 10px; font-size:0.8rem;">Sao chép</button>
                        </div>
                    </div>
                    <div class="form-group flex-column align-items-center" style="margin-top: 10px; display:flex; align-items:center;">
                        <label style="align-self:flex-start; margin-bottom:5px; font-size:0.8rem; color:var(--text-muted);">Mã QR tham gia nhóm</label>
                        <div id="group-link-qr-container" class="qr-code-wrapper" style="margin:5px auto; padding:10px; background-color:#ffffff; border-radius:var(--border-radius-md); width:140px; height:140px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(0,0,0,0.15);">
                            <div class="text-muted text-center" style="font-size:0.75rem; color:#475569;">Đang tải QR...</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="divider"></div>

            <div class="flex-column gap-10">
                <button class="btn btn-primary btn-block" id="go-to-members-btn">
                    <i data-lucide="user-cog"></i> Quản trị thành viên nhóm (${grp.members} TV)
                </button>
                <button class="btn btn-outline-danger btn-block" id="leave-group-btn">
                    <i data-lucide="log-out"></i> Rời nhóm chat
                </button>
                <button class="btn btn-outline-danger btn-block" id="disperse-group-btn" style="margin-top: 5px;">
                    <i data-lucide="trash-2"></i> Giải tán nhóm chat vĩnh viễn
                </button>
            </div>
        `;

        lucide.createIcons();

        // Bind lưu mục đích nhóm
        const saveGroupPurposeBtn = document.getElementById('save-group-purpose-btn');
        if (saveGroupPurposeBtn) {
            saveGroupPurposeBtn.addEventListener('click', () => {
                const purposeText = document.getElementById('group-purpose-textarea').value.trim();
                const hostGroupIdSelect = document.getElementById('group-host-key-select');
                const hostGroupId = hostGroupIdSelect ? hostGroupIdSelect.value : '';
                
                grp.groupPurpose = purposeText;
                grp.hostGroupId = hostGroupId;
                
                if (currentAppMode === 'live') {
                    fetch(`${BACKEND_URL}/api/groups/settings`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            accountId: grp.accountId,
                            groupId: grp.id,
                            settings: {
                                lockName: grp.lockName,
                                lockDesc: grp.lockDesc,
                                approveMembers: grp.approveMembers,
                                allowLink: grp.allowLink,
                                groupPurpose: grp.groupPurpose,
                                hostGroupId: grp.hostGroupId
                            }
                        })
                    }).then(res => res.json()).then(json => {
                        if (json.success) {
                            addTerminalLog(`Đã lưu mục đích và hướng dẫn AI cho nhóm "${grp.name}" thành công.`, 'success');
                        } else {
                            addTerminalLog(`Lỗi lưu mục đích nhóm: ${json.error}`, 'danger');
                        }
                    }).catch(err => {
                        addTerminalLog(`Lỗi kết nối khi lưu mục đích nhóm: ${err.message}`, 'danger');
                    });
                } else {
                    addTerminalLog(`[Mock] Đã lưu mục đích cho nhóm "${grp.name}": "${purposeText.substring(0, 30)}..."`, 'info');
                }
                saveState();
            });
        }

        // Bind toggles change
        document.querySelectorAll('.grp-toggle-setting').forEach(input => {
            input.addEventListener('change', () => {
                const field = input.getAttribute('data-field');
                grp[field] = input.checked;
                
                if (currentAppMode === 'live') {
                    fetch(`${BACKEND_URL}/api/groups/settings`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            accountId: grp.accountId,
                            groupId: grp.id,
                            settings: {
                                lockName: grp.lockName,
                                lockDesc: grp.lockDesc,
                                approveMembers: grp.approveMembers,
                                allowLink: grp.allowLink,
                                groupPurpose: grp.groupPurpose || '',
                                hostGroupId: grp.hostGroupId || ''
                            }
                        })
                    }).then(res => res.json()).then(json => {
                        if (json.success) {
                            addTerminalLog(`Đã đồng bộ cài đặt bảo mật cho nhóm "${grp.name}" lên máy chủ Zalo thành công.`, 'success');
                        } else {
                            addTerminalLog(`Lỗi đồng bộ cấu hình nhóm: ${json.error}`, 'danger');
                        }
                    }).catch(err => {
                        addTerminalLog(`Lỗi mạng khi đồng bộ cấu hình nhóm: ${err.message}`, 'danger');
                    });
                } else {
                    addTerminalLog(`Đã cập nhật cấu hình [${field}: ${input.checked}] cho nhóm "${grp.name}".`, 'info');
                }
                saveState();
            });
        });

        // Bind edit group name button
        document.getElementById('edit-group-name-btn').addEventListener('click', () => {
            const newName = prompt('Nhập tên nhóm mới:', grp.name);
            if (newName && newName.trim() !== '' && newName !== grp.name) {
                const oldName = grp.name;
                const updateNameAction = () => {
                    grp.name = newName;
                    const nameHeading = document.getElementById('group-detail-name');
                    if (nameHeading) nameHeading.textContent = newName;
                    addTerminalLog(`Đã đổi tên nhóm từ "${oldName}" thành "${newName}" thành công.`, 'success');
                    renderGroups(); // refresh groups list
                };
                
                if (currentAppMode === 'live') {
                    fetch(`${BACKEND_URL}/api/groups/update-name`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            accountId: grp.accountId,
                            groupId: grp.id,
                            name: newName
                        })
                    }).then(res => res.json()).then(json => {
                        if (json.success) {
                            updateNameAction();
                        } else {
                            addTerminalLog(`Lỗi đổi tên nhóm: ${json.error}`, 'danger');
                        }
                    }).catch(err => {
                        addTerminalLog(`Lỗi kết nối khi đổi tên nhóm: ${err.message}`, 'danger');
                    });
                } else {
                    updateNameAction();
                }
            }
        });

        // Bind group link toggle
        document.getElementById('group-link-toggle').addEventListener('change', async function() {
            const enable = this.checked;
            if (currentAppMode === 'simulation') {
                grp.linkEnabled = enable;
                grp.joinLink = grp.joinLink || `https://zalo.me/g/sim-${grp.id}`;
                updateGroupLinkUI(enable, grp.joinLink);
                addTerminalLog(`[Demo] Đã ${enable ? 'BẬT' : 'TẮT'} link tham gia nhóm.`, 'success');
                return;
            }
            
            try {
                const res = await fetch(`${BACKEND_URL}/api/groups/link/toggle`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        accountId: grp.accountId,
                        groupId: grp.id,
                        enable: enable
                    })
                });
                const json = await res.json();
                if (json.success) {
                    grp.linkEnabled = enable;
                    const newLink = json.data?.link || grp.joinLink || '';
                    grp.joinLink = newLink;
                    updateGroupLinkUI(enable, newLink);
                    addTerminalLog(`[Cổng Zalo] Đã ${enable ? 'BẬT' : 'TẮT'} link tham gia nhóm "${grp.name}" thành công.`, 'success');
                } else {
                    addTerminalLog(`Lỗi bật/tắt link nhóm: ${json.error}`, 'danger');
                    this.checked = !enable; // revert
                }
            } catch (err) {
                addTerminalLog(`Lỗi kết nối khi toggle link nhóm: ${err.message}`, 'danger');
                this.checked = !enable; // revert
            }
        });

        // Bind copy group link button
        document.getElementById('copy-group-link-btn').addEventListener('click', () => {
            const linkInput = document.getElementById('group-link-input');
            if (linkInput && linkInput.value) {
                navigator.clipboard.writeText(linkInput.value).then(() => {
                    alert('Đã sao chép link tham gia nhóm vào clipboard!');
                    addTerminalLog(`Đã sao chép link tham gia nhóm: ${linkInput.value}`, 'info');
                });
            }
        });

        document.getElementById('go-to-members-btn').addEventListener('click', () => {
            selectedGroupForMembers = grp;
            switchTab('members');
        });

        document.getElementById('leave-group-btn').addEventListener('click', () => {
            if (confirm(`Bạn có chắc chắn muốn rời nhóm "${grp.name}"? Thao tác này không thể hoàn tác.`)) {
                const leaveAction = () => {
                    groups = groups.filter(g => g.id !== grp.id);
                    addTerminalLog(`Đã rời nhóm "${grp.name}" thành công.`, 'warn');
                    selectedGroupForManage = null;
                    saveState();
                    renderGroups();
                    updateGlobalBadges();
                };

                if (currentAppMode === 'live') {
                    fetch(`${BACKEND_URL}/api/groups/leave`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            accountId: grp.accountId,
                            groupId: grp.id
                        })
                    }).then(res => res.json()).then(json => {
                        if (json.success) {
                            leaveAction();
                        } else {
                            addTerminalLog(`Lỗi rời nhóm: ${json.error}`, 'danger');
                        }
                    }).catch(err => {
                        addTerminalLog(`Lỗi kết nối khi rời nhóm: ${err.message}`, 'danger');
                    });
                } else {
                    leaveAction();
                }
            }
        });

        // Bind disperse group button
        document.getElementById('disperse-group-btn').addEventListener('click', () => {
            if (confirm(`CẢNH BÁO CỰC KỲ NGUY HIỂM!\nBạn có chắc chắn muốn giải tán vĩnh viễn nhóm "${grp.name}" không?\nTất cả thành viên sẽ bị mời ra khỏi nhóm.`)) {
                const disperseAction = () => {
                    groups = groups.filter(g => g.id !== grp.id);
                    addTerminalLog(`Đã giải tán nhóm "${grp.name}" thành công.`, 'warn');
                    selectedGroupForManage = null;
                    saveState();
                    renderGroups();
                    updateGlobalBadges();
                };
                
                if (currentAppMode === 'live') {
                    fetch(`${BACKEND_URL}/api/groups/disperse`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            accountId: grp.accountId,
                            groupId: grp.id
                        })
                    }).then(res => res.json()).then(json => {
                        if (json.success) {
                            disperseAction();
                        } else {
                            addTerminalLog(`Lỗi giải tán nhóm: ${json.error}`, 'danger');
                        }
                    }).catch(err => {
                        addTerminalLog(`Lỗi kết nối khi giải tán nhóm: ${err.message}`, 'danger');
                    });
                } else {
                    disperseAction();
                }
            }
        });

        // Fetch group link details asynchronously
        fetchGroupLinkDetails(grp);
    }

    groupSearchInput.addEventListener('input', renderGroups);
    groupAccountFilter.addEventListener('change', renderGroups);

    // -------------------------------------------------------------
    // 11. MEMBERS & APPROVALS PAGE
    // -------------------------------------------------------------
    let currentMemberSubTab = 'active-members';

    function renderMembersTab() {
        memberGroupList.innerHTML = '';
        const searchQuery = memberGroupSearch.value.toLowerCase();
        
        const filtered = groups.filter(grp => grp.name.toLowerCase().includes(searchQuery));

        filtered.forEach(grp => {
            const item = document.createElement('div');
            item.className = `simple-list-item ${selectedGroupForMembers && selectedGroupForMembers.id === grp.id ? 'active' : ''}`;
            item.innerHTML = `
                <span>${grp.name}</span>
                ${grp.pendingCount > 0 ? `<span class="badge badge-success">${grp.pendingCount}</span>` : `<span class="text-muted" style="font-size:0.75rem">${grp.members} TV</span>`}
            `;

            item.addEventListener('click', () => {
                selectedGroupForMembers = grp;
                renderMembersTab();
                loadGroupMembersManagement();
            });

            memberGroupList.appendChild(item);
        });

        if (selectedGroupForMembers) {
            loadGroupMembersManagement();
        } else if (filtered.length > 0) {
            selectedGroupForMembers = filtered[0];
            loadGroupMembersManagement();
        } else {
            memberNoSelection.classList.remove('hidden');
            memberMgrContent.classList.add('hidden');
        }
    }

    async function loadGroupMembersManagement() {
        if (!selectedGroupForMembers) return;
        const grp = selectedGroupForMembers;
        
        memberNoSelection.classList.add('hidden');
        memberMgrContent.classList.remove('hidden');

        document.getElementById('count-active-m').textContent = grp.members;
        document.getElementById('count-banned-m').textContent = getBannedMembers(grp.id).length;

        if (currentAppMode === 'live') {
            document.getElementById('count-pending-m').textContent = '...';
            try {
                const res = await fetch(`${BACKEND_URL}/api/groups/pending?accountId=${grp.accountId}&groupId=${grp.id}`);
                const json = await res.json();
                if (json.success) {
                    defaultPending[grp.id] = json.data;
                    grp.pendingCount = json.data.length;
                } else {
                    defaultPending[grp.id] = [];
                    grp.pendingCount = 0;
                }
            } catch (e) {
                console.error('Lỗi lấy danh sách thành viên chờ duyệt:', e);
                defaultPending[grp.id] = [];
                grp.pendingCount = 0;
            }

            // Tải danh sách thành viên thực tế của nhóm
            try {
                const res = await fetch(`${BACKEND_URL}/api/groups/members?accountId=${grp.accountId}&groupId=${grp.id}`);
                const json = await res.json();
                if (json.success) {
                    defaultMembers[grp.id] = json.data;
                    grp.members = json.data.length;
                    document.getElementById('count-active-m').textContent = grp.members;
                } else {
                    defaultMembers[grp.id] = [];
                }
            } catch (e) {
                console.error('Lỗi lấy danh sách thành viên nhóm:', e);
                defaultMembers[grp.id] = [];
            }
        }

        document.getElementById('count-pending-m').textContent = getPendingMembers(grp.id).length;
        renderSubTabContent();
    }

    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            currentMemberSubTab = btn.getAttribute('data-subtab');
            
            document.querySelectorAll('.sub-tab-panel').forEach(p => p.classList.remove('active'));
            document.getElementById(`subtab-${currentMemberSubTab}`).classList.add('active');
            
            renderSubTabContent();
        });
    });

    function renderSubTabContent() {
        if (!selectedGroupForMembers) return;
        const grp = selectedGroupForMembers;

        if (currentMemberSubTab === 'active-members') {
            renderActiveMembers(grp);
        } else if (currentMemberSubTab === 'pending-members') {
            renderPendingMembers(grp);
        } else if (currentMemberSubTab === 'banned-members') {
            renderBannedMembers(grp);
        } else if (currentMemberSubTab === 'group-chat-history') {
            renderGroupChatHistory(grp);
        } else if (currentMemberSubTab === 'group-board') {
            renderGroupBoard(grp);
        } else if (currentMemberSubTab === 'group-mindmap') {
            renderGroupMindmap(grp);
        } else if (currentMemberSubTab === 'group-data') {
            renderGroupData(grp);
        }
    }

    // -------------------------------------------------------------
    // GROUP BOARD (NOTE & REMINDER) LOGIC
    // -------------------------------------------------------------
    async function renderGroupBoard(grp) {
        const notesContainer = document.getElementById('group-notes-container');
        const remindersContainer = document.getElementById('group-reminders-container');
        
        if (notesContainer) notesContainer.innerHTML = '<div class="text-center text-muted p-10">Đang tải ghi chú...</div>';
        if (remindersContainer) remindersContainer.innerHTML = '<div class="text-center text-muted p-10">Đang tải nhắc hẹn...</div>';

        // Fetch Notes
        try {
            if (currentAppMode === 'simulation') {
                setTimeout(() => {
                    const mockNotes = [
                        { id: 'n1', type: 0, title: 'Lưu ý nội quy nhóm: Tránh spam tin nhắn quảng cáo.', creatorName: 'Phan Đăng Khoa', createTime: '10:00 11/06/2026', isPinned: true },
                        { id: 'n2', type: 0, title: 'Tài liệu hướng dẫn sử dụng bot Zalo Group.', creatorName: 'Phan Đăng Khoa', createTime: '09:00 11/06/2026', isPinned: false }
                    ];
                    renderNotesList(mockNotes);
                }, 500);
            } else {
                const res = await fetch(`${BACKEND_URL}/api/groups/board?accountId=${grp.accountId}&groupId=${grp.id}`);
                const json = await res.json();
                if (json.success && json.data) {
                    const notes = json.data.filter(item => item.type === 0);
                    renderNotesList(notes);
                } else {
                    if (notesContainer) notesContainer.innerHTML = '<div class="text-center text-muted p-10">Không có ghi chú nào.</div>';
                }
            }
        } catch (err) {
            console.error('Lỗi fetch board:', err);
            if (notesContainer) notesContainer.innerHTML = '<div class="text-center text-danger p-10">Lỗi tải ghi chú.</div>';
        }

        // Fetch Reminders
        try {
            if (currentAppMode === 'simulation') {
                setTimeout(() => {
                    const mockReminders = [
                        { id: 'r1', title: 'Họp giao ban dự án', startTime: Date.now() + 3600000 * 2, creatorId: 'me', repeat: 0 }
                    ];
                    renderRemindersList(mockReminders);
                }, 500);
            } else {
                const res = await fetch(`${BACKEND_URL}/api/groups/reminders?accountId=${grp.accountId}&groupId=${grp.id}`);
                const json = await res.json();
                if (json.success && json.data) {
                    renderRemindersList(json.data);
                } else {
                    if (remindersContainer) remindersContainer.innerHTML = '<div class="text-center text-muted p-10">Không có nhắc hẹn nào.</div>';
                }
            }
        } catch (err) {
            console.error('Lỗi fetch reminders:', err);
            if (remindersContainer) remindersContainer.innerHTML = '<div class="text-center text-danger p-10">Lỗi tải nhắc hẹn.</div>';
        }
    }

    function renderNotesList(notes) {
        const container = document.getElementById('group-notes-container');
        if (!container) return;
        
        if (notes.length === 0) {
            container.innerHTML = '<div class="text-center text-muted p-10">Không có ghi chú ghim nào.</div>';
            return;
        }

        container.innerHTML = '';
        notes.forEach(note => {
            const card = document.createElement('div');
            card.className = `note-item-card ${note.isPinned ? 'pinned' : ''}`;
            card.innerHTML = `
                <div class="note-item-title">${escapeHtml(note.title)}</div>
                <div class="note-item-meta">
                    <span>Người đăng: <strong>${escapeHtml(note.creatorName)}</strong></span>
                    <span>${note.createTime}</span>
                </div>
            `;
            container.appendChild(card);
        });
    }

    function renderRemindersList(reminders) {
        const container = document.getElementById('group-reminders-container');
        if (!container) return;

        if (reminders.length === 0) {
            container.innerHTML = '<div class="text-center text-muted p-10">Không có nhắc hẹn nào.</div>';
            return;
        }

        container.innerHTML = '';
        reminders.forEach(rem => {
            const card = document.createElement('div');
            card.className = 'reminder-item-card';
            
            const timeStr = new Date(parseInt(rem.startTime)).toLocaleString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });

            card.innerHTML = `
                <div class="reminder-icon-wrapper">
                    <i data-lucide="clock"></i>
                </div>
                <div class="reminder-item-content">
                    <span class="reminder-item-title">${escapeHtml(rem.title)}</span>
                    <span class="reminder-item-time">${timeStr}</span>
                </div>
            `;
            container.appendChild(card);
        });
        lucide.createIcons();
    }

    // Bind create note form submit
    const createNoteForm = document.getElementById('create-note-form');
    if (createNoteForm) {
        createNoteForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const grp = selectedGroupForMembers;
            if (!grp) return;

            const titleInput = document.getElementById('note-title-input');
            const title = titleInput.value.trim();
            if (!title) return;

            const submitBtn = createNoteForm.querySelector('button[type="submit"]');
            const oldHtml = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i data-lucide="refresh-cw" class="spin" style="width:12px; height:12px;"></i>';
            lucide.createIcons();

            const createAction = () => {
                titleInput.value = '';
                addTerminalLog(`Đã ghim ghi chú mới: "${title}" vào nhóm "${grp.name}".`, 'success');
                renderGroupBoard(grp);
            };

            if (currentAppMode === 'live') {
                try {
                    const res = await fetch(`${BACKEND_URL}/api/groups/board/note`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            accountId: grp.accountId,
                            groupId: grp.id,
                            title: title
                        })
                    });
                    const json = await res.json();
                    if (json.success) {
                        createAction();
                    } else {
                        alert('Lỗi tạo ghi chú: ' + json.error);
                    }
                } catch (err) {
                    alert('Lỗi kết nối server.');
                } finally {
                    submitBtn.innerHTML = oldHtml;
                }
            } else {
                createAction();
                submitBtn.innerHTML = oldHtml;
            }
        });
    }

    // Bind create reminder form submit
    const createReminderForm = document.getElementById('create-reminder-form');
    if (createReminderForm) {
        createReminderForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const grp = selectedGroupForMembers;
            if (!grp) return;

            const titleInput = document.getElementById('reminder-title-input');
            const timeInput = document.getElementById('reminder-time-input');
            const title = titleInput.value.trim();
            const timeVal = timeInput.value;
            
            if (!title || !timeVal) return;

            const timestamp = new Date(timeVal).getTime();
            if (timestamp < Date.now()) {
                alert('Thời gian nhắc hẹn phải ở tương lai!');
                return;
            }

            const submitBtn = createReminderForm.querySelector('button[type="submit"]');
            const oldHtml = submitBtn.innerHTML;
            submitBtn.innerHTML = '...';

            const createAction = () => {
                titleInput.value = '';
                timeInput.value = '';
                addTerminalLog(`Đã tạo nhắc hẹn: "${title}" vào lúc ${new Date(timestamp).toLocaleString('vi-VN')} trong nhóm "${grp.name}".`, 'success');
                renderGroupBoard(grp);
            };

            if (currentAppMode === 'live') {
                try {
                    const res = await fetch(`${BACKEND_URL}/api/groups/board/reminder`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            accountId: grp.accountId,
                            groupId: grp.id,
                            title: title,
                            startTime: timestamp
                        })
                    });
                    const json = await res.json();
                    if (json.success) {
                        createAction();
                    } else {
                        alert('Lỗi tạo nhắc hẹn: ' + json.error);
                    }
                } catch (err) {
                    alert('Lỗi kết nối server.');
                } finally {
                    submitBtn.innerHTML = oldHtml;
                }
            } else {
                createAction();
                submitBtn.innerHTML = oldHtml;
            }
        });
    }

    // -------------------------------------------------------------
    // ADD MEMBER BY PHONE MODAL LOGIC
    // -------------------------------------------------------------
    const addMemberModal = document.getElementById('add-member-modal');
    const openAddMemberModalBtn = document.getElementById('open-add-member-modal-btn');
    const closeAddMemberModalBtn = document.getElementById('close-add-member-modal-btn');
    const cancelAddMemberBtn = document.getElementById('cancel-add-member-btn');
    const searchMemberPhoneInput = document.getElementById('search-member-phone');
    const searchMemberPhoneBtn = document.getElementById('search-member-phone-btn');
    const searchMemberResultContainer = document.getElementById('search-member-result-container');

    let searchedUser = null; // Store searched user info

    if (openAddMemberModalBtn) {
        openAddMemberModalBtn.addEventListener('click', () => {
            if (!selectedGroupForMembers) {
                alert('Vui lòng chọn một nhóm trước!');
                return;
            }
            addMemberModal.classList.add('active');
            searchMemberPhoneInput.value = '';
            searchMemberResultContainer.innerHTML = `
                <div class="text-muted text-center" style="font-size: 0.85rem;" id="search-member-result-placeholder">
                    Nhập số điện thoại và nhấp Tìm kiếm
                </div>
            `;
            searchedUser = null;
        });
    }

    function closeMemberModal() {
        if (addMemberModal) addMemberModal.classList.remove('active');
    }

    if (closeAddMemberModalBtn) {
        closeAddMemberModalBtn.addEventListener('click', closeMemberModal);
    }
    if (cancelAddMemberBtn) {
        cancelAddMemberBtn.addEventListener('click', closeMemberModal);
    }

    if (searchMemberPhoneBtn) {
        searchMemberPhoneBtn.addEventListener('click', async () => {
            const phone = searchMemberPhoneInput.value.trim();
            if (!phone) {
                alert('Vui lòng nhập số điện thoại!');
                return;
            }

            searchMemberResultContainer.innerHTML = `
                <div class="text-center text-muted">
                    <i data-lucide="refresh-cw" class="spin" style="width: 24px; height: 24px; margin-bottom: 5px; display:inline-block;"></i>
                    <div>Đang tìm kiếm...</div>
                </div>
            `;
            lucide.createIcons();

            if (currentAppMode === 'simulation') {
                setTimeout(() => {
                    searchedUser = {
                        id: `u-${Date.now()}`,
                        name: `Thành viên Demo (${phone})`,
                        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80',
                        phone: phone
                    };
                    renderSearchResult(searchedUser);
                }, 800);
            } else {
                try {
                    const res = await fetch(`${BACKEND_URL}/api/users/find?accountId=${selectedGroupForMembers.accountId}&phone=${phone}`);
                    const json = await res.json();
                    if (json.success && json.data) {
                        searchedUser = json.data;
                        renderSearchResult(searchedUser);
                    } else {
                        searchMemberResultContainer.innerHTML = `
                            <div class="text-danger text-center" style="font-size: 0.85rem;">
                                ${json.error || 'Không tìm thấy tài khoản Zalo này.'}
                            </div>
                        `;
                    }
                } catch (err) {
                    searchMemberResultContainer.innerHTML = `
                        <div class="text-danger text-center" style="font-size: 0.85rem;">
                            Lỗi mạng hoặc server không phản hồi.
                        </div>
                    `;
                }
            }
        });
    }

    function renderSearchResult(user) {
        searchMemberResultContainer.innerHTML = `
            <div class="search-user-result-card" style="display:flex; align-items:center; justify-content:between; width:100%;">
                <div class="search-user-info-wrapper" style="display:flex; align-items:center; gap:12px;">
                    <img src="${user.avatar}" alt="${user.name}" class="search-user-avatar" style="width:40px; height:40px; border-radius:50%; object-fit:cover;" onerror="handleAvatarError(this)">
                    <span class="search-user-name" style="font-weight:600; color:var(--text-primary);">${user.name}</span>
                </div>
                <button class="btn btn-sm btn-success" id="btn-add-member-to-group" style="margin-left:auto;">
                    <i data-lucide="plus"></i> Thêm
                </button>
            </div>
        `;
        lucide.createIcons();

        document.getElementById('btn-add-member-to-group').addEventListener('click', async () => {
            const grp = selectedGroupForMembers;
            if (!grp) return;

            const addBtn = document.getElementById('btn-add-member-to-group');
            const oldHtml = addBtn.innerHTML;
            addBtn.innerHTML = '<i data-lucide="refresh-cw" class="spin"></i>';
            lucide.createIcons();

            const addAction = () => {
                const mList = getGroupMembers(grp.id);
                mList.push({
                    id: user.id,
                    name: user.name,
                    role: 'member',
                    phone: user.phone || '',
                    joinDate: new Date().toLocaleDateString('vi-VN'),
                    avatar: user.avatar
                });
                grp.members += 1;
                saveState();
                loadGroupMembersManagement();
                addTerminalLog(`Đã thêm thành viên "${user.name}" vào nhóm "${grp.name}" thành công.`, 'success');
                closeMemberModal();
            };

            if (currentAppMode === 'live') {
                try {
                    const res = await fetch(`${BACKEND_URL}/api/groups/members/add`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            accountId: grp.accountId,
                            groupId: grp.id,
                            userId: user.id
                        })
                    });
                    const json = await res.json();
                    if (json.success) {
                        addAction();
                    } else {
                        alert('Lỗi thêm thành viên: ' + json.error);
                        addBtn.innerHTML = oldHtml;
                        lucide.createIcons();
                    }
                } catch (err) {
                    alert('Lỗi kết nối backend.');
                    addBtn.innerHTML = oldHtml;
                    lucide.createIcons();
                }
            } else {
                addAction();
            }
        });
    }

    function escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    async function renderGroupChatHistory(grp) {
        const container = document.getElementById('group-chat-history-container');
        if (!container) return;

        container.innerHTML = '<div class="text-center text-muted p-20">Đang tải lịch sử chat...</div>';

        try {
            const res = await fetch(`${BACKEND_URL}/api/groups/history?accountId=${grp.accountId}&groupId=${grp.id}`);
            const json = await res.json();
            
            if (json.success && json.data && json.data.length > 0) {
                container.innerHTML = '';
                
                // Đảo ngược mảng để hiển thị tin nhắn cũ trên, mới dưới
                const msgs = [...json.data].reverse();
                
                // Lấy bản đồ profile người gửi từ danh sách thành viên nhóm đã đồng bộ
                const members = defaultMembers[grp.id] || [];
                const membersMap = {};
                members.forEach(m => {
                    membersMap[m.id] = m;
                });

                msgs.forEach(m => {
                    const isSelf = m.isSelf;
                    const bubble = document.createElement('div');
                    bubble.id = `msg-${m.id}`;
                    bubble.className = `chat-bubble-item ${isSelf ? 'self' : ''}`;
                    
                    const timeStr = new Date(m.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                    
                    let chatContentHtml = '';
                    if (m.msgType === 'chat.photo') {
                        const imgUrl = m.content && (m.content.href || m.content.thumb || m.content.hdUrl);
                        if (imgUrl) {
                            chatContentHtml = `
                                <div class="chat-image-preview-container">
                                    <img src="${imgUrl}" class="chat-image-preview" onclick="window.open('${imgUrl}')" onerror="handleChatImageError(this)">
                                </div>
                            `;
                        } else {
                            chatContentHtml = `<div class="chat-bubble-text text-muted"><i>[Hình ảnh không khả dụng]</i></div>`;
                        }
                    } else if (m.msgType === 'chat.sticker') {
                        if (m.content && m.content.id && m.content.catId) {
                            const stickerUrl = `https://zalo-api.cdn.zalo.me/clipart/${m.content.catId}/${m.content.id}/240/1.png`;
                            chatContentHtml = `
                                <div class="chat-sticker-container">
                                    <img src="${stickerUrl}" class="chat-sticker-preview" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                                    <span class="text-muted" style="display:none; font-size:0.8rem;">[Nhãn dán]</span>
                                </div>
                            `;
                        } else {
                            chatContentHtml = `<div class="chat-bubble-text text-muted"><i>[Nhãn dán]</i></div>`;
                        }
                    } else {
                        const textContent = typeof m.content === 'string' ? m.content : (m.content ? JSON.stringify(m.content) : '');
                        chatContentHtml = `<div class="chat-bubble-text">${escapeHtml(textContent)}</div>`;
                    }

                    if (isSelf) {
                        bubble.innerHTML = `
                            <div class="chat-bubble-content-wrapper">
                                ${chatContentHtml}
                                <span class="chat-bubble-time">${timeStr}</span>
                            </div>
                        `;
                    } else {
                        const sender = membersMap[m.senderId] || {
                            name: 'Thành viên Zalo',
                            avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80'
                        };
                        bubble.innerHTML = `
                            <img src="${sender.avatar}" alt="${sender.name}" class="chat-bubble-avatar" onerror="handleAvatarError(this)">
                            <div class="chat-bubble-content-wrapper">
                                <span class="chat-bubble-sender-name">${sender.name}</span>
                                ${chatContentHtml}
                                <span class="chat-bubble-time">${timeStr}</span>
                            </div>
                        `;
                    }
                    container.appendChild(bubble);
                });
                
                // Cuộn xuống cuối
                container.scrollTop = container.scrollHeight;
            } else {
                container.innerHTML = '<div class="text-center text-muted p-20">Không có tin nhắn nào trong lịch sử chat gần đây.</div>';
            }
        } catch (e) {
            console.error('Lỗi khi tải lịch sử chat:', e);
            container.innerHTML = '<div class="text-center text-danger p-20">Lỗi mạng khi tải lịch sử chat nhóm. Vui lòng thử lại.</div>';
        }
    }

    function renderActiveMembers(grp) {
        activeMembersTableBody.innerHTML = '';
        const searchVal = document.getElementById('member-search-input').value.toLowerCase();
        const roleFilter = document.getElementById('member-role-filter').value;
        const membersList = getGroupMembers(grp.id);

        const filtered = membersList.filter(m => {
            const matchesSearch = m.name.toLowerCase().includes(searchVal) || m.phone.includes(searchVal);
            const matchesRole = roleFilter === 'all' || m.role === roleFilter;
            return matchesSearch && matchesRole;
        });

        filtered.forEach(m => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="table-user-cell">
                        <img src="${escapeHtml(m.avatar || '')}" alt="${escapeHtml(m.name)}" class="table-user-avatar" onerror="handleAvatarError(this)">
                        <span class="table-user-name">${escapeHtml(m.name)}</span>
                    </div>
                </td>
                <td>
                    <span class="group-badge-role role-${m.role}">${m.role === 'creator' ? 'Trưởng nhóm' : m.role === 'admin' ? 'Phó nhóm' : 'Thành viên'}</span>
                </td>
                <td class="text-muted">${escapeHtml(m.phone || 'Chưa có')}</td>
                <td class="text-muted">${m.joinDate || 'N/A'}</td>
                <td>
                    <div class="action-btn-group">
                        <button class="btn btn-outline-success btn-sm call-member-btn" data-id="${m.id}" data-phone="${m.phone || ''}" data-name="${m.name}" title="Gọi điện thoại thoại AI"><i data-lucide="phone"></i></button>
                        <button class="btn btn-outline-info btn-sm view-member-profile-btn" data-zalo-id="${m.id}" data-group-id="${grp.id}" data-name="${m.name}" data-avatar="${m.avatar}" title="Hồ sơ & Trí nhớ AI"><i data-lucide="brain"></i></button>
                        
                        ${m.role === 'member' ? `
                            <button class="btn btn-outline-primary btn-sm promote-admin-btn" data-id="${m.id}" title="Thăng chức Phó nhóm"><i data-lucide="shield-check"></i></button>
                        ` : m.role === 'admin' ? `
                            <button class="btn btn-outline-secondary btn-sm demote-admin-btn" data-id="${m.id}" title="Hạ chức Thành viên"><i data-lucide="shield-alert"></i></button>
                        ` : ''}
                        
                        ${m.role !== 'creator' ? `
                            <button class="btn btn-outline-warning btn-sm transfer-owner-btn" data-id="${m.id}" title="Chuyển quyền Trưởng nhóm"><i data-lucide="crown"></i></button>
                            <button class="btn btn-outline-danger btn-sm kick-member-btn" data-id="${m.id}" title="Trục xuất thành viên"><i data-lucide="user-minus"></i></button>
                            <button class="btn btn-danger btn-sm ban-member-btn" data-id="${m.id}" title="Ban/Chặn khỏi nhóm"><i data-lucide="slash"></i></button>
                        ` : ''}
                    </div>
                </td>
            `;
            activeMembersTableBody.appendChild(tr);
        });

        lucide.createIcons();

        // Bind Xem Hồ sơ & Trí nhớ AI
        document.querySelectorAll('.view-member-profile-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const zaloId = btn.getAttribute('data-zalo-id');
                const groupId = btn.getAttribute('data-group-id');
                const name = btn.getAttribute('data-name');
                const avatar = btn.getAttribute('data-avatar');
                openMemberDetailModal(groupId, zaloId, name, avatar);
            });
        });

        // Bind Gọi điện thành viên
        document.querySelectorAll('.call-member-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name');
                let phone = btn.getAttribute('data-phone');
                
                if (!phone) {
                    phone = prompt(`Thành viên "${name}" chưa có số điện thoại trong hồ sơ Zalo. Vui lòng nhập số điện thoại để kết nối cuộc gọi thoại AI:`);
                    if (phone === null) return; // Nhấn Hủy
                    phone = phone.trim();
                }
                
                if (!phone) {
                    alert("Vui lòng nhập số điện thoại hợp lệ.");
                    return;
                }
                
                try {
                    addTerminalLog(`Đang gửi yêu cầu gọi Outbound VoIP tới thành viên "${name}" (${phone})...`, 'info');
                    const res = await fetch(`${BACKEND_URL}/api/calls/trigger`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phoneNumber: phone })
                    });
                    const json = await res.json();
                    if (json.success) {
                        addTerminalLog(`Đang thực hiện cuộc gọi: ${json.message}`, 'success');
                    } else {
                        addTerminalLog(`Không thể thực hiện cuộc gọi: ${json.error}`, 'error');
                    }
                } catch (e) {
                    addTerminalLog(`Lỗi kết nối khi gọi điện: ${e.message}`, 'error');
                }
            });
        });

        // Bind member actions
        document.querySelectorAll('.promote-admin-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const member = membersList.find(m => m.id === id);
                if (member) {
                    const promoteAction = () => {
                        member.role = 'admin';
                        addTerminalLog(`Đã bổ nhiệm "${member.name}" làm Phó nhóm trong "${grp.name}".`, 'success');
                        renderActiveMembers(grp);
                    };

                    if (currentAppMode === 'live') {
                        fetch(`${BACKEND_URL}/api/groups/members/action`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                accountId: grp.accountId,
                                groupId: grp.id,
                                memberId: member.id,
                                action: 'promote'
                            })
                        }).then(res => res.json()).then(json => {
                            if (json.success) {
                                promoteAction();
                            } else {
                                addTerminalLog(`Lỗi thăng chức phó nhóm: ${json.error}`, 'danger');
                            }
                        }).catch(err => {
                            addTerminalLog(`Lỗi mạng khi thăng chức phó nhóm: ${err.message}`, 'danger');
                        });
                    } else {
                        promoteAction();
                    }
                }
            });
        });

        document.querySelectorAll('.demote-admin-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const member = membersList.find(m => m.id === id);
                if (member) {
                    const demoteAction = () => {
                        member.role = 'member';
                        addTerminalLog(`Đã bãi nhiệm chức danh Phó nhóm của "${member.name}" trong "${grp.name}".`, 'warn');
                        renderActiveMembers(grp);
                    };

                    if (currentAppMode === 'live') {
                        fetch(`${BACKEND_URL}/api/groups/members/action`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                accountId: grp.accountId,
                                groupId: grp.id,
                                memberId: member.id,
                                action: 'demote'
                            })
                        }).then(res => res.json()).then(json => {
                            if (json.success) {
                                demoteAction();
                            } else {
                                addTerminalLog(`Lỗi hạ chức phó nhóm: ${json.error}`, 'danger');
                            }
                        }).catch(err => {
                            addTerminalLog(`Lỗi mạng khi hạ chức phó nhóm: ${err.message}`, 'danger');
                        });
                    } else {
                        demoteAction();
                    }
                }
            });
        });

        document.querySelectorAll('.kick-member-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const member = membersList.find(m => m.id === id);
                if (confirm(`Bạn có chắc muốn trục xuất "${member.name}" ra khỏi nhóm chat này?`)) {
                    const kickAction = () => {
                        defaultMembers[grp.id] = membersList.filter(m => m.id !== id);
                        grp.members -= 1;
                        addTerminalLog(`Đã trục xuất "${member.name}" khỏi nhóm "${grp.name}".`, 'warn');
                        saveState();
                        loadGroupMembersManagement();
                        renderActiveMembers(grp);
                    };

                    if (currentAppMode === 'live') {
                        fetch(`${BACKEND_URL}/api/groups/members/action`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                accountId: grp.accountId,
                                groupId: grp.id,
                                memberId: member.id,
                                action: 'kick'
                            })
                        }).then(res => res.json()).then(json => {
                            if (json.success) {
                                kickAction();
                            } else {
                                addTerminalLog(`Lỗi trục xuất thành viên: ${json.error}`, 'danger');
                            }
                        }).catch(err => {
                            addTerminalLog(`Lỗi mạng khi trục xuất thành viên: ${err.message}`, 'danger');
                        });
                    } else {
                        kickAction();
                    }
                }
            });
        });

        document.querySelectorAll('.ban-member-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const member = membersList.find(m => m.id === id);
                const reason = prompt('Nhập lý do chặn thành viên này:', 'Gửi link rác, spam');
                if (reason !== null) {
                    const banAction = () => {
                        defaultMembers[grp.id] = membersList.filter(m => m.id !== id);
                        grp.members -= 1;
                        
                        if (!defaultBanned[grp.id]) defaultBanned[grp.id] = [];
                        defaultBanned[grp.id].push({
                            id: member.id,
                            name: member.name,
                            bannedTime: new Date().toLocaleDateString('vi-VN'),
                            reason: reason || 'Kích hoạt bởi Admin',
                            avatar: member.avatar
                        });
                        
                        addTerminalLog(`Đã chặn vĩnh viễn "${member.name}" khỏi nhóm "${grp.name}". Lý do: ${reason}`, 'danger');
                        saveState();
                        loadGroupMembersManagement();
                        renderActiveMembers(grp);
                    };

                    if (currentAppMode === 'live') {
                        fetch(`${BACKEND_URL}/api/groups/members/action`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                accountId: grp.accountId,
                                groupId: grp.id,
                                memberId: member.id,
                                action: 'ban'
                            })
                        }).then(res => res.json()).then(json => {
                            if (json.success) {
                                banAction();
                            } else {
                                addTerminalLog(`Lỗi chặn thành viên: ${json.error}`, 'danger');
                            }
                        }).catch(err => {
                            addTerminalLog(`Lỗi mạng khi chặn thành viên: ${err.message}`, 'danger');
                        });
                    } else {
                        banAction();
                    }
                }
            });
        });

        // Bind transfer owner action
        document.querySelectorAll('.transfer-owner-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const member = membersList.find(m => m.id === id);
                if (member && confirm(`Bạn có chắc chắn muốn chuyển nhượng quyền Trưởng nhóm cho "${member.name}" không?\nSau khi chuyển, bạn sẽ mất quyền Trưởng nhóm.`)) {
                    const transferAction = () => {
                        membersList.forEach(m => {
                            if (m.role === 'creator') m.role = 'member';
                        });
                        member.role = 'creator';
                        addTerminalLog(`Đã chuyển quyền Trưởng nhóm cho "${member.name}" trong "${grp.name}".`, 'success');
                        renderActiveMembers(grp);
                    };

                    if (currentAppMode === 'live') {
                        fetch(`${BACKEND_URL}/api/groups/change-owner`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                accountId: grp.accountId,
                                groupId: grp.id,
                                newOwnerId: member.id
                            })
                        }).then(res => res.json()).then(json => {
                            if (json.success) {
                                transferAction();
                            } else {
                                addTerminalLog(`Lỗi chuyển quyền Trưởng nhóm: ${json.error}`, 'danger');
                            }
                        }).catch(err => {
                            addTerminalLog(`Lỗi mạng khi chuyển quyền Trưởng nhóm: ${err.message}`, 'danger');
                        });
                    } else {
                        transferAction();
                    }
                }
            });
        });
    }

    function renderPendingMembers(grp) {
        pendingMembersListContainer.innerHTML = '';
        const pendingList = getPendingMembers(grp.id);

        if (pendingList.length === 0) {
            pendingMembersListContainer.innerHTML = '<div class="text-center text-muted p-20">Không có yêu cầu phê duyệt nào đang chờ.</div>';
            return;
        }

        pendingList.forEach(p => {
            const card = document.createElement('div');
            card.className = 'pending-item-card';
            card.innerHTML = `
                <div class="pending-item-user">
                    <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&q=80" alt="${p.name}" class="table-user-avatar" onerror="handleAvatarError(this)">
                    <div class="pending-user-details">
                        <span class="pending-user-name">${p.name} (${p.phone})</span>
                        <span class="pending-user-info">Lý do: <strong>${p.reason}</strong> &bull; ${p.time}</span>
                    </div>
                </div>
                <div class="action-btn-group">
                    <button class="btn btn-success btn-sm approve-m-btn" data-id="${p.id}">
                        <i data-lucide="check"></i> Đồng ý
                    </button>
                    <button class="btn btn-outline-danger btn-sm decline-m-btn" data-id="${p.id}">
                        Từ chối
                    </button>
                </div>
            `;
            pendingMembersListContainer.appendChild(card);
        });

        lucide.createIcons();

        document.querySelectorAll('.approve-m-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const req = pendingList.find(p => p.id === id);
                if (req) {
                    const approveAction = () => {
                        const mList = getGroupMembers(grp.id);
                        mList.push({
                            id: `m-${Date.now()}`,
                            name: req.name,
                            role: 'member',
                            phone: req.phone,
                            joinDate: new Date().toLocaleDateString('vi-VN'),
                            avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80'
                        });
                        
                        defaultPending[grp.id] = pendingList.filter(p => p.id !== id);
                        grp.pendingCount = defaultPending[grp.id].length;
                        grp.members += 1;
                        
                        addTerminalLog(`Đã duyệt cho "${req.name}" vào nhóm "${grp.name}".`, 'success');
                        saveState();
                        loadGroupMembersManagement();
                        updateGlobalBadges();
                    };

                    if (currentAppMode === 'live') {
                        fetch(`${BACKEND_URL}/api/groups/pending/review`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                accountId: grp.accountId,
                                groupId: grp.id,
                                userIds: [req.id],
                                isApprove: true
                            })
                        }).then(res => res.json()).then(json => {
                            if (json.success) {
                                approveAction();
                            } else {
                                addTerminalLog(`Lỗi duyệt thành viên: ${json.error}`, 'danger');
                            }
                        }).catch(err => {
                            addTerminalLog(`Lỗi mạng khi duyệt thành viên: ${err.message}`, 'danger');
                        });
                    } else {
                        approveAction();
                    }
                }
            });
        });

        document.querySelectorAll('.decline-m-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const req = pendingList.find(p => p.id === id);
                if (req) {
                    const declineAction = () => {
                        defaultPending[grp.id] = pendingList.filter(p => p.id !== id);
                        grp.pendingCount = defaultPending[grp.id].length;
                        
                        addTerminalLog(`Đã từ chối phê duyệt thành viên "${req.name}" tham gia nhóm "${grp.name}".`, 'warn');
                        saveState();
                        loadGroupMembersManagement();
                        updateGlobalBadges();
                    };

                    if (currentAppMode === 'live') {
                        fetch(`${BACKEND_URL}/api/groups/pending/review`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                accountId: grp.accountId,
                                groupId: grp.id,
                                userIds: [req.id],
                                isApprove: false
                            })
                        }).then(res => res.json()).then(json => {
                            if (json.success) {
                                declineAction();
                            } else {
                                addTerminalLog(`Lỗi từ chối thành viên: ${json.error}`, 'danger');
                            }
                        }).catch(err => {
                            addTerminalLog(`Lỗi mạng khi từ chối thành viên: ${err.message}`, 'danger');
                        });
                    } else {
                        declineAction();
                    }
                }
            });
        });
    }

    function renderBannedMembers(grp) {
        bannedMembersTableBody.innerHTML = '';
        const bannedList = getBannedMembers(grp.id);

        if (bannedList.length === 0) {
            bannedMembersTableBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted p-20">Danh sách chặn trống.</td></tr>';
            return;
        }

        bannedList.forEach(b => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="table-user-cell">
                        <img src="${b.avatar}" alt="${b.name}" class="table-user-avatar" onerror="handleAvatarError(this)">
                        <span class="table-user-name">${b.name}</span>
                    </div>
                </td>
                <td class="text-muted">${b.bannedTime}</td>
                <td class="text-danger">${b.reason}</td>
                <td>
                    <button class="btn btn-outline-primary btn-sm revoke-ban-btn" data-id="${b.id}">
                        <i data-lucide="rotate-ccw"></i> Gỡ chặn
                    </button>
                </td>
            `;
            bannedMembersTableBody.appendChild(tr);
        });

        lucide.createIcons();

        document.querySelectorAll('.revoke-ban-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const ban = bannedList.find(b => b.id === id);
                if (ban) {
                    const unbanAction = () => {
                        defaultBanned[grp.id] = bannedList.filter(b => b.id !== id);
                        addTerminalLog(`Đã gỡ chặn cho "${ban.name}" khỏi nhóm "${grp.name}".`, 'success');
                        saveState();
                        loadGroupMembersManagement();
                    };

                    if (currentAppMode === 'live') {
                        fetch(`${BACKEND_URL}/api/groups/members/action`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                accountId: grp.accountId,
                                groupId: grp.id,
                                memberId: ban.id,
                                action: 'unban'
                            })
                        }).then(res => res.json()).then(json => {
                            if (json.success) {
                                unbanAction();
                            } else {
                                addTerminalLog(`Lỗi gỡ chặn thành viên: ${json.error}`, 'danger');
                            }
                        }).catch(err => {
                            addTerminalLog(`Lỗi mạng khi gỡ chặn thành viên: ${err.message}`, 'danger');
                        });
                    } else {
                        unbanAction();
                    }
                }
            });
        });
    }

    document.getElementById('member-search-input').addEventListener('input', () => {
        if (selectedGroupForMembers) renderActiveMembers(selectedGroupForMembers);
    });
    document.getElementById('member-role-filter').addEventListener('change', () => {
        if (selectedGroupForMembers) renderActiveMembers(selectedGroupForMembers);
    });
    memberGroupSearch.addEventListener('input', renderMembersTab);

    document.getElementById('approve-all-btn').addEventListener('click', () => {
        if (!selectedGroupForMembers) return;
        const grp = selectedGroupForMembers;
        const pendingList = getPendingMembers(grp.id);
        if (pendingList.length === 0) return;

        if (confirm(`Bạn muốn phê duyệt toàn bộ ${pendingList.length} yêu cầu tham gia nhóm này?`)) {
            const approveAction = () => {
                const mList = getGroupMembers(grp.id);
                pendingList.forEach(req => {
                    mList.push({
                        id: `m-${Date.now()}-${Math.random()}`,
                        name: req.name,
                        role: 'member',
                        phone: req.phone,
                        joinDate: new Date().toLocaleDateString('vi-VN'),
                        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80'
                    });
                    grp.members += 1;
                });

                defaultPending[grp.id] = [];
                grp.pendingCount = 0;
                
                addTerminalLog(`Đã phê duyệt hàng loạt cho toàn bộ thành viên đang chờ vào nhóm "${grp.name}".`, 'success');
                saveState();
                loadGroupMembersManagement();
                updateGlobalBadges();
            };

            if (currentAppMode === 'live') {
                const userIds = pendingList.map(p => p.id);
                fetch(`${BACKEND_URL}/api/groups/pending/review`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        accountId: grp.accountId,
                        groupId: grp.id,
                        userIds: userIds,
                        isApprove: true
                    })
                }).then(res => res.json()).then(json => {
                    if (json.success) {
                        approveAction();
                    } else {
                        addTerminalLog(`Lỗi phê duyệt hàng loạt: ${json.error}`, 'danger');
                    }
                }).catch(err => {
                    addTerminalLog(`Lỗi mạng khi phê duyệt hàng loạt: ${err.message}`, 'danger');
                });
            } else {
                approveAction();
            }
        }
    });

    document.getElementById('decline-all-btn').addEventListener('click', () => {
        if (!selectedGroupForMembers) return;
        const grp = selectedGroupForMembers;
        const pendingList = getPendingMembers(grp.id);
        if (pendingList.length === 0) return;

        if (confirm(`Bạn có chắc chắn từ chối tất cả ${pendingList.length} yêu cầu vào nhóm?`)) {
            const declineAction = () => {
                defaultPending[grp.id] = [];
                grp.pendingCount = 0;
                addTerminalLog(`Đã từ chối tất cả yêu cầu tham gia vào nhóm "${grp.name}".`, 'warn');
                saveState();
                loadGroupMembersManagement();
                updateGlobalBadges();
            };

            if (currentAppMode === 'live') {
                const userIds = pendingList.map(p => p.id);
                fetch(`${BACKEND_URL}/api/groups/pending/review`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        accountId: grp.accountId,
                        groupId: grp.id,
                        userIds: userIds,
                        isApprove: false
                    })
                }).then(res => res.json()).then(json => {
                    if (json.success) {
                        declineAction();
                    } else {
                        addTerminalLog(`Lỗi từ chối hàng loạt: ${json.error}`, 'danger');
                    }
                }).catch(err => {
                    addTerminalLog(`Lỗi mạng khi từ chối hàng loạt: ${err.message}`, 'danger');
                });
            } else {
                declineAction();
            }
        }
    });

    // -------------------------------------------------------------
    // 12. AUTOMATION & CAMPAIGNS PAGE
    // -------------------------------------------------------------
    function renderAutomation() {
        // Render Auto-Reply Rules
        rulesContainer.innerHTML = '';
        rules.forEach(rule => {
            const card = document.createElement('div');
            card.className = 'rule-item-card';
            card.innerHTML = `
                <div class="rule-card-header">
                    <div class="rule-keywords-wrapper">
                        ${rule.keywords.map(kw => `<span class="keyword-badge">${kw}</span>`).join('')}
                        <span class="badge ${rule.matchType === 'contains' ? 'badge-info' : rule.matchType === 'exact' ? 'badge-success' : 'badge-success'}">${rule.matchType === 'contains' ? 'Chứa từ khóa' : rule.matchType === 'exact' ? 'Khớp 100%' : 'Regex'}</span>
                    </div>
                    <div class="action-btn-group" style="align-items:center">
                        <label class="switch">
                            <input type="checkbox" class="rule-active-toggle" data-id="${rule.id}" ${rule.active ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                        <button class="btn btn-outline-danger btn-sm delete-rule-btn" data-id="${rule.id}" style="padding:4px 8px; height:24px"><i data-lucide="trash-2" style="width:12px; height:12px"></i></button>
                    </div>
                </div>
                <div class="rule-reply-text">${rule.reply.replace(/\n/g, '<br>')}</div>
            `;
            rulesContainer.appendChild(card);
        });

        // Tải các tài khoản active vào Form Broadcast
        broadcastSender.innerHTML = '';
        accounts.filter(a => a.status === 'online').forEach(acc => {
            const opt = document.createElement('option');
            opt.value = acc.id;
            opt.textContent = `${acc.name} (${acc.phone})`;
            broadcastSender.appendChild(opt);
        });

        // Checkbox chọn nhóm nhận tin
        broadcastGroupsCheckboxes.innerHTML = '';
        groups.forEach(grp => {
            const label = document.createElement('label');
            label.className = 'checkbox-label-item';
            label.innerHTML = `
                <input type="checkbox" name="broadcast-target-groups" value="${grp.id}">
                <span>${grp.name} (${grp.members} TV)</span>
            `;
            broadcastGroupsCheckboxes.appendChild(label);
        });

        renderCampaigns();
        lucide.createIcons();

        // Bind events
        document.querySelectorAll('.rule-active-toggle').forEach(input => {
            input.addEventListener('change', async () => {
                const id = input.getAttribute('data-id');
                const rule = rules.find(r => r.id === id);
                if (rule) {
                    if (currentAppMode === 'simulation') {
                        rule.active = input.checked;
                        addTerminalLog(`Quy tắc bot từ khóa [${rule.keywords.slice(0, 2).join(', ')}] đã được ${rule.active ? 'BẬT' : 'TẮT'}.`, 'info');
                        saveState();
                    } else {
                        try {
                            await fetch(`${BACKEND_URL}/api/rules/toggle`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id, active: input.checked })
                            });
                            addTerminalLog(`[Cổng Zalo] Cập nhật bật/tắt quy tắc thực tế thành công.`, 'info');
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }
            });
        });

        document.querySelectorAll('.delete-rule-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                if (confirm(`Bạn muốn xóa quy tắc bot phản hồi này?`)) {
                    if (currentAppMode === 'simulation') {
                        rules = rules.filter(r => r.id !== id);
                        addTerminalLog(`Đã xóa quy tắc bot từ khóa.`, 'warn');
                        saveState();
                        renderAutomation();
                    } else {
                        try {
                            await fetch(`${BACKEND_URL}/api/rules/${id}`, { method: 'DELETE' });
                            addTerminalLog(`[Cổng Zalo] Đã xóa quy tắc từ khóa thật trên database server.`, 'warn');
                            await fetchRulesFromBackend();
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }
            });
        });
    }

    function renderCampaigns() {
        campaignsContainer.innerHTML = '';
        if (campaigns.length === 0) {
            campaignsContainer.innerHTML = '<div class="text-center text-muted p-20" style="font-size:0.85rem">Không có chiến dịch gửi tin nào đang chạy.</div>';
            return;
        }

        campaigns.forEach(c => {
            const senderAcc = accounts.find(a => a.id === c.accountId) || { name: 'Zalo Account' };
            const card = document.createElement('div');
            card.className = 'campaign-item';
            
            let statusText = 'Đang gửi';
            let statusClass = 'status-running';
            if (c.status === 'scheduled') {
                statusText = 'Đã lên lịch';
                statusClass = 'status-scheduled';
            } else if (c.status === 'completed') {
                statusText = 'Hoàn thành';
                statusClass = 'status-completed';
            }

            card.innerHTML = `
                <div class="campaign-meta">
                    <span class="campaign-title">Gửi tin: "${c.message.substring(0, 30)}${c.message.length > 30 ? '...' : ''}"</span>
                    <span class="campaign-status-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="text-muted" style="font-size:0.75rem; margin-top:2px;">
                    Tài khoản: <strong>${senderAcc.name}</strong> &bull; Nhóm nhận: <strong>${c.targets.length} nhóm</strong>
                </div>
                ${c.status !== 'scheduled' ? `
                    <div class="campaign-progress-container mt-10">
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill" style="width: ${c.progress}%"></div>
                        </div>
                        <span class="progress-text">${c.progress}%</span>
                    </div>
                ` : `
                    <div class="text-muted" style="font-size:0.75rem; margin-top:4px;">
                        Thời gian gửi dự kiến: <strong class="text-amber">${new Date(c.scheduledTime).toLocaleString('vi-VN')}</strong>
                    </div>
                `}
            `;
            campaignsContainer.appendChild(card);
        });
    }

    addRuleBtn.addEventListener('click', () => {
        addRuleModal.classList.add('active');
    });

    cancelRuleBtn.addEventListener('click', () => {
        addRuleModal.classList.remove('active');
        newRuleForm.reset();
    });

    closeRuleModalBtn.addEventListener('click', () => {
        addRuleModal.classList.remove('active');
        newRuleForm.reset();
    });

    newRuleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const keywords = document.getElementById('rule-keywords').value.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
        const matchType = document.getElementById('rule-match-type').value;
        const reply = document.getElementById('rule-reply').value;
        const active = document.getElementById('rule-active').checked;

        if (keywords.length === 0) return;

        if (currentAppMode === 'simulation') {
            const newRule = {
                id: `rule-${Date.now()}`,
                keywords,
                matchType,
                reply,
                active
            };
            rules.push(newRule);
            addTerminalLog(`Đã thêm quy tắc phản hồi từ khóa mới: [${keywords.join(', ')}]`, 'success');
            saveState();
            addRuleModal.classList.remove('active');
            newRuleForm.reset();
            renderAutomation();
        } else {
            try {
                const res = await fetch(`${BACKEND_URL}/api/rules`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ keywords, matchType, reply, active })
                });
                const json = await res.json();
                if (json.success) {
                    addTerminalLog(`[Cổng Zalo] Thêm quy tắc từ khóa thật thành công.`, 'success');
                    await fetchRulesFromBackend();
                }
            } catch (err) {
                alert('Lỗi lưu quy tắc vào Backend.');
            }
            addRuleModal.classList.remove('active');
            newRuleForm.reset();
        }
    });

    // Form kích hoạt chiến dịch Broadcast
    broadcastForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const accountId = broadcastSender.value;
        const checkedBoxes = document.querySelectorAll('input[name="broadcast-target-groups"]:checked');
        const message = document.getElementById('broadcast-msg').value;
        const delay = parseInt(document.getElementById('broadcast-delay').value);
        const scheduleVal = document.getElementById('broadcast-schedule').value;

        if (checkedBoxes.length === 0) {
            alert('Vui lòng chọn ít nhất một nhóm nhận tin nhắn!');
            return;
        }

        const targets = Array.from(checkedBoxes).map(cb => cb.value);
        
        if (currentAppMode === 'simulation') {
            const newCampaign = {
                id: `camp-${Date.now()}`,
                accountId,
                targets,
                message,
                delay,
                progress: 0,
                status: scheduleVal ? 'scheduled' : 'running',
                scheduledTime: scheduleVal ? scheduleVal : null
            };

            campaigns.unshift(newCampaign);
            saveState();
            broadcastForm.reset();
            renderAutomation();

            const sender = accounts.find(a => a.id === accountId);
            
            if (newCampaign.status === 'scheduled') {
                addTerminalLog(`Chiến dịch gửi hàng loạt đã được lên lịch thành công cho tài khoản ${sender.name}.`, 'success');
            } else {
                addTerminalLog(`Kích hoạt chiến dịch gửi tin hàng loạt từ tài khoản "${sender.name}" đến ${targets.length} nhóm chat...`, 'success');
                simulateCampaignProgress(newCampaign.id);
            }
        } else {
            try {
                const res = await fetch(`${BACKEND_URL}/api/broadcast`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accountId, targets, message, delay, scheduledTime: scheduleVal || null })
                });
                const json = await res.json();
                if (json.success) {
                    addTerminalLog(`[Cổng Zalo] Đã đẩy chiến dịch broadcast thật lên hàng đợi Queue.`, 'success');
                    broadcastForm.reset();
                    await fetchCampaignsFromBackend();
                }
            } catch (err) {
                alert('Lỗi tạo chiến dịch gửi tin.');
            }
        }
    });



    // Blacklist tag inputs
    const tagInputField = document.getElementById('tag-input-field');
    if (tagInputField) {
        tagInputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = tagInputField.value.trim().toLowerCase();
                if (val.length > 0) {
                    const tag = document.createElement('span');
                    tag.className = 'tag';
                    tag.innerHTML = `${val} <i data-lucide="x" class="remove-tag"></i>`;
                    tagInputField.parentNode.insertBefore(tag, tagInputField);
                    tagInputField.value = '';
                    lucide.createIcons();
                    
                    addTerminalLog(`Đã thêm từ khóa cấm mới: "${val}"`, 'info');
                    
                    tag.querySelector('.remove-tag').addEventListener('click', () => {
                        tag.remove();
                        addTerminalLog(`Đã gỡ bỏ từ khóa cấm: "${val}"`, 'info');
                    });
                }
            }
        });

        document.querySelectorAll('.remove-tag').forEach(icon => {
            icon.addEventListener('click', (e) => {
                const tag = icon.closest('.tag');
                const text = tag.textContent.trim();
                tag.remove();
                addTerminalLog(`Đã gỡ bỏ từ khóa cấm: "${text}"`, 'info');
            });
        });
    }

    // -------------------------------------------------------------
    // 13. INTEGRATIONS & CONNECTIONS PAGE
    // -------------------------------------------------------------
    function renderAiGroupsCheckboxes(selectedGroups = []) {
        const container = document.getElementById('ai-groups-checkboxes');
        if (!container) return;
        container.innerHTML = '';
        groups.forEach(grp => {
            const label = document.createElement('label');
            label.className = 'checkbox-label-item';
            label.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:0.8rem; cursor:pointer; margin-bottom: 2px;';
            
            const isChecked = selectedGroups.includes(grp.id) ? 'checked' : '';
            label.innerHTML = `
                <input type="checkbox" name="ai-target-groups" value="${grp.id}" ${isChecked}>
                <span>${grp.name} (${grp.members} TV)</span>
            `;
            container.appendChild(label);
        });
    }

    function saveCurrentKeysToActiveProvider() {
        const container = document.getElementById('api-keys-container');
        if (!container) return;
        const activeProvider = container.dataset.provider || (document.getElementById('ai-provider') ? document.getElementById('ai-provider').value : 'openai');
        aiAllProviderKeys[activeProvider] = getApiKeyPoolValues();
    }

    function renderApiKeyPool(keys, provider = null) {
        const container = document.getElementById('api-keys-container');
        if (!container) return;
        
        // Resolve provider to set on dataset BEFORE we clear the old inputs (which triggers focusout)
        const activeProvider = provider || (document.getElementById('ai-provider') ? document.getElementById('ai-provider').value : 'openai');
        container.dataset.provider = activeProvider;
        
        container.innerHTML = '';
        
        if (!keys || keys.length === 0) {
            keys = [''];
        }
        
        keys.forEach((key, index) => {
            const row = document.createElement('div');
            row.className = 'api-key-row';
            row.style.cssText = 'display:flex; gap:8px; align-items:center; margin-bottom:5px;';
            
            const input = document.createElement('input');
            input.type = 'password';
            input.className = 'input-control api-key-input';
            input.placeholder = index === 0 ? 'Nhập API Key chính (Default)' : `Nhập API Key phụ ${index}`;
            input.style.flex = '1';
            input.value = key || '';
            
            input.addEventListener('input', () => {
                saveCurrentKeysToActiveProvider();
            });
            input.addEventListener('change', () => {
                saveCurrentKeysToActiveProvider();
            });
            
            const btnDelete = document.createElement('button');
            btnDelete.type = 'button';
            btnDelete.className = 'btn btn-sm btn-outline-danger';
            btnDelete.style.cssText = 'padding: 6px 10px; font-size: 0.8rem;';
            btnDelete.innerHTML = 'Xóa';
            btnDelete.onclick = () => {
                if (container.querySelectorAll('.api-key-row').length <= 1) {
                    input.value = '';
                    saveCurrentKeysToActiveProvider();
                    return;
                }
                row.remove();
                updateAddKeyButtonState();
                saveCurrentKeysToActiveProvider();
            };
            
            row.appendChild(input);
            row.appendChild(btnDelete);
            container.appendChild(row);
        });
        updateAddKeyButtonState();
    }

    function getApiKeyPoolValues() {
        const container = document.getElementById('api-keys-container');
        if (!container) return [];
        return Array.from(container.querySelectorAll('.api-key-input')).map(input => input.value.trim());
    }

    function updateAddKeyButtonState() {
        const btnAddKey = document.getElementById('btn-add-api-key');
        const container = document.getElementById('api-keys-container');
        if (btnAddKey && container) {
            const rowsCount = container.querySelectorAll('.api-key-row').length;
            if (rowsCount >= 5) {
                btnAddKey.disabled = true;
                btnAddKey.style.opacity = '0.5';
                btnAddKey.style.pointerEvents = 'none';
            } else {
                btnAddKey.disabled = false;
                btnAddKey.style.opacity = '1';
                btnAddKey.style.pointerEvents = 'auto';
            }
        }
    }

    async function renderIntegrations() {
        document.getElementById('api-server-url').value = integrationSettings.url;
        document.getElementById('webhook-secret').value = integrationSettings.secret;
        document.getElementById('zalo-api-library').value = integrationSettings.library;

        // Fetch AI Config
        try {
            const res = await fetch(`${BACKEND_URL}/api/ai/config`);
            const json = await res.json();
            if (json.success && json.data) {
                const config = json.data;
                document.getElementById('ai-enabled').checked = config.aiEnabled;
                document.getElementById('ai-provider').value = config.aiProvider;
                document.getElementById('ai-model').value = config.aiModel;
                
                aiAllProviderKeys = config.aiAllProviderKeys || {
                    openai: config.aiProvider === 'openai' && Array.isArray(config.aiApiKeyPool) ? config.aiApiKeyPool : (config.aiApiKey ? [config.aiApiKey] : []),
                    gemini: config.aiProvider === 'gemini' && Array.isArray(config.aiApiKeyPool) ? config.aiApiKeyPool : [],
                    anthropic: config.aiProvider === 'anthropic' && Array.isArray(config.aiApiKeyPool) ? config.aiApiKeyPool : [],
                    deepseek: config.aiProvider === 'deepseek' && Array.isArray(config.aiApiKeyPool) ? config.aiApiKeyPool : [],
                    ollama: [],
                    'ollama-online': []
                };

                const activeProvider = config.aiProvider || 'openai';
                renderApiKeyPool(aiAllProviderKeys[activeProvider] || ['']);
                document.getElementById('ai-system-prompt').value = config.aiSystemPrompt;
                document.getElementById('ai-mode').value = config.aiMode;
                document.getElementById('ai-trigger-prefix').value = config.aiTriggerPrefix;
                if (document.getElementById('ai-ollama-url')) {
                    document.getElementById('ai-ollama-url').value = config.aiOllamaUrl || 'http://localhost:11434';
                }
                if (document.getElementById('ai-ollama-online-url')) {
                    document.getElementById('ai-ollama-online-url').value = config.aiOllamaOnlineUrl || '';
                }
                if (document.getElementById('ai-ollama-online-api-mode')) {
                    document.getElementById('ai-ollama-online-api-mode').value = config.aiOllamaOnlineApiMode || 'openai-compat';
                }
                
                if (document.getElementById('ai-temperature')) {
                    document.getElementById('ai-temperature').value = config.aiTemperature !== undefined ? config.aiTemperature : 0.7;
                }
                if (document.getElementById('ai-topp')) {
                    document.getElementById('ai-topp').value = config.aiTopP !== undefined ? config.aiTopP : 1.0;
                }
                if (document.getElementById('ai-max-tokens')) {
                    document.getElementById('ai-max-tokens').value = config.aiMaxTokens !== undefined ? config.aiMaxTokens : 1000;
                }
                if (document.getElementById('ai-frequency-penalty')) {
                    document.getElementById('ai-frequency-penalty').value = config.aiFrequencyPenalty !== undefined ? config.aiFrequencyPenalty : 0.0;
                }
                if (document.getElementById('ai-presence-penalty')) {
                    document.getElementById('ai-presence-penalty').value = config.aiPresencePenalty !== undefined ? config.aiPresencePenalty : 0.0;
                }
                
                const safety = config.aiSafetySettings || {};
                if (document.getElementById('safety-harassment')) {
                    document.getElementById('safety-harassment').value = safety.harassment || 'BLOCK_MEDIUM_AND_ABOVE';
                }
                if (document.getElementById('safety-hate-speech')) {
                    document.getElementById('safety-hate-speech').value = safety.hateSpeech || 'BLOCK_MEDIUM_AND_ABOVE';
                }
                if (document.getElementById('safety-sexual')) {
                    document.getElementById('safety-sexual').value = safety.sexuallyExplicit || safety.sexual || 'BLOCK_MEDIUM_AND_ABOVE';
                }
                if (document.getElementById('safety-danger')) {
                    document.getElementById('safety-danger').value = safety.dangerousContent || safety.danger || 'BLOCK_MEDIUM_AND_ABOVE';
                }

                if (document.getElementById('ai-topk')) {
                    document.getElementById('ai-topk').value = config.aiTopK !== undefined ? config.aiTopK : 40;
                }
                if (document.getElementById('ai-reasoning-effort')) {
                    document.getElementById('ai-reasoning-effort').value = config.aiReasoningEffort || 'medium';
                }

                if (document.getElementById('ai-enable-image-gen')) {
                    document.getElementById('ai-enable-image-gen').checked = !!config.aiEnableImageGen;
                }
                if (document.getElementById('ai-enable-web-search')) {
                    document.getElementById('ai-enable-web-search').checked = !!config.aiEnableWebSearch;
                }
                if (document.getElementById('ai-enable-video-analysis')) {
                    document.getElementById('ai-enable-video-analysis').checked = !!config.aiEnableVideoAnalysis;
                }
                if (document.getElementById('ai-reaction-probability')) {
                    const prob = config.aiReactionProbability !== undefined ? config.aiReactionProbability : 60;
                    document.getElementById('ai-reaction-probability').value = prob;
                    document.getElementById('ai-reaction-prob-val').textContent = prob + '%';
                }

                if (typeof toggleProviderOptions === 'function') {
                    toggleProviderOptions(true);
                }

                if (document.getElementById('stringee-sid')) {
                    document.getElementById('stringee-sid').value = config.stringeeSid || '';
                }
                if (document.getElementById('stringee-secret')) {
                    document.getElementById('stringee-secret').value = config.stringeeSecret || '';
                }
                if (document.getElementById('stringee-hotline')) {
                    document.getElementById('stringee-hotline').value = config.stringeeHotline || '';
                }
                if (document.getElementById('stringee-server-url')) {
                    document.getElementById('stringee-server-url').value = config.stringeeServerUrl || '';
                }
                
                const badge = document.getElementById('ai-status-badge');
                if (badge) {
                    badge.style.display = config.aiEnabled ? 'inline-block' : 'none';
                }

                const prefixGroup = document.getElementById('ai-prefix-group');
                if (prefixGroup) {
                    if (config.aiMode === 'all_messages') {
                        prefixGroup.style.opacity = '0.5';
                        document.getElementById('ai-trigger-prefix').disabled = true;
                    } else {
                        prefixGroup.style.opacity = '1';
                        document.getElementById('ai-trigger-prefix').disabled = false;
                    }
                }
                
                renderAiGroupsCheckboxes(config.aiGroups);

                const globalHostSelect = document.getElementById('ai-global-host-group');
                if (globalHostSelect) {
                    globalHostSelect.innerHTML = '<option value="" style="background: var(--bg-card); color: var(--text-color);">-- Không chuyển tiếp --</option>';
                    groups.forEach(g => {
                        const opt = document.createElement('option');
                        opt.value = g.id;
                        opt.textContent = g.name;
                        opt.style.cssText = 'background: var(--bg-card); color: var(--text-color);';
                        if (config.globalHostGroupId === g.id) {
                            opt.selected = true;
                        }
                        globalHostSelect.appendChild(opt);
                    });
                }
            } else {
                renderAiGroupsCheckboxes([]);
                const globalHostSelect = document.getElementById('ai-global-host-group');
                if (globalHostSelect) {
                    globalHostSelect.innerHTML = '<option value="" style="background: var(--bg-card); color: var(--text-color);">-- Không chuyển tiếp --</option>';
                    groups.forEach(g => {
                        const opt = document.createElement('option');
                        opt.value = g.id;
                        opt.textContent = g.name;
                        opt.style.cssText = 'background: var(--bg-card); color: var(--text-color);';
                        globalHostSelect.appendChild(opt);
                    });
                }
            }
        } catch (err) {
            console.error('Không thể lấy cấu hình AI:', err);
            renderAiGroupsCheckboxes([]);
            const globalHostSelect = document.getElementById('ai-global-host-group');
            if (globalHostSelect) {
                globalHostSelect.innerHTML = '<option value="" style="background: var(--bg-card); color: var(--text-color);">-- Không chuyển tiếp --</option>';
                groups.forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = g.id;
                    opt.textContent = g.name;
                    opt.style.cssText = 'background: var(--bg-card); color: var(--text-color);';
                    globalHostSelect.appendChild(opt);
                });
            }
        }
    }

    // Collapsible toggle for advanced configuration
    const btnToggleAdvanced = document.getElementById('btn-toggle-advanced-config');
    const advancedPanel = document.getElementById('advanced-config-panel');
    const advancedChevron = document.getElementById('advanced-config-chevron');

    if (btnToggleAdvanced && advancedPanel) {
        btnToggleAdvanced.addEventListener('click', () => {
            const isCollapsed = advancedPanel.style.display === 'none' || advancedPanel.style.display === '';
            if (isCollapsed) {
                advancedPanel.style.display = 'flex';
                advancedChevron.style.transform = 'rotate(180deg)';
            } else {
                advancedPanel.style.display = 'none';
                advancedChevron.style.transform = 'rotate(0deg)';
            }
        });
    }

    // Toggle provider specific options
    const aiProviderSelect = document.getElementById('ai-provider');
    const aiModelSelect = document.getElementById('ai-model-select');
    const aiModelInput = document.getElementById('ai-model');
    const openaiAdvanced = document.getElementById('openai-advanced-options');
    const geminiAdvanced = document.getElementById('gemini-advanced-options');

    const OPENAI_MODELS = [
        { value: 'gpt-4o-mini', text: 'gpt-4o-mini (Tối ưu chi phí & Tốc độ - Mặc định)' },
        { value: 'gpt-4o', text: 'gpt-4o (Flagship thông minh)' },
        { value: 'o3-mini', text: 'o3-mini (Lập luận mới nhất)' },
        { value: 'o1-mini', text: 'o1-mini (Lập luận Toán/Code)' },
        { value: 'o1', text: 'o1 (Lập luận mạnh nhất)' },
        { value: 'gpt-4-turbo', text: 'gpt-4-turbo (Flagship cũ)' },
        { value: 'gpt-3.5-turbo', text: 'gpt-3.5-turbo (Legacy)' },
        { value: 'custom', text: 'Khác (Tự nhập thủ công...)' }
    ];

    const GEMINI_MODELS = [
        { value: 'gemini-2.5-flash', text: 'gemini-2.5-flash (Thế hệ 2.5 mới nhất - Mặc định)' },
        { value: 'gemini-2.5-pro', text: 'gemini-2.5-pro (Flagship thế hệ 2.5)' },
        { value: 'gemini-2.0-flash', text: 'gemini-2.0-flash (Nhanh & Thông minh)' },
        { value: 'gemini-2.0-flash-lite', text: 'gemini-2.0-flash-lite (Tốc độ cao)' },
        { value: 'gemini-1.5-flash', text: 'gemini-1.5-flash (Thế hệ 1.5 cũ)' },
        { value: 'gemini-1.5-pro', text: 'gemini-1.5-pro (Thế hệ 1.5 cũ)' },
        { value: 'custom', text: 'Khác (Tự nhập thủ công...)' }
    ];

    const ANTHROPIC_MODELS = [
        { value: 'claude-3-5-sonnet-latest', text: 'claude-3-5-sonnet (Flagship thông minh nhất)' },
        { value: 'claude-3-5-haiku-latest', text: 'claude-3-5-haiku (Tốc độ cao & Linh hoạt)' },
        { value: 'claude-3-opus-latest', text: 'claude-3-opus (Thế hệ cũ, chuyên lập luận)' },
        { value: 'custom', text: 'Khác (Tự nhập thủ công...)' }
    ];

    const DEEPSEEK_MODELS = [
        { value: 'deepseek-chat', text: 'deepseek-chat (DeepSeek V3 - Nhanh & Rẻ)' },
        { value: 'deepseek-reasoner', text: 'deepseek-reasoner (DeepSeek R1 - Siêu lập luận)' },
        { value: 'custom', text: 'Khác (Tự nhập thủ công...)' }
    ];

    const OLLAMA_MODELS = [
        { value: 'llama3', text: 'llama3 (Mặc định)' },
        { value: 'mistral', text: 'mistral (Thông minh & Gọn nhẹ)' },
        { value: 'phi3', text: 'phi3 (Mẫu nhỏ từ Microsoft)' },
        { value: 'qwen', text: 'qwen (Mạnh mẽ về ngôn ngữ)' },
        { value: 'custom', text: 'Khác (Tự nhập thủ công...)' }
    ];

    const OLLAMA_ONLINE_MODELS = [
        { value: 'gemma3:12b', text: 'gemma3:12b (Google - Rất mạnh 🔥)' },
        { value: 'gemma4', text: 'gemma4 (Google - Thế hệ mới 🔥)' },
        { value: 'deepseek-v4-flash', text: 'deepseek-v4-flash (DeepSeek V4 - Siêu nhanh)' },
        { value: 'kimi-k2.6', text: 'kimi-k2.6 (Moonshot - Lập luận mạnh)' },
        { value: 'nemotron-3-super', text: 'nemotron-3-super (NVIDIA - Mạnh mẽ)' },
        { value: 'qwen3-coder-next', text: 'qwen3-coder-next (Alibaba - Code tốt)' },
        { value: 'minimax-m2.5', text: 'minimax-m2.5 (MiniMax - Đa năng)' },
        { value: 'gemini-3-flash-preview', text: 'gemini-3-flash-preview (Google - Nhanh)' },
        { value: 'devstral-small-2:24b', text: 'devstral-small-2:24b (Mistral - Code)' },
        { value: 'ministral-3:14b', text: 'ministral-3:14b (Mistral - Nhỏ gọn)' },
        { value: 'gpt-oss:20b', text: 'gpt-oss:20b (OpenAI OSS)' },
        { value: 'custom', text: 'Khác (Tự nhập thủ công...)' }
    ];

    function toggleModelConfigOptions() {
        const provider = aiProviderSelect ? aiProviderSelect.value : 'openai';
        const modelValue = aiModelSelect && aiModelSelect.value === 'custom' ? (aiModelInput ? aiModelInput.value : '') : (aiModelSelect ? aiModelSelect.value : '');

        // 1. Toggle Ollama Server URL container
        const ollamaUrlContainer = document.getElementById('ollama-url-container');
        if (ollamaUrlContainer) {
            ollamaUrlContainer.style.display = provider === 'ollama' ? 'block' : 'none';
        }

        // 1b. Toggle Ollama Online config container
        const ollamaOnlineConfigContainer = document.getElementById('ollama-online-config-container');
        if (ollamaOnlineConfigContainer) {
            ollamaOnlineConfigContainer.style.display = provider === 'ollama-online' ? 'block' : 'none';
        }

        // 2. Toggle Advanced Options Panels
        const tempInput = document.getElementById('ai-temperature');
        const toppInput = document.getElementById('ai-topp');
        const freqInput = document.getElementById('ai-frequency-penalty');
        const presInput = document.getElementById('ai-presence-penalty');
        
        const tempContainer = tempInput ? tempInput.parentElement : null;
        const toppContainer = toppInput ? toppInput.parentElement : null;
        const freqContainer = freqInput ? freqInput.parentElement : null;
        const presContainer = presInput ? presInput.parentElement : null;

        const reasoningContainer = document.getElementById('openai-reasoning-container');

        // Reset display of core fields
        if (tempContainer) tempContainer.style.display = 'block';
        if (toppContainer) toppContainer.style.display = 'block';
        if (freqContainer) freqContainer.style.display = 'block';
        if (presContainer) presContainer.style.display = 'block';
        if (openaiAdvanced) openaiAdvanced.style.display = 'none';
        if (geminiAdvanced) geminiAdvanced.style.display = 'none';
        if (reasoningContainer) reasoningContainer.style.display = 'none';

        // Check model type
        const isLegacyReasoning = modelValue.startsWith('o1-mini') || modelValue.startsWith('o1-preview');
        const isNewReasoning = modelValue === 'o3-mini' || modelValue === 'o1' || modelValue.startsWith('o3-') || (modelValue.startsWith('o1') && !isLegacyReasoning);
        const isDeepSeekReasoner = modelValue === 'deepseek-reasoner';

        // Customize labels / displays based on provider & model
        if (provider === 'openai') {
            openaiAdvanced.style.display = 'flex';
            if (isLegacyReasoning) {
                if (tempContainer) tempContainer.style.display = 'none';
                if (toppContainer) toppContainer.style.display = 'none';
                openaiAdvanced.style.display = 'none'; // hide penalties too
            } else if (isNewReasoning) {
                if (freqContainer) freqContainer.style.display = 'none';
                if (presContainer) presContainer.style.display = 'none';
                if (reasoningContainer) reasoningContainer.style.display = 'block';
            } else {
                if (reasoningContainer) reasoningContainer.style.display = 'none';
            }
        } else if (provider === 'gemini') {
            geminiAdvanced.style.display = 'flex';
            if (freqContainer) freqContainer.style.display = 'none';
            if (presContainer) presContainer.style.display = 'none';
        } else if (provider === 'anthropic') {
            if (freqContainer) freqContainer.style.display = 'none';
            if (presContainer) presContainer.style.display = 'none';
        } else if (provider === 'deepseek') {
            if (isDeepSeekReasoner) {
                if (tempContainer) tempContainer.style.display = 'none';
                if (toppContainer) toppContainer.style.display = 'none';
                if (freqContainer) freqContainer.style.display = 'none';
                if (presContainer) presContainer.style.display = 'none';
            } else {
                openaiAdvanced.style.display = 'flex';
            }
        } else if (provider === 'ollama') {
            openaiAdvanced.style.display = 'flex';
            if (freqContainer) {
                const label = freqContainer.querySelector('label');
                if (label) label.textContent = 'Repeat Penalty (Tần suất lặp)';
            }
            if (presContainer) presContainer.style.display = 'none';
        } else if (provider === 'ollama-online') {
            const apiMode = document.getElementById('ai-ollama-online-api-mode');
            if (apiMode && apiMode.value === 'openai-compat') {
                // OpenAI-compat mode: giống OpenAI
                openaiAdvanced.style.display = 'flex';
            } else {
                // Native mode: giống Ollama local
                openaiAdvanced.style.display = 'flex';
                if (freqContainer) {
                    const label = freqContainer.querySelector('label');
                    if (label) label.textContent = 'Repeat Penalty (Tần suất lặp)';
                }
                if (presContainer) presContainer.style.display = 'none';
            }
        }

        // Restore repeat penalty label for non-ollama
        if (provider !== 'ollama' && provider !== 'ollama-online' && freqContainer) {
            const label = freqContainer.querySelector('label');
            if (label) label.textContent = 'Frequency Penalty (Tránh lặp từ)';
        }
    }

    async function fetchProviderModels(provider, apiKey, ollamaUrl) {
        try {
            const query = new URLSearchParams({ provider });
            if (apiKey) query.append('apiKey', apiKey);
            if (ollamaUrl) query.append('ollamaUrl', ollamaUrl);
            if (provider === 'ollama-online') {
                const onlineUrl = document.getElementById('ai-ollama-online-url') ? document.getElementById('ai-ollama-online-url').value : '';
                if (onlineUrl) query.append('ollamaOnlineUrl', onlineUrl);
            }

            const res = await fetch(`${BACKEND_URL}/api/ai/models?${query.toString()}`);
            const json = await res.json();
            if (json.success && Array.isArray(json.data) && json.data.length > 0) {
                return json.data.map(m => ({ value: m, text: m }));
            }
        } catch (e) {
            console.error('Lỗi khi tải danh sách model thực tế từ API:', e);
        }
        return null;
    }

    async function populateModelOptions(provider, selectedValue) {
        if (!aiModelSelect) return;
        aiModelSelect.innerHTML = '<option value="" disabled selected>🔄 Đang tải danh sách model...</option>';
        
        const keys = getApiKeyPoolValues();
        const apiKey = keys[0] || '';
        const ollamaUrl = document.getElementById('ai-ollama-url') ? document.getElementById('ai-ollama-url').value : 'http://localhost:11434';
        
        let fetchedModels = null;
        if (provider === 'ollama' || provider === 'ollama-online' || apiKey) {
            fetchedModels = await fetchProviderModels(provider, apiKey, ollamaUrl);
        }
        
        let models = fetchedModels;
        if (!models || models.length === 0) {
            let defaultModels = OPENAI_MODELS;
            if (provider === 'gemini') defaultModels = GEMINI_MODELS;
            else if (provider === 'anthropic') defaultModels = ANTHROPIC_MODELS;
            else if (provider === 'deepseek') defaultModels = DEEPSEEK_MODELS;
            else if (provider === 'ollama') defaultModels = OLLAMA_MODELS;
            else if (provider === 'ollama-online') defaultModels = OLLAMA_ONLINE_MODELS;
            models = defaultModels;
        } else {
            // Append "Khác (Tự nhập thủ công...)" option
            models.push({ value: 'custom', text: 'Khác (Tự nhập thủ công...)' });
        }
        
        aiModelSelect.innerHTML = '';
        let found = false;
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.value;
            opt.textContent = m.text || m.value;
            aiModelSelect.appendChild(opt);
            if (m.value === selectedValue) {
                found = true;
            }
        });

        if (selectedValue && !found) {
            aiModelSelect.value = 'custom';
            if (aiModelInput) {
                aiModelInput.style.display = 'block';
                aiModelInput.value = selectedValue;
            }
        } else {
            aiModelSelect.value = selectedValue || models[0].value;
            if (aiModelInput) {
                aiModelInput.style.display = 'none';
                aiModelInput.value = aiModelSelect.value;
            }
        }
        
        toggleModelConfigOptions();
    }

    async function toggleProviderOptions(isInitialLoad = false) {
        if (!aiProviderSelect || !openaiAdvanced || !geminiAdvanced) return;
        const provider = aiProviderSelect.value;
        
        let targetModel = '';
        if (isInitialLoad && aiModelInput && aiModelInput.value) {
            targetModel = aiModelInput.value;
        } else {
            if (provider === 'openai') targetModel = 'gpt-4o-mini';
            else if (provider === 'gemini') targetModel = 'gemini-2.5-flash';
            else if (provider === 'anthropic') targetModel = 'claude-3-5-sonnet-latest';
            else if (provider === 'deepseek') targetModel = 'deepseek-chat';
            else if (provider === 'ollama') targetModel = 'llama3';
            else if (provider === 'ollama-online') targetModel = 'llama3';
        }
        
        await populateModelOptions(provider, targetModel);
    }

    if (aiProviderSelect) {
        aiProviderSelect.addEventListener('change', async () => {
            const newProvider = aiProviderSelect.value;
            const keys = aiAllProviderKeys[newProvider] || [''];
            renderApiKeyPool(keys);
            await toggleProviderOptions(false);
        });
    }

    if (aiModelSelect) {
        aiModelSelect.addEventListener('change', function() {
            if (this.value === 'custom') {
                if (aiModelInput) {
                    aiModelInput.style.display = 'block';
                    aiModelInput.value = aiProviderSelect.value === 'openai' ? 'gpt-4o-mini' : 
                                         aiProviderSelect.value === 'gemini' ? 'gemini-2.5-flash' :
                                         aiProviderSelect.value === 'anthropic' ? 'claude-3-5-sonnet-latest' :
                                         aiProviderSelect.value === 'deepseek' ? 'deepseek-chat' : 'llama3';
                }
            } else {
                if (aiModelInput) {
                    aiModelInput.style.display = 'none';
                    aiModelInput.value = this.value;
                }
            }
            toggleModelConfigOptions();
        });
    }

    if (aiModelInput) {
        aiModelInput.addEventListener('input', function() {
            toggleModelConfigOptions();
        });
    }

    // Auto-update model list when API key is edited or Ollama URL changes
    const apiKeysContainer = document.getElementById('api-keys-container');
    if (apiKeysContainer) {
        apiKeysContainer.addEventListener('focusout', (e) => {
            if (e.target && e.target.classList.contains('api-key-input')) {
                saveCurrentKeysToActiveProvider();
                const inputs = Array.from(apiKeysContainer.querySelectorAll('.api-key-input'));
                if (inputs[0] === e.target && aiProviderSelect) {
                    const currentModel = aiModelSelect ? aiModelSelect.value : '';
                    populateModelOptions(aiProviderSelect.value, currentModel);
                }
            }
        });
    }

    const aiOllamaUrlInput = document.getElementById('ai-ollama-url');
    if (aiOllamaUrlInput) {
        aiOllamaUrlInput.addEventListener('change', () => {
            if (aiProviderSelect && aiProviderSelect.value === 'ollama') {
                const currentModel = aiModelSelect ? aiModelSelect.value : '';
                populateModelOptions('ollama', currentModel);
            }
        });
    }

    // Auto-update when Ollama Online URL or API mode changes
    const aiOllamaOnlineUrlInput = document.getElementById('ai-ollama-online-url');
    if (aiOllamaOnlineUrlInput) {
        aiOllamaOnlineUrlInput.addEventListener('change', () => {
            if (aiProviderSelect && aiProviderSelect.value === 'ollama-online') {
                const currentModel = aiModelSelect ? aiModelSelect.value : '';
                populateModelOptions('ollama-online', currentModel);
            }
        });
    }
    const aiOllamaOnlineApiModeSelect = document.getElementById('ai-ollama-online-api-mode');
    if (aiOllamaOnlineApiModeSelect) {
        aiOllamaOnlineApiModeSelect.addEventListener('change', () => {
            toggleModelConfigOptions();
        });
    }

    // Bind AI Integration Form Submit
    const aiForm = document.getElementById('ai-integration-form');
    if (aiForm) {
        aiForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const aiEnabled = document.getElementById('ai-enabled').checked;
            const aiProvider = document.getElementById('ai-provider').value;
            const aiModel = document.getElementById('ai-model').value;
            
            // Sync current keys to the state first
            saveCurrentKeysToActiveProvider();
            
            const aiApiKeyPool = getApiKeyPoolValues();
            const aiApiKey = aiApiKeyPool[0] || '';
            const aiSystemPrompt = document.getElementById('ai-system-prompt').value;
            const aiMode = document.getElementById('ai-mode').value;
            const aiTriggerPrefix = document.getElementById('ai-trigger-prefix').value;
            const globalHostGroupId = document.getElementById('ai-global-host-group') ? document.getElementById('ai-global-host-group').value : '';
            
            const checkedGroups = Array.from(document.querySelectorAll('input[name="ai-target-groups"]:checked')).map(cb => cb.value);

            const aiTemperature = document.getElementById('ai-temperature') ? parseFloat(document.getElementById('ai-temperature').value) : 0.7;
            const aiTopP = document.getElementById('ai-topp') ? parseFloat(document.getElementById('ai-topp').value) : 1.0;
            const aiMaxTokens = document.getElementById('ai-max-tokens') ? parseInt(document.getElementById('ai-max-tokens').value) : 1000;
            const aiFrequencyPenalty = document.getElementById('ai-frequency-penalty') ? parseFloat(document.getElementById('ai-frequency-penalty').value) : 0.0;
            const aiPresencePenalty = document.getElementById('ai-presence-penalty') ? parseFloat(document.getElementById('ai-presence-penalty').value) : 0.0;
            
            const aiTopK = document.getElementById('ai-topk') ? parseInt(document.getElementById('ai-topk').value) : 40;
            const aiReasoningEffort = document.getElementById('ai-reasoning-effort') ? document.getElementById('ai-reasoning-effort').value : 'medium';
            const aiOllamaUrl = document.getElementById('ai-ollama-url') ? document.getElementById('ai-ollama-url').value : 'http://localhost:11434';
            const aiOllamaOnlineUrl = document.getElementById('ai-ollama-online-url') ? document.getElementById('ai-ollama-online-url').value : '';
            const aiOllamaOnlineApiMode = document.getElementById('ai-ollama-online-api-mode') ? document.getElementById('ai-ollama-online-api-mode').value : 'openai-compat';

            const aiEnableImageGen = document.getElementById('ai-enable-image-gen') ? document.getElementById('ai-enable-image-gen').checked : false;
            const aiEnableWebSearch = document.getElementById('ai-enable-web-search') ? document.getElementById('ai-enable-web-search').checked : false;
            const aiEnableVideoAnalysis = document.getElementById('ai-enable-video-analysis') ? document.getElementById('ai-enable-video-analysis').checked : false;
            const aiReactionProbability = document.getElementById('ai-reaction-probability') ? parseInt(document.getElementById('ai-reaction-probability').value) : 60;

            const aiSafetySettings = {
                harassment: document.getElementById('safety-harassment') ? document.getElementById('safety-harassment').value : 'BLOCK_MEDIUM_AND_ABOVE',
                hateSpeech: document.getElementById('safety-hate-speech') ? document.getElementById('safety-hate-speech').value : 'BLOCK_MEDIUM_AND_ABOVE',
                sexuallyExplicit: document.getElementById('safety-sexual') ? document.getElementById('safety-sexual').value : 'BLOCK_MEDIUM_AND_ABOVE',
                dangerousContent: document.getElementById('safety-danger') ? document.getElementById('safety-danger').value : 'BLOCK_MEDIUM_AND_ABOVE'
            };

            try {
                // Đọc config cũ để merge
                const getRes = await fetch(`${BACKEND_URL}/api/ai/config`);
                const getJson = await getRes.json();
                let fullConfig = getJson.success ? getJson.data : {};

                const body = {
                    ...fullConfig,
                    aiEnabled,
                    aiProvider,
                    aiModel,
                    aiApiKey,
                    aiApiKeyPool,
                    aiAllProviderKeys, // Send the whole dictionary!
                    aiSystemPrompt,
                    aiMode,
                    aiTriggerPrefix,
                    aiGroups: checkedGroups,
                    globalHostGroupId,
                    aiTemperature,
                    aiTopP,
                    aiMaxTokens,
                    aiFrequencyPenalty,
                    aiPresencePenalty,
                    aiSafetySettings,
                    aiTopK,
                    aiReasoningEffort,
                    aiOllamaUrl,
                    aiOllamaOnlineUrl,
                    aiOllamaOnlineApiMode,
                    aiEnableImageGen,
                    aiEnableWebSearch,
                    aiEnableVideoAnalysis,
                    aiReactionProbability
                };

                const res = await fetch(`${BACKEND_URL}/api/ai/config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const json = await res.json();
                if (json.success) {
                    addTerminalLog('Cấu hình Trợ lý AI nội bộ đã được lưu thành công.', 'success');
                    alert('Đã lưu cấu hình Trợ lý AI!');
                    if (json.data && json.data.aiAllProviderKeys) {
                        aiAllProviderKeys = json.data.aiAllProviderKeys;
                    }
                    const badge = document.getElementById('ai-status-badge');
                    if (badge) {
                        badge.style.display = aiEnabled ? 'inline-block' : 'none';
                    }
                } else {
                    alert('Lỗi lưu cấu hình: ' + json.error);
                }
            } catch (err) {
                alert('Lỗi kết nối máy chủ API.');
            }
        });
    }

    // Bind Stringee Integration Form Submit
    const stringeeForm = document.getElementById('stringee-integration-form');
    if (stringeeForm) {
        stringeeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const stringeeSid = document.getElementById('stringee-sid').value.trim();
            const stringeeSecret = document.getElementById('stringee-secret').value.trim();
            const stringeeHotline = document.getElementById('stringee-hotline').value.trim();
            const stringeeServerUrl = document.getElementById('stringee-server-url').value.trim();

            try {
                // Đọc config cũ để merge
                const getRes = await fetch(`${BACKEND_URL}/api/ai/config`);
                const getJson = await getRes.json();
                let fullConfig = getJson.success ? getJson.data : {};

                const body = {
                    ...fullConfig,
                    stringeeSid,
                    stringeeSecret,
                    stringeeHotline,
                    stringeeServerUrl
                };

                const res = await fetch(`${BACKEND_URL}/api/ai/config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const json = await res.json();
                if (json.success) {
                    addTerminalLog('Cấu hình VoIP Stringee đã được lưu thành công.', 'success');
                    alert('Đã lưu cấu hình Stringee VoIP!');
                } else {
                    alert('Lỗi lưu cấu hình: ' + json.error);
                }
            } catch (err) {
                alert('Lỗi kết nối máy chủ API.');
            }
        });
    }

    // Bind AI Test Connection Button
    const testAiBtn = document.getElementById('test-ai-btn');
    if (testAiBtn) {
        testAiBtn.addEventListener('click', async () => {
            const aiProvider = document.getElementById('ai-provider').value;
            const aiModel = document.getElementById('ai-model').value;
            const aiApiKeyPool = getApiKeyPoolValues();
            const aiApiKey = aiApiKeyPool[0] || '';
            const aiSystemPrompt = document.getElementById('ai-system-prompt').value;
            
            if (!aiApiKey) {
                alert('Vui lòng nhập API Key chính để kiểm tra kết nối!');
                return;
            }

            addTerminalLog(`Đang gửi truy vấn thử nghiệm ping đến ${aiProvider.toUpperCase()} API...`, 'info');
            const oldHtml = testAiBtn.innerHTML;
            testAiBtn.innerHTML = '<i data-lucide="refresh-cw" class="spin"></i> Đang kết nối...';
            lucide.createIcons();

            try {
                const res = await fetch(`${BACKEND_URL}/api/ai/config/test`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ aiProvider, aiApiKey, aiModel, aiSystemPrompt })
                });
                const json = await res.json();
                if (json.success) {
                    addTerminalLog(`Kết nối ${aiProvider.toUpperCase()} API thành công! Phản hồi từ AI: "${json.reply}"`, 'success');
                    alert(`Kết nối thử nghiệm ${aiProvider.toUpperCase()} API thành công! Phản hồi từ AI: ` + json.reply);
                } else {
                    addTerminalLog(`API trả về lỗi: ${json.error}`, 'error');
                    alert('Kết nối AI thất bại: ' + json.error);
                }
            } catch (err) {
                addTerminalLog(`Lỗi kết nối AI: ${err.message}`, 'error');
                alert('Lỗi mạng khi kiểm tra kết nối AI.');
            } finally {
                testAiBtn.innerHTML = oldHtml;
                lucide.createIcons();
            }
        });
    }

    // Bind AI Reaction Probability Slider
    const reactProb = document.getElementById('ai-reaction-probability');
    const reactProbVal = document.getElementById('ai-reaction-prob-val');
    if (reactProb && reactProbVal) {
        reactProb.addEventListener('input', (e) => {
            reactProbVal.textContent = e.target.value + '%';
        });
    }

    const btnAddKey = document.getElementById('btn-add-api-key');
    if (btnAddKey) {
        btnAddKey.addEventListener('click', () => {
            const container = document.getElementById('api-keys-container');
            const rowsCount = container.querySelectorAll('.api-key-row').length;
            if (rowsCount >= 5) {
                alert('Chỉ hỗ trợ tối đa 5 API Key trong Pool!');
                return;
            }
            renderApiKeyPool(getApiKeyPoolValues().concat(['']));
        });
    }

    // Toggle trigger prefix input visibility based on chosen mode
    const aiModeSelect = document.getElementById('ai-mode');
    if (aiModeSelect) {
        aiModeSelect.addEventListener('change', function() {
            const prefixGroup = document.getElementById('ai-prefix-group');
            if (prefixGroup) {
                if (this.value === 'all_messages') {
                    prefixGroup.style.opacity = '0.5';
                    document.getElementById('ai-trigger-prefix').disabled = true;
                } else {
                    prefixGroup.style.opacity = '1';
                    document.getElementById('ai-trigger-prefix').disabled = false;
                }
            }
        });
    }

    // Dynamic model suggest on provider change
    if (aiProviderSelect) {
        aiProviderSelect.addEventListener('change', function() {
            const modelInput = document.getElementById('ai-model');
            if (modelInput) {
                if (this.value === 'openai') {
                    modelInput.value = 'gpt-4o-mini';
                } else if (this.value === 'gemini') {
                    modelInput.value = 'gemini-1.5-flash';
                }
            }
        });
    }


    integrationForm.addEventListener('submit', (e) => {
        e.preventDefault();
        integrationSettings.url = document.getElementById('api-server-url').value;
        integrationSettings.secret = document.getElementById('webhook-secret').value;
        integrationSettings.library = document.getElementById('zalo-api-library').value;
        
        saveState();
        addTerminalLog('Cấu hình kết nối API Zalo đã được cập nhật thành công.', 'success');
        alert('Đã lưu cấu hình kết nối API Zalo!');
    });

    document.getElementById('test-connection-btn').addEventListener('click', async () => {
        addTerminalLog('Đang gửi tín hiệu ping kết nối đến Server API Node.js...', 'info');
        const btn = document.getElementById('test-connection-btn');
        const oldHtml = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="refresh-cw" class="spin"></i> Đang kết nối...';
        lucide.createIcons();

        try {
            const res = await fetch(`${BACKEND_URL}/api/ping`);
            const json = await res.json();
            if (json.status === 'ok') {
                addTerminalLog('Kết nối đến Server API thành công! Trả về HTTP 200 OK.', 'success');
                alert('Kết nối thử nghiệm đến API backend thành công!');
            } else {
                throw new Error('Unexpected status');
            }
        } catch (e) {
            addTerminalLog('Kết nối đến Server API thất bại. Vui lòng kiểm tra lại backend.', 'error');
            alert('Kết nối đến API backend thất bại! Vui lòng khởi chạy server Node.js trước.');
        } finally {
            btn.innerHTML = oldHtml;
            lucide.createIcons();
        }
    });

    document.getElementById('copy-code-btn').addEventListener('click', () => {
        const code = document.querySelector('.code-block code').textContent;
        navigator.clipboard.writeText(code).then(() => {
            alert('Đã sao chép mã nguồn backend vào Clipboard!');
            addTerminalLog('Đã sao chép code server.js mẫu vào bộ nhớ tạm.', 'info');
        });
    });

    // -------------------------------------------------------------
    // 14. GENERAL SETTINGS & UTILITIES
    // -------------------------------------------------------------
    openSafetyBtn.addEventListener('click', () => {
        safetyModal.classList.add('active');
    });

    closeSafetyModalBtn.addEventListener('click', () => {
        safetyModal.classList.remove('active');
    });

    confirmSafetyBtn.addEventListener('click', () => {
        safetyModal.classList.remove('active');
        addTerminalLog('Người dùng đã xác nhận đọc cảnh báo rủi ro an toàn.', 'info');
    });

    function updateGlobalBadges() {
        const activeCount = accounts.filter(a => a.status === 'online').length;
        document.getElementById('active-acc-badge').textContent = activeCount;
        document.getElementById('stat-active-accounts').textContent = `${activeCount} / ${accounts.length}`;
        
        document.getElementById('total-groups-badge').textContent = groups.length;
        document.getElementById('stat-total-groups').textContent = `${groups.length} Nhóm`;

        const pendingSum = groups.reduce((acc, grp) => acc + (defaultPending[grp.id] ? defaultPending[grp.id].length : 0), 0);
        document.getElementById('stat-pending-requests').textContent = pendingSum;
    }

    // Theme Switcher
    themeToggle.addEventListener('click', () => {
        const body = document.body;
        body.classList.toggle('light-theme');
        body.classList.toggle('dark-theme');
        
        const isDark = body.classList.contains('dark-theme');
        themeToggle.innerHTML = isDark ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>';
        lucide.createIcons();
        
        addTerminalLog(`Đã chuyển đổi giao diện sang chế độ: ${isDark ? 'Tối (Dark)' : 'Sáng (Light)'}`, 'info');
    });

    // Run badge update and tab render on startup
    if (modeSelect) {
        modeSelect.value = currentAppMode;
    }
    const chartModeBadge = document.getElementById('chart-mode-badge');
    if (chartModeBadge) {
        chartModeBadge.textContent = currentAppMode === 'live' ? 'Dữ liệu thật (Live API)' : 'Chế độ mô phỏng';
    }

    // -------------------------------------------------------------
    // KNOWLEDGE BASE SYSTEM (RAG) & VOICE AI CONTROLLERS
    // -------------------------------------------------------------
    let currentKbSubTab = 'kb-documents';
    let callsHistory = [];
    let isVirtualCalling = false;
    let virtualCallId = null;
    let recognition = null; // HTML5 SpeechRecognition
    let synth = window.speechSynthesis;
    
    // Các biến dùng cho Gemini Multimodal Live API (Web Audio streaming)
    let liveAudioContext = null;
    let liveAudioStream = null;
    let liveAudioProcessor = null;
    let livePlaybackContext = null;
    let liveActiveSources = [];
    let nextAudioPlayTime = 0;

    // Quản lý chuyển đổi Sub-tabs trong Cơ sở tri thức
    document.querySelectorAll('#tab-knowledge .tab-sub-nav .sub-tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('#tab-knowledge .tab-sub-nav .sub-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('#tab-knowledge .sub-tab-panel').forEach(p => p.classList.remove('active'));
            
            this.classList.add('active');
            const subtabId = this.getAttribute('data-subtab');
            document.getElementById(`subtab-${subtabId}`).classList.add('active');
            
            currentKbSubTab = subtabId;
            if (subtabId === 'kb-documents') {
                renderKnowledge();
            } else if (subtabId === 'kb-calls') {
                renderCallLogs();
            }
        });
    });

    // Toggle hiển thị input URL khi chọn loại nguồn tài liệu tri thức
    const sourceRadioGroup = document.getElementsByName('kb-source-type');
    sourceRadioGroup.forEach(radio => {
        radio.addEventListener('change', function() {
            const urlGroup = document.getElementById('kb-source-url-group');
            const contentGroup = document.getElementById('kb-content-group');
            const urlInput = document.getElementById('knowledge-source-url');
            const contentInput = document.getElementById('knowledge-content');

            if (this.value === 'manual') {
                urlGroup.classList.add('hidden');
                contentGroup.classList.remove('hidden');
                urlInput.removeAttribute('required');
                contentInput.setAttribute('required', 'true');
            } else {
                urlGroup.classList.remove('hidden');
                contentGroup.classList.add('hidden');
                urlInput.setAttribute('required', 'true');
                contentInput.removeAttribute('required');
                
                // Đặt gợi ý placeholder tùy loại nguồn
                if (this.value === 'googledoc') {
                    urlInput.placeholder = "Ví dụ: https://docs.google.com/document/d/.../edit?usp=sharing";
                } else {
                    urlInput.placeholder = "Ví dụ: https://example.com/chinh-sach-giao-hang";
                }
            }
        });
    });

    // Đồng bộ giá trị range slider của Ngưỡng tương đồng RAG
    const thresholdRange = document.getElementById('rag-threshold-range');
    const thresholdVal = document.getElementById('rag-threshold-val');
    if (thresholdRange && thresholdVal) {
        thresholdRange.addEventListener('input', function() {
            thresholdVal.textContent = parseFloat(this.value).toFixed(2);
        });
    }

    // Tải cấu hình RAG lên UI
    async function loadRagSettings() {
        if (currentAppMode === 'simulation') return;
        try {
            const res = await fetch(`${BACKEND_URL}/api/ai/config`);
            const json = await res.json();
            if (json.success && json.data) {
                const config = json.data;
                document.getElementById('rag-search-mode').value = config.ragSearchMode || 'hybrid';
                document.getElementById('rag-top-k').value = config.ragTopK || 3;
                document.getElementById('rag-threshold-range').value = config.ragScoreThreshold || 0.60;
                document.getElementById('rag-threshold-val').textContent = parseFloat(config.ragScoreThreshold || 0.60).toFixed(2);
            }
        } catch (e) {
            console.error('Không thể tải cấu hình RAG:', e);
        }
    }

    // Lưu cài đặt RAG
    const saveRagSettingsBtn = document.getElementById('save-rag-settings-btn');
    if (saveRagSettingsBtn) {
        saveRagSettingsBtn.addEventListener('click', async function() {
            if (currentAppMode === 'simulation') {
                addTerminalLog('[Demo] Đã lưu cấu hình RAG thành công.', 'success');
                return;
            }
            
            const ragSearchMode = document.getElementById('rag-search-mode').value;
            const ragTopK = parseInt(document.getElementById('rag-top-k').value);
            const ragScoreThreshold = parseFloat(document.getElementById('rag-threshold-range').value);

            try {
                // Đọc config cũ để merge
                const getRes = await fetch(`${BACKEND_URL}/api/ai/config`);
                const getJson = await getRes.json();
                let fullConfig = getJson.success ? getJson.data : {};

                const body = {
                    ...fullConfig,
                    ragSearchMode,
                    ragTopK,
                    ragScoreThreshold
                };

                const res = await fetch(`${BACKEND_URL}/api/ai/config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const json = await res.json();
                if (json.success) {
                    addTerminalLog('Đã lưu cấu hình tham số RAG thành công!', 'success');
                } else {
                    addTerminalLog(`Lưu cấu hình RAG thất bại: ${json.error}`, 'error');
                }
            } catch (e) {
                addTerminalLog(`Lỗi khi lưu cấu hình RAG: ${e.message}`, 'error');
            }
        });
    }

    // Chạy kiểm thử RAG (Query Testing)
    const runRagTestBtn = document.getElementById('run-rag-test-btn');
    if (runRagTestBtn) {
        runRagTestBtn.addEventListener('click', async function() {
            const question = document.getElementById('rag-test-input').value.trim();
            const resultsContainer = document.getElementById('rag-test-results-container');
            
            if (!question) {
                alert('Vui lòng nhập câu hỏi kiểm thử.');
                return;
            }

            resultsContainer.innerHTML = '<div class="text-muted text-center" style="font-size:0.8rem;">Đang tìm kiếm tri thức...</div>';

            if (currentAppMode === 'simulation') {
                setTimeout(() => {
                    resultsContainer.innerHTML = `
                        <div class="rag-test-chunk-card">
                            <div class="rag-test-chunk-meta">
                                <span style="font-weight:600; color:var(--text-primary);">Chính sách Hoàn trả & Đổi mới</span>
                                <span class="rag-test-chunk-score-badge">Độ tương đồng: 82%</span>
                            </div>
                            <div style="font-size:0.8rem; line-height:1.4; color:var(--text-secondary);">
                                Khách hàng được đổi mới sản phẩm 1-1 trong vòng 30 ngày nếu phát hiện lỗi phần cứng từ nhà sản xuất...
                            </div>
                            <div class="rag-test-chunk-progress-bar">
                                <div class="rag-test-chunk-progress-fill" style="width: 82%;"></div>
                            </div>
                        </div>
                    `;
                }, 800);
                return;
            }

            try {
                const res = await fetch(`${BACKEND_URL}/api/knowledge/query-test`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ question })
                });
                const json = await res.json();
                resultsContainer.innerHTML = '';
                
                if (json.success && json.chunks && json.chunks.length > 0) {
                    json.chunks.forEach(item => {
                        const scorePercent = Math.round((item.score || 0) * 100);
                        const card = document.createElement('div');
                        card.className = 'rag-test-chunk-card';
                        card.innerHTML = `
                            <div class="rag-test-chunk-meta">
                                <span style="font-weight:600; color:var(--text-primary);">${escapeHtml(item.docTitle)}</span>
                                <span class="rag-test-chunk-score-badge">Độ khớp: ${scorePercent}%</span>
                            </div>
                            <div style="font-size:0.8rem; line-height:1.4; color:var(--text-secondary);">
                                ${escapeHtml(item.text)}
                            </div>
                            <div class="rag-test-chunk-progress-bar">
                                <div class="rag-test-chunk-progress-fill" style="width: ${scorePercent}%;"></div>
                            </div>
                        `;
                        resultsContainer.appendChild(card);
                    });
                } else {
                    resultsContainer.innerHTML = '<div class="text-muted text-center" style="font-size:0.8rem;">Không tìm thấy phân đoạn tri thức nào khớp.</div>';
                }
            } catch (e) {
                resultsContainer.innerHTML = `<div class="text-danger text-center" style="font-size:0.8rem;">Lỗi: ${e.message}</div>`;
            }
        });
    }

    async function fetchKnowledgeFromBackend() {
        if (currentAppMode === 'simulation') {
            if (knowledge.length === 0) {
                knowledge = [
                    {
                        id: 'know-1',
                        title: 'Chính sách Hoàn trả & Đổi mới',
                        content: 'Khách hàng được đổi mới sản phẩm 1-1 trong vòng 30 ngày nếu phát hiện lỗi phần cứng từ nhà sản xuất. Đối với các trường hợp hoàn trả nhận lại tiền, thời hạn áp dụng tối đa là 7 ngày kể từ lúc khách hàng ký nhận bàn giao sản phẩm từ đơn vị vận chuyển.',
                        active: true,
                        sourceType: 'manual',
                        charCount: 228,
                        chunkCount: 1,
                        syncStatus: 'synced',
                        createdAt: new Date(Date.now() - 86400000 * 5)
                    },
                    {
                        id: 'know-2',
                        title: 'Tài liệu hướng dẫn Zalo API 2026',
                        content: 'Zalo CRM hỗ trợ các API gửi tin nhắn, lấy lịch sử chat, đồng bộ danh sách nhóm và cào dữ liệu tri thức online. Hạn mức API miễn phí là 10.000 requests/ngày.',
                        active: true,
                        sourceType: 'url',
                        sourceUrl: 'https://api.zalo.me/v2/docs',
                        charCount: 161,
                        chunkCount: 1,
                        syncStatus: 'synced',
                        lastSyncedAt: new Date(Date.now() - 3600000 * 4),
                        createdAt: new Date(Date.now() - 86400000 * 2)
                    }
                ];
            }
            return;
        }

        try {
            const res = await fetch(`${BACKEND_URL}/api/knowledge`);
            const json = await res.json();
            if (json.success) {
                knowledge = json.data;
            }
        } catch (e) {
            addTerminalLog('Không thể tải cơ sở tri thức từ backend Node.js.', 'error');
        }
    }

    function renderKnowledge() {
        knowledgeListContainer.innerHTML = '';
        const searchVal = knowledgeSearchInput ? knowledgeSearchInput.value.toLowerCase().trim() : '';

        fetchKnowledgeFromBackend().then(() => {
            loadRagSettings();
            
            const filtered = knowledge.filter(doc => {
                return doc.title.toLowerCase().includes(searchVal) || (doc.content && doc.content.toLowerCase().includes(searchVal));
            });

            if (filtered.length === 0) {
                knowledgeListContainer.innerHTML = `
                    <div class="no-selection-placeholder" style="grid-column: 1 / -1; min-height: 200px;">
                        <i data-lucide="book-open" class="placeholder-icon"></i>
                        <p>Không tìm thấy tài liệu tri thức nào. Hãy thêm tài liệu đầu tiên!</p>
                    </div>
                `;
                lucide.createIcons();
                return;
            }

            filtered.forEach(doc => {
                const card = document.createElement('div');
                card.className = `knowledge-card ${doc.active ? '' : 'inactive'}`;
                
                const dateStr = new Date(doc.createdAt).toLocaleDateString('vi-VN');
                const lastSyncedStr = doc.lastSyncedAt ? new Date(doc.lastSyncedAt).toLocaleString('vi-VN') : 'Chưa đồng bộ';
                
                // Thiết lập nhãn nguồn tri thức
                let sourceBadge = '<span class="badge"><i data-lucide="file-text" style="width:10px; height:10px; display:inline-block; margin-right:4px;"></i>Gõ tay</span>';
                if (doc.sourceType === 'url') {
                    sourceBadge = '<span class="badge badge-info"><i data-lucide="globe" style="width:10px; height:10px; display:inline-block; margin-right:4px;"></i>Website</span>';
                } else if (doc.sourceType === 'googledoc') {
                    sourceBadge = '<span class="badge badge-success"><i data-lucide="file-spreadsheet" style="width:10px; height:10px; display:inline-block; margin-right:4px;"></i>Google Doc</span>';
                }

                // Thiết lập hiển thị đồng bộ cho nguồn online
                let syncSection = '';
                if (doc.sourceType && doc.sourceType !== 'manual') {
                    let statusClass = 'sync-status-synced';
                    let statusText = 'Đã đồng bộ';
                    let spinClass = '';

                    if (doc.syncStatus === 'syncing') {
                        statusClass = 'sync-status-syncing';
                        statusText = 'Đang đồng bộ...';
                        spinClass = 'spin-anim';
                    } else if (doc.syncStatus === 'failed') {
                        statusClass = 'sync-status-failed';
                        statusText = 'Đồng bộ lỗi';
                    }

                    syncSection = `
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; border-top:1px dashed var(--border-color); padding-top:8px; margin-top:4px; font-size:0.72rem;">
                            <span class="sync-status-badge ${statusClass}">${statusText}</span>
                            <span class="text-muted">Đồng bộ: ${lastSyncedStr}</span>
                            <button class="btn btn-icon-only btn-sm sync-now-btn" data-id="${doc.id || doc._id}" style="width:24px; height:24px; padding:0;" title="Đồng bộ ngay">
                                <i data-lucide="refresh-cw" class="${spinClass}" style="width:12px; height:12px;"></i>
                            </button>
                        </div>
                    `;
                }

                card.innerHTML = `
                    <div class="knowledge-card-header">
                        <h4 class="knowledge-card-title" title="${escapeHtml(doc.title)}">${escapeHtml(doc.title)}</h4>
                        <label class="switch">
                            <input type="checkbox" class="knowledge-toggle-active" data-id="${doc.id || doc._id}" ${doc.active ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>
                    <div class="knowledge-card-metadata">
                        ${sourceBadge}
                        <span><i data-lucide="bar-chart-2" style="width:10px; height:10px;"></i>${doc.charCount || 0} ký tự</span>
                        <span><i data-lucide="layers" style="width:10px; height:10px;"></i>${doc.chunkCount || 0} đoạn</span>
                    </div>
                    <div class="knowledge-card-content" title="${escapeHtml(doc.content || 'Đang tải nội dung đồng bộ...')}">
                        ${escapeHtml(doc.content || 'Tài liệu liên kết trực tuyến. Bấm biểu tượng đồng bộ để tải nội dung.')}
                    </div>
                    ${syncSection}
                    <div class="knowledge-card-footer" style="padding-top: 10px; border-top: 1px solid var(--border-color);">
                        <span class="knowledge-card-date">Tạo: ${dateStr}</span>
                        <div class="knowledge-card-actions">
                            <button class="btn btn-sm btn-outline-secondary edit-knowledge-btn" data-id="${doc.id || doc._id}" title="Chỉnh sửa">
                                <i data-lucide="edit-3" style="width:14px; height:14px;"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger delete-knowledge-btn" data-id="${doc.id || doc._id}" title="Xóa tài liệu">
                                <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                            </button>
                        </div>
                    </div>
                `;
                
                knowledgeListContainer.appendChild(card);
            });

            lucide.createIcons();
            bindKnowledgeEvents();
        });
    }

    function bindKnowledgeEvents() {
        // Active toggles
        document.querySelectorAll('.knowledge-toggle-active').forEach(toggle => {
            toggle.addEventListener('change', async function() {
                const id = this.getAttribute('data-id');
                const active = this.checked;
                
                const doc = knowledge.find(d => (d.id === id || d._id === id));
                if (doc) doc.active = active;

                if (currentAppMode === 'simulation') {
                    addTerminalLog(`[Demo] Đã ${active ? 'BẬT' : 'TẮT'} tài liệu tri thức: "${doc.title}"`, 'success');
                    renderKnowledge();
                    return;
                }

                try {
                    const res = await fetch(`${BACKEND_URL}/api/knowledge/toggle`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id, active })
                    });
                    const json = await res.json();
                    if (json.success) {
                        addTerminalLog(`Đã ${active ? 'BẬT' : 'TẮT'} tài liệu tri thức: "${doc.title}"`, 'success');
                        renderKnowledge();
                    } else {
                        addTerminalLog(`Không thể cập nhật trạng thái tài liệu: ${json.error}`, 'error');
                        this.checked = !active;
                    }
                } catch (e) {
                    addTerminalLog(`Lỗi kết nối khi cập nhật trạng thái tài liệu: ${e.message}`, 'error');
                    this.checked = !active;
                }
            });
        });

        // Sync Online Documents buttons
        document.querySelectorAll('.sync-now-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const id = this.getAttribute('data-id');
                const icon = this.querySelector('i');
                
                if (icon.classList.contains('spin-anim')) return; // Đang chạy
                icon.classList.add('spin-anim');

                if (currentAppMode === 'simulation') {
                    setTimeout(() => {
                        icon.classList.remove('spin-anim');
                        addTerminalLog('[Demo] Đồng bộ tài liệu online thành công.', 'success');
                    }, 1200);
                    return;
                }

                try {
                    addTerminalLog('Đang bắt đầu đồng bộ tài liệu từ link trực tuyến...', 'info');
                    const res = await fetch(`${BACKEND_URL}/api/knowledge/sync/${id}`, { method: 'POST' });
                    const json = await res.json();
                    if (json.success) {
                        addTerminalLog(json.message, 'success');
                    } else {
                        addTerminalLog(`Yêu cầu đồng bộ thất bại: ${json.error}`, 'error');
                        icon.classList.remove('spin-anim');
                    }
                } catch (e) {
                    addTerminalLog(`Lỗi kết nối khi đồng bộ tài liệu: ${e.message}`, 'error');
                    icon.classList.remove('spin-anim');
                }
            });
        });

        // Edit buttons
        document.querySelectorAll('.edit-knowledge-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.getAttribute('data-id');
                const doc = knowledge.find(d => (d.id === id || d._id === id));
                if (doc) {
                    document.getElementById('knowledge-id').value = doc.id || doc._id;
                    document.getElementById('knowledge-title').value = doc.title;
                    document.getElementById('knowledge-active').checked = doc.active;
                    
                    // Gán loại nguồn
                    const type = doc.sourceType || 'manual';
                    const radios = document.getElementsByName('kb-source-type');
                    radios.forEach(r => {
                        if (r.value === type) r.checked = true;
                    });

                    const urlGroup = document.getElementById('kb-source-url-group');
                    const contentGroup = document.getElementById('kb-content-group');
                    const urlInput = document.getElementById('knowledge-source-url');
                    const contentInput = document.getElementById('knowledge-content');

                    if (type === 'manual') {
                        urlGroup.classList.add('hidden');
                        contentGroup.classList.remove('hidden');
                        urlInput.value = '';
                        urlInput.removeAttribute('required');
                        contentInput.value = doc.content || '';
                        contentInput.setAttribute('required', 'true');
                    } else {
                        urlGroup.classList.remove('hidden');
                        contentGroup.classList.add('hidden');
                        urlInput.value = doc.sourceUrl || '';
                        urlInput.setAttribute('required', 'true');
                        contentInput.value = '';
                        contentInput.removeAttribute('required');
                        document.getElementById('knowledge-sync-interval').value = doc.syncInterval || 1440;
                    }
                    
                    document.getElementById('knowledge-modal-title').textContent = 'Chỉnh sửa tài liệu tri thức';
                    addKnowledgeModal.classList.add('active');
                }
            });
        });

        // Delete buttons
        document.querySelectorAll('.delete-knowledge-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const id = this.getAttribute('data-id');
                const doc = knowledge.find(d => (d.id === id || d._id === id));
                if (doc && confirm(`Bạn có chắc muốn xóa tài liệu tri thức "${doc.title}" không?`)) {
                    if (currentAppMode === 'simulation') {
                        knowledge = knowledge.filter(d => (d.id !== id && d._id !== id));
                        addTerminalLog(`[Demo] Đã xóa tài liệu tri thức: "${doc.title}"`, 'warn');
                        renderKnowledge();
                        return;
                    }

                    try {
                        const res = await fetch(`${BACKEND_URL}/api/knowledge/${id}`, {
                            method: 'DELETE'
                        });
                        const json = await res.json();
                        if (json.success) {
                            addTerminalLog(`Đã xóa tài liệu tri thức: "${doc.title}" thành công.`, 'success');
                            renderKnowledge();
                        } else {
                            addTerminalLog(`Không thể xóa tài liệu: ${json.error}`, 'error');
                        }
                    } catch (e) {
                        addTerminalLog(`Lỗi kết nối khi xóa tài liệu: ${e.message}`, 'error');
                    }
                }
            });
        });
    }

    if (addKnowledgeBtn) {
        addKnowledgeBtn.addEventListener('click', () => {
            document.getElementById('knowledge-id').value = '';
            document.getElementById('knowledge-title').value = '';
            
            // Đặt radio mặc định manual
            const radios = document.getElementsByName('kb-source-type');
            radios.forEach(r => {
                if (r.value === 'manual') r.checked = true;
            });

            document.getElementById('kb-source-url-group').classList.add('hidden');
            document.getElementById('kb-content-group').classList.remove('hidden');
            document.getElementById('knowledge-source-url').value = '';
            document.getElementById('knowledge-source-url').removeAttribute('required');
            document.getElementById('knowledge-content').value = '';
            document.getElementById('knowledge-content').setAttribute('required', 'true');

            document.getElementById('knowledge-active').checked = true;
            document.getElementById('knowledge-modal-title').textContent = 'Thêm tài liệu tri thức mới';
            addKnowledgeModal.classList.add('active');
        });
    }

    if (closeKnowledgeModalBtn) {
        closeKnowledgeModalBtn.addEventListener('click', () => {
            addKnowledgeModal.classList.remove('active');
        });
    }

    if (cancelKnowledgeBtn) {
        cancelKnowledgeBtn.addEventListener('click', () => {
            addKnowledgeModal.classList.remove('active');
        });
    }

    if (newKnowledgeForm) {
        newKnowledgeForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const id = document.getElementById('knowledge-id').value;
            const title = document.getElementById('knowledge-title').value.trim();
            const active = document.getElementById('knowledge-active').checked;
            
            const sourceType = document.querySelector('input[name="kb-source-type"]:checked').value;
            const sourceUrl = document.getElementById('knowledge-source-url').value.trim();
            const syncInterval = parseInt(document.getElementById('knowledge-sync-interval').value);
            const content = document.getElementById('knowledge-content').value.trim();

            if (currentAppMode === 'simulation') {
                if (id) {
                    const doc = knowledge.find(d => (d.id === id || d._id === id));
                    if (doc) {
                        doc.title = title;
                        doc.content = sourceType === 'manual' ? content : '';
                        doc.active = active;
                        doc.sourceType = sourceType;
                        doc.sourceUrl = sourceType !== 'manual' ? sourceUrl : '';
                        doc.syncInterval = syncInterval;
                    }
                    addTerminalLog(`[Demo] Đã cập nhật tài liệu tri thức: "${title}"`, 'success');
                } else {
                    const newDoc = {
                        id: 'know-' + Date.now(),
                        title,
                        content: sourceType === 'manual' ? content : '',
                        active,
                        sourceType,
                        sourceUrl: sourceType !== 'manual' ? sourceUrl : '',
                        syncInterval,
                        charCount: sourceType === 'manual' ? content.length : 0,
                        chunkCount: sourceType === 'manual' ? 1 : 0,
                        syncStatus: sourceType === 'manual' ? 'synced' : 'syncing',
                        createdAt: new Date()
                    };
                    knowledge.push(newDoc);
                    addTerminalLog(`[Demo] Đã thêm tài liệu tri thức mới: "${title}"`, 'success');
                }
                addKnowledgeModal.classList.remove('active');
                renderKnowledge();
                return;
            }

            try {
                const body = {
                    id, title, active, sourceType, sourceUrl, syncInterval,
                    content: sourceType === 'manual' ? content : ''
                };

                const res = await fetch(`${BACKEND_URL}/api/knowledge`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const json = await res.json();
                if (json.success) {
                    addTerminalLog(json.message, 'success');
                    addKnowledgeModal.classList.remove('active');
                    renderKnowledge();
                } else {
                    addTerminalLog(`Không thể lưu tài liệu: ${json.error}`, 'error');
                }
            } catch (err) {
                addTerminalLog(`Lỗi kết nối khi lưu tài liệu: ${err.message}`, 'error');
            }
        });
    }

    if (knowledgeSearchInput) {
        knowledgeSearchInput.addEventListener('input', () => {
            renderKnowledge();
        });
    }

    // -------------------------------------------------------------
    // COLD VOICE AI & CALL LOGS SYSTEM
    // -------------------------------------------------------------
    const callLogsTableBody = document.getElementById('call-logs-table-body');
    const refreshCallLogsBtn = document.getElementById('refresh-call-logs-btn');
    const triggerOutboundCallBtn = document.getElementById('trigger-outbound-call-btn');
    const callDetailsModal = document.getElementById('call-details-modal');
    
    // Đọc lịch sử cuộc gọi từ backend
    async function fetchCallLogs() {
        if (currentAppMode === 'simulation') {
            if (callsHistory.length === 0) {
                callsHistory = [
                    {
                        _id: 'call-1',
                        phoneNumber: '84912345678',
                        clientName: 'Nguyễn Văn A',
                        direction: 'outbound',
                        status: 'completed',
                        duration: 45,
                        transcript: [
                            { role: 'ai', text: 'Dạ em chào anh chị, em là trợ lý cuộc gọi ZaloGroup. Em đang gọi điện để nhắc nhở anh chị lịch họp lúc 5h chiều nay ạ.', time: new Date(Date.now() - 3600000) },
                            { role: 'user', text: 'À đúng rồi, cảm ơn em nhé. Chiều nay anh sẽ tham gia.', time: new Date(Date.now() - 3600000 + 10000) },
                            { role: 'ai', text: 'Dạ vâng ạ, em đã ghi nhận thông tin tham gia của anh. Chúc anh một ngày tốt lành.', time: new Date(Date.now() - 3600000 + 20000) }
                        ],
                        createdAt: new Date(Date.now() - 3600000)
                    }
                ];
            }
            return;
        }

        try {
            const res = await fetch(`${BACKEND_URL}/api/calls/history`);
            const json = await res.json();
            if (json.success) {
                callsHistory = json.data;
            }
        } catch (e) {
            console.error('Không thể tải nhật ký cuộc gọi:', e);
        }
    }

    function renderCallLogs() {
        if (!callLogsTableBody) return;
        callLogsTableBody.innerHTML = '';

        fetchCallLogs().then(() => {
            if (callsHistory.length === 0) {
                callLogsTableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center text-muted" style="padding:40px 0;">
                            Chưa có cuộc gọi thoại AI nào được thực hiện.
                        </td>
                    </tr>
                `;
                return;
            }

            callsHistory.forEach(call => {
                const tr = document.createElement('tr');
                const dateStr = new Date(call.createdAt).toLocaleString('vi-VN');
                const dirBadge = call.direction === 'outbound' ? '<span class="badge badge-info">Gọi ra</span>' : '<span class="badge">Gọi vào</span>';
                
                tr.innerHTML = `
                    <td><strong>${escapeHtml(call.clientName || 'Khách hàng')}</strong></td>
                    <td>${escapeHtml(call.phoneNumber)}</td>
                    <td>${dirBadge}</td>
                    <td>${call.duration} giây</td>
                    <td>${dateStr}</td>
                    <td>
                        <button class="btn btn-sm btn-secondary view-call-details-btn" data-id="${call._id || call.id}">
                            Chi tiết
                        </button>
                    </td>
                `;
                callLogsTableBody.appendChild(tr);
            });

            // Bind sự kiện nút xem chi tiết cuộc gọi
            document.querySelectorAll('.view-call-details-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const id = this.getAttribute('data-id');
                    const call = callsHistory.find(c => (c._id === id || c.id === id));
                    if (call) {
                        openCallDetailsModal(call);
                    }
                });
            });
        });
    }

    if (refreshCallLogsBtn) {
        refreshCallLogsBtn.addEventListener('click', () => {
            renderCallLogs();
        });
    }

    // Modal Details controls
    const closeCallDetailsModalBtn = document.getElementById('close-call-details-modal-btn');
    const closeCallDetailsBtn = document.getElementById('close-call-details-btn');
    
    if (closeCallDetailsModalBtn) {
        closeCallDetailsModalBtn.addEventListener('click', () => {
            callDetailsModal.classList.remove('active');
            document.getElementById('call-details-audio').pause();
        });
    }
    if (closeCallDetailsBtn) {
        closeCallDetailsBtn.addEventListener('click', () => {
            callDetailsModal.classList.remove('active');
            document.getElementById('call-details-audio').pause();
        });
    }

    function openCallDetailsModal(call) {
        const transcriptContainer = document.getElementById('call-details-transcript-container');
        const audioPlayer = document.getElementById('call-details-audio');
        
        transcriptContainer.innerHTML = '';
        
        // Mock audio file nếu là virtual call
        if (call.recordingUrl === 'virtual_call_simulation.mp3') {
            audioPlayer.src = ''; // Hoặc chèn link một file nhạc chuông
        } else {
            audioPlayer.src = call.recordingUrl || '';
        }

        if (call.transcript && call.transcript.length > 0) {
            call.transcript.forEach(t => {
                const bubble = document.createElement('div');
                const isAi = t.role === 'ai' || t.role === 'assistant';
                bubble.style.cssText = `
                    padding: 8px 12px;
                    border-radius: var(--border-radius-sm);
                    max-width: 80%;
                    font-size: 0.85rem;
                    line-height: 1.4;
                    margin-bottom: 4px;
                    align-self: ${isAi ? 'flex-start' : 'flex-end'};
                    background: ${isAi ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)'};
                    border: 1px solid ${isAi ? 'rgba(59, 130, 246, 0.25)' : 'var(--border-color)'};
                `;
                bubble.innerHTML = `
                    <div style="font-size:0.7rem; font-weight:600; color:var(--text-muted); margin-bottom:2px;">
                        ${isAi ? 'Trợ lý AI' : (call.clientName || 'Khách hàng')}
                    </div>
                    <div>${escapeHtml(t.text)}</div>
                `;
                transcriptContainer.appendChild(bubble);
            });
        } else {
            transcriptContainer.innerHTML = '<div class="text-muted text-center" style="font-size:0.8rem; padding:20px 0;">Không có bản transcript hội thoại.</div>';
        }

        callDetailsModal.classList.add('active');
    }

    // Trigger Outbound VoIP Call
    if (triggerOutboundCallBtn) {
        triggerOutboundCallBtn.addEventListener('click', async function() {
            const phone = document.getElementById('outbound-phone-input').value.trim();
            if (!phone) {
                alert('Vui lòng nhập số điện thoại cần gọi.');
                return;
            }

            if (currentAppMode === 'simulation') {
                alert('[Demo Mode] Hệ thống đang chạy mô phỏng. Vui lòng bấm vào biểu tượng Micro của phần "Đàm thoại ảo" ở ngay bên dưới để gọi thử nghiệm đàm thoại miễn phí.');
                return;
            }

            try {
                addTerminalLog(`Đang gửi yêu cầu gọi Outbound VoIP tới số điện thoại: ${phone}...`, 'info');
                const res = await fetch(`${BACKEND_URL}/api/calls/trigger`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phoneNumber: phone })
                });
                const json = await res.json();
                if (json.success) {
                    addTerminalLog(`Đang thực hiện cuộc gọi: ${json.message}`, 'success');
                } else {
                    addTerminalLog(`Không thể thực hiện cuộc gọi: ${json.error}`, 'error');
                }
            } catch (e) {
                addTerminalLog(`Lỗi kết nối khi gọi điện: ${e.message}`, 'error');
            }
        });
    }

    // Virtual Call đàm thoại ảo (Browser Microphone WebRTC simulator)
    const voiceCallTriggerBtn = document.getElementById('voice-call-trigger-btn');
    const voiceCallMicIcon = document.getElementById('voice-call-mic-icon');
    const voiceCallStatusTxt = document.getElementById('voice-call-status-txt');
    const virtualCallLiveTranscript = document.getElementById('virtual-call-live-transcript');

    if (voiceCallTriggerBtn) {
        voiceCallTriggerBtn.addEventListener('click', function() {
            if (!isVirtualCalling) {
                startVirtualCall();
            } else {
                stopVirtualCall();
            }
        });
    }

    // Helper: Chuyển ArrayBuffer sang Base64
    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // Helper: Chuyển Base64 sang Float32Array
    function base64ToFloat32(base64) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const int16Array = new Int16Array(bytes.buffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }
        return float32Array;
    }

    // Lên lịch phát các gói audio PCM 24kHz nối đuôi nhau mượt mà
    function playLiveAudioChunk(float32Array) {
        if (!livePlaybackContext) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            livePlaybackContext = new AudioContext({ sampleRate: 24000 });
        }
        
        if (livePlaybackContext.state === 'suspended') {
            livePlaybackContext.resume();
        }

        const audioBuffer = livePlaybackContext.createBuffer(1, float32Array.length, 24000);
        audioBuffer.getChannelData(0).set(float32Array);

        const source = livePlaybackContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(livePlaybackContext.destination);

        const now = livePlaybackContext.currentTime;
        if (nextAudioPlayTime < now) {
            nextAudioPlayTime = now;
        }

        source.start(nextAudioPlayTime);
        nextAudioPlayTime += audioBuffer.duration;

        liveActiveSources.push(source);
        source.onended = () => {
            const idx = liveActiveSources.indexOf(source);
            if (idx > -1) {
                liveActiveSources.splice(idx, 1);
            }
        };
    }

    // Dừng tất cả âm thanh Live đang phát (Barge-in / Interruption)
    function stopAllLiveAudio() {
        liveActiveSources.forEach(src => {
            try {
                src.stop();
            } catch (e) {}
        });
        liveActiveSources = [];
        nextAudioPlayTime = 0;
    }

    function startVirtualCall() {
        isVirtualCalling = true;
        voiceCallTriggerBtn.classList.add('calling');
        voiceCallMicIcon.setAttribute('data-lucide', 'phone-off');
        lucide.createIcons();
        voiceCallStatusTxt.textContent = "Đang kết nối đàm thoại AI...";
        virtualCallLiveTranscript.classList.remove('hidden');
        virtualCallLiveTranscript.innerHTML = '';

        // Tạo chuông kết nối ảo
        playAudioTone(440, 100); // 440Hz bip
        setTimeout(() => playAudioTone(554, 100), 100);
        setTimeout(() => playAudioTone(659, 150), 200);

        // Gọi socket bắt đầu
        const phone = '84999999999';
        const name = 'Admin (Web Call)';
        
        if (socket) {
            socket.emit('virtual-call.start', { phoneNumber: phone, name });
        }

        const onConnected = async (data) => {
            virtualCallId = data.callId;
            const mode = data.mode || 'fallback';
            console.log(`VirtualCall connected. Mode: ${mode}`);

            if (mode === 'live') {
                voiceCallStatusTxt.textContent = "Đang bắt đầu ghi âm...";
                renderVirtualCallText('AI', data.welcomeText);

                // Kích hoạt Micro ghi âm raw PCM 16kHz
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    liveAudioStream = stream;

                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    liveAudioContext = new AudioContext({ sampleRate: 16000 });

                    const source = liveAudioContext.createMediaStreamSource(stream);
                    liveAudioProcessor = liveAudioContext.createScriptProcessor(2048, 1, 1);
                    
                    source.connect(liveAudioProcessor);
                    liveAudioProcessor.connect(liveAudioContext.destination);

                    liveAudioProcessor.onaudioprocess = (e) => {
                        if (!isVirtualCalling) return;
                        
                        const inputData = e.inputBuffer.getChannelData(0);
                        const pcm16 = new Int16Array(inputData.length);
                        for (let i = 0; i < inputData.length; i++) {
                            let s = Math.max(-1, Math.min(1, inputData[i]));
                            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                        }
                        
                        const base64Audio = arrayBufferToBase64(pcm16.buffer);
                        socket.emit('virtual-call.audio-input', {
                            callId: virtualCallId,
                            audio: base64Audio
                        });
                    };

                    voiceCallStatusTxt.textContent = "AI đang lắng nghe bạn...";

                } catch (err) {
                    console.error("Microphone Access Error:", err);
                    voiceCallStatusTxt.textContent = "Lỗi: Không được cấp quyền truy cập Micro.";
                    addTerminalLog("Lỗi đàm thoại Live: Không truy cập được micro. Đóng cuộc gọi.", "error");
                    stopVirtualCall();
                    return;
                }

                // Cấu hình sự kiện nhận audio và text từ Gemini Live
                socket.on('virtual-call.audio-output', (res) => {
                    if (res.callId !== virtualCallId) return;
                    
                    const float32Data = base64ToFloat32(res.audio);
                    playLiveAudioChunk(float32Data);
                });

                let lastTextSender = "";
                let lastTextDiv = null;

                socket.on('virtual-call.text-output', (res) => {
                    if (res.callId !== virtualCallId) return;
                    
                    const sender = res.sender;
                    const text = res.text;

                    if (sender === 'AI') {
                        voiceCallStatusTxt.textContent = "AI đang nói...";
                        if (lastTextSender === 'AI' && lastTextDiv) {
                            lastTextDiv.querySelector('span').textContent = text;
                        } else {
                            lastTextDiv = document.createElement('div');
                            lastTextDiv.style.marginBottom = '6px';
                            lastTextDiv.innerHTML = `<strong>AI:</strong> <span>${escapeHtml(text)}</span>`;
                            virtualCallLiveTranscript.appendChild(lastTextDiv);
                            lastTextSender = 'AI';
                        }
                    } else {
                        voiceCallStatusTxt.textContent = "AI đang lắng nghe bạn...";
                        
                        const div = document.createElement('div');
                        div.style.marginBottom = '6px';
                        div.innerHTML = `<strong>Bạn:</strong> <span>${escapeHtml(text)}</span>`;
                        virtualCallLiveTranscript.appendChild(div);
                        
                        lastTextSender = 'Bạn';
                        lastTextDiv = div;
                    }
                    virtualCallLiveTranscript.scrollTop = virtualCallLiveTranscript.scrollHeight;
                });

                socket.on('virtual-call.interrupted', (res) => {
                    if (res.callId !== virtualCallId) return;
                    
                    console.log("Client: AI bị ngắt lời, dừng phát âm thanh ngay lập tức.");
                    stopAllLiveAudio();
                    
                    if (lastTextSender === 'AI' && lastTextDiv) {
                        const span = lastTextDiv.querySelector('span');
                        if (!span.textContent.endsWith(" (bị ngắt lời)")) {
                            span.textContent += " (bị ngắt lời)";
                        }
                    }
                    voiceCallStatusTxt.textContent = "AI đang lắng nghe bạn...";
                });

            } else {
                // FALLBACK MODE
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                if (!SpeechRecognition) {
                    alert('Trình duyệt của bạn không hỗ trợ SpeechRecognition.');
                    stopVirtualCall();
                    return;
                }

                recognition = new SpeechRecognition();
                recognition.lang = 'vi-VN';
                recognition.continuous = true;
                recognition.interimResults = false;

                voiceCallStatusTxt.textContent = "AI đang nói...";
                renderVirtualCallText('AI', data.welcomeText);
                
                speakText(data.welcomeText, () => {
                    voiceCallStatusTxt.textContent = "AI đang lắng nghe bạn...";
                    try {
                        recognition.start();
                    } catch (e) {
                        console.error(e);
                    }
                });

                socket.on('virtual-call.reply', (replyData) => {
                    if (replyData.callId !== virtualCallId) return;
                    
                    voiceCallStatusTxt.textContent = "AI đang nói...";
                    renderVirtualCallText('AI', replyData.text);
                    
                    speakText(replyData.text, () => {
                        voiceCallStatusTxt.textContent = "AI đang lắng nghe bạn...";
                        try {
                            recognition.start();
                        } catch (e) {
                            console.error(e);
                        }
                    });
                });

                recognition.onresult = (event) => {
                    const lastResultIdx = event.results.length - 1;
                    const text = event.results[lastResultIdx][0].transcript.trim();
                    
                    if (text.length > 0) {
                        console.log("VirtualCall (Fallback) Speech:", text);
                        renderVirtualCallText('Bạn', text);
                        
                        try { recognition.stop(); } catch (e) {}
                        voiceCallStatusTxt.textContent = "AI đang suy nghĩ...";
                        socket.emit('virtual-call.message', { callId: virtualCallId, text });
                    }
                };

                recognition.onerror = (err) => {
                    console.error("Speech Recognition Error:", err.error);
                    if (err.error === 'no-speech') {
                        console.log("Không phát hiện giọng nói, tiếp tục lắng nghe...");
                    } else if (err.error === 'not-allowed') {
                        voiceCallStatusTxt.textContent = "Lỗi: Trình duyệt bị từ chối quyền Micro.";
                        stopVirtualCall();
                    } else {
                        voiceCallStatusTxt.textContent = `Lỗi kết nối Micro: ${err.error}`;
                        stopVirtualCall();
                    }
                };

                recognition.onend = () => {
                    if (isVirtualCalling && voiceCallStatusTxt.textContent.includes('lắng nghe')) {
                        try { recognition.start(); } catch (e) {}
                    }
                };
            }

            if (socket) socket.off('virtual-call.connected', onConnected);
        };

        if (socket) {
            socket.on('virtual-call.connected', onConnected);
        } else {
            setTimeout(() => {
                const welcome = "Dạ em chào anh chị, em là trợ lý đàm thoại ảo Zalo CRM. Em có thể giúp gì cho anh chị ạ?";
                virtualCallId = 'vcall_demo';
                voiceCallStatusTxt.textContent = "AI đang nói...";
                renderVirtualCallText('AI', welcome);
                speakText(welcome, () => {
                    voiceCallStatusTxt.textContent = "AI đang lắng nghe bạn... (Demo offline)";
                    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                    recognition = new SpeechRecognition();
                    recognition.lang = 'vi-VN';
                    recognition.start();
                    recognition.onresult = (e) => {
                        const txt = e.results[0][0].transcript.trim();
                        renderVirtualCallText('Bạn', txt);
                        setTimeout(() => {
                            const reply = "Dạ em đã ghi nhận thông tin anh chị vừa nói. Cảm ơn anh chị.";
                            renderVirtualCallText('AI', reply);
                            speakText(reply, () => {
                                voiceCallStatusTxt.textContent = "AI đang lắng nghe bạn...";
                            });
                        }, 1000);
                    };
                });
            }, 800);
        }
    }

    function stopVirtualCall() {
        if (!isVirtualCalling) return;
        isVirtualCalling = false;
        
        voiceCallTriggerBtn.classList.remove('calling');
        voiceCallMicIcon.setAttribute('data-lucide', 'mic');
        lucide.createIcons();
        voiceCallStatusTxt.textContent = "Cuộc đàm thoại đã kết thúc";
        
        // Phát tiếng bíp tắt
        playAudioTone(659, 100);
        setTimeout(() => playAudioTone(440, 150), 100);

        // 1. Tắt micro & giải phóng resources của Gemini Live API
        if (liveAudioProcessor) {
            try { liveAudioProcessor.disconnect(); } catch (e) {}
            liveAudioProcessor = null;
        }
        if (liveAudioStream) {
            try {
                liveAudioStream.getTracks().forEach(track => track.stop());
            } catch (e) {}
            liveAudioStream = null;
        }
        if (liveAudioContext) {
            try { liveAudioContext.close(); } catch (e) {}
            liveAudioContext = null;
        }

        // Dừng âm thanh đang phát
        stopAllLiveAudio();
        if (livePlaybackContext) {
            try { livePlaybackContext.close(); } catch(e) {}
            livePlaybackContext = null;
        }

        // 2. Tắt Speech Recognition (fallback mode)
        if (recognition) {
            try {
                recognition.stop();
            } catch (e) {}
            recognition = null;
        }

        // 3. Tắt Speech Synthesis (fallback mode)
        if (synth) {
            try {
                synth.cancel();
            } catch (e) {}
        }

        // 4. Báo cho socket đóng cuộc gọi
        if (socket && virtualCallId) {
            socket.emit('virtual-call.end', { callId: virtualCallId });
            socket.off('virtual-call.reply');
            socket.off('virtual-call.audio-output');
            socket.off('virtual-call.text-output');
            socket.off('virtual-call.interrupted');
        }

        virtualCallId = null;
    }

    function renderVirtualCallText(sender, text) {
        if (!virtualCallLiveTranscript) return;
        const div = document.createElement('div');
        div.style.marginBottom = '6px';
        div.innerHTML = `<strong>${sender}:</strong> <span>${escapeHtml(text)}</span>`;
        virtualCallLiveTranscript.appendChild(div);
        virtualCallLiveTranscript.scrollTop = virtualCallLiveTranscript.scrollHeight;
    }

    // Đọc văn bản bằng giọng nói (HTML5 Text-To-Speech)
    function speakText(text, onEndCallback) {
        if (!synth) {
            if (onEndCallback) onEndCallback();
            return;
        }
        
        synth.cancel(); // Tắt các âm thanh cũ đang phát dở
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Cố gắng tìm giọng đọc tiếng Việt (vi-VN)
        const voices = synth.getVoices();
        const viVoice = voices.find(v => v.lang.includes('vi'));
        if (viVoice) {
            utterance.voice = viVoice;
        }
        
        utterance.rate = 1.05; // Đọc nhanh hơn một chút cho tự nhiên
        utterance.pitch = 1.0;
        
        utterance.onend = () => {
            if (onEndCallback) onEndCallback();
        };

        utterance.onerror = (e) => {
            console.error("Speech synthesis error:", e);
            if (onEndCallback) onEndCallback();
        };

        synth.speak(utterance);
    }

    // Bộ phát âm tần số (Audio Web API) để tạo tiếng bíp kết nối/ngắt điện thoại
    function playAudioTone(frequency, durationMs) {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.frequency.value = frequency;
            gain.gain.setValueAtTime(0.06, ctx.currentTime); // Âm lượng nhỏ vừa phải
            
            osc.start();
            osc.stop(ctx.currentTime + (durationMs / 1000));
        } catch (e) {
            console.warn("Không thể phát audio tone:", e);
        }
    }

    // -------------------------------------------------------------
    // SOCKET.IO REALTIME EVENTS (Merged into main initWebSocket above)
    // -------------------------------------------------------------

    // Cập nhật tab active để render đúng nội dung khi người dùng click sidebar menu
    const originalSwitchTab = window.switchTab || switchTab;
    window.switchTab = function(tabId) {
        if (isVirtualCalling && tabId !== 'knowledge') {
            // Tự động ngắt cuộc gọi đàm thoại ảo nếu chuyển tab
            stopVirtualCall();
        }
        
        if (tabId === 'knowledge') {
            if (currentKbSubTab === 'kb-documents') {
                renderKnowledge();
            } else if (currentKbSubTab === 'kb-calls') {
                renderCallLogs();
            }
        } else if (tabId === 'customers') {
            renderCustomersTab();
        }
        
        // Gọi lại hàm switchTab gốc
        originalSwitchTab(tabId);
    };

    function initGroupChatControllers() {
        const sendBtn = document.getElementById('send-group-chat-btn');
        const simulateBtn = document.getElementById('simulate-group-chat-btn');
        const textInput = document.getElementById('group-chat-text-input');

        if (sendBtn) {
            sendBtn.addEventListener('click', async () => {
                const content = textInput.value.trim();
                const grp = selectedGroupForManage;
                if (!grp) {
                    alert('Vui lòng chọn một nhóm ở danh sách để gửi tin nhắn.');
                    return;
                }
                if (!content) {
                    alert('Vui lòng nhập nội dung tin nhắn.');
                    return;
                }

                sendBtn.disabled = true;
                try {
                    addTerminalLog(`Đang gửi tin nhắn live tới nhóm "${grp.name}"...`, 'info');
                    const res = await fetch(`${BACKEND_URL}/api/groups/message/send`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            accountId: grp.accountId,
                            groupId: grp.id,
                            content: content
                        })
                    });
                    const json = await res.json();
                    if (json.success) {
                        addTerminalLog('Đã gửi tin nhắn live thành công.', 'success');
                        textInput.value = '';
                    } else {
                        addTerminalLog(`Không thể gửi tin nhắn live: ${json.error}`, 'error');
                    }
                } catch (err) {
                    addTerminalLog(`Lỗi mạng khi gửi tin nhắn live: ${err.message}`, 'error');
                } finally {
                    sendBtn.disabled = false;
                }
            });
        }

        if (simulateBtn) {
            simulateBtn.addEventListener('click', async () => {
                const content = textInput.value.trim();
                const grp = selectedGroupForManage;
                if (!grp) {
                    alert('Vui lòng chọn một nhóm ở danh sách để giả lập tin nhắn.');
                    return;
                }
                if (!content) {
                    alert('Vui lòng nhập nội dung tin nhắn để test bot.');
                    return;
                }

                simulateBtn.disabled = true;
                try {
                    addTerminalLog(`Đang giả lập tin nhắn thành viên trong nhóm "${grp.name}" để test bot...`, 'info');
                    const res = await fetch(`${BACKEND_URL}/api/groups/message/simulate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            accountId: grp.accountId,
                            groupId: grp.id,
                            senderName: 'Thành viên Thử nghiệm',
                            senderId: 'user-sim-999',
                            content: content
                        })
                    });
                    const json = await res.json();
                    if (json.success) {
                        addTerminalLog('Giả lập tin nhắn thành viên thành công. Đang chờ bot xử lý...', 'success');
                        textInput.value = '';
                    } else {
                        addTerminalLog(`Không thể giả lập tin nhắn: ${json.error}`, 'error');
                    }
                } catch (err) {
                    addTerminalLog(`Lỗi mạng khi giả lập tin nhắn: ${err.message}`, 'error');
                } finally {
                    simulateBtn.disabled = false;
                }
            });
        }

        if (textInput) {
            textInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (sendBtn) sendBtn.click();
                }
            });
        }
    }

    // ==========================================================================
    // CUSTOMER PROFILES & AI MEMORIES LOGIC
    // ==========================================================================
    let selectedCustomer = null;

    const customerSearchInput = document.getElementById('customer-search-input');
    const customerVipFilter = document.getElementById('customer-vip-filter');
    const customerDirectoryList = document.getElementById('customer-directory-list');
    const customerNoSelection = document.getElementById('customer-no-selection');
    const customerMgrContent = document.getElementById('customer-mgr-content');
    const customerProfileEditForm = document.getElementById('customer-profile-edit-form');
    const customerAddMemoryForm = document.getElementById('customer-add-memory-form');
    const customerMemoriesListContainer = document.getElementById('customer-memories-list-container');

    // Add search and filter event listeners for customers directory
    if (customerSearchInput) {
        customerSearchInput.addEventListener('input', renderCustomersTab);
    }
    if (customerVipFilter) {
        customerVipFilter.addEventListener('change', renderCustomersTab);
    }

    async function renderCustomersTab() {
        if (!customerDirectoryList) return;
        customerDirectoryList.innerHTML = '<div class="text-center text-muted p-10">Đang tải danh sách...</div>';

        const searchVal = customerSearchInput ? customerSearchInput.value.trim() : '';
        const vipFilter = customerVipFilter ? customerVipFilter.value : '';

        let membersData = [];

        if (currentAppMode === 'live') {
            try {
                const url = new URL(`${BACKEND_URL}/api/members`);
                if (searchVal) url.searchParams.append('search', searchVal);
                if (vipFilter) url.searchParams.append('vipStatus', vipFilter);
                
                const res = await fetch(url.toString());
                const json = await res.json();
                if (json.success) {
                    membersData = json.data;
                }
            } catch (e) {
                console.error('Lỗi khi tải danh sách khách hàng từ backend:', e);
                customerDirectoryList.innerHTML = '<div class="text-center text-danger p-10">Không thể tải danh sách. Lỗi mạng.</div>';
                return;
            }
        } else {
            // Simulation Mode: collect from defaultMembers
            let simulatedList = [];
            Object.keys(defaultMembers).forEach(groupId => {
                defaultMembers[groupId].forEach(m => {
                    simulatedList.push({
                        id: `${groupId}-${m.id}`,
                        groupId: groupId,
                        zaloId: m.id,
                        name: m.name,
                        phone: m.phone || '',
                        vipStatus: m.vipStatus || 'normal',
                        xungHo: m.xungHo || '',
                        avatar: m.avatar || '',
                        notes: m.notes || '',
                        memoriesCount: 0
                    });
                });
            });
            // Filter
            membersData = simulatedList.filter(m => {
                const matchesSearch = m.name.toLowerCase().includes(searchVal.toLowerCase()) || 
                                      m.phone.includes(searchVal) || 
                                      m.notes.toLowerCase().includes(searchVal.toLowerCase());
                const matchesVip = !vipFilter || m.vipStatus === vipFilter;
                return matchesSearch && matchesVip;
            });
        }

        customerDirectoryList.innerHTML = '';
        if (membersData.length === 0) {
            customerDirectoryList.innerHTML = '<div class="text-center text-muted p-10">Không tìm thấy khách hàng nào.</div>';
            return;
        }

        membersData.forEach(member => {
            const card = document.createElement('div');
            card.className = `customer-item-card ${selectedCustomer && selectedCustomer.id === member.id ? 'active' : ''}`;
            
            let vipBadge = '<span class="badge badge-normal">Normal</span>';
            if (member.vipStatus === 'vip') {
                vipBadge = '<span class="badge badge-vip">VIP ⭐</span>';
            } else if (member.vipStatus === 'blacklist') {
                vipBadge = '<span class="badge badge-blacklist">Blacklist 🚫</span>';
            }

            // Get group name from groups state
            const grp = groups.find(g => g.id === member.groupId);
            const groupName = grp ? grp.name : 'Nhóm Zalo';

            card.innerHTML = `
                <img src="${member.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80'}" class="customer-item-avatar" onerror="handleAvatarError(this)">
                <div class="customer-item-details">
                    <span class="customer-item-name" title="${member.name}">${member.name}</span>
                    <div class="customer-item-meta">
                        ${vipBadge}
                        <span title="${groupName}" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px;">${groupName}</span>
                    </div>
                </div>
                <div class="flex-column align-items-end" style="gap:2px; display:flex; justify-content:center;">
                    <span class="badge" style="background:rgba(255,255,255,0.05); font-size:0.7rem;" title="Số lượng sự kiện ghi nhớ AI">${member.memoriesCount || 0} Trí nhớ</span>
                </div>
            `;

            card.addEventListener('click', () => {
                selectedCustomer = member;
                renderCustomersTab();
                loadCustomerDetails(member);
            });

            customerDirectoryList.appendChild(card);
        });

        lucide.createIcons();
    }

    async function loadCustomerDetails(member) {
        if (!member) {
            if (customerNoSelection) customerNoSelection.classList.remove('hidden');
            if (customerMgrContent) customerMgrContent.classList.add('hidden');
            return;
        }

        if (customerNoSelection) customerNoSelection.classList.add('hidden');
        if (customerMgrContent) customerMgrContent.classList.remove('hidden');

        // Populate fields
        document.getElementById('customer-detail-id').value = member.id;
        document.getElementById('customer-detail-group-id').value = member.groupId;
        document.getElementById('customer-detail-zalo-id').value = member.zaloId;
        document.getElementById('customer-detail-name').textContent = member.name;
        document.getElementById('customer-edit-name').value = member.name;
        document.getElementById('customer-edit-phone').value = member.phone || '';
        document.getElementById('customer-edit-vip').value = member.vipStatus || 'normal';
        document.getElementById('customer-edit-xungho').value = member.xungHo || '';
        document.getElementById('customer-edit-notes').value = member.notes || '';

        // Avatar
        const avatarImg = document.getElementById('customer-detail-avatar');
        if (avatarImg) {
            avatarImg.src = member.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80';
        }

        // Vip badge
        const badge = document.getElementById('customer-detail-vip-badge');
        if (badge) {
            badge.className = `badge badge-${member.vipStatus || 'normal'}`;
            badge.textContent = (member.vipStatus || 'normal').toUpperCase();
        }

        // Group name
        const grp = groups.find(g => g.id === member.groupId);
        const groupName = grp ? grp.name : 'Nhóm Zalo';
        document.getElementById('customer-detail-group-name').textContent = `Nhóm: ${groupName}`;

        // Load memories
        await loadCustomerMemories(member.groupId, member.zaloId);
    }

    async function loadCustomerMemories(groupId, zaloId) {
        if (!customerMemoriesListContainer) return;
        customerMemoriesListContainer.innerHTML = '<div class="text-center text-muted p-10">Đang tải trí nhớ AI...</div>';

        let memories = [];
        if (currentAppMode === 'live') {
            try {
                const res = await fetch(`${BACKEND_URL}/api/members/${groupId}/${zaloId}/memories`);
                const json = await res.json();
                if (json.success) {
                    memories = json.data;
                }
            } catch (e) {
                console.error('Lỗi tải trí nhớ:', e);
                customerMemoriesListContainer.innerHTML = '<div class="text-center text-danger p-10">Lỗi tải trí nhớ.</div>';
                return;
            }
        } else {
            // Mock memories
            memories = [
                { id: 'm1', fact: 'Khách hàng quan tâm đến khóa học Zalo Automation.', importance: 3, createdAt: new Date() },
                { id: 'm2', fact: 'Thường nhắn tin hỏi giá vào buổi tối.', importance: 1, createdAt: new Date() }
            ];
        }

        customerMemoriesListContainer.innerHTML = '';
        if (memories.length === 0) {
            customerMemoriesListContainer.innerHTML = '<div class="text-center text-muted p-10">AI chưa ghi nhớ thông tin nào về khách hàng này.</div>';
            return;
        }

        memories.forEach(mem => {
            const item = document.createElement('div');
            item.className = 'customer-memory-item';
            
            let impText = 'Thường';
            if (mem.importance === 3) impText = 'Quan trọng';
            if (mem.importance === 5) impText = 'VIP';

            item.innerHTML = `
                <span class="customer-memory-text">${escapeHtml(mem.fact)}</span>
                <span class="customer-memory-importance importance-${mem.importance || 3}">${impText}</span>
                <button type="button" class="customer-memory-delete-btn" data-id="${mem.id}" title="Xóa ghi nhớ này">
                    <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                </button>
            `;

            item.querySelector('.customer-memory-delete-btn').addEventListener('click', async () => {
                if (confirm('Bạn có chắc chắn muốn xóa ghi nhớ AI này?')) {
                    if (currentAppMode === 'live') {
                        try {
                            const res = await fetch(`${BACKEND_URL}/api/members/${groupId}/${zaloId}/memories/${mem.id}`, {
                                method: 'DELETE'
                            });
                            const json = await res.json();
                            if (json.success) {
                                addTerminalLog('Đã xóa ghi nhớ AI thành công.', 'success');
                                loadCustomerMemories(groupId, zaloId);
                                renderCustomersTab(); // refresh count
                            } else {
                                alert('Không thể xóa ghi nhớ: ' + json.error);
                            }
                        } catch (err) {
                            alert('Lỗi kết nối backend.');
                        }
                    } else {
                        addTerminalLog('Mô phỏng xóa ghi nhớ thành công.', 'warn');
                        item.remove();
                    }
                }
            });

            customerMemoriesListContainer.appendChild(item);
        });

        lucide.createIcons();
    }

    // Submit forms inside tab
    if (customerProfileEditForm) {
        customerProfileEditForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('customer-detail-id').value;
            const groupId = document.getElementById('customer-detail-group-id').value;
            const zaloId = document.getElementById('customer-detail-zalo-id').value;
            const name = document.getElementById('customer-edit-name').value.trim();
            const phone = document.getElementById('customer-edit-phone').value.trim();
            const vipStatus = document.getElementById('customer-edit-vip').value;
            const xungHo = document.getElementById('customer-edit-xungho').value;
            const notes = document.getElementById('customer-edit-notes').value.trim();

            if (currentAppMode === 'live') {
                try {
                    const res = await fetch(`${BACKEND_URL}/api/members/update`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id, groupId, zaloId, name, phone, vipStatus, notes, xungHo })
                    });
                    const json = await res.json();
                    if (json.success) {
                        addTerminalLog(`Đã cập nhật hồ sơ khách hàng "${name}" thành công.`, 'success');
                        
                        // Update defaultMembers local cache for instant UI feedback
                        const grpMembers = defaultMembers[groupId] || [];
                        const localMemberIndex = grpMembers.findIndex(m => m.id === zaloId);
                        if (localMemberIndex !== -1) {
                            grpMembers[localMemberIndex].name = name;
                            grpMembers[localMemberIndex].phone = phone;
                            grpMembers[localMemberIndex].vipStatus = vipStatus;
                            grpMembers[localMemberIndex].xungHo = xungHo;
                            grpMembers[localMemberIndex].notes = notes;
                            grpMembers[localMemberIndex].lastSentiment = lastSentiment;
                        }

                        // Refresh UI
                        selectedCustomer.name = name;
                        selectedCustomer.phone = phone;
                        selectedCustomer.vipStatus = vipStatus;
                        selectedCustomer.xungHo = xungHo;
                        selectedCustomer.notes = notes;

                        loadCustomerDetails(selectedCustomer);
                        renderCustomersTab();
                    } else {
                        alert('Không thể cập nhật hồ sơ: ' + json.error);
                    }
                } catch (err) {
                    alert('Lỗi kết nối backend.');
                }
            } else {
                addTerminalLog('Mô phỏng cập nhật hồ sơ thành công.', 'success');
                // update local cached list
                const grpMembers = defaultMembers[groupId] || [];
                const localMember = grpMembers.find(m => m.id === zaloId);
                if (localMember) {
                    localMember.name = name;
                    localMember.phone = phone;
                    localMember.vipStatus = vipStatus;
                    localMember.xungHo = xungHo;
                    localMember.notes = notes;
                }
                selectedCustomer.name = name;
                selectedCustomer.phone = phone;
                selectedCustomer.vipStatus = vipStatus;
                selectedCustomer.xungHo = xungHo;
                selectedCustomer.notes = notes;
                loadCustomerDetails(selectedCustomer);
                renderCustomersTab();
            }
        });
    }

    if (customerAddMemoryForm) {
        customerAddMemoryForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const groupId = document.getElementById('customer-detail-group-id').value;
            const zaloId = document.getElementById('customer-detail-zalo-id').value;
            const fact = document.getElementById('customer-memory-text').value.trim();
            const importance = document.getElementById('customer-memory-importance').value;

            if (currentAppMode === 'live') {
                try {
                    const res = await fetch(`${BACKEND_URL}/api/members/${groupId}/${zaloId}/memories`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fact, importance })
                    });
                    const json = await res.json();
                    if (json.success) {
                        addTerminalLog('Đã thêm ghi nhớ AI thành công.', 'success');
                        document.getElementById('customer-memory-text').value = '';
                        loadCustomerMemories(groupId, zaloId);
                        renderCustomersTab(); // refresh count
                    } else {
                        alert('Không thể thêm ghi nhớ: ' + json.error);
                    }
                } catch (err) {
                    alert('Lỗi kết nối backend.');
                }
            } else {
                addTerminalLog('Mô phỏng thêm ghi nhớ thành công.', 'success');
                document.getElementById('customer-memory-text').value = '';
                loadCustomerMemories(groupId, zaloId);
            }
        });
    }

    // Modal overlay elements
    const memberDetailModal = document.getElementById('member-detail-modal');
    const closeMemberDetailModalBtn = document.getElementById('close-member-detail-modal-btn');
    const closeMdDetailsBtn = document.getElementById('close-md-details-btn');
    const mdProfileForm = document.getElementById('md-profile-form');
    const mdAddMemoryForm = document.getElementById('md-add-memory-form');
    const mdMemoriesListContainer = document.getElementById('md-memories-list-container');

    // Bind modal close buttons
    if (closeMemberDetailModalBtn) {
        closeMemberDetailModalBtn.addEventListener('click', closeMemberDetailModal);
    }
    if (closeMdDetailsBtn) {
        closeMdDetailsBtn.addEventListener('click', closeMemberDetailModal);
    }

    function closeMemberDetailModal() {
        if (memberDetailModal) {
            memberDetailModal.classList.remove('active');
        }
    }

    async function openMemberDetailModal(groupId, zaloId, name, avatar) {
        if (!memberDetailModal) return;
        
        memberDetailModal.classList.add('active');

        // Populate fields
        document.getElementById('md-group-id').value = groupId;
        document.getElementById('md-zalo-id').value = zaloId;
        document.getElementById('md-name').textContent = name;
        document.getElementById('md-edit-name').value = name;
        
        const avatarImg = document.getElementById('md-avatar');
        if (avatarImg) {
            avatarImg.src = avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80';
        }

        const grp = groups.find(g => g.id === groupId);
        document.getElementById('md-group-name').textContent = `Nhóm: ${grp ? grp.name : 'Không rõ'}`;

        // Initialize values to defaults
        document.getElementById('md-edit-phone').value = '';
        document.getElementById('md-edit-vip').value = 'normal';
        document.getElementById('md-edit-xungho').value = '';
        document.getElementById('md-edit-notes').value = '';
        document.getElementById('md-vip-badge').className = 'badge badge-normal';
        document.getElementById('md-vip-badge').textContent = 'NORMAL';
        document.getElementById('md-edit-sentiment').value = 'Bình thường';
        const sBadgeInit = document.getElementById('md-sentiment-badge');
        if (sBadgeInit) {
            sBadgeInit.textContent = 'BÌNH THƯỜNG';
            sBadgeInit.style.background = 'rgba(142, 68, 173, 0.2)';
            sBadgeInit.style.color = '#8e44ad';
            sBadgeInit.style.border = '1px solid rgba(142, 68, 173, 0.3)';
        }

        // Load details from backend
        if (currentAppMode === 'live') {
            try {
                // Fetch specific member details
                const res = await fetch(`${BACKEND_URL}/api/members/${groupId}/${zaloId}`);
                const json = await res.json();
                if (json.success) {
                    const member = json.data;
                    if (member) {
                        document.getElementById('md-edit-phone').value = member.phone || '';
                        document.getElementById('md-edit-vip').value = member.vipStatus || 'normal';
                        document.getElementById('md-edit-xungho').value = member.xungHo || '';
                        document.getElementById('md-edit-notes').value = member.notes || '';
                        document.getElementById('md-edit-sentiment').value = member.lastSentiment || 'Bình thường';
                        
                        const badge = document.getElementById('md-vip-badge');
                        badge.className = `badge badge-${member.vipStatus || 'normal'}`;
                        badge.textContent = (member.vipStatus || 'normal').toUpperCase();

                        const sBadge = document.getElementById('md-sentiment-badge');
                        if (sBadge) {
                            const curSentiment = member.lastSentiment || 'Bình thường';
                            sBadge.textContent = curSentiment.toUpperCase();
                            if (curSentiment === 'Vui vẻ') {
                                sBadge.style.background = 'rgba(46, 204, 113, 0.2)';
                                sBadge.style.color = '#2ecc71';
                                sBadge.style.border = '1px solid rgba(46, 204, 113, 0.3)';
                            } else if (curSentiment === 'Tức giận') {
                                sBadge.style.background = 'rgba(231, 76, 60, 0.2)';
                                sBadge.style.color = '#e74c3c';
                                sBadge.style.border = '1px solid rgba(231, 76, 60, 0.3)';
                            } else if (curSentiment === 'Lo lắng') {
                                sBadge.style.background = 'rgba(230, 126, 34, 0.2)';
                                sBadge.style.color = '#e67e22';
                                sBadge.style.border = '1px solid rgba(230, 126, 34, 0.3)';
                            } else {
                                sBadge.style.background = 'rgba(142, 68, 173, 0.2)';
                                sBadge.style.color = '#8e44ad';
                                sBadge.style.border = '1px solid rgba(142, 68, 173, 0.3)';
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Lỗi khi tải thông tin chi tiết thành viên:', e);
            }
        } else {
            // Simulation: search in defaultMembers local list
            const grpMembers = defaultMembers[groupId] || [];
            const localMember = grpMembers.find(m => m.id === zaloId);
            if (localMember) {
                document.getElementById('md-edit-phone').value = localMember.phone || '';
                document.getElementById('md-edit-vip').value = localMember.vipStatus || 'normal';
                document.getElementById('md-edit-xungho').value = localMember.xungHo || '';
                document.getElementById('md-edit-notes').value = localMember.notes || '';
                document.getElementById('md-edit-sentiment').value = localMember.lastSentiment || 'Bình thường';
                
                const badge = document.getElementById('md-vip-badge');
                badge.className = `badge badge-${localMember.vipStatus || 'normal'}`;
                badge.textContent = (localMember.vipStatus || 'normal').toUpperCase();

                const sBadgeSim = document.getElementById('md-sentiment-badge');
                if (sBadgeSim) {
                    const curSentiment = localMember.lastSentiment || 'Bình thường';
                    sBadgeSim.textContent = curSentiment.toUpperCase();
                    if (curSentiment === 'Vui vẻ') {
                        sBadgeSim.style.background = 'rgba(46, 204, 113, 0.2)';
                        sBadgeSim.style.color = '#2ecc71';
                        sBadgeSim.style.border = '1px solid rgba(46, 204, 113, 0.3)';
                    } else if (curSentiment === 'Tức giận') {
                        sBadgeSim.style.background = 'rgba(231, 76, 60, 0.2)';
                        sBadgeSim.style.color = '#e74c3c';
                        sBadgeSim.style.border = '1px solid rgba(231, 76, 60, 0.3)';
                    } else if (curSentiment === 'Lo lắng') {
                        sBadgeSim.style.background = 'rgba(230, 126, 34, 0.2)';
                        sBadgeSim.style.color = '#e67e22';
                        sBadgeSim.style.border = '1px solid rgba(230, 126, 34, 0.3)';
                    } else {
                        sBadgeSim.style.background = 'rgba(142, 68, 173, 0.2)';
                        sBadgeSim.style.color = '#8e44ad';
                        sBadgeSim.style.border = '1px solid rgba(142, 68, 173, 0.3)';
                    }
                }
            }
        }

        // Load memories
        await loadModalMemories(groupId, zaloId);

        // Load sentiment history
        await loadSentimentHistory(groupId, zaloId);
    }

    async function loadModalMemories(groupId, zaloId) {
        if (!mdMemoriesListContainer) return;
        mdMemoriesListContainer.innerHTML = '<div class="text-center text-muted p-10">Đang tải...</div>';

        let memories = [];
        if (currentAppMode === 'live') {
            try {
                const res = await fetch(`${BACKEND_URL}/api/members/${groupId}/${zaloId}/memories`);
                const json = await res.json();
                if (json.success) {
                    memories = json.data;
                }
            } catch (e) {
                console.error('Lỗi tải trí nhớ trong modal:', e);
                mdMemoriesListContainer.innerHTML = '<div class="text-center text-danger p-10">Lỗi.</div>';
                return;
            }
        } else {
            memories = [
                { id: 'm1', fact: 'Khách hàng quan tâm đến khóa học Zalo Automation.', importance: 3 }
            ];
        }

        mdMemoriesListContainer.innerHTML = '';
        if (memories.length === 0) {
            mdMemoriesListContainer.innerHTML = '<div class="text-center text-muted p-10" style="font-size:0.8rem;">Chưa có trí nhớ AI nào.</div>';
            return;
        }

        memories.forEach(mem => {
            const item = document.createElement('div');
            item.className = 'customer-memory-item';
            item.style.padding = '8px 10px';
            
            let impText = 'Thường';
            if (mem.importance === 3) impText = 'Quan trọng';
            if (mem.importance === 5) impText = 'VIP';

            item.innerHTML = `
                <span class="customer-memory-text" style="font-size:0.78rem;">${escapeHtml(mem.fact)}</span>
                <span class="customer-memory-importance importance-${mem.importance || 3}" style="font-size:0.65rem; padding:1px 4px;">${impText}</span>
                <button type="button" class="customer-memory-delete-btn md-mem-del-btn" data-id="${mem.id}" title="Xóa ghi nhớ này">
                    <i data-lucide="trash-2" style="width:12px; height:12px;"></i>
                </button>
            `;

            item.querySelector('.md-mem-del-btn').addEventListener('click', async () => {
                if (confirm('Bạn có chắc chắn muốn xóa ghi nhớ AI này?')) {
                    if (currentAppMode === 'live') {
                        try {
                            const res = await fetch(`${BACKEND_URL}/api/members/${groupId}/${zaloId}/memories/${mem.id}`, {
                                method: 'DELETE'
                            });
                            const json = await res.json();
                            if (json.success) {
                                addTerminalLog('Đã xóa ghi nhớ AI thành công.', 'success');
                                loadModalMemories(groupId, zaloId);
                            } else {
                                alert('Không thể xóa ghi nhớ: ' + json.error);
                            }
                        } catch (err) {
                            alert('Lỗi kết nối backend.');
                        }
                    } else {
                        addTerminalLog('Mô phỏng xóa ghi nhớ thành công.', 'warn');
                        item.remove();
                    }
                }
            });

            mdMemoriesListContainer.appendChild(item);
        });

        lucide.createIcons();
    }

    async function loadSentimentHistory(groupId, zaloId) {
        const listContainer = document.getElementById('md-sentiment-history-list');
        const chartContainer = document.getElementById('sentiment-history-chart');
        if (!listContainer || !chartContainer) return;

        listContainer.innerHTML = '<div class="text-center text-muted p-5">Đang tải lịch sử...</div>';

        let history = [];
        if (currentAppMode === 'live') {
            try {
                const res = await fetch(`${BACKEND_URL}/api/members/${groupId}/${zaloId}/sentiment-history`);
                const json = await res.json();
                if (json.success) {
                    history = json.data || [];
                }
            } catch (e) {
                console.error('Lỗi khi tải lịch sử cảm xúc:', e);
            }
        } else {
            // Mock simulation history
            history = [
                { id: 'sh1', sentiment: 'Bình thường', createdAt: new Date(Date.now() - 3600000 * 24 * 3).toISOString() },
                { id: 'sh2', sentiment: 'Vui vẻ', createdAt: new Date(Date.now() - 3600000 * 24 * 2).toISOString() },
                { id: 'sh3', sentiment: 'Lo lắng', createdAt: new Date(Date.now() - 3600000 * 12).toISOString() },
                { id: 'sh4', sentiment: 'Tức giận', createdAt: new Date(Date.now() - 3600000 * 2).toISOString() },
                { id: 'sh5', sentiment: 'Bình thường', createdAt: new Date().toISOString() }
            ];
        }

        if (history.length === 0) {
            listContainer.innerHTML = '<div class="text-center text-muted p-5">Chưa có biến động cảm xúc nào được ghi nhận.</div>';
            chartContainer.innerHTML = '<text x="150" y="45" fill="var(--text-muted)" font-size="9" text-anchor="middle">Chưa có lịch sử biến động</text>';
            return;
        }

        // Render timeline list
        listContainer.innerHTML = '';
        const sortedHistory = [...history].reverse();
        sortedHistory.forEach(h => {
            const date = new Date(h.createdAt);
            const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
            
            const emoji = h.sentiment === 'Vui vẻ' ? '😊' : h.sentiment === 'Tức giận' ? '😡' : h.sentiment === 'Lo lắng' ? '😰' : '😐';
            const colorClass = h.sentiment === 'Vui vẻ' ? 'text-success' : h.sentiment === 'Tức giận' ? 'text-danger' : h.sentiment === 'Lo lắng' ? 'text-warning' : 'text-primary';
            
            const item = document.createElement('div');
            item.className = 'flex-row justify-between align-center p-6';
            item.style = 'border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;';
            item.innerHTML = `
                <span class="text-muted" style="font-size: 0.7rem;">${timeStr}</span>
                <span style="font-weight: 600;" class="${colorClass}">${h.sentiment} ${emoji}</span>
            `;
            listContainer.appendChild(item);
        });

        // Render SVG Line Chart
        const sentimentMap = {
            'Vui vẻ': 4,
            'Bình thường': 3,
            'Lo lắng': 2,
            'Tức giận': 1
        };

        const mapY = (val) => {
            if (val === 4) return 15;
            if (val === 3) return 35;
            if (val === 2) return 55;
            return 75;
        };

        const getSentimentColor = (s) => {
            if (s === 'Vui vẻ') return '#2ecc71';
            if (s === 'Tức giận') return '#e74c3c';
            if (s === 'Lo lắng') return '#e67e22';
            return '#8e44ad';
        };

        let svgHtml = `
            <!-- Grid reference lines -->
            <line x1="30" y1="15" x2="290" y2="15" stroke="rgba(255,255,255,0.05)" stroke-dasharray="2,2" />
            <line x1="30" y1="35" x2="290" y2="35" stroke="rgba(255,255,255,0.05)" stroke-dasharray="2,2" />
            <line x1="30" y1="55" x2="290" y2="55" stroke="rgba(255,255,255,0.05)" stroke-dasharray="2,2" />
            <line x1="30" y1="75" x2="290" y2="75" stroke="rgba(255,255,255,0.05)" stroke-dasharray="2,2" />
            
            <!-- Reference labels -->
            <text x="5" y="18" fill="#2ecc71" font-size="7" font-weight="600">Vui</text>
            <text x="5" y="38" fill="#8e44ad" font-size="7" font-weight="600">Bình</text>
            <text x="5" y="58" fill="#e67e22" font-size="7" font-weight="600">Lo</text>
            <text x="5" y="78" fill="#e74c3c" font-size="7" font-weight="600">Giận</text>
        `;

        if (history.length === 1) {
            const s = history[0].sentiment;
            const y = mapY(sentimentMap[s] || 3);
            const color = getSentimentColor(s);
            svgHtml += `
                <circle cx="160" cy="${y}" r="4" fill="${color}" stroke="#fff" stroke-width="1.5" />
                <text x="160" y="${y - 8}" fill="${color}" font-size="8" font-weight="600" text-anchor="middle">${s}</text>
            `;
        } else {
            const points = [];
            const count = history.length;
            const startX = 40;
            const endX = 280;
            const stepX = count > 1 ? (endX - startX) / (count - 1) : 0;

            history.forEach((h, index) => {
                const s = h.sentiment || 'Bình thường';
                const x = startX + index * stepX;
                const val = sentimentMap[s] || 3;
                const y = mapY(val);
                points.push({ x, y, s, date: new Date(h.createdAt) });
            });

            let pathD = `M ${points[0].x} ${points[0].y}`;
            for (let i = 1; i < points.length; i++) {
                pathD += ` L ${points[i].x} ${points[i].y}`;
            }

            svgHtml += `
                <path d="${pathD}" fill="none" stroke="rgba(142, 68, 173, 0.4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <path d="${pathD}" fill="none" stroke="rgba(142, 68, 173, 0.15)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
            `;

            points.forEach((pt, idx) => {
                const color = getSentimentColor(pt.s);
                const showLabel = idx === 0 || idx === points.length - 1 || pt.s !== points[idx - 1].s;
                
                svgHtml += `
                    <circle cx="${pt.x}" cy="${pt.y}" r="3" fill="${color}" stroke="#fff" stroke-width="1" />
                `;

                if (showLabel) {
                    const dateStr = pt.date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });
                    svgHtml += `
                        <text x="${pt.x}" y="${pt.y - 7}" fill="${color}" font-size="7" font-weight="600" text-anchor="middle">${pt.s.substring(0,4)}</text>
                        <text x="${pt.x}" y="88" fill="var(--text-muted)" font-size="6" text-anchor="middle">${dateStr}</text>
                    `;
                }
            });
        }

        chartContainer.innerHTML = svgHtml;
    }

    if (mdProfileForm) {
        mdProfileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const groupId = document.getElementById('md-group-id').value;
            const zaloId = document.getElementById('md-zalo-id').value;
            const name = document.getElementById('md-edit-name').value.trim();
            const phone = document.getElementById('md-edit-phone').value.trim();
            const vipStatus = document.getElementById('md-edit-vip').value;
            const xungHo = document.getElementById('md-edit-xungho').value;
            const notes = document.getElementById('md-edit-notes').value.trim();
            const lastSentiment = document.getElementById('md-edit-sentiment').value;

            if (currentAppMode === 'live') {
                try {
                    const res = await fetch(`${BACKEND_URL}/api/members/update`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ groupId, zaloId, name, phone, vipStatus, notes, xungHo, lastSentiment })
                    });
                    const json = await res.json();
                    if (json.success) {
                        addTerminalLog(`Đã cập nhật hồ sơ thành viên "${name}" thành công.`, 'success');
                        
                        // Update defaultMembers local cache
                        const grpMembers = defaultMembers[groupId] || [];
                        const localMemberIndex = grpMembers.findIndex(m => m.id === zaloId);
                        if (localMemberIndex !== -1) {
                            grpMembers[localMemberIndex].name = name;
                            grpMembers[localMemberIndex].phone = phone;
                            grpMembers[localMemberIndex].vipStatus = vipStatus;
                            grpMembers[localMemberIndex].xungHo = xungHo;
                            grpMembers[localMemberIndex].notes = notes;
                            grpMembers[localMemberIndex].lastSentiment = lastSentiment;
                        }

                        // Update badge UI
                        const badge = document.getElementById('md-vip-badge');
                        badge.className = `badge badge-${vipStatus}`;
                        badge.textContent = vipStatus.toUpperCase();

                        const sBadge = document.getElementById('md-sentiment-badge');
                        if (sBadge) {
                            sBadge.textContent = lastSentiment.toUpperCase();
                            if (lastSentiment === 'Vui vẻ') {
                                sBadge.style.background = 'rgba(46, 204, 113, 0.2)';
                                sBadge.style.color = '#2ecc71';
                                sBadge.style.border = '1px solid rgba(46, 204, 113, 0.3)';
                            } else if (lastSentiment === 'Tức giận') {
                                sBadge.style.background = 'rgba(231, 76, 60, 0.2)';
                                sBadge.style.color = '#e74c3c';
                                sBadge.style.border = '1px solid rgba(231, 76, 60, 0.3)';
                            } else if (lastSentiment === 'Lo lắng') {
                                sBadge.style.background = 'rgba(230, 126, 34, 0.2)';
                                sBadge.style.color = '#e67e22';
                                sBadge.style.border = '1px solid rgba(230, 126, 34, 0.3)';
                            } else {
                                sBadge.style.background = 'rgba(142, 68, 173, 0.2)';
                                sBadge.style.color = '#8e44ad';
                                sBadge.style.border = '1px solid rgba(142, 68, 173, 0.3)';
                            }
                        }

                        // Refresh active members list if current tab is members
                        if (activeTab === 'members') {
                            renderActiveMembers(selectedGroupForMembers);
                        }

                        // Refresh sentiment history
                        loadSentimentHistory(groupId, zaloId);
                    } else {
                        alert('Không thể cập nhật hồ sơ: ' + json.error);
                    }
                } catch (err) {
                    alert('Lỗi kết nối backend.');
                }
            } else {
                addTerminalLog('Mô phỏng cập nhật hồ sơ thành công.', 'success');
                const grpMembers = defaultMembers[groupId] || [];
                const localMember = grpMembers.find(m => m.id === zaloId);
                if (localMember) {
                    localMember.name = name;
                    localMember.phone = phone;
                    localMember.vipStatus = vipStatus;
                    localMember.xungHo = xungHo;
                    localMember.notes = notes;
                }
                const badge = document.getElementById('md-vip-badge');
                badge.className = `badge badge-${vipStatus}`;
                badge.textContent = vipStatus.toUpperCase();

                const sBadgeSimSub = document.getElementById('md-sentiment-badge');
                if (sBadgeSimSub) {
                    sBadgeSimSub.textContent = lastSentiment.toUpperCase();
                    if (lastSentiment === 'Vui vẻ') {
                        sBadgeSimSub.style.background = 'rgba(46, 204, 113, 0.2)';
                        sBadgeSimSub.style.color = '#2ecc71';
                        sBadgeSimSub.style.border = '1px solid rgba(46, 204, 113, 0.3)';
                    } else if (lastSentiment === 'Tức giận') {
                        sBadgeSimSub.style.background = 'rgba(231, 76, 60, 0.2)';
                        sBadgeSimSub.style.color = '#e74c3c';
                        sBadgeSimSub.style.border = '1px solid rgba(231, 76, 60, 0.3)';
                    } else if (lastSentiment === 'Lo lắng') {
                        sBadgeSimSub.style.background = 'rgba(230, 126, 34, 0.2)';
                        sBadgeSimSub.style.color = '#e67e22';
                        sBadgeSimSub.style.border = '1px solid rgba(230, 126, 34, 0.3)';
                    } else {
                        sBadgeSimSub.style.background = 'rgba(142, 68, 173, 0.2)';
                        sBadgeSimSub.style.color = '#8e44ad';
                        sBadgeSimSub.style.border = '1px solid rgba(142, 68, 173, 0.3)';
                    }
                }
                
                if (activeTab === 'members') {
                    renderActiveMembers(selectedGroupForMembers);
                }

                // Refresh sentiment history
                loadSentimentHistory(groupId, zaloId);
            }
        });
    }

    if (mdAddMemoryForm) {
        mdAddMemoryForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const groupId = document.getElementById('md-group-id').value;
            const zaloId = document.getElementById('md-zalo-id').value;
            const fact = document.getElementById('md-memory-text').value.trim();

            if (currentAppMode === 'live') {
                try {
                    const res = await fetch(`${BACKEND_URL}/api/members/${groupId}/${zaloId}/memories`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fact, importance: 3 })
                    });
                    const json = await res.json();
                    if (json.success) {
                        addTerminalLog('Đã thêm ghi nhớ AI thành công.', 'success');
                        document.getElementById('md-memory-text').value = '';
                        loadModalMemories(groupId, zaloId);
                    } else {
                        alert('Không thể thêm ghi nhớ: ' + json.error);
                    }
                } catch (err) {
                    alert('Lỗi kết nối backend.');
                }
            } else {
                addTerminalLog('Mô phỏng thêm ghi nhớ thành công.', 'success');
                document.getElementById('md-memory-text').value = '';
                loadModalMemories(groupId, zaloId);
            }
        });
    }

    // ==========================================================================
    // GROUP MINDMAP VISUALIZATION LOGIC
    // ==========================================================================
    async function renderGroupMindmap(grp) {
        const canvasContainer = document.getElementById('mindmap-canvas-container');
        if (!canvasContainer) return;
        
        canvasContainer.innerHTML = '<div class="text-center text-muted p-20"><i data-lucide="refresh-cw" class="spin"></i> Đang phân tích và vẽ sơ đồ tư duy...</div>';
        lucide.createIcons();

        // Gather Group Members
        let membersList = getGroupMembers(grp.id);
        if (membersList.length === 0 && currentAppMode === 'live') {
            try {
                const res = await fetch(`${BACKEND_URL}/api/groups/members?accountId=${grp.accountId}&groupId=${grp.id}`);
                const json = await res.json();
                if (json.success) {
                    defaultMembers[grp.id] = json.data;
                    membersList = json.data;
                }
            } catch (e) {
                console.error('Lỗi khi fetch members cho mindmap:', e);
            }
        }

        // Get group purpose and settings
        let purpose = grp.groupPurpose || 'Chưa thiết lập';
        let lockName = grp.lockName ? 'Khóa tên' : 'Mở tên';
        let lockDesc = grp.lockDesc ? 'Khóa mô tả' : 'Mở mô tả';
        let approveMembers = grp.approveMembers ? 'Duyệt thành viên' : 'Tự do vào';

        // Count roles & VIPs
        let creatorName = 'Chưa rõ';
        let admins = [];
        let vipCount = 0;
        let blacklistCount = 0;

        membersList.forEach(m => {
            if (m.role === 'creator') creatorName = m.name;
            if (m.role === 'admin') admins.push(m.name);
            if (m.vipStatus === 'vip') vipCount++;
            if (m.vipStatus === 'blacklist') blacklistCount++;
        });

        // Get active rules
        let activeRules = rules.filter(r => r.active);
        let rulesCount = activeRules.length;

        // Set Root node center positions (SVG size 1150 x 520)
        const rootX = 575;
        const rootY = 240;

        // Hierarchical Nodes list
        const nodes = [
            // Root
            { id: 'root', type: 'root', label: grp.name, sublabel: `${grp.members} thành viên`, x: rootX, y: rootY, width: 230, height: 60 },
            
            // Left Branch 1: Cấu hình & Bảo mật
            { id: 'b_config', type: 'branch', branchType: 'config', label: 'Cấu hình & Bảo mật', x: 330, y: 120, width: 170, height: 40, parentId: 'root' },
            { id: 'l_purpose', type: 'leaf', label: 'Mục đích nhóm', sublabel: purpose, x: 90, y: 50, width: 160, height: 45, parentId: 'b_config' },
            { id: 'l_security', type: 'leaf', label: 'Bảo mật', sublabel: `${lockName} • ${lockDesc} • ${approveMembers}`, x: 90, y: 110, width: 160, height: 45, parentId: 'b_config' },
            { id: 'l_link', type: 'leaf', label: 'Link tham gia', sublabel: grp.joinLink ? 'Đang bật' : 'Chưa lấy', x: 90, y: 170, width: 160, height: 45, parentId: 'b_config' },

            // Left Branch 2: Tự động hóa & Quy tắc
            { id: 'b_rules', type: 'branch', branchType: 'rules', label: 'Tự động hóa & Quy tắc', x: 330, y: 360, width: 170, height: 40, parentId: 'root' },
            { id: 'l_rule_count', type: 'leaf', label: 'Quy tắc từ khóa', sublabel: `${rulesCount} quy tắc đang chạy`, x: 90, y: 300, width: 160, height: 45, parentId: 'b_rules' },
            { id: 'l_safe_mode', type: 'leaf', label: 'Chế độ An toàn', sublabel: 'Giãn cách ngẫu nhiên 5s-15s', x: 90, y: 360, width: 160, height: 45, parentId: 'b_rules' },
            { id: 'l_ai_reply', type: 'leaf', label: 'AI Auto-Reply', sublabel: 'Gemini/OpenAI', x: 90, y: 420, width: 160, height: 45, parentId: 'b_rules' },

            // Right Branch 1: Nhân sự & Quyền hạn
            { id: 'b_members', type: 'branch', branchType: 'members', label: 'Nhân sự & Quyền hạn', x: 820, y: 120, width: 170, height: 40, parentId: 'root' },
            { id: 'l_creator', type: 'leaf', label: 'Trưởng nhóm (Owner)', sublabel: creatorName, x: 1060, y: 50, width: 160, height: 45, parentId: 'b_members' },
            { id: 'l_admins', type: 'leaf', label: 'Phó nhóm (Admin)', sublabel: `${admins.length} Phó nhóm`, x: 1060, y: 110, width: 160, height: 45, parentId: 'b_members' },
            { id: 'l_banned', type: 'leaf', label: 'Chặn / Ban', sublabel: `${getBannedMembers(grp.id).length} thành viên bị chặn`, x: 1060, y: 170, width: 160, height: 45, parentId: 'b_members' },

            // Right Branch 2: Trí nhớ dài hạn AI
            { id: 'b_memories', type: 'branch', branchType: 'memories', label: 'Trí nhớ dài hạn AI', x: 820, y: 360, width: 170, height: 40, parentId: 'root' },
            { id: 'l_vip', type: 'leaf', label: 'Thành viên VIP ⭐', sublabel: `${vipCount} VIP`, x: 1060, y: 300, width: 160, height: 45, parentId: 'b_memories' },
            { id: 'l_blacklist', type: 'leaf', label: 'Danh sách đen 🚫', sublabel: `${blacklistCount} Blacklist`, x: 1060, y: 360, width: 160, height: 45, parentId: 'b_memories' },
            { id: 'l_mem_stats', type: 'leaf', label: 'Sự kiện đã nhớ', sublabel: `${membersList.filter(m => m.vipStatus !== 'normal' || m.notes).length} thành viên có hồ sơ`, x: 1060, y: 420, width: 160, height: 45, parentId: 'b_memories' }
        ];

        // Draw SVG content
        let svgHtml = `<svg id="group-mindmap-svg" viewBox="0 0 1200 520" width="100%" height="100%">
            <defs>
                <linearGradient id="grad-root" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#2563eb" />
                    <stop offset="100%" stop-color="#1d4ed8" />
                </linearGradient>
                <linearGradient id="grad-config" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#3b82f6" />
                    <stop offset="100%" stop-color="#60a5fa" />
                </linearGradient>
                <linearGradient id="grad-members" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#8b5cf6" />
                    <stop offset="100%" stop-color="#a78bfa" />
                </linearGradient>
                <linearGradient id="grad-rules" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#f59e0b" />
                    <stop offset="100%" stop-color="#fbbf24" />
                </linearGradient>
                <linearGradient id="grad-memories" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#10b981" />
                    <stop offset="100%" stop-color="#34d399" />
                </linearGradient>
            </defs>
            
            <!-- Links (Connecting curves) -->
            <g id="mindmap-links-group">`;

        // Render Links
        nodes.forEach(n => {
            if (n.parentId) {
                const parent = nodes.find(p => p.id === n.parentId);
                if (parent) {
                    let startX, startY, endX, endY;
                    let color = '#475569';
                    
                    if (parent.type === 'root') {
                        startX = parent.x;
                        startY = parent.y;
                        endX = n.x;
                        endY = n.y;
                        
                        if (n.branchType === 'config') color = '#3b82f6';
                        if (n.branchType === 'rules') color = '#f59e0b';
                        if (n.branchType === 'members') color = '#8b5cf6';
                        if (n.branchType === 'memories') color = '#10b981';
                    } else {
                        startX = parent.x;
                        startY = parent.y;
                        endX = n.x;
                        endY = n.y;
                        
                        if (parent.branchType === 'config') color = 'rgba(59, 130, 246, 0.4)';
                        if (parent.branchType === 'rules') color = 'rgba(245, 158, 11, 0.4)';
                        if (parent.branchType === 'members') color = 'rgba(139, 92, 246, 0.4)';
                        if (parent.branchType === 'memories') color = 'rgba(16, 185, 129, 0.4)';
                    }

                    // Cubic Bezier curve connectors
                    const dx = Math.abs(endX - startX) * 0.45;
                    const cX1 = startX + (endX > startX ? dx : -dx);
                    const cY1 = startY;
                    const cX2 = endX + (startX > endX ? dx : -dx);
                    const cY2 = endY;

                    svgHtml += `<path class="mindmap-link" data-parent="${n.parentId}" data-child="${n.id}" d="M ${startX} ${startY} C ${cX1} ${cY1}, ${cX2} ${cY2}, ${endX} ${endY}" stroke="${color}" style="--line-color: ${color};" />`;
                }
            }
        });

        svgHtml += `</g>
            <!-- Nodes -->
            <g id="mindmap-nodes-group">`;

        // Render Nodes
        nodes.forEach(n => {
            let fillStyle = '';
            let strokeColor = 'rgba(255, 255, 255, 0.08)';
            let nodeClass = `mindmap-node node-${n.type}`;
            
            if (n.type === 'root') {
                fillStyle = 'url(#grad-root)';
                strokeColor = '#2563eb';
            } else if (n.type === 'branch') {
                nodeClass += ` node-branch-${n.branchType}`;
                if (n.branchType === 'config') fillStyle = 'rgba(59, 130, 246, 0.1)';
                if (n.branchType === 'rules') fillStyle = 'rgba(245, 158, 11, 0.1)';
                if (n.branchType === 'members') fillStyle = 'rgba(139, 92, 246, 0.1)';
                if (n.branchType === 'memories') fillStyle = 'rgba(16, 185, 129, 0.1)';
            } else {
                fillStyle = 'rgba(15, 23, 42, 0.85)';
            }

            const rectLeft = n.x - n.width / 2;
            const rectTop = n.y - n.height / 2;

            svgHtml += `<g class="${nodeClass}" data-id="${n.id}">
                <rect class="mindmap-rect" x="${rectLeft}" y="${rectTop}" width="${n.width}" height="${n.height}" fill="${fillStyle}" stroke="${strokeColor}" />`;
            
            if (n.sublabel) {
                const titleY = n.y - 4;
                const subY = n.y + 12;
                
                let displayLabel = n.label;
                if (displayLabel.length > 22) displayLabel = displayLabel.substring(0, 20) + '...';
                
                let displaySublabel = n.sublabel;
                if (displaySublabel.length > 25) displaySublabel = displaySublabel.substring(0, 23) + '...';

                svgHtml += `
                    <text class="mindmap-text-title" x="${n.x}" y="${titleY}" text-anchor="middle">${escapeHtml(displayLabel)}</text>
                    <text class="mindmap-text-detail" x="${n.x}" y="${subY}" text-anchor="middle">${escapeHtml(displaySublabel)}</text>
                `;
            } else {
                svgHtml += `
                    <text class="mindmap-text-title" x="${n.x}" y="${n.y + 5}" text-anchor="middle">${escapeHtml(n.label)}</text>
                `;
            }
            
            svgHtml += `</g>`;
        });

        svgHtml += `</g>
        </svg>`;

        canvasContainer.innerHTML = svgHtml;

        // Add interactivity (highlight connections on hover)
        const nodeElements = canvasContainer.querySelectorAll('.mindmap-node');
        const linkElements = canvasContainer.querySelectorAll('.mindmap-link');

        nodeElements.forEach(nodeEl => {
            const nodeId = nodeEl.getAttribute('data-id');
            
            nodeEl.addEventListener('mouseenter', () => {
                linkElements.forEach(linkEl => {
                    const parent = linkEl.getAttribute('data-parent');
                    const child = linkEl.getAttribute('data-child');
                    if (parent === nodeId || child === nodeId) {
                        linkEl.classList.add('active');
                    }
                });
            });

            nodeEl.addEventListener('mouseleave', () => {
                linkElements.forEach(linkEl => {
                    linkEl.classList.remove('active');
                });
            });
        });

        initMindmapControls();
    }

    function initMindmapControls() {
        const refreshBtn = document.getElementById('regenerate-mindmap-btn');
        const exportBtn = document.getElementById('export-mindmap-btn');

        if (refreshBtn) {
            refreshBtn.replaceWith(refreshBtn.cloneNode(true));
            const newRefreshBtn = document.getElementById('regenerate-mindmap-btn');
            newRefreshBtn.addEventListener('click', () => {
                const grp = selectedGroupForMembers;
                if (grp) {
                    addTerminalLog(`Đang cập nhật lại Sơ đồ Mindmap của nhóm "${grp.name}"...`, 'info');
                    renderGroupMindmap(grp);
                }
            });
        }

        if (exportBtn) {
            exportBtn.replaceWith(exportBtn.cloneNode(true));
            const newExportBtn = document.getElementById('export-mindmap-btn');
            newExportBtn.addEventListener('click', () => {
                const svgEl = document.getElementById('group-mindmap-svg');
                if (!svgEl) {
                    alert('Không tìm thấy sơ đồ để xuất.');
                    return;
                }

                try {
                    addTerminalLog('Đang xuất hình ảnh sơ đồ Mindmap (PNG)...', 'info');
                    const svgString = new XMLSerializer().serializeToString(svgEl);
                    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                    const URL = window.URL || window.webkitURL || window;
                    const blobURL = URL.createObjectURL(svgBlob);
                    
                    const image = new Image();
                    image.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = 1200;
                        canvas.height = 520;
                        const context = canvas.getContext('2d');
                        
                        context.fillStyle = '#0f172a';
                        context.fillRect(0, 0, 1200, 520);
                        
                        context.drawImage(image, 0, 0);
                        const png = canvas.toDataURL('image/png');
                        
                        const downloadLink = document.createElement('a');
                        const grpName = selectedGroupForMembers ? selectedGroupForMembers.name : 'Group';
                        downloadLink.href = png;
                        downloadLink.download = `Mindmap_${grpName.replace(/\s+/g, '_')}.png`;
                        document.body.appendChild(downloadLink);
                        downloadLink.click();
                        document.body.removeChild(downloadLink);
                        
                        addTerminalLog('Xuất hình ảnh sơ đồ Mindmap thành công!', 'success');
                    };
                    image.src = blobURL;
                } catch (e) {
                    console.error('Lỗi khi xuất ảnh mindmap:', e);
                    alert('Lỗi xuất hình ảnh. Vui lòng thử lại.');
                }
            });
        }
    }

    // -------------------------------------------------------------
    // AI GROUP DATA EXTRACTION (BẢNG DỮ LIỆU NHÓM) LOGIC
    // -------------------------------------------------------------
    async function renderGroupData(grp) {
        const tableBody = document.getElementById('group-data-table-body');
        if (!tableBody) return;

        // Show loading state
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted p-20"><i data-lucide="refresh-cw" class="spin-anim"></i> Đang tải dữ liệu nhóm...</td></tr>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Fetch extracted data
        try {
            if (currentAppMode === 'simulation') {
                // Return mock data for simulation mode
                if (!window.mockGroupDataStore) {
                    window.mockGroupDataStore = {};
                }
                if (!window.mockGroupDataStore[grp.id]) {
                    window.mockGroupDataStore[grp.id] = [
                        {
                            id: 'sim-d1',
                            groupId: grp.id,
                            zaloId: 'zalo-u1',
                            senderName: 'Phan Đăng Khoa',
                            dataType: 'order',
                            keyInfo: 'Đặt 5 pizza hải sản, 3 coca cola size L',
                            rawMessage: 'Cho mình đặt 5 pizza hải sản và 3 coca cola size L nhé shop, giao trước 12h trưa nay.',
                            status: 'pending',
                            createdAt: new Date(Date.now() - 3600000).toISOString()
                        },
                        {
                            id: 'sim-d2',
                            groupId: grp.id,
                            zaloId: 'zalo-u2',
                            senderName: 'Nguyễn Văn A',
                            dataType: 'report',
                            keyInfo: 'Báo cáo: Hoàn thành thiết kế giao diện mobile app',
                            rawMessage: 'Em xin báo cáo tiến độ hôm nay: Đã thiết kế xong toàn bộ giao diện mobile app và gửi dev team review ạ.',
                            status: 'completed',
                            createdAt: new Date(Date.now() - 7200000).toISOString()
                        },
                        {
                            id: 'sim-d3',
                            groupId: grp.id,
                            zaloId: 'zalo-u3',
                            senderName: 'Trần Thị B',
                            dataType: 'order',
                            keyInfo: 'Đặt 2 ly trà sữa truyền thống ít đường',
                            rawMessage: 'Order giúp em 2 ly trà sữa truyền thống ít đường nhé.',
                            status: 'cancelled',
                            createdAt: new Date(Date.now() - 86400000).toISOString()
                        }
                    ];
                }
                currentGroupDataList = window.mockGroupDataStore[grp.id];
            } else {
                const res = await fetch(`${BACKEND_URL}/api/groups/${grp.id}/data`);
                const json = await res.json();
                if (json.success) {
                    currentGroupDataList = json.data;
                } else {
                    currentGroupDataList = [];
                }
            }
            
            // Build the table rows with the filtered list
            renderGroupDataRows(grp);
            
            // Setup controls and listeners once data is loaded
            setupGroupDataEventListeners(grp);
        } catch (err) {
            console.error('Lỗi khi render dữ liệu nhóm:', err);
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger p-20">Không thể tải dữ liệu: ${err.message}</td></tr>`;
        }
    }

    function renderGroupDataRows(grp) {
        const tableBody = document.getElementById('group-data-table-body');
        if (!tableBody) return;

        // Apply filters
        let filtered = currentGroupDataList;

        // Apply type filter
        if (currentGroupDataFilter !== 'all') {
            filtered = filtered.filter(item => item.dataType === currentGroupDataFilter);
        }

        // Apply status filter
        if (currentGroupDataStatusFilter !== 'all') {
            filtered = filtered.filter(item => item.status === currentGroupDataStatusFilter);
        }

        // Apply search query filter
        if (currentGroupDataSearch) {
            const query = currentGroupDataSearch.toLowerCase();
            filtered = filtered.filter(item => {
                const name = (item.senderName || '').toLowerCase();
                const info = (item.keyInfo || '').toLowerCase();
                const raw = (item.rawMessage || '').toLowerCase();
                return name.includes(query) || info.includes(query) || raw.includes(query);
            });
        }

        if (filtered.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted p-20">Không có dữ liệu trích xuất nào phù hợp.</td></tr>`;
            return;
        }

        // We need the group members list to lookup avatar if possible
        const members = defaultMembers[grp.id] || [];
        const membersMap = {};
        members.forEach(member => {
            membersMap[member.zaloId] = member;
        });

        tableBody.innerHTML = filtered.map(item => {
            const memberZaloId = item.zaloId || '';
            const memberInfo = membersMap[memberZaloId] || {
                avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80',
                name: item.senderName || 'Thành viên Zalo'
            };

            const typeBadgeClass = item.dataType === 'order' ? 'data-type-order' : 
                                  (item.dataType === 'report' ? 'data-type-report' : 
                                  (item.dataType === 'event' ? 'data-type-event' : 
                                  (item.dataType === 'survey' ? 'data-type-survey' : 'data-type-other')));
            const typeLabel = item.dataType === 'order' ? '🛒 Đơn hàng' : 
                              (item.dataType === 'report' ? '📋 Báo cáo' : 
                              (item.dataType === 'event' ? '📅 Lịch hẹn/Sự kiện' : 
                              (item.dataType === 'survey' ? '📊 Khảo sát/Bình chọn' : '⚙️ Khác')));

            const dateStr = new Date(item.createdAt).toLocaleString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });

            let statusBadgeHtml = '';
            if (item.status === 'pending') {
                statusBadgeHtml = `<span class="badge" style="background:rgba(245, 158, 11, 0.15); color:#fbbf24; border:1px solid rgba(245, 158, 11, 0.25); padding: 4px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">⏳ Chờ xử lý</span>`;
            } else if (item.status === 'completed') {
                statusBadgeHtml = `<span class="badge" style="background:rgba(16, 185, 129, 0.15); color:#34d399; border:1px solid rgba(16, 185, 129, 0.25); padding: 4px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">✅ Đã xong</span>`;
            } else {
                statusBadgeHtml = `<span class="badge" style="background:rgba(239, 68, 68, 0.15); color:#f87171; border:1px solid rgba(239, 68, 68, 0.25); padding: 4px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">❌ Đã hủy</span>`;
            }

            let actionsHtml = '';
            if (item.status === 'pending') {
                actionsHtml = `
                    <button class="btn btn-icon btn-outline-success btn-approve-data" data-id="${item.id}" title="Duyệt hoàn thành yêu cầu" style="margin-right: 4px;">
                        <i data-lucide="check"></i>
                    </button>
                    <button class="btn btn-icon btn-outline-warning btn-decline-data" data-id="${item.id}" title="Từ chối/Hủy yêu cầu" style="margin-right: 4px;">
                        <i data-lucide="x"></i>
                    </button>
                `;
            }
            actionsHtml += `
                <button class="btn btn-icon btn-outline-danger btn-delete-data" data-id="${item.id}" title="Xóa dòng dữ liệu này">
                    <i data-lucide="trash-2"></i>
                </button>
            `;

            return `
                <tr>
                    <td>
                        <div class="user-info-cell">
                            <img src="${memberInfo.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80'}" alt="${memberInfo.name}" class="avatar-sm" onerror="handleAvatarError(this)">
                            <div>
                                <span class="user-name">${memberInfo.name}</span>
                                <span class="user-id">ID: ${memberZaloId || 'Không rõ'}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="data-type-badge ${typeBadgeClass}">${typeLabel}</span>
                    </td>
                    <td>
                        <strong style="color:var(--text-color);">${escapeHtml(item.keyInfo)}</strong>
                    </td>
                    <td>
                        <div class="raw-msg-text" title="Click để xem đầy đủ nội dung gốc" onclick="alert('${escapeHtml(item.rawMessage || '').replace(/'/g, "\\'")}')">
                            ${escapeHtml(item.rawMessage || '')}
                        </div>
                    </td>
                    <td style="white-space: nowrap; font-size: 0.8rem; color: var(--text-secondary);">
                        ${dateStr}
                    </td>
                    <td>
                        ${statusBadgeHtml}
                    </td>
                    <td>
                        <div style="display: flex; align-items: center;">
                            ${actionsHtml}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    async function updateGroupDataStatus(grpId, id, status) {
        try {
            if (currentAppMode === 'simulation') {
                const item = currentGroupDataList.find(i => i.id === id);
                if (item) {
                    item.status = status;
                    addTerminalLog(`[Cộng tác] [Giả lập] Đã cập nhật trạng thái dữ liệu thành: ${status}`, 'success');
                    if (window.mockGroupDataStore && window.mockGroupDataStore[grpId]) {
                        window.mockGroupDataStore[grpId] = currentGroupDataList;
                    }
                    renderGroupDataRows({ id: grpId });
                }
            } else {
                const res = await fetch(`${BACKEND_URL}/api/groups/${grpId}/data/${id}/status`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status })
                });
                const json = await res.json();
                if (json.success) {
                    addTerminalLog(`[Cộng tác] Đã cập nhật trạng thái dữ liệu nhóm thành công.`, 'success');
                    const item = currentGroupDataList.find(i => i.id === id);
                    if (item) item.status = status;
                    renderGroupDataRows({ id: grpId });
                } else {
                    alert('Không thể cập nhật trạng thái: ' + json.error);
                }
            }
        } catch (err) {
            console.error('Lỗi khi cập nhật trạng thái dữ liệu:', err);
            alert('Lỗi kết nối máy chủ khi cập nhật trạng thái.');
        }
    }

    function setupGroupDataEventListeners(grp) {
        // Search Input
        const searchInput = document.getElementById('group-data-search-input');
        if (searchInput) {
            const newSearchInput = searchInput.cloneNode(true);
            searchInput.parentNode.replaceChild(newSearchInput, searchInput);
            
            newSearchInput.value = currentGroupDataSearch;
            newSearchInput.addEventListener('input', (e) => {
                currentGroupDataSearch = e.target.value;
                renderGroupDataRows(grp);
            });
        }

        // Filter type buttons
        const filterContainer = document.getElementById('group-data-filters');
        if (filterContainer) {
            filterContainer.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    filterContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentGroupDataFilter = btn.getAttribute('data-filter-type');
                    renderGroupDataRows(grp);
                });
            });
        }

        // Filter status buttons
        const statusFilterContainer = document.getElementById('group-data-status-filters');
        if (statusFilterContainer) {
            statusFilterContainer.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    statusFilterContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentGroupDataStatusFilter = btn.getAttribute('data-filter-status');
                    renderGroupDataRows(grp);
                });
            });
        }

        // Refresh Button
        const refreshBtn = document.getElementById('refresh-group-data-btn');
        if (refreshBtn) {
            const newRefreshBtn = refreshBtn.cloneNode(true);
            refreshBtn.parentNode.replaceChild(newRefreshBtn, refreshBtn);
            newRefreshBtn.addEventListener('click', () => {
                renderGroupData(grp);
            });
        }

        // Action Buttons inside table
        const tableBody = document.getElementById('group-data-table-body');
        if (tableBody) {
            // Approve buttons
            tableBody.querySelectorAll('.btn-approve-data').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = btn.getAttribute('data-id');
                    await updateGroupDataStatus(grp.id, id, 'completed');
                });
            });

            // Decline/Cancel buttons
            tableBody.querySelectorAll('.btn-decline-data').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = btn.getAttribute('data-id');
                    await updateGroupDataStatus(grp.id, id, 'cancelled');
                });
            });

            // Delete buttons
            tableBody.querySelectorAll('.btn-delete-data').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = btn.getAttribute('data-id');
                    if (!confirm('Bạn có chắc chắn muốn xóa dòng dữ liệu trích xuất này không?')) return;

                    try {
                        if (currentAppMode === 'simulation') {
                            currentGroupDataList = currentGroupDataList.filter(i => i.id !== id);
                            if (window.mockGroupDataStore) {
                                window.mockGroupDataStore[grp.id] = currentGroupDataList;
                            }
                            addTerminalLog(`[Cộng tác] [Giả lập] Đã xóa dòng dữ liệu trích xuất.`, 'success');
                            renderGroupDataRows(grp);
                        } else {
                            const res = await fetch(`${BACKEND_URL}/api/groups/${grp.id}/data/${id}`, {
                                method: 'DELETE'
                            });
                            const json = await res.json();
                            if (json.success) {
                                addTerminalLog(`[Cộng tác] Đã xóa dòng dữ liệu trích xuất thành công.`, 'success');
                                currentGroupDataList = currentGroupDataList.filter(i => i.id !== id);
                                renderGroupDataRows(grp);
                            } else {
                                alert('Không thể xóa dữ liệu: ' + json.error);
                            }
                        }
                    } catch (err) {
                        console.error('Lỗi khi xóa dữ liệu:', err);
                        alert('Lỗi kết nối máy chủ khi xóa dữ liệu.');
                    }
                });
            });
        }
    }

    // =============================================================
    // PHẦN THEO DÕI SỨC KHỎE API & LOGLOGIC (NHẬT KÝ HỆ THỐNG)
    // =============================================================

    function updateHealthBadge(badgeId, latencyId, status, latency, errorMsg = null) {
        const badge = document.getElementById(badgeId);
        const latencyEl = document.getElementById(latencyId);
        if (!badge) return;

        if (latencyEl) {
            if (latency >= 0) {
                latencyEl.textContent = `${latency}ms`;
                latencyEl.style.color = latency > 500 ? 'var(--color-warning)' : 'var(--text-muted)';
            } else {
                latencyEl.textContent = '--ms';
                latencyEl.style.color = 'var(--text-muted)';
            }
        }

        badge.style.background = 'rgba(255,255,255,0.05)';
        badge.style.color = 'var(--text-muted)';
        
        let statusText = status;
        if (status === 'online') {
            badge.style.background = 'rgba(16, 185, 129, 0.15)';
            badge.style.color = '#10b981';
            statusText = 'Online';
        } else if (status === 'offline') {
            badge.style.background = 'rgba(239, 68, 68, 0.15)';
            badge.style.color = '#ef4444';
            statusText = 'Offline';
        } else if (status === 'pending') {
            badge.style.background = 'rgba(245, 158, 11, 0.15)';
            badge.style.color = '#f59e0b';
            statusText = 'Đang ping...';
        } else if (status === 'disabled') {
            badge.style.background = 'rgba(255, 255, 255, 0.05)';
            badge.style.color = '#9ca3af';
            statusText = 'Tắt';
        } else if (status === 'configured') {
            badge.style.background = 'rgba(59, 130, 246, 0.15)';
            badge.style.color = '#3b82f6';
            statusText = 'Cấu hình OK';
        } else if (status === 'not_configured') {
            badge.style.background = 'rgba(255, 255, 255, 0.05)';
            badge.style.color = '#9ca3af';
            statusText = 'Chưa cấu hình';
        }

        if (errorMsg) {
            badge.title = errorMsg;
            badge.style.cursor = 'help';
        } else {
            badge.removeAttribute('title');
            badge.style.cursor = 'default';
        }

        badge.textContent = statusText;
    }

    async function fetchAndRenderHealthStatus() {
        if (currentAppMode !== 'live') {
            updateHealthBadge('health-db-badge', 'health-db-latency', 'online', 3);
            updateHealthBadge('health-gemini-badge', 'health-gemini-latency', 'online', 120);
            updateHealthBadge('health-openai-badge', 'health-openai-latency', 'disabled', -1);
            updateHealthBadge('health-stringee-badge', 'health-stringee-latency', 'disabled', -1);
            return;
        }

        try {
            const res = await fetch(`${BACKEND_URL}/api/health`);
            const json = await res.json();
            if (json.success && json.status) {
                const status = json.status;
                updateHealthBadge('health-db-badge', 'health-db-latency', status.db.status, status.db.latency);
                
                const activeProvider = status.ai.provider;
                const aiEnabled = status.ai.enabled;

                if (!aiEnabled) {
                    updateHealthBadge('health-gemini-badge', 'health-gemini-latency', 'disabled', -1);
                    updateHealthBadge('health-openai-badge', 'health-openai-latency', 'disabled', -1);
                } else {
                    if (activeProvider === 'gemini') {
                        updateHealthBadge('health-gemini-badge', 'health-gemini-latency', 'online', -1);
                        updateHealthBadge('health-openai-badge', 'health-openai-latency', 'disabled', -1);
                    } else if (activeProvider === 'openai') {
                        updateHealthBadge('health-gemini-badge', 'health-gemini-latency', 'disabled', -1);
                        updateHealthBadge('health-openai-badge', 'health-openai-latency', 'online', -1);
                    }
                }

                if (status.voip.configured) {
                    updateHealthBadge('health-stringee-badge', 'health-stringee-latency', 'configured', -1);
                } else {
                    updateHealthBadge('health-stringee-badge', 'health-stringee-latency', 'not_configured', -1);
                }
            }
        } catch (err) {
            console.error('Lỗi khi fetch health status:', err);
        }
    }

    async function runHealthDiagnosis() {
        const btn = document.getElementById('btn-diagnose');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="refresh-cw" class="spinner" style="width:12px; height:12px; animation: spin 1s linear infinite;"></i> Đang chạy...';
            if (window.lucide) window.lucide.createIcons();
        }

        updateHealthBadge('health-db-badge', 'health-db-latency', 'pending', -1);
        updateHealthBadge('health-gemini-badge', 'health-gemini-latency', 'pending', -1);
        updateHealthBadge('health-openai-badge', 'health-openai-latency', 'pending', -1);
        updateHealthBadge('health-stringee-badge', 'health-stringee-latency', 'pending', -1);

        if (currentAppMode !== 'live') {
            setTimeout(() => {
                updateHealthBadge('health-db-badge', 'health-db-latency', 'online', 2);
                updateHealthBadge('health-gemini-badge', 'health-gemini-latency', 'online', 152);
                updateHealthBadge('health-openai-badge', 'health-openai-latency', 'disabled', -1);
                updateHealthBadge('health-stringee-badge', 'health-stringee-latency', 'disabled', -1);
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i data-lucide="play-circle" style="width:12px; height:12px;"></i> Chẩn đoán';
                    if (window.lucide) window.lucide.createIcons();
                }
                addTerminalLog('[Chẩn đoán] Tiến trình hoàn tất (Chế độ mô phỏng).', 'success');
            }, 1000);
            return;
        }

        try {
            const res = await fetch(`${BACKEND_URL}/api/health/diagnose`, { method: 'POST' });
            const json = await res.json();
            if (json.success && json.diagnostics) {
                const diag = json.diagnostics;
                updateHealthBadge('health-db-badge', 'health-db-latency', diag.db.status, diag.db.latency, diag.db.error);
                updateHealthBadge('health-gemini-badge', 'health-gemini-latency', diag.gemini.status, diag.gemini.latency, diag.gemini.error);
                updateHealthBadge('health-openai-badge', 'health-openai-latency', diag.openai.status, diag.openai.latency, diag.openai.error);
                updateHealthBadge('health-stringee-badge', 'health-stringee-latency', diag.stringee.status, diag.stringee.latency, diag.stringee.error);
                addTerminalLog('Đã hoàn tất quy trình chẩn đoán sức khỏe hệ thống.', 'success');
            } else {
                addTerminalLog('Quy trình chẩn đoán hệ thống trả về lỗi.', 'error');
            }
        } catch (err) {
            console.error('Lỗi khi chạy chẩn đoán:', err);
            addTerminalLog(`Lỗi khi kết nối chạy chẩn đoán: ${err.message}`, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="play-circle" style="width:12px; height:12px;"></i> Chẩn đoán';
                if (window.lucide) window.lucide.createIcons();
            }
        }
    }

    function appendSystemTerminalLog(log, isHistory = false) {
        const terminal = document.getElementById('system-terminal-log');
        if (!terminal) return;

        const filterLevel = document.getElementById('log-filter-level').value;
        const filterCategory = document.getElementById('log-filter-category').value;
        
        if (filterLevel && log.level !== filterLevel) return;
        if (filterCategory && log.category !== filterCategory) return;

        const line = document.createElement('div');
        line.className = 'log-line-system';
        line.style.display = 'flex';
        line.style.flexWrap = 'wrap';
        line.style.gap = '6px';
        line.style.marginBottom = '2px';
        line.style.borderBottom = '1px solid rgba(255, 255, 255, 0.02)';
        line.style.paddingBottom = '2px';

        const timeSpan = document.createElement('span');
        timeSpan.style.color = '#6b7280';
        let timeStr = '';
        try {
            timeStr = new Date(log.timestamp || log.createdAt).toLocaleTimeString('vi-VN');
        } catch(e) {
            timeStr = log.timestamp || '';
        }
        timeSpan.textContent = `[${timeStr}]`;
        line.appendChild(timeSpan);

        const levelSpan = document.createElement('span');
        let levelColor = '#d1d4db';
        if (log.level === 'info') levelColor = '#10b981';
        else if (log.level === 'warn') levelColor = '#f59e0b';
        else if (log.level === 'error') levelColor = '#ef4444';
        else if (log.level === 'debug') levelColor = '#8b5cf6';
        levelSpan.style.color = levelColor;
        levelSpan.style.fontWeight = 'bold';
        levelSpan.textContent = `[${log.level.toUpperCase()}]`;
        line.appendChild(levelSpan);

        const categorySpan = document.createElement('span');
        let catColor = '#6b7280';
        if (log.category === 'system') catColor = '#3b82f6';
        else if (log.category === 'zalo') catColor = '#06b6d4';
        else if (log.category === 'api') catColor = '#ec4899';
        else if (log.category === 'db') catColor = '#14b8a6';
        else if (log.category === 'queue') catColor = '#a855f7';
        else if (log.category === 'voice') catColor = '#e11d48';
        else if (log.category === 'message') catColor = '#10b981';
        else if (log.category === 'reaction') catColor = '#ec4899';
        else if (log.category === 'undo') catColor = '#f59e0b';
        else if (log.category === 'group_event') catColor = '#6366f1';
        categorySpan.style.color = catColor;
        categorySpan.textContent = `[${log.category.toUpperCase()}]`;
        line.appendChild(categorySpan);

        const msgSpan = document.createElement('span');
        msgSpan.style.color = '#e5e7eb';
        msgSpan.textContent = log.message || log.text || '';
        line.appendChild(msgSpan);

        if (log.metadata) {
            const metaSpan = document.createElement('span');
            metaSpan.style.color = '#9ca3af';
            metaSpan.style.fontSize = '0.7rem';
            metaSpan.style.fontStyle = 'italic';
            let metaText = '';
            if (typeof log.metadata === 'object') {
                metaText = JSON.stringify(log.metadata);
            } else {
                metaText = log.metadata;
            }
            metaSpan.textContent = metaText;
            line.appendChild(metaSpan);
        }

        if (!isHistory) {
            const shouldScroll = terminal.scrollHeight - terminal.clientHeight <= terminal.scrollTop + 50;
            terminal.appendChild(line);
            
            while (terminal.childElementCount > 500) {
                terminal.removeChild(terminal.firstElementChild);
            }
            
            if (shouldScroll) {
                terminal.scrollTop = terminal.scrollHeight;
            }
        } else {
            terminal.appendChild(line);
        }
    }

    async function loadHistoryLogs() {
        const terminal = document.getElementById('system-terminal-log');
        if (!terminal) return;
        
        terminal.innerHTML = '<div style="color: var(--color-primary);">[SYSTEM] Đang tải lịch sử logs từ CSDL SQLite...</div>';
        
        const filterLevel = document.getElementById('log-filter-level').value;
        const filterCategory = document.getElementById('log-filter-category').value;
        
        let queryParams = new URLSearchParams({ limit: 100 });
        if (filterLevel) queryParams.append('level', filterLevel);
        if (filterCategory) queryParams.append('category', filterCategory);
        
        try {
            const res = await fetch(`${BACKEND_URL}/api/logs?${queryParams.toString()}`);
            const json = await res.json();
            if (json.success && json.data) {
                terminal.innerHTML = '';
                if (json.data.length === 0) {
                    terminal.innerHTML = '<div style="color: #6b7280;">[SYSTEM] Không tìm thấy logs nào trong CSDL SQLite khớp với bộ lọc.</div>';
                    return;
                }
                const logsDesc = json.data;
                const logsAsc = [...logsDesc].reverse();
                logsAsc.forEach(log => {
                    appendSystemTerminalLog(log, true);
                });
                terminal.scrollTop = terminal.scrollHeight;
            } else {
                terminal.innerHTML = `<div style="color: var(--color-danger);">[SYSTEM] Lỗi khi tải logs: ${json.error || 'Unknown error'}</div>`;
            }
        } catch (err) {
            console.error('Không thể tải lịch sử logs:', err);
            terminal.innerHTML = `<div style="color: var(--color-danger);">[SYSTEM] Lỗi kết nối đến server: ${err.message}</div>`;
        }
    }

    async function exportSystemLogs() {
        const filterLevel = document.getElementById('log-filter-level').value;
        const filterCategory = document.getElementById('log-filter-category').value;
        
        let queryParams = new URLSearchParams({ limit: 200 });
        if (filterLevel) queryParams.append('level', filterLevel);
        if (filterCategory) queryParams.append('category', filterCategory);
        
        try {
            const res = await fetch(`${BACKEND_URL}/api/logs?${queryParams.toString()}`);
            const json = await res.json();
            if (json.success && json.data) {
                let csvContent = '\uFEFFID,Thời gian,Cấp độ,Danh mục,Nội dung,Metadata\n';
                json.data.forEach(log => {
                    const id = log.id;
                    const time = log.createdAt || log.timestamp;
                    const level = log.level.toUpperCase();
                    const category = log.category.toUpperCase();
                    const msg = (log.message || '').replace(/"/g, '""');
                    const meta = (log.metadata ? JSON.stringify(log.metadata) : '').replace(/"/g, '""');
                    csvContent += `"${id}","${time}","${level}","${category}","${msg}","${meta}"\n`;
                });
                
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.setAttribute('href', url);
                link.setAttribute('download', `zalo_bot_logs_${filterLevel || 'all'}_${filterCategory || 'all'}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                addTerminalLog('Đã xuất lịch sử logs ra tệp CSV.', 'success');
            } else {
                alert('Không thể lấy logs để xuất: ' + (json.error || 'Lỗi không xác định'));
            }
        } catch (err) {
            console.error('Lỗi khi xuất logs:', err);
            alert('Lỗi kết nối đến server: ' + err.message);
        }
    }

    function renderSystemLogs() {
        loadHistoryLogs();
    }

    // Thiết lập các Event Listeners cho hệ thống Logs và Health
    function initHealthAndLogsControllers() {
        const toggleSaveLogs = document.getElementById('toggle-save-logs');
        if (toggleSaveLogs) {
            // Lấy trạng thái từ máy chủ khi load
            fetch(`${BACKEND_URL}/api/logs/toggle`)
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        toggleSaveLogs.checked = data.enabled;
                    }
                })
                .catch(e => console.error('Lỗi khi tải trạng thái ghi log:', e));

            // Lắng nghe thay đổi trạng thái
            toggleSaveLogs.addEventListener('change', async () => {
                try {
                    const res = await fetch(`${BACKEND_URL}/api/logs/toggle`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ enabled: toggleSaveLogs.checked })
                    });
                    const data = await res.json();
                    if (data.success) {
                        if (typeof addTerminalLog === 'function') {
                            addTerminalLog(`[Hệ thống] Đã ${data.enabled ? 'BẬT' : 'TẮT'} ghi log SQLite.`, data.enabled ? 'success' : 'warn');
                        }
                    }
                } catch (e) {
                    console.error('Lỗi khi cập nhật trạng thái ghi log:', e);
                }
            });
        }

        const btnDiagnose = document.getElementById('btn-diagnose');
        if (btnDiagnose) {
            btnDiagnose.addEventListener('click', runHealthDiagnosis);
        }

        const btnClearTerminal = document.getElementById('btn-clear-terminal');
        if (btnClearTerminal) {
            btnClearTerminal.addEventListener('click', () => {
                const terminal = document.getElementById('system-terminal-log');
                if (terminal) {
                    terminal.innerHTML = '<div style="color: #6b7280;">[SYSTEM] Terminal cleared.</div>';
                }
            });
        }

        const btnLoadHistory = document.getElementById('btn-load-history-logs');
        if (btnLoadHistory) {
            btnLoadHistory.addEventListener('click', loadHistoryLogs);
        }

        const btnExport = document.getElementById('btn-export-logs');
        if (btnExport) {
            btnExport.addEventListener('click', exportSystemLogs);
        }

        const filterLevel = document.getElementById('log-filter-level');
        if (filterLevel) {
            filterLevel.addEventListener('change', loadHistoryLogs);
        }

        const filterCategory = document.getElementById('log-filter-category');
        if (filterCategory) {
            filterCategory.addEventListener('change', loadHistoryLogs);
        }

        // Định kỳ chạy cập nhật trạng thái sức khỏe mỗi 30 giây (lưu lại để clear khi cần)
        if (window._healthCheckInterval) clearInterval(window._healthCheckInterval);
        window._healthCheckInterval = setInterval(fetchAndRenderHealthStatus, 30000);
        fetchAndRenderHealthStatus(); // Chạy ngay lần đầu
    }

    initHealthAndLogsControllers();

    async function initAiToolsControllers() {
        const btnSaveTools = document.getElementById('btn-save-ai-tools');
        const listBody = document.getElementById('ai-tools-list-body');
        const searchInput = document.getElementById('search-ai-tools');
        const filterSelect = document.getElementById('filter-tool-category');
        const btnToggleOn = document.getElementById('btn-toggle-all-tools-on');
        const btnToggleOff = document.getElementById('btn-toggle-all-tools-off');
        const countBadge = document.getElementById('ai-tools-count-badge');

        if (!btnSaveTools || !listBody) return;

        const ALL_ZALO_TOOLS = [
            { id: 'acceptFriendRequest', name: 'Chấp nhận kết bạn', method: 'acceptFriendRequest', category: 'friends', desc: 'Chấp nhận lời mời kết bạn từ người khác.', icon: '👤' },
            { id: 'addGroupBlockedMember', name: 'Chặn thành viên nhóm', method: 'addGroupBlockedMember', category: 'groups', desc: 'Thêm người dùng vào danh sách chặn của nhóm.', icon: '🚷' },
            { id: 'addGroupDeputy', name: 'Bổ nhiệm phó nhóm', method: 'addGroupDeputy', category: 'groups', desc: 'Thăng cấp một thành viên trong nhóm làm phó nhóm.', icon: '👮' },
            { id: 'addQuickMessage', name: 'Thêm tin nhắn nhanh', method: 'addQuickMessage', category: 'messaging', desc: 'Tạo cấu hình một tin nhắn trả lời nhanh mới.', icon: '⚡' },
            { id: 'addReaction', name: 'Thả cảm xúc', method: 'addReaction', category: 'messaging', desc: 'Thả cảm xúc (tim, like, haha, phẫn nộ...) vào tin nhắn.', icon: '❤️' },
            { id: 'addUnreadMark', name: 'Đánh dấu chưa đọc', method: 'addUnreadMark', category: 'utilities', desc: 'Đánh dấu cuộc hội thoại là chưa đọc.', icon: '🔴' },
            { id: 'addUserToGroup', name: 'Thêm thành viên nhóm', method: 'addUserToGroup', category: 'groups', desc: 'Mời/thêm trực tiếp người dùng vào nhóm chat.', icon: '➕' },
            { id: 'blockUser', name: 'Chặn người dùng', method: 'blockUser', category: 'friends', desc: 'Chặn người dùng gửi tin nhắn hoặc gọi điện.', icon: '🚫' },
            { id: 'blockViewFeed', name: 'Chặn xem bài đăng', method: 'blockViewFeed', category: 'others', desc: 'Chặn người dùng xem các bài viết nhật ký.', icon: '👁️' },
            { id: 'changeAccountAvatar', name: 'Đổi ảnh đại diện', method: 'changeAccountAvatar', category: 'business', desc: 'Thay đổi avatar của tài khoản hiện tại.', icon: '🖼️' },
            { id: 'changeFriendAlias', name: 'Đổi biệt danh bạn bè', method: 'changeFriendAlias', category: 'friends', desc: 'Cập nhật tên gợi nhớ cho bạn bè.', icon: '✏️' },
            { id: 'changeGroupAvatar', name: 'Đổi ảnh nhóm', method: 'changeGroupAvatar', category: 'groups', desc: 'Cập nhật ảnh đại diện của nhóm chat.', icon: '🖼️' },
            { id: 'changeGroupName', name: 'Đổi tên nhóm', method: 'changeGroupName', category: 'groups', desc: 'Cập nhật tên tiêu đề nhóm chat.', icon: '✏️' },
            { id: 'changeGroupOwner', name: 'Chuyển nhượng trưởng nhóm', method: 'changeGroupOwner', category: 'groups', desc: 'Chuyển nhượng quyền chủ nhóm/trưởng nhóm cho người khác.', icon: '👑' },
            { id: 'createAutoReply', name: 'Tạo tự động trả lời', method: 'createAutoReply', category: 'business', desc: 'Thêm cấu hình tự động trả lời (dành cho zBusiness).', icon: '🤖' },
            { id: 'createCatalog', name: 'Tạo danh mục sản phẩm', method: 'createCatalog', category: 'business', desc: 'Tạo danh mục phân loại sản phẩm (dành cho zBusiness).', icon: '📁' },
            { id: 'createGroup', name: 'Tạo nhóm mới', method: 'createGroup', category: 'groups', desc: 'Khởi tạo một nhóm chat Zalo mới.', icon: '🆕' },
            { id: 'createNote', name: 'Tạo ghi chú/Ghim tin', method: 'createNote', category: 'utilities', desc: 'Tạo bảng tin ghi chú và ghim thông báo trong nhóm.', icon: '📌' },
            { id: 'createPoll', name: 'Tạo cuộc bình chọn', method: 'createPoll', category: 'utilities', desc: 'Tạo biểu quyết, bầu chọn lấy ý kiến thành viên.', icon: '📊' },
            { id: 'createProductCatalog', name: 'Tạo sản phẩm danh mục', method: 'createProductCatalog', category: 'business', desc: 'Thêm một sản phẩm mới vào danh mục sản phẩm.', icon: '🛍️' },
            { id: 'createReminder', name: 'Tạo nhắc hẹn', method: 'createReminder', category: 'utilities', desc: 'Đặt lịch nhắc nhở báo thức, lịch họp nhóm.', icon: '⏰' },
            { id: 'custom', name: 'API tùy chỉnh', method: 'custom', category: 'others', desc: 'Gọi API tùy chỉnh theo yêu cầu mở rộng.', icon: '🔧' },
            { id: 'deleteAutoReply', name: 'Xóa tự động trả lời', method: 'deleteAutoReply', category: 'business', desc: 'Xóa cấu hình tự động trả lời của zBusiness.', icon: '🗑️' },
            { id: 'deleteAvatar', name: 'Xóa ảnh đại diện', method: 'deleteAvatar', category: 'business', desc: 'Xóa ảnh avatar khỏi danh sách ảnh đại diện.', icon: '❌' },
            { id: 'deleteCatalog', name: 'Xóa danh mục sản phẩm', method: 'deleteCatalog', category: 'business', desc: 'Xóa danh mục sản phẩm của zBusiness.', icon: '🗑️' },
            { id: 'deleteChat', name: 'Xóa đoạn chat', method: 'deleteChat', category: 'messaging', desc: 'Xóa hoàn toàn đoạn hội thoại chat.', icon: '🗑️' },
            { id: 'deleteMessage', name: 'Xóa tin nhắn', method: 'deleteMessage', category: 'messaging', desc: 'Xóa tin nhắn của bản thân hoặc thành viên nhóm.', icon: '🔥' },
            { id: 'deleteProductCatalog', name: 'Xóa sản phẩm danh mục', method: 'deleteProductCatalog', category: 'business', desc: 'Xóa sản phẩm ra khỏi danh mục bán hàng.', icon: '❌' },
            { id: 'disableGroupLink', name: 'Tắt link nhóm', method: 'disableGroupLink', category: 'groups', desc: 'Khóa không cho tham gia nhóm qua liên kết (Link).', icon: '🔗' },
            { id: 'disperseGroup', name: 'Giải tán nhóm', method: 'disperseGroup', category: 'groups', desc: 'Giải tán và xóa hoàn toàn nhóm chat.', icon: '💥' },
            { id: 'editNote', name: 'Chỉnh sửa ghi chú', method: 'editNote', category: 'utilities', desc: 'Chỉnh sửa bảng tin ghi chú đã ghim trong nhóm.', icon: '📝' },
            { id: 'editReminder', name: 'Chỉnh sửa nhắc hẹn', method: 'editReminder', category: 'utilities', desc: 'Cập nhật lại nội dung hoặc thời gian lịch nhắc hẹn.', icon: '⏳' },
            { id: 'enableGroupLink', name: 'Bật link nhóm', method: 'enableGroupLink', category: 'groups', desc: 'Mở liên kết cho phép tham gia nhóm chat tự do.', icon: '🔗' },
            { id: 'fetchAccountInfo', name: 'Lấy thông tin tài khoản', method: 'fetchAccountInfo', category: 'business', desc: 'Lấy thông tin chi tiết của tài khoản đang đăng nhập.', icon: '👤' },
            { id: 'findUser', name: 'Tìm kiếm người dùng', method: 'findUser', category: 'friends', desc: 'Tìm kiếm thông tin người dùng Zalo qua số điện thoại.', icon: '🔍' },
            { id: 'forwardMessage', name: 'Chuyển tiếp tin nhắn', method: 'forwardMessage', category: 'messaging', desc: 'Chuyển tiếp tin nhắn sang các cuộc trò chuyện khác.', icon: '➡️' },
            { id: 'getAliasList', name: 'Lấy danh sách biệt danh', method: 'getAliasList', category: 'utilities', desc: 'Lấy toàn bộ danh sách thẻ phân loại/biệt danh bạn bè.', icon: '🏷️' },
            { id: 'getAllFriends', name: 'Lấy danh bạn bè', method: 'getAllFriends', category: 'friends', desc: 'Lấy danh sách toàn bộ bạn bè của tài khoản.', icon: '👥' },
            { id: 'getAllGroups', name: 'Lấy danh sách nhóm', method: 'getAllGroups', category: 'groups', desc: 'Lấy danh sách các nhóm chat đã tham gia.', icon: '🏢' },
            { id: 'getArchivedChatList', name: 'Lấy tin nhắn lưu trữ', method: 'getArchivedChatList', category: 'utilities', desc: 'Lấy danh sách các cuộc hội thoại đã lưu trữ.', icon: '📦' },
            { id: 'getAutoDeleteChat', name: 'Lấy trò chuyện tự xóa', method: 'getAutoDeleteChat', category: 'utilities', desc: 'Lấy danh sách cuộc trò chuyện tự động xóa theo thời gian.', icon: '⏱️' },
            { id: 'getBizAccount', name: 'Lấy thông tin tài khoản Biz', method: 'getBizAccount', category: 'business', desc: 'Lấy thông tin chi tiết tài khoản zBusiness.', icon: '💼' },
            { id: 'getContext', name: 'Lấy danh sách nhóm (Context)', method: 'getContext', category: 'groups', desc: 'Lấy danh sách nhóm đã tham gia (chế độ Context).', icon: '🌐' },
            { id: 'getCookie', name: 'Lấy cookie Zalo', method: 'getCookie', category: 'business', desc: 'Lấy chuỗi cookie đang sử dụng để kết nối.', icon: '🍪' },
            { id: 'getFriendRequest', name: 'Lấy yêu cầu kết bạn', method: 'getFriendRequest', category: 'friends', desc: 'Lấy danh sách lời mời kết bạn đã nhận.', icon: '📩' },
            { id: 'getGroupInfo', name: 'Lấy thông tin nhóm', method: 'getGroupInfo', category: 'groups', desc: 'Lấy thông tin chi tiết các nhóm chat chỉ định.', icon: 'ℹ️' },
            { id: 'getGroupMembersInfo', name: 'Lấy thành viên nhóm', method: 'getGroupMembersInfo', category: 'groups', desc: 'Lấy thông tin chi tiết của tất cả thành viên nhóm.', icon: '📋' },
            { id: 'getHiddenConversPin', name: 'Lấy trò chuyện ẩn', method: 'getHiddenConversPin', category: 'utilities', desc: 'Lấy danh sách cuộc trò chuyện ẩn bằng mã PIN.', icon: '🔐' },
            { id: 'getLabels', name: 'Lấy danh sách nhãn', method: 'getLabels', category: 'utilities', desc: 'Lấy danh sách nhãn/thẻ phân loại hội thoại.', icon: '🏷️' },
            { id: 'getMute', name: 'Lấy danh sách tắt chuông', method: 'getMute', category: 'utilities', desc: 'Lấy danh sách cuộc trò chuyện đang bị tắt thông báo.', icon: '🔕' },
            { id: 'getOwnId', name: 'Lấy ID tài khoản', method: 'getOwnId', category: 'business', desc: 'Lấy Zalo ID của tài khoản đang đăng nhập.', icon: '🆔' },
            { id: 'getPollDetail', name: 'Chi tiết bình chọn', method: 'getPollDetail', category: 'utilities', desc: 'Lấy chi tiết lượt bầu chọn và kết quả bình chọn.', icon: '📈' },
            { id: 'getQR', name: 'Lấy mã QR bạn bè', method: 'getQR', category: 'friends', desc: 'Lấy mã QR cá nhân của bạn bè.', icon: '📷' },
            { id: 'getQuickMessage', name: 'Lấy tin nhắn nhanh', method: 'getQuickMessage', category: 'messaging', desc: 'Lấy danh sách các mẫu tin nhắn nhanh cấu hình sẵn.', icon: '📋' },
            { id: 'getStickers', name: 'Tìm kiếm sticker', method: 'getStickers', category: 'messaging', desc: 'Tìm kiếm sticker/nhãn dán bằng từ khóa.', icon: '🦄' },
            { id: 'getStickersDetail', name: 'Chi tiết sticker', method: 'getStickersDetail', category: 'messaging', desc: 'Lấy thông tin chi tiết các sticker theo ID.', icon: '📄' },
            { id: 'getUnreadMark', name: 'Lấy hội thoại chưa đọc', method: 'getUnreadMark', category: 'utilities', desc: 'Lấy danh sách các cuộc hội thoại đánh dấu chưa đọc.', icon: '🔴' },
            { id: 'getUserInfo', name: 'Lấy thông tin người dùng', method: 'getUserInfo', category: 'business', desc: 'Lấy thông tin cá nhân của một người dùng Zalo.', icon: '👤' },
            { id: 'hideConversation', name: 'Ẩn cuộc trò chuyện', method: 'hideConversation', category: 'utilities', desc: 'Ẩn hoặc hiển thị lại cuộc trò chuyện.', icon: '👁️‍🗨️' },
            { id: 'inviteUserToGroups', name: 'Mời vào nhóm', method: 'inviteUserToGroups', category: 'groups', desc: 'Gửi lời mời tham gia nhóm chat cho người dùng.', icon: '✉️' },
            { id: 'keepAlive', name: 'Duy trì kết nối', method: 'keepAlive', category: 'others', desc: 'Gửi gói tin duy trì phiên kết nối hoạt động với Zalo.', icon: '💓' },
            { id: 'lockPoll', name: 'Khóa cuộc bình chọn', method: 'lockPoll', category: 'utilities', desc: 'Khóa cuộc bình chọn, không cho bầu chọn tiếp.', icon: '🔒' },
            { id: 'parseLink', name: 'Xử lý liên kết', method: 'parseLink', category: 'others', desc: 'Phân tích và lấy thông tin từ liên kết web.', icon: '🔗' },
            { id: 'pinConversations', name: 'Ghim hội thoại', method: 'pinConversations', category: 'utilities', desc: 'Ghim cuộc trò chuyện lên đầu danh sách.', icon: '📌' },
            { id: 'removeFriendAlias', name: 'Xóa biệt danh bạn bè', method: 'removeFriendAlias', category: 'friends', desc: 'Xóa tên gợi nhớ của bạn bè, khôi phục tên mặc định.', icon: '❌' },
            { id: 'removeGroupDeputy', name: 'Bãi nhiệm phó nhóm', method: 'removeGroupDeputy', category: 'groups', desc: 'Hạ quyền phó nhóm của một thành viên.', icon: '💂' },
            { id: 'removeQuickMessage', name: 'Xóa tin nhắn nhanh', method: 'removeQuickMessage', category: 'messaging', desc: 'Xóa tin nhắn nhanh đã cấu hình.', icon: '❌' },
            { id: 'removeUnreadMark', name: 'Xóa đánh dấu chưa đọc', method: 'removeUnreadMark', category: 'utilities', desc: 'Hủy đánh dấu chưa đọc cho cuộc trò chuyện.', icon: '🟢' },
            { id: 'removeUserFromGroup', name: 'Xóa thành viên khỏi nhóm', method: 'removeUserFromGroup', category: 'groups', desc: 'Trục xuất thành viên ra khỏi nhóm chat.', icon: '❌' },
            { id: 'resetHiddenConversPin', name: 'Đặt lại PIN ẩn trò chuyện', method: 'resetHiddenConversPin', category: 'utilities', desc: 'Đặt lại mã PIN trò chuyện ẩn. LƯU Ý: Sẽ xóa sạch các cuộc trò chuyện đang ẩn.', icon: '⚠️' },
            { id: 'sendCard', name: 'Gửi danh thiếp', method: 'sendCard', category: 'messaging', desc: 'Chia sẻ danh thiếp Zalo của một người dùng.', icon: '📇' },
            { id: 'sendDeliveredEvent', name: 'Gửi sự kiện đã nhận', method: 'sendDeliveredEvent', category: 'messaging', desc: 'Gửi phản hồi đã nhận tin nhắn thành công.', icon: '✔️' },
            { id: 'sendFriendRequest', name: 'Gửi lời mời kết bạn', method: 'sendFriendRequest', category: 'friends', desc: 'Gửi lời mời kết bạn kèm lời nhắn.', icon: '📨' },
            { id: 'sendLink', name: 'Gửi liên kết', method: 'sendLink', category: 'messaging', desc: 'Gửi tin nhắn kèm thẻ liên kết xem trước (Link Card).', icon: '🔗' },
            { id: 'sendMessage', name: 'Gửi tin nhắn văn bản', method: 'sendMessage', category: 'messaging', desc: 'Gửi tin nhắn văn bản thông thường.', icon: '💬' },
            { id: 'sendReport', name: 'Báo cáo xấu', method: 'sendReport', category: 'messaging', desc: 'Báo cáo tài khoản vi phạm chính sách hoặc spam.', icon: '🚩' },
            { id: 'sendSeenEvent', name: 'Gửi sự kiện đã đọc', method: 'sendSeenEvent', category: 'messaging', desc: 'Gửi phản hồi đã xem tin nhắn.', icon: '👀' },
            { id: 'sendSticker', name: 'Gửi sticker', method: 'sendSticker', category: 'messaging', desc: 'Gửi nhãn dán/sticker sinh động.', icon: '🦄' },
            { id: 'sendTypingEvent', name: 'Gửi sự kiện đang soạn thảo', method: 'sendTypingEvent', category: 'messaging', desc: 'Hiển thị hiệu ứng "Đang gõ tin nhắn..." trong chat.', icon: '✍️' },
            { id: 'sendVideo', name: 'Gửi video', method: 'sendVideo', category: 'messaging', desc: 'Gửi file video cho đối phương.', icon: '🎥' },
            { id: 'sendVoice', name: 'Gửi tin nhắn thoại', method: 'sendVoice', category: 'messaging', desc: 'Gửi đoạn ghi âm giọng nói.', icon: '🎙️' },
            { id: 'unblockUser', name: 'Bỏ chặn người dùng', method: 'unblockUser', category: 'friends', desc: 'Mở chặn gửi tin nhắn/gọi điện cho người dùng.', icon: '✅' },
            { id: 'undo_msg', name: 'Thu hồi tin nhắn (Gửi)', method: 'undo', category: 'messaging', desc: 'Thu hồi tin nhắn đã gửi từ phía người nhận.', icon: '↩️' },
            { id: 'message', name: 'Lắng nghe tin nhắn', method: 'listener.on.message', category: 'listeners', desc: 'Lắng nghe tin nhắn trực tiếp hoặc nhóm chat.', icon: '🎧' },
            { id: 'reaction', name: 'Lắng nghe thả cảm xúc', method: 'listener.on.reaction', category: 'listeners', desc: 'Lắng nghe sự kiện thả cảm xúc tin nhắn.', icon: '❤️' },
            { id: 'undo', name: 'Lắng nghe thu hồi tin nhắn', method: 'listener.on.undo', category: 'listeners', desc: 'Lắng nghe sự kiện thu hồi tin nhắn.', icon: '↩️' },
            { id: 'group_event', name: 'Lắng nghe sự kiện nhóm', method: 'listener.on.group_event', category: 'listeners', desc: 'Lắng nghe các sự kiện hoạt động của nhóm chat.', icon: '👥' }
        ];

        let currentToolsConfig = {};
        let currentToolsStats = {};

        // 1. Tải trạng thái từ máy chủ
        try {
            const res = await fetch(`${BACKEND_URL}/api/ai/tools`);
            const data = await res.json();
            if (data.success) {
                if (data.tools) currentToolsConfig = data.tools;
                if (data.stats) currentToolsStats = data.stats;
            }
        } catch (err) {
            console.error('Không thể tải cấu hình quyền tương tác:', err);
        }

        // Đăng ký phương thức cập nhật stats toàn cục cho socket gọi
        window.updateAiToolStats = function(data) {
            if (data && data.toolId && data.stats) {
                currentToolsStats[data.toolId] = data.stats;
                if (activeTab === 'integrations') {
                    renderTools();
                }
            }
        };

        // Render danh sách công cụ
        function renderTools() {
            const query = (searchInput.value || '').toLowerCase().trim();
            const category = filterSelect.value;

            // Lọc các công cụ thỏa mãn bộ lọc
            const filtered = ALL_ZALO_TOOLS.filter(t => {
                const matchesSearch = t.name.toLowerCase().includes(query) || 
                                      t.method.toLowerCase().includes(query) || 
                                      t.desc.toLowerCase().includes(query);
                const matchesCategory = (category === 'all') || (t.category === category);
                return matchesSearch && matchesCategory;
            });

            // Tạo mã HTML
            listBody.innerHTML = '';
            if (filtered.length === 0) {
                listBody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center; padding: 30px; color: var(--text-muted);">
                            Không tìm thấy tính năng tương ứng.
                        </td>
                    </tr>
                `;
                updateCountBadge();
                return;
            }

            filtered.forEach(t => {
                const isChecked = currentToolsConfig[t.id] !== false; // Bật theo mặc định nếu undefined
                const stats = currentToolsStats[t.id] || { successes: 0, errors: 0 };
                const total = stats.successes + stats.errors;
                const rate = total > 0 ? Math.round((stats.successes / total) * 100) : 100;
                
                // Định dạng màu sắc dựa trên tỷ lệ
                let rateColor = '#10b981'; // Xanh lá
                if (total > 0) {
                    if (rate < 50) rateColor = '#ef4444'; // Đỏ
                    else if (rate < 80) rateColor = '#f59e0b'; // Cam/Vàng
                }

                const rateHtml = total > 0 
                    ? `<span style="color:${rateColor}; font-weight:600;">${rate}%</span>` 
                    : `<span class="text-muted" style="font-size:0.75rem;">-</span>`;

                const statsHtml = `<span class="text-emerald" style="font-weight:600;">${stats.successes}</span> / <span class="text-rose" style="font-weight:600;">${stats.errors}</span>`;

                const row = document.createElement('tr');
                row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                row.innerHTML = `
                    <td style="padding:10px; font-weight:600;">${t.icon} ${t.name}</td>
                    <td style="padding:10px; font-family:monospace; color:#ec4899;">${t.method}</td>
                    <td style="padding:10px; color:var(--text-muted);">${t.desc}</td>
                    <td style="padding:10px; text-align:center;">${statsHtml}</td>
                    <td style="padding:10px; text-align:center;">${rateHtml}</td>
                    <td style="padding:10px; text-align:center;">
                        <label class="switch" style="transform: scale(0.85); display:inline-block;">
                            <input type="checkbox" class="tool-toggle-dynamic" data-tool="${t.id}" ${isChecked ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </td>
                `;
                listBody.appendChild(row);
            });

            // Lắng nghe thay đổi trạng thái của switch toggle
            listBody.querySelectorAll('.tool-toggle-dynamic').forEach(toggle => {
                toggle.addEventListener('change', function() {
                    const toolName = this.getAttribute('data-tool');
                    currentToolsConfig[toolName] = this.checked;
                    updateCountBadge();
                });
            });

            updateCountBadge();
        }

        function updateCountBadge() {
            const activeCount = ALL_ZALO_TOOLS.filter(t => currentToolsConfig[t.id] !== false).length;
            countBadge.textContent = `Đang bật: ${activeCount}/${ALL_ZALO_TOOLS.length}`;
        }

        // Lắng nghe sự kiện tìm kiếm và lọc nhóm
        searchInput.addEventListener('input', renderTools);
        filterSelect.addEventListener('change', renderTools);

        // Bật tất cả các công cụ đang hiển thị trong bộ lọc
        btnToggleOn.addEventListener('click', () => {
            const query = (searchInput.value || '').toLowerCase().trim();
            const category = filterSelect.value;
            ALL_ZALO_TOOLS.forEach(t => {
                const matchesSearch = t.name.toLowerCase().includes(query) || 
                                      t.method.toLowerCase().includes(query) || 
                                      t.desc.toLowerCase().includes(query);
                const matchesCategory = (category === 'all') || (t.category === category);
                if (matchesSearch && matchesCategory) {
                    currentToolsConfig[t.id] = true;
                }
            });
            renderTools();
        });

        // Tắt tất cả các công cụ đang hiển thị trong bộ lọc
        btnToggleOff.addEventListener('click', () => {
            const query = (searchInput.value || '').toLowerCase().trim();
            const category = filterSelect.value;
            ALL_ZALO_TOOLS.forEach(t => {
                const matchesSearch = t.name.toLowerCase().includes(query) || 
                                      t.method.toLowerCase().includes(query) || 
                                      t.desc.toLowerCase().includes(query);
                const matchesCategory = (category === 'all') || (t.category === category);
                if (matchesSearch && matchesCategory) {
                    currentToolsConfig[t.id] = false;
                }
            });
            renderTools();
        });

        // 2. Lắng nghe sự kiện lưu
        btnSaveTools.addEventListener('click', async () => {
            btnSaveTools.disabled = true;
            btnSaveTools.textContent = 'Đang lưu...';

            try {
                const res = await fetch(`${BACKEND_URL}/api/ai/tools`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(currentToolsConfig)
                });
                const data = await res.json();
                if (data.success) {
                    if (typeof addTerminalLog === 'function') {
                        addTerminalLog('[Hệ thống] Đã cập nhật thành công quyền tương tác tự động của bot.', 'success');
                    }
                    alert('Đã lưu quyền tương tác của bot thành công!');
                } else {
                    alert('Lưu thất bại: ' + (data.error || 'Lỗi không xác định'));
                }
            } catch (err) {
                console.error('Lỗi khi lưu cấu hình tools:', err);
                alert('Lỗi mạng khi lưu cấu hình.');
            } finally {
                btnSaveTools.disabled = false;
                btnSaveTools.textContent = 'Lưu quyền tương tác';
            }
        });

        // Khởi tạo render lần đầu
        renderTools();
    }

    initAiToolsControllers();
    initGroupChatControllers();
    updateGlobalBadges();
    window.switchTab('overview');

    if (currentAppMode === 'live') {
        initWebSocket();
        refreshAllData();
    }
});
