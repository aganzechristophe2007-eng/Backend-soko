
import { useEffect, useRef, useState } from "react";

type Props = {
  className?: string;
  draggable?: boolean;
  initialPosition?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
};

export default function A30Icon({
  className = "h-10 w-10",
  draggable = true,
  initialPosition = "bottom-right",
}: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    moved: false,
  });

  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const margin = 20;
    const size = buttonRef.current?.offsetWidth ?? 40;

    const positions = {
      "bottom-right": {
        x: window.innerWidth - size - margin,
        y: window.innerHeight - size - margin,
      },
      "bottom-left": { x: margin, y: window.innerHeight - size - margin },
      "top-right": { x: window.innerWidth - size - margin, y: margin },
      "top-left": { x: margin, y: margin },
    };

    setPosition(positions[initialPosition]);
    setReady(true);
  }, [initialPosition]);

  useEffect(() => {
    const handleResize = () => {
      const size = buttonRef.current?.offsetWidth ?? 40;
      setPosition((p) => ({
        x: Math.max(8, Math.min(p.x, window.innerWidth - size - 8)),
        y: Math.max(8, Math.min(p.y, window.innerHeight - size - 8)),
      }));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handlePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (!draggable || event.button !== 0) return;

    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    const drag = dragRef.current;
    if (!drag.active) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (Math.abs(dx) + Math.abs(dy) > 3) {
      drag.moved = true;
    }

    if (!drag.moved) return;

    const size = buttonRef.current?.offsetWidth ?? 40;

    setPosition({
      x: Math.max(
        0,
        Math.min(drag.originX + dx, window.innerWidth - size),
      ),
      y: Math.max(
        0,
        Math.min(drag.originY + dy, window.innerHeight - size),
      ),
    });
  };

  const handlePointerUp = () => {
    dragRef.current.active = false;
    setDragging(false);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    const step = event.shiftKey ? 24 : 8;

    const directions: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };

    const direction = directions[event.key];
    if (!direction) return;

    event.preventDefault();

    const size = buttonRef.current?.offsetWidth ?? 40;

    setPosition((p) => ({
      x: Math.max(
        0,
        Math.min(p.x + direction[0], window.innerWidth - size),
      ),
      y: Math.max(
        0,
        Math.min(p.y + direction[1], window.innerHeight - size),
      ),
    }));
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label="Icône IA. Utilisez les flèches pour déplacer."
      title={draggable ? "Glisser pour déplacer" : "Assistant IA"}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      className={[
        "a30-icon group fixed z-[9999]",
        "flex items-center justify-center rounded-full",
        "text-cyan-400 hover:text-cyan-300",
        "focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-cyan-400 focus-visible:ring-offset-2",
        "select-none touch-none",
        dragging ? "cursor-grabbing" : "cursor-grab",
        className,
      ].join(" ")}
      style={{
        left: ready ? position.x : -100,
        top: ready ? position.y : -100,
        opacity: ready ? 1 : 0,
        transition: dragging
          ? "color 180ms ease"
          : "color 180ms ease, opacity 180ms ease",
      }}
    >
      {/* Halo léger */}
      <span
        aria-hidden="true"
        className="a30-icon-halo pointer-events-none absolute inset-1 rounded-full"
      />

      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="a30-icon-symbol relative z-10 h-[72%] w-[72%] overflow-visible"
      >
        <defs>
          <linearGradient id="a30-spark-gradient">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.45" />
            <stop offset="50%" stopColor="currentColor" stopOpacity="1" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.6" />
          </linearGradient>
        </defs>

        <g className="a30-icon-main-star">
          <path
            d="M10 3.5C10.7 8.7 13.3 11.3 18.5 12C13.3 12.7 10.7 15.3 10 20.5C9.3 15.3 6.7 12.7 1.5 12C6.7 11.3 9.3 8.7 10 3.5Z"
            stroke="url(#a30-spark-gradient)"
            strokeWidth="1.15"
            strokeLinejoin="round"
          />
          <path
            d="M10 7.5V16.5M5.5 12H14.5"
            stroke="currentColor"
            strokeOpacity="0.35"
            strokeWidth="0.6"
            strokeLinecap="round"
          />
        </g>

        <g className="a30-icon-small-star">
          <path
            d="M19 2C19.3 4 20 4.7 22 5C20 5.3 19.3 6 19 8C18.7 6 18 5.3 16 5C18 4.7 18.7 4 19 2Z"
            stroke="currentColor"
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
        </g>

        <circle
          cx="18"
          cy="17.5"
          r="0.65"
          fill="currentColor"
          className="a30-icon-dot"
        />
      </svg>
    </button>
  );
}
