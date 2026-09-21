const EXTENSION_DOMAIN = new URL(chrome.runtime.getURL('')).hostname;
//デッキを開く URL。content script の起動判定と同じ完全一致で比べる
const DECK_URLS = Object.freeze(["https://x.com/run-opdeck", "https://twitter.com/run-opdeck"]);
//タブがデッキを表示しているか。ズーム無効化の 3 箇所 (sender 検証・無効化直前の再確認・解除判定) はこの判定を共有する。
//url が空・未定義のときは false。host permission を持つのは x.com のページだけで、ほかのページでは url が読めず空になるが、それはデッキでない証拠として扱える
function is_deck_url(url){
    return typeof url === "string" && DECK_URLS.includes(url);
}

//インストール時にあらかじめDNRを設定しておく
chrome.runtime.onInstalled.addListener(() => {
    (async () => {
        await update_dnr();
    })();
})

chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse){
        if(request.message == "dnr_upd"){
            (async () => {
                try {
                    await update_dnr();
                    console.log("dnr_update_ok");
                    sendResponse(true);
                } catch(e) {
                    console.error("dnr update failed->", e);
                    sendResponse(false);
                }
            })();
        }
        if(request.message == "text_review"){
            const api_url = "https://opd.kwdev-sys.com/api/opd/text_review/review";
            (async () => {
                try{
                    const res = await fetch(api_url, {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({"text":request.review_text}),
                    });

                    if(!res.ok){
                        console.error(`ReviewFetchError->Code:${res.status}->Text:${res.statusText}`);
                        sendResponse(false);
                        return;
                    }
                    sendResponse(await res.json());
                }catch(error){
                    console.error("Fetch failed:", error);
                    sendResponse(false);
                    return;
                }
            })();
        }
        if(request.message == "deck_zoom_disable"){
            disable_deck_tab_zoom(sender, sendResponse);
        }
        if(request.message == "ext_reload"){
            chrome.runtime.reload();
        }
        return true;
    }
)
//===== デッキのタブのブラウザ標準ズーム無効化 (契約は content.js の「表示サイズ (display scale)」節) =====
//ズーム系のメソッド・tabs.get・onUpdated の status には "tabs" permission が要らないため追加していない。
//Firefox は mode: "disabled" を受け付けず lastError (Unsupported zoom settings) になるため、ズーム無効化は Chromium 限定の機能になる。
//ズーム系の API は Firefox 互換のため callback 形式で呼ぶ

//デッキのタブのズームを無効化する。sender 検証 → タブの現在の url の再確認 → setZoomSettings の順に進み、
//どの経路でも sendResponse を 1 回で完結させる (onMessage のリスナーは末尾で return true して応答を非同期にしているため)
function disable_deck_tab_zoom(sender, sendResponse){
    const tab_id = sender.tab?.id;
    //tab id が無いときにアクティブタブへ代替しない (tabId を省略したズーム API はアクティブタブを対象にするため、無関係なタブのズームを固定してしまう)
    if(typeof tab_id !== "number" || sender.frameId !== 0 || !is_deck_url(sender.url)){
        sendResponse(false);
        return;
    }
    //送信は読み込みの開始から数段の非同期処理を経た後で、そのあいだにタブが別のページへ移っていることがあるため、
    //sender.url だけに頼らず、今そのタブが表示しているページを確かめてから固定する
    chrome.tabs.get(tab_id, function(tab){
        if(chrome.runtime.lastError){
            console.warn("deck_zoom_disable failed->", chrome.runtime.lastError.message);
            sendResponse(false);
            return;
        }
        if(!is_deck_url(tab?.url)){
            sendResponse(false);
            return;
        }
        chrome.tabs.setZoomSettings(tab_id, {mode: "disabled"}, function(){
            if(chrome.runtime.lastError){
                console.warn("deck_zoom_disable failed->", chrome.runtime.lastError.message);
                sendResponse(false);
                return;
            }
            sendResponse(true);
        });
    });
}

