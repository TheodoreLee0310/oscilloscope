import { storage, toast, navigate } from './platform';
import { captureState, validateState } from '../../shared/experiment-state';

export async function api(path, options = {}) {
  if (!/^https?:$/.test(location.protocol)) throw new Error('请从后端网页地址登录并保存实验');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('/api' + path, {
      method: options.method || 'GET', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (storage.getItem('sbq_token') || '') },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await response.json().catch(() => ({ message: '后端未启动，请启动服务后重试' }));
    if (!response.ok) throw Object.assign(new Error(data.message || '请求失败'), { status: response.status });
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('请求超时，请刷新记录确认是否保存成功');
    if (error instanceof TypeError) throw new Error('无法连接后端，请检查服务是否已启动');
    throw error;
  } finally { clearTimeout(timer); }
}

export default {
  data() {
    return { recordsOpen: false, records: [], recordTitle: '', recordNotes: '', recordsBusy: false,
      recordsMessage: '', recordsError: false, accountVerified: false, pendingDelete: null };
  },
  methods: {
    async recordsAction(action) {
      if (this.recordsBusy) return;
      this.recordsBusy = true;
      this.recordsError = false;
      this.recordsMessage = '';
      try { await action(); }
      catch (error) {
        this.recordsError = true;
        this.recordsMessage = error.message;
        if (error.status === 401) { this.accountVerified = false; this.records = []; }
      } finally { this.recordsBusy = false; }
    },
    async refreshRecords() {
      return this.recordsAction(async () => {
        if (!/^[a-f0-9]{64}$/.test(storage.getItem('sbq_token') || '')) {
          this.recordsMessage = '游客和旧版体验账号不能保存记录，请注册或登录后使用。';
          return;
        }
        const { user } = await api('/auth/me');
        this.currentUser = user;
        storage.setJSON('sbq_user', user);
        this.accountVerified = true;
        const { items } = await api('/experiments');
        this.records = items;
        this.recordsMessage = items.length ? `已加载 ${items.length} 条实验记录` : '暂无记录，调整波形后可以保存第一次实验。';
      });
    },
    async saveExperiment() {
      if (!this.accountVerified) return;
      return this.recordsAction(async () => {
        const state = captureState(this);
        const { item } = await api('/experiments', { method: 'POST', body: {
          title: this.recordTitle.trim() || '实验 ' + new Date().toLocaleString(), notes: this.recordNotes, state
        } });
        this.records.unshift(item);
        this.recordTitle = '';
        this.recordNotes = '';
        this.recordsMessage = '实验已保存，可在重新登录后恢复。';
      });
    },
    async restoreExperiment(id) {
      return this.recordsAction(async () => {
        const { item } = await api('/experiments/' + id);
        if (item.state.version !== 1) throw new Error('这是鸿蒙原生实验，请在原生客户端恢复');
        const { parameters } = validateState(item.state);
        // Apply the mode first, then the saved settings (mode changes reset some parameters).
        this.setExpStep(parameters.expStep);
        Object.keys(parameters).forEach(key => { this[key] = parameters[key]; });
        await this.$nextTick();
        this.savedCalibrationSettings = parameters.savedCalibrationSettings;
        this.pointsHistory = [];
        this.lastCapturedFrame = null;
        if (!this.isRunning) this.toggleRunning();
        this.needsRedraw = true;
        this.recordTitle = item.title;
        this.recordNotes = item.notes;
        this.recordsMessage = '已恢复：' + item.title;
        toast(this.recordsMessage, 'success');
      });
    },
    async deleteExperiment(id) {
      return this.recordsAction(async () => {
        await api('/experiments/' + id, { method: 'DELETE' });
        this.records = this.records.filter(item => item.id !== id);
        this.pendingDelete = null;
        this.recordsMessage = '记录已删除';
      });
    },
    async logout() {
      if (this.recordsBusy) return;
      this.recordsBusy = true;
      try {
        if (/^[a-f0-9]{64}$/.test(storage.getItem('sbq_token') || '')) await api('/auth/logout', { method: 'POST' });
      } catch (error) {
        // Keep the token so the user can retry server-side revocation when offline.
        if (error.status !== 401) { toast('退出失败：' + error.message, 'error'); this.recordsBusy = false; return; }
      }
      storage.removeItem('sbq_token');
      storage.removeItem('sbq_user');
      this.currentUser = null;
      navigate('./login.html');
    }
  }
};
