# PLAN: Improve Anime4K WebGL2 Upscaler Quality — Eliminate Blurriness

## 1. Goal and Scope

**Goal:** Fix the blurry output from the Anime4K WebGL2 upscaler by upgrading the shader pipeline to operate at output resolution and strengthening the sharpening parameters.

**What's in:**
- Rewrite `shaders.ts` with a 3-pass pipeline: Clamp Highlights → Restore (PushColor at input res) → Upscale+Sharpen (at output res 1080p)
- Update `Anime4kPipeline.ts` to add a second FBO at output resolution so the sharpen/upscale pass runs at 1080p texel density
- Tune sharpening strength for crisp anime line art

**What's out:**
- No CNN-based shaders (too many passes for real-time WebGL video)
- No changes to `useAnime4kUpscaler.ts` (hook logic is correct)
- No changes to `PlayerPage.tsx` or `PlayerControls.tsx`
- No changes to HLS.js configuration or backend

**Done means:** Upscaler produces visibly sharper output on <= 720p streams with no dropped-frame regressions. `npx tsc --noEmit` passes.

## 2. Executor Rules

- Follow phases and steps in order, one at a time.
- Commit after each step: `git add -A && git commit -m "<type>(<scope>): <step description>"`.
- If code does not match what the step describes, STOP and report mismatch.
- Do not improvise or fix adjacent things.
- Do not add dependencies, rename things, or change behavior outside the step.
- Run the step's verification before moving on. If it fails, stop and report.
- For frontend steps: verify types compile by running `npx tsc --noEmit` in the `wibuflix-web/` directory before committing.
- Do NOT update any skill file. Skill updates are handled by the senior model after verification.

## 3. Findings

| ID | Status | File:Line | Description |
|----|--------|-----------|-------------|
| F1 | VERIFIED | `src/utils/anime4k/Anime4kPipeline.ts:87-88` | `intermediateTexture` and `intermediateFbo` created at input resolution (e.g. 1280x720). Pass 2 sharpening operates on 720p texels then bilinear-stretches to 1080p canvas — sharpening happens before upscale, so edges blur during the stretch. |
| F2 | VERIFIED | `src/utils/anime4k/Anime4kPipeline.ts:137` | Pass 2 `u_texSize` is set to `inWidth, inHeight` which is correct for the intermediate texture size, but the pass needs to run at output resolution on an output-sized texture to sharpen post-upscale. |
| F3 | VERIFIED | `src/utils/anime4k/shaders.ts:149` | Unsharp boost is 0.85 with +/-0.05 anti-ringing headroom. Too conservative for anime content — produces soft/mushy output especially on thin lines. |
| F4 | VERIFIED | `src/utils/anime4k/shaders.ts:117-157` | Pass 2 (UPSCALE_FRAGMENT_SHADER) is a plain 9-point unsharp mask. No luminance-aware edge detection, no gradient-push. The sharpening is uniform across flat areas and edges alike. |
| F5 | VERIFIED | `src/utils/anime4k/shaders.ts:1-117` | Pass 1 (RESTORE_FRAGMENT_SHADER) implements bloc97 PushColor correctly with 8-directional kernel pairs. This pass is good. |
| F6 | VERIFIED | `src/utils/anime4k/Anime4kPipeline.ts:19-20` | Output size defaults to 1920x1080 and is correctly set by the hook via `setOutputSize()`. |

## 4. Phases and Steps

### Phase 1: Upgrade Pipeline to 3-Pass with Output-Resolution Sharpening

**Step 0 — Commit plan file**
- **Files:** `plans/PLAN-2026-10-25-anime4k-upscaler-improvement.md`
- **Change:** No source code changes. Stage and commit the plan file alone.
- **Verify:** `git log --oneline -1` shows commit with only the plan file.
- **Commit message:** `docs(plans): PLAN-2026-10-25-anime4k-upscaler-improvement.md`
- **Rollback:** `git revert HEAD`

