const PLANS = {
  starter:  { label:'Starter',  price:29,  maxBarbers:1,  maxApptsMonth:100, smsMonth:50,  pdfReports:false, maxTeam:1 },
  pro:      { label:'Pro',      price:59,  maxBarbers:3,  maxApptsMonth:-1,  smsMonth:200, pdfReports:true,  maxTeam:3 },
  business: { label:'Business', price:99,  maxBarbers:-1, maxApptsMonth:-1,  smsMonth:500, pdfReports:true,  maxTeam:-1 }
};
function getPlan(name) { return PLANS[name] || PLANS.starter; }
function isWithinLimit(val, limit) { return limit === -1 || val < limit; }
module.exports = { PLANS, getPlan, isWithinLimit };
