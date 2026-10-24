# PLAN: Anime4K WebGL2 Client-Side Upscaler for Wibuflix Web (wibuflix-web)

## 1. Goal and Scope

**Goal:**
Implement a client-side real-time video upscaling pipeline using WebGL2 and Anime4K GLSL shaders (Mode A - Fast) in `wibuflix-web`. The upscaler targets video streams with vertical resolution <= 720p and reconstructs them into 1080p (1920x1080) output. Streams with resolution >= 1080p bypass the shader pipeline completely and render via the native HTML5 `<video>` element. All streams are strictly Azure Blob HLS streams played via HLS.js.

**Depends on:**
- Azure Blob Storage CORS configuration (`AllowedOrigins: *`, `AllowedMethods: GET, HEAD`).
- Companion mobile plan: `wibuflix-app/plans/PLAN-2026-10-24-anime4k-mobile-upscaler.md`.

**What's in:**
- WebGL2 Anime4K shader pipeline (`src/utils/anime4k/`):
  - Vertex shader (full-screen quad).
  - Mode A fragment shaders: Restore (deblur/line reconstruct), Upscale (gradient push), and Denoise passes.
  - GL program compilation, multi-pass framebuffer management, and texture allocation.
- Custom React Player hook (`src/hooks/useAnime4kUpscaler.ts`):
  - Canvas surface management and synchronization with `<video>` playback state.
  - Frame delivery loop powered by `video.requestVideoFrameCallback()` with fallback to `requestAnimationFrame()`.
  - Dynamic resolution gating: auto-activates when `videoHeight <= 720`, auto-bypasses when `videoHeight >= 1080`.
- Player UI integration (`src/pages/PlayerPage.tsx` and `src/components/PlayerControls.tsx`):
  - Quality badge indicator (`[✨ 1080p AI]` when active, `[1080p Native]` when >= 1080p).
  - User toggle switch in player settings to enable/disable upscaler manually.
- Clean CORS attribute injection (`crossOrigin="anonymous"`) on the `<video>` element.

**What's out:**
- Server-side video transcoding or FFmpeg modifications.
- Third-party iframe or embed support (third-party sandboxes cannot be read by WebGL).
- Neural-network upscalers (Waifu2x / Real-ESRGAN / ONNX runtime) due to latency (>100ms/frame).
- Mobile React Native app changes (handled in `wibuflix-app/plans/PLAN-2026-10-24-anime4k-mobile-upscaler.md`).

**Done means:**
- Running `npm run build` in `wibuflix-web/` succeeds without errors.
- Running `npx tsc --noEmit` in `wibuflix-web/` passes with 0 type errors.
- For 720p/480p streams: the WebGL2 canvas renders crisp 1080p video output at 24-60 fps without dropped audio/video sync.
- For 1080p streams: the WebGL2 canvas is bypassed and hidden; the native `<video>` element displays directly.

---

## 2. Executor Rules

- Follow phases and steps in order, one at a time.
- Commit after each step: `git add -A && git commit -m "<type>(<scope>): <step description>"`.
- If the code does not match what a step describes, STOP and report the mismatch. Do not improvise or fix adjacent things.
- Do not add dependencies, rename things, or change behavior outside the step.
- Run the step's verification before moving on. If it fails, stop and report.
- For web/frontend steps: verify types compile with `npx tsc --noEmit` and `npm run build` passes before committing.
- Do NOT update any skill file. Skill updates are handled by the senior model after verification.

---

## 3. Findings

| ID | Status | File:Line | Description |
|---|---|---|---|
| F1 | VERIFIED | `src/pages/PlayerPage.tsx:28-30` | Web player uses HTML5 `<video ref={videoRef}>` powered by `Hls.js`. |
| F2 | VERIFIED | `src/pages/PlayerPage.tsx:70-130` | HLS instance handles stream attachments and level switches (`Hls.Events.LEVEL_SWITCHED`). |
| F3 | VERIFIED | Browser Standard | WebGL `texImage2D` requires CORS headers on cross-origin media; without `crossOrigin="anonymous"`, canvas is tainted and throws SecurityError. |
| F4 | VERIFIED | Web Standard | `HTMLVideoElement.requestVideoFrameCallback()` provides zero-jitter frame timing synced to video presentation rate, saving CPU compared to `requestAnimationFrame()`. |

---

## 4. Phases and Steps

### Phase 1: Anime4K GLSL Shaders & WebGL2 Pipeline Core

**Step 0 — Commit plan file**
- **Files:** `plans/PLAN-2026-10-24-anime4k-web-upscaler.md`
- **Change:** No source code changes. Stage and commit plan file alone.
- **Verify:** `git log --oneline -1` shows commit containing only this plan file.
- **Commit message:** `docs(plans): PLAN-2026-10-24-anime4k-web-upscaler.md`
- **Rollback:** `git revert HEAD`

**Step 1 — Implement Anime4K GLSL Shaders and WebGL2 Program Manager**
- **Files:**
  - `src/utils/anime4k/shaders.ts`
  - `src/utils/anime4k/glUtils.ts`
  - `src/utils/anime4k/Anime4kPipeline.ts`
