import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/header.jsx";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";


const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
}); 

export const metadata = {
  title: "Vehiqle",
  description: "Find your perfect vehicle with Vehiqle - the ultimate car search platform.",
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider> 
    <html lang="en">
      <body
        className={`${inter.className} latin bg-white dark:bg-black text-gray-900 dark:text-gray-100`}
      >

        <Header/>

        <main className="min-h-screen">
          {children}
          
        </main>

        <Toaster richColors />
        
        <footer className="bg-blue-50 py-12">
          <div className="container mx-auto text-center px-4 text-gray-600" >
            <p> Contact us </p>
          </div>
        </footer>

      </body>
    </html>
    </ClerkProvider>
  );
}
