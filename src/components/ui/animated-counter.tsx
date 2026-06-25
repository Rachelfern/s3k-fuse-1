"use client";

import { useEffect, useState } from "react";

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  active?: boolean;
  formatter?: (value: number) => string;
  className?: string;
}

export function AnimatedCounter({
  value,
  duration = 800,
  active = true,
  formatter = (v) => String(v),
  className,
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!active) {
      setDisplay(0);
      return;
    }

    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(value * eased));

      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    const frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, active]);

  return <span className={className}>{formatter(display)}</span>;
}
