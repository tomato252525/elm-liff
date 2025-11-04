(async () => {
    const liffId = '2008402680-ZPy9zpAq';
    const root = document.getElementById('app');
  
    try {
      await liff.init({ liffId });
  
      if (!liff.isLoggedIn()) {
        // 明示的に openid のみを要求
        liff.login({
          redirectUri: window.location.href,
          scope: ['openid']
        });
        return;
      }
  
      // IDトークンから userId を取得（"Uxxxxxxxx..." 形式）
      const decoded = liff.getDecodedIDToken(); // 要 scope: openid
      const userId = decoded?.sub ?? '';
  
      Elm.Main.init({
        node: root,
        flags: { userId }
      });
    } catch (err) {
      console.error('LIFF initialization failed:', err);
      root.textContent = 'LIFFの初期化に失敗しました。コンソールを確認してください。';
    }
  })();