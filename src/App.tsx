import { useEffect, useMemo, useState } from "react";
import DisplacementPreview, { type DisplacementPreviewHandle } from "./components/DisplacementPreview";
import RampEditor, { RampPoint } from "./components/RampEditor";
import { useMediaStream } from "./hooks/useMediaStream";

type PresetKey =
  | "linear"
  | "bulge"
  | "crest"
  | "ripple"
  | "reededStraight"
  | "reededCurved"
  | "diagonalSweep"
  | "sawtooth"
  | "frostedBand"
  | "pulseFocus";

type PresetConfig = {
  label: string;
  points: Array<Pick<RampPoint, "x" | "y">>;
};

const presets: Record<PresetKey, PresetConfig> = {
  linear: {
    label: "Linear",
    points: [
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ],
  },
  bulge: {
    label: "Bulge",
    points: [
      { x: 0, y: 1 },
      { x: 0.25, y: 0.6 },
      { x: 0.5, y: 0.2 },
      { x: 0.75, y: 0.65 },
      { x: 1, y: 0 },
    ],
  },
  crest: {
    label: "High Crest",
    points: [
      { x: 0, y: 1 },
      { x: 0.2, y: 0.9 },
      { x: 0.5, y: 0.1 },
      { x: 0.8, y: 0.4 },
      { x: 1, y: 0 },
    ],
  },
  ripple: {
    label: "Ripple",
    points: [
      { x: 0, y: 1 },
      { x: 0.15, y: 0.6 },
      { x: 0.3, y: 0.8 },
      { x: 0.5, y: 0.35 },
      { x: 0.7, y: 0.55 },
      { x: 0.85, y: 0.2 },
      { x: 1, y: 0 },
    ],
  },
  reededStraight: {
    label: "Reeded Straight",
    points: [
      { x: 0, y: 1 },
      { x: 0.08, y: 0.2 },
      { x: 0.16, y: 1 },
      { x: 0.24, y: 0.2 },
      { x: 0.32, y: 1 },
      { x: 0.4, y: 0.2 },
      { x: 0.48, y: 1 },
      { x: 0.56, y: 0.2 },
      { x: 0.64, y: 1 },
      { x: 0.72, y: 0.2 },
      { x: 0.8, y: 1 },
      { x: 0.88, y: 0.2 },
      { x: 1, y: 0 },
    ],
  },
  reededCurved: {
    label: "Reeded Curved",
    points: [
      { x: 0, y: 1 },
      { x: 0.08, y: 0.4 },
      { x: 0.14, y: 0.75 },
      { x: 0.22, y: 0.2 },
      { x: 0.32, y: 0.7 },
      { x: 0.42, y: 0.15 },
      { x: 0.52, y: 0.65 },
      { x: 0.64, y: 0.12 },
      { x: 0.74, y: 0.6 },
      { x: 0.86, y: 0.1 },
      { x: 1, y: 0 },
    ],
  },
  diagonalSweep: {
    label: "Diagonal Sweep",
    points: [
      { x: 0, y: 1 },
      { x: 0.1, y: 0.95 },
      { x: 0.25, y: 0.7 },
      { x: 0.45, y: 0.35 },
      { x: 0.65, y: 0.15 },
      { x: 0.85, y: 0.05 },
      { x: 1, y: 0 },
    ],
  },
  sawtooth: {
    label: "Sawtooth Edge",
    points: [
      { x: 0, y: 1 },
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 1 },
      { x: 0.32, y: 0.05 },
      { x: 0.45, y: 0.85 },
      { x: 0.6, y: 0.08 },
      { x: 0.74, y: 0.8 },
      { x: 0.86, y: 0.12 },
      { x: 1, y: 0 },
    ],
  },
  frostedBand: {
    label: "Frosted Band",
    points: [
      { x: 0, y: 1 },
      { x: 0.1, y: 0.9 },
      { x: 0.25, y: 0.4 },
      { x: 0.5, y: 0.15 },
      { x: 0.75, y: 0.4 },
      { x: 0.9, y: 0.9 },
      { x: 1, y: 0 },
    ],
  },
  pulseFocus: {
    label: "Pulse Focus",
    points: [
      { x: 0, y: 1 },
      { x: 0.1, y: 0.6 },
      { x: 0.2, y: 0.35 },
      { x: 0.35, y: 0.8 },
      { x: 0.5, y: 0.05 },
      { x: 0.65, y: 0.8 },
      { x: 0.8, y: 0.35 },
      { x: 0.9, y: 0.6 },
      { x: 1, y: 0 },
    ],
  },
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const generateId = (() => {
  let counter = 0;
  return () => `point-${++counter}`;
})();

const createPoint = (x: number, y: number, opts?: Partial<RampPoint>): RampPoint => ({
  id: generateId(),
  x,
  y,
  ...opts,
});

