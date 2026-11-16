"use strict";
(() => {
  const sha256 = globalThis.__cllSha256;
  const createRegistry = globalThis.__cllCreateRegistry;
  delete globalThis.__cllSha256;
  delete globalThis.__cllCreateRegistry;
  const KEY = "rspackChunk_1js_m365_copilot_app";
  const PROVIDER = "900823", CONSUMER = "62229";
  const EXPECTED = {
    [PROVIDER]: "778cbf87641dc6c5633db703eb58c01b6285186eec5b4e7a8ac4f01558afbdad",
    [CONSUMER]: "5ecd5be924add02b83ed32d103ed1c742a444f9471933777c21c01976ed7abca"
  };
  const source = Function.prototype.toString;
  const registries = new WeakSet();
  let state = "waiting", reason = "awaiting-chunk", timer, lastNonce = null;
  const hookedArrays = new Map();
  let current, prior;

  function send(nonce) {
    window.postMessage({ channel: "copilot-latency-lab-v1", direction: "main", nonce,
      state, reason, adapter: "fluent-context-ed520e7e-v1"
    }, location.origin);
  }
  window.addEventListener("message", event => {
    const m = event.data;
    if (event.source !== window || event.origin !== location.origin || !m ||
        m.channel !== "copilot-latency-lab-v1" || m.direction !== "extension" ||
        !/^[a-f0-9]{32}$/.test(m.nonce)) return;
    if (m.type === "probe") { lastNonce = m.nonce; send(m.nonce); }
  });

  function guard(fn) {
    return function(...args) {
      try { return Reflect.apply(fn, this, args); }
      catch (error) {
        state = "error";
        reason = "runtime-failed";
        if (lastNonce) send(lastNonce);
        throw error;
      }
    };
  }

  function providerFactory(module, exports, require) {
    const originalEffect = require(203125).E;
    const effect = (callback, deps) => originalEffect(guard(callback), deps);
    const React = require(104553);
    const scheduler = require(873177);
    const makeListeners = () => {
      const registry = createRegistry();
      registries.add(registry);
      return registry;
    };
    function createContext(defaultValue) {
      const context = React.createContext({ value: { current: defaultValue }, listeners: makeListeners(), isDefault: true });
      const OriginalProvider = context.Provider;
      context.Provider = guard(function Provider(props) {
        const value = React.useRef(props.value);
        const store = React.useRef(null);
        if (!store.current) store.current = { value, listeners: makeListeners() };
        effect(() => {
          value.current = props.value;
          scheduler.unstable_runWithPriority(scheduler.unstable_NormalPriority, () => {
            store.current.listeners.forEach(listener => { listener(props.value); });
          });
        }, [props.value]);
        return React.createElement(OriginalProvider, { value: store.current }, props.children);
      });
      delete context.Consumer;
      return context;
    }
    require.d(exports, {}, { q: guard(createContext) });
  }

  function consumerFactory(module, exports, require) {
    const originalEffect = require(203125).E;
    const effect = (callback, deps) => originalEffect(guard(callback), deps);
    const React = require(104553);
    function useSelector(context, selector) {
      const { value, listeners } = React.useContext(context);
      const selected = selector(value.current);
      const [, forceUpdate] = React.useReducer(count => count + 1, 0);
      const latestSelector = React.useRef(selector);
      const latestValue = React.useRef(selected);
      effect(() => { latestSelector.current = selector; latestValue.current = selected; });
      effect(() => {
        const listener = next => {
          try {
            const nextSelected = latestSelector.current(next);
            if (!Object.is(latestValue.current, nextSelected)) forceUpdate();
          } catch { /* Match the original selector error handling. */ }
        };
        let unsubscribe;
        if (registries.has(listeners)) unsubscribe = listeners.subscribe(listener);
        else {
          // Contexts made by another copy of the library retain their behavior.
          listeners.push(listener);
          unsubscribe = () => {
            const index = listeners.indexOf(listener);
            if (index !== -1) listeners.splice(index, 1);
          };
        }
        listener(value.current);
        return unsubscribe;
      }, [listeners, value]);
      return selected;
    }
    require.d(exports, {}, { i: guard(useSelector) });
  }

  function restoreHooks() {
    clearTimeout(timer);
    let restored = true;
    for (const [array, saved] of hookedArrays) {
      if (Object.getOwnPropertyDescriptor(array, "push")?.get !== saved.getter) continue;
      try {
        if (saved.runtimeAssigned) Object.defineProperty(array, "push", { configurable: true, writable: true, enumerable: true, value: saved.delegate });
        else if (saved.descriptor) Object.defineProperty(array, "push", saved.descriptor);
        else delete array.push;
      } catch { restored = false; }
    }
    hookedArrays.clear();
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, KEY);
    if (descriptor?.get === getter) {
      try {
        if (prior) Object.defineProperty(globalThis, KEY, { ...prior, value: current });
        else Object.defineProperty(globalThis, KEY, { configurable: true, writable: true, enumerable: true, value: current });
      } catch { restored = false; }
    }
    return restored;
  }

  function finish(nextState, nextReason) {
    state = nextState;
    reason = nextReason;
    if (!restoreHooks()) { state = "error"; reason = "restoration-failed"; }
  }

  function inspect(chunk) {
    if (state !== "waiting" || !Array.isArray(chunk) || !chunk[1] || typeof chunk[1] !== "object") return chunk;
    const modules = chunk[1];
    if (!(PROVIDER in modules) && !(CONSUMER in modules)) return chunk;
    const src = document.currentScript?.src;
    if (src !== "https://res.public.onecdn.static.microsoft/midgard/versionless-v2/main.vendors.ed520e7e.js") {
      finish("unsupported", "script-url-mismatch");
      return chunk;
    }
    for (const id of [PROVIDER, CONSUMER]) {
      if (typeof modules[id] !== "function" || source.call(modules[id]).length > 8192 ||
          sha256(source.call(modules[id])) !== EXPECTED[id]) {
        finish("unsupported", "factory-mismatch");
        return chunk;
      }
    }
    const replacement = chunk.slice();
    replacement[1] = { ...modules, [PROVIDER]: providerFactory, [CONSUMER]: consumerFactory };
    finish("optimized", "verified-factories");
    return state === "optimized" ? replacement : chunk;
  }

  function hook(array) {
    if (!Array.isArray(array) || hookedArrays.has(array) || state !== "waiting") return;
    const descriptor = Object.getOwnPropertyDescriptor(array, "push");
    const push = array.push;
    if (typeof push !== "function" || descriptor?.configurable === false) throw new Error("push-not-hookable");
    const saved = { descriptor, delegate: push, runtimeAssigned: false };
    const wrap = delegate => function(...chunks) {
      if (this !== array) return Reflect.apply(delegate, this, chunks);
      const prepared = chunks.map(chunk => {
        try { return inspect(chunk); }
        catch { finish("error", "inspection-failed"); return chunk; }
      });
      return Reflect.apply(delegate, this, prepared);
    };
    saved.wrapper = wrap(push);
    saved.getter = () => saved.wrapper;
    hookedArrays.set(array, saved);
    Object.defineProperty(array, "push", {
      configurable: true, enumerable: descriptor?.enumerable ?? false,
      get: saved.getter,
      set(delegate) {
        if (typeof delegate !== "function") {
          finish("unsupported", "push-not-callable");
          Object.defineProperty(array, "push", { configurable: true, writable: true, enumerable: true, value: delegate });
          return;
        }
        // Each generation closes over its own delegate: runtimes may bind the
        // previous push as their parent callback. A mutable delegate recurses.
        saved.delegate = delegate;
        saved.runtimeAssigned = true;
        saved.wrapper = wrap(delegate);
      }
    });
  }
  function getter() { return current; }
  function setter(value) { current = value; hook(value); }

  try {
    prior = Object.getOwnPropertyDescriptor(globalThis, KEY);
    if (prior && (!prior.configurable || !Object.hasOwn(prior, "value") || !prior.writable)) {
      state = "unsupported"; reason = "chunk-global-not-hookable"; return;
    }
    current = prior?.value;
    if (current !== undefined && (!Array.isArray(current) || current.length !== 0 || Object.hasOwn(current, "push"))) {
      state = "unsupported"; reason = "already-initialized"; return;
    }
    Object.defineProperty(globalThis, KEY, { configurable: true, enumerable: true, get: getter, set: setter });
    if (current) hook(current);
    timer = setTimeout(() => finish("unsupported", "target-not-observed"), 30000);
  } catch {
    finish("error", "initialization-failed");
  }
})();
