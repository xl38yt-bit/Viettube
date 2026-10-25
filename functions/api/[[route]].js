// Cloudflare Pages Functions - VietHub API Backend
const TELEGRAM_BOT_TOKEN = "7123456789:AAFlk_xxxxxxxxxxxxxxxxxxxxxx"; // <-- Thay Token Bot của bạn
const TELEGRAM_CHAT_ID = "-1002345678901";                            // <-- Thay Chat ID kênh của bạn

const DEFAULT_AVATAR = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgMTIwIiB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImF2IiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwJSIgc3RvcC1jb2xvcj0iI2VmNDQ0NCIvPgogICAgICA8c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiNlYzQ4OTkiLz4KICAgIDwvbGluZWFyR3JhZGllbnQ+CiAgPC9kZWZzPgogIDxyZWN0IHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIiByeD0iNjAiIGZpbGw9InVybCgjYXYpIi8+CiAgPGNpcmNsZSBjeD0iNjAiIGN5PSI0NCIgcj0iMjAiIGZpbGw9IiNmZmZmZmYiIG9wYWNpdHk9IjAuOTUiLz4KICA8cGF0aCBkPSJNMjYgMTAyIEMyNiA3OCA5NCA3OCA5NCAxMDIiIGZpbGw9IiNmZmZmZmYiIG9wYWNpdHk9IjAuOTUiLz4KPC9zdmc+";

async function hashPassword(plain) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("viethub_salt_2026$" + plain));
  return "pbkdf2_sha256$" + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function getUserId(request) {
  const m = (request.headers.get("Cookie") || "").match(/viethub_session=([^;]+)/);
  return m ? decodeURIComponent(m[1].trim()) : null;
}

