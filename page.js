"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import styles from "./page.module.css";

// แปลง created_at เป็น Date (กันกรณีคอลัมน์เป็น timestamp without time zone ที่ไม่มี Z ต่อท้าย)
function parseDbDate(value) {
  if (!value) return new Date();
  const str = String(value);
  const hasTimezone = /(Z|[+-]\d{2}(:?\d{2})?)$/.test(str);
  return new Date(hasTimezone ? str : `${str}Z`);
}

function minutesSince(value) {
  const diff = Date.now() - parseDbDate(value).getTime();
  return Math.max(0, Math.floor(diff / 60000));
}

export default function GenerateQrPage() {
  const [tableNumber, setTableNumber] = useState("");
  const [adultCount, setAdultCount] = useState("");
  const [childCount, setChildCount] = useState("0");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // session เดิมที่ยังเปิดค้างอยู่ (ถ้ามี) -> แสดงกล่องเตือน
  const [existingSession, setExistingSession] = useState(null);
  // กล่องยืนยันปิดโต๊ะเดิม
  const [showConfirm, setShowConfirm] = useState(false);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [closing, setClosing] = useState(false);

  // ผลลัพธ์หลังเปิดโต๊ะสำเร็จ
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  function resetAll() {
    setTableNumber("");
    setAdultCount("");
    setChildCount("0");
    setError("");
    setExistingSession(null);
    setShowConfirm(false);
    setResult(null);
    setCopied(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;
    setError("");

    const table = Number.parseInt(tableNumber, 10);
    const adults = Number.parseInt(adultCount, 10);
    const children = Number.parseInt(childCount === "" ? "0" : childCount, 10);

    if (!Number.isInteger(table) || table < 1) {
      setError("กรุณากรอกเลขโต๊ะให้ถูกต้อง");
      return;
    }
    if (!Number.isInteger(adults) || adults < 0 || !Number.isInteger(children) || children < 0) {
      setError("กรุณากรอกจำนวนลูกค้าให้ถูกต้อง");
      return;
    }
    if (adults + children < 1) {
      setError("ต้องมีลูกค้าอย่างน้อย 1 คน");
      return;
    }

    setLoading(true);
    try {
      // 1) เช็คว่าโต๊ะนี้มี session ที่ยัง open อยู่หรือไม่
      const { data: openRows, error: checkError } = await supabase
        .from("sessions")
        .select("id, table_number, adult_count, child_count, created_at")
        .eq("table_number", table)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1);

      if (checkError) throw checkError;

      if (openRows && openRows.length > 0) {
        setExistingSession(openRows[0]);
        return;
      }

      // 2) ไม่มี -> สร้าง session ใหม่
      const { data: created, error: insertError } = await supabase
        .from("sessions")
        .insert({
          table_number: table,
          adult_count: adults,
          child_count: children,
          status: "open",
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      const link = `${window.location.origin}/order/${table}`;
      setResult({
        id: created?.id,
        table,
        adults,
        children,
        link,
        qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(link)}`,
      });
    } catch (err) {
      console.error(err);
      setError(`เกิดข้อผิดพลาด: ${err?.message || "ไม่สามารถเปิดโต๊ะได้"}`);
    } finally {
      setLoading(false);
    }
  }

  function openConfirm() {
    if (!existingSession) return;
    setElapsedMinutes(minutesSince(existingSession.created_at));
    setShowConfirm(true);
  }

  async function confirmCloseExisting() {
    if (!existingSession || closing) return;
    setClosing(true);
    setError("");
    try {
      const { error: updateError } = await supabase
        .from("sessions")
        .update({ status: "closed" })
        .eq("id", existingSession.id)
        .eq("status", "open");

      if (updateError) throw updateError;

      // ปิดสำเร็จ -> ปิดกล่องยืนยัน + เอากล่องเตือนออก กลับไปที่ฟอร์มเดิม
      setShowConfirm(false);
      setExistingSession(null);
    } catch (err) {
      console.error(err);
      setShowConfirm(false);
      setError(`ปิดโต๊ะเดิมไม่สำเร็จ: ${err?.message || "กรุณาลองใหม่อีกครั้ง"}`);
    } finally {
      setClosing(false);
    }
  }

  async function copyLink() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.link);
    } catch {
      // fallback สำหรับเบราว์เซอร์ที่ไม่รองรับ clipboard API
      const input = document.createElement("input");
      input.value = result.link;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <header className={styles.header}>
          <span className={styles.brand}>bobko</span>
          <h1 className={styles.title}>เปิดโต๊ะ</h1>
        </header>

        {result ? (
          <section className={styles.result}>
            <img
              className={styles.qr}
              src={result.qrUrl}
              alt={`QR Code โต๊ะ ${result.table}`}
              width={300}
              height={300}
            />
            <p className={styles.summary}>
              โต๊ะ {result.table} · ผู้ใหญ่ {result.adults} · เด็ก {result.children}
            </p>
            <a className={styles.link} href={result.link} target="_blank" rel="noreferrer">
              {result.link}
            </a>
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={copyLink}>
                {copied ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}
              </button>
              <button type="button" className={styles.primary} onClick={resetAll}>
                เปิดโต๊ะใหม่
              </button>
            </div>
          </section>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            {existingSession && (
              <div className={styles.warning} role="alert">
                <p>โต๊ะนี้มีลูกค้าอยู่ระหว่างทานอาหาร กรุณาปิดออเดอร์เดิมก่อน</p>
                <button type="button" className={styles.danger} onClick={openConfirm}>
                  ปิดออเดอร์เดิม
                </button>
              </div>
            )}

            <label className={styles.field}>
              <span>เลขโต๊ะ</span>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                value={tableNumber}
                onChange={(e) => {
                  setTableNumber(e.target.value);
                  setExistingSession(null); // เปลี่ยนโต๊ะ -> ล้างคำเตือนเดิม
                }}
                placeholder="เช่น 5"
                required
              />
            </label>

            <div className={styles.row}>
              <label className={styles.field}>
                <span>ผู้ใหญ่ (คน)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={adultCount}
                  onChange={(e) => setAdultCount(e.target.value)}
                  placeholder="0"
                  required
                />
              </label>
              <label className={styles.field}>
                <span>เด็ก (คน)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={childCount}
                  onChange={(e) => setChildCount(e.target.value)}
                  placeholder="0"
                />
              </label>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button type="submit" className={styles.primary} disabled={loading}>
              {loading ? "กำลังตรวจสอบ..." : "เปิดโต๊ะ"}
            </button>
          </form>
        )}
      </div>

      {showConfirm && existingSession && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className={styles.dialog}>
            <h2 id="confirm-title" className={styles.dialogTitle}>
              ยืนยันปิดโต๊ะเดิม
            </h2>
            <dl className={styles.details}>
              <div>
                <dt>โต๊ะ</dt>
                <dd>{existingSession.table_number}</dd>
              </div>
              <div>
                <dt>ผู้ใหญ่</dt>
                <dd>{existingSession.adult_count} คน</dd>
              </div>
              <div>
                <dt>เด็ก</dt>
                <dd>{existingSession.child_count} คน</dd>
              </div>
            </dl>
            <p className={styles.elapsed}>เปิดมาแล้ว {elapsedMinutes} นาที</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setShowConfirm(false)}
                disabled={closing}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className={styles.danger}
                onClick={confirmCloseExisting}
                disabled={closing}
              >
                {closing ? "กำลังปิด..." : "ยืนยันปิดโต๊ะเดิม"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
