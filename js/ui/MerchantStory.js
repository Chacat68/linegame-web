import { getOnboardingProgress } from '../systems/merchant/MerchantOnboarding.js';
import { getExplorationStage } from '../systems/merchant/MerchantExploration.js';
import liangPortrait from '../../assets/characters/liang-jian.jpg';
import tangPortrait from '../../assets/characters/tang-he.jpg';
import wenPortrait from '../../assets/characters/wen-heng.jpg';
import cenPortrait from '../../assets/characters/cen-yao.jpg';

export const MERCHANT_OPENING_STORY = '旧航路重新开放，金穗农业星有粮，黑金矿星有矿。大船队嫌这里的订单太小，我们这艘起家轻舟却装得下。先赚回第一笔利润，再把公司的名字写进航运名单。';

const characters = Object.freeze({
  liang: { speaker: '梁简', role: '老航运调度员', portrait: liangPortrait, channel: '01' },
  tang: { speaker: '唐禾', role: '黑金矿星采购负责人', portrait: tangPortrait, channel: '02' },
  wen: { speaker: '闻衡', role: '航运集团评估代表', portrait: wenPortrait, channel: '03' },
  cen: { speaker: '岑遥', role: '工业星工程师', portrait: cenPortrait, channel: '04' },
});
const opening = '序章 · 接手公司';
const firstChapter = '第一章 · 第一张回执';
const story = (phase, chapter, character, quote) => ({ phase, chapter, ...characters[character], quote });
const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildMerchantOpeningStory() {
  return story('company-handover', opening, 'liang', MERCHANT_OPENING_STORY);
}

// 只呈现已经发生的经营成果；读档、跳过和离线结算共用原有进度。
export function buildMerchantOnboardingStory(state, progress = getOnboardingProgress(state.merchant)) {
  if ([1, 2].includes(progress.step) && !progress.hasRealTrade && !progress.canViewReport && state.merchant.ships.some(ship => ship.phase === 'waiting'
    && state.merchant.tasks.some(task => task.id === ship.taskId && !task.stopping))) {
    return story('first-wait', opening, 'liang', '调度单已经登记。先看船长为什么停靠，补货或调整货本就能续跑，不用再派一遍。');
  }
  if (progress.step === 1) return story('first-contract', opening, 'liang', '别被“订单太小”吓住。粮食和矿石都有买家，先用轻舟接下一笔。');
  if (progress.step === 2) return story('loading', opening, 'liang', '这笔货本要撑住采购和返程。船能一直跑，公司才有机会翻身。');
  if (progress.step === 3 && !progress.canViewReport) return story('first-voyage', opening, 'liang', '船还在路上。等它完整返港，我们才拿得到第一张回执。');
  if (progress.step === 3 && progress.canViewReport) {
    const receipt = progress.latestSettlement;
    return receipt?.to === 'mineral_belt' && receipt.goodId === 'food'
      ? story('first-receipt', firstChapter, 'tang', `粮食收到了。${state.companyName}，我记下了。下一趟，还等你们的船。`)
      : story('first-receipt', firstChapter, 'liang', '收货港签了字。公司有了第一张回执，那张旧货单的事，也终于有了个起点。');
  }
  if (progress.step === 4) return story('handover', progress.canViewReport ? firstChapter : opening, 'liang', progress.canViewReport
    ? '新回执已经入档。先用利润把商队做大，再去查那张旧货单为什么没人签收。'
    : '先让商路持续经营，再用实际到账的利润安排下一步。');
  return null;
}

