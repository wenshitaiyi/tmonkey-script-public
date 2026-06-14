// ==UserScript==
// @name         Novel Download
// @namespace    http://tampermonkey.net/
// @version      1.1.1
// @description  小说下载，个人测试使用，主要是为了熟悉js的语法（测试更新）
// @author       You
// @match        https://www.xbiquge.bz/book/*
// @match        https://hongxiue.com/*
// @match        https://hongxiuf.com/*
// @match        https://ixunshu.net/xs/*
// @match        https://www.493d.com/book/*
// @match        http://www.xuanshu.org/book/*
// @match        http://www.99xs.net/book/*
// @match        https://gongzicp.com/novel-*
// @match        https://www.99xs.net/book/*
// @match        https://www.zhenhunxiaoshuo.com/*
// @match        https://zuqus.cc/txt/*
// @match        https://www.jiqinw.com/*
// @match        https://www.52shuku.vip/*
// @match        https://www.xbanxia.cc/books/*
// @match        https://www.kaye-ge.com/index/*
// @match        https://www.220book.com/book/*
// @match        https://www.ryhy.net/article/*
// @match        https://www.wtksm.com/novel/*
// @match        https://www.ynfdkj.com/biquge/*
// @match        https://www.82xs.com/bqg/*
// @match        https://www.82xs.com/index/*
// @match        https://3tb4weatuybs.blog.fc2.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ixunshu.net
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @license      MIT
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.3/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.0.0/crypto-js.min.js
// @require      https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.js
// @downloadURL  https://raw.githubusercontent.com/wenshitaiyi/tmonkey-script-public/main/novel-download.js
// @updateURL    https://raw.githubusercontent.com/wenshitaiyi/tmonkey-script-public/main/novel-download.js
// ==/UserScript==

//说明：
//1、如果某个网站的脚本不能生效了，可能是因为在补充新网站之后导致的不兼容，重新调整脚本即可
//2、对于某些网站，需要用户手动做一些操作：自动展开所有章节、手动多次批量下载
//3、需要解密、反爬的网站越来越多，这种js脚本爬虫的形式可能逐渐不适用
//4、可以捐赠

var g_chapterURLList = [];      //全部章节列表
var g_paragraphList = [];       //段落内容列表 [临时变量] 所有的段落和在一起就是一本书
var g_chapterList = [];         //章节内容列表
var g_bTestDownload = false;    //是否测试下载
var g_bTestGetChapter = false;  //是否测试获取章节
var g_iTestDownloadCnt = 1;     //测试下载章节数
var g_handleCnt = 0;            //已经处理的总数
var g_chapterPromises = [];     //批量处理队列
var g_iMaxPromiseCount = 5;     //批次处理总数
var g_needSleep = false;        //是否需要睡眠
var g_sleepTime = 3000;         //单次睡眠时间
var g_resmap = new Map();       //结果集，是一个过程量
var g_ctrlMap = new Map();      //控制类型的map
var g_replaceMap = new Map();   //用来进行替换的map
var g_proxysites = [];          //代理网站
var g_proxysiteUseIndex = 0;    //当前使用的代理网站
var g_startDownloadIndex = 0;   //开始下载的索引
var g_downloadCount = -1;       //下载的数量
var g_batchSleep = 3;           //批次处理之后的睡眠时间


//小说基础信息
const rule_isBookMainPage = 'rule_isBookMainPage';                                  //网址检测，判断是是否为书籍主页
const rule_appendDownloadBtn = 'rule_appendDownloadBtn';                            //添加下载按钮
const rule_novelSaveName = 'rule_novelSaveName';                                    //获取小说名称、作者名称

//章节列表
const rule_getChapterListMode = 'rule_getChapterList';                                  //获取章节列表的类型 新页面获取 or 当前页面获取
const rule_getChapterListFromCurPage = 'rule_getChapterListFromCurPage';                //从当前页获取章节列表
const rule_getChapterListPageUrl = 'rule_getChapterPageUrl';                            //新页面获取章节列表时，获取新页面的链接
const rule_getChapterListNextPage = 'rule_getNextChapterPage';                          //章节列表有多页时，获取下一页
const rule_getChapterListContainer = 'rule_getChapterListContainer';                    //获取章节列表的容器
const rule_getChapterListFromContainer = 'rule_getPartListFromCointer';                 //章节列表有多页时，获取其中一页的列表
const rule_getChapterListCustom = 'rule_getChapterListCustom';                          //自定义获取章节列表的方式

//获取章节
const rule_getChapterContentMode = 'rule_getChapterContent';                            //获取章节内容的类型 多页 or 一页
//fun_getChapterContenFromOnePage
const rule_getChapterTitle = 'rule_getChapterTitle';                                //获取某一章的标题
const rule_getChapterContentContainer = 'rule_getChapterContentContainer';          //获取章节内容主体容器
const rule_getChapterLinesFromContainer = 'rule_getChapterListContentFromContainer'; //从主体容器中获取所有的段落
//fun_getChapterContentFromOnePageWithJsonResponse
const rule_getChapterContentPageCustom = 'rule_getContentPage';                     //自定义请求获取章节内容的方式 （专门用来进行特殊处理的）
const rule_getChapterTitleFromJson = 'rule_getChapterTitleFromJson';                //获取某一章的标题
const rule_getChapterLinesFromJson = 'rule_getChapterContentFromJson';              //从主体容器中获取所有的段落
//fun_getChapterContenPageByPage（这种默认是不支持json形式的）
const rule_checkFirstChapterPage = 'rule_checkFirstChapterPage';                    //如果一章很多页，判断是否为第一页
const rule_getNextChapterPage = 'rule_getChapterNextPage';                          //一章内容有多页，获取下一页的链接
//fun_getChapterContentFromOnePageCustom 自定义模式，对于一些特殊规则的网站而言
const rule_getChapterContentFromOnePageCustomImpl = 'rule_getChapterContentFromOnePageCustomImpl';//完全放开


//其他配置
const rule_chapterContentDecoder = 'rule_chapterContentDecoder';                    //内容解码器
const rule_filterTxt = 'rule_filterTxt';                                            //文本过滤


//睡眠一段时间
function fun_sleep(ms) {
return new Promise(resolve => setTimeout(resolve, ms));
}

//从内容中获取文本
function fun_getContentFromHTML($data)
{
    let rfun_getChapterContentContainer = g_ctrlMap.get(rule_getChapterContentContainer);
    let rfun_getChapterContentFromContainer = g_ctrlMap.get(rule_getChapterLinesFromContainer);
    let rfun_filterTxt = g_ctrlMap.get(rule_filterTxt);
    // 获取 id 为 "booktxt" 的 div 元素
    var $container = rfun_getChapterContentContainer($data);

    // 如果未找到对应的 div，则提示错误并返回空字符串
    if (!$container.length) {
        console.log("不能从当前页面获取到章节主体");
        throw new error('error 不能从当前页面获取到章节主体');
    }

    let lines = rfun_getChapterContentFromContainer($container);

    //文本合并，并且检测是否需要过滤
    let txt = lines.join('\n');
    if(rfun_filterTxt !== undefined)
    {
        txt = rfun_filterTxt(txt);
    }
    return txt;
}


//这里有个问题，这个框架实际上并没有被抽象出来，基本上还是得按需调整
// 获取每一章的内容 一页一页的获取
async function fun_getChapterContenPageByPage(url) {
    console.log("正在获取章节内容：" + url);
    let rfun_decoder = g_ctrlMap.get(rule_chapterContentDecoder);
    let rfun_getChapterTitle = g_ctrlMap.get(rule_getChapterTitle);
    let rfun_checkFirstChapterPage = g_ctrlMap.get(rule_checkFirstChapterPage);
    let rfun_getChapterNextPageUrl = g_ctrlMap.get(rule_getNextChapterPage);

    try {
        // 发送 HTTP 请求并等待响应
        const response = await fetch(url);
        $data = $();
        if(rfun_decoder !== undefined){
            const gbkData = await response.arrayBuffer();
            const decoder = rfun_decoder();
            const data = decoder.decode(gbkData);
            $data = $(data);
        }
        else{
            const data = await response.text();
            $data = $(data);
        }

        //定义一个临时变量，最终需要返回
        var paragraphList = [];

        //如果是第一页，就应该写入章节信息
        if(rfun_checkFirstChapterPage(url)){
            let chapterTitle = rfun_getChapterTitle($data);
            if(chapterTitle.length > 0)
            {
                paragraphList.push("");
                paragraphList.push(chapterTitle); //TODO 暂时不处理章节名称
                paragraphList.push("");
            }
        }

        // 获取当前页面的小说内容
        var content = fun_getContentFromHTML($data);

        // 将当前页面的小说内容存储到数组中
        paragraphList.push(content);

        let nexpagetUrl = rfun_getChapterNextPageUrl($data);

        if(nexpagetUrl.length > 0)
        {
            console.log("存在下一页，继续获取：", nexpagetUrl);
            var nextContentList = await fun_getChapterContenPageByPage(nexpagetUrl); // 使用 await 等待递归调用完成
            paragraphList = paragraphList.concat(nextContentList);
        }
        else{
            console.log("已到达最后一页，停止获取内容。");
        }

        return paragraphList;
    } catch (error) {
        console.error("请求失败:", error);
        g_needSleep = true;
    }
}


//从指定页面获取完整的一页数据
async function fun_getChapterContenFromOnePage(url) {

    let rfun_decoder = g_ctrlMap.get(rule_chapterContentDecoder);
    let rfun_getChapterTitle = g_ctrlMap.get(rule_getChapterTitle);
    console.log("正在获取章节内容：" + url);
    try {
        //请求
        const response = await fetch(url);
        $data = $();
        if(rfun_decoder !== undefined){
            const gbkData = await response.arrayBuffer();
            const decoder = rfun_decoder();
            const data = decoder.decode(gbkData);
            $data = $(data);
        }
        else{
            const data = await response.text();
            $data = $(data);
        }

        let paragraphList = [];

        //章节头部
        let chapterTitle = rfun_getChapterTitle($data);
        if (chapterTitle.length > 0)
        {
            paragraphList.push("");
            paragraphList.push(chapterTitle); //TODO 暂时不处理章节名称
            paragraphList.push("");
        }

        //获取主体内容
        var content = fun_getContentFromHTML($data);
        paragraphList.push(content);
        return paragraphList;
    } catch (error) {
        console.error("请求失败:", error);
        g_needSleep = true;
    }
}

//对于json的这种情况，已经不能做到通用了，每个网站的都不一样，甚是难受，如果只有一页的话，直接写一个custom类型的应该也可以的
async function fun_getChapterContentFromOnePageWithJsonResponse(url)
{
    let rfun_getChapterTitleFromJson = g_ctrlMap.get(rule_getChapterTitleFromJson);
    let rfun_getChapterContentFromJson = g_ctrlMap.get(rule_getChapterLinesFromJson);
    let rfun_getChapterContentPageCustom = g_ctrlMap.get(rule_getChapterContentPageCustom);
    try{
        let jsonObj;
        //请求
        if(rfun_getChapterContentPageCustom !== undefined)
        {
            jsonObj = await rfun_getChapterContentPageCustom(url);
        }
        else
        {
            const response = await fetch(url);
            // 检查response.ok是否为true，以确保请求成功
            if (!response.ok) {
                throw new Error('网络响应失败');
            }

            // 解析JSON数据
            jsonObj = await response.json();
        }


        let paragraphList = [];

        //章节头部
        let chapterTitle = rfun_getChapterTitleFromJson(jsonObj);
        if (chapterTitle.length > 0)
        {
            paragraphList.push("");
            paragraphList.push(chapterTitle); //TODO 暂时不处理章节名称
            paragraphList.push("");
        }

        //获取主体内容
        let content = rfun_getChapterContentFromJson(jsonObj);

        paragraphList.push(content);
        return paragraphList;
    } catch (error){
        console.error("请求失败:", error);
        g_needSleep = true;
    }
}

//自定义的从指定网页获取小说内容的函数，用户需要实现inner
//由于内部可
async function fun_getChapterContentFromOnePageCustom(url)
{
    let rfun_getChapterContentFromOnePageCustomImpl = g_ctrlMap.get(rule_getChapterContentFromOnePageCustomImpl);
    try{

        let paragraphList = [];
        paragraphList = await rfun_getChapterContentFromOnePageCustomImpl(url);
        return paragraphList;

    } catch (error){
        console.error("请求失败:", error);
        g_needSleep = true;
    }
}


