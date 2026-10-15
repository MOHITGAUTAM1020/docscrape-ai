# API reference

Base path `/api`. Authentication uses the `docscrape_session` HTTP-only cookie. Send credentials with requests. JSON routes expect `Content-Type: application/json`; uploads use `multipart/form-data`. State-changing browser requests must originate from an allowed origin. Errors return `{ "error": "message" }`.

| Method | Endpoint                           | Purpose                                                                  |
| ------ | ---------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/health`                          | Public health check                                                      |
| POST   | `/auth/register`                   | `{name, email, password}`; 10–72 character password                      |
| POST   | `/auth/login`                      | `{email, password}`                                                      |
| POST   | `/auth/demo`                       | `{}`; create an isolated demo session                                    |
| POST   | `/auth/logout`                     | `{}`; clear session cookie                                               |
| GET    | `/auth/me`                         | Authenticated profile                                                    |
| GET    | `/config`                          | Supported formats, quotas and provider mode                              |
| GET    | `/documents`                       | Workspace's documents, newest first                                      |
| POST   | `/documents`                       | Multipart `file` plus optional `profile`; one file per request; HTTP 202 |
| GET    | `/documents/:id`                   | Owned document and extracted data                                        |
| PATCH  | `/documents/:id`                   | `{extraction, reviewed, version}`; optimistic concurrency                |
| POST   | `/documents/:id/retry`             | `{}`; only failed uploaded documents                                     |
| POST   | `/documents/:id/reprocess`         | `{version}`; rerun a completed upload and reset extraction/verification  |
| DELETE | `/documents/:id`                   | `{}`; remove record and original file                                    |
| GET    | `/documents/:id/original`          | Download original file                                                   |
| GET    | `/documents/:id/preview`           | Authenticated PNG image preview, including TIFF/BMP/AVIF conversion      |
| GET    | `/documents/:id/export?format=csv` | CSV export; formats: `csv`, `json`, `xlsx`                               |

Statuses: `queued` → `processing` → `ready` → `reviewed`; processing can move to `failed`. Retry returns `failed` → `queued`. Saving edits without verification changes a reviewed document back to ready.

```json
{
  "extraction": {
    "documentType": "invoice",
    "title": "Design invoice",
    "summary": "Invoice for design services.",
    "fields": [{ "key": "Total", "value": "49560", "evidence": "Total: 49560" }],
    "lineItems": [{ "description": "Design", "quantity": 1, "unitPrice": 24000, "amount": 24000 }],
    "sections": [],
    "warnings": []
  },
  "reviewed": true,
  "version": 3
}
```

`profile` is `auto`, `document`, `poster`, `screenshot` or `job_description`; old records default to `auto`. Numeric line-item values may be `null`. `documentType` additionally includes `screenshot` and `job_description`. Fields have a name, string value and source evidence. Manually added fields may have empty evidence. Maximum 100 fields and 200 line items. A stale `version` returns HTTP 409 instead of overwriting another review.

`sections` contains up to 30 objects: `{name, evidence, items}`. Each section has up to 200 items shaped as `{text, number, evidence, needsReview}`. `number` is the original list number or `null` for unnumbered bullets. Repeated labels are preserved. JSON exports include `sourceText` (original OCR/text) and `cleanedText`; CSV and Excel exports include section/item rows and uncertainty flags. New fields default to empty values when reading older saved documents.

Reprocessing accepts the current document version and explicit confirmation in the UI. It replaces extracted results and clears verification, retaining the original upload. It is forbidden for queued/processing documents and demo samples without files. Upload an old demo-session image again if you no longer have that session.

Socket.io uses the same session cookie. Listen for `document:updated`; payload is the public document, never storage paths or other users' information. Clients have no ability to choose another user's room. The frontend polls every five seconds as a fallback.

Status codes: 400 validation, 401 sign-in required, 403 rejected origin, 404 inaccessible document, 409 conflicting state/version, 413 oversized upload, 429 rate/quota limit, 503 queue unavailable.

## Local training endpoints

All `/training` routes require a permanent authenticated local account, a loopback connection, and non-production configuration with `LOCAL_TRAINING` enabled. Demo and deployed-site access are rejected.

| Method | Endpoint                      | Purpose                                                                                                                                                 |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/training`                   | Own samples, run history, real metrics and prerequisite status                                                                                          |
| POST   | `/training/setup`             | Download free pinned training/baseline weights once                                                                                                     |
| POST   | `/training/samples`           | Multipart `image`, `language` (`eng`/`hin`), `sourceGroup`, `split`, `text`, `approved` and optional `disposition` (`usable`/`crossed_out`/`illegible`) |
| PATCH  | `/training/samples/:id`       | `{text, approved, disposition?}`; excluded dispositions can never be approved                                                                           |
| GET    | `/training/samples/:id/image` | Own cropped-line image                                                                                                                                  |
| POST   | `/training/runs`              | `{language, kind: baseline or training, iterations}`; HTTP 202                                                                                          |
| POST   | `/training/runs/:id/stop`     | Request cancellation of the current owned job                                                                                                           |
| POST   | `/training/runs/:id/release`  | Prepare a local smoke-approved model folder; never deploy or activate automatically                                                                     |

Reports store dataset/test/model hashes, CER, WER, grapheme error rate, exact-line match, actual predictions, measured recognition durations and native trainer logs. Correct labels are mandatory; OCR confidence is not substituted for accuracy. See [local training guide](LOCAL-TRAINING.md) for requirements and release limitations.
