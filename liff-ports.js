(function () {
  const LIFF_ID = window.APP_CONFIG?.LIFF_ID ?? '';

  if (!window.app) {
    console.error('Elm app not found.');
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
})();