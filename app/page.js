import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home">
      <div>
        <h1>bobko</h1>
        <p>บุฟเฟต์ปิ้งย่างและอาหารเกาหลี</p>
      </div>

      <nav>
        <Link href="/generate-qr">สร้าง QR Code</Link>
        <Link href="/kitchen">หน้าครัว</Link>
      </nav>
    </main>
  );
}
