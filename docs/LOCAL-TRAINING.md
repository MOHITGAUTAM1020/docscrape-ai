# Local English/Hindi training: staged workflow

Training runs on your own CPU. The browser is a local dashboard, not a cloud trainer. No paid model API is required. Initial tool/model downloads need internet. Native fine-tuning uses your existing local Ubuntu environment, with an optional Docker backend. Its required models and script metadata are prepared before the run; training does not call a paid API or fetch missing metadata.

## Step 1 — prepare once

Open the app locally and register a permanent account (not a demo session). Select **Training lab**. Use **Download base models** to download pinned English/Hindi floating-point training weights plus any missing app baseline weights.

On this Windows machine, an existing Ubuntu WSL environment was found. Free native Tesseract 5.5 training tools, GNU Make, Node.js, Python/Pillow and Python Bidi were installed there. Prepare the pinned sources from the repository root:

```powershell
npm.cmd run training:setup
```

The dashboard detects this native backend automatically. `TRAINING_WSL_DISTRO` defaults to `Ubuntu`. On a new computer, install the same free training tools in its Linux environment. Training limits OpenMP to two threads; the native backend uses the machine's available RAM. Allow headroom for your OS and the app. This is not a guarantee of run duration.

The native pipeline has been exercised for English and Hindi with small generated datasets and a 100-iteration limit. It successfully produced `.traineddata` candidates, loaded them in the app OCR engine and scored them on held-out lines. Those smoke fixtures are not evidence of general accuracy; the active model was left unchanged.

Docker Desktop is **optional**: `npm.cmd run training:build` builds the alternative local trainer image. Docker jobs use two CPU cores and a 4 GB RAM cap, with container networking disabled. Docker execution is not verified on this machine because it is not installed. Native training needs no Docker installation.

## Step 2 — collect approved labels

Upload **cropped single text-line images**, paired with exactly the text visible in each crop. Check every label before approving it. The app does not use its own OCR predictions as automatically approved ground truth.

For uploaded images, open the document review and choose **Correct & add to training**. Drag around one complete line, type its exact transcription, choose English or Hindi and save it. The first crop fixes the dataset split for every crop from that document. Lines marked **Crossed out** or **Illegible** are recorded for review but can never be approved for evaluation or training.

Select English for Latin text and Hindi for Devanagari text. Hindi lines may contain digits and English words. Use printed text first. Handwriting and unfamiliar fonts need their own representative examples and benchmarks.

Choose an explicit split: Training, Validation or Held-out test. Keep all crops from one document/page family under the same source group and split. Duplicate image hashes and cross-split source groups are rejected. Different screenshots/crops of the same source also need the same group—you must identify those correctly.

Smoke minimum per language: **20 training + 5 validation + 5 test lines**. This only checks that the pipeline works. Collect substantially more diverse examples and source documents before making accuracy claims. No particular sample count guarantees good OCR.

## Step 3 — measure the baseline

Select a language and **Measure baseline**. The app performs actual local OCR on approved held-out lines and records:

- Character error rate (CER); lower is better, weighted by total reference characters.
- Word error rate (WER); lower is better, weighted by reference words.
- Grapheme error rate, useful for Hindi combining marks.
- Exact-line match rate; higher is better.
- Recognition time per line, excluding model initialization.
- Dataset/test fingerprints and individual predictions versus the checked labels.

Text is NFC-normalized and whitespace-normalized. Case and punctuation still count. Error rates can exceed 100% for excessive insertions; scores are not clipped or invented from OCR confidence.

The baseline uses your current app model files, or its cached default weights. Native fine-tuning starts from floating-point `tessdata_best` weights when the current app uses integer models that cannot be fine-tuned. If `OCR_MODEL_DIR` points to a previous floating-point approved release, that becomes the training parent.

Benchmarks use **single-line PSM 7**. The document reader uses a separate layout pipeline. These numbers do not measure section grouping or whole-document accuracy. Keep a separate set of complete English, Hindi and mixed documents for an end-to-end check.

