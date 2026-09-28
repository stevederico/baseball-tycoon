/** Inline SVG icons (24×24, currentColor) so the UI needs no icon font or downloads. */
const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

export const ICONS = {
  pause: svg('<path d="M8 5v14M16 5v14"/>'),
  play: svg('<path d="M7 4l13 8-13 8z" fill="currentColor"/>'),
  fast: svg('<path d="M3 5l8 7-8 7zM13 5l8 7-8 7z" fill="currentColor"/>'),
  faster: svg('<path d="M2 6l6 6-6 6zM9 6l6 6-6 6zM16 6l6 6-6 6z" fill="currentColor" stroke-width="1.4"/>'),
  soundOn: svg('<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/>'),
  soundOff: svg('<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  bell: svg('<path d="M6 17V11a6 6 0 0112 0v6l2 2H4zM10 21h4"/>'),
  menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  target: svg('<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  undo: svg('<path d="M9 7L4 12l5 5M4 12h10a6 6 0 010 12"/>'),
  hammer: svg('<path d="M14 4l6 6-3 3-6-6zM12.5 8.5L4 17l3 3 8.5-8.5"/>'),
  bulldoze: svg('<path d="M3 17h13v-5H9V7H5v5H3zM16 17l5 1M6 20a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM13 20a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>'),
  sunny: svg('<circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'),
  cloudy: svg('<path d="M7 18a4 4 0 010-8 5.5 5.5 0 0110.5 1.5A3.5 3.5 0 0117.5 18z" fill="currentColor"/>'),
  hot: svg('<path d="M12 3v11.5a3.5 3.5 0 11-4 0V5a2 2 0 014 0z"/><circle cx="10" cy="17" r="1.5" fill="currentColor"/>'),
  rain: svg('<path d="M7 14a4 4 0 010-8 5.5 5.5 0 0110.5 1.5A3.5 3.5 0 0117.5 14z" fill="currentColor"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>'),
  night: svg('<path d="M19 14.5A8 8 0 019.5 5a7 7 0 109.5 9.5z" fill="currentColor"/>'),
  ball: svg('<circle cx="12" cy="12" r="9"/><path d="M6.5 5.5c2.5 3.5 2.5 9.5 0 13M17.5 5.5c-2.5 3.5-2.5 9.5 0 13"/>'),
} as const

export type IconName = keyof typeof ICONS
