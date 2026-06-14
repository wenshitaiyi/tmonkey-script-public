// ==UserScript==
// @name         Gemini Auto Task Panel
// @namespace    http://tampermonkey.net/
// @version      3.7.0
// @description  独立标签页运行、剪贴板导入导出、布局防挤压、状态栏固顶、防抖判定（完美适配2026最新Gemini富文本输入框与全平台Unicode图标）
// @author       wenshitaiyi
// @match        *://gemini.google.com/*
// @grant        GM_addStyle
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/wenshitaiyi/tmonkey-script-public/main/gemini-auto-task.js
// @updateURL    https://raw.githubusercontent.com/wenshitaiyi/tmonkey-script-public/main/gemini-auto-task.js
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 1. 核心配置与选择器（根据最新HTML特征重构）
    // ==========================================
    const CONFIG = {
        selectors: {
            // 优先匹配最新版包含 ql-editor 和 textarea 类的可编辑div
            textareaCandidates: [
                'div.ql-editor.textarea',
                '[data-test-id="textarea-inner"] [contenteditable="true"]'
            ],
            // 发送按钮：直接锁定代表可提交状态的 .submit 类或 aria-label
            sendBtn: 'gem-icon-button.send-button.submit, button[aria-label="发送"]',
            // 容器判定：获取整个容器，用来辅助判定生命周期
            sendContainer: '[data-test-id="send-button-container"]',
            // 正在生成指示器：精确锁定带有 .stop 类的按钮，或内含 stop 属性的 mat-icon
            generatingIndicator: 'gem-icon-button.send-button.stop, mat-icon[fonticon="stop"], button[aria-label="停止回答"]'
        },
        pollInterval: 1000,
        cooldownRange: [4, 8],
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

    // 动态查找符合有效性验证的输入框
    function findValidTextarea() {
        for (const selector of CONFIG.selectors.textareaCandidates) {
            const elements = document.querySelectorAll(selector);
            for (const el of Array.from(elements)) {
                // 1. 隔离安全区：排除脚本自身面板内部的输入框
                if (el.closest('#auto-panel')) continue;

                // 2. 增强版可见性校验：规避新版布局中 offsetParent 为 null 的特例坑
                const rect = el.getBoundingClientRect();
                const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
                if (!isVisible) continue;

                // 3. 核心特征判定
                const isEditable = el.getAttribute('contenteditable') === 'true';
                const isTextAreaTag = el.tagName === 'TEXTAREA' || el.classList.contains('ql-editor');

                if (isEditable || isTextAreaTag) {
                    return el;
                }
            }
        }
        return null;
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

            const textarea = findValidTextarea();
            const sendBtn = document.querySelector(CONFIG.selectors.sendBtn);
            const isGenerating = document.querySelector(CONFIG.selectors.generatingIndicator);

            switch (this.step) {
                case 'IDLE':
                    // 1. 优先使用最新特征判定 AI 是否正在生成
                    if (isGenerating) {
                        this.setStatus('🤖 AI 正在生成，等待结束...');
                        return;
                    }
                    // 2. 闲置阶段只需确保输入框挂载成功即可，解耦发送按钮的初始化强绑定
                    if (!textarea) {
                        this.setStatus('⚠️ 找不到聊天输入框');
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
                    // 3. 将发送按钮的捕获移到此阶段。文字填入后，Angular 框架通常需要时间响应渲染并挂载按钮
                    const activeSendBtn = document.querySelector(CONFIG.selectors.sendBtn);

                    if (!activeSendBtn) {
                        this.setStatus('⏳ 框架同步中，等待发送按钮挂载...');
                        // 密集派发 input 事件，强行激活 Angular 的变更检测机制以挂载按钮
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                        return;
                    }

                    this.setStatus('🚀 发送！');
                    // 兼容处理：触发外层组件点击，若有原生内层 button 则优先点击内层
                    const nativeBtn = activeSendBtn.querySelector('button') || activeSendBtn;
                    nativeBtn.click();

                    // 维护任务队列状态
                    const doneTask = state.tasks.shift();
                    state.archives.unshift(doneTask);
                    if (state.archives.length > 50) state.archives.pop();

                    renderUI();

                    this.replyWaitTimer = 0;
                    this.replyIdleTimer = 0;
                    this.hasStartedGenerating = false;
                    this.step = 'WAITING_REPLY';
                    break;

                case 'WAITING_REPLY':
                    // 核心修改：通过判断是否存在具有 .stop 类的按钮或特定标签来作为 Busy 信号
                    const isBusy = !!isGenerating;

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

        // 针对新版 ql-editor 富文本容器，必须清理内部结构并更新 innerText
        if (element.getAttribute('contenteditable') === 'true' || element.classList.contains('ql-editor')) {
            element.innerText = text;
            // 针对某些极端的双向绑定，强行对内部段落进行二次兜底
            const innerP = element.querySelector('p');
            if (innerP) innerP.innerText = text;
        } else {
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
            if (nativeSetter) nativeSetter.call(element, text);
            else element.value = text;
        }

        // 派发整套合成事件，冲破底层 Angular 的状态缓存
        element.dispatchEvent(new Event('compositionstart', { bubbles: true }));
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('compositionend', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ', keyCode: 32 }));

        return true;
    }

    setInterval(() => engine.tick(), CONFIG.pollInterval);

    // ==========================================
    // 4. 原生 UI 构建
    // ==========================================
    GM_addStyle(`
        #auto-panel { position: fixed; top: 20px; right: 20px; width: 340px; background: #fff; border: 1px solid #ccc; box-shadow: 0 8px 24px rgba(0,0,0,0.2); border-radius: 8px; z-index: 999999; font-family: sans-serif; font-size: 13px; color: #333; display: flex; flex-direction: column; max-height: 85vh; resize: both; overflow: hidden; transition: width 0.3s, height 0.3s; }
        #auto-panel.minimized { width: 40px !important; height: 40px !important; resize: none; border-radius: 8px 0 0 8px; overflow: hidden; right: 0 !important; left: auto !important; transition: all 0.3s; }
        #auto-panel.minimized #auto-body { display: none; }
        #auto-panel.minimized #auto-header-title, #auto-panel.minimized #toggle-run-btn { display: none; }
        #auto-panel.minimized #dock-btn { width: 100%; height: 100%; border-radius: 0; }

        #auto-header { flex-shrink: 0; padding: 10px; background: #f8f9fa; border-bottom: 1px solid #ddd; cursor: move; display: flex; justify-content: space-between; align-items: center; user-select: none; }
        #auto-body { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
        #auto-status-text { flex-shrink: 0; background: linear-gradient(90deg, #e8f0fe, #d2e3fc); color: #1967d2; padding: 8px 10px; font-weight: bold; text-align: center; border-bottom: 1px solid #c2e7ff; box-shadow: 0 2px 4px rgba(0,0,0,0.05); text-shadow: 0 1px 1px rgba(255,255,255,0.5); font-size: 12px;}
        #auto-input-section { flex-shrink: 0; padding: 10px; background: #fff; border-bottom: 1px solid #eee; z-index: 1;}
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

    // 初始化最小化控制按钮：默认展开状态，显示朝下的全角几何箭头 ▼ 提示可收起
    const dockBtn = el('button', {
        id: 'dock-btn',
        className: 'auto-btn outline icon',
        onclick: toggleDock,
        title: '折叠/展开面板'
    }, '▼');

    const toggleRunBtn = el('button', { id: 'toggle-run-btn', className: 'auto-btn success', onclick: toggleRun }, '开始执行');
    const headerTitle = el('span', { id: 'auto-header-title', style: 'font-weight:bold;' }, '🚀 AI 自动化');
    const header = el('div', { id: 'auto-header' }, headerTitle, el('div', {style: 'display:flex; gap: 8px;'}, toggleRunBtn, dockBtn));

    const statusBar = el('div', { id: 'auto-status-text' }, engine.statusText);

    const taskInput = el('textarea', {
        id: 'auto-task-input',
        placeholder: '输入任务。\n• 单个任务：直接点【添加任务】\n• 批量任务：任务间独占一行输入 /***********/ (至少10个*)，点【批量添加】'
    });

    const addBtn = el('button', { className: 'auto-btn', style: 'flex:1;', onclick: () => addTask(false) }, '添加任务');
    const addBatchBtn = el('button', { className: 'auto-btn outline', onclick: () => addTask(true) }, '按分隔符批量添加');
    const inputArea = el('div', { style: 'display:flex; gap:5px;' }, addBtn, addBatchBtn);

    const inputSection = el('div', { id: 'auto-input-section' }, taskInput, inputArea);

    const qHeader = el('div', { className: 'section-header' },
        el('span', {}, '待执行队列 (', el('span', {id: 'q-count'}, '0'), ')'),
        el('div', { className: 'btn-group' },
            el('button', { className: 'auto-btn outline icon', onclick: () => exportToClipboard(state.tasks, '任务队列') }, '📋 复制'),
            el('button', { className: 'auto-btn danger icon', onclick: () => { if(confirm('清空队列？')){ state.tasks = []; renderUI(); } } }, '✖ 清空')
        )
    );
    const qList = el('div', { className: 'task-list' });

    const aHeader = el('div', { className: 'section-header', style: 'margin-top: auto;' },
        el('span', {}, '已归档记录'),
        el('div', { className: 'btn-group' },
            el('button', { className: 'auto-btn outline icon', onclick: () => exportToClipboard(state.archives, '归档记录') }, '📋 复制'),
            el('button', { className: 'auto-btn danger icon', onclick: () => { if(confirm('清空归档？')){ state.archives = []; renderUI(); } } }, '✖ 清空')
        )
    );
    const aList = el('div', { className: 'task-list', style: 'opacity: 0.8;' });

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
        // 最小化状态动态切换：收起时指向 ▼ 提示可向上展开，展开时指向 ▲
        dockBtn.textContent = panel.classList.contains('minimized') ? '▼' : '▲';
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
        state.archives.forEach((t, i) => {
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