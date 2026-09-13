import { useState } from "react";
import { X, Mail, Phone as PhoneIcon, UserRound } from "lucide-react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  updateProfile,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase.js";
 
function firebaseErrorText(code) {
  const map = {
    "auth/invalid-email": "Некорректный email.",
    "auth/user-not-found": "Пользователь с таким email не найден.",
    "auth/wrong-password": "Неверный пароль.",
    "auth/invalid-credential": "Неверный email или пароль.",
    "auth/email-already-in-use": "Такой email уже зарегистрирован.",
    "auth/weak-password": "Пароль должен быть не короче 6 символов.",
    "auth/invalid-phone-number": "Некорректный номер. Пример: +79991234567",
    "auth/too-many-requests": "Слишком много попыток. Попробуй чуть позже.",
    "auth/invalid-verification-code": "Неверный код из СМС.",
    "auth/popup-closed-by-user": "Окно входа закрыто раньше времени.",
  };
  return map[code] || "Что-то пошло не так. Попробуй ещё раз.";
}
 
export default function AuthModal({ onClose }) {
  const [method, setMethod] = useState("email");
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
 
  async function handleEmailSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) {
          await updateProfile(cred.user, { displayName: name.trim() });
        }
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      onClose();
    } catch (err) {
      setError(firebaseErrorText(err.code));
    } finally {
      setBusy(false);
    }
  }
 
  async function handleGoogle() {
    setError("");
    setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (err) {
      setError(firebaseErrorText(err.code));
    } finally {
      setBusy(false);
    }
  }
 
  function setupRecaptcha() {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
        size: "invisible",
      });
    }
    return window.recaptchaVerifier;
  }
 
  async function handleSendCode(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const verifier = setupRecaptcha();
      const result = await signInWithPhoneNumber(auth, phone.trim(), verifier);
      setConfirmation(result);
    } catch (err) {
      setError(firebaseErrorText(err.code));
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }
    } finally {
      setBusy(false);
    }
  }
 
  async function handleConfirmCode(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await confirmation.confirm(code.trim());
      onClose();
    } catch (err) {
      setError(firebaseErrorText(err.code));
    } finally {
      setBusy(false);
    }
  }
 
  return (
    <div style={st.overlay} onClick={onClose}>
      <div style={st.card} onClick={(e) => e.stopPropagation()}>
        <div style={st.header}>
          <h2 style={st.title}>
            {method === "email" && mode === "register" ? "Регистрация" : "Вход на доску"}
          </h2>
          <button type="button" style={st.closeBtn} onClick={onClose} aria-label="Закрыть">
            <X size={18} color="#5A4029" />
          </button>
        </div>
 
        <div style={st.tabs}>
          <button
            type="button"
            style={{ ...st.tab, ...(method === "email" ? st.tabActive : {}) }}
            onClick={() => { setMethod("email"); setError(""); }}
          >
            <Mail size={14} style={{ marginRight: 5, verticalAlign: "-2px" }} />
            Почта
          </button>
          <button
            type="button"
            style={{ ...st.tab, ...(method === "phone" ? st.tabActive : {}) }}
            onClick={() => { setMethod("phone"); setError(""); setConfirmation(null); }}
          >
            <PhoneIcon size={14} style={{ marginRight: 5, verticalAlign: "-2px" }} />
            Телефон
          </button>
        </div>
 
        {method === "email" && (
          <form onSubmit={handleEmailSubmit}>
            {mode === "register" && (
              <>
                <label style={st.label}>Имя</label>
                <input style={st.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Как к тебе обращаться" />
              </>
            )}
            <label style={st.label}>Email</label>
            <input style={st.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@mail.ru" required />
            <label style={st.label}>Пароль</label>
            <input style={st.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Минимум 6 символов" required minLength={6} />
            {error && <p style={st.error}>{error}</p>}
            <button type="submit" style={st.submitBtn} disabled={busy}>
              {busy ? "Секунду…" : mode === "register" ? "Зарегистрироваться" : "Войти"}
            </button>
            <p style={st.switchLine}>
              {mode === "register" ? "Уже есть аккаунт?" : "Ещё нет аккаунта?"}{" "}
              <button
                type="button"
                style={st.switchBtn}
                onClick={() => { setMode(mode === "register" ? "login" : "register"); setError(""); }}
              >
                {mode === "register" ? "Войти" : "Зарегистрироваться"}
              </button>
            </p>
          </form>
        )}
 
        {method === "phone" && !confirmation && (
          <form onSubmit={handleSendCode}>
            <label style={st.label}>Номер телефона</label>
            <input style={st.input} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+79991234567" required />
            {error && <p style={st.error}>{error}</p>}
            <button type="submit" style={st.submitBtn} disabled={busy}>
              {busy ? "Отправляем…" : "Получить код"}
            </button>
          </form>
        )}
 
        {method === "phone" && confirmation && (
          <form onSubmit={handleConfirmCode}>
            <label style={st.label}>Код из СМС</label>
            <input style={st.input} value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" inputMode="numeric" required />
            {error && <p style={st.error}>{error}</p>}
            <button type="submit" style={st.submitBtn} disabled={busy}>
              {busy ? "Проверяем…" : "Подтвердить"}
            </button>
          </form>
        )}
 
        <div style={st.divider}>
          <span style={st.dividerLine} />
          <span style={st.dividerText}>или</span>
          <span style={st.dividerLine} />
        </div>
 
        <button type="button" style={st.googleBtn} onClick={handleGoogle} disabled={busy}>
          <UserRound size={15} style={{ marginRight: 6, verticalAlign: "-3px" }} />
          Войти через Google
        </button>
 
        <div id="recaptcha-container" />
      </div>
    </div>
  );
}
 
const st = {
  overlay: { position: "fixed", inset: 0, background: "rgba(20,12,4,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20, padding: 16 },
  card: { background: "#FBF3E1", width: "100%", maxWidth: 380, borderRadius: 16, padding: "18px 20px 22px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { fontFamily: "'Caveat', cursive", fontSize: 26, color: "#3A2A18", margin: 0, fontWeight: 700 },
  closeBtn: { background: "transparent", border: "none", cursor: "pointer", padding: 4 },
  tabs: { display: "flex", gap: 8, marginBottom: 14 },
  tab: { flex: 1, padding: "8px 10px", borderRadius: 8, border: "1.5px solid #D9C9AE", background: "#fff", color: "#6B5A45", fontSize: 13.5, fontWeight: 700, cursor: "pointer", textAlign: "center" },
  tabActive: { background: "#C97B3E", color: "#FBF3E1", borderColor: "#C97B3E" },
  label: { display: "block", fontSize: 12.5, color: "#6B5A45", margin: "10px 0 4px", fontWeight: 700 },
  input: { width: "100%", padding: "9px 11px", borderRadius: 8, border: "1.5px solid #D9C9AE", background: "#fff", fontSize: 14.5, fontFamily: "'PT Sans', sans-serif", color: "#2E2013" },
  error: { color: "#C94F4F", fontSize: 12.5, margin: "8px 0 0" },
  submitBtn: { width: "100%", marginTop: 14, padding: "11px", borderRadius: 10, border: "none", background: "#C97B3E", color: "#FBF3E1", fontSize: 14.5, fontWeight: 700, cursor: "pointer" },
  switchLine: { textAlign: "center", fontSize: 12.5, color: "#6B5A45", marginTop: 10 },
  switchBtn: { background: "transparent", border: "none", color: "#C97B3E", fontWeight: 700, cursor: "pointer", fontSize: 12.5, padding: 0 },
  divider: { display: "flex", alignItems: "center", gap: 10, margin: "16px 0 12px" },
  dividerLine: { flex: 1, height: 1, background: "#D9C9AE" },
  dividerText: { fontSize: 12, color: "#8a7a63" },
  googleBtn: { width: "100%", padding: "10px", borderRadius: 10, border: "1.5px solid #D9C9AE", background: "#fff", color: "#3A2A18", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
};
