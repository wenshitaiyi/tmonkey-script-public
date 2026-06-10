// ==UserScript==
// @name         Douyin Extract Panel
// @namespace    http://tampermonkey.net/
// @version      4.1
// @description  修复按钮失效、添加正序/逆序切换、修复Tab切换数据残留、恢复数量显示
// @author       wenshitaiyi
// @match        *://www.douyin.com/*
// @grant        none
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/wenshitaiyi/tmonkey-script-public/main/douyin-extract.js
// @updateURL    https://raw.githubusercontent.com/wenshitaiyi/tmonkey-script-public/main/douyin-extract.js
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 1. 状态管理
    // ==========================================
    const state = {
        userInfo: { nickname: '', douyin_id: '', sec_uid: '', following_count: '0', follower_count: '0', total_likes: '0', signature: '' },
        pageType: '未知页面',
        links: new Map(),
        isAutoScrolling: false,
        scrollInterval: null,
        lastPageKey: window.location.pathname + window.location.search, // 记录当前路由，用于判断是否切换了 Tab
        sortOrder: 'asc', // 'desc': 最新捕获在顶部 | 'asc': 最新捕获在底部
        ui: { isDocked: true, isPinned: false, snapThreshold: 80 }
    };

    // ==========================================
    // 2. 核心逻辑：数据提取与路由检测
    // ==========================================

    const identifyPage = () => {
        const path = window.location.pathname, search = window.location.search;
        if (search.includes('showTab=like')) return '喜欢列表';
        if (search.includes('showTab=favorite_collection')) return '收藏列表';
        if (path.includes('/user/')) return '个人主页';
        return '其他页面';
    };

    // 检测页面是否发生了切换 (解决切换到“喜欢”依然残留主页数据的问题)
    const checkRouteSwitch = () => {
        const currentKey = window.location.pathname + window.location.search;
        if (state.lastPageKey !== currentKey) {
            console.log("检测到页面切换，自动清空旧数据...");
            state.links.clear();
            state.lastPageKey = currentKey;
            renderList();
        }
    };

    const updateUserInfo = () => {
        checkRouteSwitch(); // 每次更新前先检查是否切了路由

        state.pageType = identifyPage();
        if (state.pageType === '其他页面') return;

        // 1. 提取昵称
        const h1El = document.querySelector('h1');
        state.userInfo.nickname = h1El ? h1El.innerText.trim() : '未知用户';

        // 2. 提取统计数据
        const getStat = (e2eName) => {
            const node = document.querySelector(`[data-e2e="${e2eName}"]`);
            return (node && node.children.length > 1) ? node.children[1].innerText.trim() : '0';
        };
        state.userInfo.following_count = getStat('user-info-follow');
        state.userInfo.follower_count = getStat('user-info-fans');
        state.userInfo.total_likes = getStat('user-info-like');

        // 3. 提取抖音号
        let dySpan = Array.from(document.querySelectorAll('span')).find(s => s.innerText?.includes('抖音号：'));
        state.userInfo.douyin_id = dySpan ? dySpan.innerText.replace('抖音号：', '').trim() : '';

        // ★ 4. 恢复签名提取逻辑 ★
        let sigText = '暂无签名';
        if (dySpan) {
            const parentP = dySpan.closest('p');
            if (parentP && parentP.nextElementSibling) {
                const nextDiv = parentP.nextElementSibling;
                // 排除掉登录提示等无关元素
                if (nextDiv.tagName.toLowerCase() === 'div' && !nextDiv.innerText.includes('保存登录信息')) {
                    sigText = nextDiv.innerText.trim();
                }
            }
        }
        state.userInfo.signature = sigText;

        // ★ 5. 恢复内部 Sec_uid 提取逻辑 ★
        let rawUid = window.location.pathname.split('/user/')[1] || '';
        if (rawUid.startsWith('self')) {
            state.userInfo.sec_uid = 'self (我的主页)';
        } else {
            state.userInfo.sec_uid = rawUid.split('?')[0];
        }

        renderHeader();
    };

    const extractLinks = () => {
        const items = document.querySelectorAll('li.wqW3g_Kl, li.WPzYSlFQ');
        let addedCount = 0;

        items.forEach(item => {
            const anchor = item.querySelector('a[href*="/video/"], a[href*="/note/"]');
            if (!anchor) return;

            const rawUrl = anchor.href.split('?')[0];
            const idMatch = rawUrl.match(/\/(video|note)\/(\d+)/);

            if (idMatch && idMatch[2]) {
                const id = idMatch[2];
                if (!state.links.has(id)) {
                    const img = item.querySelector('img');
                    const titleEl = item.querySelector('p.EtttsrEw') || item.querySelector('p.eJFBAbdI');
                    const statsEl = item.querySelector('.BgCg_ebQ');

                    state.links.set(id, {
                        id: id,
                        url: rawUrl,
                        type: idMatch[1],
                        title: titleEl ? titleEl.innerText.trim() : '无标题',
                        cover: img ? img.src : '',
                        stats: statsEl ? statsEl.innerText.trim() : '0'
                    });
                    addedCount++;
                }
            }
        });

        if (addedCount > 0) renderList();
    };

    // ==========================================
    // 3. UI 交互与渲染 (修复按钮事件委托)
    // ==========================================

    const injectStyles = () => {
        const style = document.createElement('style');
        // 样式保持不变，省略了部分以节约空间，确保面板、卡片样式正常
        style.textContent = `
            #dy-extractor-panel { position: fixed; width: 320px; height: 85%; background: rgba(20, 20, 22, 0.98); backdrop-filter: blur(15px); box-shadow: -5px 0 25px rgba(0,0,0,0.6); z-index: 999999; display: flex; flex-direction: column; color: #fff; font-family: system-ui; border: 1px solid rgba(255,255,255,0.08); }
            #dy-extractor-panel.docked { right: -340px; top: 7%; border-radius: 12px 0 0 12px; transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
            #dy-extractor-panel.docked.active { right: 0; }
            #dy-extractor-panel.floating { border-radius: 12px; transition: none; }
            #dy-extractor-tab { position: fixed; right: 0; top: 50%; transform: translateY(-50%); background: #fe2c55; color: white; padding: 15px 5px; cursor: pointer; border-radius: 8px 0 0 8px; z-index: 999998; font-size: 12px; writing-mode: vertical-rl; box-shadow: -2px 0 5px rgba(0,0,0,0.2); }

            .dy-drag-handle { padding: 12px 15px; background: rgba(255,255,255,0.03); cursor: move; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; }
            .dy-header { padding: 12px; border-bottom: 1px solid #333; font-size: 12px; }

            .dy-link-item { background: #2c2c2e; margin-bottom: 10px; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; border: 1px solid transparent; transition: 0.2s; }
            .dy-link-item:hover { border-color: #fe2c55; }
            .dy-item-top { display: flex; padding: 8px; gap: 10px; }
            .dy-item-cover { width: 60px; height: 80px; object-fit: cover; border-radius: 4px; background: #000; }
            .dy-item-info { flex: 1; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
            .dy-item-title { font-size: 11px; line-height: 1.4; height: 32px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; color: #eee; }
            .dy-item-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 5px; }
            .dy-item-stats { font-size: 10px; color: #fe2c55; font-weight: bold; display: flex; align-items: center; gap: 3px; }

            .dy-item-btns { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid #3d3d3f; }
            .dy-item-btn { padding: 6px; border: none; background: none; color: #aaa; font-size: 10px; cursor: pointer; text-align: center; }
            .dy-item-btn:hover { background: #3d3d3f; color: #fff; }
            .dy-item-btn:first-child { border-right: 1px solid #3d3d3f; }

            .dy-content { flex: 1; overflow-y: auto; padding: 12px; }
            .dy-footer { padding: 12px; border-top: 1px solid #333; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
            .dy-btn { padding: 8px; border: none; border-radius: 6px; cursor: pointer; color: white; font-size: 12px; font-weight: bold; }
            .dy-btn-primary { background: #fe2c55; grid-column: span 2; }
            .dy-btn-secondary { background: #3498db; }
            .dy-btn-settings { background: #444; }
        `;
        document.head.appendChild(style);
    };

    const buildUI = () => {
        const tab = document.createElement('div');
        tab.id = 'dy-extractor-tab';
        tab.innerText = '提取控制台';
        document.body.appendChild(tab);

        const panel = document.createElement('div');
        panel.id = 'dy-extractor-panel';
        panel.className = 'docked';
        panel.innerHTML = `
            <div class="dy-drag-handle" id="dy-drag-handle">
                <span style="color:#fe2c55; font-weight:bold; font-size:13px;">抓取终端 V4.0</span>
                <button id="dy-btn-pin" style="background:none; border:none; cursor:pointer; filter:grayscale(1); font-size:14px;">📌</button>
            </div>
            <div class="dy-header" id="dy-render-header">用户信息加载中...</div>
            <div class="dy-content" id="dy-link-list"></div>
            <div class="dy-footer">
                <button class="dy-btn dy-btn-secondary" id="dy-btn-scroll">自动翻页</button>
                <button class="dy-btn dy-btn-settings" id="dy-btn-clear">清空列表</button>
                <button class="dy-btn dy-btn-primary" id="dy-btn-export">导出 JSON 数据库文件</button>
            </div>
        `;
        document.body.appendChild(panel);
        initInteractions(tab, panel);

        document.getElementById('dy-btn-export').onclick = exportJSON;
        document.getElementById('dy-btn-scroll').onclick = toggleAutoScroll;
        document.getElementById('dy-btn-clear').onclick = () => { state.links.clear(); renderList(); };

        // ★ 核心修复：事件委托机制 ★
        // 统一监听列表容器内的点击事件，完美避开 onclick 的作用域问题
        document.getElementById('dy-link-list').addEventListener('click', (e) => {
            if (e.target.dataset.action === 'copy') {
                const item = state.links.get(e.target.dataset.id);
                if (item) {
                    // 兼容性极强的复制方案
                    const textarea = document.createElement('textarea');
                    textarea.value = JSON.stringify(item, null, 4);
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);

                    const oldText = e.target.innerText;
                    e.target.innerText = '✅ 已复制';
                    e.target.style.color = '#00ff00';
                    setTimeout(() => {
                        e.target.innerText = oldText;
                        e.target.style.color = '';
                    }, 1500);
                }
            } else if (e.target.dataset.action === 'open') {
                window.open(e.target.dataset.url, '_blank');
            }
        });
    };

    const renderHeader = () => {
        const container = document.getElementById('dy-render-header');
        if (!container) return;

        container.innerHTML = `
            <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:6px; position:relative;">
                <button id="dy-btn-copy-user" style="position:absolute; right:10px; top:10px; background:#fe2c55; border:none; color:#fff; padding:4px 8px; border-radius:4px; font-size:10px; cursor:pointer; transition:0.2s;">复制 JSON</button>

                <div style="display:flex; justify-content:flex-start; align-items:center; gap:8px; padding-right: 65px;">
                    <span style="font-weight:bold; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${state.userInfo.nickname || '获取中...'}</span>
                    <span style="font-size:10px; color:#fe2c55; background:rgba(254,44,85,0.1); padding:2px 6px; border-radius:4px; white-space:nowrap;">${state.pageType}</span>
                </div>
                <div style="color:#aaa; font-size:11px; margin-top:5px;">抖音号: ${state.userInfo.douyin_id || '-'}</div>
                <div style="display:flex; gap:12px; margin-top:8px; font-size:11px; color:#888;">
                    <span>关注 <b style="color:#ddd">${state.userInfo.following_count}</b></span>
                    <span>粉丝 <b style="color:#ddd">${state.userInfo.follower_count}</b></span>
                    <span>获赞 <b style="color:#ddd">${state.userInfo.total_likes}</b></span>
                </div>

                <div style="margin-top:8px; font-size:11px; color:#999; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;" title="${state.userInfo.signature}">
                    <span style="color:#888;">签名:</span> ${state.userInfo.signature || '暂无签名'}
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; padding:0 4px;">
                <div style="font-size:12px;">已捕获: <span style="color:#fe2c55; font-size:18px; font-weight:bold;">${state.links.size}</span> 项</div>
                <button id="dy-btn-sort" style="background:#3d3d3f; border:none; color:#fff; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:11px; transition:0.2s;">
                    ${state.sortOrder === 'desc' ? '🔽 最新在顶部' : '🔼 最新在底部'}
                </button>
            </div>
        `;

        // 绑定排序按钮事件
        const sortBtn = document.getElementById('dy-btn-sort');
        if (sortBtn) {
            sortBtn.onclick = () => {
                state.sortOrder = state.sortOrder === 'desc' ? 'asc' : 'desc';
                renderList();
            };
        }

        // 绑定复制个人信息按钮事件
        const copyUserBtn = document.getElementById('dy-btn-copy-user');
        if (copyUserBtn) {
            copyUserBtn.onclick = (e) => {
                const text = JSON.stringify(state.userInfo, null, 4);

                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);

                const oldText = e.target.innerText;
                e.target.innerText = '✅ 已复制';
                e.target.style.background = '#27ae60';
                setTimeout(() => {
                    e.target.innerText = oldText;
                    e.target.style.background = '#fe2c55';
                }, 1500);
            };
        }
    };

    const renderList = () => {
        const list = document.getElementById('dy-link-list');
        if (!list) return;

        if (state.links.size === 0) {
            list.innerHTML = '<div style="text-align:center; color:#666; margin-top:40px;">暂无捕获内容</div>';
            renderHeader(); // 更新数量
            return;
        }

        let html = '';
        let linkArray = Array.from(state.links.values());

        // ★ 核心修复：应用排序逻辑 ★
        if (state.sortOrder === 'desc') {
            linkArray.reverse(); // 逆序：最新捕获的在最上面
        }

        linkArray.forEach(item => {
            // 改为 data-action 形式，配合事件委托
            html += `
                <div class="dy-link-item">
                    <div class="dy-item-top">
                        <img src="${item.cover}" class="dy-item-cover">
                        <div class="dy-item-info">
                            <div class="dy-item-title">${item.title}</div>
                            <div class="dy-item-meta">
                                <span class="dy-item-stats">❤️ ${item.stats}</span>
                                <span style="font-size:9px; color:#555;">ID: ${item.id.slice(-6)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="dy-item-btns">
                        <button class="dy-item-btn" data-action="copy" data-id="${item.id}">复制 JSON</button>
                        <button class="dy-item-btn" data-action="open" data-url="${item.url}">查看作品</button>
                    </div>
                </div>
            `;
        });
        list.innerHTML = html;
        renderHeader(); // 更新数量
    };

    // ==========================================
    // 4. 辅助函数与启动
    // ==========================================

    const initInteractions = (tab, panel) => {
        const handle = document.getElementById('dy-drag-handle');
        const pinBtn = document.getElementById('dy-btn-pin');

        pinBtn.onclick = () => {
            state.ui.isPinned = !state.ui.isPinned;
            pinBtn.style.filter = state.ui.isPinned ? 'grayscale(0)' : 'grayscale(1)';
        };

        tab.onmouseenter = () => { if(state.ui.isDocked) panel.classList.add('active'); updateUserInfo(); };
        panel.onmouseleave = () => { if(state.ui.isDocked && !state.ui.isPinned) panel.classList.remove('active'); };

        let isDragging = false, startX, startY, initL, initT;
        handle.onmousedown = (e) => {
            if(e.target === pinBtn) return;
            isDragging = true;
            const rect = panel.getBoundingClientRect();
            if(state.ui.isDocked) {
                state.ui.isDocked = false;
                panel.className = 'floating';
                panel.style.left = rect.left + 'px'; panel.style.top = rect.top + 'px';
            }
            startX = e.clientX; startY = e.clientY;
            initL = rect.left; initT = rect.top;
        };
        document.onmousemove = (e) => {
            if(!isDragging) return;
            panel.style.left = (initL + e.clientX - startX) + 'px';
            panel.style.top = (initT + e.clientY - startY) + 'px';
        };
        document.onmouseup = () => {
            if(!isDragging) return;
            isDragging = false;
            if(window.innerWidth - panel.getBoundingClientRect().right < state.ui.snapThreshold) {
                state.ui.isDocked = true; panel.className = 'docked active';
                panel.style.left = ''; panel.style.top = '';
            }
        };
    };

    const toggleAutoScroll = () => {
        state.isAutoScrolling = !state.isAutoScrolling;
        const btn = document.getElementById('dy-btn-scroll');
        if(state.isAutoScrolling) {
            btn.innerText = '停止翻页'; btn.style.background = '#e74c3c';
            state.scrollInterval = setInterval(() => window.scrollBy(0, 800), 1500);
        } else {
            btn.innerText = '自动翻页'; btn.style.background = '#3498db';
            clearInterval(state.scrollInterval);
        }
    };

    const exportJSON = () => {
        // 定义中文到英文目录的映射
        const typeMap = {
            '发布页面(主页)': 'post',
            '个人主页': 'post',
            '喜欢列表': 'like',
            '收藏列表': 'favorite',
            '观看历史': 'history',
            '搜索结果': 'search'
        };

        const data = {
            header: {
                time: new Date().toISOString(),
                // 增加标准化类型键名
                page_type_en: typeMap[state.pageType] || 'others',
                page_type_cn: state.pageType,
                user: state.userInfo
            },
            total: state.links.size,
            items: Array.from(state.links.values())
        };

        const blob = new Blob([JSON.stringify(data, null, 4)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        // 文件名也加上分类，一眼就能区分
        const fileName = `抖音_${typeMap[state.pageType] || 'data'}_${state.userInfo.nickname}_${Date.now()}.json`;
        a.download = fileName;
        a.click();
    };

    const debounce = (func, wait) => {
        let timeout;
        return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), wait); };
    };

    const initObserver = () => {
        const debouncedExtract = debounce(() => { extractLinks(); updateUserInfo(); }, 800);
        const observer = new MutationObserver((mutations) => {
            if (mutations.some(m => m.addedNodes.length > 0)) debouncedExtract();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    };

    injectStyles(); buildUI(); initObserver();
    setTimeout(() => { updateUserInfo(); extractLinks(); }, 2000);

})();