import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import TrainingLab from './TrainingLab';
import TrainingCropper from './TrainingCropper';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CloudUpload,
  File,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Image,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react';
import {
  api,
  bytes,
  date,
  download,
  type Doc,
  type Extraction,
  type ExtractionProfile,
  type Settings,
  type User,
} from './api';
type Page = 'overview' | 'documents' | 'settings' | 'guide' | 'training';
const labels = {
  overview: 'Overview',
  documents: 'Document library',
  settings: 'Workspace settings',
  guide: 'Getting started',
  training: 'Local training lab',
};
const profileOptions: {
  id: ExtractionProfile;
  label: string;
  description: string;
  icon: typeof Sparkles;
}[] = [
  {
    id: 'auto',
    label: 'Auto route',
    description: 'Invoices, receipts, spreadsheets and general files',
    icon: WandSparkles,
  },
  {
    id: 'document',
    label: 'Clean document',
    description: 'Word, PDF and text-first business documents',
    icon: FileText,
  },
  {
    id: 'poster',
    label: 'Poster / visual list',
    description: 'Multi-column headings and numbered labels',
    icon: Image,
  },
  {
    id: 'screenshot',
    label: 'App screenshot',
    description: 'Foreground errors, messages and visible actions',
    icon: LayoutDashboard,
  },
  {
    id: 'job_description',
    label: 'Job description',
    description: 'Responsibilities, requirements, skills and shifts',
    icon: BookOpen,
  },
];
const profileLabel = (profile: ExtractionProfile | undefined) =>
  profileOptions.find((option) => option.id === (profile || 'auto'))?.label || 'Auto route';
const fileIcon = (ext: string) =>
  ['xlsx', 'xls', 'csv'].includes(ext)
    ? FileSpreadsheet
    : ['jpg', 'jpeg', 'png', 'webp', 'gif', 'tif', 'tiff', 'bmp', 'avif'].includes(ext)
      ? Image
      : FileText;
