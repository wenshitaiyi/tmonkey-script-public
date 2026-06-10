// ==UserScript==
// @name         Web AI 自动化任务面板 (V3.1 极致UI与布局修正版)
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  独立标签页运行、剪贴板导入导出、布局防挤压、状态栏固顶、防抖判定
// @author       You & Gemini
// @match        *://gemini.google.com/*
// @match        *://chatgpt.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 1. 核心配置与选择器
    // ==========================================
    const CONFIG = {
        selectors: {
            textarea: 'rich-textarea p, textarea',
            sendBtn: '.send-button, button[aria-label="Send message"], button[data-testid="send-button"]',
            generatingIndicator: 'mat-icon[fonticon="stop"], .generating-animation, button[aria-label="Stop generating"], button[data-testid="stop-button"], .result-streaming'
        },
        pollInterval: 1000,
        cooldownRange: [4, 8], // 【调整】缩短冷却区间，提升整体响应节奏
        stableConfirmTime: 6 
    };

    // ==========================================
    // 2. 数据层 (纯内存管理)
    // ==========================================
    const state = {
        isRunning: false,
        tasks: [],
        archives: []
    };

    const SEPARATOR = '\n/***********/\n';
    
    function exportToClipboard(dataArray, typeName) {
        if (dataArray.length === 0) {
            alert(`没有可复制的${typeName}！`);
            return;
        }
        const textToCopy = dataArray.join(SEPARATOR);
        navigator.clipboard.writeText(textToCopy).then(() => {
            alert(`✅ ${typeName}已成功复制到剪贴板！\n\n请在另一个窗口将内容粘贴到输入框，并点击【按分隔符批量添加】即可完成导入。`);
        }).catch(err => {
            alert('复制失败，可能是浏览器权限限制: ' + err);
        });
    }

    // ==========================================
    // 3. 状态机发送引擎
    // ==========================================
    const engine = {
        step: 'IDLE', 
        cooldownTimer: 0,
        replyWaitTimer: 0,
        replyIdleTimer: 0,
        hasStartedGenerating: false, 
        statusText: '💤 闲置中',

        reset() {
            this.step = 'IDLE';
            this.cooldownTimer = 0;
            this.replyWaitTimer = 0;
            this.replyIdleTimer = 0;
            this.hasStartedGenerating = false;
            this.setStatus('💤 闲置中');
        },

        setStatus(msg) {
            this.statusText = msg;
            const uiStatus = document.getElementById('auto-status-text');
            if (uiStatus) uiStatus.textContent = msg;
        },

        tick() {
            if (!state.isRunning) {
                if (this.step !== 'IDLE') this.reset();
                return;
            }

            if (state.tasks.length === 0) {
                this.setStatus('📭 队列为空');
                return;
            }

            const textarea = document.querySelector(CONFIG.selectors.textarea);
            let sendBtn = document.querySelector(CONFIG.selectors.sendBtn);
            const isGenerating = document.querySelector(CONFIG.selectors.generatingIndicator);

            switch (this.step) {
                case 'IDLE':
                    if (isGenerating || (sendBtn && sendBtn.disabled)) {
                        this.setStatus('🤖 AI 正在生成，等待结束...');
                        return;
                    }
                    if (!textarea || !sendBtn) {
                        this.setStatus('⚠️ 找不到输入框');
                        return;
                    }
                    this.setStatus('✍️ 准备填入数据...');
                    this.step = 'FILLING';
                    break;

                case 'FILLING':
                    const currentTask = state.tasks[0];
                    if (simulateInput(textarea, currentTask)) {
                        this.setStatus('⏳ 等待发送按钮激活...');
                        this.step = 'WAITING_BTN';
                    } else {
                        this.setStatus('❌ 填入失败重试中...');
                        this.step = 'IDLE';
                    }
                    break;

                case 'WAITING_BTN':
                    sendBtn = document.querySelector(CONFIG.selectors.sendBtn);
                    if (!sendBtn) return;

                    if (sendBtn.disabled) {
                        this.setStatus('⏳ 网页分析中，等待发送按钮亮起...');
                    } else {
                        this.setStatus('🚀 发送！');
                        sendBtn.click();

                        const doneTask = state.tasks.shift();
                        state.archives.unshift(doneTask);
                        if (state.archives.length > 50) state.archives.pop();

                        renderUI();

                        this.replyWaitTimer = 0;
                        this.replyIdleTimer = 0;
                        this.hasStartedGenerating = false;
                        this.step = 'WAITING_REPLY';
                    }
                    break;

                case 'WAITING_REPLY':
                    const isBusy = isGenerating || (sendBtn && sendBtn.disabled);

                    if (isBusy) {
                        this.hasStartedGenerating = true;
                        this.replyIdleTimer = 0;
                        this.setStatus('🤖 AI 正在生成回复...');
                    } else {
                        if (this.hasStartedGenerating) {
                            this.replyIdleTimer += (CONFIG.pollInterval / 1000);
                            if (this.replyIdleTimer >= CONFIG.stableConfirmTime) {
                                this.step = 'COOLDOWN_INIT';
                            } else {
                                this.setStatus(`🔄 疑似结束，防抖确认中 (${Math.floor(this.replyIdleTimer)}/${CONFIG.stableConfirmTime}s)...`);
                            }
                        } else {
                            this.replyWaitTimer += (CONFIG.pollInterval / 1000);
                            if (this.replyWaitTimer > 8) { 
                                this.step = 'COOLDOWN_INIT';
                            } else {
                                this.setStatus('⏳ 等待 AI 开始响应...');
                            }
                        }
                    }
                    break;

                case 'COOLDOWN_INIT':
                    const min = CONFIG.cooldownRange[0];
                    const max = CONFIG.cooldownRange[1];
                    this.cooldownTimer = Math.floor(Math.random() * (max - min + 1)) + min;
                    this.step = 'COOLDOWN';
                    break;

                case 'COOLDOWN':
                    if (this.cooldownTimer > 0) {
                        this.setStatus(`🔒 发送冷却中: ${Math.ceil(this.cooldownTimer)}s`);
                        this.cooldownTimer -= (CONFIG.pollInterval / 1000);
                    } else {
                        this.step = 'IDLE';
                    }
                    break;
            }
        }
    };

    function simulateInput(element, text) {
        if (!element) return false;
        element.focus();
        if (element.contentEditable === 'true' || element.tagName === 'P') {
            element.textContent = text;
        } else {
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
            if (nativeSetter) nativeSetter.call(element, text);
            else element.value = text;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ', keyCode: 32 }));
        return true;
    }

    setInterval(() => engine.tick(), CONFIG.pollInterval);

    // ==========================================
    // 4. 原生 UI 构建 (Flexbox 布局重构)
    // ==========================================
    GM_addStyle(`
        #auto-panel { position: fixed; top: 20px; right: 20px; width: 340px; background: #fff; border: 1px solid #ccc; box-shadow: 0 8px 24px rgba(0,0,0,0.2); border-radius: 8px; z-index: 999999; font-family: sans-serif; font-size: 13px; color: #333; display: flex; flex-direction: column; max-height: 85vh; resize: both; overflow: hidden; transition: width 0.3s, height 0.3s; }
        #auto-panel.minimized { width: 40px !important; height: 40px !important; resize: none; border-radius: 8px 0 0 8px; overflow: hidden; right: 0 !important; left: auto !important; transition: all 0.3s; }
        #auto-panel.minimized #auto-body { display: none; }
        #auto-panel.minimized #auto-header-title, #auto-panel.minimized #toggle-run-btn { display: none; }
        #auto-panel.minimized #dock-btn { width: 100%; height: 100%; border-radius: 0; }

        /* 面板头部 */
        #auto-header { flex-shrink: 0; padding: 10px; background: #f8f9fa; border-bottom: 1px solid #ddd; cursor: move; display: flex; justify-content: space-between; align-items: center; user-select: none; }
        
        /* 核心布局修复：Body 设为 Flex 列容器，隔离上下区域 */
        #auto-body { display: flex; flex-direction: column; flex: 1; overflow: hidden; }

        /* 状态栏：固定高度，渐变背景，精美阴影 */
        #auto-status-text { flex-shrink: 0; background: linear-gradient(90deg, #e8f0fe, #d2e3fc); color: #1967d2; padding: 8px 10px; font-weight: bold; text-align: center; border-bottom: 1px solid #c2e7ff; box-shadow: 0 2px 4px rgba(0,0,0,0.05); text-shadow: 0 1px 1px rgba(255,255,255,0.5); font-size: 12px;}
        
        /* 输入区：固定高度，不被压缩 */
        #auto-input-section { flex-shrink: 0; padding: 10px; background: #fff; border-bottom: 1px solid #eee; z-index: 1;}
        
        /* 列表区：占据剩余空间，独立滚动 */
        #auto-list-section { flex: 1; overflow-y: auto; padding: 10px; }

        .auto-btn { padding: 5px 10px; border: none; border-radius: 4px; cursor: pointer; color: #fff; background: #0b57d0; font-size: 12px; transition: 0.2s;}
        .auto-btn:hover { filter: brightness(1.1); }
        .auto-btn.danger { background: #d93025; }
        .auto-btn.success { background: #188038; }
        .auto-btn.outline { background: transparent; border: 1px solid #ccc; color: #555; }
        .auto-btn.outline:hover { background: #eee; }
        .auto-btn.icon { padding: 4px 8px; font-size: 12px; }

        #auto-task-input { width: 100%; height: 60px; margin-bottom: 8px; box-sizing: border-box; resize: vertical; padding: 6px; border: 1px solid #ccc; border-radius: 4px; font-family: inherit;}
        .task-list { margin-bottom: 15px; display: flex; flex-direction: column; gap: 6px; }
        .task-item { background: #f8f9fa; padding: 8px; border-radius: 4px; border: 1px solid #eee; display: flex; justify-content: space-between; align-items: flex-start; word-break: break-all; gap: 8px;}
        .task-item.active { border-color: #1967d2; background: #e8f0fe; box-shadow: 0 0 0 1px #1967d2; }
        .task-content { flex: 1; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; line-height: 1.4; cursor: help;}

        .section-header { display: flex; justify-content: space-between; align-items: center; margin: 0 0 8px 0; font-weight: bold; }
        .btn-group { display: flex; gap: 4px; }
    `);

    function el(tag, attrs = {}, ...children) {
        const element = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (k === 'className') element.className = v;
            else if (k === 'style') element.style.cssText = v;
            else if (k === 'onclick') element.addEventListener('click', v);
            else element.setAttribute(k, v); 
        }
        children.forEach(child => {
            if (typeof child === 'string' || typeof child === 'number') element.appendChild(document.createTextNode(child));
            else if (child instanceof Node) element.appendChild(child);
        });
        return element;
    }

    const panel = el('div', { id: 'auto-panel' });

    const dockBtn = el('button', { id: 'dock-btn', className: 'auto-btn outline icon', onclick: toggleDock, title: '折叠面板' }, '🗕');
    const toggleRunBtn = el('button', { id: 'toggle-run-btn', className: 'auto-btn success', onclick: toggleRun }, '开始执行');
    const headerTitle = el('span', { id: 'auto-header-title', style: 'font-weight:bold;' }, '🚀 AI 自动化');
    const header = el('div', { id: 'auto-header' }, headerTitle, el('div', {style: 'display:flex; gap: 8px;'}, toggleRunBtn, dockBtn));

    // 【修改】重构后的 DOM 结构
    const statusBar = el('div', { id: 'auto-status-text' }, engine.statusText);

    const taskInput = el('textarea', {
        id: 'auto-task-input',
        placeholder: '输入任务。\n• 单个任务：直接点【添加任务】\n• 批量任务：任务间独占一行输入 /***********/ (至少10个*)，点【批量添加】\n• 导入功能：粘贴复制的任务代码，点【批量添加】'
    });

    const addBtn = el('button', { className: 'auto-btn', style: 'flex:1;', onclick: () => addTask(false) }, '添加任务');
    const addBatchBtn = el('button', { className: 'auto-btn outline', onclick: () => addTask(true), title: '可用作解析复制的批量任务' }, '按分隔符批量添加');
    const inputArea = el('div', { style: 'display:flex; gap:5px;' }, addBtn, addBatchBtn);
    
    // 【修改】输入区被单独包装，防止挤压
    const inputSection = el('div', { id: 'auto-input-section' }, taskInput, inputArea);

    const qHeader = el('div', { className: 'section-header' },
        el('span', {}, '待执行队列 (', el('span', {id: 'q-count'}, '0'), ')'),
        el('div', { className: 'btn-group' },
            el('button', { className: 'auto-btn outline icon', onclick: () => exportToClipboard(state.tasks, '任务队列'), title: '导出全部排队任务' }, '📋 复制'),
            el('button', { className: 'auto-btn danger icon', onclick: () => { if(confirm('清空队列？')){ state.tasks = []; renderUI(); } } }, '✖ 清空')
        )
    );
    const qList = el('div', { className: 'task-list' });

    const aHeader = el('div', { className: 'section-header', style: 'margin-top: auto;' },
        el('span', {}, '已归档记录'),
        el('div', { className: 'btn-group' },
            el('button', { className: 'auto-btn outline icon', onclick: () => exportToClipboard(state.archives, '归档记录'), title: '导出已执行完的任务' }, '📋 复制'),
            el('button', { className: 'auto-btn danger icon', onclick: () => { if(confirm('清空归档？')){ state.archives = []; renderUI(); } } }, '✖ 清空')
        )
    );
    const aList = el('div', { className: 'task-list', style: 'opacity: 0.8;' });

    // 【修改】列表区被单独包装，支持独立滚动
    const listSection = el('div', { id: 'auto-list-section' }, qHeader, qList, aHeader, aList);

    const body = el('div', { id: 'auto-body' }, statusBar, inputSection, listSection);
    panel.append(header, body);

    function toggleRun() {
        state.isRunning = !state.isRunning;
        updateRunBtnUI();
        if(!state.isRunning) engine.reset();
    }

    function updateRunBtnUI() {
        toggleRunBtn.textContent = state.isRunning ? '⏹ 停止执行' : '▶ 开始执行';
        toggleRunBtn.className = `auto-btn ${state.isRunning ? 'danger' : 'success'}`;
    }

    function toggleDock() {
        panel.classList.toggle('minimized');
        dockBtn.textContent = panel.classList.contains('minimized') ? '🗖' : '🗕';
    }

    function addTask(isBatch) {
        const val = taskInput.value.trim();
        if (!val) return;

        if (isBatch) {
            const regex = /^\s*\/\*{10,}\/\s*$/m;
            const lines = val.split(regex).map(l => l.trim()).filter(l => l);
            state.tasks.push(...lines);
        } else {
            state.tasks.push(val);
        }

        taskInput.value = '';
        renderUI();
    }

    function renderUI() {
        document.getElementById('q-count').textContent = state.tasks.length;

        qList.replaceChildren();
        state.tasks.forEach((t, i) => {
            const isFirst = i === 0 && state.isRunning;
            const item = el('div', { className: `task-item ${isFirst ? 'active' : ''}` },
                el('div', { className: 'task-content', title: t }, t),
                el('button', { className: 'auto-btn danger icon', style: 'border:none;', onclick: () => { state.tasks.splice(i,1); renderUI(); } }, '✖')
            );
            qList.append(item);
        });

        aList.replaceChildren();
        state.archives.slice(0, 5).forEach((t, i) => {
            const item = el('div', { className: 'task-item', style: 'font-size: 11px;' },
                el('div', { className: 'task-content', title: t }, t),
                el('div', {style: 'display:flex; gap: 4px;'},
                    el('button', { className: 'auto-btn outline icon', title: '重新加入队列', onclick: () => {
                        state.tasks.push(t); state.archives.splice(i,1); renderUI();
                    }}, '➕'),
                    el('button', { className: 'auto-btn danger icon', style: 'border:none;', onclick: () => { state.archives.splice(i,1); renderUI(); } }, '✖')
                )
            );
            aList.append(item);
        });
    }

    let isDragging = false, offsetX, offsetY;
    header.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON' || panel.classList.contains('minimized')) return;
        isDragging = true;
        const rect = panel.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.margin = '0';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        panel.style.left = `${e.clientX - offsetX}px`;
        panel.style.top = `${e.clientY - offsetY}px`;
    });
    document.addEventListener('mouseup', () => isDragging = false);

    function mountPanel() {
        if (!document.getElementById('auto-panel')) {
            document.body.appendChild(panel);
            updateRunBtnUI();
            renderUI();
        }
    }
    setInterval(mountPanel, 1500);
    mountPanel();
})();