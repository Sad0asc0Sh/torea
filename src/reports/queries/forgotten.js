'use strict';

const PLACEHOLDER_NOTE = 'داده‌های واقعی هنوز در دسترس نیست. این داده نمونه است.';

function placeholder(dataLabel, unitLabel) {
  return {
    series: [
      {
        name: dataLabel || 'نمونه',
        data: [
          { x: 'آیتم ۱', y: 10, meta: { unit: unitLabel || '' } },
          { x: 'آیتم ۲', y: 6, meta: { unit: unitLabel || '' } },
          { x: 'آیتم ۳', y: 3, meta: { unit: unitLabel || '' } },
        ],
      },
    ],
    meta: { note: PLACEHOLDER_NOTE },
  };
}

const FORGOTTEN_HANDLERS = {
  my_forgotten_top: () => placeholder('کالاهای فراموش‌شده', 'تعداد'),
  my_critical_products_today: () => placeholder('کالاهای حیاتی', '-'),
  team_forgotten_top: () => placeholder('کالاهای تیم', 'تعداد'),
  team_forgotten_by_member: () => placeholder('فراموشی اعضا', 'تعداد'),
  rivals_forgotten_comparison: () => placeholder('مقایسه فراموشی', 'تعداد'),
  company_forgotten_rate: () => placeholder('نرخ فراموشی', 'تعداد'),
  company_forgotten_pareto: () => placeholder('پارتو فراموشی', 'تعداد'),
};

module.exports = { runForgottenQuery: () => placeholder('placeholder'), FORGOTTEN_HANDLERS };
