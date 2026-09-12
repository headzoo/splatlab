"use client";

import Image from "next/image";
import { useSyncExternalStore, type CSSProperties } from "react";
import styles from "./page.module.css";

const parallaxLayers = [
  {
    image: "/brand/homepage/hero-parallax-far.png",
    className: "parallaxFar",
    depth: "far",
    durationSeconds: 54,
  },
  {
    image: "/brand/homepage/hero-parallax-mid.png",
    className: "parallaxMid",
    depth: "mid",
    durationSeconds: 38,
  },
  {
    image: "/brand/homepage/hero-parallax-front-step.png",
    className: "parallaxFront",
    depth: "front",
    durationSeconds: 23,
  },
  {
    image: "/brand/homepage/hero-parallax-front-flowers.png",
    className: "parallaxFront",
    depth: "front",
    durationSeconds: 19,
  },
] as const;

const parallaxCoins = [
  {
    className: "parallaxCoinMid",
    positionClassName: "coinMidOne",
    depth: "mid",
    durationSeconds: 31,
  },
  {
    className: "parallaxCoinMid",
    positionClassName: "coinMidTwo",
    depth: "mid",
    durationSeconds: 34,
  },
  {
    className: "parallaxCoinMid",
    positionClassName: "coinMidThree",
    depth: "mid",
    durationSeconds: 37,
  },
  {
    className: "parallaxCoinFront",
    positionClassName: "coinFrontOne",
    depth: "front",
    durationSeconds: 18,
  },
  {
    className: "parallaxCoinFront",
    positionClassName: "coinFrontTwo",
    depth: "front",
    durationSeconds: 21,
  },
] as const;

const parallaxBuilderObjects = [
  {
    image: "/brand/homepage/hero-parallax-builder-materialize.png",
    className: "parallaxBuilderMid",
    positionClassName: "builderMaterialize",
    depth: "mid",
    durationSeconds: 36,
    width: 640,
    height: 512,
  },
  {
    image: "/brand/homepage/hero-parallax-builder-ghost.png",
    className: "parallaxBuilderMid",
    positionClassName: "builderGhost",
    depth: "mid",
    durationSeconds: 33,
    width: 1374,
    height: 1145,
  },
  {
    image: "/brand/homepage/hero-parallax-builder-selected.png",
    className: "parallaxBuilderFront",
    positionClassName: "builderSelected",
    depth: "front",
    durationSeconds: 24,
    width: 640,
    height: 640,
  },
  {
    image: "/brand/homepage/hero-parallax-builder-boar.png",
    className: "parallaxBuilderFront",
    positionClassName: "builderBoar",
    depth: "front",
    durationSeconds: 22,
    width: 768,
    height: 512,
  },
  {
    image: "/brand/homepage/hero-parallax-builder-coin.png",
    className: "parallaxBuilderFront",
    positionClassName: "builderCoin",
    depth: "front",
    durationSeconds: 25,
    width: 512,
    height: 512,
  },
] as const;

const parallaxDurationRanges = {
  far: { minimum: 48, maximum: 60 },
  mid: { minimum: 30, maximum: 42 },
  front: { minimum: 17, maximum: 26 },
} as const;

type ParallaxDepth = keyof typeof parallaxDurationRanges;

const heroAnimationStorageKey = "splat-lab.hero-animation-playing.v1";
const heroAnimationPreferenceChangedEvent =
  "splat-lab:hero-animation-preference-changed";

function subscribeToReducedMotionPreference(onStoreChange: () => void) {
  const reducedMotionQuery = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );

  reducedMotionQuery.addEventListener("change", onStoreChange);

  return () => {
    reducedMotionQuery.removeEventListener("change", onStoreChange);
  };
}

function getReducedMotionPreference() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeToStoredHeroAnimationPreference(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === heroAnimationStorageKey) {
      onStoreChange();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(heroAnimationPreferenceChangedEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(
      heroAnimationPreferenceChangedEvent,
      onStoreChange,
    );
  };
}

