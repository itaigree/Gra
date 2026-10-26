// Local stand-ins for the hebcal.com JSON endpoints the app calls, built on the same libraries that
// hebcal.com uses (@hebcal/core + @hebcal/rest-api).
import { HebrewCalendar, HDate } from '@hebcal/core';
import { eventsToClassicApi } from '@hebcal/rest-api';

// https://www.hebcal.com/hebcal?...&year=Y&month=M&i=on|off  (maj, min, mod, nx on; minor fasts, special shabbatot off)
export function hebcalJson(params) {
  const year = Number(params.get('year'));
  const month = Number(params.get('month'));
  const il = params.get('i') === 'on';
  const events = HebrewCalendar.calendar({ year, month, isHebrewYear: false, il, noMinorFast: true, noSpecialShabbat: true });
  return eventsToClassicApi(events, { il, year, month }, false);
}

// https://www.hebcal.com/converter?cfg=json&date=YYYY-MM-DD&g2h=1  or  ...&hy=&hm=&hd=&h2g=1
export function converterJson(params) {
  let hd;
  if (params.get('g2h')) {
    const [y, m, d] = params.get('date').split('-').map(Number);
    hd = new HDate(new Date(y, m - 1, d));
  } else {
    const day = Number(params.get('hd')), year = Number(params.get('hy'));
    const days = HDate.daysInMonth(HDate.monthFromName(params.get('hm')), year);
    // like hebcal.com (HTTP 400), rather than rolling over into the next month
    if (day > days) return { error: `Hebrew day ${day} out of valid range 1-${days} for ${params.get('hm')} ${year}` };
    hd = new HDate(day, params.get('hm'), year);
  }
  const g = hd.greg();
  return {
    gy: g.getFullYear(), gm: g.getMonth() + 1, gd: g.getDate(), afterSunset: false,
    hy: hd.getFullYear(), hm: hd.getMonthName(), hd: hd.getDate(), hebrew: hd.renderGematriya(), events: [],
  };
}
