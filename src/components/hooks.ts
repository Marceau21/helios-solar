"use client";

import { useEffect, useState } from "react";
import type { EnergyDay, PowerPoint, PowerSnapshot } from "@/types/energy";

export function useLive(id: string) {
  const [snapshot, setSnapshot] = useState<PowerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      let next = 30;
      try {
        const r = await fetch(`/api/installations/${id}/live`, { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) throw new Error(j.error ?? `Erreur ${r.status}`);
        setSnapshot(j.snapshot);
        setError(null);
        next = Math.max(5, j.pollSeconds ?? 30);
      } catch (e) {
        if (alive) setError((e as Error).message);
        next = 60;
      }
      // Pas de polling quand l'onglet est caché : on économise les quotas fabricants.
      if (alive) timer = setTimeout(load, document.hidden ? 120_000 : next * 1000);
    };
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id]);

  return { snapshot, error };
}

export function useHistory(id: string, days = 30) {
  const [data, setData] = useState<{ daily: EnergyDay[]; curve: PowerPoint[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/installations/${id}/history?days=${days}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setData(j);
      })
      .catch((e) => setError(e.message));
  }, [id, days]);
  return { data, error };
}

export function useLocalHour(tz: string) {
  const [hour, setHour] = useState<number>(12);
  useEffect(() => {
    const tick = () => {
      const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date());
      setHour(Number(p.find((x) => x.type === "hour")?.value) + Number(p.find((x) => x.type === "minute")?.value) / 60);
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [tz]);
  return hour;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
