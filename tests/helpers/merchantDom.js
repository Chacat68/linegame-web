// 轻量 DOM fixture 支持行为测试；innerHTML 重绘会移除旧节点及其焦点。
export function documentFixture() {
  const doc = { activeElement: null };
  function element(tag = 'div', attributes = {}) {
    const listeners = new Map(), classes = new Set();
    let markup = '';
    const node = {
      tag, attributes, children: [], parent: null, id: attributes.id || '', className: attributes.class || '',
      dataset: Object.fromEntries(Object.entries(attributes).filter(([name]) => name.startsWith('data-'))
        .map(([name, value]) => [name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value])),
      style: {}, hidden: false,
      value: attributes.value || '', disabled: 'disabled' in attributes, textContent: '',
      classList: {
        contains: name => classes.has(name) || node.className.split(/\s+/).includes(name),
        add: name => classes.add(name),
        remove: name => { classes.delete(name); node.className = node.className.split(/\s+/).filter(value => value !== name).join(' '); },
        toggle: (name, on) => on ? node.classList.add(name) : node.classList.remove(name),
      },
      setAttribute(name, value) { attributes[name] = String(value); },
      getAttribute: name => attributes[name] ?? null,
      contains: target => node === target || node.children.some(child => child.contains(target)),
      matches(selector) {
        if (selector.includes(',')) return selector.split(',').some(part => node.matches(part.trim()));
        const parts = selector.trim().split(/\s+/);
        if (parts.length > 1) {
          if (!node.matches(parts.pop())) return false;
          let ancestor = node.parent;
          while (parts.length && ancestor) {
            if (ancestor.matches(parts.at(-1))) parts.pop();
            ancestor = ancestor.parent;
          }
          return parts.length === 0;
        }
        if (selector.startsWith('#')) return node.id === selector.slice(1);
        if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
        const attribute = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
        return attribute ? attribute[1] in attributes && (attribute[2] === undefined || attributes[attribute[1]] === attribute[2]) : tag === selector;
      },
      closest(selector) { return node.matches(selector) ? node : node.parent?.closest(selector) || null; },
      querySelector(selector) {
        for (const child of node.children) {
          if (child.matches(selector)) return child;
          const match = child.querySelector(selector);
          if (match) return match;
        }
        return null;
      },
      querySelectorAll(selector) {
        return node.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
      },
      get parentElement() { return node.parent; },
      get firstChild() { return node.children[0] || null; },
      insertBefore(child, before) {
        if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
        child.parent = node;
        const index = node.children.indexOf(before);
        node.children.splice(index < 0 ? node.children.length : index, 0, child);
      },
      appendChild(child) { node.insertBefore(child, null); },
      focus() { doc.activeElement = node; },
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: (name, listener) => { if (listeners.get(name) === listener) listeners.delete(name); },
      fire(name, event = {}) {
        const payload = { target: node, ...event };
        for (let current = node; current; current = current.parent) current.deliver(name, payload);
      },
      deliver: (name, event) => listeners.get(name)?.(event),
      remove() {
        if (node.contains(doc.activeElement)) doc.activeElement = doc.body;
        if (node.parent) node.parent.children = node.parent.children.filter(child => child !== node);
        node.parent = null;
      },
      get innerHTML() { return markup; },
      set innerHTML(html) {
        if (node.contains(doc.activeElement)) doc.activeElement = doc.body;
        for (const child of node.children) child.parent = null;
        node.children = []; markup = html;
        const stack = [node];
        for (const match of html.matchAll(/<(\/?)\s*([a-z][\w-]*)([^>]*)>/gi)) {
          const [, closing, name, source] = match;
          if (closing) { if (stack.length > 1) stack.pop(); continue; }
          const attrs = Object.fromEntries([...source.matchAll(/([^\s=\/]+)(?:="([^"]*)")?/g)].map(([, key, value]) => [key, value ?? '']));
          const child = element(name, attrs);
          stack.at(-1).appendChild(child);
          if (!['input', 'img', 'br', 'hr'].includes(name)) stack.push(child);
        }
        const chooseValues = current => {
          if (current.tag === 'select') {
            const options = current.children.filter(child => child.tag === 'option');
            current.value = (options.find(option => 'selected' in option.attributes) || options[0])?.value || '';
          }
          current.children.forEach(chooseValues);
        };
        chooseValues(node);
      },
    };
    return node;
  }
  doc.createElement = element;
  doc.body = element('body'); doc.activeElement = doc.body;
  doc.getElementById = id => doc.body.querySelector(`#${id}`);
  doc.querySelector = selector => doc.body.querySelector(selector);
  doc.querySelectorAll = selector => doc.body.querySelectorAll(selector);
  return doc;
}
