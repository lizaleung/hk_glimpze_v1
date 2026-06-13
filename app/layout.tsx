import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/lib/ui/Sidebar";

export const metadata: Metadata = {
  title: "Frontier — Financial Analysis",
  description: "Personal financial-analysis dashboard.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        <div className="flex min-h-screen">
          <aside className="w-56 shrink-0 border-r border-slate-200 bg-white">
            <Sidebar />
          </aside>
          <main className="min-w-0 flex-1">
            <div className="mx-auto max-w-4xl px-6 py-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
