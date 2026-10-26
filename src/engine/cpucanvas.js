// Every 2D canvas the game makes keeps its pixels in memory, not on the GPU (willReadFrequently). The renderer
// reads the screen back for the effects it works out pixel by pixel (the fades, the Rush boost's trail, and more
// in later zones). The browser answers a GPU canvas read back that often by moving it to memory, and from then on
// every tile and sprite drawn onto it from a canvas still on the GPU is read back from the GPU on its own: a frame
// takes far longer than a 60th of a second. With every canvas in memory nothing is read back from the GPU, and the
// pixels are the same. Imported before anything else makes a canvas.

const getContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, options) {
  return getContext.call(this, type, type === '2d' ? { willReadFrequently: true, ...options } : options);
};
