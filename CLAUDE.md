# bobko — ระบบสั่งอาหารร้านบุฟเฟต์ปิ้งย่างและอาหารเกาหลี

## Stack
- Next.js (App Router) — **JavaScript เท่านั้น ไม่ใช้ TypeScript**
- Supabase (`@supabase/supabase-js`) — client อยู่ที่ `lib/supabaseClient.js`
- Deploy บน Vercel

## Environment variables
ตั้งค่าใน `.env.local` (ห้าม commit) และใน Vercel Project Settings:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

ดูตัวอย่างที่ `.env.example`

## ⚠️ Next.js เวอร์ชันล่าสุด: `params` ของ Dynamic Route เป็น Promise
โปรเจกต์นี้ใช้ Next.js เวอร์ชันล่าสุด ซึ่ง `params` (และ `searchParams`) ของ Dynamic Route
เป็น **Promise** ต้อง unwrap ด้วย `use()` จาก React เสมอ ห้ามอ่านค่าตรง ๆ

```js
"use client";
import { use } from "react";

export default function Page({ params }) {
  const { id } = use(params); // ✅ ถูกต้อง
  // const { id } = params;   // ❌ ผิด — params เป็น Promise
  return <div>{id}</div>;
}
```

หมายเหตุ: ถ้าเป็น Server Component (ไม่มี `"use client"`) ให้ใช้ `async` + `await params` แทน
เพราะ `use()` เหมาะกับ Client Component

## โครงสร้างตารางใน Supabase (มีอยู่แล้ว — ใช้อ้างอิง)
| ตาราง | คอลัมน์ |
|---|---|
| `sessions` | id, table_number, adult_count, child_count, status, created_at |
| `menu_categories` | id, name, sort_order |
| `menu_items` | id, category_id, name |
| `orders` | id, session_id, table_number, items (jsonb), status, created_at |

## Routes
- `/` — หน้าแรก
- `/generate-qr` — สร้าง QR Code ประจำโต๊ะ (ยังไม่ได้สร้าง)
- `/kitchen` — หน้าครัว (ยังไม่ได้สร้าง)

## คำสั่ง
```bash
npm install
npm run dev     # พัฒนา
npm run build   # build
npm run start   # รัน production
```
