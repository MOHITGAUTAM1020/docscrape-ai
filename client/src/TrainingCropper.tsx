import { useRef, useState } from 'react';
import { Check, Crop, LoaderCircle, RotateCcw, X } from 'lucide-react';
import { api, type Doc } from './api';

type Selection = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function selectionFrom(start: Point, end: Point): Selection {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export default function TrainingCropper({
  doc,
  close,
  notify,
}: {
  doc: Doc;
  close: () => void;
  notify: (text: string, error?: boolean) => void;
}) {
  const image = useRef<HTMLImageElement>(null);
  const start = useRef<Point | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [text, setText] = useState('');
  const [language, setLanguage] = useState<'eng' | 'hin'>('eng');
  const [split, setSplit] = useState<'train' | 'validation' | 'test'>('test');
  const [disposition, setDisposition] = useState<'usable' | 'crossed_out' | 'illegible'>('usable');
  const [approved, setApproved] = useState(false);
  const [saved, setSaved] = useState(0);
  const [busy, setBusy] = useState(false);

  function point(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
  }

  function begin(event: React.PointerEvent<HTMLDivElement>) {
    if (busy) return;
    const next = point(event);
    start.current = next;
    setSelection({ x: next.x, y: next.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    setSelection(selectionFrom(start.current, point(event)));
  }

  function finish(event: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const next = selectionFrom(start.current, point(event));
    start.current = null;
    setSelection(next.width >= 0.015 && next.height >= 0.01 ? next : null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const source = image.current;
    if (!source || !selection) {
      notify('Draw a box around one text line first.', true);
      return;
    }
    if (disposition === 'usable' && !approved) {
      notify('Confirm that the transcription exactly matches the crop.', true);
      return;
    }
    const sx = Math.round(selection.x * source.naturalWidth);
    const sy = Math.round(selection.y * source.naturalHeight);
    const sw = Math.max(1, Math.round(selection.width * source.naturalWidth));
    const sh = Math.max(1, Math.round(selection.height * source.naturalHeight));
    if (sw < 20 || sh < 10) {
      notify('Select a larger crop containing one complete text line.', true);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    canvas.getContext('2d')?.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      notify('The selected crop could not be created.', true);
      return;
    }
    const form = new FormData();
    form.set('image', blob, `${doc.id}-${saved + 1}.png`);
    form.set('text', text.trim());
    form.set('language', language);
    form.set('split', split);
    form.set('sourceGroup', `document-${doc.id}`);
    form.set('disposition', disposition);
    form.set('approved', disposition === 'usable' && approved ? 'true' : 'false');
    setBusy(true);
    try {
      await api('/training/samples', { method: 'POST', body: form });
      setSaved((value) => value + 1);
      setSelection(null);
      setText('');
      setApproved(false);
      notify(
        disposition === 'usable'
          ? 'Labelled line added to the local dataset.'
          : 'Excluded line recorded without adding it to training.',
      );
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cropper-backdrop" role="presentation" onClick={close}>
      <section
        className="cropper-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cropper-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="cropper-header">
          <div>
            <span className="eyebrow">LOCAL OCR DATASET</span>
            <h2 id="cropper-title">Correct & add to training</h2>
            <p>Drag over one handwritten line, then enter exactly what it says.</p>
          </div>
          <button className="icon-btn" aria-label="Close training cropper" onClick={close}>
            <X size={19} />
          </button>
        </header>
        <div className="cropper-body">
          <div className="cropper-workspace">
            <div
              className="cropper-image"
              onPointerDown={begin}
              onPointerMove={move}
              onPointerUp={finish}
              onPointerCancel={() => {
                start.current = null;
              }}
            >
              <img
                ref={image}
                src={`/api/documents/${doc.id}/preview`}
                alt={`Select a text line from ${doc.name}`}
                draggable={false}
              />
              {selection && (
                <span
                  className="crop-selection"
                  style={{
                    left: `${selection.x * 100}%`,
                    top: `${selection.y * 100}%`,
                    width: `${selection.width * 100}%`,
                    height: `${selection.height * 100}%`,
                  }}
                />
              )}
            </div>
            <div className="cropper-hint">
              <Crop size={15} /> Select one complete line with a small margin around the writing.
              <button
                className="text-btn"
                disabled={!selection || busy}
                onClick={() => setSelection(null)}
              >
                <RotateCcw size={13} /> Clear selection
              </button>
            </div>
          </div>
          <form className="cropper-form" onSubmit={save}>
            <div className="cropper-progress">
              <strong>{saved}</strong>
              <span>lines saved from this document</span>
            </div>
            <label>
              Exact text on this line
              <textarea
                rows={3}
                maxLength={500}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Example: Chicken quarters"
                required
              />
            </label>
            <div className="training-form-row">
              <label>
                Language
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as 'eng' | 'hin')}
                >
                  <option value="eng">English</option>
                  <option value="hin">Hindi</option>
                </select>
              </label>
              <label>
                Dataset split
                <select
                  value={split}
                  disabled={saved > 0}
                  onChange={(event) =>
                    setSplit(event.target.value as 'train' | 'validation' | 'test')
                  }
                >
                  <option value="test">Held-out test</option>
                  <option value="train">Training</option>
                  <option value="validation">Validation</option>
                </select>
              </label>
            </div>
            <label>
              Line status
              <select
                value={disposition}
                onChange={(event) => {
                  const value = event.target.value as typeof disposition;
                  setDisposition(value);
                  if (value !== 'usable') setApproved(false);
                }}
              >
                <option value="usable">Readable — use for OCR</option>
                <option value="crossed_out">Crossed out — exclude</option>
                <option value="illegible">Illegible — exclude</option>
              </select>
            </label>
            {disposition === 'usable' ? (
              <label className="training-approved">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(event) => setApproved(event.target.checked)}
                />{' '}
                I checked that the text exactly matches this crop.
              </label>
            ) : (
              <div className="info-callout">
                This crop will be recorded for review but excluded from evaluation and training.
              </div>
            )}
            <div className="cropper-actions">
              <button type="button" className="btn secondary" onClick={close}>
                Done
              </button>
              <button
                className="btn primary"
                disabled={
                  busy || !selection || !text.trim() || (disposition === 'usable' && !approved)
                }
              >
                {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
                Save line
              </button>
            </div>
            <small className="cropper-split-note">
              Every crop from this document stays in the same split to prevent test leakage.
            </small>
          </form>
        </div>
      </section>
    </div>
  );
}
