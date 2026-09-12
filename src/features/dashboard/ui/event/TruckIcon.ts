import { Container, Graphics, Sprite, Texture, BlurFilter, FederatedPointerEvent } from "pixi.js";
import { Baker } from "../../util/Baker";
import { PngManager } from "../../util/PngManager";
import type { Database } from "../../../../../database.types";

type WorkTrackerStatus = Database["public"]["Enums"]["worktracker_status"];

/** Map work-tracker statuses to hex tint colours (matching Tailwind -600/-800 palette). */
const STATUS_TINT: Record<WorkTrackerStatus, number> = {
  draft: 0xca8a04, // yellow-600
  released: 0x2563eb, // blue-600
  accepted: 0x16c958, // green-600
  dest_pickup: 0x17e3a4, // emerald-600
  pickup_inspection: 0x17e3a4, // emerald-600
  dest_dropoff: 0x17e3a4, // emerald-600
  dropoff_inspection: 0x17e3a4, // emerald-600
  completed: 0x166534, // green-800
  cancelled: 0xdc2626, // red-600
  declined: 0xe11d48, // rose-600
  abandoned: 0xb91c1c, // red-700
};

/**
 * Truck icon with hover animation + shadow and click interaction.
 * Mirrors GoodShuffleIcon patterns but uses preloaded truck.png via PngManager.
 */
export class TruckIcon extends Container {
  private iconSprite: Sprite;
  private shadowGraphics: Graphics;
  private isAnimating = false;
  private isHovering = false;
  private originalScale = 1;
  private clickCallback?: () => void;
  private baker: Baker;

  constructor(baker: Baker, clickCallback?: () => void) {
    super();
    this.baker = baker;
    this.clickCallback = clickCallback;

    this.shadowGraphics = new Graphics();
    this.shadowGraphics.alpha = 0; // start hidden
    this.addChild(this.shadowGraphics);

    this.iconSprite = new Sprite();
    this.addChild(this.iconSprite);

    this.createFallbackTexture();
    this.tryAssignCachedTexture();
    // Subscribe for late load
    PngManager.onLoad("truck", this.handleAsyncLoaded);

    this.eventMode = "static";
    this.cursor = "pointer";
    this.on("pointerenter", this.onHoverStart, this);
    this.on("pointerleave", this.onHoverEnd, this);
    this.on("pointerup", this.onPointerUp, this);

    this.updateShadow();
  }

  private tryAssignCachedTexture() {
    const cached = PngManager.getTexture("truck");
    if (!cached) return; // fallback already set

    const baked = this.baker.getTexture(`TruckIcon-cached`, { width: 96, height: 96 }, (c) => {
      const s = new Sprite(cached);
      s.width = 96;
      s.height = 96;
      s.anchor.set(0, 0);
      s.position.set(0, 0);
      c.addChild(s);
    });
    this.iconSprite.texture = baked;
    this.iconSprite.anchor.set(0.5, 0.5);
  }

  private handleAsyncLoaded = (tex: Texture) => {
    // Rebuild baked texture using newly available source
    const baked = this.baker.getTexture(`TruckIcon-cached`, { width: 96, height: 96 }, (c) => {
      const s = new Sprite(tex);
      s.width = 96;
      s.height = 96;
      s.anchor.set(0, 0);
      s.position.set(0, 0);
      c.addChild(s);
    });
    this.iconSprite.texture = baked;
    this.iconSprite.anchor.set(0.5, 0.5);
  };

  private createFallbackTexture() {
    const fallback = this.baker.getTexture(`TruckIcon-fallback`, { width: 96, height: 96 }, (c) => {
      const g = new Graphics();
      g.fill({ color: 0x1e3a8a });
      g.roundRect(0, 0, 96, 96, 3);
      g.fill();
      c.addChild(g);
    });
    this.iconSprite.texture = fallback;
    this.iconSprite.anchor.set(0.5, 0.5);
    this.iconSprite.alpha = 1;
    this.iconSprite.visible = true;
  }

  private onHoverStart() {
    if (this.isAnimating || this.isHovering) return;
    this.isHovering = true;
    this.animateHover(true);
  }

  private onHoverEnd() {
    if (!this.isHovering) return;
    this.isHovering = false;
    this.animateHover(false);
  }

  private onPointerUp(e: FederatedPointerEvent) {
    // Prevent tile click from also firing
    e.stopPropagation();
    if (this.clickCallback) this.clickCallback();
  }

  private animateHover(entering: boolean) {
    this.isAnimating = true;
    const targetScale = entering ? 1.2 : this.originalScale;
    const targetShadowAlpha = entering ? 0.001 : 0;
    const duration = 180;

    const startTime = performance.now();
    const startScale = this.iconSprite.scale.x;
    const startShadowAlpha = this.shadowGraphics.alpha;

    const step = () => {
      const now = performance.now();
      const progress = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);

      const currentScale = startScale + (targetScale - startScale) * ease;
      this.iconSprite.scale.set(currentScale);
      this.shadowGraphics.alpha = startShadowAlpha + (targetShadowAlpha - startShadowAlpha) * ease;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        this.isAnimating = false;
      }
    };

    requestAnimationFrame(step);
  }

  private updateShadow() {
    this.shadowGraphics.clear();
    this.shadowGraphics.fill({ color: 0x000000, alpha: 1 });
    this.shadowGraphics.ellipse(10, 12, 8, 8);
    this.shadowGraphics.fill();
    this.shadowGraphics.position.set(-5, -5);

    const blurFilter = new BlurFilter({});
    this.shadowGraphics.filters = [blurFilter];
  }

  public setStatus(status: WorkTrackerStatus) {
    this.iconSprite.tint = STATUS_TINT[status] ?? 0xffffff;
  }

  public resetHoverState() {
    this.isHovering = false;
    this.isAnimating = false;
    this.iconSprite.scale.set(this.originalScale);
    this.shadowGraphics.alpha = 0;
  }

  destroy(options?: Parameters<Container["destroy"]>[0]) {
    PngManager.offLoad("truck", this.handleAsyncLoaded);
    this.off("pointerenter", this.onHoverStart);
    this.off("pointerleave", this.onHoverEnd);
    this.off("pointerup", this.onPointerUp);
    this.resetHoverState();
    super.destroy(options);
  }
}
