import { createFileRoute } from '@tanstack/react-router'
import { useLogto, type IdTokenClaims } from '@logto/react'
import { useEffect, useState } from 'react'
import { 
  Settings, 
  Activity, 
  Database, 
  ShieldCheck, 
  Zap, 
  Cpu,
  Plus,
  Trash2,
  ToggleRight,
  Monitor,
  Ghost,
  Link2
} from 'lucide-react'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { isAuthenticated, isLoading, signIn, getIdTokenClaims } = useLogto()
  const [activeModule, setActiveModule] = useState<'finance' | 'sports' | 'rss' | 'fantasy'>('finance')
  const [userClaims, setUserClaims] = useState<IdTokenClaims>()

  useEffect(() => {
    if (isAuthenticated) {
      getIdTokenClaims().then(setUserClaims)
    }
  }, [isAuthenticated, getIdTokenClaims])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-base-100 text-primary flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
      </div>
    )
  }

  if (!isAuthenticated) {
    const handleSignIn = () => {
      signIn(`${window.location.origin}/callback`)
    }
    return (
      <div className="min-h-screen flex items-center justify-center p-6 font-mono text-center">
        <div className="max-w-md border border-base-300 p-12 rounded-lg bg-base-200 shadow-2xl space-y-6">
          <ShieldCheck size={48} className="mx-auto text-primary opacity-20" />
          <h1 className="text-2xl font-bold tracking-[0.2em] uppercase">Security Gate</h1>
          <p className="text-base-content/60 uppercase text-xs leading-loose">Initialize identity sequence to access the command console.</p>
          <button onClick={handleSignIn} className="btn btn-primary px-12">Login</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-base-content pt-28 pb-20 px-6 font-mono">
      <div className="max-w-6xl mx-auto">
        
        {/* Console Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6 border-b border-base-300 pb-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
               <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
               <span className="text-[10px] font-bold text-primary uppercase tracking-[0.3em]">Stream_Orchestrator_v2.1</span>
            </div>
            <h1 className="text-4xl font-black uppercase tracking-tight">Command <span className="text-primary">Console</span></h1>
            <p className="text-[10px] text-base-content/40 uppercase">User: {userClaims?.name || userClaims?.email} // CID: {userClaims?.sub?.slice(0, 8)}</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
               <span className="text-[9px] font-bold text-success uppercase">Node_Status: Online</span>
               <span className="text-[9px] font-bold text-base-content/30 uppercase tracking-tighter">Latency: 24ms</span>
            </div>
            <button className="p-3 bg-base-200 border border-base-300 rounded hover:border-primary/30 transition-all text-base-content/60 hover:text-primary shadow-sm group" title="Console Settings">
              <Settings size={18} className="group-hover:rotate-90 transition-transform" />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Sidebar Navigation */}
          <aside className="lg:col-span-3 space-y-4">
            <p className="text-[9px] font-bold text-base-content/30 uppercase tracking-widest px-2">Active_Modules</p>
            <nav className="flex flex-col gap-1">
              <ModuleNavButton 
                active={activeModule === 'finance'} 
                onClick={() => setActiveModule('finance')}
                icon={<Zap size={14} />}
                label="Finance_Node"
                status="Syncing"
              />
              <ModuleNavButton 
                active={activeModule === 'sports'} 
                onClick={() => setActiveModule('sports')}
                icon={<Cpu size={14} />}
                label="Sports_Node"
                status="Idle"
              />
              <ModuleNavButton 
                active={activeModule === 'fantasy'} 
                onClick={() => setActiveModule('fantasy')}
                icon={<Ghost size={14} />}
                label="Fantasy_Node"
                status="Link_Req"
              />
              <ModuleNavButton 
                active={activeModule === 'rss'} 
                onClick={() => setActiveModule('rss')}
                icon={<Activity size={14} />}
                label="News_Feeds"
                status="Active"
              />
            </nav>

            <div className="pt-8 space-y-4">
               <p className="text-[9px] font-bold text-base-content/30 uppercase tracking-widest px-2">System_Integrity</p>
               <div className="bg-base-200/50 border border-base-300 p-4 rounded space-y-3">
                  <SystemStat label="Database" value="Connected" color="text-success" />
                  <SystemStat label="CDC_Relay" value="Listening" color="text-primary" />
                  <SystemStat label="Extension" value="No_Link" color="text-error" />
               </div>
            </div>
          </aside>

          {/* Main Configuration Area */}
          <main className="lg:col-span-9 bg-base-200/30 border border-base-300 rounded-lg p-8 shadow-2xl relative min-h-[600px]">
            <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none">
               <Monitor size={200} />
            </div>

            {activeModule === 'finance' && <FinanceConfig />}
            {activeModule === 'sports' && <SportsConfig />}
            {activeModule === 'fantasy' && <FantasyConfig />}
            {activeModule === 'rss' && <RssConfig />}
          </main>
        </div>
      </div>
    </div>
  )
}

