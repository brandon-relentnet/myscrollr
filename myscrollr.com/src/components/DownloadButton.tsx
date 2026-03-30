import { Download } from 'lucide-react'

type PlatformInfo = {
  label: string
  arch: string
}

function getPlatform(): PlatformInfo {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return { label: 'macOS', arch: 'Apple Silicon' }
  if (ua.includes('win')) return { label: 'Windows', arch: 'x64' }
  return { label: 'Linux', arch: 'x64' }
}

export function DownloadButton() {
  const { label } = getPlatform()

  return (
    <a
      href="https://github.com/brandon-relentnet/myscrollr/releases/latest"
      target="_blank"
      rel="noopener noreferrer"
      className="group relative inline-flex items-center gap-3 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-content! shadow-lg transition-all duration-200 hover:brightness-110 hover:shadow-xl active:scale-[0.98]"
    >
      <Download className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5" />
      Download for {label}
    </a>
  )
}
