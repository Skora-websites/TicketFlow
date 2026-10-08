"use client";

/**
 * Landing-page gsap layer — scroll-triggered reveals and staggered entrances.
 * Animation lives here so page.tsx stays declarative: elements just carry a
 * `data-animate` attribute. gsap is imported lazily in a client effect (no SSR
 * work), ScrollTrigger is registered once, everything reverts on unmount.
 * Users with `prefers-reduced-motion` get the page with no tweens at all.
 */

import { useEffect } from "react";

export function useLandingGsap() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let ctx: { revert: () => void } | undefined;
    let cancelled = false;

    (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        /* ---- hero: headline + copy rise, CTAs and demo board settle in ---- */
        gsap.from("[data-animate='hero-line']", {
          y: 28,
          opacity: 0,
          duration: 0.7,
          ease: "power3.out",
          stagger: 0.12,
        });
        gsap.from("[data-animate='hero-cta']", {
          y: 18,
          opacity: 0,
          duration: 0.55,
          delay: 0.35,
          ease: "power2.out",
        });
        gsap.from("[data-animate='hero-demo']", {
          y: 44,
          opacity: 0,
          duration: 0.9,
          delay: 0.45,
          ease: "power3.out",
        });

        /* ---- section headers: eyebrow + title + body rise on enter ---- */
        gsap.utils.toArray<HTMLElement>("[data-animate='header']").forEach((h) => {
          gsap.from(h.querySelectorAll("[data-animate='header-child']"), {
            y: 24,
            opacity: 0,
            duration: 0.65,
            ease: "power3.out",
            stagger: 0.1,
            scrollTrigger: { trigger: h, start: "top 82%" },
          });
        });

        /* ---- how-it-works steps: slide from the left, cascading ---- */
        gsap.from("[data-animate='step']", {
          x: -32,
          opacity: 0,
          duration: 0.6,
          ease: "power2.out",
          stagger: 0.12,
          scrollTrigger: { trigger: "[data-animate='steps']", start: "top 78%" },
        });

        /* ---- routing: feed slides in left, engine panel from right ---- */
        gsap.from("[data-animate='routing-feed'] > *", {
          x: -24,
          opacity: 0,
          duration: 0.5,
          ease: "power2.out",
          stagger: 0.08,
          scrollTrigger: { trigger: "[data-animate='routing-feed']", start: "top 80%" },
        });

        /* ---- feature folders: rise into their slots ---- */
        gsap.from("[data-animate='feature-card']", {
          y: 30,
          opacity: 0,
          duration: 0.55,
          ease: "power3.out",
          stagger: 0.08,
          scrollTrigger: { trigger: "[data-animate='feature-grid']", start: "top 80%" },
        });

        /* ---- role rows: slide from the right ---- */
        gsap.from("[data-animate='role-row']", {
          x: 32,
          opacity: 0,
          duration: 0.6,
          ease: "power2.out",
          stagger: 0.1,
          scrollTrigger: { trigger: "[data-animate='roles-list']", start: "top 78%" },
        });

        /* ---- pricing cards: rise ---- */
        gsap.from("[data-animate='price-card']", {
          y: 30,
          opacity: 0,
          duration: 0.6,
          ease: "power3.out",
          stagger: 0.12,
          scrollTrigger: { trigger: "[data-animate='price-grid']", start: "top 82%" },
        });

        /* ---- CTA block: one confident rise ---- */
        gsap.from("[data-animate='cta-block']", {
          y: 24,
          opacity: 0,
          duration: 0.6,
          ease: "power3.out",
          stagger: 0.08,
          scrollTrigger: { trigger: "[data-animate='cta-block']", start: "top 80%" },
        });
      });
    })();

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);
}
