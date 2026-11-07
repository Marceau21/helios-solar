"use client";
import dynamic from "next/dynamic";

/** La 3D ne se rend que côté navigateur (WebGL). */
export const HouseScene = dynamic(() => import("./three/HouseScene"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-ink-soft">Chargement de la maison 3D…</div>,
});
