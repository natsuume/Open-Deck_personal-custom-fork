//自動更新のヘルパー。カラム iframe の page world で動き、content script (extensions/auto_reload.js) からの CustomEvent で指示を受ける
//
//受け取るイベント (detail は JSON 文字列):
//  'opd_column_reload_init'  {token}            照合用トークンを受け取る。以後の 'opd_column_reload' はトークンが一致するものだけ処理する
//  'opd_column_reload'       {token, keep_top}  タイムラインを更新する。keep_top が true なら更新直後に先頭保持を始める (下記)
//
//更新関数の探索 (reload_func):
//  div[data-testid="primaryColumn"] 内の section[role="region"] を先に、続けて document 内の残りの section[role="region"] を、それぞれ文書順に候補として並べ、
//  候補の Fiber から親方向へ辿って onRefresh を持つ props が最初に取れた候補を使う (候補の要素があっても onRefresh が取れなければ次の候補へ進む)。
//  どの候補からも取れなければ更新せず console.warn を 1 回出す (次に取れるまで繰り返さない)。
//
//先頭保持 (keep_top):
//  開始条件: keep_top が true で、更新関数を呼ぶ直前の window.scrollY が 1 以下で、更新関数を取得して呼べた (更新関数が無い・呼び出しが例外のときは始めない)
//  保持中: window の scroll で scrollY が 0 より大きくなったとき、直前 KEEP_TOP_MUTATION_WINDOW_MS 以内にタイムライン側 (div[data-testid="primaryColumn"]、無ければ document 全体) の childList の変化 (新着の挿入) があれば
//          新着挿入に伴う位置合わせと見なして scrollTo({top:0, behavior:"instant"}) で先頭へ戻す (開始から同じ時間内の scroll も更新関数自身による位置変更と見なして戻す)。
//          どちらでもなければユーザ操作によるスクロール (スクロールバーのドラッグ等) と見なして保持を終える
//  終了条件: 開始から KEEP_TOP_WATCH_MS 経過 / 戻した回数が KEEP_TOP_MAX_CORRECTIONS に達した / ユーザ操作 (wheel・touchstart・pointerdown・mousedown・keydown を capture で検知、または上記の DOM 変化を伴わない scroll) があった
//  世代管理: 開始のたびに世代番号を進め、古い世代のタイマーと scroll 処理は何もしない (新しい更新が始まったら前の保持は無効になる)
//  isFocusDisabled (更新直後の focus / scrollIntoView の抑制) とは別の状態として持つ
(() => {
    //先頭保持を打ち切るまでの監視時間 (ms) と、先頭へ戻す回数の上限
    const KEEP_TOP_WATCH_MS = 8000;
    const KEEP_TOP_MAX_CORRECTIONS = 5;
    //scroll を新着挿入に伴うものと見なす、直前の DOM 変化からの経過時間の上限 (ms)
    const KEEP_TOP_MUTATION_WINDOW_MS = 250;
    let opd_reload_token = null;
    let isFocusDisabled = false;
    
    //ユーザー操作でフォーカス無効化を解除する
    ['mousedown', 'keydown', 'touchstart'].forEach(type => {
        document.addEventListener(type, () => {
            isFocusDisabled = false;
        }, { capture: true, passive: true });
    });
    //ユーザーが自分でスクロール・操作したら先頭保持を終える
    ['wheel', 'touchstart', 'pointerdown', 'mousedown', 'keydown'].forEach(type => document.addEventListener(type, () => stop_keep_top(), { capture: true, passive: true }));

    // 自動更新時にフォーカスされる問題があるので、scrollIntoViewとfocusを一時的に無効化する
    HTMLElement.prototype.scrollIntoView = function(options) {
        //フォーカス無効化が有効だった場合はフォーカスを無視する
        if (isFocusDisabled) return;

        //カラム側のスクロールが親の横スクロールにも伝搬する問題を以下で対処する
        //直近のスクロール可能な親要素を探す
        let parent = this.parentElement;
        while (parent && !/(auto|scroll)/.test(getComputedStyle(parent).overflow)) {
            parent = parent.parentElement;
        }
        if (!parent) return;

        //対象要素とスクロール親の位置差分を取得してスクロールする
        const client_rect = this.getBoundingClientRect();
        const parent_client_rect = parent.getBoundingClientRect();

        //はみ出し量を算出
        const delta = (start, end, pStart, pEnd) =>
            start < pStart ? start - pStart : end > pEnd ? end - pEnd : 0;

        parent.scrollBy({
            left: delta(client_rect.left, client_rect.right, parent_client_rect.left, parent_client_rect.right),
            top: delta(client_rect.top, client_rect.bottom, parent_client_rect.top, parent_client_rect.bottom),
            behavior: options?.behavior
        });
    };

    const originalFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function(options) {
        if (isFocusDisabled){
            return;
        }
        return originalFocus.call(this, Object.assign({}, options, { preventScroll: true }));
    };

    //更新対象の候補を、div[data-testid="primaryColumn"] 内の section[role="region"] → document 内の残りの section[role="region"] の順 (それぞれ文書順) で返す
    function get_reload_candidates(){
        const candidates = [];
        const primary_column = document.querySelector('div[data-testid="primaryColumn"]');
        if (primary_column) candidates.push(...primary_column.querySelectorAll('section[role="region"]'));
        document.querySelectorAll('section[role="region"]').forEach((section) => {
            if (!candidates.includes(section)) candidates.push(section);
        });
        return candidates;
    }
    //候補を順に試し、onRefresh を持つ props が最初に取れたものを返す。どの候補からも取れなければ null
    function find_on_refresh_props(){
        for (const candidate of get_reload_candidates()) {
            const props = get_on_refresh_props(candidate);
            if (props) return props;
        }
        return null;
    }
    //更新関数が見つからないことを既に警告したかどうか (次に見つかるまで警告を繰り返さない)
    let is_reload_func_missing_warned = false;
    //タイムライン更新関数。React の fiber は current / alternate の 2 本で使い回されるため、
    //先取りして保持した onRefresh は古い描画の state を閉じ込めたまま呼ばれて更新されない。
    //そのため保持せず、呼ぶたびに get_reload_candidates の探索順で最新の fiber を探索して onRefresh を取り出す。
    //onRefresh を呼べたら true、見つからなければ false を返す
    function reload_func(){
        const props = find_on_refresh_props();
        if (!props) {
            if (!is_reload_func_missing_warned) {
                is_reload_func_missing_warned = true;
                console.warn('opd auto reload: 更新関数 (onRefresh) が見つかりません');
            }
            return false;
        }
        is_reload_func_missing_warned = false;
        props.onRefresh();
        return true;
    }

    //onRefresh の存在する memoizedProps を、要素の Fiber から親方向 (return) へ最大 max_hop 段たどって取得する。
    //DOM ノードが指す fiber とそこから辿った fiber は古い側 (alternate) のことがあり、古い側の props には
    //後から付いた onRefresh が無かったり古い関数が入っていたりするため、訪れる fiber ごとに
    //現在コミットされている側へ解決してから props を見る
    function get_on_refresh_props(elem, max_hop = 30){
        if (!elem) return null;
        let fiber = get_props(elem, "Fiber");
        let hop = 0;
        while (fiber && hop++ < max_hop) {
            fiber = get_current_fiber(fiber);
            if (typeof fiber.memoizedProps?.onRefresh === 'function') return fiber.memoizedProps;
            fiber = fiber.return;
        }
        return null;
    }

    //fiber と fiber.alternate のうち、現在コミットされている tree に属する側を返す (React の findCurrentFiberUsingSlowPath 相当)。
    //fiber 単体には current かどうかの印が無く、return ポインタは bailout した親の古い側を指し続けることがあるため、
    //両方から親を同時にたどり、HostRoot (tag 3) に着いたときに root.stateNode.current と一致した側を current と判定する。
    //判定できない構造に出会ったときは fiber をそのまま返す
    function get_current_fiber(fiber){
        const alternate = fiber.alternate;
        if (!alternate) return fiber;
        const HOST_ROOT_TAG = 3;
        const MAX_DEPTH = 10000;
        let a = fiber;
        let b = alternate;
        for (let depth = 0; depth < MAX_DEPTH; depth++) {
            const parent_a = a.return;
            if (!parent_a) break;
            const parent_b = parent_a.alternate;
            if (!parent_b) {
                //親に alternate が無ければ、その親までは 1 本道なので親から先を同じ手順でたどる。
                //その親が根 (return が無い) なら根そのものを判定対象にする
                const next_parent = parent_a.return;
                if (!next_parent) {
                    a = b = parent_a;
                    break;
                }
                a = b = next_parent;
                continue;
            }
            if (parent_a.child === parent_b.child) {
                //両方の親が同じ子リストを共有している (親が子を複製せずに bailout した) 場合、
                //そのリストに載っている側は複製されていない = 今も current なので、ここで確定する。
                //古い側の return は古い親を指し続けることがあるため、親へ進んで判定を続けてはいけない
                let child = parent_a.child;
                while (child) {
                    if (child === a) return fiber;
                    if (child === b) return alternate;
                    child = child.sibling;
                }
                return fiber;
            }
            if (a.return !== b.return) {
                //return ポインタが交差することは無い前提で、それぞれの親をそのまま採用する
                a = parent_a;
                b = parent_b;
                continue;
            }
            //a と b が同じ親を指しているが親同士は子リストを共有していない場合、どちらの親の子リストに属するかで側を決める
            const pick_side = (children_of, parent_of_a, parent_of_b) => {
                let child = children_of.child;
                while (child) {
                    if (child === a) { a = parent_of_a; b = parent_of_b; return true; }
                    if (child === b) { a = parent_of_b; b = parent_of_a; return true; }
                    child = child.sibling;
                }
                return false;
            };
            if (!pick_side(parent_a, parent_a, parent_b) && !pick_side(parent_b, parent_b, parent_a)) return fiber;
        }
        if (a.tag !== HOST_ROOT_TAG) return fiber;
        return a.stateNode?.current === a ? fiber : alternate;
    }

    //ReactProps取得関数
    function get_props(elem, type){
        const prop_type = type === "Props" ? type : "Fiber";
        const propsKey = Object.getOwnPropertyNames(elem).find(k => k.includes(`__react${prop_type}$`));
        return propsKey ? elem[propsKey] : null;
    }
    //先頭保持の状態 (isFocusDisabled とは別に持つ)
    let keep_top_generation = 0;
    let keep_top_active = false;
    let keep_top_corrections = 0;
    let keep_top_timer = null;
    //保持中の DOM の childList の変化を最後に観測した時刻 (performance.now())。scroll が新着挿入に伴うものかの判定に使う
    let keep_top_last_mutation_at = -Infinity;
    const keep_top_mutation_observer = new MutationObserver(() => {
        keep_top_last_mutation_at = performance.now();
    });
    //先頭保持を始める (契約は先頭コメント)。前の保持は無効にして世代を進める
    function start_keep_top(){
        stop_keep_top();
        const generation = ++keep_top_generation;
        keep_top_active = true;
        keep_top_corrections = 0;
        //開始直後の scroll は更新関数自身による位置変更と見なすため、開始時刻を最初の観測時刻にする
        keep_top_last_mutation_at = performance.now();
        //観測はタイムラインのある primaryColumn に絞り、無関係な領域の再描画で判定が濁らないようにする
        keep_top_mutation_observer.observe(document.querySelector('div[data-testid="primaryColumn"]') ?? document.documentElement, { childList: true, subtree: true });
        keep_top_timer = setTimeout(() => {
            if (generation !== keep_top_generation) return;
            stop_keep_top();
        }, KEEP_TOP_WATCH_MS);
    }
    //先頭保持を終える。以後の scroll では戻さない
    function stop_keep_top(){
        keep_top_active = false;
        keep_top_generation++;
        keep_top_mutation_observer.disconnect();
        if (keep_top_timer !== null) {
            clearTimeout(keep_top_timer);
            keep_top_timer = null;
        }
    }
    //保持中に先頭から外れたら戻す。自分の scrollTo で起きる scroll は scrollY が 0 なので何もしない。
    //直前に DOM の変化が無い scroll はユーザ操作 (スクロールバーのドラッグ等、入力イベントを伴わない移動) と見なして保持を終える
    window.addEventListener('scroll', () => {
        if (!keep_top_active) return;
        if (window.scrollY <= 0) return;
        if (performance.now() - keep_top_last_mutation_at > KEEP_TOP_MUTATION_WINDOW_MS) {
            stop_keep_top();
            return;
        }
        keep_top_corrections++;
        window.scrollTo({ top: 0, behavior: 'instant' });
        if (keep_top_corrections >= KEEP_TOP_MAX_CORRECTIONS) stop_keep_top();
    }, { passive: true });
    //機能動作用のトークンを設定
    window.addEventListener('opd_column_reload_init', (e)=>{
        try {
            const detail = JSON.parse(e.detail);
            opd_reload_token = detail.token;
        } catch (err) {
            console.warn('invalid init detail->', err);
        }
    }, true);
    //自動更新イベントを追加する
    window.addEventListener('opd_column_reload', (e) => {
        let detail;
        try {
            detail = JSON.parse(e.detail);
        } catch (err) {
            console.warn('invalid reload detail->', err);
            return;
        }
        if(detail === null || typeof detail !== 'object') return;
        if(opd_reload_token && opd_reload_token !== detail.token) return;
        //新しい更新が始まったら前の保持は無効にする
        stop_keep_top();
        //先頭にいたかどうかは更新関数を呼ぶ前に取る (更新関数が同期的に位置を変えても「更新前」の判定にする)
        const was_at_top = window.scrollY <= 1;
        let is_reloaded = false;
        try {
            isFocusDisabled = true;
            is_reloaded = reload_func();
        } catch (err) {
            console.warn('reload_func threw->', err);
        }
        if (is_reloaded && detail.keep_top === true && was_at_top) start_keep_top();
    }, true);
})();