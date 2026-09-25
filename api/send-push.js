// Отправляет push-уведомление получателю нового сообщения в чате.
// Вызывается прямо из браузера отправителя сразу после того, как сообщение
// записано в базу — отдельного сервера или Firebase Cloud Functions не нужно.
// Ключи VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY берутся из переменных окружения
// проекта в панели Vercel (Settings -> Environment Variables).
//
// Сайт теперь живёт на своём хостинге (kaluga-doska.ru), а эта функция —
// на Vercel (kaluga-board.vercel.app), поэтому запрос идёт с другого домена.
// Браузер такие запросы блокирует, если сервер явно не разрешит чужой домен
// через CORS-заголовки — это и делает setCors() ниже.

import webpush from "web-push";

const PROJECT_ID = "kaluga-shef";
const API_KEY = "AIzaSyCKTQljn8Zc2gEW3b1FbLr4jM2i8ipQnIQ";

const ALLOWED_ORIGINS = new Set([
  "https://kaluga-doska.ru",
  "https://www.kaluga-doska.ru",
  "https://kaluga-board.vercel.app",
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublic || !vapidPrivate) {
    res.status(200).json({ sent: false, reason: "vapid keys not configured" });
    return;
  }

  try {
    webpush.setVapidDetails("mailto:kaluga-board@example.com", vapidPublic, vapidPrivate);

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { toUserId, title, body: messageBody, url } = body;
    if (!toUserId) {
      res.status(400).json({ error: "toUserId required" });
      return;
    }

    const docUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${toUserId}?key=${API_KEY}`;
    const resp = await fetch(docUrl);
    if (!resp.ok) {
      res.status(200).json({ sent: false, reason: "no user doc" });
      return;
    }
    const data = await resp.json();
    const subField = data.fields?.pushSubscription?.stringValue;
    if (!subField) {
      res.status(200).json({ sent: false, reason: "not subscribed" });
      return;
    }

    let subscription;
    try {
      subscription = JSON.parse(subField);
    } catch (err) {
      res.status(200).json({ sent: false, reason: "bad subscription" });
      return;
    }

    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: title || "Новое сообщение",
        body: messageBody || "",
        url: url || "/",
      })
    );

    res.status(200).json({ sent: true });
  } catch (err) {
    console.error(err);
    // Подписка могла устареть (пользователь снёс разрешение на уведомления) —
    // это не ошибка сайта, поэтому отвечаем 200, просто без доставки.
    res.status(200).json({ sent: false, error: String(err && err.message ? err.message : err) });
  }
}
