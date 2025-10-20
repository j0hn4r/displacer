import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type RampPoint = {
  id: string;
  x: number;
  y: number;
  locked?: boolean;
};

type RampEditorProps = {
  points: RampPoint[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onPointChange: (id: string, next: Partial<RampPoint>) => void;
  onAddPoint: (x: number, y: number) => void;
  onRemovePoint: (id: string) => void;
};

const clamp = (value: number, min = 0, max = 1) => Math.min(Math.max(value, min), max);
const GRID_STEPS = 5;
const KEY_STEP = 0.01;
const KEY_STEP_FINE = 0.0025;

const RampEditor = ({ points, selectedId, onSelect, onPointChange, onAddPoint, onRemovePoint }: RampEditorProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const sortedPoints = useMemo(() => [...points].sort((a, b) => a.x - b.x), [points]);
  const selectedPoint = useMemo(
    () => sortedPoints.find((point) => point.id === selectedId),
    [sortedPoints, selectedId]
  );

  const getRelativePosition = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) {
      return null;
    }
    const rect = svg.getBoundingClientRect();
    const x = clamp((clientX - rect.left) / rect.width);
    const y = clamp((clientY - rect.top) / rect.height);
    return { x, y: 1 - y };
  }, []);

  useEffect(() => {
    if (!draggingId) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const result = getRelativePosition(event.clientX, event.clientY);
      if (!result) {
        return;
      }
      onPointChange(draggingId, result);
    };

    const handlePointerUp = () => {
      setDraggingId(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    window.addEventListener("pointercancel", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [draggingId, getRelativePosition, onPointChange]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<SVGCircleElement>, id: string) => {
      event.stopPropagation();
      event.preventDefault();
      setDraggingId(id);
      event.currentTarget.setPointerCapture(event.pointerId);
      onSelect(id);
    },
    [onSelect]
  );

  const handleSvgDoubleClick = useCallback(
    (event: ReactMouseEvent<SVGSVGElement>) => {
      const coords = getRelativePosition(event.clientX, event.clientY);
      if (!coords) {
        return;
      }
      // Avoid adding points too close to the edges because they are reserved for locked nodes.
      if (coords.x < 0.02 || coords.x > 0.98) {
        return;
      }
      onAddPoint(coords.x, coords.y);
    },
    [getRelativePosition, onAddPoint]
  );

  const handleBackgroundPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      // Clicking empty canvas clears selection unless we are about to drag.
      if ((event.target as HTMLElement).dataset?.node !== "handle") {
        onSelect(null);
      }
    },
    [onSelect]
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!selectedPoint) {
        return;
      }
      const step = event.shiftKey ? KEY_STEP_FINE : KEY_STEP;
      let handled = false;
      if (event.key === "ArrowLeft") {
        onPointChange(selectedPoint.id, { x: selectedPoint.x - step });
        handled = true;
      } else if (event.key === "ArrowRight") {
        onPointChange(selectedPoint.id, { x: selectedPoint.x + step });
        handled = true;
      } else if (event.key === "ArrowUp") {
        onPointChange(selectedPoint.id, { y: selectedPoint.y + step });
        handled = true;
      } else if (event.key === "ArrowDown") {
        onPointChange(selectedPoint.id, { y: selectedPoint.y - step });
        handled = true;
      } else if ((event.key === "Backspace" || event.key === "Delete") && !selectedPoint.locked) {
        onRemovePoint(selectedPoint.id);
        handled = true;
      }

      if (handled) {
        event.preventDefault();
      }
    },
    [onPointChange, onRemovePoint, selectedPoint]
  );

  const gridLines = useMemo(() => {
    return Array.from({ length: GRID_STEPS - 1 }, (_, index) => {
      const ratio = (index + 1) / GRID_STEPS;
      return {
        x: ratio,
        y: ratio,
      };
    });
  }, []);

  const { strokePath, areaPath } = useMemo(() => {
    if (sortedPoints.length < 2) {
      return { strokePath: "", areaPath: "" };
    }

    const tension = 0.5;
    const vectors = sortedPoints.map((point) => ({
      x: clamp(point.x, 0, 1),
      y: clamp(1 - point.y, 0, 1),
    }));

    let path = `M ${vectors[0].x} ${vectors[0].y}`;
    for (let index = 0; index < vectors.length - 1; index += 1) {
      const p0 = vectors[index - 1] ?? vectors[index];
      const p1 = vectors[index];
      const p2 = vectors[index + 1];
      const p3 = vectors[index + 2] ?? vectors[index + 1];

      const cp1x = p1.x + ((p2.x - p0.x) * tension) / 6;
      const cp1y = p1.y + ((p2.y - p0.y) * tension) / 6;
      const cp2x = p2.x - ((p3.x - p1.x) * tension) / 6;
      const cp2y = p2.y - ((p3.y - p1.y) * tension) / 6;

      path += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
    }

    const last = vectors[vectors.length - 1];
    const first = vectors[0];
    const area = `${path} L ${last.x} 1 L ${first.x} 1 Z`;
    return { strokePath: path, areaPath: area };
  }, [sortedPoints]);

  return (
    <div
      ref={containerRef}
      className="ramp-editor"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="Displacement ramp editor"
    >
      <svg
        ref={svgRef}
        className="ramp-canvas"
        viewBox="0 0 1 1"
        onPointerDown={handleBackgroundPointerDown}
        onDoubleClick={handleSvgDoubleClick}
        role="img"
        aria-labelledby="ramp-title"
      >
        <title id="ramp-title">Interactive displacement ramp</title>
        <defs>
          <linearGradient id="ramp-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(59,130,246,0.65)" />
            <stop offset="100%" stopColor="rgba(14,165,233,0.35)" />
          </linearGradient>
          <linearGradient id="grid-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(148,163,184,0.05)" />
            <stop offset="100%" stopColor="rgba(148,163,184,0.1)" />
          </linearGradient>
        </defs>

        {/* Background */}
        <rect x={0} y={0} width={1} height={1} fill="url(#grid-gradient)" rx={0.06} />

        {/* Grid lines */}
        {gridLines.map((line) => (
          <g key={`${line.x}-${line.y}`} className="ramp-grid">
            <line x1={line.x} y1={0} x2={line.x} y2={1} />
            <line x1={0} y1={line.y} x2={1} y2={line.y} />
          </g>
        ))}

        {/* Area under curve */}
        {areaPath && <path className="ramp-area" d={areaPath} />}

        {/* Curve */}
        {strokePath && <path className="ramp-stroke" d={strokePath} />}

        {/* Handles */}
        {sortedPoints.map((point) => {
          const handleX = clamp(point.x, 0, 1);
          const handleY = clamp(1 - point.y, 0, 1);
          const isSelected = point.id === selectedId;
          const isHover = point.id === hoverId;
          const isDragging = point.id === draggingId;
          return (
            <g key={point.id} transform={`translate(${handleX} ${handleY})`}>
              <circle
                data-node="handle"
                className={[
                  "ramp-handle",
                  point.locked ? "ramp-handle--locked" : "",
                  isSelected ? "ramp-handle--active" : "",
                  isHover ? "ramp-handle--hover" : "",
                  isDragging ? "ramp-handle--dragging" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                r={0.018}
                onPointerDown={(event) => handlePointerDown(event, point.id)}
                onPointerEnter={() => setHoverId(point.id)}
                onPointerLeave={() => setHoverId((current) => (current === point.id ? null : current))}
                aria-label={`Ramp handle at ${Math.round(point.x * 100)} percent horizontal, ${Math.round(
                  point.y * 100
                )} percent vertical`}
              />
              {isSelected && (
                <circle className="ramp-handle-outline" r={0.032} pointerEvents="none" aria-hidden="true" />
              )}
              {!point.locked && (
                <circle className="ramp-handle-hitbox" r={0.04} pointerEvents="none" aria-hidden="true" />
              )}
            </g>
          );
        })}
      </svg>
      <div className="ramp-hints">
        <span>Tip: Double-click to add a handle. Delete removes the selected one.</span>
        <span>Shift + arrows nudges by fine increments.</span>
      </div>
    </div>
  );
};

export default RampEditor;