function FileMark({ ext }: { ext: string }) {
  const Icon = fileIcon(ext);
  return (
    <span
      className={`file-mark ${['xlsx', 'xls', 'csv'].includes(ext) ? 'excel' : ['doc', 'docx'].includes(ext) ? 'word' : ext === 'pdf' ? 'pdf' : 'other'}`}
    >
      <Icon size={21} />
    </span>
  );
}
function Status({ status }: { status: Doc['status'] }) {
  return (
    <span className={`status ${status}`}>
      <i />
      {
        {
          queued: 'Queued',
          processing: 'Processing',
          ready: 'Needs review',
          reviewed: 'Verified',
          failed: 'Failed',
        }[status]
      }
    </span>
  );
}
function Auth({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ user: User }>(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify({
          name: data.get('name'),
          email: data.get('email'),
          password: data.get('password'),
        }),
      });
      onLogin(result.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function demo() {
    setBusy(true);
    setError('');
    try {
      onLogin((await api<{ user: User }>('/auth/demo', { method: 'POST', body: '{}' })).user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-screen">
      <section className="auth-story">
        <Brand />
        <div className="story-body">
          <span className="eyebrow light">
            <Sparkles size={14} /> YOUR DOCUMENTS, UNTANGLED
          </span>
          <h1>
            Less paperwork.
            <br />
            <span>More possibilities.</span>
          </h1>
          <p>
            Turn invoices, spreadsheets and everyday documents into clear, useful data. Extract it.
            Check it. Put it to work.
          </p>
          <div className="story-preview">
            <div className="mini-document">
              <FileText size={28} />
              <strong>Invoice_1042.pdf</strong>
              <small>Document uploaded</small>
            </div>
            <div className="flow-arrow">
              <Sparkles />
            </div>
            <div className="mini-result">
              <div>
                <span>Invoice number</span>
                <strong>NS-2026-1042</strong>
              </div>
              <div>
                <span>Total amount</span>
                <strong>₹49,560.00</strong>
              </div>
              <div className="mini-verified">
                <Check size={13} /> Ready for your review
              </div>
            </div>
          </div>
          <div className="story-features">
            <span>
              <ShieldCheck size={17} /> Private workspaces
            </span>
            <span>
              <FileSpreadsheet size={17} /> Excel & Word
            </span>
            <span>
              <WandSparkles size={17} /> OCR + optional AI
            </span>
          </div>
        </div>
        <p className="auth-foot">DOCUMENT INTELLIGENCE, WITH A HUMAN IN THE LOOP.</p>
      </section>
      <section className="auth-panel">
        <div className="auth-form">
          <div className="auth-symbol">
            <Sparkles size={28} />
          </div>
          <h2>{mode === 'login' ? 'Welcome to your workspace' : 'Create your workspace'}</h2>
          <p>
            {mode === 'login'
              ? 'Your next useful insight starts with a document.'
              : 'A little less admin. A lot more clarity.'}
          </p>
          <button className="btn primary full demo-button" onClick={demo} disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />} Explore
            live demo <ArrowRight size={17} />
          </button>
          <small className="demo-hint">Sample documents · No signup or API key needed</small>
          <div className="divider">
            <span>or {mode === 'login' ? 'sign in' : 'create an account'}</span>
          </div>
          <form onSubmit={submit}>
            {mode === 'register' && (
              <label>
                Your name
                <input
                  name="name"
                  placeholder="Mohit Gautam"
                  minLength={2}
                  maxLength={80}
                  required
                  autoComplete="name"
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                placeholder="At least 10 characters"
                minLength={10}
                maxLength={72}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>
            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}
            <button disabled={busy} className="btn secondary full">
              {mode === 'login' ? 'Sign in' : 'Create account'}
              <ArrowRight size={16} />
            </button>
          </form>
          <p className="switch-auth">
            {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
            <button
              onClick={() => {
                setError('');
                setMode(mode === 'login' ? 'register' : 'login');
              }}
            >
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
          <p className="auth-privacy">
            <ShieldCheck size={14} /> Your files stay in your own workspace.
          </p>
        </div>
      </section>
    </main>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Sparkles size={22} />
      </span>
      <span>
        DocScrape<span className="ai-tag">AI</span>
      </span>
      <span className="beta-tag">BETA</span>
    </div>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [page, setPage] = useState<Page>('overview');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<Doc | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProfile, setUploadProfile] = useState<ExtractionProfile>('auto');
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function message(text: string, error = false) {
    setToast({ text, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }
  async function refresh() {
    const [documents, configuration] = await Promise.all([
      api<{ documents: Doc[] }>('/documents'),
      api<Settings>('/config'),
    ]);
    setDocs(documents.documents);
    setSettings(configuration);
  }
  useEffect(() => {
    api<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    refresh().catch((e) => message(e.message, true));
    const socket = io({ withCredentials: true });
    const update = (doc: Doc) => {
      setDocs((old) => {
        const next = old.filter((d) => d.id !== doc.id);
        return [doc, ...next].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      });
      setSelected((old) => (old?.id === doc.id ? doc : old));
    };
    socket.on('document:updated', update);
    // Polling makes completion robust to a dropped Socket.io connection.
    const timer = setInterval(() => {
      api<{ documents: Doc[] }>('/documents')
        .then((r) => {
          setDocs(r.documents);
          setSelected((old) => (old ? r.documents.find((d) => d.id === old.id) || null : null));
        })
        .catch(() => {});
    }, 5000);
    return () => {
      socket.disconnect();
      clearInterval(timer);
    };
  }, [user?.id]);
  async function upload(files: FileList | File[] | null) {
    if (!files?.length || uploading) return;
    setUploading(true);
    setUploadOpen(true);
    let success = 0;
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (!settings?.extensions.includes(ext)) {
          message(`${file.name}: unsupported format.`, true);
          continue;
        }
        if (file.size > settings.maxUploadBytes) {
          message(`${file.name}: exceeds ${bytes(settings.maxUploadBytes)}.`, true);
          continue;
        }
        if (
          ['poster', 'screenshot'].includes(uploadProfile) &&
          !['jpg', 'jpeg', 'png', 'webp', 'gif', 'tif', 'tiff', 'bmp', 'avif'].includes(ext)
        ) {
          message(`${profileLabel(uploadProfile)} accepts image files only.`, true);
          continue;
        }
        const form = new FormData();
        form.append('file', file);
        form.append('profile', uploadProfile);
        try {
          const result = await api<{ document: Doc }>('/documents', { method: 'POST', body: form });
          setDocs((old) => [result.document, ...old.filter((d) => d.id !== result.document.id)]);
          success++;
        } catch (e) {
          message((e as Error).message, true);
        }
      }
      if (success) {
        setUploadOpen(false);
        setPage('documents');
        message(`${success} document${success > 1 ? 's' : ''} uploaded. Processing has started.`);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST', body: '{}' });
      setUser(null);
      setDocs([]);
      setSelected(null);
      setPage('overview');
    } catch (e) {
      message((e as Error).message, true);
    }
  }
  if (loading)
    return (
      <div className="initial-loading">
        <Brand />
        <LoaderCircle className="spin" />
      </div>
    );
  if (!user) return <Auth onLogin={setUser} />;
  const ready = docs.filter((d) => d.status === 'ready').length;
  const reviewed = docs.filter((d) => d.status === 'reviewed').length;
  const processing = docs.filter((d) => ['processing', 'queued'].includes(d.status)).length;
  const visible = docs.filter(
    (d) =>
      (filter === 'all' || d.status === filter) &&
      `${d.name} ${d.extraction?.documentType || ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  const totalSize = docs.reduce((s, d) => s + d.size, 0);
  const measured = docs.filter((d) => d.processingMs && ['ready', 'reviewed'].includes(d.status));
  const average = measured.length
    ? `${(measured.reduce((s, d) => s + d.processingMs!, 0) / measured.length / 1000).toFixed(1)}s`
    : '—';
  function table(rows: Doc[]) {
    return (
      <div className="table-scroll">
        <table className="document-table">
          <thead>
            <tr>
              <th>Document name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Uploaded</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((doc) => (
              <tr key={doc.id} onClick={() => setSelected(doc)}>
                <td>
                  <button className="document-link" onClick={() => setSelected(doc)}>
                    <FileMark ext={doc.extension} />
                    <span>
                      <strong>{doc.name}</strong>
                      <small>
                        {bytes(doc.size)}
                        {doc.sample ? ' · Sample document' : ''}
                      </small>
                    </span>
                  </button>
                </td>
                <td>
                  <span className="type-label">{doc.extension.toUpperCase()}</span>
                  {doc.profile && doc.profile !== 'auto' && (
                    <small className="profile-label">{profileLabel(doc.profile)}</small>
                  )}
                </td>
                <td>
                  <Status status={doc.status} />
                </td>
                <td className="muted">{date(doc.createdAt)}</td>
                <td>
                  <button
                    className="icon-btn"
                    title={`Review ${doc.name}`}
                    aria-label={`Review ${doc.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(doc);
                    }}
                  >
                    <ChevronRight size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">
            <FolderOpen size={34} />
            <h3>
              {query || filter !== 'all'
                ? 'No matching documents'
                : 'A fresh start for your documents'}
            </h3>
            <p>
              {query || filter !== 'all'
                ? 'Try a different search or filter.'
                : 'Upload your first file to turn paperwork into useful data.'}
            </p>
            {!query && filter === 'all' && (
              <button className="btn primary" onClick={() => setUploadOpen(true)}>
                <Plus size={16} /> Upload a document
              </button>
            )}
          </div>
        )}
      </div>
    );
  }
  const uploadArea = (
    <div
      className={`upload-zone ${drag ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <span className="upload-icon">
        {uploading ? <LoaderCircle size={29} className="spin" /> : <CloudUpload size={29} />}
      </span>
      <h3>
        {uploading ? 'Uploading your documents…' : `Drop files into ${profileLabel(uploadProfile)}`}
      </h3>
      <p>
        or{' '}
        <button className="text-btn" disabled={uploading} onClick={() => inputRef.current?.click()}>
          browse files
        </button>{' '}
        from your computer
      </p>
      <div className="format-chips">
        <span>PDF</span>
        <span>Word</span>
        <span>Excel / CSV</span>
        <span>Images</span>
      </div>
      <small>
        Up to {settings ? bytes(settings.maxUploadBytes) : '15 MB'} per file · Select multiple
        documents
      </small>
    </div>
  );
  return (
    <div className="app-shell">
      <input
        hidden
        ref={inputRef}
        type="file"
        multiple
        accept={settings?.extensions.map((e) => '.' + e).join(',')}
        onChange={(e) => void upload(e.target.files)}
      />
      <aside className="sidebar">
        <Brand />
        <div className="workspace-chip">
          <span className="workspace-avatar">{user.name.charAt(0)}</span>
          <div>
            <strong>
              {user.demo ? 'Demo workspace' : `${user.name.split(' ')[0]}'s workspace`}
            </strong>
            <small>Personal workspace</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {(
            [
              { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
              { id: 'documents', icon: FolderOpen, label: 'Documents' },
              { id: 'settings', icon: Settings2, label: 'Settings' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setPage(item.id);
                setQuery('');
                setFilter('all');
              }}
              className={page === item.id ? 'active' : ''}
            >
              <item.icon size={19} />
              {item.label}
              {item.id === 'documents' && <span className="nav-count">{docs.length}</span>}
            </button>
          ))}
          {settings?.localTraining && (
            <button
              className={page === 'training' ? 'active' : ''}
              onClick={() => setPage('training')}
            >
              <Activity size={19} /> Training lab
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="usage-card">
            <div>
              <span>Workspace usage</span>
              <strong>
                {docs.length}
                <small> / {settings?.maxDocuments || 100}</small>
              </strong>
            </div>
            <div className="meter">
              <i
                style={{
                  width: `${Math.min(100, (docs.length / (settings?.maxDocuments || 100)) * 100)}%`,
                }}
              />
            </div>
            <small>{bytes(totalSize)} of documents stored</small>
          </div>
          <button className="help-link" onClick={() => setPage('guide')}>
            <CircleHelp size={18} /> Getting started <ArrowUpRight size={14} />
          </button>
          <div className="user-card">
            <span className="user-avatar">
              {user.name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.demo ? 'Demo session' : user.email}</small>
            </div>
            <button className="icon-btn" title="Sign out" aria-label="Sign out" onClick={logout}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{labels[page]}</strong>
          </div>
          <div className="top-actions">
            <span className="beta-status">
              <ShieldCheck size={13} /> Beta · review required
            </span>
            <span className="provider-indicator">
              <i />
              {settings?.provider === 'openai' ? 'AI connected' : 'Local extraction'}
            </span>
            <button
              className="icon-btn notification"
              title={`${ready} documents need review`}
              aria-label="Show documents needing review"
              onClick={() => {
                setPage('documents');
                setFilter('ready');
              }}
            >
              <Bell size={19} />
              {ready > 0 && <i />}
            </button>
          </div>
        </header>
        <main className="content">
          <div className={`page-heading ${page === 'overview' ? 'spatial-hero' : ''}`}>
            <div>
              <div className="eyebrow">
                {page === 'overview' ? 'HUMAN-VERIFIED DOCUMENT INTELLIGENCE' : 'YOUR WORKSPACE'}
              </div>
              <h1>{page === 'overview' ? `Turn messy inputs into clear data.` : labels[page]}</h1>
              <p>
                {page === 'overview'
                  ? 'Route documents, posters and screenshots through the right extraction path—then verify every result.'
                  : page === 'documents'
                    ? 'Upload, extract and verify. Your documents are in good hands.'
                    : page === 'settings'
                      ? 'Your workspace, processing preferences and supported formats.'
                      : page === 'training'
                        ? 'Approve labels, measure errors and train English/Hindi models on your computer.'
                        : 'From document to verified data, in a few simple steps.'}
              </p>
            </div>
            {['overview', 'documents'].includes(page) && (
              <button className="btn primary" onClick={() => setUploadOpen(true)}>
                <Plus size={18} /> Upload documents
              </button>
            )}
            {page === 'overview' && (
              <div className="hero-orbit" aria-hidden="true">
                <span className="orbit-core">
                  <Sparkles size={24} />
                </span>
                <i className="orbit-node node-one" />
                <i className="orbit-node node-two" />
                <i className="orbit-node node-three" />
              </div>
            )}
          </div>
          {page === 'overview' && (
            <>
              <div className="stats-grid">
                <Stat
                  label="Total documents"
                  value={String(docs.length)}
                  detail={`${processing} processing now`}
                  icon={<FileText size={20} />}
                  color="purple"
                />
                <Stat
                  label="Verified documents"
                  value={String(reviewed)}
                  detail="Reviewed and ready to use"
                  icon={<FileCheck2 size={20} />}
                  color="green"
                />
                <Stat
                  label="Awaiting review"
                  value={String(ready)}
                  detail="A quick check makes a difference"
                  icon={<CheckCheck size={20} />}
                  color="amber"
                />
                <Stat
                  label="Avg. processing time"
                  value={average}
                  detail={
                    measured.length
                      ? 'Based on completed uploads'
                      : 'Upload a file to start measuring'
                  }
                  icon={<Activity size={20} />}
                  color="blue"
                />
              </div>
              <div className="overview-grid">
                <section className="card upload-card">
                  <div className="card-heading">
                    <h2>Make your next document useful</h2>
                    <span className="tiny-badge">
                      <Sparkles size={12} /> SMART EXTRACTION
                    </span>
                  </div>
                  <div className="profile-rail" aria-label="Quick extraction route">
                    {profileOptions.map((option) => (
                      <button
                        key={option.id}
                        className={uploadProfile === option.id ? 'selected' : ''}
                        onClick={() => setUploadProfile(option.id)}
                        title={option.description}
                      >
                        <option.icon size={14} /> {option.label}
                      </button>
                    ))}
                  </div>
                  {uploadArea}
                  <div className="privacy-note">
                    <ShieldCheck size={14} />
                    {settings?.provider === 'openai'
                      ? 'Text is sent to your configured AI provider.'
                      : 'Local mode keeps document text on your server.'}
                  </div>
                </section>
                <section className="card activity-card">
                  <div className="card-heading">
                    <h2>Document activity</h2>
                    <span className="muted">Last 7 days</span>
                  </div>
                  <div className="activity-total">
                    <strong>
                      {
                        docs.filter(
                          (d) => Date.now() - new Date(d.createdAt).getTime() < 7 * 86400000,
                        ).length
                      }
                    </strong>
                    <span>documents uploaded</span>
                  </div>
                  <div className="bar-chart">
                    {Array.from({ length: 7 }, (_, i) => {
                      const day = new Date();
                      day.setDate(day.getDate() - 6 + i);
                      const count = docs.filter(
                        (d) => new Date(d.createdAt).toDateString() === day.toDateString(),
                      ).length;
                      const max = Math.max(
                        1,
                        ...Array.from({ length: 7 }, (_, j) => {
                          const dt = new Date();
                          dt.setDate(dt.getDate() - 6 + j);
                          return docs.filter(
                            (d) => new Date(d.createdAt).toDateString() === dt.toDateString(),
                          ).length;
                        }),
                      );
                      return (
                        <div
                          className="bar-column"
                          key={i}
                          title={`${day.toLocaleDateString()}: ${count} documents`}
                        >
                          <div className="bar-track">
                            <div
                              className={i === 6 ? 'today' : ''}
                              style={{ height: `${(count / max) * 100}%` }}
                            />
                          </div>
                          <small>{day.toLocaleDateString(undefined, { weekday: 'short' })}</small>
                        </div>
                      );
                    })}
                  </div>
                  <div className="chart-legend">
                    <i /> Uploaded documents <span>{reviewed} verified</span>
                  </div>
                </section>
              </div>
              <section className="card library-card">
                <div className="card-heading">
                  <h2>
                    Recent documents <span className="heading-count">{docs.length}</span>
                  </h2>
                  <button className="text-btn" onClick={() => setPage('documents')}>
                    View all documents <ArrowRight size={15} />
                  </button>
                </div>
                {table(docs.slice(0, 5))}
              </section>
              <div className="bottom-tip">
                <span>
                  <Sparkles size={18} />
                  <strong>Small check. Big confidence.</strong> Review extracted values against the
                  source before exporting.
                </span>
                <button
                  className="text-btn"
                  onClick={() => {
                    setPage('documents');
                    setFilter('ready');
                  }}
                >
                  Review documents <ArrowRight size={15} />
                </button>
              </div>
            </>
          )}
          {page === 'documents' && (
            <>
              <section className="card library-card">
                <div className="library-toolbar">
                  <div className="filter-tabs">
                    {[
                      ['all', 'All documents'],
                      ['ready', 'Needs review'],
                      ['reviewed', 'Verified'],
                      ['failed', 'Failed'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        className={filter === value ? 'selected' : ''}
                        onClick={() => setFilter(value)}
                      >
                        {label}
                        <span>
                          {value === 'all'
                            ? docs.length
                            : docs.filter((d) => d.status === value).length}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="search-field">
                    <Search size={16} />
                    <input
                      placeholder="Search documents…"
                      aria-label="Search documents"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                </div>
                {table(visible)}
              </section>
              <div className="library-caption">
                <ShieldCheck size={14} /> Files are visible only within your authenticated
                workspace.
                <span>
                  {visible.length} document{visible.length !== 1 ? 's' : ''}
                </span>
              </div>
            </>
          )}
          {page === 'training' && <TrainingLab user={user} notify={message} />}
          {page === 'settings' && (
            <div className="settings-grid">
              <section className="card settings-card">
                <div className="card-heading">
                  <h2>Workspace profile</h2>
                  <ShieldCheck size={18} />
                </div>
                <dl>
                  <div>
                    <dt>Name</dt>
                    <dd>{user.name}</dd>
                  </div>
                  <div>
                    <dt>Account</dt>
                    <dd>{user.demo ? 'Isolated demo session' : user.email}</dd>
                  </div>
                  <div>
                    <dt>Document limit</dt>
                    <dd>{settings?.maxDocuments} documents</dd>
                  </div>
                  <div>
                    <dt>Upload limit</dt>
                    <dd>{settings && bytes(settings.maxUploadBytes)} per document</dd>
                  </div>
                </dl>
                <div className="info-callout">
                  {user.demo
                    ? 'Demo samples are synthetic. Your session has its own private workspace. Create an account to return using your email and password.'
                    : 'Your files and extracted results are saved between visits.'}
                </div>
              </section>
              <section className="card settings-card">
                <div className="card-heading">
                  <h2>Extraction engine</h2>
                  <WandSparkles size={18} />
                </div>
                <div className="engine-name">
                  <span className="engine-icon">
                    <Sparkles size={25} />
                  </span>
                  <div>
                    <strong>
                      {settings?.provider === 'openai'
                        ? 'OpenAI structured extraction'
                        : 'Local document extraction'}
                    </strong>
                    <small>
                      {settings?.provider === 'openai'
                        ? settings.model
                        : 'No paid API key required'}
                    </small>
                  </div>
                  <span className="status reviewed">
                    <i /> Active
                  </span>
                </div>
                <p className="settings-text">
                  {settings?.provider === 'openai'
                    ? 'Document text is sent to OpenAI to extract fields with source evidence. Review the results before use.'
                    : 'Parses real documents and extracts explicit labels and simple line items. For richer interpretation, enable OpenAI in the server configuration.'}
                </p>
                <p className="settings-text">
                  Images use OCR. Excel files keep worksheet tables. No formulas, macros or document
                  instructions are executed.
                </p>
              </section>
              <section className="card settings-card wide">
                <div className="card-heading">
                  <h2>Supported document formats</h2>
                  <File size={18} />
                </div>
                <div className="format-grid">
                  {[
                    {
                      label: 'PDF documents',
                      ext: 'PDF',
                      icon: FileText,
                      note: 'Text PDFs; scanned PDFs with Poppler',
                    },
                    {
                      label: 'Word documents',
                      ext: 'DOCX · DOC',
                      icon: FileText,
                      note: 'Legacy DOC uses LibreOffice',
                    },
                    {
                      label: 'Excel & text',
                      ext: 'XLSX · XLS · CSV · TXT',
                      icon: FileSpreadsheet,
                      note: 'Multiple worksheets; XLS uses LibreOffice',
                    },
                    {
                      label: 'Images',
                      ext: 'JPG · JPEG · PNG · WEBP · GIF · TIF · TIFF · BMP · AVIF',
                      icon: Image,
                      note: 'Text recognition; first frame of animations',
                    },
                  ].map((f) => (
                    <div className="format-detail" key={f.label}>
                      <f.icon size={22} />
                      <h3>{f.label}</h3>
                      <strong>{f.ext}</strong>
                      <p>{f.note}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
          {page === 'guide' && (
            <>
              <section className="card guide-card">
                <div className="guide-title">
                  <BookOpen size={25} />
                  <h2>Your document-to-data workflow</h2>
                </div>
                {[
                  {
                    title: 'Upload a document',
                    text: 'Drop a PDF, Word document, Excel workbook, CSV or supported image into the upload area. Multiple files are queued one at a time.',
                  },
                  {
                    title: 'Let extraction do the first pass',
                    text: 'The processor reads text, runs OCR where needed and extracts structured fields. You can watch the status update in the document library.',
                  },
                  {
                    title: 'Review against the source',
                    text: 'Open a document. Edit fields and line items, add missing values and check source text or worksheet tables. Mark it verified when you are satisfied.',
                  },
                  {
                    title: 'Take your data with you',
                    text: 'Export structured JSON, CSV or an Excel workbook. Excel exports include extracted fields, line items and source worksheets.',
                  },
                ].map((s, i) => (
                  <div className="guide-step" key={s.title}>
                    <span>{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <h3>{s.title}</h3>
                      <p>{s.text}</p>
                    </div>
                  </div>
                ))}
                <div className="info-callout">
                  Local mode uses rule matching. AI and OCR can make mistakes: verification means
                  you have checked the data, not a guarantee of accuracy. Large documents are
                  bounded; any truncation is shown in the review warnings.
                </div>
                <button className="btn primary" onClick={() => setUploadOpen(true)}>
                  <Plus size={17} /> Upload your first document
                </button>
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>DocScrape AI</span>
            <span>Built for less paperwork, and a little more peace of mind.</span>
          </footer>
        </main>
      </div>
      {uploadOpen && (
        <div className="modal-backdrop" onClick={() => !uploading && setUploadOpen(false)}>
          <section
            className="upload-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-heading">
              <h2 id="upload-title">Upload documents</h2>
              <button
                className="icon-btn"
                aria-label="Close upload"
                disabled={uploading}
                onClick={() => setUploadOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="profile-picker" role="radiogroup" aria-label="Extraction route">
              {profileOptions.map((option) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={uploadProfile === option.id}
                  className={uploadProfile === option.id ? 'selected' : ''}
                  key={option.id}
                  disabled={uploading}
                  onClick={() => setUploadProfile(option.id)}
                >
                  <span>
                    <option.icon size={17} />
                  </span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
            {uploadArea}
            <p className="modal-formats">
              {settings?.extensions.map((e) => e.toUpperCase()).join(' · ')}
            </p>
            <div className="info-callout">
              DOC and XLS need LibreOffice; scanned PDFs need Poppler. Both are included in the
              Docker setup.
            </div>
            <button
              className="btn primary full"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />} Choose
              documents
            </button>
          </section>
        </div>
      )}
      {selected && (
        <Review
          doc={selected}
          trainingEnabled={Boolean(settings?.localTraining && !user.demo)}
          close={() => setSelected(null)}
          notify={message}
          onSave={(doc) => {
            setSelected(doc);
            setDocs((old) => old.map((d) => (d.id === doc.id ? doc : d)));
          }}
          onDelete={(id) => {
            setSelected(null);
            setDocs((old) => old.filter((d) => d.id !== id));
          }}
        />
      )}
      {toast && (
        <div className={`toast ${toast.error ? 'toast-error' : ''}`} role="status">
          {toast.error ? <CircleHelp size={18} /> : <Check size={18} />}
          <span>{toast.text}</span>
          <button
            className="icon-btn"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  detail,
  icon,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <section className="stat-card">
      <div className="stat-label">
        {label}
        <span className={`stat-icon ${color}`}>{icon}</span>
      </div>
      <strong className="stat-number">{value}</strong>
      <small>{detail}</small>
    </section>
  );
}
function Review({
  doc,
  trainingEnabled,
  close,
  onSave,
  onDelete,
  notify,
}: {
  doc: Doc;
  trainingEnabled: boolean;
  close: () => void;
  onSave: (doc: Doc) => void;
  onDelete: (id: string) => void;
  notify: (text: string, error?: boolean) => void;
}) {
  const [draft, setDraft] = useState<Extraction | null>(
    doc.extraction ? structuredClone(doc.extraction) : null,
  );
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [source, setSource] = useState<'text' | 'cleaned' | 'tables' | 'image'>(
    !doc.sample &&
      ['jpg', 'jpeg', 'png', 'webp', 'gif', 'tif', 'tiff', 'bmp', 'avif'].includes(doc.extension)
      ? 'image'
      : 'cleaned',
  );
  const [tab, setTab] = useState<'fields' | 'items' | 'sections'>(
    doc.extraction?.sections?.length ? 'sections' : 'fields',
  );
  const [baseVersion, setBaseVersion] = useState(doc.version);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!dirty) {
      setDraft(doc.extraction ? structuredClone(doc.extraction) : null);
      setBaseVersion(doc.version);
      if (doc.extraction?.sections?.length) setTab('sections');
    }
  }, [doc.version, doc.id]);
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  function change(fn: (d: Extraction) => void) {
    setDraft((old) => {
      if (!old) return old;
      const copy = structuredClone(old);
      fn(copy);
      return copy;
    });
    setDirty(true);
  }
  async function save(reviewed: boolean) {
    if (!draft) return;
    setBusy(true);
    try {
      const result = await api<{ document: Doc }>(`/documents/${doc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ extraction: draft, reviewed, version: baseVersion }),
      });
      setDirty(false);
      setBaseVersion(result.document.version);
      onSave(result.document);
      notify(reviewed ? 'Document verified. You can now export your data.' : 'Changes saved.');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    setBusy(true);
    try {
      onSave(
        (await api<{ document: Doc }>(`/documents/${doc.id}/retry`, { method: 'POST', body: '{}' }))
          .document,
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api(`/documents/${doc.id}`, { method: 'DELETE', body: '{}' });
      onDelete(doc.id);
      notify('Document and its uploaded file deleted.');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function reprocess() {
    if (
      !window.confirm(
        'Reprocess this file with the latest extraction? This replaces saved extraction edits and verification. The original file is preserved.',
      )
    )
      return;
    setBusy(true);
    try {
      const result = await api<{ document: Doc }>(`/documents/${doc.id}/reprocess`, {
        method: 'POST',
        body: JSON.stringify({ version: doc.version }),
      });
      setDirty(false);
      onSave(result.document);
      notify('Document queued for fresh extraction.');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  function requestClose() {
    if (dirty) {
      if (!window.confirm('Discard your unsaved edits?')) return;
    }
    close();
  }
  return (
    <div className="modal-backdrop review-backdrop" onClick={requestClose}>
      <section
        className="review-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') requestClose();
          if (e.key === 'Tab') {
            const focusable = Array.from(
              e.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input, textarea, select, a[href]',
              ),
            );
            const first = focusable[0],
              last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header className="review-header">
          <FileMark ext={doc.extension} />
          <div>
            <h2 id="review-title">{doc.name}</h2>
            <small>
              {bytes(doc.size)} · {date(doc.createdAt)} · {profileLabel(doc.profile)} ·{' '}
              {doc.sample
                ? 'Synthetic sample'
                : doc.provider === 'openai'
                  ? 'AI extraction'
                  : 'Local extraction'}
            </small>
          </div>
          <Status status={doc.status} />
          <button
            ref={closeRef}
            className="icon-btn"
            aria-label="Close document review"
            onClick={requestClose}
          >
            <X size={21} />
          </button>
        </header>
        {['processing', 'queued'].includes(doc.status) ? (
          <div className="processing-state">
            <LoaderCircle className="spin" size={40} />
            <h2>{doc.stage}</h2>
            <p>
              Your document is being turned into useful data. This window updates automatically.
            </p>
          </div>
        ) : doc.status === 'failed' ? (
          <div className="processing-state">
            <CircleHelp size={40} />
            <h2>We couldn’t read this document</h2>
            <p>{doc.error}</p>
            <button className="btn primary" disabled={busy} onClick={retry}>
              Retry processing
            </button>
            <button
              className="text-btn danger"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              Delete document
            </button>
          </div>
        ) : (
          draft && (
            <>
              <div className="review-body">
                <section className="source-panel">
                  <div className="panel-heading">
                    <h3>
                      <FileText size={17} /> Source document
                    </h3>
                    <a
                      className="icon-btn"
                      href={`/api/documents/${doc.id}/original`}
                      title="Download original"
                      aria-label="Download original"
                    >
                      <ArrowDownToLine size={16} />
                    </a>
                  </div>
                  <div className="source-tabs">
                    {!doc.sample &&
                      ['jpg', 'jpeg', 'png', 'webp', 'gif', 'tif', 'tiff', 'bmp', 'avif'].includes(
                        doc.extension,
                      ) && (
                        <button
                          className={source === 'image' ? 'selected' : ''}
                          onClick={() => setSource('image')}
                        >
                          Original image
                        </button>
                      )}
                    <button
                      className={source === 'cleaned' ? 'selected' : ''}
                      onClick={() => setSource('cleaned')}
                    >
                      Cleaned text
                    </button>
                    <button
                      className={source === 'text' ? 'selected' : ''}
                      onClick={() => setSource('text')}
                    >
                      Original OCR / text
                    </button>
                    {doc.sheets.length > 0 && (
                      <button
                        className={source === 'tables' ? 'selected' : ''}
                        onClick={() => setSource('tables')}
                      >
                        Worksheets ({doc.sheets.length})
                      </button>
                    )}
                  </div>
                  {source === 'image' ? (
                    <div className="source-image">
                      <img
                        src={`/api/documents/${doc.id}/preview`}
                        alt={`Original source: ${doc.name}`}
                      />
                      <small>
                        Original image shown at preview size. Download the original for full
                        resolution.
                      </small>
                      {trainingEnabled && (
                        <button
                          className="btn secondary full training-from-document"
                          onClick={() => setTrainingOpen(true)}
                        >
                          <WandSparkles size={15} /> Correct & add to training
                        </button>
                      )}
                    </div>
                  ) : source !== 'tables' ? (
                    <div className="source-paper">
                      <div className="paper-top">
                        <span>{source === 'cleaned' ? 'CLEANED TEXT' : 'ORIGINAL OCR / TEXT'}</span>
                        <span>{doc.extension.toUpperCase()}</span>
                      </div>
                      <pre>
                        {source === 'cleaned' ? doc.cleanedText || doc.sourceText : doc.sourceText}
                      </pre>
                    </div>
                  ) : (
                    <div className="sheet-previews">
                      {doc.sheets.map((sheet, i) => (
                        <div key={i}>
                          <h4>
                            <FileSpreadsheet size={16} />
                            {sheet.name}
                          </h4>
                          <div className="table-scroll">
                            <table className="sheet-table">
                              <tbody>
                                {sheet.rows.slice(0, 100).map((row, j) => (
                                  <tr key={j}>
                                    {row.map((cell, k) => (
                                      <td key={k}>{cell}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {sheet.rows.length > 100 && (
                            <small>
                              Showing 100 of {sheet.rows.length} parsed rows. Full parsed data is
                              included in exports.
                            </small>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
                <section className="fields-panel">
                  <div className="panel-heading">
                    <h3>
                      <Sparkles size={17} /> Extracted data
                    </h3>
                    <span className="tiny-badge">{draft.documentType.replaceAll('_', ' ')}</span>
                  </div>
                  <label className="extraction-title">
                    Document title
                    <input
                      aria-label="Document title"
                      maxLength={300}
                      value={draft.title || ''}
                      onChange={(e) =>
                        change((d) => {
                          d.title = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label className="extraction-title">
                    Summary
                    <textarea
                      aria-label="Document summary"
                      maxLength={3000}
                      rows={2}
                      value={draft.summary}
                      onChange={(e) =>
                        change((d) => {
                          d.summary = e.target.value;
                        })
                      }
                    />
                  </label>
                  {draft.warnings.length > 0 && (
                    <details className="warnings">
                      <summary>
                        <CircleHelp size={14} /> {draft.warnings.length} processing note
                        {draft.warnings.length !== 1 ? 's' : ''}
                      </summary>
                      {draft.warnings.map((w, i) => (
                        <p key={i}>{w}</p>
                      ))}
                    </details>
                  )}
                  <div className="source-tabs">
                    <button
                      className={tab === 'sections' ? 'selected' : ''}
                      onClick={() => setTab('sections')}
                    >
                      Sections ({draft.sections?.length || 0})
                    </button>
                    <button
                      className={tab === 'fields' ? 'selected' : ''}
                      onClick={() => setTab('fields')}
                    >
                      Fields ({draft.fields.length})
                    </button>
                    <button
                      className={tab === 'items' ? 'selected' : ''}
                      onClick={() => setTab('items')}
                    >
                      Line items ({draft.lineItems.length})
                    </button>
                  </div>
                  {tab === 'sections' ? (
                    <div className="sections-editor">
                      {(draft.sections || []).map((section, si) => (
                        <div className="section-editor" key={si}>
                          <div className="section-heading">
                            <input
                              aria-label={`Section ${si + 1} name`}
                              value={section.name}
                              maxLength={200}
                              onChange={(e) =>
                                change((d) => {
                                  d.sections[si].name = e.target.value;
                                })
                              }
                            />
                            <button
                              className="icon-btn"
                              aria-label={`Remove section ${si + 1}`}
                              onClick={() =>
                                change((d) => {
                                  d.sections.splice(si, 1);
                                })
                              }
                            >
                              <X size={15} />
                            </button>
                          </div>
                          <small className="section-evidence">
                            Source heading: {section.evidence || 'Added manually'}
                          </small>
                          {section.items.map((item, ii) => (
                            <div
                              className={`section-item ${item.needsReview ? 'uncertain' : ''}`}
                              key={ii}
                            >
                              <div className="section-item-inputs">
                                <input
                                  type="number"
                                  aria-label={`Section ${si + 1} item ${ii + 1} number`}
                                  min={1}
                                  max={10000}
                                  placeholder="#"
                                  value={item.number ?? ''}
                                  onChange={(e) =>
                                    change((d) => {
                                      d.sections[si].items[ii].number = e.target.value
                                        ? Number(e.target.value)
                                        : null;
                                    })
                                  }
                                />
                                <input
                                  aria-label={`Section ${si + 1} item ${ii + 1} text`}
                                  value={item.text}
                                  maxLength={2000}
                                  onChange={(e) =>
                                    change((d) => {
                                      d.sections[si].items[ii].text = e.target.value;
                                    })
                                  }
                                />
                                <button
                                  className="icon-btn"
                                  aria-label={`Remove section ${si + 1} item ${ii + 1}`}
                                  onClick={() =>
                                    change((d) => {
                                      d.sections[si].items.splice(ii, 1);
                                    })
                                  }
                                >
                                  <X size={13} />
                                </button>
                              </div>
                              <small className="item-evidence" title={item.evidence}>
                                {item.evidence || 'Added manually · No source evidence'}
                              </small>
                              <label className="uncertain-check">
                                <input
                                  type="checkbox"
                                  checked={item.needsReview}
                                  onChange={(e) =>
                                    change((d) => {
                                      d.sections[si].items[ii].needsReview = e.target.checked;
                                    })
                                  }
                                />{' '}
                                Needs review
                              </label>
                            </div>
                          ))}
                          <button
                            className="text-btn"
                            disabled={section.items.length >= 200}
                            onClick={() =>
                              change((d) => {
                                d.sections[si].items.push({
                                  text: 'New item',
                                  number: null,
                                  evidence: '',
                                  needsReview: true,
                                });
                              })
                            }
                          >
                            <Plus size={13} /> Add item
                          </button>
                        </div>
                      ))}
                      {!draft.sections?.length && (
                        <p className="muted">
                          No sections detected. Add headings and list items here for posters, guides
                          or lists.
                        </p>
                      )}
                      <button
                        className="btn dashed full"
                        disabled={(draft.sections?.length || 0) >= 30}
                        onClick={() =>
                          change((d) => {
                            d.sections ??= [];
                            d.sections.push({ name: 'New section', evidence: '', items: [] });
                          })
                        }
                      >
                        <Plus size={15} /> Add section
                      </button>
                    </div>
                  ) : tab === 'fields' ? (
                    <div className="field-list">
                      {draft.fields.map((field, i) => (
                        <div className="editable-field" key={i}>
                          <div>
                            <input
                              className="field-key"
                              aria-label={`Field ${i + 1} name`}
                              value={field.key}
                              maxLength={100}
                              onChange={(e) =>
                                change((d) => {
                                  d.fields[i].key = e.target.value;
                                })
                              }
                            />
                            <button
                              className="icon-btn"
                              aria-label={`Remove field ${field.key}`}
                              onClick={() =>
                                change((d) => {
                                  d.fields.splice(i, 1);
                                })
                              }
                            >
                              <X size={13} />
                            </button>
                          </div>
                          <textarea
                            aria-label={field.key || `Field ${i + 1} value`}
                            rows={Math.max(1, Math.min(4, Math.ceil(field.value.length / 60)))}
                            maxLength={5000}
                            value={field.value}
                            onChange={(e) =>
                              change((d) => {
                                d.fields[i].value = e.target.value;
                              })
                            }
                          />
                          <small title={field.evidence}>
                            {field.evidence
                              ? `Source: ${field.evidence}`
                              : 'Added manually · No source evidence'}
                          </small>
                        </div>
                      ))}
                      <button
                        disabled={draft.fields.length >= 100}
                        className="btn dashed full"
                        onClick={() =>
                          change((d) => {
                            d.fields.push({ key: 'New field', value: '', evidence: '' });
                          })
                        }
                      >
                        <Plus size={15} /> Add field
                      </button>
                    </div>
                  ) : (
                    <div className="items-list">
                      {draft.lineItems.map((item, i) => (
                        <div className="item-edit" key={i}>
                          <div>
                            <label>
                              Description
                              <input
                                value={item.description}
                                maxLength={1000}
                                onChange={(e) =>
                                  change((d) => {
                                    d.lineItems[i].description = e.target.value;
                                  })
                                }
                              />
                            </label>
                            <button
                              className="icon-btn"
                              aria-label={`Remove line item ${i + 1}`}
                              onClick={() =>
                                change((d) => {
                                  d.lineItems.splice(i, 1);
                                })
                              }
                            >
                              <X size={15} />
                            </button>
                          </div>
                          <div className="item-numbers">
                            {(['quantity', 'unitPrice', 'amount'] as const).map((key) => (
                              <label key={key}>
                                {key === 'unitPrice'
                                  ? 'Unit price'
                                  : key === 'quantity'
                                    ? 'Quantity'
                                    : 'Amount'}
                                <input
                                  type="number"
                                  step="any"
                                  value={item[key] ?? ''}
                                  onChange={(e) =>
                                    change((d) => {
                                      d.lineItems[i][key] =
                                        e.target.value === '' ? null : Number(e.target.value);
                                    })
                                  }
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                      {!draft.lineItems.length && (
                        <p className="muted">
                          No line items detected. Add them if your document contains a table.
                        </p>
                      )}
                      <button
                        disabled={draft.lineItems.length >= 200}
                        className="btn dashed full"
                        onClick={() =>
                          change((d) => {
                            d.lineItems.push({
                              description: '',
                              quantity: null,
                              unitPrice: null,
                              amount: null,
                            });
                          })
                        }
                      >
                        <Plus size={15} /> Add line item
                      </button>
                    </div>
                  )}
                </section>
              </div>
              <footer className="review-footer">
                {!doc.sample && (
                  <button
                    className="icon-btn"
                    title="Reprocess with latest extraction"
                    aria-label="Reprocess document"
                    disabled={busy}
                    onClick={reprocess}
                  >
                    <WandSparkles size={17} />
                  </button>
                )}
                <button
                  className="icon-btn danger"
                  title="Delete document"
                  aria-label="Delete document"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={18} />
                </button>
                <div className="export-actions">
                  <span>Export</span>
                  {(['csv', 'xlsx', 'json'] as const).map((format) => (
                    <button
                      className="btn small secondary"
                      key={format}
                      disabled={dirty || busy}
                      title={
                        dirty ? 'Save changes before exporting' : `Export ${format.toUpperCase()}`
                      }
                      onClick={() => download(doc.id, format)}
                    >
                      {format.toUpperCase()}
                      <ArrowDownToLine size={13} />
                    </button>
                  ))}
                </div>
                <div className="save-actions">
                  {dirty && <small>Unsaved changes</small>}
                  <button
                    className="btn secondary"
                    disabled={busy || !dirty}
                    onClick={() => save(false)}
                  >
                    Save changes
                  </button>
                  <button className="btn primary" disabled={busy} onClick={() => save(true)}>
                    {busy ? <LoaderCircle className="spin" size={16} /> : <CheckCheck size={17} />}{' '}
                    Mark verified
                  </button>
                </div>
              </footer>
            </>
          )
        )}
        {confirmDelete && (
          <div className="delete-confirm">
            <strong>Delete this document and its original file?</strong>
            <p>This permanently removes the document from your workspace.</p>
            <div>
              <button className="btn secondary" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button className="btn destructive" disabled={busy} onClick={remove}>
                Delete document
              </button>
            </div>
          </div>
        )}
        {trainingOpen && (
          <TrainingCropper doc={doc} close={() => setTrainingOpen(false)} notify={notify} />
        )}
      </section>
    </div>
  );
}
