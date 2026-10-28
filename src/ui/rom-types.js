// The file types a ROM input offers. iOS and iPadOS turn an input's list of extensions into the file types they
// know, and they know no ROM's (.gba, .nds), so their Files picker greys out every ROM; there the inputs take any
// file, and its header says which game it is, as it does everywhere.

// iOS, and iPadOS, which says it is a Mac but has a touch screen
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** Makes `input` offer the files of `types` (such as '.gba,.agb,.bin'), or any file on iOS and iPadOS. */
export function acceptRoms(input, types) {
  if (IOS) input.removeAttribute('accept');
  else input.accept = types;
}
