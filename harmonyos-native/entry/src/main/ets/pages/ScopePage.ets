import { AuthService } from '../service/AuthService';
import { ApiError } from '../service/ApiService';
import { ExperimentService, ExperimentSummary } from '../service/ExperimentService';
import { DraftRecord, DraftService } from '../service/DraftService';
import { LocalStore } from '../service/LocalStore';
import { SessionService } from '../service/SessionService';
import { common } from '@kit.AbilityKit';
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
  /** 本机草稿服务与自动保存节流状态 */
  private draftService: DraftService | null = null;
  private draftTick: number = 0;
  private lastDraftSignature: string = '';

  @State recordsOpen: boolean = false;
  @State recordBusy: boolean = false;
  @State recordMessage: string = '';
  @State recordTitle: string = '';
  @State recordNotes: string = '';
  @State records: ExperimentSummary[] = [];
  @State pendingDelete: string = '';
  @State loggedIn: boolean = false;
  /** 本机草稿：发现待恢复的现场 / 自动保存结果 / 令牌是否已过期 */
  @State draftFound: boolean = false;
  @State draftSavedAtText: string = '';
  @State draftMessage: string = '';
  @State tokenExpired: boolean = false;
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
    this.loggedIn = (AppStorage.get<string>('token') || '').length > 0;
    const expiresAtMs: number = AppStorage.get<number>('expiresAtMs') || 0;
    this.tokenExpired = expiresAtMs > 0 && expiresAtMs <= Date.now();
    this.initDrafts();
    this.startTs = Date.now();
    this.timerId = setInterval(() => {
      this.frame();
    }, 33);
  }

  aboutToDisappear(): void {
    // 退出前再存一次，覆盖 buildSetup 里归一化过的 runTimeSec
    this.autoSaveDraft();
    if (this.timerId !== -1) {
      clearInterval(this.timerId);
      this.timerId = -1;
    }
  }

  /* ------------------------------------------------------------ 本机草稿 */

  /** 草稿目录来自应用沙箱 filesDir；与服务器数据完全分离 */
  private initDrafts(): void {
    try {
      const context = this.getUIContext().getHostContext();
      if (context === undefined) {
        return;
      }
      this.draftService = new DraftService((context as common.UIAbilityContext).filesDir);
      const draft: DraftRecord | null = this.draftService.load(this.draftProfile());
      if (draft !== null) {
        this.draftFound = true;
        this.draftSavedAtText = new Date(draft.savedAtMs).toLocaleString();
      }
    } catch (_) {
      this.draftService = null;
    }
  }

  /** 账号隔离：服务器地址 + userId；游客单独一份 */
  private draftProfile(): string {
    return LocalStore.profileKey(
      AppStorage.get<string>('server') || '',
      AppStorage.get<number>('userId') || 0
    );
  }

  /** 只把会影响画面的参数纳入签名，刻意排除每帧都在变的运行时长 */
  private draftSignature(): string {
    return [this.displayMode, this.timeDivMs, this.trigEnabled, this.trigLevel, this.trigRising,
      this.ch1Enabled, this.ch1Type, this.ch1Freq, this.ch1Amp, this.ch1VoltsDiv, this.ch1Pos,
      this.ch2Enabled, this.ch2Type, this.ch2Freq, this.ch2Amp, this.ch2VoltsDiv, this.ch2Pos,
      this.phaseDeg].join('|');
  }

  private autoSaveDraft(): void {
    if (this.draftService === null || this.draftService === undefined) {
      return;
    }
    const signature: string = this.draftSignature();
    if (signature === this.lastDraftSignature) {
      return;
    }
    const ok: boolean = this.draftService.save(this.draftProfile(), this.buildSetup());
    if (ok) {
      this.lastDraftSignature = signature;
      this.draftMessage = '已在本机自动保存草稿 ' + new Date().toLocaleTimeString();
    }
  }

  private applyDraft(): void {
    if (this.draftService === null || this.draftService === undefined) {
      return;
    }
    const draft: DraftRecord | null = this.draftService.load(this.draftProfile());
    this.draftFound = false;
    if (draft === null) {
      this.draftMessage = '草稿已损坏，未恢复（坏文件已隔离）';
      return;
    }
    const setup = draft.setup;
    this.displayMode = setup.displayMode; this.timeDivMs = setup.timeDiv * 1000;
    this.trigEnabled = setup.triggerEnabled; this.trigLevel = setup.triggerLevel;
    this.trigRising = setup.triggerRising;
    this.ch1Enabled = setup.ch1.enabled; this.ch1Type = setup.ch1.waveType;
    this.ch1Freq = setup.ch1.frequency; this.ch1Amp = setup.ch1.amplitude;
    this.ch1VoltsDiv = setup.ch1.voltsDiv; this.ch1Pos = setup.ch1.offsetDiv;
    this.ch2Enabled = setup.ch2.enabled; this.ch2Type = setup.ch2.waveType;
    this.ch2Freq = setup.ch2.frequency; this.ch2Amp = setup.ch2.amplitude;
    this.ch2VoltsDiv = setup.ch2.voltsDiv; this.ch2Pos = setup.ch2.offsetDiv;
    this.phaseDeg = setup.ch2.phaseDeg;
    this.lastDraftSignature = this.draftSignature();
    this.resetRun(); this.frame();
    this.draftMessage = '已恢复本机草稿（' + this.draftSavedAtText + '）';
  }

  private discardDraft(): void {
    if (this.draftService !== null && this.draftService !== undefined) {
      this.draftService.clear(this.draftProfile());
    }
    this.draftFound = false;
    this.lastDraftSignature = '';
    this.draftMessage = '已删除本机草稿';
  }

  private frame(): void {
    this.renderer.draw(this.buildSetup());
    // 约每 5 秒（33ms × 150）检查一次参数变化并落盘
    this.draftTick++;
    if (this.draftTick >= 150) {
      this.draftTick = 0;
      this.autoSaveDraft();
    }
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

  private async exitToLogin(): Promise<void> {
    if (this.recordBusy) return;
    this.recordBusy = true;
    try {
      await AuthService.logout();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        this.recordMessage = (error as Error).message;
        this.recordsOpen = true; this.recordBusy = false; return;
      }
    }
    // 先按当前账号存一次草稿，再清空身份，避免草稿落到游客分区
    this.autoSaveDraft();
    try { await SessionService.clear(); } catch (_) {}
    AppStorage.setOrCreate('token', '');
    AppStorage.setOrCreate('userId', 0);
    AppStorage.setOrCreate('expiresAtMs', 0);
    AppStorage.setOrCreate('displayName', '访客');
    this.records = [];
    this.recordBusy = false;
    router.back();
  }

  onBackPress(): boolean {
    this.exitToLogin();
    return true;
  }

  private async loadRecords(): Promise<void> {
    if (this.recordBusy || !this.loggedIn) return;
    this.recordBusy = true;
    try {
      this.records = await ExperimentService.list();
      this.recordMessage = this.records.length === 0 ? '暂无记录，保存当前参数开始第一次实验' : '已刷新实验记录';
    } catch (error) { this.recordMessage = (error as Error).message; }
    finally { this.recordBusy = false; }
  }
  private async saveRecord(): Promise<void> {
    if (this.recordBusy || !this.loggedIn) return;
    this.recordBusy = true;
    try {
      const title: string = this.recordTitle.trim() || ('原生实验 ' + new Date().toLocaleString());
      await ExperimentService.save(title, this.recordNotes, this.buildSetup());
      this.recordMessage = '保存成功';
      this.recordTitle = ''; this.recordNotes = '';
      try { this.records = await ExperimentService.list(); }
      catch (_) { this.recordMessage = '已保存，但列表刷新失败，请点击刷新记录'; }
    } catch (error) { this.recordMessage = (error as Error).message; }
    finally { this.recordBusy = false; }
  }
  private async restoreRecord(item: ExperimentSummary): Promise<void> {
    if (this.recordBusy) return;
    this.recordBusy = true;
    try {
      const setup: ScopeSetup = await ExperimentService.restore(item.id);
      this.displayMode = setup.displayMode; this.timeDivMs = setup.timeDiv * 1000;
      this.trigEnabled = setup.triggerEnabled; this.trigLevel = setup.triggerLevel; this.trigRising = setup.triggerRising;
      this.ch1Enabled = setup.ch1.enabled; this.ch1Type = setup.ch1.waveType; this.ch1Freq = setup.ch1.frequency;
      this.ch1Amp = setup.ch1.amplitude; this.ch1VoltsDiv = setup.ch1.voltsDiv; this.ch1Pos = setup.ch1.offsetDiv;
      this.ch2Enabled = setup.ch2.enabled; this.ch2Type = setup.ch2.waveType; this.ch2Freq = setup.ch2.frequency;
      this.ch2Amp = setup.ch2.amplitude; this.ch2VoltsDiv = setup.ch2.voltsDiv; this.ch2Pos = setup.ch2.offsetDiv;
      this.phaseDeg = setup.ch2.phaseDeg; this.recordTitle = item.title; this.recordNotes = item.notes;
      this.resetRun(); this.frame(); this.recordMessage = '已恢复：' + item.title;
    } catch (error) { this.recordMessage = (error as Error).message; }
    finally { this.recordBusy = false; }
  }
  private async deleteRecord(id: string): Promise<void> {
    if (this.recordBusy) return;
    this.recordBusy = true;
    try {
      await ExperimentService.remove(id);
      this.records = this.records.filter((item: ExperimentSummary) => item.id !== id);
      this.pendingDelete = ''; this.recordMessage = '已删除记录';
    } catch (error) { this.recordMessage = (error as Error).message; }
    finally { this.recordBusy = false; }
  }

  /** 草稿恢复提示条：仅在确实存在待恢复草稿时占位 */
  @Builder
  draftBar() {
    if (this.draftFound) {
      Row({ space: 8 }) {
        Column({ space: 2 }) {
          Text('发现上次未保存的调参现场').fontColor('#e8f4ec').fontSize(12)
          Text(this.draftSavedAtText).fontColor(Palette.PANEL_TEXT).fontSize(10)
        }.layoutWeight(1).alignItems(HorizontalAlign.Start)
        Button('恢复').height(32).fontSize(12)
          .onClick(() => { this.applyDraft(); })
        Button('删除').height(32).fontSize(12)
          .backgroundColor(Color.Transparent).fontColor(Palette.PANEL_TEXT)
          .border({ width: 1, color: '#25323d' })
          .onClick(() => { this.discardDraft(); })
      }
      .width('100%')
      .padding({ left: 12, right: 12, top: 8, bottom: 8 })
      .backgroundColor('#12222c')
    }
  }

  @Builder
  recordsPanel() {
    Column({ space: 8 }) {
      Button(this.recordsOpen ? '收起我的实验' : '我的实验')
        .width('100%').onClick(() => {
          this.recordsOpen = !this.recordsOpen;
          if (this.recordsOpen) this.loadRecords();
        })
      if (this.recordsOpen) {
        if (this.loggedIn) {
          TextInput({ text: this.recordTitle, placeholder: '实验标题（可选）' })
            .maxLength(80).enabled(!this.recordBusy)
            .onChange((value: string) => { this.recordTitle = value; })
          TextArea({ text: this.recordNotes, placeholder: '实验备注（可选）' })
            .maxLength(2000).height(70).enabled(!this.recordBusy)
            .onChange((value: string) => { this.recordNotes = value; })
          Row({ space: 8 }) {
            Button('保存当前实验').enabled(!this.recordBusy).onClick(() => { this.saveRecord(); })
            Button('刷新记录').enabled(!this.recordBusy).onClick(() => { this.loadRecords(); })
          }
          Text(this.recordBusy ? '正在处理…' : this.recordMessage).fontColor('#d5e6dc').fontSize(12)
          if (this.tokenExpired) {
            Text('登录已过期：本机草稿仍可离线使用，保存到云端前需重新登录。')
              .fontColor('#ffb74d').fontSize(11).width('100%')
          }
          if (this.draftMessage.length > 0) {
            Text(this.draftMessage).fontColor(Palette.PANEL_TEXT).fontSize(11).width('100%')
          }
          ForEach(this.records, (item: ExperimentSummary) => {
            Column({ space: 6 }) {
              Text(item.title + (item.stateVersion === 2 ? ' · 原生' : ' · 网页'))
                .fontColor('#ffffff').width('100%')
              Text(item.createdAt).fontColor(Palette.PANEL_TEXT).fontSize(10).width('100%')
              if (item.notes.length > 0) { Text(item.notes).fontColor(Palette.PANEL_TEXT).fontSize(12).width('100%') }
              Row({ space: 8 }) {
                Button('恢复参数').enabled(!this.recordBusy && item.stateVersion === 2)
                  .onClick(() => { this.restoreRecord(item); })
                Button(this.pendingDelete === item.id ? '确认删除' : '删除').enabled(!this.recordBusy)
                  .onClick(() => {
                    if (this.pendingDelete === item.id) this.deleteRecord(item.id);
                    else this.pendingDelete = item.id;
                  })
                if (this.pendingDelete === item.id) {
                  Button('取消').onClick(() => { this.pendingDelete = ''; })
                }
              }
            }.width('100%').padding(10).backgroundColor(Palette.PANEL_ITEM).borderRadius(8)
          }, (item: ExperimentSummary) => item.id)
        } else {
          Text('游客不能保存实验，请退出并注册或登录账号。').fontColor(Palette.PANEL_TEXT).fontSize(12)
        }
      }
    }.width('100%').padding({ bottom: 12 })
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
      this.draftBar()

      Canvas(this.canvasCtx)
        .width('100%')
        .aspectRatio(Layout.ASPECT)
        .backgroundColor('#020604')
        .onReady(() => {
          this.frame();
        })

      Scroll() {
        Column() {
          this.recordsPanel()
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
