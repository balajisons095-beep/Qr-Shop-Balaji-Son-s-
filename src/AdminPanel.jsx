import React, { useState, useEffect, useRef } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

const ADMIN_PASSWORD = "balaji@2024";
const CLOUDINARY_CLOUD_NAME = "dbdeujr2x";
const CLOUDINARY_UPLOAD_PRESET = "balaji-uploads";
const SESSION_KEY = "balaji_admin_auth";
const CATS = ["Snacks", "Drinks", "Grocery", "Dairy", "Bakery", "Other"];
const FALLBACK = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='52' height='52'%3E%3Crect width='52' height='52' rx='12' fill='%23f0fdf4'/%3E%3Ctext x='50%25' y='55%25' font-size='24' text-anchor='middle' dominant-baseline='middle' fill='%2386efac'%3E🛍️%3C/text%3E%3C/svg%3E`;

function Toast({ show, msg, error }) {
  return (
    <div
      className={[
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-[999] pointer-events-none",
        "font-black text-[13px] px-6 py-3.5 rounded-2xl shadow-2xl whitespace-nowrap transition-all duration-300",
        show
          ? "translate-y-0 opacity-100 scale-100"
          : "translate-y-6 opacity-0 scale-95",
        error
          ? "bg-red-500 text-white shadow-red-200"
          : "bg-green-600 text-white shadow-green-200",
      ].join(" ")}
    >
      {msg}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="bg-white border-2 border-green-50 rounded-2xl px-4 py-3.5 flex items-center gap-4 shadow-sm">
      <div className="w-14 h-14 rounded-2xl bg-green-50 animate-pulse flex-shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <div className="h-3.5 w-3/5 rounded-full bg-green-100 animate-pulse" />
        <div className="h-3 w-2/5 rounded-full bg-green-50 animate-pulse" />
      </div>
      <div className="w-10 h-10 rounded-xl bg-red-50 animate-pulse" />
    </div>
  );
}

function StockToggle({ inStock, onChange, disabled }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      title={inStock ? "Mark Out of Stock" : "Mark In Stock"}
      className={[
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none flex-shrink-0",
        inStock ? "bg-green-500" : "bg-gray-300",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-4 w-4 rounded-full bg-white shadow-md transform transition-transform duration-200",
          inStock ? "translate-x-6" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({ product, onClose, onSave, showToast }) {
  const [name, setName] = useState(product.name || "");
  const [price, setPrice] = useState(product.price || "");
  const [category, setCategory] = useState(product.category || CATS[0]);
  const [badge, setBadge] = useState(product.badge || "");
  const [imgUrl, setImgUrl] = useState(product.image || "");
  const [imgFile, setImgFile] = useState(null);
  const [imgPreview, setImgPreview] = useState(product.image || null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  async function compressImage(file) {
    const TARGET_KB = 70;
    const MAX_WIDTH = 500;
    const MIN_QUALITY = 0.25;
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width);
      width = MAX_WIDTH;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    let quality = 0.75;
    let blob;
    do {
      blob = await new Promise((res) =>
        canvas.toBlob(res, "image/jpeg", quality),
      );
      quality = parseFloat((quality - 0.08).toFixed(2));
    } while (blob.size > TARGET_KB * 1024 && quality > MIN_QUALITY);
    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
      type: "image/jpeg",
    });
  }

  async function onFilePick(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Only images allowed!", true);
      return;
    }
    showToast("⚡ Compressing…");
    try {
      const compressed = await compressImage(file);
      setImgFile(compressed);
      setImgPreview(URL.createObjectURL(compressed));
      setImgUrl("");
      showToast(`✅ Image ready!`);
    } catch {
      setImgFile(file);
      setImgPreview(URL.createObjectURL(file));
    }
  }

  async function uploadImageToCloudinary(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    setUploading(true);
    setUploadPct(0);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(
        "POST",
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      );
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          setUploadPct(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        setUploading(false);
        setUploadPct(0);
        if (xhr.status === 200)
          resolve(JSON.parse(xhr.responseText).secure_url);
        else reject(new Error("Upload failed"));
      };
      xhr.onerror = () => {
        setUploading(false);
        reject(new Error("Network error"));
      };
      xhr.send(formData);
    });
  }

  async function handleSave() {
    if (!name.trim() || !price || !category) {
      showToast("Fill Name, Price & Category!", true);
      return;
    }
    setSaving(true);
    try {
      let imageUrl = imgUrl.trim();
      if (imgFile) {
        imageUrl = await uploadImageToCloudinary(imgFile);
      }
      const updated = {
        name: name.trim(),
        price: Number(price),
        category,
        badge: badge.trim() || null,
        image: imageUrl,
      };
      await updateDoc(doc(db, "products", product.id), updated);
      onSave({ ...product, ...updated });
      showToast("✅ Product updated!");
      onClose();
    } catch (e) {
      showToast(`Error: ${e.message}`, true);
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full bg-green-50/60 border-2 border-green-100 focus:border-green-400 focus:bg-white rounded-2xl text-gray-800 text-sm placeholder-gray-400 px-4 py-3.5 outline-none transition-all duration-200 font-semibold";
  const labelCls =
    "text-[10px] font-black tracking-[3px] uppercase text-green-500 mb-2 block";

  return (
    <div className="fixed inset-0 z-[998] flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md bg-white rounded-3xl border-2 border-green-100 flex flex-col max-h-[90vh] overflow-hidden"
        style={{
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          fontFamily: "'Nunito', sans-serif",
        }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b-2 border-green-50 flex-shrink-0">
          <div>
            <p className="font-black text-gray-800 text-base">
              ✏️ Edit Product
            </p>
            <p className="text-[10px] text-gray-400 font-semibold mt-0.5 truncate max-w-[200px]">
              {product.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-2xl bg-gray-100 hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-gray-500 font-black text-lg transition-all"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">
          {/* Name */}
          <div>
            <label className={labelCls}>Product Name *</label>
            <input
              className={inputCls}
              placeholder="e.g. Parle-G Biscuit 400g"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Price + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Price (₹) *</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-yellow-500 font-black text-base">
                  ₹
                </span>
                <input
                  className={inputCls + " pl-8"}
                  placeholder="20"
                  type="number"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={inputCls + " appearance-none cursor-pointer"}
              >
                {CATS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Badge */}
          <div>
            <label className={labelCls}>
              Badge{" "}
              <span className="normal-case tracking-normal font-semibold text-gray-400">
                (optional)
              </span>
            </label>
            <input
              className={inputCls}
              placeholder="Best Seller, New, Spicy 🌶️…"
              value={badge}
              onChange={(e) => setBadge(e.target.value)}
            />
          </div>

          {/* Image */}
          <div>
            <label className={labelCls}>Product Image</label>

            {/* Current image preview */}
            {imgPreview && (
              <div className="relative mb-3 rounded-2xl overflow-hidden border-2 border-green-200">
                <img
                  src={imgPreview}
                  alt="preview"
                  className="w-full h-40 object-cover"
                  onError={(e) => {
                    e.target.src = FALLBACK;
                  }}
                />
                <button
                  onClick={() => {
                    setImgPreview(null);
                    setImgUrl("");
                    setImgFile(null);
                  }}
                  className="absolute top-2 right-2 bg-red-500 text-white text-[11px] font-black rounded-xl px-2.5 py-1"
                >
                  ✕ Remove
                </button>
              </div>
            )}

            <div className="flex gap-2">
              {/* Upload new image */}
              <button
                type="button"
                onClick={() => fileRef.current.click()}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-green-200 bg-green-50/60 hover:border-green-400 text-green-700 text-xs font-black transition-all"
              >
                🖼️ Change Photo
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFilePick}
              />

              {/* Or paste URL */}
              <input
                className="flex-1 bg-green-50/60 border-2 border-green-100 focus:border-green-400 rounded-2xl text-gray-700 text-xs placeholder-gray-400 px-3 py-2 outline-none font-semibold"
                placeholder="🔗 Or paste URL"
                value={imgUrl}
                onChange={(e) => {
                  setImgUrl(e.target.value);
                  setImgFile(null);
                  setImgPreview(e.target.value);
                }}
              />
            </div>

            {uploading && (
              <div className="mt-2">
                <div className="flex justify-between mb-1">
                  <p className="text-[11px] font-bold text-green-600">
                    ☁️ Uploading…
                  </p>
                  <p className="text-[11px] font-black text-green-700">
                    {uploadPct}%
                  </p>
                </div>
                <div className="h-2.5 rounded-full bg-green-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-green-500 to-yellow-400 transition-all duration-200"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 pb-5 pt-3 border-t-2 border-green-50 flex gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 rounded-2xl border-2 border-gray-200 bg-gray-50 text-gray-600 font-black text-sm hover:bg-gray-100 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || uploading}
            className={[
              "flex-2 flex-1 py-3.5 rounded-2xl font-black text-sm transition-all duration-200",
              !saving && !uploading
                ? "bg-gradient-to-r from-green-600 to-green-500 text-white shadow-lg shadow-green-200 hover:from-green-500 hover:to-green-400 active:scale-[0.98]"
                : "bg-green-100 text-green-300 cursor-not-allowed",
            ].join(" ")}
          >
            {saving
              ? "Saving…"
              : uploading
                ? `Uploading ${uploadPct}%…`
                : "💾 Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [pwd, setPwd] = useState("");
  const [show, setShow] = useState(false);
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    const link = document.createElement("link");
    link.href =
      "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Syne:wght@700;800&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  function tryLogin() {
    if (pwd === ADMIN_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, "true");
      onLogin();
    } else {
      setAttempts((a) => a + 1);
      setShake(true);
      setPwd("");
      setTimeout(() => setShake(false), 500);
    }
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-green-50 via-white to-yellow-50 flex flex-col items-center justify-center px-6"
      style={{ fontFamily: "'Nunito', sans-serif" }}
    >
      <div className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-400 via-yellow-400 to-green-500" />
      <div
        className="w-full max-w-sm bg-white rounded-3xl border-2 p-8 flex flex-col items-center gap-5 transition-all duration-200"
        style={{
          borderColor: shake ? "#fca5a5" : "#d1fae5",
          boxShadow: shake
            ? "0 8px 40px rgba(239,68,68,0.15)"
            : "0 8px 40px rgba(22,163,74,0.12)",
          transform: shake ? "translateX(-6px)" : "translateX(0)",
        }}
      >
        <div className="flex flex-col items-center gap-2">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center shadow-xl shadow-green-200">
            <span className="text-4xl">🛒</span>
          </div>
          <div className="text-center">
            <p
              className="font-black text-xl text-gray-800"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              Balaji & Son's
            </p>
            <p className="text-xs text-gray-400 font-semibold mt-0.5">
              Admin Panel 🔐
            </p>
          </div>
        </div>
        <div className="w-full h-px bg-green-100" />
        <div className="w-full flex flex-col gap-1.5">
          <label className="text-[10px] font-black tracking-[3px] uppercase text-green-500">
            Password
          </label>
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              className="w-full bg-green-50 border-2 border-green-100 focus:border-green-400 focus:bg-white rounded-2xl text-gray-800 text-sm placeholder-gray-400 px-4 py-3.5 pr-12 outline-none transition-all font-semibold"
              placeholder="Password daalo…"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tryLogin()}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-lg text-gray-400 hover:text-gray-600 transition-colors"
            >
              {show ? "🙈" : "👁️"}
            </button>
          </div>
          {attempts > 0 && (
            <p className="text-[11px] text-red-500 font-bold text-center mt-1">
              {attempts >= 3
                ? "❌ Bhai sahi password daalo 😅"
                : `❌ Wrong password! (${attempts} try)`}
            </p>
          )}
        </div>
        <button
          onClick={tryLogin}
          disabled={!pwd}
          className={[
            "w-full rounded-2xl py-4 font-black text-base transition-all duration-200",
            pwd
              ? "bg-gradient-to-r from-green-600 to-green-500 text-white shadow-xl shadow-green-200 hover:from-green-500 hover:to-green-400 active:scale-[0.98]"
              : "bg-green-100 text-green-300 cursor-not-allowed",
          ].join(" ")}
        >
          🔓 Login karo
        </button>
        <p className="text-[10px] text-gray-300 font-semibold text-center">
          Sirf shop owner access kar sakta hai
        </p>
      </div>
    </div>
  );
}

// ─── Main AdminPanel ──────────────────────────────────────────────────────────
export default function AdminPanel() {
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === "true",
  );

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState(CATS[0]);
  const [badge, setBadge] = useState("");
  const [imgMode, setImgMode] = useState("camera");
  const [imgUrl, setImgUrl] = useState("");
  const [imgFile, setImgFile] = useState(null);
  const [imgPreview, setImgPreview] = useState(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [inStock, setInStock] = useState(true);

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const [toast, setToast] = useState({ show: false, msg: "", error: false });
  const [searchAdmin, setSearchAdmin] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null); // ← NEW

  const cameraRef = useRef();
  const galleryRef = useRef();

  useEffect(() => {
    if (!isLoggedIn) return;
    const link = document.createElement("link");
    link.href =
      "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Syne:wght@700;800&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    fetchProducts();
  }, [isLoggedIn]);

  if (!isLoggedIn) return <LoginScreen onLogin={() => setIsLoggedIn(true)} />;

  async function fetchProducts() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "products"));
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      showToast("Failed to load products", true);
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg, error = false) {
    setToast({ show: true, msg, error });
    setTimeout(() => setToast({ show: false, msg: "", error: false }), 2800);
  }

  function handleLogout() {
    sessionStorage.removeItem(SESSION_KEY);
    setIsLoggedIn(false);
    setProducts([]);
  }

  async function compressImage(file) {
    const TARGET_KB = 70,
      MAX_WIDTH = 500,
      MIN_QUALITY = 0.25;
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width);
      width = MAX_WIDTH;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    let quality = 0.75,
      blob;
    do {
      blob = await new Promise((res) =>
        canvas.toBlob(res, "image/jpeg", quality),
      );
      quality = parseFloat((quality - 0.08).toFixed(2));
    } while (blob.size > TARGET_KB * 1024 && quality > MIN_QUALITY);
    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
      type: "image/jpeg",
    });
  }

  async function onFilePick(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Only images allowed!", true);
      return;
    }
    const originalKB = Math.round(file.size / 1024);
    showToast("⚡ Compressing…");
    try {
      const compressed = await compressImage(file);
      const compressedKB = Math.round(compressed.size / 1024);
      setImgFile(compressed);
      setImgPreview(URL.createObjectURL(compressed));
      showToast(`✅ ${originalKB}KB → ${compressedKB}KB — Ready!`);
    } catch {
      setImgFile(file);
      setImgPreview(URL.createObjectURL(file));
      showToast("⚠️ Compression skip, using original");
    }
  }

  async function uploadImageToCloudinary(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    setUploading(true);
    setUploadPct(0);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(
        "POST",
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      );
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          setUploadPct(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        setUploading(false);
        setUploadPct(0);
        if (xhr.status === 200)
          resolve(JSON.parse(xhr.responseText).secure_url);
        else reject(new Error("Cloudinary upload failed"));
      };
      xhr.onerror = () => {
        setUploading(false);
        reject(new Error("Network error during upload"));
      };
      xhr.send(formData);
    });
  }

  async function addProduct() {
    if (!name.trim() || !price || !category) {
      showToast("Fill Name, Price & Category!", true);
      return;
    }
    setAdding(true);
    try {
      let imageUrl = "";
      if (imgMode === "url" && imgUrl.trim()) imageUrl = imgUrl.trim();
      else if ((imgMode === "camera" || imgMode === "gallery") && imgFile)
        imageUrl = await uploadImageToCloudinary(imgFile);
      const newProduct = {
        name: name.trim(),
        price: Number(price),
        image: imageUrl,
        category,
        badge: badge.trim() || null,
        inStock,
      };
      const docRef = await addDoc(collection(db, "products"), newProduct);
      setProducts((prev) => [{ id: docRef.id, ...newProduct }, ...prev]);
      setName("");
      setPrice("");
      setBadge("");
      setCategory(CATS[0]);
      setImgUrl("");
      setImgFile(null);
      setImgPreview(null);
      setInStock(true);
      setImgMode("camera");
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
      showToast("✅ Product added!");
    } catch (e) {
      showToast(`Error: ${e.message}`, true);
    } finally {
      setAdding(false);
    }
  }

  async function deleteProduct(id) {
    setConfirmDeleteId(null);
    try {
      await deleteDoc(doc(db, "products", id));
      setProducts((prev) => prev.filter((p) => p.id !== id));
      showToast("🗑️ Product deleted");
    } catch {
      showToast("Error deleting", true);
    }
  }

  async function toggleStock(product) {
    setTogglingId(product.id);
    const newStock = product.inStock === false ? true : false;
    try {
      await updateDoc(doc(db, "products", product.id), { inStock: newStock });
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id ? { ...p, inStock: newStock } : p,
        ),
      );
      showToast(newStock ? "✅ Marked In Stock" : "❌ Marked Out of Stock");
    } catch {
      showToast("Error updating stock", true);
    } finally {
      setTogglingId(null);
    }
  }

  // ← NEW: handle save from edit modal
  function handleEditSave(updatedProduct) {
    setProducts((prev) =>
      prev.map((p) => (p.id === updatedProduct.id ? updatedProduct : p)),
    );
  }

  const isValid = name.trim() && price && category;
  const btnLabel = uploading
    ? `Uploading ${uploadPct}%…`
    : adding
      ? "Adding…"
      : "＋ Add Product";
  const filteredAdmin = products.filter((p) =>
    p.name?.toLowerCase().includes(searchAdmin.toLowerCase()),
  );
  const inStockCount = products.filter((p) => p.inStock !== false).length;
  const inputCls =
    "w-full bg-green-50/60 border-2 border-green-100 focus:border-green-400 focus:bg-white rounded-2xl text-gray-800 text-sm placeholder-gray-400 px-4 py-3.5 outline-none transition-all duration-200 font-semibold";
  const labelCls =
    "text-[10px] font-black tracking-[3px] uppercase text-green-500 mb-2 block";

  return (
    <div
      className="min-h-screen bg-gray-50/50"
      style={{ fontFamily: "'Nunito', sans-serif" }}
    >
      <div className="h-1 w-full bg-gradient-to-r from-green-400 via-yellow-400 to-green-500" />

      {/* Edit Modal */}
      {editingProduct && (
        <EditModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSave={handleEditSave}
          showToast={showToast}
        />
      )}

      {/* Header */}
      <header
        className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b-2 border-green-100"
        style={{ boxShadow: "0 2px 20px rgba(22,163,74,0.08)" }}
      >
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Balaji & Son's"
              className="h-11 w-auto object-contain"
              onError={(e) => {
                e.target.style.display = "none";
                document.getElementById("alogo").style.display = "flex";
              }}
            />
            <div id="alogo" className="hidden items-center gap-2">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center shadow-md shadow-green-200">
                <span className="text-xl">🛒</span>
              </div>
              <div>
                <p
                  className="font-black text-green-700 text-sm leading-none"
                  style={{ fontFamily: "'Syne', sans-serif" }}
                >
                  Patanjali
                </p>
                <p
                  className="font-black text-gray-800 text-sm leading-none"
                  style={{ fontFamily: "'Syne', sans-serif" }}
                >
                  Balaji & Son's
                </p>
              </div>
            </div>
            <span className="text-[9px] font-black tracking-widest uppercase text-red-500 bg-red-50 border-2 border-red-100 px-2.5 py-0.5 rounded-full">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-green-600">
                {loading ? "..." : `${inStockCount}/${products.length}`}
              </span>
              <span className="text-[9px] text-gray-400 font-bold">
                In Stock
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="ml-1 text-[10px] font-black text-gray-500 bg-gray-100 hover:bg-red-50 hover:text-red-500 border-2 border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-xl transition-all duration-200"
            >
              🚪 Logout
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Add Product */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 rounded-full bg-gradient-to-b from-green-500 to-green-300" />
            <p className={labelCls} style={{ marginBottom: 0 }}>
              Add New Product
            </p>
          </div>
          <div
            className="bg-white border-2 border-green-100 rounded-3xl p-5 flex flex-col gap-4"
            style={{ boxShadow: "0 4px 24px rgba(22,163,74,0.08)" }}
          >
            <div>
              <label className={labelCls} htmlFor="p-name">
                Product Name *
              </label>
              <input
                id="p-name"
                className={inputCls}
                placeholder="e.g. Parle-G Biscuit 400g"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="p-price">
                  Price (₹) *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-yellow-500 font-black text-base">
                    ₹
                  </span>
                  <input
                    id="p-price"
                    className={inputCls + " pl-8"}
                    placeholder="20"
                    type="number"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="p-cat">
                  Category *
                </label>
                <select
                  id="p-cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={inputCls + " appearance-none cursor-pointer"}
                >
                  {CATS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between bg-green-50/60 border-2 border-green-100 rounded-2xl px-4 py-3">
              <div>
                <p className="text-xs font-black text-gray-700">
                  In Stock when adding?
                </p>
                <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                  Customer ko dikhega:{" "}
                  {inStock ? "✅ Available" : "❌ Out of Stock"}
                </p>
              </div>
              <StockToggle
                inStock={inStock}
                onChange={() => setInStock(!inStock)}
                disabled={false}
              />
            </div>

            {/* Image */}
            <div>
              <label className={labelCls}>Product Image</label>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  {
                    key: "camera",
                    icon: "📸",
                    line1: "Camera",
                    line2: "Abhi photo lo",
                  },
                  {
                    key: "gallery",
                    icon: "🖼️",
                    line1: "Gallery",
                    line2: "Purani photo",
                  },
                  {
                    key: "url",
                    icon: "🔗",
                    line1: "URL",
                    line2: "Link paste karo",
                  },
                ].map(({ key, icon, line1, line2 }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setImgMode(key);
                      setImgPreview(null);
                      setImgFile(null);
                      setImgUrl("");
                    }}
                    className={[
                      "flex flex-col items-center justify-center gap-1 py-3 rounded-2xl border-2 transition-all duration-200",
                      imgMode === key
                        ? "bg-green-600 border-green-600 text-white shadow-lg shadow-green-200"
                        : "bg-green-50/60 border-green-100 text-gray-500 hover:border-green-300",
                    ].join(" ")}
                  >
                    <span className="text-xl leading-none">{icon}</span>
                    <span className="text-[11px] font-black leading-none">
                      {line1}
                    </span>
                    <span
                      className={[
                        "text-[9px] font-semibold leading-none",
                        imgMode === key ? "text-green-100" : "text-gray-400",
                      ].join(" ")}
                    >
                      {line2}
                    </span>
                  </button>
                ))}
              </div>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onFilePick}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFilePick}
              />
              {(imgMode === "camera" || imgMode === "gallery") && (
                <>
                  <div
                    onClick={() =>
                      imgMode === "camera"
                        ? cameraRef.current.click()
                        : galleryRef.current.click()
                    }
                    className={[
                      "relative border-2 rounded-2xl cursor-pointer transition-all duration-200",
                      imgPreview
                        ? "border-green-300 overflow-hidden"
                        : "border-dashed border-green-200 bg-green-50/40 hover:border-green-400 flex flex-col items-center justify-center py-10",
                    ].join(" ")}
                  >
                    {imgPreview ? (
                      <>
                        <img
                          src={imgPreview}
                          alt="preview"
                          className="w-full h-48 object-cover block"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            imgMode === "camera"
                              ? cameraRef.current.click()
                              : galleryRef.current.click();
                          }}
                          className="absolute bottom-3 right-3 bg-white text-gray-700 text-[11px] font-bold border-2 border-green-200 rounded-xl px-3 py-1.5 shadow-md"
                        >
                          {imgMode === "camera" ? "📸 Retake" : "🖼️ Change"}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setImgPreview(null);
                            setImgFile(null);
                          }}
                          className="absolute top-3 right-3 bg-red-500 text-white text-[11px] font-bold rounded-xl px-2.5 py-1 shadow-md"
                        >
                          ✕
                        </button>
                      </>
                    ) : imgMode === "camera" ? (
                      <>
                        <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mb-3">
                          <span className="text-3xl">📸</span>
                        </div>
                        <p className="text-sm font-black text-gray-700">
                          Tap to Open Camera
                        </p>
                        <p className="text-xs text-gray-400 mt-1 font-semibold">
                          Product ki photo seedhi lo 🔥
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mb-3">
                          <span className="text-3xl">🖼️</span>
                        </div>
                        <p className="text-sm font-black text-gray-700">
                          Tap to Open Gallery
                        </p>
                        <p className="text-xs text-gray-400 mt-1 font-semibold">
                          Phone se photo choose karo ✅
                        </p>
                      </>
                    )}
                  </div>
                  {uploading && (
                    <div className="mt-3">
                      <div className="flex justify-between mb-1">
                        <p className="text-[11px] font-bold text-green-600">
                          ☁️ Cloudinary pe upload ho raha hai…
                        </p>
                        <p className="text-[11px] font-black text-green-700">
                          {uploadPct}%
                        </p>
                      </div>
                      <div className="h-2.5 rounded-full bg-green-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-green-500 to-yellow-400 transition-all duration-200"
                          style={{ width: `${uploadPct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
              {imgMode === "url" && (
                <div className="flex gap-3 items-center">
                  <input
                    className={inputCls + " flex-1"}
                    placeholder="https://… paste image link"
                    value={imgUrl}
                    onChange={(e) => setImgUrl(e.target.value)}
                  />
                  {imgUrl && (
                    <img
                      src={imgUrl}
                      alt="preview"
                      className="w-14 h-14 rounded-2xl object-cover border-2 border-green-200 bg-green-50 flex-shrink-0"
                      onError={(e) => {
                        e.target.src = FALLBACK;
                      }}
                    />
                  )}
                </div>
              )}
            </div>

            <div>
              <label className={labelCls} htmlFor="p-badge">
                Badge{" "}
                <span className="normal-case tracking-normal font-semibold text-gray-400">
                  (optional)
                </span>
              </label>
              <input
                id="p-badge"
                className={inputCls}
                placeholder="Best Seller, New, Spicy 🌶️…"
                value={badge}
                onChange={(e) => setBadge(e.target.value)}
              />
            </div>
            <button
              onClick={addProduct}
              disabled={!isValid || adding || uploading}
              className={[
                "w-full rounded-2xl py-4 font-black text-base flex items-center justify-center gap-2 transition-all duration-200",
                isValid && !adding && !uploading
                  ? "bg-gradient-to-r from-green-600 to-green-500 text-white shadow-xl shadow-green-200 hover:from-green-500 hover:to-green-400 active:scale-[0.98]"
                  : "bg-green-100 text-green-300 cursor-not-allowed",
              ].join(" ")}
            >
              {btnLabel}
            </button>
          </div>
        </section>

        {/* Product List */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 rounded-full bg-gradient-to-b from-yellow-400 to-yellow-300" />
            <p className={labelCls} style={{ marginBottom: 0 }}>
              Manage Products
            </p>
            {!loading && products.length > 0 && (
              <span className="ml-auto text-[10px] font-black text-green-600 bg-green-50 border-2 border-green-100 px-2 py-0.5 rounded-full">
                {products.length} total · {inStockCount} in stock
              </span>
            )}
          </div>

          {!loading && products.length > 3 && (
            <div className="relative mb-3">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                🔍
              </span>
              <input
                className="w-full bg-white border-2 border-green-100 focus:border-green-300 rounded-2xl text-gray-700 text-sm placeholder-gray-400 pl-9 pr-4 py-2.5 outline-none transition-all font-semibold"
                placeholder="Search products…"
                value={searchAdmin}
                onChange={(e) => setSearchAdmin(e.target.value)}
              />
            </div>
          )}

          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center py-14 bg-white rounded-3xl border-2 border-green-100">
              <span className="text-5xl mb-3">📦</span>
              <p className="text-sm font-bold text-gray-500">No products yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Add your first product above!
              </p>
            </div>
          ) : filteredAdmin.length === 0 ? (
            <div className="flex flex-col items-center py-10 bg-white rounded-3xl border-2 border-green-100">
              <span className="text-4xl mb-2">🔍</span>
              <p className="text-sm font-bold text-gray-500">
                No results for "{searchAdmin}"
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredAdmin.map((p) => (
                <div
                  key={p.id}
                  className={[
                    "bg-white border-2 rounded-2xl px-4 py-3.5 flex items-center gap-3 transition-all duration-200",
                    p.inStock === false
                      ? "border-red-100 opacity-80"
                      : "border-green-100 hover:border-green-300",
                  ].join(" ")}
                  style={{ boxShadow: "0 2px 12px rgba(22,163,74,0.06)" }}
                >
                  <div className="relative flex-shrink-0">
                    <img
                      className={[
                        "w-14 h-14 rounded-2xl object-cover bg-green-50 border-2",
                        p.inStock === false
                          ? "border-red-100 grayscale"
                          : "border-green-100",
                      ].join(" ")}
                      src={p.image || FALLBACK}
                      alt={p.name}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = FALLBACK;
                      }}
                    />
                    <span
                      className={[
                        "absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white",
                        p.inStock === false ? "bg-red-400" : "bg-green-500",
                      ].join(" ")}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm text-gray-800 truncate mb-1">
                      {p.name}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-[14px] text-yellow-500">
                        ₹{p.price}
                      </span>
                      <span className="text-[9px] text-green-700 bg-green-50 border-2 border-green-100 px-2 py-0.5 rounded-full uppercase font-black tracking-wider">
                        {p.category}
                      </span>
                      {p.badge && (
                        <span className="text-[9px] text-gray-900 bg-yellow-400 px-2 py-0.5 rounded-full uppercase font-black">
                          {p.badge}
                        </span>
                      )}
                    </div>
                    <p
                      className={[
                        "text-[10px] font-black mt-1",
                        p.inStock === false ? "text-red-400" : "text-green-500",
                      ].join(" ")}
                    >
                      {p.inStock === false ? "❌ Out of Stock" : "✅ In Stock"}
                    </p>
                  </div>

                  <StockToggle
                    inStock={p.inStock !== false}
                    onChange={() => toggleStock(p)}
                    disabled={togglingId === p.id}
                  />

                  {/* ✏️ EDIT BUTTON — NEW */}
                  <button
                    onClick={() => setEditingProduct(p)}
                    className="text-blue-400 bg-blue-50 border-2 border-blue-100 hover:bg-blue-500 hover:text-white hover:border-blue-500 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 flex-shrink-0"
                    title="Edit product"
                  >
                    ✏️
                  </button>

                  {confirmDeleteId === p.id ? (
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => deleteProduct(p.id)}
                        className="bg-red-500 text-white text-[10px] font-black px-2.5 py-1.5 rounded-xl"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="bg-gray-100 text-gray-600 text-[10px] font-black px-2.5 py-1.5 rounded-xl"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(p.id)}
                      className="text-red-400 bg-red-50 border-2 border-red-100 hover:bg-red-500 hover:text-white hover:border-red-500 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 flex-shrink-0"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <Toast {...toast} />
    </div>
  );
}
