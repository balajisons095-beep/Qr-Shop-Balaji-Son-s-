import React, { useEffect, useState, useCallback } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";

// ─── Demo data (shown if Firestore is empty/unreachable) ────────────────────
const DEMO_PRODUCTS = [
  {
    id: 1,
    name: "Parle-G Biscuit",
    price: 10,
    image: "https://m.media-amazon.com/images/I/71i4GZYrFIL.jpg",
    category: "Snacks",
    badge: "Best Seller",
    inStock: true,
  },
  {
    id: 2,
    name: "Lays Classic Salted",
    price: 20,
    image: "https://m.media-amazon.com/images/I/71Kp8LfGTeL.jpg",
    category: "Snacks",
    badge: null,
    inStock: true,
  },
  {
    id: 3,
    name: "Coca-Cola 500ml",
    price: 40,
    image: "https://m.media-amazon.com/images/I/61OmS6xjV0L.jpg",
    category: "Drinks",
    badge: "Chilled ❄️",
    inStock: false,
  },
  {
    id: 4,
    name: "Basmati Rice 1kg",
    price: 90,
    image: "https://m.media-amazon.com/images/I/71LJwuKh1eL.jpg",
    category: "Grocery",
    badge: null,
    inStock: true,
  },
  {
    id: 5,
    name: "Kurkure Masala",
    price: 15,
    image: "https://m.media-amazon.com/images/I/81MHFidMZkL.jpg",
    category: "Snacks",
    badge: "Spicy 🌶️",
    inStock: true,
  },
  {
    id: 6,
    name: "Frooti Mango 200ml",
    price: 15,
    image: "https://m.media-amazon.com/images/I/616UGMHhGPL.jpg",
    category: "Drinks",
    badge: null,
    inStock: false,
  },
];

const CATEGORIES = ["All", "Snacks", "Drinks", "Grocery", "Dairy", "Bakery"];
const CAT_ICONS = {
  All: "🛒",
  Snacks: "🍟",
  Drinks: "🥤",
  Grocery: "🌾",
  Dairy: "🥛",
  Bakery: "🍞",
};

// ─── Image proxy for external URLs ─────────────────────────────────────────
function proxyImg(url) {
  if (!url) return null;
  if (url.startsWith("data:") || url.includes("firebasestorage")) return url;
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=400&h=400&fit=cover&output=webp`;
}

function proxyImgLarge(url) {
  if (!url) return null;
  if (url.startsWith("data:") || url.includes("firebasestorage")) return url;
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=900&h=900&fit=cover&output=webp`;
}

