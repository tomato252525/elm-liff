// index.js
(function () {
  const liffId = '2008402680-ZPy9zpAq';

  // DOM が構築されてから実行（defer と合わせて二重保険）
  window.addEventListener('DOMContentLoaded', () => {
    const node = document.getElementById('root');
    if (!node) {
      console.error('Mount node #root が見つかりません。index.html に <div id="root"></div> を置いてください。');
      return;
    }

    const app = Elm.Main.init({ node });

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
          liff.login(); // openid スコープを LIFF コンソールで有効化しておく
          return;
        }
        const decoded = liff.getDecodedIDToken();
        const userId = decoded?.sub;
        if (userId) {
          app.ports.deliverUserId.send(userId);
        } else {
          sendError('UserID(sub) を取得できませんでした。LIFF のスコープに openid を有効化してください。');
        }
      })
      .catch(sendError);
  });
})();