## Step 4 — fine-tune locally

Choose maximum iterations and **Train and test locally**. The local worker:

1. Snapshots approved labels, images, split assignments and baseline model identity.
2. Evaluates a fresh baseline on the frozen test images.
3. Gives the trainer only training and validation data. Test images stay outside its input directory (and outside the optional Docker filesystem mount).
4. Generates line-training files, overrides the trainer's random split with your document-level train/validation split, and fine-tunes the selected language.
5. Writes actual checkpoints/logs and the candidate model to the run folder.
6. Evaluates the candidate on exactly the same held-out lines.

Only one local job runs at once. The Stop button requests cancellation; evaluation stops between lines, and native training containers receive a stop request. Failed/stopped runs never replace inference weights. Checkpoint files remain in the local run folder for inspection. This version starts new runs rather than exposing checkpoint-resume controls.

If you close the app/server during training, inspect the local Ubuntu processes (or Docker Desktop for the optional container backend). On restart, stale run records are marked interrupted, not completed. Do not package incomplete checkpoints. Windows paths containing spaces are handled through a private Linux temporary job folder; checkpoint artifacts are copied back into the run folder before that temporary folder is removed.

## Step 5 — review the candidate

The smoke comparison gate requires lower CER, no WER/grapheme/exact-match regression, the same held-out test lines and no more than 50% recognition-time regression. A perfect baseline cannot be "improved" by an identical candidate.

These are minimum safeguards—not proof of a statistically significant improvement. A small test set and shared validation set can overfit. Add a larger representative acceptance set, including fonts, blur, lighting, layout and mixed-language cases, before deployment. Keep test labels out of training and do not tune repeatedly against a tiny final acceptance set.

Changing checked test labels creates a new test-set hash. Existing run snapshots and predictions remain unchanged. Scores from different hashes are not comparable. A release is blocked if test labels or the baseline model changed since the run.

## Step 6 — release only the improved model

**Prepare model release** writes a local folder containing the selected language's `.traineddata` file and a manifest with hashes, dataset version, baseline/candidate metrics and the gate decision. It does **not** activate it or deploy anything.

Keep the other language's current weights unchanged. For a first local inference directory, copy both current baseline weights into a new versioned model folder, then replace only the newly trained language. Set `OCR_MODEL_DIR` in `server/.env` to that folder, keep `OCR_LANG=eng+hin`, and restart the API. Re-run representative full-document tests. Retain the previous folder for rollback.

For your live site, upload the **approved versioned model artifact** to the OCR service and switch its model path/restart the worker as its hosting setup requires. **A frontend redeploy is unnecessary for model-only changes.** Redeploy the application when its code changes. Daily corrections and experiments need no deployment.

## Local storage and privacy

Labels, images, runs, predictions, logs and model packages live under ignored `server/data/training/`. Each local account has its own dataset and history. The lab endpoints require authentication and loopback access, reject demo users and are disabled in production. No training endpoint is exposed on the live deployment.

The app shares downloaded base weights locally but not one account's labelled data with another. Do not add workplace/customer data without authorization. Back up your dataset and run folders; they are intentionally excluded from GitHub and the production Docker image.

## Daily routine

Add/correct labels → approve → run baseline/training when enough useful new data exists → inspect real errors → package only a promising candidate → perform the larger acceptance test → update model artifact if approved.

Useful commands:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run training:smoke
npm.cmd run training:native-smoke
```

`training:smoke` downloads initial weights and measures five generated printed lines per language. It never fine-tunes or publishes a model. `training:native-smoke` additionally prepares synthetic train/validation/test lines, runs a 100-iteration fine-tuning check per language and measures the candidates. Neither script activates a model or proves real-world accuracy.

Sources: [official tesstrain workflow](https://github.com/tesseract-ocr/tesstrain), [Tesseract fine-tuning documentation](https://tesseract-ocr.github.io/tessdoc/tess5/TrainingTesseract-5.html), [floating-point base models](https://github.com/tesseract-ocr/tessdata_best).
