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
            if(value.opd_settings == undefined){
                last_load_profile = 0;
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
            
            chrome.storage.local.get("opd_profile_store", function(store_value){
                //console.log(store_value)
                //console.log(JSON.parse(store_value.opd_profile_store))
                profile_store = JSON.parse(store_value.opd_profile_store);
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
                    ext_settings = {column_settings:profile_store[last_load_profile].profile};
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
                    ext_settings = {column_settings:profile_store[last_load_profile].profile};
                }
                //console.log(ext_settings);
                run(ext_settings);
            });
        });
    }
}
function run(settings){
    //console.log(settings)
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
    /*リストカラム複数追加ダイアログ*/
    .opd_list_picker_overlay{
        --opd-list-picker-accent: #1d9bf0;
        --opd-list-picker-accent-text: #ffffff;
        --opd-list-picker-accent-background: rgba(29, 155, 240, 0.15);
        --opd-list-picker-surface: #ffffff;
        --opd-list-picker-skeleton: #bdbdbd;
        --opd-list-picker-muted-text: #555555;
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.5);
    }
    .opd_list_picker_dialog{
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        width: 72rem;
        max-width: 95%;
        max-height: 92%;
        box-sizing: border-box;
        overflow-y: auto;
        padding: 1rem;
        background: #efefefeb;
        border: 1px solid #a9a9a9eb;
        color: black;
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

        & .opd_list_picker_dialog {
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
    let column_settings_panel = `<div class="dsp_column_settings_panel"><div class="dsp_column_settings_panel_content"><h2>${i18n_message("ui_settings_header")}</h2><div class="dsp_column_settings_list"><div class="dsp_column_settings_content_div">${i18n_message("ui_settings_view_mode_label")}<span><select class="opd_tw_view_mode" column_tw_view_mode_val="%column_tw_view_mode%"><option value="0">${i18n_message("ui_settings_view_mode_all")}</option><option value="1">${i18n_message("ui_settings_view_mode_text_only")}</option><option value="2">${i18n_message("ui_settings_view_mode_media_only")}</option></select></span></div><div class="dsp_column_settings_content_div">${i18n_message("ui_settings_column_width_label")}<span><select class="opd_column_size_preset"><option value="0">${i18n_message("ui_settings_column_width_small")}</option><option value="1">${i18n_message("ui_settings_column_width_medium")}</option><option value="2">${i18n_message("ui_settings_column_width_large")}</option><option value="3">${i18n_message("ui_settings_column_width_custom")}</option></select></span></div><div class="dsp_column_settings_content_div">${i18n_message("ui_settings_column_width_custom_label")}<span><input type="button" class="column_width_btn" value="${i18n_message("ui_settings_column_width_custom_button")}" style="vertical-align: text-top;font-size: 0.8rem;"/></span></div><div class="dsp_column_settings_content_div">${i18n_message("ui_settings_auto_reload_label")}<span><input class="opd_a_reload_bar" type="checkbox" %column_auto_reload_ch%></span></div><div class="dsp_column_settings_content_div">${i18n_message("ui_settings_auto_reload_interval_label")}<span><input class="opd_column_settings_input_text opd_a_reload_time_setting" type="number" value="%column_auto_reload_time%">${i18n_message("ui_settings_seconds_suffix")}</span></div></div><div class="dsp_column_settings_panel_close_btn_wrap"><input type="button" class="dsp_column_settings_panel_close_btn" value="${i18n_message("ui_settings_close_button")}" style="vertical-align: text-top;font-size: 0.8rem;"/></div></div></div>` ;
    let column_settings_panel_no_auto = `<div class="dsp_column_settings_panel"><div class="dsp_column_settings_panel_content"><h2>${i18n_message("ui_settings_header")}</h2><div class="dsp_column_settings_list"><div class="dsp_column_settings_content_div">${i18n_message("ui_settings_view_mode_label")}<span><select class="opd_tw_view_mode" column_tw_view_mode_val="%column_tw_view_mode%"><option value="0">${i18n_message("ui_settings_view_mode_all")}</option><option value="1">${i18n_message("ui_settings_view_mode_text_only")}</option><option value="2">${i18n_message("ui_settings_view_mode_media_only")}</option></select></span></div><div class="dsp_column_settings_content_div">${i18n_message("ui_settings_column_width_label")}<span><select class="opd_column_size_preset"><option value="0">${i18n_message("ui_settings_column_width_small")}</option><option value="1">${i18n_message("ui_settings_column_width_medium")}</option><option value="2">${i18n_message("ui_settings_column_width_large")}</option><option value="3">${i18n_message("ui_settings_column_width_custom")}</option></select></span></div><div class="dsp_column_settings_content_div">${i18n_message("ui_settings_column_width_custom_label")}<span><input type="button" class="column_width_btn" value="${i18n_message("ui_settings_column_width_custom_button")}" style="vertical-align: text-top;font-size: 0.8rem;"/></span></div></div><div class="dsp_column_settings_panel_close_btn_wrap"><input type="button" class="dsp_column_settings_panel_close_btn" value="${i18n_message("ui_settings_close_button")}" style="vertical-align: text-top;font-size: 0.8rem;"/></div></div></div>` ;
    let column_settings_panel_othersns = `<div class="dsp_column_settings_panel"><div class="dsp_column_settings_panel_content"><h2>${i18n_message("ui_settings_header")}</h2><div class="dsp_column_settings_list"><div class="dsp_column_settings_content_div">${i18n_message("ui_settings_column_width_label")}<span><select class="opd_column_size_preset"><option value="0">${i18n_message("ui_settings_column_width_small")}</option><option value="1">${i18n_message("ui_settings_column_width_medium")}</option><option value="2">${i18n_message("ui_settings_column_width_large")}</option><option value="3">${i18n_message("ui_settings_column_width_custom")}</option></select></span></div><div class="dsp_column_settings_content_div">${i18n_message("ui_settings_column_width_custom_label")}<span><input type="button" class="column_width_btn" value="${i18n_message("ui_settings_column_width_custom_button")}" style="vertical-align: text-top;font-size: 0.8rem;"/></span></div></div><div class="dsp_column_settings_panel_close_btn_wrap"><input type="button" class="dsp_column_settings_panel_close_btn" value="${i18n_message("ui_settings_close_button")}" style="vertical-align: text-top;font-size: 0.8rem;"/></div></div></div>` ;
    let default_element = {
        /*main_bar_empty_column:{html:`<!--<section draggable="false" class="dsp_column"><div opd_column_type="main_bar_empty_column" opd_column_width="%column_width_num%" id="main_bar_empty_column" style="height:100%;min-width: 70px;"></div></section>-->`},*/
        empty_column:{html:`<section draggable="false" id="column_%column_num%" class="dsp_column_draggable_false dsp_column dsp_column_emptycolumn"><div opd_column_type="empty_column" opd_column_width="%column_width_num%" style="height: 100%;min-width: 30rem;display: flex;align-items: center;justify-content: center;"><div><img src="${chrome.runtime.getURL(ui_icon_define.column_add_1)}" style="filter: brightness(0) saturate(100%) invert(61%) sepia(13%) saturate(13%) hue-rotate(335deg) brightness(89%) contrast(79%);"><p>左のバーからカラムを追加</p></div></div></section>`},
        post:{html:`<section draggable="true" id="column_%column_num%" class="dsp_column_draggable_true dsp_column"><div opd_column_type="post" opd_column_width="%column_width_num%" style="height: 100%;width: %column_width_num%rem;min-width: 1rem;"><div class="column_bar" style="height: max-content;"><span class="dsp_column_title"><div class="dsp_column_move_icon_parent"><span class="dsp_column_move_icon"></span><span>Post</span></div></span>${post_element_bar}<div class="dsp_column_empty_area opd_column_scroll_to_top"></div><div class="dsp_column_close_btn_wrap"><span class="dsp_column_btn"><label class="dsp_column_close_btn opd_ui_icon_color" title="カラムを閉じる"><input type="button" class="column_close_btn" value="X"/></label></span></div></div>${column_settings_panel_no_auto}<iframe auto_reload_mouse_hover="false" allow="fullscreen" src="https://x.com/intent/tweet" type="text/html" style="width: 100%;height: 100%;" opd_init_webview></iframe></div></section>`},
        second_empty_column:{html:`<section draggable="false" id="column_%column_num%" class="dsp_column_draggable_false dsp_column dsp_column_second_emptycolumn"><div opd_column_type="second_empty_column" opd_column_width="%column_width_num%" style="height:100%;min-width: 30rem;overflow: hidden;display: flex;align-items: center;justify-content: center;"><div><img src="${chrome.runtime.getURL(ui_icon_define.column_add_2)}" style="filter: brightness(0) saturate(100%) invert(61%) sepia(13%) saturate(13%) hue-rotate(335deg) brightness(89%) contrast(79%);"><p>1段目のカラムが配置できます</p></div></div></section>`},
        home:{html:`<section draggable="true" id="column_%column_num%" class="dsp_column_draggable_true dsp_column"><div opd_column_type="home" opd_column_width="%column_width_num%" style="height: 100%;width: %column_width_num%rem;min-width: 1rem;"><div class="column_bar" style="height: max-content;"><span class="dsp_column_title"><div class="dsp_column_move_icon_parent"><span class="dsp_column_move_icon"></span><span>Timeline</span></div></span>${default_element_bar}<div class="dsp_column_empty_area opd_column_scroll_to_top"></div><div class="dsp_column_close_btn_wrap"><span class="dsp_column_btn"><label class="dsp_column_close_btn opd_ui_icon_color" title="カラムを閉じる"><input type="button" class="column_close_btn" value="X"/></label></span></div></div>${column_settings_panel}<iframe auto_reload_mouse_hover="false" allow="fullscreen" src="https://x.com/home" type="text/html" style="width: 100%;height: 100%;" opd_init_webview></iframe></div></section>`},
        notification:{html:`<section draggable="true" id="column_%column_num%" class="dsp_column_draggable_true dsp_column"><div opd_column_type="notification" opd_column_width="%column_width_num%" style="height: 100%;width: %column_width_num%rem;min-width: 1rem;"><div class="column_bar" style="height: max-content;"><span class="dsp_column_title"><div class="dsp_column_move_icon_parent"><span class="dsp_column_move_icon"></span><span>Notifications</span></div></span>${default_element_bar}<div class="dsp_column_empty_area opd_column_scroll_to_top"></div><div class="dsp_column_close_btn_wrap"><span class="dsp_column_btn"><label class="dsp_column_close_btn opd_ui_icon_color" title="カラムを閉じる"><input type="button" class="column_close_btn" value="X"/></label></span></div></div>${column_settings_panel_no_auto}<iframe allow="fullscreen" src="https://x.com/notifications" type="text/html" style="width: 100%;height: 100%;" opd_init_webview></iframe></div></section>`},
        explore:{html:`<section draggable="true" id="column_%column_num%" class="dsp_column_draggable_true dsp_column"><div opd_column_type="explore" opd_column_width="%column_width_num%" opd_explore_path="%column_save_path%" opd_explore_title="%column_save_title%" opd_pinned_path="%column_pinned_save_path%" style="height: 100%;width: %column_width_num%rem;min-width: 1rem;"><div class="column_bar" style="height: max-content;"><span class="dsp_column_title"><div class="dsp_column_move_icon_parent"><span class="dsp_column_move_icon"></span><span class="dsp_explore_column_title">%column_title%</span></div></span>${default_element_bar}<span class="dsp_column_btn"><input class="opd_pinned_btn" type="checkbox" title="ピン止め切り替え" %column_pinned_ch%><label class="dsp_column_pin_btn opd_ui_icon_color"></label></span><div class="dsp_column_empty_area opd_column_scroll_to_top"></div><div class="dsp_column_close_btn_wrap"><span class="dsp_column_btn"><label class="dsp_column_close_btn opd_ui_icon_color" title="カラムを閉じる"><input type="button" class="column_close_btn" value="X"/></label></span></div></div>${column_settings_panel}<iframe auto_reload_mouse_hover="false" allow="fullscreen" src="https://x.com%column_save_path%" type="text/html" style="width: 100%;height: 100%;" opd_init_webview></iframe></div></section>`}
    };
    let ins_html = document.createElement("div");
    ins_html.id = "opd_main_element";
    ins_html.style = "position: fixed;z-index: 999999;top:0;width: 100%;height: 100%;background: white;display: flex;flex-direction: row;overflow: hidden;";
    let side_bar = `<section class="dsp_column" style="position:fixed;z-index:999;height:98%;"><div draggable="false" class="dsp_column_draggable_false" opd_column_type="dsp_column" opd_column_width="%column_width_num%" style="height:100%;min-width: 60px;max-width: 60px;text-align: center;background-color: white;"><div class="main_bar_functions"><div class="opd_ui_logo_parent" title="${i18n_message("ui_sidebar_logo_title", [manifest.version])}"><div class="opd_ui_logo"></div><span class="opd_version_span">${manifest.version}</span></div><hr><p class="opd_debug_menu">${i18n_message("ui_debug_menu_label")}<br><input type="button" id="init_settings" value="${i18n_message("ui_button_init_settings")}" /><br><input type="button" id="profile_load_save" value="${i18n_message("ui_button_profile_loader")}" /><br><input type="button" id="dnr_reload" value="${i18n_message("ui_button_dnr_reload")}" /><br><input type="button" id="ext_reload" value="${i18n_message("ui_button_ext_reload")}" /><br><div id="api_limit_status">${i18n_message("ui_button_api_label")}</div><hr><div class="dsp_btn_parent" id="add_post" title="${i18n_message("ui_add_post_column_title")}"><div class="dsp_btn_add_post_img"></div></div><hr><div class="dsp_btn_parent" id="add_timeline" title="${i18n_message("ui_add_timeline_column_title")}"><div class="dsp_btn_add_tl_img"></div></div><div class="dsp_btn_parent" id="add_notify" title="${i18n_message("ui_add_notification_column_title")}"><div class="dsp_btn_add_ntfc_img"></div></div><div class="dsp_btn_parent" id="add_explore" title="${i18n_message("ui_add_explore_column_title")}"><div class="dsp_btn_add_explr_img"></div></div><div class="dsp_btn_parent" id="add_list" title="${i18n_message("ui_add_list_column_title")}"><div class="dsp_btn_add_list_img"></div></div><div class="dsp_btn_parent" id="add_list_multi" tabindex="0" role="button" title="${i18n_message("ui_add_list_multi_column_title")}"><div class="dsp_btn_add_list_multi_img"></div></div><hr><div class="dsp_btn_parent" title="${i18n_message("ui_toggle_second_rack_title")}" id="second_rack"><div class="dsp_btn_second_rack_img"></div></div><hr><div class="dsp_btn_parent" title="${i18n_message("ui_profile_save_title")}" id="profile_save"><div class="dsp_btn_profile_add_img"></div></div><div class="dsp_btn_parent" title="${i18n_message("ui_profile_delete_title")}" id="profile_delete"><div class="dsp_btn_profile_delete_img"></div></div>${profile_list_html}</p></div></div></section><section draggable="false" class="dsp_column_draggable_false dsp_column"><div opd_column_type="main_bar_empty_column" id="main_bar_empty_column" style="height:100%;min-width: 60px;max-width: 60px;"></div></section>`;
    //let side_bar = `<section class="dsp_column" style="position:fixed;z-index:999;height:98%;"><div draggable="false" opd_column_type="dsp_column" opd_column_width="%column_width_num%" style="height:100%;min-width: 100px;text-align: center;background-color: white;"><div><p style="margin-top:0;padding-top:1em;">Open-Deck<br>Prototype<br>v${manifest.version}</p><hr><p>Debug<br><input type="button" id="init_settings" value="init settings"/><br><input type="button" id="profile_load_save" value="Profile Load"/><br><input type="button" id="dnr_reload" value="dNR_Reload"/><br><input type="button" id="ext_reload" value="Ext_Reload"/></p><hr><p><input type="button" id="add_timeline" value="Add TimeLine"/> <div class="dsp_btn_parent"><div class="dsp_btn_add_tl_img"></div></div><div class="dsp_btn_parent"><div class="dsp_btn_add_ntfc_img"></div></div><div class="dsp_btn_parent"><div class="dsp_btn_add_explr_img"></div></div> </p><p><input type="button" id="add_notify" value="Add Notification"/></p><p><input type="button" id="add_explore" value="Add Explore"/><hr><input type="button" id="second_rack" value="Second Rack"/><hr><input type="button" id="profile_save" value="Profile_Save"/><br><input type="button" id="profile_delete" value="Profile_Delete"/><br>${profile_list_html}</p></div></div></section><section draggable="false" class="dsp_column"><div opd_column_type="main_bar_empty_column" id="main_bar_empty_column" style="height:100%;min-width: 110px;"></div></section>`;
    let main_column_html = ``;
    let second_column_html = ``;
    //設定2段
    let first_column_end = false;
    let second_column_end = false;
    let second_rack_mode = false;
    //カラム横幅
    let column_width_init = "30";
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
                let banner_checked = "";
                let init_top_visible_checked = "";
                let init_pinned_checked = "";
                let init_pinned_path = "";
                let init_auto_reload_checked = "";
                let init_column_save_path = settings.column_settings[index].column_save_path;
                let init_column_save_title = settings.column_settings[index].column_save_title;
                let tw_view_type = settings.column_settings[index].tw_view_mode;
                let auto_reload_time = settings.column_settings[index].auto_reload_time / 1000;
                if(settings.column_settings[index].banner == true){
                    banner_checked = "checked";
                }
                //トップ検索など
                if(settings.column_settings[index].top_visible == true){
                    init_top_visible_checked = "checked";
                }
                //カラム横幅
                if(settings.column_settings[index].column_width != null){
                    column_width_init = settings.column_settings[index].column_width;
                }
                //Exproleピン止め
                if(settings.column_settings[index].type == "explore"){
                    if(settings.column_settings[index].column_pinned_path != ""){
                        init_pinned_checked = "checked";
                        init_pinned_path = settings.column_settings[index].column_pinned_path;
                        init_column_save_path = settings.column_settings[index].column_pinned_path;
                        //%column_pinned_ch%
                    }else{
                        init_column_save_path = settings.column_settings[index].column_save_path;
                    }
                }
                //自動更新
                if(settings.column_settings[index].type == "explore" || settings.column_settings[index].type == "home"){
                    if(settings.column_settings[index].auto_reload){
                        init_auto_reload_checked = "checked";
                        //%column_pinned_ch%
                    }else{
                    }
                }
                const column_html = fill_column_template(default_element[Object.keys(default_element)[default_index]]["html"], {
                    column_num: create_random_id(),
                    column_banner_ch: banner_checked,
                    column_top_bar_ch: init_top_visible_checked,
                    column_tw_view_mode: tw_view_type,
                    column_pinned_ch: init_pinned_checked,
                    column_width_num: column_width_init,
                    column_auto_reload_ch: init_auto_reload_checked,
                    column_auto_reload_time: auto_reload_time,
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
                    document.querySelector("#opd_main_element").remove();
                    last_load_profile = index;
                    chrome.storage.local.get("opd_settings", function(value){
                        let load_setting = JSON.parse(value.opd_settings);
                        load_setting.last_load_profile = index;
                        chrome.storage.local.set({'opd_settings': JSON.stringify(load_setting)}, function () {
                        });
                    });
                    const column_settings = {column_settings:profile_store[index].profile};
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

            //カラム拡張読み込み
            if(mode != "session_set"){
                reinit_column_extensions(column_object[index].closest("div[opd_column_type]"));
            }

            //バナー/表示モード変更
            column_object[index].addEventListener("load", function(){
                console.log(this.getAttribute("opd_iframe_width_only"))
                if(this.getAttribute("opd_iframe_width_only") != ''){
                    //console.log(this)
                    let opd_column_div = this.closest("div[opd_column_type]");
                    let opd_column_banner_checkbox = opd_column_div.querySelector(".opd_banner");
                    let opd_column_top_visible_checkbox = opd_column_div.querySelector(".opd_top_bar");
                    let opd_column_tw_view_mode_opt = opd_column_div.querySelector(".opd_tw_view_mode");
                    //バナー表示設定読み込み適用
                    /*if(opd_column_banner_checkbox.checked == true){
                        this.contentWindow.document.querySelector("head").insertAdjacentHTML("beforeend", `<style opd_banner_css></style>`);
                    }else{
                        this.contentWindow.document.querySelector("head").insertAdjacentHTML("beforeend", `<style opd_banner_css>header[role="banner"]{content-visibility:hidden; }</style>`);
                    }*/
                    //共通CSS挿入(スクロールバー細くする)
                    this.contentWindow.document.querySelector("head").insertAdjacentHTML("beforeend", `<style opd_main_css>html{scrollbar-width:thin;}</style>`);
                    //バナー表示ロード
                    if(this.contentWindow.document.querySelector('head style[opd_banner_css]') == null){
                        this.contentWindow.document.querySelector("head").insertAdjacentHTML("beforeend", `<style opd_banner_css></style>`);
                    }
                    if(opd_column_banner_checkbox?.checked != true){
                        //console.log(this)
                        this.contentWindow.document.querySelector('head style[opd_banner_css]').textContent = `header[role="banner"]{display:none};`;
                    }else{
                        //console.log("else")
                        this.contentWindow.document.querySelector('head style[opd_banner_css]').textContent = ``;
                    }
                    //トップ検索欄等削除適用
                    if(this.contentWindow.document.querySelector('head style[opd_top_visible_css]') == null){
                        this.contentWindow.document.querySelector("head").insertAdjacentHTML("beforeend", `<style opd_top_visible_css></style>`);
                    }
                    if(opd_column_top_visible_checkbox?.checked != true){
                        if(this.closest("div[opd_column_type]").getAttribute("opd_column_type") == "explore"){
                            //div[data-testid="primaryColumn"] div[tabindex="0"][aria-label] div:has(form[role="search"]){display:none;}
                            this.contentWindow.document.querySelector('head style[opd_top_visible_css]').textContent = `div[data-testid="primaryColumn"]>[tabindex="0"][aria-label]>div:nth-child(1)div[data-testid="primaryColumn"]>[tabindex="0"][aria-label]>div:nth-child(1)`;
                        }else{
                            if(this.closest("div[opd_column_type]").getAttribute("opd_column_type") == "home"){
                                this.contentWindow.document.querySelector('head style[opd_top_visible_css]').textContent = `div[data-testid="primaryColumn"]>[tabindex="0"][aria-label]>div:nth-child(1){display:none;} div[role="progressbar"] + div{display:none;}`;
                            }else{
                                this.contentWindow.document.querySelector('head style[opd_top_visible_css]').textContent = `div[data-testid="primaryColumn"]>[tabindex="0"][aria-label]>div:nth-child(1){display:none;}`;
                            }
                        }
                    }else{
                        //console.log("else")
                        this.contentWindow.document.querySelector('head style[opd_top_visible_css]').textContent = ``;
                    }

                    //ツイート表示項目設定読み込み適用
                    if(this.contentWindow.document.querySelector("head style[opd_tw_view_mode_css]") == null){
                        this.contentWindow.document.querySelector("head").insertAdjacentHTML("beforeend", `<style opd_tw_view_mode_css></style>`);
                    }
                    switch (opd_column_tw_view_mode_opt.value) {
                        case "0":
                            this.contentWindow.document.querySelector('head style[opd_tw_view_mode_css]').textContent = ``;
                            break;
                        case "1":
                            this.contentWindow.document.querySelector('head style[opd_tw_view_mode_css]').textContent = `div[data-testid="cellInnerDiv"]:has(div[aria-labelledby]){visibility: hidden; height: 0;}`;
                            break;
                        case "2":
                            this.contentWindow.document.querySelector('head style[opd_tw_view_mode_css]').textContent = `div[data-testid="cellInnerDiv"]:not(:has(div[aria-labelledby])){visibility: hidden; height: 0;}`;
                            break;
                        default:
                            this.contentWindow.document.querySelector('head style[opd_tw_view_mode_css]').textContent = ``;
                            break;
                    }
                    //console.log(opd_column_div.querySelector(".opd_banner").checked)
                }
            })
            //各カラム読み込み後の動作(init)
            column_object[index].addEventListener("load", function(){
                //console.log(this)
                let opd_column_div = this.closest("div[opd_column_type]");
                let opd_column_width_btn = opd_column_div.querySelector(".column_width_btn");
                let opd_column_width_select = opd_column_div.querySelector(".opd_column_size_preset");
                let opd_column_banner_checkbox = opd_column_div.querySelector(".opd_banner");
                let opd_column_top_visible_checkbox = opd_column_div.querySelector(".opd_top_bar");
                let opd_column_pinned_checkbox = opd_column_div.querySelector(".opd_pinned_btn");
                let opd_column_auto_reload_checkbox = opd_column_div.querySelector(".opd_a_reload_bar");
                let opd_column_auto_reload_time_reload = opd_column_div.querySelector(".opd_a_reload_time_setting");
                let opd_column_tw_view_mode_opt = opd_column_div.querySelector(".opd_tw_view_mode");
                let opd_column_scroll_to_top = opd_column_div.querySelector(".opd_column_scroll_to_top");

                //設定パネルイベント
                if(mode != "session_set"){
                    opd_column_div.querySelector(".opd_settings_btn").addEventListener("click", function(){
                        const settings_panel = this.closest("div[opd_column_type]").querySelector(".dsp_column_settings_panel");
                        if(settings_panel.getAttribute("open") == null){
                            settings_panel.setAttribute("open", "");
                            settings_panel.style.display = "flex";
                        }else{
                            settings_panel.removeAttribute("open");
                            settings_panel.style.display = "none";
                        }
                    });
                }
                if(mode != "session_set"){
                    opd_column_div.querySelector(".dsp_column_settings_panel_close_btn").addEventListener("click", function(){
                        const settings_panel = this.closest("div[opd_column_type]").querySelector(".dsp_column_settings_panel");
                        settings_panel.removeAttribute("open");
                        settings_panel.style.display = "none";
                    })
                    //設定パネル&ホバー時動作
                    opd_column_div.querySelector(".dsp_column_settings_panel").addEventListener("mouseover", function(){
                        opd_column_div.closest(".dsp_column").setAttribute("draggable", "false");
                    });
                    opd_column_div.querySelector(".dsp_column_settings_panel").addEventListener("mouseleave", function(){
                        opd_column_div.closest(".dsp_column").setAttribute("draggable", "true");
                    });
                }
                //設定パネルカラム幅設定
                if(opd_column_width_select != null){
                    switch (opd_column_div.getAttribute("opd_column_width")){
                        case '15':
                            opd_column_width_select.value = 0;
                            break;
                        case '20':
                            opd_column_width_select.value = 1;
                                break;
                        case '30':
                            opd_column_width_select.value = 2;
                            break;
                        default:
                            opd_column_width_select.value = 3;
                            break;
                    }
                    if(mode != "session_set"){
                        opd_column_width_select.addEventListener("change", function(){
                            let preset_rem = null;
                            switch (this.value){
                                case '0':
                                    preset_rem = 15;
                                    break;
                                case '1':
                                    preset_rem = 20;
                                    break;
                                case '2':
                                    preset_rem = 30;
                                    break;
                                default:
                                    preset_rem = 30;
                                    break;
                            }
                            this.closest("div[opd_column_type]").setAttribute("opd_column_width", preset_rem);
                            this.closest("div[opd_column_type]").style.width = `${preset_rem}rem`;
                            column_settings_save("", last_load_profile);
                        })
                    }
                }
                if(mode != "session_set"){
                    //カラム横幅設定イベント
                    opd_column_width_btn.addEventListener("click", function(){
                        const now_width = this.closest("div[opd_column_type]").getAttribute("opd_column_width");
                        let column_width_preset  = this.closest("div[opd_column_type]").querySelector(".opd_column_size_preset");
                        let setting_width = prompt(i18n_message("msg_column_width_prompt"), now_width);
                        //console.log(setting_width);
                        if(setting_width != null){
                            const setting_width_num = Number(setting_width);
                            if(setting_width_num != NaN && setting_width_num > 11){
                                this.closest("div[opd_column_type]").setAttribute("opd_column_width", setting_width_num);
                                this.closest("div[opd_column_type]").style.width = `${setting_width_num}rem`;
                                column_settings_save("", last_load_profile);
                                switch (setting_width_num){
                                    case 15:
                                        column_width_preset.value = 0;
                                        break;
                                    case 20:
                                        column_width_preset.value = 1;
                                        break;
                                    case 30:
                                        column_width_preset.value = 2;
                                        break;
                                    default:
                                        column_width_preset.value = 3;
                                        break;
                                }
                            }else{
                                alert(i18n_message("msg_invalid_value_alert"));
                            }
                        }
                    });
                }

                //他SNSカラム対応
                if(this.getAttribute("opd_iframe_width_only") != ''){
                    //バナー表示設定読み込み適用
                    /*if(opd_column_banner_checkbox.checked == true){
                        this.contentWindow.document.querySelector("head").insertAdjacentHTML("beforeend", `<style opd_banner_css></style>`);
                    }else{
                        this.contentWindow.document.querySelector("head").insertAdjacentHTML("beforeend", `<style opd_banner_css>header[role="banner"]{content-visibility:hidden; }</style>`);
                    }*/
                    if(this.contentWindow.document.querySelector('head style[opd_banner_css]') == null){
                        this.contentWindow.document.querySelector("head").insertAdjacentHTML("beforeend", `<style opd_banner_css></style>`);
                    }
                    if(opd_column_banner_checkbox?.checked != true){
                        //console.log(this)
                        this.contentWindow.document.querySelector('head style[opd_banner_css]').textContent = `header[role="banner"]{display:none};`;
                    }else{
                        //console.log("else")
                        this.contentWindow.document.querySelector('head style[opd_banner_css]').textContent = ``;
                    }

                    //トップ検索欄等削除適用
                    if(this.contentWindow.document.querySelector('head style[opd_top_visible_css]') == null){
                        this.contentWindow.document.querySelector("head").insertAdjacentHTML("beforeend", `<style opd_top_visible_css></style>`);
                    }
                    if(opd_column_top_visible_checkbox?.checked != true){
                        //console.log("home_notcheck")
                        if(this.closest("div[opd_column_type]").getAttribute("opd_column_type") == "explore"){
                            this.contentWindow.document.querySelector('head style[opd_top_visible_css]').textContent = `div[data-testid="primaryColumn"]>[tabindex="0"][aria-label]>div:nth-child(1){visibility: hidden; height: 0;top: calc(100vh - 60px);position: sticky;backdrop-filter: blur(0px) !important;}[data-testid="app-bar-back"]{visibility: visible; filter: none;}div[data-testid="cellInnerDiv"]:has(button[aria-describedby], div[data-testid="UserAvatar-Container-unknown"]):not(:has(article[tabindex="-1"])){display:none;}`;
                        }else{
                            if(this.closest("div[opd_column_type]").getAttribute("opd_column_type") == "home"){
                                this.contentWindow.document.querySelector('head style[opd_top_visible_css]').textContent = `div[data-testid="primaryColumn"]>[tabindex="0"][aria-label]>div:nth-child(1){visibility: hidden; height: 0;top: calc(100vh - 60px);position: sticky;backdrop-filter: blur(0px) !important;}[data-testid="app-bar-back"]{visibility: visible; filter: none;} div[role="progressbar"] + div{display:none;}div[data-testid="cellInnerDiv"]:has(button[aria-describedby], div[data-testid="UserAvatar-Container-unknown"]):not(:has(article[tabindex="-1"])){display:none;}`;
                            }else{
                                this.contentWindow.document.querySelector('head style[opd_top_visible_css]').textContent = `div[data-testid="primaryColumn"]>[tabindex="0"][aria-label]>div:nth-child(1){visibility: hidden; height: 0;top: calc(100vh - 60px);position: sticky;backdrop-filter: blur(0px) !important;}[data-testid="app-bar-back"]{visibility: visible; filter: none;}div[data-testid="cellInnerDiv"]:has(button[aria-describedby], div[data-testid="UserAvatar-Container-unknown"]):not(:has(article[tabindex="-1"])){display:none;}`;
                            }
                        }
                    }else{
                        //console.log("else")
                        this.contentWindow.document.querySelector('head style[opd_top_visible_css]').textContent = ``;
                    }
                
                    //ツイート表示項目設定読み込み適用
                    if(this.contentWindow.document.querySelector("head style[opd_tw_view_mode_css]") == null){
                        this.contentWindow.document.querySelector("head").insertAdjacentHTML("beforeend", `<style opd_tw_view_mode_css></style>`);
                    }
                    opd_column_tw_view_mode_opt.value = opd_column_tw_view_mode_opt.getAttribute("column_tw_view_mode_val")
                    switch (opd_column_tw_view_mode_opt.getAttribute("column_tw_view_mode_val")) {
                        case "0":
                            this.contentWindow.document.querySelector('head style[opd_tw_view_mode_css]').textContent = ``;
                            break;
                        case "1":
                            this.contentWindow.document.querySelector('head style[opd_tw_view_mode_css]').textContent = `div[data-testid="cellInnerDiv"]:has(div[aria-labelledby]){visibility: hidden; height: 0;}`;
                            break;
                        case "2":
                            this.contentWindow.document.querySelector('head style[opd_tw_view_mode_css]').textContent = `div[data-testid="cellInnerDiv"]:not(:has(div[aria-labelledby])){visibility: hidden; height: 0;}`;
                            break;
                        default:
                            this.contentWindow.document.querySelector('head style[opd_tw_view_mode_css]').textContent = ``;
                            break;
                    }
                    //自動更新初期適用
                    let reload_test = 0;
                    let auto_reload_int = null;//チェックボックスイベントにも再利用
                    if(opd_column_auto_reload_checkbox != null){
                        //Home, Exproleカラムホバー中 自動更新上部遷移停止
                        opd_column_div.querySelector("iframe").addEventListener("mouseover", function(){
                            this.setAttribute("auto_reload_mouse_hover", "true");
                        });
                        opd_column_div.querySelector("iframe").addEventListener("mouseleave", function(){
                            this.setAttribute("auto_reload_mouse_hover", "false");
                        });
                        const auto_reload_target_elem = this;
                        //console.log(opd_column_auto_reload_checkbox)
                        if(mode != "session_set"){
                            opd_column_auto_reload_time_reload.addEventListener("change", function(){
                                const auto_reload_time = auto_reload_target_elem.closest('div[opd_column_type]').querySelector(".opd_a_reload_time_setting");
                                if(Number(auto_reload_time.value) >= 1){
                                    alert(i18n_message("msg_auto_reload_set", [auto_reload_time.value]));
                                    column_settings_save("", last_load_profile);
                                }else{
                                    alert(i18n_message("msg_auto_reload_minimum_alert"));
                                    auto_reload_time.value = '10';
                                    column_settings_save("", last_load_profile);
                                }
                            });
                        }
                        //初期チェック動作
                        if(opd_column_auto_reload_checkbox.checked){
                            //console.log("init update!")
                            const auto_reload_time_input = auto_reload_target_elem.closest('div[opd_column_type]').querySelector(".opd_a_reload_time_setting");
                            const auto_reload_load_time = Number(auto_reload_time_input.value) * 1000;
                            auto_reload_time_input.disabled = true;
                            auto_reload_int = setInterval(function(){
                                //console.log("update!")
                                //console.log(auto_reload_target_elem.contentWindow)
                                const path_name = auto_reload_target_elem.contentWindow.location.pathname;
                                if(['/home', '/search'].includes(path_name) || path_name.startsWith('/i/lists')){
                                    if(auto_reload_target_elem.getAttribute("auto_reload_mouse_hover") == "false"){
                                        //カラムの自動更新が全体的に許可されていない場合は自動更新を無効化する
                                        if (auto_reload_target_elem.opd_auto_reload && is_auto_update()){
                                            auto_reload_target_elem.opd_auto_reload.Reload(auto_reload_target_elem.contentWindow);
                                            setTimeout(() => {
                                                auto_reload_target_elem.contentWindow.scrollTo({ top: 0, behavior: 'auto' });
                                            }, 100);
                                        }
                                    }
                                };
                            }, auto_reload_load_time);
                        }
                    }

                    //console.log(opd_column_div.querySelector(".opd_banner").checked)
                    if(mode != "session_set"){
                        //バナーチェックイベント
                        opd_column_banner_checkbox?.addEventListener("change", function(){
                            column_settings_save("", last_load_profile);
                            //console.log(this.closest("div[opd_column_type]").querySelector("iframe"))
                            let banner_mode_target_object = this.closest("div[opd_column_type]").querySelector("iframe");
                            //console.log(banner_mode_target_object.contentWindow.document.querySelector('head style[opd_banner_css]'))
                            if(banner_mode_target_object.contentWindow.document.querySelector('head style[opd_banner_css]') == null){
                                banner_mode_target_object.contentWindow.document.querySelector("head").insertAdjacentHTML("beforeend", `<style opd_banner_css></style>`);
                            }
                            if(this.checked != true){
                                //console.log(this)
                                banner_mode_target_object.contentWindow.document.querySelector('head style[opd_banner_css]').textContent = `header[role="banner"]{visibility: hidden; width: 0;};`;
                            }else{
                                //console.log("else")
                                banner_mode_target_object.contentWindow.document.querySelector('head style[opd_banner_css]').textContent = ``;
                            }
                        });

                        //トップ検索欄等削除イベント
                        opd_column_top_visible_checkbox?.addEventListener("change", function(){
                            column_settings_save("", last_load_profile);
                            let topvisible_mode_target_object = this.closest("div[opd_column_type]").querySelector("iframe");
                            //console.log(topvisible_mode_target_object.contentWindow.document.querySelector('head style[opd_top_visible_css]'))
                            if(topvisible_mode_target_object.contentWindow.document.querySelector('head style[opd_top_visible_css]') == null){
                                topvisible_mode_target_object.contentWindow.document.querySelector("head").insertAdjacentHTML("beforeend", `<style opd_top_visible_css></style>`);
                            }
                            if(this.checked != true){
                                //console.log(this)
                                //topvisible_mode_target_object.contentWindow.document.querySelector('head style[opd_top_visible_css]').textContent = `div[data-testid="primaryColumn"] div[tabindex="0"][aria-label] div:has(form[role="search"]), div[data-testid="primaryColumn"] div[tabindex="0"][aria-label] div:has(h2[role="heading"]){display:none;};`;
                                if(this.closest("div[opd_column_type]").getAttribute("opd_column_type") == "explore"){
                                    topvisible_mode_target_object.contentWindow.document.querySelector('head style[opd_top_visible_css]').textContent = `div[data-testid="primaryColumn"]>[tabindex="0"][aria-label]>div:nth-child(1){visibility: hidden; height: 0;top: calc(100vh - 60px);position: sticky;backdrop-filter: blur(0px) !important;}[data-testid="app-bar-back"]{visibility: visible;}div[data-testid="cellInnerDiv"]:has(button[aria-describedby], div[data-testid="UserAvatar-Container-unknown"]):not(:has(article[tabindex="-1"])){display:none;}`;
                                }else{
                                    //console.log(this.closest("div[opd_column_type]").getAttribute("opd_column_type"))
                                    if(this.closest("div[opd_column_type]").getAttribute("opd_column_type") == "home"){
                                        topvisible_mode_target_object.contentWindow.document.querySelector('head style[opd_top_visible_css]').textContent = `div[data-testid="primaryColumn"]>[tabindex="0"][aria-label]>div:nth-child(1){visibility: hidden; height: 0;top: calc(100vh - 60px);position: sticky;backdrop-filter: blur(0px) !important;} [data-testid="app-bar-back"]{visibility: visible;} div[aria-label="ホームタイムライン"] * +div:first-of-type [data-testid="cellInnerDiv"]{} div[role="progressbar"] + div{display:none;}div[data-testid="cellInnerDiv"]:has(button[aria-describedby], div[data-testid="UserAvatar-Container-unknown"]):not(:has(article[tabindex="-1"])){display:none;}`;
                                    }else{
                                        topvisible_mode_target_object.contentWindow.document.querySelector('head style[opd_top_visible_css]').textContent = `div[data-testid="primaryColumn"]>[tabindex="0"][aria-label]>div:nth-child(1){visibility: hidden; height: 0;top: calc(100vh - 60px);position: sticky;backdrop-filter: blur(0px) !important;}[data-testid="app-bar-back"]{visibility: visible;}div[data-testid="cellInnerDiv"]:has(button[aria-describedby], div[data-testid="UserAvatar-Container-unknown"]):not(:has(article[tabindex="-1"])){display:none;}`;
                                    }
                                }
                            }else{
                                //console.log("else")
                                topvisible_mode_target_object.contentWindow.document.querySelector('head style[opd_top_visible_css]').textContent = ``;
                            }
                        });
                    }
                
                    //Exproleピン止め
                    if(opd_column_pinned_checkbox != null){
                        if(mode != "session_set"){
                            opd_column_pinned_checkbox.addEventListener("click", function(){
                                if(this.checked){
                                    if(confirm(i18n_message("msg_explore_pin_confirm"))){
                                        const now_path = this.closest("div[opd_column_type]").getAttribute("opd_explore_path");
                                        this.closest("div[opd_column_type]").setAttribute("opd_pinned_path",now_path);
                                        column_settings_save("", last_load_profile);
                                    }else{
                                        this.checked = false;
                                    }
                                }else{
                                    if(confirm(i18n_message("msg_explore_unpin_confirm"))){
                                        this.closest("div[opd_column_type]").setAttribute("opd_pinned_path","");
                                        column_settings_save("", last_load_profile);
                                        this.checked = false;
                                    }else{
                                        this.checked = true;
                                    }
                                }
                            });
                        }
                    }
                    //自動更新モードイベント
                    if(opd_column_auto_reload_checkbox != null){
                        if(mode != "session_set"){
                            opd_column_auto_reload_checkbox.addEventListener("click", function(){
                                let auto_reload_target_object = this.closest("div[opd_column_type]").querySelector("iframe");
                                const auto_reload_time_input = this.closest("div[opd_column_type]").querySelector(".opd_a_reload_time_setting");
                                const auto_reload_time = Number(auto_reload_time_input.value) * 1000;
                                if(this.checked){
                                    auto_reload_time_input.disabled = true;
                                    auto_reload_int = setInterval(function(){
                                        //console.log("update!")
                                        //console.log(auto_reload_target_object.contentWindow)
                                        const path_name = auto_reload_target_object.contentWindow.location.pathname;
                                        if(['/home', '/search'].includes(path_name) || path_name.startsWith('/i/lists')){
                                            if(auto_reload_target_object.getAttribute("auto_reload_mouse_hover") == "false"){
                                                //カラムの自動更新が全体的に許可されていない場合は自動更新を無効化する
                                                if (auto_reload_target_object.opd_auto_reload && is_auto_update()){
                                                    auto_reload_target_object.opd_auto_reload.Reload(auto_reload_target_object.contentWindow);
                                                    setTimeout(() => {
                                                        auto_reload_target_object.contentWindow.scrollTo({ top: 0, behavior: 'auto' });
                                                    }, 500);
                                                }
                                            }
                                        };
                                    }, auto_reload_time);
                                    //console.log(auto_reload_time)
                                    column_settings_save("", last_load_profile);
                                }else{
                                    auto_reload_time_input.disabled = false;
                                    //console.log("update stop!")
                                    clearInterval(auto_reload_int);
                                    column_settings_save("", last_load_profile);
                                }
                            });
                        }
                    }
                    /*if(this.closest("div[opd_column_type]").getAttribute("opd_column_type") == "explore" || this.closest("div[opd_column_type]").getAttribute("opd_column_type") == "home"){
                    
                    }*/
                   if(mode != "session_set"){
                        //ツイート表示モードイベント
                        opd_column_tw_view_mode_opt.addEventListener("change", function(){
                            column_settings_save("", last_load_profile);
                            //console.log(this.closest("div[opd_column_type]").querySelector("iframe"))
                            let tw_view_mode_target_object = this.closest("div[opd_column_type]").querySelector("iframe");
                            //console.log(this.value)
                            if(tw_view_mode_target_object.contentWindow.document.querySelector('head style[opd_tw_view_mode_css]') == null){
                                tw_view_mode_target_object.contentWindow.document.querySelector("head").insertAdjacentHTML("beforeend", `<style opd_tw_view_mode_css></style>`);
                            }
                            switch (this.value) {
                                case "0":
                                    tw_view_mode_target_object.contentWindow.document.querySelector('head style[opd_tw_view_mode_css]').textContent = ``;
                                    break;
                                case "1":
                                    tw_view_mode_target_object.contentWindow.document.querySelector('head style[opd_tw_view_mode_css]').textContent = `div[data-testid="cellInnerDiv"]:has(div[aria-labelledby]){visibility: hidden; height: 0;}`;
                                    break;
                                case "2":
                                    tw_view_mode_target_object.contentWindow.document.querySelector('head style[opd_tw_view_mode_css]').textContent = `div[data-testid="cellInnerDiv"]:not(:has(div[aria-labelledby])){visibility: hidden; height: 0;}`;
                                    break;
                                default:
                                    tw_view_mode_target_object.contentWindow.document.querySelector('head style[opd_tw_view_mode_css]').textContent = ``;
                                    break;
                            }
                        })
                    }
                }

                //カラムバー空白領域クリックでトップにスクロール
                opd_column_scroll_to_top.addEventListener("click", (e) => { this.contentWindow.scrollTo({ top: 0, behavior: "auto" }); });

            }, {once: true})
            //exploreURL検出処理
            const opd_column_mutate = column_object[index].closest("div[opd_column_type]");
            if(opd_column_mutate.getAttribute("opd_column_type") == 'explore'){
                mutate_url(opd_column_mutate);
            }
        }
    }
    //URL, ページタイトル監視
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
            const second_rack_default_html = default_element.second_empty_column.html.replaceAll("%column_num%", create_random_id()).replace("%column_banner_ch%", "").replace("%column_tw_view_mode%", "0");
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

        const new_column = default_element["post"]["html"].replaceAll("%column_num%", create_random_id()).replace("%column_banner_ch%", "").replace("%column_top_bar_ch%", "checked").replace("%column_tw_view_mode%", "0").replaceAll("%column_width_num%", "30").replaceAll("%column_auto_reload_ch%", "").replaceAll("%column_auto_reload_time%", "10000");
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
        
        const new_column = default_element["home"]["html"].replaceAll("%column_num%", create_random_id()).replace("%column_banner_ch%", "").replace("%column_top_bar_ch%", "checked").replace("%column_tw_view_mode%", "0").replaceAll("%column_width_num%", "30").replaceAll("%column_auto_reload_ch%", "").replaceAll("%column_auto_reload_time%", "10000");
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
        
        const new_column = default_element["notification"]["html"].replaceAll("%column_num%", create_random_id()).replace("%column_banner_ch%", "").replace("%column_top_bar_ch%", "checked").replace("%column_tw_view_mode%", "0").replaceAll("%column_width_num%", "30");
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
                column_num: create_random_id(),
                column_banner_ch: "",
                column_top_bar_ch: "checked",
                column_tw_view_mode: "0",
                column_pinned_ch: "",
                column_pinned_save_path: "",
                column_save_title: "",
                column_width_num: "30",
                column_auto_reload_ch: "",
                column_auto_reload_time: "10000",
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
    //    リスト ID の解決は page world ヘルパー(extensions/list_picker_helper.js)が付ける属性と resolve_list_cell_info で行い、ID を決められないセルを選んだときは状態表示で手動入力を案内する
    //    選択中の listCell には data-opd-list-picker-order 属性(1 始まりの追加順)を付け、iframe に注入した style で枠と順番の数字を重ねる。X の仮想リストでセルが入れ替わるため、属性の付け直しは定期的(400ms)に行う
    //    読み込み中は iframe の上に skeleton を重ね、listCell が描画されたら外す。制限時間(15秒)内に描画されなければ skeleton を外して not_detected を表示する
    //    対象ページを表示した後に別のパスへ遷移した場合は対象 URL を読み込み直す(2回を超えて繰り返す場合は error を表示して読み込みを止める)。ログイン画面へ飛ばされた場合は読み込みを止めて login_required を表示する
    //  ・表示中のリストを全て選択するボタン(そのとき ID を決められている listCell を文書順に、未選択のものだけ選択の末尾へ追加する)
    //  選択領域:
    //  ・追加するカラムの順序付き一覧(ol)。項目は追加した順に並び、この並び順のままカラムを追加する。項目のドラッグ&ドロップ(項目の上半分に落とすとその前、下半分に落とすとその後ろ、項目以外の場所に落とすと末尾)と、項目にフォーカスした状態の Alt+↑ / Alt+↓ で1段ずつ並べ替え、各項目の除外ボタンで外せる。並べ替えの結果は選択領域の状態表示(role="status")で知らせる
    //  ・URL か ID の入力欄(textarea)と追加ボタン。1 行 1 件として解釈し、解釈できた行を一覧の末尾へ追加する(既にある項目は追加しない)。解釈できない行は alert で知らせて入力欄に残し、入力欄へフォーカスを戻す。Enter で追加、Shift+Enter で改行
    //  ・追加するカラム件数の表示と選択解除ボタン
    //  操作ボタン: 追加ボタン・キャンセルボタン。追加時に入力欄へ未追加の文字列が残っていれば先に追加を試み、解釈できない行があれば追加を中止する
    //Esc キー(iframe 内で押した場合を含む)・キャンセルボタン・オーバーレイ背景のクリックで閉じ、閉じるときは待機中のタイマーと iframe の内容を破棄して opener_element にフォーカスを戻す
    //開いているあいだは overlay 以外の #opd_main_element の子要素を inert にして背景を操作対象から外し、閉じるときに解除する(元から inert が付いていた要素は触らない)
    //Tab はダイアログ内のフォーカス可能要素(iframe を含む)を循環させる。iframe 内では X の画面のフォーカス移動に任せる
    //追加時は一覧の並び順のままパスを add_explore_columns に渡す
    //ダイアログ内の要素には .dsp_column クラス・opd_column_type 属性・opd_init_webview 属性・.column_close_btn クラスを付けない(カラムを一括走査するセレクタに拾われるため)
    function open_list_picker_dialog(insert_first, opener_element){
        const main_element = document.getElementById("opd_main_element");
        if(main_element === null) return;
        //ダイアログ内でフォーカスを受け取れる要素(非表示・disabled のものを除く)を文書順で返す
        function get_focusable_elements(dialog_element){
            const focus_candidates = dialog_element.querySelectorAll('input, textarea, button, iframe, [tabindex]:not([tabindex="-1"])');
            return Array.from(focus_candidates).filter((element) => !element.disabled && element.offsetParent !== null);
        }
        //既に開いている場合は二重に生成せず、開いているダイアログへフォーカスを移す
        const opened_overlay = document.getElementById("opd_list_picker_overlay");
        if(opened_overlay !== null){
            const opened_dialog = opened_overlay.querySelector(".opd_list_picker_dialog");
            if(opened_dialog !== null) get_focusable_elements(opened_dialog)[0]?.focus();
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
        overlay.className = "opd_list_picker_overlay";
        //骨格は拡張が持つ静的な文字列だけで組み立てる(X 由来の文字列は生成後に textContent などで入れる)
        overlay.innerHTML = `<div class="opd_list_picker_dialog" role="dialog" aria-modal="true" aria-labelledby="opd_list_picker_title">
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
        const inert_applied_elements = [];
        Array.from(main_element.children).forEach((child) => {
            if(child === overlay || child.hasAttribute("inert")) return;
            child.setAttribute("inert", "");
            inert_applied_elements.push(child);
        });
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
        function update_count(){
            count_area.textContent = i18n_message("ui_list_picker_selected_count", [String(selected_entries.length)]);
        }
        //選択領域の順序付き一覧を描き直す。フォーカスが一覧の中にあった場合は同じ項目(または同じ項目の除外ボタン)へ戻す
        function render_selection(){
            const active_element = document.activeElement;
            const active_item = (active_element !== null && selected_list.contains(active_element)) ? active_element.closest(selected_item_selector) : null;
            const active_path = active_item === null ? null : active_item.getAttribute("data-list-path");
            const is_active_remove_btn = active_element !== null && active_element.classList.contains("opd_list_picker_remove_btn");
            const saved_scroll_top = selected_wrap.scrollTop;
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
        }
        //listCell 内のクリックはページ遷移させず、左クリックだけ選択の切り替えにする
        function on_frame_click(event){
            const cell = event.target instanceof Element ? event.target.closest(list_cell_selector) : null;
            if(cell === null) return;
            event.preventDefault();
            event.stopPropagation();
            if(event.type !== "click" || event.button !== 0) return;
            toggle_cell(cell);
        }
        //iframe 内の Esc でもダイアログを閉じる。listCell 上の Enter / Space はページ遷移させず選択の切り替えにする
        function on_frame_keydown(event){
            if(event.key === "Escape"){
                event.preventDefault();
                event.stopPropagation();
                close_dialog();
                return;
            }
            if(event.key !== "Enter" && event.key !== " ") return;
            const cell = event.target instanceof Element ? event.target.closest(list_cell_selector) : null;
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
            let is_name_filled = false;
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
                    is_name_filled = true;
                }
            });
            if(is_name_filled) render_selection();
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
        //読み込みを打ち切り、skeleton を外して理由を表示する
        function finish_frame_loading(message){
            stop_frame_poll();
            set_frame_loading(false);
            status_area.textContent = message;
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
                finish_frame_loading(i18n_message("ui_list_picker_error"));
                return;
            }
            const elapsed_ms = Date.now() - frame_load_started_at;
            const is_timed_out = is_frame_loading && elapsed_ms >= frame_load_limit_ms;
            //読み込み前の about:blank と本文が無い状態は判定材料にならないので次回に回す
            if(!frame_document || frame_document.location.href === "about:blank" || !frame_document.body){
                //本文を一度も読めないまま制限時間を過ぎた場合は読み込み自体に失敗している
                if(is_timed_out) finish_frame_loading(has_frame_document ? i18n_message("ui_list_picker_not_detected") : i18n_message("ui_list_picker_error"));
                return;
            }
            has_frame_document = true;
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
            //リスト一覧ページを表示できたら捕捉・style・ヘルパーを入れる(入れ済みの document では何もしない)
            prepare_frame_document(frame_document);
            ensure_frame_style(frame_document);
            inject_list_picker_helper(frame_document);
            request_helper_scan(frame_document);
            mark_frame_cells();
            if(!is_frame_loading) return;
            if(frame_document.querySelector(list_cell_selector) !== null){
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
        //読み込みが終わっても中身を読めない(エラーページなど)場合は、制限時間を待たずにエラーとして終了する
        function on_frame_load(){
            if(!is_frame_loading) return;
            //中身を読める場合は about:blank でもポーリングの継続に任せる
            if(get_frame_document() !== null) return;
            finish_frame_loading(i18n_message("ui_list_picker_error"));
        }
        //ダイアログを閉じ、タイマーと iframe の内容を解放してフォーカスを開いた要素へ戻す
        function close_dialog(){
            stop_frame_poll();
            document.removeEventListener("keydown", on_dialog_keydown);
            frame.removeEventListener("load", on_frame_load);
            overlay_observer.disconnect();
            navigate_frame("about:blank");
            inert_applied_elements.forEach((element) => element.removeAttribute("inert"));
            overlay.remove();
            opener_element?.focus?.();
        }
        //Esc で閉じ、Tab はダイアログ内のフォーカス可能要素を循環させる
        function on_dialog_keydown(event){
            if(event.key === "Escape"){
                event.preventDefault();
                close_dialog();
                return;
            }
            if(event.key !== "Tab") return;
            const focusable_elements = get_focusable_elements(dialog);
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
        }
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
        //そのとき ID を決められている表示中のセルを文書順に、未選択のものだけ末尾へ追加する
        select_all_btn.addEventListener("click", function(){
            const frame_document = get_frame_document();
            if(!frame_document) return;
            request_helper_scan(frame_document);
            collect_lists_from_document(frame_document).forEach((list_info) => add_entry(list_info.path, list_info.name));
            render_selection();
            mark_frame_cells();
        });
        clear_all_btn.addEventListener("click", function(){
            selected_entries.length = 0;
            render_selection();
            mark_frame_cells();
        });
        manual_add_btn.addEventListener("click", add_manual_entries);
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
            event.dataTransfer.setData("text/plain", dragging_path);
            item.classList.add("opd_list_picker_dragging");
        });
        selected_list.addEventListener("dragend", function(){
            dragging_path = null;
            clear_drop_marks();
            selected_list.querySelectorAll(selected_item_selector).forEach((item) => item.classList.remove("opd_list_picker_dragging"));
        });
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
            clear_drop_marks();
            const drop_target = drop_target_from_event(event);
            const from_index = entry_index_of(dragging_path);
            if(from_index === -1 || drop_target.index === -1) return;
            move_entry_and_render(dragging_path, insert_index_of_drop(from_index, drop_target));
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
    //プロファイル保存ボタン
    document.getElementById("profile_save").addEventListener("click", function(){
        if(confirm(i18n_message("msg_profile_save_confirm"))){
            let profile = column_settings_save("profile_out");
            const save_object = {name:"user_profile", profile:profile.column_settings};
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
                const pin_checkbox = this.closest(".dsp_column").querySelector(".opd_pinned_btn")?.checked;
                if(pin_checkbox == false || pin_checkbox == undefined){
                    this.closest(".dsp_column").remove();
                    append_object_css();
                    column_settings_save("", last_load_profile);
                }else{
                    if(confirm(i18n_message("msg_pinned_column_close_confirm"))){
                        this.closest(".dsp_column").remove();
                        append_object_css();
                        column_settings_save("", last_load_profile);
                    }
                }
            })
        }
    }
    //カラム構成保存
    function column_settings_save(mode, profile_num){
        let settings_array = {
            column_settings:[],
            version:manifest.version
        };
        for (let index = 0; index < document.querySelectorAll("#opd_main_element div[opd_column_type]").length; index++) {
            let banner_checked = null;
            let top_visible_checked = null;
            let tw_view_type = null;
            let column_open_path = null;
            let column_pinned_save_path = null;
            let column_page_title = null;
            let column_width_value = null;
            let column_auto_reload = null;
            let column_auto_reload_time = 10000;
            if(document.querySelectorAll("#opd_main_element div[opd_column_type]")[index].querySelector(".opd_banner")?.checked == true){
                banner_checked = true;
            }else{
                banner_checked = false;
            }
            //トップ検索欄等 
            if(document.querySelectorAll("#opd_main_element div[opd_column_type]")[index].querySelector(".opd_top_bar")?.checked == true){
                top_visible_checked = true;
            }else{
                top_visible_checked = false;
            }
            //
            if(document.querySelectorAll("#opd_main_element div[opd_column_type]")[index].querySelector(".opd_tw_view_mode")?.value != undefined){
                tw_view_type = document.querySelectorAll("#opd_main_element div[opd_column_type]")[index].querySelector(".opd_tw_view_mode").value;
            }else{
                tw_view_type = "0";
            }
            //横幅設定
            if(document.querySelectorAll("#opd_main_element div[opd_column_type]")[index].getAttribute("opd_column_width") != "null"){
                //console.log(document.querySelectorAll("#opd_main_element div[opd_column_type]")[index].getAttribute("opd_column_width"))
                column_width_value = document.querySelectorAll("#opd_main_element div[opd_column_type]")[index].getAttribute("opd_column_width");
            }
            //exploreの処理
            if(document.querySelectorAll("#opd_main_element div[opd_column_type]")[index].getAttribute("opd_column_type") == 'explore'){
                //console.log(document.querySelectorAll("#opd_main_element div[opd_column_type]")[index].getAttribute("opd_explore_path"));
                column_open_path = document.querySelectorAll("#opd_main_element div[opd_column_type]")[index].getAttribute("opd_explore_path");
                //ピン止め
                column_pinned_save_path = document.querySelectorAll("#opd_main_element div[opd_column_type]")[index].getAttribute("opd_pinned_path");
                //タイトル
                column_page_title = document.querySelectorAll("#opd_main_element div[opd_column_type]")[index].getAttribute("opd_explore_title");
            }else{
                column_open_path = "";
                column_pinned_save_path = "";
            }
            //自動更新
            if(document.querySelectorAll("#opd_main_element div[opd_column_type]")[index].getAttribute("opd_column_type") == 'explore' || document.querySelectorAll("#opd_main_element div[opd_column_type]")[index].getAttribute("opd_column_type") == 'home'){
                if(document.querySelectorAll("#opd_main_element div[opd_column_type]")[index].querySelector(".opd_a_reload_bar")?.checked == true){
                    column_auto_reload = true;
                }else{
                    column_auto_reload = false;
                }
                const column_setting_time = Number(document.querySelectorAll("#opd_main_element div[opd_column_type]")[index].querySelector(".opd_a_reload_time_setting").value) * 1000;
                //console.log(column_setting_time)
                if(column_setting_time >= 1000){
                    
                    column_auto_reload_time = column_setting_time;
                }else{
                    column_auto_reload_time = 10000;
                }
            }
            settings_array["column_settings"].push({type:document.querySelectorAll("#opd_main_element div[opd_column_type]")[index].getAttribute("opd_column_type"), banner:banner_checked, top_visible:top_visible_checked, tw_view_mode:tw_view_type, column_save_path:column_open_path, column_save_title:column_page_title, column_pinned_path:column_pinned_save_path, auto_reload:column_auto_reload, auto_reload_time:column_auto_reload_time, column_width:column_width_value});
        }
        if(mode == "profile_out"){
            return settings_array;
        }else{
            //console.log(settings_array);
            /*chrome.storage.local.set({'opd_settings': JSON.stringify(settings_array)}, function () {
                console.log(settings_array);
            });*/
            const save_object = {name:"user_profile", profile:settings_array.column_settings};
            //profile_store.push(save_object);
            Object.assign(profile_store[profile_num], save_object);
            //console.log(profile_store);
            chrome.storage.local.set({'opd_profile_store': JSON.stringify(profile_store)}, function () {
                //console.log(settings_array);
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

//カラムテンプレートの %name% プレースホルダーを values の同名キーで一括置換する
//1 パスで置換し、埋めた値を再走査しないため、値に %...% が含まれていても再展開されない
function fill_column_template(template_html, values){
    return template_html.replace(/%([a-z_]+)%/g, (token, name) => Object.hasOwn(values, name) ? String(values[name]) : token);
}
//Explore系カラムのパスからカラムバーに表示するタイトルを決める
function get_explore_column_title(path){
    const list_path_pattern = /^\/(?:i\/lists|[^\/?#]+\/lists)(?:[\/?#]|$)/;
    if(list_path_pattern.test(path ?? "")) return i18n_message("ui_column_list_title");
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
//リスト一覧ページの Document から、そのページに並んでいるリストを列挙する
//doc: リスト一覧ページの Document
//戻り値: {id: リストID, path: "/i/lists/<id>", name: リスト名(取得できない場合は空文字), section: 直前の h2 見出し文(見出しが無い場合は空文字)} の配列
//走査範囲は [data-testid="primaryColumn"] の配下のみとし、それが無い文書(リスト一覧ページ以外や描画前)は空配列を返す
//h2, a[href], [data-testid="listCell"] を文書順に走査し、直前に現れた h2 の見出し文をそのリストのセクション名として扱う
//a[href] は href から /i/lists/<id> の ID を取る。ただし listCell を含む a[href] は listCell 側で扱い、リンクとしては収集しない
//listCell の ID とリスト名は resolve_list_cell_info で取り出し、ID を決められないセルは戻り値に含めない
//同一 id は最初に見つかった1件のみ含める
function collect_lists_from_document(doc){
    const root = doc.querySelector('[data-testid="primaryColumn"]');
    if(!root) return [];
    const found_lists = new Map();
    let current_section = "";
    //見出し・リンク・listCell を文書順に走査し、直前に現れた見出しをそのリストのセクション名として扱う
    const scan_targets = root.querySelectorAll('h2, a[href], [data-testid="listCell"]');
    for (let index = 0; index < scan_targets.length; index++) {
        const scan_target = scan_targets[index];
        if(scan_target.tagName === "H2"){
            current_section = scan_target.textContent.trim();
            continue;
        }
        if(scan_target.getAttribute("data-testid") === "listCell"){
            const cell_info = resolve_list_cell_info(scan_target, doc.location.href);
            if(cell_info === null || found_lists.has(cell_info.id)) continue;
            found_lists.set(cell_info.id, {id: cell_info.id, path: `/i/lists/${cell_info.id}`, name: cell_info.name, section: current_section});
            continue;
        }
        //セルを包むリンクは listCell 側で解決させ、リスト名をセルの文言から取れるようにする
        if(scan_target.querySelector('[data-testid="listCell"]') !== null) continue;
        const list_id = extract_list_id_from_href(scan_target.getAttribute("href"), doc.location.href);
        if(list_id === null || found_lists.has(list_id)) continue;
        //リンク配下の span のうち最初に現れる非空のテキストをリスト名として使い、非空の span が無ければリンク自体のテキストを使う
        let list_name = first_non_empty_span_text(scan_target);
        if(list_name === "") list_name = scan_target.textContent.trim();
        found_lists.set(list_id, {id: list_id, path: `/i/lists/${list_id}`, name: list_name, section: current_section});
    }
    return Array.from(found_lists.values());
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
function settings_init(){
    const profile_store_default = [{type:"main_bar_empty_column", banner:false, top_visible:true, tw_view_mode:"0", column_save_path:"", column_save_title:"", column_pinned_path:"", auto_reload:false, auto_reload_time:10000, column_width:null}, {type:"home", banner:true, top_visible:true, tw_view_mode:"0", column_save_path:"", column_save_title:"", column_pinned_path:"", auto_reload:false, auto_reload_time:10000, column_width:null}, {type:"notification", banner:false, top_visible:true, tw_view_mode:"0", column_save_path:"", auto_reload:false, auto_reload_time:10000, column_pinned_path:"", column_save_title:"", column_width:null}, {type:"explore", banner:false, top_visible:true, tw_view_mode:"0", exp_type:"", column_save_path:"/explore", column_save_title:"", column_pinned_path:"", auto_reload:false, auto_reload_time:10000, column_width:null}, {type:"empty_column", banner:false, top_visible:true, tw_view_mode:"0", column_save_path:"", column_save_title:"", column_pinned_path:"", auto_reload:false, auto_reload_time:10000, column_width:null}];
    const settings = {
        last_load_profile:0,
        //column_settings:[{type:"main_bar_empty_column", banner:false, top_visible:true, tw_view_mode:"0", column_save_path:"", column_pinned_path:"", column_width:null}, {type:"home", banner:true, top_visible:true, tw_view_mode:"0", column_save_path:"", column_pinned_path:"", column_width:null}, {type:"notification", banner:false, top_visible:true, tw_view_mode:"0", column_save_path:"", column_pinned_path:"", column_width:null}, {type:"explore", banner:false, top_visible:true, tw_view_mode:"0", exp_type:"", column_save_path:"/explore", column_pinned_path:"", column_width:null}, {type:"empty_column", banner:false, top_visible:true, tw_view_mode:"0", column_save_path:"", column_pinned_path:"", column_width:null}],
        version:manifest.version
    };
    let profile = [{name:"default", profile: profile_store_default}];
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
