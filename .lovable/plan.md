## Problem

The pipeline is supposed to be: Upload → Remove BG → Enhance → Model Render → 4K Zoom. Several phases are wired to the wrong source image, so even when an API call succeeds, downstream phases either feed garbage in or fail silently.

## Root causes (found in code)

1. **Enhance uses the original upload, not the bg-removed image.**
   In `src/pages/Project.tsx` `handleUploadComplete` calls `enhanceAllImages(uploadedImages, ...)` using `uploadedImages[i].url`, which is the original public URL. The `remove-background` function `update`s `project_images.storage_url` for that row, but the React state in `UploadStage` only refreshes it for `bgDone` items via a separate query. The enhance call is fired from a stale `uploadedImages` array — and even when refreshed, `Project.tsx`'s copy may not be in sync. So enhance often gets the original-with-background image.

2. **Model render is called with the original image id + ORIGINAL URL, not the enhanced URL.**
   `generateAllModelRenders(uploadedImages, id, user.id)` passes `img.url` (original) as `enhancedImageUrl`. It should look up the enhanced `project_images` row (`type = 'enhanced'`, `metadata.original_image_id = imageId`) and pass that storage URL.

3. **Zoom is called with the model image but tagged with the original imageId — yet model lookup in retry uses jewelry_image_id correctly.** The forward path in `handleComplete` of `ModelRenderStage` actually passes `sm.modelUrl`, which is fine. But the model URL is sometimes empty when the user clicks before the URL is fetched (see #4).

4. **Selected model URL can be empty.** `ModelRenderStage` builds variants with `url: ""` then back-fills from a one-shot DB query. If the user clicks Select before the URL is fetched, `modelUrl` is `""` and zoom fails. Also the fetch effect doesn't re-run when new model rows arrive (no polling).

5. **Phase gating is auto-advance, not "unlock next".** `handleUploadComplete` immediately `setStage(1)` and fires enhance. Even if bg-removal hasn't finished, the user is pushed forward. Same for enhance → model. You wanted explicit "unlock next step" gating.

6. **No `bg_remove` job tracking surfaced.** The bg-remove edge function does create a `bg_remove` processing job, but the UI doesn't show it on the Upload stage — only an in-memory `bgRemoving` flag — so failures are invisible.

## Fix plan

### Backend (no edge function logic changes needed; orchestration only)

No changes to `remove-background`, `enhance-image`, `generate-model-renders`, `generate-zoom-shots` themselves — they already work with `EdgeRuntime.waitUntil` and write `processing_jobs` rows. The wiring is the bug.

### `src/pages/Project.tsx`

- After upload completes, **do not auto-advance**. Set stage to 1 (Enhance) only when the user clicks "Enhance Images →" in `UploadStage` (already the case), but stop firing enhance until we have refreshed `uploadedImages` from DB so each row's `storage_url` is the bg-removed URL.
- Before calling `enhanceAllImages`, **re-fetch** `project_images` where `type='original'` and rebuild `uploadedImages` so each `url` reflects the (now bg-removed) `storage_url`.
- Replace `generateAllModelRenders(uploadedImages, ...)` with a version that **looks up the enhanced row per imageId** (`type='enhanced'`, `metadata.original_image_id = imageId`) and passes that URL. Build a `[{ id: originalImageId, url: enhancedUrl }]` list and call the existing service.
- Keep model→zoom flow but ensure the selected model URL is non-empty before starting; if empty, refetch from `project_images` once.
- Remove the auto `setStage(...)` calls inside the "onComplete" handlers; instead let each stage's "Proceed" button be the gate (UploadStage and EnhanceStage already work that way; ModelRenderStage and ZoomExportStage already require user click).

### `src/components/UploadStage.tsx`

- Show bg-removal status from `processing_jobs` (job_type `bg_remove`) instead of the local `bgRemoving` flag only, so failures/retries are visible.
- Disable "Enhance Images →" button until every uploaded image has a complete `bg_remove` job (or skip-with-warning if it failed but user wants to continue with original).
- On bg-remove completion, update local `uploadedImages[i].url` to the new public URL returned (already partially implemented — make it the single source of truth and bust any cached image with `?v=timestamp`).

### `src/components/EnhanceStage.tsx`

- No structural changes. Already shows per-image enhance jobs from `processing_jobs` and a "Proceed to Model Rendering →" button that only enables when all done.

### `src/components/ModelRenderStage.tsx`

- Replace the one-shot DB fetch with a **3s polling refetch** (matching ZoomExportStage pattern) while any model_render job is still processing, so variant URLs populate as the edge function writes them.
- Disable Select / Proceed for an image until that variant's `url` is non-empty.

### `src/services/enhancementService.ts` and `modelRenderService.ts`

- No API changes; callers will pass the right URLs after the Project.tsx fix.

## Why this fixes "it still not working"

- BG removal now actually feeds the enhance call (right URL).
- Enhance result now actually feeds the model render call (right URL).
- Model render selection feeds zoom (only after URL is hydrated).
- Each "Proceed" button is the explicit gate per your preference — no skipping forward.
- BG-remove failures are visible in the upload stage instead of disappearing.

## Out of scope

- API provider chains (Photoroom / Remove.bg / Gemini / OpenAI / Stability / HuggingFace) are unchanged. If all six providers are exhausted simultaneously the bg-remove job will fail and you'll see it in the upload stage with a Retry button — that's a credit/quota issue, not an orchestration bug.
