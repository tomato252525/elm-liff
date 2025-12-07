import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

(function () {
  // 設定値
  const liffId = '2008402680-ZPy9zpAq';
  const supabaseUrl = 'https://uxpyevttkvycivvvqycl.supabase.co'
  const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4cHlldnR0a3Z5Y2l2dnZxeWNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzNzYzNTQsImV4cCI6MjA3ODk1MjM1NH0.oJL3eCCwqJ1TK6ysJkllqYVrm2NhZmo-lMCdUm3_840'

  let db = null;
  let currentUserId = null; // ユーザーIDを保持

  // ---------------------------------------------------------
  // 日付計算ユーティリティ
  // offsetWeeks: 0 = 今週の月曜, 1 = 来週の月曜
  // ---------------------------------------------------------
  const getMondayDate = (offsetWeeks) => {
    // 日本時間を基準にする
    const nowJST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    const dayOfWeek = nowJST.getDay(); // 0=日曜, 1=月曜...

    // 今週の月曜日までの日数を計算（日曜なら6日前、それ以外は dayOfWeek - 1 日前）
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const targetDate = new Date(nowJST);
    targetDate.setDate(nowJST.getDate() - diffToMonday + (offsetWeeks * 7));

    // YYYY-MM-DD形式に整形
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // ---------------------------------------------------------
  // ユーザー情報とシフトデータ（今週確定・来週希望・来週確定）を一括取得
  // ---------------------------------------------------------
  const fetchUserAndShifts = async (userId) => {
    const currentMonday = getMondayDate(0); // 今週の月曜
    const nextMonday = getMondayDate(1);    // 来週の月曜

    // 1. ユーザー情報の取得
    const { data: user, error: userError } = await db
      .from('users')
      .select('id, name, role, line_user_id')
      .eq('id', userId)
      .single();

    if (userError) throw userError;
    if (!user) throw new Error('ユーザが見つかりません。');

    // 2. シフトデータを並列取得 (3種類)
    const [requestsResult, currentConfirmedResult, nextConfirmedResult, templateResult] = await Promise.all([
      // A. 来週の希望シフト
      db.from('shift_requests')
        .select('id, date, start_time, end_time, exit_by_end_time, is_available')
        .eq('user_id', userId)
        .eq('week_start_date', nextMonday)
        .order('date', { ascending: true }),

      // B. 今週の確定シフト
      db.from('confirmed_shifts')
        .select('id, date, start_time, end_time, state, exit_by_end_time, note')
        .eq('cast_id', userId)
        .eq('week_start_date', currentMonday)
        .order('date', { ascending: true }),

      // C. 来週の確定シフト (公開済みの場合のみ取得できる)
      db.from('confirmed_shifts')
        .select('id, date, start_time, end_time, state, exit_by_end_time, note')
        .eq('cast_id', userId)
        .eq('week_start_date', nextMonday)
        .order('date', { ascending: true }),

      // D. テンプレート取得 (single()はデータがないとエラーになるので maybeSingle() を推奨したいが、JS SDKのverによっては .data チェックで対応)
      db.from('shift_templates').select('start_time, end_time, exit_by_end_time').eq('user_id', userId).maybeSingle()
    ]);

    if (requestsResult.error) throw requestsResult.error;
    if (currentConfirmedResult.error) throw currentConfirmedResult.error;
    if (nextConfirmedResult.error) throw nextConfirmedResult.error;
    if (templateResult.error) throw templateResult.error;

    return {
      user,
      // 今週（確定）
      current_week_start_date: currentMonday,
      current_week_shifts: currentConfirmedResult.data || [],

      // 来週（希望）
      next_week_start_date: nextMonday,
      next_week_shifts: requestsResult.data || [],

      // 来週（確定）
      next_week_confirmed_shifts: nextConfirmedResult.data || [],

      // テンプレ
      template: templateResult.data
    };
  };

  // ---------------------------------------------------------
  // メイン処理
  // ---------------------------------------------------------
  window.addEventListener('DOMContentLoaded', () => {
    const node = document.getElementById('root');
    if (!node) {
      console.error('Mount node #root が見つかりません。');
      return;
    }

    // Elmアプリの初期化
    const app = Elm.Main.init({ node });

    // エラー送信ヘルパー
    const sendError = (e) => {
      console.error(e);
      app.ports.deliverError?.send(
        typeof e === 'string' ? e : e?.message || 'Unknown error'
      );
    };

    // ----------------------------------
    // Port: データ再取得リクエスト（日付変更時用）
    // ----------------------------------
    app.ports.refreshDataRequest?.subscribe(async () => {
      if (!db || !currentUserId) {
        sendError('DB client or user ID is not available');
        return;
      }

      try {
        const result = await fetchUserAndShifts(currentUserId);
        app.ports.refreshDataResponse?.send(result);
      } catch (e) {
        sendError(e);
      }
    });

    // ----------------------------------
    // Port: ユーザ名登録処理
    // ----------------------------------
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
          .select('id')
          .single();

        if (error) throw error;
        if (!data) {
          sendError('更新後のユーザデータが取得できませんでした。');
          return;
        }

        // 更新後の全データを再取得してElmへ
        const result = await fetchUserAndShifts(data.id);
        app.ports.usernameRegistrationResponse?.send(result);
      } catch (e) {
        sendError(e);
      }
    });

    // ----------------------------------
    // Port: シフト提出・更新処理
    // ----------------------------------
    app.ports.shiftSubmitRequest?.subscribe(async (payload) => {
      if (!db) {
        sendError('DB client is not initialized');
        return;
      }

      try {
        // Elm側から送られてくるプロパティ名に合わせて分割代入
        // ※Elm側で next_week_start_date という名前で送る想定
        const { user_id, next_week_start_date, shifts } = payload;

        const shiftsToUpsert = shifts.map(shift => ({
          user_id,
          date: shift.date,
          start_time: shift.start_time,
          end_time: shift.end_time,
          is_available: shift.is_available,
          week_start_date: next_week_start_date, // DBのカラム名は week_start_date
          exit_by_end_time: shift.exit_by_end_time
        }));

        const { error: upsertError } = await db
          .from('shift_requests')
          .upsert(shiftsToUpsert, {
            onConflict: 'user_id,date',
            ignoreDuplicates: false
          });

        if (upsertError) throw upsertError;

        // 更新後の全データを再取得してElmへ
        const result = await fetchUserAndShifts(user_id);
        app.ports.shiftSubmitResponse?.send(result);
      } catch (e) {
        sendError(e);
      }
    });

    // ----------------------------------
    // Port: テンプレート保存処理
    // ----------------------------------
    app.ports.saveTemplateRequest?.subscribe(async (templateData) => {
      if (!db || !currentUserId) return;
      try {
        const { error } = await db
          .from('shift_templates')
          .upsert({
            user_id: currentUserId,
            start_time: templateData.start_time,
            end_time: templateData.end_time,
            exit_by_end_time: templateData.exit_by_end_time,
            updated_at: new Date()
          });

        if (error) throw error;

        // 保存完了後、最新データを再取得して返す
        const result = await fetchUserAndShifts(currentUserId);
        app.ports.saveTemplateResponse?.send(result);
      } catch (e) {
        sendError(e);
      }
    });

    // ----------------------------------
    // Port: テンプレート削除処理 (NEW)
    // ----------------------------------
    app.ports.deleteTemplateRequest?.subscribe(async () => {
      if (!db || !currentUserId) return;
      try {
        const { error } = await db
          .from('shift_templates')
          .delete()
          .eq('user_id', currentUserId);

        if (error) throw error;

        // 削除後、最新データを再取得して返す（保存時と同じポートを再利用）
        const result = await fetchUserAndShifts(currentUserId);
        app.ports.saveTemplateResponse?.send(result);
      } catch (e) {
        sendError(e);
      }
    });

    // ----------------------------------
    // LIFF初期化 & 認証フロー
    // ----------------------------------
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

        const idToken = liff.getIDToken();
        if (!idToken) {
          sendError('IDトークンを取得できませんでした。');
          return;
        }

        try {
          // Edge Functionで検証してカスタムトークンを取得
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
            const errorMessage = result.error || result.message || 'Token verification failed';

            // IDトークン期限切れ時の再ログイン処理
            if (errorMessage === 'id_token_expired') {
              const url = new URL(location.href);
              const retried = url.searchParams.get('relogin') === '1';

              if (!retried) {
                await liff.logout();
                url.searchParams.set('relogin', '1');
                location.href = url.toString();
                return;
              } else {
                sendError('ログイン情報の有効期限が切れています。ブラウザを閉じて再度お試しください。');
                return;
              }
            }

            // エラーハンドリング
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

          // 認証済みクライアントを作成
          db = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          });

          if (user && token) {
            // ユーザーIDを保持
            currentUserId = user.id;

            // 初期データを取得してElmへ送信
            const data = await fetchUserAndShifts(user.id);
            app.ports.deliverVerificationResult.send(data);
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
