import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import type { MediaStatus } from "../hooks/useMediaStream";
import type { RampPoint } from "./RampEditor";

type GLState = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  rampTextureX: WebGLTexture;
  rampTextureY: WebGLTexture;
  baseTexture: WebGLTexture;
  baseData: Uint8Array;
  baseSize: number;
  positionBuffer: WebGLBuffer;
  vertexShader: WebGLShader;
  fragmentShader: WebGLShader;
  uniforms: {
    intensityX: WebGLUniformLocation | null;
    intensityY: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    waveAmount: WebGLUniformLocation | null;
  };
};

type DisplacementPreviewProps = {
  horizontalPoints: RampPoint[];
  verticalPoints: RampPoint[];
  intensityX: number;
  intensityY: number;
  waveIntensity: number;
  videoStream: MediaStream | null;
  status?: MediaStatus;
  onReady?: (handle: DisplacementPreviewHandle | null) => void;
};

const RAMP_RESOLUTION = 256;

export type DisplacementPreviewHandle = {
  captureImage: () => Promise<Blob>;
  captureGif: (options: { duration: number; fps: number; scale: number }) => Promise<Blob>;
};

const clamp = (value: number, min = 0, max = 1) => Math.min(Math.max(value, min), max);

const generateRampTextureData = (points: RampPoint[], size: number): Uint8Array => {
  if (points.length === 0) {
    return new Uint8Array(Array.from({ length: size }, () => 127));
  }

  const sorted = [...points]
    .map(({ x, y }) => ({ x: clamp(x), y: clamp(y) }))
    .sort((a, b) => a.x - b.x);

  const normalized = [...sorted];
  const first = normalized[0];
  const last = normalized[normalized.length - 1];

  if (first.x > 0) {
    normalized.unshift({ x: 0, y: first.y });
  }
  if (last.x < 1) {
    normalized.push({ x: 1, y: last.y });
  }

  const samples = new Uint8Array(size);
  let segment = 0;

  for (let index = 0; index < size; index += 1) {
    const t = index / (size - 1);

    while (segment < normalized.length - 2 && t > normalized[segment + 1].x) {
      segment += 1;
    }

    const left = normalized[segment];
    const right = normalized[segment + 1] ?? normalized[segment];

    const span = right.x - left.x || 1;
    const ratio = clamp((t - left.x) / span, 0, 1);
    const value = clamp(left.y + (right.y - left.y) * ratio, 0, 1);

    samples[index] = Math.round(value * 255);
  }

  return samples;
};

const vertexSource = `#version 300 es
precision highp float;
layout (location = 0) in vec2 position;
out vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentSource = `#version 300 es
precision highp float;
uniform sampler2D uBaseTexture;
uniform sampler2D uRampTextureX;
uniform sampler2D uRampTextureY;
uniform float uIntensityX;
uniform float uIntensityY;
uniform float uTime;
uniform float uWaveAmount;
in vec2 vUv;
out vec4 fragColor;

float sampleRampX(float x) {
  return texture(uRampTextureX, vec2(x, 0.5)).r;
}

float sampleRampY(float y) {
  return texture(uRampTextureY, vec2(y, 0.5)).r;
}

vec2 distort(vec2 uv, float rampX, float rampY) {
  float wobbleX = sin((uv.y + uTime * 0.25) * 6.283) * 0.02 * uWaveAmount;
  float wobbleY = cos((uv.x + uTime * 0.33) * 6.283) * 0.023 * uWaveAmount;
  float offsetX = (rampX - 0.5) * max(uIntensityX, 0.0) * 0.6 + wobbleX;
  float offsetY = (rampY - 0.5) * max(uIntensityY, 0.0) * 0.6 + wobbleY;
  return uv + vec2(offsetX, offsetY);
}

