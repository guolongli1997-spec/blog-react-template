
import { useCallback, useEffect, useState } from "react";
import Uppy from "@uppy/core";
import XHRUpload from "@uppy/xhr-upload";
import { Dashboard } from "@uppy/react";
import "@uppy/core/css/style.min.css";
import "@uppy/dashboard/css/style.min.css";
import "./App.css";

type CloudFile = {
  key: string;
  size: number;
  uploaded?: string;
  httpMetadata?: {
    contentType?: string;
  };
};

const folders = [
  "shared",
  "websites/blog",
  "websites/flytripvisa",
  "websites/other",
];

const API = "/api";

function App() {
  const [folder, setFolder] = useState("shared");
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [preview, setPreview] = useState<string | null>(null);

  const [uppy] = useState(() =>
    new Uppy({
      id: "mediacloud-uploader",
      autoProceed: false,
      restrictions: {
        maxNumberOfFiles: 20,
        maxFileSize: 100 * 1024 * 1024,
      },
      meta: { folder: "shared" },
    }).use(XHRUpload, {
      endpoint: `${API}/upload`,
      method: "POST",
      formData: true,
      fieldName: "file",
      allowedMetaFields: ["folder"],
    }),
  );

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API}/files?prefix=${encodeURIComponent(folder + "/")}`,
      );

      if (!response.ok) {
        throw new Error(`File list failed: ${response.status}`);
      }

      const data = await response.json() as {
        files?: CloudFile[];
        objects?: CloudFile[];
      };

      setFiles(data.files ?? data.objects ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load files",
      );
    } finally {
      setLoading(false);
    }
  }, [folder]);

  useEffect(() => {
    uppy.setMeta({ folder });

    const onComplete = () => {
      void loadFiles();
    };

    uppy.on("complete", onComplete);

    return () => {
      uppy.off("complete", onComplete);
    };
  }, [uppy, folder, loadFiles]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    return () => {
      uppy.destroy();
    };
  }, [uppy]);

  async function deleteFile(key: string) {
    if (!window.confirm("Delete this file permanently?")) return;

    try {
      const response = await fetch(
        `${API}/file?key=${encodeURIComponent(key)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error("Delete failed");
      }

      await loadFiles();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Delete failed",
      );
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024)
      return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  const filteredFiles = files.filter((file) =>
    file.key.toLowerCase().includes(search.toLowerCase()),
  );

  const totalSize = files.reduce(
    (total, file) => total + file.size,
    0,
  );

  return (
    <div className="mediacloud">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">☁</span>
          <span>MediaCloud</span>
        </div>

        <p className="nav-label">WORKSPACE</p>

        <button
          className={tab === "dashboard" ? "nav-item active" : "nav-item"}
          onClick={() => setTab("dashboard")}
        >
          ◫ Dashboard
        </button>

        <button
          className={tab === "upload" ? "nav-item active" : "nav-item"}
          onClick={() => setTab("upload")}
        >
          ↑ Upload Files
        </button>

        <button
          className={tab === "files" ? "nav-item active" : "nav-item"}
          onClick={() => setTab("files")}
        >
          ▤ My Files
        </button>

        <p className="nav-label">STORAGE FOLDERS</p>

        {folders.map((item) => (
          <button
            key={item}
            className={folder === item ? "folder-item active" : "folder-item"}
            onClick={() => {
              setFolder(item);
              setTab("files");
            }}
          >
            📁 {item.split("/").pop()}
          </button>
        ))}

        <div className="sidebar-footer">
          <span className="status-dot" />
          Cloud Storage
          <small>R2 Connected through Worker</small>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h2>
              {tab === "dashboard"
                ? "Dashboard"
                : tab === "upload"
                  ? "Upload Files"
                  : "My Files"}
            </h2>
            <p>Manage your cloud storage</p>
          </div>

          <button
            className="primary-button"
            onClick={() => setTab("upload")}
          >
            + Upload Files
          </button>
        </header>

        {error && (
          <div className="error-message">
            {error}
            <button onClick={() => setError("")}>×</button>
          </div>
        )}

        {tab === "dashboard" && (
          <>
            <section className="welcome-card">
              <div>
                <span className="eyebrow">YOUR CLOUD WORKSPACE</span>
                <h1>Everything in one place.</h1>
                <p>
                  Upload, organize and manage your files
                  with MediaCloud.
                </p>
                <button
                  className="primary-button"
                  onClick={() => setTab("upload")}
                >
                  Start Uploading ↑
                </button>
              </div>
              <div className="welcome-icon">☁</div>
            </section>

            <section className="stats-grid">
              <div className="stat-card">
                <span>Total Files</span>
                <strong>{files.length}</strong>
                <small>Current folder</small>
              </div>
              <div className="stat-card">
                <span>Storage Used</span>
                <strong>{formatSize(totalSize)}</strong>
                <small>Current folder</small>
              </div>
              <div className="stat-card">
                <span>Active Folder</span>
                <strong className="folder-stat">
                  {folder.split("/").pop()}
                </strong>
                <small>Selected location</small>
              </div>
            </section>

            <section className="panel">
              <div className="section-heading">
                <div>
                  <h3>Recent Files</h3>
                  <p>Your latest stored files</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setTab("files")}
                >
                  View All →
                </button>
              </div>

              <FileList
                files={files.slice(0, 5)}
                loading={loading}
                onPreview={setPreview}
                onDelete={deleteFile}
                formatSize={formatSize}
              />
            </section>
          </>
        )}

        {tab === "upload" && (
          <section className="panel upload-panel">
            <div className="section-heading">
              <div>
                <h3>Upload to Cloud</h3>
                <p>Select files and choose a destination folder</p>
              </div>
            </div>

            <label className="field-label">Destination Folder</label>
            <select
              className="folder-select"
              value={folder}
              onChange={(event) => setFolder(event.target.value)}
            >
              {folders.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <Dashboard
              uppy={uppy}
              proudlyDisplayPoweredByUppy={false}
              height={400}
              note="Maximum 20 files, 100 MB per file"
            />
          </section>
        )}

        {tab === "files" && (
          <section className="panel">
            <div className="section-heading">
              <div>
                <h3>My Files</h3>
                <p>Browse files in your cloud storage</p>
              </div>
              <button
                className="secondary-button"
                onClick={() => void loadFiles()}
              >
                ↻ Refresh
              </button>
            </div>

            <div className="file-toolbar">
              <select
                className="folder-select"
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
              >
                {folders.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>

              <input
                className="search-input"
                placeholder="Search files..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <FileList
              files={filteredFiles}
              loading={loading}
              onPreview={setPreview}
              onDelete={deleteFile}
              formatSize={formatSize}
            />
          </section>
        )}
      </main>

      {preview && (
        <div
          className="preview-overlay"
          onClick={() => setPreview(null)}
        >
          <div
            className="preview-box"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="preview-close"
              onClick={() => setPreview(null)}
            >
              ×
            </button>
            <h3>File Preview</h3>
            <p>{preview}</p>
            <a
              href={`${API}/file?key=${encodeURIComponent(preview)}`}
              target="_blank"
              rel="noreferrer"
            >
              Open / Download File
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function FileList({
  files,
  loading,
  onPreview,
  onDelete,
  formatSize,
}: {
  files: CloudFile[];
  loading: boolean;
  onPreview: (key: string) => void;
  onDelete: (key: string) => void;
  formatSize: (bytes: number) => string;
}) {
  if (loading) {
    return <div className="empty-state">Loading files...</div>;
  }

  if (!files.length) {
    return (
      <div className="empty-state">
        <span>☁</span>
        <h3>No files found</h3>
        <p>Upload files to see them here.</p>
      </div>
    );
  }

  return (
    <div className="file-list">
      {files.map((file) => (
        <div className="file-row" key={file.key}>
          <div className="file-icon">📄</div>
          <div className="file-info">
            <strong>{file.key.split("/").pop()}</strong>
            <small>{file.key}</small>
          </div>
          <span className="file-size">{formatSize(file.size)}</span>
          <button
            className="icon-button"
            title="Preview"
            onClick={() => onPreview(file.key)}
          >
            ↗
          </button>
          <button
            className="icon-button delete-button"
            title="Delete"
            onClick={() => onDelete(file.key)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export default App;
