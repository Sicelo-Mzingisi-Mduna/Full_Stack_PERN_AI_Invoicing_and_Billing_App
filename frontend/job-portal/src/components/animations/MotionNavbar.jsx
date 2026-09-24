// components/motion/MotionNavbar.jsx
"use client";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

const MotionNavbar = ({ children, className = "" }) => {
  const ref = useRef(null);
  const { scrollY } = useScroll();
  const backgroundOpacity = useTransform(scrollY, [0, 150], [0.0, 0.9]);

  return (
    <motion.nav
      ref={ref}
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
      style={{
        backgroundColor: `rgba(255, 255, 255, ${backgroundOpacity.get()})`,
        backdropFilter: "blur(10px)",
      }}
      className={className}
    >
      {children}
    </motion.nav>
  );
};

export default MotionNavbar;
