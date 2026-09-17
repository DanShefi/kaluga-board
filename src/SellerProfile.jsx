import { useEffect, useState } from "react";
import { X, Star, UserRound, Trash2 } from "lucide-react";
import { db } from "./firebase.js";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

const REVIEW_TEXT_MAX = 300;
const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;

export function formatLastSeen(ts) {
  if (!ts) return null;
  const diffMs = Date.now() - ts;
  if (diffMs < ONLINE_THRESHOLD_MS) return { online: true, text: "в сети" };
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return { online: false, text: `был(а) в сети ${minutes} мин назад` };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { online: false, text: `был(а) в сети ${hours} ч назад` };
  const days = Math.floor(hours / 24);
  return { online: false, text: `был(а) в сети ${days} дн назад` };
}

export function Stars({ value, size = 15, onPick, interactive = false }) {
  const [hover, setHover] = useState(0);
  const shown = interactive ? hover || value : value;
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          onMouseEnter={() => interactive && setHover(n)}
          onMouseLeave={() => interactive && setHover(0)}
          onClick={() => interactive && onPick && onPick(n)}
          style={{ display: "inline-flex", cursor: interactive ? "pointer" : "default" }}
        >
          <Star
            size={size}
            color={n <= Math.round(shown) ? "#C97B3E" : "#D9C9AE"}
            fill={n <= Math.round(shown) ? "#C97B3E" : "none"}
          />
        </span>
      ))}
    </span>
  );
}

function formatDate(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "";
  }
}