**Step 1 — Add Clamp Highlights shader and upgrade Upscale shader in `shaders.ts`**
- **Files:** `src/utils/anime4k/shaders.ts`
- **Change:**
  1. Add a new exported shader `CLAMP_HIGHLIGHTS_FRAGMENT_SHADER` before the existing shaders. This pass prevents ringing artifacts by clamping pixel values that are brighter than their local neighborhood. Implementation:
     - Sample 3x3 neighborhood (8 neighbors + center)
     - Compute `maxNeighbor = max(all 8 neighbors)` per channel
     - Clamp center: `fragColor = vec4(min(cc.rgb, maxNeighbor.rgb), 1.0)`
  2. Keep `RESTORE_FRAGMENT_SHADER` (Pass 1) unchanged — it's correct.
  3. Replace `UPSCALE_FRAGMENT_SHADER` (Pass 2) with a luminance-adaptive sharpening shader that:
     - Samples 3x3 neighborhood at the current (output) resolution texel size
     - Computes luminance of center and neighbors using `dot(rgb, vec3(0.299, 0.587, 0.114))`
     - Computes edge strength: `edge = clamp(maxLuma - minLuma, 0.0, 1.0)` from cardinal neighbors
     - Computes high-pass detail: `detail = center - blur` where blur is weighted 9-point average (cross 0.7, diag 0.3)
     - Applies adaptive sharpening: `sharp = center + detail * mix(0.3, 1.2, edge)` — gentle on flat areas, strong on edges
     - Anti-ringing clamp: `clamp(sharp, minNeighbor - 0.02, maxNeighbor + 0.02)` — tighter than before (was 0.05)
- **Verify:** `npx tsc --noEmit` in `wibuflix-web/` passes.
- **Commit message:** `feat(shaders): add clamp highlights pass and upgrade adaptive sharpening`
- **Rollback:** `git revert HEAD`

**Step 2 — Add output-resolution FBO and 3-pass rendering in `Anime4kPipeline.ts`**
- **Files:** `src/utils/anime4k/Anime4kPipeline.ts`
- **Change:**
  1. Add new private fields:
     - `private clampProgram: WebGLProgram` — compiled from `CLAMP_HIGHLIGHTS_FRAGMENT_SHADER`
     - `private upscaledTexture: WebGLTexture | null = null` — texture at output resolution (1920x1080)
     - `private upscaledFbo: WebGLFramebuffer | null = null` — FBO for the upscaled texture
     - `private lastOutputWidth = 0` and `private lastOutputHeight = 0` — track output size changes
  2. In constructor: compile `clampProgram` from `VERTEX_SHADER` + `CLAMP_HIGHLIGHTS_FRAGMENT_SHADER` (import it).
  3. Rename `updateTexturesAndFbos` to `updateResources`. Update it to:
     - Still create `videoTexture` and `intermediateTexture`/`intermediateFbo` at input resolution (for Clamp and Restore passes)
     - Additionally create `upscaledTexture` and `upscaledFbo` at `outputWidth x outputHeight` when output size changes
  4. Update `renderFrame()` to 3 passes:
     - **Pass 0 (Clamp Highlights):** Bind `intermediateFbo`. Viewport = `inWidth x inHeight`. Use `clampProgram`. Sample from `videoTexture`. Set `u_texSize` = `inWidth, inHeight`. Draw. Output: clamped frame in `intermediateTexture`.
     - **Pass 1 (Restore/PushColor):** Need a second intermediate — reuse `videoTexture` as target by creating a second FBO for it, OR add a third texture. Simplest: add `private clampedTexture/clampedFbo` at input res. Flow: Pass 0 writes to `clampedTexture` via `clampedFbo`. Pass 1 reads `clampedTexture`, writes to `intermediateTexture` via `intermediateFbo`. Viewport = `inWidth x inHeight`. Use `restoreProgram`. Set `u_texSize` = `inWidth, inHeight`.
     - **Pass 2 (Upscale + Adaptive Sharpen):** Bind `upscaledFbo`. Viewport = `outputWidth x outputHeight`. Use `upscaleProgram`. Sample from `intermediateTexture` (bilinear filtering does the 720→1080 stretch). Set `u_texSize` = `outputWidth, outputHeight` (so sharpening operates at output texel density). Draw.
     - **Final blit:** Bind default framebuffer (null). Viewport = `outputWidth x outputHeight`. Draw `upscaledTexture` to screen using a passthrough or just skip this — actually, render Pass 2 directly to screen (bind framebuffer null) instead of to `upscaledFbo`. This avoids the extra blit.

     **Simplified 3-pass flow (no extra blit needed):**
     - Pass 0 (Clamp): videoTexture → intermediateFbo (at input res)
     - Pass 1 (Restore): intermediateTexture → second FBO at input res (need new `restoredTexture`/`restoredFbo`)
     - Pass 2 (Upscale+Sharpen): restoredTexture → screen (null framebuffer, viewport at output res)

     So the new textures/FBOs:
     - `videoTexture` (input res) — holds uploaded video frame
     - `intermediateTexture` + `intermediateFbo` (input res) — holds clamped output
     - `restoredTexture` + `restoredFbo` (input res) — holds restored/push-color output
     - No `upscaledTexture` needed — final pass renders directly to canvas

  5. Update `destroy()` to clean up `clampProgram`, `restoredTexture`, `restoredFbo`.
  6. Update `updateResources()` to also create/recreate `restoredTexture` and `restoredFbo` at input resolution.

