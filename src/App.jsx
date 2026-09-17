import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, X, Phone, MapPin, ChevronLeft, ChevronRight, Heart, Car, Home, Briefcase, Wrench, ShoppingBag, LayoutGrid, LogOut, UserRound, SlidersHorizontal, MessageCircle, Send, Star, Eye, Share2, Check, Flag } from "lucide-react";
import { db, auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  getDocs,
  increment,
} from "firebase/firestore";
import AuthModal from "./AuthModal.jsx";
import SellerProfile, { Stars, countWord, formatLastSeen } from "./SellerProfile.jsx";

const CATEGORIES = [
  { id: "transport", label: "Транспорт", pin: "#3E6FA5", icon: Car },
  { id: "realty", label: "Недвижимость", pin: "#5C8F4E", icon: Home },
  { id: "jobs", label: "Работа", pin: "#C97B3E", icon: Briefcase },
  { id: "services", label: "Услуги", pin: "#9B5C8F", icon: Wrench },
  { id: "goods", label: "Товары", pin: "#C94F4F", icon: ShoppingBag },
];

const catInfo = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[4];

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const bigint = parseInt(h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function seededRotation(seed) {
  const n = String(seed)
    .split("")
    .reduce((a, c) => a + c.charCodeAt(0), 0);
  return ((n % 7) - 3) * 0.7;
}

function displayNameFor(user) {
  if (!user) return "";
  return user.displayName || user.email || user.phoneNumber || "Гость";
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
  const [showAuth, setShowAuth] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const navigate = useNavigate();
  const { id: adIdParam } = useParams();
  const selectedAd = adIdParam ? (ads || []).find((a) => a.id === adIdParam) || null : null;
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [phoneRevealed, setPhoneRevealed] = useState(false);
  const [favorites, setFavorites] = useState(loadFavorites);
  const [showFilters, setShowFilters] = useState(false);
  const [showMyAds, setShowMyAds] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showMessages, setShowMessages] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [sortBy, setSortBy] = useState("new");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sellerProfile, setSellerProfile] = useState(null);
  const [selectedAdRating, setSelectedAdRating] = useState(null);
  const [sellerLastSeen, setSellerLastSeen] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [myRating, setMyRating] = useState(null);
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
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const ping = () => {
      setDoc(doc(db, "users", currentUser.uid), { lastSeen: Date.now() }, { merge: true }).catch(() => {});
    };
    ping();
    const interval = setInterval(ping, 60000);
    return () => clearInterval(interval);
  }, [currentUser?.uid]);

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

  useEffect(() => {
    if (!currentUser) {
      setConversations([]);
      return;
    }
    const q = query(collection(db, "conversations"), where("participants", "array-contains", currentUser.uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
        setConversations(list);
      },
      (err) => {
        console.error(err);
      }
    );
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!activeConversation) {
      setChatMessages([]);
      return;
    }
    const q = query(collection(db, "conversations", activeConversation.id, "messages"), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setChatMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        markConversationRead(activeConversation);
      },
      (err) => {
        console.error(err);
      }
    );
    return () => unsubscribe();
  }, [activeConversation?.id]);

  useEffect(() => {
    if (!selectedAd) return;
    setLightboxIndex(0);
    setPhoneRevealed(false);
    if (selectedAd.ownerId !== (currentUser && currentUser.uid)) {
      updateDoc(doc(db, "ads", selectedAd.id), { views: increment(1) }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAd?.id]);

  useEffect(() => {
    if (!selectedAd || !selectedAd.ownerId) {
      setSelectedAdRating(null);
      return;
    }
    let cancelled = false;
    const q = query(collection(db, "reviews"), where("sellerId", "==", selectedAd.ownerId));
    getDocs(q)
      .then((snapshot) => {
        if (cancelled) return;
        const list = snapshot.docs.map((d) => d.data());
        const count = list.length;
        const avg = count ? list.reduce((sum, r) => sum + (r.rating || 0), 0) / count : 0;
        setSelectedAdRating({ avg, count });
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setSelectedAdRating(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAd?.ownerId]);

  useEffect(() => {
    if (!selectedAd || !selectedAd.ownerId) {
      setSellerLastSeen(null);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "users", selectedAd.ownerId))
      .then((snap) => {
        if (cancelled) return;
        setSellerLastSeen(snap.exists() ? snap.data().lastSeen || null : null);
      })
      .catch(() => {
        if (!cancelled) setSellerLastSeen(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAd?.ownerId]);

  useEffect(() => {
    if (!showMyAds || !currentUser) {
      setMyRating(null);
      return;
    }
    let cancelled = false;
    const q = query(collection(db, "reviews"), where("sellerId", "==", currentUser.uid));
    getDocs(q)
      .then((snapshot) => {
        if (cancelled) return;
        const list = snapshot.docs.map((d) => d.data());
        const count = list.length;
        const avg = count ? list.reduce((sum, r) => sum + (r.rating || 0), 0) / count : 0;
        setMyRating({ avg, count });
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setMyRating(null);
      });
    return () => {
      cancelled = true;
    };
  }, [showMyAds, currentUser?.uid]);

  function openSellerProfile(id, name) {
    if (!id) return;
    setSellerProfile({ id, name: name || "Продавец" });
  }

  async function reportAd(ad) {
    const confirmed = window.confirm("Пожаловаться на это объявление? Мы получим сигнал и проверим его.");
    if (!confirmed) return;
    try {
      await addDoc(collection(db, "reports"), {
        adId: ad.id,
        adTitle: ad.title || "",
        ownerId: ad.ownerId || null,
        reportedBy: currentUser ? currentUser.uid : null,
        reportedByName: currentUser ? displayNameFor(currentUser) : "Гость",
        createdAt: Date.now(),
      });
      setError("Жалоба отправлена. Спасибо!");
    } catch (err) {
      console.error(err);
      setError("Не удалось отправить жалобу.");
    }
  }

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

  function openComposer() {
    setEditingId(null);
    setForm({ title: "", category: "goods", price: "", description: "", contact: "", photos: [] });
    setShowForm(true);
  }

  function openEditForm(ad) {
    setEditingId(ad.id);
    setForm({
      title: ad.title || "",
      category: ad.category || "goods",
      price: ad.price || "",
      description: ad.description || "",
      contact: ad.contact || "",
      photos: ad.photos && ad.photos.length ? ad.photos : (ad.photo ? [ad.photo] : []),
    });
    navigate("/");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ title: "", category: "goods", price: "", description: "", contact: "", photos: [] });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.contact.trim() || !form.price.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, "ads", editingId), {
          title: form.title.trim(),
          category: form.category,
          price: form.price.trim(),
          description: form.description.trim(),
          contact: form.contact.trim(),
          photos: form.photos || [],
        });
      } else {
        await addDoc(collection(db, "ads"), {
          title: form.title.trim(),
          category: form.category,
          price: form.price.trim(),
          description: form.description.trim(),
          contact: form.contact.trim(),
          photos: form.photos || [],
          createdAt: Date.now(),
          ownerId: currentUser ? currentUser.uid : null,
          ownerName: currentUser ? displayNameFor(currentUser) : null,
        });
      }
      closeForm();
    } catch (err) {
      console.error(err);
      setError(editingId ? "Не удалось сохранить изменения. Проверь настройки Firebase." : "Не удалось опубликовать объявление. Проверь настройки Firebase.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    const confirmed = window.confirm("Точно хотите удалить это объявление?");
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, "ads", id));
      navigate("/");
    } catch (err) {
      setError("Не удалось удалить объявление.");
    }
  }

  async function toggleSold(ad) {
    try {
      await updateDoc(doc(db, "ads", ad.id), { sold: !ad.sold });
    } catch (err) {
      setError("Не удалось изменить статус объявления.");
    }
  }

  const unreadTotal = conversations.reduce((sum, c) => sum + (isUnread(c) ? 1 : 0), 0);

  function goHome() {
    setShowMyAds(false);
    setShowMessages(false);
    setActiveConversation(null);
    setSellerProfile(null);
    setShowForm(false);
    setFilter("all");
    setSearchQuery("");
    navigate("/");
  }

  function openMyAds() {
    setShowMessages(false);
    setActiveConversation(null);
    setShowMyAds(true);
  }

  function openMessages() {
    if (!currentUser) {
      setShowAuth(true);
      return;
    }
    setShowMyAds(false);
    setActiveConversation(null);
    setShowMessages(true);
  }

  function canShowChatBtn(ad) {
    return !!ad.ownerId && (!currentUser || ad.ownerId !== currentUser.uid);
  }

  async function openChatWithSeller(ad) {
    if (!currentUser) {
      setShowAuth(true);
      return;
    }
    if (!ad.ownerId || ad.ownerId === currentUser.uid) return;
    const existing = conversations.find((c) => c.adId === ad.id && c.buyerId === currentUser.uid && c.sellerId === ad.ownerId);
    navigate("/");
    setShowMyAds(false);
    setShowMessages(true);
    if (existing) {
      setActiveConversation(existing);
      markConversationRead(existing);
      return;
    }
    try {
      const adPhoto = (ad.photos && ad.photos[0]) || ad.photo || null;
      const payload = {
        adId: ad.id,
        adTitle: ad.title,
        adPhoto,
        buyerId: currentUser.uid,
        buyerName: displayNameFor(currentUser),
        sellerId: ad.ownerId,
        sellerName: ad.ownerName || "Продавец",
        participants: [currentUser.uid, ad.ownerId],
        lastMessage: "",
        lastMessageAt: Date.now(),
        createdAt: Date.now(),
        lastReadAt: { [currentUser.uid]: Date.now() },
      };
      const ref = await addDoc(collection(db, "conversations"), payload);
      setActiveConversation({ id: ref.id, ...payload });
    } catch (err) {
      console.error(err);
      setError("Не удалось начать диалог. Проверь настройки Firebase.");
    }
  }

  async function sendMessage(e) {
    e.preventDefault();
    const text = messageText.trim();
    if (!text || !activeConversation) return;
    setMessageText("");
    try {
      await addDoc(collection(db, "conversations", activeConversation.id, "messages"), {
        senderId: currentUser.uid,
        text,
        createdAt: Date.now(),
      });
      await updateDoc(doc(db, "conversations", activeConversation.id), {
        lastMessage: text,
        lastMessageAt: Date.now(),
        [`lastReadAt.${currentUser.uid}`]: Date.now(),
      });
    } catch (err) {
      console.error(err);
      setError("Не удалось отправить сообщение.");
    }
  }

  async function markConversationRead(conversation) {
    if (!currentUser || !conversation) return;
    try {
      await updateDoc(doc(db, "conversations", conversation.id), {
        [`lastReadAt.${currentUser.uid}`]: Date.now(),
      });
    } catch (err) {
      console.error(err);
    }
  }

  function isUnread(c) {
    if (!currentUser || c.lastMessageAt == null) return false;
    if (!c.lastMessage) return false;
    const lastSenderIsMe = false; // lastMessage doesn't track sender id, fall back to lastReadAt comparison
    const readAt = c.lastReadAt ? c.lastReadAt[currentUser.uid] : null;
    return !readAt || readAt < c.lastMessageAt;
  }

  function openAd(ad) {
    navigate(`/ad/${ad.id}`);
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      setError("Не удалось скопировать ссылку.");
    }
  }

  function showPrevPhoto(photosLength) {
    setLightboxIndex((i) => (i - 1 + photosLength) % photosLength);
  }

  function showNextPhoto(photosLength) {
    setLightboxIndex((i) => (i + 1) % photosLength);
  }

  function toggleFavorite(id) {
    const isFav = favorites.includes(id);
    setFavorites((favs) => (isFav ? favs.filter((f) => f !== id) : [...favs, id]));
    updateDoc(doc(db, "ads", id), { favoritesCount: increment(isFav ? -1 : 1) }).catch(() => {});
  }

  function canDeleteAd(ad) {
    return !!currentUser && (!ad.ownerId || ad.ownerId === currentUser.uid);
  }

  const hasActiveFilters = priceMin !== "" || priceMax !== "" || sortBy !== "new";

  function resetFilters() {
    setPriceMin("");
    setPriceMax("");
    setSortBy("new");
  }

  const byCategory = (ads || []).filter((a) => {
    if (a.sold) return false;
    if (filter === "favorites") return favorites.includes(a.id);
    return filter === "all" || a.category === filter;
  });

  const bySearch = byCategory.filter((a) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (a.title || "").toLowerCase().includes(q) || (a.description || "").toLowerCase().includes(q);
  });

  const byPrice = bySearch.filter((a) => {
    const price = a.price ? parseInt(a.price, 10) : null;
    if (priceMin !== "" && (price === null || price < parseInt(priceMin, 10))) return false;
    if (priceMax !== "" && (price === null || price > parseInt(priceMax, 10))) return false;
    return true;
  });

  const visible = [...byPrice].sort((a, b) => {
    if (sortBy === "cheap") return (parseInt(a.price, 10) || 0) - (parseInt(b.price, 10) || 0);
    if (sortBy === "expensive") return (parseInt(b.price, 10) || 0) - (parseInt(a.price, 10) || 0);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const myAds = (ads || []).filter((a) => currentUser && a.ownerId === currentUser.uid);
  const myStats = myAds.reduce(
    (acc, a) => {
      acc.views += a.views || 0;
      acc.favorites += a.favoritesCount || 0;
      if (a.sold) acc.sold += 1;
      else acc.active += 1;
      return acc;
    },
    { views: 0, favorites: 0, active: 0, sold: 0 }
  );

  function renderCard(ad, ownerView = false) {
    const cat = catInfo(ad.category);
    const photos = ad.photos && ad.photos.length ? ad.photos : (ad.photo ? [ad.photo] : []);
    const showDelete = canDeleteAd(ad);
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
        <div style={s.cardPhotoWrap}>
          {photos[0] ? (
            <img src={photos[0]} alt={ad.title} style={{ ...s.cardPhoto, ...(ad.sold ? { filter: "grayscale(0.6)", opacity: 0.6 } : {}) }} />
          ) : (
            <div style={s.cardPhotoPlaceholder}>
              <cat.icon size={30} color={cat.pin} />
            </div>
          )}
          {ad.sold && <span style={s.soldBadge}>ПРОДАНО</span>}
          {photos.length > 1 && <span style={s.photoCountBadge}>+{photos.length - 1}</span>}
          <span style={{ ...s.catBadge, background: cat.pin }}>
            <cat.icon size={11} style={s.catTagIcon} />
            {cat.label}
          </span>
          <button
            style={s.favoriteBtnOnPhoto}
            onClick={(e) => { e.stopPropagation(); toggleFavorite(ad.id); }}
            aria-label="В избранное"
          >
            <Heart
              size={15}
              color={favorites.includes(ad.id) ? "#C94F4F" : "#8a7a63"}
              fill={favorites.includes(ad.id) ? "#C94F4F" : "none"}
            />
          </button>
          {showDelete && (
            <button
              style={s.deleteBtnOnPhoto}
              onClick={(e) => { e.stopPropagation(); handleDelete(ad.id); }}
              aria-label="Удалить объявление"
            >
              <X size={13} color="#8a7a63" />
            </button>
          )}
        </div>

        <div style={s.cardBody}>
          <h3 style={s.cardTitle}>{ad.title}</h3>
          {ad.price && <p style={s.price}>{ad.price} ₽</p>}
          {ownerView && (
            <div style={s.cardFooter}>
              <span style={s.contact}>
                <Phone size={12} style={{ marginRight: 4, verticalAlign: "-2px" }} />
                {ad.contact}
              </span>
            </div>
          )}
          {ownerView && (
            <div style={s.cardStatsRow}>
              <span style={s.cardStatItem}>
                <Eye size={12} style={{ marginRight: 3, verticalAlign: "-2px" }} />
                {ad.views || 0}
              </span>
              <span style={s.cardStatItem}>
                <Heart size={12} style={{ marginRight: 3, verticalAlign: "-2px" }} />
                {ad.favoritesCount || 0}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

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
        .kb-container { max-width: 640px; margin: 0 auto; }
        .kb-grid { display: grid; grid-template-columns: 1fr 1fr; }
        @media (min-width: 640px) {
          .kb-container { max-width: 900px; }
          .kb-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (min-width: 980px) {
          .kb-container { max-width: 1180px; }
          .kb-grid { grid-template-columns: repeat(4, 1fr); }
        }
        .kb-detail-grid { display: flex; flex-direction: column; gap: 16px; max-width: 900px; margin: 12px auto 0; }
        .kb-detail-main { min-width: 0; }
        .kb-detail-side { min-width: 0; }
        @media (min-width: 860px) {
          .kb-detail-grid { flex-direction: row; align-items: flex-start; max-width: 1020px; gap: 22px; }
          .kb-detail-main { flex: 1.7; }
          .kb-detail-side { flex: 1; position: sticky; top: 20px; }
        }
      `}</style>

      <header style={s.header}>
        <div className="kb-container" style={s.headerInner}>
          <div style={s.authRow}>
            {currentUser ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button className="kb-fab" style={s.fabInline} onClick={openComposer} aria-label="Разместить объявление">
                  <Plus size={20} color="#FBF3E1" />
                </button>
                <button style={s.myAdsBtn} onClick={openMyAds}>
                  Личный кабинет
                </button>
                <div style={{ position: "relative", display: "inline-block" }}>
                  <button style={s.myAdsBtn} onClick={openMessages}>
                    Сообщения
                  </button>
                  {unreadTotal > 0 && <div style={s.headerBadge}>{unreadTotal}</div>}
                </div>
                <div style={s.userChip}>
                  <UserRound size={14} style={{ marginRight: 5, verticalAlign: "-2px", flexShrink: 0 }} />
                  <span style={s.userName}>{displayNameFor(currentUser)}</span>
                  <button style={s.logoutBtn} onClick={() => signOut(auth)} aria-label="Выйти">
                    <LogOut size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button className="kb-fab" style={s.fabInline} onClick={openComposer} aria-label="Разместить объявление">
                  <Plus size={20} color="#FBF3E1" />
                </button>
                <button style={s.loginBtn} onClick={() => setShowAuth(true)}>
                  Войти
                </button>
              </div>
            )}
          </div>
          <button type="button" style={s.titleBtn} onClick={goHome} aria-label="На главную">
            <h1 style={s.title}>Калуга · доска объявлений</h1>
          </button>
          <p style={s.subtitle}>Место для локальных объявлений — от соседей соседям</p>
        </div>
      </header>

{showMyAds ? (
        <main className="kb-container" style={s.board}>
          <div style={s.myAdsHeader}>
            <button style={s.backBtn} onClick={() => setShowMyAds(false)}>
              <ChevronLeft size={18} style={{ verticalAlign: "-3px", marginRight: 4 }} />
              Назад
            </button>
            <h2 style={s.myAdsTitle}>Личный кабинет</h2>
          </div>

          <div style={s.profileCard}>
            <div style={s.profileTopRow}>
              <div style={s.profileAvatar}>
                <UserRound size={26} color="#C97B3E" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={s.profileName}>{displayNameFor(currentUser)}</p>
                <div style={s.sellerRatingRow}>
                  {myRating && myRating.count > 0 ? (
                    <>
                      <Stars value={myRating.avg} size={14} />
                      <span style={s.sellerRatingText}>
                        {myRating.avg.toFixed(1)} · {myRating.count} {countWord(myRating.count)}
                      </span>
                    </>
                  ) : (
                    <span style={s.sellerRatingText}>Пока нет отзывов</span>
                  )}
                </div>
              </div>
            </div>

            <div style={s.statsGrid}>
              <div style={s.statTile}>
                <LayoutGrid size={16} color="#C97B3E" style={{ marginBottom: 4 }} />
                <span style={s.statValue}>{myStats.active}</span>
                <span style={s.statLabel}>Активных</span>
              </div>
              <div style={s.statTile}>
                <Check size={16} color="#5C8F4E" style={{ marginBottom: 4 }} />
                <span style={s.statValue}>{myStats.sold}</span>
                <span style={s.statLabel}>Продано</span>
              </div>
              <div style={s.statTile}>
                <Eye size={16} color="#8a7a63" style={{ marginBottom: 4 }} />
                <span style={s.statValue}>{myStats.views}</span>
                <span style={s.statLabel}>Просмотров</span>
              </div>
              <div style={s.statTile}>
                <Heart size={16} color="#C94F4F" style={{ marginBottom: 4 }} />
                <span style={s.statValue}>{myStats.favorites}</span>
                <span style={s.statLabel}>В избранном</span>
              </div>
            </div>
          </div>

          <h3 style={s.myAdsListTitle}>Мои объявления</h3>

          {myAds.length === 0 && (
            <div style={s.empty}>
              <p style={s.emptyText}>У тебя пока нет объявлений. Нажми "+", чтобы разместить первое.</p>
            </div>
          )}
          <div className="kb-grid" style={s.grid}>
            {myAds.map((ad) => renderCard(ad, true))}
          </div>
        </main>
      ) : showMessages ? (
        <main className="kb-container" style={s.board}>
          <div style={s.myAdsHeader}>
            <button
              style={s.backBtn}
              onClick={() => (activeConversation ? setActiveConversation(null) : setShowMessages(false))}
            >
              <ChevronLeft size={18} style={{ verticalAlign: "-3px", marginRight: 4 }} />
              Назад
            </button>
            <h2 style={s.myAdsTitle}>
              {activeConversation
                ? (activeConversation.sellerId === currentUser?.uid ? activeConversation.buyerName : activeConversation.sellerName)
                : "Сообщения"}
            </h2>
          </div>

          {!activeConversation ? (
            <>
              {conversations.length === 0 && (
                <div style={s.empty}>
                  <p style={s.emptyText}>Пока нет диалогов. Напиши продавцу из карточки объявления.</p>
                </div>
              )}
              <div style={s.convoList}>
                {conversations.map((c) => {
                  const otherName = c.sellerId === currentUser?.uid ? c.buyerName : c.sellerName;
                  const unread = isUnread(c);
                  return (
                    <div
                      key={c.id}
                      style={s.convoItem}
                      onClick={() => {
                        setActiveConversation(c);
                        markConversationRead(c);
                      }}
                    >
                      <div style={s.convoAvatar}>
                        {c.adPhoto ? (
                          <img src={c.adPhoto} alt="" style={s.convoAvatarImg} />
                        ) : (
                          <MessageCircle size={20} color="#8a7a63" />
                        )}
                      </div>
                      <div style={s.convoInfo}>
                        <p style={{ ...s.convoAdTitle, fontWeight: unread ? 800 : 600 }}>{c.adTitle}</p>
                        <p style={s.convoOther}>{otherName}</p>
                        <p style={{ ...s.convoLastMsg, fontWeight: unread ? 700 : 400, color: unread ? "#2b2118" : s.convoLastMsg.color }}>
                          {c.lastMessage || "Начните диалог"}
                        </p>
                      </div>
                      {unread && <div style={s.unreadDot} />}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={s.chatWrap}>
              <div style={s.chatMessages}>
                {chatMessages.length === 0 && <p style={s.emptyText}>Сообщений пока нет. Напиши первым!</p>}
                {chatMessages.map((m) => {
                  const mine = m.senderId === currentUser?.uid;
                  return (
                    <div key={m.id} style={{ ...s.chatBubbleRow, justifyContent: mine ? "flex-end" : "flex-start" }}>
                      <div style={mine ? s.chatBubbleMine : s.chatBubbleTheirs}>
                        <p style={s.chatBubbleText}>{m.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <form style={s.chatInputRow} onSubmit={sendMessage}>
                <input
                  className="kb-input"
                  style={s.chatInput}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Написать сообщение…"
                />
                <button type="submit" style={s.chatSendBtn} aria-label="Отправить">
                  <Send size={18} color="#FBF3E1" />
                </button>
              </form>
            </div>
          )}
        </main>
      ) : adIdParam ? (
        selectedAd ? (() => {
          const cat = catInfo(selectedAd.category);
          const photos = selectedAd.photos && selectedAd.photos.length
            ? selectedAd.photos
            : (selectedAd.photo ? [selectedAd.photo] : []);
          const showDelete = canDeleteAd(selectedAd);
          const similarAds = (ads || [])
            .filter((a) => a.id !== selectedAd.id && a.category === selectedAd.category && !a.sold)
            .slice(0, 8);
          return (
            <main className="kb-container" style={s.board}>
              <button style={s.backBtn} onClick={() => navigate("/")}>
                <ChevronLeft size={18} style={{ verticalAlign: "-3px", marginRight: 4 }} />
                Назад
              </button>

              <div className="kb-detail-grid">
                <div className="kb-detail-main">
                  <div style={s.photoCard}>
                    <div style={s.pageTopRow}>
                      <span style={{ ...s.catTag, color: cat.pin }}>
                        <cat.icon size={14} style={s.catTagIcon} />
                        {cat.label}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button
                          type="button"
                          style={s.favoriteBtnDetail}
                          onClick={copyShareLink}
                          aria-label="Скопировать ссылку на объявление"
                        >
                          {linkCopied ? <Check size={19} color="#5C8F4E" /> : <Share2 size={19} color="#8a7a63" />}
                        </button>
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
                        {!showDelete && (
                          <button
                            type="button"
                            style={s.favoriteBtnDetail}
                            onClick={() => reportAd(selectedAd)}
                            aria-label="Пожаловаться на объявление"
                            title="Пожаловаться"
                          >
                            <Flag size={18} color="#8a7a63" />
                          </button>
                        )}
                      </div>
                    </div>

                    {photos.length > 0 ? (
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
                    ) : (
                      <h2 style={s.detailTitleNoPhoto}>{selectedAd.title}</h2>
                    )}
                  </div>

                  {selectedAd.description && (
                    <div style={s.descCard}>
                      <h3 style={s.sideSectionTitle}>Описание</h3>
                      <p style={s.detailDesc}>{selectedAd.description}</p>
                    </div>
                  )}
                </div>

                <div className="kb-detail-side">
                  <div style={s.sideCard}>
                    {photos.length > 0 && <h2 style={s.detailTitle}>{selectedAd.title}</h2>}
                    {selectedAd.sold && <span style={s.soldBadgeDetail}>ПРОДАНО</span>}
                    {selectedAd.price && <p style={s.detailPrice}>{selectedAd.price} ₽</p>}

                    {selectedAd.ownerName && (
                      <div
                        style={s.sellerCard}
                        onClick={() => openSellerProfile(selectedAd.ownerId, selectedAd.ownerName)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter") openSellerProfile(selectedAd.ownerId, selectedAd.ownerName); }}
                      >
                        <div style={s.sellerAvatar}>
                          <UserRound size={22} color="#C97B3E" />
                        </div>
                        <div style={s.sellerInfo}>
                          <p style={s.sellerName}>{selectedAd.ownerName}</p>
                          <div style={s.sellerRatingRow}>
                            {selectedAdRating && selectedAdRating.count > 0 ? (
                              <>
                                <Stars value={selectedAdRating.avg} size={14} />
                                <span style={s.sellerRatingText}>
                                  {selectedAdRating.avg.toFixed(1)} · {selectedAdRating.count} {countWord(selectedAdRating.count)}
                                </span>
                              </>
                            ) : (
                              <span style={s.sellerRatingText}>Пока нет отзывов</span>
                            )}
                          </div>
                          {formatLastSeen(sellerLastSeen) && (
                            <div style={s.onlineRow}>
                              <span
                                style={{
                                  ...s.onlineDot,
                                  background: formatLastSeen(sellerLastSeen).online ? "#5C8F4E" : "#B8A888",
                                }}
                              />
                              <span style={s.onlineText}>{formatLastSeen(sellerLastSeen).text}</span>
                            </div>
                          )}
                        </div>
                        <ChevronRight size={18} color="#8a7a63" />
                      </div>
                    )}

                    {canShowChatBtn(selectedAd) && (
                      <button type="button" style={s.chatWithSellerBtn} onClick={() => openChatWithSeller(selectedAd)}>
                        <MessageCircle size={16} style={{ marginRight: 6, verticalAlign: "-3px" }} />
                        Написать продавцу
                      </button>
                    )}

                    <div style={s.detailContactRow}>
                      {phoneRevealed ? (
                        <div style={s.phoneRevealedRow}>
                          <span style={s.phoneRevealedNumber}>
                            <Phone size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                            {selectedAd.contact}
                          </span>
                          <a
                            href={`tel:${(selectedAd.contact || "").replace(/[^\d+]/g, "")}`}
                            style={s.callBtn}
                          >
                            Позвонить
                          </a>
                        </div>
                      ) : (
                        <button type="button" style={s.showPhoneBtn} onClick={() => setPhoneRevealed(true)}>
                          <Phone size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                          Показать телефон
                        </button>
                      )}
                    </div>

                    {showDelete && (
                      <>
                        <button
                          type="button"
                          style={selectedAd.sold ? s.unsoldBtn : s.soldBtn}
                          onClick={() => toggleSold(selectedAd)}
                        >
                          {selectedAd.sold ? "Вернуть в продажу" : "Отметить как проданное"}
                        </button>
                        <div style={s.detailActionsRow}>
                          <button
                            type="button"
                            style={s.editFullBtn}
                            onClick={() => openEditForm(selectedAd)}
                          >
                            Редактировать
                          </button>
                          <button
                            type="button"
                            style={s.deleteFullBtn}
                            onClick={() => handleDelete(selectedAd.id)}
                          >
                            Удалить
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {similarAds.length > 0 && (
                <div style={s.similarSection}>
                  <h3 style={s.similarTitle}>Похожие объявления</h3>
                  <div style={s.similarRow}>
                    {similarAds.map((sad) => {
                      const sCat = catInfo(sad.category);
                      const SIcon = sCat.icon;
                      const sPhotos = sad.photos && sad.photos.length ? sad.photos : (sad.photo ? [sad.photo] : []);
                      return (
                        <div key={sad.id} style={s.similarCard} onClick={() => openAd(sad)}>
                          <div style={s.similarPhotoWrap}>
                            {sPhotos[0] ? (
                              <img src={sPhotos[0]} alt={sad.title} style={s.similarPhoto} />
                            ) : (
                              <div style={s.similarPhotoPlaceholder}>
                                <SIcon size={20} color={sCat.pin} />
                              </div>
                            )}
                          </div>
                          <p style={s.similarCardTitle}>{sad.title}</p>
                          {sad.price && <p style={s.similarCardPrice}>{sad.price} ₽</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </main>
          );
        })() : ads === null ? (
          <main className="kb-container" style={s.board}>
            <p style={s.hint}>Открываем объявление…</p>
          </main>
        ) : (
          <main className="kb-container" style={s.board}>
            <button style={s.backBtn} onClick={() => navigate("/")}>
              <ChevronLeft size={18} style={{ verticalAlign: "-3px", marginRight: 4 }} />
              Назад
            </button>
            <div style={s.empty}>
              <p style={s.emptyText}>Объявление не найдено. Возможно, оно было удалено или ссылка устарела.</p>
            </div>
          </main>
        )
      ) : (
        <>
      <div className="kb-container" style={s.searchRow}>
        <input
          className="kb-input"
          style={s.searchInput}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по объявлениям"
        />
        {searchQuery && (
          <button style={s.searchClearBtn} onClick={() => setSearchQuery("")} aria-label="Очистить поиск">
            <X size={15} />
          </button>
        )}
      </div>

      <div className="kb-container" style={s.chipsRow}>
        <button className="kb-chip" style={{ ...s.chip, ...(filter === "all" ? s.chipActive : {}) }} onClick={() => setFilter("all")}>
          <LayoutGrid size={14} style={s.chipIcon} />
          Все
        </button>
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const active = filter === c.id;
          return (
            <button
              key={c.id}
              className="kb-chip"
              style={{
                ...s.chip,
                background: active ? c.pin : hexToRgba(c.pin, 0.22),
                borderColor: c.pin,
                color: active ? "#FBF3E1" : "#FBF3E1",
                fontWeight: active ? 800 : 700,
                boxShadow: active ? `0 3px 10px ${hexToRgba(c.pin, 0.5)}` : "none",
              }}
              onClick={() => setFilter(c.id)}
            >
              <Icon size={16} style={s.chipIcon} color={active ? "#FBF3E1" : "#FBF3E1"} />
              {c.label}
            </button>
          );
        })}
        <button
          className="kb-chip"
          style={{ ...s.chip, ...(filter === "favorites" ? s.chipActive : {}) }}
          onClick={() => setFilter("favorites")}
        >
          ♥ Избранное
        </button>
        <button
          className="kb-chip"
          style={{ ...s.chip, ...(showFilters || hasActiveFilters ? s.chipActive : {}) }}
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal size={13} style={s.chipIcon} />
          Фильтры{hasActiveFilters ? " •" : ""}
        </button>
      </div>

      {showFilters && (
        <div className="kb-container" style={s.filterPanel}>
          <div style={s.filterRow}>
            <label style={s.filterLabel}>Цена, ₽</label>
            <input
              className="kb-input"
              style={s.filterPriceInput}
              type="text"
              inputMode="numeric"
              placeholder="от"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value.replace(/[^0-9]/g, ""))}
            />
            <span style={s.filterDash}>—</span>
            <input
              className="kb-input"
              style={s.filterPriceInput}
              type="text"
              inputMode="numeric"
              placeholder="до"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>
          <div style={s.filterRow}>
            <label style={s.filterLabel}>Сортировка</label>
            <select className="kb-select" style={s.filterSelect} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="new">Сначала новые</option>
              <option value="cheap">Сначала дешевле</option>
              <option value="expensive">Сначала дороже</option>
            </select>
          </div>
          {hasActiveFilters && (
            <button style={s.filterResetBtn} onClick={resetFilters}>
              Сбросить фильтры
            </button>
          )}
        </div>
      )}

      <main className="kb-container" style={s.board}>
        {ads === null && <p style={s.hint}>Открываем доску…</p>}

        {ads !== null && visible.length === 0 && (
          <div style={s.empty}>
            <p style={s.emptyText}>
              {searchQuery
                ? "Ничего не найдено по этому запросу."
                : filter === "all"
                ? "Пока здесь пусто. Стань первым, кто повесит объявление."
                : filter === "favorites"
                ? "Пока нет избранных объявлений. Нажми на сердечко на карточке, чтобы сохранить."
                : "В этой категории пока ничего нет."}
            </p>
          </div>
        )}

        <div className="kb-grid" style={s.grid}>
          {visible.map((ad) => renderCard(ad))}
        </div>
      </main>
        </>
      )}

      {error && <div style={s.errorToast} onClick={() => setError(null)}>{error}</div>}

      {showForm && (
        <div style={s.overlay} onClick={closeForm}>
          <form style={s.formCard} onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <div style={s.formHeader}>
              <h2 style={s.formTitle}>{editingId ? "Редактировать объявление" : "Новое объявление"}</h2>
              <button type="button" style={s.closeBtn} onClick={closeForm} aria-label="Закрыть">
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

            <label style={s.label}>Цена</label>
            <input className="kb-input" style={s.input} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^0-9]/g, "") })} placeholder="3000" inputMode="numeric" required />

            <label style={s.label}>Описание</label>
            <textarea className="kb-textarea" style={{ ...s.input, height: 72, resize: "none" }} value={form.description} maxLength={280} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Пара слов о том, что предлагаешь" />

            <label style={s.label}>Контакт</label>
            <input className="kb-input" style={s.input} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Телефон или Telegram" required />

            <button type="submit" style={s.submitBtn} disabled={saving}>
              {saving ? (editingId ? "Сохраняем…" : "Публикуем…") : (editingId ? "Сохранить изменения" : "Разместить объявление")}
            </button>
            <p style={s.formNote}>
              <MapPin size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
              Видно всем, кто открывает сайт
            </p>
          </form>
        </div>
      )}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      {sellerProfile && (
        <SellerProfile
          sellerId={sellerProfile.id}
          sellerName={sellerProfile.name}
          currentUser={currentUser}
          currentUserName={currentUser ? displayNameFor(currentUser) : ""}
          conversations={conversations}
          onClose={() => setSellerProfile(null)}
        />
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
  header: { padding: "16px 20px 18px", textAlign: "center" },
  headerInner: {},
  authRow: { display: "flex", justifyContent: "flex-end", marginBottom: 10 },
  loginBtn: { padding: "6px 16px", borderRadius: 999, border: "1.5px solid rgba(251,243,225,0.5)", background: "rgba(0,0,0,0.15)", color: "#F0E6D2", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  myAdsBtn: { padding: "6px 14px", borderRadius: 999, border: "1.5px solid rgba(251,243,225,0.5)", background: "transparent", color: "#F0E6D2", fontSize: 12.5, fontWeight: 700, cursor: "pointer" },
  userChip: { display: "flex", alignItems: "center", gap: 6, padding: "5px 8px 5px 12px", borderRadius: 999, background: "rgba(0,0,0,0.15)", color: "#F0E6D2", fontSize: 12.5 },
  userName: { maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  logoutBtn: { background: "transparent", border: "none", color: "#F0E6D2", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" },
  titleBtn: { background: "transparent", border: "none", padding: 0, margin: 0, cursor: "pointer", display: "block", width: "100%" },
  title: { fontFamily: "'Caveat', cursive", fontSize: 40, color: "#FBF3E1", margin: 0, fontWeight: 700, lineHeight: 1.1 },
  subtitle: { color: "#D9C9AE", fontSize: 13.5, margin: "6px 0 0" },
  searchRow: { position: "relative", padding: "0 16px 10px" },
  searchInput: { width: "100%", padding: "10px 36px 10px 14px", borderRadius: 999, border: "1.5px solid rgba(251,243,225,0.35)", background: "rgba(251,243,225,0.92)", fontSize: 14, fontFamily: "'PT Sans', sans-serif", color: "#2E2013" },
  searchClearBtn: { position: "absolute", right: 26, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "#8a7a63", display: "flex", alignItems: "center", padding: 4 },
  chipsRow: { display: "flex", flexWrap: "wrap", gap: 8, padding: "4px 16px 14px" },
  chip: { flexShrink: 0, padding: "7px 14px", borderRadius: 999, border: "1.5px solid rgba(251,243,225,0.35)", background: "rgba(0,0,0,0.15)", color: "#F0E6D2", fontSize: 13.5, fontFamily: "'PT Sans', sans-serif", cursor: "pointer" },
  chipActive: { background: "#FBF3E1", color: "#3A2A18", borderColor: "#FBF3E1", fontWeight: 700 },
  board: { padding: "0 16px" },
  myAdsHeader: { display: "flex", alignItems: "center", gap: 12, maxWidth: 640, margin: "0 auto", padding: "6px 16px 14px" },
  backBtn: { display: "flex", alignItems: "center", padding: "6px 10px", borderRadius: 999, border: "1.5px solid rgba(251,243,225,0.35)", background: "rgba(0,0,0,0.12)", color: "#F0E6D2", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  myAdsTitle: { fontFamily: "'Caveat', cursive", fontSize: 24, color: "#FBF3E1", margin: 0, fontWeight: 700 },
  profileCard: { background: "#FBF3E1", maxWidth: 640, margin: "0 auto 18px", borderRadius: 16, padding: "16px 18px 18px", boxShadow: "0 6px 18px rgba(20,12,4,0.25)" },
  profileTopRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 14 },
  profileAvatar: { width: 50, height: 50, borderRadius: "50%", background: "rgba(201,123,62,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  profileName: { fontSize: 17, fontWeight: 700, color: "#2E2013", margin: "0 0 4px" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 },
  statTile: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(201,123,62,0.08)", borderRadius: 12, padding: "10px 4px" },
  statValue: { fontSize: 17, fontWeight: 800, color: "#2E2013" },
  statLabel: { fontSize: 10.5, color: "#6B5A45", fontWeight: 700, textAlign: "center", marginTop: 1 },
  myAdsListTitle: { fontFamily: "'Caveat', cursive", fontSize: 20, color: "#FBF3E1", margin: "0 0 10px", fontWeight: 700, maxWidth: 640, marginLeft: "auto", marginRight: "auto", padding: "0 16px" },

  filterPanel: { padding: "12px 16px 14px", background: "rgba(0,0,0,0.15)", borderRadius: 12, display: "flex", flexDirection: "column", gap: 10 },
  filterRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  filterLabel: { color: "#D9C9AE", fontSize: 12.5, fontWeight: 700, minWidth: 78 },
  filterPriceInput: { width: 90, padding: "7px 9px", borderRadius: 8, border: "1.5px solid rgba(251,243,225,0.35)", background: "rgba(251,243,225,0.92)", fontSize: 13.5, fontFamily: "'PT Sans', sans-serif", color: "#2E2013" },
  filterDash: { color: "#D9C9AE" },
  filterSelect: { flex: 1, minWidth: 160, padding: "7px 9px", borderRadius: 8, border: "1.5px solid rgba(251,243,225,0.35)", background: "rgba(251,243,225,0.92)", fontSize: 13.5, fontFamily: "'PT Sans', sans-serif", color: "#2E2013" },
  filterResetBtn: { alignSelf: "flex-start", background: "transparent", border: "1.5px solid rgba(251,243,225,0.5)", borderRadius: 999, padding: "5px 14px", fontSize: 12.5, color: "#F0E6D2", cursor: "pointer" },
  hint: { color: "#D9C9AE", textAlign: "center", marginTop: 40, fontSize: 14 },
  empty: { textAlign: "center", padding: "40px 20px", background: "rgba(0,0,0,0.15)", borderRadius: 12, marginTop: 12 },
  emptyText: { color: "#E8DBC2", fontSize: 14.5, margin: 0 },
  grid: { gap: 14, marginTop: 8 },

  card: { position: "relative", background: "#FBF3E1", borderRadius: 14, padding: 0, overflow: "hidden", boxShadow: "0 6px 14px rgba(20,12,4,0.3)" },

  cardPhotoWrap: { position: "relative", width: "100%", aspectRatio: "4 / 3", background: "#EFE6D2", overflow: "hidden" },
  cardPhoto: { width: "100%", height: "100%", objectFit: "contain", display: "block" },
  cardPhotoPlaceholder: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" },
  photoCountBadge: { position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.65)", color: "#FBF3E1", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 999, zIndex: 2 },
  soldBadge: { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) rotate(-8deg)", background: "rgba(20,12,4,0.8)", color: "#FBF3E1", fontSize: 13, fontWeight: 800, letterSpacing: 1, padding: "4px 14px", borderRadius: 6, zIndex: 2, whiteSpace: "nowrap" },
  catBadge: { position: "absolute", left: 8, bottom: 8, display: "inline-flex", alignItems: "center", color: "#FBF3E1", fontSize: 10.5, fontWeight: 700, padding: "4px 9px", borderRadius: 999, boxShadow: "0 2px 5px rgba(0,0,0,0.3)", zIndex: 2 },
  favoriteBtnOnPhoto: { position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", background: "rgba(251,243,225,0.92)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2, boxShadow: "0 2px 5px rgba(0,0,0,0.25)" },
  deleteBtnOnPhoto: { position: "absolute", top: 8, left: 8, width: 24, height: 24, borderRadius: "50%", background: "rgba(251,243,225,0.85)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 },

  cardBody: { padding: "10px 12px 12px" },
  cardTitle: { fontSize: 14, color: "#2E2013", margin: "0 0 4px", fontWeight: 700, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 36 },
  price: { fontSize: 16, color: "#1F1408", fontWeight: 800, margin: "0 0 6px" },
  cardFooter: { borderTop: "1px dashed #C9B896", paddingTop: 8, marginTop: 2 },
  contact: { fontSize: 11, color: "#6B5A45" },
  cardStatsRow: { display: "flex", gap: 12, marginTop: 6 },
  cardStatItem: { display: "inline-flex", alignItems: "center", fontSize: 11, color: "#8a7a63", fontWeight: 700 },

  catTag: { display: "inline-flex", alignItems: "center", fontSize: 11.5, fontWeight: 700, textTransform: "none", letterSpacing: 0.2 },
  catTagIcon: { marginRight: 4, verticalAlign: "-2px" },
  chipIcon: { marginRight: 5, verticalAlign: "-2px" },
  favoriteBtnDetail: { background: "transparent", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" },
  fileInput: { width: "100%", fontSize: 13, color: "#5A4A38", padding: "6px 0" },
  photoStatus: { fontSize: 12, color: "#8a7a63", margin: "4px 0 0" },
  photoGrid: { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 },
  photoPreviewWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 5 },
  photoPreview: { width: 64, height: 64, objectFit: "cover", borderRadius: 6, border: "1px solid #D9C9AE" },
  removePhotoBtn: { background: "transparent", border: "1px solid #D9C9AE", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#6B5A45", cursor: "pointer" },
  fab: { position: "fixed", right: 20, bottom: 24, width: 56, height: 56, borderRadius: "50%", background: "#C97B3E", border: "none", boxShadow: "0 6px 16px rgba(0,0,0,0.4)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  fabInline: { width: 38, height: 38, borderRadius: "50%", background: "#C97B3E", border: "none", boxShadow: "0 3px 10px rgba(0,0,0,0.3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  errorToast: { position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: "#3A2A18", color: "#FBF3E1", padding: "8px 16px", borderRadius: 8, fontSize: 13, maxWidth: "90%", textAlign: "center", cursor: "pointer" },
  overlay: { position: "fixed", inset: 0, background: "rgba(20,12,4,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, padding: 16 },
  overlayCenter: { position: "fixed", inset: 0, background: "rgba(20,12,4,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, padding: 16 },
  formCard: { background: "#FBF3E1", width: "100%", maxWidth: 480, borderRadius: 16, padding: "18px 20px 24px", maxHeight: "88vh", overflowY: "auto" },
  detailCard: { background: "#FBF3E1", width: "100%", maxWidth: 480, borderRadius: 16, padding: "18px 20px 26px", maxHeight: "90vh", overflowY: "auto" },
  photoCard: { background: "#FBF3E1", borderRadius: 16, padding: "16px 16px 18px", boxShadow: "0 6px 18px rgba(20,12,4,0.25)", marginBottom: 14 },
  descCard: { background: "#FBF3E1", borderRadius: 16, padding: "18px 20px 22px", boxShadow: "0 6px 18px rgba(20,12,4,0.25)" },
  sideCard: { background: "#FBF3E1", borderRadius: 16, padding: "18px 20px 22px", boxShadow: "0 6px 18px rgba(20,12,4,0.25)" },
  sideSectionTitle: { fontFamily: "'Caveat', cursive", fontSize: 20, color: "#3A2A18", margin: "0 0 10px", fontWeight: 700 },
  pageTopRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  sellerCard: { display: "flex", alignItems: "center", gap: 12, background: "rgba(201,123,62,0.10)", border: "1.5px solid rgba(201,123,62,0.4)", borderRadius: 12, padding: "10px 12px", margin: "14px 0", cursor: "pointer" },
  sellerAvatar: { width: 42, height: 42, borderRadius: "50%", background: "rgba(201,123,62,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  sellerInfo: { flex: 1, minWidth: 0 },
  sellerName: { fontSize: 14.5, fontWeight: 700, color: "#2E2013", margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  sellerRatingRow: { display: "flex", alignItems: "center", gap: 6 },
  sellerRatingText: { fontSize: 12, color: "#6B5A45", fontWeight: 700 },
  onlineRow: { display: "flex", alignItems: "center", gap: 6, marginTop: 3 },
  onlineDot: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },
  onlineText: { fontSize: 11.5, color: "#8a7a63" },
  detailPhotoWrap: { position: "relative", aspectRatio: "4 / 3", background: "#F3E9D2", borderRadius: 10, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" },
  detailMainPhoto: { width: "100%", height: "100%", objectFit: "contain", display: "block" },
  photoNavBtn: { position: "absolute", top: "50%", transform: "translateY(-50%)", background: "rgba(20,12,4,0.5)", border: "none", borderRadius: "50%", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  photoCounter: { position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.6)", color: "#FBF3E1", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999 },
  thumbRow: { display: "flex", gap: 8, marginTop: 8, overflowX: "auto" },
  thumb: { width: 52, height: 52, objectFit: "cover", borderRadius: 6, flexShrink: 0 },
  detailTitle: { fontFamily: "'Caveat', cursive", fontSize: 25, color: "#2E2013", margin: "0 0 8px", fontWeight: 700, lineHeight: 1.25 },
  detailTitleNoPhoto: { fontFamily: "'Caveat', cursive", fontSize: 25, color: "#2E2013", margin: "0 0 4px", fontWeight: 700, lineHeight: 1.25 },
  detailPrice: { fontSize: 26, color: "#1F1408", fontWeight: 800, margin: "0 0 14px" },
  detailDesc: { fontSize: 14.5, color: "#5A4A38", lineHeight: 1.5, margin: "0 0 8px", whiteSpace: "pre-wrap" },
  detailOwner: { fontSize: 12.5, color: "#8a7a63", margin: "0 0 14px" },
  detailOwnerBtn: { display: "inline-flex", alignItems: "center", background: "rgba(201,123,62,0.14)", border: "1.5px solid #C97B3E", borderRadius: 999, cursor: "pointer", padding: "8px 14px", margin: "0 0 14px", fontSize: 13.5, fontWeight: 700, color: "#3A2A18", fontFamily: "'PT Sans', sans-serif" },
  detailOwnerRating: { display: "inline-flex", alignItems: "center", fontWeight: 800, color: "#3A2A18" },
  detailOwnerHint: { marginLeft: 8, fontSize: 11.5, fontWeight: 700, color: "#C97B3E" },
  detailContactRow: { borderTop: "1px dashed #C9B896", paddingTop: 12, marginBottom: 16 },
  showPhoneBtn: { width: "100%", padding: "11px", borderRadius: 10, border: "1.5px solid #C97B3E", background: "transparent", color: "#C97B3E", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  phoneRevealedRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  phoneRevealedNumber: { fontSize: 14, color: "#3A2A18", fontWeight: 700 },
  callBtn: { padding: "9px 16px", borderRadius: 10, border: "none", background: "#5C8F4E", color: "#FBF3E1", fontSize: 13.5, fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center" },
  soldBadgeDetail: { display: "inline-block", background: "#3A2A18", color: "#FBF3E1", fontSize: 11, fontWeight: 800, letterSpacing: 0.5, padding: "3px 10px", borderRadius: 999, marginBottom: 8 },
  soldBtn: { width: "100%", padding: "11px", borderRadius: 10, border: "none", background: "#5C8F4E", color: "#FBF3E1", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 10 },
  unsoldBtn: { width: "100%", padding: "11px", borderRadius: 10, border: "1.5px solid #5C8F4E", background: "transparent", color: "#5C8F4E", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 10 },
  detailActionsRow: { display: "flex", gap: 10 },
  editFullBtn: { flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid #C97B3E", background: "transparent", color: "#C97B3E", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  deleteFullBtn: { flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid #C94F4F", background: "transparent", color: "#C94F4F", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  formHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  formTitle: { fontFamily: "'Caveat', cursive", fontSize: 26, color: "#3A2A18", margin: 0, fontWeight: 700 },
  closeBtn: { background: "transparent", border: "none", cursor: "pointer", padding: 4 },
  label: { display: "block", fontSize: 12.5, color: "#6B5A45", margin: "12px 0 4px", fontWeight: 700 },
  input: { width: "100%", padding: "9px 11px", borderRadius: 8, border: "1.5px solid #D9C9AE", background: "#fff", fontSize: 14.5, fontFamily: "'PT Sans', sans-serif", color: "#2E2013" },
  submitBtn: { width: "100%", marginTop: 18, padding: "12px", borderRadius: 10, border: "none", background: "#C97B3E", color: "#FBF3E1", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  formNote: { textAlign: "center", fontSize: 11.5, color: "#8a7a63", marginTop: 10 },

  chatWithSellerBtn: { width: "100%", padding: "11px", borderRadius: 10, border: "none", background: "#C97B3E", color: "#FBF3E1", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center" },

  convoList: { display: "flex", flexDirection: "column", gap: 10, marginTop: 8 },
  convoItem: { display: "flex", alignItems: "center", gap: 12, background: "#FBF3E1", borderRadius: 12, padding: "10px 12px", cursor: "pointer", boxShadow: "0 4px 10px rgba(20,12,4,0.2)" },
  convoAvatar: { width: 44, height: 44, borderRadius: 10, background: "#EFE6D2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" },
  convoAvatarImg: { width: "100%", height: "100%", objectFit: "cover" },
  convoInfo: { flex: 1, minWidth: 0 },
  convoAdTitle: { fontSize: 13, fontWeight: 700, color: "#2E2013", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  convoOther: { fontSize: 12, color: "#8a7a63", margin: "2px 0" },
  convoLastMsg: { fontSize: 12.5, color: "#6B5A45", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  unreadDot: { width: 10, height: 10, borderRadius: "50%", background: "#D9534F", flexShrink: 0, alignSelf: "center" },
  headerBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    background: "#D9534F",
    color: "#fff",
    fontSize: 10,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 4px",
    lineHeight: 1,
  },

  chatWrap: { display: "flex", flexDirection: "column", height: "60vh", marginTop: 8, background: "rgba(0,0,0,0.1)", borderRadius: 12, overflow: "hidden" },
  chatMessages: { flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8 },
  chatBubbleRow: { display: "flex", width: "100%" },
  chatBubbleMine: { maxWidth: "75%", background: "#C97B3E", color: "#FBF3E1", borderRadius: "12px 12px 2px 12px", padding: "8px 12px" },
  chatBubbleTheirs: { maxWidth: "75%", background: "#FBF3E1", color: "#2E2013", borderRadius: "12px 12px 12px 2px", padding: "8px 12px", border: "1px solid #D9C9AE" },
  chatBubbleText: { margin: 0, fontSize: 14, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  chatInputRow: { display: "flex", gap: 8, padding: 10, background: "rgba(0,0,0,0.12)" },
  chatInput: { flex: 1, padding: "9px 12px", borderRadius: 999, border: "1.5px solid rgba(251,243,225,0.35)", background: "rgba(251,243,225,0.92)", fontSize: 14, fontFamily: "'PT Sans', sans-serif", color: "#2E2013" },
  chatSendBtn: { width: 40, height: 40, borderRadius: "50%", background: "#C97B3E", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },

  similarSection: { marginTop: 18, paddingTop: 14, borderTop: "1px dashed rgba(251,243,225,0.3)", maxWidth: 1020, marginLeft: "auto", marginRight: "auto" },
  similarTitle: { fontFamily: "'Caveat', cursive", fontSize: 22, color: "#F0E6D2", margin: "0 0 10px", fontWeight: 700 },
  similarRow: { display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 },
  similarCard: { flexShrink: 0, width: 118, cursor: "pointer" },
  similarPhotoWrap: { width: 118, height: 118, borderRadius: 10, background: "#EFE6D2", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" },
  similarPhoto: { width: "100%", height: "100%", objectFit: "contain", display: "block" },
  similarPhotoPlaceholder: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" },
  similarCardTitle: { fontSize: 12, color: "#F0E6D2", fontWeight: 700, margin: "6px 0 2px", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 30 },
  similarCardPrice: { fontSize: 12.5, color: "#F0E6D2", fontWeight: 800, margin: 0 },
};
