// The natural size of a map image, read client-side (the server can't decode
// images). Pins live in normalized [0,1] coords, so this fixes the coordinate
// scale and aspect ratio. SVG is parsed from markup — createImageBitmap can't
// decode it, and an <img> reports a defaulted size, not the real viewBox — so
// a vector map founds a campaign at its own coordinates; raster maps read px.

/** An SVG carries its size in markup — explicit px width/height, else the viewBox. */
function parseSvgSize(text: string): { w: number; h: number } | null {
  const svg = new DOMParser().parseFromString(text, 'image/svg+xml').querySelector('svg');
  if (!svg) return null;
  const wAttr = svg.getAttribute('width') ?? '';
  const hAttr = svg.getAttribute('height') ?? '';
  if (!wAttr.includes('%') && !hAttr.includes('%')) {
    const w = parseFloat(wAttr);
    const h = parseFloat(hAttr);
    if (w > 0 && h > 0) return { w, h };
  }
  const vb = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) return { w: vb[2], h: vb[3] };
  return null;
}

export async function readMapSize(file: File): Promise<{ w: number; h: number }> {
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    const size = parseSvgSize(await file.text());
    if (size) return size;
  }
  try {
    const bmp = await createImageBitmap(file);
    try {
      if (bmp.width > 0 && bmp.height > 0) return { w: bmp.width, h: bmp.height };
    } finally {
      bmp.close();
    }
  } catch {
    // some formats can't be decoded this way — fall through to an <img>
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (img.naturalWidth > 0 && img.naturalHeight > 0) return { w: img.naturalWidth, h: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
  throw new Error('this map’s size could not be read — try a PNG, JPG, or an SVG with a viewBox');
}
