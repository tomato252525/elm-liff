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
    if (typeof liff === 'undefined') {
      console.error('LIFF SDK (liff) is not loaded.');
    }

    async function getFreshIdToken() {
      // Wrap init with timeout so we don't hang forever in non-LIFF environments
      if (typeof liff === 'undefined') {
        throw new Error('LIFF SDK not available');
      }

      const initPromise = liff.init({ liffId: LIFF_ID });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('liff.init timeout')), 5000));
      await Promise.race([initPromise, timeoutPromise]);

      if (!liff.isLoggedIn()) {
        console.log('Not logged in; redirecting to LIFF login...');
        liff.login({ redirectUri: window.location.href });
        return null; // リダイレクト
      }

      const idToken = liff.getIDToken();
      if (!idToken) throw new Error('Failed to get idToken');
      return idToken;
    }

    // Elm → JS
    console.log('Registering liffRequest port handler');
    var _receivedInit = false;
    window.app.ports.liffRequest.subscribe(async (action) => {
      console.log('liffRequest received:', action);
      if (action === 'init') { _receivedInit = true; }
      if (action === 'init') {
        try {
          const idToken = await getFreshIdToken();
          if (!idToken) {
            console.log('getFreshIdToken returned null (probably redirecting)');
            return; // リダイレクト中
          }
          console.log('Sending idToken to Elm (length=' + String(idToken.length) + ')');
          window.app.ports.liffResponse.send({ idToken });
        } catch (err) {
          console.error('Error during LIFF init/get token:', err);
          try {
            // Send an empty idToken so Elm receives a response and can show an error
            window.app.ports.liffResponse.send({ idToken: '' });
          } catch (e) {
            console.error('Failed to send liffResponse fallback:', e);
          }
          // Also surface an alert to help debugging in dev
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

    // If Elm sent no 'init' shortly after subscription (race where Elm's initial
    // outgoing Cmd was dropped), send a fallback empty liffResponse so Elm can
    // progress to an error state instead of remaining stuck on Loading.
    setTimeout(function () {
      if (!_receivedInit) {
        console.warn('No liffRequest received from Elm; sending fallback liffResponse');
        try {
          window.app.ports.liffResponse.send({ idToken: '' });
        } catch (e) {
          console.error('Failed to send fallback liffResponse:', e);
        }
      }
    }, 100);
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