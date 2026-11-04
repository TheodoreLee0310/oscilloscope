import { Palette } from '../common/ScopeConstants';

/**
 * 通用滑动条行：左侧标题 + 右侧当前值 + 下方滑块。
 * 对应网页版一个个 <input type="range">。
 */
@Component
export struct ScopeSlider {
  label: string = '';
  valueText: string = '';
  minValue: number = 0;
  maxValue: number = 1;
  stepValue: number = 0.1;
  accent: string = Palette.ACCENT;
  @Prop sliderValue: number = 0;
  onValueChange: (value: number) => void = (value: number) => {
  };

  build() {
    Column() {
      Row() {
        Text(this.label)
          .fontSize(12)
          .fontColor(Palette.PANEL_TEXT)
        Blank()
        Text(this.valueText)
          .fontSize(12)
          .fontColor(this.accent)
          .fontWeight(FontWeight.Medium)
      }
      .width('100%')

      Slider({
        value: this.sliderValue,
        min: this.minValue,
        max: this.maxValue,
        step: this.stepValue,
        style: SliderStyle.OutSet
      })
        .width('100%')
        .selectedColor(this.accent)
        .trackThickness(3)
        .onChange((value: number, mode: SliderChangeMode) => {
          this.onValueChange(value);
        })
    }
    .width('100%')
    .padding({ top: 2, bottom: 4 })
  }
}
