/**
 * USDT 链上交易校验（订单支付）
 */
const crypto = require('crypto');

const USDT_CONTRACT = 'TR7NHQJEKQXGTCI8Q8ZY4PL8OTSZGJLJ6T';
const DEFAULT_MAX_UNDERPAY_USDT = 5;
const DEFAULT_MAX_AGE_HOURS = 2;

function parseUsdtAmount(raw) {
  const text = String(raw || '').trim();
  if (!text || text.toUpperCase() === 'N/A') return null;
  const match = text.match(/[\d]+(?:\.[\d]+)?/);
  if (!match) return null;
  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) ? value : null;
}

function formatUsdtFromRawValue(raw) {
  try {
    const n = BigInt(String(raw || '0'));
    const base = 1000000n;
    const integer = n / base;
    const fraction = n % base;
    if (fraction === 0n) return `${integer.toString()} USDT`;
    const frac = fraction.toString().padStart(6, '0').replace(/0+$/, '');
    return `${integer.toString()}.${frac} USDT`;
  } catch {
    return 'N/A';
  }
}

function normalizeTronAddress(address) {
  const text = String(address || '').trim();
  if (!text || text.toUpperCase() === 'N/A') return null;
  return text;
}

function tronHexToBase58(input) {
  const raw = String(input || '').trim().toLowerCase().replace(/^0x/, '');
  if (!raw) return 'N/A';
  let hex = raw;
  if (hex.startsWith('41') && hex.length === 42) {
    // ok
  } else if (hex.length === 40) {
    hex = '41' + hex;
  } else if (hex.length > 42) {
    hex = hex.slice(-40);
    hex = '41' + hex;
  } else {
    return input;
  }
  const payload = Buffer.from(hex, 'hex');
  const hash1 = crypto.createHash('sha256').update(payload).digest();
  const hash2 = crypto.createHash('sha256').update(hash1).digest();
  const full = Buffer.concat([payload, hash2.subarray(0, 4)]);
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let x = BigInt('0x' + full.toString('hex'));
  let out = '';
  while (x > 0n) {
    const mod = Number(x % 58n);
    out = alphabet[mod] + out;
    x = x / 58n;
  }
  for (let i = 0; i < full.length && full[i] === 0; i += 1) {
    out = '1' + out;
  }
  return out || 'N/A';
}

async function queryTronUsdtTransferByTxHash(txHash) {
  const hash = String(txHash || '').trim();
  if (!hash) return null;
  try {
    const [eventsRes, txInfoRes, txRes] = await Promise.all([
      fetch(`https://api.trongrid.io/v1/transactions/${hash}/events`),
      fetch('https://api.trongrid.io/wallet/gettransactioninfobyid', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: hash }),
      }),
      fetch('https://api.trongrid.io/wallet/gettransactionbyid', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: hash }),
      }),
    ]);
    const eventsJson = await eventsRes.json();
    const txInfoJson = await txInfoRes.json();
    const txJson = await txRes.json();
    const events = Array.isArray(eventsJson?.data) ? eventsJson.data : [];
    const transfer = events.find((e) =>
      String(e?.event_name || '').toLowerCase() === 'transfer' &&
      String(e?.contract_address || '').toUpperCase() === USDT_CONTRACT
    ) || events.find((e) => String(e?.event_name || '').toLowerCase() === 'transfer');
    const contractValue = txJson?.raw_data?.contract?.[0]?.parameter?.value || {};
    const ownerAddressHex = String(contractValue?.owner_address || '').trim();
    const dataHex = String(contractValue?.data || '').trim().toLowerCase();
    let toAddressHex = '';
    let amountRaw = '';
    if (dataHex.length >= (8 + 64 * 3)) {
      const arg2 = dataHex.slice(8 + 64, 8 + 128);
      const arg3 = dataHex.slice(8 + 128, 8 + 192);
      toAddressHex = arg2.slice(-40);
      amountRaw = String(BigInt('0x' + arg3));
    }
    const fromAddress = ownerAddressHex
      ? tronHexToBase58(ownerAddressHex)
      : tronHexToBase58(String(transfer?.result?.from || transfer?.result?.['0'] || ''));
    const toAddress = toAddressHex
      ? tronHexToBase58(toAddressHex)
      : tronHexToBase58(String(transfer?.result?.to || transfer?.result?.['1'] || ''));
    const rawValue = amountRaw || String(transfer?.result?.value || transfer?.result?.['2'] || '0');
    const paidAmount = formatUsdtFromRawValue(rawValue);
    const status = String(txInfoJson?.receipt?.result || txInfoJson?.result || 'UNKNOWN');
    const blockTimestampMs = Number(
      txInfoJson?.blockTimeStamp ||
      txJson?.raw_data?.timestamp ||
      transfer?.block_timestamp ||
      0
    );
    return { status, fromAddress, toAddress, paidAmount, blockTimestampMs };
  } catch (e) {
    console.error('[USDT Verify] query tron tx error:', e.message);
    return null;
  }
}

