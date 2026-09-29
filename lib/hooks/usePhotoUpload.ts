"use client";

import { useEffect, useRef, useState } from "react";

export function usePhotoUpload() {
  const active = useRef<AbortController | null>(null);
  const reader = useRef<FileReader | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  useEffect(() => () => {
    active.current?.abort();
    reader.current?.abort();
  }, []);

  const cancel = () => {
    active.current?.abort();
    active.current = null;
    reader.current?.abort();
    setIsSaving(false);
    setProgress(null);
  };
  const begin = () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setIsSaving(true);
    setProgress(null);
    return {
      signal: controller.signal,
      onProgress: (value: number | null) => {
        if (active.current === controller) setProgress(value);
      },
      finish: () => {
        if (active.current !== controller) return;
        setIsSaving(false);
        setProgress(null);
      },
    };
  };
  return { isSaving, progress, begin, cancel, reader };
}
