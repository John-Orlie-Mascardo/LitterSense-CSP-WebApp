export function cropImageToSquare(
  source: string,
  zoom = 1,
  offset = { x: 0, y: 0 },
  outputSize = 512,
  previewSize = 128,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;

      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Unable to prepare image crop"));
        return;
      }

      const safeZoom = Math.max(1, zoom);
      const renderedScale =
        Math.max(
          previewSize / image.naturalWidth,
          previewSize / image.naturalHeight,
        ) * safeZoom;
      const cropSize = previewSize / renderedScale;
      const centerX = image.naturalWidth / 2 - offset.x / renderedScale;
      const centerY = image.naturalHeight / 2 - offset.y / renderedScale;
      const sourceX = Math.min(
        image.naturalWidth - cropSize,
        Math.max(0, centerX - cropSize / 2),
      );
      const sourceY = Math.min(
        image.naturalHeight - cropSize,
        Math.max(0, centerY - cropSize / 2),
      );

      context.drawImage(
        image,
        sourceX,
        sourceY,
        cropSize,
        cropSize,
        0,
        0,
        outputSize,
        outputSize,
      );

      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    image.onerror = () => reject(new Error("Unable to load image"));
    image.src = source;
  });
}
