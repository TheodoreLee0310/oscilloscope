import TourGuide from './tour-guide/TourGuide.js';
import './tour-guide/styles.css';

export { TourGuide };

export async function createTourGuide(configOrUrl) {
  if (configOrUrl) return TourGuide.from(configOrUrl);
  // 直接导入 JSON，避免在 file:// 环境下通过 fetch 触发 CORS
  const defaultConfig = (await import('./tour-guide/config.json')).default;
  return new TourGuide(defaultConfig);
}

export const tourGuideManager = {
  async init(configOrUrl) {
    const guide = await createTourGuide(configOrUrl);
    return guide;
  },
  async start(configOrUrl) {
    const guide = await createTourGuide(configOrUrl);
    guide.start();
    return guide;
  }
};