- **Also update:** Import `CLAMP_HIGHLIGHTS_FRAGMENT_SHADER` from `./shaders` in the import statement at top of file.
- **Verify:** `npx tsc --noEmit` in `wibuflix-web/` passes.
- **Commit message:** `feat(Anime4kPipeline): 3-pass pipeline with output-resolution sharpening`
- **Rollback:** `git revert HEAD`

**Step 3 — Verify no regressions with a dev build**
- **Files:** None changed.
- **Change:** None.
- **Verify:** Run `npm run build` (or `npx vite build`) in `wibuflix-web/` and confirm zero errors. Also confirm `npx tsc --noEmit` still passes.
- **Commit message:** No commit (verification only).
- **Rollback:** N/A.

## 5. Needs My Decision

1. **Sharpening strength tuning:** The adaptive range `mix(0.3, 1.2, edge)` is an educated guess for anime content. May need runtime testing with actual streams to tune. If the result is too sharp (halo artifacts), reduce the upper bound from 1.2 to 0.9. If still blurry, increase to 1.5.

2. **Clamp Highlights pass:** This is the "safe" approach from Anime4K v4. If it visibly darkens highlights, it can be removed without affecting the core quality improvement (the main fix is Pass 2 running at output resolution).

## 6. Risks

**Phase 1:**
- WebGL shader compile errors on older GPUs if `#version 300 es` features are used incorrectly. Mitigation: existing shaders already use `#version 300 es` successfully, and we're using the same feature set.
- Performance regression from adding a third pass. Mitigation: the Clamp Highlights pass is extremely cheap (no branches, just min/max), and the third texture is at input resolution, not output. The main GPU cost is the bilinear sample in Pass 2 which already existed.
- The bilinear interpolation from `gl.LINEAR` on `intermediateTexture` (720p) to Pass 2 output (1080p) is unchanged — the improvement comes from sharpening AFTER this stretch instead of before.

## 7. Noticed but Out of Scope

- `useAnime4kUpscaler.ts` only activates for `<= 720p`. Streams between 720p and 1080p (e.g. 900p) get no upscaling. Could be changed to `< 1080` threshold.
- The hook's event listener cleanup doesn't match the add calls exactly (adds anonymous arrow functions for `canplay`/`play` but removes named `handleLoadedMetadata`/`stopLoop` — some listeners may leak). Not causing blurriness, separate bug.
- `Anime4kPipeline.ts` has some garbled lines in `setupGeometry()` and `updateTexturesAndFbos()` — the file compiles but has dead/unreachable code fragments that should be cleaned. These are cosmetic.

## 8. After Execution

When all steps are done:
- Mark this plan file as executed.
- List any steps that were PARTIAL or had to deviate.
- Do not update the wibuflix skill or any skill file.
- The senior model will run verify-plan, confirm correctness, then update the skill.