void main() {
  float rampX = sampleRampX(vUv.x);
  float rampY = sampleRampY(vUv.y);
  vec2 refracted = distort(vUv, rampX, rampY);
  vec3 base = texture(uBaseTexture, refracted).rgb;
  vec3 shifted = texture(uBaseTexture, refracted + vec2(0.004, -0.003)).rgb;
  float blend = clamp((uIntensityX + uIntensityY) * 0.35, 0.0, 0.85);
  vec3 color = mix(base, shifted, blend);
  fragColor = vec4(color, 1.0);
}
`;

const createShader = (gl: WebGL2RenderingContext, type: GLenum, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Failed to create shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? "Unknown compile error";
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
};

const createProgram = (gl: WebGL2RenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader) => {
  const program = gl.createProgram();
  if (!program) {
    throw new Error("Failed to create program");
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? "Unknown program link error";
    gl.deleteProgram(program);
    throw new Error(info);
  }
  return program;
};

const createBaseTexture = (gl: WebGL2RenderingContext) => {
  const size = 256;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const stripe = ((Math.floor(x / 12) + Math.floor(y / 12)) % 2) === 0 ? 1 : 0;
      const gradient = x / size;
      const wave = Math.sin((y / size) * Math.PI * 2 + gradient * Math.PI) * 0.5 + 0.5;

      const r = Math.round(180 + 50 * gradient + 25 * wave);
      const g = Math.round(160 + 30 * wave + 45 * stripe);
      const b = Math.round(200 + 35 * gradient + 30 * (1 - stripe));

      data[offset] = clamp(r, 0, 255);
      data[offset + 1] = clamp(g, 0, 255);
      data[offset + 2] = clamp(b, 0, 255);
      data[offset + 3] = 255;
    }
  }

  const texture = gl.createTexture();
  if (!texture) {
    throw new Error("Failed to create base texture");
  }

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);

  return { texture, data, size };
};

const createRampTexture = (gl: WebGL2RenderingContext, data: Uint8Array, unit: GLenum) => {
  const texture = gl.createTexture();
  if (!texture) {
    throw new Error("Failed to create ramp texture");
  }

  gl.activeTexture(unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, data.length, 1, 0, gl.RED, gl.UNSIGNED_BYTE, data);

  return texture;
};

const DisplacementPreview = ({
  horizontalPoints,
  verticalPoints,
  intensityX,
  intensityY,
  waveIntensity,
  videoStream,
  status = "inactive",
  onReady,
}: DisplacementPreviewProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glStateRef = useRef<GLState | null>(null);
  const animationRef = useRef<number>();
  const intensityXRef = useRef<number>(intensityX);
  const intensityYRef = useRef<number>(intensityY);
  const waveIntensityRef = useRef<number>(waveIntensity);
  const [glError, setGlError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const useVideoRef = useRef<boolean>(false);
  const videoReadyRef = useRef<boolean>(false);
  const [videoReady, setVideoReady] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const horizontalSamples = useMemo(
    () => generateRampTextureData(horizontalPoints, RAMP_RESOLUTION),
    [horizontalPoints]
  );
  const verticalSamples = useMemo(() => generateRampTextureData(verticalPoints, RAMP_RESOLUTION), [verticalPoints]);

  useEffect(() => {
    intensityXRef.current = intensityX;
  }, [intensityX]);

  useEffect(() => {
    intensityYRef.current = intensityY;
  }, [intensityY]);

  useEffect(() => {
    waveIntensityRef.current = waveIntensity;
  }, [waveIntensity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || glStateRef.current) {
      return;
    }

    const gl = canvas.getContext("webgl2", { antialias: true });
    if (!gl) {
      setGlError("WebGL2 not supported by this browser or device.");
      return;
    }

    let resizeObserver: ResizeObserver | null = null;

    try {
      const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
      const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
      const program = createProgram(gl, vertexShader, fragmentShader);

      gl.useProgram(program);

      const positionBuffer = gl.createBuffer();
      if (!positionBuffer) {
        throw new Error("Unable to allocate buffer");
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      const positions = new Float32Array([-1, -1, 3, -1, -1, 3]);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      const { texture: baseTexture, data: baseData, size: baseSize } = createBaseTexture(gl);
      const rampTextureX = createRampTexture(gl, horizontalSamples, gl.TEXTURE1);
      const rampTextureY = createRampTexture(gl, verticalSamples, gl.TEXTURE2);

      const uniforms = {
        intensityX: gl.getUniformLocation(program, "uIntensityX"),
        intensityY: gl.getUniformLocation(program, "uIntensityY"),
        time: gl.getUniformLocation(program, "uTime"),
        waveAmount: gl.getUniformLocation(program, "uWaveAmount"),
      };
      const baseSampler = gl.getUniformLocation(program, "uBaseTexture");
      const rampSamplerX = gl.getUniformLocation(program, "uRampTextureX");
      const rampSamplerY = gl.getUniformLocation(program, "uRampTextureY");

      if (baseSampler) {
        gl.uniform1i(baseSampler, 0);
      }
      if (rampSamplerX) {
        gl.uniform1i(rampSamplerX, 1);
      }
      if (rampSamplerY) {
        gl.uniform1i(rampSamplerY, 2);
      }

      glStateRef.current = {
        gl,
        program,
        rampTextureX,
        rampTextureY,
        baseTexture,
        baseData,
        baseSize,
        positionBuffer,
        vertexShader,
        fragmentShader,
        uniforms,
      };

      gl.clearColor(0.91, 0.94, 0.98, 1);
      gl.disable(gl.DEPTH_TEST);
      gl.pixelStorei(gl.PACK_ALIGNMENT, 1);

      const resize = () => {
        if (!canvas) {
          return;
        }
        const ratio = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
        const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
      };

      resizeObserver = new ResizeObserver(() => resize());
      resizeObserver.observe(canvas);
      resize();

      const render = (time: number) => {
        gl.useProgram(program);
        gl.clear(gl.COLOR_BUFFER_BIT);

        if (useVideoRef.current && videoRef.current && videoRef.current.readyState >= 2) {
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, baseTexture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoRef.current);
        } else {
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, baseTexture);
        }

        if (uniforms.intensityX) {
          gl.uniform1f(uniforms.intensityX, intensityXRef.current);
        }
        if (uniforms.intensityY) {
          gl.uniform1f(uniforms.intensityY, intensityYRef.current);
        }
        if (uniforms.waveAmount) {
          gl.uniform1f(uniforms.waveAmount, waveIntensityRef.current);
        }
        if (uniforms.time) {
          gl.uniform1f(uniforms.time, time * 0.001);
        }

        gl.drawArrays(gl.TRIANGLES, 0, 3);
        animationRef.current = window.requestAnimationFrame(render);
      };

      animationRef.current = window.requestAnimationFrame(render);
      setIsReady(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown WebGL error";
      setGlError(message);
    }

    return () => {
      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current);
      }

      if (resizeObserver && canvas) {
        resizeObserver.unobserve(canvas);
        resizeObserver.disconnect();
      }

      const state = glStateRef.current;
      if (state) {
        const {
          gl,
          program,
          rampTextureX,
          rampTextureY,
          baseTexture,
          positionBuffer,
          vertexShader,
          fragmentShader,
        } = state;
        gl.deleteTexture(rampTextureX);
        gl.deleteTexture(rampTextureY);
        gl.deleteTexture(baseTexture);
        gl.deleteBuffer(positionBuffer);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
      }
      glStateRef.current = null;
      setIsReady(false);
    };
  }, []); // initialize once

  useEffect(() => {
    const state = glStateRef.current;
    if (!state) {
      return;
    }
    const { gl, program, rampTextureX, rampTextureY } = state;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, rampTextureX);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, horizontalSamples.length, 1, gl.RED, gl.UNSIGNED_BYTE, horizontalSamples);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, rampTextureY);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, verticalSamples.length, 1, gl.RED, gl.UNSIGNED_BYTE, verticalSamples);
  }, [horizontalSamples, verticalSamples]);

  useEffect(() => {
    const state = glStateRef.current;
    if (!state) {
      return;
    }

    if (!videoStream) {
      useVideoRef.current = false;
      videoReadyRef.current = false;
      setVideoReady(false);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      const { gl, baseTexture, baseData, baseSize } = state;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, baseTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, baseSize, baseSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, baseData);
      return;
    }

    if (!videoRef.current) {
      const element = document.createElement("video");
      element.autoplay = true;
      element.muted = true;
      element.playsInline = true;
      videoRef.current = element;
    }

    const video = videoRef.current;
    const handleLoaded = () => {
      useVideoRef.current = true;
      videoReadyRef.current = true;
      setVideoReady(true);
    };
    const handleError = () => {
      useVideoRef.current = false;
      videoReadyRef.current = false;
      setVideoReady(false);
    };

    videoReadyRef.current = false;
    setVideoReady(false);
    video.srcObject = videoStream;
    video.addEventListener("loadeddata", handleLoaded);
    video.addEventListener("error", handleError);

    const playAttempt = video.play();
    if (playAttempt && typeof playAttempt.catch === "function") {
      playAttempt.catch(() => {
        handleError();
      });
    }

    return () => {
      video.removeEventListener("loadeddata", handleLoaded);
      video.removeEventListener("error", handleError);
    };
  }, [videoStream]);

  useEffect(() => {
    if (status !== "active") {
      useVideoRef.current = false;
      videoReadyRef.current = false;
      setVideoReady(false);
    }
  }, [status]);

  const shouldShowOverlay = !glError && (status !== "active" || !videoReady);
  let overlayMessage: string | null = null;

  if (shouldShowOverlay) {
    if (status === "inactive") {
      overlayMessage = "Enable your webcam to pipe the live feed through the displacement shader.";
    } else if (status === "pending") {
      overlayMessage = "Waiting for permission…";
    } else if (status === "error") {
      overlayMessage = "Unable to access webcam. Adjust permissions and try again.";
    } else if (status === "active" && !videoReady) {
      overlayMessage = "Preparing webcam feed…";
    }
  }

  const captureImage = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      throw new Error("Preview not ready");
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Unable to generate image blob"));
        }
      }, "image/png");
    });
  }, []);

  const captureGif = useCallback(
    async ({ duration, fps, scale }: { duration: number; fps: number; scale: number }) => {
      const canvas = canvasRef.current;
      const state = glStateRef.current;
      if (!canvas || !state) {
        throw new Error("Preview not ready");
      }
      const sanitizedDuration = Math.max(0.5, duration);
      const sanitizedFps = Math.min(60, Math.max(1, Math.round(fps)));
      const sanitizedScale = Math.min(1, Math.max(0.1, Number.isFinite(scale) ? scale : 1));
      const frameIntervalMs = 1000 / sanitizedFps;
      const frameCount = Math.max(1, Math.round(sanitizedDuration * sanitizedFps));
      // gifenc expects delay in milliseconds; it will convert to cs internally
      const delayMs = Math.max(0, Math.round(frameIntervalMs));

      const { gl } = state;
      const width = canvas.width;
      const height = canvas.height;
      const targetWidth = Math.max(1, Math.round(width * sanitizedScale));
      const targetHeight = Math.max(1, Math.round(height * sanitizedScale));

      const fullCanvas = document.createElement("canvas");
      fullCanvas.width = width;
      fullCanvas.height = height;
      const fullCtx = fullCanvas.getContext("2d");
      if (!fullCtx) {
        throw new Error("Unable to allocate capture buffer");
      }

      const scaledCanvas = document.createElement("canvas");
      scaledCanvas.width = targetWidth;
      scaledCanvas.height = targetHeight;
      const scaledCtx = scaledCanvas.getContext("2d");
      if (!scaledCtx) {
        throw new Error("Unable to allocate scaled buffer");
      }
      scaledCtx.imageSmoothingEnabled = true;

      const pixelBuffer = new Uint8Array(width * height * 4);
      const flipped = new Uint8ClampedArray(width * height * 4);
      const fullImageData = new ImageData(flipped, width, height);

      const encoder = GIFEncoder();
      let frameIndex = 0;

      const captureFrame = () => {
        gl.finish();
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer);

        for (let y = 0; y < height; y += 1) {
          const srcStart = y * width * 4;
          const dstStart = (height - 1 - y) * width * 4;
          flipped.set(pixelBuffer.subarray(srcStart, srcStart + width * 4), dstStart);
        }

        fullCtx.putImageData(fullImageData, 0, 0);
        scaledCtx.clearRect(0, 0, targetWidth, targetHeight);
        scaledCtx.drawImage(fullCanvas, 0, 0, width, height, 0, 0, targetWidth, targetHeight);
        const scaledImageData = scaledCtx.getImageData(0, 0, targetWidth, targetHeight);
        // Use ImageData.data directly (Uint8ClampedArray), supported by gifenc
        const rgba = scaledImageData.data;
        const palette = quantize(rgba, 256);
        const rawIndexData = applyPalette(rgba, palette);
        const indexData = rawIndexData instanceof Uint8Array ? rawIndexData : new Uint8Array(rawIndexData as any);
        if (indexData.length !== targetWidth * targetHeight) {
          throw new Error("Indexed frame has unexpected length");
        }
        // gifenc signature: writeFrame(index, width, height, opts)
        encoder.writeFrame(indexData, targetWidth, targetHeight, {
          palette,
          delay: delayMs,
          repeat: frameIndex === 0 ? 0 : undefined,
        });
        frameIndex += 1;
      };

      await new Promise<void>((resolve) => {
        let captured = 0;
        let startTime = 0;
        let nextCapture = 0;
        const step = (now: number) => {
          if (captured >= frameCount) {
            resolve();
            return;
          }
          if (captured === 0) {
            startTime = now;
            nextCapture = now;
          }
          // Capture at most one frame per RAF tick to ensure
          // the WebGL render loop advances between frames.
          if (now >= nextCapture) {
            captureFrame();
            captured += 1;
            nextCapture += frameIntervalMs;
          }
          if (captured >= frameCount || now - startTime >= sanitizedDuration * 1000 + frameIntervalMs) {
            resolve();
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });

      encoder.finish();
      const bytes = encoder.bytes();
      if (!bytes || bytes.length === 0) {
        throw new Error("Generated GIF was empty");
      }
      const arrayCopy = bytes.slice();
      return new Blob([arrayCopy], { type: "image/gif" });
    },
    []
  );

  useEffect(() => {
    if (!onReady) {
      return;
    }
    if (!isReady) {
      onReady(null);
      return;
    }
    const handle: DisplacementPreviewHandle = {
      captureImage,
      captureGif,
    };
    onReady(handle);
    return () => {
      onReady(null);
    };
  }, [captureGif, captureImage, onReady, isReady]);

  return (
    <div className="preview-wrapper">
      <canvas ref={canvasRef} className="preview-canvas" />
      {glError && <div className="preview-fallback">{glError}</div>}
      {overlayMessage && (
        <div className="preview-overlay">
          <p>{overlayMessage}</p>
        </div>
      )}
    </div>
  );
};

export default DisplacementPreview;
