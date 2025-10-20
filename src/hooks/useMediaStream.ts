import { useCallback, useEffect, useRef, useState } from "react";

export type MediaStatus = "inactive" | "pending" | "active" | "error";

type MediaState = {
  status: MediaStatus;
  stream: MediaStream | null;
  errorMessage: string | null;
};

const defaultState: MediaState = {
  status: "inactive",
  stream: null,
  errorMessage: null,
};

export const useMediaStream = () => {
  const [mediaState, setMediaState] = useState<MediaState>(defaultState);
  const lastStreamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    setMediaState((prev) => {
      prev.stream?.getTracks().forEach((track) => track.stop());
      return { status: "inactive", stream: null, errorMessage: null };
    });
    lastStreamRef.current?.getTracks().forEach((track) => track.stop());
    lastStreamRef.current = null;
  }, []);

  const requestStream = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaState({ status: "error", stream: null, errorMessage: "Webcam access is not supported in this browser." });
      return;
    }

    setMediaState({ status: "pending", stream: null, errorMessage: null });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: false,
      });
      lastStreamRef.current = stream;
      setMediaState({ status: "active", stream, errorMessage: null });
    } catch (error) {
      const message =
        error instanceof DOMException
          ? error.message || "Could not access the webcam."
          : "Could not access the webcam.";
      setMediaState({ status: "error", stream: null, errorMessage: message });
    }
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  useEffect(() => {
    const stream = mediaState.stream;
    if (!stream) {
      return;
    }

    const handleTrackEnded = () => {
      setMediaState((prev) => {
        if (prev.stream !== stream) {
          return prev;
        }
        stream.getTracks().forEach((track) => {
          if (track.readyState !== "ended") {
            track.stop();
          }
        });
        lastStreamRef.current = null;
        return { status: "inactive", stream: null, errorMessage: null };
      });
    };

    stream.getTracks().forEach((track) => {
      track.addEventListener("ended", handleTrackEnded);
    });

    return () => {
      stream.getTracks().forEach((track) => {
        track.removeEventListener("ended", handleTrackEnded);
      });
    };
  }, [mediaState.stream]);

  return {
    mediaState,
    requestStream,
    stopStream,
  };
};
