export type Box = { left: number; top: number; width: number; height: number };

const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;
const interpolate = (from: Box, to: Box, progress: number): Box => ({
  left: mix(from.left, to.left, progress), top: mix(from.top, to.top, progress),
  width: mix(from.width, to.width, progress), height: mix(from.height, to.height, progress),
});

/** Compensate for the button's scale so the SVG follows its own measured rectangle. */
export function iconMorphGeometry(source: Box, target: Box, sourceIcon: Box, targetIcon: Box, progress: number) {
  const box = interpolate(source, target, progress);
  const icon = interpolate(sourceIcon, targetIcon, progress);
  const scaleX = box.width / target.width;
  const scaleY = box.height / target.height;
  return {
    button: { x: box.left - target.left, y: box.top - target.top, scaleX, scaleY },
    icon: {
      x: (icon.left - box.left) / scaleX - (targetIcon.left - target.left),
      y: (icon.top - box.top) / scaleY - (targetIcon.top - target.top),
      scaleX: icon.width / targetIcon.width / scaleX,
      scaleY: icon.height / targetIcon.height / scaleY,
    },
  };
}

export function transform({ x, y, scaleX, scaleY }: { x: number; y: number; scaleX: number; scaleY: number }) {
  return `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`;
}
