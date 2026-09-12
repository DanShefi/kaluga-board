import { useState, useEffect } from "react";
import { Plus, X, Phone, MapPin, ChevronLeft, ChevronRight, Heart } from "lucide-react";
import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

const CATEGORIES = [
  { id: "transport", label: "Транспорт", pin: "#3E6FA5" },
  { id: "realty", label: "Недвижимость", pin: "#5C8F4E" },
  { id: "jobs", label: "Работа", pin: "#C97B3E" },
  { id: "services", label: "Услуги", pin: "#9B5C8F" },
  { id: "goods", label: "Товары", pin: "#C94F4F" },
];

const catInfo = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[4];

function seededRotation(seed) {
  const n = String(seed)
    .split("")
    .reduce((a, c) => a + c.charCodeAt(0), 0);
  return ((n % 7) - 3) * 0.7;
}

function compressImage(file, maxWidth = 480, quality = 0.62) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image failed"));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const MAX_PHOTOS = 5;
const FAVORITES_KEY = "kaluga-board-favorites";

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [ads, setAds] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [selectedAd, setSelectedAd] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [favorites, setFavorites] = useState(loadFavorites);
  const [form, setForm] = useState({
    title: "",
    category: "goods",
    price: "",
    description: "",
    contact: "",
    photos: [],
  });

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
      // ignore storage errors
    }
  }, [favorites]);

  useEffect(() => {
    const q = query(collection(db, "ads"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setAds(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        console.error(err);
        setError("Не удалось загрузить объявления. Проверь настройки Firebase.");
        setAds([]);
      }
    );
    return () => unsubscribe();
  }, []);

  async function handlePhotos(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const room = MAX_PHOTOS - form.photos.length;
    if (room <= 0) {
      setError(`Можно добавить не больше ${MAX_PHOTOS} фото.`);
      e.target.value = "";
      return;
    }
    const toProcess = files.slice(0, room);
    setPhotoBusy(true);
    try {
      const dataUrls = await Promise.all(toProcess.map((f) => compressImage(f)));
      setForm((f) => ({ ...f, photos: [...f.photos, ...dataUrls] }));
    } catch (err) {
      setError("Не получилось обработать фото. Попробуй другое.");
    } finally {
      setPhotoBusy(false);
      e.target.value = "";
    }
  }

  function removePhotoAt(index) {
    setForm((f) => ({ ...f, photos: f.photos.filter((_, i) => i !== index) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.contact.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "ads"), {
        title: form.title.trim(),
        category: form.category,
        price: form.price.trim(),
        description: form.description.trim(),
        contact: form.contact.trim(),
        photos: form.photos || [],
        createdAt: Date.now(),
      });
      setForm({ title: "", category: "goods", price: "", description: "", contact: "", photos: [] });
      setShowForm(false);
    } catch (err) {
      console.error(err);
      setError("Не удалось опубликовать объявление. Проверь настройки Firebase.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteDoc(doc(db, "ads", id));
      setSelectedAd(null);
    } catch (err) {
      setError("Не удалось удалить объявление.");
    }
  }

  function openAd(ad) {
    setSelectedAd(ad);
    setLightboxIndex(0);
  }

  function showPrevPhoto(photosLength) {
    setLightboxIndex((i) => (i - 1 + photosLength) % photosLength);
  }

  function showNextPhoto(photosLength) {
    setLightboxIndex((i) => (i + 1) % photosLength);
  }

  function toggleFavorite(id) {
    setFavorites((favs) => (favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id]));
  }

  const visible = (ads || []).filter((a) => {
    if (filter === "favorites") return favorites.includes(a.id);
    return filter === "all" || a.category === filter;
  });

  return (
    <div style={s.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=PT+Sans:wght@400;700&display=swap');
        * { box-sizing: border-box; }
        .kb-chip { transition: transform .15s ease, box-shadow .15s ease; }
        .kb-chip:active { transform: scale(0.96); }
        .kb-card { transition: transform .18s ease, box-shadow .18s ease; cursor: pointer; }
        .kb-card:hover { transform: rotate(0deg) translateY(-3px) !important; box-shadow: 0 10px 20px rgba(30,20,10,0.35); }
        .kb-fab { transition: transform .15s ease; }
        .kb-fab:active { transform: scale(0.92); }
        .kb-input:focus, .kb-select:focus, .kb-textarea:focus { outline: 2px solid #C97B3E; outline-offset: 1px; }
        .kb-thumb { transition: transform .12s ease, opacity .12s ease; cursor: pointer; }
        .kb-thumb:hover { opacity: 0.85; }
      `}</style>

      <header style={s.header}>
        <div style={s.headerInner}>
          <h1 style={s.title}>Калуга · доска объявлений</h1>
          <p style={s.subtitle}>Место для локальных объявлений — от соседей соседям</p>
        </div>
      </header>

      <div style={s.chipsRow}>
        <button className="kb-chip" style={{ ...s.chip, ...(filter === "all" ? s.chipActive : {}) }} onClick={() => setFilter("all")}>
          Все
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className="kb-chip"
            style={{ ...s.chip, ...(filter === c.id ? { ...s.chipActive, borderColor: c.pin } : {}) }}
            onClick={() => setFilter(c.id)}
          >
            {c.label}
          </button>
        ))}
        <button
          className="kb-chip"
          style={{ ...s.chip, ...(filter === "favorites" ? s.chipActive : {}) }}
          onClick={() => setFilter("favorites")}
        >
          ♥ Избранное
        </button>
      </div>

      <main style={s.board}>
        {ads === null && <p style={s.hint}>Открываем доску…</p>}

        {ads !== null && visible.length === 0 && (
          <div style={s.empty}>
            <p style={s.emptyText}>
              {filter === "all" && "Пока здесь пусто. Стань первым, кто повесит объявление."}
              {filter === "favorites" && "Пока нет избранных объявлений. Нажми на сердечко на карточке, чтобы сохранить."}
              {filter !== "all" && filter !== "favorites" && "В этой категории пока ничего нет."}
            </p>
          </div>
        )}

        <div style={s.grid}>
          {visible.map((ad) => {
            const cat = catInfo(ad.category);
            const photos = ad.photos && ad.photos.length ? ad.photos : (ad.photo ? [ad.photo] : []);
            return (
              <div
                key={ad.id}
                className="kb-card"
                style={{ ...s.card, transform: `rotate(${seededRotation(ad.id)}deg)` }}
                onClick={() => openAd(ad)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") openAd(ad); }}
              >
                <div style={{ ...s.pin, background: cat.pin }} />
                <button
                  style={s.favoriteBtn}
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(ad.id); }}
                  aria-label="В избранное"
                >
                  <Heart
                    size={16}
                    color={favorites.includes(ad.id) ? "#C94F4F" : "#8a7a63"}
                    fill={favorites.includes(ad.id) ? "#C94F4F" : "none"}
                  />
                </button>
                <button
                  style={s.deleteBtn}
                  onClick={(e) => { e.stopPropagation(); handleDelete(ad.id); }}
                  aria-label="Удалить объявление"
                >
                  <X size={14} color="#8a7a63" />
                </button>
                {photos[0] && (
                  <div style={s.cardPhotoWrap}>
                    <img src={photos[0]} alt={ad.title} style={s.cardPhoto} />
                    {photos.length > 1 && <span style={s.photoCountBadge}>+{photos.length - 1}</span>}
                  </div>
                )}
                <span style={{ ...s.catTag, color: cat.pin }}>{cat.label}</span>
                <h3 style={s.cardTitle}>{ad.title}</h3>
                {ad.price && <p style={s.price}>{ad.price} ₽</p>}
                {ad.description && <p style={s.desc}>{ad.description}</p>}
                <div style={s.cardFooter}>
                  <span style={s.contact}>
                    <Phone size={12} style={{ marginRight: 4, verticalAlign: "-2px" }} />
                    {ad.contact}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <button className="kb-fab" style={s.fab} onClick={() => setShowForm(true)} aria-label="Разместить объявление">
        <Plus size={26} color="#FBF3E1" />
      </button>

      {error && <div style={s.errorToast} onClick={() => setError(null)}>{error}</div>}

      {selectedAd && (() => {
        const cat = catInfo(selectedAd.category);
        const photos = selectedAd.photos && selectedAd.photos.length
          ? selectedAd.photos
          : (selectedAd.photo ? [selectedAd.photo] : []);
        return (
          <div style={s.overlayCenter} onClick={() => setSelectedAd(null)}>
            <div style={s.detailCard} onClick={(e) => e.stopPropagation()}>
              <div style={s.formHeader}>
                <span style={{ ...s.catTag, color: cat.pin }}>{cat.label}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button
                    type="button"
                    style={s.favoriteBtnDetail}
                    onClick={() => toggleFavorite(selectedAd.id)}
                    aria-label="В избранное"
                  >
                    <Heart
                      size={20}
                      color={favorites.includes(selectedAd.id) ? "#C94F4F" : "#8a7a63"}
                      fill={favorites.includes(selectedAd.id) ? "#C94F4F" : "none"}
                    />
                  </button>
                  <button type="button" style={s.closeBtn} onClick={() => setSelectedAd(null)} aria-label="Закрыть">
                    <X size={20} color="#5A4029" />
                  </button>
                </div>
              </div>

              {photos.length > 0 && (
                <div>
                  <div style={s.detailPhotoWrap}>
                    <img src={photos[lightboxIndex]} alt={selectedAd.title} style={s.detailMainPhoto} />
                    {photos.length > 1 && (
                      <>
                        <button
                          type="button"
                          style={{ ...s.photoNavBtn, left: 8 }}
                          onClick={() => showPrevPhoto(photos.length)}
                          aria-label="Предыдущее фото"
                        >
                          <ChevronLeft size={22} color="#FBF3E1" />
                        </button>
                        <button
                          type="button"
                          style={{ ...s.photoNavBtn, right: 8 }}
                          onClick={() => showNextPhoto(photos.length)}
                          aria-label="Следующее фото"
                        >
                          <ChevronRight size={22} color="#FBF3E1" />
                        </button>
                        <span style={s.photoCounter}>{lightboxIndex + 1} / {photos.length}</span>
                      </>
                    )}
                  </div>
                  {photos.length > 1 && (
                    <div style={s.thumbRow}>
                      {photos.map((p, i) => (
                        <img
                          key={i}
                          src={p}
                          alt={`фото ${i + 1}`}
                          className="kb-thumb"
                          style={{ ...s.thumb, border: i === lightboxIndex ? "2px solid #C97B3E" : "2px solid transparent" }}
                          onClick={() => setLightboxIndex(i)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              <h2 style={s.detailTitle}>{selectedAd.title}</h2>
              {selectedAd.price && <p style={s.detailPrice}>{selectedAd.price} ₽</p>}
              {selectedAd.description && <p style={s.detailDesc}>{selectedAd.description}</p>}

              <div style={s.detailContactRow}>
                <Phone size={14} style={{ marginRight: 6 }} />
                <span>{selectedAd.contact}</span>
              </div>

              <button
                type="button"
                style={s.deleteFullBtn}
                onClick={() => handleDelete(selectedAd.id)}
              >
                Удалить объявление
              </button>
            </div>
          </div>
        );
      })()}

      {showForm && (
        <div style={s.overlay} onClick={() => setShowForm(false)}>
          <form style={s.formCard} onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <div style={s.formHeader}>
              <h2 style={s.formTitle}>Новое объявление</h2>
              <button type="button" style={s.closeBtn} onClick={() => setShowForm(false)} aria-label="Закрыть">
                <X size={18} color="#5A4029" />
              </button>
            </div>

            <label style={s.label}>Заголовок</label>
            <input className="kb-input" style={s.input} value={form.title} maxLength={80} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Например: Продам велосипед" required />

            <label style={s.label}>Категория</label>
            <select className="kb-select" style={s.input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>

            <label style={s.label}>Фото (до {MAX_PHOTOS} штук, необязательно)</label>
            <input
              className="kb-input"
              style={s.fileInput}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotos}
              disabled={form.photos.length >= MAX_PHOTOS}
            />
            {photoBusy && <p style={s.photoStatus}>Обрабатываем фото…</p>}
            {form.photos.length > 0 && !photoBusy && (
              <div style={s.photoGrid}>
                {form.photos.map((p, i) => (
                  <div key={i} style={s.photoPreviewWrap}>
                    <img src={p} alt={`превью ${i + 1}`} style={s.photoPreview} />
                    <button type="button" style={s.removePhotoBtn} onClick={() => removePhotoAt(i)}>
                      Убрать
                    </button>
                  </div>
                ))}
              </div>
            )}

            <label style={s.label}>Цена (необязательно)</label>
            <input className="kb-input" style={s.input} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^0-9]/g, "") })} placeholder="3000" inputMode="numeric" />

            <label style={s.label}>Описание</label>
            <textarea className="kb-textarea" style={{ ...s.input, height: 72, resize: "none" }} value={form.description} maxLength={280} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Пара слов о том, что предлагаешь" />

            <label style={s.label}>Контакт</label>
            <input className="kb-input" style={s.input} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Телефон или Telegram" required />

            <button type="submit" style={s.submitBtn} disabled={saving}>
              {saving ? "Публикуем…" : "Разместить объявление"}
            </button>
            <p style={s.formNote}>
              <MapPin size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
              Видно всем, кто открывает сайт
            </p>
          </form>
        </div>
      )}
    </div>
  );
}

const s = {
  page: {
    minHeight: "100vh",
    background: "#5E4530",
    backgroundImage:
      "radial-gradient(circle at 20% 30%, rgba(0,0,0,0.12) 0, transparent 40%), radial-gradient(circle at 80% 70%, rgba(0,0,0,0.12) 0, transparent 40%), radial-gradient(circle at 50% 90%, rgba(0,0,0,0.08) 0, transparent 35%)",
    fontFamily: "'PT Sans', sans-serif",
    paddingBottom: 100,
    position: "relative",
  },
  header: { padding: "28px 20px 18px", textAlign: "center" },
  headerInner: { maxWidth: 640, margin: "0 auto" },
  title: { fontFamily: "'Caveat', cursive", fontSize: 40, color: "#FBF3E1", margin: 0, fontWeight: 700, lineHeight: 1.1 },
  subtitle: { color: "#D9C9AE", fontSize: 13.5, margin: "6px 0 0" },
  chipsRow: { display: "flex", gap: 8, overflowX: "auto", padding: "4px 16px 14px", maxWidth: 640, margin: "0 auto" },
  chip: { flexShrink: 0, padding: "7px 14px", borderRadius: 999, border: "1.5px solid rgba(251,243,225,0.35)", background: "rgba(0,0,0,0.15)", color: "#F0E6D2", fontSize: 13.5, fontFamily: "'PT Sans', sans-serif", cursor: "pointer" },
  chipActive: { background: "#FBF3E1", color: "#3A2A18", borderColor: "#FBF3E1", fontWeight: 700 },
  board: { maxWidth: 640, margin: "0 auto", padding: "0 16px" },
  hint: { color: "#D9C9AE", textAlign: "center", marginTop: 40, fontSize: 14 },
  empty: { textAlign: "center", padding: "40px 20px", background: "rgba(0,0,0,0.15)", borderRadius: 12, marginTop: 12 },
  emptyText: { color: "#E8DBC2", fontSize: 14.5, margin: 0 },
  grid: { display: "grid", gridTemplateColumns: "1fr", gap: 20, marginTop: 8 },
  card: { position: "relative", background: "#FBF3E1", borderRadius: 4, padding: "22px 16px 14px", boxShadow: "0 6px 14px rgba(20,12,4,0.3)" },
  pin: { position: "absolute", top: -7, left: "50%", transform: "translateX(-50%)", width: 14, height: 14, borderRadius: "50%", boxShadow: "0 2px 3px rgba(0,0,0,0.4)" },
  deleteBtn: { position: "absolute", top: 8, right: 8, background: "transparent", border: "none", cursor: "pointer", padding: 4, zIndex: 2 },
  favoriteBtn: { position: "absolute", top: 8, left: 8, background: "transparent", border: "none", cursor: "pointer", padding: 4, zIndex: 2 },
  favoriteBtnDetail: { background: "transparent", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" },
  catTag: { fontSize: 11.5, fontWeight: 700, textTransform: "none", letterSpacing: 0.2 },
  cardPhotoWrap: { position: "relative", marginBottom: 8 },
  cardPhoto: { width: "100%", height: 160, objectFit: "cover", borderRadius: 3, display: "block" },
  photoCountBadge: { position: "absolute", bottom: 6, right: 6, background: "rgba(0,0,0,0.65)", color: "#FBF3E1", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 999 },
  fileInput: { width: "100%", fontSize: 13, color: "#5A4A38", padding: "6px 0" },
  photoStatus: { fontSize: 12, color: "#8a7a63", margin: "4px 0 0" },
  photoGrid: { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 },
  photoPreviewWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 5 },
  photoPreview: { width: 64, height: 64, objectFit: "cover", borderRadius: 6, border: "1px solid #D9C9AE" },
  removePhotoBtn: { background: "transparent", border: "1px solid #D9C9AE", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#6B5A45", cursor: "pointer" },
  cardTitle: { fontSize: 19, color: "#2E2013", margin: "4px 0 2px", fontWeight: 700, lineHeight: 1.25 },
  price: { fontSize: 16, color: "#3A2A18", fontWeight: 700, margin: "2px 0 6px" },
  desc: { fontSize: 13.5, color: "#5A4A38", lineHeight: 1.4, margin: "0 0 10px" },
  cardFooter: { borderTop: "1px dashed #C9B896", paddingTop: 8, marginTop: 4 },
  contact: { fontSize: 12.5, color: "#6B5A45" },
  fab: { position: "fixed", right: 20, bottom: 24, width: 56, height: 56, borderRadius: "50%", background: "#C97B3E", border: "none", boxShadow: "0 6px 16px rgba(0,0,0,0.4)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  errorToast: { position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: "#3A2A18", color: "#FBF3E1", padding: "8px 16px", borderRadius: 8, fontSize: 13, maxWidth: "90%", textAlign: "center", cursor: "pointer" },
  overlay: { position: "fixed", inset: 0, background: "rgba(20,12,4,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 10 },
  overlayCenter: { position: "fixed", inset: 0, background: "rgba(20,12,4,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, padding: 16 },
  formCard: { background: "#FBF3E1", width: "100%", maxWidth: 480, borderRadius: "16px 16px 0 0", padding: "18px 20px 24px", maxHeight: "88vh", overflowY: "auto" },
  detailCard: { background: "#FBF3E1", width: "100%", maxWidth: 480, borderRadius: 16, padding: "18px 20px 26px", maxHeight: "90vh", overflowY: "auto" },
  detailPhotoWrap: { position: "relative" },
  detailMainPhoto: { width: "100%", height: 240, objectFit: "cover", borderRadius: 8, display: "block" },
  photoNavBtn: { position: "absolute", top: "50%", transform: "translateY(-50%)", background: "rgba(20,12,4,0.5)", border: "none", borderRadius: "50%", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  photoCounter: { position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.6)", color: "#FBF3E1", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999 },
  thumbRow: { display: "flex", gap: 8, marginTop: 8, overflowX: "auto" },
  thumb: { width: 52, height: 52, objectFit: "cover", borderRadius: 6, flexShrink: 0 },
  detailTitle: { fontFamily: "'Caveat', cursive", fontSize: 28, color: "#2E2013", margin: "14px 0 2px", fontWeight: 700 },
  detailPrice: { fontSize: 19, color: "#3A2A18", fontWeight: 700, margin: "2px 0 10px" },
  detailDesc: { fontSize: 14.5, color: "#5A4A38", lineHeight: 1.5, margin: "0 0 14px", whiteSpace: "pre-wrap" },
  detailContactRow: { display: "flex", alignItems: "center", fontSize: 14, color: "#3A2A18", fontWeight: 700, borderTop: "1px dashed #C9B896", paddingTop: 12, marginBottom: 16 },
  deleteFullBtn: { width: "100%", padding: "11px", borderRadius: 10, border: "1.5px solid #C94F4F", background: "transparent", color: "#C94F4F", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  formHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  formTitle: { fontFamily: "'Caveat', cursive", fontSize: 26, color: "#3A2A18", margin: 0, fontWeight: 700 },
  closeBtn: { background: "transparent", border: "none", cursor: "pointer", padding: 4 },
  label: { display: "block", fontSize: 12.5, color: "#6B5A45", margin: "12px 0 4px", fontWeight: 700 },
  input: { width: "100%", padding: "9px 11px", borderRadius: 8, border: "1.5px solid #D9C9AE", background: "#fff", fontSize: 14.5, fontFamily: "'PT Sans', sans-serif", color: "#2E2013" },
  submitBtn: { width: "100%", marginTop: 18, padding: "12px", borderRadius: 10, border: "none", background: "#C97B3E", color: "#FBF3E1", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  formNote: { textAlign: "center", fontSize: 11.5, color: "#8a7a63", marginTop: 10 },
};
