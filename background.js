const EXTENSION_DOMAIN = new URL(chrome.runtime.getURL('')).hostname;

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
        if(request.message == "ext_reload"){
            chrome.runtime.reload();
        }
        return true;
    }
)
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