function ModuleNavButton({ active, onClick, icon, label, status }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between p-3 rounded transition-all text-left group ${
        active 
          ? 'bg-primary/10 border border-primary/20 text-primary' 
          : 'text-base-content/40 hover:bg-base-200 border border-transparent cursor-pointer'
      }`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-xs font-bold uppercase tracking-tighter">{label}</span>
      </div>
      <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${active ? 'bg-primary text-primary-content' : 'bg-base-300 text-base-content/30'}`}>
        {status}
      </span>
    </button>
  )
}

function SystemStat({ label, value, color }: any) {
  return (
    <div className="flex items-center justify-between text-[10px]">
       <span className="text-base-content/40 uppercase">{label}:</span>
       <span className={`font-bold uppercase tracking-tighter ${color}`}>{value}</span>
    </div>
  )
}

function FinanceConfig() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
            <Database size={20} className="text-primary" />
            Asset_Pipeline
          </h2>
          <p className="text-[10px] text-base-content/40 uppercase mt-1">Configure symbols broadcasted to ticker</p>
        </div>
        <button className="btn btn-primary btn-xs gap-2">
          <Plus size={14} /> Add_Symbol
        </button>
      </div>

      <div className="grid gap-3">
        <ConfigItem symbol="BTC-USD" type="Crypto" active />
        <ConfigItem symbol="NVDA" type="Equity" active />
        <ConfigItem symbol="AAPL" type="Equity" active />
        <ConfigItem symbol="ETH-USD" type="Crypto" active={false} />
      </div>

      <div className="bg-primary/5 border border-primary/10 p-6 rounded-lg">
         <h3 className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] mb-4">Stream_Parameters</h3>
         <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
               <label className="text-[9px] uppercase font-bold text-base-content/40">Update_Frequency</label>
               <select className="bg-base-300 border border-base-300 text-xs p-2 rounded w-full outline-none focus:border-primary/50">
                  <option>Real-time (WebSocket)</option>
                  <option>10s Intervals</option>
                  <option>60s Intervals</option>
               </select>
            </div>
            <div className="space-y-2">
               <label className="text-[9px] uppercase font-bold text-base-content/40">Visual_Mode</label>
               <div className="flex gap-2">
                  <button className="flex-1 py-2 bg-primary text-primary-content text-[10px] font-bold uppercase rounded cursor-pointer">Flash_On_Tick</button>
                  <button className="flex-1 py-2 bg-base-300 text-base-content/40 text-[10px] font-bold uppercase rounded cursor-pointer">Static</button>
               </div>
            </div>
         </div>
      </div>
    </div>
  )
}