export function buildMerchantEarlyStory(state, progress) {
  if (!progress) return null;
  const settled = getOnboardingProgress(state.merchant).canViewReport;
  const chapter = state.merchant.unlockedPorts.includes('nebula_forge') ? '第二章 · 工厂仍在运转' : settled ? firstChapter : opening;
  switch (progress.stage) {
    case 'first-route': return story(settled ? 'resume-trade' : 'first-contract', chapter, 'liang', settled
      ? '回执已经有了，接下来要让生意继续跑。空闲船重新接单，港口还在等货。'
      : '大船队没接的小生意，就是我们的起点。先把一条能赚钱的商路跑起来。');
    case 'first-wait': return story('first-wait', chapter, 'liang', '调度单已经登记。先看船长为什么停靠，补货或调整货本就能续跑，不用再派一遍。');
    case 'first-return': return story('first-voyage', chapter, 'liang', '先等轻舟带回第一张回执。预计收入要等完整返港，才会变成公司能用的钱。');
    case 'returning': return story('return-to-port', chapter, 'liang', '已经通知船长返港。这趟生意结清，船和货本才能安排到别处。');
    case 'fleet-research': return story('fleet-planning', chapter, 'liang', state.merchant.unlockedPorts.includes('nebula_forge')
      ? '另一边的港口也在等货。先规划新船位，再备好购船款和第二笔货本。'
      : '旧货单的目的地还没查清。原船继续跑商，再加一个船位，留给探索。');
    case 'second-route': return story('second-contract', chapter, 'liang', state.merchant.ships.some(ship => !ship.taskId && ship.phase === 'idle')
      ? '探索船已返港，港口也在等货。给空闲船划拨货本，就能把第二条商路排上日程。'
      : '两边都有人等货。备齐新船和货本的投入，就能把另一条商路也排上日程。');
    case 'breakthrough': return story('company-review', chapter, 'wen', '小船起家的生意，能撑起更大的公司吗？我等着看你下一份经营记录。');
    case 'exploration':
    case 'research': return story('old-callsign', chapter, 'liang', '旧班次表里还有一个失联呼号。备好勘察能力和费用，我们才能去找货单上的港口。');
    case 'growth': {
      const routes = new Set(state.merchant.tasks.filter(task => !task.stopping).map(task => `${task.from}:${task.to}:${task.goodId}`));
      if (routes.size > 1) return story('regular-service', chapter, 'liang', '两港都有了往返的船。保持周转，公司的下一次投入就有了底气。');
      return story('first-profit', chapter, 'liang', state.merchant.companyLevel === 1
        ? '第一张回执收好了。让这条商路继续赚，再用到账利润支付第一次升级。'
        : '港口开始等我们的下一班船。每次只准备眼前这一步的投入，生意就能稳稳做大。');
    }
    case 'wait': return story('wait-for-business', chapter, 'liang', '做生意也要等合适的时机。先核对供需和手头资金，别急着把最后一笔钱花掉。');
    default: return null;
  }
}

export function buildMerchantDiscoveryStory(event, state = null) {
  if (event?.portId !== 'nebula_forge') return null;
  if (event.status === 'completed') return story('factory-reconnected', '第二章 · 工厂仍在运转', 'cen', '工厂还在运转。先把粮食和矿石送进来，那些被取消的采购单，我也会替你找一找。');
  if (event.status === 'returning') return story('survey-return', firstChapter, 'liang', '信号那头的工厂还在运转。让勘察船带着航迹返港，才能把这里写进正式商路。');
  if (event.status === 'exploring' && state) return story('lost-signal', firstChapter, 'liang', getExplorationStage(event, state.merchant.lastTickAt) === 'surveying'
    ? '船已经抵达。先把现场勘察做完，核对靠港条件和航迹，再把记录带回来。'
    : '探索船正在靠近信号。抵达后还要留出时间勘察，完整返港才能开通商路。');
  return story('lost-signal', firstChapter, 'liang', event.status === 'available'
    ? '旧档案里的失联呼号，终于有了回应。留出一艘空闲船，去核验那条航迹。'
    : '勘察船已经出发。等它带着完整航迹返港，旧货单上的疑问才能继续往下查。');
}

// content 来自调用方的已转义任务模板，让对白与实际经营目标共用一张卡。
export function renderMerchantStory(communication, label = '', content = '', variant = 'compact') {
  if (!communication) return content;
  return `<div class="merchant-story-communication merchant-video-call${variant === 'opening' ? ' is-opening' : ''}" data-story-phase="${escape(communication.phase)}" role="group" aria-label="${escape(communication.speaker)}，${escape(communication.role)}的视频通讯">
    <div class="merchant-video-call-head"><div class="merchant-story-meta"><small>${escape(communication.chapter)}</small>${label ? `<span>${escape(label)}</span>` : ''}</div><span class="merchant-video-link"><i aria-hidden="true"></i>视频通讯</span></div>
    <div class="merchant-video-call-body">
      <div class="merchant-video-screen"><img class="merchant-video-portrait" src="${escape(communication.portrait)}" alt="${escape(communication.speaker)}的视频通讯形象" width="640" height="640" decoding="async" loading="${variant === 'opening' ? 'eager' : 'lazy'}"><div class="merchant-video-channel" aria-hidden="true"><span>CH.${escape(communication.channel)}</span><span class="merchant-video-signal"><i></i><i></i><i></i></span></div><div class="merchant-video-identity"><strong>${escape(communication.speaker)}</strong><span>${escape(communication.role)}</span></div></div>
      <div class="merchant-video-dialogue"><div class="merchant-video-caption"><span class="merchant-video-caption-label">${escape(communication.speaker)}说</span><p class="merchant-story-quote">${escape(communication.quote)}</p></div>${content ? `<div class="merchant-video-context">${content}</div>` : ''}</div>
    </div>
  </div>`;
}
