# Verification record

Checked locally on Windows with Node.js 24 and Microsoft Edge on 13 October 2026.

The spatial beta interface and routed extraction profiles were checked on 15 October 2026.

The native English/Hindi local-training setup and fine-tuning smoke tests were completed on 14 October 2026 using the existing Ubuntu WSL environment.

| Check                                               | Result                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| TypeScript (frontend and backend)                   | Passed                                                           |
| API/parser/provider/training tests                  | Passed: 40 tests                                                 |
| Production frontend/backend build                   | Passed                                                           |
| Dependency audit                                    | Zero known vulnerabilities after upgrades and overrides          |
| Browser: demo authentication and dashboard          | Passed                                                           |
| Browser: spatial beta and routed job description    | Passed                                                           |
| Browser: editing, verification and JSON download    | Passed                                                           |
| Browser: actual multi-file XLSX/DOCX/PDF/PNG upload | Passed                                                           |
| Browser: multiple worksheets, search and settings   | Passed                                                           |
| Browser: section edits and JSON/CSV/Excel exports   | Passed                                                           |
| Actual yoga poster                                  | 24 entries grouped as 7 / 10 / 4 / 3, in original numbered order |
| Browser: poster preview and reprocessing            | Passed                                                           |
| Mobile viewport                                     | Passed at 390 × 844, no page overflow                            |
| Real OCR                                            | Passed for PNG, JPEG, WebP, GIF, TIFF, AVIF and BMP              |
| Sample generation                                   | TXT, CSV, XLSX, DOCX, PDF, PNG, JPG and WebP generated           |

The automated tests cover authentication failures, user isolation, origin checks, upload validation, source parsing, review version conflicts, exports, deletion, safe spreadsheet cells and AI-provider response handling. AI-provider tests use mocked HTTP responses; **no live paid AI request was made**, because no key was supplied.

Additional tests cover local training access controls, cross-split leakage, duplicate images, Hindi normalization, true error calculations and release regression rules. The baseline workflow was measured on five generated English and five Hindi lines. Actual native fine-tuning also completed for both languages using the existing Ubuntu WSL environment and Tesseract 5.5: each smoke run used 20 synthetic training lines, 5 validation lines, 5 held-out test lines and a 100-iteration limit. Both candidates were loaded by the application's JavaScript OCR engine and evaluated. English was rejected because it did not improve the already-perfect baseline; Hindi passed its small fixture comparison. No candidate was activated or deployed. These fixture results validate wiring only, **not real-world accuracy**. Reports stay in ignored `server/data/training-smoke.json` and `server/data/native-training-smoke.json`.

The local training dashboard also passed a browser check: permanent local account creation, approved text-line upload, English/Hindi baseline evaluations, actual metric/history display and training-button prerequisite guards. The screenshot in `artifacts/training-lab.png` shows only synthetic labelled fixtures. The existing poster, review and document workflows passed browser checks with bilingual OCR enabled. The beta-route browser check selected Job Description in the spatial UI, uploaded a synthetic role description and verified five structured sections. The attached local JD was separately parsed into Overview, 7 Responsibilities, 7 Minimum Requirements, 4 Preferred Qualifications and Shift Requirements; it is not stored as a tracked fixture.

Docker/MongoDB/Redis execution and native DOC/XLS/scanned-PDF conversion were **not run on this machine**, which has no Docker installation. Their setup is supplied in `Dockerfile` and `compose.yaml`. The missing scanned-PDF utility produces an actionable error rather than a fabricated result, and this behavior is tested. Native text PDFs and modern DOCX/XLSX files were parsed and uploaded successfully.

Screenshots in `artifacts/` use synthetic demo data. Actual yoga-poster validation JSON and preview screenshots stay in the ignored `server/data/` directory. No employer documents or original resume contents are included in the app or regression fixtures. Layout regression tests use synthetic headings and text coordinates, not hard-coded yoga-name corrections.

The poster upgrade retains raw OCR, removes probable noise in a separate cleaned view, and uses word positions/relative text size to distinguish overlapping section regions. Local grouping remains heuristic. The actual poster's printed labels (including source misspellings) are preserved; the extractor does not claim canonical pose-name accuracy. OCR-confidence flags are review hints, not probabilities of correctness.

Dependency overrides upgrade ExcelJS's UUID helper and Mammoth's CLI argument parser. The app uses ExcelJS exports and Mammoth's text API; both are exercised by the tests. Recheck package advisories and compatibility when updating dependencies.

To reproduce:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run samples
npm run test:ocr
npm start
# In a second terminal with a browser installed:
npm run test:browser
npm run test:beta
npm run test:cropper
```

Use `BROWSER_EXECUTABLE` to point to an installed Chrome/Edge, or `npx playwright install chromium` to install the test browser. The OCR check may download English recognition data on its first run.
