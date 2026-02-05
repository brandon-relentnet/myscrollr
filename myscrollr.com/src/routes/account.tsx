import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useLogto, type IdTokenClaims } from '@logto/react'
import { useEffect, useState } from 'react'
import { 
  BarChart3, 
  TrendingUp, 
  ShieldCheck, 
  ArrowRight, 
  Settings, 
  Globe,
  Lock
} from 'lucide-react'

export const Route = createFileRoute('/account')({
  component: AccountHub,
})

function AccountHub() {
  const { isAuthenticated, isLoading, getIdTokenClaims } = useLogto()
  const [userClaims, setUserClaims] = useState<IdTokenClaims>()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated) {
      getIdTokenClaims().then(setUserClaims)
    } else if (!isLoading && !isAuthenticated) {
      // Redirect if not logged in
      navigate({ to: '/' })
    }
  }, [isAuthenticated, isLoading, getIdTokenClaims, navigate])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
      </div>
    )
  }

  if (!isAuthenticated) return null

  return (
    <main className="min-h-screen pt-20">
      {/* Personalized Hero */}
      <section className="relative pt-24 pb-16 overflow-hidden border-b border-base-300 bg-base-200/30">
        <div className="container relative z-10">
          <div className="max-w-4xl">
            <div className="flex items-center gap-3 mb-6">
               <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-bold rounded-md border border-primary/20 uppercase tracking-[0.2em] flex items-center gap-2">
                  <ShieldCheck size={14} /> session_active
               </span>
               <span className="h-px w-12 bg-base-300" />
               <span className="text-[10px] font-mono text-base-content/30 uppercase">Protocol: OAuth2.0</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-black tracking-tight uppercase mb-8 leading-none">
              Welcome back,<br />
              <span className="text-primary">{userClaims?.name || userClaims?.username || 'User'}</span>
            </h1>
            
            <p className="text-xl text-base-content/60 leading-relaxed mb-10 max-w-2xl">
              Your personal data streams are ready for orchestration. Sync your leagues, track your assets, and stay in the flow.
            </p>
          </div>
        </div>
      </section>

      {/* Hub Grid */}
      <section className="container py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main Terminal */}
          <HubCard 
            title="Data Terminal"
            desc="Market overview & live scores"
            to="/dashboard"
            icon={<BarChart3 className="size-6" />}
            accent="primary"
          />

          {/* Public Profile */}
          <HubCard 
            title="Public Profile"
            desc="View your public presence"
            to="/u/$username"
            params={{ username: 'me' }}
            icon={<Globe className="size-6" />}
            accent="info"
          />

          {/* Account Settings */}
          <HubCard 
            title="Security Node"
            desc="Manage identity & keys"
            to="/account"
            icon={<Lock className="size-6" />}
            accent="secondary"
            disabled
          />
        </div>

        {/* Detailed Stats / Status */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-8">
           <div className="bg-base-200 border border-base-300 rounded-xl p-8 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
                 <Settings size={16} /> System Status
              </h3>
              <div className="space-y-4">
                 <StatusItem label="Identity Provider" value="Logto Cloud" status="Connected" />
                 <StatusItem label="Database Cluster" value="PostgreSQL + CDC" status="Active" />
                 <StatusItem label="Stream Broker" value="Redis" status="Polling" />
              </div>
           </div>

           <div className="bg-base-200 border border-base-300 rounded-xl p-8 shadow-sm relative overflow-hidden group">
              <div className="relative z-10">
                <h3 className="text-sm font-bold uppercase tracking-widest text-secondary mb-6 flex items-center gap-2">
                   <TrendingUp size={16} /> Quick Stats
                </h3>
                <div className="grid grid-cols-2 gap-4 text-center">
                   <div className="p-4 bg-base-300 rounded-lg">
                      <div className="text-2xl font-black text-base-content">12</div>
                      <div className="text-[10px] uppercase font-mono opacity-40">Active_Leagues</div>
                   </div>
                   <div className="p-4 bg-base-300 rounded-lg">
                      <div className="text-2xl font-black text-base-content">482</div>
                      <div className="text-[10px] uppercase font-mono opacity-40">Data_Signals</div>
                   </div>
                </div>
              </div>
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                 <BarChart3 size={120} />
              </div>
           </div>
        </div>
      </section>
    </main>
  )
}

function HubCard({ title, desc, to, params, icon, accent, disabled = false }: any) {
  const accentClasses = {
    primary: 'text-primary bg-primary/10 border-primary/20',
    secondary: 'text-secondary bg-secondary/10 border-secondary/20',
    info: 'text-info bg-info/10 border-info/20'
  }[accent as 'primary' | 'secondary' | 'info']

  const content = (
    <div className={`p-8 rounded-xl border transition-all h-full flex flex-col justify-between group relative overflow-hidden ${disabled ? 'bg-base-200/50 border-base-300/50 opacity-50 cursor-not-allowed' : 'bg-base-200 border border-base-300 hover:border-primary/30 cursor-pointer shadow-lg hover:-translate-y-1'}`}>
       {!disabled && (
         <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <ArrowRight size={20} className="text-primary" />
         </div>
       )}
       
       <div className="space-y-6">
          <div className={`h-12 w-12 rounded-lg flex items-center justify-center border ${accentClasses}`}>
             {icon}
          </div>
          <div>
             <h3 className={`text-xl font-black uppercase tracking-tight ${disabled ? 'text-base-content/40' : 'text-base-content group-hover:text-primary transition-colors'}`}>{title}</h3>
             <p className="text-xs uppercase font-mono text-base-content/40 mt-2 leading-relaxed">{desc}</p>
          </div>
       </div>
       
       {disabled && (
         <div className="mt-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-base-content/20">
            <Lock size={10} /> Encrypted
         </div>
       )}
    </div>
  )

  if (disabled) return content

  return (
    <Link to={to} params={params} className="block h-full">
       {content}
    </Link>
  )
}

function StatusItem({ label, value, status }: { label: string, value: string, status: string }) {
  return (
    <div className="flex items-center justify-between p-3 bg-base-300 rounded-lg">
       <span className="text-[10px] font-mono uppercase text-base-content/40">{label}</span>
       <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase">{value}</span>
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          <span className="text-[9px] font-black uppercase text-success tracking-tighter">{status}</span>
       </div>
    </div>
  )
}
