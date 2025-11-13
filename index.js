// index.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

(function () {
  const liffId = '2008402680-ZPy9zpAq';
  
  // Supabaseクライアントのセットアップ
  const supabaseUrl = 'https://wgwkugelwynyzftcrcfd.supabase.co'
  const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indnd2t1Z2Vsd3lueXpmdGNyY2ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MTMwNjgsImV4cCI6MjA3ODQ4OTA2OH0.WPUZs19aQ-aKZDPgBjf__9ivKxxaGZdX5CCuQuyKDmg'
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  })

  let db = null;

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

    // Port: DB操作のサンプル（Elmから呼び出される）
    app.ports.fetchUserData?.subscribe(async (userId) => {
      if (!db) {
        sendError('DB client is not initialized');
        return;
      }

      try {
        const { data, error } = await db
          .from('users')
          .select('*');

        if (error) throw error;

        app.ports.receiveUserData?.send(data);
      } catch (e) {
        sendError(e);
      }
    });

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

        const token = data.token; // 12h JWT
        const user = data.user;   // 返却されたユーザー情報

        // 2) DB 操作用（Authorization: Bearer <token> を付与）
        db = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });

        if (user && token) {
          app.ports.deliverVerificationResult.send({
            success: true,
            user: user,
          });
        } else {
          sendError(data.error || '検証に失敗しました。');
        }
      })
      .catch(sendError);
  });
})();