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
let is_shift_pressed = false;
let profile_store;
let last_load_profile = 0;
let is_removed_default_style = false;
let media_viewer_token = [];
const column_auto_update_state = {
    text_focus: {date: 0, active: false},
    media_viewer: {active: false},
};
const ui_icon_define = {
    banner_hide:"icon/banner_hide.svg",
    top_bar_hide:"icon/top_hide.svg",
    column_move:"icon/column_move.svg",
    column_close:"icon/column_close.svg",
    column_settings: "icon/settings.svg",
    column_pin:"icon/pin.svg",
    column_pinned:"icon/pinned.svg",
    column_widesize:"icon/column_w_size.svg",
    column_add_1:"icon/column_add_1st.svg",
    column_add_2:"icon/column_add_2nd.svg",
    add_post_column:"icon/post.svg",
    add_timeline_column:"icon/tl_column.svg",
    add_notification_column:"icon/notice_column.svg",
    add_explore_column:"icon/exp_column.svg",
    add_list_column:"icon/list_column.svg",
    add_list_multi_column:"icon/list_column_multi.svg",
    column_single_rack:"icon/single_view.svg",
    column_second_rack:"icon/second_view.svg",
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
//ショートカットキー用に shift キーが押されていることを検出
document.addEventListener('keydown', (event) => {
    if (event.key === 'Shift') is_shift_pressed = true;
});
document.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') is_shift_pressed = false;
});
//ダイアログ表示などでフォーカスを失うと keyup を取りこぼすため、押下状態を解除する
window.addEventListener('blur', () => {
    is_shift_pressed = false;
});
//ストレージの書き込み監視(主にAPIリミット監視に使う)
let api_limit_obj = null;
let api_limit_dsc_obj = {time_line:"", recommend_timeline:"", search:""};
chrome.storage.onChanged.addListener((changes, namespace) => {
    if(changes.api_access_limit != undefined){
        //console.log(changes)
        api_limit_obj = changes.api_access_limit.newValue;
        const api_linit_status_btn = document.querySelector("#api_limit_status");
        if(api_linit_status_btn != null){
            let timeline_limit_percentage = 99999;
            let recommend_timeline_limit_percentage = 99999;
            let search_limit_percentage = 99999;
            if(api_limit_obj.time_line.remaining != null){
                timeline_limit_percentage = api_limit_obj.time_line.remaining / api_limit_obj.time_line.limit * 100;
                api_limit_dsc_obj.time_line = `${i18n_message("label_api_timeline")}${api_limit_obj.time_line.remaining}/${api_limit_obj.time_line.limit}-${unix_time_mmss(api_limit_obj.time_line.reset_unix_time)}\r\n`;
            }else{
                //初期状態
            }
            if(api_limit_obj.recommend_timeline.remaining != null){
                recommend_timeline_limit_percentage = api_limit_obj.recommend_timeline.remaining / api_limit_obj.recommend_timeline.limit * 100;
                api_limit_dsc_obj.recommend_timeline = `${i18n_message("label_api_recommend_timeline")}${api_limit_obj.recommend_timeline.remaining}/${api_limit_obj.recommend_timeline.limit}-${unix_time_mmss(api_limit_obj.recommend_timeline.reset_unix_time)}\r\n`;
            }else{
                //初期状態
            }
            if(api_limit_obj.search.remaining != null){
                search_limit_percentage = api_limit_obj.search.remaining / api_limit_obj.search.limit * 100;
                api_limit_dsc_obj.search = `${i18n_message("label_api_search")}${api_limit_obj.search.remaining}/${api_limit_obj.search.limit}-${unix_time_mmss(api_limit_obj.search.reset_unix_time)}`;
            }else{
                //初期状態
            }
            api_linit_status_btn.textContent = `${Math.floor(Math.min(timeline_limit_percentage, recommend_timeline_limit_percentage, search_limit_percentage))}%`;
            api_linit_status_btn.title = `${i18n_message("msg_api_limit_status_title", [`${api_limit_dsc_obj.time_line}${api_limit_dsc_obj.recommend_timeline}${api_limit_dsc_obj.search}`])}`;
        }
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
    profile_list_html = `<div class="profile_val_now" title="${i18n_message("ui_profile_current_title")}">${last_load_profile}</div><div class="dsp_profile_list"><div id="profile_btn_list">${profile_list_btn_html}</div>`;
    //console.log(profile_list_btn_html)
    //カラム全体のテキストフォーカスの状態で自動更新を制御できるようにする
    window.addEventListener('opd_post_focus', (e) => {
        const detail = JSON.parse(e.detail);
        if(detail){
            column_auto_update_state.text_focus.date = Date.now();
            column_auto_update_state.text_focus.active = true;
        }else{
            column_auto_update_state.text_focus.date = 0;
            column_auto_update_state.text_focus.active = false;
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
    document.querySelector("head").insertAdjacentHTML("afterbegin", `<style second_column_css></style>
    <style opd_default_css>
    html{
        overflow-y:hidden !important;
    }
    .main_bar_functions{
        display: flex;
        justify-content: center;
        flex-direction: column;
        align-items: center;
        margin-top: 0.5rem;
    }
    .main_bar_functions hr{
        width: 80%;
        margin: 0;
    }
    .opd_version_span{
        cursor: pointer;
    }
    .opd_debug_menu{
        display: none;
    }
    #opd_main_element{
        background: #e4e4e4 !important;
    }
    div[opd_column_type="dsp_column"]{
        overflow-x: scroll;
        scrollbar-width: none;
    }
    #main_bar_empty_column{
        background-color: white;
    }
    #api_limit_status{
        border-radius: 100px;
        width: 50px;
    }
    #api_limit_status:hover{
        background-color: #d5d5d5;
        cursor: help;
    }
    .opd_ui_logo_parent{
        overflow: hidden;
        display: flex;
        width: 50px;
        align-content: center;
        justify-content: center;
        align-items: center;
        flex-direction: column;
    }
    .opd_ui_logo{
        background-size: cover;
        background-repeat: no-repeat;
        background-image: url(${chrome.runtime.getURL("icon/logo_icon.svg")});
        height: 50px;
        width: 50px;
        cursor: pointer;
    }
    .profile_val_now{
        border-radius: 100px;
        width: 55px;
    }
    .profile_val_now:hover{
        background-color: #d5d5d5;
    }
    #main_rack_element{
        position: fixed;
        left:60px;
        height:100vh;
        max-width:calc(100vw - 60px);
        width:calc(100vw - 60px);
        overflow:scroll hidden;
    }
    #first_rack_element{
        /*overflow: hidden;*/
    }
    #second_rack_element{
        /*overflow: hidden;*/
    }
    .dsp_column_emptycolumn p{
        text-align: center;
    }
    .dsp_column_second_emptycolumn p{
        text-align: center;
    }
    .dsp_btn_parent{
        overflow: hidden;
        border-radius: 100px;
        display: flex;
        width: 50px;
        height: 50px;
        align-content: center;
        justify-content: center;
        align-items: center;
    }
    .dsp_btn_parent:hover{
        background: #d5d5d5;
        cursor: pointer;
    }
    .dsp_btn_parent:focus-visible{
        outline: 2px solid currentColor;
        outline-offset: -2px;
    }
    .dsp_btn_add_post_img{
        filter: brightness(0) saturate(100%) invert(11%) sepia(16%) saturate(13%) hue-rotate(322deg) brightness(107%) contrast(80%);
        background-size: cover;
        background-repeat: no-repeat;
        background-image: url(${chrome.runtime.getURL(ui_icon_define.add_post_column)});
        height: 69%;
        width: 69%;
    }
    .dsp_btn_add_tl_img{
        filter: brightness(0) saturate(100%) invert(11%) sepia(16%) saturate(13%) hue-rotate(322deg) brightness(107%) contrast(80%);
        background-size: cover;
        background-repeat: no-repeat;
        background-image: url(${chrome.runtime.getURL(ui_icon_define.add_timeline_column)});
        height: 69%;
        width: 69%;
    }
    .dsp_btn_add_ntfc_img{
        filter: brightness(0) saturate(100%) invert(11%) sepia(16%) saturate(13%) hue-rotate(322deg) brightness(107%) contrast(80%);
        background-size: cover;
        background-repeat: no-repeat;
        background-image: url(${chrome.runtime.getURL(ui_icon_define.add_notification_column)});
        height: 69%;
        width: 69%;
    }
    .dsp_btn_add_explr_img{
        filter: brightness(0) saturate(100%) invert(11%) sepia(16%) saturate(13%) hue-rotate(322deg) brightness(107%) contrast(80%);
        background-size: cover;
        background-repeat: no-repeat;
        background-image: url(${chrome.runtime.getURL(ui_icon_define.add_explore_column)});
        height: 69%;
        width: 69%;
    }
    .dsp_btn_add_list_img{
        filter: brightness(0) saturate(100%) invert(11%) sepia(16%) saturate(13%) hue-rotate(322deg) brightness(107%) contrast(80%);
        background-size: cover;
        background-repeat: no-repeat;
        background-image: url(${chrome.runtime.getURL(ui_icon_define.add_list_column)});
        height: 69%;
        width: 69%;
    }
    .dsp_btn_add_list_multi_img{
        filter: brightness(0) saturate(100%) invert(11%) sepia(16%) saturate(13%) hue-rotate(322deg) brightness(107%) contrast(80%);
        background-size: cover;
        background-repeat: no-repeat;
        background-image: url(${chrome.runtime.getURL(ui_icon_define.add_list_multi_column)});
        height: 69%;
        width: 69%;
    }
    .dsp_btn_global_settings_img{
        filter: brightness(0) saturate(100%) invert(11%) sepia(16%) saturate(13%) hue-rotate(322deg) brightness(107%) contrast(80%);
        background-size: cover;
        background-repeat: no-repeat;
        background-image: url(${chrome.runtime.getURL(ui_icon_define.column_settings)});
        height: 69%;
        width: 69%;
    }
    .dsp_btn_second_rack_img{
        filter: brightness(0) saturate(100%) invert(11%) sepia(16%) saturate(13%) hue-rotate(322deg) brightness(107%) contrast(80%);
        background-size: cover;
        background-repeat: no-repeat;
        background-image: url(${chrome.runtime.getURL(ui_icon_define.column_second_rack)});
        height: 69%;
        width: 69%;
    }
    .dsp_btn_profile_add_img{
        filter: brightness(0) saturate(100%) invert(11%) sepia(16%) saturate(13%) hue-rotate(322deg) brightness(107%) contrast(80%);
        background-size: cover;
        background-repeat: no-repeat;
        background-image: url(${chrome.runtime.getURL(ui_icon_define.profile_save)});
        height: 69%;
        width: 69%;
    }
    .dsp_btn_profile_delete_img{
        filter: brightness(0) saturate(100%) invert(11%) sepia(16%) saturate(13%) hue-rotate(322deg) brightness(107%) contrast(80%);
        background-size: cover;
        background-repeat: no-repeat;
        background-image: url(${chrome.runtime.getURL(ui_icon_define.profile_delete)});
        height: 69%;
        width: 69%;
    }
    .dsp_btn_change_profile_btn{
        display: flex;
        font-size: 1.2rem;
        justify-content: center;
        align-items: center;
        height: 69%;
        width: 69%;
    }
    .dsp_profile_list{
        max-height: 1000px;
        overflow-y: scroll;
        scrollbar-width: none;
    }
    .dsp_column_draggable_true{
        border-left: solid 3px #0000002e;
        border-right: solid 3px #0000002e;
        border-bottom: solid 3px #0000002e;
        /*overflow: hidden;*/
        background-color: white;
        border-radius: 6px 6px;
    }
    .dsp_column_draggable_true div[opd_column_type]{
        display: flex;
        flex-direction: column;
    }
    .dsp_column iframe{
        border: 0;
    }
    .dsp_column_btn{
        width: 20px;
        min-width: 20px;
        border-radius: 2px;
        overflow: hidden;
        margin-right: 5px;
    }
    .dsp_column_btn:hover{
        background: #d5d5d5;
        cursor: pointer;
    }
    .column_bar{
        display: flex;
        flex-direction: row;
        width: 100%;
        min-height: 20px;
        overflow: hidden;
        border-top: solid #a0a0a073 1px !important;
        border-bottom: solid #a0a0a073 1px !important;
        border-radius: 4px 4px 0 0;
    }
    .dsp_column_title{
        width: auto;
        background-color: white;
        margin-right: 5px;
    }
    .dsp_column_move_icon_parent{
        max-height: 20px;
        display: flex;
        flex-direction: row;
        align-items: center;
    }
    .dsp_column_move_icon{
        display: block;
        filter: brightness(0) saturate(100%) invert(61%) sepia(13%) saturate(13%) hue-rotate(335deg) brightness(89%) contrast(79%);
        background-image: url(${chrome.runtime.getURL(ui_icon_define.column_move)});
        background-size: cover;
        width: 15px;
        height: 15px;   
    }
    .dsp_column_settings_btn{
        display: block;
        background-image: url(${chrome.runtime.getURL(ui_icon_define.column_settings)});
        background-size: cover;
        width: 20px;
        height: 20px;    
    }
    .dsp_column_settings_btn:hover{
        cursor: pointer;
    }
    .dsp_column_settings_btn input{
        display: none;
    }
    .dsp_column_empty_area {
    	width: 100%;
    }
    .dsp_column_close_btn{
        display: block;
        background-image: url(${chrome.runtime.getURL(ui_icon_define.column_close)});
        background-size: 15px;
        background-repeat: no-repeat;
        background-position: center;
        width: 20px;
        height: 20px;
    }
    .dsp_column_close_btn:hover{
        cursor: pointer;
    }
    .dsp_column_close_btn input{
        display: none;
    }

    .dsp_column_banner_btn{
        display: block;
        background-image: url(${chrome.runtime.getURL(ui_icon_define.banner_hide)});
        transform: rotate(180deg);
        background-size: cover;
        width: 20px;
        height: 20px;
    }
    input:checked + .dsp_column_banner_btn{
        transform: rotate(0deg);
    }
    .dsp_column_btn input{
        opacity: 0;
        position: absolute;
        z-index: 10;
        margin: 0;
        width: 20px;
        height: 20px;
        cursor: pointer;
    }
    .dsp_column_top_btn{
        display: block;
        background-image: url(${chrome.runtime.getURL(ui_icon_define.top_bar_hide)});
        transform: rotate(180deg);
        background-size: cover;
        width: 20px;
        height: 20px;
        cursor: pointer;  
    }
    input:checked + .dsp_column_top_btn{
        transform: rotate(0deg);
    }
    .dsp_column_top_btn input{
        opacity: 0;
        position: absolute;
        z-index: 10;
        margin: 0;
        width: 20px;
        height: 20px;
    }
    .dsp_column_close_btn_wrap{
        display: flex;
        justify-content: flex-end;
    }
    .dsp_column_close_btn input{
        display: none;
    }

    .dsp_column_pin_btn{
        display: block;
        background-image: url(${chrome.runtime.getURL(ui_icon_define.column_pin)});
        background-size: cover;
        width: 20px;
        height: 20px;    
    }
    input:checked + .dsp_column_pin_btn{
        background-image: url(${chrome.runtime.getURL(ui_icon_define.column_pinned)});
    }
    .dsp_column_pin_btn input{
        opacity: 0;
        position: absolute;
        z-index: 10;
        margin: 0;
        width: 20px;
        height: 20px;
    }

    .dsp_column_settings_panel{
        display: none;
        position: relative;
        width: inherit;
        height: auto;
        background: #efefefeb;
        border: 1px solid #a9a9a9eb;
        flex-direction: column;
    }
    .dsp_column_settings_panel h2{
        /*margin: 0 0 0.2rem;*/
        margin: 0;
    }
    .dsp_column_settings_panel_content{
        margin-left: 0.5rem;
    }
    .dsp_column_settings_panel_content h2{
        font-size: 1.2rem;
    }
    .opd_column_settings_input_text{
        width: 5rem;
        margin-right: 0.2rem;
    }
    /* 入力を受け付けない状態 (readonly + aria-disabled)。フォーカスと tooltip は残す */
    .opd_column_settings_input_text[aria-disabled="true"]{
        opacity: 0.6;
        cursor: not-allowed;
    }
    .dsp_column_settings_list{
        background: white;
        border-radius: 5px;
        margin: 0 0.5rem 0.5rem 0;
        padding: 0.5rem;
    }
    .dsp_column_settings_content_div{
        margin-bottom: 0.1rem;
        display: flex;
        justify-content: space-between;
    }
    .dsp_column_settings_panel_close_btn_wrap{
        display: flex;
        flex-direction: row;
        justify-content: center;
        margin: 0 0.5rem 0.5rem 0;
    }
    /*モーダルダイアログ共通(リストカラム複数追加ダイアログ・全体設定ダイアログ)*/
    .opd_dialog_overlay{
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.5);
    }
    .opd_dialog{
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        max-width: 95%;
        max-height: 92%;
        box-sizing: border-box;
        overflow-y: auto;
        padding: 1rem;
        background: #efefefeb;
        border: 1px solid #a9a9a9eb;
        color: black;
    }
    /*全体設定ダイアログ*/
    .opd_global_settings_dialog{
        gap: 0.5rem;
        width: 28rem;
    }
    .opd_global_settings_description{
        margin: 0;
        font-size: 0.85rem;
    }
    .opd_global_settings_row{
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
    }
    .opd_global_settings_status{
        min-height: 1.5rem;
        font-size: 0.9rem;
    }
    .opd_global_settings_actions{
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
        gap: 0.5rem;
    }
    /*リストカラム複数追加ダイアログ*/
    .opd_list_picker_overlay{
        --opd-list-picker-accent: #1d9bf0;
        --opd-list-picker-accent-text: #ffffff;
        --opd-list-picker-accent-background: rgba(29, 155, 240, 0.15);
        --opd-list-picker-surface: #ffffff;
        --opd-list-picker-skeleton: #bdbdbd;
        --opd-list-picker-muted-text: #555555;
    }
    .opd_list_picker_dialog{
        gap: 0.5rem;
        width: 72rem;
    }
    .opd_list_picker_body{
        display: flex;
        flex-direction: row;
        gap: 1rem;
        min-height: 0;
    }
    .opd_list_picker_browse{
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        flex: 3 1 0;
        min-width: 0;
    }
    .opd_list_picker_selection{
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        flex: 2 1 0;
        min-width: 0;
    }
    .opd_list_picker_status,
    .opd_list_picker_selection_status{
        min-height: 1.5rem;
        font-size: 0.9rem;
    }
    .opd_list_picker_frame_wrap{
        position: relative;
        height: clamp(12rem, 55vh, 34rem);
        background: var(--opd-list-picker-surface);
        border-radius: 5px;
        overflow: hidden;
    }
    .opd_list_picker_frame{
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
    }
    .opd_list_picker_frame_skeleton{
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        padding: 0.8rem;
        box-sizing: border-box;
        background: var(--opd-list-picker-surface);
    }
    .opd_list_picker_frame_skeleton span{
        display: block;
        height: 3rem;
        border-radius: 4px;
        background: var(--opd-list-picker-skeleton);
    }
    .opd_list_picker_selection_hint{
        margin: 0;
        font-size: 0.85rem;
        color: var(--opd-list-picker-muted-text);
    }
    .opd_list_picker_selected_wrap{
        position: relative;
        flex: 1 1 auto;
        min-height: 10rem;
        overflow-y: auto;
        background: var(--opd-list-picker-surface);
        border-radius: 5px;
    }
    .opd_list_picker_selected{
        list-style: none;
        margin: 0;
        padding: 0.4rem;
    }
    .opd_list_picker_selected_item{
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.3rem 0.4rem;
        border-top: 2px solid transparent;
        border-bottom: 2px solid transparent;
        border-radius: 4px;
        cursor: grab;
    }
    .opd_list_picker_selected_item:focus-visible{
        outline: 2px solid var(--opd-list-picker-accent);
        outline-offset: -2px;
    }
    .opd_list_picker_selected_item.opd_list_picker_dragging{
        opacity: 0.5;
    }
    .opd_list_picker_selected_item.opd_list_picker_drop_before{
        border-top-color: var(--opd-list-picker-accent);
    }
    .opd_list_picker_selected_item.opd_list_picker_drop_after{
        border-bottom-color: var(--opd-list-picker-accent);
    }
    .opd_list_picker_drag_handle{
        color: var(--opd-list-picker-muted-text);
        user-select: none;
    }
    .opd_list_picker_order{
        min-width: 1.8rem;
        text-align: right;
        font-variant-numeric: tabular-nums;
    }
    .opd_list_picker_selected_name{
        flex: 1 1 auto;
        min-width: 0;
        overflow-wrap: anywhere;
    }
    .opd_list_picker_remove_btn{
        flex: none;
    }
    .opd_list_picker_empty{
        margin: 0;
        padding: 0.8rem;
        color: var(--opd-list-picker-muted-text);
    }
    .opd_list_picker_manual_row{
        display: flex;
        align-items: flex-start;
        gap: 0.4rem;
    }
    .opd_list_picker_manual{
        flex: 1 1 auto;
        min-width: 0;
        min-height: 3rem;
        box-sizing: border-box;
    }
    .opd_list_picker_count{
        min-height: 1.5rem;
    }
    .opd_list_picker_actions{
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
        gap: 0.5rem;
    }
    .opd_list_picker_frame_skeleton[hidden],
    .opd_list_picker_empty[hidden]{
        display: none;
    }
    @media (max-width: 60rem){
        .opd_list_picker_body{
            flex-direction: column;
        }
        .opd_list_picker_selected_wrap{
            height: 16rem;
        }
    }
    .opd_ui_icon_color{
        filter: brightness(0) saturate(100%) invert(11%) sepia(16%) saturate(13%) hue-rotate(322deg) brightness(107%) contrast(80%);
    }
    /*#main_rack_element section:first-child{
        margin-left:110px
    }*/
    /*:root {color-scheme: light;}*/
    /*#opd_main_element[opd-dsp-theme="dark"] {
        color-scheme: dark;
    }*/
    #opd_main_element[opd-dsp-theme="light"] {
        color-scheme: light;
    }
    /*ダークモード検出時*/
    #opd_main_element[opd-dsp-theme="dark"] {
        color-scheme: dark;

        & #main_rack_element {
            background-color: black !important;
            scrollbar-color: auto;
        }

        & .dsp_column_draggable_false,
        & #first_rack_element,
        & #second_rack_element,
        & #main_bar_empty_column {
            background-color: black !important;
            color: white;
        }

        & .dsp_column_draggable_true,
        & .dsp_column_title {
            background-color: #2e2e2e !important;
        }

        & .dsp_btn_add_post_img,
        & .dsp_btn_add_tl_img,
        & .dsp_btn_add_ntfc_img,
        & .dsp_btn_add_explr_img,
        & .dsp_btn_add_list_img,
        & .dsp_btn_add_list_multi_img,
        & .dsp_btn_global_settings_img,
        & .dsp_btn_second_rack_img,
        & .dsp_btn_profile_add_img,
        & .dsp_btn_profile_delete_img,
        & .dsp_column_move_icon,
        & .opd_ui_icon_color {
            filter: brightness(0) saturate(100%) invert(48%) sepia(0%) saturate(93%) hue-rotate(266deg) brightness(93%) contrast(86%);
        }

        & #api_limit_status:hover,
        & .dsp_btn_parent:hover,
        & .dsp_column_btn:hover,
        & .profile_val_now:hover {
            background: #555555;
        }

        & .dsp_column_settings_panel {
            background: #2e2e2e;
            border: 1px solid #5d5d5d;
        }

        & .dsp_column_settings_list {
            background: #474747;
        }
        
        & .dsp_column_title {
            background-color: transparent !important;
        }

        /* 焼付き軽減 */
        & div[opd_column_type="dsp_column"] {
            filter: brightness(0.7);
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

        & #main_bar_empty_column, div[opd_column_type="empty_column"], div[opd_column_type="second_empty_column"] {
            filter: brightness(0.7);
        }

        & .opd_list_picker_overlay {
            --opd-list-picker-surface: #474747;
            --opd-list-picker-skeleton: #7a7a7a;
            --opd-list-picker-muted-text: #c0c0c0;
        }

        & .opd_dialog {
            background: #2e2e2e;
            border: 1px solid #5d5d5d;
            color: white;
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
        border: 0;
        background: #00000000;
        cursor: pointer;
        outline: none;
    }
    .opd_media_viewer_func_btn.media_switch_btn{
        width: 80px;
        height: 80px;
        margin: 10px;
        border-radius: 10px;
        display: flex;
        justify-content: center;
        align-items: center;
    }
    .opd_media_viewer_func_btn_circle button{
        border: 0;
        background: #00000000;
        cursor: pointer;
        outline: none;
        border-radius: 10px;
    }
    button[disabled].opd_media_viewer_func_btn{
        visibility: hidden;
    }
    .opd_media_viewer_func_btn_icon_color{
        filter: brightness(0) saturate(100%) invert(96%) sepia(6%) saturate(0%) hue-rotate(285deg) brightness(115%) contrast(100%);
    }
    .opd_media_viewer_func_btn:hover{
        background: #2f2f2fa3;
    }
    .opd_media_viewer_func_btn_circle button:hover{
        background: #2f2f2fa3;
    }
    .media_viewer_icon_close{
        display: block;
        background-image: url(${chrome.runtime.getURL(ui_icon_define.column_close)});
        background-size: 20px;
        background-repeat: no-repeat;
        background-position: center;
        width: 40px;
        height: 40px;
        padding: 5px;
    }
    .media_viewer_icon_forward{
        display: block;
        background-image: url(${chrome.runtime.getURL(ui_icon_define.forward)});
        background-size: 20px;
        background-repeat: no-repeat;
        background-position: center;
        width: 30px;
        height: 30px;
        padding: 5px;
    }
    .media_viewer_icon_next{
        display: block;
        background-image: url(${chrome.runtime.getURL(ui_icon_define.next)});
        background-size: 20px;
        background-repeat: no-repeat;
        background-position: center;
        width: 30px;
        height: 30px;
        padding: 5px;
    }
    .media_viewer_icon_download{
        display: block;
        background-image: url(${chrome.runtime.getURL(ui_icon_define.download)});
        background-size: 20px;
        background-repeat: no-repeat;
        background-position: center;
        width: 30px;
        height: 30px;
        padding: 5px;
    }
    </style>`);
    //カラム要素作成-挿入
    let default_element_bar = `<span class="dsp_column_btn"><label class="dsp_column_settings_btn opd_ui_icon_color" title="${i18n_message("ui_column_settings_title")}"><input class="opd_settings_btn" type="button" value="S"></label></span><span class="dsp_column_btn"><input class="opd_banner" type="checkbox" title="${i18n_message("ui_column_banner_toggle_title")}" %column_banner_ch%><label class="dsp_column_banner_btn opd_ui_icon_color"></label></span><span class="dsp_column_btn"><input class="opd_top_bar" type="checkbox" title="${i18n_message("ui_column_top_toggle_title")}" %column_top_bar_ch%><label class="dsp_column_top_btn opd_ui_icon_color"></label></span>`;
    let post_element_bar = `<span class="dsp_column_btn"><label class="dsp_column_settings_btn opd_ui_icon_color" title="${i18n_message("ui_column_settings_title")}"><input class="opd_settings_btn" type="button" value="S"></label></span>`;
    let othersns_default_element_bar = `<span class="dsp_column_btn"><label class="dsp_column_settings_btn opd_ui_icon_color" title="${i18n_message("ui_column_settings_title")}"><input class="opd_settings_btn" type="button" value="S"></label></span>`;
    //カラム設定パネルはカラム種別ごとに出す行が異なる (項目 × カラム種別の適用表に従う)
    let post_settings_panel = build_column_settings_panel({iframe_styles:false, auto_reload:false, pinned:false});
    let notification_settings_panel = build_column_settings_panel({iframe_styles:true, auto_reload:false, pinned:false});
    let home_settings_panel = build_column_settings_panel({iframe_styles:true, auto_reload:true, pinned:false});
    let explore_settings_panel = build_column_settings_panel({iframe_styles:true, auto_reload:true, pinned:true});
    let default_element = {
        /*main_bar_empty_column:{html:`<!--<section draggable="false" class="dsp_column"><div opd_column_type="main_bar_empty_column" opd_column_width="%column_width_num%" id="main_bar_empty_column" style="height:100%;min-width: 70px;"></div></section>-->`},*/
        empty_column:{html:`<section draggable="false" id="column_%column_num%" class="dsp_column_draggable_false dsp_column dsp_column_emptycolumn"><div opd_column_type="empty_column" opd_column_width="%column_width_attr%" style="height: 100%;min-width: 30rem;display: flex;align-items: center;justify-content: center;"><div><img src="${chrome.runtime.getURL(ui_icon_define.column_add_1)}" style="filter: brightness(0) saturate(100%) invert(61%) sepia(13%) saturate(13%) hue-rotate(335deg) brightness(89%) contrast(79%);"><p>左のバーからカラムを追加</p></div></div></section>`},
        post:{html:`<section draggable="true" id="column_%column_num%" class="dsp_column_draggable_true dsp_column"><div opd_column_type="post" opd_column_width="%column_width_attr%" style="height: 100%;width: %column_width_num%rem;min-width: 1rem;"><div class="column_bar" style="height: max-content;"><span class="dsp_column_title"><div class="dsp_column_move_icon_parent"><span class="dsp_column_move_icon"></span><span>Post</span></div></span>${post_element_bar}<div class="dsp_column_empty_area opd_column_scroll_to_top"></div><div class="dsp_column_close_btn_wrap"><span class="dsp_column_btn"><label class="dsp_column_close_btn opd_ui_icon_color" title="カラムを閉じる"><input type="button" class="column_close_btn" value="X"/></label></span></div></div>${post_settings_panel}<iframe auto_reload_mouse_hover="false" allow="fullscreen" src="https://x.com/intent/tweet" type="text/html" style="width: 100%;height: 100%;" opd_init_webview></iframe></div></section>`},
        second_empty_column:{html:`<section draggable="false" id="column_%column_num%" class="dsp_column_draggable_false dsp_column dsp_column_second_emptycolumn"><div opd_column_type="second_empty_column" opd_column_width="%column_width_attr%" style="height:100%;min-width: 30rem;overflow: hidden;display: flex;align-items: center;justify-content: center;"><div><img src="${chrome.runtime.getURL(ui_icon_define.column_add_2)}" style="filter: brightness(0) saturate(100%) invert(61%) sepia(13%) saturate(13%) hue-rotate(335deg) brightness(89%) contrast(79%);"><p>1段目のカラムが配置できます</p></div></div></section>`},
        home:{html:`<section draggable="true" id="column_%column_num%" class="dsp_column_draggable_true dsp_column"><div opd_column_type="home" opd_column_width="%column_width_attr%" opd_setting_banner="%column_setting_banner%" opd_setting_top_visible="%column_setting_top_visible%" opd_setting_tw_view_mode="%column_setting_tw_view_mode%" opd_setting_auto_reload="%column_setting_auto_reload%" opd_setting_auto_reload_time="%column_setting_auto_reload_time%" style="height: 100%;width: %column_width_num%rem;min-width: 1rem;"><div class="column_bar" style="height: max-content;"><span class="dsp_column_title"><div class="dsp_column_move_icon_parent"><span class="dsp_column_move_icon"></span><span>Timeline</span></div></span>${default_element_bar}<div class="dsp_column_empty_area opd_column_scroll_to_top"></div><div class="dsp_column_close_btn_wrap"><span class="dsp_column_btn"><label class="dsp_column_close_btn opd_ui_icon_color" title="カラムを閉じる"><input type="button" class="column_close_btn" value="X"/></label></span></div></div>${home_settings_panel}<iframe auto_reload_mouse_hover="false" allow="fullscreen" src="https://x.com/home" type="text/html" style="width: 100%;height: 100%;" opd_init_webview></iframe></div></section>`},
        notification:{html:`<section draggable="true" id="column_%column_num%" class="dsp_column_draggable_true dsp_column"><div opd_column_type="notification" opd_column_width="%column_width_attr%" opd_setting_banner="%column_setting_banner%" opd_setting_top_visible="%column_setting_top_visible%" opd_setting_tw_view_mode="%column_setting_tw_view_mode%" style="height: 100%;width: %column_width_num%rem;min-width: 1rem;"><div class="column_bar" style="height: max-content;"><span class="dsp_column_title"><div class="dsp_column_move_icon_parent"><span class="dsp_column_move_icon"></span><span>Notifications</span></div></span>${default_element_bar}<div class="dsp_column_empty_area opd_column_scroll_to_top"></div><div class="dsp_column_close_btn_wrap"><span class="dsp_column_btn"><label class="dsp_column_close_btn opd_ui_icon_color" title="カラムを閉じる"><input type="button" class="column_close_btn" value="X"/></label></span></div></div>${notification_settings_panel}<iframe allow="fullscreen" src="https://x.com/notifications" type="text/html" style="width: 100%;height: 100%;" opd_init_webview></iframe></div></section>`},
        explore:{html:`<section draggable="true" id="column_%column_num%" class="dsp_column_draggable_true dsp_column"><div opd_column_type="explore" opd_column_width="%column_width_attr%" opd_setting_banner="%column_setting_banner%" opd_setting_top_visible="%column_setting_top_visible%" opd_setting_tw_view_mode="%column_setting_tw_view_mode%" opd_setting_auto_reload="%column_setting_auto_reload%" opd_setting_auto_reload_time="%column_setting_auto_reload_time%" opd_setting_pinned="%column_setting_pinned%" opd_explore_path="%column_save_path%" opd_explore_title="%column_save_title%" opd_pinned_path="%column_pinned_save_path%" style="height: 100%;width: %column_width_num%rem;min-width: 1rem;"><div class="column_bar" style="height: max-content;"><span class="dsp_column_title"><div class="dsp_column_move_icon_parent"><span class="dsp_column_move_icon"></span><span class="dsp_explore_column_title">%column_title%</span></div></span>${default_element_bar}<span class="dsp_column_btn"><input class="opd_pinned_btn" type="checkbox" title="ピン止め切り替え" %column_pinned_ch%><label class="dsp_column_pin_btn opd_ui_icon_color"></label></span><div class="dsp_column_empty_area opd_column_scroll_to_top"></div><div class="dsp_column_close_btn_wrap"><span class="dsp_column_btn"><label class="dsp_column_close_btn opd_ui_icon_color" title="カラムを閉じる"><input type="button" class="column_close_btn" value="X"/></label></span></div></div>${explore_settings_panel}<iframe auto_reload_mouse_hover="false" allow="fullscreen" src="https://x.com%column_save_path%" type="text/html" style="width: 100%;height: 100%;" opd_init_webview></iframe></div></section>`}
    };
    let ins_html = document.createElement("div");
    ins_html.id = "opd_main_element";
    ins_html.style = "position: fixed;z-index: 999999;top:0;width: 100%;height: 100%;background: white;display: flex;flex-direction: row;overflow: hidden;";
    let side_bar = `<section class="dsp_column" style="position:fixed;z-index:999;height:98%;"><div draggable="false" class="dsp_column_draggable_false" opd_column_type="dsp_column" opd_column_width="%column_width_num%" style="height:100%;min-width: 60px;max-width: 60px;text-align: center;background-color: white;"><div class="main_bar_functions"><div class="opd_ui_logo_parent" title="${i18n_message("ui_sidebar_logo_title", [manifest.version])}"><div class="opd_ui_logo"></div><span class="opd_version_span">${manifest.version}</span></div><hr><p class="opd_debug_menu">${i18n_message("ui_debug_menu_label")}<br><input type="button" id="init_settings" value="${i18n_message("ui_button_init_settings")}" /><br><input type="button" id="profile_load_save" value="${i18n_message("ui_button_profile_loader")}" /><br><input type="button" id="dnr_reload" value="${i18n_message("ui_button_dnr_reload")}" /><br><input type="button" id="ext_reload" value="${i18n_message("ui_button_ext_reload")}" /><br><div id="api_limit_status">${i18n_message("ui_button_api_label")}</div><hr><div class="dsp_btn_parent" id="add_post" title="${i18n_message("ui_add_post_column_title")}"><div class="dsp_btn_add_post_img"></div></div><hr><div class="dsp_btn_parent" id="add_timeline" title="${i18n_message("ui_add_timeline_column_title")}"><div class="dsp_btn_add_tl_img"></div></div><div class="dsp_btn_parent" id="add_notify" title="${i18n_message("ui_add_notification_column_title")}"><div class="dsp_btn_add_ntfc_img"></div></div><div class="dsp_btn_parent" id="add_explore" title="${i18n_message("ui_add_explore_column_title")}"><div class="dsp_btn_add_explr_img"></div></div><div class="dsp_btn_parent" id="add_list" title="${i18n_message("ui_add_list_column_title")}"><div class="dsp_btn_add_list_img"></div></div><div class="dsp_btn_parent" id="add_list_multi" tabindex="0" role="button" title="${i18n_message("ui_add_list_multi_column_title")}"><div class="dsp_btn_add_list_multi_img"></div></div><hr><div class="dsp_btn_parent" id="global_settings" tabindex="0" role="button" title="${i18n_message("ui_global_settings_title")}"><div class="dsp_btn_global_settings_img"></div></div><hr><div class="dsp_btn_parent" title="${i18n_message("ui_toggle_second_rack_title")}" id="second_rack"><div class="dsp_btn_second_rack_img"></div></div><hr><div class="dsp_btn_parent" title="${i18n_message("ui_profile_save_title")}" id="profile_save"><div class="dsp_btn_profile_add_img"></div></div><div class="dsp_btn_parent" title="${i18n_message("ui_profile_delete_title")}" id="profile_delete"><div class="dsp_btn_profile_delete_img"></div></div>${profile_list_html}</p></div></div></section><section draggable="false" class="dsp_column_draggable_false dsp_column"><div opd_column_type="main_bar_empty_column" id="main_bar_empty_column" style="height:100%;min-width: 60px;max-width: 60px;"></div></section>`;
    //let side_bar = `<section class="dsp_column" style="position:fixed;z-index:999;height:98%;"><div draggable="false" opd_column_type="dsp_column" opd_column_width="%column_width_num%" style="height:100%;min-width: 100px;text-align: center;background-color: white;"><div><p style="margin-top:0;padding-top:1em;">Open-Deck<br>Prototype<br>v${manifest.version}</p><hr><p>Debug<br><input type="button" id="init_settings" value="init settings"/><br><input type="button" id="profile_load_save" value="Profile Load"/><br><input type="button" id="dnr_reload" value="dNR_Reload"/><br><input type="button" id="ext_reload" value="Ext_Reload"/></p><hr><p><input type="button" id="add_timeline" value="Add TimeLine"/> <div class="dsp_btn_parent"><div class="dsp_btn_add_tl_img"></div></div><div class="dsp_btn_parent"><div class="dsp_btn_add_ntfc_img"></div></div><div class="dsp_btn_parent"><div class="dsp_btn_add_explr_img"></div></div> </p><p><input type="button" id="add_notify" value="Add Notification"/></p><p><input type="button" id="add_explore" value="Add Explore"/><hr><input type="button" id="second_rack" value="Second Rack"/><hr><input type="button" id="profile_save" value="Profile_Save"/><br><input type="button" id="profile_delete" value="Profile_Delete"/><br>${profile_list_html}</p></div></div></section><section draggable="false" class="dsp_column"><div opd_column_type="main_bar_empty_column" id="main_bar_empty_column" style="height:100%;min-width: 110px;"></div></section>`;
    let main_column_html = ``;
    let second_column_html = ``;
    //設定2段
    let first_column_end = false;
    let second_column_end = false;
    let second_rack_mode = false;
    //スクロール検出用
    let scroll_block = true;
    //
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
                const effective_banner = saved_banner ?? global_settings.banner;
                const effective_top_visible = saved_top_visible ?? global_settings.top_visible;
                const effective_column_width = saved_column_width ?? global_settings.column_width;
                const effective_auto_reload_time = saved_auto_reload_time ?? global_settings.auto_reload_time;
                const effective_pinned = saved_pinned ?? global_settings.pinned;
                let init_pinned_path = "";
                let init_column_save_path = column_setting.column_save_path;
                let init_column_save_title = column_setting.column_save_title;
                //Exproleピン止め。実効ピン止め中はピン止めしたパスを開き直す (記録が無い場合は reconcile_column_pinned が現在のパスで補う)
                if(column_setting.type == "explore" && effective_pinned && (column_setting.column_pinned_path ?? "") != ""){
                    init_pinned_path = column_setting.column_pinned_path;
                    init_column_save_path = column_setting.column_pinned_path;
                }
                const column_html = fill_column_template(default_element[Object.keys(default_element)[default_index]]["html"], {
                    column_num: create_random_id(),
                    column_banner_ch: effective_banner ? "checked" : "",
                    column_top_bar_ch: effective_top_visible ? "checked" : "",
                    column_pinned_ch: effective_pinned ? "checked" : "",
                    column_width_attr: column_setting_attr_value("column_width", saved_column_width),
                    column_width_num: effective_column_width,
                    column_auto_reload_time: effective_auto_reload_time / 1000,
                    column_setting_banner: column_setting_attr_value("banner", saved_banner),
                    column_setting_top_visible: column_setting_attr_value("top_visible", saved_top_visible),
                    column_setting_tw_view_mode: column_setting_attr_value("tw_view_mode", saved_tw_view_mode),
                    column_setting_auto_reload: column_setting_attr_value("auto_reload", saved_auto_reload),
                    column_setting_auto_reload_time: column_setting_attr_value("auto_reload_time", saved_auto_reload_time),
                    column_setting_pinned: column_setting_attr_value("pinned", saved_pinned),
                    column_title: get_explore_column_title(init_column_save_path),
                    column_save_title: init_column_save_title,
                    column_pinned_save_path: init_pinned_path,
                    column_save_path: init_column_save_path,
                });
                //一段目終了検出にもかかわらず設定が存在していた場合2段目の変数に保存
                if(first_column_end == true){
                    second_column_html += column_html;
                }else{
                    main_column_html += column_html;
                }
                //一段目読込終了検出
                if(first_column_end == false && settings.column_settings[index].type == "empty_column"){
                    first_column_end = true;
                }
                //二段目読込終了検出
                if(second_column_end == false && settings.column_settings[index].type == "second_empty_column"){
                    second_column_end = true;
                }
            }
        }
    }
    //初期挿入HTML作成
    ins_html.innerHTML = `${side_bar}<div id="main_rack_element" style=""><div id="first_rack_element" style="height: 100%;display:flex;flex-direction:row;">${main_column_html}</div><div id="second_rack_element" style="display:flex;flex-direction:row;">${second_column_html}</div></div>`;
    //HTML挿入
    document.body.insertAdjacentElement("afterbegin", ins_html);

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
    document.querySelector("#api_limit_status").addEventListener("click", function(){
        if(api_limit_obj != null){
            alert(i18n_message("msg_api_limit_status_alert", [`${api_limit_dsc_obj.time_line}${api_limit_dsc_obj.recommend_timeline}${api_limit_dsc_obj.search}`]))
        }
    });
    //Open-Deckについて表示
    document.querySelector(".opd_ui_logo").addEventListener("click", function(){
        window.open(chrome.runtime.getURL("about_opd.html"), "About Open-Deck", 'width=720, height=280');
    });
    //デバッグメニュー表示
    let debug_menu_click_counter = 0;
    document.querySelector(".opd_version_span").addEventListener("click", function(){
        if(debug_menu_click_counter >= 7){
            alert(i18n_message("msg_debug_menu_enabled"));
            document.querySelector(".opd_debug_menu").style.display = "block";
        }else{
            debug_menu_click_counter += 1;
        }
    });
    //2段目が存在する場合の処理
    if(first_column_end == true && second_column_end == true){
        second_rack_mode = true;
        document.querySelector("#first_rack_element").style.height = "50vh";
        document.querySelector("#second_rack_element").style.height = "50vh";
        /*for (let index = 0; index < document.querySelectorAll('.dsp_column[draggable="true"]').length; index++) {
            document.querySelectorAll('.dsp_column[draggable="true"]')[index].style.height = "calc(100% - 25px)";
        }*/

        //document.querySelector("style[second_column_css]").textContent = `#second_rack_element .dsp_column[draggable="true"]{height:calc(100% - 25px)}`;

        document.querySelector("#second_rack").value = "Single Rack";
        document.querySelector(".dsp_btn_second_rack_img").style.backgroundImage = `url(${chrome.runtime.getURL(ui_icon_define.column_single_rack)})`;
    }
    //
    create_profile_list_btn();
    column_dd();
    column_close();
    append_object_css();
    //プロファイルリスト切替イベント作成関数
    function create_profile_list_btn(){
        //プロファイルリスト切替イベント初期化
        for (let index = 0; index < profile_store.length; index++) {
            document.querySelector(`#userProfile-${index}`).addEventListener("click",function(){
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
                            preload_desc_array.push(i18n_message("msg_profile_desc_first_row_end"));
                            preload_desc_count = 0;
                            break;
                        case "second_empty_column":
                            preload_desc_array.push(i18n_message("msg_profile_desc_second_row_end"));
                            preload_desc_count = 0;
                            break;
                        case "post":
                            preload_desc_array.push(i18n_message("msg_profile_desc_post_column", [preload_desc_count]));
                            break;
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
                if(confirm(`${i18n_message("msg_profile_load_confirm", [index, preload_desc_array.join("\r\n")])}`)){
                    //切り替え前のカラムの自動更新を止める
                    get_settings_target_columns().forEach((column_div) => stop_column_auto_reload(column_div));
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
                }
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
                });
            }
            apply_column_iframe_styles(opd_column_div);
            //exploreURL検出処理
            if(opd_column_div.getAttribute("opd_column_type") == 'explore'){
                mutate_url(opd_column_div);
            }
        }
    }
    //URL, ページタイトル監視
    //explore カラムの iframe 内のページ内遷移を MutationObserver で検知し、URL・タイトルの属性とカラムバーのタイトルを更新して保存する。表示パスに応じてトップ非表示の CSS が変わるため iframe 内 CSS も選び直す
    function mutate_url(element){
        let exp_object = element.querySelector("iframe");
        exp_object.addEventListener("load", function(){
            let exp_old_url = exp_object.contentWindow.location.href;
                    let exp_observer = new MutationObserver(function(){
                        if(exp_old_url != exp_object.contentWindow.location.href){
                            let exp_url = new URL(exp_object.contentWindow.location.href);
                            let exp_title = exp_object.contentWindow.document.title.replace(" / X", "");
                            //console.log(`${exp_url.pathname}${exp_url.search}`);
                            element.setAttribute("opd_explore_path", `${exp_url.pathname}${exp_url.search}`);
                            exp_old_url = exp_object.contentWindow.location.href;
                            element.setAttribute("opd_explore_title", exp_title);
                            set_explore_column_title(element, `${exp_url.pathname}${exp_url.search}`);
                            apply_column_iframe_styles(element);
                            //console.log(exp_title);
                            column_settings_save("", last_load_profile);
                        }
                    });
                    exp_observer.observe(exp_object.contentWindow.document, {childList: true, subtree: true});
        })
    }
    //メインバーイベント
    document.getElementById("init_settings").addEventListener("click", function(){
        chrome.storage.local.remove("opd_settings", function(value){
            alert(i18n_message("msg_settings_reset_completed"));
        });
    });
    //画像付きを開いた時の自動スクロール阻止
    document.querySelector("#main_rack_element").addEventListener("scrollend", function(){
        document.querySelector("#main_rack_element").scrollTop = 0;
    })
    //二段表示
    document.getElementById("second_rack").addEventListener("click", function(){
        if(second_rack_mode == false){
            //document.querySelector("#main_rack_element").style.height = "50vh";
            document.querySelector("#first_rack_element").style.height = "50vh";
            document.querySelector("#second_rack_element").style.height = "50vh";
            //console.log(default_element.second_empty_column)
            //const second_rack_empty_html = `<section draggable="false" id="column_%column_num%" class="dsp_column dsp_column_second_emptycolumn"><div opd_column_type="second_empty_column" style="height: calc(100% - 20px);min-width: 30rem;display: flex;align-items: center;justify-content: center;"><p>2段目<br>${i18n_message("ui_second_empty_column_message")}</p></div></section>`;
            const second_rack_default_html = fill_column_template(default_element.second_empty_column.html, {column_num: create_random_id(), column_width_attr: "inherit"});
            document.querySelector("#second_rack_element").insertAdjacentHTML("beforeend", second_rack_default_html);
            /*for (let index = 0; index < document.querySelectorAll('.dsp_column[draggable="true"]').length; index++) {
                document.querySelectorAll('.dsp_column[draggable="true"]')[index].style.height = "calc(100% - 25px)";
            }*/
            //document.querySelector("style[second_column_css]").textContent = `.dsp_column[draggable="true"]{height:calc(100% - 25px)}`;
            //document.querySelector(".dsp_column_second_emptycolumn").scrollIntoView({behavior: "smooth",inline: "end"});
            //append_object_css();
            column_dd();
            column_close();
            column_settings_save("", last_load_profile);
            second_rack_mode = true;
            document.querySelector("#second_rack").value = "Single Rack";
            document.querySelector(".dsp_btn_second_rack_img").style.backgroundImage = `url(${chrome.runtime.getURL(ui_icon_define.column_single_rack)})`;
        }else{
            if(confirm(i18n_message("msg_second_rack_to_single_confirm"))){
                //破棄する二段目のカラムの自動更新を止める
                document.querySelectorAll('#second_rack_element div[opd_column_type]').forEach((column_div) => stop_column_auto_reload(column_div));
                document.querySelector("#second_rack_element").textContent = "";
                document.querySelector("style[second_column_css]").textContent = ``;
                document.querySelector("#first_rack_element").style.height = "100vh";
                document.querySelector("#second_rack_element").style.height = "0";
                document.querySelector("#second_rack_element").style.height = "0";
                //append_object_css();
                //column_dd();
                column_settings_save("", last_load_profile);
                second_rack_mode = false;
                document.querySelector("#second_rack").value = "Second Rack";
                document.querySelector(".dsp_btn_second_rack_img").style.backgroundImage = `url(${chrome.runtime.getURL(ui_icon_define.column_second_rack)})`;
            }
        }
        
    });
    //プロファイルローダー
    document.getElementById("profile_load_save").addEventListener("click", function(){
        window.open(chrome.runtime.getURL("profile_debug.html"), "OPD-Profile-Loader", 'width=720, height=600');
    });
    //
    document.getElementById("dnr_reload").addEventListener("click", function(){
        if(confirm(i18n_message("msg_dnr_reload_confirm"))){
            chrome.runtime.sendMessage({message: "dnr_upd"}).then((value)=>{
                if(value == true){
                    location.reload();
                }
            });
        }
    });
    document.getElementById("ext_reload").addEventListener("click", function(){
        if(confirm(i18n_message("msg_extension_reload_confirm"))){
            chrome.runtime.sendMessage({message: "ext_reload"});
        }
    });
    //ポストカラム追加
    //TODO: カラム追加周りの処理をもっと簡略化すること
    document.getElementById("add_post").addEventListener("click", function(){
        const empty_column = document.querySelector(".dsp_column_emptycolumn");
        const first_column = empty_column?.closest('div')?.querySelector('section[draggable="true"]');
        const add_target_column = (is_shift_pressed && first_column) ? first_column : empty_column;

        const new_column = fill_column_template(default_element["post"]["html"], inherit_column_template_values());
        add_target_column.insertAdjacentHTML("beforebegin", new_column);
        add_target_column.scrollIntoView({behavior: "smooth",inline: "end"});
        const all_webview = document.querySelectorAll('#main_rack_element iframe[opd_init_webview]');
        append_object_css("add_column", all_webview);
        column_dd();
        column_close();
        column_settings_save("", last_load_profile);
    });
    //タイムラインカラム追加
    document.getElementById("add_timeline").addEventListener("click", function(){
        const empty_column = document.querySelector(".dsp_column_emptycolumn");
        const first_column = empty_column?.closest('div')?.querySelector('section[draggable="true"]');
        const add_target_column = (is_shift_pressed && first_column) ? first_column : empty_column;
        
        const new_column = fill_column_template(default_element["home"]["html"], inherit_column_template_values());
        add_target_column.insertAdjacentHTML("beforebegin", new_column);
        add_target_column.scrollIntoView({behavior: "smooth",inline: "end"});
        const all_webview = document.querySelectorAll('#main_rack_element iframe[opd_init_webview]');
        append_object_css("add_column", all_webview);
        column_dd();
        column_close();
        column_settings_save("", last_load_profile);
    });
    //通知カラム追加
    document.getElementById("add_notify").addEventListener("click", function(){
        const empty_column = document.querySelector(".dsp_column_emptycolumn");
        const first_column = empty_column?.closest('div')?.querySelector('section[draggable="true"]');
        const add_target_column = (is_shift_pressed && first_column) ? first_column : empty_column;
        
        const new_column = fill_column_template(default_element["notification"]["html"], inherit_column_template_values());
        add_target_column.insertAdjacentHTML("beforebegin", new_column);
        add_target_column.scrollIntoView({behavior: "smooth",inline: "end"});
        const all_webview = document.querySelectorAll('#main_rack_element iframe[opd_init_webview]');
        append_object_css("add_column", all_webview);
        column_dd();
        column_close();
        column_settings_save("", last_load_profile);
    });
    //Explore系カラム追加(Explore本体・リストカラムの共通処理)。insert_first が真なら末尾ではなく先頭に追加する
    function add_explore_column(initial_path, insert_first = is_shift_pressed){
        add_explore_columns([initial_path], insert_first);
    }
    //Explore系カラムをパス配列からまとめて追加する
    //initial_paths: 各カラムが初期表示するパスの配列(配列の順序どおりに並ぶ)、insert_first: 真なら末尾ではなく先頭に追加する
    //全カラムのHTMLを1回のinsertAdjacentHTMLで挿入し、挿入後の後処理(iframeへのCSS適用・ドラッグ登録・閉じるボタン登録・設定保存)は追加件数に依らずそれぞれ1回だけ実行する
    //initial_paths が空の場合は何もしない
    function add_explore_columns(initial_paths, insert_first = is_shift_pressed){
        if(initial_paths.length === 0) return;
        const empty_column = document.querySelector(".dsp_column_emptycolumn");
        const first_column = empty_column?.closest('div')?.querySelector('section[draggable="true"]');
        const add_target_column = (insert_first && first_column) ? first_column : empty_column;
        
        let new_columns = "";
        for (let index = 0; index < initial_paths.length; index++) {
            new_columns += fill_column_template(default_element["explore"]["html"], {
                ...inherit_column_template_values(),
                column_title: get_explore_column_title(initial_paths[index]),
                column_save_path: initial_paths[index],
            });
        }
        add_target_column.insertAdjacentHTML("beforebegin", new_columns);
        add_target_column.scrollIntoView({behavior: "smooth",inline: "end"});
        const all_webview = document.querySelectorAll('#main_rack_element iframe[opd_init_webview]');
        append_object_css("add_column", all_webview);
        column_dd();
        column_close();
        column_settings_save("", last_load_profile);
    }
    //リストカラム複数追加の選択ダイアログを開く
    //insert_first: 追加するカラムを末尾ではなく先頭に入れる場合は true、opener_element: ダイアログを閉じたときにフォーカスを戻す要素
    //#opd_main_element の直下にオーバーレイ #opd_list_picker_overlay を1つだけ生成する(既に開いている場合は生成しない)。オーバーレイは role="dialog" aria-modal="true" のダイアログ本体を持ち、ダイアログは閲覧領域・選択領域・操作ボタンで構成する:
    //  閲覧領域:
    //  ・リスト一覧を表示するユーザー名の入力欄と表示ボタン
    //  ・表示状態の表示(loading / not_detected / error / login_required / cell_unresolved)
    //  ・X のリスト一覧ページ(https://x.com/<screen_name>/lists)を表示する iframe。ページ内の左ナビ(header[role="banner"])は隠し、それ以外は X の画面のまま表示する
    //    [data-testid="primaryColumn"] 配下の listCell へのクリック(左・中・右)と Enter / Space はキャプチャ段階で止めてページ遷移させず、左クリックと Enter / Space はそのリストの選択を切り替える
    //    iframe 内の Esc は、X の画面が処理しなかった(preventDefault されていない)場合にダイアログを閉じる
    //    リスト ID の解決は page world ヘルパー(extensions/list_picker_helper.js)が付ける属性と resolve_list_cell_info で行い、ID を決められないセルを選んだときは状態表示で手動入力を案内する
    //    選択中の listCell には data-opd-list-picker-order 属性(1 始まりの追加順)を付け、iframe に注入した style で枠と順番の数字を重ねる。X の仮想リストでセルが入れ替わるため、属性の付け直しは定期的(400ms)に行う
    //    読み込み中は iframe の上に skeleton を重ね、listCell が描画されたら外す。制限時間(15秒)内に描画されなければ skeleton を外して not_detected を表示する(その後に listCell が描画されたら消す)
    //    対象ページを表示した後に別のパスへ遷移した場合は対象 URL を読み込み直す(2回を超えて繰り返す場合は error を表示して読み込みを止める)。ログイン画面へ飛ばされた場合は読み込みを止めて login_required を表示する
    //    中身を読めない(クロスオリジン等)と分かった iframe は表示したままにせず about:blank に戻し、error を表示する
    //  ・表示中のリストを全て選択するボタン(そのとき ID を決められている listCell を文書順に、未選択のものだけ選択の末尾へ追加する)
    //  選択領域:
    //  ・追加するカラムの順序付き一覧(ol)。項目は追加した順に並び、この並び順のままカラムを追加する。項目のドラッグ&ドロップ(項目の上半分に落とすとその前、下半分に落とすとその後ろ、項目以外の場所に落とすと末尾)と、項目にフォーカスした状態の Alt+↑ / Alt+↓ で1段ずつ並べ替え、各項目の除外ボタンで外せる。並べ替えの結果は選択領域の状態表示(role="status")で知らせる
    //  ・URL か ID の入力欄(textarea)と追加ボタン。1 行 1 件として解釈し、解釈できた行を一覧の末尾へ追加する(既にある項目は追加しない)。解釈できない行は alert で知らせて入力欄に残し、入力欄へフォーカスを戻す。Enter で追加、Shift+Enter で改行
    //  ・追加するカラム件数の表示(一覧の件数に、入力欄に残っている解釈できる未追加の行数を足したもの)と選択解除ボタン
    //  操作ボタン: 追加ボタン・キャンセルボタン。追加時に入力欄へ未追加の文字列が残っていれば先に追加を試み、解釈できない行があれば追加を中止する
    //Esc キー(iframe 内で押した場合を含む。iframe が about:blank や対象外のページを表示しているときも同様)・キャンセルボタン・オーバーレイ背景のクリックで閉じ、閉じるときは待機中のタイマーと iframe の内容を破棄して opener_element にフォーカスを戻す
    //開いているあいだは overlay 以外の #opd_main_element の子要素を inert にして背景を操作対象から外し、閉じるときに解除する(元から inert が付いていた要素は触らない)
    //Tab はダイアログ内のフォーカス可能要素(iframe を含む)を循環させる。iframe 内では X の画面のフォーカス移動に任せる
    //追加時は一覧の並び順のままパスを add_explore_columns に渡す
    //ダイアログ内の要素には .dsp_column クラス・opd_column_type 属性・opd_init_webview 属性・.column_close_btn クラスを付けない(カラムを一括走査するセレクタに拾われるため)
    function open_list_picker_dialog(insert_first, opener_element){
        const main_element = document.getElementById("opd_main_element");
        if(main_element === null) return;
        //既に開いている場合は二重に生成せず、開いているダイアログへフォーカスを移す
        const opened_overlay = document.getElementById("opd_list_picker_overlay");
        if(opened_overlay !== null){
            const opened_dialog = opened_overlay.querySelector(".opd_list_picker_dialog");
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
        const selected_item_selector = ".opd_list_picker_selected_item";

        const overlay = document.createElement("div");
        overlay.id = "opd_list_picker_overlay";
        overlay.className = "opd_dialog_overlay opd_list_picker_overlay";
        //骨格は拡張が持つ静的な文字列だけで組み立てる(X 由来の文字列は生成後に textContent などで入れる)
        overlay.innerHTML = `<div class="opd_dialog opd_list_picker_dialog" role="dialog" aria-modal="true" aria-labelledby="opd_list_picker_title">
        <h2 id="opd_list_picker_title">${i18n_message("ui_list_picker_header")}</h2>
        <div class="opd_list_picker_body">
        <div class="opd_list_picker_browse">
        <div><label for="opd_list_picker_user_input">${i18n_message("ui_list_picker_user_label")}</label> <input class="opd_list_picker_user_input" id="opd_list_picker_user_input" type="text"> <input class="opd_list_picker_show_btn" type="button" value="${i18n_message("ui_list_picker_show_button")}"></div>
        <div class="opd_list_picker_status" role="status" aria-live="polite"></div>
        <div class="opd_list_picker_frame_wrap"><iframe class="opd_list_picker_frame" title="${i18n_message("ui_list_picker_frame_title")}"></iframe><div class="opd_list_picker_frame_skeleton" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div></div>
        <div><input class="opd_list_picker_select_all" type="button" value="${i18n_message("ui_list_picker_select_all")}"></div>
        </div>
        <div class="opd_list_picker_selection">
        <h3 id="opd_list_picker_selection_title">${i18n_message("ui_list_picker_selection_header")}</h3>
        <p class="opd_list_picker_selection_hint" id="opd_list_picker_selection_hint">${i18n_message("ui_list_picker_selection_hint")}</p>
        <div class="opd_list_picker_selected_wrap"><ol class="opd_list_picker_selected" aria-labelledby="opd_list_picker_selection_title" aria-describedby="opd_list_picker_selection_hint"></ol><p class="opd_list_picker_empty">${i18n_message("ui_list_picker_empty_selection")}</p></div>
        <div class="opd_list_picker_selection_status" role="status" aria-live="polite"></div>
        <div><label for="opd_list_picker_manual_input">${i18n_message("ui_list_picker_manual_label")}</label><div class="opd_list_picker_manual_row"><textarea class="opd_list_picker_manual" id="opd_list_picker_manual_input" rows="2"></textarea><input class="opd_list_picker_manual_add_btn" type="button" value="${i18n_message("ui_list_picker_manual_add_button")}"></div></div>
        <div class="opd_list_picker_count" id="opd_list_picker_count"></div>
        <div><input class="opd_list_picker_clear_all" type="button" value="${i18n_message("ui_list_picker_clear_all")}"></div>
        </div>
        </div>
        <div class="opd_list_picker_actions"><input class="opd_list_picker_add_btn" type="button" aria-describedby="opd_list_picker_count" value="${i18n_message("ui_list_picker_add_button")}"><input class="opd_list_picker_cancel_btn" type="button" value="${i18n_message("ui_list_picker_cancel_button")}"></div>
        </div>`;
        main_element.appendChild(overlay);
        //ダイアログを開いているあいだは背景を操作対象から外す(元から inert のものは対象にしない)
        const release_inert = set_inert_except(main_element, overlay);
        //オーバーレイが close_dialog を経由せず外された場合でも、閉じるときの後始末を必ず通す
        const overlay_observer = new MutationObserver(function(){
            if(overlay.isConnected) return;
            close_dialog();
        });
        overlay_observer.observe(main_element, {childList: true});

        const dialog = overlay.querySelector(".opd_list_picker_dialog");
        const user_input = overlay.querySelector(".opd_list_picker_user_input");
        const show_btn = overlay.querySelector(".opd_list_picker_show_btn");
        const status_area = overlay.querySelector(".opd_list_picker_status");
        const frame = overlay.querySelector(".opd_list_picker_frame");
        const frame_skeleton = overlay.querySelector(".opd_list_picker_frame_skeleton");
        const select_all_btn = overlay.querySelector(".opd_list_picker_select_all");
        const selected_list = overlay.querySelector(".opd_list_picker_selected");
        const selected_wrap = overlay.querySelector(".opd_list_picker_selected_wrap");
        const empty_message = overlay.querySelector(".opd_list_picker_empty");
        const selection_status_area = overlay.querySelector(".opd_list_picker_selection_status");
        const manual_textarea = overlay.querySelector(".opd_list_picker_manual");
        const manual_add_btn = overlay.querySelector(".opd_list_picker_manual_add_btn");
        const count_area = overlay.querySelector(".opd_list_picker_count");
        const clear_all_btn = overlay.querySelector(".opd_list_picker_clear_all");
        const add_btn = overlay.querySelector(".opd_list_picker_add_btn");
        const cancel_btn = overlay.querySelector(".opd_list_picker_cancel_btn");

        //追加するカラムの並び。要素は {path: カラムの初期パス, name: 表示名(不明なら空文字)}。path で一意にし、配列の順序がそのままカラムの順序になる
        const selected_entries = [];
        //クリック・キー入力の捕捉を登録済みの iframe の Document
        const frame_documents_prepared = new WeakSet();
        //iframe の Document ごとのヘルパー注入の失敗回数。上限を超えたら注入をやり直さない
        const helper_inject_failures = new WeakMap();
        let frame_poll_timer = null;
        let frame_load_started_at = 0;
        let is_frame_loading = false;
        //本文のある document を一度でも読めたか(打ち切り時に未検出とエラーを区別する)
        let has_frame_document = false;
        //今回の表示対象のパス(小文字)と、その URL
        let frame_expected_path = "";
        let frame_url = "";
        //対象ページを一度表示したか。表示後に別のパスへ遷移したときの読み込み直しの判定に使う
        let has_frame_reached_page = false;
        let frame_recover_count = 0;
        //背景クリック判定用。押下と離上の両方が背景で起きたときだけ閉じる
        let is_overlay_mousedown = false;
        let is_overlay_mouseup = false;
        //ドラッグ中の項目のパス
        let dragging_path = null;
        //名前の補完で一覧を描き直す必要があるが、ドラッグ中のため見送っている
        let is_selection_render_pending = false;

        //リストのパスから ID を取り出す(/i/lists/<id> の形のときだけ。それ以外は null)
        function list_id_of_path(list_path){
            const match = list_path.match(/^\/i\/lists\/(\d+)$/);
            return match ? match[1] : null;
        }
        //項目の表示名。名前が不明なら ID から補い、それも無ければパスをそのまま使う
        function display_name_of(entry){
            if(entry.name !== "") return entry.name;
            const list_id = list_id_of_path(entry.path);
            return list_id !== null ? i18n_message("ui_list_picker_list_fallback_name", [list_id]) : entry.path;
        }
        function entry_index_of(list_path){
            return selected_entries.findIndex((entry) => entry.path === list_path);
        }
        //末尾へ追加する。既にある場合は追加せず false を返す
        function add_entry(list_path, list_name){
            if(entry_index_of(list_path) !== -1) return false;
            selected_entries.push({path: list_path, name: list_name});
            return true;
        }
        function toggle_entry(list_path, list_name){
            const index = entry_index_of(list_path);
            if(index === -1){
                selected_entries.push({path: list_path, name: list_name});
                return;
            }
            selected_entries.splice(index, 1);
        }
        //from_index の項目を取り除いてから to_index の位置に入れ直す。位置が変わらない場合は false を返す
        function move_entry(from_index, to_index){
            if(from_index < 0 || from_index >= selected_entries.length) return false;
            const clamped_to = Math.max(0, Math.min(to_index, selected_entries.length - 1));
            if(clamped_to === from_index) return false;
            const [moved] = selected_entries.splice(from_index, 1);
            selected_entries.splice(clamped_to, 0, moved);
            return true;
        }
        //追加ボタンは入力欄に残った文字列も追加するため、件数には解釈できる未追加の行も含める
        function update_count(){
            const pending_paths = parse_manual_list_entries(manual_textarea.value).paths.filter((list_path) => entry_index_of(list_path) === -1);
            count_area.textContent = i18n_message("ui_list_picker_selected_count", [String(selected_entries.length + pending_paths.length)]);
        }
        //選択領域の順序付き一覧を描き直す。フォーカスが一覧の中にあった場合は同じ項目(または同じ項目の除外ボタン)へ戻す
        function render_selection(){
            const active_element = document.activeElement;
            const active_item = (active_element !== null && selected_list.contains(active_element)) ? active_element.closest(selected_item_selector) : null;
            const active_path = active_item === null ? null : active_item.getAttribute("data-list-path");
            const is_active_remove_btn = active_element !== null && active_element.classList.contains("opd_list_picker_remove_btn");
            const saved_scroll_top = selected_wrap.scrollTop;
            is_selection_render_pending = false;
            //項目を作り直すとドラッグ中の項目が外れて dragend が届かないため、先にドラッグ状態を戻す
            end_drag();
            selected_list.textContent = "";
            selected_entries.forEach((entry, index) => {
                const item = document.createElement("li");
                item.className = "opd_list_picker_selected_item";
                item.draggable = true;
                item.tabIndex = 0;
                item.setAttribute("data-list-path", entry.path);
                const handle = document.createElement("span");
                handle.className = "opd_list_picker_drag_handle";
                handle.setAttribute("aria-hidden", "true");
                handle.textContent = "⋮⋮";
                const order = document.createElement("span");
                order.className = "opd_list_picker_order";
                order.textContent = `${index + 1}.`;
                const name = document.createElement("span");
                name.className = "opd_list_picker_selected_name";
                name.textContent = display_name_of(entry);
                const remove_btn = document.createElement("button");
                remove_btn.type = "button";
                remove_btn.className = "opd_list_picker_remove_btn";
                remove_btn.textContent = "×";
                remove_btn.setAttribute("aria-label", i18n_message("ui_list_picker_remove_button", [display_name_of(entry)]));
                remove_btn.title = remove_btn.getAttribute("aria-label");
                item.appendChild(handle);
                item.appendChild(order);
                item.appendChild(name);
                item.appendChild(remove_btn);
                selected_list.appendChild(item);
            });
            empty_message.hidden = selected_entries.length !== 0;
            selected_wrap.scrollTop = saved_scroll_top;
            update_count();
            if(active_path === null) return;
            //除外などで項目が無くなった場合のフォーカス先は呼び出し側で決める
            const restored_item = find_selected_item(active_path);
            if(restored_item === null) return;
            (is_active_remove_btn ? restored_item.querySelector(".opd_list_picker_remove_btn") : restored_item).focus();
        }
        function find_selected_item(list_path){
            const items = selected_list.querySelectorAll(selected_item_selector);
            for (let index = 0; index < items.length; index++) {
                if(items[index].getAttribute("data-list-path") === list_path) return items[index];
            }
            return null;
        }
        //項目を to_index へ動かし、動いた場合は描き直して結果を知らせる
        function move_entry_and_render(list_path, to_index){
            const from_index = entry_index_of(list_path);
            if(from_index === -1 || !move_entry(from_index, to_index)) return;
            render_selection();
            mark_frame_cells();
            const new_index = entry_index_of(list_path);
            selection_status_area.textContent = i18n_message("ui_list_picker_moved", [display_name_of(selected_entries[new_index]), String(new_index + 1)]);
        }
        //ドラッグ中の項目の落とし先を消す
        function clear_drop_marks(){
            selected_list.querySelectorAll(selected_item_selector).forEach((item) => {
                item.classList.remove("opd_list_picker_drop_before", "opd_list_picker_drop_after");
            });
        }
        //ドラッグ中の状態を戻す。項目の描き直しやドロップで元の項目が外れると dragend が一覧まで届かないため、描き直しとドロップの時にも呼ぶ
        function end_drag(){
            dragging_path = null;
            clear_drop_marks();
            selected_list.querySelectorAll(selected_item_selector).forEach((item) => item.classList.remove("opd_list_picker_dragging"));
        }
        //ドラッグイベントの位置から落とし先を求める。項目の上半分なら {index: その項目の位置, is_after: false}、下半分なら is_after: true、項目の外なら末尾
        function drop_target_from_event(event){
            const item = event.target instanceof Element ? event.target.closest(selected_item_selector) : null;
            if(item === null) return {index: selected_entries.length - 1, is_after: true};
            const rect = item.getBoundingClientRect();
            return {index: entry_index_of(item.getAttribute("data-list-path")), is_after: event.clientY > rect.top + rect.height / 2};
        }
        //落とし先を並び替え後の位置に変換する(取り除いた分だけ手前へ詰める)
        function insert_index_of_drop(from_index, drop_target){
            let to_index = drop_target.is_after ? drop_target.index + 1 : drop_target.index;
            if(from_index < to_index) to_index--;
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
        //documentElement の data-opd-list-picker-helper 属性が既にある document には注入しない(Document ごとに1回)
        //head が無い場合は何もしない(次回のポーリングで再試行する)
        //注入時は属性を "loading" にし、ヘルパー自身が読み込み完了時に属性を "ready" へ更新する
        //script の error と注入時の例外は失敗回数が3回に達するまで属性を削除して再試行し(合計3回試行)、3回目の失敗で属性を "failed" にする
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
        //ヘルパーが準備できていれば listCell へのリスト ID 付与を依頼する(走査は同期的に終わる)
        function request_helper_scan(frame_document){
            if(frame_document.documentElement?.getAttribute("data-opd-list-picker-helper") !== "ready") return;
            frame_document.dispatchEvent(new CustomEvent("opd_list_picker_scan"));
        }
        //iframe の document に、左ナビを隠し選択中のセルに枠と順番を重ねる style を入れる(Document ごとに1回)。色はダイアログ側の token と同じ値を使う
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
        //iframe の document に listCell のクリック・キー入力の捕捉を登録する(Document ごとに1回)
        function prepare_frame_document(frame_document){
            if(frame_documents_prepared.has(frame_document)) return;
            frame_documents_prepared.add(frame_document);
            frame_document.addEventListener("click", on_frame_click, true);
            frame_document.addEventListener("auxclick", on_frame_click, true);
            frame_document.addEventListener("keydown", on_frame_keydown, true);
            frame_document.addEventListener("keydown", on_frame_escape);
        }
        //iframe 内のイベントの発生元から、それを含む listCell を返す(無ければ null)
        //iframe の要素は別 realm のため instanceof では判定できず、closest を持つかで要素かどうかを見る
        function list_cell_of_event(event){
            const target = event.target;
            if(!target || typeof target.closest !== "function") return null;
            return target.closest(list_cell_selector);
        }
        //listCell 内のクリックはページ遷移させず、左クリックだけ選択の切り替えにする
        function on_frame_click(event){
            const cell = list_cell_of_event(event);
            if(cell === null) return;
            event.preventDefault();
            event.stopPropagation();
            if(event.type !== "click" || event.button !== 0) return;
            toggle_cell(cell);
        }
        //iframe 内の Esc でもダイアログを閉じる。X の画面がオーバーレイを閉じるなどで Esc を処理した(preventDefault した)場合はそちらを優先する
        function on_frame_escape(event){
            if(event.key !== "Escape" || event.defaultPrevented) return;
            event.preventDefault();
            close_dialog();
        }
        //listCell 上の Enter / Space はページ遷移させず選択の切り替えにする
        function on_frame_keydown(event){
            if(event.key !== "Enter" && event.key !== " ") return;
            const cell = list_cell_of_event(event);
            if(cell === null) return;
            event.preventDefault();
            event.stopPropagation();
            if(event.repeat) return;
            toggle_cell(cell);
        }
        //セルのリストを選択に加える(既にあれば外す)。ID を決められないセルは手動入力を案内する
        function toggle_cell(cell){
            const frame_document = cell.ownerDocument;
            request_helper_scan(frame_document);
            const cell_info = resolve_list_cell_info(cell, frame_document.location.href);
            if(cell_info === null){
                status_area.textContent = i18n_message("ui_list_picker_cell_unresolved");
                return;
            }
            toggle_entry(`/i/lists/${cell_info.id}`, cell_info.name);
            //直前の未解決の案内は最新の操作の結果に置き換える
            status_area.textContent = "";
            render_selection();
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
        //iframe に表示中の listCell に選択の順番を属性で付け直す。手動入力で名前が無かった項目はセルから名前を補う
        function mark_frame_cells(){
            const frame_document = get_frame_document();
            if(!frame_document) return;
            const order_by_path = new Map();
            selected_entries.forEach((entry, index) => order_by_path.set(entry.path, index + 1));
            frame_document.querySelectorAll(list_cell_selector).forEach((cell) => {
                const cell_info = resolve_list_cell_info(cell, frame_document.location.href);
                const order = cell_info === null ? undefined : order_by_path.get(`/i/lists/${cell_info.id}`);
                if(order === undefined){
                    cell.removeAttribute("data-opd-list-picker-order");
                    return;
                }
                cell.setAttribute("data-opd-list-picker-order", String(order));
                const entry = selected_entries[order - 1];
                if(entry.name === "" && cell_info.name !== ""){
                    entry.name = cell_info.name;
                    is_selection_render_pending = true;
                }
            });
            //ドラッグ中に項目を作り直すとドラッグが途切れるため、名前の補完による描き直しはドラッグが終わった後の呼び出しまで持ち越す
            if(is_selection_render_pending && dragging_path === null) render_selection();
        }
        function stop_frame_poll(){
            if(frame_poll_timer !== null){
                clearInterval(frame_poll_timer);
                frame_poll_timer = null;
            }
        }
        //対象 URL を読み込み(直し)、skeleton を表示する
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
        //指定ユーザーのリスト一覧ページを iframe に表示し、定期的に listCell へ選択の順番を付け直す
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
            //対象ページ以外(ログイン画面など)を表示しているあいだも Esc で閉じられるよう、読める document には先に捕捉を登録する
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
            //リスト一覧ページを表示できたら style とヘルパーを入れる(入れ済みの document では何もしない)
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
        //ユーザー名入力欄の値から表示を始める。リスト一覧ページのパスに解決できない入力は受け付けない
        function start_frame_from_input(){
            const resolved_path = resolve_list_column_path(user_input.value);
            const user_lists_match = (resolved_path ?? "").match(/^\/([A-Za-z0-9_]{1,15})\/lists$/);
            if(!user_lists_match){
                alert(i18n_message("msg_list_picker_user_required"));
                user_input.focus();
                return;
            }
            start_frame(user_lists_match[1]);
        }
        //読み込んだ document の中身を読めない(別オリジンなど)場合は、読み込み中かどうかに関わらずエラーとして終了する
        //読める document には、対象ページかどうかに関わらず(about:blank でも)Esc を受け取れるよう捕捉を登録する
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
        //入力欄の各行を解釈して一覧の末尾へ追加する。解釈できない行があれば入力欄に残して知らせ、false を返す
        function add_manual_entries(){
            const manual_entries = parse_manual_list_entries(manual_textarea.value);
            manual_entries.paths.forEach((list_path) => add_entry(list_path, ""));
            render_selection();
            mark_frame_cells();
            if(manual_entries.invalid.length > 0){
                manual_textarea.value = manual_entries.invalid.join("\n");
                alert(i18n_message("msg_list_picker_invalid_manual", [manual_entries.invalid.join("\n")]));
                manual_textarea.focus();
                return false;
            }
            manual_textarea.value = "";
            return true;
        }
        //一覧の並び順のままカラムをまとめて追加する。入力欄に未追加の文字列が残っていれば先に追加を試みる
        function add_selected_columns(){
            if(manual_textarea.value.trim() !== "" && !add_manual_entries()) return;
            if(selected_entries.length === 0){
                alert(i18n_message("msg_list_picker_nothing_selected"));
                manual_textarea.focus();
                return;
            }
            const paths = selected_entries.map((entry) => entry.path);
            if(paths.length > many_columns_threshold && !confirm(i18n_message("msg_list_picker_many_columns_confirm", [String(paths.length)]))) return;
            close_dialog();
            add_explore_columns(paths, insert_first);
        }

        show_btn.addEventListener("click", start_frame_from_input);
        user_input.addEventListener("keydown", function(event){
            if(event.key !== "Enter") return;
            event.preventDefault();
            start_frame_from_input();
        });
        //そのとき ID を決められている表示中の listCell を文書順に、未選択のものだけ末尾へ追加する(枠と順番を重ねられるセル由来のものに限る)
        select_all_btn.addEventListener("click", function(){
            const frame_document = get_frame_document();
            if(!frame_document) return;
            request_helper_scan(frame_document);
            frame_document.querySelectorAll(list_cell_selector).forEach((cell) => {
                const cell_info = resolve_list_cell_info(cell, frame_document.location.href);
                if(cell_info !== null) add_entry(`/i/lists/${cell_info.id}`, cell_info.name);
            });
            render_selection();
            mark_frame_cells();
        });
        clear_all_btn.addEventListener("click", function(){
            selected_entries.length = 0;
            render_selection();
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
        //一覧の項目は除外ボタンのクリックで外す
        selected_list.addEventListener("click", function(event){
            const remove_btn = event.target instanceof Element ? event.target.closest(".opd_list_picker_remove_btn") : null;
            if(remove_btn === null) return;
            const item = remove_btn.closest(selected_item_selector);
            const index = entry_index_of(item.getAttribute("data-list-path"));
            if(index === -1) return;
            selected_entries.splice(index, 1);
            render_selection();
            mark_frame_cells();
            //フォーカスは同じ位置(末尾を外した場合は新しい末尾)の除外ボタンへ移し、項目が無くなれば入力欄へ移す
            const next_entry = selected_entries[Math.min(index, selected_entries.length - 1)];
            const next_item = next_entry === undefined ? null : find_selected_item(next_entry.path);
            (next_item === null ? manual_textarea : next_item.querySelector(".opd_list_picker_remove_btn")).focus();
        });
        //項目にフォーカスした状態の Alt+↑ / Alt+↓ で1段ずつ動かす
        selected_list.addEventListener("keydown", function(event){
            if(!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
            const item = event.target instanceof Element ? event.target.closest(selected_item_selector) : null;
            if(item === null) return;
            event.preventDefault();
            const list_path = item.getAttribute("data-list-path");
            const from_index = entry_index_of(list_path);
            if(from_index === -1) return;
            move_entry_and_render(list_path, event.key === "ArrowUp" ? from_index - 1 : from_index + 1);
        });
        selected_list.addEventListener("dragstart", function(event){
            const item = event.target instanceof Element ? event.target.closest(selected_item_selector) : null;
            if(item === null) return;
            dragging_path = item.getAttribute("data-list-path");
            event.dataTransfer.effectAllowed = "move";
            //text/plain にすると入力欄へ落としたときに文字列が入るため、独自の type だけを持たせる(Firefox はデータが無いとドラッグを始めない)
            event.dataTransfer.setData("application/x-opd-list-picker", dragging_path);
            item.classList.add("opd_list_picker_dragging");
        });
        selected_list.addEventListener("dragend", end_drag);
        //落とし先の目印は一覧の枠(項目の外)でも出す
        selected_wrap.addEventListener("dragover", function(event){
            if(dragging_path === null) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            clear_drop_marks();
            const drop_target = drop_target_from_event(event);
            if(drop_target.index === -1) return;
            const target_item = find_selected_item(selected_entries[drop_target.index].path);
            if(target_item === null || target_item.getAttribute("data-list-path") === dragging_path) return;
            target_item.classList.add(drop_target.is_after ? "opd_list_picker_drop_after" : "opd_list_picker_drop_before");
        });
        selected_wrap.addEventListener("dragleave", function(event){
            if(event.relatedTarget instanceof Node && selected_wrap.contains(event.relatedTarget)) return;
            clear_drop_marks();
        });
        selected_wrap.addEventListener("drop", function(event){
            if(dragging_path === null) return;
            event.preventDefault();
            const dropped_path = dragging_path;
            end_drag();
            const drop_target = drop_target_from_event(event);
            const from_index = entry_index_of(dropped_path);
            if(from_index === -1 || drop_target.index === -1) return;
            move_entry_and_render(dropped_path, insert_index_of_drop(from_index, drop_target));
        });
        add_btn.addEventListener("click", add_selected_columns);
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
        frame.addEventListener("load", on_frame_load);
        //初期状態の about:blank でも iframe にフォーカスしたときに Esc を受け取れるようにする
        const initial_frame_document = get_frame_document();
        if(initial_frame_document !== null) prepare_frame_document(initial_frame_document);

        set_frame_loading(false);
        render_selection();
        user_input.focus();
        //ログイン中のユーザーが分かればそのままリスト一覧を表示する
        const login_screen_name = get_login_screen_name();
        if(login_screen_name !== null){
            user_input.value = login_screen_name;
            start_frame(login_screen_name);
        }else{
            status_area.textContent = i18n_message("ui_list_picker_not_detected");
        }
    }
    //Explore(ユニバーサル)カラム追加
    document.getElementById("add_explore").addEventListener("click", function(){
        add_explore_column("/explore");
    });
    //リストカラム追加(Exploreカラムの派生。ログインユーザーのリスト一覧を初期表示する)
    document.getElementById("add_list").addEventListener("click", function(){
        //prompt 表示中は keyup を取りこぼすため、先頭追加(Shift)の判定はダイアログを開く前に確定する
        const insert_first = is_shift_pressed;
        const screen_name = get_login_screen_name();
        let list_path = null;
        if(screen_name){
            list_path = `/${screen_name}/lists`;
        }else{
            const input = prompt(i18n_message("msg_list_column_path_prompt"));
            if(input === null) return;
            list_path = resolve_list_column_path(input);
            if(list_path === null){
                alert(i18n_message("msg_invalid_value_alert"));
                return;
            }
        }
        add_explore_column(list_path, insert_first);
    });
    //リストカラム複数追加(選択ダイアログを開く)。ダイアログ表示中は keyup を取りこぼすため、先頭追加(Shift)の判定はダイアログを開く前に確定する
    document.getElementById("add_list_multi").addEventListener("click", function(){
        open_list_picker_dialog(is_shift_pressed, this);
    });
    //ボタンとして振る舞わせるため、Enter と Space でもダイアログを開く
    document.getElementById("add_list_multi").addEventListener("keydown", function(event){
        if(event.repeat) return;
        if(event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        open_list_picker_dialog(is_shift_pressed, this);
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
    document.getElementById("profile_save").addEventListener("click", function(){
        if(confirm(i18n_message("msg_profile_save_confirm"))){
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
        }
    });
    //プロファイル削除ボタン
    document.getElementById("profile_delete").addEventListener("click", function(){
        const delete_num = Number(prompt(i18n_message("msg_profile_delete_number_prompt")));
        if(last_load_profile != delete_num){
            if(confirm(i18n_message("msg_profile_delete_confirm", [delete_num]))){
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
            alert(i18n_message("msg_profile_delete_current_alert"));
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

            if(column_type === "post"){
                const ext_text_review = new OpdExtTextReview();
                const ui_lang = chrome.i18n.getUILanguage();
                ext_text_review.Init(column_frame, ui_icon_define, ui_lang);
            }

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
    function column_dd(){
        let column_class = document.querySelectorAll(".dsp_column");
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
                this.style.borderLeft = '15px solid #2e2e2e';
            });
            column_class[index].addEventListener("dragleave", function(){
                this.style.borderLeft = '';
            });
            column_class[index].addEventListener("drop", function(ev){
                ev.preventDefault();
                const dt_id = ev.dataTransfer.getData('text/plain');
                const dr_elem = document.getElementById(dt_id);
                if(dr_elem != null){
                    if(dr_elem?.querySelector("div")?.getAttribute("opd_column_type") == 'explore'){
                        let reload_path = "";
                        if(dr_elem.querySelector("div").getAttribute("opd_pinned_path") != ""){
                            reload_path = dr_elem.querySelector("div").getAttribute("opd_pinned_path");
                        }else{
                            reload_path = dr_elem.querySelector("div").getAttribute("opd_explore_path");
                        }
                        dr_elem.querySelector("div").querySelector("iframe").src = `https://x.com${reload_path}`;
                        set_explore_column_title(dr_elem.querySelector("div"), reload_path);
                    }
                    this.parentNode.insertBefore(dr_elem, this);
                    this.style.borderLeft = '';
                    column_settings_save("", last_load_profile);
                }else{
                    this.style.borderLeft = '';
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
                close_btns[index].addEventListener("click", function(){
                const target_column = this.closest(".dsp_column");
                const pin_checkbox = target_column.querySelector(".opd_pinned_btn")?.checked;
                if(pin_checkbox == false || pin_checkbox == undefined){
                    stop_column_auto_reload(target_column.querySelector("div[opd_column_type]"));
                    target_column.remove();
                    append_object_css();
                    column_settings_save("", last_load_profile);
                }else{
                    if(confirm(i18n_message("msg_pinned_column_close_confirm"))){
                        stop_column_auto_reload(target_column.querySelector("div[opd_column_type]"));
                        target_column.remove();
                        append_object_css();
                        column_settings_save("", last_load_profile);
                    }
                }
            })
        }
    }
    //===== 全体設定: run() スコープの処理 (global_settings / column_settings_save / last_load_profile / profile_store を参照する) =====
    //全体設定の適用対象カラム (post / home / notification / explore) を返す。構造用カラムは含めない
    function get_settings_target_columns(){
        return document.querySelectorAll('#opd_main_element div[opd_column_type="post"], #opd_main_element div[opd_column_type="home"], #opd_main_element div[opd_column_type="notification"], #opd_main_element div[opd_column_type="explore"]');
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
    //カラム追加時のテンプレート値。個別値はすべて "inherit" にし、チェック状態・幅・秒数は全体設定の値をそのまま使う
    function inherit_column_template_values(){
        return {
            column_num: create_random_id(),
            column_banner_ch: global_settings.banner ? "checked" : "",
            column_top_bar_ch: global_settings.top_visible ? "checked" : "",
            column_pinned_ch: global_settings.pinned ? "checked" : "",
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
            column_title: "",
        };
    }
    //カラム設定パネルの HTML を種別に応じて組み立てる (適用表に無い項目の行はそのカラム種別には出さない)
    //  options.iframe_styles: バナー表示 (select .opd_banner_mode)・トップ表示 (select .opd_top_visible_mode)・表示モード (select .opd_tw_view_mode: inherit/0/1/2) の行を含めるか
    //  options.auto_reload:   自動更新 (select .opd_a_reload_mode: inherit/true/false) と間隔 (checkbox .opd_a_reload_time_inherit + number .opd_a_reload_time_setting、秒単位) の行を含めるか
    //  options.pinned:        ピン止め (select .opd_pinned_mode) の行を含めるか
    //共通行: カラム幅 (select .opd_column_size_preset: inherit/0/1/2/3 と カスタムボタン .column_width_btn)
    //post: {iframe_styles:false, auto_reload:false, pinned:false}、notification: {true, false, false}、home: {true, true, false}、explore: {true, true, true}
    //各 select の inherit 選択肢は value="inherit" で、表示文字列は i18n の ui_settings_inherit_option に現在の全体値の表示名を渡したもの
    function build_column_settings_panel(options){
        //設定行 1 行分 (ラベルと入力) を組み立てる
        function settings_row(label_text, input_html){
            return `<div class="dsp_column_settings_content_div">${label_text}<span>${input_html}</span></div>`;
        }
        //inherit 選択肢を先頭に持つ select を組み立てる
        function settings_select(class_name, key, option_html){
            return `<select class="${class_name}"><option value="inherit">${inherit_option_label(key)}</option>${option_html}</select>`;
        }
        const visible_option_html = `<option value="true">${i18n_message("ui_settings_visible")}</option><option value="false">${i18n_message("ui_settings_hidden")}</option>`;
        let rows_html = "";
        if(options.iframe_styles){
            rows_html += settings_row(i18n_message("ui_settings_view_mode_label"), settings_select("opd_tw_view_mode", "tw_view_mode", `<option value="0">${i18n_message("ui_settings_view_mode_all")}</option><option value="1">${i18n_message("ui_settings_view_mode_text_only")}</option><option value="2">${i18n_message("ui_settings_view_mode_media_only")}</option>`));
        }
        rows_html += settings_row(i18n_message("ui_settings_column_width_label"), settings_select("opd_column_size_preset", "column_width", `<option value="0">${i18n_message("ui_settings_column_width_small")}</option><option value="1">${i18n_message("ui_settings_column_width_medium")}</option><option value="2">${i18n_message("ui_settings_column_width_large")}</option><option value="3">${i18n_message("ui_settings_column_width_custom")}</option>`));
        rows_html += settings_row(i18n_message("ui_settings_column_width_custom_label"), `<input type="button" class="column_width_btn" value="${i18n_message("ui_settings_column_width_custom_button")}" style="vertical-align: text-top;font-size: 0.8rem;"/>`);
        if(options.iframe_styles){
            rows_html += settings_row(i18n_message("ui_settings_banner_label"), settings_select("opd_banner_mode", "banner", visible_option_html));
            rows_html += settings_row(i18n_message("ui_settings_top_label"), settings_select("opd_top_visible_mode", "top_visible", visible_option_html));
        }
        if(options.auto_reload){
            rows_html += settings_row(i18n_message("ui_settings_auto_reload_label"), settings_select("opd_a_reload_mode", "auto_reload", `<option value="true">${i18n_message("ui_settings_enabled")}</option><option value="false">${i18n_message("ui_settings_disabled")}</option>`));
            rows_html += settings_row(i18n_message("ui_settings_auto_reload_interval_label"), `<label><input class="opd_a_reload_time_inherit" type="checkbox">${i18n_message("ui_settings_inherit_checkbox_label")}</label><input class="opd_column_settings_input_text opd_a_reload_time_setting" type="number" min="${AUTO_RELOAD_TIME_MIN_MS / 1000}" max="${AUTO_RELOAD_TIME_MAX_MS / 1000}" value="%column_auto_reload_time%">${i18n_message("ui_settings_seconds_suffix")}`);
        }
        if(options.pinned){
            rows_html += settings_row(i18n_message("ui_settings_pinned_label"), settings_select("opd_pinned_mode", "pinned", `<option value="true">${i18n_message("ui_settings_pinned")}</option><option value="false">${i18n_message("ui_settings_unpinned")}</option>`));
        }
        return `<div class="dsp_column_settings_panel"><div class="dsp_column_settings_panel_content"><h2>${i18n_message("ui_settings_header")}</h2><div class="dsp_column_settings_list">${rows_html}</div><div class="dsp_column_settings_panel_close_btn_wrap"><input type="button" class="dsp_column_settings_panel_close_btn" value="${i18n_message("ui_settings_close_button")}" style="vertical-align: text-top;font-size: 0.8rem;"/></div></div></div>`;
    }
    //カラム設定パネルとカラムバーのイベントを登録する。登録済み (data-opd_settings_initialized="1") なら何もしない
    //  select / 入力の change: 対応する属性を更新 → apply_column_dom_state → (iframe 項目なら) apply_column_iframe_styles → column_settings_save
    //  バーのトグル (.opd_banner / .opd_top_bar) click: 属性 = String(!実効値) → 同上
    //  バーのピン止め (.opd_pinned_btn) click: 既存の confirm を経て opd_setting_pinned = String(!実効値) → reconcile_column_pinned → apply_column_dom_state → column_settings_save
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
        //カラムバーのトグルは実効値を表示しているため、クリックで個別値 = !実効値 を設定する
        function bind_bar_toggle(selector, key){
            const toggle_element = column_div.querySelector(selector);
            if(toggle_element === null) return;
            toggle_element.addEventListener("click", function(){
                column_div.setAttribute(COLUMN_INHERITABLE_SETTINGS[key], String(!effective_column_setting(column_div, key, global_settings)));
                save_column_setting(true);
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
        column_div.querySelector(".column_width_btn")?.addEventListener("click", function(){
            const now_width = effective_column_setting(column_div, "column_width", global_settings);
            const setting_width = prompt(i18n_message("msg_column_width_prompt"), now_width);
            if(setting_width === null) return;
            const setting_width_num = Number(setting_width);
            if(!Number.isFinite(setting_width_num) || setting_width_num < COLUMN_WIDTH_MIN_REM || setting_width_num > COLUMN_WIDTH_MAX_REM){
                alert(i18n_message("msg_invalid_value_alert"));
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
        column_div.querySelector(".opd_a_reload_time_setting")?.addEventListener("change", function(){
            //readonly (全体設定に従う / 自動更新の実行中) のあいだは値を実効値へ戻して受け付けない
            if(this.readOnly){
                this.value = String(effective_column_setting(column_div, "auto_reload_time", global_settings) / 1000);
                return;
            }
            const input_time_ms = Number(this.value) * 1000;
            if(Number.isFinite(input_time_ms) && input_time_ms >= AUTO_RELOAD_TIME_MIN_MS && input_time_ms <= AUTO_RELOAD_TIME_MAX_MS){
                alert(i18n_message("msg_auto_reload_set", [this.value]));
            }else{
                alert(i18n_message("msg_global_settings_invalid_interval"));
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
        //カラムバーのトグル
        bind_bar_toggle(".opd_banner", "banner");
        bind_bar_toggle(".opd_top_bar", "top_visible");
        //カラムバーのピン止めトグル
        column_div.querySelector(".opd_pinned_btn")?.addEventListener("click", function(){
            const is_pinned = effective_column_setting(column_div, "pinned", global_settings) === true;
            if(!confirm(is_pinned ? i18n_message("msg_explore_unpin_confirm") : i18n_message("msg_explore_pin_confirm"))){
                //取り消した場合は表示を実効値へ戻す
                this.checked = is_pinned;
                return;
            }
            column_div.setAttribute("opd_setting_pinned", String(!is_pinned));
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
        }
    }
    //iframe の load を待たずに同期で反映できる項目をカラム div へ適用する
    //  カラム幅: style.width = 実効 rem、幅 select の選択値 (15→0 / 20→1 / 30→2 / inherit→inherit / その他→3)
    //  バーのチェック状態: .opd_banner / .opd_top_bar / .opd_pinned_btn の checked = 実効値
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
        //カラムバーのチェック状態は実効値を表示する
        const banner_checkbox = column_div.querySelector(".opd_banner");
        if(banner_checkbox !== null) banner_checkbox.checked = effective_column_setting(column_div, "banner", global_settings) === true;
        const top_visible_checkbox = column_div.querySelector(".opd_top_bar");
        if(top_visible_checkbox !== null) top_visible_checkbox.checked = effective_column_setting(column_div, "top_visible", global_settings) === true;
        //自動更新間隔の入力欄 (秒)。全体設定に従うあいだと自動更新の実行中は readonly + aria-disabled にして入力を受け付けず、
        //フォーカスと tooltip は残して title で解除条件を示す (native disabled は tooltip が出ずタブ順からも外れるため使わない)
        const reload_time_input = column_div.querySelector(".opd_a_reload_time_setting");
        if(reload_time_input !== null){
            const is_time_inherit = read_column_setting(column_div, "auto_reload_time") === null;
            const is_auto_reload_on = effective_column_setting(column_div, "auto_reload", global_settings) === true;
            const reload_time_inherit_checkbox = column_div.querySelector(".opd_a_reload_time_inherit");
            if(reload_time_inherit_checkbox !== null) reload_time_inherit_checkbox.checked = is_time_inherit;
            reload_time_input.value = String(effective_column_setting(column_div, "auto_reload_time", global_settings) / 1000);
            const is_time_locked = is_time_inherit || is_auto_reload_on;
            reload_time_input.readOnly = is_time_locked;
            reload_time_input.setAttribute("aria-disabled", String(is_time_locked));
            //ロックの理由ごとの解除条件を列挙する (両方でロックされていれば両方を示す)
            const lock_reasons = [];
            if(is_time_inherit) lock_reasons.push(i18n_message("ui_settings_inherit_input_title"));
            if(is_auto_reload_on) lock_reasons.push(i18n_message("ui_settings_auto_reload_interval_locked_title"));
            reload_time_input.title = lock_reasons.join("\n");
        }
        reconcile_column_pinned(column_div);
        apply_column_auto_reload(column_div);
    }
    //iframe 内 head に style 要素 (style[opd_banner_css] / style[opd_top_visible_css] / style[opd_tw_view_mode_css]) を用意し、実効値に応じて COLUMN_IFRAME_CSS の文字列を設定する
    //iframe の contentWindow.document.head が読めない (未生成・クロスオリジン) 場合は何もしない (次回 load で再適用される)
    //post カラムは設定に依らずバナーとトップを常に非表示 (banner_hidden / top_hidden) にし、表示モードは適用しない
    //トップ非表示の CSS はカラム種別と iframe が現在表示しているパスで選ぶ: home カラムは top_hidden_home、explore カラムでリスト系ページを表示中は top_hidden_list (リスト名の見出しを残す)、それ以外は top_hidden
    //explore カラムはページ内遷移で表示パスが変わるため、mutate_url の URL 変化検知からも呼ばれる
    function apply_column_iframe_styles(column_div){
        const column_frame = column_div?.querySelector("iframe");
        if(!column_frame) return;
        let frame_head = null;
        let frame_path = null;
        try{
            frame_head = column_frame.contentWindow?.document?.head ?? null;
            frame_path = column_frame.contentWindow?.location?.pathname ?? null;
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
        //post カラムは設定に依らずバナーとトップを常に隠し、表示モードは適用しない
        if(column_type === "post"){
            banner_style.textContent = COLUMN_IFRAME_CSS.banner_hidden;
            top_visible_style.textContent = COLUMN_IFRAME_CSS.top_hidden;
            tw_view_mode_style.textContent = ``;
            return;
        }
        banner_style.textContent = effective_column_setting(column_div, "banner", global_settings) === true ? `` : COLUMN_IFRAME_CSS.banner_hidden;
        if(effective_column_setting(column_div, "top_visible", global_settings) === true){
            top_visible_style.textContent = ``;
        }else if(column_type === "home"){
            top_visible_style.textContent = COLUMN_IFRAME_CSS.top_hidden_home;
        }else if(column_type === "explore" && is_list_page_path(frame_path)){
            top_visible_style.textContent = COLUMN_IFRAME_CSS.top_hidden_list;
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
    //ピン止めの不変条件「opd_pinned_path が非空 ⇔ 実効ピン止め」を保つ
    //  実効値 = opd_setting_pinned ("inherit" なら global_settings.pinned)
    //  実効 true かつ opd_pinned_path が空: opd_explore_path を opd_pinned_path に記録する
    //  実効 false: opd_pinned_path を "" にする
    //  バーのチェックボックス .opd_pinned_btn の checked を実効値に合わせる
    //explore 以外のカラムでは何もしない。起動・追加・個別変更・全体変更のすべての経路から呼ぶ
    function reconcile_column_pinned(column_div){
        if(column_div == null) return;
        if(column_div.getAttribute("opd_column_type") !== "explore") return;
        const is_pinned = effective_column_setting(column_div, "pinned", global_settings) === true;
        if(is_pinned){
            //実効ピン止めになった時点のパスを記録する
            if((column_div.getAttribute("opd_pinned_path") ?? "") === ""){
                column_div.setAttribute("opd_pinned_path", column_div.getAttribute("opd_explore_path") ?? "");
            }
        }else{
            column_div.setAttribute("opd_pinned_path", "");
        }
        const pinned_checkbox = column_div.querySelector(".opd_pinned_btn");
        if(pinned_checkbox !== null) pinned_checkbox.checked = is_pinned;
    }
    //自動更新 interval を冪等に再構成する: 実効 auto_reload と実効 auto_reload_time (ms) が動作中の interval (iframe 要素の opd_auto_reload_interval_id / opd_auto_reload_interval_ms) と同じなら何もせずカウントダウンを維持し、
    //異なるときだけ既存の interval を clear して作り直す (実効 auto_reload が false なら止めるだけ)
    //interval は毎回、iframe が /home・/search・/i/lists 配下のいずれかを表示していることを確かめ、iframe にマウスが乗っている (auto_reload_mouse_hover が "false" 以外) あいだは何もしない。
    //is_auto_update() がカラム全体の自動更新を許可していれば OpdExtAutoReload の Reload を呼び、その 100ms 後に iframe を先頭までスクロールする
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
            const frame_window = column_frame.contentWindow;
            if(frame_window == null) return;
            let path_name = "";
            try{
                path_name = frame_window.location.pathname;
            }catch(e){
                //別オリジンを表示しているあいだは自動更新しない
                return;
            }
            if(!['/home', '/search'].includes(path_name) && !path_name.startsWith('/i/lists')) return;
            if(column_frame.getAttribute("auto_reload_mouse_hover") != "false") return;
            //カラムの自動更新が全体的に許可されていない場合は自動更新を無効化する
            if(!column_frame.opd_auto_reload || !is_auto_update()) return;
            column_frame.opd_auto_reload.Reload(frame_window);
            setTimeout(() => {
                column_frame.contentWindow?.scrollTo({ top: 0, behavior: 'auto' });
            }, 100);
        }, auto_reload_time);
    }
    //自動更新 interval を止める。カラムを閉じる・二段目を破棄する・プロファイルを切り替える (#opd_main_element を外す) 前に対象カラム全部へ呼ぶ
    function stop_column_auto_reload(column_div){
        const column_frame = column_div?.querySelector("iframe");
        if(!column_frame) return;
        if(column_frame.opd_auto_reload_interval_id == null) return;
        clearInterval(column_frame.opd_auto_reload_interval_id);
        column_frame.opd_auto_reload_interval_id = null;
        column_frame.opd_auto_reload_interval_ms = null;
    }
    //全体設定の変更を全カラムへ反映する: 適用表の対象カラム (post / home / notification / explore) それぞれに apply_column_dom_state と apply_column_iframe_styles を呼び、column_settings_save で保存する
    //構造用カラム (main_bar_empty_column / empty_column / second_empty_column / dsp_column) には触れない
    function apply_global_settings_to_columns(){
        get_settings_target_columns().forEach((column_div) => {
            apply_column_dom_state(column_div);
            apply_column_iframe_styles(column_div);
        });
        column_settings_save("", last_load_profile);
    }
    //全体設定ダイアログを開く。opener_element: 閉じたときにフォーカスを戻す要素
    //#opd_main_element の直下にオーバーレイ #opd_global_settings_overlay (class "opd_dialog_overlay opd_global_settings_overlay") を 1 つだけ生成する (既に開いていればそこへフォーカスを移す)
    //ダイアログ本体は role="dialog" aria-modal="true" aria-labelledby で、次のフォームを持つ:
    //  ピン止め checkbox / バナー表示 checkbox / トップ表示 checkbox / 表示モード select / カラム幅 number (rem、COLUMN_WIDTH_MIN_REM 〜 COLUMN_WIDTH_MAX_REM) / 自動更新 checkbox / 自動更新間隔 number (秒、AUTO_RELOAD_TIME_MIN_MS 〜 AUTO_RELOAD_TIME_MAX_MS を秒に直した範囲)
    //  status 領域 (id 付き、role="status" aria-live="polite"、高さを予約) と 適用 / キャンセル ボタン
    //適用: 検証に失敗したら status 領域へ msg_global_settings_invalid_width / msg_global_settings_invalid_interval を表示し、該当欄へ aria-invalid と status 領域を指す aria-describedby を付けてフォーカスし、閉じない
    //      成功したら該当欄の aria-invalid / aria-describedby を外し、global_settings を更新 → apply_global_settings_to_columns → 閉じる
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
        <div class="opd_global_settings_row"><label for="opd_global_settings_pinned">${i18n_message("ui_global_settings_pinned_label")}</label><input class="opd_global_settings_pinned" id="opd_global_settings_pinned" type="checkbox"></div>
        <div class="opd_global_settings_row"><label for="opd_global_settings_banner">${i18n_message("ui_global_settings_banner_label")}</label><input class="opd_global_settings_banner" id="opd_global_settings_banner" type="checkbox"></div>
        <div class="opd_global_settings_row"><label for="opd_global_settings_top_visible">${i18n_message("ui_global_settings_top_label")}</label><input class="opd_global_settings_top_visible" id="opd_global_settings_top_visible" type="checkbox"></div>
        <div class="opd_global_settings_row"><label for="opd_global_settings_view_mode">${i18n_message("ui_settings_view_mode_label")}</label><select class="opd_global_settings_view_mode" id="opd_global_settings_view_mode"><option value="0">${i18n_message("ui_settings_view_mode_all")}</option><option value="1">${i18n_message("ui_settings_view_mode_text_only")}</option><option value="2">${i18n_message("ui_settings_view_mode_media_only")}</option></select></div>
        <div class="opd_global_settings_row"><label for="opd_global_settings_column_width">${i18n_message("ui_global_settings_column_width_rem_label")}</label><input class="opd_global_settings_column_width opd_column_settings_input_text" id="opd_global_settings_column_width" type="number" min="${COLUMN_WIDTH_MIN_REM}" max="${COLUMN_WIDTH_MAX_REM}"></div>
        <div class="opd_global_settings_row"><label for="opd_global_settings_auto_reload">${i18n_message("ui_settings_auto_reload_label")}</label><input class="opd_global_settings_auto_reload" id="opd_global_settings_auto_reload" type="checkbox"></div>
        <div class="opd_global_settings_row"><label for="opd_global_settings_auto_reload_time">${i18n_message("ui_settings_auto_reload_interval_label")}</label><span><input class="opd_global_settings_auto_reload_time opd_column_settings_input_text" id="opd_global_settings_auto_reload_time" type="number" min="${AUTO_RELOAD_TIME_MIN_MS / 1000}" max="${AUTO_RELOAD_TIME_MAX_MS / 1000}">${i18n_message("ui_settings_seconds_suffix")}</span></div>
        <div class="opd_global_settings_status" id="opd_global_settings_status" role="status" aria-live="polite"></div>
        <div class="opd_global_settings_actions"><input class="opd_global_settings_apply_btn" type="button" value="${i18n_message("ui_global_settings_apply_button")}"><input class="opd_global_settings_cancel_btn" type="button" value="${i18n_message("ui_global_settings_cancel_button")}"></div>
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
            global_settings = clone_global_settings({
                banner: banner_checkbox.checked,
                top_visible: top_visible_checkbox.checked,
                tw_view_mode: view_mode_select.value,
                column_width: column_width_value,
                auto_reload: auto_reload_checkbox.checked,
                auto_reload_time: auto_reload_time_ms,
                pinned: pinned_checkbox.checked,
            });
            apply_global_settings_to_columns();
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
            let column_open_path = "";
            let column_pinned_save_path = "";
            let column_page_title = null;
            //exploreの処理
            if(column_type == 'explore'){
                column_open_path = column_div.getAttribute("opd_explore_path");
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

//===== 全体設定 (global settings) =====
//全体設定はプロファイルごと (opd_profile_store[n].global_settings) に持つ既定設定で、
//各カラムの設定値が null (= 全体設定に従う) になっている項目に適用される。
//
//保存形式:
//  opd_profile_store[n] = {
//    name, profile: [column...],
//    settings_schema_version: SETTINGS_SCHEMA_VERSION,
//    global_settings: {banner, top_visible, tw_view_mode, column_width, auto_reload, auto_reload_time, pinned}
//  }
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
//カラムバーのトグル (.opd_banner / .opd_top_bar / .opd_pinned_btn) は実効状態を表示し、クリックで個別値 = !実効 を設定する。
//カラム設定パネルの select は inherit 選択肢を持ち、その表示文字列に現在の全体値を併記する。
//
//項目 × カラム種別の適用表 (○ = 適用対象、固定 = 設定行を出さず常に非表示の style を注入する。構造用カラム main_bar_empty_column / empty_column / second_empty_column / dsp_column は対象外):
//  項目            post    home  notification  explore(リスト含む)
//  バナー表示       固定    ○     ○             ○
//  トップ表示       固定    ○     ○             ○ (リスト系ページ表示中の非表示はヘッダーをリスト名だけの専用バーに整形する)
//  表示モード       -       ○     ○             ○
//  カラム幅         ○     ○     ○             ○
//  自動更新/間隔    -     ○     -             ○
//  ピン止め         -     -     -             ○
//
//適用経路は 3 つに分ける:
//  bind_column_events(column_div)        パネル・バーのイベント登録 (data-opd_settings_initialized で二重登録を防ぐ)
//  apply_column_dom_state(column_div)    iframe の load を待たず同期で反映する項目 (幅・バーのチェック状態・パネル表示・ピン止め reconcile・自動更新 interval)
//  apply_column_iframe_styles(column_div) iframe 内 head へ style を注入する項目 (バナー・トップ表示・表示モード)。iframe の load ごとと explore カラムのページ内遷移ごとに実行し、head 未生成時は何もしない
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
//iframe 内へ注入する CSS の正本 (初回 load・再 load・設定変更・ページ内遷移のどの経路でも同じ文字列を使う)
//top_hidden_list はリスト系ページ向けで、トップヘッダーをリスト名だけの専用バーに整形する: ヘッダーの高さ・背景・sticky は X 標準のまま残し、
//ボタン (戻る・共有・メニュー)・見出し直後のオーナー行・見出し (h2[role="heading"]) 内のアイコン (非公開リストの鍵) を display:none で余白ごと除き、見出しの親を中央揃えにして見出しをバー中央に置く。
//安全網として、ヘッダーの子要素を visibility:hidden にしたうえで見出しだけ visible に戻し、列挙に無い要素が見えたり操作できたりしないようにする (その要素の余白は残る)。ヘッダー配下の「新しいポスト」のピルも他のトップ非表示 CSS と同様に隠れる
const COLUMN_IFRAME_CSS = Object.freeze({
    banner_hidden: `header[role="banner"]{display:none}`,
    top_hidden_list: `div[data-testid="primaryColumn"]>[tabindex="0"][aria-label]>div:nth-child(1)>*{visibility: hidden;}div[data-testid="primaryColumn"]>[tabindex="0"][aria-label]>div:nth-child(1) h2[role="heading"]{visibility: visible;}div[data-testid="primaryColumn"]>[tabindex="0"][aria-label]>div:nth-child(1) button{display: none;}div[data-testid="primaryColumn"]>[tabindex="0"][aria-label]>div:nth-child(1) h2[role="heading"] + div{display: none;}div[data-testid="primaryColumn"]>[tabindex="0"][aria-label]>div:nth-child(1) h2[role="heading"] svg{display: none;}div[data-testid="primaryColumn"]>[tabindex="0"][aria-label]>div:nth-child(1) div:has(> h2[role="heading"]){align-items: center;width: 100%;}div[data-testid="primaryColumn"]>[tabindex="0"][aria-label]>div:nth-child(1) h2[role="heading"]{text-align: center;}div[data-testid="cellInnerDiv"]:has(button[aria-describedby], div[data-testid="UserAvatar-Container-unknown"]):not(:has(article[tabindex="-1"])){display:none;}`,
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
        //カラム配列が配列でなければ既定のカラム構成に戻し、オブジェクトでない要素と type が文字列でない要素は取り除く
        if(!Array.isArray(profile.profile)){
            profile.profile = create_default_profile_columns();
            is_changed = true;
        }else{
            const valid_columns = profile.profile.filter((column) => column !== null && typeof column === "object" && !Array.isArray(column) && typeof column.type === "string");
            if(valid_columns.length !== profile.profile.length){
                profile.profile = valid_columns;
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
//モーダルダイアログ共通処理 (リスト選択ダイアログと全体設定ダイアログで共有する)
//ダイアログ内でフォーカスを受け取れる要素 (非表示・disabled のものを除く) を文書順で返す
function get_dialog_focusable_elements(dialog_element){
    const focus_candidates = dialog_element.querySelectorAll('input, select, textarea, button, iframe, [tabindex]:not([tabindex="-1"])');
    return Array.from(focus_candidates).filter((element) => !element.disabled && element.offsetParent !== null);
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
function fill_column_template(template_html, values){
    return template_html.replace(/%([a-z_]+)%/g, (token, name) => Object.hasOwn(values, name) ? String(values[name]) : token);
}
//パスがリスト系ページ (/i/lists/<id> 配下、または /<screen_name>/lists 配下) を指すか
function is_list_page_path(path){
    return /^\/(?:i\/lists|[^\/?#]+\/lists)(?:[\/?#]|$)/.test(path ?? "");
}
//Explore系カラムのパスからカラムバーに表示するタイトルを決める
function get_explore_column_title(path){
    if(is_list_page_path(path)) return i18n_message("ui_column_list_title");
    return i18n_message("ui_column_explore_title");
}
//Explore系カラムのカラムバーのタイトル表示を、そのカラムが表示しているパスに合わせて更新する
function set_explore_column_title(column_div, path){
    const column_title_elem = column_div?.querySelector(".dsp_explore_column_title");
    if(column_title_elem) column_title_elem.textContent = get_explore_column_title(path);
}
//Xのscreen_nameとして妥当か(文字種・長さを満たし、Xのルーティング予約名 i でないこと。大文字小文字は区別しない)
function is_valid_screen_name(name){
    return /^[A-Za-z0-9_]{1,15}$/.test(name ?? "") && name.toLowerCase() !== "i";
}
//ログイン中ユーザーのscreen_nameをXのナビゲーションにあるプロフィールリンクから取得する(取得できない場合はnull)
function get_login_screen_name(){
    const profile_link_selector = 'a[data-testid="AppTabBar_Profile_Link"]';
    const documents = [document];
    document.querySelectorAll("#main_rack_element iframe").forEach((frame) => {
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
    column_frames.forEach(column => {
        let count = 0;

        const reLoad = () => {
            if (++count >= max_retries) return;
            setTimeout(() => { column.src = column.src }, 500);
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

    setTimeout(() => cleanups.forEach(fn => fn()), max_retries * 500 + 1000);
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
