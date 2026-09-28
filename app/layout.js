import "./globals.css";

export const metadata = {
  title: "bobko",
  description: "บุฟเฟต์ปิ้งย่างและอาหารเกาหลี",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
