import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { CartProvider } from "@/providers/cart-provider";
import { ChatProvider } from "@/providers/chat-provider";
import { CheckoutProvider } from "@/providers/checkout-provider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "S3K Fuse",
  description: "WhatsApp commerce MVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} antialiased`}>
        <CartProvider>
          <CheckoutProvider>
            <ChatProvider>{children}</ChatProvider>
          </CheckoutProvider>
        </CartProvider>
      </body>
    </html>
  );
}
