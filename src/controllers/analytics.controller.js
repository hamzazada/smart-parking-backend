// backend/src/controllers/analytics.controller.js
import Booking from '../models/booking.model.js';
import Session from '../models/session.model.js';
import Vehicle from '../models/vehicle.model.js';
import User    from '../models/user.model.js';

// GET /api/v1/analytics  — admin sees system-wide, user sees own
export async function getAnalytics(req, res, next) {
  try {
    const isAdmin = req.user.role === 'admin';
    if (isAdmin) return getAdminAnalytics(req, res, next);
    return getUserAnalytics(req, res, next);
  } catch(err) { next(err); }
}

async function getUserAnalytics(req, res, next) {
  try {
    const userId = req.user._id;
    const range  = req.query.range || 'all';
    const now    = new Date();
    let dateFilter = {};
    if (range==='7d')  dateFilter = { createdAt:{ $gte:new Date(now-7*86400000) } };
    if (range==='30d') dateFilter = { createdAt:{ $gte:new Date(now-30*86400000) } };
    if (range==='90d') dateFilter = { createdAt:{ $gte:new Date(now-90*86400000) } };
    const base = { user:userId, ...dateFilter };
    const [total,active,completed,cancelled] = await Promise.all([
      Booking.countDocuments(base), Booking.countDocuments({...base,status:'Active'}),
      Booking.countDocuments({...base,status:'Completed'}), Booking.countDocuments({...base,status:'Cancelled'}),
    ]);
    const [amtAgg,durAgg,slotAgg,vehAgg] = await Promise.all([
      Booking.aggregate([{$match:{user:userId,status:'Completed',...dateFilter}},{$group:{_id:null,total:{$sum:'$amount'}}}]),
      Booking.aggregate([{$match:{user:userId,status:'Completed',end:{$exists:true},...dateFilter}},{$project:{d:{$divide:[{$subtract:['$end','$start']},60000]}}},{$group:{_id:null,avg:{$avg:'$d'}}}]),
      Booking.aggregate([{$match:{user:userId,...dateFilter}},{$group:{_id:'$slot',count:{$sum:1}}},{$sort:{count:-1}},{$limit:5}]),
      Booking.aggregate([{$match:{user:userId,...dateFilter}},{$group:{_id:'$vehiclePlate',count:{$sum:1}}},{$sort:{count:-1}},{$limit:5}]),
    ]);
    const thirtyAgo = new Date(now-30*86400000);
    const dailyAgg = await Booking.aggregate([
      {$match:{user:userId,createdAt:{$gte:thirtyAgo}}},
      {$group:{_id:{y:{$year:'$createdAt'},m:{$month:'$createdAt'},d:{$dayOfMonth:'$createdAt'}},count:{$sum:1},amount:{$sum:'$amount'}}},
      {$sort:{'_id.y':1,'_id.m':1,'_id.d':1}},
    ]);
    const dm={};
    dailyAgg.forEach(d=>{ const k=`${d._id.y}-${String(d._id.m).padStart(2,'0')}-${String(d._id.d).padStart(2,'0')}`; dm[k]={count:d.count,amount:d.amount}; });
    const dailyChart=[];
    for(let i=29;i>=0;i--){ const d=new Date(now-i*86400000); const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; dailyChart.push({date:k,label:d.toLocaleDateString('en-US',{month:'short',day:'numeric'}),count:dm[k]?.count||0,amount:dm[k]?.amount||0}); }
    const [tw,lw] = await Promise.all([
      Booking.countDocuments({user:userId,createdAt:{$gte:new Date(now-7*86400000)}}),
      Booking.countDocuments({user:userId,createdAt:{$gte:new Date(now-14*86400000),$lt:new Date(now-7*86400000)}}),
    ]);
    const totalVehicles = await Vehicle.countDocuments({user:userId});
    res.json({ success:true, data:{ role:'user', range, overview:{ totalBookings:total,activeBookings:active,completedBookings:completed,cancelledBookings:cancelled,totalAmountSpent:amtAgg[0]?.total||0,avgDurationMinutes:Math.round(durAgg[0]?.avg||0),totalVehicles,thisWeek:tw,lastWeek:lw,weeklyGrowth:lw>0?parseFloat((((tw-lw)/lw)*100).toFixed(1)):tw>0?100:0 }, topSlots:slotAgg.map(s=>({slot:s._id,count:s.count})), topVehicles:vehAgg.map(v=>({plate:v._id,count:v.count})), dailyChart } });
  } catch(err) { next(err); }
}

