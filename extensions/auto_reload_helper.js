//自動更新機能用
(() => {
    let opd_reload_token = null;
    let reload_func = ()=>{};
    let isFocusDisabled = false;
    
    //ユーザー操作でフォーカス無効化を解除する
    ['mousedown', 'keydown', 'touchstart'].forEach(type => {
        document.addEventListener(type, () => {
            isFocusDisabled = false;
        }, { capture: true, passive: true });
    });

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

    //タイムライン更新関数。React の fiber は current / alternate の 2 本で使い回されるため、
    //先取りして保持した onRefresh は古い描画の state を閉じ込めたまま呼ばれて更新されない。
    //そのため保持せず、呼ぶたびに最新の fiber を探索して onRefresh を取り出す
    reload_func = ()=>{
        get_on_refresh_props(document.querySelector('section[role="region"]'))?.onRefresh();
    };

    //onRefresh の存在する memoizedProps を、要素の Fiber から親方向 (return) へ最大 max_hop 段たどって取得する。
    //見つけた fiber は古い側 (alternate) のことがあるため、現在コミットされている側に解決してからその memoizedProps を返す
    function get_on_refresh_props(elem, max_hop = 30){
        if (!elem) return null;
        let fiber = get_props(elem, "Fiber");
        let hop = 0;
        while (fiber && hop++ < max_hop) {
            if (typeof fiber.memoizedProps?.onRefresh === 'function') {
                const current_fiber = get_current_fiber(fiber);
                if (typeof current_fiber.memoizedProps?.onRefresh === 'function') return current_fiber.memoizedProps;
                //現在側に onRefresh が無ければ (props が変わった等) 古い側の関数は呼ばず、現在側の親からさらに探す
                fiber = current_fiber;
            }
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
        const detail = JSON.parse(e.detail);
        if(opd_reload_token && opd_reload_token !== detail.token) return;

        if(typeof reload_func !== 'function') return;

        try {
            isFocusDisabled = true;
            reload_func();
        } catch (err) {
            console.warn('reload_func threw->', err);
        }
    }, true);
})();