async function fun_getChapterContentPromise(url)
{
    return new Promise(async (resolve, reject) => {
        try {
            let rfun_getChapterContent = g_ctrlMap.get(rule_getChapterContentMode);
            var contentList = await rfun_getChapterContent(url);
            const resultMap = new Map();
            resultMap.set(url, contentList);
            resolve(resultMap);
            g_handleCnt += 1;
            console.log("进度："+g_handleCnt+"/"+g_chapterURLList.length);
        } catch (error) {
            reject(error);
        }
    });

}

//获取章节列表
async function fun_getChapterListPBP(url)
{
    let rfun_getChapterContainer = g_ctrlMap.get(rule_getChapterListContainer);
    let rfun_getPartListFromContainer = g_ctrlMap.get(rule_getChapterListFromContainer);
    let rfun_getNextChapterPage = g_ctrlMap.get(rule_getChapterListNextPage);

    console.log("正在获取章节列表: "+url);
    try {
        // 发送 HTTP 请求并等待响应
        const response = await fetch(url);
        const data = await response.text();
        const $data = $(data);


        // 找到章节链接所在的元素s
        const $chapterContainer = rfun_getChapterContainer($data);
        rfun_getPartListFromContainer($chapterContainer);


        //不需要获取下一页
        if(rfun_getNextChapterPage === undefined){
            return;
        }

        //直接获取下一页链接
        let nextPageUrl = rfun_getNextChapterPage($data);
        if(nextPageUrl.length > 0){
            if(url.includes(nextPageUrl))
            {
                // 输出章节列表
                console.log("所有章节链接获取完毕。下一页和当前页重合！！");
            } else {
                await fun_getChapterListPBP(nextPageUrl);
            }
        } else {
            // 输出章节列表
            console.log("所有章节链接获取完毕。");
        }
    } catch (error) {
        console.error("请求失败:", error);
    }
}

async function fun_getChapterListFromNewPage()
{
    let rfun_getChapterPageUrl =  g_ctrlMap.get(rule_getChapterListPageUrl);
    let chapterURL = rfun_getChapterPageUrl();
    if (chapterURL.length === 0) {
        console.log("无法获取到章节列表页");
        return;
    }

    await fun_getChapterListPBP(chapterURL);
}

async function fun_getChapterListCustom()
{
    let rfun_getChapterListCustomImpl = g_ctrlMap.get(rule_getChapterListCustom);
    await rfun_getChapterListCustomImpl();
}

//从当前页面获取所有的章节（这里这样写出来，只是为了让逻辑看上去清晰）
async function fun_getChapterListFromCurPage()
{
    let rfun_getChapterListFromCurPage = g_ctrlMap.get(rule_getChapterListFromCurPage);
    rfun_getChapterListFromCurPage();
}


