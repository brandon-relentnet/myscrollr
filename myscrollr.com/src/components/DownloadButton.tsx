import { Download } from 'lucide-react'

function getOS(): 'macOS' | 'Windows' | 'Linux' {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'macOS'
  if (ua.includes('win')) return 'Windows'
  return 'Linux'
}

export function DownloadButton() {
  const os = getOS()

  return (
    <a
      href="https://github.com/brandon-relentnet/myscrollr/releases/latest"
      target="_blank"
      rel="noopener noreferrer"
      className="group relative inline-flex items-center gap-3 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-content! shadow-lg transition-all duration-200 hover:brightness-110 hover:shadow-xl active:scale-[0.98]"
    >
      <Download className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5" />
      Download for {os}
    </a>
  )
}