function getStoredHeroAnimationPreference() {
  try {
    const storedValue = window.localStorage.getItem(heroAnimationStorageKey);

    if (storedValue === "playing") {
      return true;
    }

    if (storedValue === "paused") {
      return false;
    }
  } catch {
    return null;
  }

  return null;
}

function storeHeroAnimationPreference(isPlaying: boolean) {
  try {
    window.localStorage.setItem(
      heroAnimationStorageKey,
      isPlaying ? "playing" : "paused",
    );
  } catch {
    return;
  }

  window.dispatchEvent(new Event(heroAnimationPreferenceChangedEvent));
}

function parallaxStyle(
  depth: ParallaxDepth,
  durationSeconds: number,
): CSSProperties {
  const range = parallaxDurationRanges[depth];
  const boundedDuration = Math.min(
    range.maximum,
    Math.max(range.minimum, durationSeconds),
  );

  return {
    "--parallax-duration": `${boundedDuration}s`,
  } as CSSProperties;
}

export function HeroParallax() {
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToReducedMotionPreference,
    getReducedMotionPreference,
    () => true,
  );
  const storedPlaybackChoice = useSyncExternalStore(
    subscribeToStoredHeroAnimationPreference,
    getStoredHeroAnimationPreference,
    () => null,
  );
  const isPlaying = storedPlaybackChoice ?? !prefersReducedMotion;

  return (
    <>
      <div
        className={`${styles.parallaxScene} ${
          isPlaying ? styles.parallaxPlaying : styles.parallaxPaused
        }`}
        aria-hidden="true"
      >
        {parallaxLayers.map((layer) => (
          <div
            className={`${styles.parallaxLayer} ${styles[layer.className]}`}
            key={layer.image}
            style={parallaxStyle(layer.depth, layer.durationSeconds)}
          >
            <div className={styles.parallaxTrack}>
              {[0, 1].map((copy) => (
                <div className={styles.parallaxPanel} key={copy}>
                  <Image
                    className={styles.parallaxImage}
                    src={layer.image}
                    alt=""
                    fill
                    priority
                    sizes="100vw"
                    unoptimized
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {parallaxBuilderObjects.map((object) => (
          <div
            className={`${styles.parallaxLayer} ${styles[object.className]}`}
            key={object.image}
            style={parallaxStyle(object.depth, object.durationSeconds)}
          >
            <div className={styles.parallaxTrack}>
              {[0, 1].map((copy) => (
                <div className={styles.parallaxPanel} key={copy}>
                  <Image
                    className={`${styles.parallaxBuilderAsset} ${styles[object.positionClassName]}`}
                    src={object.image}
                    alt=""
                    width={object.width}
                    height={object.height}
                    unoptimized
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {parallaxCoins.map((coin) => (
          <div
            className={`${styles.parallaxLayer} ${styles[coin.className]}`}
            key={coin.positionClassName}
            style={parallaxStyle(coin.depth, coin.durationSeconds)}
          >
            <div className={styles.parallaxTrack}>
              {[0, 1].map((copy) => (
                <div className={styles.parallaxPanel} key={copy}>
                  <Image
                    className={`${styles.parallaxCoin} ${styles[coin.positionClassName]}`}
                    src="/brand/homepage/hero-parallax-coin.png"
                    alt=""
                    width={512}
                    height={512}
                    unoptimized
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        className={styles.parallaxToggle}
        type="button"
        aria-pressed={isPlaying}
        onClick={() => storeHeroAnimationPreference(!isPlaying)}
      >
        <span aria-hidden="true">{isPlaying ? "Pause" : "Play"}</span>
        <span className={styles.srOnly}>
          {isPlaying ? "Pause hero animation" : "Play hero animation"}
        </span>
      </button>
    </>
  );
}
