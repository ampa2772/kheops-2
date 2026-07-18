import { useLayoutEffect, useState } from 'react';

export default function useElementWidth(ref, fallback = 1440) {
  const [width, setWidth] = useState(fallback);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    let frame = null;

    const measure = (reportedWidth) => {
      const measured = Number(reportedWidth) || element.getBoundingClientRect?.().width || element.clientWidth || fallback;
      const next = Math.max(1, Math.round(measured));
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setWidth((current) => (current === next ? current : next)));
    };

    measure();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver((entries) => measure(entries[0]?.contentRect?.width));
      observer.observe(element);
      return () => {
        observer.disconnect();
        if (frame) cancelAnimationFrame(frame);
      };
    }

    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [fallback, ref]);

  return width;
}
