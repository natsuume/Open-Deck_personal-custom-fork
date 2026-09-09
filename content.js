console.log("Welcome to Open-Deck!");
const manifest = chrome.runtime.getManifest();
//試作版の場合は true にする
const is_prototype = false;
if(is_prototype){
    console.log("%cOpen-Deck Prototype", "background:#a1f4ff;padding:5px;border-radius:5px", `Version:${manifest.version}`);
}else{
    console.log("%cOpen-Deck", "background:#a1f4ff;padding:5px;border-radius:5px", `Version:${manifest.version}`);
}
//
const url_path = new URL(location.href);
let is_added_system_color_mode = false;
let apply_ui_color = null;
const i18n_message = chrome.i18n.getMessage;
let profile_store;
let last_load_profile = 0;
let is_removed_default_style = false;
let media_viewer_token = [];
const column_auto_update_state = {
    text_focus: {date: 0, active: false},
    media_viewer: {active: false},
    //開いているメッセージダイアログ (alert / confirm / prompt の代替) の数。1 以上のあいだは自動更新を止める
    message_dialog: {open_count: 0},
};
//テキストフォーカスの状態 (自動更新の停止判定に使う) を更新する。解除するときは経過時間の判定に使う日時も戻す
function set_text_focus_state(is_active){
    column_auto_update_state.text_focus.date = is_active ? Date.now() : 0;
    column_auto_update_state.text_focus.active = is_active;
}
const ui_icon_define = {
    banner_hide:"icon/banner_hide.svg",
    top_bar_hide:"icon/top_hide.svg",
    column_move:"icon/column_move.svg",
    column_close:"icon/column_close.svg",
    column_settings: "icon/settings.svg",
    column_reload:"icon/reload.svg",
    column_pin:"icon/pin.svg",
    column_pinned:"icon/pinned.svg",
    column_widesize:"icon/column_w_size.svg",
    column_add_1:"icon/column_add_1st.svg",
    column_add_2:"icon/column_add_2nd.svg",
    post_form:"icon/post.svg",
    add_timeline_column:"icon/tl_column.svg",
    add_notification_column:"icon/notice_column.svg",
    add_explore_column:"icon/exp_column.svg",
    add_list_column:"icon/list_column.svg",
    add_target_main:"icon/add_target_main.svg",
    add_target_side:"icon/add_target_side.svg",
    profile_save:"icon/profile_save.svg",
    profile_delete:"icon/profile_delete.svg",
    text_review:"icon/text_review.svg",
    forward:"icon/forward.svg",
    next:"icon/next.svg",
    download:"icon/download.svg",
    hashtag_restore:"icon/hashtag_restore.svg",
}
//UNIX時間分秒変換
function unix_time_mmss(input){
    const date = new Date(input * 1000);
    return date.toLocaleTimeString();
}
//ストレージの書き込み監視(主にAPIリミット監視に使う)
let api_limit_obj = null;
//APIリミット表示のカテゴリ定義(表示順)
const API_LIMIT_CATEGORIES = [
    {key: "time_line", label_key: "label_api_timeline"},
    {key: "recommend_timeline", label_key: "label_api_recommend_timeline"},
    {key: "search", label_key: "label_api_search"},
    {key: "list_timeline", label_key: "label_api_list_timeline"},
    {key: "list_index", label_key: "label_api_list_index"},
    {key: "list_management", label_key: "label_api_list_management"}
];
//カテゴリごとの説明行。background の service worker が再起動して値が null に戻っても、最後に観測した行を保持し続ける
const api_limit_description_by_key = {};
//title・alert共通で使うAPIリミットの説明文
let api_limit_description = "";
//期限到来時の再描画タイマー
let api_limit_rerender_timer = null;
//APIリミットのバッジ・tooltip を api_limit_obj から描画する。
//storage の更新時に加え、最も早い期限が来た時点でも呼び直し、通信が無くても回復済みの表示に切り替わるようにする
function render_api_limit_status(){
    clearTimeout(api_limit_rerender_timer);
    api_limit_rerender_timer = null;
    const api_linit_status_btn = document.querySelector("#api_limit_status");
    if(api_limit_obj == null || api_linit_status_btn == null) return;
    const limit_percentages = [];
    let has_expired_category = false;
    let earliest_expires_unix_time = null;
    const now_unix_time = Date.now() / 1000;
    for(const category of API_LIMIT_CATEGORIES){
        const category_limit = api_limit_obj[category.key];
        //古い保存値にはカテゴリ自体が存在しない場合があるため、その場合は無視する
        if(category_limit == undefined || category_limit.remaining == null || !(Number(category_limit.limit) > 0)) continue;
        api_limit_description_by_key[category.key] = `${i18n_message(category.label_key)}${category_limit.remaining}/${category_limit.limit}-${unix_time_mmss(category_limit.reset_unix_time)}`;
        //期限 (background が端末時計基準で算出した値) を過ぎた値は枠が回復済みなので、残存率の最小値計算には含めない (説明行にはリセット時刻付きで残す)
        //期限が欠損・数値でない値は期限切れと判断できないため、そのまま計算に含める
        const expires_unix_time = Number(category_limit.expires_unix_time ?? category_limit.reset_unix_time);
        if(expires_unix_time > 0 && expires_unix_time <= now_unix_time){
            has_expired_category = true;
            continue;
        }
        if(expires_unix_time > 0 && (earliest_expires_unix_time == null || expires_unix_time < earliest_expires_unix_time)){
            earliest_expires_unix_time = expires_unix_time;
        }
        limit_percentages.push(category_limit.remaining / category_limit.limit * 100);
    }
    api_limit_description = API_LIMIT_CATEGORIES
        .filter(category => api_limit_description_by_key[category.key] != undefined)
        .map(category => api_limit_description_by_key[category.key])
        .join("\n");
    if(limit_percentages.length > 0){
        api_linit_status_btn.textContent = `${Math.floor(Math.min(...limit_percentages))}%`;
    }else if(has_expired_category){
        //観測済みの枠がすべてリセット時刻を過ぎている = 全枠が回復済み
        api_linit_status_btn.textContent = "100%";
    }
    //一度も値を観測していない場合はバッジの表示を変えない
    api_linit_status_btn.title = `${i18n_message("msg_api_limit_status_title", [api_limit_description])}`;
    if(earliest_expires_unix_time != null){
        //期限ちょうどの再描画で判定が now と同値になっても期限切れ側に倒れるよう、1 秒余裕を持たせる。
        //setTimeout の遅延上限 (2^31-1 ms) を超えると即時発火して再描画を繰り返すため、上限で打ち切って次回の描画で残りを待つ
        const delay_ms = Math.min((earliest_expires_unix_time - now_unix_time + 1) * 1000, 2147483647);
        api_limit_rerender_timer = setTimeout(render_api_limit_status, delay_ms);
    }
}
chrome.storage.onChanged.addListener((changes, namespace) => {
    if(changes.api_access_limit != undefined){
        //console.log(changes)
        api_limit_obj = changes.api_access_limit.newValue;
        render_api_limit_status();
    }
  });
