// src/components/common/BackToTop.js
import React, { useEffect, useRef, useState } from "react";

export default function BackToTop({ threshold = 400 }) {
  const [visible, setVisible] = useState(false);
  const rafRef = useRef(null);

  useEffect(() => {
    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setVisible(window.scrollY > threshold);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // init
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [threshold]);

  const scrollToTop = () => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) {
      window.scrollTo(0, 0);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <button
      type="button"
      aria-label="Revenir en haut"
      title="Revenir en haut"
      className={`backtotop ${visible ? "show" : ""}`}
      onClick={scrollToTop}
    >
      ↑
    </button>
  );
}
