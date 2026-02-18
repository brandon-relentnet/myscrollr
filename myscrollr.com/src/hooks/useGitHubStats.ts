import { useEffect, useState } from 'react'

export interface GitHubStats {
  stars: number
  forks: number
  issues: number
}

export function useGitHubStats(repo: string) {
  const [stats, setStats] = useState<GitHubStats | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`https://api.github.com/repos/${repo}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.stargazers_count != null) {
          setStats({
            stars: data.stargazers_count as number,
            forks: data.forks_count as number,
            issues: data.open_issues_count as number,
          })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [repo])

  return stats
}
