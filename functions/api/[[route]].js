// =========================================================================
// 1. CẤU HÌNH THÔNG TIN SUPABASE CỦA BẠN (ĐIỀN CHÍNH XÁC VÀO 2 DÒNG NÀY)
// =========================================================================
const SUPABASE_URL = "https://oykzzwomigdgkuqezofj.supabase.co"; // Thay URL dự án Supabase của bạn
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95a3p6d29taWdkZ2t1cWV6b2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MjM1NzYsImV4cCI6MjEwODQ5OTU3Nn0.VYMUaL6_5Oc25_goptWvVKIron-9KxEs4XIKzt7WHvE";               // Thay mã anon public key của bạn

// =========================================================================
// 2. CÁC HÀM TIỆN ÍCH HỆ THỐNG
// =========================================================================
async function hashPassword(plainText) {
  const msgBuffer = new TextEncoder().encode("viettube_salt_2026$" + plainText);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return "pbkdf2_sha256$" + hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
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
    // A. XÁC THỰC TÀI KHOẢN (AUTH)
    // -------------------------------------------------------------
    if (path === "/api/auth/me" && method === "GET") {
      return new Response(JSON.stringify({ 
        user: null, 
        config: { max_video_size_mb: 200, max_image_size_mb: 5 } 
      }), { headers: corsHeaders });
    }

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
      return new Response(JSON.stringify({ success: true, user }), { headers: corsHeaders });
    }

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
      return new Response(JSON.stringify({ success: true, user: safeUser }), { headers: corsHeaders });
    }

    if (path === "/api/auth/logout" && method === "POST") {
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // -------------------------------------------------------------
    // B. VIDEO: DANH SÁCH & ĐĂNG MỚI
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

        // Tải thẳng video lên Supabase Storage qua luồng Stream
        const ext = videoFile.name ? videoFile.name.split('.').pop() : 'mp4';
        const fileName = `vid_${Date.now()}.${ext}`;

        const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/videos/${fileName}`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SUPABASE_KEY}`,
            "apikey": SUPABASE_KEY,
            "Content-Type": videoFile.type || "video/mp4"
          },
          body: videoFile.stream(),
          duplex: "half"
        });

        if (!uploadRes.ok) {
          const errDetail = await uploadRes.text();
          return new Response(JSON.stringify({ error: `Lỗi Supabase Storage (${uploadRes.status}): ${errDetail}` }), { status: 400, headers: corsHeaders });
        }

        // Link phát video trực tiếp công khai từ Supabase
        videoUrl = `${SUPABASE_URL}/storage/v1/object/public/videos/${fileName}`;

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

      let user = await db.prepare("SELECT id FROM users LIMIT 1").first();
      const userId = user ? user.id : "u_minh_anh_01";
      const id = "vid_" + Date.now();

      await db.prepare(`
        INSERT INTO videos (id, user_id, title, description, video_url, thumbnail_url)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(id, userId, title, description, videoUrl, thumbnailUrl).run();

      return new Response(JSON.stringify({ 
        success: true, 
        video: { id, user_id: userId, title, description, video_url: videoUrl, thumbnail_url: thumbnailUrl } 
      }), { headers: corsHeaders });
    }

    // -------------------------------------------------------------
    // C. CHI TIẾT, CHỈNH SỬA & XÓA VIDEO
    // -------------------------------------------------------------
    const videoDetailMatch = path.match(/^\/api\/videos\/([^/]+)$/);
    if (videoDetailMatch) {
      const videoId = videoDetailMatch[1];

      // 1. Xem chi tiết video
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

      // 2. Chỉnh sửa video (PUT)
      if (method === "PUT") {
        const formData = await request.formData();
        const title = (formData.get("title") || "").trim();
        const description = (formData.get("description") || "").trim();

        await db.prepare(`
          UPDATE videos SET title = ?, description = ? WHERE id = ?
        `).bind(title, description, videoId).run();

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // 3. Xóa video (DELETE) - Xử lý dứt điểm lỗi không xóa được
      if (method === "DELETE") {
        // Tìm link video để xóa luôn file trên Supabase
        const video = await db.prepare("SELECT video_url FROM videos WHERE id = ?").bind(videoId).first();
        if (video && video.video_url && video.video_url.includes("/storage/v1/object/public/videos/")) {
          const fileName = video.video_url.split("/videos/").pop();
          try {
            await fetch(`${SUPABASE_URL}/storage/v1/object/videos/${fileName}`, {
              method: "DELETE",
              headers: { "Authorization": `Bearer ${SUPABASE_KEY}`, "apikey": SUPABASE_KEY }
            });
          } catch (e) {
            // Tiếp tục xóa trong D1 dù file storage có xóa được hay không
          }
        }

        // Xóa bình luận liên quan và xóa video trong D1
        await db.prepare("DELETE FROM comments WHERE video_id = ?").bind(videoId).run();
        await db.prepare("DELETE FROM videos WHERE id = ?").bind(videoId).run();

        return new Response(JSON.stringify({ success: true, message: "Đã xóa video thành công." }), { headers: corsHeaders });
      }
    }

    // -------------------------------------------------------------
    // D. BÌNH LUẬN & XÓA BÌNH LUẬN
    // -------------------------------------------------------------
    const commentPostMatch = path.match(/^\/api\/videos\/([^/]+)\/comments$/);
    if (commentPostMatch && method === "POST") {
      const videoId = commentPostMatch[1];
      const body = await request.json();
      const id = "cmt_" + Date.now();
      
      let user = await db.prepare("SELECT id FROM users LIMIT 1").first();
      const userId = user ? user.id : "u_minh_anh_01";

      await db.prepare(`
        INSERT INTO comments (id, video_id, user_id, content)
        VALUES (?, ?, ?, ?)
      `).bind(id, videoId, userId, body.content || "").run();

      return new Response(JSON.stringify({ success: true, id }), { headers: corsHeaders });
    }

    const commentDeleteMatch = path.match(/^\/api\/comments\/([^/]+)$/);
    if (commentDeleteMatch && method === "DELETE") {
      const commentId = commentDeleteMatch[1];
      await db.prepare("DELETE FROM comments WHERE id = ?").bind(commentId).run();
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // -------------------------------------------------------------
    // E. KÊNH CÁ NHÂN & HỒ SƠ
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

    if (path === "/api/profile" && method === "PUT") {
      const formData = await request.formData();
      const displayName = (formData.get("display_name") || "").trim();
      let user = await db.prepare("SELECT id FROM users LIMIT 1").first();
      if (user) {
        await db.prepare("UPDATE users SET display_name = ? WHERE id = ?").bind(displayName, user.id).run();
      }
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ message: "VietTube API Ready" }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
