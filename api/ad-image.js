// Отдаёт фото объявления как настоящую картинку по прямой ссылке.
// Фото в базе хранится в виде длинного текстового кода (base64) —
// мессенджеры такой код в og:image не понимают, им нужна именно
// ссылка на файл-картинку. Этот файл достаёт код и отдаёт его как
// обычный JPEG/PNG, чтобы у превью-ссылки появилась картинка.

const PROJECT_ID = "kaluga-shef";
const API_KEY = "AIzaSyCKTQljn8Zc2gEW3b1FbLr4jM2i8ipQnIQ";

export default async function handler(req, res) {
  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) {
    res.status(404).send("Not found");
    return;
  }

  try {
    const docUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/ads/${id}?key=${API_KEY}`;
    const resp = await fetch(docUrl);
    if (!resp.ok) {
      res.status(404).send("Not found");
      return;
    }
    const data = await resp.json();
    const fields = data.fields || {};
    const photosArr = (fields.photos?.arrayValue?.values || [])
      .map((v) => v.stringValue)
      .filter(Boolean);
    const photo = photosArr[0] || fields.photo?.stringValue || "";

    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(photo);
    if (!match) {
      res.status(404).send("Not found");
      return;
    }
    const contentType = match[1];
    const buffer = Buffer.from(match[2], "base64");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    res.status(200).send(buffer);
  } catch (err) {
    res.status(404).send("Not found");
  }
}