const buildPreset = (config: PresetConfig): RampPoint[] =>
  config.points.map((point, index, arr) =>
    createPoint(point.x, point.y, {
      locked: index === 0 || index === arr.length - 1,
    })
  );

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

function useRampController(initialPreset: PresetKey) {
  const initialPoints = useMemo(() => buildPreset(presets[initialPreset]), [initialPreset]);
  const [points, setPoints] = useState<RampPoint[]>(initialPoints);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialPoints.find((point) => !point.locked)?.id ?? initialPoints[0]?.id ?? null
  );

  const selectedPoint = useMemo(
    () => points.find((point) => point.id === selectedId) ?? null,
    [points, selectedId]
  );

  const updatePoint = (id: string, next: Partial<RampPoint>) => {
    setPoints((prev) => {
      const index = prev.findIndex((point) => point.id === id);
      if (index === -1) {
        return prev;
      }
      const point = prev[index];
      const left = prev[index - 1];
      const right = prev[index + 1];
      const proposedX = next.x ?? point.x;
      const minBound = left ? left.x + 0.01 : 0;
      const maxBound = right ? right.x - 0.01 : 1;
      const safeMin = Math.min(minBound, maxBound);
      const safeMax = Math.max(minBound, maxBound);
      const boundedX = safeMin > safeMax ? (safeMin + safeMax) / 2 : clamp(proposedX, safeMin, safeMax);
      const nextX = clamp(point.locked ? point.x : boundedX, 0, 1);
      const nextY = clamp(next.y ?? point.y, 0, 1);

      const updatedPoint: RampPoint = { ...point, ...next, x: nextX, y: nextY };
      const nextPoints = [...prev];
      nextPoints[index] = updatedPoint;
      return nextPoints;
    });
  };

  const addPoint = (x: number, y: number) => {
    const newPoint = createPoint(x, y);
    setPoints((prev) => {
      const nextPoints = [...prev, newPoint].sort((a, b) => a.x - b.x);
      if (nextPoints.length > 0) {
        const first = nextPoints[0];
        if (first.locked) {
          nextPoints[0] = { ...first, x: 0 };
        }
      }
      if (nextPoints.length > 1) {
        const last = nextPoints[nextPoints.length - 1];
        if (last.locked) {
          nextPoints[nextPoints.length - 1] = { ...last, x: 1 };
        }
      }
      return nextPoints;
    });
    setSelectedId(newPoint.id);
  };

  const removePoint = (id: string) => {
    setPoints((prev) => {
      if (prev.length <= 2) {
        return prev;
      }
      const targetIndex = prev.findIndex((point) => point.id === id);
      if (targetIndex === -1 || prev[targetIndex].locked) {
        return prev;
      }
      const nextPoints = prev.filter((point) => point.id !== id);
      setSelectedId((current) => {
        if (current !== id) {
          return current;
        }
        const fallback = nextPoints[Math.min(targetIndex, nextPoints.length - 1)];
        return fallback ? fallback.id : null;
      });
      return nextPoints;
    });
  };

  const applyPreset = (key: PresetKey) => {
    const nextPoints = buildPreset(presets[key]);
    setPoints(nextPoints);
    setSelectedId(nextPoints.find((point) => !point.locked)?.id ?? nextPoints[0]?.id ?? null);
  };

  return {
    points,
    selectedId,
    selectedPoint,
    setSelectedId,
    updatePoint,
    addPoint,
    removePoint,
    applyPreset,
  };
}

type RampController = ReturnType<typeof useRampController>;

type RampPanelProps = {
  label: string;
  idPrefix: string;
  controller: RampController;
};

