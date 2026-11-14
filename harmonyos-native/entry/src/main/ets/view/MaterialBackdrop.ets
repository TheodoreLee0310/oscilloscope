import { Palette } from '../common/ScopeConstants';

/** Static geometry shared visually with the browser Material background. */
@Component
export struct MaterialBackdrop {
  @Prop workspace: boolean = false;
  @State private viewportWidth: number = 0;
  @State private viewportHeight: number = 0;
  @State private compact: boolean = true;

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
        .rotate({ angle: -12 })
        .position({
          x: this.compact ? this.viewportWidth - 76 : this.viewportWidth - 168 - Math.min(140, this.viewportWidth * 0.07),
          y: this.compact ? 18 : (this.workspace ? 76 : this.viewportHeight * 0.1)
        })

      Rect()
        .width(this.compact ? 144 : 220)
        .height(this.compact ? 64 : 96)
        .radius(this.compact ? 32 : 48)
        .fill(Palette.DECOR_GREEN)
        .rotate({ angle: -35 })
        .position({
          x: this.compact ? this.viewportWidth - 104 : this.viewportWidth * (this.workspace ? 0.74 : 0.9) - 220,
          y: this.compact ? this.viewportHeight - 46 : (this.workspace ? this.viewportHeight - 48 : this.viewportHeight * 0.92 - 96)
        })

      Rect()
        .width(this.compact ? 80 : 112)
        .height(this.compact ? 80 : 112)
        .radius(this.compact ? 24 : 32)
        .fill(Palette.DECOR_CORAL)
        .rotate({ angle: 15 })
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
