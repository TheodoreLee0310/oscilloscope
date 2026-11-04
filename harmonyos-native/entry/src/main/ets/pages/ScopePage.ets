import { AuthService } from '../service/AuthService';
import { ApiError } from '../service/ApiService';
import { ExperimentPage, ExperimentService, ExperimentSummary, ImportOutcome } from '../service/ExperimentService';
import { DraftRecord, DraftService, isValidDraftSetup } from '../service/DraftService';
import { LocalRecord, RecordsService, RemoveResult } from '../service/RecordsService';
import { SessionService } from '../service/SessionService';
import { common } from '@kit.AbilityKit';
import { ImportItem, TransferSummary, classifyImport, containsSensitiveField } from '../service/ExperimentTransfer';
import { ExportFiles, ExportFileInfo } from '../service/ExportFiles';
import { router } from '@kit.ArkUI';
import { Palette, Layout, Limits } from '../common/ScopeConstants';
import { ScopeSetup, WaveOptions, WaveOption } from '../model/ScopeTypes';
import { ScopeRenderer, ModeNames } from '../view/ScopeRenderer';
import { ScopeSlider } from '../view/ScopeSlider';
import { WaveMath } from '../model/WaveMath';

/** 记录分页大小（所有 import 之后才能声明，否则会触发 arkts-no-misplaced-imports） */
const RECORD_PAGE_SIZE: number = 20;

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
  /** 导出文件读写 + 待确认的导入条目（两步式导入用） */
  private exportFiles: ExportFiles | null = null;
  private pendingImportValid: ImportItem[] = [];
  private recordsService: RecordsService | null = null;

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
  /** 任务 6：搜索分页、内联编辑、导出导入 */
  @State searchQuery: string = '';
  @State recordTotal: number = 0;
  @State recordHasMore: boolean = false;
  @State editingId: string = '';
  @State editTitle: string = '';
  @State editNotes: string = '';
  @State importPath: string = '';
  @State importSummary: string = '';
  @State transferMessage: string = '';
  /** 本机离线记录（与服务器"我的实验"分开，不自动上传） */
  @State localOpen: boolean = false;
  @State localRecords: LocalRecord[] = [];
  @State localMessage: string = '';
  @State localTitle: string = '';
  @State localNotes: string = '';
  @State localEditingId: string = '';
  @State localEditTitle: string = '';
  @State localEditNotes: string = '';
  @State localPendingDelete: string = '';
  /** 游客记录迁入账号的确认提示 / 无法确认归属的旧数据提示 */
  @State guestPrompt: string = '';
  @State orphanNotice: string = '';
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

  /** 草稿目录来自应用沙箱 filesDir；与服务器数据、本机记录分开存储 */
  private initDrafts(): void {
    try {
      const context = this.getUIContext().getHostContext();
      if (context === undefined) {
        return;
      }
      const filesDir: string = (context as common.UIAbilityContext).filesDir;
      this.draftService = new DraftService(filesDir);
      this.recordsService = new RecordsService(filesDir);
      this.exportFiles = new ExportFiles(filesDir);
      const draft: DraftRecord | null = this.draftService.load(this.draftServer(), this.draftUserId());
      if (draft !== null) {
        this.draftFound = true;
        this.draftSavedAtText = new Date(draft.savedAtMs).toLocaleString();
      }
      this.loadLocalRecords();
      this.refreshGuestPrompt();
      this.refreshOrphanNotice();
    } catch (_) {
      this.draftService = null;
    }
  }

  /** 分区依据：当前服务器地址 + 登录用户 id（游客为 0，单独分区） */
  private draftServer(): string {
    return AppStorage.get<string>('server') || '';
  }

  private draftUserId(): number {
    return AppStorage.get<number>('userId') || 0;
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
    // 恢复提示还挂着时绝不能写盘：否则会用初始参数覆盖掉用户上次的现场
    if (this.draftFound) {
      return;
    }
    const signature: string = this.draftSignature();
    if (signature === this.lastDraftSignature) {
      return;
    }
    const ok: boolean = this.draftService.save(this.draftServer(), this.draftUserId(), this.buildSetup());
    if (ok) {
      this.lastDraftSignature = signature;
      this.draftMessage = '已在本机自动保存草稿 ' + new Date().toLocaleTimeString();
    }
  }

  /** 把一份参数快照应用到界面（草稿恢复与本机记录恢复共用） */
  private applySetup(setup: ScopeSetup): void {
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
  }

  private applyDraft(): void {
    if (this.draftService === null || this.draftService === undefined) {
      return;
    }
    const draft: DraftRecord | null = this.draftService.load(this.draftServer(), this.draftUserId());
    this.draftFound = false;
    if (draft === null) {
      this.draftMessage = '草稿已损坏，未恢复（坏文件已隔离）';
      return;
    }
    this.applySetup(draft.setup);
    this.draftMessage = '已恢复本机草稿（' + this.draftSavedAtText + '）';
  }

  private discardDraft(): void {
    if (this.draftService !== null && this.draftService !== undefined) {
      this.draftService.clear(this.draftServer(), this.draftUserId());
    }
    this.draftFound = false;
    // 以当前参数作为新的基线，避免刚删完就立刻把默认值又存成草稿
    this.lastDraftSignature = this.draftSignature();
    this.draftMessage = '已删除本机草稿';
  }

  /* ------------------------------------------------------------ 本机离线记录 */

  private loadLocalRecords(): void {
    if (this.recordsService === null || this.recordsService === undefined) {
      this.localRecords = [];
      return;
    }
    this.localRecords = this.recordsService.list(this.draftServer(), this.draftUserId());
    this.localMessage = this.localRecords.length === 0
      ? '本机还没有离线记录'
      : '本机共 ' + this.localRecords.length.toString() + ' 条（不会自动上传）';
  }

  /** 同步状态文案：本轮只有「仅保存在本机」，其余为同步轮预留 */
  private syncLabel(state: string): string {
    if (state === 'synced') {
      return '已同步';
    }
    if (state === 'pending') {
      return '待同步';
    }
    if (state === 'deleted') {
      return '待删除';
    }
    return '仅保存在本机';
  }

  private saveLocalRecord(): void {
    if (this.recordsService === null || this.recordsService === undefined) {
      this.localMessage = '本机存储不可用';
      return;
    }
    const setup: ScopeSetup = this.buildSetup();
    setup.runTimeSec = 0;
    const record: LocalRecord | null = this.recordsService.create(this.draftServer(), this.draftUserId(),
      this.localTitle, this.localNotes, JSON.stringify(setup));
    if (record === null) {
      this.localMessage = '保存失败：标题需为 1–80 位，备注不超过 2000 位';
      return;
    }
    this.localTitle = '';
    this.localNotes = '';
    this.loadLocalRecords();
    this.localMessage = '已保存到本机：' + record.title;
  }

  private startLocalEdit(record: LocalRecord): void {
    this.localEditingId = record.clientId;
    this.localEditTitle = record.title;
    this.localEditNotes = record.notes;
    this.localPendingDelete = '';
  }

  private cancelLocalEdit(): void {
    this.localEditingId = '';
    this.localEditTitle = '';
    this.localEditNotes = '';
  }

  private saveLocalEdit(record: LocalRecord): void {
    if (this.recordsService === null || this.recordsService === undefined) {
      return;
    }
    // 只改文案时沿用原参数快照，避免把当前画布参数误写进旧记录
    const ok: boolean = this.recordsService.update(this.draftServer(), this.draftUserId(),
      record.clientId, this.localEditTitle, this.localEditNotes, record.setupJson);
    if (!ok) {
      this.localMessage = '修改失败：标题需为 1–80 位，备注不超过 2000 位';
      return;
    }
    this.cancelLocalEdit();
    this.loadLocalRecords();
    this.localMessage = '已修改本机记录';
  }

  private deleteLocalRecord(clientId: string): void {
    if (this.recordsService === null || this.recordsService === undefined) {
      return;
    }
    const result: RemoveResult = this.recordsService.remove(this.draftServer(), this.draftUserId(), clientId);
    this.localPendingDelete = '';
    this.loadLocalRecords();
    if (!result.ok) {
      this.localMessage = result.kind === 'missing' ? '记录已不存在（可能已删除过）' : '删除失败，请重试';
      return;
    }
    this.localMessage = result.kind === 'tombstoned'
      ? '已标记删除（保留墓碑，等待同步）' : '已从本机删除';
  }

  private restoreLocalRecord(record: LocalRecord): void {
    try {
      const setup: ScopeSetup = JSON.parse(record.setupJson) as ScopeSetup;
      if (!isValidDraftSetup(setup)) {
        this.localMessage = '记录参数已损坏，未恢复';
        return;
      }
      this.applySetup(setup);
      this.localMessage = '已恢复：' + record.title;
    } catch (_) {
      this.localMessage = '记录参数已损坏，未恢复';
    }
  }

  /** 登录账号后发现游客记录：只提示，必须用户确认才迁入 */
  private refreshGuestPrompt(): void {
    if (this.recordsService === null || this.recordsService === undefined) {
      return;
    }
    if (this.draftUserId() <= 0) {
      this.guestPrompt = '';
      return;
    }
    const guest: number = this.recordsService.guestCount(this.draftServer());
    this.guestPrompt = guest > 0
      ? ('发现游客期的 ' + guest.toString() + ' 条本机记录。迁入当前账号会清空游客分区，是否继续？')
      : '';
  }

  private migrateGuestRecords(): void {
    if (this.recordsService === null || this.recordsService === undefined) {
      return;
    }
    const migrated: number = this.recordsService.migrateGuest(this.draftServer(), this.draftUserId());
    this.guestPrompt = '';
    this.loadLocalRecords();
    this.localMessage = migrated > 0
      ? ('已迁入 ' + migrated.toString() + ' 条游客记录') : '没有可迁入的记录';
  }

  /** 选择"暂不迁入"：游客记录原样保留，不做任何改动 */
  private dismissGuestPrompt(): void {
    this.guestPrompt = '';
  }

  /** 旧版字符键数据可能碰撞，无法确认归属：只提示，不自动迁入 */
  private refreshOrphanNotice(): void {
    const found: string[] = [];
    if (this.draftService !== null && this.draftService !== undefined &&
      this.draftService.hasLegacy(this.draftServer(), this.draftUserId())) {
      found.push('旧版草稿');
    }
    if (this.recordsService !== null && this.recordsService !== undefined &&
      this.recordsService.hasLegacy(this.draftServer(), this.draftUserId())) {
      found.push('旧版本机记录');
    }
    this.orphanNotice = found.length > 0
      ? ('发现 ' + found.join('、') + '：旧分区键可能与其他账号碰撞，无法确认归属，已原样保留且不会自动迁入。')
      : '';
  }

  private discardOrphan(): void {
    if (this.draftService !== null && this.draftService !== undefined) {
      this.draftService.discardLegacy(this.draftServer(), this.draftUserId());
    }
    if (this.recordsService !== null && this.recordsService !== undefined) {
      this.recordsService.discardLegacy(this.draftServer(), this.draftUserId());
    }
    this.orphanNotice = '';
    this.localMessage = '已删除旧版残留数据';
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

  /** 加载第一页（也是搜索与刷新的入口）：分页归零并替换列表 */
  private async loadRecords(): Promise<void> {
    if (this.recordBusy || !this.loggedIn) return;
    this.recordBusy = true;
    try {
      const page: ExperimentPage = await ExperimentService.listPage(this.searchQuery, RECORD_PAGE_SIZE, 0);
      this.records = page.items;
      this.recordTotal = page.total;
      this.recordHasMore = this.records.length < page.total;
      if (page.total === 0) {
        this.recordMessage = this.searchQuery.trim().length > 0
          ? '没有匹配的记录' : '暂无记录，保存当前参数开始第一次实验';
      } else {
        this.recordMessage = '已加载 ' + this.records.length.toString() + ' / ' + page.total.toString() + ' 条';
      }
    } catch (error) {
      // 失败时保留搜索词与已加载内容，方便直接重试
      this.recordMessage = (error as Error).message;
    } finally { this.recordBusy = false; }
  }

  /** 追加下一页 */
  private async loadMore(): Promise<void> {
    if (this.recordBusy || !this.loggedIn || !this.recordHasMore) return;
    this.recordBusy = true;
    try {
      const page: ExperimentPage = await ExperimentService.listPage(this.searchQuery, RECORD_PAGE_SIZE, this.records.length);
      this.records = this.records.concat(page.items);
      this.recordTotal = page.total;
      this.recordHasMore = this.records.length < page.total;
      this.recordMessage = '已加载 ' + this.records.length.toString() + ' / ' + page.total.toString() + ' 条';
    } catch (error) { this.recordMessage = (error as Error).message; }
    finally { this.recordBusy = false; }
  }

  /** 清空搜索条件并回到第一页 */
  private resetSearch(): void {
    this.searchQuery = '';
    this.loadRecords();
  }

  private startEdit(item: ExperimentSummary): void {
    this.editingId = item.id;
    this.editTitle = item.title;
    this.editNotes = item.notes;
    this.pendingDelete = '';
  }

  private cancelEdit(): void {
    this.editingId = '';
    this.editTitle = '';
    this.editNotes = '';
  }

  private async saveEdit(id: string): Promise<void> {
    if (this.recordBusy) return;
    const title: string = this.editTitle.trim();
    if (title.length === 0) {
      this.recordMessage = '标题不能为空';
      return;
    }
    this.recordBusy = true;
    try {
      await ExperimentService.update(id, title, this.editNotes);
      this.cancelEdit();
      this.recordMessage = '已保存修改';
      await this.loadRecords();
    } catch (error) {
      // 失败保留编辑框内容，避免用户重填
      this.recordMessage = (error as Error).message;
    } finally { this.recordBusy = false; }
  }

  private async doExport(): Promise<void> {
    if (this.recordBusy) return;
    this.recordBusy = true;
    try {
      const text: string = await ExperimentService.exportAll();
      if (containsSensitiveField(text)) {
        throw new Error('导出内容含敏感字段，已中止');
      }
      if (this.exportFiles === null || this.exportFiles === undefined) {
        throw new Error('应用存储目录不可用');
      }
      const info: ExportFileInfo = this.exportFiles.write(text);
      this.transferMessage = '已导出 ' + info.name + '（' + Math.ceil(info.sizeBytes / 1024).toString() +
        ' KB）\n' + info.path;
    } catch (error) { this.transferMessage = (error as Error).message; }
    finally { this.recordBusy = false; }
  }

  /** 导入第一步：解析并统计，不写入 */
  private prepareImport(path: string): void {
    this.pendingImportValid = [];
    this.importSummary = '';
    const target: string = path.trim();
    if (target.length === 0) {
      this.transferMessage = '请先选择或填写导入文件路径';
      return;
    }
    try {
      if (this.exportFiles === null || this.exportFiles === undefined) {
        throw new Error('应用存储目录不可用');
      }
      const text: string = this.exportFiles.read(target);
      const summary: TransferSummary = classifyImport(text);
      this.pendingImportValid = summary.valid;
      const head: string = '有效 ' + summary.validCount.toString() + ' 条；跳过（网页 v1）' +
        summary.skippedV1.toString() + ' 条；失败 ' + summary.failed.toString() + ' 条';
      this.importSummary = head;
      this.transferMessage = summary.errors.length > 0 ? head + '\n' + summary.errors.slice(0, 5).join('\n') : head;
    } catch (error) { this.transferMessage = '读取失败：' + (error as Error).message; }
  }

  /** 导入第二步：用户确认后才真正写入 */
  private async confirmImport(): Promise<void> {
    if (this.recordBusy) return;
    if (this.pendingImportValid.length === 0) {
      this.transferMessage = '没有可导入的 v2 记录（网页 v1 不会被导入）';
      return;
    }
    this.recordBusy = true;
    try {
      const outcome: ImportOutcome = await ExperimentService.importItems(this.pendingImportValid);
      this.transferMessage = this.importSummary + '\n已写入服务器 ' + outcome.imported.toString() + ' 条' +
        (outcome.skipped > 0 ? '，服务器跳过 ' + outcome.skipped.toString() + ' 条' : '');
      this.pendingImportValid = [];
      this.importSummary = '';
      await this.loadRecords();
    } catch (error) { this.transferMessage = (error as Error).message; }
    finally { this.recordBusy = false; }
  }

  /** 填最近一次导出的文件路径 */
  private useLatestExport(): void {
    if (this.exportFiles === null || this.exportFiles === undefined) {
      this.transferMessage = '应用存储目录不可用';
      return;
    }
    const list: ExportFileInfo[] = this.exportFiles.list();
    if (list.length === 0) {
      this.transferMessage = '还没有导出过文件';
      return;
    }
    this.importPath = list[0].path;
    this.transferMessage = '已选择：' + list[0].name;
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

  /** 本机离线记录面板：与服务器"我的实验"完全分开，不自动上传 */
  @Builder
  localRecordsPanel() {
    Column({ space: 8 }) {
      Button(this.localOpen ? '收起本机记录' : '本机离线记录')
        .width('100%')
        .backgroundColor('#1d3a4a')
        .fontColor('#dff1f7')
        .onClick(() => {
          this.localOpen = !this.localOpen;
          if (this.localOpen) {
            this.loadLocalRecords();
            this.refreshGuestPrompt();
            this.refreshOrphanNotice();
          }
        })
      if (this.localOpen) {
        if (this.orphanNotice.length > 0) {
          Column({ space: 6 }) {
            Text(this.orphanNotice).fontColor('#ffb74d').fontSize(11).width('100%')
            Button('删除旧版残留').height(30).fontSize(11)
              .backgroundColor(Color.Transparent).fontColor(Palette.PANEL_TEXT)
              .border({ width: 1, color: '#25323d' })
              .onClick(() => { this.discardOrphan(); })
          }.width('100%').padding(8).backgroundColor('#211a12').borderRadius(8)
        }
        if (this.guestPrompt.length > 0) {
          Column({ space: 6 }) {
            Text(this.guestPrompt).fontColor('#ffe0a3').fontSize(11).width('100%')
            Row({ space: 8 }) {
              Button('迁入当前账号').height(30).fontSize(11)
                .onClick(() => { this.migrateGuestRecords(); })
              Button('暂不迁入').height(30).fontSize(11)
                .backgroundColor(Color.Transparent).fontColor(Palette.PANEL_TEXT)
                .border({ width: 1, color: '#25323d' })
                .onClick(() => { this.dismissGuestPrompt(); })
            }
          }.width('100%').padding(8).backgroundColor('#2a2416').borderRadius(8)
        }
        Text('这些记录只存在本机，联网也不会自动上传；同步功能在下一轮接入。')
          .fontColor(Palette.PANEL_TEXT).fontSize(10).width('100%')
        TextInput({ text: this.localTitle, placeholder: '本机记录标题（必填）' })
          .maxLength(80).width('100%')
          .onChange((value: string) => { this.localTitle = value; })
        TextArea({ text: this.localNotes, placeholder: '备注（可选）' })
          .maxLength(2000).height(56).width('100%')
          .onChange((value: string) => { this.localNotes = value; })
        Button('存为本机记录').width('100%').onClick(() => { this.saveLocalRecord(); })
        Text(this.localMessage).fontColor('#d5e6dc').fontSize(12).width('100%')
        ForEach(this.localRecords, (record: LocalRecord) => {
          Column({ space: 6 }) {
            if (this.localEditingId === record.clientId) {
              TextInput({ text: this.localEditTitle, placeholder: '标题' })
                .maxLength(80).width('100%')
                .onChange((value: string) => { this.localEditTitle = value; })
              TextArea({ text: this.localEditNotes, placeholder: '备注' })
                .maxLength(2000).height(56).width('100%')
                .onChange((value: string) => { this.localEditNotes = value; })
              Row({ space: 8 }) {
                Button('保存修改').onClick(() => { this.saveLocalEdit(record); })
                Button('取消')
                  .backgroundColor(Color.Transparent).fontColor(Palette.PANEL_TEXT)
                  .border({ width: 1, color: '#25323d' })
                  .onClick(() => { this.cancelLocalEdit(); })
              }
            } else {
              Row({ space: 6 }) {
                Text(record.title).fontColor('#ffffff').fontSize(13).layoutWeight(1)
                Text(this.syncLabel(record.syncState)).fontColor('#8fd3ff').fontSize(10)
              }.width('100%')
              Text('修订 ' + record.rev.toString() + ' · ' +
                new Date(record.updatedAtMs).toLocaleString())
                .fontColor(Palette.PANEL_TEXT).fontSize(10).width('100%')
              if (record.notes.length > 0) {
                Text(record.notes).fontColor(Palette.PANEL_TEXT).fontSize(12).width('100%')
              }
              Row({ space: 8 }) {
                Button('恢复参数').onClick(() => { this.restoreLocalRecord(record); })
                Button('编辑')
                  .backgroundColor(Color.Transparent).fontColor(Palette.PANEL_TEXT)
                  .border({ width: 1, color: '#25323d' })
                  .onClick(() => { this.startLocalEdit(record); })
                Button(this.localPendingDelete === record.clientId ? '确认删除' : '删除')
                  .onClick(() => {
                    if (this.localPendingDelete === record.clientId) {
                      this.deleteLocalRecord(record.clientId);
                    } else {
                      this.localPendingDelete = record.clientId;
                    }
                  })
                if (this.localPendingDelete === record.clientId) {
                  Button('取消')
                    .backgroundColor(Color.Transparent).fontColor(Palette.PANEL_TEXT)
                    .onClick(() => { this.localPendingDelete = ''; })
                }
              }
            }
          }.width('100%').padding(10).backgroundColor(Palette.PANEL_ITEM).borderRadius(8)
        }, (record: LocalRecord) => record.clientId)
      }
    }.width('100%').padding({ bottom: 12 })
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
          Row({ space: 8 }) {
            TextInput({ text: this.searchQuery, placeholder: '搜索标题或备注' })
              .layoutWeight(1).height(36).enabled(!this.recordBusy)
              .onChange((value: string) => { this.searchQuery = value; })
            Button('搜索').height(36).enabled(!this.recordBusy)
              .onClick(() => { this.loadRecords(); })
            Button('清空').height(36)
              .backgroundColor(Color.Transparent).fontColor(Palette.PANEL_TEXT)
              .border({ width: 1, color: '#25323d' }).enabled(!this.recordBusy)
              .onClick(() => { this.resetSearch(); })
          }.width('100%')
          Text(this.recordBusy ? '正在处理…' : this.recordMessage).fontColor('#d5e6dc').fontSize(12)
          if (this.recordTotal > 0) {
            Text('共 ' + this.recordTotal.toString() + ' 条，已加载 ' + this.records.length.toString() + ' 条')
              .fontColor(Palette.PANEL_TEXT).fontSize(10).width('100%')
          }
          if (this.tokenExpired) {
            Text('登录已过期：本机草稿仍可离线使用，保存到云端前需重新登录。')
              .fontColor('#ffb74d').fontSize(11).width('100%')
          }
          if (this.draftMessage.length > 0) {
            Text(this.draftMessage).fontColor(Palette.PANEL_TEXT).fontSize(11).width('100%')
          }
          ForEach(this.records, (item: ExperimentSummary) => {
            Column({ space: 6 }) {
              if (this.editingId === item.id) {
                TextInput({ text: this.editTitle, placeholder: '实验标题（1–80 位）' })
                  .maxLength(80).enabled(!this.recordBusy).width('100%')
                  .onChange((value: string) => { this.editTitle = value; })
                TextArea({ text: this.editNotes, placeholder: '实验备注（可选）' })
                  .maxLength(2000).height(60).enabled(!this.recordBusy).width('100%')
                  .onChange((value: string) => { this.editNotes = value; })
                Row({ space: 8 }) {
                  Button('保存修改').enabled(!this.recordBusy).onClick(() => { this.saveEdit(item.id); })
                  Button('取消').enabled(!this.recordBusy)
                    .backgroundColor(Color.Transparent).fontColor(Palette.PANEL_TEXT)
                    .border({ width: 1, color: '#25323d' })
                    .onClick(() => { this.cancelEdit(); })
                }
              } else {
                Text(item.title + (item.stateVersion === 2 ? ' · 原生' : ' · 网页'))
                  .fontColor('#ffffff').width('100%')
                Text(item.createdAt).fontColor(Palette.PANEL_TEXT).fontSize(10).width('100%')
                if (item.notes.length > 0) { Text(item.notes).fontColor(Palette.PANEL_TEXT).fontSize(12).width('100%') }
                Row({ space: 8 }) {
                  Button('恢复参数').enabled(!this.recordBusy && item.stateVersion === 2)
                    .onClick(() => { this.restoreRecord(item); })
                  Button('编辑').enabled(!this.recordBusy)
                    .backgroundColor(Color.Transparent).fontColor(Palette.PANEL_TEXT)
                    .border({ width: 1, color: '#25323d' })
                    .onClick(() => { this.startEdit(item); })
                  Button(this.pendingDelete === item.id ? '确认删除' : '删除').enabled(!this.recordBusy)
                    .onClick(() => {
                      if (this.pendingDelete === item.id) this.deleteRecord(item.id);
                      else this.pendingDelete = item.id;
                    })
                  if (this.pendingDelete === item.id) {
                    Button('取消').onClick(() => { this.pendingDelete = ''; })
                  }
                }
              }
            }.width('100%').padding(10).backgroundColor(Palette.PANEL_ITEM).borderRadius(8)
          }, (item: ExperimentSummary) => item.id)
          if (this.recordHasMore) {
            Button('加载更多').width('100%').enabled(!this.recordBusy)
              .onClick(() => { this.loadMore(); })
          }
          Divider().color('#25323d')
          Text('导出 / 导入').fontColor('#e8f4ec').fontSize(12).width('100%')
          Row({ space: 8 }) {
            Button('导出到文件').enabled(!this.recordBusy).onClick(() => { this.doExport(); })
            Button('选最近导出').enabled(!this.recordBusy).onClick(() => { this.useLatestExport(); })
          }
          TextInput({ text: this.importPath, placeholder: '导入文件路径（.json）' })
            .enabled(!this.recordBusy).width('100%')
            .onChange((value: string) => { this.importPath = value; })
          Row({ space: 8 }) {
            Button('解析').enabled(!this.recordBusy)
              .onClick(() => { this.prepareImport(this.importPath); })
            Button('确认导入').enabled(!this.recordBusy && this.pendingImportValid.length > 0)
              .onClick(() => { this.confirmImport(); })
          }
          if (this.transferMessage.length > 0) {
            Text(this.transferMessage).fontColor(Palette.PANEL_TEXT).fontSize(11).width('100%')
          }
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
          this.localRecordsPanel()
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
