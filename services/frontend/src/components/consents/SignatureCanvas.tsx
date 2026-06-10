import { useRef, useState, useCallback } from 'react';

// Draw-to-sign canvas: mouse/finger via pointer events, exports a PNG data URL.
export function SignatureCanvas({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [empty, setEmpty] = useState(true);

  const pos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    // Canvas internal pixels vs CSS pixels can differ — scale the coordinates.
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    canvasRef.current!.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e293b';
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk.current) {
      hasInk.current = true;
      setEmpty(false);
    }
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(hasInk.current ? canvasRef.current!.toDataURL('image/png') : null);
  };

  const clear = useCallback(() => {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    hasInk.current = false;
    setEmpty(true);
    onChange(null);
  }, [onChange]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={560}
        height={180}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        style={{
          width: '100%', height: 180, display: 'block',
          border: '1.5px dashed var(--s300)', borderRadius: 10,
          background: '#fff', touchAction: 'none', cursor: 'crosshair',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--s400)' }}>
          {empty ? 'Firma aquí con el dedo o el mouse' : 'Firma del paciente'}
        </span>
        <button
          type="button"
          onClick={clear}
          style={{ fontSize: 12, border: 'none', background: 'none', color: 'var(--teal)', cursor: 'pointer', fontWeight: 600, padding: 0 }}
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}
