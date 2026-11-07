"use client";

import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from "react";
import styles from "./x-radar.module.css";

type ShaderColor = [number, number, number, number];
type BorderShaderProps = {
  bloom?: number;
  colorBack?: ShaderColor;
  colors?: ShaderColor[];
  fit?: "contain" | "cover";
  intensity?: number;
  maxPixelCount?: number;
  pulse?: number;
  roundness?: number;
  scale?: number;
  softness?: number;
  speed?: number;
  spotSize?: number;
  spots?: number;
  style?: CSSProperties;
  thickness?: number;
};

function colorToken(name: string, host: Element): ShaderColor {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [0.82, 0.7, 0.12, 1];
  context.fillStyle = getComputedStyle(host).getPropertyValue(name).trim();
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  return [red / 255, green / 255, blue / 255, alpha / 255];
}

export function LeadSignalBorder() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [Shader, setShader] = useState<ComponentType<BorderShaderProps> | null>(null);
  const [visible, setVisible] = useState(true);
  const [colors, setColors] = useState<ShaderColor[]>();

  useEffect(() => {
    const host = hostRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const narrowViewport = window.matchMedia("(max-width: 39.99rem)");
    if (!host) return;
    const canvas = document.createElement("canvas");
    const webgl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!webgl) return;
    webgl.getExtension('WEBGL_lose_context')?.loseContext();

    let intersecting = false;
    let mounted = true;
    const updateVisibility = () => setVisible(intersecting && document.visibilityState === "visible");
    const observer = new IntersectionObserver(([entry]) => { intersecting = entry?.isIntersecting ?? false; updateVisibility(); }, { rootMargin: "80px" });
    observer.observe(host);
    document.addEventListener("visibilitychange", updateVisibility);

    const updateMaterial = () => {
      if (reducedMotion.matches || narrowViewport.matches) { setShader(null); return; }
      void import("@paper-design/shaders-react").then((module) => {
        if (mounted && !reducedMotion.matches && !narrowViewport.matches) {
          setColors([colorToken("--color-accent", host), colorToken("--color-accent-strong", host), colorToken("--color-ink-2", host)]);
          setShader(() => module.PulsingBorder as ComponentType<BorderShaderProps>);
        }
      }).catch(() => { if (mounted) setShader(null); });
    };
    updateMaterial();
    reducedMotion.addEventListener('change', updateMaterial);
    narrowViewport.addEventListener('change', updateMaterial);
    return () => {
      mounted = false;
      observer.disconnect();
      document.removeEventListener("visibilitychange", updateVisibility);
      reducedMotion.removeEventListener('change', updateMaterial);
      narrowViewport.removeEventListener('change', updateMaterial);
    };
  }, []);

  return (
    <div aria-hidden="true" className={styles.signalBorder} data-radar-shader={Shader ? "active" : "static"} ref={hostRef}>
      {Shader && colors && (
        <Shader
          bloom={0.12}
          colorBack={[0, 0, 0, 0]}
          colors={colors}
          fit="cover"
          intensity={0.14}
          maxPixelCount={260_000}
          pulse={0.04}
          roundness={0.04}
          scale={1}
          softness={0.12}
          speed={visible ? 0.08 : 0}
          spots={2}
          spotSize={0.7}
          style={{ height: "100%", width: "100%" }}
          thickness={0.02}
        />
      )}
    </div>
  );
}
