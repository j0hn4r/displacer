# Displacer Ramp Prototype

Interactive React + SVG prototype for the displacement ramp editor used in the planned webcam distortion app. This sandbox lets you explore handle ergonomics, preset workflows, and keyboard support before connecting the ramp output to a WebGL pipeline.

## Features
- Smooth Catmull-Rom curve rendered over a glassy backdrop with baked area fill.
- Drag, double-click to add, and delete handles (endpoints remain locked).
- Quick keyboard nudges with arrow keys; hold `Shift` for finer increments.
- Preset dropdown and snapshot buttons (Linear, Bulge, High Crest, Ripple).
- Inspector panel with range sliders and numeric inputs for exact control.
- Real-time WebGL preview applying the ramp as a displacement map over a procedural texture; tweak intensity to feel the distortion range.
- Optional webcam integration—grant permission to stream your camera through the displacement shader in real time.
- Expanded preset library (Reeded Straight/Curved, Diagonal Sweep, Sawtooth Edge, Frosted Band, Pulse Focus) to mirror common highlight and displacement looks from glass design toolkits.
- Dual-axis workflow: edit horizontal and vertical ramps independently and blend them in the shader for cross-hatched or hammered glass effects.
- Wave modulation slider to control the background wobble applied on top of the ramp-driven displacement.
- One-click exports: capture the current frame as PNG or render an animated GIF clip with configurable duration, frame rate, and resolution scaling.

## Getting Started
```bash
npm install
npm run dev
# open http://localhost:5173
```

## Deploying to GitHub Pages
1. Update `vite.config.ts` so the `base` option matches this repository name (`/displacer/`).
2. Build the production bundle locally:
   ```bash
   npm run build
   ```
3. Commit and push the included `.github/workflows/deploy.yml` workflow (or add it to your fork). The workflow builds the site on every push to `main`, then publishes the `dist/` output using GitHub Pages.
4. In your repository settings, open **Pages** and confirm the source is set to “GitHub Actions.” The deployment workflow will publish to the `github-pages` environment automatically, and subsequent pushes to `main` will refresh the live site.

Once the first deployment completes, the site will be available at `https://<username>.github.io/displacer/`.
3. Publish the contents of the generated `dist/` directory to GitHub Pages. You can automate this with a GitHub Actions workflow that runs the build and deploys `dist/`, or push `dist/` to a `gh-pages` branch using `git subtree push --prefix dist origin gh-pages`.

Once the deployment completes, the site will be available at `https://<username>.github.io/displacer/`.

## Usage Notes
- Double-click anywhere on the curve canvas (excluding the locked edges) to insert a new handle.
- Select a handle to adjust it via sliders, numeric inputs, or arrow keys; press `Delete`/`Backspace` to remove.
- Locked endpoints stay pinned to the left/right edges but their height is editable to test different displacement ramps.
- The editor emits normalized 0-1 coordinates, ready to bake into a 256px LUT texture for the future shader pass. The WebGL panel already converts those samples to a LUT texture and feeds them into the displacement shader.
- WebGL2 is required for the preview; browsers that lack it will show a graceful fallback message.
- Click "Enable webcam" inside the preview panel to test against live video. Stream endings (or permission revocations) cleanly revert to the procedural fallback.
- Horizontal and vertical intensities live under the preview—fine-tune each axis to dial in anisotropic glass behaviour.
- Adjust the “Background waveyness” slider to modulate the animated wobble layered over the dual-axis ramps.
- Use the capture capsule to save stills or GIF loops. Duration accepts 0.5–10s and GIFs are sampled at the specified frame rate (1–30fps) and optional scale factor (10%–100% of preview resolution).

## Next Steps
1. Persist ramps in `localStorage` and add import/export JSON support.
2. Allow multi-channel ramps (RGB) for chromatic dispersion previews.
3. Integrate capture controls and the webcam permission flow sketched in the wireframes.
4. Explore performance toggles (reduced resolution/frame rate) for lower-end devices.
