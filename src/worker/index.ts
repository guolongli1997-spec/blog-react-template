import { Hono, type Context } from "hono";

const app = new Hono<{ Bindings: Env }>();

const MAX_FILE_SIZE = 100 * 1024 * 1024;

const ALLOWED_FOLDERS = [
  "websites/blog",
  "websites/flytripvisa",
  "websites/other",
  "shared",
];

app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  await next();
  c.header("Access-Control-Allow-Origin", "*");
});

async function authenticate(c: Context<{ Bindings: Env }>, next: () => Promise<void>) {
  const authorization = c.req.header("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return c.json({ error: "Authentication required" }, 401);
  }
  const supabaseUrl = c.env.VITE_SUPABASE_URL;
  const supabaseKey = c.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return c.json({ error: "Authentication service not configured" }, 503);
  }
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: authorization },
    });
    if (!response.ok) {
      return c.json({ error: "Invalid or expired session" }, 401);
    }
    await next();
  } catch {
    return c.json({ error: "Authentication service unavailable" }, 503);
  }
}

function validFolder(folder: string): boolean {
  return ALLOWED_FOLDERS.includes(folder);
}

function validKey(key: string): boolean {
  return ALLOWED_FOLDERS.some(
    (folder) => key.startsWith(`${folder}/`) && key.length > folder.length + 1,
  );
}

app.get("/api/health", async (c: Context<{ Bindings: Env }>) => {
  const r2Configured = !!c.env.R2;
  const authConfigured = !!(c.env.VITE_SUPABASE_URL && c.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  let r2Connected = false;
  if (r2Configured) {
    try {
      await c.env.R2.list({ limit: 1 });
      r2Connected = true;
    } catch {
      r2Connected = false;
    }
  }
  return c.json({
    success: true,
    status: r2Configured && r2Connected && authConfigured ? "healthy" : "degraded",
    storage: "Cloudflare R2",
    bucket: "jing24-shop",
    r2: { configured: r2Configured, connected: r2Connected },
    auth: { configured: authConfigured, provider: "supabase" },
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/upload", authenticate);
app.use("/api/files", authenticate);
app.use("/api/file", authenticate);

app.post("/api/upload", async (c: Context<{ Bindings: Env }>) => {
  try {
    const form = await c.req.formData();
    const file = form.get("file");
    const folder = String(form.get("folder") || "shared");
    if (!(file instanceof File)) {
      return c.json({ error: "File is required" }, 400);
    }
    if (!validFolder(folder)) {
      return c.json({ error: "Invalid destination folder" }, 400);
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return c.json({ error: "File must be between 1 byte and 100 MB" }, 413);
    }
    const originalName = file.name.replace(/[\\/]/g, "_").slice(0, 180);
    const safeName = originalName.replace(/[^\w.\-() ]/g, "_");
    const key = `${folder}/${crypto.randomUUID()}-${safeName}`;
    const object = await c.env.R2.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
      customMetadata: { originalName },
    });
    return c.json({
      success: true,
      key: object.key,
      name: originalName,
      size: object.size,
      type: file.type,
    }, 201);
  } catch {
    return c.json({ error: "Upload failed" }, 500);
  }
});

app.get("/api/files", async (c: Context<{ Bindings: Env }>) => {
  const folder = c.req.query("folder") || "shared";
  const cursor = c.req.query("cursor");
  if (!validFolder(folder)) {
    return c.json({ error: "Invalid folder" }, 400);
  }
  const result = await c.env.R2.list({
    prefix: `${folder}/`,
    cursor: cursor || undefined,
    limit: 1000,
    include: ["httpMetadata", "customMetadata"],
  });
  const files = result.objects.map((object: any) => ({
    key: object.key,
    name: object.customMetadata?.originalName || object.key.split("/").pop(),
    size: object.size,
    uploaded: object.uploaded,
    contentType: object.httpMetadata?.contentType || "application/octet-stream",
  }));
  return c.json({
    success: true,
    files,
    truncated: result.truncated,
    cursor: result.truncated ? result.cursor : null,
  });
});

app.get("/api/file", async (c: Context<{ Bindings: Env }>) => {
  const key = c.req.query("key");
  if (!key || !validKey(key)) {
    return c.json({ error: "Invalid file key" }, 400);
  }
  const object = await c.env.R2.get(key);
  if (!object) {
    return c.json({ error: "File not found" }, 404);
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(object.body, { headers });
});

app.delete("/api/file", async (c: Context<{ Bindings: Env }>) => {
  const key = c.req.query("key");
  if (!key || !validKey(key)) {
    return c.json({ error: "Invalid file key" }, 400);
  }
  const existing = await c.env.R2.head(key);
  if (!existing) {
    return c.json({ error: "File not found" }, 404);
  }
  await c.env.R2.delete(key);
  return c.json({ success: true, deleted: key });
});

export default app;
