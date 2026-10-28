// The file types a ROM input offers. iOS and iPadOS turn an input's list of extensions into the file types they
// know, and they know no ROM's (.gba, .nds), so their Files picker greys out every ROM. There the inputs take any
// file of data instead, application/octet-stream: being neither a picture nor a video, it opens Files straight
// away, with no photo library or camera to choose from, and a file's header says which game it is, as everywhere.

// iOS, and iPadOS, which says it is a Mac but has a touch screen
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** Makes `input` offer the files of `types` (such as '.gba,.agb,.bin'), or any file of data on iOS and iPadOS. */
export function acceptRoms(input, types) {
  input.accept = IOS ? 'application/octet-stream' : types;
}
