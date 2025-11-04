(function () {
  const LIFF_ID = window.APP_CONFIG?.LIFF_ID ?? '';

  function setupPorts() {
    if (!window.app) {
      console.error('Elm app not found.');
      return;
    }
    if (!window.app.ports) {
      console.error('Elm app has no ports.');
      return;
    }
    if (!LIFF_ID) {
      console.error('LIFF_ID is not configured.');
    }

    async function getFreshIdToken() {
      await liff.init({ liffId: LIFF_ID });

      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href });
        return null; // リダイレクト
      }

      const idToken = liff.getIDToken();
      if (!idToken) throw new Error('Failed to get idToken');
      return idToken;
    }

    // Elm → JS
    window.app.ports.liffRequest.subscribe(async (action) => {
      if (action === 'init') {
        try {
          const idToken = await getFreshIdToken();
          if (!idToken) return; // リダイレクト中
          window.app.ports.liffResponse.send({ idToken });
        } catch (err) {
          console.error(err);
          alert('LIFF初期化に失敗しました: ' + (err.message || String(err)));
        }
      } else if (action === 'close') {
        try {
          liff.closeWindow();
        } catch (e) {
          console.error(e);
          alert('アプリを閉じられませんでした。');
        }
      }
    });
  }

  // Wait until Elm app and its ports are actually available.
  // Some environments / ordering cause DOMContentLoaded listeners to run in an order
  // that makes initialization racey; poll briefly for robustness.
  function waitForElmPorts(timeoutMs = 3000, intervalMs = 50) {
    var waited = 0;
    if (window.app && window.app.ports) {
      setupPorts();
      return;
    }
    var id = setInterval(function () {
      if (window.app && window.app.ports) {
        clearInterval(id);
        setupPorts();
        return;
      }
      waited += intervalMs;
      if (waited >= timeoutMs) {
        clearInterval(id);
        console.error('Timed out waiting for Elm app ports.');
      }
    }, intervalMs);
  }

  // Start waiting after DOM is parsed so that scripts which rely on DOM can run.
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    waitForElmPorts();
  } else {
    window.addEventListener('DOMContentLoaded', function () { waitForElmPorts(); });
  }
})();