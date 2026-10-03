import { MERCHANT_ONBOARDING_DEFAULTS } from '../../data/merchant.js';

export function createOnboardingState({ completed = false } = {}) {
  return completed ? { step: 5, skipped: false } : { ...MERCHANT_ONBOARDING_DEFAULTS };
}

export function isValidOnboardingState(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Number.isSafeInteger(value.step) && value.step >= 0 && value.step <= 5 &&
    typeof value.skipped === 'boolean' && (!value.skipped || value.step === 5));
}

// 只读取实际经营记录，不因打开页面、探索或提交无效派遣而完成首航。
export function getOnboardingProgress(merchant) {
  const onboarding = merchant.onboarding;
  const settledTrips = [...merchant.tasks, ...merchant.history]
    .reduce((total, task) => total + task.rounds, 0);
  const hasRealTrade = merchant.ships.some(ship =>
    (ship.phase === 'outbound' || ship.phase === 'return') && ship.trip &&
    ship.trip.quantity > 0 && ship.trip.revenue > ship.trip.cost + ship.trip.fee &&
    merchant.tasks.some(task => task.id === ship.taskId));
  return {
    step: onboarding.step,
    skipped: onboarding.skipped,
    settledTrips,
    hasRealTrade,
    canViewReport: settledTrips > 0,
    complete: onboarding.step === 5,
  };
}

export function syncOnboarding(merchant) {
  if (!isValidOnboardingState(merchant.onboarding)) return false;
  const progress = getOnboardingProgress(merchant);
  if ((progress.step === 1 || progress.step === 2) &&
      (progress.hasRealTrade || progress.settledTrips > 0)) {
    merchant.onboarding.step = 3;
    return true;
  }
  return false;
}

export function commandOnboarding(state, input) {
  const merchant = state.merchant;
  if (!isValidOnboardingState(merchant.onboarding)) return { ok: false, msg: '引导进度无效。' };
  const onboarding = merchant.onboarding;
  const action = input?.action;
  let nextStep;
  if (action === 'skip' && onboarding.step < 5) {
    nextStep = 5;
  } else if (action === 'start' && onboarding.step === 0) {
    nextStep = 1;
  } else if (action === 'opened-dispatch' && onboarding.step === 1) {
    nextStep = 2;
  } else if (action === 'viewed-report' && onboarding.step === 3 &&
      getOnboardingProgress(merchant).canViewReport) {
    nextStep = 4;
  } else if (action === 'finish' && onboarding.step === 4) {
    nextStep = 5;
  } else {
    return { ok: false, msg: '当前引导阶段无法执行此操作。' };
  }
  onboarding.step = nextStep;
  if (action === 'skip') onboarding.skipped = true;
  return { ok: true, msg: nextStep === 5 ? '引导已结束。' : '引导进度已更新。', step: nextStep };
}