- **Change:**
  - `shaders.ts`: Export vertex shader (full-screen quad) and Anime4K Mode A GLSL fragment shaders (Pass 1: Restore & Thin Lines, Pass 2: Upscale 2x & Push Gradients).
  - `glUtils.ts`: Compile shaders, link WebGL programs, create textures and framebuffers, and throw readable diagnostic errors if WebGL2 is unsupported.
  - `Anime4kPipeline.ts`: Class managing the WebGL2 context, input video texture, intermediate framebuffers, and rendering to the target 1920x1080 canvas surface.
- **Verify:** `npx tsc --noEmit` passes with 0 type errors.
- **Rollback:** `git rm -r src/utils/anime4k/`
- **Commit message:** `feat(upscaler): implement Anime4K WebGL2 shader pipeline`

---

### Phase 2: React Upscaler Hook & Resolution Gating

**Step 2 — Implement useAnime4kUpscaler Hook**
- **Files:**
  - `src/hooks/useAnime4kUpscaler.ts`
- **Change:**
  - Accepts `videoRef: React.RefObject<HTMLVideoElement>`, `canvasRef: React.RefObject<HTMLCanvasElement>`, and user toggle state `enabled: boolean`.
  - Tracks stream presentation resolution (`video.videoHeight` and `video.videoWidth`).
  - Gating logic:
    - If `videoHeight <= 720` and `enabled`:
      - Set canvas buffer dimensions to 1920x1080 (or aspect-correct 1080p).
      - Start `requestVideoFrameCallback` render loop feeding `pipeline.renderFrame(video)`.
      - Export `isUpscalingActive: true`.
    - If `videoHeight >= 1080` or `!enabled`:
      - Cancel active `videoCallbackId`.
      - Export `isUpscalingActive: false` (notifies UI to display native `<video>` and hide `<canvas>`).
  - Clean up WebGL resources and animation frame callbacks on unmount or stream source change.
- **Verify:** `npx tsc --noEmit` passes with 0 type errors.
- **Rollback:** `git checkout HEAD -- src/hooks/useAnime4kUpscaler.ts`
- **Commit message:** `feat(upscaler): implement useAnime4kUpscaler hook with 1080p bypass`

---

### Phase 3: Player UI Integration & Verification

**Step 3 — Integrate Upscaler Canvas and Controls in PlayerPage**
- **Files:**
  - `src/pages/PlayerPage.tsx`
  - `src/components/PlayerControls.tsx`
- **Change:**
  - In `src/pages/PlayerPage.tsx`:
    - Add `crossOrigin="anonymous"` attribute to the `<video>` element.
    - Render a `<canvas ref={canvasRef} style={{ display: isUpscalingActive ? 'block' : 'none' }} className="w-full h-full object-contain" />`.
    - Set `<video ref={videoRef} style={{ display: isUpscalingActive ? 'none' : 'block' }} className="w-full h-full object-contain" />`.
    - Pass `isUpscalingActive`, `toggleUpscaler`, and `is1080pNative` into `PlayerControls`.
  - In `src/components/PlayerControls.tsx`:
    - Add an upscale indicator badge:
      - If `isUpscalingActive`: `[✨ 1080p AI]`.
      - If `is1080pNative`: `[1080p Native]`.
      - If <= 720p but user toggled off: `[720p Standard]`.
    - Add toggle option in player settings menu.
- **Verify:**
  - Run `npx tsc --noEmit`.
  - Run `npm run build`.
  - Test with a 720p HLS stream: canvas is active, badge displays `[✨ 1080p AI]`, output is sharp.
  - Test with a 1080p stream: canvas is hidden, `<video>` renders directly, badge displays `[1080p Native]`.
- **Rollback:** `git checkout HEAD -- src/pages/PlayerPage.tsx src/components/PlayerControls.tsx`
- **Commit message:** `feat(player): integrate Anime4K canvas and quality badge into PlayerPage`

---

## 5. Needs My Decision

1. **Fallback for Browsers without WebGL2 Support:**
   - Should older browsers lacking WebGL2 silently fall back to native `<video>` display without an error toast? (Recommended: Yes, graceful degradation).
2. **Upscaling Power Savings on Battery:**
   - Should Anime4K automatically disable when the device is on battery saver mode (`navigator.getBattery()`)? (Recommended: Keep manual toggle for now).

---

## 6. Risks

| Phase | What Could Break | How We Notice |
|---|---|---|
| Phase 1 | Older GPU fails to compile Anime4K shaders | WebGL compilation error logged to console; blank canvas |
| Phase 2 | `requestVideoFrameCallback` not supported on older Safari | Video freezes on canvas; requires fallback to `requestAnimationFrame` |
| Phase 3 | Missing CORS on Azure Blob causes tainted canvas error | Browser console throws DOMException: The element has been tainted by cross-origin data |

---

## 7. Noticed but Out of Scope

1. Third-party embed streams cannot use WebGL upscaling due to iframe CORS security boundaries.
2. WebGPU implementation offers slightly better power efficiency, but WebGL2 has much broader browser support.

---

## 8. After Execution

When all steps are executed:
- Report whether each step completed cleanly or had deviations.
- Do not update wibuflix skill or any skill file.
  The senior model will run verify-plan, confirm correctness, then update the skill.
