import { useCallback, useEffect, useRef } from 'react';

/** 拖拽结束或取消后，阻止同一次按压松手产生的点击。 */
export function useDragClickGuard() {
  const suppressClick = useRef(false);

  useEffect(() => {
    const reset = () => {
      suppressClick.current = false;
    };
    const handleClick = (event: MouseEvent) => {
      // 键盘触发的点击不属于指针拖拽手势。
      if (!suppressClick.current || event.detail === 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    // Esc 只结束拖拽，不代表鼠标已松开；到下一次按压才解除拦截。
    document.addEventListener('click', handleClick, true);
    document.addEventListener('pointerdown', reset, true);
    window.addEventListener('blur', reset);
    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('pointerdown', reset, true);
      window.removeEventListener('blur', reset);
    };
  }, []);

  return useCallback((activatorEvent: Event) => {
    if (activatorEvent.type === 'pointerdown') suppressClick.current = true;
  }, []);
}