/**
 * 校验订单支付哈希
 * @returns {Promise<{valid:boolean, deleteOrder:boolean, reason:string, paidAmount?:number, txTimestampMs?:number}>}
 */
function messageForVerifyFailure(reason, options = {}) {
  const {
    locale = 'zh',
    expectedAmountUsdt = 0,
    paidAmount = null,
    maxUnderpayUsdt = DEFAULT_MAX_UNDERPAY_USDT,
    maxAgeHours = DEFAULT_MAX_AGE_HOURS,
  } = options;
  const en = String(locale).toLowerCase().startsWith('en');
  if (reason === 'wrong_recipient_address') {
    return en
      ? 'Recipient address mismatch. The platform cannot verify this payment.'
      : '地址信息有误，平台无法核验付款信息';
  }
  if (reason === 'amount_insufficient') {
    return en
      ? `Payment amount mismatch (paid ${paidAmount ?? '?'} USDT, required ${expectedAmountUsdt} USDT). Order cannot be created.`
      : `支付金额不符：链上 ${paidAmount ?? '?'} USDT，订单 ${expectedAmountUsdt} USDT（允许少付不超过 ${maxUnderpayUsdt} USDT）。订单无法生成。`;
  }
  if (reason === 'tx_too_old') {
    return en
      ? `Transaction is older than ${maxAgeHours} hours. Order cannot be created.`
      : `交易时间超过 ${maxAgeHours} 小时，订单无法生成。`;
  }
  if (reason === 'tx_not_found') {
    return en
      ? 'Unable to verify transaction on chain. Please check the hash and try again.'
      : '链上未找到该交易，请核对哈希后重试。';
  }
  return en ? 'Payment verification failed.' : '支付校验失败。';
}

async function verifyOrderPaymentTx(options) {
  const {
    network = 'TRC20',
    txHash,
    expectedAmountUsdt,
    expectedWalletAddress = '',
    maxUnderpayUsdt = DEFAULT_MAX_UNDERPAY_USDT,
    maxAgeHours = DEFAULT_MAX_AGE_HOURS,
  } = options || {};

  const hash = String(txHash || '').trim();
  const expected = Number(expectedAmountUsdt);
  if (!hash) {
    return { valid: false, deleteOrder: false, reason: 'empty_tx_hash' };
  }
  if (!Number.isFinite(expected) || expected <= 0) {
    return { valid: false, deleteOrder: false, reason: 'invalid_order_amount' };
  }

  // 两项规则均为 0：不开启链上验单，仅校验哈希已填写
  if (maxUnderpayUsdt <= 0 && maxAgeHours <= 0) {
    return { valid: true, deleteOrder: false, reason: 'ok' };
  }

  const n = String(network || '').toUpperCase();
  if (!n.includes('TRC20') && !n.includes('TRON')) {
    return { valid: false, deleteOrder: false, reason: 'unsupported_network' };
  }

  const tx = await queryTronUsdtTransferByTxHash(hash);
  if (!tx) {
    return { valid: false, deleteOrder: false, reason: 'tx_not_found' };
  }

  const paidAmount = parseUsdtAmount(tx.paidAmount);
  if (paidAmount === null) {
    return { valid: false, deleteOrder: false, reason: 'amount_unreadable' };
  }

  const txTimestampMs = Number(tx.blockTimestampMs || 0);
  const expectedWallet = normalizeTronAddress(expectedWalletAddress);
  if (expectedWallet) {
    const actualWallet = normalizeTronAddress(tx.toAddress);
    if (!actualWallet || actualWallet !== expectedWallet) {
      return {
        valid: false,
        deleteOrder: true,
        reason: 'wrong_recipient_address',
        paidAmount,
        txTimestampMs,
      };
    }
  }

  if (maxAgeHours > 0 && txTimestampMs > 0) {
    const ageMs = Date.now() - txTimestampMs;
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    if (ageMs > maxAgeMs) {
      return {
        valid: false,
        deleteOrder: true,
        reason: 'tx_too_old',
        paidAmount,
        txTimestampMs,
      };
    }
  }

  if (maxUnderpayUsdt > 0) {
    const minAccepted = expected - maxUnderpayUsdt;
    if (paidAmount < minAccepted) {
      return {
        valid: false,
        deleteOrder: true,
        reason: 'amount_insufficient',
        paidAmount,
        txTimestampMs,
      };
    }
  }

  return {
    valid: true,
    deleteOrder: false,
    reason: 'ok',
    paidAmount,
    txTimestampMs,
  };
}

module.exports = {
  parseUsdtAmount,
  normalizeTronAddress,
  queryTronUsdtTransferByTxHash,
  verifyOrderPaymentTx,
  messageForVerifyFailure,
  DEFAULT_MAX_UNDERPAY_USDT,
  DEFAULT_MAX_AGE_HOURS,
};
