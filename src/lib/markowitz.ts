/**
 * Markowitz / Efficient Frontier calculations
 * Mean-variance optimization: efficient frontier = min variance for each target return
 */

export interface PortfolioPoint {
  return: number
  risk: number
  weights?: number[]
}

export function computeEfficientFrontier(
  assetReturns: number[][],
  nPoints = 50
): PortfolioPoint[] {
  const n = assetReturns.length
  if (n === 0) return []

  const minLen = Math.min(...assetReturns.map((r) => r.length))
  if (minLen < 2) return []

  const returns = assetReturns.map((r) => r.slice(-minLen))
  const meanRets = returns.map((r) => r.reduce((a, b) => a + b, 0) / r.length)
  const cov = covMatrix(returns)

  const minRet = Math.min(...meanRets)
  const maxRet = Math.max(...meanRets)
  const low = minRet
  const high = maxRet

  const frontier: PortfolioPoint[] = []
  for (let i = 0; i <= nPoints; i++) {
    const targetRet = low + (high - low) * (i / nPoints)
    const weights = optimizeWeights(meanRets, cov, targetRet)
    if (!weights) continue
    const portRet = meanRets.reduce((s, m, j) => s + m * weights[j], 0)
    const portVar = weights.reduce(
      (s, wi, i) =>
        s + weights.reduce((s2, wj, j) => s2 + wi * wj * cov[i][j], 0),
      0
    )
    const risk = Math.sqrt(Math.max(0, portVar))
    frontier.push({ return: portRet, risk, weights })
  }
  return frontier.sort((a, b) => a.risk - b.risk)
}

/** Maximum Sharpe ratio portfolio (tangency portfolio) weights */
export function maxSharpeWeights(
  meanRets: number[],
  cov: number[][],
  riskFree = 0.04
): number[] | null {
  const n = meanRets.length
  if (n === 0) return null
  const excess = meanRets.map((r) => r - riskFree)
  const covInv = invertMatrix(cov)
  if (!covInv) return null
  const w = matVec(covInv, excess)
  const sum = w.reduce((a, b) => a + b, 0)
  if (Math.abs(sum) < 1e-12) return null
  return w.map((x) => x / sum)
}

function matVec(M: number[][], v: number[]): number[] {
  return M.map((row) => row.reduce((s, m, j) => s + m * v[j], 0))
}

function invertMatrix(M: number[][]): number[][] | null {
  const n = M.length
  const aug = M.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => (i === j ? 1 : 0))])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row
    }
    ;[aug[col], aug[pivot]] = [aug[pivot], aug[col]]
    if (Math.abs(aug[col][col]) < 1e-12) return null
    const div = aug[col][col]
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= div
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const f = aug[row][col]
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= f * aug[col][j]
    }
  }
  return aug.map((row) => row.slice(n))
}

function covMatrix(returns: number[][]): number[][] {
  const n = returns.length
  const T = returns[0].length
  const cov: number[][] = Array(n)
    .fill(0)
    .map(() => Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const meanI = returns[i].reduce((a, b) => a + b, 0) / T
      const meanJ = returns[j].reduce((a, b) => a + b, 0) / T
      let s = 0
      for (let t = 0; t < T; t++) {
        s += (returns[i][t] - meanI) * (returns[j][t] - meanJ)
      }
      cov[i][j] = cov[j][i] = s / (T - 1)
    }
  }
  return cov
}

function optimizeWeights(
  meanRets: number[],
  cov: number[][],
  targetRet: number
): number[] | null {
  const n = meanRets.length
  const A: number[][] = Array(n + 2)
    .fill(0)
    .map(() => Array(n + 2).fill(0))
  const b: number[] = Array(n + 2).fill(0)

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) A[i][j] = 2 * cov[i][j]
    A[i][n] = -meanRets[i]
    A[i][n + 1] = -1
    b[i] = 0
  }
  for (let j = 0; j < n; j++) {
    A[n][j] = meanRets[j]
    A[n + 1][j] = 1
  }
  A[n][n] = 0
  A[n][n + 1] = 0
  b[n] = targetRet
  A[n + 1][n] = 0
  A[n + 1][n + 1] = 0
  b[n + 1] = 1

  const x = solve(A, b)
  if (!x) return null
  return x.slice(0, n)
}

function solve(A: number[][], b: number[]): number[] | null {
  const n = A.length
  const aug = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row
    }
    ;[aug[col], aug[pivot]] = [aug[pivot], aug[col]]
    if (Math.abs(aug[col][col]) < 1e-10) return null
    const div = aug[col][col]
    for (let j = 0; j <= n; j++) aug[col][j] /= div
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = aug[row][col]
      for (let j = 0; j <= n; j++) aug[row][j] -= factor * aug[col][j]
    }
  }
  return aug.map((row) => row[n])
}

export function portfolioSharpe(
  weights: number[],
  meanRets: number[],
  cov: number[][],
  riskFree = 0.04
): number {
  const ret = meanRets.reduce((s, m, j) => s + m * weights[j], 0)
  const var_ = weights.reduce(
    (s, wi, i) =>
      s + weights.reduce((s2, wj, j) => s2 + wi * wj * cov[i][j], 0),
    0
  )
  const vol = Math.sqrt(Math.max(0, var_))
  return vol > 0 ? (ret - riskFree) / vol : 0
}
