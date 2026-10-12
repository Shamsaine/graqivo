export function BrandMark({ light = false }: { light?: boolean }) {
  return (
    <img
      src={light ? '/brand/mark-white.svg' : '/brand/mark.svg'}
      width={40}
      height={40}
      alt=""
      aria-hidden="true"
      className="brand-mark"
    />
  );
}
export function Brand({ light = false }: { light?: boolean } = {}) {
  return (
    <a
      className={'brand' + (light ? ' brand-light' : '')}
      href="/"
      aria-label="Graqivo home"
    >
      <BrandMark light={light} />
      <span>graqivo</span>
    </a>
  );
}
