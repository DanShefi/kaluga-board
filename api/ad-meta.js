// Отдаёт мини-страницу с og:title/og:image/og:description для конкретного
// объявления — специально для ботов-мессенджеров (WhatsApp, Telegram и т.п.),
// которые не умеют выполнять JS и поэтому не видят обычную SPA-страницу.
// Обычные посетители сюда не попадают: vercel.json направляет на этот файл
// только запросы с "ботовским" User-Agent, см. rewrites -> has -> user-agent.

const SITE_URL = "https://kaluga-board.vercel.app";
const PROJECT_ID = "kaluga-shef";
const API_KEY = "AIzaSyCKTQljn8Zc2gEW3b1FbLr4jM2i8ipQnIQ";

function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml({ title, description, image, url }) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta property="og:type" content="product" />
<meta property="og:site_name" content="Калуга · доска объявлений" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
${image ? `<meta property="og:image" content="${esc(image)}" />\n<meta property="og:image:secure_url" content="${esc(image)}" />` : ""}
<meta property="og:url" content="${esc(url)}" />
<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
${image ? `<meta name="twitter:image" content="${esc(image)}" />` : ""}
<meta http-equiv="refresh" content="0; url=${esc(url)}" />
</head>
<body>
<p><a href="${esc(url)}">${esc(title)}</a></p>
</body>
</html>`;
}

function fallbackHtml() {
  return renderHtml({
    title: "Калуга · доска объявлений",
    description: "Место для локальных объявлений — от соседей соседям",
    image: "",
    url: `${SITE_URL}/`,
  });
}

export default async function handler(req, res) {
  const id = typeof req.query.id === "string" ? req.query.id : "";
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");

  if (!id) {
    res.status(200).send(fallbackHtml());
    return;
  }

  try {
    const docUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/ads/${id}?key=${API_KEY}`;
    const resp = await fetch(docUrl);
    if (!resp.ok) {
      res.status(200).send(fallbackHtml());
      return;
    }
    const data = await resp.json();
    const fields = data.fields || {};
    const title = fields.title?.stringValue || "Объявление";
    const price = fields.price?.stringValue || "";
    const description = fields.description?.stringValue || "Смотри объявление на доске объявлений Калуги";
    const photosArr = (fields.photos?.arrayValue?.values || [])
      .map((v) => v.stringValue)
      .filter(Boolean);
    const photo = photosArr[0] || fields.photo?.stringValue || "";
    const fullTitle = price ? `${title} — ${price} ₽` : title;
    const pageUrl = `${SITE_URL}/ad/${id}`;

    res.status(200).send(
      renderHtml({
        title: fullTitle,
        description,
        image: photo,
        url: pageUrl,
      })
    );
  } catch (err) {
    res.status(200).send(fallbackHtml());
  }
}
