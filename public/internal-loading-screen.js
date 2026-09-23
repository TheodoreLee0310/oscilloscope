(function () {
  const STYLE_ID = 'internal-loading-screen-style';
  const ROOT_ID = 'internal-loading-screen';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        inset: 0;
        z-index: 4000;
        display: flex;
        align-items: center;
        justify-content: center;
        background:
          radial-gradient(circle at top, rgba(124, 176, 255, 0.16), transparent 36%),
          radial-gradient(circle at bottom, rgba(68, 118, 214, 0.18), transparent 32%),
          linear-gradient(180deg, #08111d 0%, #0c1726 52%, #070d16 100%);
        overflow: hidden;
        opacity: 1;
        transition: opacity .35s ease, visibility .35s ease;
      }

      #${ROOT_ID}.is-hidden {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }

      #${ROOT_ID}::before,
      #${ROOT_ID}::after {
        content: '';
        position: absolute;
        inset: 0;
      }

      #${ROOT_ID}::before {
        background:
          repeating-linear-gradient(
            0deg,
            rgba(126, 174, 255, 0.18) 0 2px,
            transparent 2px 48px
          ),
          repeating-linear-gradient(
            90deg,
            rgba(126, 174, 255, 0.14) 0 2px,
            transparent 2px 48px
          );
        mask-image: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, .9) 15%, rgba(0, 0, 0, .9) 85%, transparent 100%);
        opacity: .52;
      }

      #${ROOT_ID}::after {
        background: linear-gradient(90deg, transparent 0%, rgba(132, 191, 255, 0.24) 48%, transparent 100%);
        transform: translateX(-100%);
        animation: internal-loading-scan 2.2s linear infinite;
        opacity: .75;
      }

      #${ROOT_ID} .loading-panel {
        position: relative;
        width: min(460px, calc(100vw - 48px));
      }

      #${ROOT_ID} .eyebrow {
        margin-bottom: 10px;
        color: #9bbcff;
        font: 600 12px/1.2 Consolas, 'Courier New', monospace;
        letter-spacing: .28em;
        text-transform: uppercase;
      }

      #${ROOT_ID} .status {
        margin-top: 12px;
        color: rgba(224, 234, 255, 0.86);
        font: 400 14px/1.6 'Segoe UI', sans-serif;
        min-height: 1.6em;
      }

      #${ROOT_ID} .meter {
        position: relative;
        margin-top: 18px;
        height: 8px;
        border-radius: 999px;
        overflow: hidden;
        background: rgba(111, 152, 225, 0.12);
        border: 1px solid rgba(146, 184, 255, 0.18);
      }

      #${ROOT_ID} .meter-bar {
        width: 38%;
        height: 100%;
        border-radius: inherit;
        background:
          linear-gradient(90deg, rgba(90, 126, 210, 0.18) 0%, #79a7ff 38%, #d7e5ff 100%);
        box-shadow: 0 0 14px rgba(121, 167, 255, 0.38);
        animation: internal-loading-meter 1.3s ease-in-out infinite;
        transform-origin: left center;
      }

      @keyframes internal-loading-meter {
        0%, 100% { transform: scaleX(.35); opacity: .7; }
        50% { transform: scaleX(1); opacity: 1; }
      }

      @keyframes internal-loading-scan {
        from { transform: translateX(-100%); }
        to { transform: translateX(100%); }
      }
    `;

    document.head.appendChild(style);
  }

  function createInternalLoadingScreen() {
    ensureStyles();

    const existing = document.getElementById(ROOT_ID);
    if (existing) {
      existing.remove();
    }

    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="loading-panel">
        <div class="eyebrow">CRT INTERNAL MODEL</div>
        <div class="status">正在准备三维场景...</div>
        <div class="meter"><div class="meter-bar"></div></div>
      </div>
    `;

    document.body.appendChild(root);

    const statusNode = root.querySelector('.status');

    return {
      setStatus(message) {
        if (statusNode) {
          statusNode.textContent = message;
        }
      },
      complete(message) {
        if (statusNode && message) {
          statusNode.textContent = message;
        }
        window.setTimeout(() => {
          root.classList.add('is-hidden');
          window.setTimeout(() => root.remove(), 360);
        }, 120);
      },
      fail(message) {
        if (statusNode && message) {
          statusNode.textContent = message;
        }
      },
    };
  }

  function boot() {
    window.__internalLoadingScreen = createInternalLoadingScreen();
  }

  if (document.body) {
    boot();
  } else {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  }
})();