//获取小说下载的名称
function fun_getNovelSaveName() {
    let iarr_noveSaveNamefuns = g_ctrlMap.get(rule_novelSaveName);
    var bookTitle = iarr_noveSaveNamefuns[0]();
    var author = iarr_noveSaveNamefuns[1]();
    var originalBookName = '《' + bookTitle + '》作者：' + author;
    var optimizedBookName = originalBookName.replace(/[!@#$%^&*()+\=\[\]{};':"\\|,.<>\/?]/g, 'x');

    return {
        originalBookName: bookTitle,
        author: author,
        optimizedBookName: optimizedBookName
    };
}

//并行的获取一批数据
async function fun_PromiseHandle(resmap)
{
    try {
        const resultArray = await Promise.all(g_chapterPromises);
        // console.log(resultArray);
        // 这里可以继续处理resultMap
        resultArray.forEach((tempMap) => {
            tempMap.forEach((value,key) => {
                resmap.set(key, value);
            });
        });
    } catch (error) {
        console.error('Error fetching chapter content:', error);
    }
    g_chapterPromises = [];
}

//遍历章节列表，逐步下载小说内容 //这里是可以调整的，使用Promise并发的进行请求
async function fun_downloadChapterUrlList(chapterList)
{
let bInterrupt = false;
    for (let i = 0; i < chapterList.length; i++)
    {
        let url = chapterList[i];
        let p = fun_getChapterContentPromise(url);
        g_chapterPromises.push(p);
        if(g_chapterPromises.length >=g_iMaxPromiseCount)
        {
            await fun_PromiseHandle(g_resmap);

            if(g_batchSleep > 0)
            {
                console.log("批处理结束，睡眠"+g_batchSleep+"秒...");
                await fun_sleep(g_sleepTime);
                console.log("睡眠结束！");
            }
        }

        if(g_needSleep)
        {
            console.log("过程中出现错误，睡眠"+ g_sleepTime +"秒...");
            await fun_sleep(g_sleepTime);
            g_needSleep = false;
            console.log("睡眠结束！");
        }

        if(g_bTestDownload && i>=(g_iTestDownloadCnt-1))
        {
            bInterrupt = true;
            break;
        }


    }

    //需要再执行一次，保证余下的
    await fun_PromiseHandle(g_resmap);

    let failedList = [];

    //如果中断直接退出执行
    if(bInterrupt)
    {
        g_chapterURLList.forEach((url)=>{
            const dataArray = g_resmap.get(url);
            if(dataArray === undefined)
                return;

            dataArray.forEach((d)=>{
                g_paragraphList.push(d);
            });
        });
        return failedList;
    }



    g_chapterURLList.forEach((url)=>{
        const dataArray = g_resmap.get(url);
        if(dataArray === undefined)
        {
            failedList.push(url);
            return;
        }
        dataArray.forEach((d)=>{
            g_paragraphList.push(d);
        });
    });


    if(failedList.length !=0)
        g_paragraphList = [];

    return failedList;
}

//下载小说
async function fun_downloadNovel()
{
    //清空存储容器
    g_chapterURLList = [];
    g_chapterList = [];
    g_paragraphList = [];
    g_resmap = new Map();
    g_handleCnt = 0;

    let g_bookHeader = [];
    console.log("正在下载小说...");


    if(!g_ctrlMap.has(rule_novelSaveName))
    {
        console.log("没有书籍保存的规则，无法下载");
        return;
    }
    //获取保存的文件名称
    let novelInfo = fun_getNovelSaveName();
    console.log("书籍名称："+novelInfo.optimizedBookName);

    //插入下载信息
    g_bookHeader.push("书名：" + novelInfo.originalBookName);
    g_bookHeader.push("作者：" + novelInfo.author);
    g_bookHeader.push("地址：" + window.location.href);
    g_bookHeader.push("下载：雯饰太一");
    g_bookHeader.push("形式：网页插件");
    g_bookHeader.push("说明：数据为网页爬取而来，作者写作不易，请尊重正版原创");
    g_bookHeader.push("");
    g_bookHeader.push("");

    //获取章节列表
    //有两种情况
    //1、从当前页面获取章节列表（完整列表、循环获取）
    //2、从新页面获取章节列表（完整列表、循环获取）

    if(!g_ctrlMap.has(rule_getChapterListMode)){
        console.log("没有获取章节列表的规则，无法下载");
        return;
    }
    let rfun_getChapterList =  g_ctrlMap.get(rule_getChapterListMode);
    await rfun_getChapterList();

    if (g_chapterURLList.length == 0){
        console.log("章节列表为空，取消下载任务")
        return;
    }
    else{
        console.log("章节总数：\n"+g_chapterURLList.length);
    }

    if(g_bTestGetChapter)
    {
        console.log('当前为测试模式，不继续执行');
        return;
    }

    if(g_startDownloadIndex>0)
    {
        if(g_downloadCount == -1)
            g_chapterURLList = g_chapterURLList.slice(g_startDownloadIndex,g_chapterURLList.length);
        else
            g_chapterURLList = g_chapterURLList.slice(g_startDownloadIndex,g_startDownloadIndex+g_downloadCount);
        console.log('Start download from ' + g_startDownloadIndex);
        console.log("章节总数：\n"+g_chapterURLList.length);
    }

    failedList = g_chapterURLList;
    let iDownloadBatch = 1;
    while(failedList.length!=0)
    {
        console.log("当前下载批次："+iDownloadBatch);
        failedList = await fun_downloadChapterUrlList(failedList);
        iDownloadBatch += 1;
    }

    //内容拼接
    let allContents = g_bookHeader.join('\n') + g_paragraphList.join('\n');

    // 计算内容大小
    let contentSizeKB = (new Blob([allContents])).size / 1024; // 转换为 KB
    let contentSizeMB = contentSizeKB / 1024; // 转换为 MB

    // 输出内容大小
    if (contentSizeMB >= 1) {
        console.log("内容大小:", contentSizeMB.toFixed(2) + " MB");
    } else {
        console.log("内容大小:", contentSizeKB.toFixed(2) + " KB");
    }

    //将内容下载为文件
    let blob = new Blob([allContents], { type: "text/plain;charset=utf-8" });
    saveAs(blob, novelInfo.optimizedBookName+".txt");
}

//插入下载按钮
function fun_insertDownloadBtn(ifun_appendfun) {
    // 设置按钮的id为'local_download_btn'
    if(ifun_appendfun === null)
    {
        return false;
    }
    return ifun_appendfun(newButton);
}

//判断是否为需要匹配的网址
function fun_checkWebset(url,regStr)
{
    let regex = new RegExp(regStr);
    return regex.test(url);
}

//[bool]ifun_isMainPage:是否需要二次判断，当前页面是否需要插入下载按钮
//[bool]ifun_appendfun:插入下载按钮的方式，不同的页面可能在前面或者后面进行插入
function fun_downloadConfig()
{
    let rfun_isBookMakePage = g_ctrlMap.get(rule_isBookMainPage);
    //step1 是否需要插入下载按钮
    if(rfun_isBookMakePage !== undefined){
        if(!rfun_isBookMakePage()){
            console.log("不是书籍主页，脚本不生效！");
            return;
        }
    }

    let rfun_appendDownloadBtn = g_ctrlMap.get(rule_appendDownloadBtn);

    //step2 插入下载按钮
    if(rfun_appendDownloadBtn === undefined){
        console.log("没有下载按钮插入规则，无法下载");
        return;
    }
    else{
        let newButton = $('<button id="local_download_btn">下载书籍</button>');
        if(!rfun_appendDownloadBtn(newButton))
        {
            console.log("无法插入下载按钮");
            return;
        }
    }

    //step3 绑定下载事件
    $('#local_download_btn').click(function() { // 使用按钮的id来绑定点击事件
        fun_downloadNovel();
    });
}

(function() {
    'use strict';

    // Your code here...
    let url = window.location.href;
    console.log(url);

    //下面匹配不同的网址

    //[新笔趣阁](https://www.xbiquge.bz/)
    if(fun_checkWebset(url,'https://www.xbiquge.bz/book/[0-9]*/')){
        //插入按钮
        g_ctrlMap.set(rule_appendDownloadBtn, function(newButton){
            $('.box_con').append(newButton);
            return true;
        });

        //获取书名
        g_ctrlMap.set(rule_novelSaveName,[
            function(){return $('meta[property="og:novel:book_name"]').attr('content');},
            function(){return $('meta[property="og:novel:author"]').attr('content');}
        ]);

        //获取章节列表
        g_ctrlMap.set(rule_getChapterListMode,fun_getChapterListFromCurPage);
        g_ctrlMap.set(rule_getChapterListFromCurPage,function(){
            let dtCnt = 0;
            $('#list dl').children().each(function() {
                var tagName = this.tagName.toLowerCase();
                if (tagName === 'dt') dtCnt+=1;
                if (dtCnt >= 2){
                    var url = $(this).find('a').attr('href');
                    if(url){
                        g_chapterURLList.push(url);
                    }
                }
            });
        });

        //获取每一章的内容
        g_ctrlMap.set(rule_getChapterContentMode,fun_getChapterContenFromOnePage);
        g_ctrlMap.set(rule_chapterContentDecoder,function(){return new TextDecoder("gbk");})
        g_ctrlMap.set(rule_getChapterTitle,function($data){return $data.find('.bookname h1:first').text();});
        g_ctrlMap.set(rule_getChapterContentContainer,function($data){return $data.find('#content');});
        g_ctrlMap.set(rule_getChapterLinesFromContainer,function($container){
            let lines = [];
            $container.contents().each(function() {
                // 检查当前节点是否是文本节点
                if (this.nodeType !== Node.TEXT_NODE) return;
                let txt = this.textContent.trim();
                if (txt !== "") {
                    lines.push(txt);
                }
            });
            return lines;
        });
    }
    //[爱寻书](https://ixunshu.net)
    else if(fun_checkWebset(url,'https://ixunshu.net/xs/[0-9]*')){
        //插入按钮
        g_ctrlMap.set(rule_appendDownloadBtn, function(newButton){
            $('.readbtn').append(newButton);
            return true;
        });

        //获取书名
        g_ctrlMap.set(rule_novelSaveName,[
            function(){return $('#info h1').text().trim();},
            function(){return $('#info p:contains("作者：")').text().trim().replace('作者：', '');}
        ]);

        //获取章节列表
        g_ctrlMap.set(rule_getChapterListMode,fun_getChapterListFromNewPage);
        g_ctrlMap.set(rule_getChapterListPageUrl,function(){
            return $($('a[rel="chapter"] dt:contains("点击查看全部章节目录")')[0]).parent().attr('href');
        });
        g_ctrlMap.set(rule_getChapterListContainer,function($data){ return $data.find('#content_1'); });
        g_ctrlMap.set(rule_getChapterListFromContainer,function($container){
            $container.find('a[rel="chapter"]').each(function() {
                let chapterLink = $(this).attr('href');
                g_chapterURLList.push(chapterLink);
            });
        });
        g_ctrlMap.set(rule_getChapterListNextPage,function($data){
            const $nextPageBtn = $data.find('.index-container-btn:contains("下一页")');
            if ($nextPageBtn.length) {
                return nextPageBtn.attr('href');
            }
            return "";
        });

        //获取每一章的内容
        g_ctrlMap.set(rule_getChapterContentMode,fun_getChapterContenPageByPage);
        g_ctrlMap.set(rule_getChapterTitle,function($data){
            let sixthChild = $data.find('.con_top').contents()[6];
            let chapterTitle = "";
            if (sixthChild.nodeType === Node.TEXT_NODE && sixthChild.nodeValue.length >= 3) {
                chapterTitle = sixthChild.nodeValue.substring(3);
            }
            return chapterTitle;
        });
        g_ctrlMap.set(rule_checkFirstChapterPage,function(url){return !(/page=/.test(url));})
        g_ctrlMap.set(rule_getNextChapterPage,function($data){
            const $nextPageBtn = $data.find('a[rel="prev"]:contains("下一页")');
            if($nextPageBtn.length)
            {
                return nextPageBtn.attr('href');
            }
            return '';
        });
        g_ctrlMap.set(rule_getChapterContentContainer,function($data){return $data.find('#booktxt');});
        g_ctrlMap.set(rule_getChapterLinesFromContainer,function($container){
            let lines = [];
            $container.find('p').each(function()
            {
                const $t = $(this);
                if($t.find('a').length !=0) return;
                let txt = $t.text().trim();
                if(txt === "") return;
                if(txt === ": ") return;
                lines.push(txt);
            });
            return lines;
        });
    }
    //[红袖招](https://hongxiue.com/) [红袖招](https://hongxiuf.com/)
    else if(fun_checkWebset(url,'https://hongxiuf.com/*') || fun_checkWebset(url,'https://hongxiue.com/*'))
    {
        //定义过滤的规则
        g_replaceMap = new Map([
            ['\uE290','操'],['\uE291','嫩'],['\uE292','扭'],['\uE293','揉'],['\uE294','硬'],['\uE295','奸'],['\uE296','吸'],['\uE297','处'],['\uE298','道'],['\uE299','毛'],['\uE29A','捅'],['\uE29B','催'],['\uE29C','身'],['\uE29D','捏'],['\uE29E','芭'],['\uE29F','股'],['\uE2A0','搞'],['\uE2A1','喘'],['\uE2A2','翻'],['\uE2A3','握'],['\uE2A5','入'],['\uE2A7','翘'],['\uE2A8','迷'],['\uE2A9','嘴'],['\uE2AA','扒'],['\uE2AB','摸'],['\uE2AC','抽'],['\uE2AD','耻'],['\uE2AE','裸'],['\uE2AF','弄'],['\uE2B0','臀'],['\uE2B1','腹'],['\uE2B2','鸡'],['\uE2B3','肉'],['\uE2B4','粗'],['\uE2B5','肤'],['\uE2B6','挺'],['\uE2B7','流'],['\uE2B8','淫'],['\uE2B9','唇'],['\uE2BA','下'],['\uE2BB','头'],['\uE2BC','插'],['\uE2BD','舔'],['\uE2BE','湿'],['\uE2BF','屄'],['\uE2C0','纤'],['\uE2C1','阴'],['\uE2C2','脚'],['\uE2C3','射'],['\uE2C4','推'],['\uE2C5','精'],['\uE2C6','媚'],['\uE2C7','咬'],['\uE2C8','舐'],['\uE2C9','乳'],['\uE2CA','干'],['\uE2CB','抚'],['\uE2CC','欲'],['\uE2CD','钻'],['\uE2CE','潮'],['\uE2CF','做'],['\uE2D0','骚'],['\uE2D1','体'],['\uE2D2','房'],['\uE2D3','掏'],['\uE2D4','满'],['\uE2D5','阳'],['\uE2D6','叉'],['\uE2D7','性'],['\uE2D8','裤'],['\uE2D9','拔'],['\uE2DA','光'],['\uE2DB','茎'],['\uE2DC','丰'],['\uE2DD','含'],['\uE2DE','根'],['\uE2DF','浪'],['\uE2E0','色'],['\uE2E1','胸'],['\uE2E2','龟'],['\uE2E3','药'],['\uE2E4','漏'],['\uE2E5','痒'],['\uE2E6','顶'],['\uE2E7','尿'],['\uE2E8','荡'],['\uE2E9','勃'],['\uE2EA','情'],['\uE2EB','贪'],['\uE2EC','诱'],['\uE2ED','沟'],['\uE2EE','吻'],['\uE2EF','腿'],['\uE2F0','爱'],['\uE2F1','坚'],['\uE2F3','液'],['\uE2F4','女'],['\uE2F5','屁'],['\uE2F6','席'],['\uE2F7','穴'],['\uE2F8','白'],['\uE2F9','趴'],['\uE2FA','奶'],['\uE2FB','撩'],['\uE2FC','罩'],['\uE2FD','裙'],['\uE2FE','滑'],['\uE2FF','软'],['\uE300','蜜'],['\uE301','柔'],['\uE302','搓'],['\uE303','吹'],['\uE304','尻'],['\uE305','爆'],['\uE306','交'],['\uE307','吮'],['\uE308','水'],['\uE309','脱'],['\uE30A','露'],['\uE30B','口'],['\uE30C','的'],['\uE30D','袜'],['\uE30E','呻'],['\uE30F','妇'],['\uE310','逗'],['\uE311','腰'],['\uE312','洞'],['\uE313','胀'],['\uE314','啊'],['\uE315','蒂'],['\uE316','户'],['\uE317','肥'],['\uE320','共'],['\uE321','党'],['\uE322','习'],['\uE323','产']
            ]);

        //判断是否为书籍主页
        g_ctrlMap.set(rule_isBookMainPage,function(){
            return ($('.inner .m-info .author').length >=0);
        });

        //插入按钮
        g_ctrlMap.set(rule_appendDownloadBtn, function(newButton){
            $('.ops').append(newButton);
            return true;
        });

        //获取书名
        g_ctrlMap.set(rule_novelSaveName,[
            function(){return $('.m-info > h1:first').text();},
            function(){return $('.m-info .author > a:first').text();}
        ]);

        //获取章节列表
        g_ctrlMap.set(rule_getChapterListMode,fun_getChapterListFromCurPage);
        g_ctrlMap.set(rule_getChapterListFromCurPage,function(){
            let dtCnt = 0;
            //第二个dt之后的所有内容全部都是
            $('.m-chapters a').each(function() {
                let chapterLink = $(this).attr('href');
                g_chapterURLList.push(chapterLink);
            });
        });

        //获取每一章的内容
        g_ctrlMap.set(rule_getChapterContentMode,fun_getChapterContenFromOnePage);
        g_ctrlMap.set(rule_getChapterTitle,function($data){return $data.find('.article-content h1:first').text();});
        g_ctrlMap.set(rule_getChapterContentContainer,function($data){return $data.find('.article-content');});
        g_ctrlMap.set(rule_getChapterLinesFromContainer,function($container){
            let lines = [];
            $container.find('p').each(function() {
                if ($(this).attr('style'))  return;
                if($(this).find('a').length != 0) return;
                let text = this.textContent.trim();
                lines.push(text);
            });
            return lines;
        });

        g_ctrlMap.set(rule_filterTxt,function(txt){
            g_replaceMap.forEach(function(value, key){
                txt = txt.replaceAll(key,value);
            });
            return txt;
        });
    }
    //[免费小说网](https://www.493d.com)
    else if(fun_checkWebset(url,'https://www.493d.com/book/[0-9]*.html')) {
        //插入按钮
        g_ctrlMap.set(rule_appendDownloadBtn,function(newButton){
            $('div._bts.pa.l0').append(newButton);
            return true;
        });

        //获取书名
        g_ctrlMap.set(rule_novelSaveName,[
            function(){return $('h1.mb15.lh1d2.oh').text();},
            function(){return $('p.mb15.ell._tags.pt2').find('span:first').text();}
        ]);

        //获取章节列表
        g_ctrlMap.set(rule_getChapterListMode,fun_getChapterListFromCurPage);
        g_ctrlMap.set(rule_getChapterListFromCurPage,function(){
            $('#chapterList li').each(function() {
                let chapterURL = $(this).find('a').attr('href');
                g_chapterURLList.push(chapterURL);
            });
        });

        //获取每一章的内容
        g_ctrlMap.set(rule_getChapterContentMode,fun_getChapterContenFromOnePage);
        g_ctrlMap.set(rule_getChapterTitle,function($data){return $data.find('#mlfy_main_text h1').text();});
        g_ctrlMap.set(rule_getChapterContentContainer,function($data){return $data.find('#TextContent');});
        g_ctrlMap.set(rule_getChapterLinesFromContainer,function($container){
            let lines = [];
            $container.contents().each(function() {
                if (this.nodeType === Node.TEXT_NODE) { // 判断节点类型是否为文本节点
                    let text = $(this).text().trim();
                    if (text !== '') {
                        lines.push(text);
                    }
                }
            });
            return lines;
        });
    }
    //[选书网](http://www.xuanshu.org)
    else if(fun_checkWebset(url,'http://www.xuanshu.org/book/[0-9]*/'))
    {
        //插入按钮
        g_ctrlMap.set(rule_appendDownloadBtn,function(newButton){
            $('div.info_des').append(newButton);
            return true;
        });

        //获取书名
        g_ctrlMap.set(rule_novelSaveName,[
            function(){return $('div.info_des h1').text();},
            function(){return $('div.info_des dl:first').text().match(/作.*者：(.+)/)[1].trim();}
        ]);

        //获取章节列表
        g_ctrlMap.set(rule_getChapterListMode,fun_getChapterListFromCurPage);
        g_ctrlMap.set(rule_getChapterListFromCurPage,function(){
            $('.pc_list li').each(function() {
                let chapterURL = $(this).find('a').attr('href');
                g_chapterURLList.push(chapterURL);
            });
        });

        //获取每一章的内容
        g_ctrlMap.set(rule_getChapterContentMode,fun_getChapterContenFromOnePage);
        g_ctrlMap.set(rule_getChapterTitle,function($data){return $data.find('.txt_cont h1:first').text();});
        g_ctrlMap.set(rule_getChapterContentContainer,function($data){return $data.find('#content1');});
        g_ctrlMap.set(rule_getChapterLinesFromContainer,function($container){
            let lines = [];
            $container.contents().each(function() {
                if (this.nodeType === Node.TEXT_NODE) { // 判断节点类型是否为文本节点
                    let text = $(this).text().trim();
                    if (text !== '') {
                        lines.push(text);
                    }
                }
            });
            return lines;
        });

    }
    //[久久小说](http://www.99xs.net/)
    else if(fun_checkWebset(url,'http://www.99xs.net/book/info[0-9]*/')){
        //插入按钮
        g_ctrlMap.set(rule_appendDownloadBtn,function(newButton){
            $('div.info').append(newButton);
            return true;
        });

        //获取书名
        g_ctrlMap.set(rule_novelSaveName,[
            function(){return $('div.top h1').text();},
            function(){return $('div.fix p:first').find('a').text();}
        ]);

        //获取章节列表
        g_ctrlMap.set(rule_getChapterListMode,fun_getChapterListFromNewPage);
        g_ctrlMap.set(rule_getChapterListPageUrl,function(){return window.location.href;});
        g_ctrlMap.set(rule_getChapterListContainer,function($data){ return $data.find('ul.section-list.fix:eq(1)'); });
        g_ctrlMap.set(rule_getChapterListFromContainer,function($container){
            $container.find('a').each(function() {
                let chapterLink = $(this).attr('href');
                g_chapterURLList.push(chapterLink);
            });
        });
        g_ctrlMap.set(rule_getChapterListNextPage,function($data){
            const $nextPageBtn = $data.find('div.index-container a:eq(1):contains("下一页")');
            if($nextPageBtn.length)
            {
                return $nextPageBtn.attr('href');
            }
            return "";
        });


        //获取每一章的内容
        g_ctrlMap.set(rule_getChapterContentMode,fun_getChapterContenPageByPage);
        g_ctrlMap.set(rule_getChapterTitle,function($data){
            let sixthChild = $data.find('div.layout-tit.xs-hidden').contents()[6];
            let chapterTitle = "";
            if (sixthChild.nodeType === Node.TEXT_NODE && sixthChild.nodeValue.length >= 3) {
                chapterTitle = sixthChild.nodeValue.substring(3).trim();
            }
            return chapterTitle;
        });
        g_ctrlMap.set(rule_checkFirstChapterPage,function(url){return !(/_\d+\.html$/.test(url));})
        g_ctrlMap.set(rule_getNextChapterPage,function($data){
            const $nextPageBtn = $data.find('div.section-opt.m-bottom-opt a#next_url:contains("下一页")');
            if($nextPageBtn.length)
            {
                return $nextPageBtn.attr('href');
            }
            return '';
        });
        g_ctrlMap.set(rule_getChapterContentContainer,function($data){return $data.find('div#content');});
        g_ctrlMap.set(rule_getChapterLinesFromContainer,function($container){
            let lines = [];
            $container.find('p').each(function()
            {
                const $t = $(this);
                let txt = $t.text().trim();
                if(!txt.length) return;
                lines.push(txt);
            });
            return lines;
        });
    }
    // 长佩文学网
    else if(fun_checkWebset(url,'https://gongzicp.com/novel-[0-9]*.html'))
    {

        //local config
        {
            g_bTestDownload = false;    //是否测试下载
            g_iTestDownloadCnt = 1;     //测试下载章节数
            g_iMaxPromiseCount = 1;     //批次处理总数

            g_proxysites.push('https://195.3.223.101');
            g_proxysites.push('https://95.214.53.28');
            g_proxysites.push('https://195.3.220.74');
            g_proxysites.push('https://51.159.107.240');
            g_proxysites.push('https://195.3.220.223');
            g_proxysites.push('https://185.16.38.230');
            g_proxysites.push('https://51.159.194.246');
            g_proxysites.push('https://51.159.194.214');
            g_proxysites.push('');//使用本机访问
            g_proxysiteUseIndex = 0;

            g_sleepTime = 5000;
            g_startDownloadIndex = 52;
            g_downloadCount = 7;
        }

        //插入按钮
        g_ctrlMap.set(rule_appendDownloadBtn,function(newButton){
            console.log($('div.read').first());
            $('div.read').first().after(newButton);
            console.log('需要手动点击下载全部，才能下载章节');
            return true;
        });

        //获取书名
        g_ctrlMap.set(rule_novelSaveName,[
            function(){return $('h3.name').text();},
            function(){return $('.cp-info__status').find('span').first().contents().filter(function() {
                return this.nodeType === 3; // Node.TEXT_NODE
            }).text();}
        ]);

        //获取章节列表
        g_ctrlMap.set(rule_getChapterListMode,fun_getChapterListFromCurPage);
        g_ctrlMap.set(rule_getChapterListFromCurPage,function(){
            $('.chapter-list').find('a').each(function() {
                let chapterURL = $(this).attr('href');
                //重新获取
                let match = chapterURL.match(/\d+/);
                if(match)
                {
                    let realurl = '/webapi/novel/chapterGetInfo?cid='+match+'&server=0';
                    g_chapterURLList.push(realurl);
                }
            });
        });

        //获取每一章的内容
        g_ctrlMap.set(rule_getChapterContentMode,fun_getChapterContentFromOnePageWithJsonResponse);
        //实际上这些代理的ip地址访问一次就不能访问了
        if(true){
            g_ctrlMap.set(rule_getChapterContentPageCustom,async function(url){
                let proxystr = g_proxysites[g_proxysiteUseIndex % g_proxysites.length];
                g_proxysiteUseIndex += 1;

                //对于长佩文学网而言，倒不如使用本机地址，隔一段时间获取一章的内容，如果失败了睡眠时间翻倍，失败多次就手动打断点停止吧
                //这个网站是在是太难搞了
                proxystr = '';

                let rurl = '';
                if(proxystr.length > 0)
                {
                    rurl = proxystr + url + '&__cpo=aHR0cHM6Ly9nb25nemljcC5jb20';
                    try
                    {
                        function makeRequest(url) {
                            return new Promise((resolve, reject) => {
                                GM_xmlhttpRequest({
                                    method: 'GET',
                                    url: url,
                                    headers: {
                                        'Content-Type': 'application/json'
                                    },
                                    onload: function(response) {
                                        // 检查响应状态
                                        if (response.status >= 200 && response.status < 300) {
                                            // 解析并返回响应数据
                                            resolve(JSON.parse(response.responseText));
                                        } else {
                                            reject(new Error('Request failed with status ' + response.status));
                                        }
                                    },
                                    onerror: function(error) {
                                        reject(new Error('Request failed: ' + error));
                                    }
                                });
                            });
                        }

                        const josndata = await makeRequest(rurl);
                        await fun_sleep(3000);
                        return josndata;
                    } catch (error) {
                        throw new Error(`Failed to fetch data from ${rurl}: ${error.message}`);
                    }
                }
                else
                {
                    rurl = url;
                    try{
                        const response = await fetch(url);
                        // 检查response.ok是否为true，以确保请求成功
                        if (!response.ok) {
                            throw new Error('网络响应失败');
                        }

                        // 解析JSON数据
                        const josndata = await response.json();
                        await fun_sleep(3000);
                        return josndata;
                    } catch (error) {
                        throw new Error(`Failed to fetch data from ${rurl}: ${error.message}`);
                    }
                }
            });
        }
        g_ctrlMap.set(rule_getChapterTitleFromJson,function(jsonObj){
            let titlestr = jsonObj.data.chapterInfo.name;
            console.log(titlestr);
            return titlestr;
        });
        g_ctrlMap.set(rule_getChapterLinesFromJson,function(jsonObj){

            class ldecoder {
                constructor(e, t) {
                    e += parseInt("165455", 14).toString(32),
                    this.iv = CryptoJS.enc.Utf8.parse("$h$b3!" + e),
                    t = atob(t) + parseInt("4d5a6c8", 14).toString(36),
                    this.key = CryptoJS.enc.Utf8.parse(t + "A")
                }
                encrypt(e) {
                    typeof e != "string" && (e = JSON.stringify(e));
                    const t = CryptoJS.enc.Utf8.parse(e);
                    return CryptoJS.AES.encrypt(t, this.key, {
                        mode: CryptoJS.mode.CBC,
                        padding: CryptoJS.pad.Pkcs7,
                        iv: this.iv
                    }).toString()
                }
                decrypt(e) {
                    const t = CryptoJS.AES.decrypt(e, this.key, {
                        mode: CryptoJS.mode.CBC,
                        padding: CryptoJS.pad.Pkcs7,
                        iv: this.iv
                    });
                    return CryptoJS.enc.Utf8.stringify(t).toString()
                }
            }

            let ddd = new ldecoder("iGzsYn","dTBMUnJidSRFbg==");
            let contentstr = ddd.decrypt(jsonObj.data.chapterInfo.content);

            const commaCount = (contentstr.match(/，/g) || []).length;
            const endCount = (contentstr.match(/。/g) || []).length;

            if((commaCount+ endCount)<5)
            {
                g_sleepTime *= 1.5;
                if(g_sleepTime > 30000)
                {
                    g_sleepTime = 30000;
                }
                throw new Error(`get error content.`);
            }
            console.log(contentstr);
            return contentstr;
        });

    }
    //镇魂小说
    else if(fun_checkWebset(url,'https://www.zhenhunxiaoshuo.com/*/'))
    {

        //local config
        {
            g_bTestDownload = false;    //是否测试下载
            g_iTestDownloadCnt = 1;     //测试下载章节数
            g_iMaxPromiseCount = 3;     //批次处理总数
            g_batchSleep = 3;
        }

        //插入按钮
        g_ctrlMap.set(rule_appendDownloadBtn,function(newButton){
            $('div.focusbox-text').first().after(newButton);
            return true;
        });

        //获取书名
        g_ctrlMap.set(rule_novelSaveName,[
            function(){return $('h1.focusbox-title').text();},
            function(){
                let authorstr = $('div.focusbox-text p:first').contents()[0].nodeValue;
                authorstr = authorstr.slice(5,authorstr.length);
                return authorstr;
            }
        ]);

        //获取章节列表
        g_ctrlMap.set(rule_getChapterListMode,fun_getChapterListFromCurPage);
        g_ctrlMap.set(rule_getChapterListFromCurPage,function(){
            let dtCnt = 0;
            //第二个dt之后的所有内容全部都是
            $('div.excerpts-wrapper a').each(function() {
                let chapterLink = $(this).attr('href');
                g_chapterURLList.push(chapterLink);
            });
        });

        //获取每一章的内容
        g_ctrlMap.set(rule_getChapterContentMode,fun_getChapterContenFromOnePage);
        g_ctrlMap.set(rule_getChapterTitle,function($data){return $data.find('.article-title').text();});
        g_ctrlMap.set(rule_getChapterContentContainer,function($data){return $data.find('.article-content');});
        g_ctrlMap.set(rule_getChapterLinesFromContainer,function($container){
            let lines = [];
            $container.find('p').each(function() {
                let text = this.textContent.trim();
                lines.push(text);
            });
            return lines;
        });

    }
    //足趣读书
    else if(fun_checkWebset(url,'https://zuqus.cc/txt/.*.html'))
    {
        //local config
        {
            g_bTestDownload = false;    //是否测试下载
            g_iTestDownloadCnt = 1;     //测试下载章节数
            g_iMaxPromiseCount = 3;     //批次处理总数
        }

        //插入按钮
        g_ctrlMap.set(rule_appendDownloadBtn,function(newButton){
            $('div#info').after(newButton);
            return true;
        });

        //获取书名
        g_ctrlMap.set(rule_novelSaveName,[
            function(){return $('meta[property="og:novel:book_name"]').attr('content');},
            function(){return $('meta[property="og:novel:author"]').attr('content');}
        ]);

        //获取章节列表
        g_ctrlMap.set(rule_getChapterListMode,fun_getChapterListFromNewPage);
        g_ctrlMap.set(rule_getChapterListPageUrl,function(){
            let previousPageLink = $('div.pages a:contains("上页")').attr('href');
            if (previousPageLink) {
                console.log('章节页链接:', previousPageLink);
                return previousPageLink;
            } else {
                console.log('无法获取章节页')
                return '';
            }
        });
        g_ctrlMap.set(rule_getChapterListContainer,function($data){ return $data.find('div#list dl').first(); });
        g_ctrlMap.set(rule_getChapterListFromContainer,function($container){
            var isTextContentSection = false;
            $container.children().each(function() {
                if ($(this).is('dt') && $(this).text().includes('正文')) {
                    isTextContentSection = true;  // 找到包含“正文”的dt标签，开始记录后续的dd标签
                } else if ($(this).is('dt')) {
                    isTextContentSection = false; // 遇到下一个dt标签，停止记录
                }

                if (isTextContentSection && $(this).is('dd')) {
                    $(this).find('a').each(function() {
                        g_chapterURLList.push($(this).attr('href'));  // 提取dd标签中a标签的href属性
                    });
                }
            });
        });
        g_ctrlMap.set(rule_getChapterListNextPage,function($data){
            const $nextPageBtn = $data.find('div.pages a:contains("下页")');
            if($nextPageBtn.length)
            {
                let nextPageLink = $nextPageBtn.attr('href');
                return nextPageLink;
            }
            return "";
        });


        //获取每一章的内容
        g_ctrlMap.set(rule_getChapterContentMode,fun_getChapterContentFromOnePageCustom);
        g_ctrlMap.set(rule_getChapterContentFromOnePageCustomImpl,async function(url){
            try{
                let paragraphList = [];
                //请求
                const response = await fetch(url);
                const responseText = await response.text();

                let titlestr = '';
                let realgetlink = '';

                //情况1，直接返回的事script脚本的形式
                {
                    // 使用正则表达式提取 CT 和 CU
                    let ctMatch = responseText.match(/CT:\s*"([^"]+)"/);
                    let cuMatch = responseText.match(/CU:\s*"([^"]+)"/);



                    if (ctMatch && cuMatch) {
                        titlestr = ctMatch[1];
                        realgetlink = "https:" + cuMatch[1];
                    }
                }

                //情况2 半网页的形式
                {
                    // 定义正则表达式匹配initTxt函数调用的模式
                    let regex = /initTxt\("([^"]+)",\s*"([^"]+)"\)/;

                    // 执行正则表达式匹配
                    let match = regex.exec(responseText);

                    if (match) {
                        // match[1] 匹配到的是链接
                        realgetlink = "https:" + match[1];
                        // match[2] 匹配到的是章节名称
                        titlestr = match[2];
                    }


                }

                // 判断这两个变量是否为空，为空则抛出异常
                if (!titlestr) {
                    throw new Error(' (标题) 为空');
                }

                if (!realgetlink) {
                    throw new Error(' (链接) 为空');
                }

                console.log('Title:', titlestr);
                console.log('URL:', realgetlink);

                paragraphList.push("");
                paragraphList.push(titlestr);
                paragraphList.push("");

                function makeRequest(rlink) {
                    return new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: "GET",
                            url: rlink,
                            onload: function(response) {
                                resolve(response.responseText);
                            },
                            onerror: function(error) {
                                reject(error);
                            }
                        });
                    });
                }

                const unicodeContect = await makeRequest(realgetlink);

                //paragraphList.push(unicodeContect);

                function processText(text) {
                    const regex = /"([^"]*)"/g;
                    const matches = [];
                    let match;

                    while ((match = regex.exec(text)) !== null) {
                        matches.push(match[1]);
                    }

                    if(matches.length < 3)
                        return '';

                    let contentstr = matches[1];
                    for(let i = 3;i<matches.length;i+=2)
                    {
                        let k = matches[i+1];
                        let v = matches[i];

                        if(k==='\\b')
                        {
                            k='\\\\b';
                        }


                        contentstr = contentstr.replace(new RegExp(k, 'g'), v);
                    }
                    contentstr = contentstr.replace(/\\n/g, "\r\n");
                    return contentstr;
                }

                function decodeUnicode(encodedText) {
                    // 将编码文本中的 Unicode 转换为明文
                    const decodedText = encodedText.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
                        return String.fromCharCode(parseInt(hex, 16));
                    });

                    return decodedText;
                }
                let contentstr = processText(unicodeContect);
                contentstr = decodeUnicode(contentstr);
                paragraphList.push(contentstr);
                return paragraphList;
            }  catch (error) {
                console.error("请求失败:", error);
                g_needSleep = true;
            }
        });
    }
    //腐小说
    else if(fun_checkWebset(url,'https:\/\/www\\.jiqinw\\.com\\/[^\\/]+\\/[0-9]+\\.html'))
    {
        console.log('匹配到腐小说网站');
        {
            g_bTestDownload = false;    //是否测试下载
            g_iTestDownloadCnt = 1;     //测试下载章节数
            g_iMaxPromiseCount = 3;     //批次处理总数
            g_batchSleep = 3;
            g_bTestGetChapter = false;
        }

        //插入按钮
        g_ctrlMap.set(rule_appendDownloadBtn,function(newButton){
            if($(".af_lst").length!=0)
            {
                console.log($(".af_lst"));
                $(".af_lst").append(newButton);
                return true;
            }
            else if($(".tits").length!=0)
            {
                $(".tits").append(newButton);
                return true;
            }
        });

        //获取书名
        g_ctrlMap.set(rule_novelSaveName,[
            function(){
                if($('meta[property="og:novel:book_name"]').length!=0)
                {
                    return $('meta[property="og:novel:book_name"]').attr('content');
                }
                else if($(".af_lst").length!=0)
                {
                    let bookTitle = $(".coa-an h1").text();
                    console.log("书名:", bookTitle);
                    return bookTitle;
                }
            },
            function(){
                if($('meta[property="og:novel:author"]').length!=0)
                {
                    return  $('meta[property="og:novel:author"]').attr('content');
                }
                else if($(".af_lst").length!=0)
                {
                    let authorName = $(".af_lst strong a").text();
                    console.log("作者名称:", authorName);
                    return authorName;
                }
            }
        ]);

        //获取章节列表
        g_ctrlMap.set(rule_getChapterListMode,fun_getChapterListFromCurPage);
        g_ctrlMap.set(rule_getChapterListFromCurPage,function(){
            // 提取总页数
            let totalPagesText = $(".alt_page li:first-child a").text();
            let totalPages = totalPagesText.match(/共(\d+)页/);

            if (totalPages) {
                totalPages = parseInt(totalPages[1], 10); // 转换为整数
                let baseUrl = window.location.href.replace('.html',''); // 请替换为实际的基本 URL

                // 生成链接
                for (let i = 1; i <= totalPages; i++) {
                    let url = i === 1 ? `${baseUrl}.html` : `${baseUrl}_${i}.html`;
                    g_chapterURLList.push(url);
                    // 如果你想将链接添加到页面，可以使用下面的代码
                    // $("#linksContainer").append(`<a href="${url}">${url}</a><br>`);
                }
            } else {
                console.log("未能提取总页数");
            }

            console.log(g_chapterURLList);
        });

        //获取每一章的内容
        g_ctrlMap.set(rule_getChapterContentMode,fun_getChapterContenFromOnePage);
        g_ctrlMap.set(rule_getChapterTitle,function($data){return '';});
        g_ctrlMap.set(rule_getChapterContentContainer,function($data){
            if($data.find('.wznrb').length!=0)
            {
                return $data.find('.wznrb');
            }
            else if($data.find('.co-bay').length!=0)
            {
                return $data.find('.co-bay');
            }
        });
        g_ctrlMap.set(rule_getChapterLinesFromContainer,function($container){
            let lines = [];
            let text = $container.text();
            // console.log(text);
            lines.push(text);
            return lines;
        });
    }
    //52书库
    else if(fun_checkWebset(url,'https://www.52shuku.vip/.*.html'))
    {
        //local config
        {
            g_bTestDownload = false;    //是否测试下载
            g_bTestGetChapter = false;
            g_iTestDownloadCnt = 1;     //测试下载章节数
            g_iMaxPromiseCount = 3;     //批次处理总数
        }

        //插入按钮
        g_ctrlMap.set(rule_appendDownloadBtn,function(newButton){
            let d = $('header.article-header div.meta');
            if (d.length === 0)  // 检查元素是否存在
                return false;
            d.append(newButton);
            return true;
        });

        //获取书名
        g_ctrlMap.set(rule_novelSaveName,[
            function(){
                const regex = /^(.*?)_(.*?)(?:\s*【.*?】)?$/;
                let str = $('h1.article-title').text();
                const match = str.match(regex);
                if(match)
                    return match[1].trim();
                else
                    return str;
            },
            function(){
                const regex = /^(.*?)_(.*?)(?:\s*【.*?】)?$/;
                let str = $('h1.article-title').text();
                const match = str.match(regex);
                if(match)
                    return match[2].trim();
                else
                    return '';
            }
        ]);

        //获取章节列表
        g_ctrlMap.set(rule_getChapterListMode,fun_getChapterListFromCurPage);
        g_ctrlMap.set(rule_getChapterListFromCurPage,function(){
            $('ul.list.clearfix li.mulu').each(function() {
                let chapterURL = $(this).find('a').attr('href');
                g_chapterURLList.push(chapterURL);
            });
        });

        //获取每一章的内容
        g_ctrlMap.set(rule_getChapterContentMode,fun_getChapterContenFromOnePage);
        g_ctrlMap.set(rule_getChapterTitle,function($data){return '';});
        g_ctrlMap.set(rule_getChapterContentContainer,function($data){return $data.find('.article-content');});
        g_ctrlMap.set(rule_getChapterLinesFromContainer,function($container){
            let lines = [];
            $container.find('p').each(function()
            {
                const $t = $(this);
                let txt = $t.text().trim();
                if(!txt.length) return;
                lines.push(txt);
            });
            return lines;
        });
    }
    //半夏小说
    else if(fun_checkWebset(url,'https://www.xbanxia.cc/books/.*.html'))
    {
        //local config
        {
            g_bTestDownload = false;    //是否测试下载
            g_bTestGetChapter = false;
            g_iTestDownloadCnt = 1;     //测试下载章节数
            g_iMaxPromiseCount = 3;     //批次处理总数
            g_batchSleep = 3;
        }

        //插入按钮
        g_ctrlMap.set(rule_appendDownloadBtn,function(newButton){
            // 在章节列表容器旁边插入下载按钮
            let chapterListContainer = $('div.book-list.clearfix');
            if (chapterListContainer.length === 0) {
                // 如果找不到章节列表容器，尝试在内容列表容器前插入
                chapterListContainer = $('div#content-list');
                if (chapterListContainer.length === 0) {
                    return false;
                }
                chapterListContainer.before(newButton);
            } else {
                // 在章节列表容器前插入下载按钮
                chapterListContainer.before(newButton);
            }
            return true;
        });

        //获取书名
        g_ctrlMap.set(rule_novelSaveName,[
            function(){
                // 直接从书籍描述区域的h1标签获取书名
                let bookTitleElement = $('div.  -describe h1');
                if (bookTitleElement.length !== 0)
                {
                    return bookTitleElement.text().trim();
                }

                // 备用方案：从页面标题获取书名
                if($('title').length !== 0)
                {
                    let title = $('title').text();
                    // 移除"小说全文在线阅读 - 半夏小说"部分
                    let bookTitle = title.replace(/小說全文在線閱讀 - 半夏小說$/, '').trim();

                    // 检查书名是否重复（如"Kiss Me if You Canx Kiss Me if You Can"）
                    if (bookTitle.includes('x ')) {
                        // 分割并取第一部分
                        let parts = bookTitle.split('x ');
                        if (parts.length > 1) {
                            bookTitle = parts[0].trim();
                        }
                    }

                    return bookTitle;
                }
                return '';
            },
            function(){
                // 从作者信息段落获取作者
                let authorElement = $('div.book-describe p:contains("作者")');
                if (authorElement.length !== 0)
                {
                    let authorText = authorElement.text().trim();
                    // 提取作者名称（移除"作者︰"前缀）
                    let authorMatch = authorText.match(/作者︰(.+)/);
                    if (authorMatch && authorMatch[1]) {
                        return authorMatch[1].trim();
                    }
                }
                return '';
            }
        ]);

        //获取章节列表
        g_ctrlMap.set(rule_getChapterListMode,fun_getChapterListFromCurPage);
        g_ctrlMap.set(rule_getChapterListFromCurPage,function(){
            // 从书籍列表容器获取章节链接
            $('div.book-list.clearfix li a').each(function() {
                let href = $(this).attr('href');
                if (href && href.includes('/books/') && href.includes('.html')) {
                    g_chapterURLList.push(href);
                }
            });

            console.log('半夏小说章节列表:', g_chapterURLList);
        });

        //获取每一章的内容
        g_ctrlMap.set(rule_getChapterContentMode,fun_getChapterContenFromOnePage);
        g_ctrlMap.set(rule_getChapterTitle,function($data){
            // 获取章节标题
            let title = $data.find('h1#nr_title').text().trim();
            if (!title) {
                title = $data.find('h1.post-title').text().trim();
            }
            return title;
        });
        g_ctrlMap.set(rule_getChapterContentContainer,function($data){
            // 获取章节内容容器
            let container = $data.find('div#nr1');
            if (!container.length) {
                container = $data.find('div.post-content');
            }
            return container;
        });
        g_ctrlMap.set(rule_getChapterLinesFromContainer,function($container){
            let lines = [];
            // 获取所有段落内容，按行处理
            $container.find('p, div').each(function() {
                let $element = $(this);
                let text = $element.text().trim();
                if (text.length > 0) {
                    // 按换行符分割内容
                    let textLines = text.split(/\r?\n/);
                    textLines.forEach(function(line) {
                        let trimmedLine = line.trim();
                        if (trimmedLine.length > 0) {
                            lines.push(trimmedLine);
                        }
                    });
                }
            });

            // 如果没有找到段落内容，使用text()方法获取所有文本
            if (lines.length === 0) {
                let content = $container.text();
                if (content) {
                    let textLines = content.split(/\r?\n/);
                    textLines.forEach(function(line) {
                        let trimmedLine = line.trim();
                        if (trimmedLine.length > 0) {
                            lines.push(trimmedLine);
                        }
                    });
                }
            }

            return lines;
        });
    }
    //[卡夜阁](https://www.kaye-ge.com/)
    else if(fun_checkWebset(url,'https://www.kaye-ge.com/index/[0-9]*/'))
    {
        console.log("xxxxxxxxxxxxxxxxx");

        //local config
        {
            g_bTestDownload = false;    //是否测试下载
            g_bTestGetChapter = false;
            g_iTestDownloadCnt = 1;     //测试下载章节数
            g_iMaxPromiseCount = 3;     //批次处理总数
            g_batchSleep = 3;
        }


        //判断是否为书籍主页
        g_ctrlMap.set(rule_isBookMainPage,function(){
            return ($('.info').length > 0 && $('.section-list.fix').length > 0);
        });

        //插入按钮
        g_ctrlMap.set(rule_appendDownloadBtn,function(newButton){
            console.log('insert download button');
            $('.info').append(newButton);
            return true;
        });

        //获取书名
        g_ctrlMap.set(rule_novelSaveName,[
            function(){
                //优先从meta标签获取书名
                let metaBookName = $('meta[property="og:novel:book_name"]').attr('content');
                if(metaBookName && metaBookName.trim()) {
                    return metaBookName.trim();
                }
                //备用方案：从页面标题获取
                return $('title').text().trim();
            },
            function(){
                //从meta标签获取作者
                let metaAuthor = $('meta[property="og:novel:author"]').attr('content');
                if(metaAuthor && metaAuthor.trim()) {
                    return metaAuthor.trim();
                }
                //备用方案：从页面结构获取作者
                let authorText = $('.info p:contains("作者")').text();
                let match = authorText.match(/作者[：︰](.+)/);
                if(match && match[1]) {
                    return match[1].trim();
                }
                return '未知作者';
            }
        ]);

        //获取章节列表（分页模式）
        g_ctrlMap.set(rule_getChapterListMode,fun_getChapterListFromNewPage);
        g_ctrlMap.set(rule_getChapterListPageUrl,function(){
            return window.location.href;
        });
        g_ctrlMap.set(rule_getChapterListContainer,function($data){
            return $data.find('ul.section-list.fix:eq(1)');
        });
        g_ctrlMap.set(rule_getChapterListFromContainer,function($container){
            $container.find('a').each(function() {
                let chapterLink = $(this).attr('href');
                g_chapterURLList.push(chapterLink);
            });
        });
        g_ctrlMap.set(rule_getChapterListNextPage,function($data){
            const $nextPageBtn = $data.find('.index-container a:contains("下一页")');
            if($nextPageBtn.length && !$nextPageBtn.hasClass('disabled-btn'))
            {
                return $nextPageBtn.attr('href');
            }
            return "";
        });

        //获取每一章的内容（分页模式）
        g_ctrlMap.set(rule_getChapterContentMode,fun_getChapterContenPageByPage);
        g_ctrlMap.set(rule_getChapterTitle,function($data){
            return $data.find('h1.title').text().trim();
        });
        g_ctrlMap.set(rule_checkFirstChapterPage,function(url){
            return !(/_[0-9]+\.html$/.test(url));
        });
        g_ctrlMap.set(rule_getNextChapterPage,function($data){
            const $nextPageBtn = $data.find('a#next_url:contains("下一页")');
            if($nextPageBtn.length)
            {
                return $nextPageBtn.attr('href');
            }
            return '';
        });
        g_ctrlMap.set(rule_getChapterContentContainer,function($data){
            return $data.find('div#content');
        });
        g_ctrlMap.set(rule_getChapterLinesFromContainer,function($container){
            let lines = [];
            $container.find('p').each(function()
            {
                const $t = $(this);
                let txt = $t.text().trim();
                if(!txt.length) return;
                lines.push(txt);
            });
            return lines;
        });
    }
    //[顶点小说](https://www.220book.com/book/)
    else if(fun_checkWebset(url,'https://www.220book.com/book/[0-9A-Z]+/'))
    {
        console.log("顶点小说配置已激活");

        //local config
        {
            g_bTestDownload = false;    //是否测试下载
            g_bTestGetChapter = false;  //是否测试获取章节
            g_iTestDownloadCnt = 1;     //测试下载章节数
            g_iMaxPromiseCount = 3;     //批次处理总数
            g_batchSleep = 3;
        }

        //判断是否为书籍主页
        g_ctrlMap.set(rule_isBookMainPage,function(){
            return ($('div.nameW').length > 0 && $('div.btnW').length > 0);
        });

        //插入按钮
        g_ctrlMap.set(rule_appendDownloadBtn,function(newButton){
            console.log('在顶点小说页面插入下载按钮');
            $('div.chapterList').prepend(newButton);
            return true;
        });

        //获取书名
        g_ctrlMap.set(rule_novelSaveName,[
            function(){
                //优先从div.nameW中提取书名
                let bookName = $('div.nameW span.name.font28').text().trim();
                if(bookName && bookName.trim()) {
                    return bookName.trim();
                }
                //备用方案：从meta标签获取书名
                let metaBookName = $('meta[property="og:novel:book_name"]').attr('content');
                if(metaBookName && metaBookName.trim()) {
                    return metaBookName.trim();
                }
                //最后备用方案：从页面标题获取
                let titleText = $('title').text().trim();
                let match = titleText.match(/(.+?)_顶点小说/);
                if(match && match[1]) {
                    return match[1].trim();
                }
                return titleText;
            },
            function(){
                //优先从div.nameW中提取作者
                let authorName = $('div.nameW span.author.font18 a').text().trim();
                if(authorName && authorName.trim()) {
                    return authorName.trim();
                }
                //备用方案：从span.author中提取作者
                let authorText = $('div.nameW span.author.font18').text().trim();
                let match = authorText.match(/作者[：︰](.+)/);
                if(match && match[1]) {
                    return match[1].trim();
                }
                //最后备用方案：从meta标签获取作者
                let metaAuthor = $('meta[property="og:novel:author"]').attr('content');
                if(metaAuthor && metaAuthor.trim()) {
                    return metaAuthor.trim();
                }
                return '未知作者';
            }
        ]);

        //获取章节列表（分页模式）
        g_ctrlMap.set(rule_getChapterListMode,fun_getChapterListCustom);
        g_ctrlMap.set(rule_getChapterListCustom,async function(){
            // 1. 获取"查看全部章节"链接
            const allChaptersLink = $('div.allW a.all').attr('href');
            if(!allChaptersLink) {
                console.error('未找到"查看全部章节"链接');
                return;
            }

            // 获取全部章节的内容
            const allChaptersResponse = await fetch(allChaptersLink);
            const allChaptersHtml = await allChaptersResponse.text();
            const $allChaptersDoc = $(allChaptersHtml);

            // 获取当前页面的章节总数和分页信息
            const $pageSelect = $allChaptersDoc.find('select.select');
            // 目前不清楚单页的时候有什么不同的显示规则，先测试多页的
            if(!$pageSelect.length) {
                console.log('未找到章节分页下拉框，使用单页模式');
                // 单页模式：直接获取当前页面的章节列表
                $allChaptersDoc.find('div.list.list3.chapListBody ul li a').each(function() {
                    let chapterLink = $(this).attr('href');
                    if(chapterLink && chapterLink.includes('/book/')) {
                        g_chapterURLList.push(chapterLink);
                    }
                });
                return;
            }

            // 多页模式：通过POST请求获取所有分页的章节列表
            const totalPages = $pageSelect.find('option').length;

            // 从URL中提取书籍ID（如7SBR）
            const urlMatch = window.location.href.match(/\/book\/([0-9A-Z]+)/);
            const bookId = urlMatch ? urlMatch[1] : '';

            if(!bookId) {
                console.error('无法从URL中提取书籍ID');
                return;
            }

            console.log(`检测到${totalPages}页章节，书籍ID: ${bookId}`);

            // 然后通过POST请求获取其他页面的章节
            for(let page = 1; page <= totalPages; page++) {
                try {
                    console.log(`正在获取第${page}页章节...`);

                    // 构建POST请求参数
                    const postData = new URLSearchParams({
                        'id': bookId,
                        'page': page.toString()
                    });

                    // 发送POST请求获取章节列表
                    const response = await fetch('https://www.220book.com/index.php?action=loadChapterPage', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'X-Requested-With': 'XMLHttpRequest'
                        },
                        body: postData
                    });

                    if(response.ok) {
                        const jsonData = await response.json();
                        // 检查返回状态
                        if(jsonData.code === 0) {
                            // 从JSON数据中提取章节链接
                            jsonData.data.forEach(function(chapter) {
                                if(chapter.chapterurl) {
                                    g_chapterURLList.push(chapter.chapterurl);
                                }
                            });

                            // 添加延迟避免请求过快
                            await new Promise(resolve => setTimeout(resolve, 200));
                        } else {
                            console.warn(`第${page}页请求返回错误: ${jsonData.msg}`);
                        }
                    } else {
                        console.warn(`第${page}页请求失败: ${response.status}`);
                    }
                } catch(error) {
                    console.error(`获取第${page}页章节时出错:`, error);
                }
            }
            console.log(`章节列表获取完成，共${g_chapterURLList.length}章`);
        });

        //获取每一章的内容（单页模式）
        g_ctrlMap.set(rule_getChapterContentMode,fun_getChapterContenFromOnePage);
        g_ctrlMap.set(rule_getChapterTitle,function($data){
            return $data.find('h1.title').text().trim();
        });
        g_ctrlMap.set(rule_getChapterContentContainer,function($data){
            return $data.find('div#content');
        });
        g_ctrlMap.set(rule_getChapterLinesFromContainer,function($container){
            let lines = [];
            $container.find('p').each(function()
            {
                const $t = $(this);
                let txt = $t.text().trim();
                if(!txt.length) return;
                lines.push(txt);
            });
            return lines;
        });
    }
    // 笔趣阁-ryhy
    else if(fun_checkWebset(url,'https://www.ryhy.net/article/[0-9]*.html')){
        //local config
        {
            g_bTestDownload = false;    //是否测试下载
            g_bTestGetChapter = false;  //是否测试获取章节
            g_iTestDownloadCnt = 1;     //测试下载章节数
            g_iMaxPromiseCount = 3;     //批次处理总数
            g_batchSleep = 3;
        }

        //插入按钮
        g_ctrlMap.set(rule_appendDownloadBtn, function(newButton){
            $('.info .intro').prepend(newButton);
            return true;
        });

        //获取书名
        g_ctrlMap.set(rule_novelSaveName,[
            function(){return $('meta[property="og:novel:book_name"]').attr('content');},
            function(){return $('meta[property="og:novel:author"]').attr('content');}
        ]);

        //获取章节列表
        g_ctrlMap.set(rule_getChapterListMode,fun_getChapterListFromCurPage);
        g_ctrlMap.set(rule_getChapterListFromCurPage,function(){
            let dtCnt = 0;
            $('#list dd').each(function() {
                var url = $(this).find('a').attr('href');
                    if(url){
                        g_chapterURLList.push(url);
                    }
            });
        });

        //获取每一章的内容
        g_ctrlMap.set(rule_getChapterContentMode,fun_getChapterContenFromOnePage);
        g_ctrlMap.set(rule_getChapterTitle,function($data){return $data.find('.bookname h1:first').text();});
        g_ctrlMap.set(rule_getChapterContentContainer,function($data){return $data.find('#htmlContent');});
        g_ctrlMap.set(rule_getChapterLinesFromContainer,function($container){
            let lines = [];
            // 处理包含<p>标签和<br>换行符的HTML内容
            $container.find('p').each(function() {
                const $p = $(this);
                let paragraphText = $p.text().trim();
                if(paragraphText) {
                    // 将段落文本按<br>标签分割成多行
                    const htmlContent = $p.html();
                    const brSplitLines = htmlContent.split(/<br\s*\/?>/i);

                    if(brSplitLines.length > 1) {
                        // 如果有<br>标签，按换行分割
                        brSplitLines.forEach(lineHtml => {
                            // 移除HTML标签，只保留纯文本
                            const cleanText = lineHtml.replace(/<[^>]*>/g, '').trim();
                            if(cleanText) {
                                lines.push(cleanText);
                            }
                        });
                    } else {
                        // 如果没有<br>标签，直接添加整个段落
                        lines.push(paragraphText);
                    }
                }
            });

            // 如果没有找到<p>标签，回退到原来的文本节点处理方式
            if(lines.length === 0) {
                $container.contents().each(function() {
                    if (this.nodeType !== Node.TEXT_NODE) return;
                    let txt = this.textContent.trim();
                    if (txt !== "") {
                        lines.push(txt);
                    }
                });
            }

            return lines;
        });
    }
    // 笔趣阁-wtksm
    else if(fun_checkWebset(url,'https://www.wtksm.com/novel/*')){
        //local config
        {
            g_bTestDownload = false;    //是否测试下载
            g_bTestGetChapter = false;  //是否测试获取章节
            g_iTestDownloadCnt = 100;     //测试下载章节数
            g_iMaxPromiseCount = 5;     //批次处理总数
            g_batchSleep = 1;
        }

        //判断是否为书籍主页
        g_ctrlMap.set(rule_isBookMainPage,function(){
            return ($('dd table').length > 0);
        });

        //插入按钮
        g_ctrlMap.set(rule_appendDownloadBtn, function(newButton){
            $('dd table').prepend(newButton);
            return true;
        });

        //获取书名
        g_ctrlMap.set(rule_novelSaveName,[
            function(){return $('meta[property="og:novel:book_name"]').attr('content');},
            function(){return $('meta[property="og:novel:author"]').attr('content');}
        ]);

        //获取章节列表
        g_ctrlMap.set(rule_getChapterListMode,fun_getChapterListFromCurPage);
        g_ctrlMap.set(rule_getChapterListFromCurPage,function(){
            let dtCnt = 0;
            $('dd table a').each(function() {
                var url = $(this).attr('href');
                    if(url){
                        g_chapterURLList.push(url);
                    }
            });
        });

        //获取每一章的内容
        g_ctrlMap.set(rule_getChapterContentMode,fun_getChapterContenFromOnePage);
        g_ctrlMap.set(rule_getChapterTitle,function($data){return $data.find('.bdsub dd h1:first').text();});
        g_ctrlMap.set(rule_getChapterContentContainer,function($data){return $data.find('#htmlContent');});
        g_ctrlMap.set(rule_getChapterLinesFromContainer,function($container){
            let lines = [];
            // 处理包含<p>标签和<br>换行符的HTML内容
            $container.find('p').each(function() {
                const $p = $(this);
                let paragraphText = $p.text().trim();
                if(paragraphText) {
                    // 将段落文本按<br>标签分割成多行
                    const htmlContent = $p.html();
                    const brSplitLines = htmlContent.split(/<br\s*\/?>/i);

                    if(brSplitLines.length > 1) {
                        // 如果有<br>标签，按换行分割
                        brSplitLines.forEach(lineHtml => {
                            // 移除HTML标签，只保留纯文本
                            const cleanText = lineHtml.replace(/<[^>]*>/g, '').trim();
                            if(cleanText) {
                                lines.push(cleanText);
                            }
                        });
                    } else {
                        // 如果没有<br>标签，直接添加整个段落
                        lines.push(paragraphText);
                    }
                }
            });

            // 如果没有找到<p>标签，回退到原来的文本节点处理方式
            if(lines.length === 0) {
                $container.contents().each(function() {
                    if (this.nodeType !== Node.TEXT_NODE) return;
                    let txt = this.textContent.trim();
                    if (txt !== "") {
                        lines.push(txt);
                    }
                });
            }

            return lines;
        });
    }
    // 笔趣看-ynfdkj
    else if(fun_checkWebset(url,'https://www.ynfdkj.com/biquge/[0-9]*.html')){
        //local config
        {
            g_bTestDownload = true;    //是否测试下载
            g_bTestGetChapter = false;  //是否测试获取章节
            g_iTestDownloadCnt = 1;     //测试下载章节数
            g_iMaxPromiseCount = 5;     //批次处理总数
            g_batchSleep = 1;
        }

        //插入按钮
        g_ctrlMap.set(rule_appendDownloadBtn, function(newButton){
            $('.info .intro').prepend(newButton);
            return true;
        });

        //获取书名
        g_ctrlMap.set(rule_novelSaveName,[
            function(){return $('meta[property="og:novel:book_name"]').attr('content');},
            function(){return $('meta[property="og:novel:author"]').attr('content');}
        ]);

        //获取章节列表
        g_ctrlMap.set(rule_getChapterListMode,fun_getChapterListFromCurPage);
        g_ctrlMap.set(rule_getChapterListFromCurPage,function(){
            let dtCnt = 0;
            $('#list a').each(function() {
                var url = $(this).attr('href');
                    if(url){
                        g_chapterURLList.push(url);
                    }
            });
        });

        //获取每一章的内容
        g_ctrlMap.set(rule_getChapterContentMode,fun_getChapterContenFromOnePage);
        g_ctrlMap.set(rule_getChapterTitle,function($data){return $data.find('.readbar .bookname h1:first').text();});
        g_ctrlMap.set(rule_getChapterContentContainer,function($data){return $data.find('#htmlContent');});
        g_ctrlMap.set(rule_getChapterLinesFromContainer,function($container){
            let lines = [];
            // 处理包含<p>标签和<br>换行符的HTML内容
            $container.find('p').each(function() {
                const $p = $(this);
                let paragraphText = $p.text().trim();
                if(paragraphText) {
                    // 将段落文本按<br>标签分割成多行
                    const htmlContent = $p.html();
                    const brSplitLines = htmlContent.split(/<br\s*\/?>/i);

                    if(brSplitLines.length > 1) {
                        // 如果有<br>标签，按换行分割
                        brSplitLines.forEach(lineHtml => {
                            // 移除HTML标签，只保留纯文本
                            const cleanText = lineHtml.replace(/<[^>]*>/g, '').trim();
                            if(cleanText) {
                                lines.push(cleanText);
                            }
                        });
                    } else {
                        // 如果没有<br>标签，直接添加整个段落
                        lines.push(paragraphText);
                    }
                }
            });

            // 如果没有找到<p>标签，回退到原来的文本节点处理方式
            if(lines.length === 0) {
                $container.contents().each(function() {
                    if (this.nodeType !== Node.TEXT_NODE) return;
                    let txt = this.textContent.trim();
                    if (txt !== "") {
                        lines.push(txt);
                    }
                });
            }

            return lines;
        });
    }
    //[八二小说网](https://www.82xs.com)
    else if(fun_checkWebset(url,'https://www.82xs.com/bqg/[0-9]*.html') || fun_checkWebset(url,'https://www.82xs.com/index/[0-9]*/[0-9]*/') || fun_checkWebset(url,'https://m\.82xs\.com/[0-9]*/')){
        console.log("八二小说网配置已激活");

        //local config
        {
            g_bTestDownload = false;    //是否测试下载
            g_bTestGetChapter = false;  //是否测试获取章节
            g_iTestDownloadCnt = 3;     //测试下载章节数
            g_iMaxPromiseCount = 5;     //批次处理总数
            g_batchSleep = 2;
        }

       //判断是否为书籍主页
        g_ctrlMap.set(rule_isBookMainPage,function(){
            // 检查是否为手机端页面
            const isMobilePage = $('meta[name="applicable-device"][content="mobile"]').length > 0;

            if(isMobilePage) {
                // 手机端页面检测逻辑
                return $('meta[property="og:novel:book_name"]').length > 0 ||
                       $('div.book-info').length > 0 ||
                       $('div.chapter-list').length > 0;
            } else {
                // PC端页面检测逻辑
                return $('meta[property="og:novel:book_name"]').length > 0 ||
                       $('div.section-list').length > 0 ||
                       $('div.word_read').length > 0;
            }
        });

        //插入按钮
        g_ctrlMap.set(rule_appendDownloadBtn,function(newButton){
            console.log('在八二小说网页面插入下载按钮');

            // 检查是否为手机端页面
            const isMobilePage = $('meta[name="applicable-device"][content="mobile"]').length > 0;

            if(isMobilePage) {
                console.log('检测到手机端页面，使用手机端插入逻辑');
                // 手机端页面插入逻辑
                if($('div.book-info').length > 0) {
                    $('div.book-info').before(newButton);
                } else if($('div.chapter-list').length > 0) {
                    $('div.chapter-list').before(newButton);
                } else if($('ul.chapter-list').length > 0) {
                    $('ul.chapter-list').before(newButton);
                } else {
                    $('body').prepend(newButton);
                }
            } else {
                console.log('检测到PC端页面，使用PC端插入逻辑');
                // PC端页面插入逻辑
                if($('div.section-list').length > 0) {
                    $('div.section-list').before(newButton);
                } else if($('div.word_read').length > 0) {
                    $('div.word_read').before(newButton);
                } else if($('div[class*="chapter"]').length > 0) {
                    $('div[class*="chapter"]').first().before(newButton);
                } else {
                    $('body').prepend(newButton);
                }
            }

            return true;
        });

        // 2. 获取小说名和作者 (修复 TypeError 问题)
        g_ctrlMap.set(rule_novelSaveName, [
            function() {
                // 第一个函数：返回小说名称
                let title = $('meta[property="og:novel:book_name"]').attr('content');
                if(!title) {
                    // 兼容PC端和手机端的不同DOM结构
                    title = $('.bookname h1').text().trim() || $('.info .top h1').text().trim();
                }
                return title || '未知小说';
            },
            function() {
                // 第二个函数：返回作者名称
                let author = $('meta[property="og:novel:author"]').attr('content');
                if(!author) {
                    // 兼容PC端和手机端的不同DOM结构
                    author = $('.book-info .tag .author').text().replace(' 著', '').trim() || $('.info .fix p').first().text().replace('作\u00A0\u00A0者：', '').trim();
                }
                return author || '未知作者';
            }
        ]);

        //获取章节列表（链式翻页模式：当前页 -> 下一页 -> ...）
        g_ctrlMap.set(rule_getChapterListMode, fun_getChapterListCustom);
        g_ctrlMap.set(rule_getChapterListCustom, async function() {
            console.log("[DEBUG] --- 开始按页顺序获取章节列表 ---");

            // 用于记录已经处理过的URL，防止陷入死循环
            const processedUrls = new Set();
            let pageCount = 0;

            // 核心递归处理函数
            async function processPage(url, $pageDoc = null) {
                // 防死循环检测
                if (processedUrls.has(url)) {
                    console.log(`[DEBUG] 页面已处理过，跳过: ${url}`);
                    return;
                }
                processedUrls.add(url);
                pageCount++;
                console.log(`[DEBUG] ---> 正在处理第 ${pageCount} 页: ${url}`);

                let $doc = $pageDoc;

                // 如果没有传入文档对象(即非当前首页)，则发起网络请求获取
                if (!$doc) {
                    try {
                        const response = await fetch(url);
                        if (!response.ok) {
                            console.error(`[DEBUG] 请求失败，状态码: ${response.status}`);
                            return;
                        }
                        const html = await response.text();
                        // 使用 DOMParser 解析完整 HTML，防止 jQuery 直接 $(html) 丢失部分标签
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(html, "text/html");
                        $doc = $(doc);
                    } catch (e) {
                        console.error(`[DEBUG] 获取或解析页面失败: ${url}`, e);
                        return;
                    }
                }

                // --- 1. 提取当前页的章节列表 ---
                let newLinksCount = 0;

                // 兼容 PC 端和手机端的列表选择器
                let $lists = $doc.find('ul.section-list, div.section-list > ul, ul.chapter-list');

                $lists.each(function() {
                    let $ul = $(this);

                    // 【防乱序1】跳过手机端页面顶部的“最新章节”区块
                    let prevText = $ul.parent().prev('h3').text() || $ul.prev('h3').text();
                    if (prevText.includes('最新章节')) {
                        console.log('[DEBUG] 跳过手机端“最新章节”区块 (防止章节乱序)');
                        return; // 相当于 continue
                    }

                    let $lis = $ul.find('li');

                    // 【防乱序2】处理 PC 端顶部隐藏的最新章节 (通常带有 ycxsid 类)
                    if ($ul.hasClass('ycxsid') || $ul.parent().hasClass('ycxsid')) {
                        console.log('[DEBUG] 发现PC端隐藏的最新章节区块(ycxsid)，跳过前9个');
                        $lis = $lis.slice(9);
                    }

                    // 遍历所有章节 <li>
                    $lis.each(function() {
                        let $a = $(this).find('a');
                        if ($a.length === 0) return;

                        let href = $a.attr('href');
                        // 确保是章节链接，且不是javascript
                        if (href && href.includes('/bqg/') && !href.includes('javascript')) {
                            if (!href.startsWith('http')) {
                                href = window.location.origin + href;
                            }
                            // 最终去重加入
                            if (!g_chapterURLList.includes(href)) {
                                g_chapterURLList.push(href);
                                newLinksCount++;
                            }
                        }
                    });
                });

                console.log(`[DEBUG] 本页有效获取 ${newLinksCount} 个新章节。当前总计: ${g_chapterURLList.length}`);

                // --- 2. 查找下一页链接 ---
                let nextPageUrl = null;
                // 寻找 class 为 y 的 a 标签，或者文本包含“下一页”的链接
                let $nextBtns = $doc.find('div.page_num a.y, a.index-container-btn, div.page a');

                $nextBtns.each(function() {
                    let text = $(this).text().trim();
                    let href = $(this).attr('href');
                    if (text.includes('下一页') && href && !href.includes('javascript')) {
                        if (!href.startsWith('http')) {
                            href = window.location.origin + href;
                        }
                        nextPageUrl = href;
                        return false; // 找到就退出 each 循环
                    }
                });

                // --- 3. 递归判断 ---
                // 如果找到了下一页，并且跟当前页URL不同，继续抓取
                if (nextPageUrl && nextPageUrl !== url) {
                    console.log(`[DEBUG] 发现下一页: ${nextPageUrl}，准备获取...`);
                    await fun_sleep(500); // 稍微延迟防风控
                    await processPage(nextPageUrl);
                } else {
                    console.log(`[DEBUG] 没有发现下一页按钮，目录抓取完毕。`);
                }
            }

            // 【触发入口】直接使用当前页面的 URL 和已有的 document 对象作为第一页
            let currentUrl = window.location.href;
            await processPage(currentUrl, $(document));

            console.log(`[DEBUG] --- 章节列表提取结束，最终总章节数: ${g_chapterURLList.length} ---`);
        });


        // 4. 获取章节内容（单页模式：一页即一章）
        g_ctrlMap.set(rule_getChapterContentMode, fun_getChapterContenFromOnePage);

        // 提取章节标题（兼容 PC端的 h3 和手机端的 #chaptername）
        g_ctrlMap.set(rule_getChapterTitle, function($data) {
            let title = $data.find('.word_read h3, #chaptername').text() || $data.find('h1').text();
            return title.replace(/（第\d+页）/g, '').trim();
        });

        // 获取正文容器（兼容 PC端的 .word_read 和手机端的 #txt）
        g_ctrlMap.set(rule_getChapterContentContainer, function($data) {
            let $container = $data.find('.word_read, #txt');

            // 调试拦截：如果获取不到容器（长度为0）
            if ($container.length === 0) {
                let targetUrl = $data.filter('link[rel="canonical"]').attr('href')
                             || $data.find('link[rel="canonical"]').attr('href')
                             || '未知URL';
                console.error("[DEBUG] ❌ 获取章节正文容器失败！(未找到 .word_read 或 #txt)");
                console.error("[DEBUG] 失败章节所在的URL: ", targetUrl);
            }

            return $container;
        });

        // 核心解密逻辑：提取 Base64 编码的文本
        g_ctrlMap.set(rule_getChapterLinesFromContainer, function($container) {
            let lines = [];
            let htmlContent = $container.html() || '';

            // 解析正文中的 base64 加密字符串，例如: qsbs.bb('PHA+...')
            let reg = /qsbs\.bb\(['"](.*?)['"]\)/g;
            let match;
            while ((match = reg.exec(htmlContent)) !== null) {
                try {
                    let base64Str = match[1];
                    // 解码 Base64 -> utf-8 HTML片段
                    let decodedHtml = decodeURIComponent(escape(atob(base64Str)));
                    let text = $(decodedHtml).text().trim();
                    if (text) {
                        lines.push(text);
                    }
                } catch (e) {
                    console.error("正文 Base64 解码失败", e);
                }
            }

            // 补充抓取现有的可见 <p> 标签（排除可能渲染出来的重复项及站内广告）
            $container.find('p').each(function() {
                let text = $(this).text().trim();
                if (text && !text.includes('牢记最新域名') && !text.includes('请勿开启浏览器阅读模式') && !text.includes('相邻推荐') && !text.includes('花有重开日')) {
                     if (!lines.includes(text)) {
                         lines.push(text);
                     }
                }
            });

            return lines;
        });

        // 5. 最终文本净化过滤
        g_ctrlMap.set(rule_filterTxt, function(txt) {
            return txt.replace(/牢记最新域名.*?\\n/g, '')
                      .replace(/请勿开启浏览器阅读模式.*?\\n/g, '')
                      .replace(/相邻推荐.*?\\n/g, '')
                      .replace(/花有重开日.*?\\n/g, '');
        });
    }
    // [FC2 博客 - 猫と柿] 针对单页无列表小说的支持
    else if(fun_checkWebset(url, 'https://3tb4weatuybs\\.blog\\.fc2\\.com/blog-entry-.*\\.html'))
    {
        console.log("激活 FC2 博客单页小说下载规则");

        // local config
        {
            g_bTestDownload = false;    // 是否测试下载
            g_bTestGetChapter = false;  // 是否测试获取章节
            g_iMaxPromiseCount = 1;     // 单页只需要请求 1 次（即当前页本身）
            g_batchSleep = 0;           // 不需要批次睡眠
        }

        // 1. 插入下载按钮
        g_ctrlMap.set(rule_appendDownloadBtn, function(newButton){
            // 将下载按钮插入到文章标题下方的 entry-header-inner 区域
            let $headerInner = $('.entry-header-inner');
            if ($headerInner.length > 0) {
                $headerInner.append(newButton);
                // 简单加点样式让按钮在这个博客里好看一点（可选）
                newButton.css({
                    "margin-left": "15px",
                    "padding": "2px 10px",
                    "background": "#b89b7a",
                    "color": "#fff",
                    "border": "none",
                    "border-radius": "4px",
                    "cursor": "pointer"
                });
                return true;
            }
            return false;
        });

        // 2. 获取书名与作者
        g_ctrlMap.set(rule_novelSaveName, [
            function(){
                let fullTitle = $('meta[property="og:title"]').attr('content') || $('title').text();
                let bookNameMatch = fullTitle.match(/《(.*?)》/);
                let name = bookNameMatch ? bookNameMatch[1] : fullTitle;
                // 确保文件名也经由 OpenCC 转换为简体
                if (typeof OpenCC !== 'undefined' && OpenCC.Converter) {
                    return OpenCC.Converter({ from: 'tw', to: 'cn' })(name);
                }
                return name;
            },
            function(){
                let fullTitle = $('meta[property="og:title"]').attr('content') || $('title').text();
                let authorMatch = fullTitle.match(/by\s+(.+?)($|｜)/);
                let author = authorMatch ? authorMatch[1].trim() : "未知作者";
                if (typeof OpenCC !== 'undefined' && OpenCC.Converter) {
                    return OpenCC.Converter({ from: 'tw', to: 'cn' })(author);
                }
                return author;
            }
        ]);

        // 3. 核心修改：由于整本书就在这一页，章节列表就是“当前页自身”
        g_ctrlMap.set(rule_getChapterListMode, fun_getChapterListFromCurPage);
        g_ctrlMap.set(rule_getChapterListFromCurPage, function(){
            // 直接把当前页面的全链接塞入队列，作为唯一的“下载源”
            g_chapterURLList.push(window.location.href);
        });

        // 4. 获取这一页的全部小说正文
        g_ctrlMap.set(rule_getChapterContentMode, fun_getChapterContenFromOnePage);
        // 此站无须提取单独的“章节标题”，直接返回空（正文开头自带了第1章等字样）
        g_ctrlMap.set(rule_getChapterTitle, function($data){ return ''; }); 
        // 指定主体内容容器
        g_ctrlMap.set(rule_getChapterContentContainer, function($data){
            return $data.find('.inner-contents');
        });
        // 从容器中提取所有的段落
        g_ctrlMap.set(rule_getChapterLinesFromContainer, function($container){
            let lines = [];
            
            // 复制一个克隆体用来操作，防止删除干扰原网页
            let $clone = $container.clone();
            // 移除不需要的 FC2 拍手标签和一些可能存在的非正文组件
            $clone.find('script, a, iframe, div[id*="clap"], .entry-tag').remove();
            
            // 使用 html 并通过替换 <br> 换行符来切分段落，可以完美保留原排版
            let htmlContent = $clone.html() || '';
            // 将所有 <br> 或 <br/> 替换成统一的换行标识符，然后按换行符切割
            let RawLines = htmlContent.replace(/<br\s*\/?>/gi, '\n').split('\n');

            let totalLines = RawLines.length;
            let currentLine = 0;
            let lastPercent = -1; // 用于记录上一次打印的百分比整数

            console.log(`开始清洗正文文本，总原始行数: ${totalLines}`);
            
            RawLines.forEach(function(line) {

                currentLine++;

                // 计算当前进度的百分比整数 (0 到 100)
                let currentPercent = Math.floor((currentLine / totalLines) * 100);

                // 只有当百分比整数增长时，才打印进度
                if (currentPercent > lastPercent) {
                    console.log(`正文文本清洗进度: ${currentPercent}% (${currentLine}/${totalLines} 行)`);
                    lastPercent = currentPercent; // 更新记录点
                }
                
                // 利用 jQuery 的 text() 剥离残留的 HTML 标签（如 <font>, <strong>, <span> 等）
                let cleanText = $('<div>').html(line).text().trim();
                
                // 过滤掉沉余信息：如翻译插件加载提示、空白行
                if (cleanText && 
                    !cleanText.includes('送出拍手') && 
                    !cleanText.includes('缺的章節已補') && 
                    !cleanText.includes('番外更新') &&
                    !cleanText.includes('文案：')) {

                   // 【核心改动】如果繁转简库可用，直接将本行文本转为简体
                   if (typeof OpenCC !== 'undefined' && OpenCC.Converter) {
                        cleanText = OpenCC.Converter({ from: 'tw', to: 'cn' })(cleanText);
                    }
                    lines.push(cleanText);
                }
            });
            return lines;
        });
    }
    else{
        //插入按钮
        //获取书名
        //获取章节列表
        //获取每一章的内容
        console.log("不是书籍主页，脚本不生效！");
    }

    console.log('size:'+g_ctrlMap.size);



    //最终配置
    if(g_ctrlMap.size)
    {
        window.onload=function()
        {
            fun_downloadConfig();
        }
    }

})();