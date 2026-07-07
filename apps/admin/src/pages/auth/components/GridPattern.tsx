export function GridPattern() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.035]"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#1B2A5E" strokeWidth="0.8" />
        </pattern>
        <pattern id="dots" width="32" height="32" patternUnits="userSpaceOnUse">
          <circle cx="16" cy="16" r="1" fill="#1B2A5E" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
      <rect width="100%" height="100%" fill="url(#dots)" />
    </svg>
  );
}
