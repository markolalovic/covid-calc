var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function null_to_empty(value) {
        return value == null ? '' : value;
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function to_number(value) {
        return value === '' ? undefined : +value;
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        if (value != null || input.value) {
            input.value = value;
        }
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }
    class HtmlTag {
        constructor(html, anchor = null) {
            this.e = element('div');
            this.a = anchor;
            this.u(html);
        }
        m(target, anchor = null) {
            for (let i = 0; i < this.n.length; i += 1) {
                insert(target, this.n[i], anchor);
            }
            this.t = target;
        }
        u(html) {
            this.e.innerHTML = html;
            this.n = Array.from(this.e.childNodes);
        }
        p(html) {
            this.d();
            this.u(html);
            this.m(this.t, this.a);
        }
        d() {
            this.n.forEach(detach);
        }
    }

    const active_docs = new Set();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = node.ownerDocument;
        active_docs.add(doc);
        const stylesheet = doc.__svelte_stylesheet || (doc.__svelte_stylesheet = doc.head.appendChild(element('style')).sheet);
        const current_rules = doc.__svelte_rules || (doc.__svelte_rules = {});
        if (!current_rules[name]) {
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            active_docs.forEach(doc => {
                const stylesheet = doc.__svelte_stylesheet;
                let i = stylesheet.cssRules.length;
                while (i--)
                    stylesheet.deleteRule(i);
                doc.__svelte_rules = {};
            });
            active_docs.clear();
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function afterUpdate(fn) {
        get_current_component().$$.after_update.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_in_transition(node, fn, params) {
        let config = fn(node, params);
        let running = false;
        let animation_name;
        let task;
        let uid = 0;
        function cleanup() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 0, 1, duration, delay, easing, css, uid++);
            tick(0, 1);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            if (task)
                task.abort();
            running = true;
            add_render_callback(() => dispatch(node, true, 'start'));
            task = loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(1, 0);
                        dispatch(node, true, 'end');
                        cleanup();
                        return running = false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(t, 1 - t);
                    }
                }
                return running;
            });
        }
        let started = false;
        return {
            start() {
                if (started)
                    return;
                delete_rule(node);
                if (is_function(config)) {
                    config = config();
                    wait().then(go);
                }
                else {
                    go();
                }
            },
            invalidate() {
                started = false;
            },
            end() {
                if (running) {
                    cleanup();
                    running = false;
                }
            }
        };
    }
    function create_out_transition(node, fn, params) {
        let config = fn(node, params);
        let running = true;
        let animation_name;
        const group = outros;
        group.r += 1;
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 1, 0, duration, delay, easing, css);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            add_render_callback(() => dispatch(node, false, 'start'));
            loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(0, 1);
                        dispatch(node, false, 'end');
                        if (!--group.r) {
                            // this will result in `end()` being called,
                            // so we don't need to clean up here
                            run_all(group.c);
                        }
                        return false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(1 - t, t);
                    }
                }
                return running;
            });
        }
        if (is_function(config)) {
            wait().then(() => {
                // @ts-ignore
                config = config();
                go();
            });
        }
        else {
            go();
        }
        return {
            end(reset) {
                if (reset && config.tick) {
                    config.tick(1, 0);
                }
                if (running) {
                    if (animation_name)
                        delete_rule(node, animation_name);
                    running = false;
                }
            }
        };
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    const subscriber_queue = [];
    /**
     * Creates a `Readable` store that allows reading by subscription.
     * @param value initial value
     * @param {StartStopNotifier}start start and stop notifications for subscriptions
     */
    function readable(value, start) {
        return {
            subscribe: writable(value, start).subscribe,
        };
    }
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    // version = 2020-05-29 13:02:59;

    const englishDictStore = readable({ 
    	app: {
    		 mainTitle: "COVID Calculator",
    		 subtitle: "A visual tool to explore and analyze the potential impacts of COVID-19",
    		 tabItem0: "Mortality by Age",
    		 tabItem1: "Estimates in Context",
    		 tabItem2: "Risks by Country",
    		 tabItem3: "Poverty Proj.",
    		 tabItem4: "Deaths Proj.",
    		 tabItem5: "Hyp. Scenarios",
    		 tabItem6: "Ex. Interpretations",
    		 location: "Location",
    		 selectLocation: "Select location",
    		 locationDescription: "The impact of COVID-19 varies between countries.",
    		 infectionRate: "Infection rate",
    		 infectionRateDescription: "Proportion of all people contracting the novel coronavirus.",
    		 over60InfectionRate: "Over 60 infection rate",
    		 below60InfectionRate: "Below 60 infection rate",
    		 over60Description: "Proportion of all people over the age of 60 contracting the novel coronavirus.",
    		 proportionIsThen: "The proportion of people below 60 infected is then",
    		 proportionIsThenDescription: "Since it depends on both overall infection rate and infection rate of people over 60.",
    		 basedOn: "Based on",
    		 basedOnContinued1: "fatality rates and ",
    		 basedOnContinued2: "age distribution and other selected input parameters, we can expect: ",
    		 basedOnContinued3: "infected and ",
    		 basedOnContinued4: "deaths or ",
    		 basedOnContinued5: "years of life lost in ",
    		 compareWithOtherCaption1: "It is possible that estimated coronavirus deaths will span multiple years.",
    		 compareWithOtherCaption2: "Deaths due to other causes are for the year of 2017. Source:",
    		 compareWithOtherCaption3: "Confirmed deaths due to COVID-19 until May 27, 2020. Source: ",
    		 compareWithOtherCaption4: "Years of life lost due to other causes are for the year of 2017. Source: ",
    		 compareWithOtherCaption5: "Years of life lost due to COVID-19 until May 27, 2020. Source: ",
    		 authorsCalculations: "and authors calculations.",
    		 compareWithOtherCaption7: "Years of life lost due to other risk factors are for the year of 2017. Source:",
    		 proportionOver60ByCountry: "Proportion of People Over 60 Risk by Country",
    		 lowIncomeRiskByCountry: "Low Income Risk by Country",
    		 mapCaption: "You can hover over legend items to select. You can zoom in and out of map.         And hover over map to get information about the country it represents.",
    		 projectedPovery: "Projected increases by country due to coronavirus impact on the world economy         in the number of people living in extreme poverty,         that is an income below the international poverty line of $1.90 per day.",
    		 sources: "Sources: ",
    		 projectedPoveryByRegion: "Projected poverty increases by region due to coronavirus impact on world economy.",
    		 projectionsCaption: "Projections of total deaths from COVID-19. Click on the legend to select or deselect a country.",
    		 source: "Source:",
    		 reset: "Reset",
    		 infectedTitle: "Expected Number of Infected by Age",
    		 deathsTitle: "Expected Number of Deaths by Age",
    		 age: "Age",
    		 infected: "Infected",
    		 deaths: "Deaths",
    		 projectionsTitle: "Potential Millions Pushed Into Extreme Poverty Due to COVID-19 by",
    		 date: "Date",
    		 totDeaths: "Total deaths",
    		 totDeathsProj: "Total deaths (projected)",
    		 titleListMain: "How COVID-19 Compare With",
    		 titleListName: "Cause",
    		 titleListRisk: "Risk",
    		 titleListNumber: " in ",
    		 yearsOfLifeLost: "Yrs of Life Lost",
    		 inCountry: " in ",
    		 compareItems0: "Causes of Death",
    		 compareItems1: "Causes of Years of Life Lost",
    		 compareItems2: "Risk Factors in Years of Life Lost",
    		 covid19Cause: "COVID-19 (estimate)",
    		 enterDescribtion: "Enter description",
    		 yrsOfLifeLost: "Expected Years of Life Lost",
    		 yrsOfLifeLostCosts: "Potential Costs",
    		 scenariosDescription: "Description of scenario",
    		 country: "Country",
    		 region: "Region",
    		 people: "People",
    		 india: "India",
    		 nigeria: "Nigeria",
    		 drCongo: "Democratic Republic of Congo",
    		 ethiopia: "Ethiopia",
    		 bangladesh: "Bangladesh",
    		 tanzania: "Tanzania",
    		 madagascar: "Madagascar",
    		 indonesia: "Indonesia",
    		 kenya: "Kenya",
    		 mozambique: "Mozambique",
    		 uganda: "Uganda",
    		 southAfrica: "South Africa",
    		 subSahAfrica: "Sub-Saharan Africa",
    		 southAsia: "South Asia",
    		 eastAsiaPacific: "East Asia & Pacific",
    		 latinCaribbean: "Latin America & Caribbean",
    		 middleEastNorthAfrica: "Middle East & North Africa",
    		 europeCentralAsia: "Europe & Central Asia",
    		 northAmerica: "North America",
    		 mainProjRegions: "Causes of Death",
    		 nameProjRegions: "Causes of Years of Life Lost",
    		 numberProjRegions: "Risk Factors in Years of Life Lost",
    		 fatalityRates: "Fatality rates",
    		 fatalityRatesDescription: "Select estimates of risk of death from infection with the novel coronavirus. Estimates vary between countries and over time. Wider testing can reduce CFR estimates.",
    		 varyFRs: "Vary selected fatality rates",
    		 varyFRsDescription1: "Try increasing the risk of deaths, e.g. to 50%,  for low-income country or overwhelmed healthcare.",
    		 varyFRsDescription2: "Or decreasing, e.g. to -50%,  for expected improved treatments and better healthcare.",
    		 resetDescription: "Set all input parameters back to their initial values.",
    		 elimination: "Probability of eliminating COVID-19",
    		 eliminationDescription1: "Probability of achieving complete elimination  of COVID-19 disease before it manages to infect",
    		 eliminationDescription2: "of population.",
    		 infectionUntil: "Infection rate until elimination",
    		 infectionUntilDescription: "Proportion of population that still gets infected even in the event of achieving complete elimination. Note: First increase the probability of elimination for this parameter to take effect.",
    		 hideExport: "Hide Export",
    		 export: "Export",
    		 exportDescription: "Export Hypothetical COVID-19 Scenarios in JSON format.",
    		 export1: "Hide Export",
    		 scenariosCaption: "You can set input parameters that describe a hypothetical scenario and add it to the table for comparison. There are 3 examples of hypothetical scenarios for the selected location and fatality risks. Results should be interpreted with caution, see Example Interpretations.",
    		 exampleScenario0: "Scenario 0: Do nothing, as a baseline",
    		 exampleScenario1: "Scenario 1: Protect people over 60,  compensate by exposing those below 60, consider also years of life lost",
    		 exampleScenario2: "Scenario 2: Elimination to 90%, consider also money saved",
    		 mapTitle: "COVID-19 Risks by Country",
    		 mapItems0: "Proportion of people over 60 by Country",
    		 mapItems1: "Low Income Risk by Country",
    		 povertyItems0: "By Country",
    		 povertyItems1: "By Region",
    		},
    	fatalityRisks: [
    		 {id: 0,
    		  source: "Imperial College - IFR",
    		  ftr: [0.002, 0.006, 0.03, 0.08, 0.15, 0.6, 2.2, 5.1, 9.3] },
    		 {id: 1,
    		  source: "China CDC - CFR",
    		  ftr: [0, 0.2, 0.2, 0.2, 0.4, 1.3, 3.6, 8, 14.8] },
    		 {id: 2,
    		  source: "Korea CDC - CFR",
    		  ftr: [0, 0, 0, 0.11, 0.08, 0.5, 1.8, 6.3, 13] },
    		 {id: 3,
    		  source: "JAMA Italy - CFR",
    		  ftr: [0, 0, 0, 0.3, 0.4, 1, 3.5, 12.8, 20.2] },
    		 {id: 4,
    		  source: "MISAN Spain - CFR",
    		  ftr: [0, 0, 0.22, 0.14, 0.3, 0.4, 1.9, 4.8, 15.6] },
    		],
    	compareOptions: [
    		 {id: 0,
    		  compareWith: "Other Major Causes Of Death" },
    		 {id: 1,
    		  compareWith: "Diseases in Years of Life Lost" },
    		 {id: 2,
    		  compareWith: "Risk Factors in Years of Life Lost" },
    		 {id: 3,
    		  compareWith: "Other Countries in the World" },
    		],
    	countries: [
    		 {id: 0,
    		  name: "Afghanistan",
    		  lifeExpectancy: 64.83,
    		  demographics: [11040694, 9635671, 6779023, 4381488, 2846500, 1773768, 1020779, 458747, 105087],
    		  majorCauses: ['Cardiovascular diseases', 'Neonatal disorders', 'Lower respiratory infections', 'Cancers', 'Road injuries', 'Respiratory diseases', 'Meningitis', 'Diarrheal diseases', 'Terrorism', 'Diabetes', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [56119, 27522, 21431, 16670, 8692, 6917, 6589, 6176, 6092, 5978, 220],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Neonatal disorders', 'Conflict and terrorism', 'Cardiovascular diseases', 'Other NCDs', 'Diabetes, blood, & endocrine diseases', 'Unintentional injuries', 'Cancers', 'Transport injuries', 'HIV/AIDS and tuberculosis', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [2949759, 2461244, 2128416, 1596954, 1539479, 975117, 797604, 601374, 551807, 542777, 4967],
    		  riskFactors: ['Air pollution (outdoor & indoor)', 'Child wasting', 'High blood pressure', 'High blood sugar', 'High cholesterol', 'Obesity', 'Unsafe water source', 'Vitamin A deficiency', 'Child stunting', 'Diet low in fruits', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [1341395, 1306178, 901181, 866085, 807902, 689543, 523650, 475516, 455174, 378229, 4967] },
    		 {id: 1,
    		  name: "Albania",
    		  lifeExpectancy: 78.57,
    		  demographics: [333920, 375307, 481846, 377350, 330419, 392129, 317994, 189973, 81975],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Respiratory diseases', 'Digestive diseases', 'Lower respiratory infections', 'Kidney disease', 'Liver diseases', 'Road injuries', 'Parkinson disease', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [12145, 4345, 1337, 736, 489, 382, 363, 309, 248, 234, 33],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Unintentional injuries', 'Neurological disorders', 'Mental and substance use disorders', 'Other NCDs', 'Diabetes, blood, & endocrine diseases', 'Neonatal disorders', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [206331, 100981, 64286, 53506, 51865, 38507, 37568, 35191, 27693, 24834, 483],
    		  riskFactors: ['High blood pressure', 'Smoking', 'Obesity', 'High blood sugar', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Diet low in fruits', 'Secondhand smoke', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [128064, 99946, 69372, 57453, 55471, 37120, 29156, 16674, 13809, 10129, 483] },
    		 {id: 2,
    		  name: "Algeria",
    		  lifeExpectancy: 76.88,
    		  demographics: [9533023, 6466198, 6759761, 7193824, 5249023, 3682969, 2430965, 1179741, 557550],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Road injuries', 'Neonatal disorders', 'Respiratory diseases', 'Diabetes', 'Digestive diseases', 'Lower respiratory infections', 'Kidney disease', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [79389, 21656, 8175, 6905, 6511, 5508, 5202, 4800, 4724, 4577, 617],
    		  diseaseNames: ['Cardiovascular diseases', 'Other NCDs', 'Diabetes, blood, & endocrine diseases', 'Neonatal disorders', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Cancers', 'Neurological disorders', 'Transport injuries', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1577873, 857655, 809853, 773630, 767622, 694410, 601103, 581302, 441546, 404974, 10657],
    		  riskFactors: ['Obesity', 'High blood pressure', 'High blood sugar', 'Smoking', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Drug use', 'Diet low in fruits', 'Secondhand smoke', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [956409, 835084, 810448, 541145, 412426, 388376, 354830, 213070, 163252, 146851, 10657] },
    		 {id: 3,
    		  name: "Angola",
    		  lifeExpectancy: 61.15,
    		  demographics: [10645848, 7583998, 5137763, 3567431, 2316948, 1419872, 744701, 323212, 85526],
    		  majorCauses: ['Cardiovascular diseases', 'Neonatal disorders', 'Diarrheal diseases', 'HIV/AIDS', 'Lower respiratory infections', 'Cancers', 'Tuberculosis', 'Malaria', 'Digestive diseases', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [21785, 17882, 17390, 14585, 14508, 12040, 11409, 8431, 8274, 6781, 4],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Neonatal disorders', 'HIV/AIDS and tuberculosis', 'Other NCDs', 'Malaria & neglected tropical diseases', 'Nutritional deficiencies', 'Cardiovascular diseases', 'Unintentional injuries', 'Transport injuries', 'Cancers', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [2327125, 1715532, 1024134, 829609, 816838, 737124, 587699, 479827, 474564, 395113, 91],
    		  riskFactors: ['Child wasting', 'Unsafe water source', 'Unsafe sanitation', 'Air pollution (outdoor & indoor)', 'High blood sugar', 'Vitamin A deficiency', 'High blood pressure', 'Child stunting', 'Iron deficiency', 'Smoking', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [1441565, 1065429, 706854, 558639, 474834, 471166, 388213, 342714, 308832, 291488, 91] },
    		 {id: 4,
    		  name: "Argentina",
    		  lifeExpectancy: 76.67,
    		  demographics: [7431085, 7110303, 6989730, 6393900, 5596155, 4365874, 3478296, 2234324, 1181008],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Lower respiratory infections', 'Respiratory diseases', 'Dementia', 'Digestive diseases', 'Kidney disease', 'Diabetes', 'Liver diseases', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [105777, 74066, 31058, 18992, 18617, 14906, 10834, 9345, 7346, 6457, 484],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Unintentional injuries', 'Other NCDs', 'Neurological disorders', 'Diarrhea & common infectious diseases', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1850384, 1636213, 1070031, 821073, 755647, 600218, 586346, 572018, 566705, 485965, 7111],
    		  riskFactors: ['Smoking', 'High blood sugar', 'Obesity', 'High blood pressure', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Drug use', 'Diet low in vegetables', 'Diet low in fruits', 'Diet high in salt', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [1377562, 1041499, 1039208, 849828, 466427, 374352, 209665, 188972, 182487, 181170, 7111] },
    		 {id: 5,
    		  name: "Armenia",
    		  lifeExpectancy: 75.09,
    		  demographics: [421267, 361638, 430188, 495062, 344211, 375592, 312416, 122717, 94637],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Digestive diseases', 'Dementia', 'Respiratory diseases', 'Diabetes', 'Liver diseases', 'Lower respiratory infections', 'Kidney disease', 'Suicide', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [13631, 5756, 1720, 1357, 1311, 1142, 1107, 501, 430, 302, 91],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Diabetes, blood, & endocrine diseases', 'Musculoskeletal disorders', 'Neurological disorders', 'Other NCDs', 'Unintentional injuries', 'Digestive diseases', 'Mental and substance use disorders', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [232712, 134659, 70952, 55930, 50354, 50085, 45363, 45321, 42045, 33336, 1338],
    		  riskFactors: ['High blood pressure', 'High blood sugar', 'Smoking', 'Obesity', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Diet low in fruits', 'Secondhand smoke', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [150086, 147509, 126246, 106265, 76463, 61605, 33567, 31703, 26363, 17455, 1338] },
    		 {id: 6,
    		  name: "Australia",
    		  lifeExpectancy: 83.44,
    		  demographics: [3280238, 3079378, 3401525, 3662343, 3282597, 3093653, 2605017, 1768659, 1029790],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Respiratory diseases', 'Digestive diseases', 'Kidney disease', 'Lower respiratory infections', 'Diabetes', 'Suicide', 'Parkinson disease', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [52101, 50254, 17119, 10822, 6112, 4455, 4451, 3755, 3055, 2328, 102],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Neurological disorders', 'Unintentional injuries', 'Respiratory diseases', 'Diabetes, blood, & endocrine diseases', 'Other NCDs', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [970836, 694335, 645111, 549355, 438634, 432478, 305003, 292021, 244224, 147752, 1386],
    		  riskFactors: ['Smoking', 'Obesity', 'High blood pressure', 'High blood sugar', 'High cholesterol', 'Drug use', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Low physical activity', 'Diet low in vegetables', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [522203, 490967, 365301, 358549, 199475, 186884, 93142, 87901, 63860, 58260, 1386] },
    		 {id: 7,
    		  name: "Austria",
    		  lifeExpectancy: 81.54,
    		  demographics: [863022, 877100, 1124426, 1224528, 1195561, 1402944, 1000416, 789863, 477248],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Respiratory diseases', 'Digestive diseases', 'Kidney disease', 'Diabetes', 'Liver diseases', 'Suicide', 'Parkinson disease', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [31386, 21745, 7481, 3383, 3227, 2754, 2059, 1860, 1422, 994, 643],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Unintentional injuries', 'Other NCDs', 'Digestive diseases', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [412725, 410715, 249516, 205240, 164586, 148028, 122133, 119273, 104957, 103622, 8364],
    		  riskFactors: ['Smoking', 'High blood pressure', 'High blood sugar', 'Obesity', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Drug use', 'Low physical activity', 'Diet low in fruits', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [289316, 247866, 234711, 198890, 118630, 69586, 40222, 38446, 32621, 32476, 8364] },
    		 {id: 8,
    		  name: "Azerbaijan",
    		  lifeExpectancy: 73.0,
    		  demographics: [1680978, 1317438, 1666611, 1724388, 1263973, 1281704, 743188, 232553, 136886],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Digestive diseases', 'Liver diseases', 'Lower respiratory infections', 'Dementia', 'Respiratory diseases', 'Neonatal disorders', 'Diabetes', 'Kidney disease', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [40266, 10954, 3940, 3141, 3055, 2482, 2340, 2274, 1752, 1169, 52],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Diarrhea & common infectious diseases', 'Neonatal disorders', 'Other NCDs', 'Diabetes, blood, & endocrine diseases', 'Unintentional injuries', 'Musculoskeletal disorders', 'Neurological disorders', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [821522, 314922, 242153, 241789, 193598, 185831, 167301, 151704, 146958, 135223, 929],
    		  riskFactors: ['High blood pressure', 'High blood sugar', 'Obesity', 'Smoking', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Diet high in salt', 'Secondhand smoke', 'Child wasting', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [510416, 425013, 362881, 334822, 279459, 197950, 127029, 125321, 104163, 86129, 929] },
    		 {id: 9,
    		  name: "Bahamas",
    		  lifeExpectancy: 73.92,
    		  demographics: [54179, 64391, 65619, 54838, 56558, 48211, 27694, 13163, 4833],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Diabetes', 'HIV/AIDS', 'Homicide', 'Lower respiratory infections', 'Digestive diseases', 'Kidney disease', 'Dementia', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [801, 530, 128, 114, 107, 105, 104, 93, 92, 60, 11],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Diabetes, blood, & endocrine diseases', 'Musculoskeletal disorders', 'Interpersonal violence', 'Mental and substance use disorders', 'Other NCDs', 'HIV/AIDS and tuberculosis', 'Neurological disorders', 'Diarrhea & common infectious diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [18194, 13979, 12275, 6281, 6124, 6111, 5713, 5541, 5507, 4614, 192],
    		  riskFactors: ['Obesity', 'High blood pressure', 'High blood sugar', 'High cholesterol', 'Smoking', 'Air pollution (outdoor & indoor)', 'Diet low in vegetables', 'Drug use', 'Low physical activity', 'Diet high in salt', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [13121, 11928, 10905, 4719, 4611, 3432, 1440, 1366, 1195, 982, 192] },
    		 {id: 10,
    		  name: "Bahrain",
    		  lifeExpectancy: 77.29,
    		  demographics: [215191, 177424, 318510, 464806, 244359, 137046, 61268, 16906, 5654],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Diabetes', 'Digestive diseases', 'Kidney disease', 'Road injuries', 'Respiratory diseases', 'Dementia', 'Lower respiratory infections', 'Liver diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [961, 553, 529, 143, 133, 128, 114, 110, 95, 84, 14],
    		  diseaseNames: ['Diabetes, blood, & endocrine diseases', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Cardiovascular diseases', 'Neurological disorders', 'Other NCDs', 'Cancers', 'Neonatal disorders', 'Respiratory diseases', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [39073, 32240, 29024, 26949, 19107, 18531, 15791, 10408, 10052, 9970, 339],
    		  riskFactors: ['Obesity', 'High blood sugar', 'High blood pressure', 'Air pollution (outdoor & indoor)', 'Drug use', 'Smoking', 'High cholesterol', 'Secondhand smoke', 'Diet low in fruits', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [36296, 34551, 18126, 14303, 14207, 12588, 11243, 3904, 3635, 3064, 339] },
    		 {id: 11,
    		  name: "Bangladesh",
    		  lifeExpectancy: 72.59,
    		  demographics: [29140694, 30882112, 29600040, 26177061, 20143207, 14480320, 6892779, 4064814, 1665146],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Respiratory diseases', 'Neonatal disorders', 'Digestive diseases', 'Lower respiratory infections', 'Diabetes', 'Diarrheal diseases', 'Liver diseases', 'Dementia', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [320563, 99302, 82276, 53449, 44992, 38521, 34564, 30147, 26390, 17256, 522],
    		  diseaseNames: ['Cardiovascular diseases', 'Neonatal disorders', 'Diarrhea & common infectious diseases', 'Musculoskeletal disorders', 'Cancers', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Respiratory diseases', 'Unintentional injuries', 'Other NCDs', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [7263655, 5707014, 4266872, 2891058, 2718396, 2592864, 2488098, 2370531, 2224279, 2204327, 9574],
    		  riskFactors: ['Air pollution (outdoor & indoor)', 'High blood pressure', 'High blood sugar', 'Smoking', 'Diet low in fruits', 'High cholesterol', 'Obesity', 'Child wasting', 'Diet low in vegetables', 'Diet high in salt', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [3871076, 3578773, 2726100, 2320793, 1895086, 1668575, 1459444, 1428511, 1260828, 998683, 9574] },
    		 {id: 12,
    		  name: "Barbados",
    		  lifeExpectancy: 79.19,
    		  demographics: [30994, 36993, 37512, 37294, 39394, 40137, 32664, 19336, 12696],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Diabetes', 'Lower respiratory infections', 'Dementia', 'Digestive diseases', 'Kidney disease', 'Respiratory diseases', 'Liver diseases', 'Homicide', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [840, 677, 242, 183, 171, 94, 90, 63, 39, 32, 7],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Diabetes, blood, & endocrine diseases', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Other NCDs', 'Diarrhea & common infectious diseases', 'Digestive diseases', 'Neonatal disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [14552, 14043, 11241, 6037, 5473, 5081, 4386, 3631, 2854, 2533, 94],
    		  riskFactors: ['High blood sugar', 'Obesity', 'High blood pressure', 'Smoking', 'Air pollution (outdoor & indoor)', 'High cholesterol', 'Diet low in fruits', 'Diet low in vegetables', 'Low physical activity', 'Drug use', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [12710, 11385, 9034, 4139, 3869, 2945, 1803, 1372, 1259, 883, 94] },
    		 {id: 13,
    		  name: "Belarus",
    		  lifeExpectancy: 74.79,
    		  demographics: [1134208, 910479, 1147255, 1510155, 1278833, 1374474, 1190629, 533029, 373347],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Digestive diseases', 'Alcohol use disorders', 'Liver diseases', 'Suicide', 'Respiratory diseases', 'Lower respiratory infections', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [73014, 18558, 6550, 4498, 2803, 2533, 2357, 2065, 1175, 990, 208],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Unintentional injuries', 'Musculoskeletal disorders', 'Neurological disorders', 'Digestive diseases', 'Mental and substance use disorders', 'Other NCDs', 'Diabetes, blood, & endocrine diseases', 'Self-harm', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1238969, 440057, 285451, 218899, 197375, 168700, 162164, 123781, 114503, 89387, 2938],
    		  riskFactors: ['High blood pressure', 'Smoking', 'High cholesterol', 'Obesity', 'High blood sugar', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Diet high in salt', 'Low physical activity', 'Drug use', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [813813, 576719, 492857, 471979, 288461, 176297, 173117, 143406, 89321, 62880, 2938] },
    		 {id: 14,
    		  name: "Belgium",
    		  lifeExpectancy: 81.63,
    		  demographics: [1305219, 1298970, 1395385, 1498535, 1524152, 1601891, 1347696, 908725, 658753],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'COVID-19 until May 27, 2020', 'Respiratory diseases', 'Lower respiratory infections', 'Digestive diseases', 'Suicide', 'Kidney disease', 'Liver diseases', 'Diabetes'],
    		  majorDeaths: [32194, 30782, 10550, 9334, 6804, 5669, 5111, 2132, 2097, 2004, 1436],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Unintentional injuries', 'Respiratory diseases', 'Diabetes, blood, & endocrine diseases', 'Other NCDs', 'COVID-19 until May 27, 2020', 'Digestive diseases'],
    		  diseaseDALYs: [577400, 454391, 354782, 293127, 224452, 180671, 164776, 158502, 140478, 119438, 118342],
    		  riskFactors: ['Smoking', 'High blood sugar', 'High blood pressure', 'Obesity', 'COVID-19 until May 27, 2020', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Low physical activity', 'Drug use', 'Secondhand smoke'],
    		  riskDALYs: [473420, 278047, 257958, 227091, 119438, 118510, 99170, 66362, 38847, 38280, 34819] },
    		 {id: 15,
    		  name: "Belize",
    		  lifeExpectancy: 74.62,
    		  demographics: [77702, 78150, 74346, 57769, 42878, 30626, 16843, 7912, 4124],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Diabetes', 'Lower respiratory infections', 'Homicide', 'Digestive diseases', 'Kidney disease', 'HIV/AIDS', 'Road injuries', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [424, 277, 126, 111, 106, 92, 84, 81, 72, 69, 2],
    		  diseaseNames: ['Cardiovascular diseases', 'Diabetes, blood, & endocrine diseases', 'Cancers', 'Neonatal disorders', 'Other NCDs', 'Interpersonal violence', 'Mental and substance use disorders', 'Unintentional injuries', 'Diarrhea & common infectious diseases', 'Neurological disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [9830, 9614, 7583, 7367, 6049, 6027, 5975, 5561, 5539, 4996, 36],
    		  riskFactors: ['High blood sugar', 'Obesity', 'High blood pressure', 'Smoking', 'Air pollution (outdoor & indoor)', 'High cholesterol', 'Iron deficiency', 'Diet low in fruits', 'Child wasting', 'Drug use', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [9631, 9251, 5961, 3571, 3449, 2288, 1745, 1482, 1423, 1253, 36] },
    		 {id: 16,
    		  name: "Benin",
    		  lifeExpectancy: 61.77,
    		  demographics: [3529739, 2708314, 2001076, 1389287, 950137, 627369, 364348, 179593, 51287],
    		  majorCauses: ['Neonatal disorders', 'Malaria', 'Cardiovascular diseases', 'Lower respiratory infections', 'Diarrheal diseases', 'Cancers', 'Road injuries', 'Tuberculosis', 'Digestive diseases', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [9627, 9433, 9221, 7565, 6383, 5434, 3093, 2890, 2629, 1983, 3],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Neonatal disorders', 'Malaria & neglected tropical diseases', 'Other NCDs', 'Nutritional deficiencies', 'Cardiovascular diseases', 'Diabetes, blood, & endocrine diseases', 'HIV/AIDS and tuberculosis', 'Transport injuries', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1295131, 899739, 783500, 359850, 253199, 238944, 238353, 218491, 192950, 180157, 62],
    		  riskFactors: ['Child wasting', 'Unsafe water source', 'Air pollution (outdoor & indoor)', 'Unsafe sanitation', 'Vitamin A deficiency', 'High blood pressure', 'High blood sugar', 'Child stunting', 'Obesity', 'Iron deficiency', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [589619, 357407, 310177, 279407, 201743, 145002, 138640, 123773, 117511, 109285, 62] },
    		 {id: 17,
    		  name: "Bhutan",
    		  lifeExpectancy: 71.78,
    		  demographics: [126258, 137813, 154517, 134250, 86166, 57026, 35719, 21762, 9582],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Respiratory diseases', 'Digestive diseases', 'Neonatal disorders', 'Lower respiratory infections', 'Liver diseases', 'Kidney disease', 'Diarrheal diseases', 'Dementia', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [1156, 488, 446, 255, 205, 180, 157, 136, 132, 125, 0],
    		  diseaseNames: ['Cardiovascular diseases', 'Diarrhea & common infectious diseases', 'Neonatal disorders', 'Musculoskeletal disorders', 'Diabetes, blood, & endocrine diseases', 'Mental and substance use disorders', 'Unintentional injuries', 'Cancers', 'Other NCDs', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [26845, 24060, 23302, 15553, 14573, 14249, 13641, 13614, 13469, 12218, 0],
    		  riskFactors: ['High blood pressure', 'High blood sugar', 'Air pollution (outdoor & indoor)', 'Obesity', 'High cholesterol', 'Iron deficiency', 'Smoking', 'Diet low in fruits', 'Diet high in salt', 'Diet low in vegetables', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [15575, 12298, 11644, 10068, 9089, 8988, 7745, 5274, 4216, 3631, 0] },
    		 {id: 18,
    		  name: "Bolivia",
    		  lifeExpectancy: 71.51,
    		  demographics: [2365890, 2289751, 2012188, 1605907, 1206917, 859703, 600549, 378817, 193379],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Lower respiratory infections', 'Digestive diseases', 'Kidney disease', 'Respiratory diseases', 'Diabetes', 'Neonatal disorders', 'Dementia', 'Liver diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [15275, 12195, 5360, 4078, 3165, 3122, 2903, 2826, 2651, 2215, 274],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Cardiovascular diseases', 'Cancers', 'Neonatal disorders', 'Diabetes, blood, & endocrine diseases', 'Other NCDs', 'Mental and substance use disorders', 'Unintentional injuries', 'Musculoskeletal disorders', 'Neurological disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [360435, 323003, 304397, 303329, 214670, 213058, 172883, 163508, 161009, 146546, 4392],
    		  riskFactors: ['High blood sugar', 'Obesity', 'High blood pressure', 'Air pollution (outdoor & indoor)', 'Smoking', 'Child wasting', 'High cholesterol', 'Iron deficiency', 'Diet low in fruits', 'Diet low in vegetables', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [255825, 202319, 174854, 127408, 100318, 89251, 76483, 70730, 54745, 46823, 4392] },
    		 {id: 19,
    		  name: "Bosnia and Herzegovina",
    		  lifeExpectancy: 77.4,
    		  demographics: [306587, 351419, 409569, 468369, 448869, 508292, 452975, 235035, 119881],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Diabetes', 'Dementia', 'Respiratory diseases', 'Digestive diseases', 'Kidney disease', 'Liver diseases', 'Lower respiratory infections', 'Parkinson disease', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [18107, 8950, 2293, 1991, 1310, 1136, 604, 577, 360, 324, 149],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Diabetes, blood, & endocrine diseases', 'Musculoskeletal disorders', 'Unintentional injuries', 'Neurological disorders', 'Mental and substance use disorders', 'Respiratory diseases', 'Other NCDs', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [314480, 202956, 96087, 76811, 71590, 67986, 49804, 45325, 40933, 39556, 2127],
    		  riskFactors: ['Smoking', 'High blood sugar', 'High blood pressure', 'Obesity', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Diet high in salt', 'Secondhand smoke', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [215413, 199141, 198050, 137744, 93564, 77913, 45939, 41923, 29708, 23846, 2127] },
    		 {id: 20,
    		  name: "Botswana",
    		  lifeExpectancy: 69.59,
    		  demographics: [535771, 462584, 397946, 359631, 247537, 141947, 100575, 45935, 11776],
    		  majorCauses: ['HIV/AIDS', 'Cardiovascular diseases', 'Cancers', 'Lower respiratory infections', 'Diabetes', 'Diarrheal diseases', 'Respiratory diseases', 'Tuberculosis', 'Digestive diseases', 'Neonatal disorders', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [4102, 2548, 1487, 768, 668, 577, 510, 444, 438, 436, 1],
    		  diseaseNames: ['HIV/AIDS and tuberculosis', 'Diarrhea & common infectious diseases', 'Diabetes, blood, & endocrine diseases', 'Cardiovascular diseases', 'Neonatal disorders', 'Cancers', 'Mental and substance use disorders', 'Neurological disorders', 'Musculoskeletal disorders', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [290480, 73500, 56387, 54317, 47687, 39229, 34628, 25707, 25706, 25228, 20],
    		  riskFactors: ['High blood sugar', 'Obesity', 'High blood pressure', 'Air pollution (outdoor & indoor)', 'Smoking', 'Unsafe water source', 'Child wasting', 'Unsafe sanitation', 'Drug use', 'High cholesterol', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [50246, 44707, 38344, 27484, 26951, 23734, 22767, 16393, 13684, 13563, 20] },
    		 {id: 21,
    		  name: "Brazil",
    		  lifeExpectancy: 75.88,
    		  demographics: [29188180, 31633075, 34181400, 34436184, 28902917, 24026608, 16292185, 8401090, 3987880],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Lower respiratory infections', 'Dementia', 'Respiratory diseases', 'Digestive diseases', 'Homicide', 'Diabetes', 'Road injuries', 'Liver diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [388268, 244969, 84073, 73419, 72746, 72556, 63825, 56474, 46282, 36269, 24512],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Interpersonal violence', 'Neurological disorders', 'Other NCDs', 'Diarrhea & common infectious diseases', 'Neonatal disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [8160380, 5945407, 4516692, 4060910, 3687892, 3645543, 3611498, 3460212, 2648390, 2616371, 395930],
    		  riskFactors: ['High blood pressure', 'Obesity', 'Smoking', 'High blood sugar', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet low in vegetables', 'Drug use', 'Diet high in salt', 'Iron deficiency', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [4906211, 4890017, 4562909, 3414338, 2207263, 1617178, 1049247, 1024329, 949371, 845115, 395930] },
    		 {id: 22,
    		  name: "Bulgaria",
    		  lifeExpectancy: 75.05,
    		  demographics: [662976, 671433, 724640, 971335, 1061668, 947156, 936053, 692820, 332035],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Digestive diseases', 'Respiratory diseases', 'Liver diseases', 'Diabetes', 'Lower respiratory infections', 'Kidney disease', 'Suicide', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [65619, 18734, 5945, 3543, 3299, 2043, 1584, 1549, 1447, 995, 133],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Unintentional injuries', 'Neurological disorders', 'Diabetes, blood, & endocrine diseases', 'Digestive diseases', 'Respiratory diseases', 'Mental and substance use disorders', 'Other NCDs', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1099367, 435223, 175641, 170811, 161624, 144882, 116883, 107938, 107874, 89058, 1768],
    		  riskFactors: ['High blood pressure', 'Smoking', 'Obesity', 'High blood sugar', 'High cholesterol', 'Diet low in fruits', 'Diet high in salt', 'Air pollution (outdoor & indoor)', 'Low physical activity', 'Secondhand smoke', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [722666, 559068, 443763, 326529, 319257, 174256, 168051, 167959, 67965, 64921, 1768] },
    		 {id: 23,
    		  name: "Burundi",
    		  lifeExpectancy: 61.58,
    		  demographics: [3785408, 2623579, 2004917, 1466422, 701174, 487477, 322819, 105870, 32911],
    		  majorCauses: ['Tuberculosis', 'Cardiovascular diseases', 'Malaria', 'Neonatal disorders', 'Lower respiratory infections', 'Diarrheal diseases', 'Cancers', 'Digestive diseases', 'HIV/AIDS', 'Nutritional deficiencies', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [9099, 9011, 8659, 7482, 7407, 5397, 4711, 3412, 2620, 2603, 1],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Malaria & neglected tropical diseases', 'Neonatal disorders', 'HIV/AIDS and tuberculosis', 'Other NCDs', 'Nutritional deficiencies', 'Cardiovascular diseases', 'Cancers', 'Unintentional injuries', 'Diabetes, blood, & endocrine diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1763666, 679542, 674414, 626305, 406552, 266914, 246428, 161672, 160437, 152196, 22],
    		  riskFactors: ['Child wasting', 'Air pollution (outdoor & indoor)', 'Unsafe water source', 'Unsafe sanitation', 'High blood sugar', 'High blood pressure', 'Child stunting', 'Vitamin A deficiency', 'Smoking', 'Diet low in fruits', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [610582, 323545, 313197, 240297, 154991, 152765, 145961, 133758, 91457, 55690, 22] },
    		 {id: 24,
    		  name: "Cambodia",
    		  lifeExpectancy: 69.82,
    		  demographics: [3522160, 3065792, 3101389, 2840783, 1393829, 1350228, 783099, 334192, 95070],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Digestive diseases', 'Lower respiratory infections', 'Liver diseases', 'Respiratory diseases', 'Neonatal disorders', 'Road injuries', 'Tuberculosis', 'Diabetes', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [24913, 12663, 11446, 9866, 9018, 4429, 4094, 3981, 2998, 2756, 0],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Cardiovascular diseases', 'Neonatal disorders', 'Digestive diseases', 'Unintentional injuries', 'Cancers', 'Other NCDs', 'Liver diseases', 'Musculoskeletal disorders', 'Diabetes, blood, & endocrine diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [721621, 585245, 411142, 364324, 360494, 352544, 302834, 275523, 252164, 243279, 0],
    		  riskFactors: ['Air pollution (outdoor & indoor)', 'High blood sugar', 'Smoking', 'High blood pressure', 'Child wasting', 'Diet low in fruits', 'Obesity', 'High cholesterol', 'Iron deficiency', 'Secondhand smoke', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [397320, 362958, 344974, 277013, 190587, 155655, 138476, 122622, 112834, 98497, 0] },
    		 {id: 25,
    		  name: "Cameroon",
    		  lifeExpectancy: 59.29,
    		  demographics: [7725327, 6005828, 4449460, 3290814, 2054202, 1239232, 710194, 323649, 77681],
    		  majorCauses: ['HIV/AIDS', 'Cardiovascular diseases', 'Malaria', 'Lower respiratory infections', 'Cancers', 'Neonatal disorders', 'Diarrheal diseases', 'Tuberculosis', 'Digestive diseases', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [22803, 22663, 22041, 16148, 14658, 13311, 12644, 8077, 7474, 5096, 175],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Malaria & neglected tropical diseases', 'HIV/AIDS and tuberculosis', 'Neonatal disorders', 'Other NCDs', 'Cardiovascular diseases', 'Diabetes, blood, & endocrine diseases', 'Cancers', 'Nutritional deficiencies', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [2368903, 1813493, 1710349, 1262545, 629329, 618008, 525557, 445027, 407151, 397774, 3900],
    		  riskFactors: ['Child wasting', 'Unsafe water source', 'Air pollution (outdoor & indoor)', 'Unsafe sanitation', 'High blood pressure', 'Vitamin A deficiency', 'Obesity', 'High blood sugar', 'Iron deficiency', 'Non-exclusive breastfeeding', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [951069, 787773, 595132, 577616, 384797, 349035, 336907, 335000, 196545, 181684, 3900] },
    		 {id: 26,
    		  name: "Canada",
    		  lifeExpectancy: 82.43,
    		  demographics: [3960088, 3974074, 5110382, 5204909, 4797691, 5260069, 4598419, 2876627, 1628778],
    		  majorCauses: ['Cancers', 'Cardiovascular diseases', 'Dementia', 'Respiratory diseases', 'Digestive diseases', 'Lower respiratory infections', 'Diabetes', 'COVID-19 until May 27, 2020', 'Kidney disease', 'Liver diseases', 'Suicide'],
    		  majorDeaths: [86229, 80838, 25219, 16133, 11283, 9048, 6959, 6639, 6087, 4845, 4616],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Unintentional injuries', 'Respiratory diseases', 'Other NCDs', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1683333, 1259054, 1089020, 735538, 692030, 563635, 421128, 407422, 385240, 280539, 90250],
    		  riskFactors: ['Smoking', 'Obesity', 'High blood sugar', 'High blood pressure', 'Drug use', 'High cholesterol', 'Diet high in salt', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Diet low in vegetables', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [1164013, 882678, 772461, 676655, 327167, 324651, 177023, 159411, 127590, 99110, 90250] },
    		 {id: 27,
    		  name: "Central African Republic",
    		  lifeExpectancy: 53.28,
    		  demographics: [1426413, 1237990, 809868, 493393, 336400, 228493, 135393, 60949, 16279],
    		  majorCauses: ['Cardiovascular diseases', 'Tuberculosis', 'Diarrheal diseases', 'HIV/AIDS', 'Lower respiratory infections', 'Neonatal disorders', 'Malaria', 'Road injuries', 'Cancers', 'Conflict', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [7278, 6728, 5983, 5319, 5021, 4770, 3849, 3495, 2695, 1879, 1],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'HIV/AIDS and tuberculosis', 'Neonatal disorders', 'Malaria & neglected tropical diseases', 'Other NCDs', 'Transport injuries', 'Cardiovascular diseases', 'Other communicable diseases', 'Nutritional deficiencies', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1079157, 873581, 436725, 335234, 229369, 223308, 209221, 166194, 163616, 111740, 21],
    		  riskFactors: ['Child wasting', 'Unsafe water source', 'Unsafe sanitation', 'Air pollution (outdoor & indoor)', 'Vitamin A deficiency', 'High blood sugar', 'High blood pressure', 'Child stunting', 'Non-exclusive breastfeeding', 'Smoking', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [535834, 377491, 290329, 249265, 190556, 155425, 134033, 121888, 93807, 87791, 21] },
    		 {id: 28,
    		  name: "Chad",
    		  lifeExpectancy: 54.24,
    		  demographics: [5340972, 3921214, 2679775, 1701718, 1040270, 634886, 404731, 174402, 48914],
    		  majorCauses: ['Diarrheal diseases', 'Lower respiratory infections', 'Neonatal disorders', 'Cardiovascular diseases', 'Malaria', 'Tuberculosis', 'Cancers', 'HIV/AIDS', 'Nutritional deficiencies', 'Meningitis', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [24903, 19421, 17167, 13094, 7679, 6649, 6620, 4926, 4336, 4232, 62],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Neonatal disorders', 'HIV/AIDS and tuberculosis', 'Malaria & neglected tropical diseases', 'Nutritional deficiencies', 'Other NCDs', 'Other communicable diseases', 'Cardiovascular diseases', 'Unintentional injuries', 'Diabetes, blood, & endocrine diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [3324967, 1521033, 739523, 714037, 630767, 494126, 389858, 358655, 346981, 278749, 1378],
    		  riskFactors: ['Child wasting', 'Unsafe water source', 'Unsafe sanitation', 'Air pollution (outdoor & indoor)', 'Vitamin A deficiency', 'Child stunting', 'Non-exclusive breastfeeding', 'Iron deficiency', 'High blood pressure', 'High blood sugar', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [2694326, 1652727, 1287466, 880045, 768811, 604902, 418815, 253170, 187689, 160699, 1378] },
    		 {id: 29,
    		  name: "Chile",
    		  lifeExpectancy: 80.18,
    		  demographics: [2450918, 2505672, 3020205, 2878807, 2556775, 2328585, 1737346, 950339, 523388],
    		  majorCauses: ['Cancers', 'Cardiovascular diseases', 'Dementia', 'Digestive diseases', 'Respiratory diseases', 'Liver diseases', 'Lower respiratory infections', 'Kidney disease', 'Diabetes', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [30116, 29906, 8340, 7955, 6141, 4980, 4588, 4225, 3331, 2281, 806],
    		  diseaseNames: ['Cancers', 'Musculoskeletal disorders', 'Cardiovascular diseases', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Neurological disorders', 'Other NCDs', 'Digestive diseases', 'Unintentional injuries', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [614838, 545626, 526835, 355493, 276342, 266925, 226976, 218323, 201592, 155243, 12027],
    		  riskFactors: ['Obesity', 'High blood sugar', 'High blood pressure', 'Smoking', 'Air pollution (outdoor & indoor)', 'High cholesterol', 'Diet high in salt', 'Diet low in fruits', 'Drug use', 'Secondhand smoke', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [400583, 369036, 365753, 335786, 129290, 123346, 98530, 87272, 86161, 46336, 12027] },
    		 {id: 30,
    		  name: "China",
    		  lifeExpectancy: 76.91,
    		  demographics: [171585833, 166513709, 192891037, 223506345, 223201182, 214623812, 148420591, 66894771, 26146412],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Respiratory diseases', 'Dementia', 'Digestive diseases', 'Road injuries', 'Lower respiratory infections', 'Kidney disease', 'Liver diseases', 'Diabetes', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [4377972, 2606907, 1009685, 490210, 283662, 261802, 179390, 175891, 153769, 153185, 4638],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Respiratory diseases', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Neurological disorders', 'Unintentional injuries', 'Transport injuries', 'Other NCDs', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [85319394, 63203596, 25138911, 23223150, 22139741, 20302946, 16758994, 16453012, 14994208, 14865833, 75805],
    		  riskFactors: ['Smoking', 'High blood pressure', 'Diet high in salt', 'Air pollution (outdoor & indoor)', 'Obesity', 'High blood sugar', 'Diet low in fruits', 'High cholesterol', 'Secondhand smoke', 'Drug use', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [51286559, 50724732, 38074126, 28361531, 25733491, 25669596, 18622122, 16998810, 9416153, 8365260, 75805] },
    		 {id: 31,
    		  name: "Colombia",
    		  lifeExpectancy: 77.29,
    		  demographics: [7448799, 8231614, 8779218, 7667022, 6339173, 5445614, 3633308, 1882391, 912304],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Respiratory diseases', 'Homicide', 'Dementia', 'Digestive diseases', 'Kidney disease', 'Lower respiratory infections', 'Road injuries', 'Diabetes', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [68023, 46576, 15303, 15053, 15050, 10847, 8502, 7851, 7437, 6155, 776],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Interpersonal violence', 'Musculoskeletal disorders', 'Neurological disorders', 'Neonatal disorders', 'Diabetes, blood, & endocrine diseases', 'Other NCDs', 'Mental and substance use disorders', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1258942, 1121602, 851013, 792895, 731688, 684779, 672924, 646324, 636887, 414242, 12593],
    		  riskFactors: ['High blood pressure', 'Obesity', 'High blood sugar', 'Smoking', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Drug use', 'Diet low in vegetables', 'Child wasting', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [824543, 729807, 553419, 521123, 301768, 295755, 201572, 177867, 169492, 113277, 12593] },
    		 {id: 32,
    		  name: "Comoros",
    		  lifeExpectancy: 64.32,
    		  demographics: [234784, 187246, 148281, 114000, 74321, 49408, 28300, 11291, 3260],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Lower respiratory infections', 'Tuberculosis', 'Neonatal disorders', 'Diarrheal diseases', 'Digestive diseases', 'Diabetes', 'Respiratory diseases', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [982, 565, 384, 305, 286, 272, 235, 151, 144, 113, 1],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Neonatal disorders', 'Cardiovascular diseases', 'Cancers', 'Other NCDs', 'HIV/AIDS and tuberculosis', 'Diabetes, blood, & endocrine diseases', 'Mental and substance use disorders', 'Other communicable diseases', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [58275, 29193, 22929, 16910, 15236, 11967, 10010, 9808, 9388, 8770, 21],
    		  riskFactors: ['High blood pressure', 'High blood sugar', 'Air pollution (outdoor & indoor)', 'Child wasting', 'Unsafe water source', 'Unsafe sanitation', 'Obesity', 'Smoking', 'Diet low in fruits', 'Vitamin A deficiency', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [15143, 14657, 13840, 13011, 10983, 8619, 7850, 5708, 5074, 4641, 21] },
    		 {id: 33,
    		  name: "Congo",
    		  lifeExpectancy: 64.57,
    		  demographics: [1570520, 1217193, 848863, 672432, 520344, 312337, 156783, 66533, 15498],
    		  majorCauses: ['Cardiovascular diseases', 'HIV/AIDS', 'Cancers', 'Lower respiratory infections', 'Tuberculosis', 'Malaria', 'Diarrheal diseases', 'Neonatal disorders', 'Digestive diseases', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [6527, 5571, 3275, 2308, 2279, 2244, 2107, 1717, 1615, 1229, 19],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'HIV/AIDS and tuberculosis', 'Neonatal disorders', 'Malaria & neglected tropical diseases', 'Cardiovascular diseases', 'Other NCDs', 'Cancers', 'Transport injuries', 'Nutritional deficiencies', 'Mental and substance use disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [325799, 322346, 171187, 167855, 162431, 107522, 100822, 78622, 73269, 70131, 426],
    		  riskFactors: ['High blood sugar', 'High blood pressure', 'Child wasting', 'Unsafe water source', 'Air pollution (outdoor & indoor)', 'Obesity', 'Unsafe sanitation', 'Vitamin A deficiency', 'Smoking', 'Iron deficiency', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [124326, 112354, 106554, 95933, 90427, 86646, 71649, 50058, 49945, 41776, 426] },
    		 {id: 34,
    		  name: "Costa Rica",
    		  lifeExpectancy: 80.28,
    		  demographics: [708607, 724264, 833947, 812730, 638064, 598490, 403726, 219837, 107896],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Digestive diseases', 'Dementia', 'Respiratory diseases', 'Kidney disease', 'Liver diseases', 'Road injuries', 'Lower respiratory infections', 'Homicide', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [6852, 5717, 1546, 1458, 1331, 1265, 840, 782, 521, 484, 10],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Diabetes, blood, & endocrine diseases', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Neurological disorders', 'Other NCDs', 'Digestive diseases', 'Neonatal disorders', 'Transport injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [129752, 127974, 71800, 69245, 69175, 68520, 55612, 45180, 44686, 40129, 156],
    		  riskFactors: ['High blood pressure', 'Obesity', 'High blood sugar', 'Smoking', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Drug use', 'Diet low in vegetables', 'Diet high in salt', 'Diet low in fruits', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [91847, 83330, 60423, 52627, 34589, 25963, 19624, 16119, 16042, 11088, 156] },
    		 {id: 35,
    		  name: "Croatia",
    		  lifeExpectancy: 78.49,
    		  demographics: [392834, 410760, 480216, 550013, 555343, 588949, 560899, 355380, 235905],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Digestive diseases', 'Respiratory diseases', 'Liver diseases', 'Diabetes', 'Kidney disease', 'Suicide', 'Lower respiratory infections', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [23426, 13549, 3369, 2105, 1890, 1095, 999, 829, 708, 562, 101],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Neurological disorders', 'Unintentional injuries', 'Diabetes, blood, & endocrine diseases', 'Mental and substance use disorders', 'Digestive diseases', 'Respiratory diseases', 'Other NCDs', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [350896, 277822, 115566, 95306, 90347, 71504, 67555, 59045, 57095, 50719, 1305],
    		  riskFactors: ['Smoking', 'High blood pressure', 'High blood sugar', 'Obesity', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Diet low in fruits', 'Diet low in vegetables', 'Secondhand smoke', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [236270, 221560, 184287, 175349, 111451, 66726, 54483, 41805, 33657, 32700, 1305] },
    		 {id: 36,
    		  name: "Cuba",
    		  lifeExpectancy: 78.8,
    		  demographics: [1211133, 1264436, 1453162, 1486561, 1647810, 1926480, 1141744, 785066, 417092],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Lower respiratory infections', 'Respiratory diseases', 'Digestive diseases', 'Kidney disease', 'Liver diseases', 'Suicide', 'Diabetes', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [37598, 26203, 6988, 5678, 4406, 3969, 2340, 1869, 1791, 1769, 82],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Mental and substance use disorders', 'Neurological disorders', 'Musculoskeletal disorders', 'Diabetes, blood, & endocrine diseases', 'Respiratory diseases', 'Digestive diseases', 'Unintentional injuries', 'Other NCDs', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [642754, 559920, 213593, 206468, 200596, 196844, 135526, 125201, 124433, 120958, 1157],
    		  riskFactors: ['Smoking', 'High blood pressure', 'Obesity', 'High blood sugar', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Low physical activity', 'Secondhand smoke', 'Diet low in fruits', 'Drug use', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [438389, 343228, 312365, 276017, 153908, 137799, 59008, 43727, 40328, 38862, 1157] },
    		 {id: 37,
    		  name: "Cyprus",
    		  lifeExpectancy: 80.98,
    		  demographics: [132700, 142584, 194044, 188609, 163509, 145402, 117232, 75969, 38524],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Respiratory diseases', 'Diabetes', 'Digestive diseases', 'Kidney disease', 'Lower respiratory infections', 'Road injuries', 'Liver diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [2705, 2058, 483, 474, 401, 288, 256, 177, 152, 123, 17],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Neurological disorders', 'Diabetes, blood, & endocrine diseases', 'Unintentional injuries', 'Respiratory diseases', 'Other NCDs', 'Transport injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [44787, 43465, 37224, 23489, 22987, 18671, 14397, 12683, 12131, 9314, 244],
    		  riskFactors: ['Smoking', 'High blood sugar', 'High blood pressure', 'Obesity', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Diet high in salt', 'Diet low in vegetables', 'Secondhand smoke', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [39657, 31547, 27432, 24115, 10889, 10563, 6165, 4247, 4166, 3965, 244] },
    		 {id: 38,
    		  name: "Czech Republic",
    		  lifeExpectancy: 79.38,
    		  demographics: [1119008, 1033915, 1145980, 1510360, 1774233, 1333127, 1344888, 987327, 440375],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Digestive diseases', 'Respiratory diseases', 'Lower respiratory infections', 'Diabetes', 'Liver diseases', 'Suicide', 'Kidney disease', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [48960, 28927, 7581, 4520, 3864, 3222, 2958, 2175, 1517, 1257, 317],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Unintentional injuries', 'Musculoskeletal disorders', 'Neurological disorders', 'Diabetes, blood, & endocrine diseases', 'Mental and substance use disorders', 'Digestive diseases', 'Respiratory diseases', 'Other NCDs', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [767029, 588271, 299173, 266439, 218376, 192175, 161210, 142372, 138323, 117131, 4313],
    		  riskFactors: ['Smoking', 'High blood pressure', 'High blood sugar', 'Obesity', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Diet low in fruits', 'Diet low in vegetables', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [534077, 464396, 417162, 396780, 244021, 141737, 120526, 108619, 81237, 58791, 4313] },
    		 {id: 39,
    		  name: "Democratic Republic of Congo",
    		  lifeExpectancy: 60.68,
    		  demographics: [28801093, 20234100, 13690339, 9435368, 6384869, 4195557, 2494965, 1224414, 329862],
    		  majorCauses: ['Cardiovascular diseases', 'Malaria', 'Lower respiratory infections', 'Neonatal disorders', 'Tuberculosis', 'Diarrheal diseases', 'Cancers', 'Digestive diseases', 'Road injuries', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [83261, 81226, 58587, 53950, 53304, 36660, 33983, 24612, 20502, 16529, 67],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Malaria & neglected tropical diseases', 'Neonatal disorders', 'HIV/AIDS and tuberculosis', 'Other NCDs', 'Cardiovascular diseases', 'Nutritional deficiencies', 'Unintentional injuries', 'Transport injuries', 'Other communicable diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [7863311, 7196932, 5077139, 4008675, 3345697, 2134794, 1817886, 1436816, 1426298, 1298704, 1403],
    		  riskFactors: ['Child wasting', 'Air pollution (outdoor & indoor)', 'Unsafe water source', 'Unsafe sanitation', 'High blood sugar', 'High blood pressure', 'Vitamin A deficiency', 'Child stunting', 'Obesity', 'Iron deficiency', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [4257878, 2771806, 2150401, 1590217, 1570390, 1320957, 1304840, 963409, 585796, 579539, 1403] },
    		 {id: 40,
    		  name: "Denmark",
    		  lifeExpectancy: 80.9,
    		  demographics: [607866, 679998, 774991, 662575, 752091, 803945, 657184, 566946, 266281],
    		  majorCauses: ['Cancers', 'Cardiovascular diseases', 'Dementia', 'Respiratory diseases', 'Digestive diseases', 'Lower respiratory infections', 'Diabetes', 'Kidney disease', 'Liver diseases', 'Alcohol use disorders', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [17404, 14525, 4477, 4319, 2530, 2377, 1294, 968, 947, 807, 563],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Respiratory diseases', 'Diabetes, blood, & endocrine diseases', 'Unintentional injuries', 'Other NCDs', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [327456, 205301, 194924, 120546, 105512, 93110, 85962, 68094, 66681, 58050, 7430],
    		  riskFactors: ['Smoking', 'High blood sugar', 'High blood pressure', 'Obesity', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Drug use', 'Diet low in fruits', 'Low physical activity', 'Diet high in salt', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [245839, 174984, 123682, 118127, 54793, 47590, 26013, 20933, 17766, 15494, 7430] },
    		 {id: 41,
    		  name: "Ecuador",
    		  lifeExpectancy: 77.01,
    		  demographics: [3260635, 3116390, 2997435, 2540942, 2046448, 1546300, 1047152, 545637, 272718],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Digestive diseases', 'Kidney disease', 'Lower respiratory infections', 'Dementia', 'Road injuries', 'Diabetes', 'Liver diseases', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [19679, 16097, 6155, 5739, 5149, 4971, 4465, 4389, 3457, 3387, 3203],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Diabetes, blood, & endocrine diseases', 'Mental and substance use disorders', 'Neurological disorders', 'Neonatal disorders', 'Unintentional injuries', 'Transport injuries', 'Musculoskeletal disorders', 'Other NCDs', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [396000, 384366, 300660, 261958, 248588, 242400, 240306, 240294, 239834, 234280, 53061],
    		  riskFactors: ['Obesity', 'High blood sugar', 'High blood pressure', 'Smoking', 'Air pollution (outdoor & indoor)', 'High cholesterol', 'Child wasting', 'Drug use', 'COVID-19 until May 27, 2020', 'Diet high in salt', 'Diet low in vegetables'],
    		  riskDALYs: [348663, 321389, 246503, 119257, 105392, 85569, 58040, 54693, 53061, 53036, 52491] },
    		 {id: 42,
    		  name: "Egypt",
    		  lifeExpectancy: 71.99,
    		  demographics: [24622198, 17968738, 16473942, 14922068, 10574668, 7677870, 4957959, 2412411, 778221],
    		  majorCauses: ['Cardiovascular diseases', 'Digestive diseases', 'Cancers', 'Liver diseases', 'Road injuries', 'Lower respiratory infections', 'Respiratory diseases', 'Diabetes', 'Kidney disease', 'Dementia', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [232675, 50101, 48024, 44692, 26946, 23097, 19990, 13836, 13115, 9852, 797],
    		  diseaseNames: ['Cardiovascular diseases', 'Diarrhea & common infectious diseases', 'Diabetes, blood, & endocrine diseases', 'Other NCDs', 'Musculoskeletal disorders', 'Transport injuries', 'Digestive diseases', 'Cancers', 'Mental and substance use disorders', 'Neurological disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [5910574, 2376177, 2004534, 1779497, 1734654, 1639386, 1638469, 1585928, 1499388, 1236761, 14855],
    		  riskFactors: ['High blood pressure', 'Obesity', 'High blood sugar', 'Air pollution (outdoor & indoor)', 'Smoking', 'High cholesterol', 'Child wasting', 'Secondhand smoke', 'Diet low in fruits', 'Drug use', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [3669121, 3557105, 3101643, 2195056, 2164638, 1845428, 916224, 664061, 658551, 595808, 14855] },
    		 {id: 43,
    		  name: "Eritrea",
    		  lifeExpectancy: 66.32,
    		  demographics: [978748, 830029, 574495, 446287, 274976, 167460, 127422, 75264, 22435],
    		  majorCauses: ['Cardiovascular diseases', 'Tuberculosis', 'Cancers', 'Lower respiratory infections', 'Diarrheal diseases', 'Neonatal disorders', 'Digestive diseases', 'HIV/AIDS', 'Road injuries', 'Nutritional deficiencies', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [5211, 5072, 3968, 3737, 3723, 3013, 2104, 1521, 1287, 1147, 0],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Neonatal disorders', 'HIV/AIDS and tuberculosis', 'Cardiovascular diseases', 'Other NCDs', 'Nutritional deficiencies', 'Cancers', 'Unintentional injuries', 'Digestive diseases', 'Transport injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [480274, 297214, 197674, 154881, 152787, 147554, 146554, 98581, 91972, 79943, 0],
    		  riskFactors: ['Child wasting', 'Unsafe water source', 'Air pollution (outdoor & indoor)', 'Unsafe sanitation', 'High blood sugar', 'High blood pressure', 'Vitamin A deficiency', 'Iron deficiency', 'Child stunting', 'Smoking', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [297140, 197758, 159271, 153111, 101300, 84060, 67867, 63384, 53520, 53356, 0] },
    		 {id: 44,
    		  name: "Estonia",
    		  lifeExpectancy: 78.74,
    		  demographics: [144409, 134136, 152005, 191747, 183573, 168320, 165824, 108288, 77347],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Digestive diseases', 'Respiratory diseases', 'Liver diseases', 'Kidney disease', 'Suicide', 'Lower respiratory infections', 'Alcohol use disorders', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [7744, 3461, 1118, 602, 293, 292, 268, 220, 217, 217, 65],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Unintentional injuries', 'Neurological disorders', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Digestive diseases', 'Other NCDs', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [113906, 70732, 31560, 31446, 30926, 22291, 22035, 20576, 14972, 11179, 829],
    		  riskFactors: ['High blood pressure', 'Obesity', 'Smoking', 'High blood sugar', 'High cholesterol', 'Diet high in salt', 'Diet low in fruits', 'Drug use', 'Air pollution (outdoor & indoor)', 'Diet low in vegetables', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [80846, 58304, 56332, 48633, 37388, 15952, 12597, 12529, 9917, 7623, 829] },
    		 {id: 45,
    		  name: "Ethiopia",
    		  lifeExpectancy: 66.6,
    		  demographics: [31533142, 26475407, 20669323, 13261792, 8719197, 5482039, 3520095, 1857863, 559868],
    		  majorCauses: ['Neonatal disorders', 'Cardiovascular diseases', 'Diarrheal diseases', 'Lower respiratory infections', 'Cancers', 'Tuberculosis', 'Digestive diseases', 'HIV/AIDS', 'Liver diseases', 'Nutritional deficiencies', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [68899, 58719, 58105, 47564, 42795, 35598, 27760, 17181, 16069, 12681, 6],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Neonatal disorders', 'HIV/AIDS and tuberculosis', 'Other NCDs', 'Nutritional deficiencies', 'Cardiovascular diseases', 'Cancers', 'Diabetes, blood, & endocrine diseases', 'Mental and substance use disorders', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [8628459, 6657770, 2988580, 1923960, 1872827, 1526604, 1414986, 1356684, 1343853, 1309199, 121],
    		  riskFactors: ['Child wasting', 'Unsafe water source', 'Unsafe sanitation', 'Vitamin A deficiency', 'Air pollution (outdoor & indoor)', 'Child stunting', 'High blood sugar', 'High blood pressure', 'Iron deficiency', 'Non-exclusive breastfeeding', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [4547197, 3145313, 2543816, 2068085, 2019593, 1169571, 907469, 798529, 547656, 524032, 121] },
    		 {id: 46,
    		  name: "Fiji",
    		  lifeExpectancy: 67.44,
    		  demographics: [178430, 156385, 142025, 134490, 104486, 91193, 54810, 22779, 5357],
    		  majorCauses: ['Cardiovascular diseases', 'Diabetes', 'Cancers', 'Respiratory diseases', 'Lower respiratory infections', 'Kidney disease', 'Neonatal disorders', 'Digestive diseases', 'Dementia', 'Diarrheal diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [2553, 1578, 739, 378, 312, 278, 175, 169, 133, 86, 0],
    		  diseaseNames: ['Diabetes, blood, & endocrine diseases', 'Cardiovascular diseases', 'Diarrhea & common infectious diseases', 'Cancers', 'Neonatal disorders', 'Other NCDs', 'Respiratory diseases', 'Unintentional injuries', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [81934, 69931, 22502, 22019, 17626, 16262, 16096, 15187, 14204, 12061, 0],
    		  riskFactors: ['High blood sugar', 'Obesity', 'High blood pressure', 'Smoking', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Diet low in vegetables', 'Secondhand smoke', 'Diet high in salt', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [80830, 74137, 44313, 28763, 25566, 22452, 17909, 10712, 10082, 9252, 0] },
    		 {id: 47,
    		  name: "Finland",
    		  lifeExpectancy: 81.91,
    		  demographics: [578800, 602758, 678649, 705213, 655323, 728975, 720693, 556209, 305539],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Digestive diseases', 'Respiratory diseases', 'Liver diseases', 'Suicide', 'Lower respiratory infections', 'Parkinson disease', 'Alcohol use disorders', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [21359, 13089, 8546, 2416, 1784, 1178, 868, 713, 682, 598, 312],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Unintentional injuries', 'Diabetes, blood, & endocrine diseases', 'Digestive diseases', 'Respiratory diseases', 'Other NCDs', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [297803, 244327, 168915, 159341, 109069, 95183, 67129, 65492, 57755, 56824, 3999],
    		  riskFactors: ['High blood pressure', 'High blood sugar', 'Obesity', 'Smoking', 'High cholesterol', 'Diet low in fruits', 'Drug use', 'Diet low in vegetables', 'Diet high in salt', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [177418, 161016, 139500, 134558, 81929, 35314, 31633, 27778, 27062, 25187, 3999] },
    		 {id: 48,
    		  name: "France",
    		  lifeExpectancy: 82.66,
    		  demographics: [7606630, 7857054, 7415448, 8007883, 8408482, 8600917, 7758713, 5456311, 4018291],
    		  majorCauses: ['Cancers', 'Cardiovascular diseases', 'Dementia', 'COVID-19 until May 27, 2020', 'Digestive diseases', 'Respiratory diseases', 'Lower respiratory infections', 'Suicide', 'Liver diseases', 'Diabetes', 'Kidney disease'],
    		  majorDeaths: [182241, 155683, 70567, 28530, 27350, 20917, 20732, 11067, 10621, 10579, 9279],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Unintentional injuries', 'Diabetes, blood, & endocrine diseases', 'Other NCDs', 'Digestive diseases', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [3380270, 2121253, 1815206, 1555743, 1407146, 999326, 828873, 686563, 601963, 532875, 357532],
    		  riskFactors: ['Smoking', 'High blood pressure', 'High blood sugar', 'Obesity', 'High cholesterol', 'COVID-19 until May 27, 2020', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Drug use', 'Diet high in salt', 'Low physical activity'],
    		  riskDALYs: [1910863, 1144792, 1069097, 1035904, 529536, 357532, 346605, 266385, 261196, 186249, 167243] },
    		 {id: 49,
    		  name: "Gabon",
    		  lifeExpectancy: 66.47,
    		  demographics: [586583, 410229, 369653, 340542, 222608, 126869, 68865, 35920, 11309],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Lower respiratory infections', 'Malaria', 'HIV/AIDS', 'Neonatal disorders', 'Digestive diseases', 'Tuberculosis', 'Diabetes', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [2230, 1240, 756, 705, 644, 630, 601, 569, 447, 435, 14],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'HIV/AIDS and tuberculosis', 'Neonatal disorders', 'Malaria & neglected tropical diseases', 'Cardiovascular diseases', 'Other NCDs', 'Cancers', 'Diabetes, blood, & endocrine diseases', 'Transport injuries', 'Mental and substance use disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [81025, 76009, 63650, 53830, 50948, 36479, 34988, 30639, 28574, 25521, 287],
    		  riskFactors: ['High blood sugar', 'High blood pressure', 'Obesity', 'Air pollution (outdoor & indoor)', 'Smoking', 'Iron deficiency', 'Child wasting', 'Unsafe water source', 'Unsafe sanitation', 'High cholesterol', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [45650, 35609, 33446, 22861, 20977, 16066, 13877, 13686, 9638, 9322, 287] },
    		 {id: 50,
    		  name: "Gambia",
    		  lifeExpectancy: 62.05,
    		  demographics: [744980, 541297, 417652, 271437, 168487, 111373, 57178, 29296, 5996],
    		  majorCauses: ['Cardiovascular diseases', 'Lower respiratory infections', 'Neonatal disorders', 'Cancers', 'HIV/AIDS', 'Diarrheal diseases', 'Tuberculosis', 'Digestive diseases', 'Respiratory diseases', 'Maternal disorders', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [2686, 1235, 1216, 1090, 883, 616, 604, 564, 402, 312, 1],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Neonatal disorders', 'Other NCDs', 'Cardiovascular diseases', 'HIV/AIDS and tuberculosis', 'Nutritional deficiencies', 'Cancers', 'Diabetes, blood, & endocrine diseases', 'Unintentional injuries', 'Mental and substance use disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [158130, 117340, 74485, 64688, 63678, 49673, 33379, 28846, 28696, 27958, 22],
    		  riskFactors: ['Child wasting', 'Air pollution (outdoor & indoor)', 'High blood pressure', 'Unsafe water source', 'Iron deficiency', 'High blood sugar', 'Obesity', 'Unsafe sanitation', 'Vitamin A deficiency', 'Smoking', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [55905, 47203, 43352, 33016, 32534, 30844, 25630, 24125, 21488, 21141, 22] },
    		 {id: 51,
    		  name: "Georgia",
    		  lifeExpectancy: 73.77,
    		  demographics: [555503, 462513, 517237, 565027, 516086, 532797, 450191, 245487, 151920],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Digestive diseases', 'Respiratory diseases', 'Liver diseases', 'Diabetes', 'Kidney disease', 'Lower respiratory infections', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [29989, 7926, 2291, 1938, 1776, 1381, 1210, 785, 767, 724, 12],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Diabetes, blood, & endocrine diseases', 'Neurological disorders', 'Unintentional injuries', 'Musculoskeletal disorders', 'Digestive diseases', 'Mental and substance use disorders', 'Respiratory diseases', 'Other NCDs', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [492777, 199176, 77350, 71942, 71878, 66363, 61436, 52174, 50743, 49258, 167],
    		  riskFactors: ['High blood pressure', 'High blood sugar', 'Obesity', 'Smoking', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Diet high in salt', 'Diet low in vegetables', 'Secondhand smoke', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [330197, 249730, 207106, 181728, 112711, 96544, 85246, 73731, 53296, 37918, 167] },
    		 {id: 52,
    		  name: "Germany",
    		  lifeExpectancy: 81.33,
    		  demographics: [7726915, 7948424, 9421661, 10770439, 10400203, 13574883, 10347526, 7589596, 5737398],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Respiratory diseases', 'Digestive diseases', 'Kidney disease', 'Lower respiratory infections', 'Liver diseases', 'Diabetes', 'Parkinson disease', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [356362, 252763, 83782, 46375, 44735, 26754, 25237, 19558, 19133, 12716, 8349],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Respiratory diseases', 'Unintentional injuries', 'Digestive diseases', 'Other NCDs', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [4855900, 4820928, 2911225, 2149784, 1683775, 1498390, 1240818, 1133138, 1077631, 979500, 103590],
    		  riskFactors: ['Smoking', 'High blood pressure', 'High blood sugar', 'Obesity', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Diet high in salt', 'Diet low in vegetables', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [3414722, 2775807, 2418682, 2199578, 1294183, 787908, 609964, 445019, 404628, 379320, 103590] },
    		 {id: 53,
    		  name: "Ghana",
    		  lifeExpectancy: 64.07,
    		  demographics: [7954883, 6496468, 5300953, 4080533, 2958700, 2058206, 1030760, 439902, 97453],
    		  majorCauses: ['Cardiovascular diseases', 'Malaria', 'Lower respiratory infections', 'Cancers', 'Neonatal disorders', 'HIV/AIDS', 'Tuberculosis', 'Digestive diseases', 'Diarrheal diseases', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [36615, 18757, 17761, 17559, 16951, 13878, 9142, 8541, 7309, 5381, 34],
    		  diseaseNames: ['Neonatal disorders', 'Diarrhea & common infectious diseases', 'Malaria & neglected tropical diseases', 'HIV/AIDS and tuberculosis', 'Cardiovascular diseases', 'Other NCDs', 'Diabetes, blood, & endocrine diseases', 'Nutritional deficiencies', 'Cancers', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1654622, 1394112, 1250172, 952830, 938267, 741457, 564721, 546793, 529975, 408703, 745],
    		  riskFactors: ['High blood pressure', 'Child wasting', 'Air pollution (outdoor & indoor)', 'High blood sugar', 'Obesity', 'Unsafe water source', 'Iron deficiency', 'Unsafe sanitation', 'Vitamin A deficiency', 'Smoking', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [588032, 571389, 561136, 521296, 439123, 427879, 305486, 303853, 231330, 180575, 745] },
    		 {id: 54,
    		  name: "Greece",
    		  lifeExpectancy: 82.24,
    		  demographics: [910515, 1071214, 1068916, 1384511, 1584912, 1489576, 1243217, 940663, 779928],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Respiratory diseases', 'Lower respiratory infections', 'Kidney disease', 'Digestive diseases', 'Parkinson disease', 'Liver diseases', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [50895, 31245, 11489, 6069, 4269, 3582, 3579, 1460, 1308, 1221, 173],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Respiratory diseases', 'Diabetes, blood, & endocrine diseases', 'Unintentional injuries', 'Other NCDs', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [687099, 569885, 326957, 284049, 219619, 153164, 151809, 133281, 120023, 89730, 2100],
    		  riskFactors: ['Smoking', 'High blood pressure', 'High blood sugar', 'Obesity', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Secondhand smoke', 'Diet low in fruits', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [560222, 357593, 314662, 288302, 216660, 129722, 59070, 56707, 53709, 52342, 2100] },
    		 {id: 55,
    		  name: "Grenada",
    		  lifeExpectancy: 72.4,
    		  demographics: [18172, 16008, 18677, 17858, 12661, 12282, 9161, 4727, 2456],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Diabetes', 'Lower respiratory infections', 'Dementia', 'Kidney disease', 'Digestive diseases', 'Respiratory diseases', 'Liver diseases', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [411, 228, 95, 83, 51, 51, 41, 30, 19, 12, 0],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Diabetes, blood, & endocrine diseases', 'Musculoskeletal disorders', 'Neurological disorders', 'Diarrhea & common infectious diseases', 'Mental and substance use disorders', 'Other NCDs', 'Unintentional injuries', 'Neonatal disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [7147, 4824, 3842, 1912, 1911, 1843, 1805, 1620, 1510, 1282, 0],
    		  riskFactors: ['High blood sugar', 'High blood pressure', 'Obesity', 'Smoking', 'Air pollution (outdoor & indoor)', 'High cholesterol', 'Diet low in vegetables', 'Diet low in fruits', 'Low physical activity', 'Drug use', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [5685, 4337, 3932, 2146, 1782, 1177, 766, 746, 589, 399, 0] },
    		 {id: 56,
    		  name: "Guatemala",
    		  lifeExpectancy: 74.3,
    		  demographics: [4021938, 3865062, 3339524, 2460641, 1627996, 1016203, 695632, 366031, 188449],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Lower respiratory infections', 'Digestive diseases', 'Homicide', 'Diabetes', 'Kidney disease', 'Liver diseases', 'Neonatal disorders', 'Diarrheal diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [15009, 11034, 9695, 7300, 6193, 5531, 5065, 4623, 3675, 2957, 63],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Neonatal disorders', 'Diabetes, blood, & endocrine diseases', 'Interpersonal violence', 'Cardiovascular diseases', 'Cancers', 'Digestive diseases', 'Other NCDs', 'Unintentional injuries', 'Mental and substance use disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [602755, 403822, 382601, 338262, 335440, 294204, 269396, 267082, 252017, 228858, 1128],
    		  riskFactors: ['High blood sugar', 'Air pollution (outdoor & indoor)', 'Obesity', 'Child wasting', 'High blood pressure', 'Unsafe water source', 'Drug use', 'Smoking', 'Unsafe sanitation', 'High cholesterol', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [402592, 269293, 262556, 226714, 226087, 161136, 102818, 100650, 95949, 81342, 1128] },
    		 {id: 57,
    		  name: "Guinea",
    		  lifeExpectancy: 61.6,
    		  demographics: [3893217, 3131561, 2277961, 1403283, 864312, 600063, 394880, 166054, 39914],
    		  majorCauses: ['Cardiovascular diseases', 'Lower respiratory infections', 'Malaria', 'Neonatal disorders', 'Cancers', 'Tuberculosis', 'Diarrheal diseases', 'Digestive diseases', 'HIV/AIDS', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [16151, 12033, 11355, 10012, 8125, 5917, 5287, 3131, 2989, 2898, 20],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Malaria & neglected tropical diseases', 'Neonatal disorders', 'HIV/AIDS and tuberculosis', 'Cardiovascular diseases', 'Other NCDs', 'Nutritional deficiencies', 'Diabetes, blood, & endocrine diseases', 'Cancers', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1570992, 929025, 915842, 474268, 405634, 401375, 329709, 268882, 248388, 223100, 435],
    		  riskFactors: ['Child wasting', 'Air pollution (outdoor & indoor)', 'Unsafe water source', 'High blood pressure', 'Unsafe sanitation', 'Vitamin A deficiency', 'High blood sugar', 'Child stunting', 'Iron deficiency', 'Obesity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [731514, 509268, 290067, 232709, 216134, 197656, 172770, 143237, 135493, 114120, 435] },
    		 {id: 58,
    		  name: "Guyana",
    		  lifeExpectancy: 69.91,
    		  demographics: [147517, 147825, 142736, 93866, 91021, 78183, 49260, 21780, 10587],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Diabetes', 'Digestive diseases', 'Lower respiratory infections', 'HIV/AIDS', 'Neonatal disorders', 'Suicide', 'Kidney disease', 'Liver diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [2034, 621, 425, 281, 248, 196, 194, 189, 181, 174, 11],
    		  diseaseNames: ['Cardiovascular diseases', 'Diabetes, blood, & endocrine diseases', 'Neonatal disorders', 'Cancers', 'Mental and substance use disorders', 'Diarrhea & common infectious diseases', 'HIV/AIDS and tuberculosis', 'Unintentional injuries', 'Other NCDs', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [48488, 29028, 20211, 17630, 13647, 13225, 12727, 12670, 11948, 10822, 189],
    		  riskFactors: ['High blood sugar', 'High blood pressure', 'Obesity', 'High cholesterol', 'Smoking', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Diet low in vegetables', 'Child wasting', 'Iron deficiency', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [35463, 29423, 27805, 13961, 12513, 10968, 9387, 5708, 4171, 4063, 189] },
    		 {id: 59,
    		  name: "Haiti",
    		  lifeExpectancy: 64.0,
    		  demographics: [2503602, 2334380, 2030254, 1702688, 1062317, 774512, 506169, 253257, 95900],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Lower respiratory infections', 'Neonatal disorders', 'Road injuries', 'Diabetes', 'HIV/AIDS', 'Diarrheal diseases', 'Digestive diseases', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [23978, 10065, 6003, 4793, 4487, 4003, 3850, 3703, 3619, 3134, 33],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Cardiovascular diseases', 'Neonatal disorders', 'Other NCDs', 'Unintentional injuries', 'HIV/AIDS and tuberculosis', 'Diabetes, blood, & endocrine diseases', 'Cancers', 'Transport injuries', 'Mental and substance use disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [734644, 612671, 458390, 384494, 368148, 340215, 313273, 291429, 265724, 171517, 613],
    		  riskFactors: ['Child wasting', 'High blood sugar', 'High blood pressure', 'Air pollution (outdoor & indoor)', 'Unsafe water source', 'Unsafe sanitation', 'Obesity', 'High cholesterol', 'Smoking', 'Iron deficiency', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [382608, 367485, 324753, 312815, 295182, 220161, 210943, 155160, 116590, 113575, 613] },
    		 {id: 60,
    		  name: "Honduras",
    		  lifeExpectancy: 75.27,
    		  demographics: [2006000, 2073497, 1868035, 1435980, 1009908, 653401, 402303, 195289, 101701],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Digestive diseases', 'Homicide', 'Dementia', 'Liver diseases', 'Respiratory diseases', 'Neonatal disorders', 'Road injuries', 'Diarrheal diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [13117, 5431, 4449, 4154, 2408, 2388, 2056, 1464, 1294, 1229, 188],
    		  diseaseNames: ['Cardiovascular diseases', 'Interpersonal violence', 'Neonatal disorders', 'Diabetes, blood, & endocrine diseases', 'Digestive diseases', 'Cancers', 'Neurological disorders', 'Diarrhea & common infectious diseases', 'Other NCDs', 'Mental and substance use disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [282192, 228670, 180903, 164244, 156390, 152814, 133332, 128019, 126607, 118070, 3444],
    		  riskFactors: ['High blood pressure', 'Obesity', 'High blood sugar', 'Smoking', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Unsafe water source', 'Diet low in fruits', 'Diet low in vegetables', 'Drug use', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [159975, 146377, 133796, 103459, 99629, 85602, 51514, 43189, 41993, 40037, 3444] },
    		 {id: 61,
    		  name: "Hungary",
    		  lifeExpectancy: 76.88,
    		  demographics: [911982, 972734, 1176155, 1283490, 1579425, 1189378, 1322500, 822141, 426875],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Digestive diseases', 'Respiratory diseases', 'Liver diseases', 'Diabetes', 'Suicide', 'Kidney disease', 'Lower respiratory infections', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [57212, 32138, 7064, 5879, 5457, 3228, 2063, 2025, 1553, 1016, 505],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Unintentional injuries', 'Neurological disorders', 'Digestive diseases', 'Diabetes, blood, & endocrine diseases', 'Respiratory diseases', 'Mental and substance use disorders', 'Other NCDs', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [948587, 719728, 271875, 246768, 206846, 180409, 179146, 177834, 153606, 115640, 6850],
    		  riskFactors: ['Smoking', 'High blood pressure', 'Obesity', 'High blood sugar', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Diet low in fruits', 'Low physical activity', 'Secondhand smoke', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [680552, 655486, 476990, 428625, 339453, 181526, 170125, 141183, 64658, 59660, 6850] },
    		 {id: 62,
    		  name: "Iceland",
    		  lifeExpectancy: 82.99,
    		  demographics: [43668, 44269, 48238, 46464, 42622, 42276, 36635, 22223, 12642],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Respiratory diseases', 'Lower respiratory infections', 'Digestive diseases', 'Suicide', 'Parkinson disease', 'Kidney disease', 'Diabetes', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [738, 652, 236, 114, 95, 65, 40, 39, 27, 22, 10],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Respiratory diseases', 'Unintentional injuries', 'Diabetes, blood, & endocrine diseases', 'Other NCDs', 'Diarrhea & common infectious diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [12927, 10060, 9227, 7061, 6135, 3992, 3785, 3121, 3018, 1716, 139],
    		  riskFactors: ['Smoking', 'High blood sugar', 'Obesity', 'High blood pressure', 'High cholesterol', 'Drug use', 'Air pollution (outdoor & indoor)', 'Diet low in vegetables', 'Diet low in fruits', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [7646, 6360, 6244, 5408, 3428, 1198, 1195, 1008, 1005, 925, 139] },
    		 {id: 63,
    		  name: "India",
    		  lifeExpectancy: 69.66,
    		  demographics: [236731829, 252674336, 238481457, 212399683, 165881490, 125378954, 84296275, 37500685, 13073046],
    		  majorCauses: ['Cardiovascular diseases', 'Respiratory diseases', 'Cancers', 'Diarrheal diseases', 'Lower respiratory infections', 'Tuberculosis', 'Neonatal disorders', 'Digestive diseases', 'Diabetes', 'Kidney disease', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [2632780, 1271687, 929500, 719083, 507364, 449794, 428672, 419545, 254555, 223821, 4337],
    		  diseaseNames: ['Cardiovascular diseases', 'Diarrhea & common infectious diseases', 'Neonatal disorders', 'Respiratory diseases', 'Diabetes, blood, & endocrine diseases', 'Cancers', 'Unintentional injuries', 'Other NCDs', 'Mental and substance use disorders', 'Musculoskeletal disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [64219262, 59105453, 46464098, 33125142, 26160476, 25772512, 23310913, 22563499, 22096435, 21348307, 79240],
    		  riskFactors: ['Air pollution (outdoor & indoor)', 'High blood pressure', 'High blood sugar', 'Smoking', 'Child wasting', 'Unsafe water source', 'High cholesterol', 'Obesity', 'Iron deficiency', 'Diet low in fruits', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [39210284, 37485408, 28068070, 23841107, 20642364, 19658345, 19264482, 17663196, 13222380, 11852430, 79240] },
    		 {id: 64,
    		  name: "Indonesia",
    		  lifeExpectancy: 71.72,
    		  demographics: [47977486, 46310084, 43068836, 41353654, 37293402, 28325635, 16650777, 7276648, 2369045],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Digestive diseases', 'Diabetes', 'Respiratory diseases', 'Tuberculosis', 'Liver diseases', 'Diarrheal diseases', 'Dementia', 'Lower respiratory infections', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [597995, 198835, 121488, 97005, 96316, 82219, 82145, 68636, 47869, 43764, 1418],
    		  diseaseNames: ['Cardiovascular diseases', 'Diarrhea & common infectious diseases', 'Diabetes, blood, & endocrine diseases', 'Cancers', 'Neonatal disorders', 'Musculoskeletal disorders', 'Digestive diseases', 'HIV/AIDS and tuberculosis', 'Respiratory diseases', 'Other NCDs', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [14436782, 6040809, 5756326, 5576287, 4267523, 4266640, 3709473, 3525877, 3510134, 3397022, 26400],
    		  riskFactors: ['High blood pressure', 'High blood sugar', 'Smoking', 'Obesity', 'Air pollution (outdoor & indoor)', 'High cholesterol', 'Diet low in fruits', 'Diet high in salt', 'Diet low in vegetables', 'Child wasting', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [10343485, 10011664, 6688501, 5556192, 4014640, 3476122, 3100077, 2859877, 2375858, 2098071, 26400] },
    		 {id: 65,
    		  name: "Iran",
    		  lifeExpectancy: 76.68,
    		  demographics: [14377200, 11531256, 12885389, 16623647, 11185873, 8029753, 5126544, 2239919, 914312],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Road injuries', 'Diabetes', 'Respiratory diseases', 'Kidney disease', 'Digestive diseases', 'Neonatal disorders', 'Lower respiratory infections', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [161330, 60600, 21435, 21124, 16033, 14948, 10163, 9907, 9553, 9315, 7508],
    		  diseaseNames: ['Cardiovascular diseases', 'Mental and substance use disorders', 'Musculoskeletal disorders', 'Neurological disorders', 'Cancers', 'Diabetes, blood, & endocrine diseases', 'Other NCDs', 'Neonatal disorders', 'Transport injuries', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [3176330, 1904817, 1783780, 1616255, 1592320, 1514747, 1355368, 1339143, 1271439, 924674, 136251],
    		  riskFactors: ['High blood pressure', 'High blood sugar', 'Obesity', 'Smoking', 'High cholesterol', 'Drug use', 'Air pollution (outdoor & indoor)', 'Low physical activity', 'Diet high in salt', 'Secondhand smoke', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [1878213, 1713915, 1700004, 1081718, 1077120, 991126, 795938, 360228, 282413, 272788, 136251] },
    		 {id: 66,
    		  name: "Iraq",
    		  lifeExpectancy: 70.6,
    		  demographics: [10485112, 8550850, 7013811, 5252557, 3814033, 2191874, 1261768, 552034, 187749],
    		  majorCauses: ['Cardiovascular diseases', 'Conflict', 'Cancers', 'Neonatal disorders', 'Terrorism', 'Kidney disease', 'Diabetes', 'Road injuries', 'Lower respiratory infections', 'Dementia', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [43072, 33240, 13780, 12278, 6476, 4706, 4281, 3773, 3628, 3600, 169],
    		  diseaseNames: ['Conflict and terrorism', 'Neonatal disorders', 'Cardiovascular diseases', 'Diabetes, blood, & endocrine diseases', 'Diarrhea & common infectious diseases', 'Other NCDs', 'Mental and substance use disorders', 'Unintentional injuries', 'Musculoskeletal disorders', 'Neurological disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [2065047, 1276888, 1114616, 980591, 977639, 881383, 669242, 592465, 587218, 499474, 3560],
    		  riskFactors: ['Obesity', 'High blood pressure', 'High blood sugar', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Smoking', 'Drug use', 'Diet low in fruits', 'Child wasting', 'Iron deficiency', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [728011, 713340, 686531, 653682, 367011, 365292, 285716, 232404, 175962, 155092, 3560] },
    		 {id: 67,
    		  name: "Ireland",
    		  lifeExpectancy: 82.3,
    		  demographics: [683362, 653400, 559110, 710607, 747666, 587995, 473864, 314560, 151934],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Respiratory diseases', 'COVID-19 until May 27, 2020', 'Lower respiratory infections', 'Digestive diseases', 'Kidney disease', 'Suicide', 'Diabetes', 'Liver diseases'],
    		  majorDeaths: [9681, 9581, 2698, 2226, 1615, 1372, 1145, 579, 453, 420, 393],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Neurological disorders', 'Respiratory diseases', 'Other NCDs', 'Diabetes, blood, & endocrine diseases', 'Unintentional injuries', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [189194, 145789, 126929, 99180, 95089, 61214, 54913, 51616, 50239, 32460, 23153],
    		  riskFactors: ['Smoking', 'High blood sugar', 'High blood pressure', 'Obesity', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'COVID-19 until May 27, 2020', 'Drug use', 'Diet low in fruits', 'Diet high in salt', 'Low physical activity'],
    		  riskDALYs: [132906, 99314, 90195, 83764, 45699, 24227, 23153, 22113, 15034, 14695, 13727] },
    		 {id: 68,
    		  name: "Israel",
    		  lifeExpectancy: 82.97,
    		  demographics: [1654530, 1377821, 1178880, 1117905, 1019070, 779142, 702437, 430872, 258715],
    		  majorCauses: ['Cancers', 'Cardiovascular diseases', 'Dementia', 'Lower respiratory infections', 'Kidney disease', 'Diabetes', 'Respiratory diseases', 'Digestive diseases', 'Liver diseases', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [12966, 11849, 4658, 2276, 2242, 2141, 1812, 1808, 707, 632, 281],
    		  diseaseNames: ['Cancers', 'Musculoskeletal disorders', 'Cardiovascular diseases', 'Neurological disorders', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Other NCDs', 'Unintentional injuries', 'Respiratory diseases', 'Neonatal disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [253956, 211092, 175059, 151116, 143230, 134764, 98294, 80106, 63869, 51274, 3978],
    		  riskFactors: ['High blood sugar', 'Smoking', 'Obesity', 'High blood pressure', 'Air pollution (outdoor & indoor)', 'High cholesterol', 'Drug use', 'Diet high in salt', 'Low physical activity', 'Diet low in fruits', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [167092, 158896, 121800, 113120, 52609, 45088, 19532, 17738, 16242, 14827, 3978] },
    		 {id: 69,
    		  name: "Italy",
    		  lifeExpectancy: 83.51,
    		  demographics: [5103576, 5740332, 6135226, 7100743, 9225165, 9453168, 7391126, 5935048, 4465708],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'COVID-19 until May 27, 2020', 'Respiratory diseases', 'Digestive diseases', 'Diabetes', 'Kidney disease', 'Lower respiratory infections', 'Liver diseases', 'Parkinson disease'],
    		  majorDeaths: [216585, 180577, 73339, 32955, 29044, 26403, 18551, 14292, 13167, 11695, 7557],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Unintentional injuries', 'Digestive diseases', 'Other NCDs', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [3227357, 2648270, 1971740, 1748118, 1191659, 1020109, 703647, 597865, 593953, 578073, 402295],
    		  riskFactors: ['Smoking', 'High blood sugar', 'High blood pressure', 'Obesity', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'COVID-19 until May 27, 2020', 'Drug use', 'Diet high in salt', 'Low physical activity', 'Diet low in fruits'],
    		  riskDALYs: [1879616, 1702367, 1518935, 1310480, 648326, 522561, 402295, 271922, 267823, 220006, 207156] },
    		 {id: 70,
    		  name: "Jamaica",
    		  lifeExpectancy: 74.47,
    		  demographics: [465506, 474181, 517860, 435865, 357187, 315232, 206614, 116152, 59679],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Diabetes', 'Dementia', 'Homicide', 'Kidney disease', 'Respiratory diseases', 'Digestive diseases', 'Lower respiratory infections', 'HIV/AIDS', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [6279, 3975, 2516, 1253, 887, 810, 695, 504, 503, 440, 9],
    		  diseaseNames: ['Cardiovascular diseases', 'Diabetes, blood, & endocrine diseases', 'Cancers', 'Neonatal disorders', 'Interpersonal violence', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Other NCDs', 'Diarrhea & common infectious diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [116834, 107775, 96171, 48412, 48126, 45159, 45023, 44712, 37202, 29423, 141],
    		  riskFactors: ['High blood sugar', 'Obesity', 'High blood pressure', 'Smoking', 'Air pollution (outdoor & indoor)', 'High cholesterol', 'Diet low in fruits', 'Diet low in vegetables', 'Iron deficiency', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [121104, 90114, 75774, 55231, 29649, 20221, 16755, 10866, 10335, 9483, 141] },
    		 {id: 71,
    		  name: "Japan",
    		  lifeExpectancy: 84.63,
    		  demographics: [10363426, 11337747, 12268082, 14762678, 18753747, 16223340, 16318424, 15814619, 11018236],
    		  majorCauses: ['Cancers', 'Cardiovascular diseases', 'Dementia', 'Lower respiratory infections', 'Digestive diseases', 'Respiratory diseases', 'Kidney disease', 'Suicide', 'Liver diseases', 'Parkinson disease', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [414698, 368091, 198556, 109534, 56334, 53739, 35709, 28819, 25352, 15613, 858],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Neurological disorders', 'Diabetes, blood, & endocrine diseases', 'Mental and substance use disorders', 'Unintentional injuries', 'Respiratory diseases', 'Other NCDs', 'Diarrhea & common infectious diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [6647076, 5124426, 4181686, 3088970, 2174030, 2146019, 2122420, 1348675, 1284802, 1131219, 10052],
    		  riskFactors: ['Smoking', 'High blood pressure', 'High blood sugar', 'Obesity', 'Diet high in salt', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Low physical activity', 'Drug use', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [4211397, 3003185, 2241447, 1385128, 1315624, 987828, 839089, 819971, 423681, 412535, 10052] },
    		 {id: 72,
    		  name: "Jordan",
    		  lifeExpectancy: 74.53,
    		  demographics: [2257019, 2159817, 1780641, 1468830, 1117097, 720652, 348029, 187481, 62131],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Neonatal disorders', 'Diabetes', 'Dementia', 'Kidney disease', 'Road injuries', 'Lower respiratory infections', 'Digestive diseases', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [9018, 4502, 2023, 1516, 1299, 1281, 1110, 1014, 822, 730, 9],
    		  diseaseNames: ['Neonatal disorders', 'Cardiovascular diseases', 'Other NCDs', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Cancers', 'Neurological disorders', 'Transport injuries', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [231744, 205154, 200157, 171916, 170292, 144906, 129454, 128076, 79489, 77320, 180],
    		  riskFactors: ['Obesity', 'High blood sugar', 'High blood pressure', 'Smoking', 'Drug use', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Iron deficiency', 'Secondhand smoke', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [186863, 157454, 137643, 109142, 70998, 70022, 67410, 40454, 32995, 28236, 180] },
    		 {id: 73,
    		  name: "Kazakhstan",
    		  lifeExpectancy: 73.6,
    		  demographics: [3854928, 2574607, 2706361, 2919045, 2254076, 2041467, 1366464, 538921, 295558],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Digestive diseases', 'Liver diseases', 'Respiratory diseases', 'Dementia', 'Suicide', 'Lower respiratory infections', 'Road injuries', 'Neonatal disorders', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [67339, 18400, 9115, 6849, 5615, 4481, 4263, 3624, 2767, 2047, 37],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Unintentional injuries', 'Digestive diseases', 'Other NCDs', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Neurological disorders', 'Neonatal disorders', 'Diabetes, blood, & endocrine diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1423967, 499547, 385355, 337080, 287137, 261389, 253852, 251712, 250447, 228854, 620],
    		  riskFactors: ['High blood pressure', 'Obesity', 'Smoking', 'High blood sugar', 'High cholesterol', 'Diet low in fruits', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Drug use', 'Secondhand smoke', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [790109, 644782, 598318, 495839, 469206, 263862, 212036, 208316, 129363, 105151, 620] },
    		 {id: 74,
    		  name: "Kenya",
    		  lifeExpectancy: 66.7,
    		  demographics: [13975897, 12493627, 9335457, 7280037, 4688651, 2676456, 1445979, 534812, 143051],
    		  majorCauses: ['HIV/AIDS', 'Cardiovascular diseases', 'Lower respiratory infections', 'Cancers', 'Diarrheal diseases', 'Digestive diseases', 'Neonatal disorders', 'Tuberculosis', 'Liver diseases', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [48502, 35993, 23268, 21373, 20835, 18893, 16978, 14881, 10398, 6871, 52],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'HIV/AIDS and tuberculosis', 'Neonatal disorders', 'Cardiovascular diseases', 'Other NCDs', 'Digestive diseases', 'Cancers', 'Mental and substance use disorders', 'Unintentional injuries', 'Neurological disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [4434222, 2835626, 1764456, 930002, 926142, 685728, 669334, 637402, 541192, 506020, 1221],
    		  riskFactors: ['Child wasting', 'Unsafe water source', 'Air pollution (outdoor & indoor)', 'Unsafe sanitation', 'High blood sugar', 'High blood pressure', 'Vitamin A deficiency', 'Obesity', 'Smoking', 'Child stunting', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [1098902, 1013002, 819127, 765692, 621159, 595363, 539569, 373205, 315363, 263262, 1221] },
    		 {id: 75,
    		  name: "Kiribati",
    		  lifeExpectancy: 68.37,
    		  demographics: [29279, 23045, 20596, 16281, 10981, 9781, 4873, 2205, 567],
    		  majorCauses: ['Cardiovascular diseases', 'Diabetes', 'Cancers', 'Respiratory diseases', 'Neonatal disorders', 'Tuberculosis', 'Digestive diseases', 'Lower respiratory infections', 'Diarrheal diseases', 'Suicide'],
    		  majorDeaths: [270, 121, 93, 63, 57, 54, 44, 41, 33, 30],
    		  diseaseNames: ['Cardiovascular diseases', 'Diabetes, blood, & endocrine diseases', 'Diarrhea & common infectious diseases', 'Neonatal disorders', 'Other NCDs', 'Cancers', 'Respiratory diseases', 'Nutritional deficiencies', 'Digestive diseases', 'Self-harm'],
    		  diseaseDALYs: [8817, 6413, 5760, 5386, 3723, 3039, 2700, 2106, 1748, 1689],
    		  riskFactors: ['High blood sugar', 'Obesity', 'Smoking', 'High blood pressure', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Child wasting', 'High cholesterol', 'Diet low in vegetables', 'Secondhand smoke'],
    		  riskDALYs: [9248, 7767, 6072, 4513, 3980, 2668, 2375, 2255, 1629, 1457] },
    		 {id: 76,
    		  name: "Kuwait",
    		  lifeExpectancy: 75.49,
    		  demographics: [615731, 509329, 462476, 916067, 936319, 514790, 197771, 44686, 9908],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Lower respiratory infections', 'Road injuries', 'Dementia', 'Digestive diseases', 'Diabetes', 'Kidney disease', 'Neonatal disorders', 'COVID-19 until May 27, 2020', 'Respiratory diseases'],
    		  majorDeaths: [3094, 1233, 573, 529, 324, 262, 217, 177, 173, 172, 166],
    		  diseaseNames: ['Cardiovascular diseases', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Other NCDs', 'Neurological disorders', 'Diabetes, blood, & endocrine diseases', 'Cancers', 'Transport injuries', 'Neonatal disorders', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [87091, 83602, 79495, 50897, 48788, 48403, 35261, 33603, 32252, 28823, 4153],
    		  riskFactors: ['Obesity', 'High blood sugar', 'High blood pressure', 'Smoking', 'High cholesterol', 'Drug use', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Secondhand smoke', 'Diet high in salt', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [83006, 51389, 51249, 42806, 39135, 35312, 31345, 16962, 10359, 9365, 4153] },
    		 {id: 77,
    		  name: "Kyrgyzstan",
    		  lifeExpectancy: 71.45,
    		  demographics: [1513166, 1067795, 1104469, 977554, 673651, 576005, 340820, 103872, 58519],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Digestive diseases', 'Liver diseases', 'Neonatal disorders', 'Respiratory diseases', 'Road injuries', 'Lower respiratory infections', 'Dementia', 'Suicide', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [16557, 3709, 2495, 2159, 1842, 1393, 884, 854, 824, 594, 16],
    		  diseaseNames: ['Cardiovascular diseases', 'Neonatal disorders', 'Diarrhea & common infectious diseases', 'Digestive diseases', 'Cancers', 'Other NCDs', 'Unintentional injuries', 'Neurological disorders', 'Mental and substance use disorders', 'Musculoskeletal disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [343877, 188505, 131432, 109728, 108236, 97255, 94677, 80365, 79860, 79635, 305],
    		  riskFactors: ['High blood pressure', 'High blood sugar', 'Obesity', 'Smoking', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Diet high in salt', 'Iron deficiency', 'Drug use', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [181555, 131066, 125338, 114377, 105735, 81421, 71032, 38858, 38235, 35181, 305] },
    		 {id: 78,
    		  name: "Laos",
    		  lifeExpectancy: 67.92,
    		  demographics: [1565148, 1456114, 1358326, 1054965, 749666, 509532, 304392, 130858, 40455],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Lower respiratory infections', 'Neonatal disorders', 'Respiratory diseases', 'Digestive diseases', 'Road injuries', 'Liver diseases', 'Diarrheal diseases', 'Tuberculosis', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [13145, 4735, 3756, 3542, 2605, 2540, 1690, 1595, 1582, 1551, 0],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Cardiovascular diseases', 'Neonatal disorders', 'Other NCDs', 'Cancers', 'Diabetes, blood, & endocrine diseases', 'Transport injuries', 'Respiratory diseases', 'Unintentional injuries', 'Musculoskeletal disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [580354, 342443, 337627, 192109, 144731, 136833, 112789, 104873, 103883, 97528, 0],
    		  riskFactors: ['Air pollution (outdoor & indoor)', 'High blood pressure', 'Child wasting', 'High blood sugar', 'Smoking', 'Obesity', 'Unsafe water source', 'High cholesterol', 'Secondhand smoke', 'Diet low in fruits', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [222829, 198600, 192745, 190221, 155967, 110542, 87473, 84290, 67491, 64915, 0] },
    		 {id: 79,
    		  name: "Latvia",
    		  lifeExpectancy: 75.29,
    		  demographics: [209188, 184856, 205890, 262698, 256776, 269669, 243007, 165298, 109358],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Digestive diseases', 'Suicide', 'Liver diseases', 'Respiratory diseases', 'Lower respiratory infections', 'Diabetes', 'Alcohol use disorders', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [15463, 5621, 1740, 998, 438, 434, 434, 379, 320, 294, 22],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Unintentional injuries', 'Musculoskeletal disorders', 'Neurological disorders', 'Diabetes, blood, & endocrine diseases', 'Digestive diseases', 'Mental and substance use disorders', 'Other NCDs', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [251875, 119164, 56908, 52574, 46943, 35877, 33911, 31469, 25380, 17912, 282],
    		  riskFactors: ['High blood pressure', 'Smoking', 'Obesity', 'High blood sugar', 'High cholesterol', 'Diet low in fruits', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Low physical activity', 'Diet low in vegetables', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [155232, 109735, 105412, 89377, 81725, 38011, 31230, 29007, 19450, 18458, 282] },
    		 {id: 80,
    		  name: "Lebanon",
    		  lifeExpectancy: 78.93,
    		  demographics: [1183784, 1159529, 1186188, 1009919, 862619, 713217, 433181, 202860, 104411],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Diabetes', 'Respiratory diseases', 'Digestive diseases', 'Lower respiratory infections', 'Kidney disease', 'Road injuries', 'Neonatal disorders', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [14094, 7703, 1866, 1614, 1175, 833, 739, 594, 562, 557, 26],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Mental and substance use disorders', 'Musculoskeletal disorders', 'Neurological disorders', 'Other NCDs', 'Diabetes, blood, & endocrine diseases', 'Neonatal disorders', 'Respiratory diseases', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [277882, 211228, 156612, 131367, 117713, 93176, 89925, 82542, 73834, 60861, 440],
    		  riskFactors: ['Obesity', 'High blood sugar', 'Smoking', 'High blood pressure', 'Drug use', 'Air pollution (outdoor & indoor)', 'High cholesterol', 'Secondhand smoke', 'Diet low in fruits', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [210233, 191855, 176671, 168709, 98764, 78426, 69882, 33327, 32854, 29616, 440] },
    		 {id: 81,
    		  name: "Lesotho",
    		  lifeExpectancy: 54.33,
    		  demographics: [476585, 430608, 395150, 322798, 202120, 139177, 94839, 47103, 16887],
    		  majorCauses: ['HIV/AIDS', 'Cardiovascular diseases', 'Tuberculosis', 'Cancers', 'Lower respiratory infections', 'Diarrheal diseases', 'Diabetes', 'Respiratory diseases', 'Neonatal disorders', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [6331, 4007, 1932, 1798, 1573, 1225, 1114, 1046, 866, 803, 0],
    		  diseaseNames: ['HIV/AIDS and tuberculosis', 'Diarrhea & common infectious diseases', 'Cardiovascular diseases', 'Neonatal disorders', 'Diabetes, blood, & endocrine diseases', 'Cancers', 'Transport injuries', 'Interpersonal violence', 'Respiratory diseases', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [699820, 221340, 98860, 82394, 66194, 53096, 49314, 47954, 41436, 36752, 0],
    		  riskFactors: ['High blood sugar', 'High blood pressure', 'Air pollution (outdoor & indoor)', 'Smoking', 'Unsafe water source', 'Obesity', 'Child wasting', 'Unsafe sanitation', 'Diet low in fruits', 'Vitamin A deficiency', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [90169, 65890, 64292, 61167, 60136, 57484, 50694, 45920, 26756, 19203, 0] },
    		 {id: 82,
    		  name: "Liberia",
    		  lifeExpectancy: 64.1,
    		  demographics: [1400348, 1148335, 813535, 616321, 428711, 274075, 161538, 74640, 19871],
    		  majorCauses: ['Cardiovascular diseases', 'Malaria', 'Diarrheal diseases', 'Neonatal disorders', 'Lower respiratory infections', 'Cancers', 'HIV/AIDS', 'Tuberculosis', 'Digestive diseases', 'Liver diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [4414, 2810, 2503, 2442, 2317, 2118, 1840, 1495, 1232, 733, 26],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Malaria & neglected tropical diseases', 'Neonatal disorders', 'HIV/AIDS and tuberculosis', 'Other NCDs', 'Cardiovascular diseases', 'Nutritional deficiencies', 'Diabetes, blood, & endocrine diseases', 'Cancers', 'Neurological disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [488681, 293930, 236278, 153800, 136832, 115273, 90505, 80720, 63432, 59778, 547],
    		  riskFactors: ['Child wasting', 'Unsafe water source', 'Air pollution (outdoor & indoor)', 'Unsafe sanitation', 'High blood pressure', 'Vitamin A deficiency', 'High blood sugar', 'Obesity', 'Iron deficiency', 'Child stunting', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [174555, 143231, 106021, 103123, 75963, 69593, 62246, 56236, 54699, 41929, 547] },
    		 {id: 83,
    		  name: "Libya",
    		  lifeExpectancy: 72.91,
    		  demographics: [1291223, 1165300, 1102957, 1165502, 1020549, 574557, 269932, 135923, 51510],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Road injuries', 'Conflict', 'Dementia', 'Diabetes', 'Respiratory diseases', 'Kidney disease', 'Digestive diseases', 'Lower respiratory infections', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [13334, 5586, 1701, 1525, 1508, 1405, 1205, 1181, 878, 842, 3],
    		  diseaseNames: ['Cardiovascular diseases', 'Transport injuries', 'Cancers', 'Conflict and terrorism', 'Musculoskeletal disorders', 'Diabetes, blood, & endocrine diseases', 'Mental and substance use disorders', 'Neurological disorders', 'Other NCDs', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [328433, 169622, 169432, 129405, 125922, 124647, 122767, 101482, 88270, 72970, 59],
    		  riskFactors: ['Obesity', 'High blood pressure', 'High blood sugar', 'Drug use', 'Air pollution (outdoor & indoor)', 'Smoking', 'High cholesterol', 'Diet low in fruits', 'Secondhand smoke', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [227177, 216077, 193983, 113035, 94613, 86942, 83501, 55052, 34933, 31056, 59] },
    		 {id: 84,
    		  name: "Lithuania",
    		  lifeExpectancy: 75.93,
    		  demographics: [296367, 248144, 341343, 336898, 366880, 428804, 342601, 228011, 170583],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Digestive diseases', 'Dementia', 'Suicide', 'Liver diseases', 'Respiratory diseases', 'Lower respiratory infections', 'Alcohol use disorders', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [22251, 8075, 2024, 1997, 1033, 942, 782, 704, 359, 325, 65],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Unintentional injuries', 'Musculoskeletal disorders', 'Digestive diseases', 'Neurological disorders', 'Mental and substance use disorders', 'Self-harm', 'Diabetes, blood, & endocrine diseases', 'Other NCDs', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [345229, 175044, 92378, 76396, 65565, 65345, 50956, 40077, 40052, 37358, 824],
    		  riskFactors: ['High blood pressure', 'Smoking', 'Obesity', 'High cholesterol', 'High blood sugar', 'Diet low in fruits', 'Diet high in salt', 'Air pollution (outdoor & indoor)', 'Low physical activity', 'Diet low in vegetables', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [228930, 150010, 137263, 122854, 106816, 46928, 43265, 41843, 30148, 28203, 824] },
    		 {id: 85,
    		  name: "Luxembourg",
    		  lifeExpectancy: 82.25,
    		  demographics: [65213, 66256, 84625, 95914, 93536, 88767, 60144, 36676, 24599],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Respiratory diseases', 'Digestive diseases', 'Lower respiratory infections', 'COVID-19 until May 27, 2020', 'Liver diseases', 'Kidney disease', 'Suicide', 'Diabetes'],
    		  majorDeaths: [1397, 1306, 440, 237, 227, 146, 110, 99, 85, 69, 64],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Unintentional injuries', 'Diabetes, blood, & endocrine diseases', 'Respiratory diseases', 'Other NCDs', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [25726, 20631, 17093, 13528, 11354, 7441, 7178, 6819, 5929, 5905, 1533],
    		  riskFactors: ['Smoking', 'High blood sugar', 'High blood pressure', 'Obesity', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Drug use', 'Diet high in salt', 'Low physical activity', 'COVID-19 until May 27, 2020', 'Diet low in vegetables'],
    		  riskDALYs: [16915, 13697, 12220, 12139, 4597, 3660, 2657, 2172, 1544, 1533, 1412] },
    		 {id: 86,
    		  name: "Macedonia",
    		  lifeExpectancy: 75.8,
    		  demographics: [228330, 236205, 290417, 326362, 297862, 282001, 240622, 129154, 52505],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Diabetes', 'Respiratory diseases', 'Digestive diseases', 'Kidney disease', 'Liver diseases', 'Suicide', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [10518, 4378, 848, 745, 534, 465, 309, 235, 191, 161, 116],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Diabetes, blood, & endocrine diseases', 'Unintentional injuries', 'Neurological disorders', 'Mental and substance use disorders', 'Other NCDs', 'Neonatal disorders', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [190895, 108056, 46978, 44928, 42217, 37051, 31369, 24413, 23155, 22465, 1757],
    		  riskFactors: ['High blood pressure', 'Smoking', 'High blood sugar', 'Obesity', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Diet low in fruits', 'Secondhand smoke', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [122094, 120255, 100479, 90355, 48532, 41927, 28845, 24530, 17622, 11510, 1757] },
    		 {id: 87,
    		  name: "Madagascar",
    		  lifeExpectancy: 67.04,
    		  demographics: [7613806, 6226365, 4738874, 3267437, 2307708, 1484094, 874455, 343514, 113053],
    		  majorCauses: ['Cardiovascular diseases', 'Diarrheal diseases', 'Lower respiratory infections', 'Neonatal disorders', 'Cancers', 'Nutritional deficiencies', 'Protein-energy malnutrition', 'Respiratory diseases', 'Digestive diseases', 'Malaria', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [34526, 23378, 19854, 17584, 11740, 11669, 11453, 6402, 6017, 5799, 2],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Neonatal disorders', 'Nutritional deficiencies', 'Cardiovascular diseases', 'Other NCDs', 'Other communicable diseases', 'Malaria & neglected tropical diseases', 'Cancers', 'Unintentional injuries', 'Mental and substance use disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [3237251, 1641588, 1063864, 999114, 725114, 604605, 488825, 407861, 343230, 335685, 42],
    		  riskFactors: ['Child wasting', 'Unsafe water source', 'Unsafe sanitation', 'Air pollution (outdoor & indoor)', 'High blood pressure', 'Vitamin A deficiency', 'Child stunting', 'High blood sugar', 'Non-exclusive breastfeeding', 'Diet low in fruits', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [2307218, 1393535, 1116685, 947467, 593032, 568745, 523072, 348713, 273471, 213170, 42] },
    		 {id: 88,
    		  name: "Malawi",
    		  lifeExpectancy: 64.26,
    		  demographics: [5597505, 4605388, 3277849, 2195464, 1381160, 811930, 465000, 236664, 57788],
    		  majorCauses: ['HIV/AIDS', 'Cardiovascular diseases', 'Neonatal disorders', 'Cancers', 'Lower respiratory infections', 'Tuberculosis', 'Diarrheal diseases', 'Malaria', 'Digestive diseases', 'Diabetes', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [21935, 15006, 11082, 10093, 9426, 7225, 7061, 6884, 5616, 2642, 4],
    		  diseaseNames: ['HIV/AIDS and tuberculosis', 'Diarrhea & common infectious diseases', 'Neonatal disorders', 'Malaria & neglected tropical diseases', 'Other NCDs', 'Cardiovascular diseases', 'Cancers', 'Nutritional deficiencies', 'Unintentional injuries', 'Diabetes, blood, & endocrine diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [2089369, 1833682, 1055239, 543959, 500729, 362649, 352625, 337524, 227082, 224552, 88],
    		  riskFactors: ['Child wasting', 'Air pollution (outdoor & indoor)', 'Unsafe water source', 'Unsafe sanitation', 'High blood pressure', 'High blood sugar', 'Vitamin A deficiency', 'Iron deficiency', 'Obesity', 'Smoking', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [451940, 381809, 343107, 264097, 259254, 251827, 190735, 145811, 121910, 107264, 88] },
    		 {id: 89,
    		  name: "Malaysia",
    		  lifeExpectancy: 76.16,
    		  demographics: [5098216, 5185143, 5784427, 5525337, 3884381, 3080289, 2069406, 965368, 357222],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Lower respiratory infections', 'Digestive diseases', 'Road injuries', 'Dementia', 'Respiratory diseases', 'Kidney disease', 'Liver diseases', 'Suicide', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [57288, 27057, 23692, 7061, 6946, 5887, 5770, 4731, 3082, 2281, 115],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Diabetes, blood, & endocrine diseases', 'Diarrhea & common infectious diseases', 'Mental and substance use disorders', 'Musculoskeletal disorders', 'Transport injuries', 'Other NCDs', 'Neurological disorders', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1352218, 699187, 489333, 485542, 473585, 444888, 418419, 359023, 356901, 242767, 2050],
    		  riskFactors: ['High blood pressure', 'Obesity', 'Smoking', 'High blood sugar', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Diet low in fruits', 'Diet low in vegetables', 'Secondhand smoke', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [906745, 677680, 648420, 597790, 488883, 311272, 290148, 231226, 192134, 155544, 2050] },
    		 {id: 90,
    		  name: "Maldives",
    		  lifeExpectancy: 78.92,
    		  demographics: [73852, 60061, 140970, 127233, 62492, 35683, 17665, 8722, 4278],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Respiratory diseases', 'Kidney disease', 'Dementia', 'Diabetes', 'Road injuries', 'Digestive diseases', 'Neonatal disorders', 'Lower respiratory infections', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [422, 163, 102, 68, 68, 36, 33, 31, 28, 28, 5],
    		  diseaseNames: ['Cardiovascular diseases', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Neurological disorders', 'Other NCDs', 'Cancers', 'Neonatal disorders', 'Respiratory diseases', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [9055, 6687, 6304, 5798, 4981, 4681, 4195, 3731, 3720, 2289, 103],
    		  riskFactors: ['High blood pressure', 'High blood sugar', 'Smoking', 'Obesity', 'High cholesterol', 'Diet high in salt', 'Air pollution (outdoor & indoor)', 'Iron deficiency', 'Secondhand smoke', 'Diet low in fruits', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [6038, 6025, 4954, 4660, 3006, 1777, 1700, 1432, 1253, 1218, 103] },
    		 {id: 91,
    		  name: "Mali",
    		  lifeExpectancy: 59.31,
    		  demographics: [6628593, 4826908, 3089563, 2106937, 1431058, 810331, 488133, 225734, 50765],
    		  majorCauses: ['Neonatal disorders', 'Malaria', 'Cardiovascular diseases', 'Diarrheal diseases', 'Lower respiratory infections', 'Cancers', 'Nutritional deficiencies', 'Protein-energy malnutrition', 'HIV/AIDS', 'Meningitis', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [26640, 25080, 18035, 15386, 11586, 10410, 6686, 6478, 5807, 5728, 70],
    		  diseaseNames: ['Neonatal disorders', 'Diarrhea & common infectious diseases', 'Malaria & neglected tropical diseases', 'Nutritional deficiencies', 'Other NCDs', 'Unintentional injuries', 'Cardiovascular diseases', 'Other communicable diseases', 'Cancers', 'HIV/AIDS and tuberculosis', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [2363306, 2339166, 2198476, 960655, 917119, 505199, 497276, 461405, 345514, 340900, 1574],
    		  riskFactors: ['Child wasting', 'Unsafe water source', 'Unsafe sanitation', 'Air pollution (outdoor & indoor)', 'Vitamin A deficiency', 'Iron deficiency', 'High blood pressure', 'High blood sugar', 'Child stunting', 'Non-exclusive breastfeeding', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [1632950, 852513, 654240, 636002, 421451, 335071, 240844, 216570, 200341, 175715, 1574] },
    		 {id: 92,
    		  name: "Malta",
    		  lifeExpectancy: 82.53,
    		  demographics: [42898, 41262, 56840, 65191, 58253, 54234, 57908, 43005, 20785],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Lower respiratory infections', 'Respiratory diseases', 'Digestive diseases', 'Diabetes', 'Kidney disease', 'Parkinson disease', 'Liver diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [1569, 1042, 331, 173, 172, 127, 117, 94, 54, 44, 6],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Unintentional injuries', 'Other NCDs', 'Respiratory diseases', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [22705, 20259, 14018, 9810, 8075, 6672, 5952, 5074, 4816, 3573, 79],
    		  riskFactors: ['High blood sugar', 'Smoking', 'High blood pressure', 'Obesity', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Low physical activity', 'Diet high in salt', 'Drug use', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [17301, 15351, 13755, 12623, 6457, 4612, 2916, 2501, 2303, 1637, 79] },
    		 {id: 93,
    		  name: "Mauritania",
    		  lifeExpectancy: 64.92,
    		  demographics: [1282240, 981572, 770505, 601045, 405733, 256724, 144249, 64944, 18685],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Neonatal disorders', 'Lower respiratory infections', 'Diarrheal diseases', 'Digestive diseases', 'Road injuries', 'Respiratory diseases', 'Dementia', 'Tuberculosis', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [3924, 2309, 1998, 1895, 1490, 900, 674, 600, 559, 542, 9],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Neonatal disorders', 'Cardiovascular diseases', 'Other NCDs', 'Nutritional deficiencies', 'Cancers', 'Diabetes, blood, & endocrine diseases', 'Neurological disorders', 'Mental and substance use disorders', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [254069, 196903, 90510, 73989, 65102, 62379, 61153, 50133, 45926, 43310, 191],
    		  riskFactors: ['Child wasting', 'Unsafe water source', 'Air pollution (outdoor & indoor)', 'High blood pressure', 'Unsafe sanitation', 'High blood sugar', 'Obesity', 'Iron deficiency', 'Vitamin A deficiency', 'Diet low in fruits', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [110162, 75285, 63864, 58706, 57685, 53308, 49965, 35213, 28530, 21226, 191] },
    		 {id: 94,
    		  name: "Mauritius",
    		  lifeExpectancy: 74.99,
    		  demographics: [135453, 179059, 197068, 175844, 179920, 176623, 134345, 64819, 26539],
    		  majorCauses: ['Cardiovascular diseases', 'Diabetes', 'Cancers', 'Kidney disease', 'Respiratory diseases', 'Dementia', 'Digestive diseases', 'Lower respiratory infections', 'Liver diseases', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [3310, 1729, 1394, 1070, 498, 454, 364, 307, 238, 165, 10],
    		  diseaseNames: ['Diabetes, blood, & endocrine diseases', 'Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Neurological disorders', 'Respiratory diseases', 'Other NCDs', 'Digestive diseases', 'Neonatal disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [79944, 70327, 35256, 26345, 20285, 20158, 16221, 15583, 12012, 11526, 158],
    		  riskFactors: ['High blood sugar', 'Obesity', 'High blood pressure', 'Smoking', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Diet low in fruits', 'Secondhand smoke', 'Diet low in vegetables', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [102301, 63996, 57090, 32659, 22601, 21407, 18203, 17779, 11031, 8333, 158] },
    		 {id: 95,
    		  name: "Mexico",
    		  lifeExpectancy: 75.05,
    		  demographics: [22245383, 22356958, 21623928, 18636625, 16343173, 12397493, 7946332, 4023962, 2001674],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Kidney disease', 'Diabetes', 'Digestive diseases', 'Homicide', 'Liver diseases', 'Respiratory diseases', 'Dementia', 'Lower respiratory infections', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [161783, 97282, 65033, 64067, 62517, 43160, 40509, 34316, 32865, 21838, 8134],
    		  diseaseNames: ['Diabetes, blood, & endocrine diseases', 'Cardiovascular diseases', 'Cancers', 'Other NCDs', 'Digestive diseases', 'Neurological disorders', 'Mental and substance use disorders', 'Neonatal disorders', 'Interpersonal violence', 'Musculoskeletal disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [4498557, 3180705, 2495963, 1967719, 1871651, 1793491, 1775959, 1617529, 1585274, 1544903, 135796],
    		  riskFactors: ['High blood sugar', 'Obesity', 'High blood pressure', 'Air pollution (outdoor & indoor)', 'Smoking', 'High cholesterol', 'Drug use', 'Diet low in fruits', 'Diet low in vegetables', 'Child wasting', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [4873713, 3759331, 2371373, 1354813, 1278981, 923310, 644737, 513416, 413363, 360087, 135796] },
    		 {id: 96,
    		  name: "Moldova",
    		  lifeExpectancy: 71.9,
    		  demographics: [429166, 418687, 608197, 760165, 548003, 534327, 475100, 177807, 91806],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Digestive diseases', 'Liver diseases', 'Dementia', 'Lower respiratory infections', 'Respiratory diseases', 'Suicide', 'Alcohol use disorders', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [23194, 6307, 3863, 3094, 1340, 949, 916, 650, 485, 442, 267],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Digestive diseases', 'Unintentional injuries', 'Liver diseases', 'Musculoskeletal disorders', 'Neurological disorders', 'Other NCDs', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [426732, 173334, 133420, 101346, 92512, 83133, 65702, 59834, 58427, 56486, 4246],
    		  riskFactors: ['High blood pressure', 'Smoking', 'Obesity', 'High blood sugar', 'High cholesterol', 'Diet low in fruits', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Diet low in vegetables', 'Drug use', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [297875, 188075, 179833, 147746, 135227, 77300, 69090, 40474, 39500, 29548, 4246] },
    		 {id: 97,
    		  name: "Mongolia",
    		  lifeExpectancy: 69.87,
    		  demographics: [727414, 480990, 518734, 551697, 414977, 305432, 147247, 58191, 20484],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Digestive diseases', 'Liver diseases', 'Neonatal disorders', 'Lower respiratory infections', 'Road injuries', 'Suicide', 'Alcohol use disorders', 'Tuberculosis', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [7770, 4811, 1835, 1374, 941, 660, 546, 525, 487, 367, 0],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Neonatal disorders', 'Unintentional injuries', 'Digestive diseases', 'Diarrhea & common infectious diseases', 'Other NCDs', 'Mental and substance use disorders', 'Liver diseases', 'Musculoskeletal disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [198831, 129353, 97033, 84895, 66416, 57022, 55155, 44909, 43044, 41857, 0],
    		  riskFactors: ['High blood pressure', 'Obesity', 'Smoking', 'High blood sugar', 'Air pollution (outdoor & indoor)', 'High cholesterol', 'Diet low in fruits', 'Diet low in vegetables', 'Diet high in salt', 'Drug use', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [132567, 95931, 89189, 66733, 60963, 54502, 54205, 32968, 30890, 17372, 0] },
    		 {id: 98,
    		  name: "Montenegro",
    		  lifeExpectancy: 76.88,
    		  demographics: [74487, 78919, 84827, 88916, 82984, 81320, 75907, 38922, 21706],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Diabetes', 'Digestive diseases', 'Kidney disease', 'Respiratory diseases', 'Suicide', 'Lower respiratory infections', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [3737, 1401, 354, 162, 156, 127, 86, 77, 68, 57, 9],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Unintentional injuries', 'Neurological disorders', 'Diabetes, blood, & endocrine diseases', 'Mental and substance use disorders', 'Digestive diseases', 'Other NCDs', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [62760, 31982, 14414, 13327, 11507, 10931, 9243, 6119, 6077, 4768, 128],
    		  riskFactors: ['Smoking', 'High blood pressure', 'High blood sugar', 'Obesity', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Secondhand smoke', 'Diet low in fruits', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [44250, 38418, 31099, 25922, 13968, 11166, 8611, 5067, 3646, 2982, 128] },
    		 {id: 99,
    		  name: "Morocco",
    		  lifeExpectancy: 76.68,
    		  demographics: [6750500, 6039210, 5923781, 5535929, 4352251, 3698794, 2589647, 1147171, 434483],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Diabetes', 'Respiratory diseases', 'Road injuries', 'Digestive diseases', 'Lower respiratory infections', 'Neonatal disorders', 'Tuberculosis', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [115124, 24505, 9343, 8062, 7680, 7264, 5932, 5846, 5596, 4883, 202],
    		  diseaseNames: ['Cardiovascular diseases', 'Diabetes, blood, & endocrine diseases', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Other NCDs', 'Cancers', 'Neonatal disorders', 'Neurological disorders', 'Transport injuries', 'Diarrhea & common infectious diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [2424457, 822462, 762679, 753673, 718496, 694746, 650262, 533369, 427572, 422025, 3522],
    		  riskFactors: ['High blood pressure', 'High blood sugar', 'Obesity', 'Smoking', 'Air pollution (outdoor & indoor)', 'High cholesterol', 'Drug use', 'Diet low in fruits', 'Low physical activity', 'Secondhand smoke', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [1611294, 1230615, 1207573, 567167, 556488, 542224, 288828, 236464, 232814, 201191, 3522] },
    		 {id: 100,
    		  name: "Mozambique",
    		  lifeExpectancy: 60.85,
    		  demographics: [9513591, 7385303, 5101440, 3473273, 2201317, 1354583, 822822, 408321, 105393],
    		  majorCauses: ['HIV/AIDS', 'Cardiovascular diseases', 'Neonatal disorders', 'Tuberculosis', 'Malaria', 'Cancers', 'Lower respiratory infections', 'Diarrheal diseases', 'Digestive diseases', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [62135, 29833, 19375, 19234, 18423, 15826, 13895, 10689, 7118, 5078, 1],
    		  diseaseNames: ['HIV/AIDS and tuberculosis', 'Diarrhea & common infectious diseases', 'Neonatal disorders', 'Malaria & neglected tropical diseases', 'Other NCDs', 'Cardiovascular diseases', 'Cancers', 'Nutritional deficiencies', 'Unintentional injuries', 'Other communicable diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [4502707, 2510552, 1803582, 1444655, 942494, 816402, 533977, 526835, 446614, 439306, 21],
    		  riskFactors: ['Child wasting', 'Air pollution (outdoor & indoor)', 'High blood pressure', 'Unsafe water source', 'High blood sugar', 'Unsafe sanitation', 'Smoking', 'Vitamin A deficiency', 'Iron deficiency', 'Obesity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [645149, 639320, 587290, 562820, 476274, 431306, 322649, 292189, 289796, 232296, 21] },
    		 {id: 101,
    		  name: "Myanmar",
    		  lifeExpectancy: 67.13,
    		  demographics: [9083867, 9994005, 9099437, 8049551, 7142439, 5431377, 3466856, 1354931, 422959],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Respiratory diseases', 'Digestive diseases', 'Diabetes', 'Liver diseases', 'Lower respiratory infections', 'Dementia', 'Tuberculosis', 'Neonatal disorders', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [77463, 60066, 55535, 28411, 27217, 23171, 22582, 14445, 13540, 13244, 6],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Diarrhea & common infectious diseases', 'Respiratory diseases', 'Neonatal disorders', 'Other NCDs', 'Diabetes, blood, & endocrine diseases', 'Digestive diseases', 'Unintentional injuries', 'Liver diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1819145, 1696478, 1482854, 1458830, 1337542, 1201088, 1073858, 1048747, 837214, 815314, 114],
    		  riskFactors: ['High blood sugar', 'Smoking', 'Air pollution (outdoor & indoor)', 'High blood pressure', 'Obesity', 'Child wasting', 'Diet low in fruits', 'Secondhand smoke', 'Diet high in salt', 'High cholesterol', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [1926019, 1681663, 1423169, 1219220, 753714, 522751, 500424, 376337, 349445, 347466, 114] },
    		 {id: 102,
    		  name: "Namibia",
    		  lifeExpectancy: 63.71,
    		  demographics: [647177, 516584, 469261, 345891, 230228, 146063, 83896, 40705, 14719],
    		  majorCauses: ['HIV/AIDS', 'Cardiovascular diseases', 'Cancers', 'Lower respiratory infections', 'Tuberculosis', 'Neonatal disorders', 'Diarrheal diseases', 'Respiratory diseases', 'Digestive diseases', 'Diabetes', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [3960, 3003, 1554, 1148, 869, 830, 813, 652, 595, 546, 0],
    		  diseaseNames: ['HIV/AIDS and tuberculosis', 'Diarrhea & common infectious diseases', 'Neonatal disorders', 'Cardiovascular diseases', 'Diabetes, blood, & endocrine diseases', 'Cancers', 'Mental and substance use disorders', 'Respiratory diseases', 'Transport injuries', 'Other NCDs', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [288137, 136433, 77834, 60792, 43694, 43575, 32037, 27889, 27786, 27353, 0],
    		  riskFactors: ['High blood sugar', 'Child wasting', 'High blood pressure', 'Unsafe water source', 'Air pollution (outdoor & indoor)', 'Obesity', 'Smoking', 'Unsafe sanitation', 'Diet low in fruits', 'Drug use', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [49467, 46679, 39352, 37616, 35866, 34031, 29709, 26189, 13623, 13050, 0] },
    		 {id: 103,
    		  name: "Nepal",
    		  lifeExpectancy: 70.78,
    		  demographics: [5479855, 6205791, 5664808, 3628380, 2958204, 2219564, 1443408, 791816, 216888],
    		  majorCauses: ['Cardiovascular diseases', 'Respiratory diseases', 'Cancers', 'Diarrheal diseases', 'Digestive diseases', 'Lower respiratory infections', 'Neonatal disorders', 'Road injuries', 'Liver diseases', 'Diabetes', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [49248, 23583, 18315, 10796, 9756, 9297, 8577, 6787, 5671, 5248, 4],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Cardiovascular diseases', 'Neonatal disorders', 'Respiratory diseases', 'Musculoskeletal disorders', 'Cancers', 'Diabetes, blood, & endocrine diseases', 'Mental and substance use disorders', 'Neurological disorders', 'Transport injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1237825, 1131125, 930734, 657083, 546530, 492945, 492677, 450672, 440915, 371137, 74],
    		  riskFactors: ['Air pollution (outdoor & indoor)', 'High blood pressure', 'Smoking', 'High blood sugar', 'High cholesterol', 'Obesity', 'Unsafe water source', 'Child wasting', 'Diet low in fruits', 'Iron deficiency', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [783254, 589863, 585357, 475856, 323761, 308529, 253407, 217534, 215390, 157424, 74] },
    		 {id: 104,
    		  name: "Netherlands",
    		  lifeExpectancy: 82.28,
    		  demographics: [1762690, 1973468, 2106722, 2075858, 2201959, 2520370, 2109482, 1526904, 819669],
    		  majorCauses: ['Cancers', 'Cardiovascular diseases', 'Dementia', 'Respiratory diseases', 'Lower respiratory infections', 'COVID-19 until May 27, 2020', 'Digestive diseases', 'Diabetes', 'Kidney disease', 'Suicide', 'Parkinson disease'],
    		  majorDeaths: [51854, 40564, 14836, 10109, 6178, 5856, 5649, 2729, 2683, 2066, 1792],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Respiratory diseases', 'Diabetes, blood, & endocrine diseases', 'Other NCDs', 'Unintentional injuries', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [987417, 581670, 576427, 405596, 365519, 255064, 246098, 201647, 181251, 123640, 77616],
    		  riskFactors: ['Smoking', 'High blood sugar', 'High blood pressure', 'Obesity', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'COVID-19 until May 27, 2020', 'Diet low in fruits', 'Diet low in vegetables', 'Secondhand smoke', 'Diet high in salt'],
    		  riskDALYs: [694184, 425666, 349213, 329885, 146262, 137009, 77616, 66875, 48295, 45238, 45173] },
    		 {id: 105,
    		  name: "New Zealand",
    		  lifeExpectancy: 82.29,
    		  demographics: [618147, 620994, 673857, 604748, 598468, 627307, 511426, 346232, 181883],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Respiratory diseases', 'Digestive diseases', 'Kidney disease', 'Lower respiratory infections', 'Diabetes', 'Suicide', 'Parkinson disease', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [10898, 9838, 2975, 2143, 1000, 773, 728, 556, 537, 377, 21],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Unintentional injuries', 'Neurological disorders', 'Respiratory diseases', 'Diabetes, blood, & endocrine diseases', 'Other NCDs', 'Transport injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [196818, 157168, 133048, 98229, 96355, 81421, 57606, 52563, 48073, 35614, 289],
    		  riskFactors: ['Smoking', 'Obesity', 'High blood pressure', 'High blood sugar', 'High cholesterol', 'Drug use', 'Diet low in fruits', 'Diet high in salt', 'Low physical activity', 'Air pollution (outdoor & indoor)', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [106064, 93286, 82829, 71540, 40974, 18972, 17437, 17432, 15989, 13982, 289] },
    		 {id: 106,
    		  name: "Nicaragua",
    		  lifeExpectancy: 74.48,
    		  demographics: [1320595, 1235318, 1169503, 1039838, 735256, 494391, 331884, 144862, 73855],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Kidney disease', 'Digestive diseases', 'Diabetes', 'Dementia', 'Liver diseases', 'Respiratory diseases', 'Lower respiratory infections', 'Neonatal disorders', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [6033, 3289, 2292, 1579, 1231, 1173, 1127, 877, 849, 848, 35],
    		  diseaseNames: ['Diabetes, blood, & endocrine diseases', 'Cardiovascular diseases', 'Neonatal disorders', 'Cancers', 'Other NCDs', 'Mental and substance use disorders', 'Diarrhea & common infectious diseases', 'Neurological disorders', 'Musculoskeletal disorders', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [137933, 118992, 110320, 89278, 87937, 85514, 76249, 75694, 75208, 59384, 630],
    		  riskFactors: ['High blood sugar', 'High blood pressure', 'Obesity', 'Air pollution (outdoor & indoor)', 'Smoking', 'High cholesterol', 'Diet low in fruits', 'Drug use', 'Child wasting', 'Diet low in vegetables', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [124835, 104480, 103370, 50125, 42168, 32233, 25596, 24331, 20732, 19942, 630] },
    		 {id: 107,
    		  name: "Niger",
    		  lifeExpectancy: 62.42,
    		  demographics: [8480646, 5660343, 3546877, 2165158, 1479270, 1019589, 621905, 282848, 54083],
    		  majorCauses: ['Malaria', 'Diarrheal diseases', 'Lower respiratory infections', 'Neonatal disorders', 'Cardiovascular diseases', 'Cancers', 'Meningitis', 'Tuberculosis', 'Digestive diseases', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [30485, 21955, 19710, 16202, 13967, 8177, 7815, 5809, 4412, 3053, 63],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Malaria & neglected tropical diseases', 'Neonatal disorders', 'Other NCDs', 'Nutritional deficiencies', 'Unintentional injuries', 'Cardiovascular diseases', 'HIV/AIDS and tuberculosis', 'Diabetes, blood, & endocrine diseases', 'Cancers', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [3596300, 2479474, 1471369, 640298, 508046, 424815, 402079, 394453, 357992, 262404, 1392],
    		  riskFactors: ['Child wasting', 'Unsafe water source', 'Unsafe sanitation', 'Air pollution (outdoor & indoor)', 'Vitamin A deficiency', 'Child stunting', 'Non-exclusive breastfeeding', 'Iron deficiency', 'High blood pressure', 'High blood sugar', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [2391690, 1451900, 1142631, 955333, 727289, 600184, 312924, 235597, 219262, 186065, 1392] },
    		 {id: 108,
    		  name: "Nigeria",
    		  lifeExpectancy: 54.69,
    		  demographics: [62691322, 46319357, 32244205, 23840172, 16454206, 10366004, 6059156, 2555573, 433608],
    		  majorCauses: ['Lower respiratory infections', 'Neonatal disorders', 'HIV/AIDS', 'Malaria', 'Diarrheal diseases', 'Cardiovascular diseases', 'Cancers', 'Digestive diseases', 'Tuberculosis', 'Meningitis', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [189930, 180355, 169103, 152240, 138359, 122519, 96555, 71076, 57219, 52948, 249],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Neonatal disorders', 'Malaria & neglected tropical diseases', 'HIV/AIDS and tuberculosis', 'Other NCDs', 'Nutritional deficiencies', 'Unintentional injuries', 'Cancers', 'Cardiovascular diseases', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [22428208, 16451503, 13621942, 8918085, 5304259, 5011258, 3191644, 3107214, 3006460, 2963064, 5630],
    		  riskFactors: ['Child wasting', 'Unsafe water source', 'Air pollution (outdoor & indoor)', 'Unsafe sanitation', 'Child stunting', 'Vitamin A deficiency', 'Non-exclusive breastfeeding', 'Iron deficiency', 'High blood pressure', 'High blood sugar', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [17020469, 8920346, 7708156, 5675060, 4489373, 4065618, 2815935, 2442647, 1834799, 1307256, 5630] },
    		 {id: 109,
    		  name: "North Korea",
    		  lifeExpectancy: 72.27,
    		  demographics: [3415644, 3619103, 3930083, 3583278, 3864207, 3498467, 2008869, 1321013, 425493],
    		  majorCauses: ['Cardiovascular diseases', 'Respiratory diseases', 'Cancers', 'Digestive diseases', 'Dementia', 'Road injuries', 'Lower respiratory infections', 'Liver diseases', 'Kidney disease', 'Suicide'],
    		  majorDeaths: [90238, 44378, 41553, 8515, 7394, 5744, 5689, 4657, 3639, 3309],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Respiratory diseases', 'Musculoskeletal disorders', 'Diarrhea & common infectious diseases', 'Diabetes, blood, & endocrine diseases', 'Unintentional injuries', 'Mental and substance use disorders', 'Transport injuries', 'Other NCDs'],
    		  diseaseDALYs: [1972988, 1136274, 1044331, 469098, 446368, 429775, 384677, 369114, 349473, 338617],
    		  riskFactors: ['High blood pressure', 'Smoking', 'Air pollution (outdoor & indoor)', 'High blood sugar', 'Diet low in fruits', 'Diet high in salt', 'High cholesterol', 'Secondhand smoke', 'Obesity', 'Drug use'],
    		  riskDALYs: [1163781, 976860, 936794, 613016, 457399, 425374, 368085, 261550, 242889, 149500] },
    		 {id: 110,
    		  name: "Norway",
    		  lifeExpectancy: 82.4,
    		  demographics: [616243, 643048, 724428, 727725, 730800, 701457, 581791, 427144, 226223],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Respiratory diseases', 'Lower respiratory infections', 'Digestive diseases', 'Diabetes', 'Kidney disease', 'Suicide', 'Parkinson disease', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [12886, 11611, 4465, 2639, 1840, 1388, 591, 590, 583, 465, 235],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Unintentional injuries', 'Respiratory diseases', 'Diabetes, blood, & endocrine diseases', 'Other NCDs', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [221284, 172270, 155719, 121986, 107914, 76659, 67981, 64332, 62429, 36676, 3177],
    		  riskFactors: ['Smoking', 'High blood sugar', 'High blood pressure', 'Obesity', 'High cholesterol', 'Drug use', 'Air pollution (outdoor & indoor)', 'Low physical activity', 'Diet low in vegetables', 'Diet high in salt', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [141475, 111526, 100285, 89227, 52550, 24230, 22253, 17531, 16074, 15654, 3177] },
    		 {id: 111,
    		  name: "Oman",
    		  lifeExpectancy: 77.86,
    		  demographics: [819521, 514291, 1121755, 1363532, 647718, 301482, 134169, 51814, 20710],
    		  majorCauses: ['Cardiovascular diseases', 'Road injuries', 'Cancers', 'Diabetes', 'Lower respiratory infections', 'Dementia', 'Neonatal disorders', 'Kidney disease', 'Digestive diseases', 'Liver diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [4128, 1950, 1277, 538, 404, 403, 397, 253, 246, 176, 37],
    		  diseaseNames: ['Cardiovascular diseases', 'Transport injuries', 'Diabetes, blood, & endocrine diseases', 'Mental and substance use disorders', 'Musculoskeletal disorders', 'Neurological disorders', 'Neonatal disorders', 'Other NCDs', 'Cancers', 'Diarrhea & common infectious diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [117912, 110700, 88899, 79017, 78480, 54880, 53231, 50870, 41049, 33166, 887],
    		  riskFactors: ['Obesity', 'High blood pressure', 'High blood sugar', 'High cholesterol', 'Drug use', 'Smoking', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Diet low in vegetables', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [87985, 77564, 73162, 48535, 46122, 34355, 33033, 11511, 10596, 10342, 887] },
    		 {id: 112,
    		  name: "Pakistan",
    		  lifeExpectancy: 67.27,
    		  demographics: [52774521, 44914765, 39377474, 29843795, 20586127, 14690100, 8500213, 4464790, 1413532],
    		  majorCauses: ['Cardiovascular diseases', 'Neonatal disorders', 'Cancers', 'Digestive diseases', 'Respiratory diseases', 'Diarrheal diseases', 'Lower respiratory infections', 'Road injuries', 'Liver diseases', 'Tuberculosis', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [381421, 185098, 170987, 72647, 69969, 59787, 59440, 53009, 45501, 44150, 1225],
    		  diseaseNames: ['Neonatal disorders', 'Diarrhea & common infectious diseases', 'Cardiovascular diseases', 'Cancers', 'Other NCDs', 'Diabetes, blood, & endocrine diseases', 'Transport injuries', 'Digestive diseases', 'Unintentional injuries', 'Mental and substance use disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [17719118, 9720916, 9486921, 5811824, 4382185, 3758170, 3457346, 3027349, 2997880, 2860291, 23742],
    		  riskFactors: ['High blood pressure', 'Air pollution (outdoor & indoor)', 'Child wasting', 'High blood sugar', 'Smoking', 'Obesity', 'Unsafe water source', 'High cholesterol', 'Diet low in fruits', 'Iron deficiency', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [5532401, 4903301, 4539357, 4506942, 3688735, 3414335, 3335793, 2999458, 2206292, 1817366, 23742] },
    		 {id: 113,
    		  name: "Palestine",
    		  lifeExpectancy: 74.05,
    		  demographics: [1349183, 1088552, 950260, 636206, 432598, 283953, 144571, 74627, 21472],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Neonatal disorders', 'Diabetes', 'Dementia', 'Kidney disease', 'Lower respiratory infections', 'Respiratory diseases', 'Digestive diseases', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [5327, 2265, 1014, 763, 690, 624, 515, 411, 371, 355, 5],
    		  diseaseNames: ['Cardiovascular diseases', 'Neonatal disorders', 'Diabetes, blood, & endocrine diseases', 'Mental and substance use disorders', 'Other NCDs', 'Cancers', 'Musculoskeletal disorders', 'Diarrhea & common infectious diseases', 'Neurological disorders', 'Conflict and terrorism', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [120854, 111822, 93873, 85527, 78395, 66839, 65093, 63404, 59321, 38914, 105],
    		  riskFactors: ['High blood sugar', 'Obesity', 'High blood pressure', 'High cholesterol', 'Smoking', 'Air pollution (outdoor & indoor)', 'Drug use', 'Diet low in fruits', 'Diet low in vegetables', 'Iron deficiency', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [86431, 77642, 68379, 65832, 35706, 33555, 28138, 23336, 13917, 13248, 105] },
    		 {id: 114,
    		  name: "Panama",
    		  lifeExpectancy: 78.51,
    		  demographics: [771035, 720783, 669917, 611062, 547002, 420154, 271162, 151433, 83892],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Diabetes', 'Kidney disease', 'Lower respiratory infections', 'Digestive diseases', 'Respiratory diseases', 'Homicide', 'HIV/AIDS', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [5246, 3519, 1291, 1068, 951, 897, 825, 767, 640, 526, 313],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Diabetes, blood, & endocrine diseases', 'Other NCDs', 'Mental and substance use disorders', 'Neurological disorders', 'Musculoskeletal disorders', 'Neonatal disorders', 'Diarrhea & common infectious diseases', 'Interpersonal violence', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [96163, 84501, 76588, 58716, 53776, 52367, 51530, 51264, 51169, 36729, 4949],
    		  riskFactors: ['High blood sugar', 'Obesity', 'High blood pressure', 'Smoking', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Child wasting', 'Diet low in fruits', 'Diet low in vegetables', 'Drug use', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [69997, 63877, 61938, 37342, 24272, 23091, 16591, 13138, 12850, 12570, 4949] },
    		 {id: 115,
    		  name: "Paraguay",
    		  lifeExpectancy: 74.25,
    		  demographics: [1381066, 1337773, 1316292, 1082701, 703289, 541135, 391066, 203938, 87379],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Diabetes', 'Kidney disease', 'Dementia', 'Digestive diseases', 'Road injuries', 'Lower respiratory infections', 'Respiratory diseases', 'Homicide', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [9835, 5649, 2188, 1602, 1557, 1516, 1491, 1361, 1075, 845, 11],
    		  diseaseNames: ['Cardiovascular diseases', 'Diabetes, blood, & endocrine diseases', 'Cancers', 'Mental and substance use disorders', 'Musculoskeletal disorders', 'Neurological disorders', 'Diarrhea & common infectious diseases', 'Other NCDs', 'Transport injuries', 'Neonatal disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [200872, 144522, 142533, 117408, 108992, 98834, 89711, 88327, 81498, 61604, 189],
    		  riskFactors: ['High blood sugar', 'Obesity', 'High blood pressure', 'Smoking', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Diet low in vegetables', 'Iron deficiency', 'Diet high in salt', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [158929, 137710, 133881, 107531, 57416, 57294, 34245, 27128, 26824, 22666, 189] },
    		 {id: 116,
    		  name: "Peru",
    		  lifeExpectancy: 76.74,
    		  demographics: [5489704, 5224879, 5423768, 5068397, 4191544, 3185093, 2171756, 1190014, 565307],
    		  majorCauses: ['Cancers', 'Cardiovascular diseases', 'Lower respiratory infections', 'Dementia', 'Digestive diseases', 'Respiratory diseases', 'Liver diseases', 'Kidney disease', 'Road injuries', 'Diabetes', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [28513, 27720, 16638, 10195, 9227, 7492, 5562, 5287, 4577, 4300, 3788],
    		  diseaseNames: ['Cancers', 'Diarrhea & common infectious diseases', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Neonatal disorders', 'Mental and substance use disorders', 'Other NCDs', 'Unintentional injuries', 'Diabetes, blood, & endocrine diseases', 'Neurological disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [677852, 608338, 554569, 481426, 479788, 470720, 444089, 407091, 402992, 401858, 61540],
    		  riskFactors: ['Obesity', 'High blood sugar', 'High blood pressure', 'Air pollution (outdoor & indoor)', 'Smoking', 'High cholesterol', 'Iron deficiency', 'Child wasting', 'Drug use', 'Diet low in fruits', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [397073, 335162, 297615, 264551, 186595, 130609, 107063, 104592, 94360, 72302, 61540] },
    		 {id: 117,
    		  name: "Philippines",
    		  lifeExpectancy: 71.23,
    		  demographics: [22137588, 21224868, 19346448, 15169948, 12087102, 9132653, 5640281, 2495455, 882279],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Lower respiratory infections', 'Kidney disease', 'Respiratory diseases', 'Tuberculosis', 'Digestive diseases', 'Diabetes', 'Neonatal disorders', 'Homicide', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [217552, 79280, 68013, 34051, 33061, 29322, 26513, 26049, 24722, 15891, 886],
    		  diseaseNames: ['Cardiovascular diseases', 'Diarrhea & common infectious diseases', 'Neonatal disorders', 'Cancers', 'Diabetes, blood, & endocrine diseases', 'Other NCDs', 'Musculoskeletal disorders', 'Respiratory diseases', 'Mental and substance use disorders', 'HIV/AIDS and tuberculosis', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [5629957, 3099601, 2529191, 2433421, 2353436, 1866603, 1757721, 1660479, 1272495, 1191208, 16673],
    		  riskFactors: ['High blood sugar', 'High blood pressure', 'Smoking', 'Obesity', 'Air pollution (outdoor & indoor)', 'High cholesterol', 'Child wasting', 'Diet high in salt', 'Secondhand smoke', 'Diet low in vegetables', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [3746813, 3404482, 2967393, 2483498, 2200537, 1467962, 1124433, 946863, 775342, 750053, 16673] },
    		 {id: 118,
    		  name: "Poland",
    		  lifeExpectancy: 78.73,
    		  demographics: [3812694, 3683606, 4614458, 6098806, 5397403, 4653080, 5155357, 2736204, 1736162],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Digestive diseases', 'Respiratory diseases', 'Lower respiratory infections', 'Liver diseases', 'Suicide', 'Diabetes', 'Alcohol use disorders', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [168709, 109266, 28753, 16843, 11826, 11096, 7788, 6778, 6655, 4457, 1024],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Unintentional injuries', 'Musculoskeletal disorders', 'Neurological disorders', 'Digestive diseases', 'Diabetes, blood, & endocrine diseases', 'Mental and substance use disorders', 'Respiratory diseases', 'Other NCDs', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [2771014, 2360949, 974998, 945960, 804552, 593513, 574896, 546687, 478036, 455361, 13890],
    		  riskFactors: ['Smoking', 'High blood pressure', 'Obesity', 'High blood sugar', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Diet high in salt', 'Low physical activity', 'Secondhand smoke', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [2063927, 1559349, 1413317, 1306415, 890803, 564674, 466544, 363580, 209552, 182665, 13890] },
    		 {id: 119,
    		  name: "Portugal",
    		  lifeExpectancy: 82.05,
    		  demographics: [856604, 1029022, 1076533, 1253640, 1587112, 1472388, 1282301, 997530, 671048],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Lower respiratory infections', 'Respiratory diseases', 'Digestive diseases', 'Diabetes', 'Kidney disease', 'Liver diseases', 'Suicide', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [36943, 29600, 10795, 7160, 6598, 5111, 3769, 3109, 2133, 1359, 1342],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Respiratory diseases', 'Other NCDs', 'Unintentional injuries', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [556228, 483288, 348277, 258666, 226388, 202807, 150373, 118395, 117492, 113988, 16768],
    		  riskFactors: ['High blood sugar', 'Smoking', 'Obesity', 'High blood pressure', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Low physical activity', 'Diet high in salt', 'Secondhand smoke', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [404257, 312988, 279203, 267234, 109389, 81137, 62114, 44482, 41270, 37113, 16768] },
    		 {id: 120,
    		  name: "Puerto Rico",
    		  lifeExpectancy: 80.1,
    		  demographics: [265199, 397823, 321336, 356603, 409046, 413780, 354578, 263573, 151466],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Diabetes', 'Natural disasters', 'Kidney disease', 'Respiratory diseases', 'Lower respiratory infections', 'Digestive diseases', 'Liver diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [8447, 6428, 3037, 2909, 2355, 1691, 1632, 1610, 1496, 953, 129],
    		  diseaseNames: ['Cardiovascular diseases', 'Diabetes, blood, & endocrine diseases', 'Cancers', 'Neurological disorders', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Other NCDs', 'Respiratory diseases', 'Interpersonal violence', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [138694, 137965, 124356, 74842, 70601, 63381, 47707, 44739, 43088, 40890, 1683],
    		  riskFactors: ['High blood sugar', 'Obesity', 'High blood pressure', 'Smoking', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Drug use', 'Diet low in fruits', 'Diet low in vegetables', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [164852, 164445, 96268, 44280, 38035, 29022, 19794, 15811, 14987, 14416, 1683] },
    		 {id: 121,
    		  name: "Qatar",
    		  lifeExpectancy: 80.23,
    		  demographics: [268598, 230385, 719809, 819308, 462935, 238779, 74010, 14279, 3968],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Road injuries', 'Diabetes', 'Digestive diseases', 'Suicide', 'Kidney disease', 'Liver diseases', 'Dementia', 'Lower respiratory infections', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [918, 660, 574, 287, 159, 145, 115, 114, 95, 91, 28],
    		  diseaseNames: ['Musculoskeletal disorders', 'Mental and substance use disorders', 'Transport injuries', 'Diabetes, blood, & endocrine diseases', 'Neurological disorders', 'Cardiovascular diseases', 'Unintentional injuries', 'Other NCDs', 'Cancers', 'Neonatal disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [51741, 51335, 34814, 33636, 31118, 30167, 25396, 22744, 21724, 15324, 800],
    		  riskFactors: ['Obesity', 'Drug use', 'High blood sugar', 'High blood pressure', 'Air pollution (outdoor & indoor)', 'Smoking', 'High cholesterol', 'Diet high in salt', 'Secondhand smoke', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [44342, 35001, 33964, 18908, 16441, 14310, 10265, 3899, 3836, 3090, 800] },
    		 {id: 122,
    		  name: "Romania",
    		  lifeExpectancy: 76.05,
    		  demographics: [1939134, 2069083, 2174981, 2621141, 3076100, 2508724, 2559619, 1482916, 932860],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Digestive diseases', 'Liver diseases', 'Respiratory diseases', 'Lower respiratory infections', 'Kidney disease', 'Suicide', 'Diabetes', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [144849, 51229, 14456, 14232, 10114, 7448, 6207, 3043, 2364, 2260, 1210],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Unintentional injuries', 'Musculoskeletal disorders', 'Digestive diseases', 'Neurological disorders', 'Mental and substance use disorders', 'Liver diseases', 'Respiratory diseases', 'Diabetes, blood, & endocrine diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [2293802, 1195901, 511173, 502200, 452352, 412973, 283885, 274588, 264969, 257818, 16197],
    		  riskFactors: ['High blood pressure', 'Smoking', 'Obesity', 'High cholesterol', 'High blood sugar', 'Diet high in salt', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Low physical activity', 'Secondhand smoke', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [1528585, 1142662, 972055, 625135, 616402, 354630, 337445, 314456, 148658, 139479, 16197] },
    		 {id: 123,
    		  name: "Russia",
    		  lifeExpectancy: 72.58,
    		  demographics: [18561902, 14795855, 16599344, 24452747, 19983554, 19449736, 18094236, 8266872, 5668011],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Digestive diseases', 'Dementia', 'Liver diseases', 'Suicide', 'Respiratory diseases', 'Lower respiratory infections', 'Alcohol use disorders', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [1000223, 291447, 94609, 84369, 50910, 43897, 38232, 35493, 28504, 24385, 3807],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Unintentional injuries', 'Digestive diseases', 'Neurological disorders', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Other NCDs', 'Self-harm', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [18699165, 7188475, 4457968, 3463448, 2949462, 2933286, 2337415, 2043512, 1947477, 1889160, 53680],
    		  riskFactors: ['High blood pressure', 'Smoking', 'Obesity', 'High cholesterol', 'High blood sugar', 'Diet low in fruits', 'Air pollution (outdoor & indoor)', 'Drug use', 'Diet high in salt', 'Diet low in vegetables', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [10606447, 8613005, 7301942, 7040122, 5421036, 2729779, 2341390, 1971308, 1848572, 1705448, 53680] },
    		 {id: 124,
    		  name: "Rwanda",
    		  lifeExpectancy: 69.02,
    		  demographics: [3502850, 2837454, 2168420, 1758438, 1012265, 721197, 419030, 163562, 43720],
    		  majorCauses: ['Cardiovascular diseases', 'Lower respiratory infections', 'Cancers', 'Neonatal disorders', 'Digestive diseases', 'Tuberculosis', 'Diarrheal diseases', 'Malaria', 'HIV/AIDS', 'Liver diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [8125, 6441, 6308, 5923, 4856, 4564, 3896, 3052, 2963, 2668, 0],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Neonatal disorders', 'HIV/AIDS and tuberculosis', 'Other NCDs', 'Malaria & neglected tropical diseases', 'Cancers', 'Cardiovascular diseases', 'Nutritional deficiencies', 'Digestive diseases', 'Mental and substance use disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [879009, 571287, 382120, 331276, 226776, 204285, 197051, 185350, 180480, 167605, 0],
    		  riskFactors: ['Child wasting', 'Air pollution (outdoor & indoor)', 'Unsafe water source', 'Unsafe sanitation', 'High blood sugar', 'High blood pressure', 'Smoking', 'Vitamin A deficiency', 'Obesity', 'Child stunting', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [331524, 249137, 204666, 158329, 133769, 120221, 100333, 87317, 65917, 63712, 0] },
    		 {id: 125,
    		  name: "Samoa",
    		  lifeExpectancy: 73.32,
    		  demographics: [52139, 41307, 30670, 21842, 19683, 16090, 9521, 4405, 1436],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Diabetes', 'Respiratory diseases', 'Kidney disease', 'Lower respiratory infections', 'Dementia', 'Digestive diseases', 'Neonatal disorders', 'Liver diseases'],
    		  majorDeaths: [411, 118, 79, 64, 56, 53, 49, 46, 29, 23],
    		  diseaseNames: ['Cardiovascular diseases', 'Diabetes, blood, & endocrine diseases', 'Diarrhea & common infectious diseases', 'Cancers', 'Neonatal disorders', 'Respiratory diseases', 'Musculoskeletal disorders', 'Other NCDs', 'Mental and substance use disorders', 'Neurological disorders'],
    		  diseaseDALYs: [9472, 6698, 3935, 3305, 3090, 2883, 2803, 2705, 2396, 2140],
    		  riskFactors: ['High blood sugar', 'Obesity', 'High blood pressure', 'Smoking', 'Air pollution (outdoor & indoor)', 'High cholesterol', 'Diet low in fruits', 'Secondhand smoke', 'Diet low in vegetables', 'Iron deficiency'],
    		  riskDALYs: [7631, 6959, 5743, 5211, 3003, 2345, 1772, 1521, 1406, 758] },
    		 {id: 126,
    		  name: "Saudi Arabia",
    		  lifeExpectancy: 75.13,
    		  demographics: [5937284, 4817472, 5457856, 6886975, 6162478, 3055997, 1307059, 476138, 167270],
    		  majorCauses: ['Cardiovascular diseases', 'Road injuries', 'Cancers', 'Kidney disease', 'Lower respiratory infections', 'Dementia', 'Digestive diseases', 'Respiratory diseases', 'Conflict', 'Liver diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [31569, 12039, 11843, 3818, 3505, 3371, 3109, 2665, 2589, 2461, 411],
    		  diseaseNames: ['Cardiovascular diseases', 'Transport injuries', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Neurological disorders', 'Unintentional injuries', 'Other NCDs', 'Cancers', 'Neonatal disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [888316, 650397, 637913, 629363, 484211, 464319, 451767, 390981, 379671, 314120, 9101],
    		  riskFactors: ['Obesity', 'High blood sugar', 'High blood pressure', 'Drug use', 'Air pollution (outdoor & indoor)', 'High cholesterol', 'Smoking', 'Diet low in fruits', 'Diet low in vegetables', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [743801, 575708, 539857, 320040, 306553, 274329, 222709, 158156, 111219, 101175, 9101] },
    		 {id: 127,
    		  name: "Senegal",
    		  lifeExpectancy: 67.94,
    		  demographics: [4949217, 3743997, 2751091, 1988586, 1278344, 803327, 488093, 231925, 61781],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Neonatal disorders', 'Lower respiratory infections', 'Diarrheal diseases', 'Tuberculosis', 'Digestive diseases', 'Respiratory diseases', 'Diabetes', 'Malaria', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [14794, 8931, 7877, 7727, 7270, 5250, 3747, 2852, 2349, 2146, 37],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Neonatal disorders', 'Other NCDs', 'Cardiovascular diseases', 'HIV/AIDS and tuberculosis', 'Diabetes, blood, & endocrine diseases', 'Nutritional deficiencies', 'Cancers', 'Unintentional injuries', 'Malaria & neglected tropical diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1228484, 760280, 387694, 358045, 289473, 277391, 264538, 248163, 210820, 206816, 785],
    		  riskFactors: ['Child wasting', 'Unsafe water source', 'Air pollution (outdoor & indoor)', 'Unsafe sanitation', 'High blood pressure', 'High blood sugar', 'Iron deficiency', 'Obesity', 'Vitamin A deficiency', 'Diet low in fruits', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [437753, 350590, 319175, 261781, 239801, 227424, 178631, 155356, 155343, 87564, 785] },
    		 {id: 128,
    		  name: "Serbia",
    		  lifeExpectancy: 76.0,
    		  demographics: [868805, 1010416, 1119463, 1216521, 1227265, 1120356, 1161341, 696223, 351838],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Digestive diseases', 'Respiratory diseases', 'Diabetes', 'Kidney disease', 'Suicide', 'Lower respiratory infections', 'Liver diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [67115, 26965, 6512, 4234, 4160, 3445, 2386, 1601, 1512, 1304, 239],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Neurological disorders', 'Diabetes, blood, & endocrine diseases', 'Unintentional injuries', 'Mental and substance use disorders', 'Respiratory diseases', 'Digestive diseases', 'Other NCDs', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1002625, 604601, 221677, 185794, 185145, 178140, 132892, 130607, 115168, 91317, 3298],
    		  riskFactors: ['High blood pressure', 'Smoking', 'High blood sugar', 'Obesity', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Diet low in fruits', 'Secondhand smoke', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [641143, 638003, 527500, 440815, 249746, 211876, 138216, 126286, 80423, 76754, 3298] },
    		 {id: 129,
    		  name: "Seychelles",
    		  lifeExpectancy: 73.4,
    		  demographics: [15951, 13607, 13698, 14627, 14883, 12766, 7366, 3182, 1661],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Lower respiratory infections', 'Digestive diseases', 'Kidney disease', 'Dementia', 'Liver diseases', 'Respiratory diseases', 'Diabetes', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [236, 162, 73, 48, 41, 33, 27, 27, 18, 14, 0],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Diabetes, blood, & endocrine diseases', 'Musculoskeletal disorders', 'Diarrhea & common infectious diseases', 'Other NCDs', 'Neurological disorders', 'Digestive diseases', 'Mental and substance use disorders', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [5202, 4083, 2520, 1825, 1777, 1498, 1466, 1425, 1409, 1229, 0],
    		  riskFactors: ['High blood pressure', 'High blood sugar', 'Obesity', 'Smoking', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Diet low in fruits', 'Secondhand smoke', 'Drug use', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [4112, 3116, 2992, 2506, 1258, 1218, 1076, 653, 462, 422, 0] },
    		 {id: 130,
    		  name: "Singapore",
    		  lifeExpectancy: 83.62,
    		  demographics: [473440, 525276, 841606, 898862, 965359, 946886, 762636, 260127, 130150],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Lower respiratory infections', 'Dementia', 'Respiratory diseases', 'Kidney disease', 'Digestive diseases', 'Suicide', 'Liver diseases', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [6161, 5449, 2696, 1617, 614, 594, 554, 496, 254, 197, 23],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Neurological disorders', 'Unintentional injuries', 'Diabetes, blood, & endocrine diseases', 'Other NCDs', 'Diarrhea & common infectious diseases', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [131167, 124284, 117699, 96826, 61286, 58107, 49214, 45303, 37425, 28180, 371],
    		  riskFactors: ['High blood pressure', 'High blood sugar', 'Smoking', 'Obesity', 'Diet high in salt', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Drug use', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [70498, 67953, 67867, 60133, 36052, 34968, 31284, 16570, 14955, 10389, 371] },
    		 {id: 131,
    		  name: "Slovakia",
    		  lifeExpectancy: 77.54,
    		  demographics: [568394, 542764, 680528, 860773, 843980, 714201, 687712, 380061, 178599],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Digestive diseases', 'Lower respiratory infections', 'Liver diseases', 'Respiratory diseases', 'Diabetes', 'Kidney disease', 'Suicide', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [25216, 13227, 2992, 2748, 1680, 1527, 1107, 732, 713, 675, 28],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Unintentional injuries', 'Neurological disorders', 'Digestive diseases', 'Diabetes, blood, & endocrine diseases', 'Mental and substance use disorders', 'Other NCDs', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [425950, 300811, 144022, 140687, 103170, 94371, 79871, 79683, 61368, 49558, 404],
    		  riskFactors: ['High blood pressure', 'Smoking', 'Obesity', 'High cholesterol', 'High blood sugar', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Diet low in fruits', 'Diet low in vegetables', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [272632, 240554, 209249, 151462, 151283, 69635, 68488, 61685, 38061, 31734, 404] },
    		 {id: 132,
    		  name: "Slovenia",
    		  lifeExpectancy: 81.32,
    		  demographics: [212011, 193037, 211211, 290227, 303945, 302099, 281171, 172426, 112527],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Digestive diseases', 'Respiratory diseases', 'Lower respiratory infections', 'Liver diseases', 'Suicide', 'Diabetes', 'Kidney disease', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [7450, 5907, 1534, 1058, 630, 601, 541, 430, 300, 213, 106],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Unintentional injuries', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Digestive diseases', 'Diabetes, blood, & endocrine diseases', 'Other NCDs', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [114870, 105868, 63618, 56464, 42850, 32756, 29060, 29039, 24407, 21852, 1388],
    		  riskFactors: ['Smoking', 'High blood pressure', 'Obesity', 'High blood sugar', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Diet low in fruits', 'Drug use', 'Diet low in vegetables', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [82245, 64747, 60624, 48836, 28166, 19537, 17406, 9380, 9341, 8879, 1388] },
    		 {id: 133,
    		  name: "Somalia",
    		  lifeExpectancy: 57.4,
    		  demographics: [5094110, 3837600, 2580391, 1477525, 1036888, 713771, 450111, 201592, 50918],
    		  majorCauses: ['Cardiovascular diseases', 'Lower respiratory infections', 'Tuberculosis', 'Neonatal disorders', 'Diarrheal diseases', 'Cancers', 'Conflict', 'Road injuries', 'Digestive diseases', 'Nutritional deficiencies', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [18048, 13033, 12697, 12265, 10548, 9299, 5445, 5154, 4786, 3435, 67],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Neonatal disorders', 'HIV/AIDS and tuberculosis', 'Cardiovascular diseases', 'Nutritional deficiencies', 'Other NCDs', 'Cancers', 'Transport injuries', 'Unintentional injuries', 'Other communicable diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1602542, 1125637, 532931, 506577, 500937, 389547, 329509, 315175, 283153, 241549, 1434],
    		  riskFactors: ['Child wasting', 'Air pollution (outdoor & indoor)', 'Unsafe water source', 'Vitamin A deficiency', 'Unsafe sanitation', 'High blood pressure', 'Child stunting', 'High blood sugar', 'Non-exclusive breastfeeding', 'Iron deficiency', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [1406987, 647809, 644927, 524574, 496043, 313258, 304365, 296970, 210379, 188299, 1434] },
    		 {id: 134,
    		  name: "South Africa",
    		  lifeExpectancy: 64.13,
    		  demographics: [11581615, 10240605, 10231760, 9942466, 6845747, 4794113, 3068429, 1430792, 422740],
    		  majorCauses: ['HIV/AIDS', 'Cardiovascular diseases', 'Cancers', 'Lower respiratory infections', 'Diabetes', 'Tuberculosis', 'Respiratory diseases', 'Homicide', 'Road injuries', 'Diarrheal diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [135399, 76671, 48637, 26529, 22654, 19624, 18132, 15701, 15504, 14302, 524],
    		  diseaseNames: ['HIV/AIDS and tuberculosis', 'Diarrhea & common infectious diseases', 'Cardiovascular diseases', 'Diabetes, blood, & endocrine diseases', 'Cancers', 'Neonatal disorders', 'Mental and substance use disorders', 'Transport injuries', 'Interpersonal violence', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [10033858, 2145400, 1721968, 1712504, 1275456, 1164989, 864880, 862779, 862716, 779758, 10024],
    		  riskFactors: ['High blood sugar', 'Obesity', 'High blood pressure', 'Smoking', 'Air pollution (outdoor & indoor)', 'Child wasting', 'Unsafe water source', 'Diet low in fruits', 'Drug use', 'High cholesterol', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [1646278, 1454452, 1274406, 960155, 799354, 602865, 505677, 426733, 396322, 344011, 10024] },
    		 {id: 135,
    		  name: "South Korea",
    		  lifeExpectancy: 83.03,
    		  demographics: [4240885, 4886624, 6797905, 7196849, 8330006, 8442921, 6135717, 3444643, 1749770],
    		  majorCauses: ['Cancers', 'Cardiovascular diseases', 'Dementia', 'Digestive diseases', 'Suicide', 'Respiratory diseases', 'Lower respiratory infections', 'Diabetes', 'Liver diseases', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [92548, 66787, 31554, 16084, 15228, 13973, 13444, 11719, 9447, 6643, 269],
    		  diseaseNames: ['Cancers', 'Musculoskeletal disorders', 'Cardiovascular diseases', 'Diabetes, blood, & endocrine diseases', 'Mental and substance use disorders', 'Neurological disorders', 'Unintentional injuries', 'Self-harm', 'Respiratory diseases', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1936073, 1435379, 1193979, 898163, 883625, 861525, 659048, 527829, 491707, 453457, 3906],
    		  riskFactors: ['Smoking', 'High blood sugar', 'High blood pressure', 'Obesity', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'High cholesterol', 'Diet low in fruits', 'Drug use', 'Secondhand smoke', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [1272299, 1121507, 575007, 528944, 422295, 305748, 271902, 206364, 158057, 115893, 3906] },
    		 {id: 136,
    		  name: "Spain",
    		  lifeExpectancy: 83.56,
    		  demographics: [4340417, 4682339, 4652133, 6158281, 7935505, 6944643, 5200462, 3921750, 2901252],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Respiratory diseases', 'Digestive diseases', 'Lower respiratory infections', 'Kidney disease', 'Diabetes', 'Liver diseases', 'Parkinson disease'],
    		  majorDeaths: [123577, 115657, 51759, 33490, 21593, 12941, 10605, 8292, 8132, 5808],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Respiratory diseases', 'Unintentional injuries', 'Other NCDs', 'Digestive diseases'],
    		  diseaseDALYs: [2182632, 1682048, 1265974, 1243119, 950283, 660386, 588589, 549012, 475533, 448367],
    		  riskFactors: ['Smoking', 'High blood sugar', 'High blood pressure', 'Obesity', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Drug use', 'Low physical activity', 'Secondhand smoke'],
    		  riskDALYs: [1544708, 985420, 979221, 949682, 385742, 295600, 163174, 156687, 135357, 120071] },
    		 {id: 137,
    		  name: "Sri Lanka",
    		  lifeExpectancy: 76.98,
    		  demographics: [3383992, 3369304, 2906780, 2883558, 2848798, 2533919, 1966154, 1080639, 350590],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Respiratory diseases', 'Diabetes', 'Dementia', 'Digestive diseases', 'Lower respiratory infections', 'Suicide', 'Kidney disease', 'Liver diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [41867, 16628, 12267, 11537, 5971, 5246, 4986, 4523, 4512, 4021, 10],
    		  diseaseNames: ['Cardiovascular diseases', 'Diabetes, blood, & endocrine diseases', 'Cancers', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Respiratory diseases', 'Neurological disorders', 'Other NCDs', 'Diarrhea & common infectious diseases', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [880238, 528668, 417142, 363658, 323956, 317010, 296913, 243702, 217443, 207042, 160],
    		  riskFactors: ['High blood sugar', 'High blood pressure', 'Obesity', 'Smoking', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Diet high in salt', 'Diet low in vegetables', 'Secondhand smoke', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [776768, 569841, 392912, 342663, 285535, 251275, 189307, 182848, 122999, 85925, 160] },
    		 {id: 138,
    		  name: "Sudan",
    		  lifeExpectancy: 65.31,
    		  demographics: [11957900, 9925896, 7382380, 5059889, 3624817, 2465268, 1480214, 702966, 213907],
    		  majorCauses: ['Cardiovascular diseases', 'Neonatal disorders', 'Cancers', 'Road injuries', 'Lower respiratory infections', 'Diarrheal diseases', 'Respiratory diseases', 'HIV/AIDS', 'Digestive diseases', 'Dementia', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [69012, 25224, 15171, 10692, 9402, 8236, 5902, 5296, 5148, 4396, 170],
    		  diseaseNames: ['Neonatal disorders', 'Other NCDs', 'Cardiovascular diseases', 'Diarrhea & common infectious diseases', 'Transport injuries', 'Diabetes, blood, & endocrine diseases', 'Mental and substance use disorders', 'Unintentional injuries', 'Musculoskeletal disorders', 'Neurological disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [2412123, 1787062, 1725565, 1342405, 726662, 718901, 647654, 608911, 559545, 487047, 3446],
    		  riskFactors: ['High blood pressure', 'Child wasting', 'Obesity', 'Air pollution (outdoor & indoor)', 'Unsafe water source', 'High blood sugar', 'High cholesterol', 'Unsafe sanitation', 'Diet low in fruits', 'Iron deficiency', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [1049467, 1019444, 733013, 703277, 649044, 624608, 517119, 512310, 304955, 281543, 3446] },
    		 {id: 139,
    		  name: "Suriname",
    		  lifeExpectancy: 71.68,
    		  demographics: [104982, 101957, 95327, 81591, 72819, 63673, 35048, 18175, 7791],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Digestive diseases', 'Diabetes', 'Kidney disease', 'Lower respiratory infections', 'Dementia', 'Suicide', 'Neonatal disorders', 'Liver diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [1396, 666, 243, 226, 209, 182, 170, 147, 144, 124, 1],
    		  diseaseNames: ['Cardiovascular diseases', 'Diabetes, blood, & endocrine diseases', 'Cancers', 'Neonatal disorders', 'Mental and substance use disorders', 'Other NCDs', 'Diarrhea & common infectious diseases', 'Neurological disorders', 'Musculoskeletal disorders', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [30501, 17214, 16906, 14702, 10533, 9951, 9783, 9038, 8792, 7928, 17],
    		  riskFactors: ['High blood sugar', 'Obesity', 'High blood pressure', 'Smoking', 'Air pollution (outdoor & indoor)', 'High cholesterol', 'Diet low in fruits', 'Diet low in vegetables', 'Drug use', 'Secondhand smoke', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [22098, 21406, 17697, 13435, 7920, 6442, 4554, 4009, 2483, 2435, 17] },
    		 {id: 140,
    		  name: "Swaziland",
    		  lifeExpectancy: 60.19,
    		  demographics: [288502, 273125, 212361, 158383, 99646, 50414, 36433, 22204, 7065],
    		  majorCauses: ['HIV/AIDS', 'Cardiovascular diseases', 'Cancers', 'Lower respiratory infections', 'Diabetes', 'Diarrheal diseases', 'Tuberculosis', 'Road injuries', 'Neonatal disorders', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [2506, 1465, 844, 674, 584, 545, 521, 371, 360, 324, 2],
    		  diseaseNames: ['HIV/AIDS and tuberculosis', 'Diarrhea & common infectious diseases', 'Diabetes, blood, & endocrine diseases', 'Cardiovascular diseases', 'Neonatal disorders', 'Cancers', 'Transport injuries', 'Unintentional injuries', 'Other NCDs', 'Interpersonal violence', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [277199, 120264, 39005, 38330, 36491, 26189, 23874, 18538, 16601, 16543, 39],
    		  riskFactors: ['High blood sugar', 'Obesity', 'Unsafe water source', 'High blood pressure', 'Child wasting', 'Air pollution (outdoor & indoor)', 'Unsafe sanitation', 'Smoking', 'Drug use', 'Vitamin A deficiency', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [44001, 35825, 29513, 27107, 24991, 22925, 21591, 15768, 8741, 8128, 39] },
    		 {id: 141,
    		  name: "Sweden",
    		  lifeExpectancy: 82.8,
    		  demographics: [1191245, 1106232, 1304961, 1289302, 1277210, 1280608, 1097278, 967449, 522106],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Respiratory diseases', 'COVID-19 until May 27, 2020', 'Digestive diseases', 'Lower respiratory infections', 'Diabetes', 'Kidney disease', 'Suicide', 'Parkinson disease'],
    		  majorDeaths: [34164, 24053, 9660, 4518, 4125, 3034, 2903, 1722, 1461, 1395, 1213],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Unintentional injuries', 'Respiratory diseases', 'Other NCDs', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [446549, 436415, 277268, 240709, 211399, 139367, 139276, 136083, 110778, 73435, 52985],
    		  riskFactors: ['Smoking', 'High blood sugar', 'High blood pressure', 'Obesity', 'High cholesterol', 'COVID-19 until May 27, 2020', 'Diet high in salt', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Drug use', 'Low physical activity'],
    		  riskDALYs: [284244, 257193, 248332, 202521, 123616, 52985, 45905, 41439, 40058, 39436, 38229] },
    		 {id: 142,
    		  name: "Switzerland",
    		  lifeExpectancy: 83.78,
    		  demographics: [875799, 835663, 1047321, 1211148, 1177086, 1309842, 953874, 731996, 448632],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Respiratory diseases', 'Digestive diseases', 'Lower respiratory infections', 'COVID-19 until May 27, 2020', 'Kidney disease', 'Suicide', 'Diabetes', 'Liver diseases'],
    		  majorDeaths: [21280, 17882, 7597, 2816, 2641, 1697, 1647, 1558, 1133, 1123, 940],
    		  diseaseNames: ['Cancers', 'Musculoskeletal disorders', 'Cardiovascular diseases', 'Neurological disorders', 'Mental and substance use disorders', 'Unintentional injuries', 'Diabetes, blood, & endocrine diseases', 'Other NCDs', 'Respiratory diseases', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [337817, 307335, 263828, 185793, 166939, 115288, 104830, 91308, 86577, 60915, 21509],
    		  riskFactors: ['Smoking', 'High blood sugar', 'Obesity', 'High blood pressure', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Drug use', 'Diet high in salt', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [242301, 180978, 138338, 135271, 84308, 47268, 32555, 30843, 25405, 23257, 21509] },
    		 {id: 143,
    		  name: "Syria",
    		  lifeExpectancy: 72.7,
    		  demographics: [3569815, 3299311, 3073670, 2832030, 1819810, 1234238, 769970, 334158, 137130],
    		  majorCauses: ['Cardiovascular diseases', 'Conflict', 'Cancers', 'Dementia', 'Respiratory diseases', 'Kidney disease', 'Digestive diseases', 'Terrorism', 'Lower respiratory infections', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [41380, 41378, 8795, 3157, 2994, 2257, 2139, 2026, 1946, 1748, 4],
    		  diseaseNames: ['Conflict and terrorism', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Cancers', 'Other NCDs', 'Neurological disorders', 'Diarrhea & common infectious diseases', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [3450747, 966983, 302387, 301942, 252434, 252051, 237494, 235115, 169355, 164278, 77],
    		  riskFactors: ['High blood pressure', 'Obesity', 'High blood sugar', 'High cholesterol', 'Smoking', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Diet low in vegetables', 'Drug use', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [568413, 461284, 369488, 308024, 302142, 225934, 164138, 128383, 106175, 89597, 77] },
    		 {id: 144,
    		  name: "Taiwan",
    		  lifeExpectancy: 80.46,
    		  demographics: [2037909, 2275933, 3158514, 3637865, 3739295, 3676703, 2995888, 1399598, 852176],
    		  majorCauses: ['Cancers', 'Cardiovascular diseases', 'Lower respiratory infections', 'Dementia', 'Digestive diseases', 'Diabetes', 'Respiratory diseases', 'Kidney disease', 'Liver diseases', 'Suicide', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [53165, 40528, 13115, 12814, 10313, 9522, 9474, 6743, 6510, 4355, 7],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Diabetes, blood, & endocrine diseases', 'Musculoskeletal disorders', 'Respiratory diseases', 'Neurological disorders', 'Mental and substance use disorders', 'Digestive diseases', 'Other NCDs', 'Transport injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1180273, 799276, 675740, 496956, 391306, 372657, 354883, 287510, 263068, 203754, 101],
    		  riskFactors: ['Smoking', 'High blood sugar', 'Obesity', 'High blood pressure', 'Air pollution (outdoor & indoor)', 'High cholesterol', 'Drug use', 'Secondhand smoke', 'Diet high in salt', 'Diet low in fruits', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [717421, 668199, 554479, 456764, 301189, 196544, 159397, 118790, 116679, 111020, 101] },
    		 {id: 145,
    		  name: "Tajikistan",
    		  lifeExpectancy: 71.1,
    		  demographics: [2521647, 1740863, 1656860, 1336885, 861056, 686415, 358651, 111823, 46823],
    		  majorCauses: ['Cardiovascular diseases', 'Lower respiratory infections', 'Cancers', 'Neonatal disorders', 'Digestive diseases', 'Diarrheal diseases', 'Liver diseases', 'Respiratory diseases', 'Diabetes', 'Dementia', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [18269, 4902, 4721, 3672, 2157, 1783, 1536, 1464, 1323, 1289, 46],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Cardiovascular diseases', 'Neonatal disorders', 'Other NCDs', 'Unintentional injuries', 'Cancers', 'Neurological disorders', 'Diabetes, blood, & endocrine diseases', 'Digestive diseases', 'Mental and substance use disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [465754, 410475, 358569, 211958, 172689, 156895, 126736, 112026, 108010, 104828, 978],
    		  riskFactors: ['Child wasting', 'High blood pressure', 'Air pollution (outdoor & indoor)', 'High blood sugar', 'Obesity', 'Smoking', 'High cholesterol', 'Unsafe water source', 'Diet low in fruits', 'Unsafe sanitation', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [324745, 259292, 240715, 228221, 143717, 126773, 104585, 103889, 93823, 93502, 978] },
    		 {id: 146,
    		  name: "Tanzania",
    		  lifeExpectancy: 65.46,
    		  demographics: [17990384, 13636144, 9575102, 6938129, 4635689, 2803032, 1556334, 710015, 160632],
    		  majorCauses: ['Cardiovascular diseases', 'Neonatal disorders', 'Lower respiratory infections', 'HIV/AIDS', 'Cancers', 'Tuberculosis', 'Malaria', 'Diarrheal diseases', 'Digestive diseases', 'Diabetes', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [44175, 34523, 33486, 28299, 27864, 20391, 15325, 15196, 12862, 7084, 21],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Neonatal disorders', 'HIV/AIDS and tuberculosis', 'Other NCDs', 'Malaria & neglected tropical diseases', 'Cardiovascular diseases', 'Nutritional deficiencies', 'Cancers', 'Unintentional injuries', 'Diabetes, blood, & endocrine diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [4552138, 3263525, 3045845, 2349773, 1408015, 1071877, 1055921, 930207, 781168, 744072, 470],
    		  riskFactors: ['Child wasting', 'Air pollution (outdoor & indoor)', 'High blood pressure', 'Unsafe water source', 'High blood sugar', 'Unsafe sanitation', 'Iron deficiency', 'Smoking', 'Obesity', 'Vitamin A deficiency', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [1593860, 1303846, 708742, 677911, 596951, 509350, 490643, 425930, 416383, 366069, 470] },
    		 {id: 147,
    		  name: "Thailand",
    		  lifeExpectancy: 77.15,
    		  demographics: [7548496, 8629471, 9617196, 9351071, 11070365, 10557509, 7301625, 3702813, 1847035],
    		  majorCauses: ['Cancers', 'Cardiovascular diseases', 'Lower respiratory infections', 'Dementia', 'Digestive diseases', 'Kidney disease', 'Respiratory diseases', 'HIV/AIDS', 'Road injuries', 'Liver diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [102596, 102583, 36188, 31550, 27266, 21922, 19813, 19372, 19183, 17239, 57],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Diabetes, blood, & endocrine diseases', 'Neurological disorders', 'Transport injuries', 'Mental and substance use disorders', 'Diarrhea & common infectious diseases', 'Digestive diseases', 'Other NCDs', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [2520200, 2359442, 1629403, 1474520, 1151289, 1131258, 1102666, 1030793, 842762, 795653, 867],
    		  riskFactors: ['Obesity', 'High blood sugar', 'Smoking', 'High blood pressure', 'Air pollution (outdoor & indoor)', 'High cholesterol', 'Drug use', 'Diet high in salt', 'Diet low in fruits', 'Diet low in vegetables', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [1544002, 1503953, 1495743, 1392361, 817709, 595479, 522351, 480904, 337081, 334390, 867] },
    		 {id: 148,
    		  name: "Togo",
    		  lifeExpectancy: 61.04,
    		  demographics: [2311118, 1866015, 1338976, 1041497, 716177, 432524, 246902, 107658, 21492],
    		  majorCauses: ['Cardiovascular diseases', 'Malaria', 'Neonatal disorders', 'HIV/AIDS', 'Lower respiratory infections', 'Cancers', 'Diarrheal diseases', 'Tuberculosis', 'Digestive diseases', 'Respiratory diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [7581, 6904, 4066, 3875, 3742, 3619, 3202, 2349, 1728, 1294, 13],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'Malaria & neglected tropical diseases', 'Neonatal disorders', 'HIV/AIDS and tuberculosis', 'Cardiovascular diseases', 'Other NCDs', 'Diabetes, blood, & endocrine diseases', 'Nutritional deficiencies', 'Cancers', 'Mental and substance use disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [537846, 508891, 393410, 341328, 204478, 196801, 129842, 113892, 110100, 95415, 290],
    		  riskFactors: ['Child wasting', 'Unsafe water source', 'Air pollution (outdoor & indoor)', 'Unsafe sanitation', 'High blood pressure', 'High blood sugar', 'Vitamin A deficiency', 'Obesity', 'Iron deficiency', 'Diet low in fruits', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [220449, 185196, 160336, 135929, 134583, 94600, 76138, 68658, 58437, 51784, 290] },
    		 {id: 149,
    		  name: "Tonga",
    		  lifeExpectancy: 70.91,
    		  demographics: [24631, 23270, 16616, 12190, 10251, 8452, 5150, 2759, 1178],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Diabetes', 'Respiratory diseases', 'Digestive diseases', 'Kidney disease', 'Lower respiratory infections', 'Dementia', 'Liver diseases', 'Neonatal disorders'],
    		  majorDeaths: [168, 130, 89, 42, 40, 38, 37, 30, 20, 15],
    		  diseaseNames: ['Diabetes, blood, & endocrine diseases', 'Cardiovascular diseases', 'Cancers', 'Diarrhea & common infectious diseases', 'Respiratory diseases', 'Musculoskeletal disorders', 'Neonatal disorders', 'Unintentional injuries', 'Other NCDs', 'Mental and substance use disorders'],
    		  diseaseDALYs: [4546, 3934, 3332, 2361, 1709, 1669, 1572, 1366, 1351, 1273],
    		  riskFactors: ['High blood sugar', 'Obesity', 'High blood pressure', 'Smoking', 'Air pollution (outdoor & indoor)', 'High cholesterol', 'Diet low in fruits', 'Secondhand smoke', 'Diet high in salt', 'Diet low in vegetables'],
    		  riskDALYs: [5164, 4209, 2848, 2083, 1566, 1338, 887, 702, 638, 590] },
    		 {id: 150,
    		  name: "Tunisia",
    		  lifeExpectancy: 76.7,
    		  demographics: [2003420, 1617133, 1752255, 1915913, 1535771, 1342758, 920265, 405873, 201331],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Road injuries', 'Respiratory diseases', 'Diabetes', 'Digestive diseases', 'Lower respiratory infections', 'Kidney disease', 'Liver diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [34122, 9409, 3940, 3669, 2497, 1934, 1776, 1650, 1645, 1001, 48],
    		  diseaseNames: ['Cardiovascular diseases', 'Diabetes, blood, & endocrine diseases', 'Musculoskeletal disorders', 'Cancers', 'Mental and substance use disorders', 'Neurological disorders', 'Transport injuries', 'Other NCDs', 'Neonatal disorders', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [585199, 248559, 245020, 222652, 214692, 184184, 167150, 140000, 121829, 113084, 792],
    		  riskFactors: ['High blood pressure', 'High blood sugar', 'Obesity', 'Smoking', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Drug use', 'Diet low in fruits', 'Secondhand smoke', 'Low physical activity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [340549, 294028, 293805, 263027, 156922, 137558, 97722, 75056, 53044, 46210, 792] },
    		 {id: 151,
    		  name: "Turkey",
    		  lifeExpectancy: 77.69,
    		  demographics: [13501499, 13585939, 13087611, 12748548, 11221844, 8664742, 5968559, 3216491, 1434374],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Respiratory diseases', 'Dementia', 'Kidney disease', 'Diabetes', 'Lower respiratory infections', 'Digestive diseases', 'Road injuries', 'Neonatal disorders', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [146584, 92760, 30377, 25063, 15153, 14803, 11029, 10147, 8604, 7759, 4397],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Diabetes, blood, & endocrine diseases', 'Mental and substance use disorders', 'Other NCDs', 'Neurological disorders', 'Respiratory diseases', 'Neonatal disorders', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [2919631, 2354596, 1872089, 1592440, 1393202, 1299523, 1292062, 1093030, 967562, 663606, 71536],
    		  riskFactors: ['Smoking', 'Obesity', 'High blood pressure', 'High blood sugar', 'Air pollution (outdoor & indoor)', 'High cholesterol', 'Drug use', 'Secondhand smoke', 'Low physical activity', 'Diet low in fruits', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [2226441, 2042748, 1847649, 1636498, 1052115, 748929, 537754, 318850, 250390, 233411, 71536] },
    		 {id: 152,
    		  name: "Turkmenistan",
    		  lifeExpectancy: 68.19,
    		  demographics: [1319649, 986539, 1030876, 931108, 681290, 527222, 315752, 97685, 51973],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Digestive diseases', 'Liver diseases', 'Lower respiratory infections', 'Neonatal disorders', 'Dementia', 'Diabetes', 'Kidney disease', 'Tuberculosis'],
    		  majorDeaths: [17557, 3525, 2714, 2341, 1206, 1119, 1085, 699, 632, 515],
    		  diseaseNames: ['Cardiovascular diseases', 'Diarrhea & common infectious diseases', 'Neonatal disorders', 'Digestive diseases', 'Cancers', 'Other NCDs', 'Diabetes, blood, & endocrine diseases', 'Liver diseases', 'Unintentional injuries', 'Neurological disorders'],
    		  diseaseDALYs: [412359, 156211, 117894, 116563, 109893, 98719, 98581, 90861, 82484, 66974],
    		  riskFactors: ['High blood pressure', 'Obesity', 'High blood sugar', 'High cholesterol', 'Smoking', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Diet high in salt', 'Child wasting', 'Secondhand smoke'],
    		  riskDALYs: [261803, 192851, 190537, 127973, 124986, 79461, 71543, 58734, 39112, 37650] },
    		 {id: 153,
    		  name: "Uganda",
    		  lifeExpectancy: 63.37,
    		  demographics: [14582039, 11067913, 7564888, 4881270, 2997016, 1765499, 930221, 391414, 89327],
    		  majorCauses: ['Neonatal disorders', 'HIV/AIDS', 'Cardiovascular diseases', 'Malaria', 'Cancers', 'Lower respiratory infections', 'Tuberculosis', 'Diarrheal diseases', 'Digestive diseases', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [26523, 25920, 22888, 22237, 20659, 14831, 14181, 11833, 8742, 5826, 0],
    		  diseaseNames: ['Diarrhea & common infectious diseases', 'HIV/AIDS and tuberculosis', 'Neonatal disorders', 'Malaria & neglected tropical diseases', 'Other NCDs', 'Cancers', 'Other communicable diseases', 'Nutritional deficiencies', 'Cardiovascular diseases', 'Mental and substance use disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [3490823, 3014071, 2525060, 1935911, 1064399, 733907, 669265, 596318, 591241, 543171, 0],
    		  riskFactors: ['Child wasting', 'Unsafe water source', 'Air pollution (outdoor & indoor)', 'Unsafe sanitation', 'High blood sugar', 'High blood pressure', 'Vitamin A deficiency', 'Iron deficiency', 'Smoking', 'Obesity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [862388, 642771, 631450, 504195, 368985, 360544, 304798, 239348, 179745, 179650, 0] },
    		 {id: 154,
    		  name: "Ukraine",
    		  lifeExpectancy: 72.06,
    		  demographics: [4688013, 4279672, 5165651, 7259196, 6313137, 6006155, 5470675, 2961499, 1849645],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Digestive diseases', 'Liver diseases', 'Suicide', 'Respiratory diseases', 'Lower respiratory infections', 'Alcohol use disorders', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [427321, 96034, 34913, 30537, 20083, 13679, 11366, 9215, 8270, 6681, 644],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Digestive diseases', 'Unintentional injuries', 'Musculoskeletal disorders', 'Neurological disorders', 'Liver diseases', 'Mental and substance use disorders', 'Other NCDs', 'Self-harm', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [7982965, 2712757, 1323796, 1323359, 1163398, 1059750, 816301, 778737, 677804, 651836, 8904],
    		  riskFactors: ['High blood pressure', 'Smoking', 'Obesity', 'High cholesterol', 'High blood sugar', 'Diet low in fruits', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Low physical activity', 'Drug use', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [5022720, 3420787, 2728117, 2680474, 2115808, 1322553, 1176016, 772782, 738698, 510646, 8904] },
    		 {id: 155,
    		  name: "United Arab Emirates",
    		  lifeExpectancy: 77.97,
    		  demographics: [1006422, 835037, 2150663, 3072012, 1655625, 777310, 209301, 52385, 11771],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Road injuries', 'Respiratory diseases', 'Diabetes', 'Kidney disease', 'Drug use disorders', 'Suicide', 'Digestive diseases', 'Lower respiratory infections', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [7347, 5107, 3649, 1554, 1145, 829, 629, 599, 589, 586, 253],
    		  diseaseNames: ['Cardiovascular diseases', 'Musculoskeletal disorders', 'Transport injuries', 'Diabetes, blood, & endocrine diseases', 'Mental and substance use disorders', 'Cancers', 'Unintentional injuries', 'Neurological disorders', 'Respiratory diseases', 'Other NCDs', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [244834, 208816, 191799, 179512, 178787, 172241, 136126, 124005, 118059, 108280, 7365],
    		  riskFactors: ['Obesity', 'Drug use', 'High blood sugar', 'High blood pressure', 'High cholesterol', 'Smoking', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Diet low in vegetables', 'Diet high in salt', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [250177, 220805, 177587, 159731, 151202, 116323, 92221, 46473, 33179, 30313, 7365] },
    		 {id: 156,
    		  name: "United Kingdom",
    		  lifeExpectancy: 81.32,
    		  demographics: [8065283, 7569160, 8630614, 9203569, 8624679, 9138365, 7206475, 5673457, 3418559],
    		  majorCauses: ['Cancers', 'Cardiovascular diseases', 'Dementia', 'Respiratory diseases', 'COVID-19 until May 27, 2020', 'Lower respiratory infections', 'Digestive diseases', 'Liver diseases', 'Parkinson disease', 'Kidney disease', 'Suicide'],
    		  majorDeaths: [179856, 176516, 63894, 47298, 37048, 36952, 29640, 9258, 7334, 6766, 5778],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Neurological disorders', 'Mental and substance use disorders', 'Respiratory diseases', 'Other NCDs', 'Unintentional injuries', 'Diabetes, blood, & endocrine diseases', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [3323621, 2620719, 2099648, 1589106, 1296572, 1217869, 789427, 782490, 740272, 738202, 481718],
    		  riskFactors: ['Smoking', 'Obesity', 'High blood pressure', 'High blood sugar', 'High cholesterol', 'COVID-19 until May 27, 2020', 'Air pollution (outdoor & indoor)', 'Drug use', 'Diet low in fruits', 'Low physical activity', 'Diet low in vegetables'],
    		  riskDALYs: [2021182, 1448311, 1337544, 1293288, 752234, 481718, 480135, 424409, 362994, 219675, 219262] },
    		 {id: 157,
    		  name: "United States",
    		  lifeExpectancy: 78.86,
    		  demographics: [39891845, 42398071, 46179065, 43980069, 40288440, 42557686, 37845098, 23009234, 12915409],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Respiratory diseases', 'Digestive diseases', 'COVID-19 until May 27, 2020', 'Lower respiratory infections', 'Kidney disease', 'Diabetes', 'Drug use disorders', 'Liver diseases'],
    		  majorDeaths: [902270, 699394, 258587, 196983, 114419, 98916, 93792, 84944, 68558, 67629, 62493],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Diabetes, blood, & endocrine diseases', 'Mental and substance use disorders', 'Neurological disorders', 'Respiratory diseases', 'Other NCDs', 'Unintentional injuries', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [15273136, 14368167, 9550395, 7190242, 7176630, 6691294, 5887644, 3992949, 3787971, 3546678, 1363568],
    		  riskFactors: ['Obesity', 'Smoking', 'High blood sugar', 'High blood pressure', 'Drug use', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Diet low in fruits', 'COVID-19 until May 27, 2020', 'Diet low in vegetables'],
    		  riskDALYs: [11440537, 10405127, 9566522, 7850854, 6465949, 4010823, 2432143, 1978011, 1966068, 1363568, 1249128] },
    		 {id: 158,
    		  name: "Uruguay",
    		  lifeExpectancy: 77.91,
    		  demographics: [473133, 483284, 512458, 458714, 451252, 390115, 321685, 216752, 154338],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Dementia', 'Respiratory diseases', 'Lower respiratory infections', 'Digestive diseases', 'Diabetes', 'Kidney disease', 'Suicide', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [9912, 9576, 2363, 2065, 1476, 1455, 796, 787, 676, 609, 22],
    		  diseaseNames: ['Cancers', 'Cardiovascular diseases', 'Musculoskeletal disorders', 'Mental and substance use disorders', 'Neurological disorders', 'Diabetes, blood, & endocrine diseases', 'Unintentional injuries', 'Respiratory diseases', 'Other NCDs', 'Digestive diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [191969, 155889, 81966, 64215, 59439, 57322, 54943, 48981, 48284, 34011, 292],
    		  riskFactors: ['Smoking', 'High blood sugar', 'Obesity', 'High blood pressure', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet high in salt', 'Diet low in fruits', 'Diet low in vegetables', 'Drug use', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [122819, 102193, 92697, 90942, 35618, 25552, 24250, 22019, 16300, 16013, 292] },
    		 {id: 159,
    		  name: "Uzbekistan",
    		  lifeExpectancy: 71.72,
    		  demographics: [6664494, 5370904, 6061979, 5409605, 3820670, 3028065, 1810321, 546389, 269288],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Digestive diseases', 'Liver diseases', 'Lower respiratory infections', 'Diabetes', 'Neonatal disorders', 'Dementia', 'Respiratory diseases', 'Road injuries', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [115263, 19020, 12837, 10974, 9749, 6468, 5348, 4578, 4239, 3990, 14],
    		  diseaseNames: ['Cardiovascular diseases', 'Diarrhea & common infectious diseases', 'Cancers', 'Neonatal disorders', 'Diabetes, blood, & endocrine diseases', 'Digestive diseases', 'Unintentional injuries', 'Neurological disorders', 'Other NCDs', 'Musculoskeletal disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [2443175, 886397, 597123, 595292, 558138, 526686, 503123, 443174, 434858, 410622, 275],
    		  riskFactors: ['High blood pressure', 'High blood sugar', 'Obesity', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Smoking', 'Diet low in fruits', 'Diet high in salt', 'Child wasting', 'Iron deficiency', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [1496057, 1280895, 1076363, 745685, 642961, 621056, 458090, 302480, 258512, 232779, 275] },
    		 {id: 160,
    		  name: "Vanuatu",
    		  lifeExpectancy: 70.47,
    		  demographics: [80126, 64634, 50207, 39556, 28333, 19760, 10910, 4727, 1629],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Respiratory diseases', 'Digestive diseases', 'Lower respiratory infections', 'Diabetes', 'Neonatal disorders', 'Kidney disease', 'Liver diseases', 'Road injuries'],
    		  majorDeaths: [797, 274, 146, 130, 120, 94, 87, 67, 59, 52],
    		  diseaseNames: ['Cardiovascular diseases', 'Diarrhea & common infectious diseases', 'Diabetes, blood, & endocrine diseases', 'Neonatal disorders', 'Cancers', 'Respiratory diseases', 'Other NCDs', 'Unintentional injuries', 'Digestive diseases', 'Musculoskeletal disorders'],
    		  diseaseDALYs: [22223, 12105, 10112, 8331, 8231, 6302, 6104, 5833, 4745, 3980],
    		  riskFactors: ['High blood pressure', 'High blood sugar', 'Obesity', 'Air pollution (outdoor & indoor)', 'High cholesterol', 'Smoking', 'Diet low in fruits', 'Diet low in vegetables', 'Child wasting', 'Diet high in salt'],
    		  riskDALYs: [14567, 13135, 10947, 8110, 7425, 7106, 4631, 3783, 3261, 2428] },
    		 {id: 161,
    		  name: "Venezuela",
    		  lifeExpectancy: 72.06,
    		  demographics: [5161179, 5131622, 4293108, 4112119, 3551367, 2964615, 1955306, 946456, 400056],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Homicide', 'Diabetes', 'Kidney disease', 'Road injuries', 'Dementia', 'Digestive diseases', 'Respiratory diseases', 'Lower respiratory infections', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [52708, 30238, 14760, 8670, 8403, 6988, 6898, 6881, 5694, 5184, 11],
    		  diseaseNames: ['Cardiovascular diseases', 'Interpersonal violence', 'Cancers', 'Diabetes, blood, & endocrine diseases', 'Neonatal disorders', 'Mental and substance use disorders', 'Other NCDs', 'Neurological disorders', 'Transport injuries', 'Musculoskeletal disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1039079, 868219, 779521, 639505, 499148, 436324, 413955, 410885, 409658, 399136, 186],
    		  riskFactors: ['Obesity', 'High blood pressure', 'High blood sugar', 'Smoking', 'High cholesterol', 'Air pollution (outdoor & indoor)', 'Diet low in fruits', 'Diet low in vegetables', 'Diet high in salt', 'Drug use', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [762035, 749717, 686646, 426608, 301614, 252091, 161369, 145538, 118144, 113563, 186] },
    		 {id: 162,
    		  name: "Vietnam",
    		  lifeExpectancy: 75.4,
    		  demographics: [15416497, 13451055, 15886425, 15977005, 13383787, 10911362, 6922468, 2640054, 1873454],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Respiratory diseases', 'Digestive diseases', 'Dementia', 'Diabetes', 'Liver diseases', 'Road injuries', 'Lower respiratory infections', 'Tuberculosis', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [201137, 120617, 35946, 29614, 28274, 23439, 22607, 21431, 18137, 17594, 0],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Musculoskeletal disorders', 'Diabetes, blood, & endocrine diseases', 'Neurological disorders', 'Other NCDs', 'Unintentional injuries', 'Transport injuries', 'Mental and substance use disorders', 'Diarrhea & common infectious diseases', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [4127692, 3149728, 1682582, 1573487, 1329423, 1253509, 1236854, 1231032, 1208151, 1133110, 0],
    		  riskFactors: ['High blood pressure', 'High blood sugar', 'Smoking', 'Air pollution (outdoor & indoor)', 'Obesity', 'Diet low in fruits', 'High cholesterol', 'Diet high in salt', 'Drug use', 'Secondhand smoke', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [2694716, 2423017, 2329745, 1363548, 953163, 929387, 794256, 787186, 650700, 441172, 0] },
    		 {id: 163,
    		  name: "World",
    		  lifeExpectancy: 72.58,
    		  demographics: [1339127564, 1244883537, 1194975548, 1132908777, 967210641, 816097736, 575804788, 299355359, 143104251],
    		  majorCauses: ['Cardiovascular diseases', 'Cancers', 'Respiratory diseases', 'Lower respiratory infections', 'Dementia', 'Digestive diseases', 'Neonatal disorders', 'Diarrheal diseases', 'Diabetes', 'Liver diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [17790949, 9556245, 3914196, 2558606, 2514619, 2377685, 1783770, 1569556, 1369849, 1322868, 350212],
    		  diseaseNames: ['Cardiovascular diseases', 'Cancers', 'Diarrhea & common infectious diseases', 'Neonatal disorders', 'Musculoskeletal disorders', 'Diabetes, blood, & endocrine diseases', 'Other NCDs', 'Mental and substance use disorders', 'Respiratory diseases', 'Neurological disorders', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [362381389, 230815088, 229961383, 191193185, 136350616, 133747830, 123452995, 121240264, 111041442, 109462440, 5601995],
    		  riskFactors: ['High blood pressure', 'Smoking', 'High blood sugar', 'Air pollution (outdoor & indoor)', 'Obesity', 'Child wasting', 'High cholesterol', 'Diet high in salt', 'Diet low in fruits', 'Unsafe water source', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [215645558, 182157003, 167407681, 148834208, 144091083, 95632517, 93844026, 69981368, 64856023, 64282494, 5601995] },
    		 {id: 164,
    		  name: "Yemen",
    		  lifeExpectancy: 66.12,
    		  demographics: [7957248, 6628518, 5663615, 3953524, 2239232, 1382738, 848627, 387468, 100952],
    		  majorCauses: ['Cardiovascular diseases', 'Neonatal disorders', 'Conflict', 'Cancers', 'Road injuries', 'Diarrheal diseases', 'Lower respiratory infections', 'Respiratory diseases', 'Digestive diseases', 'Dementia', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [53367, 18040, 16811, 11942, 9556, 8125, 6366, 4968, 3490, 2672, 49],
    		  diseaseNames: ['Neonatal disorders', 'Cardiovascular diseases', 'Diarrhea & common infectious diseases', 'Conflict and terrorism', 'Other NCDs', 'Nutritional deficiencies', 'Transport injuries', 'Mental and substance use disorders', 'Diabetes, blood, & endocrine diseases', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [1718808, 1355173, 1178751, 1006373, 896708, 855459, 598635, 485971, 459085, 415361, 1077],
    		  riskFactors: ['Child wasting', 'High blood pressure', 'Iron deficiency', 'Unsafe water source', 'Obesity', 'Air pollution (outdoor & indoor)', 'High blood sugar', 'High cholesterol', 'Smoking', 'Vitamin A deficiency', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [831197, 701666, 686920, 546393, 459939, 459135, 435825, 422401, 370118, 365007, 1077] },
    		 {id: 165,
    		  name: "Zambia",
    		  lifeExpectancy: 63.89,
    		  demographics: [5569170, 4426210, 3069086, 2117552, 1347824, 726745, 386102, 173103, 45242],
    		  majorCauses: ['HIV/AIDS', 'Cardiovascular diseases', 'Neonatal disorders', 'Lower respiratory infections', 'Cancers', 'Tuberculosis', 'Diarrheal diseases', 'Digestive diseases', 'Malaria', 'Liver diseases', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [21807, 12157, 9688, 8979, 8826, 8307, 7748, 5040, 4673, 3257, 7],
    		  diseaseNames: ['HIV/AIDS and tuberculosis', 'Diarrhea & common infectious diseases', 'Neonatal disorders', 'Other NCDs', 'Malaria & neglected tropical diseases', 'Nutritional deficiencies', 'Cardiovascular diseases', 'Cancers', 'Diabetes, blood, & endocrine diseases', 'Unintentional injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [2030052, 1707416, 900812, 502967, 391788, 334898, 319041, 302693, 253262, 234132, 164],
    		  riskFactors: ['Child wasting', 'Unsafe water source', 'Air pollution (outdoor & indoor)', 'Unsafe sanitation', 'High blood sugar', 'Vitamin A deficiency', 'High blood pressure', 'Child stunting', 'Smoking', 'Obesity', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [631163, 411032, 344582, 309455, 221962, 182199, 176329, 130440, 126593, 118268, 164] },
    		 {id: 166,
    		  name: "Zimbabwe",
    		  lifeExpectancy: 61.49,
    		  demographics: [4312155, 3456516, 2462905, 1862792, 1205778, 674792, 410758, 196977, 62799],
    		  majorCauses: ['Cardiovascular diseases', 'HIV/AIDS', 'Lower respiratory infections', 'Tuberculosis', 'Cancers', 'Neonatal disorders', 'Diarrheal diseases', 'Respiratory diseases', 'Digestive diseases', 'Nutritional deficiencies', 'COVID-19 until May 27, 2020'],
    		  majorDeaths: [16977, 16065, 12370, 11958, 11440, 8412, 4603, 3412, 3387, 3158, 4],
    		  diseaseNames: ['HIV/AIDS and tuberculosis', 'Diarrhea & common infectious diseases', 'Neonatal disorders', 'Cardiovascular diseases', 'Cancers', 'Nutritional deficiencies', 'Diabetes, blood, & endocrine diseases', 'Unintentional injuries', 'Other NCDs', 'Transport injuries', 'COVID-19 until May 27, 2020'],
    		  diseaseDALYs: [2112674, 1418231, 804919, 470598, 358516, 324526, 300375, 249593, 240049, 180995, 84],
    		  riskFactors: ['Child wasting', 'Air pollution (outdoor & indoor)', 'High blood sugar', 'High blood pressure', 'Smoking', 'Unsafe water source', 'Obesity', 'Unsafe sanitation', 'Vitamin A deficiency', 'Diet low in fruits', 'COVID-19 until May 27, 2020'],
    		  riskDALYs: [543888, 428451, 339950, 279958, 268280, 263176, 204466, 181818, 115425, 102441, 84] },
    		],
      });

    // version = 2020-05-29 13:02:59;

    const chineseDictStore = readable({ 
    	app: {
    		 mainTitle: "COVID计算器",
    		 subtitle: "一种可视工具，用于探索和分析COVID-19的潜在影响",
    		 tabItem0: "死亡率按年龄分布",
    		 tabItem1: "其它数据与估值",
    		 tabItem2: "风险按国家分布",
    		 tabItem3: "贫困率估值",
    		 tabItem4: "死亡人数估值",
    		 tabItem5: "假设情况",
    		 tabItem6: "释例",
    		 location: "位置",
    		 selectLocation: "选择地点",
    		 locationDescription: "各国COVID-19的影响",
    		 infectionRate: "感染率",
    		 infectionRateDescription: "感染新型冠状病毒总人口比例",
    		 over60InfectionRate: "60岁以上感染率",
    		 below60InfectionRate: "60岁以下感染率",
    		 over60Description: "60岁以上感染新型冠状病毒的人口比例。",
    		 proportionIsThen: "60岁以下感染的人口比例",
    		 proportionIsThenDescription: "因为这取决于总体感染率和60岁以上人群的感染率。",
    		 basedOn: "基于",
    		 basedOnContinued1: "死亡率和",
    		 basedOnContinued2: "的年龄分布和其他选定的输入参数，预计数字",
    		 basedOnContinued3: "被感染",
    		 basedOnContinued4: "死亡或",
    		 basedOnContinued5: "损失的寿命年数",
    		 compareWithOtherCaption1: "估计冠状病毒死亡人数可能跨越数年。",
    		 compareWithOtherCaption2: "其他原因导致的死亡人数为2017年数据。资料来源：",
    		 compareWithOtherCaption3: "因COVID-19确认死亡人数至2020年5月27日。资料来源：",
    		 compareWithOtherCaption4: "因其他原因导致寿命损失年数为2017年数据。资料来源：",
    		 compareWithOtherCaption5: "直到2020年5月27日，由于COVID-19导致失去的寿命年数。资料来源：",
    		 authorsCalculations: "和作者的计算。",
    		 compareWithOtherCaption7: "因其他原因而导致的寿命损失年数为2017年数据。资料来源：",
    		 proportionOver60ByCountry: "按国家划分的60岁以上风险人群的比例",
    		 lowIncomeRiskByCountry: "按国家划分的60岁以上人口的比例",
    		 mapCaption: "您可以将鼠标悬停在图例项上以进行选择。您可以放大和缩小地图。然后将鼠标悬停在地图上即可获取有关其代表的国家/地区的信息。",
    		 projectedPovery: "按国家分布预计人口增加，这是由于冠状病毒对世界经济的影响，特别对于生活在极端贫困中的人口，指每天低于1.90美元的国际贫困线的收入。",
    		 sources: "资料来源：",
    		 projectedPoveryByRegion: "由于冠状病毒对世界经济的影响，预计贫困地区会增加。",
    		 projectionsCaption: "COVID-19的总死亡人数预测。单击图例以选择或取消选择国家。",
    		 source: "资源：",
    		 reset: "重置",
    		 infectedTitle: "按年龄分布潜在感染人口",
    		 deathsTitle: "按年龄划分潜在死亡人口",
    		 age: "年龄",
    		 infected: "已感染",
    		 deaths: "死亡人数",
    		 projectionsTitle: "由于COVID-19，潜在的数百万人陷入极端贫困",
    		 date: "日期",
    		 totDeaths: "死亡总数",
    		 totDeathsProj: "总死亡人数（预计）",
    		 titleListMain: "与COVID-19比较",
    		 titleListName: "原因",
    		 titleListRisk: "风险",
    		 titleListNumber: "在",
    		 yearsOfLifeLost: "损失寿命年数",
    		 inCountry: "在",
    		 compareItems0: "死亡原因",
    		 compareItems1: "损失寿命原因",
    		 compareItems2: "风险与寿命减短",
    		 covid19Cause: "COVID-19（估算）",
    		 enterDescribtion: "输入",
    		 yrsOfLifeLost: "预期寿命损失",
    		 yrsOfLifeLostCosts: "潜在成本",
    		 scenariosDescription: "场景描述",
    		 country: "国家",
    		 region: "区域",
    		 people: "人",
    		 india: "印度",
    		 nigeria: "尼日利亚",
    		 drCongo: "刚果民主共和国",
    		 ethiopia: "埃塞俄比亚",
    		 bangladesh: "孟加拉国",
    		 tanzania: "坦桑尼亚",
    		 madagascar: "马达加斯加",
    		 indonesia: "印尼",
    		 kenya: "肯尼亚",
    		 mozambique: "莫桑比克",
    		 uganda: "乌干达",
    		 southAfrica: "南非",
    		 subSahAfrica: "撒哈拉以南非洲",
    		 southAsia: "南亚",
    		 eastAsiaPacific: "东亚与太平洋",
    		 latinCaribbean: "拉丁美洲和加勒比海",
    		 middleEastNorthAfrica: "中东和北非",
    		 europeCentralAsia: "欧洲与中亚",
    		 northAmerica: "北美",
    		 mainProjRegions: "死亡原因",
    		 nameProjRegions: "损失寿命原因",
    		 numberProjRegions: "风险与寿命减短",
    		 fatalityRates: "死亡率",
    		 fatalityRatesDescription: "选择新的冠状病毒感染导致死亡的风险的估计值，各国之间的估计值会随时间而变化，更广泛的测试可以降低CFR值。",
    		 varyFRs: "改变选择的死亡率",
    		 varyFRsDescription1: "尝试增加死亡风险，例如到50％，适用于低收入国家或不堪重负的医疗保健。",
    		 varyFRsDescription2: "或减少，例如达到-50％，以期望得到更好的治疗和更好的医疗保健。",
    		 resetDescription: "将所有输入参数设置回其初始值。",
    		 elimination: "消除COVID-19的可能性",
    		 eliminationDescription1: "在感染前完全消除COVID-19疾病的可能性",
    		 eliminationDescription2: "人口。",
    		 infectionUntil: "直至消除的感染率",
    		 infectionUntilDescription: "甚至在完全消除的情况下仍然受到感染的人口比例。注意：首先要增加消除的可能性，此参数才能生效。",
    		 hideExport: "隐藏导出",
    		 export: "导出",
    		 exportDescription: "以JSON格式导出COVID-19的假设情景",
    		 export1: "隐藏导出",
    		 scenariosCaption: "您可以设置描述假设情景的输入参数，并将其添加到表格中进行比较，其中有3个针对所选位置和死亡风险的假设情景示例，应谨慎解释结果，请参阅示例解释。",
    		 exampleScenario0: "场景0：不做任何事情，作为基准",
    		 exampleScenario1: "方案1：保护60岁以上的人们，通过暴露60岁以下的人们进行补偿，同时考虑失去的寿命",
    		 exampleScenario2: "方案2：消除90％，同时考虑剩下的钱",
    		 mapTitle: "COVID-19各国风险",
    		 mapItems0: "按国家划分的60岁以上人口的比例",
    		 mapItems1: "按国家划分的60岁以上人口的比例",
    		 povertyItems0: "按国家",
    		 povertyItems1: "按地区",
    		},
    	fatalityRisks: [
    		 {id: 0,
    		  source: "帝国理工学院-IFR",
    		  ftr: [0.002, 0.006, 0.03, 0.08, 0.15, 0.6, 2.2, 5.1, 9.3] },
    		 {id: 1,
    		  source: "中国疾病预防控制中心-CFR",
    		  ftr: [0, 0.2, 0.2, 0.2, 0.4, 1.3, 3.6, 8, 14.8] },
    		 {id: 2,
    		  source: "韩国CDC-CFR",
    		  ftr: [0, 0, 0, 0.11, 0.08, 0.5, 1.8, 6.3, 13] },
    		 {id: 3,
    		  source: "JAMA意大利-CFR",
    		  ftr: [0, 0, 0, 0.3, 0.4, 1, 3.5, 12.8, 20.2] },
    		 {id: 4,
    		  source: "MISAN西班牙-CFR",
    		  ftr: [0, 0, 0.22, 0.14, 0.3, 0.4, 1.9, 4.8, 15.6] },
    		],
    	compareOptions: [
    		 {id: 0,
    		  compareWith: "其他主要死因" },
    		 {id: 1,
    		  compareWith: "疾病与寿命减短" },
    		 {id: 2,
    		  compareWith: "风险与寿命减短" },
    		 {id: 3,
    		  compareWith: "世界其他国家" },
    		],
    	countries: [
    		 {id: 0,
    		  name: "阿富汗",
    		  lifeExpectancy: 64.83,
    		  demographics: [11040694, 9635671, 6779023, 4381488, 2846500, 1773768, 1020779, 458747, 105087],
    		  majorCauses: ['其他非传染性疾病', '新生儿疾病', '呼吸疾病', '其他传染病', '结核', '呼吸疾病', '肝病', '消化系统疾病', '吸毒障碍', '营养不足', '肥胖'],
    		  majorDeaths: [56119, 27522, 21431, 16670, 8692, 6917, 6589, 6176, 6092, 5978, 220],
    		  diseaseNames: ['自残', '新生儿疾病', '腹泻和常见传染病', '其他非传染性疾病', '运输伤害', '冲突与恐怖主义', '疟疾和被忽视的热带病', '其他传染病', '艾滋病毒/艾滋病与结核病', 'COVID-19，直到2020年5月27日', '肥胖'],
    		  diseaseDALYs: [2949759, 2461244, 2128416, 1596954, 1539479, 975117, 797604, 601374, 551807, 542777, 4967],
    		  riskFactors: ['水果饮食偏少', '空气污染（室内和室外）', '二手烟', '高胆固醇', '饮食含盐量高', '非独家母乳喂养', '缺铁', '儿童发育不良', '高血糖', '用药', '肥胖'],
    		  riskDALYs: [1341395, 1306178, 901181, 866085, 807902, 689543, 523650, 475516, 455174, 378229, 4967] },
    		 {id: 1,
    		  name: "阿尔巴尼亚",
    		  lifeExpectancy: 78.57,
    		  demographics: [333920, 375307, 481846, 377350, 330419, 392129, 317994, 189973, 81975],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '呼吸疾病', '肌肉骨骼疾病', '呼吸疾病', 'COVID-19，直到2020年5月27日', '心血管疾病', '结核', '糖尿病', '肥胖'],
    		  majorDeaths: [12145, 4345, 1337, 736, 489, 382, 363, 309, 248, 234, 33],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '疟疾和被忽视的热带病', '营养不足', '神经系统疾病', '运输伤害', '冲突与恐怖主义', '新生儿疾病', '呼吸疾病', '肥胖'],
    		  diseaseDALYs: [206331, 100981, 64286, 53506, 51865, 38507, 37568, 35191, 27693, 24834, 483],
    		  riskFactors: ['二手烟', '维生素A缺乏症', '非独家母乳喂养', '高胆固醇', '饮食含盐量高', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '用药', '高血压', '不安全的水源', '肥胖'],
    		  riskDALYs: [128064, 99946, 69372, 57453, 55471, 37120, 29156, 16674, 13809, 10129, 483] },
    		 {id: 2,
    		  name: "阿尔及利亚",
    		  lifeExpectancy: 76.88,
    		  demographics: [9533023, 6466198, 6759761, 7193824, 5249023, 3682969, 2430965, 1179741, 557550],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '结核', '新生儿疾病', '呼吸疾病', '营养不足', '肌肉骨骼疾病', '呼吸疾病', 'COVID-19，直到2020年5月27日', '肥胖'],
    		  majorDeaths: [79389, 21656, 8175, 6905, 6511, 5508, 5202, 4800, 4724, 4577, 617],
    		  diseaseNames: ['其他非传染性疾病', '运输伤害', '冲突与恐怖主义', '新生儿疾病', '肝病', '神经系统疾病', '其他传染病', '营养不足', '艾滋病毒/艾滋病与结核病', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [1577873, 857655, 809853, 773630, 767622, 694410, 601103, 581302, 441546, 404974, 10657],
    		  riskFactors: ['非独家母乳喂养', '二手烟', '高胆固醇', '维生素A缺乏症', '饮食含盐量高', '水果饮食偏少', '低体力活动', '用药', '高血压', '不安全的水源', '肥胖'],
    		  riskDALYs: [956409, 835084, 810448, 541145, 412426, 388376, 354830, 213070, 163252, 146851, 10657] },
    		 {id: 3,
    		  name: "安哥拉",
    		  lifeExpectancy: 61.15,
    		  demographics: [10645848, 7583998, 5137763, 3567431, 2316948, 1419872, 744701, 323212, 85526],
    		  majorCauses: ['其他非传染性疾病', '新生儿疾病', '消化系统疾病', '产妇疾病', '呼吸疾病', '其他传染病', '自杀', '冲突', '肌肉骨骼疾病', '结核', '肥胖'],
    		  majorDeaths: [21785, 17882, 17390, 14585, 14508, 12040, 11409, 8431, 8274, 6781, 4],
    		  diseaseNames: ['自残', '新生儿疾病', 'COVID-19，直到2020年5月27日', '运输伤害', '糖尿病，血液和内分泌疾病', '人际暴力', '其他非传染性疾病', '疟疾和被忽视的热带病', '艾滋病毒/艾滋病与结核病', '其他传染病', '肥胖'],
    		  diseaseDALYs: [2327125, 1715532, 1024134, 829609, 816838, 737124, 587699, 479827, 474564, 395113, 91],
    		  riskFactors: ['空气污染（室内和室外）', '缺铁', '不安全的卫生', '水果饮食偏少', '高胆固醇', '儿童发育不良', '二手烟', '高血糖', '抽烟', '维生素A缺乏症', '肥胖'],
    		  riskDALYs: [1441565, 1065429, 706854, 558639, 474834, 471166, 388213, 342714, 308832, 291488, 91] },
    		 {id: 4,
    		  name: "阿根廷",
    		  lifeExpectancy: 76.67,
    		  demographics: [7431085, 7110303, 6989730, 6393900, 5596155, 4365874, 3478296, 2234324, 1181008],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '呼吸疾病', '自然灾害', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '营养不足', '心血管疾病', '结核', '肥胖'],
    		  majorDeaths: [105777, 74066, 31058, 18992, 18617, 14906, 10834, 9345, 7346, 6457, 484],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '神经系统疾病', '冲突与恐怖主义', '疟疾和被忽视的热带病', '运输伤害', '营养不足', '自残', '呼吸疾病', '肥胖'],
    		  diseaseDALYs: [1850384, 1636213, 1070031, 821073, 755647, 600218, 586346, 572018, 566705, 485965, 7111],
    		  riskFactors: ['维生素A缺乏症', '高胆固醇', '非独家母乳喂养', '二手烟', '饮食含盐量高', '水果饮食偏少', '低体力活动', '饮食中蔬菜含量低', '用药', 'COVID-19，直到2020年5月27日', '肥胖'],
    		  riskDALYs: [1377562, 1041499, 1039208, 849828, 466427, 374352, 209665, 188972, 182487, 181170, 7111] },
    		 {id: 5,
    		  name: "亞美尼亞",
    		  lifeExpectancy: 75.09,
    		  demographics: [421267, 361638, 430188, 495062, 344211, 375592, 312416, 122717, 94637],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '肌肉骨骼疾病', '自然灾害', '呼吸疾病', '营养不足', '心血管疾病', '呼吸疾病', 'COVID-19，直到2020年5月27日', '脑膜炎', '肥胖'],
    		  majorDeaths: [13631, 5756, 1720, 1357, 1311, 1142, 1107, 501, 430, 302, 91],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '冲突与恐怖主义', '肝病', '营养不足', '运输伤害', '疟疾和被忽视的热带病', '肌肉骨骼疾病', '神经系统疾病', '呼吸疾病', '肥胖'],
    		  diseaseDALYs: [232712, 134659, 70952, 55930, 50354, 50085, 45363, 45321, 42045, 33336, 1338],
    		  riskFactors: ['二手烟', '高胆固醇', '维生素A缺乏症', '非独家母乳喂养', '饮食含盐量高', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '用药', '高血压', '不安全的水源', '肥胖'],
    		  riskDALYs: [150086, 147509, 126246, 106265, 76463, 61605, 33567, 31703, 26363, 17455, 1338] },
    		 {id: 6,
    		  name: "澳大利亚",
    		  lifeExpectancy: 83.44,
    		  demographics: [3280238, 3079378, 3401525, 3662343, 3282597, 3093653, 2605017, 1768659, 1029790],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '呼吸疾病', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '呼吸疾病', '营养不足', '脑膜炎', '糖尿病', '肥胖'],
    		  majorDeaths: [52101, 50254, 17119, 10822, 6112, 4455, 4451, 3755, 3055, 2328, 102],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '肝病', '神经系统疾病', '营养不足', '疟疾和被忽视的热带病', '呼吸疾病', '冲突与恐怖主义', '运输伤害', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [970836, 694335, 645111, 549355, 438634, 432478, 305003, 292021, 244224, 147752, 1386],
    		  riskFactors: ['维生素A缺乏症', '非独家母乳喂养', '二手烟', '高胆固醇', '饮食含盐量高', '低体力活动', '水果饮食偏少', '用药', '不安全的水源', '饮食中蔬菜含量低', '肥胖'],
    		  riskDALYs: [522203, 490967, 365301, 358549, 199475, 186884, 93142, 87901, 63860, 58260, 1386] },
    		 {id: 7,
    		  name: "奥地利",
    		  lifeExpectancy: 81.54,
    		  demographics: [863022, 877100, 1124426, 1224528, 1195561, 1402944, 1000416, 789863, 477248],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '呼吸疾病', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '营养不足', '心血管疾病', '脑膜炎', '糖尿病', '肥胖'],
    		  majorDeaths: [31386, 21745, 7481, 3383, 3227, 2754, 2059, 1860, 1422, 994, 643],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '肝病', '营养不足', '神经系统疾病', '冲突与恐怖主义', '疟疾和被忽视的热带病', '运输伤害', '肌肉骨骼疾病', '呼吸疾病', '肥胖'],
    		  diseaseDALYs: [412725, 410715, 249516, 205240, 164586, 148028, 122133, 119273, 104957, 103622, 8364],
    		  riskFactors: ['维生素A缺乏症', '二手烟', '高胆固醇', '非独家母乳喂养', '饮食含盐量高', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '低体力活动', '不安全的水源', '用药', '肥胖'],
    		  riskDALYs: [289316, 247866, 234711, 198890, 118630, 69586, 40222, 38446, 32621, 32476, 8364] },
    		 {id: 8,
    		  name: "阿塞拜疆",
    		  lifeExpectancy: 73.0,
    		  demographics: [1680978, 1317438, 1666611, 1724388, 1263973, 1281704, 743188, 232553, 136886],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '肌肉骨骼疾病', '心血管疾病', '呼吸疾病', '自然灾害', '呼吸疾病', '新生儿疾病', '营养不足', 'COVID-19，直到2020年5月27日', '肥胖'],
    		  majorDeaths: [40266, 10954, 3940, 3141, 3055, 2482, 2340, 2274, 1752, 1169, 52],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '自残', '新生儿疾病', '运输伤害', '冲突与恐怖主义', '疟疾和被忽视的热带病', '肝病', '营养不足', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [821522, 314922, 242153, 241789, 193598, 185831, 167301, 151704, 146958, 135223, 929],
    		  riskFactors: ['二手烟', '高胆固醇', '非独家母乳喂养', '维生素A缺乏症', '饮食含盐量高', '水果饮食偏少', '用药', 'COVID-19，直到2020年5月27日', '高血压', '空气污染（室内和室外）', '肥胖'],
    		  riskDALYs: [510416, 425013, 362881, 334822, 279459, 197950, 127029, 125321, 104163, 86129, 929] },
    		 {id: 9,
    		  name: "巴哈马",
    		  lifeExpectancy: 73.92,
    		  demographics: [54179, 64391, 65619, 54838, 56558, 48211, 27694, 13163, 4833],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '营养不足', '产妇疾病', '恐怖主义', '呼吸疾病', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '自然灾害', '结核', '肥胖'],
    		  majorDeaths: [801, 530, 128, 114, 107, 105, 104, 93, 92, 60, 11],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '冲突与恐怖主义', '肝病', '消化系统疾病', '神经系统疾病', '运输伤害', 'COVID-19，直到2020年5月27日', '营养不足', '自残', '肥胖'],
    		  diseaseDALYs: [18194, 13979, 12275, 6281, 6124, 6111, 5713, 5541, 5507, 4614, 192],
    		  riskFactors: ['非独家母乳喂养', '二手烟', '高胆固醇', '饮食含盐量高', '维生素A缺乏症', '水果饮食偏少', '饮食中蔬菜含量低', '低体力活动', '不安全的水源', 'COVID-19，直到2020年5月27日', '肥胖'],
    		  riskDALYs: [13121, 11928, 10905, 4719, 4611, 3432, 1440, 1366, 1195, 982, 192] },
    		 {id: 10,
    		  name: "巴林",
    		  lifeExpectancy: 77.29,
    		  demographics: [215191, 177424, 318510, 464806, 244359, 137046, 61268, 16906, 5654],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '营养不足', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '结核', '呼吸疾病', '自然灾害', '呼吸疾病', '心血管疾病', '肥胖'],
    		  majorDeaths: [961, 553, 529, 143, 133, 128, 114, 110, 95, 84, 14],
    		  diseaseNames: ['冲突与恐怖主义', '肝病', '神经系统疾病', '其他非传染性疾病', '营养不足', '运输伤害', '其他传染病', '新生儿疾病', '呼吸疾病', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [39073, 32240, 29024, 26949, 19107, 18531, 15791, 10408, 10052, 9970, 339],
    		  riskFactors: ['非独家母乳喂养', '高胆固醇', '二手烟', '水果饮食偏少', '低体力活动', '维生素A缺乏症', '饮食含盐量高', '高血压', '用药', '不安全的水源', '肥胖'],
    		  riskDALYs: [36296, 34551, 18126, 14303, 14207, 12588, 11243, 3904, 3635, 3064, 339] },
    		 {id: 11,
    		  name: "孟加拉国",
    		  lifeExpectancy: 72.59,
    		  demographics: [29140694, 30882112, 29600040, 26177061, 20143207, 14480320, 6892779, 4064814, 1665146],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '新生儿疾病', '肌肉骨骼疾病', '呼吸疾病', '营养不足', '消化系统疾病', '心血管疾病', '自然灾害', '肥胖'],
    		  majorDeaths: [320563, 99302, 82276, 53449, 44992, 38521, 34564, 30147, 26390, 17256, 522],
    		  diseaseNames: ['其他非传染性疾病', '新生儿疾病', '自残', '肝病', '其他传染病', '神经系统疾病', '冲突与恐怖主义', '呼吸疾病', '疟疾和被忽视的热带病', '运输伤害', '肥胖'],
    		  diseaseDALYs: [7263655, 5707014, 4266872, 2891058, 2718396, 2592864, 2488098, 2370531, 2224279, 2204327, 9574],
    		  riskFactors: ['水果饮食偏少', '二手烟', '高胆固醇', '维生素A缺乏症', '用药', '饮食含盐量高', '非独家母乳喂养', '空气污染（室内和室外）', '饮食中蔬菜含量低', 'COVID-19，直到2020年5月27日', '肥胖'],
    		  riskDALYs: [3871076, 3578773, 2726100, 2320793, 1895086, 1668575, 1459444, 1428511, 1260828, 998683, 9574] },
    		 {id: 12,
    		  name: "巴巴多斯",
    		  lifeExpectancy: 79.19,
    		  demographics: [30994, 36993, 37512, 37294, 39394, 40137, 32664, 19336, 12696],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '营养不足', '呼吸疾病', '自然灾害', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '呼吸疾病', '心血管疾病', '恐怖主义', '肥胖'],
    		  majorDeaths: [840, 677, 242, 183, 171, 94, 90, 63, 39, 32, 7],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '冲突与恐怖主义', '肝病', '营养不足', '神经系统疾病', '运输伤害', '自残', '肌肉骨骼疾病', '新生儿疾病', '肥胖'],
    		  diseaseDALYs: [14552, 14043, 11241, 6037, 5473, 5081, 4386, 3631, 2854, 2533, 94],
    		  riskFactors: ['高胆固醇', '非独家母乳喂养', '二手烟', '维生素A缺乏症', '水果饮食偏少', '饮食含盐量高', '用药', '饮食中蔬菜含量低', '不安全的水源', '低体力活动', '肥胖'],
    		  riskDALYs: [12710, 11385, 9034, 4139, 3869, 2945, 1803, 1372, 1259, 883, 94] },
    		 {id: 13,
    		  name: "白俄罗斯",
    		  lifeExpectancy: 74.79,
    		  demographics: [1134208, 910479, 1147255, 1510155, 1278833, 1374474, 1190629, 533029, 373347],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '肌肉骨骼疾病', '痴呆', '心血管疾病', '脑膜炎', '呼吸疾病', '呼吸疾病', '结核', '肥胖'],
    		  majorDeaths: [73014, 18558, 6550, 4498, 2803, 2533, 2357, 2065, 1175, 990, 208],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '疟疾和被忽视的热带病', '肝病', '营养不足', '肌肉骨骼疾病', '神经系统疾病', '运输伤害', '冲突与恐怖主义', '精神和物质使用障碍', '肥胖'],
    		  diseaseDALYs: [1238969, 440057, 285451, 218899, 197375, 168700, 162164, 123781, 114503, 89387, 2938],
    		  riskFactors: ['二手烟', '维生素A缺乏症', '饮食含盐量高', '非独家母乳喂养', '高胆固醇', '水果饮食偏少', '用药', 'COVID-19，直到2020年5月27日', '不安全的水源', '低体力活动', '肥胖'],
    		  riskDALYs: [813813, 576719, 492857, 471979, 288461, 176297, 173117, 143406, 89321, 62880, 2938] },
    		 {id: 14,
    		  name: "比利时",
    		  lifeExpectancy: 81.63,
    		  demographics: [1305219, 1298970, 1395385, 1498535, 1524152, 1601891, 1347696, 908725, 658753],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '肥胖', '呼吸疾病', '呼吸疾病', '肌肉骨骼疾病', '脑膜炎', 'COVID-19，直到2020年5月27日', '心血管疾病', '营养不足'],
    		  majorDeaths: [32194, 30782, 10550, 9334, 6804, 5669, 5111, 2132, 2097, 2004, 1436],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '肝病', '营养不足', '神经系统疾病', '疟疾和被忽视的热带病', '呼吸疾病', '冲突与恐怖主义', '运输伤害', '肥胖', '肌肉骨骼疾病'],
    		  diseaseDALYs: [577400, 454391, 354782, 293127, 224452, 180671, 164776, 158502, 140478, 119438, 118342],
    		  riskFactors: ['维生素A缺乏症', '高胆固醇', '二手烟', '非独家母乳喂养', '肥胖', '饮食含盐量高', '水果饮食偏少', '用药', '不安全的水源', '低体力活动', '高血压'],
    		  riskDALYs: [473420, 278047, 257958, 227091, 119438, 118510, 99170, 66362, 38847, 38280, 34819] },
    		 {id: 15,
    		  name: "伯利兹",
    		  lifeExpectancy: 74.62,
    		  demographics: [77702, 78150, 74346, 57769, 42878, 30626, 16843, 7912, 4124],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '营养不足', '呼吸疾病', '恐怖主义', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '产妇疾病', '结核', '呼吸疾病', '肥胖'],
    		  majorDeaths: [424, 277, 126, 111, 106, 92, 84, 81, 72, 69, 2],
    		  diseaseNames: ['其他非传染性疾病', '冲突与恐怖主义', '其他传染病', '新生儿疾病', '运输伤害', '消化系统疾病', '神经系统疾病', '疟疾和被忽视的热带病', '自残', '营养不足', '肥胖'],
    		  diseaseDALYs: [9830, 9614, 7583, 7367, 6049, 6027, 5975, 5561, 5539, 4996, 36],
    		  riskFactors: ['高胆固醇', '非独家母乳喂养', '二手烟', '维生素A缺乏症', '水果饮食偏少', '饮食含盐量高', '抽烟', '用药', '空气污染（室内和室外）', '低体力活动', '肥胖'],
    		  riskDALYs: [9631, 9251, 5961, 3571, 3449, 2288, 1745, 1482, 1423, 1253, 36] },
    		 {id: 16,
    		  name: "贝宁",
    		  lifeExpectancy: 61.77,
    		  demographics: [3529739, 2708314, 2001076, 1389287, 950137, 627369, 364348, 179593, 51287],
    		  majorCauses: ['新生儿疾病', '冲突', '其他非传染性疾病', '呼吸疾病', '消化系统疾病', '其他传染病', '结核', '自杀', '肌肉骨骼疾病', '呼吸疾病', '肥胖'],
    		  majorDeaths: [9627, 9433, 9221, 7565, 6383, 5434, 3093, 2890, 2629, 1983, 3],
    		  diseaseNames: ['自残', '新生儿疾病', '糖尿病，血液和内分泌疾病', '运输伤害', '人际暴力', '其他非传染性疾病', '冲突与恐怖主义', 'COVID-19，直到2020年5月27日', '艾滋病毒/艾滋病与结核病', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [1295131, 899739, 783500, 359850, 253199, 238944, 238353, 218491, 192950, 180157, 62],
    		  riskFactors: ['空气污染（室内和室外）', '缺铁', '水果饮食偏少', '不安全的卫生', '儿童发育不良', '二手烟', '高胆固醇', '高血糖', '非独家母乳喂养', '抽烟', '肥胖'],
    		  riskDALYs: [589619, 357407, 310177, 279407, 201743, 145002, 138640, 123773, 117511, 109285, 62] },
    		 {id: 17,
    		  name: "不丹",
    		  lifeExpectancy: 71.78,
    		  demographics: [126258, 137813, 154517, 134250, 86166, 57026, 35719, 21762, 9582],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '肌肉骨骼疾病', '新生儿疾病', '呼吸疾病', '心血管疾病', 'COVID-19，直到2020年5月27日', '消化系统疾病', '自然灾害', '肥胖'],
    		  majorDeaths: [1156, 488, 446, 255, 205, 180, 157, 136, 132, 125, 0],
    		  diseaseNames: ['其他非传染性疾病', '自残', '新生儿疾病', '肝病', '冲突与恐怖主义', '神经系统疾病', '疟疾和被忽视的热带病', '其他传染病', '运输伤害', '呼吸疾病', '肥胖'],
    		  diseaseDALYs: [26845, 24060, 23302, 15553, 14573, 14249, 13641, 13614, 13469, 12218, 0],
    		  riskFactors: ['二手烟', '高胆固醇', '水果饮食偏少', '非独家母乳喂养', '饮食含盐量高', '抽烟', '维生素A缺乏症', '用药', 'COVID-19，直到2020年5月27日', '饮食中蔬菜含量低', '肥胖'],
    		  riskDALYs: [15575, 12298, 11644, 10068, 9089, 8988, 7745, 5274, 4216, 3631, 0] },
    		 {id: 18,
    		  name: "玻利維亞",
    		  lifeExpectancy: 71.51,
    		  demographics: [2365890, 2289751, 2012188, 1605907, 1206917, 859703, 600549, 378817, 193379],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '呼吸疾病', '营养不足', '新生儿疾病', '自然灾害', '心血管疾病', '肥胖'],
    		  majorDeaths: [15275, 12195, 5360, 4078, 3165, 3122, 2903, 2826, 2651, 2215, 274],
    		  diseaseNames: ['自残', '其他非传染性疾病', '其他传染病', '新生儿疾病', '冲突与恐怖主义', '运输伤害', '神经系统疾病', '疟疾和被忽视的热带病', '肝病', '营养不足', '肥胖'],
    		  diseaseDALYs: [360435, 323003, 304397, 303329, 214670, 213058, 172883, 163508, 161009, 146546, 4392],
    		  riskFactors: ['高胆固醇', '非独家母乳喂养', '二手烟', '水果饮食偏少', '维生素A缺乏症', '空气污染（室内和室外）', '饮食含盐量高', '抽烟', '用药', '饮食中蔬菜含量低', '肥胖'],
    		  riskDALYs: [255825, 202319, 174854, 127408, 100318, 89251, 76483, 70730, 54745, 46823, 4392] },
    		 {id: 19,
    		  name: "波斯尼亚和黑塞哥维那",
    		  lifeExpectancy: 77.4,
    		  demographics: [306587, 351419, 409569, 468369, 448869, 508292, 452975, 235035, 119881],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '营养不足', '自然灾害', '呼吸疾病', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '心血管疾病', '呼吸疾病', '糖尿病', '肥胖'],
    		  majorDeaths: [18107, 8950, 2293, 1991, 1310, 1136, 604, 577, 360, 324, 149],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '冲突与恐怖主义', '肝病', '疟疾和被忽视的热带病', '营养不足', '神经系统疾病', '呼吸疾病', '运输伤害', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [314480, 202956, 96087, 76811, 71590, 67986, 49804, 45325, 40933, 39556, 2127],
    		  riskFactors: ['维生素A缺乏症', '高胆固醇', '二手烟', '非独家母乳喂养', '饮食含盐量高', '水果饮食偏少', '用药', 'COVID-19，直到2020年5月27日', '高血压', '不安全的水源', '肥胖'],
    		  riskDALYs: [215413, 199141, 198050, 137744, 93564, 77913, 45939, 41923, 29708, 23846, 2127] },
    		 {id: 20,
    		  name: "波札那",
    		  lifeExpectancy: 69.59,
    		  demographics: [535771, 462584, 397946, 359631, 247537, 141947, 100575, 45935, 11776],
    		  majorCauses: ['产妇疾病', '其他非传染性疾病', '其他传染病', '呼吸疾病', '营养不足', '消化系统疾病', '呼吸疾病', '自杀', '肌肉骨骼疾病', '新生儿疾病', '肥胖'],
    		  majorDeaths: [4102, 2548, 1487, 768, 668, 577, 510, 444, 438, 436, 1],
    		  diseaseNames: ['COVID-19，直到2020年5月27日', '自残', '冲突与恐怖主义', '其他非传染性疾病', '新生儿疾病', '其他传染病', '神经系统疾病', '营养不足', '肝病', '呼吸疾病', '肥胖'],
    		  diseaseDALYs: [290480, 73500, 56387, 54317, 47687, 39229, 34628, 25707, 25706, 25228, 20],
    		  riskFactors: ['高胆固醇', '非独家母乳喂养', '二手烟', '水果饮食偏少', '维生素A缺乏症', '缺铁', '空气污染（室内和室外）', '不安全的卫生', '低体力活动', '饮食含盐量高', '肥胖'],
    		  riskDALYs: [50246, 44707, 38344, 27484, 26951, 23734, 22767, 16393, 13684, 13563, 20] },
    		 {id: 21,
    		  name: "巴西",
    		  lifeExpectancy: 75.88,
    		  demographics: [29188180, 31633075, 34181400, 34436184, 28902917, 24026608, 16292185, 8401090, 3987880],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '自然灾害', '呼吸疾病', '肌肉骨骼疾病', '恐怖主义', '营养不足', '结核', '心血管疾病', '肥胖'],
    		  majorDeaths: [388268, 244969, 84073, 73419, 72746, 72556, 63825, 56474, 46282, 36269, 24512],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '神经系统疾病', '冲突与恐怖主义', '消化系统疾病', '营养不足', '运输伤害', '自残', '新生儿疾病', '肥胖'],
    		  diseaseDALYs: [8160380, 5945407, 4516692, 4060910, 3687892, 3645543, 3611498, 3460212, 2648390, 2616371, 395930],
    		  riskFactors: ['二手烟', '非独家母乳喂养', '维生素A缺乏症', '高胆固醇', '饮食含盐量高', '水果饮食偏少', '饮食中蔬菜含量低', '低体力活动', 'COVID-19，直到2020年5月27日', '抽烟', '肥胖'],
    		  riskDALYs: [4906211, 4890017, 4562909, 3414338, 2207263, 1617178, 1049247, 1024329, 949371, 845115, 395930] },
    		 {id: 22,
    		  name: "保加利亚",
    		  lifeExpectancy: 75.05,
    		  demographics: [662976, 671433, 724640, 971335, 1061668, 947156, 936053, 692820, 332035],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '肌肉骨骼疾病', '呼吸疾病', '心血管疾病', '营养不足', '呼吸疾病', 'COVID-19，直到2020年5月27日', '脑膜炎', '肥胖'],
    		  majorDeaths: [65619, 18734, 5945, 3543, 3299, 2043, 1584, 1549, 1447, 995, 133],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '疟疾和被忽视的热带病', '营养不足', '冲突与恐怖主义', '肌肉骨骼疾病', '呼吸疾病', '神经系统疾病', '运输伤害', '肥胖'],
    		  diseaseDALYs: [1099367, 435223, 175641, 170811, 161624, 144882, 116883, 107938, 107874, 89058, 1768],
    		  riskFactors: ['二手烟', '维生素A缺乏症', '非独家母乳喂养', '高胆固醇', '饮食含盐量高', '用药', 'COVID-19，直到2020年5月27日', '水果饮食偏少', '不安全的水源', '高血压', '肥胖'],
    		  riskDALYs: [722666, 559068, 443763, 326529, 319257, 174256, 168051, 167959, 67965, 64921, 1768] },
    		 {id: 23,
    		  name: "蒲隆地",
    		  lifeExpectancy: 61.58,
    		  demographics: [3785408, 2623579, 2004917, 1466422, 701174, 487477, 322819, 105870, 32911],
    		  majorCauses: ['自杀', '其他非传染性疾病', '冲突', '新生儿疾病', '呼吸疾病', '消化系统疾病', '其他传染病', '肌肉骨骼疾病', '产妇疾病', '人际暴力', '肥胖'],
    		  majorDeaths: [9099, 9011, 8659, 7482, 7407, 5397, 4711, 3412, 2620, 2603, 1],
    		  diseaseNames: ['自残', '糖尿病，血液和内分泌疾病', '新生儿疾病', 'COVID-19，直到2020年5月27日', '运输伤害', '人际暴力', '其他非传染性疾病', '其他传染病', '疟疾和被忽视的热带病', '冲突与恐怖主义', '肥胖'],
    		  diseaseDALYs: [1763666, 679542, 674414, 626305, 406552, 266914, 246428, 161672, 160437, 152196, 22],
    		  riskFactors: ['空气污染（室内和室外）', '水果饮食偏少', '缺铁', '不安全的卫生', '高胆固醇', '二手烟', '高血糖', '儿童发育不良', '维生素A缺乏症', '用药', '肥胖'],
    		  riskDALYs: [610582, 323545, 313197, 240297, 154991, 152765, 145961, 133758, 91457, 55690, 22] },
    		 {id: 24,
    		  name: "柬埔寨",
    		  lifeExpectancy: 69.82,
    		  demographics: [3522160, 3065792, 3101389, 2840783, 1393829, 1350228, 783099, 334192, 95070],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '肌肉骨骼疾病', '呼吸疾病', '心血管疾病', '呼吸疾病', '新生儿疾病', '结核', '自杀', '营养不足', '肥胖'],
    		  majorDeaths: [24913, 12663, 11446, 9866, 9018, 4429, 4094, 3981, 2998, 2756, 0],
    		  diseaseNames: ['自残', '其他非传染性疾病', '新生儿疾病', '肌肉骨骼疾病', '疟疾和被忽视的热带病', '其他传染病', '运输伤害', '心血管疾病', '肝病', '冲突与恐怖主义', '肥胖'],
    		  diseaseDALYs: [721621, 585245, 411142, 364324, 360494, 352544, 302834, 275523, 252164, 243279, 0],
    		  riskFactors: ['水果饮食偏少', '高胆固醇', '维生素A缺乏症', '二手烟', '空气污染（室内和室外）', '用药', '非独家母乳喂养', '饮食含盐量高', '抽烟', '高血压', '肥胖'],
    		  riskDALYs: [397320, 362958, 344974, 277013, 190587, 155655, 138476, 122622, 112834, 98497, 0] },
    		 {id: 25,
    		  name: "喀麦隆",
    		  lifeExpectancy: 59.29,
    		  demographics: [7725327, 6005828, 4449460, 3290814, 2054202, 1239232, 710194, 323649, 77681],
    		  majorCauses: ['产妇疾病', '其他非传染性疾病', '冲突', '呼吸疾病', '其他传染病', '新生儿疾病', '消化系统疾病', '自杀', '肌肉骨骼疾病', '呼吸疾病', '肥胖'],
    		  majorDeaths: [22803, 22663, 22041, 16148, 14658, 13311, 12644, 8077, 7474, 5096, 175],
    		  diseaseNames: ['自残', '糖尿病，血液和内分泌疾病', 'COVID-19，直到2020年5月27日', '新生儿疾病', '运输伤害', '其他非传染性疾病', '冲突与恐怖主义', '其他传染病', '人际暴力', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [2368903, 1813493, 1710349, 1262545, 629329, 618008, 525557, 445027, 407151, 397774, 3900],
    		  riskFactors: ['空气污染（室内和室外）', '缺铁', '水果饮食偏少', '不安全的卫生', '二手烟', '儿童发育不良', '非独家母乳喂养', '高胆固醇', '抽烟', '儿童发育迟缓', '肥胖'],
    		  riskDALYs: [951069, 787773, 595132, 577616, 384797, 349035, 336907, 335000, 196545, 181684, 3900] },
    		 {id: 26,
    		  name: "加拿大",
    		  lifeExpectancy: 82.43,
    		  demographics: [3960088, 3974074, 5110382, 5204909, 4797691, 5260069, 4598419, 2876627, 1628778],
    		  majorCauses: ['其他传染病', '其他非传染性疾病', '自然灾害', '呼吸疾病', '肌肉骨骼疾病', '呼吸疾病', '营养不足', '肥胖', 'COVID-19，直到2020年5月27日', '心血管疾病', '脑膜炎'],
    		  majorDeaths: [86229, 80838, 25219, 16133, 11283, 9048, 6959, 6639, 6087, 4845, 4616],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '肝病', '营养不足', '神经系统疾病', '冲突与恐怖主义', '疟疾和被忽视的热带病', '呼吸疾病', '运输伤害', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [1683333, 1259054, 1089020, 735538, 692030, 563635, 421128, 407422, 385240, 280539, 90250],
    		  riskFactors: ['维生素A缺乏症', '非独家母乳喂养', '高胆固醇', '二手烟', '低体力活动', '饮食含盐量高', 'COVID-19，直到2020年5月27日', '水果饮食偏少', '用药', '饮食中蔬菜含量低', '肥胖'],
    		  riskDALYs: [1164013, 882678, 772461, 676655, 327167, 324651, 177023, 159411, 127590, 99110, 90250] },
    		 {id: 27,
    		  name: "中非共和國",
    		  lifeExpectancy: 53.28,
    		  demographics: [1426413, 1237990, 809868, 493393, 336400, 228493, 135393, 60949, 16279],
    		  majorCauses: ['其他非传染性疾病', '自杀', '消化系统疾病', '产妇疾病', '呼吸疾病', '新生儿疾病', '冲突', '结核', '其他传染病', '下呼吸道感染', '肥胖'],
    		  majorDeaths: [7278, 6728, 5983, 5319, 5021, 4770, 3849, 3495, 2695, 1879, 1],
    		  diseaseNames: ['自残', 'COVID-19，直到2020年5月27日', '新生儿疾病', '糖尿病，血液和内分泌疾病', '运输伤害', '艾滋病毒/艾滋病与结核病', '其他非传染性疾病', '意外伤害', '人际暴力', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [1079157, 873581, 436725, 335234, 229369, 223308, 209221, 166194, 163616, 111740, 21],
    		  riskFactors: ['空气污染（室内和室外）', '缺铁', '不安全的卫生', '水果饮食偏少', '儿童发育不良', '高胆固醇', '二手烟', '高血糖', '儿童发育迟缓', '维生素A缺乏症', '肥胖'],
    		  riskDALYs: [535834, 377491, 290329, 249265, 190556, 155425, 134033, 121888, 93807, 87791, 21] },
    		 {id: 28,
    		  name: "乍得",
    		  lifeExpectancy: 54.24,
    		  demographics: [5340972, 3921214, 2679775, 1701718, 1040270, 634886, 404731, 174402, 48914],
    		  majorCauses: ['消化系统疾病', '呼吸疾病', '新生儿疾病', '其他非传染性疾病', '冲突', '自杀', '其他传染病', '产妇疾病', '人际暴力', '肝病', '肥胖'],
    		  majorDeaths: [24903, 19421, 17167, 13094, 7679, 6649, 6620, 4926, 4336, 4232, 62],
    		  diseaseNames: ['自残', '新生儿疾病', 'COVID-19，直到2020年5月27日', '糖尿病，血液和内分泌疾病', '人际暴力', '运输伤害', '意外伤害', '其他非传染性疾病', '疟疾和被忽视的热带病', '冲突与恐怖主义', '肥胖'],
    		  diseaseDALYs: [3324967, 1521033, 739523, 714037, 630767, 494126, 389858, 358655, 346981, 278749, 1378],
    		  riskFactors: ['空气污染（室内和室外）', '缺铁', '不安全的卫生', '水果饮食偏少', '儿童发育不良', '高血糖', '儿童发育迟缓', '抽烟', '二手烟', '高胆固醇', '肥胖'],
    		  riskDALYs: [2694326, 1652727, 1287466, 880045, 768811, 604902, 418815, 253170, 187689, 160699, 1378] },
    		 {id: 29,
    		  name: "智利",
    		  lifeExpectancy: 80.18,
    		  demographics: [2450918, 2505672, 3020205, 2878807, 2556775, 2328585, 1737346, 950339, 523388],
    		  majorCauses: ['其他传染病', '其他非传染性疾病', '自然灾害', '肌肉骨骼疾病', '呼吸疾病', '心血管疾病', '呼吸疾病', 'COVID-19，直到2020年5月27日', '营养不足', '结核', '肥胖'],
    		  majorDeaths: [30116, 29906, 8340, 7955, 6141, 4980, 4588, 4225, 3331, 2281, 806],
    		  diseaseNames: ['其他传染病', '肝病', '其他非传染性疾病', '神经系统疾病', '冲突与恐怖主义', '营养不足', '运输伤害', '肌肉骨骼疾病', '疟疾和被忽视的热带病', '呼吸疾病', '肥胖'],
    		  diseaseDALYs: [614838, 545626, 526835, 355493, 276342, 266925, 226976, 218323, 201592, 155243, 12027],
    		  riskFactors: ['非独家母乳喂养', '高胆固醇', '二手烟', '维生素A缺乏症', '水果饮食偏少', '饮食含盐量高', 'COVID-19，直到2020年5月27日', '用药', '低体力活动', '高血压', '肥胖'],
    		  riskDALYs: [400583, 369036, 365753, 335786, 129290, 123346, 98530, 87272, 86161, 46336, 12027] },
    		 {id: 30,
    		  name: "中国",
    		  lifeExpectancy: 76.91,
    		  demographics: [171585833, 166513709, 192891037, 223506345, 223201182, 214623812, 148420591, 66894771, 26146412],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '自然灾害', '肌肉骨骼疾病', '结核', '呼吸疾病', 'COVID-19，直到2020年5月27日', '心血管疾病', '营养不足', '肥胖'],
    		  majorDeaths: [4377972, 2606907, 1009685, 490210, 283662, 261802, 179390, 175891, 153769, 153185, 4638],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '呼吸疾病', '神经系统疾病', '冲突与恐怖主义', '营养不足', '疟疾和被忽视的热带病', '艾滋病毒/艾滋病与结核病', '运输伤害', '肥胖'],
    		  diseaseDALYs: [85319394, 63203596, 25138911, 23223150, 22139741, 20302946, 16758994, 16453012, 14994208, 14865833, 75805],
    		  riskFactors: ['维生素A缺乏症', '二手烟', 'COVID-19，直到2020年5月27日', '水果饮食偏少', '非独家母乳喂养', '高胆固醇', '用药', '饮食含盐量高', '高血压', '低体力活动', '肥胖'],
    		  riskDALYs: [51286559, 50724732, 38074126, 28361531, 25733491, 25669596, 18622122, 16998810, 9416153, 8365260, 75805] },
    		 {id: 31,
    		  name: "哥伦比亚",
    		  lifeExpectancy: 77.29,
    		  demographics: [7448799, 8231614, 8779218, 7667022, 6339173, 5445614, 3633308, 1882391, 912304],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '恐怖主义', '自然灾害', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '呼吸疾病', '结核', '营养不足', '肥胖'],
    		  majorDeaths: [68023, 46576, 15303, 15053, 15050, 10847, 8502, 7851, 7437, 6155, 776],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '消化系统疾病', '肝病', '营养不足', '新生儿疾病', '冲突与恐怖主义', '运输伤害', '神经系统疾病', '呼吸疾病', '肥胖'],
    		  diseaseDALYs: [1258942, 1121602, 851013, 792895, 731688, 684779, 672924, 646324, 636887, 414242, 12593],
    		  riskFactors: ['二手烟', '非独家母乳喂养', '高胆固醇', '维生素A缺乏症', '饮食含盐量高', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '低体力活动', '饮食中蔬菜含量低', '空气污染（室内和室外）', '肥胖'],
    		  riskDALYs: [824543, 729807, 553419, 521123, 301768, 295755, 201572, 177867, 169492, 113277, 12593] },
    		 {id: 32,
    		  name: "葛摩",
    		  lifeExpectancy: 64.32,
    		  demographics: [234784, 187246, 148281, 114000, 74321, 49408, 28300, 11291, 3260],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '自杀', '新生儿疾病', '消化系统疾病', '肌肉骨骼疾病', '营养不足', '呼吸疾病', '结核', '肥胖'],
    		  majorDeaths: [982, 565, 384, 305, 286, 272, 235, 151, 144, 113, 1],
    		  diseaseNames: ['自残', '新生儿疾病', '其他非传染性疾病', '其他传染病', '运输伤害', 'COVID-19，直到2020年5月27日', '冲突与恐怖主义', '神经系统疾病', '意外伤害', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [58275, 29193, 22929, 16910, 15236, 11967, 10010, 9808, 9388, 8770, 21],
    		  riskFactors: ['二手烟', '高胆固醇', '水果饮食偏少', '空气污染（室内和室外）', '缺铁', '不安全的卫生', '非独家母乳喂养', '维生素A缺乏症', '用药', '儿童发育不良', '肥胖'],
    		  riskDALYs: [15143, 14657, 13840, 13011, 10983, 8619, 7850, 5708, 5074, 4641, 21] },
    		 {id: 33,
    		  name: "刚果共和国",
    		  lifeExpectancy: 64.57,
    		  demographics: [1570520, 1217193, 848863, 672432, 520344, 312337, 156783, 66533, 15498],
    		  majorCauses: ['其他非传染性疾病', '产妇疾病', '其他传染病', '呼吸疾病', '自杀', '冲突', '消化系统疾病', '新生儿疾病', '肌肉骨骼疾病', '结核', '肥胖'],
    		  majorDeaths: [6527, 5571, 3275, 2308, 2279, 2244, 2107, 1717, 1615, 1229, 19],
    		  diseaseNames: ['自残', 'COVID-19，直到2020年5月27日', '新生儿疾病', '糖尿病，血液和内分泌疾病', '其他非传染性疾病', '运输伤害', '其他传染病', '艾滋病毒/艾滋病与结核病', '人际暴力', '神经系统疾病', '肥胖'],
    		  diseaseDALYs: [325799, 322346, 171187, 167855, 162431, 107522, 100822, 78622, 73269, 70131, 426],
    		  riskFactors: ['高胆固醇', '二手烟', '空气污染（室内和室外）', '缺铁', '水果饮食偏少', '非独家母乳喂养', '不安全的卫生', '儿童发育不良', '维生素A缺乏症', '抽烟', '肥胖'],
    		  riskDALYs: [124326, 112354, 106554, 95933, 90427, 86646, 71649, 50058, 49945, 41776, 426] },
    		 {id: 34,
    		  name: "哥斯达黎加",
    		  lifeExpectancy: 80.28,
    		  demographics: [708607, 724264, 833947, 812730, 638064, 598490, 403726, 219837, 107896],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '肌肉骨骼疾病', '自然灾害', '呼吸疾病', 'COVID-19，直到2020年5月27日', '心血管疾病', '结核', '呼吸疾病', '恐怖主义', '肥胖'],
    		  majorDeaths: [6852, 5717, 1546, 1458, 1331, 1265, 840, 782, 521, 484, 10],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '冲突与恐怖主义', '肝病', '神经系统疾病', '营养不足', '运输伤害', '肌肉骨骼疾病', '新生儿疾病', '艾滋病毒/艾滋病与结核病', '肥胖'],
    		  diseaseDALYs: [129752, 127974, 71800, 69245, 69175, 68520, 55612, 45180, 44686, 40129, 156],
    		  riskFactors: ['二手烟', '非独家母乳喂养', '高胆固醇', '维生素A缺乏症', '饮食含盐量高', '水果饮食偏少', '低体力活动', '饮食中蔬菜含量低', 'COVID-19，直到2020年5月27日', '用药', '肥胖'],
    		  riskDALYs: [91847, 83330, 60423, 52627, 34589, 25963, 19624, 16119, 16042, 11088, 156] },
    		 {id: 35,
    		  name: "克罗地亚",
    		  lifeExpectancy: 78.49,
    		  demographics: [392834, 410760, 480216, 550013, 555343, 588949, 560899, 355380, 235905],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '肌肉骨骼疾病', '呼吸疾病', '心血管疾病', '营养不足', 'COVID-19，直到2020年5月27日', '脑膜炎', '呼吸疾病', '肥胖'],
    		  majorDeaths: [23426, 13549, 3369, 2105, 1890, 1095, 999, 829, 708, 562, 101],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '营养不足', '疟疾和被忽视的热带病', '冲突与恐怖主义', '神经系统疾病', '肌肉骨骼疾病', '呼吸疾病', '运输伤害', '肥胖'],
    		  diseaseDALYs: [350896, 277822, 115566, 95306, 90347, 71504, 67555, 59045, 57095, 50719, 1305],
    		  riskFactors: ['维生素A缺乏症', '二手烟', '高胆固醇', '非独家母乳喂养', '饮食含盐量高', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '用药', '饮食中蔬菜含量低', '高血压', '肥胖'],
    		  riskDALYs: [236270, 221560, 184287, 175349, 111451, 66726, 54483, 41805, 33657, 32700, 1305] },
    		 {id: 36,
    		  name: "古巴",
    		  lifeExpectancy: 78.8,
    		  demographics: [1211133, 1264436, 1453162, 1486561, 1647810, 1926480, 1141744, 785066, 417092],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '呼吸疾病', '呼吸疾病', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '心血管疾病', '脑膜炎', '营养不足', '肥胖'],
    		  majorDeaths: [37598, 26203, 6988, 5678, 4406, 3969, 2340, 1869, 1791, 1769, 82],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '神经系统疾病', '营养不足', '肝病', '冲突与恐怖主义', '呼吸疾病', '肌肉骨骼疾病', '疟疾和被忽视的热带病', '运输伤害', '肥胖'],
    		  diseaseDALYs: [642754, 559920, 213593, 206468, 200596, 196844, 135526, 125201, 124433, 120958, 1157],
    		  riskFactors: ['维生素A缺乏症', '二手烟', '非独家母乳喂养', '高胆固醇', '饮食含盐量高', '水果饮食偏少', '不安全的水源', '高血压', '用药', '低体力活动', '肥胖'],
    		  riskDALYs: [438389, 343228, 312365, 276017, 153908, 137799, 59008, 43727, 40328, 38862, 1157] },
    		 {id: 37,
    		  name: "賽普勒斯",
    		  lifeExpectancy: 80.98,
    		  demographics: [132700, 142584, 194044, 188609, 163509, 145402, 117232, 75969, 38524],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '呼吸疾病', '营养不足', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '呼吸疾病', '结核', '心血管疾病', '肥胖'],
    		  majorDeaths: [2705, 2058, 483, 474, 401, 288, 256, 177, 152, 123, 17],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '神经系统疾病', '营养不足', '冲突与恐怖主义', '疟疾和被忽视的热带病', '呼吸疾病', '运输伤害', '艾滋病毒/艾滋病与结核病', '肥胖'],
    		  diseaseDALYs: [44787, 43465, 37224, 23489, 22987, 18671, 14397, 12683, 12131, 9314, 244],
    		  riskFactors: ['维生素A缺乏症', '高胆固醇', '二手烟', '非独家母乳喂养', '饮食含盐量高', '水果饮食偏少', '用药', 'COVID-19，直到2020年5月27日', '饮食中蔬菜含量低', '高血压', '肥胖'],
    		  riskDALYs: [39657, 31547, 27432, 24115, 10889, 10563, 6165, 4247, 4166, 3965, 244] },
    		 {id: 38,
    		  name: "捷克",
    		  lifeExpectancy: 79.38,
    		  demographics: [1119008, 1033915, 1145980, 1510360, 1774233, 1333127, 1344888, 987327, 440375],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '肌肉骨骼疾病', '呼吸疾病', '呼吸疾病', '营养不足', '心血管疾病', '脑膜炎', 'COVID-19，直到2020年5月27日', '肥胖'],
    		  majorDeaths: [48960, 28927, 7581, 4520, 3864, 3222, 2958, 2175, 1517, 1257, 317],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '疟疾和被忽视的热带病', '肝病', '营养不足', '冲突与恐怖主义', '神经系统疾病', '肌肉骨骼疾病', '呼吸疾病', '运输伤害', '肥胖'],
    		  diseaseDALYs: [767029, 588271, 299173, 266439, 218376, 192175, 161210, 142372, 138323, 117131, 4313],
    		  riskFactors: ['维生素A缺乏症', '二手烟', '高胆固醇', '非独家母乳喂养', '饮食含盐量高', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '用药', '饮食中蔬菜含量低', '不安全的水源', '肥胖'],
    		  riskDALYs: [534077, 464396, 417162, 396780, 244021, 141737, 120526, 108619, 81237, 58791, 4313] },
    		 {id: 39,
    		  name: "刚果民主共和国",
    		  lifeExpectancy: 60.68,
    		  demographics: [28801093, 20234100, 13690339, 9435368, 6384869, 4195557, 2494965, 1224414, 329862],
    		  majorCauses: ['其他非传染性疾病', '冲突', '呼吸疾病', '新生儿疾病', '自杀', '消化系统疾病', '其他传染病', '肌肉骨骼疾病', '结核', '呼吸疾病', '肥胖'],
    		  majorDeaths: [83261, 81226, 58587, 53950, 53304, 36660, 33983, 24612, 20502, 16529, 67],
    		  diseaseNames: ['自残', '糖尿病，血液和内分泌疾病', '新生儿疾病', 'COVID-19，直到2020年5月27日', '运输伤害', '其他非传染性疾病', '人际暴力', '疟疾和被忽视的热带病', '艾滋病毒/艾滋病与结核病', '意外伤害', '肥胖'],
    		  diseaseDALYs: [7863311, 7196932, 5077139, 4008675, 3345697, 2134794, 1817886, 1436816, 1426298, 1298704, 1403],
    		  riskFactors: ['空气污染（室内和室外）', '水果饮食偏少', '缺铁', '不安全的卫生', '高胆固醇', '二手烟', '儿童发育不良', '高血糖', '非独家母乳喂养', '抽烟', '肥胖'],
    		  riskDALYs: [4257878, 2771806, 2150401, 1590217, 1570390, 1320957, 1304840, 963409, 585796, 579539, 1403] },
    		 {id: 40,
    		  name: "丹麦",
    		  lifeExpectancy: 80.9,
    		  demographics: [607866, 679998, 774991, 662575, 752091, 803945, 657184, 566946, 266281],
    		  majorCauses: ['其他传染病', '其他非传染性疾病', '自然灾害', '呼吸疾病', '肌肉骨骼疾病', '呼吸疾病', '营养不足', 'COVID-19，直到2020年5月27日', '心血管疾病', '痴呆', '肥胖'],
    		  majorDeaths: [17404, 14525, 4477, 4319, 2530, 2377, 1294, 968, 947, 807, 563],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '肝病', '营养不足', '神经系统疾病', '呼吸疾病', '冲突与恐怖主义', '疟疾和被忽视的热带病', '运输伤害', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [327456, 205301, 194924, 120546, 105512, 93110, 85962, 68094, 66681, 58050, 7430],
    		  riskFactors: ['维生素A缺乏症', '高胆固醇', '二手烟', '非独家母乳喂养', '饮食含盐量高', '水果饮食偏少', '低体力活动', '用药', '不安全的水源', 'COVID-19，直到2020年5月27日', '肥胖'],
    		  riskDALYs: [245839, 174984, 123682, 118127, 54793, 47590, 26013, 20933, 17766, 15494, 7430] },
    		 {id: 41,
    		  name: "厄瓜多尔",
    		  lifeExpectancy: 77.01,
    		  demographics: [3260635, 3116390, 2997435, 2540942, 2046448, 1546300, 1047152, 545637, 272718],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '呼吸疾病', '自然灾害', '结核', '营养不足', '心血管疾病', '呼吸疾病', '肥胖'],
    		  majorDeaths: [19679, 16097, 6155, 5739, 5149, 4971, 4465, 4389, 3457, 3387, 3203],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '冲突与恐怖主义', '神经系统疾病', '营养不足', '新生儿疾病', '疟疾和被忽视的热带病', '艾滋病毒/艾滋病与结核病', '肝病', '运输伤害', '肥胖'],
    		  diseaseDALYs: [396000, 384366, 300660, 261958, 248588, 242400, 240306, 240294, 239834, 234280, 53061],
    		  riskFactors: ['非独家母乳喂养', '高胆固醇', '二手烟', '维生素A缺乏症', '水果饮食偏少', '饮食含盐量高', '空气污染（室内和室外）', '低体力活动', '肥胖', 'COVID-19，直到2020年5月27日', '饮食中蔬菜含量低'],
    		  riskDALYs: [348663, 321389, 246503, 119257, 105392, 85569, 58040, 54693, 53061, 53036, 52491] },
    		 {id: 42,
    		  name: "埃及",
    		  lifeExpectancy: 71.99,
    		  demographics: [24622198, 17968738, 16473942, 14922068, 10574668, 7677870, 4957959, 2412411, 778221],
    		  majorCauses: ['其他非传染性疾病', '肌肉骨骼疾病', '其他传染病', '心血管疾病', '结核', '呼吸疾病', '呼吸疾病', '营养不足', 'COVID-19，直到2020年5月27日', '自然灾害', '肥胖'],
    		  majorDeaths: [232675, 50101, 48024, 44692, 26946, 23097, 19990, 13836, 13115, 9852, 797],
    		  diseaseNames: ['其他非传染性疾病', '自残', '冲突与恐怖主义', '运输伤害', '肝病', '艾滋病毒/艾滋病与结核病', '肌肉骨骼疾病', '其他传染病', '神经系统疾病', '营养不足', '肥胖'],
    		  diseaseDALYs: [5910574, 2376177, 2004534, 1779497, 1734654, 1639386, 1638469, 1585928, 1499388, 1236761, 14855],
    		  riskFactors: ['二手烟', '非独家母乳喂养', '高胆固醇', '水果饮食偏少', '维生素A缺乏症', '饮食含盐量高', '空气污染（室内和室外）', '高血压', '用药', '低体力活动', '肥胖'],
    		  riskDALYs: [3669121, 3557105, 3101643, 2195056, 2164638, 1845428, 916224, 664061, 658551, 595808, 14855] },
    		 {id: 43,
    		  name: "厄立特里亚",
    		  lifeExpectancy: 66.32,
    		  demographics: [978748, 830029, 574495, 446287, 274976, 167460, 127422, 75264, 22435],
    		  majorCauses: ['其他非传染性疾病', '自杀', '其他传染病', '呼吸疾病', '消化系统疾病', '新生儿疾病', '肌肉骨骼疾病', '产妇疾病', '结核', '人际暴力', '肥胖'],
    		  majorDeaths: [5211, 5072, 3968, 3737, 3723, 3013, 2104, 1521, 1287, 1147, 0],
    		  diseaseNames: ['自残', '新生儿疾病', 'COVID-19，直到2020年5月27日', '其他非传染性疾病', '运输伤害', '人际暴力', '其他传染病', '疟疾和被忽视的热带病', '肌肉骨骼疾病', '艾滋病毒/艾滋病与结核病', '肥胖'],
    		  diseaseDALYs: [480274, 297214, 197674, 154881, 152787, 147554, 146554, 98581, 91972, 79943, 0],
    		  riskFactors: ['空气污染（室内和室外）', '缺铁', '水果饮食偏少', '不安全的卫生', '高胆固醇', '二手烟', '儿童发育不良', '抽烟', '高血糖', '维生素A缺乏症', '肥胖'],
    		  riskDALYs: [297140, 197758, 159271, 153111, 101300, 84060, 67867, 63384, 53520, 53356, 0] },
    		 {id: 44,
    		  name: "爱沙尼亚",
    		  lifeExpectancy: 78.74,
    		  demographics: [144409, 134136, 152005, 191747, 183573, 168320, 165824, 108288, 77347],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '肌肉骨骼疾病', '呼吸疾病', '心血管疾病', 'COVID-19，直到2020年5月27日', '脑膜炎', '呼吸疾病', '痴呆', '肥胖'],
    		  majorDeaths: [7744, 3461, 1118, 602, 293, 292, 268, 220, 217, 217, 65],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '疟疾和被忽视的热带病', '营养不足', '神经系统疾病', '冲突与恐怖主义', '肌肉骨骼疾病', '运输伤害', '呼吸疾病', '肥胖'],
    		  diseaseDALYs: [113906, 70732, 31560, 31446, 30926, 22291, 22035, 20576, 14972, 11179, 829],
    		  riskFactors: ['二手烟', '非独家母乳喂养', '维生素A缺乏症', '高胆固醇', '饮食含盐量高', 'COVID-19，直到2020年5月27日', '用药', '低体力活动', '水果饮食偏少', '饮食中蔬菜含量低', '肥胖'],
    		  riskDALYs: [80846, 58304, 56332, 48633, 37388, 15952, 12597, 12529, 9917, 7623, 829] },
    		 {id: 45,
    		  name: "埃塞俄比亚",
    		  lifeExpectancy: 66.6,
    		  demographics: [31533142, 26475407, 20669323, 13261792, 8719197, 5482039, 3520095, 1857863, 559868],
    		  majorCauses: ['新生儿疾病', '其他非传染性疾病', '消化系统疾病', '呼吸疾病', '其他传染病', '自杀', '肌肉骨骼疾病', '产妇疾病', '心血管疾病', '人际暴力', '肥胖'],
    		  majorDeaths: [68899, 58719, 58105, 47564, 42795, 35598, 27760, 17181, 16069, 12681, 6],
    		  diseaseNames: ['自残', '新生儿疾病', 'COVID-19，直到2020年5月27日', '运输伤害', '人际暴力', '其他非传染性疾病', '其他传染病', '冲突与恐怖主义', '神经系统疾病', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [8628459, 6657770, 2988580, 1923960, 1872827, 1526604, 1414986, 1356684, 1343853, 1309199, 121],
    		  riskFactors: ['空气污染（室内和室外）', '缺铁', '不安全的卫生', '儿童发育不良', '水果饮食偏少', '高血糖', '高胆固醇', '二手烟', '抽烟', '儿童发育迟缓', '肥胖'],
    		  riskDALYs: [4547197, 3145313, 2543816, 2068085, 2019593, 1169571, 907469, 798529, 547656, 524032, 121] },
    		 {id: 46,
    		  name: "斐濟",
    		  lifeExpectancy: 67.44,
    		  demographics: [178430, 156385, 142025, 134490, 104486, 91193, 54810, 22779, 5357],
    		  majorCauses: ['其他非传染性疾病', '营养不足', '其他传染病', '呼吸疾病', '呼吸疾病', 'COVID-19，直到2020年5月27日', '新生儿疾病', '肌肉骨骼疾病', '自然灾害', '消化系统疾病', '肥胖'],
    		  majorDeaths: [2553, 1578, 739, 378, 312, 278, 175, 169, 133, 86, 0],
    		  diseaseNames: ['冲突与恐怖主义', '其他非传染性疾病', '自残', '其他传染病', '新生儿疾病', '运输伤害', '呼吸疾病', '疟疾和被忽视的热带病', '肝病', '神经系统疾病', '肥胖'],
    		  diseaseDALYs: [81934, 69931, 22502, 22019, 17626, 16262, 16096, 15187, 14204, 12061, 0],
    		  riskFactors: ['高胆固醇', '非独家母乳喂养', '二手烟', '维生素A缺乏症', '饮食含盐量高', '水果饮食偏少', '用药', '饮食中蔬菜含量低', '高血压', 'COVID-19，直到2020年5月27日', '肥胖'],
    		  riskDALYs: [80830, 74137, 44313, 28763, 25566, 22452, 17909, 10712, 10082, 9252, 0] },
    		 {id: 47,
    		  name: "芬兰",
    		  lifeExpectancy: 81.91,
    		  demographics: [578800, 602758, 678649, 705213, 655323, 728975, 720693, 556209, 305539],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '肌肉骨骼疾病', '呼吸疾病', '心血管疾病', '脑膜炎', '呼吸疾病', '糖尿病', '痴呆', '肥胖'],
    		  majorDeaths: [21359, 13089, 8546, 2416, 1784, 1178, 868, 713, 682, 598, 312],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '营养不足', '神经系统疾病', '疟疾和被忽视的热带病', '冲突与恐怖主义', '肌肉骨骼疾病', '呼吸疾病', '运输伤害', '肥胖'],
    		  diseaseDALYs: [297803, 244327, 168915, 159341, 109069, 95183, 67129, 65492, 57755, 56824, 3999],
    		  riskFactors: ['二手烟', '高胆固醇', '非独家母乳喂养', '维生素A缺乏症', '饮食含盐量高', '用药', '低体力活动', '饮食中蔬菜含量低', 'COVID-19，直到2020年5月27日', '不安全的水源', '肥胖'],
    		  riskDALYs: [177418, 161016, 139500, 134558, 81929, 35314, 31633, 27778, 27062, 25187, 3999] },
    		 {id: 48,
    		  name: "法国",
    		  lifeExpectancy: 82.66,
    		  demographics: [7606630, 7857054, 7415448, 8007883, 8408482, 8600917, 7758713, 5456311, 4018291],
    		  majorCauses: ['其他传染病', '其他非传染性疾病', '自然灾害', '肥胖', '肌肉骨骼疾病', '呼吸疾病', '呼吸疾病', '脑膜炎', '心血管疾病', '营养不足', 'COVID-19，直到2020年5月27日'],
    		  majorDeaths: [182241, 155683, 70567, 28530, 27350, 20917, 20732, 11067, 10621, 10579, 9279],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '肝病', '营养不足', '神经系统疾病', '疟疾和被忽视的热带病', '冲突与恐怖主义', '运输伤害', '肌肉骨骼疾病', '呼吸疾病', '肥胖'],
    		  diseaseDALYs: [3380270, 2121253, 1815206, 1555743, 1407146, 999326, 828873, 686563, 601963, 532875, 357532],
    		  riskFactors: ['维生素A缺乏症', '二手烟', '高胆固醇', '非独家母乳喂养', '饮食含盐量高', '肥胖', '水果饮食偏少', '用药', '低体力活动', 'COVID-19，直到2020年5月27日', '不安全的水源'],
    		  riskDALYs: [1910863, 1144792, 1069097, 1035904, 529536, 357532, 346605, 266385, 261196, 186249, 167243] },
    		 {id: 49,
    		  name: "加蓬",
    		  lifeExpectancy: 66.47,
    		  demographics: [586583, 410229, 369653, 340542, 222608, 126869, 68865, 35920, 11309],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '冲突', '产妇疾病', '新生儿疾病', '肌肉骨骼疾病', '自杀', '营养不足', '结核', '肥胖'],
    		  majorDeaths: [2230, 1240, 756, 705, 644, 630, 601, 569, 447, 435, 14],
    		  diseaseNames: ['自残', 'COVID-19，直到2020年5月27日', '新生儿疾病', '糖尿病，血液和内分泌疾病', '其他非传染性疾病', '运输伤害', '其他传染病', '冲突与恐怖主义', '艾滋病毒/艾滋病与结核病', '神经系统疾病', '肥胖'],
    		  diseaseDALYs: [81025, 76009, 63650, 53830, 50948, 36479, 34988, 30639, 28574, 25521, 287],
    		  riskFactors: ['高胆固醇', '二手烟', '非独家母乳喂养', '水果饮食偏少', '维生素A缺乏症', '抽烟', '空气污染（室内和室外）', '缺铁', '不安全的卫生', '饮食含盐量高', '肥胖'],
    		  riskDALYs: [45650, 35609, 33446, 22861, 20977, 16066, 13877, 13686, 9638, 9322, 287] },
    		 {id: 50,
    		  name: "冈比亚",
    		  lifeExpectancy: 62.05,
    		  demographics: [744980, 541297, 417652, 271437, 168487, 111373, 57178, 29296, 5996],
    		  majorCauses: ['其他非传染性疾病', '呼吸疾病', '新生儿疾病', '其他传染病', '产妇疾病', '消化系统疾病', '自杀', '肌肉骨骼疾病', '呼吸疾病', '蛋白质能量营养不良', '肥胖'],
    		  majorDeaths: [2686, 1235, 1216, 1090, 883, 616, 604, 564, 402, 312, 1],
    		  diseaseNames: ['自残', '新生儿疾病', '运输伤害', '其他非传染性疾病', 'COVID-19，直到2020年5月27日', '人际暴力', '其他传染病', '冲突与恐怖主义', '疟疾和被忽视的热带病', '神经系统疾病', '肥胖'],
    		  diseaseDALYs: [158130, 117340, 74485, 64688, 63678, 49673, 33379, 28846, 28696, 27958, 22],
    		  riskFactors: ['空气污染（室内和室外）', '水果饮食偏少', '二手烟', '缺铁', '抽烟', '高胆固醇', '非独家母乳喂养', '不安全的卫生', '儿童发育不良', '维生素A缺乏症', '肥胖'],
    		  riskDALYs: [55905, 47203, 43352, 33016, 32534, 30844, 25630, 24125, 21488, 21141, 22] },
    		 {id: 51,
    		  name: "格鲁吉亚",
    		  lifeExpectancy: 73.77,
    		  demographics: [555503, 462513, 517237, 565027, 516086, 532797, 450191, 245487, 151920],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '肌肉骨骼疾病', '呼吸疾病', '心血管疾病', '营养不足', 'COVID-19，直到2020年5月27日', '呼吸疾病', '结核', '肥胖'],
    		  majorDeaths: [29989, 7926, 2291, 1938, 1776, 1381, 1210, 785, 767, 724, 12],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '冲突与恐怖主义', '营养不足', '疟疾和被忽视的热带病', '肝病', '肌肉骨骼疾病', '神经系统疾病', '呼吸疾病', '运输伤害', '肥胖'],
    		  diseaseDALYs: [492777, 199176, 77350, 71942, 71878, 66363, 61436, 52174, 50743, 49258, 167],
    		  riskFactors: ['二手烟', '高胆固醇', '非独家母乳喂养', '维生素A缺乏症', '饮食含盐量高', '水果饮食偏少', '用药', 'COVID-19，直到2020年5月27日', '饮食中蔬菜含量低', '高血压', '肥胖'],
    		  riskDALYs: [330197, 249730, 207106, 181728, 112711, 96544, 85246, 73731, 53296, 37918, 167] },
    		 {id: 52,
    		  name: "德国",
    		  lifeExpectancy: 81.33,
    		  demographics: [7726915, 7948424, 9421661, 10770439, 10400203, 13574883, 10347526, 7589596, 5737398],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '呼吸疾病', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '呼吸疾病', '心血管疾病', '营养不足', '糖尿病', '肥胖'],
    		  majorDeaths: [356362, 252763, 83782, 46375, 44735, 26754, 25237, 19558, 19133, 12716, 8349],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '营养不足', '神经系统疾病', '冲突与恐怖主义', '呼吸疾病', '疟疾和被忽视的热带病', '肌肉骨骼疾病', '运输伤害', '肥胖'],
    		  diseaseDALYs: [4855900, 4820928, 2911225, 2149784, 1683775, 1498390, 1240818, 1133138, 1077631, 979500, 103590],
    		  riskFactors: ['维生素A缺乏症', '二手烟', '高胆固醇', '非独家母乳喂养', '饮食含盐量高', '水果饮食偏少', '用药', 'COVID-19，直到2020年5月27日', '饮食中蔬菜含量低', '不安全的水源', '肥胖'],
    		  riskDALYs: [3414722, 2775807, 2418682, 2199578, 1294183, 787908, 609964, 445019, 404628, 379320, 103590] },
    		 {id: 53,
    		  name: "加纳",
    		  lifeExpectancy: 64.07,
    		  demographics: [7954883, 6496468, 5300953, 4080533, 2958700, 2058206, 1030760, 439902, 97453],
    		  majorCauses: ['其他非传染性疾病', '冲突', '呼吸疾病', '其他传染病', '新生儿疾病', '产妇疾病', '自杀', '肌肉骨骼疾病', '消化系统疾病', '结核', '肥胖'],
    		  majorDeaths: [36615, 18757, 17761, 17559, 16951, 13878, 9142, 8541, 7309, 5381, 34],
    		  diseaseNames: ['新生儿疾病', '自残', '糖尿病，血液和内分泌疾病', 'COVID-19，直到2020年5月27日', '其他非传染性疾病', '运输伤害', '冲突与恐怖主义', '人际暴力', '其他传染病', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [1654622, 1394112, 1250172, 952830, 938267, 741457, 564721, 546793, 529975, 408703, 745],
    		  riskFactors: ['二手烟', '空气污染（室内和室外）', '水果饮食偏少', '高胆固醇', '非独家母乳喂养', '缺铁', '抽烟', '不安全的卫生', '儿童发育不良', '维生素A缺乏症', '肥胖'],
    		  riskDALYs: [588032, 571389, 561136, 521296, 439123, 427879, 305486, 303853, 231330, 180575, 745] },
    		 {id: 54,
    		  name: "希腊",
    		  lifeExpectancy: 82.24,
    		  demographics: [910515, 1071214, 1068916, 1384511, 1584912, 1489576, 1243217, 940663, 779928],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '呼吸疾病', '呼吸疾病', 'COVID-19，直到2020年5月27日', '肌肉骨骼疾病', '糖尿病', '心血管疾病', '结核', '肥胖'],
    		  majorDeaths: [50895, 31245, 11489, 6069, 4269, 3582, 3579, 1460, 1308, 1221, 173],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '营养不足', '神经系统疾病', '呼吸疾病', '冲突与恐怖主义', '疟疾和被忽视的热带病', '运输伤害', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [687099, 569885, 326957, 284049, 219619, 153164, 151809, 133281, 120023, 89730, 2100],
    		  riskFactors: ['维生素A缺乏症', '二手烟', '高胆固醇', '非独家母乳喂养', '饮食含盐量高', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '高血压', '用药', '不安全的水源', '肥胖'],
    		  riskDALYs: [560222, 357593, 314662, 288302, 216660, 129722, 59070, 56707, 53709, 52342, 2100] },
    		 {id: 55,
    		  name: "格林纳达",
    		  lifeExpectancy: 72.4,
    		  demographics: [18172, 16008, 18677, 17858, 12661, 12282, 9161, 4727, 2456],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '营养不足', '呼吸疾病', '自然灾害', 'COVID-19，直到2020年5月27日', '肌肉骨骼疾病', '呼吸疾病', '心血管疾病', '结核', '肥胖'],
    		  majorDeaths: [411, 228, 95, 83, 51, 51, 41, 30, 19, 12, 0],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '冲突与恐怖主义', '肝病', '营养不足', '自残', '神经系统疾病', '运输伤害', '疟疾和被忽视的热带病', '新生儿疾病', '肥胖'],
    		  diseaseDALYs: [7147, 4824, 3842, 1912, 1911, 1843, 1805, 1620, 1510, 1282, 0],
    		  riskFactors: ['高胆固醇', '二手烟', '非独家母乳喂养', '维生素A缺乏症', '水果饮食偏少', '饮食含盐量高', '饮食中蔬菜含量低', '用药', '不安全的水源', '低体力活动', '肥胖'],
    		  riskDALYs: [5685, 4337, 3932, 2146, 1782, 1177, 766, 746, 589, 399, 0] },
    		 {id: 56,
    		  name: "危地马拉",
    		  lifeExpectancy: 74.3,
    		  demographics: [4021938, 3865062, 3339524, 2460641, 1627996, 1016203, 695632, 366031, 188449],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '肌肉骨骼疾病', '恐怖主义', '营养不足', 'COVID-19，直到2020年5月27日', '心血管疾病', '新生儿疾病', '消化系统疾病', '肥胖'],
    		  majorDeaths: [15009, 11034, 9695, 7300, 6193, 5531, 5065, 4623, 3675, 2957, 63],
    		  diseaseNames: ['自残', '新生儿疾病', '冲突与恐怖主义', '消化系统疾病', '其他非传染性疾病', '其他传染病', '肌肉骨骼疾病', '运输伤害', '疟疾和被忽视的热带病', '神经系统疾病', '肥胖'],
    		  diseaseDALYs: [602755, 403822, 382601, 338262, 335440, 294204, 269396, 267082, 252017, 228858, 1128],
    		  riskFactors: ['高胆固醇', '水果饮食偏少', '非独家母乳喂养', '空气污染（室内和室外）', '二手烟', '缺铁', '低体力活动', '维生素A缺乏症', '不安全的卫生', '饮食含盐量高', '肥胖'],
    		  riskDALYs: [402592, 269293, 262556, 226714, 226087, 161136, 102818, 100650, 95949, 81342, 1128] },
    		 {id: 57,
    		  name: "几内亚",
    		  lifeExpectancy: 61.6,
    		  demographics: [3893217, 3131561, 2277961, 1403283, 864312, 600063, 394880, 166054, 39914],
    		  majorCauses: ['其他非传染性疾病', '呼吸疾病', '冲突', '新生儿疾病', '其他传染病', '自杀', '消化系统疾病', '肌肉骨骼疾病', '产妇疾病', '呼吸疾病', '肥胖'],
    		  majorDeaths: [16151, 12033, 11355, 10012, 8125, 5917, 5287, 3131, 2989, 2898, 20],
    		  diseaseNames: ['自残', '糖尿病，血液和内分泌疾病', '新生儿疾病', 'COVID-19，直到2020年5月27日', '其他非传染性疾病', '运输伤害', '人际暴力', '冲突与恐怖主义', '其他传染病', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [1570992, 929025, 915842, 474268, 405634, 401375, 329709, 268882, 248388, 223100, 435],
    		  riskFactors: ['空气污染（室内和室外）', '水果饮食偏少', '缺铁', '二手烟', '不安全的卫生', '儿童发育不良', '高胆固醇', '高血糖', '抽烟', '非独家母乳喂养', '肥胖'],
    		  riskDALYs: [731514, 509268, 290067, 232709, 216134, 197656, 172770, 143237, 135493, 114120, 435] },
    		 {id: 58,
    		  name: "圭亚那",
    		  lifeExpectancy: 69.91,
    		  demographics: [147517, 147825, 142736, 93866, 91021, 78183, 49260, 21780, 10587],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '营养不足', '肌肉骨骼疾病', '呼吸疾病', '产妇疾病', '新生儿疾病', '脑膜炎', 'COVID-19，直到2020年5月27日', '心血管疾病', '肥胖'],
    		  majorDeaths: [2034, 621, 425, 281, 248, 196, 194, 189, 181, 174, 11],
    		  diseaseNames: ['其他非传染性疾病', '冲突与恐怖主义', '新生儿疾病', '其他传染病', '神经系统疾病', '自残', 'COVID-19，直到2020年5月27日', '疟疾和被忽视的热带病', '运输伤害', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [48488, 29028, 20211, 17630, 13647, 13225, 12727, 12670, 11948, 10822, 189],
    		  riskFactors: ['高胆固醇', '二手烟', '非独家母乳喂养', '饮食含盐量高', '维生素A缺乏症', '水果饮食偏少', '用药', '饮食中蔬菜含量低', '空气污染（室内和室外）', '抽烟', '肥胖'],
    		  riskDALYs: [35463, 29423, 27805, 13961, 12513, 10968, 9387, 5708, 4171, 4063, 189] },
    		 {id: 59,
    		  name: "海地",
    		  lifeExpectancy: 64.0,
    		  demographics: [2503602, 2334380, 2030254, 1702688, 1062317, 774512, 506169, 253257, 95900],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '新生儿疾病', '结核', '营养不足', '产妇疾病', '消化系统疾病', '肌肉骨骼疾病', '呼吸疾病', '肥胖'],
    		  majorDeaths: [23978, 10065, 6003, 4793, 4487, 4003, 3850, 3703, 3619, 3134, 33],
    		  diseaseNames: ['自残', '其他非传染性疾病', '新生儿疾病', '运输伤害', '疟疾和被忽视的热带病', 'COVID-19，直到2020年5月27日', '冲突与恐怖主义', '其他传染病', '艾滋病毒/艾滋病与结核病', '神经系统疾病', '肥胖'],
    		  diseaseDALYs: [734644, 612671, 458390, 384494, 368148, 340215, 313273, 291429, 265724, 171517, 613],
    		  riskFactors: ['空气污染（室内和室外）', '高胆固醇', '二手烟', '水果饮食偏少', '缺铁', '不安全的卫生', '非独家母乳喂养', '饮食含盐量高', '维生素A缺乏症', '抽烟', '肥胖'],
    		  riskDALYs: [382608, 367485, 324753, 312815, 295182, 220161, 210943, 155160, 116590, 113575, 613] },
    		 {id: 60,
    		  name: "洪都拉斯",
    		  lifeExpectancy: 75.27,
    		  demographics: [2006000, 2073497, 1868035, 1435980, 1009908, 653401, 402303, 195289, 101701],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '肌肉骨骼疾病', '恐怖主义', '自然灾害', '心血管疾病', '呼吸疾病', '新生儿疾病', '结核', '消化系统疾病', '肥胖'],
    		  majorDeaths: [13117, 5431, 4449, 4154, 2408, 2388, 2056, 1464, 1294, 1229, 188],
    		  diseaseNames: ['其他非传染性疾病', '消化系统疾病', '新生儿疾病', '冲突与恐怖主义', '肌肉骨骼疾病', '其他传染病', '营养不足', '自残', '运输伤害', '神经系统疾病', '肥胖'],
    		  diseaseDALYs: [282192, 228670, 180903, 164244, 156390, 152814, 133332, 128019, 126607, 118070, 3444],
    		  riskFactors: ['二手烟', '非独家母乳喂养', '高胆固醇', '维生素A缺乏症', '饮食含盐量高', '水果饮食偏少', '缺铁', '用药', '饮食中蔬菜含量低', '低体力活动', '肥胖'],
    		  riskDALYs: [159975, 146377, 133796, 103459, 99629, 85602, 51514, 43189, 41993, 40037, 3444] },
    		 {id: 61,
    		  name: "匈牙利",
    		  lifeExpectancy: 76.88,
    		  demographics: [911982, 972734, 1176155, 1283490, 1579425, 1189378, 1322500, 822141, 426875],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '肌肉骨骼疾病', '呼吸疾病', '心血管疾病', '营养不足', '脑膜炎', 'COVID-19，直到2020年5月27日', '呼吸疾病', '肥胖'],
    		  majorDeaths: [57212, 32138, 7064, 5879, 5457, 3228, 2063, 2025, 1553, 1016, 505],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '疟疾和被忽视的热带病', '营养不足', '肌肉骨骼疾病', '冲突与恐怖主义', '呼吸疾病', '神经系统疾病', '运输伤害', '肥胖'],
    		  diseaseDALYs: [948587, 719728, 271875, 246768, 206846, 180409, 179146, 177834, 153606, 115640, 6850],
    		  riskFactors: ['维生素A缺乏症', '二手烟', '非独家母乳喂养', '高胆固醇', '饮食含盐量高', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '用药', '不安全的水源', '高血压', '肥胖'],
    		  riskDALYs: [680552, 655486, 476990, 428625, 339453, 181526, 170125, 141183, 64658, 59660, 6850] },
    		 {id: 62,
    		  name: "冰岛",
    		  lifeExpectancy: 82.99,
    		  demographics: [43668, 44269, 48238, 46464, 42622, 42276, 36635, 22223, 12642],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '呼吸疾病', '呼吸疾病', '肌肉骨骼疾病', '脑膜炎', '糖尿病', 'COVID-19，直到2020年5月27日', '营养不足', '肥胖'],
    		  majorDeaths: [738, 652, 236, 114, 95, 65, 40, 39, 27, 22, 10],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '肝病', '营养不足', '神经系统疾病', '呼吸疾病', '疟疾和被忽视的热带病', '冲突与恐怖主义', '运输伤害', '自残', '肥胖'],
    		  diseaseDALYs: [12927, 10060, 9227, 7061, 6135, 3992, 3785, 3121, 3018, 1716, 139],
    		  riskFactors: ['维生素A缺乏症', '高胆固醇', '非独家母乳喂养', '二手烟', '饮食含盐量高', '低体力活动', '水果饮食偏少', '饮食中蔬菜含量低', '用药', '不安全的水源', '肥胖'],
    		  riskDALYs: [7646, 6360, 6244, 5408, 3428, 1198, 1195, 1008, 1005, 925, 139] },
    		 {id: 63,
    		  name: "印度",
    		  lifeExpectancy: 69.66,
    		  demographics: [236731829, 252674336, 238481457, 212399683, 165881490, 125378954, 84296275, 37500685, 13073046],
    		  majorCauses: ['其他非传染性疾病', '呼吸疾病', '其他传染病', '消化系统疾病', '呼吸疾病', '自杀', '新生儿疾病', '肌肉骨骼疾病', '营养不足', 'COVID-19，直到2020年5月27日', '肥胖'],
    		  majorDeaths: [2632780, 1271687, 929500, 719083, 507364, 449794, 428672, 419545, 254555, 223821, 4337],
    		  diseaseNames: ['其他非传染性疾病', '自残', '新生儿疾病', '呼吸疾病', '冲突与恐怖主义', '其他传染病', '疟疾和被忽视的热带病', '运输伤害', '神经系统疾病', '肝病', '肥胖'],
    		  diseaseDALYs: [64219262, 59105453, 46464098, 33125142, 26160476, 25772512, 23310913, 22563499, 22096435, 21348307, 79240],
    		  riskFactors: ['水果饮食偏少', '二手烟', '高胆固醇', '维生素A缺乏症', '空气污染（室内和室外）', '缺铁', '饮食含盐量高', '非独家母乳喂养', '抽烟', '用药', '肥胖'],
    		  riskDALYs: [39210284, 37485408, 28068070, 23841107, 20642364, 19658345, 19264482, 17663196, 13222380, 11852430, 79240] },
    		 {id: 64,
    		  name: "印尼",
    		  lifeExpectancy: 71.72,
    		  demographics: [47977486, 46310084, 43068836, 41353654, 37293402, 28325635, 16650777, 7276648, 2369045],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '肌肉骨骼疾病', '营养不足', '呼吸疾病', '自杀', '心血管疾病', '消化系统疾病', '自然灾害', '呼吸疾病', '肥胖'],
    		  majorDeaths: [597995, 198835, 121488, 97005, 96316, 82219, 82145, 68636, 47869, 43764, 1418],
    		  diseaseNames: ['其他非传染性疾病', '自残', '冲突与恐怖主义', '其他传染病', '新生儿疾病', '肝病', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '呼吸疾病', '运输伤害', '肥胖'],
    		  diseaseDALYs: [14436782, 6040809, 5756326, 5576287, 4267523, 4266640, 3709473, 3525877, 3510134, 3397022, 26400],
    		  riskFactors: ['二手烟', '高胆固醇', '维生素A缺乏症', '非独家母乳喂养', '水果饮食偏少', '饮食含盐量高', '用药', 'COVID-19，直到2020年5月27日', '饮食中蔬菜含量低', '空气污染（室内和室外）', '肥胖'],
    		  riskDALYs: [10343485, 10011664, 6688501, 5556192, 4014640, 3476122, 3100077, 2859877, 2375858, 2098071, 26400] },
    		 {id: 65,
    		  name: "伊朗",
    		  lifeExpectancy: 76.68,
    		  demographics: [14377200, 11531256, 12885389, 16623647, 11185873, 8029753, 5126544, 2239919, 914312],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '结核', '营养不足', '呼吸疾病', 'COVID-19，直到2020年5月27日', '肌肉骨骼疾病', '新生儿疾病', '呼吸疾病', '肥胖'],
    		  majorDeaths: [161330, 60600, 21435, 21124, 16033, 14948, 10163, 9907, 9553, 9315, 7508],
    		  diseaseNames: ['其他非传染性疾病', '神经系统疾病', '肝病', '营养不足', '其他传染病', '冲突与恐怖主义', '运输伤害', '新生儿疾病', '艾滋病毒/艾滋病与结核病', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [3176330, 1904817, 1783780, 1616255, 1592320, 1514747, 1355368, 1339143, 1271439, 924674, 136251],
    		  riskFactors: ['二手烟', '高胆固醇', '非独家母乳喂养', '维生素A缺乏症', '饮食含盐量高', '低体力活动', '水果饮食偏少', '不安全的水源', 'COVID-19，直到2020年5月27日', '高血压', '肥胖'],
    		  riskDALYs: [1878213, 1713915, 1700004, 1081718, 1077120, 991126, 795938, 360228, 282413, 272788, 136251] },
    		 {id: 66,
    		  name: "伊拉克",
    		  lifeExpectancy: 70.6,
    		  demographics: [10485112, 8550850, 7013811, 5252557, 3814033, 2191874, 1261768, 552034, 187749],
    		  majorCauses: ['其他非传染性疾病', '下呼吸道感染', '其他传染病', '新生儿疾病', '吸毒障碍', 'COVID-19，直到2020年5月27日', '营养不足', '结核', '呼吸疾病', '自然灾害', '肥胖'],
    		  majorDeaths: [43072, 33240, 13780, 12278, 6476, 4706, 4281, 3773, 3628, 3600, 169],
    		  diseaseNames: ['腹泻和常见传染病', '新生儿疾病', '其他非传染性疾病', '冲突与恐怖主义', '自残', '运输伤害', '神经系统疾病', '疟疾和被忽视的热带病', '肝病', '营养不足', '肥胖'],
    		  diseaseDALYs: [2065047, 1276888, 1114616, 980591, 977639, 881383, 669242, 592465, 587218, 499474, 3560],
    		  riskFactors: ['非独家母乳喂养', '二手烟', '高胆固醇', '饮食含盐量高', '水果饮食偏少', '维生素A缺乏症', '低体力活动', '用药', '空气污染（室内和室外）', '抽烟', '肥胖'],
    		  riskDALYs: [728011, 713340, 686531, 653682, 367011, 365292, 285716, 232404, 175962, 155092, 3560] },
    		 {id: 67,
    		  name: "爱尔兰",
    		  lifeExpectancy: 82.3,
    		  demographics: [683362, 653400, 559110, 710607, 747666, 587995, 473864, 314560, 151934],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '呼吸疾病', '肥胖', '呼吸疾病', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '脑膜炎', '营养不足', '心血管疾病'],
    		  majorDeaths: [9681, 9581, 2698, 2226, 1615, 1372, 1145, 579, 453, 420, 393],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '肝病', '神经系统疾病', '营养不足', '呼吸疾病', '运输伤害', '冲突与恐怖主义', '疟疾和被忽视的热带病', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [189194, 145789, 126929, 99180, 95089, 61214, 54913, 51616, 50239, 32460, 23153],
    		  riskFactors: ['维生素A缺乏症', '高胆固醇', '二手烟', '非独家母乳喂养', '饮食含盐量高', '水果饮食偏少', '肥胖', '低体力活动', '用药', 'COVID-19，直到2020年5月27日', '不安全的水源'],
    		  riskDALYs: [132906, 99314, 90195, 83764, 45699, 24227, 23153, 22113, 15034, 14695, 13727] },
    		 {id: 68,
    		  name: "以色列",
    		  lifeExpectancy: 82.97,
    		  demographics: [1654530, 1377821, 1178880, 1117905, 1019070, 779142, 702437, 430872, 258715],
    		  majorCauses: ['其他传染病', '其他非传染性疾病', '自然灾害', '呼吸疾病', 'COVID-19，直到2020年5月27日', '营养不足', '呼吸疾病', '肌肉骨骼疾病', '心血管疾病', '结核', '肥胖'],
    		  majorDeaths: [12966, 11849, 4658, 2276, 2242, 2141, 1812, 1808, 707, 632, 281],
    		  diseaseNames: ['其他传染病', '肝病', '其他非传染性疾病', '营养不足', '神经系统疾病', '冲突与恐怖主义', '运输伤害', '疟疾和被忽视的热带病', '呼吸疾病', '新生儿疾病', '肥胖'],
    		  diseaseDALYs: [253956, 211092, 175059, 151116, 143230, 134764, 98294, 80106, 63869, 51274, 3978],
    		  riskFactors: ['高胆固醇', '维生素A缺乏症', '非独家母乳喂养', '二手烟', '水果饮食偏少', '饮食含盐量高', '低体力活动', 'COVID-19，直到2020年5月27日', '不安全的水源', '用药', '肥胖'],
    		  riskDALYs: [167092, 158896, 121800, 113120, 52609, 45088, 19532, 17738, 16242, 14827, 3978] },
    		 {id: 69,
    		  name: "意大利",
    		  lifeExpectancy: 83.51,
    		  demographics: [5103576, 5740332, 6135226, 7100743, 9225165, 9453168, 7391126, 5935048, 4465708],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '肥胖', '呼吸疾病', '肌肉骨骼疾病', '营养不足', 'COVID-19，直到2020年5月27日', '呼吸疾病', '心血管疾病', '糖尿病'],
    		  majorDeaths: [216585, 180577, 73339, 32955, 29044, 26403, 18551, 14292, 13167, 11695, 7557],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '肝病', '营养不足', '神经系统疾病', '冲突与恐怖主义', '疟疾和被忽视的热带病', '肌肉骨骼疾病', '运输伤害', '呼吸疾病', '肥胖'],
    		  diseaseDALYs: [3227357, 2648270, 1971740, 1748118, 1191659, 1020109, 703647, 597865, 593953, 578073, 402295],
    		  riskFactors: ['维生素A缺乏症', '高胆固醇', '二手烟', '非独家母乳喂养', '饮食含盐量高', '水果饮食偏少', '肥胖', '低体力活动', 'COVID-19，直到2020年5月27日', '不安全的水源', '用药'],
    		  riskDALYs: [1879616, 1702367, 1518935, 1310480, 648326, 522561, 402295, 271922, 267823, 220006, 207156] },
    		 {id: 70,
    		  name: "牙买加",
    		  lifeExpectancy: 74.47,
    		  demographics: [465506, 474181, 517860, 435865, 357187, 315232, 206614, 116152, 59679],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '营养不足', '自然灾害', '恐怖主义', 'COVID-19，直到2020年5月27日', '呼吸疾病', '肌肉骨骼疾病', '呼吸疾病', '产妇疾病', '肥胖'],
    		  majorDeaths: [6279, 3975, 2516, 1253, 887, 810, 695, 504, 503, 440, 9],
    		  diseaseNames: ['其他非传染性疾病', '冲突与恐怖主义', '其他传染病', '新生儿疾病', '消化系统疾病', '肝病', '营养不足', '神经系统疾病', '运输伤害', '自残', '肥胖'],
    		  diseaseDALYs: [116834, 107775, 96171, 48412, 48126, 45159, 45023, 44712, 37202, 29423, 141],
    		  riskFactors: ['高胆固醇', '非独家母乳喂养', '二手烟', '维生素A缺乏症', '水果饮食偏少', '饮食含盐量高', '用药', '饮食中蔬菜含量低', '抽烟', '不安全的水源', '肥胖'],
    		  riskDALYs: [121104, 90114, 75774, 55231, 29649, 20221, 16755, 10866, 10335, 9483, 141] },
    		 {id: 71,
    		  name: "日本",
    		  lifeExpectancy: 84.63,
    		  demographics: [10363426, 11337747, 12268082, 14762678, 18753747, 16223340, 16318424, 15814619, 11018236],
    		  majorCauses: ['其他传染病', '其他非传染性疾病', '自然灾害', '呼吸疾病', '肌肉骨骼疾病', '呼吸疾病', 'COVID-19，直到2020年5月27日', '脑膜炎', '心血管疾病', '糖尿病', '肥胖'],
    		  majorDeaths: [414698, 368091, 198556, 109534, 56334, 53739, 35709, 28819, 25352, 15613, 858],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '肝病', '营养不足', '冲突与恐怖主义', '神经系统疾病', '疟疾和被忽视的热带病', '呼吸疾病', '运输伤害', '自残', '肥胖'],
    		  diseaseDALYs: [6647076, 5124426, 4181686, 3088970, 2174030, 2146019, 2122420, 1348675, 1284802, 1131219, 10052],
    		  riskFactors: ['维生素A缺乏症', '二手烟', '高胆固醇', '非独家母乳喂养', 'COVID-19，直到2020年5月27日', '饮食含盐量高', '水果饮食偏少', '用药', '不安全的水源', '低体力活动', '肥胖'],
    		  riskDALYs: [4211397, 3003185, 2241447, 1385128, 1315624, 987828, 839089, 819971, 423681, 412535, 10052] },
    		 {id: 72,
    		  name: "约旦",
    		  lifeExpectancy: 74.53,
    		  demographics: [2257019, 2159817, 1780641, 1468830, 1117097, 720652, 348029, 187481, 62131],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '新生儿疾病', '营养不足', '自然灾害', 'COVID-19，直到2020年5月27日', '结核', '呼吸疾病', '肌肉骨骼疾病', '呼吸疾病', '肥胖'],
    		  majorDeaths: [9018, 4502, 2023, 1516, 1299, 1281, 1110, 1014, 822, 730, 9],
    		  diseaseNames: ['新生儿疾病', '其他非传染性疾病', '运输伤害', '肝病', '神经系统疾病', '冲突与恐怖主义', '其他传染病', '营养不足', '艾滋病毒/艾滋病与结核病', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [231744, 205154, 200157, 171916, 170292, 144906, 129454, 128076, 79489, 77320, 180],
    		  riskFactors: ['非独家母乳喂养', '高胆固醇', '二手烟', '维生素A缺乏症', '低体力活动', '饮食含盐量高', '水果饮食偏少', '用药', '抽烟', '高血压', '肥胖'],
    		  riskDALYs: [186863, 157454, 137643, 109142, 70998, 70022, 67410, 40454, 32995, 28236, 180] },
    		 {id: 73,
    		  name: "哈萨克斯坦",
    		  lifeExpectancy: 73.6,
    		  demographics: [3854928, 2574607, 2706361, 2919045, 2254076, 2041467, 1366464, 538921, 295558],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '肌肉骨骼疾病', '心血管疾病', '呼吸疾病', '自然灾害', '脑膜炎', '呼吸疾病', '结核', '新生儿疾病', '肥胖'],
    		  majorDeaths: [67339, 18400, 9115, 6849, 5615, 4481, 4263, 3624, 2767, 2047, 37],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '疟疾和被忽视的热带病', '肌肉骨骼疾病', '运输伤害', '肝病', '神经系统疾病', '营养不足', '新生儿疾病', '冲突与恐怖主义', '肥胖'],
    		  diseaseDALYs: [1423967, 499547, 385355, 337080, 287137, 261389, 253852, 251712, 250447, 228854, 620],
    		  riskFactors: ['二手烟', '非独家母乳喂养', '维生素A缺乏症', '高胆固醇', '饮食含盐量高', '用药', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '低体力活动', '高血压', '肥胖'],
    		  riskDALYs: [790109, 644782, 598318, 495839, 469206, 263862, 212036, 208316, 129363, 105151, 620] },
    		 {id: 74,
    		  name: "肯尼亚",
    		  lifeExpectancy: 66.7,
    		  demographics: [13975897, 12493627, 9335457, 7280037, 4688651, 2676456, 1445979, 534812, 143051],
    		  majorCauses: ['产妇疾病', '其他非传染性疾病', '呼吸疾病', '其他传染病', '消化系统疾病', '肌肉骨骼疾病', '新生儿疾病', '自杀', '心血管疾病', '呼吸疾病', '肥胖'],
    		  majorDeaths: [48502, 35993, 23268, 21373, 20835, 18893, 16978, 14881, 10398, 6871, 52],
    		  diseaseNames: ['自残', 'COVID-19，直到2020年5月27日', '新生儿疾病', '其他非传染性疾病', '运输伤害', '肌肉骨骼疾病', '其他传染病', '神经系统疾病', '疟疾和被忽视的热带病', '营养不足', '肥胖'],
    		  diseaseDALYs: [4434222, 2835626, 1764456, 930002, 926142, 685728, 669334, 637402, 541192, 506020, 1221],
    		  riskFactors: ['空气污染（室内和室外）', '缺铁', '水果饮食偏少', '不安全的卫生', '高胆固醇', '二手烟', '儿童发育不良', '非独家母乳喂养', '维生素A缺乏症', '高血糖', '肥胖'],
    		  riskDALYs: [1098902, 1013002, 819127, 765692, 621159, 595363, 539569, 373205, 315363, 263262, 1221] },
    		 {id: 75,
    		  name: "基里巴斯",
    		  lifeExpectancy: 68.37,
    		  demographics: [29279, 23045, 20596, 16281, 10981, 9781, 4873, 2205, 567],
    		  majorCauses: ['其他非传染性疾病', '营养不足', '其他传染病', '呼吸疾病', '新生儿疾病', '自杀', '肌肉骨骼疾病', '呼吸疾病', '消化系统疾病', '脑膜炎'],
    		  majorDeaths: [270, 121, 93, 63, 57, 54, 44, 41, 33, 30],
    		  diseaseNames: ['其他非传染性疾病', '冲突与恐怖主义', '自残', '新生儿疾病', '运输伤害', '其他传染病', '呼吸疾病', '人际暴力', '肌肉骨骼疾病', '精神和物质使用障碍'],
    		  diseaseDALYs: [8817, 6413, 5760, 5386, 3723, 3039, 2700, 2106, 1748, 1689],
    		  riskFactors: ['高胆固醇', '非独家母乳喂养', '维生素A缺乏症', '二手烟', '水果饮食偏少', '用药', '空气污染（室内和室外）', '饮食含盐量高', '饮食中蔬菜含量低', '高血压'],
    		  riskDALYs: [9248, 7767, 6072, 4513, 3980, 2668, 2375, 2255, 1629, 1457] },
    		 {id: 76,
    		  name: "科威特",
    		  lifeExpectancy: 75.49,
    		  demographics: [615731, 509329, 462476, 916067, 936319, 514790, 197771, 44686, 9908],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '结核', '自然灾害', '肌肉骨骼疾病', '营养不足', 'COVID-19，直到2020年5月27日', '新生儿疾病', '肥胖', '呼吸疾病'],
    		  majorDeaths: [3094, 1233, 573, 529, 324, 262, 217, 177, 173, 172, 166],
    		  diseaseNames: ['其他非传染性疾病', '肝病', '神经系统疾病', '运输伤害', '营养不足', '冲突与恐怖主义', '其他传染病', '艾滋病毒/艾滋病与结核病', '新生儿疾病', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [87091, 83602, 79495, 50897, 48788, 48403, 35261, 33603, 32252, 28823, 4153],
    		  riskFactors: ['非独家母乳喂养', '高胆固醇', '二手烟', '维生素A缺乏症', '饮食含盐量高', '低体力活动', '水果饮食偏少', '用药', '高血压', 'COVID-19，直到2020年5月27日', '肥胖'],
    		  riskDALYs: [83006, 51389, 51249, 42806, 39135, 35312, 31345, 16962, 10359, 9365, 4153] },
    		 {id: 77,
    		  name: "吉尔吉斯斯坦",
    		  lifeExpectancy: 71.45,
    		  demographics: [1513166, 1067795, 1104469, 977554, 673651, 576005, 340820, 103872, 58519],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '肌肉骨骼疾病', '心血管疾病', '新生儿疾病', '呼吸疾病', '结核', '呼吸疾病', '自然灾害', '脑膜炎', '肥胖'],
    		  majorDeaths: [16557, 3709, 2495, 2159, 1842, 1393, 884, 854, 824, 594, 16],
    		  diseaseNames: ['其他非传染性疾病', '新生儿疾病', '自残', '肌肉骨骼疾病', '其他传染病', '运输伤害', '疟疾和被忽视的热带病', '营养不足', '神经系统疾病', '肝病', '肥胖'],
    		  diseaseDALYs: [343877, 188505, 131432, 109728, 108236, 97255, 94677, 80365, 79860, 79635, 305],
    		  riskFactors: ['二手烟', '高胆固醇', '非独家母乳喂养', '维生素A缺乏症', '饮食含盐量高', '水果饮食偏少', '用药', 'COVID-19，直到2020年5月27日', '抽烟', '低体力活动', '肥胖'],
    		  riskDALYs: [181555, 131066, 125338, 114377, 105735, 81421, 71032, 38858, 38235, 35181, 305] },
    		 {id: 78,
    		  name: "老挝",
    		  lifeExpectancy: 67.92,
    		  demographics: [1565148, 1456114, 1358326, 1054965, 749666, 509532, 304392, 130858, 40455],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '新生儿疾病', '呼吸疾病', '肌肉骨骼疾病', '结核', '心血管疾病', '消化系统疾病', '自杀', '肥胖'],
    		  majorDeaths: [13145, 4735, 3756, 3542, 2605, 2540, 1690, 1595, 1582, 1551, 0],
    		  diseaseNames: ['自残', '其他非传染性疾病', '新生儿疾病', '运输伤害', '其他传染病', '冲突与恐怖主义', '艾滋病毒/艾滋病与结核病', '呼吸疾病', '疟疾和被忽视的热带病', '肝病', '肥胖'],
    		  diseaseDALYs: [580354, 342443, 337627, 192109, 144731, 136833, 112789, 104873, 103883, 97528, 0],
    		  riskFactors: ['水果饮食偏少', '二手烟', '空气污染（室内和室外）', '高胆固醇', '维生素A缺乏症', '非独家母乳喂养', '缺铁', '饮食含盐量高', '高血压', '用药', '肥胖'],
    		  riskDALYs: [222829, 198600, 192745, 190221, 155967, 110542, 87473, 84290, 67491, 64915, 0] },
    		 {id: 79,
    		  name: "拉脫維亞",
    		  lifeExpectancy: 75.29,
    		  demographics: [209188, 184856, 205890, 262698, 256776, 269669, 243007, 165298, 109358],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '肌肉骨骼疾病', '脑膜炎', '心血管疾病', '呼吸疾病', '呼吸疾病', '营养不足', '痴呆', '肥胖'],
    		  majorDeaths: [15463, 5621, 1740, 998, 438, 434, 434, 379, 320, 294, 22],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '疟疾和被忽视的热带病', '肝病', '营养不足', '冲突与恐怖主义', '肌肉骨骼疾病', '神经系统疾病', '运输伤害', '呼吸疾病', '肥胖'],
    		  diseaseDALYs: [251875, 119164, 56908, 52574, 46943, 35877, 33911, 31469, 25380, 17912, 282],
    		  riskFactors: ['二手烟', '维生素A缺乏症', '非独家母乳喂养', '高胆固醇', '饮食含盐量高', '用药', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '不安全的水源', '饮食中蔬菜含量低', '肥胖'],
    		  riskDALYs: [155232, 109735, 105412, 89377, 81725, 38011, 31230, 29007, 19450, 18458, 282] },
    		 {id: 80,
    		  name: "黎巴嫩",
    		  lifeExpectancy: 78.93,
    		  demographics: [1183784, 1159529, 1186188, 1009919, 862619, 713217, 433181, 202860, 104411],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '营养不足', '呼吸疾病', '肌肉骨骼疾病', '呼吸疾病', 'COVID-19，直到2020年5月27日', '结核', '新生儿疾病', '肥胖'],
    		  majorDeaths: [14094, 7703, 1866, 1614, 1175, 833, 739, 594, 562, 557, 26],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '神经系统疾病', '肝病', '营养不足', '运输伤害', '冲突与恐怖主义', '新生儿疾病', '呼吸疾病', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [277882, 211228, 156612, 131367, 117713, 93176, 89925, 82542, 73834, 60861, 440],
    		  riskFactors: ['非独家母乳喂养', '高胆固醇', '维生素A缺乏症', '二手烟', '低体力活动', '水果饮食偏少', '饮食含盐量高', '高血压', '用药', '不安全的水源', '肥胖'],
    		  riskDALYs: [210233, 191855, 176671, 168709, 98764, 78426, 69882, 33327, 32854, 29616, 440] },
    		 {id: 81,
    		  name: "莱索托",
    		  lifeExpectancy: 54.33,
    		  demographics: [476585, 430608, 395150, 322798, 202120, 139177, 94839, 47103, 16887],
    		  majorCauses: ['产妇疾病', '其他非传染性疾病', '自杀', '其他传染病', '呼吸疾病', '消化系统疾病', '营养不足', '呼吸疾病', '新生儿疾病', '结核', '肥胖'],
    		  majorDeaths: [6331, 4007, 1932, 1798, 1573, 1225, 1114, 1046, 866, 803, 0],
    		  diseaseNames: ['COVID-19，直到2020年5月27日', '自残', '其他非传染性疾病', '新生儿疾病', '冲突与恐怖主义', '其他传染病', '艾滋病毒/艾滋病与结核病', '消化系统疾病', '呼吸疾病', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [699820, 221340, 98860, 82394, 66194, 53096, 49314, 47954, 41436, 36752, 0],
    		  riskFactors: ['高胆固醇', '二手烟', '水果饮食偏少', '维生素A缺乏症', '缺铁', '非独家母乳喂养', '空气污染（室内和室外）', '不安全的卫生', '用药', '儿童发育不良', '肥胖'],
    		  riskDALYs: [90169, 65890, 64292, 61167, 60136, 57484, 50694, 45920, 26756, 19203, 0] },
    		 {id: 82,
    		  name: "利比里亚",
    		  lifeExpectancy: 64.1,
    		  demographics: [1400348, 1148335, 813535, 616321, 428711, 274075, 161538, 74640, 19871],
    		  majorCauses: ['其他非传染性疾病', '冲突', '消化系统疾病', '新生儿疾病', '呼吸疾病', '其他传染病', '产妇疾病', '自杀', '肌肉骨骼疾病', '心血管疾病', '肥胖'],
    		  majorDeaths: [4414, 2810, 2503, 2442, 2317, 2118, 1840, 1495, 1232, 733, 26],
    		  diseaseNames: ['自残', '糖尿病，血液和内分泌疾病', '新生儿疾病', 'COVID-19，直到2020年5月27日', '运输伤害', '其他非传染性疾病', '人际暴力', '冲突与恐怖主义', '其他传染病', '营养不足', '肥胖'],
    		  diseaseDALYs: [488681, 293930, 236278, 153800, 136832, 115273, 90505, 80720, 63432, 59778, 547],
    		  riskFactors: ['空气污染（室内和室外）', '缺铁', '水果饮食偏少', '不安全的卫生', '二手烟', '儿童发育不良', '高胆固醇', '非独家母乳喂养', '抽烟', '高血糖', '肥胖'],
    		  riskDALYs: [174555, 143231, 106021, 103123, 75963, 69593, 62246, 56236, 54699, 41929, 547] },
    		 {id: 83,
    		  name: "利比亚",
    		  lifeExpectancy: 72.91,
    		  demographics: [1291223, 1165300, 1102957, 1165502, 1020549, 574557, 269932, 135923, 51510],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '结核', '下呼吸道感染', '自然灾害', '营养不足', '呼吸疾病', 'COVID-19，直到2020年5月27日', '肌肉骨骼疾病', '呼吸疾病', '肥胖'],
    		  majorDeaths: [13334, 5586, 1701, 1525, 1508, 1405, 1205, 1181, 878, 842, 3],
    		  diseaseNames: ['其他非传染性疾病', '艾滋病毒/艾滋病与结核病', '其他传染病', '腹泻和常见传染病', '肝病', '冲突与恐怖主义', '神经系统疾病', '营养不足', '运输伤害', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [328433, 169622, 169432, 129405, 125922, 124647, 122767, 101482, 88270, 72970, 59],
    		  riskFactors: ['非独家母乳喂养', '二手烟', '高胆固醇', '低体力活动', '水果饮食偏少', '维生素A缺乏症', '饮食含盐量高', '用药', '高血压', '不安全的水源', '肥胖'],
    		  riskDALYs: [227177, 216077, 193983, 113035, 94613, 86942, 83501, 55052, 34933, 31056, 59] },
    		 {id: 84,
    		  name: "立陶宛",
    		  lifeExpectancy: 75.93,
    		  demographics: [296367, 248144, 341343, 336898, 366880, 428804, 342601, 228011, 170583],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '肌肉骨骼疾病', '自然灾害', '脑膜炎', '心血管疾病', '呼吸疾病', '呼吸疾病', '痴呆', '结核', '肥胖'],
    		  majorDeaths: [22251, 8075, 2024, 1997, 1033, 942, 782, 704, 359, 325, 65],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '疟疾和被忽视的热带病', '肝病', '肌肉骨骼疾病', '营养不足', '神经系统疾病', '精神和物质使用障碍', '冲突与恐怖主义', '运输伤害', '肥胖'],
    		  diseaseDALYs: [345229, 175044, 92378, 76396, 65565, 65345, 50956, 40077, 40052, 37358, 824],
    		  riskFactors: ['二手烟', '维生素A缺乏症', '非独家母乳喂养', '饮食含盐量高', '高胆固醇', '用药', 'COVID-19，直到2020年5月27日', '水果饮食偏少', '不安全的水源', '饮食中蔬菜含量低', '肥胖'],
    		  riskDALYs: [228930, 150010, 137263, 122854, 106816, 46928, 43265, 41843, 30148, 28203, 824] },
    		 {id: 85,
    		  name: "卢森堡",
    		  lifeExpectancy: 82.25,
    		  demographics: [65213, 66256, 84625, 95914, 93536, 88767, 60144, 36676, 24599],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '呼吸疾病', '肌肉骨骼疾病', '呼吸疾病', '肥胖', '心血管疾病', 'COVID-19，直到2020年5月27日', '脑膜炎', '营养不足'],
    		  majorDeaths: [1397, 1306, 440, 237, 227, 146, 110, 99, 85, 69, 64],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '肝病', '营养不足', '神经系统疾病', '疟疾和被忽视的热带病', '冲突与恐怖主义', '呼吸疾病', '运输伤害', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [25726, 20631, 17093, 13528, 11354, 7441, 7178, 6819, 5929, 5905, 1533],
    		  riskFactors: ['维生素A缺乏症', '高胆固醇', '二手烟', '非独家母乳喂养', '饮食含盐量高', '水果饮食偏少', '低体力活动', 'COVID-19，直到2020年5月27日', '不安全的水源', '肥胖', '饮食中蔬菜含量低'],
    		  riskDALYs: [16915, 13697, 12220, 12139, 4597, 3660, 2657, 2172, 1544, 1533, 1412] },
    		 {id: 86,
    		  name: "馬其頓共和國",
    		  lifeExpectancy: 75.8,
    		  demographics: [228330, 236205, 290417, 326362, 297862, 282001, 240622, 129154, 52505],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '营养不足', '呼吸疾病', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '心血管疾病', '脑膜炎', '结核', '肥胖'],
    		  majorDeaths: [10518, 4378, 848, 745, 534, 465, 309, 235, 191, 161, 116],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '冲突与恐怖主义', '疟疾和被忽视的热带病', '营养不足', '神经系统疾病', '运输伤害', '新生儿疾病', '呼吸疾病', '肥胖'],
    		  diseaseDALYs: [190895, 108056, 46978, 44928, 42217, 37051, 31369, 24413, 23155, 22465, 1757],
    		  riskFactors: ['二手烟', '维生素A缺乏症', '高胆固醇', '非独家母乳喂养', '饮食含盐量高', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '用药', '高血压', '不安全的水源', '肥胖'],
    		  riskDALYs: [122094, 120255, 100479, 90355, 48532, 41927, 28845, 24530, 17622, 11510, 1757] },
    		 {id: 87,
    		  name: "马达加斯加",
    		  lifeExpectancy: 67.04,
    		  demographics: [7613806, 6226365, 4738874, 3267437, 2307708, 1484094, 874455, 343514, 113053],
    		  majorCauses: ['其他非传染性疾病', '消化系统疾病', '呼吸疾病', '新生儿疾病', '其他传染病', '人际暴力', '帕金森氏病', '呼吸疾病', '肌肉骨骼疾病', '冲突', '肥胖'],
    		  majorDeaths: [34526, 23378, 19854, 17584, 11740, 11669, 11453, 6402, 6017, 5799, 2],
    		  diseaseNames: ['自残', '新生儿疾病', '人际暴力', '其他非传染性疾病', '运输伤害', '意外伤害', '糖尿病，血液和内分泌疾病', '其他传染病', '疟疾和被忽视的热带病', '神经系统疾病', '肥胖'],
    		  diseaseDALYs: [3237251, 1641588, 1063864, 999114, 725114, 604605, 488825, 407861, 343230, 335685, 42],
    		  riskFactors: ['空气污染（室内和室外）', '缺铁', '不安全的卫生', '水果饮食偏少', '二手烟', '儿童发育不良', '高血糖', '高胆固醇', '儿童发育迟缓', '用药', '肥胖'],
    		  riskDALYs: [2307218, 1393535, 1116685, 947467, 593032, 568745, 523072, 348713, 273471, 213170, 42] },
    		 {id: 88,
    		  name: "马拉维",
    		  lifeExpectancy: 64.26,
    		  demographics: [5597505, 4605388, 3277849, 2195464, 1381160, 811930, 465000, 236664, 57788],
    		  majorCauses: ['产妇疾病', '其他非传染性疾病', '新生儿疾病', '其他传染病', '呼吸疾病', '自杀', '消化系统疾病', '冲突', '肌肉骨骼疾病', '营养不足', '肥胖'],
    		  majorDeaths: [21935, 15006, 11082, 10093, 9426, 7225, 7061, 6884, 5616, 2642, 4],
    		  diseaseNames: ['COVID-19，直到2020年5月27日', '自残', '新生儿疾病', '糖尿病，血液和内分泌疾病', '运输伤害', '其他非传染性疾病', '其他传染病', '人际暴力', '疟疾和被忽视的热带病', '冲突与恐怖主义', '肥胖'],
    		  diseaseDALYs: [2089369, 1833682, 1055239, 543959, 500729, 362649, 352625, 337524, 227082, 224552, 88],
    		  riskFactors: ['空气污染（室内和室外）', '水果饮食偏少', '缺铁', '不安全的卫生', '二手烟', '高胆固醇', '儿童发育不良', '抽烟', '非独家母乳喂养', '维生素A缺乏症', '肥胖'],
    		  riskDALYs: [451940, 381809, 343107, 264097, 259254, 251827, 190735, 145811, 121910, 107264, 88] },
    		 {id: 89,
    		  name: "马来西亚",
    		  lifeExpectancy: 76.16,
    		  demographics: [5098216, 5185143, 5784427, 5525337, 3884381, 3080289, 2069406, 965368, 357222],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '肌肉骨骼疾病', '结核', '自然灾害', '呼吸疾病', 'COVID-19，直到2020年5月27日', '心血管疾病', '脑膜炎', '肥胖'],
    		  majorDeaths: [57288, 27057, 23692, 7061, 6946, 5887, 5770, 4731, 3082, 2281, 115],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '冲突与恐怖主义', '自残', '神经系统疾病', '肝病', '艾滋病毒/艾滋病与结核病', '运输伤害', '营养不足', '呼吸疾病', '肥胖'],
    		  diseaseDALYs: [1352218, 699187, 489333, 485542, 473585, 444888, 418419, 359023, 356901, 242767, 2050],
    		  riskFactors: ['二手烟', '非独家母乳喂养', '维生素A缺乏症', '高胆固醇', '饮食含盐量高', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '用药', '饮食中蔬菜含量低', '高血压', '肥胖'],
    		  riskDALYs: [906745, 677680, 648420, 597790, 488883, 311272, 290148, 231226, 192134, 155544, 2050] },
    		 {id: 90,
    		  name: "马尔代夫",
    		  lifeExpectancy: 78.92,
    		  demographics: [73852, 60061, 140970, 127233, 62492, 35683, 17665, 8722, 4278],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', 'COVID-19，直到2020年5月27日', '自然灾害', '营养不足', '结核', '肌肉骨骼疾病', '新生儿疾病', '呼吸疾病', '肥胖'],
    		  majorDeaths: [422, 163, 102, 68, 68, 36, 33, 31, 28, 28, 5],
    		  diseaseNames: ['其他非传染性疾病', '肝病', '神经系统疾病', '冲突与恐怖主义', '营养不足', '运输伤害', '其他传染病', '新生儿疾病', '呼吸疾病', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [9055, 6687, 6304, 5798, 4981, 4681, 4195, 3731, 3720, 2289, 103],
    		  riskFactors: ['二手烟', '高胆固醇', '维生素A缺乏症', '非独家母乳喂养', '饮食含盐量高', 'COVID-19，直到2020年5月27日', '水果饮食偏少', '抽烟', '高血压', '用药', '肥胖'],
    		  riskDALYs: [6038, 6025, 4954, 4660, 3006, 1777, 1700, 1432, 1253, 1218, 103] },
    		 {id: 91,
    		  name: "马里",
    		  lifeExpectancy: 59.31,
    		  demographics: [6628593, 4826908, 3089563, 2106937, 1431058, 810331, 488133, 225734, 50765],
    		  majorCauses: ['新生儿疾病', '冲突', '其他非传染性疾病', '消化系统疾病', '呼吸疾病', '其他传染病', '人际暴力', '帕金森氏病', '产妇疾病', '肝病', '肥胖'],
    		  majorDeaths: [26640, 25080, 18035, 15386, 11586, 10410, 6686, 6478, 5807, 5728, 70],
    		  diseaseNames: ['新生儿疾病', '自残', '糖尿病，血液和内分泌疾病', '人际暴力', '运输伤害', '疟疾和被忽视的热带病', '其他非传染性疾病', '意外伤害', '其他传染病', 'COVID-19，直到2020年5月27日', '肥胖'],
    		  diseaseDALYs: [2363306, 2339166, 2198476, 960655, 917119, 505199, 497276, 461405, 345514, 340900, 1574],
    		  riskFactors: ['空气污染（室内和室外）', '缺铁', '不安全的卫生', '水果饮食偏少', '儿童发育不良', '抽烟', '二手烟', '高胆固醇', '高血糖', '儿童发育迟缓', '肥胖'],
    		  riskDALYs: [1632950, 852513, 654240, 636002, 421451, 335071, 240844, 216570, 200341, 175715, 1574] },
    		 {id: 92,
    		  name: "马耳他",
    		  lifeExpectancy: 82.53,
    		  demographics: [42898, 41262, 56840, 65191, 58253, 54234, 57908, 43005, 20785],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '呼吸疾病', '呼吸疾病', '肌肉骨骼疾病', '营养不足', 'COVID-19，直到2020年5月27日', '糖尿病', '心血管疾病', '肥胖'],
    		  majorDeaths: [1569, 1042, 331, 173, 172, 127, 117, 94, 54, 44, 6],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '营养不足', '神经系统疾病', '冲突与恐怖主义', '疟疾和被忽视的热带病', '运输伤害', '呼吸疾病', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [22705, 20259, 14018, 9810, 8075, 6672, 5952, 5074, 4816, 3573, 79],
    		  riskFactors: ['高胆固醇', '维生素A缺乏症', '二手烟', '非独家母乳喂养', '饮食含盐量高', '水果饮食偏少', '用药', '不安全的水源', 'COVID-19，直到2020年5月27日', '低体力活动', '肥胖'],
    		  riskDALYs: [17301, 15351, 13755, 12623, 6457, 4612, 2916, 2501, 2303, 1637, 79] },
    		 {id: 93,
    		  name: "毛里塔尼亚",
    		  lifeExpectancy: 64.92,
    		  demographics: [1282240, 981572, 770505, 601045, 405733, 256724, 144249, 64944, 18685],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '新生儿疾病', '呼吸疾病', '消化系统疾病', '肌肉骨骼疾病', '结核', '呼吸疾病', '自然灾害', '自杀', '肥胖'],
    		  majorDeaths: [3924, 2309, 1998, 1895, 1490, 900, 674, 600, 559, 542, 9],
    		  diseaseNames: ['自残', '新生儿疾病', '其他非传染性疾病', '运输伤害', '人际暴力', '其他传染病', '冲突与恐怖主义', '营养不足', '神经系统疾病', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [254069, 196903, 90510, 73989, 65102, 62379, 61153, 50133, 45926, 43310, 191],
    		  riskFactors: ['空气污染（室内和室外）', '缺铁', '水果饮食偏少', '二手烟', '不安全的卫生', '高胆固醇', '非独家母乳喂养', '抽烟', '儿童发育不良', '用药', '肥胖'],
    		  riskDALYs: [110162, 75285, 63864, 58706, 57685, 53308, 49965, 35213, 28530, 21226, 191] },
    		 {id: 94,
    		  name: "毛里求斯",
    		  lifeExpectancy: 74.99,
    		  demographics: [135453, 179059, 197068, 175844, 179920, 176623, 134345, 64819, 26539],
    		  majorCauses: ['其他非传染性疾病', '营养不足', '其他传染病', 'COVID-19，直到2020年5月27日', '呼吸疾病', '自然灾害', '肌肉骨骼疾病', '呼吸疾病', '心血管疾病', '结核', '肥胖'],
    		  majorDeaths: [3310, 1729, 1394, 1070, 498, 454, 364, 307, 238, 165, 10],
    		  diseaseNames: ['冲突与恐怖主义', '其他非传染性疾病', '其他传染病', '肝病', '神经系统疾病', '营养不足', '呼吸疾病', '运输伤害', '肌肉骨骼疾病', '新生儿疾病', '肥胖'],
    		  diseaseDALYs: [79944, 70327, 35256, 26345, 20285, 20158, 16221, 15583, 12012, 11526, 158],
    		  riskFactors: ['高胆固醇', '非独家母乳喂养', '二手烟', '维生素A缺乏症', '饮食含盐量高', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '用药', '高血压', '饮食中蔬菜含量低', '肥胖'],
    		  riskDALYs: [102301, 63996, 57090, 32659, 22601, 21407, 18203, 17779, 11031, 8333, 158] },
    		 {id: 95,
    		  name: "墨西哥",
    		  lifeExpectancy: 75.05,
    		  demographics: [22245383, 22356958, 21623928, 18636625, 16343173, 12397493, 7946332, 4023962, 2001674],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', 'COVID-19，直到2020年5月27日', '营养不足', '肌肉骨骼疾病', '恐怖主义', '心血管疾病', '呼吸疾病', '自然灾害', '呼吸疾病', '肥胖'],
    		  majorDeaths: [161783, 97282, 65033, 64067, 62517, 43160, 40509, 34316, 32865, 21838, 8134],
    		  diseaseNames: ['冲突与恐怖主义', '其他非传染性疾病', '其他传染病', '运输伤害', '肌肉骨骼疾病', '营养不足', '神经系统疾病', '新生儿疾病', '消化系统疾病', '肝病', '肥胖'],
    		  diseaseDALYs: [4498557, 3180705, 2495963, 1967719, 1871651, 1793491, 1775959, 1617529, 1585274, 1544903, 135796],
    		  riskFactors: ['高胆固醇', '非独家母乳喂养', '二手烟', '水果饮食偏少', '维生素A缺乏症', '饮食含盐量高', '低体力活动', '用药', '饮食中蔬菜含量低', '空气污染（室内和室外）', '肥胖'],
    		  riskDALYs: [4873713, 3759331, 2371373, 1354813, 1278981, 923310, 644737, 513416, 413363, 360087, 135796] },
    		 {id: 96,
    		  name: "摩尔多瓦",
    		  lifeExpectancy: 71.9,
    		  demographics: [429166, 418687, 608197, 760165, 548003, 534327, 475100, 177807, 91806],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '肌肉骨骼疾病', '心血管疾病', '自然灾害', '呼吸疾病', '呼吸疾病', '脑膜炎', '痴呆', '结核', '肥胖'],
    		  majorDeaths: [23194, 6307, 3863, 3094, 1340, 949, 916, 650, 485, 442, 267],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肌肉骨骼疾病', '疟疾和被忽视的热带病', '心血管疾病', '肝病', '营养不足', '运输伤害', '神经系统疾病', '冲突与恐怖主义', '肥胖'],
    		  diseaseDALYs: [426732, 173334, 133420, 101346, 92512, 83133, 65702, 59834, 58427, 56486, 4246],
    		  riskFactors: ['二手烟', '维生素A缺乏症', '非独家母乳喂养', '高胆固醇', '饮食含盐量高', '用药', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '饮食中蔬菜含量低', '低体力活动', '肥胖'],
    		  riskDALYs: [297875, 188075, 179833, 147746, 135227, 77300, 69090, 40474, 39500, 29548, 4246] },
    		 {id: 97,
    		  name: "蒙古国",
    		  lifeExpectancy: 69.87,
    		  demographics: [727414, 480990, 518734, 551697, 414977, 305432, 147247, 58191, 20484],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '肌肉骨骼疾病', '心血管疾病', '新生儿疾病', '呼吸疾病', '结核', '脑膜炎', '痴呆', '自杀', '肥胖'],
    		  majorDeaths: [7770, 4811, 1835, 1374, 941, 660, 546, 525, 487, 367, 0],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '新生儿疾病', '疟疾和被忽视的热带病', '肌肉骨骼疾病', '自残', '运输伤害', '神经系统疾病', '心血管疾病', '肝病', '肥胖'],
    		  diseaseDALYs: [198831, 129353, 97033, 84895, 66416, 57022, 55155, 44909, 43044, 41857, 0],
    		  riskFactors: ['二手烟', '非独家母乳喂养', '维生素A缺乏症', '高胆固醇', '水果饮食偏少', '饮食含盐量高', '用药', '饮食中蔬菜含量低', 'COVID-19，直到2020年5月27日', '低体力活动', '肥胖'],
    		  riskDALYs: [132567, 95931, 89189, 66733, 60963, 54502, 54205, 32968, 30890, 17372, 0] },
    		 {id: 98,
    		  name: "蒙特內哥羅",
    		  lifeExpectancy: 76.88,
    		  demographics: [74487, 78919, 84827, 88916, 82984, 81320, 75907, 38922, 21706],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '营养不足', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '呼吸疾病', '脑膜炎', '呼吸疾病', '结核', '肥胖'],
    		  majorDeaths: [3737, 1401, 354, 162, 156, 127, 86, 77, 68, 57, 9],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '疟疾和被忽视的热带病', '营养不足', '冲突与恐怖主义', '神经系统疾病', '肌肉骨骼疾病', '运输伤害', '呼吸疾病', '肥胖'],
    		  diseaseDALYs: [62760, 31982, 14414, 13327, 11507, 10931, 9243, 6119, 6077, 4768, 128],
    		  riskFactors: ['维生素A缺乏症', '二手烟', '高胆固醇', '非独家母乳喂养', '饮食含盐量高', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '高血压', '用药', '不安全的水源', '肥胖'],
    		  riskDALYs: [44250, 38418, 31099, 25922, 13968, 11166, 8611, 5067, 3646, 2982, 128] },
    		 {id: 99,
    		  name: "摩洛哥",
    		  lifeExpectancy: 76.68,
    		  demographics: [6750500, 6039210, 5923781, 5535929, 4352251, 3698794, 2589647, 1147171, 434483],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '营养不足', '呼吸疾病', '结核', '肌肉骨骼疾病', '呼吸疾病', '新生儿疾病', '自杀', '肥胖'],
    		  majorDeaths: [115124, 24505, 9343, 8062, 7680, 7264, 5932, 5846, 5596, 4883, 202],
    		  diseaseNames: ['其他非传染性疾病', '冲突与恐怖主义', '肝病', '神经系统疾病', '运输伤害', '其他传染病', '新生儿疾病', '营养不足', '艾滋病毒/艾滋病与结核病', '自残', '肥胖'],
    		  diseaseDALYs: [2424457, 822462, 762679, 753673, 718496, 694746, 650262, 533369, 427572, 422025, 3522],
    		  riskFactors: ['二手烟', '高胆固醇', '非独家母乳喂养', '维生素A缺乏症', '水果饮食偏少', '饮食含盐量高', '低体力活动', '用药', '不安全的水源', '高血压', '肥胖'],
    		  riskDALYs: [1611294, 1230615, 1207573, 567167, 556488, 542224, 288828, 236464, 232814, 201191, 3522] },
    		 {id: 100,
    		  name: "莫桑比克",
    		  lifeExpectancy: 60.85,
    		  demographics: [9513591, 7385303, 5101440, 3473273, 2201317, 1354583, 822822, 408321, 105393],
    		  majorCauses: ['产妇疾病', '其他非传染性疾病', '新生儿疾病', '自杀', '冲突', '其他传染病', '呼吸疾病', '消化系统疾病', '肌肉骨骼疾病', '结核', '肥胖'],
    		  majorDeaths: [62135, 29833, 19375, 19234, 18423, 15826, 13895, 10689, 7118, 5078, 1],
    		  diseaseNames: ['COVID-19，直到2020年5月27日', '自残', '新生儿疾病', '糖尿病，血液和内分泌疾病', '运输伤害', '其他非传染性疾病', '其他传染病', '人际暴力', '疟疾和被忽视的热带病', '意外伤害', '肥胖'],
    		  diseaseDALYs: [4502707, 2510552, 1803582, 1444655, 942494, 816402, 533977, 526835, 446614, 439306, 21],
    		  riskFactors: ['空气污染（室内和室外）', '水果饮食偏少', '二手烟', '缺铁', '高胆固醇', '不安全的卫生', '维生素A缺乏症', '儿童发育不良', '抽烟', '非独家母乳喂养', '肥胖'],
    		  riskDALYs: [645149, 639320, 587290, 562820, 476274, 431306, 322649, 292189, 289796, 232296, 21] },
    		 {id: 101,
    		  name: "缅甸",
    		  lifeExpectancy: 67.13,
    		  demographics: [9083867, 9994005, 9099437, 8049551, 7142439, 5431377, 3466856, 1354931, 422959],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '肌肉骨骼疾病', '营养不足', '心血管疾病', '呼吸疾病', '自然灾害', '自杀', '新生儿疾病', '肥胖'],
    		  majorDeaths: [77463, 60066, 55535, 28411, 27217, 23171, 22582, 14445, 13540, 13244, 6],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '自残', '呼吸疾病', '新生儿疾病', '运输伤害', '冲突与恐怖主义', '肌肉骨骼疾病', '疟疾和被忽视的热带病', '心血管疾病', '肥胖'],
    		  diseaseDALYs: [1819145, 1696478, 1482854, 1458830, 1337542, 1201088, 1073858, 1048747, 837214, 815314, 114],
    		  riskFactors: ['高胆固醇', '维生素A缺乏症', '水果饮食偏少', '二手烟', '非独家母乳喂养', '空气污染（室内和室外）', '用药', '高血压', 'COVID-19，直到2020年5月27日', '饮食含盐量高', '肥胖'],
    		  riskDALYs: [1926019, 1681663, 1423169, 1219220, 753714, 522751, 500424, 376337, 349445, 347466, 114] },
    		 {id: 102,
    		  name: "纳米比亚",
    		  lifeExpectancy: 63.71,
    		  demographics: [647177, 516584, 469261, 345891, 230228, 146063, 83896, 40705, 14719],
    		  majorCauses: ['产妇疾病', '其他非传染性疾病', '其他传染病', '呼吸疾病', '自杀', '新生儿疾病', '消化系统疾病', '呼吸疾病', '肌肉骨骼疾病', '营养不足', '肥胖'],
    		  majorDeaths: [3960, 3003, 1554, 1148, 869, 830, 813, 652, 595, 546, 0],
    		  diseaseNames: ['COVID-19，直到2020年5月27日', '自残', '新生儿疾病', '其他非传染性疾病', '冲突与恐怖主义', '其他传染病', '神经系统疾病', '呼吸疾病', '艾滋病毒/艾滋病与结核病', '运输伤害', '肥胖'],
    		  diseaseDALYs: [288137, 136433, 77834, 60792, 43694, 43575, 32037, 27889, 27786, 27353, 0],
    		  riskFactors: ['高胆固醇', '空气污染（室内和室外）', '二手烟', '缺铁', '水果饮食偏少', '非独家母乳喂养', '维生素A缺乏症', '不安全的卫生', '用药', '低体力活动', '肥胖'],
    		  riskDALYs: [49467, 46679, 39352, 37616, 35866, 34031, 29709, 26189, 13623, 13050, 0] },
    		 {id: 103,
    		  name: "尼泊尔",
    		  lifeExpectancy: 70.78,
    		  demographics: [5479855, 6205791, 5664808, 3628380, 2958204, 2219564, 1443408, 791816, 216888],
    		  majorCauses: ['其他非传染性疾病', '呼吸疾病', '其他传染病', '消化系统疾病', '肌肉骨骼疾病', '呼吸疾病', '新生儿疾病', '结核', '心血管疾病', '营养不足', '肥胖'],
    		  majorDeaths: [49248, 23583, 18315, 10796, 9756, 9297, 8577, 6787, 5671, 5248, 4],
    		  diseaseNames: ['自残', '其他非传染性疾病', '新生儿疾病', '呼吸疾病', '肝病', '其他传染病', '冲突与恐怖主义', '神经系统疾病', '营养不足', '艾滋病毒/艾滋病与结核病', '肥胖'],
    		  diseaseDALYs: [1237825, 1131125, 930734, 657083, 546530, 492945, 492677, 450672, 440915, 371137, 74],
    		  riskFactors: ['水果饮食偏少', '二手烟', '维生素A缺乏症', '高胆固醇', '饮食含盐量高', '非独家母乳喂养', '缺铁', '空气污染（室内和室外）', '用药', '抽烟', '肥胖'],
    		  riskDALYs: [783254, 589863, 585357, 475856, 323761, 308529, 253407, 217534, 215390, 157424, 74] },
    		 {id: 104,
    		  name: "荷兰",
    		  lifeExpectancy: 82.28,
    		  demographics: [1762690, 1973468, 2106722, 2075858, 2201959, 2520370, 2109482, 1526904, 819669],
    		  majorCauses: ['其他传染病', '其他非传染性疾病', '自然灾害', '呼吸疾病', '呼吸疾病', '肥胖', '肌肉骨骼疾病', '营养不足', 'COVID-19，直到2020年5月27日', '脑膜炎', '糖尿病'],
    		  majorDeaths: [51854, 40564, 14836, 10109, 6178, 5856, 5649, 2729, 2683, 2066, 1792],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '肝病', '营养不足', '神经系统疾病', '呼吸疾病', '冲突与恐怖主义', '运输伤害', '疟疾和被忽视的热带病', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [987417, 581670, 576427, 405596, 365519, 255064, 246098, 201647, 181251, 123640, 77616],
    		  riskFactors: ['维生素A缺乏症', '高胆固醇', '二手烟', '非独家母乳喂养', '饮食含盐量高', '水果饮食偏少', '肥胖', '用药', '饮食中蔬菜含量低', '高血压', 'COVID-19，直到2020年5月27日'],
    		  riskDALYs: [694184, 425666, 349213, 329885, 146262, 137009, 77616, 66875, 48295, 45238, 45173] },
    		 {id: 105,
    		  name: "新西兰",
    		  lifeExpectancy: 82.29,
    		  demographics: [618147, 620994, 673857, 604748, 598468, 627307, 511426, 346232, 181883],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '呼吸疾病', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '呼吸疾病', '营养不足', '脑膜炎', '糖尿病', '肥胖'],
    		  majorDeaths: [10898, 9838, 2975, 2143, 1000, 773, 728, 556, 537, 377, 21],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '肝病', '神经系统疾病', '疟疾和被忽视的热带病', '营养不足', '呼吸疾病', '冲突与恐怖主义', '运输伤害', '艾滋病毒/艾滋病与结核病', '肥胖'],
    		  diseaseDALYs: [196818, 157168, 133048, 98229, 96355, 81421, 57606, 52563, 48073, 35614, 289],
    		  riskFactors: ['维生素A缺乏症', '非独家母乳喂养', '二手烟', '高胆固醇', '饮食含盐量高', '低体力活动', '用药', 'COVID-19，直到2020年5月27日', '不安全的水源', '水果饮食偏少', '肥胖'],
    		  riskDALYs: [106064, 93286, 82829, 71540, 40974, 18972, 17437, 17432, 15989, 13982, 289] },
    		 {id: 106,
    		  name: "尼加拉瓜",
    		  lifeExpectancy: 74.48,
    		  demographics: [1320595, 1235318, 1169503, 1039838, 735256, 494391, 331884, 144862, 73855],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', 'COVID-19，直到2020年5月27日', '肌肉骨骼疾病', '营养不足', '自然灾害', '心血管疾病', '呼吸疾病', '呼吸疾病', '新生儿疾病', '肥胖'],
    		  majorDeaths: [6033, 3289, 2292, 1579, 1231, 1173, 1127, 877, 849, 848, 35],
    		  diseaseNames: ['冲突与恐怖主义', '其他非传染性疾病', '新生儿疾病', '其他传染病', '运输伤害', '神经系统疾病', '自残', '营养不足', '肝病', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [137933, 118992, 110320, 89278, 87937, 85514, 76249, 75694, 75208, 59384, 630],
    		  riskFactors: ['高胆固醇', '二手烟', '非独家母乳喂养', '水果饮食偏少', '维生素A缺乏症', '饮食含盐量高', '用药', '低体力活动', '空气污染（室内和室外）', '饮食中蔬菜含量低', '肥胖'],
    		  riskDALYs: [124835, 104480, 103370, 50125, 42168, 32233, 25596, 24331, 20732, 19942, 630] },
    		 {id: 107,
    		  name: "尼日尔",
    		  lifeExpectancy: 62.42,
    		  demographics: [8480646, 5660343, 3546877, 2165158, 1479270, 1019589, 621905, 282848, 54083],
    		  majorCauses: ['冲突', '消化系统疾病', '呼吸疾病', '新生儿疾病', '其他非传染性疾病', '其他传染病', '肝病', '自杀', '肌肉骨骼疾病', '呼吸疾病', '肥胖'],
    		  majorDeaths: [30485, 21955, 19710, 16202, 13967, 8177, 7815, 5809, 4412, 3053, 63],
    		  diseaseNames: ['自残', '糖尿病，血液和内分泌疾病', '新生儿疾病', '运输伤害', '人际暴力', '疟疾和被忽视的热带病', '其他非传染性疾病', 'COVID-19，直到2020年5月27日', '冲突与恐怖主义', '其他传染病', '肥胖'],
    		  diseaseDALYs: [3596300, 2479474, 1471369, 640298, 508046, 424815, 402079, 394453, 357992, 262404, 1392],
    		  riskFactors: ['空气污染（室内和室外）', '缺铁', '不安全的卫生', '水果饮食偏少', '儿童发育不良', '高血糖', '儿童发育迟缓', '抽烟', '二手烟', '高胆固醇', '肥胖'],
    		  riskDALYs: [2391690, 1451900, 1142631, 955333, 727289, 600184, 312924, 235597, 219262, 186065, 1392] },
    		 {id: 108,
    		  name: "尼日利亚",
    		  lifeExpectancy: 54.69,
    		  demographics: [62691322, 46319357, 32244205, 23840172, 16454206, 10366004, 6059156, 2555573, 433608],
    		  majorCauses: ['呼吸疾病', '新生儿疾病', '产妇疾病', '冲突', '消化系统疾病', '其他非传染性疾病', '其他传染病', '肌肉骨骼疾病', '自杀', '肝病', '肥胖'],
    		  majorDeaths: [189930, 180355, 169103, 152240, 138359, 122519, 96555, 71076, 57219, 52948, 249],
    		  diseaseNames: ['自残', '新生儿疾病', '糖尿病，血液和内分泌疾病', 'COVID-19，直到2020年5月27日', '运输伤害', '人际暴力', '疟疾和被忽视的热带病', '其他传染病', '其他非传染性疾病', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [22428208, 16451503, 13621942, 8918085, 5304259, 5011258, 3191644, 3107214, 3006460, 2963064, 5630],
    		  riskFactors: ['空气污染（室内和室外）', '缺铁', '水果饮食偏少', '不安全的卫生', '高血糖', '儿童发育不良', '儿童发育迟缓', '抽烟', '二手烟', '高胆固醇', '肥胖'],
    		  riskDALYs: [17020469, 8920346, 7708156, 5675060, 4489373, 4065618, 2815935, 2442647, 1834799, 1307256, 5630] },
    		 {id: 109,
    		  name: "北朝鲜",
    		  lifeExpectancy: 72.27,
    		  demographics: [3415644, 3619103, 3930083, 3583278, 3864207, 3498467, 2008869, 1321013, 425493],
    		  majorCauses: ['其他非传染性疾病', '呼吸疾病', '其他传染病', '肌肉骨骼疾病', '自然灾害', '结核', '呼吸疾病', '心血管疾病', 'COVID-19，直到2020年5月27日', '脑膜炎'],
    		  majorDeaths: [90238, 44378, 41553, 8515, 7394, 5744, 5689, 4657, 3639, 3309],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '肝病', '自残', '冲突与恐怖主义', '疟疾和被忽视的热带病', '神经系统疾病', '艾滋病毒/艾滋病与结核病', '运输伤害'],
    		  diseaseDALYs: [1972988, 1136274, 1044331, 469098, 446368, 429775, 384677, 369114, 349473, 338617],
    		  riskFactors: ['二手烟', '维生素A缺乏症', '水果饮食偏少', '高胆固醇', '用药', 'COVID-19，直到2020年5月27日', '饮食含盐量高', '高血压', '非独家母乳喂养', '低体力活动'],
    		  riskDALYs: [1163781, 976860, 936794, 613016, 457399, 425374, 368085, 261550, 242889, 149500] },
    		 {id: 110,
    		  name: "挪威",
    		  lifeExpectancy: 82.4,
    		  demographics: [616243, 643048, 724428, 727725, 730800, 701457, 581791, 427144, 226223],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '呼吸疾病', '呼吸疾病', '肌肉骨骼疾病', '营养不足', 'COVID-19，直到2020年5月27日', '脑膜炎', '糖尿病', '肥胖'],
    		  majorDeaths: [12886, 11611, 4465, 2639, 1840, 1388, 591, 590, 583, 465, 235],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '肝病', '营养不足', '神经系统疾病', '疟疾和被忽视的热带病', '呼吸疾病', '冲突与恐怖主义', '运输伤害', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [221284, 172270, 155719, 121986, 107914, 76659, 67981, 64332, 62429, 36676, 3177],
    		  riskFactors: ['维生素A缺乏症', '高胆固醇', '二手烟', '非独家母乳喂养', '饮食含盐量高', '低体力活动', '水果饮食偏少', '不安全的水源', '饮食中蔬菜含量低', 'COVID-19，直到2020年5月27日', '肥胖'],
    		  riskDALYs: [141475, 111526, 100285, 89227, 52550, 24230, 22253, 17531, 16074, 15654, 3177] },
    		 {id: 111,
    		  name: "阿曼",
    		  lifeExpectancy: 77.86,
    		  demographics: [819521, 514291, 1121755, 1363532, 647718, 301482, 134169, 51814, 20710],
    		  majorCauses: ['其他非传染性疾病', '结核', '其他传染病', '营养不足', '呼吸疾病', '自然灾害', '新生儿疾病', 'COVID-19，直到2020年5月27日', '肌肉骨骼疾病', '心血管疾病', '肥胖'],
    		  majorDeaths: [4128, 1950, 1277, 538, 404, 403, 397, 253, 246, 176, 37],
    		  diseaseNames: ['其他非传染性疾病', '艾滋病毒/艾滋病与结核病', '冲突与恐怖主义', '神经系统疾病', '肝病', '营养不足', '新生儿疾病', '运输伤害', '其他传染病', '自残', '肥胖'],
    		  diseaseDALYs: [117912, 110700, 88899, 79017, 78480, 54880, 53231, 50870, 41049, 33166, 887],
    		  riskFactors: ['非独家母乳喂养', '二手烟', '高胆固醇', '饮食含盐量高', '低体力活动', '维生素A缺乏症', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '饮食中蔬菜含量低', '不安全的水源', '肥胖'],
    		  riskDALYs: [87985, 77564, 73162, 48535, 46122, 34355, 33033, 11511, 10596, 10342, 887] },
    		 {id: 112,
    		  name: "巴基斯坦",
    		  lifeExpectancy: 67.27,
    		  demographics: [52774521, 44914765, 39377474, 29843795, 20586127, 14690100, 8500213, 4464790, 1413532],
    		  majorCauses: ['其他非传染性疾病', '新生儿疾病', '其他传染病', '肌肉骨骼疾病', '呼吸疾病', '消化系统疾病', '呼吸疾病', '结核', '心血管疾病', '自杀', '肥胖'],
    		  majorDeaths: [381421, 185098, 170987, 72647, 69969, 59787, 59440, 53009, 45501, 44150, 1225],
    		  diseaseNames: ['新生儿疾病', '自残', '其他非传染性疾病', '其他传染病', '运输伤害', '冲突与恐怖主义', '艾滋病毒/艾滋病与结核病', '肌肉骨骼疾病', '疟疾和被忽视的热带病', '神经系统疾病', '肥胖'],
    		  diseaseDALYs: [17719118, 9720916, 9486921, 5811824, 4382185, 3758170, 3457346, 3027349, 2997880, 2860291, 23742],
    		  riskFactors: ['二手烟', '水果饮食偏少', '空气污染（室内和室外）', '高胆固醇', '维生素A缺乏症', '非独家母乳喂养', '缺铁', '饮食含盐量高', '用药', '抽烟', '肥胖'],
    		  riskDALYs: [5532401, 4903301, 4539357, 4506942, 3688735, 3414335, 3335793, 2999458, 2206292, 1817366, 23742] },
    		 {id: 113,
    		  name: "巴勒斯坦",
    		  lifeExpectancy: 74.05,
    		  demographics: [1349183, 1088552, 950260, 636206, 432598, 283953, 144571, 74627, 21472],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '新生儿疾病', '营养不足', '自然灾害', 'COVID-19，直到2020年5月27日', '呼吸疾病', '呼吸疾病', '肌肉骨骼疾病', '结核', '肥胖'],
    		  majorDeaths: [5327, 2265, 1014, 763, 690, 624, 515, 411, 371, 355, 5],
    		  diseaseNames: ['其他非传染性疾病', '新生儿疾病', '冲突与恐怖主义', '神经系统疾病', '运输伤害', '其他传染病', '肝病', '自残', '营养不足', '腹泻和常见传染病', '肥胖'],
    		  diseaseDALYs: [120854, 111822, 93873, 85527, 78395, 66839, 65093, 63404, 59321, 38914, 105],
    		  riskFactors: ['高胆固醇', '非独家母乳喂养', '二手烟', '饮食含盐量高', '维生素A缺乏症', '水果饮食偏少', '低体力活动', '用药', '饮食中蔬菜含量低', '抽烟', '肥胖'],
    		  riskDALYs: [86431, 77642, 68379, 65832, 35706, 33555, 28138, 23336, 13917, 13248, 105] },
    		 {id: 114,
    		  name: "巴拿马",
    		  lifeExpectancy: 78.51,
    		  demographics: [771035, 720783, 669917, 611062, 547002, 420154, 271162, 151433, 83892],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '营养不足', 'COVID-19，直到2020年5月27日', '呼吸疾病', '肌肉骨骼疾病', '呼吸疾病', '恐怖主义', '产妇疾病', '肥胖'],
    		  majorDeaths: [5246, 3519, 1291, 1068, 951, 897, 825, 767, 640, 526, 313],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '冲突与恐怖主义', '运输伤害', '神经系统疾病', '营养不足', '肝病', '新生儿疾病', '自残', '消化系统疾病', '肥胖'],
    		  diseaseDALYs: [96163, 84501, 76588, 58716, 53776, 52367, 51530, 51264, 51169, 36729, 4949],
    		  riskFactors: ['高胆固醇', '非独家母乳喂养', '二手烟', '维生素A缺乏症', '饮食含盐量高', '水果饮食偏少', '空气污染（室内和室外）', '用药', '饮食中蔬菜含量低', '低体力活动', '肥胖'],
    		  riskDALYs: [69997, 63877, 61938, 37342, 24272, 23091, 16591, 13138, 12850, 12570, 4949] },
    		 {id: 115,
    		  name: "巴拉圭",
    		  lifeExpectancy: 74.25,
    		  demographics: [1381066, 1337773, 1316292, 1082701, 703289, 541135, 391066, 203938, 87379],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '营养不足', 'COVID-19，直到2020年5月27日', '自然灾害', '肌肉骨骼疾病', '结核', '呼吸疾病', '呼吸疾病', '恐怖主义', '肥胖'],
    		  majorDeaths: [9835, 5649, 2188, 1602, 1557, 1516, 1491, 1361, 1075, 845, 11],
    		  diseaseNames: ['其他非传染性疾病', '冲突与恐怖主义', '其他传染病', '神经系统疾病', '肝病', '营养不足', '自残', '运输伤害', '艾滋病毒/艾滋病与结核病', '新生儿疾病', '肥胖'],
    		  diseaseDALYs: [200872, 144522, 142533, 117408, 108992, 98834, 89711, 88327, 81498, 61604, 189],
    		  riskFactors: ['高胆固醇', '非独家母乳喂养', '二手烟', '维生素A缺乏症', '饮食含盐量高', '水果饮食偏少', '用药', '饮食中蔬菜含量低', '抽烟', 'COVID-19，直到2020年5月27日', '肥胖'],
    		  riskDALYs: [158929, 137710, 133881, 107531, 57416, 57294, 34245, 27128, 26824, 22666, 189] },
    		 {id: 116,
    		  name: "秘鲁",
    		  lifeExpectancy: 76.74,
    		  demographics: [5489704, 5224879, 5423768, 5068397, 4191544, 3185093, 2171756, 1190014, 565307],
    		  majorCauses: ['其他传染病', '其他非传染性疾病', '呼吸疾病', '自然灾害', '肌肉骨骼疾病', '呼吸疾病', '心血管疾病', 'COVID-19，直到2020年5月27日', '结核', '营养不足', '肥胖'],
    		  majorDeaths: [28513, 27720, 16638, 10195, 9227, 7492, 5562, 5287, 4577, 4300, 3788],
    		  diseaseNames: ['其他传染病', '自残', '其他非传染性疾病', '肝病', '新生儿疾病', '神经系统疾病', '运输伤害', '疟疾和被忽视的热带病', '冲突与恐怖主义', '营养不足', '肥胖'],
    		  diseaseDALYs: [677852, 608338, 554569, 481426, 479788, 470720, 444089, 407091, 402992, 401858, 61540],
    		  riskFactors: ['非独家母乳喂养', '高胆固醇', '二手烟', '水果饮食偏少', '维生素A缺乏症', '饮食含盐量高', '抽烟', '空气污染（室内和室外）', '低体力活动', '用药', '肥胖'],
    		  riskDALYs: [397073, 335162, 297615, 264551, 186595, 130609, 107063, 104592, 94360, 72302, 61540] },
    		 {id: 117,
    		  name: "菲律宾",
    		  lifeExpectancy: 71.23,
    		  demographics: [22137588, 21224868, 19346448, 15169948, 12087102, 9132653, 5640281, 2495455, 882279],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', 'COVID-19，直到2020年5月27日', '呼吸疾病', '自杀', '肌肉骨骼疾病', '营养不足', '新生儿疾病', '恐怖主义', '肥胖'],
    		  majorDeaths: [217552, 79280, 68013, 34051, 33061, 29322, 26513, 26049, 24722, 15891, 886],
    		  diseaseNames: ['其他非传染性疾病', '自残', '新生儿疾病', '其他传染病', '冲突与恐怖主义', '运输伤害', '肝病', '呼吸疾病', '神经系统疾病', 'COVID-19，直到2020年5月27日', '肥胖'],
    		  diseaseDALYs: [5629957, 3099601, 2529191, 2433421, 2353436, 1866603, 1757721, 1660479, 1272495, 1191208, 16673],
    		  riskFactors: ['高胆固醇', '二手烟', '维生素A缺乏症', '非独家母乳喂养', '水果饮食偏少', '饮食含盐量高', '空气污染（室内和室外）', 'COVID-19，直到2020年5月27日', '高血压', '饮食中蔬菜含量低', '肥胖'],
    		  riskDALYs: [3746813, 3404482, 2967393, 2483498, 2200537, 1467962, 1124433, 946863, 775342, 750053, 16673] },
    		 {id: 118,
    		  name: "波兰",
    		  lifeExpectancy: 78.73,
    		  demographics: [3812694, 3683606, 4614458, 6098806, 5397403, 4653080, 5155357, 2736204, 1736162],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '肌肉骨骼疾病', '呼吸疾病', '呼吸疾病', '心血管疾病', '脑膜炎', '营养不足', '痴呆', '肥胖'],
    		  majorDeaths: [168709, 109266, 28753, 16843, 11826, 11096, 7788, 6778, 6655, 4457, 1024],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '疟疾和被忽视的热带病', '肝病', '营养不足', '肌肉骨骼疾病', '冲突与恐怖主义', '神经系统疾病', '呼吸疾病', '运输伤害', '肥胖'],
    		  diseaseDALYs: [2771014, 2360949, 974998, 945960, 804552, 593513, 574896, 546687, 478036, 455361, 13890],
    		  riskFactors: ['维生素A缺乏症', '二手烟', '非独家母乳喂养', '高胆固醇', '饮食含盐量高', '水果饮食偏少', '用药', 'COVID-19，直到2020年5月27日', '不安全的水源', '高血压', '肥胖'],
    		  riskDALYs: [2063927, 1559349, 1413317, 1306415, 890803, 564674, 466544, 363580, 209552, 182665, 13890] },
    		 {id: 119,
    		  name: "葡萄牙",
    		  lifeExpectancy: 82.05,
    		  demographics: [856604, 1029022, 1076533, 1253640, 1587112, 1472388, 1282301, 997530, 671048],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '呼吸疾病', '呼吸疾病', '肌肉骨骼疾病', '营养不足', 'COVID-19，直到2020年5月27日', '心血管疾病', '脑膜炎', '肥胖'],
    		  majorDeaths: [36943, 29600, 10795, 7160, 6598, 5111, 3769, 3109, 2133, 1359, 1342],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '肝病', '营养不足', '神经系统疾病', '冲突与恐怖主义', '呼吸疾病', '运输伤害', '疟疾和被忽视的热带病', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [556228, 483288, 348277, 258666, 226388, 202807, 150373, 118395, 117492, 113988, 16768],
    		  riskFactors: ['高胆固醇', '维生素A缺乏症', '非独家母乳喂养', '二手烟', '饮食含盐量高', '水果饮食偏少', '用药', '不安全的水源', 'COVID-19，直到2020年5月27日', '高血压', '肥胖'],
    		  riskDALYs: [404257, 312988, 279203, 267234, 109389, 81137, 62114, 44482, 41270, 37113, 16768] },
    		 {id: 120,
    		  name: "波多黎各",
    		  lifeExpectancy: 80.1,
    		  demographics: [265199, 397823, 321336, 356603, 409046, 413780, 354578, 263573, 151466],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '营养不足', 'HIV爱滋病', 'COVID-19，直到2020年5月27日', '呼吸疾病', '呼吸疾病', '肌肉骨骼疾病', '心血管疾病', '肥胖'],
    		  majorDeaths: [8447, 6428, 3037, 2909, 2355, 1691, 1632, 1610, 1496, 953, 129],
    		  diseaseNames: ['其他非传染性疾病', '冲突与恐怖主义', '其他传染病', '营养不足', '肝病', '神经系统疾病', '运输伤害', '呼吸疾病', '消化系统疾病', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [138694, 137965, 124356, 74842, 70601, 63381, 47707, 44739, 43088, 40890, 1683],
    		  riskFactors: ['高胆固醇', '非独家母乳喂养', '二手烟', '维生素A缺乏症', '饮食含盐量高', '水果饮食偏少', '低体力活动', '用药', '饮食中蔬菜含量低', '不安全的水源', '肥胖'],
    		  riskDALYs: [164852, 164445, 96268, 44280, 38035, 29022, 19794, 15811, 14987, 14416, 1683] },
    		 {id: 121,
    		  name: "卡塔尔",
    		  lifeExpectancy: 80.23,
    		  demographics: [268598, 230385, 719809, 819308, 462935, 238779, 74010, 14279, 3968],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '结核', '营养不足', '肌肉骨骼疾病', '脑膜炎', 'COVID-19，直到2020年5月27日', '心血管疾病', '自然灾害', '呼吸疾病', '肥胖'],
    		  majorDeaths: [918, 660, 574, 287, 159, 145, 115, 114, 95, 91, 28],
    		  diseaseNames: ['肝病', '神经系统疾病', '艾滋病毒/艾滋病与结核病', '冲突与恐怖主义', '营养不足', '其他非传染性疾病', '疟疾和被忽视的热带病', '运输伤害', '其他传染病', '新生儿疾病', '肥胖'],
    		  diseaseDALYs: [51741, 51335, 34814, 33636, 31118, 30167, 25396, 22744, 21724, 15324, 800],
    		  riskFactors: ['非独家母乳喂养', '低体力活动', '高胆固醇', '二手烟', '水果饮食偏少', '维生素A缺乏症', '饮食含盐量高', 'COVID-19，直到2020年5月27日', '高血压', '不安全的水源', '肥胖'],
    		  riskDALYs: [44342, 35001, 33964, 18908, 16441, 14310, 10265, 3899, 3836, 3090, 800] },
    		 {id: 122,
    		  name: "羅馬尼亞",
    		  lifeExpectancy: 76.05,
    		  demographics: [1939134, 2069083, 2174981, 2621141, 3076100, 2508724, 2559619, 1482916, 932860],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '肌肉骨骼疾病', '心血管疾病', '呼吸疾病', '呼吸疾病', 'COVID-19，直到2020年5月27日', '脑膜炎', '营养不足', '肥胖'],
    		  majorDeaths: [144849, 51229, 14456, 14232, 10114, 7448, 6207, 3043, 2364, 2260, 1210],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '疟疾和被忽视的热带病', '肝病', '肌肉骨骼疾病', '营养不足', '神经系统疾病', '心血管疾病', '呼吸疾病', '冲突与恐怖主义', '肥胖'],
    		  diseaseDALYs: [2293802, 1195901, 511173, 502200, 452352, 412973, 283885, 274588, 264969, 257818, 16197],
    		  riskFactors: ['二手烟', '维生素A缺乏症', '非独家母乳喂养', '饮食含盐量高', '高胆固醇', 'COVID-19，直到2020年5月27日', '水果饮食偏少', '用药', '不安全的水源', '高血压', '肥胖'],
    		  riskDALYs: [1528585, 1142662, 972055, 625135, 616402, 354630, 337445, 314456, 148658, 139479, 16197] },
    		 {id: 123,
    		  name: "俄罗斯",
    		  lifeExpectancy: 72.58,
    		  demographics: [18561902, 14795855, 16599344, 24452747, 19983554, 19449736, 18094236, 8266872, 5668011],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '肌肉骨骼疾病', '自然灾害', '心血管疾病', '脑膜炎', '呼吸疾病', '呼吸疾病', '痴呆', '结核', '肥胖'],
    		  majorDeaths: [1000223, 291447, 94609, 84369, 50910, 43897, 38232, 35493, 28504, 24385, 3807],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '疟疾和被忽视的热带病', '肌肉骨骼疾病', '营养不足', '肝病', '神经系统疾病', '冲突与恐怖主义', '运输伤害', '精神和物质使用障碍', '肥胖'],
    		  diseaseDALYs: [18699165, 7188475, 4457968, 3463448, 2949462, 2933286, 2337415, 2043512, 1947477, 1889160, 53680],
    		  riskFactors: ['二手烟', '维生素A缺乏症', '非独家母乳喂养', '饮食含盐量高', '高胆固醇', '用药', '水果饮食偏少', '低体力活动', 'COVID-19，直到2020年5月27日', '饮食中蔬菜含量低', '肥胖'],
    		  riskDALYs: [10606447, 8613005, 7301942, 7040122, 5421036, 2729779, 2341390, 1971308, 1848572, 1705448, 53680] },
    		 {id: 124,
    		  name: "卢旺达",
    		  lifeExpectancy: 69.02,
    		  demographics: [3502850, 2837454, 2168420, 1758438, 1012265, 721197, 419030, 163562, 43720],
    		  majorCauses: ['其他非传染性疾病', '呼吸疾病', '其他传染病', '新生儿疾病', '肌肉骨骼疾病', '自杀', '消化系统疾病', '冲突', '产妇疾病', '心血管疾病', '肥胖'],
    		  majorDeaths: [8125, 6441, 6308, 5923, 4856, 4564, 3896, 3052, 2963, 2668, 0],
    		  diseaseNames: ['自残', '新生儿疾病', 'COVID-19，直到2020年5月27日', '运输伤害', '糖尿病，血液和内分泌疾病', '其他传染病', '其他非传染性疾病', '人际暴力', '肌肉骨骼疾病', '神经系统疾病', '肥胖'],
    		  diseaseDALYs: [879009, 571287, 382120, 331276, 226776, 204285, 197051, 185350, 180480, 167605, 0],
    		  riskFactors: ['空气污染（室内和室外）', '水果饮食偏少', '缺铁', '不安全的卫生', '高胆固醇', '二手烟', '维生素A缺乏症', '儿童发育不良', '非独家母乳喂养', '高血糖', '肥胖'],
    		  riskDALYs: [331524, 249137, 204666, 158329, 133769, 120221, 100333, 87317, 65917, 63712, 0] },
    		 {id: 125,
    		  name: "萨摩亚",
    		  lifeExpectancy: 73.32,
    		  demographics: [52139, 41307, 30670, 21842, 19683, 16090, 9521, 4405, 1436],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '营养不足', '呼吸疾病', 'COVID-19，直到2020年5月27日', '呼吸疾病', '自然灾害', '肌肉骨骼疾病', '新生儿疾病', '心血管疾病'],
    		  majorDeaths: [411, 118, 79, 64, 56, 53, 49, 46, 29, 23],
    		  diseaseNames: ['其他非传染性疾病', '冲突与恐怖主义', '自残', '其他传染病', '新生儿疾病', '呼吸疾病', '肝病', '运输伤害', '神经系统疾病', '营养不足'],
    		  diseaseDALYs: [9472, 6698, 3935, 3305, 3090, 2883, 2803, 2705, 2396, 2140],
    		  riskFactors: ['高胆固醇', '非独家母乳喂养', '二手烟', '维生素A缺乏症', '水果饮食偏少', '饮食含盐量高', '用药', '高血压', '饮食中蔬菜含量低', '抽烟'],
    		  riskDALYs: [7631, 6959, 5743, 5211, 3003, 2345, 1772, 1521, 1406, 758] },
    		 {id: 126,
    		  name: "沙特阿拉伯",
    		  lifeExpectancy: 75.13,
    		  demographics: [5937284, 4817472, 5457856, 6886975, 6162478, 3055997, 1307059, 476138, 167270],
    		  majorCauses: ['其他非传染性疾病', '结核', '其他传染病', 'COVID-19，直到2020年5月27日', '呼吸疾病', '自然灾害', '肌肉骨骼疾病', '呼吸疾病', '下呼吸道感染', '心血管疾病', '肥胖'],
    		  majorDeaths: [31569, 12039, 11843, 3818, 3505, 3371, 3109, 2665, 2589, 2461, 411],
    		  diseaseNames: ['其他非传染性疾病', '艾滋病毒/艾滋病与结核病', '肝病', '神经系统疾病', '冲突与恐怖主义', '营养不足', '疟疾和被忽视的热带病', '运输伤害', '其他传染病', '新生儿疾病', '肥胖'],
    		  diseaseDALYs: [888316, 650397, 637913, 629363, 484211, 464319, 451767, 390981, 379671, 314120, 9101],
    		  riskFactors: ['非独家母乳喂养', '高胆固醇', '二手烟', '低体力活动', '水果饮食偏少', '饮食含盐量高', '维生素A缺乏症', '用药', '饮食中蔬菜含量低', '不安全的水源', '肥胖'],
    		  riskDALYs: [743801, 575708, 539857, 320040, 306553, 274329, 222709, 158156, 111219, 101175, 9101] },
    		 {id: 127,
    		  name: "塞内加尔",
    		  lifeExpectancy: 67.94,
    		  demographics: [4949217, 3743997, 2751091, 1988586, 1278344, 803327, 488093, 231925, 61781],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '新生儿疾病', '呼吸疾病', '消化系统疾病', '自杀', '肌肉骨骼疾病', '呼吸疾病', '营养不足', '冲突', '肥胖'],
    		  majorDeaths: [14794, 8931, 7877, 7727, 7270, 5250, 3747, 2852, 2349, 2146, 37],
    		  diseaseNames: ['自残', '新生儿疾病', '运输伤害', '其他非传染性疾病', 'COVID-19，直到2020年5月27日', '冲突与恐怖主义', '人际暴力', '其他传染病', '疟疾和被忽视的热带病', '糖尿病，血液和内分泌疾病', '肥胖'],
    		  diseaseDALYs: [1228484, 760280, 387694, 358045, 289473, 277391, 264538, 248163, 210820, 206816, 785],
    		  riskFactors: ['空气污染（室内和室外）', '缺铁', '水果饮食偏少', '不安全的卫生', '二手烟', '高胆固醇', '抽烟', '非独家母乳喂养', '儿童发育不良', '用药', '肥胖'],
    		  riskDALYs: [437753, 350590, 319175, 261781, 239801, 227424, 178631, 155356, 155343, 87564, 785] },
    		 {id: 128,
    		  name: "塞尔维亚",
    		  lifeExpectancy: 76.0,
    		  demographics: [868805, 1010416, 1119463, 1216521, 1227265, 1120356, 1161341, 696223, 351838],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '肌肉骨骼疾病', '呼吸疾病', '营养不足', 'COVID-19，直到2020年5月27日', '脑膜炎', '呼吸疾病', '心血管疾病', '肥胖'],
    		  majorDeaths: [67115, 26965, 6512, 4234, 4160, 3445, 2386, 1601, 1512, 1304, 239],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '营养不足', '冲突与恐怖主义', '疟疾和被忽视的热带病', '神经系统疾病', '呼吸疾病', '肌肉骨骼疾病', '运输伤害', '肥胖'],
    		  diseaseDALYs: [1002625, 604601, 221677, 185794, 185145, 178140, 132892, 130607, 115168, 91317, 3298],
    		  riskFactors: ['二手烟', '维生素A缺乏症', '高胆固醇', '非独家母乳喂养', '饮食含盐量高', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '用药', '高血压', '不安全的水源', '肥胖'],
    		  riskDALYs: [641143, 638003, 527500, 440815, 249746, 211876, 138216, 126286, 80423, 76754, 3298] },
    		 {id: 129,
    		  name: "塞舌尔",
    		  lifeExpectancy: 73.4,
    		  demographics: [15951, 13607, 13698, 14627, 14883, 12766, 7366, 3182, 1661],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '自然灾害', '心血管疾病', '呼吸疾病', '营养不足', '结核', '肥胖'],
    		  majorDeaths: [236, 162, 73, 48, 41, 33, 27, 27, 18, 14, 0],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '冲突与恐怖主义', '肝病', '自残', '运输伤害', '营养不足', '肌肉骨骼疾病', '神经系统疾病', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [5202, 4083, 2520, 1825, 1777, 1498, 1466, 1425, 1409, 1229, 0],
    		  riskFactors: ['二手烟', '高胆固醇', '非独家母乳喂养', '维生素A缺乏症', '饮食含盐量高', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '用药', '高血压', '低体力活动', '肥胖'],
    		  riskDALYs: [4112, 3116, 2992, 2506, 1258, 1218, 1076, 653, 462, 422, 0] },
    		 {id: 130,
    		  name: "新加坡",
    		  lifeExpectancy: 83.62,
    		  demographics: [473440, 525276, 841606, 898862, 965359, 946886, 762636, 260127, 130150],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '自然灾害', '呼吸疾病', 'COVID-19，直到2020年5月27日', '肌肉骨骼疾病', '脑膜炎', '心血管疾病', '结核', '肥胖'],
    		  majorDeaths: [6161, 5449, 2696, 1617, 614, 594, 554, 496, 254, 197, 23],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '神经系统疾病', '营养不足', '疟疾和被忽视的热带病', '冲突与恐怖主义', '运输伤害', '自残', '呼吸疾病', '肥胖'],
    		  diseaseDALYs: [131167, 124284, 117699, 96826, 61286, 58107, 49214, 45303, 37425, 28180, 371],
    		  riskFactors: ['二手烟', '高胆固醇', '维生素A缺乏症', '非独家母乳喂养', 'COVID-19，直到2020年5月27日', '饮食含盐量高', '水果饮食偏少', '用药', '低体力活动', '不安全的水源', '肥胖'],
    		  riskDALYs: [70498, 67953, 67867, 60133, 36052, 34968, 31284, 16570, 14955, 10389, 371] },
    		 {id: 131,
    		  name: "斯洛伐克",
    		  lifeExpectancy: 77.54,
    		  demographics: [568394, 542764, 680528, 860773, 843980, 714201, 687712, 380061, 178599],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '肌肉骨骼疾病', '呼吸疾病', '心血管疾病', '呼吸疾病', '营养不足', 'COVID-19，直到2020年5月27日', '脑膜炎', '肥胖'],
    		  majorDeaths: [25216, 13227, 2992, 2748, 1680, 1527, 1107, 732, 713, 675, 28],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '疟疾和被忽视的热带病', '营养不足', '肌肉骨骼疾病', '冲突与恐怖主义', '神经系统疾病', '运输伤害', '呼吸疾病', '肥胖'],
    		  diseaseDALYs: [425950, 300811, 144022, 140687, 103170, 94371, 79871, 79683, 61368, 49558, 404],
    		  riskFactors: ['二手烟', '维生素A缺乏症', '非独家母乳喂养', '饮食含盐量高', '高胆固醇', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '用药', '饮食中蔬菜含量低', '不安全的水源', '肥胖'],
    		  riskDALYs: [272632, 240554, 209249, 151462, 151283, 69635, 68488, 61685, 38061, 31734, 404] },
    		 {id: 132,
    		  name: "斯洛文尼亚",
    		  lifeExpectancy: 81.32,
    		  demographics: [212011, 193037, 211211, 290227, 303945, 302099, 281171, 172426, 112527],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '肌肉骨骼疾病', '呼吸疾病', '呼吸疾病', '心血管疾病', '脑膜炎', '营养不足', 'COVID-19，直到2020年5月27日', '肥胖'],
    		  majorDeaths: [7450, 5907, 1534, 1058, 630, 601, 541, 430, 300, 213, 106],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '疟疾和被忽视的热带病', '肝病', '营养不足', '神经系统疾病', '肌肉骨骼疾病', '冲突与恐怖主义', '运输伤害', '呼吸疾病', '肥胖'],
    		  diseaseDALYs: [114870, 105868, 63618, 56464, 42850, 32756, 29060, 29039, 24407, 21852, 1388],
    		  riskFactors: ['维生素A缺乏症', '二手烟', '非独家母乳喂养', '高胆固醇', '饮食含盐量高', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '用药', '低体力活动', '饮食中蔬菜含量低', '肥胖'],
    		  riskDALYs: [82245, 64747, 60624, 48836, 28166, 19537, 17406, 9380, 9341, 8879, 1388] },
    		 {id: 133,
    		  name: "索马里",
    		  lifeExpectancy: 57.4,
    		  demographics: [5094110, 3837600, 2580391, 1477525, 1036888, 713771, 450111, 201592, 50918],
    		  majorCauses: ['其他非传染性疾病', '呼吸疾病', '自杀', '新生儿疾病', '消化系统疾病', '其他传染病', '下呼吸道感染', '结核', '肌肉骨骼疾病', '人际暴力', '肥胖'],
    		  majorDeaths: [18048, 13033, 12697, 12265, 10548, 9299, 5445, 5154, 4786, 3435, 67],
    		  diseaseNames: ['自残', '新生儿疾病', 'COVID-19，直到2020年5月27日', '其他非传染性疾病', '人际暴力', '运输伤害', '其他传染病', '艾滋病毒/艾滋病与结核病', '疟疾和被忽视的热带病', '意外伤害', '肥胖'],
    		  diseaseDALYs: [1602542, 1125637, 532931, 506577, 500937, 389547, 329509, 315175, 283153, 241549, 1434],
    		  riskFactors: ['空气污染（室内和室外）', '水果饮食偏少', '缺铁', '儿童发育不良', '不安全的卫生', '二手烟', '高血糖', '高胆固醇', '儿童发育迟缓', '抽烟', '肥胖'],
    		  riskDALYs: [1406987, 647809, 644927, 524574, 496043, 313258, 304365, 296970, 210379, 188299, 1434] },
    		 {id: 134,
    		  name: "南非",
    		  lifeExpectancy: 64.13,
    		  demographics: [11581615, 10240605, 10231760, 9942466, 6845747, 4794113, 3068429, 1430792, 422740],
    		  majorCauses: ['产妇疾病', '其他非传染性疾病', '其他传染病', '呼吸疾病', '营养不足', '自杀', '呼吸疾病', '恐怖主义', '结核', '消化系统疾病', '肥胖'],
    		  majorDeaths: [135399, 76671, 48637, 26529, 22654, 19624, 18132, 15701, 15504, 14302, 524],
    		  diseaseNames: ['COVID-19，直到2020年5月27日', '自残', '其他非传染性疾病', '冲突与恐怖主义', '其他传染病', '新生儿疾病', '神经系统疾病', '艾滋病毒/艾滋病与结核病', '消化系统疾病', '呼吸疾病', '肥胖'],
    		  diseaseDALYs: [10033858, 2145400, 1721968, 1712504, 1275456, 1164989, 864880, 862779, 862716, 779758, 10024],
    		  riskFactors: ['高胆固醇', '非独家母乳喂养', '二手烟', '维生素A缺乏症', '水果饮食偏少', '空气污染（室内和室外）', '缺铁', '用药', '低体力活动', '饮食含盐量高', '肥胖'],
    		  riskDALYs: [1646278, 1454452, 1274406, 960155, 799354, 602865, 505677, 426733, 396322, 344011, 10024] },
    		 {id: 135,
    		  name: "韩国",
    		  lifeExpectancy: 83.03,
    		  demographics: [4240885, 4886624, 6797905, 7196849, 8330006, 8442921, 6135717, 3444643, 1749770],
    		  majorCauses: ['其他传染病', '其他非传染性疾病', '自然灾害', '肌肉骨骼疾病', '脑膜炎', '呼吸疾病', '呼吸疾病', '营养不足', '心血管疾病', '结核', '肥胖'],
    		  majorDeaths: [92548, 66787, 31554, 16084, 15228, 13973, 13444, 11719, 9447, 6643, 269],
    		  diseaseNames: ['其他传染病', '肝病', '其他非传染性疾病', '冲突与恐怖主义', '神经系统疾病', '营养不足', '疟疾和被忽视的热带病', '精神和物质使用障碍', '呼吸疾病', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [1936073, 1435379, 1193979, 898163, 883625, 861525, 659048, 527829, 491707, 453457, 3906],
    		  riskFactors: ['维生素A缺乏症', '高胆固醇', '二手烟', '非独家母乳喂养', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '饮食含盐量高', '用药', '低体力活动', '高血压', '肥胖'],
    		  riskDALYs: [1272299, 1121507, 575007, 528944, 422295, 305748, 271902, 206364, 158057, 115893, 3906] },
    		 {id: 136,
    		  name: "西班牙",
    		  lifeExpectancy: 83.56,
    		  demographics: [4340417, 4682339, 4652133, 6158281, 7935505, 6944643, 5200462, 3921750, 2901252],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '呼吸疾病', '肌肉骨骼疾病', '呼吸疾病', 'COVID-19，直到2020年5月27日', '营养不足', '心血管疾病', '糖尿病'],
    		  majorDeaths: [123577, 115657, 51759, 33490, 21593, 12941, 10605, 8292, 8132, 5808],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '肝病', '营养不足', '神经系统疾病', '冲突与恐怖主义', '呼吸疾病', '疟疾和被忽视的热带病', '运输伤害', '肌肉骨骼疾病'],
    		  diseaseDALYs: [2182632, 1682048, 1265974, 1243119, 950283, 660386, 588589, 549012, 475533, 448367],
    		  riskFactors: ['维生素A缺乏症', '高胆固醇', '二手烟', '非独家母乳喂养', '饮食含盐量高', '水果饮食偏少', '用药', '低体力活动', '不安全的水源', '高血压'],
    		  riskDALYs: [1544708, 985420, 979221, 949682, 385742, 295600, 163174, 156687, 135357, 120071] },
    		 {id: 137,
    		  name: "斯里蘭卡",
    		  lifeExpectancy: 76.98,
    		  demographics: [3383992, 3369304, 2906780, 2883558, 2848798, 2533919, 1966154, 1080639, 350590],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '营养不足', '自然灾害', '肌肉骨骼疾病', '呼吸疾病', '脑膜炎', 'COVID-19，直到2020年5月27日', '心血管疾病', '肥胖'],
    		  majorDeaths: [41867, 16628, 12267, 11537, 5971, 5246, 4986, 4523, 4512, 4021, 10],
    		  diseaseNames: ['其他非传染性疾病', '冲突与恐怖主义', '其他传染病', '肝病', '神经系统疾病', '呼吸疾病', '营养不足', '运输伤害', '自残', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [880238, 528668, 417142, 363658, 323956, 317010, 296913, 243702, 217443, 207042, 160],
    		  riskFactors: ['高胆固醇', '二手烟', '非独家母乳喂养', '维生素A缺乏症', '饮食含盐量高', '水果饮食偏少', '用药', 'COVID-19，直到2020年5月27日', '饮食中蔬菜含量低', '高血压', '肥胖'],
    		  riskDALYs: [776768, 569841, 392912, 342663, 285535, 251275, 189307, 182848, 122999, 85925, 160] },
    		 {id: 138,
    		  name: "苏丹",
    		  lifeExpectancy: 65.31,
    		  demographics: [11957900, 9925896, 7382380, 5059889, 3624817, 2465268, 1480214, 702966, 213907],
    		  majorCauses: ['其他非传染性疾病', '新生儿疾病', '其他传染病', '结核', '呼吸疾病', '消化系统疾病', '呼吸疾病', '产妇疾病', '肌肉骨骼疾病', '自然灾害', '肥胖'],
    		  majorDeaths: [69012, 25224, 15171, 10692, 9402, 8236, 5902, 5296, 5148, 4396, 170],
    		  diseaseNames: ['新生儿疾病', '运输伤害', '其他非传染性疾病', '自残', '艾滋病毒/艾滋病与结核病', '冲突与恐怖主义', '神经系统疾病', '疟疾和被忽视的热带病', '肝病', '营养不足', '肥胖'],
    		  diseaseDALYs: [2412123, 1787062, 1725565, 1342405, 726662, 718901, 647654, 608911, 559545, 487047, 3446],
    		  riskFactors: ['二手烟', '空气污染（室内和室外）', '非独家母乳喂养', '水果饮食偏少', '缺铁', '高胆固醇', '饮食含盐量高', '不安全的卫生', '用药', '抽烟', '肥胖'],
    		  riskDALYs: [1049467, 1019444, 733013, 703277, 649044, 624608, 517119, 512310, 304955, 281543, 3446] },
    		 {id: 139,
    		  name: "苏里南",
    		  lifeExpectancy: 71.68,
    		  demographics: [104982, 101957, 95327, 81591, 72819, 63673, 35048, 18175, 7791],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '肌肉骨骼疾病', '营养不足', 'COVID-19，直到2020年5月27日', '呼吸疾病', '自然灾害', '脑膜炎', '新生儿疾病', '心血管疾病', '肥胖'],
    		  majorDeaths: [1396, 666, 243, 226, 209, 182, 170, 147, 144, 124, 1],
    		  diseaseNames: ['其他非传染性疾病', '冲突与恐怖主义', '其他传染病', '新生儿疾病', '神经系统疾病', '运输伤害', '自残', '营养不足', '肝病', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [30501, 17214, 16906, 14702, 10533, 9951, 9783, 9038, 8792, 7928, 17],
    		  riskFactors: ['高胆固醇', '非独家母乳喂养', '二手烟', '维生素A缺乏症', '水果饮食偏少', '饮食含盐量高', '用药', '饮食中蔬菜含量低', '低体力活动', '高血压', '肥胖'],
    		  riskDALYs: [22098, 21406, 17697, 13435, 7920, 6442, 4554, 4009, 2483, 2435, 17] },
    		 {id: 140,
    		  name: "斯威士兰",
    		  lifeExpectancy: 60.19,
    		  demographics: [288502, 273125, 212361, 158383, 99646, 50414, 36433, 22204, 7065],
    		  majorCauses: ['产妇疾病', '其他非传染性疾病', '其他传染病', '呼吸疾病', '营养不足', '消化系统疾病', '自杀', '结核', '新生儿疾病', '呼吸疾病', '肥胖'],
    		  majorDeaths: [2506, 1465, 844, 674, 584, 545, 521, 371, 360, 324, 2],
    		  diseaseNames: ['COVID-19，直到2020年5月27日', '自残', '冲突与恐怖主义', '其他非传染性疾病', '新生儿疾病', '其他传染病', '艾滋病毒/艾滋病与结核病', '疟疾和被忽视的热带病', '运输伤害', '消化系统疾病', '肥胖'],
    		  diseaseDALYs: [277199, 120264, 39005, 38330, 36491, 26189, 23874, 18538, 16601, 16543, 39],
    		  riskFactors: ['高胆固醇', '非独家母乳喂养', '缺铁', '二手烟', '空气污染（室内和室外）', '水果饮食偏少', '不安全的卫生', '维生素A缺乏症', '低体力活动', '儿童发育不良', '肥胖'],
    		  riskDALYs: [44001, 35825, 29513, 27107, 24991, 22925, 21591, 15768, 8741, 8128, 39] },
    		 {id: 141,
    		  name: "瑞典",
    		  lifeExpectancy: 82.8,
    		  demographics: [1191245, 1106232, 1304961, 1289302, 1277210, 1280608, 1097278, 967449, 522106],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '呼吸疾病', '肥胖', '肌肉骨骼疾病', '呼吸疾病', '营养不足', 'COVID-19，直到2020年5月27日', '脑膜炎', '糖尿病'],
    		  majorDeaths: [34164, 24053, 9660, 4518, 4125, 3034, 2903, 1722, 1461, 1395, 1213],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '营养不足', '神经系统疾病', '冲突与恐怖主义', '疟疾和被忽视的热带病', '呼吸疾病', '运输伤害', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [446549, 436415, 277268, 240709, 211399, 139367, 139276, 136083, 110778, 73435, 52985],
    		  riskFactors: ['维生素A缺乏症', '高胆固醇', '二手烟', '非独家母乳喂养', '饮食含盐量高', '肥胖', 'COVID-19，直到2020年5月27日', '水果饮食偏少', '用药', '低体力活动', '不安全的水源'],
    		  riskDALYs: [284244, 257193, 248332, 202521, 123616, 52985, 45905, 41439, 40058, 39436, 38229] },
    		 {id: 142,
    		  name: "瑞士",
    		  lifeExpectancy: 83.78,
    		  demographics: [875799, 835663, 1047321, 1211148, 1177086, 1309842, 953874, 731996, 448632],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '呼吸疾病', '肌肉骨骼疾病', '呼吸疾病', '肥胖', 'COVID-19，直到2020年5月27日', '脑膜炎', '营养不足', '心血管疾病'],
    		  majorDeaths: [21280, 17882, 7597, 2816, 2641, 1697, 1647, 1558, 1133, 1123, 940],
    		  diseaseNames: ['其他传染病', '肝病', '其他非传染性疾病', '营养不足', '神经系统疾病', '疟疾和被忽视的热带病', '冲突与恐怖主义', '运输伤害', '呼吸疾病', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [337817, 307335, 263828, 185793, 166939, 115288, 104830, 91308, 86577, 60915, 21509],
    		  riskFactors: ['维生素A缺乏症', '高胆固醇', '非独家母乳喂养', '二手烟', '饮食含盐量高', '水果饮食偏少', '用药', '低体力活动', 'COVID-19，直到2020年5月27日', '不安全的水源', '肥胖'],
    		  riskDALYs: [242301, 180978, 138338, 135271, 84308, 47268, 32555, 30843, 25405, 23257, 21509] },
    		 {id: 143,
    		  name: "叙利亚",
    		  lifeExpectancy: 72.7,
    		  demographics: [3569815, 3299311, 3073670, 2832030, 1819810, 1234238, 769970, 334158, 137130],
    		  majorCauses: ['其他非传染性疾病', '下呼吸道感染', '其他传染病', '自然灾害', '呼吸疾病', 'COVID-19，直到2020年5月27日', '肌肉骨骼疾病', '吸毒障碍', '呼吸疾病', '结核', '肥胖'],
    		  majorDeaths: [41380, 41378, 8795, 3157, 2994, 2257, 2139, 2026, 1946, 1748, 4],
    		  diseaseNames: ['腹泻和常见传染病', '其他非传染性疾病', '肝病', '神经系统疾病', '冲突与恐怖主义', '其他传染病', '运输伤害', '营养不足', '自残', '呼吸疾病', '肥胖'],
    		  diseaseDALYs: [3450747, 966983, 302387, 301942, 252434, 252051, 237494, 235115, 169355, 164278, 77],
    		  riskFactors: ['二手烟', '非独家母乳喂养', '高胆固醇', '饮食含盐量高', '维生素A缺乏症', '水果饮食偏少', '用药', '饮食中蔬菜含量低', '低体力活动', '不安全的水源', '肥胖'],
    		  riskDALYs: [568413, 461284, 369488, 308024, 302142, 225934, 164138, 128383, 106175, 89597, 77] },
    		 {id: 144,
    		  name: "台湾",
    		  lifeExpectancy: 80.46,
    		  demographics: [2037909, 2275933, 3158514, 3637865, 3739295, 3676703, 2995888, 1399598, 852176],
    		  majorCauses: ['其他传染病', '其他非传染性疾病', '呼吸疾病', '自然灾害', '肌肉骨骼疾病', '营养不足', '呼吸疾病', 'COVID-19，直到2020年5月27日', '心血管疾病', '脑膜炎', '肥胖'],
    		  majorDeaths: [53165, 40528, 13115, 12814, 10313, 9522, 9474, 6743, 6510, 4355, 7],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '冲突与恐怖主义', '肝病', '呼吸疾病', '营养不足', '神经系统疾病', '肌肉骨骼疾病', '运输伤害', '艾滋病毒/艾滋病与结核病', '肥胖'],
    		  diseaseDALYs: [1180273, 799276, 675740, 496956, 391306, 372657, 354883, 287510, 263068, 203754, 101],
    		  riskFactors: ['维生素A缺乏症', '高胆固醇', '非独家母乳喂养', '二手烟', '水果饮食偏少', '饮食含盐量高', '低体力活动', '高血压', 'COVID-19，直到2020年5月27日', '用药', '肥胖'],
    		  riskDALYs: [717421, 668199, 554479, 456764, 301189, 196544, 159397, 118790, 116679, 111020, 101] },
    		 {id: 145,
    		  name: "塔吉克斯坦",
    		  lifeExpectancy: 71.1,
    		  demographics: [2521647, 1740863, 1656860, 1336885, 861056, 686415, 358651, 111823, 46823],
    		  majorCauses: ['其他非传染性疾病', '呼吸疾病', '其他传染病', '新生儿疾病', '肌肉骨骼疾病', '消化系统疾病', '心血管疾病', '呼吸疾病', '营养不足', '自然灾害', '肥胖'],
    		  majorDeaths: [18269, 4902, 4721, 3672, 2157, 1783, 1536, 1464, 1323, 1289, 46],
    		  diseaseNames: ['自残', '其他非传染性疾病', '新生儿疾病', '运输伤害', '疟疾和被忽视的热带病', '其他传染病', '营养不足', '冲突与恐怖主义', '肌肉骨骼疾病', '神经系统疾病', '肥胖'],
    		  diseaseDALYs: [465754, 410475, 358569, 211958, 172689, 156895, 126736, 112026, 108010, 104828, 978],
    		  riskFactors: ['空气污染（室内和室外）', '二手烟', '水果饮食偏少', '高胆固醇', '非独家母乳喂养', '维生素A缺乏症', '饮食含盐量高', '缺铁', '用药', '不安全的卫生', '肥胖'],
    		  riskDALYs: [324745, 259292, 240715, 228221, 143717, 126773, 104585, 103889, 93823, 93502, 978] },
    		 {id: 146,
    		  name: "坦桑尼亚",
    		  lifeExpectancy: 65.46,
    		  demographics: [17990384, 13636144, 9575102, 6938129, 4635689, 2803032, 1556334, 710015, 160632],
    		  majorCauses: ['其他非传染性疾病', '新生儿疾病', '呼吸疾病', '产妇疾病', '其他传染病', '自杀', '冲突', '消化系统疾病', '肌肉骨骼疾病', '营养不足', '肥胖'],
    		  majorDeaths: [44175, 34523, 33486, 28299, 27864, 20391, 15325, 15196, 12862, 7084, 21],
    		  diseaseNames: ['自残', '新生儿疾病', 'COVID-19，直到2020年5月27日', '运输伤害', '糖尿病，血液和内分泌疾病', '其他非传染性疾病', '人际暴力', '其他传染病', '疟疾和被忽视的热带病', '冲突与恐怖主义', '肥胖'],
    		  diseaseDALYs: [4552138, 3263525, 3045845, 2349773, 1408015, 1071877, 1055921, 930207, 781168, 744072, 470],
    		  riskFactors: ['空气污染（室内和室外）', '水果饮食偏少', '二手烟', '缺铁', '高胆固醇', '不安全的卫生', '抽烟', '维生素A缺乏症', '非独家母乳喂养', '儿童发育不良', '肥胖'],
    		  riskDALYs: [1593860, 1303846, 708742, 677911, 596951, 509350, 490643, 425930, 416383, 366069, 470] },
    		 {id: 147,
    		  name: "泰国",
    		  lifeExpectancy: 77.15,
    		  demographics: [7548496, 8629471, 9617196, 9351071, 11070365, 10557509, 7301625, 3702813, 1847035],
    		  majorCauses: ['其他传染病', '其他非传染性疾病', '呼吸疾病', '自然灾害', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '呼吸疾病', '产妇疾病', '结核', '心血管疾病', '肥胖'],
    		  majorDeaths: [102596, 102583, 36188, 31550, 27266, 21922, 19813, 19372, 19183, 17239, 57],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '肝病', '冲突与恐怖主义', '营养不足', '艾滋病毒/艾滋病与结核病', '神经系统疾病', '自残', '肌肉骨骼疾病', '运输伤害', '肥胖'],
    		  diseaseDALYs: [2520200, 2359442, 1629403, 1474520, 1151289, 1131258, 1102666, 1030793, 842762, 795653, 867],
    		  riskFactors: ['非独家母乳喂养', '高胆固醇', '维生素A缺乏症', '二手烟', '水果饮食偏少', '饮食含盐量高', '低体力活动', 'COVID-19，直到2020年5月27日', '用药', '饮食中蔬菜含量低', '肥胖'],
    		  riskDALYs: [1544002, 1503953, 1495743, 1392361, 817709, 595479, 522351, 480904, 337081, 334390, 867] },
    		 {id: 148,
    		  name: "多哥",
    		  lifeExpectancy: 61.04,
    		  demographics: [2311118, 1866015, 1338976, 1041497, 716177, 432524, 246902, 107658, 21492],
    		  majorCauses: ['其他非传染性疾病', '冲突', '新生儿疾病', '产妇疾病', '呼吸疾病', '其他传染病', '消化系统疾病', '自杀', '肌肉骨骼疾病', '呼吸疾病', '肥胖'],
    		  majorDeaths: [7581, 6904, 4066, 3875, 3742, 3619, 3202, 2349, 1728, 1294, 13],
    		  diseaseNames: ['自残', '糖尿病，血液和内分泌疾病', '新生儿疾病', 'COVID-19，直到2020年5月27日', '其他非传染性疾病', '运输伤害', '冲突与恐怖主义', '人际暴力', '其他传染病', '神经系统疾病', '肥胖'],
    		  diseaseDALYs: [537846, 508891, 393410, 341328, 204478, 196801, 129842, 113892, 110100, 95415, 290],
    		  riskFactors: ['空气污染（室内和室外）', '缺铁', '水果饮食偏少', '不安全的卫生', '二手烟', '高胆固醇', '儿童发育不良', '非独家母乳喂养', '抽烟', '用药', '肥胖'],
    		  riskDALYs: [220449, 185196, 160336, 135929, 134583, 94600, 76138, 68658, 58437, 51784, 290] },
    		 {id: 149,
    		  name: "東加",
    		  lifeExpectancy: 70.91,
    		  demographics: [24631, 23270, 16616, 12190, 10251, 8452, 5150, 2759, 1178],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '营养不足', '呼吸疾病', '肌肉骨骼疾病', 'COVID-19，直到2020年5月27日', '呼吸疾病', '自然灾害', '心血管疾病', '新生儿疾病'],
    		  majorDeaths: [168, 130, 89, 42, 40, 38, 37, 30, 20, 15],
    		  diseaseNames: ['冲突与恐怖主义', '其他非传染性疾病', '其他传染病', '自残', '呼吸疾病', '肝病', '新生儿疾病', '疟疾和被忽视的热带病', '运输伤害', '神经系统疾病'],
    		  diseaseDALYs: [4546, 3934, 3332, 2361, 1709, 1669, 1572, 1366, 1351, 1273],
    		  riskFactors: ['高胆固醇', '非独家母乳喂养', '二手烟', '维生素A缺乏症', '水果饮食偏少', '饮食含盐量高', '用药', '高血压', 'COVID-19，直到2020年5月27日', '饮食中蔬菜含量低'],
    		  riskDALYs: [5164, 4209, 2848, 2083, 1566, 1338, 887, 702, 638, 590] },
    		 {id: 150,
    		  name: "突尼西亞",
    		  lifeExpectancy: 76.7,
    		  demographics: [2003420, 1617133, 1752255, 1915913, 1535771, 1342758, 920265, 405873, 201331],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '结核', '呼吸疾病', '营养不足', '肌肉骨骼疾病', '呼吸疾病', 'COVID-19，直到2020年5月27日', '心血管疾病', '肥胖'],
    		  majorDeaths: [34122, 9409, 3940, 3669, 2497, 1934, 1776, 1650, 1645, 1001, 48],
    		  diseaseNames: ['其他非传染性疾病', '冲突与恐怖主义', '肝病', '其他传染病', '神经系统疾病', '营养不足', '艾滋病毒/艾滋病与结核病', '运输伤害', '新生儿疾病', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [585199, 248559, 245020, 222652, 214692, 184184, 167150, 140000, 121829, 113084, 792],
    		  riskFactors: ['二手烟', '高胆固醇', '非独家母乳喂养', '维生素A缺乏症', '饮食含盐量高', '水果饮食偏少', '低体力活动', '用药', '高血压', '不安全的水源', '肥胖'],
    		  riskDALYs: [340549, 294028, 293805, 263027, 156922, 137558, 97722, 75056, 53044, 46210, 792] },
    		 {id: 151,
    		  name: "土耳其",
    		  lifeExpectancy: 77.69,
    		  demographics: [13501499, 13585939, 13087611, 12748548, 11221844, 8664742, 5968559, 3216491, 1434374],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '自然灾害', 'COVID-19，直到2020年5月27日', '营养不足', '呼吸疾病', '肌肉骨骼疾病', '结核', '新生儿疾病', '肥胖'],
    		  majorDeaths: [146584, 92760, 30377, 25063, 15153, 14803, 11029, 10147, 8604, 7759, 4397],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '冲突与恐怖主义', '神经系统疾病', '运输伤害', '营养不足', '呼吸疾病', '新生儿疾病', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [2919631, 2354596, 1872089, 1592440, 1393202, 1299523, 1292062, 1093030, 967562, 663606, 71536],
    		  riskFactors: ['维生素A缺乏症', '非独家母乳喂养', '二手烟', '高胆固醇', '水果饮食偏少', '饮食含盐量高', '低体力活动', '高血压', '不安全的水源', '用药', '肥胖'],
    		  riskDALYs: [2226441, 2042748, 1847649, 1636498, 1052115, 748929, 537754, 318850, 250390, 233411, 71536] },
    		 {id: 152,
    		  name: "土库曼斯坦",
    		  lifeExpectancy: 68.19,
    		  demographics: [1319649, 986539, 1030876, 931108, 681290, 527222, 315752, 97685, 51973],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '肌肉骨骼疾病', '心血管疾病', '呼吸疾病', '新生儿疾病', '自然灾害', '营养不足', 'COVID-19，直到2020年5月27日', '自杀'],
    		  majorDeaths: [17557, 3525, 2714, 2341, 1206, 1119, 1085, 699, 632, 515],
    		  diseaseNames: ['其他非传染性疾病', '自残', '新生儿疾病', '肌肉骨骼疾病', '其他传染病', '运输伤害', '冲突与恐怖主义', '心血管疾病', '疟疾和被忽视的热带病', '营养不足'],
    		  diseaseDALYs: [412359, 156211, 117894, 116563, 109893, 98719, 98581, 90861, 82484, 66974],
    		  riskFactors: ['二手烟', '非独家母乳喂养', '高胆固醇', '饮食含盐量高', '维生素A缺乏症', '水果饮食偏少', '用药', 'COVID-19，直到2020年5月27日', '空气污染（室内和室外）', '高血压'],
    		  riskDALYs: [261803, 192851, 190537, 127973, 124986, 79461, 71543, 58734, 39112, 37650] },
    		 {id: 153,
    		  name: "乌干达",
    		  lifeExpectancy: 63.37,
    		  demographics: [14582039, 11067913, 7564888, 4881270, 2997016, 1765499, 930221, 391414, 89327],
    		  majorCauses: ['新生儿疾病', '产妇疾病', '其他非传染性疾病', '冲突', '其他传染病', '呼吸疾病', '自杀', '消化系统疾病', '肌肉骨骼疾病', '结核', '肥胖'],
    		  majorDeaths: [26523, 25920, 22888, 22237, 20659, 14831, 14181, 11833, 8742, 5826, 0],
    		  diseaseNames: ['自残', 'COVID-19，直到2020年5月27日', '新生儿疾病', '糖尿病，血液和内分泌疾病', '运输伤害', '其他传染病', '意外伤害', '人际暴力', '其他非传染性疾病', '神经系统疾病', '肥胖'],
    		  diseaseDALYs: [3490823, 3014071, 2525060, 1935911, 1064399, 733907, 669265, 596318, 591241, 543171, 0],
    		  riskFactors: ['空气污染（室内和室外）', '缺铁', '水果饮食偏少', '不安全的卫生', '高胆固醇', '二手烟', '儿童发育不良', '抽烟', '维生素A缺乏症', '非独家母乳喂养', '肥胖'],
    		  riskDALYs: [862388, 642771, 631450, 504195, 368985, 360544, 304798, 239348, 179745, 179650, 0] },
    		 {id: 154,
    		  name: "乌克兰",
    		  lifeExpectancy: 72.06,
    		  demographics: [4688013, 4279672, 5165651, 7259196, 6313137, 6006155, 5470675, 2961499, 1849645],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '肌肉骨骼疾病', '心血管疾病', '脑膜炎', '呼吸疾病', '呼吸疾病', '痴呆', '结核', '肥胖'],
    		  majorDeaths: [427321, 96034, 34913, 30537, 20083, 13679, 11366, 9215, 8270, 6681, 644],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肌肉骨骼疾病', '疟疾和被忽视的热带病', '肝病', '营养不足', '心血管疾病', '神经系统疾病', '运输伤害', '精神和物质使用障碍', '肥胖'],
    		  diseaseDALYs: [7982965, 2712757, 1323796, 1323359, 1163398, 1059750, 816301, 778737, 677804, 651836, 8904],
    		  riskFactors: ['二手烟', '维生素A缺乏症', '非独家母乳喂养', '饮食含盐量高', '高胆固醇', '用药', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '不安全的水源', '低体力活动', '肥胖'],
    		  riskDALYs: [5022720, 3420787, 2728117, 2680474, 2115808, 1322553, 1176016, 772782, 738698, 510646, 8904] },
    		 {id: 155,
    		  name: "阿拉伯联合酋长国",
    		  lifeExpectancy: 77.97,
    		  demographics: [1006422, 835037, 2150663, 3072012, 1655625, 777310, 209301, 52385, 11771],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '结核', '呼吸疾病', '营养不足', 'COVID-19，直到2020年5月27日', '饮酒障碍', '脑膜炎', '肌肉骨骼疾病', '呼吸疾病', '肥胖'],
    		  majorDeaths: [7347, 5107, 3649, 1554, 1145, 829, 629, 599, 589, 586, 253],
    		  diseaseNames: ['其他非传染性疾病', '肝病', '艾滋病毒/艾滋病与结核病', '冲突与恐怖主义', '神经系统疾病', '其他传染病', '疟疾和被忽视的热带病', '营养不足', '呼吸疾病', '运输伤害', '肥胖'],
    		  diseaseDALYs: [244834, 208816, 191799, 179512, 178787, 172241, 136126, 124005, 118059, 108280, 7365],
    		  riskFactors: ['非独家母乳喂养', '低体力活动', '高胆固醇', '二手烟', '饮食含盐量高', '维生素A缺乏症', '水果饮食偏少', '用药', '饮食中蔬菜含量低', 'COVID-19，直到2020年5月27日', '肥胖'],
    		  riskDALYs: [250177, 220805, 177587, 159731, 151202, 116323, 92221, 46473, 33179, 30313, 7365] },
    		 {id: 156,
    		  name: "英国",
    		  lifeExpectancy: 81.32,
    		  demographics: [8065283, 7569160, 8630614, 9203569, 8624679, 9138365, 7206475, 5673457, 3418559],
    		  majorCauses: ['其他传染病', '其他非传染性疾病', '自然灾害', '呼吸疾病', '肥胖', '呼吸疾病', '肌肉骨骼疾病', '心血管疾病', '糖尿病', 'COVID-19，直到2020年5月27日', '脑膜炎'],
    		  majorDeaths: [179856, 176516, 63894, 47298, 37048, 36952, 29640, 9258, 7334, 6766, 5778],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '肝病', '营养不足', '神经系统疾病', '呼吸疾病', '运输伤害', '疟疾和被忽视的热带病', '冲突与恐怖主义', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [3323621, 2620719, 2099648, 1589106, 1296572, 1217869, 789427, 782490, 740272, 738202, 481718],
    		  riskFactors: ['维生素A缺乏症', '非独家母乳喂养', '二手烟', '高胆固醇', '饮食含盐量高', '肥胖', '水果饮食偏少', '低体力活动', '用药', '不安全的水源', '饮食中蔬菜含量低'],
    		  riskDALYs: [2021182, 1448311, 1337544, 1293288, 752234, 481718, 480135, 424409, 362994, 219675, 219262] },
    		 {id: 157,
    		  name: "美国",
    		  lifeExpectancy: 78.86,
    		  demographics: [39891845, 42398071, 46179065, 43980069, 40288440, 42557686, 37845098, 23009234, 12915409],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '呼吸疾病', '肌肉骨骼疾病', '肥胖', '呼吸疾病', 'COVID-19，直到2020年5月27日', '营养不足', '饮酒障碍', '心血管疾病'],
    		  majorDeaths: [902270, 699394, 258587, 196983, 114419, 98916, 93792, 84944, 68558, 67629, 62493],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '冲突与恐怖主义', '神经系统疾病', '营养不足', '呼吸疾病', '运输伤害', '疟疾和被忽视的热带病', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [15273136, 14368167, 9550395, 7190242, 7176630, 6691294, 5887644, 3992949, 3787971, 3546678, 1363568],
    		  riskFactors: ['非独家母乳喂养', '维生素A缺乏症', '高胆固醇', '二手烟', '低体力活动', '饮食含盐量高', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '用药', '肥胖', '饮食中蔬菜含量低'],
    		  riskDALYs: [11440537, 10405127, 9566522, 7850854, 6465949, 4010823, 2432143, 1978011, 1966068, 1363568, 1249128] },
    		 {id: 158,
    		  name: "乌拉圭",
    		  lifeExpectancy: 77.91,
    		  demographics: [473133, 483284, 512458, 458714, 451252, 390115, 321685, 216752, 154338],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '自然灾害', '呼吸疾病', '呼吸疾病', '肌肉骨骼疾病', '营养不足', 'COVID-19，直到2020年5月27日', '脑膜炎', '结核', '肥胖'],
    		  majorDeaths: [9912, 9576, 2363, 2065, 1476, 1455, 796, 787, 676, 609, 22],
    		  diseaseNames: ['其他传染病', '其他非传染性疾病', '肝病', '神经系统疾病', '营养不足', '冲突与恐怖主义', '疟疾和被忽视的热带病', '呼吸疾病', '运输伤害', '肌肉骨骼疾病', '肥胖'],
    		  diseaseDALYs: [191969, 155889, 81966, 64215, 59439, 57322, 54943, 48981, 48284, 34011, 292],
    		  riskFactors: ['维生素A缺乏症', '高胆固醇', '非独家母乳喂养', '二手烟', '饮食含盐量高', '水果饮食偏少', 'COVID-19，直到2020年5月27日', '用药', '饮食中蔬菜含量低', '低体力活动', '肥胖'],
    		  riskDALYs: [122819, 102193, 92697, 90942, 35618, 25552, 24250, 22019, 16300, 16013, 292] },
    		 {id: 159,
    		  name: "乌兹别克斯坦",
    		  lifeExpectancy: 71.72,
    		  demographics: [6664494, 5370904, 6061979, 5409605, 3820670, 3028065, 1810321, 546389, 269288],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '肌肉骨骼疾病', '心血管疾病', '呼吸疾病', '营养不足', '新生儿疾病', '自然灾害', '呼吸疾病', '结核', '肥胖'],
    		  majorDeaths: [115263, 19020, 12837, 10974, 9749, 6468, 5348, 4578, 4239, 3990, 14],
    		  diseaseNames: ['其他非传染性疾病', '自残', '其他传染病', '新生儿疾病', '冲突与恐怖主义', '肌肉骨骼疾病', '疟疾和被忽视的热带病', '营养不足', '运输伤害', '肝病', '肥胖'],
    		  diseaseDALYs: [2443175, 886397, 597123, 595292, 558138, 526686, 503123, 443174, 434858, 410622, 275],
    		  riskFactors: ['二手烟', '高胆固醇', '非独家母乳喂养', '饮食含盐量高', '水果饮食偏少', '维生素A缺乏症', '用药', 'COVID-19，直到2020年5月27日', '空气污染（室内和室外）', '抽烟', '肥胖'],
    		  riskDALYs: [1496057, 1280895, 1076363, 745685, 642961, 621056, 458090, 302480, 258512, 232779, 275] },
    		 {id: 160,
    		  name: "瓦努阿图",
    		  lifeExpectancy: 70.47,
    		  demographics: [80126, 64634, 50207, 39556, 28333, 19760, 10910, 4727, 1629],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '肌肉骨骼疾病', '呼吸疾病', '营养不足', '新生儿疾病', 'COVID-19，直到2020年5月27日', '心血管疾病', '结核'],
    		  majorDeaths: [797, 274, 146, 130, 120, 94, 87, 67, 59, 52],
    		  diseaseNames: ['其他非传染性疾病', '自残', '冲突与恐怖主义', '新生儿疾病', '其他传染病', '呼吸疾病', '运输伤害', '疟疾和被忽视的热带病', '肌肉骨骼疾病', '肝病'],
    		  diseaseDALYs: [22223, 12105, 10112, 8331, 8231, 6302, 6104, 5833, 4745, 3980],
    		  riskFactors: ['二手烟', '高胆固醇', '非独家母乳喂养', '水果饮食偏少', '饮食含盐量高', '维生素A缺乏症', '用药', '饮食中蔬菜含量低', '空气污染（室内和室外）', 'COVID-19，直到2020年5月27日'],
    		  riskDALYs: [14567, 13135, 10947, 8110, 7425, 7106, 4631, 3783, 3261, 2428] },
    		 {id: 161,
    		  name: "委内瑞拉",
    		  lifeExpectancy: 72.06,
    		  demographics: [5161179, 5131622, 4293108, 4112119, 3551367, 2964615, 1955306, 946456, 400056],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '恐怖主义', '营养不足', 'COVID-19，直到2020年5月27日', '结核', '自然灾害', '肌肉骨骼疾病', '呼吸疾病', '呼吸疾病', '肥胖'],
    		  majorDeaths: [52708, 30238, 14760, 8670, 8403, 6988, 6898, 6881, 5694, 5184, 11],
    		  diseaseNames: ['其他非传染性疾病', '消化系统疾病', '其他传染病', '冲突与恐怖主义', '新生儿疾病', '神经系统疾病', '运输伤害', '营养不足', '艾滋病毒/艾滋病与结核病', '肝病', '肥胖'],
    		  diseaseDALYs: [1039079, 868219, 779521, 639505, 499148, 436324, 413955, 410885, 409658, 399136, 186],
    		  riskFactors: ['非独家母乳喂养', '二手烟', '高胆固醇', '维生素A缺乏症', '饮食含盐量高', '水果饮食偏少', '用药', '饮食中蔬菜含量低', 'COVID-19，直到2020年5月27日', '低体力活动', '肥胖'],
    		  riskDALYs: [762035, 749717, 686646, 426608, 301614, 252091, 161369, 145538, 118144, 113563, 186] },
    		 {id: 162,
    		  name: "越南",
    		  lifeExpectancy: 75.4,
    		  demographics: [15416497, 13451055, 15886425, 15977005, 13383787, 10911362, 6922468, 2640054, 1873454],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '肌肉骨骼疾病', '自然灾害', '营养不足', '心血管疾病', '结核', '呼吸疾病', '自杀', '肥胖'],
    		  majorDeaths: [201137, 120617, 35946, 29614, 28274, 23439, 22607, 21431, 18137, 17594, 0],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '肝病', '冲突与恐怖主义', '营养不足', '运输伤害', '疟疾和被忽视的热带病', '艾滋病毒/艾滋病与结核病', '神经系统疾病', '自残', '肥胖'],
    		  diseaseDALYs: [4127692, 3149728, 1682582, 1573487, 1329423, 1253509, 1236854, 1231032, 1208151, 1133110, 0],
    		  riskFactors: ['二手烟', '高胆固醇', '维生素A缺乏症', '水果饮食偏少', '非独家母乳喂养', '用药', '饮食含盐量高', 'COVID-19，直到2020年5月27日', '低体力活动', '高血压', '肥胖'],
    		  riskDALYs: [2694716, 2423017, 2329745, 1363548, 953163, 929387, 794256, 787186, 650700, 441172, 0] },
    		 {id: 163,
    		  name: "世界",
    		  lifeExpectancy: 72.58,
    		  demographics: [1339127564, 1244883537, 1194975548, 1132908777, 967210641, 816097736, 575804788, 299355359, 143104251],
    		  majorCauses: ['其他非传染性疾病', '其他传染病', '呼吸疾病', '呼吸疾病', '自然灾害', '肌肉骨骼疾病', '新生儿疾病', '消化系统疾病', '营养不足', '心血管疾病', '肥胖'],
    		  majorDeaths: [17790949, 9556245, 3914196, 2558606, 2514619, 2377685, 1783770, 1569556, 1369849, 1322868, 350212],
    		  diseaseNames: ['其他非传染性疾病', '其他传染病', '自残', '新生儿疾病', '肝病', '冲突与恐怖主义', '运输伤害', '神经系统疾病', '呼吸疾病', '营养不足', '肥胖'],
    		  diseaseDALYs: [362381389, 230815088, 229961383, 191193185, 136350616, 133747830, 123452995, 121240264, 111041442, 109462440, 5601995],
    		  riskFactors: ['二手烟', '维生素A缺乏症', '高胆固醇', '水果饮食偏少', '非独家母乳喂养', '空气污染（室内和室外）', '饮食含盐量高', 'COVID-19，直到2020年5月27日', '用药', '缺铁', '肥胖'],
    		  riskDALYs: [215645558, 182157003, 167407681, 148834208, 144091083, 95632517, 93844026, 69981368, 64856023, 64282494, 5601995] },
    		 {id: 164,
    		  name: "也门",
    		  lifeExpectancy: 66.12,
    		  demographics: [7957248, 6628518, 5663615, 3953524, 2239232, 1382738, 848627, 387468, 100952],
    		  majorCauses: ['其他非传染性疾病', '新生儿疾病', '下呼吸道感染', '其他传染病', '结核', '消化系统疾病', '呼吸疾病', '呼吸疾病', '肌肉骨骼疾病', '自然灾害', '肥胖'],
    		  majorDeaths: [53367, 18040, 16811, 11942, 9556, 8125, 6366, 4968, 3490, 2672, 49],
    		  diseaseNames: ['新生儿疾病', '其他非传染性疾病', '自残', '腹泻和常见传染病', '运输伤害', '人际暴力', '艾滋病毒/艾滋病与结核病', '神经系统疾病', '冲突与恐怖主义', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [1718808, 1355173, 1178751, 1006373, 896708, 855459, 598635, 485971, 459085, 415361, 1077],
    		  riskFactors: ['空气污染（室内和室外）', '二手烟', '抽烟', '缺铁', '非独家母乳喂养', '水果饮食偏少', '高胆固醇', '饮食含盐量高', '维生素A缺乏症', '儿童发育不良', '肥胖'],
    		  riskDALYs: [831197, 701666, 686920, 546393, 459939, 459135, 435825, 422401, 370118, 365007, 1077] },
    		 {id: 165,
    		  name: "赞比亚",
    		  lifeExpectancy: 63.89,
    		  demographics: [5569170, 4426210, 3069086, 2117552, 1347824, 726745, 386102, 173103, 45242],
    		  majorCauses: ['产妇疾病', '其他非传染性疾病', '新生儿疾病', '呼吸疾病', '其他传染病', '自杀', '消化系统疾病', '肌肉骨骼疾病', '冲突', '心血管疾病', '肥胖'],
    		  majorDeaths: [21807, 12157, 9688, 8979, 8826, 8307, 7748, 5040, 4673, 3257, 7],
    		  diseaseNames: ['COVID-19，直到2020年5月27日', '自残', '新生儿疾病', '运输伤害', '糖尿病，血液和内分泌疾病', '人际暴力', '其他非传染性疾病', '其他传染病', '冲突与恐怖主义', '疟疾和被忽视的热带病', '肥胖'],
    		  diseaseDALYs: [2030052, 1707416, 900812, 502967, 391788, 334898, 319041, 302693, 253262, 234132, 164],
    		  riskFactors: ['空气污染（室内和室外）', '缺铁', '水果饮食偏少', '不安全的卫生', '高胆固醇', '儿童发育不良', '二手烟', '高血糖', '维生素A缺乏症', '非独家母乳喂养', '肥胖'],
    		  riskDALYs: [631163, 411032, 344582, 309455, 221962, 182199, 176329, 130440, 126593, 118268, 164] },
    		 {id: 166,
    		  name: "津巴布韦",
    		  lifeExpectancy: 61.49,
    		  demographics: [4312155, 3456516, 2462905, 1862792, 1205778, 674792, 410758, 196977, 62799],
    		  majorCauses: ['其他非传染性疾病', '产妇疾病', '呼吸疾病', '自杀', '其他传染病', '新生儿疾病', '消化系统疾病', '呼吸疾病', '肌肉骨骼疾病', '人际暴力', '肥胖'],
    		  majorDeaths: [16977, 16065, 12370, 11958, 11440, 8412, 4603, 3412, 3387, 3158, 4],
    		  diseaseNames: ['COVID-19，直到2020年5月27日', '自残', '新生儿疾病', '其他非传染性疾病', '其他传染病', '人际暴力', '冲突与恐怖主义', '疟疾和被忽视的热带病', '运输伤害', '艾滋病毒/艾滋病与结核病', '肥胖'],
    		  diseaseDALYs: [2112674, 1418231, 804919, 470598, 358516, 324526, 300375, 249593, 240049, 180995, 84],
    		  riskFactors: ['空气污染（室内和室外）', '水果饮食偏少', '高胆固醇', '二手烟', '维生素A缺乏症', '缺铁', '非独家母乳喂养', '不安全的卫生', '儿童发育不良', '用药', '肥胖'],
    		  riskDALYs: [543888, 428451, 339950, 279958, 268280, 263176, 204466, 181818, 115425, 102441, 84] },
    		],
      });

    // version = 2020-05-29 13:02:59;

    const spanishDictStore = readable({ 
    	app: {
    		 mainTitle: "Calculadora COVID",
    		 subtitle: "Una herramienta visual para explorar y analizar los posibles impactos de COVID-19",
    		 tabItem0: "Mortalidad por edad",
    		 tabItem1: "Estimaciones en contexto",
    		 tabItem2: "Riesgos por pais",
    		 tabItem3: "Proyecto de pobreza",
    		 tabItem4: "Proj. De muertes",
    		 tabItem5: "Hyp Escenarios",
    		 tabItem6: "Ex. Interpretaciones",
    		 location: "Ubicación",
    		 selectLocation: "Seleccione ubicación",
    		 locationDescription: "El impacto de COVID-19 varía entre países.",
    		 infectionRate: "Tasa de infección",
    		 infectionRateDescription: "Proporción de todas las personas que contraen el nuevo coronavirus.",
    		 over60InfectionRate: "Más de 60 tasa de infección",
    		 below60InfectionRate: "Por debajo de 60 tasa de infección",
    		 over60Description: "Proporción de todas las personas mayores de 60 años que contraen el nuevo coronavirus.",
    		 proportionIsThen: "La proporción de personas menores de 60 años infectadas es entonces",
    		 proportionIsThenDescription: "Dado que depende tanto de la tasa de infección general como de la tasa de infección de las personas mayores de 60 años.",
    		 basedOn: "Residencia en",
    		 basedOnContinued1: "tasas de mortalidad y",
    		 basedOnContinued2: "distribución de edad y otros parámetros de entrada seleccionados, podemos esperar:",
    		 basedOnContinued3: "infectado y",
    		 basedOnContinued4: "muertes o",
    		 basedOnContinued5: "años de vida perdidos en",
    		 compareWithOtherCaption1: "Es posible que las muertes estimadas de coronavirus abarquen varios años.",
    		 compareWithOtherCaption2: "Las muertes por otras causas son para el año 2017. Fuente:",
    		 compareWithOtherCaption3: "Muertes confirmadas por COVID-19 hasta el 27 de mayo de 2020. Fuente:",
    		 compareWithOtherCaption4: "Los años de vida perdidos por otras causas son para el año 2017. Fuente:",
    		 compareWithOtherCaption5: "Años de vida perdidos debido a COVID-19 hasta el 27 de mayo de 2020. Fuente:",
    		 authorsCalculations: "y cálculos de autores.",
    		 compareWithOtherCaption7: "Los años de vida perdidos debido a otros factores de riesgo son para el año 2017. Fuente:",
    		 proportionOver60ByCountry: "Proporción de personas mayores de 60 años de riesgo por país",
    		 lowIncomeRiskByCountry: "Riesgo de bajos ingresos por país",
    		 mapCaption: "Puede pasar el cursor sobre los elementos de leyenda para seleccionar. Puede acercar y alejar el mapa. Y pase el mouse sobre el mapa para obtener información sobre el país que representa.",
    		 projectedPovery: "Los aumentos proyectados por país debido al impacto del coronavirus en la economía mundial en el número de personas que viven en la pobreza extrema, es decir, un ingreso por debajo de la línea internacional de pobreza de $ 1.90 por día.",
    		 sources: "Fuentes:",
    		 projectedPoveryByRegion: "La pobreza proyectada aumenta por región debido al impacto del coronavirus en la economía mundial.",
    		 projectionsCaption: "Proyecciones del total de muertes por COVID-19. Haga clic en la leyenda para seleccionar o anular la selección de un país.",
    		 source: "Fuente:",
    		 reset: "Reiniciar",
    		 infectedTitle: "Número esperado de infectados por edad",
    		 deathsTitle: "Número esperado de muertes por edad",
    		 age: "Años",
    		 infected: "Infectado",
    		 deaths: "Fallecidos",
    		 projectionsTitle: "Millones potenciales empujados a la pobreza extrema debido a COVID-19 por",
    		 date: "Fecha",
    		 totDeaths: "Muertes totales",
    		 totDeathsProj: "Muertes totales (proyectadas)",
    		 titleListMain: "Cómo se compara COVID-19 con",
    		 titleListName: "Porque",
    		 titleListRisk: "Riesgo",
    		 titleListNumber: " en",
    		 yearsOfLifeLost: "Años de vida perdida",
    		 inCountry: " en",
    		 compareItems0: "Causas de la muerte",
    		 compareItems1: "Causas de años de vida perdidos",
    		 compareItems2: "Factores de riesgo en años de vida perdidos",
    		 covid19Cause: "COVID-19 (estimado)",
    		 enterDescribtion: "Ingrese la descripción",
    		 yrsOfLifeLost: "Años esperados de vida perdidos",
    		 yrsOfLifeLostCosts: "Costos potenciales",
    		 scenariosDescription: "Descripción del escenario",
    		 country: "País",
    		 region: "Región",
    		 people: "Personas",
    		 india: "India",
    		 nigeria: "Nigeria",
    		 drCongo: "República Democrática del Congo",
    		 ethiopia: "Etiopía",
    		 bangladesh: "Bangladés",
    		 tanzania: "Tanzania",
    		 madagascar: "Madagascar",
    		 indonesia: "Indonesia",
    		 kenya: "Kenia",
    		 mozambique: "Mozambique",
    		 uganda: "Uganda",
    		 southAfrica: "Sudáfrica",
    		 subSahAfrica: "Africa Sub-sahariana",
    		 southAsia: "Asia del Sur",
    		 eastAsiaPacific: "Asia oriental y el Pacífico",
    		 latinCaribbean: "América Latina y el Caribe",
    		 middleEastNorthAfrica: "Medio Oriente y África del Norte",
    		 europeCentralAsia: "Europa y Asia central",
    		 northAmerica: "Norteamérica",
    		 mainProjRegions: "Causas de la muerte",
    		 nameProjRegions: "Causas de años de vida perdidos",
    		 numberProjRegions: "Factores de riesgo en años de vida perdidos",
    		 fatalityRates: "Tasas de fatalidad",
    		 fatalityRatesDescription: "Seleccione estimaciones del riesgo de muerte por infección con el nuevo coronavirus. Las estimaciones varían entre países y con el tiempo. Las pruebas más amplias pueden reducir las estimaciones de CFR.",
    		 varyFRs: "Variar las tasas de mortalidad seleccionadas",
    		 varyFRsDescription1: "Intente aumentar el riesgo de muerte, p. al 50%, para países de bajos ingresos o asistencia sanitaria abrumada.",
    		 varyFRsDescription2: "O disminuyendo, p. hasta -50%, para tratamientos mejorados esperados y mejor atención médica.",
    		 resetDescription: "Regrese todos los parámetros de entrada a sus valores iniciales.",
    		 elimination: "Probabilidad de eliminar COVID-19",
    		 eliminationDescription1: "Probabilidad de lograr la eliminación completa de la enfermedad COVID-19 antes de que pueda infectar",
    		 eliminationDescription2: "de población.",
    		 infectionUntil: "Tasa de infección hasta la eliminación",
    		 infectionUntilDescription: "Proporción de la población que aún se infecta incluso en caso de lograr la eliminación completa. Nota: Primero aumente la probabilidad de eliminación para que este parámetro surta efecto.",
    		 hideExport: "Ocultar exportación",
    		 export: "Exportar",
    		 exportDescription: "Exporte escenarios hipotéticos de COVID-19 en formato JSON.",
    		 export1: "Ocultar exportación",
    		 scenariosCaption: "Puede establecer parámetros de entrada que describan un escenario hipotético y agregarlo a la tabla para comparar. Hay 3 ejemplos de escenarios hipotéticos para la ubicación seleccionada y los riesgos de mortalidad. Los resultados deben interpretarse con cautela; consulte las Interpretaciones de ejemplo.",
    		 exampleScenario0: "Escenario 0: no hacer nada, como referencia",
    		 exampleScenario1: "Escenario 1: Proteja a las personas mayores de 60 años, compense exponiendo a los menores de 60 años, considere también los años de vida perdidos",
    		 exampleScenario2: "Escenario 2: eliminación al 90%, considere también el dinero ahorrado",
    		 mapTitle: "COVID-19 Riesgos por país",
    		 mapItems0: "Proporción de personas mayores de 60 años por país",
    		 mapItems1: "Riesgo de bajos ingresos por país",
    		 povertyItems0: "Por país",
    		 povertyItems1: "Por región",
    		},
    	fatalityRisks: [
    		 {id: 0,
    		  source: "Colegio Imperial - IFR",
    		  ftr: [0.002, 0.006, 0.03, 0.08, 0.15, 0.6, 2.2, 5.1, 9.3] },
    		 {id: 1,
    		  source: "China CDC - CFR",
    		  ftr: [0, 0.2, 0.2, 0.2, 0.4, 1.3, 3.6, 8, 14.8] },
    		 {id: 2,
    		  source: "Corea CDC - CFR",
    		  ftr: [0, 0, 0, 0.11, 0.08, 0.5, 1.8, 6.3, 13] },
    		 {id: 3,
    		  source: "JAMA Italia - CFR",
    		  ftr: [0, 0, 0, 0.3, 0.4, 1, 3.5, 12.8, 20.2] },
    		 {id: 4,
    		  source: "MISAN España - CFR",
    		  ftr: [0, 0, 0.22, 0.14, 0.3, 0.4, 1.9, 4.8, 15.6] },
    		],
    	compareOptions: [
    		 {id: 0,
    		  compareWith: "Otras causas importantes de muerte" },
    		 {id: 1,
    		  compareWith: "Enfermedades en años de vida perdidos" },
    		 {id: 2,
    		  compareWith: "Factores de riesgo en años de vida perdidos" },
    		 {id: 3,
    		  compareWith: "Otros paises del mundo" },
    		],
    	countries: [
    		 {id: 0,
    		  name: "Afganistán",
    		  lifeExpectancy: 64.83,
    		  demographics: [11040694, 9635671, 6779023, 4381488, 2846500, 1773768, 1020779, 458747, 105087],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Trastornos neonatales', 'Infecciones respiratorias inferiores', 'Cánceres', 'Lesiones viales', 'Enfermedades respiratorias', 'Meningitis', 'Enfermedades diarreicas', 'Terrorismo', 'Diabetes', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [56119, 27522, 21431, 16670, 8692, 6917, 6589, 6176, 6092, 5978, 220],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Conflicto y terrorismo', 'Enfermedades cardiovasculares', 'Otras ENT', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones no intencionales', 'Cánceres', 'Lesiones de transporte', 'VIH / SIDA y tuberculosis', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [2949759, 2461244, 2128416, 1596954, 1539479, 975117, 797604, 601374, 551807, 542777, 4967],
    		  riskFactors: ['Contaminación del aire (exterior e interior)', 'Emaciación infantil', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'Obesidad', 'Fuente de agua insegura', 'Deficiencia de vitamina A', 'Retraso del crecimiento infantil', 'Dieta baja en frutas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [1341395, 1306178, 901181, 866085, 807902, 689543, 523650, 475516, 455174, 378229, 4967] },
    		 {id: 1,
    		  name: "Albania",
    		  lifeExpectancy: 78.57,
    		  demographics: [333920, 375307, 481846, 377350, 330419, 392129, 317994, 189973, 81975],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'Nefropatía', 'Enfermedades del HIGADO', 'Lesiones viales', 'Enfermedad de Parkinson', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [12145, 4345, 1337, 736, 489, 382, 363, 309, 248, 234, 33],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Lesiones no intencionales', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Otras ENT', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos neonatales', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [206331, 100981, 64286, 53506, 51865, 38507, 37568, 35191, 27693, 24834, 483],
    		  riskFactors: ['Hipertensión', 'De fumar', 'Obesidad', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Dieta baja en frutas', 'Humo de segunda mano', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [128064, 99946, 69372, 57453, 55471, 37120, 29156, 16674, 13809, 10129, 483] },
    		 {id: 2,
    		  name: "Argelia",
    		  lifeExpectancy: 76.88,
    		  demographics: [9533023, 6466198, 6759761, 7193824, 5249023, 3682969, 2430965, 1179741, 557550],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Lesiones viales', 'Trastornos neonatales', 'Enfermedades respiratorias', 'Diabetes', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'Nefropatía', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [79389, 21656, 8175, 6905, 6511, 5508, 5202, 4800, 4724, 4577, 617],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Otras ENT', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos neonatales', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Cánceres', 'Desórdenes neurológicos', 'Lesiones de transporte', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1577873, 857655, 809853, 773630, 767622, 694410, 601103, 581302, 441546, 404974, 10657],
    		  riskFactors: ['Obesidad', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'De fumar', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'El consumo de drogas', 'Dieta baja en frutas', 'Humo de segunda mano', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [956409, 835084, 810448, 541145, 412426, 388376, 354830, 213070, 163252, 146851, 10657] },
    		 {id: 3,
    		  name: "Angola",
    		  lifeExpectancy: 61.15,
    		  demographics: [10645848, 7583998, 5137763, 3567431, 2316948, 1419872, 744701, 323212, 85526],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Trastornos neonatales', 'Enfermedades diarreicas', 'VIH / SIDA', 'Infecciones respiratorias inferiores', 'Cánceres', 'Tuberculosis', 'Malaria', 'Enfermedades digestivas', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [21785, 17882, 17390, 14585, 14508, 12040, 11409, 8431, 8274, 6781, 4],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'VIH / SIDA y tuberculosis', 'Otras ENT', 'Malaria y enfermedades tropicales desatendidas', 'Deficiencias nutricionales', 'Enfermedades cardiovasculares', 'Lesiones no intencionales', 'Lesiones de transporte', 'Cánceres', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [2327125, 1715532, 1024134, 829609, 816838, 737124, 587699, 479827, 474564, 395113, 91],
    		  riskFactors: ['Emaciación infantil', 'Fuente de agua insegura', 'Saneamiento inseguro', 'Contaminación del aire (exterior e interior)', 'Nivel alto de azúcar en la sangre', 'Deficiencia de vitamina A', 'Hipertensión', 'Retraso del crecimiento infantil', 'Deficiencia de hierro', 'De fumar', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [1441565, 1065429, 706854, 558639, 474834, 471166, 388213, 342714, 308832, 291488, 91] },
    		 {id: 4,
    		  name: "Argentina",
    		  lifeExpectancy: 76.67,
    		  demographics: [7431085, 7110303, 6989730, 6393900, 5596155, 4365874, 3478296, 2234324, 1181008],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Infecciones respiratorias inferiores', 'Enfermedades respiratorias', 'Demencia', 'Enfermedades digestivas', 'Nefropatía', 'Diabetes', 'Enfermedades del HIGADO', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [105777, 74066, 31058, 18992, 18617, 14906, 10834, 9345, 7346, 6457, 484],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones no intencionales', 'Otras ENT', 'Desórdenes neurológicos', 'Diarrea y enfermedades infecciosas comunes.', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1850384, 1636213, 1070031, 821073, 755647, 600218, 586346, 572018, 566705, 485965, 7111],
    		  riskFactors: ['De fumar', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'El consumo de drogas', 'Dieta baja en vegetales', 'Dieta baja en frutas', 'Dieta rica en sal', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [1377562, 1041499, 1039208, 849828, 466427, 374352, 209665, 188972, 182487, 181170, 7111] },
    		 {id: 5,
    		  name: "Armenia",
    		  lifeExpectancy: 75.09,
    		  demographics: [421267, 361638, 430188, 495062, 344211, 375592, 312416, 122717, 94637],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades digestivas', 'Demencia', 'Enfermedades respiratorias', 'Diabetes', 'Enfermedades del HIGADO', 'Infecciones respiratorias inferiores', 'Nefropatía', 'Suicidio', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [13631, 5756, 1720, 1357, 1311, 1142, 1107, 501, 430, 302, 91],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Otras ENT', 'Lesiones no intencionales', 'Enfermedades digestivas', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [232712, 134659, 70952, 55930, 50354, 50085, 45363, 45321, 42045, 33336, 1338],
    		  riskFactors: ['Hipertensión', 'Nivel alto de azúcar en la sangre', 'De fumar', 'Obesidad', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Dieta baja en frutas', 'Humo de segunda mano', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [150086, 147509, 126246, 106265, 76463, 61605, 33567, 31703, 26363, 17455, 1338] },
    		 {id: 6,
    		  name: "Australia",
    		  lifeExpectancy: 83.44,
    		  demographics: [3280238, 3079378, 3401525, 3662343, 3282597, 3093653, 2605017, 1768659, 1029790],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Nefropatía', 'Infecciones respiratorias inferiores', 'Diabetes', 'Suicidio', 'Enfermedad de Parkinson', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [52101, 50254, 17119, 10822, 6112, 4455, 4451, 3755, 3055, 2328, 102],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Desórdenes neurológicos', 'Lesiones no intencionales', 'Enfermedades respiratorias', 'Diabetes, sangre y enfermedades endocrinas.', 'Otras ENT', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [970836, 694335, 645111, 549355, 438634, 432478, 305003, 292021, 244224, 147752, 1386],
    		  riskFactors: ['De fumar', 'Obesidad', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'El consumo de drogas', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Baja actividad física', 'Dieta baja en vegetales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [522203, 490967, 365301, 358549, 199475, 186884, 93142, 87901, 63860, 58260, 1386] },
    		 {id: 7,
    		  name: "Austria",
    		  lifeExpectancy: 81.54,
    		  demographics: [863022, 877100, 1124426, 1224528, 1195561, 1402944, 1000416, 789863, 477248],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Nefropatía', 'Diabetes', 'Enfermedades del HIGADO', 'Suicidio', 'Enfermedad de Parkinson', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [31386, 21745, 7481, 3383, 3227, 2754, 2059, 1860, 1422, 994, 643],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones no intencionales', 'Otras ENT', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [412725, 410715, 249516, 205240, 164586, 148028, 122133, 119273, 104957, 103622, 8364],
    		  riskFactors: ['De fumar', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'El consumo de drogas', 'Baja actividad física', 'Dieta baja en frutas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [289316, 247866, 234711, 198890, 118630, 69586, 40222, 38446, 32621, 32476, 8364] },
    		 {id: 8,
    		  name: "Azerbaiyán",
    		  lifeExpectancy: 73.0,
    		  demographics: [1680978, 1317438, 1666611, 1724388, 1263973, 1281704, 743188, 232553, 136886],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades digestivas', 'Enfermedades del HIGADO', 'Infecciones respiratorias inferiores', 'Demencia', 'Enfermedades respiratorias', 'Trastornos neonatales', 'Diabetes', 'Nefropatía', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [40266, 10954, 3940, 3141, 3055, 2482, 2340, 2274, 1752, 1169, 52],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Otras ENT', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones no intencionales', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [821522, 314922, 242153, 241789, 193598, 185831, 167301, 151704, 146958, 135223, 929],
    		  riskFactors: ['Hipertensión', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'De fumar', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Dieta rica en sal', 'Humo de segunda mano', 'Emaciación infantil', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [510416, 425013, 362881, 334822, 279459, 197950, 127029, 125321, 104163, 86129, 929] },
    		 {id: 9,
    		  name: "Bahamas",
    		  lifeExpectancy: 73.92,
    		  demographics: [54179, 64391, 65619, 54838, 56558, 48211, 27694, 13163, 4833],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes', 'VIH / SIDA', 'Homicidio', 'Infecciones respiratorias inferiores', 'Enfermedades digestivas', 'Nefropatía', 'Demencia', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [801, 530, 128, 114, 107, 105, 104, 93, 92, 60, 11],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos musculoesqueléticos', 'Violencia interpersonal', 'Trastornos mentales y por abuso de sustancias.', 'Otras ENT', 'VIH / SIDA y tuberculosis', 'Desórdenes neurológicos', 'Diarrea y enfermedades infecciosas comunes.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [18194, 13979, 12275, 6281, 6124, 6111, 5713, 5541, 5507, 4614, 192],
    		  riskFactors: ['Obesidad', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'De fumar', 'Contaminación del aire (exterior e interior)', 'Dieta baja en vegetales', 'El consumo de drogas', 'Baja actividad física', 'Dieta rica en sal', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [13121, 11928, 10905, 4719, 4611, 3432, 1440, 1366, 1195, 982, 192] },
    		 {id: 10,
    		  name: "Baréin",
    		  lifeExpectancy: 77.29,
    		  demographics: [215191, 177424, 318510, 464806, 244359, 137046, 61268, 16906, 5654],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes', 'Enfermedades digestivas', 'Nefropatía', 'Lesiones viales', 'Enfermedades respiratorias', 'Demencia', 'Infecciones respiratorias inferiores', 'Enfermedades del HIGADO', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [961, 553, 529, 143, 133, 128, 114, 110, 95, 84, 14],
    		  diseaseNames: ['Diabetes, sangre y enfermedades endocrinas.', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades cardiovasculares', 'Desórdenes neurológicos', 'Otras ENT', 'Cánceres', 'Trastornos neonatales', 'Enfermedades respiratorias', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [39073, 32240, 29024, 26949, 19107, 18531, 15791, 10408, 10052, 9970, 339],
    		  riskFactors: ['Obesidad', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Contaminación del aire (exterior e interior)', 'El consumo de drogas', 'De fumar', 'Colesterol alto', 'Humo de segunda mano', 'Dieta baja en frutas', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [36296, 34551, 18126, 14303, 14207, 12588, 11243, 3904, 3635, 3064, 339] },
    		 {id: 11,
    		  name: "Bangladés",
    		  lifeExpectancy: 72.59,
    		  demographics: [29140694, 30882112, 29600040, 26177061, 20143207, 14480320, 6892779, 4064814, 1665146],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades respiratorias', 'Trastornos neonatales', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'Diabetes', 'Enfermedades diarreicas', 'Enfermedades del HIGADO', 'Demencia', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [320563, 99302, 82276, 53449, 44992, 38521, 34564, 30147, 26390, 17256, 522],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Trastornos neonatales', 'Diarrea y enfermedades infecciosas comunes.', 'Trastornos musculoesqueléticos', 'Cánceres', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades respiratorias', 'Lesiones no intencionales', 'Otras ENT', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [7263655, 5707014, 4266872, 2891058, 2718396, 2592864, 2488098, 2370531, 2224279, 2204327, 9574],
    		  riskFactors: ['Contaminación del aire (exterior e interior)', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'De fumar', 'Dieta baja en frutas', 'Colesterol alto', 'Obesidad', 'Emaciación infantil', 'Dieta baja en vegetales', 'Dieta rica en sal', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [3871076, 3578773, 2726100, 2320793, 1895086, 1668575, 1459444, 1428511, 1260828, 998683, 9574] },
    		 {id: 12,
    		  name: "Barbados",
    		  lifeExpectancy: 79.19,
    		  demographics: [30994, 36993, 37512, 37294, 39394, 40137, 32664, 19336, 12696],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes', 'Infecciones respiratorias inferiores', 'Demencia', 'Enfermedades digestivas', 'Nefropatía', 'Enfermedades respiratorias', 'Enfermedades del HIGADO', 'Homicidio', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [840, 677, 242, 183, 171, 94, 90, 63, 39, 32, 7],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Otras ENT', 'Diarrea y enfermedades infecciosas comunes.', 'Enfermedades digestivas', 'Trastornos neonatales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [14552, 14043, 11241, 6037, 5473, 5081, 4386, 3631, 2854, 2533, 94],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'De fumar', 'Contaminación del aire (exterior e interior)', 'Colesterol alto', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'Baja actividad física', 'El consumo de drogas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [12710, 11385, 9034, 4139, 3869, 2945, 1803, 1372, 1259, 883, 94] },
    		 {id: 13,
    		  name: "Bielorrusia",
    		  lifeExpectancy: 74.79,
    		  demographics: [1134208, 910479, 1147255, 1510155, 1278833, 1374474, 1190629, 533029, 373347],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades digestivas', 'Trastornos por consumo de alcohol.', 'Enfermedades del HIGADO', 'Suicidio', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [73014, 18558, 6550, 4498, 2803, 2533, 2357, 2065, 1175, 990, 208],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Lesiones no intencionales', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Enfermedades digestivas', 'Trastornos mentales y por abuso de sustancias.', 'Otras ENT', 'Diabetes, sangre y enfermedades endocrinas.', 'Autolesiones', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1238969, 440057, 285451, 218899, 197375, 168700, 162164, 123781, 114503, 89387, 2938],
    		  riskFactors: ['Hipertensión', 'De fumar', 'Colesterol alto', 'Obesidad', 'Nivel alto de azúcar en la sangre', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Dieta rica en sal', 'Baja actividad física', 'El consumo de drogas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [813813, 576719, 492857, 471979, 288461, 176297, 173117, 143406, 89321, 62880, 2938] },
    		 {id: 14,
    		  name: "Bélgica",
    		  lifeExpectancy: 81.63,
    		  demographics: [1305219, 1298970, 1395385, 1498535, 1524152, 1601891, 1347696, 908725, 658753],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'COVID-19 hasta el 27 de mayo de 2020', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'Enfermedades digestivas', 'Suicidio', 'Nefropatía', 'Enfermedades del HIGADO', 'Diabetes'],
    		  majorDeaths: [32194, 30782, 10550, 9334, 6804, 5669, 5111, 2132, 2097, 2004, 1436],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Lesiones no intencionales', 'Enfermedades respiratorias', 'Diabetes, sangre y enfermedades endocrinas.', 'Otras ENT', 'COVID-19 hasta el 27 de mayo de 2020', 'Enfermedades digestivas'],
    		  diseaseDALYs: [577400, 454391, 354782, 293127, 224452, 180671, 164776, 158502, 140478, 119438, 118342],
    		  riskFactors: ['De fumar', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Obesidad', 'COVID-19 hasta el 27 de mayo de 2020', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Baja actividad física', 'El consumo de drogas', 'Humo de segunda mano'],
    		  riskDALYs: [473420, 278047, 257958, 227091, 119438, 118510, 99170, 66362, 38847, 38280, 34819] },
    		 {id: 15,
    		  name: "Belice",
    		  lifeExpectancy: 74.62,
    		  demographics: [77702, 78150, 74346, 57769, 42878, 30626, 16843, 7912, 4124],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes', 'Infecciones respiratorias inferiores', 'Homicidio', 'Enfermedades digestivas', 'Nefropatía', 'VIH / SIDA', 'Lesiones viales', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [424, 277, 126, 111, 106, 92, 84, 81, 72, 69, 2],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Diabetes, sangre y enfermedades endocrinas.', 'Cánceres', 'Trastornos neonatales', 'Otras ENT', 'Violencia interpersonal', 'Trastornos mentales y por abuso de sustancias.', 'Lesiones no intencionales', 'Diarrea y enfermedades infecciosas comunes.', 'Desórdenes neurológicos', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [9830, 9614, 7583, 7367, 6049, 6027, 5975, 5561, 5539, 4996, 36],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'De fumar', 'Contaminación del aire (exterior e interior)', 'Colesterol alto', 'Deficiencia de hierro', 'Dieta baja en frutas', 'Emaciación infantil', 'El consumo de drogas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [9631, 9251, 5961, 3571, 3449, 2288, 1745, 1482, 1423, 1253, 36] },
    		 {id: 16,
    		  name: "Benín",
    		  lifeExpectancy: 61.77,
    		  demographics: [3529739, 2708314, 2001076, 1389287, 950137, 627369, 364348, 179593, 51287],
    		  majorCauses: ['Trastornos neonatales', 'Malaria', 'Enfermedades cardiovasculares', 'Infecciones respiratorias inferiores', 'Enfermedades diarreicas', 'Cánceres', 'Lesiones viales', 'Tuberculosis', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [9627, 9433, 9221, 7565, 6383, 5434, 3093, 2890, 2629, 1983, 3],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Malaria y enfermedades tropicales desatendidas', 'Otras ENT', 'Deficiencias nutricionales', 'Enfermedades cardiovasculares', 'Diabetes, sangre y enfermedades endocrinas.', 'VIH / SIDA y tuberculosis', 'Lesiones de transporte', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1295131, 899739, 783500, 359850, 253199, 238944, 238353, 218491, 192950, 180157, 62],
    		  riskFactors: ['Emaciación infantil', 'Fuente de agua insegura', 'Contaminación del aire (exterior e interior)', 'Saneamiento inseguro', 'Deficiencia de vitamina A', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Retraso del crecimiento infantil', 'Obesidad', 'Deficiencia de hierro', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [589619, 357407, 310177, 279407, 201743, 145002, 138640, 123773, 117511, 109285, 62] },
    		 {id: 17,
    		  name: "Bután",
    		  lifeExpectancy: 71.78,
    		  demographics: [126258, 137813, 154517, 134250, 86166, 57026, 35719, 21762, 9582],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Trastornos neonatales', 'Infecciones respiratorias inferiores', 'Enfermedades del HIGADO', 'Nefropatía', 'Enfermedades diarreicas', 'Demencia', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [1156, 488, 446, 255, 205, 180, 157, 136, 132, 125, 0],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Trastornos musculoesqueléticos', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos mentales y por abuso de sustancias.', 'Lesiones no intencionales', 'Cánceres', 'Otras ENT', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [26845, 24060, 23302, 15553, 14573, 14249, 13641, 13614, 13469, 12218, 0],
    		  riskFactors: ['Hipertensión', 'Nivel alto de azúcar en la sangre', 'Contaminación del aire (exterior e interior)', 'Obesidad', 'Colesterol alto', 'Deficiencia de hierro', 'De fumar', 'Dieta baja en frutas', 'Dieta rica en sal', 'Dieta baja en vegetales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [15575, 12298, 11644, 10068, 9089, 8988, 7745, 5274, 4216, 3631, 0] },
    		 {id: 18,
    		  name: "Bolivia",
    		  lifeExpectancy: 71.51,
    		  demographics: [2365890, 2289751, 2012188, 1605907, 1206917, 859703, 600549, 378817, 193379],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Infecciones respiratorias inferiores', 'Enfermedades digestivas', 'Nefropatía', 'Enfermedades respiratorias', 'Diabetes', 'Trastornos neonatales', 'Demencia', 'Enfermedades del HIGADO', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [15275, 12195, 5360, 4078, 3165, 3122, 2903, 2826, 2651, 2215, 274],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Enfermedades cardiovasculares', 'Cánceres', 'Trastornos neonatales', 'Diabetes, sangre y enfermedades endocrinas.', 'Otras ENT', 'Trastornos mentales y por abuso de sustancias.', 'Lesiones no intencionales', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [360435, 323003, 304397, 303329, 214670, 213058, 172883, 163508, 161009, 146546, 4392],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'Contaminación del aire (exterior e interior)', 'De fumar', 'Emaciación infantil', 'Colesterol alto', 'Deficiencia de hierro', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [255825, 202319, 174854, 127408, 100318, 89251, 76483, 70730, 54745, 46823, 4392] },
    		 {id: 19,
    		  name: "Bosnia-Herzegovina",
    		  lifeExpectancy: 77.4,
    		  demographics: [306587, 351419, 409569, 468369, 448869, 508292, 452975, 235035, 119881],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes', 'Demencia', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Nefropatía', 'Enfermedades del HIGADO', 'Infecciones respiratorias inferiores', 'Enfermedad de Parkinson', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [18107, 8950, 2293, 1991, 1310, 1136, 604, 577, 360, 324, 149],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos musculoesqueléticos', 'Lesiones no intencionales', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades respiratorias', 'Otras ENT', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [314480, 202956, 96087, 76811, 71590, 67986, 49804, 45325, 40933, 39556, 2127],
    		  riskFactors: ['De fumar', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Obesidad', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Dieta rica en sal', 'Humo de segunda mano', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [215413, 199141, 198050, 137744, 93564, 77913, 45939, 41923, 29708, 23846, 2127] },
    		 {id: 20,
    		  name: "Botsuana",
    		  lifeExpectancy: 69.59,
    		  demographics: [535771, 462584, 397946, 359631, 247537, 141947, 100575, 45935, 11776],
    		  majorCauses: ['VIH / SIDA', 'Enfermedades cardiovasculares', 'Cánceres', 'Infecciones respiratorias inferiores', 'Diabetes', 'Enfermedades diarreicas', 'Enfermedades respiratorias', 'Tuberculosis', 'Enfermedades digestivas', 'Trastornos neonatales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [4102, 2548, 1487, 768, 668, 577, 510, 444, 438, 436, 1],
    		  diseaseNames: ['VIH / SIDA y tuberculosis', 'Diarrea y enfermedades infecciosas comunes.', 'Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades cardiovasculares', 'Trastornos neonatales', 'Cánceres', 'Trastornos mentales y por abuso de sustancias.', 'Desórdenes neurológicos', 'Trastornos musculoesqueléticos', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [290480, 73500, 56387, 54317, 47687, 39229, 34628, 25707, 25706, 25228, 20],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'Contaminación del aire (exterior e interior)', 'De fumar', 'Fuente de agua insegura', 'Emaciación infantil', 'Saneamiento inseguro', 'El consumo de drogas', 'Colesterol alto', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [50246, 44707, 38344, 27484, 26951, 23734, 22767, 16393, 13684, 13563, 20] },
    		 {id: 21,
    		  name: "Brasil",
    		  lifeExpectancy: 75.88,
    		  demographics: [29188180, 31633075, 34181400, 34436184, 28902917, 24026608, 16292185, 8401090, 3987880],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Infecciones respiratorias inferiores', 'Demencia', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Homicidio', 'Diabetes', 'Lesiones viales', 'Enfermedades del HIGADO', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [388268, 244969, 84073, 73419, 72746, 72556, 63825, 56474, 46282, 36269, 24512],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Violencia interpersonal', 'Desórdenes neurológicos', 'Otras ENT', 'Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [8160380, 5945407, 4516692, 4060910, 3687892, 3645543, 3611498, 3460212, 2648390, 2616371, 395930],
    		  riskFactors: ['Hipertensión', 'Obesidad', 'De fumar', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta baja en vegetales', 'El consumo de drogas', 'Dieta rica en sal', 'Deficiencia de hierro', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [4906211, 4890017, 4562909, 3414338, 2207263, 1617178, 1049247, 1024329, 949371, 845115, 395930] },
    		 {id: 22,
    		  name: "Bulgaria",
    		  lifeExpectancy: 75.05,
    		  demographics: [662976, 671433, 724640, 971335, 1061668, 947156, 936053, 692820, 332035],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Enfermedades del HIGADO', 'Diabetes', 'Infecciones respiratorias inferiores', 'Nefropatía', 'Suicidio', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [65619, 18734, 5945, 3543, 3299, 2043, 1584, 1549, 1447, 995, 133],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Lesiones no intencionales', 'Desórdenes neurológicos', 'Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Trastornos mentales y por abuso de sustancias.', 'Otras ENT', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1099367, 435223, 175641, 170811, 161624, 144882, 116883, 107938, 107874, 89058, 1768],
    		  riskFactors: ['Hipertensión', 'De fumar', 'Obesidad', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'Dieta baja en frutas', 'Dieta rica en sal', 'Contaminación del aire (exterior e interior)', 'Baja actividad física', 'Humo de segunda mano', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [722666, 559068, 443763, 326529, 319257, 174256, 168051, 167959, 67965, 64921, 1768] },
    		 {id: 23,
    		  name: "Burundi",
    		  lifeExpectancy: 61.58,
    		  demographics: [3785408, 2623579, 2004917, 1466422, 701174, 487477, 322819, 105870, 32911],
    		  majorCauses: ['Tuberculosis', 'Enfermedades cardiovasculares', 'Malaria', 'Trastornos neonatales', 'Infecciones respiratorias inferiores', 'Enfermedades diarreicas', 'Cánceres', 'Enfermedades digestivas', 'VIH / SIDA', 'Deficiencias nutricionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [9099, 9011, 8659, 7482, 7407, 5397, 4711, 3412, 2620, 2603, 1],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Malaria y enfermedades tropicales desatendidas', 'Trastornos neonatales', 'VIH / SIDA y tuberculosis', 'Otras ENT', 'Deficiencias nutricionales', 'Enfermedades cardiovasculares', 'Cánceres', 'Lesiones no intencionales', 'Diabetes, sangre y enfermedades endocrinas.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1763666, 679542, 674414, 626305, 406552, 266914, 246428, 161672, 160437, 152196, 22],
    		  riskFactors: ['Emaciación infantil', 'Contaminación del aire (exterior e interior)', 'Fuente de agua insegura', 'Saneamiento inseguro', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Retraso del crecimiento infantil', 'Deficiencia de vitamina A', 'De fumar', 'Dieta baja en frutas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [610582, 323545, 313197, 240297, 154991, 152765, 145961, 133758, 91457, 55690, 22] },
    		 {id: 24,
    		  name: "Camboya",
    		  lifeExpectancy: 69.82,
    		  demographics: [3522160, 3065792, 3101389, 2840783, 1393829, 1350228, 783099, 334192, 95070],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'Enfermedades del HIGADO', 'Enfermedades respiratorias', 'Trastornos neonatales', 'Lesiones viales', 'Tuberculosis', 'Diabetes', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [24913, 12663, 11446, 9866, 9018, 4429, 4094, 3981, 2998, 2756, 0],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Enfermedades cardiovasculares', 'Trastornos neonatales', 'Enfermedades digestivas', 'Lesiones no intencionales', 'Cánceres', 'Otras ENT', 'Enfermedades del HIGADO', 'Trastornos musculoesqueléticos', 'Diabetes, sangre y enfermedades endocrinas.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [721621, 585245, 411142, 364324, 360494, 352544, 302834, 275523, 252164, 243279, 0],
    		  riskFactors: ['Contaminación del aire (exterior e interior)', 'Nivel alto de azúcar en la sangre', 'De fumar', 'Hipertensión', 'Emaciación infantil', 'Dieta baja en frutas', 'Obesidad', 'Colesterol alto', 'Deficiencia de hierro', 'Humo de segunda mano', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [397320, 362958, 344974, 277013, 190587, 155655, 138476, 122622, 112834, 98497, 0] },
    		 {id: 25,
    		  name: "Camerún",
    		  lifeExpectancy: 59.29,
    		  demographics: [7725327, 6005828, 4449460, 3290814, 2054202, 1239232, 710194, 323649, 77681],
    		  majorCauses: ['VIH / SIDA', 'Enfermedades cardiovasculares', 'Malaria', 'Infecciones respiratorias inferiores', 'Cánceres', 'Trastornos neonatales', 'Enfermedades diarreicas', 'Tuberculosis', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [22803, 22663, 22041, 16148, 14658, 13311, 12644, 8077, 7474, 5096, 175],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Malaria y enfermedades tropicales desatendidas', 'VIH / SIDA y tuberculosis', 'Trastornos neonatales', 'Otras ENT', 'Enfermedades cardiovasculares', 'Diabetes, sangre y enfermedades endocrinas.', 'Cánceres', 'Deficiencias nutricionales', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [2368903, 1813493, 1710349, 1262545, 629329, 618008, 525557, 445027, 407151, 397774, 3900],
    		  riskFactors: ['Emaciación infantil', 'Fuente de agua insegura', 'Contaminación del aire (exterior e interior)', 'Saneamiento inseguro', 'Hipertensión', 'Deficiencia de vitamina A', 'Obesidad', 'Nivel alto de azúcar en la sangre', 'Deficiencia de hierro', 'Lactancia no exclusiva', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [951069, 787773, 595132, 577616, 384797, 349035, 336907, 335000, 196545, 181684, 3900] },
    		 {id: 26,
    		  name: "Canadá",
    		  lifeExpectancy: 82.43,
    		  demographics: [3960088, 3974074, 5110382, 5204909, 4797691, 5260069, 4598419, 2876627, 1628778],
    		  majorCauses: ['Cánceres', 'Enfermedades cardiovasculares', 'Demencia', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'Diabetes', 'COVID-19 hasta el 27 de mayo de 2020', 'Nefropatía', 'Enfermedades del HIGADO', 'Suicidio'],
    		  majorDeaths: [86229, 80838, 25219, 16133, 11283, 9048, 6959, 6639, 6087, 4845, 4616],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones no intencionales', 'Enfermedades respiratorias', 'Otras ENT', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1683333, 1259054, 1089020, 735538, 692030, 563635, 421128, 407422, 385240, 280539, 90250],
    		  riskFactors: ['De fumar', 'Obesidad', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'El consumo de drogas', 'Colesterol alto', 'Dieta rica en sal', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [1164013, 882678, 772461, 676655, 327167, 324651, 177023, 159411, 127590, 99110, 90250] },
    		 {id: 27,
    		  name: "República Centroafricana",
    		  lifeExpectancy: 53.28,
    		  demographics: [1426413, 1237990, 809868, 493393, 336400, 228493, 135393, 60949, 16279],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Tuberculosis', 'Enfermedades diarreicas', 'VIH / SIDA', 'Infecciones respiratorias inferiores', 'Trastornos neonatales', 'Malaria', 'Lesiones viales', 'Cánceres', 'Conflicto', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [7278, 6728, 5983, 5319, 5021, 4770, 3849, 3495, 2695, 1879, 1],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'VIH / SIDA y tuberculosis', 'Trastornos neonatales', 'Malaria y enfermedades tropicales desatendidas', 'Otras ENT', 'Lesiones de transporte', 'Enfermedades cardiovasculares', 'Otras enfermedades transmisibles', 'Deficiencias nutricionales', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1079157, 873581, 436725, 335234, 229369, 223308, 209221, 166194, 163616, 111740, 21],
    		  riskFactors: ['Emaciación infantil', 'Fuente de agua insegura', 'Saneamiento inseguro', 'Contaminación del aire (exterior e interior)', 'Deficiencia de vitamina A', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Retraso del crecimiento infantil', 'Lactancia no exclusiva', 'De fumar', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [535834, 377491, 290329, 249265, 190556, 155425, 134033, 121888, 93807, 87791, 21] },
    		 {id: 28,
    		  name: "Chad",
    		  lifeExpectancy: 54.24,
    		  demographics: [5340972, 3921214, 2679775, 1701718, 1040270, 634886, 404731, 174402, 48914],
    		  majorCauses: ['Enfermedades diarreicas', 'Infecciones respiratorias inferiores', 'Trastornos neonatales', 'Enfermedades cardiovasculares', 'Malaria', 'Tuberculosis', 'Cánceres', 'VIH / SIDA', 'Deficiencias nutricionales', 'Meningitis', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [24903, 19421, 17167, 13094, 7679, 6649, 6620, 4926, 4336, 4232, 62],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'VIH / SIDA y tuberculosis', 'Malaria y enfermedades tropicales desatendidas', 'Deficiencias nutricionales', 'Otras ENT', 'Otras enfermedades transmisibles', 'Enfermedades cardiovasculares', 'Lesiones no intencionales', 'Diabetes, sangre y enfermedades endocrinas.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [3324967, 1521033, 739523, 714037, 630767, 494126, 389858, 358655, 346981, 278749, 1378],
    		  riskFactors: ['Emaciación infantil', 'Fuente de agua insegura', 'Saneamiento inseguro', 'Contaminación del aire (exterior e interior)', 'Deficiencia de vitamina A', 'Retraso del crecimiento infantil', 'Lactancia no exclusiva', 'Deficiencia de hierro', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [2694326, 1652727, 1287466, 880045, 768811, 604902, 418815, 253170, 187689, 160699, 1378] },
    		 {id: 29,
    		  name: "Chile",
    		  lifeExpectancy: 80.18,
    		  demographics: [2450918, 2505672, 3020205, 2878807, 2556775, 2328585, 1737346, 950339, 523388],
    		  majorCauses: ['Cánceres', 'Enfermedades cardiovasculares', 'Demencia', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Enfermedades del HIGADO', 'Infecciones respiratorias inferiores', 'Nefropatía', 'Diabetes', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [30116, 29906, 8340, 7955, 6141, 4980, 4588, 4225, 3331, 2281, 806],
    		  diseaseNames: ['Cánceres', 'Trastornos musculoesqueléticos', 'Enfermedades cardiovasculares', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Desórdenes neurológicos', 'Otras ENT', 'Enfermedades digestivas', 'Lesiones no intencionales', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [614838, 545626, 526835, 355493, 276342, 266925, 226976, 218323, 201592, 155243, 12027],
    		  riskFactors: ['Obesidad', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'De fumar', 'Contaminación del aire (exterior e interior)', 'Colesterol alto', 'Dieta rica en sal', 'Dieta baja en frutas', 'El consumo de drogas', 'Humo de segunda mano', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [400583, 369036, 365753, 335786, 129290, 123346, 98530, 87272, 86161, 46336, 12027] },
    		 {id: 30,
    		  name: "China",
    		  lifeExpectancy: 76.91,
    		  demographics: [171585833, 166513709, 192891037, 223506345, 223201182, 214623812, 148420591, 66894771, 26146412],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades respiratorias', 'Demencia', 'Enfermedades digestivas', 'Lesiones viales', 'Infecciones respiratorias inferiores', 'Nefropatía', 'Enfermedades del HIGADO', 'Diabetes', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [4377972, 2606907, 1009685, 490210, 283662, 261802, 179390, 175891, 153769, 153185, 4638],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Enfermedades respiratorias', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Desórdenes neurológicos', 'Lesiones no intencionales', 'Lesiones de transporte', 'Otras ENT', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [85319394, 63203596, 25138911, 23223150, 22139741, 20302946, 16758994, 16453012, 14994208, 14865833, 75805],
    		  riskFactors: ['De fumar', 'Hipertensión', 'Dieta rica en sal', 'Contaminación del aire (exterior e interior)', 'Obesidad', 'Nivel alto de azúcar en la sangre', 'Dieta baja en frutas', 'Colesterol alto', 'Humo de segunda mano', 'El consumo de drogas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [51286559, 50724732, 38074126, 28361531, 25733491, 25669596, 18622122, 16998810, 9416153, 8365260, 75805] },
    		 {id: 31,
    		  name: "Colombia",
    		  lifeExpectancy: 77.29,
    		  demographics: [7448799, 8231614, 8779218, 7667022, 6339173, 5445614, 3633308, 1882391, 912304],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades respiratorias', 'Homicidio', 'Demencia', 'Enfermedades digestivas', 'Nefropatía', 'Infecciones respiratorias inferiores', 'Lesiones viales', 'Diabetes', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [68023, 46576, 15303, 15053, 15050, 10847, 8502, 7851, 7437, 6155, 776],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Violencia interpersonal', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos neonatales', 'Diabetes, sangre y enfermedades endocrinas.', 'Otras ENT', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1258942, 1121602, 851013, 792895, 731688, 684779, 672924, 646324, 636887, 414242, 12593],
    		  riskFactors: ['Hipertensión', 'Obesidad', 'Nivel alto de azúcar en la sangre', 'De fumar', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'El consumo de drogas', 'Dieta baja en vegetales', 'Emaciación infantil', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [824543, 729807, 553419, 521123, 301768, 295755, 201572, 177867, 169492, 113277, 12593] },
    		 {id: 32,
    		  name: "Comoras",
    		  lifeExpectancy: 64.32,
    		  demographics: [234784, 187246, 148281, 114000, 74321, 49408, 28300, 11291, 3260],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Infecciones respiratorias inferiores', 'Tuberculosis', 'Trastornos neonatales', 'Enfermedades diarreicas', 'Enfermedades digestivas', 'Diabetes', 'Enfermedades respiratorias', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [982, 565, 384, 305, 286, 272, 235, 151, 144, 113, 1],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Enfermedades cardiovasculares', 'Cánceres', 'Otras ENT', 'VIH / SIDA y tuberculosis', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos mentales y por abuso de sustancias.', 'Otras enfermedades transmisibles', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [58275, 29193, 22929, 16910, 15236, 11967, 10010, 9808, 9388, 8770, 21],
    		  riskFactors: ['Hipertensión', 'Nivel alto de azúcar en la sangre', 'Contaminación del aire (exterior e interior)', 'Emaciación infantil', 'Fuente de agua insegura', 'Saneamiento inseguro', 'Obesidad', 'De fumar', 'Dieta baja en frutas', 'Deficiencia de vitamina A', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [15143, 14657, 13840, 13011, 10983, 8619, 7850, 5708, 5074, 4641, 21] },
    		 {id: 33,
    		  name: "República del Congo",
    		  lifeExpectancy: 64.57,
    		  demographics: [1570520, 1217193, 848863, 672432, 520344, 312337, 156783, 66533, 15498],
    		  majorCauses: ['Enfermedades cardiovasculares', 'VIH / SIDA', 'Cánceres', 'Infecciones respiratorias inferiores', 'Tuberculosis', 'Malaria', 'Enfermedades diarreicas', 'Trastornos neonatales', 'Enfermedades digestivas', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [6527, 5571, 3275, 2308, 2279, 2244, 2107, 1717, 1615, 1229, 19],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'VIH / SIDA y tuberculosis', 'Trastornos neonatales', 'Malaria y enfermedades tropicales desatendidas', 'Enfermedades cardiovasculares', 'Otras ENT', 'Cánceres', 'Lesiones de transporte', 'Deficiencias nutricionales', 'Trastornos mentales y por abuso de sustancias.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [325799, 322346, 171187, 167855, 162431, 107522, 100822, 78622, 73269, 70131, 426],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Hipertensión', 'Emaciación infantil', 'Fuente de agua insegura', 'Contaminación del aire (exterior e interior)', 'Obesidad', 'Saneamiento inseguro', 'Deficiencia de vitamina A', 'De fumar', 'Deficiencia de hierro', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [124326, 112354, 106554, 95933, 90427, 86646, 71649, 50058, 49945, 41776, 426] },
    		 {id: 34,
    		  name: "Costa Rica",
    		  lifeExpectancy: 80.28,
    		  demographics: [708607, 724264, 833947, 812730, 638064, 598490, 403726, 219837, 107896],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades digestivas', 'Demencia', 'Enfermedades respiratorias', 'Nefropatía', 'Enfermedades del HIGADO', 'Lesiones viales', 'Infecciones respiratorias inferiores', 'Homicidio', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [6852, 5717, 1546, 1458, 1331, 1265, 840, 782, 521, 484, 10],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Desórdenes neurológicos', 'Otras ENT', 'Enfermedades digestivas', 'Trastornos neonatales', 'Lesiones de transporte', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [129752, 127974, 71800, 69245, 69175, 68520, 55612, 45180, 44686, 40129, 156],
    		  riskFactors: ['Hipertensión', 'Obesidad', 'Nivel alto de azúcar en la sangre', 'De fumar', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'El consumo de drogas', 'Dieta baja en vegetales', 'Dieta rica en sal', 'Dieta baja en frutas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [91847, 83330, 60423, 52627, 34589, 25963, 19624, 16119, 16042, 11088, 156] },
    		 {id: 35,
    		  name: "Croacia",
    		  lifeExpectancy: 78.49,
    		  demographics: [392834, 410760, 480216, 550013, 555343, 588949, 560899, 355380, 235905],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Enfermedades del HIGADO', 'Diabetes', 'Nefropatía', 'Suicidio', 'Infecciones respiratorias inferiores', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [23426, 13549, 3369, 2105, 1890, 1095, 999, 829, 708, 562, 101],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Lesiones no intencionales', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Otras ENT', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [350896, 277822, 115566, 95306, 90347, 71504, 67555, 59045, 57095, 50719, 1305],
    		  riskFactors: ['De fumar', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'Humo de segunda mano', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [236270, 221560, 184287, 175349, 111451, 66726, 54483, 41805, 33657, 32700, 1305] },
    		 {id: 36,
    		  name: "Cuba",
    		  lifeExpectancy: 78.8,
    		  demographics: [1211133, 1264436, 1453162, 1486561, 1647810, 1926480, 1141744, 785066, 417092],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Infecciones respiratorias inferiores', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Nefropatía', 'Enfermedades del HIGADO', 'Suicidio', 'Diabetes', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [37598, 26203, 6988, 5678, 4406, 3969, 2340, 1869, 1791, 1769, 82],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos mentales y por abuso de sustancias.', 'Desórdenes neurológicos', 'Trastornos musculoesqueléticos', 'Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Lesiones no intencionales', 'Otras ENT', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [642754, 559920, 213593, 206468, 200596, 196844, 135526, 125201, 124433, 120958, 1157],
    		  riskFactors: ['De fumar', 'Hipertensión', 'Obesidad', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Baja actividad física', 'Humo de segunda mano', 'Dieta baja en frutas', 'El consumo de drogas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [438389, 343228, 312365, 276017, 153908, 137799, 59008, 43727, 40328, 38862, 1157] },
    		 {id: 37,
    		  name: "Chipre",
    		  lifeExpectancy: 80.98,
    		  demographics: [132700, 142584, 194044, 188609, 163509, 145402, 117232, 75969, 38524],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades respiratorias', 'Diabetes', 'Enfermedades digestivas', 'Nefropatía', 'Infecciones respiratorias inferiores', 'Lesiones viales', 'Enfermedades del HIGADO', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [2705, 2058, 483, 474, 401, 288, 256, 177, 152, 123, 17],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Desórdenes neurológicos', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones no intencionales', 'Enfermedades respiratorias', 'Otras ENT', 'Lesiones de transporte', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [44787, 43465, 37224, 23489, 22987, 18671, 14397, 12683, 12131, 9314, 244],
    		  riskFactors: ['De fumar', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Obesidad', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Dieta rica en sal', 'Dieta baja en vegetales', 'Humo de segunda mano', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [39657, 31547, 27432, 24115, 10889, 10563, 6165, 4247, 4166, 3965, 244] },
    		 {id: 38,
    		  name: "República Checa",
    		  lifeExpectancy: 79.38,
    		  demographics: [1119008, 1033915, 1145980, 1510360, 1774233, 1333127, 1344888, 987327, 440375],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'Diabetes', 'Enfermedades del HIGADO', 'Suicidio', 'Nefropatía', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [48960, 28927, 7581, 4520, 3864, 3222, 2958, 2175, 1517, 1257, 317],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Lesiones no intencionales', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Otras ENT', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [767029, 588271, 299173, 266439, 218376, 192175, 161210, 142372, 138323, 117131, 4313],
    		  riskFactors: ['De fumar', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [534077, 464396, 417162, 396780, 244021, 141737, 120526, 108619, 81237, 58791, 4313] },
    		 {id: 39,
    		  name: "República Democrática del Congo",
    		  lifeExpectancy: 60.68,
    		  demographics: [28801093, 20234100, 13690339, 9435368, 6384869, 4195557, 2494965, 1224414, 329862],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Malaria', 'Infecciones respiratorias inferiores', 'Trastornos neonatales', 'Tuberculosis', 'Enfermedades diarreicas', 'Cánceres', 'Enfermedades digestivas', 'Lesiones viales', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [83261, 81226, 58587, 53950, 53304, 36660, 33983, 24612, 20502, 16529, 67],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Malaria y enfermedades tropicales desatendidas', 'Trastornos neonatales', 'VIH / SIDA y tuberculosis', 'Otras ENT', 'Enfermedades cardiovasculares', 'Deficiencias nutricionales', 'Lesiones no intencionales', 'Lesiones de transporte', 'Otras enfermedades transmisibles', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [7863311, 7196932, 5077139, 4008675, 3345697, 2134794, 1817886, 1436816, 1426298, 1298704, 1403],
    		  riskFactors: ['Emaciación infantil', 'Contaminación del aire (exterior e interior)', 'Fuente de agua insegura', 'Saneamiento inseguro', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Deficiencia de vitamina A', 'Retraso del crecimiento infantil', 'Obesidad', 'Deficiencia de hierro', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [4257878, 2771806, 2150401, 1590217, 1570390, 1320957, 1304840, 963409, 585796, 579539, 1403] },
    		 {id: 40,
    		  name: "Dinamarca",
    		  lifeExpectancy: 80.9,
    		  demographics: [607866, 679998, 774991, 662575, 752091, 803945, 657184, 566946, 266281],
    		  majorCauses: ['Cánceres', 'Enfermedades cardiovasculares', 'Demencia', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'Diabetes', 'Nefropatía', 'Enfermedades del HIGADO', 'Trastornos por consumo de alcohol.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [17404, 14525, 4477, 4319, 2530, 2377, 1294, 968, 947, 807, 563],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades respiratorias', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones no intencionales', 'Otras ENT', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [327456, 205301, 194924, 120546, 105512, 93110, 85962, 68094, 66681, 58050, 7430],
    		  riskFactors: ['De fumar', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Obesidad', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'El consumo de drogas', 'Dieta baja en frutas', 'Baja actividad física', 'Dieta rica en sal', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [245839, 174984, 123682, 118127, 54793, 47590, 26013, 20933, 17766, 15494, 7430] },
    		 {id: 41,
    		  name: "Ecuador",
    		  lifeExpectancy: 77.01,
    		  demographics: [3260635, 3116390, 2997435, 2540942, 2046448, 1546300, 1047152, 545637, 272718],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades digestivas', 'Nefropatía', 'Infecciones respiratorias inferiores', 'Demencia', 'Lesiones viales', 'Diabetes', 'Enfermedades del HIGADO', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [19679, 16097, 6155, 5739, 5149, 4971, 4465, 4389, 3457, 3387, 3203],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos mentales y por abuso de sustancias.', 'Desórdenes neurológicos', 'Trastornos neonatales', 'Lesiones no intencionales', 'Lesiones de transporte', 'Trastornos musculoesqueléticos', 'Otras ENT', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [396000, 384366, 300660, 261958, 248588, 242400, 240306, 240294, 239834, 234280, 53061],
    		  riskFactors: ['Obesidad', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'De fumar', 'Contaminación del aire (exterior e interior)', 'Colesterol alto', 'Emaciación infantil', 'El consumo de drogas', 'COVID-19 hasta el 27 de mayo de 2020', 'Dieta rica en sal', 'Dieta baja en vegetales'],
    		  riskDALYs: [348663, 321389, 246503, 119257, 105392, 85569, 58040, 54693, 53061, 53036, 52491] },
    		 {id: 42,
    		  name: "Egipto",
    		  lifeExpectancy: 71.99,
    		  demographics: [24622198, 17968738, 16473942, 14922068, 10574668, 7677870, 4957959, 2412411, 778221],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Enfermedades digestivas', 'Cánceres', 'Enfermedades del HIGADO', 'Lesiones viales', 'Infecciones respiratorias inferiores', 'Enfermedades respiratorias', 'Diabetes', 'Nefropatía', 'Demencia', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [232675, 50101, 48024, 44692, 26946, 23097, 19990, 13836, 13115, 9852, 797],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Diarrea y enfermedades infecciosas comunes.', 'Diabetes, sangre y enfermedades endocrinas.', 'Otras ENT', 'Trastornos musculoesqueléticos', 'Lesiones de transporte', 'Enfermedades digestivas', 'Cánceres', 'Trastornos mentales y por abuso de sustancias.', 'Desórdenes neurológicos', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [5910574, 2376177, 2004534, 1779497, 1734654, 1639386, 1638469, 1585928, 1499388, 1236761, 14855],
    		  riskFactors: ['Hipertensión', 'Obesidad', 'Nivel alto de azúcar en la sangre', 'Contaminación del aire (exterior e interior)', 'De fumar', 'Colesterol alto', 'Emaciación infantil', 'Humo de segunda mano', 'Dieta baja en frutas', 'El consumo de drogas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [3669121, 3557105, 3101643, 2195056, 2164638, 1845428, 916224, 664061, 658551, 595808, 14855] },
    		 {id: 43,
    		  name: "Eritrea",
    		  lifeExpectancy: 66.32,
    		  demographics: [978748, 830029, 574495, 446287, 274976, 167460, 127422, 75264, 22435],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Tuberculosis', 'Cánceres', 'Infecciones respiratorias inferiores', 'Enfermedades diarreicas', 'Trastornos neonatales', 'Enfermedades digestivas', 'VIH / SIDA', 'Lesiones viales', 'Deficiencias nutricionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [5211, 5072, 3968, 3737, 3723, 3013, 2104, 1521, 1287, 1147, 0],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'VIH / SIDA y tuberculosis', 'Enfermedades cardiovasculares', 'Otras ENT', 'Deficiencias nutricionales', 'Cánceres', 'Lesiones no intencionales', 'Enfermedades digestivas', 'Lesiones de transporte', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [480274, 297214, 197674, 154881, 152787, 147554, 146554, 98581, 91972, 79943, 0],
    		  riskFactors: ['Emaciación infantil', 'Fuente de agua insegura', 'Contaminación del aire (exterior e interior)', 'Saneamiento inseguro', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Deficiencia de vitamina A', 'Deficiencia de hierro', 'Retraso del crecimiento infantil', 'De fumar', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [297140, 197758, 159271, 153111, 101300, 84060, 67867, 63384, 53520, 53356, 0] },
    		 {id: 44,
    		  name: "Estonia",
    		  lifeExpectancy: 78.74,
    		  demographics: [144409, 134136, 152005, 191747, 183573, 168320, 165824, 108288, 77347],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Enfermedades del HIGADO', 'Nefropatía', 'Suicidio', 'Infecciones respiratorias inferiores', 'Trastornos por consumo de alcohol.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [7744, 3461, 1118, 602, 293, 292, 268, 220, 217, 217, 65],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Lesiones no intencionales', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades digestivas', 'Otras ENT', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [113906, 70732, 31560, 31446, 30926, 22291, 22035, 20576, 14972, 11179, 829],
    		  riskFactors: ['Hipertensión', 'Obesidad', 'De fumar', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'Dieta rica en sal', 'Dieta baja en frutas', 'El consumo de drogas', 'Contaminación del aire (exterior e interior)', 'Dieta baja en vegetales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [80846, 58304, 56332, 48633, 37388, 15952, 12597, 12529, 9917, 7623, 829] },
    		 {id: 45,
    		  name: "Etiopía",
    		  lifeExpectancy: 66.6,
    		  demographics: [31533142, 26475407, 20669323, 13261792, 8719197, 5482039, 3520095, 1857863, 559868],
    		  majorCauses: ['Trastornos neonatales', 'Enfermedades cardiovasculares', 'Enfermedades diarreicas', 'Infecciones respiratorias inferiores', 'Cánceres', 'Tuberculosis', 'Enfermedades digestivas', 'VIH / SIDA', 'Enfermedades del HIGADO', 'Deficiencias nutricionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [68899, 58719, 58105, 47564, 42795, 35598, 27760, 17181, 16069, 12681, 6],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'VIH / SIDA y tuberculosis', 'Otras ENT', 'Deficiencias nutricionales', 'Enfermedades cardiovasculares', 'Cánceres', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos mentales y por abuso de sustancias.', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [8628459, 6657770, 2988580, 1923960, 1872827, 1526604, 1414986, 1356684, 1343853, 1309199, 121],
    		  riskFactors: ['Emaciación infantil', 'Fuente de agua insegura', 'Saneamiento inseguro', 'Deficiencia de vitamina A', 'Contaminación del aire (exterior e interior)', 'Retraso del crecimiento infantil', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Deficiencia de hierro', 'Lactancia no exclusiva', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [4547197, 3145313, 2543816, 2068085, 2019593, 1169571, 907469, 798529, 547656, 524032, 121] },
    		 {id: 46,
    		  name: "Fiyi",
    		  lifeExpectancy: 67.44,
    		  demographics: [178430, 156385, 142025, 134490, 104486, 91193, 54810, 22779, 5357],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Diabetes', 'Cánceres', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'Nefropatía', 'Trastornos neonatales', 'Enfermedades digestivas', 'Demencia', 'Enfermedades diarreicas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [2553, 1578, 739, 378, 312, 278, 175, 169, 133, 86, 0],
    		  diseaseNames: ['Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades cardiovasculares', 'Diarrea y enfermedades infecciosas comunes.', 'Cánceres', 'Trastornos neonatales', 'Otras ENT', 'Enfermedades respiratorias', 'Lesiones no intencionales', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [81934, 69931, 22502, 22019, 17626, 16262, 16096, 15187, 14204, 12061, 0],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'De fumar', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'Humo de segunda mano', 'Dieta rica en sal', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [80830, 74137, 44313, 28763, 25566, 22452, 17909, 10712, 10082, 9252, 0] },
    		 {id: 47,
    		  name: "Finlandia",
    		  lifeExpectancy: 81.91,
    		  demographics: [578800, 602758, 678649, 705213, 655323, 728975, 720693, 556209, 305539],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Enfermedades del HIGADO', 'Suicidio', 'Infecciones respiratorias inferiores', 'Enfermedad de Parkinson', 'Trastornos por consumo de alcohol.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [21359, 13089, 8546, 2416, 1784, 1178, 868, 713, 682, 598, 312],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Lesiones no intencionales', 'Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Otras ENT', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [297803, 244327, 168915, 159341, 109069, 95183, 67129, 65492, 57755, 56824, 3999],
    		  riskFactors: ['Hipertensión', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'De fumar', 'Colesterol alto', 'Dieta baja en frutas', 'El consumo de drogas', 'Dieta baja en vegetales', 'Dieta rica en sal', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [177418, 161016, 139500, 134558, 81929, 35314, 31633, 27778, 27062, 25187, 3999] },
    		 {id: 48,
    		  name: "Francia",
    		  lifeExpectancy: 82.66,
    		  demographics: [7606630, 7857054, 7415448, 8007883, 8408482, 8600917, 7758713, 5456311, 4018291],
    		  majorCauses: ['Cánceres', 'Enfermedades cardiovasculares', 'Demencia', 'COVID-19 hasta el 27 de mayo de 2020', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'Suicidio', 'Enfermedades del HIGADO', 'Diabetes', 'Nefropatía'],
    		  majorDeaths: [182241, 155683, 70567, 28530, 27350, 20917, 20732, 11067, 10621, 10579, 9279],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Lesiones no intencionales', 'Diabetes, sangre y enfermedades endocrinas.', 'Otras ENT', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [3380270, 2121253, 1815206, 1555743, 1407146, 999326, 828873, 686563, 601963, 532875, 357532],
    		  riskFactors: ['De fumar', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Colesterol alto', 'COVID-19 hasta el 27 de mayo de 2020', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'El consumo de drogas', 'Dieta rica en sal', 'Baja actividad física'],
    		  riskDALYs: [1910863, 1144792, 1069097, 1035904, 529536, 357532, 346605, 266385, 261196, 186249, 167243] },
    		 {id: 49,
    		  name: "Gabón",
    		  lifeExpectancy: 66.47,
    		  demographics: [586583, 410229, 369653, 340542, 222608, 126869, 68865, 35920, 11309],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Infecciones respiratorias inferiores', 'Malaria', 'VIH / SIDA', 'Trastornos neonatales', 'Enfermedades digestivas', 'Tuberculosis', 'Diabetes', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [2230, 1240, 756, 705, 644, 630, 601, 569, 447, 435, 14],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'VIH / SIDA y tuberculosis', 'Trastornos neonatales', 'Malaria y enfermedades tropicales desatendidas', 'Enfermedades cardiovasculares', 'Otras ENT', 'Cánceres', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones de transporte', 'Trastornos mentales y por abuso de sustancias.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [81025, 76009, 63650, 53830, 50948, 36479, 34988, 30639, 28574, 25521, 287],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Hipertensión', 'Obesidad', 'Contaminación del aire (exterior e interior)', 'De fumar', 'Deficiencia de hierro', 'Emaciación infantil', 'Fuente de agua insegura', 'Saneamiento inseguro', 'Colesterol alto', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [45650, 35609, 33446, 22861, 20977, 16066, 13877, 13686, 9638, 9322, 287] },
    		 {id: 50,
    		  name: "Gambia",
    		  lifeExpectancy: 62.05,
    		  demographics: [744980, 541297, 417652, 271437, 168487, 111373, 57178, 29296, 5996],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Infecciones respiratorias inferiores', 'Trastornos neonatales', 'Cánceres', 'VIH / SIDA', 'Enfermedades diarreicas', 'Tuberculosis', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Trastornos maternos', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [2686, 1235, 1216, 1090, 883, 616, 604, 564, 402, 312, 1],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Otras ENT', 'Enfermedades cardiovasculares', 'VIH / SIDA y tuberculosis', 'Deficiencias nutricionales', 'Cánceres', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones no intencionales', 'Trastornos mentales y por abuso de sustancias.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [158130, 117340, 74485, 64688, 63678, 49673, 33379, 28846, 28696, 27958, 22],
    		  riskFactors: ['Emaciación infantil', 'Contaminación del aire (exterior e interior)', 'Hipertensión', 'Fuente de agua insegura', 'Deficiencia de hierro', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Saneamiento inseguro', 'Deficiencia de vitamina A', 'De fumar', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [55905, 47203, 43352, 33016, 32534, 30844, 25630, 24125, 21488, 21141, 22] },
    		 {id: 51,
    		  name: "Georgia",
    		  lifeExpectancy: 73.77,
    		  demographics: [555503, 462513, 517237, 565027, 516086, 532797, 450191, 245487, 151920],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Enfermedades del HIGADO', 'Diabetes', 'Nefropatía', 'Infecciones respiratorias inferiores', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [29989, 7926, 2291, 1938, 1776, 1381, 1210, 785, 767, 724, 12],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes, sangre y enfermedades endocrinas.', 'Desórdenes neurológicos', 'Lesiones no intencionales', 'Trastornos musculoesqueléticos', 'Enfermedades digestivas', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades respiratorias', 'Otras ENT', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [492777, 199176, 77350, 71942, 71878, 66363, 61436, 52174, 50743, 49258, 167],
    		  riskFactors: ['Hipertensión', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'De fumar', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Dieta rica en sal', 'Dieta baja en vegetales', 'Humo de segunda mano', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [330197, 249730, 207106, 181728, 112711, 96544, 85246, 73731, 53296, 37918, 167] },
    		 {id: 52,
    		  name: "Alemania",
    		  lifeExpectancy: 81.33,
    		  demographics: [7726915, 7948424, 9421661, 10770439, 10400203, 13574883, 10347526, 7589596, 5737398],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Nefropatía', 'Infecciones respiratorias inferiores', 'Enfermedades del HIGADO', 'Diabetes', 'Enfermedad de Parkinson', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [356362, 252763, 83782, 46375, 44735, 26754, 25237, 19558, 19133, 12716, 8349],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades respiratorias', 'Lesiones no intencionales', 'Enfermedades digestivas', 'Otras ENT', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [4855900, 4820928, 2911225, 2149784, 1683775, 1498390, 1240818, 1133138, 1077631, 979500, 103590],
    		  riskFactors: ['De fumar', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Dieta rica en sal', 'Dieta baja en vegetales', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [3414722, 2775807, 2418682, 2199578, 1294183, 787908, 609964, 445019, 404628, 379320, 103590] },
    		 {id: 53,
    		  name: "Ghana",
    		  lifeExpectancy: 64.07,
    		  demographics: [7954883, 6496468, 5300953, 4080533, 2958700, 2058206, 1030760, 439902, 97453],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Malaria', 'Infecciones respiratorias inferiores', 'Cánceres', 'Trastornos neonatales', 'VIH / SIDA', 'Tuberculosis', 'Enfermedades digestivas', 'Enfermedades diarreicas', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [36615, 18757, 17761, 17559, 16951, 13878, 9142, 8541, 7309, 5381, 34],
    		  diseaseNames: ['Trastornos neonatales', 'Diarrea y enfermedades infecciosas comunes.', 'Malaria y enfermedades tropicales desatendidas', 'VIH / SIDA y tuberculosis', 'Enfermedades cardiovasculares', 'Otras ENT', 'Diabetes, sangre y enfermedades endocrinas.', 'Deficiencias nutricionales', 'Cánceres', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1654622, 1394112, 1250172, 952830, 938267, 741457, 564721, 546793, 529975, 408703, 745],
    		  riskFactors: ['Hipertensión', 'Emaciación infantil', 'Contaminación del aire (exterior e interior)', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Fuente de agua insegura', 'Deficiencia de hierro', 'Saneamiento inseguro', 'Deficiencia de vitamina A', 'De fumar', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [588032, 571389, 561136, 521296, 439123, 427879, 305486, 303853, 231330, 180575, 745] },
    		 {id: 54,
    		  name: "Grecia",
    		  lifeExpectancy: 82.24,
    		  demographics: [910515, 1071214, 1068916, 1384511, 1584912, 1489576, 1243217, 940663, 779928],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'Nefropatía', 'Enfermedades digestivas', 'Enfermedad de Parkinson', 'Enfermedades del HIGADO', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [50895, 31245, 11489, 6069, 4269, 3582, 3579, 1460, 1308, 1221, 173],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades respiratorias', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones no intencionales', 'Otras ENT', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [687099, 569885, 326957, 284049, 219619, 153164, 151809, 133281, 120023, 89730, 2100],
    		  riskFactors: ['De fumar', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Humo de segunda mano', 'Dieta baja en frutas', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [560222, 357593, 314662, 288302, 216660, 129722, 59070, 56707, 53709, 52342, 2100] },
    		 {id: 55,
    		  name: "Granada",
    		  lifeExpectancy: 72.4,
    		  demographics: [18172, 16008, 18677, 17858, 12661, 12282, 9161, 4727, 2456],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes', 'Infecciones respiratorias inferiores', 'Demencia', 'Nefropatía', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Enfermedades del HIGADO', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [411, 228, 95, 83, 51, 51, 41, 30, 19, 12, 0],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Diarrea y enfermedades infecciosas comunes.', 'Trastornos mentales y por abuso de sustancias.', 'Otras ENT', 'Lesiones no intencionales', 'Trastornos neonatales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [7147, 4824, 3842, 1912, 1911, 1843, 1805, 1620, 1510, 1282, 0],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Hipertensión', 'Obesidad', 'De fumar', 'Contaminación del aire (exterior e interior)', 'Colesterol alto', 'Dieta baja en vegetales', 'Dieta baja en frutas', 'Baja actividad física', 'El consumo de drogas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [5685, 4337, 3932, 2146, 1782, 1177, 766, 746, 589, 399, 0] },
    		 {id: 56,
    		  name: "Guatemala",
    		  lifeExpectancy: 74.3,
    		  demographics: [4021938, 3865062, 3339524, 2460641, 1627996, 1016203, 695632, 366031, 188449],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Infecciones respiratorias inferiores', 'Enfermedades digestivas', 'Homicidio', 'Diabetes', 'Nefropatía', 'Enfermedades del HIGADO', 'Trastornos neonatales', 'Enfermedades diarreicas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [15009, 11034, 9695, 7300, 6193, 5531, 5065, 4623, 3675, 2957, 63],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Diabetes, sangre y enfermedades endocrinas.', 'Violencia interpersonal', 'Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades digestivas', 'Otras ENT', 'Lesiones no intencionales', 'Trastornos mentales y por abuso de sustancias.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [602755, 403822, 382601, 338262, 335440, 294204, 269396, 267082, 252017, 228858, 1128],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Contaminación del aire (exterior e interior)', 'Obesidad', 'Emaciación infantil', 'Hipertensión', 'Fuente de agua insegura', 'El consumo de drogas', 'De fumar', 'Saneamiento inseguro', 'Colesterol alto', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [402592, 269293, 262556, 226714, 226087, 161136, 102818, 100650, 95949, 81342, 1128] },
    		 {id: 57,
    		  name: "Guinea",
    		  lifeExpectancy: 61.6,
    		  demographics: [3893217, 3131561, 2277961, 1403283, 864312, 600063, 394880, 166054, 39914],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Infecciones respiratorias inferiores', 'Malaria', 'Trastornos neonatales', 'Cánceres', 'Tuberculosis', 'Enfermedades diarreicas', 'Enfermedades digestivas', 'VIH / SIDA', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [16151, 12033, 11355, 10012, 8125, 5917, 5287, 3131, 2989, 2898, 20],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Malaria y enfermedades tropicales desatendidas', 'Trastornos neonatales', 'VIH / SIDA y tuberculosis', 'Enfermedades cardiovasculares', 'Otras ENT', 'Deficiencias nutricionales', 'Diabetes, sangre y enfermedades endocrinas.', 'Cánceres', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1570992, 929025, 915842, 474268, 405634, 401375, 329709, 268882, 248388, 223100, 435],
    		  riskFactors: ['Emaciación infantil', 'Contaminación del aire (exterior e interior)', 'Fuente de agua insegura', 'Hipertensión', 'Saneamiento inseguro', 'Deficiencia de vitamina A', 'Nivel alto de azúcar en la sangre', 'Retraso del crecimiento infantil', 'Deficiencia de hierro', 'Obesidad', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [731514, 509268, 290067, 232709, 216134, 197656, 172770, 143237, 135493, 114120, 435] },
    		 {id: 58,
    		  name: "Guyana",
    		  lifeExpectancy: 69.91,
    		  demographics: [147517, 147825, 142736, 93866, 91021, 78183, 49260, 21780, 10587],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'VIH / SIDA', 'Trastornos neonatales', 'Suicidio', 'Nefropatía', 'Enfermedades del HIGADO', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [2034, 621, 425, 281, 248, 196, 194, 189, 181, 174, 11],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos neonatales', 'Cánceres', 'Trastornos mentales y por abuso de sustancias.', 'Diarrea y enfermedades infecciosas comunes.', 'VIH / SIDA y tuberculosis', 'Lesiones no intencionales', 'Otras ENT', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [48488, 29028, 20211, 17630, 13647, 13225, 12727, 12670, 11948, 10822, 189],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Hipertensión', 'Obesidad', 'Colesterol alto', 'De fumar', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'Emaciación infantil', 'Deficiencia de hierro', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [35463, 29423, 27805, 13961, 12513, 10968, 9387, 5708, 4171, 4063, 189] },
    		 {id: 59,
    		  name: "Haití",
    		  lifeExpectancy: 64.0,
    		  demographics: [2503602, 2334380, 2030254, 1702688, 1062317, 774512, 506169, 253257, 95900],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Infecciones respiratorias inferiores', 'Trastornos neonatales', 'Lesiones viales', 'Diabetes', 'VIH / SIDA', 'Enfermedades diarreicas', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [23978, 10065, 6003, 4793, 4487, 4003, 3850, 3703, 3619, 3134, 33],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Enfermedades cardiovasculares', 'Trastornos neonatales', 'Otras ENT', 'Lesiones no intencionales', 'VIH / SIDA y tuberculosis', 'Diabetes, sangre y enfermedades endocrinas.', 'Cánceres', 'Lesiones de transporte', 'Trastornos mentales y por abuso de sustancias.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [734644, 612671, 458390, 384494, 368148, 340215, 313273, 291429, 265724, 171517, 613],
    		  riskFactors: ['Emaciación infantil', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Contaminación del aire (exterior e interior)', 'Fuente de agua insegura', 'Saneamiento inseguro', 'Obesidad', 'Colesterol alto', 'De fumar', 'Deficiencia de hierro', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [382608, 367485, 324753, 312815, 295182, 220161, 210943, 155160, 116590, 113575, 613] },
    		 {id: 60,
    		  name: "Honduras",
    		  lifeExpectancy: 75.27,
    		  demographics: [2006000, 2073497, 1868035, 1435980, 1009908, 653401, 402303, 195289, 101701],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades digestivas', 'Homicidio', 'Demencia', 'Enfermedades del HIGADO', 'Enfermedades respiratorias', 'Trastornos neonatales', 'Lesiones viales', 'Enfermedades diarreicas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [13117, 5431, 4449, 4154, 2408, 2388, 2056, 1464, 1294, 1229, 188],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Violencia interpersonal', 'Trastornos neonatales', 'Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades digestivas', 'Cánceres', 'Desórdenes neurológicos', 'Diarrea y enfermedades infecciosas comunes.', 'Otras ENT', 'Trastornos mentales y por abuso de sustancias.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [282192, 228670, 180903, 164244, 156390, 152814, 133332, 128019, 126607, 118070, 3444],
    		  riskFactors: ['Hipertensión', 'Obesidad', 'Nivel alto de azúcar en la sangre', 'De fumar', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Fuente de agua insegura', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'El consumo de drogas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [159975, 146377, 133796, 103459, 99629, 85602, 51514, 43189, 41993, 40037, 3444] },
    		 {id: 61,
    		  name: "Hungría",
    		  lifeExpectancy: 76.88,
    		  demographics: [911982, 972734, 1176155, 1283490, 1579425, 1189378, 1322500, 822141, 426875],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Enfermedades del HIGADO', 'Diabetes', 'Suicidio', 'Nefropatía', 'Infecciones respiratorias inferiores', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [57212, 32138, 7064, 5879, 5457, 3228, 2063, 2025, 1553, 1016, 505],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Lesiones no intencionales', 'Desórdenes neurológicos', 'Enfermedades digestivas', 'Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades respiratorias', 'Trastornos mentales y por abuso de sustancias.', 'Otras ENT', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [948587, 719728, 271875, 246768, 206846, 180409, 179146, 177834, 153606, 115640, 6850],
    		  riskFactors: ['De fumar', 'Hipertensión', 'Obesidad', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Dieta baja en frutas', 'Baja actividad física', 'Humo de segunda mano', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [680552, 655486, 476990, 428625, 339453, 181526, 170125, 141183, 64658, 59660, 6850] },
    		 {id: 62,
    		  name: "Islandia",
    		  lifeExpectancy: 82.99,
    		  demographics: [43668, 44269, 48238, 46464, 42622, 42276, 36635, 22223, 12642],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'Enfermedades digestivas', 'Suicidio', 'Enfermedad de Parkinson', 'Nefropatía', 'Diabetes', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [738, 652, 236, 114, 95, 65, 40, 39, 27, 22, 10],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades respiratorias', 'Lesiones no intencionales', 'Diabetes, sangre y enfermedades endocrinas.', 'Otras ENT', 'Diarrea y enfermedades infecciosas comunes.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [12927, 10060, 9227, 7061, 6135, 3992, 3785, 3121, 3018, 1716, 139],
    		  riskFactors: ['De fumar', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'Colesterol alto', 'El consumo de drogas', 'Contaminación del aire (exterior e interior)', 'Dieta baja en vegetales', 'Dieta baja en frutas', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [7646, 6360, 6244, 5408, 3428, 1198, 1195, 1008, 1005, 925, 139] },
    		 {id: 63,
    		  name: "India",
    		  lifeExpectancy: 69.66,
    		  demographics: [236731829, 252674336, 238481457, 212399683, 165881490, 125378954, 84296275, 37500685, 13073046],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Enfermedades respiratorias', 'Cánceres', 'Enfermedades diarreicas', 'Infecciones respiratorias inferiores', 'Tuberculosis', 'Trastornos neonatales', 'Enfermedades digestivas', 'Diabetes', 'Nefropatía', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [2632780, 1271687, 929500, 719083, 507364, 449794, 428672, 419545, 254555, 223821, 4337],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Enfermedades respiratorias', 'Diabetes, sangre y enfermedades endocrinas.', 'Cánceres', 'Lesiones no intencionales', 'Otras ENT', 'Trastornos mentales y por abuso de sustancias.', 'Trastornos musculoesqueléticos', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [64219262, 59105453, 46464098, 33125142, 26160476, 25772512, 23310913, 22563499, 22096435, 21348307, 79240],
    		  riskFactors: ['Contaminación del aire (exterior e interior)', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'De fumar', 'Emaciación infantil', 'Fuente de agua insegura', 'Colesterol alto', 'Obesidad', 'Deficiencia de hierro', 'Dieta baja en frutas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [39210284, 37485408, 28068070, 23841107, 20642364, 19658345, 19264482, 17663196, 13222380, 11852430, 79240] },
    		 {id: 64,
    		  name: "Indonesia",
    		  lifeExpectancy: 71.72,
    		  demographics: [47977486, 46310084, 43068836, 41353654, 37293402, 28325635, 16650777, 7276648, 2369045],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades digestivas', 'Diabetes', 'Enfermedades respiratorias', 'Tuberculosis', 'Enfermedades del HIGADO', 'Enfermedades diarreicas', 'Demencia', 'Infecciones respiratorias inferiores', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [597995, 198835, 121488, 97005, 96316, 82219, 82145, 68636, 47869, 43764, 1418],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Diarrea y enfermedades infecciosas comunes.', 'Diabetes, sangre y enfermedades endocrinas.', 'Cánceres', 'Trastornos neonatales', 'Trastornos musculoesqueléticos', 'Enfermedades digestivas', 'VIH / SIDA y tuberculosis', 'Enfermedades respiratorias', 'Otras ENT', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [14436782, 6040809, 5756326, 5576287, 4267523, 4266640, 3709473, 3525877, 3510134, 3397022, 26400],
    		  riskFactors: ['Hipertensión', 'Nivel alto de azúcar en la sangre', 'De fumar', 'Obesidad', 'Contaminación del aire (exterior e interior)', 'Colesterol alto', 'Dieta baja en frutas', 'Dieta rica en sal', 'Dieta baja en vegetales', 'Emaciación infantil', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [10343485, 10011664, 6688501, 5556192, 4014640, 3476122, 3100077, 2859877, 2375858, 2098071, 26400] },
    		 {id: 65,
    		  name: "Irán",
    		  lifeExpectancy: 76.68,
    		  demographics: [14377200, 11531256, 12885389, 16623647, 11185873, 8029753, 5126544, 2239919, 914312],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Lesiones viales', 'Diabetes', 'Enfermedades respiratorias', 'Nefropatía', 'Enfermedades digestivas', 'Trastornos neonatales', 'Infecciones respiratorias inferiores', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [161330, 60600, 21435, 21124, 16033, 14948, 10163, 9907, 9553, 9315, 7508],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Trastornos mentales y por abuso de sustancias.', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Cánceres', 'Diabetes, sangre y enfermedades endocrinas.', 'Otras ENT', 'Trastornos neonatales', 'Lesiones de transporte', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [3176330, 1904817, 1783780, 1616255, 1592320, 1514747, 1355368, 1339143, 1271439, 924674, 136251],
    		  riskFactors: ['Hipertensión', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'De fumar', 'Colesterol alto', 'El consumo de drogas', 'Contaminación del aire (exterior e interior)', 'Baja actividad física', 'Dieta rica en sal', 'Humo de segunda mano', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [1878213, 1713915, 1700004, 1081718, 1077120, 991126, 795938, 360228, 282413, 272788, 136251] },
    		 {id: 66,
    		  name: "Irak",
    		  lifeExpectancy: 70.6,
    		  demographics: [10485112, 8550850, 7013811, 5252557, 3814033, 2191874, 1261768, 552034, 187749],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Conflicto', 'Cánceres', 'Trastornos neonatales', 'Terrorismo', 'Nefropatía', 'Diabetes', 'Lesiones viales', 'Infecciones respiratorias inferiores', 'Demencia', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [43072, 33240, 13780, 12278, 6476, 4706, 4281, 3773, 3628, 3600, 169],
    		  diseaseNames: ['Conflicto y terrorismo', 'Trastornos neonatales', 'Enfermedades cardiovasculares', 'Diabetes, sangre y enfermedades endocrinas.', 'Diarrea y enfermedades infecciosas comunes.', 'Otras ENT', 'Trastornos mentales y por abuso de sustancias.', 'Lesiones no intencionales', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [2065047, 1276888, 1114616, 980591, 977639, 881383, 669242, 592465, 587218, 499474, 3560],
    		  riskFactors: ['Obesidad', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'De fumar', 'El consumo de drogas', 'Dieta baja en frutas', 'Emaciación infantil', 'Deficiencia de hierro', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [728011, 713340, 686531, 653682, 367011, 365292, 285716, 232404, 175962, 155092, 3560] },
    		 {id: 67,
    		  name: "Irlanda",
    		  lifeExpectancy: 82.3,
    		  demographics: [683362, 653400, 559110, 710607, 747666, 587995, 473864, 314560, 151934],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020', 'Infecciones respiratorias inferiores', 'Enfermedades digestivas', 'Nefropatía', 'Suicidio', 'Diabetes', 'Enfermedades del HIGADO'],
    		  majorDeaths: [9681, 9581, 2698, 2226, 1615, 1372, 1145, 579, 453, 420, 393],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Desórdenes neurológicos', 'Enfermedades respiratorias', 'Otras ENT', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones no intencionales', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [189194, 145789, 126929, 99180, 95089, 61214, 54913, 51616, 50239, 32460, 23153],
    		  riskFactors: ['De fumar', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Obesidad', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'COVID-19 hasta el 27 de mayo de 2020', 'El consumo de drogas', 'Dieta baja en frutas', 'Dieta rica en sal', 'Baja actividad física'],
    		  riskDALYs: [132906, 99314, 90195, 83764, 45699, 24227, 23153, 22113, 15034, 14695, 13727] },
    		 {id: 68,
    		  name: "Israel",
    		  lifeExpectancy: 82.97,
    		  demographics: [1654530, 1377821, 1178880, 1117905, 1019070, 779142, 702437, 430872, 258715],
    		  majorCauses: ['Cánceres', 'Enfermedades cardiovasculares', 'Demencia', 'Infecciones respiratorias inferiores', 'Nefropatía', 'Diabetes', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Enfermedades del HIGADO', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [12966, 11849, 4658, 2276, 2242, 2141, 1812, 1808, 707, 632, 281],
    		  diseaseNames: ['Cánceres', 'Trastornos musculoesqueléticos', 'Enfermedades cardiovasculares', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Otras ENT', 'Lesiones no intencionales', 'Enfermedades respiratorias', 'Trastornos neonatales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [253956, 211092, 175059, 151116, 143230, 134764, 98294, 80106, 63869, 51274, 3978],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'De fumar', 'Obesidad', 'Hipertensión', 'Contaminación del aire (exterior e interior)', 'Colesterol alto', 'El consumo de drogas', 'Dieta rica en sal', 'Baja actividad física', 'Dieta baja en frutas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [167092, 158896, 121800, 113120, 52609, 45088, 19532, 17738, 16242, 14827, 3978] },
    		 {id: 69,
    		  name: "Italia",
    		  lifeExpectancy: 83.51,
    		  demographics: [5103576, 5740332, 6135226, 7100743, 9225165, 9453168, 7391126, 5935048, 4465708],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'COVID-19 hasta el 27 de mayo de 2020', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Diabetes', 'Nefropatía', 'Infecciones respiratorias inferiores', 'Enfermedades del HIGADO', 'Enfermedad de Parkinson'],
    		  majorDeaths: [216585, 180577, 73339, 32955, 29044, 26403, 18551, 14292, 13167, 11695, 7557],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones no intencionales', 'Enfermedades digestivas', 'Otras ENT', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [3227357, 2648270, 1971740, 1748118, 1191659, 1020109, 703647, 597865, 593953, 578073, 402295],
    		  riskFactors: ['De fumar', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Obesidad', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'COVID-19 hasta el 27 de mayo de 2020', 'El consumo de drogas', 'Dieta rica en sal', 'Baja actividad física', 'Dieta baja en frutas'],
    		  riskDALYs: [1879616, 1702367, 1518935, 1310480, 648326, 522561, 402295, 271922, 267823, 220006, 207156] },
    		 {id: 70,
    		  name: "Jamaica",
    		  lifeExpectancy: 74.47,
    		  demographics: [465506, 474181, 517860, 435865, 357187, 315232, 206614, 116152, 59679],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes', 'Demencia', 'Homicidio', 'Nefropatía', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'VIH / SIDA', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [6279, 3975, 2516, 1253, 887, 810, 695, 504, 503, 440, 9],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Diabetes, sangre y enfermedades endocrinas.', 'Cánceres', 'Trastornos neonatales', 'Violencia interpersonal', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Otras ENT', 'Diarrea y enfermedades infecciosas comunes.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [116834, 107775, 96171, 48412, 48126, 45159, 45023, 44712, 37202, 29423, 141],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'De fumar', 'Contaminación del aire (exterior e interior)', 'Colesterol alto', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'Deficiencia de hierro', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [121104, 90114, 75774, 55231, 29649, 20221, 16755, 10866, 10335, 9483, 141] },
    		 {id: 71,
    		  name: "Japón",
    		  lifeExpectancy: 84.63,
    		  demographics: [10363426, 11337747, 12268082, 14762678, 18753747, 16223340, 16318424, 15814619, 11018236],
    		  majorCauses: ['Cánceres', 'Enfermedades cardiovasculares', 'Demencia', 'Infecciones respiratorias inferiores', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Nefropatía', 'Suicidio', 'Enfermedades del HIGADO', 'Enfermedad de Parkinson', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [414698, 368091, 198556, 109534, 56334, 53739, 35709, 28819, 25352, 15613, 858],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos mentales y por abuso de sustancias.', 'Lesiones no intencionales', 'Enfermedades respiratorias', 'Otras ENT', 'Diarrea y enfermedades infecciosas comunes.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [6647076, 5124426, 4181686, 3088970, 2174030, 2146019, 2122420, 1348675, 1284802, 1131219, 10052],
    		  riskFactors: ['De fumar', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Dieta rica en sal', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Baja actividad física', 'El consumo de drogas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [4211397, 3003185, 2241447, 1385128, 1315624, 987828, 839089, 819971, 423681, 412535, 10052] },
    		 {id: 72,
    		  name: "Jordania",
    		  lifeExpectancy: 74.53,
    		  demographics: [2257019, 2159817, 1780641, 1468830, 1117097, 720652, 348029, 187481, 62131],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos neonatales', 'Diabetes', 'Demencia', 'Nefropatía', 'Lesiones viales', 'Infecciones respiratorias inferiores', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [9018, 4502, 2023, 1516, 1299, 1281, 1110, 1014, 822, 730, 9],
    		  diseaseNames: ['Trastornos neonatales', 'Enfermedades cardiovasculares', 'Otras ENT', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Cánceres', 'Desórdenes neurológicos', 'Lesiones de transporte', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [231744, 205154, 200157, 171916, 170292, 144906, 129454, 128076, 79489, 77320, 180],
    		  riskFactors: ['Obesidad', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'De fumar', 'El consumo de drogas', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Deficiencia de hierro', 'Humo de segunda mano', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [186863, 157454, 137643, 109142, 70998, 70022, 67410, 40454, 32995, 28236, 180] },
    		 {id: 73,
    		  name: "Kazajistán",
    		  lifeExpectancy: 73.6,
    		  demographics: [3854928, 2574607, 2706361, 2919045, 2254076, 2041467, 1366464, 538921, 295558],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades digestivas', 'Enfermedades del HIGADO', 'Enfermedades respiratorias', 'Demencia', 'Suicidio', 'Infecciones respiratorias inferiores', 'Lesiones viales', 'Trastornos neonatales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [67339, 18400, 9115, 6849, 5615, 4481, 4263, 3624, 2767, 2047, 37],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Lesiones no intencionales', 'Enfermedades digestivas', 'Otras ENT', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Desórdenes neurológicos', 'Trastornos neonatales', 'Diabetes, sangre y enfermedades endocrinas.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1423967, 499547, 385355, 337080, 287137, 261389, 253852, 251712, 250447, 228854, 620],
    		  riskFactors: ['Hipertensión', 'Obesidad', 'De fumar', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'Dieta baja en frutas', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'El consumo de drogas', 'Humo de segunda mano', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [790109, 644782, 598318, 495839, 469206, 263862, 212036, 208316, 129363, 105151, 620] },
    		 {id: 74,
    		  name: "Kenia",
    		  lifeExpectancy: 66.7,
    		  demographics: [13975897, 12493627, 9335457, 7280037, 4688651, 2676456, 1445979, 534812, 143051],
    		  majorCauses: ['VIH / SIDA', 'Enfermedades cardiovasculares', 'Infecciones respiratorias inferiores', 'Cánceres', 'Enfermedades diarreicas', 'Enfermedades digestivas', 'Trastornos neonatales', 'Tuberculosis', 'Enfermedades del HIGADO', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [48502, 35993, 23268, 21373, 20835, 18893, 16978, 14881, 10398, 6871, 52],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'VIH / SIDA y tuberculosis', 'Trastornos neonatales', 'Enfermedades cardiovasculares', 'Otras ENT', 'Enfermedades digestivas', 'Cánceres', 'Trastornos mentales y por abuso de sustancias.', 'Lesiones no intencionales', 'Desórdenes neurológicos', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [4434222, 2835626, 1764456, 930002, 926142, 685728, 669334, 637402, 541192, 506020, 1221],
    		  riskFactors: ['Emaciación infantil', 'Fuente de agua insegura', 'Contaminación del aire (exterior e interior)', 'Saneamiento inseguro', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Deficiencia de vitamina A', 'Obesidad', 'De fumar', 'Retraso del crecimiento infantil', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [1098902, 1013002, 819127, 765692, 621159, 595363, 539569, 373205, 315363, 263262, 1221] },
    		 {id: 75,
    		  name: "Kiribati",
    		  lifeExpectancy: 68.37,
    		  demographics: [29279, 23045, 20596, 16281, 10981, 9781, 4873, 2205, 567],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Diabetes', 'Cánceres', 'Enfermedades respiratorias', 'Trastornos neonatales', 'Tuberculosis', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'Enfermedades diarreicas', 'Suicidio'],
    		  majorDeaths: [270, 121, 93, 63, 57, 54, 44, 41, 33, 30],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Diabetes, sangre y enfermedades endocrinas.', 'Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Otras ENT', 'Cánceres', 'Enfermedades respiratorias', 'Deficiencias nutricionales', 'Enfermedades digestivas', 'Autolesiones'],
    		  diseaseDALYs: [8817, 6413, 5760, 5386, 3723, 3039, 2700, 2106, 1748, 1689],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Obesidad', 'De fumar', 'Hipertensión', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Emaciación infantil', 'Colesterol alto', 'Dieta baja en vegetales', 'Humo de segunda mano'],
    		  riskDALYs: [9248, 7767, 6072, 4513, 3980, 2668, 2375, 2255, 1629, 1457] },
    		 {id: 76,
    		  name: "Kuwait",
    		  lifeExpectancy: 75.49,
    		  demographics: [615731, 509329, 462476, 916067, 936319, 514790, 197771, 44686, 9908],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Infecciones respiratorias inferiores', 'Lesiones viales', 'Demencia', 'Enfermedades digestivas', 'Diabetes', 'Nefropatía', 'Trastornos neonatales', 'COVID-19 hasta el 27 de mayo de 2020', 'Enfermedades respiratorias'],
    		  majorDeaths: [3094, 1233, 573, 529, 324, 262, 217, 177, 173, 172, 166],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Otras ENT', 'Desórdenes neurológicos', 'Diabetes, sangre y enfermedades endocrinas.', 'Cánceres', 'Lesiones de transporte', 'Trastornos neonatales', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [87091, 83602, 79495, 50897, 48788, 48403, 35261, 33603, 32252, 28823, 4153],
    		  riskFactors: ['Obesidad', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'De fumar', 'Colesterol alto', 'El consumo de drogas', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Humo de segunda mano', 'Dieta rica en sal', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [83006, 51389, 51249, 42806, 39135, 35312, 31345, 16962, 10359, 9365, 4153] },
    		 {id: 77,
    		  name: "Kirguistán",
    		  lifeExpectancy: 71.45,
    		  demographics: [1513166, 1067795, 1104469, 977554, 673651, 576005, 340820, 103872, 58519],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades digestivas', 'Enfermedades del HIGADO', 'Trastornos neonatales', 'Enfermedades respiratorias', 'Lesiones viales', 'Infecciones respiratorias inferiores', 'Demencia', 'Suicidio', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [16557, 3709, 2495, 2159, 1842, 1393, 884, 854, 824, 594, 16],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Trastornos neonatales', 'Diarrea y enfermedades infecciosas comunes.', 'Enfermedades digestivas', 'Cánceres', 'Otras ENT', 'Lesiones no intencionales', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Trastornos musculoesqueléticos', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [343877, 188505, 131432, 109728, 108236, 97255, 94677, 80365, 79860, 79635, 305],
    		  riskFactors: ['Hipertensión', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'De fumar', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Dieta rica en sal', 'Deficiencia de hierro', 'El consumo de drogas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [181555, 131066, 125338, 114377, 105735, 81421, 71032, 38858, 38235, 35181, 305] },
    		 {id: 78,
    		  name: "Laos",
    		  lifeExpectancy: 67.92,
    		  demographics: [1565148, 1456114, 1358326, 1054965, 749666, 509532, 304392, 130858, 40455],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Infecciones respiratorias inferiores', 'Trastornos neonatales', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Lesiones viales', 'Enfermedades del HIGADO', 'Enfermedades diarreicas', 'Tuberculosis', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [13145, 4735, 3756, 3542, 2605, 2540, 1690, 1595, 1582, 1551, 0],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Enfermedades cardiovasculares', 'Trastornos neonatales', 'Otras ENT', 'Cánceres', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones de transporte', 'Enfermedades respiratorias', 'Lesiones no intencionales', 'Trastornos musculoesqueléticos', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [580354, 342443, 337627, 192109, 144731, 136833, 112789, 104873, 103883, 97528, 0],
    		  riskFactors: ['Contaminación del aire (exterior e interior)', 'Hipertensión', 'Emaciación infantil', 'Nivel alto de azúcar en la sangre', 'De fumar', 'Obesidad', 'Fuente de agua insegura', 'Colesterol alto', 'Humo de segunda mano', 'Dieta baja en frutas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [222829, 198600, 192745, 190221, 155967, 110542, 87473, 84290, 67491, 64915, 0] },
    		 {id: 79,
    		  name: "Letonia",
    		  lifeExpectancy: 75.29,
    		  demographics: [209188, 184856, 205890, 262698, 256776, 269669, 243007, 165298, 109358],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades digestivas', 'Suicidio', 'Enfermedades del HIGADO', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'Diabetes', 'Trastornos por consumo de alcohol.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [15463, 5621, 1740, 998, 438, 434, 434, 379, 320, 294, 22],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Lesiones no intencionales', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades digestivas', 'Trastornos mentales y por abuso de sustancias.', 'Otras ENT', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [251875, 119164, 56908, 52574, 46943, 35877, 33911, 31469, 25380, 17912, 282],
    		  riskFactors: ['Hipertensión', 'De fumar', 'Obesidad', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'Dieta baja en frutas', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Baja actividad física', 'Dieta baja en vegetales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [155232, 109735, 105412, 89377, 81725, 38011, 31230, 29007, 19450, 18458, 282] },
    		 {id: 80,
    		  name: "Líbano",
    		  lifeExpectancy: 78.93,
    		  demographics: [1183784, 1159529, 1186188, 1009919, 862619, 713217, 433181, 202860, 104411],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Diabetes', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'Nefropatía', 'Lesiones viales', 'Trastornos neonatales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [14094, 7703, 1866, 1614, 1175, 833, 739, 594, 562, 557, 26],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos mentales y por abuso de sustancias.', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Otras ENT', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos neonatales', 'Enfermedades respiratorias', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [277882, 211228, 156612, 131367, 117713, 93176, 89925, 82542, 73834, 60861, 440],
    		  riskFactors: ['Obesidad', 'Nivel alto de azúcar en la sangre', 'De fumar', 'Hipertensión', 'El consumo de drogas', 'Contaminación del aire (exterior e interior)', 'Colesterol alto', 'Humo de segunda mano', 'Dieta baja en frutas', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [210233, 191855, 176671, 168709, 98764, 78426, 69882, 33327, 32854, 29616, 440] },
    		 {id: 81,
    		  name: "Lesoto",
    		  lifeExpectancy: 54.33,
    		  demographics: [476585, 430608, 395150, 322798, 202120, 139177, 94839, 47103, 16887],
    		  majorCauses: ['VIH / SIDA', 'Enfermedades cardiovasculares', 'Tuberculosis', 'Cánceres', 'Infecciones respiratorias inferiores', 'Enfermedades diarreicas', 'Diabetes', 'Enfermedades respiratorias', 'Trastornos neonatales', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [6331, 4007, 1932, 1798, 1573, 1225, 1114, 1046, 866, 803, 0],
    		  diseaseNames: ['VIH / SIDA y tuberculosis', 'Diarrea y enfermedades infecciosas comunes.', 'Enfermedades cardiovasculares', 'Trastornos neonatales', 'Diabetes, sangre y enfermedades endocrinas.', 'Cánceres', 'Lesiones de transporte', 'Violencia interpersonal', 'Enfermedades respiratorias', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [699820, 221340, 98860, 82394, 66194, 53096, 49314, 47954, 41436, 36752, 0],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Hipertensión', 'Contaminación del aire (exterior e interior)', 'De fumar', 'Fuente de agua insegura', 'Obesidad', 'Emaciación infantil', 'Saneamiento inseguro', 'Dieta baja en frutas', 'Deficiencia de vitamina A', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [90169, 65890, 64292, 61167, 60136, 57484, 50694, 45920, 26756, 19203, 0] },
    		 {id: 82,
    		  name: "Liberia",
    		  lifeExpectancy: 64.1,
    		  demographics: [1400348, 1148335, 813535, 616321, 428711, 274075, 161538, 74640, 19871],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Malaria', 'Enfermedades diarreicas', 'Trastornos neonatales', 'Infecciones respiratorias inferiores', 'Cánceres', 'VIH / SIDA', 'Tuberculosis', 'Enfermedades digestivas', 'Enfermedades del HIGADO', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [4414, 2810, 2503, 2442, 2317, 2118, 1840, 1495, 1232, 733, 26],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Malaria y enfermedades tropicales desatendidas', 'Trastornos neonatales', 'VIH / SIDA y tuberculosis', 'Otras ENT', 'Enfermedades cardiovasculares', 'Deficiencias nutricionales', 'Diabetes, sangre y enfermedades endocrinas.', 'Cánceres', 'Desórdenes neurológicos', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [488681, 293930, 236278, 153800, 136832, 115273, 90505, 80720, 63432, 59778, 547],
    		  riskFactors: ['Emaciación infantil', 'Fuente de agua insegura', 'Contaminación del aire (exterior e interior)', 'Saneamiento inseguro', 'Hipertensión', 'Deficiencia de vitamina A', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Deficiencia de hierro', 'Retraso del crecimiento infantil', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [174555, 143231, 106021, 103123, 75963, 69593, 62246, 56236, 54699, 41929, 547] },
    		 {id: 83,
    		  name: "Libia",
    		  lifeExpectancy: 72.91,
    		  demographics: [1291223, 1165300, 1102957, 1165502, 1020549, 574557, 269932, 135923, 51510],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Lesiones viales', 'Conflicto', 'Demencia', 'Diabetes', 'Enfermedades respiratorias', 'Nefropatía', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [13334, 5586, 1701, 1525, 1508, 1405, 1205, 1181, 878, 842, 3],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Lesiones de transporte', 'Cánceres', 'Conflicto y terrorismo', 'Trastornos musculoesqueléticos', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos mentales y por abuso de sustancias.', 'Desórdenes neurológicos', 'Otras ENT', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [328433, 169622, 169432, 129405, 125922, 124647, 122767, 101482, 88270, 72970, 59],
    		  riskFactors: ['Obesidad', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'El consumo de drogas', 'Contaminación del aire (exterior e interior)', 'De fumar', 'Colesterol alto', 'Dieta baja en frutas', 'Humo de segunda mano', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [227177, 216077, 193983, 113035, 94613, 86942, 83501, 55052, 34933, 31056, 59] },
    		 {id: 84,
    		  name: "Lituania",
    		  lifeExpectancy: 75.93,
    		  demographics: [296367, 248144, 341343, 336898, 366880, 428804, 342601, 228011, 170583],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades digestivas', 'Demencia', 'Suicidio', 'Enfermedades del HIGADO', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'Trastornos por consumo de alcohol.', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [22251, 8075, 2024, 1997, 1033, 942, 782, 704, 359, 325, 65],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Lesiones no intencionales', 'Trastornos musculoesqueléticos', 'Enfermedades digestivas', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Autolesiones', 'Diabetes, sangre y enfermedades endocrinas.', 'Otras ENT', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [345229, 175044, 92378, 76396, 65565, 65345, 50956, 40077, 40052, 37358, 824],
    		  riskFactors: ['Hipertensión', 'De fumar', 'Obesidad', 'Colesterol alto', 'Nivel alto de azúcar en la sangre', 'Dieta baja en frutas', 'Dieta rica en sal', 'Contaminación del aire (exterior e interior)', 'Baja actividad física', 'Dieta baja en vegetales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [228930, 150010, 137263, 122854, 106816, 46928, 43265, 41843, 30148, 28203, 824] },
    		 {id: 85,
    		  name: "Luxemburgo",
    		  lifeExpectancy: 82.25,
    		  demographics: [65213, 66256, 84625, 95914, 93536, 88767, 60144, 36676, 24599],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'COVID-19 hasta el 27 de mayo de 2020', 'Enfermedades del HIGADO', 'Nefropatía', 'Suicidio', 'Diabetes'],
    		  majorDeaths: [1397, 1306, 440, 237, 227, 146, 110, 99, 85, 69, 64],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Lesiones no intencionales', 'Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades respiratorias', 'Otras ENT', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [25726, 20631, 17093, 13528, 11354, 7441, 7178, 6819, 5929, 5905, 1533],
    		  riskFactors: ['De fumar', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Obesidad', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'El consumo de drogas', 'Dieta rica en sal', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020', 'Dieta baja en vegetales'],
    		  riskDALYs: [16915, 13697, 12220, 12139, 4597, 3660, 2657, 2172, 1544, 1533, 1412] },
    		 {id: 86,
    		  name: "República de Macedonia",
    		  lifeExpectancy: 75.8,
    		  demographics: [228330, 236205, 290417, 326362, 297862, 282001, 240622, 129154, 52505],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Diabetes', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Nefropatía', 'Enfermedades del HIGADO', 'Suicidio', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [10518, 4378, 848, 745, 534, 465, 309, 235, 191, 161, 116],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones no intencionales', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Otras ENT', 'Trastornos neonatales', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [190895, 108056, 46978, 44928, 42217, 37051, 31369, 24413, 23155, 22465, 1757],
    		  riskFactors: ['Hipertensión', 'De fumar', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Dieta baja en frutas', 'Humo de segunda mano', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [122094, 120255, 100479, 90355, 48532, 41927, 28845, 24530, 17622, 11510, 1757] },
    		 {id: 87,
    		  name: "Madagascar",
    		  lifeExpectancy: 67.04,
    		  demographics: [7613806, 6226365, 4738874, 3267437, 2307708, 1484094, 874455, 343514, 113053],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Enfermedades diarreicas', 'Infecciones respiratorias inferiores', 'Trastornos neonatales', 'Cánceres', 'Deficiencias nutricionales', 'Desnutrición proteico-energética', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Malaria', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [34526, 23378, 19854, 17584, 11740, 11669, 11453, 6402, 6017, 5799, 2],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Deficiencias nutricionales', 'Enfermedades cardiovasculares', 'Otras ENT', 'Otras enfermedades transmisibles', 'Malaria y enfermedades tropicales desatendidas', 'Cánceres', 'Lesiones no intencionales', 'Trastornos mentales y por abuso de sustancias.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [3237251, 1641588, 1063864, 999114, 725114, 604605, 488825, 407861, 343230, 335685, 42],
    		  riskFactors: ['Emaciación infantil', 'Fuente de agua insegura', 'Saneamiento inseguro', 'Contaminación del aire (exterior e interior)', 'Hipertensión', 'Deficiencia de vitamina A', 'Retraso del crecimiento infantil', 'Nivel alto de azúcar en la sangre', 'Lactancia no exclusiva', 'Dieta baja en frutas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [2307218, 1393535, 1116685, 947467, 593032, 568745, 523072, 348713, 273471, 213170, 42] },
    		 {id: 88,
    		  name: "Malaui",
    		  lifeExpectancy: 64.26,
    		  demographics: [5597505, 4605388, 3277849, 2195464, 1381160, 811930, 465000, 236664, 57788],
    		  majorCauses: ['VIH / SIDA', 'Enfermedades cardiovasculares', 'Trastornos neonatales', 'Cánceres', 'Infecciones respiratorias inferiores', 'Tuberculosis', 'Enfermedades diarreicas', 'Malaria', 'Enfermedades digestivas', 'Diabetes', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [21935, 15006, 11082, 10093, 9426, 7225, 7061, 6884, 5616, 2642, 4],
    		  diseaseNames: ['VIH / SIDA y tuberculosis', 'Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Malaria y enfermedades tropicales desatendidas', 'Otras ENT', 'Enfermedades cardiovasculares', 'Cánceres', 'Deficiencias nutricionales', 'Lesiones no intencionales', 'Diabetes, sangre y enfermedades endocrinas.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [2089369, 1833682, 1055239, 543959, 500729, 362649, 352625, 337524, 227082, 224552, 88],
    		  riskFactors: ['Emaciación infantil', 'Contaminación del aire (exterior e interior)', 'Fuente de agua insegura', 'Saneamiento inseguro', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Deficiencia de vitamina A', 'Deficiencia de hierro', 'Obesidad', 'De fumar', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [451940, 381809, 343107, 264097, 259254, 251827, 190735, 145811, 121910, 107264, 88] },
    		 {id: 89,
    		  name: "Malasia",
    		  lifeExpectancy: 76.16,
    		  demographics: [5098216, 5185143, 5784427, 5525337, 3884381, 3080289, 2069406, 965368, 357222],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Infecciones respiratorias inferiores', 'Enfermedades digestivas', 'Lesiones viales', 'Demencia', 'Enfermedades respiratorias', 'Nefropatía', 'Enfermedades del HIGADO', 'Suicidio', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [57288, 27057, 23692, 7061, 6946, 5887, 5770, 4731, 3082, 2281, 115],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes, sangre y enfermedades endocrinas.', 'Diarrea y enfermedades infecciosas comunes.', 'Trastornos mentales y por abuso de sustancias.', 'Trastornos musculoesqueléticos', 'Lesiones de transporte', 'Otras ENT', 'Desórdenes neurológicos', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1352218, 699187, 489333, 485542, 473585, 444888, 418419, 359023, 356901, 242767, 2050],
    		  riskFactors: ['Hipertensión', 'Obesidad', 'De fumar', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'Humo de segunda mano', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [906745, 677680, 648420, 597790, 488883, 311272, 290148, 231226, 192134, 155544, 2050] },
    		 {id: 90,
    		  name: "Maldivas",
    		  lifeExpectancy: 78.92,
    		  demographics: [73852, 60061, 140970, 127233, 62492, 35683, 17665, 8722, 4278],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades respiratorias', 'Nefropatía', 'Demencia', 'Diabetes', 'Lesiones viales', 'Enfermedades digestivas', 'Trastornos neonatales', 'Infecciones respiratorias inferiores', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [422, 163, 102, 68, 68, 36, 33, 31, 28, 28, 5],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Desórdenes neurológicos', 'Otras ENT', 'Cánceres', 'Trastornos neonatales', 'Enfermedades respiratorias', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [9055, 6687, 6304, 5798, 4981, 4681, 4195, 3731, 3720, 2289, 103],
    		  riskFactors: ['Hipertensión', 'Nivel alto de azúcar en la sangre', 'De fumar', 'Obesidad', 'Colesterol alto', 'Dieta rica en sal', 'Contaminación del aire (exterior e interior)', 'Deficiencia de hierro', 'Humo de segunda mano', 'Dieta baja en frutas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [6038, 6025, 4954, 4660, 3006, 1777, 1700, 1432, 1253, 1218, 103] },
    		 {id: 91,
    		  name: "Malí",
    		  lifeExpectancy: 59.31,
    		  demographics: [6628593, 4826908, 3089563, 2106937, 1431058, 810331, 488133, 225734, 50765],
    		  majorCauses: ['Trastornos neonatales', 'Malaria', 'Enfermedades cardiovasculares', 'Enfermedades diarreicas', 'Infecciones respiratorias inferiores', 'Cánceres', 'Deficiencias nutricionales', 'Desnutrición proteico-energética', 'VIH / SIDA', 'Meningitis', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [26640, 25080, 18035, 15386, 11586, 10410, 6686, 6478, 5807, 5728, 70],
    		  diseaseNames: ['Trastornos neonatales', 'Diarrea y enfermedades infecciosas comunes.', 'Malaria y enfermedades tropicales desatendidas', 'Deficiencias nutricionales', 'Otras ENT', 'Lesiones no intencionales', 'Enfermedades cardiovasculares', 'Otras enfermedades transmisibles', 'Cánceres', 'VIH / SIDA y tuberculosis', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [2363306, 2339166, 2198476, 960655, 917119, 505199, 497276, 461405, 345514, 340900, 1574],
    		  riskFactors: ['Emaciación infantil', 'Fuente de agua insegura', 'Saneamiento inseguro', 'Contaminación del aire (exterior e interior)', 'Deficiencia de vitamina A', 'Deficiencia de hierro', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Retraso del crecimiento infantil', 'Lactancia no exclusiva', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [1632950, 852513, 654240, 636002, 421451, 335071, 240844, 216570, 200341, 175715, 1574] },
    		 {id: 92,
    		  name: "Malta",
    		  lifeExpectancy: 82.53,
    		  demographics: [42898, 41262, 56840, 65191, 58253, 54234, 57908, 43005, 20785],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Infecciones respiratorias inferiores', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Diabetes', 'Nefropatía', 'Enfermedad de Parkinson', 'Enfermedades del HIGADO', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [1569, 1042, 331, 173, 172, 127, 117, 94, 54, 44, 6],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones no intencionales', 'Otras ENT', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [22705, 20259, 14018, 9810, 8075, 6672, 5952, 5074, 4816, 3573, 79],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'De fumar', 'Hipertensión', 'Obesidad', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Baja actividad física', 'Dieta rica en sal', 'El consumo de drogas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [17301, 15351, 13755, 12623, 6457, 4612, 2916, 2501, 2303, 1637, 79] },
    		 {id: 93,
    		  name: "Mauritania",
    		  lifeExpectancy: 64.92,
    		  demographics: [1282240, 981572, 770505, 601045, 405733, 256724, 144249, 64944, 18685],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos neonatales', 'Infecciones respiratorias inferiores', 'Enfermedades diarreicas', 'Enfermedades digestivas', 'Lesiones viales', 'Enfermedades respiratorias', 'Demencia', 'Tuberculosis', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [3924, 2309, 1998, 1895, 1490, 900, 674, 600, 559, 542, 9],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Enfermedades cardiovasculares', 'Otras ENT', 'Deficiencias nutricionales', 'Cánceres', 'Diabetes, sangre y enfermedades endocrinas.', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [254069, 196903, 90510, 73989, 65102, 62379, 61153, 50133, 45926, 43310, 191],
    		  riskFactors: ['Emaciación infantil', 'Fuente de agua insegura', 'Contaminación del aire (exterior e interior)', 'Hipertensión', 'Saneamiento inseguro', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Deficiencia de hierro', 'Deficiencia de vitamina A', 'Dieta baja en frutas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [110162, 75285, 63864, 58706, 57685, 53308, 49965, 35213, 28530, 21226, 191] },
    		 {id: 94,
    		  name: "Mauricio",
    		  lifeExpectancy: 74.99,
    		  demographics: [135453, 179059, 197068, 175844, 179920, 176623, 134345, 64819, 26539],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Diabetes', 'Cánceres', 'Nefropatía', 'Enfermedades respiratorias', 'Demencia', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'Enfermedades del HIGADO', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [3310, 1729, 1394, 1070, 498, 454, 364, 307, 238, 165, 10],
    		  diseaseNames: ['Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Desórdenes neurológicos', 'Enfermedades respiratorias', 'Otras ENT', 'Enfermedades digestivas', 'Trastornos neonatales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [79944, 70327, 35256, 26345, 20285, 20158, 16221, 15583, 12012, 11526, 158],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'De fumar', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Dieta baja en frutas', 'Humo de segunda mano', 'Dieta baja en vegetales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [102301, 63996, 57090, 32659, 22601, 21407, 18203, 17779, 11031, 8333, 158] },
    		 {id: 95,
    		  name: "México",
    		  lifeExpectancy: 75.05,
    		  demographics: [22245383, 22356958, 21623928, 18636625, 16343173, 12397493, 7946332, 4023962, 2001674],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Nefropatía', 'Diabetes', 'Enfermedades digestivas', 'Homicidio', 'Enfermedades del HIGADO', 'Enfermedades respiratorias', 'Demencia', 'Infecciones respiratorias inferiores', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [161783, 97282, 65033, 64067, 62517, 43160, 40509, 34316, 32865, 21838, 8134],
    		  diseaseNames: ['Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades cardiovasculares', 'Cánceres', 'Otras ENT', 'Enfermedades digestivas', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Trastornos neonatales', 'Violencia interpersonal', 'Trastornos musculoesqueléticos', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [4498557, 3180705, 2495963, 1967719, 1871651, 1793491, 1775959, 1617529, 1585274, 1544903, 135796],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'Contaminación del aire (exterior e interior)', 'De fumar', 'Colesterol alto', 'El consumo de drogas', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'Emaciación infantil', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [4873713, 3759331, 2371373, 1354813, 1278981, 923310, 644737, 513416, 413363, 360087, 135796] },
    		 {id: 96,
    		  name: "Moldavia",
    		  lifeExpectancy: 71.9,
    		  demographics: [429166, 418687, 608197, 760165, 548003, 534327, 475100, 177807, 91806],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades digestivas', 'Enfermedades del HIGADO', 'Demencia', 'Infecciones respiratorias inferiores', 'Enfermedades respiratorias', 'Suicidio', 'Trastornos por consumo de alcohol.', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [23194, 6307, 3863, 3094, 1340, 949, 916, 650, 485, 442, 267],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades digestivas', 'Lesiones no intencionales', 'Enfermedades del HIGADO', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Otras ENT', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [426732, 173334, 133420, 101346, 92512, 83133, 65702, 59834, 58427, 56486, 4246],
    		  riskFactors: ['Hipertensión', 'De fumar', 'Obesidad', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'Dieta baja en frutas', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Dieta baja en vegetales', 'El consumo de drogas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [297875, 188075, 179833, 147746, 135227, 77300, 69090, 40474, 39500, 29548, 4246] },
    		 {id: 97,
    		  name: "Mongolia",
    		  lifeExpectancy: 69.87,
    		  demographics: [727414, 480990, 518734, 551697, 414977, 305432, 147247, 58191, 20484],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades digestivas', 'Enfermedades del HIGADO', 'Trastornos neonatales', 'Infecciones respiratorias inferiores', 'Lesiones viales', 'Suicidio', 'Trastornos por consumo de alcohol.', 'Tuberculosis', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [7770, 4811, 1835, 1374, 941, 660, 546, 525, 487, 367, 0],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos neonatales', 'Lesiones no intencionales', 'Enfermedades digestivas', 'Diarrea y enfermedades infecciosas comunes.', 'Otras ENT', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades del HIGADO', 'Trastornos musculoesqueléticos', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [198831, 129353, 97033, 84895, 66416, 57022, 55155, 44909, 43044, 41857, 0],
    		  riskFactors: ['Hipertensión', 'Obesidad', 'De fumar', 'Nivel alto de azúcar en la sangre', 'Contaminación del aire (exterior e interior)', 'Colesterol alto', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'Dieta rica en sal', 'El consumo de drogas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [132567, 95931, 89189, 66733, 60963, 54502, 54205, 32968, 30890, 17372, 0] },
    		 {id: 98,
    		  name: "Montenegro",
    		  lifeExpectancy: 76.88,
    		  demographics: [74487, 78919, 84827, 88916, 82984, 81320, 75907, 38922, 21706],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Diabetes', 'Enfermedades digestivas', 'Nefropatía', 'Enfermedades respiratorias', 'Suicidio', 'Infecciones respiratorias inferiores', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [3737, 1401, 354, 162, 156, 127, 86, 77, 68, 57, 9],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Lesiones no intencionales', 'Desórdenes neurológicos', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades digestivas', 'Otras ENT', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [62760, 31982, 14414, 13327, 11507, 10931, 9243, 6119, 6077, 4768, 128],
    		  riskFactors: ['De fumar', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Humo de segunda mano', 'Dieta baja en frutas', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [44250, 38418, 31099, 25922, 13968, 11166, 8611, 5067, 3646, 2982, 128] },
    		 {id: 99,
    		  name: "Marruecos",
    		  lifeExpectancy: 76.68,
    		  demographics: [6750500, 6039210, 5923781, 5535929, 4352251, 3698794, 2589647, 1147171, 434483],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Diabetes', 'Enfermedades respiratorias', 'Lesiones viales', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'Trastornos neonatales', 'Tuberculosis', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [115124, 24505, 9343, 8062, 7680, 7264, 5932, 5846, 5596, 4883, 202],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Otras ENT', 'Cánceres', 'Trastornos neonatales', 'Desórdenes neurológicos', 'Lesiones de transporte', 'Diarrea y enfermedades infecciosas comunes.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [2424457, 822462, 762679, 753673, 718496, 694746, 650262, 533369, 427572, 422025, 3522],
    		  riskFactors: ['Hipertensión', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'De fumar', 'Contaminación del aire (exterior e interior)', 'Colesterol alto', 'El consumo de drogas', 'Dieta baja en frutas', 'Baja actividad física', 'Humo de segunda mano', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [1611294, 1230615, 1207573, 567167, 556488, 542224, 288828, 236464, 232814, 201191, 3522] },
    		 {id: 100,
    		  name: "Mozambique",
    		  lifeExpectancy: 60.85,
    		  demographics: [9513591, 7385303, 5101440, 3473273, 2201317, 1354583, 822822, 408321, 105393],
    		  majorCauses: ['VIH / SIDA', 'Enfermedades cardiovasculares', 'Trastornos neonatales', 'Tuberculosis', 'Malaria', 'Cánceres', 'Infecciones respiratorias inferiores', 'Enfermedades diarreicas', 'Enfermedades digestivas', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [62135, 29833, 19375, 19234, 18423, 15826, 13895, 10689, 7118, 5078, 1],
    		  diseaseNames: ['VIH / SIDA y tuberculosis', 'Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Malaria y enfermedades tropicales desatendidas', 'Otras ENT', 'Enfermedades cardiovasculares', 'Cánceres', 'Deficiencias nutricionales', 'Lesiones no intencionales', 'Otras enfermedades transmisibles', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [4502707, 2510552, 1803582, 1444655, 942494, 816402, 533977, 526835, 446614, 439306, 21],
    		  riskFactors: ['Emaciación infantil', 'Contaminación del aire (exterior e interior)', 'Hipertensión', 'Fuente de agua insegura', 'Nivel alto de azúcar en la sangre', 'Saneamiento inseguro', 'De fumar', 'Deficiencia de vitamina A', 'Deficiencia de hierro', 'Obesidad', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [645149, 639320, 587290, 562820, 476274, 431306, 322649, 292189, 289796, 232296, 21] },
    		 {id: 101,
    		  name: "Birmania",
    		  lifeExpectancy: 67.13,
    		  demographics: [9083867, 9994005, 9099437, 8049551, 7142439, 5431377, 3466856, 1354931, 422959],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Diabetes', 'Enfermedades del HIGADO', 'Infecciones respiratorias inferiores', 'Demencia', 'Tuberculosis', 'Trastornos neonatales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [77463, 60066, 55535, 28411, 27217, 23171, 22582, 14445, 13540, 13244, 6],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Diarrea y enfermedades infecciosas comunes.', 'Enfermedades respiratorias', 'Trastornos neonatales', 'Otras ENT', 'Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades digestivas', 'Lesiones no intencionales', 'Enfermedades del HIGADO', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1819145, 1696478, 1482854, 1458830, 1337542, 1201088, 1073858, 1048747, 837214, 815314, 114],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'De fumar', 'Contaminación del aire (exterior e interior)', 'Hipertensión', 'Obesidad', 'Emaciación infantil', 'Dieta baja en frutas', 'Humo de segunda mano', 'Dieta rica en sal', 'Colesterol alto', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [1926019, 1681663, 1423169, 1219220, 753714, 522751, 500424, 376337, 349445, 347466, 114] },
    		 {id: 102,
    		  name: "Namibia",
    		  lifeExpectancy: 63.71,
    		  demographics: [647177, 516584, 469261, 345891, 230228, 146063, 83896, 40705, 14719],
    		  majorCauses: ['VIH / SIDA', 'Enfermedades cardiovasculares', 'Cánceres', 'Infecciones respiratorias inferiores', 'Tuberculosis', 'Trastornos neonatales', 'Enfermedades diarreicas', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Diabetes', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [3960, 3003, 1554, 1148, 869, 830, 813, 652, 595, 546, 0],
    		  diseaseNames: ['VIH / SIDA y tuberculosis', 'Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Enfermedades cardiovasculares', 'Diabetes, sangre y enfermedades endocrinas.', 'Cánceres', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades respiratorias', 'Lesiones de transporte', 'Otras ENT', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [288137, 136433, 77834, 60792, 43694, 43575, 32037, 27889, 27786, 27353, 0],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Emaciación infantil', 'Hipertensión', 'Fuente de agua insegura', 'Contaminación del aire (exterior e interior)', 'Obesidad', 'De fumar', 'Saneamiento inseguro', 'Dieta baja en frutas', 'El consumo de drogas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [49467, 46679, 39352, 37616, 35866, 34031, 29709, 26189, 13623, 13050, 0] },
    		 {id: 103,
    		  name: "Nepal",
    		  lifeExpectancy: 70.78,
    		  demographics: [5479855, 6205791, 5664808, 3628380, 2958204, 2219564, 1443408, 791816, 216888],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Enfermedades respiratorias', 'Cánceres', 'Enfermedades diarreicas', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'Trastornos neonatales', 'Lesiones viales', 'Enfermedades del HIGADO', 'Diabetes', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [49248, 23583, 18315, 10796, 9756, 9297, 8577, 6787, 5671, 5248, 4],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Enfermedades cardiovasculares', 'Trastornos neonatales', 'Enfermedades respiratorias', 'Trastornos musculoesqueléticos', 'Cánceres', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos mentales y por abuso de sustancias.', 'Desórdenes neurológicos', 'Lesiones de transporte', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1237825, 1131125, 930734, 657083, 546530, 492945, 492677, 450672, 440915, 371137, 74],
    		  riskFactors: ['Contaminación del aire (exterior e interior)', 'Hipertensión', 'De fumar', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'Obesidad', 'Fuente de agua insegura', 'Emaciación infantil', 'Dieta baja en frutas', 'Deficiencia de hierro', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [783254, 589863, 585357, 475856, 323761, 308529, 253407, 217534, 215390, 157424, 74] },
    		 {id: 104,
    		  name: "Países Bajos",
    		  lifeExpectancy: 82.28,
    		  demographics: [1762690, 1973468, 2106722, 2075858, 2201959, 2520370, 2109482, 1526904, 819669],
    		  majorCauses: ['Cánceres', 'Enfermedades cardiovasculares', 'Demencia', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'COVID-19 hasta el 27 de mayo de 2020', 'Enfermedades digestivas', 'Diabetes', 'Nefropatía', 'Suicidio', 'Enfermedad de Parkinson'],
    		  majorDeaths: [51854, 40564, 14836, 10109, 6178, 5856, 5649, 2729, 2683, 2066, 1792],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades respiratorias', 'Diabetes, sangre y enfermedades endocrinas.', 'Otras ENT', 'Lesiones no intencionales', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [987417, 581670, 576427, 405596, 365519, 255064, 246098, 201647, 181251, 123640, 77616],
    		  riskFactors: ['De fumar', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Obesidad', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'COVID-19 hasta el 27 de mayo de 2020', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'Humo de segunda mano', 'Dieta rica en sal'],
    		  riskDALYs: [694184, 425666, 349213, 329885, 146262, 137009, 77616, 66875, 48295, 45238, 45173] },
    		 {id: 105,
    		  name: "Nueva Zelanda",
    		  lifeExpectancy: 82.29,
    		  demographics: [618147, 620994, 673857, 604748, 598468, 627307, 511426, 346232, 181883],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Nefropatía', 'Infecciones respiratorias inferiores', 'Diabetes', 'Suicidio', 'Enfermedad de Parkinson', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [10898, 9838, 2975, 2143, 1000, 773, 728, 556, 537, 377, 21],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Lesiones no intencionales', 'Desórdenes neurológicos', 'Enfermedades respiratorias', 'Diabetes, sangre y enfermedades endocrinas.', 'Otras ENT', 'Lesiones de transporte', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [196818, 157168, 133048, 98229, 96355, 81421, 57606, 52563, 48073, 35614, 289],
    		  riskFactors: ['De fumar', 'Obesidad', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'El consumo de drogas', 'Dieta baja en frutas', 'Dieta rica en sal', 'Baja actividad física', 'Contaminación del aire (exterior e interior)', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [106064, 93286, 82829, 71540, 40974, 18972, 17437, 17432, 15989, 13982, 289] },
    		 {id: 106,
    		  name: "Nicaragua",
    		  lifeExpectancy: 74.48,
    		  demographics: [1320595, 1235318, 1169503, 1039838, 735256, 494391, 331884, 144862, 73855],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Nefropatía', 'Enfermedades digestivas', 'Diabetes', 'Demencia', 'Enfermedades del HIGADO', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'Trastornos neonatales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [6033, 3289, 2292, 1579, 1231, 1173, 1127, 877, 849, 848, 35],
    		  diseaseNames: ['Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades cardiovasculares', 'Trastornos neonatales', 'Cánceres', 'Otras ENT', 'Trastornos mentales y por abuso de sustancias.', 'Diarrea y enfermedades infecciosas comunes.', 'Desórdenes neurológicos', 'Trastornos musculoesqueléticos', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [137933, 118992, 110320, 89278, 87937, 85514, 76249, 75694, 75208, 59384, 630],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Hipertensión', 'Obesidad', 'Contaminación del aire (exterior e interior)', 'De fumar', 'Colesterol alto', 'Dieta baja en frutas', 'El consumo de drogas', 'Emaciación infantil', 'Dieta baja en vegetales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [124835, 104480, 103370, 50125, 42168, 32233, 25596, 24331, 20732, 19942, 630] },
    		 {id: 107,
    		  name: "Níger",
    		  lifeExpectancy: 62.42,
    		  demographics: [8480646, 5660343, 3546877, 2165158, 1479270, 1019589, 621905, 282848, 54083],
    		  majorCauses: ['Malaria', 'Enfermedades diarreicas', 'Infecciones respiratorias inferiores', 'Trastornos neonatales', 'Enfermedades cardiovasculares', 'Cánceres', 'Meningitis', 'Tuberculosis', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [30485, 21955, 19710, 16202, 13967, 8177, 7815, 5809, 4412, 3053, 63],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Malaria y enfermedades tropicales desatendidas', 'Trastornos neonatales', 'Otras ENT', 'Deficiencias nutricionales', 'Lesiones no intencionales', 'Enfermedades cardiovasculares', 'VIH / SIDA y tuberculosis', 'Diabetes, sangre y enfermedades endocrinas.', 'Cánceres', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [3596300, 2479474, 1471369, 640298, 508046, 424815, 402079, 394453, 357992, 262404, 1392],
    		  riskFactors: ['Emaciación infantil', 'Fuente de agua insegura', 'Saneamiento inseguro', 'Contaminación del aire (exterior e interior)', 'Deficiencia de vitamina A', 'Retraso del crecimiento infantil', 'Lactancia no exclusiva', 'Deficiencia de hierro', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [2391690, 1451900, 1142631, 955333, 727289, 600184, 312924, 235597, 219262, 186065, 1392] },
    		 {id: 108,
    		  name: "Nigeria",
    		  lifeExpectancy: 54.69,
    		  demographics: [62691322, 46319357, 32244205, 23840172, 16454206, 10366004, 6059156, 2555573, 433608],
    		  majorCauses: ['Infecciones respiratorias inferiores', 'Trastornos neonatales', 'VIH / SIDA', 'Malaria', 'Enfermedades diarreicas', 'Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades digestivas', 'Tuberculosis', 'Meningitis', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [189930, 180355, 169103, 152240, 138359, 122519, 96555, 71076, 57219, 52948, 249],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Malaria y enfermedades tropicales desatendidas', 'VIH / SIDA y tuberculosis', 'Otras ENT', 'Deficiencias nutricionales', 'Lesiones no intencionales', 'Cánceres', 'Enfermedades cardiovasculares', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [22428208, 16451503, 13621942, 8918085, 5304259, 5011258, 3191644, 3107214, 3006460, 2963064, 5630],
    		  riskFactors: ['Emaciación infantil', 'Fuente de agua insegura', 'Contaminación del aire (exterior e interior)', 'Saneamiento inseguro', 'Retraso del crecimiento infantil', 'Deficiencia de vitamina A', 'Lactancia no exclusiva', 'Deficiencia de hierro', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [17020469, 8920346, 7708156, 5675060, 4489373, 4065618, 2815935, 2442647, 1834799, 1307256, 5630] },
    		 {id: 109,
    		  name: "Corea del Norte",
    		  lifeExpectancy: 72.27,
    		  demographics: [3415644, 3619103, 3930083, 3583278, 3864207, 3498467, 2008869, 1321013, 425493],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Enfermedades respiratorias', 'Cánceres', 'Enfermedades digestivas', 'Demencia', 'Lesiones viales', 'Infecciones respiratorias inferiores', 'Enfermedades del HIGADO', 'Nefropatía', 'Suicidio'],
    		  majorDeaths: [90238, 44378, 41553, 8515, 7394, 5744, 5689, 4657, 3639, 3309],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades respiratorias', 'Trastornos musculoesqueléticos', 'Diarrea y enfermedades infecciosas comunes.', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones no intencionales', 'Trastornos mentales y por abuso de sustancias.', 'Lesiones de transporte', 'Otras ENT'],
    		  diseaseDALYs: [1972988, 1136274, 1044331, 469098, 446368, 429775, 384677, 369114, 349473, 338617],
    		  riskFactors: ['Hipertensión', 'De fumar', 'Contaminación del aire (exterior e interior)', 'Nivel alto de azúcar en la sangre', 'Dieta baja en frutas', 'Dieta rica en sal', 'Colesterol alto', 'Humo de segunda mano', 'Obesidad', 'El consumo de drogas'],
    		  riskDALYs: [1163781, 976860, 936794, 613016, 457399, 425374, 368085, 261550, 242889, 149500] },
    		 {id: 110,
    		  name: "Noruega",
    		  lifeExpectancy: 82.4,
    		  demographics: [616243, 643048, 724428, 727725, 730800, 701457, 581791, 427144, 226223],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'Enfermedades digestivas', 'Diabetes', 'Nefropatía', 'Suicidio', 'Enfermedad de Parkinson', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [12886, 11611, 4465, 2639, 1840, 1388, 591, 590, 583, 465, 235],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Lesiones no intencionales', 'Enfermedades respiratorias', 'Diabetes, sangre y enfermedades endocrinas.', 'Otras ENT', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [221284, 172270, 155719, 121986, 107914, 76659, 67981, 64332, 62429, 36676, 3177],
    		  riskFactors: ['De fumar', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Obesidad', 'Colesterol alto', 'El consumo de drogas', 'Contaminación del aire (exterior e interior)', 'Baja actividad física', 'Dieta baja en vegetales', 'Dieta rica en sal', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [141475, 111526, 100285, 89227, 52550, 24230, 22253, 17531, 16074, 15654, 3177] },
    		 {id: 111,
    		  name: "Omán",
    		  lifeExpectancy: 77.86,
    		  demographics: [819521, 514291, 1121755, 1363532, 647718, 301482, 134169, 51814, 20710],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Lesiones viales', 'Cánceres', 'Diabetes', 'Infecciones respiratorias inferiores', 'Demencia', 'Trastornos neonatales', 'Nefropatía', 'Enfermedades digestivas', 'Enfermedades del HIGADO', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [4128, 1950, 1277, 538, 404, 403, 397, 253, 246, 176, 37],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Lesiones de transporte', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos mentales y por abuso de sustancias.', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos neonatales', 'Otras ENT', 'Cánceres', 'Diarrea y enfermedades infecciosas comunes.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [117912, 110700, 88899, 79017, 78480, 54880, 53231, 50870, 41049, 33166, 887],
    		  riskFactors: ['Obesidad', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'El consumo de drogas', 'De fumar', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Dieta baja en vegetales', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [87985, 77564, 73162, 48535, 46122, 34355, 33033, 11511, 10596, 10342, 887] },
    		 {id: 112,
    		  name: "Pakistán",
    		  lifeExpectancy: 67.27,
    		  demographics: [52774521, 44914765, 39377474, 29843795, 20586127, 14690100, 8500213, 4464790, 1413532],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Trastornos neonatales', 'Cánceres', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Enfermedades diarreicas', 'Infecciones respiratorias inferiores', 'Lesiones viales', 'Enfermedades del HIGADO', 'Tuberculosis', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [381421, 185098, 170987, 72647, 69969, 59787, 59440, 53009, 45501, 44150, 1225],
    		  diseaseNames: ['Trastornos neonatales', 'Diarrea y enfermedades infecciosas comunes.', 'Enfermedades cardiovasculares', 'Cánceres', 'Otras ENT', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones de transporte', 'Enfermedades digestivas', 'Lesiones no intencionales', 'Trastornos mentales y por abuso de sustancias.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [17719118, 9720916, 9486921, 5811824, 4382185, 3758170, 3457346, 3027349, 2997880, 2860291, 23742],
    		  riskFactors: ['Hipertensión', 'Contaminación del aire (exterior e interior)', 'Emaciación infantil', 'Nivel alto de azúcar en la sangre', 'De fumar', 'Obesidad', 'Fuente de agua insegura', 'Colesterol alto', 'Dieta baja en frutas', 'Deficiencia de hierro', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [5532401, 4903301, 4539357, 4506942, 3688735, 3414335, 3335793, 2999458, 2206292, 1817366, 23742] },
    		 {id: 113,
    		  name: "Palestina",
    		  lifeExpectancy: 74.05,
    		  demographics: [1349183, 1088552, 950260, 636206, 432598, 283953, 144571, 74627, 21472],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos neonatales', 'Diabetes', 'Demencia', 'Nefropatía', 'Infecciones respiratorias inferiores', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [5327, 2265, 1014, 763, 690, 624, 515, 411, 371, 355, 5],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Trastornos neonatales', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos mentales y por abuso de sustancias.', 'Otras ENT', 'Cánceres', 'Trastornos musculoesqueléticos', 'Diarrea y enfermedades infecciosas comunes.', 'Desórdenes neurológicos', 'Conflicto y terrorismo', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [120854, 111822, 93873, 85527, 78395, 66839, 65093, 63404, 59321, 38914, 105],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'Colesterol alto', 'De fumar', 'Contaminación del aire (exterior e interior)', 'El consumo de drogas', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'Deficiencia de hierro', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [86431, 77642, 68379, 65832, 35706, 33555, 28138, 23336, 13917, 13248, 105] },
    		 {id: 114,
    		  name: "Panamá",
    		  lifeExpectancy: 78.51,
    		  demographics: [771035, 720783, 669917, 611062, 547002, 420154, 271162, 151433, 83892],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Diabetes', 'Nefropatía', 'Infecciones respiratorias inferiores', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Homicidio', 'VIH / SIDA', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [5246, 3519, 1291, 1068, 951, 897, 825, 767, 640, 526, 313],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes, sangre y enfermedades endocrinas.', 'Otras ENT', 'Trastornos mentales y por abuso de sustancias.', 'Desórdenes neurológicos', 'Trastornos musculoesqueléticos', 'Trastornos neonatales', 'Diarrea y enfermedades infecciosas comunes.', 'Violencia interpersonal', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [96163, 84501, 76588, 58716, 53776, 52367, 51530, 51264, 51169, 36729, 4949],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'De fumar', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Emaciación infantil', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'El consumo de drogas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [69997, 63877, 61938, 37342, 24272, 23091, 16591, 13138, 12850, 12570, 4949] },
    		 {id: 115,
    		  name: "Paraguay",
    		  lifeExpectancy: 74.25,
    		  demographics: [1381066, 1337773, 1316292, 1082701, 703289, 541135, 391066, 203938, 87379],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes', 'Nefropatía', 'Demencia', 'Enfermedades digestivas', 'Lesiones viales', 'Infecciones respiratorias inferiores', 'Enfermedades respiratorias', 'Homicidio', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [9835, 5649, 2188, 1602, 1557, 1516, 1491, 1361, 1075, 845, 11],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Diabetes, sangre y enfermedades endocrinas.', 'Cánceres', 'Trastornos mentales y por abuso de sustancias.', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Diarrea y enfermedades infecciosas comunes.', 'Otras ENT', 'Lesiones de transporte', 'Trastornos neonatales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [200872, 144522, 142533, 117408, 108992, 98834, 89711, 88327, 81498, 61604, 189],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'De fumar', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'Deficiencia de hierro', 'Dieta rica en sal', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [158929, 137710, 133881, 107531, 57416, 57294, 34245, 27128, 26824, 22666, 189] },
    		 {id: 116,
    		  name: "Perú",
    		  lifeExpectancy: 76.74,
    		  demographics: [5489704, 5224879, 5423768, 5068397, 4191544, 3185093, 2171756, 1190014, 565307],
    		  majorCauses: ['Cánceres', 'Enfermedades cardiovasculares', 'Infecciones respiratorias inferiores', 'Demencia', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Enfermedades del HIGADO', 'Nefropatía', 'Lesiones viales', 'Diabetes', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [28513, 27720, 16638, 10195, 9227, 7492, 5562, 5287, 4577, 4300, 3788],
    		  diseaseNames: ['Cánceres', 'Diarrea y enfermedades infecciosas comunes.', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Trastornos neonatales', 'Trastornos mentales y por abuso de sustancias.', 'Otras ENT', 'Lesiones no intencionales', 'Diabetes, sangre y enfermedades endocrinas.', 'Desórdenes neurológicos', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [677852, 608338, 554569, 481426, 479788, 470720, 444089, 407091, 402992, 401858, 61540],
    		  riskFactors: ['Obesidad', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Contaminación del aire (exterior e interior)', 'De fumar', 'Colesterol alto', 'Deficiencia de hierro', 'Emaciación infantil', 'El consumo de drogas', 'Dieta baja en frutas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [397073, 335162, 297615, 264551, 186595, 130609, 107063, 104592, 94360, 72302, 61540] },
    		 {id: 117,
    		  name: "Filipinas",
    		  lifeExpectancy: 71.23,
    		  demographics: [22137588, 21224868, 19346448, 15169948, 12087102, 9132653, 5640281, 2495455, 882279],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Infecciones respiratorias inferiores', 'Nefropatía', 'Enfermedades respiratorias', 'Tuberculosis', 'Enfermedades digestivas', 'Diabetes', 'Trastornos neonatales', 'Homicidio', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [217552, 79280, 68013, 34051, 33061, 29322, 26513, 26049, 24722, 15891, 886],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Cánceres', 'Diabetes, sangre y enfermedades endocrinas.', 'Otras ENT', 'Trastornos musculoesqueléticos', 'Enfermedades respiratorias', 'Trastornos mentales y por abuso de sustancias.', 'VIH / SIDA y tuberculosis', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [5629957, 3099601, 2529191, 2433421, 2353436, 1866603, 1757721, 1660479, 1272495, 1191208, 16673],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Hipertensión', 'De fumar', 'Obesidad', 'Contaminación del aire (exterior e interior)', 'Colesterol alto', 'Emaciación infantil', 'Dieta rica en sal', 'Humo de segunda mano', 'Dieta baja en vegetales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [3746813, 3404482, 2967393, 2483498, 2200537, 1467962, 1124433, 946863, 775342, 750053, 16673] },
    		 {id: 118,
    		  name: "Polonia",
    		  lifeExpectancy: 78.73,
    		  demographics: [3812694, 3683606, 4614458, 6098806, 5397403, 4653080, 5155357, 2736204, 1736162],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'Enfermedades del HIGADO', 'Suicidio', 'Diabetes', 'Trastornos por consumo de alcohol.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [168709, 109266, 28753, 16843, 11826, 11096, 7788, 6778, 6655, 4457, 1024],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Lesiones no intencionales', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Enfermedades digestivas', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades respiratorias', 'Otras ENT', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [2771014, 2360949, 974998, 945960, 804552, 593513, 574896, 546687, 478036, 455361, 13890],
    		  riskFactors: ['De fumar', 'Hipertensión', 'Obesidad', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Dieta rica en sal', 'Baja actividad física', 'Humo de segunda mano', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [2063927, 1559349, 1413317, 1306415, 890803, 564674, 466544, 363580, 209552, 182665, 13890] },
    		 {id: 119,
    		  name: "Portugal",
    		  lifeExpectancy: 82.05,
    		  demographics: [856604, 1029022, 1076533, 1253640, 1587112, 1472388, 1282301, 997530, 671048],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Infecciones respiratorias inferiores', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Diabetes', 'Nefropatía', 'Enfermedades del HIGADO', 'Suicidio', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [36943, 29600, 10795, 7160, 6598, 5111, 3769, 3109, 2133, 1359, 1342],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades respiratorias', 'Otras ENT', 'Lesiones no intencionales', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [556228, 483288, 348277, 258666, 226388, 202807, 150373, 118395, 117492, 113988, 16768],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'De fumar', 'Obesidad', 'Hipertensión', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Baja actividad física', 'Dieta rica en sal', 'Humo de segunda mano', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [404257, 312988, 279203, 267234, 109389, 81137, 62114, 44482, 41270, 37113, 16768] },
    		 {id: 120,
    		  name: "Puerto Rico",
    		  lifeExpectancy: 80.1,
    		  demographics: [265199, 397823, 321336, 356603, 409046, 413780, 354578, 263573, 151466],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Diabetes', 'Desastres naturales', 'Nefropatía', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'Enfermedades digestivas', 'Enfermedades del HIGADO', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [8447, 6428, 3037, 2909, 2355, 1691, 1632, 1610, 1496, 953, 129],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Diabetes, sangre y enfermedades endocrinas.', 'Cánceres', 'Desórdenes neurológicos', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Otras ENT', 'Enfermedades respiratorias', 'Violencia interpersonal', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [138694, 137965, 124356, 74842, 70601, 63381, 47707, 44739, 43088, 40890, 1683],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'De fumar', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'El consumo de drogas', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [164852, 164445, 96268, 44280, 38035, 29022, 19794, 15811, 14987, 14416, 1683] },
    		 {id: 121,
    		  name: "Catar",
    		  lifeExpectancy: 80.23,
    		  demographics: [268598, 230385, 719809, 819308, 462935, 238779, 74010, 14279, 3968],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Lesiones viales', 'Diabetes', 'Enfermedades digestivas', 'Suicidio', 'Nefropatía', 'Enfermedades del HIGADO', 'Demencia', 'Infecciones respiratorias inferiores', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [918, 660, 574, 287, 159, 145, 115, 114, 95, 91, 28],
    		  diseaseNames: ['Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Lesiones de transporte', 'Diabetes, sangre y enfermedades endocrinas.', 'Desórdenes neurológicos', 'Enfermedades cardiovasculares', 'Lesiones no intencionales', 'Otras ENT', 'Cánceres', 'Trastornos neonatales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [51741, 51335, 34814, 33636, 31118, 30167, 25396, 22744, 21724, 15324, 800],
    		  riskFactors: ['Obesidad', 'El consumo de drogas', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Contaminación del aire (exterior e interior)', 'De fumar', 'Colesterol alto', 'Dieta rica en sal', 'Humo de segunda mano', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [44342, 35001, 33964, 18908, 16441, 14310, 10265, 3899, 3836, 3090, 800] },
    		 {id: 122,
    		  name: "Rumania",
    		  lifeExpectancy: 76.05,
    		  demographics: [1939134, 2069083, 2174981, 2621141, 3076100, 2508724, 2559619, 1482916, 932860],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades digestivas', 'Enfermedades del HIGADO', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'Nefropatía', 'Suicidio', 'Diabetes', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [144849, 51229, 14456, 14232, 10114, 7448, 6207, 3043, 2364, 2260, 1210],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Lesiones no intencionales', 'Trastornos musculoesqueléticos', 'Enfermedades digestivas', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades del HIGADO', 'Enfermedades respiratorias', 'Diabetes, sangre y enfermedades endocrinas.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [2293802, 1195901, 511173, 502200, 452352, 412973, 283885, 274588, 264969, 257818, 16197],
    		  riskFactors: ['Hipertensión', 'De fumar', 'Obesidad', 'Colesterol alto', 'Nivel alto de azúcar en la sangre', 'Dieta rica en sal', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Baja actividad física', 'Humo de segunda mano', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [1528585, 1142662, 972055, 625135, 616402, 354630, 337445, 314456, 148658, 139479, 16197] },
    		 {id: 123,
    		  name: "Rusia",
    		  lifeExpectancy: 72.58,
    		  demographics: [18561902, 14795855, 16599344, 24452747, 19983554, 19449736, 18094236, 8266872, 5668011],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades digestivas', 'Demencia', 'Enfermedades del HIGADO', 'Suicidio', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'Trastornos por consumo de alcohol.', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [1000223, 291447, 94609, 84369, 50910, 43897, 38232, 35493, 28504, 24385, 3807],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Lesiones no intencionales', 'Enfermedades digestivas', 'Desórdenes neurológicos', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Otras ENT', 'Autolesiones', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [18699165, 7188475, 4457968, 3463448, 2949462, 2933286, 2337415, 2043512, 1947477, 1889160, 53680],
    		  riskFactors: ['Hipertensión', 'De fumar', 'Obesidad', 'Colesterol alto', 'Nivel alto de azúcar en la sangre', 'Dieta baja en frutas', 'Contaminación del aire (exterior e interior)', 'El consumo de drogas', 'Dieta rica en sal', 'Dieta baja en vegetales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [10606447, 8613005, 7301942, 7040122, 5421036, 2729779, 2341390, 1971308, 1848572, 1705448, 53680] },
    		 {id: 124,
    		  name: "Ruanda",
    		  lifeExpectancy: 69.02,
    		  demographics: [3502850, 2837454, 2168420, 1758438, 1012265, 721197, 419030, 163562, 43720],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Infecciones respiratorias inferiores', 'Cánceres', 'Trastornos neonatales', 'Enfermedades digestivas', 'Tuberculosis', 'Enfermedades diarreicas', 'Malaria', 'VIH / SIDA', 'Enfermedades del HIGADO', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [8125, 6441, 6308, 5923, 4856, 4564, 3896, 3052, 2963, 2668, 0],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'VIH / SIDA y tuberculosis', 'Otras ENT', 'Malaria y enfermedades tropicales desatendidas', 'Cánceres', 'Enfermedades cardiovasculares', 'Deficiencias nutricionales', 'Enfermedades digestivas', 'Trastornos mentales y por abuso de sustancias.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [879009, 571287, 382120, 331276, 226776, 204285, 197051, 185350, 180480, 167605, 0],
    		  riskFactors: ['Emaciación infantil', 'Contaminación del aire (exterior e interior)', 'Fuente de agua insegura', 'Saneamiento inseguro', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'De fumar', 'Deficiencia de vitamina A', 'Obesidad', 'Retraso del crecimiento infantil', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [331524, 249137, 204666, 158329, 133769, 120221, 100333, 87317, 65917, 63712, 0] },
    		 {id: 125,
    		  name: "Samoa",
    		  lifeExpectancy: 73.32,
    		  demographics: [52139, 41307, 30670, 21842, 19683, 16090, 9521, 4405, 1436],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes', 'Enfermedades respiratorias', 'Nefropatía', 'Infecciones respiratorias inferiores', 'Demencia', 'Enfermedades digestivas', 'Trastornos neonatales', 'Enfermedades del HIGADO'],
    		  majorDeaths: [411, 118, 79, 64, 56, 53, 49, 46, 29, 23],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Diabetes, sangre y enfermedades endocrinas.', 'Diarrea y enfermedades infecciosas comunes.', 'Cánceres', 'Trastornos neonatales', 'Enfermedades respiratorias', 'Trastornos musculoesqueléticos', 'Otras ENT', 'Trastornos mentales y por abuso de sustancias.', 'Desórdenes neurológicos'],
    		  diseaseDALYs: [9472, 6698, 3935, 3305, 3090, 2883, 2803, 2705, 2396, 2140],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'De fumar', 'Contaminación del aire (exterior e interior)', 'Colesterol alto', 'Dieta baja en frutas', 'Humo de segunda mano', 'Dieta baja en vegetales', 'Deficiencia de hierro'],
    		  riskDALYs: [7631, 6959, 5743, 5211, 3003, 2345, 1772, 1521, 1406, 758] },
    		 {id: 126,
    		  name: "Arabia Saudita",
    		  lifeExpectancy: 75.13,
    		  demographics: [5937284, 4817472, 5457856, 6886975, 6162478, 3055997, 1307059, 476138, 167270],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Lesiones viales', 'Cánceres', 'Nefropatía', 'Infecciones respiratorias inferiores', 'Demencia', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Conflicto', 'Enfermedades del HIGADO', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [31569, 12039, 11843, 3818, 3505, 3371, 3109, 2665, 2589, 2461, 411],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Lesiones de transporte', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Desórdenes neurológicos', 'Lesiones no intencionales', 'Otras ENT', 'Cánceres', 'Trastornos neonatales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [888316, 650397, 637913, 629363, 484211, 464319, 451767, 390981, 379671, 314120, 9101],
    		  riskFactors: ['Obesidad', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'El consumo de drogas', 'Contaminación del aire (exterior e interior)', 'Colesterol alto', 'De fumar', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [743801, 575708, 539857, 320040, 306553, 274329, 222709, 158156, 111219, 101175, 9101] },
    		 {id: 127,
    		  name: "Senegal",
    		  lifeExpectancy: 67.94,
    		  demographics: [4949217, 3743997, 2751091, 1988586, 1278344, 803327, 488093, 231925, 61781],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos neonatales', 'Infecciones respiratorias inferiores', 'Enfermedades diarreicas', 'Tuberculosis', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Diabetes', 'Malaria', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [14794, 8931, 7877, 7727, 7270, 5250, 3747, 2852, 2349, 2146, 37],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Otras ENT', 'Enfermedades cardiovasculares', 'VIH / SIDA y tuberculosis', 'Diabetes, sangre y enfermedades endocrinas.', 'Deficiencias nutricionales', 'Cánceres', 'Lesiones no intencionales', 'Malaria y enfermedades tropicales desatendidas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1228484, 760280, 387694, 358045, 289473, 277391, 264538, 248163, 210820, 206816, 785],
    		  riskFactors: ['Emaciación infantil', 'Fuente de agua insegura', 'Contaminación del aire (exterior e interior)', 'Saneamiento inseguro', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Deficiencia de hierro', 'Obesidad', 'Deficiencia de vitamina A', 'Dieta baja en frutas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [437753, 350590, 319175, 261781, 239801, 227424, 178631, 155356, 155343, 87564, 785] },
    		 {id: 128,
    		  name: "Serbia",
    		  lifeExpectancy: 76.0,
    		  demographics: [868805, 1010416, 1119463, 1216521, 1227265, 1120356, 1161341, 696223, 351838],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Diabetes', 'Nefropatía', 'Suicidio', 'Infecciones respiratorias inferiores', 'Enfermedades del HIGADO', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [67115, 26965, 6512, 4234, 4160, 3445, 2386, 1601, 1512, 1304, 239],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones no intencionales', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Otras ENT', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1002625, 604601, 221677, 185794, 185145, 178140, 132892, 130607, 115168, 91317, 3298],
    		  riskFactors: ['Hipertensión', 'De fumar', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Dieta baja en frutas', 'Humo de segunda mano', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [641143, 638003, 527500, 440815, 249746, 211876, 138216, 126286, 80423, 76754, 3298] },
    		 {id: 129,
    		  name: "Seychelles",
    		  lifeExpectancy: 73.4,
    		  demographics: [15951, 13607, 13698, 14627, 14883, 12766, 7366, 3182, 1661],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Infecciones respiratorias inferiores', 'Enfermedades digestivas', 'Nefropatía', 'Demencia', 'Enfermedades del HIGADO', 'Enfermedades respiratorias', 'Diabetes', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [236, 162, 73, 48, 41, 33, 27, 27, 18, 14, 0],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos musculoesqueléticos', 'Diarrea y enfermedades infecciosas comunes.', 'Otras ENT', 'Desórdenes neurológicos', 'Enfermedades digestivas', 'Trastornos mentales y por abuso de sustancias.', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [5202, 4083, 2520, 1825, 1777, 1498, 1466, 1425, 1409, 1229, 0],
    		  riskFactors: ['Hipertensión', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'De fumar', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Dieta baja en frutas', 'Humo de segunda mano', 'El consumo de drogas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [4112, 3116, 2992, 2506, 1258, 1218, 1076, 653, 462, 422, 0] },
    		 {id: 130,
    		  name: "Singapur",
    		  lifeExpectancy: 83.62,
    		  demographics: [473440, 525276, 841606, 898862, 965359, 946886, 762636, 260127, 130150],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Infecciones respiratorias inferiores', 'Demencia', 'Enfermedades respiratorias', 'Nefropatía', 'Enfermedades digestivas', 'Suicidio', 'Enfermedades del HIGADO', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [6161, 5449, 2696, 1617, 614, 594, 554, 496, 254, 197, 23],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Desórdenes neurológicos', 'Lesiones no intencionales', 'Diabetes, sangre y enfermedades endocrinas.', 'Otras ENT', 'Diarrea y enfermedades infecciosas comunes.', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [131167, 124284, 117699, 96826, 61286, 58107, 49214, 45303, 37425, 28180, 371],
    		  riskFactors: ['Hipertensión', 'Nivel alto de azúcar en la sangre', 'De fumar', 'Obesidad', 'Dieta rica en sal', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'El consumo de drogas', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [70498, 67953, 67867, 60133, 36052, 34968, 31284, 16570, 14955, 10389, 371] },
    		 {id: 131,
    		  name: "Eslovaquia",
    		  lifeExpectancy: 77.54,
    		  demographics: [568394, 542764, 680528, 860773, 843980, 714201, 687712, 380061, 178599],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'Enfermedades del HIGADO', 'Enfermedades respiratorias', 'Diabetes', 'Nefropatía', 'Suicidio', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [25216, 13227, 2992, 2748, 1680, 1527, 1107, 732, 713, 675, 28],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Lesiones no intencionales', 'Desórdenes neurológicos', 'Enfermedades digestivas', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos mentales y por abuso de sustancias.', 'Otras ENT', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [425950, 300811, 144022, 140687, 103170, 94371, 79871, 79683, 61368, 49558, 404],
    		  riskFactors: ['Hipertensión', 'De fumar', 'Obesidad', 'Colesterol alto', 'Nivel alto de azúcar en la sangre', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [272632, 240554, 209249, 151462, 151283, 69635, 68488, 61685, 38061, 31734, 404] },
    		 {id: 132,
    		  name: "Eslovenia",
    		  lifeExpectancy: 81.32,
    		  demographics: [212011, 193037, 211211, 290227, 303945, 302099, 281171, 172426, 112527],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'Enfermedades del HIGADO', 'Suicidio', 'Diabetes', 'Nefropatía', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [7450, 5907, 1534, 1058, 630, 601, 541, 430, 300, 213, 106],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Lesiones no intencionales', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades digestivas', 'Diabetes, sangre y enfermedades endocrinas.', 'Otras ENT', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [114870, 105868, 63618, 56464, 42850, 32756, 29060, 29039, 24407, 21852, 1388],
    		  riskFactors: ['De fumar', 'Hipertensión', 'Obesidad', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Dieta baja en frutas', 'El consumo de drogas', 'Dieta baja en vegetales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [82245, 64747, 60624, 48836, 28166, 19537, 17406, 9380, 9341, 8879, 1388] },
    		 {id: 133,
    		  name: "Somalia",
    		  lifeExpectancy: 57.4,
    		  demographics: [5094110, 3837600, 2580391, 1477525, 1036888, 713771, 450111, 201592, 50918],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Infecciones respiratorias inferiores', 'Tuberculosis', 'Trastornos neonatales', 'Enfermedades diarreicas', 'Cánceres', 'Conflicto', 'Lesiones viales', 'Enfermedades digestivas', 'Deficiencias nutricionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [18048, 13033, 12697, 12265, 10548, 9299, 5445, 5154, 4786, 3435, 67],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'VIH / SIDA y tuberculosis', 'Enfermedades cardiovasculares', 'Deficiencias nutricionales', 'Otras ENT', 'Cánceres', 'Lesiones de transporte', 'Lesiones no intencionales', 'Otras enfermedades transmisibles', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1602542, 1125637, 532931, 506577, 500937, 389547, 329509, 315175, 283153, 241549, 1434],
    		  riskFactors: ['Emaciación infantil', 'Contaminación del aire (exterior e interior)', 'Fuente de agua insegura', 'Deficiencia de vitamina A', 'Saneamiento inseguro', 'Hipertensión', 'Retraso del crecimiento infantil', 'Nivel alto de azúcar en la sangre', 'Lactancia no exclusiva', 'Deficiencia de hierro', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [1406987, 647809, 644927, 524574, 496043, 313258, 304365, 296970, 210379, 188299, 1434] },
    		 {id: 134,
    		  name: "Sudáfrica",
    		  lifeExpectancy: 64.13,
    		  demographics: [11581615, 10240605, 10231760, 9942466, 6845747, 4794113, 3068429, 1430792, 422740],
    		  majorCauses: ['VIH / SIDA', 'Enfermedades cardiovasculares', 'Cánceres', 'Infecciones respiratorias inferiores', 'Diabetes', 'Tuberculosis', 'Enfermedades respiratorias', 'Homicidio', 'Lesiones viales', 'Enfermedades diarreicas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [135399, 76671, 48637, 26529, 22654, 19624, 18132, 15701, 15504, 14302, 524],
    		  diseaseNames: ['VIH / SIDA y tuberculosis', 'Diarrea y enfermedades infecciosas comunes.', 'Enfermedades cardiovasculares', 'Diabetes, sangre y enfermedades endocrinas.', 'Cánceres', 'Trastornos neonatales', 'Trastornos mentales y por abuso de sustancias.', 'Lesiones de transporte', 'Violencia interpersonal', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [10033858, 2145400, 1721968, 1712504, 1275456, 1164989, 864880, 862779, 862716, 779758, 10024],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'De fumar', 'Contaminación del aire (exterior e interior)', 'Emaciación infantil', 'Fuente de agua insegura', 'Dieta baja en frutas', 'El consumo de drogas', 'Colesterol alto', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [1646278, 1454452, 1274406, 960155, 799354, 602865, 505677, 426733, 396322, 344011, 10024] },
    		 {id: 135,
    		  name: "Corea del Sur",
    		  lifeExpectancy: 83.03,
    		  demographics: [4240885, 4886624, 6797905, 7196849, 8330006, 8442921, 6135717, 3444643, 1749770],
    		  majorCauses: ['Cánceres', 'Enfermedades cardiovasculares', 'Demencia', 'Enfermedades digestivas', 'Suicidio', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'Diabetes', 'Enfermedades del HIGADO', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [92548, 66787, 31554, 16084, 15228, 13973, 13444, 11719, 9447, 6643, 269],
    		  diseaseNames: ['Cánceres', 'Trastornos musculoesqueléticos', 'Enfermedades cardiovasculares', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos mentales y por abuso de sustancias.', 'Desórdenes neurológicos', 'Lesiones no intencionales', 'Autolesiones', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1936073, 1435379, 1193979, 898163, 883625, 861525, 659048, 527829, 491707, 453457, 3906],
    		  riskFactors: ['De fumar', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Obesidad', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Colesterol alto', 'Dieta baja en frutas', 'El consumo de drogas', 'Humo de segunda mano', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [1272299, 1121507, 575007, 528944, 422295, 305748, 271902, 206364, 158057, 115893, 3906] },
    		 {id: 136,
    		  name: "España",
    		  lifeExpectancy: 83.56,
    		  demographics: [4340417, 4682339, 4652133, 6158281, 7935505, 6944643, 5200462, 3921750, 2901252],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'Nefropatía', 'Diabetes', 'Enfermedades del HIGADO', 'Enfermedad de Parkinson'],
    		  majorDeaths: [123577, 115657, 51759, 33490, 21593, 12941, 10605, 8292, 8132, 5808],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades respiratorias', 'Lesiones no intencionales', 'Otras ENT', 'Enfermedades digestivas'],
    		  diseaseDALYs: [2182632, 1682048, 1265974, 1243119, 950283, 660386, 588589, 549012, 475533, 448367],
    		  riskFactors: ['De fumar', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Obesidad', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'El consumo de drogas', 'Baja actividad física', 'Humo de segunda mano'],
    		  riskDALYs: [1544708, 985420, 979221, 949682, 385742, 295600, 163174, 156687, 135357, 120071] },
    		 {id: 137,
    		  name: "Sri Lanka",
    		  lifeExpectancy: 76.98,
    		  demographics: [3383992, 3369304, 2906780, 2883558, 2848798, 2533919, 1966154, 1080639, 350590],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades respiratorias', 'Diabetes', 'Demencia', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'Suicidio', 'Nefropatía', 'Enfermedades del HIGADO', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [41867, 16628, 12267, 11537, 5971, 5246, 4986, 4523, 4512, 4021, 10],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Diabetes, sangre y enfermedades endocrinas.', 'Cánceres', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades respiratorias', 'Desórdenes neurológicos', 'Otras ENT', 'Diarrea y enfermedades infecciosas comunes.', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [880238, 528668, 417142, 363658, 323956, 317010, 296913, 243702, 217443, 207042, 160],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Hipertensión', 'Obesidad', 'De fumar', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Dieta rica en sal', 'Dieta baja en vegetales', 'Humo de segunda mano', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [776768, 569841, 392912, 342663, 285535, 251275, 189307, 182848, 122999, 85925, 160] },
    		 {id: 138,
    		  name: "Sudán",
    		  lifeExpectancy: 65.31,
    		  demographics: [11957900, 9925896, 7382380, 5059889, 3624817, 2465268, 1480214, 702966, 213907],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Trastornos neonatales', 'Cánceres', 'Lesiones viales', 'Infecciones respiratorias inferiores', 'Enfermedades diarreicas', 'Enfermedades respiratorias', 'VIH / SIDA', 'Enfermedades digestivas', 'Demencia', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [69012, 25224, 15171, 10692, 9402, 8236, 5902, 5296, 5148, 4396, 170],
    		  diseaseNames: ['Trastornos neonatales', 'Otras ENT', 'Enfermedades cardiovasculares', 'Diarrea y enfermedades infecciosas comunes.', 'Lesiones de transporte', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos mentales y por abuso de sustancias.', 'Lesiones no intencionales', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [2412123, 1787062, 1725565, 1342405, 726662, 718901, 647654, 608911, 559545, 487047, 3446],
    		  riskFactors: ['Hipertensión', 'Emaciación infantil', 'Obesidad', 'Contaminación del aire (exterior e interior)', 'Fuente de agua insegura', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'Saneamiento inseguro', 'Dieta baja en frutas', 'Deficiencia de hierro', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [1049467, 1019444, 733013, 703277, 649044, 624608, 517119, 512310, 304955, 281543, 3446] },
    		 {id: 139,
    		  name: "Surinam",
    		  lifeExpectancy: 71.68,
    		  demographics: [104982, 101957, 95327, 81591, 72819, 63673, 35048, 18175, 7791],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades digestivas', 'Diabetes', 'Nefropatía', 'Infecciones respiratorias inferiores', 'Demencia', 'Suicidio', 'Trastornos neonatales', 'Enfermedades del HIGADO', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [1396, 666, 243, 226, 209, 182, 170, 147, 144, 124, 1],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Diabetes, sangre y enfermedades endocrinas.', 'Cánceres', 'Trastornos neonatales', 'Trastornos mentales y por abuso de sustancias.', 'Otras ENT', 'Diarrea y enfermedades infecciosas comunes.', 'Desórdenes neurológicos', 'Trastornos musculoesqueléticos', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [30501, 17214, 16906, 14702, 10533, 9951, 9783, 9038, 8792, 7928, 17],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'De fumar', 'Contaminación del aire (exterior e interior)', 'Colesterol alto', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'El consumo de drogas', 'Humo de segunda mano', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [22098, 21406, 17697, 13435, 7920, 6442, 4554, 4009, 2483, 2435, 17] },
    		 {id: 140,
    		  name: "Suazilandia",
    		  lifeExpectancy: 60.19,
    		  demographics: [288502, 273125, 212361, 158383, 99646, 50414, 36433, 22204, 7065],
    		  majorCauses: ['VIH / SIDA', 'Enfermedades cardiovasculares', 'Cánceres', 'Infecciones respiratorias inferiores', 'Diabetes', 'Enfermedades diarreicas', 'Tuberculosis', 'Lesiones viales', 'Trastornos neonatales', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [2506, 1465, 844, 674, 584, 545, 521, 371, 360, 324, 2],
    		  diseaseNames: ['VIH / SIDA y tuberculosis', 'Diarrea y enfermedades infecciosas comunes.', 'Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades cardiovasculares', 'Trastornos neonatales', 'Cánceres', 'Lesiones de transporte', 'Lesiones no intencionales', 'Otras ENT', 'Violencia interpersonal', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [277199, 120264, 39005, 38330, 36491, 26189, 23874, 18538, 16601, 16543, 39],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Obesidad', 'Fuente de agua insegura', 'Hipertensión', 'Emaciación infantil', 'Contaminación del aire (exterior e interior)', 'Saneamiento inseguro', 'De fumar', 'El consumo de drogas', 'Deficiencia de vitamina A', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [44001, 35825, 29513, 27107, 24991, 22925, 21591, 15768, 8741, 8128, 39] },
    		 {id: 141,
    		  name: "Suecia",
    		  lifeExpectancy: 82.8,
    		  demographics: [1191245, 1106232, 1304961, 1289302, 1277210, 1280608, 1097278, 967449, 522106],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'Diabetes', 'Nefropatía', 'Suicidio', 'Enfermedad de Parkinson'],
    		  majorDeaths: [34164, 24053, 9660, 4518, 4125, 3034, 2903, 1722, 1461, 1395, 1213],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones no intencionales', 'Enfermedades respiratorias', 'Otras ENT', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [446549, 436415, 277268, 240709, 211399, 139367, 139276, 136083, 110778, 73435, 52985],
    		  riskFactors: ['De fumar', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Obesidad', 'Colesterol alto', 'COVID-19 hasta el 27 de mayo de 2020', 'Dieta rica en sal', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'El consumo de drogas', 'Baja actividad física'],
    		  riskDALYs: [284244, 257193, 248332, 202521, 123616, 52985, 45905, 41439, 40058, 39436, 38229] },
    		 {id: 142,
    		  name: "Suiza",
    		  lifeExpectancy: 83.78,
    		  demographics: [875799, 835663, 1047321, 1211148, 1177086, 1309842, 953874, 731996, 448632],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'COVID-19 hasta el 27 de mayo de 2020', 'Nefropatía', 'Suicidio', 'Diabetes', 'Enfermedades del HIGADO'],
    		  majorDeaths: [21280, 17882, 7597, 2816, 2641, 1697, 1647, 1558, 1133, 1123, 940],
    		  diseaseNames: ['Cánceres', 'Trastornos musculoesqueléticos', 'Enfermedades cardiovasculares', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Lesiones no intencionales', 'Diabetes, sangre y enfermedades endocrinas.', 'Otras ENT', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [337817, 307335, 263828, 185793, 166939, 115288, 104830, 91308, 86577, 60915, 21509],
    		  riskFactors: ['De fumar', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'El consumo de drogas', 'Dieta rica en sal', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [242301, 180978, 138338, 135271, 84308, 47268, 32555, 30843, 25405, 23257, 21509] },
    		 {id: 143,
    		  name: "Siria",
    		  lifeExpectancy: 72.7,
    		  demographics: [3569815, 3299311, 3073670, 2832030, 1819810, 1234238, 769970, 334158, 137130],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Conflicto', 'Cánceres', 'Demencia', 'Enfermedades respiratorias', 'Nefropatía', 'Enfermedades digestivas', 'Terrorismo', 'Infecciones respiratorias inferiores', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [41380, 41378, 8795, 3157, 2994, 2257, 2139, 2026, 1946, 1748, 4],
    		  diseaseNames: ['Conflicto y terrorismo', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Cánceres', 'Otras ENT', 'Desórdenes neurológicos', 'Diarrea y enfermedades infecciosas comunes.', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [3450747, 966983, 302387, 301942, 252434, 252051, 237494, 235115, 169355, 164278, 77],
    		  riskFactors: ['Hipertensión', 'Obesidad', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'De fumar', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'El consumo de drogas', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [568413, 461284, 369488, 308024, 302142, 225934, 164138, 128383, 106175, 89597, 77] },
    		 {id: 144,
    		  name: "Taiwán",
    		  lifeExpectancy: 80.46,
    		  demographics: [2037909, 2275933, 3158514, 3637865, 3739295, 3676703, 2995888, 1399598, 852176],
    		  majorCauses: ['Cánceres', 'Enfermedades cardiovasculares', 'Infecciones respiratorias inferiores', 'Demencia', 'Enfermedades digestivas', 'Diabetes', 'Enfermedades respiratorias', 'Nefropatía', 'Enfermedades del HIGADO', 'Suicidio', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [53165, 40528, 13115, 12814, 10313, 9522, 9474, 6743, 6510, 4355, 7],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos musculoesqueléticos', 'Enfermedades respiratorias', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades digestivas', 'Otras ENT', 'Lesiones de transporte', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1180273, 799276, 675740, 496956, 391306, 372657, 354883, 287510, 263068, 203754, 101],
    		  riskFactors: ['De fumar', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'Contaminación del aire (exterior e interior)', 'Colesterol alto', 'El consumo de drogas', 'Humo de segunda mano', 'Dieta rica en sal', 'Dieta baja en frutas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [717421, 668199, 554479, 456764, 301189, 196544, 159397, 118790, 116679, 111020, 101] },
    		 {id: 145,
    		  name: "Tayikistán",
    		  lifeExpectancy: 71.1,
    		  demographics: [2521647, 1740863, 1656860, 1336885, 861056, 686415, 358651, 111823, 46823],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Infecciones respiratorias inferiores', 'Cánceres', 'Trastornos neonatales', 'Enfermedades digestivas', 'Enfermedades diarreicas', 'Enfermedades del HIGADO', 'Enfermedades respiratorias', 'Diabetes', 'Demencia', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [18269, 4902, 4721, 3672, 2157, 1783, 1536, 1464, 1323, 1289, 46],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Enfermedades cardiovasculares', 'Trastornos neonatales', 'Otras ENT', 'Lesiones no intencionales', 'Cánceres', 'Desórdenes neurológicos', 'Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades digestivas', 'Trastornos mentales y por abuso de sustancias.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [465754, 410475, 358569, 211958, 172689, 156895, 126736, 112026, 108010, 104828, 978],
    		  riskFactors: ['Emaciación infantil', 'Hipertensión', 'Contaminación del aire (exterior e interior)', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'De fumar', 'Colesterol alto', 'Fuente de agua insegura', 'Dieta baja en frutas', 'Saneamiento inseguro', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [324745, 259292, 240715, 228221, 143717, 126773, 104585, 103889, 93823, 93502, 978] },
    		 {id: 146,
    		  name: "Tanzania",
    		  lifeExpectancy: 65.46,
    		  demographics: [17990384, 13636144, 9575102, 6938129, 4635689, 2803032, 1556334, 710015, 160632],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Trastornos neonatales', 'Infecciones respiratorias inferiores', 'VIH / SIDA', 'Cánceres', 'Tuberculosis', 'Malaria', 'Enfermedades diarreicas', 'Enfermedades digestivas', 'Diabetes', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [44175, 34523, 33486, 28299, 27864, 20391, 15325, 15196, 12862, 7084, 21],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'VIH / SIDA y tuberculosis', 'Otras ENT', 'Malaria y enfermedades tropicales desatendidas', 'Enfermedades cardiovasculares', 'Deficiencias nutricionales', 'Cánceres', 'Lesiones no intencionales', 'Diabetes, sangre y enfermedades endocrinas.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [4552138, 3263525, 3045845, 2349773, 1408015, 1071877, 1055921, 930207, 781168, 744072, 470],
    		  riskFactors: ['Emaciación infantil', 'Contaminación del aire (exterior e interior)', 'Hipertensión', 'Fuente de agua insegura', 'Nivel alto de azúcar en la sangre', 'Saneamiento inseguro', 'Deficiencia de hierro', 'De fumar', 'Obesidad', 'Deficiencia de vitamina A', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [1593860, 1303846, 708742, 677911, 596951, 509350, 490643, 425930, 416383, 366069, 470] },
    		 {id: 147,
    		  name: "Tailandia",
    		  lifeExpectancy: 77.15,
    		  demographics: [7548496, 8629471, 9617196, 9351071, 11070365, 10557509, 7301625, 3702813, 1847035],
    		  majorCauses: ['Cánceres', 'Enfermedades cardiovasculares', 'Infecciones respiratorias inferiores', 'Demencia', 'Enfermedades digestivas', 'Nefropatía', 'Enfermedades respiratorias', 'VIH / SIDA', 'Lesiones viales', 'Enfermedades del HIGADO', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [102596, 102583, 36188, 31550, 27266, 21922, 19813, 19372, 19183, 17239, 57],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Diabetes, sangre y enfermedades endocrinas.', 'Desórdenes neurológicos', 'Lesiones de transporte', 'Trastornos mentales y por abuso de sustancias.', 'Diarrea y enfermedades infecciosas comunes.', 'Enfermedades digestivas', 'Otras ENT', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [2520200, 2359442, 1629403, 1474520, 1151289, 1131258, 1102666, 1030793, 842762, 795653, 867],
    		  riskFactors: ['Obesidad', 'Nivel alto de azúcar en la sangre', 'De fumar', 'Hipertensión', 'Contaminación del aire (exterior e interior)', 'Colesterol alto', 'El consumo de drogas', 'Dieta rica en sal', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [1544002, 1503953, 1495743, 1392361, 817709, 595479, 522351, 480904, 337081, 334390, 867] },
    		 {id: 148,
    		  name: "Togo",
    		  lifeExpectancy: 61.04,
    		  demographics: [2311118, 1866015, 1338976, 1041497, 716177, 432524, 246902, 107658, 21492],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Malaria', 'Trastornos neonatales', 'VIH / SIDA', 'Infecciones respiratorias inferiores', 'Cánceres', 'Enfermedades diarreicas', 'Tuberculosis', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [7581, 6904, 4066, 3875, 3742, 3619, 3202, 2349, 1728, 1294, 13],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'Malaria y enfermedades tropicales desatendidas', 'Trastornos neonatales', 'VIH / SIDA y tuberculosis', 'Enfermedades cardiovasculares', 'Otras ENT', 'Diabetes, sangre y enfermedades endocrinas.', 'Deficiencias nutricionales', 'Cánceres', 'Trastornos mentales y por abuso de sustancias.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [537846, 508891, 393410, 341328, 204478, 196801, 129842, 113892, 110100, 95415, 290],
    		  riskFactors: ['Emaciación infantil', 'Fuente de agua insegura', 'Contaminación del aire (exterior e interior)', 'Saneamiento inseguro', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Deficiencia de vitamina A', 'Obesidad', 'Deficiencia de hierro', 'Dieta baja en frutas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [220449, 185196, 160336, 135929, 134583, 94600, 76138, 68658, 58437, 51784, 290] },
    		 {id: 149,
    		  name: "Tonga",
    		  lifeExpectancy: 70.91,
    		  demographics: [24631, 23270, 16616, 12190, 10251, 8452, 5150, 2759, 1178],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Diabetes', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Nefropatía', 'Infecciones respiratorias inferiores', 'Demencia', 'Enfermedades del HIGADO', 'Trastornos neonatales'],
    		  majorDeaths: [168, 130, 89, 42, 40, 38, 37, 30, 20, 15],
    		  diseaseNames: ['Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades cardiovasculares', 'Cánceres', 'Diarrea y enfermedades infecciosas comunes.', 'Enfermedades respiratorias', 'Trastornos musculoesqueléticos', 'Trastornos neonatales', 'Lesiones no intencionales', 'Otras ENT', 'Trastornos mentales y por abuso de sustancias.'],
    		  diseaseDALYs: [4546, 3934, 3332, 2361, 1709, 1669, 1572, 1366, 1351, 1273],
    		  riskFactors: ['Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'De fumar', 'Contaminación del aire (exterior e interior)', 'Colesterol alto', 'Dieta baja en frutas', 'Humo de segunda mano', 'Dieta rica en sal', 'Dieta baja en vegetales'],
    		  riskDALYs: [5164, 4209, 2848, 2083, 1566, 1338, 887, 702, 638, 590] },
    		 {id: 150,
    		  name: "Túnez",
    		  lifeExpectancy: 76.7,
    		  demographics: [2003420, 1617133, 1752255, 1915913, 1535771, 1342758, 920265, 405873, 201331],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Lesiones viales', 'Enfermedades respiratorias', 'Diabetes', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'Nefropatía', 'Enfermedades del HIGADO', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [34122, 9409, 3940, 3669, 2497, 1934, 1776, 1650, 1645, 1001, 48],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos musculoesqueléticos', 'Cánceres', 'Trastornos mentales y por abuso de sustancias.', 'Desórdenes neurológicos', 'Lesiones de transporte', 'Otras ENT', 'Trastornos neonatales', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [585199, 248559, 245020, 222652, 214692, 184184, 167150, 140000, 121829, 113084, 792],
    		  riskFactors: ['Hipertensión', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'De fumar', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'El consumo de drogas', 'Dieta baja en frutas', 'Humo de segunda mano', 'Baja actividad física', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [340549, 294028, 293805, 263027, 156922, 137558, 97722, 75056, 53044, 46210, 792] },
    		 {id: 151,
    		  name: "Turquía",
    		  lifeExpectancy: 77.69,
    		  demographics: [13501499, 13585939, 13087611, 12748548, 11221844, 8664742, 5968559, 3216491, 1434374],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades respiratorias', 'Demencia', 'Nefropatía', 'Diabetes', 'Infecciones respiratorias inferiores', 'Enfermedades digestivas', 'Lesiones viales', 'Trastornos neonatales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [146584, 92760, 30377, 25063, 15153, 14803, 11029, 10147, 8604, 7759, 4397],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos mentales y por abuso de sustancias.', 'Otras ENT', 'Desórdenes neurológicos', 'Enfermedades respiratorias', 'Trastornos neonatales', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [2919631, 2354596, 1872089, 1592440, 1393202, 1299523, 1292062, 1093030, 967562, 663606, 71536],
    		  riskFactors: ['De fumar', 'Obesidad', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Contaminación del aire (exterior e interior)', 'Colesterol alto', 'El consumo de drogas', 'Humo de segunda mano', 'Baja actividad física', 'Dieta baja en frutas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [2226441, 2042748, 1847649, 1636498, 1052115, 748929, 537754, 318850, 250390, 233411, 71536] },
    		 {id: 152,
    		  name: "Turkmenistán",
    		  lifeExpectancy: 68.19,
    		  demographics: [1319649, 986539, 1030876, 931108, 681290, 527222, 315752, 97685, 51973],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades digestivas', 'Enfermedades del HIGADO', 'Infecciones respiratorias inferiores', 'Trastornos neonatales', 'Demencia', 'Diabetes', 'Nefropatía', 'Tuberculosis'],
    		  majorDeaths: [17557, 3525, 2714, 2341, 1206, 1119, 1085, 699, 632, 515],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Enfermedades digestivas', 'Cánceres', 'Otras ENT', 'Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades del HIGADO', 'Lesiones no intencionales', 'Desórdenes neurológicos'],
    		  diseaseDALYs: [412359, 156211, 117894, 116563, 109893, 98719, 98581, 90861, 82484, 66974],
    		  riskFactors: ['Hipertensión', 'Obesidad', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'De fumar', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Dieta rica en sal', 'Emaciación infantil', 'Humo de segunda mano'],
    		  riskDALYs: [261803, 192851, 190537, 127973, 124986, 79461, 71543, 58734, 39112, 37650] },
    		 {id: 153,
    		  name: "Uganda",
    		  lifeExpectancy: 63.37,
    		  demographics: [14582039, 11067913, 7564888, 4881270, 2997016, 1765499, 930221, 391414, 89327],
    		  majorCauses: ['Trastornos neonatales', 'VIH / SIDA', 'Enfermedades cardiovasculares', 'Malaria', 'Cánceres', 'Infecciones respiratorias inferiores', 'Tuberculosis', 'Enfermedades diarreicas', 'Enfermedades digestivas', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [26523, 25920, 22888, 22237, 20659, 14831, 14181, 11833, 8742, 5826, 0],
    		  diseaseNames: ['Diarrea y enfermedades infecciosas comunes.', 'VIH / SIDA y tuberculosis', 'Trastornos neonatales', 'Malaria y enfermedades tropicales desatendidas', 'Otras ENT', 'Cánceres', 'Otras enfermedades transmisibles', 'Deficiencias nutricionales', 'Enfermedades cardiovasculares', 'Trastornos mentales y por abuso de sustancias.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [3490823, 3014071, 2525060, 1935911, 1064399, 733907, 669265, 596318, 591241, 543171, 0],
    		  riskFactors: ['Emaciación infantil', 'Fuente de agua insegura', 'Contaminación del aire (exterior e interior)', 'Saneamiento inseguro', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Deficiencia de vitamina A', 'Deficiencia de hierro', 'De fumar', 'Obesidad', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [862388, 642771, 631450, 504195, 368985, 360544, 304798, 239348, 179745, 179650, 0] },
    		 {id: 154,
    		  name: "Ucrania",
    		  lifeExpectancy: 72.06,
    		  demographics: [4688013, 4279672, 5165651, 7259196, 6313137, 6006155, 5470675, 2961499, 1849645],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades digestivas', 'Enfermedades del HIGADO', 'Suicidio', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'Trastornos por consumo de alcohol.', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [427321, 96034, 34913, 30537, 20083, 13679, 11366, 9215, 8270, 6681, 644],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades digestivas', 'Lesiones no intencionales', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Enfermedades del HIGADO', 'Trastornos mentales y por abuso de sustancias.', 'Otras ENT', 'Autolesiones', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [7982965, 2712757, 1323796, 1323359, 1163398, 1059750, 816301, 778737, 677804, 651836, 8904],
    		  riskFactors: ['Hipertensión', 'De fumar', 'Obesidad', 'Colesterol alto', 'Nivel alto de azúcar en la sangre', 'Dieta baja en frutas', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Baja actividad física', 'El consumo de drogas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [5022720, 3420787, 2728117, 2680474, 2115808, 1322553, 1176016, 772782, 738698, 510646, 8904] },
    		 {id: 155,
    		  name: "Emiratos Árabes Unidos",
    		  lifeExpectancy: 77.97,
    		  demographics: [1006422, 835037, 2150663, 3072012, 1655625, 777310, 209301, 52385, 11771],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Lesiones viales', 'Enfermedades respiratorias', 'Diabetes', 'Nefropatía', 'Trastornos por consumo de drogas.', 'Suicidio', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [7347, 5107, 3649, 1554, 1145, 829, 629, 599, 589, 586, 253],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Lesiones de transporte', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos mentales y por abuso de sustancias.', 'Cánceres', 'Lesiones no intencionales', 'Desórdenes neurológicos', 'Enfermedades respiratorias', 'Otras ENT', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [244834, 208816, 191799, 179512, 178787, 172241, 136126, 124005, 118059, 108280, 7365],
    		  riskFactors: ['Obesidad', 'El consumo de drogas', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'Colesterol alto', 'De fumar', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'Dieta rica en sal', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [250177, 220805, 177587, 159731, 151202, 116323, 92221, 46473, 33179, 30313, 7365] },
    		 {id: 156,
    		  name: "Reino Unido",
    		  lifeExpectancy: 81.32,
    		  demographics: [8065283, 7569160, 8630614, 9203569, 8624679, 9138365, 7206475, 5673457, 3418559],
    		  majorCauses: ['Cánceres', 'Enfermedades cardiovasculares', 'Demencia', 'Enfermedades respiratorias', 'COVID-19 hasta el 27 de mayo de 2020', 'Infecciones respiratorias inferiores', 'Enfermedades digestivas', 'Enfermedades del HIGADO', 'Enfermedad de Parkinson', 'Nefropatía', 'Suicidio'],
    		  majorDeaths: [179856, 176516, 63894, 47298, 37048, 36952, 29640, 9258, 7334, 6766, 5778],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Desórdenes neurológicos', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades respiratorias', 'Otras ENT', 'Lesiones no intencionales', 'Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [3323621, 2620719, 2099648, 1589106, 1296572, 1217869, 789427, 782490, 740272, 738202, 481718],
    		  riskFactors: ['De fumar', 'Obesidad', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'COVID-19 hasta el 27 de mayo de 2020', 'Contaminación del aire (exterior e interior)', 'El consumo de drogas', 'Dieta baja en frutas', 'Baja actividad física', 'Dieta baja en vegetales'],
    		  riskDALYs: [2021182, 1448311, 1337544, 1293288, 752234, 481718, 480135, 424409, 362994, 219675, 219262] },
    		 {id: 157,
    		  name: "Estados Unidos",
    		  lifeExpectancy: 78.86,
    		  demographics: [39891845, 42398071, 46179065, 43980069, 40288440, 42557686, 37845098, 23009234, 12915409],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020', 'Infecciones respiratorias inferiores', 'Nefropatía', 'Diabetes', 'Trastornos por consumo de drogas.', 'Enfermedades del HIGADO'],
    		  majorDeaths: [902270, 699394, 258587, 196983, 114419, 98916, 93792, 84944, 68558, 67629, 62493],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos mentales y por abuso de sustancias.', 'Desórdenes neurológicos', 'Enfermedades respiratorias', 'Otras ENT', 'Lesiones no intencionales', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [15273136, 14368167, 9550395, 7190242, 7176630, 6691294, 5887644, 3992949, 3787971, 3546678, 1363568],
    		  riskFactors: ['Obesidad', 'De fumar', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'El consumo de drogas', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Dieta baja en frutas', 'COVID-19 hasta el 27 de mayo de 2020', 'Dieta baja en vegetales'],
    		  riskDALYs: [11440537, 10405127, 9566522, 7850854, 6465949, 4010823, 2432143, 1978011, 1966068, 1363568, 1249128] },
    		 {id: 158,
    		  name: "Uruguay",
    		  lifeExpectancy: 77.91,
    		  demographics: [473133, 483284, 512458, 458714, 451252, 390115, 321685, 216752, 154338],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Demencia', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'Enfermedades digestivas', 'Diabetes', 'Nefropatía', 'Suicidio', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [9912, 9576, 2363, 2065, 1476, 1455, 796, 787, 676, 609, 22],
    		  diseaseNames: ['Cánceres', 'Enfermedades cardiovasculares', 'Trastornos musculoesqueléticos', 'Trastornos mentales y por abuso de sustancias.', 'Desórdenes neurológicos', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones no intencionales', 'Enfermedades respiratorias', 'Otras ENT', 'Enfermedades digestivas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [191969, 155889, 81966, 64215, 59439, 57322, 54943, 48981, 48284, 34011, 292],
    		  riskFactors: ['De fumar', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Hipertensión', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta rica en sal', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'El consumo de drogas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [122819, 102193, 92697, 90942, 35618, 25552, 24250, 22019, 16300, 16013, 292] },
    		 {id: 159,
    		  name: "Uzbekistán",
    		  lifeExpectancy: 71.72,
    		  demographics: [6664494, 5370904, 6061979, 5409605, 3820670, 3028065, 1810321, 546389, 269288],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades digestivas', 'Enfermedades del HIGADO', 'Infecciones respiratorias inferiores', 'Diabetes', 'Trastornos neonatales', 'Demencia', 'Enfermedades respiratorias', 'Lesiones viales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [115263, 19020, 12837, 10974, 9749, 6468, 5348, 4578, 4239, 3990, 14],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Diarrea y enfermedades infecciosas comunes.', 'Cánceres', 'Trastornos neonatales', 'Diabetes, sangre y enfermedades endocrinas.', 'Enfermedades digestivas', 'Lesiones no intencionales', 'Desórdenes neurológicos', 'Otras ENT', 'Trastornos musculoesqueléticos', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [2443175, 886397, 597123, 595292, 558138, 526686, 503123, 443174, 434858, 410622, 275],
    		  riskFactors: ['Hipertensión', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'De fumar', 'Dieta baja en frutas', 'Dieta rica en sal', 'Emaciación infantil', 'Deficiencia de hierro', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [1496057, 1280895, 1076363, 745685, 642961, 621056, 458090, 302480, 258512, 232779, 275] },
    		 {id: 160,
    		  name: "Vanuatu",
    		  lifeExpectancy: 70.47,
    		  demographics: [80126, 64634, 50207, 39556, 28333, 19760, 10910, 4727, 1629],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Infecciones respiratorias inferiores', 'Diabetes', 'Trastornos neonatales', 'Nefropatía', 'Enfermedades del HIGADO', 'Lesiones viales'],
    		  majorDeaths: [797, 274, 146, 130, 120, 94, 87, 67, 59, 52],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Diarrea y enfermedades infecciosas comunes.', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos neonatales', 'Cánceres', 'Enfermedades respiratorias', 'Otras ENT', 'Lesiones no intencionales', 'Enfermedades digestivas', 'Trastornos musculoesqueléticos'],
    		  diseaseDALYs: [22223, 12105, 10112, 8331, 8231, 6302, 6104, 5833, 4745, 3980],
    		  riskFactors: ['Hipertensión', 'Nivel alto de azúcar en la sangre', 'Obesidad', 'Contaminación del aire (exterior e interior)', 'Colesterol alto', 'De fumar', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'Emaciación infantil', 'Dieta rica en sal'],
    		  riskDALYs: [14567, 13135, 10947, 8110, 7425, 7106, 4631, 3783, 3261, 2428] },
    		 {id: 161,
    		  name: "Venezuela",
    		  lifeExpectancy: 72.06,
    		  demographics: [5161179, 5131622, 4293108, 4112119, 3551367, 2964615, 1955306, 946456, 400056],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Homicidio', 'Diabetes', 'Nefropatía', 'Lesiones viales', 'Demencia', 'Enfermedades digestivas', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [52708, 30238, 14760, 8670, 8403, 6988, 6898, 6881, 5694, 5184, 11],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Violencia interpersonal', 'Cánceres', 'Diabetes, sangre y enfermedades endocrinas.', 'Trastornos neonatales', 'Trastornos mentales y por abuso de sustancias.', 'Otras ENT', 'Desórdenes neurológicos', 'Lesiones de transporte', 'Trastornos musculoesqueléticos', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1039079, 868219, 779521, 639505, 499148, 436324, 413955, 410885, 409658, 399136, 186],
    		  riskFactors: ['Obesidad', 'Hipertensión', 'Nivel alto de azúcar en la sangre', 'De fumar', 'Colesterol alto', 'Contaminación del aire (exterior e interior)', 'Dieta baja en frutas', 'Dieta baja en vegetales', 'Dieta rica en sal', 'El consumo de drogas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [762035, 749717, 686646, 426608, 301614, 252091, 161369, 145538, 118144, 113563, 186] },
    		 {id: 162,
    		  name: "Vietnam",
    		  lifeExpectancy: 75.4,
    		  demographics: [15416497, 13451055, 15886425, 15977005, 13383787, 10911362, 6922468, 2640054, 1873454],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Demencia', 'Diabetes', 'Enfermedades del HIGADO', 'Lesiones viales', 'Infecciones respiratorias inferiores', 'Tuberculosis', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [201137, 120617, 35946, 29614, 28274, 23439, 22607, 21431, 18137, 17594, 0],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Trastornos musculoesqueléticos', 'Diabetes, sangre y enfermedades endocrinas.', 'Desórdenes neurológicos', 'Otras ENT', 'Lesiones no intencionales', 'Lesiones de transporte', 'Trastornos mentales y por abuso de sustancias.', 'Diarrea y enfermedades infecciosas comunes.', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [4127692, 3149728, 1682582, 1573487, 1329423, 1253509, 1236854, 1231032, 1208151, 1133110, 0],
    		  riskFactors: ['Hipertensión', 'Nivel alto de azúcar en la sangre', 'De fumar', 'Contaminación del aire (exterior e interior)', 'Obesidad', 'Dieta baja en frutas', 'Colesterol alto', 'Dieta rica en sal', 'El consumo de drogas', 'Humo de segunda mano', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [2694716, 2423017, 2329745, 1363548, 953163, 929387, 794256, 787186, 650700, 441172, 0] },
    		 {id: 163,
    		  name: "Mundo",
    		  lifeExpectancy: 72.58,
    		  demographics: [1339127564, 1244883537, 1194975548, 1132908777, 967210641, 816097736, 575804788, 299355359, 143104251],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Cánceres', 'Enfermedades respiratorias', 'Infecciones respiratorias inferiores', 'Demencia', 'Enfermedades digestivas', 'Trastornos neonatales', 'Enfermedades diarreicas', 'Diabetes', 'Enfermedades del HIGADO', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [17790949, 9556245, 3914196, 2558606, 2514619, 2377685, 1783770, 1569556, 1369849, 1322868, 350212],
    		  diseaseNames: ['Enfermedades cardiovasculares', 'Cánceres', 'Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Trastornos musculoesqueléticos', 'Diabetes, sangre y enfermedades endocrinas.', 'Otras ENT', 'Trastornos mentales y por abuso de sustancias.', 'Enfermedades respiratorias', 'Desórdenes neurológicos', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [362381389, 230815088, 229961383, 191193185, 136350616, 133747830, 123452995, 121240264, 111041442, 109462440, 5601995],
    		  riskFactors: ['Hipertensión', 'De fumar', 'Nivel alto de azúcar en la sangre', 'Contaminación del aire (exterior e interior)', 'Obesidad', 'Emaciación infantil', 'Colesterol alto', 'Dieta rica en sal', 'Dieta baja en frutas', 'Fuente de agua insegura', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [215645558, 182157003, 167407681, 148834208, 144091083, 95632517, 93844026, 69981368, 64856023, 64282494, 5601995] },
    		 {id: 164,
    		  name: "Yemen",
    		  lifeExpectancy: 66.12,
    		  demographics: [7957248, 6628518, 5663615, 3953524, 2239232, 1382738, 848627, 387468, 100952],
    		  majorCauses: ['Enfermedades cardiovasculares', 'Trastornos neonatales', 'Conflicto', 'Cánceres', 'Lesiones viales', 'Enfermedades diarreicas', 'Infecciones respiratorias inferiores', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Demencia', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [53367, 18040, 16811, 11942, 9556, 8125, 6366, 4968, 3490, 2672, 49],
    		  diseaseNames: ['Trastornos neonatales', 'Enfermedades cardiovasculares', 'Diarrea y enfermedades infecciosas comunes.', 'Conflicto y terrorismo', 'Otras ENT', 'Deficiencias nutricionales', 'Lesiones de transporte', 'Trastornos mentales y por abuso de sustancias.', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [1718808, 1355173, 1178751, 1006373, 896708, 855459, 598635, 485971, 459085, 415361, 1077],
    		  riskFactors: ['Emaciación infantil', 'Hipertensión', 'Deficiencia de hierro', 'Fuente de agua insegura', 'Obesidad', 'Contaminación del aire (exterior e interior)', 'Nivel alto de azúcar en la sangre', 'Colesterol alto', 'De fumar', 'Deficiencia de vitamina A', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [831197, 701666, 686920, 546393, 459939, 459135, 435825, 422401, 370118, 365007, 1077] },
    		 {id: 165,
    		  name: "Zambia",
    		  lifeExpectancy: 63.89,
    		  demographics: [5569170, 4426210, 3069086, 2117552, 1347824, 726745, 386102, 173103, 45242],
    		  majorCauses: ['VIH / SIDA', 'Enfermedades cardiovasculares', 'Trastornos neonatales', 'Infecciones respiratorias inferiores', 'Cánceres', 'Tuberculosis', 'Enfermedades diarreicas', 'Enfermedades digestivas', 'Malaria', 'Enfermedades del HIGADO', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [21807, 12157, 9688, 8979, 8826, 8307, 7748, 5040, 4673, 3257, 7],
    		  diseaseNames: ['VIH / SIDA y tuberculosis', 'Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Otras ENT', 'Malaria y enfermedades tropicales desatendidas', 'Deficiencias nutricionales', 'Enfermedades cardiovasculares', 'Cánceres', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones no intencionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [2030052, 1707416, 900812, 502967, 391788, 334898, 319041, 302693, 253262, 234132, 164],
    		  riskFactors: ['Emaciación infantil', 'Fuente de agua insegura', 'Contaminación del aire (exterior e interior)', 'Saneamiento inseguro', 'Nivel alto de azúcar en la sangre', 'Deficiencia de vitamina A', 'Hipertensión', 'Retraso del crecimiento infantil', 'De fumar', 'Obesidad', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [631163, 411032, 344582, 309455, 221962, 182199, 176329, 130440, 126593, 118268, 164] },
    		 {id: 166,
    		  name: "Zimbabue",
    		  lifeExpectancy: 61.49,
    		  demographics: [4312155, 3456516, 2462905, 1862792, 1205778, 674792, 410758, 196977, 62799],
    		  majorCauses: ['Enfermedades cardiovasculares', 'VIH / SIDA', 'Infecciones respiratorias inferiores', 'Tuberculosis', 'Cánceres', 'Trastornos neonatales', 'Enfermedades diarreicas', 'Enfermedades respiratorias', 'Enfermedades digestivas', 'Deficiencias nutricionales', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  majorDeaths: [16977, 16065, 12370, 11958, 11440, 8412, 4603, 3412, 3387, 3158, 4],
    		  diseaseNames: ['VIH / SIDA y tuberculosis', 'Diarrea y enfermedades infecciosas comunes.', 'Trastornos neonatales', 'Enfermedades cardiovasculares', 'Cánceres', 'Deficiencias nutricionales', 'Diabetes, sangre y enfermedades endocrinas.', 'Lesiones no intencionales', 'Otras ENT', 'Lesiones de transporte', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  diseaseDALYs: [2112674, 1418231, 804919, 470598, 358516, 324526, 300375, 249593, 240049, 180995, 84],
    		  riskFactors: ['Emaciación infantil', 'Contaminación del aire (exterior e interior)', 'Nivel alto de azúcar en la sangre', 'Hipertensión', 'De fumar', 'Fuente de agua insegura', 'Obesidad', 'Saneamiento inseguro', 'Deficiencia de vitamina A', 'Dieta baja en frutas', 'COVID-19 hasta el 27 de mayo de 2020'],
    		  riskDALYs: [543888, 428451, 339950, 279958, 268280, 263176, 204466, 181818, 115425, 102441, 84] },
    		],
      });

    const visualList = (selection, props) => {
      const xScale = d3.scaleLinear();
      const yScale = d3.scaleBand();
      // selection.style('background-color', 'gainsboro');

      // unpack parameters
      const {
        dataList,
        titleListName,
        titleListNumber,
        titleListMain,
        sortList,
        reverseRange,
        xValue,
        yValue,
        margin,
        barPadding,
        verticalSpacing,
        transitionDuration,
        colors
      } = props;

      const transition = d3.transition()
        .duration(transitionDuration)
        .ease(d3.easeLinear);

      const widthSVG = +selection.attr('width');

      let rightAlignBy;
      if (sortList) {
        rightAlignBy = widthSVG - 200;
      } else {
        rightAlignBy = widthSVG - 120;
      }

      const lineExtendBy = 80;

      // functions
      function numberWithCommas(x) {
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      }

      function numberISO(x) {
        return d3.format('.3s')(x)
                 .replace('G', 'B');
      }

      function numberFormatter(x) {
        if (x < Math.pow(10, 6)) {
          return numberWithCommas(x);
        } else {
          return numberISO(x);
        }
      }

      function numberText(d) {
        return `${numberFormatter(d.number)}`;
      }

      function nameText(d, i) {
        if (sortList) {
          return `${i+1}. ${d.name}`;
        } else {
          return `${d.name}`;
        }
      }
      

      function setWeight(d) {
        if (d.type === 'estimate') {
          return '800';
        } else {
          return 'normal';
        }
      }

      const colorGrey = 'rgba(221, 221, 221, 0.8)';

      function setFill(d, i) {
        if (d.type === 'estimate') {
          return colors[0];
        } else if (d.type === 'over60') {
          return colors[2];
        } else if (d.type === 'other' || d.type === 'below60') {
          return colors[1];
        } else if (d.type === 'poverty') {
          return colors[i];
        } else {
          return colors[2];
        }
      }

      function setStroke(d, i) {
        if (d.type === 'estimate') {
          return colors[0];
        } else if (d.type === '2020-04-21' || d.type === 'over60') {
          return colors[2];
        } else if (d.type === 'other' || d.type === 'below60') {
          return colors[1];
        } else if (d.type === 'poverty') {
          return colors[i];
        } else {
          return colorGrey;
        }
      }

      // title main
      const titleMain = selection.selectAll('.title-main')
        .data([null]);
      const titleMainEnter = titleMain.enter()
        .append('text')
        .attr('class', 'title-main')
        .attr('transform', `translate(${margin.left}, 0)`)
        .attr('x', 0)
        .attr('y', 15)
        .style('font-size', '16px')
        .style('font-weight', '800')
        .style('fill', 'rgba(72,72,72,1)')
        .style('font-family', 'Roboto, sans-serif');
      titleMainEnter
        .merge(titleMain)
        .text(titleListMain);

      // title name
      const titleName = selection.selectAll('.title-name')
        .data([null]);
      const titleNameEnter = titleName.enter()
        .append('text')
        .attr('class', 'title-name')
        .attr('transform', `translate(${margin.left}, 0)`)
        .attr('x', 0)
        .attr('y', 50)
        .style('font-size', '14px')
        .style('font-weight', '800')
        .style('fill', 'rgba(72,72,72,1)')
        .style('font-family', 'Roboto, sans-serif');
      titleNameEnter
        .merge(titleName)
        .text(titleListName);

      // title number
      const titleNumber = selection.selectAll('.title-number')
        .data([null]);
      const titleNumberEnter = titleNumber.enter()
        .append('text')
        .attr('class', 'title-number')
        .attr('transform', `translate(${margin.left}, 0)`)
        .attr('x', rightAlignBy) // no - 50
        .attr('y', 50)
        .style('font-size', '14px')
        .style('font-weight', '800')
        .style('fill', 'rgba(72,72,72,1)')
        .style('font-family', 'Roboto, sans-serif');
      titleNumberEnter
        .merge(titleNumber)
        .text(titleListNumber);


      // add fat grey line under title
      const line = selection.selectAll('line')
        .data([null]);
      const lineEnter = line.enter()
        .append('rect')
        .attr('class', 'line-title')
        .attr('fill', 'grey')
        .attr('stroke', 'grey')
        .attr('width', rightAlignBy + lineExtendBy)
        .attr('rx', '0.7') // playing with rounded corners
        .attr('x', 0)
        .attr('height', 0.1)
        .attr('transform', `translate(${margin.left}, 60)`);
      lineEnter
        .merge(line);

      if (sortList) {
        dataList.sort((a, b) => d3.descending(xValue(a), xValue(b)));
      }

      const width = +selection.attr('width');
      let innerWidth = width - margin.left - margin.right;
      const innerHeight = verticalSpacing * dataList.length;

      // some last adjustments of bar width
      if (!sortList) {
        innerWidth *= 0.8;
      } else {
        innerWidth *= 1;
      }

      xScale
        .domain([0, d3.max(dataList, xValue)])
        .range([0, innerWidth]);

      if (reverseRange) {
        yScale
          .paddingInner(barPadding)
          .paddingOuter(barPadding / 2)
          .domain(dataList.map(yValue))
          .range([innerHeight / 2, 0]);
      } else {
        yScale
          .paddingInner(barPadding)
          .paddingOuter(barPadding / 2)
          .domain(dataList.map(yValue))
          .range([0, innerHeight / 2]);
      }


      let g = selection.selectAll('g').data([null]); // solves join problems with constant width
      g = g.enter().append('g') // reassign g to be the merged selection
        .merge(g)
        .attr('transform', `translate(${margin.left}, ${margin.top})`);

      // APPLY DUPLICATED LOGIC ON GROUP ELEMENT
      // and pass the transformation to childrens
      const groups = g.selectAll('g')
        .data(dataList, yValue); // key = yValue = name for object constancy in animations
      const groupsExit = groups.exit();
      groupsExit
        .remove();
      const groupsEnter = groups
        .enter().append('g')
        .attr('transform', d => `translate(0, ${yScale(yValue(d))})`);
      groups
        .merge(groupsEnter)
        .transition(transition)
        .attr('transform', d => `translate(0, ${yScale(yValue(d))})`);

      // add bars behind the text elements as children of groups elements
      const rects = groupsEnter
        .append('rect') // append elts and set content on enter
          .attr('class', 'hover-rect')
          .attr('fill', setFill)
          .attr('stroke', setStroke)
          .attr('width', 0) // 0 or d => xScale(xValue(d))
          .attr('rx', '0.7') // playing with rounded corners
          .attr('x', d => rightAlignBy - xScale(xValue(d)))
        .merge(groups.select('.hover-rect'))
          .attr('height', yScale.bandwidth())
          .transition().duration(400).ease(d3.easeLinear)
          .attr('x', d => rightAlignBy - xScale(xValue(d)))
          .attr('width', d => xScale(xValue(d)));
      groupsExit.select('.hover-rect')
        .transition(transition)
        .attr('width', 0);

      // add lines below elements
      const lines = groupsEnter
        .append('rect') // append elts and set content on enter
          .attr('class', 'line-rect')
          .attr('fill', 'grey')
          .attr('width', rightAlignBy + lineExtendBy)
          .attr('rx', '0.7')
          .attr('x', 0)
          .attr('transform', `translate(0, 25)`)
        .merge(groups.select('line-rect'))
          .attr('height', 0.4) // 0.1
          .transition(transition);
      groupsExit.select('line-rect')
        .transition(transition)
        .attr('width', 0);

      // set stroke on background fill=none same as Radial Normalized Stacted
      const textBackground =  groupsEnter
        .append('text') // append elts and set content on enter
          .attr('class', 'background')
          .attr('x', 1) // minor corrections
          .style('font-weight', setWeight)
          .attr('dy', '0.32em') // center wrt tick line
          .style('fill', 'none')
          .attr('stroke', 'white')
          .attr('stroke-width', 0.1) // TODO: set nicer
          .attr('stroke-linejoin', 'round')
          .style('font-size', '14px')
          .style('font-family', 'Roboto, sans-serif')
        .merge(groups.select('.background')) // for update selections (existing DOM elts)
          .attr('y', yScale.bandwidth() / 2) // center text within the bars
          .text(nameText);

      // add text elements as children of groups elements
      const textForeground =  groupsEnter
        .append('text') // append elts and set content on enter
          .attr('class', 'foreground')
          .attr('x', 1) // minor corrections
          .style('font-family', 'Sans-Serif')
          .style('font-weight', setWeight)
          .attr('dy', '0.32em') // center wrt tick line
          .style('font-size', '14px')
          .style('font-family', 'Roboto, sans-serif')
        .merge(groups.select('.foreground')) // for update selections (existing DOM elts)
          .attr('y', yScale.bandwidth() / 2) // center text within the bars
          .text(nameText);


      // Align right deathsText
      const textBackgroundNumber =  groupsEnter
        .append('text') // append elts and set content on enter
          .attr('class', 'backgroundnumber')
          .style('font-weight', setWeight)
          .attr('dy', '0.32em') // center wrt tick line
          .style('fill', 'none')
          .attr('stroke', 'white')
          .attr('stroke-width', 0.5) // TODO: set nicer
          .attr('stroke-linejoin', 'round')
          .style('font-size', '14px')
          .style('font-family', 'Roboto, sans-serif')
        .merge(groups.select('.backgroundnumber')) // for update selections (existing DOM elts)
          .attr('x', rightAlignBy + 5) // minor corrections
          .attr('y', yScale.bandwidth() / 2) // center text within the bars
          .text(numberText);

      // add text elements as children of groups elements
      const textForegroundNumber =  groupsEnter
        .append('text') // append elts and set content on enter
          .attr('class', 'foregroundnumber')
          .style('font-weight', setWeight)
          .attr('dy', '0.32em') // center wrt tick line
          .style('font-size', '14px')
          .style('fill', 'rgba(72,72,72,1)')
          .style('font-family', 'Roboto, sans-serif')
        .merge(groups.select('.foregroundnumber')) // for update selections (existing DOM elts)
          .attr('x', rightAlignBy + 5) // minor corrections
          .attr('y', yScale.bandwidth() / 2) // center text within the bars
          .text(numberText);
    };

    /* src/CompareByAge.svelte generated by Svelte v3.22.3 */

    function create_fragment(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");

    			div.innerHTML = `<svg class="infected" width="450" height="320"><style>
      .hover-rect:hover {
        opacity: 1;
        stroke: black;
        stroke-width: 1px;
        fill: rgba(228,26,28, 1);
      }
    </style></svg> 
  <svg class="deaths" width="450" height="320"><style>
      .hover-rect:hover {
        opacity: 1;
        stroke: black;
        stroke-width: 1px;
        fill: rgba(228,26,28, 1);
      }
    </style></svg>`;

    			set_style(div, "margin-top", "25px");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    const transitionDuration = 200;

    function numberWithCommas(x) {
    	return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    function textValue(d, i) {
    	return `${d.name}: ${numberWithCommas(d.number)}`;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { infectedData = [] } = $$props;
    	let { infectedTitle = "" } = $$props;
    	let { infectedTitleListName = "" } = $$props;
    	let { infectedTitleListNumber = "" } = $$props;
    	let { deathsData = [] } = $$props;
    	let { deathsTitle = "" } = $$props;
    	let { deathsTitleListName = "" } = $$props;
    	let { deathsTitleListNumber = "" } = $$props;

    	// other, emphasize, estimate
    	const colors = ["#e0f3db", "#a8ddb5", "#43a2ca"];

    	afterUpdate(() => {
    		d3.select("svg.infected").call(visualList, {
    			dataList: infectedData,
    			titleListName: infectedTitleListName,
    			titleListNumber: infectedTitleListNumber,
    			titleListMain: infectedTitle,
    			sortList: false,
    			reverseRange: true,
    			xValue: d => d.number,
    			yValue: d => d.name,
    			textValue,
    			margin: { top: 70, right: 100, bottom: 0, left: 0 },
    			barPadding: 0.2,
    			verticalSpacing: 55,
    			transitionDuration,
    			colors
    		});

    		d3.select("svg.deaths").call(visualList, {
    			dataList: deathsData,
    			titleListName: deathsTitleListName,
    			titleListNumber: deathsTitleListNumber,
    			titleListMain: deathsTitle,
    			sortList: false,
    			reverseRange: true,
    			xValue: d => d.number,
    			yValue: d => d.name,
    			textValue,
    			margin: { top: 70, right: 100, bottom: 0, left: 0 },
    			barPadding: 0.2,
    			verticalSpacing: 55,
    			transitionDuration,
    			colors
    		});
    	});

    	$$self.$set = $$props => {
    		if ("infectedData" in $$props) $$invalidate(0, infectedData = $$props.infectedData);
    		if ("infectedTitle" in $$props) $$invalidate(1, infectedTitle = $$props.infectedTitle);
    		if ("infectedTitleListName" in $$props) $$invalidate(2, infectedTitleListName = $$props.infectedTitleListName);
    		if ("infectedTitleListNumber" in $$props) $$invalidate(3, infectedTitleListNumber = $$props.infectedTitleListNumber);
    		if ("deathsData" in $$props) $$invalidate(4, deathsData = $$props.deathsData);
    		if ("deathsTitle" in $$props) $$invalidate(5, deathsTitle = $$props.deathsTitle);
    		if ("deathsTitleListName" in $$props) $$invalidate(6, deathsTitleListName = $$props.deathsTitleListName);
    		if ("deathsTitleListNumber" in $$props) $$invalidate(7, deathsTitleListNumber = $$props.deathsTitleListNumber);
    	};

    	return [
    		infectedData,
    		infectedTitle,
    		infectedTitleListName,
    		infectedTitleListNumber,
    		deathsData,
    		deathsTitle,
    		deathsTitleListName,
    		deathsTitleListNumber
    	];
    }

    class CompareByAge extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance, create_fragment, safe_not_equal, {
    			infectedData: 0,
    			infectedTitle: 1,
    			infectedTitleListName: 2,
    			infectedTitleListNumber: 3,
    			deathsData: 4,
    			deathsTitle: 5,
    			deathsTitleListName: 6,
    			deathsTitleListNumber: 7
    		});
    	}
    }

    /* src/Compare.svelte generated by Svelte v3.22.3 */

    function create_fragment$1(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");

    			div.innerHTML = `<svg class="compare" width="700" height="410"><style>
      .hover-rect:hover {
        opacity: 1;
        stroke: black;
        stroke-width: 1px;
        fill: rgba(228,26,28, 1);
      }
    </style></svg>`;
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    const transitionDuration$1 = 200;

    function instance$1($$self, $$props, $$invalidate) {
    	let { compareData = [] } = $$props;
    	let { titleListMain = "" } = $$props;
    	let { titleListName = "" } = $$props;
    	let { titleListNumber = "" } = $$props;

    	// colors for: other, emphasize, estimate
    	const colors = ["#fdc086", "#beaed4", "#7fc97f"];

    	afterUpdate(() => {
    		d3.select("svg.compare").call(visualList, {
    			dataList: compareData,
    			titleListName,
    			titleListNumber,
    			titleListMain,
    			sortList: true,
    			reverseRange: false,
    			xValue: d => d.number,
    			yValue: d => d.name,
    			margin: { top: 70, right: 220, bottom: 0, left: 90 },
    			barPadding: 0.2,
    			verticalSpacing: 55,
    			transitionDuration: transitionDuration$1,
    			colors
    		});
    	});

    	$$self.$set = $$props => {
    		if ("compareData" in $$props) $$invalidate(0, compareData = $$props.compareData);
    		if ("titleListMain" in $$props) $$invalidate(1, titleListMain = $$props.titleListMain);
    		if ("titleListName" in $$props) $$invalidate(2, titleListName = $$props.titleListName);
    		if ("titleListNumber" in $$props) $$invalidate(3, titleListNumber = $$props.titleListNumber);
    	};

    	return [compareData, titleListMain, titleListName, titleListNumber];
    }

    class Compare extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {
    			compareData: 0,
    			titleListMain: 1,
    			titleListName: 2,
    			titleListNumber: 3
    		});
    	}
    }

    const loadAndProcessData = () =>
      Promise
        .all([
            d3.csv('worldmap-fixed.csv'),
            d3.json('worldmap-fixed.json')
        ])
        .then(([csvData, topoJSONData]) => {
          const rowById = csvData.reduce((accumulator, d) => {
            accumulator[d.iso_n3] = d;
            return accumulator;
          }, {});

          const countries = topojson.feature(topoJSONData, topoJSONData.objects.countries);

          countries.features.forEach(d => {
            Object.assign(d.properties, rowById[d.id]);
          });

          return countries;
        });

    const projection = d3.geoNaturalEarth1();
    const pathGenerator = d3.geoPath().projection(projection);

    const choroplethMap = (selection, props) => {
      const {
        features,
        colorScale,
        colorValue,
        selectedColorValue
      } = props;

      const gUpdate = selection.selectAll('g')
        .data([null]);

      const gEnter = gUpdate.enter()
        .append('g');
      const g = gUpdate.merge(gEnter);

      gEnter
        .append('path')
          .attr('class', 'sphere')
          .attr('d', pathGenerator({type: 'Sphere'}))
        .merge(gUpdate.select('.sphere'))
          .attr('opacity', selectedColorValue ? 0.05 : 1);

      selection.call(d3.zoom().on('zoom', () => {
        g.attr('transform', d3.event.transform);
      }));

      const countryPaths = g.selectAll('.country')
        .data(features);
      const countryPathsEnter = countryPaths
        .enter().append('path')
          .attr('class', 'country');
      countryPaths
        .merge(countryPathsEnter)
          .attr('d', pathGenerator)
          .attr('fill', d => colorScale(colorValue(d)))
          .attr('opacity', d =>
            (!selectedColorValue || selectedColorValue === colorValue(d))
              ? 1
              : 0.1
          )
          .classed('highlighted', d =>
            selectedColorValue && selectedColorValue === colorValue(d)
          );

      countryPathsEnter.append('title')
      // give user info from worldmap-fixed.csv: name,economy,income_grp,iso_n3,prop
          .text(d =>
            d.properties.name + ': ' + '\n' +
            'Income: ' + d.properties.income_grp + '\n' +
            'People over 60: ' + d.properties.prop);
    };

    const colorLegend = (selection, props) => {
      const {                      
        colorScale,                
        circleRadius,
        spacing,                   
        textOffset,
        backgroundRectWidth,
        selectedColorValue,
        handleMouseOver,
        handleMouseOut
      } = props;                  
      
      const backgroundRect = selection.selectAll('rect')
        .data([null]);             
      const n = colorScale.domain().length; 
      backgroundRect.enter().append('rect')
        .merge(backgroundRect)
          .attr('x', -circleRadius * 2)   
          .attr('y', -circleRadius * 2)   
          .attr('rx', circleRadius * 2)   
          .attr('width', backgroundRectWidth)
          .attr('height', spacing * n + circleRadius * 2) 
          .attr('fill', 'white')
          .attr('opacity', 0.8);

      const groups = selection.selectAll('.tick')
        .data(colorScale.domain());
      const groupsEnter = groups
        .enter().append('g')
          .attr('class', 'tick');
      groupsEnter
        .merge(groups)
          .attr('transform', (d, i) =>    
            `translate(0, ${i * spacing})`  
          )
          .attr('opacity', d =>
            (!selectedColorValue || d === selectedColorValue)
              ? 1
              : 0.2
          )
          .on('mouseover', handleMouseOver)
          .on('mouseout', handleMouseOut);
      groups.exit().remove();
      
      groupsEnter.append('circle')
        .merge(groups.select('circle')) 
          .attr('r', circleRadius)
          .attr('fill', colorScale);      
      
      groupsEnter.append('text')
        .merge(groups.select('text'))   
          .text(d => d)
          .attr('dy', '0.32em')
          .attr('x', textOffset);
    };

    /* src/WorldMap.svelte generated by Svelte v3.22.3 */

    function create_fragment$2(ctx) {
    	let div;
    	let svg_1;
    	let style;
    	let t;

    	return {
    		c() {
    			div = element("div");
    			svg_1 = svg_element("svg");
    			style = svg_element("style");
    			t = text(".sphere {\n\t\t\t\t/* fill: #0077be; */\n\t\t\t\tfill: rgba(189,215,231 ,1);\n\t\t\t\topacity: 0.1;\n\t\t\t}\n\t\t\t.country {\n\t\t\t\tstroke: black;\n\t\t\t\tstroke-width: 0.05px;\n\t\t\t}\n\t\t\t.country:hover {\n\t\t\t\topacity: 1;\n        stroke: black;\n        stroke-width: 1px;\n        fill: rgba(228,26,28, 1);\n\t\t\t}\n\t\t\t.tick text {\n\t\t\t\tfont-size: .9em;\n\t\t\t\tfill: #635F5D;\n\t\t\t\tfont-family: sans-serif;\n\t\t\t}\n\t\t\t.tick {\n\t\t\t\tcursor: pointer;\n\t\t\t}\n\t\t\t.tick circle {\n\t\t\t\tstroke: black;\n\t\t\t\tstroke-opacity: 0.5;\n\t\t\t}");
    			attr(svg_1, "class", "worldmap");
    			attr(svg_1, "width", svgWidth);
    			attr(svg_1, "height", svgHeight);
    			attr(div, "class", "center svelte-150k4tx");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, svg_1);
    			append(svg_1, style);
    			append(style, t);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    let svgWidth = 960;
    let svgHeight = 500;

    function instance$2($$self, $$props, $$invalidate) {
    	let { selectedRisk = 0 } = $$props;

    	// selectedColorValue,
    	// handleMouseOver,
    	// handleMouseOut
    	let svg;

    	// domain and range arrays
    	let incomeColors = [
    		"rgb(208,28,139)",
    		"rgb(241,182,218)",
    		"rgb(184,225,134)",
    		"rgb(77,172,38)",
    		"darkgrey"
    	];

    	let incomeLegend = [
    		"No data",
    		"4. High income",
    		"3. Upper middle income",
    		"2. Lower middle income",
    		"1. Low income"
    	].reverse();

    	let propsColors = [
    		"rgb(166,97,26)",
    		"rgb(223,194,125)",
    		"rgb(128,205,193)",
    		"rgb(1,133,113)",
    		"darkgrey"
    	];

    	let propsLegend = ["No data", "<5%", "5- 10%", "10- 20%", ">20%"].reverse();

    	afterUpdate(() => {
    		svg = d3.select("svg.worldmap");

    		// choropleth map
    		let g = svg.selectAll("g").data([null]);

    		g = g.enter().append("g").merge(g);

    		// update legend on each property switch
    		let legend = svg.selectAll("g.legend").data([null]);

    		legend = legend.enter().append("g").attr("class", "legend").merge(legend).attr("transform", `translate(40, 310)`);
    		const colorScale = d3.scaleOrdinal();
    		let colorValue; // strange to send null to choroplethMap
    		let selectedColorValue;
    		let features;

    		function handleMouseOver(d, i) {
    			selectedColorValue = d;
    			render();
    		}

    		

    		function handleMouseOut(d, i) {
    			selectedColorValue = null;
    			render();
    		}

    		loadAndProcessData().then(countries => {
    			features = countries.features;
    			render();
    		});

    		function render() {
    			switch (selectedRisk) {
    				case 0:
    					colorValue = d => d.properties.prop;
    					colorScale.domain(propsLegend).range(propsColors);
    					break;
    				default:
    					colorValue = d => d.properties.income_grp;
    					colorScale.domain(incomeLegend).range(incomeColors);
    					break;
    			}

    			g.call(choroplethMap, {
    				features,
    				colorScale,
    				colorValue,
    				selectedColorValue
    			});

    			legend.call(colorLegend, {
    				colorScale,
    				circleRadius: 8,
    				spacing: 20,
    				textOffset: 12,
    				backgroundRectWidth: 235,
    				selectedColorValue,
    				handleMouseOver,
    				handleMouseOut
    			});
    		}
    	});

    	$$self.$set = $$props => {
    		if ("selectedRisk" in $$props) $$invalidate(0, selectedRisk = $$props.selectedRisk);
    	};

    	return [selectedRisk];
    }

    class WorldMap extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { selectedRisk: 0 });
    	}
    }

    /* src/Poverty.svelte generated by Svelte v3.22.3 */

    function create_fragment$3(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");

    			div.innerHTML = `<svg class="compare" width="700" height="420"><style>
      .hover-rect:hover {
        opacity: 1;
        stroke: black;
        stroke-width: 1px;
        fill: rgba(228,26,28, 1);
      }
    </style></svg>`;
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    const transitionDuration$2 = 200;

    function instance$3($$self, $$props, $$invalidate) {
    	let { compareData = [] } = $$props;
    	let { titleListMain = "" } = $$props;
    	let { titleListName = "" } = $$props;
    	let { titleListNumber = "" } = $$props;
    	let { colorsList = [] } = $$props;

    	afterUpdate(() => {
    		d3.select("svg.compare").call(visualList, {
    			dataList: compareData,
    			titleListName,
    			titleListNumber,
    			titleListMain,
    			sortList: true,
    			reverseRange: false,
    			xValue: d => d.number,
    			yValue: d => d.name,
    			margin: { top: 70, right: 220, bottom: 0, left: 90 },
    			barPadding: 0.2,
    			verticalSpacing: 55,
    			transitionDuration: transitionDuration$2,
    			colors: colorsList
    		});
    	});

    	$$self.$set = $$props => {
    		if ("compareData" in $$props) $$invalidate(0, compareData = $$props.compareData);
    		if ("titleListMain" in $$props) $$invalidate(1, titleListMain = $$props.titleListMain);
    		if ("titleListName" in $$props) $$invalidate(2, titleListName = $$props.titleListName);
    		if ("titleListNumber" in $$props) $$invalidate(3, titleListNumber = $$props.titleListNumber);
    		if ("colorsList" in $$props) $$invalidate(4, colorsList = $$props.colorsList);
    	};

    	return [compareData, titleListMain, titleListName, titleListNumber, colorsList];
    }

    class Poverty extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {
    			compareData: 0,
    			titleListMain: 1,
    			titleListName: 2,
    			titleListNumber: 3,
    			colorsList: 4
    		});
    	}
    }

    const lineChart = (selection, props) => {
      const {
        colorValue,
        colorScale,
        yValue,
        title,
        xValue,
        xAxisLabel,
        yAxisLabel,
        margin,
        width,
        height,
        data,
        nested,
        selectedColorValues,
        selectedCountries,
      } = props;

      const splitIndexes = {'Brazil': 68,
        'Colombia': 77,
        'Egypt': 77,
        'France': 76,
        'Germany': 67,
        'Italy': 68,
        'Philippines': 77,
        'Turkey': 77,
        'United Kingdom': 77,
        'United States': 67};

      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;

      function numberFormat(number) {
        if (number > 10000) {
          return d3.format('.3s')(number).replace('G', 'B');
        }
        else {
          return number;
        }
      }
      
      // filter data for x and y scales
      function isSelected(name) {
        return selectedColorValues.includes(name);
      }

      const xScale = d3.scaleTime()
        .domain(d3.extent(data.filter(
          d => isSelected(d.country)
        ), xValue))
        .range([0, innerWidth])
        .nice();

      const yScale = d3.scaleLinear()
        .domain(d3.extent(data.filter(
          d => isSelected(d.country)
        ), yValue))
        .range([innerHeight, 0])
        .nice();

      const g = selection.selectAll('.container').data([null]);
      const gEnter = g.enter()
        .append('g')
          .attr('class', 'container');
      gEnter.merge(g)
        .attr('transform', `translate(${margin.left},${margin.top})`);
        
      const xAxis = d3.axisBottom(xScale)
        .ticks(5)
        .tickFormat(d3.timeFormat('%b %d'))
        .tickSize(-innerHeight)
        .tickPadding(15);

      const yAxis = d3.axisLeft(yScale)
        .tickSize(-innerWidth)
        .tickFormat(numberFormat)
        .tickPadding(10);

      const yAxisGEnter = gEnter
        .append('g')
          .attr('class', 'y-axis');
      const yAxisG = g.select('.y-axis');
      yAxisGEnter
        .merge(yAxisG)
          .call(yAxis)
          .selectAll('.domain').remove();

      yAxisGEnter
        .append('text')
          .attr('class', 'axis-label')
          .attr('y', -60)
          .attr('fill', 'black')
          .attr('transform', `rotate(-90)`)
          .attr('text-anchor', 'middle')
        .merge(yAxisG.select('.axis-label'))
          .attr('x', -innerHeight / 2)
          .text(yAxisLabel);

      const xAxisGEnter = gEnter
        .append('g')
          .attr('class', 'x-axis');
      const xAxisG = g.select('.x-axis');
      xAxisGEnter
        .merge(xAxisG)
          .call(xAxis)
          .attr('transform', `translate(0,${innerHeight})`)
          .select('.domain').remove();

      xAxisGEnter
        .append('text')
          .attr('class', 'axis-label')
          .attr('y', 80)
          .attr('fill', 'black')
        .merge(xAxisG.select('.axis-label'))
          .attr('x', innerWidth / 2)
          .text(xAxisLabel);

      const lineGenerator = d3.line()
        .x(d => xScale(xValue(d)))
        .y(d => yScale(yValue(d)))
        .curve(d3.curveBasis);
        
      function generatePaths(d) {
        return lineGenerator(d.values);
      }

      function getRange(dataCountry, type) {
        if (type === 'continuous') {
          return d3.range(0, splitIndexes[dataCountry.key])
        } else {
          return d3.range(splitIndexes[dataCountry.key] + 1, 
            dataCountry.values.length)
        }
      }

      function getIndexes(nested, type) {
        const allIndexes = d3.range(10);
        let indexes = [];

        if (type === 'selected') {
          allIndexes.forEach(i => {
            const country = nested[i].key;
            if (selectedCountries.includes(country)) {
              indexes.push(i);
            }
          });
        } else if (type === 'dashed') {
          allIndexes.forEach(i => {
            const country = nested[i].key;
            if (selectedColorValues.includes(country) && !selectedCountries.includes(country)) {
              indexes.push(i);
            }
          });      
        } else {
          allIndexes.forEach(i => {
            const country = nested[i].key;
            if (selectedColorValues.includes(country)) {
              indexes.push(i);
            }
          });
        }
        return indexes;
      }

      function melt(nested, type) {
        const data = [];
        let filterRange = [];
        let allCountries = [];

        // TODO: show only paths from selectedColorValues!
        // filter on selectedColorValues
        allCountries = getIndexes(nested, type);
        allCountries.forEach(i => { 
          const values = nested[i].values;
          
          const filtered = [];
          filterRange = getRange(nested[i], type);
          filterRange.forEach(j => {
            filtered.push(values[j]);
          });

          const row = {
            key: nested[i].key,
            values: filtered
          };
          data.push(row);
        });

        return data;
      }
      const linePathsCont = g.merge(gEnter)
        .selectAll('.continuous').data(melt(nested, 'continuous'));
      const linePathsContEnter = linePathsCont
        .enter().append('path')
          .attr('class', 'continuous');
      const linePathsContUpdate = linePathsContEnter.merge(linePathsCont);
      linePathsContUpdate.attr('d', generatePaths)
          .attr('stroke', d => colorScale(d.key))
          .attr('opacity', d =>
            selectedColorValues.includes(colorValue(d))
              ? 1
              : 0.1
          );
      linePathsCont.exit().remove();

      
      const linePathsSelected = g.merge(gEnter)
        .selectAll('.dashed').data(melt(nested, 'selected'));  
      const linePathsSelectedEnter = linePathsSelected
        .enter().append('path')
          .attr('class', 'dashed');
      const linePathsSelectedUpdate = linePathsSelectedEnter.merge(linePathsSelected);
      
      if (melt(nested, 'selected').length > 0) {
        linePathsSelectedUpdate.attr('d', generatePaths)
        .attr('stroke', d => colorScale(d.key))
        .attr('opacity', d =>
          selectedColorValues.includes(colorValue(d))
            ? 1
            : 0.1
        );

        let totalLength = linePathsSelectedUpdate.node().getTotalLength();
        // solution from: https://www.visualcinnamon.com/2016/01/animating-dashed-line-d3
        const dashing = "6, 6";
        let dashLength =
          dashing
              .split(/[\s,]/)
              .map(function (a) { return parseFloat(a) || 0 })
              .reduce(function (a, b) { return a + b });
        let dashCount = Math.ceil( totalLength / dashLength );
        let newDashes = new Array(dashCount).join( dashing + " " );
        let dashArray = newDashes + " 0, " + totalLength;

        linePathsSelectedUpdate
          .attr('stroke-dashoffset', totalLength)
          .attr('stroke-dasharray', dashArray)
          .transition().duration(500).ease(d3.easeLinear)
          .attr('stroke-dashoffset', 0);
        
        linePathsSelected.exit().remove();
      } else {
        linePathsSelected.exit().remove();
      }
      


      const linePathsDashed = g.merge(gEnter)
        .selectAll('.alldashed').data(melt(nested, 'dashed')); 
      const linePathsDashedEnter = linePathsDashed
        .enter().append('path')
          .attr('class', 'alldashed');
      const linePathsDashedUpdate = linePathsDashedEnter.merge(linePathsDashed);
      
      if (melt(nested, 'dashed').length > 0) {
        linePathsDashedUpdate
        .attr('d', generatePaths)
        .attr('stroke', d => colorScale(d.key))
        .attr('opacity', d =>
          selectedColorValues.includes(colorValue(d))
            ? 1
            : 0.1
        );
      }
      linePathsDashed.exit().remove();

      gEnter
        .append('text')
          .attr('class', 'title')
          .attr('x', -100)
          .attr('y', -30)
        .merge(g.select('.title'))
          .text(title);
    };

    const colorLegendProjections = (selection, props) => {
      const {
        colorScale,
        circleRadius,
        spacing,
        textOffset,
        onClick,
        selectedColorValues,
        language
      } = props;

      const enToZh = {'Brazil': '巴西',
                      'Colombia': '哥伦比亚',
                      'Egypt': '埃及',
                      'France': '法国',
                      'Germany': '德国',
                      'Italy': '意大利',
                      'Philippines': '菲律宾',
                      'Turkey': '火鸡',
                      'United Kingdom': '英国',
                      'United States': '美国'};

      const enToEs = {'Brazil': 'Brasil',
                      'Colombia': 'Colombia',
                      'Egypt': 'Egipto',
                      'France': 'Francia',
                      'Germany': 'Alemania',
                      'Italy': 'Italia',
                      'Philippines': 'Filipinas',
                      'Turkey': 'Turquía',
                      'United Kingdom': 'Reino Unido',
                      'United States': 'Estados Unidos'};

      function getText(d) {
        switch(language) {
          case 'en':
            return d;
          case 'es':
            return enToEs[d];
          case 'zh':
            return enToZh[d];
          default:
            console.log(d);  
        }
      }

      const groups = selection.selectAll('g')
        .data(colorScale.domain());
      const groupsEnter = groups
        .enter().append('g')
          .attr('class', 'tick-colorlegend')
          .attr('opacity', 0.8);
      groupsEnter
        .merge(groups)
          .attr('transform', (d, i) =>
            `translate(0, ${i * spacing})`
          )
          .attr('opacity', d =>
          selectedColorValues.includes(d)
            ? 1
            : 0.1
          )
          .on('click', d => onClick(d));
        groups.exit().remove();

      groupsEnter.append('circle')
        .merge(groups.select('circle'))
          .attr('r', circleRadius)
          .attr('fill', colorScale);

      groupsEnter.append('text')
        .merge(groups.select('text'))
          .text(getText)
          .attr('dy', '0.32em')
          .attr('x', textOffset);
    };

    /* src/Projections.svelte generated by Svelte v3.22.3 */

    function create_fragment$4(ctx) {
    	let svg_1;
    	let style;
    	let t;

    	return {
    		c() {
    			svg_1 = svg_element("svg");
    			style = svg_element("style");
    			t = text(".line {\n      fill: none;\n      stroke-width: 5;\n      stroke-linejoin: round;\n      stroke-linecap: round;\n      mix-blend-mode: multiply;\n    }\n    .continuous {\n      fill: none;  \n      stroke-width: 4.5px;\n      stroke-linejoin: round;\n      stroke-linecap: round;\n      mix-blend-mode: multiply;  \n    }\n    .dashed {\n      fill: none;\n      stroke-width: 4.5px;\n      stroke-linejoin: round;\n      stroke-linecap: round;\n      mix-blend-mode: multiply;\n      /* stroke-dasharray: 8 8; */\n    }\n    .alldashed {\n      fill: none;\n      stroke-width: 4.5px;\n      stroke-linejoin: round;\n      stroke-linecap: round;\n      mix-blend-mode: multiply;\n      stroke-dasharray: 8 8;\n    }\n    .legend-continuous {\n      fill: none;\n      stroke: black;\n      stroke-width: 4.5px;  \n      stroke-linejoin: round;\n      stroke-linecap: round;\n      mix-blend-mode: multiply;\n    }\n    .legend-dashed {\n      fill: none;\n      stroke: black;\n      stroke-width: 4.5px;  \n      stroke-linejoin: round;\n      stroke-linecap: round;\n      mix-blend-mode: multiply;\n      stroke-dasharray: 8 8;\n    }\n    text {\n      font-family: 'Roboto', sans-serif;\n      font-size: 14px;\n    }\n    .tick-colorlegend {\n      cursor: pointer;\n    }\n    .tick text {\n      font-weight: normal;\n      font-family: 'Roboto', sans-serif;\n      font-size: 14px;\n    }\n    .tick line {\n      stroke: #C0C0BB;\n    }\n    .axis-label {\n      font-size: 15px;\n      font-weight: 800;\n      fill: rgba(72,72,72,1);\n      font-family: 'Roboto', sans-serif;\n    }\n    .title {\n      font-weight: 800;\n      font-family: 'Roboto', sans-serif;\n      fill: rgba(72,72,72,1);\n      font-size: 17px;\n    }");
    			attr(svg_1, "class", "projections");
    			attr(svg_1, "width", "960");
    			attr(svg_1, "height", "450");
    		},
    		m(target, anchor) {
    			insert(target, svg_1, anchor);
    			append(svg_1, style);
    			append(style, t);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(svg_1);
    		}
    	};
    }

    function removeItemOnce(arr, value) {
    	var index = arr.indexOf(value);

    	if (index > -1) {
    		arr.splice(index, 1);
    	}

    	return arr;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { projectionsTitle = "" } = $$props;
    	let { projectionsXAxisLabel = "" } = $$props;
    	let { projectionsYAxisLabel = "" } = $$props;
    	let { language = "" } = $$props;
    	let svg;

    	// state   
    	let selectedColorValues = ["United States", "Brazil", "Italy"]; // 9, 0, 5

    	let selectedCountries = ["United States", "Brazil", "Italy"];
    	let data;

    	afterUpdate(() => {
    		svg = d3.select("svg.projections");

    		// TODO: create csv upload to github gist
    		d3.csv("projections.csv").then(inData => {
    			inData.forEach(d => {
    				d.totdea_mean = +d.totdea_mean;
    			});

    			data = inData;
    			render();
    		});
    	});

    	function onClick(cname) {
    		if (selectedColorValues.includes(cname) && // at least one has to be selected
    		selectedColorValues.length > 1) {
    			removeItemOnce(selectedColorValues, cname);
    			selectedCountries.splice(0, selectedCountries.length);
    		} else {
    			selectedCountries.splice(0, selectedCountries.length);
    			selectedCountries.push(cname);
    			selectedColorValues.push(cname);
    		}

    		render();
    	}

    	const render = () => {
    		// projections lince chart
    		let lineChartG = svg.selectAll("g.line-chart").data([null]);

    		lineChartG = lineChartG.enter().append("g").attr("class", "line-chart").merge(lineChartG);

    		// select country legend
    		let colorLegendG = svg.selectAll("g.country-legend").data([null]);

    		colorLegendG = colorLegendG.enter().append("g").attr("class", "country-legend").merge(colorLegendG);
    		const width = +svg.attr("width");
    		const height = +svg.attr("height");
    		const parseTime = d3.timeParse("%Y-%m-%d");
    		const yValue = d => d.totdea_mean;
    		const xValue = d => parseTime(d.date);
    		const colorValue = d => d.country;

    		// for nested use to sort
    		const lastYValue = d => yValue(d.values[d.values.length - 1]);

    		const nested = d3.nest().key(colorValue).entries(data).sort((a, b) => d3.descending(lastYValue(a), lastYValue(b)));
    		const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
    		colorScale.domain(nested.map(d => d.key));

    		const margin = {
    			top: 55,
    			right: 200,
    			bottom: 50,
    			left: 100
    		};

    		lineChartG.call(lineChart, {
    			colorScale,
    			colorValue: d => d.key, // instead of colorValue(d) when using nested!
    			yValue,
    			title: projectionsTitle,
    			xValue,
    			xAxisLabel: projectionsXAxisLabel,
    			yAxisLabel: projectionsYAxisLabel,
    			margin,
    			width,
    			height,
    			data,
    			nested,
    			selectedColorValues,
    			selectedCountries
    		});

    		colorLegendG.attr("transform", `translate(800, 45)`).call(colorLegendProjections, {
    			colorScale,
    			circleRadius: 11,
    			spacing: 30,
    			textOffset: 15,
    			onClick,
    			selectedColorValues,
    			language
    		});
    	};

    	$$self.$set = $$props => {
    		if ("projectionsTitle" in $$props) $$invalidate(0, projectionsTitle = $$props.projectionsTitle);
    		if ("projectionsXAxisLabel" in $$props) $$invalidate(1, projectionsXAxisLabel = $$props.projectionsXAxisLabel);
    		if ("projectionsYAxisLabel" in $$props) $$invalidate(2, projectionsYAxisLabel = $$props.projectionsYAxisLabel);
    		if ("language" in $$props) $$invalidate(3, language = $$props.language);
    	};

    	return [projectionsTitle, projectionsXAxisLabel, projectionsYAxisLabel, language];
    }

    class Projections extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {
    			projectionsTitle: 0,
    			projectionsXAxisLabel: 1,
    			projectionsYAxisLabel: 2,
    			language: 3
    		});
    	}
    }

    /* src/Tabs.svelte generated by Svelte v3.22.3 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[3] = list[i];
    	return child_ctx;
    }

    // (18:2) {#if Array.isArray(items)}
    function create_if_block(ctx) {
    	let each_1_anchor;
    	let each_value = /*items*/ ctx[1];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*activeTabValue, items, handleClick*/ 7) {
    				each_value = /*items*/ ctx[1];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (19:4) {#each items as item}
    function create_each_block(ctx) {
    	let li;
    	let span;
    	let t0_value = /*item*/ ctx[3].label + "";
    	let t0;
    	let t1;
    	let li_class_value;
    	let dispose;

    	return {
    		c() {
    			li = element("li");
    			span = element("span");
    			t0 = text(t0_value);
    			t1 = space();
    			attr(span, "class", "svelte-1v427x8");

    			attr(li, "class", li_class_value = "" + (null_to_empty(/*activeTabValue*/ ctx[0] === /*item*/ ctx[3].value
    			? "active"
    			: "") + " svelte-1v427x8"));
    		},
    		m(target, anchor, remount) {
    			insert(target, li, anchor);
    			append(li, span);
    			append(span, t0);
    			append(li, t1);
    			if (remount) dispose();

    			dispose = listen(span, "click", function () {
    				if (is_function(/*handleClick*/ ctx[2](/*item*/ ctx[3].value))) /*handleClick*/ ctx[2](/*item*/ ctx[3].value).apply(this, arguments);
    			});
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*items*/ 2 && t0_value !== (t0_value = /*item*/ ctx[3].label + "")) set_data(t0, t0_value);

    			if (dirty & /*activeTabValue, items*/ 3 && li_class_value !== (li_class_value = "" + (null_to_empty(/*activeTabValue*/ ctx[0] === /*item*/ ctx[3].value
    			? "active"
    			: "") + " svelte-1v427x8"))) {
    				attr(li, "class", li_class_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			dispose();
    		}
    	};
    }

    function create_fragment$5(ctx) {
    	let ul;
    	let show_if = Array.isArray(/*items*/ ctx[1]);
    	let if_block = show_if && create_if_block(ctx);

    	return {
    		c() {
    			ul = element("ul");
    			if (if_block) if_block.c();
    			attr(ul, "class", "svelte-1v427x8");
    		},
    		m(target, anchor) {
    			insert(target, ul, anchor);
    			if (if_block) if_block.m(ul, null);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*items*/ 2) show_if = Array.isArray(/*items*/ ctx[1]);

    			if (show_if) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(ul, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(ul);
    			if (if_block) if_block.d();
    		}
    	};
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { items = [] } = $$props;
    	let { activeTabValue } = $$props;

    	onMount(() => {
    		// Set default tab value
    		if (Array.isArray(items) && items.length && items[0].value) {
    			$$invalidate(0, activeTabValue = items[0].value);
    		}
    	});

    	const handleClick = tabValue => () => $$invalidate(0, activeTabValue = tabValue);

    	$$self.$set = $$props => {
    		if ("items" in $$props) $$invalidate(1, items = $$props.items);
    		if ("activeTabValue" in $$props) $$invalidate(0, activeTabValue = $$props.activeTabValue);
    	};

    	return [activeTabValue, items, handleClick];
    }

    class Tabs extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, { items: 1, activeTabValue: 0 });
    	}
    }

    /* src/Subtabs.svelte generated by Svelte v3.22.3 */

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[3] = list[i];
    	return child_ctx;
    }

    // (19:4) {#if Array.isArray(items)}
    function create_if_block$1(ctx) {
    	let each_1_anchor;
    	let each_value = /*items*/ ctx[1];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*activeTabValue, items, handleClick*/ 7) {
    				each_value = /*items*/ ctx[1];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (20:6) {#each items as item}
    function create_each_block$1(ctx) {
    	let li;
    	let span;
    	let t0_value = /*item*/ ctx[3].label + "";
    	let t0;
    	let t1;
    	let li_class_value;
    	let dispose;

    	return {
    		c() {
    			li = element("li");
    			span = element("span");
    			t0 = text(t0_value);
    			t1 = space();
    			attr(span, "class", "svelte-eadenl");

    			attr(li, "class", li_class_value = "" + (null_to_empty(/*activeTabValue*/ ctx[0] === /*item*/ ctx[3].value
    			? "active"
    			: "") + " svelte-eadenl"));
    		},
    		m(target, anchor, remount) {
    			insert(target, li, anchor);
    			append(li, span);
    			append(span, t0);
    			append(li, t1);
    			if (remount) dispose();

    			dispose = listen(span, "click", function () {
    				if (is_function(/*handleClick*/ ctx[2](/*item*/ ctx[3].value))) /*handleClick*/ ctx[2](/*item*/ ctx[3].value).apply(this, arguments);
    			});
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*items*/ 2 && t0_value !== (t0_value = /*item*/ ctx[3].label + "")) set_data(t0, t0_value);

    			if (dirty & /*activeTabValue, items*/ 3 && li_class_value !== (li_class_value = "" + (null_to_empty(/*activeTabValue*/ ctx[0] === /*item*/ ctx[3].value
    			? "active"
    			: "") + " svelte-eadenl"))) {
    				attr(li, "class", li_class_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			dispose();
    		}
    	};
    }

    function create_fragment$6(ctx) {
    	let div;
    	let ul;
    	let show_if = Array.isArray(/*items*/ ctx[1]);
    	let if_block = show_if && create_if_block$1(ctx);

    	return {
    		c() {
    			div = element("div");
    			ul = element("ul");
    			if (if_block) if_block.c();
    			attr(ul, "class", "svelte-eadenl");
    			attr(div, "class", "container svelte-eadenl");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, ul);
    			if (if_block) if_block.m(ul, null);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*items*/ 2) show_if = Array.isArray(/*items*/ ctx[1]);

    			if (show_if) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$1(ctx);
    					if_block.c();
    					if_block.m(ul, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    		}
    	};
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { items = [] } = $$props;
    	let { activeTabValue } = $$props;

    	onMount(() => {
    		// Set default tab value
    		if (Array.isArray(items) && items.length && items[0].value) {
    			$$invalidate(0, activeTabValue = items[0].value);
    		}
    	});

    	const handleClick = tabValue => () => $$invalidate(0, activeTabValue = tabValue);

    	$$self.$set = $$props => {
    		if ("items" in $$props) $$invalidate(1, items = $$props.items);
    		if ("activeTabValue" in $$props) $$invalidate(0, activeTabValue = $$props.activeTabValue);
    	};

    	return [activeTabValue, items, handleClick];
    }

    class Subtabs extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, { items: 1, activeTabValue: 0 });
    	}
    }

    /* src/SimpleAutocomplete.svelte generated by Svelte v3.22.3 */

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[63] = list[i];
    	child_ctx[65] = i;
    	return child_ctx;
    }

    // (630:28) 
    function create_if_block_4(ctx) {
    	let div;
    	let t;

    	return {
    		c() {
    			div = element("div");
    			t = text(/*noResultsText*/ ctx[1]);
    			attr(div, "class", "autocomplete-list-item-no-results svelte-16ggvsq");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*noResultsText*/ 2) set_data(t, /*noResultsText*/ ctx[1]);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (610:4) {#if filteredListItems && filteredListItems.length > 0}
    function create_if_block$2(ctx) {
    	let t;
    	let if_block_anchor;
    	let each_value = /*filteredListItems*/ ctx[12];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	let if_block = /*maxItemsToShowInList*/ ctx[0] > 0 && /*filteredListItems*/ ctx[12].length > /*maxItemsToShowInList*/ ctx[0] && create_if_block_1(ctx);

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, t, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*highlightIndex, onListItemClick, filteredListItems, maxItemsToShowInList*/ 14337) {
    				each_value = /*filteredListItems*/ ctx[12];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(t.parentNode, t);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (/*maxItemsToShowInList*/ ctx[0] > 0 && /*filteredListItems*/ ctx[12].length > /*maxItemsToShowInList*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_1(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(t);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (612:8) {#if maxItemsToShowInList <= 0 || i < maxItemsToShowInList}
    function create_if_block_2(ctx) {
    	let div;
    	let div_class_value;
    	let dispose;

    	function select_block_type_1(ctx, dirty) {
    		if (/*listItem*/ ctx[63].highlighted) return create_if_block_3;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type_1(ctx);
    	let if_block = current_block_type(ctx);

    	function click_handler(...args) {
    		return /*click_handler*/ ctx[61](/*listItem*/ ctx[63], ...args);
    	}

    	return {
    		c() {
    			div = element("div");
    			if_block.c();

    			attr(div, "class", div_class_value = "autocomplete-list-item " + (/*i*/ ctx[65] === /*highlightIndex*/ ctx[11]
    			? "selected"
    			: "") + " svelte-16ggvsq");
    		},
    		m(target, anchor, remount) {
    			insert(target, div, anchor);
    			if_block.m(div, null);
    			if (remount) dispose();
    			dispose = listen(div, "click", click_handler);
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (current_block_type === (current_block_type = select_block_type_1(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div, null);
    				}
    			}

    			if (dirty[0] & /*highlightIndex*/ 2048 && div_class_value !== (div_class_value = "autocomplete-list-item " + (/*i*/ ctx[65] === /*highlightIndex*/ ctx[11]
    			? "selected"
    			: "") + " svelte-16ggvsq")) {
    				attr(div, "class", div_class_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if_block.d();
    			dispose();
    		}
    	};
    }

    // (618:12) {:else}
    function create_else_block(ctx) {
    	let html_tag;
    	let raw_value = /*listItem*/ ctx[63].label + "";

    	return {
    		c() {
    			html_tag = new HtmlTag(raw_value, null);
    		},
    		m(target, anchor) {
    			html_tag.m(target, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*filteredListItems*/ 4096 && raw_value !== (raw_value = /*listItem*/ ctx[63].label + "")) html_tag.p(raw_value);
    		},
    		d(detaching) {
    			if (detaching) html_tag.d();
    		}
    	};
    }

    // (616:12) {#if listItem.highlighted}
    function create_if_block_3(ctx) {
    	let html_tag;
    	let raw_value = /*listItem*/ ctx[63].highlighted.label + "";

    	return {
    		c() {
    			html_tag = new HtmlTag(raw_value, null);
    		},
    		m(target, anchor) {
    			html_tag.m(target, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*filteredListItems*/ 4096 && raw_value !== (raw_value = /*listItem*/ ctx[63].highlighted.label + "")) html_tag.p(raw_value);
    		},
    		d(detaching) {
    			if (detaching) html_tag.d();
    		}
    	};
    }

    // (611:6) {#each filteredListItems as listItem, i}
    function create_each_block$2(ctx) {
    	let if_block_anchor;
    	let if_block = (/*maxItemsToShowInList*/ ctx[0] <= 0 || /*i*/ ctx[65] < /*maxItemsToShowInList*/ ctx[0]) && create_if_block_2(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (/*maxItemsToShowInList*/ ctx[0] <= 0 || /*i*/ ctx[65] < /*maxItemsToShowInList*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_2(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (625:6) {#if maxItemsToShowInList > 0 && filteredListItems.length > maxItemsToShowInList}
    function create_if_block_1(ctx) {
    	let div;
    	let t0;
    	let t1_value = /*filteredListItems*/ ctx[12].length - /*maxItemsToShowInList*/ ctx[0] + "";
    	let t1;
    	let t2;

    	return {
    		c() {
    			div = element("div");
    			t0 = text("...");
    			t1 = text(t1_value);
    			t2 = text(" results not shown");
    			attr(div, "class", "autocomplete-list-item-no-results svelte-16ggvsq");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, t1);
    			append(div, t2);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*filteredListItems, maxItemsToShowInList*/ 4097 && t1_value !== (t1_value = /*filteredListItems*/ ctx[12].length - /*maxItemsToShowInList*/ ctx[0] + "")) set_data(t1, t1_value);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    function create_fragment$7(ctx) {
    	let div1;
    	let input_1;
    	let t;
    	let div0;
    	let div0_class_value;
    	let div1_class_value;
    	let dispose;

    	function select_block_type(ctx, dirty) {
    		if (/*filteredListItems*/ ctx[12] && /*filteredListItems*/ ctx[12].length > 0) return create_if_block$2;
    		if (/*noResultsText*/ ctx[1]) return create_if_block_4;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type && current_block_type(ctx);

    	return {
    		c() {
    			div1 = element("div");
    			input_1 = element("input");
    			t = space();
    			div0 = element("div");
    			if (if_block) if_block.c();
    			attr(input_1, "type", "text");
    			attr(input_1, "placeholder", /*placeholder*/ ctx[2]);
    			attr(input_1, "name", /*name*/ ctx[4]);
    			input_1.disabled = /*disabled*/ ctx[5];
    			attr(input_1, "title", /*title*/ ctx[6]);
    			attr(input_1, "class", "input autocomplete-input svelte-16ggvsq");
    			attr(div0, "class", div0_class_value = "autocomplete-list " + (/*opened*/ ctx[10] ? "" : "hidden") + " is-fullwidth" + " svelte-16ggvsq");
    			attr(div1, "class", div1_class_value = "" + (/*className*/ ctx[3] + " autocomplete select is-fullwidth" + " svelte-16ggvsq"));
    		},
    		m(target, anchor, remount) {
    			insert(target, div1, anchor);
    			append(div1, input_1);
    			/*input_1_binding*/ ctx[59](input_1);
    			set_input_value(input_1, /*text*/ ctx[7]);
    			append(div1, t);
    			append(div1, div0);
    			if (if_block) if_block.m(div0, null);
    			/*div0_binding*/ ctx[62](div0);
    			if (remount) run_all(dispose);

    			dispose = [
    				listen(window, "click", /*onDocumentClick*/ ctx[14]),
    				listen(input_1, "input", /*input_1_input_handler*/ ctx[60]),
    				listen(input_1, "input", /*onInput*/ ctx[17]),
    				listen(input_1, "focus", /*onFocus*/ ctx[19]),
    				listen(input_1, "keydown", /*onKeyDown*/ ctx[15]),
    				listen(input_1, "click", /*onInputClick*/ ctx[18]),
    				listen(input_1, "keypress", /*onKeyPress*/ ctx[16])
    			];
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*placeholder*/ 4) {
    				attr(input_1, "placeholder", /*placeholder*/ ctx[2]);
    			}

    			if (dirty[0] & /*name*/ 16) {
    				attr(input_1, "name", /*name*/ ctx[4]);
    			}

    			if (dirty[0] & /*disabled*/ 32) {
    				input_1.disabled = /*disabled*/ ctx[5];
    			}

    			if (dirty[0] & /*title*/ 64) {
    				attr(input_1, "title", /*title*/ ctx[6]);
    			}

    			if (dirty[0] & /*text*/ 128 && input_1.value !== /*text*/ ctx[7]) {
    				set_input_value(input_1, /*text*/ ctx[7]);
    			}

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if (if_block) if_block.d(1);
    				if_block = current_block_type && current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div0, null);
    				}
    			}

    			if (dirty[0] & /*opened*/ 1024 && div0_class_value !== (div0_class_value = "autocomplete-list " + (/*opened*/ ctx[10] ? "" : "hidden") + " is-fullwidth" + " svelte-16ggvsq")) {
    				attr(div0, "class", div0_class_value);
    			}

    			if (dirty[0] & /*className*/ 8 && div1_class_value !== (div1_class_value = "" + (/*className*/ ctx[3] + " autocomplete select is-fullwidth" + " svelte-16ggvsq"))) {
    				attr(div1, "class", div1_class_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div1);
    			/*input_1_binding*/ ctx[59](null);

    			if (if_block) {
    				if_block.d();
    			}

    			/*div0_binding*/ ctx[62](null);
    			run_all(dispose);
    		}
    	};
    }

    function safeStringFunction(theFunction, argument) {
    	if (typeof theFunction !== "function") {
    		console.error("Not a function: " + theFunction + ", argument: " + argument);
    	}

    	let originalResult;

    	try {
    		originalResult = theFunction(argument);
    	} catch(error) {
    		console.warn("Error executing Autocomplete function on value: " + argument + " function: " + theFunction);
    	}

    	let result = originalResult;

    	if (result === undefined || result === null) {
    		result = "";
    	}

    	if (typeof result !== "string") {
    		result = result.toString();
    	}

    	return result;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { items } = $$props;
    	let { labelFieldName = undefined } = $$props;
    	let { keywordsFieldName = labelFieldName } = $$props;
    	let { valueFieldName = undefined } = $$props;

    	let { labelFunction = function (item) {
    		if (item === undefined || item === null) {
    			return "";
    		}

    		return labelFieldName ? item[labelFieldName] : item;
    	} } = $$props;

    	let { keywordsFunction = function (item) {
    		if (item === undefined || item === null) {
    			return "";
    		}

    		return keywordsFieldName ? item[keywordsFieldName] : item;
    	} } = $$props;

    	let { valueFunction = function (item) {
    		if (item === undefined || item === null) {
    			return item;
    		}

    		return valueFieldName ? item[valueFieldName] : item;
    	} } = $$props;

    	let { keywordsCleanFunction = function (keywords) {
    		return keywords;
    	} } = $$props;

    	let { textCleanFunction = function (userEnteredText) {
    		return userEnteredText;
    	} } = $$props;

    	let { beforeChange = function (oldSelectedItem, newSelectedItem) {
    		return true;
    	} } = $$props;

    	let { onChange = function (newSelectedItem) {
    		
    	} } = $$props;

    	let { selectFirstIfEmpty = false } = $$props;
    	let { minCharactersToSearch = 1 } = $$props;
    	let { maxItemsToShowInList = 0 } = $$props;
    	let { noResultsText = "No results found" } = $$props;

    	function safeLabelFunction(item) {
    		// console.log("labelFunction: " + labelFunction);
    		// console.log("safeLabelFunction, item: " + item);
    		return safeStringFunction(labelFunction, item);
    	}

    	function safeKeywordsFunction(item) {
    		// console.log("safeKeywordsFunction");
    		const keywords = safeStringFunction(keywordsFunction, item);

    		let result = safeStringFunction(keywordsCleanFunction, keywords);
    		result = result.toLowerCase().trim();

    		if (debug) {
    			console.log("Extracted keywords: '" + result + "' from item: " + JSON.stringify(item));
    		}

    		return result;
    	}

    	let { placeholder = undefined } = $$props;
    	let { className = undefined } = $$props;
    	let { name = undefined } = $$props;
    	let { disabled = false } = $$props;
    	let { title = undefined } = $$props;
    	let { debug = false } = $$props;
    	let { selectedItem = undefined } = $$props;
    	let { value = undefined } = $$props;
    	let text;
    	let filteredTextLength = 0;

    	function onSelectedItemChanged() {
    		$$invalidate(21, value = valueFunction(selectedItem));
    		$$invalidate(7, text = safeLabelFunction(selectedItem));
    		onChange(selectedItem);
    	}

    	// HTML elements
    	let input;

    	let list;

    	// UI state
    	let opened = false;

    	let highlightIndex = -1;

    	// view model
    	let filteredListItems;

    	let listItems = [];

    	function prepareListItems() {
    		let tStart;

    		if (debug) {
    			tStart = performance.now();
    			console.log("prepare items to search");
    			console.log("items: " + JSON.stringify(items));
    		}

    		const length = items ? items.length : 0;
    		listItems = new Array(length);

    		if (length > 0) {
    			items.forEach((item, i) => {
    				listItems[i] = getListItem(item);
    			});
    		}

    		if (debug) {
    			const tEnd = performance.now();
    			console.log(listItems.length + " items to search prepared in " + (tEnd - tStart) + " milliseconds");
    		}
    	}

    	function getListItem(item) {
    		return {
    			// keywords representation of the item
    			keywords: safeKeywordsFunction(item),
    			// item label
    			label: safeLabelFunction(item),
    			// store reference to the origial item
    			item
    		};
    	}

    	function prepareUserEnteredText(userEnteredText) {
    		if (userEnteredText === undefined || userEnteredText === null) {
    			return "";
    		}

    		const textFiltered = userEnteredText.replace(/[&/\\#,+()$~%.'":*?<>{}]/g, " ").trim();
    		filteredTextLength = textFiltered.length;

    		if (minCharactersToSearch > 1) {
    			if (filteredTextLength < minCharactersToSearch) {
    				return "";
    			}
    		}

    		const cleanUserEnteredText = textCleanFunction(textFiltered);
    		const textFilteredLowerCase = cleanUserEnteredText.toLowerCase().trim();

    		if (debug) {
    			console.log("Change user entered text '" + userEnteredText + "' into '" + textFilteredLowerCase + "'");
    		}

    		return textFilteredLowerCase;
    	}

    	function search() {
    		let tStart;

    		if (debug) {
    			tStart = performance.now();
    			console.log("Searching user entered text: '" + text + "'");
    		}

    		const textFiltered = prepareUserEnteredText(text);

    		if (textFiltered === "") {
    			$$invalidate(12, filteredListItems = listItems);
    			closeIfMinCharsToSearchReached();

    			if (debug) {
    				console.log("User entered text is empty set the list of items to all items");
    			}

    			return;
    		}

    		const searchWords = textFiltered.split(" ");

    		let tempfilteredListItems = listItems.filter(listItem => {
    			const itemKeywords = listItem.keywords;
    			let matches = 0;

    			searchWords.forEach(searchWord => {
    				if (itemKeywords.includes(searchWord)) {
    					matches++;
    				}
    			});

    			return matches >= searchWords.length;
    		});

    		const hlfilter = highlightFilter(textFiltered, ["label"]);
    		const filteredListItemsHighlighted = tempfilteredListItems.map(hlfilter);
    		$$invalidate(12, filteredListItems = filteredListItemsHighlighted);
    		closeIfMinCharsToSearchReached();

    		if (debug) {
    			const tEnd = performance.now();
    			console.log("Search took " + (tEnd - tStart) + " milliseconds, found " + filteredListItems.length + " items");
    		}
    	}

    	// $: text, search();
    	function selectListItem(listItem) {
    		if (debug) {
    			console.log("selectListItem");
    		}

    		const newSelectedItem = listItem.item;

    		if (beforeChange(selectedItem, newSelectedItem)) {
    			$$invalidate(20, selectedItem = newSelectedItem);
    		}
    	}

    	function selectItem() {
    		if (debug) {
    			console.log("selectItem");
    		}

    		const listItem = filteredListItems[highlightIndex];
    		selectListItem(listItem);
    		close();
    	}

    	function up() {
    		if (debug) {
    			console.log("up");
    		}

    		open();
    		if (highlightIndex > 0) $$invalidate(11, highlightIndex--, highlightIndex);
    		highlight();
    	}

    	function down() {
    		if (debug) {
    			console.log("down");
    		}

    		open();
    		if (highlightIndex < filteredListItems.length - 1) $$invalidate(11, highlightIndex++, highlightIndex);
    		highlight();
    	}

    	function highlight() {
    		if (debug) {
    			console.log("highlight");
    		}

    		const query = ".selected";

    		if (debug) {
    			console.log("Seaching DOM element: " + query + " in " + list);
    		}

    		const el = list.querySelector(query);

    		if (el) {
    			if (typeof el.scrollIntoViewIfNeeded === "function") {
    				if (debug) {
    					console.log("Scrolling selected item into view");
    				}

    				el.scrollIntoViewIfNeeded();
    			} else {
    				if (debug) {
    					console.warn("Could not scroll selected item into view, scrollIntoViewIfNeeded not supported");
    				}
    			}
    		} else {
    			if (debug) {
    				console.warn("Selected item not found to scroll into view");
    			}
    		}
    	}

    	function onListItemClick(listItem) {
    		if (debug) {
    			console.log("onListItemClick");
    		}

    		selectListItem(listItem);
    		close();
    	}

    	function onDocumentClick(e) {
    		if (debug) {
    			console.log("onDocumentClick: " + JSON.stringify(e.target));
    		}

    		if (!e.target.closest(".autocomplete")) {
    			if (debug) {
    				console.log("onDocumentClick outside");
    			}

    			close();
    		} else {
    			// if (debug) {
    			//   console.log("onDocumentClick inside");
    			// }
    			// resetListToAllItemsAndOpen();
    			highlight();
    		}
    	}

    	function onKeyDown(e) {
    		if (debug) {
    			console.log("onKeyDown");
    		}

    		let key = e.key;
    		if (key === "Tab" && e.shiftKey) key = "ShiftTab";

    		const fnmap = {
    			Tab: opened ? down.bind(this) : null,
    			ShiftTab: opened ? up.bind(this) : null,
    			ArrowDown: down.bind(this),
    			ArrowUp: up.bind(this),
    			Escape: onEsc.bind(this)
    		};

    		const fn = fnmap[key];

    		if (typeof fn === "function") {
    			e.preventDefault();
    			fn(e);
    		}
    	}

    	function onKeyPress(e) {
    		if (debug) {
    			console.log("onKeyPress");
    		}

    		if (e.key === "Enter") {
    			e.preventDefault();
    			selectItem();
    		}
    	}

    	function onInput(e) {
    		if (debug) {
    			console.log("onInput");
    		}

    		$$invalidate(7, text = e.target.value);
    		search();
    		$$invalidate(11, highlightIndex = 0);
    		open();
    	}

    	function onInputClick() {
    		if (debug) {
    			console.log("onInputClick");
    		}

    		resetListToAllItemsAndOpen();
    	}

    	function onEsc(e) {
    		if (debug) {
    			console.log("onEsc");
    		}

    		//if (text) return clear();
    		e.stopPropagation();

    		if (opened) {
    			input.focus();
    			close();
    		}
    	}

    	function onFocus() {
    		if (debug) {
    			console.log("onFocus");
    		}

    		resetListToAllItemsAndOpen();
    	}

    	function resetListToAllItemsAndOpen() {
    		if (debug) {
    			console.log("resetListToAllItemsAndOpen");
    		}

    		$$invalidate(12, filteredListItems = listItems);
    		open();

    		// find selected item
    		if (selectedItem) {
    			if (debug) {
    				console.log("Searching currently selected item: " + JSON.stringify(selectedItem));
    			}

    			for (let i = 0; i < listItems.length; i++) {
    				const listItem = listItems[i];

    				if (debug) {
    					console.log("Item " + i + ": " + JSON.stringify(listItem));
    				}

    				if (selectedItem == listItem.item) {
    					$$invalidate(11, highlightIndex = i);

    					if (debug) {
    						console.log("Found selected item: " + i + ": " + JSON.stringify(listItem));
    					}

    					highlight();
    					break;
    				}
    			}
    		}
    	}

    	function open() {
    		if (debug) {
    			console.log("open");
    		}

    		// check if the search text has more than the min chars required
    		if (isMinCharsToSearchReached()) {
    			return;
    		}

    		$$invalidate(10, opened = true);
    	}

    	function close() {
    		if (debug) {
    			console.log("close");
    		}

    		$$invalidate(10, opened = false);

    		if (!text && selectFirstIfEmpty) {
    			highlightFilter = 0;
    			selectItem();
    		}
    	}

    	function isMinCharsToSearchReached() {
    		return minCharactersToSearch > 1 && filteredTextLength < minCharactersToSearch;
    	}

    	function closeIfMinCharsToSearchReached() {
    		if (isMinCharsToSearchReached()) {
    			close();
    		}
    	}

    	function clear() {
    		if (debug) {
    			console.log("clear");
    		}

    		$$invalidate(7, text = "");
    		setTimeout(() => input.focus());
    	}

    	function onBlur() {
    		if (debug) {
    			console.log("onBlur");
    		}

    		close();
    	}

    	// 'item number one'.replace(/(it)(.*)(nu)(.*)(one)/ig, '<b>$1</b>$2 <b>$3</b>$4 <b>$5</b>')
    	function highlightFilter(q, fields) {
    		const qs = "(" + q.trim().replace(/\s/g, ")(.*)(") + ")";
    		const reg = new RegExp(qs, "ig");
    		let n = 1;
    		const len = qs.split(")(").length + 1;
    		let repl = "";
    		for (; n < len; n++) repl += n % 2 ? `<b>$${n}</b>` : `$${n}`;

    		return i => {
    			const newI = Object.assign({ highlighted: {} }, i);

    			if (fields) {
    				fields.forEach(f => {
    					if (!newI[f]) return;
    					newI.highlighted[f] = newI[f].replace(reg, repl);
    				});
    			}

    			return newI;
    		};
    	}

    	function input_1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(8, input = $$value);
    		});
    	}

    	function input_1_input_handler() {
    		text = this.value;
    		$$invalidate(7, text);
    	}

    	const click_handler = listItem => onListItemClick(listItem);

    	function div0_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(9, list = $$value);
    		});
    	}

    	$$self.$set = $$props => {
    		if ("items" in $$props) $$invalidate(22, items = $$props.items);
    		if ("labelFieldName" in $$props) $$invalidate(23, labelFieldName = $$props.labelFieldName);
    		if ("keywordsFieldName" in $$props) $$invalidate(24, keywordsFieldName = $$props.keywordsFieldName);
    		if ("valueFieldName" in $$props) $$invalidate(25, valueFieldName = $$props.valueFieldName);
    		if ("labelFunction" in $$props) $$invalidate(26, labelFunction = $$props.labelFunction);
    		if ("keywordsFunction" in $$props) $$invalidate(27, keywordsFunction = $$props.keywordsFunction);
    		if ("valueFunction" in $$props) $$invalidate(28, valueFunction = $$props.valueFunction);
    		if ("keywordsCleanFunction" in $$props) $$invalidate(29, keywordsCleanFunction = $$props.keywordsCleanFunction);
    		if ("textCleanFunction" in $$props) $$invalidate(30, textCleanFunction = $$props.textCleanFunction);
    		if ("beforeChange" in $$props) $$invalidate(31, beforeChange = $$props.beforeChange);
    		if ("onChange" in $$props) $$invalidate(32, onChange = $$props.onChange);
    		if ("selectFirstIfEmpty" in $$props) $$invalidate(33, selectFirstIfEmpty = $$props.selectFirstIfEmpty);
    		if ("minCharactersToSearch" in $$props) $$invalidate(34, minCharactersToSearch = $$props.minCharactersToSearch);
    		if ("maxItemsToShowInList" in $$props) $$invalidate(0, maxItemsToShowInList = $$props.maxItemsToShowInList);
    		if ("noResultsText" in $$props) $$invalidate(1, noResultsText = $$props.noResultsText);
    		if ("placeholder" in $$props) $$invalidate(2, placeholder = $$props.placeholder);
    		if ("className" in $$props) $$invalidate(3, className = $$props.className);
    		if ("name" in $$props) $$invalidate(4, name = $$props.name);
    		if ("disabled" in $$props) $$invalidate(5, disabled = $$props.disabled);
    		if ("title" in $$props) $$invalidate(6, title = $$props.title);
    		if ("debug" in $$props) $$invalidate(35, debug = $$props.debug);
    		if ("selectedItem" in $$props) $$invalidate(20, selectedItem = $$props.selectedItem);
    		if ("value" in $$props) $$invalidate(21, value = $$props.value);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*selectedItem*/ 1048576) {
    			 (onSelectedItemChanged());
    		}

    		if ($$self.$$.dirty[0] & /*items*/ 4194304) {
    			 (prepareListItems());
    		}
    	};

    	return [
    		maxItemsToShowInList,
    		noResultsText,
    		placeholder,
    		className,
    		name,
    		disabled,
    		title,
    		text,
    		input,
    		list,
    		opened,
    		highlightIndex,
    		filteredListItems,
    		onListItemClick,
    		onDocumentClick,
    		onKeyDown,
    		onKeyPress,
    		onInput,
    		onInputClick,
    		onFocus,
    		selectedItem,
    		value,
    		items,
    		labelFieldName,
    		keywordsFieldName,
    		valueFieldName,
    		labelFunction,
    		keywordsFunction,
    		valueFunction,
    		keywordsCleanFunction,
    		textCleanFunction,
    		beforeChange,
    		onChange,
    		selectFirstIfEmpty,
    		minCharactersToSearch,
    		debug,
    		filteredTextLength,
    		listItems,
    		highlightFilter,
    		safeLabelFunction,
    		safeKeywordsFunction,
    		onSelectedItemChanged,
    		prepareListItems,
    		getListItem,
    		prepareUserEnteredText,
    		search,
    		selectListItem,
    		selectItem,
    		up,
    		down,
    		highlight,
    		onEsc,
    		resetListToAllItemsAndOpen,
    		open,
    		close,
    		isMinCharsToSearchReached,
    		closeIfMinCharsToSearchReached,
    		clear,
    		onBlur,
    		input_1_binding,
    		input_1_input_handler,
    		click_handler,
    		div0_binding
    	];
    }

    class SimpleAutocomplete extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$7,
    			create_fragment$7,
    			safe_not_equal,
    			{
    				items: 22,
    				labelFieldName: 23,
    				keywordsFieldName: 24,
    				valueFieldName: 25,
    				labelFunction: 26,
    				keywordsFunction: 27,
    				valueFunction: 28,
    				keywordsCleanFunction: 29,
    				textCleanFunction: 30,
    				beforeChange: 31,
    				onChange: 32,
    				selectFirstIfEmpty: 33,
    				minCharactersToSearch: 34,
    				maxItemsToShowInList: 0,
    				noResultsText: 1,
    				placeholder: 2,
    				className: 3,
    				name: 4,
    				disabled: 5,
    				title: 6,
    				debug: 35,
    				selectedItem: 20,
    				value: 21
    			},
    			[-1, -1, -1]
    		);
    	}
    }

    /*
    Adapted from https://github.com/mattdesl
    Distributed under MIT License https://github.com/mattdesl/eases/blob/master/LICENSE.md
    */
    function backInOut(t) {
        const s = 1.70158 * 1.525;
        if ((t *= 2) < 1)
            return 0.5 * (t * t * ((s + 1) * t - s));
        return 0.5 * ((t -= 2) * t * ((s + 1) * t + s) + 2);
    }
    function backIn(t) {
        const s = 1.70158;
        return t * t * ((s + 1) * t - s);
    }
    function backOut(t) {
        const s = 1.70158;
        return --t * t * ((s + 1) * t + s) + 1;
    }
    function bounceOut(t) {
        const a = 4.0 / 11.0;
        const b = 8.0 / 11.0;
        const c = 9.0 / 10.0;
        const ca = 4356.0 / 361.0;
        const cb = 35442.0 / 1805.0;
        const cc = 16061.0 / 1805.0;
        const t2 = t * t;
        return t < a
            ? 7.5625 * t2
            : t < b
                ? 9.075 * t2 - 9.9 * t + 3.4
                : t < c
                    ? ca * t2 - cb * t + cc
                    : 10.8 * t * t - 20.52 * t + 10.72;
    }
    function bounceInOut(t) {
        return t < 0.5
            ? 0.5 * (1.0 - bounceOut(1.0 - t * 2.0))
            : 0.5 * bounceOut(t * 2.0 - 1.0) + 0.5;
    }
    function bounceIn(t) {
        return 1.0 - bounceOut(1.0 - t);
    }
    function circInOut(t) {
        if ((t *= 2) < 1)
            return -0.5 * (Math.sqrt(1 - t * t) - 1);
        return 0.5 * (Math.sqrt(1 - (t -= 2) * t) + 1);
    }
    function circIn(t) {
        return 1.0 - Math.sqrt(1.0 - t * t);
    }
    function circOut(t) {
        return Math.sqrt(1 - --t * t);
    }
    function cubicInOut(t) {
        return t < 0.5 ? 4.0 * t * t * t : 0.5 * Math.pow(2.0 * t - 2.0, 3.0) + 1.0;
    }
    function cubicIn(t) {
        return t * t * t;
    }
    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }
    function elasticInOut(t) {
        return t < 0.5
            ? 0.5 *
                Math.sin(((+13.0 * Math.PI) / 2) * 2.0 * t) *
                Math.pow(2.0, 10.0 * (2.0 * t - 1.0))
            : 0.5 *
                Math.sin(((-13.0 * Math.PI) / 2) * (2.0 * t - 1.0 + 1.0)) *
                Math.pow(2.0, -10.0 * (2.0 * t - 1.0)) +
                1.0;
    }
    function elasticIn(t) {
        return Math.sin((13.0 * t * Math.PI) / 2) * Math.pow(2.0, 10.0 * (t - 1.0));
    }
    function elasticOut(t) {
        return (Math.sin((-13.0 * (t + 1.0) * Math.PI) / 2) * Math.pow(2.0, -10.0 * t) + 1.0);
    }
    function expoInOut(t) {
        return t === 0.0 || t === 1.0
            ? t
            : t < 0.5
                ? +0.5 * Math.pow(2.0, 20.0 * t - 10.0)
                : -0.5 * Math.pow(2.0, 10.0 - t * 20.0) + 1.0;
    }
    function expoIn(t) {
        return t === 0.0 ? t : Math.pow(2.0, 10.0 * (t - 1.0));
    }
    function expoOut(t) {
        return t === 1.0 ? t : 1.0 - Math.pow(2.0, -10.0 * t);
    }
    function quadInOut(t) {
        t /= 0.5;
        if (t < 1)
            return 0.5 * t * t;
        t--;
        return -0.5 * (t * (t - 2) - 1);
    }
    function quadIn(t) {
        return t * t;
    }
    function quadOut(t) {
        return -t * (t - 2.0);
    }
    function quartInOut(t) {
        return t < 0.5
            ? +8.0 * Math.pow(t, 4.0)
            : -8.0 * Math.pow(t - 1.0, 4.0) + 1.0;
    }
    function quartIn(t) {
        return Math.pow(t, 4.0);
    }
    function quartOut(t) {
        return Math.pow(t - 1.0, 3.0) * (1.0 - t) + 1.0;
    }
    function quintInOut(t) {
        if ((t *= 2) < 1)
            return 0.5 * t * t * t * t * t;
        return 0.5 * ((t -= 2) * t * t * t * t + 2);
    }
    function quintIn(t) {
        return t * t * t * t * t;
    }
    function quintOut(t) {
        return --t * t * t * t * t + 1;
    }
    function sineInOut(t) {
        return -0.5 * (Math.cos(Math.PI * t) - 1);
    }
    function sineIn(t) {
        const v = Math.cos(t * Math.PI * 0.5);
        if (Math.abs(v) < 1e-14)
            return 1;
        else
            return 1 - v;
    }
    function sineOut(t) {
        return Math.sin((t * Math.PI) / 2);
    }

    var easings = /*#__PURE__*/Object.freeze({
        __proto__: null,
        backIn: backIn,
        backInOut: backInOut,
        backOut: backOut,
        bounceIn: bounceIn,
        bounceInOut: bounceInOut,
        bounceOut: bounceOut,
        circIn: circIn,
        circInOut: circInOut,
        circOut: circOut,
        cubicIn: cubicIn,
        cubicInOut: cubicInOut,
        cubicOut: cubicOut,
        elasticIn: elasticIn,
        elasticInOut: elasticInOut,
        elasticOut: elasticOut,
        expoIn: expoIn,
        expoInOut: expoInOut,
        expoOut: expoOut,
        quadIn: quadIn,
        quadInOut: quadInOut,
        quadOut: quadOut,
        quartIn: quartIn,
        quartInOut: quartInOut,
        quartOut: quartOut,
        quintIn: quintIn,
        quintInOut: quintInOut,
        quintOut: quintOut,
        sineIn: sineIn,
        sineInOut: sineInOut,
        sineOut: sineOut,
        linear: identity
    });

    function fade(node, { delay = 0, duration = 400, easing = identity }) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }
    function fly(node, { delay = 0, duration = 400, easing = cubicOut, x = 0, y = 0, opacity = 0 }) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - (od * u)}`
        };
    }

    var _ = {
      $(selector) {
        if (typeof selector === "string") {
          return document.querySelector(selector);
        }
        return selector;
      },
      extend(...args) {
        return Object.assign(...args);
      },
      cumulativeOffset(element) {
        let top = 0;
        let left = 0;

        do {
          top += element.offsetTop || 0;
          left += element.offsetLeft || 0;
          element = element.offsetParent;
        } while (element);

        return {
          top: top,
          left: left
        };
      },
      directScroll(element) {
        return element && element !== document && element !== document.body;
      },
      scrollTop(element, value) {
        let inSetter = value !== undefined;
        if (this.directScroll(element)) {
          return inSetter ? (element.scrollTop = value) : element.scrollTop;
        } else {
          return inSetter
            ? (document.documentElement.scrollTop = document.body.scrollTop = value)
            : window.pageYOffset ||
                document.documentElement.scrollTop ||
                document.body.scrollTop ||
                0;
        }
      },
      scrollLeft(element, value) {
        let inSetter = value !== undefined;
        if (this.directScroll(element)) {
          return inSetter ? (element.scrollLeft = value) : element.scrollLeft;
        } else {
          return inSetter
            ? (document.documentElement.scrollLeft = document.body.scrollLeft = value)
            : window.pageXOffset ||
                document.documentElement.scrollLeft ||
                document.body.scrollLeft ||
                0;
        }
      }
    };

    const defaultOptions = {
      container: "body",
      duration: 500,
      delay: 0,
      offset: 0,
      easing: "cubicInOut",
      onStart: noop,
      onDone: noop,
      onAborting: noop,
      scrollX: false,
      scrollY: true
    };

    const _scrollTo = options => {
      let {
        offset,
        duration,
        delay,
        easing,
        x=0,
        y=0,
        scrollX,
        scrollY,
        onStart,
        onDone,
        container,
        onAborting,
        element
      } = options;

      if (typeof easing === "string") {
        easing = easings[easing];
      }
      if (typeof offset === "function") {
        offset = offset();
      }

      var cumulativeOffsetContainer = _.cumulativeOffset(container);
      var cumulativeOffsetTarget = element
        ? _.cumulativeOffset(element)
        : { top: y, left: x };

      var initialX = _.scrollLeft(container);
      var initialY = _.scrollTop(container);

      var targetX =
        cumulativeOffsetTarget.left - cumulativeOffsetContainer.left + offset;
      var targetY =
        cumulativeOffsetTarget.top - cumulativeOffsetContainer.top + offset;

      var diffX = targetX - initialX;
    	var diffY = targetY - initialY;

      let scrolling = true;
      let started = false;
      let start_time = now() + delay;
      let end_time = start_time + duration;

      function scrollToTopLeft(element, top, left) {
        if (scrollX) _.scrollLeft(element, left);
        if (scrollY) _.scrollTop(element, top);
      }

      function start(delayStart) {
        if (!delayStart) {
          started = true;
          onStart(element, {x, y});
        }
      }

      function tick(progress) {
        scrollToTopLeft(
          container,
          initialY + diffY * progress,
          initialX + diffX * progress
        );
      }

      function stop() {
        scrolling = false;
      }

      loop(now => {
        if (!started && now >= start_time) {
          start(false);
        }

        if (started && now >= end_time) {
          tick(1);
          stop();
          onDone(element, {x, y});
        }

        if (!scrolling) {
          onAborting(element, {x, y});
          return false;
        }
        if (started) {
          const p = now - start_time;
          const t = 0 + 1 * easing(p / duration);
          tick(t);
        }

        return true;
      });

      start(delay);

      tick(0);

      return stop;
    };

    const proceedOptions = options => {
    	let opts = _.extend({}, defaultOptions, options);
      opts.container = _.$(opts.container);
      opts.element = _.$(opts.element);
      return opts;
    };

    const scrollContainerHeight = containerElement => {
      if (
        containerElement &&
        containerElement !== document &&
        containerElement !== document.body
      ) {
        return containerElement.scrollHeight - containerElement.offsetHeight;
      } else {
        let body = document.body;
        let html = document.documentElement;

        return Math.max(
          body.scrollHeight,
          body.offsetHeight,
          html.clientHeight,
          html.scrollHeight,
          html.offsetHeight
        );
      }
    };

    const scrollToBottom = options => {
      options = proceedOptions(options);

      return _scrollTo(
        _.extend(options, {
          element: null,
          y: scrollContainerHeight(options.container)
        })
      );
    };

    /* src/Square.svelte generated by Svelte v3.22.3 */

    function create_fragment$8(ctx) {
    	let svg;
    	let style;
    	let t0;
    	let rect;
    	let text_1;
    	let t1;
    	let svg_width_value;

    	return {
    		c() {
    			svg = svg_element("svg");
    			style = svg_element("style");
    			t0 = text(".small { \n      font-size: 14px;\n      font-family: 'Roboto', sans-serif;\n      font-weight: 400;\n    }\n  ");
    			rect = svg_element("rect");
    			text_1 = svg_element("text");
    			t1 = text(/*text*/ ctx[0]);
    			attr(rect, "width", /*size*/ ctx[1]);
    			attr(rect, "height", /*size*/ ctx[1]);
    			attr(rect, "style", /*fillText*/ ctx[3]);
    			attr(rect, "rx", "1.7");
    			attr(text_1, "x", "20");
    			attr(text_1, "y", "13.5");
    			attr(text_1, "class", "small");
    			attr(svg, "width", svg_width_value = /*size*/ ctx[1] * /*factorWidth*/ ctx[2]);
    			attr(svg, "height", /*size*/ ctx[1]);
    		},
    		m(target, anchor) {
    			insert(target, svg, anchor);
    			append(svg, style);
    			append(style, t0);
    			append(svg, rect);
    			append(svg, text_1);
    			append(text_1, t1);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*size*/ 2) {
    				attr(rect, "width", /*size*/ ctx[1]);
    			}

    			if (dirty & /*size*/ 2) {
    				attr(rect, "height", /*size*/ ctx[1]);
    			}

    			if (dirty & /*text*/ 1) set_data(t1, /*text*/ ctx[0]);

    			if (dirty & /*size, factorWidth*/ 6 && svg_width_value !== (svg_width_value = /*size*/ ctx[1] * /*factorWidth*/ ctx[2])) {
    				attr(svg, "width", svg_width_value);
    			}

    			if (dirty & /*size*/ 2) {
    				attr(svg, "height", /*size*/ ctx[1]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(svg);
    		}
    	};
    }

    function instance$8($$self, $$props, $$invalidate) {
    	let { text = "" } = $$props;
    	let { color = "" } = $$props;
    	let { size = 18 } = $$props;
    	let { factorWidth = 3 } = $$props;
    	let fillText = "fill: " + color + "; ";

    	$$self.$set = $$props => {
    		if ("text" in $$props) $$invalidate(0, text = $$props.text);
    		if ("color" in $$props) $$invalidate(4, color = $$props.color);
    		if ("size" in $$props) $$invalidate(1, size = $$props.size);
    		if ("factorWidth" in $$props) $$invalidate(2, factorWidth = $$props.factorWidth);
    	};

    	return [text, size, factorWidth, fillText, color];
    }

    class Square extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$8, create_fragment$8, safe_not_equal, {
    			text: 0,
    			color: 4,
    			size: 1,
    			factorWidth: 2
    		});
    	}
    }

    /* src/LineLegend.svelte generated by Svelte v3.22.3 */

    function create_if_block_1$1(ctx) {
    	let svg;
    	let style;
    	let t0;
    	let line;
    	let text_1;
    	let t1;
    	let svg_width_value;

    	return {
    		c() {
    			svg = svg_element("svg");
    			style = svg_element("style");
    			t0 = text(".small { \n        font-size: 14px;\n        font-family: 'Roboto', sans-serif;\n        font-weight: 400;\n      }\n    ");
    			line = svg_element("line");
    			text_1 = svg_element("text");
    			t1 = text(/*text*/ ctx[0]);
    			attr(line, "x1", "10");
    			attr(line, "x2", "30");
    			attr(line, "y1", y);
    			attr(line, "y2", y);
    			attr(line, "fill", "none");
    			attr(line, "stroke", "black");
    			attr(line, "stroke-width", "4.5px");
    			attr(line, "stroke-linejoin", "round");
    			attr(line, "stroke-linecap", "round");
    			attr(line, "mix-blend-mode", "multiply");
    			attr(text_1, "x", "40");
    			attr(text_1, "y", "13.5");
    			attr(text_1, "class", "small");
    			attr(svg, "width", svg_width_value = /*size*/ ctx[2] * /*factorWidth*/ ctx[3]);
    			attr(svg, "height", /*size*/ ctx[2]);
    		},
    		m(target, anchor) {
    			insert(target, svg, anchor);
    			append(svg, style);
    			append(style, t0);
    			append(svg, line);
    			append(svg, text_1);
    			append(text_1, t1);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*text*/ 1) set_data(t1, /*text*/ ctx[0]);

    			if (dirty & /*size, factorWidth*/ 12 && svg_width_value !== (svg_width_value = /*size*/ ctx[2] * /*factorWidth*/ ctx[3])) {
    				attr(svg, "width", svg_width_value);
    			}

    			if (dirty & /*size*/ 4) {
    				attr(svg, "height", /*size*/ ctx[2]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(svg);
    		}
    	};
    }

    // (27:0) {#if type === 'dashed'}
    function create_if_block$3(ctx) {
    	let svg;
    	let style;
    	let t0;
    	let line;
    	let text_1;
    	let t1;
    	let svg_width_value;

    	return {
    		c() {
    			svg = svg_element("svg");
    			style = svg_element("style");
    			t0 = text(".small { \n        font-size: 14px;\n        font-family: 'Roboto', sans-serif;\n        font-weight: 400;\n      }\n    ");
    			line = svg_element("line");
    			text_1 = svg_element("text");
    			t1 = text(/*text*/ ctx[0]);
    			attr(line, "stroke", "black");
    			attr(line, "x1", "10");
    			attr(line, "y1", y);
    			attr(line, "y2", y);
    			attr(line, "fill", "none");
    			attr(line, "x2", "30");
    			attr(line, "stroke-width", "4.5px");
    			attr(line, "stroke-linejoin", "round");
    			attr(line, "stroke-linecap", "round");
    			attr(line, "mix-blend-mode", "multiply");
    			attr(line, "stroke-dasharray", "8 8");
    			attr(text_1, "x", "40");
    			attr(text_1, "y", "13.5");
    			attr(text_1, "class", "small");
    			attr(svg, "width", svg_width_value = /*size*/ ctx[2] * /*factorWidth*/ ctx[3]);
    			attr(svg, "height", /*size*/ ctx[2]);
    		},
    		m(target, anchor) {
    			insert(target, svg, anchor);
    			append(svg, style);
    			append(style, t0);
    			append(svg, line);
    			append(svg, text_1);
    			append(text_1, t1);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*text*/ 1) set_data(t1, /*text*/ ctx[0]);

    			if (dirty & /*size, factorWidth*/ 12 && svg_width_value !== (svg_width_value = /*size*/ ctx[2] * /*factorWidth*/ ctx[3])) {
    				attr(svg, "width", svg_width_value);
    			}

    			if (dirty & /*size*/ 4) {
    				attr(svg, "height", /*size*/ ctx[2]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(svg);
    		}
    	};
    }

    function create_fragment$9(ctx) {
    	let t;
    	let if_block1_anchor;
    	let if_block0 = /*type*/ ctx[1] === "continuous" && create_if_block_1$1(ctx);
    	let if_block1 = /*type*/ ctx[1] === "dashed" && create_if_block$3(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, if_block1_anchor, anchor);
    		},
    		p(ctx, [dirty]) {
    			if (/*type*/ ctx[1] === "continuous") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_1$1(ctx);
    					if_block0.c();
    					if_block0.m(t.parentNode, t);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*type*/ ctx[1] === "dashed") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block$3(ctx);
    					if_block1.c();
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(if_block1_anchor);
    		}
    	};
    }

    let y = 10;

    function instance$9($$self, $$props, $$invalidate) {
    	let { text = "" } = $$props;
    	let { type = "" } = $$props;
    	let { size = 18 } = $$props;
    	let { factorWidth = 3 } = $$props;

    	$$self.$set = $$props => {
    		if ("text" in $$props) $$invalidate(0, text = $$props.text);
    		if ("type" in $$props) $$invalidate(1, type = $$props.type);
    		if ("size" in $$props) $$invalidate(2, size = $$props.size);
    		if ("factorWidth" in $$props) $$invalidate(3, factorWidth = $$props.factorWidth);
    	};

    	return [text, type, size, factorWidth];
    }

    class LineLegend extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$9, create_fragment$9, safe_not_equal, {
    			text: 0,
    			type: 1,
    			size: 2,
    			factorWidth: 3
    		});
    	}
    }

    /* src/App.svelte generated by Svelte v3.22.3 */

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[136] = list[i];
    	return child_ctx;
    }

    // (699:3) {#if 0 === currentTab}
    function create_if_block_17(ctx) {
    	let div2;
    	let div1;
    	let div0;
    	let div2_intro;
    	let div2_outro;
    	let t0;
    	let div6;
    	let div3;
    	let t1;
    	let t2;
    	let div5;
    	let div4;
    	let span2;
    	let t3_value = /*translations*/ ctx[45].app.basedOn + "";
    	let t3;
    	let t4;
    	let span0;
    	let t5_value = /*translations*/ ctx[45].fatalityRisks[/*selectedSourceId*/ ctx[46]].source + "";
    	let t5;
    	let t6;
    	let t7_value = /*translations*/ ctx[45].app.basedOnContinued1 + "";
    	let t7;
    	let t8;
    	let span1;
    	let t9_value = /*rowsOfScenarios*/ ctx[30][0].loc + "";
    	let t9;
    	let t10;
    	let t11_value = /*translations*/ ctx[45].app.basedOnContinued2 + "";
    	let t11;
    	let t12;
    	let span3;
    	let t13_value = numberFormatter(/*totalInfected*/ ctx[48]) + "";
    	let t13;
    	let t14;
    	let span4;
    	let t15_value = /*translations*/ ctx[45].app.basedOnContinued3 + "";
    	let t15;
    	let t16;
    	let span5;
    	let t17_value = numberFormatter(/*totalDeaths*/ ctx[49]) + "";
    	let t17;
    	let t18;
    	let span6;
    	let t19_value = /*translations*/ ctx[45].app.basedOnContinued4 + "";
    	let t19;
    	let t20;
    	let span7;
    	let t21_value = numberFormatter(/*totalYearsLost*/ ctx[50]) + "";
    	let t21;
    	let t22;
    	let span9;
    	let t23_value = /*translations*/ ctx[45].app.basedOnContinued5 + "";
    	let t23;
    	let t24;
    	let span8;
    	let t25;
    	let t26;
    	let current;

    	const comparebyage = new CompareByAge({
    			props: {
    				infectedData: /*infectedData*/ ctx[17],
    				infectedTitle: /*infectedTitle*/ ctx[19],
    				infectedTitleListName: /*infectedTitleListName*/ ctx[21],
    				infectedTitleListNumber: /*infectedTitleListNumber*/ ctx[22],
    				deathsData: /*deathsData*/ ctx[18],
    				deathsTitle: /*deathsTitle*/ ctx[20],
    				deathsTitleListName: /*deathsTitleListName*/ ctx[23],
    				deathsTitleListNumber: /*deathsTitleListNumber*/ ctx[24]
    			}
    		});

    	const square0 = new Square({ props: { text: "60+", color: "#43a2ca" } });
    	const square1 = new Square({ props: { text: "<60", color: "#d4f0cd" } });

    	return {
    		c() {
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			create_component(comparebyage.$$.fragment);
    			t0 = space();
    			div6 = element("div");
    			div3 = element("div");
    			create_component(square0.$$.fragment);
    			t1 = space();
    			create_component(square1.$$.fragment);
    			t2 = space();
    			div5 = element("div");
    			div4 = element("div");
    			span2 = element("span");
    			t3 = text(t3_value);
    			t4 = space();
    			span0 = element("span");
    			t5 = text(t5_value);
    			t6 = space();
    			t7 = text(t7_value);
    			t8 = space();
    			span1 = element("span");
    			t9 = text(t9_value);
    			t10 = space();
    			t11 = text(t11_value);
    			t12 = space();
    			span3 = element("span");
    			t13 = text(t13_value);
    			t14 = space();
    			span4 = element("span");
    			t15 = text(t15_value);
    			t16 = space();
    			span5 = element("span");
    			t17 = text(t17_value);
    			t18 = space();
    			span6 = element("span");
    			t19 = text(t19_value);
    			t20 = space();
    			span7 = element("span");
    			t21 = text(t21_value);
    			t22 = space();
    			span9 = element("span");
    			t23 = text(t23_value);
    			t24 = space();
    			span8 = element("span");
    			t25 = text(/*selectedLocation*/ ctx[2]);
    			t26 = text(".");
    			attr(div0, "class", "child svelte-1havf7j");
    			attr(div1, "class", "twelve columns");
    			attr(div2, "class", "row svelte-1havf7j");
    			attr(div3, "class", "one columns");
    			attr(span0, "class", "parameter svelte-1havf7j");
    			attr(span1, "class", "parameter svelte-1havf7j");
    			attr(span2, "class", "parameter-text svelte-1havf7j");
    			attr(span3, "class", "emphasize-text svelte-1havf7j");
    			attr(span4, "class", "parameter-text svelte-1havf7j");
    			attr(span5, "class", "emphasize-text svelte-1havf7j");
    			attr(span6, "class", "parameter-text svelte-1havf7j");
    			attr(span7, "class", "emphasize-text svelte-1havf7j");
    			attr(span8, "class", "parameter svelte-1havf7j");
    			attr(span9, "class", "parameter-text svelte-1havf7j");
    			attr(div4, "class", "caption svelte-1havf7j");
    			attr(div5, "class", "ten columns");
    			attr(div6, "class", "row svelte-1havf7j");
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div1);
    			append(div1, div0);
    			mount_component(comparebyage, div0, null);
    			insert(target, t0, anchor);
    			insert(target, div6, anchor);
    			append(div6, div3);
    			mount_component(square0, div3, null);
    			append(div3, t1);
    			mount_component(square1, div3, null);
    			append(div6, t2);
    			append(div6, div5);
    			append(div5, div4);
    			append(div4, span2);
    			append(span2, t3);
    			append(span2, t4);
    			append(span2, span0);
    			append(span0, t5);
    			append(span2, t6);
    			append(span2, t7);
    			append(span2, t8);
    			append(span2, span1);
    			append(span1, t9);
    			append(span2, t10);
    			append(span2, t11);
    			append(div4, t12);
    			append(div4, span3);
    			append(span3, t13);
    			append(div4, t14);
    			append(div4, span4);
    			append(span4, t15);
    			append(div4, t16);
    			append(div4, span5);
    			append(span5, t17);
    			append(div4, t18);
    			append(div4, span6);
    			append(span6, t19);
    			append(div4, t20);
    			append(div4, span7);
    			append(span7, t21);
    			append(div4, t22);
    			append(div4, span9);
    			append(span9, t23);
    			append(span9, t24);
    			append(span9, span8);
    			append(span8, t25);
    			append(span9, t26);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const comparebyage_changes = {};
    			if (dirty[0] & /*infectedData*/ 131072) comparebyage_changes.infectedData = /*infectedData*/ ctx[17];
    			if (dirty[0] & /*infectedTitle*/ 524288) comparebyage_changes.infectedTitle = /*infectedTitle*/ ctx[19];
    			if (dirty[0] & /*infectedTitleListName*/ 2097152) comparebyage_changes.infectedTitleListName = /*infectedTitleListName*/ ctx[21];
    			if (dirty[0] & /*infectedTitleListNumber*/ 4194304) comparebyage_changes.infectedTitleListNumber = /*infectedTitleListNumber*/ ctx[22];
    			if (dirty[0] & /*deathsData*/ 262144) comparebyage_changes.deathsData = /*deathsData*/ ctx[18];
    			if (dirty[0] & /*deathsTitle*/ 1048576) comparebyage_changes.deathsTitle = /*deathsTitle*/ ctx[20];
    			if (dirty[0] & /*deathsTitleListName*/ 8388608) comparebyage_changes.deathsTitleListName = /*deathsTitleListName*/ ctx[23];
    			if (dirty[0] & /*deathsTitleListNumber*/ 16777216) comparebyage_changes.deathsTitleListNumber = /*deathsTitleListNumber*/ ctx[24];
    			comparebyage.$set(comparebyage_changes);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t3_value !== (t3_value = /*translations*/ ctx[45].app.basedOn + "")) set_data(t3, t3_value);
    			if ((!current || dirty[1] & /*translations, selectedSourceId*/ 49152) && t5_value !== (t5_value = /*translations*/ ctx[45].fatalityRisks[/*selectedSourceId*/ ctx[46]].source + "")) set_data(t5, t5_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t7_value !== (t7_value = /*translations*/ ctx[45].app.basedOnContinued1 + "")) set_data(t7, t7_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t9_value !== (t9_value = /*rowsOfScenarios*/ ctx[30][0].loc + "")) set_data(t9, t9_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t11_value !== (t11_value = /*translations*/ ctx[45].app.basedOnContinued2 + "")) set_data(t11, t11_value);
    			if ((!current || dirty[1] & /*totalInfected*/ 131072) && t13_value !== (t13_value = numberFormatter(/*totalInfected*/ ctx[48]) + "")) set_data(t13, t13_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t15_value !== (t15_value = /*translations*/ ctx[45].app.basedOnContinued3 + "")) set_data(t15, t15_value);
    			if ((!current || dirty[1] & /*totalDeaths*/ 262144) && t17_value !== (t17_value = numberFormatter(/*totalDeaths*/ ctx[49]) + "")) set_data(t17, t17_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t19_value !== (t19_value = /*translations*/ ctx[45].app.basedOnContinued4 + "")) set_data(t19, t19_value);
    			if ((!current || dirty[1] & /*totalYearsLost*/ 524288) && t21_value !== (t21_value = numberFormatter(/*totalYearsLost*/ ctx[50]) + "")) set_data(t21, t21_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t23_value !== (t23_value = /*translations*/ ctx[45].app.basedOnContinued5 + "")) set_data(t23, t23_value);
    			if (!current || dirty[0] & /*selectedLocation*/ 4) set_data(t25, /*selectedLocation*/ ctx[2]);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(comparebyage.$$.fragment, local);

    			add_render_callback(() => {
    				if (div2_outro) div2_outro.end(1);
    				if (!div2_intro) div2_intro = create_in_transition(div2, fade, { duration: durationIn });
    				div2_intro.start();
    			});

    			transition_in(square0.$$.fragment, local);
    			transition_in(square1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(comparebyage.$$.fragment, local);
    			if (div2_intro) div2_intro.invalidate();
    			div2_outro = create_out_transition(div2, fade, { duration: durationOut });
    			transition_out(square0.$$.fragment, local);
    			transition_out(square1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div2);
    			destroy_component(comparebyage);
    			if (detaching && div2_outro) div2_outro.end();
    			if (detaching) detach(t0);
    			if (detaching) detach(div6);
    			destroy_component(square0);
    			destroy_component(square1);
    		}
    	};
    }

    // (749:3) {#if 1 === currentTab}
    function create_if_block_13(ctx) {
    	let div0;
    	let updating_activeTabValue;
    	let t0;
    	let div2;
    	let div1;
    	let t1;
    	let div6;
    	let div3;
    	let t2;
    	let div4;
    	let t3;
    	let t4;
    	let t5;
    	let div5;
    	let t6;
    	let t7;
    	let current;

    	function subtabs_activeTabValue_binding(value) {
    		/*subtabs_activeTabValue_binding*/ ctx[127].call(null, value);
    	}

    	let subtabs_props = { items: /*compareItems*/ ctx[11] };

    	if (/*currentCompare*/ ctx[12] !== void 0) {
    		subtabs_props.activeTabValue = /*currentCompare*/ ctx[12];
    	}

    	const subtabs = new Subtabs({ props: subtabs_props });
    	binding_callbacks.push(() => bind(subtabs, "activeTabValue", subtabs_activeTabValue_binding));

    	const compare = new Compare({
    			props: {
    				compareData: /*compareList*/ ctx[13],
    				titleListMain: /*titleListMain*/ ctx[16],
    				titleListName: /*titleListName*/ ctx[14],
    				titleListNumber: /*titleListNumber*/ ctx[15]
    			}
    		});

    	const square0 = new Square({
    			props: {
    				text: "2020+",
    				color: "#fdc086",
    				factorWidth: 4
    			}
    		});

    	const square1 = new Square({
    			props: {
    				text: "2017",
    				color: "#beaed4",
    				factorWidth: 4
    			}
    		});

    	const square2 = new Square({
    			props: {
    				text: "<2020-05-27",
    				color: "#7fc97f",
    				factorWidth: 6
    			}
    		});

    	let if_block0 = 0 == /*currentCompare*/ ctx[12] && create_if_block_16(ctx);
    	let if_block1 = 1 == /*currentCompare*/ ctx[12] && create_if_block_15(ctx);
    	let if_block2 = 2 == /*currentCompare*/ ctx[12] && create_if_block_14(ctx);

    	return {
    		c() {
    			div0 = element("div");
    			create_component(subtabs.$$.fragment);
    			t0 = space();
    			div2 = element("div");
    			div1 = element("div");
    			create_component(compare.$$.fragment);
    			t1 = space();
    			div6 = element("div");
    			div3 = element("div");
    			div3.innerHTML = `<svg width="${90}" height="${90}" style="background-color: white"></svg>`;
    			t2 = space();
    			div4 = element("div");
    			create_component(square0.$$.fragment);
    			t3 = space();
    			create_component(square1.$$.fragment);
    			t4 = space();
    			create_component(square2.$$.fragment);
    			t5 = space();
    			div5 = element("div");
    			if (if_block0) if_block0.c();
    			t6 = space();
    			if (if_block1) if_block1.c();
    			t7 = space();
    			if (if_block2) if_block2.c();
    			set_style(div0, "margin-top", "5px");
    			attr(div1, "class", "child svelte-1havf7j");
    			attr(div2, "class", "twelve columns");
    			set_style(div2, "text-align", "center");
    			set_style(div2, "margin-top", "25px");
    			attr(div3, "class", "two columns");
    			attr(div4, "class", "two columns");
    			attr(div5, "class", "eight columns");
    			attr(div6, "class", "row svelte-1havf7j");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			mount_component(subtabs, div0, null);
    			insert(target, t0, anchor);
    			insert(target, div2, anchor);
    			append(div2, div1);
    			mount_component(compare, div1, null);
    			insert(target, t1, anchor);
    			insert(target, div6, anchor);
    			append(div6, div3);
    			append(div6, t2);
    			append(div6, div4);
    			mount_component(square0, div4, null);
    			append(div4, t3);
    			mount_component(square1, div4, null);
    			append(div4, t4);
    			mount_component(square2, div4, null);
    			append(div6, t5);
    			append(div6, div5);
    			if (if_block0) if_block0.m(div5, null);
    			append(div5, t6);
    			if (if_block1) if_block1.m(div5, null);
    			append(div5, t7);
    			if (if_block2) if_block2.m(div5, null);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const subtabs_changes = {};
    			if (dirty[0] & /*compareItems*/ 2048) subtabs_changes.items = /*compareItems*/ ctx[11];

    			if (!updating_activeTabValue && dirty[0] & /*currentCompare*/ 4096) {
    				updating_activeTabValue = true;
    				subtabs_changes.activeTabValue = /*currentCompare*/ ctx[12];
    				add_flush_callback(() => updating_activeTabValue = false);
    			}

    			subtabs.$set(subtabs_changes);
    			const compare_changes = {};
    			if (dirty[0] & /*compareList*/ 8192) compare_changes.compareData = /*compareList*/ ctx[13];
    			if (dirty[0] & /*titleListMain*/ 65536) compare_changes.titleListMain = /*titleListMain*/ ctx[16];
    			if (dirty[0] & /*titleListName*/ 16384) compare_changes.titleListName = /*titleListName*/ ctx[14];
    			if (dirty[0] & /*titleListNumber*/ 32768) compare_changes.titleListNumber = /*titleListNumber*/ ctx[15];
    			compare.$set(compare_changes);

    			if (0 == /*currentCompare*/ ctx[12]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_16(ctx);
    					if_block0.c();
    					if_block0.m(div5, t6);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (1 == /*currentCompare*/ ctx[12]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_15(ctx);
    					if_block1.c();
    					if_block1.m(div5, t7);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (2 == /*currentCompare*/ ctx[12]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block_14(ctx);
    					if_block2.c();
    					if_block2.m(div5, null);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(subtabs.$$.fragment, local);
    			transition_in(compare.$$.fragment, local);
    			transition_in(square0.$$.fragment, local);
    			transition_in(square1.$$.fragment, local);
    			transition_in(square2.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(subtabs.$$.fragment, local);
    			transition_out(compare.$$.fragment, local);
    			transition_out(square0.$$.fragment, local);
    			transition_out(square1.$$.fragment, local);
    			transition_out(square2.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			destroy_component(subtabs);
    			if (detaching) detach(t0);
    			if (detaching) detach(div2);
    			destroy_component(compare);
    			if (detaching) detach(t1);
    			if (detaching) detach(div6);
    			destroy_component(square0);
    			destroy_component(square1);
    			destroy_component(square2);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    		}
    	};
    }

    // (772:6) {#if 0 == currentCompare}
    function create_if_block_16(ctx) {
    	let div3;
    	let div0;
    	let t0_value = /*translations*/ ctx[45].app.compareWithOtherCaption1 + "";
    	let t0;
    	let t1;
    	let div1;
    	let t2_value = /*translations*/ ctx[45].app.compareWithOtherCaption2 + "";
    	let t2;
    	let t3;
    	let a0;
    	let t5;
    	let div2;
    	let t6_value = /*translations*/ ctx[45].app.compareWithOtherCaption3 + "";
    	let t6;
    	let t7;
    	let a1;

    	return {
    		c() {
    			div3 = element("div");
    			div0 = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			div1 = element("div");
    			t2 = text(t2_value);
    			t3 = space();
    			a0 = element("a");
    			a0.textContent = "Our World in Data";
    			t5 = space();
    			div2 = element("div");
    			t6 = text(t6_value);
    			t7 = space();
    			a1 = element("a");
    			a1.textContent = "Our World in Data";
    			attr(div0, "class", "parameter-text svelte-1havf7j");
    			attr(a0, "href", "https://ourworldindata.org/causes-of-death");
    			attr(div1, "class", "parameter-text svelte-1havf7j");
    			attr(a1, "href", "https://ourworldindata.org/coronavirus-data");
    			attr(div2, "class", "parameter-text svelte-1havf7j");
    			attr(div3, "class", "caption svelte-1havf7j");
    		},
    		m(target, anchor) {
    			insert(target, div3, anchor);
    			append(div3, div0);
    			append(div0, t0);
    			append(div3, t1);
    			append(div3, div1);
    			append(div1, t2);
    			append(div1, t3);
    			append(div1, a0);
    			append(div3, t5);
    			append(div3, div2);
    			append(div2, t6);
    			append(div2, t7);
    			append(div2, a1);
    		},
    		p(ctx, dirty) {
    			if (dirty[1] & /*translations*/ 16384 && t0_value !== (t0_value = /*translations*/ ctx[45].app.compareWithOtherCaption1 + "")) set_data(t0, t0_value);
    			if (dirty[1] & /*translations*/ 16384 && t2_value !== (t2_value = /*translations*/ ctx[45].app.compareWithOtherCaption2 + "")) set_data(t2, t2_value);
    			if (dirty[1] & /*translations*/ 16384 && t6_value !== (t6_value = /*translations*/ ctx[45].app.compareWithOtherCaption3 + "")) set_data(t6, t6_value);
    		},
    		d(detaching) {
    			if (detaching) detach(div3);
    		}
    	};
    }

    // (787:6) {#if 1 == currentCompare}
    function create_if_block_15(ctx) {
    	let div3;
    	let div0;
    	let t0_value = /*translations*/ ctx[45].app.compareWithOtherCaption1 + "";
    	let t0;
    	let t1;
    	let div1;
    	let t2_value = /*translations*/ ctx[45].app.compareWithOtherCaption4 + "";
    	let t2;
    	let t3;
    	let a0;
    	let t5;
    	let div2;
    	let t6_value = /*translations*/ ctx[45].app.compareWithOtherCaption5 + "";
    	let t6;
    	let t7;
    	let a1;
    	let t9;
    	let t10_value = /*translations*/ ctx[45].app.authorsCalculations + "";
    	let t10;

    	return {
    		c() {
    			div3 = element("div");
    			div0 = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			div1 = element("div");
    			t2 = text(t2_value);
    			t3 = space();
    			a0 = element("a");
    			a0.textContent = "Our World in Data";
    			t5 = space();
    			div2 = element("div");
    			t6 = text(t6_value);
    			t7 = space();
    			a1 = element("a");
    			a1.textContent = "Our World in Data";
    			t9 = space();
    			t10 = text(t10_value);
    			attr(div0, "class", "parameter-text svelte-1havf7j");
    			attr(a0, "href", "https://ourworldindata.org/grapher/burden-of-disease-by-cause");
    			attr(div1, "class", "parameter-text svelte-1havf7j");
    			attr(a1, "href", "https://ourworldindata.org/coronavirus-data");
    			attr(div2, "class", "parameter-text svelte-1havf7j");
    			attr(div3, "class", "caption svelte-1havf7j");
    		},
    		m(target, anchor) {
    			insert(target, div3, anchor);
    			append(div3, div0);
    			append(div0, t0);
    			append(div3, t1);
    			append(div3, div1);
    			append(div1, t2);
    			append(div1, t3);
    			append(div1, a0);
    			append(div3, t5);
    			append(div3, div2);
    			append(div2, t6);
    			append(div2, t7);
    			append(div2, a1);
    			append(div2, t9);
    			append(div2, t10);
    		},
    		p(ctx, dirty) {
    			if (dirty[1] & /*translations*/ 16384 && t0_value !== (t0_value = /*translations*/ ctx[45].app.compareWithOtherCaption1 + "")) set_data(t0, t0_value);
    			if (dirty[1] & /*translations*/ 16384 && t2_value !== (t2_value = /*translations*/ ctx[45].app.compareWithOtherCaption4 + "")) set_data(t2, t2_value);
    			if (dirty[1] & /*translations*/ 16384 && t6_value !== (t6_value = /*translations*/ ctx[45].app.compareWithOtherCaption5 + "")) set_data(t6, t6_value);
    			if (dirty[1] & /*translations*/ 16384 && t10_value !== (t10_value = /*translations*/ ctx[45].app.authorsCalculations + "")) set_data(t10, t10_value);
    		},
    		d(detaching) {
    			if (detaching) detach(div3);
    		}
    	};
    }

    // (803:6) {#if 2 == currentCompare}
    function create_if_block_14(ctx) {
    	let div3;
    	let div0;
    	let t0_value = /*translations*/ ctx[45].app.compareWithOtherCaption1 + "";
    	let t0;
    	let t1;
    	let div1;
    	let t2_value = /*translations*/ ctx[45].app.compareWithOtherCaption7 + "";
    	let t2;
    	let t3;
    	let a0;
    	let t5;
    	let div2;
    	let t6_value = /*translations*/ ctx[45].app.compareWithOtherCaption5 + "";
    	let t6;
    	let t7;
    	let a1;
    	let t9;
    	let t10_value = /*translations*/ ctx[45].app.authorsCalculations + "";
    	let t10;

    	return {
    		c() {
    			div3 = element("div");
    			div0 = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			div1 = element("div");
    			t2 = text(t2_value);
    			t3 = space();
    			a0 = element("a");
    			a0.textContent = "Our World in Data";
    			t5 = space();
    			div2 = element("div");
    			t6 = text(t6_value);
    			t7 = space();
    			a1 = element("a");
    			a1.textContent = "Our World in Data";
    			t9 = space();
    			t10 = text(t10_value);
    			attr(div0, "class", "parameter-text svelte-1havf7j");
    			attr(a0, "href", "https://ourworldindata.org/grapher/disease-burden-by-risk-factor");
    			attr(div1, "class", "parameter-text svelte-1havf7j");
    			attr(a1, "href", "https://ourworldindata.org/coronavirus-data");
    			attr(div2, "class", "parameter-text svelte-1havf7j");
    			attr(div3, "class", "caption svelte-1havf7j");
    		},
    		m(target, anchor) {
    			insert(target, div3, anchor);
    			append(div3, div0);
    			append(div0, t0);
    			append(div3, t1);
    			append(div3, div1);
    			append(div1, t2);
    			append(div1, t3);
    			append(div1, a0);
    			append(div3, t5);
    			append(div3, div2);
    			append(div2, t6);
    			append(div2, t7);
    			append(div2, a1);
    			append(div2, t9);
    			append(div2, t10);
    		},
    		p(ctx, dirty) {
    			if (dirty[1] & /*translations*/ 16384 && t0_value !== (t0_value = /*translations*/ ctx[45].app.compareWithOtherCaption1 + "")) set_data(t0, t0_value);
    			if (dirty[1] & /*translations*/ 16384 && t2_value !== (t2_value = /*translations*/ ctx[45].app.compareWithOtherCaption7 + "")) set_data(t2, t2_value);
    			if (dirty[1] & /*translations*/ 16384 && t6_value !== (t6_value = /*translations*/ ctx[45].app.compareWithOtherCaption5 + "")) set_data(t6, t6_value);
    			if (dirty[1] & /*translations*/ 16384 && t10_value !== (t10_value = /*translations*/ ctx[45].app.authorsCalculations + "")) set_data(t10, t10_value);
    		},
    		d(detaching) {
    			if (detaching) detach(div3);
    		}
    	};
    }

    // (823:3) {#if 2 === currentTab}
    function create_if_block_10(ctx) {
    	let div5;
    	let updating_activeTabValue;
    	let t0;
    	let div4;
    	let div3;
    	let t1;
    	let t2;
    	let div2;
    	let div0;
    	let t3_value = /*translations*/ ctx[45].app.mapCaption + "";
    	let t3;
    	let t4;
    	let div1;
    	let t5_value = /*translations*/ ctx[45].app.source + "";
    	let t5;
    	let t6;
    	let a;
    	let t8;
    	let t9_value = /*translations*/ ctx[45].app.authorsCalculations + "";
    	let t9;
    	let div5_intro;
    	let div5_outro;
    	let current;

    	function subtabs_activeTabValue_binding_1(value) {
    		/*subtabs_activeTabValue_binding_1*/ ctx[128].call(null, value);
    	}

    	let subtabs_props = { items: /*mapItems*/ ctx[32] };

    	if (/*selectedRisk*/ ctx[33] !== void 0) {
    		subtabs_props.activeTabValue = /*selectedRisk*/ ctx[33];
    	}

    	const subtabs = new Subtabs({ props: subtabs_props });
    	binding_callbacks.push(() => bind(subtabs, "activeTabValue", subtabs_activeTabValue_binding_1));
    	let if_block0 = 0 == /*selectedRisk*/ ctx[33] && create_if_block_12(ctx);
    	let if_block1 = 1 == /*selectedRisk*/ ctx[33] && create_if_block_11(ctx);

    	return {
    		c() {
    			div5 = element("div");
    			create_component(subtabs.$$.fragment);
    			t0 = space();
    			div4 = element("div");
    			div3 = element("div");
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			div2 = element("div");
    			div0 = element("div");
    			t3 = text(t3_value);
    			t4 = space();
    			div1 = element("div");
    			t5 = text(t5_value);
    			t6 = space();
    			a = element("a");
    			a.textContent = "World Atlas TopoJSON";
    			t8 = space();
    			t9 = text(t9_value);
    			attr(div0, "class", "parameter-text svelte-1havf7j");
    			attr(a, "href", "https://github.com/topojson/world-atlas");
    			attr(div1, "class", "parameter-text svelte-1havf7j");
    			attr(div2, "class", "caption svelte-1havf7j");
    			attr(div3, "class", "child svelte-1havf7j");
    			attr(div4, "class", "twelve columns");
    			set_style(div4, "text-align", "center");
    			set_style(div4, "margin-top", "25px");
    			attr(div5, "class", "row svelte-1havf7j");
    		},
    		m(target, anchor) {
    			insert(target, div5, anchor);
    			mount_component(subtabs, div5, null);
    			append(div5, t0);
    			append(div5, div4);
    			append(div4, div3);
    			if (if_block0) if_block0.m(div3, null);
    			append(div3, t1);
    			if (if_block1) if_block1.m(div3, null);
    			append(div3, t2);
    			append(div3, div2);
    			append(div2, div0);
    			append(div0, t3);
    			append(div2, t4);
    			append(div2, div1);
    			append(div1, t5);
    			append(div1, t6);
    			append(div1, a);
    			append(div1, t8);
    			append(div1, t9);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const subtabs_changes = {};
    			if (dirty[1] & /*mapItems*/ 2) subtabs_changes.items = /*mapItems*/ ctx[32];

    			if (!updating_activeTabValue && dirty[1] & /*selectedRisk*/ 4) {
    				updating_activeTabValue = true;
    				subtabs_changes.activeTabValue = /*selectedRisk*/ ctx[33];
    				add_flush_callback(() => updating_activeTabValue = false);
    			}

    			subtabs.$set(subtabs_changes);

    			if (0 == /*selectedRisk*/ ctx[33]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[1] & /*selectedRisk*/ 4) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_12(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(div3, t1);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (1 == /*selectedRisk*/ ctx[33]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*selectedRisk*/ 4) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_11(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div3, t2);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if ((!current || dirty[1] & /*translations*/ 16384) && t3_value !== (t3_value = /*translations*/ ctx[45].app.mapCaption + "")) set_data(t3, t3_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t5_value !== (t5_value = /*translations*/ ctx[45].app.source + "")) set_data(t5, t5_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t9_value !== (t9_value = /*translations*/ ctx[45].app.authorsCalculations + "")) set_data(t9, t9_value);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(subtabs.$$.fragment, local);
    			transition_in(if_block0);
    			transition_in(if_block1);

    			add_render_callback(() => {
    				if (div5_outro) div5_outro.end(1);
    				if (!div5_intro) div5_intro = create_in_transition(div5, fade, { duration: durationIn });
    				div5_intro.start();
    			});

    			current = true;
    		},
    		o(local) {
    			transition_out(subtabs.$$.fragment, local);
    			transition_out(if_block0);
    			transition_out(if_block1);
    			if (div5_intro) div5_intro.invalidate();
    			div5_outro = create_out_transition(div5, fade, { duration: durationOut });
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div5);
    			destroy_component(subtabs);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (detaching && div5_outro) div5_outro.end();
    		}
    	};
    }

    // (828:7) {#if 0 == selectedRisk}
    function create_if_block_12(ctx) {
    	let div0;
    	let t0_value = /*translations*/ ctx[45].app.proportionOver60ByCountry + "";
    	let t0;
    	let t1;
    	let div1;
    	let current;

    	const worldmap = new WorldMap({
    			props: {
    				mapTitle: /*mapTitle*/ ctx[31],
    				selectedRisk: /*selectedRisk*/ ctx[33]
    			}
    		});

    	return {
    		c() {
    			div0 = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			div1 = element("div");
    			create_component(worldmap.$$.fragment);
    			attr(div0, "class", "worldmap-title svelte-1havf7j");
    			set_style(div0, "font-size", "16");
    			attr(div1, "class", "child svelte-1havf7j");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			append(div0, t0);
    			insert(target, t1, anchor);
    			insert(target, div1, anchor);
    			mount_component(worldmap, div1, null);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[1] & /*translations*/ 16384) && t0_value !== (t0_value = /*translations*/ ctx[45].app.proportionOver60ByCountry + "")) set_data(t0, t0_value);
    			const worldmap_changes = {};
    			if (dirty[1] & /*mapTitle*/ 1) worldmap_changes.mapTitle = /*mapTitle*/ ctx[31];
    			if (dirty[1] & /*selectedRisk*/ 4) worldmap_changes.selectedRisk = /*selectedRisk*/ ctx[33];
    			worldmap.$set(worldmap_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(worldmap.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(worldmap.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t1);
    			if (detaching) detach(div1);
    			destroy_component(worldmap);
    		}
    	};
    }

    // (838:7) {#if 1 == selectedRisk}
    function create_if_block_11(ctx) {
    	let div0;
    	let t0_value = /*translations*/ ctx[45].app.lowIncomeRiskByCountry + "";
    	let t0;
    	let t1;
    	let div1;
    	let current;

    	const worldmap = new WorldMap({
    			props: {
    				mapTitle: /*mapTitle*/ ctx[31],
    				selectedRisk: /*selectedRisk*/ ctx[33]
    			}
    		});

    	return {
    		c() {
    			div0 = element("div");
    			t0 = text(t0_value);
    			t1 = space();
    			div1 = element("div");
    			create_component(worldmap.$$.fragment);
    			attr(div0, "class", "worldmap-title svelte-1havf7j");
    			set_style(div0, "font-size", "16");
    			attr(div1, "class", "child svelte-1havf7j");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			append(div0, t0);
    			insert(target, t1, anchor);
    			insert(target, div1, anchor);
    			mount_component(worldmap, div1, null);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[1] & /*translations*/ 16384) && t0_value !== (t0_value = /*translations*/ ctx[45].app.lowIncomeRiskByCountry + "")) set_data(t0, t0_value);
    			const worldmap_changes = {};
    			if (dirty[1] & /*mapTitle*/ 1) worldmap_changes.mapTitle = /*mapTitle*/ ctx[31];
    			if (dirty[1] & /*selectedRisk*/ 4) worldmap_changes.selectedRisk = /*selectedRisk*/ ctx[33];
    			worldmap.$set(worldmap_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(worldmap.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(worldmap.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t1);
    			if (detaching) detach(div1);
    			destroy_component(worldmap);
    		}
    	};
    }

    // (864:3) {#if 3 === currentTab}
    function create_if_block_7(ctx) {
    	let updating_activeTabValue;
    	let t0;
    	let t1;
    	let if_block1_anchor;
    	let current;

    	function subtabs_activeTabValue_binding_2(value) {
    		/*subtabs_activeTabValue_binding_2*/ ctx[129].call(null, value);
    	}

    	let subtabs_props = { items: /*povertyItems*/ ctx[34] };

    	if (/*currentPoverty*/ ctx[35] !== void 0) {
    		subtabs_props.activeTabValue = /*currentPoverty*/ ctx[35];
    	}

    	const subtabs = new Subtabs({ props: subtabs_props });
    	binding_callbacks.push(() => bind(subtabs, "activeTabValue", subtabs_activeTabValue_binding_2));
    	let if_block0 = 0 == /*currentPoverty*/ ctx[35] && create_if_block_9(ctx);
    	let if_block1 = 1 == /*currentPoverty*/ ctx[35] && create_if_block_8(ctx);

    	return {
    		c() {
    			create_component(subtabs.$$.fragment);
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    		},
    		m(target, anchor) {
    			mount_component(subtabs, target, anchor);
    			insert(target, t0, anchor);
    			if (if_block0) if_block0.m(target, anchor);
    			insert(target, t1, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, if_block1_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const subtabs_changes = {};
    			if (dirty[1] & /*povertyItems*/ 8) subtabs_changes.items = /*povertyItems*/ ctx[34];

    			if (!updating_activeTabValue && dirty[1] & /*currentPoverty*/ 16) {
    				updating_activeTabValue = true;
    				subtabs_changes.activeTabValue = /*currentPoverty*/ ctx[35];
    				add_flush_callback(() => updating_activeTabValue = false);
    			}

    			subtabs.$set(subtabs_changes);

    			if (0 == /*currentPoverty*/ ctx[35]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[1] & /*currentPoverty*/ 16) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_9(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t1.parentNode, t1);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (1 == /*currentPoverty*/ ctx[35]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[1] & /*currentPoverty*/ 16) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_8(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(subtabs.$$.fragment, local);
    			transition_in(if_block0);
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(subtabs.$$.fragment, local);
    			transition_out(if_block0);
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(subtabs, detaching);
    			if (detaching) detach(t0);
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t1);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(if_block1_anchor);
    		}
    	};
    }

    // (866:4) {#if 0 == currentPoverty}
    function create_if_block_9(ctx) {
    	let div1;
    	let div0;
    	let t0;
    	let div8;
    	let div2;
    	let t1;
    	let div3;
    	let t2;
    	let t3;
    	let t4;
    	let div7;
    	let div6;
    	let div4;
    	let t5_value = /*translations*/ ctx[45].app.projectedPovery + "";
    	let t5;
    	let t6;
    	let div5;
    	let t7_value = /*translations*/ ctx[45].app.sources + "";
    	let t7;
    	let t8;
    	let a0;
    	let t10;
    	let a1;
    	let t12;
    	let t13_value = /*translations*/ ctx[45].app.authorsCalculations + "";
    	let t13;
    	let current;

    	const poverty = new Poverty({
    			props: {
    				compareData: /*povertyProjCountries*/ ctx[36],
    				titleListMain: /*mainProjCountries*/ ctx[38],
    				titleListName: /*nameProjCountries*/ ctx[39],
    				titleListNumber: /*numberProjCountries*/ ctx[40],
    				colorsList: /*colorsProjCountries*/ ctx[63]
    			}
    		});

    	const square0 = new Square({
    			props: {
    				text: /*translations*/ ctx[45].app.southAsia,
    				color: "#377eb8",
    				factorWidth: 8
    			}
    		});

    	const square1 = new Square({
    			props: {
    				text: /*translations*/ ctx[45].app.subSahAfrica,
    				color: "#e41a1c",
    				factorWidth: 8
    			}
    		});

    	const square2 = new Square({
    			props: {
    				text: /*translations*/ ctx[45].app.eastAsiaPacific,
    				color: "#4daf4a",
    				factorWidth: 8
    			}
    		});

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			create_component(poverty.$$.fragment);
    			t0 = space();
    			div8 = element("div");
    			div2 = element("div");
    			div2.innerHTML = `<svg width="${90}" height="${90}" style="background-color: white"></svg>`;
    			t1 = space();
    			div3 = element("div");
    			create_component(square0.$$.fragment);
    			t2 = space();
    			create_component(square1.$$.fragment);
    			t3 = space();
    			create_component(square2.$$.fragment);
    			t4 = space();
    			div7 = element("div");
    			div6 = element("div");
    			div4 = element("div");
    			t5 = text(t5_value);
    			t6 = space();
    			div5 = element("div");
    			t7 = text(t7_value);
    			t8 = space();
    			a0 = element("a");
    			a0.textContent = "IFM";
    			t10 = text(", \n\t\t\t\t\t\t\t\t\t");
    			a1 = element("a");
    			a1.textContent = "POVCAL";
    			t12 = space();
    			t13 = text(t13_value);
    			attr(div0, "class", "child svelte-1havf7j");
    			attr(div1, "class", "twelve columns");
    			set_style(div1, "text-align", "center");
    			set_style(div1, "margin-top", "25px");
    			attr(div2, "class", "one columns");
    			attr(div3, "class", "three columns");
    			attr(div4, "class", "parameter-text svelte-1havf7j");
    			attr(a0, "href", "https://www.imf.org/~/media/Files/Publications/WEO/2020/April/English/execsum.ashx?la=en");
    			attr(a1, "href", "https://data.worldbank.org/indicator/SI.POV.DDA");
    			attr(div5, "class", "parameter-text svelte-1havf7j");
    			attr(div6, "class", "caption svelte-1havf7j");
    			attr(div7, "class", "eight columns");
    			attr(div8, "class", "row svelte-1havf7j");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);
    			mount_component(poverty, div0, null);
    			insert(target, t0, anchor);
    			insert(target, div8, anchor);
    			append(div8, div2);
    			append(div8, t1);
    			append(div8, div3);
    			mount_component(square0, div3, null);
    			append(div3, t2);
    			mount_component(square1, div3, null);
    			append(div3, t3);
    			mount_component(square2, div3, null);
    			append(div8, t4);
    			append(div8, div7);
    			append(div7, div6);
    			append(div6, div4);
    			append(div4, t5);
    			append(div6, t6);
    			append(div6, div5);
    			append(div5, t7);
    			append(div5, t8);
    			append(div5, a0);
    			append(div5, t10);
    			append(div5, a1);
    			append(div5, t12);
    			append(div5, t13);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const poverty_changes = {};
    			if (dirty[1] & /*povertyProjCountries*/ 32) poverty_changes.compareData = /*povertyProjCountries*/ ctx[36];
    			if (dirty[1] & /*mainProjCountries*/ 128) poverty_changes.titleListMain = /*mainProjCountries*/ ctx[38];
    			if (dirty[1] & /*nameProjCountries*/ 256) poverty_changes.titleListName = /*nameProjCountries*/ ctx[39];
    			if (dirty[1] & /*numberProjCountries*/ 512) poverty_changes.titleListNumber = /*numberProjCountries*/ ctx[40];
    			poverty.$set(poverty_changes);
    			const square0_changes = {};
    			if (dirty[1] & /*translations*/ 16384) square0_changes.text = /*translations*/ ctx[45].app.southAsia;
    			square0.$set(square0_changes);
    			const square1_changes = {};
    			if (dirty[1] & /*translations*/ 16384) square1_changes.text = /*translations*/ ctx[45].app.subSahAfrica;
    			square1.$set(square1_changes);
    			const square2_changes = {};
    			if (dirty[1] & /*translations*/ 16384) square2_changes.text = /*translations*/ ctx[45].app.eastAsiaPacific;
    			square2.$set(square2_changes);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t5_value !== (t5_value = /*translations*/ ctx[45].app.projectedPovery + "")) set_data(t5, t5_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t7_value !== (t7_value = /*translations*/ ctx[45].app.sources + "")) set_data(t7, t7_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t13_value !== (t13_value = /*translations*/ ctx[45].app.authorsCalculations + "")) set_data(t13, t13_value);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(poverty.$$.fragment, local);
    			transition_in(square0.$$.fragment, local);
    			transition_in(square1.$$.fragment, local);
    			transition_in(square2.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(poverty.$$.fragment, local);
    			transition_out(square0.$$.fragment, local);
    			transition_out(square1.$$.fragment, local);
    			transition_out(square2.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			destroy_component(poverty);
    			if (detaching) detach(t0);
    			if (detaching) detach(div8);
    			destroy_component(square0);
    			destroy_component(square1);
    			destroy_component(square2);
    		}
    	};
    }

    // (903:4) {#if 1 == currentPoverty}
    function create_if_block_8(ctx) {
    	let div1;
    	let div0;
    	let t0;
    	let div7;
    	let div2;
    	let t1;
    	let div6;
    	let div5;
    	let div3;
    	let t2_value = /*translations*/ ctx[45].app.projectedPovery + "";
    	let t2;
    	let t3;
    	let div4;
    	let t4_value = /*translations*/ ctx[45].app.sources + "";
    	let t4;
    	let t5;
    	let a0;
    	let t7;
    	let a1;
    	let t9;
    	let t10_value = /*translations*/ ctx[45].app.authorsCalculations + "";
    	let t10;
    	let current;

    	const poverty = new Poverty({
    			props: {
    				compareData: /*povertyProjRegions*/ ctx[37],
    				titleListMain: /*mainProjRegions*/ ctx[41],
    				titleListName: /*nameProjRegions*/ ctx[42],
    				titleListNumber: /*numberProjRegions*/ ctx[43],
    				colorsList: /*colorsProjRegions*/ ctx[62]
    			}
    		});

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			create_component(poverty.$$.fragment);
    			t0 = space();
    			div7 = element("div");
    			div2 = element("div");
    			div2.innerHTML = `<svg width="${90}" height="${90}" style="background-color: white"></svg>`;
    			t1 = space();
    			div6 = element("div");
    			div5 = element("div");
    			div3 = element("div");
    			t2 = text(t2_value);
    			t3 = space();
    			div4 = element("div");
    			t4 = text(t4_value);
    			t5 = space();
    			a0 = element("a");
    			a0.textContent = "IFM";
    			t7 = text(", \n\t\t\t\t\t\t\t\t\t");
    			a1 = element("a");
    			a1.textContent = "POVCAL";
    			t9 = space();
    			t10 = text(t10_value);
    			attr(div0, "class", "child svelte-1havf7j");
    			attr(div1, "class", "twelve columns");
    			set_style(div1, "text-align", "center");
    			set_style(div1, "margin-top", "25px");
    			attr(div2, "class", "four columns");
    			attr(div3, "class", "parameter-text svelte-1havf7j");
    			attr(a0, "href", "https://www.imf.org/~/media/Files/Publications/WEO/2020/April/English/execsum.ashx?la=en");
    			attr(a1, "href", "https://data.worldbank.org/indicator/SI.POV.DDA");
    			attr(div4, "class", "parameter-text svelte-1havf7j");
    			attr(div5, "class", "caption svelte-1havf7j");
    			attr(div6, "class", "eight columns");
    			attr(div7, "class", "row svelte-1havf7j");
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);
    			mount_component(poverty, div0, null);
    			insert(target, t0, anchor);
    			insert(target, div7, anchor);
    			append(div7, div2);
    			append(div7, t1);
    			append(div7, div6);
    			append(div6, div5);
    			append(div5, div3);
    			append(div3, t2);
    			append(div5, t3);
    			append(div5, div4);
    			append(div4, t4);
    			append(div4, t5);
    			append(div4, a0);
    			append(div4, t7);
    			append(div4, a1);
    			append(div4, t9);
    			append(div4, t10);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const poverty_changes = {};
    			if (dirty[1] & /*povertyProjRegions*/ 64) poverty_changes.compareData = /*povertyProjRegions*/ ctx[37];
    			if (dirty[1] & /*mainProjRegions*/ 1024) poverty_changes.titleListMain = /*mainProjRegions*/ ctx[41];
    			if (dirty[1] & /*nameProjRegions*/ 2048) poverty_changes.titleListName = /*nameProjRegions*/ ctx[42];
    			if (dirty[1] & /*numberProjRegions*/ 4096) poverty_changes.titleListNumber = /*numberProjRegions*/ ctx[43];
    			poverty.$set(poverty_changes);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t2_value !== (t2_value = /*translations*/ ctx[45].app.projectedPovery + "")) set_data(t2, t2_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t4_value !== (t4_value = /*translations*/ ctx[45].app.sources + "")) set_data(t4, t4_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t10_value !== (t10_value = /*translations*/ ctx[45].app.authorsCalculations + "")) set_data(t10, t10_value);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(poverty.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(poverty.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			destroy_component(poverty);
    			if (detaching) detach(t0);
    			if (detaching) detach(div7);
    		}
    	};
    }

    // (937:3) {#if 4 === currentTab}
    function create_if_block_6(ctx) {
    	let div9;
    	let div1;
    	let div0;
    	let t0;
    	let div8;
    	let div2;
    	let t1;
    	let div3;
    	let t2;
    	let t3;
    	let div7;
    	let div6;
    	let div4;
    	let t4_value = /*translations*/ ctx[45].app.projectionsCaption + "";
    	let t4;
    	let t5;
    	let div5;
    	let t6_value = /*translations*/ ctx[45].app.source + "";
    	let t6;
    	let t7;
    	let a;
    	let div9_intro;
    	let div9_outro;
    	let current;

    	const projections = new Projections({
    			props: {
    				projectionsTitle: /*projectionsTitle*/ ctx[25],
    				projectionsXAxisLabel: /*projectionsXAxisLabel*/ ctx[26],
    				projectionsYAxisLabel: /*projectionsYAxisLabel*/ ctx[27],
    				language: /*language*/ ctx[4]
    			}
    		});

    	const linelegend0 = new LineLegend({
    			props: {
    				text: /*projectionsLegendDeaths*/ ctx[28],
    				type: "continuous",
    				factorWidth: 15
    			}
    		});

    	const linelegend1 = new LineLegend({
    			props: {
    				text: /*projectionsLegendDeathsProjected*/ ctx[29],
    				type: "dashed",
    				factorWidth: 15
    			}
    		});

    	return {
    		c() {
    			div9 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			create_component(projections.$$.fragment);
    			t0 = space();
    			div8 = element("div");
    			div2 = element("div");
    			div2.innerHTML = `<svg width="${90}" height="${90}" style="background-color: white"></svg>`;
    			t1 = space();
    			div3 = element("div");
    			create_component(linelegend0.$$.fragment);
    			t2 = space();
    			create_component(linelegend1.$$.fragment);
    			t3 = space();
    			div7 = element("div");
    			div6 = element("div");
    			div4 = element("div");
    			t4 = text(t4_value);
    			t5 = space();
    			div5 = element("div");
    			t6 = text(t6_value);
    			t7 = space();
    			a = element("a");
    			a.textContent = "IHME";
    			attr(div0, "class", "child svelte-1havf7j");
    			attr(div1, "class", "twelve columns");
    			attr(div2, "class", "one columns");
    			attr(div3, "class", "three columns");
    			attr(div4, "class", "parameter-text svelte-1havf7j");
    			attr(a, "href", "http://www.healthdata.org/");
    			attr(div5, "class", "parameter-text svelte-1havf7j");
    			attr(div6, "class", "caption svelte-1havf7j");
    			attr(div7, "class", "eight columns");
    			attr(div8, "class", "row svelte-1havf7j");
    			attr(div9, "class", "row svelte-1havf7j");
    		},
    		m(target, anchor) {
    			insert(target, div9, anchor);
    			append(div9, div1);
    			append(div1, div0);
    			mount_component(projections, div0, null);
    			append(div9, t0);
    			append(div9, div8);
    			append(div8, div2);
    			append(div8, t1);
    			append(div8, div3);
    			mount_component(linelegend0, div3, null);
    			append(div3, t2);
    			mount_component(linelegend1, div3, null);
    			append(div8, t3);
    			append(div8, div7);
    			append(div7, div6);
    			append(div6, div4);
    			append(div4, t4);
    			append(div6, t5);
    			append(div6, div5);
    			append(div5, t6);
    			append(div5, t7);
    			append(div5, a);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const projections_changes = {};
    			if (dirty[0] & /*projectionsTitle*/ 33554432) projections_changes.projectionsTitle = /*projectionsTitle*/ ctx[25];
    			if (dirty[0] & /*projectionsXAxisLabel*/ 67108864) projections_changes.projectionsXAxisLabel = /*projectionsXAxisLabel*/ ctx[26];
    			if (dirty[0] & /*projectionsYAxisLabel*/ 134217728) projections_changes.projectionsYAxisLabel = /*projectionsYAxisLabel*/ ctx[27];
    			if (dirty[0] & /*language*/ 16) projections_changes.language = /*language*/ ctx[4];
    			projections.$set(projections_changes);
    			const linelegend0_changes = {};
    			if (dirty[0] & /*projectionsLegendDeaths*/ 268435456) linelegend0_changes.text = /*projectionsLegendDeaths*/ ctx[28];
    			linelegend0.$set(linelegend0_changes);
    			const linelegend1_changes = {};
    			if (dirty[0] & /*projectionsLegendDeathsProjected*/ 536870912) linelegend1_changes.text = /*projectionsLegendDeathsProjected*/ ctx[29];
    			linelegend1.$set(linelegend1_changes);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t4_value !== (t4_value = /*translations*/ ctx[45].app.projectionsCaption + "")) set_data(t4, t4_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t6_value !== (t6_value = /*translations*/ ctx[45].app.source + "")) set_data(t6, t6_value);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(projections.$$.fragment, local);
    			transition_in(linelegend0.$$.fragment, local);
    			transition_in(linelegend1.$$.fragment, local);

    			add_render_callback(() => {
    				if (div9_outro) div9_outro.end(1);
    				if (!div9_intro) div9_intro = create_in_transition(div9, fade, { duration: durationIn });
    				div9_intro.start();
    			});

    			current = true;
    		},
    		o(local) {
    			transition_out(projections.$$.fragment, local);
    			transition_out(linelegend0.$$.fragment, local);
    			transition_out(linelegend1.$$.fragment, local);
    			if (div9_intro) div9_intro.invalidate();
    			div9_outro = create_out_transition(div9, fade, { duration: durationOut });
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div9);
    			destroy_component(projections);
    			destroy_component(linelegend0);
    			destroy_component(linelegend1);
    			if (detaching && div9_outro) div9_outro.end();
    		}
    	};
    }

    // (977:3) {#if 5 == currentTab}
    function create_if_block_4$1(ctx) {
    	let div4;
    	let div3;
    	let div1;
    	let div0;
    	let t1;
    	let table;
    	let thead;
    	let tr0;
    	let th0;
    	let t2_value = /*translations*/ ctx[45].app.location + "";
    	let t2;
    	let t3;
    	let th1;
    	let t4_value = /*translations*/ ctx[45].app.fatalityRates + "";
    	let t4;
    	let t5;
    	let th2;
    	let t6_value = /*translations*/ ctx[45].app.varyFRs + "";
    	let t6;
    	let t7;
    	let th3;
    	let t8_value = /*translations*/ ctx[45].app.infectionRate + "";
    	let t8;
    	let t9;
    	let th4;
    	let t10_value = /*translations*/ ctx[45].app.over60InfectionRate + "";
    	let t10;
    	let t11;
    	let th5;
    	let t12_value = /*translations*/ ctx[45].app.over60InfectionRate + "";
    	let t12;
    	let t13;
    	let th6;
    	let t14_value = /*translations*/ ctx[45].app.elimination + "";
    	let t14;
    	let t15;
    	let th7;
    	let t16_value = /*translations*/ ctx[45].app.infectionUntil + "";
    	let t16;
    	let t17;
    	let th8;
    	let t18_value = /*translations*/ ctx[45].app.infected + "";
    	let t18;
    	let t19;
    	let th9;
    	let t20_value = /*translations*/ ctx[45].app.deaths + "";
    	let t20;
    	let t21;
    	let th10;
    	let t22_value = /*translations*/ ctx[45].app.yrsOfLifeLost + "";
    	let t22;
    	let t23;
    	let th11;
    	let t24_value = /*translations*/ ctx[45].app.yrsOfLifeLostCosts + "";
    	let t24;
    	let t25;
    	let th12;
    	let t26_value = /*translations*/ ctx[45].app.scenariosDescription + "";
    	let t26;
    	let t27;
    	let tbody;
    	let t28;
    	let tr1;
    	let td0;
    	let span0;
    	let t29;
    	let t30;
    	let td1;
    	let span1;
    	let t31_value = /*translations*/ ctx[45].fatalityRisks[/*selectedSourceId*/ ctx[46]].source + "";
    	let t31;
    	let t32;
    	let td2;
    	let span2;
    	let t33;
    	let t34;
    	let t35;
    	let td3;
    	let span3;
    	let t36;
    	let t37;
    	let t38;
    	let td4;
    	let span4;
    	let t39;
    	let t40;
    	let t41;
    	let td5;
    	let span5;
    	let t42;
    	let t43;
    	let t44;
    	let td6;
    	let span6;
    	let t45;
    	let t46;
    	let t47;
    	let td7;
    	let span7;
    	let t48;
    	let t49;
    	let t50;
    	let td8;
    	let span8;
    	let t51_value = numberFormatter(/*totalInfected*/ ctx[48]) + "";
    	let t51;
    	let t52;
    	let td9;
    	let span9;
    	let t53_value = numberFormatter(/*totalDeaths*/ ctx[49]) + "";
    	let t53;
    	let t54;
    	let td10;
    	let span10;
    	let t55_value = numberFormatter(/*totalYearsLost*/ ctx[50]) + "";
    	let t55;
    	let t56;
    	let td11;
    	let span11;
    	let t57;
    	let t58_value = numberFormatter(/*totalMoneyLost*/ ctx[51]) + "";
    	let t58;
    	let t59;
    	let t60;
    	let td12;
    	let input;
    	let t61;
    	let button;
    	let t63;
    	let div2;
    	let div4_intro;
    	let div4_outro;
    	let current;
    	let dispose;
    	let each_value = /*rowsOfScenarios*/ ctx[30];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
    	}

    	return {
    		c() {
    			div4 = element("div");
    			div3 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			div0.textContent = "Hypothetical COVID-19 Scenarios";
    			t1 = space();
    			table = element("table");
    			thead = element("thead");
    			tr0 = element("tr");
    			th0 = element("th");
    			t2 = text(t2_value);
    			t3 = space();
    			th1 = element("th");
    			t4 = text(t4_value);
    			t5 = space();
    			th2 = element("th");
    			t6 = text(t6_value);
    			t7 = space();
    			th3 = element("th");
    			t8 = text(t8_value);
    			t9 = space();
    			th4 = element("th");
    			t10 = text(t10_value);
    			t11 = space();
    			th5 = element("th");
    			t12 = text(t12_value);
    			t13 = space();
    			th6 = element("th");
    			t14 = text(t14_value);
    			t15 = space();
    			th7 = element("th");
    			t16 = text(t16_value);
    			t17 = space();
    			th8 = element("th");
    			t18 = text(t18_value);
    			t19 = space();
    			th9 = element("th");
    			t20 = text(t20_value);
    			t21 = space();
    			th10 = element("th");
    			t22 = text(t22_value);
    			t23 = space();
    			th11 = element("th");
    			t24 = text(t24_value);
    			t25 = space();
    			th12 = element("th");
    			t26 = text(t26_value);
    			t27 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t28 = space();
    			tr1 = element("tr");
    			td0 = element("td");
    			span0 = element("span");
    			t29 = text(/*selectedLocation*/ ctx[2]);
    			t30 = space();
    			td1 = element("td");
    			span1 = element("span");
    			t31 = text(t31_value);
    			t32 = space();
    			td2 = element("td");
    			span2 = element("span");
    			t33 = text(/*pctOfChange*/ ctx[7]);
    			t34 = text("%");
    			t35 = space();
    			td3 = element("td");
    			span3 = element("span");
    			t36 = text(/*pctH*/ ctx[8]);
    			t37 = text("%");
    			t38 = space();
    			td4 = element("td");
    			span4 = element("span");
    			t39 = text(/*pctH_60plus*/ ctx[44]);
    			t40 = text("%");
    			t41 = space();
    			td5 = element("td");
    			span5 = element("span");
    			t42 = text(/*pctH_below60*/ ctx[47]);
    			t43 = text("%");
    			t44 = space();
    			td6 = element("td");
    			span6 = element("span");
    			t45 = text(/*prElimTimes100*/ ctx[9]);
    			t46 = text("%");
    			t47 = space();
    			td7 = element("td");
    			span7 = element("span");
    			t48 = text(/*pctU*/ ctx[10]);
    			t49 = text("%");
    			t50 = space();
    			td8 = element("td");
    			span8 = element("span");
    			t51 = text(t51_value);
    			t52 = space();
    			td9 = element("td");
    			span9 = element("span");
    			t53 = text(t53_value);
    			t54 = space();
    			td10 = element("td");
    			span10 = element("span");
    			t55 = text(t55_value);
    			t56 = space();
    			td11 = element("td");
    			span11 = element("span");
    			t57 = text("$");
    			t58 = text(t58_value);
    			t59 = text("B");
    			t60 = space();
    			td12 = element("td");
    			input = element("input");
    			t61 = space();
    			button = element("button");
    			button.textContent = "Add";
    			t63 = space();
    			div2 = element("div");
    			div2.innerHTML = `<span class="parameter-text svelte-1havf7j"></span>`;
    			attr(div0, "class", "wtitle svelte-1havf7j");
    			attr(th0, "class", "svelte-1havf7j");
    			attr(th1, "class", "svelte-1havf7j");
    			attr(th2, "class", "svelte-1havf7j");
    			attr(th3, "class", "svelte-1havf7j");
    			attr(th4, "class", "svelte-1havf7j");
    			attr(th5, "class", "svelte-1havf7j");
    			attr(th6, "class", "svelte-1havf7j");
    			attr(th7, "class", "svelte-1havf7j");
    			attr(th8, "class", "svelte-1havf7j");
    			attr(th9, "class", "svelte-1havf7j");
    			attr(th10, "class", "svelte-1havf7j");
    			attr(th11, "class", "svelte-1havf7j");
    			attr(th12, "class", "svelte-1havf7j");
    			attr(span0, "class", "parameter svelte-1havf7j");
    			attr(td0, "class", "svelte-1havf7j");
    			attr(span1, "class", "parameter svelte-1havf7j");
    			attr(td1, "class", "svelte-1havf7j");
    			attr(span2, "class", "parameter svelte-1havf7j");
    			attr(td2, "class", "svelte-1havf7j");
    			attr(span3, "class", "parameter svelte-1havf7j");
    			attr(td3, "class", "svelte-1havf7j");
    			attr(span4, "class", "parameter svelte-1havf7j");
    			attr(td4, "class", "svelte-1havf7j");
    			attr(span5, "class", "parameter svelte-1havf7j");
    			attr(td5, "class", "svelte-1havf7j");
    			attr(span6, "class", "parameter svelte-1havf7j");
    			attr(td6, "class", "svelte-1havf7j");
    			attr(span7, "class", "parameter svelte-1havf7j");
    			attr(td7, "class", "svelte-1havf7j");
    			attr(span8, "class", "parameter svelte-1havf7j");
    			attr(td8, "class", "svelte-1havf7j");
    			attr(span9, "class", "parameter svelte-1havf7j");
    			attr(td9, "class", "svelte-1havf7j");
    			attr(span10, "class", "parameter svelte-1havf7j");
    			attr(td10, "class", "svelte-1havf7j");
    			attr(span11, "class", "parameter svelte-1havf7j");
    			attr(td11, "class", "svelte-1havf7j");
    			attr(button, "class", "button svelte-1havf7j");
    			attr(td12, "class", "svelte-1havf7j");
    			attr(table, "class", "table1 svelte-1havf7j");
    			attr(div1, "class", "child parameter-text svelte-1havf7j");
    			attr(div2, "class", "caption svelte-1havf7j");
    			attr(div3, "class", "twelve columns");
    			attr(div4, "class", "row svelte-1havf7j");
    		},
    		m(target, anchor, remount) {
    			insert(target, div4, anchor);
    			append(div4, div3);
    			append(div3, div1);
    			append(div1, div0);
    			append(div1, t1);
    			append(div1, table);
    			append(table, thead);
    			append(thead, tr0);
    			append(tr0, th0);
    			append(th0, t2);
    			append(tr0, t3);
    			append(tr0, th1);
    			append(th1, t4);
    			append(tr0, t5);
    			append(tr0, th2);
    			append(th2, t6);
    			append(tr0, t7);
    			append(tr0, th3);
    			append(th3, t8);
    			append(tr0, t9);
    			append(tr0, th4);
    			append(th4, t10);
    			append(tr0, t11);
    			append(tr0, th5);
    			append(th5, t12);
    			append(tr0, t13);
    			append(tr0, th6);
    			append(th6, t14);
    			append(tr0, t15);
    			append(tr0, th7);
    			append(th7, t16);
    			append(tr0, t17);
    			append(tr0, th8);
    			append(th8, t18);
    			append(tr0, t19);
    			append(tr0, th9);
    			append(th9, t20);
    			append(tr0, t21);
    			append(tr0, th10);
    			append(th10, t22);
    			append(tr0, t23);
    			append(tr0, th11);
    			append(th11, t24);
    			append(tr0, t25);
    			append(tr0, th12);
    			append(th12, t26);
    			append(table, t27);
    			append(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tbody, null);
    			}

    			append(tbody, t28);
    			append(tbody, tr1);
    			append(tr1, td0);
    			append(td0, span0);
    			append(span0, t29);
    			append(tr1, t30);
    			append(tr1, td1);
    			append(td1, span1);
    			append(span1, t31);
    			append(tr1, t32);
    			append(tr1, td2);
    			append(td2, span2);
    			append(span2, t33);
    			append(span2, t34);
    			append(tr1, t35);
    			append(tr1, td3);
    			append(td3, span3);
    			append(span3, t36);
    			append(span3, t37);
    			append(tr1, t38);
    			append(tr1, td4);
    			append(td4, span4);
    			append(span4, t39);
    			append(span4, t40);
    			append(tr1, t41);
    			append(tr1, td5);
    			append(td5, span5);
    			append(span5, t42);
    			append(span5, t43);
    			append(tr1, t44);
    			append(tr1, td6);
    			append(td6, span6);
    			append(span6, t45);
    			append(span6, t46);
    			append(tr1, t47);
    			append(tr1, td7);
    			append(td7, span7);
    			append(span7, t48);
    			append(span7, t49);
    			append(tr1, t50);
    			append(tr1, td8);
    			append(td8, span8);
    			append(span8, t51);
    			append(tr1, t52);
    			append(tr1, td9);
    			append(td9, span9);
    			append(span9, t53);
    			append(tr1, t54);
    			append(tr1, td10);
    			append(td10, span10);
    			append(span10, t55);
    			append(tr1, t56);
    			append(tr1, td11);
    			append(td11, span11);
    			append(span11, t57);
    			append(span11, t58);
    			append(span11, t59);
    			append(tr1, t60);
    			append(tr1, td12);
    			append(td12, input);
    			set_input_value(input, /*desc*/ ctx[3]);
    			append(td12, t61);
    			append(td12, button);
    			append(div3, t63);
    			append(div3, div2);
    			current = true;
    			if (remount) run_all(dispose);

    			dispose = [
    				listen(input, "input", /*input_input_handler*/ ctx[130]),
    				listen(button, "click", /*addScenario*/ ctx[59])
    			];
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[1] & /*translations*/ 16384) && t2_value !== (t2_value = /*translations*/ ctx[45].app.location + "")) set_data(t2, t2_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t4_value !== (t4_value = /*translations*/ ctx[45].app.fatalityRates + "")) set_data(t4, t4_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t6_value !== (t6_value = /*translations*/ ctx[45].app.varyFRs + "")) set_data(t6, t6_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t8_value !== (t8_value = /*translations*/ ctx[45].app.infectionRate + "")) set_data(t8, t8_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t10_value !== (t10_value = /*translations*/ ctx[45].app.over60InfectionRate + "")) set_data(t10, t10_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t12_value !== (t12_value = /*translations*/ ctx[45].app.over60InfectionRate + "")) set_data(t12, t12_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t14_value !== (t14_value = /*translations*/ ctx[45].app.elimination + "")) set_data(t14, t14_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t16_value !== (t16_value = /*translations*/ ctx[45].app.infectionUntil + "")) set_data(t16, t16_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t18_value !== (t18_value = /*translations*/ ctx[45].app.infected + "")) set_data(t18, t18_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t20_value !== (t20_value = /*translations*/ ctx[45].app.deaths + "")) set_data(t20, t20_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t22_value !== (t22_value = /*translations*/ ctx[45].app.yrsOfLifeLost + "")) set_data(t22, t22_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t24_value !== (t24_value = /*translations*/ ctx[45].app.yrsOfLifeLostCosts + "")) set_data(t24, t24_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t26_value !== (t26_value = /*translations*/ ctx[45].app.scenariosDescription + "")) set_data(t26, t26_value);

    			if (dirty[0] & /*rowsOfScenarios*/ 1073741824 | dirty[1] & /*deleteScenario*/ 536870912) {
    				each_value = /*rowsOfScenarios*/ ctx[30];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$3(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tbody, t28);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (!current || dirty[0] & /*selectedLocation*/ 4) set_data(t29, /*selectedLocation*/ ctx[2]);
    			if ((!current || dirty[1] & /*translations, selectedSourceId*/ 49152) && t31_value !== (t31_value = /*translations*/ ctx[45].fatalityRisks[/*selectedSourceId*/ ctx[46]].source + "")) set_data(t31, t31_value);
    			if (!current || dirty[0] & /*pctOfChange*/ 128) set_data(t33, /*pctOfChange*/ ctx[7]);
    			if (!current || dirty[0] & /*pctH*/ 256) set_data(t36, /*pctH*/ ctx[8]);
    			if (!current || dirty[1] & /*pctH_60plus*/ 8192) set_data(t39, /*pctH_60plus*/ ctx[44]);
    			if (!current || dirty[1] & /*pctH_below60*/ 65536) set_data(t42, /*pctH_below60*/ ctx[47]);
    			if (!current || dirty[0] & /*prElimTimes100*/ 512) set_data(t45, /*prElimTimes100*/ ctx[9]);
    			if (!current || dirty[0] & /*pctU*/ 1024) set_data(t48, /*pctU*/ ctx[10]);
    			if ((!current || dirty[1] & /*totalInfected*/ 131072) && t51_value !== (t51_value = numberFormatter(/*totalInfected*/ ctx[48]) + "")) set_data(t51, t51_value);
    			if ((!current || dirty[1] & /*totalDeaths*/ 262144) && t53_value !== (t53_value = numberFormatter(/*totalDeaths*/ ctx[49]) + "")) set_data(t53, t53_value);
    			if ((!current || dirty[1] & /*totalYearsLost*/ 524288) && t55_value !== (t55_value = numberFormatter(/*totalYearsLost*/ ctx[50]) + "")) set_data(t55, t55_value);
    			if ((!current || dirty[1] & /*totalMoneyLost*/ 1048576) && t58_value !== (t58_value = numberFormatter(/*totalMoneyLost*/ ctx[51]) + "")) set_data(t58, t58_value);

    			if (dirty[0] & /*desc*/ 8 && input.value !== /*desc*/ ctx[3]) {
    				set_input_value(input, /*desc*/ ctx[3]);
    			}
    		},
    		i(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (div4_outro) div4_outro.end(1);
    				if (!div4_intro) div4_intro = create_in_transition(div4, fade, { duration: durationIn });
    				div4_intro.start();
    			});

    			current = true;
    		},
    		o(local) {
    			if (div4_intro) div4_intro.invalidate();
    			div4_outro = create_out_transition(div4, fade, { duration: durationOut });
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div4);
    			destroy_each(each_blocks, detaching);
    			if (detaching && div4_outro) div4_outro.end();
    			run_all(dispose);
    		}
    	};
    }

    // (1019:11) {#if scenario.id > 2}
    function create_if_block_5(ctx) {
    	let button;
    	let dispose;

    	return {
    		c() {
    			button = element("button");
    			button.textContent = "Delete";
    			attr(button, "class", "button svelte-1havf7j");
    		},
    		m(target, anchor, remount) {
    			insert(target, button, anchor);
    			if (remount) dispose();

    			dispose = listen(button, "click", function () {
    				if (is_function(/*deleteScenario*/ ctx[60](/*scenario*/ ctx[136].id))) /*deleteScenario*/ ctx[60](/*scenario*/ ctx[136].id).apply(this, arguments);
    			});
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			dispose();
    		}
    	};
    }

    // (1004:8) {#each rowsOfScenarios as scenario}
    function create_each_block$3(ctx) {
    	let tr;
    	let td0;
    	let span0;
    	let t0_value = /*scenario*/ ctx[136].loc + "";
    	let t0;
    	let t1;
    	let td1;
    	let span1;
    	let t2_value = /*scenario*/ ctx[136].frs + "";
    	let t2;
    	let t3;
    	let td2;
    	let t4_value = /*scenario*/ ctx[136].F + "";
    	let t4;
    	let t5;
    	let t6;
    	let td3;
    	let t7_value = /*scenario*/ ctx[136].H + "";
    	let t7;
    	let t8;
    	let t9;
    	let td4;
    	let t10_value = /*scenario*/ ctx[136].H_60 + "";
    	let t10;
    	let t11;
    	let t12;
    	let td5;
    	let t13_value = /*scenario*/ ctx[136].H_below + "";
    	let t13;
    	let t14;
    	let t15;
    	let td6;
    	let t16_value = /*scenario*/ ctx[136].Elim + "";
    	let t16;
    	let t17;
    	let t18;
    	let td7;
    	let t19_value = /*scenario*/ ctx[136].U + "";
    	let t19;
    	let t20;
    	let t21;
    	let td8;
    	let t22_value = numberFormatter(/*scenario*/ ctx[136].totInf) + "";
    	let t22;
    	let t23;
    	let td9;
    	let t24_value = numberFormatter(/*scenario*/ ctx[136].totDeaths) + "";
    	let t24;
    	let t25;
    	let td10;
    	let t26_value = numberFormatter(/*scenario*/ ctx[136].yrsLifeLost) + "";
    	let t26;
    	let t27;
    	let td11;
    	let t28;
    	let t29_value = numberFormatter(/*scenario*/ ctx[136].yrsLifeLostCosts) + "";
    	let t29;
    	let t30;
    	let t31;
    	let td12;
    	let t32_value = /*scenario*/ ctx[136].comments + "";
    	let t32;
    	let t33;
    	let if_block = /*scenario*/ ctx[136].id > 2 && create_if_block_5(ctx);

    	return {
    		c() {
    			tr = element("tr");
    			td0 = element("td");
    			span0 = element("span");
    			t0 = text(t0_value);
    			t1 = space();
    			td1 = element("td");
    			span1 = element("span");
    			t2 = text(t2_value);
    			t3 = space();
    			td2 = element("td");
    			t4 = text(t4_value);
    			t5 = text("%");
    			t6 = space();
    			td3 = element("td");
    			t7 = text(t7_value);
    			t8 = text("%");
    			t9 = space();
    			td4 = element("td");
    			t10 = text(t10_value);
    			t11 = text("%");
    			t12 = space();
    			td5 = element("td");
    			t13 = text(t13_value);
    			t14 = text("%");
    			t15 = space();
    			td6 = element("td");
    			t16 = text(t16_value);
    			t17 = text("%");
    			t18 = space();
    			td7 = element("td");
    			t19 = text(t19_value);
    			t20 = text("%");
    			t21 = space();
    			td8 = element("td");
    			t22 = text(t22_value);
    			t23 = space();
    			td9 = element("td");
    			t24 = text(t24_value);
    			t25 = space();
    			td10 = element("td");
    			t26 = text(t26_value);
    			t27 = space();
    			td11 = element("td");
    			t28 = text("$");
    			t29 = text(t29_value);
    			t30 = text("B");
    			t31 = space();
    			td12 = element("td");
    			t32 = text(t32_value);
    			t33 = space();
    			if (if_block) if_block.c();
    			attr(span0, "class", "parameter svelte-1havf7j");
    			attr(td0, "class", "svelte-1havf7j");
    			attr(span1, "class", "parameter svelte-1havf7j");
    			attr(td1, "class", "svelte-1havf7j");
    			attr(td2, "class", "svelte-1havf7j");
    			attr(td3, "class", "svelte-1havf7j");
    			attr(td4, "class", "svelte-1havf7j");
    			attr(td5, "class", "svelte-1havf7j");
    			attr(td6, "class", "svelte-1havf7j");
    			attr(td7, "class", "svelte-1havf7j");
    			attr(td8, "class", "svelte-1havf7j");
    			attr(td9, "class", "svelte-1havf7j");
    			attr(td10, "class", "svelte-1havf7j");
    			attr(td11, "class", "svelte-1havf7j");
    			attr(td12, "class", "svelte-1havf7j");
    		},
    		m(target, anchor) {
    			insert(target, tr, anchor);
    			append(tr, td0);
    			append(td0, span0);
    			append(span0, t0);
    			append(tr, t1);
    			append(tr, td1);
    			append(td1, span1);
    			append(span1, t2);
    			append(tr, t3);
    			append(tr, td2);
    			append(td2, t4);
    			append(td2, t5);
    			append(tr, t6);
    			append(tr, td3);
    			append(td3, t7);
    			append(td3, t8);
    			append(tr, t9);
    			append(tr, td4);
    			append(td4, t10);
    			append(td4, t11);
    			append(tr, t12);
    			append(tr, td5);
    			append(td5, t13);
    			append(td5, t14);
    			append(tr, t15);
    			append(tr, td6);
    			append(td6, t16);
    			append(td6, t17);
    			append(tr, t18);
    			append(tr, td7);
    			append(td7, t19);
    			append(td7, t20);
    			append(tr, t21);
    			append(tr, td8);
    			append(td8, t22);
    			append(tr, t23);
    			append(tr, td9);
    			append(td9, t24);
    			append(tr, t25);
    			append(tr, td10);
    			append(td10, t26);
    			append(tr, t27);
    			append(tr, td11);
    			append(td11, t28);
    			append(td11, t29);
    			append(td11, t30);
    			append(tr, t31);
    			append(tr, td12);
    			append(td12, t32);
    			append(td12, t33);
    			if (if_block) if_block.m(td12, null);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*rowsOfScenarios*/ 1073741824 && t0_value !== (t0_value = /*scenario*/ ctx[136].loc + "")) set_data(t0, t0_value);
    			if (dirty[0] & /*rowsOfScenarios*/ 1073741824 && t2_value !== (t2_value = /*scenario*/ ctx[136].frs + "")) set_data(t2, t2_value);
    			if (dirty[0] & /*rowsOfScenarios*/ 1073741824 && t4_value !== (t4_value = /*scenario*/ ctx[136].F + "")) set_data(t4, t4_value);
    			if (dirty[0] & /*rowsOfScenarios*/ 1073741824 && t7_value !== (t7_value = /*scenario*/ ctx[136].H + "")) set_data(t7, t7_value);
    			if (dirty[0] & /*rowsOfScenarios*/ 1073741824 && t10_value !== (t10_value = /*scenario*/ ctx[136].H_60 + "")) set_data(t10, t10_value);
    			if (dirty[0] & /*rowsOfScenarios*/ 1073741824 && t13_value !== (t13_value = /*scenario*/ ctx[136].H_below + "")) set_data(t13, t13_value);
    			if (dirty[0] & /*rowsOfScenarios*/ 1073741824 && t16_value !== (t16_value = /*scenario*/ ctx[136].Elim + "")) set_data(t16, t16_value);
    			if (dirty[0] & /*rowsOfScenarios*/ 1073741824 && t19_value !== (t19_value = /*scenario*/ ctx[136].U + "")) set_data(t19, t19_value);
    			if (dirty[0] & /*rowsOfScenarios*/ 1073741824 && t22_value !== (t22_value = numberFormatter(/*scenario*/ ctx[136].totInf) + "")) set_data(t22, t22_value);
    			if (dirty[0] & /*rowsOfScenarios*/ 1073741824 && t24_value !== (t24_value = numberFormatter(/*scenario*/ ctx[136].totDeaths) + "")) set_data(t24, t24_value);
    			if (dirty[0] & /*rowsOfScenarios*/ 1073741824 && t26_value !== (t26_value = numberFormatter(/*scenario*/ ctx[136].yrsLifeLost) + "")) set_data(t26, t26_value);
    			if (dirty[0] & /*rowsOfScenarios*/ 1073741824 && t29_value !== (t29_value = numberFormatter(/*scenario*/ ctx[136].yrsLifeLostCosts) + "")) set_data(t29, t29_value);
    			if (dirty[0] & /*rowsOfScenarios*/ 1073741824 && t32_value !== (t32_value = /*scenario*/ ctx[136].comments + "")) set_data(t32, t32_value);

    			if (/*scenario*/ ctx[136].id > 2) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_5(ctx);
    					if_block.c();
    					if_block.m(td12, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(tr);
    			if (if_block) if_block.d();
    		}
    	};
    }

    // (1058:3) {#if 6 == currentTab}
    function create_if_block_3$1(ctx) {
    	let div4;
    	let div3;
    	let div1;
    	let div0;
    	let t1;
    	let table;
    	let thead;
    	let t7;
    	let tbody;
    	let tr1;
    	let td0;
    	let span1;
    	let t8;
    	let t9_value = /*rowsOfScenarios*/ ctx[30][0].H + "";
    	let t9;
    	let t10;
    	let span0;
    	let t11_value = /*rowsOfScenarios*/ ctx[30][0].loc + "";
    	let t11;
    	let t12;
    	let t13;
    	let span2;
    	let t14_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].totInf) + "";
    	let t14;
    	let t15;
    	let span3;
    	let t17;
    	let td1;
    	let span4;
    	let t18;
    	let t19_value = /*rowsOfScenarios*/ ctx[30][1].H_60 + "";
    	let t19;
    	let t20;
    	let t21_value = /*rowsOfScenarios*/ ctx[30][1].H_below + "";
    	let t21;
    	let t22;
    	let t23_value = /*rowsOfScenarios*/ ctx[30][1].H + "";
    	let t23;
    	let t24;
    	let t25;
    	let td2;
    	let span5;
    	let t26;
    	let t27_value = /*rowsOfScenarios*/ ctx[30][2].Elim + "";
    	let t27;
    	let t28;
    	let t29_value = /*rowsOfScenarios*/ ctx[30][2].U + "";
    	let t29;
    	let t30;
    	let t31;
    	let tr2;
    	let td3;
    	let span8;
    	let t32;
    	let span6;
    	let t33_value = /*translations*/ ctx[45].fatalityRisks[/*selectedSourceId*/ ctx[46]].source + "";
    	let t33;
    	let t34;
    	let span7;
    	let t35_value = /*rowsOfScenarios*/ ctx[30][0].loc + "";
    	let t35;
    	let t36;
    	let t37;
    	let span9;
    	let t38_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].totDeaths) + "";
    	let t38;
    	let t39;
    	let span10;
    	let t41;
    	let td4;
    	let span11;
    	let t42;
    	let t43_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].totDeaths) + "";
    	let t43;
    	let t44;
    	let t45_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][1].totDeaths) + "";
    	let t45;
    	let t46;
    	let t47;
    	let span12;
    	let t48_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].totDeaths - /*rowsOfScenarios*/ ctx[30][1].totDeaths) + "";
    	let t48;
    	let t49;
    	let span13;
    	let t51;
    	let span14;
    	let t52_value = Math.round(-100 * (/*rowsOfScenarios*/ ctx[30][1].totDeaths / /*rowsOfScenarios*/ ctx[30][0].totDeaths - 1)) + "";
    	let t52;
    	let t53;
    	let t54;
    	let span15;
    	let t56;
    	let td5;
    	let span16;
    	let t57;
    	let t58_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].totDeaths) + "";
    	let t58;
    	let t59;
    	let t60_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][2].totDeaths) + "";
    	let t60;
    	let t61;
    	let t62;
    	let span17;
    	let t63_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].totDeaths - /*rowsOfScenarios*/ ctx[30][2].totDeaths) + "";
    	let t63;
    	let t64;
    	let span18;
    	let t66;
    	let span19;
    	let t67_value = Math.round(-100 * (/*rowsOfScenarios*/ ctx[30][2].totDeaths / /*rowsOfScenarios*/ ctx[30][0].totDeaths - 1)) + "";
    	let t67;
    	let t68;
    	let t69;
    	let span20;
    	let t71;
    	let tr3;
    	let td6;
    	let span21;
    	let t73;
    	let span22;
    	let t74_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].yrsLifeLost) + "";
    	let t74;
    	let t75;
    	let span23;
    	let t77;
    	let span24;
    	let t78;
    	let t79_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].yrsLifeLostCosts) + "";
    	let t79;
    	let t80;
    	let t81;
    	let td7;
    	let span25;
    	let t82;
    	let t83_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].yrsLifeLost) + "";
    	let t83;
    	let t84;
    	let t85_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][1].yrsLifeLost) + "";
    	let t85;
    	let t86;
    	let t87;
    	let span26;
    	let t88_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].yrsLifeLost - /*rowsOfScenarios*/ ctx[30][1].yrsLifeLost) + "";
    	let t88;
    	let t89;
    	let span27;
    	let t91;
    	let span28;
    	let t92_value = Math.round(100 * /*rowsOfScenarios*/ ctx[30][1].yrsLifeLost / /*rowsOfScenarios*/ ctx[30][0].yrsLifeLost) + "";
    	let t92;
    	let t93;
    	let t94;
    	let span29;
    	let t96;
    	let td8;
    	let span30;
    	let t97;
    	let t98_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].yrsLifeLostCosts) + "";
    	let t98;
    	let t99;
    	let t100_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][2].yrsLifeLostCosts) + "";
    	let t100;
    	let t101;
    	let t102;
    	let span31;
    	let t103;
    	let t104_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].yrsLifeLostCosts - /*rowsOfScenarios*/ ctx[30][2].yrsLifeLostCosts) + "";
    	let t104;
    	let t105;
    	let t106;
    	let span32;
    	let t108;
    	let div2;
    	let div4_intro;
    	let div4_outro;
    	let current;

    	return {
    		c() {
    			div4 = element("div");
    			div3 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			div0.textContent = "Example Interpretations";
    			t1 = space();
    			table = element("table");
    			thead = element("thead");

    			thead.innerHTML = `<tr class="parameter-title svelte-1havf7j"><th>Scenario 0: Do nothing, as a baseline</th> 
										<th>Scenario 1: Decrease infection rate for people over 60
											and increase for those below 60</th> 
										<th>Scenario 2: Increase the probability of elimination</th></tr>`;

    			t7 = space();
    			tbody = element("tbody");
    			tr1 = element("tr");
    			td0 = element("td");
    			span1 = element("span");
    			t8 = text("If by the pandemic's end ");
    			t9 = text(t9_value);
    			t10 = text("%\n\t\t\t\t\t\t\t\t\t\t\tof all age groups are infected in:\n\t\t\t\t\t\t\t\t\t\t\t");
    			span0 = element("span");
    			t11 = text(t11_value);
    			t12 = text(".\n\t\t\t\t\t\t\t\t\t\t\tThen we can expect:");
    			t13 = space();
    			span2 = element("span");
    			t14 = text(t14_value);
    			t15 = space();
    			span3 = element("span");
    			span3.textContent = "infected.";
    			t17 = space();
    			td1 = element("td");
    			span4 = element("span");
    			t18 = text("If by the pandemic's end only ");
    			t19 = text(t19_value);
    			t20 = text("%\n\t\t\t\t\t\t\t\t\t\t\tof people over 60 have been infected.\n\t\t\t\t\t\t\t\t\t\t\tThen to compensate ");
    			t21 = text(t21_value);
    			t22 = text("%\n\t\t\t\t\t\t\t\t\t\t\tof people below 60 need to be infected to achieve\n\t\t\t\t\t\t\t\t\t\t\tthe ");
    			t23 = text(t23_value);
    			t24 = text("% overall proportion of infected.");
    			t25 = space();
    			td2 = element("td");
    			span5 = element("span");
    			t26 = text("Say we manage to increase the probability\n\t\t\t\t\t\t\t\t\t\t\tof achieving COVID-19 elimination from 0\n\t\t\t\t\t\t\t\t\t\t\tto ");
    			t27 = text(t27_value);
    			t28 = text("%\n\t\t\t\t\t\t\t\t\t\t\tand say that ");
    			t29 = text(t29_value);
    			t30 = text("%\n\t\t\t\t\t\t\t\t\t\t\tof people get infected until elimination is achieved.");
    			t31 = space();
    			tr2 = element("tr");
    			td3 = element("td");
    			span8 = element("span");
    			t32 = text("Based on selected fatality risks\n\t\t\t\t\t\t\t\t\t\t\t");
    			span6 = element("span");
    			t33 = text(t33_value);
    			t34 = text("\n\t\t\t\t\t\t\t\t\t\t\tand ");
    			span7 = element("span");
    			t35 = text(t35_value);
    			t36 = text("'s age distribution\n\t\t\t\t\t\t\t\t\t\t\twe can expect:");
    			t37 = space();
    			span9 = element("span");
    			t38 = text(t38_value);
    			t39 = space();
    			span10 = element("span");
    			span10.textContent = "lifes lost.";
    			t41 = space();
    			td4 = element("td");
    			span11 = element("span");
    			t42 = text("Then we can expect to save:\n\t\t\t\t\t\t\t\t\t\t\t");
    			t43 = text(t43_value);
    			t44 = text(" -\n\t\t\t\t\t\t\t\t\t\t\t");
    			t45 = text(t45_value);
    			t46 = text(" =");
    			t47 = space();
    			span12 = element("span");
    			t48 = text(t48_value);
    			t49 = space();
    			span13 = element("span");
    			span13.textContent = "lifes or achieve";
    			t51 = space();
    			span14 = element("span");
    			t52 = text(t52_value);
    			t53 = text("%");
    			t54 = space();
    			span15 = element("span");
    			span15.textContent = "decrease in risk of death.";
    			t56 = space();
    			td5 = element("td");
    			span16 = element("span");
    			t57 = text("Then we can expect to save:\n\t\t\t\t\t\t\t\t\t\t\t");
    			t58 = text(t58_value);
    			t59 = text(" -\n\t\t\t\t\t\t\t\t\t\t\t");
    			t60 = text(t60_value);
    			t61 = text(" =");
    			t62 = space();
    			span17 = element("span");
    			t63 = text(t63_value);
    			t64 = space();
    			span18 = element("span");
    			span18.textContent = "lifes\n\t\t\t\t\t\t\t\t\t\t\tor achieve";
    			t66 = space();
    			span19 = element("span");
    			t67 = text(t67_value);
    			t68 = text("%");
    			t69 = space();
    			span20 = element("span");
    			span20.textContent = "decrease in the risk of death.";
    			t71 = space();
    			tr3 = element("tr");
    			td6 = element("td");
    			span21 = element("span");
    			span21.textContent = "Based on global life expectancies and number\n\t\t\t\t\t\t\t\t\t\t\tof deaths across age groups we can expect:";
    			t73 = space();
    			span22 = element("span");
    			t74 = text(t74_value);
    			t75 = space();
    			span23 = element("span");
    			span23.textContent = "expected years of life lost.\n\t\t\t\t\t\t\t\t\t\t\tWe can also estimate expected amount of money lost based on\n\t\t\t\t\t\t\t\t\t\t\texpected years of life lost:";
    			t77 = space();
    			span24 = element("span");
    			t78 = text("$");
    			t79 = text(t79_value);
    			t80 = text("B.");
    			t81 = space();
    			td7 = element("td");
    			span25 = element("span");
    			t82 = text("Since younger people have higher life expectancy than older people,\n\t\t\t\t\t\t\t\t\t\t\tincreasing the proportion of infected people below 60, increases\n\t\t\t\t\t\t\t\t\t\t\tthe number of deaths among young people.\n\t\t\t\t\t\t\t\t\t\t\tBased on selected fatality risks we can expect to save:\n\t\t\t\t\t\t\t\t\t\t\t");
    			t83 = text(t83_value);
    			t84 = text(" -\n\t\t\t\t\t\t\t\t\t\t\t");
    			t85 = text(t85_value);
    			t86 = text(" =");
    			t87 = space();
    			span26 = element("span");
    			t88 = text(t88_value);
    			t89 = space();
    			span27 = element("span");
    			span27.textContent = "years of potential life or achieve";
    			t91 = space();
    			span28 = element("span");
    			t92 = text(t92_value);
    			t93 = text("%");
    			t94 = space();
    			span29 = element("span");
    			span29.textContent = "decrease in expected years of life lost.";
    			t96 = space();
    			td8 = element("td");
    			span30 = element("span");
    			t97 = text("Based on expected years of life lost\n\t\t\t\t\t\t\t\t\t\t\twe can expect to save:\n\t\t\t\t\t\t\t\t\t\t\t$");
    			t98 = text(t98_value);
    			t99 = text("B -\n\t\t\t\t\t\t\t\t\t\t\t$");
    			t100 = text(t100_value);
    			t101 = text("B =");
    			t102 = space();
    			span31 = element("span");
    			t103 = text("$");
    			t104 = text(t104_value);
    			t105 = text("B.");
    			t106 = space();
    			span32 = element("span");
    			span32.textContent = "This is also a crude estimate of what a society could aim to invest in\n\t\t\t\t\t\t\t\t\t\t\tsuch a life-saving treatments (e.g. development of vaccines)\n\t\t\t\t\t\t\t\t\t\t\tor life-saving interventions (e.g. social distancing).";
    			t108 = space();
    			div2 = element("div");

    			div2.innerHTML = `<span class="parameter-text svelte-1havf7j">
								Estimates should be interpreted with caution.
								This tool is focused on simple presentation and pedagogical aspects
								and only offers crude estimates. It uses relatively simplistic
								methodology outlined in the Notes below.
							</span>`;

    			attr(div0, "class", "wtitle svelte-1havf7j");
    			attr(span0, "class", "parameter svelte-1havf7j");
    			attr(span1, "class", "parameter-text svelte-1havf7j");
    			attr(span2, "class", "emphasize-text svelte-1havf7j");
    			attr(span3, "class", "parameter-text svelte-1havf7j");
    			attr(span4, "class", "parameter-text svelte-1havf7j");
    			attr(span5, "class", "parameter-text svelte-1havf7j");
    			attr(span6, "class", "parameter svelte-1havf7j");
    			attr(span7, "class", "parameter svelte-1havf7j");
    			attr(span8, "class", "parameter-text svelte-1havf7j");
    			attr(span9, "class", "emphasize-text svelte-1havf7j");
    			attr(span10, "class", "parameter-text svelte-1havf7j");
    			attr(span11, "class", "parameter-text svelte-1havf7j");
    			attr(span12, "class", "emphasize-text svelte-1havf7j");
    			attr(span13, "class", "parameter-text svelte-1havf7j");
    			attr(span14, "class", "emphasize-text svelte-1havf7j");
    			attr(span15, "class", "parameter-text svelte-1havf7j");
    			attr(span16, "class", "parameter-text svelte-1havf7j");
    			attr(span17, "class", "emphasize-text svelte-1havf7j");
    			attr(span18, "class", "parameter-text svelte-1havf7j");
    			attr(span19, "class", "emphasize-text svelte-1havf7j");
    			attr(span20, "class", "parameter-text svelte-1havf7j");
    			attr(span21, "class", "parameter-text svelte-1havf7j");
    			attr(span22, "class", "emphasize-text svelte-1havf7j");
    			attr(span23, "class", "parameter-text svelte-1havf7j");
    			attr(span24, "class", "emphasize-text svelte-1havf7j");
    			attr(span25, "class", "parameter-text svelte-1havf7j");
    			attr(span26, "class", "emphasize-text svelte-1havf7j");
    			attr(span27, "class", "parameter-text svelte-1havf7j");
    			attr(span28, "class", "emphasize-text svelte-1havf7j");
    			attr(span29, "class", "parameter-text svelte-1havf7j");
    			attr(span30, "class", "parameter-text svelte-1havf7j");
    			attr(span31, "class", "emphasize-text svelte-1havf7j");
    			attr(span32, "class", "parameter-text svelte-1havf7j");
    			attr(table, "class", "table2 svelte-1havf7j");
    			attr(div1, "class", "child svelte-1havf7j");
    			attr(div2, "class", "caption svelte-1havf7j");
    			attr(div3, "class", "twelve columns");
    			attr(div4, "class", "row svelte-1havf7j");
    		},
    		m(target, anchor) {
    			insert(target, div4, anchor);
    			append(div4, div3);
    			append(div3, div1);
    			append(div1, div0);
    			append(div1, t1);
    			append(div1, table);
    			append(table, thead);
    			append(table, t7);
    			append(table, tbody);
    			append(tbody, tr1);
    			append(tr1, td0);
    			append(td0, span1);
    			append(span1, t8);
    			append(span1, t9);
    			append(span1, t10);
    			append(span1, span0);
    			append(span0, t11);
    			append(span1, t12);
    			append(td0, t13);
    			append(td0, span2);
    			append(span2, t14);
    			append(td0, t15);
    			append(td0, span3);
    			append(tr1, t17);
    			append(tr1, td1);
    			append(td1, span4);
    			append(span4, t18);
    			append(span4, t19);
    			append(span4, t20);
    			append(span4, t21);
    			append(span4, t22);
    			append(span4, t23);
    			append(span4, t24);
    			append(tr1, t25);
    			append(tr1, td2);
    			append(td2, span5);
    			append(span5, t26);
    			append(span5, t27);
    			append(span5, t28);
    			append(span5, t29);
    			append(span5, t30);
    			append(tbody, t31);
    			append(tbody, tr2);
    			append(tr2, td3);
    			append(td3, span8);
    			append(span8, t32);
    			append(span8, span6);
    			append(span6, t33);
    			append(span8, t34);
    			append(span8, span7);
    			append(span7, t35);
    			append(span8, t36);
    			append(td3, t37);
    			append(td3, span9);
    			append(span9, t38);
    			append(td3, t39);
    			append(td3, span10);
    			append(tr2, t41);
    			append(tr2, td4);
    			append(td4, span11);
    			append(span11, t42);
    			append(span11, t43);
    			append(span11, t44);
    			append(span11, t45);
    			append(span11, t46);
    			append(td4, t47);
    			append(td4, span12);
    			append(span12, t48);
    			append(td4, t49);
    			append(td4, span13);
    			append(td4, t51);
    			append(td4, span14);
    			append(span14, t52);
    			append(span14, t53);
    			append(td4, t54);
    			append(td4, span15);
    			append(tr2, t56);
    			append(tr2, td5);
    			append(td5, span16);
    			append(span16, t57);
    			append(span16, t58);
    			append(span16, t59);
    			append(span16, t60);
    			append(span16, t61);
    			append(td5, t62);
    			append(td5, span17);
    			append(span17, t63);
    			append(td5, t64);
    			append(td5, span18);
    			append(td5, t66);
    			append(td5, span19);
    			append(span19, t67);
    			append(span19, t68);
    			append(td5, t69);
    			append(td5, span20);
    			append(tbody, t71);
    			append(tbody, tr3);
    			append(tr3, td6);
    			append(td6, span21);
    			append(td6, t73);
    			append(td6, span22);
    			append(span22, t74);
    			append(td6, t75);
    			append(td6, span23);
    			append(td6, t77);
    			append(td6, span24);
    			append(span24, t78);
    			append(span24, t79);
    			append(span24, t80);
    			append(tr3, t81);
    			append(tr3, td7);
    			append(td7, span25);
    			append(span25, t82);
    			append(span25, t83);
    			append(span25, t84);
    			append(span25, t85);
    			append(span25, t86);
    			append(td7, t87);
    			append(td7, span26);
    			append(span26, t88);
    			append(td7, t89);
    			append(td7, span27);
    			append(td7, t91);
    			append(td7, span28);
    			append(span28, t92);
    			append(span28, t93);
    			append(td7, t94);
    			append(td7, span29);
    			append(tr3, t96);
    			append(tr3, td8);
    			append(td8, span30);
    			append(span30, t97);
    			append(span30, t98);
    			append(span30, t99);
    			append(span30, t100);
    			append(span30, t101);
    			append(td8, t102);
    			append(td8, span31);
    			append(span31, t103);
    			append(span31, t104);
    			append(span31, t105);
    			append(td8, t106);
    			append(td8, span32);
    			append(div3, t108);
    			append(div3, div2);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t9_value !== (t9_value = /*rowsOfScenarios*/ ctx[30][0].H + "")) set_data(t9, t9_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t11_value !== (t11_value = /*rowsOfScenarios*/ ctx[30][0].loc + "")) set_data(t11, t11_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t14_value !== (t14_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].totInf) + "")) set_data(t14, t14_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t19_value !== (t19_value = /*rowsOfScenarios*/ ctx[30][1].H_60 + "")) set_data(t19, t19_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t21_value !== (t21_value = /*rowsOfScenarios*/ ctx[30][1].H_below + "")) set_data(t21, t21_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t23_value !== (t23_value = /*rowsOfScenarios*/ ctx[30][1].H + "")) set_data(t23, t23_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t27_value !== (t27_value = /*rowsOfScenarios*/ ctx[30][2].Elim + "")) set_data(t27, t27_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t29_value !== (t29_value = /*rowsOfScenarios*/ ctx[30][2].U + "")) set_data(t29, t29_value);
    			if ((!current || dirty[1] & /*translations, selectedSourceId*/ 49152) && t33_value !== (t33_value = /*translations*/ ctx[45].fatalityRisks[/*selectedSourceId*/ ctx[46]].source + "")) set_data(t33, t33_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t35_value !== (t35_value = /*rowsOfScenarios*/ ctx[30][0].loc + "")) set_data(t35, t35_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t38_value !== (t38_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].totDeaths) + "")) set_data(t38, t38_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t43_value !== (t43_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].totDeaths) + "")) set_data(t43, t43_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t45_value !== (t45_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][1].totDeaths) + "")) set_data(t45, t45_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t48_value !== (t48_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].totDeaths - /*rowsOfScenarios*/ ctx[30][1].totDeaths) + "")) set_data(t48, t48_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t52_value !== (t52_value = Math.round(-100 * (/*rowsOfScenarios*/ ctx[30][1].totDeaths / /*rowsOfScenarios*/ ctx[30][0].totDeaths - 1)) + "")) set_data(t52, t52_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t58_value !== (t58_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].totDeaths) + "")) set_data(t58, t58_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t60_value !== (t60_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][2].totDeaths) + "")) set_data(t60, t60_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t63_value !== (t63_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].totDeaths - /*rowsOfScenarios*/ ctx[30][2].totDeaths) + "")) set_data(t63, t63_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t67_value !== (t67_value = Math.round(-100 * (/*rowsOfScenarios*/ ctx[30][2].totDeaths / /*rowsOfScenarios*/ ctx[30][0].totDeaths - 1)) + "")) set_data(t67, t67_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t74_value !== (t74_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].yrsLifeLost) + "")) set_data(t74, t74_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t79_value !== (t79_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].yrsLifeLostCosts) + "")) set_data(t79, t79_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t83_value !== (t83_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].yrsLifeLost) + "")) set_data(t83, t83_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t85_value !== (t85_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][1].yrsLifeLost) + "")) set_data(t85, t85_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t88_value !== (t88_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].yrsLifeLost - /*rowsOfScenarios*/ ctx[30][1].yrsLifeLost) + "")) set_data(t88, t88_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t92_value !== (t92_value = Math.round(100 * /*rowsOfScenarios*/ ctx[30][1].yrsLifeLost / /*rowsOfScenarios*/ ctx[30][0].yrsLifeLost) + "")) set_data(t92, t92_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t98_value !== (t98_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].yrsLifeLostCosts) + "")) set_data(t98, t98_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t100_value !== (t100_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][2].yrsLifeLostCosts) + "")) set_data(t100, t100_value);
    			if ((!current || dirty[0] & /*rowsOfScenarios*/ 1073741824) && t104_value !== (t104_value = numberFormatter(/*rowsOfScenarios*/ ctx[30][0].yrsLifeLostCosts - /*rowsOfScenarios*/ ctx[30][2].yrsLifeLostCosts) + "")) set_data(t104, t104_value);
    		},
    		i(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (div4_outro) div4_outro.end(1);
    				if (!div4_intro) div4_intro = create_in_transition(div4, fade, { duration: durationIn });
    				div4_intro.start();
    			});

    			current = true;
    		},
    		o(local) {
    			if (div4_intro) div4_intro.invalidate();
    			div4_outro = create_out_transition(div4, fade, { duration: durationOut });
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div4);
    			if (detaching && div4_outro) div4_outro.end();
    		}
    	};
    }

    // (1341:4) {#if userNeeds.exportData}
    function create_if_block_2$1(ctx) {
    	let button;
    	let t_value = /*translations*/ ctx[45].app.hideExport + "";
    	let t;
    	let dispose;

    	return {
    		c() {
    			button = element("button");
    			t = text(t_value);
    			attr(button, "class", "button-class svelte-1havf7j");
    		},
    		m(target, anchor, remount) {
    			insert(target, button, anchor);
    			append(button, t);
    			if (remount) dispose();
    			dispose = listen(button, "click", /*toggleExportData*/ ctx[61]);
    		},
    		p(ctx, dirty) {
    			if (dirty[1] & /*translations*/ 16384 && t_value !== (t_value = /*translations*/ ctx[45].app.hideExport + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			dispose();
    		}
    	};
    }

    // (1347:4) {#if !userNeeds.exportData}
    function create_if_block_1$2(ctx) {
    	let button;
    	let t_value = /*translations*/ ctx[45].app.export + "";
    	let t;
    	let dispose;

    	return {
    		c() {
    			button = element("button");
    			t = text(t_value);
    			attr(button, "class", "button-class svelte-1havf7j");
    		},
    		m(target, anchor, remount) {
    			insert(target, button, anchor);
    			append(button, t);
    			if (remount) dispose();
    			dispose = listen(button, "click", /*toggleExportData*/ ctx[61]);
    		},
    		p(ctx, dirty) {
    			if (dirty[1] & /*translations*/ 16384 && t_value !== (t_value = /*translations*/ ctx[45].app.export + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			dispose();
    		}
    	};
    }

    // (1358:1) {#if userNeeds.exportData}
    function create_if_block$4(ctx) {
    	let div1;
    	let div0;
    	let textarea;
    	let div1_intro;
    	let div1_outro;
    	let current;
    	let dispose;

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			textarea = element("textarea");
    			attr(textarea, "class", "svelte-1havf7j");
    			attr(div0, "class", "twelve columns");
    			attr(div1, "class", "row svelte-1havf7j");
    		},
    		m(target, anchor, remount) {
    			insert(target, div1, anchor);
    			append(div1, div0);
    			append(div0, textarea);
    			set_input_value(textarea, /*exportedData*/ ctx[55]);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(textarea, "input", /*textarea_input_handler*/ ctx[135]);
    		},
    		p(ctx, dirty) {
    			if (dirty[1] & /*exportedData*/ 16777216) {
    				set_input_value(textarea, /*exportedData*/ ctx[55]);
    			}
    		},
    		i(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (div1_outro) div1_outro.end(1);
    				if (!div1_intro) div1_intro = create_in_transition(div1, fly, { duration: 800 });
    				div1_intro.start();
    			});

    			current = true;
    		},
    		o(local) {
    			if (div1_intro) div1_intro.invalidate();
    			div1_outro = create_out_transition(div1, fly, { duration: 800 });
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			if (detaching && div1_outro) div1_outro.end();
    			dispose();
    		}
    	};
    }

    function create_fragment$a(ctx) {
    	let main;
    	let div4;
    	let div1;
    	let div0;
    	let h3;
    	let t0_value = /*translations*/ ctx[45].app.mainTitle + "";
    	let t0;
    	let t1;
    	let h6;
    	let t2_value = /*translations*/ ctx[45].app.subtitle + "";
    	let t2;
    	let t3;
    	let div3;
    	let div2;
    	let a0;
    	let t5;
    	let a1;
    	let t7;
    	let a2;
    	let t9;
    	let div14;
    	let div7;
    	let div6;
    	let label0;
    	let p0;
    	let t10_value = /*translations*/ ctx[45].app.selectLocation + "";
    	let t10;
    	let t11;
    	let div5;
    	let t12_value = /*translations*/ ctx[45].app.locationDescription + "";
    	let t12;
    	let t13;
    	let span0;
    	let updating_selectedItem;
    	let t14;
    	let div10;
    	let div9;
    	let label1;
    	let p1;
    	let t15_value = /*translations*/ ctx[45].app.infectionRate + "";
    	let t15;
    	let t16;
    	let span1;
    	let t17;
    	let t18;
    	let t19;
    	let div8;
    	let t20_value = /*translations*/ ctx[45].app.infectionRateDescription + "";
    	let t20;
    	let t21;
    	let input0;
    	let t22;
    	let div13;
    	let div12;
    	let label2;
    	let p2;
    	let t23_value = /*translations*/ ctx[45].app.over60InfectionRate + "";
    	let t23;
    	let t24;
    	let span2;
    	let t25;
    	let t26;
    	let t27;
    	let div11;
    	let t28_value = /*translations*/ ctx[45].app.over60Description + "";
    	let t28;
    	let t29;
    	let input1;
    	let t30;
    	let span3;
    	let t31_value = /*translations*/ ctx[45].app.proportionIsThen + "";
    	let t31;
    	let t32;
    	let span4;
    	let t33;
    	let t34;
    	let t35;
    	let span5;
    	let t36_value = /*translations*/ ctx[45].app.proportionIsThenDescription + "";
    	let t36;
    	let t37;
    	let div16;
    	let div15;
    	let updating_activeTabValue;
    	let t38;
    	let t39;
    	let t40;
    	let t41;
    	let t42;
    	let t43;
    	let t44;
    	let t45;
    	let div26;
    	let div19;
    	let div18;
    	let label3;
    	let p3;
    	let t46_value = /*translations*/ ctx[45].app.fatalityRates + "";
    	let t46;
    	let t47;
    	let div17;
    	let t48_value = /*translations*/ ctx[45].app.fatalityRatesDescription + "";
    	let t48;
    	let t49;
    	let span6;
    	let updating_selectedItem_1;
    	let t50;
    	let span7;
    	let t51;
    	let div22;
    	let div21;
    	let label4;
    	let p4;
    	let t52_value = /*translations*/ ctx[45].app.varyFRs + "";
    	let t52;
    	let t53;
    	let span8;
    	let t54;
    	let t55;
    	let t56;
    	let div20;
    	let span9;
    	let t57_value = /*translations*/ ctx[45].app.varyFRsDescription1 + "";
    	let t57;
    	let t58;
    	let span10;
    	let t59_value = /*translations*/ ctx[45].app.varyFRsDescription2 + "";
    	let t59;
    	let t60;
    	let input2;
    	let t61;
    	let div25;
    	let div24;
    	let div23;
    	let button;
    	let t62_value = /*translations*/ ctx[45].app.reset + "";
    	let t62;
    	let t63;
    	let span11;
    	let t64_value = /*translations*/ ctx[45].app.resetDescription + "";
    	let t64;
    	let t65;
    	let div40;
    	let div29;
    	let div28;
    	let label5;
    	let p5;
    	let t66_value = /*translations*/ ctx[45].app.elimination + "";
    	let t66;
    	let t67;
    	let span12;
    	let t68;
    	let t69;
    	let t70;
    	let div27;
    	let span13;
    	let t71_value = /*translations*/ ctx[45].app.eliminationDescription1 + "";
    	let t71;
    	let t72;
    	let span14;
    	let t73_value = Math.round(/*pctH*/ ctx[8]) + "";
    	let t73;
    	let t74;
    	let t75;
    	let span15;
    	let t76_value = /*translations*/ ctx[45].app.eliminationDescription2 + "";
    	let t76;
    	let t77;
    	let input3;
    	let t78;
    	let div32;
    	let div31;
    	let label6;
    	let p6;
    	let t79_value = /*translations*/ ctx[45].app.infectionUntil + "";
    	let t79;
    	let t80;
    	let span16;
    	let t81;
    	let t82;
    	let t83;
    	let div30;
    	let t84_value = /*translations*/ ctx[45].app.infectionUntilDescription + "";
    	let t84;
    	let t85;
    	let input4;
    	let input4_min_value;
    	let t86;
    	let div34;
    	let div33;
    	let t87;
    	let t88;
    	let span17;
    	let t89_value = /*translations*/ ctx[45].app.exportDescription + "";
    	let t89;
    	let t90;
    	let t91;
    	let div39;
    	let current;
    	let dispose;

    	function autocomplete0_selectedItem_binding(value) {
    		/*autocomplete0_selectedItem_binding*/ ctx[123].call(null, value);
    	}

    	let autocomplete0_props = {
    		items: /*translations*/ ctx[45].countries,
    		labelFieldName: "name"
    	};

    	if (/*selectedObject*/ ctx[5] !== void 0) {
    		autocomplete0_props.selectedItem = /*selectedObject*/ ctx[5];
    	}

    	const autocomplete0 = new SimpleAutocomplete({ props: autocomplete0_props });
    	binding_callbacks.push(() => bind(autocomplete0, "selectedItem", autocomplete0_selectedItem_binding));

    	function tabs_activeTabValue_binding(value) {
    		/*tabs_activeTabValue_binding*/ ctx[126].call(null, value);
    	}

    	let tabs_props = { items: /*tabItems*/ ctx[52] };

    	if (/*currentTab*/ ctx[0] !== void 0) {
    		tabs_props.activeTabValue = /*currentTab*/ ctx[0];
    	}

    	const tabs = new Tabs({ props: tabs_props });
    	binding_callbacks.push(() => bind(tabs, "activeTabValue", tabs_activeTabValue_binding));
    	let if_block0 = 0 === /*currentTab*/ ctx[0] && create_if_block_17(ctx);
    	let if_block1 = 1 === /*currentTab*/ ctx[0] && create_if_block_13(ctx);
    	let if_block2 = 2 === /*currentTab*/ ctx[0] && create_if_block_10(ctx);
    	let if_block3 = 3 === /*currentTab*/ ctx[0] && create_if_block_7(ctx);
    	let if_block4 = 4 === /*currentTab*/ ctx[0] && create_if_block_6(ctx);
    	let if_block5 = 5 == /*currentTab*/ ctx[0] && create_if_block_4$1(ctx);
    	let if_block6 = 6 == /*currentTab*/ ctx[0] && create_if_block_3$1(ctx);

    	function autocomplete1_selectedItem_binding(value) {
    		/*autocomplete1_selectedItem_binding*/ ctx[131].call(null, value);
    	}

    	let autocomplete1_props = {
    		items: /*translations*/ ctx[45].fatalityRisks,
    		labelFieldName: "source"
    	};

    	if (/*selectedSourceObject*/ ctx[6] !== void 0) {
    		autocomplete1_props.selectedItem = /*selectedSourceObject*/ ctx[6];
    	}

    	const autocomplete1 = new SimpleAutocomplete({ props: autocomplete1_props });
    	binding_callbacks.push(() => bind(autocomplete1, "selectedItem", autocomplete1_selectedItem_binding));
    	let if_block7 = /*userNeeds*/ ctx[1].exportData && create_if_block_2$1(ctx);
    	let if_block8 = !/*userNeeds*/ ctx[1].exportData && create_if_block_1$2(ctx);
    	let if_block9 = /*userNeeds*/ ctx[1].exportData && create_if_block$4(ctx);

    	return {
    		c() {
    			main = element("main");
    			div4 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			h3 = element("h3");
    			t0 = text(t0_value);
    			t1 = space();
    			h6 = element("h6");
    			t2 = text(t2_value);
    			t3 = space();
    			div3 = element("div");
    			div2 = element("div");
    			a0 = element("a");
    			a0.textContent = "中文";
    			t5 = space();
    			a1 = element("a");
    			a1.textContent = "Español";
    			t7 = space();
    			a2 = element("a");
    			a2.textContent = "English";
    			t9 = space();
    			div14 = element("div");
    			div7 = element("div");
    			div6 = element("div");
    			label0 = element("label");
    			p0 = element("p");
    			t10 = text(t10_value);
    			t11 = space();
    			div5 = element("div");
    			t12 = text(t12_value);
    			t13 = space();
    			span0 = element("span");
    			create_component(autocomplete0.$$.fragment);
    			t14 = space();
    			div10 = element("div");
    			div9 = element("div");
    			label1 = element("label");
    			p1 = element("p");
    			t15 = text(t15_value);
    			t16 = space();
    			span1 = element("span");
    			t17 = text(/*pctH*/ ctx[8]);
    			t18 = text("%");
    			t19 = space();
    			div8 = element("div");
    			t20 = text(t20_value);
    			t21 = space();
    			input0 = element("input");
    			t22 = space();
    			div13 = element("div");
    			div12 = element("div");
    			label2 = element("label");
    			p2 = element("p");
    			t23 = text(t23_value);
    			t24 = space();
    			span2 = element("span");
    			t25 = text(/*pctH_60plus*/ ctx[44]);
    			t26 = text("%");
    			t27 = space();
    			div11 = element("div");
    			t28 = text(t28_value);
    			t29 = space();
    			input1 = element("input");
    			t30 = space();
    			span3 = element("span");
    			t31 = text(t31_value);
    			t32 = space();
    			span4 = element("span");
    			t33 = text(/*pctH_below60*/ ctx[47]);
    			t34 = text("%");
    			t35 = text(".\n\t\t\t\t");
    			span5 = element("span");
    			t36 = text(t36_value);
    			t37 = space();
    			div16 = element("div");
    			div15 = element("div");
    			create_component(tabs.$$.fragment);
    			t38 = space();
    			if (if_block0) if_block0.c();
    			t39 = space();
    			if (if_block1) if_block1.c();
    			t40 = space();
    			if (if_block2) if_block2.c();
    			t41 = space();
    			if (if_block3) if_block3.c();
    			t42 = space();
    			if (if_block4) if_block4.c();
    			t43 = space();
    			if (if_block5) if_block5.c();
    			t44 = space();
    			if (if_block6) if_block6.c();
    			t45 = space();
    			div26 = element("div");
    			div19 = element("div");
    			div18 = element("div");
    			label3 = element("label");
    			p3 = element("p");
    			t46 = text(t46_value);
    			t47 = space();
    			div17 = element("div");
    			t48 = text(t48_value);
    			t49 = space();
    			span6 = element("span");
    			create_component(autocomplete1.$$.fragment);
    			t50 = space();
    			span7 = element("span");
    			t51 = space();
    			div22 = element("div");
    			div21 = element("div");
    			label4 = element("label");
    			p4 = element("p");
    			t52 = text(t52_value);
    			t53 = space();
    			span8 = element("span");
    			t54 = text(/*pctOfChange*/ ctx[7]);
    			t55 = text("%");
    			t56 = space();
    			div20 = element("div");
    			span9 = element("span");
    			t57 = text(t57_value);
    			t58 = space();
    			span10 = element("span");
    			t59 = text(t59_value);
    			t60 = space();
    			input2 = element("input");
    			t61 = space();
    			div25 = element("div");
    			div24 = element("div");
    			div23 = element("div");
    			button = element("button");
    			t62 = text(t62_value);
    			t63 = space();
    			span11 = element("span");
    			t64 = text(t64_value);
    			t65 = space();
    			div40 = element("div");
    			div29 = element("div");
    			div28 = element("div");
    			label5 = element("label");
    			p5 = element("p");
    			t66 = text(t66_value);
    			t67 = space();
    			span12 = element("span");
    			t68 = text(/*prElimTimes100*/ ctx[9]);
    			t69 = text("%");
    			t70 = space();
    			div27 = element("div");
    			span13 = element("span");
    			t71 = text(t71_value);
    			t72 = space();
    			span14 = element("span");
    			t73 = text(t73_value);
    			t74 = text("%");
    			t75 = space();
    			span15 = element("span");
    			t76 = text(t76_value);
    			t77 = space();
    			input3 = element("input");
    			t78 = space();
    			div32 = element("div");
    			div31 = element("div");
    			label6 = element("label");
    			p6 = element("p");
    			t79 = text(t79_value);
    			t80 = space();
    			span16 = element("span");
    			t81 = text(/*pctU*/ ctx[10]);
    			t82 = text("%");
    			t83 = space();
    			div30 = element("div");
    			t84 = text(t84_value);
    			t85 = space();
    			input4 = element("input");
    			t86 = space();
    			div34 = element("div");
    			div33 = element("div");
    			if (if_block7) if_block7.c();
    			t87 = space();
    			if (if_block8) if_block8.c();
    			t88 = space();
    			span17 = element("span");
    			t89 = text(t89_value);
    			t90 = space();
    			if (if_block9) if_block9.c();
    			t91 = space();
    			div39 = element("div");

    			div39.innerHTML = `<div class="twelve columns"><div class="child parameter-text svelte-1havf7j"><div class="wtitle svelte-1havf7j">About</div> 
					<p>
						At the time of writing, the impacts of COVID-2019 
						remain largely uncertain and depend on a whole range of possibilities.

						Organizing the overwhelming mass of the available information in the media and literature, 
						coming up with a reasonable working estimates and comparing multiple scenarios can be challenging.

						As an attempt to address this problem I used publicly available data and published information 
						to create this international tool that allows users to derive their own country-specific estimates.
					</p> 
					<p>
						Please send me feedback:
						<a href="https://twitter.com/MarkoLalovic/status/1266022718035632128">here</a>.
						
						or email me:
						<a href="mailto:marko.lalovic@yahoo.com?Subject=COVID%20analyzer" target="_top">here</a>.
					</p> 
					<p>
						For technical details please refer to:
						<a href="notes.html">notes</a>
						
						or the:
						<a href="https://github.com/markolalovic/covid-calc">source code</a>.
					</p> 

					<div class="wtitle svelte-1havf7j">Acknowledgements</div> 
					<p>
						Tjaša Kovačević for help with the calculation of expected years of life lost and economic impacts on poverty.
					</p></div></div>`;

    			attr(h3, "class", "title svelte-1havf7j");
    			attr(h6, "class", "parameter-text svelte-1havf7j");
    			attr(div0, "class", "child svelte-1havf7j");
    			attr(div1, "class", "eight columns title svelte-1havf7j");
    			attr(a0, "href", "#zh");
    			attr(a0, "class", "lang-link svelte-1havf7j");
    			attr(a1, "href", "#es");
    			attr(a1, "class", "lang-link svelte-1havf7j");
    			attr(a2, "href", "#en");
    			attr(a2, "class", "lang-link svelte-1havf7j");
    			attr(div2, "class", "child svelte-1havf7j");
    			attr(div3, "class", "four columns title svelte-1havf7j");
    			attr(div4, "class", "row svelte-1havf7j");
    			attr(p0, "class", "parameter-title svelte-1havf7j");
    			set_style(p0, "text-align", "left");
    			attr(div5, "class", "parameter-text svelte-1havf7j");
    			attr(span0, "class", "parameter-text svelte-1havf7j");
    			attr(div6, "class", "child parameter-space-4 svelte-1havf7j");
    			attr(div7, "class", "four columns");
    			attr(span1, "class", "parameter svelte-1havf7j");
    			set_style(span1, "float", "right");
    			attr(p1, "class", "parameter-title svelte-1havf7j");
    			set_style(p1, "text-align", "left");
    			attr(div8, "class", "parameter-text svelte-1havf7j");
    			attr(input0, "class", "pointer u-full-width svelte-1havf7j");
    			attr(input0, "type", "range");
    			attr(input0, "min", "1");
    			attr(input0, "max", "99");
    			attr(div9, "class", "child parameter-space-4 svelte-1havf7j");
    			attr(div10, "class", "four columns");
    			attr(span2, "class", "parameter svelte-1havf7j");
    			set_style(span2, "float", "right");
    			attr(p2, "class", "parameter-title svelte-1havf7j");
    			set_style(p2, "text-align", "left");
    			attr(div11, "class", "parameter-text svelte-1havf7j");
    			attr(input1, "class", "pointer u-full-width svelte-1havf7j");
    			attr(input1, "type", "range");
    			attr(input1, "min", /*lowerBound*/ ctx[53]);
    			attr(input1, "max", /*upperBound*/ ctx[54]);
    			attr(span3, "class", "parameter-text svelte-1havf7j");
    			attr(span4, "class", "parameter svelte-1havf7j");
    			attr(span5, "class", "parameter-text svelte-1havf7j");
    			attr(div12, "class", "child parameter-space-4 svelte-1havf7j");
    			attr(div13, "class", "four columns");
    			attr(div14, "class", "row svelte-1havf7j");
    			attr(div15, "class", "twelve columns");
    			attr(div16, "class", "row svelte-1havf7j");
    			attr(p3, "class", "parameter-title svelte-1havf7j");
    			set_style(p3, "text-align", "left");
    			attr(div17, "class", "parameter-text svelte-1havf7j");
    			attr(span6, "class", "parameter-text svelte-1havf7j");
    			attr(span7, "class", "parameter-text svelte-1havf7j");
    			attr(div18, "class", "child parameter-space-4 svelte-1havf7j");
    			attr(div19, "class", "four columns");
    			attr(span8, "class", "parameter svelte-1havf7j");
    			set_style(span8, "float", "right");
    			attr(p4, "class", "parameter-title svelte-1havf7j");
    			set_style(p4, "text-align", "left");
    			attr(span9, "class", "parameter-text svelte-1havf7j");
    			attr(span10, "class", "parameter-text svelte-1havf7j");
    			attr(div20, "class", "parameter-text svelte-1havf7j");
    			attr(input2, "class", "u-full-width");
    			attr(input2, "type", "range");
    			attr(input2, "min", "-100");
    			attr(input2, "max", "100");
    			attr(div21, "class", "child parameter-space-4 svelte-1havf7j");
    			attr(div22, "class", "four columns");
    			attr(button, "class", "button svelte-1havf7j");
    			attr(div23, "class", "button-class");
    			attr(span11, "class", "parameter-text svelte-1havf7j");
    			attr(div24, "class", "child parameter-space-4 svelte-1havf7j");
    			attr(div25, "class", "four columns");
    			attr(div26, "class", "row svelte-1havf7j");
    			attr(span12, "class", "parameter svelte-1havf7j");
    			set_style(span12, "float", "right");
    			attr(p5, "class", "parameter-title svelte-1havf7j");
    			set_style(p5, "text-align", "left");
    			attr(span13, "class", "parameter-text svelte-1havf7j");
    			attr(span14, "class", "parameter svelte-1havf7j");
    			attr(span15, "class", "parameter-text svelte-1havf7j");
    			attr(div27, "class", "parameter-text svelte-1havf7j");
    			attr(input3, "class", "pointer u-full-width svelte-1havf7j");
    			attr(input3, "type", "range");
    			attr(input3, "min", "0");
    			attr(input3, "max", "100");
    			attr(div28, "class", "child parameter-space-4 svelte-1havf7j");
    			attr(div29, "class", "four columns");
    			attr(span16, "class", "parameter svelte-1havf7j");
    			set_style(span16, "float", "right");
    			attr(p6, "class", "parameter-title svelte-1havf7j");
    			set_style(p6, "text-align", "left");
    			attr(div30, "class", "parameter-text svelte-1havf7j");
    			attr(input4, "class", "pointer u-full-width svelte-1havf7j");
    			attr(input4, "type", "range");
    			attr(input4, "min", input4_min_value = 0);
    			attr(input4, "max", /*pctH*/ ctx[8]);
    			attr(div31, "class", "child parameter-space-4 svelte-1havf7j");
    			attr(div32, "class", "four columns");
    			attr(span17, "class", "parameter-text svelte-1havf7j");
    			attr(div33, "class", "child parameter-space-4 svelte-1havf7j");
    			attr(div34, "class", "four columns");
    			attr(div39, "class", "row svelte-1havf7j");
    			attr(div40, "class", "row svelte-1havf7j");
    			attr(main, "class", "container");
    		},
    		m(target, anchor, remount) {
    			insert(target, main, anchor);
    			append(main, div4);
    			append(div4, div1);
    			append(div1, div0);
    			append(div0, h3);
    			append(h3, t0);
    			append(div0, t1);
    			append(div0, h6);
    			append(h6, t2);
    			append(div4, t3);
    			append(div4, div3);
    			append(div3, div2);
    			append(div2, a0);
    			append(div2, t5);
    			append(div2, a1);
    			append(div2, t7);
    			append(div2, a2);
    			append(main, t9);
    			append(main, div14);
    			append(div14, div7);
    			append(div7, div6);
    			append(div6, label0);
    			append(label0, p0);
    			append(p0, t10);
    			append(label0, t11);
    			append(label0, div5);
    			append(div5, t12);
    			append(div6, t13);
    			append(div6, span0);
    			mount_component(autocomplete0, span0, null);
    			append(div14, t14);
    			append(div14, div10);
    			append(div10, div9);
    			append(div9, label1);
    			append(label1, p1);
    			append(p1, t15);
    			append(p1, t16);
    			append(p1, span1);
    			append(span1, t17);
    			append(span1, t18);
    			append(label1, t19);
    			append(label1, div8);
    			append(div8, t20);
    			append(div9, t21);
    			append(div9, input0);
    			set_input_value(input0, /*pctH*/ ctx[8]);
    			append(div14, t22);
    			append(div14, div13);
    			append(div13, div12);
    			append(div12, label2);
    			append(label2, p2);
    			append(p2, t23);
    			append(p2, t24);
    			append(p2, span2);
    			append(span2, t25);
    			append(span2, t26);
    			append(label2, t27);
    			append(label2, div11);
    			append(div11, t28);
    			append(div12, t29);
    			append(div12, input1);
    			set_input_value(input1, /*pctH_60plus*/ ctx[44]);
    			append(div12, t30);
    			append(div12, span3);
    			append(span3, t31);
    			append(div12, t32);
    			append(div12, span4);
    			append(span4, t33);
    			append(span4, t34);
    			append(div12, t35);
    			append(div12, span5);
    			append(span5, t36);
    			append(main, t37);
    			append(main, div16);
    			append(div16, div15);
    			mount_component(tabs, div15, null);
    			append(div15, t38);
    			if (if_block0) if_block0.m(div15, null);
    			append(div15, t39);
    			if (if_block1) if_block1.m(div15, null);
    			append(div15, t40);
    			if (if_block2) if_block2.m(div15, null);
    			append(div15, t41);
    			if (if_block3) if_block3.m(div15, null);
    			append(div15, t42);
    			if (if_block4) if_block4.m(div15, null);
    			append(div15, t43);
    			if (if_block5) if_block5.m(div15, null);
    			append(div15, t44);
    			if (if_block6) if_block6.m(div15, null);
    			append(main, t45);
    			append(main, div26);
    			append(div26, div19);
    			append(div19, div18);
    			append(div18, label3);
    			append(label3, p3);
    			append(p3, t46);
    			append(label3, t47);
    			append(label3, div17);
    			append(div17, t48);
    			append(div18, t49);
    			append(div18, span6);
    			mount_component(autocomplete1, span6, null);
    			append(div18, t50);
    			append(div18, span7);
    			append(div26, t51);
    			append(div26, div22);
    			append(div22, div21);
    			append(div21, label4);
    			append(label4, p4);
    			append(p4, t52);
    			append(p4, t53);
    			append(p4, span8);
    			append(span8, t54);
    			append(span8, t55);
    			append(label4, t56);
    			append(label4, div20);
    			append(div20, span9);
    			append(span9, t57);
    			append(div20, t58);
    			append(div20, span10);
    			append(span10, t59);
    			append(div21, t60);
    			append(div21, input2);
    			set_input_value(input2, /*pctOfChange*/ ctx[7]);
    			append(div26, t61);
    			append(div26, div25);
    			append(div25, div24);
    			append(div24, div23);
    			append(div23, button);
    			append(button, t62);
    			append(div24, t63);
    			append(div24, span11);
    			append(span11, t64);
    			append(main, t65);
    			append(main, div40);
    			append(div40, div29);
    			append(div29, div28);
    			append(div28, label5);
    			append(label5, p5);
    			append(p5, t66);
    			append(p5, t67);
    			append(p5, span12);
    			append(span12, t68);
    			append(span12, t69);
    			append(label5, t70);
    			append(label5, div27);
    			append(div27, span13);
    			append(span13, t71);
    			append(div27, t72);
    			append(div27, span14);
    			append(span14, t73);
    			append(span14, t74);
    			append(div27, t75);
    			append(div27, span15);
    			append(span15, t76);
    			append(div28, t77);
    			append(div28, input3);
    			set_input_value(input3, /*prElimTimes100*/ ctx[9]);
    			append(div40, t78);
    			append(div40, div32);
    			append(div32, div31);
    			append(div31, label6);
    			append(label6, p6);
    			append(p6, t79);
    			append(p6, t80);
    			append(p6, span16);
    			append(span16, t81);
    			append(span16, t82);
    			append(label6, t83);
    			append(label6, div30);
    			append(div30, t84);
    			append(div31, t85);
    			append(div31, input4);
    			set_input_value(input4, /*pctU*/ ctx[10]);
    			append(div40, t86);
    			append(div40, div34);
    			append(div34, div33);
    			if (if_block7) if_block7.m(div33, null);
    			append(div33, t87);
    			if (if_block8) if_block8.m(div33, null);
    			append(div33, t88);
    			append(div33, span17);
    			append(span17, t89);
    			append(div40, t90);
    			if (if_block9) if_block9.m(div40, null);
    			append(div40, t91);
    			append(div40, div39);
    			current = true;
    			if (remount) run_all(dispose);

    			dispose = [
    				listen(a0, "click", /*click_handler*/ ctx[120]),
    				listen(a1, "click", /*click_handler_1*/ ctx[121]),
    				listen(a2, "click", /*click_handler_2*/ ctx[122]),
    				listen(input0, "change", /*input0_change_input_handler*/ ctx[124]),
    				listen(input0, "input", /*input0_change_input_handler*/ ctx[124]),
    				listen(input0, "click", /*keepUpWithH*/ ctx[57]),
    				listen(input1, "change", /*input1_change_input_handler*/ ctx[125]),
    				listen(input1, "input", /*input1_change_input_handler*/ ctx[125]),
    				listen(input2, "change", /*input2_change_input_handler*/ ctx[132]),
    				listen(input2, "input", /*input2_change_input_handler*/ ctx[132]),
    				listen(button, "click", /*resetParameters*/ ctx[56]),
    				listen(input3, "change", /*input3_change_input_handler*/ ctx[133]),
    				listen(input3, "input", /*input3_change_input_handler*/ ctx[133]),
    				listen(input4, "change", /*input4_change_input_handler*/ ctx[134]),
    				listen(input4, "input", /*input4_change_input_handler*/ ctx[134])
    			];
    		},
    		p(ctx, dirty) {
    			if ((!current || dirty[1] & /*translations*/ 16384) && t0_value !== (t0_value = /*translations*/ ctx[45].app.mainTitle + "")) set_data(t0, t0_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t2_value !== (t2_value = /*translations*/ ctx[45].app.subtitle + "")) set_data(t2, t2_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t10_value !== (t10_value = /*translations*/ ctx[45].app.selectLocation + "")) set_data(t10, t10_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t12_value !== (t12_value = /*translations*/ ctx[45].app.locationDescription + "")) set_data(t12, t12_value);
    			const autocomplete0_changes = {};
    			if (dirty[1] & /*translations*/ 16384) autocomplete0_changes.items = /*translations*/ ctx[45].countries;

    			if (!updating_selectedItem && dirty[0] & /*selectedObject*/ 32) {
    				updating_selectedItem = true;
    				autocomplete0_changes.selectedItem = /*selectedObject*/ ctx[5];
    				add_flush_callback(() => updating_selectedItem = false);
    			}

    			autocomplete0.$set(autocomplete0_changes);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t15_value !== (t15_value = /*translations*/ ctx[45].app.infectionRate + "")) set_data(t15, t15_value);
    			if (!current || dirty[0] & /*pctH*/ 256) set_data(t17, /*pctH*/ ctx[8]);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t20_value !== (t20_value = /*translations*/ ctx[45].app.infectionRateDescription + "")) set_data(t20, t20_value);

    			if (dirty[0] & /*pctH*/ 256) {
    				set_input_value(input0, /*pctH*/ ctx[8]);
    			}

    			if ((!current || dirty[1] & /*translations*/ 16384) && t23_value !== (t23_value = /*translations*/ ctx[45].app.over60InfectionRate + "")) set_data(t23, t23_value);
    			if (!current || dirty[1] & /*pctH_60plus*/ 8192) set_data(t25, /*pctH_60plus*/ ctx[44]);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t28_value !== (t28_value = /*translations*/ ctx[45].app.over60Description + "")) set_data(t28, t28_value);

    			if (!current || dirty[1] & /*lowerBound*/ 4194304) {
    				attr(input1, "min", /*lowerBound*/ ctx[53]);
    			}

    			if (!current || dirty[1] & /*upperBound*/ 8388608) {
    				attr(input1, "max", /*upperBound*/ ctx[54]);
    			}

    			if (dirty[1] & /*pctH_60plus*/ 8192) {
    				set_input_value(input1, /*pctH_60plus*/ ctx[44]);
    			}

    			if ((!current || dirty[1] & /*translations*/ 16384) && t31_value !== (t31_value = /*translations*/ ctx[45].app.proportionIsThen + "")) set_data(t31, t31_value);
    			if (!current || dirty[1] & /*pctH_below60*/ 65536) set_data(t33, /*pctH_below60*/ ctx[47]);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t36_value !== (t36_value = /*translations*/ ctx[45].app.proportionIsThenDescription + "")) set_data(t36, t36_value);
    			const tabs_changes = {};
    			if (dirty[1] & /*tabItems*/ 2097152) tabs_changes.items = /*tabItems*/ ctx[52];

    			if (!updating_activeTabValue && dirty[0] & /*currentTab*/ 1) {
    				updating_activeTabValue = true;
    				tabs_changes.activeTabValue = /*currentTab*/ ctx[0];
    				add_flush_callback(() => updating_activeTabValue = false);
    			}

    			tabs.$set(tabs_changes);

    			if (0 === /*currentTab*/ ctx[0]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[0] & /*currentTab*/ 1) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_17(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(div15, t39);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (1 === /*currentTab*/ ctx[0]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*currentTab*/ 1) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_13(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div15, t40);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (2 === /*currentTab*/ ctx[0]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[0] & /*currentTab*/ 1) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_10(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(div15, t41);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			if (3 === /*currentTab*/ ctx[0]) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);

    					if (dirty[0] & /*currentTab*/ 1) {
    						transition_in(if_block3, 1);
    					}
    				} else {
    					if_block3 = create_if_block_7(ctx);
    					if_block3.c();
    					transition_in(if_block3, 1);
    					if_block3.m(div15, t42);
    				}
    			} else if (if_block3) {
    				group_outros();

    				transition_out(if_block3, 1, 1, () => {
    					if_block3 = null;
    				});

    				check_outros();
    			}

    			if (4 === /*currentTab*/ ctx[0]) {
    				if (if_block4) {
    					if_block4.p(ctx, dirty);

    					if (dirty[0] & /*currentTab*/ 1) {
    						transition_in(if_block4, 1);
    					}
    				} else {
    					if_block4 = create_if_block_6(ctx);
    					if_block4.c();
    					transition_in(if_block4, 1);
    					if_block4.m(div15, t43);
    				}
    			} else if (if_block4) {
    				group_outros();

    				transition_out(if_block4, 1, 1, () => {
    					if_block4 = null;
    				});

    				check_outros();
    			}

    			if (5 == /*currentTab*/ ctx[0]) {
    				if (if_block5) {
    					if_block5.p(ctx, dirty);

    					if (dirty[0] & /*currentTab*/ 1) {
    						transition_in(if_block5, 1);
    					}
    				} else {
    					if_block5 = create_if_block_4$1(ctx);
    					if_block5.c();
    					transition_in(if_block5, 1);
    					if_block5.m(div15, t44);
    				}
    			} else if (if_block5) {
    				group_outros();

    				transition_out(if_block5, 1, 1, () => {
    					if_block5 = null;
    				});

    				check_outros();
    			}

    			if (6 == /*currentTab*/ ctx[0]) {
    				if (if_block6) {
    					if_block6.p(ctx, dirty);

    					if (dirty[0] & /*currentTab*/ 1) {
    						transition_in(if_block6, 1);
    					}
    				} else {
    					if_block6 = create_if_block_3$1(ctx);
    					if_block6.c();
    					transition_in(if_block6, 1);
    					if_block6.m(div15, null);
    				}
    			} else if (if_block6) {
    				group_outros();

    				transition_out(if_block6, 1, 1, () => {
    					if_block6 = null;
    				});

    				check_outros();
    			}

    			if ((!current || dirty[1] & /*translations*/ 16384) && t46_value !== (t46_value = /*translations*/ ctx[45].app.fatalityRates + "")) set_data(t46, t46_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t48_value !== (t48_value = /*translations*/ ctx[45].app.fatalityRatesDescription + "")) set_data(t48, t48_value);
    			const autocomplete1_changes = {};
    			if (dirty[1] & /*translations*/ 16384) autocomplete1_changes.items = /*translations*/ ctx[45].fatalityRisks;

    			if (!updating_selectedItem_1 && dirty[0] & /*selectedSourceObject*/ 64) {
    				updating_selectedItem_1 = true;
    				autocomplete1_changes.selectedItem = /*selectedSourceObject*/ ctx[6];
    				add_flush_callback(() => updating_selectedItem_1 = false);
    			}

    			autocomplete1.$set(autocomplete1_changes);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t52_value !== (t52_value = /*translations*/ ctx[45].app.varyFRs + "")) set_data(t52, t52_value);
    			if (!current || dirty[0] & /*pctOfChange*/ 128) set_data(t54, /*pctOfChange*/ ctx[7]);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t57_value !== (t57_value = /*translations*/ ctx[45].app.varyFRsDescription1 + "")) set_data(t57, t57_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t59_value !== (t59_value = /*translations*/ ctx[45].app.varyFRsDescription2 + "")) set_data(t59, t59_value);

    			if (dirty[0] & /*pctOfChange*/ 128) {
    				set_input_value(input2, /*pctOfChange*/ ctx[7]);
    			}

    			if ((!current || dirty[1] & /*translations*/ 16384) && t62_value !== (t62_value = /*translations*/ ctx[45].app.reset + "")) set_data(t62, t62_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t64_value !== (t64_value = /*translations*/ ctx[45].app.resetDescription + "")) set_data(t64, t64_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t66_value !== (t66_value = /*translations*/ ctx[45].app.elimination + "")) set_data(t66, t66_value);
    			if (!current || dirty[0] & /*prElimTimes100*/ 512) set_data(t68, /*prElimTimes100*/ ctx[9]);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t71_value !== (t71_value = /*translations*/ ctx[45].app.eliminationDescription1 + "")) set_data(t71, t71_value);
    			if ((!current || dirty[0] & /*pctH*/ 256) && t73_value !== (t73_value = Math.round(/*pctH*/ ctx[8]) + "")) set_data(t73, t73_value);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t76_value !== (t76_value = /*translations*/ ctx[45].app.eliminationDescription2 + "")) set_data(t76, t76_value);

    			if (dirty[0] & /*prElimTimes100*/ 512) {
    				set_input_value(input3, /*prElimTimes100*/ ctx[9]);
    			}

    			if ((!current || dirty[1] & /*translations*/ 16384) && t79_value !== (t79_value = /*translations*/ ctx[45].app.infectionUntil + "")) set_data(t79, t79_value);
    			if (!current || dirty[0] & /*pctU*/ 1024) set_data(t81, /*pctU*/ ctx[10]);
    			if ((!current || dirty[1] & /*translations*/ 16384) && t84_value !== (t84_value = /*translations*/ ctx[45].app.infectionUntilDescription + "")) set_data(t84, t84_value);

    			if (!current || dirty[0] & /*pctH*/ 256) {
    				attr(input4, "max", /*pctH*/ ctx[8]);
    			}

    			if (dirty[0] & /*pctU*/ 1024) {
    				set_input_value(input4, /*pctU*/ ctx[10]);
    			}

    			if (/*userNeeds*/ ctx[1].exportData) {
    				if (if_block7) {
    					if_block7.p(ctx, dirty);
    				} else {
    					if_block7 = create_if_block_2$1(ctx);
    					if_block7.c();
    					if_block7.m(div33, t87);
    				}
    			} else if (if_block7) {
    				if_block7.d(1);
    				if_block7 = null;
    			}

    			if (!/*userNeeds*/ ctx[1].exportData) {
    				if (if_block8) {
    					if_block8.p(ctx, dirty);
    				} else {
    					if_block8 = create_if_block_1$2(ctx);
    					if_block8.c();
    					if_block8.m(div33, t88);
    				}
    			} else if (if_block8) {
    				if_block8.d(1);
    				if_block8 = null;
    			}

    			if ((!current || dirty[1] & /*translations*/ 16384) && t89_value !== (t89_value = /*translations*/ ctx[45].app.exportDescription + "")) set_data(t89, t89_value);

    			if (/*userNeeds*/ ctx[1].exportData) {
    				if (if_block9) {
    					if_block9.p(ctx, dirty);

    					if (dirty[0] & /*userNeeds*/ 2) {
    						transition_in(if_block9, 1);
    					}
    				} else {
    					if_block9 = create_if_block$4(ctx);
    					if_block9.c();
    					transition_in(if_block9, 1);
    					if_block9.m(div40, t91);
    				}
    			} else if (if_block9) {
    				group_outros();

    				transition_out(if_block9, 1, 1, () => {
    					if_block9 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(autocomplete0.$$.fragment, local);
    			transition_in(tabs.$$.fragment, local);
    			transition_in(if_block0);
    			transition_in(if_block1);
    			transition_in(if_block2);
    			transition_in(if_block3);
    			transition_in(if_block4);
    			transition_in(if_block5);
    			transition_in(if_block6);
    			transition_in(autocomplete1.$$.fragment, local);
    			transition_in(if_block9);
    			current = true;
    		},
    		o(local) {
    			transition_out(autocomplete0.$$.fragment, local);
    			transition_out(tabs.$$.fragment, local);
    			transition_out(if_block0);
    			transition_out(if_block1);
    			transition_out(if_block2);
    			transition_out(if_block3);
    			transition_out(if_block4);
    			transition_out(if_block5);
    			transition_out(if_block6);
    			transition_out(autocomplete1.$$.fragment, local);
    			transition_out(if_block9);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(main);
    			destroy_component(autocomplete0);
    			destroy_component(tabs);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			if (if_block3) if_block3.d();
    			if (if_block4) if_block4.d();
    			if (if_block5) if_block5.d();
    			if (if_block6) if_block6.d();
    			destroy_component(autocomplete1);
    			if (if_block7) if_block7.d();
    			if (if_block8) if_block8.d();
    			if (if_block9) if_block9.d();
    			run_all(dispose);
    		}
    	};
    }

    const durationIn = 10; // transition to load components
    const durationOut = 20; // transition to remove elements

    // for formatting big numbers for totals
    function numberWithCommas$1(x) {
    	return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    function numberISO(x) {
    	return d3.format(".3s")(x).replace("G", "B");
    }

    function numberFormatter(x) {
    	if (x < Math.pow(10, 6)) {
    		return numberWithCommas$1(x);
    	} else {
    		return numberISO(x);
    	}
    }

    function instance$a($$self, $$props, $$invalidate) {
    	let $englishDictStore;
    	let $chineseDictStore;
    	let $spanishDictStore;
    	component_subscribe($$self, englishDictStore, $$value => $$invalidate(88, $englishDictStore = $$value));
    	component_subscribe($$self, chineseDictStore, $$value => $$invalidate(89, $chineseDictStore = $$value));
    	component_subscribe($$self, spanishDictStore, $$value => $$invalidate(90, $spanishDictStore = $$value));

    	function resetParameters() {
    		$$invalidate(8, pctH = 30); // proportion of infected case Pr(elimination) = 0
    		$$invalidate(44, pctH_60plus = 30); // proportion of people over 60 infected
    		$$invalidate(7, pctOfChange = 0); // proportion of increase or decrease fatality risks
    		$$invalidate(9, prElimTimes100 = 0); // probability of elimination case Pr(elimination) = 1
    		$$invalidate(10, pctU = 0); // proportion of infected until elimination
    	}

    	function keepUpWithH() {
    		$$invalidate(44, pctH_60plus = pctH); // so that H_below60 doesn't explode

    		if (pctH < pctU) {
    			$$invalidate(10, pctU = pctH);
    		}
    	}

    	function changeLanguageTo(newLanguage) {
    		$$invalidate(4, language = newLanguage);

    		// change default location translation
    		$$invalidate(5, selectedObject = {
    			id: 163,
    			name: translationMap[newLanguage].countries[163].name
    		}); // translations.countries[selectedId].name;

    		// change default source object translation
    		$$invalidate(6, selectedSourceObject = {
    			id: 0,
    			source: translationMap[newLanguage].fatalityRisks[0].source,
    			ftr: [0.002, 0.006, 0.03, 0.08, 0.15, 0.6, 2.2, 5.1, 9.3]
    		});

    		// change enter description
    		$$invalidate(3, desc = translationMap[newLanguage].app.enterDescribtion);
    	}

    	function addScenario() {
    		const newScenario = {
    			id: rowsOfScenarios.length,
    			loc: selectedLocation,
    			frs: translations.fatalityRisks[selectedSourceId].source,
    			H: pctH,
    			H_60: pctH_60plus,
    			H_below: pctH_below60,
    			F: pctOfChange,
    			Elim: prElimTimes100,
    			U: pctU,
    			totInf: totalInfected,
    			totDeaths: totalDeaths,
    			yrsLifeLost: totalYearsLost,
    			yrsLifeLostCosts: totalMoneyLost,
    			comments: "Scenario " + rowsOfScenarios.length.toString() + ": " + desc
    		};

    		$$invalidate(30, rowsOfScenarios = rowsOfScenarios.concat(newScenario));
    	}

    	let deleteScenario = id => {
    		$$invalidate(30, rowsOfScenarios = rowsOfScenarios.filter(scn => scn.id !== id));
    	};

    	let currentTab = 0; // current active tab

    	// export button
    	let userNeeds = { exportData: false };

    	function toggleExportData() {
    		$$invalidate(1, userNeeds.exportData = !userNeeds.exportData, userNeeds);
    		scrollToBottom();
    	}

    	/***
     * INITS, REACTIVE DECLARATIONS $:
     *
     */
    	let selectedLocation = "";

    	let desc = "Enter description"; // enter scenario description

    	// subscribe to dictionaries in stores.js
    	let english = $englishDictStore;

    	let chinese = $chineseDictStore;
    	let spanish = $spanishDictStore;

    	let translationMap = {
    		"en": english,
    		"zh": chinese,
    		"es": spanish
    	};

    	let language = "en";
    	let defaultLocation = { id: 163, name: "World" }; // world is default location 
    	let selectedObject = defaultLocation;

    	let defaultSourceObject = {
    		id: 0,
    		source: "Imperial College - IFR",
    		ftr: [0.002, 0.006, 0.03, 0.08, 0.15, 0.6, 2.2, 5.1, 9.3]
    	};

    	let selectedSourceObject = defaultSourceObject;
    	let ageGroups = ["0-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80+"];
    	let lifeExpectanciesGlobal = [71.625, 62.95, 53.55, 44.4, 35.375, 26.625, 18.6, 11.95, 6.975];
    	let pctOfChange = 0; // variation of fatality rates
    	let pctH = 30; // proportion of population infected

    	// same story for the case of elimination
    	let prElimTimes100 = 0; // probability of elimination

    	let pctU = 0; // proportion of population infected until

    	// expected number of infected
    	// E(#of infected) = Pr(Elim) * demo * pctU + [1 - Pr(Elim)] * demo * pctH
    	let infected = [0, 0, 0, 0, 0, 0, 0, 0, 0];

    	let i = 0; // for reactive loop when using $: we need to declare it before the loop

    	// expected number of deaths
    	// E(#of deaths) = infected * fatality_risks
    	let deaths = [0, 0, 0, 0, 0, 0, 0, 0, 0];

    	// expected years of life lost
    	let yearsLost = [0, 0, 0, 0, 0, 0, 0, 0, 0];

    	let compareItems = [{}, {}, {}];
    	let currentCompare = 0; // current active comparison item

    	// let COVID estimate be 'parameter' color and COVID until be 'until' color
    	let compareTypes = [];

    	let compareCauses = [];
    	let compareDiseases = [];
    	let compareRisks = [];
    	let compareList = [];

    	// compare titles
    	let titleListName = "";

    	let titleListNumber = "";
    	let titleListMain = "";

    	// ageGroups has numbers the same in all languages
    	let ageTypes = [];

    	let infectedData = [];
    	let deathsData = [];
    	let infectedTitle = "";
    	let deathsTitle = "";
    	let infectedTitleListName = "";
    	let infectedTitleListNumber = "";
    	let deathsTitleListName = "";
    	let deathsTitleListNumber = "";

    	// projections component 
    	let projectionsTitle = "";

    	let projectionsXAxisLabel = "";
    	let projectionsYAxisLabel = "";
    	let projectionsLegendDeaths = "";
    	let projectionsLegendDeathsProjected = "";

    	/***
     * SCENARIOS
     *
    */
    	// prepare example scenarios as a list of parameters, comments, id's ..
    	// make a reactive for loop to define $: rowsOfScenarios! the same as infected, deaths, ...
    	let inputs = [{}, {}, {}];

    	// initialize all the variables the reactive loop:
    	let pctH_below60Example = 0;

    	let pctU_below60Example = 0;
    	let pctU_60plusExample = 0;
    	let prElimExample = 0;
    	let fatalitiesExample = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    	let infectedExample = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    	let deathsExample = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    	let yearsLostExample = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    	let totalInfectedExample = 0;
    	let totalDeathsExample = 0;
    	let totalYearsLostExample = 0;
    	let totalMoneyLostExample = 0;
    	let j = 0;
    	let rowsOfScenarios = [{}, {}, {}];

    	// world map
    	let mapTitle = "";

    	let mapItems = [{}, {}];
    	let selectedRisk = 0;

    	// poverty
    	let povertyItems = [{}, {}];

    	let currentPoverty = 0;

    	let povertyProjCountryNumbers = [
    		8784000,
    		5023850,
    		2842320,
    		1604720,
    		1221500,
    		1139840,
    		976040,
    		927000,
    		915720,
    		897520,
    		821600,
    		721050
    	];

    	let povertyProjCountries = [];
    	let povertyProjRegionNumbers = [21994380, 10619000, 2294580, 1796560, 867540, 665690, 313600];
    	let povertyProjRegions = [];

    	// Projected Poverty Increases by Country and Region
    	let mainProjCountries = "";

    	let nameProjCountries = "";
    	let numberProjCountries = "";
    	let mainProjRegions = "";
    	let nameProjRegions = "";
    	let numberProjRegions = "";

    	// color countries by regions
    	// 'Sub-Saharan Africa', 'South Asia', 'East Asia & Pacific',
    	// 'Latin America & Caribbean', 'Middle East & North Africa', 'Europe & Central Asia', 'North America'
    	let colorsProjRegions = ["#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00", "#ffff33", "#a65628"];

    	let colorsProjCountries = [
    		colorsProjRegions[1],
    		colorsProjRegions[0],
    		colorsProjRegions[0],
    		colorsProjRegions[0],
    		colorsProjRegions[1],
    		colorsProjRegions[0],
    		colorsProjRegions[0],
    		colorsProjRegions[2],
    		colorsProjRegions[0],
    		colorsProjRegions[0],
    		colorsProjRegions[0],
    		colorsProjRegions[0]
    	];

    	const click_handler = () => changeLanguageTo("zh");
    	const click_handler_1 = () => changeLanguageTo("es");
    	const click_handler_2 = () => changeLanguageTo("en");

    	function autocomplete0_selectedItem_binding(value) {
    		selectedObject = value;
    		$$invalidate(5, selectedObject);
    	}

    	function input0_change_input_handler() {
    		pctH = to_number(this.value);
    		$$invalidate(8, pctH);
    	}

    	function input1_change_input_handler() {
    		pctH_60plus = to_number(this.value);
    		($$invalidate(44, pctH_60plus), $$invalidate(8, pctH));
    	}

    	function tabs_activeTabValue_binding(value) {
    		currentTab = value;
    		$$invalidate(0, currentTab);
    	}

    	function subtabs_activeTabValue_binding(value) {
    		currentCompare = value;
    		$$invalidate(12, currentCompare);
    	}

    	function subtabs_activeTabValue_binding_1(value) {
    		selectedRisk = value;
    		$$invalidate(33, selectedRisk);
    	}

    	function subtabs_activeTabValue_binding_2(value) {
    		currentPoverty = value;
    		$$invalidate(35, currentPoverty);
    	}

    	function input_input_handler() {
    		desc = this.value;
    		$$invalidate(3, desc);
    	}

    	function autocomplete1_selectedItem_binding(value) {
    		selectedSourceObject = value;
    		$$invalidate(6, selectedSourceObject);
    	}

    	function input2_change_input_handler() {
    		pctOfChange = to_number(this.value);
    		$$invalidate(7, pctOfChange);
    	}

    	function input3_change_input_handler() {
    		prElimTimes100 = to_number(this.value);
    		$$invalidate(9, prElimTimes100);
    	}

    	function input4_change_input_handler() {
    		pctU = to_number(this.value);
    		($$invalidate(10, pctU), $$invalidate(8, pctH));
    	}

    	function textarea_input_handler() {
    		exportedData = this.value;
    		(((((((((((((((((((((((((((((((((((((((((((((((((((((((((($$invalidate(55, exportedData), $$invalidate(30, rowsOfScenarios)), $$invalidate(65, i)), $$invalidate(73, inputs)), $$invalidate(94, d_60plus)), $$invalidate(76, pctU_60plusExample)), $$invalidate(92, fatalitiesBaseline)), $$invalidate(86, j)), $$invalidate(77, prElimExample)), $$invalidate(91, demographics)), $$invalidate(75, pctU_below60Example)), $$invalidate(74, pctH_below60Example)), $$invalidate(80, deathsExample)), $$invalidate(79, infectedExample)), $$invalidate(78, fatalitiesExample)), $$invalidate(81, yearsLostExample)), $$invalidate(117, lifeExpectanciesGlobal)), $$invalidate(84, totalYearsLostExample)), $$invalidate(2, selectedLocation)), $$invalidate(45, translations)), $$invalidate(46, selectedSourceId)), $$invalidate(82, totalInfectedExample)), $$invalidate(83, totalDeathsExample)), $$invalidate(85, totalMoneyLostExample)), $$invalidate(95, prElim)), $$invalidate(97, pctU_below60)), $$invalidate(47, pctH_below60)), $$invalidate(96, pctU_60plus)), $$invalidate(44, pctH_60plus)), $$invalidate(66, deaths)), $$invalidate(64, infected)), $$invalidate(100, fatalities)), $$invalidate(107, majorCausesEng)), $$invalidate(101, majorCauses)), $$invalidate(102, majorDeaths)), $$invalidate(68, compareTypes)), $$invalidate(103, diseaseNames)), $$invalidate(104, diseaseDALYs)), $$invalidate(105, riskFactors)), $$invalidate(106, riskDALYs)), $$invalidate(116, ageGroups)), $$invalidate(72, ageTypes)), $$invalidate(108, povertyProjCountryNames)), $$invalidate(118, povertyProjCountryNumbers)), $$invalidate(109, povertyProjRegionNames)), $$invalidate(119, povertyProjRegionNumbers)), $$invalidate(93, popSize)), $$invalidate(87, selectedId)), $$invalidate(113, translationMap)), $$invalidate(4, language)), $$invalidate(6, selectedSourceObject)), $$invalidate(9, prElimTimes100)), $$invalidate(10, pctU)), $$invalidate(8, pctH)), $$invalidate(7, pctOfChange)), $$invalidate(49, totalDeaths)), $$invalidate(50, totalYearsLost)), $$invalidate(5, selectedObject)), $$invalidate(67, yearsLost));
    	}

    	let tabItems;
    	let translations;
    	let selectedId;
    	let selectedSourceId;
    	let demographics;
    	let fatalitiesBaseline;
    	let popSize;
    	let d_60plus;
    	let pctH_60plus;
    	let pctH_below60;
    	let lowerBound;
    	let upperBound;
    	let prElim;
    	let pctU_60plus;
    	let pctU_below60;
    	let lowerBoundUntil;
    	let upperBoundUntil;
    	let fatalities;
    	let totalInfected;
    	let totalDeaths;
    	let totalYearsLost;
    	let totalMoneyLost;
    	let majorCauses;
    	let majorDeaths;
    	let diseaseNames;
    	let diseaseDALYs;
    	let riskFactors;
    	let riskDALYs;
    	let majorCausesEng;
    	let exportedData;
    	let povertyProjCountryNames;
    	let povertyProjRegionNames;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*language*/ 16) {
    			 $$invalidate(45, translations = translationMap[language]);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			// tab items with labels and values
    			 $$invalidate(52, tabItems = [
    				{
    					label: translations.app.tabItem0,
    					value: 0
    				},
    				{
    					label: translations.app.tabItem1, // "Mortality by Age"
    					value: 1
    				},
    				{
    					label: translations.app.tabItem2, // "Estimates in Context"
    					value: 2
    				},
    				{
    					label: translations.app.tabItem3, // "Risks by Country"
    					value: 3
    				},
    				{
    					label: translations.app.tabItem4, // "Poverty Proj."
    					value: 4
    				},
    				{
    					label: translations.app.tabItem5, // "Deaths Proj."
    					value: 5
    				},
    				{
    					label: translations.app.tabItem6, // "Hyp. Scenarios"
    					value: 6
    				}
    			]); // "Ex. Interpretations"
    		}

    		if ($$self.$$.dirty[0] & /*selectedObject*/ 32) {
    			 $$invalidate(87, selectedId = selectedObject.id);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384 | $$self.$$.dirty[2] & /*selectedId*/ 33554432) {
    			 $$invalidate(2, selectedLocation = translations.countries[selectedId].name);
    		}

    		if ($$self.$$.dirty[0] & /*selectedSourceObject*/ 64) {
    			 $$invalidate(46, selectedSourceId = selectedSourceObject.id);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384 | $$self.$$.dirty[2] & /*selectedId*/ 33554432) {
    			 $$invalidate(91, demographics = translations.countries[selectedId].demographics);
    		}

    		if ($$self.$$.dirty[1] & /*translations, selectedSourceId*/ 49152) {
    			 $$invalidate(92, fatalitiesBaseline = translations.fatalityRisks[selectedSourceId].ftr);
    		}

    		if ($$self.$$.dirty[2] & /*demographics*/ 536870912) {
    			/***
     * PARAMETERS H, pctOfChange, H_60+, H_below60, Pr(Elimination), H_until
     *
    */
    			 $$invalidate(93, popSize = demographics.reduce((a, b) => a + b, 0)); // population size of the chosen location
    		}

    		if ($$self.$$.dirty[2] & /*demographics*/ 536870912 | $$self.$$.dirty[3] & /*popSize*/ 1) {
    			 $$invalidate(94, d_60plus = (demographics[6] + demographics[7] + demographics[8]) / popSize); // proportion of people over 60
    		}

    		if ($$self.$$.dirty[0] & /*pctH*/ 256) {
    			 $$invalidate(44, pctH_60plus = Math.round(pctH)); // proportion of people over 60 infected
    		}

    		if ($$self.$$.dirty[0] & /*pctH*/ 256 | $$self.$$.dirty[1] & /*pctH_60plus*/ 8192 | $$self.$$.dirty[3] & /*d_60plus*/ 2) {
    			// if we decrease proportion of 60+ infected, then proportion of younger people infected increases keeping H_overall fixed
    			 $$invalidate(47, pctH_below60 = Math.round((pctH - pctH_60plus * d_60plus) / (1 - d_60plus)));
    		}

    		if ($$self.$$.dirty[0] & /*pctH*/ 256 | $$self.$$.dirty[3] & /*d_60plus*/ 2) {
    			// derived bounds for pctH_plus based on: 0 <= pctH_below60 <= 1
    			 $$invalidate(53, lowerBound = Math.max(1, (pctH - 100 * (1 - d_60plus)) / d_60plus)); // has to be more than 0 and ...derive
    		}

    		if ($$self.$$.dirty[0] & /*pctH*/ 256 | $$self.$$.dirty[3] & /*d_60plus*/ 2) {
    			 $$invalidate(54, upperBound = Math.min(pctH / d_60plus, 99)); // can't be more than 100% and pctH / d60_plus
    		}

    		if ($$self.$$.dirty[0] & /*prElimTimes100*/ 512) {
    			 $$invalidate(95, prElim = prElimTimes100 / 100);
    		}

    		if ($$self.$$.dirty[0] & /*pctH, pctU*/ 1280) {
    			 if (pctH < pctU) {
    				$$invalidate(10, pctU = pctH);
    			}
    		}

    		if ($$self.$$.dirty[0] & /*pctH, pctU*/ 1280 | $$self.$$.dirty[1] & /*pctH_60plus*/ 8192) {
    			// derive from pctH_60plus to keep the number of parameters low
    			// then from U_60+/U = H_60+/H we get:
    			 $$invalidate(96, pctU_60plus = pctH_60plus / pctH * pctU); // proportion of 60+ people that are infected until elimination
    		}

    		if ($$self.$$.dirty[0] & /*pctU*/ 1024 | $$self.$$.dirty[3] & /*pctU_60plus, d_60plus*/ 10) {
    			 $$invalidate(97, pctU_below60 = (pctU - pctU_60plus * d_60plus) / (1 - d_60plus)); // pct of people below 60 infected until elimination
    		}

    		if ($$self.$$.dirty[0] & /*pctU*/ 1024 | $$self.$$.dirty[3] & /*d_60plus*/ 2) {
    			 lowerBoundUntil = Math.max(1, (pctU - 100 * (1 - d_60plus)) / d_60plus);
    		}

    		if ($$self.$$.dirty[0] & /*pctU*/ 1024 | $$self.$$.dirty[3] & /*d_60plus*/ 2) {
    			 upperBoundUntil = Math.min(pctU / d_60plus, 99);
    		}

    		if ($$self.$$.dirty[0] & /*pctOfChange*/ 128 | $$self.$$.dirty[2] & /*fatalitiesBaseline*/ 1073741824) {
    			/***
     * CALCULATION of infected, deaths, ... totals
     *
     */
    			// use pctOfChange to increase / decrease the fatality risks
    			 $$invalidate(100, fatalities = fatalitiesBaseline.map(fat => fat * (1 + pctOfChange / 100)));
    		}

    		if ($$self.$$.dirty[1] & /*pctH_below60*/ 65536 | $$self.$$.dirty[2] & /*i, demographics*/ 536870920 | $$self.$$.dirty[3] & /*prElim, pctU_below60*/ 20) {
    			// multiply below60 demographics by pctH_below60 selected proportion of infected
    			 for ($$invalidate(65, i = 0); i < 6; $$invalidate(65, i++, i)) {
    				$$invalidate(64, infected[i] = Math.round(prElim * demographics[i] * pctU_below60 / 100 + (1 - prElim) * demographics[i] * pctH_below60 / 100), infected); // infections in case of elimination for below 60
    				// case of no elimination for below 60
    			}
    		}

    		if ($$self.$$.dirty[1] & /*pctH_60plus*/ 8192 | $$self.$$.dirty[2] & /*i, demographics*/ 536870920 | $$self.$$.dirty[3] & /*prElim, pctU_60plus*/ 12) {
    			// multiply 60plus demographics by pctH_60plus selected proportion of infected
    			 for ($$invalidate(65, i = 6); i < 9; $$invalidate(65, i++, i)) {
    				$$invalidate(64, infected[i] = Math.round(prElim * demographics[i] * pctU_60plus / 100 + (1 - prElim) * demographics[i] * pctH_60plus / 100), infected); // infections in case of elimination for 60 plus
    				// no elimination 60+
    			}
    		}

    		if ($$self.$$.dirty[2] & /*i, deaths, infected*/ 28 | $$self.$$.dirty[3] & /*fatalities*/ 128) {
    			 for ($$invalidate(65, i = 0); i < deaths.length; $$invalidate(65, i++, i)) {
    				$$invalidate(66, deaths[i] = Math.round(infected[i] * fatalities[i] / 100), deaths);
    			}
    		}

    		if ($$self.$$.dirty[2] & /*i, deaths*/ 24) {
    			 for ($$invalidate(65, i = 0); i < deaths.length; $$invalidate(65, i++, i)) {
    				$$invalidate(67, yearsLost[i] = Math.round(deaths[i] * lifeExpectanciesGlobal[i]), yearsLost);
    			}
    		}

    		if ($$self.$$.dirty[2] & /*infected*/ 4) {
    			// sum vectors to get totals
    			 $$invalidate(48, totalInfected = Math.round(infected.reduce((a, b) => a + b, 0)));
    		}

    		if ($$self.$$.dirty[2] & /*deaths*/ 16) {
    			 $$invalidate(49, totalDeaths = Math.round(deaths.reduce((a, b) => a + b, 0)));
    		}

    		if ($$self.$$.dirty[2] & /*yearsLost*/ 32) {
    			 $$invalidate(50, totalYearsLost = Math.round(yearsLost.reduce((a, b) => a + b, 0)));
    		}

    		if ($$self.$$.dirty[1] & /*totalYearsLost*/ 524288) {
    			 $$invalidate(51, totalMoneyLost = Math.round(129000 * totalYearsLost / Math.pow(10, 9)));
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384 | $$self.$$.dirty[2] & /*selectedId*/ 33554432) {
    			// push estimated coronavirus deaths to majorCauses
    			 $$invalidate(101, majorCauses = [
    				translations.app.covid19Cause,
    				...translations.countries[selectedId].majorCauses
    			]);
    		}

    		if ($$self.$$.dirty[1] & /*totalDeaths, translations*/ 278528 | $$self.$$.dirty[2] & /*selectedId*/ 33554432) {
    			 $$invalidate(102, majorDeaths = [totalDeaths, ...translations.countries[selectedId].majorDeaths]);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384 | $$self.$$.dirty[2] & /*selectedId*/ 33554432) {
    			// push estimated totalYearsLost TODO: DALYs of coronavirus deaths to diseaseNames
    			 $$invalidate(103, diseaseNames = [
    				translations.app.covid19Cause,
    				...translations.countries[selectedId].diseaseNames
    			]);
    		}

    		if ($$self.$$.dirty[1] & /*totalYearsLost, translations*/ 540672 | $$self.$$.dirty[2] & /*selectedId*/ 33554432) {
    			 $$invalidate(104, diseaseDALYs = [totalYearsLost, ...translations.countries[selectedId].diseaseDALYs]);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384 | $$self.$$.dirty[2] & /*selectedId*/ 33554432) {
    			// push estimated totalYearsLost TODO: DALYs of coronavirus deaths to riskCauses
    			 $$invalidate(105, riskFactors = [
    				translations.app.covid19Cause,
    				...translations.countries[selectedId].riskFactors
    			]);
    		}

    		if ($$self.$$.dirty[1] & /*totalYearsLost, translations*/ 540672 | $$self.$$.dirty[2] & /*selectedId*/ 33554432) {
    			 $$invalidate(106, riskDALYs = [totalYearsLost, ...translations.countries[selectedId].riskDALYs]);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(11, compareItems = [
    				{
    					label: translations.app.compareItems0,
    					value: 0
    				},
    				{
    					label: translations.app.compareItems1, // "Causes of Death"
    					value: 1
    				},
    				{
    					label: translations.app.compareItems2, // "Causes of Years of Life Lost"
    					value: 2
    				}
    			]); // "Risk Factors in Years of Life Lost"
    		}

    		if ($$self.$$.dirty[2] & /*selectedId*/ 33554432) {
    			// to extract types for colors
    			 $$invalidate(107, majorCausesEng = [
    				translationMap["en"].app.covid19Cause,
    				...translationMap["en"].countries[selectedId].majorCauses
    			]);
    		}

    		if ($$self.$$.dirty[3] & /*majorCausesEng*/ 16384) {
    			 for (let i = 0; i < majorCausesEng.length; i++) {
    				if (majorCausesEng[i].includes("estimate")) {
    					$$invalidate(68, compareTypes[i] = "estimate", compareTypes);
    				} else if (majorCausesEng[i].includes("until")) ; else {
    					$$invalidate(68, compareTypes[i] = "other", compareTypes); // compareTypes[i] = 'until';
    				}
    			}
    		}

    		if ($$self.$$.dirty[2] & /*compareTypes*/ 64 | $$self.$$.dirty[3] & /*majorCauses, majorDeaths*/ 768) {
    			 for (let i = 0; i < majorCauses.length; i++) {
    				$$invalidate(
    					69,
    					compareCauses[i] = {
    						name: majorCauses[i],
    						number: majorDeaths[i],
    						type: compareTypes[i]
    					},
    					compareCauses
    				);
    			}
    		}

    		if ($$self.$$.dirty[2] & /*compareTypes*/ 64 | $$self.$$.dirty[3] & /*diseaseNames, diseaseDALYs*/ 3072) {
    			 for (let i = 0; i < diseaseNames.length; i++) {
    				$$invalidate(
    					70,
    					compareDiseases[i] = {
    						name: diseaseNames[i],
    						number: diseaseDALYs[i],
    						type: compareTypes[i]
    					},
    					compareDiseases
    				);
    			}
    		}

    		if ($$self.$$.dirty[2] & /*compareTypes*/ 64 | $$self.$$.dirty[3] & /*riskFactors, riskDALYs*/ 12288) {
    			 for (let i = 0; i < riskFactors.length; i++) {
    				$$invalidate(
    					71,
    					compareRisks[i] = {
    						name: riskFactors[i],
    						number: riskDALYs[i],
    						type: compareTypes[i]
    					},
    					compareRisks
    				);
    			}
    		}

    		if ($$self.$$.dirty[0] & /*currentCompare*/ 4096 | $$self.$$.dirty[2] & /*compareCauses, compareDiseases, compareRisks*/ 896) {
    			 switch (currentCompare) {
    				case 0:
    					$$invalidate(13, compareList = compareCauses);
    					break;
    				case 1:
    					$$invalidate(13, compareList = compareDiseases);
    					break;
    				default:
    					$$invalidate(13, compareList = compareRisks);
    			}
    		}

    		if ($$self.$$.dirty[0] & /*compareItems, currentCompare, selectedLocation*/ 6148 | $$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(16, titleListMain = translations.app.titleListMain + compareItems[currentCompare].label + translations.app.inCountry + selectedLocation);
    		}

    		if ($$self.$$.dirty[0] & /*currentCompare*/ 4096 | $$self.$$.dirty[1] & /*translations*/ 16384) {
    			 if (currentCompare === 0) {
    				$$invalidate(14, titleListName = translations.app.titleListName);
    				$$invalidate(15, titleListNumber = translations.app.deaths);
    			} else if (currentCompare === 1) {
    				$$invalidate(14, titleListName = translations.app.titleListName);
    				$$invalidate(15, titleListNumber = translations.app.yearsOfLifeLost);
    			} else {
    				$$invalidate(14, titleListName = translations.app.titleListRisk);
    				$$invalidate(15, titleListNumber = translations.app.yearsOfLifeLost);
    			}
    		}

    		if ($$self.$$.dirty[2] & /*infected, ageTypes, deaths*/ 1044) {
    			 for (let i = 0; i < infected.length; i++) {
    				$$invalidate(
    					17,
    					infectedData[i] = {
    						name: ageGroups[i],
    						number: infected[i],
    						type: ageTypes[i]
    					},
    					infectedData
    				);

    				$$invalidate(
    					18,
    					deathsData[i] = {
    						name: ageGroups[i],
    						number: deaths[i],
    						type: ageTypes[i]
    					},
    					deathsData
    				);
    			}
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(19, infectedTitle = translations.app.infectedTitle);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(20, deathsTitle = translations.app.deathsTitle);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(21, infectedTitleListName = translations.app.age);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(22, infectedTitleListNumber = translations.app.infected);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(23, deathsTitleListName = translations.app.age);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(24, deathsTitleListNumber = translations.app.age);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(25, projectionsTitle = translations.app.projectionsTitle);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(26, projectionsXAxisLabel = translations.app.date);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(27, projectionsYAxisLabel = translations.app.totDeaths);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(28, projectionsLegendDeaths = translations.app.totDeaths);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(29, projectionsLegendDeathsProjected = translations.app.totDeathsProj);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(73, inputs = [
    				{
    					id: 0,
    					pctH: 60,
    					pctH_60plus: 60,
    					pctOfChange: 0,
    					prElim100: 0,
    					pctU: 0,
    					comments: translations.app.exampleScenario0
    				},
    				// "Scenario 0: Do nothing, as a baseline"
    				{
    					id: 1,
    					pctH: 60,
    					pctH_60plus: 20,
    					pctOfChange: 0,
    					prElim100: 0,
    					pctU: 0,
    					comments: translations.app.exampleScenario1
    				},
    				// "Scenario 1: Protect people over 60, compensate by exposing those 
    				// below 60, consider also years of life lost"
    				{
    					id: 2,
    					pctH: 60,
    					pctH_60plus: 60,
    					pctOfChange: 0,
    					prElim100: 90,
    					pctU: 10,
    					comments: translations.app.exampleScenario2
    				}
    			]); // "Scenario 2: Elimination to 90%, consider also money saved"
    		}

    		if ($$self.$$.dirty[0] & /*selectedLocation*/ 4 | $$self.$$.dirty[1] & /*translations, selectedSourceId*/ 49152 | $$self.$$.dirty[2] & /*i, inputs, pctU_60plusExample, fatalitiesBaseline, j, prElimExample, demographics, pctU_below60Example, pctH_below60Example, deathsExample, infectedExample, fatalitiesExample, yearsLostExample, totalYearsLostExample, totalInfectedExample, totalDeathsExample, totalMoneyLostExample*/ 1644165128 | $$self.$$.dirty[3] & /*d_60plus*/ 2) {
    			 for ($$invalidate(65, i = 0); i < 3; $$invalidate(65, i++, i)) {
    				// d_60plus does not depend on input parameters
    				$$invalidate(74, pctH_below60Example = Math.round((inputs[i].pctH - inputs[i].pctH_60plus * d_60plus) / (1 - d_60plus)));

    				// pctU_60plusExample = proportion of 60+ people that are infected until elimination
    				$$invalidate(76, pctU_60plusExample = inputs[i].pctH_60plus / inputs[i].pctH * inputs[i].pctU);

    				$$invalidate(75, pctU_below60Example = (inputs[i].pctU - pctU_60plusExample * d_60plus) / (1 - d_60plus));
    				$$invalidate(78, fatalitiesExample = fatalitiesBaseline.map(fat => fat * (1 + inputs[i].pctOfChange / 100)));
    				$$invalidate(77, prElimExample = inputs[i].prElim100 / 100);

    				for ($$invalidate(86, j = 0); j < 6; $$invalidate(86, j++, j)) {
    					$$invalidate(79, infectedExample[j] = Math.round(prElimExample * demographics[j] * pctU_below60Example / 100 + (1 - prElimExample) * demographics[j] * pctH_below60Example / 100), infectedExample);
    				}

    				for ($$invalidate(86, j = 6); j < 9; $$invalidate(86, j++, j)) {
    					$$invalidate(79, infectedExample[j] = Math.round(prElimExample * demographics[j] * pctU_60plusExample / 100 + (1 - prElimExample) * demographics[j] * inputs[i].pctH_60plus / 100), infectedExample);
    				}

    				for ($$invalidate(86, j = 0); j < deathsExample.length; $$invalidate(86, j++, j)) {
    					$$invalidate(80, deathsExample[j] = Math.round(infectedExample[j] * fatalitiesExample[j] / 100), deathsExample);
    				}

    				for ($$invalidate(86, j = 0); j < yearsLostExample.length; $$invalidate(86, j++, j)) {
    					$$invalidate(81, yearsLostExample[j] = Math.round(deathsExample[j] * lifeExpectanciesGlobal[j]), yearsLostExample);
    				}

    				$$invalidate(82, totalInfectedExample = Math.round(infectedExample.reduce((a, b) => a + b, 0)));
    				$$invalidate(83, totalDeathsExample = Math.round(deathsExample.reduce((a, b) => a + b, 0)));
    				$$invalidate(84, totalYearsLostExample = Math.round(yearsLostExample.reduce((a, b) => a + b, 0)));
    				$$invalidate(85, totalMoneyLostExample = Math.round(129000 * totalYearsLostExample / Math.pow(10, 9))); // in $< >B or billion format

    				$$invalidate(
    					30,
    					rowsOfScenarios[i] = {
    						id: inputs[i].id,
    						loc: selectedLocation,
    						frs: translations.fatalityRisks[selectedSourceId].source,
    						H: inputs[i].pctH, // just copy first five input parameters to output
    						H_60: inputs[i].pctH_60plus,
    						H_below: pctH_below60Example,
    						F: inputs[i].pctOfChange,
    						Elim: inputs[i].prElim100,
    						U: inputs[i].pctU,
    						totInf: totalInfectedExample,
    						totDeaths: totalDeathsExample,
    						yrsLifeLost: totalYearsLostExample,
    						yrsLifeLostCosts: totalMoneyLostExample,
    						comments: inputs[i].comments
    					},
    					rowsOfScenarios
    				);
    			}
    		}

    		if ($$self.$$.dirty[0] & /*rowsOfScenarios*/ 1073741824) {
    			// to export scenarios, countries population properties, etc. we just pretty print the JSONs
    			 $$invalidate(55, exportedData = "\"Scenarios\": " + JSON.stringify(rowsOfScenarios, null, 2));
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(31, mapTitle = translations.app.mapTitle);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(32, mapItems = [
    				{
    					label: translations.app.mapItems0,
    					value: 0
    				},
    				{
    					label: translations.app.mapItems1, // "Proportion of people over 60 by Country"
    					value: 1
    				}
    			]); // "Income by Country"
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(34, povertyItems = [
    				{
    					label: translations.app.povertyItems0,
    					value: 0
    				},
    				{
    					label: translations.app.povertyItems1, // "By Country"
    					value: 1
    				}
    			]); // "By Region"
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			// poverty increases by country:
    			 $$invalidate(108, povertyProjCountryNames = [
    				translations.app.india,
    				translations.app.nigeria,
    				translations.app.drCongo,
    				translations.app.ethiopia,
    				translations.app.bangladesh,
    				translations.app.tanzania,
    				translations.app.madagascar,
    				translations.app.indonesia,
    				translations.app.kenya,
    				translations.app.mozambique,
    				translations.app.uganda,
    				translations.app.southAfrica
    			]);
    		}

    		if ($$self.$$.dirty[3] & /*povertyProjCountryNames*/ 32768) {
    			 for (let i = 0; i < povertyProjCountryNames.length; i++) {
    				$$invalidate(
    					36,
    					povertyProjCountries[i] = {
    						name: povertyProjCountryNames[i],
    						number: povertyProjCountryNumbers[i],
    						type: "poverty"
    					},
    					povertyProjCountries
    				);
    			}
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			// poverty increases by region:
    			 $$invalidate(109, povertyProjRegionNames = [
    				translations.app.subSahAfrica,
    				translations.app.southAsia,
    				translations.app.eastAsiaPacific,
    				translations.app.latinCaribbean,
    				translations.app.middleEastNorthAfrica,
    				translations.app.europeCentralAsia,
    				translations.app.northAmerica
    			]);
    		}

    		if ($$self.$$.dirty[3] & /*povertyProjRegionNames*/ 65536) {
    			 for (let i = 0; i < povertyProjRegionNames.length; i++) {
    				$$invalidate(
    					37,
    					povertyProjRegions[i] = {
    						name: povertyProjRegionNames[i],
    						number: povertyProjRegionNumbers[i],
    						type: "poverty"
    					},
    					povertyProjRegions
    				);
    			}
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(38, mainProjCountries = translations.app.projectionsTitle + translations.app.country);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(39, nameProjCountries = translations.app.country);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(40, numberProjCountries = translations.app.people);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(41, mainProjRegions = translations.app.projectionsTitle + translations.app.region);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(42, nameProjRegions = translations.app.region);
    		}

    		if ($$self.$$.dirty[1] & /*translations*/ 16384) {
    			 $$invalidate(43, numberProjRegions = translations.app.people);
    		}
    	};

    	 for (let i = 0; i < ageGroups.length; i++) {
    		if (ageGroups[i].includes("80") || ageGroups[i].includes("70") || ageGroups[i].includes("60")) {
    			$$invalidate(72, ageTypes[i] = "over60", ageTypes);
    		} else {
    			$$invalidate(72, ageTypes[i] = "below60", ageTypes);
    		}
    	}

    	return [
    		currentTab,
    		userNeeds,
    		selectedLocation,
    		desc,
    		language,
    		selectedObject,
    		selectedSourceObject,
    		pctOfChange,
    		pctH,
    		prElimTimes100,
    		pctU,
    		compareItems,
    		currentCompare,
    		compareList,
    		titleListName,
    		titleListNumber,
    		titleListMain,
    		infectedData,
    		deathsData,
    		infectedTitle,
    		deathsTitle,
    		infectedTitleListName,
    		infectedTitleListNumber,
    		deathsTitleListName,
    		deathsTitleListNumber,
    		projectionsTitle,
    		projectionsXAxisLabel,
    		projectionsYAxisLabel,
    		projectionsLegendDeaths,
    		projectionsLegendDeathsProjected,
    		rowsOfScenarios,
    		mapTitle,
    		mapItems,
    		selectedRisk,
    		povertyItems,
    		currentPoverty,
    		povertyProjCountries,
    		povertyProjRegions,
    		mainProjCountries,
    		nameProjCountries,
    		numberProjCountries,
    		mainProjRegions,
    		nameProjRegions,
    		numberProjRegions,
    		pctH_60plus,
    		translations,
    		selectedSourceId,
    		pctH_below60,
    		totalInfected,
    		totalDeaths,
    		totalYearsLost,
    		totalMoneyLost,
    		tabItems,
    		lowerBound,
    		upperBound,
    		exportedData,
    		resetParameters,
    		keepUpWithH,
    		changeLanguageTo,
    		addScenario,
    		deleteScenario,
    		toggleExportData,
    		colorsProjRegions,
    		colorsProjCountries,
    		infected,
    		i,
    		deaths,
    		yearsLost,
    		compareTypes,
    		compareCauses,
    		compareDiseases,
    		compareRisks,
    		ageTypes,
    		inputs,
    		pctH_below60Example,
    		pctU_below60Example,
    		pctU_60plusExample,
    		prElimExample,
    		fatalitiesExample,
    		infectedExample,
    		deathsExample,
    		yearsLostExample,
    		totalInfectedExample,
    		totalDeathsExample,
    		totalYearsLostExample,
    		totalMoneyLostExample,
    		j,
    		selectedId,
    		$englishDictStore,
    		$chineseDictStore,
    		$spanishDictStore,
    		demographics,
    		fatalitiesBaseline,
    		popSize,
    		d_60plus,
    		prElim,
    		pctU_60plus,
    		pctU_below60,
    		lowerBoundUntil,
    		upperBoundUntil,
    		fatalities,
    		majorCauses,
    		majorDeaths,
    		diseaseNames,
    		diseaseDALYs,
    		riskFactors,
    		riskDALYs,
    		majorCausesEng,
    		povertyProjCountryNames,
    		povertyProjRegionNames,
    		english,
    		chinese,
    		spanish,
    		translationMap,
    		defaultLocation,
    		defaultSourceObject,
    		ageGroups,
    		lifeExpectanciesGlobal,
    		povertyProjCountryNumbers,
    		povertyProjRegionNumbers,
    		click_handler,
    		click_handler_1,
    		click_handler_2,
    		autocomplete0_selectedItem_binding,
    		input0_change_input_handler,
    		input1_change_input_handler,
    		tabs_activeTabValue_binding,
    		subtabs_activeTabValue_binding,
    		subtabs_activeTabValue_binding_1,
    		subtabs_activeTabValue_binding_2,
    		input_input_handler,
    		autocomplete1_selectedItem_binding,
    		input2_change_input_handler,
    		input3_change_input_handler,
    		input4_change_input_handler,
    		textarea_input_handler
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$a, create_fragment$a, safe_not_equal, {}, [-1, -1, -1, -1, -1]);
    	}
    }

    const app = new App({
    	target: document.body,
    	props: {
    		name: 'world'
    	}
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
