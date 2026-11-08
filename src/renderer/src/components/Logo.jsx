export default function Logo({ className = 'h-5 w-5', theme = 'dark' }) {
  return (
    <span className={`inline-flex items-center justify-center ${className}`}>
      <img
        src={`${import.meta.env.BASE_URL}logos/forge-mark.svg`}
        alt="Forge AI"
        className={`h-full w-full object-contain ${theme === 'light' ? 'invert' : ''}`}
        draggable="false"
        style={{ background: 'transparent' }}
      />
    </span>
  );
}
