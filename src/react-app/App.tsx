import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import Uppy from "@uppy/core";
import XHRUpload from "@uppy/xhr-upload";
import Dashboard from "@uppy/react/dashboard";
import "./App.css";

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL || "", import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "");
function App() {
  const [folder, setFolder] = useState("websites/blog");
  const [session, setSession] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [files, setFiles] = useState<any[]>([]);
  const tokenRef = useRef<string>("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      tokenRef.current = data.session?.access_token || "";
    });
    const { data: l } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      tokenRef.current = s?.access_token || "";
    });
    return () => l.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    fetch("/api/health").then(r => r.json()).then(d => setConnected(d.success)).catch(() => setConnected(false));
  }, []);

  const fetchFiles = () => {
    if (!tokenRef.current) return;
    fetch(`/api/files?folder=${folder}`, { headers: { Authorization: `Bearer ${tokenRef.current}` } })
      .then(r => r.json()).then(d => setFiles(d.files || [])).catch(() => {});
  };

  useEffect(() => { if (session) fetchFiles(); }, [session, folder]);

  const [uppy] = useState(() =>
    new Uppy({ id: "cloud-media-uploader", autoProceed: false, restrictions: { maxNumberOfFiles: 20 }, meta: { folder: "websites/blog" } })
      .use(XHRUpload, {
        endpoint: "/api/upload", method: "POST", formData: true, fieldName: "file", allowedMetaFields: ["folder"],
        headers: () => ({ Authorization: `Bearer ${tokenRef.current}` }),
      })
  );

  useEffect(() => {
    uppy.on("complete", () => { fetchFiles(); });
    return () => { uppy.off("complete", () => {}); };
  }, []);

  function changeFolder(v: string) { setFolder(v); uppy.setMeta({ folder: v }); }

  const del = (key: string) => {
    if (!confirm("Delete?")) return;
    fetch(`/api/file?key=${encodeURIComponent(key)}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenRef.current}` } })
      .then(r => r.json()).then(() => setFiles(files.filter(f => f.key !== key))).catch(() => {});
  };

  const fmt = (b: number) => b === 0 ? "0 B" : (b / 1048576).toFixed(1) + " MB";

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">M</div>
          <div><h2>MediaCloud</h2><span>Cloud media manager</span></div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span className="status" style={{ color: connected ? "#16a34a" : "#dc2626" }}>
            {connected ? "R2 connected" : "R2 not connected"}
          </span>
          {session ? (
            <button onClick={() => supabase.auth.signOut()}>Sign Out</button>
          ) : (
            <button onClick={() => supabase.auth.signInWithOAuth({ provider: "github" })}>Sign In</button>
          )}
        </div>
      </header>

      <section className="welcome">
        <span className="eyebrow">MEDIA STORAGE</span>
        <h1>Your files, one place.</h1>
        <p>Upload and organize images, videos and documents.</p>
      </section>

      <section className="stats">
        <div className="stat"><span>Total files</span><strong>{files.length}</strong></div>
        <div className="stat"><span>Storage used</span><strong>{fmt(files.reduce((s, f) => s + f.size, 0))}</strong></div>
        <div className="stat"><span>Storage</span><strong>Cloud R2</strong></div>
      </section>

      {session ? (<>
        <section className="upload-section">
          <div className="section-heading">
            <div><h2>Upload files</h2><p>Choose a destination folder before uploading.</p></div>
          </div>
          <label className="folder-label" htmlFor="folder">Destination folder</label>
          <select id="folder" value={folder} onChange={e => changeFolder(e.target.value)}>
            <option value="websites/blog">Blog website</option>
            <option value="websites/flytripvisa">FlyTripVisa</option>
            <option value="websites/other">Other websites</option>
            <option value="shared">Shared files</option>
          </select>
          <Dashboard uppy={uppy} height={390} proudlyDisplayPoweredByUppy={false} hideProgressDetails={false} note="Images, videos and documents — up to 100MB" />
        </section>

        <section className="library">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><h2>Media library</h2><p>Files in {folder}</p></div>
            <button onClick={fetchFiles}>↻ Refresh</button>
          </div>
          {files.length === 0 ? (
            <div className="empty"><div className="empty-icon">▧</div><strong>No media files yet</strong><span>Upload your first file to get started.</span></div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
              {files.map(f => (
                <div key={f.key} style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", padding: "0.5rem" }}>
                  <div style={{ height: 80, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem" }}>
                    {f.contentType?.startsWith("image/") ? "🖼️" : f.contentType?.startsWith("video/") ? "🎬" : "📄"}
                  </div>
                  <p style={{ margin: "0.3rem 0 0", fontSize: "0.78rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</p>
                  <p style={{ margin: "0.1rem 0 0.3rem", fontSize: "0.68rem", color: "#888" }}>{fmt(f.size)} · {new Date(f.uploaded).toLocaleDateString()}</p>
                  <div style={{ display: "flex", gap: "0.2rem" }}>
                    <a href={`/api/file?key=${encodeURIComponent(f.key)}`} target="_blank" rel="noreferrer" style={{ fontSize: "0.7rem", padding: "0.15rem 0.35rem", border: "1px solid #e5e7eb", borderRadius: 6, textDecoration: "none" }}>Open</a>
                    <button onClick={() => del(f.key)} style={{ fontSize: "0.7rem", padding: "0.15rem 0.35rem", border: "1px solid #e5e7eb", borderRadius: 6, color: "#dc2626", cursor: "pointer" }}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </>) : (
        <section className="library">
          <div className="empty"><div className="empty-icon">🔒</div><strong>Sign in to manage your media</strong><span>Authentication is required to upload, view, and delete files.</span></div>
        </section>
      )}
    </main>
  );
}

export default App;
