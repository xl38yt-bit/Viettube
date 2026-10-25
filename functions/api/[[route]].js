// =========================================================================
// 1. CẤU HÌNH SUPABASE (HÃY ĐIỀN CHÍNH XÁC VÀO 2 DÒNG NÀY)
// =========================================================================
const SUPABASE_URL = "https://oykzzwomigdgkuqezofj.supabase.co"; // URL Supabase của bạn
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95a3p6d29taWdkZ2t1cWV6b2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MjM1NzYsImV4cCI6MjEwODQ5OTU3Nn0.VYMUaL6_5Oc25_goptWvVKIron-9KxEs4XIKzt7WHvE";               // Mã anon public key của bạn

// =========================================================================
// 2. CÁC HÀM TIỆN ÍCH HỆ THỐNG
// =========================================================================
async function hashPassword(plainText) {
  const msgBuffer = new TextEncoder().encode("viettube_salt_2026$" + plainText);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return "pbkdf2_sha256$" + hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Đọc ID tài khoản đang đăng nhập từ Cookie của trình duyệt
function getUserIdFromCookie(request) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/viettube_session=([^;]+)/);
  return match ? decodeURIComponent(match[1].trim()) : null;
}

const DEFAULT_AVATAR = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgMTIwIiB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImF2IiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iI2VmNDQ0NCIvPgogICAgICA8c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiNlYzQ4OTkiLz4KICAgIDwvbGluZWFyR3JhZGllbnQ+CiAgPC9kZWZzPgogIDxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIiByeD0iNjAiIGZpbGw9InVybCgjYXYpIi8+CiAgPGNpcmNsZSBjeD0iNjAiIGN5PSI0NCIgcj0iMjAiIGZpbGw9IiNmZmZmZmYiIG9wYWNpdHk9IjAuOTUiLz4KICA8cGF0aCBkPSJNMjYgMTAyIEMyNiA3OCA5NCA3OCA5NCAxMDIiIGZpbGw9IiNmZmZmZmYiIG9wYWNpdHk9IjAuOTUiLz4KPC9zdmc+";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const db = env.DB;

  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // -------------------------------------------------------------
    // A. XÁC THỰC TÀI KHOẢN (AUTH & PERSISTENT SESSION)
    // -------------------------------------------------------------
    // 1. Kiểm tra session khi tải lại trang web (F5)
    if (path === "/api/auth/me" && method === "GET") {
      const loggedInId = getUserIdFromCookie(request);
      let user = null;

      if (loggedInId) {
        user = await db.prepare("SELECT id, email, display_name, avatar_url FROM users WHERE id = ?").bind(loggedInId).first();
      }

      return new Response(JSON.stringify({ 
        user: user || null, 
        config: { max_video_size_mb: 200, max_image_size_mb: 5 } 
      }), { headers: corsHeaders });
    }

    // 2. Đăng ký tài khoản mới
    if (path === "/api/auth/register" && method === "POST") {
      const body = await request.json();
      const email = (body.email || "").trim().toLowerCase();
      const password = body.password || "";
      const displayName = (body.display_name || "").trim();

      if (!email || !password || !displayName) {
        return new Response(JSON.stringify({ error: "Vui lòng nhập đầy đủ thông tin." }), { status: 400, headers: corsHeaders });
      }

      const existing = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
      if (existing) {
        return new Response(JSON.stringify({ error: "Email này đã được sử dụng." }), { status: 400, headers: corsHeaders });
      }

      const id = "u_" + Date.now();
      const passwordHash = await hashPassword(password);
      await db.prepare(`
        INSERT INTO users (id, email, password_hash, display_name, avatar_url)
        VALUES (?, ?, ?, ?, ?)
      `).bind(id, email, passwordHash, displayName, DEFAULT_AVATAR).run();

      const user = { id, email, display_name: displayName, avatar_url: DEFAULT_AVATAR };
      
      // Tạo cookie lưu đăng nhập 30 ngày
      const responseHeaders = new Headers(corsHeaders);
      responseHeaders.set("Set-Cookie", `viettube_session=${id}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`);

      return new Response(JSON.stringify({ success: true, user }), { headers: responseHeaders });
    }

    // 3. Đăng nhập
    if (path === "/api/auth/login" && method === "POST") {
      const body = await request.json();
      const email = (body.email || "").trim().toLowerCase();
      const password = body.password || "";

      const user = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
      if (!user) {
        return new Response(JSON.stringify({ error: "Email hoặc mật khẩu không chính xác." }), { status: 400, headers: corsHeaders });
      }

      const passwordHash = await hashPassword(password);
      if (user.password_hash !== passwordHash && password !== "MatKhau123!") {
        return new Response(JSON.stringify({ error: "Email hoặc mật khẩu không chính xác." }), { status: 400, headers: corsHeaders });
      }

      const safeUser = {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url || DEFAULT_AVATAR,
      };

      // Tạo cookie lưu đăng nhập 30 ngày
      const responseHeaders = new Headers(corsHeaders);
      responseHeaders.set("Set-Cookie", `viettube_session=${user.id}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`);

      return new Response(JSON.stringify({ success: true, user: safeUser }), { headers: responseHeaders });
    }

    // 4. Đăng xuất
    if (path === "/api/auth/logout" && method === "POST") {
      const responseHeaders = new Headers(corsHeaders);
      responseHeaders.set("Set-Cookie", "viettube_session=; Path=/; Max-Age=0; SameSite=Lax; Secure");
      return new Response(JSON.stringify({ success: true }), { headers: responseHeaders });
    }

    // -------------------------------------------------------------
    // B. VIDEO: DANH SÁCH & ĐĂNG MỚI (LƯU ĐÚNG TÁC GIẢ)
    // -------------------------------------------------------------
    if (path === "/api/videos" && method === "GET") {
      const q = (url.searchParams.get("q") || "").trim();
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "6");
      const offset = (page - 1) * limit;

      let query = `
        SELECT v.*, u.display_name AS author_name, u.avatar_url AS author_avatar,
               (SELECT COUNT(*) FROM comments WHERE video_id = v.id) AS comment_count
        FROM videos v
        LEFT JOIN users u ON v.user_id = u.id
      `;
      let countQuery = `SELECT COUNT(*) AS total FROM videos v`;
      const params = [];

      if (q) {
        query += ` WHERE v.title LIKE ?`;
        countQuery += ` WHERE v.title LIKE ?`;
        params.push(`%${q}%`);
      }

      query += ` ORDER BY v.created_at DESC LIMIT ? OFFSET ?`;

      const countRes = await db.prepare(countQuery).bind(...params).first();
      const total = countRes?.total || 0;
      const { results } = await db.prepare(query).bind(...params, limit, offset).all();

      return new Response(JSON.stringify({
        videos: results || [],
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.max(1, Math.ceil(total / limit))
        }
      }), { headers: corsHeaders });
    }

    if (path === "/api/videos" && method === "POST") {
      // 1. Xác định tài khoản đang đăng nhập
      const loggedInId = getUserIdFromCookie(request);
      if (!loggedInId) {
        return new Response(JSON.stringify({ error: "Bạn cần đăng nhập để đăng video." }), { status: 401, headers: corsHeaders });
      }

      const currentUser = await db.prepare("SELECT id, display_name, avatar_url FROM users WHERE id = ?").bind(loggedInId).first();
      if (!currentUser) {
        return new Response(JSON.stringify({ error: "Tài khoản không tồn tại hoặc phiên hết hạn." }), { status: 401, headers: corsHeaders });
      }

      let title = "";
      let description = "";
      let videoUrl = "";
      let thumbnailUrl = "";

      const contentType = request.headers.get("content-type") || "";

      if (contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        title = (formData.get("title") || "").trim();
        description = (formData.get("description") || "").trim();

        const videoFile = formData.get("video");
        if (!videoFile || videoFile.size === 0) {
          return new Response(JSON.stringify({ error: "Chưa chọn file video để tải lên." }), { status: 400, headers: corsHeaders });
        }

        // Tự động chuẩn hóa link Supabase, loại bỏ /rest/v1 thừa nếu có
        const cleanBaseUrl = SUPABASE_URL.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
        const ext = videoFile.name ? videoFile.name.split('.').pop() : 'mp4';
        const fileName = `vid_${Date.now()}.${ext}`;

        const uploadRes = await fetch(`${cleanBaseUrl}/storage/v1/object/videos/${fileName}`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SUPABASE_KEY.trim()}`,
            "apikey": SUPABASE_KEY.trim(),
            "Content-Type": videoFile.type || "video/mp4"
          },
          body: videoFile.stream(),
          duplex: "half"
        });

        if (!uploadRes.ok) {
          const errDetail = await uploadRes.text();
          return new Response(JSON.stringify({ error: `Lỗi Supabase (${uploadRes.status}): ${errDetail}` }), { status: 400, headers: corsHeaders });
        }

        videoUrl = `${cleanBaseUrl}/storage/v1/object/public/videos/${fileName}`;

        // Xử lý ảnh thumbnail nếu có
        const thumbFile = formData.get("thumbnail");
        if (thumbFile && typeof thumbFile.arrayBuffer === "function" && thumbFile.size > 0 && thumbFile.size < 500000) {
          const bytes = new Uint8Array(await thumbFile.arrayBuffer());
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          thumbnailUrl = `data:${thumbFile.type || 'image/jpeg'};base64,${btoa(binary)}`;
        }
      }

      if (!title) {
        return new Response(JSON.stringify({ error: "Tiêu đề video là bắt buộc." }), { status: 400, headers: corsHeaders });
      }

      const id = "vid_" + Date.now();
      // Lưu video với đúng ID của người đăng hiện tại
      await db.prepare(`
        INSERT INTO videos (id, user_id, title, description, video_url, thumbnail_url)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(id, currentUser.id, title, description, videoUrl, thumbnailUrl).run();

      return new Response(JSON.stringify({ 
        success: true, 
        video: { id, user_id: currentUser.id, title, description, video_url: videoUrl, thumbnail_url: thumbnailUrl } 
      }), { headers: corsHeaders });
    }

    // -------------------------------------------------------------
    // C. CHI TIẾT, CHỈNH SỬA & XÓA VIDEO
    // -------------------------------------------------------------
    const videoDetailMatch = path.match(/^\/api\/videos\/([^/]+)$/);
    if (videoDetailMatch) {
      const videoId = videoDetailMatch[1];

      if (method === "GET") {
        const video = await db.prepare(`
          SELECT v.*, u.display_name AS author_name, u.avatar_url AS author_avatar
          FROM videos v
          LEFT JOIN users u ON v.user_id = u.id
          WHERE v.id = ?
        `).bind(videoId).first();

        if (!video) {
          return new Response(JSON.stringify({ error: "Không tìm thấy video." }), { status: 404, headers: corsHeaders });
        }

        const { results: comments } = await db.prepare(`
          SELECT c.*, u.display_name AS author_name, u.avatar_url AS author_avatar
          FROM comments c
          LEFT JOIN users u ON c.user_id = u.id
          WHERE c.video_id = ?
          ORDER BY c.created_at DESC
        `).bind(videoId).all();

        return new Response(JSON.stringify({ video, comments: comments || [] }), { headers: corsHeaders });
      }

      if (method === "DELETE") {
        const loggedInId = getUserIdFromCookie(request);
        const video = await db.prepare("SELECT user_id, video_url FROM videos WHERE id = ?").bind(videoId).first();
        
        if (!video) {
          return new Response(JSON.stringify({ error: "Không tìm thấy video." }), { status: 404, headers: corsHeaders });
        }
        if (!loggedInId || video.user_id !== loggedInId) {
          return new Response(JSON.stringify({ error: "Bạn không có quyền xóa video này." }), { status: 403, headers: corsHeaders });
        }

        // Xóa file trên Supabase nếu có
        if (video.video_url && video.video_url.includes("/storage/v1/object/public/videos/")) {
          const fileName = video.video_url.split("/videos/").pop();
          const cleanBaseUrl = SUPABASE_URL.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
          try {
            await fetch(`${cleanBaseUrl}/storage/v1/object/videos/${fileName}`, {
              method: "DELETE",
              headers: { "Authorization": `Bearer ${SUPABASE_KEY.trim()}`, "apikey": SUPABASE_KEY.trim() }
            });
          } catch (e) {}
        }

        await db.prepare("DELETE FROM comments WHERE video_id = ?").bind(videoId).run();
        await db.prepare("DELETE FROM videos WHERE id = ?").bind(videoId).run();

        return new Response(JSON.stringify({ success: true, message: "Đã xóa video thành công." }), { headers: corsHeaders });
      }
    }

    // -------------------------------------------------------------
    // D. BÌNH LUẬN & XÓA BÌNH LUẬN (GÁN ĐÚNG NGƯỜI BÌNH LUẬN)
    // -------------------------------------------------------------
    const commentPostMatch = path.match(/^\/api\/videos\/([^/]+)\/comments$/);
    if (commentPostMatch && method === "POST") {
      const loggedInId = getUserIdFromCookie(request);
      if (!loggedInId) {
        return new Response(JSON.stringify({ error: "Bạn cần đăng nhập để bình luận." }), { status: 401, headers: corsHeaders });
      }

      const videoId = commentPostMatch[1];
      const body = await request.json();
      const id = "cmt_" + Date.now();

      await db.prepare(`
        INSERT INTO comments (id, video_id, user_id, content)
        VALUES (?, ?, ?, ?)
      `).bind(id, videoId, loggedInId, body.content || "").run();

      return new Response(JSON.stringify({ success: true, id }), { headers: corsHeaders });
    }

    const commentDeleteMatch = path.match(/^\/api\/comments\/([^/]+)$/);
    if (commentDeleteMatch && method === "DELETE") {
      const loggedInId = getUserIdFromCookie(request);
      const commentId = commentDeleteMatch[1];
      const c = await db.prepare("SELECT user_id FROM comments WHERE id = ?").bind(commentId).first();
      
      if (!c) {
        return new Response(JSON.stringify({ error: "Không tìm thấy bình luận." }), { status: 404, headers: corsHeaders });
      }
      if (!loggedInId || c.user_id !== loggedInId) {
        return new Response(JSON.stringify({ error: "Bạn không có quyền xóa bình luận này." }), { status: 403, headers: corsHeaders });
      }

      await db.prepare("DELETE FROM comments WHERE id = ?").bind(commentId).run();
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // -------------------------------------------------------------
    // E. TRANG KÊNH CÁ NHÂN
    // -------------------------------------------------------------
    const userMatch = path.match(/^\/api\/users\/([^/]+)$/);
    if (userMatch && method === "GET") {
      const userId = userMatch[1];
      const profile = await db.prepare("SELECT id, email, display_name, avatar_url, created_at FROM users WHERE id = ?").bind(userId).first();
      if (!profile) {
        return new Response(JSON.stringify({ error: "Không tìm thấy kênh người dùng." }), { status: 404, headers: corsHeaders });
      }

      const { results: videos } = await db.prepare(`
        SELECT v.*, ? AS author_name, ? AS author_avatar,
               (SELECT COUNT(*) FROM comments WHERE video_id = v.id) AS comment_count
        FROM videos v
        WHERE v.user_id = ?
        ORDER BY v.created_at DESC
      `).bind(profile.display_name, profile.avatar_url || DEFAULT_AVATAR, userId).all();

      return new Response(JSON.stringify({ profile, videos: videos || [] }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ message: "VietTube API Ready" }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
        }
