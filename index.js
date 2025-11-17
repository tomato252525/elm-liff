import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

(function () {
  const liffId = '2008402680-ZPy9zpAq';
  
  // Supabaseクライアントのセットアップ
  const supabaseUrl = 'https://uxpyevttkvycivvvqycl.supabase.co'
  const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4cHlldnR0a3Z5Y2l2dnZxeWNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzNzYzNTQsImV4cCI6MjA3ODk1MjM1NH0.oJL3eCCwqJ1TK6ysJkllqYVrm2NhZmo-lMCdUm3_840'

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

    // ユーザ名登録処理
    app.ports.usernameRegistrationRequest?.subscribe(async ({ name, lineUserId }) => {
      if (!db) {
        sendError('DB client is not initialized');
        return;
      }

      try {
        const { data, error } = await db
          .from('users')
          .update({ name })
          .eq('line_user_id', lineUserId)
          .select('id, name, role, line_user_id')
          .single();

        if (error) throw error;
        if (!data) {
          sendError('更新後のユーザデータが取得できませんでした。');
        }

        app.ports.usernameRegistrationResponse?.send(data);
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
            app.ports.deliverVerificationResult.send(user);
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