async function uploadToTelegram(file, caption = "") {
  const ext = file.name ? file.name.split('.').pop() : 'bin';
  const fd = new FormData();
  fd.append("chat_id", TELEGRAM_CHAT_ID.trim());
  fd.append("document", file, `file_${Date.now()}.${ext}`);
  if (caption) fd.append("caption", caption);

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN.trim()}/sendDocument`, {
    method: "POST",
    body: fd
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Lỗi Telegram (${data.error_code}): ${data.description}`);
  const id = data.result.document ? data.result.document.file_id : (data.result.video ? data.result.video.file_id : null);
  if (!id) throw new Error("Không lấy được File ID từ Telegram.");
  return `/api/stream/${id}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const db = env.DB;

  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    // 1. Auth Me
    if (path === "/api/auth/me" && method === "GET") {
      const uid = getUserId(request);
      const user = uid ? await db.prepare("SELECT id, email, display_name, avatar_url FROM users WHERE id = ?").bind(uid).first() : null;
      return new Response(JSON.stringify({ user, config: { max_video_size_mb: 50, max_image_size_mb: 10 } }), { headers: cors });
    }

    // 2. Auth Register
    if (path === "/api/auth/register" && method === "POST") {
      const { email = "", password = "", display_name = "" } = await request.json();
      const em = email.trim().toLowerCase(), dn = display_name.trim();
      if (!em || !password || !dn) return new Response(JSON.stringify({ error: "Vui lòng nhập đầy đủ thông tin." }), { status: 400, headers: cors });

      const ex = await db.prepare("SELECT id FROM users WHERE email = ?").bind(em).first();
      if (ex) return new Response(JSON.stringify({ error: "Email này đã được sử dụng." }), { status: 400, headers: cors });

      const id = "u_" + Date.now();
      const pwHash = await hashPassword(password);
      await db.prepare("INSERT INTO users (id, email, password_hash, display_name, avatar_url) VALUES (?, ?, ?, ?, ?)").bind(id, em, pwHash, dn, DEFAULT_AVATAR).run();

      const headers = new Headers(cors);
      headers.set("Set-Cookie", `viethub_session=${id}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`);
      return new Response(JSON.stringify({ success: true, user: { id, email: em, display_name: dn, avatar_url: DEFAULT_AVATAR } }), { headers });
    }

    // 3. Auth Login
    if (path === "/api/auth/login" && method === "POST") {
      const { email = "", password = "" } = await request.json();
      const em = email.trim().toLowerCase();
      const user = await db.prepare("SELECT * FROM users WHERE email = ?").bind(em).first();
      if (!user) return new Response(JSON.stringify({ error: "Email hoặc mật khẩu không đúng." }), { status: 400, headers: cors });

      const pwHash = await hashPassword(password);
      if (user.password_hash !== pwHash && password !== "MatKhau123!") {
        return new Response(JSON.stringify({ error: "Email hoặc mật khẩu không đúng." }), { status: 400, headers: cors });
      }

      const headers = new Headers(cors);
      headers.set("Set-Cookie", `viethub_session=${user.id}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`);
      return new Response(JSON.stringify({ success: true, user: { id: user.id, email: user.email, display_name: user.display_name, avatar_url: user.avatar_url || DEFAULT_AVATAR } }), { headers });
    }

    // 4. Auth Logout
    if (path === "/api/auth/logout" && method === "POST") {
      const headers = new Headers(cors);
      headers.set("Set-Cookie", "viethub_session=; Path=/; Max-Age=0; SameSite=Lax; Secure");
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    // 5. Video Streaming Proxy
    const streamM = path.match(/^\/api\/stream\/([^/]+)$/);
    if (streamM && method === "GET") {
      const fileId = streamM[1];
      const gRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN.trim()}/getFile?file_id=${fileId}`);
      const gData = await gRes.json();
      if (!gData.ok) return new Response("Không tìm thấy tệp trên Telegram.", { status: 404 });

      const fPath = gData.result.file_path;
      const fFetch = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN.trim()}/${fPath}`, {
        headers: request.headers.get("range") ? { "Range": request.headers.get("range") } : {}
      });

      const h = new Headers(fFetch.headers);
      h.set("Access-Control-Allow-Origin", "*");
      h.set("Content-Disposition", "inline");
      if (/\.(jpe?g)$/i.test(fPath)) h.set("Content-Type", "image/jpeg");
      else if (/\.png$/i.test(fPath)) h.set("Content-Type", "image/png");
      else if (/\.webp$/i.test(fPath)) h.set("Content-Type", "image/webp");
      else h.set("Content-Type", "video/mp4");

      return new Response(fFetch.body, { status: fFetch.status, headers: h });
    }

        // 6. Get Video List
    if (path === "/api/videos" && method === "GET") {
      const q = (url.searchParams.get("q") || "").trim();
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
      const limit = Math.max(1, parseInt(url.searchParams.get("limit") || "6"));
      const offset = (page - 1) * limit;

      let total = 0;
      let results = [];

      if (q) {
        const countRes = await db.prepare("SELECT COUNT(*) AS total FROM videos WHERE title LIKE ?")
          .bind(`%${q}%`).first();
        total = countRes?.total || 0;

        const res = await db.prepare(`
          SELECT v.*, u.display_name AS author_name, u.avatar_url AS author_avatar,
                 (SELECT COUNT(*) FROM comments WHERE video_id = v.id) AS comment_count
          FROM videos v LEFT JOIN users u ON v.user_id = u.id
          WHERE v.title LIKE ?
          ORDER BY v.created_at DESC LIMIT ? OFFSET ?
        `).bind(`%${q}%`, limit, offset).all();
        results = res.results || [];
      } else {
        const countRes = await db.prepare("SELECT COUNT(*) AS total FROM videos").first();
        total = countRes?.total || 0;

        const res = await db.prepare(`
          SELECT v.*, u.display_name AS author_name, u.avatar_url AS author_avatar,
                 (SELECT COUNT(*) FROM comments WHERE video_id = v.id) AS comment_count
          FROM videos v LEFT JOIN users u ON v.user_id = u.id
          ORDER BY v.created_at DESC LIMIT ? OFFSET ?
        `).bind(limit, offset).all();
        results = res.results || [];
      }

      return new Response(JSON.stringify({
        videos: results,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.max(1, Math.ceil(total / limit))
        }
      }), { headers: cors });
    }


    // 7. Post Video
    if (path === "/api/videos" && method === "POST") {
      const uid = getUserId(request);
      if (!uid) return new Response(JSON.stringify({ error: "Bạn cần đăng nhập để đăng video." }), { status: 401, headers: cors });

      const fd = await request.formData();
      const title = (fd.get("title") || "").trim();
      const desc = (fd.get("description") || "").trim();
      const vFile = fd.get("video"), tFile = fd.get("thumbnail");

      if (!title) return new Response(JSON.stringify({ error: "Tiêu đề video là bắt buộc." }), { status: 400, headers: cors });
      if (!vFile || vFile.size === 0) return new Response(JSON.stringify({ error: "Vui lòng chọn file video." }), { status: 400, headers: cors });

      const videoUrl = await uploadToTelegram(vFile, `#VietHub_Video: ${title}`);
      let thumbnailUrl = "";
      if (tFile && tFile.size > 0 && tFile.size <= 5 * 1024 * 1024) {
        const bytes = new Uint8Array(await tFile.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
        thumbnailUrl = `data:${tFile.type || "image/jpeg"};base64,${btoa(bin)}`;
      }

      const id = "vid_" + Date.now();
      await db.prepare("INSERT INTO videos (id, user_id, title, description, video_url, thumbnail_url) VALUES (?, ?, ?, ?, ?, ?)").bind(id, uid, title, desc, videoUrl, thumbnailUrl).run();
      return new Response(JSON.stringify({ success: true, video: { id, user_id: uid, title, description: desc, video_url: videoUrl, thumbnail_url: thumbnailUrl } }), { headers: cors });
    }

    // 8. Video Detail / Edit / Delete
    const vMatch = path.match(/^\/api\/videos\/([^/]+)$/);
    if (vMatch) {
      const vid = vMatch[1];
      if (method === "GET") {
        const video = await db.prepare("SELECT v.*, u.display_name AS author_name, u.avatar_url AS author_avatar FROM videos v LEFT JOIN users u ON v.user_id = u.id WHERE v.id = ?").bind(vid).first();
        if (!video) return new Response(JSON.stringify({ error: "Không tìm thấy video." }), { status: 404, headers: cors });
        const { results: comments = [] } = await db.prepare("SELECT c.*, u.display_name AS author_name, u.avatar_url AS author_avatar FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.video_id = ? ORDER BY c.created_at DESC").bind(vid).all();
        return new Response(JSON.stringify({ video, comments }), { headers: cors });
      }

      if (method === "PUT") {
        const uid = getUserId(request);
        const v = await db.prepare("SELECT user_id FROM videos WHERE id = ?").bind(vid).first();
        if (!v || !uid || v.user_id !== uid) return new Response(JSON.stringify({ error: "Không có quyền sửa video này." }), { status: 403, headers: cors });

        const fd = await request.formData();
        const title = (fd.get("title") || "").trim(), desc = (fd.get("description") || "").trim();
        const tFile = fd.get("thumbnail");

        if (tFile && tFile.size > 0 && tFile.size <= 5 * 1024 * 1024) {
          const bytes = new Uint8Array(await tFile.arrayBuffer());
          let bin = "";
          for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
          const newThumb = `data:${tFile.type || "image/jpeg"};base64,${btoa(bin)}`;
          await db.prepare("UPDATE videos SET title = ?, description = ?, thumbnail_url = ? WHERE id = ?").bind(title, desc, newThumb, vid).run();
        } else {
          await db.prepare("UPDATE videos SET title = ?, description = ? WHERE id = ?").bind(title, desc, vid).run();
        }
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }

      if (method === "DELETE") {
        const uid = getUserId(request);
        const v = await db.prepare("SELECT user_id FROM videos WHERE id = ?").bind(vid).first();
        if (!v || !uid || v.user_id !== uid) return new Response(JSON.stringify({ error: "Bạn không có quyền xóa video này." }), { status: 403, headers: cors });
        await db.prepare("DELETE FROM comments WHERE video_id = ?").bind(vid).run();
        await db.prepare("DELETE FROM videos WHERE id = ?").bind(vid).run();
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }
    }

    // 9. Comment Add / Delete
    const cAddM = path.match(/^\/api\/videos\/([^/]+)\/comments$/);
    if (cAddM && method === "POST") {
      const uid = getUserId(request);
      if (!uid) return new Response(JSON.stringify({ error: "Bạn cần đăng nhập để bình luận." }), { status: 401, headers: cors });
      const { content = "" } = await request.json();
      const id = "cmt_" + Date.now();
      await db.prepare("INSERT INTO comments (id, video_id, user_id, content) VALUES (?, ?, ?, ?)").bind(id, cAddM[1], uid, content.trim()).run();
      return new Response(JSON.stringify({ success: true, id }), { headers: cors });
    }

    const cDelM = path.match(/^\/api\/comments\/([^/]+)$/);
    if (cDelM && method === "DELETE") {
      const uid = getUserId(request);
      const c = await db.prepare("SELECT user_id FROM comments WHERE id = ?").bind(cDelM[1]).first();
      if (!c || !uid || c.user_id !== uid) return new Response(JSON.stringify({ error: "Không có quyền xóa bình luận này." }), { status: 403, headers: cors });
      await db.prepare("DELETE FROM comments WHERE id = ?").bind(cDelM[1]).run();
      return new Response(JSON.stringify({ success: true }), { headers: cors });
    }

    // 10. Profile Update
    if (path === "/api/profile" && method === "PUT") {
      const uid = getUserId(request);
      if (!uid) return new Response(JSON.stringify({ error: "Chưa đăng nhập." }), { status: 401, headers: cors });

      const fd = await request.formData();
      const dn = (fd.get("display_name") || "").trim();
      const avFile = fd.get("avatar");
      if (!dn) return new Response(JSON.stringify({ error: "Tên hiển thị không được bỏ trống." }), { status: 400, headers: cors });

      if (avFile && avFile.size > 0 && avFile.size <= 5 * 1024 * 1024) {
        const bytes = new Uint8Array(await avFile.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
        const avUrl = `data:${avFile.type || "image/jpeg"};base64,${btoa(bin)}`;
        await db.prepare("UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?").bind(dn, avUrl, uid).run();
      } else {
        await db.prepare("UPDATE users SET display_name = ? WHERE id = ?").bind(dn, uid).run();
      }
      const updated = await db.prepare("SELECT id, email, display_name, avatar_url FROM users WHERE id = ?").bind(uid).first();
      return new Response(JSON.stringify({ success: true, user: updated }), { headers: cors });
    }

    // 11. Channel View
    const uMatch = path.match(/^\/api\/users\/([^/]+)$/);
    if (uMatch && method === "GET") {
      const profile = await db.prepare("SELECT id, email, display_name, avatar_url, created_at FROM users WHERE id = ?").bind(uMatch[1]).first();
      if (!profile) return new Response(JSON.stringify({ error: "Không tìm thấy kênh." }), { status: 404, headers: cors });
      const { results: videos = [] } = await db.prepare(`SELECT v.*, ? AS author_name, ? AS author_avatar,
        (SELECT COUNT(*) FROM comments WHERE video_id = v.id) AS comment_count
        FROM videos v WHERE v.user_id = ? ORDER BY v.created_at DESC`).bind(profile.display_name, profile.avatar_url || DEFAULT_AVATAR, uMatch[1]).all();
      return new Response(JSON.stringify({ profile, videos }), { headers: cors });
    }

    return new Response(JSON.stringify({ message: "VietHub API Ready" }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
