'use client';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { useTranslations } from 'next-intl';

// Width of the square crop area in CSS pixels, and of the saved image.
const view = 260;
const output = 512;
const maxZoom = 4;

// Before a photo is saved: drag it and zoom it inside the circle, then only
// the part in the circle is kept (a square JPEG; the circle is just CSS).
export function PhotoCropper({
  file,
  onCancel,
  onDone,
}: {
  file: File;
  onCancel: () => void;
  onDone: (file: File) => void;
}) {
  const t = useTranslations('Cropper');
  const dialog = useRef<HTMLDialogElement>(null);
  const [url] = useState(() => URL.createObjectURL(file));
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; from: typeof offset } | null>(
    null,
  );

  useEffect(() => {
    dialog.current?.showModal();
    const loaded = new Image();
    loaded.onload = () => setImage(loaded);
    loaded.src = url;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  // At zoom 1 the image just covers the square; it can never leave a gap.
  const cover = image
    ? Math.max(view / image.naturalWidth, view / image.naturalHeight)
    : 1;
  const scale = cover * zoom;
  const width = (image?.naturalWidth ?? 0) * scale;
  const height = (image?.naturalHeight ?? 0) * scale;
  const clamp = (next: typeof offset, s = scale) => {
    const maxX = Math.max(0, ((image?.naturalWidth ?? 0) * s - view) / 2);
    const maxY = Math.max(0, ((image?.naturalHeight ?? 0) * s - view) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  };
  function zoomTo(value: number) {
    const next = Math.min(maxZoom, Math.max(1, value));
    setZoom(next);
    setOffset((current) => clamp(current, cover * next));
  }

  function down(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, from: offset };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start) return;
    setOffset(
      clamp({
        x: start.from.x + event.clientX - start.x,
        y: start.from.y + event.clientY - start.y,
      }),
    );
  }
  // Arrow keys move the photo; + and - zoom it.
  function key(event: KeyboardEvent<HTMLDivElement>) {
    const step = 10;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (moves[event.key]) {
      const [x, y] = moves[event.key];
      setOffset((current) => clamp({ x: current.x + x, y: current.y + y }));
    } else if (event.key === '+' || event.key === '=') zoomTo(zoom + 0.1);
    else if (event.key === '-') zoomTo(zoom - 0.1);
    else return;
    event.preventDefault();
  }

  function confirm() {
    if (!image) return;
    const canvas = document.createElement('canvas');
    canvas.width = output;
    canvas.height = output;
    const side = view / scale;
    canvas
      .getContext('2d')!
      .drawImage(
        image,
        image.naturalWidth / 2 - offset.x / scale - side / 2,
        image.naturalHeight / 2 - offset.y / scale - side / 2,
        side,
        side,
        0,
        0,
        output,
        output,
      );
    canvas.toBlob(
      (blob) => {
        if (blob) onDone(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.9,
    );
  }

  return (
    <dialog
      ref={dialog}
      className="crop-dialog"
      aria-labelledby="crop-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="crop-title">{t('title')}</h2>
      <p id="crop-help">{t('help')}</p>
      <div
        className="crop-area"
        role="img"
        aria-label={t('area')}
        aria-describedby="crop-help"
        tabIndex={0}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(event) => zoomTo(zoom - event.deltaY / 500)}
        onKeyDown={key}
      >
        {image && (
          // A local preview of the chosen file.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            draggable={false}
            style={{
              width,
              height,
              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
            }}
          />
        )}
        <span className="crop-ring" aria-hidden="true" />
      </div>
      {/* Left to right in both languages: − zooms out, + zooms in. */}
      <label className="crop-zoom" dir="ltr">
        <span className="sr-only">{t('zoom')}</span>
        <span aria-hidden="true">−</span>
        <input
          type="range"
          min={1}
          max={maxZoom}
          step={0.01}
          value={zoom}
          onChange={(event) => zoomTo(Number(event.target.value))}
        />
        <span aria-hidden="true">+</span>
      </label>
      <div className="crop-actions">
        <button
          type="button"
          className="button-primary"
          disabled={!image}
          onClick={confirm}
        >
          {t('confirm')}
        </button>
        <button type="button" className="text-link" onClick={onCancel}>
          {t('cancel')}
        </button>
      </div>
    </dialog>
  );
}
