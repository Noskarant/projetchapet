/** Convertit un logo en image de taille maîtrisée pour la sauvegarde cloud et les PDF. */
export async function prepareCompanyLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) throw new Error("Utilisez un logo PNG, JPEG ou WebP.");
  if (file.size > 10_000_000) throw new Error("Le logo dépasse 10 Mo.");
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du logo impossible."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onerror = () => reject(new Error("Image du logo incompatible."));
    element.onload = () => resolve(element);
    element.src = source;
  });
  if (!image.naturalWidth || !image.naturalHeight) throw new Error("Image du logo vide.");
  const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Impossible de préparer le logo.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (file.type === "image/png") {
    const png = canvas.toDataURL("image/png");
    if (png.length <= 790_000) return png;
  }
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const quality of [0.9, 0.8, 0.65]) {
    const jpeg = canvas.toDataURL("image/jpeg", quality);
    if (jpeg.length <= 790_000) return jpeg;
  }
  throw new Error("Le logo reste trop volumineux après optimisation.");
}
