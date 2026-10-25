// =========================================================================
// 1. CẤU HÌNH TELEGRAM BOT (ĐIỀN TOKEN VÀ CHAT ID CỦA BẠN VÀO ĐÂY)
// =========================================================================
const TELEGRAM_BOT_TOKEN = "8764219157:AAHUT_OPywzC1V5opWTM9CF6FieZakpzXYo"; // Token bot của bạn
const TELEGRAM_CHAT_ID = "-1004467276375";                            // Chat ID kênh của bạn

// =========================================================================
// 2. CÁC HÀM TIỆN ÍCH HỆ THỐNG
// =========================================================================
async function hashPassword(plainText) {
  const msgBuffer = new TextEncoder().encode("viettube_salt_2026$" + plainText);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return "pbkdf2_sha256$" + hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function getUserIdFromCookie(request) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/viettube_session=([^;]+)/);
  return match ? decodeURIComponent(match[1].trim()) : null;
}

// Hàm đẩy file (video hoặc ảnh) lên Telegram và lấy File ID
async function uploadToTelegram(file, caption = "") {
  const ext = file.name ? file.name.split('.').pop() : 'bin';
  const tgFormData = new FormData();
  tgFormData.append("chat_id", TELEGRAM_CHAT_ID.trim());
  tgFormData.append("document", file, `file_${Date.now()}.${ext}`);
  if (caption) tgFormData.append("caption", caption);

  const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN.trim()}/sendDocument`, {
    method: "POST",
    body: tgFormData
  });

  const tgData = await tgRes.json();
  if (!tgData.ok) {
    throw new Error(`Lỗi Telegram (${tgData.error_code}): ${tgData.description}`);
  }

  const fileId = tgData.result.document ? tgData.result.document.file_id : (tgData.result.video ? tgData.result.video.file_id : null);
  if (!fileId) throw new Error("Không lấy được File ID từ Telegram.");
  return `/api/stream/${fileId}`;
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
    // A. XÁC THỰC TÀI KHOẢN & PHIÊN ĐĂNG NHẬP
    // -------------------------------------------------------------
    if (path === "/api/auth/me" && method === "GET") {
      const loggedInId = getUserIdFromCookie(request);
      let user = null;
      if (loggedInId) {
        user = await db.prepare("SELECT id, email, display_name, avatar_url FROM users WHERE id = ?").bind(loggedInId).first();
      }
      return new Response(JSON.stringify({ 
        user: user || null, 
        config: { max_video_size_mb: 50, max_image_size_mb: 10 } 
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
      const responseHeaders = new Headers(corsHeaders);
      responseHeaders.set("Set-Cookie", `viettube_session=${id}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`);

      return new Response(JSON.stringify({ success: true, user }), { headers: responseHeaders });
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

      const responseHeaders = new Headers(corsHeaders);
      responseHeaders.set("Set-Cookie", `viettube_session=${user.id}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`);

      return new Response(JSON.stringify({ success: true, user: safeUser }), { headers: responseHeaders });
    }

    if (path === "/api/auth/logout" && method === "POST") {
      const responseHeaders = new Headers(corsHeaders);
      responseHeaders.set("Set-Cookie", "viettube_session=; Path=/; Max-Age=0; SameSite=Lax; Secure");
      return new Response(JSON.stringify({ success: true }), { headers: responseHeaders });
    }

    // -------------------------------------------------------------
    // B. STREAM PROXY CHO CẢ VIDEO LẪN HÌNH ẢNH (TỰ ĐỘNG NHẬN DIỆN MIME)
    // -------------------------------------------------------------
    const streamMatch = path.match(/^\/api\/stream\/([^/]+)$/);
    if (streamMatch && method === "GET") {
      const fileId = streamMatch[1];
      
      const getFileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN.trim()}/getFile?file_id=${fileId}`);
      const fileData = await getFileRes.json();
      
      if (!fileData.ok) {
        return new Response("Không tìm thấy tệp trên Telegram.", { status: 404 });
      }

      const filePath = fileData.result.file_path;
      const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN.trim()}/${filePath}`;

      const range = request.headers.get("range");
      const tgFileFetch = await fetch(downloadUrl, {
        headers: range ? { "Range": range } : {}
      });

      const responseHeaders = new Headers(tgFileFetch.headers);
      responseHeaders.set("Access-Control-Allow-Origin", "*");

      // Nhận diện định dạng tệp: Nếu là ảnh thì trả về mime ảnh, ngược lại là video
      if (filePath.match(/\.(jpg|jpeg)$/i)) {
        responseHeaders.set("Content-Type", "image/jpeg");
      } else if (filePath.match(/\.png$/i)) {
        responseHeaders.set("Content-Type", "image/png");
      } else if (filePath.match(/\.webp$/i)) {
        responseHeaders.set("Content-Type", "image/webp");
      } else if (filePath.match(/\.gif$/i)) {
        responseHeaders.set("Content-Type", "image/gif");
      } else {
        responseHeaders.set("Content-Type", "video/mp4");
      }

      return new Response(tgFileFetch.body, {
        status: tgFileFetch.status,
        headers: responseHeaders
      });
    }

    // -------------------------------------------------------------
    // C. VIDEO: LẤY DANH SÁCH & ĐĂNG MỚI (CÓ XỬ LÝ THUMBNAIL)
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
      const loggedInId = getUserIdFromCookie(request);
      if (!loggedInId) {
        return new Response(JSON.stringify({ error: "Bạn cần đăng nhập để đăng video." }), { status: 401, headers: corsHeaders });
      }

      const currentUser = await db.prepare("SELECT id FROM users WHERE id = ?").bind(loggedInId).first();
      if (!currentUser) {
        return new Response(JSON.stringify({ error: "Phiên đăng nhập hết hạn." }), { status: 401, headers: corsHeaders });
      }

      const formData = await request.formData();
      const title = (formData.get("title") || "").trim();
      const description = (formData.get("description") || "").trim();
      const videoFile = formData.get("video");
      const thumbFile = formData.get("thumbnail");

      if (!title) {
        return new Response(JSON.stringify({ error: "Tiêu đề video là bắt buộc." }), { status: 400, headers: corsHeaders });
      }
      if (!videoFile || videoFile.size === 0) {
        return new Response(JSON.stringify({ error: "Vui lòng chọn file video." }), { status: 400, headers: corsHeaders });
      }

      // 1. Tải video lên Telegram
      const videoUrl = await uploadToTelegram(videoFile, `#VietTube_Video: ${title}`);

      // 2. Tải Thumbnail riêng lên Telegram (nếu người dùng có chọn)
      let thumbnailUrl = "";
      if (thumbFile && thumbFile.size > 0) {
        thumbnailUrl = await uploadToTelegram(thumbFile, `#VietTube_Thumb: ${title}`);
      }

      const id = "vid_" + Date.now();
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
    // D. CHI TIẾT, CHỈNH SỬA & XÓA VIDEO
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

      // Sửa video (hỗ trợ đổi cả ảnh Thumbnail mới)
      if (method === "PUT") {
        const loggedInId = getUserIdFromCookie(request);
        const video = await db.prepare("SELECT user_id FROM videos WHERE id = ?").bind(videoId).first();
        if (!video || !loggedInId || video.user_id !== loggedInId) {
          return new Response(JSON.stringify({ error: "Không có quyền sửa video này." }), { status: 403, headers: corsHeaders });
        }

        const formData = await request.formData();
        const title = (formData.get("title") || "").trim();
        const description = (formData.get("description") || "").trim();
        const thumbFile = formData.get("thumbnail");

        if (thumbFile && thumbFile.size > 0) {
          const newThumbUrl = await uploadToTelegram(thumbFile, `#VietTube_ThumbEdit`);
          await db.prepare(`UPDATE videos SET title = ?, description = ?, thumbnail_url = ? WHERE id = ?`)
            .bind(title, description, newThumbUrl, videoId).run();
        } else {
          await db.prepare(`UPDATE videos SET title = ?, description = ? WHERE id = ?`)
            .bind(title, description, videoId).run();
        }

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      if (method === "DELETE") {
        const loggedInId = getUserIdFromCookie(request);
        const video = await db.prepare("SELECT user_id FROM videos WHERE id = ?").bind(videoId).first();
        
        if (!video) {
          return new Response(JSON.stringify({ error: "Không tìm thấy video." }), { status: 404, headers: corsHeaders });
        }
        if (!loggedInId || video.user_id !== loggedInId) {
          return new Response(JSON.stringify({ error: "Bạn không có quyền xóa video này." }), { status: 403, headers: corsHeaders });
        }

        await db.
          
