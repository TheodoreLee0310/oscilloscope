import { AnimatorResult } from '@kit.ArkUI';
import { Palette } from '../common/ScopeConstants';

/** Floating geometry shared visually with the browser Material background. */
@Component
export struct MaterialBackdrop {
  @Prop workspace: boolean = false;
  @Prop @Watch('syncMotion') active: boolean = false;
  @State private ringProgress: number = 0;
  @State private cornerProgress: number = 0;
  @State private capsuleProgress: number = 0;
  @State private tileProgress: number = 0;
  private attached: boolean = false;
  private animators: AnimatorResult[] = [];
  @State private viewportWidth: number = 0;
  @State private viewportHeight: number = 0;
  @State private compact: boolean = true;

  aboutToAppear(): void {
    this.attached = true;
    this.animators = [
      this.makeAnimator(9000, (value: number) => { this.ringProgress = value; }),
      this.makeAnimator(11000, (value: number) => { this.cornerProgress = value; }),
      this.makeAnimator(13000, (value: number) => { this.capsuleProgress = value; }),
      this.makeAnimator(10000, (value: number) => { this.tileProgress = value; })
    ];
    this.syncMotion();
  }

  private makeAnimator(duration: number, update: (value: number) => void): AnimatorResult {
    const motion: AnimatorResult = this.getUIContext().createAnimator({
      duration: duration,
      easing: 'ease-in-out',
      delay: 0,
      fill: 'forwards',
      direction: 'alternate',
      iterations: -1,
      begin: 0,
      end: 1
    });
    motion.onFrame = (value: number) => {
      if (this.attached) {
        update(value);
      }
    };
    return motion;
  }

  private syncMotion(): void {
    if (!this.attached) {
      return;
    }
    for (const motion of this.animators) {
      if (this.active) {
        motion.play();
      } else {
        motion.pause();
      }
    }
  }

  aboutToDisappear(): void {
    this.attached = false;
    for (const motion of this.animators) {
      motion.onFrame = (_value: number) => {};
      motion.cancel();
    }
    this.animators = [];
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Stack() {
        Circle().fill(Palette.PRIMARY_CONTAINER)
          .width(this.compact ? 144 : 224).height(this.compact ? 144 : 224)
        Circle().fill(Palette.SURFACE)
          .width(this.compact ? 96 : 152).height(this.compact ? 96 : 152)
      }
      .width(this.compact ? 144 : 224)
      .height(this.compact ? 144 : 224)
      .translate({
        x: (-12 + 32 * this.ringProgress) * (this.compact ? 0.6 : 1),
        y: (10 - 28 * this.ringProgress) * (this.compact ? 0.6 : 1)
      })
      .rotate({ angle: -4 + 12 * this.ringProgress })
      .position({
        x: this.compact ? -48 : (this.workspace ? this.viewportWidth * 0.48 : Math.min(120, this.viewportWidth * 0.06)),
        y: this.compact ? -34 : (this.workspace ? -112 : this.viewportHeight * 0.16)
      })

      Column() {}
        .width(this.compact ? 96 : 168)
        .height(this.compact ? 96 : 168)
        .backgroundColor(Palette.DECOR_YELLOW)
        .borderRadius({
          topLeft: this.compact ? 48 : 84,
          topRight: this.compact ? 48 : 84,
          bottomLeft: this.compact ? 48 : 84,
          bottomRight: this.compact ? 10 : 16
        })
        .translate({
          x: (8 - 26 * this.cornerProgress) * (this.compact ? 0.6 : 1),
          y: (-8 + 26 * this.cornerProgress) * (this.compact ? 0.6 : 1)
        })
        .rotate({ angle: -16 + 10 * this.cornerProgress })
        .position({
          x: this.compact ? this.viewportWidth - 76 : this.viewportWidth - 168 - Math.min(140, this.viewportWidth * 0.07),
          y: this.compact ? 18 : (this.workspace ? 76 : this.viewportHeight * 0.1)
        })

      Rect()
        .width(this.compact ? 144 : 220)
        .height(this.compact ? 64 : 96)
        .radius(this.compact ? 32 : 48)
        .fill(Palette.DECOR_GREEN)
        .translate({
          x: (-12 + 30 * this.capsuleProgress) * (this.compact ? 0.6 : 1),
          y: (8 - 22 * this.capsuleProgress) * (this.compact ? 0.6 : 1)
        })
        .rotate({ angle: -39 + 10 * this.capsuleProgress })
        .position({
          x: this.compact ? this.viewportWidth - 104 : this.viewportWidth * (this.workspace ? 0.74 : 0.9) - 220,
          y: this.compact ? this.viewportHeight - 46 : (this.workspace ? this.viewportHeight - 48 : this.viewportHeight * 0.92 - 96)
        })

      Rect()
        .width(this.compact ? 80 : 112)
        .height(this.compact ? 80 : 112)
        .radius(this.compact ? 24 : 32)
        .fill(Palette.DECOR_CORAL)
        .translate({
          x: (10 - 24 * this.tileProgress) * (this.compact ? 0.6 : 1),
          y: (-10 + 24 * this.tileProgress) * (this.compact ? 0.6 : 1)
        })
        .rotate({ angle: 11 + 10 * this.tileProgress })
        .position({
          x: this.compact ? -16 : this.viewportWidth * (this.workspace ? 0.03 : 0.16),
          y: this.compact ? this.viewportHeight - 60 : (this.workspace ? this.viewportHeight - 72 : this.viewportHeight * 0.92 - 112)
        })
    }
    .width('100%')
    .height('100%')
    .clip(true)
    .hitTestBehavior(HitTestMode.None)
    .accessibilityLevel('no-hide-descendants')
    .onAreaChange((_oldArea: Area, newArea: Area) => {
      this.viewportWidth = Number(newArea.width);
      this.viewportHeight = Number(newArea.height);
      this.compact = this.viewportWidth <= 600;
    })
  }
}
