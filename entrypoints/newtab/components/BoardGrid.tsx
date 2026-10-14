import { createContext, useContext, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';

const GridColumnsContext = createContext(1);

/** 按实际轨道数限制分组跨度，窗口尺寸变化时同步更新。 */
export function BoardGrid({ columns, children }: {
  columns: 'auto' | number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [actualColumns, setActualColumns] = useState(columns === 'auto' ? 1 : columns);
  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    const update = () => {
      if (!grid.clientWidth) return;
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
      setActualColumns(columns === 'auto'
        ? Math.max(1, Math.floor((grid.clientWidth + gap) / (320 + gap)))
        : columns);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [columns]);
  return (
    <GridColumnsContext value={actualColumns}>
      <div ref={ref} className="grid items-start gap-3" style={{
        gridTemplateColumns: columns === 'auto'
          ? 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))'
          : `repeat(${columns}, minmax(0, 1fr))`,
      }}>{children}</div>
    </GridColumnsContext>
  );
}

export function BoardGridItem({ span = 1, style, ...props }: ComponentProps<'div'> & { span?: number }) {
  const columns = useContext(GridColumnsContext);
  return <div {...props} style={{ ...style, gridColumn: `span ${Math.min(span, columns)}` }} />;
}
