import { useEffect, useState } from 'react';
import {
  Activity,
  Check,
  CloudDownload,
  FlaskConical,
  LoaderCircle,
  Play,
  ShieldCheck,
  Square,
} from 'lucide-react';
import { api, type User } from './api';
import type { TrainingSample, TrainingRun } from '../../server/src/training-lab';
type Lab = {
  samples: TrainingSample[];
  runs: TrainingRun[];
  readiness: {
    modelsReady: boolean;
    dockerReady: boolean;
    trainerReady: boolean;
    active: boolean;
    nativeReady: boolean;
    backend: string;
  };
};
const percent = (value: number | undefined) =>
  value === undefined ? '—' : `${(value * 100).toFixed(2)}%`;
export default function TrainingLab({
  user,
  notify,
}: {
  user: User;
  notify: (message: string, error?: boolean) => void;
}) {
  const [lab, setLab] = useState<Lab | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [language, setLanguage] = useState<'eng' | 'hin'>('eng'),
    [iterations, setIterations] = useState(1000),
    [selected, setSelected] = useState<string | null>(null);
  async function refresh() {
    try {
      setLab(await api<Lab>('/training'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (user.demo) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [user.id]);
  async function action(path: string, body: object = {}) {
    setBusy(true);
    try {
      const response = await api<{ directory?: string }>(`/training${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      notify(
        response.directory
          ? `Release saved locally: ${response.directory}`
          : 'Local job requested. Check progress below.',
      );
      await refresh();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set('approved', data.get('approved') === 'on' ? 'true' : 'false');
    setBusy(true);
    try {
      await api('/training/samples', { method: 'POST', body: data });
      form.reset();
      await refresh();
      notify('Text-line sample saved locally.');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (user.demo)
    return (
      <section className="card guide-card">
        <h2>Local training workspace</h2>
        <p className="settings-text">
          Create a local account to keep your labelled dataset and experiment history. Demo sessions
          cannot train or change models.
        </p>
        <div className="info-callout">
          The training lab is available only on your computer. It is disabled on the deployed
          website.
        </div>
      </section>
    );
  if (error)
    return (
      <section className="card guide-card">
        <h2>Training lab unavailable</h2>
        <p className="settings-text">{error}</p>
        <button className="btn secondary" onClick={refresh}>
          Retry
        </button>
      </section>
    );
  if (!lab)
    return (
      <div className="empty">
        <LoaderCircle className="spin" /> Loading local training workspace…
      </div>
    );
  const samples = lab.samples.filter((s) => s.language === language),
    approved = samples.filter((s) => s.approved);
  const counts = {
    train: approved.filter((s) => s.split === 'train').length,
    validation: approved.filter((s) => s.split === 'validation').length,
    test: approved.filter((s) => s.split === 'test').length,
  };
  const runs = lab.runs.filter((r) => r.language === language);
  const run = runs.find((r) => r.id === selected) || runs[0];
  return (
    <div className="training-lab">
      <div className="training-intro">
        <span>
          <ShieldCheck size={16} /> Local CPU training · no cloud training charges
        </span>
        <select
          aria-label="Training language"
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value as 'eng' | 'hin');
            setSelected(null);
          }}
        >
          <option value="eng">English</option>
          <option value="hin">Hindi / हिन्दी</option>
        </select>
      </div>
      <div className="training-steps">
        {[
          'Prepare models',
          'Approve labels',
          'Measure baseline',
          'Train locally',
          'Compare results',
          'Package release',
        ].map((step, i) => (
          <div key={step}>
            <span>{i + 1}</span>
            {step}
          </div>
        ))}
      </div>
      <div className="stats-grid">
        {[
          ['Approved lines', approved.length],
          ['Training lines', counts.train],
          ['Validation lines', counts.validation],
          ['Held-out test lines', counts.test],
        ].map(([title, value]) => (
          <section className="stat-card" key={title}>
            <div className="stat-label">{title}</div>
            <strong className="stat-number">{value}</strong>
            <small>
              {title === 'Held-out test lines'
                ? 'Never passed into the trainer'
                : 'Correct labels matter more than volume'}
            </small>
          </section>
        ))}
      </div>
      <div className="settings-grid">
        <section className="card settings-card">
          <div className="card-heading">
            <h2>1. Prepare your workstation</h2>
            <FlaskConical size={19} />
          </div>
          <div className="training-checks">
            <p>
              {lab.readiness.modelsReady ? <Check size={15} /> : <Square size={15} />} English/Hindi
              base models
            </p>
            <p>
              {lab.readiness.nativeReady ? <Check size={15} /> : <Square size={15} />} Native Ubuntu
              training tools
            </p>
            <p>
              {lab.readiness.trainerReady ? <Check size={15} /> : <Square size={15} />} Local
              trainer ready ({lab.readiness.backend})
            </p>
          </div>
          <div className="info-callout">
            Initial setup downloads open-source language models. Training and evaluation then run
            locally. On Windows, use Ubuntu and run <code>npm.cmd run training:setup</code> from the
            project folder. Docker is an optional alternative.
          </div>
          <div className="training-buttons">
            <button
              className="btn secondary"
              disabled={busy || lab.readiness.active}
              onClick={() => action('/setup')}
            >
              <CloudDownload size={15} /> Download base models
            </button>
          </div>
        </section>
        <section className="card settings-card">
          <div className="card-heading">
            <h2>2. Add an exact text-line label</h2>
            <ShieldCheck size={18} />
          </div>
          <form className="training-form" onSubmit={add}>
            <label>
              Cropped line image
              <input name="image" type="file" accept=".png,.jpg,.jpeg,.webp" required />
            </label>
            <label>
              Exact text in the image
              <textarea
                name="text"
                maxLength={500}
                rows={2}
                required
                placeholder={language === 'eng' ? 'Invoice number: 1042' : 'चालान संख्या: १०४२'}
              />
            </label>
            <div className="training-form-row">
              <label>
                Language
                <select name="language" defaultValue={language} key={language}>
                  <option value="eng">English</option>
                  <option value="hin">Hindi</option>
                </select>
              </label>
              <label>
                Split
                <select name="split">
                  <option value="train">Training</option>
                  <option value="validation">Validation</option>
                  <option value="test">Held-out test</option>
                </select>
              </label>
            </div>
            <label>
              Source document group
              <input
                name="sourceGroup"
                required
                minLength={2}
                maxLength={80}
                placeholder="invoice-1042 (same for every crop from this document)"
              />
            </label>
            <label className="training-approved">
              <input type="checkbox" name="approved" /> I checked that this transcription matches
              the image exactly.
            </label>
            <button className="btn primary" disabled={busy}>
              Save labelled line
            </button>
          </form>
        </section>
      </div>
      <section className="card training-run-controls">
        <div className="card-heading">
          <h2>3–5. Measure, train and compare</h2>
          <Activity size={18} />
        </div>
        <div className="info-callout">
          Start with a baseline. Training needs at least 20 train + 5 validation + 5 test lines per
          language, from separate source-document groups. These are smoke-test minimums; collect a
          larger representative test set before claiming production accuracy. Tests use single-line
          OCR, not whole-document layout scoring.
        </div>
        <div className="training-buttons">
          <button
            className="btn secondary"
            disabled={busy || lab.readiness.active || !lab.readiness.modelsReady || counts.test < 5}
            onClick={() => action('/runs', { language, kind: 'baseline', iterations })}
          >
            <Play size={15} /> Measure baseline
          </button>
          <label>
            Max iterations
            <input
              aria-label="Maximum training iterations"
              type="number"
              min={100}
              max={10000}
              value={iterations}
              onChange={(e) => setIterations(Number(e.target.value))}
            />
          </label>
          <button
            className="btn primary"
            disabled={
              busy ||
              lab.readiness.active ||
              !lab.readiness.modelsReady ||
              !lab.readiness.trainerReady ||
              counts.train < 20 ||
              counts.validation < 5 ||
              counts.test < 5
            }
            onClick={() => action('/runs', { language, kind: 'training', iterations })}
          >
            <FlaskConical size={16} /> Train and test locally
          </button>
          {run?.status === 'running' && (
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => action(`/runs/${run.id}/stop`)}
            >
              <Square size={14} /> Stop run
            </button>
          )}
        </div>
      </section>
      <section className="card library-card">
        <div className="card-heading">
          <h2>Experiment history</h2>
          <span className="muted">{runs.length} runs</span>
        </div>
        <div className="table-scroll">
          <table className="document-table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Stage</th>
                <th>Baseline CER</th>
                <th>Candidate CER</th>
                <th>Test set</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} onClick={() => setSelected(r.id)}>
                  <td>
                    <button className="text-btn" onClick={() => setSelected(r.id)}>
                      {new Date(r.createdAt).toLocaleString()}
                    </button>
                  </td>
                  <td>{r.stage}</td>
                  <td>{percent(r.baseline?.cer)}</td>
                  <td>{percent(r.candidate?.cer)}</td>
                  <td>{r.testHash.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!runs.length && (
            <div className="empty">
              No measured runs yet. Scores will appear only after real evaluation.
            </div>
          )}
        </div>
      </section>
      {run && (
        <section className="card training-report">
          <div className="card-heading">
            <h2>Run report · {run.status}</h2>
            <span className="muted">Dataset {run.datasetHash.slice(0, 12)}</span>
          </div>
          {run.error && <div className="error-message">{run.error}</div>}
          <div className="table-scroll">
            <table className="document-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Baseline</th>
                  <th>Candidate</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Character error rate', 'cer'],
                  ['Word error rate', 'wer'],
                  ['Hindi grapheme error rate', 'graphemeErrorRate'],
                  ['Exact-line match', 'exactLineRate'],
                ].map(([title, key]) => (
                  <tr key={key}>
                    <td>{title}</td>
                    <td>{percent(run.baseline?.[key as 'cer'])}</td>
                    <td>{percent(run.candidate?.[key as 'cer'])}</td>
                  </tr>
                ))}
                <tr>
                  <td>Recognition time / line</td>
                  <td>
                    {run.baseline
                      ? `${(run.baseline.milliseconds / run.baseline.lines).toFixed(0)} ms`
                      : '—'}
                  </td>
                  <td>
                    {run.candidate
                      ? `${(run.candidate.milliseconds / run.candidate.lines).toFixed(0)} ms`
                      : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="info-callout">
            Lower error rates are better. Higher exact-line match is better. Hindi uses
            NFC-normalized text, with grapheme scoring shown separately. Never compare scores across
            different test-set hashes.
          </div>
          {run.gate && (
            <div className="training-gate">
              <strong>
                {run.gate.passed ? 'Passed the smoke comparison gate' : 'Candidate rejected'}
              </strong>
              {run.gate.reasons.map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
              {run.gate.passed && (
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Package this smoke-tested model locally? This does not deploy or activate it. Test a larger English/Hindi/mixed set before production.',
                      )
                    )
                      void action(`/runs/${run.id}/release`);
                  }}
                >
                  Prepare model release
                </button>
              )}
            </div>
          )}
          {run.release && <p className="training-path">Release folder: {run.release}</p>}
          {run.predictions && (
            <details className="training-details">
              <summary>Review predictions against correct labels</summary>
              {run.predictions.map((p) => (
                <div key={p.sampleId}>
                  <strong>Expected:</strong> {p.expected}
                  <br />
                  <strong>Baseline:</strong> {p.baseline}
                  {p.candidate !== undefined && (
                    <>
                      <br />
                      <strong>Candidate:</strong> {p.candidate}
                    </>
                  )}
                </div>
              ))}
            </details>
          )}
          <details className="training-details" open={run.status === 'running'}>
            <summary>Training logs ({run.logs.length} lines)</summary>
            <pre>
              {run.logs.slice(-200).join('\n') ||
                'No trainer logs yet. Baseline evaluations do not run a trainer.'}
            </pre>
          </details>
        </section>
      )}
      <section className="card library-card">
        <div className="card-heading">
          <h2>Your labelled samples</h2>
          <span className="muted">{samples.length} lines</span>
        </div>
        <div className="training-samples">
          {samples
            .slice(-30)
            .reverse()
            .map((s) => (
              <Sample
                key={s.id}
                sample={s}
                disabled={busy || lab.readiness.active}
                saved={refresh}
                notify={notify}
              />
            ))}
          {!samples.length && (
            <div className="empty">Start with a few carefully checked text-line crops.</div>
          )}
        </div>
      </section>
      <div className="bottom-tip">
        <span>
          <ShieldCheck size={18} /> Successful tests do not automatically replace the active model
          or redeploy the website.
        </span>
      </div>
    </div>
  );
}
function Sample({
  sample,
  disabled,
  saved,
  notify,
}: {
  sample: TrainingSample;
  disabled: boolean;
  saved: () => Promise<void>;
  notify: (s: string, error?: boolean) => void;
}) {
  const [text, setText] = useState(sample.text),
    [approved, setApproved] = useState(sample.approved),
    [disposition, setDisposition] = useState(sample.disposition || 'usable');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api(`/training/samples/${sample.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ text, approved, disposition }),
      });
      await saved();
      notify('Label updated. Changed test labels create a new test-set hash.');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="training-sample">
      <img src={`/api/training/samples/${sample.id}/image`} alt="Text-line training sample" />
      <div>
        <small>
          {sample.sourceGroup} · {sample.split} · {sample.language} ·{' '}
          {(sample.disposition || 'usable').replace('_', ' ')}
        </small>
        <input
          aria-label={`Transcription ${sample.id}`}
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
        />
        <select
          aria-label={`Line status ${sample.id}`}
          value={disposition}
          onChange={(e) => {
            const value = e.target.value as typeof disposition;
            setDisposition(value);
            if (value !== 'usable') setApproved(false);
          }}
        >
          <option value="usable">Readable — use</option>
          <option value="crossed_out">Crossed out — exclude</option>
          <option value="illegible">Illegible — exclude</option>
        </select>
        <label>
          <input
            type="checkbox"
            checked={approved}
            disabled={disposition !== 'usable'}
            onChange={(e) => setApproved(e.target.checked)}
          />{' '}
          Human-approved
        </label>
        <button
          className="btn small secondary"
          disabled={
            disabled ||
            busy ||
            (text === sample.text &&
              approved === sample.approved &&
              disposition === (sample.disposition || 'usable'))
          }
          onClick={save}
        >
          Save label
        </button>
      </div>
    </div>
  );
}
