import { useEffect, useRef, useState } from 'react';

const carriesFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/**
 * Lets her drop sound files anywhere on the page. Returns true while a file is being dragged over the page,
 * so the drop zone can light up. A dropped file is never opened by the browser itself.
 */
export function usePageDrop(enabled: boolean, onFiles: (files: File[]) => void): boolean {
  const [dragging, setDragging] = useState(false);
  const latest = useRef({ enabled, onFiles });

  useEffect(() => {
    latest.current = { enabled, onFiles };
  });

  useEffect(() => {
    // dragenter and dragleave fire for every box the file crosses, so count them to know when it has really left.
    let depth = 0;

    const onEnter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth += 1;
      if (latest.current.enabled) setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = latest.current.enabled ? 'copy' : 'none';
    };
    const onLeave = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (!latest.current.enabled) return;
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) latest.current.onFiles(files);
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  return dragging && enabled;
}
