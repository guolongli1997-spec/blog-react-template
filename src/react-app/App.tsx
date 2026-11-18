
import { useState } from "react";
import Uppy from "@uppy/core";
import XHRUpload from "@uppy/xhr-upload";
import Dashboard from "@uppy/react/dashboard";
import "./App.css";

function App() {
  const [folder, setFolder] = useState("shared");

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
      endpoint: "/api/upload",
      method: "POST",
      formData: true,
      fieldName: "file",
      allowedMetaFields: ["folder"],
    }),
  );

  const folders = [
    "shared",
    "websites/blog",
    "websites/flytripvisa",
    "websites/other",
  ];

  function changeFolder(value: string) {
    setFolder(value);
    uppy.setMeta({ folder: value });
  }

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">M</div>
          <span>MediaCloud</span>
        </div>

        <p className="nav-label">WORKSPACE</p>
        <nav>
          <a className="active" href="#dashboard">▦ Dashboard</a>
          <a href="#upload">↑ Upload files</a>
          <a href="#library">▤ My files</a>
          <a href="#folders">▣ Folders</a>
        </nav>

        <div className="sidebar-bottom">
          <span>Cloud Storage</span>
          <strong>Cloudflare R2</strong>
          <small>Storage integration pending</small>
        </div>
      </aside>

      <section className="main-content" id="dashboard">
        <header className="topbar">
          <div>
            <span className="eyebrow">PERSONAL WORKSPACE</span>
            <h1>Cloud Drive</h1>
          </div>
          <div className="avatar">A</div>
        </header>

        <section className="welcome">
          <div>
            <span className="eyebrow">YOUR FILES, YOUR SPACE</span>
            <h2>Everything in one place.</h2>
            <p>Upload and organize your digital assets securely.</p>
          </div>
          <div className="welcome-icon">☁</div>
        </section>

        <section className="stats">
          <article className="stat-card">
            <span>Total files</span>
            <strong>--</strong>
            <small>Waiting for R2 API</small>
          </article>
          <article className="stat-card">
            <span>Storage used</span>
            <strong>--</strong>
            <small>Waiting for R2 API</small>
          </article>
          <article className="stat-card">
            <span>Storage provider</span>
            <strong>R2</strong>
            <small>Cloudflare Object Storage</small>
          </article>
        </section>

        <section className="upload-section" id="upload">
          <div className="section-heading">
            <div>
              <span className="eyebrow">FILE MANAGER</span>
              <h2>Upload files</h2>
            </div>
            <select
              value={folder}
              onChange={(e) => changeFolder(e.target.value)}
            >
              {folders.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <Dashboard
            uppy={uppy}
            height={390}
            proudlyDisplayPoweredByUppy={false}
            hideProgressDetails={false}
            note="Images, videos and documents. Maximum 100 MB per file."
          />
        </section>

        <section className="library-section" id="library">
          <div className="section-heading">
            <div>
              <span className="eyebrow">YOUR COLLECTION</span>
              <h2>Recent files</h2>
            </div>
          </div>

          <div className="empty-state">
            <div className="empty-icon">▤</div>
            <h3>Your library is ready</h3>
            <p>Files will appear here after the R2 API is connected.</p>
          </div>
        </section>

        <footer>
          MediaCloud · Powered by Cloudflare R2
        </footer>
      </section>
    </main>
  );
}

export default App;
