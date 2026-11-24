'use strict';
// Inject the Swarm Board UI translation layer into loopback sidecar iframes
// without modifying ~/.gemini/antigravity/builtin/ files or checksums.
const SWARM_SCRIPT = /*@AGY_ZH_SWARM_SCRIPT@*/ '';
let installed = false;

function isLoopbackUrl(u) {
  return typeof u === 'string' && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(u);
}

function install() {
  if (installed || !SWARM_SCRIPT) return;
  installed = true;
  try {
    const electron = require('electron');
    const app = electron && electron.app;
    const webFrameMain = electron && electron.webFrameMain;
    if (!app || typeof app.on !== 'function') return;

    app.on('web-contents-created', (_event, contents) => {
      if (!contents || typeof contents.on !== 'function') return;
      contents.on('did-frame-finish-load', (event, isMainFrame, frameProcessId, frameRoutingId) => {
        if (isMainFrame) return;
        try {
          const frame = (event && event.frame) ||
            (webFrameMain && typeof webFrameMain.fromId === 'function' ? webFrameMain.fromId(frameProcessId, frameRoutingId) : null);
          if (!frame || (typeof frame.isDestroyed === 'function' && frame.isDestroyed())) return;
          if (!isLoopbackUrl(frame.url)) return;
          frame.executeJavaScript(SWARM_SCRIPT, false).catch(() => {});
        } catch {}
      });
    });
  } catch {}
}

module.exports = { install };