//
if(location.href == "https://twitter.com/run-opdeck" || location.href == "https://x.com/run-opdeck"){
    //testmode
    if(url_path.pathname == "/run-opdeck_test.html"){
        //init();
        console.log("testmode")
        chrome.runtime.sendMessage({message: "dnr_upd_internal_dsp"}).then((value)=>{
            init();
        });
    }else{
        if(navigator.brave != undefined){
            chrome.runtime.sendMessage({message: "dnr_upd"}).then((value)=>{
                init();
            });
            //init();
        }else{
            chrome.runtime.sendMessage({message: "dnr_upd"}).then((value)=>{
                init();
            });
        }
    }
    //chrome.runtime.sendMessage({message: "dnr_upd"});
    function init(){
        //console.log("Welcome to Open-Deck!");
        chrome.storage.local.get("opd_settings", function(value){
            //初回起動 (設定が無い) は settings_init が既定の設定とプロファイルを書き込んでページを再読み込みするため、この起動ではプロファイルを読まない
            let is_first_time_init = false;
            if(value.opd_settings == undefined){
                last_load_profile = 0;
                is_first_time_init = true;
                settings_init();
            }else{
                if(JSON.parse(value.opd_settings).last_load_profile == undefined){
                    if(confirm(i18n_message("msg_profile_data_broken_confirm"))){
                        chrome.storage.local.remove("opd_settings", function(){
                            alert(i18n_message("msg_profile_init_completed"));
                        });
                    }else{
                        last_load_profile = 0;
                    }
                }else{
                    last_load_profile = JSON.parse(value.opd_settings).last_load_profile;
                }
                //console.log(last_load_profile);
            }
            
            if(is_first_time_init) return;
            chrome.storage.local.get("opd_profile_store", function(store_value){
                //console.log(store_value)
                //console.log(JSON.parse(store_value.opd_profile_store))
                //読み出せない・配列でない保存値は、このセッションのメモリ上だけ既定プロファイル 1 件へ差し替える (run() は配列であることを前提に読む)
                //保存値そのものは書き換えず、プロファイルローダーから元のデータを読み出して手で直せる余地を残す (次にカラム構成を保存した時点で上書きされる)
                let is_profile_store_unreadable = false;
                try{
                    profile_store = JSON.parse(store_value.opd_profile_store);
                }catch(e){
                    profile_store = null;
                }
                if(!Array.isArray(profile_store)){
                    profile_store = [create_default_profile()];
                    is_profile_store_unreadable = true;
                }
                //保存形式を現在のスキーマへ正規化する。読める保存値を補正した場合は保存し、run には正規化後の設定を渡す
                if(normalize_profile_store(profile_store) && !is_profile_store_unreadable){
                    chrome.storage.local.set({'opd_profile_store': JSON.stringify(profile_store)});
                }
                //RUN
                let ext_update_flag = null;
                let ext_settings = null;
                if(value.opd_settings != undefined){
                    if(JSON.parse(value.opd_settings).version != manifest.version){
                        ext_update_flag = true;
                    }else{
                        ext_update_flag = false;
                    }
                }
                if(value.opd_settings == undefined || ext_update_flag == true){
                    //settings_init();
                    //ext_settings = JSON.parse(value.opd_settings);
                    if(profile_store[last_load_profile]?.profile == undefined){
                        let recovery_setting = JSON.parse(value.opd_settings);
                        recovery_setting.last_load_profile = 0;
                        chrome.storage.local.set({'opd_settings': JSON.stringify(recovery_setting)}, function(){
                            alert(i18n_message("msg_settings_auto_repair"));
                            last_load_profile = 0;
                            window.reload();
                        });
                    }

                    //Updateされたときに設定のバージョンを上げる
                    if(ext_update_flag){
                        const setting = JSON.parse(value.opd_settings);
                        setting.version = manifest.version;
                        chrome.storage.local.set({'opd_settings': JSON.stringify(setting)}, function(){
                            if(confirm(i18n_message("app_update"))){
                                open(`https://github.com/kawa-nobu/Open-Deck/releases/tag/v${manifest.version}`, '_blank', 'popup');
                            }
                        });
                    }
                    ext_settings = {column_settings:profile_store[last_load_profile].profile, global_settings:profile_store[last_load_profile].global_settings};
                }else{
                    //ext_settings = JSON.parse(value.opd_settings);
                    if(profile_store[last_load_profile]?.profile == undefined){
                        let recovery_setting = JSON.parse(value.opd_settings);
                        recovery_setting.last_load_profile = 0;
                        chrome.storage.local.set({'opd_settings': JSON.stringify(recovery_setting)}, function(){
                            alert(i18n_message("msg_settings_auto_repair"));
                            last_load_profile = 0;
                            window.reload();
                        });
                    }
                    ext_settings = {column_settings:profile_store[last_load_profile].profile, global_settings:profile_store[last_load_profile].global_settings};
                }
                //console.log(ext_settings);
                run(ext_settings);
            });
        });
    }
}
function run(settings){
    //console.log(settings)
    //現在のプロファイルの全体設定。run() の呼び出し元 (init 内の 2 箇所とプロファイル切替) は
    //{column_settings, global_settings} の形で、読み込むプロファイルの global_settings を必ず渡す
    let global_settings = clone_global_settings(settings.global_settings);
    let profile_list_html;
    let profile_list_btn_html = "";
    //プロファイルリスト初期化
    for (let index = 0; index < profile_store.length; index++) {
        profile_list_btn_html += `<div class="dsp_btn_parent" title="${i18n_message("ui_profile_switch_title")}" id="userProfile-${index}"><div class="dsp_btn_change_profile_btn">P${index}</div></div>`;//<div class="profile_list"><input type="button" id="userProfile-${index}" value="P${index}"></div>
    }
    profile_list_html = `<div class="profile_val_now" title="${i18n_message("ui_profile_current_title")}">${last_load_profile}</div><div class="dsp_profile_list"><div id="profile_btn_list">${profile_list_btn_html}</div></div>`;
    //console.log(profile_list_btn_html)
    //カラム全体のテキストフォーカスの状態で自動更新を制御できるようにする
    window.addEventListener('opd_post_focus', (e) => {
        const detail = JSON.parse(e.detail);
        if(detail){
            set_text_focus_state(true);
        }else{
            set_text_focus_state(false);
        }
    });
    //画像表示パネル
    const media_viewer = new OpdExtMediaViewer();
    document.addEventListener('opd_send_media_info', (e) => {
        const detail = JSON.parse(e.detail);
        for (let index = 0; index < media_viewer_token.length; index++) {
            const token = media_viewer_token[index];
            if(detail.token === token){
                //ビューワーを閉じた際のコールバック関数
                function viewer_close(){
                    column_auto_update_state.media_viewer.active = false;
                }
                
                column_auto_update_state.media_viewer.active = true;
                media_viewer.Preview(detail.media_info, detail.selected_index, viewer_close);
                break;
            }
        }
    });
    //CSSタグ追加
    document.querySelector("head").insertAdjacentHTML("afterbegin", `<style opd_default_css>
    html{
        overflow-y:hidden !important;
    }
    /*デザイントークン。色・余白・角丸・影・字形はすべてここで決め、各要素はこの変数だけを参照する。ダークモードは末尾の [opd-dsp-theme="dark"] で同じ変数を上書きする*/
    #opd_main_element{
        --opd-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic UI", Meiryo, Arial, sans-serif;
        --opd-bg: #eff3f4;
        --opd-surface: #ffffff;
        --opd-surface-2: #f7f9f9;
        --opd-surface-hover: rgba(15, 20, 25, 0.08);
        --opd-surface-active: rgba(15, 20, 25, 0.14);
        --opd-border: #cfd9de;
        --opd-border-soft: #eff3f4;
        --opd-text: #0f1419;
        --opd-text-muted: #536471;
        --opd-accent: #1d9bf0;
        --opd-accent-hover: #1a8cd8;
        --opd-accent-soft: rgba(29, 155, 240, 0.12);
        --opd-on-accent: #ffffff;
        --opd-danger: #f4212e;
        --opd-danger-soft: rgba(244, 33, 46, 0.1);
        --opd-skeleton: #e6ecf0;
        --opd-skeleton-shine: #f7f9f9;
        --opd-overlay: rgba(15, 20, 25, 0.45);
        --opd-select-arrow: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23536471' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
        --opd-radius-sm: 6px;
        --opd-radius-md: 10px;
        --opd-radius-lg: 16px;
        --opd-radius-full: 9999px;
        --opd-shadow-sm: 0 1px 2px rgba(15, 20, 25, 0.08);
        --opd-shadow-lg: 0 16px 48px rgba(15, 20, 25, 0.28);
        --opd-sidebar-width: 60px;
        --opd-column-gap: 8px;
        --opd-column-burn-in: 1;
        --opd_side_rack_width: 0px;
        font-family: var(--opd-font);
        font-size: 0.875rem;
        line-height: 1.4;
        color: var(--opd-text);
        background: var(--opd-bg) !important;
        -webkit-font-smoothing: antialiased;
    }
    #opd_main_element *,
    #opd_main_element *::before,
    #opd_main_element *::after{
        box-sizing: border-box;
    }
    #opd_main_element :focus-visible{
        outline: 2px solid var(--opd-accent);
        outline-offset: 2px;
    }
    #opd_main_element ::selection{
        background: var(--opd-accent-soft);
    }
    /*アイコン。SVG を mask にして currentColor で塗るため、色はテーマの文字色・アクセント色にそのまま追従する*/
    .opd_icon,
    .dsp_btn_parent > div:not(.dsp_btn_change_profile_btn),
    .dsp_column_move_icon,
    .dsp_column_settings_btn,
    .dsp_column_reload_btn,
    .dsp_column_close_btn,
    .media_viewer_icon_close,
    .media_viewer_icon_forward,
    .media_viewer_icon_next,
    .media_viewer_icon_download{
        display: inline-block;
        flex: none;
        width: 1.375rem;
        height: 1.375rem;
        background-color: currentColor;
        -webkit-mask: var(--opd-icon) center / contain no-repeat;
        mask: var(--opd-icon) center / contain no-repeat;
    }
    .dsp_btn_post_form_img{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.post_form)}); }
    .dsp_btn_manage_columns_img{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.column_add_1)}); }
    .dsp_btn_global_settings_img{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.column_settings)}); }
    .dsp_btn_add_target_img{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.add_target_main)}); }
    .dsp_btn_profile_add_img{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.profile_save)}); }
    .dsp_btn_profile_delete_img{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.profile_delete)}); }
    .dsp_column_move_icon{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.column_move)}); }
    .dsp_column_settings_btn{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.column_settings)}); }
    .dsp_column_reload_btn{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.column_reload)}); }
    .dsp_column_close_btn{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.column_close)}); }
    .opd_icon_column_add_1{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.column_add_1)}); }
    .opd_icon_column_add_2{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.column_add_2)}); }
    .media_viewer_icon_close{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.column_close)}); }
    .media_viewer_icon_forward{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.forward)}); }
    .media_viewer_icon_next{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.next)}); }
    .media_viewer_icon_download{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.download)}); }
    /*ボタン primitive。<button> と <input type="button"> の両方に同じ見た目を与える*/
    .opd_btn{
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.375rem;
        min-height: 2.125rem;
        padding: 0 1rem;
        border: 1px solid var(--opd-border);
        border-radius: var(--opd-radius-full);
        background: var(--opd-surface);
        color: var(--opd-text);
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
        line-height: 1;
        cursor: pointer;
        transition: background-color 0.15s, border-color 0.15s, color 0.15s;
    }
    .opd_btn:hover{
        background: var(--opd-surface-hover);
    }
    .opd_btn:active{
        background: var(--opd-surface-active);
    }
    .opd_btn_primary{
        border-color: transparent;
        background: var(--opd-accent);
        color: var(--opd-on-accent);
    }
    .opd_btn_primary:hover{
        background: var(--opd-accent-hover);
    }
    .opd_btn_primary:active{
        background: var(--opd-accent-hover);
    }
    .opd_btn_sm{
        min-height: 1.75rem;
        padding: 0 0.75rem;
        font-size: 0.75rem;
    }
    /*フォーム入力 primitive*/
    .opd_input,
    .opd_select,
    .opd_textarea{
        min-height: 2.125rem;
        padding: 0 0.625rem;
        border: 1px solid var(--opd-border);
        border-radius: var(--opd-radius-sm);
        background: var(--opd-surface);
        color: var(--opd-text);
        font: inherit;
        font-size: 0.8125rem;
        transition: border-color 0.15s, box-shadow 0.15s;
    }
    .opd_input:hover,
    .opd_select:hover,
    .opd_textarea:hover{
        border-color: var(--opd-text-muted);
    }
    .opd_input:focus,
    .opd_select:focus,
    .opd_textarea:focus{
        outline: none;
        border-color: var(--opd-accent);
        box-shadow: 0 0 0 3px var(--opd-accent-soft);
    }
    .opd_input[aria-invalid="true"]{
        border-color: var(--opd-danger);
        box-shadow: 0 0 0 3px var(--opd-danger-soft);
    }
    .opd_select{
        padding-right: 1.75rem;
        appearance: none;
        -webkit-appearance: none;
        background-image: var(--opd-select-arrow);
        background-repeat: no-repeat;
        background-position: right 0.5rem center;
        cursor: pointer;
    }
    .opd_textarea{
        padding: 0.5rem 0.625rem;
        resize: vertical;
        line-height: 1.4;
    }
    /*トグルスイッチ (checkbox を appearance:none で描く)。knob は input の擬似要素を描画しないエンジン (Gecko) でも出るよう背景画像で描き、位置で状態を伝える*/
    .opd_switch{
        appearance: none;
        -webkit-appearance: none;
        flex: none;
        width: 2.5rem;
        height: 1.375rem;
        margin: 0;
        border-radius: var(--opd-radius-full);
        background-color: var(--opd-border);
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='8' fill='%23ffffff'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-size: 1rem 1rem;
        background-position: left 0.1875rem center;
        cursor: pointer;
        transition: background-color 0.2s, background-position 0.2s;
    }
    .opd_switch:checked{
        background-color: var(--opd-accent);
        background-position: right 0.1875rem center;
    }
    .opd_checkbox{
        width: 1rem;
        height: 1rem;
        margin: 0;
        accent-color: var(--opd-accent);
        cursor: pointer;
    }
    /*サイドバー*/
    #opd_sidebar{
        position: fixed;
        top: 0;
        left: 0;
        z-index: 999;
        height: 100%;
    }
    #opd_sidebar > div[opd_column_type="dsp_column"]{
        display: flex;
        flex-direction: column;
        width: var(--opd-sidebar-width);
        min-width: var(--opd-sidebar-width);
        max-width: var(--opd-sidebar-width);
        height: 100%;
        overflow: hidden auto;
        scrollbar-width: none;
        background: var(--opd-surface);
        border-right: 1px solid var(--opd-border-soft);
    }
    .main_bar_functions{
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
        padding: 0.5rem 0 1rem;
    }
    .main_bar_functions hr{
        width: 1.75rem;
        height: 1px;
        margin: 0.25rem 0;
        border: 0;
        background: var(--opd-border-soft);
    }
    .opd_ui_logo_parent{
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.125rem;
        width: 100%;
        margin-bottom: 0.25rem;
    }
    .opd_ui_logo{
        width: 2.25rem;
        height: 2.25rem;
        border-radius: 50%;
        background: url(${chrome.runtime.getURL("icon/logo_icon.svg")}) center / cover no-repeat;
        cursor: pointer;
        transition: transform 0.15s;
    }
    .opd_ui_logo:hover{
        transform: scale(1.06);
    }
    .opd_version_span{
        font-size: 0.625rem;
        font-variant-numeric: tabular-nums;
        color: var(--opd-text-muted);
        cursor: pointer;
        user-select: none;
    }
    .opd_debug_menu{
        display: none;
        flex-direction: column;
        align-items: stretch;
        gap: 0.25rem;
        width: 100%;
        padding: 0 0.25rem 0.25rem;
        font-size: 0.625rem;
        text-align: center;
        color: var(--opd-text-muted);
    }
    .opd_debug_menu .opd_btn{
        min-height: 1.5rem;
        padding: 0 0.25rem;
        font-size: 0.5625rem;
        white-space: normal;
    }
    #api_limit_status{
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 2.75rem;
        height: 1.5rem;
        padding: 0 0.375rem;
        border-radius: var(--opd-radius-full);
        background: var(--opd-surface-2);
        font-size: 0.6875rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--opd-text-muted);
        cursor: help;
    }
    #api_limit_status:hover{
        background: var(--opd-surface-hover);
        color: var(--opd-text);
    }
    .dsp_btn_parent{
        display: flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 50%;
        color: var(--opd-text);
        cursor: pointer;
        user-select: none;
        transition: background-color 0.15s, color 0.15s;
    }
    .dsp_btn_parent:hover{
        background: var(--opd-surface-hover);
    }
    .dsp_btn_parent:active{
        background: var(--opd-surface-active);
    }
    .dsp_btn_parent:focus-visible{
        outline: 2px solid var(--opd-accent);
        outline-offset: -2px;
    }
    /*投稿ボタンはアクセント色の塗りで主操作として目立たせる*/
    #open_post_form{
        background: var(--opd-accent);
        color: var(--opd-on-accent);
        box-shadow: var(--opd-shadow-sm);
    }
    #open_post_form:hover,
    #open_post_form[aria-expanded="true"]{
        background: var(--opd-accent-hover);
    }
    /*追加先切替は押下状態 (サイドラック) をアクセント色で示す*/
    #add_target_toggle[aria-pressed="true"]{
        background: var(--opd-accent-soft);
        color: var(--opd-accent);
    }
    #profile_delete:hover{
        background: var(--opd-danger-soft);
        color: var(--opd-danger);
    }
    .profile_val_now{
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 1.75rem;
        height: 1.25rem;
        margin: 0.25rem 0;
        padding: 0 0.5rem;
        border-radius: var(--opd-radius-full);
        background: var(--opd-accent);
        color: var(--opd-on-accent);
        font-size: 0.6875rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        cursor: default;
    }
    .dsp_profile_list{
        width: 100%;
        max-height: 1000px;
        overflow-y: auto;
        scrollbar-width: none;
    }
    #profile_btn_list{
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
    }
    #profile_btn_list .dsp_btn_parent{
        width: 2.5rem;
        height: 1.75rem;
        border-radius: var(--opd-radius-full);
        border: 1px solid var(--opd-border);
        background: var(--opd-surface);
        color: var(--opd-text-muted);
    }
    #profile_btn_list .dsp_btn_parent:hover{
        border-color: var(--opd-accent);
        background: var(--opd-accent-soft);
        color: var(--opd-accent);
    }
    .dsp_btn_change_profile_btn{
        font-size: 0.6875rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        line-height: 1;
    }
    /*ラック*/
    #main_rack_element{
        position: fixed;
        top: 0;
        left: var(--opd-sidebar-width);
        height: 100vh;
        width: calc(100vw - var(--opd-sidebar-width) - var(--opd_side_rack_width));
        max-width: calc(100vw - var(--opd-sidebar-width) - var(--opd_side_rack_width));
        overflow: auto hidden;
        scrollbar-width: thin;
        scrollbar-color: var(--opd-border) transparent;
    }
    #opd_main_element[opd_side_rack_position="left"] #main_rack_element{
        left: calc(var(--opd-sidebar-width) + var(--opd_side_rack_width));
    }
    #first_rack_element{
        gap: var(--opd-column-gap);
        padding: var(--opd-column-gap);
    }
    #first_rack_element > section.dsp_column{
        flex: 0 0 auto;
    }
    #side_rack_element{
        position: fixed;
        top: 0;
        height: 100vh;
        display: flex;
        flex-direction: row;
        gap: var(--opd-column-gap);
        width: max-content;
        max-width: calc(100vw - var(--opd-sidebar-width) - ${COLUMN_WIDTH_MIN_REM}rem);
        padding: var(--opd-column-gap);
        overflow: auto hidden;
        scrollbar-width: none;
        z-index: 998;
        background: var(--opd-bg);
    }
    #opd_main_element[opd_side_rack_position="left"] #side_rack_element{
        left: var(--opd-sidebar-width);
        border-right: 1px solid var(--opd-border);
    }
    #opd_main_element[opd_side_rack_position="right"] #side_rack_element{
        right: 0;
        border-left: 1px solid var(--opd-border);
    }
    #side_rack_element > section.dsp_column{
        flex: 0 0 auto;
    }
    #side_rack_element[hidden],
    .dsp_column_side_emptycolumn[hidden]{
        display: none;
    }
    #main_bar_empty_column{
        display: none;
    }
    div[opd_column_type="dsp_column"]{
        overflow-x: scroll;
        scrollbar-width: none;
    }
    /*案内カラム (メインラック末尾・サイドラック末尾)*/
    .dsp_column_emptycolumn,
    .dsp_column_side_emptycolumn{
        border: 2px dashed var(--opd-border);
        border-radius: var(--opd-radius-lg);
        color: var(--opd-text-muted);
    }
    .dsp_column_emptycolumn > div,
    .dsp_column_side_emptycolumn > div{
        height: 100%;
        min-width: 30rem;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .dsp_column_emptycolumn > div > div,
    .dsp_column_side_emptycolumn > div > div{
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    .dsp_column_emptycolumn .opd_icon,
    .dsp_column_side_emptycolumn .opd_icon{
        width: 3rem;
        height: 3rem;
        opacity: 0.6;
    }
    .dsp_column_emptycolumn p,
    .dsp_column_side_emptycolumn p{
        margin: 0.75rem 0 0;
        text-align: center;
        font-size: 0.875rem;
    }
    /*カラム*/
    .dsp_column_draggable_true{
        display: flex;
        flex-direction: column;
        border: 1px solid var(--opd-border-soft);
        border-radius: var(--opd-radius-lg);
        background: var(--opd-surface);
        box-shadow: var(--opd-shadow-sm);
        overflow: hidden;
    }
    .dsp_column_draggable_true div[opd_column_type]{
        display: flex;
        flex-direction: column;
    }
    .dsp_column iframe{
        border: 0;
    }
    .column_bar{
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 0.375rem;
        width: 100%;
        min-height: 3.5rem;
        padding: 0.5rem 0.5rem 0.5rem 0.375rem;
        overflow: hidden;
        background: var(--opd-surface);
        border-bottom: 1px solid var(--opd-border-soft);
    }
    .dsp_column_title{
        display: flex;
        align-items: center;
        gap: 0.375rem;
        flex: 1 1 auto;
        min-width: 0;
        cursor: grab;
    }
    .dsp_column_title:active{
        cursor: grabbing;
    }
    .dsp_column_move_icon{
        width: 1rem;
        height: 1rem;
        flex: none;
        color: var(--opd-text-muted);
    }
    /*カラム種別を示す丸アイコン。mask で塗る要素には擬似要素を描けないため、円は要素自身の背景色で、絵柄は ::after の mask で描く*/
    .opd_column_kind_icon{
        width: 2.25rem;
        height: 2.25rem;
        flex: none;
        border-radius: 50%;
        background-color: var(--opd-surface-2);
    }
    .opd_column_kind_icon::after{
        content: "";
        display: block;
        width: 1.125rem;
        height: 1.125rem;
        margin: 0.5625rem;
        background-color: var(--opd-text-muted);
        -webkit-mask: var(--opd-icon) center / contain no-repeat;
        mask: var(--opd-icon) center / contain no-repeat;
    }
    div[opd_column_type="home"] .opd_column_kind_icon{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.add_timeline_column)}); }
    div[opd_column_type="notification"] .opd_column_kind_icon{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.add_notification_column)}); }
    div[opd_column_type="explore"] .opd_column_kind_icon{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.add_explore_column)}); }
    div[opd_column_type="explore"][opd_column_kind="list"] .opd_column_kind_icon{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.add_list_column)}); }
    /*見出しのテキストは 2 段組 (上段: 文脈ラベル、下段: タイトル)。ラベルが空のときも高さが変わらないよう空白文字を描く*/
    .opd_column_heading{
        display: flex;
        flex-direction: column;
        min-width: 0;
        line-height: 1.25;
    }
    .opd_column_label{
        font-size: 0.75rem;
        color: var(--opd-text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .opd_column_label:empty::before{
        content: "\\00a0";
    }
    .opd_column_name{
        font-size: 0.9375rem;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .dsp_column_btn{
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 1.75rem;
        min-width: 1.75rem;
        height: 1.75rem;
        border-radius: 50%;
        color: var(--opd-text-muted);
        overflow: hidden;
        cursor: pointer;
        transition: background-color 0.15s, color 0.15s;
    }
    .dsp_column_btn:hover{
        background: var(--opd-surface-hover);
        color: var(--opd-text);
    }
    /*設定で出し分けるボタン (更新ボタン) は hidden 属性で隠す。display: flex のクラス指定が UA の [hidden] より優先されるため明示する*/
    .dsp_column_btn[hidden]{
        display: none;
    }
    /*ボタン枠の中の input (透明で全面に重ねる) がキーボード操作でフォーカスされたときだけ枠にリングを出す*/
    .dsp_column_btn:has(input:focus-visible){
        outline: 2px solid var(--opd-accent);
        outline-offset: -2px;
    }
    .dsp_column_btn label{
        width: 1rem;
        height: 1rem;
        cursor: pointer;
    }
    .dsp_column_btn input{
        opacity: 0;
        position: absolute;
        inset: 0;
        z-index: 10;
        width: 100%;
        height: 100%;
        margin: 0;
        cursor: pointer;
    }
    .dsp_column_empty_area{
        flex: 1 1 auto;
        align-self: stretch;
        min-width: 0.5rem;
        cursor: pointer;
    }
    .dsp_column_close_btn_wrap{
        display: flex;
        justify-content: flex-end;
    }
    .dsp_column_close_btn_wrap .dsp_column_btn:hover{
        background: var(--opd-danger-soft);
        color: var(--opd-danger);
    }
    /*ポスト表示中だけ出す副見出し。カラムバーの直下に置き、戻るボタン (.opd_column_subbar_back) の見た目はポストフォームの閉じるボタンと共有する*/
    .opd_column_subbar{
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 3rem;
        padding: 0.375rem 0.5rem;
        background: var(--opd-surface);
        border-bottom: 1px solid var(--opd-border-soft);
    }
    .opd_column_subbar[hidden]{
        display: none;
    }
    /*副見出しが主役になるよう、元の見出しは薄くする。設定・閉じるボタンはコントラストを保つため薄くしない*/
    div[opd_column_detail="post"] > .column_bar :is(.opd_column_heading, .opd_column_kind_icon, .dsp_column_move_icon){
        opacity: 0.55;
    }
    /*カラム設定パネル (カラムバー・副見出しの下に開く)*/
    /*縦に短いウィンドウでは iframe に押し潰されず、パネル内をスクロールして全項目に届く*/
    .dsp_column_settings_panel{
        display: none;
        position: relative;
        width: inherit;
        height: auto;
        max-height: 60vh;
        flex: 0 0 auto;
        flex-direction: column;
        overflow-y: auto;
        scrollbar-width: thin;
        background: var(--opd-surface-2);
        border-bottom: 1px solid var(--opd-border-soft);
    }
    .dsp_column_settings_panel_content{
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
        padding: 0.75rem;
    }
    .dsp_column_settings_panel_content h2{
        margin: 0;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--opd-text-muted);
    }
    .dsp_column_settings_list{
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
        margin: 0;
        padding: 0.25rem 0.625rem;
        border: 1px solid var(--opd-border-soft);
        border-radius: var(--opd-radius-md);
        background: var(--opd-surface);
    }
    .dsp_column_settings_content_div{
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.25rem 0.75rem;
        min-height: 2.25rem;
        padding: 0.25rem 0;
        font-size: 0.8125rem;
    }
    .dsp_column_settings_content_div + .dsp_column_settings_content_div{
        border-top: 1px solid var(--opd-border-soft);
    }
    /*狭いカラムでは入力群が次の行へ折り返し、右寄せのまま収まる*/
    .dsp_column_settings_content_div > span{
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 0.375rem;
        flex: 1 1 auto;
        margin-left: auto;
        font-size: 0.75rem;
        color: var(--opd-text-muted);
    }
    /*入力欄と単位の接尾辞は折り返しで離れないよう 1 つの塊にする*/
    .opd_settings_input_group{
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        white-space: nowrap;
    }
    .dsp_column_settings_content_div > span > label{
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        cursor: pointer;
    }
    .dsp_column_settings_content_div .opd_select,
    .dsp_column_settings_content_div .opd_input{
        min-height: 1.75rem;
        font-size: 0.75rem;
    }
    .opd_column_settings_input_text{
        width: 4.5rem;
    }
    /*入力を受け付けない状態 (readonly + aria-disabled)。フォーカスと tooltip は残す*/
    .opd_column_settings_input_text[aria-disabled="true"]{
        opacity: 0.55;
        cursor: not-allowed;
        background: var(--opd-surface-2);
    }
    .dsp_column_settings_panel_close_btn_wrap{
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
    }
    /*モーダルダイアログ共通 (カラム管理・全体設定・確認 / 入力ダイアログ)*/
    .opd_dialog_overlay{
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        background: var(--opd-overlay);
        animation: opd_fade_in 0.12s ease-out;
    }
    .opd_dialog{
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        max-width: 100%;
        max-height: 100%;
        overflow-y: auto;
        padding: 1.25rem;
        border: 1px solid var(--opd-border-soft);
        border-radius: var(--opd-radius-lg);
        background: var(--opd-surface);
        color: var(--opd-text);
        box-shadow: var(--opd-shadow-lg);
        scrollbar-width: thin;
        animation: opd_dialog_in 0.16s ease-out;
    }
    .opd_dialog h2{
        margin: 0;
        font-size: 1.125rem;
        font-weight: 700;
        line-height: 1.3;
    }
    .opd_dialog h3{
        margin: 0;
        font-size: 0.875rem;
        font-weight: 700;
    }
    .opd_dialog label{
        font-size: 0.8125rem;
    }
    .opd_dialog_actions{
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 0.25rem;
    }
    @keyframes opd_fade_in{
        from{ opacity: 0; }
        to{ opacity: 1; }
    }
    @keyframes opd_dialog_in{
        from{ opacity: 0; transform: translateY(6px) scale(0.98); }
        to{ opacity: 1; transform: none; }
    }
    /*確認・入力・通知ダイアログ (confirm / prompt / alert の代替)*/
    .opd_message_dialog{
        width: 26rem;
    }
    .opd_message_dialog_body{
        margin: 0;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        font-size: 0.875rem;
        color: var(--opd-text);
    }
    .opd_message_dialog_input{
        width: 100%;
    }
    /*全体設定ダイアログ*/
    .opd_global_settings_dialog{
        width: 28rem;
        gap: 0;
    }
    .opd_global_settings_dialog h2{
        margin-bottom: 0.25rem;
    }
    .opd_global_settings_description{
        margin: 0 0 0.75rem;
        font-size: 0.8125rem;
        color: var(--opd-text-muted);
    }
    .opd_global_settings_row{
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        min-height: 2.75rem;
        padding: 0.25rem 0;
        border-top: 1px solid var(--opd-border-soft);
    }
    .opd_global_settings_row > span{
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.8125rem;
        color: var(--opd-text-muted);
    }
    .opd_global_settings_status{
        min-height: 1.5rem;
        margin-top: 0.5rem;
        font-size: 0.8125rem;
        color: var(--opd-danger);
    }
    .opd_global_settings_actions{
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
        gap: 0.5rem;
    }
    /*カラム管理ダイアログ*/
    .opd_column_manager_overlay{
        /*iframe 内の選択表示へ JS が getComputedStyle で読み出して注入する色 (var() は計算値で解決される)*/
        --opd-list-picker-accent: var(--opd-accent);
        --opd-list-picker-accent-text: var(--opd-on-accent);
        --opd-list-picker-accent-background: var(--opd-accent-soft);
        --opd-frame-surface: var(--opd-surface);
        --opd-frame-skeleton: var(--opd-skeleton);
    }
    .opd_column_manager_dialog{
        width: 76rem;
    }
    .opd_column_manager_body{
        display: flex;
        flex-direction: row;
        gap: 1.25rem;
        min-height: 0;
    }
    .opd_column_manager_add{
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        flex: 3 1 0;
        min-width: 0;
    }
    .opd_column_manager_lists{
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        flex: 2 1 0;
        min-width: 0;
    }
    .opd_column_manager_target_row{
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.75rem;
        font-size: 0.8125rem;
    }
    .opd_column_manager_target_row label{
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        cursor: pointer;
    }
    .opd_radio{
        width: 1rem;
        height: 1rem;
        margin: 0;
        accent-color: var(--opd-accent);
        cursor: pointer;
    }
    .opd_column_manager_type_buttons{
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    /*行と種別ボタンのカラム種別アイコン (カラム見出しの丸アイコンと同じ絵柄を小さく描く)*/
    .opd_column_manager_type_icon{
        width: 1.5rem;
        height: 1.5rem;
        flex: none;
        border-radius: 50%;
        background-color: var(--opd-surface-2);
    }
    .opd_column_manager_type_icon::after{
        content: "";
        display: block;
        width: 0.875rem;
        height: 0.875rem;
        margin: 0.3125rem;
        background-color: var(--opd-text-muted);
        -webkit-mask: var(--opd-icon) center / contain no-repeat;
        mask: var(--opd-icon) center / contain no-repeat;
    }
    .opd_column_manager_type_icon[data-column-type="home"]{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.add_timeline_column)}); }
    .opd_column_manager_type_icon[data-column-type="notification"]{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.add_notification_column)}); }
    .opd_column_manager_type_icon[data-column-type="explore"]{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.add_explore_column)}); }
    .opd_column_manager_type_icon[data-column-type="explore"][data-column-kind="list"]{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.add_list_column)}); }
    .opd_list_picker_user_row{
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .opd_list_picker_user_row label{
        flex: none;
    }
    .opd_list_picker_user_input{
        flex: 1 1 auto;
        min-width: 0;
    }
    .opd_list_picker_status,
    .opd_column_manager_selection_status{
        min-height: 1.5rem;
        font-size: 0.8125rem;
        color: var(--opd-text-muted);
    }
    .opd_list_picker_frame_wrap{
        position: relative;
        height: clamp(12rem, 45vh, 30rem);
        background: var(--opd-frame-surface);
        border: 1px solid var(--opd-border-soft);
        border-radius: var(--opd-radius-md);
        overflow: hidden;
    }
    .opd_list_picker_frame{
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
    }
    .opd_list_picker_manual_row{
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        margin-top: 0.25rem;
    }
    .opd_list_picker_manual{
        flex: 1 1 auto;
        min-width: 0;
        min-height: 3rem;
    }
    .opd_column_manager_hint{
        margin: 0;
        font-size: 0.8125rem;
        color: var(--opd-text-muted);
    }
    .opd_column_manager_racks{
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        flex: 1 1 auto;
        min-height: 10rem;
        overflow-y: auto;
        scrollbar-width: thin;
    }
    .opd_column_manager_rack{
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .opd_column_manager_rack_title{
        margin: 0;
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--opd-text-muted);
    }
    .opd_column_manager_rack_wrap{
        position: relative;
        min-height: 3.5rem;
        background: var(--opd-surface-2);
        border: 1px solid var(--opd-border-soft);
        border-radius: var(--opd-radius-md);
    }
    .opd_column_manager_rack_wrap.opd_column_manager_drop_end{
        box-shadow: inset 0 -3px 0 var(--opd-accent);
    }
    .opd_column_manager_rack_list{
        list-style: none;
        margin: 0;
        padding: 0.375rem;
    }
    .opd_column_manager_item{
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.375rem 0.5rem;
        border-top: 2px solid transparent;
        border-bottom: 2px solid transparent;
        border-radius: var(--opd-radius-sm);
        font-size: 0.8125rem;
        cursor: grab;
        transition: background-color 0.15s;
    }
    /*閉じる印の付いた既存カラムの行はドラッグできず、薄くして名前に取り消し線を引く*/
    .opd_column_manager_item[data-pending-close="true"]{
        cursor: default;
        opacity: 0.6;
    }
    .opd_column_manager_item[data-pending-close="true"] .opd_column_manager_item_name{
        text-decoration: line-through;
    }
    .opd_column_manager_item:hover{
        background: var(--opd-surface-hover);
    }
    .opd_column_manager_item:focus-visible{
        outline: 2px solid var(--opd-accent);
        outline-offset: -2px;
    }
    .opd_column_manager_item.opd_column_manager_dragging{
        opacity: 0.5;
    }
    .opd_column_manager_item.opd_column_manager_drop_before{
        border-top-color: var(--opd-accent);
    }
    .opd_column_manager_item.opd_column_manager_drop_after{
        border-bottom-color: var(--opd-accent);
    }
    .opd_column_manager_drag_handle{
        color: var(--opd-text-muted);
        user-select: none;
    }
    .opd_column_manager_order{
        min-width: 1.8rem;
        text-align: right;
        font-variant-numeric: tabular-nums;
        color: var(--opd-text-muted);
    }
    /*見出しは 2 段組 (上段: 文脈ラベル、下段: タイトル)。ラベルが空のときも高さが変わらないよう空白文字を描く*/
    .opd_column_manager_item_heading{
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-width: 0;
        line-height: 1.25;
    }
    .opd_column_manager_item_label{
        font-size: 0.6875rem;
        color: var(--opd-text-muted);
        overflow-wrap: anywhere;
    }
    .opd_column_manager_item_label:empty::before{
        content: "\\200b";
    }
    .opd_column_manager_item_name{
        overflow-wrap: anywhere;
    }
    .opd_column_manager_badge{
        flex: none;
        padding: 0 0.4rem;
        border-radius: var(--opd-radius-full);
        background: var(--opd-accent-soft);
        color: var(--opd-accent);
        font-size: 0.6875rem;
        font-weight: 600;
        line-height: 1.4;
    }
    .opd_column_manager_badge[data-badge="close"]{
        background: var(--opd-danger-soft);
        color: var(--opd-danger);
    }
    .opd_column_manager_action_btn{
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        min-width: 1.5rem;
        height: 1.5rem;
        padding: 0;
        border: 0;
        border-radius: var(--opd-radius-full);
        background: transparent;
        color: var(--opd-text-muted);
        font: inherit;
        font-size: 1rem;
        line-height: 1;
        cursor: pointer;
    }
    .opd_column_manager_restore_btn{
        padding: 0 0.5rem;
        font-size: 0.75rem;
        font-weight: 600;
    }
    .opd_column_manager_remove_btn:hover{
        background: var(--opd-danger-soft);
        color: var(--opd-danger);
    }
    .opd_column_manager_restore_btn:hover{
        background: var(--opd-accent-soft);
        color: var(--opd-accent);
    }
    .opd_column_manager_rack_empty{
        margin: 0;
        padding: 0.75rem;
        text-align: center;
        font-size: 0.8125rem;
        color: var(--opd-text-muted);
    }
    .opd_column_manager_rack_empty[hidden]{
        display: none;
    }
    .opd_column_manager_count{
        min-height: 1.5rem;
        font-size: 0.8125rem;
        color: var(--opd-text-muted);
    }
    @media (max-width: 60rem){
        .opd_column_manager_body{
            flex-direction: column;
        }
        .opd_column_manager_racks{
            height: 16rem;
        }
    }
    /*iframe の読み込み中に重ねる skeleton (カラム管理ダイアログ・ポストフォームのポップオーバーで共用)。色は置き場所の --opd-frame-surface / --opd-frame-skeleton で決める*/
    .opd_frame_skeleton{
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 1rem;
        background: var(--opd-frame-surface);
    }
    .opd_frame_skeleton span{
        display: block;
        height: 3rem;
        border-radius: var(--opd-radius-md);
        background: linear-gradient(90deg, var(--opd-frame-skeleton) 0%, var(--opd-skeleton-shine) 50%, var(--opd-frame-skeleton) 100%);
        background-size: 200% 100%;
        animation: opd_skeleton_shimmer 1.4s ease-in-out infinite;
    }
    @keyframes opd_skeleton_shimmer{
        from{ background-position: 200% 0; }
        to{ background-position: -200% 0; }
    }
    .opd_frame_skeleton[hidden]{
        display: none;
    }
    /*ポストフォームのポップオーバー (サイドバーの投稿ボタンの横に出る非モーダルの浮動パネル。z-index はサイドバーと同じ 999 で、DOM 順が後なのでサイドバーの上・モーダルダイアログ (1000) の下に重なる)*/
    .opd_post_form_popover{
        --opd-frame-surface: var(--opd-surface);
        --opd-frame-skeleton: var(--opd-skeleton);
        position: fixed;
        left: calc(var(--opd-sidebar-width) + 0.5rem);
        top: 8px;
        z-index: 999;
        display: flex;
        flex-direction: column;
        width: min(38rem, calc(100vw - var(--opd-sidebar-width) - 1.5rem));
        height: min(80vh, 44rem);
        overflow: hidden;
        background: var(--opd-surface);
        border: 1px solid var(--opd-border-soft);
        border-radius: var(--opd-radius-lg);
        box-shadow: var(--opd-shadow-lg);
        color: var(--opd-text);
        animation: opd_dialog_in 0.16s ease-out;
    }
    .opd_post_form_popover[hidden]{
        display: none;
    }
    .opd_post_form_bar{
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0.5rem 0.5rem 0.5rem 1rem;
        background: var(--opd-surface);
        border-bottom: 1px solid var(--opd-border-soft);
    }
    .opd_post_form_title{
        margin: 0;
        font-size: 0.9375rem;
        font-weight: 700;
    }
    .opd_post_form_close_btn,
    .opd_column_subbar_back{
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 2rem;
        height: 2rem;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background-color: transparent;
        color: var(--opd-text-muted);
        cursor: pointer;
        transition: background-color 0.15s, color 0.15s;
    }
    .opd_post_form_close_btn:hover,
    .opd_column_subbar_back:hover{
        background-color: var(--opd-surface-hover);
        color: var(--opd-text);
    }
    .opd_post_form_close_btn .opd_icon,
    .opd_column_subbar_back .opd_icon{
        width: 1.125rem;
        height: 1.125rem;
    }
    .opd_post_form_frame_wrap{
        position: relative;
        flex: 1 1 auto;
        min-height: 0;
        background: var(--opd-surface);
    }
    .opd_post_form_frame{
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
    }
    #opd_main_element[opd-dsp-theme="light"] {
        color-scheme: light;
    }
    /*ダークモード。トークンを差し替えるだけで全要素が追従する。焼付き軽減のためカラム内容は非ホバー時にわずかに暗くする*/
    #opd_main_element[opd-dsp-theme="dark"] {
        color-scheme: dark;
        --opd-bg: #000000;
        --opd-surface: #16181c;
        --opd-surface-2: #1d1f23;
        --opd-surface-hover: rgba(231, 233, 234, 0.1);
        --opd-surface-active: rgba(231, 233, 234, 0.18);
        --opd-border: #3e4144;
        --opd-border-soft: #2f3336;
        --opd-text: #e7e9ea;
        --opd-text-muted: #8b98a5;
        --opd-accent-soft: rgba(29, 155, 240, 0.2);
        --opd-danger-soft: rgba(244, 33, 46, 0.2);
        --opd-skeleton: #2f3336;
        --opd-skeleton-shine: #3e4144;
        --opd-overlay: rgba(91, 112, 131, 0.4);
        --opd-select-arrow: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238b98a5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
        --opd-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
        --opd-shadow-lg: 0 16px 48px rgba(0, 0, 0, 0.7);
        --opd-column-burn-in: 0.72;

        & #main_rack_element {
            scrollbar-color: var(--opd-border) transparent;
        }

        & .dsp_column_draggable_true {
            background-color: #000000;
            border-color: var(--opd-border-soft);
        }

        /* 焼付き軽減 */
        & div[opd_column_type="dsp_column"] {
            filter: brightness(var(--opd-column-burn-in));
            transition: filter 0.3s;
            &:hover {
                filter: brightness(1);
            }
        }

        & .column_bar {
            filter: brightness(0.85);
            transition: filter 0.3s;
            &:hover {
                filter: brightness(1);
            }
        }

        & #main_bar_empty_column, div[opd_column_type="empty_column"], div[opd_column_type="side_empty_column"] {
            filter: brightness(var(--opd-column-burn-in));
        }
    }

    /* メディアビューワー */
    ::backdrop {
        background: rgba(0, 0, 0, 0.9);
    }
    #opd_media_viewer:focus {
        outline: none;
    }
    .opd_media_viewer_func_btn{
        display: flex;
        justify-content: center;
        align-items: center;
        border: 0;
        background: transparent;
        color: #ffffff;
        cursor: pointer;
        outline: none;
        transition: background-color 0.15s;
    }
    .opd_media_viewer_func_btn.media_switch_btn{
        width: 3.5rem;
        height: 3.5rem;
        margin: 0.625rem;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.08);
    }
    .opd_media_viewer_func_btn_circle button{
        display: flex;
        justify-content: center;
        align-items: center;
        width: 2.75rem;
        height: 2.75rem;
        border: 0;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
        cursor: pointer;
        outline: none;
        transition: background-color 0.15s;
    }
    button[disabled].opd_media_viewer_func_btn{
        visibility: hidden;
    }
    .opd_media_viewer_func_btn_icon_color{
        color: #ffffff;
    }
    .opd_media_viewer_func_btn:hover,
    .opd_media_viewer_func_btn_circle button:hover{
        background: rgba(255, 255, 255, 0.22);
    }
    .opd_media_viewer_func_btn:focus-visible,
    .opd_media_viewer_func_btn_circle button:focus-visible{
        outline: 2px solid #ffffff;
        outline-offset: 2px;
    }
    .media_viewer_icon_close,
    .media_viewer_icon_forward,
    .media_viewer_icon_next,
    .media_viewer_icon_download{
        width: 1.5rem;
        height: 1.5rem;
    }
    .opd_icon_close{ --opd-icon: url(${chrome.runtime.getURL(ui_icon_define.column_close)}); }
    .dsp_column_btn label{
        width: 100%;
        height: 100%;
        -webkit-mask-size: 1rem;
        mask-size: 1rem;
    }
    /*動きを減らす設定では、ダイアログ・ポップオーバーの出現アニメーションと skeleton の流れる表示を止める (アニメーション定義より後に置いて同じ詳細度で上書きする)*/
    @media (prefers-reduced-motion: reduce){
        .opd_dialog_overlay,
        .opd_dialog,
        .opd_post_form_popover,
        .opd_frame_skeleton span{
            animation: none;
        }
    }
    /*強制配色 (Windows のハイコントラスト等) では background-color が Canvas 色に置き換わり mask アイコンが消えるため、システム色で塗り直す。トグルスイッチは枠と塗りで状態を示す*/
    @media (forced-colors: active){
        .opd_icon,
        .dsp_btn_parent > div:not(.dsp_btn_change_profile_btn),
        .dsp_column_move_icon,
        .dsp_column_settings_btn,
        .dsp_column_close_btn,
        .opd_column_kind_icon::after,
        .opd_column_manager_type_icon::after,
        .media_viewer_icon_close,
        .media_viewer_icon_forward,
        .media_viewer_icon_next,
        .media_viewer_icon_download{
            forced-color-adjust: none;
            background-color: CanvasText;
        }
        #open_post_form .dsp_btn_post_form_img,
        .opd_media_viewer_func_btn_icon_color{
            background-color: ButtonText;
        }
        .opd_switch{
            forced-color-adjust: none;
            border: 2px solid ButtonText;
            background-color: Canvas;
        }
        .opd_switch:checked{
            background-color: Highlight;
        }
    }
    </style>`);
    //カラム要素作成-挿入
    //カラムバー (home / notification / explore で共通)。見出しはドラッグ用グリップ・カラム種別の丸アイコン・2 段組のテキスト (上段: 文脈ラベル、下段: タイトル) で、右端に空白領域 (クリックでカラム先頭へスクロール) と更新 (home カラムで自動更新オフのときだけ表示)・設定・閉じるボタンを置く
    //副見出しはポスト単体を表示しているあいだだけ出す (update_column_subbar が hidden を切り替える)。戻るボタンで元の一覧へ戻す
    let default_element_bar = `<div class="column_bar" style="height: max-content;"><span class="dsp_column_title"><span class="dsp_column_move_icon" aria-hidden="true"></span><span class="opd_column_kind_icon" aria-hidden="true"></span><span class="opd_column_heading"><span class="opd_column_label">%column_label%</span><span class="opd_column_name">%column_title%</span></span></span><div class="dsp_column_empty_area opd_column_scroll_to_top"></div><span class="dsp_column_btn dsp_column_reload_btn_wrap" hidden><label class="dsp_column_reload_btn"><input class="opd_column_reload_btn" type="button" value="R" title="${i18n_message("ui_column_reload_title")}" aria-label="${i18n_message("ui_column_reload_title")}"></label></span><span class="dsp_column_btn"><label class="dsp_column_settings_btn"><input class="opd_settings_btn" type="button" value="S" title="${i18n_message("ui_column_settings_title")}" aria-label="${i18n_message("ui_column_settings_title")}"></label></span><div class="dsp_column_close_btn_wrap"><span class="dsp_column_btn"><label class="dsp_column_close_btn"><input type="button" class="column_close_btn" value="X" title="${i18n_message("ui_column_close_title")}" aria-label="${i18n_message("ui_column_close_title")}"/></label></span></div></div><div class="opd_column_subbar" hidden><button type="button" class="opd_column_subbar_back" title="${i18n_message("ui_column_back_button")}" aria-label="${i18n_message("ui_column_back_button")}"><span class="opd_icon opd_icon_close" aria-hidden="true"></span></button><span class="opd_column_heading"><span class="opd_column_label opd_column_subbar_label"></span><span class="opd_column_name opd_column_subbar_name"></span></span></div>`;
    //カラム設定パネルはカラム種別ごとに出す行が異なる (項目 × カラム種別の適用表に従う)
    let notification_settings_panel = build_column_settings_panel({iframe_styles:true, auto_reload:false, pinned:false});
    let home_settings_panel = build_column_settings_panel({iframe_styles:true, auto_reload:true, pinned:false});
    let explore_settings_panel = build_column_settings_panel({iframe_styles:true, auto_reload:true, pinned:true});
    let default_element = {
        /*main_bar_empty_column:{html:`<!--<section draggable="false" class="dsp_column"><div opd_column_type="main_bar_empty_column" opd_column_width="%column_width_num%" id="main_bar_empty_column" style="height:100%;min-width: 70px;"></div></section>-->`},*/
        empty_column:{html:`<section draggable="false" id="column_%column_num%" class="dsp_column_draggable_false dsp_column dsp_column_emptycolumn"><div opd_column_type="empty_column" opd_column_width="%column_width_attr%"><div><span class="opd_icon opd_icon_column_add_1" aria-hidden="true"></span><p>${i18n_message("ui_empty_column_message")}</p></div></div></section>`},
        home:{html:`<section draggable="true" id="column_%column_num%" class="dsp_column_draggable_true dsp_column"><div opd_column_type="home" opd_column_return_path="%column_return_path%" opd_column_width="%column_width_attr%" opd_setting_banner="%column_setting_banner%" opd_setting_top_visible="%column_setting_top_visible%" opd_setting_tw_view_mode="%column_setting_tw_view_mode%" opd_setting_auto_reload="%column_setting_auto_reload%" opd_setting_auto_reload_time="%column_setting_auto_reload_time%" style="height: 100%;width: %column_width_num%rem;min-width: 1rem;">${default_element_bar}${home_settings_panel}<iframe auto_reload_mouse_hover="false" allow="fullscreen" src="https://x.com/home" type="text/html" style="width: 100%;height: 100%;" opd_init_webview></iframe></div></section>`},
        notification:{html:`<section draggable="true" id="column_%column_num%" class="dsp_column_draggable_true dsp_column"><div opd_column_type="notification" opd_column_return_path="%column_return_path%" opd_column_width="%column_width_attr%" opd_setting_banner="%column_setting_banner%" opd_setting_top_visible="%column_setting_top_visible%" opd_setting_tw_view_mode="%column_setting_tw_view_mode%" style="height: 100%;width: %column_width_num%rem;min-width: 1rem;">${default_element_bar}${notification_settings_panel}<iframe allow="fullscreen" src="https://x.com/notifications" type="text/html" style="width: 100%;height: 100%;" opd_init_webview></iframe></div></section>`},
        explore:{html:`<section draggable="true" id="column_%column_num%" class="dsp_column_draggable_true dsp_column"><div opd_column_type="explore" opd_column_return_path="%column_return_path%" opd_column_width="%column_width_attr%" opd_setting_banner="%column_setting_banner%" opd_setting_top_visible="%column_setting_top_visible%" opd_setting_tw_view_mode="%column_setting_tw_view_mode%" opd_setting_auto_reload="%column_setting_auto_reload%" opd_setting_auto_reload_time="%column_setting_auto_reload_time%" opd_setting_pinned="%column_setting_pinned%" opd_explore_path="%column_save_path%" opd_explore_title="%column_save_title%" opd_pinned_path="%column_pinned_save_path%" style="height: 100%;width: %column_width_num%rem;min-width: 1rem;">${default_element_bar}${explore_settings_panel}<iframe auto_reload_mouse_hover="false" allow="fullscreen" src="https://x.com%column_save_path%" type="text/html" style="width: 100%;height: 100%;" opd_init_webview></iframe></div></section>`}
    };
    //サイドラックの案内カラム。プロファイルには保存せず、run() ごとに #side_rack_element の末尾へ 1 つ作る
    const side_empty_column_template = `<section draggable="false" id="column_%column_num%" class="dsp_column_draggable_false dsp_column dsp_column_side_emptycolumn"><div opd_column_type="side_empty_column" opd_column_width="%column_width_attr%"><div><span class="opd_icon opd_icon_column_add_2" aria-hidden="true"></span><p>${i18n_message("ui_side_empty_column_message")}</p></div></div></section>`;
    let ins_html = document.createElement("div");
    ins_html.id = "opd_main_element";
    ins_html.style = "position: fixed;z-index: 999999;top:0;width: 100%;height: 100%;display: flex;flex-direction: row;overflow: hidden;";
    let side_bar = `<section class="dsp_column" id="opd_sidebar"><div draggable="false" class="dsp_column_draggable_false" opd_column_type="dsp_column" opd_column_width="%column_width_num%"><div class="main_bar_functions"><div class="opd_ui_logo_parent" title="${i18n_message("ui_sidebar_logo_title", [manifest.version])}"><div class="opd_ui_logo"></div><span class="opd_version_span">${manifest.version}</span></div><hr><div class="opd_debug_menu"><span>${i18n_message("ui_debug_menu_label")}</span><input type="button" class="opd_btn" id="init_settings" value="${i18n_message("ui_button_init_settings")}" /><input type="button" class="opd_btn" id="profile_load_save" value="${i18n_message("ui_button_profile_loader")}" /><input type="button" class="opd_btn" id="dnr_reload" value="${i18n_message("ui_button_dnr_reload")}" /><input type="button" class="opd_btn" id="ext_reload" value="${i18n_message("ui_button_ext_reload")}" /></div><div id="api_limit_status">${i18n_message("ui_button_api_label")}</div><hr><div class="dsp_btn_parent" id="open_post_form" tabindex="0" role="button" aria-haspopup="dialog" aria-expanded="false" title="${i18n_message("ui_open_post_form_title")}"><div class="dsp_btn_post_form_img"></div></div><hr><div class="dsp_btn_parent" id="manage_columns" tabindex="0" role="button" aria-haspopup="dialog" title="${i18n_message("ui_manage_columns_title")}"><div class="dsp_btn_manage_columns_img"></div></div><hr><div class="dsp_btn_parent" id="global_settings" tabindex="0" role="button" title="${i18n_message("ui_global_settings_title")}"><div class="dsp_btn_global_settings_img"></div></div><hr><div class="dsp_btn_parent" id="add_target_toggle" tabindex="0" role="button" aria-pressed="false" title="${i18n_message("ui_add_target_main_title")}"><div class="dsp_btn_add_target_img"></div></div><hr><div class="dsp_btn_parent" title="${i18n_message("ui_profile_save_title")}" id="profile_save"><div class="dsp_btn_profile_add_img"></div></div><div class="dsp_btn_parent" title="${i18n_message("ui_profile_delete_title")}" id="profile_delete"><div class="dsp_btn_profile_delete_img"></div></div>${profile_list_html}</div></div></section><section draggable="false" class="dsp_column_draggable_false dsp_column"><div opd_column_type="main_bar_empty_column" id="main_bar_empty_column"></div></section>`;
    let main_column_html = ``;
    let side_column_html = ``;
    //カラム配列の empty_column より後をサイドラックへ振り分けるための検出状態
    let is_main_rack_end = false;
    //カラム追加系ボタンの追加先ラック ("main" | "side")
    let add_target_rack = "main";
    //スクロール検出用
    let scroll_block = true;
    //
    //ログイン中の screen_name (home / notification カラムの文脈ラベルに使う)。X のナビゲーションが未描画なら null になり、iframe の読み込み後に update_column_heading が取り直す
    const init_login_screen_name = get_login_screen_name();
    //console.log(settings.column_settings.length)
    for (let index = 0; index < settings.column_settings.length; index++) {
        //console.log(default_element)
        for (let default_index = 0; default_index < Object.keys(default_element).length; default_index++) {
            //console.log(settings.column_settings[index].type+"-"+Object.keys(default_element))
            if(settings.column_settings[index].type == Object.keys(default_element)[default_index]){
                //console.log(default_element[Object.keys(default_element)[default_index]]["html"])
                const column_setting = settings.column_settings[index];
                //保存値を型・範囲の強制に通してから (null = 全体設定に従う)、属性値と実効値の両方を導く
                const saved_banner = normalize_column_setting_value("banner", column_setting.banner);
                const saved_top_visible = normalize_column_setting_value("top_visible", column_setting.top_visible);
                const saved_tw_view_mode = normalize_column_setting_value("tw_view_mode", column_setting.tw_view_mode);
                const saved_column_width = normalize_column_setting_value("column_width", column_setting.column_width);
                const saved_auto_reload = normalize_column_setting_value("auto_reload", column_setting.auto_reload);
                const saved_auto_reload_time = normalize_column_setting_value("auto_reload_time", column_setting.auto_reload_time);
                const saved_pinned = normalize_column_setting_value("pinned", column_setting.column_pinned_override);
                const effective_column_width = saved_column_width ?? global_settings.column_width;
                const effective_auto_reload_time = saved_auto_reload_time ?? global_settings.auto_reload_time;
                const effective_pinned = saved_pinned ?? global_settings.pinned;
                let init_pinned_path = "";
                let init_column_save_path = column_setting.column_save_path;
                //保存したタイトルが無いプロファイルでは空文字にし、テンプレートへ "undefined" を埋めない (保存したタイトルは読み取り時に整えた形なのでそのまま使う)
                let init_column_save_title = column_setting.column_save_title ?? "";
                //Exproleピン止め。実効ピン止め中はピン止めしたパスを開き直す (記録が無い場合は reconcile_column_pinned が現在のパスで補う)
                //保存したパスと違うページを開くときは保存したタイトルを使わず、読み込み後に取り込むまで見出しには種別の名称を出す
                if(column_setting.type == "explore" && effective_pinned && (column_setting.column_pinned_path ?? "") != ""){
                    init_pinned_path = column_setting.column_pinned_path;
                    init_column_save_path = column_setting.column_pinned_path;
                    if(init_column_save_path !== column_setting.column_save_path) init_column_save_title = "";
                }
                //見出しの文脈ラベルとタイトル (構造用カラムは見出しを持たないため null になる)
                const init_heading = build_column_heading(column_setting.type, init_column_save_path, init_column_save_title, init_login_screen_name);
                const column_html = fill_column_template(default_element[Object.keys(default_element)[default_index]]["html"], {
                    column_num: create_random_id(),
                    column_width_attr: column_setting_attr_value("column_width", saved_column_width),
                    column_width_num: effective_column_width,
                    column_auto_reload_time: effective_auto_reload_time / 1000,
                    column_setting_banner: column_setting_attr_value("banner", saved_banner),
                    column_setting_top_visible: column_setting_attr_value("top_visible", saved_top_visible),
                    column_setting_tw_view_mode: column_setting_attr_value("tw_view_mode", saved_tw_view_mode),
                    column_setting_auto_reload: column_setting_attr_value("auto_reload", saved_auto_reload),
                    column_setting_auto_reload_time: column_setting_attr_value("auto_reload_time", saved_auto_reload_time),
                    column_setting_pinned: column_setting_attr_value("pinned", saved_pinned),
                    column_label: init_heading?.label ?? "",
                    column_title: init_heading?.name ?? "",
                    column_return_path: initial_column_return_path(column_setting.type, init_column_save_path),
                    column_save_title: init_column_save_title,
                    column_pinned_save_path: init_pinned_path,
                    column_save_path: init_column_save_path,
                });
                //メインラック終了マーカーより後のカラムはサイドラックへ積む
                if(is_main_rack_end == true){
                    side_column_html += column_html;
                }else{
                    main_column_html += column_html;
                }
                //メインラック終了マーカー (empty_column) の検出
                if(is_main_rack_end == false && settings.column_settings[index].type == "empty_column"){
                    is_main_rack_end = true;
                }
            }
        }
    }
    //初期挿入HTML作成。サイドラックはメインラックの後に置き、末尾に案内カラムを 1 つ持たせる
    const side_empty_column_html = fill_column_template(side_empty_column_template, {column_num: create_random_id(), column_width_attr: "inherit"});
    ins_html.innerHTML = `${side_bar}<div id="main_rack_element"><div id="first_rack_element" style="height: 100%;display:flex;flex-direction:row;">${main_column_html}</div></div><div id="side_rack_element">${side_column_html}${side_empty_column_html}</div>`;
    //HTML挿入
    document.body.insertAdjacentElement("afterbegin", ins_html);
    //サイドラックの位置と追加先ラックを属性へ反映する
    apply_side_rack_position();
    ins_html.setAttribute("opd_add_target_rack", add_target_rack);
    //サイドラックの描画幅の変化を --opd_side_rack_width へ反映する
    const side_rack_resize_observer = new ResizeObserver(function(){
        update_side_rack_width();
    });
    side_rack_resize_observer.observe(document.getElementById("side_rack_element"), {box: "border-box"});

    //favicon・タイトルを設定
    set_title_favicon()

    //react-rootを監視しマスク処理をする
    observe_when_ready(
        () => document.getElementById("react-root"),
        document.body,
        main_dsp,
        { childList: true, characterData: true, subtree: false }
    );

    //headを監視しカラーモード機能やCSSを設定・変更する
    observe_when_ready(
        () => document.querySelector("head"),
        document.documentElement,
        head_observer_callback,
        { childList: true, subtree: false }
    );
    //APIリミット表示用
    document.querySelector("#api_limit_status").addEventListener("click", async function(){
        if(api_limit_obj != null){
            await show_alert_dialog(i18n_message("msg_api_limit_status_alert", [api_limit_description]));
        }
    });
    //Open-Deckについて表示
    document.querySelector(".opd_ui_logo").addEventListener("click", function(){
        window.open(chrome.runtime.getURL("about_opd.html"), "About Open-Deck", 'width=720, height=420');
    });
    //デバッグメニュー表示
    let debug_menu_click_counter = 0;
    document.querySelector(".opd_version_span").addEventListener("click", async function(){
        if(debug_menu_click_counter >= 7){
            await show_alert_dialog(i18n_message("msg_debug_menu_enabled"));
            document.querySelector(".opd_debug_menu").style.display = "flex";
        }else{
            debug_menu_click_counter += 1;
        }
    });
    //
    create_profile_list_btn();
    column_dd();
    column_close();
    append_object_css();
    update_side_rack_state();
    //#opd_main_element の opd_side_rack_position 属性を全体設定のサイドラックの位置にする
    function apply_side_rack_position(){
        document.getElementById("opd_main_element")?.setAttribute("opd_side_rack_position", global_settings.side_rack_position);
    }
    //サイドラックの現在の描画幅を --opd_side_rack_width へ書く (非表示なら 0px。小数精度を保つため getBoundingClientRect を使う)
    function update_side_rack_width(){
        const main_element = document.getElementById("opd_main_element");
        const side_rack = document.getElementById("side_rack_element");
        if(main_element === null || side_rack === null) return;
        main_element.style.setProperty("--opd_side_rack_width", `${side_rack.getBoundingClientRect().width}px`);
    }
    //サイドラックの表示状態を現在の状態から決めて反映する。カラムの追加・閉じる・ドラッグ移動・追加先切替・起動時に呼ぶ
    //表示条件: サイドラックに section.dsp_column_draggable_true が 1 つ以上ある、または追加先が "side"
    //案内カラム (.dsp_column_side_emptycolumn) は追加先が "side" のときだけ表示する
    function update_side_rack_state(){
        const side_rack = document.getElementById("side_rack_element");
        if(side_rack === null) return;
        const is_side_target = add_target_rack === "side";
        const has_side_column = side_rack.querySelector(":scope > section.dsp_column_draggable_true") !== null;
        side_rack.hidden = !(has_side_column || is_side_target);
        const side_empty_column = side_rack.querySelector(".dsp_column_side_emptycolumn");
        if(side_empty_column !== null) side_empty_column.hidden = !is_side_target;
        //ResizeObserver の反映を待たずに幅を合わせる
        update_side_rack_width();
    }
    //プロファイルリスト切替イベント作成関数
    function create_profile_list_btn(){
        //プロファイルリスト切替イベント初期化
        for (let index = 0; index < profile_store.length; index++) {
            document.querySelector(`#userProfile-${index}`).addEventListener("click",async function(){
                //console.log(profile_store[index].profile)
                const preload_array = profile_store[index].profile;
                let preload_desc_array = new Array(); 
                let preload_desc_count = 0;
                for (let preload_index = 0; preload_index < preload_array.length; preload_index++) {
                    switch (preload_array[preload_index].type) {
                        case "dsp_column":
                            preload_desc_count = 0;
                            break;
                        case "main_bar_empty_column":
                            preload_desc_count = 0;
                            break;
                        case "empty_column":
                            preload_desc_array.push(i18n_message("msg_profile_desc_main_rack_end"));
                            preload_desc_count = 0;
                            break;
                        //post は復元されないカラム種別なので、説明にも番号にも含めない
                        case "post":
                            continue;
                        case "home":
                            preload_desc_array.push(i18n_message("msg_profile_desc_timeline_column", [preload_desc_count]));
                            break;
                        case "notification":
                            preload_desc_array.push(i18n_message("msg_profile_desc_notification_column", [preload_desc_count]));
                            break;
                        case "explore":
                            preload_desc_array.push(i18n_message("msg_profile_desc_explore_column", [preload_desc_count, preload_array[preload_index].column_save_title]));
                            break;
                        case "misskey":
                            preload_desc_array.push(i18n_message("msg_profile_desc_misskey_column"));
                            break;
                        case "bsky":
                            preload_desc_array.push(i18n_message("msg_profile_desc_bluesky_column"));
                            break;
                        default:
                            preload_desc_count = 0;
                            break;
                    }
                    preload_desc_count += 1;
                }
                //console.log(preload_desc_array)
                if(!(await show_confirm_dialog(`${i18n_message("msg_profile_load_confirm", [index, preload_desc_array.join("\n")])}`))) return;
                //切り替え前のカラムの自動更新を止め、ポストフォームのポップオーバーの資源を解放する
                get_settings_target_columns().forEach((column_div) => stop_column_auto_reload(column_div));
                teardown_post_form_popover();
                side_rack_resize_observer.disconnect();
                document.querySelector("#opd_main_element").remove();
                last_load_profile = index;
                chrome.storage.local.get("opd_settings", function(value){
                    let load_setting = JSON.parse(value.opd_settings);
                    load_setting.last_load_profile = index;
                    chrome.storage.local.set({'opd_settings': JSON.stringify(load_setting)}, function () {
                    });
                });
                const column_settings = {column_settings:profile_store[index].profile, global_settings:profile_store[index].global_settings};
                //console.log(column_settings)
                run(column_settings, profile_store);
            })
        }
    }
    //CSS適用(追加/変更の時に呼び出し)
    //session_webview_obj は Desktop 版とコード共通化を保たせるために同様の名称としている
    function append_object_css(mode, session_webview_obj){
        let column_object = null;
        if(mode == "session_set" || mode == "add_column"){
            column_object = session_webview_obj;
        }else{
            column_object = document.querySelectorAll('.dsp_column:not([opd_column_type="dsp_column"], [opd_column_type="empty_column"], [opd_column_type="main_bar_empty_column"]) iframe');
        }

        //カラム読み込み失敗検出
        watch_load_column(column_object);

        for (let index = 0; index < column_object.length; index++) {
            column_object[index].removeAttribute("opd_init_webview");

            const opd_column_div = column_object[index].closest("div[opd_column_type]");

            //カラム拡張読み込み
            if(mode != "session_set"){
                reinit_column_extensions(opd_column_div);
                //設定パネル・カラムバーのイベント登録と、iframe の load を待たない設定の反映
                bind_column_events(opd_column_div);
                apply_column_dom_state(opd_column_div);
            }

            //iframe 内 CSS は読み込みのたびに入れ直す (既に読み込み済みの iframe にはこの場で適用する)
            if(column_object[index].opd_iframe_styles_bound !== true){
                column_object[index].opd_iframe_styles_bound = true;
                column_object[index].addEventListener("load", function(){
                    apply_column_iframe_styles(opd_column_div);
                    //表示中のページをカラムの属性へ取り込んでから見出しを組み立て直す (読み込み時は保存しない)
                    apply_column_frame_page(opd_column_div, read_column_frame_page(this));
                    update_column_heading(opd_column_div);
                    update_column_subbar(opd_column_div);
                    //ログイン中の screen_name は X のナビゲーションが読み込まれるまで取れないため、読み込みのたびに取り直して全 home / notification カラムのラベルへ反映する
                    //取れないあいだは他のカラムのラベルを空に戻さない (このカラムのラベルは上の組み立て直しで空になり、遷移監視の取り直しで埋まる)
                    if(get_login_screen_name() !== null) update_login_dependent_headings();
                });
            }
            apply_column_iframe_styles(opd_column_div);
            update_column_heading(opd_column_div);
            update_column_subbar(opd_column_div);
            //カラム内のページ内遷移の監視
            watch_column_navigation(opd_column_div);
        }
    }
    //カラム見出しの文脈ラベルとタイトルを、カラム種別・表示中のパス (opd_explore_path)・ページタイトル (opd_explore_title)・ログイン中の screen_name から決めて書き換える
    //explore カラムには表示中のページ種別を opd_column_kind ("list" | "explore") として持たせ、見出しの丸アイコンの絵柄に使う
    //ポスト単体を表示中は見出しをそのまま残すため、種別は戻り先のページ (opd_column_return_path) で決める (ポストのパスからは種別が分からない)
    function update_column_heading(column_div){
        if(column_div == null) return;
        const column_type = column_div.getAttribute("opd_column_type");
        const explore_path = column_div.getAttribute("opd_explore_path");
        const heading_path = match_post_page_path(explore_path) !== null ? (column_div.getAttribute("opd_column_return_path") || explore_path) : explore_path;
        const heading = build_column_heading(column_type, heading_path, column_div.getAttribute("opd_explore_title"), get_login_screen_name());
        if(heading === null) return;
        if(column_type === "explore") column_div.setAttribute("opd_column_kind", is_list_page_path(heading_path) ? "list" : "explore");
        const label_element = column_div.querySelector(".column_bar .opd_column_label");
        const name_element = column_div.querySelector(".column_bar .opd_column_name");
        if(label_element !== null) label_element.textContent = heading.label;
        if(name_element !== null) name_element.textContent = heading.name;
    }
    //カラムの副見出しを表示中のページに合わせる
    //iframe が /<screen_name>/status/<id> を表示していればポスト単体の表示とみなし、「@投稿者 / ポスト」の副見出しを出して opd_column_detail="post" を付ける (この属性で元の見出しが薄くなる)
    //ポスト以外のページを表示しているあいだは副見出しを隠して属性を外す
    //表示中のページに重ねて開くオーバーレイの経路 (返信コンポーザー等) では、下にあるページの状態を保つため何も変えない
    function update_column_subbar(column_div){
        if(column_div == null) return;
        const subbar = column_div.querySelector(".opd_column_subbar");
        if(subbar === null) return;
        let frame_path = null;
        try{
            frame_path = column_div.querySelector("iframe")?.contentWindow?.location?.pathname ?? null;
        }catch(e){
            //別オリジンなどでパスを読めない場合はポスト表示として扱わない
            frame_path = null;
        }
        if(is_overlay_page_path(frame_path)) return;
        const post_screen_name = match_post_page_path(frame_path);
        if(post_screen_name === null){
            subbar.hidden = true;
            column_div.removeAttribute("opd_column_detail");
            return;
        }
        const label_element = subbar.querySelector(".opd_column_subbar_label");
        const name_element = subbar.querySelector(".opd_column_subbar_name");
        if(label_element !== null) label_element.textContent = post_screen_name === "" ? "" : `@${post_screen_name}`;
        if(name_element !== null) name_element.textContent = i18n_message("ui_column_post_title");
        subbar.hidden = false;
        column_div.setAttribute("opd_column_detail", "post");
    }
    //カラムの iframe を reload_path へ読み込み直す前に、副見出しの状態を読み込み先に合わせて先に整える
    //予約中の ✕ の読み込み直しの保険 (opd_subbar_fallback_timer) を取り消し、読み込み先がポスト以外なら副見出しを隠して opd_column_detail を外す (読み込み後は load が表示中のページから決め直す)
    function reset_column_subbar_before_reload(column_div, reload_path){
        if(column_div == null) return;
        clearTimeout(column_div.opd_subbar_fallback_timer);
        column_div.opd_subbar_fallback_timer = null;
        if(match_post_page_path(reload_path) !== null) return;
        const subbar = column_div.querySelector(".opd_column_subbar");
        if(subbar !== null) subbar.hidden = true;
        column_div.removeAttribute("opd_column_detail");
    }
    //カラムの iframe が今表示しているページの href と、見出しに出す形に整えたページタイトル (リスト系ページではリスト名だけ) を読む
    //中身を読めない (別オリジン等) 場合は null を返す
    function read_column_frame_page(column_frame){
        try{
            const frame_location = column_frame.contentWindow.location;
            return {
                href: frame_location.href,
                page_title: normalize_column_page_title(column_frame.contentWindow.document.title, frame_location.pathname),
            };
        }catch(e){
            //別オリジンなどで中身を読めないあいだは表示中のページを追えない
            return null;
        }
    }
    //読み取ったページ (read_column_frame_page の戻り値) をカラムの属性へ取り込む
    //  opd_column_return_path / opd_column_return_title: ポスト単体以外のページのときだけ更新する (副見出しの ✕ で開き直す先のパスと、そのページのタイトル)。タイトルが空 (読み込み中の仮タイトル) のあいだは記録しない
    //  opd_explore_path / opd_explore_title: explore カラムが表示しているパスとページタイトル。ポスト単体のページではパスだけ更新し、タイトルは残す (見出しは元のページのまま薄く表示するため)
    //読み込み前の about:blank など https 以外のページと、表示中のページに重ねて開くオーバーレイの経路 (返信コンポーザー等) では何も変えない
    function apply_column_frame_page(column_div, frame_page){
        if(column_div == null || frame_page == null) return;
        const frame_url = new URL(frame_page.href);
        if(frame_url.protocol !== "https:") return;
        if(is_overlay_page_path(frame_url.pathname)) return;
        const frame_path = `${frame_url.pathname}${frame_url.search}`;
        if(match_post_page_path(frame_url.pathname) === null){
            column_div.setAttribute("opd_column_return_path", frame_path);
            if(frame_page.page_title !== "") column_div.setAttribute("opd_column_return_title", frame_page.page_title);
        }
        if(column_div.getAttribute("opd_column_type") !== "explore") return;
        column_div.setAttribute("opd_explore_path", frame_path);
        if(match_post_page_path(frame_url.pathname) === null) column_div.setAttribute("opd_explore_title", frame_page.page_title);
    }
    //ログイン中の screen_name を最後に取りに行った時刻 (全カラム共有)
    let last_login_screen_name_retry_time = 0;
    //ログイン中の screen_name を取り直す最小間隔 (取得は全 iframe の走査を伴うため間隔をあける)
    const login_screen_name_retry_interval_ms = 1000;
    //間隔内に見送った取り直しを、間隔が明けたときにもう一度だけ試す予約 (予約は同時に 1 つ)
    let login_screen_name_retry_timer = null;
    //全 home / notification カラムの見出しを組み立て直す (文脈ラベルに出すログイン中の screen_name を反映する)
    function update_login_dependent_headings(){
        document.querySelectorAll('#opd_main_element div[opd_column_type="home"], #opd_main_element div[opd_column_type="notification"]').forEach((column_div) => update_column_heading(column_div));
    }
    //文脈ラベルが空のままの home / notification カラムが残っているあいだだけ、ログイン中の screen_name を取り直して見出しへ反映する
    //X のナビゲーションは iframe の読み込み後に描画されるため、カラムの遷移検知に相乗りして間隔をあけて試す
    //間隔内に呼ばれて見送ったときは、その後に変化が起きなくても取り直せるよう、間隔が明けた時点でもう一度試す予約を入れる
    function retry_login_screen_name_headings(){
        if(document.querySelector('#opd_main_element :is(div[opd_column_type="home"], div[opd_column_type="notification"]) .column_bar .opd_column_label:empty') === null) return;
        const retry_time = Date.now();
        const elapsed_ms = retry_time - last_login_screen_name_retry_time;
        if(elapsed_ms < login_screen_name_retry_interval_ms){
            if(login_screen_name_retry_timer === null){
                login_screen_name_retry_timer = setTimeout(function(){
                    login_screen_name_retry_timer = null;
                    retry_login_screen_name_headings();
                }, login_screen_name_retry_interval_ms - elapsed_ms);
            }
            return;
        }
        last_login_screen_name_retry_time = retry_time;
        if(get_login_screen_name() === null) return;
        update_login_dependent_headings();
    }
    //カラムの iframe 内のページ内遷移を MutationObserver で検知し、表示中のページを属性・見出し・副見出しへ反映する
    //X はページを切り替えた後に document.title を書き換えるため、href とページタイトルのどちらが変わっても反映し直す
    //タイトルは title 要素のテキストノードの書き換えで変わることがあるため、childList に加えて characterData も観察する
    //explore カラムでは表示中のパスとページタイトルを保存する
    //observer は iframe の load ごとに作り直し、そのとき前回の observer を切る。登録済みの iframe には二重に登録しない
    function watch_column_navigation(column_div){
        const column_frame = column_div?.querySelector("iframe");
        if(column_frame == null) return;
        if(column_frame.opd_navigation_watch_bound === true) return;
        column_frame.opd_navigation_watch_bound = true;
        let navigation_observer = null;
        column_frame.addEventListener("load", function(){
            navigation_observer?.disconnect();
            let last_page = read_column_frame_page(column_frame);
            if(last_page === null) return;
            let frame_document = null;
            try{
                frame_document = column_frame.contentWindow.document;
            }catch(e){
                //別オリジンなどで中身を読めない iframe は監視できない (次の load で組み直す)
                return;
            }
            navigation_observer = new MutationObserver(function(){
                //X のナビゲーションが描画されると screen_name を取れるようになるため、空のままのラベルがあるあいだは取り直す
                retry_login_screen_name_headings();
                const frame_page = read_column_frame_page(column_frame);
                if(frame_page === null) return;
                if(frame_page.href === last_page.href && frame_page.page_title === last_page.page_title) return;
                last_page = frame_page;
                apply_column_frame_page(column_div, frame_page);
                update_column_heading(column_div);
                update_column_subbar(column_div);
                if(column_div.getAttribute("opd_column_type") !== "explore") return;
                column_settings_save("", last_load_profile);
            });
            navigation_observer.observe(frame_document, {childList: true, subtree: true, characterData: true});
        });
    }
    //メインバーイベント
    document.getElementById("init_settings").addEventListener("click", function(){
        chrome.storage.local.remove("opd_settings", async function(value){
            await show_alert_dialog(i18n_message("msg_settings_reset_completed"));
        });
    });
    //画像付きを開いた時の自動スクロール阻止
    document.querySelector("#main_rack_element").addEventListener("scrollend", function(){
        document.querySelector("#main_rack_element").scrollTop = 0;
    })
    document.querySelector("#side_rack_element").addEventListener("scrollend", function(){
        document.querySelector("#side_rack_element").scrollTop = 0;
    })
    //カラム追加先ラックを next_target ("main" | "side") にし、属性・ボタンの表示・サイドラックの表示状態へ反映する
    function set_add_target_rack(next_target){
        add_target_rack = next_target;
        const is_side_target = add_target_rack === "side";
        document.getElementById("opd_main_element")?.setAttribute("opd_add_target_rack", add_target_rack);
        const toggle_btn = document.getElementById("add_target_toggle");
        if(toggle_btn !== null){
            toggle_btn.setAttribute("aria-pressed", is_side_target ? "true" : "false");
            toggle_btn.title = i18n_message(is_side_target ? "ui_add_target_side_title" : "ui_add_target_main_title");
            const toggle_icon = toggle_btn.querySelector(".dsp_btn_add_target_img");
            if(toggle_icon !== null){
                toggle_icon.style.setProperty("--opd-icon", `url(${chrome.runtime.getURL(is_side_target ? ui_icon_define.add_target_side : ui_icon_define.add_target_main)})`);
            }
        }
        update_side_rack_state();
    }
    //カラム追加先の切替
    document.getElementById("add_target_toggle").addEventListener("click", function(){
        set_add_target_rack(add_target_rack === "side" ? "main" : "side");
    });
    //ボタンとして振る舞わせるため、Enter と Space でも切り替える
    document.getElementById("add_target_toggle").addEventListener("keydown", function(event){
        if(event.repeat) return;
        if(event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        set_add_target_rack(add_target_rack === "side" ? "main" : "side");
    });
    //プロファイルローダー
    document.getElementById("profile_load_save").addEventListener("click", function(){
        window.open(chrome.runtime.getURL("profile_debug.html"), "OPD-Profile-Loader", 'width=720, height=600');
    });
    //
    document.getElementById("dnr_reload").addEventListener("click", async function(){
        if(!(await show_confirm_dialog(i18n_message("msg_dnr_reload_confirm")))) return;
        chrome.runtime.sendMessage({message: "dnr_upd"}).then((value)=>{
            if(value == true){
                location.reload();
            }
        });
    });
    document.getElementById("ext_reload").addEventListener("click", async function(){
        if(!(await show_confirm_dialog(i18n_message("msg_extension_reload_confirm")))) return;
        chrome.runtime.sendMessage({message: "ext_reload"});
    });
    //ポストフォームのポップオーバーを開閉する
    document.getElementById("open_post_form").addEventListener("click", function(){
        toggle_post_form_popover(this);
    });
    //ボタンとして振る舞わせるため、Enter と Space でも開閉する
    document.getElementById("open_post_form").addEventListener("keydown", function(event){
        if(event.repeat) return;
        if(event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggle_post_form_popover(this);
    });
    //===== カラムの追加・並べ替え・閉じるの一括反映 (カラム管理ダイアログの適用処理) =====
    //ラック ID ("main" | "side") からラックの要素と末尾の案内カラム (section) を返す。案内カラムは新しいカラムを末尾に入れるときの基準要素になる
    function get_rack_elements(rack_id){
        const is_side = rack_id === "side";
        const rack_element = document.getElementById(is_side ? "side_rack_element" : "first_rack_element");
        const guide_column = rack_element?.querySelector(is_side ? ":scope > .dsp_column_side_emptycolumn" : ":scope > .dsp_column_emptycolumn") ?? null;
        return {rack_element: rack_element, guide_column: guide_column};
    }
    //ラック直下の実カラム (section.dsp_column_draggable_true) を DOM 順に返す
    //設定パネルのホバー中は draggable 属性が一時的に "false" になるため、判定にはクラスを使う
    function get_rack_columns(rack_id){
        const rack_element = get_rack_elements(rack_id).rack_element;
        return rack_element === null ? [] : Array.from(rack_element.querySelectorAll(":scope > section.dsp_column_draggable_true"));
    }
    //新しいカラムの HTML を組み立てる。個別設定はすべて全体設定に従い (inherit)、explore カラムは初期表示するパスから見出しと戻り先を決める
    //column_type: "home" | "notification" | "explore"、column_path: explore カラムが初期表示するパス (他の種別では使わない)
    function build_new_column_html(column_type, column_path){
        const values = inherit_column_template_values(column_type);
        if(column_type === "explore"){
            //見出しは初期表示するパスから決める (ページタイトルは iframe の読み込み後に取り込んで入れ直す)
            const heading = build_column_heading("explore", column_path, "");
            Object.assign(values, {
                column_label: heading.label,
                column_title: heading.name,
                column_return_path: initial_column_return_path("explore", column_path),
                column_save_path: column_path,
            });
        }
        return fill_column_template(default_element[column_type].html, values);
    }
    //カラムの section を DOM 上の別の位置へ移す前に、読み込み先を整える
    //DOM 上の移動で iframe は src から読み込み直されるため、explore カラムはピン止め中ならピン止めしたパス、そうでなければ表示中のパスを src に張り直し、読み込み先に合わせて見出しを組み立て直す
    //表示中と違うページを読み込むときはページタイトルを空にし、読み込み後に取り込むまで見出しには種別の名称を出す。全種別で副見出しを読み込み先に合わせて先に整える
    function prepare_column_for_dom_move(column_section){
        const column_div = column_section.querySelector("div[opd_column_type]");
        if(column_div === null) return;
        const column_frame = column_div.querySelector("iframe");
        if(column_div.getAttribute("opd_column_type") === "explore"){
            const pinned_path = column_div.getAttribute("opd_pinned_path") ?? "";
            const reload_path = pinned_path !== "" ? pinned_path : column_div.getAttribute("opd_explore_path");
            if(column_frame !== null) column_frame.src = `https://x.com${reload_path}`;
            if(column_div.getAttribute("opd_explore_path") !== reload_path) column_div.setAttribute("opd_explore_title", "");
            column_div.setAttribute("opd_explore_path", reload_path);
            update_column_heading(column_div);
        }
        if(column_frame !== null) reset_column_subbar_before_reload(column_div, new URL(column_frame.src).pathname);
    }
    //ラックの最終的な並び (desired_sections) のうち、動かさずに済む既存カラムの集合を決める
    //current_sections: そのラックに今ある既存カラム (DOM 順)。両方に含まれる既存カラムだけを比べ、DOM 順を保ったまま残せる最長の部分列 (最長共通部分列) を動かさない集合にする
    //長さが同じ候補が複数あるときは、並び替えの前後で同じ位置にあるカラムを多く含む候補を選ぶ (中央のカラムを挟んで両端を入れ替えたときに、中央のカラムが動かないようにする)
    //動かさないカラムには DOM 操作をしないため、その iframe は再読み込みされない
    function pick_stationary_sections(desired_sections, current_sections){
        const staying_sections = desired_sections.filter((section) => current_sections.includes(section));
        const current_staying_sections = current_sections.filter((section) => staying_sections.includes(section));
        const positions = staying_sections.map((section) => current_staying_sections.indexOf(section));
        const is_same_position = staying_sections.map((section, index) => current_staying_sections[index] === section);
        //best[i]: staying_sections[i] で終わる部分列の {length, same_count, prev}
        const best = [];
        let best_end = -1;
        for (let index = 0; index < staying_sections.length; index++) {
            let candidate = {length: 1, same_count: is_same_position[index] ? 1 : 0, prev: -1};
            for (let prev_index = 0; prev_index < index; prev_index++) {
                if(positions[prev_index] >= positions[index]) continue;
                const length = best[prev_index].length + 1;
                const same_count = best[prev_index].same_count + (is_same_position[index] ? 1 : 0);
                if(length > candidate.length || (length === candidate.length && same_count > candidate.same_count)){
                    candidate = {length: length, same_count: same_count, prev: prev_index};
                }
            }
            best.push(candidate);
            if(best_end === -1 || candidate.length > best[best_end].length || (candidate.length === best[best_end].length && candidate.same_count > best[best_end].same_count)){
                best_end = index;
            }
        }
        const stationary_sections = new Set();
        for (let index = best_end; index !== -1; index = best[index].prev) {
            stationary_sections.add(staying_sections[index]);
        }
        return stationary_sections;
    }
    //カラム管理ダイアログの編集結果を両ラックへ一括反映する
    //layout: {main: [item...], side: [item...]}。item は {section: 既存カラムの section} または {type: 新しいカラムの種別, path: explore カラムが初期表示するパス}。配列の順序がそのままラック内の並びになる
    //closing_sections: 閉じる既存カラムの section の配列
    //手順: 新しいカラムの section を未接続の状態で先に作る (見出しのログイン中 screen_name は既存カラムから取るため、閉じる前に作る)
    //  → 閉じるカラムの自動更新を止めて外す → ラックごとに動かさない既存カラム (pick_stationary_sections) を決め、それ以外の section を末尾側から最終位置へ insertBefore で入れる
    //  → 新しいカラムの iframe を初期化 (append_object_css) し、ドラッグ・閉じるボタンを登録 → サイドラックの表示を更新 → 保存 → 最初の新しいカラムへスクロール
    //既存カラムの移動は prepare_column_for_dom_move で読み込み先を整えてから行う。動かさない既存カラムには触れないため再読み込みされない
    //メインラックを先に処理するため、サイドラックへ移る既存カラムはメインラックの処理中は元の位置に残り、サイドラックの処理で移る (メインラックの並びは動かさないカラムを基準に決まるため影響しない)
    function apply_column_layout(layout, closing_sections){
        const new_sections = [];
        const rack_sections = {main: [], side: []};
        ["main", "side"].forEach((rack_id) => {
            (layout[rack_id] ?? []).forEach((item) => {
                if(item.section !== undefined){
                    //ダイアログを開いているあいだに外れたカラムは並びに含めない
                    if(item.section.isConnected) rack_sections[rack_id].push(item.section);
                    return;
                }
                const host = document.createElement("div");
                host.innerHTML = build_new_column_html(item.type, item.path);
                const section = host.firstElementChild;
                if(section === null) return;
                new_sections.push(section);
                rack_sections[rack_id].push(section);
            });
        });
        closing_sections.forEach((section) => {
            if(!section.isConnected) return;
            stop_column_auto_reload(section.querySelector("div[opd_column_type]"));
            section.remove();
        });
        ["main", "side"].forEach((rack_id) => {
            const {rack_element, guide_column} = get_rack_elements(rack_id);
            if(rack_element === null) return;
            const stationary_sections = pick_stationary_sections(rack_sections[rack_id], get_rack_columns(rack_id));
            let next_node = guide_column;
            for (let index = rack_sections[rack_id].length - 1; index >= 0; index--) {
                const section = rack_sections[rack_id][index];
                if(!stationary_sections.has(section)){
                    if(section.isConnected) prepare_column_for_dom_move(section);
                    rack_element.insertBefore(section, next_node);
                }
                next_node = section;
            }
        });
        const new_frames = new_sections.map((section) => section.querySelector("iframe[opd_init_webview]")).filter((frame) => frame !== null);
        if(new_frames.length > 0) append_object_css("add_column", new_frames);
        column_dd();
        column_close();
        update_side_rack_state();
        column_settings_save("", last_load_profile);
        new_sections[0]?.scrollIntoView({behavior: "smooth", inline: "nearest"});
    }
    //===== カラム管理ダイアログ =====
    //サイドバーのカラム管理ボタンから開く。opener_element: ダイアログを閉じたときにフォーカスを戻す要素
    //#opd_main_element の直下にオーバーレイ #opd_column_manager_overlay を 1 つだけ生成する (既に開いている場合は生成せずフォーカスを移す)。オーバーレイは role="dialog" aria-modal="true" のダイアログ本体を持ち、ダイアログは追加領域・一覧領域・操作ボタンで構成する:
    //  追加領域 (左):
    //  ・追加先ラックの選択 (ラジオ: メインラック / サイドラック)。opd_add_target_rack と同じ状態を指し、切り替えると set_add_target_rack で本体にも反映する。追加領域からの追加はすべて追加先ラックの一覧の末尾に入る
    //  ・種別ボタン (タイムライン / 通知 / Explore / リスト一覧)。押すたびに新しいカラムの行を追加する (同じ種別の重複を許す)
    //    リスト一覧は、ユーザー名入力欄がユーザーのリスト一覧のパス (/<screen_name>/lists) に解決できればそのパス、できなければログイン中のユーザーのリスト一覧、どちらも無ければ alert で入力を促す
    //  ・リスト一覧を表示するユーザー名の入力欄と表示ボタン、表示状態の表示 (loading / not_detected / error / login_required / cell_unresolved)
    //  ・X のリスト一覧ページ (https://x.com/<screen_name>/lists) を表示する iframe。ページ内の左ナビ (header[role="banner"]) は隠し、それ以外は X の画面のまま表示する
    //    [data-testid="primaryColumn"] 配下の listCell へのクリック (左・中・右) と Enter / Space はキャプチャ段階で止めてページ遷移させず、左クリックと Enter / Space はそのリストの一覧への出し入れを切り替える
    //    (同じパスの行が一覧にあれば末尾側の 1 件を外す (既存カラムなら閉じる印を付ける)、閉じる印の付いた行だけがあればそれを残すに戻す、無ければ追加先ラックの末尾に追加する)
    //    iframe 内の Esc は、X の画面が処理しなかった (preventDefault されていない) 場合にダイアログを閉じる
    //    リスト ID の解決は page world ヘルパー (extensions/list_picker_helper.js) が付ける属性と resolve_list_cell_info で行い、ID を決められないセルを選んだときは状態表示で手動入力を案内する
    //    一覧にあるリストの listCell には data-opd-list-picker-order 属性 (一覧での番号) を付け、iframe に注入した style で枠と番号を重ねる。X の仮想リストでセルが入れ替わるため、属性の付け直しは定期的 (400ms) に行う
    //    読み込み中は iframe の上に skeleton を重ね、listCell が描画されたら外す。制限時間 (15秒) 内に描画されなければ skeleton を外して not_detected を表示する (その後に listCell が描画されたら消す)
    //    対象ページを表示した後に別のパスへ遷移した場合は対象 URL を読み込み直す (2回を超えて繰り返す場合は error を表示して読み込みを止める)。ログイン画面へ飛ばされた場合は読み込みを止めて login_required を表示する
    //    中身を読めない (クロスオリジン等) と分かった iframe は表示したままにせず about:blank に戻し、error を表示する
    //  ・表示中のリストを全て選択するボタン (そのとき ID を決められている listCell を文書順に、一覧に無いものだけ追加先ラックの末尾へ追加する。閉じる印の付いた同じリストの行があれば残すに戻す)
    //  ・URL か ID の入力欄 (textarea) と追加ボタン。1 行 1 件として解釈し、解釈できた行のうち一覧に無いものを追加先ラックの末尾へ追加する。解釈できない行は alert で知らせて入力欄に残し、入力欄へフォーカスを戻す。Enter で追加、Shift+Enter で改行
    //  一覧領域 (右):
    //  ・メインラック / サイドラックそれぞれの順序付き一覧 (ol)。開いた時点の両ラックの実カラムを DOM 順に並べ、追加した行はその後ろに続く。番号は両ラックを通した通し番号 (閉じる印の付いた行は数えない)
    //    行はカラム種別の丸アイコン・見出し (文脈ラベルとタイトル)・印 (新しい行には「追加」、閉じる印の付いた既存カラムには「閉じる」)・操作ボタンを持つ
    //    × ボタンで行を外す。新しい行は一覧から消え、既存カラムの行は閉じる印を付けて残る (適用時に閉じる)。閉じる印の付いた行の「残す」ボタンで印を外す
    //    行のドラッグ&ドロップ (行の上半分に落とすとその前、下半分に落とすとその後ろ、ラックの行以外の場所に落とすとそのラックの末尾。ラックをまたいで落とせる) と、行にフォーカスした状態の Alt+↑ / Alt+↓ で 1 段ずつ並べ替える
    //    (メインラックの末尾から Alt+↓ でサイドラックの先頭へ、サイドラックの先頭から Alt+↑ でメインラックの末尾へ移る)。閉じる印の付いた行はドラッグできない。並べ替えと追加の結果は一覧領域の状態表示 (role="status") で知らせる
    //  ・件数の表示 (追加する行数 (入力欄に残っている解釈できる未追加の行数を含む) と閉じる既存カラムの数) と、追加した行をすべて外すボタン (既存カラムの行には触れない)
    //  操作ボタン: 適用ボタン・キャンセルボタン。適用時に入力欄へ未追加の文字列が残っていれば先に追加を試み、解釈できない行があれば適用を中止する
    //    追加する行が 10 件を超えるときと、閉じる既存カラムに実効ピン止め中のものがあるときは確認する。確認後にダイアログを閉じ、apply_column_layout で一括反映する
    //Esc キー (iframe 内で押した場合を含む。iframe が about:blank や対象外のページを表示しているときも同様)・キャンセルボタン・オーバーレイ背景のクリックで閉じ、閉じるときは待機中のタイマーと iframe の内容を破棄して opener_element にフォーカスを戻す
    //開いているあいだは overlay 以外の #opd_main_element の子要素を inert にして背景を操作対象から外し、閉じるときに解除する (元から inert が付いていた要素は触らない)
    //Tab はダイアログ内のフォーカス可能要素 (iframe を含む) を循環させる。iframe 内では X の画面のフォーカス移動に任せる
    //ダイアログ内の要素には .dsp_column クラス・opd_column_type 属性・opd_init_webview 属性・.column_close_btn クラスを付けない (カラムを一括走査するセレクタに拾われるため)。行のカラム種別は data-column-type 属性で持つ
    function open_column_manager_dialog(opener_element){
        const main_element = document.getElementById("opd_main_element");
        if(main_element === null) return;
        //既に開いている場合は二重に生成せず、開いているダイアログへフォーカスを移す
        const opened_overlay = document.getElementById("opd_column_manager_overlay");
        if(opened_overlay !== null){
            const opened_dialog = opened_overlay.querySelector(".opd_column_manager_dialog");
            if(opened_dialog !== null) get_dialog_focusable_elements(opened_dialog)[0]?.focus();
            return;
        }

        const frame_poll_interval_ms = 400;
        const frame_load_limit_ms = 15000;
        const helper_inject_failure_limit = 3;
        //対象ページを表示した後に別のパスへ遷移したときに読み込み直す回数の上限
        const frame_recover_limit = 2;
        const many_columns_threshold = 10;
        const list_cell_selector = '[data-testid="primaryColumn"] [data-testid="listCell"]';
        const item_selector = ".opd_column_manager_item";
        const rack_ids = ["main", "side"];
        const rack_name_of = (rack_id) => i18n_message(rack_id === "side" ? "ui_column_manager_target_side" : "ui_column_manager_target_main");
        //種別ボタンと行のカラム種別の表示名
        const column_type_name_of = (column_type) => i18n_message(column_type === "home" ? "ui_column_timeline_title" : "ui_column_notifications_title");

        const overlay = document.createElement("div");
        overlay.id = "opd_column_manager_overlay";
        overlay.className = "opd_dialog_overlay opd_column_manager_overlay";
        //骨格は拡張が持つ静的な文字列だけで組み立てる (X 由来の文字列は生成後に textContent などで入れる)
        overlay.innerHTML = `<div class="opd_dialog opd_column_manager_dialog" role="dialog" aria-modal="true" aria-labelledby="opd_column_manager_title">
        <h2 id="opd_column_manager_title">${i18n_message("ui_column_manager_header")}</h2>
        <div class="opd_column_manager_body">
        <div class="opd_column_manager_add">
        <h3>${i18n_message("ui_column_manager_add_header")}</h3>
        <div class="opd_column_manager_target_row" role="radiogroup" aria-labelledby="opd_column_manager_target_label"><span id="opd_column_manager_target_label">${i18n_message("ui_column_manager_target_label")}</span><label><input class="opd_radio opd_column_manager_target_radio" type="radio" name="opd_column_manager_target" value="main">${i18n_message("ui_column_manager_target_main")}</label><label><input class="opd_radio opd_column_manager_target_radio" type="radio" name="opd_column_manager_target" value="side">${i18n_message("ui_column_manager_target_side")}</label></div>
        <div class="opd_column_manager_type_buttons">
        <button type="button" class="opd_btn opd_btn_sm opd_column_manager_type_btn" data-column-type="home"><span class="opd_column_manager_type_icon" data-column-type="home" aria-hidden="true"></span>${i18n_message("ui_column_manager_type_home")}</button>
        <button type="button" class="opd_btn opd_btn_sm opd_column_manager_type_btn" data-column-type="notification"><span class="opd_column_manager_type_icon" data-column-type="notification" aria-hidden="true"></span>${i18n_message("ui_column_manager_type_notification")}</button>
        <button type="button" class="opd_btn opd_btn_sm opd_column_manager_type_btn" data-column-type="explore"><span class="opd_column_manager_type_icon" data-column-type="explore" aria-hidden="true"></span>${i18n_message("ui_column_manager_type_explore")}</button>
        <button type="button" class="opd_btn opd_btn_sm opd_column_manager_type_btn" data-column-type="lists"><span class="opd_column_manager_type_icon" data-column-type="explore" data-column-kind="list" aria-hidden="true"></span>${i18n_message("ui_column_manager_type_lists")}</button>
        </div>
        <h3>${i18n_message("ui_column_manager_list_header")}</h3>
        <div class="opd_list_picker_user_row"><label for="opd_list_picker_user_input">${i18n_message("ui_list_picker_user_label")}</label><input class="opd_input opd_list_picker_user_input" id="opd_list_picker_user_input" type="text"><input class="opd_btn opd_btn_sm opd_list_picker_show_btn" type="button" value="${i18n_message("ui_list_picker_show_button")}"></div>
        <div class="opd_list_picker_status" role="status" aria-live="polite"></div>
        <div class="opd_list_picker_frame_wrap"><iframe class="opd_list_picker_frame" title="${i18n_message("ui_list_picker_frame_title")}"></iframe><div class="opd_list_picker_frame_skeleton opd_frame_skeleton" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div></div>
        <div><input class="opd_btn opd_btn_sm opd_list_picker_select_all" type="button" value="${i18n_message("ui_list_picker_select_all")}"></div>
        <div><label for="opd_list_picker_manual_input">${i18n_message("ui_list_picker_manual_label")}</label><div class="opd_list_picker_manual_row"><textarea class="opd_textarea opd_list_picker_manual" id="opd_list_picker_manual_input" rows="2"></textarea><input class="opd_btn opd_btn_sm opd_list_picker_manual_add_btn" type="button" value="${i18n_message("ui_list_picker_manual_add_button")}"></div></div>
        </div>
        <div class="opd_column_manager_lists">
        <h3 id="opd_column_manager_lists_title">${i18n_message("ui_column_manager_lists_header")}</h3>
        <p class="opd_column_manager_hint" id="opd_column_manager_hint">${i18n_message("ui_column_manager_lists_hint")}</p>
        <div class="opd_column_manager_racks">
        <section class="opd_column_manager_rack" data-rack="main"><h4 class="opd_column_manager_rack_title" id="opd_column_manager_rack_title_main">${i18n_message("ui_column_manager_target_main")}</h4><div class="opd_column_manager_rack_wrap"><ol class="opd_column_manager_rack_list" aria-labelledby="opd_column_manager_rack_title_main" aria-describedby="opd_column_manager_hint"></ol><p class="opd_column_manager_rack_empty">${i18n_message("ui_column_manager_rack_empty")}</p></div></section>
        <section class="opd_column_manager_rack" data-rack="side"><h4 class="opd_column_manager_rack_title" id="opd_column_manager_rack_title_side">${i18n_message("ui_column_manager_target_side")}</h4><div class="opd_column_manager_rack_wrap"><ol class="opd_column_manager_rack_list" aria-labelledby="opd_column_manager_rack_title_side" aria-describedby="opd_column_manager_hint"></ol><p class="opd_column_manager_rack_empty">${i18n_message("ui_column_manager_rack_empty")}</p></div></section>
        </div>
        <div class="opd_column_manager_selection_status" role="status" aria-live="polite"></div>
        <div class="opd_column_manager_count" id="opd_column_manager_count"></div>
        <div><input class="opd_btn opd_btn_sm opd_column_manager_clear_new" type="button" value="${i18n_message("ui_column_manager_clear_new")}"></div>
        </div>
        </div>
        <div class="opd_dialog_actions"><input class="opd_btn opd_btn_primary opd_column_manager_apply_btn" type="button" aria-describedby="opd_column_manager_count" value="${i18n_message("ui_column_manager_apply_button")}"><input class="opd_btn opd_column_manager_cancel_btn" type="button" value="${i18n_message("ui_column_manager_cancel_button")}"></div>
        </div>`;
        main_element.appendChild(overlay);
        //ダイアログを開いているあいだは背景を操作対象から外す (元から inert のものは対象にしない)
        const release_inert = set_inert_except(main_element, overlay);
        //オーバーレイが close_dialog を経由せず外された場合でも、閉じるときの後始末を必ず通す
        const overlay_observer = new MutationObserver(function(){
            if(overlay.isConnected) return;
            close_dialog();
        });
        overlay_observer.observe(main_element, {childList: true});

        const dialog = overlay.querySelector(".opd_column_manager_dialog");
        const target_radios = Array.from(overlay.querySelectorAll(".opd_column_manager_target_radio"));
        const type_buttons = overlay.querySelector(".opd_column_manager_type_buttons");
        const user_input = overlay.querySelector(".opd_list_picker_user_input");
        const show_btn = overlay.querySelector(".opd_list_picker_show_btn");
        const status_area = overlay.querySelector(".opd_list_picker_status");
        const frame = overlay.querySelector(".opd_list_picker_frame");
        const frame_skeleton = overlay.querySelector(".opd_list_picker_frame_skeleton");
        const select_all_btn = overlay.querySelector(".opd_list_picker_select_all");
        const manual_textarea = overlay.querySelector(".opd_list_picker_manual");
        const manual_add_btn = overlay.querySelector(".opd_list_picker_manual_add_btn");
        const racks_wrap = overlay.querySelector(".opd_column_manager_racks");
        const rack_lists = {};
        const rack_wraps = {};
        const rack_empty_messages = {};
        rack_ids.forEach((rack_id) => {
            const rack_section = overlay.querySelector(`.opd_column_manager_rack[data-rack="${rack_id}"]`);
            rack_lists[rack_id] = rack_section.querySelector(".opd_column_manager_rack_list");
            rack_wraps[rack_id] = rack_section.querySelector(".opd_column_manager_rack_wrap");
            rack_empty_messages[rack_id] = rack_section.querySelector(".opd_column_manager_rack_empty");
        });
        const selection_status_area = overlay.querySelector(".opd_column_manager_selection_status");
        const count_area = overlay.querySelector(".opd_column_manager_count");
        const clear_new_btn = overlay.querySelector(".opd_column_manager_clear_new");
        const apply_btn = overlay.querySelector(".opd_column_manager_apply_btn");
        const cancel_btn = overlay.querySelector(".opd_column_manager_cancel_btn");

        //一覧の状態。ラックごとの順序付き配列で、配列の順序がそのままラック内の並びになる。要素 (entry) は次の形:
        //  key: 行を識別する文字列 (既存カラムは section の id、新しい行は "new_" + 乱数)
        //  type: "home" | "notification" | "explore"、path: explore カラムの識別パス (他の種別は "")
        //  label / name: 見出しの文脈ラベルとタイトル (既存カラムは開いた時点の見出し、新しい行は種別とパスから決める。リストの名前が不明なら name は "")
        //  section: 既存カラムの section (新しい行は null)、pending_close: 既存カラムを適用時に閉じる印 (新しい行は常に false)
        //  order: 描き直しのたびに付け直す通し番号 (閉じる印の付いた行は null)
        const rack_entries = {main: [], side: []};
        //ログイン中の screen_name (新しい home / notification 行のラベルに使う。取れないあいだはラベルを空にする)
        const login_screen_name = get_login_screen_name();
        //クリック・キー入力の捕捉を登録済みの iframe の Document
        const frame_documents_prepared = new WeakSet();
        //iframe の Document ごとのヘルパー注入の失敗回数。上限を超えたら注入をやり直さない
        const helper_inject_failures = new WeakMap();
        let frame_poll_timer = null;
        let frame_load_started_at = 0;
        let is_frame_loading = false;
        //本文のある document を一度でも読めたか (打ち切り時に未検出とエラーを区別する)
        let has_frame_document = false;
        //今回の表示対象のパス (小文字) と、その URL
        let frame_expected_path = "";
        let frame_url = "";
        //対象ページを一度表示したか。表示後に別のパスへ遷移したときの読み込み直しの判定に使う
        let has_frame_reached_page = false;
        let frame_recover_count = 0;
        //背景クリック判定用。押下と離上の両方が背景で起きたときだけ閉じる
        let is_overlay_mousedown = false;
        let is_overlay_mouseup = false;
        //ドラッグ中の行の key
        let dragging_key = null;
        //名前の補完で一覧を描き直す必要があるが、ドラッグ中のため見送っている
        let is_render_pending = false;

        //開いた時点の両ラックの実カラムから行を作る
        function entry_of_existing_section(section){
            const column_div = section.querySelector("div[opd_column_type]");
            const column_type = column_div.getAttribute("opd_column_type");
            return {
                key: section.id !== "" ? section.id : `existing_${create_random_id()}`,
                type: column_type,
                path: column_type === "explore" ? explore_column_persist_path(column_div) : "",
                label: column_div.querySelector(".column_bar .opd_column_label")?.textContent ?? "",
                name: column_div.querySelector(".column_bar .opd_column_name")?.textContent ?? "",
                section: section,
                pending_close: false,
                order: null,
            };
        }
        rack_ids.forEach((rack_id) => {
            rack_entries[rack_id] = get_rack_columns(rack_id).map(entry_of_existing_section);
        });

        //リストのパスから ID を取り出す (/i/lists/<id> の形のときだけ。それ以外は null)
        function list_id_of_path(list_path){
            const match = list_path.match(/^\/i\/lists\/(\d+)$/);
            return match ? match[1] : null;
        }
        //行の表示名。explore の名前が不明なら ID から補い、それも無ければパスをそのまま使う (検索のトップは種別の名称)
        function display_name_of(entry){
            if(entry.name !== "") return entry.name;
            if(entry.type !== "explore") return column_type_name_of(entry.type);
            const list_id = list_id_of_path(entry.path);
            if(list_id !== null) return i18n_message("ui_list_picker_list_fallback_name", [list_id]);
            return entry.path === "/explore" ? i18n_message("ui_column_explore_title") : entry.path;
        }
        //key の行がどのラックの何番目にあるかを返す (無ければ null)
        function locate_entry(key){
            for (let rack_index = 0; rack_index < rack_ids.length; rack_index++) {
                const rack_id = rack_ids[rack_index];
                const index = rack_entries[rack_id].findIndex((entry) => entry.key === key);
                if(index !== -1) return {rack_id: rack_id, index: index, entry: rack_entries[rack_id][index]};
            }
            return null;
        }
        //両ラックの行を並びの順 (メイン → サイド) に 1 つの配列で返す
        function all_entries(){
            return rack_ids.flatMap((rack_id) => rack_entries[rack_id]);
        }
        //現在の追加先ラック (ラジオの選択)
        function target_rack_id(){
            return target_radios.find((radio) => radio.checked)?.value === "side" ? "side" : "main";
        }
        //新しい行を追加先ラックの末尾に加える
        function add_new_entry(column_type, column_path, list_name){
            const heading = build_column_heading(column_type, column_path, list_name, login_screen_name);
            const entry = {
                key: `new_${create_random_id()}`,
                type: column_type,
                path: column_type === "explore" ? column_path : "",
                label: heading?.label ?? "",
                name: column_type === "explore" ? list_name : "",
                section: null,
                pending_close: false,
                order: null,
            };
            const rack_id = target_rack_id();
            rack_entries[rack_id].push(entry);
            return {entry: entry, rack_id: rack_id};
        }
        //同じパスの行が一覧に無ければ追加先ラックの末尾に加える。閉じる印の付いた同じパスの行があれば印を外して残す。どちらも該当しなければ (既にある) false を返す
        function add_entry_if_absent(list_path, list_name){
            const same_path_entries = all_entries().filter((entry) => entry.type === "explore" && entry.path === list_path);
            if(same_path_entries.some((entry) => !entry.pending_close)) return false;
            const pending_entry = same_path_entries[same_path_entries.length - 1];
            if(pending_entry !== undefined){
                pending_entry.pending_close = false;
                return true;
            }
            add_new_entry("explore", list_path, list_name);
            return true;
        }
        //リストの出し入れを切り替える: 同じパスの行があれば末尾側の 1 件を外す (既存カラムなら閉じる印)、閉じる印の付いた行だけならそれを残すに戻す、無ければ追加する
        function toggle_list_entry(list_path, list_name){
            const same_path_entries = all_entries().filter((entry) => entry.type === "explore" && entry.path === list_path);
            const active_entries = same_path_entries.filter((entry) => !entry.pending_close);
            if(active_entries.length > 0){
                remove_entry(active_entries[active_entries.length - 1].key);
                return;
            }
            if(same_path_entries.length > 0){
                same_path_entries[same_path_entries.length - 1].pending_close = false;
                return;
            }
            add_new_entry("explore", list_path, list_name);
        }
        //行を外す。新しい行は一覧から取り除き、既存カラムの行は閉じる印を付けて残す
        function remove_entry(key){
            const located = locate_entry(key);
            if(located === null) return;
            if(located.entry.section === null){
                rack_entries[located.rack_id].splice(located.index, 1);
                return;
            }
            located.entry.pending_close = true;
        }
        //key の行を to_rack_id の to_index の位置へ動かす (to_index は取り除いた後の配列での位置)。位置が変わらない場合は false を返す
        function move_entry(key, to_rack_id, to_index){
            const located = locate_entry(key);
            if(located === null) return false;
            rack_entries[located.rack_id].splice(located.index, 1);
            const clamped_to = Math.max(0, Math.min(to_index, rack_entries[to_rack_id].length));
            rack_entries[to_rack_id].splice(clamped_to, 0, located.entry);
            return !(to_rack_id === located.rack_id && clamped_to === located.index);
        }
        //追加ボタンは入力欄に残った文字列も追加するため、追加する件数には解釈できる未追加の行も含める
        //入力欄の行の扱いは add_entry_if_absent と同じ規則で数える: 一覧にあるパスは数えず、閉じる印の付いた行と同じパスは追加ではなく残すに戻す (閉じる件数から引く)
        function update_count(){
            const entries = all_entries();
            const has_active_path = (list_path) => entries.some((entry) => !entry.pending_close && entry.type === "explore" && entry.path === list_path);
            const pending_close_paths = new Set(entries.filter((entry) => entry.pending_close && entry.type === "explore").map((entry) => entry.path));
            const manual_paths = parse_manual_list_entries(manual_textarea.value).paths.filter((list_path) => !has_active_path(list_path));
            const restore_count = manual_paths.filter((list_path) => pending_close_paths.has(list_path)).length;
            const new_count = entries.filter((entry) => entry.section === null).length + manual_paths.length - restore_count;
            const close_count = entries.filter((entry) => entry.pending_close).length - restore_count;
            count_area.textContent = i18n_message("ui_column_manager_count", [String(new_count), String(close_count)]);
        }
        //行の要素を組み立てる
        function build_item(entry){
            const item = document.createElement("li");
            item.className = "opd_column_manager_item";
            item.draggable = !entry.pending_close;
            item.tabIndex = 0;
            item.setAttribute("data-key", entry.key);
            item.setAttribute("data-column-type", entry.type);
            if(entry.pending_close) item.setAttribute("data-pending-close", "true");
            const handle = document.createElement("span");
            handle.className = "opd_column_manager_drag_handle";
            handle.setAttribute("aria-hidden", "true");
            handle.textContent = "⋮⋮";
            const order = document.createElement("span");
            order.className = "opd_column_manager_order";
            order.textContent = entry.order === null ? "" : `${entry.order}.`;
            const type_icon = document.createElement("span");
            type_icon.className = "opd_column_manager_type_icon";
            type_icon.setAttribute("aria-hidden", "true");
            type_icon.setAttribute("data-column-type", entry.type);
            if(entry.type === "explore" && is_list_page_path(entry.path)) type_icon.setAttribute("data-column-kind", "list");
            const heading = document.createElement("span");
            heading.className = "opd_column_manager_item_heading";
            const label = document.createElement("span");
            label.className = "opd_column_manager_item_label";
            label.textContent = entry.label;
            const name = document.createElement("span");
            name.className = "opd_column_manager_item_name";
            name.textContent = display_name_of(entry);
            heading.appendChild(label);
            heading.appendChild(name);
            item.appendChild(handle);
            item.appendChild(order);
            item.appendChild(type_icon);
            item.appendChild(heading);
            if(entry.section === null || entry.pending_close){
                const badge = document.createElement("span");
                badge.className = "opd_column_manager_badge";
                badge.setAttribute("data-badge", entry.pending_close ? "close" : "new");
                badge.textContent = i18n_message(entry.pending_close ? "ui_column_manager_badge_close" : "ui_column_manager_badge_new");
                item.appendChild(badge);
            }
            const action_btn = document.createElement("button");
            action_btn.type = "button";
            action_btn.className = `opd_column_manager_action_btn ${entry.pending_close ? "opd_column_manager_restore_btn" : "opd_column_manager_remove_btn"}`;
            action_btn.textContent = entry.pending_close ? i18n_message("ui_column_manager_restore_label") : "×";
            action_btn.setAttribute("aria-label", i18n_message(entry.pending_close ? "ui_column_manager_restore_button" : "ui_column_manager_remove_button", [display_name_of(entry)]));
            action_btn.title = action_btn.getAttribute("aria-label");
            item.appendChild(action_btn);
            return item;
        }
        //両ラックの一覧を描き直す。フォーカスが一覧の中にあった場合は同じ行 (または同じ行の操作ボタン) へ戻す
        function render_lists(){
            const active_element = document.activeElement;
            const active_item = (active_element !== null && racks_wrap.contains(active_element)) ? active_element.closest(item_selector) : null;
            const active_key = active_item === null ? null : active_item.getAttribute("data-key");
            const is_active_action_btn = active_element !== null && active_element.classList.contains("opd_column_manager_action_btn");
            //スクロールするのは両ラックを包む要素 (.opd_column_manager_racks) なので、その位置を保って描き直す
            const saved_scroll_top = racks_wrap.scrollTop;
            is_render_pending = false;
            //行を作り直すとドラッグ中の行が外れて dragend が届かないため、先にドラッグ状態を戻す
            end_drag();
            let order = 0;
            rack_ids.forEach((rack_id) => {
                rack_lists[rack_id].textContent = "";
                rack_entries[rack_id].forEach((entry) => {
                    entry.order = entry.pending_close ? null : ++order;
                    rack_lists[rack_id].appendChild(build_item(entry));
                });
                rack_empty_messages[rack_id].hidden = rack_entries[rack_id].length !== 0;
            });
            racks_wrap.scrollTop = saved_scroll_top;
            update_count();
            if(active_key === null) return;
            //外すなどで行が無くなった場合のフォーカス先は呼び出し側で決める
            const restored_item = find_item(active_key);
            if(restored_item === null) return;
            (is_active_action_btn ? restored_item.querySelector(".opd_column_manager_action_btn") : restored_item).focus();
        }
        function find_item(key){
            return racks_wrap.querySelector(`${item_selector}[data-key="${key}"]`);
        }
        //行を to_rack_id の to_index へ動かし、動いた場合は描き直して結果を知らせる
        function move_entry_and_render(key, to_rack_id, to_index){
            if(!move_entry(key, to_rack_id, to_index)) return;
            render_lists();
            mark_frame_cells();
            const located = locate_entry(key);
            if(located === null || located.entry.order === null) return;
            //読み上げる番号は行に表示している通し番号 (両ラックを通した番号、閉じる印の行は数えない) と同じにする
            selection_status_area.textContent = i18n_message("ui_column_manager_moved", [display_name_of(located.entry), rack_name_of(located.rack_id), String(located.entry.order)]);
        }
        //追加した行を描き直し、追加先を知らせる
        function announce_added(added){
            render_lists();
            mark_frame_cells();
            selection_status_area.textContent = i18n_message("ui_column_manager_added", [display_name_of(added.entry), rack_name_of(added.rack_id)]);
        }
        //ドラッグ中の行の落とし先の目印を消す
        function clear_drop_marks(){
            racks_wrap.querySelectorAll(item_selector).forEach((item) => {
                item.classList.remove("opd_column_manager_drop_before", "opd_column_manager_drop_after");
            });
            rack_ids.forEach((rack_id) => rack_wraps[rack_id].classList.remove("opd_column_manager_drop_end"));
        }
        //ドラッグ中の状態を戻す。行の描き直しやドロップで元の行が外れると dragend が一覧まで届かないため、描き直しとドロップの時にも呼ぶ
        function end_drag(){
            dragging_key = null;
            clear_drop_marks();
            racks_wrap.querySelectorAll(item_selector).forEach((item) => item.classList.remove("opd_column_manager_dragging"));
        }
        //ドラッグイベントの位置から落とし先を求める。行の上半分なら {rack_id, index: その行の位置, is_after: false}、下半分なら is_after: true、ラック内の行の外ならそのラックの末尾、ラックの外なら null
        function drop_target_from_event(event){
            const target = event.target instanceof Element ? event.target : null;
            const item = target?.closest(item_selector) ?? null;
            if(item !== null){
                const located = locate_entry(item.getAttribute("data-key"));
                if(located === null) return null;
                const rect = item.getBoundingClientRect();
                return {rack_id: located.rack_id, index: located.index, is_after: event.clientY > rect.top + rect.height / 2};
            }
            const rack_section = target?.closest(".opd_column_manager_rack") ?? null;
            if(rack_section === null) return null;
            const rack_id = rack_section.getAttribute("data-rack") === "side" ? "side" : "main";
            return {rack_id: rack_id, index: rack_entries[rack_id].length - 1, is_after: true};
        }
        //落とし先を並び替え後の位置に変換する (同じラックで手前から動かす場合は取り除いた分だけ手前へ詰める)
        function insert_index_of_drop(from, drop_target){
            let to_index = drop_target.is_after ? drop_target.index + 1 : drop_target.index;
            if(from.rack_id === drop_target.rack_id && from.index < to_index) to_index--;
            return to_index;
        }

        //iframe の表示先を差し替える。同一オリジンで操作できる場合は履歴を残さない replace を使う
        function navigate_frame(url){
            try{
                frame.contentWindow.location.replace(url);
            }catch(e){
                //contentWindow を操作できない場合は src の差し替えにフォールバックする
                frame.src = url;
            }
        }
        function set_frame_loading(is_loading){
            is_frame_loading = is_loading;
            frame_skeleton.hidden = !is_loading;
        }
        //ヘルパーの注入に失敗したことを記録する
        //frame_document: 注入に失敗した Document
        //上限に達するまでは属性を消して次回のポーリングで注入し直せるようにし、上限に達したら属性を "failed" にして打ち切る
        function record_helper_inject_failure(frame_document){
            const failure_count = (helper_inject_failures.get(frame_document) ?? 0) + 1;
            helper_inject_failures.set(frame_document, failure_count);
            if(failure_count < helper_inject_failure_limit){
                frame_document.documentElement?.removeAttribute("data-opd-list-picker-helper");
                return;
            }
            frame_document.documentElement?.setAttribute("data-opd-list-picker-helper", "failed");
        }
        //iframe の document に page world ヘルパー extensions/list_picker_helper.js を注入する
        //frame_document: リスト一覧ページを読み込んでいる iframe の Document
        //documentElement の data-opd-list-picker-helper 属性が既にある document には注入しない (Document ごとに 1 回)
        //head が無い場合は何もしない (次回のポーリングで再試行する)
        //注入時は属性を "loading" にし、ヘルパー自身が読み込み完了時に属性を "ready" へ更新する
        //script の error と注入時の例外は失敗回数が 3 回に達するまで属性を削除して再試行し (合計 3 回試行)、3 回目の失敗で属性を "failed" にする
        //script の load 後も属性が "ready" でなければ "failed" にする。"failed" の document には再注入せず、走査依頼も送らない
        function inject_list_picker_helper(frame_document){
            try{
                if(frame_document.documentElement.hasAttribute("data-opd-list-picker-helper")) return;
                if(!frame_document.head) return;
                const helper_script = frame_document.createElement("script");
                helper_script.src = chrome.runtime.getURL("extensions/list_picker_helper.js");
                helper_script.addEventListener("error", function(){
                    //読み込みに失敗した document は属性を消して次回のポーリングで注入し直すが、繰り返し失敗する document は打ち切る
                    record_helper_inject_failure(frame_document);
                });
                helper_script.addEventListener("load", function(){
                    //読み込めてもヘルパーが ready にできなかった document は、入れ直しても同じ結果になるため打ち切る
                    if(frame_document.documentElement?.getAttribute("data-opd-list-picker-helper") === "ready") return;
                    frame_document.documentElement?.setAttribute("data-opd-list-picker-helper", "failed");
                });
                frame_document.documentElement.setAttribute("data-opd-list-picker-helper", "loading");
                frame_document.head.appendChild(helper_script);
            }catch(e){
                //注入できなかった場合も失敗として数え、上限に達するまでは次回のポーリングでやり直す
                record_helper_inject_failure(frame_document);
            }
        }
        //ヘルパーが準備できていれば listCell へのリスト ID 付与を依頼する (走査は同期的に終わる)
        function request_helper_scan(frame_document){
            if(frame_document.documentElement?.getAttribute("data-opd-list-picker-helper") !== "ready") return;
            frame_document.dispatchEvent(new CustomEvent("opd_list_picker_scan"));
        }
        //iframe の document に、左ナビを隠し一覧にあるセルに枠と番号を重ねる style を入れる (Document ごとに 1 回)。色はダイアログ側の token と同じ値を使う
        function ensure_frame_style(frame_document){
            if(!frame_document.head) return;
            if(frame_document.head.querySelector("style[opd_list_picker_css]") !== null) return;
            const overlay_style = getComputedStyle(overlay);
            const accent = overlay_style.getPropertyValue("--opd-list-picker-accent").trim();
            const accent_text = overlay_style.getPropertyValue("--opd-list-picker-accent-text").trim();
            const accent_background = overlay_style.getPropertyValue("--opd-list-picker-accent-background").trim();
            const style = frame_document.createElement("style");
            style.setAttribute("opd_list_picker_css", "");
            style.textContent = `header[role="banner"]{display:none;}
                html{scrollbar-width:thin;}
                ${list_cell_selector}{cursor:pointer;position:relative;}
                ${list_cell_selector}[data-opd-list-picker-order]{box-shadow:inset 0 0 0 2px ${accent};background-color:${accent_background};}
                ${list_cell_selector}[data-opd-list-picker-order]::after{content:attr(data-opd-list-picker-order);position:absolute;top:0.4rem;left:0.4rem;z-index:1;min-width:1.6rem;height:1.6rem;padding:0 0.4rem;box-sizing:border-box;border-radius:0.8rem;background:${accent};color:${accent_text};font:700 0.85rem/1.6rem sans-serif;text-align:center;pointer-events:none;}`;
            frame_document.head.appendChild(style);
        }
        //iframe の document に listCell のクリック・キー入力の捕捉を登録する (Document ごとに 1 回)
        function prepare_frame_document(frame_document){
            if(frame_documents_prepared.has(frame_document)) return;
            frame_documents_prepared.add(frame_document);
            frame_document.addEventListener("click", on_frame_click, true);
            frame_document.addEventListener("auxclick", on_frame_click, true);
            frame_document.addEventListener("keydown", on_frame_keydown, true);
            frame_document.addEventListener("keydown", on_frame_escape);
        }
        //iframe 内のイベントの発生元から、それを含む listCell を返す (無ければ null)
        //iframe の要素は別 realm のため instanceof では判定できず、closest を持つかで要素かどうかを見る
        function list_cell_of_event(event){
            const target = event.target;
            if(!target || typeof target.closest !== "function") return null;
            return target.closest(list_cell_selector);
        }
        //listCell 内のクリックはページ遷移させず、左クリックだけ出し入れの切り替えにする
        function on_frame_click(event){
            const cell = list_cell_of_event(event);
            if(cell === null) return;
            event.preventDefault();
            event.stopPropagation();
            if(event.type !== "click" || event.button !== 0) return;
            toggle_cell(cell);
        }
        //iframe 内の Esc でもダイアログを閉じる。X の画面がオーバーレイを閉じるなどで Esc を処理した (preventDefault した) 場合はそちらを優先する
        function on_frame_escape(event){
            if(event.key !== "Escape" || event.defaultPrevented) return;
            event.preventDefault();
            close_dialog();
        }
        //listCell 上の Enter / Space はページ遷移させず出し入れの切り替えにする
        function on_frame_keydown(event){
            if(event.key !== "Enter" && event.key !== " ") return;
            const cell = list_cell_of_event(event);
            if(cell === null) return;
            event.preventDefault();
            event.stopPropagation();
            if(event.repeat) return;
            toggle_cell(cell);
        }
        //セルのリストの出し入れを切り替える。ID を決められないセルは手動入力を案内する
        function toggle_cell(cell){
            const frame_document = cell.ownerDocument;
            request_helper_scan(frame_document);
            const cell_info = resolve_list_cell_info(cell, frame_document.location.href);
            if(cell_info === null){
                status_area.textContent = i18n_message("ui_list_picker_cell_unresolved");
                return;
            }
            toggle_list_entry(`/i/lists/${cell_info.id}`, cell_info.name);
            //直前の未解決の案内は最新の操作の結果に置き換える
            status_area.textContent = "";
            render_lists();
            mark_frame_cells();
        }
        function get_frame_document(){
            try{
                return frame.contentDocument;
            }catch(e){
                //クロスオリジンなどで中身を読めない場合
                return null;
            }
        }
        //iframe に表示中の listCell に一覧での番号を属性で付け直す (同じリストの行が複数あれば先頭側の番号)。名前が無かった行はセルから名前を補う
        function mark_frame_cells(){
            const frame_document = get_frame_document();
            if(!frame_document) return;
            const entry_by_path = new Map();
            all_entries().forEach((entry) => {
                if(entry.pending_close || entry.type !== "explore" || entry_by_path.has(entry.path)) return;
                entry_by_path.set(entry.path, entry);
            });
            frame_document.querySelectorAll(list_cell_selector).forEach((cell) => {
                const cell_info = resolve_list_cell_info(cell, frame_document.location.href);
                const entry = cell_info === null ? undefined : entry_by_path.get(`/i/lists/${cell_info.id}`);
                if(entry === undefined || entry.order === null){
                    cell.removeAttribute("data-opd-list-picker-order");
                    return;
                }
                cell.setAttribute("data-opd-list-picker-order", String(entry.order));
                if(entry.name === "" && cell_info.name !== ""){
                    entry.name = cell_info.name;
                    is_render_pending = true;
                }
            });
            //ドラッグ中に行を作り直すとドラッグが途切れるため、名前の補完による描き直しはドラッグが終わった後の呼び出しまで持ち越す
            if(is_render_pending && dragging_key === null) render_lists();
        }
        function stop_frame_poll(){
            if(frame_poll_timer !== null){
                clearInterval(frame_poll_timer);
                frame_poll_timer = null;
            }
        }
        //対象 URL を読み込み (直し)、skeleton を表示する
        function load_frame(){
            frame_load_started_at = Date.now();
            has_frame_document = false;
            has_frame_reached_page = false;
            set_frame_loading(true);
            status_area.textContent = i18n_message("ui_list_picker_loading");
            navigate_frame(frame_url);
        }
        //読み込みを打ち切り、skeleton を外して理由を表示する。is_unreadable が真なら中身を読めない iframe を表示したままにせず空にする
        function finish_frame_loading(message, is_unreadable = false){
            stop_frame_poll();
            set_frame_loading(false);
            status_area.textContent = message;
            if(is_unreadable) navigate_frame("about:blank");
        }
        //指定ユーザーのリスト一覧ページを iframe に表示し、定期的に listCell へ番号を付け直す
        function start_frame(screen_name){
            stop_frame_poll();
            frame_expected_path = `/${screen_name}/lists`.toLowerCase();
            frame_url = `https://x.com/${screen_name}/lists`;
            frame_recover_count = 0;
            load_frame();
            frame_poll_timer = setInterval(poll_frame, frame_poll_interval_ms);
        }
        function poll_frame(){
            let frame_document = null;
            try{
                frame_document = frame.contentDocument;
            }catch(e){
                //クロスオリジンなどで中身を読めない場合は表示を諦める
                finish_frame_loading(i18n_message("ui_list_picker_error"), true);
                return;
            }
            //contentDocument が null になるのは別オリジンの document を表示しているときで、読み込み中かどうかに関わらず表示を諦める
            if(!frame_document){
                finish_frame_loading(i18n_message("ui_list_picker_error"), true);
                return;
            }
            const elapsed_ms = Date.now() - frame_load_started_at;
            const is_timed_out = is_frame_loading && elapsed_ms >= frame_load_limit_ms;
            //読み込み前の about:blank と本文が無い状態は判定材料にならないので次回に回す
            if(frame_document.location.href === "about:blank" || !frame_document.body){
                //本文を一度も読めないまま制限時間を過ぎた場合は読み込み自体に失敗している
                if(is_timed_out) finish_frame_loading(has_frame_document ? i18n_message("ui_list_picker_not_detected") : i18n_message("ui_list_picker_error"));
                return;
            }
            has_frame_document = true;
            //対象ページ以外 (ログイン画面など) を表示しているあいだも Esc で閉じられるよう、読める document には先に捕捉を登録する
            prepare_frame_document(frame_document);
            const frame_path_lower = frame_document.location.pathname.toLowerCase().replace(/\/+$/, "");
            if(frame_path_lower !== frame_expected_path){
                //ログイン画面へ飛ばされた場合は待っても表示できないため終了する
                if(frame_path_lower === "/login" || frame_path_lower.startsWith("/login/") || frame_path_lower.startsWith("/i/flow/login")){
                    finish_frame_loading(i18n_message("ui_list_picker_login_required"));
                    return;
                }
                //対象ページを表示した後に別のページへ遷移した場合は対象ページを読み込み直す。繰り返す場合は打ち切る
                if(has_frame_reached_page){
                    frame_recover_count++;
                    if(frame_recover_count > frame_recover_limit){
                        finish_frame_loading(i18n_message("ui_list_picker_error"));
                        return;
                    }
                    load_frame();
                    return;
                }
                if(is_timed_out) finish_frame_loading(i18n_message("ui_list_picker_not_detected"));
                return;
            }
            has_frame_reached_page = true;
            //リスト一覧ページを表示できたら style とヘルパーを入れる (入れ済みの document では何もしない)
            ensure_frame_style(frame_document);
            inject_list_picker_helper(frame_document);
            request_helper_scan(frame_document);
            mark_frame_cells();
            const has_list_cell = frame_document.querySelector(list_cell_selector) !== null;
            if(!is_frame_loading){
                //制限時間内に描画されず not_detected を出した後にセルが現れた場合は、その案内を消す
                if(has_list_cell && status_area.textContent === i18n_message("ui_list_picker_not_detected")) status_area.textContent = "";
                return;
            }
            if(has_list_cell){
                set_frame_loading(false);
                status_area.textContent = "";
                frame_recover_count = 0;
                return;
            }
            if(is_timed_out){
                set_frame_loading(false);
                status_area.textContent = i18n_message("ui_list_picker_not_detected");
            }
        }
        //ユーザー名入力欄の値をユーザーのリスト一覧のパスに解決する (解決できない入力は null)
        function user_lists_path_of_input(){
            const resolved_path = resolve_list_column_path(user_input.value);
            return /^\/[A-Za-z0-9_]{1,15}\/lists$/.test(resolved_path ?? "") ? resolved_path : null;
        }
        //ユーザー名入力欄の値から表示を始める。リスト一覧ページのパスに解決できない入力は受け付けない
        async function start_frame_from_input(){
            const user_lists_path = user_lists_path_of_input();
            if(user_lists_path === null){
                await show_alert_dialog(i18n_message("msg_list_picker_user_required"));
                user_input.focus();
                return;
            }
            start_frame(user_lists_path.split("/")[1]);
        }
        //読み込んだ document の中身を読めない (別オリジンなど) 場合は、読み込み中かどうかに関わらずエラーとして終了する
        //読める document には、対象ページかどうかに関わらず (about:blank でも) Esc を受け取れるよう捕捉を登録する
        function on_frame_load(){
            const frame_document = get_frame_document();
            if(frame_document !== null){
                prepare_frame_document(frame_document);
                return;
            }
            finish_frame_loading(i18n_message("ui_list_picker_error"), true);
        }
        //ダイアログを閉じ、タイマーと iframe の内容を解放してフォーカスを開いた要素へ戻す
        function close_dialog(){
            stop_frame_poll();
            document.removeEventListener("keydown", on_dialog_keydown);
            frame.removeEventListener("load", on_frame_load);
            overlay_observer.disconnect();
            navigate_frame("about:blank");
            release_inert();
            overlay.remove();
            opener_element?.focus?.();
        }
        //Esc で閉じ、Tab はダイアログ内のフォーカス可能要素を循環させる
        const on_dialog_keydown = create_dialog_keydown_handler(dialog, close_dialog);
        //入力欄の各行を解釈して追加先ラックの末尾へ追加する。解釈できない行があれば入力欄に残して知らせ、false を返す
        async function add_manual_entries(){
            const manual_entries = parse_manual_list_entries(manual_textarea.value);
            manual_entries.paths.forEach((list_path) => add_entry_if_absent(list_path, ""));
            render_lists();
            mark_frame_cells();
            if(manual_entries.invalid.length > 0){
                manual_textarea.value = manual_entries.invalid.join("\n");
                await show_alert_dialog(i18n_message("msg_list_picker_invalid_manual", [manual_entries.invalid.join("\n")]));
                manual_textarea.focus();
                return false;
            }
            manual_textarea.value = "";
            return true;
        }
        //種別ボタンから新しい行を追加する
        async function add_entry_of_type(button_type){
            if(button_type === "home" || button_type === "notification"){
                announce_added(add_new_entry(button_type, "", ""));
                return;
            }
            if(button_type === "explore"){
                announce_added(add_new_entry("explore", "/explore", ""));
                return;
            }
            //リスト一覧: ユーザー名入力欄 → ログイン中のユーザー の順にリスト一覧のパスを決める
            const current_login_screen_name = get_login_screen_name();
            const user_lists_path = user_lists_path_of_input() ?? (current_login_screen_name === null ? null : `/${current_login_screen_name}/lists`);
            if(user_lists_path === null){
                await show_alert_dialog(i18n_message("msg_list_picker_user_required"));
                user_input.focus();
                return;
            }
            announce_added(add_new_entry("explore", user_lists_path, ""));
        }
        //一覧の内容を両ラックへ一括反映する。入力欄に未追加の文字列が残っていれば先に追加を試みる
        async function apply_lists(){
            if(manual_textarea.value.trim() !== "" && !(await add_manual_entries())) return;
            const entries = all_entries();
            const new_count = entries.filter((entry) => entry.section === null).length;
            if(new_count > many_columns_threshold && !(await show_confirm_dialog(i18n_message("msg_list_picker_many_columns_confirm", [String(new_count)])))) return;
            const closing_entries = entries.filter((entry) => entry.pending_close);
            //実効ピン止め中のカラムを閉じるときは、その名前を並べて確認する
            const pinned_closing_names = closing_entries
                .filter((entry) => entry.type === "explore" && effective_column_setting(entry.section.querySelector("div[opd_column_type]"), "pinned", global_settings) === true)
                .map((entry) => display_name_of(entry));
            if(pinned_closing_names.length > 0 && !(await show_confirm_dialog(i18n_message("msg_column_manager_pinned_close_confirm", [pinned_closing_names.join("\n")])))) return;
            const layout = {};
            rack_ids.forEach((rack_id) => {
                layout[rack_id] = rack_entries[rack_id].filter((entry) => !entry.pending_close).map((entry) => entry.section !== null ? {section: entry.section} : {type: entry.type, path: entry.path});
            });
            close_dialog();
            apply_column_layout(layout, closing_entries.map((entry) => entry.section));
        }

        //追加先ラックの切り替えは本体の追加先 (opd_add_target_rack) にも反映する
        target_radios.forEach((radio) => {
            radio.checked = radio.value === add_target_rack;
            radio.addEventListener("change", function(){
                if(!this.checked) return;
                set_add_target_rack(this.value === "side" ? "side" : "main");
            });
        });
        type_buttons.addEventListener("click", function(event){
            const button = event.target instanceof Element ? event.target.closest(".opd_column_manager_type_btn") : null;
            if(button === null) return;
            add_entry_of_type(button.getAttribute("data-column-type"));
        });
        show_btn.addEventListener("click", start_frame_from_input);
        user_input.addEventListener("keydown", function(event){
            if(event.key !== "Enter") return;
            event.preventDefault();
            start_frame_from_input();
        });
        //そのとき ID を決められている表示中の listCell を文書順に、一覧に無いものだけ追加先ラックの末尾へ追加する (枠と番号を重ねられるセル由来のものに限る)
        select_all_btn.addEventListener("click", function(){
            const frame_document = get_frame_document();
            if(!frame_document) return;
            request_helper_scan(frame_document);
            frame_document.querySelectorAll(list_cell_selector).forEach((cell) => {
                const cell_info = resolve_list_cell_info(cell, frame_document.location.href);
                if(cell_info !== null) add_entry_if_absent(`/i/lists/${cell_info.id}`, cell_info.name);
            });
            render_lists();
            mark_frame_cells();
        });
        //追加した行だけをすべて外す (既存カラムの行には触れない)
        clear_new_btn.addEventListener("click", function(){
            rack_ids.forEach((rack_id) => {
                rack_entries[rack_id] = rack_entries[rack_id].filter((entry) => entry.section !== null);
            });
            render_lists();
            mark_frame_cells();
        });
        manual_add_btn.addEventListener("click", add_manual_entries);
        manual_textarea.addEventListener("input", update_count);
        //Enter で追加、Shift+Enter は改行のまま
        manual_textarea.addEventListener("keydown", function(event){
            if(event.key !== "Enter" || event.shiftKey || event.isComposing) return;
            event.preventDefault();
            add_manual_entries();
        });
        //行の操作ボタン: × で外す (既存カラムは閉じる印)、閉じる印の付いた行の「残す」で印を外す
        racks_wrap.addEventListener("click", function(event){
            const action_btn = event.target instanceof Element ? event.target.closest(".opd_column_manager_action_btn") : null;
            if(action_btn === null) return;
            const item = action_btn.closest(item_selector);
            const located = locate_entry(item.getAttribute("data-key"));
            if(located === null) return;
            if(located.entry.pending_close){
                located.entry.pending_close = false;
                render_lists();
                mark_frame_cells();
                return;
            }
            remove_entry(located.entry.key);
            render_lists();
            mark_frame_cells();
            //フォーカスは同じ行の操作ボタン (行が消えた場合は同じ位置、末尾を外した場合は新しい末尾の行の操作ボタン) へ移し、そのラックに行が無くなれば入力欄へ移す
            const rack = rack_entries[located.rack_id];
            const next_entry = rack[Math.min(located.index, rack.length - 1)];
            const next_item = next_entry === undefined ? null : find_item(next_entry.key);
            (next_item === null ? manual_textarea : next_item.querySelector(".opd_column_manager_action_btn")).focus();
        });
        //行にフォーカスした状態の Alt+↑ / Alt+↓ で 1 段ずつ動かす (ラックの端では隣のラックへ移る)。閉じる印の付いた行はドラッグと同様に動かさない
        racks_wrap.addEventListener("keydown", function(event){
            if(!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
            const item = event.target instanceof Element ? event.target.closest(item_selector) : null;
            if(item === null || item.hasAttribute("data-pending-close")) return;
            event.preventDefault();
            const located = locate_entry(item.getAttribute("data-key"));
            if(located === null) return;
            if(event.key === "ArrowUp"){
                if(located.index > 0){
                    move_entry_and_render(located.entry.key, located.rack_id, located.index - 1);
                }else if(located.rack_id === "side"){
                    move_entry_and_render(located.entry.key, "main", rack_entries.main.length);
                }
                return;
            }
            if(located.index < rack_entries[located.rack_id].length - 1){
                move_entry_and_render(located.entry.key, located.rack_id, located.index + 1);
            }else if(located.rack_id === "main"){
                move_entry_and_render(located.entry.key, "side", 0);
            }
        });
        racks_wrap.addEventListener("dragstart", function(event){
            const item = event.target instanceof Element ? event.target.closest(item_selector) : null;
            if(item === null || item.hasAttribute("data-pending-close")){
                event.preventDefault();
                return;
            }
            dragging_key = item.getAttribute("data-key");
            event.dataTransfer.effectAllowed = "move";
            //text/plain にすると入力欄へ落としたときに文字列が入るため、独自の type だけを持たせる (Firefox はデータが無いとドラッグを始めない)
            event.dataTransfer.setData("application/x-opd-column-manager", dragging_key);
            item.classList.add("opd_column_manager_dragging");
        });
        racks_wrap.addEventListener("dragend", end_drag);
        //落とし先の目印はラックの枠 (行の外) でも出す。落とせない場所 (ラックの隙間など) では目印を消し、ドロップも受け付けない
        racks_wrap.addEventListener("dragover", function(event){
            if(dragging_key === null) return;
            clear_drop_marks();
            const drop_target = drop_target_from_event(event);
            if(drop_target === null) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            if(drop_target.index === -1){
                rack_wraps[drop_target.rack_id].classList.add("opd_column_manager_drop_end");
                return;
            }
            const target_entry = rack_entries[drop_target.rack_id][drop_target.index];
            const target_item = find_item(target_entry.key);
            if(target_item === null || target_entry.key === dragging_key) return;
            target_item.classList.add(drop_target.is_after ? "opd_column_manager_drop_after" : "opd_column_manager_drop_before");
        });
        racks_wrap.addEventListener("dragleave", function(event){
            if(event.relatedTarget instanceof Node && racks_wrap.contains(event.relatedTarget)) return;
            clear_drop_marks();
        });
        racks_wrap.addEventListener("drop", function(event){
            if(dragging_key === null) return;
            const drop_target = drop_target_from_event(event);
            if(drop_target === null) return;
            event.preventDefault();
            const dropped_key = dragging_key;
            end_drag();
            const from = locate_entry(dropped_key);
            if(from === null) return;
            move_entry_and_render(dropped_key, drop_target.rack_id, insert_index_of_drop(from, drop_target));
        });
        apply_btn.addEventListener("click", apply_lists);
        cancel_btn.addEventListener("click", close_dialog);
        //背景 (オーバーレイ自身) の上で押して離してクリックされたときだけ閉じる
        overlay.addEventListener("mousedown", function(event){
            is_overlay_mousedown = event.target === overlay;
        });
        overlay.addEventListener("mouseup", function(event){
            is_overlay_mouseup = event.target === overlay;
        });
        overlay.addEventListener("click", function(event){
            const is_background_click = is_overlay_mousedown && is_overlay_mouseup && event.target === overlay;
            is_overlay_mousedown = false;
            is_overlay_mouseup = false;
            if(is_background_click) close_dialog();
        });
        document.addEventListener("keydown", on_dialog_keydown);
        frame.addEventListener("load", on_frame_load);
        //初期状態の about:blank でも iframe にフォーカスしたときに Esc を受け取れるようにする
        const initial_frame_document = get_frame_document();
        if(initial_frame_document !== null) prepare_frame_document(initial_frame_document);

        set_frame_loading(false);
        render_lists();
        get_dialog_focusable_elements(dialog)[0]?.focus();
        //ログイン中のユーザーが分かればそのままリスト一覧を表示する
        if(login_screen_name !== null){
            user_input.value = login_screen_name;
            start_frame(login_screen_name);
        }else{
            status_area.textContent = i18n_message("ui_list_picker_not_detected");
        }
    }
    //カラム管理ダイアログを開く
    document.getElementById("manage_columns").addEventListener("click", function(){
        open_column_manager_dialog(this);
    });
    //ボタンとして振る舞わせるため、Enter と Space でもダイアログを開く
    document.getElementById("manage_columns").addEventListener("keydown", function(event){
        if(event.repeat) return;
        if(event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        open_column_manager_dialog(this);
    });
    //全体設定ダイアログを開く
    document.getElementById("global_settings").addEventListener("click", function(){
        open_global_settings_dialog(this);
    });
    //ボタンとして振る舞わせるため、Enter と Space でもダイアログを開く
    document.getElementById("global_settings").addEventListener("keydown", function(event){
        if(event.repeat) return;
        if(event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        open_global_settings_dialog(this);
    });
    //プロファイル保存ボタン
    document.getElementById("profile_save").addEventListener("click", async function(){
        if(!(await show_confirm_dialog(i18n_message("msg_profile_save_confirm")))) return;
        let profile = column_settings_save("profile_out");
        const save_object = {name:"user_profile", profile:profile.column_settings, settings_schema_version:SETTINGS_SCHEMA_VERSION, global_settings:profile.global_settings};
        //console.log(profile)
        profile_store.push(save_object);
        //console.log(profile_store)
        chrome.storage.local.set({'opd_profile_store': JSON.stringify(profile_store)}, function () {
            let profile_list_btn_html = "";
            //プロファイルリスト初期化
            for (let index = 0; index < profile_store.length; index++) {
                profile_list_btn_html += `<div class="dsp_btn_parent" id="userProfile-${index}"><div class="dsp_btn_change_profile_btn">P${index}</div></div>`;
            }
            document.querySelector("#profile_btn_list").innerHTML = profile_list_btn_html;
            create_profile_list_btn();
        });
    });
    //プロファイル削除ボタン
    document.getElementById("profile_delete").addEventListener("click", async function(){
        const delete_input = await show_prompt_dialog(i18n_message("msg_profile_delete_number_prompt"));
        if(delete_input === null) return;
        const delete_num = Number(delete_input);
        //整数かつ存在するプロファイル番号だけを受け付ける (NaN は splice(0, 1) になりプロファイル 0 を消してしまう)
        if(delete_input.trim() === "" || !Number.isInteger(delete_num) || delete_num < 0 || delete_num >= profile_store.length){
            await show_alert_dialog(i18n_message("msg_invalid_value_alert"));
            return;
        }
        if(last_load_profile != delete_num){
            if(await show_confirm_dialog(i18n_message("msg_profile_delete_confirm", [delete_num]))){
                let after_profile_num = null;
                profile_store.splice(delete_num, 1);
                //console.log(profile_store)
                chrome.storage.local.set({'opd_profile_store': JSON.stringify(profile_store)}, function () {
                    //
                    chrome.storage.local.get("opd_settings", function(load_value){
                        //console.log(last_load_profile)
                        if(last_load_profile<delete_num){
                            after_profile_num = last_load_profile;
                        }else{
                            after_profile_num = last_load_profile - 1;
                        }
                        if(after_profile_num < 0){
                            after_profile_num = 0;
                        }
                        last_load_profile = after_profile_num;
                        //
                        console.log(after_profile_num)
                        let load_setting = JSON.parse(load_value.opd_settings);
                        load_setting.last_load_profile = after_profile_num;
                        chrome.storage.local.set({'opd_settings': JSON.stringify(load_setting)}, function () {
                            let profile_list_btn_html = "";
                            //プロファイルリスト初期化
                            for (let index = 0; index < profile_store.length; index++) {
                                profile_list_btn_html += `<div class="dsp_btn_parent" id="userProfile-${index}"><div class="dsp_btn_change_profile_btn">P${index}</div></div>`;
                            }
                            document.querySelector(".profile_val_now").textContent = after_profile_num;
                            document.querySelector("#profile_btn_list").innerHTML = profile_list_btn_html;
                            create_profile_list_btn();
                        });
                    });
                });
            }
        }else{
            await show_alert_dialog(i18n_message("msg_profile_delete_current_alert"));
        }
    });
    //カラム拡張機能の初期化(カラム拡張機能の追加はここで行います)
    function reinit_column_extensions(column_div){
        const column_frame = column_div?.querySelector("iframe");
        if(!column_frame) return;
        const column_type = column_div.getAttribute("opd_column_type");

        const ext_load = () => {
            //TODO:今後を見据えてカラム拡張を容易に組み込めるようにする
            const opd_utils = new OpdUtils();
            opd_utils.Init(column_frame);

            if(column_type === "home" || column_type === "explore"){
                const auto_reload = new OpdExtAutoReload();
                auto_reload.Init(column_frame);
                column_frame.opd_auto_reload = auto_reload;

                const blocker = new OpdMediaViewerBlocker();
                blocker.Init(column_frame);
                media_viewer_token.push(blocker.opd_send_media_info_token);
            }
        };

        //拡張が追加済なら追加しない
        if(column_frame.opd_extension_loader_added) return;
        column_frame.opd_extension_loader_added = true;

        //拡張を追加する
        column_frame.addEventListener("load", ext_load);
    }

    //カラム移動
    //イベントを登録する対象は両ラック直下のカラムに限る (メインバーの section を drop 先にしない)
    function column_dd(){
        let column_class = document.querySelectorAll("#first_rack_element > .dsp_column, #side_rack_element > .dsp_column");
        let column_copy_source = null;
        for (let index = 0; index < column_class.length; index++) {
            //既にイベントが登録済みのカラムはスキップ
            if(column_class[index].dataset.opd_dd_initialized === "1") continue;
            column_class[index].dataset.opd_dd_initialized = "1";
        
            column_class[index].addEventListener("dragstart", function(ev){
                //console.log(this)
                column_copy_source = this;
                ev.dataTransfer.setData('text/plain', ev.target.id);
            });
            column_class[index].addEventListener("dragover", function(ev){
                ev.preventDefault();
                //挿入位置の表示は outline で描く。outline はレイアウトへ影響せず (border はカラム幅を変え、サイドラックの幅を揺らす)、子要素 (不透明な iframe) より後に描かれるため隠れない
                this.style.outline = '3px solid var(--opd-accent)';
                this.style.outlineOffset = '-3px';
            });
            column_class[index].addEventListener("dragleave", function(){
                this.style.outline = '';
                this.style.outlineOffset = '';
            });
            column_class[index].addEventListener("drop", function(ev){
                ev.preventDefault();
                const dt_id = ev.dataTransfer.getData('text/plain');
                const dr_elem = document.getElementById(dt_id);
                if(dr_elem != null){
                    //DOM 上の移動で iframe は src から読み込み直されるため、読み込み先と見出し・副見出しを先に整える
                    prepare_column_for_dom_move(dr_elem);
                    this.parentNode.insertBefore(dr_elem, this);
                    this.style.outline = '';
                    this.style.outlineOffset = '';
                    update_side_rack_state();
                    column_settings_save("", last_load_profile);
                }else{
                    this.style.outline = '';
                    this.style.outlineOffset = '';
                }
            })
        }
    }
    //カラム終了
    function column_close(){
        const close_btns = document.querySelectorAll(".column_close_btn");
        for (let index = 0; index < close_btns.length; index++) {
            //既にイベントが登録済みのカラムはスキップ
            if(close_btns[index].dataset.opd_close_initialized === "1") continue;
                close_btns[index].dataset.opd_close_initialized = "1";
                close_btns[index].addEventListener("click", async function(){
                const target_column = this.closest(".dsp_column");
                const target_column_div = target_column.querySelector("div[opd_column_type]");
                //ピン止めは explore カラムだけの項目。実効ピン止め中のカラムを閉じるときだけ確認する
                const is_pinned = target_column_div?.getAttribute("opd_column_type") === "explore" && effective_column_setting(target_column_div, "pinned", global_settings) === true;
                if(!is_pinned){
                    stop_column_auto_reload(target_column_div);
                    target_column.remove();
                    append_object_css();
                    update_side_rack_state();
                    column_settings_save("", last_load_profile);
                }else{
                    if(!(await show_confirm_dialog(i18n_message("msg_pinned_column_close_confirm")))) return;
                    stop_column_auto_reload(target_column_div);
                    target_column.remove();
                    append_object_css();
                    update_side_rack_state();
                    column_settings_save("", last_load_profile);
                }
            })
        }
    }
    //===== ポストフォームのポップオーバー: run() スコープの処理 =====
    //ポストフォーム (https://x.com/intent/tweet の iframe) を、サイドバーの投稿ボタンの横に出す非モーダルの浮動パネル (ポップオーバー) で開閉する
    //#opd_main_element の末尾に #opd_post_form_popover (class "opd_post_form_popover" role="dialog" aria-labelledby) を 1 つだけ生成する。中身は見出しと閉じるボタンを並べたバーと、iframe に読み込み中の skeleton を重ねる枠
    //非モーダルなので開いているあいだも背景 (カラム・サイドバー) を操作でき、背景の inert もフォーカストラップも行わない
    //閉じるときは iframe を破棄せず隠すだけなので、書きかけの下書きは開き直しても残り、2 回目以降は読み込み待ちが無い。保持されるのは開閉のあいだだけで、プロファイル切替 (#opd_main_element の作り直し) やページ再読み込みでは失われる。開き直したときに iframe が composer 以外の画面に移っていた場合と、前回の読み込みが終わっていなかった場合だけ intent/tweet を読み込み直す
    //閉じる経路は 閉じるボタン / Esc / 開閉ボタンの再押下 / X の composer が閉じたことの検知 の 4 つ
    //Esc はポップオーバーの iframe 内と本体 UI (document) の 2 か所で受け取るため、他のカラムの iframe 内で押した Esc は届かない。X が Esc を処理した (preventDefault した) 場合はそちらを優先する
    //モーダルダイアログ (#opd_main_element 直下の .opd_dialog_overlay) が開いているあいだは新たに開かず、モーダルが背景に付けた inert がポップオーバーに乗っているあいだと、メディアビューワーの dialog が showModal で開いているあいだは Esc を無視しフォーカスも奪わない
    //composer が閉じたこと (投稿完了・下書き保存・破棄) は、page world の文章校正ヘルパーが送る window の opd_post_composer_closed (detail は JSON 文字列) で受け取る。iframe の documentElement に付けた data-opd-post-form-token と一致する通知だけを自分宛てとして扱う
    //ポップオーバー内の要素には .dsp_column クラス・opd_column_type 属性・opd_init_webview 属性・.column_close_btn クラスを付けない (カラムを一括走査するセレクタに拾われるため)。置き場所も #main_rack_element の外にする
    //生成済みのポップオーバー。初回に開いたときに作り、以後は表示・非表示を切り替えて使い回す
    let post_form_popover = null;
    //ポップオーバーを開いた要素。位置合わせの基準とフォーカスの戻し先に使う
    let post_form_opener = null;
    //composer 閉通知の送信元を照合する値。ポップオーバーの生成時に作る
    let post_form_token = null;
    //初期化済みの iframe の Document
    const post_form_prepared_documents = new WeakSet();
    //skeleton を外す上限時間のタイマー。読み込みが終わらなくても skeleton で X の画面 (エラー表示を含む) を隠し続けないようにする
    let post_form_skeleton_timer = null;
    const post_form_skeleton_limit_ms = 15000;
    //直近の読み込み失敗監視の解除関数
    let post_form_load_watch_cleanup = null;
    //iframe の読み込みが始まってから Document の初期化が終わるまで true。skeleton の表示 (上限時間で外れる) とは別に持つ
    let post_form_frame_loading = false;
    //iframe の読み込みを始めるときに呼ぶ。前回の読み込み失敗監視を外してから付け直し、skeleton を上限時間つきで表示する
    function start_post_form_frame_load(frame){
        post_form_load_watch_cleanup?.();
        post_form_load_watch_cleanup = watch_load_column([frame]);
        post_form_frame_loading = true;
        frame.src = "https://x.com/intent/tweet";
        set_post_form_skeleton_visible(true);
    }
    function set_post_form_skeleton_visible(is_visible){
        clearTimeout(post_form_skeleton_timer);
        post_form_skeleton_timer = null;
        const frame_skeleton = post_form_popover?.querySelector(".opd_post_form_frame_skeleton") ?? null;
        if(frame_skeleton === null) return;
        frame_skeleton.hidden = !is_visible;
        if(is_visible){
            post_form_skeleton_timer = setTimeout(function(){
                set_post_form_skeleton_visible(false);
            }, post_form_skeleton_limit_ms);
        }
    }
    //ポップオーバーが表示されているか
    function is_post_form_popover_open(){
        return post_form_popover !== null && post_form_popover.isConnected && !post_form_popover.hidden;
    }
    //開いているあいだだけ登録するリスナーを外す
    function remove_post_form_popover_listeners(){
        document.removeEventListener("keydown", on_post_form_document_keydown);
        window.removeEventListener("resize", on_post_form_window_resize);
        window.removeEventListener("opd_post_composer_closed", on_post_form_composer_closed);
    }
    //ポップオーバーが確保している資源 (開いているあいだのリスナー・skeleton のタイマー・読み込み失敗監視) をすべて解放する。#opd_main_element を作り直す前と、親ごと外れたことに気づいたときに呼ぶ
    function teardown_post_form_popover(){
        remove_post_form_popover_listeners();
        clearTimeout(post_form_skeleton_timer);
        post_form_skeleton_timer = null;
        post_form_load_watch_cleanup?.();
        post_form_load_watch_cleanup = null;
    }
    //プロファイル切替などでポップオーバーが親ごと外された場合は、資源を解放して以降の処理を止める
    function is_post_form_popover_detached(){
        if(post_form_popover !== null && post_form_popover.isConnected) return false;
        teardown_post_form_popover();
        return true;
    }
    //本体 UI にフォーカスがあるときの Esc で閉じる。他のモーダルが Esc を受け持つあいだ (モーダルダイアログの inert が乗っている / メディアビューワーの dialog が showModal で開いている) は何もしない
    function on_post_form_document_keydown(event){
        if(is_post_form_popover_detached()) return;
        if(event.key !== "Escape" || event.defaultPrevented) return;
        if(is_post_form_popover_blocked_by_modal()) return;
        event.preventDefault();
        close_post_form_popover();
    }
    //他のモーダルがポップオーバーの操作を塞いでいるか。モーダルダイアログは inert 属性で、top layer の dialog (メディアビューワー) は :modal で判定する
    function is_post_form_popover_blocked_by_modal(){
        return post_form_popover.hasAttribute("inert") || document.querySelector("dialog:modal") !== null;
    }
    //ウィンドウの大きさが変わっても開閉ボタンの横に留める
    function on_post_form_window_resize(){
        if(is_post_form_popover_detached()) return;
        position_post_form_popover();
    }
    //composer が閉じた通知。自分が開いた iframe からのもの (token が一致するもの) だけで閉じる
    function on_post_form_composer_closed(event){
        if(is_post_form_popover_detached()) return;
        let detail = null;
        try{
            detail = JSON.parse(event.detail);
        }catch(e){
            //読めない通知は送信元を照合できないため無視する
            return;
        }
        if(detail?.token !== post_form_token) return;
        close_post_form_popover();
    }
    //ポップオーバーの iframe 内で押した Esc で閉じる。X の画面が Esc を処理した場合はそちらを優先するため、伝播が終わってから defaultPrevented を見る (この場では preventDefault しない)
    //X が Esc に応えて確認 (下書きの破棄確認など) を出した場合も X の側に任せ、閉じない
    function on_post_form_frame_keydown(event){
        if(event.key !== "Escape") return;
        const frame_document = event.currentTarget;
        setTimeout(function(){
            if(event.defaultPrevented) return;
            if(!is_post_form_popover_open()) return;
            if(is_post_form_popover_blocked_by_modal()) return;
            if(frame_document?.querySelector?.('[data-testid="confirmationSheetDialog"], [role="alertdialog"]') !== null) return;
            close_post_form_popover();
        }, 0);
    }
    //iframe 内 head に属性つきの style 要素を用意する (無ければ作る)
    function ensure_post_form_frame_style(frame_head, style_attribute){
        let style_element = frame_head.querySelector(`style[${style_attribute}]`);
        if(style_element === null){
            frame_head.insertAdjacentHTML("beforeend", `<style ${style_attribute}></style>`);
            style_element = frame_head.querySelector(`style[${style_attribute}]`);
        }
        return style_element;
    }
    //ポストフォームの iframe の Document を初期化する (Document ごとに 1 回)
    //中身を読めない場合は何もしない (次回の load でやり直す)
    //各処理は個別に try/catch し、1 つが失敗しても残りを止めない
    function prepare_post_form_frame_document(frame){
        let frame_document = null;
        try{
            frame_document = frame.contentWindow?.document ?? null;
        }catch(e){
            //別オリジンなどで中身を読めない場合は次回の load でやり直す
            return;
        }
        if(frame_document === null) return;
        //src を入れる前の初期 Document (about:blank) の load は対象外にし、X の画面を読み込み終えるまで skeleton を残す
        if(frame_document.location?.href === "about:blank") return;
        if(post_form_prepared_documents.has(frame_document)) return;
        post_form_prepared_documents.add(frame_document);
        post_form_frame_loading = false;
        //読み込みが終わったので skeleton を外す
        try{
            set_post_form_skeleton_visible(false);
        }catch(e){
            console.warn("post form: skeleton を外せませんでした->", e);
        }
        //バナーとトップを隠し、スクロールバーを細くする
        try{
            const frame_head = frame_document.head;
            if(frame_head){
                ensure_post_form_frame_style(frame_head, "opd_main_css").textContent = `html{scrollbar-width:thin;}`;
                ensure_post_form_frame_style(frame_head, "opd_banner_css").textContent = COLUMN_IFRAME_CSS.banner_hidden;
                ensure_post_form_frame_style(frame_head, "opd_top_visible_css").textContent = COLUMN_IFRAME_CSS.top_hidden;
            }
        }catch(e){
            console.warn("post form: iframe の style を用意できませんでした->", e);
        }
        //page world のヘルパーが composer 閉通知に載せる照合用の値を渡す
        try{
            frame_document.documentElement.setAttribute("data-opd-post-form-token", post_form_token);
        }catch(e){
            console.warn("post form: token を渡せませんでした->", e);
        }
        try{
            frame_document.addEventListener("keydown", on_post_form_frame_keydown);
        }catch(e){
            console.warn("post form: iframe の keydown を登録できませんでした->", e);
        }
        try{
            new OpdUtils().Init(frame);
        }catch(e){
            console.warn("post form: OpdUtils を初期化できませんでした->", e);
        }
        try{
            //UITexts は ja と en の 2 言語しか無いため、UI 言語をどちらかに寄せる
            const ui_lang = chrome.i18n.getUILanguage().startsWith("ja") ? "ja" : "en";
            new OpdExtTextReview().Init(frame, ui_icon_define, ui_lang);
        }catch(e){
            console.warn("post form: OpdExtTextReview を初期化できませんでした->", e);
        }
    }
    //iframe がポストフォームを表示しているか。パスが intent/tweet か投稿後に開き直される compose/post 配下なら表示中、それ以外のパスでもダイアログとして開いた composer の入力欄が画面にあれば表示中とみなす (下書きを消さない側に倒す)。ホームタイムラインに埋め込まれた composer はダイアログではないため対象にならない
    //遷移が確定していない about:blank (下書きは存在しない) と、中身を読めない場合は表示していないとみなす
    function is_post_form_frame_on_composer(frame){
        try{
            const frame_window = frame.contentWindow;
            const frame_location = frame_window?.location;
            if(frame_location == null) return false;
            if(frame_location.href === "about:blank") return false;
            if(frame_location.pathname.startsWith("/intent/tweet") || frame_location.pathname.startsWith("/compose/post")) return true;
            return frame_window.document.querySelector('[role="dialog"] div[contenteditable="true"][data-testid*="tweetTextarea"]') !== null;
        }catch(e){
            return false;
        }
    }
    //ポストフォームのポップオーバーを開く。opener_element: 開いた要素 (位置合わせの基準とフォーカスの戻し先)
    function open_post_form_popover(opener_element){
        const main_element = document.getElementById("opd_main_element");
        if(main_element === null) return;
        //モーダルダイアログを開いているあいだは背景を操作できないため、ポップオーバーも開かない
        if(document.querySelector("#opd_main_element > .opd_dialog_overlay") !== null) return;
        //既に表示中なら二重に生成せず、ポストフォームへフォーカスを移す
        if(is_post_form_popover_open()){
            post_form_popover.querySelector(".opd_post_form_frame")?.focus?.();
            return;
        }
        if(post_form_popover === null || !post_form_popover.isConnected){
            post_form_token = crypto.randomUUID();
            const popover = document.createElement("div");
            popover.id = "opd_post_form_popover";
            popover.className = "opd_post_form_popover";
            popover.setAttribute("role", "dialog");
            popover.setAttribute("aria-labelledby", "opd_post_form_title");
            popover.hidden = true;
            popover.innerHTML = `<div class="opd_post_form_bar">
            <h2 class="opd_post_form_title" id="opd_post_form_title">${i18n_message("ui_post_form_header")}</h2>
            <button type="button" class="opd_post_form_close_btn" title="${i18n_message("ui_post_form_close_button")}" aria-label="${i18n_message("ui_post_form_close_button")}"><span class="opd_icon opd_icon_close" aria-hidden="true"></span></button>
            </div>
            <div class="opd_post_form_frame_wrap">
            <iframe class="opd_post_form_frame" title="${i18n_message("ui_post_form_frame_title")}" allow="fullscreen"></iframe>
            <div class="opd_post_form_frame_skeleton opd_frame_skeleton" aria-hidden="true"><span></span><span></span><span></span></div>
            </div>`;
            main_element.appendChild(popover);
            post_form_popover = popover;
            const new_frame = popover.querySelector(".opd_post_form_frame");
            popover.querySelector(".opd_post_form_close_btn").addEventListener("click", function(){
                close_post_form_popover();
            });
            new_frame.addEventListener("load", function(){
                prepare_post_form_frame_document(new_frame);
            });
            start_post_form_frame_load(new_frame);
        }else{
            //使い回す iframe が composer 以外の画面 (ホーム等) に移っていたり、遷移が確定していなかったり、前回の読み込みが終わらないまま閉じていたらポストフォームを読み込み直す (読み込みが終わっていない画面に下書きは無い)
            const frame = post_form_popover.querySelector(".opd_post_form_frame");
            if(post_form_frame_loading || !is_post_form_frame_on_composer(frame)) start_post_form_frame_load(frame);
        }
        post_form_popover.hidden = false;
        post_form_opener = opener_element ?? null;
        post_form_opener?.setAttribute?.("aria-expanded", "true");
        position_post_form_popover();
        document.addEventListener("keydown", on_post_form_document_keydown);
        window.addEventListener("resize", on_post_form_window_resize);
        window.addEventListener("opd_post_composer_closed", on_post_form_composer_closed);
        post_form_popover.querySelector(".opd_post_form_frame")?.focus?.();
    }
    //ポップオーバーを閉じる。iframe は破棄せず隠すだけなので書きかけの下書きは残る
    //フォーカスの戻しとテキストフォーカスの解除は、フォーカスがポップオーバーの中にあるときだけ行う (非モーダルなので、composer 閉通知が届いたときに別のカラムの入力欄を使っている場合があり、そのフォーカスと停止フラグには触れない)
    //フォーカスを戻すのを先にするのは、隠した後では iframe 内の focusout (テキストフォーカス解除の通知) が発火しないことがあるため。モーダルダイアログの inert が乗っているあいだはモーダルからフォーカスを奪わない
    //テキストフォーカスの解除は通知に頼らず明示的に行い、自動更新の停止フラグが残らないようにする
    function close_post_form_popover(){
        if(!is_post_form_popover_open()) return;
        if(post_form_popover.contains(document.activeElement)){
            if(!is_post_form_popover_blocked_by_modal()) post_form_opener?.focus?.();
            set_text_focus_state(false);
        }
        post_form_popover.hidden = true;
        post_form_opener?.setAttribute?.("aria-expanded", "false");
        //閉じているあいだは skeleton の上限時間を進めず (開き直したときに付け直す)、読み込み失敗監視の再読み込みも走らせない (開き直したときに composer 以外なら読み込み直す)
        teardown_post_form_popover();
    }
    //開閉ボタンの操作で表示と非表示を切り替える。opener_element: 開いた要素 (位置合わせの基準とフォーカスの戻し先)
    function toggle_post_form_popover(opener_element){
        if(is_post_form_popover_open()){
            close_post_form_popover();
            return;
        }
        open_post_form_popover(opener_element);
    }
    //ポップオーバーの上端を開いた要素の上端に合わせる。下端が画面からはみ出す場合は収まる位置まで上げ、上端は画面の上端から余白の分より上へは出さない (左端は CSS で固定)
    function position_post_form_popover(){
        if(post_form_popover === null || post_form_opener === null) return;
        const screen_margin = 8;
        const opener_top = post_form_opener.getBoundingClientRect().top;
        const max_top = window.innerHeight - post_form_popover.offsetHeight - screen_margin;
        post_form_popover.style.top = `${Math.max(screen_margin, Math.min(opener_top, max_top))}px`;
    }
    //===== 全体設定: run() スコープの処理 (global_settings / column_settings_save / last_load_profile / profile_store を参照する) =====
    //全体設定の適用対象カラム (home / notification / explore) を返す。構造用カラムは含めない
    function get_settings_target_columns(){
        return document.querySelectorAll('#opd_main_element div[opd_column_type="home"], #opd_main_element div[opd_column_type="notification"], #opd_main_element div[opd_column_type="explore"]');
    }
    //inherit 選択肢に併記する、項目 key の現在の全体値の表示名
    function global_setting_display_name(key){
        switch (key) {
            case "tw_view_mode":
                if(global_settings.tw_view_mode === "1") return i18n_message("ui_settings_view_mode_text_only");
                if(global_settings.tw_view_mode === "2") return i18n_message("ui_settings_view_mode_media_only");
                return i18n_message("ui_settings_view_mode_all");
            case "column_width":
                return `${Number(global_settings.column_width)}rem`;
            case "banner":
                return global_settings.banner ? i18n_message("ui_settings_visible") : i18n_message("ui_settings_hidden");
            case "top_visible":
                return global_settings.top_visible ? i18n_message("ui_settings_visible") : i18n_message("ui_settings_hidden");
            case "auto_reload":
                return global_settings.auto_reload ? i18n_message("ui_settings_enabled") : i18n_message("ui_settings_disabled");
            case "pinned":
                return global_settings.pinned ? i18n_message("ui_settings_pinned") : i18n_message("ui_settings_unpinned");
            default:
                return "";
        }
    }
    //項目 key の inherit 選択肢の表示文字列
    function inherit_option_label(key){
        return i18n_message("ui_settings_inherit_option", [global_setting_display_name(key)]);
    }
    //項目 key の保存値をカラム div の属性値へ変換する。normalize_column_setting_value に通した結果が
    //null (欠損・型不正・範囲外 = 全体設定に従う) なら "inherit"、それ以外はその値の文字列にする
    //これにより属性値は "inherit" / "true" / "false" / "0"〜"2" / 範囲内の数値文字列のいずれかに限られる
    function column_setting_attr_value(key, saved_value){
        const normalized_value = normalize_column_setting_value(key, saved_value);
        return normalized_value === null ? "inherit" : String(normalized_value);
    }
    //カラム追加時のテンプレート値。個別値はすべて "inherit" にし、幅・秒数は全体設定の値、見出しはカラム種別 (column_type) から決めた語をそのまま使う
    //explore カラムの見出しは screen_name を使わないため、その取得 (全 iframe の走査) を省く
    function inherit_column_template_values(column_type){
        const heading = build_column_heading(column_type, "", "", column_type === "explore" ? null : get_login_screen_name());
        return {
            column_num: create_random_id(),
            column_width_attr: "inherit",
            column_width_num: global_settings.column_width,
            column_auto_reload_time: global_settings.auto_reload_time / 1000,
            column_setting_banner: "inherit",
            column_setting_top_visible: "inherit",
            column_setting_tw_view_mode: "inherit",
            column_setting_auto_reload: "inherit",
            column_setting_auto_reload_time: "inherit",
            column_setting_pinned: "inherit",
            column_pinned_save_path: "",
            column_save_title: "",
            column_save_path: "",
            column_label: heading?.label ?? "",
            column_title: heading?.name ?? "",
            column_return_path: initial_column_return_path(column_type, ""),
        };
    }
    //カラム設定パネルの HTML を種別に応じて組み立てる (適用表に無い項目の行はそのカラム種別には出さない)
    //  options.iframe_styles: バナー表示 (select .opd_banner_mode)・トップ表示 (select .opd_top_visible_mode)・表示モード (select .opd_tw_view_mode: inherit/0/1/2) の行を含めるか
    //  options.auto_reload:   自動更新 (select .opd_a_reload_mode: inherit/true/false) と間隔 (checkbox .opd_a_reload_time_inherit + number .opd_a_reload_time_setting、秒単位) の行を含めるか
    //  options.pinned:        ピン止め (select .opd_pinned_mode) の行を含めるか
    //共通行: カラム幅 (select .opd_column_size_preset: inherit/0/1/2/3 と カスタムボタン .column_width_btn)
    //notification: {iframe_styles:true, auto_reload:false, pinned:false}、home: {true, true, false}、explore: {true, true, true}
    //各 select の inherit 選択肢は value="inherit" で、表示文字列は i18n の ui_settings_inherit_option に現在の全体値の表示名を渡したもの
    function build_column_settings_panel(options){
        //設定行 1 行分 (ラベルと入力) を組み立てる
        function settings_row(label_text, input_html){
            return `<div class="dsp_column_settings_content_div">${label_text}<span>${input_html}</span></div>`;
        }
        //inherit 選択肢を先頭に持つ select を組み立てる
        function settings_select(class_name, key, option_html){
            return `<select class="opd_select ${class_name}"><option value="inherit">${inherit_option_label(key)}</option>${option_html}</select>`;
        }
        const visible_option_html = `<option value="true">${i18n_message("ui_settings_visible")}</option><option value="false">${i18n_message("ui_settings_hidden")}</option>`;
        let rows_html = "";
        if(options.iframe_styles){
            rows_html += settings_row(i18n_message("ui_settings_view_mode_label"), settings_select("opd_tw_view_mode", "tw_view_mode", `<option value="0">${i18n_message("ui_settings_view_mode_all")}</option><option value="1">${i18n_message("ui_settings_view_mode_text_only")}</option><option value="2">${i18n_message("ui_settings_view_mode_media_only")}</option>`));
        }
        rows_html += settings_row(i18n_message("ui_settings_column_width_label"), settings_select("opd_column_size_preset", "column_width", `<option value="0">${i18n_message("ui_settings_column_width_small")}</option><option value="1">${i18n_message("ui_settings_column_width_medium")}</option><option value="2">${i18n_message("ui_settings_column_width_large")}</option><option value="3">${i18n_message("ui_settings_column_width_custom")}</option>`));
        rows_html += settings_row(i18n_message("ui_settings_column_width_custom_label"), `<input type="button" class="opd_btn opd_btn_sm column_width_btn" value="${i18n_message("ui_settings_column_width_custom_button")}"/>`);
        if(options.iframe_styles){
            rows_html += settings_row(i18n_message("ui_settings_banner_label"), settings_select("opd_banner_mode", "banner", visible_option_html));
            rows_html += settings_row(i18n_message("ui_settings_top_label"), settings_select("opd_top_visible_mode", "top_visible", visible_option_html));
        }
        if(options.auto_reload){
            rows_html += settings_row(i18n_message("ui_settings_auto_reload_label"), settings_select("opd_a_reload_mode", "auto_reload", `<option value="true">${i18n_message("ui_settings_enabled")}</option><option value="false">${i18n_message("ui_settings_disabled")}</option>`));
            rows_html += settings_row(i18n_message("ui_settings_auto_reload_interval_label"), `<label><input class="opd_checkbox opd_a_reload_time_inherit" type="checkbox">${i18n_message("ui_settings_inherit_checkbox_label")}</label><span class="opd_settings_input_group"><input class="opd_input opd_column_settings_input_text opd_a_reload_time_setting" type="number" min="${AUTO_RELOAD_TIME_MIN_MS / 1000}" max="${AUTO_RELOAD_TIME_MAX_MS / 1000}" value="%column_auto_reload_time%">${i18n_message("ui_settings_seconds_suffix")}</span>`);
        }
        if(options.pinned){
            rows_html += settings_row(i18n_message("ui_settings_pinned_label"), settings_select("opd_pinned_mode", "pinned", `<option value="true">${i18n_message("ui_settings_pinned")}</option><option value="false">${i18n_message("ui_settings_unpinned")}</option>`));
        }
        return `<div class="dsp_column_settings_panel"><div class="dsp_column_settings_panel_content"><h2>${i18n_message("ui_settings_header")}</h2><div class="dsp_column_settings_list">${rows_html}</div><div class="dsp_column_settings_panel_close_btn_wrap"><input type="button" class="opd_btn opd_btn_sm dsp_column_settings_panel_close_btn" value="${i18n_message("ui_settings_close_button")}"/></div></div></div>`;
    }
    //カラム設定パネルとカラムバーのイベントを登録する。登録済み (data-opd_settings_initialized="1") なら何もしない
    //  select / 入力の change: 対応する属性を更新 → apply_column_dom_state → (iframe 項目なら) apply_column_iframe_styles → column_settings_save
    //  ピン止めの select の change: opd_setting_pinned を更新 → reconcile_column_pinned → apply_column_dom_state → column_settings_save
    //  副見出しの戻るボタン click: 記録した戻り先パス (opd_column_return_path) を replaceState + popstate で iframe 内に開き直す。戻り先のタイトルが未記録なら、または X が応じなければ読み込み直しで戻す
    //  カスタム幅ボタン: prompt で rem を受け取り、COLUMN_WIDTH_MIN_REM 〜 COLUMN_WIDTH_MAX_REM の範囲なら opd_column_width に明示値を設定
    function bind_column_events(column_div){
        if(column_div == null) return;
        if(column_div.dataset.opd_settings_initialized === "1") return;
        column_div.dataset.opd_settings_initialized = "1";
        const settings_panel = column_div.querySelector(".dsp_column_settings_panel");
        //個別値を書き換えたあとの共通処理。iframe 内 CSS に関わる項目かどうかで再適用の範囲を変える
        function save_column_setting(is_iframe_style){
            apply_column_dom_state(column_div);
            if(is_iframe_style) apply_column_iframe_styles(column_div);
            column_settings_save("", last_load_profile);
        }
        //select の変更を属性へ書き戻す ("inherit" はそのまま属性に入れて全体設定に従わせる)
        function bind_setting_select(selector, key, is_iframe_style){
            const select_element = column_div.querySelector(selector);
            if(select_element === null) return;
            select_element.addEventListener("change", function(){
                column_div.setAttribute(COLUMN_INHERITABLE_SETTINGS[key], this.value);
                save_column_setting(is_iframe_style);
            });
        }
        //設定パネルの開閉
        column_div.querySelector(".opd_settings_btn")?.addEventListener("click", function(){
            if(settings_panel === null) return;
            if(settings_panel.getAttribute("open") == null){
                settings_panel.setAttribute("open", "");
                settings_panel.style.display = "flex";
            }else{
                settings_panel.removeAttribute("open");
                settings_panel.style.display = "none";
            }
        });
        column_div.querySelector(".dsp_column_settings_panel_close_btn")?.addEventListener("click", function(){
            if(settings_panel === null) return;
            settings_panel.removeAttribute("open");
            settings_panel.style.display = "none";
        });
        //設定パネルのホバー中はカラムをドラッグ移動できないようにする
        settings_panel?.addEventListener("mouseover", function(){
            column_div.closest(".dsp_column")?.setAttribute("draggable", "false");
        });
        settings_panel?.addEventListener("mouseleave", function(){
            column_div.closest(".dsp_column")?.setAttribute("draggable", "true");
        });
        //設定パネルの select
        bind_setting_select(".opd_tw_view_mode", "tw_view_mode", true);
        bind_setting_select(".opd_banner_mode", "banner", true);
        bind_setting_select(".opd_top_visible_mode", "top_visible", true);
        bind_setting_select(".opd_a_reload_mode", "auto_reload", false);
        //カラム幅のプリセット select は選択肢の値を rem へ読み替える
        column_div.querySelector(".opd_column_size_preset")?.addEventListener("change", function(){
            if(this.value === "inherit"){
                column_div.setAttribute("opd_column_width", "inherit");
            }else{
                const preset_rem = {"0": 15, "1": 20, "2": 30}[this.value] ?? 30;
                column_div.setAttribute("opd_column_width", String(preset_rem));
            }
            save_column_setting(false);
        });
        //カラム幅のカスタム入力
        column_div.querySelector(".column_width_btn")?.addEventListener("click", async function(){
            const now_width = effective_column_setting(column_div, "column_width", global_settings);
            const setting_width = await show_prompt_dialog(i18n_message("msg_column_width_prompt"), String(now_width));
            if(setting_width === null) return;
            const setting_width_num = Number(setting_width);
            if(!Number.isFinite(setting_width_num) || setting_width_num < COLUMN_WIDTH_MIN_REM || setting_width_num > COLUMN_WIDTH_MAX_REM){
                await show_alert_dialog(i18n_message("msg_invalid_value_alert"));
                return;
            }
            column_div.setAttribute("opd_column_width", String(setting_width_num));
            save_column_setting(false);
        });
        //自動更新間隔の「全体設定に従う」チェックボックス
        column_div.querySelector(".opd_a_reload_time_inherit")?.addEventListener("change", function(){
            if(this.checked){
                column_div.setAttribute("opd_setting_auto_reload_time", "inherit");
            }else{
                const time_input = column_div.querySelector(".opd_a_reload_time_setting");
                column_div.setAttribute("opd_setting_auto_reload_time", String(Number(time_input.value) * 1000));
            }
            save_column_setting(false);
        });
        //自動更新間隔の入力欄。下限・上限を外れた値は受け付けず、変更前の実効値へ戻す
        column_div.querySelector(".opd_a_reload_time_setting")?.addEventListener("change", async function(){
            //readonly (全体設定に従う) のあいだは値を実効値へ戻して受け付けない
            if(this.readOnly){
                this.value = String(effective_column_setting(column_div, "auto_reload_time", global_settings) / 1000);
                return;
            }
            const input_time_ms = Number(this.value) * 1000;
            if(Number.isFinite(input_time_ms) && input_time_ms >= AUTO_RELOAD_TIME_MIN_MS && input_time_ms <= AUTO_RELOAD_TIME_MAX_MS){
                await show_alert_dialog(i18n_message("msg_auto_reload_set", [this.value]));
            }else{
                await show_alert_dialog(i18n_message("msg_global_settings_invalid_interval"));
                this.value = String(effective_column_setting(column_div, "auto_reload_time", global_settings) / 1000);
            }
            column_div.setAttribute("opd_setting_auto_reload_time", String(Number(this.value) * 1000));
            save_column_setting(false);
        });
        //ピン止めの select は実効値が変わった時点でピン止めパスを整える
        column_div.querySelector(".opd_pinned_mode")?.addEventListener("change", function(){
            column_div.setAttribute("opd_setting_pinned", this.value);
            reconcile_column_pinned(column_div);
            save_column_setting(false);
        });
        const column_frame = column_div.querySelector("iframe");
        if(column_frame !== null){
            //ホバー中は自動更新による先頭への遷移を止める
            column_frame.addEventListener("mouseover", function(){
                this.setAttribute("auto_reload_mouse_hover", "true");
            });
            column_frame.addEventListener("mouseleave", function(){
                this.setAttribute("auto_reload_mouse_hover", "false");
            });
            //カラムバー空白領域クリックでトップにスクロール
            column_div.querySelector(".opd_column_scroll_to_top")?.addEventListener("click", function(){
                column_frame.contentWindow?.scrollTo({ top: 0, behavior: "auto" });
            });
            //カラムバーの更新ボタン (表示の出し分けは apply_column_dom_state)。自動更新 1 回分と同じ処理 (タイムラインの更新 + 先頭へスクロール) をその場で行う
            //iframe が更新対象のパス (is_column_reload_path) 以外 (ポスト単体など) を表示中は更新せず先頭へ戻すだけにする。別オリジンを表示していてパスを読めないときは何もしない
            column_div.querySelector(".opd_column_reload_btn")?.addEventListener("click", function(){
                const path_name = column_frame_path_name(column_frame);
                if(path_name === null) return;
                if(!is_column_reload_path(path_name)){
                    column_frame.contentWindow?.scrollTo({ top: 0, behavior: "auto" });
                    return;
                }
                reload_column_and_scroll_to_top(column_frame);
            });
            //副見出しの戻るボタン。カラムが記録している戻り先パス (ポスト以外で最後に表示したページ) を iframe 内で開き直す
            //iframe の history はタブ全体で共有され、back() は他のカラムの遷移まで巻き戻し、pushState はブラウザの「戻る」の段数を増やすため、replaceState + popstate で X の画面遷移を起こす (X のルーターは popstate で location を読み直す)
            //副見出しの表示はここでは更新せず、X が画面を描き直したときは遷移監視に、読み込み直したときは load に任せる (表示中のページに合わせて決める)
            //読み込み直しの保険は 1 カラムにつき 1 つだけ予約し (opd_subbar_fallback_timer)、再クリックと reset_column_subbar_before_reload で前の予約を取り消す
            //戻り先ページのタイトルを記録していない (このカラムがポスト以外のページをまだ表示していない) ときは遷移の成否を判定できないため、popstate を試みず最初から読み込み直しで戻す
            column_div.querySelector(".opd_column_subbar_back")?.addEventListener("click", function(){
                const return_path = column_div.getAttribute("opd_column_return_path") || initial_column_return_path(column_div.getAttribute("opd_column_type"), column_div.getAttribute("opd_explore_path"));
                const return_title = column_div.getAttribute("opd_column_return_title");
                clearTimeout(column_div.opd_subbar_fallback_timer);
                column_div.opd_subbar_fallback_timer = null;
                //読み込み直しで戻す。読み込み後の取り込み (load) は保存しないため、explore カラムは読み込み先を表示中のパスとしてここで保存する (デッキの再読込でポストが開き直されないようにする)
                const reload_to_return_path = function(){
                    try{
                        column_frame.contentWindow.location.replace(`https://x.com${return_path}`);
                    }catch(reload_error){
                        console.warn("column subbar: 戻る操作を実行できませんでした->", reload_error);
                        return;
                    }
                    if(column_div.getAttribute("opd_column_type") !== "explore") return;
                    column_div.setAttribute("opd_explore_path", return_path);
                    if(return_title !== null) column_div.setAttribute("opd_explore_title", return_title);
                    update_column_heading(column_div);
                    column_settings_save("", last_load_profile);
                };
                if(return_title === null){
                    reload_to_return_path();
                    return;
                }
                try{
                    const frame_window = column_frame.contentWindow;
                    const clicked_title = normalize_column_page_title(frame_window.document.title, frame_window.location.pathname);
                    //X のルーターが履歴エントリに持たせている state はそのまま引き継ぎ、popstate にも同じ state を載せる
                    const history_state = frame_window.history.state;
                    frame_window.history.replaceState(history_state, "", return_path);
                    frame_window.dispatchEvent(new frame_window.PopStateEvent("popstate", {state: history_state}));
                    //X が popstate に応じなかった場合の保険。1.5 秒後もパスが戻り先のままで、ページタイトルが戻り先ページのものになっていなければ読み込み直して戻す
                    //X は画面を切り替えるとページタイトルを書き換えるため、記録した戻り先ページのタイトルになっていることを遷移できた印とみなす (未読数の変化だけで変わったとみなさないよう正規化して比べる)
                    //切り替え中はタイトルが空 (読み込み中の仮タイトル) のことがあり、切り替えが遅いとクリック時のタイトルのままのこともあるため、そのときは判定を保留して同じ間隔でもう一度確かめる (確かめ直しは 2 回まで。それでも戻り先のタイトルになっていなければ読み込み直す)
                    //その間に別のページへ移っていれば (パスが戻り先と違えば) 何もしない
                    const fallback_interval_ms = 1500;
                    let fallback_rechecks_left = 2;
                    const check_return_navigation = function(){
                        column_div.opd_subbar_fallback_timer = null;
                        try{
                            if(`${frame_window.location.pathname}${frame_window.location.search}` !== return_path) return;
                            const current_title = normalize_column_page_title(frame_window.document.title, frame_window.location.pathname);
                            if((current_title === "" || current_title === clicked_title) && fallback_rechecks_left > 0){
                                fallback_rechecks_left--;
                                column_div.opd_subbar_fallback_timer = setTimeout(check_return_navigation, fallback_interval_ms);
                                return;
                            }
                            if(current_title === return_title) return;
                            reload_to_return_path();
                        }catch(fallback_error){
                            //中身を読めなくなっていれば何もしない
                        }
                    };
                    column_div.opd_subbar_fallback_timer = setTimeout(check_return_navigation, fallback_interval_ms);
                }catch(e){
                    //中身を操作できない (別オリジン等) ときは読み込み直しで戻す
                    reload_to_return_path();
                }
            });
        }
    }
    //iframe の load を待たずに同期で反映できる項目をカラム div へ適用する
    //  カラム幅: style.width = 実効 rem、幅 select の選択値 (15→0 / 20→1 / 30→2 / inherit→inherit / その他→3)
    //  パネル表示: 各 select の選択値と inherit 選択肢の表示文字列、間隔入力の値 (秒) と disabled 状態
    //  ピン止め: reconcile_column_pinned
    //  自動更新: apply_column_auto_reload
    function apply_column_dom_state(column_div){
        if(column_div == null) return;
        //select の選択値を保存値に、inherit 選択肢の表示を現在の全体値に合わせる
        function apply_setting_select(selector, key){
            const select_element = column_div.querySelector(selector);
            if(select_element === null) return;
            const inherit_option = select_element.querySelector('option[value="inherit"]');
            if(inherit_option !== null) inherit_option.textContent = inherit_option_label(key);
            const saved_value = read_column_setting(column_div, key);
            select_element.value = saved_value === null ? "inherit" : String(saved_value);
        }
        //カラム幅
        column_div.style.width = `${effective_column_setting(column_div, "column_width", global_settings)}rem`;
        const width_select = column_div.querySelector(".opd_column_size_preset");
        if(width_select !== null){
            const width_inherit_option = width_select.querySelector('option[value="inherit"]');
            if(width_inherit_option !== null) width_inherit_option.textContent = inherit_option_label("column_width");
            const saved_width = read_column_setting(column_div, "column_width");
            const width_preset_value = {15: "0", 20: "1", 30: "2"}[saved_width];
            width_select.value = saved_width === null ? "inherit" : (width_preset_value ?? "3");
        }
        //パネルの select
        apply_setting_select(".opd_tw_view_mode", "tw_view_mode");
        apply_setting_select(".opd_banner_mode", "banner");
        apply_setting_select(".opd_top_visible_mode", "top_visible");
        apply_setting_select(".opd_a_reload_mode", "auto_reload");
        apply_setting_select(".opd_pinned_mode", "pinned");
        //自動更新間隔の入力欄 (秒)。全体設定に従うあいだは readonly + aria-disabled にして入力を受け付けず、
        //フォーカスと tooltip は残して title で解除条件を示す (native disabled は tooltip が出ずタブ順からも外れるため使わない)
        //自動更新の実行中でも編集できる (apply_column_auto_reload が実効間隔の変化を検出して interval を作り直す)
        const reload_time_input = column_div.querySelector(".opd_a_reload_time_setting");
        if(reload_time_input !== null){
            const is_time_inherit = read_column_setting(column_div, "auto_reload_time") === null;
            const reload_time_inherit_checkbox = column_div.querySelector(".opd_a_reload_time_inherit");
            if(reload_time_inherit_checkbox !== null) reload_time_inherit_checkbox.checked = is_time_inherit;
            reload_time_input.value = String(effective_column_setting(column_div, "auto_reload_time", global_settings) / 1000);
            reload_time_input.readOnly = is_time_inherit;
            reload_time_input.setAttribute("aria-disabled", String(is_time_inherit));
            reload_time_input.title = is_time_inherit ? i18n_message("ui_settings_inherit_input_title") : "";
        }
        reconcile_column_pinned(column_div);
        apply_column_auto_reload(column_div);
        //カラムバーの更新ボタンは home カラムで実効 auto_reload が false のときだけ出す (自動更新中は手動更新の出番が無いため隠す)
        const reload_btn_wrap = column_div.querySelector(".dsp_column_reload_btn_wrap");
        if(reload_btn_wrap !== null){
            const is_manual_reload_target = column_div.getAttribute("opd_column_type") === "home" && effective_column_setting(column_div, "auto_reload", global_settings) !== true;
            reload_btn_wrap.hidden = !is_manual_reload_target;
        }
    }
    //iframe 内 head に style 要素 (style[opd_banner_css] / style[opd_top_visible_css] / style[opd_tw_view_mode_css]) を用意し、実効値に応じて COLUMN_IFRAME_CSS の文字列を設定する
    //iframe の contentWindow.document.head が読めない (未生成・クロスオリジン) 場合は何もしない (次回 load で再適用される)
    //トップ非表示の CSS はカラム種別で選ぶ: home カラムは top_hidden_home、それ以外は top_hidden (リスト系ページの見出しも隠し、リスト名はカラム見出しに出す)
    function apply_column_iframe_styles(column_div){
        const column_frame = column_div?.querySelector("iframe");
        if(!column_frame) return;
        let frame_head = null;
        try{
            frame_head = column_frame.contentWindow?.document?.head ?? null;
        }catch(e){
            //別オリジンなどで中身を読めない場合は次回の load で適用し直す
            return;
        }
        if(frame_head === null) return;
        //属性つきの style 要素を用意する (無ければ作る)
        function ensure_frame_style(style_attribute){
            let style_element = frame_head.querySelector(`style[${style_attribute}]`);
            if(style_element === null){
                frame_head.insertAdjacentHTML("beforeend", `<style ${style_attribute}></style>`);
                style_element = frame_head.querySelector(`style[${style_attribute}]`);
            }
            return style_element;
        }
        //共通CSS(スクロールバーを細くする)
        ensure_frame_style("opd_main_css").textContent = `html{scrollbar-width:thin;}`;
        const banner_style = ensure_frame_style("opd_banner_css");
        const top_visible_style = ensure_frame_style("opd_top_visible_css");
        const tw_view_mode_style = ensure_frame_style("opd_tw_view_mode_css");
        const column_type = column_div.getAttribute("opd_column_type");
        banner_style.textContent = effective_column_setting(column_div, "banner", global_settings) === true ? `` : COLUMN_IFRAME_CSS.banner_hidden;
        if(effective_column_setting(column_div, "top_visible", global_settings) === true){
            top_visible_style.textContent = ``;
        }else if(column_type === "home"){
            top_visible_style.textContent = COLUMN_IFRAME_CSS.top_hidden_home;
        }else{
            top_visible_style.textContent = COLUMN_IFRAME_CSS.top_hidden;
        }
        switch (effective_column_setting(column_div, "tw_view_mode", global_settings)) {
            case "1":
                tw_view_mode_style.textContent = COLUMN_IFRAME_CSS.tw_view_text_only;
                break;
            case "2":
                tw_view_mode_style.textContent = COLUMN_IFRAME_CSS.tw_view_media_only;
                break;
            default:
                tw_view_mode_style.textContent = ``;
                break;
        }
    }
    //explore カラムの保存やピン止めに使う「カラムを識別するパス」を返す
    //表示中のページがポスト単体なら、表示中のポストではなく戻り先 (ポスト以外で最後に表示したページ) を使い、リスト / 検索としての識別を保つ
    function explore_column_persist_path(column_div){
        const explore_path = column_div.getAttribute("opd_explore_path") ?? "";
        if(match_post_page_path(explore_path) === null) return explore_path;
        return column_div.getAttribute("opd_column_return_path") || initial_column_return_path("explore", explore_path);
    }
    //ピン止めの不変条件「opd_pinned_path が非空 ⇔ 実効ピン止め」を保つ
    //  実効値 = opd_setting_pinned ("inherit" なら global_settings.pinned)
    //  実効 true かつ opd_pinned_path が空: カラムを識別するパス (explore_column_persist_path) を opd_pinned_path に記録する
    //  実効 false: opd_pinned_path を "" にする
    //explore 以外のカラムでは何もしない。起動・追加・個別変更・全体変更のすべての経路から呼ぶ
    function reconcile_column_pinned(column_div){
        if(column_div == null) return;
        if(column_div.getAttribute("opd_column_type") !== "explore") return;
        const is_pinned = effective_column_setting(column_div, "pinned", global_settings) === true;
        if(is_pinned){
            //実効ピン止めになった時点のパスを記録する
            if((column_div.getAttribute("opd_pinned_path") ?? "") === ""){
                column_div.setAttribute("opd_pinned_path", explore_column_persist_path(column_div));
            }
        }else{
            column_div.setAttribute("opd_pinned_path", "");
        }
    }
    //自動更新 interval を冪等に再構成する: 実効 auto_reload と実効 auto_reload_time (ms) が動作中の interval (iframe 要素の opd_auto_reload_interval_id / opd_auto_reload_interval_ms) と同じなら何もせずカウントダウンを維持し、
    //異なるときだけ既存の interval を clear して作り直す (実効 auto_reload が false なら止めるだけ)
    //interval は毎回、iframe が更新対象のパス (is_column_reload_path) を表示していることを確かめ、iframe にマウスが乗っている (auto_reload_mouse_hover が "false" 以外) あいだは何もしない。
    //is_auto_update() がカラム全体の自動更新を許可していれば reload_column_and_scroll_to_top で更新する
    function apply_column_auto_reload(column_div){
        const column_frame = column_div?.querySelector("iframe");
        if(!column_frame) return;
        //自動更新の対象は home / explore カラムのみ
        const column_type = column_div.getAttribute("opd_column_type");
        const is_enabled = (column_type === "home" || column_type === "explore") && effective_column_setting(column_div, "auto_reload", global_settings) === true;
        const auto_reload_time = is_enabled ? effective_column_setting(column_div, "auto_reload_time", global_settings) : null;
        if(is_enabled && column_frame.opd_auto_reload_interval_id != null && column_frame.opd_auto_reload_interval_ms === auto_reload_time) return;
        stop_column_auto_reload(column_div);
        if(!is_enabled) return;
        column_frame.opd_auto_reload_interval_ms = auto_reload_time;
        column_frame.opd_auto_reload_interval_id = setInterval(function(){
            const path_name = column_frame_path_name(column_frame);
            //別オリジンを表示しているあいだは自動更新しない
            if(path_name === null) return;
            if(!is_column_reload_path(path_name)) return;
            if(column_frame.getAttribute("auto_reload_mouse_hover") != "false") return;
            //カラムの自動更新が全体的に許可されていない場合は自動更新を無効化する
            if(!column_frame.opd_auto_reload || !is_auto_update()) return;
            reload_column_and_scroll_to_top(column_frame);
        }, auto_reload_time);
    }
    //iframe が表示中のパス (pathname) を返す。iframe が無い・別オリジンを表示していて読めないときは null
    function column_frame_path_name(column_frame){
        try{
            return column_frame?.contentWindow?.location.pathname ?? null;
        }catch(e){
            return null;
        }
    }
    //自動更新・手動更新の対象になるパスかどうか (/home・/search・/i/lists 配下)
    function is_column_reload_path(path_name){
        return ['/home', '/search'].includes(path_name) || path_name.startsWith('/i/lists');
    }
    //タイムラインを更新し、その 100ms 後に iframe を先頭までスクロールする (自動更新 1 回分の処理。カラムバーの更新ボタンからも呼ぶ)
    //更新は OpdExtAutoReload の Reload (X の onRefresh を呼ぶ) で行う。iframe の load 前などで拡張がまだ無いときは更新せずスクロールだけ行う
    function reload_column_and_scroll_to_top(column_frame){
        const frame_window = column_frame?.contentWindow;
        if(frame_window == null) return;
        column_frame.opd_auto_reload?.Reload(frame_window);
        setTimeout(() => {
            column_frame.contentWindow?.scrollTo({ top: 0, behavior: 'auto' });
        }, 100);
    }
    //自動更新 interval を止める。カラムを閉じる・プロファイルを切り替える (#opd_main_element を外す) 前に対象カラム全部へ呼ぶ
    function stop_column_auto_reload(column_div){
        const column_frame = column_div?.querySelector("iframe");
        if(!column_frame) return;
        if(column_frame.opd_auto_reload_interval_id == null) return;
        clearInterval(column_frame.opd_auto_reload_interval_id);
        column_frame.opd_auto_reload_interval_id = null;
        column_frame.opd_auto_reload_interval_ms = null;
    }
    //全体設定の変更を全カラムへ反映する: 適用表の対象カラム (home / notification / explore) それぞれに apply_column_dom_state と apply_column_iframe_styles を呼び、column_settings_save で保存する
    //構造用カラム (main_bar_empty_column / empty_column / side_empty_column / dsp_column) には触れない
    function apply_global_settings_to_columns(){
        get_settings_target_columns().forEach((column_div) => {
            apply_column_dom_state(column_div);
            apply_column_iframe_styles(column_div);
        });
        column_settings_save("", last_load_profile);
    }
    //通知・確認・入力ダイアログ (ブラウザの alert / confirm / prompt の代替) を開き、閉じたときに結果で解決する Promise を返す
    //mode: "alert" (OK のみ) / "confirm" (キャンセルと OK) / "prompt" (入力欄 + キャンセルと OK)
    //解決する値は OK が prompt なら入力文字列・それ以外は true、キャンセル (キャンセルボタン / Esc / 背景クリック) が prompt なら null・それ以外は false
    //呼び出しごとに #opd_main_element の直下へオーバーレイ (class "opd_dialog_overlay opd_message_dialog_overlay") を 1 つ作るため、開いているあいだに呼ばれても互いに影響しない
    //本文は textContent で入れる (改行は CSS の white-space: pre-wrap で折り返す)。見出しは持たず、本文をダイアログと入力欄のラベルにする
    //閉じるときは inert を解除し、開く前にフォーカスされていた要素へ戻す (その要素が既に取り除かれていれば動かさない)
    //フォーカストラップ・inert は get_dialog_focusable_elements / create_dialog_keydown_handler / set_inert_except を使う
    //Esc と Tab は捕捉フェーズで受け取って伝播を止め、背後のダイアログ (リスト選択ダイアログ等) が document に登録したハンドラより先に処理する
    function open_message_dialog(mode, message, default_value){
        const is_prompt = mode === "prompt";
        //キャンセル (キャンセルボタン / Esc / 背景クリック) で解決する値。alert は戻り値を使わない
        const cancel_value = is_prompt ? null : false;
        const main_element = document.getElementById("opd_main_element");
        //デッキ本体が無いあいだはダイアログを出せないため、キャンセルと同じ値で解決する
        if(main_element === null) return Promise.resolve(cancel_value);
        return new Promise(function(resolve){
            const previous_focus_element = document.activeElement;
            const body_id = `opd_message_dialog_body_${create_random_id()}`;
            const overlay = document.createElement("div");
            overlay.className = "opd_dialog_overlay opd_message_dialog_overlay";
            const input_html = is_prompt ? `<input class="opd_input opd_message_dialog_input" type="text" aria-labelledby="${body_id}">` : "";
            const cancel_btn_html = mode === "alert" ? "" : `<button type="button" class="opd_btn opd_message_dialog_cancel_btn">${i18n_message("ui_dialog_cancel")}</button>`;
            overlay.innerHTML = `<div class="opd_dialog opd_message_dialog" role="${mode === "alert" ? "alertdialog" : "dialog"}" aria-modal="true" aria-labelledby="${body_id}">
        <p class="opd_message_dialog_body" id="${body_id}"></p>
        ${input_html}
        <div class="opd_dialog_actions">${cancel_btn_html}<button type="button" class="opd_btn opd_btn_primary opd_message_dialog_ok_btn">${i18n_message("ui_dialog_ok")}</button></div>
        </div>`;
            main_element.appendChild(overlay);
            column_auto_update_state.message_dialog.open_count += 1;
            //ダイアログを開いているあいだは背景を操作対象から外す
            const release_inert = set_inert_except(main_element, overlay);

            const dialog = overlay.querySelector(".opd_message_dialog");
            const body = overlay.querySelector(".opd_message_dialog_body");
            const input = overlay.querySelector(".opd_message_dialog_input");
            const ok_btn = overlay.querySelector(".opd_message_dialog_ok_btn");
            const cancel_btn = overlay.querySelector(".opd_message_dialog_cancel_btn");
            //背景クリック判定用。押下と離上の両方が背景で起きたときだけ閉じる
            let is_overlay_mousedown = false;
            let is_overlay_mouseup = false;

            body.textContent = message;
            if(input !== null) input.value = default_value;

            //ダイアログを閉じ、背景の inert を解除してフォーカスを戻し、result で解決する
            function close_dialog(result){
                document.removeEventListener("keydown", on_dialog_keydown, true);
                release_inert();
                overlay.remove();
                column_auto_update_state.message_dialog.open_count -= 1;
                if(previous_focus_element?.isConnected) previous_focus_element.focus?.();
                resolve(result);
            }
            //キャンセルとして閉じる (キャンセルボタン / Esc / 背景クリック)
            function cancel_dialog(){
                close_dialog(cancel_value);
            }
            //OK として閉じる (OK ボタン / 入力欄の Enter)
            function accept_dialog(){
                close_dialog(is_prompt ? input.value : true);
            }
            const handle_dialog_keydown = create_dialog_keydown_handler(dialog, cancel_dialog);
            //Esc と Tab はこのダイアログだけで処理し、背後のダイアログのハンドラへ渡さない。それ以外のキーは入力欄まで届ける
            function on_dialog_keydown(event){
                if(event.key !== "Escape" && event.key !== "Tab") return;
                //IME の変換中の Esc は変換の取り消しであり、ダイアログのキャンセルではない
                if(event.isComposing) return;
                //最前面 (最後に開いた) のメッセージダイアログだけが処理する
                const overlays = main_element.querySelectorAll(":scope > .opd_message_dialog_overlay");
                if(overlays[overlays.length - 1] !== overlay) return;
                event.stopPropagation();
                handle_dialog_keydown(event);
            }

            ok_btn.addEventListener("click", accept_dialog);
            cancel_btn?.addEventListener("click", cancel_dialog);
            //入力欄の Enter は OK と同じ。IME の変換確定は除く
            input?.addEventListener("keydown", function(event){
                if(event.key !== "Enter" || event.isComposing) return;
                event.preventDefault();
                accept_dialog();
            });
            //背景(オーバーレイ自身)の上で押して離してクリックされたときだけ閉じる
            overlay.addEventListener("mousedown", function(event){
                is_overlay_mousedown = event.target === overlay;
            });
            overlay.addEventListener("mouseup", function(event){
                is_overlay_mouseup = event.target === overlay;
            });
            overlay.addEventListener("click", function(event){
                const is_background_click = is_overlay_mousedown && is_overlay_mouseup && event.target === overlay;
                is_overlay_mousedown = false;
                is_overlay_mouseup = false;
                if(is_background_click) cancel_dialog();
            });
            document.addEventListener("keydown", on_dialog_keydown, true);
            //prompt は入力欄 (既定値は選択状態)、それ以外は OK ボタンから始める
            if(input !== null){
                input.focus();
                input.select();
            }else{
                ok_btn.focus();
            }
        });
    }
    //通知ダイアログを開く。OK / Esc / 背景クリックのいずれでも閉じる
    async function show_alert_dialog(message){
        await open_message_dialog("alert", message, "");
    }
    //確認ダイアログを開く。OK なら true、キャンセル / Esc / 背景クリックなら false を返す
    function show_confirm_dialog(message){
        return open_message_dialog("confirm", message, "");
    }
    //入力ダイアログを開く。OK なら入力文字列、キャンセル / Esc / 背景クリックなら null を返す
    function show_prompt_dialog(message, default_value = ""){
        return open_message_dialog("prompt", message, default_value);
    }
    //全体設定ダイアログを開く。opener_element: 閉じたときにフォーカスを戻す要素
    //#opd_main_element の直下にオーバーレイ #opd_global_settings_overlay (class "opd_dialog_overlay opd_global_settings_overlay") を 1 つだけ生成する (既に開いていればそこへフォーカスを移す)
    //ダイアログ本体は role="dialog" aria-modal="true" aria-labelledby で、次のフォームを持つ:
    //  ピン止め checkbox / バナー表示 checkbox / トップ表示 checkbox / 表示モード select / カラム幅 number (rem、COLUMN_WIDTH_MIN_REM 〜 COLUMN_WIDTH_MAX_REM) / 自動更新 checkbox / 自動更新間隔 number (秒、AUTO_RELOAD_TIME_MIN_MS 〜 AUTO_RELOAD_TIME_MAX_MS を秒に直した範囲) / サイドラックの位置 select (left / right)
    //  status 領域 (id 付き、role="status" aria-live="polite"、高さを予約) と 適用 / キャンセル ボタン
    //適用: 検証に失敗したら status 領域へ msg_global_settings_invalid_width / msg_global_settings_invalid_interval を表示し、該当欄へ aria-invalid と status 領域を指す aria-describedby を付けてフォーカスし、閉じない
    //      成功したら該当欄の aria-invalid / aria-describedby を外し、global_settings を更新 → apply_global_settings_to_columns → apply_side_rack_position → 閉じる
    //閉じる: キャンセル / Esc / 背景クリック (オーバーレイ上で mousedown と mouseup が揃ったときのみ)。閉じるときは inert を解除し opener_element にフォーカスを戻す
    //オーバーレイが close_dialog を経由せず外された場合も MutationObserver が後始末を通す
    //フォーカストラップ・inert は get_dialog_focusable_elements / create_dialog_keydown_handler / set_inert_except を使う
    function open_global_settings_dialog(opener_element){
        const main_element = document.getElementById("opd_main_element");
        if(main_element === null) return;
        //既に開いている場合は二重に生成せず、開いているダイアログへフォーカスを移す
        const opened_overlay = document.getElementById("opd_global_settings_overlay");
        if(opened_overlay !== null){
            const opened_dialog = opened_overlay.querySelector(".opd_global_settings_dialog");
            if(opened_dialog !== null) get_dialog_focusable_elements(opened_dialog)[0]?.focus();
            return;
        }

        const overlay = document.createElement("div");
        overlay.id = "opd_global_settings_overlay";
        overlay.className = "opd_dialog_overlay opd_global_settings_overlay";
        overlay.innerHTML = `<div class="opd_dialog opd_global_settings_dialog" role="dialog" aria-modal="true" aria-labelledby="opd_global_settings_title">
        <h2 id="opd_global_settings_title">${i18n_message("ui_global_settings_header")}</h2>
        <p class="opd_global_settings_description">${i18n_message("ui_global_settings_description")}</p>
        <div class="opd_global_settings_row"><label for="opd_global_settings_pinned">${i18n_message("ui_global_settings_pinned_label")}</label><input class="opd_switch opd_global_settings_pinned" id="opd_global_settings_pinned" type="checkbox"></div>
        <div class="opd_global_settings_row"><label for="opd_global_settings_banner">${i18n_message("ui_global_settings_banner_label")}</label><input class="opd_switch opd_global_settings_banner" id="opd_global_settings_banner" type="checkbox"></div>
        <div class="opd_global_settings_row"><label for="opd_global_settings_top_visible">${i18n_message("ui_global_settings_top_label")}</label><input class="opd_switch opd_global_settings_top_visible" id="opd_global_settings_top_visible" type="checkbox"></div>
        <div class="opd_global_settings_row"><label for="opd_global_settings_view_mode">${i18n_message("ui_settings_view_mode_label")}</label><select class="opd_select opd_global_settings_view_mode" id="opd_global_settings_view_mode"><option value="0">${i18n_message("ui_settings_view_mode_all")}</option><option value="1">${i18n_message("ui_settings_view_mode_text_only")}</option><option value="2">${i18n_message("ui_settings_view_mode_media_only")}</option></select></div>
        <div class="opd_global_settings_row"><label for="opd_global_settings_column_width">${i18n_message("ui_global_settings_column_width_rem_label")}</label><input class="opd_input opd_global_settings_column_width opd_column_settings_input_text" id="opd_global_settings_column_width" type="number" min="${COLUMN_WIDTH_MIN_REM}" max="${COLUMN_WIDTH_MAX_REM}"></div>
        <div class="opd_global_settings_row"><label for="opd_global_settings_auto_reload">${i18n_message("ui_settings_auto_reload_label")}</label><input class="opd_switch opd_global_settings_auto_reload" id="opd_global_settings_auto_reload" type="checkbox"></div>
        <div class="opd_global_settings_row"><label for="opd_global_settings_auto_reload_time">${i18n_message("ui_settings_auto_reload_interval_label")}</label><span><input class="opd_input opd_global_settings_auto_reload_time opd_column_settings_input_text" id="opd_global_settings_auto_reload_time" type="number" min="${AUTO_RELOAD_TIME_MIN_MS / 1000}" max="${AUTO_RELOAD_TIME_MAX_MS / 1000}">${i18n_message("ui_settings_seconds_suffix")}</span></div>
        <div class="opd_global_settings_row"><label for="opd_global_settings_side_rack_position">${i18n_message("ui_global_settings_side_rack_position_label")}</label><select class="opd_select opd_global_settings_side_rack_position" id="opd_global_settings_side_rack_position"><option value="left">${i18n_message("ui_side_rack_position_left")}</option><option value="right">${i18n_message("ui_side_rack_position_right")}</option></select></div>
        <div class="opd_global_settings_status" id="opd_global_settings_status" role="status" aria-live="polite"></div>
        <div class="opd_global_settings_actions"><input class="opd_btn opd_btn_primary opd_global_settings_apply_btn" type="button" value="${i18n_message("ui_global_settings_apply_button")}"><input class="opd_btn opd_global_settings_cancel_btn" type="button" value="${i18n_message("ui_global_settings_cancel_button")}"></div>
        </div>`;
        main_element.appendChild(overlay);
        //ダイアログを開いているあいだは背景を操作対象から外す
        const release_inert = set_inert_except(main_element, overlay);
        //オーバーレイが close_dialog を経由せず外された場合でも、閉じるときの後始末を必ず通す
        const overlay_observer = new MutationObserver(function(){
            if(overlay.isConnected) return;
            close_dialog();
        });
        overlay_observer.observe(main_element, {childList: true});

        const dialog = overlay.querySelector(".opd_global_settings_dialog");
        const pinned_checkbox = overlay.querySelector(".opd_global_settings_pinned");
        const banner_checkbox = overlay.querySelector(".opd_global_settings_banner");
        const top_visible_checkbox = overlay.querySelector(".opd_global_settings_top_visible");
        const view_mode_select = overlay.querySelector(".opd_global_settings_view_mode");
        const column_width_input = overlay.querySelector(".opd_global_settings_column_width");
        const auto_reload_checkbox = overlay.querySelector(".opd_global_settings_auto_reload");
        const auto_reload_time_input = overlay.querySelector(".opd_global_settings_auto_reload_time");
        const side_rack_position_select = overlay.querySelector(".opd_global_settings_side_rack_position");
        const status_area = overlay.querySelector(".opd_global_settings_status");
        const apply_btn = overlay.querySelector(".opd_global_settings_apply_btn");
        const cancel_btn = overlay.querySelector(".opd_global_settings_cancel_btn");
        //背景クリック判定用。押下と離上の両方が背景で起きたときだけ閉じる
        let is_overlay_mousedown = false;
        let is_overlay_mouseup = false;

        //現在の全体設定をフォームへ入れる (間隔は秒で表示する)
        pinned_checkbox.checked = global_settings.pinned;
        banner_checkbox.checked = global_settings.banner;
        top_visible_checkbox.checked = global_settings.top_visible;
        view_mode_select.value = global_settings.tw_view_mode;
        column_width_input.value = String(global_settings.column_width);
        auto_reload_checkbox.checked = global_settings.auto_reload;
        auto_reload_time_input.value = String(global_settings.auto_reload_time / 1000);
        side_rack_position_select.value = global_settings.side_rack_position;

        //ダイアログを閉じ、背景の inert を解除してフォーカスを開いた要素へ戻す
        function close_dialog(){
            document.removeEventListener("keydown", on_dialog_keydown);
            overlay_observer.disconnect();
            release_inert();
            overlay.remove();
            opener_element?.focus?.();
        }
        const on_dialog_keydown = create_dialog_keydown_handler(dialog, close_dialog);
        //検証結果を入力欄へ反映する。不正な欄は status 領域のメッセージと結び付け、正常に戻った欄からは印を外す
        function mark_input_validity(input_element, is_invalid){
            if(is_invalid){
                input_element.setAttribute("aria-invalid", "true");
                input_element.setAttribute("aria-describedby", status_area.id);
                return;
            }
            input_element.removeAttribute("aria-invalid");
            input_element.removeAttribute("aria-describedby");
        }
        //入力を検証して全体設定を更新し、全カラムへ反映する
        function apply_global_settings(){
            const column_width_value = Number(column_width_input.value);
            const is_width_invalid = column_width_input.value.trim() === "" || !Number.isFinite(column_width_value) || column_width_value < COLUMN_WIDTH_MIN_REM || column_width_value > COLUMN_WIDTH_MAX_REM;
            const auto_reload_time_seconds = Number(auto_reload_time_input.value);
            const auto_reload_time_ms = auto_reload_time_seconds * 1000;
            const is_interval_invalid = auto_reload_time_input.value.trim() === "" || !Number.isFinite(auto_reload_time_seconds)
                || auto_reload_time_ms < AUTO_RELOAD_TIME_MIN_MS || auto_reload_time_ms > AUTO_RELOAD_TIME_MAX_MS;
            //status 領域は 1 つなので、印を付けるのは status に表示する欄 (先に見つかった不正な欄) だけにする
            mark_input_validity(column_width_input, is_width_invalid);
            mark_input_validity(auto_reload_time_input, !is_width_invalid && is_interval_invalid);
            if(is_width_invalid){
                status_area.textContent = i18n_message("msg_global_settings_invalid_width");
                column_width_input.focus();
                return;
            }
            if(is_interval_invalid){
                status_area.textContent = i18n_message("msg_global_settings_invalid_interval");
                auto_reload_time_input.focus();
                return;
            }
            status_area.textContent = "";
            //ダイアログに無い項目 (side_rack_position 等) は現在の値を引き継ぐ
            global_settings = clone_global_settings({
                ...global_settings,
                banner: banner_checkbox.checked,
                top_visible: top_visible_checkbox.checked,
                tw_view_mode: view_mode_select.value,
                column_width: column_width_value,
                auto_reload: auto_reload_checkbox.checked,
                auto_reload_time: auto_reload_time_ms,
                pinned: pinned_checkbox.checked,
                side_rack_position: side_rack_position_select.value,
            });
            apply_global_settings_to_columns();
            apply_side_rack_position();
            close_dialog();
        }

        apply_btn.addEventListener("click", apply_global_settings);
        cancel_btn.addEventListener("click", close_dialog);
        //背景(オーバーレイ自身)の上で押して離してクリックされたときだけ閉じる
        overlay.addEventListener("mousedown", function(event){
            is_overlay_mousedown = event.target === overlay;
        });
        overlay.addEventListener("mouseup", function(event){
            is_overlay_mouseup = event.target === overlay;
        });
        overlay.addEventListener("click", function(event){
            const is_background_click = is_overlay_mousedown && is_overlay_mouseup && event.target === overlay;
            is_overlay_mousedown = false;
            is_overlay_mouseup = false;
            if(is_background_click) close_dialog();
        });
        document.addEventListener("keydown", on_dialog_keydown);
        get_dialog_focusable_elements(dialog)[0]?.focus();
    }
    //カラム構成保存
    //各カラムの継承可能 7 項目は read_column_setting で属性から読み (inherit は null)、column_pinned_override は opd_setting_pinned 属性のみから決める
    //save_object には global_settings と settings_schema_version (= SETTINGS_SCHEMA_VERSION) も含める。プロファイル保存ボタンで新規追加する save_object も同じ 2 つを含める
    function column_settings_save(mode, profile_num){
        let settings_array = {
            column_settings:[],
            version:manifest.version
        };
        const column_divs = document.querySelectorAll("#opd_main_element div[opd_column_type]");
        for (let index = 0; index < column_divs.length; index++) {
            const column_div = column_divs[index];
            const column_type = column_div.getAttribute("opd_column_type");
            //サイドラックの案内カラムは run() が常に 1 つ作るためプロファイルには保存しない
            if(column_type == "side_empty_column") continue;
            let column_open_path = "";
            let column_pinned_save_path = "";
            let column_page_title = null;
            //exploreの処理
            if(column_type == 'explore'){
                //ポスト単体を表示中は、表示中のポストではなく戻り先を保存してリスト / 検索としての識別を保つ (explore_column_persist_path)
                column_open_path = explore_column_persist_path(column_div);
                //ピン止め
                column_pinned_save_path = column_div.getAttribute("opd_pinned_path");
                //タイトル
                column_page_title = column_div.getAttribute("opd_explore_title");
            }
            settings_array["column_settings"].push({
                type: column_type,
                banner: read_column_setting(column_div, "banner"),
                top_visible: read_column_setting(column_div, "top_visible"),
                tw_view_mode: read_column_setting(column_div, "tw_view_mode"),
                column_save_path: column_open_path,
                column_save_title: column_page_title,
                column_pinned_path: column_pinned_save_path,
                column_pinned_override: read_column_setting(column_div, "pinned"),
                auto_reload: read_column_setting(column_div, "auto_reload"),
                auto_reload_time: read_column_setting(column_div, "auto_reload_time"),
                column_width: read_column_setting(column_div, "column_width"),
            });
        }
        if(mode == "profile_out"){
            settings_array.global_settings = clone_global_settings(global_settings);
            return settings_array;
        }else{
            const save_object = {name:"user_profile", profile:settings_array.column_settings, settings_schema_version:SETTINGS_SCHEMA_VERSION, global_settings:clone_global_settings(global_settings)};
            Object.assign(profile_store[profile_num], save_object);
            chrome.storage.local.set({'opd_profile_store': JSON.stringify(profile_store)}, function () {
            });
        }
    }
    //自動更新許可を取得する関数
    function is_auto_update(stale_check = false){
        //テキスト入力フォーカス中
        if(column_auto_update_state.text_focus.active){
            if (stale_check){
                //一定時間以上継続している場合は更新不良とみなしてリセット
                const FOCUS_STALE_MS = 5 * 60 * 1000;
                if(Date.now() - column_auto_update_state.text_focus.date > FOCUS_STALE_MS){
                    column_auto_update_state.text_focus.date = 0;
                    column_auto_update_state.text_focus.active = false;
                }else{
                    return false;
                }
            }else{
                return false;
            }
        }
        //メディアビューワー表示中
        if(column_auto_update_state.media_viewer.active){
            return false;
        }
        //メッセージダイアログ表示中
        if(column_auto_update_state.message_dialog.open_count > 0){
            return false;
        }
        return true;
    }
    //ランダムID作成
    function create_random_id(){
        return Math.random().toString(32).substring(2);
    }
}

//MutationObserverを仕掛ける
function observe_when_ready(get_target, watch_root, observer_callback, observer_options){
    const target = get_target();
    if(target){
        //既に存在していたらすぐに仕掛ける
        observer_callback(target);
        new MutationObserver(() => observer_callback(target)).observe(target, observer_options);
        return;
    }

    if(!watch_root) return;

    const wait_observer = new MutationObserver(() => {
        const target_retry = get_target();
        if(target_retry){
            wait_observer.disconnect();
            observer_callback(target_retry);
            new MutationObserver(() => observer_callback(target_retry)).observe(target_retry, observer_options);
        }
    });
    wait_observer.observe(watch_root, { childList: true });
}

//カラー・CSS周りを設定する
function head_observer_callback(head_elem){
    //デフォルトのCSSがUIに影響を与えないように削除する
    if(!is_removed_default_style){
        head_elem.querySelectorAll('style').forEach(style => {
            if(style.textContent.includes('*, ::before, ::after')){
                style.remove();
                is_removed_default_style = true;
            }
        });
    }

    //ダークモード検出&設定
    const color_scheme = window.matchMedia('(prefers-color-scheme: dark)');
    const main_element = document.getElementById("opd_main_element");
    if(!main_element) return;

    const color_mode = get_cookie_color_mode();
    switch (color_mode){
        case "system": {
            apply_ui_color = () => {
                const currentScheme = color_scheme.matches ? "dark" : "light";
                main_element.setAttribute("opd-dsp-theme", currentScheme);
            };
            apply_ui_color();
            if(!is_added_system_color_mode){
                color_scheme.addEventListener("change", apply_ui_color);
                is_added_system_color_mode = true;
            }
            break;
        }
        case "light":
            if(is_added_system_color_mode && apply_ui_color){
                color_scheme.removeEventListener("change", apply_ui_color);
                is_added_system_color_mode = false;
            }
            main_element.setAttribute("opd-dsp-theme", "light");
            break;
        case "dark":
            if(is_added_system_color_mode && apply_ui_color){
                color_scheme.removeEventListener("change", apply_ui_color);
                is_added_system_color_mode = false;
            }
            main_element.setAttribute("opd-dsp-theme", "dark");
            break;
        default:
            break;
    }
}

//メインX動作マスク
function main_dsp(react_root){
    if(!react_root) return;
    react_root.style.visibility = "hidden";
    react_root.style.overflow = "hidden";
}

//タイトルやfaviconを設定する
function set_title_favicon(){
    const OPD_TITLE = "Open-Deck";
    const OPD_FAVICON_URL = chrome.runtime.getURL("icon.png");

    //タイトルを設定する
    document.head.querySelectorAll("title").forEach(elem => {
        if(elem.dataset.opd !== "1") elem.remove();
    });
    let opd_title = document.head.querySelector('title[data-opd="1"]');
    if(!opd_title){
        opd_title = document.createElement("title");
        opd_title.dataset.opd = "1";
        opd_title.textContent = OPD_TITLE;
        document.head.appendChild(opd_title);
    }

    //titleを監視
    const title_observer = new MutationObserver(() => {
        //自分の title の中身が変わっていたら戻す
        if(opd_title.textContent !== OPD_TITLE){
            opd_title.textContent = OPD_TITLE;
        }
        document.head.querySelectorAll("title").forEach(elem => {
            if(elem.dataset.opd !== "1") elem.remove();
        });
    });
    title_observer.observe(opd_title, {
        childList: true,
        characterData: true,
        subtree: true
    });
    //headも監視
    const head_title_observer = new MutationObserver(mutations => {
        for(const m of mutations){
            for(const node of m.addedNodes){
                if(node.tagName === "TITLE" && node.dataset.opd !== "1"){
                    node.remove();
                }
            }
        }
    });
    head_title_observer.observe(document.head, { childList: true });

    //faviconを設定する
    document.head.querySelectorAll('link[rel="shortcut icon"], link[rel="icon"]').forEach(l => {
        if(l.dataset.opd !== "1") l.remove();
    });
    let opd_favicon = document.head.querySelector('link[data-opd="1"]');
    if(!opd_favicon){
        opd_favicon = document.createElement("link");
        opd_favicon.rel = "shortcut icon";
        opd_favicon.href = OPD_FAVICON_URL;
        opd_favicon.dataset.opd = "1";
        document.head.appendChild(opd_favicon);
    }

    //favicon監視
    const favicon_observer = new MutationObserver(() => {
        if(opd_favicon.getAttribute("href") !== OPD_FAVICON_URL){
            opd_favicon.setAttribute("href", OPD_FAVICON_URL);
        }
    });
    favicon_observer.observe(opd_favicon, {
        attributes: true,
        attributeFilter: ["href", "rel"]
    });
    //head自体も監視
    const head_favicon_observer = new MutationObserver(mutations => {
        for(const m of mutations){
            for(const node of m.addedNodes){
                if(node.tagName === "LINK"
                    && (node.rel === "shortcut icon" || node.rel === "icon")
                    && node.dataset.opd !== "1"){
                    node.remove();
                }
            }
        }
    });
    head_favicon_observer.observe(document.head, { childList: true });
}

//===== サイドラック (side rack) =====
//サイドラックは画面の左または右に固定して表示するカラム列で、カラム一覧 (メインラック) と重ならずに並ぶ。
//メインラックの幅はサイドラックの描画幅ぶんだけ狭まり、サイドラックの幅は所属カラムの幅の合計で決まる。
//
//DOM 契約:
//  #opd_main_element                拡張の最上位要素。サイドラックの状態を属性と CSS カスタムプロパティで持つ
//    opd_side_rack_position         "left" | "right"。サイドラックを置く側 (global_settings.side_rack_position を反映する)
//    opd_add_target_rack            "main" | "side"。カラム管理ダイアログで追加するカラムの追加先 (run() ごとの一時状態。既定 "main"、プロファイルには保存しない)。サイドバーの追加先切替ボタンとダイアログ内の追加先の選択で切り替える
//    --opd_side_rack_width          サイドラックの現在の描画幅 (px 値。非表示のあいだは 0px)。#main_rack_element の width と left の計算に使う
//  #main_rack_element               メインラックの横スクロールコンテナ。直下の #first_rack_element (flex row、高さは常に 100%) にメインラックのカラムが並ぶ
//  #side_rack_element               サイドラック (position:fixed、flex row、高さ 100vh)。非表示のあいだは hidden 属性を付ける (display:flex の指定に負けないよう CSS で [hidden]{display:none} を明示する)
//  .dsp_column_side_emptycolumn     サイドラックの案内カラム (div[opd_column_type="side_empty_column"])。#side_rack_element の末尾に常に 1 つあり、追加先が "side" のときだけ hidden 属性を外す
//  .dsp_column_emptycolumn          メインラックの案内カラム (div[opd_column_type="empty_column"])。保存形式ではメインラックの終了マーカーを兼ねる
//DOM 順序: #opd_main_element の中身は サイドバー → #main_rack_element (> #first_rack_element) → #side_rack_element の順に並べる。
//column_settings_save は #opd_main_element div[opd_column_type] を DOM 順に走査するため、この順序が「メインラックのカラム → empty_column → サイドラックのカラム」という保存順を保証する。
//
//保存形式: opd_profile_store[n].profile (カラム配列) は type == "empty_column" の要素より前がメインラック、後がサイドラック。
//  side_empty_column 型のカラムは保存しない (案内カラムはプロファイル由来ではなく run() が常に 1 つ生成する)。column_settings_save は opd_column_type="side_empty_column" の div をスキップする。
//  empty_column マーカーはちょうど 1 つに正規化する (normalize_profile_store の構造復旧)。マーカーが無いプロファイルの既存カラムはすべてメインラック扱いになる。
//  保存値に second_empty_column 型の要素がある場合は normalize_profile_store が取り除き、empty_column より後のカラムをサイドラックのカラムとして読み込む。
//  この復旧に SETTINGS_SCHEMA_VERSION の更新は要らない (欠損項目は既定値で補い、構造の復旧はスキーマ版に依らず行うため)。
//  サイドラックを置く側は global_settings.side_rack_position ("left" | "right"、既定 "right") に持つ。カラム側で上書きできる項目ではないため COLUMN_INHERITABLE_SETTINGS には入れない。
//
//run() スコープの関数 (サイドラックの状態はこれらを通して読み書きする):
//  get_rack_elements(rack_id) / get_rack_columns(rack_id)
//    ラック ID ("main" | "side") からラックの要素と末尾の案内カラム、ラック直下の実カラム (section.dsp_column_draggable_true、DOM 順) を返す。
//    カラム設定パネルのホバー中は draggable 属性が一時的に "false" になるため、実カラムの判定には draggable 属性ではなく .dsp_column_draggable_true クラスを使う。
//  apply_column_layout(layout, closing_sections)
//    カラムの追加・並べ替え・ラック間移動・閉じるをまとめて反映する唯一の経路 (カラム管理ダイアログの適用から呼ぶ)。
//    ラックごとの最終的な並びを受け取り、動かさずに済む既存カラム (pick_stationary_sections) には触れず、それ以外の section を案内カラムを基準に insertBefore で最終位置へ入れる。
//    既存カラムを動かす前には prepare_column_for_dom_move で読み込み先を整える (column_dd の drop も同じ関数を使う)。
//  update_side_rack_state()
//    サイドラックの表示状態を現在の状態から決めて反映する。#side_rack_element は「サイドラックに section.dsp_column_draggable_true が 1 つ以上ある」または「追加先が "side"」のときに表示し、それ以外は hidden 属性を付ける。
//    案内カラム (.dsp_column_side_emptycolumn) は追加先が "side" のときだけ表示する。反映の直後に --opd_side_rack_width も同期で 1 回更新する (通常の更新は #side_rack_element を border-box で監視する ResizeObserver が行う)。
//    起動時の初期構築後・カラム追加後・カラムを閉じた後・ドラッグ移動の drop 後・追加先の切替後に呼ぶ。
//  apply_side_rack_position()
//    #opd_main_element の opd_side_rack_position 属性を global_settings.side_rack_position の値にする。run() の初期構築で innerHTML を挿入した直後と、全体設定ダイアログでサイドラックの位置を適用した後に呼ぶ。
//
//column_dd (カラムのドラッグ & ドロップ) はサイドラックに合わせて 2 点を守る:
//  イベントを登録する対象を両ラック直下のカラム (#first_rack_element > .dsp_column, #side_rack_element > .dsp_column) に限り、メインバーの section を drop 先にしない。
//  dragover の挿入位置表示は outline (負の outline-offset で枠内に描く) で描き、border は使わない。border はカラムの幅を変えるため、サイドラックでは ResizeObserver がその増分を拾ってメインラックの幅が揺れる。outline は子要素より後に描かれるため、不透明な iframe に隠れない。

//===== 全体設定 (global settings) =====
//全体設定はプロファイルごと (opd_profile_store[n].global_settings) に持つ既定設定で、
//各カラムの設定値が null (= 全体設定に従う) になっている項目に適用される。
//
//保存形式:
//  opd_profile_store[n] = {
//    name, profile: [column...],
//    settings_schema_version: SETTINGS_SCHEMA_VERSION,
//    global_settings: {banner, top_visible, tw_view_mode, column_width, auto_reload, auto_reload_time, pinned, side_rack_position}
//  }
//  profile (カラム配列) は type == "empty_column" の要素より前がメインラック、後がサイドラック。side_empty_column 型のカラムは保存しない
//  column = {
//    type, column_save_path, column_save_title,
//    banner: boolean|null, top_visible: boolean|null, tw_view_mode: "0"|"1"|"2"|null,
//    column_width: number(rem)|null, auto_reload: boolean|null, auto_reload_time: number(ms)|null,
//    column_pinned_override: boolean|null,   // null = 全体設定の pinned に従う
//    column_pinned_path: string              // 実効ピン止め中のみ非空 (reconcile_column_pinned が保つ不変条件)
//  }
//
//実効値 = カラム値 ?? global_settings 値。
//単位は column_width が rem、auto_reload_time が ms で統一し、UI の入力欄だけ秒 (ms / 1000) で扱う。
//
//DOM 表現: カラム div (div[opd_column_type]) の属性に個別値を保持する。属性が無い項目 (そのカラム種別に適用されない項目) は inherit と同じく null として読む。
//  opd_column_width                "inherit" | rem 数値文字列 (テンプレートでは属性用 %column_width_attr% と style 用 %column_width_num% (実効 rem) を別の値で埋める)
//  opd_setting_banner              "inherit" | "true" | "false"
//  opd_setting_top_visible         "inherit" | "true" | "false"
//  opd_setting_tw_view_mode        "inherit" | "0" | "1" | "2"
//  opd_setting_auto_reload         "inherit" | "true" | "false"
//  opd_setting_auto_reload_time    "inherit" | ms 数値文字列
//  opd_setting_pinned              "inherit" | "true" | "false"
//設定値とは別に、iframe が表示しているページから導く表示状態も同じカラム div の属性で持つ。
//  opd_column_kind                 "list" | "explore" (explore カラムのみ。見出しの丸アイコンの絵柄を選ぶ)
//  opd_column_detail               "post" (ポスト単体を表示中のあいだだけ付く。副見出しの表示と元の見出しの減衰に使う)
//  opd_column_return_path          副見出しの ✕ で開き直すパス (ポスト以外で最後に表示したページ。初期値はカラム種別の基準パス)
//カラムバーは見出し (カラム種別の丸アイコン・文脈ラベル・タイトル) と更新・設定・閉じるボタンを持ち、個別値の変更はカラム設定パネルから行う。
//更新ボタン (.dsp_column_reload_btn_wrap) は home カラムで実効 auto_reload が false のときだけ表示し (hidden 属性で出し分ける)、タイムラインを更新して先頭へスクロールする。
//カラム設定パネルの select は inherit 選択肢を持ち、その表示文字列に現在の全体値を併記する。
//
//項目 × カラム種別の適用表 (○ = 適用対象。構造用カラム main_bar_empty_column / empty_column / side_empty_column / dsp_column は対象外):
//  項目            home  notification  explore(リスト含む)
//  バナー表示       ○     ○             ○
//  トップ表示       ○     ○             ○ (リスト系ページ表示中の非表示はヘッダーをリスト名だけの専用バーに整形する)
//  表示モード       ○     ○             ○
//  カラム幅         ○     ○             ○
//  自動更新/間隔    ○     -             ○
//  ピン止め         -     -             ○
//
//適用経路は 3 つに分ける:
//  bind_column_events(column_div)        パネル・カラムバーのイベント登録 (data-opd_settings_initialized で二重登録を防ぐ)
//  apply_column_dom_state(column_div)    iframe の load を待たず同期で反映する項目 (幅・パネル表示・ピン止め reconcile・自動更新 interval・更新ボタンの表示)
//  apply_column_iframe_styles(column_div) iframe 内 head へ style を注入する項目 (バナー・トップ表示・表示モード)。iframe の load ごとに実行し、head 未生成時は何もしない
//起動時 (run() の初期化でプロファイルからカラムを組み立てたとき) とカラム追加時は、挿入直後に bind_column_events と apply_column_dom_state を同期で呼ぶ (追加時はその後 column_settings_save する)。
//全体設定の変更時は、その項目が inherit の全カラムに対して apply_column_dom_state と apply_column_iframe_styles を呼び直す。
const SETTINGS_SCHEMA_VERSION = 2;
const GLOBAL_SETTINGS_DEFAULT = Object.freeze({
    banner: false,
    top_visible: true,
    tw_view_mode: "0",
    column_width: 30,
    auto_reload: false,
    auto_reload_time: 10000,
    pinned: false,
    side_rack_position: "right",
});
//カラム幅の下限・上限 (rem) と自動更新間隔の下限・上限 (ms、上限は 24 時間)
const COLUMN_WIDTH_MIN_REM = 12;
const COLUMN_WIDTH_MAX_REM = 300;
const AUTO_RELOAD_TIME_MIN_MS = 1000;
const AUTO_RELOAD_TIME_MAX_MS = 86400000;
//カラム側で全体設定に従える項目名と、その個別値を保持するカラム div の属性名
const COLUMN_INHERITABLE_SETTINGS = Object.freeze({
    banner: "opd_setting_banner",
    top_visible: "opd_setting_top_visible",
    tw_view_mode: "opd_setting_tw_view_mode",
    column_width: "opd_column_width",
    auto_reload: "opd_setting_auto_reload",
    auto_reload_time: "opd_setting_auto_reload_time",
    pinned: "opd_setting_pinned",
});
//iframe 内へ注入する CSS の正本 (初回 load・再 load・設定変更のどの経路でも同じ文字列を使う)
//トップ非表示ではリスト系ページの見出し (リスト名) も他のページと同じく隠す。リスト名はカラム見出しに出す
const COLUMN_IFRAME_CSS = Object.freeze({
    banner_hidden: `header[role="banner"]{display:none}`,
    top_hidden: `div[data-testid="primaryColumn"]>[tabindex="0"][aria-label]>div:nth-child(1){visibility: hidden; height: 0;top: calc(100vh - 60px);position: sticky;backdrop-filter: blur(0px) !important;}[data-testid="app-bar-back"]{visibility: visible; filter: none;}div[data-testid="cellInnerDiv"]:has(button[aria-describedby], div[data-testid="UserAvatar-Container-unknown"]):not(:has(article[tabindex="-1"])){display:none;}`,
    top_hidden_home: `div[data-testid="primaryColumn"]>[tabindex="0"][aria-label]>div:nth-child(1){visibility: hidden; height: 0;top: calc(100vh - 60px);position: sticky;backdrop-filter: blur(0px) !important;}[data-testid="app-bar-back"]{visibility: visible; filter: none;} div[role="progressbar"] + div{display:none;}div[data-testid="cellInnerDiv"]:has(button[aria-describedby], div[data-testid="UserAvatar-Container-unknown"]):not(:has(article[tabindex="-1"])){display:none;}`,
    tw_view_text_only: `div[data-testid="cellInnerDiv"]:has(div[aria-labelledby]){visibility: hidden; height: 0;}`,
    tw_view_media_only: `div[data-testid="cellInnerDiv"]:not(:has(div[aria-labelledby])){visibility: hidden; height: 0;}`,
});
//保存値・属性値の型と範囲を強制する変換。期待した型・範囲でなければ null を返す
function to_boolean_or_null(value){
    return typeof value === "boolean" ? value : null;
}
function to_view_mode_or_null(value){
    return (value === "0" || value === "1" || value === "2") ? value : null;
}
function to_side_rack_position_or_null(value){
    return (value === "left" || value === "right") ? value : null;
}
function to_number_or_null(value){
    return (typeof value === "number" && Number.isFinite(value)) ? value : null;
}
//数値かつ min_value 以上 max_value 以下でなければ null に落とす
function to_number_in_range_or_null(value, min_value, max_value){
    const number_value = to_number_or_null(value);
    if(number_value === null) return null;
    return (number_value < min_value || number_value > max_value) ? null : number_value;
}
//カラム側の項目 key の値を保存形式へ正規化する。型不正・範囲外・未知の key は null (全体設定に従う) にする
//プロファイルの保存値もカラム div の属性値も、利用する前にこれを通して型と範囲を確定させる
function normalize_column_setting_value(key, value){
    switch (key) {
        case "banner":
        case "top_visible":
        case "auto_reload":
        case "pinned":
            return to_boolean_or_null(value);
        case "tw_view_mode":
            return to_view_mode_or_null(value);
        case "column_width":
            return to_number_in_range_or_null(value, COLUMN_WIDTH_MIN_REM, COLUMN_WIDTH_MAX_REM);
        case "auto_reload_time":
            return to_number_in_range_or_null(value, AUTO_RELOAD_TIME_MIN_MS, AUTO_RELOAD_TIME_MAX_MS);
        default:
            return null;
    }
}
//全体設定を正規化した新しいオブジェクトを返す。GLOBAL_SETTINGS_DEFAULT の各キーについて、欠損・型不正・範囲外を既定値で埋める
function normalize_global_settings(global_settings){
    const normalized = {};
    for (const key of Object.keys(GLOBAL_SETTINGS_DEFAULT)) {
        normalized[key] = global_settings?.[key];
    }
    if(to_boolean_or_null(normalized.banner) === null) normalized.banner = GLOBAL_SETTINGS_DEFAULT.banner;
    if(to_boolean_or_null(normalized.top_visible) === null) normalized.top_visible = GLOBAL_SETTINGS_DEFAULT.top_visible;
    if(to_view_mode_or_null(normalized.tw_view_mode) === null) normalized.tw_view_mode = GLOBAL_SETTINGS_DEFAULT.tw_view_mode;
    if(to_number_in_range_or_null(normalized.column_width, COLUMN_WIDTH_MIN_REM, COLUMN_WIDTH_MAX_REM) === null) normalized.column_width = GLOBAL_SETTINGS_DEFAULT.column_width;
    if(to_boolean_or_null(normalized.auto_reload) === null) normalized.auto_reload = GLOBAL_SETTINGS_DEFAULT.auto_reload;
    if(to_number_in_range_or_null(normalized.auto_reload_time, AUTO_RELOAD_TIME_MIN_MS, AUTO_RELOAD_TIME_MAX_MS) === null) normalized.auto_reload_time = GLOBAL_SETTINGS_DEFAULT.auto_reload_time;
    if(to_boolean_or_null(normalized.pinned) === null) normalized.pinned = GLOBAL_SETTINGS_DEFAULT.pinned;
    if(to_side_rack_position_or_null(normalized.side_rack_position) === null) normalized.side_rack_position = GLOBAL_SETTINGS_DEFAULT.side_rack_position;
    return normalized;
}
//既定プロファイルのカラム配列を新しく作って返す (呼び出しごとに別の配列・別のカラムオブジェクトになる)
//継承可能 7 項目と column_pinned_override は null (全体設定に従う)。ただし home カラムの banner だけは true の明示値にする (既定プロファイルの Home はバナー表示)
function create_default_profile_columns(){
    //カラム 1 件分の保存形式。overrides で既定から変える項目だけを指定する
    function default_column(type, overrides){
        return Object.assign({
            type: type,
            banner: null,
            top_visible: null,
            tw_view_mode: null,
            column_save_path: "",
            column_save_title: "",
            column_pinned_path: "",
            column_pinned_override: null,
            auto_reload: null,
            auto_reload_time: null,
            column_width: null,
        }, overrides);
    }
    return [
        default_column("main_bar_empty_column", {}),
        default_column("home", {banner: true}),
        default_column("notification", {}),
        default_column("explore", {exp_type: "", column_save_path: "/explore"}),
        default_column("empty_column", {}),
    ];
}
//既定プロファイルを新しく作って返す (初期設定の構築と、壊れたプロファイルの置き換えに使う)
function create_default_profile(){
    return {name:"default", profile: create_default_profile_columns(), settings_schema_version: SETTINGS_SCHEMA_VERSION, global_settings: clone_global_settings()};
}
//プロファイル保存形式を現在のスキーマへ正規化する。変更があれば true を返す (呼び出し側が保存する)
//構造の復旧 (スキーマ版に依らず全プロファイルへ適用する。run() が profile.length や column.type を読める形を保証する):
//  store が空配列: 既定プロファイルを 1 件置く
//  プロファイル要素がオブジェクトでない (null・配列・プリミティブ): create_default_profile() で置き換える
//  profile が配列でない: create_default_profile_columns() で置き換える
//  profile 内の要素がオブジェクトでない / type が文字列でない: その要素を取り除く
//  profile 内の type が "second_empty_column" の要素: プロファイルに保存しない構造用カラムなので取り除く
//  profile 内の empty_column マーカー (メインラックの終了マーカー): 最初の 1 つを残して 2 つ目以降を取り除き、1 つも無ければ配列末尾に補う
//値の正規化:
//  settings_schema_version が無い / SETTINGS_SCHEMA_VERSION 未満: 既定の global_settings を与え、各カラムの継承可能 7 項目を null、column_pinned_path を "" にリセットし、version を更新する
//  現在のスキーマ: global_settings は normalize_global_settings で欠損・型不正・範囲外を既定値へ戻す。
//               カラム側は normalize_column_setting_value で型不正・範囲外を null にする。
//               column_pinned_override が false なのに column_pinned_path が非空の場合はパスを "" に戻す
//起動時 (init 内、run の前) に全プロファイルへ適用し、プロファイルローダーが保存した任意の JSON もここで吸収する
//store 自体が配列でなければ何もせず false を返す (呼び出し側が既定プロファイル 1 件の配列へ差し替える)。
//正規化を経なかった値は、利用点の clone_global_settings (全体設定) と column_setting_attr_value (カラム属性) が改めて型と範囲を強制する
function normalize_profile_store(store){
    if(!Array.isArray(store)) return false;
    let is_changed = false;
    //プロファイルが 1 件も無いと run() が読むカラムが無くなるため、既定プロファイルを 1 件置く
    if(store.length === 0){
        store.push(create_default_profile());
        return true;
    }
    for (let index = 0; index < store.length; index++) {
        //オブジェクトでないプロファイル (null・配列・プリミティブ) は既定プロファイルへ置き換える
        if(store[index] === null || typeof store[index] !== "object" || Array.isArray(store[index])){
            store[index] = create_default_profile();
            is_changed = true;
            continue;
        }
        const profile = store[index];
        //カラム配列が配列でなければ既定のカラム構成に戻し、オブジェクトでない要素・type が文字列でない要素・保存しない second_empty_column は取り除く
        if(!Array.isArray(profile.profile)){
            profile.profile = create_default_profile_columns();
            is_changed = true;
        }else{
            const valid_columns = profile.profile.filter((column) => column !== null && typeof column === "object" && !Array.isArray(column) && typeof column.type === "string" && column.type !== "second_empty_column");
            if(valid_columns.length !== profile.profile.length){
                profile.profile = valid_columns;
                is_changed = true;
            }
            //メインラックの終了マーカー (empty_column) をちょうど 1 つにする。2 つ目以降は取り除き、1 つも無ければ配列末尾に補う
            const marker_count = profile.profile.filter((column) => column.type === "empty_column").length;
            if(marker_count > 1){
                let is_marker_kept = false;
                profile.profile = profile.profile.filter((column) => {
                    if(column.type !== "empty_column") return true;
                    if(is_marker_kept) return false;
                    is_marker_kept = true;
                    return true;
                });
                is_changed = true;
            }else if(marker_count === 0){
                profile.profile.push({
                    type: "empty_column",
                    banner: null,
                    top_visible: null,
                    tw_view_mode: null,
                    column_save_path: "",
                    column_save_title: "",
                    column_pinned_path: "",
                    column_pinned_override: null,
                    auto_reload: null,
                    auto_reload_time: null,
                    column_width: null,
                });
                is_changed = true;
            }
        }
        const columns = profile.profile;
        const schema_version = Number(profile.settings_schema_version);
        //旧形式のプロファイルは既定の全体設定を与え、各カラムを「全体設定に従う」へリセットする
        if(!Number.isFinite(schema_version) || schema_version < SETTINGS_SCHEMA_VERSION){
            profile.settings_schema_version = SETTINGS_SCHEMA_VERSION;
            profile.global_settings = clone_global_settings();
            for (let column_index = 0; column_index < columns.length; column_index++) {
                const column = columns[column_index];
                column.banner = null;
                column.top_visible = null;
                column.tw_view_mode = null;
                column.column_width = null;
                column.auto_reload = null;
                column.auto_reload_time = null;
                column.column_pinned_override = null;
                column.column_pinned_path = "";
            }
            is_changed = true;
            continue;
        }
        //現在のスキーマは欠損・型不正・範囲外だけを補正する
        const normalized_global = normalize_global_settings(profile.global_settings);
        const is_global_broken = profile.global_settings === null || typeof profile.global_settings !== "object"
            || Object.keys(GLOBAL_SETTINGS_DEFAULT).some((key) => profile.global_settings[key] !== normalized_global[key]);
        if(is_global_broken){
            profile.global_settings = normalized_global;
            is_changed = true;
        }
        for (let column_index = 0; column_index < columns.length; column_index++) {
            const column = columns[column_index];
            //保存キー名と、その値の型・範囲を決める設定項目名の対応 (ピン止めだけ保存キーが異なる)
            const column_save_keys = {
                banner: "banner",
                top_visible: "top_visible",
                tw_view_mode: "tw_view_mode",
                column_width: "column_width",
                auto_reload: "auto_reload",
                auto_reload_time: "auto_reload_time",
                column_pinned_override: "pinned",
            };
            for (const save_key of Object.keys(column_save_keys)) {
                const normalized_value = normalize_column_setting_value(column_save_keys[save_key], column[save_key]);
                if(column[save_key] === normalized_value) continue;
                column[save_key] = normalized_value;
                is_changed = true;
            }
            if(typeof column.column_pinned_path !== "string"){
                column.column_pinned_path = "";
                is_changed = true;
            }
            //ピン止めを明示的に外しているカラムはピン止めパスを残さない
            if(column.column_pinned_override === false && column.column_pinned_path !== ""){
                column.column_pinned_path = "";
                is_changed = true;
            }
        }
    }
    return is_changed;
}
//全体設定の複製を返す (run() への取り込み・新規プロファイル保存時・ダイアログの適用時に使う)
//normalize_global_settings と同じ正規化を行い、欠損・型不正・範囲外を既定値で埋めた新しいオブジェクトを返すため、
//正規化を経ていない保存値を渡しても、以降は GLOBAL_SETTINGS_DEFAULT と同じ型・範囲の値だけが出回る
function clone_global_settings(global_settings){
    return normalize_global_settings(global_settings);
}
//カラム div の属性から項目 key の個別値を読む。属性が無い・空・"inherit" なら null
//それ以外は属性の文字列を保存形式の型へ直し (真偽値は "true"/"false"、数値は Number()、表示モードは文字列のまま)、
//normalize_column_setting_value に通して型不正・範囲外を null にする (null = 全体設定に従う)
function read_column_setting(column_div, key){
    const attribute_name = COLUMN_INHERITABLE_SETTINGS[key];
    if(attribute_name === undefined) return null;
    const raw_value = column_div?.getAttribute(attribute_name) ?? null;
    if(raw_value === null || raw_value === "" || raw_value === "inherit") return null;
    if(key === "column_width" || key === "auto_reload_time"){
        return normalize_column_setting_value(key, Number(raw_value));
    }
    if(key === "tw_view_mode"){
        return normalize_column_setting_value(key, raw_value);
    }
    return normalize_column_setting_value(key, raw_value === "true" ? true : (raw_value === "false" ? false : null));
}
//項目 key の実効値 (カラムの個別値 ?? 全体設定) を返す
function effective_column_setting(column_div, key, global_settings){
    return read_column_setting(column_div, key) ?? global_settings[key];
}
//モーダルダイアログ共通処理 (カラム管理ダイアログ・全体設定ダイアログ・確認 / 入力ダイアログで共有する)
//ダイアログ内で Tab が止まる要素 (非表示・disabled のもの、および選択中のラジオがあるグループの未選択ラジオを除く) を文書順で返す
function get_dialog_focusable_elements(dialog_element){
    const focus_candidates = dialog_element.querySelectorAll('input, select, textarea, button, iframe, [tabindex]:not([tabindex="-1"])');
    const candidates = Array.from(focus_candidates).filter((element) => !element.disabled && element.offsetParent !== null);
    //同じ name のラジオグループに選択中のものがあれば、Tab はそれにしか止まらない (未選択のラジオは飛ばされる) ため、循環の境界も同じ要素で数える
    return candidates.filter((element) => {
        if(element.type !== "radio" || element.checked || element.name === "") return true;
        return !candidates.some((other) => other !== element && other.type === "radio" && other.name === element.name && other.checked);
    });
}
//Esc で close_dialog を呼び、Tab をダイアログ内で循環させる keydown ハンドラを返す (document に登録し、閉じるときに外す)
function create_dialog_keydown_handler(dialog_element, close_dialog){
    return function(event){
        if(event.key === "Escape"){
            event.preventDefault();
            close_dialog();
            return;
        }
        if(event.key !== "Tab") return;
        const focusable_elements = get_dialog_focusable_elements(dialog_element);
        if(focusable_elements.length === 0) return;
        const active_index = focusable_elements.indexOf(document.activeElement);
        if(event.shiftKey){
            if(active_index > 0) return;
            event.preventDefault();
            focusable_elements[focusable_elements.length - 1].focus();
            return;
        }
        if(active_index !== -1 && active_index < focusable_elements.length - 1) return;
        event.preventDefault();
        focusable_elements[0].focus();
    };
}
//container の子要素のうち overlay 以外へ inert を付ける。元から inert のものは対象にせず、解除用の関数を返す
function set_inert_except(container, overlay){
    const inert_applied_elements = [];
    Array.from(container.children).forEach((child) => {
        if(child === overlay || child.hasAttribute("inert")) return;
        child.setAttribute("inert", "");
        inert_applied_elements.push(child);
    });
    return function(){
        inert_applied_elements.forEach((element) => element.removeAttribute("inert"));
    };
}

//カラムテンプレートの %name% プレースホルダーを values の同名キーで一括置換する
//1 パスで置換し、埋めた値を再走査しないため、値に %...% が含まれていても再展開されない
//値はテキストと属性値の両方で安全になるよう HTML エスケープして埋める (ページタイトルやパスは X 側に由来する外部入力のため、そのまま markup にしない)
function fill_column_template(template_html, values){
    return template_html.replace(/%([a-z_]+)%/g, (token, name) => Object.hasOwn(values, name) ? escape_html_text(values[name]) : token);
}
//HTML のテキスト・属性値に埋めても markup として解釈されないよう、& < > " ' を文字参照に置き換える
function escape_html_text(value){
    return String(value).replace(/[&<>"']/g, (character) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[character]));
}
//パスがリスト系ページ (/i/lists/<id> 配下、または /<screen_name>/lists 配下) を指すか
function is_list_page_path(path){
    return /^\/(?:i\/lists|[^\/?#]+\/lists)(?:[\/?#]|$)/.test(path ?? "");
}
//パスが、表示中のページに重ねて開くオーバーレイ (投稿・返信のコンポーザー /compose/ 配下、ログイン等のフロー /i/flow/ 配下) を指すか
//閉じると元のページに戻るため、カラムが表示しているページや戻り先としては扱わない
function is_overlay_page_path(path){
    return /^\/(?:compose|i\/flow)(?:[\/?#]|$)/.test(path ?? "");
}
//パスがポスト単体のページ (/<screen_name>/status/<id> 配下、または投稿者を含まない /i/web/status/<id> 配下) を指すか
//指すなら投稿者の screen_name (無い形式では空文字) を、それ以外は null を返す。予約名 i は screen_name として扱わない
function match_post_page_path(path){
    const post_match = (path ?? "").match(/^\/(?:i\/web|([A-Za-z0-9_]{1,15}))\/status\/\d+/);
    if(post_match === null) return null;
    if(post_match[1] === undefined) return "";
    return is_valid_screen_name(post_match[1]) ? post_match[1] : null;
}
//X のページタイトルから、先頭の未読数 ("(3) " と上限付きの "(20+) ") と末尾の " / X" を落として、カラム見出しに出す形にする
//X が読み込み中に出す仮タイトル (末尾の " / X" を持たない "X" だけのタイトル) は空文字にし、読み込み中の印は空文字だけにする ("@所有者/X / X" のように名前が "X" のリストと区別する)
//page_path がリスト系ページなら、X がタイトルに付ける先頭の所有者 "@screen_name/" も落としてリスト名だけにする
//未読数は文字列だけでは見分けられないため、"(1) " のような括弧付き数字で始まるページ名もその部分が落ちる
function normalize_column_page_title(document_title, page_path = null){
    let page_title = (document_title ?? "").replace(/^\(\d+\+?\)\s*/, "");
    if(page_title === "X") return "";
    const x_title_suffix = " / X";
    if(page_title.endsWith(x_title_suffix)) page_title = page_title.slice(0, -x_title_suffix.length);
    if(is_list_page_path(page_path)) page_title = page_title.replace(/^@[A-Za-z0-9_]{1,15}\//, "");
    return page_title;
}
//カラムの戻り先パス (副見出しの ✕ で開き直すページ) の初期値
//explore カラムは初期表示するパスをそのまま使い、それがポスト単体のページなら検索のトップを指す
function initial_column_return_path(column_type, column_path){
    if(column_type === "notification") return "/notifications";
    if(column_type !== "explore") return "/home";
    const explore_path = column_path ?? "";
    return (explore_path === "" || match_post_page_path(explore_path) !== null) ? "/explore" : explore_path;
}
//カラム見出しに出す文脈ラベル (上段) とタイトル (下段) を決める
//  home / notification: ラベル = "@" + ログイン中の screen_name (取得できないあいだは空文字)、タイトル = カラム種別の名称
//  explore: ラベル = リスト系ページなら「リスト」、それ以外は「検索」、タイトル = X のページタイトル (空 (読み込み中の仮タイトルを含む) ならラベルと同じ語)
//column_path: explore カラムが表示しているパス、column_page_title: そのページのタイトル、login_screen_name: ログイン中の screen_name (不明なら null)
//見出しを持たないカラム種別 (構造用カラム) には null を返す
function build_column_heading(column_type, column_path, column_page_title, login_screen_name = null){
    if(column_type === "explore"){
        const explore_label = i18n_message(is_list_page_path(column_path) ? "ui_column_list_title" : "ui_column_explore_title");
        const page_title = column_page_title ?? "";
        return {label: explore_label, name: page_title === "" ? explore_label : page_title};
    }
    if(column_type !== "home" && column_type !== "notification") return null;
    return {
        label: login_screen_name === null ? "" : `@${login_screen_name}`,
        name: i18n_message(column_type === "home" ? "ui_column_timeline_title" : "ui_column_notifications_title"),
    };
}
//Xのscreen_nameとして妥当か(文字種・長さを満たし、Xのルーティング予約名 i でないこと。大文字小文字は区別しない)
function is_valid_screen_name(name){
    return /^[A-Za-z0-9_]{1,15}$/.test(name ?? "") && name.toLowerCase() !== "i";
}
//ログイン中ユーザーのscreen_nameをXのナビゲーションにあるプロフィールリンクから取得する(取得できない場合はnull)
function get_login_screen_name(){
    const profile_link_selector = 'a[data-testid="AppTabBar_Profile_Link"]';
    const documents = [document];
    document.querySelectorAll("#main_rack_element iframe, #side_rack_element iframe").forEach((frame) => {
        try{
            if(frame.contentDocument) documents.push(frame.contentDocument);
        }catch(e){
            //クロスオリジン等でアクセスできないフレームは無視する
        }
    });
    for (let index = 0; index < documents.length; index++) {
        const href = documents[index].querySelector(profile_link_selector)?.getAttribute("href");
        const screen_name = href?.split("/").filter((segment) => segment !== "")[0];
        if(is_valid_screen_name(screen_name)) return screen_name;
    }
    return null;
}
//「/lists」や「/i/lists/<id>」の直後の残り文字列からサブパス(タブや旧形式のスラッグ)を取り出す
//URL の属性埋め込みに安全な文字種(パーセントエンコード含む)のみ許可し、想定外の文字を含む場合は空文字(リストのトップ)にフォールバックする
function extract_list_sub_path(rest){
    const match = rest.match(/^((?:\/[A-Za-z0-9_\-.%~]+)*)\/?(?:[?#]|$)/);
    return match ? match[1] : "";
}
//リストの基点パスにサブパスを連結し、URL パーサーの正規化(.. などの解決)後も基点配下に留まるパスを返す。外れる場合は基点パスにフォールバックする
function build_list_path(base_path, sub_path){
    const normalized_path = new URL(`${base_path}${sub_path}`, "https://x.com").pathname;
    if(normalized_path === base_path || normalized_path.startsWith(`${base_path}/`)) return normalized_path;
    return base_path;
}
//ユーザー入力(ユーザー名・リストURL・リストID)からリストカラムの初期パスを決める(解決できない場合はnull)
function resolve_list_column_path(input){
    const value = (input ?? "").trim();
    if(value === "") return null;
    //リストID(数字のみ)
    if(/^\d+$/.test(value)) return `/i/lists/${value}`;
    //リストURLまたはパス(/i/lists/<id>)。予約名 i は大文字小文字を区別しない
    const list_id_match = value.match(/(?:^|\/)i\/lists\/(\d+)/i);
    if(list_id_match){
        const sub_path = extract_list_sub_path(value.slice(list_id_match.index + list_id_match[0].length));
        return build_list_path(`/i/lists/${list_id_match[1]}`, sub_path);
    }
    //ユーザーのリスト一覧URLまたはパス(/<screen_name>/lists)。旧形式のリストURLはサブパスを保持してXのリダイレクトに委ねる
    const user_lists_match = value.match(/(?:^|\/)@?([A-Za-z0-9_]{1,15})\/lists(?=[\/?#]|$)/i);
    if(user_lists_match && is_valid_screen_name(user_lists_match[1])){
        const sub_path = extract_list_sub_path(value.slice(user_lists_match.index + user_lists_match[0].length));
        return build_list_path(`/${user_lists_match[1]}/lists`, sub_path);
    }
    //ユーザー名(@は省略可)
    const screen_name_match = value.match(/^@?([A-Za-z0-9_]{1,15})$/);
    if(screen_name_match && is_valid_screen_name(screen_name_match[1])) return `/${screen_name_match[1]}/lists`;
    return null;
}
//リスト一覧ページの anchor の href からリスト ID を取り出す
//href: anchor の href 文字列(相対・絶対どちらでもよい)、base_url: 相対 href を解決する基準 URL
//解決した URL のホストが x.com / twitter.com (またはそのサブドメイン) で、かつパスが /i/lists/<id> (以降にサブパスが続いてもよい) の場合に
//その <id> を文字列で返す。ホストが異なる場合・パスが一致しない場合・URL として解決できない場合は null を返す
function extract_list_id_from_href(href, base_url){
    let list_url = null;
    try{
        list_url = new URL(href, base_url);
    }catch(e){
        //URL として解決できない href はリストの候補にしない
        return null;
    }
    const hostname = list_url.hostname.toLowerCase();
    const is_x_host = ["x.com", "twitter.com"].some((host) => hostname === host || hostname.endsWith(`.${host}`));
    if(!is_x_host) return null;
    const list_id_match = list_url.pathname.match(/^\/i\/lists\/(\d+)(?:\/|$)/);
    return list_id_match ? list_id_match[1] : null;
}
//listCell に付いた属性値がリスト ID として使えるかを判定する
//value: 判定する値
//戻り値: 文字列で /^[1-9]\d{0,19}$/ に一致すれば true
function is_valid_list_id(value){
    return typeof value === "string" && /^[1-9]\d{0,19}$/.test(value);
}
//要素の配下にある span のうち、最初に現れる非空のテキストを返す
//element: 走査する要素
//戻り値: trim 済みのテキスト。非空の span が無い場合は空文字
function first_non_empty_span_text(element){
    const span_elements = element.querySelectorAll("span");
    for (let index = 0; index < span_elements.length; index++) {
        const span_text = span_elements[index].textContent.trim();
        if(span_text !== "") return span_text;
    }
    return "";
}
//listCell からリスト ID とリスト名を取り出す
//cell: [data-testid="listCell"] の要素、base_url: href を絶対 URL に解決するための基準 URL
//戻り値: {id: リストID, name: リスト名(取得できない場合は空文字)}。ID を決められない場合は null
//ID は配下に /i/lists/<id> へ解決できる a[href] があればその ID を優先し、配下に無ければセル自身またはセルを包む祖先の a[href] も見る
//どちらのリンクからも取れなければ有効な data-opd-list-id を使う
//名前は、data-opd-list-id が採用した ID と同じものを指し data-opd-list-name が trim 後非空ならその属性名を使う
//そうでない場合、ID が配下リンク由来ならそのリンク配下の最初の非空 span テキスト、無ければリンク自体のテキスト、無ければセル内の最初の非空 span テキストの順に使う
//ID が祖先リンク由来の場合はリンクがセルの外側の文言も含むためセル内の最初の非空 span テキストを使い、ID が属性由来の場合も同じくセル内の最初の非空 span テキストを使う
function resolve_list_cell_info(cell, base_url){
    let descendant_link = null;
    let descendant_list_id = null;
    const cell_links = cell.querySelectorAll("a[href]");
    for (let index = 0; index < cell_links.length; index++) {
        const found_list_id = extract_list_id_from_href(cell_links[index].getAttribute("href"), base_url);
        if(found_list_id !== null){
            descendant_link = cell_links[index];
            descendant_list_id = found_list_id;
            break;
        }
    }
    let ancestor_list_id = null;
    if(descendant_list_id === null){
        //セル全体がリンクで包まれている描画もあるため、配下に無ければセル自身から祖先方向の最も近いリンクを見る
        const ancestor_link = cell.closest("a[href]");
        ancestor_list_id = ancestor_link === null ? null : extract_list_id_from_href(ancestor_link.getAttribute("href"), base_url);
    }
    const attribute_list_id = cell.getAttribute("data-opd-list-id");
    const attribute_list_name = (cell.getAttribute("data-opd-list-name") ?? "").trim();
    if(descendant_list_id !== null){
        //属性が同じリストを指しているときだけ、ヘルパーが取り出したリスト名をリンクの表示名より優先する
        if(attribute_list_id === descendant_list_id && attribute_list_name !== "") return {id: descendant_list_id, name: attribute_list_name};
        const link_span_name = first_non_empty_span_text(descendant_link);
        if(link_span_name !== "") return {id: descendant_list_id, name: link_span_name};
        const link_text_name = descendant_link.textContent.trim();
        return {id: descendant_list_id, name: link_text_name !== "" ? link_text_name : first_non_empty_span_text(cell)};
    }
    if(ancestor_list_id !== null){
        //祖先リンクはセルの外側の文言も含むため、名前はセル側から取る
        if(attribute_list_id === ancestor_list_id && attribute_list_name !== "") return {id: ancestor_list_id, name: attribute_list_name};
        return {id: ancestor_list_id, name: first_non_empty_span_text(cell)};
    }
    if(!is_valid_list_id(attribute_list_id)) return null;
    return {id: attribute_list_id, name: attribute_list_name !== "" ? attribute_list_name : first_non_empty_span_text(cell)};
}
//手動入力欄の文字列を1行1件として解釈し、リストカラムのパスに変換する
//text: textarea の文字列
//戻り値: {paths: 解決できたパスの配列(重複除去済み。入力順を保つ), invalid: 解決できなかった入力行の配列}
//空行は無視し、各行は resolve_list_column_path で解決する
function parse_manual_list_entries(text){
    const paths = [];
    const invalid = [];
    const lines = (text ?? "").split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index].trim();
        if(line === "") continue;
        const list_path = resolve_list_column_path(line);
        if(list_path === null){
            invalid.push(line);
            continue;
        }
        if(!paths.includes(list_path)) paths.push(list_path);
    }
    return {paths: paths, invalid: invalid};
}
//Cookieからカラーモードを取得する
function get_cookie_color_mode() {
    const cookie = document.cookie.split(/;\s*/).find(c => c.startsWith('night_mode='));

    //night_mode が存在しない場合は system を返す
    if(!cookie) return "system";

    const color_mode_number = Number(cookie.split('=')[1]);

    // 数値として正常でない場合は system を返す
    if(!Number.isInteger(color_mode_number)) return "system";

    //カラーモードが 0 以下の場合は light を返す
    if(color_mode_number <= 0) return "light";

    //カラーモードが 1 以上の場合は dark を返す
    return "dark";
}
//カラム読み込み失敗検出
function watch_load_column(column_frames, max_retries = 5){
    const cleanups = [];
    const retry_timers = [];
    column_frames.forEach(column => {
        let count = 0;

        const reLoad = () => {
            if (++count >= max_retries) return;
            retry_timers.push(setTimeout(() => { column.src = column.src }, 500));
        };

        const onLoad = () => {
            try {
                column.contentWindow.document.querySelector('head');
            } catch {
                reLoad();
            }
        };

        column.addEventListener('load', onLoad);
        column.addEventListener('error', reLoad);
        cleanups.push(() => {
            column.removeEventListener('load', onLoad);
            column.removeEventListener('error', reLoad);
        });
    });

    const stop_listening = () => cleanups.forEach(fn => fn());
    setTimeout(stop_listening, max_retries * 500 + 1000);
    //監視を途中で外すための関数を返す (同じ iframe を読み込み直すときに前の監視を解除するのに使う)。予約済みの再読み込みも取り消す
    return () => {
        stop_listening();
        retry_timers.forEach(timer => clearTimeout(timer));
        retry_timers.length = 0;
    };
}
//設定初期化
//初期設定の構築。既定プロファイルは create_default_profile() で作る
function settings_init(){
    const settings = {
        last_load_profile:0,
        //column_settings:[{type:"main_bar_empty_column", banner:false, top_visible:true, tw_view_mode:"0", column_save_path:"", column_pinned_path:"", column_width:null}, {type:"home", banner:true, top_visible:true, tw_view_mode:"0", column_save_path:"", column_pinned_path:"", column_width:null}, {type:"notification", banner:false, top_visible:true, tw_view_mode:"0", column_save_path:"", column_pinned_path:"", column_width:null}, {type:"explore", banner:false, top_visible:true, tw_view_mode:"0", exp_type:"", column_save_path:"/explore", column_pinned_path:"", column_width:null}, {type:"empty_column", banner:false, top_visible:true, tw_view_mode:"0", column_save_path:"", column_pinned_path:"", column_width:null}],
        version:manifest.version
    };
    let profile = [create_default_profile()];
    //console.log(profile);
    chrome.storage.local.set({'opd_profile_store': JSON.stringify(profile)}, function () {
        chrome.storage.local.set({'opd_settings': JSON.stringify(settings)}, function () {
            if(is_prototype){
                alert(i18n_message("msg_initial_setup_completed_prototype"));
            }else{
                alert(i18n_message("msg_initial_setup_completed"));
            }
            
            location.reload();
        });
    });
}
