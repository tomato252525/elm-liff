import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

(function () {
  const liffId = '2008402680-ZPy9zpAq';
  
  // Supabaseクライアントのセットアップ
  const supabaseUrl = 'https://wgwkugelwynyzftcrcfd.supabase.co'
  const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indnd2t1Z2Vsd3lueXpmdGNyY2ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MTMwNjgsImV4cCI6MjA3ODQ4OTA2OH0.WPUZs19aQ-aKZDPgBjf__9ivKxxaGZdX5CCuQuyKDmg'

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

    // Port: DB操作のサンプル(Elmから呼び出される)
    app.ports.fetchUserData?.subscribe(async (userId) => {
      if (!db) {
        sendError('DB client is not initialized');
        return;
      }

      try {
        const { data, error } = await db
          .from('users')
          .select('*')
          .eq('id', userId)
          .single();

        if (error) throw error;

        app.ports.receiveUserData?.send(data.id);
      } catch (e) {
        sendError(e);
      }
    });

    liff
      .init({ 
        liffId,
        withLoginOnExternalBrowser: true,
      })
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

        // fetch APIを直接使用してエラー詳細を取得
        try {
          const response = await fetch(
            `${supabaseUrl}/functions/v1/verify-liff-token`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseAnonKey}`
              },
              body: JSON.stringify({ idToken })
            }
          );

          const result = await response.json();

          if (!response.ok) {
            // エラーレスポンスの詳細を取得
            const errorMessage = result.error || result.message || 'Token verification failed';
            
            // エラータイプに応じたメッセージ
            const errorMessages = {
              'account_deactivated': 'アカウントが無効化されています。',
              'nonce_mismatch': 'セキュリティ検証に失敗しました。',
              'no_sub_in_id_token': 'トークンが無効です。',
              'select_failed': 'ユーザー情報の取得に失敗しました。',
              'insert_failed': 'ユーザー登録に失敗しました。',
              'idToken is required': 'トークンが必要です。',
            };

            sendError(`検証エラー: ${errorMessages[errorMessage] || errorMessage}`);
            return;
          }

          const token = result.token;
          const user = result.user;

          // DB操作用クライアントを作成(Authorization: Bearer <token> を付与)
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
            sendError('検証に失敗しました。');
          }
        } catch (e) {
          sendError(`ネットワークエラー: ${e.message}`);
        }
      })
      .catch(sendError);
  });
})();