async function getAdminAnalytics(req, res, next) {
  try {
    const range = req.query.range || '30d';
    const now   = new Date();
    let dateFilter = {};
    if (range==='7d')  dateFilter = { createdAt:{ $gte:new Date(now-7*86400000) } };
    if (range==='30d') dateFilter = { createdAt:{ $gte:new Date(now-30*86400000) } };
    if (range==='90d') dateFilter = { createdAt:{ $gte:new Date(now-90*86400000) } };

    const [totalUsers,totalBookings,activeBookings,completedBookings,cancelledBookings] = await Promise.all([
      User.countDocuments({role:'user'}),
      Booking.countDocuments(dateFilter), Booking.countDocuments({...dateFilter,status:'Active'}),
      Booking.countDocuments({...dateFilter,status:'Completed'}), Booking.countDocuments({...dateFilter,status:'Cancelled'}),
    ]);
    const [revenueAgg,activeSessions,totalVehicles] = await Promise.all([
      Booking.aggregate([{$match:{status:'Completed',amount:{$gt:0},...dateFilter}},{$group:{_id:null,total:{$sum:'$amount'},count:{$sum:1}}}]),
      Session.countDocuments({status:'Active'}),
      Vehicle.countDocuments(dateFilter),
    ]);
    const totalRevenue = revenueAgg[0]?.total||0;

    // Daily revenue + bookings chart
    const thirtyAgo = new Date(now-30*86400000);
    const dailyAgg = await Booking.aggregate([
      {$match:{createdAt:{$gte:thirtyAgo}}},
      {$group:{_id:{y:{$year:'$createdAt'},m:{$month:'$createdAt'},d:{$dayOfMonth:'$createdAt'}},count:{$sum:1},revenue:{$sum:'$amount'}}},
      {$sort:{'_id.y':1,'_id.m':1,'_id.d':1}},
    ]);
    const dm={};
    dailyAgg.forEach(d=>{ const k=`${d._id.y}-${String(d._id.m).padStart(2,'0')}-${String(d._id.d).padStart(2,'0')}`; dm[k]={count:d.count,revenue:d.revenue}; });
    const dailyChart=[];
    for(let i=29;i>=0;i--){ const d=new Date(now-i*86400000); const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; dailyChart.push({date:k,label:d.toLocaleDateString('en-US',{month:'short',day:'numeric'}),count:dm[k]?.count||0,revenue:dm[k]?.revenue||0}); }

    // Top slots
    const [slotAgg,userAgg,hourAgg] = await Promise.all([
      Booking.aggregate([{$match:dateFilter},{$group:{_id:'$slot',count:{$sum:1},revenue:{$sum:'$amount'}}},{$sort:{count:-1}},{$limit:10}]),
      Booking.aggregate([{$match:{...dateFilter,status:'Completed'}},{$group:{_id:'$user',count:{$sum:1},spent:{$sum:'$amount'}}},{$sort:{spent:-1}},{$limit:5},{$lookup:{from:'users',localField:'_id',foreignField:'_id',as:'u'}},{$unwind:{path:'$u',preserveNullAndEmptyArrays:true}}]),
      Session.aggregate([{$match:dateFilter},{$group:{_id:{$hour:'$start'},count:{$sum:1}}},{$sort:{_id:1}}]),
    ]);
    const hourMap={};
    hourAgg.forEach(h=>{hourMap[h._id]=h.count;});
    const peakHours=Array.from({length:24},(_,i)=>({hour:i,label:i===0?'12am':i<12?`${i}am`:i===12?'12pm':`${i-12}pm`,count:hourMap[i]||0}));

    // New users over time
    const newUsersAgg = await User.aggregate([
      {$match:{role:'user',createdAt:{$gte:thirtyAgo}}},
      {$group:{_id:{y:{$year:'$createdAt'},m:{$month:'$createdAt'},d:{$dayOfMonth:'$createdAt'}},count:{$sum:1}}},
      {$sort:{'_id.y':1,'_id.m':1,'_id.d':1}},
    ]);
    const um={};
    newUsersAgg.forEach(d=>{ const k=`${d._id.y}-${String(d._id.m).padStart(2,'0')}-${String(d._id.d).padStart(2,'0')}`; um[k]=d.count; });
    const userGrowth=[];
    for(let i=29;i>=0;i--){ const d=new Date(now-i*86400000); const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; userGrowth.push({date:k,label:d.toLocaleDateString('en-US',{month:'short',day:'numeric'}),count:um[k]||0}); }

    res.json({ success:true, data:{ role:'admin', range,
      overview:{ totalUsers,totalBookings,activeBookings,completedBookings,cancelledBookings,totalRevenue,activeSessions,totalVehicles,avgRevenuePerBooking:revenueAgg[0]?.count>0?parseFloat((totalRevenue/revenueAgg[0].count).toFixed(2)):0 },
      topSlots:slotAgg.map(s=>({slot:s._id,count:s.count,revenue:s.revenue})),
      topUsers:userAgg.map(u=>({userId:u._id,name:u.u?.name||'—',email:u.u?.email||'—',bookings:u.count,spent:u.spent})),
      dailyChart, userGrowth, peakHours,
    }});
  } catch(err) { next(err); }
}

// Keep getHistory re-export for backward compat
export async function getHistory(req, res, next) { next(); }
export async function getHistoryById(req, res, next) { next(); }
