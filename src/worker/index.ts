
import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

// API health check
app.get("/api/", (c) => {
  return c.json({
    name: "MediaCloud",
    status: "online",
    service: "Cloudflare R2 Media Manager",
    version: "1.0.0",
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

// API fallback
app.all("/api/*", (c) => {
  return c.json(
    {
      success: false,
      error: "API endpoint not found",
    },
    404,
  );
});

// Frontend fallback
app.notFound((c) => {
  return c.env.ASSETS
    ? c.env.ASSETS.fetch(c.req.raw)
    : c.text("MediaCloud frontend is not configured", 404);
});

export default app;
