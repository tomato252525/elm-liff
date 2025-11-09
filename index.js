// index.js
(function () {
  const liffId = '2008402680-ZPy9zpAq'; // ← コンソールの LIFF ID に置き換え

  const app = Elm.Main.init({ node: document.getElementById('root') });

  const sendError = (e) => {
    console.error(e);
    app.ports.deliverError?.send(
      typeof e === 'string' ? e : e?.message || 'Unknown error'
    );
  };

  liff
    .init({ liffId })
    .then(() => {
      if (!liff.isLoggedIn()) {
        // スコープはコンソール設定（openid を有効にしておく）
        liff.login();
        return;
      }

      // 追加リクエストなしでIDトークンをデコードし、sub = userId を取り出す
      const decoded = liff.getDecodedIDToken();
      const userId = decoded?.sub;

      if (userId) {
        app.ports.deliverUserId.send(userId);
      } else {
        sendError('UserID が取得できませんでした。LIFFのスコープに「openid」を有効化してください。');
      }
    })
    .catch(sendError);
})();