const RampPanel = ({ label, idPrefix, controller }: RampPanelProps) => {
  const { points, selectedId, selectedPoint, setSelectedId, updatePoint, addPoint, removePoint, applyPreset } =
    controller;

  return (
    <div className="panel">
      <h2>{label}</h2>
      <RampEditor
        points={points}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onPointChange={updatePoint}
        onAddPoint={addPoint}
        onRemovePoint={removePoint}
      />
      <div className="curve-meta">
        <span>Handles: {points.length}</span>
        {selectedPoint ? (
          <span>
            Selected • X {formatPercent(selectedPoint.x)} / Y {formatPercent(selectedPoint.y)}
          </span>
        ) : (
          <span>Selected • None</span>
        )}
      </div>

      <div className="controls">
        <div className="control-row">
          <label htmlFor={`${idPrefix}-preset-select`}>Quick presets</label>
          <select
            id={`${idPrefix}-preset-select`}
            onChange={(event) => {
              const key = event.target.value as PresetKey;
              if (presets[key]) {
                applyPreset(key);
              }
              event.currentTarget.selectedIndex = 0;
            }}
          >
            <option value="">Select preset…</option>
            {Object.entries(presets).map(([key, preset]) => (
              <option key={key} value={key}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: "block", marginBottom: "0.5rem", color: "#475569" }}>Snapshots</label>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {(Object.keys(presets) as PresetKey[]).map((key) => (
              <button key={key} className="preset-button" onClick={() => applyPreset(key)}>
                {presets[key].label}
              </button>
            ))}
          </div>
        </div>

        <div className="inspector">
          <label>Handle inspector</label>
          {selectedPoint ? (
            <>
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={selectedPoint.x}
                onChange={(event) => updatePoint(selectedPoint.id, { x: Number(event.target.value) })}
              />
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={1 - selectedPoint.y}
                onChange={(event) => updatePoint(selectedPoint.id, { y: 1 - Number(event.target.value) })}
                style={{ transform: "scaleY(-1)" }}
              />
              <div className="inspector-field">
                <label htmlFor={`${idPrefix}-handle-x`}>Horizontal (X)</label>
                <input
                  id={`${idPrefix}-handle-x`}
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={selectedPoint.x.toFixed(2)}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (!Number.isNaN(value)) {
                      updatePoint(selectedPoint.id, { x: value });
                    }
                  }}
                />
              </div>
              <div className="inspector-field">
                <label htmlFor={`${idPrefix}-handle-y`}>Vertical (Y)</label>
                <input
                  id={`${idPrefix}-handle-y`}
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={selectedPoint.y.toFixed(2)}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (!Number.isNaN(value)) {
                      updatePoint(selectedPoint.id, { y: value });
                    }
                  }}
                />
              </div>
              {!selectedPoint.locked && (
                <button
                  type="button"
                  onClick={() => removePoint(selectedPoint.id)}
                  style={{
                    padding: "0.5rem 0.75rem",
                    borderRadius: "8px",
                    border: "none",
                    background: "rgba(239, 68, 68, 0.15)",
                    color: "#b91c1c",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Delete handle
                </button>
              )}
            </>
          ) : (
            <p style={{ margin: 0, color: "#94a3b8" }}>Select a handle to inspect precise values.</p>
          )}
        </div>
      </div>
    </div>
  );
};

const formatIntensity = (value: number) => value.toFixed(2);

