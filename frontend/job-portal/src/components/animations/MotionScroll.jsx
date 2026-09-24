// components/motion/MotionScroll.jsx
"use client";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

const MotionScroll = ({ children, className = "" }) => {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [15, -15]);
  const opacity = useTransform(scrollYProgress, [0, 1], [1, 0.9]);

  return (
    <motion.div
      ref={ref}
      style={{ y, opacity }}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default MotionScroll;
