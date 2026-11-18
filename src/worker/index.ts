
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";

interface WorkerBindings {
  R2: R2Bucket;
  ASSETS: Fetcher;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  ADMIN_EMAILS: string;
}

type AppEnv = {
  Bindings: WorkerBindings;
  Variables: {
    userEmail: string;
  };
};

const app = new Hono<AppEnv>();

const MAX_FILE_SIZE = 100 * 1024 * 1024;

const ALLOWED_FOLDERS = [
  "shared",
  "websites/blog",
  "websites/flytripvisa",
  "websites/other",
];

function errorResponse(
  c: Parameters<MiddlewareHandler<AppEnv>>[0],
  status: number,
  error: string
) {
  return c.json({ success: false, error }, status as 400);
}

function cleanFilename(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\/\\]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 180);
}

function cleanPrefix(value: string): string | null {
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

function isAllowedKey(key: string) {
  if (!key || key.startsWith("/")) return false;

  const parts = key.split("/");

  if (parts.some(
    (part) => !part || part === "." || part === ".."
  )) {
    return false;
  }

  return ALLOWED_FOLDERS.some(
    (folder) => key.startsWith(`${folder}/`)
  );
}

// Supabase Admin Authentication
const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const {
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    ADMIN_EMAILS,
  } = c.env;

  if (
    !SUPABASE_URL ||
    !SUPABASE_PUBLISHABLE_KEY ||
    !ADMIN_EMAILS
  ) {
    return c.json({
      success: false,
      error: "Worker authentication is not configured.",
    }, 503);
  }

  const authorization = c.req.header("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return c.json({
      success: false,
      error: "Sign in is required.",
    }, 401);
  }

  let response: Response;

  try {
    response = await fetch(
      new URL("/auth/v1/user", SUPABASE_URL),
      {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: authorization,
        },
      }
    );
  } catch {
    return c.json({
      success: false,
      error: "Authentication service unavailable.",
    }, 503);
  }

  if (!response.ok) {
    return c.json({
      success: false,
      error: "Invalid or expired session.",
    }, 401);
  }

  const user = await response.json() as {
    email?: string;
  };

  const allowedEmails = ADMIN_EMAILS
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  const email = user.email?.trim().toLowerCase();

  if (!email || !allowedEmails.includes(email)) {
    return c.json({
      success: false,
      error: "You are not authorized as an administrator.",
    }, 403);
  }

  c.set("userEmail", email);

  await next();
};

// API status
app.get("/api/", (c) => {
  return c.json({
    name: "MediaCloud",
    status: "online",
    storage: "Cloudflare R2",
    bucket: "jing24-shop",
    version: "1.2.0",
  });
});

// Health check
app.get("/api/health", (c) => {
  return c.json({
    success: true,
    message: "MediaCloud API is running",
    storage: "Cloudflare R2",
    timestamp: new Date().toISOString(),
  });
});

// Upload file
app.post("/api/upload", requireAdmin, async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return errorResponse(c, 400, "File is required.");
  }

  if (file.size === 0) {
    return errorResponse(c, 400, "Empty file is not allowed.");
  }

  if (file.size > MAX_FILE_SIZE) {
    return errorResponse(c, 413, "Maximum file size is 100 MB.");
  }

  const folder = cleanPrefix(
    String(form.get("folder") || "shared")
  );

  if (!folder || !ALLOWED_FOLDERS.includes(folder)) {
    return errorResponse(c, 400, "Invalid folder.");
  }

  const filename = cleanFilename(file.name || "upload");

  if (!filename) {
    return errorResponse(c, 400, "Invalid filename.");
  }

  const key = `${folder}/${crypto.randomUUID()}_${filename}`;
  const uploadedAt = new Date().toISOString();

  const object = await c.env.R2.put(
    key,
    file.stream(),
    {
      httpMetadata: {
        contentType:
          file.type || "application/octet-stream",
        contentDisposition:
          `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
      customMetadata: {
        originalName: filename,
        uploadedBy: c.get("userEmail"),
        uploadedAt,
      },
    }
  );

  if (!object) {
    return errorResponse(c, 500, "File upload failed.");
  }

  return c.json({
    success: true,
    file: {
      key,
      name: filename,
      size: file.size,
      contentType:
        file.type || "application/octet-stream",
      uploadedAt: object.uploaded.toISOString(),
    },
  }, 200);
});

// List files and folders
app.get("/api/files", requireAdmin, async (c) => {
  const prefix = cleanPrefix(
    c.req.query("prefix") || ""
  );

  if (prefix === null) {
    return errorResponse(c, 400, "Invalid folder prefix.");
  }

  if (
    prefix &&
    !ALLOWED_FOLDERS.some(
      (folder) =>
        prefix === folder ||
        prefix.startsWith(`${folder}/`)
    )
  ) {
    return errorResponse(c, 400, "Folder is not allowed.");
  }

  const requestedLimit = Number(
    c.req.query("limit") || 50
  );

  const limit = Math.min(
    Math.max(
      Number.isFinite(requestedLimit) ? requestedLimit : 50,
      1
    ),
    100
  );

  const result = await c.env.R2.list({
    prefix: prefix
      ? `${prefix.replace(/\/+$/, "")}/`
      : "",
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

// Preview or download file
app.get("/api/file", requireAdmin, async (c) => {
  const key = c.req.query("key");

  if (!key || !isAllowedKey(key)) {
    return errorResponse(c, 400, "Valid file key is required.");
  }

  const object = await c.env.R2.get(key);

  if (!object) {
    return errorResponse(c, 404, "File not found.");
  }

  const headers = new Headers();

  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, no-store");
  headers.set("content-disposition", "inline");

  return new Response(object.body, {
    status: 200,
    headers,
  });
});

// Delete file
app.delete("/api/file", requireAdmin, async (c) => {
  const key = c.req.query("key");

  if (!key || !isAllowedKey(key)) {
    return errorResponse(c, 400, "Valid file key is required.");
  }

  const existing = await c.env.R2.head(key);

  if (!existing) {
    return errorResponse(c, 404, "File not found.");
  }

  await c.env.R2.delete(key);

  return c.json({
    success: true,
    deleted: key,
  });
});

// Unknown API route
app.all("/api/*", (c) => {
  return c.json({
    success: false,
    error: "API endpoint not found.",
  }, 404);
});

// Error handler
app.onError((error, c) => {
  console.error("MediaCloud Worker Error:", error);

  return c.json({
    success: false,
    error: "Internal server error.",
  }, 500);
});

// Frontend assets
app.notFound((c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
