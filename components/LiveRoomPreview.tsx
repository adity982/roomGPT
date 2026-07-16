"use client";

import {
  CameraIcon,
  SparklesIcon,
  VideoCameraIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { themeType } from "../utils/dropdownTypes";

const themeLooks: Record<
  themeType,
  {
    filter: string;
    overlay: string;
    label: string;
  }
> = {
  Modern: {
    filter: "contrast(1.08) saturate(1.06) brightness(1.03)",
    overlay:
      "linear-gradient(135deg, rgba(37, 99, 235, 0.18), rgba(15, 23, 42, 0.05))",
    label: "Cooler light, cleaner contrast, crisp modern finish",
  },
  Minimalist: {
    filter: "grayscale(0.18) contrast(0.96) brightness(1.14)",
    overlay:
      "linear-gradient(135deg, rgba(255, 255, 255, 0.2), rgba(148, 163, 184, 0.1))",
    label: "Brighter neutrals, lower visual noise, airy palette",
  },
  Professional: {
    filter: "contrast(1.12) saturate(0.88) brightness(0.98)",
    overlay:
      "linear-gradient(135deg, rgba(30, 41, 59, 0.18), rgba(14, 165, 233, 0.08))",
    label: "Tidy contrast, muted tones, polished work-ready mood",
  },
  Tropical: {
    filter: "saturate(1.35) contrast(1.04) brightness(1.08)",
    overlay:
      "linear-gradient(135deg, rgba(20, 184, 166, 0.22), rgba(250, 204, 21, 0.12))",
    label: "Warmer sun, richer greens, lively lounge feel",
  },
  Vintage: {
    filter: "sepia(0.26) saturate(0.92) contrast(1.05) brightness(1.02)",
    overlay:
      "linear-gradient(135deg, rgba(180, 83, 9, 0.2), rgba(120, 53, 15, 0.08))",
    label: "Soft warmth, classic shadows, lived-in character",
  },
};

interface LiveRoomPreviewProps {
  theme: themeType;
  onCapture: (imageUrl: string, imageName: string) => void;
}

export default function LiveRoomPreview({
  theme,
  onCapture,
}: LiveRoomPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const look = useMemo(() => themeLooks[theme], [theme]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Live camera preview is not supported in this browser.");
      return;
    }

    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsLive(true);
    } catch (error) {
      setCameraError(
        error instanceof Error
          ? error.message
          : "Unable to start the live camera preview."
      );
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsLive(false);
  }

  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError("Start the live preview before capturing a frame.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.filter = look.filter;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    context.filter = "none";
    context.globalAlpha = 0.24;
    const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, theme === "Tropical" ? "#14b8a6" : "#2563eb");
    gradient.addColorStop(1, theme === "Vintage" ? "#b45309" : "#f8fafc");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalAlpha = 1;

    onCapture(
      canvas.toDataURL("image/jpeg", 0.92),
      `live-living-room-${theme.toLowerCase()}.jpg`
    );
  }

  return (
    <div className="mt-6 w-full max-w-3xl">
      <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-xl">
        <div className="relative aspect-video bg-slate-900">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
            style={{ filter: look.filter }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 mix-blend-soft-light"
            style={{ background: look.overlay }}
          />
          {!isLive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <VideoCameraIcon className="mb-3 h-10 w-10 text-blue-300" />
              <p className="max-w-md text-sm leading-6 text-slate-300">
                Open your camera to preview living room style changes in real
                time.
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-800 px-4 py-4 text-left sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
              <SparklesIcon className="h-5 w-5 text-blue-300" />
              Live {theme} living room look
            </div>
            <p className="mt-1 text-xs text-slate-400">{look.label}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {isLive ? (
              <button
                type="button"
                onClick={stopCamera}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-800"
              >
                <XMarkIcon className="h-4 w-4" />
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={startCamera}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
              >
                <VideoCameraIcon className="h-4 w-4" />
                Start
              </button>
            )}
            <button
              type="button"
              onClick={captureFrame}
              disabled={!isLive}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              <CameraIcon className="h-4 w-4" />
              Capture
            </button>
          </div>
        </div>
      </div>
      {cameraError && (
        <div
          className="mt-3 rounded-lg border border-red-400 bg-red-100 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {cameraError}
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
