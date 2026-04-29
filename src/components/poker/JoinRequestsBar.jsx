import { UserPlus } from 'lucide-react';

export default function JoinRequestsBar({ requests = [], onApproveJoin }) {
  if (!requests.length) return null;

  return (
    <div className="bg-amber-600/90 text-white px-4 py-2 flex flex-wrap gap-4 items-center justify-between z-20 shadow-md flex-shrink-0">
      <div className="flex items-center gap-2 text-sm font-bold">
        <UserPlus size={16} /> 申请加入：
      </div>
      <div className="flex gap-4">
        {requests.map((req) => (
          <div key={req.uid} className="flex items-center gap-2 bg-slate-900/40 px-3 py-1 rounded-full text-sm">
            <span>{req.name}</span>
            <button onClick={() => onApproveJoin(req.uid, req.name, true)} className="text-emerald-300 hover:text-emerald-100 font-bold ml-2">同意</button>
            <button onClick={() => onApproveJoin(req.uid, req.name, false)} className="text-rose-300 hover:text-rose-100 font-bold ml-2">拒绝</button>
          </div>
        ))}
      </div>
    </div>
  );
}
