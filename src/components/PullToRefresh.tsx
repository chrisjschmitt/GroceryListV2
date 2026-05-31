import React, { useState, useRef, useCallback } from "react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  enabled: boolean;
  children: React.ReactNode;
}

const THRESHOLD = 80;

export default function PullToRefresh({ onRefresh, enabled, children }: PullToRefreshProps) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled || refreshing) return;
    const scrollTop = containerRef.current?.scrollTop ?? 0;
    if (scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    setPulling(true);
  }, [enabled, refreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling || refreshing) return;
    const currentY = e.touches[0].clientY;
    const diff = Math.max(0, currentY - startY.current);
    setPullDistance(Math.min(diff * 0.5, THRESHOLD * 1.5));
  }, [pulling, refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling) return;
    setPulling(false);

    if (pullDistance >= THRESHOLD) {
      setRefreshing(true);
      setPullDistance(THRESHOLD * 0.5);
      await onRefresh();
      setRefreshing(false);
    }

    setPullDistance(0);
  }, [pulling, pullDistance, onRefresh]);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
    >
      {(pullDistance > 0 || refreshing) && (
        <div
          className="flex items-center justify-center text-xs text-gray-400 overflow-hidden transition-all"
          style={{ height: pullDistance > 0 ? pullDistance : 30 }}
        >
          {refreshing ? (
            <span className="animate-spin">🔄</span>
          ) : pullDistance >= THRESHOLD ? (
            <span>Release to refresh</span>
          ) : (
            <span>Pull down to refresh</span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
