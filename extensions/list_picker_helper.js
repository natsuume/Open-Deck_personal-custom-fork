//リスト選択ダイアログの probe iframe(リスト一覧ページ)に page world で注入され、
//[data-testid="primaryColumn"] 配下の div[data-testid="listCell"] にリスト ID とリスト名を属性として付与する
//読み込み時: document.documentElement に属性 data-opd-list-picker-helper="ready" を設定する(content.js はこの値を見て走査を依頼する)
//入力: document に dispatch される CustomEvent "opd_list_picker_scan"(detail 無し)。受信のたびに走査を1回行う。走査は同期的に完了し、dispatch の直後に属性が読める
//出力: 各 listCell の data-opd-list-id(/^[1-9]\d{0,19}$/ に一致する文字列)と data-opd-list-name(リスト名)
//      走査の先頭で全 listCell の両属性をいったん削除し、解決できたセルにだけ再設定する(X の仮想リストが DOM ノードを再利用しても古い ID が残らないようにする)
//解決方法: listCell の __reactFiber$… から return チェーンを祖先方向に最大 50 段遡り、各 fiber の memoizedProps を
//          深さ4(memoizedProps 自体を深さ0とする)・訪問オブジェクト数 300 個・配列先頭 50 要素までの範囲で探索し、最も近い祖先で見つかった候補を採用する
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
    const list_id_pattern = /^[1-9]\d{0,19}$/;
    const list_only_fields = ["member_count", "subscriber_count", "mode"];
    const max_ancestor_steps = 50;
    const max_search_depth = 4;
    const max_visited_objects = 300;
    const max_array_elements = 50;

    //elem: React が描画した DOM 要素
    //戻り値: elem に紐づく fiber。elem が無い場合と fiber のキーが見つからない場合は null
    //React が DOM 要素へ付ける __reactFiber$… という expando プロパティを名前から探して返す
    const get_fiber = (elem) => {
        if(!elem) return null;
        const fiber_key = Object.getOwnPropertyNames(elem).find((key) => key.startsWith("__reactFiber$"));
        return fiber_key ? elem[fiber_key] : null;
    };

    //value: 判定するオブジェクト
    //戻り値: 中を探索せず葉として扱う値なら true
    //読み進めても props の情報が増えない値(DOM・Window・コレクション・Promise)を除外する。判定中の例外は葉として扱う
    const is_leaf_object = (value) => {
        try{
            if(value instanceof Node) return true;
            if(value === window || value instanceof Window) return true;
            if(value instanceof Map || value instanceof Set) return true;
            if(value instanceof WeakMap || value instanceof WeakSet) return true;
            if(value instanceof Promise) return true;
        }catch(e){
            return true;
        }
        return false;
    };

    //value: 候補かどうかを判定する任意の値、span_texts: listCell 内の span テキストの集合
    //戻り値: 候補条件を満たす場合は {id: リストID, name: リスト名} 、満たさない場合は null
    //value 単体を見てリストの情報かどうかを判定する(子要素の探索は行わない)
    const as_list_candidate = (value, span_texts) => {
        if(typeof value !== "object" || value === null) return null;
        try{
            const type_name = value.__typename;
            if(typeof type_name === "string" && type_name !== "List") return null;
            const legacy = (typeof value.legacy === "object" && value.legacy !== null) ? value.legacy : null;
            const core = (typeof value.core === "object" && value.core !== null) ? value.core : null;
            //リストとユーザーは似た形で渡ってくるため、screen_name を持つものはユーザー情報として除外する
            if(typeof value.screen_name === "string") return null;
            if(legacy !== null && typeof legacy.screen_name === "string") return null;
            if(core !== null && typeof core.screen_name === "string") return null;

            const id_sources = [value.id_str, value.rest_id, legacy === null ? undefined : legacy.id_str];
            let list_id = null;
            for (let index = 0; index < id_sources.length; index++) {
                const id_source = id_sources[index];
                if(typeof id_source === "string" && list_id_pattern.test(id_source)){
                    list_id = id_source;
                    break;
                }
            }
            if(list_id === null) return null;

            const name_sources = [value.name, legacy === null ? undefined : legacy.name];
            let list_name = null;
            for (let index = 0; index < name_sources.length; index++) {
                const name_source = name_sources[index];
                if(typeof name_source === "string" && name_source.trim() !== ""){
                    list_name = name_source.trim();
                    break;
                }
            }
            if(list_name === null) return null;

            //ID と名前を持つだけのオブジェクトはリスト以外にもあるため、リストである根拠を1つ以上求める
            const has_list_only_field = list_only_fields.some((field) => {
                if(value[field] !== undefined) return true;
                return legacy !== null && legacy[field] !== undefined;
            });
            if(type_name !== "List" && !has_list_only_field && !span_texts.has(list_name)) return null;
            return {id: list_id, name: list_name};
        }catch(e){
            //読み取りの途中で例外が出たオブジェクトは候補にしない
            return null;
        }
    };

    //root_value: 探索の起点となる値(fiber の memoizedProps)、span_texts: listCell 内の span テキストの集合
    //戻り値: 起点の配下から見つかった候補 {id, name} の配列(見つからない場合は空配列)
    //深さ・訪問オブジェクト数・配列要素数の上限を守りながら root_value を辿り、各値を as_list_candidate に掛ける
    const find_list_candidates = (root_value, span_texts) => {
        const candidates = [];
        const visited = new WeakSet();
        let visited_count = 0;
        const stack = [{value: root_value, depth: 0}];
        while(stack.length > 0){
            const entry = stack.pop();
            const value = entry.value;
            if(typeof value !== "object" || value === null) continue;
            if(visited.has(value)) continue;
            visited.add(value);
            visited_count++;
            if(visited_count > max_visited_objects) break;
            //React element は描画の指示であってリストの情報ではないため、判定も探索もしない
            let is_react_element = false;
            try{
                is_react_element = value.$$typeof !== undefined;
            }catch(e){
                continue;
            }
            if(is_react_element) continue;

            const candidate = as_list_candidate(value, span_texts);
            if(candidate !== null) candidates.push(candidate);
            if(entry.depth >= max_search_depth) continue;
            if(is_leaf_object(value)) continue;

            if(Array.isArray(value)){
                const element_limit = Math.min(value.length, max_array_elements);
                for (let index = 0; index < element_limit; index++) {
                    stack.push({value: value[index], depth: entry.depth + 1});
                }
                continue;
            }
            let descriptors = null;
            try{
                descriptors = Object.getOwnPropertyDescriptors(value);
            }catch(e){
                //キーを列挙できないオブジェクトはそこで打ち切る
                continue;
            }
            const keys = Object.keys(descriptors);
            for (let index = 0; index < keys.length; index++) {
                const key = keys[index];
                //React や内部実装が使う "_" 始まりのキーは、リストの型名を除いて読まない
                if(key.startsWith("_") && key !== "__typename") continue;
                const descriptor = descriptors[key];
                //getter を呼ばずに済む data descriptor だけを読む
                if(!("value" in descriptor)) continue;
                stack.push({value: descriptor.value, depth: entry.depth + 1});
            }
        }
        return candidates;
    };

    //cell: div[data-testid="listCell"] の要素
    //戻り値: リスト ID と名前を一意に決められた場合は {id, name} 、決められない場合は null
    //cell の fiber から祖先方向へ遡り、最も近い祖先で見つかった候補を採用する
    const resolve_list_info = (cell) => {
        const span_texts = new Set();
        const spans = cell.querySelectorAll("span");
        for (let index = 0; index < spans.length; index++) {
            const span_text = spans[index].textContent.trim();
            if(span_text !== "") span_texts.add(span_text);
        }
        const primary_column = document.querySelector('[data-testid="primaryColumn"]');
        let fiber = get_fiber(cell);
        for (let step = 0; fiber && step < max_ancestor_steps; step++) {
            //リスト一覧より外側の props にはリストごとの情報が無いため、そこに達したら諦める
            if(fiber.tag === 3) return null;
            const state_node = fiber.stateNode;
            if(state_node && (state_node === primary_column || state_node === document.body)) return null;

            const candidates = find_list_candidates(fiber.memoizedProps, span_texts);
            if(candidates.length > 0){
                //同じ段に別々のリストが並んでいる場合はどれがこのセルのものか決められない
                const candidate_ids = new Set(candidates.map((candidate) => candidate.id));
                if(candidate_ids.size !== 1) return null;
                return {id: candidates[0].id, name: candidates[0].name};
            }
            fiber = fiber.return;
        }
        return null;
    };

    //引数なし
    //戻り値: なし
    //primaryColumn 配下の全 listCell について属性をいったん削除し、解決できたセルにだけ data-opd-list-id / data-opd-list-name を設定する
    const scan_list_cells = () => {
        const primary_column = document.querySelector('[data-testid="primaryColumn"]');
        if(primary_column === null) return;
        const cells = primary_column.querySelectorAll('div[data-testid="listCell"]');
        for (let index = 0; index < cells.length; index++) {
            cells[index].removeAttribute("data-opd-list-id");
            cells[index].removeAttribute("data-opd-list-name");
        }
        for (let index = 0; index < cells.length; index++) {
            try{
                const list_info = resolve_list_info(cells[index]);
                if(list_info === null) continue;
                cells[index].setAttribute("data-opd-list-id", list_info.id);
                cells[index].setAttribute("data-opd-list-name", list_info.name);
            }catch(e){
                //解決に失敗したセルは属性を付けないままにして、次回の走査で試し直す
            }
        }
    };

    //content.js からの走査依頼を受け取る。受信のたびに走査を1回、同期的に行う
    document.addEventListener("opd_list_picker_scan", () => {
        scan_list_cells();
    }, true);

    //走査を受け付けられる状態になったことを content.js へ知らせる
    document.documentElement.setAttribute("data-opd-list-picker-helper", "ready");
})();
