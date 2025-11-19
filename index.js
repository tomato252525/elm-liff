import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

(function () {
  const liffId = '2008402680-ZPy9zpAq';
  
  // Supabaseクライアントのセットアップ
  const supabaseUrl = 'https://uxpyevttkvycivvvqycl.supabase.co'
  const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4cHlldnR0a3Z5Y2l2dnZxeWNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzNzYzNTQsImV4cCI6MjA3ODk1MjM1NH0.oJL3eCCwqJ1TK6ysJkllqYVrm2NhZmo-lMCdUm3_840'

  let db = null;

  // 来週の月曜日を計算する関数（日本時間基準）
  const getNextMonday = () => {
    const nowJST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    const dayOfWeek = nowJST.getDay(); // 0=日曜, 1=月曜, ..., 6=土曜
    const daysUntilNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    
    const nextMonday = new Date(nowJST);
    nextMonday.setDate(nowJST.getDate() + daysUntilNextMonday);
    
    // YYYY-MM-DD形式に変換（日本時間基準）
    const year = nextMonday.getFullYear();
    const month = String(nextMonday.getMonth() + 1).padStart(2, '0');
    const day = String(nextMonday.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // 共通のユーザ情報とシフトデータを取得する関数
  const fetchUserAndShifts = async (userId) => {
    const nextMondayDate = getNextMonday();
    
    const { data: user, error: userError } = await db
      .from('users')
      .select('id, name, role, line_user_id')
      .eq('id', userId)
      .single();

    if (userError) throw userError;
    if (!user) throw new Error('ユーザが見つかりません。');

    const { data: shifts, error: shiftsError } = await db
      .from('shift_requests')
      .select('id, date, start_time, end_time, exit_by_end_time, is_available')
      .eq('user_id', userId)
      .eq('week_start_date', nextMondayDate)
      .order('date', { ascending: true });

    if (shiftsError) throw shiftsError;

    return {
      user,
      next_week_shifts: shifts || [],
      week_start_date: nextMondayDate
    };
  };

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
          .select('id')
          .single();

        if (error) throw error;
        if (!data) {
          sendError('更新後のユーザデータが取得できませんでした。');
          return;
        }

        // 更新されたユーザ情報とシフトデータを取得
        const result = await fetchUserAndShifts(data.id);
        app.ports.usernameRegistrationResponse?.send(result);
      } catch (e) {
        sendError(e);
      }
    });

    // シフト提出・更新処理
    app.ports.shiftSubmitRequest?.subscribe(async (payload) => {
      if (!db) {
        sendError('DB client is not initialized');
        return;
      }

      try {
        const { user_id, week_start_date, shifts } = payload;

        // 新しいシフトデータを準備
        const shiftsToUpsert = shifts.map(shift => ({
          user_id,
          date: shift.date,
          start_time: shift.start_time,
          end_time: shift.end_time,
          is_available: shift.is_available,
          week_start_date,
          exit_by_end_time: shift.exit_by_end_time
        }));

        // upsert を使用（存在する場合は更新、存在しない場合は挿入）
        const { error: upsertError } = await db
          .from('shift_requests')
          .upsert(shiftsToUpsert, {
            onConflict: 'user_id,date',
            ignoreDuplicates: false
          });

        if (upsertError) throw upsertError;

        // 更新後のデータを取得して返す
        const result = await fetchUserAndShifts(user_id);
        app.ports.shiftSubmitResponse?.send(result);
      } catch (e) {
        sendError(e);
      }
    });

    liff
      .init({ 
        liffId,
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

          // DB操作用クライアントを作成
          db = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          });

          if (user && token) {
            // ユーザ情報と来週のシフトデータを取得
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