function ConfigItem({ symbol, type, active }: any) {
  return (
    <div className={`flex items-center justify-between p-4 bg-base-300/50 border rounded transition-all group ${active ? 'border-base-300' : 'border-base-300/30 opacity-50'}`}>
       <div className="flex items-center gap-4">
          <div className={`h-8 w-8 rounded flex items-center justify-center text-[10px] font-black ${active ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-base-300 text-base-content/20'}`}>
             {symbol[0]}
          </div>
          <div>
             <div className="text-sm font-bold tracking-widest">{symbol}</div>
             <div className="text-[9px] uppercase text-base-content/30">{type}</div>
          </div>
       </div>
       <div className="flex items-center gap-4">
          <button className={`p-2 rounded transition-colors cursor-pointer ${active ? 'text-primary' : 'text-base-content/20'}`}>
             <ToggleRight size={20} />
          </button>
          <button className="p-2 text-base-content/10 hover:text-error transition-colors cursor-pointer">
             <Trash2 size={16} />
          </button>
       </div>
    </div>
  )
}

function SportsConfig() {
  return (
    <div className="flex flex-col items-center justify-center h-[400px] space-y-6 text-center animate-in fade-in duration-500">
       <div className="h-16 w-16 bg-base-300 rounded-full flex items-center justify-center border border-base-300">
          <Cpu size={32} className="text-base-content/20" />
       </div>
       <div className="space-y-2">
          <h3 className="text-xl font-bold uppercase tracking-widest">Module_Offline</h3>
          <p className="text-xs text-base-content/40 max-w-xs mx-auto leading-relaxed">The Sports Orchestration node is currently in a deep-sleep state. No active subscriptions detected.</p>
       </div>
       <button className="btn btn-primary px-8 btn-sm uppercase text-[10px] tracking-widest">Initialize Node</button>
    </div>
  )
}

function FantasyConfig() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div>
        <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
          <Ghost size={20} className="text-secondary" />
          Fantasy_Orchestrator
        </h2>
        <p className="text-[10px] text-base-content/40 uppercase mt-1">Direct league data injection pipelines</p>
      </div>

      <div className="grid gap-6">
         {/* Yahoo Section */}
         <div className="bg-base-300/30 border border-base-300 p-6 rounded-lg space-y-6">
            <div className="flex items-center justify-between">
               <div className="flex items-center gap-4">
                  <div className="h-10 w-10 bg-secondary/10 text-secondary border border-secondary/20 rounded flex items-center justify-center font-black">Y!</div>
                  <div>
                     <h3 className="text-sm font-bold uppercase">Yahoo_Fantasy_API</h3>
                     <p className="text-[9px] text-base-content/30 uppercase">Provider Status: Disconnected</p>
                  </div>
               </div>
               <button className="btn btn-primary btn-xs">Establish_Link</button>
            </div>
            
            <div className="p-4 bg-base-100/50 border border-dashed border-base-300 rounded text-center">
               <p className="text-[10px] uppercase text-base-content/20">No leagues available. Complete OAuth flow above.</p>
            </div>
         </div>

         {/* Custom Manual Entry */}
         <div className="bg-base-300/30 border border-base-300 p-6 rounded-lg space-y-6 opacity-50">
            <div className="flex items-center justify-between">
               <div className="flex items-center gap-4">
                  <div className="h-10 w-10 bg-base-300 border border-base-300 rounded flex items-center justify-center text-base-content/40"><Link2 size={18} /></div>
                  <div>
                     <h3 className="text-sm font-bold uppercase">Manual_League_ID</h3>
                     <p className="text-[9px] text-base-content/30 uppercase">Direct Injection</p>
                  </div>
               </div>
               <button className="btn btn-ghost border border-base-300 btn-xs" disabled>Locked</button>
            </div>
         </div>
      </div>
    </div>
  )
}

function RssConfig() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-xl font-black uppercase tracking-tight">Feed_Aggregator</h2>
        <p className="text-[10px] text-base-content/40 uppercase mt-1">Direct XML pipe management</p>
      </div>
      <div className="bg-base-300/20 border-2 border-dashed border-base-300 p-12 rounded-lg text-center">
         <Plus size={32} className="mx-auto text-base-content/10 mb-4" />
         <button className="text-[10px] font-bold text-primary hover:underline uppercase tracking-widest cursor-pointer">Deploy New Pipe →</button>
      </div>
    </div>
  )
}