function App() {
  const horizontal = useRampController("reededStraight");
  const vertical = useRampController("frostedBand");
  const [horizontalIntensity, setHorizontalIntensity] = useState<number>(0.35);
  const [verticalIntensity, setVerticalIntensity] = useState<number>(0.35);
  const [waveIntensity, setWaveIntensity] = useState<number>(0.5);
  const [previewHandle, setPreviewHandle] = useState<DisplacementPreviewHandle | null>(null);
  const [gifDuration, setGifDuration] = useState<number>(2);
  const [gifFps, setGifFps] = useState<number>(12);
  const [gifScale, setGifScale] = useState<number>(1);
  const [isCapturingStill, setIsCapturingStill] = useState(false);
  const [isCapturingGif, setIsCapturingGif] = useState(false);
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const { requestStream, stopStream, mediaState } = useMediaStream();

  useEffect(() => {
    if (!captureMessage && !captureError) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCaptureMessage(null);
      setCaptureError(null);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [captureMessage, captureError]);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.style.display = "none";
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    requestAnimationFrame(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  };

  const handleExportStill = async () => {
    if (!previewHandle) {
      setCaptureError("Preview not ready yet.");
      return;
    }
    setIsCapturingStill(true);
    setCaptureError(null);
    try {
      const blob = await previewHandle.captureImage();
      const filename = `displacer-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      downloadBlob(blob, filename);
      setCaptureMessage(`Saved ${filename}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to export PNG.";
      setCaptureError(message);
    } finally {
      setIsCapturingStill(false);
    }
  };

  const handleExportGif = async () => {
    if (!previewHandle) {
      setCaptureError("Preview not ready yet.");
      return;
    }
    setIsCapturingGif(true);
    setCaptureError(null);
    try {
      const duration = Math.max(0.5, Math.min(10, gifDuration || 0));
      const fps = Math.min(30, Math.max(1, Math.round(gifFps || 0)));
      const scale = Math.min(1, Math.max(0.1, gifScale || 1));
      const blob = await previewHandle.captureGif({ duration, fps, scale });
      const filename = `displacer-${new Date().toISOString().replace(/[:.]/g, "-")}-${duration.toFixed(
        2
      )}s.gif`;
      downloadBlob(blob, filename);
      setCaptureMessage(`Saved ${filename}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to export GIF.";
      setCaptureError(message);
    } finally {
      setIsCapturingGif(false);
    }
  };

  const captureDisabled = !previewHandle || isCapturingGif || isCapturingStill;

  return (
    <main>
      <header>
        <h1 style={{ margin: "0 0 0.5rem" }}>Dual-Axis Ramp Prototype</h1>
        <p style={{ margin: 0, color: "#475569", maxWidth: "64ch" }}>
          Explore horizontal and vertical displacement ramps with a live glass preview. Combine presets, fine-tune
          handles, and feed in your webcam to prototype complex refraction effects.
        </p>
      </header>

      <section className="app-layout">
        <div className="panel">
          <h2>Glass Preview</h2>
          <DisplacementPreview
            horizontalPoints={horizontal.points}
            verticalPoints={vertical.points}
            intensityX={horizontalIntensity}
            intensityY={verticalIntensity}
            waveIntensity={waveIntensity}
            videoStream={mediaState.stream}
            status={mediaState.status}
            onReady={setPreviewHandle}
          />
          <div className="controls">
            <div className="control-row">
              <label>Camera feed</label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                {mediaState.status === "inactive" && (
                  <button type="button" className="preset-button" onClick={() => requestStream()}>
                    Enable webcam
                  </button>
                )}
                {mediaState.status === "active" && (
                  <button
                    type="button"
                    className="preset-button"
                    onClick={() => stopStream()}
                    style={{ background: "rgba(239, 68, 68, 0.15)", color: "#b91c1c" }}
                  >
                    Disable
                  </button>
                )}
                {mediaState.status === "error" && (
                  <span style={{ fontSize: "0.85rem", color: "#b91c1c" }}>{mediaState.errorMessage}</span>
                )}
                {mediaState.status === "pending" && (
                  <span style={{ fontSize: "0.85rem", color: "#6366f1" }}>Waiting for permission…</span>
                )}
              </div>
            </div>

            <div className="control-row">
              <label htmlFor="horizontal-intensity">Horizontal intensity</label>
              <span style={{ fontSize: "0.85rem", color: "#475569" }}>{formatIntensity(horizontalIntensity)}</span>
            </div>
            <input
              id="horizontal-intensity"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={horizontalIntensity}
              onChange={(event) => setHorizontalIntensity(Number(event.target.value))}
            />

            <div className="control-row">
              <label htmlFor="vertical-intensity">Vertical intensity</label>
              <span style={{ fontSize: "0.85rem", color: "#475569" }}>{formatIntensity(verticalIntensity)}</span>
            </div>
            <input
              id="vertical-intensity"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={verticalIntensity}
              onChange={(event) => setVerticalIntensity(Number(event.target.value))}
            />

            <div className="control-row">
              <label htmlFor="wave-intensity">Background waveyness</label>
              <span style={{ fontSize: "0.85rem", color: "#475569" }}>{formatIntensity(waveIntensity)}</span>
            </div>
            <input
              id="wave-intensity"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={waveIntensity}
              onChange={(event) => setWaveIntensity(Number(event.target.value))}
            />

            <div className="capture-controls">
              <div className="capture-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={captureDisabled}
                  onClick={handleExportStill}
                >
                  {isCapturingStill ? "Saving…" : "Save PNG"}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={captureDisabled}
                  onClick={handleExportGif}
                >
                  {isCapturingGif ? "Rendering…" : "Export GIF"}
                </button>
              </div>
              <div className="capture-fields">
                <label htmlFor="gif-duration">GIF duration (s)</label>
                <input
                  id="gif-duration"
                  className="capture-input"
                  type="number"
                  min={0.5}
                  max={10}
                  step={0.5}
                  value={gifDuration}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (!Number.isNaN(value)) {
                      setGifDuration(value);
                    }
                  }}
                />
                <label htmlFor="gif-fps">GIF framerate</label>
                <input
                  id="gif-fps"
                  className="capture-input"
                  type="number"
                  min={1}
                  max={30}
                  step={1}
                  value={gifFps}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (!Number.isNaN(value)) {
                      setGifFps(value);
                    }
                  }}
                />
                <label htmlFor="gif-scale">GIF scale</label>
                <input
                  id="gif-scale"
                  className="capture-input"
                  type="number"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={gifScale}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (!Number.isNaN(value)) {
                      setGifScale(value);
                    }
                  }}
                />
              </div>
              {captureMessage && <p className="capture-status">{captureMessage}</p>}
              {captureError && <p className="capture-status capture-status--error">{captureError}</p>}
            </div>

            <p style={{ margin: 0, fontSize: "0.8rem", color: "#94a3b8" }}>
              Horizontal ramp offsets UV coordinates along the X-axis; vertical ramp offsets along Y. Blend both to
              mimic rippled, cross-hatched, or hammered glass.
            </p>
          </div>
        </div>

        <div className="panel-stack">
          <RampPanel label="Horizontal Ramp" idPrefix="horizontal" controller={horizontal} />
          <RampPanel label="Vertical Ramp" idPrefix="vertical" controller={vertical} />
        </div>
      </section>
    </main>
  );
}

export default App;
