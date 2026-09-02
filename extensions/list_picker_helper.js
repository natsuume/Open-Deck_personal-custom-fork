//リスト選択ダイアログの probe iframe(リスト一覧ページ)に page world で注入され、
//[data-testid="primaryColumn"] 配下の div[data-testid="listCell"] にリスト ID とリスト名を属性として付与する
//読み込み時: document.documentElement に属性 data-opd-list-picker-helper="ready" を設定する(content.js はこの値を見て走査を依頼する)
//入力: document に dispatch される CustomEvent "opd_list_picker_scan"(detail 無し)。受信のたびに走査を1回行う。走査は同期的に完了し、dispatch の直後に属性が読める
//出力: 各 listCell の data-opd-list-id(/^[1-9]\d{0,19}$/ に一致する文字列)と data-opd-list-name(リスト名)
//      走査の先頭で全 listCell の両属性をいったん削除し、解決できたセルにだけ再設定する(X の仮想リストが DOM ノードを再利用しても古い ID が残らないようにする)
//解決方法: listCell の __reactFiber$… から return チェーンを祖先方向に最大 50 段遡り、各 fiber の memoizedProps を
//          深さ4・訪問オブジェクト数 300 個・配列先頭 50 要素までの範囲で探索し、最も近い祖先で見つかった候補を採用する
//          HostRoot(tag === 3)または stateNode が primaryColumn 要素・document.body に達したら打ち切る
//候補条件: ID は id_str / rest_id / legacy.id_str のうち /^[1-9]\d{0,19}$/ に一致する文字列(Number 化しない)、名前は name / legacy.name の非空文字列
//          オブジェクト自身・legacy・core のいずれかに文字列の screen_name があればユーザー情報として除外する
//          __typename が文字列で "List" 以外なら除外する
//          さらに「__typename === "List"」「member_count / subscriber_count / mode のいずれかを自身または legacy に持つ」
//          「名前が listCell 内のいずれかの span のテキストと一致する」のどれか1つ以上を満たすものだけを候補とする
//          同じ祖先段で異なる ID の候補が複数見つかった場合は属性を書かない(誤検出より未検出を選ぶ)
//探索の安全策: Object.getOwnPropertyDescriptors で data descriptor の value のみ読む(getter は呼ばない)
//              関数・DOM Node・Window・Map/Set/WeakMap/WeakSet・Promise・React element($$typeof を持つ)は葉として扱う
//              "_" 始まりのキーは __typename を除き読まない
//              訪問済み集合で循環を避け、例外が出たオブジェクトはその場で打ち切る
//              1セルの処理は try/catch で囲み、失敗したセルは属性無しのままにする(次回の走査で再試行される)
(() => {
    //elem: React が描画した DOM 要素
    //戻り値: elem に紐づく fiber。elem が無い場合と fiber のキーが見つからない場合は null
    //React が DOM 要素へ付ける __reactFiber$… という expando プロパティを名前から探して返す
    const get_fiber = (elem) => {
        if(!elem) return null;
        const fiber_key = Object.getOwnPropertyNames(elem).find((key) => key.startsWith("__reactFiber$"));
        return fiber_key ? elem[fiber_key] : null;
    };

    //value: 候補かどうかを判定する任意の値、span_texts: listCell 内の span テキストの集合
    //戻り値: 候補条件を満たす場合は {id: リストID, name: リスト名} 、満たさない場合は null
    //value 単体を見てリストの情報かどうかを判定する(子要素の探索は行わない)
    const as_list_candidate = (value, span_texts) => {
        return null;
    };

    //root_value: 探索の起点となる値(fiber の memoizedProps)、span_texts: listCell 内の span テキストの集合
    //戻り値: 起点の配下から見つかった候補 {id, name} の配列(見つからない場合は空配列)
    //深さ・訪問オブジェクト数・配列要素数の上限を守りながら root_value を辿り、各値を as_list_candidate に掛ける
    const find_list_candidates = (root_value, span_texts) => {
        return [];
    };

    //cell: div[data-testid="listCell"] の要素
    //戻り値: リスト ID と名前を一意に決められた場合は {id, name} 、決められない場合は null
    //cell の fiber から祖先方向へ遡り、最も近い祖先で見つかった候補を採用する
    const resolve_list_info = (cell) => {
        return null;
    };

    //引数なし
    //戻り値: なし
    //primaryColumn 配下の全 listCell について属性をいったん削除し、解決できたセルにだけ data-opd-list-id / data-opd-list-name を設定する
    const scan_list_cells = () => {
        return;
    };

    //content.js からの走査依頼を受け取る。受信のたびに走査を1回、同期的に行う
    document.addEventListener("opd_list_picker_scan", () => {
        scan_list_cells();
    }, true);

    //走査を受け付けられる状態になったことを content.js へ知らせる
    document.documentElement.setAttribute("data-opd-list-picker-helper", "ready");
})();
