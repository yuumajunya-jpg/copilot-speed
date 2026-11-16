"use strict";
(() => {
  function createRegistry() {
    let head = null, tail = null;
    const frames = new Set();
    const registry = {
      subscribe(callback) {
        let node = { callback, prev: tail, next: null };
        if (tail) tail.next = node;
        else head = node;
        tail = node;
        // A live array per active notification preserves Array.forEach's exact
        // index/length behavior, including mutations and nested notifications.
        for (const frame of frames) frame.push(node);
        return function unsubscribe() {
          if (!node) return;
          const removed = node;
          node = null;
          if (removed.prev) removed.prev.next = removed.next;
          else head = removed.next;
          if (removed.next) removed.next.prev = removed.prev;
          else tail = removed.prev;
          for (const frame of frames) {
            const index = frame.indexOf(removed);
            if (index !== -1) frame.splice(index, 1);
          }
          removed.callback = null;
          removed.prev = removed.next = null;
        };
      },
      forEach(callback) {
        const frame = [];
        for (let node = head; node; node = node.next) frame.push(node);
        frames.add(frame);
        try {
          frame.forEach((node, index) => callback(node.callback, index));
        } finally {
          frames.delete(frame);
        }
      }
    };
    return registry;
  }
  globalThis.__cllCreateRegistry = createRegistry;
})();
