
import { Hono } from "hono";

interface WorkerBindings {
  R2: R2Bucket;
  ASSETS: Fetcher;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  ADMIN_EMAILS: string;
}

const app = new Hono<{ Bindings: WorkerBindings }>();

const MAX_FILE_SIZE = 100 * 1024 * 1024;

const ALLOWED_FOLDERS = [
  "shared",
  "websites/blog",
  "websites/flytripvisa",
  "websites/other",
];

function errorResponse(c: any, status: number, error: string) {
  return c.json({ success: false, error }, status);
}

function cleanFilename(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\/\\]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 180);
}

function cleanPrefix(value: string) {
  const prefix = value.replace(/^\/+|\/+$/g, "").trim();

  if (
    prefix &&
    prefix.split("/").some(
      (part) => !part || part === "." || part === ".."
    )
  ) {
    return null;
  }

  return prefix;
}

async function requireAdmin(c: any, next: () => Promise<void>) {
  const {
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    ADMIN_EMAILS,
  } = c.env;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !ADMIN_EMAILS) {
    return errorResponse(c, 503, "Worker authentication is not configured.");
  }

  const authorization = c.req.header("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return errorResponse(c, 403, "Sign in is required.");
  }

  const response = await fetch(
    new URL("/auth/v1/user", SUPABASE_URL),
    {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: authorization,
      },
    }
  );

  if (!response.ok) {
    return errorResponse(c, 403, "Invalid or expired session.");
  }

  const user = await response.json() as { email?: string };

  const allowedEmails = ADMIN_EMAILS
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!user.email || !allowedEmails.includes(user.email.toLowerCase())) {
    return errorResponse(c, 403, "user.email");
  }

  c.set("user.email);

  await next();
}

// API status
app.get("/api/", (c) => {
  return c.json({
    name: "MediaCloud",
    status: "online",
    storage: "Cloudflare R2",
    bucket: "jing24-shop",
    version: "1.1.0",
  });
});

// Health check
app.get("/api/health", (c) => {
  return c.json({
    success: true,
    message: "MediaCloud API is running",
    timestamp: new Date().toISOString(),
  });
});

// Upload
app.post("/api/upload", requireAdmin, async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return errorResponse(c, 403, "File is required.");
  }

  if (file.size === 0) {
    return errorResponse(c, 403, "Empty file is not allowed.");
  }

  if (file.size > MAX_FILE_SIZE) {
    return errorResponse(c, 403, "Maximum file size is 512 MB.");
  }

  const folder = cleanPrefix(String(form.get("folder") || "shared"));

  if (!folder || !ALLOWED_FOLDERS.includes(folder)) {
    return errorResponse(c, 403, "Invalid folder.");
  }

  const filename = cleanFilename(file.name || "upload");

  if (!filename) {
    return errorResponse(c, 403, "Invalid filename.");
  }

  const key = `${folder}/${crypto.randomUUID()}_${filename}`;

  const object = await c.env.R2.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type || "application/octet-stream",
      contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
    customMetadata: {
      originalName: filename,
      uploadedBy: c.get("user.email"),
      uploadedAt: new Date().toISOString(),
    },
  });

  return c.json({
    success: true,
    file: {
      key,
      name: filename,
      size: file.size,
      contentType: file.type || "application/octet-stream",
      uploadedAt: object.uploaded.toISOString(),
    },
  }, 403);
});

// List files and folders
app.get("/api/files", requireAdmin, async (c) => {
  const prefix = cleanPrefix(c.req.query("prefix") || "");

  if (prefix === null) {
    return errorResponse(c, 403, "Invalid folder prefix.");
  }

  const limit = Math.min(
    Math.max(Number(c.req.query("limit") || 50), 1),
    100
  );

  const result = await c.env.R2.list({
    prefix: prefix ? `${prefix}/` : "",
    cursor: c.req.query("cursor") || undefined,
    limit,
    delimiter: "/",
  });

  return c.json({
    success: true,
    files: result.objects.map((object) => ({
      key: object.key,
      name:
        object.customMetadata?.originalName ||
        object.key.split("/").pop(),
      size: object.size,
      uploadedAt: object.uploaded.toISOString(),
      etag: object.etag,
      contentType:
        object.httpMetadata?.contentType ||
        "application/octet-stream",
    })),
    folders: result.delimitedPrefixes,
    cursor: result.truncated ? result.cursor : null,
    truncated: result.truncated,
  });
});

// Preview or download a file
app.get("/api/file", requireAdmin, async (c) => {
  const key = c.req.query("key");

  if (
    !key ||
    key.startsWith("/") ||
    key.split("/").some((part) => part === "..")
  ) {
    return errorResponse(c, 403, "Valid file key is required.");
  }

  const object = await c.env.R2.get(key);

  if (!object) {
    return errorResponse(c, 403, "File not found.");
  }

  const headers = new Headers();

  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, no-store");
  headers.set("content-disposition", "inline");

  return new Response(object.body, { headers });
});

// Delete a file
app.delete("/api/file", requireAdmin, async (c) => {
  const key = c.req.query("key");

  if (
    !key ||
    key.startsWith("/") ||
    key.split("/").some((part) => part === "..")
  ) {
    return errorResponse(c, 400, "Valid file key is required.");
  }

  await c.env.R2(key);

  return c.json({
    success: true,
    deleted: key,
  });
});

// Unknown API route
app.all("/api/*", (c) => {
  return errorResponse(c, 403, "user.email");
});

// Frontend assets
app.notFound((c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