const FALLBACK = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Crect width='300' height='300' fill='%23f0fdf4'/%3E%3Ctext x='50%25' y='50%25' font-size='60' text-anchor='middle' dominant-baseline='middle' fill='%2386efac'%3E🛍️%3C/text%3E%3C/svg%3E`;

// ─── Skeleton card ──────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-3xl overflow-hidden bg-white border border-green-100 shadow-md">
      <div className="aspect-square bg-gradient-to-br from-green-50 to-green-100 animate-pulse" />
      <div className="p-4 flex flex-col gap-2.5">
        <div className="h-3.5 rounded-full bg-green-100 animate-pulse" />
        <div className="h-3 rounded-full bg-green-50 animate-pulse w-2/3" />
        <div className="flex justify-between items-center mt-1">
          <div className="h-5 w-16 rounded-full bg-yellow-100 animate-pulse" />
          <div className="h-5 w-20 rounded-full bg-green-100 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// ─── Availability badge ─────────────────────────────────────────────────────
function StockBadge({ inStock }) {
  if (inStock === false) {
    return (
      <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-500">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
        Out of Stock
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-green-600">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
      In Stock
    </span>
  );
}

// ─── Image Lightbox Modal ───────────────────────────────────────────────────
function ImageLightbox({ product, onClose }) {
  const [imgErr, setImgErr] = useState(false);
  const isOutOfStock = product.inStock === false;

  const phone = "919561300085";
  const waMsg = encodeURIComponent(
    `Hi! Is "${product.name}" available? Price shown: ₹${product.price}`,
  );
  const waUrl = `https://wa.me/${phone}?text=${waMsg}`;

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ animation: "fadeIn 0.2s ease" }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal card */}
      <div
        className="relative bg-white rounded-3xl overflow-hidden shadow-2xl w-full max-w-sm mx-auto flex flex-col"
        style={{
          animation: "scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1)",
          maxHeight: "90vh",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 bg-white/90 backdrop-blur-sm text-gray-700 w-9 h-9 rounded-full flex items-center justify-center text-lg font-black shadow-md hover:bg-gray-100 transition-all"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Badge */}
        {product.badge && !isOutOfStock && (
          <span className="absolute top-3 left-3 z-10 bg-yellow-400 text-gray-900 text-[9px] font-black px-2.5 py-1 rounded-full tracking-wider uppercase shadow-lg shadow-yellow-200">
            {product.badge}
          </span>
        )}

        {/* Large image */}
        <div
          className={[
            "relative w-full",
            isOutOfStock
              ? "bg-gray-100"
              : "bg-gradient-to-br from-green-50 to-emerald-50",
          ].join(" ")}
          style={{ aspectRatio: "1/1" }}
        >
          <img
            src={imgErr ? FALLBACK : proxyImgLarge(product.image)}
            alt={product.name}
            className={[
              "w-full h-full object-contain p-4 transition-all duration-300",
              isOutOfStock ? "grayscale opacity-60" : "",
            ].join(" ")}
            onError={() => setImgErr(true)}
          />

          {/* Out of stock overlay */}
          {isOutOfStock && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-red-500 text-white text-sm font-black px-5 py-2 rounded-full uppercase tracking-widest shadow-lg rotate-[-6deg]">
                Unavailable
              </span>
            </div>
          )}
        </div>

        {/* Info section */}
        <div className="p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <p
              className="text-lg font-black text-gray-800 leading-snug"
              style={{ fontFamily: "'Nunito', sans-serif" }}
            >
              {product.name}
            </p>
            <StockBadge inStock={product.inStock} />
          </div>

          <div className="flex items-center justify-between">
            {/* Price */}
            <div className="flex items-baseline gap-0.5">
              <span
                className={
                  isOutOfStock
                    ? "text-sm text-gray-400 font-bold"
                    : "text-sm text-yellow-500 font-bold"
                }
              >
                ₹
              </span>
              <span
                className={[
                  "font-black text-3xl leading-none",
                  isOutOfStock ? "text-gray-400" : "text-green-700",
                ].join(" ")}
                style={{ fontFamily: "'Nunito', sans-serif" }}
              >
                {product.price}
              </span>
            </div>

            {/* Category */}
            <span className="text-[10px] text-green-600 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full uppercase tracking-wider font-bold">
              {product.category}
            </span>
          </div>

          {/* WhatsApp button */}
          {!isOutOfStock && (
            <a
              href={waUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white font-black text-sm px-5 py-3 rounded-2xl transition-all duration-200 shadow-lg shadow-green-200 active:scale-95"
            >
              💬 Ask on WhatsApp
            </a>
          )}

          {isOutOfStock && (
            <div className="mt-1 flex items-center justify-center gap-2 bg-gray-100 text-gray-400 font-black text-sm px-5 py-3 rounded-2xl">
              😔 Currently Unavailable
            </div>
          )}
        </div>
      </div>

      {/* Keyframe styles */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.85) } to { opacity: 1; transform: scale(1) } }
      `}</style>
    </div>
  );
}

// ─── Product card ───────────────────────────────────────────────────────────
function ProductCard({ p, index, onOpenLightbox }) {
  const [imgErr, setImgErr] = useState(false);
  const isOutOfStock = p.inStock === false;

  const phone = "919999999999"; // 🔁 Balaji & Sons ka WhatsApp number yahan daalo
  const waMsg = encodeURIComponent(
    `Hi! Is "${p.name}" available? Price shown: ₹${p.price}`,
  );
  const waUrl = `https://wa.me/${phone}?text=${waMsg}`;

  return (
    <div
      className={[
        "group rounded-3xl overflow-hidden bg-white border flex flex-col transition-all duration-300",
        isOutOfStock
          ? "border-gray-100 opacity-75"
          : "border-green-100 hover:border-green-300 cursor-pointer hover:-translate-y-1.5 hover:shadow-[0_20px_48px_rgba(22,163,74,0.16)]",
      ].join(" ")}
      style={{
        boxShadow: "0 2px 12px rgba(22,163,74,0.07)",
        animationDelay: `${index * 60}ms`,
      }}
      onClick={() => onOpenLightbox(p)}
    >
      {/* Image */}
      <div
        className={[
          "relative overflow-hidden",
          isOutOfStock
            ? "bg-gray-50"
            : "bg-gradient-to-br from-green-50 to-emerald-50",
        ].join(" ")}
        style={{ aspectRatio: "1/1" }}
      >
        <img
          className={[
            "w-full h-full object-cover transition-transform duration-500",
            isOutOfStock ? "grayscale" : "group-hover:scale-110",
          ].join(" ")}
          src={imgErr ? FALLBACK : proxyImg(p.image)}
          alt={p.name}
          loading="lazy"
          onError={() => setImgErr(true)}
        />

        {/* Hover overlay */}
        {!isOutOfStock && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        )}

        {/* Tap to zoom hint */}
        {!isOutOfStock && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-[8px] font-bold px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            🔍 Tap to zoom
          </div>
        )}

        {/* Out of Stock overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-white/40 flex items-center justify-center">
            <span className="bg-red-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-lg rotate-[-8deg]">
              Unavailable
            </span>
          </div>
        )}

        {/* Badge */}
        {p.badge && !isOutOfStock && (
          <span className="absolute top-2.5 left-2.5 bg-yellow-400 text-gray-900 text-[9px] font-black px-2.5 py-1 rounded-full tracking-wider uppercase shadow-lg shadow-yellow-200">
            {p.badge}
          </span>
        )}

        {/* WhatsApp enquiry button (only on available items) */}
        {!isOutOfStock && (
          <a
            href={waUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-2.5 right-2.5 bg-[#25D366] text-white w-9 h-9 rounded-full flex items-center justify-center text-base shadow-lg opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 hover:bg-[#1ebe5d]"
            title="Ask on WhatsApp"
          >
            💬
          </a>
        )}
      </div>

      {/* Body */}
      <div className="p-3.5 flex flex-col gap-1.5 flex-1 justify-between">
        <p
          className={[
            "text-sm font-bold leading-snug line-clamp-2",
            isOutOfStock ? "text-gray-400" : "text-gray-800",
          ].join(" ")}
          style={{ fontFamily: "'Nunito', sans-serif" }}
        >
          {p.name}
        </p>

        <div className="flex items-center justify-between mt-1 gap-1 flex-wrap">
          {/* Price */}
          <div className="flex items-baseline gap-0.5">
            <span
              className={
                isOutOfStock
                  ? "text-xs text-gray-400 font-bold"
                  : "text-xs text-yellow-500 font-bold"
              }
            >
              ₹
            </span>
            <span
              className={[
                "font-black text-xl leading-none",
                isOutOfStock ? "text-gray-400" : "text-green-700",
              ].join(" ")}
              style={{ fontFamily: "'Nunito', sans-serif" }}
            >
              {p.price}
            </span>
          </div>

          {/* Stock status */}
          <StockBadge inStock={p.inStock} />
        </div>

        {/* Category tag */}
        <span className="self-start text-[9px] text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold mt-0.5">
          {p.category}
        </span>
      </div>
    </div>
  );
}