//デッキを離れたタブのズーム無効化を元に戻す。
//Chromium の disabled はブラウザ既定倍率へ戻して固定するモードでナビゲーションでは解除されないため、background が戻す。
//無効化中のタブは覚えず、そのつどタブの現在の状態から判定するので、service worker が待機で停止・再起動しても次のイベントで解除できる。
//mode が disabled のタブはこの拡張が固定したものとみなして戻す。どの拡張が固定したかは判別できないため、
//ほかの拡張がタブのズームを disabled にしていた場合も、ブラウザの全タブ (この拡張が host permission を持たないサイトのタブを含む) で次の読み込み状態の変化時に automatic に戻る。
//status を "loading" と "complete" の両方で見るのは、トップフレームの遷移開始の時点では tab.url がまだ遷移前 (デッキ) のことがあるためで、遷移完了時にも判定して確実に戻す
chrome.tabs.onUpdated.addListener(function(tab_id, changeInfo){
    if(changeInfo.status !== "loading" && changeInfo.status !== "complete") return;
    chrome.tabs.getZoomSettings(tab_id, function(zoom_settings){
        if(chrome.runtime.lastError){
            console.warn("deck zoom restore failed->", chrome.runtime.lastError.message);
            return;
        }
        if(zoom_settings?.mode !== "disabled") return;
        chrome.tabs.get(tab_id, function(tab){
            if(chrome.runtime.lastError){
                console.warn("deck zoom restore failed->", chrome.runtime.lastError.message);
                return;
            }
            //デッキを表示したままなら何もしない (カラム iframe の自動更新・再読み込みなど子フレームの遷移でも status は立つため)
            if(is_deck_url(tab?.url)) return;
            chrome.tabs.setZoomSettings(tab_id, {mode: "automatic"}, function(){
                if(chrome.runtime.lastError) console.warn("deck zoom restore failed->", chrome.runtime.lastError.message);
            });
        });
    });
});
//
let access_limit = {
    search:{limit: null, remaining: null, reset_unix_time: null, expires_unix_time: null},
    time_line:{limit: null, remaining: null, reset_unix_time: null, expires_unix_time: null},
    recommend_timeline:{limit: null, remaining: null, reset_unix_time: null, expires_unix_time: null},
    list_timeline:{limit: null, remaining: null, reset_unix_time: null, expires_unix_time: null},
    //リスト一覧ページは操作名の異なる2つのAPIを使う。リミット枠が別なので、それぞれ独立したカテゴリで追跡する
    list_index:{limit: null, remaining: null, reset_unix_time: null, expires_unix_time: null},
    list_management:{limit: null, remaining: null, reset_unix_time: null, expires_unix_time: null}
};
//service worker は待機中に停止して起動し直すたびにメモリが初期化されるため、前回保存した値を復元してから更新する。
//復元前に届いたレスポンスの更新はこの Promise の後に順序付ける。
//storage API は Firefox 向けに callback 形式で呼び、Promise に包む
const access_limit_restored = new Promise((resolve) => {
    chrome.storage.local.get("api_access_limit", (stored) => {
        const stored_limit = stored?.api_access_limit;
        if(stored_limit != undefined){
            for(const category of Object.keys(access_limit)){
                if(stored_limit[category] != undefined) access_limit[category] = stored_limit[category];
            }
        }
        resolve();
    });
});
function send_content_script(value){
    //chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });//firefoxではsession.setAccessLevel()が未対応なのでsessionは一旦お預け
    //chrome.storage.session.set
    chrome.storage.local.set({api_access_limit: value}, function(){
        console.log("set ok");
      });
    /*chrome.storage.local.set({api_access_limit: value}).then(() => {
        console.log("set ok");
      });*/
}

//GraphQL操作名→APIリミット監視カテゴリの対応表
//注意: HomeTimelineはHomeLatestTimelineの部分文字列なので、resp.url.includes()による判定順序が
//このオブジェクトの定義順(=走査順)に依存する。HomeLatestTimelineをHomeTimelineより前に置くこと。
const API_CATEGORY_BY_OPERATION = {
    SearchTimeline: "search",
    HomeLatestTimeline: "time_line",
    HomeTimeline: "recommend_timeline",
    ListLatestTweetsTimeline: "list_timeline",
    CombinedLists: "list_index",
    ListsManagementPageTimeline: "list_management"
};

//リセット時刻 (x-rate-limit-reset) はサーバー時計基準なので、端末時計とのずれの影響を受けないよう、
//サーバー時刻 (date ヘッダー) から求めた「リセットまでの残り秒数」を受信時点の端末時計に足した値を期限とする。
//サーバー時刻が取れない場合はリセット時刻をそのまま期限にする
function calc_expires_unix_time(reset_unix_time, server_unix_time, received_unix_time){
    const reset = Number(reset_unix_time);
    if(!(reset > 0)) return null;
    if(!Number.isFinite(server_unix_time)) return reset;
    return received_unix_time + (reset - server_unix_time);
}

chrome.webRequest.onHeadersReceived.addListener(function (resp) {
    let category = null;
    for(const operation of Object.keys(API_CATEGORY_BY_OPERATION)){
        if(resp.url.includes(operation)){
            category = API_CATEGORY_BY_OPERATION[operation];
            break;
        }
    }

    if (!category) return;

    const received_unix_time = Date.now() / 1000;
    let server_unix_time = null;
    const category_limit = {};
    for(const header of resp.responseHeaders){
        switch (header.name.toLowerCase()) {
            case "x-rate-limit-remaining":
                category_limit.remaining = header.value;
                break;
            case "x-rate-limit-limit":
                category_limit.limit = header.value;
                break;
            case "x-rate-limit-reset":
                category_limit.reset_unix_time = header.value;
                break;
            case "date":
                server_unix_time = Date.parse(header.value) / 1000;
                break;
        }
    }

    access_limit_restored.then(() => {
        Object.assign(access_limit[category], category_limit);
        //期限はリセット時刻とサーバー時刻が同じレスポンス由来のときだけ算出し、リセット時刻が無いレスポンスでは前回の期限を保持する
        if(category_limit.reset_unix_time != undefined){
            access_limit[category].expires_unix_time = calc_expires_unix_time(category_limit.reset_unix_time, server_unix_time, received_unix_time);
        }
        send_content_script(access_limit);
    });
}, { urls: Object.keys(API_CATEGORY_BY_OPERATION).map(operation => `*://x.com/i/api/graphql/*/${operation}*`) }, ['responseHeaders']);


function update_dnr(){
    const dnr_rules = [
        {
            id : 1,
            priority: 1,
            action: {
                type: "modifyHeaders",
                responseHeaders: [
                    {
                        header: "Content-Security-Policy",
                        operation: "remove"
                    },
                    {
                        header: "X-Frame-Options",
                        operation: "remove"
                    }
                ]
            },
            condition : {
                requestDomains: ["x.com", "twitter.com"],
                initiatorDomains: [EXTENSION_DOMAIN, "x.com", "twitter.com"],
                resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest", "script", "stylesheet"]
            }
        },
    ];
    
    return chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1],
        addRules: dnr_rules,
    });
}