/**
 * Brand logo — the Intuitive shield mark.
 *
 * The supplied artwork is a black shield with a fine silver rim, i.e. it was drawn
 * for a LIGHT surface. Placed bare on the panel canvas (#05070d, with a blue ambient
 * glow behind it) the interior sits at almost the same luminance as the background and
 * the mark reads as a murky blob. It therefore gets a brushed-silver plate to sit on —
 * which also echoes the logo's own rim and keeps the black silhouette crisp at 40px.
 *
 * Sizing note: the source is 595x663 (aspect 0.897), so the rendered width is derived
 * from the height. The wordmark inside the artwork is not legible below ~120px; the
 * adjacent "INTUITIVE / Gamepanel" text carries the name, the shield carries the mark.
 */
const sizes = {
  sm: { box: "h-10 w-10 rounded-[12px]", img: "h-[78%]" },
  md: { box: "h-11 w-11 rounded-[14px]", img: "h-[80%]" },
  lg: { box: "h-12 w-12 rounded-[15px]", img: "h-[80%]" },
} as const;

export function BrandLogo({
  size = "md",
  className = "",
}: {
  size?: keyof typeof sizes;
  /** Layout hooks only (e.g. `lg:hidden` to show the mark on small screens only). */
  className?: string;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden border border-white/25 ${sizes[size].box} ${className}`}
      style={{
        background: "linear-gradient(155deg,#eef1f7 0%,#c9d0de 52%,#9aa5bb 100%)",
        boxShadow:
          "0 14px 30px -14px rgba(0,0,0,.95), 0 0 22px -6px rgba(59,130,246,.45), inset 0 1px 0 rgba(255,255,255,.7)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static asset in /public, no optimizer needed */}
      <img
        src="/intuitive-logo.webp"
        alt="Intuitive"
        width={36}
        height={40}
        draggable={false}
        className={`w-auto select-none ${sizes[size].img}`}
      />
    </span>
  );
}
