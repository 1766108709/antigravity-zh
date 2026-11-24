(() => {
  const SKIP = 'script,style,noscript,textarea,input,code,pre,kbd,samp,svg,[contenteditable="true"],.xterm,.monaco-editor,[role="treeitem"],[data-testid="user-message-content"],[data-testid="file-title-name"],[data-testid="breadcrumb-segment"]';
  const out = new Set();
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    const t = n.nodeValue.replace(/\s+/g, ' ').trim();
    if (!/[A-Za-z]{2,}/.test(t) || t.length > 300) continue;
    const el = n.parentElement;
    if (!el || el.closest(SKIP)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    out.add(t);
  }
  for (const el of document.querySelectorAll("*")) { const ks = el.childNodes; if (ks.length > 1 && [...ks].every(k => k.nodeType === 3)) { const j = [...ks].map(k => k.nodeValue).join("").replace(/\s+/g, " ").trim(); if (/[A-Za-z]{2,}/.test(j) && !el.closest(SKIP) && el.getBoundingClientRect().width > 0) out.add("G: " + j); } }
  for (const el of document.querySelectorAll("[placeholder],[title]")) {
    for (const a of ['placeholder', 'title']) { const v = el.getAttribute(a); if (v && /[A-Za-z]{2,}/.test(v)) out.add('@' + a + ': ' + v); }
  }
  return [...out].join('\n');
})()
