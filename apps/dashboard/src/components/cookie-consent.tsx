"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";

export function CookieConsent() {
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const consent = localStorage.getItem("lumi-cookie-consent");
    if (!consent) {
      setShow(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem("lumi-cookie-consent", "true");
    setShow(false);
  };

  if (!mounted) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border px-4 py-3 sm:px-6"
        >
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-fg-muted">
              Lumi uses session cookies for authentication. No tracking cookies are used.{" "}
              <Link href="/legal/privacy" className="underline hover:text-fg">
                Privacy Policy
              </Link>
            </p>
            <button
              onClick={handleAccept}
              className="whitespace-nowrap rounded-md bg-accent px-4 py-2 text-sm font-medium text-fg-on-accent transition-colors hover:bg-accent-hover focus:ring-2 focus:ring-ring focus:outline-none"
            >
              Got it
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
