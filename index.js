// index.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

(function () {
  const liffId = '2008402680-ZPy9zpAq';
  
  // Supabaseクライアントのセットアップ
  const supabaseUrl = 'https://wgwkugelwynyzftcrcfd.supabase.co'
  const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indnd2t1Z2Vsd3lueXpmdGNyY2ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MTMwNjgsImV4cCI6MjA3ODQ4OTA2OH0.WPUZs19aQ-aKZDPgBjf__9ivKxxaGZdX5CCuQuyKDmg'
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  window.addEventListener('DOMContentLoaded', () => {
    const node = document.getElementById('root');
    if (!node) {
      console.error('Mount node #root が見つかりません。');
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
      .then(async () => {
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        // IDトークンを取得
        const idToken = liff.getIDToken();
        if (!idToken) {
          sendError('IDトークンを取得できませんでした。');
          return;
        }

        // Supabase Edge Functionを呼び出し
        const { data, error } = await supabase.functions.invoke('verify-liff-token', {
          body: { idToken }
        });

        if (error) {
          sendError(`検証エラー: ${error.message}`);
          return;
        }

        if (data.success && data.userId) {
          app.ports.deliverVerificationResult.send({
            success: true,
            userId: data.userId,
            message: data.message
          });
        } else {
          sendError(data.error || '検証に失敗しました。');
        }
      })
      .catch(sendError);
  });
})();