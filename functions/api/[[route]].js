// functions/api/[[route]].js
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
    // 1. Kiểm tra trạng thái máy chủ & tài khoản
    if (path === "/api/auth/me" && method === "GET") {
      return new Response(JSON.stringify({ 
        user: null, 
        config: { max_video_size_mb: 200, max_image_size_mb: 5 } 
      }), { headers: corsHeaders });
    }

    // 2. Lấy danh sách video (Hỗ trợ tìm kiếm & phân trang)
    if (path === "/api/videos" && method === "GET") {
      const q = url.searchParams.get("q") || "";
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
        videos: results,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.max(1, Math.ceil(total / limit))
        }
      }), { headers: corsHeaders });
    }

    // 3. Đăng video mới
    if (path === "/api/videos" && method === "POST") {
      const body = await request.json();
      const id = "vid_" + Date.now();
      const userId = body.user_id || "u_guest";

      // Đảm bảo user_id tồn tại để không dính lỗi FOREIGN KEY
      await db.prepare(`
        INSERT OR IGNORE INTO users (id, email, password_hash, display_name, avatar_url)
        VALUES (?, ?, 'hash', ?, ?)
      `).bind(userId, `${userId}@viettube.vn`, body.author_name || "Người dùng", body.author_avatar || "").run();

      await db.prepare(`
        INSERT INTO videos (id, user_id, title, description, video_url, thumbnail_url)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(id, userId, body.title, body.description || "", body.video_url, body.thumbnail_url || "").run();

      return new Response(JSON.stringify({ success: true, video: { id, ...body } }), { headers: corsHeaders });
    }

    // 4. Xem chi tiết 1 video & bình luận
    const videoDetailMatch = path.match(/^\/api\/videos\/([^/]+)$/);
    if (videoDetailMatch && method === "GET") {
      const videoId = videoDetailMatch[1];
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

      return new Response(JSON.stringify({ video, comments }), { headers: corsHeaders });
    }

    // 5. Gửi bình luận
    const commentMatch = path.match(/^\/api\/videos\/([^/]+)\/comments$/);
    if (commentMatch && method === "POST") {
      const videoId = commentMatch[1];
      const body = await request.json();
      const id = "cmt_" + Date.now();
      const userId = body.user_id || "u_guest";

      await db.prepare(`
        INSERT INTO comments (id, video_id, user_id, content)
        VALUES (?, ?, ?, ?)
      `).bind(id, videoId, userId, body.content).run();

      return new Response(JSON.stringify({ success: true, id }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ message: "VietTube API Ready" }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}