export default function SellerProfile({ sellerId, sellerName, currentUser, currentUserName, conversations, onClose }) {
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState("");
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSeen, setLastSeen] = useState(null);

  const isSelf = !!currentUser && currentUser.uid === sellerId;
  const myReview = reviews && currentUser ? reviews.find((r) => r.authorId === currentUser.uid) : null;
  const hasChatted = !!currentUser && (conversations || []).some((c) => c.sellerId === sellerId && c.buyerId === currentUser.uid);

  useEffect(() => {
    const q = query(collection(db, "reviews"), where("sellerId", "==", sellerId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setReviews(list);
      },
      (err) => {
        console.error(err);
        setError("Не удалось загрузить отзывы.");
        setReviews([]);
      }
    );
    return () => unsubscribe();
  }, [sellerId]);

  useEffect(() => {
    let cancelled = false;
    setLastSeen(null);
    getDoc(doc(db, "users", sellerId))
      .then((snap) => {
        if (cancelled) return;
        setLastSeen(snap.exists() ? snap.data().lastSeen || null : null);
      })
      .catch(() => {
        if (!cancelled) setLastSeen(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  useEffect(() => {
    if (myReview) {
      setRating(myReview.rating || 0);
      setText(myReview.text || "");
    }
  }, [myReview?.id]);

  const avg = reviews && reviews.length ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length : 0;
  const count = reviews ? reviews.length : 0;

  async function submitReview(e) {
    e.preventDefault();
    if (!currentUser || rating < 1) return;
    setSaving(true);
    setError("");
    try {
      await setDoc(doc(db, "reviews", `${sellerId}__${currentUser.uid}`), {
        sellerId,
        sellerName: sellerName || "",
        authorId: currentUser.uid,
        authorName: currentUserName || "Гость",
        rating,
        text: text.trim().slice(0, REVIEW_TEXT_MAX),
        createdAt: myReview ? myReview.createdAt : Date.now(),
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.error(err);
      setError("Не удалось сохранить отзыв. Проверь настройки Firebase.");
    } finally {
      setSaving(false);
    }
  }

  async function removeMyReview() {
    if (!myReview) return;
    const confirmed = window.confirm("Удалить свой отзыв?");
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, "reviews", myReview.id));
      setRating(0);
      setText("");
    } catch (err) {
      console.error(err);
      setError("Не удалось удалить отзыв.");
    }
  }

  return (
    <div style={st.overlay} onClick={onClose}>
      <div style={st.card} onClick={(e) => e.stopPropagation()}>
        <div style={st.header}>
          <h2 style={st.title}>{sellerName || "Продавец"}</h2>
          <button type="button" style={st.closeBtn} onClick={onClose} aria-label="Закрыть">
            <X size={18} color="#5A4029" />
          </button>
        </div>

        {formatLastSeen(lastSeen) && (
          <div style={st.onlineRow}>
            <span style={{ ...st.onlineDot, background: formatLastSeen(lastSeen).online ? "#5C8F4E" : "#B8A888" }} />
            <span style={st.onlineText}>{formatLastSeen(lastSeen).text}</span>
          </div>
        )}

        <div style={st.summaryRow}>
          <Stars value={avg} size={17} />
          <span style={st.summaryText}>
            {count > 0 ? `${avg.toFixed(1)} · ${count} ${countWord(count)}` : "Пока нет отзывов"}
          </span>
        </div>

        {error && <p style={st.error}>{error}</p>}

        {isSelf ? (
          <p style={st.hint}>Это ваш профиль продавца — здесь видны отзывы других пользователей о вас.</p>
        ) : !currentUser ? (
          <p style={st.hint}>Войдите, чтобы оставить отзыв о продавце.</p>
        ) : !hasChatted ? (
          <p style={st.hint}>Чтобы оставить отзыв, сначала напишите продавцу — кнопка «Написать продавцу» на объявлении.</p>
        ) : (
          <form style={st.form} onSubmit={submitReview}>
            <label style={st.label}>{myReview ? "Ваша оценка" : "Оценка"}</label>
            <Stars value={rating} size={24} interactive onPick={setRating} />
            <textarea
              style={st.textarea}
              value={text}
              maxLength={REVIEW_TEXT_MAX}
              onChange={(e) => setText(e.target.value)}
              placeholder="Пара слов о сделке (необязательно)"
            />
            <div style={st.formActions}>
              <button type="submit" style={st.submitBtn} disabled={saving || rating < 1}>
                {saving ? "Сохраняем…" : myReview ? "Обновить отзыв" : "Оставить отзыв"}
              </button>
              {myReview && (
                <button type="button" style={st.deleteBtn} onClick={removeMyReview} aria-label="Удалить отзыв">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </form>
        )}

        <div style={st.divider} />

        <div style={st.list}>
          {reviews === null && <p style={st.hint}>Загружаем отзывы…</p>}
          {reviews !== null && reviews.length === 0 && <p style={st.hint}>Отзывов пока нет.</p>}
          {reviews !== null &&
            reviews.map((r) => (
              <div key={r.id} style={st.reviewItem}>
                <div style={st.reviewHead}>
                  <span style={st.reviewAuthor}>
                    <UserRound size={12} style={{ marginRight: 4, verticalAlign: "-2px" }} />
                    {r.authorName}
                  </span>
                  <span style={st.reviewDate}>{formatDate(r.createdAt)}</span>
                </div>
                <Stars value={r.rating} size={13} />
                {r.text && <p style={st.reviewText}>{r.text}</p>}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

export function countWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "отзыв";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "отзыва";
  return "отзывов";
}

const st = {
  overlay: { position: "fixed", inset: 0, background: "rgba(20,12,4,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20, padding: 16 },
  card: { background: "#FBF3E1", width: "100%", maxWidth: 440, borderRadius: 16, padding: "18px 20px 22px", maxHeight: "88vh", overflowY: "auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  title: { fontFamily: "'Caveat', cursive", fontSize: 26, color: "#3A2A18", margin: 0, fontWeight: 700 },
  closeBtn: { background: "transparent", border: "none", cursor: "pointer", padding: 4 },
  summaryRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  summaryText: { fontSize: 13, color: "#6B5A45", fontWeight: 700 },
  onlineRow: { display: "flex", alignItems: "center", gap: 6, marginBottom: 8 },
  onlineDot: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },
  onlineText: { fontSize: 12, color: "#6B5A45" },
  hint: { fontSize: 13, color: "#8a7a63", margin: "8px 0" },
  error: { color: "#C94F4F", fontSize: 12.5, margin: "4px 0" },
  form: { background: "rgba(0,0,0,0.06)", borderRadius: 12, padding: "12px 14px", marginTop: 6 },
  label: { display: "block", fontSize: 12.5, color: "#6B5A45", marginBottom: 6, fontWeight: 700 },
  textarea: { width: "100%", marginTop: 10, padding: "9px 11px", borderRadius: 8, border: "1.5px solid #D9C9AE", background: "#fff", fontSize: 13.5, fontFamily: "'PT Sans', sans-serif", color: "#2E2013", height: 60, resize: "none" },
  formActions: { display: "flex", gap: 8, marginTop: 10 },
  submitBtn: { flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#C97B3E", color: "#FBF3E1", fontSize: 13.5, fontWeight: 700, cursor: "pointer" },
  deleteBtn: { width: 40, borderRadius: 10, border: "1.5px solid #C94F4F", background: "transparent", color: "#C94F4F", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  divider: { height: 1, background: "#D9C9AE", margin: "16px 0 12px" },
  list: { display: "flex", flexDirection: "column", gap: 12 },
  reviewItem: { paddingBottom: 10, borderBottom: "1px dashed #D9C9AE" },
  reviewHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  reviewAuthor: { fontSize: 12.5, fontWeight: 700, color: "#3A2A18" },
  reviewDate: { fontSize: 11.5, color: "#8a7a63" },
  reviewText: { fontSize: 13, color: "#5A4A38", margin: "6px 0 0", lineHeight: 1.4, whiteSpace: "pre-wrap" },
};
