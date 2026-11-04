import { router } from '@kit.ArkUI';
import { Palette, Layout, Limits } from '../common/ScopeConstants';
import { ScopeSetup, WaveOptions, WaveOption } from '../model/ScopeTypes';
import { ScopeRenderer, ModeNames } from '../view/ScopeRenderer';
import { ScopeSlider } from '../view/ScopeSlider';
import { WaveMath } from '../model/WaveMath';

/**
 * 示波器主界面：Canvas 绘图 + 控制面板。
 * 对应网页版 public/external.html 的示波器区域与 scripts/waveDrawer.js。
 */
@Entry
@Component
struct ScopePage {
  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private canvasCtx: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);
  private renderer: ScopeRenderer = new ScopeRenderer(this.canvasCtx);
  private timerId: number = -1;
  private startTs: number = 0;
  private frozenSec: number = 0;

  @State userName: string = '访客';
  @State running: boolean = true;
  @State displayMode: string = 'dual';
  /** 时基，单位 ms/div（50 Hz 想看四五个周期，5 ms/div 正好） */
  @State timeDivMs: number = 5;

  @State ch1Enabled: boolean = true;
  @State ch1Type: string = 'sine';
  @State ch1Freq: number = 50;
  @State ch1Amp: number = 2;
  @State ch1VoltsDiv: number = 1;
  @State ch1Pos: number = 0;

  @State ch2Enabled: boolean = true;
  @State ch2Type: string = 'sine';
  @State ch2Freq: number = 100;
  @State ch2Amp: number = 2;
  @State ch2VoltsDiv: number = 1;
  @State ch2Pos: number = 0;

  @State phaseDeg: number = 90;

  @State trigEnabled: boolean = true;
  @State trigLevel: number = 0;
  @State trigRising: boolean = true;

  aboutToAppear(): void {
    const stored: string | undefined = AppStorage.get<string>('displayName');
    if (stored !== undefined) {
      this.userName = stored;
    }
    this.startTs = Date.now();
    this.timerId = setInterval(() => {
      this.frame();
    }, 33);
  }

  aboutToDisappear(): void {
    if (this.timerId !== -1) {
      clearInterval(this.timerId);
      this.timerId = -1;
    }
  }

  private frame(): void {
    this.renderer.draw(this.buildSetup());
  }

  private buildSetup(): ScopeSetup {
    const setup: ScopeSetup = new ScopeSetup();
    setup.displayMode = this.displayMode;
    setup.timeDiv = this.timeDivMs / 1000;
    setup.triggerEnabled = this.trigEnabled;
    setup.triggerLevel = this.trigLevel;
    setup.triggerRising = this.trigRising;
    setup.runTimeSec = this.running ? (Date.now() - this.startTs) / 1000 : this.frozenSec;

    setup.ch1.enabled = this.ch1Enabled;
    setup.ch1.waveType = this.ch1Type;
    setup.ch1.frequency = this.ch1Freq;
    setup.ch1.amplitude = this.ch1Amp;
    setup.ch1.voltsDiv = this.ch1VoltsDiv;
    setup.ch1.offsetDiv = this.ch1Pos;
    setup.ch1.phaseDeg = 0;

    setup.ch2.enabled = this.ch2Enabled;
    setup.ch2.waveType = this.ch2Type;
    setup.ch2.frequency = this.ch2Freq;
    setup.ch2.amplitude = this.ch2Amp;
    setup.ch2.voltsDiv = this.ch2VoltsDiv;
    setup.ch2.offsetDiv = this.ch2Pos;
    setup.ch2.phaseDeg = this.phaseDeg;
    return setup;
  }

  private toggleRun(): void {
    if (this.running) {
      this.frozenSec = (Date.now() - this.startTs) / 1000;
      this.running = false;
    } else {
      this.startTs = Date.now() - this.frozenSec * 1000;
      this.running = true;
    }
  }

  private resetRun(): void {
    this.startTs = Date.now();
    this.frozenSec = 0;
    this.running = true;
  }

  private exitToLogin(): void {
    router.back();
  }

  // ---------------------------------------------------------------- UI 片段

  @Builder
  sectionTitle(text: string, color: string) {
    Row() {
      Rect()
        .width(3)
        .height(12)
        .fill(color)
        .radius(2)
      Text(text)
        .fontSize(12)
        .fontWeight(FontWeight.Medium)
        .fontColor('#d5e6dc')
        .margin({ left: 6 })
      Blank()
    }
    .width('100%')
    .margin({ bottom: 6 })
  }

  @Builder
  modeRow() {
    Row() {
      ForEach(['dual', 'overlay', 'lissajous'], (mode: string) => {
        Button(ModeNames.label(mode))
          .fontSize(12)
          .height(30)
          .layoutWeight(1)
          .margin(2)
          .backgroundColor(this.displayMode === mode ? Palette.ACCENT : Palette.PANEL_ITEM)
          .fontColor(this.displayMode === mode ? '#ffffff' : Palette.PANEL_TEXT)
          .onClick(() => {
            this.displayMode = mode;
          })
      }, (mode: string) => mode)
    }
    .width('100%')
  }

  @Builder
  wavePicker(isCh1: boolean) {
    Flex({ wrap: FlexWrap.Wrap }) {
      ForEach(WaveOptions.ALL, (item: WaveOption) => {
        Button(item.label)
          .fontSize(11)
          .height(28)
          .padding({ left: 10, right: 10 })
          .margin(3)
          .backgroundColor((isCh1 ? this.ch1Type : this.ch2Type) === item.key ?
            (isCh1 ? Palette.CH1 : Palette.CH2) : Palette.PANEL_ITEM)
          .fontColor('#ffffff')
          .onClick(() => {
            if (isCh1) {
              this.ch1Type = item.key;
            } else {
              this.ch2Type = item.key;
            }
          })
      }, (item: WaveOption) => item.key)
    }
    .width('100%')
  }

  @Builder
  ch1Panel() {
    Column() {
      Row() {
        this.sectionTitle('通道 1', Palette.CH1)
        Toggle({ type: ToggleType.Switch, isOn: this.ch1Enabled })
          .selectedColor(Palette.CH1)
          .onChange((isOn: boolean) => {
            this.ch1Enabled = isOn;
          })
      }
      .width('100%')

      this.wavePicker(true)

      ScopeSlider({
        label: '频率',
        valueText: WaveMath.formatFreq(this.ch1Freq),
        minValue: 1,
        maxValue: Limits.FREQ_MAX,
        stepValue: 1,
        accent: Palette.CH1,
        sliderValue: this.ch1Freq,
        onValueChange: (value: number) => {
          this.ch1Freq = value;
        }
      })

      ScopeSlider({
        label: '峰值电压',
        valueText: WaveMath.formatVolt(this.ch1Amp),
        minValue: Limits.AMP_MIN,
        maxValue: Limits.AMP_MAX,
        stepValue: 0.1,
        accent: Palette.CH1,
        sliderValue: this.ch1Amp,
        onValueChange: (value: number) => {
          this.ch1Amp = value;
        }
      })

      ScopeSlider({
        label: '垂直灵敏度',
        valueText: this.ch1VoltsDiv.toFixed(2) + ' V/div',
        minValue: Limits.VOLTS_DIV_MIN,
        maxValue: Limits.VOLTS_DIV_MAX,
        stepValue: 0.1,
        accent: Palette.CH1,
        sliderValue: this.ch1VoltsDiv,
        onValueChange: (value: number) => {
          this.ch1VoltsDiv = value;
        }
      })

      ScopeSlider({
        label: '垂直位置',
        valueText: this.ch1Pos.toFixed(1) + ' div',
        minValue: Limits.POS_MIN,
        maxValue: Limits.POS_MAX,
        stepValue: 0.1,
        accent: Palette.CH1,
        sliderValue: this.ch1Pos,
        onValueChange: (value: number) => {
          this.ch1Pos = value;
        }
      })
    }
    .width('100%')
    .padding(10)
    .backgroundColor(Palette.PANEL)
    .borderRadius(10)
    .margin({ top: 8 })
  }

  @Builder
  ch2Panel() {
    Column() {
      Row() {
        this.sectionTitle('通道 2', Palette.CH2)
        Toggle({ type: ToggleType.Switch, isOn: this.ch2Enabled })
          .selectedColor(Palette.CH2)
          .onChange((isOn: boolean) => {
            this.ch2Enabled = isOn;
          })
      }
      .width('100%')

      this.wavePicker(false)

      ScopeSlider({
        label: '频率',
        valueText: WaveMath.formatFreq(this.ch2Freq),
        minValue: 1,
        maxValue: Limits.FREQ_MAX,
        stepValue: 1,
        accent: Palette.CH2,
        sliderValue: this.ch2Freq,
        onValueChange: (value: number) => {
          this.ch2Freq = value;
        }
      })

      ScopeSlider({
        label: '峰值电压',
        valueText: WaveMath.formatVolt(this.ch2Amp),
        minValue: Limits.AMP_MIN,
        maxValue: Limits.AMP_MAX,
        stepValue: 0.1,
        accent: Palette.CH2,
        sliderValue: this.ch2Amp,
        onValueChange: (value: number) => {
          this.ch2Amp = value;
        }
      })

      ScopeSlider({
        label: '垂直灵敏度',
        valueText: this.ch2VoltsDiv.toFixed(2) + ' V/div',
        minValue: Limits.VOLTS_DIV_MIN,
        maxValue: Limits.VOLTS_DIV_MAX,
        stepValue: 0.1,
        accent: Palette.CH2,
        sliderValue: this.ch2VoltsDiv,
        onValueChange: (value: number) => {
          this.ch2VoltsDiv = value;
        }
      })

      ScopeSlider({
        label: '垂直位置',
        valueText: this.ch2Pos.toFixed(1) + ' div',
        minValue: Limits.POS_MIN,
        maxValue: Limits.POS_MAX,
        stepValue: 0.1,
        accent: Palette.CH2,
        sliderValue: this.ch2Pos,
        onValueChange: (value: number) => {
          this.ch2Pos = value;
        }
      })

      ScopeSlider({
        label: '相位差',
        valueText: this.phaseDeg.toFixed(0) + '°',
        minValue: Limits.PHASE_MIN,
        maxValue: Limits.PHASE_MAX,
        stepValue: 5,
        accent: Palette.CH2,
        sliderValue: this.phaseDeg,
        onValueChange: (value: number) => {
          this.phaseDeg = value;
        }
      })
    }
    .width('100%')
    .padding(10)
    .backgroundColor(Palette.PANEL)
    .borderRadius(10)
    .margin({ top: 8 })
  }

  @Builder
  timebasePanel() {
    Column() {
      this.sectionTitle('水平时基', Palette.TEXT)
      ScopeSlider({
        label: '时基',
        valueText: WaveMath.formatTimeDiv(this.timeDivMs / 1000),
        minValue: 1,
        maxValue: 500,
        stepValue: 1,
        accent: Palette.TEXT,
        sliderValue: this.timeDivMs,
        onValueChange: (value: number) => {
          this.timeDivMs = value;
        }
      })
    }
    .width('100%')
    .padding(10)
    .backgroundColor(Palette.PANEL)
    .borderRadius(10)
    .margin({ top: 8 })
  }

  @Builder
  triggerPanel() {
    Column() {
      Row() {
        this.sectionTitle('触发', Palette.TRIGGER)
        Toggle({ type: ToggleType.Switch, isOn: this.trigEnabled })
          .selectedColor(Palette.TRIGGER)
          .onChange((isOn: boolean) => {
            this.trigEnabled = isOn;
          })
      }
      .width('100%')

      ScopeSlider({
        label: '触发电平',
        valueText: WaveMath.formatVolt(this.trigLevel),
        minValue: Limits.TRIGGER_MIN,
        maxValue: Limits.TRIGGER_MAX,
        stepValue: 0.1,
        accent: Palette.TRIGGER,
        sliderValue: this.trigLevel,
        onValueChange: (value: number) => {
          this.trigLevel = value;
        }
      })

      Row() {
        Button(this.trigRising ? '上升沿 ↑' : '下降沿 ↓')
          .fontSize(12)
          .height(30)
          .layoutWeight(1)
          .margin({ right: 6 })
          .backgroundColor(Palette.PANEL_ITEM)
          .fontColor(Palette.TRIGGER)
          .onClick(() => {
            this.trigRising = !this.trigRising;
          })
        Button('触发电平归零')
          .fontSize(12)
          .height(30)
          .layoutWeight(1)
          .backgroundColor(Palette.PANEL_ITEM)
          .fontColor(Palette.PANEL_TEXT)
          .onClick(() => {
            this.trigLevel = 0;
          })
      }
      .width('100%')
      .margin({ top: 4 })

      Text(this.trigEnabled ? '触发已锁定：波形稳定，调电平可左右移动波形' : '自由扫描：波形随时间滚动')
        .fontSize(10)
        .fontColor(Palette.TEXT_DIM)
        .width('100%')
        .margin({ top: 6 })
    }
    .width('100%')
    .padding(10)
    .backgroundColor(Palette.PANEL)
    .borderRadius(10)
    .margin({ top: 8 })
  }

  @Builder
  topBar() {
    Row() {
      Column() {
        Text('示波器模拟器')
          .fontSize(16)
          .fontWeight(FontWeight.Bold)
          .fontColor('#e8f4ec')
        Text(this.userName + ' · ' + ModeNames.label(this.displayMode))
          .fontSize(10)
          .fontColor(Palette.TEXT_DIM)
          .margin({ top: 1 })
      }
      .alignItems(HorizontalAlign.Start)

      Blank()

      Button(this.running ? '暂停' : '继续')
        .fontSize(12)
        .height(30)
        .backgroundColor(this.running ? '#1f3a2c' : Palette.ACCENT)
        .fontColor('#ffffff')
        .onClick(() => {
          this.toggleRun();
        })
      Button('复位')
        .fontSize(12)
        .height(30)
        .margin({ left: 6 })
        .backgroundColor(Palette.PANEL_ITEM)
        .fontColor('#ffffff')
        .onClick(() => {
          this.resetRun();
        })
      Button('退出')
        .fontSize(12)
        .height(30)
        .margin({ left: 6 })
        .backgroundColor('#33202a')
        .fontColor('#ff8a8a')
        .onClick(() => {
          this.exitToLogin();
        })
    }
    .width('100%')
    .padding({ left: 12, right: 12, top: 8, bottom: 8 })
  }

  build() {
    Column() {
      this.topBar()

      Canvas(this.canvasCtx)
        .width('100%')
        .aspectRatio(Layout.ASPECT)
        .backgroundColor('#020604')
        .onReady(() => {
          this.frame();
        })

      Scroll() {
        Column() {
          this.modeRow()
          this.ch1Panel()
          this.ch2Panel()
          this.timebasePanel()
          this.triggerPanel()
          Blank().height(16)
        }
        .width('100%')
        .padding({ left: 10, right: 10, top: 8 })
      }
      .scrollBar(BarState.Auto)
      .layoutWeight(1)
      .align(Alignment.Top)
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#080f14')
  }
}
