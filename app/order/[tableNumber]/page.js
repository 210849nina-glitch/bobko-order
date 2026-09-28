"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import styles from "./page.module.css";

const ADULT_PRICE = 359;
const CHILD_PRICE = 179;
const MAX_QTY_PER_ITEM = 5;
const MAX_ITEMS_PER_ORDER = 10;

function formatBaht(value) {
  return `฿${value.toLocaleString("th-TH")}`;
}

export default function OrderPage({ params }) {
  // Next.js เวอร์ชันล่าสุด: params เป็น Promise ต้อง unwrap ด้วย use()
  const { tableNumber } = use(params);
  const table = Number.parseInt(tableNumber, 10);

  // สถานะหน้า: loading | inactive | ready | closed
  const [status, setStatus] = useState("loading");
  const [session, setSession] = useState(null);
  const [loadError, setLoadError] = useState("");

  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(null);

  const [cart, setCart] = useState([]); // [{ id, name, quantity }]
  const [cartOpen, setCartOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [toast, setToast] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState("");

  const [showBill, setShowBill] = useState(false);
  const [billing, setBilling] = useState(false);
  const [billError, setBillError] = useState("");

  const toastTimer = useRef(null);
  const noticeTimer = useRef(null);

  // 1) เช็ค session ที่เปิดอยู่ของโต๊ะนี้ แล้วโหลดเมนู
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!Number.isInteger(table) || table < 1) {
        setStatus("inactive");
        return;
      }

      try {
        const { data: rows, error } = await supabase
          .from("sessions")
          .select("id, table_number, adult_count, child_count")
          .eq("table_number", table)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(1);

        if (error) throw error;
        if (cancelled) return;

        if (!rows || rows.length === 0) {
          setStatus("inactive");
          return;
        }
        setSession(rows[0]);

        const [catRes, itemRes] = await Promise.all([
          supabase
            .from("menu_categories")
            .select("id, name, sort_order")
            .order("sort_order", { ascending: true }),
          supabase
            .from("menu_items")
            .select("id, category_id, name")
            .order("id", { ascending: true }),
        ]);

        if (catRes.error) throw catRes.error;
        if (itemRes.error) throw itemRes.error;
        if (cancelled) return;

        setCategories(catRes.data || []);
        setItems(itemRes.data || []);
        setActiveCategoryId(catRes.data?.[0]?.id ?? null);
        setStatus("ready");
      } catch (err) {
        console.error(err);
        if (cancelled) return;
        setLoadError(err?.message || "ไม่สามารถโหลดข้อมูลได้");
        setStatus("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [table]);

  useEffect(() => {
    return () => {
      clearTimeout(toastTimer.current);
      clearTimeout(noticeTimer.current);
    };
  }, []);

  const quantityById = useMemo(() => {
    const map = new Map();
    cart.forEach((c) => map.set(c.id, c.quantity));
    return map;
  }, [cart]);

  const countByCategory = useMemo(() => {
    const map = new Map();
    cart.forEach((c) => {
      const item = items.find((i) => i.id === c.id);
      if (item) map.set(item.category_id, (map.get(item.category_id) || 0) + 1);
    });
    return map;
  }, [cart, items]);

  const visibleItems = useMemo(
    () => items.filter((i) => i.category_id === activeCategoryId),
    [items, activeCategoryId]
  );

  const totalPieces = cart.reduce((sum, c) => sum + c.quantity, 0);

  function showNotice(message) {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 2500);
  }

  function addItem(item) {
    const existing = cart.find((c) => c.id === item.id);
    if (existing) {
      if (existing.quantity >= MAX_QTY_PER_ITEM) {
        showNotice(`สั่งได้สูงสุด ${MAX_QTY_PER_ITEM} ที่ต่อรายการ`);
        return;
      }
      setCart(cart.map((c) => (c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c)));
      return;
    }
    if (cart.length >= MAX_ITEMS_PER_ORDER) {
      showNotice(`ส่งได้สูงสุด ${MAX_ITEMS_PER_ORDER} รายการต่อครั้ง กรุณาส่งออเดอร์ก่อน`);
      return;
    }
    setCart([...cart, { id: item.id, name: item.name, quantity: 1 }]);
  }

  function decreaseItem(itemId) {
    setCart(
      cart
        .map((c) => (c.id === itemId ? { ...c, quantity: c.quantity - 1 } : c))
        .filter((c) => c.quantity > 0)
    );
  }

  function removeItem(itemId) {
    setCart(cart.filter((c) => c.id !== itemId));
  }

  async function submitOrder() {
    if (submitting || cart.length === 0 || !session) return;
    setSubmitting(true);
    setOrderError("");
    try {
      const { error } = await supabase.from("orders").insert({
        session_id: session.id,
        table_number: table,
        items: cart.map((c) => ({ id: c.id, name: c.name, quantity: c.quantity })),
        status: "received",
      });
      if (error) throw error;

      setCart([]);
      setCartOpen(false);
      setToast("ส่งออเดอร์เข้าครัวแล้ว");
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(""), 4000);
    } catch (err) {
      console.error(err);
      setOrderError(`ส่งออเดอร์ไม่สำเร็จ: ${err?.message || "กรุณาลองใหม่อีกครั้ง"}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmBill() {
    if (billing || !session) return;
    setBilling(true);
    setBillError("");
    try {
      const { data, error } = await supabase
        .from("sessions")
        .update({ status: "closed" })
        .eq("id", session.id)
        .eq("status", "open")
        .select("id");

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("ไม่สามารถปิดโต๊ะได้ กรุณาแจ้งพนักงาน");
      }

      setShowBill(false);
      setStatus("closed");
    } catch (err) {
      console.error(err);
      setBillError(err?.message || "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBilling(false);
    }
  }

  // ---------- หน้าเต็มจอ ----------
  if (status === "loading") {
    return (
      <main className={styles.fullscreen}>
        <p className={styles.fullText}>กำลังโหลด...</p>
      </main>
    );
  }

  if (status === "inactive") {
    return (
      <main className={styles.fullscreen}>
        <span className={styles.brand}>bobko</span>
        <p className={styles.fullText}>โต๊ะนี้ยังไม่เปิดใช้งาน กรุณาแจ้งพนักงานร้าน bobko</p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className={styles.fullscreen}>
        <span className={styles.brand}>bobko</span>
        <p className={styles.fullText}>ไม่สามารถโหลดข้อมูลได้ กรุณาแจ้งพนักงาน</p>
        <p className={styles.fullSub}>{loadError}</p>
      </main>
    );
  }

  if (status === "closed") {
    return (
      <main className={styles.fullscreen}>
        <span className={styles.brand}>bobko</span>
        <p className={styles.fullText}>ขอบคุณที่ใช้บริการร้าน bobko</p>
      </main>
    );
  }

  const adultCount = session?.adult_count ?? 0;
  const childCount = session?.child_count ?? 0;
  const adultTotal = adultCount * ADULT_PRICE;
  const childTotal = childCount * CHILD_PRICE;
  const grandTotal = adultTotal + childTotal;

  // ---------- หน้าสั่งอาหาร ----------
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.brand}>bobko</span>
          <h1 className={styles.tableTitle}>โต๊ะ {table}</h1>
        </div>
        <button type="button" className={styles.billButton} onClick={() => setShowBill(true)}>
          เรียกเก็บเงิน
        </button>
      </header>

      <nav className={styles.tabs} aria-label="หมวดหมู่อาหาร">
        {categories.map((cat) => {
          const count = countByCategory.get(cat.id) || 0;
          return (
            <button
              key={cat.id}
              type="button"
              className={`${styles.tab} ${cat.id === activeCategoryId ? styles.tabActive : ""}`}
              onClick={() => setActiveCategoryId(cat.id)}
            >
              {cat.name}
              {count > 0 && <span className={styles.tabBadge}>{count}</span>}
            </button>
          );
        })}
      </nav>

      <section className={styles.list}>
        {categories.length === 0 && <p className={styles.empty}>ยังไม่มีเมนู</p>}
        {categories.length > 0 && visibleItems.length === 0 && (
          <p className={styles.empty}>หมวดนี้ยังไม่มีรายการอาหาร</p>
        )}

        {visibleItems.map((item) => {
          const qty = quantityById.get(item.id) || 0;
          return (
            <article key={item.id} className={styles.item}>
              <h2 className={styles.itemName}>{item.name}</h2>
              {qty === 0 ? (
                <button
                  type="button"
                  className={styles.addButton}
                  onClick={() => addItem(item)}
                  aria-label={`เพิ่ม ${item.name}`}
                >
                  +
                </button>
              ) : (
                <div className={styles.stepper}>
                  <button type="button" onClick={() => decreaseItem(item.id)} aria-label="ลดจำนวน">
                    −
                  </button>
                  <span>{qty}</span>
                  <button
                    type="button"
                    onClick={() => addItem(item)}
                    disabled={qty >= MAX_QTY_PER_ITEM}
                    aria-label="เพิ่มจำนวน"
                  >
                    +
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </section>

      {(toast || notice) && (
        <div className={`${styles.toast} ${notice && !toast ? styles.toastWarn : ""}`} role="status">
          {toast || notice}
        </div>
      )}

      {/* ตะกร้าลอยด้านล่างจอ */}
      <div className={styles.cartWrap}>
        {cartOpen && cart.length > 0 && (
          <div className={styles.cartPanel}>
            <ul>
              {cart.map((c) => (
                <li key={c.id}>
                  <span className={styles.cartName}>{c.name}</span>
                  <div className={styles.stepperSmall}>
                    <button type="button" onClick={() => decreaseItem(c.id)} aria-label="ลดจำนวน">
                      −
                    </button>
                    <span>{c.quantity}</span>
                    <button
                      type="button"
                      onClick={() => addItem({ id: c.id, name: c.name })}
                      disabled={c.quantity >= MAX_QTY_PER_ITEM}
                      aria-label="เพิ่มจำนวน"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => removeItem(c.id)}
                    aria-label={`ลบ ${c.name}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {orderError && <p className={styles.orderError}>{orderError}</p>}

        <div className={styles.cartBar}>
          <button
            type="button"
            className={styles.cartSummary}
            onClick={() => setCartOpen((v) => !v)}
            disabled={cart.length === 0}
            aria-expanded={cartOpen}
          >
            <span className={styles.cartCount}>{cart.length}</span>
            <span>
              <strong>ตะกร้า</strong>
              <small>
                {cart.length === 0
                  ? "ยังไม่ได้เลือกอาหาร"
                  : `${cart.length}/${MAX_ITEMS_PER_ORDER} รายการ · ${totalPieces} ที่`}
              </small>
            </span>
          </button>
          <button
            type="button"
            className={styles.submitButton}
            onClick={submitOrder}
            disabled={cart.length === 0 || submitting}
          >
            {submitting ? "กำลังส่ง..." : "ส่งออเดอร์"}
          </button>
        </div>
      </div>

      {/* หน้าต่างยืนยันเรียกเก็บเงิน */}
      {showBill && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="bill-title">
          <div className={styles.dialog}>
            <h2 id="bill-title" className={styles.dialogTitle}>
              ยืนยันเรียกเก็บเงิน
            </h2>
            <dl className={styles.billRows}>
              <div>
                <dt>ผู้ใหญ่ {adultCount} คน × {ADULT_PRICE}</dt>
                <dd>{formatBaht(adultTotal)}</dd>
              </div>
              <div>
                <dt>เด็ก {childCount} คน × {CHILD_PRICE}</dt>
                <dd>{formatBaht(childTotal)}</dd>
              </div>
            </dl>
            <p className={styles.total}>
              <span>ยอดรวม</span>
              <strong>{formatBaht(grandTotal)}</strong>
            </p>
            <p className={styles.dialogHint}>เมื่อยืนยันแล้วจะไม่สามารถสั่งอาหารเพิ่มได้</p>
            {billError && <p className={styles.billError}>{billError}</p>}
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => {
                  setShowBill(false);
                  setBillError("");
                }}
                disabled={billing}
              >
                ยกเลิก
              </button>
              <button type="button" className={styles.confirmButton} onClick={confirmBill} disabled={billing}>
                {billing ? "กำลังดำเนินการ..." : "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
