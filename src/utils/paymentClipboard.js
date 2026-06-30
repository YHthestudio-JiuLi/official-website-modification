export async function copyText(text) {
  if (!text) return false
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 回退到 execCommand
  }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

function buildOkxLinks(order) {
  const address = order?.usdtWallet || ''
  const amount = order?.totalAmount || ''
  const network = (order?.network || 'TRC20').toUpperCase()
  const params = new URLSearchParams({
    toAddress: address,
    amount: String(amount),
    chain: network,
    token: 'USDT',
  })
  const query = params.toString()
  return {
    deepLink: `okx://wallet/transfer?${query}`,
    universalLink: `https://www.okx.com/web3?open=wallet/transfer&${query}`,
  }
}

function isMobileBrowser() {
  const ua = navigator.userAgent || ''
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
}

export function openOkxAfterCopy(order) {
  const { deepLink, universalLink } = buildOkxLinks(order)
  if (isMobileBrowser()) {
    if (/Android/i.test(navigator.userAgent || '')) {
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = deepLink
      document.body.appendChild(iframe)
      setTimeout(() => {
        document.body.removeChild(iframe)
      }, 1000)
    } else {
      window.location.href = deepLink
    }
    return
  }
  window.open(universalLink, '_blank', 'noopener,noreferrer')
}
