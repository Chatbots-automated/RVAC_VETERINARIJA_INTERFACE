import { useEffect, useRef } from 'react';

export function useScrollToTop(dependency?: any) {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [dependency]);
}

export function useScrollToTopOnMount() {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
}

export function useContainerScrollToTop(dependency?: any) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [dependency]);

  return containerRef;
}
