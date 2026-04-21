import { Container, Graphics, Sprite } from "pixi.js";
import { Baker } from "../util/Baker";

export class Tile extends Container {
  private dimensions: { width: number; height: number };
  private bakedSprite: Sprite;
  private isHovering = false;
  private isAnimating = false;
  private hoverOverlay: Graphics | null = null; // Create this on demand
  private row: number;
  private col: number;

  constructor(
    dimensions: { width: number; height: number },
    baker: Baker,
    row: number,
    col: number,
    isClickable?: boolean,
    isDamage?: boolean,
  ) {
    super();
    this.row = row;
    this.col = col;
    this.dimensions = dimensions;
    const textureKey = isDamage ? "DamageTile" : "TestTile";
    const texture = baker.getTexture(textureKey, dimensions, (c) => {
      if (isDamage) {
        this.buildDamageTile(c);
      } else {
        this.buildTile(c);
      }
    });

    // Create baked sprite
    this.bakedSprite = new Sprite(texture);
    this.addChild(this.bakedSprite);

    if (isClickable) {
      this.eventMode = "static";
      this.cursor = "pointer";

      // Add hover listeners - but use the same pattern as GoodShuffleIcon
      this.on("pointerenter", this.onHoverStart.bind(this));
      this.on("pointerleave", this.onHoverEnd.bind(this));
      this.on("click", this.handleClick.bind(this));
    }
  }

  private handleClick(): void {
    // Emit cell edit request with coordinates
    this.emit("cell:edit-request", { row: this.row, col: this.col });
    console.log(`Tile clicked: (${this.row}, ${this.col})`);
  }

  private buildTile(c: Container) {
    const cellObj = new Graphics()
      .moveTo(this.dimensions.width, 0)
      .lineTo(this.dimensions.width, this.dimensions.height - 1) // right line inside
      .moveTo(0, this.dimensions.height - 1)
      .lineTo(this.dimensions.width, this.dimensions.height - 1) // bottom line inside
      .stroke({ width: 1, color: 0x000000, alpha: 0.15, alignment: 0 });

    // Draw tile background (light gray) - no reference needed
    const fill = new Graphics()
      .rect(0, 0, this.dimensions.width, this.dimensions.height)
      .fill(0xffffff);

    c.addChild(fill, cellObj);
    // console.log("tile baked");
  }

  private buildDamageTile(c: Container) {
    const w = this.dimensions.width;
    const h = this.dimensions.height;

    // Same white background
    const fill = new Graphics().rect(0, 0, w, h).fill(0xffffff);

    // Faint red diagonal stripes
    const stripes = new Graphics();
    stripes.setStrokeStyle({ width: 1, color: 0xdc2626, alpha: 0.5 });
    const step = 10;
    for (let offset = -h; offset < w; offset += step) {
      const x1 = Math.max(0, offset);
      const y1 = Math.max(0, -offset);
      const x2 = Math.min(w, offset + h);
      const y2 = x2 - offset;
      stripes.moveTo(x1, y1).lineTo(x2, y2);
    }
    stripes.stroke();

    // Same border as regular tile
    const border = new Graphics()
      .moveTo(w, 0)
      .lineTo(w, h - 1)
      .moveTo(0, h - 1)
      .lineTo(w, h - 1)
      .stroke({ width: 1, color: 0x000000, alpha: 0.15, alignment: 0 });

    c.addChild(fill, stripes, border);
  }

  private onHoverStart() {
    // console.log("🟢 onHoverStart called", {
    //   isAnimating: this.isAnimating,
    //   isHovering: this.isHovering,
    // });
    if (this.isAnimating || this.isHovering) return;
    this.isHovering = true;

    // Create hover overlay only when we hover
    if (!this.hoverOverlay) {
      this.hoverOverlay = new Graphics();
      this.hoverOverlay.rect(0, 0, this.dimensions.width, this.dimensions.height);
      this.hoverOverlay.fill({ color: 0x000000, alpha: 1 }); // Red with full alpha in the fill
      this.hoverOverlay.alpha = 0; // But start the container alpha at 0
      // this.hoverOverlay.zIndex = 1000; // Make sure it's on top

      this.addChild(this.hoverOverlay);
      //   console.log("✅ Created RED hover overlay", {
      //     width: this.dimensions.width,
      //     height: this.dimensions.height,
      //     overlayAlpha: this.hoverOverlay.alpha,
      //     children: this.children.length,
      //   });
    }

    this.animateHover(true);
  }

  private onHoverEnd() {
    // console.log("🔴 onHoverEnd called", { isHovering: this.isHovering });
    if (!this.isHovering) return;
    this.isHovering = false;
    this.animateHover(false);
  }

  private animateHover(isHovering: boolean) {
    // console.log("🎬 animateHover called", { isHovering, hoverOverlay: !!this.hoverOverlay });
    if (!this.hoverOverlay) return; // Safety check

    this.isAnimating = true;

    const targetAlpha = isHovering ? 0.05 : 0; // Full opacity for maximum visibility
    const duration = 200; // 3 seconds for easy testing
    const startAlpha = this.hoverOverlay.alpha;

    // console.log("🎯 Animation setup", {
    //   startAlpha,
    //   targetAlpha,
    //   duration,
    //   isHovering,
    //   alphaDifference: targetAlpha - startAlpha,
    // });

    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Smooth easing function (ease out)
      const easeOut = 1 - Math.pow(1 - progress, 3);

      // Calculate current alpha - this was the bug!
      const currentAlpha = startAlpha + (targetAlpha - startAlpha) * easeOut;

      if (this.hoverOverlay) {
        this.hoverOverlay.alpha = currentAlpha;

        // Log more frequently for debugging
        // if (elapsed % 200 < 16) {
        //   // Log roughly every 200ms
        //   console.log(
        //     `🔄 Animation: ${(progress * 100).toFixed(1)}% | Alpha: ${startAlpha.toFixed(
        //       2
        //     )} → ${currentAlpha.toFixed(3)} → ${targetAlpha.toFixed(2)}`
        //   );
        // }
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.isAnimating = false;
        // console.log("✅ Animation complete!", {
        //   finalAlpha: currentAlpha,
        //   isHovering,
        //   overlayExists: !!this.hoverOverlay,
        // });

        // Clean up overlay when animation ends and we're not hovering
        if (!isHovering && this.hoverOverlay) {
          this.removeChild(this.hoverOverlay);
          this.hoverOverlay = null;
          //   console.log("🗑️ Removed hover overlay after hover end animation");
          // revert to baked texture
          this.refreshBakedTexture();
        }
      }
    };

    animate();
  }

  private refreshBakedTexture() {
    // Previously we removed ALL children which also nuked dynamic content (e.g. block text)
    // Now just ensure the baked sprite exists and sits at the bottom (index 0)
    if (this.bakedSprite.parent !== this) {
      this.addChildAt(this.bakedSprite, 0);
    } else {
      const currentIndex = this.getChildIndex(this.bakedSprite);
      if (currentIndex !== 0) {
        this.setChildIndex(this.bakedSprite, 0);
      }
    }
    // Leave any other children (text, overlays created later, etc.) intact
  }
}
