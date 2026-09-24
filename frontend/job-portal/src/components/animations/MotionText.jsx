// components/motion/MotionText.jsx
"use client";
import { motion } from "framer-motion";

const MotionText = ({ children, type = "heading", className = "" }) => {
  const variants = {
    heading: {
      initial: { opacity: 0, y: 20 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] },
    },
    paragraph: {
      initial: { opacity: 0, y: 10 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.7, ease: "easeOut", delay: 0.1 },
    },
  };

  return (
    <motion.div
      {...variants[type]}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default MotionText;
