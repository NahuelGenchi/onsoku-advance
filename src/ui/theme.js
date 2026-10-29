// The dreamports.net launcher's look, which the page's own screens follow: the one picked in the launcher's
// settings, kept by dreamports.net in this browser as 'light' or 'dark', or none, when it follows the device.

const THEME_KEY = 'dreamports:theme';
export const darkDevice = matchMedia('(prefers-color-scheme: dark)');

/** The look picked in the launcher, 'light' or 'dark', or null when it follows the device. */
export function pickedTheme() {
  let theme = null;
  try { theme = localStorage.getItem(THEME_KEY); } catch { /* storage blocked: the device's look */ }
  return theme === 'light' || theme === 'dark' ? theme : null;
}

/** Whether the look is dark now: picked dark, or following a dark device. */
export const isDark = () => (pickedTheme() ?? (darkDevice.matches ? 'dark' : 'light')) === 'dark';