// ─── Main ShopCatalog component ─────────────────────────────────────────────
export default function ShopCatalog() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [stockFilter, setStockFilter] = useState("all"); // "all" | "available" | "unavailable"
  const [lightboxProduct, setLightboxProduct] = useState(null);

  const openLightbox = useCallback(
    (product) => setLightboxProduct(product),
    [],
  );
  const closeLightbox = useCallback(() => setLightboxProduct(null), []);

  useEffect(() => {
    // Load Google Font
    const link = document.createElement("link");
    link.href =
      "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Syne:wght@700;800&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      const snap = await getDocs(collection(db, "products"));
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setProducts(docs.length > 0 ? docs : DEMO_PRODUCTS);
    } catch {
      setProducts(DEMO_PRODUCTS);
    } finally {
      setLoading(false);
    }
  }

  const filtered = products.filter((p) => {
    const matchName = p.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "All" || p.category === category;
    const matchStock =
      stockFilter === "all" ||
      (stockFilter === "available" && p.inStock !== false) ||
      (stockFilter === "unavailable" && p.inStock === false);
    return matchName && matchCat && matchStock;
  });

  const inStockCount = products.filter((p) => p.inStock !== false).length;

  return (
    <div
      className="min-h-screen bg-white"
      style={{ fontFamily: "'Nunito', sans-serif" }}
    >
      {/* ── Lightbox Modal ── */}
      {lightboxProduct && (
        <ImageLightbox product={lightboxProduct} onClose={closeLightbox} />
      )}

      {/* ── Decorative top stripe ── */}
      <div className="h-1 w-full bg-gradient-to-r from-green-400 via-yellow-400 to-green-500" />

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b border-green-100"
        style={{ boxShadow: "0 2px 20px rgba(22,163,74,0.08)" }}
      >
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Patanjali (Balaji & Sons)"
              className="h-11 w-auto object-contain"
              onError={(e) => {
                e.target.style.display = "none";
                document.getElementById("slogo").style.display = "flex";
              }}
            />
            <div id="slogo" className="hidden items-center gap-2">
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
          </div>

          {/* Live stats pill */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-full shadow-md shadow-green-200">
              <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
              <span className="text-xs font-black">
                {loading ? "..." : `${inStockCount} Available`}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-2xl mx-auto px-4 pt-8 pb-6 relative overflow-hidden">
        <div className="absolute -top-6 -right-6 w-40 h-40 rounded-full bg-green-50 opacity-60" />
        <div className="absolute top-10 -right-2 w-24 h-24 rounded-full bg-yellow-50 opacity-80" />
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full px-3.5 py-1 mb-4">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[11px] font-bold text-green-600 tracking-widest uppercase">
              Live Stock Check
            </span>
          </div>
          <h1
            className="text-4xl sm:text-5xl font-black leading-[1.05] text-gray-900 mb-3"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            Fresh &amp; Daily
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-green-400">
              Essentials
            </span>{" "}
            <span className="text-yellow-400">✦</span>
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed max-w-xs">
            Tap any product to see a bigger image, then enquire on WhatsApp! 🛒
          </p>
        </div>
      </section>

      {/* ── Search ── */}
      <div className="max-w-2xl mx-auto px-4 mb-4">
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-green-400 text-lg pointer-events-none">
            🔍
          </div>
          <input
            className="w-full bg-green-50 border-2 border-green-100 focus:border-green-400 focus:bg-white rounded-2xl text-gray-800 text-sm placeholder-gray-400 pl-11 pr-10 py-3.5 outline-none transition-all duration-200 font-semibold"
            placeholder="Search atta, ghee, biscuit…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Category pills ── */}
      <div className="max-w-2xl mx-auto px-4 mb-3">
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={[
                "flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-2xl text-[12px] font-bold border-2 transition-all duration-200 whitespace-nowrap",
                category === c
                  ? "bg-green-600 border-green-600 text-white shadow-lg shadow-green-200"
                  : "bg-white border-green-100 text-gray-600 hover:border-green-300 hover:text-green-700",
              ].join(" ")}
            >
              <span className="text-sm">{CAT_ICONS[c] || "📦"}</span>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stock filter tabs ── */}
      <div className="max-w-2xl mx-auto px-4 mb-4">
        <div className="flex gap-2">
          {[
            { key: "all", label: "All Items" },
            { key: "available", label: "✅ In Stock" },
            { key: "unavailable", label: "❌ Out of Stock" },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setStockFilter(opt.key)}
              className={[
                "flex-shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-black border-2 transition-all duration-200",
                stockFilter === opt.key
                  ? "bg-gray-800 border-gray-800 text-white"
                  : "bg-white border-gray-200 text-gray-500 hover:border-gray-400",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Section label ── */}
      <div className="max-w-2xl mx-auto px-4 mb-3 flex items-center justify-between">
        <p className="text-[11px] font-black uppercase tracking-[3px] text-green-500">
          {category === "All" ? "All Products" : category}
        </p>
        {!loading && (
          <p className="text-[11px] font-bold text-gray-400">
            {filtered.length} item{filtered.length !== 1 ? "s" : ""}
            {search && ` for "${search}"`}
          </p>
        )}
      </div>

      {/* ── Products Grid ── */}
      <div className="max-w-2xl mx-auto px-4 pb-16">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="text-6xl mb-4">🛍️</span>
            <p className="text-base font-bold text-gray-500">Kuch nahi mila!</p>
            <p className="text-sm text-gray-400 mt-1">
              {search ? `No results for "${search}"` : "Try a different filter"}
            </p>
            {(search || category !== "All" || stockFilter !== "all") && (
              <button
                onClick={() => {
                  setSearch("");
                  setCategory("All");
                  setStockFilter("all");
                }}
                className="mt-4 text-xs font-bold text-green-600 border-2 border-green-200 px-4 py-2 rounded-xl hover:bg-green-50 transition-all"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {filtered.map((p, i) => (
              <ProductCard
                key={p.id || p.name}
                p={p}
                index={i}
                onOpenLightbox={openLightbox}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="border-t-2 border-green-100 bg-gradient-to-br from-green-50 to-white px-6 py-8 text-center">
        <div className="inline-flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center shadow-md shadow-green-200">
            <span className="text-base">🛒</span>
          </div>
          <p
            className="font-black text-base text-green-700"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            Patanjali (Balaji & Sons)
          </p>
        </div>
        <p className="text-sm text-gray-500 font-semibold">
          Smart Shopping, Easy Living
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Scan the QR code at the counter to shop
        </p>
        <div className="mt-4 flex justify-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
        </div>
      </footer>
    </div>
  );
}
